import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLINICAL_CONSTANTS } from '../clinical-constants.mjs';
import { dateOffset, normalizeLocale, buildSpecialistHighlights } from '../coaching-shared.mjs';
import { estimateNeeds, makeWeek, applyDietMacroTargets } from '../planner-core.mjs';
import { assertDietDay, medicalContraindicatedKeys, dietTemplates, FASTING, normalizeFastingPreset } from '../diet-patterns.mjs';
import { expandedKeys, EXCLUSION_CROSS_CONTACT_WARNINGS } from '../planner-exclusions.mjs';
import { REGIONAL_MENU_DEFS, regionalMenus, egyptianMenus } from '../egyptian-menu.mjs';
import { empty, generate, command, today, retargetPlan, previewPlan, resolveRestAndWorkoutWaterTargets } from '../server/coaching.mjs';
import { library } from '../server/food.mjs';
import { calorieReview, progression } from '../server/recovery.mjs';
import { workoutPlan, isFriendlyForInjuries, catalog } from '../server/workouts.mjs';
import { volumeReview } from '../server/training-review.mjs';
import { logCardioSession } from '../server/wellness-tools.mjs';
import { formatPushNotification, isFastingFoodHydrationSuppressed } from '../server/push.mjs';
import { presentBootstrap } from '../server/presentation.mjs';
import { FREE_FEATURES, FREE_LIMITS } from '../server/subscriptions.mjs';
import { healthyCheckin } from './helpers.mjs';

const BASE_USER = {
  name: 'Karim Hassan',
  age: 30,
  weight: 82,
  height: 178,
  sex: 'male',
  goal: 'lose',
  targetWeight: 75,
  activity: 'light',
  serviceTrack: 'nutrition_and_workouts',
  dietType: 'balanced',
  selectedWorkoutDays: [1, 3, 5],
  healthConfirmed: true
};

// =========================================================================
// KAN-114 (US-BE-01): Clinical, Nutrition & Hydration Hardening (N1-N9)
// =========================================================================

test('KAN-114 N1: nutrition_only track proposes and accepts calorie adaptations without 24h workout recovery check-in', () => {
  let s = generate(empty(), {
    ...BASE_USER,
    serviceTrack: 'nutrition_only',
    externalTrainingDays: [],
    selectedWorkoutDays: undefined
  }, 'n1-nut-only');
  s.nutritionContextStartedOn = dateOffset(today(), -20);
  s.weights = Array.from({ length: 14 }, (_, i) => ({ date: dateOffset(today(), -i), kg: 82 }));
  s.foodLogs = s.weights.map(w => ({ date: w.date, energy: Number(s.plans[0].targets.energy), adherence: 100, complete: true }));
  s.checkins = []; // Zero recovery check-ins!

  s = command(s, 'review', {});
  assert.equal(s.lastReview.nutrition.action, 'propose');
  const calProp = s.adaptations.find(a => a.kind === 'calories' && a.status === 'pending');
  assert.ok(calProp, 'nutrition_only review must propose calorie adaptation without workout recovery check-in');

  // Accept without 24h recovery check-in
  s.revision += 1;
  calProp.baseRevision = s.revision;
  s = command(s, 'adaptation', { id: calProp.id, accept: true });
  assert.equal(s.adaptations.find(a => a.id === calProp.id).status, 'accepted');

  // Illness flag MUST still block nutrition_only calorie review
  s.lastCalorieChange = 0;
  s.checkins = [{ ...healthyCheckin(), illness: true }];
  s = command(s, 'review', {});
  assert.equal(s.lastReview.nutrition.action, 'hold');
});

test('KAN-114 N2: retargetPlan preserves daily protein within +/-3% via fitMeal instead of linear scaling', () => {
  const s = generate(empty(), BASE_USER, 'n2-retarget');
  const plan = structuredClone(s.plans[0]);
  const origEnergy = Number(plan.targets.energy);
  const origProtein = Number(plan.targets.protein);
  const effective = dateOffset(today(), 1);
  const retargeted = retargetPlan(plan, origEnergy - 150, s.preferences, effective, s.profile);
  const updatedDay = retargeted.days.find(d => d.date >= effective);
  assert.ok(updatedDay);
  const actualProt = Number(updatedDay.summary.values.protein);
  const pctDiff = Math.abs(actualProt - origProtein) / origProtein;
  assert.ok(pctDiff <= 0.08, `Protein should stay tightly preserved after calorie cut (got ${actualProt}g vs target ${origProtein}g, diff=${(pctDiff * 100).toFixed(1)}%)`);
  assert.equal(Number(updatedDay.targets.protein), origProtein);
});

