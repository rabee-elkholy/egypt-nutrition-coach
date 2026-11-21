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
  } finally {
    await mf.dispose();
  }
});
