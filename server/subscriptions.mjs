// Unified Subscription Entitlements, Atomic Free Quotas, StoreKit 2 & Google Play Billing + Webhooks
// Single source of truth: coaching_subscriptions + coaching_usage_quotas, synced to coaching_users.entitlement.

import { createApiError } from './logger.mjs';
import { isoNow, clockNow } from './clock.mjs';
import { localDate } from '../coaching-shared.mjs';

const FREE_FEATURES = ['core_nutrition', 'core_workouts', 'offline_sync', 'arabic_food_search', 'safety_recovery_deload', 'workout_reschedule', 'injury_safety_swaps', 'comeback_protocol'];
const PRO_FEATURES = [...FREE_FEATURES, 'unlimited_meal_swaps', 'unlimited_exercise_swaps', 'unlimited_plan_renewals', 'grocery_list', 'barcode_scanner', 'pantry_finder', 'ramadan_fasting', 'adaptive_calorie_volume', 'advanced_analytics', 'progress_photos_cloud'];

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'grace_period', 'cancelled_active']);
const FREE_LIMITS = {
  dailyMealSwapsLimit: 2,
  weeklyExerciseSwapsLimit: 2,
  freePlanRenewalsTotal: 1,
  aiParsesFreeTotal: 1,
  aiCoachMessagesFreeTotal: 3
};

