import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';
import { empty, generate, previewPlan, evaluateEligibility } from '../server/coaching.mjs';
import { isFriendlyForInjuries, exerciseAlternatives, estimatedSessionMinutes, equipmentAllowed } from '../server/workouts.mjs';
import { assertDietDay } from '../diet-patterns.mjs';
import { ACTIVE_ONBOARDING_CONDITIONS, SUPPORTED_WORKOUT_INJURIES, isPregnantStatus } from '../coaching-shared.mjs';

const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;
const COACHING_CODES = JSON.parse(readFileSync('contracts/coaching-codes.json', 'utf8')).codes;
const PREG_UNSAFE_REAL = /bench press|floor press|chest fly|fly with dumbbells|lying|laying|prone|superman|crunch|sit.?up|v.?up|leg raise|plank|rollout|ab wheel|russian twist|scissor|flutter|burpee|jump|plyo|deadlift|\brdl\b|romanian|hip thrust|bridge|push.?up|pushup/i;
const SENIOR_UNSAFE_REAL = /jump|plyo|box jump|barbell.*squat|hack squat|overhead squat|front squat|deadlift|\brdl\b|snatch|clean|jerk|swing|behind.*neck|pistol|dragon|handstand|muscle.?up|rollout|ab wheel|barbell.*overhead|military press|\bdips?\b/i;

const BASE_DRAFT = {
  name: 'Matrix Persona',
  birthDate: '1994-06-15',
  sex: 'male',
  weight: 80,
  height: 175,
  goal: 'maintain',
  goalPace: 'moderate',
  activity: 'light',
  serviceTrack: 'nutrition_and_workouts',
  fitnessLevel: 'intermediate',
  workoutLocation: 'gym_only',
  selectedWorkoutDays: [1, 3, 5],
  sessionDuration: 45,
  workoutSplitPreference: 'auto',
  homeEquipment: ['none'],
  dietType: 'balanced',
  region: 'egypt',
  budget: 'medium',
  mealsCount: 4,
  diseases: [],
  injuries: [],
  excludedGroups: [],
  maternalStatus: 'none',
  parqRedFlag: false,
  healthConfirmed: true,
};

