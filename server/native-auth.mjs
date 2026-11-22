// Cloudflare Workers + D1 First-Party Session & Token Manager (Google & Apple OIDC Only)
// Zero external IdP / zero Supabase dependency / zero email-password authentication.
// Uses HS256 Access JWT + Rotating D1 Refresh Tokens for verified OIDC accounts.

import { signHs256Jwt, base64UrlEncodeBytes } from './auth.mjs';
import { sha256Hex } from './store.mjs';
import { createApiError } from './logger.mjs';

const DEFAULT_ACCESS_TTL_SEC = 900; // 15 minutes
const DEFAULT_REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

function normalizeDeviceId(body, request) {
  const raw = body?.deviceId ?? request?.headers?.get('X-Client-Device-Id') ?? null;
  if (raw == null || raw === '') return null;
  return String(raw).trim().slice(0, 120) || null;
}

function requireJwtSecret(env) {
  const secret = env?.AUTH_JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.length < 16) {
    throw createApiError('Session signing key (AUTH_JWT_SECRET) is not configured on the server.', 503, {
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
    return createApiError('Authentication database tables have not been migrated yet; run D1 migrations.', 503, {
      code: 'AUTH_MIGRATION_REQUIRED',
      retryable: true
    });
  }
  return error;
}

export async function issueTokenPair({ db, env, user, sessionId, deviceId, existingSession = false }) {
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
  const entitlement = (user.entitlement === 'pro' || user.entitlement === 'premium') ? 'pro' : 'free';

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
        avatarUrl: user.avatar_url || null,
        entitlement,
        createdAt: user.created_at
      }
    }
  };
}

export async function refreshUserSession(db, env, body, request) {
  requireJwtSecret(env);
  const rawToken = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : '';
  if (!rawToken || rawToken.length < 20 || rawToken.length > 256) {
    throw createApiError('Invalid or malformed refresh token.', 401, { code: 'AUTH_REFRESH_TOKEN_INVALID' });
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
      throw createApiError('Invalid or malformed refresh token.', 401, { code: 'AUTH_REFRESH_TOKEN_INVALID' });
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
      throw createApiError('Refresh token reuse detected; session revoked to protect your account.', 401, {
        code: 'AUTH_REFRESH_TOKEN_REUSED'
      });
    }

    if (row.revoked_at) {
      throw createApiError('Refresh token has been revoked.', 401, { code: 'AUTH_REFRESH_TOKEN_REVOKED' });
    }
    if (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= nowMs) {
      throw createApiError('Refresh token has expired; sign in again.', 401, { code: 'AUTH_REFRESH_TOKEN_EXPIRED' });
    }

    const [sessRevoked, deleted, globalRevoke, user] = await db.batch([
      db.prepare('SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id=?').bind(row.user_id, row.session_id),
      db.prepare("SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id='__deleted__'").bind(row.user_id),
      db.prepare("SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id='__all__'").bind(row.user_id),
      db.prepare('SELECT user_id,email,display_name,avatar_url,entitlement,created_at FROM coaching_users WHERE user_id=?').bind(row.user_id)
    ]);

    if (deleted.results?.[0]?.revoked_at) {
      throw createApiError('This account has been permanently deleted.', 401, { code: 'ACCOUNT_DELETED' });
    }
    if (sessRevoked.results?.[0]?.revoked_at) {
      throw createApiError('Session has been revoked; sign in again.', 401, { code: 'AUTH_SESSION_REVOKED' });
    }
    const allRevokedAt = globalRevoke.results?.[0]?.revoked_at;
    if (allRevokedAt && Date.parse(row.created_at) < Date.parse(allRevokedAt)) {
      throw createApiError('All sessions were revoked; sign in again.', 401, { code: 'AUTH_ALL_SESSIONS_REVOKED' });
    }
    const userRow = user.results?.[0];
    if (!userRow) {
      throw createApiError('Account not found.', 401, { code: 'AUTH_USER_NOT_FOUND' });
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
      throw createApiError('Concurrent refresh token use detected; session revoked to protect your account.', 401, {
        code: 'AUTH_REFRESH_TOKEN_CONCURRENT_REUSE'
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
      await db.batch([
        db.prepare(
          "UPDATE coaching_auth_sessions SET revoked_at=? WHERE user_id=? AND SUBSTR(session_id,1,2)!='__' AND revoked_at IS NULL"
        ).bind(nowIso, userId),
        db.prepare(
          'UPDATE coaching_refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL'
        ).bind(nowIso, userId)
      ]);
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
    throw createApiError('Invalid sessionId parameter.', 400, { code: 'INVALID_SESSION_ID' });
  }
  const nowIso = new Date().toISOString();
  await db.prepare(
    'INSERT OR REPLACE INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)'
  ).bind(auth.userId, String(targetSession), auth.deviceId || 'logout', nowIso, null, nowIso).run();
  await revokeRefreshTokensForSession(db, auth.userId, targetSession, nowIso);
  try {
    if (allDevices) {
      await db.prepare('DELETE FROM coaching_push_tokens WHERE user_id=?').bind(auth.userId).run();
    } else if (auth.deviceId) {
      await db.prepare('DELETE FROM coaching_push_tokens WHERE user_id=? AND device_id=?').bind(auth.userId, auth.deviceId).run();
    }
  } catch (e) {
    if (!/no such table/i.test(e?.message || '')) throw e;
  }
  return {
    loggedOut: true,
    sessionId: targetSession,
    allDevices,
    revokedAt: nowIso
  };
}