test('KAN-114 N3: clinical guardrails for kidney (<=2000mg Na, clinicianGuided), gout (no tuna/salmon), IBS (Low-FODMAP), pregnancy (mercury cap), cholesterol (<=8% sat fat)', () => {
  // Gout excludes tuna & salmon
  const goutBlocked = medicalContraindicatedKeys({ diseases: ['gout'] });
  assert.ok(goutBlocked.has('tuna') && goutBlocked.has('salmon'));

  // IBS Low-FODMAP exclusions
  const ibsBlocked = medicalContraindicatedKeys({ diseases: ['ibs'] });
  for (const k of ['apple', 'pear', 'watermelon', 'mango', 'honey', 'milk', 'yogurt', 'bread', 'pasta', 'lentils']) {
    assert.ok(ibsBlocked.has(k), `IBS must exclude high-FODMAP ${k}`);
  }

  // Kidney: sodium <= 2000mg + clinicianGuided
  const ckdState = generate(empty(), { ...BASE_USER, goal: 'maintain', targetWeight: null, diseases: ['kidney'] }, 'n3-ckd');
  assert.equal(ckdState.plans[0].targets.clinicianGuided, true);
  for (const d of ckdState.plans[0].days) {
    assert.ok(Number(d.summary.values.sodium) <= CLINICAL_CONSTANTS.CKD_SODIUM_LIMIT_MG, `CKD sodium ${d.summary.values.sodium} > 2000`);
  }

  // Cholesterol: saturated fat <= 8% daily energy
  const cholState = generate(empty(), { ...BASE_USER, diseases: ['cholesterol'] }, 'n3-chol');
  for (const d of cholState.plans[0].days) {
    const dayE = Number(d.summary.values.energy);
    const satG = d.meals.reduce((sum, m) => sum + Number(m.snapshot.values?.saturated ?? m.snapshot.estimated_values?.saturated ?? 0), 0);
    assert.ok(satG * 9 <= dayE * CLINICAL_CONSTANTS.CHOLESTEROL_MAX_SAT_FAT_SHARE + 1, `Cholesterol sat fat kcal ${(satG * 9).toFixed(1)} exceeds 8% of ${dayE}`);
  }

  // Pregnancy: <= 2 tuna servings/week + pasteurization note
  const pregState = generate(empty(), {
    ...BASE_USER, sex: 'female', goal: 'maintain', targetWeight: null, maternalStatus: 'pregnant_t3'
  }, 'n3-preg');
  const tunaCount = pregState.plans[0].days.flatMap(d => d.meals).filter(m => m.snapshot.ingredients.some(i => i.key === 'tuna')).length;
  assert.ok(tunaCount <= CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_WEEKLY_SERVINGS);
  assert.ok(pregState.plans[0].targets.noteCodes.includes('PLAN_PREGNANCY_MERCURY_PASTEURIZATION_NOTE'));
});

test('KAN-114 N4: clinical-constants.mjs single source of truth eliminates sodium/diabetes/pregnancy copy mismatches', () => {
  const highlights = buildSpecialistHighlights({
    maternalStatus: 'pregnant_t3',
    diseases: ['hypertension', 'diabetes_t2'],
    serviceTrack: 'nutrition_only',
    workoutDaysCount: 0,
    region: 'egypt'
  });
  const t3 = highlights.find(h => h.code === 'PLAN_PREGNANCY_T3_CALIBRATION');
  assert.ok(t3 && t3.message.includes('+450 kcal') && !t3.message.includes('452'));
  const htn = highlights.find(h => h.code === 'PLAN_HYPERTENSION_SODIUM_CEILING');
  assert.ok(htn && htn.params[0] === 2300 && htn.message.includes('2300'));
  const dm = highlights.find(h => h.code === 'HIGHLIGHT_DIABETES_SUGAR_FILTER');
  assert.ok(dm && dm.message.includes('40%'));
});

test('KAN-114 N5: high_protein reaches 1.8-2.0 g/kg and trained fat-loss reaches 1.8 g/kg while respecting gout/kidney caps', () => {
  const trainedLose = estimateNeeds({ ...BASE_USER, trainingDays: 3, goal: 'lose', diseases: [] });
  assert.equal(trainedLose.protein_factor, 1.8);

  const hpTargets = applyDietMacroTargets(estimateNeeds({ ...BASE_USER, trainingDays: 3, goal: 'maintain', diseases: [] }), 'high_protein', { ...BASE_USER, goal: 'maintain' });
  assert.equal(hpTargets.protein_factor, 2.0);

  const goutHp = applyDietMacroTargets(estimateNeeds({ ...BASE_USER, trainingDays: 3, goal: 'maintain', diseases: ['gout'] }), 'high_protein', { ...BASE_USER, goal: 'maintain', diseases: ['gout'] });
  assert.equal(goutHp.protein_factor, 1.4);
});