function isoWeekKey(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function getQuotaUsage(db, userId, quotaKey, windowKey) {
  try {
    const row = await db.prepare(
      'SELECT used_count FROM coaching_usage_quotas WHERE user_id=? AND quota_key=? AND window_key=?'
    ).bind(userId, quotaKey, windowKey).first();
    return Number(row?.used_count || 0);
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return 0;
    throw e;
  }
}

export async function incrementQuotaUsage(db, userId, quotaKey, windowKey) {
  const now = isoNow();
  await db.prepare(
    'INSERT INTO coaching_usage_quotas(user_id,quota_key,window_key,used_count,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(user_id,quota_key,window_key) DO UPDATE SET used_count=used_count+1, updated_at=excluded.updated_at'
  ).bind(userId, quotaKey, windowKey, now).run();
}

export async function resolveEntitlements(db, s, userId, todayDate = null) {
  const tz = s?.profile?.timezone || 'Africa/Cairo';
  const today = todayDate || localDate(clockNow(), tz);
  const weekKey = isoWeekKey(today);

  let sub = null;
  let trialUsedEver = false;
  try {
    const rows = await db.prepare(
      'SELECT * FROM coaching_subscriptions WHERE user_id=? ORDER BY expires_at DESC'
    ).bind(userId).all();
    const list = rows?.results || [];
    trialUsedEver = list.some(r => Number(r.trial_used) === 1);
    const nowIso = isoNow();
    sub = list.find(r => ACTIVE_SUB_STATUSES.has(r.status) && r.expires_at > nowIso) || list[0] || null;
  } catch (e) {
    if (!/no such table/i.test(e?.message || '')) throw e;
  }

  const nowIso = isoNow();
  const isProFromSub = Boolean(sub && ACTIVE_SUB_STATUSES.has(sub.status) && sub.expires_at > nowIso);
  const isProFromState = s?.entitlements?.tier === 'pro' || s?.entitlements?.tier === 'premium';
  const isPro = isProFromSub || isProFromState;

  const [mealSwapsUsed, exerciseSwapsUsed, renewalsUsed, aiParsesUsed, aiCoachUsed] = await Promise.all([
    getQuotaUsage(db, userId, 'meal_swap', today),
    getQuotaUsage(db, userId, 'exercise_swap', weekKey),
    getQuotaUsage(db, userId, 'plan_renewal', 'lifetime'),
    getQuotaUsage(db, userId, 'ai_parse', 'lifetime'),
    getQuotaUsage(db, userId, 'ai_coach', 'lifetime')
  ]);

  const status = isProFromSub
    ? sub.status
    : (sub ? 'expired' : (isProFromState ? 'active' : 'none'));
  const provider = sub?.provider || null;
  const managementUrl = provider === 'apple'
    ? 'https://apps.apple.com/account/subscriptions'
    : provider === 'google'
      ? 'https://play.google.com/store/account/subscriptions'
      : null;

  return {
    tier: isPro ? 'pro' : 'free',
    status,
    provider,
    productId: sub?.product_id || null,
    expiresAt: sub?.expires_at || null,
    autoRenewEnabled: sub ? Number(sub.auto_renew_enabled) === 1 : false,
    trialEligible: !trialUsedEver && !isPro,
    isInGracePeriod: status === 'grace_period',
    managementUrl,
    features: isPro ? PRO_FEATURES : FREE_FEATURES,
    quotas: {
      aiParsesRemainingFree: isPro ? null : Math.max(0, FREE_LIMITS.aiParsesFreeTotal - aiParsesUsed),
      aiCoachMessagesRemainingFree: isPro ? null : Math.max(0, FREE_LIMITS.aiCoachMessagesFreeTotal - aiCoachUsed),
      freePlanRenewalsRemaining: isPro ? null : Math.max(0, FREE_LIMITS.freePlanRenewalsTotal - renewalsUsed),
      dailyMealSwapsLimit: isPro ? null : FREE_LIMITS.dailyMealSwapsLimit,
      dailyMealSwapsRemaining: isPro ? null : Math.max(0, FREE_LIMITS.dailyMealSwapsLimit - mealSwapsUsed),
      weeklyExerciseSwapsLimit: isPro ? null : FREE_LIMITS.weeklyExerciseSwapsLimit,
      weeklyExerciseSwapsRemaining: isPro ? null : Math.max(0, FREE_LIMITS.weeklyExerciseSwapsLimit - exerciseSwapsUsed)
    },
    updatedAt: sub?.updated_at || s?.entitlements?.updatedAt || null
  };
}

export async function requireProOrConsumeQuota(db, s, userId, { feature, quotaKey = null, windowKey = 'lifetime', freeLimit = 0 }) {
  const ent = await resolveEntitlements(db, s, userId);
  if (ent.tier === 'pro') return { allowed: true, tier: 'pro' };
  if (!quotaKey || freeLimit <= 0) {
    throw createApiError('This feature requires an active CuraFit Pro subscription.', 402, {
      code: 'PRO_ENTITLEMENT_REQUIRED',
      params: { feature }
    });
  }
  const used = await getQuotaUsage(db, userId, quotaKey, windowKey);
  if (used >= freeLimit) {
    throw createApiError('This feature requires an active CuraFit Pro subscription.', 402, {
      code: 'PRO_ENTITLEMENT_REQUIRED',
      params: { feature }
    });
  }
  await incrementQuotaUsage(db, userId, quotaKey, windowKey);
  return { allowed: true, tier: 'free', remaining: Math.max(0, freeLimit - used - 1) };
}

export function getSubscriptionOfferings(platform = 'android', region = 'egypt', trialEligible = true) {
  const prefix = platform === 'ios' ? 'com.curafit.pro' : 'curafit_pro';
  return {
    platform: platform === 'ios' ? 'ios' : 'android',
    region,
    trialEligible,
    products: [
      { productId: `${prefix}.monthly`, period: 'monthly', trialDays: trialEligible ? 7 : 0 },
      { productId: `${prefix}.annual`, period: 'annual', bestValuePct: 42, trialDays: trialEligible ? 7 : 0 }
    ]
  };
}

function parseJwsPayload(jws) {
  const parts = String(jws || '').trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

export async function verifyStoreSubscription(db, env, s, userId, body = {}) {
  const platform = body?.platform || body?.provider;
  if (!['apple', 'ios', 'google', 'android'].includes(platform)) {
    throw createApiError('Store subscription receipt could not be verified.', 400, {
      code: 'INVALID_SUBSCRIPTION_RECEIPT',
      params: { platform: String(platform || 'unknown') }
    });
  }
  const provider = (platform === 'apple' || platform === 'ios') ? 'apple' : 'google';
  const productId = String(body?.productId || '').trim();
  let externalTxId = null;
  let expiresAt = null;
  let status = 'active';
  let trialUsed = 0;
  let autoRenew = 1;

  if (provider === 'apple') {
    const jws = body?.signedTransactionJws;
    const parsed = jws ? parseJwsPayload(jws) : null;
    if (!parsed && !body?.transactionId) {
      throw createApiError('Store subscription receipt could not be verified.', 400, {
        code: 'INVALID_SUBSCRIPTION_RECEIPT',
        params: { platform: 'apple' }
      });
    }
    // Enforce bundleId check when configured in production
    if (env?.APPLE_BUNDLE_ID && parsed?.bundleId && parsed.bundleId !== env.APPLE_BUNDLE_ID) {
      throw createApiError('Store subscription receipt could not be verified.', 400, {
        code: 'INVALID_SUBSCRIPTION_RECEIPT',
        params: { platform: 'apple' }
      });
    }
    externalTxId = String(parsed?.originalTransactionId || parsed?.transactionId || body.transactionId).trim();
    const expMs = Number(parsed?.expiresDate || (Date.now() + 30 * 86400000));
    expiresAt = new Date(expMs).toISOString();
    if (parsed?.offerType === 1 || body?.isTrial === true) { status = 'trialing'; trialUsed = 1; }
    if (expMs <= Date.now()) status = 'expired';
  } else {
    const purchaseToken = String(body?.purchaseToken || '').trim();
    if (!purchaseToken || purchaseToken.length < 10) {
      throw createApiError('Store subscription receipt could not be verified.', 400, {
        code: 'INVALID_SUBSCRIPTION_RECEIPT',
        params: { platform: 'google' }
      });
    }
    externalTxId = purchaseToken;
    const expMs = Number(body?.expiresAtMs || (Date.now() + 30 * 86400000));
    expiresAt = new Date(expMs).toISOString();
    if (body?.isTrial === true) { status = 'trialing'; trialUsed = 1; }
    if (expMs <= Date.now()) status = 'expired';
  }

  if (!externalTxId || !productId) {
    throw createApiError('Store subscription receipt could not be verified.', 400, {
      code: 'INVALID_SUBSCRIPTION_RECEIPT',
      params: { platform: provider }
    });
  }

  // Ownership conflict check
  const ownerRow = await db.prepare(
    'SELECT user_id FROM coaching_subscriptions WHERE provider=? AND external_tx_id=?'
  ).bind(provider, externalTxId).first();
  if (ownerRow && ownerRow.user_id !== userId) {
    throw createApiError('This store subscription is already linked to a different CuraFit account.', 409, {
      code: 'SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT'
    });
  }

  const now = isoNow();
  const nextEnt = ACTIVE_SUB_STATUSES.has(status) ? 'pro' : 'free';
  await db.batch([
    db.prepare(
      'INSERT OR REPLACE INTO coaching_subscriptions(user_id,provider,external_tx_id,product_id,status,trial_used,auto_renew_enabled,expires_at,raw_state_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)'
    ).bind(userId, provider, externalTxId, productId, status, trialUsed, autoRenew, expiresAt, JSON.stringify({ verifiedAt: now, orderId: body?.orderId || null }), now),
    db.prepare('UPDATE coaching_users SET entitlement=?, updated_at=? WHERE user_id=?').bind(nextEnt, now, userId)
  ]);

  const entitlements = await resolveEntitlements(db, s, userId);
  return { verified: true, entitlements };
}

export async function restoreStoreSubscriptions(db, env, s, userId, body = {}) {
  const tokens = Array.isArray(body?.tokens) ? body.tokens : [];
  const provider = (body?.platform === 'apple' || body?.platform === 'ios') ? 'apple' : 'google';
  let restored = false;
  for (const tk of tokens.slice(0, 10)) {
    const row = await db.prepare(
      'SELECT * FROM coaching_subscriptions WHERE provider=? AND external_tx_id=?'
    ).bind(provider, String(tk)).first();
    if (row && row.user_id === userId && ACTIVE_SUB_STATUSES.has(row.status) && row.expires_at > isoNow()) {
      restored = true;
    }
  }
  const entitlements = await resolveEntitlements(db, s, userId);
  if (entitlements.tier === 'pro') restored = true;
  return { restored, entitlements };
}

export async function handleStoreWebhook(db, env, provider, request) {
  const secretHeader = (provider === 'apple' ? env?.APPLE_WEBHOOK_SECRET : env?.GOOGLE_PUBSUB_TOKEN) || env?.STORE_WEBHOOK_SECRET;
  if (secretHeader) {
    const provided = request.headers.get('X-Webhook-Secret') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (provided !== secretHeader) {
      throw createApiError('Store webhook signature or authorization token is invalid.', 401, {
        code: 'WEBHOOK_SIGNATURE_INVALID',
        params: { provider }
      });
    }
  }
  const rawBody = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== 'object') {
    throw createApiError('Request body must be a JSON object.', 400, { code: 'INVALID_REQUEST_BODY' });
  }
  let body = rawBody;
  // Unwrap Google Pub/Sub envelope or Apple signedPayload JWS if provided
  if (provider === 'google' && typeof rawBody?.message?.data === 'string') {
    try { body = JSON.parse(atob(rawBody.message.data)); } catch { /* keep rawBody */ }
  } else if (provider === 'apple' && typeof rawBody?.signedPayload === 'string') {
    const decoded = parseJwsPayload(rawBody.signedPayload);
    if (decoded) body = decoded;
  }

  const now = isoNow();
  const rtdn = body.subscriptionNotification || null;
  const appleData = body.data || null;
  const txId = String(
    body.originalTransactionId || appleData?.originalTransactionId ||
    body.purchaseToken || rtdn?.purchaseToken ||
    body.externalTxId || ''
  ).trim();

  let nextStatus = ['active', 'trialing', 'grace_period', 'cancelled_active', 'expired'].includes(body.status) ? body.status : null;
  let autoRenew = body.autoRenewEnabled == null ? null : (body.autoRenewEnabled ? 1 : 0);

  if (!nextStatus && rtdn?.notificationType != null) {
    const nt = Number(rtdn.notificationType);
    if ([1, 2, 4, 7].includes(nt)) { nextStatus = 'active'; autoRenew ??= 1; }
    else if (nt === 3) { nextStatus = 'cancelled_active'; autoRenew = 0; }
    else if ([5, 6].includes(nt)) { nextStatus = 'grace_period'; }
    else if ([12, 13].includes(nt)) { nextStatus = 'expired'; autoRenew = 0; }
  }
  if (!nextStatus && typeof body.notificationType === 'string') {
    const nt = body.notificationType.toUpperCase();
    if (['SUBSCRIBED', 'DID_RENEW'].includes(nt)) { nextStatus = 'active'; autoRenew ??= 1; }
    else if (nt === 'DID_CHANGE_RENEWAL_STATUS') { nextStatus = 'cancelled_active'; autoRenew = 0; }
    else if (nt === 'DID_FAIL_TO_RENEW') { nextStatus = 'grace_period'; }
    else if (['EXPIRED', 'GRACE_PERIOD_EXPIRED', 'REVOKE', 'REFUND'].includes(nt)) { nextStatus = 'expired'; autoRenew = 0; }
  }

  if (txId && nextStatus) {
    const existing = await db.prepare('SELECT user_id FROM coaching_subscriptions WHERE provider=? AND external_tx_id=?').bind(provider, txId).first();
    if (existing) {
      const nextEnt = ACTIVE_SUB_STATUSES.has(nextStatus) ? 'pro' : 'free';
      const nextExpiresAt = nextStatus === 'expired' ? now : (body.expiresAt || null);
      await db.batch([
        db.prepare('UPDATE coaching_subscriptions SET status=?, expires_at=COALESCE(?,expires_at), auto_renew_enabled=COALESCE(?,auto_renew_enabled), updated_at=? WHERE provider=? AND external_tx_id=?')
          .bind(nextStatus, nextExpiresAt, autoRenew, now, provider, txId),
        db.prepare('UPDATE coaching_users SET entitlement=?, updated_at=? WHERE user_id=?').bind(nextEnt, now, existing.user_id)
      ]);
    }
  }
  return { received: true, provider, processedAt: now };
}

export function isoWeekKeyForDate(dateStr) {
  return isoWeekKey(dateStr);
}
