// Cloudflare Workers + D1 First-Party Native Authentication
// Zero external IdP / zero Supabase dependency.
// Uses WebCrypto PBKDF2-SHA256 (100,000 iterations) + HS256 Access JWT + Rotating D1 Refresh Tokens.

import { signHs256Jwt, base64UrlEncodeBytes } from './auth.mjs';
import { sha256Hex } from './store.mjs';
import { createApiError } from './logger.mjs';

const PBKDF2_ITERATIONS = 100_000; // Cloudflare Workers WebCrypto PBKDF2 max supported iterations
const DEFAULT_ACCESS_TTL_SEC = 900; // 15 minutes
const DEFAULT_REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DUMMY_PASSWORD_HASH = 'pbkdf2_sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function base64UrlDecodeBytes(str) {
  const base64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqualBytes(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derivePbkdf2(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${base64UrlEncodeBytes(salt)}$${base64UrlEncodeBytes(derived)}`;
}

export async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > PBKDF2_ITERATIONS) return false;
  let salt, expected;
  try {
    salt = base64UrlDecodeBytes(parts[2]);
    expected = base64UrlDecodeBytes(parts[3]);
  } catch {
    return false;
  }
  const actual = await derivePbkdf2(password, salt, iterations);
  return timingSafeEqualBytes(actual, expected);
}

function normalizeEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email || email.length > 160 || !EMAIL_RE.test(email)) {
    throw createApiError('البريد الإلكتروني غير صالح.', 400, {
      code: 'INVALID_EMAIL',
      fieldErrors: [{ field: 'email', code: 'INVALID_EMAIL', message: 'أدخل بريدًا إلكترونيًا صحيحًا.' }]
    });
  }
  return email;
}

function validatePassword(raw, field = 'password') {
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 128) {
    throw createApiError('كلمة المرور يجب أن تكون بين 8 و128 حرفًا.', 400, {
      code: 'INVALID_PASSWORD',
      fieldErrors: [{ field, code: 'INVALID_PASSWORD', message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' }]
    });
  }
  return raw;
}

function normalizeDeviceId(body, request) {
  const raw = body?.deviceId ?? request?.headers?.get('X-Client-Device-Id') ?? null;
  if (raw == null || raw === '') return null;
  return String(raw).trim().slice(0, 120) || null;
}

function requireJwtSecret(env) {
  const secret = env?.AUTH_JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.length < 16) {
    throw createApiError('مفتاح توقيع الجلسات (AUTH_JWT_SECRET) غير مهيأ على الخادم.', 503, {
      code: 'AUTH_SECRET_NOT_CONFIGURED',
      retryable: false
    });
  }
  return secret;
}

function generateRefreshToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `cfrt_${base64UrlEncodeBytes(bytes)}`;
}

function mapSchemaError(error) {
  if (/no such table/i.test(error?.message || '')) {
    return createApiError('جداول المصادقة غير مرحّلة في D1 بعد؛ شغّل deploy:d1.', 503, {
      code: 'AUTH_MIGRATION_REQUIRED',
      retryable: true
    });
  }
  return error;
}

async function issueTokenPair({ db, env, user, sessionId, deviceId, existingSession = false }) {
  const secret = requireJwtSecret(env);
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const accessTtl = Math.max(60, Math.min(86_400, Number(env?.AUTH_ACCESS_TTL_SECONDS) || DEFAULT_ACCESS_TTL_SEC));
  const refreshTtl = Math.max(300, Math.min(60 * 60 * 24 * 90, Number(env?.AUTH_REFRESH_TTL_SECONDS) || DEFAULT_REFRESH_TTL_SEC));
  const nowIso = new Date(nowMs).toISOString();
  const accessExpiresAt = new Date((nowSec + accessTtl) * 1000).toISOString();
  const refreshExpiresAt = new Date((nowSec + refreshTtl) * 1000).toISOString();

  const issuer = env?.AUTH_ISSUER || 'https://auth.egypt-nutrition-coach.local';
  const audience = env?.AUTH_AUDIENCE || 'egypt-nutrition-coach-kmm';
  const entitlement = user.entitlement === 'premium' ? 'premium' : 'free';

  const accessToken = await signHs256Jwt({
    iss: issuer,
    aud: audience,
    sub: user.user_id,
    sid: sessionId,
    device_id: deviceId || undefined,
    scopes: ['coach:read', 'coach:write'],
    entitlement,
    iat: nowSec,
    exp: nowSec + accessTtl
  }, secret);

  const refreshToken = generateRefreshToken();
  const refreshHash = await sha256Hex(refreshToken);

  const stmts = [];
  if (!existingSession) {
    stmts.push(
      db.prepare(
        'INSERT INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,NULL)'
      ).bind(user.user_id, sessionId, deviceId || 'api-client', nowIso, refreshExpiresAt)
    );
  }
  stmts.push(
    db.prepare(
      'INSERT INTO coaching_refresh_tokens(token_hash,user_id,session_id,device_id,created_at,expires_at,rotated_at,revoked_at) VALUES(?,?,?,?,?,?,NULL,NULL)'
    ).bind(refreshHash, user.user_id, sessionId, deviceId || 'api-client', nowIso, refreshExpiresAt)
  );

  return {
    stmts,
    refreshHash,
    payload: {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: accessTtl,
      expiresAt: accessExpiresAt,
      refreshToken,
      refreshExpiresIn: refreshTtl,
      refreshExpiresAt,
      sessionId,
      user: {
        userId: user.user_id,
        email: user.email,
        name: user.display_name || null,
        entitlement,
        createdAt: user.created_at
      }
    }
  };
}

export async function registerUser(db, env, body, request) {
  requireJwtSecret(env);
  const email = normalizeEmail(body?.email);
  const password = validatePassword(body?.password);
  const displayName = body?.name != null ? String(body.name).trim().slice(0, 100) || null : null;
  const deviceId = normalizeDeviceId(body, request);

  try {
    const existing = await db.prepare('SELECT user_id FROM coaching_users WHERE email=?').bind(email).first();
    if (existing) {
      throw createApiError('هذا البريد الإلكتروني مسجل بالفعل.', 409, {
        code: 'AUTH_EMAIL_ALREADY_EXISTS',
        fieldErrors: [{ field: 'email', code: 'AUTH_EMAIL_ALREADY_EXISTS', message: 'البريد الإلكتروني مستخدم بالفعل.' }]
      });
    }

    const nowIso = new Date().toISOString();
    const userId = `user:${crypto.randomUUID()}`;
    const sessionId = `sess_${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);
    const user = {
      user_id: userId,
      email,
      display_name: displayName,
      entitlement: 'free',
      created_at: nowIso
    };

    const issued = await issueTokenPair({ db, env, user, sessionId, deviceId, existingSession: false });
    const stmts = [
      db.prepare(
        'INSERT INTO coaching_users(user_id,email,password_hash,display_name,entitlement,created_at,updated_at) VALUES(?,?,?,?,?,?,?)'
      ).bind(userId, email, passwordHash, displayName, 'free', nowIso, nowIso),
      ...issued.stmts
    ];

    try {
      await db.batch(stmts);
    } catch (e) {
      if (/UNIQUE constraint failed/i.test(e?.message || '')) {
        throw createApiError('هذا البريد الإلكتروني مسجل بالفعل.', 409, { code: 'AUTH_EMAIL_ALREADY_EXISTS' });
      }
      throw e;
    }

    return issued.payload;
  } catch (error) {
    throw mapSchemaError(error);
  }
}

