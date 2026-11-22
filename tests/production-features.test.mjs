import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';

const ARABIC_RE = /[\u0600-\u06FF]/;
const BASE_ENV = {
  AUTH_JWT_SECRET: 'production-test-secret-key-256-bits-strong',
  AUTH_ISSUER: 'https://auth.curafit.local',
  AUTH_AUDIENCE: 'curafit-kmm',
  RATE_LIMIT_PER_MINUTE: '500',
  STORE_WEBHOOK_SECRET: 'test-webhook-secret-123',
};

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createTestOidcSigner(kid = 'test-kid-1') {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  pubJwk.kid = kid;
  pubJwk.use = 'sig';
  pubJwk.alg = 'RS256';
  const signJwt = async (payload) => {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const body = b64url(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${header}.${body}`));
    return `${header}.${body}.${b64url(sig)}`;
  };
  return { jwksJson: JSON.stringify({ keys: [pubJwk] }), signJwt };
}

test('CuraFit Production Suite: OAuth, Onboarding, Nutrition/Workouts, Analytics, R2 Media, Push, Billing, Quotas, Edge Cases & Deferred AI', async (t) => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    r2Buckets: ['CURAFIT_MEDIA_BUCKET'],
    bindings: BASE_ENV,
  });

  try {
    const db = await mf.getD1Database('DB');
    const bucket = await mf.getR2Bucket('CURAFIT_MEDIA_BUCKET');
    await migrateLocal(db);

    const googleSigner = await createTestOidcSigner('google-k1');
    const appleSigner = await createTestOidcSigner('apple-k1');
    const envBase = {
      ...BASE_ENV,
      DB: db,
      CURAFIT_MEDIA_BUCKET: bucket,
      OAUTH_GOOGLE_JWKS_JSON: googleSigner.jwksJson,
      OAUTH_APPLE_JWKS_JSON: appleSigner.jwksJson,
      OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
      OAUTH_APPLE_CLIENT_IDS: 'com.curafit.ios',
    };

    const call = async (path, opts = {}, envExtra = {}) => {
      const env = { ...envBase, ...envExtra };
      const url = path.startsWith('http') ? path : `https://curafit-api-dev.egypt-nutrition-coach.workers.dev${path.startsWith('/') ? path : '/v1/' + path}`;
      return await cloudflareEntry.fetch(new Request(url, opts), env, { waitUntil() {} });
    };

    const okJson = async (res, status = 200) => {
      const text = await res.text();
      assert.equal(res.status, status, `Expected ${status}, got ${res.status}: ${text}`);
      const body = JSON.parse(text);
      assert.equal(body.ok, true, `Expected ok:true, got ${text}`);
      assert.ok(body.meta?.requestId);
      return body.data;
    };

    const errJson = async (res, status, code) => {
      const text = await res.text();
      assert.equal(res.status, status, `Expected ${status}, got ${res.status}: ${text}`);
      const body = JSON.parse(text);
      assert.equal(body.ok, false);
      assert.equal(body.error?.code, code, `Expected code ${code}, got ${body.error?.code}: ${text}`);
      assert.ok(!ARABIC_RE.test(JSON.stringify(body.error)), `Arabic leaked in error: ${text}`);
      return body.error;
    };

    let cmdCounter = 0;
    const postCmd = async (token, revision, action, payload, opts = {}) => {
      const key = opts.idempotencyKey || `prod-cmd-${++cmdCounter}-${crypto.randomUUID()}`;
      const viewQuery = opts.minimal ? '?view=receipt' : '';
      return await call(
        `/v1/commands${viewQuery}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          },
          body: JSON.stringify({ revision, action, payload }),
        },
        opts.envExtra || {}
      );
    };

    // 1. Capabilities, Maintenance Mode, Version Gate & Deferred AI
    await t.test('capabilities, maintenance mode, client version gate, and deferred AI 501', async () => {
      const caps = await okJson(await call('/v1/capabilities'));
      assert.ok(caps.features.includes('social_oauth'));
      assert.ok(caps.features.includes('pantry_finder'));
      assert.deepEqual(caps.deferredFeatures, ['ai_meal_parse', 'ai_coach_qa']);

      // Maintenance mode returns 503 on normal endpoints but 200 on health & capabilities
      await okJson(await call('/v1/health', {}, { MAINTENANCE_MODE: 'true' }));
      await okJson(await call('/v1/capabilities', {}, { MAINTENANCE_MODE: 'true' }));
      await errJson(await call('/v1/plans/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, { MAINTENANCE_MODE: 'true' }), 503, 'MAINTENANCE_MODE');

      // Client version gate 426
      await errJson(
        await call('/v1/plans/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'android', 'X-Client-Version': '0.9.0' },
          body: '{}',
        }, { MIN_ANDROID_VERSION: '1.2.0' }),
        426,
        'CLIENT_UPDATE_REQUIRED'
      );
    });

    // 2. Stateless Plan Preview & Clinical Rules
    await t.test('stateless plan preview and clinical rules (seniorMode, maternal, celiac, kidney, elbow_pain, 7d)', async () => {
      const preview = await okJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Preview Male', age: 30, sex: 'male', weight: 82, height: 178,
          goal: 'lose', targetWeight: 75, activity: 'moderate', dietType: 'balanced',
          serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true,
        }),
      }));
      assert.ok(preview.targets.kcal >= 1500);
      assert.ok(preview.waterTargetLiters >= 2.0);
      assert.ok(preview.forecast?.estimated_weeks_min > 0);
      assert.ok(!ARABIC_RE.test(JSON.stringify(preview)));

      // Senior 75yo & pregnant_t2 safe floors
      const seniorPreview = await okJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Senior', age: 75, sex: 'male', weight: 74, height: 170,
          goal: 'maintain', activity: 'light', dietType: 'balanced',
          serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true,
        }),
      }));
      assert.equal(seniorPreview.targets.seniorMode, true);

      const pregPreview = await okJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Maternal', age: 29, sex: 'female', weight: 65, height: 165,
          goal: 'maintain', maternalStatus: 'pregnant_t2', activity: 'light', dietType: 'balanced',
          serviceTrack: 'nutrition_only', healthConfirmed: true,
        }),
      }));
      assert.ok(pregPreview.targets.kcal >= 1800);

      // Medical blocks: keto + cholesterol, IF + breastfeeding
      await errJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'KetoBlock', age: 35, sex: 'male', weight: 85, height: 175,
          goal: 'lose', dietType: 'keto', conditions: ['cholesterol'],
          serviceTrack: 'nutrition_only', healthConfirmed: true,
        }),
      }), 400, 'MEDICAL_DIET_CONFLICT');

      await errJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'IFBlock', age: 30, sex: 'female', weight: 68, height: 164,
          goal: 'maintain', maternalStatus: 'breastfeeding', dietType: 'intermittent_fasting',
          serviceTrack: 'nutrition_only', healthConfirmed: true,
        }),
      }), 400, 'MEDICAL_DIET_CONFLICT');
    });

    // 3. Direct Google & Apple OIDC OAuth
    let googleToken = '';
    await t.test('direct Google and Apple OAuth OIDC verification and email conflict handling', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const validGoogleJwt = await googleSigner.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: 'google-sub-1001',
        email: 'oauth.user@curafit.app',
        email_verified: true,
        name: 'OAuth Athlete',
        picture: 'https://example.com/avatar.jpg',
        iat: nowSec,
        exp: nowSec + 3600,
      });

      const created = await okJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: validGoogleJwt, deviceId: 'pixel-9' }),
      }), 201);
      assert.ok(created.accessToken);
      assert.equal(created.user.email, 'oauth.user@curafit.app');
      assert.equal(created.user.avatarUrl, 'https://example.com/avatar.jpg');
      googleToken = created.accessToken;

      // Second call signs in existing user with 200
      const signedIn = await okJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: validGoogleJwt, deviceId: 'pixel-9' }),
      }), 200);
      assert.equal(signedIn.user.userId, created.user.userId);

      // Invalid token rejected
      await errJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'bad.jwt.token' }),
      }), 401, 'AUTH_OAUTH_TOKEN_INVALID');

      // Password account cannot be hijacked by OAuth email match
      await okJson(await call('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'password.only@curafit.app', password: 'StrongPassword#2026' }),
      }), 201);

      const conflictJwt = await googleSigner.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: 'google-sub-conflict',
        email: 'password.only@curafit.app',
        email_verified: true,
        iat: nowSec,
        exp: nowSec + 3600,
      });
      await errJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: conflictJwt }),
      }), 409, 'AUTH_PROVIDER_EMAIL_CONFLICT');

      // Apple OIDC sign-in
      const appleJwt = await appleSigner.signJwt({
        iss: 'https://appleid.apple.com',
        aud: 'com.curafit.ios',
        sub: 'apple-sub-2001',
        email: 'apple.user@privaterelay.appleid.com',
        email_verified: true,
        iat: nowSec,
        exp: nowSec + 3600,
      });
      const appleReg = await okJson(await call('/v1/auth/oauth/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityToken: appleJwt, fullName: 'Apple User', deviceId: 'iphone-16' }),
      }), 201);
      assert.ok(appleReg.accessToken);
    });

    // Main user for full lifecycle
    const reg = await okJson(await call('/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'prod.lifecycle@curafit.app', password: 'StrongPassword#2026', name: 'Prod User' }),
    }), 201);
    const token = reg.accessToken;
    const authHdr = { Authorization: `Bearer ${token}` };
    let rev = 0;

    // Deferred AI routes return 501 when authenticated
    await t.test('deferred AI routes return 501 FEATURE_DEFERRED_TO_AI_PHASE', async () => {
      await errJson(await call('/v1/nutrition/ai-parse', { method: 'POST', headers: { ...authHdr, 'Content-Type': 'application/json' }, body: '{}' }), 501, 'FEATURE_DEFERRED_TO_AI_PHASE');
      await errJson(await call('/v1/coaching/chat', { method: 'POST', headers: { ...authHdr, 'Content-Type': 'application/json' }, body: '{}' }), 501, 'FEATURE_DEFERRED_TO_AI_PHASE');
      await errJson(await call('/v1/coaching/chat/history', { headers: authHdr }), 501, 'FEATURE_DEFERRED_TO_AI_PHASE');
    });

    // 4. Generate plan (celiac, kidney, elbow_pain, 7 days, bands alias) + Bootstrap M2 + ETag 304 + Sync afterSeq=0 + Idempotency Rebase
    let activePlanId = '';
    let todayDate = '';
    let firstMealId = '';
    let workoutDayIndex = 0;
    let firstExerciseId = '';
    await t.test('generate, Bootstrap M2, ETag 304, afterSeq=0 sync, idempotency rebase replay, and 429 Retry-After', async () => {
      const gen = await okJson(await postCmd(token, rev, 'generate', {
        name: 'Prod Athlete',
        age: 34,
        sex: 'male',
        weight: 84,
        height: 178,
        goal: 'lose',
        targetWeight: 77,
        activity: 'moderate',
        dietType: 'balanced',
        serviceTrack: 'nutrition_and_workouts',
        conditions: ['celiac', 'kidney'],
        injuries: ['elbow_pain'],
        trainingLocation: 'home',
        equipment: ['dumbbells', 'bands'],
        selectedWorkoutDays: [0, 1, 2, 3, 4, 5, 6],
        healthConfirmed: true,
        bmiWarningOverride: true,
      }));
      rev = gen.revision;
      activePlanId = gen.active_plan_id;
      todayDate = gen.serverDate;
      assert.ok(gen.preferences.excludedGroups.includes('gluten'), 'celiac must auto-exclude gluten');
      assert.ok(gen.plans[0].targets.protein <= Math.round(84 * 1.15) + 5, 'kidney must cap protein around 1.1 g/kg');
      firstMealId = gen.plans[0].days[0].meals[0].id;
      workoutDayIndex = gen.workoutPlan.days[0].dayIndex;
      firstExerciseId = gen.workoutPlan.days[0].exercises[0].id;

      // Bootstrap M2 fields + stable ETag 304
      const bootRes1 = await call('/v1/bootstrap', { headers: authHdr });
      const bootEtag = bootRes1.headers.get('ETag');
      assert.ok(bootEtag);
      const boot = await okJson(bootRes1);
      assert.equal(boot.serviceTrack, 'nutrition_and_workouts');
      assert.equal(boot.onboardingCompleted, true);
      assert.ok(Array.isArray(boot.consents));
      assert.ok(Array.isArray(boot.scheduledSessions) && boot.scheduledSessions.length > 0);
      assert.ok(typeof boot.todaySummary.nutrition.protein === 'number' || boot.todaySummary.nutrition.protein === null);
      assert.ok('activity' in boot.todaySummary);
      assert.ok(boot.todaySummary.fastingState);
      assert.ok(boot.streakSummary);
      assert.ok(boot.engagementState);
      assert.ok(boot.entitlements);

      const bootRes304 = await call('/v1/bootstrap', { headers: { ...authHdr, 'If-None-Match': bootEtag } });
      assert.equal(bootRes304.status, 304);

      // Coaching Brief pure English + canonical codes + deterministic actionTarget
      const brief = await okJson(await call('/v1/coaching/brief', { headers: authHdr }));
      assert.ok(!ARABIC_RE.test(JSON.stringify(brief)), 'Coaching brief must contain zero Arabic');
      assert.ok(brief.notes.some((n) => n.actionTarget), 'Brief must include deterministic actionTarget');
      for (const note of brief.notes) {
        assert.ok(note.code, 'Every brief note must carry a canonical code');
      }

      // Idempotency rebase replay: execute water at rev, then execute another water, then replay first key with latest revision
      const replayKey = 'rebase-replay-key-001';
      const w1 = await okJson(await postCmd(token, rev, 'water', { cups: 2 }, { idempotencyKey: replayKey, minimal: true }));
      rev = w1.revision;
      const w2 = await okJson(await postCmd(token, rev, 'water', { cups: 4 }, { minimal: true }));
      rev = w2.revision;
      const replayedRes = await postCmd(token, rev, 'water', { cups: 2 }, { idempotencyKey: replayKey, minimal: true });
      assert.equal(replayedRes.headers.get('Idempotency-Replayed'), 'true');
      const replayed = await okJson(replayedRes);
      assert.equal(replayed.commandReceipt.replayed, true);

      // Sync afterSeq=0 returns deltas from sequence 1+
      const sync = await okJson(await call('/v1/sync/changes?after=0&afterSeq=0', { headers: authHdr }));
      assert.ok(sync.deltas.length > 0, 'afterSeq=0 must return outbox deltas');
      assert.ok(sync.nextSeqCursor > 0);

      // 429 includes Retry-After header
      let rateRes;
      for (let i = 0; i < 4; i++) {
        rateRes = await call('/v1/state', { headers: authHdr }, { RATE_LIMIT_PER_MINUTE: '1' });
        if (rateRes.status === 429) break;
      }
      assert.equal(rateRes.status, 429);
      assert.ok(Number(rateRes.headers.get('Retry-After')) >= 1);
      await errJson(rateRes, 429, 'RATE_LIMITED');
    });

    // 5. Nutrition: Pantry, Grocery, Favorites, Copy Meal, Barcode, Fasting & Ramadan, Scale 3.5 & Estimated Beverage
    await t.test('Nutrition: pantry, grocery list, favorites, copy_meal, barcode, fasting/Ramadan, scale 3.5, reference serving', async () => {
      const pantryCat = await okJson(await call('/v1/pantry/catalog', { headers: authHdr }));
      assert.ok(Array.isArray(pantryCat.items) && pantryCat.items.length > 10);

      const sampleKeys = pantryCat.items.slice(0, 8).map((i) => i.id);
      const pantryAlts = await okJson(await call('/v1/pantry/alternatives', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: sampleKeys, mealId: firstMealId, limit: 10 }),
      }));
      assert.ok(Array.isArray(pantryAlts.items));
      if (pantryAlts.items.length) {
        const swapped = await okJson(await postCmd(token, rev, 'replace_meal', { mealId: firstMealId, templateId: pantryAlts.items[0].templateId }, { minimal: true }));
        rev = swapped.revision;
      }

      // Grocery list + toggle
      const grocery = await okJson(await call(`/v1/plans/${encodeURIComponent(activePlanId)}/grocery-list?days=3`, { headers: authHdr }));
      const flatGrocery = (grocery.categories || []).flatMap((c) => c.items || []);
      assert.ok(flatGrocery.length > 0);
      assert.ok(!ARABIC_RE.test(grocery.note || ''));
      const firstKey = flatGrocery[0].ingredientKey;
      const gTog = await okJson(await postCmd(token, rev, 'grocery_toggle', { planId: activePlanId, ingredientKey: firstKey, checked: true }, { minimal: true }));
      rev = gTog.revision;
      const groceryAfter = await okJson(await call(`/v1/plans/${encodeURIComponent(activePlanId)}/grocery-list?days=3`, { headers: authHdr }));
      const flatAfter = (groceryAfter.categories || []).flatMap((c) => c.items || []);
      assert.equal(flatAfter.find((i) => i.ingredientKey === firstKey)?.checked, true);

      // Food search + estimated reference serving + favorite + copy_meal
      const foods = await okJson(await call('/v1/foods?scope=approved&limit=5', { headers: authHdr }));
      const foodId = foods.items[0].id;
      const logged = await okJson(await postCmd(token, rev, 'food_entry', {
        date: todayDate, slot: 'breakfast', source: 'ingredient', foodId, grams: 120,
      }, { minimal: true }));
      rev = logged.revision;

      // Estimated beverage with unit: 'reference'
      const estBevs = await okJson(await call('/v1/beverages?includeEstimated=true&limit=20', { headers: authHdr }));
      const estItem = estBevs.items.find((x) => x.status === 'estimated') || estBevs.items[0];
      if (estItem) {
        const bevLog = await okJson(await postCmd(token, rev, 'food_entry', {
          date: todayDate, slot: 'snack', source: 'ingredient', foodId: estItem.id, unit: 'reference', quantity: 1,
        }, { minimal: true }));
        rev = bevLog.revision;
      }

      // Favorites
      const favOn = await okJson(await postCmd(token, rev, 'food_favorite', { foodId, favorite: true }, { minimal: true }));
      rev = favOn.revision;
      const favs = await okJson(await call('/v1/foods/favorites', { headers: authHdr }));
      assert.ok(favs.items.some((f) => f.foodId === foodId));

      // Copy meal from yesterday to today (obeying DATE_IN_FUTURE guard)
      const yesterday = new Date(Date.parse(todayDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
      rev = (await okJson(await postCmd(token, rev, 'food_entry', {
        date: yesterday, slot: 'lunch', source: 'ingredient', foodId, grams: 150,
      }, { minimal: true }))).revision;
      const copied = await okJson(await postCmd(token, rev, 'copy_meal', { fromDate: yesterday, toDate: todayDate, slot: 'lunch' }, { minimal: true }));
      rev = copied.revision;
      const todayDiary = await okJson(await call(`/v1/food-diary?date=${todayDate}`, { headers: authHdr }));
      assert.ok(todayDiary.entries.some((e) => e.slot === 'lunch'));

      // Barcode submit & lookup
      const createdBc = await okJson(await call('/v1/foods/barcode', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean: '6221000123456', name: 'Egyptian Greek Yogurt', brand: 'CuraDairy', kcalPer100g: 95, proteinPer100g: 10, carbsPer100g: 4, fatPer100g: 4.5, servingG: 170 }),
      }), 201);
      assert.equal(createdBc.ean, '6221000123456');
      const lookedUp = await okJson(await call('/v1/foods/barcode/6221000123456', { headers: authHdr }));
      assert.equal(lookedUp.nameEn, 'Egyptian Greek Yogurt');

      // Fasting & Ramadan mode (high-risk kidney user must acknowledge medical clearance)
      await errJson(await postCmd(token, rev, 'ramadan_mode', { enabled: true, iftarTime: '18:15', suhoorTime: '04:00' }, { minimal: true }), 400, 'RAMADAN_MEDICAL_CLEARANCE_REQUIRED');
      const ramOn = await okJson(await postCmd(token, rev, 'ramadan_mode', { enabled: true, iftarTime: '18:15', suhoorTime: '04:00', medicalClearanceAcknowledged: true }, { minimal: true }));
      rev = ramOn.revision;
      const fastStart = await okJson(await postCmd(token, rev, 'fasting_log', { op: 'start', protocol: 'ramadan', targetHours: 14 }, { minimal: true }));
      rev = fastStart.revision;
      const fastState = await okJson(await call('/v1/nutrition/fasting-state', { headers: authHdr }));
      assert.equal(fastState.phase, 'fasting');
      assert.equal(fastState.ramadanMode?.enabled, true);
      const fastEnd = await okJson(await postCmd(token, rev, 'fasting_log', { op: 'end' }, { minimal: true }));
      rev = fastEnd.revision;
    });

    // 6. Workouts: Arabic Exercise Search, Muscles i18n, UI Mode, Ad-Hoc, Warmup Exclusion, PRs, Comeback
    await t.test('Workouts: Arabic search, 69 muscles i18n, UI mode, ad-hoc exercise, warmup exclusion, PRs & Comeback Protocol', async () => {
      const muscles = await okJson(await call('/v1/catalog/muscles', { headers: authHdr }));
      assert.equal(muscles.items.length, 69);
      assert.ok(muscles.items.every((m) => typeof m.nameAr === 'string' && m.nameAr.length > 0));

      const arSearch = await okJson(await call(`/v1/exercises?q=${encodeURIComponent('ضغط')}`, { headers: authHdr }));
      assert.ok(arSearch.total > 0, 'Arabic exercise search must return results');
      assert.ok(arSearch.items[0].nameAr);
      assert.ok(Array.isArray(arSearch.items[0].instructionsAr) && arSearch.items[0].instructionsAr.length > 0);
      assert.ok(Array.isArray(arSearch.items[0].commonMistakesAr) && arSearch.items[0].commonMistakesAr.length > 0);

      // UI mode + ad-hoc + workout logging with warmup & working sets
      rev = (await okJson(await postCmd(token, rev, 'workout_ui_mode', { mode: 'pro' }, { minimal: true }))).revision;
      rev = (await okJson(await postCmd(token, rev, 'ad_hoc_exercise', { date: todayDate, exerciseId: arSearch.items[0].id, sets: [{ reps: 12, kg: 10 }, { reps: 12, kg: 10 }] }, { minimal: true }))).revision;
      rev = (await okJson(await postCmd(token, rev, 'workout', {
        date: todayDate,
        dayIndex: workoutDayIndex,
        exerciseId: firstExerciseId,
        sets: [
          { reps: 12, kg: 10, setType: 'warmup' },
          { reps: 10, kg: 30, rir: 2, setType: 'normal' },
          { reps: 10, kg: 32.5, rir: 1, setType: 'normal' },
        ],
      }, { minimal: true }))).revision;

      const prs = await okJson(await call('/v1/workouts/prs', { headers: authHdr }));
      const exPr = prs.summaryByExercise?.[firstExerciseId];
      assert.ok(exPr);

      // Comeback protocol (always free)
      rev = (await okJson(await postCmd(token, rev, 'comeback_restart', { mode: '7d_ramp', currentWeightKg: 82.8 }, { minimal: true }))).revision;
    });

    // 7. Analytics, Measurements, Streak Freeze, Weekly Wrapped, Widgets, Wearables Protection & Settings
    await t.test('Analytics, measurements, streak freeze, weekly wrapped, widgets, wearables manual protection & settings', async () => {
      // Manual weight first -> wearable weight on same date must NOT overwrite it
      rev = (await okJson(await postCmd(token, rev, 'weight', { date: todayDate, kg: 82.5 }, { minimal: true }))).revision;
      const ingest = await okJson(await call('/v1/wearables/ingest', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [
            { type: 'weight', date: todayDate, kg: 99.9, source: 'apple_health', externalRecordId: 'ext-w-1' },
            { type: 'activity', date: todayDate, steps: 8500, activeEnergyKcal: 340, source: 'apple_health', externalRecordId: 'ext-a-1' },
          ],
        }),
      }));
      rev = ingest.revision;
      const weights = await okJson(await call('/v1/weight-logs', { headers: authHdr }));
      assert.equal(weights.items.find((w) => w.date === todayDate)?.kg, 82.5, 'Manual weight must be protected from wearable overwrite');

      // Measurements
      rev = (await okJson(await postCmd(token, rev, 'body_measurement', { date: todayDate, waistCm: 85.5, chestCm: 102 }, { minimal: true }))).revision;
      const meas = await okJson(await call('/v1/measurements', { headers: authHdr }));
      assert.equal(meas.items[0].waistCm, 85.5);

      // Streak freeze: 1st succeeds, 2nd within 7d returns 409
      rev = (await okJson(await postCmd(token, rev, 'streak_freeze', { date: todayDate }, { minimal: true }))).revision;
      await errJson(await postCmd(token, rev, 'streak_freeze', { date: todayDate }, { minimal: true }), 409, 'STREAK_FREEZE_UNAVAILABLE');

      // Analytics, Weekly Wrapped & Widget Snapshot (< 1.5 KB + 304)
      const analytics = await okJson(await call('/v1/progress/analytics?range=30d', { headers: authHdr }));
      assert.ok(Array.isArray(analytics.weightSeries));
      assert.ok(Array.isArray(analytics.calorieAdherence));
      const wrapped = await okJson(await call('/v1/progress/weekly-wrapped', { headers: authHdr }));
      assert.ok(wrapped.weekStart && wrapped.weekEnd);
      const widgetRes = await call('/v1/widgets/snapshot', { headers: authHdr });
      const widgetEtag = widgetRes.headers.get('ETag');
      const widgetData = await okJson(widgetRes);
      assert.ok(JSON.stringify(widgetData).length < 1500, 'Widget snapshot should be compact (< 1.5 KB)');
      const widget304 = await call('/v1/widgets/snapshot', { headers: { ...authHdr, 'If-None-Match': widgetEtag } });
      assert.equal(widget304.status, 304);

      // Settings: locale-only update works; invalid locale rejected; identical quiet hours rejected
      rev = (await okJson(await postCmd(token, rev, 'timezone', { locale: 'ar-SA' }, { minimal: true }))).revision;
      await errJson(await postCmd(token, rev, 'timezone', { locale: 'xx-INVALID' }, { minimal: true }), 400, 'INVALID_LOCALE');
      await errJson(await postCmd(token, rev, 'notification_preferences', { quietHoursStart: '22:00', quietHoursEnd: '22:00' }, { minimal: true }), 400, 'INVALID_QUIET_HOURS');
    });

    // 8. R2 Avatar & Progress Photos + Pro/Free Quota Enforcement + Billing + Push + Consents + Support + GDPR Delete
    await t.test('R2 media, downgrade-safe progress photos, Pro/Free quotas, billing, push, consents, support & GDPR delete', async () => {
      // Avatar upload -> signed GET -> delete
      const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
      const avUp = await okJson(await call('/v1/profile/avatar', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'image/jpeg' },
        body: fakeJpeg,
      }));
      assert.ok(avUp.avatarUrl.includes('/v1/media/signed/'));
      const avGet = await call(avUp.avatarUrl);
      assert.equal(avGet.status, 200);
      assert.equal((await avGet.arrayBuffer()).byteLength, fakeJpeg.byteLength);

      // Subscriptions verify -> Pro -> upload progress photo -> downgrade via webhook -> GET & DELETE still work while upload-url returns 402!
      const offerings = await okJson(await call('/v1/subscriptions/offerings?platform=android&region=egypt', { headers: authHdr }));
      assert.ok(offerings.products.length >= 2);
      const verified = await okJson(await call('/v1/subscriptions/verify', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'android', productId: 'curafit_pro.monthly', purchaseToken: 'gp-tok-001' }),
      }));
      assert.equal(verified.entitlements.tier, 'pro');

      const upUrl = await okJson(await call('/v1/progress/photos/upload-url', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/jpeg', byteSize: fakeJpeg.byteLength, pose: 'front', date: todayDate, weightKg: 82.5 }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      const putRes = await call(upUrl.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: fakeJpeg });
      assert.equal(putRes.status, 200);
      const confirmed = await okJson(await call('/v1/progress/photos/confirm', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: upUrl.photoId, objectKey: upUrl.objectKey, pose: 'front', date: todayDate, weightKg: 82.5 }),
      }), 201);
      assert.ok(confirmed.downloadUrl.includes('/v1/media/signed/'));

      // Expire subscription via Google RTDN webhook (notificationType 13 = EXPIRED)
      await okJson(await call('/v1/webhooks/google-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'test-webhook-secret-123' },
        body: JSON.stringify({ subscriptionNotification: { notificationType: 13, purchaseToken: 'gp-tok-001' } }),
      }));

      // After downgrade to Free: upload-url returns 402, but GET & DELETE remain accessible!
      await errJson(await call('/v1/progress/photos/upload-url', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/jpeg', byteSize: fakeJpeg.byteLength, pose: 'side', date: todayDate }),
      }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }), 402, 'PRO_ENTITLEMENT_REQUIRED');

      const photosAfterDowngrade = await okJson(await call('/v1/progress/photos', { headers: authHdr }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));
      assert.equal(photosAfterDowngrade.items.length, 1);
      await okJson(await call(`/v1/progress/photos/${encodeURIComponent(confirmed.id)}`, { method: 'DELETE', headers: authHdr }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }));

      // Free Quota Enforcement: meal swap limit = 2/day, 3rd returns 402; safety recovery remains Free!
      const alts = await okJson(await call(`/v1/meal-alternatives?mealId=${encodeURIComponent(firstMealId)}`, { headers: authHdr }));
      if (alts.items.length >= 2) {
        rev = (await okJson(await postCmd(token, rev, 'replace_meal', { mealId: firstMealId, templateId: alts.items[0].snapshot.template_id }, { minimal: true, envExtra: { ENFORCE_PRO_ENTITLEMENTS: 'true' } }))).revision;
        rev = (await okJson(await postCmd(token, rev, 'replace_meal', { mealId: firstMealId, templateId: alts.items[1].snapshot.template_id }, { minimal: true, envExtra: { ENFORCE_PRO_ENTITLEMENTS: 'true' } }))).revision;
        await errJson(await postCmd(token, rev, 'replace_meal', { mealId: firstMealId, templateId: alts.items[0].snapshot.template_id }, { minimal: true, envExtra: { ENFORCE_PRO_ENTITLEMENTS: 'true' } }), 402, 'PRO_ENTITLEMENT_REQUIRED');
      }
      // Safety recovery is ALWAYS free even when ENFORCE_PRO_ENTITLEMENTS=true
      rev = (await okJson(await postCmd(token, rev, 'recovery', { sleepHours: 5, sleepQuality: 2, fatigue: 4, pain: false, illness: false, redFlags: false }, { minimal: true, envExtra: { ENFORCE_PRO_ENTITLEMENTS: 'true' } }))).revision;

      // Push token + Cron scheduled() + Consents + Support Feedback
      await okJson(await call('/v1/devices/push-token', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'pixel-9', platform: 'android', token: 'fcm-token-xyz-123456', locale: 'en' }),
      }));
      await cloudflareEntry.scheduled({ cron: '0 * * * *', scheduledTime: Date.now() }, envBase, { waitUntil() {} });
      await okJson(await call('/v1/devices/push-token?deviceId=pixel-9', { method: 'DELETE', headers: authHdr }));

      await okJson(await call('/v1/account/consents', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentType: 'medical_disclaimer', version: '1.0.0', accepted: true }),
      }));
      const consents = await okJson(await call('/v1/account/consents', { headers: authHdr }));
      assert.ok(consents.items.some((c) => c.consentType === 'medical_disclaimer'));

      const ticket = await okJson(await call('/v1/support/feedback', {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'bug', message: 'Testing support ticket persistence', includeDiagnostics: true, platform: 'android' }),
      }), 201);
      assert.ok(ticket.ticketId.startsWith('tkt_'));

      // GDPR Export & Permanent Delete (including R2 avatar cleanup)
      const exported = await okJson(await call('/v1/account/export', { headers: authHdr }));
      assert.ok(Array.isArray(exported.logs.bodyMeasurements));
      assert.ok(Array.isArray(exported.consents));

      const deleted = await okJson(await call('/v1/account/delete', {
        method: 'DELETE',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }));
      assert.equal(deleted.deleted, true);
      assert.ok(deleted.mediaObjectsDeleted >= 1, 'GDPR delete must purge R2 avatar');

      // Post-deletion token must be rejected immediately
      const postDeleteRes = await call('/v1/state', { headers: authHdr });
      assert.equal(postDeleteRes.status, 401);
    });

    // 9. Edge Cases & Security Hardening
    await t.test('Edge cases: media spoofing, cross-tenant isolation, OAuth claims & Apple re-login, webhooks/subscription hijacking, barcode validation, assisted PR inversion, idempotency mismatch & maternal/kidney blocks', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const googleHdr = { Authorization: `Bearer ${googleToken}` };

      // 9a. OAuth claims validation: expired, wrong aud, wrong iss
      const expiredJwt = await googleSigner.signJwt({ iss: 'https://accounts.google.com', aud: 'curafit-android-client-id', sub: 'g-exp', email: 'exp@curafit.app', email_verified: true, iat: nowSec - 7200, exp: nowSec - 3600 });
      await errJson(await call('/v1/auth/oauth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: expiredJwt }) }), 401, 'AUTH_OAUTH_TOKEN_INVALID');

      const wrongAudJwt = await googleSigner.signJwt({ iss: 'https://accounts.google.com', aud: 'evil-client-id', sub: 'g-aud', email: 'aud@curafit.app', email_verified: true, iat: nowSec, exp: nowSec + 3600 });
      await errJson(await call('/v1/auth/oauth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: wrongAudJwt }) }), 401, 'AUTH_OAUTH_TOKEN_INVALID');

      const wrongIssJwt = await googleSigner.signJwt({ iss: 'https://evil.example', aud: 'curafit-android-client-id', sub: 'g-iss', email: 'iss@curafit.app', email_verified: true, iat: nowSec, exp: nowSec + 3600 });
      await errJson(await call('/v1/auth/oauth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: wrongIssJwt }) }), 401, 'AUTH_OAUTH_TOKEN_INVALID');

      // 9b. Apple 2nd sign-in WITHOUT email claim (Apple only returns email on first login)
      const appleReLoginJwt = await appleSigner.signJwt({ iss: 'https://appleid.apple.com', aud: 'com.curafit.ios', sub: 'apple-sub-2001', iat: nowSec, exp: nowSec + 3600 });
      const appleReLogin = await okJson(await call('/v1/auth/oauth/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identityToken: appleReLoginJwt }) }), 200);
      assert.ok(appleReLogin.accessToken);

      // 9c. Clinical edge blocks: pregnant_t2 + lose (422), high_protein + kidney (400)
      await errJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'PregCut', age: 28, sex: 'female', weight: 68, height: 165, goal: 'lose', maternalStatus: 'pregnant_t2', serviceTrack: 'nutrition_only', healthConfirmed: true }),
      }), 422, 'MATERNAL_CALORIE_CUT_BLOCKED');

      await errJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'KidneyHP', age: 40, sex: 'male', weight: 80, height: 175, goal: 'maintain', dietType: 'high_protein', diseases: ['kidney'], serviceTrack: 'nutrition_only', healthConfirmed: true }),
      }), 400, 'MEDICAL_DIET_CONFLICT');

      // 9d. Media spoofing & tampered signed token & cross-tenant isolation
      const spoofedBytes = new TextEncoder().encode('<svg onload="alert(1)">not a jpeg at all</svg>');
      await errJson(await call('/v1/profile/avatar', { method: 'POST', headers: { ...googleHdr, 'Content-Type': 'image/jpeg' }, body: spoofedBytes }), 415, 'UNSUPPORTED_IMAGE_FORMAT');
      await errJson(await call('/v1/media/signed/tampered.token'), 403, 'INVALID_MEDIA_TOKEN');

      // Verify webhook secret rejection & subscription ownership hijacking prevention
      await errJson(await call('/v1/webhooks/google-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'wrong-secret' },
        body: JSON.stringify({ subscriptionNotification: { notificationType: 2, purchaseToken: 'gp-tok-001' } }),
      }), 401, 'WEBHOOK_SIGNATURE_INVALID');

      const hijacker = await okJson(await call('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hijacker@curafit.app', password: 'StrongPassword#2026' }),
      }), 201);
      const hijackHdr = { Authorization: `Bearer ${hijacker.accessToken}` };

      // Google user activates a Pro subscription, hijacker tries to claim the same purchaseToken -> 409
      await okJson(await call('/v1/subscriptions/verify', {
        method: 'POST',
        headers: { ...googleHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'android', productId: 'curafit_pro.annual', purchaseToken: 'unique-google-token-9999' }),
      }));
      await errJson(await call('/v1/subscriptions/verify', {
        method: 'POST',
        headers: { ...hijackHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'android', productId: 'curafit_pro.annual', purchaseToken: 'unique-google-token-9999' }),
      }), 409, 'SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT');

      // Restore subscription confirms active Pro entitlement
      const restored = await okJson(await call('/v1/subscriptions/restore', {
        method: 'POST',
        headers: { ...googleHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'android', tokens: ['unique-google-token-9999'] }),
      }));
      assert.equal(restored.restored, true);
      assert.equal(restored.entitlements.tier, 'pro');

      // Cross-tenant progress photo isolation: Google user uploads photo, hijacker cannot delete it
      const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
      const gUp = await okJson(await call('/v1/progress/photos/upload-url', {
        method: 'POST',
        headers: { ...googleHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/jpeg', byteSize: fakeJpeg.byteLength, pose: 'front', date: todayDate }),
      }));
      // Spoofed PUT on signed URL must fail with 415
      await errJson(await call(gUp.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: spoofedBytes }), 415, 'UNSUPPORTED_IMAGE_FORMAT');
      // Valid PUT succeeds & confirm succeeds
      assert.equal((await call(gUp.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: fakeJpeg })).status, 200);
      const gConf = await okJson(await call('/v1/progress/photos/confirm', {
        method: 'POST',
        headers: { ...googleHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: gUp.photoId, objectKey: gUp.objectKey, pose: 'front', date: todayDate }),
      }), 201);
      // Hijacker cannot delete Google user's photo
      await errJson(await call(`/v1/progress/photos/${encodeURIComponent(gConf.id)}`, { method: 'DELETE', headers: hijackHdr }), 404, 'PHOTO_NOT_FOUND');

      // 9e. Barcode edge cases: invalid EAN, macro sum > 110g, nonexistent EAN
      await errJson(await call('/v1/foods/barcode/invalid-ean', { headers: googleHdr }), 400, 'INVALID_BARCODE_FORMAT');
      await errJson(await call('/v1/foods/barcode/9999999999999', { headers: googleHdr }), 404, 'BARCODE_NOT_FOUND');
      await errJson(await call('/v1/foods/barcode', {
        method: 'POST',
        headers: { ...googleHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: '6221000999999', nameEn: 'Impossible Macro Bar', valuesPer100g: { energy: 500, protein: 60, carbs: 60, fat: 10 } }),
      }), 400, 'MACROS_INCONSISTENT_WITH_100G');

      // 9f. Idempotency-Key payload mismatch -> 409, scaleSnapshot 3.5x zero Arabic, displaySlot iftar, Free renew_plan quota (1 free -> 2nd 402)
      let hRev = 0;
      const hGen = await okJson(await postCmd(hijacker.accessToken, hRev, 'generate', {
        name: 'Quota User', age: 28, sex: 'male', weight: 78, height: 176, goal: 'maintain',
        dietType: 'balanced', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true,
      }));
      hRev = hGen.revision;
      const hMeal = hGen.plans[0].days[0].meals[0];
      const hDayDate = hGen.plans[0].days[0].date;
      const hScaled = await okJson(await postCmd(hijacker.accessToken, hRev, 'food_entry', {
        date: hDayDate, slot: hMeal.slot, displaySlot: 'iftar', source: 'planned', mealId: hMeal.id, quantity: 3.5,
      }, { idempotencyKey: 'mismatch-key-01', minimal: true }));
      hRev = hScaled.revision;
      const hDiary = await okJson(await call(`/v1/food-diary?date=${hDayDate}`, { headers: hijackHdr }));
      assert.equal(hDiary.entries[0].displaySlot, 'iftar');
      assert.ok(!/وحدة/.test(hDiary.entries[0].snapshot.name), 'Scaled snapshot must not leak Arabic unit text');

      // Reusing same Idempotency-Key with different payload -> 409 IDEMPOTENCY_KEY_REUSED_MISMATCH
      await errJson(await postCmd(hijacker.accessToken, hRev, 'water', { cups: 5 }, { idempotencyKey: 'mismatch-key-01', minimal: true }), 409, 'IDEMPOTENCY_KEY_REUSED_MISMATCH');

      // Failed renew_plan while plan is still active returns 400 PLAN_STILL_ACTIVE and MUST NOT burn free quota
      await errJson(await postCmd(hijacker.accessToken, hRev, 'renew_plan', {}, { minimal: true, envExtra: { ENFORCE_PRO_ENTITLEMENTS: 'true' } }), 400, 'PLAN_STILL_ACTIVE');
      const hEnt = await okJson(await call('/v1/entitlements', { headers: hijackHdr }));
      assert.equal(hEnt.quotas.freePlanRenewalsRemaining, 1, 'Failed renew_plan must not consume free renewal quota');

      // Voluntary replace_exercise free quota: 2 swaps/week succeed, 3rd returns 402 PRO_ENTITLEMENT_REQUIRED
      const hDay = hGen.workoutPlan.days[0];
      const hEx = hDay.exercises[0];
      const exAlts = await okJson(await call(`/v1/exercise-alternatives?dayIndex=${hDay.dayIndex}&exerciseId=${encodeURIComponent(hEx.id)}`, { headers: hijackHdr }));
      if (exAlts.items.length >= 2) {
        const swap1 = await okJson(await postCmd(hijacker.accessToken, hRev, 'replace_exercise', { dayIndex: hDay.dayIndex, exerciseId: hEx.id, alternativeId: exAlts.items[0].id }, { minimal: true, envExtra: { ENFORCE_PRO_ENTITLEMENTS: 'true' } }));
        hRev = swap1.revision;
        const swap2 = await okJson(await postCmd(hijacker.accessToken, hRev, 'replace_exercise', { dayIndex: hDay.dayIndex, exerciseId: exAlts.items[0].id, alternativeId: exAlts.items[1].id }, { minimal: true, envExtra: { ENFORCE_PRO_ENTITLEMENTS: 'true' } }));
        hRev = swap2.revision;
        await errJson(await postCmd(hijacker.accessToken, hRev, 'replace_exercise', { dayIndex: hDay.dayIndex, exerciseId: exAlts.items[1].id, alternativeId: exAlts.items[0].id }, { minimal: true, envExtra: { ENFORCE_PRO_ENTITLEMENTS: 'true' } }), 402, 'PRO_ENTITLEMENT_REQUIRED');
      }

      // 9g. Assisted exercise PR inversion unit check (less assistance weight = new PR)
      const { computeWorkoutPrs } = await import('../server/workouts-insights.mjs');
      const prMock = computeWorkoutPrs({
        workoutPlan: { days: [{ exercises: [{ id: 'oedb:Assisted_Pull_Up', name: 'Assisted Pull Up', loadMode: 'assisted' }] }] },
        workoutLogs: [
          { date: '2026-11-10', exerciseId: 'oedb:Assisted_Pull_Up', loadMode: 'assisted', sets: [{ kg: 30, reps: 10, setType: 'normal' }] },
          { date: '2026-11-14', exerciseId: 'oedb:Assisted_Pull_Up', loadMode: 'assisted', sets: [{ kg: 20, reps: 10, setType: 'normal' }] },
        ],
      });
      assert.equal(prMock.summaryByExercise['oedb:Assisted_Pull_Up'].heaviestWeightKg, 20);
      assert.ok(prMock.items.some((e) => e.exerciseId === 'oedb:Assisted_Pull_Up' && e.prType === 'weight' && e.value === 20 && e.previousValue === 30));
    });

    // 10. Deep Audit P0/P1 Fixes: Pro Gating, Engine Math, Atomic Edits/Deletes, OAuth Link/Unlink, Consent Lock, Wearables Resilience & Billing/Tombstone Edge Cases
    await t.test('P0/P1 audit fixes: consistent Pro gating, engine math, atomic edits/deletes, OAuth linking, consent lock, billing states & trial tombstones', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const enforce = { ENFORCE_PRO_ENTITLEMENTS: 'true' };

      // 10a. Engine math & previewPlan upgrades
      const previewKeto = await okJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Keto Preview', age: 30, sex: 'male', weight: 82, height: 178,
          goal: 'lose', targetWeight: 75, activity: 'active', dietType: 'keto',
          serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5],
          externalTrainingDays: [2, 4], healthConfirmed: true,
        }),
      }));
      assert.ok(previewKeto.dailyCalories > 0);
      assert.ok(previewKeto.macros && previewKeto.macros.carbs <= 60, 'Keto preview must apply low-carb macro override');
      assert.ok(previewKeto.recommendedSplit);
      assert.ok(Array.isArray(previewKeto.warnings));
      assert.ok(Array.isArray(previewKeto.clinicalBlocks));
      assert.ok(previewKeto.estimatedWeeksMin > 0);

      // Pregnancy + gain must NOT stack +400 on top of +340 (T2)
      const pregMaintain = await okJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'PregM', age: 29, sex: 'female', weight: 65, height: 165,
          goal: 'maintain', maternalStatus: 'pregnant_t2', activity: 'light', dietType: 'balanced',
          serviceTrack: 'nutrition_only', healthConfirmed: true,
        }),
      }));
      const pregGain = await okJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'PregG', age: 29, sex: 'female', weight: 65, height: 165,
          goal: 'gain', maternalStatus: 'pregnant_t2', activity: 'light', dietType: 'balanced',
          serviceTrack: 'nutrition_only', healthConfirmed: true,
        }),
      }));
      assert.equal(pregGain.dailyCalories, pregMaintain.dailyCalories, 'Pregnancy T2 gain must not double-stack +400 surplus');

      // Male + maternal status rejected
      await errJson(await call('/v1/plans/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'BadMat', age: 30, sex: 'male', weight: 80, height: 175,
          goal: 'maintain', maternalStatus: 'pregnant_t2', serviceTrack: 'nutrition_only', healthConfirmed: true,
        }),
      }), 400, 'INVALID_MATERNAL_PROFILE');

      // 10b. Create fresh Google OAuth user for OAuth linking + P0/P1 lifecycle
      const p1GoogleJwt = await googleSigner.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: 'google-sub-p1-user',
        email: 'p1.audit@curafit.app',
        email_verified: true,
        name: 'Audit Athlete',
        iat: nowSec,
        exp: nowSec + 3600,
      });
      const p1Auth = await okJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: p1GoogleJwt, deviceId: 'p1-device-1' }),
      }), 201);
      const p1Token = p1Auth.accessToken;
      const p1Hdr = { Authorization: `Bearer ${p1Token}` };
      let p1Rev = 0;

      // OAuth providers: list -> cannot unlink last -> link Apple -> unlink Apple succeeds
      const prov1 = await okJson(await call('/v1/auth/oauth/providers', { headers: p1Hdr }));
      assert.equal(prov1.items.length, 1);
      assert.equal(prov1.items[0].provider, 'google');
      await errJson(await call('/v1/auth/oauth/google', { method: 'DELETE', headers: p1Hdr }), 409, 'CANNOT_UNLINK_LAST_AUTH_METHOD');

      const p1AppleJwt = await appleSigner.signJwt({
        iss: 'https://appleid.apple.com',
        aud: 'com.curafit.ios',
        sub: 'apple-sub-p1-link',
        email: 'p1.audit@curafit.app',
        email_verified: true,
        iat: nowSec,
        exp: nowSec + 3600,
      });
      const linked = await okJson(await call('/v1/auth/oauth/link', {
        method: 'POST',
        headers: { ...p1Hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'apple', identityToken: p1AppleJwt }),
      }));
      assert.equal(linked.linked, true);
      const prov2 = await okJson(await call('/v1/auth/oauth/providers', { headers: p1Hdr }));
      assert.equal(prov2.items.length, 2);

      const unlinked = await okJson(await call('/v1/auth/oauth/apple', { method: 'DELETE', headers: p1Hdr }));
      assert.equal(unlinked.unlinked, true);
      await errJson(await call('/v1/auth/oauth/apple', { method: 'DELETE', headers: p1Hdr }), 404, 'OAUTH_PROVIDER_NOT_LINKED');

      // 10c. Generate plan honoring activity + overwriteExisting guard
      const p1Gen = await okJson(await postCmd(p1Token, p1Rev, 'generate', {
        name: 'Audit Athlete', age: 30, sex: 'male', weight: 82, height: 178,
        goal: 'lose', targetWeight: 75, activity: 'active', dietType: 'intermittent_fasting',
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5],
        injuries: ['lower_back_pain'], unitSystem: 'imperial', healthConfirmed: true,
      }));
      p1Rev = p1Gen.revision;
      const p1PlanId = p1Gen.active_plan_id;
      const p1Today = p1Gen.serverDate;
      assert.equal(p1Gen.profile.activity, 'active', 'generate must honor activity alias');
      assert.equal(p1Gen.profile.unitSystem, 'imperial');

      // overwriteExisting: false must fail with 409 PROFILE_ALREADY_EXISTS
      await errJson(await postCmd(p1Token, p1Rev, 'generate', {
        name: 'Overwrite Blocked', age: 30, sex: 'male', weight: 82, height: 178,
        goal: 'maintain', serviceTrack: 'nutrition_only', overwriteExisting: false, healthConfirmed: true,
      }), 409, 'PROFILE_ALREADY_EXISTS');

      // 10d. Consistent Pro gating for Free user vs Free features (pantry & ramadan)
      await errJson(await call(`/v1/plans/${encodeURIComponent(p1PlanId)}/grocery-list`, { headers: p1Hdr }, enforce), 402, 'PRO_ENTITLEMENT_REQUIRED');
      await errJson(await call('/v1/foods/barcode/6221000123456', { headers: p1Hdr }, enforce), 402, 'PRO_ENTITLEMENT_REQUIRED');
      await errJson(await call('/v1/foods/barcode', {
        method: 'POST', headers: { ...p1Hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: '6221000888888', nameEn: 'Gated Bar', valuesPer100g: { energy: 200, protein: 10, carbs: 20, fat: 8 } }),
      }, enforce), 402, 'PRO_ENTITLEMENT_REQUIRED');
      await errJson(await call('/v1/progress/analytics?range=90d', { headers: p1Hdr }, enforce), 402, 'PRO_ENTITLEMENT_REQUIRED');
      await errJson(await call('/v1/progress/analytics?range=all', { headers: p1Hdr }, enforce), 402, 'PRO_ENTITLEMENT_REQUIRED');
      await errJson(await call('/v1/progress/analytics?range=7d', { headers: p1Hdr }, enforce), 400, 'INVALID_DATE_RANGE');

      // Free features remain 200 even under ENFORCE_PRO_ENTITLEMENTS=true
      await okJson(await call('/v1/progress/analytics?range=30d', { headers: p1Hdr }, enforce));
      await okJson(await call('/v1/pantry/catalog', { headers: p1Hdr }, enforce));
      await okJson(await call('/v1/nutrition/fasting-state', { headers: p1Hdr }, enforce));

      // Ramadan mode ON then OFF restores 16:8 intermittent fasting window
      p1Rev = (await okJson(await postCmd(p1Token, p1Rev, 'ramadan_mode', { enabled: true, iftarTime: '18:15', suhoorCutoffTime: '04:00', endDate: '2026-12-20' }, { minimal: true, envExtra: enforce }))).revision;
      p1Rev = (await okJson(await postCmd(p1Token, p1Rev, 'ramadan_mode', { enabled: false }, { minimal: true, envExtra: enforce }))).revision;
      const postRamFasting = await okJson(await call('/v1/nutrition/fasting-state', { headers: p1Hdr }));
      assert.equal(postRamFasting.ramadanMode?.enabled, false);
      assert.equal(postRamFasting.mode, 'if_16_8', 'Disabling Ramadan mode must restore if_16_8 mode');
      assert.equal(postRamFasting.windowStart, '12:00');
      assert.equal(postRamFasting.windowEnd, '20:00');

      // Notification preference exemptSuhoorFromQuietHours
      p1Rev = (await okJson(await postCmd(p1Token, p1Rev, 'notification_preferences', { exemptSuhoorFromQuietHours: true }, { minimal: true }))).revision;
      const nPrefs = await okJson(await call('/v1/notifications/preferences', { headers: p1Hdr }));
      assert.equal(nPrefs.exemptSuhoorFromQuietHours, true);

      // 10e. Atomic food_entry_update, workout_delete, session_delete, body_measurement merge & earlyRenew
      const addEntry = await okJson(await postCmd(p1Token, p1Rev, 'food_entry', {
        date: p1Today, slot: 'lunch', source: 'manual', name: 'Grilled Chicken Plate', energy: 450, protein: 40, carbs: 30, fat: 12,
      }, { minimal: true }));
      p1Rev = addEntry.revision;
      const createdEntryId = addEntry.affected.find((a) => a.entityType === 'food_entry')?.entityId;
      assert.ok(createdEntryId);
      const updEntry = await okJson(await postCmd(p1Token, p1Rev, 'food_entry_update', {
        id: createdEntryId, slot: 'dinner', energy: 520, protein: 46,
      }, { minimal: true }));
      p1Rev = updEntry.revision;
      const diaryAfterUpd = await okJson(await call(`/v1/food-diary?date=${p1Today}`, { headers: p1Hdr }));
      const edited = diaryAfterUpd.entries.find((e) => e.id === createdEntryId);
      assert.equal(edited?.slot, 'dinner');
      assert.equal(Number(edited?.snapshot?.values?.energy), 520);

      // Workout log + session -> workout_delete & session_delete
      const p1Day = p1Gen.workoutPlan.days[0];
      const p1Ex = p1Day.exercises[0];
      p1Rev = (await okJson(await postCmd(p1Token, p1Rev, 'workout', {
        date: p1Today, dayIndex: p1Day.dayIndex, exerciseId: p1Ex.id, sets: [{ kg: 20, reps: 10, rir: 2 }], autoSession: true,
      }, { minimal: true }))).revision;
      p1Rev = (await okJson(await postCmd(p1Token, p1Rev, 'workout_delete', {
        date: p1Today, dayIndex: p1Day.dayIndex, exerciseId: p1Ex.id,
      }, { minimal: true }))).revision;
      p1Rev = (await okJson(await postCmd(p1Token, p1Rev, 'session_delete', {
        date: p1Today, dayIndex: p1Day.dayIndex, deleteWorkouts: true,
      }, { minimal: true }))).revision;
      const wLogsAfterDel = await okJson(await call('/v1/workout-logs', { headers: p1Hdr }));
      assert.equal(wLogsAfterDel.items.length, 0);

      // Body measurement same-date merge preserves omitted fields
      p1Rev = (await okJson(await postCmd(p1Token, p1Rev, 'body_measurement', { date: p1Today, waistCm: 84 }, { minimal: true }))).revision;
      p1Rev = (await okJson(await postCmd(p1Token, p1Rev, 'body_measurement', { date: p1Today, chestCm: 101 }, { minimal: true }))).revision;
      const mergedMeas = await okJson(await call('/v1/measurements', { headers: p1Hdr }));
      assert.equal(mergedMeas.items[0].waistCm, 84);
      assert.equal(mergedMeas.items[0].chestCm, 101);

      // Early plan renewal (earlyRenew: true) regenerates without PLAN_STILL_ACTIVE error
      const earlyRen = await okJson(await postCmd(p1Token, p1Rev, 'renew_plan', { earlyRenew: true }, { minimal: true }));
      p1Rev = earlyRen.revision;

      // Wearables partial-success batch (1 valid + 1 invalid record)
      const partialWear = await okJson(await call('/v1/wearables/ingest', {
        method: 'POST',
        headers: { ...p1Hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [
            { type: 'activity', date: p1Today, steps: 7500, activeEnergyKcal: 310, source: 'health_connect', externalRecordId: 'hc-partial-1' },
            { type: 'weight', date: p1Today, kg: 9999, source: 'health_connect', externalRecordId: 'hc-bad-weight' },
          ],
        }),
      }));
      p1Rev = partialWear.revision;
      assert.equal(partialWear.ingested, 1);
      assert.equal(partialWear.skippedCount, 1);
      assert.ok(Array.isArray(partialWear.skippedRecords) && partialWear.skippedRecords.length === 1);

      // 10f. Withdrawn health_data_processing consent lock + Bootstrap ETag invalidation
      const bootBeforeConsent = await call('/v1/bootstrap', { headers: p1Hdr });
      const etagBeforeConsent = bootBeforeConsent.headers.get('ETag');
      await okJson(await call('/v1/account/consents', {
        method: 'POST',
        headers: { ...p1Hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentType: 'health_data_processing', version: '1.0.0', accepted: false }),
      }));
      const bootAfterConsent = await call('/v1/bootstrap', { headers: { ...p1Hdr, 'If-None-Match': etagBeforeConsent } });
      assert.equal(bootAfterConsent.status, 200, 'Bootstrap ETag must invalidate when consents change');
      await errJson(await postCmd(p1Token, p1Rev, 'review', {}, { minimal: true }), 403, 'HEALTH_CONSENT_REQUIRED');
      // Re-grant consent unlocks review
      await okJson(await call('/v1/account/consents', {
        method: 'POST',
        headers: { ...p1Hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentType: 'health_data_processing', version: '1.0.0', accepted: true }),
      }));

      // 10g. Billing edge cases: cross-store 409, account_hold & paused suspending Pro, restore conflict, GDPR trial tombstone
      await okJson(await call('/v1/subscriptions/verify', {
        method: 'POST',
        headers: { ...p1Hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'android', productId: 'curafit_pro.monthly', purchaseToken: 'p1-gp-tok-001', isTrial: true }),
      }));
      // Cross-store double-billing guard
      await errJson(await call('/v1/subscriptions/verify', {
        method: 'POST',
        headers: { ...p1Hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'ios', productId: 'curafit_pro.monthly', originalTransactionId: 'p1-apple-tx-001' }),
      }), 409, 'ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM');

      // Google RTDN notificationType 5 (ON_HOLD) suspends Pro cleanly
      await okJson(await call('/v1/webhooks/google-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'test-webhook-secret-123' },
        body: JSON.stringify({ subscriptionNotification: { notificationType: 5, purchaseToken: 'p1-gp-tok-001' } }),
      }));
      const entHold = await okJson(await call('/v1/entitlements', { headers: p1Hdr }));
      assert.equal(entHold.tier, 'free', 'account_hold must suspend Pro tier');
      assert.equal(entHold.isOnHold, true);

      // Google RTDN notificationType 10 (PAUSED) keeps Pro suspended with isPaused: true
      await okJson(await call('/v1/webhooks/google-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'test-webhook-secret-123' },
        body: JSON.stringify({ subscriptionNotification: { notificationType: 10, purchaseToken: 'p1-gp-tok-001' } }),
      }));
      const entPaused = await okJson(await call('/v1/entitlements', { headers: p1Hdr }));
      assert.equal(entPaused.tier, 'free', 'paused must suspend Pro tier');
      assert.equal(entPaused.isPaused, true);

      // Restore conflict when another user passes p1's purchaseToken
      await errJson(await call('/v1/subscriptions/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'android', tokens: ['p1-gp-tok-001'] }),
      }), 409, 'SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT');

      // GDPR Export contains oauthIdentities & live entitlements
      const p1Export = await okJson(await call('/v1/account/export', { headers: p1Hdr }));
      assert.ok(Array.isArray(p1Export.oauthIdentities) && p1Export.oauthIdentities.length === 1);
      assert.ok(p1Export.entitlements);

      // GDPR Delete writes anonymized trial tombstone -> re-signing-up with same Google sub/email has trialEligible: false
      await okJson(await call('/v1/account/delete', {
        method: 'DELETE',
        headers: { ...p1Hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }));
      const p1ReReg = await okJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: p1GoogleJwt, deviceId: 'p1-device-2' }),
      }), 201);
      const postDelOfferings = await okJson(await call('/v1/subscriptions/offerings?platform=android', {
        headers: { Authorization: `Bearer ${p1ReReg.accessToken}` },
      }));
      assert.equal(postDelOfferings.trialEligible, false, 'Trial tombstone must survive GDPR delete to prevent trial abuse');
    });

    // 11. Wellness & V1 Feature Pack: Custom Home Recipes, Dedicated Cardio Tracking, Optional Female Cycle Awareness & Bilingual Grocery Sharing
    await t.test('Custom recipes, dedicated cardio tracking, optional female cycle awareness & bilingual grocery list with full edge cases', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const maleJwt = await googleSigner.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: 'google-sub-wellness-male',
        email: 'wellness.male@curafit.app',
        email_verified: true,
        name: 'Tarek Runner',
        iat: nowSec,
        exp: nowSec + 3600,
      });
      const maleAuth = await okJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: maleJwt, deviceId: 'well-m-1' }),
      }), 201);
      const mToken = maleAuth.accessToken;
      const mHdr = { Authorization: `Bearer ${mToken}` };

      // 11a. Generate male profile with knee injury + nutrition_and_workouts
      const mGen = await okJson(await postCmd(mToken, 0, 'generate', {
        name: 'Tarek Runner', age: 31, sex: 'male', weight: 80, height: 178,
        goal: 'lose', targetWeight: 74, activity: 'light', dietType: 'balanced',
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5],
        injuries: ['knee'], healthConfirmed: true,
      }));
      let mRev = mGen.revision;
      const activePlanId = mGen.plans[0].id;
      const todayDate = mGen.serverDate;

      // Bilingual grocery list items include name, nameEn, nameAr & preparationState for WhatsApp sharing
      const grocery = await okJson(await call(`/v1/plans/${encodeURIComponent(activePlanId)}/grocery-list?days=all`, { headers: mHdr }));
      assert.ok(grocery.categories.length > 0);
      const firstGroc = grocery.categories[0].items[0];
      assert.ok(firstGroc.name && firstGroc.nameEn && firstGroc.nameAr, 'Grocery items must include name, nameEn, and nameAr');
      assert.ok(['cooked', 'raw', 'as_sold', 'ready_to_eat', 'dry', 'raw_as_sold'].includes(firstGroc.preparationState));

      // 11b. Custom Home Recipes ("My Recipes") — save, update, search, log by servings & grams, update portion, delete preserves frozen snapshot
      await errJson(await postCmd(mToken, mRev, 'recipe_save', {
        name: 'Bad', servings: 2, items: [{ foodId: 'nonexistent_food_xyz', grams: 100 }],
      }, { minimal: true }), 400, 'INVALID_RECIPE_PAYLOAD');

      const recSave1 = await okJson(await postCmd(mToken, mRev, 'recipe_save', {
        name: 'Home Chicken Rice Bowl',
        servings: 2,
        notes: 'Light olive oil',
        items: [{ foodId: 'chicken', grams: 300 }, { foodId: 'rice', grams: 200 }],
      }, { minimal: true }));
      mRev = recSave1.revision;

      const recList1 = await okJson(await call('/v1/recipes?q=chicken', { headers: mHdr }));
      assert.equal(recList1.total, 1);
      const savedRecipe = recList1.items[0];
      assert.equal(savedRecipe.servings, 2);
      assert.equal(savedRecipe.totalGrams, 500);
      assert.ok(savedRecipe.perServing.energy > 0 && savedRecipe.per100g.energy > 0);

      // Update same recipe in place
      const recUpdate = await okJson(await postCmd(mToken, mRev, 'recipe_save', {
        id: savedRecipe.id,
        name: 'Home Chicken Rice Bowl Deluxe',
        servings: 2,
        items: [{ foodId: 'chicken', grams: 300 }, { foodId: 'rice', grams: 250 }],
      }, { minimal: true }));
      mRev = recUpdate.revision;
      const recList2 = await okJson(await call('/v1/recipes', { headers: mHdr }));
      assert.equal(recList2.total, 1);
      assert.equal(recList2.items[0].totalGrams, 550);

      // Log 1.5 servings of saved recipe
      const logRec1 = await okJson(await postCmd(mToken, mRev, 'food_entry', {
        date: todayDate, slot: 'lunch', source: 'recipe', recipeId: savedRecipe.id, servings: 1.5,
      }, { minimal: true }));
      mRev = logRec1.revision;
      // Log 200g of saved recipe
      const logRec2 = await okJson(await postCmd(mToken, mRev, 'food_entry', {
        date: todayDate, slot: 'dinner', source: 'recipe', recipeId: savedRecipe.id, grams: 200,
      }, { minimal: true }));
      mRev = logRec2.revision;

      const diaryBeforeDel = await okJson(await call(`/v1/food-diary?date=${todayDate}`, { headers: mHdr }));
      assert.equal(diaryBeforeDel.entries.length, 2);
      const lunchRecEntry = diaryBeforeDel.entries.find((e) => e.slot === 'lunch');
      const lunchEnergy15 = Number(lunchRecEntry.snapshot.values.energy);
      assert.ok(lunchEnergy15 > 0);

      // Atomic food_entry_update scales recipe entry from 1.5 -> 2.0 servings
      const updRecEntry = await okJson(await postCmd(mToken, mRev, 'food_entry_update', {
        id: lunchRecEntry.id, servings: 2.0,
      }, { minimal: true }));
      mRev = updRecEntry.revision;
      const diaryAfterUpd = await okJson(await call(`/v1/food-diary?date=${todayDate}`, { headers: mHdr }));
      const lunchEnergy20 = Number(diaryAfterUpd.entries.find((e) => e.id === lunchRecEntry.id).snapshot.values.energy);
      assert.ok(Math.abs(lunchEnergy20 - (lunchEnergy15 * 2 / 1.5)) < 2, 'Recipe entry update must scale energy accurately');

      // Delete saved recipe -> future log fails 404, but historical frozen diary entry remains intact!
      const delRec = await okJson(await postCmd(mToken, mRev, 'recipe_delete', { id: savedRecipe.id }, { minimal: true }));
      mRev = delRec.revision;
      await errJson(await postCmd(mToken, mRev, 'recipe_delete', { id: savedRecipe.id }, { minimal: true }), 404, 'RECIPE_NOT_FOUND');
      await errJson(await postCmd(mToken, mRev, 'food_entry', {
        date: todayDate, slot: 'snack', source: 'recipe', recipeId: savedRecipe.id, servings: 1,
      }, { minimal: true }), 404, 'RECIPE_NOT_FOUND');
      const diaryAfterDel = await okJson(await call(`/v1/food-diary?date=${todayDate}`, { headers: mHdr }));
      assert.equal(diaryAfterDel.entries.length, 2, 'Deleting saved recipe must never mutate or remove past food diary entries');
      assert.equal(Number(diaryAfterDel.entries.find((e) => e.id === lunchRecEntry.id).snapshot.values.energy), lunchEnergy20);

      // 11c. Dedicated Cardio Tracking — MET estimate, rest-day hydration boost, high-impact caution, dedupe, 5/day limit, Weekly Wrapped & delete
      // Pick a guaranteed past non-workout day within the last 6 days (since workout days are [1, 3, 5])
      const dCursor = new Date(`${todayDate}T12:00:00Z`);
      let restDate = todayDate;
      for (let i = 1; i <= 6; i++) {
        const cand = new Date(dCursor.getTime() - i * 86400000);
        if (![1, 3, 5].includes(cand.getUTCDay())) {
          restDate = cand.toISOString().slice(0, 10);
          break;
        }
      }
      // Log water on restDate before cardio to capture baseline targetLiters
      const wBefore = await okJson(await postCmd(mToken, mRev, 'water', { date: restDate, cups: 4 }, { minimal: true }));
      mRev = wBefore.revision;
      const wLogsBefore = await okJson(await call('/v1/water-logs', { headers: mHdr }));
      const baseRestWater = wLogsBefore.items.find((x) => x.date === restDate).targetLiters;

      // Log 35 min moderate brisk_walking on restDate -> boosts water target by +0.5L & estimates MET kcal
      const c1 = await okJson(await postCmd(mToken, mRev, 'cardio_log', {
        date: restDate, modality: 'brisk_walking', durationMinutes: 35, intensity: 'moderate', distanceKm: 3.1,
      }, { minimal: true }));
      mRev = c1.revision;
      const wAfter = await okJson(await postCmd(mToken, mRev, 'water', { date: restDate, cups: 5 }, { minimal: true }));
      mRev = wAfter.revision;
      const wLogsAfter = await okJson(await call('/v1/water-logs', { headers: mHdr }));
      const boostedRestWater = wLogsAfter.items.find((x) => x.date === restDate).targetLiters;
      assert.ok(Math.abs((boostedRestWater - baseRestWater) - 0.5) < 0.05, `Expected +0.5L rest-day cardio hydration boost (${baseRestWater} -> ${boostedRestWater})`);

      // High-impact running with declared knee injury returns non-blocking CARDIO_HIGH_IMPACT_CAUTION
      const c2 = await okJson(await postCmd(mToken, mRev, 'cardio_log', {
        date: todayDate, modality: 'running', durationMinutes: 25, intensity: 'vigorous',
        source: 'health_connect', externalRecordId: 'hc-run-001',
      }, { minimal: true }));
      mRev = c2.revision;

      // Dedupe by externalRecordId updates existing record instead of creating duplicate
      const c2Dup = await okJson(await postCmd(mToken, mRev, 'cardio_log', {
        date: todayDate, modality: 'running', durationMinutes: 30, intensity: 'vigorous',
        source: 'health_connect', externalRecordId: 'hc-run-001',
      }, { minimal: true }));
      mRev = c2Dup.revision;

      const cardioList = await okJson(await call('/v1/cardio-logs', { headers: mHdr }));
      assert.equal(cardioList.total, 2, 'externalRecordId must dedupe instead of duplicating');
      const runItem = cardioList.items.find((x) => x.externalRecordId === 'hc-run-001');
      assert.equal(runItem.durationMinutes, 30);
      assert.ok(runItem.estimatedKcal > 200);
      assert.equal(runItem.safetyCaution?.code, 'CARDIO_HIGH_IMPACT_CAUTION');

      // Bootstrap todaySummary.cardio + Weekly Wrapped cardioSessionsCount & cardioMinutes
      const mBoot = await okJson(await call('/v1/bootstrap', { headers: mHdr }));
      assert.equal(mBoot.todaySummary.cardio.sessionsCount, 1);
      assert.equal(mBoot.todaySummary.cardio.totalMinutes, 30);
      assert.equal(mBoot.todaySummary.cycleState, null, 'Male bootstrap must return cycleState: null');

      const wrapped = await okJson(await call('/v1/progress/weekly-wrapped', { headers: mHdr }));
      assert.ok(wrapped.cardioSessionsCount >= 2);
      assert.ok(wrapped.cardioMinutes >= 65);

      // Daily cap: 5 cardio logs max per date -> 6th returns 400 CARDIO_DAILY_LIMIT_EXCEEDED
      for (let i = 0; i < 4; i++) {
        const extra = await okJson(await postCmd(mToken, mRev, 'cardio_log', {
          date: todayDate, modality: 'walking', durationMinutes: 15, intensity: 'low',
        }, { minimal: true }));
        mRev = extra.revision;
      }
      await errJson(await postCmd(mToken, mRev, 'cardio_log', {
        date: todayDate, modality: 'walking', durationMinutes: 15, intensity: 'low',
      }, { minimal: true }), 400, 'CARDIO_DAILY_LIMIT_EXCEEDED');

      // Delete cardio session & 404 on nonexistent ID
      const delCardio = await okJson(await postCmd(mToken, mRev, 'cardio_delete', { id: runItem.id }, { minimal: true }));
      mRev = delCardio.revision;
      await errJson(await postCmd(mToken, mRev, 'cardio_delete', { id: runItem.id }, { minimal: true }), 404, 'CARDIO_LOG_NOT_FOUND');

      // Male profile strictly blocked from cycle awareness
      const maleCycleState = await okJson(await call('/v1/cycle/state', { headers: mHdr }));
      assert.equal(maleCycleState.available, false);
      assert.equal(maleCycleState.enabled, false);
      await errJson(await postCmd(mToken, mRev, 'cycle_settings', { enabled: true }, { minimal: true }), 403, 'CYCLE_TRACKING_UNAVAILABLE');
      await errJson(await postCmd(mToken, mRev, 'cycle_log', { date: todayDate, periodStart: true }, { minimal: true }), 403, 'CYCLE_TRACKING_UNAVAILABLE');

      // 11d. Optional Female Menstrual Cycle Awareness — opt-in, luteal water retention, brief note, widget privacy, periodStart advance, pregnancy auto-pause, consent lock & GDPR export/delete
      const femaleJwt = await googleSigner.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: 'google-sub-wellness-female',
        email: 'wellness.female@curafit.app',
        email_verified: true,
        name: 'Salma Athlete',
        iat: nowSec,
        exp: nowSec + 3600,
      });
      const femaleAuth = await okJson(await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: femaleJwt, deviceId: 'well-f-1' }),
      }), 201);
      const fToken = femaleAuth.accessToken;
      const fHdr = { Authorization: `Bearer ${fToken}` };

      const fGen = await okJson(await postCmd(fToken, 0, 'generate', {
        name: 'Salma Athlete', age: 28, sex: 'female', weight: 64, height: 165,
        goal: 'lose', targetWeight: 59, activity: 'moderate', dietType: 'balanced',
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true,
      }));
      let fRev = fGen.revision;
      const fToday = fGen.serverDate;

      // Initially available=true, enabled=false, bootstrap.cycleState=null
      const fCycleInit = await okJson(await call('/v1/cycle/state', { headers: fHdr }));
      assert.equal(fCycleInit.available, true);
      assert.equal(fCycleInit.enabled, false);
      assert.equal(fCycleInit.disclaimer, 'wellness_tracking_not_contraception_or_medical_diagnosis');

      // Opt-in with lastPeriodStartDate = 25 days ago -> Day 26 (late luteal, waterRetentionLikely=true)
      const lutealAnchor = new Date(Date.parse(`${fToday}T12:00:00Z`) - 25 * 86400000).toISOString().slice(0, 10);
      const cySet = await okJson(await postCmd(fToken, fRev, 'cycle_settings', {
        enabled: true, averageCycleLengthDays: 28, averagePeriodLengthDays: 5, lastPeriodStartDate: lutealAnchor,
      }, { minimal: true }));
      fRev = cySet.revision;

      const fCycleLuteal = await okJson(await call('/v1/cycle/state', { headers: fHdr }));
      assert.equal(fCycleLuteal.enabled, true);
      assert.equal(fCycleLuteal.currentCycleDay, 26);
      assert.equal(fCycleLuteal.phase, 'luteal');
      assert.equal(fCycleLuteal.waterRetentionLikely, true);
      assert.equal(fCycleLuteal.coachingHintCode, 'CYCLE_LUTEAL_WATER_RETENTION');
      assert.ok(fCycleLuteal.nextPeriodEstimateDate > fToday);

      const fBoot = await okJson(await call('/v1/bootstrap', { headers: fHdr }));
      assert.equal(fBoot.todaySummary.cycleState.phase, 'luteal');
      assert.equal(fBoot.todaySummary.cycleState.waterRetentionLikely, true);

      // Coaching brief includes CYCLE_LUTEAL_WATER_RETENTION pure-English note
      const fBrief = await okJson(await call('/v1/coaching/brief', { headers: fHdr }));
      assert.ok(fBrief.notes.some((n) => n.code === 'CYCLE_LUTEAL_WATER_RETENTION'), 'Coaching brief must emit CYCLE_LUTEAL_WATER_RETENTION in late luteal phase');

      // Lock-screen Widget Snapshot NEVER leaks cycle data
      const fWidget = await okJson(await call('/v1/widgets/snapshot', { headers: fHdr }));
      assert.equal(fWidget.cycleState, undefined);
      assert.ok(!JSON.stringify(fWidget).toLowerCase().includes('luteal'));

      // Log periodStart=true today -> advances anchor & switches phase to menstrual (day 1)
      const cyLog = await okJson(await postCmd(fToken, fRev, 'cycle_log', {
        date: fToday, periodStart: true, flowLevel: 'medium', crampSeverity: 3, symptoms: ['cramps', 'fatigue'],
      }, { minimal: true }));
      fRev = cyLog.revision;
      const fCycleMenstrual = await okJson(await call('/v1/cycle/state', { headers: fHdr }));
      assert.equal(fCycleMenstrual.currentCycleDay, 1);
      assert.equal(fCycleMenstrual.phase, 'menstrual');
      assert.equal(fCycleMenstrual.coachingHintCode, 'CYCLE_MENSTRUAL_GENTLE_TRAINING');
      assert.equal(fCycleMenstrual.recentLogs.length, 1);

      // Switch to pregnancy -> cycle awareness auto-pauses with nextPeriodEstimateDate: null
      const fPreg = await okJson(await postCmd(fToken, fRev, 'generate', {
        name: 'Salma Athlete', age: 28, sex: 'female', weight: 65, height: 165,
        goal: 'maintain', maternalStatus: 'pregnant_t2', activity: 'light', dietType: 'balanced',
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true,
      }));
      fRev = fPreg.revision;
      const fCyclePreg = await okJson(await call('/v1/cycle/state', { headers: fHdr }));
      assert.equal(fCyclePreg.pausedReason, 'pregnancy');
      assert.equal(fCyclePreg.nextPeriodEstimateDate, null);
      assert.equal(fCyclePreg.coachingHintCode, 'CYCLE_PAUSED_PREGNANCY');

      // Withdrawing health_data_processing consent blocks cycle_log & cycle_settings with 403 HEALTH_CONSENT_REQUIRED
      await okJson(await call('/v1/account/consents', {
        method: 'POST',
        headers: { ...fHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentType: 'health_data_processing', version: '1.0', accepted: false }),
      }));
      await errJson(await postCmd(fToken, fRev, 'cycle_log', { date: fToday, flowLevel: 'light' }, { minimal: true }), 403, 'HEALTH_CONSENT_REQUIRED');
      await errJson(await postCmd(fToken, fRev, 'cycle_settings', { enabled: false }, { minimal: true }), 403, 'HEALTH_CONSENT_REQUIRED');

      // GDPR Export contains cycleSettings, customRecipes, cardioLogs, cycleLogs
      const fExport = await okJson(await call('/v1/account/export', { headers: fHdr }));
      assert.ok(fExport.cycleSettings && fExport.cycleSettings.enabled === true);
      assert.ok(Array.isArray(fExport.logs.cycleLogs) && fExport.logs.cycleLogs.length === 1);
      assert.ok(Array.isArray(fExport.logs.customRecipes));
      assert.ok(Array.isArray(fExport.logs.cardioLogs));

      // GDPR Delete erases all 3 new wellness tables cleanly
      const fDel = await okJson(await call('/v1/account/delete', {
        method: 'DELETE',
        headers: { ...fHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }));
      assert.equal(fDel.deleted, true);
      assert.ok(fDel.tablesCleared >= 30, `Expected >= 30 cleared tables including 3 new wellness tables, got ${fDel.tablesCleared}`);
    });
  } finally {
    await mf.dispose();
  }
});