function buildPersonaCohort() {
  const personas = [];
  const add = (id, overrides, expect = {}) => personas.push({ id, draft: { ...BASE_DRAFT, ...overrides }, expect });

  // A. Goal x ServiceTrack x Activity x Pace Synergy (29 personas)
  for (const goal of ['maintain', 'lose', 'gain', 'muscle_gain']) {
    for (const serviceTrack of ['nutrition_and_workouts', 'nutrition_only', 'workouts_only']) {
      const targetWeight = goal === 'lose' ? 72 : goal === 'gain' ? 88 : goal === 'muscle_gain' ? 85 : null;
      add(`goal_${goal}_${serviceTrack}`, { goal, serviceTrack, targetWeight });
    }
  }
  add('maintain_sedentary_5d_60m', { goal: 'maintain', activity: 'sedentary', selectedWorkoutDays: [0, 1, 2, 4, 5], sessionDuration: 60, fitnessLevel: 'advanced' });
  add('maintain_sedentary_3d_45m', { goal: 'maintain', activity: 'sedentary', selectedWorkoutDays: [1, 3, 5], sessionDuration: 45 });
  add('maintain_active_6d_90m', { goal: 'maintain', activity: 'active', selectedWorkoutDays: [0, 1, 2, 3, 4, 5], sessionDuration: 90, fitnessLevel: 'advanced' });
  add('maintain_with_stale_targetWeight', { goal: 'maintain', targetWeight: 70 });
  add('recomp_muscle_gain_same_weight', { goal: 'muscle_gain', targetWeight: 80, selectedWorkoutDays: [0, 2, 4, 6] });
  add('muscle_gain_nutrition_only_no_ext', { goal: 'muscle_gain', targetWeight: 85, serviceTrack: 'nutrition_only', selectedWorkoutDays: [] });
  add('muscle_gain_nutrition_only_with_ext', { goal: 'muscle_gain', targetWeight: 85, serviceTrack: 'nutrition_only', selectedWorkoutDays: [], externalTrainingDays: [1, 3, 5] });
  add('nutrition_only_with_stale_selectedDays', { goal: 'lose', targetWeight: 73, serviceTrack: 'nutrition_only', selectedWorkoutDays: [0, 2, 4], externalTrainingDays: [] });
  for (const pace of ['slow', 'moderate', 'fast']) {
    add(`lose_pace_${pace}`, { goal: 'lose', targetWeight: 70, goalPace: pace });
    add(`gain_pace_${pace}`, { goal: 'gain', targetWeight: 90, goalPace: pace });
    add(`muscle_pace_${pace}`, { goal: 'muscle_gain', targetWeight: 86, goalPace: pace });
  }

  // B. All 9 Diet Types x Regions x Budgets x MealsCount (43 personas)
  for (const dietType of ['balanced', 'high_protein', 'low_carb', 'keto', 'mediterranean', 'dash', 'vegetarian', 'vegan', 'intermittent_fasting']) {
    add(`diet_${dietType}_egypt_med`, { dietType, goal: 'lose', targetWeight: 72 });
    add(`diet_${dietType}_gulf_low`, { dietType, region: 'gulf', budget: 'low', goal: 'maintain' });
    add(`diet_${dietType}_levant_high`, {
      dietType,
      region: 'levant',
      budget: 'high',
      goal: dietType === 'keto' || dietType === 'intermittent_fasting' ? 'maintain' : 'gain',
      targetWeight: dietType === 'keto' || dietType === 'intermittent_fasting' ? null : 88,
    });
  }
  for (const region of ['egypt', 'gulf', 'levant', 'maghreb']) {
    for (const mealsCount of [2, 3, 5]) {
      add(`region_${region}_meals_${mealsCount}`, { region, mealsCount, goal: 'maintain' });
    }
  }
  for (const ifStartHour of [6, 8, 12, 16]) {
    add(`if_start_${ifStartHour}`, { dietType: 'intermittent_fasting', ifStartHour, goal: 'lose', targetWeight: 73 });
  }

  // C. All 13 Active + 3 Wellness Conditions & Realistic Multi-Condition Combos (45 personas)
  for (const cond of ACTIVE_ONBOARDING_CONDITIONS) {
    add(`cond_${cond}_maintain`, { diseases: [cond], goal: 'maintain', sex: cond === 'pcos' ? 'female' : 'male' });
    add(`cond_${cond}_lose`, { diseases: [cond], goal: 'lose', targetWeight: 72, sex: cond === 'pcos' ? 'female' : 'male' });
  }
  for (const cond of ['anemia', 'vitamin_d_deficiency', 'fatty_liver']) {
    add(`cond_extra_${cond}`, { diseases: [cond], goal: 'maintain' });
  }
  const twoCombos = [
    ['diabetes_t2', 'hypertension'],
    ['diabetes_t2', 'cholesterol'],
    ['pcos', 'insulin_resistance'],
    ['hypothyroid', 'lactose_intolerance'],
    ['gout', 'hypertension'],
    ['celiac', 'lactose_intolerance'],
    ['ibs', 'favism'],
    ['kidney', 'hypertension'],
    ['diabetes_t1', 'celiac'],
    ['hypertension', 'cholesterol'],
    ['diabetes_t2', 'gout'],
    ['celiac', 'ibs'],
    ['gout', 'cholesterol'],
  ];
  for (const pair of twoCombos) {
    add(`combo2_${pair.join('_')}`, { diseases: pair, sex: pair.includes('pcos') ? 'female' : 'male', goal: 'maintain' });
  }
  add('blocked_t1_t2', { diseases: ['diabetes_t1', 'diabetes_t2'] }, { expectError: 'CONFLICTING_CONDITIONS' });
  add('blocked_kidney_t1', { diseases: ['kidney', 'diabetes_t1'] }, { expectReview: 'MULTI_CONDITION_CLINICAL_REVIEW' });
  add('blocked_3dietary', { diseases: ['hypertension', 'cholesterol', 'gout'] }, { expectReview: 'MULTI_CONDITION_CLINICAL_REVIEW' });

  // D. Maternal Statuses x Goals x Diets x Workouts (18 personas)
  for (const ms of ['pregnant_t1', 'pregnant_t2', 'pregnant_t3']) {
    add(`maternal_${ms}_maintain_gym`, { sex: 'female', birthDate: '1996-03-10', weight: 65, height: 164, maternalStatus: ms, goal: 'maintain', workoutLocation: 'gym_only', selectedWorkoutDays: [1, 3, 5] });
    add(`maternal_${ms}_maintain_home`, { sex: 'female', birthDate: '1996-03-10', weight: 65, height: 164, maternalStatus: ms, goal: 'maintain', workoutLocation: 'home_only', homeEquipment: ['dumbbells', 'yoga_mat'], selectedWorkoutDays: [1, 3, 5] });
    add(`maternal_${ms}_low_carb_blocked`, { sex: 'female', birthDate: '1996-03-10', weight: 65, height: 164, maternalStatus: ms, goal: 'maintain', dietType: 'low_carb', serviceTrack: 'nutrition_only' }, { expectError: 'MEDICAL_DIET_CONFLICT' });
    add(`maternal_${ms}_lose_blocked`, { sex: 'female', birthDate: '1996-03-10', weight: 75, height: 164, maternalStatus: ms, goal: 'lose', targetWeight: 65 }, { expectError: 'MATERNAL_CALORIE_CUT_BLOCKED' });
  }
  add('maternal_bf_lose', { sex: 'female', birthDate: '1995-07-20', weight: 78, height: 163, maternalStatus: 'breastfeeding', goal: 'lose', targetWeight: 68, goalPace: 'fast' });
  add('maternal_bf_maintain', { sex: 'female', birthDate: '1995-07-20', weight: 64, height: 163, maternalStatus: 'breastfeeding', goal: 'maintain' });
  add('maternal_bf_keto_blocked', { sex: 'female', birthDate: '1995-07-20', weight: 70, height: 163, maternalStatus: 'breastfeeding', goal: 'maintain', dietType: 'keto' }, { expectError: 'MEDICAL_DIET_CONFLICT' });
  add('maternal_preg2_hypothyroid', { sex: 'female', birthDate: '1995-07-20', weight: 68, height: 163, maternalStatus: 'pregnant_t2', diseases: ['hypothyroid'], goal: 'maintain' });
  add('maternal_preg3_pcos', { sex: 'female', birthDate: '1995-07-20', weight: 74, height: 163, maternalStatus: 'pregnant_t3', diseases: ['pcos'], goal: 'maintain' });
  add('maternal_preg2_diabetes_t2', { sex: 'female', birthDate: '1995-07-20', weight: 78, height: 163, maternalStatus: 'pregnant_t2', diseases: ['diabetes_t2'], goal: 'maintain' });

  // E. All 9 Injuries x Gym/Home x Multi-Injury + Senior 70+ + PAR-Q (27 personas)
  for (const inj of SUPPORTED_WORKOUT_INJURIES) {
    add(`inj_${inj}_gym`, { injuries: [inj], sex: inj === 'diastasis_recti' ? 'female' : 'male', workoutLocation: 'gym_only', selectedWorkoutDays: [0, 2, 4, 5], workoutSplitPreference: 'auto' });
    add(`inj_${inj}_home_bw`, { injuries: [inj], sex: inj === 'diastasis_recti' ? 'female' : 'male', workoutLocation: 'home_only', homeEquipment: ['none'], selectedWorkoutDays: [1, 3, 5] });
  }
  add('inj_2_knee_back_gym', { injuries: ['knee', 'lower_back'], workoutLocation: 'gym_only', selectedWorkoutDays: [0, 2, 4, 5] });
  add('inj_2_shoulder_wrist_home_db', { injuries: ['shoulder', 'wrist'], workoutLocation: 'home_only', homeEquipment: ['dumbbells', 'resistance_bands'], selectedWorkoutDays: [1, 3, 5] });
  add('inj_3_knee_back_shoulder_gym', { injuries: ['knee', 'lower_back', 'shoulder'], workoutLocation: 'gym_only', selectedWorkoutDays: [1, 3, 5] });
  add('inj_3_knee_back_wrist_home_bw', { injuries: ['knee', 'lower_back', 'wrist'], workoutLocation: 'home_only', homeEquipment: ['none'], selectedWorkoutDays: [1, 3, 5] });
  add('inj_4_blocked', { injuries: ['knee', 'lower_back', 'shoulder', 'wrist'] }, { expectReview: 'MULTI_INJURY_REQUIRES_REVIEW' });
  add('parq_blocked', { parqRedFlag: true, serviceTrack: 'nutrition_and_workouts' }, { expectReview: 'PARQ_CLEARANCE_REQUIRED' });
  add('senior_72_lose_gym', { birthDate: '1954-01-10', weight: 84, height: 170, goal: 'lose', targetWeight: 75, goalPace: 'fast', fitnessLevel: 'intermediate', workoutLocation: 'gym_only', selectedWorkoutDays: [1, 3, 5] });
  add('senior_78_maintain_home', { birthDate: '1948-04-10', sex: 'female', weight: 65, height: 158, goal: 'maintain', fitnessLevel: 'beginner', workoutLocation: 'home_only', homeEquipment: ['resistance_bands'], selectedWorkoutDays: [1, 4], diseases: ['hypertension'] });
  add('senior_85_gain_mix', { birthDate: '1941-04-10', weight: 56, height: 172, goal: 'gain', targetWeight: 62, workoutLocation: 'home_and_gym', dayLocations: { 1: 'gym', 4: 'home' }, homeEquipment: ['dumbbells'], selectedWorkoutDays: [1, 4] });

  // F. Extreme Anthropometrics, Exclusions & Splits (20 personas)
  add('short_female_low_tdee_lose', { sex: 'female', birthDate: '1980-01-01', weight: 50, height: 148, activity: 'sedentary', goal: 'lose', targetWeight: 46, goalPace: 'moderate', serviceTrack: 'nutrition_only' });
  add('very_short_female_floor_hit', { sex: 'female', birthDate: '1965-01-01', weight: 46, height: 145, activity: 'sedentary', goal: 'lose', targetWeight: 43, goalPace: 'fast', serviceTrack: 'nutrition_only' });
  add('obese_bmi42_lose', { weight: 130, height: 175, goal: 'lose', targetWeight: 95, bmiWarningOverride: true, goalPace: 'moderate', injuries: ['knee'] });
  add('underweight_bmi17_gain', { weight: 52, height: 175, goal: 'gain', targetWeight: 64, goalPace: 'moderate' });
  add('underweight_bmi17_lose_blocked', { weight: 52, height: 175, goal: 'lose', targetWeight: 48 }, { expectError: 'WEIGHT_LOSS_UNDERWEIGHT_UNSAFE' });
  add('tall_athlete_ceiling', { weight: 115, height: 205, activity: 'active', goal: 'gain', targetWeight: 122, goalPace: 'fast', fitnessLevel: 'advanced', selectedWorkoutDays: [0, 1, 2, 4, 5], sessionDuration: 90 });
  add('excl_dairy_eggs_fish', { excludedGroups: ['dairy', 'eggs', 'fish'], goal: 'maintain' });
  add('excl_gluten_dairy_nuts', { excludedGroups: ['gluten', 'dairy', 'nuts'], goal: 'lose', targetWeight: 72 });
  add('excl_poultry_red_meat_balanced', { excludedGroups: ['poultry', 'red_meat'], goal: 'maintain' });
  add('excl_vegan_no_soy', { dietType: 'vegan', excludedGroups: ['soy'], goal: 'maintain' });
  add('excl_vegan_no_legumes_no_nuts', { dietType: 'vegan', excludedGroups: ['legumes', 'nuts'], goal: 'maintain' });
  add('excl_keto_no_animal_proteins', { dietType: 'keto', excludedGroups: ['poultry', 'red_meat', 'fish', 'eggs', 'dairy'], goal: 'maintain' });
  add('excl_med_dash_hypertension_gulf', { dietType: 'dash', diseases: ['hypertension'], region: 'gulf', budget: 'low', goal: 'lose', targetWeight: 74 });
  add('excl_celiac_vegan_levant', { dietType: 'vegan', diseases: ['celiac'], region: 'levant', goal: 'maintain' });
  add('excl_ibs_vegetarian', { dietType: 'vegetarian', diseases: ['ibs'], goal: 'maintain' });
  add('excl_diabetes_t2_low_carb_low_budget', { dietType: 'low_carb', diseases: ['diabetes_t2'], budget: 'low', goal: 'lose', targetWeight: 72 });
  add('split_7days_ppl', { selectedWorkoutDays: [0, 1, 2, 3, 4, 5, 6], workoutSplitPreference: 'ppl', sessionDuration: 60, fitnessLevel: 'advanced', goal: 'muscle_gain', targetWeight: 85 });
  add('split_4days_bro', { selectedWorkoutDays: [0, 1, 3, 5], workoutSplitPreference: 'bro_split', sessionDuration: 60, goal: 'muscle_gain', targetWeight: 85 });
  add('split_1day_20min_home_bw', { selectedWorkoutDays: [2], sessionDuration: 20, workoutLocation: 'home_only', homeEquipment: ['none'], fitnessLevel: 'beginner', goal: 'maintain' });
  add('underage_16_blocked', { birthDate: '2010-05-01' }, { expectError: 'INVALID_BIRTH_DATE' });

  return personas;
}

