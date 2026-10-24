// Pluggable Authentication, JWT Verifier, Session Revocation, Rate Limiting & Privacy Guardrails
// Supports:
// 1. Bearer JWT verification (HMAC-SHA256 / RSASSA-PKCS1-v1_5 / ECDSA P-256 via WebCrypto SubtleCrypto)
// 2. Pluggable Identity Provider config (Firebase Auth / Supabase Auth / Custom OIDC) via env vars
// 3. Trusted platform header (`oai-authenticated-user-id`) when injected by trusted gateway or local test harness
// 4. Explicit anonymous session cookie (`coach_uid`) via `server/cloudflare-entry.mjs` for Web MVP trial

import { createApiError } from './logger.mjs';

const CLOCK_SKEW_SECONDS = 60;
const JWKS_CACHE = new Map();

function base64UrlDecodeBytes(str) {
  const base64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson(str) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlDecodeBytes(str)));
  } catch {
    throw createApiError('رمز الدخول غير صالح (Malformed JWT).', 401, { code: 'AUTH_TOKEN_MALFORMED' });
  }
}

export function base64UrlEncodeBytes(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signHs256Jwt(payload, secret, headerExtra = {}) {
  const header = { alg: 'HS256', typ: 'JWT', ...headerExtra };
  const enc = new TextEncoder();
  const h64 = base64UrlEncodeBytes(enc.encode(JSON.stringify(header)));
  const p64 = base64UrlEncodeBytes(enc.encode(JSON.stringify(payload)));
  const data = `${h64}.${p64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${base64UrlEncodeBytes(sig)}`;
}

async function verifySignature(alg, rawHeaderPayload, signatureBytes, env, kid) {
  const enc = new TextEncoder();
  const data = enc.encode(rawHeaderPayload);

  if (alg === 'HS256') {
    const secret = env?.AUTH_JWT_SECRET;
    if (!secret) {
      throw createApiError('موفّر الهوية غير مفعّل لمفاتيح HS256.', 401, { code: 'AUTH_PROVIDER_NOT_CONFIGURED' });
    }
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify('HMAC', key, signatureBytes, data);
  }

  if (alg === 'RS256' || alg === 'ES256') {
    let jwks = null;
    if (env?.AUTH_JWKS_JSON) {
      jwks = typeof env.AUTH_JWKS_JSON === 'string' ? JSON.parse(env.AUTH_JWKS_JSON) : env.AUTH_JWKS_JSON;
    } else if (env?.AUTH_JWKS_URI) {
      const cached = JWKS_CACHE.get(env.AUTH_JWKS_URI);
      if (cached && cached.expiresAt > Date.now()) {
        jwks = cached.jwks;
      } else {
        const res = await fetch(env.AUTH_JWKS_URI);
        if (!res.ok) throw createApiError('تعذر جلب مفاتيح التوثيق (JWKS).', 503, { code: 'AUTH_JWKS_UNAVAILABLE', retryable: true });
        jwks = await res.json();
        JWKS_CACHE.set(env.AUTH_JWKS_URI, { jwks, expiresAt: Date.now() + 300_000 });
      }
    }
    if (!jwks || !Array.isArray(jwks.keys)) {
      throw createApiError('موفّر الهوية (JWKS) غير مهيأ على الخادم.', 401, { code: 'AUTH_PROVIDER_NOT_CONFIGURED' });
    }
    const jwk = kid ? jwks.keys.find(k => k.kid === kid) : jwks.keys[0];
    if (!jwk) {
      throw createApiError('مفتاح التوقيع غير معروف (Unknown kid).', 401, { code: 'AUTH_KEY_ROTATED_OR_UNKNOWN' });
    }
    const importAlg = alg === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
    const verifyAlg = alg === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5' }
      : { name: 'ECDSA', hash: 'SHA-256' };
    const cryptoKey = await crypto.subtle.importKey('jwk', jwk, importAlg, false, ['verify']);
    return await crypto.subtle.verify(verifyAlg, cryptoKey, signatureBytes, data);
  }

  throw createApiError('خوارزمية توقيع الرمز غير مدعومة.', 401, { code: 'AUTH_UNSUPPORTED_ALG' });
}

export async function verifyBearerToken(token, env, nowMs = Date.now()) {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3) {
    throw createApiError('صيغة رمز الدخول غير صالحة.', 401, { code: 'AUTH_TOKEN_MALFORMED' });
  }
  const [h64, p64, s64] = parts;
  const header = base64UrlDecodeJson(h64);
  const payload = base64UrlDecodeJson(p64);
  const sigBytes = base64UrlDecodeBytes(s64);

  if (!header || typeof header.alg !== 'string' || header.alg === 'none') {
    throw createApiError('خوارزمية التوقيع مرفوضة.', 401, { code: 'AUTH_UNSUPPORTED_ALG' });
  }

  const validSig = await verifySignature(header.alg, `${h64}.${p64}`, sigBytes, env, header.kid);
  if (!validSig) {
    throw createApiError('توقيع رمز الدخول غير صالح.', 401, { code: 'AUTH_INVALID_SIGNATURE' });
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    throw createApiError('رمز الدخول يفتقد تاريخ الانتهاء (exp).', 401, { code: 'AUTH_TOKEN_MISSING_EXP' });
  }
  if (nowSec > payload.exp + CLOCK_SKEW_SECONDS) {
    throw createApiError('انتهت صلاحية جلسة الدخول؛ يرجى تجديد الرمز.', 401, { code: 'AUTH_TOKEN_EXPIRED' });
  }
  if (payload.nbf != null && (typeof payload.nbf !== 'number' || nowSec + CLOCK_SKEW_SECONDS < payload.nbf)) {
    throw createApiError('رمز الدخول غير ساري بعد (nbf).', 401, { code: 'AUTH_TOKEN_NOT_YET_VALID' });
  }
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat > nowSec + CLOCK_SKEW_SECONDS) {
    throw createApiError('وقت إصدار الرمز غير صالح (iat in future).', 401, { code: 'AUTH_TOKEN_INVALID_IAT' });
  }

  const expectedIssuer = env?.AUTH_ISSUER || 'https://auth.egypt-nutrition-coach.local';
  const expectedAudience = env?.AUTH_AUDIENCE || 'egypt-nutrition-coach-kmm';

  if (payload.iss !== expectedIssuer) {
    throw createApiError('مصدر رمز الدخول غير موثوق (Invalid issuer).', 401, { code: 'AUTH_INVALID_ISSUER' });
  }
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(expectedAudience)) {
    throw createApiError('جمهور رمز الدخول غير مطابق (Invalid audience).', 401, { code: 'AUTH_INVALID_AUDIENCE' });
  }
  if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 128 || !/^[A-Za-z0-9_:@.-]+$/.test(payload.sub)) {
    throw createApiError('معرّف المستخدم داخل الرمز غير صالح (Invalid sub).', 401, { code: 'AUTH_INVALID_SUBJECT' });
  }

  // Check revocation table in D1 if available
  const sessionId = payload.sid || payload.jti || 'default';
  if(typeof sessionId!=='string'||!sessionId||sessionId.length>200||sessionId.startsWith('__'))throw createApiError('معرّف الجلسة غير صالح.',401,{code:'AUTH_INVALID_SESSION'});
  const userId = payload.sub.startsWith('user:') ? payload.sub : `user:${payload.sub}`;
  if (env?.DB) {
    try {
      const revoked = await env.DB.prepare(
        'SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id=?'
      ).bind(userId, sessionId).first();
      if (revoked?.revoked_at) {
        throw createApiError('تم إنهاء هذه الجلسة أو إلغاء صلاحيتها.', 401, { code: 'AUTH_SESSION_REVOKED' });
      }
      const deleted = await env.DB.prepare(
        'SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id=?'
      ).bind(userId, '__deleted__').first();
      if (deleted?.revoked_at) {
        throw createApiError('هذا الحساب تم حذفه نهائيًا.', 401, { code: 'ACCOUNT_DELETED' });
      }
      const globalRevoke = await env.DB.prepare(
        'SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id=?'
      ).bind(userId, '__all__').first();
      if (globalRevoke?.revoked_at && payload.iat && payload.iat * 1000 < Date.parse(globalRevoke.revoked_at)) {
        throw createApiError('تم تسجيل الخروج من جميع الأجهزة؛ سجل الدخول مجددًا.', 401, { code: 'AUTH_ALL_SESSIONS_REVOKED' });
      }
    } catch (e) {
      if (e.code?.startsWith('AUTH_') || e.code === 'ACCOUNT_DELETED') throw e;
      throw createApiError('تعذر التحقق من حالة الجلسة.',503,{code:'AUTH_SESSION_CHECK_UNAVAILABLE'});
    }
  }

  return {
    userId,
    subject: payload.sub,
    sessionId,
    deviceId: payload.device_id || null,
    authMethod: 'bearer_jwt',
    isAnonymous: false,
    scopes: Array.isArray(payload.scopes) ? payload.scopes : ['coach:read', 'coach:write'],
    entitlement: payload.entitlement === 'premium' ? 'premium' : 'free',
    issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };
}