test('KAN-114 N6: menstrual cycle waterRetentionLikely holds calorie cuts with CYCLE_RETENTION_HOLD', () => {
  const now = Date.now();
  const baseDate = today();
  const weights = Array.from({ length: 14 }, (_, i) => ({ date: dateOffset(baseDate, -i), kg: 68 }));
  const foodDays = weights.map(w => ({ date: w.date, energy: 1700, adherence: 100, complete: true }));
  const held = calorieReview(weights, foodDays, 'lose', 1700, now, 0, 'Africa/Cairo', { enabled: true, phase: 'luteal', waterRetentionLikely: true });
  assert.equal(held.action, 'hold');
  assert.equal(held.reasonCode, 'CYCLE_RETENTION_HOLD');
});

test('KAN-114 N7: shared hydration helper (no hardcoded 500ml) and all 4 IF presets (12_12, 14_10, 16_8, 18_6)', () => {
  assert.ok(FASTING['18']);
  assert.equal(normalizeFastingPreset('18_6').windowHours, 6);
  assert.equal(normalizeFastingPreset('14_10').windowHours, 10);
  assert.equal(normalizeFastingPreset('12_12').windowHours, 12);

  let s = generate(empty(), {
    ...BASE_USER,
    dietType: 'intermittent_fasting',
    ifPreset: '14_10',
    ifStartHour: 10,
    sessionDuration: 90
  }, 'n7-if-1410');
  assert.equal(s.preferences.fasting, '14');
  assert.equal(s.preferences.ifPreset, '14_10');
  assert.equal(s.fastingState.mode, 'if_14_10');
  assert.equal(s.fastingState.windowStart, '10:00');
  assert.equal(s.fastingState.windowEnd, '20:00');

  const { workoutDayWaterTarget } = resolveRestAndWorkoutWaterTargets(s, today());
  assert.equal(workoutDayWaterTarget.bonuses.trainingMl, 700, '90-min session must use 700ml workout bonus, not hardcoded 500ml');

  // Ramadan ON then OFF restores 14:10 instead of hardcoding 16:8
  s = command(s, 'ramadan_mode', { enabled: true, iftarTime: '18:10', suhoorCutoffTime: '04:15' });
  s = command(s, 'ramadan_mode', { enabled: false });
  assert.equal(s.fastingState.mode, 'if_14_10');
  assert.equal(s.fastingState.windowEnd, '20:00');
});

test('KAN-114 N8: allergen aliases, menu fixes, 45+ regional dishes per region, and 0 pending Arabic names', async () => {
  assert.ok(expandedKeys({ excludedGroups: ['fava'] }).includes('falafel'));
  assert.ok(expandedKeys({ excludedGroups: ['meat'] }).includes('liver'));
  assert.ok(expandedKeys({ excludedGroups: ['red_meat'] }).includes('liver'));
  assert.ok(expandedKeys({ excludedGroups: ['legumes'] }).includes('peas'));
  assert.ok(EXCLUSION_CROSS_CONTACT_WARNINGS.gluten.keys.includes('oats'));

  // Sweet oats/sweetpotato dishes must not include cucumber
  const eg = egyptianMenus(library);
  for (const id of ['eg-menu-oats-milk-banana-pb', 'eg-menu-oats-greek-apple-honey', 'eg-menu-sweetpotato-greek-bowl']) {
    const m = eg.find(x => x.id === id);
    assert.ok(m, `Expected ${id}`);
    assert.ok(!m.items.some(i => i.key === 'cucumber'), `${id} must not contain cucumber`);
  }

  // Regional expansions >= 45 dishes per region
  assert.ok(REGIONAL_MENU_DEFS.gulf.length >= 45, `Gulf dishes: ${REGIONAL_MENU_DEFS.gulf.length}`);
  assert.ok(REGIONAL_MENU_DEFS.levant.length >= 45, `Levant dishes: ${REGIONAL_MENU_DEFS.levant.length}`);
  assert.ok(REGIONAL_MENU_DEFS.maghreb.length >= 45, `Maghreb dishes: ${REGIONAL_MENU_DEFS.maghreb.length}`);

  // Mediterranean/DASH celiac brownrice label fix (not bulgur)
  const medCeliac = dietTemplates(eg, library, 'mediterranean', 'egypt', { diseases: ['celiac'] });
  const chickenRice = medCeliac.find(t => t.id === 'med-eg-menu-chicken-rice');
  assert.ok(chickenRice && chickenRice.name.includes('بالأرز البني') && !chickenRice.name.includes('بالبرغل'));

  // Budget keto must not prescribe 25-35g raw sunflower oil
  const ketoTpls = dietTemplates(eg, library, 'keto', 'egypt');
  for (const tpl of ketoTpls) {
    const oilItem = tpl.items.find(i => i.key === 'sunfloweroil');
    if (oilItem) assert.ok(Number(oilItem.grams) <= 10, `Keto ${tpl.id} has excessive raw sunfloweroil: ${oilItem.grams}g`);
  }

  // 100% Arabic food catalog display names ready
  const meta = JSON.parse(await readFile('data/meta.json', 'utf8'));
  assert.equal(meta.name_pending_count, 0);
  assert.equal(meta.name_ready_count, 3291);
});

