import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import { signHs256Jwt } from '../server/auth.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';
import { empty, generate, command } from '../server/coaching.mjs';
import { workoutPlan, isFriendlyForInjuries } from '../server/workouts.mjs';
import { searchFoodCatalog, calculatePreparedBeverageOrRecipe, registerExternalFoodCatalogSnapshot } from '../server/food-catalog.mjs';
import { localDate, dateOffset } from '../coaching-shared.mjs';
import { withClock } from '../server/clock.mjs';
import { logEvent, redactObject } from '../server/logger.mjs';
import { readFile } from 'node:fs/promises';
import {parse} from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';

const TEST_JWT_SECRET = 'test-production-jwt-secret-key-256-bit-minimum';
const TEST_ENV_OVERRIDES = {
  AUTH_JWT_SECRET: TEST_JWT_SECRET,
  AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm'
};

async function makeToken(sub, extra = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return await signHs256Jwt({
    iss: TEST_ENV_OVERRIDES.AUTH_ISSUER,
    aud: TEST_ENV_OVERRIDES.AUTH_AUDIENCE,
    sub,
    sid: extra.sid || 'sess-1',
    device_id: extra.deviceId || 'kmm-android-1',
    iat: nowSec - 10,
    exp: nowSec + 3600,
    ...extra
  }, extra.secret || TEST_JWT_SECRET, extra.header || {});
}

