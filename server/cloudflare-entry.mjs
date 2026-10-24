// Cloudflare Workers entry for the public deployment & KMM API Gateway.
// - Strips any client-supplied `oai-authenticated-user-id` to prevent identity spoofing.
// - Preserves `Authorization: Bearer <jwt>` for mobile KMM clients so `server/worker.mjs`
//   verifies JWTs directly via `server/auth.mjs`.
// - Provides an HttpOnly `coach_uid` anonymous session cookie fallback for the Web MVP.
import app from './worker.mjs';
import {formatErrorBody} from './logger.mjs';
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');

// New account IDs cannot be used as session credentials. Keep pre-0.12 accounts addressable.
async function anonymousIdentity(uid,env,checkLegacy){
 const opaque='anon:'+await hash(uid);
 if(!checkLegacy||!env.DB)return opaque;
 const legacy='anon:'+uid,simulation='__simulation__:'+await hash(legacy);
 const row=await env.DB.prepare('SELECT user_id FROM coaching_accounts WHERE user_id IN (?,?) LIMIT 1').bind(legacy,simulation).first();
 if(row)return legacy;
 try{
  const closed=await env.DB.prepare("SELECT session_id FROM coaching_auth_sessions WHERE user_id=? AND session_id IN ('__deleted__','__claimed__') LIMIT 1").bind(legacy).first();
  if(closed)return legacy;
 }catch(error){if(!/no such table/i.test(error.message||''))throw error;}
 return opaque;
}

const COOKIE = 'coach_uid';
const ONE_YEAR = 60 * 60 * 24 * 365;
const UID_RE = /^[0-9a-f-]{36}$/;

export function readAnonCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) {
      const value = rest.join('=');
      return UID_RE.test(value) ? value : null;
    }
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/')) return app.fetch(request, env, ctx);

    const headers = new Headers(request.headers);
    // Always strip client-supplied platform identity header on the public edge
    headers.delete('oai-authenticated-user-id');
    headers.delete('x-anonymous-cookie-uid');

    if(url.pathname==='/v1/health'||url.pathname==='/v1/capabilities'||request.method==='OPTIONS')return app.fetch(new Request(request,{headers}),env,ctx);
    const hasBearer = /^Bearer\s+\S+/i.test(headers.get('Authorization') || '');
    const existing = readAnonCookie(request);
    let existingIdentity=null;
    if(existing){
      try{existingIdentity=await anonymousIdentity(existing,env,true);}
      catch{return Response.json(formatErrorBody('تعذر التحقق من الجلسة.',503),{status:503,headers:{'Cache-Control':'no-store'}});}
      headers.set('x-anonymous-cookie-uid',existingIdentity);
    }

    if (hasBearer) {
      return await app.fetch(new Request(request, { headers }), env, ctx);
    }

    const uid = existing || crypto.randomUUID();
    headers.set('oai-authenticated-user-id',existingIdentity||await anonymousIdentity(uid,env,false));

    const response = await app.fetch(new Request(request, { headers }), env, ctx);
    if (existing) return response;

    const out = new Response(response.body, response);
    out.headers.append(
      'Set-Cookie',
      `${COOKIE}=${uid}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`
    );
    return out;
  }
};