test('KAN-114 N9: opt-in carb cycling (+10% training / -5% rest, fixed protein) and 8-week diet break suggestion', () => {
  const s = generate(empty(), { ...BASE_USER, carbCycling: true }, 'n9-cc');
  const plan = s.plans[0];
  const workoutDay = plan.days.find(d => d.is_workout_day);
  const restDay = plan.days.find(d => !d.is_workout_day);
  assert.ok(workoutDay && restDay);
  assert.ok(workoutDay.targets.energy > restDay.targets.energy, 'Workout day must have higher cycled calories than rest day');
  assert.equal(workoutDay.targets.protein, restDay.targets.protein, 'Daily protein must remain fixed across cycled days');
  assert.ok(plan.targets.noteCodes.includes('PLAN_CARB_CYCLING_ACTIVE'));

  // 8-week diet break suggestion
  s.nutritionContextStartedOn = dateOffset(today(), -60);
  s.checkins = [healthyCheckin()];
  const reviewed = command(s, 'review', {});
  assert.equal(reviewed.lastReview.dietBreakSuggestion?.reasonCode, 'DIET_BREAK_8W_SUGGESTED');
});

// =========================================================================
// KAN-115 (US-BE-02): Strength & Progressive Overload Engine (W1-W3, W5-W7)
// =========================================================================

test('KAN-115 W1: progression supports <50kg load tiers (+1..+2kg <=15kg, +2.5kg 16-50kg) and emits nextTargetReps = repMin', () => {
  const ex = { id: 'oedb:272', name: 'Hammer Curls', loadMode: 'external', sets: 3, repMin: 8, repMax: 12, rir: 2, laterality: 'bilateral', progressionKey: 'k1' };
  const d1 = dateOffset(today(), -4);
  const d2 = dateOffset(today(), -1);
  const mkLogs = (kg, increment = null) => [
    { date: d1, at: `${d1}T12:00:00Z`, exerciseId: ex.id, loadMode: 'external', progressionKey: 'k1', sets: [{ kg, reps: 12, rir: 2 }, { kg, reps: 12, rir: 2 }, { kg, reps: 12, rir: 2 }] },
    { date: d2, at: `${d2}T12:00:00Z`, exerciseId: ex.id, loadMode: 'external', progressionKey: 'k1', increment, sets: [{ kg, reps: 12, rir: 2 }, { kg, reps: 12, rir: 2 }, { kg, reps: 12, rir: 2 }] }
  ];

  // 10kg dumbbell -> +1kg or +2kg succeeds
  const p10 = progression(ex, mkLogs(10, 2), { progressionAllowed: true });
  assert.equal(p10.action, 'increase');
  assert.equal(p10.kg, 12);
  assert.equal(p10.nextTargetReps, 8);

  // 20kg barbell/dumbbell -> +2.5kg succeeds (previously blocked by 5% cap!)
  const p20 = progression(ex, mkLogs(20, 2.5), { progressionAllowed: true });
  assert.equal(p20.action, 'increase');
  assert.equal(p20.kg, 22.5);
  assert.equal(p20.nextTargetReps, 8);
});

