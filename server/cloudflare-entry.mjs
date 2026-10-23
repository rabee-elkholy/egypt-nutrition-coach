// Cloudflare Workers entry for the public test deployment.
// The core Worker (server/worker.mjs) expects the hosting platform to inject
// `oai-authenticated-user-id`. Cloudflare has no such platform identity, so this
// wrapper gives every browser its own anonymous account via an HttpOnly cookie.
// Client-supplied identity headers are always stripped to prevent spoofing.
import app from './worker.mjs';

const COOKIE = 'coach_uid';
const ONE_YEAR = 60 * 60 * 24 * 365;
const UID_RE = /^[0-9a-f-]{36}$/;

function readUid(request) {
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

    const existing = readUid(request);
    const uid = existing || crypto.randomUUID();
    const headers = new Headers(request.headers);
    headers.delete('oai-authenticated-user-id');
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