test('Clinical, nutrition, exercise-physiology & synergy audit across 180+ diverse onboarding personas', () => {
  const personas = buildPersonaCohort();
  assert.ok(personas.length >= 150, `Expected >= 150 personas, got ${personas.length}`);

  let generatedCount = 0;
  let blockedCount = 0;

  for (const { id, draft, expect } of personas) {
    let elig, prev, gen, prevErr = null, genErr = null;
    try { elig = evaluateEligibility(draft); } catch (e) { prevErr = e; }
    if (!prevErr) {
      try { prev = previewPlan(draft); } catch (e) { prevErr = e; }
    }
    try { gen = generate(empty(), draft, `matrix-${id}`); } catch (e) { genErr = e; }

    if (expect.expectError) {
      assert.equal(prevErr?.code, expect.expectError, `${id}: preview error mismatch`);
      assert.equal(genErr?.code, expect.expectError, `${id}: generate error mismatch`);
      blockedCount++;
      continue;
    }
    if (expect.expectReview) {
      assert.equal(elig?.status, 'requires_review', `${id}: expected requires_review`);
      assert.equal(genErr?.code, expect.expectReview, `${id}: expected generate error ${expect.expectReview}`);
      blockedCount++;
      continue;
    }

    assert.equal(prevErr, null, `${id}: unexpected preview error ${prevErr?.code}: ${prevErr?.message}`);
    const prevFeasible = prev.eligibility?.status !== 'requires_review'
      && prev.feasibility?.nutritionFeasible !== false
      && prev.feasibility?.workoutFeasible !== false;

    if (!prevFeasible) {
      assert.ok(genErr, `${id}: preview predicted infeasible (${JSON.stringify(prev.feasibility?.blockingConflicts)}) but generate succeeded`);
      blockedCount++;
      continue;
    }

    assert.equal(genErr, null, `${id}: preview succeeded as feasible, but generate threw ${genErr?.code}: ${genErr?.message}`);
    generatedCount++;

    // Brand voice & specialistHighlights check across all server-emitted warnings, notes, & highlights
    assert.ok(Array.isArray(prev.specialistHighlights) && prev.specialistHighlights.length <= 6, `${id}: invalid preview specialistHighlights`);
    assert.ok(Array.isArray(gen.lastSpecialistHighlights) && gen.lastSpecialistHighlights.length <= 6, `${id}: invalid generated specialistHighlights`);
    for (const h of [...prev.specialistHighlights, ...gen.lastSpecialistHighlights]) {
      assert.ok(Object.hasOwn(COACHING_CODES, h.code), `${id}: unknown highlight code ${h.code}`);
      assert.ok(!FORBIDDEN_VOICE_RE.test(h.message), `${id}: forbidden copy in highlight "${h.message}"`);
    }
    const allCopy = [
      ...(prev.warnings || []),
      ...(prev.eligibilityReasons || []),
      ...(gen.workoutPlan?.warnings || []),
      ...(gen.plans?.[0]?.targets?.notes || []),
    ];
    for (const line of allCopy) {
      assert.ok(!FORBIDDEN_VOICE_RE.test(line), `${id}: forbidden AI/automated/engine wording in "${line}"`);
    }

    const plan = gen.plans?.[0];
    const wp = gen.workoutPlan;

    if (plan) {
      // Exact Preview <-> Generate parity
      assert.equal(prev.dailyCalories, plan.targets.energy, `${id}: preview vs generate calorie mismatch`);
      assert.ok(Math.abs(prev.macros.protein - plan.targets.protein) <= 0.2, `${id}: protein parity mismatch`);
      assert.ok(Math.abs(prev.macros.carbs - plan.targets.carbs) <= 0.2, `${id}: carbs parity mismatch`);
      assert.ok(Math.abs(prev.macros.fat - plan.targets.fat) <= 0.2, `${id}: fat parity mismatch`);
      assert.equal(prev.waterTarget.liters, Math.max(2.0, Math.min(5.0, prev.waterTarget.liters)));

      // Forecast truthfulness
      const fc = plan.targets.forecast;
      if (draft.goal === 'maintain' || isPregnantStatus(draft.maternalStatus)) {
        assert.equal(fc, undefined, `${id}: maintain/pregnancy must not emit weight-change forecast`);
        if (draft.goal === 'maintain') {
          assert.equal(gen.profile.targetWeight, null, `${id}: maintain must clear stale targetWeight`);
        }
      }
      if (draft.goal === 'lose' && fc) {
        assert.ok(fc.weekly_rate_kg <= 0, `${id}: lose goal must never predict positive weight gain rate (${fc.weekly_rate_kg})`);
      }
      if ((draft.goal === 'gain' || draft.goal === 'muscle_gain') && draft.targetWeight > draft.weight && fc) {
        assert.ok(fc.weekly_rate_kg >= 0, `${id}: gain goal must not predict negative weight loss rate (${fc.weekly_rate_kg})`);
      }

      // Macro physiological bounds
      const diseases = new Set(draft.diseases || []);
      const kcal = plan.targets.energy;
      if (diseases.has('cholesterol')) {
        const fatShare = (plan.targets.fat * 9) / kcal;
        assert.ok(fatShare <= 0.31, `${id}: cholesterol fatShare ${(fatShare * 100).toFixed(1)}% exceeds 31%`);
      }
      if (isPregnantStatus(draft.maternalStatus)) {
        assert.ok(plan.targets.carbs >= 150, `${id}: pregnancy target carbs ${plan.targets.carbs}g below fetal glucose floor`);
        const addon = draft.maternalStatus === 'pregnant_t2' ? 15 : draft.maternalStatus === 'pregnant_t3' ? 25 : 0;
        const expectedMinProt = Math.round((plan.targets.effective_weight * 1.4 + (diseases.has('kidney') ? 0 : addon)) * 10) / 10;
        if (!diseases.has('kidney')) {
          assert.ok(plan.targets.protein >= expectedMinProt - 0.5, `${id}: pregnancy protein ${plan.targets.protein}g < floor ${expectedMinProt}g`);
        }
      }
      if (draft.goal === 'muscle_gain' && draft.serviceTrack === 'nutrition_only' && !(draft.externalTrainingDays?.length)) {
        assert.ok(plan.targets.protein_factor >= 1.4, `${id}: muscle_gain nutrition_only should keep >= 1.4 g/kg protein`);
        assert.ok(plan.targets.noteCodes.includes('PLAN_MUSCLE_GAIN_EXTERNAL_TRAINING_NOTE'));
      }
      if (draft.activity === 'sedentary' && wp && wp.days.length >= 3) {
        assert.ok(plan.targets.noteCodes.includes('PLAN_SEDENTARY_WORKOUT_ENERGY_NOTE'));
      }

      // Day-by-day & meal-by-meal clinical validation
      assert.equal(plan.days.length, 7, `${id}: plan must contain 7 days`);
      for (const day of plan.days) {
        assertDietDay(day.meals.map(m => m.snapshot), gen.preferences.diet, day.targets, gen.profile);
        const ingKeys = day.meals.flatMap(m => m.snapshot.ingredients || []).map(i => i.key);

        if (isPregnantStatus(draft.maternalStatus)) {
          assert.ok(!ingKeys.includes('liver'), `${id}: pregnancy meal must never contain liver`);
        }
        if (diseases.has('diabetes_t1') || diseases.has('diabetes_t2') || diseases.has('insulin_resistance') || diseases.has('pcos')) {
          assert.ok(!ingKeys.includes('dates') && !ingKeys.includes('honey'), `${id}: glycemic condition served dates/honey`);
          if (!['keto', 'low_carb'].includes(draft.dietType) && day.summary.values.carbs != null) {
            const carbPct = (Number(day.summary.values.carbs) * 4) / kcal;
            assert.ok(carbPct <= 0.49, `${id} ${day.date}: glycemic actual carbs ${(carbPct * 100).toFixed(1)}% too high`);
          }
        }
        if (diseases.has('kidney')) {
          const cap = plan.targets.effective_weight * 1.3;
          assert.ok(Number(day.summary.values.protein) <= cap, `${id} ${day.date}: kidney protein ${day.summary.values.protein}g exceeds conservative cap ${cap.toFixed(1)}g`);
        }
      }
    }

    if (wp) {
      const diseases = new Set(draft.diseases || []);
      const injuries = draft.injuries || [];
      assert.ok(wp.days.length >= 1, `${id}: workoutPlan must have scheduled days`);
      assert.ok(!FORBIDDEN_VOICE_RE.test(wp.goalNote), `${id}: forbidden copy in workout goalNote`);

      if (diseases.has('hypertension')) {
        assert.ok(wp.warningCodes.includes('WORKOUT_HYPERTENSION_GUIDANCE'), `${id}: hypertension missing workout guidance`);
      }
      if (diseases.has('diabetes_t1') || diseases.has('diabetes_t2')) {
        assert.ok(wp.warningCodes.includes('WORKOUT_DIABETES_GUIDANCE'), `${id}: diabetes missing workout guidance`);
      }
      if (diseases.has('kidney') || diseases.has('gout')) {
        assert.ok(wp.warningCodes.includes('WORKOUT_RENAL_GOUT_GUIDANCE'), `${id}: renal/gout missing workout guidance`);
      }

      for (const day of wp.days) {
        assert.ok(day.exercises.length > 0, `${id}: day ${day.dayIndex} has zero exercises`);
        assert.ok(day.estimatedMinutes <= draft.sessionDuration, `${id}: day ${day.dayIndex} exceeds duration`);
        assert.equal(day.estimatedMinutes, estimatedSessionMinutes(day));
        for (const ex of day.exercises) {
          assert.ok(equipmentAllowed(ex, gen.onboarding.workoutPrefs, day.location), `${id}: disallowed equipment on ${ex.name}`);
          assert.ok(isFriendlyForInjuries(ex, injuries, gen.profile), `${id}: unsafe exercise ${ex.name} for profile/injuries`);
          if (isPregnantStatus(draft.maternalStatus)) {
            assert.ok(ex.rir >= 3, `${id}: pregnancy RIR must be >= 3 on ${ex.name}`);
            assert.ok(ex.sets <= 3, `${id}: pregnancy sets must be <= 3 on ${ex.name}`);
            if (draft.maternalStatus !== 'pregnant_t1') {
              assert.ok(!PREG_UNSAFE_REAL.test(ex.name), `${id}: post-T1 unsafe exercise ${ex.name}`);
            }
          }
          if (gen.profile.seniorMode) {
            assert.ok(ex.rir >= 3, `${id}: seniorMode RIR must be >= 3 on ${ex.name}`);
            assert.ok(ex.sets <= 3, `${id}: seniorMode sets must be <= 3 on ${ex.name}`);
            assert.ok(!SENIOR_UNSAFE_REAL.test(ex.name), `${id}: seniorMode unsafe exercise ${ex.name}`);
          }
          if (diseases.has('hypertension')) {
            assert.ok(ex.rir >= 3, `${id}: hypertension RIR must be >= 3 on ${ex.name}`);
            assert.ok(ex.sets <= 3, `${id}: hypertension sets must be <= 3 on ${ex.name}`);
          }
          if (draft.goal === 'maintain') {
            assert.ok(ex.rir >= 3 && ex.sets <= 3, `${id}: maintain goal should keep RIR >= 3 and sets <= 3 on ${ex.name}`);
          }
          for (const alt of exerciseAlternatives(gen, day.dayIndex, ex.id)) {
            assert.ok(isFriendlyForInjuries(alt, injuries, gen.profile), `${id}: unsafe alternative ${alt.name}`);
          }
        }
      }
    }
  }

  assert.ok(generatedCount >= 150, `Expected >= 150 successfully generated plans, got ${generatedCount}`);
  assert.ok(blockedCount >= 10, `Expected clinical/safety blocks verified, got ${blockedCount}`);
});