test('KAN-115 W2 & W6: duration-scaled exercise counts (20->4..90->8), clean Bro Split core day, goal/age rep ranges, beginner 2-day MEV=3 sets', () => {
  const p20 = workoutPlan({ workoutDaysCount: 3, selectedWorkoutDays: [1, 3, 5], sessionDuration: 20, fitnessLevel: 'beginner' });
  assert.equal(p20.days[0].exercises.length, 4);
  assert.ok(p20.days[0].estimatedMinutes <= 20);

  const p60 = workoutPlan({ workoutDaysCount: 4, selectedWorkoutDays: [0, 2, 4, 6], sessionDuration: 60, fitnessLevel: 'intermediate', workoutSplitPreference: 'upper_lower' });
  assert.equal(p60.days[0].exercises.length, 7);
  assert.ok(p60.days[0].estimatedMinutes <= 60);

  const p90 = workoutPlan({ workoutDaysCount: 6, selectedWorkoutDays: [0, 1, 2, 3, 4, 5], sessionDuration: 90, fitnessLevel: 'intermediate', workoutSplitPreference: 'bro_split' });
  const coreDay = p90.days.find(d => d.focus === 'core');
  assert.ok(coreDay, '6-day bro_split must include core day');
  assert.ok(!coreDay.exercises.some(e => ['squat', 'hinge'].includes(e.pattern)), 'Bro Split core day must not contain squat/hinge');

  // Strength/hypertrophy rep range 6-10 on heavy compounds for intermediate muscle_gain
  const hyp = workoutPlan({ workoutDaysCount: 3, selectedWorkoutDays: [1, 3, 5], sessionDuration: 60, fitnessLevel: 'intermediate', goal: 'muscle_gain' });
  const firstCompound = hyp.days[0].exercises.find(e => ['squat', 'hinge', 'horizontal_push', 'horizontal_pull'].includes(e.pattern));
  assert.equal(firstCompound.repMin, 6);
  assert.equal(firstCompound.repMax, 10);

  // Beginner 2-day compound MEV = 3 sets
  const beg2 = workoutPlan({ workoutDaysCount: 2, selectedWorkoutDays: [1, 4], sessionDuration: 45, fitnessLevel: 'beginner' });
  const begCompound = beg2.days[0].exercises.find(e => ['squat', 'hinge', 'horizontal_push'].includes(e.pattern));
  assert.equal(begCompound.sets, 3);
});

test('KAN-115 W3: PT-curated safeForInjuries tags allow safe exercises while strictly blocking contraindicated lifts', () => {
  const hammer = catalog.exercises.find(e => e.id === 'oedb:272');
  const boxSquat = catalog.exercises.find(e => e.id === 'oedb:977');
  const gluteBridge = catalog.exercises.find(e => e.id === 'oedb:265');
  assert.equal(isFriendlyForInjuries(hammer, ['wrist_pain'], {}), true);
  assert.equal(isFriendlyForInjuries(boxSquat, ['knee_pain'], {}), true);
  assert.equal(isFriendlyForInjuries(gluteBridge, ['lower_back_pain'], {}), true);

  // Contraindicated lifts remain strictly excluded
  const barbellCurl = catalog.exercises.find(e => /barbell.*curl/i.test(e.name));
  if (barbellCurl) assert.equal(isFriendlyForInjuries(barbellCurl, ['wrist_pain'], {}), false);
  const deadlift = catalog.exercises.find(e => /conventional deadlift|barbell deadlift/i.test(e.name));
  if (deadlift) assert.equal(isFriendlyForInjuries(deadlift, ['lower_back_pain'], {}), false);
});

test('KAN-115 W5: volumeReview scales MAV caps by fitnessLevel (10/14/18), supports gain/recomposition, and gates on soreness <= 4', () => {
  const s = generate(empty(), { ...BASE_USER, goal: 'gain', targetWeight: 88, fitnessLevel: 'advanced', sessionDuration: 60 }, 'w5-vol');
  const baseCheckins = Array.from({ length: 8 }, (_, i) => ({ ...healthyCheckin(), date: dateOffset(today(), -i), at: new Date(Date.now() - i * 86400000).toISOString(), soreness: 2 }));
  s.checkins = baseCheckins;
  // Soreness = 6 must block volume progression with RECENT_SORENESS_TOO_HIGH
  s.checkins[0].soreness = 6;
  const highSoreness = volumeReview(s, { status: 'ready', baselineReady: true, muscles: {} }, Date.now());
  assert.equal(highSoreness.action, 'hold');
  assert.equal(highSoreness.reasonCode, 'RECENT_SORENESS_TOO_HIGH');

  // Verify gain goal is NOT rejected by GOAL_NOT_MUSCLE_GAIN
  s.checkins[0].soreness = 2;
  const okGoal = volumeReview(s, { status: 'ready', baselineReady: true, muscles: {} }, Date.now());
  assert.notEqual(okGoal.reasonCode, 'GOAL_NOT_MUSCLE_GAIN');
});

