import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';
import { empty, generate, command, previewPlan, dailyWaterTarget } from '../server/coaching.mjs';
import { personalBrief } from '../personal-brief.mjs';
import { present } from '../server/presentation.mjs';

const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;
const COACHING_CODES = JSON.parse(readFileSync('contracts/coaching-codes.json', 'utf8')).codes;

const BASE = {
  name: 'Rabee',
  birthDate: '1993-05-10',
  sex: 'male',
  weight: 75,
  height: 176,
  goal: 'maintain',
  goalPace: 'moderate',
  activity: 'light',
  serviceTrack: 'nutrition_and_workouts',
  fitnessLevel: 'intermediate',
  workoutLocation: 'gym_only',
  selectedWorkoutDays: [1, 3, 5],
  sessionDuration: 45,
  dietType: 'balanced',
  region: 'egypt',
  budget: 'medium',
  mealsCount: 4,
  diseases: [],
  injuries: [],
  maternalStatus: 'none',
  parqRedFlag: false,
  healthConfirmed: true,
};

test('Scientific server dailyWaterTarget adapts across physiology, diets, conditions, and exercise loads', () => {
  const restDate = '2026-11-26'; // Thursday (day 4, not in [1,3,5])
  const workoutDate = '2026-11-25'; // Wednesday (day 3)

  // 1. Standard male baseline vs female physiological baseline
  const maleRest = dailyWaterTarget({ profile: { weight: 75, height: 176, sex: 'male', age: 30, activity: 'light', diseases: [] }, preferences: { diet: 'balanced', region: 'levant' } }, restDate);
  const femaleRest = dailyWaterTarget({ profile: { weight: 75, height: 176, sex: 'female', age: 30, activity: 'light', diseases: [] }, preferences: { diet: 'balanced', region: 'levant' } }, restDate);
  assert.ok(maleRest.bonuses.baseMl > femaleRest.bonuses.baseMl, 'male baseline ml/kg should exceed female baseline');
  assert.equal(maleRest.targetMl, Math.round(maleRest.liters * 1000));
  assert.equal(maleRest.clinicianGuided, false);

  // 2. Obesity ABW scaling (BMI > 30 avoids raw-weight fluid overestimation)
  const obese = dailyWaterTarget({ profile: { weight: 130, height: 175, sex: 'male', age: 35, activity: 'light', diseases: [] }, preferences: { diet: 'balanced', region: 'levant' } }, restDate);
  assert.ok(obese.bonuses.baseMl < 130 * 35, 'BMI > 30 must use Adjusted Body Weight instead of raw 130*35');
  assert.ok(obese.liters >= 2.8 && obese.liters <= 3.8, `Expected realistic ABW hydration, got ${obese.liters}L`);

  // 3. Kidney safety: conservative 30 ml/kg, capped <= 2.5L, clinicianGuided=true, no aggressive bonus stacking
  const kidney = dailyWaterTarget({
    profile: { weight: 95, height: 178, sex: 'male', age: 45, activity: 'active', diseases: ['kidney'], externalTrainingDays: [3] },
    preferences: { diet: 'mediterranean', region: 'gulf' },
    cardioLogs: [{ date: workoutDate, durationMinutes: 60, intensity: 'vigorous' }],
  }, workoutDate);
  assert.equal(kidney.clinicianGuided, true);
  assert.ok(kidney.liters <= 2.5, `Kidney target must cap conservatively <= 2.5L, got ${kidney.liters}L`);
  assert.equal(kidney.bonuses.warmClimateMl, 0);
  assert.equal(kidney.bonuses.dietMl, 0);
  assert.equal(kidney.bonuses.goutMl, 0);
  assert.ok(kidney.guidanceCodes.includes('HYDRATION_KIDNEY_CLINICIAN_LIMIT'));

  // 4. Senior 70+ cap (<= 3.5L) and guidance code
  const senior = dailyWaterTarget({
    profile: { weight: 105, height: 175, sex: 'male', age: 74, seniorMode: true, activity: 'active', diseases: ['gout'], externalTrainingDays: [3] },
    preferences: { diet: 'high_protein', region: 'egypt' },
  }, workoutDate);
  assert.ok(senior.liters <= 3.5, `Senior target should cap <= 3.5L, got ${senior.liters}L`);
  assert.ok(senior.guidanceCodes.includes('HYDRATION_SENIOR_SAFETY_CAP'));

  // 5. Diet adaptations: keto (+500), high_protein (+300), low_carb (+250), vegan (+150), intermittent_fasting pacing
  const keto = dailyWaterTarget({ profile: { weight: 75, height: 175, sex: 'male', age: 30, activity: 'light', diseases: [] }, preferences: { diet: 'keto', region: 'levant' } }, restDate);
  const highProt = dailyWaterTarget({ profile: { weight: 75, height: 175, sex: 'male', age: 30, activity: 'light', diseases: [] }, preferences: { diet: 'high_protein', region: 'levant' } }, restDate);
  const lowCarb = dailyWaterTarget({ profile: { weight: 75, height: 175, sex: 'male', age: 30, activity: 'light', diseases: [] }, preferences: { diet: 'low_carb', region: 'levant' } }, restDate);
  const vegan = dailyWaterTarget({ profile: { weight: 75, height: 175, sex: 'male', age: 30, activity: 'light', diseases: [] }, preferences: { diet: 'vegan', region: 'levant' } }, restDate);
  const fasting = dailyWaterTarget({ profile: { weight: 75, height: 175, sex: 'male', age: 30, activity: 'light', diseases: [] }, preferences: { diet: 'intermittent_fasting', region: 'levant' } }, restDate);
  assert.equal(keto.bonuses.dietMl, 500);
  assert.ok(keto.guidanceCodes.includes('KETO_HYDRATION_BONUS'));
  assert.equal(highProt.bonuses.dietMl, 300);
  assert.ok(highProt.guidanceCodes.includes('HIGH_PROTEIN_HYDRATION_BONUS'));
  assert.equal(lowCarb.bonuses.dietMl, 250);
  assert.ok(lowCarb.guidanceCodes.includes('LOW_CARB_HYDRATION_BONUS'));
  assert.equal(vegan.bonuses.dietMl, 150);
  assert.ok(vegan.guidanceCodes.includes('HIGH_FIBER_HYDRATION_BONUS'));
  assert.ok(fasting.guidanceCodes.includes('HYDRATION_FASTING_PACING'));

  // 6. Medical conditions: diabetes (+250), ibs (+150), gout (+500), pregnancy (+300), breastfeeding (+600)
  const diabIbs = dailyWaterTarget({ profile: { weight: 75, height: 175, sex: 'male', age: 32, activity: 'light', diseases: ['diabetes_t2', 'ibs'] }, preferences: { diet: 'balanced', region: 'levant' } }, restDate);
  assert.equal(diabIbs.bonuses.clinicalMl, 400);
  assert.ok(diabIbs.guidanceCodes.includes('DIABETES_HYDRATION_BONUS'));
  assert.ok(diabIbs.guidanceCodes.includes('IBS_HYDRATION_BONUS'));

  const bf = dailyWaterTarget({ profile: { weight: 68, height: 164, sex: 'female', age: 29, activity: 'light', maternalStatus: 'breastfeeding', diseases: [] }, preferences: { diet: 'balanced', region: 'egypt' } }, restDate);
  assert.equal(bf.bonuses.maternalMl, 600);
  assert.equal(bf.bonuses.warmClimateMl, 200);

  // 7. Workout duration scaling + Cardio intensity stacking + High steps bonus
  const shortWorkout = dailyWaterTarget({ profile: { weight: 75, height: 175, sex: 'male', age: 30, externalTrainingDays: [3] }, onboarding: { workoutPrefs: { sessionDuration: 20 } }, preferences: { diet: 'balanced', region: 'levant' } }, workoutDate);
  const longWorkout = dailyWaterTarget({ profile: { weight: 75, height: 175, sex: 'male', age: 30, externalTrainingDays: [3] }, onboarding: { workoutPrefs: { sessionDuration: 90 } }, preferences: { diet: 'balanced', region: 'levant' } }, workoutDate);
  assert.equal(shortWorkout.bonuses.trainingMl, 350);
  assert.equal(longWorkout.bonuses.trainingMl, 700);

  const workoutPlusCardio = dailyWaterTarget({
    profile: { weight: 75, height: 175, sex: 'male', age: 30, externalTrainingDays: [3] },
    onboarding: { workoutPrefs: { sessionDuration: 45 } },
    cardioLogs: [{ date: workoutDate, durationMinutes: 45, intensity: 'vigorous' }],
    preferences: { diet: 'balanced', region: 'levant' },
  }, workoutDate);
  assert.equal(workoutPlusCardio.boostReason, 'workout_and_cardio');
  assert.equal(workoutPlusCardio.bonuses.trainingMl, 500);
  assert.equal(workoutPlusCardio.bonuses.cardioMl, 500);
  assert.equal(workoutPlusCardio.boostMl, 1000);

  const highSteps = dailyWaterTarget({
    profile: { weight: 75, height: 175, sex: 'male', age: 30 },
    activityLogs: [{ date: restDate, steps: 12500 }],
    preferences: { diet: 'balanced', region: 'levant' },
  }, restDate);
  assert.equal(highSteps.bonuses.stepsMl, 250);
  assert.equal(highSteps.boostReason, 'steps');

  // 8. Every emitted guidanceCode exists in contracts/coaching-codes.json
  for (const res of [kidney, senior, keto, highProt, lowCarb, vegan, fasting, diabIbs, bf, workoutPlusCardio, highSteps]) {
    for (const code of res.guidanceCodes) {
      assert.ok(Object.hasOwn(COACHING_CODES, code), `Hydration guidanceCode missing in catalog: ${code}`);
    }
  }
});