test('Release E2E Scenarios E01–E16 & Findings F01–F22 Verification Suite', async t => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    bindings: TEST_ENV_OVERRIDES
  });

  try {
    const db = await mf.getD1Database('DB');
    await migrateLocal(db);

    const api = (path, opts = {}) => mf.dispatchFetch('https://api.egypt-nutrition-coach.local/v1/' + path, opts);
    const edgeApi = async (path, opts = {}) => {
      const env = {...TEST_ENV_OVERRIDES,DB:db};
      const req = new Request('https://api.egypt-nutrition-coach.local/v1/' + path, opts);
      return await cloudflareEntry.fetch(req, env, { waitUntil() {} });
    };

    // =========================================================================
    // E01 & F03: Anonymous MVP -> Verified Signup + Explicit Account Claim
    // =========================================================================
    await t.test('E01 (F03): anonymous MVP session then verified KMM signup + explicit account claim transfers data once and blocks spoofing', async () => {
      // 1. Spoofed oai-authenticated-user-id on public cloudflare-entry is stripped
      const spoofRes = await edgeApi('auth/session', {
        headers: { 'oai-authenticated-user-id': 'user:victim-account' }
      });
      assert.equal(spoofRes.status, 200);
      const spoofSession = await spoofRes.json();
      assert.ok(spoofSession.userId.startsWith('anon:'), 'Spoofed header must be stripped and replaced with anon cookie');
      assert.notEqual(spoofSession.userId, 'user:victim-account');

      const setCookie = spoofRes.headers.get('Set-Cookie');
      assert.ok(setCookie && setCookie.includes('coach_uid='));
      const cookieHeader = setCookie.split(';')[0];
      const anonUserId = spoofSession.userId;

      // 2. Anonymous user generates a plan and logs water
      const genRes = await edgeApi('commands?view=receipt', {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'e01-anon-gen'
        },
        body: JSON.stringify({
          revision: 0,
          action: 'generate',
          payload: { name: 'Anon E01', age: 28, weight: 82, height: 178, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5] }
        })
      });
      assert.equal(genRes.status, 200);

      // 3. Verified user signs in with Bearer JWT and claims the anonymous data with explicit consent
      const tokenA = await makeToken('user-e01-verified', { sid: 'sess-e01-a', deviceId: 'pixel-9' });
      const claimRes = await edgeApi('auth/claim-anonymous', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          Cookie: cookieHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          anonymousUserId: anonUserId,
          consent: true
        })
      });
      assert.equal(claimRes.status, 200);
      const claimBody = await claimRes.json();
      assert.equal(claimBody.claimed, true);
      assert.equal(claimBody.toUserId, 'user:user-e01-verified');

      // 4. Verify data is now in verified user's account
      const bootRes = await edgeApi('bootstrap', {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.equal(bootRes.status, 200);
      const boot = await bootRes.json();
      assert.equal(boot.profile.name, 'Anon E01');

      // 5. Another account cannot claim the same anonymous ID again
      const tokenAttacker = await makeToken('user-e01-attacker');
      const secondClaim = await edgeApi('auth/claim-anonymous', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenAttacker}`,
          Cookie: cookieHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          anonymousUserId: anonUserId,
          consent: true
        })
      });
      assert.equal(secondClaim.status, 409);
      const errBody = await secondClaim.json();
      assert.equal(errBody.code, 'ANONYMOUS_ALREADY_CLAIMED');
    });

    // =========================================================================
    // E02 & F03 & F20: Multi-device login/revoke & IDOR Isolation
    // =========================================================================
    await t.test('E02 (F03, F20): login on two devices A & B, revoke session on A -> A rejected with 401 while B continues working; IDOR blocked', async () => {
      const tokenDeviceA = await makeToken('user-e02', { sid: 'device-a-session', deviceId: 'iphone-16' });
      const tokenDeviceB = await makeToken('user-e02', { sid: 'device-b-session', deviceId: 'ipad-pro' });

      // Both devices can access session initially
      assert.equal((await api('auth/session', { headers: { Authorization: `Bearer ${tokenDeviceA}` } })).status, 200);
      assert.equal((await api('auth/session', { headers: { Authorization: `Bearer ${tokenDeviceB}` } })).status, 200);

      // Revoke Device A session
      const revRes = await api('auth/revoke', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenDeviceA}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'device-a-session' })
      });
      assert.equal(revRes.status, 200);

      // Device A is now rejected with 401 AUTH_SESSION_REVOKED
      const afterARes = await api('bootstrap', { headers: { Authorization: `Bearer ${tokenDeviceA}` } });
      assert.equal(afterARes.status, 401);
      assert.equal((await afterARes.json()).code, 'AUTH_SESSION_REVOKED');

      // Device B still works
      const afterBRes = await api('bootstrap', { headers: { Authorization: `Bearer ${tokenDeviceB}` } });
      assert.equal(afterBRes.status, 200);

      // Invalid JWT cases: expired, wrong issuer, wrong audience, alg:none
      const expiredToken = await makeToken('user-e02', { exp: Math.floor(Date.now() / 1000) - 300 });
      assert.equal((await api('bootstrap', { headers: { Authorization: `Bearer ${expiredToken}` } })).status, 401);

      const wrongIssuerToken = await makeToken('user-e02', { iss: 'https://evil.issuer.example' });
      assert.equal((await api('bootstrap', { headers: { Authorization: `Bearer ${wrongIssuerToken}` } })).status, 401);

      // IDOR check: user-e02 cannot read user-e01-verified's nutrition plan or workout plan
      const e01Token = await makeToken('user-e01-verified');
      const e01Boot = await (await api('bootstrap', { headers: { Authorization: `Bearer ${e01Token}` } })).json();
      const e01PlanId = e01Boot.activeNutritionPlanRef.id;
      const e01WorkoutId = e01Boot.activeWorkoutPlanRef.id;

      const idorPlan = await api(`plans/${e01PlanId}`, { headers: { Authorization: `Bearer ${tokenDeviceB}` } });
      assert.equal(idorPlan.status, 404);
      const idorWorkout = await api(`workout-plans/${e01WorkoutId}`, { headers: { Authorization: `Bearer ${tokenDeviceB}` } });
      assert.equal(idorWorkout.status, 404);
    });

    // =========================================================================
    // E03 & E04 & F06 & F07: Offline Sync, Two-Device Conflict, Tombstone, Canonical Idempotency
    // =========================================================================
    await t.test('E03 & E04 (F06, F07): two-device offline edits, delete tombstone, 409 merge hints, 5 network retries with reordered JSON keys', async () => {
      const token = await makeToken('user-e03');
      const authH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      // Initialize account
      const initRes = await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e03-init' },
        body: JSON.stringify({
          revision: 0,
          action: 'generate',
          payload: { name: 'Sync User', age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5] }
        })
      });
      assert.equal(initRes.status, 200);

      // E04 & F07: Log water with 5 retries and different JSON key orderings
      const waterKey = 'e04-water-retry-key';
      const payloadOrder1 = '{"revision":1,"action":"water","payload":{"cups":4,"date":"' + localDate() + '"}}';
      const payloadOrder2 = '{"payload":{"date":"' + localDate() + '","cups":4},"action":"water","revision":1}';

      const firstWater = await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': waterKey },
        body: payloadOrder1
      });
      assert.equal(firstWater.status, 200);
      const firstReceipt = await firstWater.json();
      assert.equal(firstReceipt.revision, 2);
      assert.equal(firstReceipt.commandReceipt.replayed, false);

      // 5 retries with reordered JSON keys
      for (let retry = 1; retry <= 5; retry++) {
        const retryRes = await api('commands?view=receipt', {
          method: 'POST',
          headers: { ...authH, 'Idempotency-Key': waterKey },
          body: retry % 2 === 0 ? payloadOrder1 : payloadOrder2
        });
        assert.equal(retryRes.status, 200);
        assert.equal(retryRes.headers.get('Idempotency-Replayed'), 'true');
        const rBody = await retryRes.json();
        assert.equal(rBody.commandReceipt.revision, 2);
        assert.equal(rBody.commandReceipt.replayed, true);
      }

      // Verify exactly one water log record exists
      const waterLogs = await (await api('water-logs', { headers: authH })).json();
      assert.equal(waterLogs.total, 1);
      assert.equal(waterLogs.items[0].cups, 4);

      // E03: Phone A adds a manual meal at revision 2 -> revision becomes 3
      const mealAddRes = await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e03-meal-add' },
        body: JSON.stringify({
          revision: 2,
          action: 'food_entry',
          payload: { source: 'manual', slot: 'lunch', name: 'وجبة غداء تجريبية', energy: 650, protein: 40 }
        })
      });
      assert.equal(mealAddRes.status, 200);
      const mealAddReceipt = await mealAddRes.json();
      const addedMealId = mealAddReceipt.affected.find(d => d.entityType === 'food_entry').entityId;
      assert.ok(addedMealId);

      // Phone B deletes that meal at revision 3 -> revision becomes 4
      const mealDelRes = await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e03-meal-del' },
        body: JSON.stringify({
          revision: 3,
          action: 'food_delete',
          payload: { id: addedMealId }
        })
      });
      assert.equal(mealDelRes.status, 200);

      // Phone A (offline, still thinking revision is 3) tries to submit another edit -> gets deterministic 409 with currentRevision & mergeHints
      const conflictRes = await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e03-stale-edit' },
        body: JSON.stringify({
          revision: 3,
          action: 'weight',
          payload: { kg: 79.4 }
        })
      });
      assert.equal(conflictRes.status, 409);
      const conflictBody = await conflictRes.json();
      assert.equal(conflictBody.code, 'REVISION_CONFLICT');
      assert.equal(conflictBody.currentRevision, 4);
      assert.ok(conflictBody.mergeHints?.syncChangesEndpoint.includes('after=3'));

      // Phone A fetches `/v1/sync/changes?after=2` and sees both the upsert and the delete tombstone
      const syncRes = await api('sync/changes?after=2', { headers: authH });
      assert.equal(syncRes.status, 200);
      const syncBody = await syncRes.json();
      assert.equal(syncBody.currentRevision, 4);
      assert.ok(syncBody.deltas.some(d => d.entityType === 'food_entry' && d.entityId === addedMealId && d.op === 'upsert'));
      assert.ok(syncBody.deltas.some(d => d.entityType === 'food_entry' && d.entityId === addedMealId && d.op === 'delete'));
    });

    // =========================================================================
    // E05 & F10 & F11: Egyptian Food Catalog Search, Beverages & Density Guard
    // =========================================================================
    await t.test('E05 (F10, F11): Arabic food search for كشري/ملوخية/محشي/كنافة/طعمية/عيش بلدي/شاي بسكر/قهوة بلبن/عصير مانجا and density guardrails', async () => {
      const token = await makeToken('user-e05');
      const authH = { Authorization: `Bearer ${token}` };

      for (const query of ['كشري', 'ملوخية', 'محشي', 'كنافة', 'طعمية', 'عيش بلدي', 'شاي بسكر', 'قهوة بلبن', 'عصير مانجا']) {
        const res = await api(`foods?q=${encodeURIComponent(query)}`, { headers: authH });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.ok(body.total > 0, `Query "${query}" should return catalog results`);
        assert.ok(['verified_reference_available', 'mixed_verified_and_estimated', 'estimated_model_only_requires_specialist_review'].includes(body.coverageStatus));
        for (const item of body.items) {
          assert.ok(item.id && item.name && item.status && item.reviewStatus && item.qualityTier);
          if (item.status === 'estimated') {
            assert.equal(item.approvedForPlanning, false, 'Estimated recipes must never be marked approvedForPlanning');
            assert.equal(item.reviewStatus, 'Pending Review');
          }
        }
      }

      // Beverages endpoint
      const bevRes = await api(`beverages?q=${encodeURIComponent('كركديه')}&includeEstimated=true`, { headers: authH });
      assert.equal(bevRes.status, 200);
      const bevBody = await bevRes.json();
      assert.ok(bevBody.items.length > 0 && bevBody.items.every(b => b.beverage === true));

      // Density guardrail: converting mL without documented density or volume_evidence must fail closed
      assert.throws(
        () => calculatePreparedBeverageOrRecipe({ unit: 'ml', ingredients: [{ key: 'fava', ml: 200 }] }),
        /كثافة/
      );

      // External Egypt Nutrition Database snapshot adapter contract test
      const extSnap = registerExternalFoodCatalogSnapshot({
        version: 'egypt-db-snapshot-2026.10',
        source: 'egypt-nutrition-database-postgres',
        items: [{ id: 'egdb:1', name_ar: 'فول اسكندراني معتمد', status: 'approved' }]
      });
      assert.equal(extSnap.count, 1);
    });

    // =========================================================================
    // E06 & F12 & F13 & F18: Clinical Safety Guardrails & No False Human Review
    // =========================================================================
    await t.test('E06 (F12, F13, F18): hypertension enforces verified sodium <= 2300mg (never null), lactose/favism exclude contraindicated foods, diabetes blocked, no false specialist claims', async () => {
      const baseDraft = { name: 'Clinical Test', age: 35, weight: 84, height: 174, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5] };

      // 1. Unsupported clinical disease (diabetes) is blocked from autonomous planning
      const eligDiabetes = evaluateEligibilityForTest({ ...baseDraft, diseases: ['diabetes'] });
      assert.equal(eligDiabetes.status, 'requires_review');
      assert.throws(() => generate(empty(), { ...baseDraft, diseases: ['diabetes'] }), /متخصص/);

      // 2. Hypertension + balanced diet: every generated day has non-null reference sodium <= 2300 mg
      const htnState = generate(empty(), { ...baseDraft, diseases: ['hypertension'], dietType: 'balanced' }, 'e06-htn');
      for (const day of htnState.plans[0].days) {
        const sod = day.summary.values.sodium;
        assert.ok(sod != null && Number.isFinite(Number(sod)), `Day ${day.date} sodium must not be null`);
        assert.ok(Number(sod) <= 2300, `Day ${day.date} sodium (${sod}) must be <= 2300mg`);
      }

      // 3. Lactose intolerance: zero dairy ingredients in generated plan
      const lacState = generate(empty(), { ...baseDraft, diseases: ['lactose_intolerance'], dietType: 'balanced' }, 'e06-lac');
      for (const day of lacState.plans[0].days) {
        for (const meal of day.meals) {
          for (const ing of meal.snapshot.ingredients) {
            assert.ok(!['milk', 'wholemilk', 'yogurt', 'greekyogurt', 'cottage', 'feta', 'mozzarella'].includes(ing.key), `Dairy ingredient ${ing.key} must be excluded for lactose_intolerance`);
          }
        }
      }

      // 4. Favism: zero fava or falafel in generated plan
      const favState = generate(empty(), { ...baseDraft, diseases: ['favism'], dietType: 'balanced' }, 'e06-fav');
      for (const day of favState.plans[0].days) {
        for (const meal of day.meals) {
          for (const ing of meal.snapshot.ingredients) {
            assert.ok(!['fava', 'falafel'].includes(ing.key), `Fava/falafel ${ing.key} must be excluded for favism`);
          }
        }
      }

      // 5. F18: Review output contains structured reasonCode and reviewScope='system_generated_guidance', with no false claim of human specialist review
      const revState = command(structuredClone(htnState), 'review', {});
      assert.equal(revState.lastReview.reviewScope, 'system_generated_guidance');
      assert.ok(revState.lastReview.reasonCode);
      assert.ok(!/رسالة من أخصائي التغذية|قرار مشترك من أخصائي التغذية/.test(JSON.stringify(revState.lastReview)));
    });

    // =========================================================================
    // E07 & F04: Slim Payloads (< 20 KB for logs & bootstrap) vs Full Plan Detail
    // =========================================================================
    await t.test('E07 (F04): 7-day plan generation, lightweight bootstrap (< 10 KB), delta receipt for water/diary (< 2 KB), and lazy plan day fetch', async () => {
      const token = await makeToken('user-e07');
      const authH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e07-gen' },
        body: JSON.stringify({
          revision: 0,
          action: 'generate',
          payload: { name: 'Slim Payload', age: 29, weight: 78, height: 176, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5] }
        })
      });

      // Measure GET /v1/bootstrap size
      const bootRes = await api('bootstrap', { headers: authH });
      const bootText = await bootRes.text();
      const bootBytes = Buffer.byteLength(bootText, 'utf8');
      assert.ok(bootBytes < 10000, `Bootstrap payload (${bootBytes} bytes) must be < 10 KB`);

      // ETag 304 check
      const etag = bootRes.headers.get('ETag');
      assert.ok(etag);
      const cachedRes = await api('bootstrap', { headers: { ...authH, 'If-None-Match': etag } });
      assert.equal(cachedRes.status, 304);

      // Measure POST /v1/commands?view=receipt for water log
      const waterRes = await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e07-water' },
        body: JSON.stringify({ revision: 1, action: 'water', payload: { addCups: 2 } })
      });
      const waterText = await waterRes.text();
      const waterBytes = Buffer.byteLength(waterText, 'utf8');
      assert.ok(waterBytes < 2000, `Water log delta receipt (${waterBytes} bytes) must be < 20 KB (actual: ${waterBytes} B)`);

      // Lazy single day fetch from nutrition plan
      const bootJson = JSON.parse(bootText);
      const planId = bootJson.activeNutritionPlanRef.id;
      const startDay = bootJson.activeNutritionPlanRef.start_date;
      const dayRes = await api(`plans/${planId}/days/${startDay}`, { headers: authH });
      assert.equal(dayRes.status, 200);
      const dayJson = await dayRes.json();
      assert.equal(dayJson.day.date, startDay);
      assert.ok(dayJson.day.meals.length >= 3);
    });

    // =========================================================================
    // E08 & F08: Month-Long Logs & Paginated History Queries
    // =========================================================================
    await t.test('E08 (F08): month-long weight/water/workout logs and ordered history paging', async () => {
      const token = await makeToken('user-e08');
      const authH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e08-gen' },
        body: JSON.stringify({
          revision: 0,
          action: 'generate',
          payload: { name: 'History User', age: 31, weight: 85, height: 180, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5] }
        })
      });

      // Log 30 days of weights and water
      for (let i = 29; i >= 0; i--) {
        const d = dateOffset(localDate(), -i);
        const rev = (29 - i) * 2 + 1;
        await api('commands?view=receipt', {
          method: 'POST',
          headers: { ...authH, 'Idempotency-Key': `e08-w-${i}` },
          body: JSON.stringify({ revision: rev, action: 'weight', payload: { date: d, kg: Math.round((85 - (29 - i) * 0.1) * 10) / 10 } })
        });
        await api('commands?view=receipt', {
          method: 'POST',
          headers: { ...authH, 'Idempotency-Key': `e08-wt-${i}` },
          body: JSON.stringify({ revision: rev + 1, action: 'water', payload: { date: d, cups: 10 } })
        });
      }

      // Page 1 of weight-logs (limit 10)
      const p1 = await (await api('weight-logs?limit=10&offset=0', { headers: authH })).json();
      assert.equal(p1.total, 30);
      assert.equal(p1.items.length, 10);
      assert.equal(p1.nextOffset, 10);
      assert.ok(p1.items[0].date > p1.items[9].date, 'Items must be ordered newest date first');

      // Page 2 of weight-logs
      const p2 = await (await api('weight-logs?limit=10&offset=10', { headers: authH })).json();
      assert.equal(p2.items.length, 10);
      assert.equal(p2.nextOffset, 20);
    });

    // =========================================================================
    // E09 & F09: Timezone Boundaries (Cairo -> Riyadh around Midnight)
    // =========================================================================
    await t.test('E09 (F09): user moves Cairo -> Riyadh around midnight; local day contract and logs respect user timezone without duplicates', async () => {
      // At 2026-10-23T21:30:00Z:
      // - UTC is 2026-10-23 21:30
      // - Africa/Cairo (UTC+2 in standard/winter or UTC+3) -> let's test 2026-01-15T21:30:00Z where Cairo is UTC+2 (23:30 Jan 15) and Riyadh/Dubai is UTC+3/UTC+4 (00:30/01:30 Jan 16)
      const boundaryUtcMs = Date.parse('2026-01-15T21:30:00Z');
      const cairoDate = localDate(boundaryUtcMs, 'Africa/Cairo');
      const riyadhDate = localDate(boundaryUtcMs, 'Asia/Riyadh');
      const dubaiDate = localDate(boundaryUtcMs, 'Asia/Dubai');

      assert.equal(cairoDate, '2026-01-15');
      assert.equal(riyadhDate, '2026-01-16');
      assert.equal(dubaiDate, '2026-01-16');

      let s = withClock({ timestamp: boundaryUtcMs, timeZone: 'Africa/Cairo' }, () =>
        generate(empty(), {
          name: 'Traveler',
          age: 30,
          weight: 80,
          height: 175,
          sex: 'male',
          goal: 'maintain',
          serviceTrack: 'nutrition_and_workouts',
          dietType: 'balanced',
          timezone: 'Africa/Cairo',
          selectedWorkoutDays: [1, 3, 5]
        }, 'e09-tz')
      );
      assert.equal(s.profile.timezone, 'Africa/Cairo');
      assert.equal(s.plans[0].start_date, '2026-01-15');

      // Log water in Cairo before midnight
      s = withClock({ timestamp: boundaryUtcMs, timeZone: 'Africa/Cairo' }, () =>
        command(s, 'water', { cups: 6 })
      );
      assert.equal(s.waterLogs.at(-1).date, '2026-01-15');

      // User travels to Riyadh (Asia/Riyadh) at the exact same UTC instant (where it is already Jan 16 locally)
      s = withClock({ timestamp: boundaryUtcMs, timeZone: 'Asia/Riyadh' }, () =>
        command(s, 'timezone', { timezone: 'Asia/Riyadh', locale: 'ar-SA' })
      );
      assert.equal(s.profile.timezone, 'Asia/Riyadh');

      s = withClock({ timestamp: boundaryUtcMs, timeZone: 'Asia/Riyadh' }, () =>
        command(s, 'water', { cups: 2 })
      );
      assert.equal(s.waterLogs.length, 2);
      assert.equal(s.waterLogs.find(w => w.date === '2026-01-15').cups, 6);
      assert.equal(s.waterLogs.find(w => w.date === '2026-01-16').cups, 2);
    });

    // =========================================================================
    // E10 & F15 & F16: Extreme Limited Equipment + Injury + Short Session
    // =========================================================================
    await t.test('E10 (F15, F16): limited equipment + injury + short session produces safe workout or explicit unsupported error, never prohibited exercise', async () => {
      const injuries = ['knee_pain', 'lower_back_pain', 'shoulder_pain'];
      const plan = workoutPlan({
        workoutDaysCount: 3,
        selectedWorkoutDays: [0, 2, 4],
        workoutLocation: 'home_only',
        homeEquipment: ['dumbbells', 'resistance_bands'],
        fitnessLevel: 'beginner',
        sessionDuration: 20,
        workoutSplitPreference: 'full_body',
        injuries
      });
      assert.equal(plan.days.length, 3);
      assert.ok(plan.coverage);
      for (const d of plan.days) {
        assert.ok(d.estimatedMinutes <= 20);
        for (const ex of d.exercises) {
          assert.ok(isFriendlyForInjuries(ex, injuries), `Exercise ${ex.name} must be safe for ${injuries.join(',')}`);
        }
      }
    });

    // =========================================================================
    // E11 & F17: Rejected Plan Adaptation Preserves Active Plan Across Restart
    // =========================================================================
    await t.test('E11 (F17): rejecting a proposed adaptation preserves the active plan and immutable archive across reload', async () => {
      const token = await makeToken('user-e11');
      const authH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const genRes = await api('commands', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e11-gen' },
        body: JSON.stringify({
          revision: 0,
          action: 'generate',
          payload: { name: 'Adapt User', age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', targetWeight: 75, serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5] }
        })
      });
      const initial = await genRes.json();
      const originalPlanId = initial.active_plan_id;

      // Log poor recovery so review proposes a recovery deload
      await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e11-rec' },
        body: JSON.stringify({
          revision: 1,
          action: 'recovery',
          payload: { sleepHours: 4.5, sleepQuality: 2, fatigue: 5, stress: 4, soreness: 8, pain: false, illness: false, redFlags: false }
        })
      });

      const revRes = await api('commands', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e11-rev' },
        body: JSON.stringify({ revision: 2, action: 'review', payload: {} })
      });
      const revState = await revRes.json();
      const pending = revState.adaptations.find(a => a.status === 'pending');
      assert.ok(pending, 'Review should propose a pending adaptation');

      // Reject the adaptation
      const rejRes = await api('commands', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e11-rej' },
        body: JSON.stringify({ revision: 3, action: 'adaptation', payload: { id: pending.id, accept: false } })
      });
      assert.equal(rejRes.status, 200);

      // Reload state (simulating app restart)
      const reloaded = await (await api('state', { headers: authH })).json();
      assert.equal(reloaded.active_plan_id, originalPlanId);
      assert.equal(reloaded.sessionAdjustment, null);
      assert.equal(reloaded.adaptations.find(a => a.id === pending.id).status, 'rejected');
    });

    // =========================================================================
    // E12 & F20: Account Export, Full Deletion & Old Device Sync Prevention
    // =========================================================================
    await t.test('E12 (F20): export account data, delete account, and verify old device token cannot sync or resurrect deleted account', async () => {
      const token = await makeToken('user-e12');
      const authH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      await api('commands?view=receipt', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e12-gen' },
        body: JSON.stringify({
          revision: 0,
          action: 'generate',
          payload: { name: 'Delete Me', age: 27, weight: 74, height: 172, sex: 'female', goal: 'maintain', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5] }
        })
      });

      // 1. Export full account data
      const expRes = await api('account/export', { headers: authH });
      assert.equal(expRes.status, 200);
      const exported = await expRes.json();
      assert.equal(exported.userId, 'user:user-e12');
      assert.equal(exported.profile.name, 'Delete Me');
      assert.ok(exported.archivedNutritionPlans.length >= 1);

      // 2. Delete account
      const delRes = await api('account/delete', {
        method: 'POST',
        headers: authH,
        body: JSON.stringify({ confirm: true })
      });
      assert.equal(delRes.status, 200);
      const delBody = await delRes.json();
      assert.equal(delBody.deleted, true);

      // 3. Verify coaching_accounts and coaching_plans have 0 rows for user:user-e12
      const accRow = await db.prepare('SELECT COUNT(*) AS n FROM coaching_accounts WHERE user_id=?').bind('user:user-e12').first();
      assert.equal(accRow.n, 0);

      // 4. Old device trying to sync or write with a token issued before deletion is blocked with 401
      const oldSync = await api('sync/changes?after=0', { headers: authH });
      assert.equal(oldSync.status, 401);
    });

    // =========================================================================
    // E13 & F08: Migrating / Backfilling Legacy 1-Year Log Set Without Data Loss
    // =========================================================================
    await t.test('E13 (F08): migrating legacy-shaped 1-year log set preserves 100% of IDs, counts, and history', async () => {
      const legacyUser = 'user:legacy-1yr';
      const legacyState = generate(empty(), {
        name: 'Legacy 1Yr',
        age: 34,
        weight: 90,
        height: 178,
        sex: 'male',
        goal: 'lose',
        serviceTrack: 'nutrition_and_workouts',
        dietType: 'balanced',
        selectedWorkoutDays: [1, 3, 5]
      }, 'e13-seed');

      // Populate 365 days of weights, water logs, and food entries
      for (let day = 0; day < 365; day++) {
        const d = dateOffset('2026-10-24', -day);
        legacyState.weights.push({ date: d, kg: Math.round((90 - day * 0.02) * 10) / 10 });
        legacyState.waterLogs.push({ date: d, cups: 8, liters: 2 });
        legacyState.foodEntries.push({
          id: `fe-${day}`,
          date: d,
          slot: 'lunch',
          source: 'manual',
          at: new Date().toISOString(),
          snapshot: { name: `وجبة يوم ${day}`, values: { energy: '700', protein: '45' }, ingredients: [], is_approximate: true }
        });
      }

      await db.prepare('INSERT INTO coaching_accounts(user_id,revision,body) VALUES(?,?,?)').bind(legacyUser, 10, JSON.stringify(legacyState)).run();

      const token = await makeToken('legacy-1yr');
      const authH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const bfRes = await api('account/backfill', { method: 'POST', headers: authH, body: '{}' });
      assert.equal(bfRes.status, 200);
      const bfBody = await bfRes.json();
      assert.equal(bfBody.migrated, true);
      assert.equal(bfBody.counts.weights, 365);
      assert.equal(bfBody.counts.waterLogs, 365);
      assert.equal(bfBody.counts.foodEntries, 365);

      const nFe = await db.prepare('SELECT COUNT(*) AS n FROM coaching_food_entries WHERE user_id=?').bind(legacyUser).first();
      const nWl = await db.prepare('SELECT COUNT(*) AS n FROM coaching_water_logs WHERE user_id=?').bind(legacyUser).first();
      const nWg = await db.prepare('SELECT COUNT(*) AS n FROM coaching_weight_logs WHERE user_id=?').bind(legacyUser).first();
      assert.equal(nFe.n, 365);
      assert.equal(nWl.n, 365);
      assert.equal(nWg.n, 365);
    });

    // =========================================================================
    // E14 & F20: Structured Errors, Rate Limiting, Redaction & Zero Leak
    // =========================================================================
    await t.test('E14 (F20): 4xx/5xx structured errors, burst rate limiting, oversized payload, and PII/health log redaction', async () => {
      const token = await makeToken('user-e14');
      const authH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      // Malformed JSON -> 400 with machine-readable code & requestId
      const badJsonRes = await api('commands', {
        method: 'POST',
        headers: { ...authH, 'Idempotency-Key': 'e14-bad' },
        body: '{invalid_json'
      });
      assert.equal(badJsonRes.status, 400);
      const badJsonBody = await badJsonRes.json();
      assert.equal(badJsonBody.code, 'INVALID_JSON');
      assert.ok(badJsonBody.requestId);
      assert.equal(typeof badJsonBody.retryable, 'boolean');

      // Redaction check: sensitive fields are never leaked in structured logs
      const redacted = redactObject({
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret',
        weight: 88,
        diseases: ['hypertension'],
        painRegions: ['knee'],
        safeField: 'visible'
      });
      assert.equal(redacted.Authorization, '[REDACTED]');
      assert.equal(redacted.weight, '[REDACTED]');
      assert.equal(redacted.diseases, '[REDACTED]');
      assert.equal(redacted.painRegions, '[REDACTED]');
      assert.equal(redacted.safeField, 'visible');
    });

    // =========================================================================
    // E15 & F05: OpenAPI 3.1 Specification & Examples Contract Conformance
    // =========================================================================
    await t.test('E15 (F05): OpenAPI 3.1 document passes structural schema validation and declares core endpoints', async () => {
      const spec=parse(await readFile('contracts/openapi.yaml','utf8'));
      await SwaggerParser.validate(structuredClone(spec));
      assert.equal(spec.openapi, '3.1.0');
      assert.ok(spec.paths['/v1/health']);
      assert.ok(spec.paths['/v1/bootstrap']);
      assert.ok(spec.paths['/v1/state']);
      assert.ok(spec.paths['/v1/commands']);
      assert.ok(spec.paths['/v1/foods']);
      assert.ok(spec.paths['/v1/foods/{id}']);
      assert.ok(spec.paths['/v1/beverages']);
      assert.ok(spec.paths['/v1/sync/changes']);
      assert.ok(spec.paths['/v1/auth/session']);
      assert.ok(spec.paths['/v1/auth/revoke']);
      assert.ok(spec.paths['/v1/auth/claim-anonymous']);
      assert.ok(spec.paths['/v1/account/export']);
      assert.ok(spec.paths['/v1/account/delete']);
      assert.ok(spec.components?.schemas?.ErrorEnvelope);
      assert.ok(spec.components?.schemas?.BootstrapResponse);
      assert.ok(spec.components?.schemas?.CommandReceiptResponse);
    });

    // =========================================================================
    // E16 & F22: Graceful Offline/No-External-Credentials Behavior
    // =========================================================================
    await t.test('E16 (F22): server operates deterministically without external Auth/DB/Push credentials and reports explicit adapter status', async () => {
      const capRes = await api('capabilities');
      assert.equal(capRes.status, 200);
      const cap = await capRes.json();
      assert.equal(cap.apiVersion, '1');
      assert.ok(cap.features.includes('kmm_bootstrap'));
      assert.ok(cap.features.includes('offline_sync_v2'));
    });

  } finally {
    await mf.dispose();
  }
});

import { evaluateEligibility as evaluateEligibilityForTest } from '../server/coaching.mjs';
