// Private Cloudflare R2 Media Storage & Worker-Proxied HMAC-Signed URLs
// Supports Profile Avatars (<= 512 KB) and Encrypted-in-Transit Private Progress Photos (<= 5 MB).

import { base64UrlEncodeBytes } from './auth.mjs';
import { createApiError } from './logger.mjs';
import { validDate, number } from '../coaching-shared.mjs';

const AVATAR_MAX_BYTES = 512 * 1024;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const POSES = new Set(['front', 'side', 'back']);

function b64UrlToBytes(str) {
  const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function detectImageMime(bytes) {
  if (!bytes || bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  // WebP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

function requireBucket(env) {
  if (!env?.CURAFIT_MEDIA_BUCKET) {
    throw createApiError('Media storage is temporarily unavailable; retry shortly.', 503, {
      code: 'MEDIA_STORAGE_UNAVAILABLE',
      retryable: true
    });
  }
  return env.CURAFIT_MEDIA_BUCKET;
}

async function hmacKey(env) {
  const secret = env?.MEDIA_SIGNING_SECRET || env?.AUTH_JWT_SECRET || 'curafit-media-signing-fallback';
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signMediaToken(payload, env) {
  const data = base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

export async function verifyMediaToken(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) {
    throw createApiError('Signed media token is invalid or expired.', 403, { code: 'INVALID_MEDIA_TOKEN' });
  }
  const key = await hmacKey(env);
  let sigBytes;
  try { sigBytes = b64UrlToBytes(parts[1]); } catch {
    throw createApiError('Signed media token is invalid or expired.', 403, { code: 'INVALID_MEDIA_TOKEN' });
  }
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(parts[0]));
  if (!ok) {
    throw createApiError('Signed media token is invalid or expired.', 403, { code: 'INVALID_MEDIA_TOKEN' });
  }
  const payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(parts[0])));
  if (!payload?.exp || Math.floor(Date.now() / 1000) > payload.exp) {
    throw createApiError('Signed media token is invalid or expired.', 403, { code: 'INVALID_MEDIA_TOKEN' });
  }
  return payload;
}

export async function buildSignedMediaUrl(origin, objectKey, mode, env, ttlSeconds = 900, extra = {}) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await signMediaToken({ k: objectKey, m: mode, exp, ...extra }, env);
  return {
    url: `${origin}/v1/media/signed/${token}`,
    expiresAt: new Date(exp * 1000).toISOString()
  };
}

export async function handleSignedMediaRequest(request, env, token) {
  const claims = await verifyMediaToken(token, env);
  const bucket = requireBucket(env);

  if (request.method === 'GET' && claims.m === 'get') {
    const obj = await bucket.get(claims.k);
    if (!obj) {
      throw createApiError('Progress photo record not found.', 404, { code: 'PHOTO_NOT_FOUND' });
    }
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  if (request.method === 'PUT' && claims.m === 'put') {
    const maxBytes = claims.maxBytes || PHOTO_MAX_BYTES;
    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.byteLength === 0 || raw.byteLength > maxBytes) {
      throw createApiError('Uploaded image exceeds the maximum allowed byte size.', 413, {
        code: 'PHOTO_TOO_LARGE',
        params: { maxBytes }
      });
    }
    const detected = detectImageMime(raw);
    if (!detected || !ALLOWED_MIME.has(detected)) {
      throw createApiError('Image must be JPEG, PNG, or WebP format.', 415, { code: 'UNSUPPORTED_IMAGE_FORMAT' });
    }
    await bucket.put(claims.k, raw, { httpMetadata: { contentType: detected } });
    return Response.json({ ok: true, data: { uploaded: true, byteSize: raw.byteLength, contentType: detected }, meta: { requestId: crypto.randomUUID(), serverTime: new Date().toISOString() } }, { status: 200 });
  }

  throw createApiError('Only GET or PUT matching token mode is allowed.', 405, { code: 'METHOD_NOT_ALLOWED' });
}

