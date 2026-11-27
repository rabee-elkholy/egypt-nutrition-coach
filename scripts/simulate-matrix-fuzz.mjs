// Layer 1 Automated Combinatorial Matrix & Fuzzing Simulation (560+ Cases)
// Enforces hard clinical, nutritional, hydration, training, exclusion, and copy invariants.
import { writeFile, mkdir } from 'node:fs/promises';
import { withClock } from '../server/clock.mjs';
import {
  empty,
  previewPlan,
  generate,
  command,
  dailyWaterTarget,
  evaluateEligibility
} from '../server/coaching.mjs';
import { mealAlternatives, replaceMeal, library } from '../server/food.mjs';
import { getPantryAlternatives } from '../server/nutrition-tools.mjs';
import { getDiningOutOptions } from '../server/dining-out.mjs';
import { workoutSafetyIssues, exerciseAlternatives } from '../server/workouts.mjs';
import { assertDietDay, medicalContraindicatedKeys, isDietUnsafeForProfile } from '../diet-patterns.mjs';
import { expandedKeys } from '../planner-exclusions.mjs';
import { CLINICAL_CONSTANTS } from '../clinical-constants.mjs';
import { dateOffset, minSafeEnergyFloor, isPregnantStatus } from '../coaching-shared.mjs';

const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|Smart|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;
const ARABIC_RE = /[\u0600-\u06FF]/;

const REGIONS = ['egypt', 'gulf', 'levant', 'maghreb'];
const DIETS = ['balanced', 'mediterranean', 'dash', 'high_protein', 'low_carb', 'keto', 'vegetarian', 'vegan', 'intermittent_fasting'];
const IF_PRESETS = ['12_12', '14_10', '16_8', '18_6'];
const CONDITIONS = ['diabetes_t1', 'diabetes_t2', 'insulin_resistance', 'pcos', 'hypertension', 'cholesterol', 'kidney', 'gout', 'hypothyroid', 'celiac', 'favism', 'lactose_intolerance', 'ibs'];
const EXCLUSIONS_15 = ['dairy', 'gluten', 'nuts', 'peanuts', 'eggs', 'fish', 'shellfish', 'soy', 'sesame', 'legumes', 'red_meat', 'poultry', 'oats', 'citrus', 'tree_nuts'];
const INJURIES = ['knee', 'lower_back', 'shoulder', 'wrist', 'ankle', 'neck', 'hip', 'diastasis_recti'];
const GOALS = ['lose', 'maintain', 'gain', 'muscle_gain'];
const TRACKS = ['nutrition_and_workouts', 'nutrition_only', 'workouts_only'];
const BUDGETS = ['low', 'medium', 'high'];
const MATERNALS = ['none', 'pregnant_t1', 'pregnant_t2', 'pregnant_t3', 'breastfeeding'];
const LOCATIONS = [
  { workoutLocation: 'gym_only', homeEquipment: ['none'] },
  { workoutLocation: 'home_only', homeEquipment: ['none'] },
  { workoutLocation: 'home_only', homeEquipment: ['dumbbells'] },
  { workoutLocation: 'home_only', homeEquipment: ['dumbbells', 'resistance_bands', 'bench'] }
];
const TIMEZONES = { egypt: 'Africa/Cairo', gulf: 'Asia/Riyadh', levant: 'Asia/Amman', maghreb: 'Africa/Casablanca' };

// Deterministic LCG PRNG so Layer 1 runs reproducibly
function makeRng(seed = 20261127) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const KNOWN_COVERAGE_LIMIT_CODES = new Set([
  'PLAN_CONSTRAINTS_UNMET',
  'LIBRARY_INSUFFICIENT_FOR_DIET_GOALS',
  'NO_CANDIDATE_WITHIN_DIET_LIMITS',
  'NO_ELIGIBLE_MEAL_FOR_SLOT',
  'NUTRIENT_TARGETS_UNMET',
  'DASH_SODIUM_LIMIT_EXCEEDED',
  'KIDNEY_SODIUM_LIMIT_EXCEEDED',
  'CHOLESTEROL_SATURATED_FAT_EXCEEDED',
  'CARB_LIMIT_EXCEEDED',
  'HIGH_PROTEIN_TARGET_UNMET',
  'WORKOUT_INFEASIBLE'
]);

function checkNoForbiddenApiStrings(label, value, failures) {
  if (value == null) return;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (FORBIDDEN_VOICE_RE.test(s)) {
    failures.push({ invariant: 'FORBIDDEN_VOICE', detail: `${label}: forbidden AI/Smart/Engine wording found` });
  }
}

