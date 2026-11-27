import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';
import { empty, generate, command, previewPlan, evaluateEligibility } from '../server/coaching.mjs';
import { expandedKeys } from '../planner-exclusions.mjs';
import { needsHealthConfirmation, hasActiveParqRedFlag } from '../coaching-shared.mjs';
import { runScheduledNotifications } from '../server/push.mjs';

const TEST_ENV = {
  AUTH_JWT_SECRET: 'kan112-contract-test-secret-key-256-bits',
  AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
  RATE_LIMIT_PER_MINUTE: '200',
  OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
};

const BASE_DRAFT = {
  name: 'Ahmed Hassan',
  birthDate: '1995-05-14',
  sex: 'male',
  weight: 82,
  height: 178,
  goal: 'lose',
  targetWeight: 75,
  goalPace: 'moderate',
  activity: 'light',
  serviceTrack: 'nutrition_and_workouts',
  fitnessLevel: 'intermediate',
  workoutLocation: 'gym_only',
  selectedWorkoutDays: [1, 3, 5],
  dietType: 'balanced',
  region: 'egypt',
  budget: 'medium',
  mealsCount: 4,
  parqRedFlag: false,
  healthConfirmed: true,
};

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createTestOidcSigner(kid = 'kan112-k1') {
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

test('KAN-112: Closed-loop PAR-Q enforcement across all workout-bearing tracks', () => {
  for (const track of ['nutrition_and_workouts', 'workouts_only']) {
    const draft = { ...BASE_DRAFT, serviceTrack: track, parqRedFlag: true, healthConfirmed: true };
    const elig = evaluateEligibility(draft);
    assert.equal(elig.status, 'requires_review');
    assert.ok(elig.reasons.some(r => r.code === 'PARQ_CLEARANCE_REQUIRED'));
    assert.ok(elig.clinicalSummary);
    assert.equal(elig.clinicalSummary.parqRedFlag, true);

    const prev = previewPlan(draft);
    assert.equal(prev.eligibility.status, 'requires_review');
    assert.equal(prev.feasibility.workoutFeasible, false);
    assert.ok(prev.feasibility.blockingConflicts.some(c => c.code === 'PARQ_CLEARANCE_REQUIRED' && c.field === 'parqRedFlag'));

    assert.throws(
      () => generate(empty(), draft),
      err => err.status === 422 && err.code === 'PARQ_CLEARANCE_REQUIRED'
    );
  }

  // Switching to nutrition_only remains eligible & generates cleanly even with parqRedFlag: true
  const nutOnlyDraft = { ...BASE_DRAFT, serviceTrack: 'nutrition_only', parqRedFlag: true };
  const nutElig = evaluateEligibility(nutOnlyDraft);
  assert.equal(nutElig.status, 'eligible');
  const nutPrev = previewPlan(nutOnlyDraft);
  assert.equal(nutPrev.feasibility.nutritionFeasible, true);
  assert.equal(nutPrev.feasibility.workoutFeasible, true);
  const nutState = generate(empty(), nutOnlyDraft);
  assert.equal(nutState.onboarding.workoutPrefs.parqRedFlag, true);
  assert.equal(hasActiveParqRedFlag(nutState), false);

  // Legacy workouts_only without parqRedFlag still uses needsHealthConfirmation; confirm_health cannot bypass explicit parqRedFlag === true
  const legacyState = generate(empty(), { ...BASE_DRAFT, serviceTrack: 'workouts_only', parqRedFlag: undefined, healthConfirmed: true });
  delete legacyState.onboarding.workoutPrefs.healthConfirmed;
  assert.equal(needsHealthConfirmation(legacyState), true);
  const confirmed = command(structuredClone(legacyState), 'confirm_health', { healthy: true, injuryFree: true });
  assert.equal(confirmed.onboarding.workoutPrefs.healthConfirmed, true);

  legacyState.onboarding.workoutPrefs.parqRedFlag = true;
  assert.equal(needsHealthConfirmation(legacyState), false);
  assert.equal(hasActiveParqRedFlag(legacyState), true);
  assert.throws(
    () => command(structuredClone(legacyState), 'confirm_health', { healthy: true, injuryFree: true }),
    err => err.status === 422 && err.code === 'PARQ_CLEARANCE_REQUIRED'
  );

  // Explicit parqRedFlag: false clears workouts_only without requiring redundant healthConfirmed
  const clearedOnly = generate(empty(), { ...BASE_DRAFT, serviceTrack: 'workouts_only', parqRedFlag: false, healthConfirmed: false });
  assert.equal(clearedOnly.onboarding.workoutPrefs.parqRedFlag, false);
  assert.equal(clearedOnly.onboarding.workoutPrefs.healthConfirmed, true);
});

test('KAN-112: Clinical complexity, mutual exclusion, and multi-injury gates', () => {
  // 1. diabetes_t1 + diabetes_t2 mutual exclusion -> 400 CONFLICTING_CONDITIONS everywhere
  const conflictDraft = { ...BASE_DRAFT, diseases: ['diabetes_t1', 'diabetes_t2'] };
  for (const fn of [() => evaluateEligibility(conflictDraft), () => previewPlan(conflictDraft), () => generate(empty(), conflictDraft)]) {
    assert.throws(fn, err => err.status === 400 && err.code === 'CONFLICTING_CONDITIONS' && err.fieldErrors?.[0]?.field === 'diseases');
  }

  // 2. kidney + diabetes_t1 -> MULTI_CONDITION_CLINICAL_REVIEW
  const kidneyT1 = { ...BASE_DRAFT, diseases: ['kidney', 'diabetes_t1'] };
  assert.equal(evaluateEligibility(kidneyT1).status, 'requires_review');
  assert.ok(evaluateEligibility(kidneyT1).reasons.some(r => r.code === 'MULTI_CONDITION_CLINICAL_REVIEW'));
  assert.throws(() => generate(empty(), kidneyT1), err => err.status === 422 && err.code === 'MULTI_CONDITION_CLINICAL_REVIEW');

  // 3. pregnant_* + kidney OR diabetes_t1 -> MULTI_CONDITION_CLINICAL_REVIEW
  for (const maternalStatus of ['pregnant_t1', 'pregnant_t2', 'pregnant_t3']) {
    for (const cond of ['kidney', 'diabetes_t1']) {
      const pregHigh = { ...BASE_DRAFT, sex: 'female', goal: 'maintain', targetWeight: null, maternalStatus, diseases: [cond] };
      const elig = evaluateEligibility(pregHigh);
      assert.equal(elig.status, 'requires_review');
      assert.ok(elig.reasons.some(r => r.code === 'MULTI_CONDITION_CLINICAL_REVIEW'));
      assert.throws(() => generate(empty(), pregHigh), err => err.status === 422 && err.code === 'MULTI_CONDITION_CLINICAL_REVIEW');
    }
  }

  // 4. >= 3 concurrent dietary-restricting chronic conditions -> MULTI_CONDITION_CLINICAL_REVIEW
  const threeDietary = { ...BASE_DRAFT, diseases: ['hypertension', 'cholesterol', 'gout'] };
  assert.ok(evaluateEligibility(threeDietary).reasons.some(r => r.code === 'MULTI_CONDITION_CLINICAL_REVIEW'));
  assert.throws(() => generate(empty(), threeDietary), err => err.status === 422 && err.code === 'MULTI_CONDITION_CLINICAL_REVIEW');

  // 2 dietary + 1 non-dietary (hypothyroid) remains eligible
  const twoDietaryOneOther = { ...BASE_DRAFT, diseases: ['hypertension', 'cholesterol', 'hypothyroid'] };
  assert.equal(evaluateEligibility(twoDietaryOneOther).status, 'eligible');

  // 5. Multi-injury: 3 -> soft warning; >= 4 -> MULTI_INJURY_REQUIRES_REVIEW (and preview returns 200 OK with workoutFeasible: false)
  const threeInj = { ...BASE_DRAFT, injuries: ['knee', 'wrist', 'neck'] };
  const elig3 = evaluateEligibility(threeInj);
  assert.equal(elig3.status, 'eligible');
  assert.ok(elig3.notes.some(n => n.code === 'MULTI_INJURY_WARNING'));

  const fourInj = { ...BASE_DRAFT, injuries: ['knee', 'lower_back', 'shoulder', 'wrist'] };
  const elig4 = evaluateEligibility(fourInj);
  assert.equal(elig4.status, 'requires_review');
  assert.ok(elig4.reasons.some(r => r.code === 'MULTI_INJURY_REQUIRES_REVIEW'));

  const prev4 = previewPlan(fourInj);
  assert.equal(prev4.eligibility.status, 'requires_review');
  assert.equal(prev4.feasibility.workoutFeasible, false);
  assert.ok(prev4.feasibility.blockingConflicts.some(c => c.code === 'MULTI_INJURY_REQUIRES_REVIEW'));

  assert.throws(() => generate(empty(), fourInj), err => err.status === 422 && err.code === 'MULTI_INJURY_REQUIRES_REVIEW');

  // Switching to nutrition_only with 4 injuries is allowed
  const fourInjNutOnly = { ...fourInj, serviceTrack: 'nutrition_only' };
  assert.equal(evaluateEligibility(fourInjNutOnly).status, 'eligible');
  const sNut = generate(empty(), fourInjNutOnly);
  assert.equal(sNut.workoutPlan, null);

  // Infeasible injury + home_only bodyweight -> preview MUST NOT throw 400 WORKOUT_INFEASIBLE
  const infeasibleHome = {
    ...BASE_DRAFT,
    fitnessLevel: 'beginner',
    workoutLocation: 'home_only',
    homeEquipment: ['none'],
    injuries: ['knee', 'lower_back', 'shoulder', 'wrist', 'ankle', 'hip'],
  };
  const prevInfeasible = previewPlan(infeasibleHome);
  assert.equal(prevInfeasible.eligibility.status, 'requires_review');
  assert.ok(prevInfeasible.eligibility.reasons.some(r => r.code === 'MULTI_INJURY_REQUIRES_REVIEW'));
  assert.equal(prevInfeasible.feasibility.workoutFeasible, false);
  assert.ok(prevInfeasible.feasibility.blockingConflicts.some(c => c.code === 'MULTI_INJURY_REQUIRES_REVIEW'));
});

test('KAN-112: Preview-to-commit feasibility parity, canonical enums, senior workoutUiModeDefault, breastfeeding pace & offal', () => {
  // Unsupported dietType rejected in both preview & generate
  assert.throws(() => previewPlan({ ...BASE_DRAFT, dietType: 'pescatarian' }), err => err.status === 400 && err.code === 'INVALID_DIET_TYPE');
  assert.throws(() => generate(empty(), { ...BASE_DRAFT, dietType: 'pescatarian' }), err => err.status === 400 && err.code === 'INVALID_DIET_TYPE');

  // Unsupported excludedGroups rejected in preview
  assert.throws(() => previewPlan({ ...BASE_DRAFT, excludedGroups: ['nonexistent_group'] }), err => err.status === 400 && err.code === 'INVALID_EXCLUDED_INGREDIENTS');

  // Exclude-all-proteins returns 200 preview with nutritionFeasible: false (no silent preview-to-commit surprise)
  const excludeAllProteins = {
    ...BASE_DRAFT,
    excludedGroups: ['chicken', 'meat', 'fish', 'shellfish', 'eggs', 'dairy', 'legumes', 'nuts'],
  };
  const prevNoProt = previewPlan(excludeAllProteins);
  assert.equal(prevNoProt.feasibility.nutritionFeasible, false);
  assert.ok(prevNoProt.feasibility.blockingConflicts.some(c => c.code === 'PLAN_CONSTRAINTS_UNMET'));

  // high_protein + kidney rejected consistently in preview AND generate
  const kidneyHp = { ...BASE_DRAFT, dietType: 'high_protein', diseases: ['kidney'] };
  assert.throws(() => previewPlan(kidneyHp), err => err.status === 400 && err.code === 'MEDICAL_DIET_CONFLICT');
  assert.throws(() => generate(empty(), kidneyHp), err => err.status === 400 && err.code === 'MEDICAL_DIET_CONFLICT');

  // DASH diet succeeds in preview & generate with <= 2300 mg sodium/day
  const dashDraft = { ...BASE_DRAFT, dietType: 'dash', serviceTrack: 'nutrition_only' };
  const dashPrev = previewPlan(dashDraft);
  assert.equal(dashPrev.feasibility.nutritionFeasible, true);
  const dashState = generate(empty(), dashDraft);
  for (const day of dashState.plans[0].days) {
    assert.ok(Number(day.summary.values.sodium) <= 2300, `DASH sodium exceeded on ${day.date}: ${day.summary.values.sodium}`);
  }

  // All 13 active onboarding conditions succeed individually in preview + generate
  const active13 = [
    'diabetes_t1', 'diabetes_t2', 'insulin_resistance', 'pcos', 'hypothyroid',
    'hypertension', 'cholesterol', 'ibs', 'celiac', 'gout', 'kidney', 'favism', 'lactose_intolerance',
  ];
  for (const cond of active13) {
    const condDraft = { ...BASE_DRAFT, serviceTrack: 'nutrition_only', diseases: [cond] };
    const p = previewPlan(condDraft);
    assert.equal(p.eligibility.status, 'eligible', `Expected eligible for ${cond}`);
    assert.equal(p.feasibility.nutritionFeasible, true, `Expected feasible nutrition for ${cond}`);
    const s = generate(empty(), condDraft);
    assert.ok(s.plans[0].days.length === 7, `Expected 7-day plan for ${cond}`);
  }

  // offal exclusion maps to liver key
  assert.ok(expandedKeys({ excludedGroups: ['offal'] }).includes('liver'));
  const offalState = generate(empty(), { ...BASE_DRAFT, serviceTrack: 'nutrition_only', excludedGroups: ['offal'] });
  for (const day of offalState.plans[0].days) {
    for (const meal of day.meals) {
      assert.ok(!meal.snapshot.ingredients.some(i => i.key === 'liver'), 'offal exclusion should exclude liver');
    }
  }

  // seniorMode workoutUiModeDefault === 'simple' even for intermediate + gym_only
  const seniorDraft = { ...BASE_DRAFT, birthDate: '1950-01-10', fitnessLevel: 'intermediate', workoutLocation: 'gym_only' };
  const seniorPrev = previewPlan(seniorDraft);
  assert.equal(seniorPrev.seniorMode, true);
  assert.equal(seniorPrev.workoutUiModeDefault, 'simple');
  const seniorState = generate(empty(), seniorDraft);
  assert.equal(seniorState.profile.workoutUiMode, 'simple');

  // Breastfeeding + lose enforces slow pace & max -300 kcal before +400 kcal lactation buffer
  const bfDraft = {
    ...BASE_DRAFT,
    sex: 'female',
    birthDate: '1996-04-10',
    weight: 78,
    height: 165,
    goal: 'lose',
    targetWeight: 68,
    goalPace: 'fast',
    maternalStatus: 'breastfeeding',
    serviceTrack: 'nutrition_only',
  };
  const bfPrev = previewPlan(bfDraft);
  assert.equal(bfPrev.targets.goal_pace, 'slow');
  assert.ok(bfPrev.dailyCalories >= Math.round((bfPrev.targets.tdee + 100) / 10) * 10 - 10);
  const bfState = generate(empty(), bfDraft);
  assert.equal(bfState.profile.goalPace, 'slow');
  assert.equal(bfState.plans[0].targets.goal_pace, 'slow');
});

test('Cross-Epic HTTP contract verification: PAR-Q, consents, recent foods, ramadan_snack, 12_12 fasting, push cron', async () => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    bindings: TEST_ENV,
  });

  try {
    const db = await mf.getD1Database('DB');
    await migrateLocal(db);
    const googleSigner = await createTestOidcSigner('kan112-google-k1');

    const call = async (path, opts = {}) => {
      const env = { ...TEST_ENV, OAUTH_GOOGLE_JWKS_JSON: googleSigner.jwksJson, DB: db };
      const req = new Request('https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/' + path, opts);
      return await cloudflareEntry.fetch(req, env, { waitUntil() {} });
    };

    // Public /v1/eligibility & /v1/plans/preview checks
    const conflictRes = await call('eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_DRAFT, diseases: ['diabetes_t1', 'diabetes_t2'] }),
    });
    assert.equal(conflictRes.status, 400);
    assert.equal((await conflictRes.json()).error.code, 'CONFLICTING_CONDITIONS');

    const previewRes = await call('plans/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_DRAFT, parqRedFlag: true }),
    });
    assert.equal(previewRes.status, 200);
    const prevBody = await previewRes.json();
    assert.equal(prevBody.data.eligibility.status, 'requires_review');
    assert.equal(prevBody.data.feasibility.workoutFeasible, false);
    assert.equal(prevBody.data.feasibility.nutritionFeasible, true);

    // Sign in via Google OIDC
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = await googleSigner.signJwt({
      iss: 'https://accounts.google.com',
      aud: 'curafit-android-client-id',
      sub: 'google-sub-kan112-e2e',
      email: 'kan112@curafit.app',
      email_verified: true,
      iat: nowSec,
      exp: nowSec + 3600,
    });
    const authRes = await call('auth/oauth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    assert.equal(authRes.status, 201);
    const { accessToken } = (await authRes.json()).data;
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // GET /v1/auth/oauth/providers includes subject
    const provRes = await call('auth/oauth/providers', { headers });
    const provBody = await provRes.json();
    assert.equal(provBody.data.items[0].subject, 'google-sub-kan112-e2e');

    // Batch consents returns both items & consents
    const consentRes = await call('account/consents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: [
          { consentType: 'health_data_processing', version: '1.0.0', accepted: true },
          { consentType: 'terms_and_privacy', version: '1.0.0', accepted: true },
        ],
      }),
    });
    assert.equal(consentRes.status, 200);
    const consentBody = await consentRes.json();
    assert.equal(consentBody.data.items.length, 2);
    assert.equal(consentBody.data.consents.length, 2);

    // Generate plan cleanly
    const genRes = await call('commands?view=full', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'kan112-gen-1' },
      body: JSON.stringify({ revision: 0, action: 'generate', payload: BASE_DRAFT }),
    });
    assert.equal(genRes.status, 200);
    const genData = (await genRes.json()).data;
    let rev = genData.revision;
    const planId = genData.active_plan_id;
    const wpId = genData.workoutPlan.id;

    // Bootstrap exposes top-level weeklyCheckinDue & consents
    const bootRes = await call('bootstrap', { headers });
    const bootData = (await bootRes.json()).data;
    assert.equal(typeof bootData.weeklyCheckinDue, 'boolean');
    assert.equal(bootData.consents.length, 2);

    // Workout plan includes weeklyMuscleSets, targetRepsRange, targetRir
    const wpRes = await call(`workout-plans/${wpId}`, { headers });
    const wpData = (await wpRes.json()).data;
    assert.ok(wpData.weeklyMuscleSets);
    assert.match(wpData.days[0].exercises[0].targetRepsRange, /^\d+-\d+$/);
    assert.equal(typeof wpData.days[0].exercises[0].targetRir, 'number');

    // Grocery list includes previewMode alias
    const grocRes = await call(`plans/${planId}/grocery-list?preview=true`, { headers });
    const grocData = (await grocRes.json()).data;
    assert.equal(grocData.preview, true);
    assert.equal(grocData.previewMode, true);

    // Log food_entry with displaySlot: 'ramadan_snack' and Quick Add blank name
    const f1 = await call('commands?view=receipt', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'kan112-food-1' },
      body: JSON.stringify({ revision: rev, action: 'food_entry', payload: { slot: 'snack', displaySlot: 'ramadan_snack', source: 'manual', name: '', energy: 250, protein: 12 } }),
    });
    assert.equal(f1.status, 200);
    rev = (await f1.json()).data.revision;

    // Log second manual entry to test frequency sort on /v1/foods/recent
    const f2 = await call('commands?view=receipt', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'kan112-food-2' },
      body: JSON.stringify({ revision: rev, action: 'food_entry', payload: { slot: 'lunch', source: 'manual', name: 'Quick Add', energy: 250, protein: 12 } }),
    });
    assert.equal(f2.status, 200);
    rev = (await f2.json()).data.revision;

    const recentRes = await call('foods/recent?days=14', { headers });
    const recentData = (await recentRes.json()).data;
    assert.equal(recentData.items[0].name, 'Quick Add');
    assert.equal(recentData.items[0].logCount, 2);
    assert.ok(recentData.items[0].macroSnapshot);
    assert.ok(recentData.items[0].lastLoggedAt);

    // 12_12 fasting preset works
    const fastRes = await call('commands?view=receipt', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'kan112-fast-1' },
      body: JSON.stringify({ revision: rev, action: 'fasting_log', payload: { op: 'adjust_window', preset: '12_12', ifStartHour: 8 } }),
    });
    assert.equal(fastRes.status, 200);
    rev = (await fastRes.json()).data.revision;
    const fastStateRes = await call('nutrition/fasting-state', { headers });
    const fastState = (await fastStateRes.json()).data;
    assert.equal(fastState.mode, 'if_12_12');
    assert.equal(fastState.windowHours, 12);

    // 45-day food-diary range accepted (up to 62 days)
    const diaryRes = await call('food-diary?from=2026-10-01&to=2026-11-14', { headers });
    assert.equal(diaryRes.status, 200);
    assert.equal((await diaryRes.json()).data.days.length, 45);

    // Digits-only profile name rejected
    const badNameRes = await call('commands?view=receipt', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'kan112-badname' },
      body: JSON.stringify({ revision: rev, action: 'profile_update', payload: { name: '12345' } }),
    });
    assert.equal(badNameRes.status, 400);
    assert.equal((await badNameRes.json()).error.code, 'INVALID_PROFILE_NAME');

    // Push token registration + Cron sweep triggers plan_renewal_due from planRefs even with default channels
    const pushReg = await call('devices/push-token', {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: 'dev-kan112', platform: 'android', token: 'fcm-token-1234567890', timezone: 'UTC' }),
    });
    assert.equal(pushReg.status, 200);
    // Run Cron 14 days in the future at 11:00 UTC -> plan has expired -> should queue plan_renewal_due!
    const future11Utc = Date.parse(`${genData.plans[0].days.at(-1).date}T11:00:00Z`) + 2 * 86400000;
    const cronRes = await runScheduledNotifications({ DB: db }, future11Utc);
    assert.equal(cronRes.checked, 1);
    assert.equal(cronRes.queued, 1);

    // Cross-cutting contracts: Specialist Team voice, additive warningCodes/eligibilityReasonCodes, unit_system & region_id sync, hydration bonuses, and calibrationMetadata
    const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;

    // 1. Live 3-Specialist Care Room returns Specialist Team copy (zero "AI" exposure)
    const chatRes = await call('coaching/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'Hello, how is my progress?' }),
    });
    assert.equal(chatRes.status, 200);
    const chatData = (await chatRes.json()).data;
    assert.ok(chatData.specialistRole);
    assert.ok(!FORBIDDEN_VOICE_RE.test(chatData.reply), `Specialist consultation reply leaked forbidden wording: ${chatData.reply}`);
    assert.ok(!FORBIDDEN_VOICE_RE.test(chatData.specialistTitle), `Specialist title leaked forbidden wording: ${chatData.specialistTitle}`);

    // 2. Preview with snake_case unit_system & region_id, hypothyroid + gout + knee injury
    const { region: _omitRegion, ...draftWithoutRegion } = BASE_DRAFT;
    const richPrevRes = await call('plans/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draftWithoutRegion,
        unit_system: 'imperial',
        region_id: 'gulf',
        diseases: ['hypothyroid', 'gout'],
        injuries: ['knee'],
      }),
    });
    assert.equal(richPrevRes.status, 200);
    const richPrev = (await richPrevRes.json()).data;
    assert.equal(richPrev.unitSystem, 'imperial');
    assert.equal(richPrev.unit_system, 'imperial');
    assert.equal(richPrev.region, 'gulf');
    assert.equal(richPrev.region_id, 'gulf');
    assert.ok(Array.isArray(richPrev.warningCodes));
    assert.ok(richPrev.warningCodes.includes('PLAN_HYPOTHYROID_REE_CALIBRATION'));
    assert.ok(richPrev.warningCodes.includes('PLAN_GOUT_PROTEIN_CAP'));
    assert.ok(richPrev.warningCodes.includes('WORKOUT_INJURY_EXCLUSIONS_ACTIVE'));
    assert.ok(Array.isArray(richPrev.eligibilityReasonCodes));
    assert.equal(richPrev.waterTarget.bonuses.warmClimateMl, 200);
    assert.equal(richPrev.waterTarget.bonuses.goutMl, 500);
    assert.ok(richPrev.calibrationMetadata);
    assert.ok(richPrev.calibrationMetadata.calibrationReasons.includes('WARM_CLIMATE_HYDRATION_BONUS'));
    assert.ok(richPrev.calibrationMetadata.calibrationReasons.includes('GOUT_HYDRATION_BONUS'));
    assert.ok(richPrev.calibrationMetadata.protectedJoints.includes('knee_pain'));
    assert.ok(!richPrev.calibrationMetadata.activeProteinPillars.includes('red_meat'));
    assert.ok(richPrev.calibrationMetadata.activeProteinPillars.includes('poultry'));
    assert.ok(Array.isArray(richPrev.specialistHighlights) && richPrev.specialistHighlights.length > 0 && richPrev.specialistHighlights.length <= 6);
    assert.ok(richPrev.specialistHighlights.some(h => h.code === 'PLAN_GOUT_PROTEIN_CAP'));
    assert.ok(richPrev.specialistHighlights.some(h => h.code === 'PLAN_HYPOTHYROID_REE_CALIBRATION'));
    assert.ok(richPrev.specialistHighlights.some(h => h.code === 'HIGHLIGHT_PROTECTED_JOINTS'));
    const coachingCatalog = JSON.parse(readFileSync('contracts/coaching-codes.json', 'utf8')).codes;
    for (const h of richPrev.specialistHighlights) {
      assert.ok(Object.hasOwn(coachingCatalog, h.code), `Highlight code ${h.code} missing from contracts/coaching-codes.json`);
      assert.ok(!FORBIDDEN_VOICE_RE.test(h.message), `Highlight leaked forbidden wording: ${h.message}`);
    }
    for (const w of richPrev.warnings) {
      assert.ok(!FORBIDDEN_VOICE_RE.test(w), `Preview warning leaked forbidden wording: ${w}`);
    }

    // 3. Preview & generate parity for keto + diabetes_t2 -> both return 400 MEDICAL_DIET_CONFLICT
    const ketoDiabDraft = { ...BASE_DRAFT, serviceTrack: 'nutrition_only', dietType: 'keto', diseases: ['diabetes_t2'] };
    assert.throws(() => previewPlan(ketoDiabDraft), err => err.status === 400 && err.code === 'MEDICAL_DIET_CONFLICT');
    assert.throws(() => generate(empty(), ketoDiabDraft), err => err.status === 400 && err.code === 'MEDICAL_DIET_CONFLICT');

    // 4. Last-protein-pillar allergy protection on vegan excluding legumes + soy + peanuts + tree_nuts
    const veganZeroProt = {
      ...BASE_DRAFT,
      serviceTrack: 'nutrition_only',
      dietType: 'vegan',
      excludedGroups: ['legumes', 'soy', 'peanuts', 'tree_nuts'],
    };
    const zeroPrev = previewPlan(veganZeroProt);
    assert.equal(zeroPrev.feasibility.nutritionFeasible, false);
    assert.deepEqual(zeroPrev.calibrationMetadata.activeProteinPillars, []);
    assert.ok(zeroPrev.eligibilityReasonCodes.includes('PLAN_CONSTRAINTS_UNMET'));
    assert.throws(() => generate(empty(), veganZeroProt), err => err.status === 400 && err.code === 'PLAN_CONSTRAINTS_UNMET');

    // 5. Persist & sync unit_system + region_id via profile_update and verify regional hydration bonus toggles (+200ml -> 0ml)
    const updRes = await call('commands?view=full', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'kan112-unit-region-1' },
      body: JSON.stringify({ revision: rev, action: 'profile_update', payload: { unit_system: 'imperial', region_id: 'levant' } }),
    });
    assert.equal(updRes.status, 200);
    const updState = (await updRes.json()).data;
    rev = updState.revision;
    assert.equal(updState.profile.unitSystem, 'imperial');
    assert.equal(updState.profile.unit_system, 'imperial');
    assert.equal(updState.profile.region, 'levant');
    assert.equal(updState.profile.region_id, 'levant');
    assert.equal(updState.preferences.region_id, 'levant');

    const bootAfterUpd = (await (await call('bootstrap', { headers })).json()).data;
    assert.equal(bootAfterUpd.profile.unit_system, 'imperial');
    assert.equal(bootAfterUpd.profile.region_id, 'levant');
    assert.equal(bootAfterUpd.todaySummary.hydration.bonuses.warmClimateMl, 0);
    assert.ok(bootAfterUpd.calibrationMetadata);
    assert.ok(Array.isArray(bootAfterUpd.eligibility.eligibilityReasonCodes));

    // Switch region_id back to gulf -> warmClimateMl becomes +200ml
    const updGulfRes = await call('commands?view=receipt', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'kan112-unit-region-2' },
      body: JSON.stringify({ revision: rev, action: 'profile_update', payload: { region_id: 'gulf' } }),
    });
    assert.equal(updGulfRes.status, 200);
    rev = (await updGulfRes.json()).data.revision;
    const bootGulf = (await (await call('bootstrap', { headers })).json()).data;
    assert.equal(bootGulf.profile.region_id, 'gulf');
    assert.equal(bootGulf.todaySummary.hydration.bonuses.warmClimateMl, 200);

    // 6. Weekly review command receipt includes structured calibrationMetadata
    const revRes = await call('commands?view=receipt', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': 'kan112-review-cal' },
      body: JSON.stringify({ revision: rev, action: 'review', payload: {} }),
    });
    assert.equal(revRes.status, 200);
    const revBody = (await revRes.json()).data;
    assert.ok(revBody.calibrationMetadata);
    assert.ok(Array.isArray(revBody.calibrationMetadata.calibrationReasons));
    assert.ok(typeof revBody.calibrationMetadata.adjustedCalories === 'number');
    assert.ok(revBody.calibrationMetadata.adjustedMacros);
  } finally {
    await mf.dispose();
  }
});