export async function uploadProfileAvatar(request, env, db, userId, origin) {
  const bucket = requireBucket(env);
  const ct = request.headers.get('Content-Type') || '';
  let bytes = null;
  if (/^multipart\/form-data/i.test(ct)) {
    const form = await request.formData();
    const file = form.get('image') || form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw createApiError('Image must be JPEG, PNG, or WebP format.', 415, { code: 'UNSUPPORTED_IMAGE_FORMAT' });
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  } else if (ALLOWED_MIME.has(ct.split(';')[0].trim().toLowerCase())) {
    bytes = new Uint8Array(await request.arrayBuffer());
  } else {
    throw createApiError('Image must be JPEG, PNG, or WebP format.', 415, { code: 'UNSUPPORTED_IMAGE_FORMAT' });
  }

  if (bytes.byteLength === 0 || bytes.byteLength > AVATAR_MAX_BYTES) {
    throw createApiError('Uploaded image exceeds the maximum allowed byte size.', 413, {
      code: 'PHOTO_TOO_LARGE',
      params: { maxBytes: AVATAR_MAX_BYTES }
    });
  }
  const detected = detectImageMime(bytes);
  if (!detected || !ALLOWED_MIME.has(detected)) {
    throw createApiError('Image must be JPEG, PNG, or WebP format.', 415, { code: 'UNSUPPORTED_IMAGE_FORMAT' });
  }

  const ext = detected === 'image/png' ? 'png' : detected === 'image/webp' ? 'webp' : 'jpg';
  const key = `avatars/${userId}/${crypto.randomUUID()}.${ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: detected } });
  const signed = await buildSignedMediaUrl(origin, key, 'get', env, 3600);
  try {
    await db.prepare('UPDATE coaching_users SET avatar_url=?, updated_at=? WHERE user_id=?').bind(key, new Date().toISOString(), userId).run();
  } catch {}
  return { avatarKey: key, avatarUrl: signed.url, expiresAt: signed.expiresAt };
}

export async function deleteProfileAvatar(env, db, userId) {
  const bucket = env?.CURAFIT_MEDIA_BUCKET;
  try {
    const row = await db.prepare('SELECT avatar_url FROM coaching_users WHERE user_id=?').bind(userId).first();
    if (row?.avatar_url && bucket && row.avatar_url.startsWith(`avatars/${userId}/`)) {
      await bucket.delete(row.avatar_url);
    }
    await db.prepare('UPDATE coaching_users SET avatar_url=NULL, updated_at=? WHERE user_id=?').bind(new Date().toISOString(), userId).run();
  } catch {}
  return { deleted: true };
}

export async function createProgressPhotoUploadUrl(env, userId, origin, body = {}) {
  requireBucket(env);
  const date = body?.date;
  if (!validDate(date)) {
    throw createApiError('Invalid calendar date format; expected YYYY-MM-DD.', 400, { code: 'INVALID_DATE', params: { field: 'date' } });
  }
  const pose = String(body?.pose || '');
  if (!POSES.has(pose)) {
    throw createApiError('pose must be front, side, or back.', 400, { code: 'VALIDATION_ERROR' });
  }
  const contentType = String(body?.contentType || 'image/webp').toLowerCase();
  if (!ALLOWED_MIME.has(contentType)) {
    throw createApiError('Image must be JPEG, PNG, or WebP format.', 415, { code: 'UNSUPPORTED_IMAGE_FORMAT' });
  }
  const byteSize = Number(body?.byteSize || 0);
  if (byteSize <= 0 || byteSize > PHOTO_MAX_BYTES) {
    throw createApiError('Uploaded image exceeds the maximum allowed byte size.', 413, {
      code: 'PHOTO_TOO_LARGE',
      params: { maxBytes: PHOTO_MAX_BYTES }
    });
  }
  const photoId = `photo_${crypto.randomUUID()}`;
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
  const objectKey = `users/${userId}/photos/${photoId}.${ext}`;
  const signed = await buildSignedMediaUrl(origin, objectKey, 'put', env, 600, { maxBytes: PHOTO_MAX_BYTES, userId, photoId });
  return { photoId, objectKey, uploadUrl: signed.url, maxBytes: PHOTO_MAX_BYTES, expiresAt: signed.expiresAt };
}

export async function confirmProgressPhoto(db, env, userId, origin, body = {}) {
  const bucket = requireBucket(env);
  const photoId = String(body?.photoId || '').trim();
  const date = body?.date;
  const pose = String(body?.pose || '');
  if (!photoId || !validDate(date) || !POSES.has(pose)) {
    throw createApiError('photoId, valid YYYY-MM-DD date, and pose (front|side|back) are required.', 400, { code: 'VALIDATION_ERROR' });
  }
  const weightKgSnapshot = body?.weightKgSnapshot == null ? null : number(body.weightKgSnapshot, 35, 250, 'weightKgSnapshot');
  // Locate uploaded R2 object under user's namespace
  let objectKey = body?.objectKey && String(body.objectKey).startsWith(`users/${userId}/photos/${photoId}.`) ? String(body.objectKey) : null;
  if (!objectKey) {
    for (const ext of ['webp', 'jpg', 'png']) {
      const candidate = `users/${userId}/photos/${photoId}.${ext}`;
      const head = await bucket.head(candidate);
      if (head) { objectKey = candidate; break; }
    }
  }
  if (!objectKey) {
    throw createApiError('Progress photo record not found.', 404, { code: 'PHOTO_NOT_FOUND' });
  }
  const nowIso = new Date().toISOString();
  await db.prepare(
    'INSERT OR REPLACE INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)'
  ).bind(userId, photoId, date, pose, objectKey, weightKgSnapshot, nowIso).run();
  const signed = await buildSignedMediaUrl(origin, objectKey, 'get', env, 900);
  return { id: photoId, date, pose, weightKgSnapshot, downloadUrl: signed.url, expiresAt: signed.expiresAt, createdAt: nowIso };
}

export async function listProgressPhotos(db, env, userId, origin, { offset = 0, limit = 30 } = {}) {
  const rows = await db.prepare(
    'SELECT photo_id, date, pose, r2_object_key, weight_kg_snapshot, created_at FROM coaching_progress_photos WHERE user_id=? ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?'
  ).bind(userId, limit, offset).all();
  const items = await Promise.all((rows?.results || []).map(async r => {
    const signed = await buildSignedMediaUrl(origin, r.r2_object_key, 'get', env, 900);
    return {
      id: r.photo_id,
      date: r.date,
      pose: r.pose,
      weightKgSnapshot: r.weight_kg_snapshot,
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
      createdAt: r.created_at
    };
  }));
  return { items, offset, limit, nextOffset: items.length === limit ? offset + limit : null };
}

export async function deleteProgressPhoto(db, env, userId, photoId) {
  const row = await db.prepare(
    'SELECT r2_object_key FROM coaching_progress_photos WHERE user_id=? AND photo_id=?'
  ).bind(userId, photoId).first();
  if (!row) {
    throw createApiError('Progress photo record not found.', 404, { code: 'PHOTO_NOT_FOUND' });
  }
  if (env?.CURAFIT_MEDIA_BUCKET && row.r2_object_key) {
    try { await env.CURAFIT_MEDIA_BUCKET.delete(row.r2_object_key); } catch {}
  }
  await db.prepare('DELETE FROM coaching_progress_photos WHERE user_id=? AND photo_id=?').bind(userId, photoId).run();
  return { deleted: true, id: photoId };
}

export async function purgeUserMedia(db, env, userId) {
  const bucket = env?.CURAFIT_MEDIA_BUCKET;
  let objectsDeleted = 0;
  if (!bucket) return { objectsDeleted };
  try {
    const photoRows = await db.prepare('SELECT r2_object_key FROM coaching_progress_photos WHERE user_id=?').bind(userId).all();
    for (const r of photoRows?.results || []) {
      if (r.r2_object_key) { await bucket.delete(r.r2_object_key); objectsDeleted++; }
    }
    const userRow = await db.prepare('SELECT avatar_url FROM coaching_users WHERE user_id=?').bind(userId).first();
    if (userRow?.avatar_url && userRow.avatar_url.startsWith(`avatars/${userId}/`)) {
      await bucket.delete(userRow.avatar_url);
      objectsDeleted++;
    }
  } catch {}
  return { objectsDeleted };
}