function checkNoArabic(label, value, failures) {
  if (value == null) return;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (ARABIC_RE.test(s)) {
    failures.push({ invariant: 'ARABIC_IN_API_CONTRACT', detail: `${label}: Arabic characters leaked into English contract` });
  }
}

function inspectMealsAndExclusions(snapshots, state, contextLabel, failures) {
  const blockedKeys = new Set([
    ...expandedKeys(state.preferences || {}),
    ...medicalContraindicatedKeys(state.profile || {})
  ]);
  const isPregnant = isPregnantStatus(state.profile?.maternalStatus);
  const excl = new Set((state.preferences?.excludedGroups || []).map(x => String(x).toLowerCase()));
  const diseases = new Set(state.profile?.diseases || []);

  for (const snap of snapshots) {
    if (!snap) continue;
    for (const ing of snap.ingredients || []) {
      const k = ing.key;
      if (blockedKeys.has(k)) {
        failures.push({
          invariant: 'EXCLUDED_OR_CONTRAINDICATED_FOOD',
          detail: `${contextLabel}: ingredient "${k}" violates exclusions/medical profile (${[...excl].join(',')}; ${[...diseases].join(',')})`
        });
      }
      if (isPregnant && k === 'liver') {
        failures.push({ invariant: 'PREGNANCY_LIVER_LEAK', detail: `${contextLabel}: liver present during pregnancy` });
      }
      if (excl.has('oats') && k === 'oats') {
        failures.push({ invariant: 'OATS_EXCLUSION_LEAK', detail: `${contextLabel}: oats leaked despite exclusion` });
      }
      if (state.preferences?.diet === 'keto' && k === 'sunfloweroil' && Number(ing.grams || 0) > 25) {
        failures.push({ invariant: 'KETO_EXCESS_RAW_OIL', detail: `${contextLabel}: raw sunfloweroil ${ing.grams}g` });
      }
    }
  }
}