export async function authenticateRequest(request, env, nowMs = Date.now()) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    if (!/^Bearer\s+\S+/i.test(authHeader)) {
      throw createApiError('صيغة Authorization مطلوبة كـ Bearer token.', 401, { code: 'AUTH_HEADER_INVALID' });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    return await verifyBearerToken(token, env, nowMs);
  }

  // Check platform/gateway identity header (used by local tests and cloudflare-entry.mjs cookie adapter)
  const platformId = request.headers.get('oai-authenticated-user-id');
  if (!platformId) {
    throw createApiError('سجّل الدخول لحفظ ومتابعة خطتك.', 401, { code: 'UNAUTHENTICATED' });
  }
  const isAnon = platformId.startsWith('anon:');
  if (env?.DB) {
    try {
      const deleted = await env.DB.prepare(
        "SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id IN ('__deleted__','__claimed__')"
      ).bind(platformId).first();
      if (deleted?.revoked_at) {
        throw createApiError('هذا الحساب تم حذفه نهائيًا.', 401, { code: 'ACCOUNT_DELETED' });
      }
    } catch (e) {
      if (e.code === 'ACCOUNT_DELETED') throw e;
      if(!/no such table/i.test(e.message||''))throw createApiError('تعذر التحقق من حالة الحساب.',503,{code:'AUTH_SESSION_CHECK_UNAVAILABLE'});
    }
  }
  return {
    userId: platformId,
    subject: platformId,
    sessionId: isAnon ? 'anon-cookie' : 'platform-header',
    deviceId: request.headers.get('X-Client-Device-Id') || null,
    authMethod: isAnon ? 'anonymous_cookie' : 'platform_header',
    isAnonymous: isAnon,
    scopes: ['coach:read', 'coach:write'],
    entitlement: 'free',
    issuedAt: null,
    expiresAt: null
  };
}

