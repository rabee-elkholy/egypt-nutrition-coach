// Cloudflare Workers entry for the public deployment & KMM API Gateway.
// - Strips any client-supplied `oai-authenticated-user-id` to prevent identity spoofing.
// - Preserves `Authorization: Bearer <jwt>` for mobile KMM clients so `server/worker.mjs`
//   verifies JWTs directly via `server/auth.mjs`.
// - Exposes public auth/OAuth/webhook/preview/signed-media paths cleanly and exports Cron `scheduled()`.
import app from './worker.mjs';
import {formatErrorBody} from './logger.mjs';
import {runScheduledNotifications} from './push.mjs';

const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');

async function anonymousIdentity(uid,env,checkLegacy){
 const opaque='anon:'+await hash(uid);
 if(!checkLegacy||!env.DB)return opaque;
 const legacy='anon:'+uid;
 const row=await env.DB.prepare('SELECT user_id FROM coaching_accounts WHERE user_id=? LIMIT 1').bind(legacy).first();
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

const PUBLIC_PATHS = new Set([
  '/v1/health',
  '/v1/capabilities',
  '/v1/plans/preview',
  '/v1/auth/register',
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/auth/oauth/google',
  '/v1/auth/oauth/apple',
  '/v1/webhooks/apple',
  '/v1/webhooks/google-play'
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/')) return app.fetch(request, env, ctx);

    const headers = new Headers(request.headers);
    headers.delete('oai-authenticated-user-id');
    headers.delete('x-anonymous-cookie-uid');

    if (PUBLIC_PATHS.has(url.pathname) || url.pathname.startsWith('/v1/media/signed/') || request.method === 'OPTIONS') {
      return app.fetch(new Request(request, { headers }), env, ctx);
    }

    const hasBearer = /^Bearer\s+\S+/i.test(headers.get('Authorization') || '');
    const existing = readAnonCookie(request);
    let existingIdentity = null;
    if (existing) {
      try { existingIdentity = await anonymousIdentity(existing, env, true); }
      catch { return Response.json(formatErrorBody('Unable to verify session state; retry shortly.', 503, null, { code: 'AUTH_SESSION_CHECK_UNAVAILABLE', retryable: true }), { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
      headers.set('x-anonymous-cookie-uid', existingIdentity);
    }

    if (hasBearer) {
      return await app.fetch(new Request(request, { headers }), env, ctx);
    }

    const uid = existing || crypto.randomUUID();
    headers.set('oai-authenticated-user-id', existingIdentity || await anonymousIdentity(uid, env, false));

    const response = await app.fetch(new Request(request, { headers }), env, ctx);
    if (existing) return response;

    const out = new Response(response.body, response);
    const secureAttr = url.protocol === 'https:' ? '; Secure' : '';
    out.headers.append(
      'Set-Cookie',
      `${COOKIE}=${uid}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly${secureAttr}; SameSite=Lax`
    );
    return out;
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledNotifications(env, event?.scheduledTime || Date.now()));
  }
};