function assertPlanInvariants(s, failures, checkSwaps = true) {
  const plan = s.plans?.find(p => p.id === s.active_plan_id) || null;
  const profile = s.profile;
  const floor = minSafeEnergyFloor(profile);
  const weight = Number(profile.weight);
  const diseases = new Set(profile.diseases || []);
  const isKidney = diseases.has('kidney');
  const hasGout = diseases.has('gout');
  const isPregnant = isPregnantStatus(profile.maternalStatus);

  // Water target bounds
  const startDate = plan?.start_date || '2026-10-24';
  const wTarget = dailyWaterTarget(s, startDate);
  const maxWaterL = isKidney ? 2.5 : profile.seniorMode ? 3.5 : 5.0;
  if (wTarget.liters < 2.0 || wTarget.liters > maxWaterL + 1e-6) {
    failures.push({ invariant: 'WATER_BOUNDS', detail: `Water ${wTarget.liters}L outside [2.0, ${maxWaterL}]` });
  }
  if (wTarget.boostMl > (isKidney ? 250 : 1200)) {
    failures.push({ invariant: 'WATER_EXERCISE_CAP', detail: `Exercise boost ${wTarget.boostMl}ml exceeded cap` });
  }

  if (plan) {
    let weeklyTunaServings = 0;
    for (const day of plan.days || []) {
      const dt = day.targets || plan.targets;
      if (Number(dt.energy) < floor - 1e-6 || Number(dt.energy) > CLINICAL_CONSTANTS.MAX_ENERGY_CEILING + 1e-6) {
        failures.push({ invariant: 'CALORIE_BOUNDS', detail: `${day.date} target ${dt.energy} outside [${floor}, ${CLINICAL_CONSTANTS.MAX_ENERGY_CEILING}]` });
      }
      if (isKidney && Number(dt.protein) > weight * CLINICAL_CONSTANTS.PROTEIN_CAP_KIDNEY + 1.5) {
        failures.push({ invariant: 'KIDNEY_PROTEIN_CAP', detail: `Kidney protein target ${dt.protein}g > ${weight * CLINICAL_CONSTANTS.PROTEIN_CAP_KIDNEY}g` });
      }
      if (hasGout && Number(dt.protein) > weight * CLINICAL_CONSTANTS.PROTEIN_CAP_GOUT + 1.5) {
        failures.push({ invariant: 'GOUT_PROTEIN_CAP', detail: `Gout protein target ${dt.protein}g > ${weight * CLINICAL_CONSTANTS.PROTEIN_CAP_GOUT}g` });
      }
      if (profile.seniorMode && !isKidney && !hasGout) {
        const bmi = profile.height ? weight / ((Number(profile.height) / 100) ** 2) : 24;
        const effWeight = bmi > 30 ? (24 * ((Number(profile.height) / 100) ** 2) + 0.35 * (weight - 24 * ((Number(profile.height) / 100) ** 2))) : weight;
        if (Number(dt.protein) < effWeight * 1.15) {
          failures.push({ invariant: 'SENIOR_PROTEIN_FLOOR', detail: `Senior protein ${dt.protein}g < 1.2 g/kg ABW baseline (${Math.round(effWeight * 1.15)}g)` });
        }
      }
      try {
        assertDietDay(day.meals.map(m => m.snapshot), s.preferences.diet, dt, profile);
      } catch (e) {
        failures.push({ invariant: 'ASSERT_DIET_DAY', detail: `${day.date}: ${e.code} ${e.message}` });
      }
      inspectMealsAndExclusions(day.meals.map(m => m.snapshot), s, `plan:${day.date}`, failures);
      if (isPregnant) {
        const tunaCount = day.meals.filter(m => (m.snapshot.ingredients || []).some(i => i.key === 'tuna')).length;
        weeklyTunaServings += tunaCount;
      }
    }
    if (isPregnant && weeklyTunaServings > CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_WEEKLY_SERVINGS) {
      failures.push({ invariant: 'PREGNANCY_TUNA_CAP', detail: `Weekly tuna servings ${weeklyTunaServings} > ${CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_WEEKLY_SERVINGS}` });
    }

    // Exercise replace_meal + mealAlternatives + pantry + dining-out on Day 0
    const m0 = plan.days[0]?.meals?.[0];
    if (checkSwaps && m0) {
      const alts = mealAlternatives(s, m0.id, 6);
      inspectMealsAndExclusions(alts.map(a => a.snapshot), s, 'mealAlternatives', failures);
      if (alts[0]) {
        const cloned = structuredClone(s);
        replaceMeal(cloned, { mealId: m0.id, alternativeId: alts[0].snapshot.template_id });
        const updDay = cloned.plans.find(p => p.id === cloned.active_plan_id).days[0];
        inspectMealsAndExclusions(updDay.meals.map(m => m.snapshot), cloned, 'afterReplaceMeal', failures);
      }
      try {
        const pantry = getPantryAlternatives(s, { mealId: m0.id, selectedIngredients: ['eggs', 'chicken', 'cottage', 'rice', 'tomato', 'cucumber', 'lentils', 'tuna', 'beef', 'oats', 'olive', 'tahini'], limit: 6 });
        inspectMealsAndExclusions((pantry.items || []).map(i => i.snapshot), s, 'pantryAlternatives', failures);
      } catch (pe) {
        if (!KNOWN_COVERAGE_LIMIT_CODES.has(pe.code)) failures.push({ invariant: 'PANTRY_ERROR', detail: pe.message });
      }
    }

    for (const cat of ['grill', 'cafe', 'seafood']) {
      const dining = getDiningOutOptions(s, { date: startDate, category: cat, isPro: true, enforcePro: false });
      checkNoForbiddenApiStrings(`dining:${cat}`, dining.options.map(o => o.orderingTipsEn), failures);
      checkNoArabic(`diningTips:${cat}`, dining.options.map(o => o.orderingTipsEn), failures);
      for (const opt of dining.options) {
        const nameLower = `${opt.nameEn || ''} ${opt.nameAr || ''}`.toLowerCase();
        const excl = new Set((s.preferences?.excludedGroups || []).map(x => x.toLowerCase()));
        if ((diseases.has('celiac') || excl.has('gluten')) && /(bread|pita|pizza|sandwich|shawarma.*wrap|fattoush|عجينة|عيش|خبز|بيتزا)/.test(nameLower)) {
          failures.push({ invariant: 'DINING_CELIAC_LEAK', detail: `${opt.id}: ${opt.nameEn}` });
        }
        if ((diseases.has('favism') || excl.has('fava')) && /\b(fava|ful|foul|falafel|taameya)\b|فول|طعمية|فلافل/.test(nameLower)) {
          failures.push({ invariant: 'DINING_FAVISM_LEAK', detail: `${opt.id}: ${opt.nameEn}` });
        }
        if ((diseases.has('lactose_intolerance') || excl.has('dairy')) && /\b(yogurt|cheese|milk|mozzarella|halloumi|labneh)\b|جبن|جبنة|زبادي|حليب|لبن/.test(nameLower)) {
          failures.push({ invariant: 'DINING_DAIRY_LEAK', detail: `${opt.id}: ${opt.nameEn}` });
        }
        if (diseases.has('gout') && /\b(salmon|shrimp|tuna|liver)\b/i.test(nameLower)) {
          failures.push({ invariant: 'DINING_GOUT_LEAK', detail: `${opt.id}: ${opt.nameEn}` });
        }
      }
    }
  }

  // Workout invariants
  if (s.workoutPlan) {
    const wpIssues = workoutSafetyIssues(s);
    if (wpIssues.length > 0) {
      failures.push({ invariant: 'WORKOUT_SAFETY_ISSUES', detail: JSON.stringify(wpIssues) });
    }
    for (const d of s.workoutPlan.days || []) {
      const ids = (d.exercises || []).map(e => e.id);
      if (new Set(ids).size !== ids.length) {
        failures.push({ invariant: 'DUPLICATE_EXERCISES', detail: `Day ${d.dayIndex} has duplicate exercises` });
      }
      if (d.exercises?.[0]) {
        const exAlts = exerciseAlternatives(s, d.dayIndex, d.exercises[0].id);
        for (const alt of exAlts) {
          if (ids.includes(alt.id)) {
            failures.push({ invariant: 'ALTERNATIVE_DUPLICATE', detail: `Alternative ${alt.id} already in day` });
          }
        }
      }
    }
  }

  checkNoForbiddenApiStrings('highlights', s.lastSpecialistHighlights, failures);
  checkNoArabic('highlights', s.lastSpecialistHighlights, failures);
  checkNoForbiddenApiStrings('calibration', s.lastCalibrationMetadata, failures);
  checkNoArabic('calibration', s.lastCalibrationMetadata, failures);
}

