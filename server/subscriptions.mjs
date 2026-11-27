// Unified Subscription Entitlements, Atomic Free Quotas, StoreKit 2 & Google Play Billing + Webhooks
// Single source of truth: coaching_subscriptions + coaching_usage_quotas + coaching_trial_tombstones.

import { fetchWithTimeout, getGoogleServiceAccountToken, signEs256Jwt } from './external-crypto.mjs';
import { createApiError, logEvent } from './logger.mjs';
import { isoNow, clockNow } from './clock.mjs';
import { localDate } from '../coaching-shared.mjs';

export const FREE_FEATURES = [
  'core_nutrition',
  'core_workouts',
  'offline_sync',
  'arabic_food_search',
  'pantry_finder',
  'ramadan_fasting',
  'safety_recovery_deload',
  'workout_reschedule',
  'injury_safety_swaps',
  'comeback_protocol',
  'custom_recipes',
  'cardio_tracking',
  'cycle_awareness',
  'seasonal_flex',
  'standard_plan_renewals',
  'zero_guilt_reset',
  'open_workout_session',
  'public_challenges',
  'friend_challenges_join',
  'badges_vault_24',
  'private_circles'
];

export const PRO_FEATURES = [
  ...FREE_FEATURES,
  'unlimited_meal_swaps',
  'unlimited_exercise_swaps',
  'unlimited_plan_renewals',
  'grocery_list',
  'barcode_scanner',
  'adaptive_calorie_volume',
  'advanced_analytics',
  'progress_photos_cloud',
  'dining_out_concierge',
  'batch_prep_mode',
  'gentle_spread_rebalance',
  'pro_impact_ledger',
  'clinical_summary_pdf',
  'visual_photo_diff_unlimited',
  'friend_challenges_unlimited',
  'travel_session_override',
  'muscle_heatmap',
  'meal_capture_unlimited',
  'specialist_consultation_unlimited'
];

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'grace_period', 'cancelled_active']);
const KNOWN_SUB_STATUSES = new Set(['active', 'trialing', 'grace_period', 'cancelled_active', 'account_hold', 'paused', 'billing_retry', 'expired']);
export const FREE_LIMITS = {
  dailyMealSwapsLimit: 2,
  weeklyExerciseSwapsLimit: 2,
  barcodeScansDailyLimit: 3,
  dailyBarcodeScansLimit: 3,
  mealCaptureMonthlyLimit: 3,
  mealCaptureStarterLimit: 3,
  specialistConsultationMonthlyLimit: 5,
  photoDiffStarterLimit: 1,
  activeHostedFriendChallengesLimit: 1,
  // Backward-compatible keys
  aiParsesFreeTotal: 3,
  aiCoachMessagesFreeTotal: 5
};

export const PRO_FAIR_USE_LIMITS = Object.freeze({
  meal_capture: { daily: 15, monthly: 300 },
  specialist_consultation: { daily: 40, monthly: 600 },
  photo_diff_analysis: { daily: null, monthly: 4 }
});

function isoWeekKey(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function resolveAppleBundleId(env) {
  return env?.APPLE_BUNDLE_ID || env?.APPLE_CLIENT_ID || env?.APNS_BUNDLE_ID || 'com.curafit.app';
}

async function buildAppleStoreJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  return signEs256Jwt({
    header: { kid: env.APPLE_KEY_ID, typ: 'JWT' },
    payload: {
      iss: env.APPLE_ISSUER_ID,
      iat: now,
      exp: now + 300,
      aud: 'appstoreconnect-v1',
      bid: resolveAppleBundleId(env)
    },
    privateKeyPem: env.APPLE_PRIVATE_KEY
  });
}

