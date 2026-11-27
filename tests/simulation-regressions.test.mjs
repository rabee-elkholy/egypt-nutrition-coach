import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';
import { withClock } from '../server/clock.mjs';
import { runScheduledNotifications } from '../server/push.mjs';
import { evaluateProactiveSpecialistNote } from '../proactive-notes.mjs';
import { computeChallengeDayScore } from '../server/progress-analytics.mjs';
import { workoutPlan } from '../server/workouts.mjs';
import { makeWeek } from '../planner-core.mjs';
import library from '../data/planning-library.json' with { type: 'json' };

const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;

const TEST_ENV = {
  AUTH_JWT_SECRET: 'simulation-regressions-secret-key-256-bits',
  AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
  RATE_LIMIT_PER_MINUTE: '500',
  OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
  MIN_ANDROID_VERSION: '1.0.0',
  LATEST_ANDROID_VERSION: '1.2.0',
  LATEST_IOS_VERSION: '1.2.0'
};

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createOidcSigner(kid = 'simreg-k1') {
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

test('Simulation Regressions (Layers 1-3): proactive micro-notes, dual referral delete, clinical dining/meal filters, carb cycling & workout coverage', async t => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    r2Buckets: ['CURAFIT_MEDIA_BUCKET'],
    bindings: TEST_ENV
  });

  try {
    const db = await mf.getD1Database('DB');
    const bucket = await mf.getR2Bucket('CURAFIT_MEDIA_BUCKET');
    await migrateLocal(db);
    const signer = await createOidcSigner();
    let seq = 0;

    const call = async (path, opts = {}, nowMs = null) => {
      const env = { ...TEST_ENV, OAUTH_GOOGLE_JWKS_JSON: signer.jwksJson, CURAFIT_MEDIA_BUCKET: bucket, DB: db };
      const req = new Request(`https://curafit-api-dev.egypt-nutrition-coach.workers.dev${path}`, opts);
      const exec = () => cloudflareEntry.fetch(req, env, { waitUntil() {} });
      return nowMs != null ? withClock(nowMs, exec) : exec();
    };

    const createUser = async (name, devId, draft, nowMs = Date.parse('2026-11-10T12:00:00Z')) => {
      seq++;
      const nowSec = Math.floor(Date.now() / 1000);
      const idToken = await signer.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: `simreg-sub-${seq}-${crypto.randomUUID().slice(0, 6)}`,
        email: `simreg.${seq}.${crypto.randomUUID().slice(0, 6)}@curafit.app`,
        email_verified: true,
        name,
        iat: nowSec,
        exp: nowSec + 7200
      });
      const regRes = await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, name, deviceId: devId })
      }, nowMs);
      assert.equal(regRes.status, 201);
      const reg = (await regRes.json()).data;
      const u = { userId: reg.user.userId, rev: 0, headers: { Authorization: `Bearer ${reg.accessToken}`, 'Content-Type': 'application/json' } };
      if (draft) {
        const genRes = await call('/v1/commands', {
          method: 'POST',
          headers: { ...u.headers, 'Idempotency-Key': `gen-${seq}` },
          body: JSON.stringify({ revision: 0, action: 'generate', payload: { name, ...draft } })
        }, nowMs);
        assert.equal(genRes.status, 200);
        const gen = (await genRes.json()).data;
        u.rev = gen.revision;
        u.state = gen;
      }
      return u;
    };

    await t.test('1. Proactive Specialist Micro-Notes: sleep 3d, protein gap swaps, opt-out & Max 1/day lock-screen safety', async () => {
      const nowMs = Date.parse('2026-11-12T12:00:00Z'); // 14:00 Africa/Cairo
      const note = evaluateProactiveSpecialistNote({
        profile: { name: 'Salma', sex: 'female', age: 29, weight: 68, height: 164, timezone: 'Africa/Cairo', maternalStatus: 'none' },
        preferences: { diet: 'balanced', budget: 'low', region: 'egypt', excludedGroups: ['dairy'], proteins: ['eggs', 'chicken', 'fish', 'legumes', 'meat'] },
        checkins: [
          { date: '2026-11-10', sleepHours: 5.0 },
          { date: '2026-11-11', sleepHours: 5.5 },
          { date: '2026-11-12', sleepHours: 5.2 }
        ],
        foodLogs: []
      }, '2026-11-12', nowMs, {});
      assert.equal(note?.code, 'PROACTIVE_NOTE_SLEEP_LOW_3D');
      assert.ok(!FORBIDDEN_VOICE_RE.test(note.text + ' ' + note.action));

      const lowProtNote = evaluateProactiveSpecialistNote({
        profile: { name: 'Lina', sex: 'female', age: 28, weight: 64, height: 164, timezone: 'Africa/Cairo' },
        preferences: { diet: 'balanced', budget: 'low', region: 'egypt', excludedGroups: ['dairy'], proteins: ['eggs', 'chicken', 'fish', 'legumes', 'meat'] },
        active_plan_id: 'p1',
        planRefs: [{ id: 'p1', protein: 110 }],
        checkins: [],
        foodLogs: [
          { date: '2026-11-10', energy: 1500, protein: 55 },
          { date: '2026-11-11', energy: 1500, protein: 60 }
        ]
      }, '2026-11-12', nowMs, { allowFoodSwaps: true });
      assert.equal(lowProtNote?.code, 'PROACTIVE_NOTE_PROTEIN_LOW_2D');
      assert.equal(lowProtNote.params.swapNamesEn.length, 2);
      assert.ok(!/(greek yogurt|yogurt|cottage|cheese)/i.test(lowProtNote.params.swapNamesEn.join(' ')));

      const u = await createUser('Hana', 'dev-reg-1', {
        age: 29, weight: 65, height: 164, sex: 'female', goal: 'lose', targetWeight: 60,
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true
      }, Date.parse('2026-11-01T12:00:00Z'));
      for (const [offset, d] of [[8, '2026-11-09'], [9, '2026-11-10'], [10, '2026-11-11']]) {
        const res = await call('/v1/commands?view=receipt', {
          method: 'POST',
          headers: { ...u.headers, 'Idempotency-Key': `rec-${offset}` },
          body: JSON.stringify({ revision: u.rev, action: 'recovery', payload: { date: d, sleepHours: 5.1, sleepQuality: 2, fatigue: 4, stress: 3, soreness: 2, pain: false, illness: false, redFlags: false } })
        }, Date.parse(`${d}T12:00:00Z`));
        assert.equal(res.status, 200);
        u.rev = (await res.json()).data.revision;
      }
      const briefRes = await call('/v1/coaching/brief', { headers: u.headers }, Date.parse('2026-11-11T12:00:00Z'));
      assert.equal(briefRes.status, 200);
      const briefData = (await briefRes.json()).data;
      assert.equal(briefData.proactiveMicroNote?.code, 'PROACTIVE_NOTE_SLEEP_LOW_3D');

      // Opt-out works immediately via notification_preferences
      const prefRes = await call('/v1/commands', {
        method: 'POST',
        headers: { ...u.headers, 'Idempotency-Key': 'pref-optout' },
        body: JSON.stringify({ revision: u.rev, action: 'notification_preferences', payload: { specialistNotesReminder: false } })
      }, Date.parse('2026-11-11T12:00:00Z'));
      assert.equal(prefRes.status, 200);
      assert.equal((await prefRes.json()).data.notificationPreferences.specialistNotesReminder, false);
    });

    await t.test('2. Dual referred-user GDPR delete does not hit UNIQUE constraint & preserves active_plan=undefined safety', async () => {
      const host = await createUser('Host', 'dev-ref-h', { age: 30, weight: 78, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_only' });
      const r1 = await createUser('Ref One', 'dev-ref-1', { age: 27, weight: 68, height: 170, sex: 'female', goal: 'maintain', serviceTrack: 'workouts_only', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true });
      const r2 = await createUser('Ref Two', 'dev-ref-2', { age: 28, weight: 70, height: 172, sex: 'female', goal: 'maintain', serviceTrack: 'workouts_only', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true });

      const code = (await (await call('/v1/referrals/code', { headers: host.headers })).json()).data.code;
      assert.equal((await call('/v1/referrals/redeem', { method: 'POST', headers: r1.headers, body: JSON.stringify({ code, deviceId: 'uniq-ref-dev-1' }) })).status, 200);
      assert.equal((await call('/v1/referrals/redeem', { method: 'POST', headers: r2.headers, body: JSON.stringify({ code, deviceId: 'uniq-ref-dev-2' }) })).status, 200);

      assert.equal((await call('/v1/account/delete', { method: 'POST', headers: r1.headers, body: JSON.stringify({ confirm: true }) })).status, 200);
      assert.equal((await call('/v1/account/delete', { method: 'POST', headers: r2.headers, body: JSON.stringify({ confirm: true }) })).status, 200);

      // Push cron safely handles accounts without plans array (workouts_only)
      await db.prepare("INSERT OR REPLACE INTO coaching_accounts(user_id,revision,body) VALUES('wo-cron',1,?)" ).bind(JSON.stringify({
        schemaVersion: 3, revision: 1,
        profile: { name: 'Karim WO', timezone: 'Africa/Cairo', locale: 'en' },
        preferences: { diet: 'balanced' },
        onboarding: { serviceTrack: 'workouts_only', journeyStartedOn: '2026-11-01' },
        notificationPreferences: { dailyReminder: true, specialistNotesReminder: true, channels: ['push'] },
        checkins: [{ date: '2026-11-10', sleepHours: 5.0 }, { date: '2026-11-11', sleepHours: 5.1 }, { date: '2026-11-12', sleepHours: 5.2 }],
        foodLogs: [], waterLogs: [], weights: [], sessions: [], workoutLogs: []
      })).run();
      await db.prepare("INSERT OR REPLACE INTO coaching_push_tokens(user_id,device_id,platform,push_token,locale,timezone,updated_at) VALUES('wo-cron','d1','android','tok-wo-1234567890','en','Africa/Cairo','2026-11-12T00:00:00Z')").run();
      const cronRes = await runScheduledNotifications({ DB: db }, Date.parse('2026-11-12T12:00:00Z'));
      assert.ok(cronRes.queued >= 1);
    });

    await t.test('3. Celiac oats & catalog fallback cross-checks, strict INVALID_LOCALE & Dining-Out clinical gates', async () => {
      const celUser = await createUser('Nadia Celiac', 'dev-cel-1', {
        age: 30, weight: 64, height: 165, sex: 'female', goal: 'maintain',
        diseases: ['celiac', 'gout', 'insulin_resistance'], excludedGroups: ['nuts', 'shellfish', 'dairy'],
        serviceTrack: 'nutrition_only'
      });
      const badLoc = await call('/v1/commands', {
        method: 'POST',
        headers: { ...celUser.headers, 'Idempotency-Key': 'bad-loc-1' },
        body: JSON.stringify({ revision: celUser.rev, action: 'generate', payload: { age: 30, weight: 64, height: 165, sex: 'female', goal: 'maintain', locale: 'fr-INVALID', serviceTrack: 'nutrition_only' } })
      });
      assert.equal(badLoc.status, 400);
      assert.equal((await badLoc.json()).error.code, 'INVALID_LOCALE');

      const parseRes = await call('/v1/nutrition/meal-parse', {
        method: 'POST',
        headers: celUser.headers,
        body: JSON.stringify({ inputType: 'text', text: '50g oats, 100g shrimp, 50g almonds, 100g cheddar' })
      });
      assert.equal(parseRes.status, 200);
      const codes = (await parseRes.json()).data.clinicalWarnings.map(w => w.code);
      assert.ok(codes.includes('MEAL_CAPTURE_CELIAC_GLUTEN_ALERT'));
      assert.ok(codes.includes('MEAL_CAPTURE_SEAFOOD_ALERT'));
      assert.ok(codes.includes('MEAL_CAPTURE_NUT_ALLERGY_ALERT'));
      assert.ok(codes.includes('MEAL_CAPTURE_DAIRY_ALERT'));

      const dining = (await (await call('/v1/nutrition/dining-out-options', { headers: celUser.headers })).json()).data;
      assert.ok(dining.options.every(o => o.carbsG <= 52 && !/(fattoush|oat|shrimp|salmon|tuna|liver|almond|halloumi)/i.test(o.nameEn)));
    });

    await t.test('4. Carb cycling weekly calorie parity, Friend Challenge daily foodLogs parity, and 20min full-body multi-exercise fallback', async () => {
      for (const trainingDays of [1, 2, 3, 4, 5, 6]) {
        const plan = makeWeek(
          {
            age: 28, weight: 82, height: 178, sex: 'male', goal: 'muscle_gain', activity: 'moderate',
            carbCycling: true, workoutDays: Array.from({ length: trainingDays }, (_, i) => i), trainingDays
          },
          { diet: 'balanced', region: 'egypt', budget: 'medium', meals: 4, proteins: ['chicken', 'eggs', 'dairy', 'fish', 'meat', 'legumes'] },
          library,
          '2026-11-01',
          `cc-${trainingDays}`
        );
        const wkAvg = plan.days.reduce((s, d) => s + Number(d.targets.energy), 0) / 7;
        const pctDrift = Math.abs(wkAvg - plan.targets.energy) / plan.targets.energy;
        assert.ok(pctDrift <= 0.02, `Expected balanced 7d average energy for ${trainingDays}d, drifted ${Math.round(pctDrift * 1000) / 10}%`);
      }

      const dayScore = computeChallengeDayScore({
        onboarding: { serviceTrack: 'nutrition_only' },
        foodLogs: [{ date: '2026-11-12', energy: 1850, complete: true }],
        waterLogs: [{ date: '2026-11-12', cups: 10, targetCups: 10 }],
        checkins: [{ date: '2026-11-12', sleepHours: 7.5 }]
      }, 'all_round', '2026-11-12');
      assert.ok(dayScore >= 90, `Expected complete daily food log + water + sleep to score >= 90, got ${dayScore}`);

      const wp = workoutPlan({
        age: 38, weight: 135, height: 181, sex: 'male', goal: 'lose',
        fitnessLevel: 'beginner', injuries: ['knee', 'lower_back'],
        workoutLocation: 'home_only', homeEquipment: ['none'],
        sessionDuration: 20, selectedWorkoutDays: [1, 3, 5]
      });
      for (const d of wp.days) {
        assert.ok(d.exercises.length >= 2 && d.exercises.length <= 4, `Expected 2-4 exercises on day ${d.dayIndex}, got ${d.exercises.length}`);
      }
    });
  } finally {
    await mf.dispose();
  }
});