// Build 505 diverse valid profiles
const rng = makeRng(20261127);
const validProfiles = [];

// Guaranteed targeted matrix sweeps first (covering every factor systematically)
for (const region of REGIONS) {
  for (const dietType of DIETS) {
    const ifPreset = dietType === 'intermittent_fasting' ? pick(rng, IF_PRESETS) : undefined;
    const sex = pick(rng, ['male', 'female']);
    const goal = (dietType === 'keto' || dietType === 'intermittent_fasting') ? pick(rng, ['lose', 'maintain']) : pick(rng, GOALS);
    validProfiles.push({
      tag: `region-diet:${region}:${dietType}`,
      draft: {
        name: 'Test Matrix',
        age: 28,
        weight: goal === 'gain' ? 68 : 82,
        height: sex === 'male' ? 176 : 164,
        sex,
        goal,
        targetWeight: goal === 'lose' ? (sex === 'male' ? 74 : 72) : goal === 'gain' ? 76 : null,
        dietType,
        ...(ifPreset ? { ifPreset } : {}),
        region,
        budget: pick(rng, BUDGETS),
        serviceTrack: 'nutrition_and_workouts',
        selectedWorkoutDays: [1, 3, 5],
        healthConfirmed: true,
        timezone: TIMEZONES[region],
        batchPrepMode: rng() < 0.35
      }
    });
  }
}

// Every single clinical condition (13) across regions & tracks
for (const cond of CONDITIONS) {
  for (const region of ['egypt', 'gulf']) {
    const sex = cond === 'pcos' ? 'female' : pick(rng, ['male', 'female']);
    const dietType = cond === 'kidney' ? 'balanced' : (['diabetes_t1', 'diabetes_t2', 'gout', 'cholesterol'].includes(cond) ? 'balanced' : pick(rng, ['balanced', 'mediterranean', 'low_carb']));
    validProfiles.push({
      tag: `cond:${cond}:${region}`,
      draft: {
        name: 'Clinical User',
        age: 38,
        weight: 84,
        height: sex === 'male' ? 175 : 163,
        sex,
        goal: 'lose',
        targetWeight: 74,
        dietType,
        region,
        diseases: [cond],
        serviceTrack: pick(rng, ['nutrition_and_workouts', 'nutrition_only']),
        selectedWorkoutDays: [0, 2, 4],
        healthConfirmed: true,
        timezone: TIMEZONES[region]
      }
    });
  }
}

// Every exclusion / allergy across canonical & allergies field
for (const excl of EXCLUSIONS_15) {
  const useAllergiesField = rng() < 0.5;
  validProfiles.push({
    tag: `excl:${excl}`,
    draft: {
      name: 'Allergy User',
      age: 32,
      weight: 78,
      height: 172,
      sex: pick(rng, ['male', 'female']),
      goal: 'lose',
      targetWeight: 70,
      dietType: 'balanced',
      region: pick(rng, REGIONS),
      ...(useAllergiesField ? { allergies: [excl] } : { excludedGroups: [excl] }),
      serviceTrack: 'nutrition_and_workouts',
      selectedWorkoutDays: [1, 3, 5],
      healthConfirmed: true
    }
  });
}

