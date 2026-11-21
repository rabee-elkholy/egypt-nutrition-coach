// First-party Google & Apple Social OAuth OIDC verification on Cloudflare Workers + D1
// Issues first-party CuraFit HS256 JWT + rotating D1 refresh tokens (no Supabase/Auth0/Firebase Auth).

import { base64UrlEncodeBytes } from './auth.mjs';
import { issueTokenPair } from './native-auth.mjs';
import { createApiError, logEvent } from './logger.mjs';
import { SUPPORTED_LOCALES, validTimeZone } from '../coaching-shared.mjs';

const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';
const OAUTH_JWKS_CACHE = new Map();

function b64UrlToBytes(str) {
  const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJwtParts(token, provider) {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3) {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }
  try {
    const dec = new TextDecoder('utf-8', { fatal: true });
    return {
      header: JSON.parse(dec.decode(b64UrlToBytes(parts[0]))),
      payload: JSON.parse(dec.decode(b64UrlToBytes(parts[1]))),
      sigBytes: b64UrlToBytes(parts[2]),
      signingInput: `${parts[0]}.${parts[1]}`
    };
  } catch {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }
}

async function fetchJwks(provider, env) {
  const envKey = provider === 'google' ? 'OAUTH_GOOGLE_JWKS_JSON' : 'OAUTH_APPLE_JWKS_JSON';
  if (env?.[envKey]) {
    return typeof env[envKey] === 'string' ? JSON.parse(env[envKey]) : env[envKey];
  }
  const uri = provider === 'google' ? (env?.OAUTH_GOOGLE_JWKS_URI || GOOGLE_JWKS_URI) : (env?.OAUTH_APPLE_JWKS_URI || APPLE_JWKS_URI);
  const cached = OAUTH_JWKS_CACHE.get(uri);
  if (cached && cached.expiresAt > Date.now()) return cached.jwks;
  let res;
  try {
    res = await fetch(uri);
  } catch {
    throw createApiError('Unable to fetch JWKS verification keys.', 503, { code: 'AUTH_JWKS_UNAVAILABLE', retryable: true });
  }
  if (!res.ok) {
    throw createApiError('Unable to fetch JWKS verification keys.', 503, { code: 'AUTH_JWKS_UNAVAILABLE', retryable: true });
  }
  const jwks = await res.json();
  OAUTH_JWKS_CACHE.set(uri, { jwks, expiresAt: Date.now() + 300_000 });
  return jwks;
}

async function verifyOidcToken(provider, rawToken, env, nowMs = Date.now()) {
  const { header, payload, sigBytes, signingInput } = decodeJwtParts(rawToken, provider);
  if (header.alg !== 'RS256' && header.alg !== 'ES256') {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }

  const jwks = await fetchJwks(provider, env);
  const jwk = header.kid ? (jwks?.keys || []).find(k => k.kid === header.kid) : (jwks?.keys || [])[0];
  if (!jwk) {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }

  const importAlg = header.alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : { name: 'ECDSA', namedCurve: 'P-256' };
  const verifyAlg = header.alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5' }
    : { name: 'ECDSA', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('jwk', jwk, importAlg, false, ['verify']);
  const valid = await crypto.subtle.verify(verifyAlg, key, sigBytes, new TextEncoder().encode(signingInput));
  if (!valid) {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (typeof payload.exp !== 'number' || nowSec > payload.exp + 60) {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }

  const validIssuers = provider === 'google'
    ? ['https://accounts.google.com', 'accounts.google.com']
    : ['https://appleid.apple.com'];
  if (!validIssuers.includes(payload.iss)) {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }

  const expectedAudRaw = provider === 'google'
    ? (env?.GOOGLE_OAUTH_CLIENT_IDS || env?.OAUTH_GOOGLE_CLIENT_IDS)
    : (env?.APPLE_CLIENT_ID || env?.OAUTH_APPLE_CLIENT_IDS);
  if (expectedAudRaw) {
    const allowed = String(expectedAudRaw).split(',').map(x => x.trim()).filter(Boolean);
    const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!tokenAud.some(a => allowed.includes(a))) {
      throw createApiError('Identity provider token is invalid or expired.', 401, {
        code: 'AUTH_OAUTH_TOKEN_INVALID',
        params: { provider }
      });
    }
  }

  if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 200) {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }

  const email = typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim().toLowerCase() : null;
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  return {
    subject: payload.sub.trim(),
    email,
    emailVerified,
    name: typeof payload.name === 'string' ? payload.name.trim().slice(0, 100) : null,
    picture: typeof payload.picture === 'string' ? payload.picture.trim().slice(0, 500) : null
  };
}