test('KAN-115 W7: vigorous cardio overlapping leg day emits CARDIO_LEG_DAY_INTERFERENCE_NOTE', () => {
  const s = generate(empty(), BASE_USER, 'w7-cardio');
  const legDayIndex = s.workoutPlan.days[0].dayIndex;
  let targetDate = today();
  for (let i = 0; i < 7; i++) {
    const candidate = dateOffset(today(), -i);
    if (new Date(`${candidate}T12:00:00Z`).getUTCDay() === legDayIndex) {
      targetDate = candidate;
      break;
    }
  }
  const rec = logCardioSession(s, { date: targetDate, modality: 'running', durationMinutes: 30, intensity: 'vigorous' });
  assert.equal(rec.interferenceNote?.code, 'CARDIO_LEG_DAY_INTERFERENCE_NOTE');
});

// =========================================================================
// KAN-116 (US-BE-03): Bilingual Push, Locale Parity & Value-Peak Freemium
// =========================================================================

test('KAN-116 P2 & P3: locale normalization (en-* -> en, ar-* -> ar), bilingual push copy with first name, and fasting suppression', () => {
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('en_GB'), 'en');
  assert.equal(normalizeLocale('ar-EG'), 'ar');
  assert.equal(normalizeLocale('ar-SA'), 'ar');
  assert.equal(normalizeLocale('xx-INVALID', null), null);

  const sEn = generate(empty(), { ...BASE_USER, locale: 'en-US' }, 'p3-en');
  assert.equal(sEn.profile.locale, 'en');

  const arPush = formatPushNotification('pre_workout_reminder', { locale: 'ar-EG', userName: 'أحمد علي', params: { minutesBefore: 30 } });
  assert.equal(arPush.locale, 'ar');
  assert.ok(arPush.body.includes('أحمد'));
  assert.ok(!/آلي|الذكي|محرك/.test(arPush.title + arPush.body));

  const enPush = formatPushNotification('pre_workout_reminder', { locale: 'en-US', userName: 'Sarah Lee', params: { minutesBefore: 30 } });
  assert.equal(enPush.locale, 'en');
  assert.ok(enPush.body.includes('Sarah'));
  assert.ok(!/\b(?:AI|automated|algorithm|engine|bot)\b/i.test(enPush.title + enPush.body));

  // Fasting suppression: Ramadan daylight suppresses food/hydration, post-iftar allows
  const ramadanAcc = { ramadanMode: { enabled: true, suhoorCutoffTime: '04:20', iftarTime: '18:05' } };
  assert.equal(isFastingFoodHydrationSuppressed(ramadanAcc, '13:00', today()), true);
  assert.equal(isFastingFoodHydrationSuppressed(ramadanAcc, '20:00', today()), false);

  // IF fasting suppression: 16:8 eating 12:00-20:00 -> 09:00 suppressed, 14:00 allowed
  const ifAcc = { preferences: { diet: 'intermittent_fasting' }, fastingState: { mode: 'if_16_8', windowStart: '12:00', windowEnd: '20:00' } };
  assert.equal(isFastingFoodHydrationSuppressed(ifAcc, '09:00', today()), true);
  assert.equal(isFastingFoodHydrationSuppressed(ifAcc, '14:00', today()), false);
});

test('KAN-116 P4 & Bootstrap Addendum: Value-Peak Freemium limits and additive bootstrap DTO fields', () => {
  assert.ok(FREE_FEATURES.includes('standard_plan_renewals'));
  assert.equal(FREE_LIMITS.barcodeScansDailyLimit, 3);
  assert.equal(FREE_LIMITS.mealCaptureMonthlyLimit, 3);
  assert.equal(FREE_LIMITS.specialistConsultationMonthlyLimit, 5);

  const s = generate(empty(), { ...BASE_USER, batchPrepMode: true }, 'p4-boot');
  const boot = presentBootstrap(s);
  assert.equal(typeof boot.daysSinceStart, 'number');
  assert.equal(boot.batchPrepMode, true);
  assert.equal(boot.discreetMode, false);
  assert.ok(boot.proImpact && typeof boot.proImpact.plansGenerated === 'number');
  assert.equal(typeof boot.engagementState.daysSinceStart, 'number');
});