async function fetchAppleTransaction(transactionId, env) {
  const jwt = await buildAppleStoreJwt(env);
  const endpoints = [
    `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${encodeURIComponent(transactionId)}`
  ];
  let sawUpstreamFailure = false;
  for (const url of endpoints) {
    let res;
    try {
      res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${jwt}` } });
    } catch {
      sawUpstreamFailure = true;
      continue;
    }
    if (res.ok) {
      const json = await res.json();
      const decoded = parseJwsPayload(json?.signedTransactionInfo);
      if (decoded) return decoded;
    } else if (res.status >= 500 || res.status === 429) {
      sawUpstreamFailure = true;
    }
  }
  if (sawUpstreamFailure) {
    throw createApiError('Subscription verification provider is temporarily unavailable; retry shortly.', 503, {
      code: 'BILLING_VERIFICATION_UNAVAILABLE',
      retryable: true,
      params: { platform: 'apple' }
    });
  }
  throw createApiError('Store subscription receipt could not be verified.', 400, {
    code: 'INVALID_SUBSCRIPTION_RECEIPT',
    params: { platform: 'apple' }
  });
}

async function fetchGoogleSubscriptionV2(purchaseToken, productId, env, shouldAcknowledge = true) {
  const pkg = env.GOOGLE_PLAY_PACKAGE_NAME || 'com.curafit.app';
  const { accessToken } = await getGoogleServiceAccountToken(
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
    'https://www.googleapis.com/auth/androidpublisher'
  );
  const getUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  let res;
  try {
    res = await fetchWithTimeout(getUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw createApiError('Subscription verification provider is temporarily unavailable; retry shortly.', 503, {
      code: 'BILLING_VERIFICATION_UNAVAILABLE',
      retryable: true,
      params: { platform: 'google' }
    });
  }
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      throw createApiError('Subscription verification provider is temporarily unavailable; retry shortly.', 503, {
        code: 'BILLING_VERIFICATION_UNAVAILABLE',
        retryable: true,
        params: { platform: 'google' }
      });
    }
    throw createApiError('Store subscription receipt could not be verified.', 400, {
      code: 'INVALID_SUBSCRIPTION_RECEIPT',
      params: { platform: 'google' }
    });
  }
  const sub = await res.json();
  const lineItem = sub?.lineItems?.[0] || {};
  const resolvedProductId = lineItem.productId || productId;
  if (shouldAcknowledge && sub?.acknowledgementState && sub.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' && resolvedProductId) {
    const ackUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/subscriptions/${encodeURIComponent(resolvedProductId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    await fetchWithTimeout(ackUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(() => {});
  }
  return sub;
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

async function hasTrialTombstone(db, userId) {
  try {
    const hashes = new Set();
    const userRow = await db.prepare('SELECT email FROM coaching_users WHERE user_id=?').bind(userId).first();
    if (userRow?.email) hashes.add(await sha256Hex(`email:${userRow.email.toLowerCase()}`));
    const oauthRows = await db.prepare('SELECT provider, subject FROM coaching_oauth_identities WHERE user_id=?').bind(userId).all();
    for (const r of oauthRows?.results || []) {
      hashes.add(await sha256Hex(`oauth:${r.provider}:${r.subject}`));
    }
    for (const h of hashes) {
      const hit = await db.prepare('SELECT identity_hash FROM coaching_trial_tombstones WHERE identity_hash=?').bind(h).first();
      if (hit) return true;
    }
    return false;
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return false;
    throw e;
  }
}

export async function recordTrialTombstones(db, userId) {
  try {
    const subRows = await db.prepare('SELECT provider, external_tx_id, trial_used FROM coaching_subscriptions WHERE user_id=?').bind(userId).all();
    const list = subRows?.results || [];
    if (!list.length) return 0;
    const now = isoNow();
    const stmts = [];
    const userRow = await db.prepare('SELECT email FROM coaching_users WHERE user_id=?').bind(userId).first();
    if (userRow?.email) {
      const h = await sha256Hex(`email:${userRow.email.toLowerCase()}`);
      stmts.push(db.prepare('INSERT OR IGNORE INTO coaching_trial_tombstones(identity_hash,provider,recorded_at) VALUES(?,?,?)').bind(h, list[0].provider, now));
    }
    const oauthRows = await db.prepare('SELECT provider, subject FROM coaching_oauth_identities WHERE user_id=?').bind(userId).all();
    for (const r of oauthRows?.results || []) {
      const h = await sha256Hex(`oauth:${r.provider}:${r.subject}`);
      stmts.push(db.prepare('INSERT OR IGNORE INTO coaching_trial_tombstones(identity_hash,provider,recorded_at) VALUES(?,?,?)').bind(h, r.provider, now));
    }
    for (const sRow of list) {
      const h = await sha256Hex(`tx:${sRow.provider}:${sRow.external_tx_id}`);
      stmts.push(db.prepare('INSERT OR IGNORE INTO coaching_trial_tombstones(identity_hash,provider,recorded_at) VALUES(?,?,?)').bind(h, sRow.provider, now));
    }
    if (stmts.length) await db.batch(stmts);
    return stmts.length;
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return 0;
    return 0;
  }
}

export async function resolveEntitlements(db, s, userId, todayDate = null, env = null) {
  const tz = s?.profile?.timezone || 'Africa/Cairo';
  const today = todayDate || localDate(clockNow(), tz);
  const weekKey = isoWeekKey(today);

  let sub = null;
  let hasSubRows = false;
  let trialUsedEver = false;
  try {
    const rows = await db.prepare(
      'SELECT * FROM coaching_subscriptions WHERE user_id=? ORDER BY expires_at DESC'
    ).bind(userId).all();
    const list = rows?.results || [];
    hasSubRows = list.length > 0;
    trialUsedEver = list.some(r => Number(r.trial_used) === 1);
    const nowIso = isoNow();
    sub = list.find(r => ACTIVE_SUB_STATUSES.has(r.status) && r.expires_at > nowIso) || list[0] || null;
  } catch (e) {
    if (!/no such table/i.test(e?.message || '')) throw e;
  }

  if (!trialUsedEver) {
    trialUsedEver = await hasTrialTombstone(db, userId);
  }

  const nowIso = isoNow();
  const isProFromSub = Boolean(sub && ACTIVE_SUB_STATUSES.has(sub.status) && sub.expires_at > nowIso);
  // Only fall back to aggregate state when no subscription rows exist in D1 (prevents sticky Pro after downgrade/refund webhooks)
  const isProFromState = !hasSubRows && (s?.entitlements?.tier === 'pro' || s?.entitlements?.tier === 'premium');
  const isPro = isProFromSub || isProFromState;

  const monthKey = today.slice(0, 7);
  const [
    mealSwapsUsed,
    exerciseSwapsUsed,
    barcodeScansUsed,
    mealCaptureMonthUsed,
    mealCaptureDayUsed,
    specialistConsultMonthUsed,
    specialistConsultDayUsed,
    photoDiffLifetimeUsed,
    photoDiffMonthUsed,
    hostedFriendChallengesActive
  ] = await Promise.all([
    getQuotaUsage(db, userId, 'meal_swap', today),
    getQuotaUsage(db, userId, 'exercise_swap', weekKey),
    getQuotaUsage(db, userId, 'barcode_scan', today),
    getQuotaUsage(db, userId, 'meal_capture', monthKey),
    getQuotaUsage(db, userId, 'meal_capture_daily', today),
    getQuotaUsage(db, userId, 'specialist_consultation', monthKey),
    getQuotaUsage(db, userId, 'specialist_consultation_daily', today),
    getQuotaUsage(db, userId, 'photo_diff_analysis', 'lifetime'),
    getQuotaUsage(db, userId, 'photo_diff_analysis', monthKey),
    (async () => {
      try {
        const r = await db.prepare(
          "SELECT COUNT(*) AS n FROM friend_challenges WHERE creator_user_id=? AND status='active' AND end_date>=?"
        ).bind(userId, today).first();
        return Number(r?.n || 0);
      } catch {
        return 0;
      }
    })()
  ]);

  let status = 'none';
  if (isProFromSub) {
    status = sub.status;
  } else if (sub) {
    status = ['account_hold', 'paused', 'billing_retry'].includes(sub.status) ? sub.status : 'expired';
  } else if (isProFromState) {
    status = 'active';
  }

  const provider = sub?.provider || null;
  const playPkg = env?.GOOGLE_PLAY_PACKAGE_NAME || 'com.curafit.app';
  const managementUrl = provider === 'apple'
    ? 'https://apps.apple.com/account/subscriptions'
    : provider === 'google'
      ? (sub?.product_id
        ? `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(sub.product_id)}&package=${encodeURIComponent(playPkg)}`
        : 'https://play.google.com/store/account/subscriptions')
      : null;

  const mealCaptureRemaining = isPro ? null : Math.max(0, FREE_LIMITS.mealCaptureMonthlyLimit - mealCaptureMonthUsed);
  const specialistConsultRemaining = isPro ? null : Math.max(0, FREE_LIMITS.specialistConsultationMonthlyLimit - specialistConsultMonthUsed);
  const barcodeScansRemaining = isPro ? null : Math.max(0, FREE_LIMITS.barcodeScansDailyLimit - barcodeScansUsed);
  const photoDiffRemainingFree = isPro ? null : Math.max(0, FREE_LIMITS.photoDiffStarterLimit - photoDiffLifetimeUsed);
  const hostedFriendChallengesRemaining = isPro ? null : Math.max(0, FREE_LIMITS.activeHostedFriendChallengesLimit - hostedFriendChallengesActive);

  return {
    tier: isPro ? 'pro' : 'free',
    status,
    provider,
    productId: sub?.product_id || null,
    expiresAt: sub?.expires_at || null,
    autoRenewEnabled: sub ? Number(sub.auto_renew_enabled) === 1 : false,
    trialEligible: !trialUsedEver && !isPro,
    isInGracePeriod: status === 'grace_period',
    isOnHold: status === 'account_hold' || status === 'billing_retry',
    isPaused: status === 'paused',
    managementUrl,
    features: isPro ? PRO_FEATURES : FREE_FEATURES,
    quotas: {
      dailyBarcodeScansLimit: isPro ? null : FREE_LIMITS.dailyBarcodeScansLimit,
      dailyBarcodeScansRemaining: barcodeScansRemaining,
      barcodeScansDailyLimit: isPro ? null : FREE_LIMITS.barcodeScansDailyLimit,
      barcodeScansDailyRemaining: barcodeScansRemaining,
      mealCaptureStarterLimit: isPro ? null : FREE_LIMITS.mealCaptureStarterLimit,
      mealCaptureMonthly: isPro
        ? { limit: null, used: mealCaptureMonthUsed, remaining: null, fairUseDailyLimit: PRO_FAIR_USE_LIMITS.meal_capture.daily, fairUseMonthlyLimit: PRO_FAIR_USE_LIMITS.meal_capture.monthly }
        : { limit: FREE_LIMITS.mealCaptureMonthlyLimit, used: mealCaptureMonthUsed, remaining: mealCaptureRemaining },
      specialistConsultationMonthly: isPro
        ? { limit: null, used: specialistConsultMonthUsed, remaining: null, fairUseDailyLimit: PRO_FAIR_USE_LIMITS.specialist_consultation.daily, fairUseMonthlyLimit: PRO_FAIR_USE_LIMITS.specialist_consultation.monthly }
        : { limit: FREE_LIMITS.specialistConsultationMonthlyLimit, used: specialistConsultMonthUsed, remaining: specialistConsultRemaining },
      photoDiffStarterLimit: isPro ? null : FREE_LIMITS.photoDiffStarterLimit,
      photoDiffRemainingFree,
      photoDiffMonthly: isPro
        ? { limit: PRO_FAIR_USE_LIMITS.photo_diff_analysis.monthly, used: photoDiffMonthUsed, remaining: Math.max(0, PRO_FAIR_USE_LIMITS.photo_diff_analysis.monthly - photoDiffMonthUsed) }
        : { limit: FREE_LIMITS.photoDiffStarterLimit, used: photoDiffLifetimeUsed, remaining: photoDiffRemainingFree },
      activeHostedFriendChallengesLimit: isPro ? null : FREE_LIMITS.activeHostedFriendChallengesLimit,
      activeHostedFriendChallengesActive: hostedFriendChallengesActive,
      activeHostedFriendChallengesRemaining: hostedFriendChallengesRemaining,
      fairUseCaps: {
        mealCapture: {
          dailyLimit: PRO_FAIR_USE_LIMITS.meal_capture.daily,
          dailyUsed: mealCaptureDayUsed,
          monthlyLimit: PRO_FAIR_USE_LIMITS.meal_capture.monthly,
          monthlyUsed: mealCaptureMonthUsed
        },
        specialistConsultation: {
          dailyLimit: PRO_FAIR_USE_LIMITS.specialist_consultation.daily,
          dailyUsed: specialistConsultDayUsed,
          monthlyLimit: PRO_FAIR_USE_LIMITS.specialist_consultation.monthly,
          monthlyUsed: specialistConsultMonthUsed
        },
        photoDiffAnalysis: {
          monthlyLimit: PRO_FAIR_USE_LIMITS.photo_diff_analysis.monthly,
          monthlyUsed: photoDiffMonthUsed
        }
      },
      // Backward-compatible quota aliases
      aiParsesRemainingFree: mealCaptureRemaining,
      aiCoachMessagesRemainingFree: specialistConsultRemaining,
      freePlanRenewalsRemaining: null,
      dailyMealSwapsLimit: isPro ? null : FREE_LIMITS.dailyMealSwapsLimit,
      dailyMealSwapsRemaining: isPro ? null : Math.max(0, FREE_LIMITS.dailyMealSwapsLimit - mealSwapsUsed),
      weeklyExerciseSwapsLimit: isPro ? null : FREE_LIMITS.weeklyExerciseSwapsLimit,
      weeklyExerciseSwapsRemaining: isPro ? null : Math.max(0, FREE_LIMITS.weeklyExerciseSwapsLimit - exerciseSwapsUsed)
    },
    updatedAt: sub?.updated_at || s?.entitlements?.updatedAt || null
  };
}

export async function enforceProFairUseCap(db, userId, { feature, quotaKey, today, dailyLimit = null, monthlyLimit = null }) {
  const monthKey = String(today || isoNow().slice(0, 10)).slice(0, 7);
  const dailyKey = `${quotaKey}_daily`;
  const [usedDay, usedMonth] = await Promise.all([
    dailyLimit != null ? getQuotaUsage(db, userId, dailyKey, today) : Promise.resolve(0),
    monthlyLimit != null ? getQuotaUsage(db, userId, quotaKey, monthKey) : Promise.resolve(0)
  ]);
  if (dailyLimit != null && usedDay >= dailyLimit) {
    throw createApiError(
      'You have reached today\'s generous CuraFit Pro fair-use ceiling for this feature. Standard manual, barcode, and catalog tools remain completely unrestricted.',
      429,
      {
        code: 'FAIR_USE_LIMIT_REACHED',
        retryable: true,
        params: { feature, window: 'daily', limit: dailyLimit }
      }
    );
  }
  if (monthlyLimit != null && usedMonth >= monthlyLimit) {
    throw createApiError(
      'You have reached this month\'s generous CuraFit Pro fair-use ceiling for this feature. Standard manual, barcode, and catalog tools remain completely unrestricted.',
      429,
      {
        code: 'FAIR_USE_LIMIT_REACHED',
        retryable: true,
        params: { feature, window: 'monthly', limit: monthlyLimit }
      }
    );
  }
  if (dailyLimit != null) await incrementQuotaUsage(db, userId, dailyKey, today);
  if (monthlyLimit != null) await incrementQuotaUsage(db, userId, quotaKey, monthKey);
  return {
    dailyRemaining: dailyLimit != null ? Math.max(0, dailyLimit - usedDay - 1) : null,
    monthlyRemaining: monthlyLimit != null ? Math.max(0, monthlyLimit - usedMonth - 1) : null
  };
}

export async function consumeFeatureAccess(
  db,
  s,
  userId,
  {
    feature,
    quotaKey,
    today,
    freeWindowKey,
    freeLimit = 0,
    proDailyLimit = null,
    proMonthlyLimit = null,
    enforceEntitlements = true
  },
  env = null
) {
  const ent = await resolveEntitlements(db, s, userId, today, env);
  const monthKey = String(today || isoNow().slice(0, 10)).slice(0, 7);
  if (ent.tier === 'pro') {
    const cap = await enforceProFairUseCap(db, userId, {
      feature,
      quotaKey,
      today,
      dailyLimit: proDailyLimit,
      monthlyLimit: proMonthlyLimit
    });
    return { tier: 'pro', remainingFree: null, ...cap };
  }
  const winKey = freeWindowKey || monthKey;
  const used = await getQuotaUsage(db, userId, quotaKey, winKey);
  if (enforceEntitlements && used >= freeLimit) {
    throw createApiError('This feature requires an active CuraFit Pro subscription.', 402, {
      code: 'PRO_ENTITLEMENT_REQUIRED',
      params: { feature }
    });
  }
  await incrementQuotaUsage(db, userId, quotaKey, winKey);
  if (proDailyLimit != null) {
    await incrementQuotaUsage(db, userId, `${quotaKey}_daily`, today);
  }
  if (winKey !== monthKey && proMonthlyLimit != null) {
    await incrementQuotaUsage(db, userId, quotaKey, monthKey);
  }
  return {
    tier: 'free',
    remainingFree: Math.max(0, freeLimit - used - 1),
    dailyRemaining: null,
    monthlyRemaining: null
  };
}

export async function requireProOrConsumeQuota(db, s, userId, { feature, quotaKey = null, windowKey = 'lifetime', freeLimit = 0 }, env = null) {
  const ent = await resolveEntitlements(db, s, userId, null, env);
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
  let productId = String(body?.productId || '').trim();
  let externalTxId = null;
  let expiresAt = null;
  let status = 'active';
  let trialUsed = 0;
  let autoRenew = 1;

  // Cross-store double-billing guard: prevent subscribing on a second store while Pro is already active on the first (referral bonus passes excluded)
  const nowIso = isoNow();
  try {
    const otherActive = await db.prepare(
      "SELECT provider, status, expires_at FROM coaching_subscriptions WHERE user_id=? AND provider!=? AND provider!='referral' ORDER BY expires_at DESC LIMIT 1"
    ).bind(userId, provider).first();
    if (otherActive && ACTIVE_SUB_STATUSES.has(otherActive.status) && otherActive.expires_at > nowIso) {
      throw createApiError(
        `You already have an active Pro subscription on ${otherActive.provider}; manage or cancel it there before subscribing on ${provider}.`,
        409,
        {
          code: 'ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM',
          params: { activeProvider: otherActive.provider, requestedProvider: provider }
        }
      );
    }
  } catch (e) {
    if (e?.code === 'ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM') throw e;
    if (!/no such table/i.test(e?.message || '')) throw e;
  }

  if (provider === 'apple') {
    const jws = body?.signedTransactionJws || body?.signedTransactionInfo;
    let parsed = jws ? parseJwsPayload(jws) : null;
    const rawTxId = parsed?.transactionId || body?.transactionId;
    if (!parsed && !rawTxId) {
      throw createApiError('Store subscription receipt could not be verified.', 400, {
        code: 'INVALID_SUBSCRIPTION_RECEIPT',
        params: { platform: 'apple' }
      });
    }
    if (env?.APPLE_ISSUER_ID && env?.APPLE_KEY_ID && env?.APPLE_PRIVATE_KEY) {
      if (!rawTxId) {
        throw createApiError('Store subscription receipt could not be verified.', 400, {
          code: 'INVALID_SUBSCRIPTION_RECEIPT',
          params: { platform: 'apple' }
        });
      }
      parsed = await fetchAppleTransaction(String(rawTxId), env);
    } else if (env?.STRICT_STORE_VERIFICATION === 'true') {
      throw createApiError('Apple App Store Server API credentials are not configured.', 503, { code: 'SERVICE_UNAVAILABLE', retryable: true });
    }
    const expectedBundleId = env?.APPLE_BUNDLE_ID || env?.APPLE_CLIENT_ID;
    if (expectedBundleId && parsed?.bundleId && parsed.bundleId !== expectedBundleId) {
      throw createApiError('Store subscription receipt could not be verified.', 400, {
        code: 'INVALID_SUBSCRIPTION_RECEIPT',
        params: { platform: 'apple' }
      });
    }
    externalTxId = String(parsed?.originalTransactionId || parsed?.transactionId || body.transactionId).trim();
    if (!productId && parsed?.productId) productId = String(parsed.productId);
    const expMs = Number(parsed?.expiresDate || (Date.now() + 30 * 86400000));
    expiresAt = new Date(expMs).toISOString();
    if (parsed?.offerType === 1 || body?.isTrial === true) { status = 'trialing'; trialUsed = 1; }
    if (parsed?.revocationDate || expMs <= Date.now()) status = 'expired';
  } else {
    const purchaseToken = String(body?.purchaseToken || '').trim();
    if (!purchaseToken || purchaseToken.length < 10) {
      throw createApiError('Store subscription receipt could not be verified.', 400, {
        code: 'INVALID_SUBSCRIPTION_RECEIPT',
        params: { platform: 'google' }
      });
    }
    externalTxId = purchaseToken;
    if (env?.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
      const gSub = await fetchGoogleSubscriptionV2(purchaseToken, productId, env, true);
      const item = gSub?.lineItems?.[0] || {};
      if (item.productId) productId = item.productId;
      expiresAt = item.expiryTime || new Date(Date.now() + 30 * 86400000).toISOString();
      autoRenew = item.autoRenewingPlan?.autoRenewEnabled === false ? 0 : 1;
      const gState = String(gSub?.subscriptionState || '');
      if (gState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') status = 'grace_period';
      else if (gState === 'SUBSCRIPTION_STATE_ON_HOLD') status = 'account_hold';
      else if (gState === 'SUBSCRIPTION_STATE_PAUSED') status = 'paused';
      else if (gState === 'SUBSCRIPTION_STATE_CANCELED') { status = expiresAt > nowIso ? 'cancelled_active' : 'expired'; autoRenew = 0; }
      else if (gState === 'SUBSCRIPTION_STATE_EXPIRED' || expiresAt <= nowIso) status = 'expired';
      else status = body?.isTrial === true ? 'trialing' : 'active';
      if (status === 'trialing' || body?.isTrial === true) trialUsed = 1;
    } else if (env?.STRICT_STORE_VERIFICATION === 'true') {
      throw createApiError('Google Play Billing API credentials are not configured.', 503, { code: 'SERVICE_UNAVAILABLE', retryable: true });
    } else {
      const expMs = Number(body?.expiresAtMs || (Date.now() + 30 * 86400000));
      expiresAt = new Date(expMs).toISOString();
      if (body?.isTrial === true) { status = 'trialing'; trialUsed = 1; }
      if (expMs <= Date.now()) status = 'expired';
    }
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
  const stmts = [
    db.prepare(
      'INSERT OR REPLACE INTO coaching_subscriptions(user_id,provider,external_tx_id,product_id,status,trial_used,auto_renew_enabled,expires_at,raw_state_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)'
    ).bind(userId, provider, externalTxId, productId, status, trialUsed, autoRenew, expiresAt, JSON.stringify({ verifiedAt: now, orderId: body?.orderId || null }), now),
    db.prepare('UPDATE coaching_users SET entitlement=?, updated_at=? WHERE user_id=?').bind(nextEnt, now, userId)
  ];
  await db.batch(stmts);
  if (trialUsed === 1) await recordTrialTombstones(db, userId);

  const entitlements = await resolveEntitlements(db, s, userId, null, env);
  return { verified: true, entitlements };
}

export async function restoreStoreSubscriptions(db, env, s, userId, body = {}) {
  const tokens = Array.isArray(body?.tokens) ? body.tokens : [];
  const provider = (body?.platform === 'apple' || body?.platform === 'ios' || body?.provider === 'apple') ? 'apple' : 'google';
  let restored = false;
  for (const rawItem of tokens.slice(0, 10)) {
    const tk = typeof rawItem === 'string' ? rawItem : String(rawItem?.purchaseToken || rawItem?.transactionId || rawItem?.signedTransactionJws || rawItem?.signedTransactionInfo || '').trim();
    if (!tk) continue;
    const jwsParsed = provider === 'apple' && tk.includes('.') ? parseJwsPayload(tk) : null;
    const txLookup = String(jwsParsed?.originalTransactionId || jwsParsed?.transactionId || tk).trim();
    const row = await db.prepare(
      'SELECT * FROM coaching_subscriptions WHERE provider=? AND external_tx_id=?'
    ).bind(provider, txLookup).first();
    if (row && row.user_id !== userId) {
      throw createApiError('This store subscription is already linked to a different CuraFit account.', 409, {
        code: 'SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT'
      });
    }
    if (row && row.user_id === userId && ACTIVE_SUB_STATUSES.has(row.status) && row.expires_at > isoNow()) {
      restored = true;
    } else if (!row && typeof rawItem === 'object' && rawItem?.productId) {
      // Allow re-verifying a paid store receipt on a newly created account (e.g. after GDPR deletion)
      const verified = await verifyStoreSubscription(db, env, s, userId, { ...rawItem, platform: provider });
      if (verified.entitlements.tier === 'pro') restored = true;
    }
  }
  const entitlements = await resolveEntitlements(db, s, userId, null, env);
  if (entitlements.tier === 'pro') restored = true;
  return { restored, entitlements };
}

export async function handleStoreWebhook(db, env, provider, request) {
  const secretHeader = (provider === 'apple' ? env?.APPLE_WEBHOOK_SECRET : env?.GOOGLE_PUBSUB_TOKEN) || env?.STORE_WEBHOOK_SECRET;
  if (secretHeader || env?.STRICT_STORE_VERIFICATION === 'true') {
    const provided = request.headers.get('X-Webhook-Secret') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!secretHeader || provided !== secretHeader) {
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
  // Unwrap Google Pub/Sub envelope or Apple signedPayload JWS (and nested v2 signedTransactionInfo / signedRenewalInfo)
  if (provider === 'google' && typeof rawBody?.message?.data === 'string') {
    try { body = JSON.parse(atob(rawBody.message.data)); } catch { /* keep rawBody */ }
  } else if (provider === 'apple' && typeof rawBody?.signedPayload === 'string') {
    const decoded = parseJwsPayload(rawBody.signedPayload);
    if (decoded) body = decoded;
  }

  const now = isoNow();
  const rtdn = body.subscriptionNotification || null;
  const appleData = body.data || null;
  const appleTx = appleData?.signedTransactionInfo ? parseJwsPayload(appleData.signedTransactionInfo) : null;
  const appleRenewal = appleData?.signedRenewalInfo ? parseJwsPayload(appleData.signedRenewalInfo) : null;

  const txId = String(
    appleTx?.originalTransactionId || body.originalTransactionId || appleData?.originalTransactionId ||
    body.purchaseToken || rtdn?.purchaseToken ||
    body.externalTxId || ''
  ).trim();

  let nextStatus = KNOWN_SUB_STATUSES.has(body.status) ? body.status : null;
  let autoRenew = body.autoRenewEnabled == null ? null : (body.autoRenewEnabled ? 1 : 0);
  let nextProductId = appleRenewal?.autoRenewProductId || appleTx?.productId || rtdn?.subscriptionId || body.productId || null;
  let nextExpiresAt = appleTx?.expiresDate ? new Date(Number(appleTx.expiresDate)).toISOString() : (body.expiresAt || null);

  // Google Play RTDN notificationType mapping
  if (!nextStatus && rtdn?.notificationType != null) {
    const nt = Number(rtdn.notificationType);
    if ([1, 2, 4, 7].includes(nt)) { nextStatus = 'active'; autoRenew ??= 1; }
    else if (nt === 3) { nextStatus = 'cancelled_active'; autoRenew = 0; }
    else if (nt === 5) { nextStatus = 'account_hold'; }
    else if (nt === 6) { nextStatus = 'grace_period'; }
    else if (nt === 10) { nextStatus = 'paused'; }
    else if ([12, 13].includes(nt)) { nextStatus = 'expired'; autoRenew = 0; }
    // Refresh authoritative expiryTime from Google Play API when configured
    if (txId && env?.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
      try {
        const gSub = await fetchGoogleSubscriptionV2(txId, nextProductId, env, false);
        const item = gSub?.lineItems?.[0] || {};
        if (item.expiryTime) nextExpiresAt = item.expiryTime;
        if (item.productId) nextProductId = item.productId;
      } catch (err) {
        logEvent('warn', 'google_rtdn_refresh_failed', { details: { message: err?.message } });
      }
    }
  }

  // Apple App Store Server Notifications v2 notificationType + subtype mapping
  if (!nextStatus && typeof body.notificationType === 'string') {
    const nt = body.notificationType.toUpperCase();
    const subtype = String(body.subtype || '').toUpperCase();
    if (['SUBSCRIBED', 'DID_RENEW'].includes(nt)) {
      nextStatus = 'active';
      autoRenew ??= 1;
    } else if (nt === 'DID_CHANGE_RENEWAL_STATUS') {
      if (subtype === 'AUTO_RENEW_ENABLED') { nextStatus = 'active'; autoRenew = 1; }
      else { nextStatus = 'cancelled_active'; autoRenew = 0; }
    } else if (nt === 'DID_CHANGE_RENEWAL_PREF') {
      nextStatus = 'active';
      autoRenew ??= 1;
    } else if (nt === 'DID_FAIL_TO_RENEW') {
      nextStatus = subtype === 'GRACE_PERIOD' ? 'grace_period' : 'billing_retry';
    } else if (['EXPIRED', 'GRACE_PERIOD_EXPIRED', 'REVOKE', 'REFUND'].includes(nt)) {
      nextStatus = 'expired';
      autoRenew = 0;
    }
  }

  if (txId && nextStatus) {
    const existing = await db.prepare('SELECT user_id, product_id, expires_at FROM coaching_subscriptions WHERE provider=? AND external_tx_id=?').bind(provider, txId).first();
    if (existing) {
      const nextEnt = ACTIVE_SUB_STATUSES.has(nextStatus) ? 'pro' : 'free';
      if (nextStatus === 'expired') {
        nextExpiresAt = now;
      } else if (nextStatus === 'active' && !nextExpiresAt && existing.expires_at <= now) {
        const isAnnual = String(nextProductId || existing.product_id || '').includes('annual');
        nextExpiresAt = new Date(Date.now() + (isAnnual ? 365 : 30) * 86400000).toISOString();
      }
      await db.batch([
        db.prepare('UPDATE coaching_subscriptions SET status=?, product_id=COALESCE(?,product_id), expires_at=COALESCE(?,expires_at), auto_renew_enabled=COALESCE(?,auto_renew_enabled), updated_at=? WHERE provider=? AND external_tx_id=?')
          .bind(nextStatus, nextProductId, nextExpiresAt, autoRenew, now, provider, txId),
        db.prepare('UPDATE coaching_users SET entitlement=?, updated_at=? WHERE user_id=?').bind(nextEnt, now, existing.user_id)
      ]);
    }
  }
  return { received: true, provider, processedAt: now };
}

export function isoWeekKeyForDate(dateStr) {
  return isoWeekKey(dateStr);
}