test('HTTP E2E verification for clinical nutrition & workout synergy endpoints', async () => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    bindings: {
      AUTH_JWT_SECRET: 'clinical-synergy-e2e-secret-key-256b',
      AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
      AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
      RATE_LIMIT_PER_MINUTE: '200',
      OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
    },
  });

  try {
    const db = await mf.getD1Database('DB');
    await migrateLocal(db);
    const kp = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify']
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
    pubJwk.kid = 'clin-k1';
    pubJwk.use = 'sig';
    pubJwk.alg = 'RS256';
    const b64url = input => Buffer.from(typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = { iss: 'https://accounts.google.com', aud: 'curafit-android-client-id', sub: 'google-sub-clin-1', email: 'clin@curafit.app', email_verified: true, iat: nowSec, exp: nowSec + 3600 };
    const hdr = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'clin-k1' }));
    const bdy = b64url(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${hdr}.${bdy}`));
    const idToken = `${hdr}.${bdy}.${b64url(sig)}`;

    const call = (path, opts = {}) => cloudflareEntry.fetch(
      new Request(`https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/${path}`, opts),
      {
        AUTH_JWT_SECRET: 'clinical-synergy-e2e-secret-key-256b',
        AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
        AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
        RATE_LIMIT_PER_MINUTE: '200',
        OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
        OAUTH_GOOGLE_JWKS_JSON: JSON.stringify({ keys: [pubJwk] }),
        DB: db,
      },
      { waitUntil() {} }
    );

    // 1. Pregnant T2 + low_carb rejected via /v1/plans/preview
    const pregLowCarb = await call('plans/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_DRAFT, sex: 'female', maternalStatus: 'pregnant_t2', dietType: 'low_carb', goal: 'maintain' }),
    });
    assert.equal(pregLowCarb.status, 400);
    assert.equal((await pregLowCarb.json()).error.code, 'MEDICAL_DIET_CONFLICT');

    // 2. Maintain + sedentary + 5d workouts preview matches generate and returns synergy note & specialistHighlights
    const maintDraft = { ...BASE_DRAFT, goal: 'maintain', targetWeight: 70, activity: 'sedentary', selectedWorkoutDays: [0, 1, 2, 4, 5], fitnessLevel: 'advanced' };
    const prevRes = await call('plans/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(maintDraft),
    });
    assert.equal(prevRes.status, 200);
    const prevBody = (await prevRes.json()).data;
    assert.equal(prevBody.forecast, null);
    assert.ok(prevBody.warningCodes.includes('PLAN_SEDENTARY_WORKOUT_ENERGY_NOTE'));
    assert.ok(Array.isArray(prevBody.specialistHighlights) && prevBody.specialistHighlights.length > 0 && prevBody.specialistHighlights.length <= 6);
    assert.ok(prevBody.specialistHighlights.some(h => h.code === 'HIGHLIGHT_MAINTAIN_SYNERGY'));

    // 2b. Pregnant T2 balanced preview shows liver food-safety + workout safety highlights
    const pregPrevRes = await call('plans/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...BASE_DRAFT, sex: 'female', maternalStatus: 'pregnant_t2', dietType: 'balanced', goal: 'maintain' }),
    });
    assert.equal(pregPrevRes.status, 200);
    const pregPrevBody = (await pregPrevRes.json()).data;
    assert.ok(pregPrevBody.specialistHighlights.some(h => h.code === 'PLAN_PREGNANCY_T2_CALIBRATION'));
    assert.ok(pregPrevBody.specialistHighlights.some(h => h.code === 'PLAN_PREGNANCY_FOOD_SAFETY'));
    assert.ok(pregPrevBody.specialistHighlights.some(h => h.code === 'WORKOUT_PREGNANCY_SAFETY_ACTIVE'));

    // 3. Auth + generate + verify generated state over HTTP
    const authRes = await call('auth/oauth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    const token = (await authRes.json()).data.accessToken;
    const genRes = await call('commands?view=full', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'clin-e2e-1' },
      body: JSON.stringify({ revision: 0, action: 'generate', payload: maintDraft }),
    });
    assert.equal(genRes.status, 200);
    const genData = (await genRes.json()).data;
    assert.equal(genData.plans[0].targets.energy, prevBody.dailyCalories);
    assert.equal(genData.profile.targetWeight, null);
    assert.ok(genData.workoutPlan.days.every(d => d.exercises.every(e => e.rir >= 3 && e.sets <= 3)));
    assert.ok(Array.isArray(genData.specialistHighlights) && genData.specialistHighlights.some(h => h.code === 'HIGHLIGHT_MAINTAIN_SYNERGY'));
    const bootRes = await call('bootstrap', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(bootRes.status, 200);
    const bootData = (await bootRes.json()).data;
    assert.ok(Array.isArray(bootData.specialistHighlights) && bootData.specialistHighlights.some(h => h.code === 'HIGHLIGHT_MAINTAIN_SYNERGY'));
  } finally {
    await mf.dispose();
  }
});