async function encryptSecret(plaintext, secretKeyMaterial) {
  if (!plaintext || !secretKeyMaterial) return null;
  const enc = new TextEncoder();
  const keyHash = await crypto.subtle.digest('SHA-256', enc.encode(secretKeyMaterial));
  const key = await crypto.subtle.importKey('raw', keyHash, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return `${base64UrlEncodeBytes(iv)}.${base64UrlEncodeBytes(new Uint8Array(cipher))}`;
}

async function decryptSecret(packed, secretKeyMaterial) {
  if (!packed || !secretKeyMaterial) return null;
  const [ivB64, ctB64] = String(packed).split('.');
  if (!ivB64 || !ctB64) return null;
  const enc = new TextEncoder();
  const keyHash = await crypto.subtle.digest('SHA-256', enc.encode(secretKeyMaterial));
  const key = await crypto.subtle.importKey('raw', keyHash, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64UrlToBytes(ivB64) }, key, b64UrlToBytes(ctB64));
  return new TextDecoder().decode(plain);
}

export async function authenticateSocialOAuth(db, env, provider, body, request) {
  if (!['google', 'apple'].includes(provider)) {
    throw createApiError('Unsupported OAuth provider.', 400, { code: 'VALIDATION_ERROR' });
  }
  const rawToken = provider === 'google' ? body?.idToken : body?.identityToken;
  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    throw createApiError('Identity provider token is invalid or expired.', 401, {
      code: 'AUTH_OAUTH_TOKEN_INVALID',
      params: { provider }
    });
  }

  const claims = await verifyOidcToken(provider, rawToken, env);
  const deviceId = String(body?.deviceId || request?.headers?.get('X-Client-Device-Id') || 'mobile-device').trim().slice(0, 120);
  const fullName = (typeof body?.fullName === 'string' && body.fullName.trim()) ? body.fullName.trim().slice(0, 100) : claims.name;
  const nowIso = new Date().toISOString();

  // 1. Lookup existing OAuth identity
  const existingLink = await db.prepare(
    'SELECT user_id, email FROM coaching_oauth_identities WHERE provider=? AND subject=?'
  ).bind(provider, claims.subject).first();

  let userRow = null;
  let isNewUser = false;

  if (existingLink) {
    userRow = await db.prepare(
      'SELECT user_id, email, display_name, avatar_url, entitlement, created_at FROM coaching_users WHERE user_id=?'
    ).bind(existingLink.user_id).first();
  }

  // 2. If not linked yet, check email collision / prevent silent takeover of existing accounts
  if (!userRow && claims.email) {
    const byEmail = await db.prepare(
      'SELECT user_id, email, password_hash, display_name, avatar_url, entitlement, created_at FROM coaching_users WHERE email=?'
    ).bind(claims.email).first();
    if (byEmail) {
      const otherOauth = await db.prepare(
        'SELECT provider FROM coaching_oauth_identities WHERE user_id=? AND provider!=? LIMIT 1'
      ).bind(byEmail.user_id, provider).first();
      const hasPassword = byEmail.password_hash && byEmail.password_hash !== 'oauth_only';
      if (!claims.emailVerified || (hasPassword && body?.linkExisting !== true) || (otherOauth && body?.linkExisting !== true)) {
        throw createApiError('An account with this email is already linked to another sign-in method.', 409, {
          code: 'AUTH_PROVIDER_EMAIL_CONFLICT',
          params: { existingProvider: otherOauth?.provider || 'email' }
        });
      }
      userRow = byEmail;
    }
  }

  // 3. Encrypt optional Apple authorization code / refresh token for Guideline 5.1.1(v)
  const appleTokenEnc = provider === 'apple' && typeof body?.authorizationCode === 'string' && body.authorizationCode.trim()
    ? await encryptSecret(body.authorizationCode.trim(), env?.OAUTH_TOKEN_ENC_KEY || env?.AUTH_JWT_SECRET)
    : null;

  const stmts = [];
  if (!userRow) {
    isNewUser = true;
    const userId = `user:${crypto.randomUUID()}`;
    const syntheticEmail = claims.email || `${provider}_${claims.subject.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '')}@privaterelay.curafit.invalid`;
    userRow = {
      user_id: userId,
      email: syntheticEmail,
      display_name: fullName || null,
      avatar_url: claims.picture || null,
      entitlement: 'free',
      created_at: nowIso
    };
    stmts.push(
      db.prepare(
        'INSERT INTO coaching_users(user_id,email,password_hash,display_name,avatar_url,entitlement,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
      ).bind(userId, syntheticEmail, 'oauth_only', userRow.display_name, userRow.avatar_url, 'free', nowIso, nowIso)
    );
  } else if (fullName && !userRow.display_name) {
    userRow.display_name = fullName;
    stmts.push(db.prepare('UPDATE coaching_users SET display_name=?, updated_at=? WHERE user_id=?').bind(fullName, nowIso, userRow.user_id));
  }

  stmts.push(
    db.prepare(
      'INSERT OR REPLACE INTO coaching_oauth_identities(provider,subject,user_id,email,apple_refresh_token_enc,created_at) VALUES(?,?,?,?,?,?)'
    ).bind(provider, claims.subject, userRow.user_id, claims.email || userRow.email, appleTokenEnc, nowIso)
  );

  const sessionId = `sess_${crypto.randomUUID()}`;
  const issued = await issueTokenPair({ db, env, user: userRow, sessionId, deviceId, existingSession: false });
  stmts.push(...issued.stmts);
  await db.batch(stmts);

  const locale = body?.locale && SUPPORTED_LOCALES.has(body.locale) ? body.locale : null;
  const timezone = body?.timezone && validTimeZone(body.timezone) ? body.timezone : null;

  return {
    status: isNewUser ? 201 : 200,
    data: {
      ...issued.payload,
      isNewUser,
      provider,
      ...(locale ? { locale } : {}),
      ...(timezone ? { timezone } : {})
    }
  };
}

export async function revokeAppleTokenOnDelete(db, env, userId) {
  try {
    const row = await db.prepare(
      "SELECT apple_refresh_token_enc FROM coaching_oauth_identities WHERE user_id=? AND provider='apple' AND apple_refresh_token_enc IS NOT NULL LIMIT 1"
    ).bind(userId).first();
    if (!row?.apple_refresh_token_enc) return { attempted: false, revoked: false };
    if (!env?.APPLE_CLIENT_ID || !env?.APPLE_CLIENT_SECRET) {
      return { attempted: false, revoked: false, reason: 'apple_credentials_not_configured' };
    }
    const token = await decryptSecret(row.apple_refresh_token_enc, env?.OAUTH_TOKEN_ENC_KEY || env?.AUTH_JWT_SECRET);
    if (!token) return { attempted: false, revoked: false };
    const form = new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID,
      client_secret: env.APPLE_CLIENT_SECRET,
      token,
      token_type_hint: 'refresh_token'
    });
    const res = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    return { attempted: true, revoked: res.ok, status: res.status };
  } catch (err) {
    logEvent('warn', 'apple_revoke_failed', { userId, details: { message: err?.message } });
    return { attempted: true, revoked: false };
  }
}
