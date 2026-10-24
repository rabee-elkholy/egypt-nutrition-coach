// Cloudflare Workers entry for the public deployment & KMM API Gateway.
// - Strips any client-supplied `oai-authenticated-user-id` to prevent identity spoofing.
// - Preserves `Authorization: Bearer <jwt>` for mobile KMM clients so `server/worker.mjs`
//   verifies JWTs directly via `server/auth.mjs`.
// - Provides an HttpOnly `coach_uid` anonymous session cookie fallback for the Web MVP.
import app from './worker.mjs';

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

    const hasBearer = /^Bearer\s+\S+/i.test(headers.get('Authorization') || '');
    const existing = readAnonCookie(request);
    if (existing) {
      headers.set('x-anonymous-cookie-uid', 'anon:' + existing);
    }

    if (hasBearer) {
      return await app.fetch(new Request(request, { headers }), env, ctx);
    }

    const uid = existing || crypto.randomUUID();
    headers.set('oai-authenticated-user-id', 'anon:' + uid);

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