// Per-user in-memory + D1 rate limiting
const RATE_WINDOW_MS = 60_000;
const MEM_RATE_LIMITS = new Map();

export function checkRateLimit(userId, actionCategory = 'read', env = {}) {
  const maxPerMinute = Number(env?.RATE_LIMIT_PER_MINUTE) || (actionCategory === 'write' ? 120 : 300);
  const now = Date.now();
  const windowKey = `${userId}:${actionCategory}:${Math.floor(now / RATE_WINDOW_MS)}`;
  const current = (MEM_RATE_LIMITS.get(windowKey) || 0) + 1;
  MEM_RATE_LIMITS.set(windowKey, current);

  // Prune old entries occasionally
  if (MEM_RATE_LIMITS.size > 5000) {
    const prefix = `:${Math.floor(now / RATE_WINDOW_MS)}`;
    for (const k of MEM_RATE_LIMITS.keys()) {
      if (!k.endsWith(prefix)) MEM_RATE_LIMITS.delete(k);
    }
  }

  if (current > maxPerMinute) {
    throw createApiError('تجاوزت الحد المسموح للطلبات في الدقيقة؛ انتظر لحظات وحاول مجددًا.', 429, {
      code: 'RATE_LIMITED',
      retryable: true
    });
  }
  return { remaining: Math.max(0, maxPerMinute - current), limit: maxPerMinute };
}
