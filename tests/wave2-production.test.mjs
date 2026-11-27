import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';
import { runScheduledNotifications } from '../server/push.mjs';
import { MUSCLE_REGIONS } from '../coaching-shared.mjs';

const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;

const TEST_ENV = {
  AUTH_JWT_SECRET: 'wave2-production-test-secret-key-256-bits',
  AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
  RATE_LIMIT_PER_MINUTE: '500',
  OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
  MIN_ANDROID_VERSION: '1.0.0',
  MIN_IOS_VERSION: '1.0.0',
  LATEST_ANDROID_VERSION: '1.2.0',
  LATEST_IOS_VERSION: '1.2.0',
};

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createOidcSigner(kid = 'wave2-k1') {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  pubJwk.kid = kid;
  pubJwk.use = 'sig';
  pubJwk.alg = 'RS256';
  const signJwt = async payload => {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const body = b64url(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${header}.${body}`));
    return `${header}.${body}.${b64url(sig)}`;
  };
  return { jwksJson: JSON.stringify({ keys: [pubJwk] }), signJwt };
}

test('Backend Wave 2: End-to-End Verification (KAN-116, 119, 121, 123, 120, 124, 61, 84, 122, 102)', async t => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    r2Buckets: ['CURAFIT_MEDIA_BUCKET'],
    bindings: TEST_ENV,
  });

  try {
    const db = await mf.getD1Database('DB');
    const bucket = await mf.getR2Bucket('CURAFIT_MEDIA_BUCKET');
    await migrateLocal(db);
    const signer = await createOidcSigner('wave2-google-k1');

    const call = async (path, opts = {}, envExtra = {}) => {
      const env = {
        ...TEST_ENV,
        OAUTH_GOOGLE_JWKS_JSON: signer.jwksJson,
        CURAFIT_MEDIA_BUCKET: bucket,
        ...envExtra,
        DB: db,
      };
      const req = new Request(`https://curafit-api-dev.egypt-nutrition-coach.workers.dev${path}`, opts);
      return await cloudflareEntry.fetch(req, env, { waitUntil() {} });
    };

    const okJson = async (res, expectedStatus = 200) => {
      const body = await res.json();
      assert.equal(res.status, expectedStatus, `Expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.ok, true);
      return body.data;
    };

    const errJson = async (res, expectedStatus, expectedCode) => {
      const body = await res.json();
      assert.equal(res.status, expectedStatus, `Expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(body)}`);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, expectedCode);
      assert.ok(!FORBIDDEN_VOICE_RE.test(body.error.message), `Error leaked forbidden wording: ${body.error.message}`);
      return body.error;
    };

    let userSeq = 0;
    const createUser = async (name, deviceId = null, profileDraft = null) => {
      userSeq++;
      const nowSec = Math.floor(Date.now() / 1000);
      const idToken = await signer.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: `wave2-sub-${userSeq}-${crypto.randomUUID().slice(0, 6)}`,
        email: `wave2.user${userSeq}@curafit.app`,
        email_verified: true,
        name,
        iat: nowSec,
        exp: nowSec + 3600,
      });
      const reg = await okJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, name, deviceId: deviceId || `dev-w2-${userSeq}` }),
      }), 201);
      const u = {
        userId: reg.user.userId,
        token: reg.accessToken,
        headers: { Authorization: `Bearer ${reg.accessToken}`, 'Content-Type': 'application/json' },
        rev: 0,
      };
      if (profileDraft) {
        const gen = await okJson(await call('/v1/commands', {
          method: 'POST',
          headers: { ...u.headers, 'Idempotency-Key': `gen-${u.userId}` },
          body: JSON.stringify({ revision: u.rev, action: 'generate', payload: { name, ...profileDraft } }),
        }));
        u.rev = gen.revision;
        u.state = gen;
      }
      return u;
    };

    const cmd = async (u, action, payload, envExtra = {}, minimal = false) => {
      const path = minimal ? '/v1/commands?view=receipt' : '/v1/commands';
      const res = await call(path, {
        method: 'POST',
        headers: { ...u.headers, 'Idempotency-Key': `cmd-${action}-${crypto.randomUUID()}` },
        body: JSON.stringify({ revision: u.rev, action, payload }),
      }, envExtra);
      if (res.ok) {
        const clone = res.clone();
        const parsed = await clone.json();
        if (parsed?.data?.revision != null) u.rev = parsed.data.revision;
      }
      return res;
    };

    const grantPro = async (userId) => {
      const exp = new Date(Date.now() + 30 * 86400000).toISOString();
      const nowIso = new Date().toISOString();
      await db.batch([
        db.prepare(
          "INSERT OR REPLACE INTO coaching_subscriptions(user_id,provider,external_tx_id,product_id,status,trial_used,auto_renew_enabled,expires_at,raw_state_json,updated_at) VALUES(?,'google',?,'curafit_pro.monthly','active',1,1,?,'{}',?)"
        ).bind(userId, `tx-pro-${userId}`, exp, nowIso),
        db.prepare("UPDATE coaching_users SET entitlement='pro', updated_at=? WHERE user_id=?").bind(nowIso, userId),
      ]);
    };

    const baseDraft = {
      age: 30,
      sex: 'male',
      weight: 82,
      height: 178,
      goal: 'lose',
      targetWeight: 75,
      activity: 'moderate',
      dietType: 'balanced',
      serviceTrack: 'nutrition_and_workouts',
      selectedWorkoutDays: [1, 3, 5],
      healthConfirmed: true,
      timezone: 'Africa/Cairo',
      locale: 'ar-EG',
    };

    // 1. D1 Migration 0007 + MENA Supermarket Barcode Seed + Capabilities (KAN-116)
    await t.test('KAN-116: D1 0007 MENA barcode seed (>= 300 SKUs), capabilities version fields, and bootstrap Wave 2 fields', async () => {
      const countRow = await db.prepare("SELECT COUNT(*) AS n FROM food_barcodes WHERE provenance='verified_brand'").first();
      assert.ok(Number(countRow?.n || 0) >= 300, `Expected >= 300 seeded MENA barcode SKUs, got ${countRow?.n}`);
      const sampleRow = await db.prepare("SELECT barcode, name_en FROM food_barcodes WHERE provenance='verified_brand' LIMIT 1").first();
      assert.ok(sampleRow?.barcode);

      const caps = await okJson(await call('/v1/capabilities'));
      assert.equal(caps.minAndroidVersion, '1.0.0');
      assert.equal(caps.latestAndroidVersion, '1.2.0');
      assert.equal(caps.latestIosVersion, '1.2.0');
      assert.deepEqual(caps.deferredFeatures, []);
      for (const flag of ['meal_capture', 'specialist_consultation', 'dining_out_concierge', 'batch_prep_mode', 'pro_impact', 'public_challenges', 'friend_challenges', 'private_circles', 'badges_vault_24', 'travel_session_override', 'muscle_heatmap', 'visual_photo_diff']) {
        assert.ok(caps.features.includes(flag), `Missing capability flag: ${flag}`);
      }

      const u = await createUser('Karim Hassan', 'dev-kan116', baseDraft);
      const bc = await okJson(await call(`/v1/foods/barcode/${sampleRow.barcode}`, { headers: u.headers }));
      assert.equal(bc.barcode, sampleRow.barcode);
      assert.equal(bc.provenance, 'verified_brand');

      // dashboardDensity persistence + validation
      await errJson(await cmd(u, 'profile_update', { dashboardDensity: 'ultra' }), 400, 'VALIDATION_ERROR');
      await okJson(await cmd(u, 'profile_update', { dashboardDensity: 'pro' }));

      const boot = await okJson(await call('/v1/bootstrap', { headers: u.headers }));
      assert.equal(boot.profile.serviceTrack, 'nutrition_and_workouts');
      assert.equal(boot.preferences.dashboardDensity, 'pro');
      assert.equal(typeof boot.todaySummary.eidFlexActive, 'boolean');
      assert.ok('cycleState' in boot);
      assert.ok(Array.isArray(boot.newlyUnlockedBadges));
      assert.equal(boot.entitlements.quotas.dailyBarcodeScansLimit, 3);
      assert.equal(boot.entitlements.quotas.mealCaptureStarterLimit, 3);
      assert.equal(boot.entitlements.quotas.specialistConsultationMonthly.limit, 5);
      assert.equal(boot.entitlements.quotas.specialistConsultationMonthly.remaining, 5);
      assert.equal(boot.entitlements.quotas.photoDiffStarterLimit, 1);
      assert.equal(boot.entitlements.quotas.activeHostedFriendChallengesLimit, 1);
      assert.equal(boot.entitlements.quotas.fairUseCaps.mealCapture.dailyLimit, 15);
      assert.equal(boot.entitlements.quotas.fairUseCaps.mealCapture.monthlyLimit, 300);
      assert.equal(boot.entitlements.quotas.fairUseCaps.specialistConsultation.dailyLimit, 40);
      assert.equal(boot.entitlements.quotas.fairUseCaps.specialistConsultation.monthlyLimit, 600);
      assert.equal(boot.entitlements.quotas.fairUseCaps.photoDiffAnalysis.monthlyLimit, 4);
    });

    // 2. KAN-119: Dining-Out Concierge, Batch Meal Prep Mode & Post-Feast Zero-Guilt Rebalance
    await t.test('KAN-119: Dining-out clinical/allergen filtering, Free vs Pro gating, batchPrepMode & post_feast_rebalance', async () => {
      const u = await createUser('Nadia Adel', 'dev-kan119', {
        ...baseDraft,
        sex: 'female',
        weight: 66,
        height: 165,
        targetWeight: 61,
        diseases: ['hypertension'],
        excludedGroups: ['nuts'],
        batchPrepMode: true,
      });

      // Batch prep repeats lunch & dinner across 2-3 day blocks and exposes consolidated grocery list
      const activePlanId = u.state.active_plan_id;
      const plan = await okJson(await call(`/v1/plans/${activePlanId}`, { headers: u.headers }));
      assert.equal(plan.batchPrepMode, true);
      assert.ok(Array.isArray(plan.batchPrepBlocks) && plan.batchPrepBlocks.length === 6);
      assert.ok((plan.targets?.noteCodes || []).includes('BATCH_PREP_MODE_ACTIVE'));
      const d0Lunch = plan.days[0].meals.find(m => m.slot === 'lunch')?.snapshot?.template_id;
      const d1Lunch = plan.days[1].meals.find(m => m.slot === 'lunch')?.snapshot?.template_id;
      assert.equal(d0Lunch, d1Lunch, 'Batch prep should repeat lunch across days 0..2');

      const grocery = await okJson(await call(`/v1/plans/${activePlanId}/grocery-list?preview=true`, { headers: u.headers }));
      assert.equal(grocery.batchPrepMode, true);
      assert.ok(grocery.batchConsolidatedCount > 0);

      // Dining-out options: Free sees 1 preview option when enforced; Pro sees up to 3, all low-sodium & nut-free
      const freeDining = await okJson(await call('/v1/nutrition/dining-out-options?category=cafe', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(freeDining.previewOnly, true);
      assert.equal(freeDining.options.length, 1);

      await grantPro(u.userId);
      const proDining = await okJson(await call('/v1/nutrition/dining-out-options?category=cafe', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(proDining.previewOnly, false);
      assert.ok(proDining.options.length >= 2 && proDining.options.length <= 3);
      for (const opt of proDining.options) {
        assert.equal(opt.clinicalSafe, true);
        assert.ok(opt.sodiumMg <= 720, `Hypertension dish exceeded sodium ceiling: ${opt.id}`);
        assert.notEqual(opt.id, 'cafe_hummus_crudites_oat_latte', 'Nut-allergy dish must be excluded');
      }

      // Log dining-out option via REST with rebalanceRestOfDay
      const logged = await okJson(await call('/v1/nutrition/dining-out-log', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ optionId: proDining.options[0].id, slot: 'dinner', rebalanceRestOfDay: true }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 201);
      u.rev = logged.revision;
      assert.equal(logged.restOfDayRebalance.applied, true);

      // Post-feast zero_guilt_reset is ALWAYS Free (test with another Free user)
      const freeUser = await createUser('Tarek Free', 'dev-kan119-free', baseDraft);
      const resetRes = await okJson(await cmd(freeUser, 'post_feast_rebalance', { mode: 'zero_guilt_reset', excessKcal: 650 }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.ok(Array.isArray(resetRes.flexDates) && resetRes.flexDates.length >= 1);
      assert.equal(resetRes.flexEvents.at(-1).kind, 'flex_event');

      // gentle_spread requires Pro
      await errJson(await cmd(freeUser, 'post_feast_rebalance', { mode: 'gentle_spread', excessKcal: 600 }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 402, 'PRO_ENTITLEMENT_REQUIRED');

      // gentle_spread succeeds for Pro healthy user
      const spreadRes = await okJson(await cmd(u, 'post_feast_rebalance', { mode: 'gentle_spread', excessKcal: 600 }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(spreadRes.postFeastSpread.mode, 'gentle_spread');
      assert.ok(spreadRes.postFeastSpread.dailyReductionKcal >= 75 && spreadRes.postFeastSpread.dailyReductionKcal <= 100);

      // Clinical block: pregnant user cannot use gentle_spread (409 REBALANCE_BLOCKED_CLINICAL)
      const pregUser = await createUser('Salma Mom', 'dev-kan119-preg', {
        ...baseDraft,
        sex: 'female',
        weight: 65,
        height: 165,
        goal: 'maintain',
        targetWeight: null,
        maternalStatus: 'pregnant_t2',
        serviceTrack: 'nutrition_only',
      });
      await grantPro(pregUser.userId);
      await errJson(await cmd(pregUser, 'post_feast_rebalance', { mode: 'gentle_spread', excessKcal: 500 }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 409, 'REBALANCE_BLOCKED_CLINICAL');
    });

    // 3. KAN-121: Pro Impact Ledger, Pause Plan (streak/push protection + disclosure) & Clinical Summary
    await t.test('KAN-121: pro-impact ledger, pause_14d streak & push suppression, and Pro-gated clinical summary', async () => {
      const u = await createUser('Hossam Sami', 'dev-kan121', {
        ...baseDraft,
        diseases: ['diabetes_t2'],
        injuries: ['knee'],
      });

      // Clinical summary is Pro-gated
      await errJson(await call('/v1/account/clinical-summary?periodDays=30&locale=ar', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 402, 'PRO_ENTITLEMENT_REQUIRED');

      // Pro Impact ledger works cleanly
      const impact = await okJson(await call('/v1/progress/pro-impact', { headers: u.headers }));
      assert.ok(impact.cycleDays >= 1);
      assert.equal(typeof impact.estimatedMinutesSaved, 'number');
      assert.equal(typeof impact.calibrationsApplied, 'number');

      // Pause plan (14d) + mandatory store billing disclosure + push suppression
      await okJson(await call('/v1/devices/push-token', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ deviceId: 'dev-kan121', platform: 'android', token: 'fcm-token-kan121', timezone: 'UTC', locale: 'ar-EG' }),
      }));
      const pauseRes = await okJson(await call('/v1/subscriptions/retention-intent', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ intent: 'pause_14d', reasonCode: 'traveling' }),
      }));
      u.rev = pauseRes.revision;
      assert.equal(pauseRes.coachingPaused, true);
      assert.ok(pauseRes.pauseUntil);
      assert.equal(pauseRes.billingDisclosureCode, 'STORE_BILLING_MANAGED_BY_PLATFORM');
      assert.ok(!FORBIDDEN_VOICE_RE.test(pauseRes.billingDisclosureEn));

      // Verify push cron suppresses streak_saver_evening while coachingPause is active
      const todayIso = new Date().toISOString().slice(0, 10);
      const eveningUtc = Date.parse(`${todayIso}T19:00:00Z`);
      const cronPaused = await runScheduledNotifications({ DB: db }, eveningUtc);
      assert.equal(cronPaused.queued, 0, 'Active coachingPause must suppress evening streak saver pushes');

      // Grant Pro -> Clinical Summary returns full structured physician DTO
      await grantPro(u.userId);
      const summary = await okJson(await call('/v1/account/clinical-summary?periodDays=30&locale=ar', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(summary.periodDays, 30);
      assert.equal(summary.disclaimerCode, 'CLINICAL_SUMMARY_INFORMATIONAL_ONLY');
      assert.ok(summary.clinicalGuardrails.some(g => g.condition === 'diabetes_t2'));
      assert.ok(summary.activeInjuries.some(i => i.injuryId === 'knee_pain'));
    });

    // 4. KAN-123 & KAN-120: 24-Badge Vault, Public & Friend Challenges, Private Circles, Referrals & Widget Active Challenge
    await t.test('KAN-123 & KAN-120: 24 badges, track filtering, public/friend challenges, zero-PII circles, and anti-abuse referrals', async () => {
      const host = await createUser('Omar Host', 'dev-host-1', baseDraft);
      const friend = await createUser('Laila NutritionOnly', 'dev-friend-2', {
        ...baseDraft,
        sex: 'female',
        weight: 62,
        height: 166,
        targetWeight: 58,
        serviceTrack: 'nutrition_only',
      });

      // Badges vault: 24 total registry badges, track-aware visibility
      const hostBadges = await okJson(await call('/v1/badges', { headers: host.headers }));
      assert.equal(hostBadges.summary.totalRegistryCount, 24);
      assert.equal(hostBadges.masteryRank.tier, 'initiate');

      const friendBadges = await okJson(await call('/v1/badges', { headers: friend.headers }));
      assert.ok(!friendBadges.visibleBadges.some(b => b.badgeId === 'WORKOUT_WARRIOR_3X'), 'nutrition_only must hide strength badges');

      // Ack endpoint succeeds cleanly
      const ackRes = await okJson(await call('/v1/badges/ack', { method: 'POST', headers: host.headers, body: JSON.stringify({}) }));
      assert.ok(ackRes.acknowledgedAt);

      // Public challenges: clinical/track filtering (nutrition_only should NOT see strength challenge, and direct join returns 403)
      const friendPub = await okJson(await call('/v1/challenges/public', { headers: friend.headers }));
      assert.ok(!friendPub.items.some(c => c.id === 'chg_iron_club_12'));
      await errJson(await call('/v1/challenges/chg_iron_club_12/join', { method: 'POST', headers: friend.headers, body: '{}' }), 403, 'CHALLENGE_INELIGIBLE_CLINICAL');

      // Host joins hydration public challenge -> verified progress & widget activeChallenge!
      await okJson(await cmd(host, 'water', { cups: 12 }));
      await okJson(await call('/v1/challenges/chg_hydration_7d/join', { method: 'POST', headers: host.headers, body: JSON.stringify({ pin: true }) }), 201);
      const pubProg = await okJson(await call('/v1/challenges/chg_hydration_7d/progress', { headers: host.headers }));
      assert.ok(pubProg.progressValue >= 1);
      assert.ok(pubProg.cohortPercentile >= 1 && pubProg.cohortPercentile <= 100);

      // Widget snapshot reflects activeChallenge + streakFreezeAvailable
      const widget = await okJson(await call('/v1/widgets/snapshot', { headers: host.headers }));
      assert.equal(typeof widget.streakFreezeAvailable, 'boolean');
      assert.equal(widget.activeChallenge.id, 'chg_hydration_7d');
      assert.equal(widget.activeChallenge.kind, 'public');

      // Friend Challenges: Free user hosts 1 active challenge -> 2nd blocked with 402
      const fc1 = await okJson(await call('/v1/challenges/friends', {
        method: 'POST',
        headers: host.headers,
        body: JSON.stringify({ title: 'Ramadan Prep Squad', metricType: 'all_round', durationDays: 14 }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 201);
      assert.ok(fc1.inviteCode);
      await errJson(await call('/v1/challenges/friends', {
        method: 'POST',
        headers: host.headers,
        body: JSON.stringify({ title: 'Second Hosted Challenge', metricType: 'hydration', durationDays: 7 }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 402, 'PRO_ENTITLEMENT_REQUIRED');

      // Friend joins -> zero-PII detail + cheer rate limit (3/day -> 4th 429)
      await okJson(await call('/v1/challenges/friends/join', {
        method: 'POST',
        headers: friend.headers,
        body: JSON.stringify({ inviteCode: fc1.inviteCode }),
      }));
      await okJson(await cmd(friend, 'water', { cups: 10 }));
      const fcDetail = await okJson(await call(`/v1/challenges/friends/${fc1.id}`, { headers: host.headers }));
      assert.equal(fcDetail.members.length, 2);
      const serializedDetail = JSON.stringify(fcDetail.members);
      for (const forbiddenKey of ['"weight"', '"calories"', '"energy"', '"bmi"', '"diseases"', '"injuries"', '"cycleState"']) {
        assert.ok(!serializedDetail.includes(forbiddenKey), `Friend challenge leaked PII field: ${forbiddenKey}`);
      }
      for (let i = 0; i < 3; i++) {
        await okJson(await call(`/v1/challenges/friends/${fc1.id}/cheer`, {
          method: 'POST',
          headers: host.headers,
          body: JSON.stringify({ targetUserId: friend.userId, reactionCode: 'cheer' }),
        }));
      }
      await errJson(await call(`/v1/challenges/friends/${fc1.id}/cheer`, {
        method: 'POST',
        headers: host.headers,
        body: JSON.stringify({ targetUserId: friend.userId, reactionCode: 'clap' }),
      }), 429, 'CHEER_RATE_LIMITED');

      // Private Accountability Circles (strict zero-PII binary todaySignals)
      const circle = await okJson(await call('/v1/circles', {
        method: 'POST',
        headers: host.headers,
        body: JSON.stringify({ name: 'Family Accountability' }),
      }), 201);
      await okJson(await call('/v1/circles/join', {
        method: 'POST',
        headers: friend.headers,
        body: JSON.stringify({ inviteCode: circle.inviteCode }),
      }));
      const feed = await okJson(await call(`/v1/circles/${circle.id}/feed`, { headers: host.headers }));
      assert.equal(feed.members.length, 2);
      const m0 = feed.members[0];
      assert.deepEqual(Object.keys(m0.todaySignals).sort(), ['hydrationDone', 'mealLogged', 'streakActive', 'workoutDone']);
      assert.equal(typeof m0.todaySignals.hydrationDone, 'boolean');
      assert.equal(m0.weight, undefined);
      assert.equal(m0.diseases, undefined);

      // Referrals: +7 days Pro both sides + anti-abuse self-referral & reused device block
      const refCode = await okJson(await call('/v1/referrals/code', { headers: host.headers }));
      assert.ok(refCode.code.startsWith('CF-'));
      // Self referral blocked
      await errJson(await call('/v1/referrals/redeem', {
        method: 'POST',
        headers: host.headers,
        body: JSON.stringify({ code: refCode.code, deviceId: 'dev-host-1' }),
      }), 409, 'REFERRAL_INELIGIBLE');
      // Same device as referrer blocked
      await errJson(await call('/v1/referrals/redeem', {
        method: 'POST',
        headers: friend.headers,
        body: JSON.stringify({ code: refCode.code, deviceId: 'dev-host-1' }),
      }), 409, 'REFERRAL_INELIGIBLE');
      // Distinct device succeeds -> both get Pro!
      const redRes = await okJson(await call('/v1/referrals/redeem', {
        method: 'POST',
        headers: friend.headers,
        body: JSON.stringify({ code: refCode.code, deviceId: 'dev-friend-brand-new' }),
      }));
      assert.equal(redRes.redeemed, true);
      assert.equal(redRes.bonusDays, 7);
      const friendEnt = await okJson(await call('/v1/entitlements', { headers: friend.headers }));
      assert.equal(friendEnt.tier, 'pro');
      const hostEnt = await okJson(await call('/v1/entitlements', { headers: host.headers }));
      assert.equal(hostEnt.tier, 'pro');
    });

    // 5. KAN-124: Travel/Hotel Session Override, Freeform Open Workout & 14-Region Muscle Heatmap
    await t.test('KAN-124: travel override (non-mutating + red-flag guard), free open_workout_session & 14-region muscle heatmap', async () => {
      const u = await createUser('Youssef Gym', 'dev-kan124', {
        ...baseDraft,
        injuries: ['knee'],
      });
      const originalWorkoutPlanId = u.state.workoutPlan.id;

      // Free user blocked from Pro travel override & muscle heatmap
      await errJson(await call('/v1/workouts/session-override-today', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ mode: 'bodyweight_hotel', durationMin: 30 }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 402, 'PRO_ENTITLEMENT_REQUIRED');
      await errJson(await call('/v1/workouts/muscle-status', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 402, 'PRO_ENTITLEMENT_REQUIRED');

      // open_workout_session is ALWAYS FREE!
      const safeExerciseId = u.state.workoutPlan.days[0].exercises[0].id;
      const openRes = await okJson(await cmd(u, 'open_workout_session', {
        title: 'Hotel Upper Pump',
        durationMin: 25,
        rpe: 7,
        exercises: [{ exerciseId: safeExerciseId, sets: [{ kg: 20, reps: 12, rir: 2 }, { kg: 20, reps: 12, rir: 2 }] }],
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(openRes.workoutPlan.id, originalWorkoutPlanId, 'open_workout_session must never mutate scheduled split');
      assert.equal(openRes.openWorkoutSessions.length, 1);

      // Grant Pro -> travel override succeeds & preserves permanent gym split
      await grantPro(u.userId);
      const override = await okJson(await call('/v1/workouts/session-override-today', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ mode: 'bodyweight_hotel', durationMin: 30 }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      u.rev = override.revision;
      assert.equal(override.isTemporaryOverride, true);
      assert.equal(override.permanentSplitPreserved, true);
      assert.ok(override.exercises.length >= 2);
      const stateAfter = await okJson(await call('/v1/state', { headers: u.headers }));
      assert.equal(stateAfter.workoutPlan.id, originalWorkoutPlanId);

      // Muscle recovery heatmap covers all 14 MUSCLE_REGIONS
      const heatmap = await okJson(await call('/v1/workouts/muscle-status', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(heatmap.muscles.length, Object.keys(MUSCLE_REGIONS).length);
      assert.ok(heatmap.muscles.every(m => ['fresh', 'recovering', 'fatigued'].includes(m.recoveryState)));
      assert.ok(heatmap.muscles.some(m => m.weeklyWorkingSets > 0));

      // Red flag stop blocks travel override (403 RED_FLAG_STOP_ACTIVE)
      await okJson(await cmd(u, 'recovery', { sleepHours: 7, sleepQuality: 4, fatigue: 2, pain: false, illness: false, redFlags: true }));
      await errJson(await call('/v1/workouts/session-override-today', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ mode: 'bodyweight_hotel', durationMin: 20 }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 403, 'RED_FLAG_STOP_ACTIVE');
    });

    // 6. KAN-61, KAN-84, KAN-122 & KAN-102: Meal Capture, 3-Specialist Care Room, Visual Photo Diff & Full GDPR Export/Delete
    await t.test('KAN-61, KAN-84, KAN-122 & KAN-102: meal-parse, 3-specialist guardrails, visual photo diff, fair-use caps, and GDPR', async () => {
      const u = await createUser('Mona Specialist', 'dev-kan61', {
        ...baseDraft,
        sex: 'female',
        weight: 64,
        height: 165,
        goal: 'maintain',
        targetWeight: null,
        diseases: ['favism', 'celiac'],
      });

      // Unrecognized input -> 422 AI_FOOD_NOT_RECOGNIZED without burning Free quota
      await errJson(await call('/v1/nutrition/meal-parse', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ inputType: 'text', text: 'empty table' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 422, 'AI_FOOD_NOT_RECOGNIZED');

      // Dialect + code-switching meal capture with clinical warnings (favism + celiac)
      const parsed = await okJson(await call('/v1/nutrition/meal-parse', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ inputType: 'voice', text: 'فول و بيضتين و نص رغيف بلدي + 1 scoop whey protein' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(parsed.requiresUserConfirmation, true);
      assert.ok(parsed.items.length >= 3);
      assert.ok(parsed.clinicalWarnings.some(w => w.code === 'MEAL_CAPTURE_FAVISM_ALERT'));
      assert.ok(parsed.clinicalWarnings.some(w => w.code === 'MEAL_CAPTURE_CELIAC_GLUTEN_ALERT'));
      assert.equal(parsed.remainingFreePreviews, 2);

      // Exhaust remaining 2 Free starter previews -> 4th returns 402 PRO_ENTITLEMENT_REQUIRED
      for (let i = 0; i < 2; i++) {
        await okJson(await call('/v1/nutrition/meal-parse', {
          method: 'POST',
          headers: u.headers,
          body: JSON.stringify({ inputType: 'text', text: '150g grilled chicken and white rice' }),
        }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      }
      await errJson(await call('/v1/nutrition/meal-parse', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ inputType: 'text', text: '150g grilled chicken' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 402, 'PRO_ENTITLEMENT_REQUIRED');

      // 3-Specialist Care Room guardrails (urgent medical, medication, ED crisis) + Free 5/month -> 402 + history stays readable
      const medRes = await okJson(await call('/v1/coaching/consultation', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ message: 'Should I adjust my insulin dose before lunch?' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(medRes.safetyNoticeTriggered, true);
      assert.ok(medRes.safetyFlagCodes.includes('MEDICATION_BOUNDARY_REFUSAL'));
      assert.ok(!FORBIDDEN_VOICE_RE.test(medRes.reply));

      const urgRes = await okJson(await call('/v1/coaching/consultation', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ message: 'I feel chest pain and severe dizziness right now' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.ok(urgRes.safetyFlagCodes.includes('URGENT_MEDICAL_ESCALATION'));

      const trnRes = await okJson(await call('/v1/coaching/consultation', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ message: 'How many sets should I do for squat today?' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(trnRes.specialistRole, 'training_captain');

      // Burn remaining 2 Free messages (including Arabic bilingual parity check!) -> 6th returns 402 while history stays 200 OK
      const arDiningRes = await okJson(await call('/v1/coaching/consultation', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ message: 'آكل إيه في مطعم مشويات النهارده؟', locale: 'ar-EG' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(arDiningRes.specialistRole, 'nutrition_specialist');
      assert.ok(/[\u0600-\u06FF]/.test(arDiningRes.reply), 'Arabic consultation must respond in Arabic');
      assert.ok(!FORBIDDEN_VOICE_RE.test(arDiningRes.reply));

      await okJson(await call('/v1/coaching/consultation', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ message: 'What should I eat at a restaurant tonight?' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      await errJson(await call('/v1/coaching/consultation', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ message: 'Another question' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 402, 'PRO_ENTITLEMENT_REQUIRED');
      const history = await okJson(await call('/v1/coaching/consultation/history', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.ok(history.items.length >= 10);

      // Visual Photo Difference Analysis (KAN-122)
      await grantPro(u.userId);
      const today = new Date().toISOString().slice(0, 10);
      const d30Ago = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const d2Ago = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
      await db.batch([
        db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)')
          .bind(u.userId, 'ph_before', d30Ago, 'front', `photos/${u.userId}/ph_before.jpg`, 65, new Date().toISOString()),
        db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)')
          .bind(u.userId, 'ph_after', today, 'front', `photos/${u.userId}/ph_after.jpg`, 64.8, new Date().toISOString()),
        db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)')
          .bind(u.userId, 'ph_close', d2Ago, 'front', `photos/${u.userId}/ph_close.jpg`, 64.9, new Date().toISOString()),
        db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)')
          .bind(u.userId, 'ph_side', today, 'side', `photos/${u.userId}/ph_side.jpg`, 64.8, new Date().toISOString()),
      ]);

      // Consent required first (403 VISUAL_ANALYSIS_CONSENT_REQUIRED)
      await errJson(await call('/v1/progress/photos/analyze-diff', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ beforePhotoId: 'ph_before', afterPhotoId: 'ph_after' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 403, 'VISUAL_ANALYSIS_CONSENT_REQUIRED');

      // Grant visual_progress_analysis consent
      await okJson(await call('/v1/account/consents', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ consentType: 'visual_progress_analysis', version: '1.0', accepted: true }),
      }));

      // Validation errors do not consume quota
      await errJson(await call('/v1/progress/photos/analyze-diff', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ beforePhotoId: 'ph_before', afterPhotoId: 'ph_before' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 400, 'SAME_PHOTO_PAIR');
      await errJson(await call('/v1/progress/photos/analyze-diff', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ beforePhotoId: 'ph_before', afterPhotoId: 'ph_side' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 400, 'POSE_MISMATCH');
      await errJson(await call('/v1/progress/photos/analyze-diff', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ beforePhotoId: 'ph_close', afterPhotoId: 'ph_after' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 400, 'PHOTOS_TOO_CLOSE_DAYS');

      // Pro monthly fair-use cap: 4 analyses succeed, 5th returns 429 FAIR_USE_LIMIT_REACHED!
      let lastAnalysisId = '';
      for (let i = 0; i < 4; i++) {
        const diff = await okJson(await call('/v1/progress/photos/analyze-diff', {
          method: 'POST',
          headers: u.headers,
          body: JSON.stringify({ beforePhotoId: 'ph_before', afterPhotoId: 'ph_after', pose: 'front', blurFaceBeforeAnalysis: true }),
        }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 201);
        assert.equal(diff.clinicalMode, 'standard');
        assert.ok(diff.daysBetween >= 28);
        assert.ok(!FORBIDDEN_VOICE_RE.test(JSON.stringify(diff.visualObservations)));
        lastAnalysisId = diff.analysisId;
      }
      await errJson(await call('/v1/progress/photos/analyze-diff', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ beforePhotoId: 'ph_before', afterPhotoId: 'ph_after', pose: 'front' }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 429, 'FAIR_USE_LIMIT_REACHED');

      // List & delete saved analysis works cleanly
      const listed = await okJson(await call('/v1/progress/photos/analyses', { headers: u.headers }));
      assert.equal(listed.total, 4);
      await okJson(await call(`/v1/progress/photos/analyses/${lastAnalysisId}`, { method: 'DELETE', headers: u.headers }));

      // KAN-102: GDPR Export & Atomic Delete cover all Wave 2 entities
      const exp = await okJson(await call('/v1/account/export', { headers: u.headers }));
      assert.ok(Array.isArray(exp.photoAnalyses) && exp.photoAnalyses.length === 3);
      assert.ok(Array.isArray(exp.badges));
      assert.ok(Array.isArray(exp.retentionIntents));
      const del = await okJson(await call('/v1/account/delete', {
        method: 'POST',
        headers: u.headers,
        body: JSON.stringify({ confirm: true }),
      }));
      assert.equal(del.deleted, true);
      const remainingAnalyses = await db.prepare('SELECT COUNT(*) AS n FROM coaching_photo_analyses WHERE user_id=?').bind(u.userId).first();
      assert.equal(Number(remainingAnalyses?.n || 0), 0);
    });
  } finally {
    await mf.dispose();
  }
});