test('Server hydration endpoints, weeklyTargets in bootstrap, and 3-specialist brief actionCodes', async () => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
  });
  try {
    const db = await mf.getD1Database('DB');
    await migrateLocal(db);
    const user = 'hydration-brief-owner';
    let rev = 0;

    const cmd = async (action, payload, key) => {
      const res = await mf.dispatchFetch('https://curafit-api-dev.local/v1/commands', {
        method: 'POST',
        headers: { 'oai-authenticated-user-id': user, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ revision: rev, action, payload }),
      });
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      rev = body.data.revision;
      return body.data;
    };

    const gen = await cmd('generate', { ...BASE, dietType: 'high_protein' }, 'hb-gen-1');
    const serverDate = gen.serverDate;

    // Preview <-> Generate hydration parity
    const prev = previewPlan({ ...BASE, dietType: 'high_protein' });
    assert.equal(prev.restDayWaterTarget.bonuses.dietMl, 300);
    assert.ok(prev.restDayWaterTarget.guidanceCodes.includes('HIGH_PROTEIN_HYDRATION_BONUS'));

    // GET /v1/bootstrap exposes server-authoritative hydration + 7-day weeklyTargets
    const bootRes = await mf.dispatchFetch('https://curafit-api-dev.local/v1/bootstrap', {
      headers: { 'oai-authenticated-user-id': user },
    });
    assert.equal(bootRes.status, 200);
    const boot = (await bootRes.json()).data;
    const hyd = boot.todaySummary.hydration;
    assert.equal(hyd.bonuses.dietMl, 300);
    assert.equal(hyd.bonuses.warmClimateMl, 200);
    assert.equal(hyd.targetMl, Math.round(hyd.targetLiters * 1000));
    assert.equal(Object.keys(hyd.weeklyTargets).length, 7);
    assert.ok(hyd.weeklyTargets[serverDate]);
    assert.equal(hyd.weeklyTargets[serverDate].targetCups, hyd.targetCups);

    // GET /v1/water-logs?from=D&to=D includes exact server-authoritative dateTarget
    const logsRes = await mf.dispatchFetch(`https://curafit-api-dev.local/v1/water-logs?from=${serverDate}&to=${serverDate}`, {
      headers: { 'oai-authenticated-user-id': user },
    });
    assert.equal(logsRes.status, 200);
    const logsData = (await logsRes.json()).data;
    assert.ok(logsData.dateTarget);
    assert.equal(logsData.dateTarget.targetCups, hyd.targetCups);
    assert.equal(logsData.dateTarget.bonuses.dietMl, 300);

    // GET /v1/coaching/brief emits all 3 specialists with cataloged code + actionCode + zero AI copy
    const briefRes = await mf.dispatchFetch('https://curafit-api-dev.local/v1/coaching/brief', {
      headers: { 'oai-authenticated-user-id': user },
    });
    assert.equal(briefRes.status, 200);
    const brief = (await briefRes.json()).data;
    assert.equal(brief.notes.length, 3);
    const roles = new Set(brief.notes.map(n => n.role));
    assert.deepEqual([...roles].sort(), ['followup', 'nutrition', 'training']);
    for (const note of brief.notes) {
      assert.ok(Object.hasOwn(COACHING_CODES, note.code), `Brief code missing from catalog: ${note.code}`);
      assert.ok(Object.hasOwn(COACHING_CODES, note.actionCode), `Brief actionCode missing from catalog: ${note.actionCode}`);
      assert.equal(note.params.userName, 'Rabee');
      assert.ok(!FORBIDDEN_VOICE_RE.test(note.text), `Forbidden wording in brief text: ${note.text}`);
      assert.ok(!FORBIDDEN_VOICE_RE.test(note.action), `Forbidden wording in brief action: ${note.action}`);
    }
  } finally {
    await mf.dispose();
  }
});
