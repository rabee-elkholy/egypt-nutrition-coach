// Shared WebCrypto & Outbound HTTP Utilities for External Providers
// Centralizes PEM parsing, ES256 JWT signing (Apple OIDC/StoreKit/APNs),
// cached RS256 Google Service Account OAuth2 tokens (FCM & Google Play),
// and bounded-timeout outbound fetch for Cloudflare Workers production safety.

import { base64UrlEncodeBytes } from './auth.mjs';

const GOOGLE_TOKEN_CACHE = new Map();
const GOOGLE_TOKEN_TTL_BUFFER_MS = 5 * 60 * 1000;
export const DEFAULT_EXTERNAL_FETCH_TIMEOUT_MS = 8000;

export function fetchWithTimeout(url, init = {}, timeoutMs = DEFAULT_EXTERNAL_FETCH_TIMEOUT_MS) {
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
  return fetch(url, signal && !init.signal ? { ...init, signal } : init);
}

export function pemToDer(pem) {
  const clean = String(pem || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function signEs256Jwt({ header, payload, privateKeyPem }) {
  const enc = new TextEncoder();
  const h = base64UrlEncodeBytes(enc.encode(JSON.stringify({ alg: 'ES256', ...header })));
  const p = base64UrlEncodeBytes(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

export async function getGoogleServiceAccountToken(serviceAccountJson, scope, timeoutMs = DEFAULT_EXTERNAL_FETCH_TIMEOUT_MS) {
  const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error('Invalid Google service account credentials.');
  }
  const cacheKey = `${sa.client_email}:${scope}`;
  const cached = GOOGLE_TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + GOOGLE_TOKEN_TTL_BUFFER_MS) {
    return { accessToken: cached.accessToken, projectId: sa.project_id || null };
  }
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = base64UrlEncodeBytes(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = base64UrlEncodeBytes(enc.encode(JSON.stringify({
    iss: sa.client_email,
    scope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600
  })));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claim}`));
  const assertion = `${header}.${claim}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
  const res = await fetchWithTimeout(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
  }, timeoutMs);
  if (!res.ok) throw new Error(`Google OAuth token exchange failed (${res.status})`);
  const data = await res.json();
  const expiresInMs = Math.max(60, Number(data?.expires_in || 3600)) * 1000;
  GOOGLE_TOKEN_CACHE.set(cacheKey, { accessToken: data.access_token, expiresAt: Date.now() + expiresInMs });
  return { accessToken: data.access_token, projectId: sa.project_id || null };
}