// Maternal states & Seniors 70..82 & All 8 Injuries
for (const mat of MATERNALS.filter(m => m !== 'none')) {
  for (const dietType of ['balanced', 'mediterranean']) {
    validProfiles.push({
      tag: `maternal:${mat}:${dietType}`,
      draft: {
        name: 'Maternal User',
        age: 29,
        weight: 68,
        height: 164,
        sex: 'female',
        goal: mat === 'breastfeeding' ? pick(rng, ['maintain', 'lose']) : 'maintain',
        targetWeight: null,
        maternalStatus: mat,
        dietType,
        region: pick(rng, REGIONS),
        serviceTrack: pick(rng, ['nutrition_and_workouts', 'nutrition_only']),
        selectedWorkoutDays: [0, 2, 4],
        ...(mat === 'breastfeeding' ? { injuries: ['diastasis_recti'] } : {}),
        healthConfirmed: true
      }
    });
  }
}

for (const age of [70, 72, 76, 82]) {
  for (const track of TRACKS) {
    validProfiles.push({
      tag: `senior:${age}:${track}`,
      draft: {
        name: 'Senior User',
        age,
        weight: 76,
        height: 170,
        sex: pick(rng, ['male', 'female']),
        goal: pick(rng, ['maintain', 'lose']),
        targetWeight: null,
        dietType: 'balanced',
        region: pick(rng, REGIONS),
        serviceTrack: track,
        selectedWorkoutDays: [0, 2, 4],
        injuries: [pick(rng, ['knee', 'lower_back', 'shoulder'])],
        healthConfirmed: true
      }
    });
  }
}

for (const inj of INJURIES) {
  for (const loc of LOCATIONS) {
    validProfiles.push({
      tag: `injury:${inj}:${loc.workoutLocation}`,
      draft: {
        name: 'Injury User',
        age: 35,
        weight: 80,
        height: 174,
        sex: inj === 'diastasis_recti' ? 'female' : pick(rng, ['male', 'female']),
        goal: 'maintain',
        dietType: 'balanced',
        serviceTrack: 'nutrition_and_workouts',
        selectedWorkoutDays: [1, 3, 5],
        injuries: [inj],
        ...loc,
        healthConfirmed: true
      }
    });
  }
}

// Fill up to 510 random randomized valid profiles combining multi-factors
while (validProfiles.length < 510) {
  const region = pick(rng, REGIONS);
  const track = pick(rng, TRACKS);
  const sex = pick(rng, ['male', 'female']);
  const age = Math.floor(18 + rng() * 64); // 18..81
  const senior = age >= 70;
  const height = sex === 'male' ? Math.floor(165 + rng() * 25) : Math.floor(153 + rng() * 22);
  const bmi = 18.8 + rng() * 22; // 18.8..40.8
  const weight = Math.round(bmi * ((height / 100) ** 2));
  const goal = pick(rng, GOALS);
  const targetWeight = goal === 'lose'
    ? Math.max(Math.ceil(18.6 * ((height / 100) ** 2)), weight - Math.floor(4 + rng() * 10))
    : (goal === 'gain' || goal === 'muscle_gain')
      ? weight + Math.floor(3 + rng() * 8)
      : null;
  if (goal === 'lose' && targetWeight >= weight) continue;
  let dietType = pick(rng, DIETS);
  const cond = rng() < 0.45 ? pick(rng, CONDITIONS.filter(c => sex === 'female' || c !== 'pcos')) : null;
  const diseases = cond ? [cond] : [];
  if (isDietUnsafeForProfile(dietType, { diseases, maternalStatus: 'none', goal })) dietType = 'balanced';
  if (dietType === 'keto' && diseases.some(d => ['ibs', 'lactose_intolerance', 'celiac', 'favism'].includes(d))) dietType = 'low_carb';
  const injPool = INJURIES.filter(j => sex === 'female' || j !== 'diastasis_recti');
  const injuries = rng() < 0.4 ? [pick(rng, injPool)] : [];
  const loc = pick(rng, LOCATIONS);
  const dayCount = pick(rng, [2, 3, 4, 5, 6]);
  const selectedWorkoutDays = Array.from({ length: dayCount }, (_, i) => Math.floor(i * 7 / dayCount));
  const ifPreset = dietType === 'intermittent_fasting' ? pick(rng, IF_PRESETS) : undefined;
  const budget = pick(rng, BUDGETS);
  const safeExclPool = (dietType === 'vegan' || dietType === 'vegetarian')
    ? ['oats', 'citrus', 'sesame']
    : ['shellfish', 'oats', 'citrus', 'sesame', 'nuts', 'fava'];
  const excludedGroups = rng() < 0.35 ? [pick(rng, safeExclPool)] : [];
  if (diseases.includes('kidney') && dietType === 'high_protein') dietType = 'balanced';

  validProfiles.push({
    tag: `rand:${validProfiles.length}:${region}:${dietType}:${track}`,
    draft: {
      name: 'Sim Member',
      age,
      weight,
      height,
      sex,
      goal,
      ...(targetWeight ? { targetWeight } : {}),
      dietType,
      ...(ifPreset ? { ifPreset } : {}),
      region,
      budget,
      serviceTrack: track,
      diseases,
      excludedGroups,
      injuries,
      selectedWorkoutDays,
      fitnessLevel: senior ? 'beginner' : pick(rng, ['beginner', 'intermediate', 'advanced']),
      sessionDuration: pick(rng, [20, 30, 45, 60, 90]),
      ...loc,
      carbCycling: !['keto', 'low_carb'].includes(dietType) && dayCount < 7 && rng() < 0.25,
      batchPrepMode: rng() < 0.25,
      healthConfirmed: true,
      timezone: TIMEZONES[region]
    }
  });
}