export async function loginUser(db, env, body, request) {
  requireJwtSecret(env);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' && body.password.length > 0 && body.password.length <= 128
    ? body.password
    : null;
  if (!password) {
    throw createApiError('البريد الإلكتروني أو كلمة المرور غير صحيحة.', 401, { code: 'AUTH_INVALID_CREDENTIALS' });
  }
  const deviceId = normalizeDeviceId(body, request);

  try {
    const user = await db.prepare(
      'SELECT user_id,email,password_hash,display_name,entitlement,created_at FROM coaching_users WHERE email=?'
    ).bind(email).first();

    // Always run PBKDF2 to avoid timing-based account enumeration.
    const passwordValid = await verifyPassword(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);
    if (!user || !passwordValid) {
      throw createApiError('البريد الإلكتروني أو كلمة المرور غير صحيحة.', 401, { code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const deleted = await db.prepare(
      "SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id='__deleted__'"
    ).bind(user.user_id).first();
    if (deleted?.revoked_at) {
      throw createApiError('هذا الحساب تم حذفه نهائيًا.', 401, { code: 'ACCOUNT_DELETED' });
    }

    const sessionId = `sess_${crypto.randomUUID()}`;
    const issued = await issueTokenPair({ db, env, user, sessionId, deviceId, existingSession: false });
    await db.batch(issued.stmts);
    return issued.payload;
  } catch (error) {
    throw mapSchemaError(error);
  }
}

export async function refreshUserSession(db, env, body, request) {
  requireJwtSecret(env);
  const rawToken = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : '';
  if (!rawToken || rawToken.length < 20 || rawToken.length > 256) {
    throw createApiError('رمز التجديد (refreshToken) غير صالح.', 401, { code: 'AUTH_REFRESH_TOKEN_INVALID' });
  }
  const deviceId = normalizeDeviceId(body, request);
  const tokenHash = await sha256Hex(rawToken);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  try {
    const row = await db.prepare(
      'SELECT token_hash,user_id,session_id,device_id,created_at,expires_at,rotated_at,revoked_at FROM coaching_refresh_tokens WHERE token_hash=?'
    ).bind(tokenHash).first();

    if (!row) {
      throw createApiError('رمز التجديد غير صالح أو منتهي.', 401, { code: 'AUTH_REFRESH_TOKEN_INVALID' });
    }

    // Reuse detection: if an already-rotated refresh token is replayed, revoke the entire session.
    if (row.rotated_at) {
      await db.batch([
        db.prepare(
          'INSERT OR REPLACE INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)'
        ).bind(row.user_id, row.session_id, row.device_id || 'reuse-guard', row.created_at, row.expires_at, nowIso),
        db.prepare(
          'UPDATE coaching_refresh_tokens SET revoked_at=? WHERE user_id=? AND session_id=? AND revoked_at IS NULL'
        ).bind(nowIso, row.user_id, row.session_id)
      ]);
      throw createApiError('تم اكتشاف إعادة استخدام رمز تجديد قديم؛ تم إغلاق الجلسة لحماية حسابك.', 401, {
        code: 'AUTH_REFRESH_TOKEN_REUSED'
      });
    }

    if (row.revoked_at) {
      throw createApiError('تم إلغاء صلاحية رمز التجديد.', 401, { code: 'AUTH_REFRESH_TOKEN_REVOKED' });
    }
    if (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= nowMs) {
      throw createApiError('انتهت صلاحية رمز التجديد؛ يرجى تسجيل الدخول مجددًا.', 401, { code: 'AUTH_REFRESH_TOKEN_EXPIRED' });
    }

    const [sessRevoked, deleted, globalRevoke, user] = await db.batch([
      db.prepare('SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id=?').bind(row.user_id, row.session_id),
      db.prepare("SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id='__deleted__'").bind(row.user_id),
      db.prepare("SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id='__all__'").bind(row.user_id),
      db.prepare('SELECT user_id,email,display_name,entitlement,created_at FROM coaching_users WHERE user_id=?').bind(row.user_id)
    ]);

    if (deleted.results?.[0]?.revoked_at) {
      throw createApiError('هذا الحساب تم حذفه نهائيًا.', 401, { code: 'ACCOUNT_DELETED' });
    }
    if (sessRevoked.results?.[0]?.revoked_at) {
      throw createApiError('تم إنهاء هذه الجلسة؛ يرجى تسجيل الدخول مجددًا.', 401, { code: 'AUTH_SESSION_REVOKED' });
    }
    const allRevokedAt = globalRevoke.results?.[0]?.revoked_at;
    if (allRevokedAt && Date.parse(row.created_at) < Date.parse(allRevokedAt)) {
      throw createApiError('تم تسجيل الخروج من جميع الأجهزة؛ سجل الدخول مجددًا.', 401, { code: 'AUTH_ALL_SESSIONS_REVOKED' });
    }
    const userRow = user.results?.[0];
    if (!userRow) {
      throw createApiError('الحساب غير موجود.', 401, { code: 'AUTH_USER_NOT_FOUND' });
    }

    const issued = await issueTokenPair({
      db,
      env,
      user: userRow,
      sessionId: row.session_id,
      deviceId: deviceId || row.device_id,
      existingSession: true
    });

    const newRefreshHash = issued.refreshHash;
    const refreshRes = await db.batch([
      db.prepare(
        'UPDATE coaching_refresh_tokens SET rotated_at=? WHERE token_hash=? AND rotated_at IS NULL AND revoked_at IS NULL'
      ).bind(nowIso, tokenHash),
      db.prepare(
        'INSERT INTO coaching_refresh_tokens(token_hash,user_id,session_id,device_id,created_at,expires_at,rotated_at,revoked_at) SELECT ?,?,?,?,?,?,NULL,NULL WHERE EXISTS(SELECT 1 FROM coaching_refresh_tokens WHERE token_hash=? AND rotated_at=?)'
      ).bind(
        newRefreshHash,
        userRow.user_id,
        row.session_id,
        deviceId || row.device_id || 'api-client',
        nowIso,
        issued.payload.refreshExpiresAt,
        tokenHash,
        nowIso
      )
    ]);

    if (!refreshRes[0].meta?.changes) {
      await db.batch([
        db.prepare(
          'INSERT OR REPLACE INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)'
        ).bind(row.user_id, row.session_id, row.device_id || 'race-guard', row.created_at, row.expires_at, nowIso),
        db.prepare(
          'UPDATE coaching_refresh_tokens SET revoked_at=? WHERE user_id=? AND session_id=? AND revoked_at IS NULL'
        ).bind(nowIso, row.user_id, row.session_id)
      ]);
      throw createApiError('تم استخدام رمز التجديد بالتزامن؛ تم إغلاق الجلسة لحماية حسابك.', 401, {
        code: 'AUTH_REFRESH_TOKEN_REUSED'
      });
    }

    return issued.payload;
  } catch (error) {
    throw mapSchemaError(error);
  }
}

export async function revokeRefreshTokensForSession(db, userId, targetSession, nowIso) {
  try {
    if (targetSession === '__all__') {
      await db.prepare(
        'UPDATE coaching_refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL'
      ).bind(nowIso, userId).run();
    } else {
      await db.prepare(
        'UPDATE coaching_refresh_tokens SET revoked_at=? WHERE user_id=? AND session_id=? AND revoked_at IS NULL'
      ).bind(nowIso, userId, String(targetSession)).run();
    }
  } catch (error) {
    if (!/no such table/i.test(error?.message || '')) throw error;
  }
}

export async function logoutUserSession(db, auth, body = {}) {
  const allDevices = body?.allDevices === true;
  const targetSession = allDevices ? '__all__' : (body?.sessionId || auth.sessionId);
  if (!allDevices && (typeof targetSession !== 'string' || !targetSession || targetSession.length > 200 || targetSession.startsWith('__'))) {
    throw createApiError('معرّف الجلسة غير صالح.', 400, { code: 'INVALID_SESSION_ID' });
  }
  const nowIso = new Date().toISOString();
  await db.prepare(
    'INSERT OR REPLACE INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)'
  ).bind(auth.userId, String(targetSession), auth.deviceId || 'logout', nowIso, null, nowIso).run();
  await revokeRefreshTokensForSession(db, auth.userId, targetSession, nowIso);
  return {
    loggedOut: true,
    sessionId: targetSession,
    allDevices,
    revokedAt: nowIso
  };
}

export async function changeUserPassword(db, auth, body = {}) {
  if (auth.isAnonymous) {
    throw createApiError('تغيير كلمة المرور متاح للحسابات المسجلة فقط.', 403, { code: 'AUTH_VERIFIED_ACCOUNT_REQUIRED' });
  }
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = validatePassword(body?.newPassword, 'newPassword');
  if (!currentPassword) {
    throw createApiError('كلمة المرور الحالية مطلوبة.', 400, {
      code: 'CURRENT_PASSWORD_REQUIRED',
      fieldErrors: [{ field: 'currentPassword', code: 'CURRENT_PASSWORD_REQUIRED', message: 'أدخل كلمة المرور الحالية.' }]
    });
  }
  if (currentPassword === newPassword) {
    throw createApiError('كلمة المرور الجديدة يجب أن تختلف عن الحالية.', 400, { code: 'PASSWORD_UNCHANGED' });
  }

  try {
    const user = await db.prepare('SELECT user_id,password_hash FROM coaching_users WHERE user_id=?').bind(auth.userId).first();
    if (!user) {
      throw createApiError('حساب المصادقة غير موجود.', 404, { code: 'AUTH_USER_NOT_FOUND' });
    }
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      throw createApiError('كلمة المرور الحالية غير صحيحة.', 401, { code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const nowIso = new Date().toISOString();
    const newHash = await hashPassword(newPassword);
    const revokeOthers = body?.revokeOtherSessions !== false;
    const stmts = [
      db.prepare('UPDATE coaching_users SET password_hash=?,updated_at=? WHERE user_id=?').bind(newHash, nowIso, auth.userId)
    ];
    if (revokeOthers) {
      stmts.push(
        db.prepare(
          'UPDATE coaching_refresh_tokens SET revoked_at=? WHERE user_id=? AND session_id!=? AND revoked_at IS NULL'
        ).bind(nowIso, auth.userId, auth.sessionId),
        db.prepare(
          "UPDATE coaching_auth_sessions SET revoked_at=? WHERE user_id=? AND session_id!=? AND SUBSTR(session_id,1,2)!='__' AND revoked_at IS NULL"
        ).bind(nowIso, auth.userId, auth.sessionId)
      );
    }
    await db.batch(stmts);
    return {
      changed: true,
      revokedOtherSessions: revokeOthers,
      updatedAt: nowIso
    };
  } catch (error) {
    throw mapSchemaError(error);
  }
}