// 65 impossible / adversarial fuzz cases
const impossibleCases = [
  { tag: 'T1_AND_T2', expectCode: 'CONFLICTING_CONDITIONS', draft: { age: 30, weight: 80, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_and_workouts', diseases: ['diabetes_t1', 'diabetes_t2'], selectedWorkoutDays: [1, 3, 5], healthConfirmed: true } },
  { tag: 'THREE_MAJOR_CONDITIONS', expectCode: 'MULTI_CONDITION_CLINICAL_REVIEW', draft: { age: 72, weight: 78, height: 170, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_and_workouts', diseases: ['kidney', 'gout', 'hypertension'], selectedWorkoutDays: [1, 3, 5], healthConfirmed: true } },
  { tag: 'PREGNANT_WITH_KIDNEY', expectCode: 'MULTI_CONDITION_CLINICAL_REVIEW', draft: { age: 29, weight: 65, height: 164, sex: 'female', goal: 'maintain', maternalStatus: 'pregnant_t2', serviceTrack: 'nutrition_and_workouts', diseases: ['kidney'], selectedWorkoutDays: [1, 3, 5], healthConfirmed: true } },
  { tag: 'FOUR_INJURIES', expectCode: 'MULTI_INJURY_REQUIRES_REVIEW', draft: { age: 35, weight: 80, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_and_workouts', injuries: ['knee', 'lower_back', 'shoulder', 'wrist'], selectedWorkoutDays: [1, 3, 5], healthConfirmed: true } },
  { tag: 'PARQ_RED_FLAG', expectCode: 'PARQ_CLEARANCE_REQUIRED', draft: { age: 40, weight: 85, height: 175, sex: 'male', goal: 'lose', targetWeight: 75, serviceTrack: 'nutrition_and_workouts', parqRedFlag: true, selectedWorkoutDays: [1, 3, 5] } },
  { tag: 'UNDERWEIGHT_LOSE', expectCode: 'WEIGHT_LOSS_UNDERWEIGHT_UNSAFE', draft: { age: 24, weight: 46, height: 170, sex: 'female', goal: 'lose', targetWeight: 44, serviceTrack: 'nutrition_only' } },
  { tag: 'PREGNANT_LOSE', expectCode: 'MATERNAL_CALORIE_CUT_BLOCKED', draft: { age: 28, weight: 68, height: 164, sex: 'female', goal: 'lose', targetWeight: 62, maternalStatus: 'pregnant_t1', serviceTrack: 'nutrition_only' } },
  { tag: 'PREGNANT_KETO', expectCode: 'MEDICAL_DIET_CONFLICT', draft: { age: 28, weight: 68, height: 164, sex: 'female', goal: 'maintain', maternalStatus: 'pregnant_t2', dietType: 'keto', serviceTrack: 'nutrition_only' } },
  { tag: 'PREGNANT_IF', expectCode: 'MEDICAL_DIET_CONFLICT', draft: { age: 28, weight: 68, height: 164, sex: 'female', goal: 'maintain', maternalStatus: 'pregnant_t3', dietType: 'intermittent_fasting', serviceTrack: 'nutrition_only' } },
  { tag: 'KIDNEY_HIGH_PROTEIN', expectCode: 'MEDICAL_DIET_CONFLICT', draft: { age: 45, weight: 80, height: 174, sex: 'male', goal: 'maintain', diseases: ['kidney'], dietType: 'high_protein', serviceTrack: 'nutrition_only' } },
  { tag: 'DIABETES_T1_KETO', expectCode: 'MEDICAL_DIET_CONFLICT', draft: { age: 27, weight: 75, height: 176, sex: 'male', goal: 'maintain', diseases: ['diabetes_t1'], dietType: 'keto', serviceTrack: 'nutrition_only' } },
  { tag: 'NO_PROTEIN_PILLARS', expectCode: 'PLAN_CONSTRAINTS_UNMET', draft: { age: 30, weight: 75, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_only', excludedGroups: ['poultry', 'red_meat', 'fish', 'eggs', 'dairy', 'legumes', 'soy', 'nuts'] } },
  { tag: 'MALE_MATERNAL', expectCode: 'INVALID_MATERNAL_PROFILE', draft: { age: 30, weight: 78, height: 175, sex: 'male', goal: 'maintain', maternalStatus: 'pregnant_t1', serviceTrack: 'nutrition_only' } },
  { tag: 'UNDERAGE_16', expectCode: 'NUMBER_OUT_OF_RANGE', draft: { age: 16, weight: 65, height: 170, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_only' } },
  { tag: 'AGE_105', expectCode: 'NUMBER_OUT_OF_RANGE', draft: { age: 105, weight: 70, height: 170, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_only' } },
  { tag: 'INVALID_IF_PRESET', expectCode: 'FASTING_WINDOW_INVALID', draft: { age: 28, weight: 75, height: 175, sex: 'male', goal: 'maintain', dietType: 'intermittent_fasting', ifPreset: '23_1', serviceTrack: 'nutrition_only' } }
];

// Add 49 fuzz variants probing NaN, huge weights, negative heights, invalid regions, unknown exclusions, bad weekdays, prototype keys
const fuzzMutations = [
  ['NAN_WEIGHT', { weight: Number.NaN }],
  ['INF_HEIGHT', { height: Number.POSITIVE_INFINITY }],
  ['NEGATIVE_WEIGHT', { weight: -60 }],
  ['EXTREME_BMI_HIGH', { weight: 250, height: 120 }],
  ['EXTREME_BMI_LOW', { weight: 35, height: 225 }],
  ['UNKNOWN_DIET', { dietType: 'carnivore_only' }],
  ['UNKNOWN_REGION', { region: 'antarctica' }],
  ['UNKNOWN_GOAL', { goal: 'bulk_200' }],
  ['UNKNOWN_SEX', { sex: 'other' }],
  ['UNKNOWN_TRACK', { serviceTrack: 'magic_track' }],
  ['UNKNOWN_DISEASE', { diseases: ['unknown_syndrome'] }],
  ['UNKNOWN_EXCLUSION', { excludedGroups: ['moon_rocks'] }],
  ['BAD_TIMEZONE', { timezone: 'Mars/Olympus' }],
  ['BAD_LOCALE', { locale: 'xx-YY' }],
  ['ZERO_MEALS', { mealsCount: 0 }],
  ['TEN_MEALS', { mealsCount: 10 }],
  ['LOSE_HIGHER_TARGET', { goal: 'lose', weight: 80, targetWeight: 85 }],
  ['GAIN_LOWER_TARGET', { goal: 'gain', weight: 80, targetWeight: 75 }],
  ['BAD_WEEKDAY', { selectedWorkoutDays: [9] }],
  ['EIGHT_DAYS', { selectedWorkoutDays: [0, 1, 2, 3, 4, 5, 6, 0] }]
];
for (let i = 0; i < 49; i++) {
  const [name, patch] = fuzzMutations[i % fuzzMutations.length];
  impossibleCases.push({
    tag: `FUZZ_${i}_${name}`,
    expectCode: null,
    draft: {
      name: 'Fuzz User',
      age: 30,
      weight: 80,
      height: 175,
      sex: 'male',
      goal: 'maintain',
      serviceTrack: 'nutrition_and_workouts',
      selectedWorkoutDays: [1, 3, 5],
      healthConfirmed: true,
      ...patch
    }
  });
}

const t0 = performance.now();
const summary = {
  totalValidCases: validProfiles.length,
  totalImpossibleCases: impossibleCases.length,
  totalCases: validProfiles.length + impossibleCases.length,
  validSucceeded: 0,
  validExpectedCoverageRejects: 0,
  validInvariantFailures: [],
  impossibleProperlyRejected: 0,
  impossibleFailures: []
};

const baseNowMs = Date.parse('2026-10-24T12:00:00Z');

await withClock(baseNowMs, async () => {
  // Run valid profiles
  for (let idx = 0; idx < validProfiles.length; idx++) {
    const tc = validProfiles[idx];
    const failures = [];
    try {
      const elig = evaluateEligibility(tc.draft);
      checkNoForbiddenApiStrings(`${tc.tag}:elig`, elig.eligibilityReasons, failures);
      checkNoArabic(`${tc.tag}:elig`, elig.eligibilityReasons, failures);
      checkNoArabic(`${tc.tag}:eligCodes`, elig.eligibilityReasonCodes, failures);

      const preview = previewPlan(tc.draft);
      checkNoForbiddenApiStrings(`${tc.tag}:preview`, preview.warnings, failures);
      checkNoArabic(`${tc.tag}:previewCodes`, preview.warningCodes, failures);

      const s = generate(empty(), tc.draft, `sim1-${idx}`);
      assertPlanInvariants(s, failures, true);

      // Renew plan +8 days ahead (check every 3rd case to keep 575 cases super fast while covering full diversity)
      if (s.active_plan_id && idx % 3 === 0) {
        await withClock(baseNowMs + 8 * 86400000, async () => {
          const renewed = command(structuredClone(s), 'renew_plan', {});
          assertPlanInvariants(renewed, failures, false);
        });
      }

      if (failures.length) {
        summary.validInvariantFailures.push({ tag: tc.tag, failures });
      } else {
        summary.validSucceeded++;
      }
    } catch (err) {
      if (err?.code && KNOWN_COVERAGE_LIMIT_CODES.has(err.code) && err.status >= 400 && err.status < 500) {
        checkNoArabic(`${tc.tag}:errMsg`, err.message, failures);
        checkNoForbiddenApiStrings(`${tc.tag}:errMsg`, err.message, failures);
        if (failures.length) summary.validInvariantFailures.push({ tag: tc.tag, failures });
        else summary.validExpectedCoverageRejects++;
      } else {
        summary.validInvariantFailures.push({
          tag: tc.tag,
          failures: [{ invariant: 'UNEXPECTED_ERROR', detail: `${err?.code || err?.name}: ${err?.message}` }]
        });
      }
    }
  }

  // Run impossible & fuzz cases
  for (const ic of impossibleCases) {
    try {
      const res = generate(empty(), ic.draft, `fuzz-${ic.tag}`);
      // Certain malformed keys or extreme combos shouldn't crash; ensure explicit rejection for strict ones
      if (ic.expectCode) {
        summary.impossibleFailures.push({ tag: ic.tag, reason: `Expected rejection ${ic.expectCode}, but succeeded` });
      } else if (ic.tag.includes('NAN') || ic.tag.includes('INF') || ic.tag.includes('NEGATIVE') || ic.tag.includes('UNKNOWN') || ic.tag.includes('BAD') || ic.tag.includes('ZERO') || ic.tag.includes('TEN') || ic.tag.includes('EIGHT') || ic.tag.includes('LOSE_HIGHER') || ic.tag.includes('GAIN_LOWER')) {
        summary.impossibleFailures.push({ tag: ic.tag, reason: `Fuzz case should have been rejected cleanly, but succeeded: rev=${res?.revision}` });
      } else {
        summary.impossibleProperlyRejected++;
      }
    } catch (err) {
      if (err instanceof TypeError || err instanceof ReferenceError || (err.status && err.status >= 500)) {
        summary.impossibleFailures.push({ tag: ic.tag, reason: `500/Runtime crash: ${err.name}: ${err.message}` });
      } else if (ARABIC_RE.test(err.message || '') || FORBIDDEN_VOICE_RE.test(err.message || '')) {
        summary.impossibleFailures.push({ tag: ic.tag, reason: `Leak in error message: ${err.message}` });
      } else if (ic.expectCode && err.code !== ic.expectCode) {
        summary.impossibleFailures.push({ tag: ic.tag, reason: `Expected ${ic.expectCode}, got ${err.code}: ${err.message}` });
      } else {
        summary.impossibleProperlyRejected++;
      }
    }
  }
});

summary.durationMs = Math.round(performance.now() - t0);
await mkdir('outputs', { recursive: true });
await writeFile('outputs/layer1_report.json', JSON.stringify(summary, null, 2));

console.log(JSON.stringify({
  totalCases: summary.totalCases,
  validSucceeded: summary.validSucceeded,
  validExpectedCoverageRejects: summary.validExpectedCoverageRejects,
  validInvariantFailureCount: summary.validInvariantFailures.length,
  impossibleProperlyRejected: summary.impossibleProperlyRejected,
  impossibleFailureCount: summary.impossibleFailures.length,
  durationMs: summary.durationMs,
  sampleValidFailures: summary.validInvariantFailures.slice(0, 10),
  sampleImpossibleFailures: summary.impossibleFailures.slice(0, 10)
}, null, 2));

if (summary.validInvariantFailures.length > 0 || summary.impossibleFailures.length > 0) {
  process.exitCode = 1;
}
