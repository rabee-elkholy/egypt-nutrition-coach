import { regionalFoodTemplates } from './regional-foods.mjs';
import { apiError } from './coaching-error.mjs';
import { minSafeEnergyFloor, isPregnantStatus } from './coaching-shared.mjs';
import { CLINICAL_CONSTANTS } from './clinical-constants.mjs';
import {DIETS,FIXED_DIET_MEALS,dietIngredientAllowed,medicalContraindicatedKeys,isDietUnsafeForProfile,dietTemplates,assertDietDay,fastingTimes,normalizeFastingPreset} from './diet-patterns.mjs';
import {sportsEnergy} from './sports.mjs';
import {practicalParts,roundedHouseholdGrams} from './planner-household.mjs';
import { aggregate, referenceTotals, estimateTotals } from "./calculator.mjs";
import { volumeGrams } from "./portions.mjs";
import { EXCLUSIONS, EXCLUSION_CROSS_CONTACT_WARNINGS, expandedKeys } from "./planner-exclusions.mjs";
import { egyptianMenus, regionalMenus } from './egyptian-menu.mjs';
import { EGYPTIAN_POLICY_VERSION, egyptianBreadChoice, egyptianSlotPool,
  egyptianMealFamily, egyptianMealName } from "./egyptian-meals.mjs";
export const ENGINE_VERSION = "weekly-planner-0.11.0";
export const REGIONS = {
  egypt: "مصر",
  levant: "بلاد الشام",
  gulf: "الخليج",
  maghreb: "المغرب العربي",
  any: "كل المناطق",
};
export const GOALS = {
  lose: "تقليل الوزن تدريجيًا",
  maintain: "الحفاظ على الوزن",
  gain: "زيادة الوزن تدريجيًا",
  muscle_gain: "زيادة الكتلة العضلية",
};
export function regionAllows(entity, region = "egypt") {
  return region === "any" || (entity.regions || []).includes(region);
}
export const ACTIVITY = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};
export const METRICS = [
  "energy",
  "protein",
  "fat",
  "carbs",
  "fiber",
  "saturated",
  "sodium",
  "sugars",
];

// Fallback micronutrient estimates per 100g ONLY for estimated_values display & DASH/fiber checks
// when a regional reference (like Egyptian Baladi bread or AUB Lebanon dishes) lacks a measured value.
const FALLBACK_MICROS = {
  bread: { fiber: "4.2", saturated: "0.3", sodium: "380", sugars: "1.5" },
  shawarma_chicken: { fiber: "0.5", saturated: "2.1", sodium: "420", sugars: "0.5" },
  shawarma_beef: { fiber: "0.5", saturated: "4.2", sodium: "440", sugars: "0.5" },
  tabbouleh: { fiber: "2.4", saturated: "0.3", sodium: "180", sugars: "1.2" },
  fattoush: { fiber: "2.1", saturated: "0.3", sodium: "210", sugars: "1.4" },
  babaghanouj: { fiber: "2.5", saturated: "0.4", sodium: "190", sugars: "1.5" },
};

const finite = (x, min, max, field) => {
  if (
    (typeof x !== "number" && typeof x !== "string") ||
    String(x).trim() === "" ||
    !Number.isFinite(Number(x)) ||
    Number(x) < min ||
    Number(x) > max
  ) {
    const message = `${field} must be between ${min} and ${max}.`;
    throw apiError('NUMBER_OUT_OF_RANGE', message, {
      status: 400,
      params: { field, min, max },
      fieldErrors: [{ field, code: 'NUMBER_OUT_OF_RANGE', message }],
    });
  }
  return Number(x);
};
const round = (x, p = 1) => Math.round(x * 10 ** p) / 10 ** p;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const copy = (x) => JSON.parse(JSON.stringify(x));
// Same rational calculator as the reference engine; zeros are valid nutrients.
const product = (v, q) =>
  referenceTotals([{ scale: String(q), values: { v: String(v) } }], ["v"])
    .nutrients.v.total;

export function estimateNeeds(input) {
  const maxAge = input.allowSenior === false ? 70 : 95;
  const weight = finite(input.weight, 35, 250, "weight"),
    height = finite(input.height, 120, 230, "height"),
    age = finite(input.age, 18, maxAge, "age");
  if (!Number.isInteger(age))
    throw apiError('INVALID_AGE', 'age must be a whole number of years between 18 and 95.', {
      status: 400,
      fieldErrors: [{ field: 'age', code: 'INVALID_AGE', message: 'age must be a whole integer.' }],
    });
  if (
    !["male", "female"].includes(input.sex) ||
    !Object.hasOwn(ACTIVITY, input.activity) ||
    !Object.hasOwn(GOALS, input.goal)
  )
    throw apiError('INVALID_PROFILE_METRICS', 'Invalid sex, activity level, or goal selection.', { status: 400 });
  if (input.healthNeeds && !input.maternalStatus && (!Array.isArray(input.diseases) || !input.diseases.length))
    throw apiError(
      'CLINICAL_REVIEW_REQUIRED',
      'Declared clinical conditions or age require direct specialist review before plan generation.',
      { status: 400 },
    );
  const bmi = weight / (height / 100) ** 2;
  if (bmi < 12.5 || bmi > 65)
    throw apiError(
      'BMI_OUT_OF_RANGE',
      'Calculated BMI is outside the standard CuraFit Specialist Team planning range (12.5..65).',
      { status: 400 },
    );
  const trainingDays = finite(
    input.trainingDays ?? input.resistance ?? 0,
    0,
    7,
    "trainingDays",
  );
  if (!Number.isInteger(trainingDays))
    throw apiError('INVALID_TRAINING_DAYS', 'trainingDays must be an integer between 0 and 7.', {
      status: 400,
      fieldErrors: [{ field: 'trainingDays', code: 'INVALID_TRAINING_DAYS', message: 'trainingDays must be a whole integer.' }],
    });
  if (input.goal === "muscle_gain" && trainingDays === 0 && input.allowZeroExternalTraining !== true)
    throw apiError(
      'MUSCLE_GAIN_REQUIRES_RESISTANCE_DAYS',
      'Muscle gain goal requires at least one weekly resistance training day.',
      { status: 400 },
    );

  const diseases = new Set(Array.isArray(input.diseases) ? input.diseases : []);
  const maternalStatus = input.maternalStatus || "none";
  const seniorMode = age >= 70 || input.seniorMode === true;
  const notes = [];
  const noteCodes = [];
  const addNote = (code, text) => {
    notes.push(text);
    if (code && !noteCodes.includes(code)) noteCodes.push(code);
  };

  let ree =
    10 * weight + 6.25 * height - 5 * age + (input.sex === "male" ? 5 : -161);
  if (diseases.has("hypothyroid")) {
    ree *= 0.95;
    addNote("PLAN_HYPOTHYROID_REE_CALIBRATION", "Applied conservative 5% REE calibration for hypothyroidism; monitor actual weight trend.");
  }

  const baseline = ree * ACTIVITY[input.activity],
    exercise = sportsEnergy(input, weight, baseline),
    tdee = baseline + exercise.daily_extra;

  const rawPace = input.goalPace || 'moderate';
  if(!['slow','moderate','fast'].includes(rawPace))throw apiError('INVALID_GOAL_PACE','goalPace must be one of slow, moderate, or fast.',{status:400});
  const pace = (maternalStatus === 'breastfeeding' && input.goal === 'lose') ? 'slow' : rawPace;
  let change = 0;
  if(input.goal === 'lose'){
    const maxDeficit = seniorMode ? CLINICAL_CONSTANTS.SENIOR_MAX_DEFICIT_KCAL : CLINICAL_CONSTANTS.STANDARD_MAX_DEFICIT_KCAL;
    change = -Math.min(tdee * {slow:.1, moderate:.15, fast:.2}[pace], maxDeficit);
    if (seniorMode) addNote("PLAN_SENIOR_DEFICIT_CAP", `Senior safety mode (70+): daily calorie deficit capped at -${CLINICAL_CONSTANTS.SENIOR_MAX_DEFICIT_KCAL} kcal.`);
  }
  else if(input.goal === 'muscle_gain'&&(input.recomposition||(input.targetWeight!=null&&Math.abs(Number(input.targetWeight)-weight)<0.5))){change=0;addNote("PLAN_RECOMPOSITION_MAINTENANCE", 'Body recomposition starts at maintenance calories with progressive resistance training.');}
  else if(input.goal === 'muscle_gain')change=Math.min(tdee*{slow:.05,moderate:.08,fast:.1}[pace],250);
  else if(input.goal === 'gain')change=Math.min(tdee*{slow:.08,moderate:.12,fast:.15}[pace],400);
  addNote("PLAN_ADAPTIVE_GOAL_PACE", 'Goal pace sets a bounded initial offset; actual energy needs are calibrated from recorded weight trends.');

  // Maternal adjustments (never stack weight-gain surplus on top of trimester energy add-ons)
  if (maternalStatus === "pregnant_t1") {
    change = CLINICAL_CONSTANTS.PREGNANCY_T1_EXTRA_KCAL;
    addNote("PLAN_PREGNANCY_T1_CALIBRATION", "First-trimester pregnancy calibration applied (maintenance baseline, calorie deficits disabled).");
  } else if (maternalStatus === "pregnant_t2" || maternalStatus === "pregnant") {
    change = CLINICAL_CONSTANTS.PREGNANCY_T2_EXTRA_KCAL;
    addNote("PLAN_PREGNANCY_T2_CALIBRATION", `Second-trimester pregnancy calibration applied (+${CLINICAL_CONSTANTS.PREGNANCY_T2_EXTRA_KCAL} kcal/day, deficits and extra gain surplus disabled).`);
  } else if (maternalStatus === "pregnant_t3") {
    change = CLINICAL_CONSTANTS.PREGNANCY_T3_EXTRA_KCAL;
    addNote("PLAN_PREGNANCY_T3_CALIBRATION", `Third-trimester pregnancy calibration applied (+${CLINICAL_CONSTANTS.PREGNANCY_T3_EXTRA_KCAL} kcal/day, deficits and extra gain surplus disabled).`);
  } else if (maternalStatus === "breastfeeding") {
    const boundedOffset = input.goal === "lose" ? Math.max(-CLINICAL_CONSTANTS.BREASTFEEDING_MAX_DEFICIT_KCAL, change) : change;
    change = boundedOffset + CLINICAL_CONSTANTS.BREASTFEEDING_EXTRA_KCAL;
    addNote("PLAN_BREASTFEEDING_CALIBRATION", `Breastfeeding calibration applied (+${CLINICAL_CONSTANTS.BREASTFEEDING_EXTRA_KCAL} kcal baseline, max deficit -${CLINICAL_CONSTANTS.BREASTFEEDING_MAX_DEFICIT_KCAL} kcal/day).`);
  }

  let energy = Math.round((tdee + change) / 10) * 10;
  const minEnergyFloor = minSafeEnergyFloor({ sex: input.sex, maternalStatus });
  if (energy < minEnergyFloor) {
    energy = minEnergyFloor;
    addNote(
      "PLAN_MIN_ENERGY_FLOOR_APPLIED",
      `Daily energy raised to the safe planning floor (${minEnergyFloor} kcal).`,
    );
  }
  if (energy > CLINICAL_CONSTANTS.MAX_ENERGY_CEILING) {
    energy = CLINICAL_CONSTANTS.MAX_ENERGY_CEILING;
    addNote(
      "PLAN_MAX_ENERGY_CEILING_APPLIED",
      `Daily energy capped at the safe planning ceiling (${CLINICAL_CONSTANTS.MAX_ENERGY_CEILING} kcal).`,
    );
  }

  if (bmi < 18.5) {
    addNote("PLAN_UNDERWEIGHT_NUTRIENT_CARE", "BMI is below 18.5 (underweight): focus on nutrient-dense meals and gradual intake progression.");
  } else if (bmi > 30) {
    addNote("PLAN_ABW_PROTEIN_SCALING", "Protein targets use Adjusted Body Weight (ABW) for BMI > 30 to avoid excessive portions.");
  }

  const effectiveWeight =
    bmi > 30
      ? 24 * (height / 100) ** 2 + 0.35 * (weight - 24 * (height / 100) ** 2)
      : weight;

  let factor =
    trainingDays > 0
      ? input.goal === "lose"
        ? CLINICAL_CONSTANTS.PROTEIN_FACTOR_TRAINED_LOSE
        : input.goal === "maintain"
          ? 1.4
          : 1.6
      : input.goal === "lose"
        ? 1.4
        : input.goal === "muscle_gain"
          ? 1.5
          : input.goal === "gain"
            ? 1.3
            : 1;

  if (seniorMode) factor = Math.max(factor, 1.2);
  if (maternalStatus !== "none") factor = Math.max(factor, 1.4);
  if (isPregnantStatus(maternalStatus)) {
    addNote("PLAN_PREGNANCY_FOOD_SAFETY", `Pregnancy nutrition safety active: organ meats (liver) and unsafe calorie cuts are excluded, tuna is capped at <= ${CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_WEEKLY_SERVINGS} servings/week, and pasteurized dairy with thorough cooking is advised.`);
    addNote("PLAN_PREGNANCY_MERCURY_PASTEURIZATION_NOTE", "Limit tuna to at most 2 servings per week for mercury safety, use pasteurized dairy only, and cook meats and eggs thoroughly.");
  }
  if (diseases.has("gout")) {
    factor = Math.min(factor, CLINICAL_CONSTANTS.PROTEIN_CAP_GOUT);
    addNote("PLAN_GOUT_PROTEIN_CAP", `Protein capped at ${CLINICAL_CONSTANTS.PROTEIN_CAP_GOUT} g/kg and high-purine red meats, offal, tuna, and salmon excluded for gout.`);
  }
  if (diseases.has("kidney")) {
    factor = Math.min(factor, CLINICAL_CONSTANTS.PROTEIN_CAP_KIDNEY);
    addNote("PLAN_KIDNEY_PROTEIN_CAP", `Clinician-guided kidney support: protein capped at <= ${CLINICAL_CONSTANTS.PROTEIN_CAP_KIDNEY} g/kg, sodium <= ${CLINICAL_CONSTANTS.CKD_SODIUM_LIMIT_MG} mg/day, and high-potassium/phosphorus foods filtered.`);
  }
  if (diseases.has("ibs")) {
    addNote("PLAN_IBS_EXCLUSIONS_ACTIVE", "Low-FODMAP exclusions active (high-FODMAP legumes, dairy, wheat, high-fructose fruits, cabbage, and alliums excluded for IBS comfort).");
  }
  if (diseases.has("hypertension")) {
    addNote("PLAN_HYPERTENSION_SODIUM_CEILING", `Low-sodium ceiling (<= ${CLINICAL_CONSTANTS.HYPERTENSION_SODIUM_LIMIT_MG} mg/day) and high-sodium cheese exclusions enabled for blood pressure support.`);
  }
  if (diseases.has("cholesterol")) {
    addNote("PLAN_CHOLESTEROL_SAT_FAT_CAP", `Cholesterol safety active: saturated fat capped at <= ${Math.round(CLINICAL_CONSTANTS.CHOLESTEROL_MAX_SAT_FAT_SHARE * 100)}% of daily energy and high-saturated-fat cuts excluded.`);
  }
  if (diseases.has("celiac")) {
    addNote("PLAN_CELIAC_GLUTEN_EXCLUSION", "Gluten-containing grains and breads are excluded for celiac safety.");
    addNote(EXCLUSION_CROSS_CONTACT_WARNINGS.gluten.code, EXCLUSION_CROSS_CONTACT_WARNINGS.gluten.message);
  }
  if (diseases.has("favism")) {
    addNote("PLAN_FAVISM_EXCLUSION", "Fava beans and falafel are excluded for favism (G6PD) safety.");
  }
  if (diseases.has("lactose_intolerance")) {
    addNote("PLAN_LACTOSE_EXCLUSION", "Dairy products are excluded for lactose intolerance comfort.");
  }

  let fatShare = diseases.has("cholesterol") ? CLINICAL_CONSTANTS.CHOLESTEROL_FAT_SHARE : CLINICAL_CONSTANTS.STANDARD_FAT_SHARE;
  const maternalProteinAddon = maternalStatus === "pregnant_t2" || maternalStatus === "pregnant"
    ? CLINICAL_CONSTANTS.PREGNANCY_T2_EXTRA_PROTEIN_G
    : maternalStatus === "pregnant_t3"
      ? CLINICAL_CONSTANTS.PREGNANCY_T3_EXTRA_PROTEIN_G
      : maternalStatus === "breastfeeding"
        ? CLINICAL_CONSTANTS.BREASTFEEDING_EXTRA_PROTEIN_G
        : 0;
  let proteinGrams = round(effectiveWeight * factor + (diseases.has("kidney") ? 0 : maternalProteinAddon));
  let fatGrams = round((energy * fatShare) / 9);
  let carbGrams = round(Math.max(0, energy - proteinGrams * 4 - fatGrams * 9) / 4);

  if (diseases.has("diabetes") || diseases.has("diabetes_t1") || diseases.has("diabetes_t2") || diseases.has("insulin_resistance") || diseases.has("pcos")) {
    const maxCarbShare = diseases.has("cholesterol") ? CLINICAL_CONSTANTS.DIABETES_CHOLESTEROL_MAX_CARB_SHARE : CLINICAL_CONSTANTS.DIABETES_MAX_CARB_SHARE;
    const minCarbGrams = isPregnantStatus(maternalStatus) ? CLINICAL_CONSTANTS.PREGNANCY_MIN_CARBS_G : 0;
    const targetCarbCap = Math.max(minCarbGrams, (energy * maxCarbShare) / 4);
    if (carbGrams > targetCarbCap) {
      carbGrams = round(targetCarbCap);
      const remaining = Math.max(0, energy - carbGrams * 4);
      const maxProtFactor = diseases.has("kidney") ? CLINICAL_CONSTANTS.PROTEIN_CAP_KIDNEY : diseases.has("gout") ? CLINICAL_CONSTANTS.PROTEIN_CAP_GOUT : 1.8;
      const minSafeProt = proteinGrams;
      const targetProtCap = effectiveWeight * maxProtFactor + (diseases.has("kidney") ? 0 : maternalProteinAddon);
      const idealProt = Math.max(minSafeProt, Math.min(targetProtCap, (remaining * 0.45) / 4));
      const maxFatShare = diseases.has("cholesterol") ? 0.30 : 0.38;
      const maxFatGrams = (energy * maxFatShare) / 9;
      proteinGrams = round(Math.min(idealProt, Math.max(minSafeProt, remaining / 4)));
      const rawFatGrams = Math.max(0, energy - carbGrams * 4 - proteinGrams * 4) / 9;
      if (rawFatGrams > maxFatGrams) {
        fatGrams = round(maxFatGrams);
        carbGrams = round(Math.max(carbGrams, (energy - proteinGrams * 4 - fatGrams * 9) / 4));
      } else {
        fatGrams = round(rawFatGrams);
      }
      addNote("PLAN_GLYCEMIC_CARB_CALIBRATION", `Carbohydrate share calibrated to ~${Math.round(maxCarbShare * 100)}% of daily energy for glycemic support.`);
    }
  }

  if (input.goal === "gain" && trainingDays === 0)
    addNote("PLAN_GAIN_WITHOUT_RESISTANCE", "Calorie surplus without resistance training does not guarantee lean mass gain.");
  if (input.goal === "muscle_gain") {
    addNote("PLAN_MUSCLE_GAIN_SURPLUS", "Muscle gain targets use a moderate surplus (<= 250 kcal) and progressive resistance training.");
    if (trainingDays === 0) {
      addNote("PLAN_MUSCLE_GAIN_EXTERNAL_TRAINING_NOTE", "Pair this high-protein nutrition plan with regular external resistance training for lean muscle growth.");
    }
  }
  if (input.activity === "sedentary" && trainingDays >= 3) {
    addNote("PLAN_SEDENTARY_WORKOUT_ENERGY_NOTE", "Sedentary daily multiplier reflects non-workout routine; 2-week weigh-ins calibrate workout expenditure from recorded trends.");
  }
  const targetWeightNum =
    input.goal !== "maintain" && input.targetWeight != null && String(input.targetWeight).trim() !== ""
      ? finite(input.targetWeight, 35, 250, "targetWeight")
      : null;
  const actualChange = round(energy - tdee);
  const maintenanceBaseline = maternalStatus === "breastfeeding" ? tdee + 400 : tdee;
  const forecastDelta = round(energy - maintenanceBaseline);
  const targetDeltaKg =
    targetWeightNum != null ? round(targetWeightNum - weight, 1) : null;
  let forecast = null;
  if (targetDeltaKg != null && input.goal !== "maintain" && !isPregnantStatus(maternalStatus)) {
    if (input.goal === "lose" && forecastDelta >= 0) {
      addNote("PLAN_FLOOR_NEEDS_ACTIVITY_FOR_DEFICIT", "Calories are held at the safe minimum floor; add gentle daily movement such as walking to create a gradual fat-loss deficit.");
      forecast = {
        target_weight_kg: targetWeightNum,
        target_delta_kg: targetDeltaKg,
        daily_energy_delta: forecastDelta,
        weekly_rate_kg: 0,
        estimated_weeks_min: 0,
        estimated_weeks_max: 0,
        basis: "Daily energy is held at the safe minimum planning floor; add gentle daily movement to establish a gradual deficit.",
      };
    } else if (Math.abs(targetDeltaKg) < 0.2 || forecastDelta === 0) {
      forecast = {
        target_weight_kg: targetWeightNum,
        target_delta_kg: targetDeltaKg,
        daily_energy_delta: forecastDelta,
        weekly_rate_kg: 0,
        estimated_weeks_min: 0,
        estimated_weeks_max: 0,
        basis: "Weight maintenance or body recomposition around current weight.",
      };
    } else {
      const weeklyKg = round((Math.abs(forecastDelta) * 7) / 7700, 2);
      const centerWeeks = Math.max(1, Math.ceil(Math.abs(targetDeltaKg) / Math.max(0.1, weeklyKg)));
      forecast = {
        target_weight_kg: targetWeightNum,
        target_delta_kg: targetDeltaKg,
        daily_energy_delta: forecastDelta,
        weekly_rate_kg: forecastDelta < 0 ? -weeklyKg : weeklyKg,
        estimated_weeks_min: Math.max(1, Math.floor(centerWeeks * 0.85)),
        estimated_weeks_max: Math.ceil(centerWeeks * 1.25),
        basis: "Initial estimate based on post-floor daily energy delta (7700 kcal/kg); refined from actual weigh-in trends.",
      };
    }
  }

  const maxProteinFactor = diseases.has("kidney")
    ? CLINICAL_CONSTANTS.PROTEIN_CAP_KIDNEY
    : diseases.has("gout")
      ? CLINICAL_CONSTANTS.PROTEIN_CAP_GOUT
      : CLINICAL_CONSTANTS.PROTEIN_MAX_STANDARD;
  const clinicianGuided = diseases.has("kidney");

  return {
    training_days: trainingDays,
    ...(input.exerciseMode || input.sports?.length ? {exercise, baseline_tdee:round(baseline)} : {}),
    training_calorie_scope:
      exercise.mode === "separate" ? "Baseline daily activity excludes workouts; estimated sports expenditure is added separately." : "Selected activity multiplier includes weekly training; workout calories are not double-counted.",
    energy,
    min_energy_floor: minEnergyFloor,
    protein: proteinGrams,
    protein_factor: factor,
    effective_weight: round(effectiveWeight, 2),
    max_protein_factor: maxProteinFactor,
    ...(clinicianGuided ? { clinician_guided: true, clinicianGuided: true } : {}),
    fat: fatGrams,
    carbs: carbGrams,
    carb_target_scope:
      "Guideline macro distribution; reference food nutrients are summed directly from verified tables.",
    bmi: round(bmi),
    ree: round(ree),
    tdee: round(tdee),
    activity_factor: ACTIVITY[input.activity],
    energy_change: actualChange,
    goal_pace: pace,
    senior_mode: seniorMode,
    ...(forecast ? { forecast } : {}),
    ...(maternalStatus !== "none" ? { maternal_status: maternalStatus } : {}),
    ...(diseases.size ? { medical_conditions: [...diseases] } : {}),
    notes,
    noteCodes,
    method:
      "Mifflin-St Jeor 1990; activity multipliers and bounded goal offsets are deterministic product heuristics, not measured expenditure",
    sources: [
      "https://pubmed.ncbi.nlm.nih.gov/2305711/",
      "https://pubmed.ncbi.nlm.nih.gov/28642676/",
    ],
  };
}
export function validatePreferences(p, library) {
  const diet = p.diet ?? "balanced";
  if (!Object.hasOwn(DIETS, diet))
    throw apiError("INVALID_DIET_TYPE", "Selected dietType is not supported.", { status: 400 });
  const mealsCount = Number(p.meals ?? (FIXED_DIET_MEALS[diet]?.meals || 4));
  if (
    !["low", "medium", "high"].includes(p.budget) ||
    ![2, 3, 4, 5].includes(mealsCount)
  )
    throw apiError("INVALID_BUDGET_OR_MEALS", "Invalid budget tier or daily meal count (2..5).", { status: 400 });
  const allowed = [
    "legumes",
    "eggs",
    "dairy",
    "chicken",
    "fish",
    "meat",
    "nuts",
  ];
  if (
    !Array.isArray(p.proteins) ||
    !p.proteins.length ||
    p.proteins.some((g) => !allowed.includes(g))
  )
    throw apiError("PROTEIN_SOURCE_REQUIRED", "Select at least one primary protein source.", { status: 400 });
  const excludedKeys = p.excludedKeys || [],
    excludedFoodIds = p.excludedFoodIds || [],
    excludedGroups = p.excludedGroups || [];
  if (
    !Array.isArray(excludedKeys) ||
    excludedKeys.some(
      (k) => typeof k !== "string" || !Object.hasOwn(library.ingredients, k),
    ) ||
    !Array.isArray(excludedFoodIds) ||
    excludedFoodIds.some(
      (id) => typeof id !== "string" || !id || id.length > 120,
    ) ||
    !Array.isArray(excludedGroups) ||
    excludedGroups.some((id) => !EXCLUSIONS.some((g) => g.id === String(id).toLowerCase()))
  )
    throw apiError("INVALID_EXCLUDED_INGREDIENTS", "excludedKeys or excludedGroups contains an unknown entry.", { status: 400 });
  const region = p.region ?? "egypt";
  if (!Object.hasOwn(REGIONS, region))
    throw apiError("INVALID_REGION", "region must be a supported regional catalog selection.", { status: 400 });
  const normalizedIf = diet === "intermittent_fasting"
    ? normalizeFastingPreset(p.ifPreset ?? p.fastingPreset ?? p.fasting, "16_8")
    : (p.fasting && p.fasting !== "none" ? normalizeFastingPreset(p.fasting, null) : null);
  if (diet === "intermittent_fasting" && !normalizedIf) {
    throw apiError("FASTING_WINDOW_INVALID", "Invalid fasting mode or eating window start time (eating window must fit within the same day).", { status: 400 });
  }
  const result = {
    ...p,
    diet,
    region,
    meals: mealsCount,
    ...(diet === "intermittent_fasting"
      ? {
          fasting: normalizedIf.fasting,
          ifPreset: normalizedIf.preset,
          eatingStart: p.eatingStart || "12:00",
        }
      : normalizedIf
        ? { fasting: normalizedIf.fasting, ifPreset: normalizedIf.preset }
        : {}),
    excludedKeys: [...new Set(excludedKeys)],
    excludedFoodIds: [...new Set(excludedFoodIds)],
    excludedGroups: [...new Set(excludedGroups)],
  };
  fastingTimes(result,result.meals);
  return result;
}
export function ingredientAllowed(i, p, profile = null) {
  if (!i) return false;
  if (profile) {
    const medBlocked = medicalContraindicatedKeys(profile);
    if (medBlocked.has(i.key)) return false;
  }
  return (
    dietIngredientAllowed(i,p.diet) &&
    regionAllows(i, p.region ?? "egypt") &&
    !expandedKeys(p).includes(i.key) &&
    !p.excludedFoodIds.includes(i.food_id) &&
    (!i.protein_group || p.proteins.includes(i.protein_group))
  );
}
const tiers = { low: 1, medium: 2, high: 3 };
export function prepareTemplate(t, lib, p, profile = null) {
  if (
    !regionAllows(t, p.region ?? "egypt") ||
    tiers[t.budget_tier] > tiers[p.budget]
  )
    return null;
  if (t.component_definitions) {
    let candidate = t;
    if (profile?.diseases?.includes("hypertension") && t.items.some(part => part.key === "bread") && lib.ingredients.wholebread && ingredientAllowed(lib.ingredients.wholebread, p, profile)) {
      const replaceName = s => String(s || "").replace(/عيش بلدي/g, "خبز قمح كامل");
      candidate = {
        ...copy(t),
        name: replaceName(t.name),
        items: t.items.map(part => part.key === "bread" ? { ...part, key: "wholebread" } : { ...part }),
        component_definitions: t.component_definitions.map(c => ({ ...c, name: replaceName(c.name) }))
      };
    }
    if (candidate.items.some(part=>!ingredientAllowed(lib.ingredients[part.key],p,profile))) return null;
    return copy(candidate);
  }
  const items = [];
  let substituted = false;
  for (const part of t.items) {
    let i = lib.ingredients[part.key];
    if (!ingredientAllowed(i, p, profile)) {
      if (i.role !== "veg") return null;
      const chosen = lib.vegetable_substitutes
        .map((k) => lib.ingredients[k])
        .filter(
          (x) =>
            ingredientAllowed(x, p, profile) && tiers[x.budget_tier] <= tiers[p.budget],
        );
      i = chosen.find((x) => !items.some((q) => q.key === x.key)) || chosen[0];
      if (!i) return null;
      substituted = true;
    }
    const existing = items.find((q) => q.key === i.key);
    if (existing)
      existing.grams = String(
        Math.min(i.max_g, Number(existing.grams) + Number(part.grams)),
      );
    else items.push({ key: i.key, grams: part.grams });
  }
  const labels = items.map((p) => lib.ingredients[p.key].label);
  const fullName = "وجبة " + labels.join(" + ");
  const prepared = {
    ...copy(t),
    items,
    ...(substituted
      ? {
          name: fullName.length <= 120
            ? fullName
            : "وجبة " + labels.slice(0, 2).join(" + ") + " مع باقي المكونات الموضحة",
          notes:
            t.notes +
            " استُبدل الخضار حسب اختياراتك؛ الاسم والمكونات المعروضة للبديل الفعلي.",
        }
      : {}),
  };
  if ((p.region ?? "egypt") !== "egypt") return prepared;
  const local = egyptianBreadChoice(prepared, lib, { ...p, region: "egypt" }, (ing, pr) => ingredientAllowed(ing, pr, profile));
  return { ...local, name: egyptianMealName(local, lib), editorial_policy_version: EGYPTIAN_POLICY_VERSION };
}
// Substitution can make distinct templates identical. Preserve all supported
// meal slots when deduplicating so a valid lunch/dinner does not disappear.
function preparePool(lib, prefs, profile = null, includeRegional = true, selectionSeed = null) {
  const pool = new Map();
  for (const template of planningTemplates(lib, prefs, includeRegional, profile)) {
    const t = prepareTemplate(template, lib, prefs, profile);
    if (!t) continue;
    const key = JSON.stringify(t.items.map((i) => [i.key, Number(i.grams)]).sort());
    const previous = pool.get(key);
    if (previous) previous.meal_slots = [...new Set([...previous.meal_slots, ...t.meal_slots])];
    else pool.set(key, t);
  }
  const prepared=[...pool.values()];
  if(selectionSeed==null)return prepared;
  // Filter all constraints before taking a rotating shortlist per combination
  // family. All named dishes remain eligible; alternatives expose the full pool.
  const named=prepared.filter(t=>t.model_kind!=='meal_combination'),groups=new Map();
  for(const t of prepared.filter(t=>t.model_kind==='meal_combination')){
    const key=t.selection_family+'|'+t.meal_slots.join(',');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);
  }
  const rank=id=>{let n=2166136261;for(const c of String(selectionSeed)+'|'+id)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
  for(const group of groups.values())named.push(...group.sort((a,b)=>rank(a.id)-rank(b.id)||a.id.localeCompare(b.id)).slice(0,4));
  return named;
}
export function planningTemplates(lib, prefs, includeRegional = true, profile = null) {
  const region = prefs.region ?? 'egypt';
  let base;
  if (region === 'egypt') {
    base = egyptianMenus(lib);
  } else if (['gulf', 'levant', 'maghreb'].includes(region)) {
    const regMenus = regionalMenus(lib, region);
    base = [...regMenus, ...lib.templates.filter(t => regionAllows(t, region))];
  } else {
    base = lib.templates;
  }
  const strictSodium = prefs.diet === 'dash' || Boolean(profile?.diseases?.includes('hypertension') || profile?.diseases?.includes('kidney'));
  base = [...base, ...(!includeRegional || strictSodium ? [] : regionalFoodTemplates(lib, region))];
  return dietTemplates(base, lib, prefs.diet ?? 'balanced', region, profile);
}
export function applyDietMacroTargets(baseTargets, dietType = 'balanced', profile = {}) {
  const targets = { ...baseTargets };
  if (dietType === 'high_protein') {
    const weightBasis = targets.effective_weight ?? Number(profile?.weight || 75);
    const maxFactor = targets.max_protein_factor ?? CLINICAL_CONSTANTS.PROTEIN_MAX_STANDARD;
    const isActiveOrCutting = (targets.training_days || 0) > 0 || ['lose', 'muscle_gain'].includes(profile?.goal);
    const desiredHighFactor = isActiveOrCutting
      ? CLINICAL_CONSTANTS.PROTEIN_FACTOR_HIGH_PROTEIN_MAX
      : CLINICAL_CONSTANTS.PROTEIN_FACTOR_HIGH_PROTEIN_MIN;
    const energyCappedFactor = targets.energy > 0
      ? Math.max(1.4, Math.floor(((targets.energy * 0.42) / 4 / Math.max(1, weightBasis)) * 10) / 10)
      : desiredHighFactor;
    const resolvedFactor = Math.min(maxFactor, Math.max(targets.protein_factor || CLINICAL_CONSTANTS.PROTEIN_FACTOR_HIGH_PROTEIN_MIN, Math.min(desiredHighFactor, energyCappedFactor)));
    targets.protein = round(weightBasis * resolvedFactor);
    targets.protein_factor = resolvedFactor;
    targets.carbs = round(Math.max(0, targets.energy - targets.protein * 4 - targets.fat * 9) / 4);
  } else if (dietType === 'low_carb') {
    targets.carbs = 100;
    targets.fat = round(Math.max(0, targets.energy - targets.protein * 4 - 400) / 9);
    targets.carb_target_scope = 'Total carbohydrates capped at <= 130 g/day (not a ketogenic plan).';
  } else if (dietType === 'keto') {
    targets.carbs = 30;
    targets.fat = round(Math.max(0, targets.energy - targets.protein * 4 - 120) / 9);
    targets.carb_target_scope = 'Target 30 g total carbohydrates (strict ceiling <= 50 g/day; total carbs, not net carbs).';
  }
  return targets;
}
function ingredientIdentity(snapshot) {
  if (!snapshot.ingredients?.length) return null;
  return JSON.stringify([...new Set(snapshot.ingredients.map((i) => i.food_id))].sort());
}
export const MIN_MEAL_CHOICES = 3;
export function mealAvailability(prefs, lib, profile = null) {
  const p = validatePreferences(prefs, lib);
  const pool = preparePool(lib, p, profile);
  const choices = {};
  for (const slot of new Set(daySlots(p.meals, p.diet).map((s) => s.slot))) {
    choices[slot] = new Set(pool.filter((t) => t.meal_slots.includes(slot))
      .map((t) => JSON.stringify([...new Set(t.items.map((i) => lib.ingredients[i.key].food_id))].sort()))).size;
  }
  return {minimum:MIN_MEAL_CHOICES, choices, sufficient:Object.values(choices).every((n) => n >= MIN_MEAL_CHOICES)};
}
export function checkPlanFeasibility(profile, prefs, lib, seed = 'preview') {
  const p = validatePreferences(prefs, lib);
  const targets = applyDietMacroTargets(estimateNeeds(profile), p.diet, profile);
  const slots = daySlots(p.meals, p.diet);
  const hasKidney = Boolean(profile?.diseases?.includes('kidney'));
  const hasHypertension = Boolean(profile?.diseases?.includes('hypertension'));
  const hasCholesterol = Boolean(profile?.diseases?.includes('cholesterol'));
  const sodiumLimitMg = hasKidney ? CLINICAL_CONSTANTS.CKD_SODIUM_LIMIT_MG : (p.diet === 'dash' || hasHypertension) ? CLINICAL_CONSTANTS.DASH_SODIUM_LIMIT_MG : null;
  const satLimitFor = (energy) => energy * CLINICAL_CONSTANTS.CHOLESTEROL_MAX_SAT_FAT_SHARE;
  const snapSatKcal = (snap) => {
    const raw = snap?.values?.saturated ?? snap?.estimated_values?.saturated;
    return raw != null && Number.isFinite(Number(raw)) ? Number(raw) * 9 : 0;
  };
  const tryFeasible = (includeRegional) => {
    const pool = preparePool(lib, p, profile, includeRegional, seed);
    for (const slot of slots) {
      if (!pool.some((t) => t.meal_slots.includes(slot.slot))) {
        return {
          feasible: false,
          code: 'PLAN_CONSTRAINTS_UNMET',
          field: 'excludedGroups',
          message: `No eligible meals match your dietary exclusions for meal slot ${slot.slot}. Update protein sources, budget, or exclusions.`,
          stage: 'NO_ELIGIBLE_MEAL_FOR_SLOT'
        };
      }
    }
    const fitted = new Map();
    const meals = [];
    const hasGlycemic = Array.isArray(profile?.diseases) && profile.diseases.some(d => ['diabetes', 'diabetes_t1', 'diabetes_t2', 'insulin_resistance', 'pcos'].includes(d));
    const fitOpts = {
      capProtein: Boolean(profile?.diseases?.includes('kidney') || profile?.diseases?.includes('gout')),
      reduceCarbs: Boolean(hasGlycemic && !['keto', 'low_carb'].includes(p.diet))
    };
    for (const slot of slots) {
      const desired = targets.energy * slot.share;
      const protein = targets.protein * slot.share;
      const slotPool = egyptianSlotPool(pool, p.region, slot.slot);
      const candidates = slotPool.map((t) => {
        const key = t.id + '|' + Math.round(desired) + '|' + Math.round(protein) + (fitOpts.capProtein ? '|cap' : '') + (fitOpts.reduceCarbs ? '|rc' : '');
        if (!fitted.has(key)) fitted.set(key, fitMeal(t, desired, protein, lib, fitOpts));
        const snapshot = fitted.get(key);
        const v = snapshot.values;
        const carbCap = targets.carbs * slot.share;
        const glycemicPenalty = fitOpts.reduceCarbs && v.carbs != null
          ? Math.max(0, Number(v.carbs) - carbCap * 1.1) / Math.max(10, carbCap) * 2.5
          : 0;
        const renalPenalty = fitOpts.capProtein && v.protein != null
          ? Math.max(0, Number(v.protein) - protein * 1.12) / Math.max(10, protein) * 2.5
          : 0;
        const satPenalty = hasCholesterol
          ? Math.max(0, snapSatKcal(snapshot) - satLimitFor(desired)) / Math.max(10, satLimitFor(desired)) * 3.0
          : 0;
        const score = (Math.abs(Number(v.energy) - desired) / desired) * 5 + (Math.abs(protein - Number(v.protein)) / Math.max(1, protein)) * 1.5 + glycemicPenalty + renalPenalty + satPenalty;
        return { t, snapshot, score };
      }).filter((a) => {
        if (sodiumLimitMg != null) {
          const sod = a.snapshot.values.sodium;
          const usedSod = meals.reduce((s, m) => s + Number(m.snapshot.values.sodium || 0), 0);
          return sod != null && (usedSod + Number(sod) <= sodiumLimitMg) && Number(sod) <= sodiumLimitMg * slot.share * 1.35;
        }
        if (hasCholesterol) {
          const usedSat = meals.reduce((s, m) => s + snapSatKcal(m.snapshot), 0);
          if (usedSat + snapSatKcal(a.snapshot) > satLimitFor(targets.energy) + 0.5) return false;
        }
        if (p.diet === 'keto' || p.diet === 'low_carb') {
          const maxCarbs = p.diet === 'keto' ? 50 : 130;
          const usedCarbs = meals.reduce((s, m) => s + Number(m.snapshot.values.carbs || 0), 0);
          const remainingSlots = Math.max(0, slots.length - meals.length - 1);
          const reserveCarbs = remainingSlots * (p.diet === 'keto' ? 6 : 15);
          return usedCarbs + Number(a.snapshot.values.carbs || 0) <= maxCarbs - reserveCarbs;
        }
        return true;
      }).sort((a, b) => a.score - b.score || a.t.id.localeCompare(b.t.id));
      if (!candidates.length) {
        return {
          feasible: false,
          code: 'PLAN_CONSTRAINTS_UNMET',
          field: 'excludedGroups',
          message: `No eligible meal satisfies diet rules for meal slot ${slot.slot} under current preferences.`,
          stage: 'NO_CANDIDATE_WITHIN_DIET_LIMITS'
        };
      }
      meals.push({ slot: slot.slot, target_energy: round(desired), target_protein: round(protein), snapshot: copy(candidates[0].snapshot) });
    }
    const mains = meals.filter(m => m.slot !== 'snack');
    if (mains.length) {
      for (let pass = 0; pass < 3; pass++) {
        const curSum = sumSnapshots(meals.map(m => m.snapshot)).values;
        const gap = targets.energy - Number(curSum.energy);
        const pGap = Math.max(0, targets.protein - Number(curSum.protein));
        if (Math.abs(gap) < targets.energy * 0.02 && pGap < 4) break;
        for (const m of mains) {
          const template = pool.find(t => t.id === m.snapshot.template_id);
          if (!template) continue;
          const nextE = Math.max(1, Number(m.snapshot.values.energy) + gap / mains.length);
          const nextP = Math.max(m.target_protein, Number(m.snapshot.values.protein) + pGap / mains.length);
          const next = fitMeal(template, nextE, nextP, lib, fitOpts);
          const nextSnaps = meals.map(x => x === m ? next : x.snapshot);
          const dashOk = sodiumLimitMg == null || (sumSnapshots(nextSnaps).values.sodium != null && Number(sumSnapshots(nextSnaps).values.sodium) <= sodiumLimitMg);
          const cholOk = !hasCholesterol || nextSnaps.reduce((s, sn) => s + snapSatKcal(sn), 0) <= satLimitFor(Number(sumSnapshots(nextSnaps).values.energy || targets.energy)) + 0.5;
          const carbOk = !['keto', 'low_carb'].includes(p.diet) || Number(sumSnapshots(nextSnaps).values.carbs ?? 0) <= (p.diet === 'keto' ? 50 : 130);
          if (nutritionObjective(sumSnapshots(nextSnaps), targets) < nutritionObjective(sumSnapshots(meals.map(x => x.snapshot)), targets) && dashOk && cholOk && carbOk) {
            m.snapshot = next;
          }
        }
      }
    }
    for (let repair = 0; repair < meals.length * 2 && nutritionQualityIssues(sumSnapshots(meals.map(m => m.snapshot)), targets).length > 0; repair++) {
      const currentSummary = sumSnapshots(meals.map(m => m.snapshot));
      let best = null, current = repairObjective(currentSummary, targets);
      const gap = Math.max(0, targets.protein - Number(currentSummary.values.protein));
      for (const meal of meals) for (const template of pool.filter(t => t.meal_slots.includes(meal.slot))) {
        const desiredEnergy = Math.max(1, targets.energy - Number(currentSummary.values.energy) + Number(meal.snapshot.values.energy));
        const desiredProtein = meal.target_protein + gap / Math.max(1, meals.length - 1);
        const key = template.id + '|p|' + Math.round(desiredEnergy) + '|' + Math.round(desiredProtein) + (fitOpts.capProtein ? '|cap' : '');
        if (!fitted.has(key)) fitted.set(key, fitMeal(template, desiredEnergy, desiredProtein, lib, fitOpts));
        const snapshot = fitted.get(key), snapshots = meals.map(m => m === meal ? snapshot : m.snapshot);
        try { assertDietDay(snapshots, p.diet, targets, profile); } catch { continue; }
        const score = repairObjective(sumSnapshots(snapshots), targets);
        if (score < current) { best = { meal, snapshot }; current = score; }
      }
      if (!best) break;
      best.meal.snapshot = copy(best.snapshot);
    }
    try {
      assertDietDay(meals.map(m => m.snapshot), p.diet, targets, profile);
    } catch (err) {
      return {
        feasible: false,
        code: err?.code || 'PLAN_CONSTRAINTS_UNMET',
        field: 'excludedGroups',
        message: err?.message || 'Dietary constraints cannot be satisfied with current exclusions.',
        stage: 'ASSERT_DIET_DAY_FAILED'
      };
    }
    const summary = sumSnapshots(meals.map(m => m.snapshot));
    if (nutritionQualityIssues(summary, targets).length > 0) {
      return {
        feasible: false,
        code: 'PLAN_CONSTRAINTS_UNMET',
        field: 'excludedGroups',
        message: 'Meal search could not meet daily calorie and protein tolerances under your current dietary exclusions.',
        stage: 'NUTRIENT_TARGETS_UNMET'
      };
    }
    return { feasible: true };
  };
  const primary = tryFeasible(true);
  if (primary.feasible) return primary;
  const fallback = tryFeasible(false);
  return fallback.feasible ? fallback : primary;
}
export function blockedExclusionSlots(before, after, lib) {
  const previous = mealAvailability(before, lib), next = mealAvailability(after, lib);
  return Object.keys(next.choices).filter((slot) => next.choices[slot] < MIN_MEAL_CHOICES && next.choices[slot] < previous.choices[slot]);
}
function totalsForParts(parts, lib) {
  const activeParts = parts.filter((p) => Number(p.grams) > 0);
  const items = activeParts.map((p) => {
    const i = lib.ingredients[p.key];
    return {
      grams: p.grams,
      values: i.values,
      factors: Object.fromEntries(METRICS.map((k) => [k, "1"])),
    };
  });
  const result = aggregate(items, METRICS);
  const estItems = activeParts.map((p) => {
    const i = lib.ingredients[p.key];
    const fb = FALLBACK_MICROS[p.key] || {};
    return {
      grams: p.grams,
      values: {
        ...i.values,
        fiber: i.values.fiber ?? fb.fiber ?? null,
        saturated: i.values.saturated ?? fb.saturated ?? null,
        sodium: i.values.sodium ?? fb.sodium ?? null,
        sugars: i.values.sugars ?? fb.sugars ?? null,
      },
      factors: Object.fromEntries(METRICS.map((k) => [k, "1"])),
    };
  });
  const estResult = aggregate(estItems, METRICS);
  const carbIds = [
    ...new Set(activeParts.map((p) => lib.ingredients[p.key].carb_id)),
  ];
  const values = Object.fromEntries(
    METRICS.map((k) => [k, result.nutrients[k].total]),
  );
  const estimated_values = Object.fromEntries(
    METRICS.map((k) => [k, estResult.nutrients[k].total]),
  );
  if (carbIds.length > 1) values.carbs = null;
  return {
    values,
    estimated_values,
    carb_ids: carbIds,
    fruit_veg_g: activeParts
      .filter((p) => ["veg", "fruit"].includes(lib.ingredients[p.key].role))
      .reduce((s, p) => s + Number(p.grams), 0),
  };
}
export function snapshotTemplate(template, parts, lib) {
  const totals = totalsForParts(parts, lib);
  const result = {
    template_id: template.id,
    name: template.name,
    budget_tier: template.budget_tier,
    regions: copy(template.regions || []),
    quality: template.quality || "planned_assembly_from_reference_ingredients",
    ...(template.nutrition_confidence ? {is_approximate:true,nutrition_confidence:template.nutrition_confidence,model_kind:template.model_kind,review_status:template.review_status,source_url:template.source_url,country:template.country} : {}),
    data_version: lib.data_version,
    engine_version: ENGINE_VERSION,
    ...(template.editorial_policy_version ? { editorial_policy_version: template.editorial_policy_version } : {}),
    notes: template.notes,
    carb_ids: totals.carb_ids,
    values: template.nutrition_confidence ? {...totals.values,sodium:null} : totals.values,
    estimated_values: totals.estimated_values,
    fruit_veg_g: totals.fruit_veg_g,
    ingredients: parts
      .filter((p) => Number(p.grams) > 0)
      .map((p) => {
        const i = lib.ingredients[p.key];
        return {
          key: p.key,
          ...(p.component_id ? {component_id:p.component_id} : {}),
          food_id: i.food_id,
          name: i.label,
          grams: p.grams,
          state: i.state,
          role: i.role,
          values_per_100g: i.values,
          carb_id: i.carb_id,
          energy_id: i.energy_id,
          source: i.source,
          source_name: i.source_name,
          source_external_id: i.source_external_id,
          reference: i.reference,
          portions: i.portions,
          notes: i.notes,
        };
      }),
  };
  if (template.component_definitions) {
    result.components = template.component_definitions.map(c=>{
      const selected=parts.filter(p=>p.component_id===c.id&&Number(p.grams)>0);
      if(!selected.length)return null;
      const child=snapshotTemplate({id:null,name:c.name,regions:template.regions,budget_tier:template.budget_tier,notes:template.notes,...(template.nutrition_confidence?{quality:template.quality,nutrition_confidence:template.nutrition_confidence,model_kind:template.model_kind,review_status:template.review_status,source_url:template.source_url,country:template.country}:{})},selected,lib);
      return {...child,component_role:c.role};
    }).filter(Boolean);
  }
  return result;
}
export function fitMeal(t, desiredEnergy, desiredProtein, lib, options = {}) {
  const capProtein = Boolean(options?.capProtein);
  const reduceCarbs = Boolean(options?.reduceCarbs);
  const isKeto = Boolean(t.id && String(t.id).startsWith("keto-"));
  const isPart = Boolean(t.id && String(t.id).startsWith("part-"));
  const isMainMeal = !isPart && (!t.meal_slots || t.meal_slots.some(s => ["breakfast", "lunch", "dinner"].includes(s)));
  const lower = (p) => {
    const baseMin = Math.max(lib.ingredients[p.key].min_g, p.min_g || 0);
    const i = lib.ingredients[p.key];
    // Protect complete animal protein in main meals unless renal/gout protein cap is active
    if (!capProtein && isMainMeal && i.role === "protein" && ["chicken", "meat", "fish"].includes(i.protein_group) && desiredProtein >= 22) {
      return Math.max(baseMin, Math.min(Number(p.grams) || 120, desiredEnergy >= 750 ? 140 : 110));
    }
    return baseMin;
  };
  const upper = (p) => {
    if (p.key === "olive" && !isKeto && p.max_g == null) {
      return desiredEnergy > 850 ? 22 : 12;
    }
    return p.max_g ?? lib.ingredients[p.key].max_g;
  };
  const fastEnergyAndProtein = (arr) => { let energy = 0, protein = 0; for (const p of arr) { const i = lib.ingredients[p.key], g = Number(p.grams) / 100; energy += Number(i.values.energy) * g; protein += Number(i.values.protein) * g; } return { energy, protein }; };
  let base = fastEnergyAndProtein(t.items);
  const scale = clamp(desiredEnergy / Math.max(1, base.energy), 0.65, 2.2);
  let parts = t.items.map((p) => ({
    ...p,
    grams: String(Math.round(clamp(Number(p.grams) * scale, lower(p), upper(p)))),
  }));
  const get = () => fastEnergyAndProtein(parts);
  // Count reference protein grams without inventing digestibility percentages for food groups.
  const effectiveProtein = () => {
    let total = 0;
    for (const p of parts) {
      const i = lib.ingredients[p.key];
      const prot = (Number(i.values.protein) * Number(p.grams)) / 100;
      total += prot;
    }
    return total;
  };

  for (let iteration = 0; iteration < 6; iteration++) {
    const effP = effectiveProtein();
    const deficit = desiredProtein - effP;
    if (deficit > 2) {
      const candidates = parts
        .filter((p) => lib.ingredients[p.key].role === "protein")
        .sort((a, b) => {
          const av = lib.ingredients[a.key].values,
            bv = lib.ingredients[b.key].values;
          return (
            Number(bv.protein) / Math.max(1, Number(bv.energy)) -
            Number(av.protein) / Math.max(1, Number(av.energy))
          );
        });
      for (const p of candidates) {
        const i = lib.ingredients[p.key],
          rate = Number(i.values.protein) / 100;
        if (rate <= 0) continue;
        const need = Math.max(0, desiredProtein - effectiveProtein());
        p.grams = String(
          Math.round(clamp(Number(p.grams) + need / rate, lower(p), upper(p))),
        );
        if (need < 2) break;
      }
    }
    let v = get();
    const trimThreshold = capProtein ? 1.04 : 1.15;
    if (Number(v.protein) > desiredProtein * trimThreshold) {
      for (const p of parts.filter(
        (p) => lib.ingredients[p.key].role === "protein",
      )) {
        const i = lib.ingredients[p.key],
          rate = Number(i.values.protein) / 100;
        if (rate > 0)
          p.grams = String(
            Math.round(
              clamp(
                Number(p.grams) -
                  (Number(get().protein) - desiredProtein) / rate,
                lower(p),
                upper(p),
              ),
            ),
          );
      }
    }
    v = get();
    let difference = desiredEnergy - Number(v.energy);
    const candidates = parts
      .filter((p) => {
        const r = lib.ingredients[p.key].role;
        if (capProtein && r === "protein" && difference > 0 && effectiveProtein() >= desiredProtein) return false;
        return isKeto
          ? ["fat", "protein", "veg"].includes(r)
          : ["carb", "fat", "fruit", "protein"].includes(r);
      })
      .sort((a, b) => {
        const role = isKeto
          ? { fat: 0, protein: 1, veg: 2 }
          : (reduceCarbs && difference > 0)
            ? { fat: 0, protein: 1, carb: 2, fruit: 3 }
            : { carb: 0, fruit: 1, fat: 2, protein: 3 };
        return (
          role[lib.ingredients[a.key].role] - role[lib.ingredients[b.key].role]
        );
      });
    for (const p of candidates) {
      if (Math.abs(difference) < 8) break;
      const i = lib.ingredients[p.key],
        rate = Number(i.values.energy) / 100;
      if (!rate) continue;
      if (i.role === "protein" && difference < 0) continue;
      const old = Number(p.grams),
        next = Math.round(clamp(old + difference / rate, lower(p), upper(p)));
      p.grams = String(next);
      difference -= rate * (next - old);
    }
  }
  return snapshotTemplate(t, (t.component_definitions || t.practical_portions) ? practicalParts(parts,lib) : parts, lib);
}
export function sumSnapshots(meals) {
  const snaps = meals.filter(Boolean),
    values = {};
  if (!snaps.length)
    return {
      values: Object.fromEntries(METRICS.map((k) => [k, "0"])),
      carb_ids: [],
      fruit_veg_g: 0,
      count: 0,
    };
  const refs = snaps.map((m) => ({ scale: "1", values: m.values }));
  const result = referenceTotals(refs, METRICS);
  for (const k of METRICS) values[k] = result.nutrients[k].total;
  const carbIds = [...new Set(snaps.flatMap((m) => m.carb_ids || []))];
  if (carbIds.length > 1) values.carbs = null;
  const metricDefinitions = {};
  for (const k of ["fiber", "sugars"]) {
    const definitions = [
      ...new Set(
        snaps
          .filter((m) => m.values[k] != null)
          .map((m) => m.metric_definitions?.[k] || "fdc:" + k),
      ),
    ];
    metricDefinitions[k] = definitions.length === 1 ? definitions[0] : null;
    if (definitions.length > 1) values[k] = null;
  }
  return {
    values,
    carb_ids: carbIds,
    metric_definitions: metricDefinitions,
    fruit_veg_g: round(
      snaps.reduce((s, m) => s + Number(m.fruit_veg_g || 0), 0),
    ),
    count: snaps.length,
  };
}
export function daySlots(meals, diet = "balanced") {
  if (diet === "intermittent_fasting" && meals === 3)
    return [
      { id: "breakfast", slot: "breakfast", share: 0.4 },
      { id: "snack", slot: "snack", share: 0.15 },
      { id: "lunch", slot: "lunch", share: 0.45 },
    ];
  if (meals === 2)
    return [
      { id: "breakfast", slot: "breakfast", share: 0.45 },
      { id: "lunch", slot: "lunch", share: 0.55 },
    ];
  if (meals === 3)
    return [
      { id: "breakfast", slot: "breakfast", share: 0.3 },
      { id: "lunch", slot: "lunch", share: 0.4 },
      { id: "dinner", slot: "dinner", share: 0.3 },
    ];
  if (meals === 5)
    return [
      { id: "breakfast", slot: "breakfast", share: 0.25 },
      { id: "snack1", slot: "snack", share: 0.1 },
      { id: "lunch", slot: "lunch", share: 0.3 },
      { id: "dinner", slot: "dinner", share: 0.25 },
      { id: "snack2", slot: "snack", share: 0.1 },
    ];
  return [
    { id: "breakfast", slot: "breakfast", share: 0.25 },
    { id: "lunch", slot: "lunch", share: 0.35 },
    { id: "dinner", slot: "dinner", share: 0.25 },
    { id: "snack", slot: "snack", share: 0.15 },
  ];
}
function noise(seed, text) {
  let h = 2166136261;
  for (const c of String(seed) + text) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
export function validDate(date) {
  const d = new Date(date + "T12:00:00Z");
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== date
  )
    throw apiError("INVALID_DATE", "Invalid calendar date format; expected YYYY-MM-DD.", {
      status: 400,
      params: { field: "date" },
    });
  return date;
}
export function addDays(date, offset) {
  validDate(date);
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function planCoverageError(stage,message){
 return apiError('PLAN_CONSTRAINTS_UNMET',message,{status:400,params:{stage},retryable:false,fieldErrors:[{field:'preferences',code:stage,message}]});
}
export function makeWeek(profile, prefs, lib, startDate, seed = "1", acceptedEnergy = null) {
  let lastError, bestPlan = null, bestScore = Infinity;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const plan=buildWeek(profile,prefs,lib,startDate,attempt?String(seed)+':restart:'+attempt:seed,acceptedEnergy);
      plan.id='plan-'+String(seed);
      // A larger catalog can change greedy choices. Spend the existing bounded
      // restart budget on quality too; retain the best valid week if no tighter fit exists.
      const score=plan.days.reduce((sum,day)=>sum+repairObjective(day.summary,day.targets),0);
      if(score<bestScore){bestPlan=plan;bestScore=score;}
      if(plan.days.every(day=>!needsNutritionImprovement(day.summary,day.targets)))return plan;
    }catch(error){
      const stage=error.fieldErrors?.[0]?.code;
      if(error.code!=='PLAN_CONSTRAINTS_UNMET'||!['NUTRIENT_TARGETS_UNMET','NO_CANDIDATE_WITHIN_DIET_LIMITS'].includes(stage))throw error;
      lastError=error;
    }
  }
  // Keep the established regional library as a fallback when new serving models
  // make a constrained vegan/low-budget search settle at a weaker local optimum.
  // This never relaxes exclusions or accepts a failed week.
  for(let attempt=0;attempt<2;attempt++){
    try{
      const plan=buildWeek(profile,prefs,lib,startDate,attempt?String(seed)+':restart:'+attempt:seed,acceptedEnergy,false);
      plan.id='plan-'+String(seed);
      if(plan.days.every(day=>!needsNutritionImprovement(day.summary,day.targets)))return plan;
      const score=plan.days.reduce((sum,day)=>sum+repairObjective(day.summary,day.targets),0);
      if(score<bestScore){bestPlan=plan;bestScore=score;}
    }catch(error){
      if(error.code!=='PLAN_CONSTRAINTS_UNMET')throw error;
      lastError=error;
    }
  }
  if(bestPlan)return bestPlan;
  throw lastError;
}
function buildWeek(profile, prefs, lib, startDate, seed, acceptedEnergy, includeRegional = true) {
  let targets = estimateNeeds(profile);
  const p = validatePreferences(prefs, lib),
    slots = daySlots(p.meals, p.diet);
  // Internal renewal target: fit source portions to the accepted energy while
  // preserving protein, instead of scaling a newly generated higher-energy week.
  if(acceptedEnergy!=null){
    const before=targets.energy;
    targets.energy=finite(acceptedEnergy,minSafeEnergyFloor(profile),CLINICAL_CONSTANTS.MAX_ENERGY_CEILING,'adjustedEnergy');
    targets.fat=round(targets.fat*targets.energy/before);
    targets.carbs=round(Math.max(0,targets.energy-targets.protein*4-targets.fat*9)/4);
    targets.energy_change=round(targets.energy-targets.tdee);
    if(targets.forecast){
      const f=targets.forecast,weekly=round(Math.abs(targets.energy_change)*7/7700,2);
      const center=weekly&&Math.abs(f.target_delta_kg)>=.2?Math.max(1,Math.ceil(Math.abs(f.target_delta_kg)/Math.max(.1,weekly))):0;
      targets.forecast={...f,daily_energy_delta:targets.energy_change,weekly_rate_kg:targets.energy_change<0?-weekly:weekly,estimated_weeks_min:center?Math.max(1,Math.floor(center*.85)):0,estimated_weeks_max:Math.ceil(center*1.25)};
    }
  }
  if(p.diet==='keto'){
    if(profile.ketoAcknowledged!==true || isDietUnsafeForProfile('keto', profile))throw apiError('KETO_REQUIRES_CONFIRMATION','Keto diet requires explicit acknowledgment and is blocked with contraindicated medical conditions.',{status:400});
  }
  targets = applyDietMacroTargets(targets, p.diet, profile);
  if((p.excludedGroups||[]).includes('gluten') && !(targets.noteCodes||[]).includes(EXCLUSION_CROSS_CONTACT_WARNINGS.gluten.code)){
    targets.notes=[...(targets.notes||[]),EXCLUSION_CROSS_CONTACT_WARNINGS.gluten.message];
    targets.noteCodes=[...(targets.noteCodes||[]),EXCLUSION_CROSS_CONTACT_WARNINGS.gluten.code];
  }
  if((p.fasting&&p.fasting!=='none')||p.diet==='intermittent_fasting'){
    if(isDietUnsafeForProfile('intermittent_fasting', profile)||(p.diet!=='intermittent_fasting'&&profile.fastingAcknowledged!==true))throw apiError('FASTING_REQUIRES_CONFIRMATION','Intermittent fasting requires explicit acknowledgment and is blocked with contraindicated conditions.',{status:400});
  }
  const schedule=fastingTimes(p,slots.length);
  validDate(startDate);
  validDate(addDays(startDate, 6));
  const pool = preparePool(lib, p, profile, includeRegional, seed),
    counts = new Map(),
    templateCounts = new Map(),
    previousSlotFamily = new Map(),
    proteinCounts = new Map(),
    days = [],
    warnings = [],
    fitted = new Map();
  for (const slot of slots)
    if (!pool.some((t) => t.meal_slots.includes(slot.slot)))
      throw planCoverageError('NO_ELIGIBLE_MEAL_FOR_SLOT',
        `No eligible meals match your dietary exclusions for meal slot ${slot.slot}. Update protein sources, budget, or exclusions; your current choices were not modified.`,
      );

  const workoutDayIndices = new Set(
    Array.isArray(profile.workoutDays)
      ? profile.workoutDays
      : Array.from({ length: Math.min(7, targets.training_days || 0) }, (_, i) => Math.min(6, i * 2)),
  );

  const hasGlycemic = Array.isArray(profile?.diseases) && profile.diseases.some(d => ['diabetes', 'diabetes_t1', 'diabetes_t2', 'insulin_resistance', 'pcos'].includes(d));
  const hasKidney = Boolean(profile?.diseases?.includes('kidney'));
  const hasHypertension = Boolean(profile?.diseases?.includes('hypertension'));
  const hasCholesterol = Boolean(profile?.diseases?.includes('cholesterol'));
  const isPregnant = isPregnantStatus(profile?.maternalStatus);
  const sodiumLimitMg = hasKidney ? CLINICAL_CONSTANTS.CKD_SODIUM_LIMIT_MG : (p.diet === 'dash' || hasHypertension) ? CLINICAL_CONSTANTS.DASH_SODIUM_LIMIT_MG : null;
  const satLimitFor = (energy) => energy * CLINICAL_CONSTANTS.CHOLESTEROL_MAX_SAT_FAT_SHARE;
  const snapSatKcal = (snap) => {
    const raw = snap?.values?.saturated ?? snap?.estimated_values?.saturated;
    return raw != null && Number.isFinite(Number(raw)) ? Number(raw) * 9 : 0;
  };
  const carbCyclingEnabled = Boolean(
    (profile?.carbCycling === true || p?.carbCycling === true) &&
    (targets.training_days || 0) > 0 &&
    (targets.training_days || 0) < 7 &&
    !['keto', 'low_carb'].includes(p.diet) &&
    !isPregnant
  );
  let ccWorkoutMult = CLINICAL_CONSTANTS.CARB_CYCLING_WORKOUT_MULTIPLIER;
  let ccRestMult = CLINICAL_CONSTANTS.CARB_CYCLING_REST_MULTIPLIER;
  if (carbCyclingEnabled) {
    // Balance weekly workout vs rest multipliers so 7-day average calories remain steady around targets.energy.
    let actualWorkoutDays = 0;
    for (let dIdx = 0; dIdx < 7; dIdx++) {
      if (workoutDayIndices.has(new Date(addDays(startDate, dIdx) + "T12:00:00Z").getUTCDay())) actualWorkoutDays++;
    }
    const nTrain = Math.max(1, Math.min(6, actualWorkoutDays || targets.training_days || 3));
    const nRest = 7 - nTrain;
    const desiredRestDrop = Math.min(0.15, (0.10 * nTrain) / nRest);
    ccRestMult = Math.round((1 - desiredRestDrop) * 1000) / 1000;
    ccWorkoutMult = Math.round((1 + (desiredRestDrop * nRest) / nTrain) * 1000) / 1000;
    const upPct = Math.round((ccWorkoutMult - 1) * 100);
    const downPct = Math.round((1 - ccRestMult) * 100);
    targets.carb_cycling = true;
    targets.carb_cycling_workout_multiplier = ccWorkoutMult;
    targets.carb_cycling_rest_multiplier = ccRestMult;
    if (!(targets.noteCodes || []).includes('PLAN_CARB_CYCLING_ACTIVE')) {
      targets.notes = [...(targets.notes || []), `Carb cycling active: +${upPct}% calories/carbs on training days and -${downPct}% on rest days to keep weekly average calories steady while preserving protein.`];
      targets.noteCodes = [...(targets.noteCodes || []), 'PLAN_CARB_CYCLING_ACTIVE'];
    }
  }
  const fitOpts = {
    capProtein: Boolean(profile?.diseases?.includes('kidney') || profile?.diseases?.includes('gout')),
    reduceCarbs: Boolean(hasGlycemic && !['keto', 'low_carb'].includes(p.diet))
  };
  const batchPrepMode = Boolean(p.batchPrepMode === true || profile?.batchPrepMode === true);
  const batchSlotTemplates = new Map();
  const batchPrepBlocks = [];
  if (batchPrepMode) {
    targets.batch_prep_mode = true;
    if (!(targets.noteCodes || []).includes('BATCH_PREP_MODE_ACTIVE')) {
      targets.notes = [...(targets.notes || []), 'Batch Meal Prep mode active: lunch and dinner dishes repeat across 2-3 consecutive days to reduce kitchen prep time.'];
      targets.noteCodes = [...(targets.noteCodes || []), 'BATCH_PREP_MODE_ACTIVE'];
    }
  }
  let tunaMealsUsed = 0;

  for (let day = 0; day < 7; day++) {
    const batchBlockIndex = day < 3 ? 0 : day < 5 ? 1 : 2;
    const isBatchBlockStart = day === 0 || day === 3 || day === 5;
    if (batchPrepMode && isBatchBlockStart) batchSlotTemplates.clear();
    const isWorkoutDay = workoutDayIndices.has(new Date(addDays(startDate, day) + "T12:00:00Z").getUTCDay()) && (targets.training_days || 0) > 0;
    const dayTargets = copy(targets);
    if (carbCyclingEnabled) {
      const mult = isWorkoutDay ? ccWorkoutMult : ccRestMult;
      const cycledEnergy = Math.max(
        minSafeEnergyFloor(profile),
        Math.min(CLINICAL_CONSTANTS.MAX_ENERGY_CEILING, Math.round((targets.energy * mult) / 10) * 10)
      );
      dayTargets.energy = cycledEnergy;
      dayTargets.protein = targets.protein;
      dayTargets.fat = targets.fat;
      dayTargets.carbs = round(Math.max(0, cycledEnergy - dayTargets.protein * 4 - dayTargets.fat * 9) / 4);
      dayTargets.carb_cycling_day_type = isWorkoutDay ? 'high_carb_training' : 'lower_carb_rest';
    }
    const meals = [];
    const chosen = new Set(),
      chosenProteins = new Set(),
      chosenMains = new Set();
    for (const slot of slots) {
      let slotShare = slot.share;
      const desired = dayTargets.energy * slotShare,
        protein = dayTargets.protein * slotShare;
      const mainIdentity = t => t.dish_family || (t.component_definitions
        ? t.items.filter(i => t.component_definitions.some(c => c.id === i.component_id && c.role === 'main'))
          .filter(i => lib.ingredients[i.key].role === 'protein').map(i => i.key).sort().join('|')
        : '');
      const rawEligibleSlotPool = egyptianSlotPool(pool, p.region, slot.slot);
      const eligibleSlotPool = isPregnant && tunaMealsUsed >= CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_WEEKLY_SERVINGS
        ? rawEligibleSlotPool.filter(t => !t.items.some(i => i.key === 'tuna'))
        : rawEligibleSlotPool;
      let slotPool = eligibleSlotPool;
      if (slot.slot !== 'snack') {
        const different = slotPool.filter(t => !chosenMains.has(mainIdentity(t)));
        if (different.length) slotPool = different;
      }
      const lessRepeated = slotPool.filter(t => (templateCounts.get(t.id) || 0) < 2);
      if (lessRepeated.length) slotPool = lessRepeated;
      const differentDay = slotPool.filter(t => egyptianMealFamily(t, lib, p.region) !== previousSlotFamily.get(slot.id));
      if (differentDay.length) slotPool = differentDay;

      const rankCandidates = rankedPool => rankedPool.map((t) => {
          const key = t.id + "|" + Math.round(desired) + "|" + Math.round(protein) + (fitOpts.capProtein ? "|cap" : "") + (fitOpts.reduceCarbs ? "|rc" : "");
          if (!fitted.has(key))
            fitted.set(key, fitMeal(t, desired, protein, lib, fitOpts));
          const snapshot = fitted.get(key),
            v = snapshot.values;
          const family = t.items
            .map((i) => lib.ingredients[i.key])
            .find((i) => i.role === "protein")?.protein_group;
          const isAnimalMain = ["chicken", "meat", "fish"].includes(family);
          const isRegionalMenu = Boolean(t.component_definitions && t.dish_family);
          const slotCarbCap = dayTargets.carbs * slot.share;
          const glycemicPenalty = fitOpts.reduceCarbs && v.carbs != null
            ? Math.max(0, Number(v.carbs) - slotCarbCap * 1.1) / Math.max(10, slotCarbCap) * 2.5
            : 0;
          const renalPenalty = fitOpts.capProtein && v.protein != null
            ? Math.max(0, Number(v.protein) - protein * 1.12) / Math.max(10, protein) * 2.5
            : 0;
          const satPenalty = hasCholesterol
            ? Math.max(0, snapSatKcal(snapshot) - satLimitFor(desired)) / Math.max(10, satLimitFor(desired)) * 3.0
            : 0;
          const score =
            (Math.abs(Number(v.energy) - desired) / desired) * 5 +
            (Math.abs(protein - Number(v.protein)) / Math.max(1, protein)) *
              1.5 +
            glycemicPenalty +
            renalPenalty +
            satPenalty +
            (counts.get(egyptianMealFamily(t, lib, p.region)) || 0) * 0.35 +
            (chosen.has(t.id) ? 2 : 0) +
            (templateCounts.get(t.id) || 0) * 0.2 +
            (family
              ? (proteinCounts.get(family) || 0) * 0.03 +
                (chosenProteins.has(family) ? 0.6 : 0)
              : 0) -
            (slot.slot === "lunch" && isAnimalMain && (profile.goal === "muscle_gain" || desired >= 750) ? 0.25 : 0) -
            (isRegionalMenu ? 0.15 : 0) +
            noise(seed, day + slot.id + t.id) * 0.3;
          return { t, snapshot, score, family };
        })
        .filter(a=>{
          if (sodiumLimitMg != null) {
            const sod = a.snapshot.values.sodium;
            const usedSod = meals.reduce((s, m) => s + Number(m.snapshot.values.sodium || 0), 0);
            if (sod == null || usedSod + Number(sod) > sodiumLimitMg || Number(sod) > sodiumLimitMg * slot.share * 1.35) return false;
          }
          if (hasCholesterol) {
            const usedSat = meals.reduce((s, m) => s + snapSatKcal(m.snapshot), 0);
            if (usedSat + snapSatKcal(a.snapshot) > satLimitFor(dayTargets.energy) + 0.5) return false;
          }
          if (isPregnant) {
            const mealTunaG = (a.snapshot.ingredients || []).filter(i => i.key === 'tuna').reduce((s, i) => s + Number(i.grams || 0), 0);
            const usedTunaG = meals.flatMap(m => m.snapshot.ingredients || []).filter(i => i.key === 'tuna').reduce((s, i) => s + Number(i.grams || 0), 0);
            if (mealTunaG > 0 && (tunaMealsUsed >= CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_WEEKLY_SERVINGS || usedTunaG + mealTunaG > CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_DAILY_G)) return false;
          }
          if (p.diet === 'keto' || p.diet === 'low_carb') {
            const maxCarbs = p.diet === 'keto' ? 50 : 130;
            const usedCarbs = meals.reduce((s, m) => s + Number(m.snapshot.values.carbs || 0), 0);
            const remainingSlots = Math.max(0, slots.length - meals.length - 1);
            const reserveCarbs = remainingSlots * (p.diet === 'keto' ? 6 : 15);
            return usedCarbs + Number(a.snapshot.values.carbs || 0) <= maxCarbs - reserveCarbs;
          }
          return true;
        })
        .sort((a, b) => a.score - b.score || a.t.id.localeCompare(b.t.id));
      let candidates = [];
      const batchReuseTpl = batchPrepMode && !isBatchBlockStart && ['lunch', 'dinner'].includes(slot.slot)
        ? batchSlotTemplates.get(slot.id) || null
        : null;
      if (batchReuseTpl && (!isPregnant || tunaMealsUsed < CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_WEEKLY_SERVINGS || !batchReuseTpl.items.some(i => i.key === 'tuna'))) {
        candidates = rankCandidates([batchReuseTpl]);
      }
      if (!candidates.length) {
        candidates = rankCandidates(slotPool);
        // Variety is a preference within the strict pool. If it removes every
        // eligible option, reconsider that pool with the same nutrient checks.
        if (!candidates.length && slotPool.length < eligibleSlotPool.length) candidates = rankCandidates(eligibleSlotPool);
      }
      if(!candidates.length)throw planCoverageError('NO_CANDIDATE_WITHIN_DIET_LIMITS','No candidate satisfies diet rules for this meal slot with your current preferences.');
      const best = candidates[0];
      if (batchPrepMode && isBatchBlockStart && ['lunch', 'dinner'].includes(slot.slot)) {
        batchSlotTemplates.set(slot.id, best.t);
        const blockLen = batchBlockIndex === 0 ? 3 : 2;
        batchPrepBlocks.push({
          blockIndex: batchBlockIndex,
          slot: slot.slot,
          templateId: best.t.id,
          dishName: best.snapshot.name,
          daysCount: blockLen,
          startDate: addDays(startDate, day),
          endDate: addDays(startDate, day + blockLen - 1)
        });
      }
      if (isPregnant && (best.snapshot.ingredients || []).some(i => i.key === 'tuna')) tunaMealsUsed += 1;
      const mealFamily = egyptianMealFamily(best.t, lib, p.region);
      counts.set(mealFamily, (counts.get(mealFamily) || 0) + 1);
      chosen.add(best.t.id);
      templateCounts.set(best.t.id, (templateCounts.get(best.t.id) || 0) + 1);
      previousSlotFamily.set(slot.id, mealFamily);
      if (slot.slot !== "snack") chosenMains.add(mainIdentity(best.t));
      if (best.family) {
        chosenProteins.add(best.family);
        proteinCounts.set(
          best.family,
          (proteinCounts.get(best.family) || 0) + 1,
        );
      }
      meals.push({
        id: `${seed}-${day}-${slot.id}`,
        slot: slot.slot,
        ...(schedule.length?{time:schedule[meals.length]}:{}),
        slot_id: slot.id,
        target_energy: round(desired),
        target_protein: round(protein),
        snapshot: copy(best.snapshot),
      });
    }
    // Redistribute remaining energy/protein across main dishes within source bounds
    const mains = meals.filter(m => m.slot !== 'snack');
    if (mains.length) {
      for(let pass=0;pass<3;pass++) {
        const curSum = sumSnapshots(meals.map(m=>m.snapshot)).values;
        const gap = dayTargets.energy - Number(curSum.energy);
        const pGap = Math.max(0, dayTargets.protein - Number(curSum.protein));
        if(Math.abs(gap)<dayTargets.energy*.02 && pGap < 4)break;
        for(const m of mains) {
          const template=pool.find(t=>t.id===m.snapshot.template_id);
          if(!template)continue;
          const nextE = Math.max(1, Number(m.snapshot.values.energy) + gap / mains.length);
          const nextP = Math.max(m.target_protein, Number(m.snapshot.values.protein) + pGap / mains.length);
          const next=fitMeal(template, nextE, nextP, lib, fitOpts);
          const nextSnaps=meals.map(x=>x===m?next:x.snapshot);
          const nextSummary=sumSnapshots(nextSnaps);
          const dashOk = sodiumLimitMg == null || (nextSummary.values.sodium != null && Number(nextSummary.values.sodium)<=sodiumLimitMg);
          const cholOk = !hasCholesterol || nextSnaps.reduce((s,sn)=>s+snapSatKcal(sn),0)<=satLimitFor(Number(nextSummary.values.energy||dayTargets.energy))+0.5;
          const tunaOk = !isPregnant || nextSnaps.flatMap(sn=>sn.ingredients||[]).filter(i=>i.key==='tuna').reduce((s,i)=>s+Number(i.grams||0),0)<=CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_DAILY_G;
          const carbOk = !['keto','low_carb'].includes(p.diet) || Number(nextSummary.values.carbs ?? 0)<=(p.diet==='keto'?50:130);
          const currentSummary=sumSnapshots(meals.map(x=>x.snapshot));
          if(nutritionObjective(nextSummary,dayTargets)<nutritionObjective(currentSummary,dayTargets) && dashOk && cholOk && tunaOk && carbOk) {
            m.snapshot=next;
          }
        }
      }
    }
    // Improve toward the audit's tighter quality targets using the same strict pool.
    // These are search goals, not new acceptance rules for constrained libraries.
    // Allow bounded improvements across the whole day. Two swaps could reject
    // a feasible four-meal day before the remaining meals were repaired.
    const repairBudget=meals.length*2;
    for(let repair=0;repair<repairBudget&&needsNutritionImprovement(sumSnapshots(meals.map(m=>m.snapshot)),dayTargets);repair++){
      const currentSummary=sumSnapshots(meals.map(m=>m.snapshot));
      let best=null,current=repairObjective(currentSummary,dayTargets);
      const gap=Math.max(0,dayTargets.protein-Number(currentSummary.values.protein));
      for(const meal of meals)for(const template of pool.filter(t=>t.meal_slots.includes(meal.slot)&&(!isPregnant||tunaMealsUsed<CLINICAL_CONSTANTS.PREGNANCY_TUNA_MAX_WEEKLY_SERVINGS||!t.items.some(i=>i.key==='tuna'))))for(const desiredEnergy of new Set([meal.target_energy,Math.max(1,dayTargets.energy-Number(currentSummary.values.energy)+Number(meal.snapshot.values.energy))])){
        const desiredProtein=meal.target_protein+gap/Math.max(1,meals.length-1),key=template.id+'|repair|'+desiredEnergy+'|'+desiredProtein+(fitOpts.capProtein?'|cap':'')+(fitOpts.reduceCarbs?'|rc':'');
        if(!fitted.has(key))fitted.set(key,fitMeal(template,desiredEnergy,desiredProtein,lib,fitOpts));
        const snapshot=fitted.get(key),snapshots=meals.map(m=>m===meal?snapshot:m.snapshot);
        try{assertDietDay(snapshots,p.diet,dayTargets,profile);}catch{continue;}
        // Never trade an already valid day for a lower-scoring invalid one.
        if(!nutritionQualityIssues(currentSummary,dayTargets).length&&nutritionQualityIssues(sumSnapshots(snapshots),dayTargets).length)continue;
        const score=repairObjective(sumSnapshots(snapshots),dayTargets);
        if(score<current){best={meal,snapshot};current=score;}
      }
      if(!best)break;best.meal.snapshot=copy(best.snapshot);
    }
    assertDietDay(meals.map(m=>m.snapshot),p.diet,dayTargets,profile);
    const summary = sumSnapshots(meals.map((m) => m.snapshot));
    const quality=nutritionQualityIssues(summary,dayTargets);
    if(quality.length)throw planCoverageError('NUTRIENT_TARGETS_UNMET','Meal search could not meet daily calorie and protein tolerances under your constraints.');
    const checks = assessDay(summary, dayTargets);
    if (checks.length)
      warnings.push({ date: addDays(startDate, day), messages: checks });
    days.push({
      date: addDays(startDate, day),
      is_workout_day: isWorkoutDay,
      targets: copy(dayTargets),
      meals,
      summary,
    });
  }
  return {
    id: "plan-" + String(seed),
    start_date: startDate,
    profile: copy(profile),
    preferences: copy(p),
    targets,
    days,
    warnings,
    ...(batchPrepMode ? { batchPrepMode: true, batchPrepBlocks } : {}),
    engine_version: ENGINE_VERSION,
    data_version: lib.data_version,
    created_at: new Date().toISOString(),
  };
}
function nutritionObjective(summary,targets){
 const energy=Number(summary.values.energy),protein=Number(summary.values.protein);
 const conds=Array.isArray(targets.medical_conditions)?targets.medical_conditions:[];
 let penalty=Math.abs(energy-targets.energy)/targets.energy*5+Math.max(0,targets.protein-protein)/Math.max(1,targets.protein)*3;
 if(conds.includes('kidney')||conds.includes('gout')){
  const overProt=Math.max(0,protein-targets.protein*1.08)/Math.max(1,targets.protein);
  penalty+=overProt*(conds.includes('kidney')?8:4);
 }
 if(conds.some(d=>['diabetes','diabetes_t1','diabetes_t2','insulin_resistance','pcos'].includes(d))&&summary.values.carbs!=null){
  const carbs=Number(summary.values.carbs);
  const carbCeiling=Math.max(targets.carbs*1.12,(targets.energy*0.45)/4);
  if(Number.isFinite(carbs)&&carbs>carbCeiling){
   penalty+=((carbs-carbCeiling)/Math.max(1,targets.carbs))*4.5;
  }
 }
 return penalty;
}
function repairObjective(summary,targets){
 const e=Math.abs(Number(summary.values.energy)-targets.energy)/targets.energy,p=Number(summary.values.protein)/Math.max(1,targets.protein);
 const conds=Array.isArray(targets.medical_conditions)?targets.medical_conditions:[];
 const kidneyHard=conds.includes('kidney')?Math.max(0,p-1.15)*200:0;
 const glycemicHard=(conds.some(d=>['diabetes','diabetes_t1','diabetes_t2','insulin_resistance','pcos'].includes(d))&&summary.values.carbs!=null&&targets.carbs<=targets.energy*0.45/4)
  ?Math.max(0,(Number(summary.values.carbs)*4)/targets.energy-0.46)*120:0;
 return 10000*(Math.max(0,e-.15)+Math.max(0,.8-p))+100*(Math.max(0,e-.12)+Math.max(0,.85-p))+kidneyHard+glycemicHard+nutritionObjective(summary,targets);
}
function needsNutritionImprovement(summary,targets){
 const conds=Array.isArray(targets.medical_conditions)?targets.medical_conditions:[];
 const kidneyOver=conds.includes('kidney')&&Number(summary.values.protein)>targets.protein*1.15;
 const glycemicOver=conds.some(d=>['diabetes','diabetes_t1','diabetes_t2','insulin_resistance','pcos'].includes(d))&&summary.values.carbs!=null&&targets.carbs<=targets.energy*0.45/4&&Number(summary.values.carbs)>Math.max(targets.carbs*1.15,(targets.energy*0.47)/4);
 return nutritionQualityIssues(summary,targets).length>0||Number(summary.values.protein)<targets.protein*.85||Math.abs(Number(summary.values.energy)-targets.energy)>targets.energy*.12||kidneyOver||glycemicOver;
}
export function nutritionQualityIssues(summary,targets){
 const messages=[],energy=Number(summary.values.energy),protein=Number(summary.values.protein);
 if(summary.values.energy==null||!Number.isFinite(energy)||Math.abs(energy-targets.energy)>targets.energy*.15)messages.push('السعرات أبعد من 15% عن الهدف.');
 if(summary.values.protein==null||!Number.isFinite(protein)||protein<targets.protein*.8)messages.push('البروتين أقل من 80% من الهدف.');
 return messages;
}
export function assessDay(summary, targets) {
  const out = [],
    v = summary.values;
  if (v.energy == null) out.push("بعض السعرات غير متوفرة.");
  else if (Math.abs(Number(v.energy) - targets.energy) > targets.energy * 0.08)
    out.push(
      `السعرات المخططة تختلف عن الهدف بأكثر من 8% (${Math.round(Number(v.energy) - targets.energy)} kcal).`,
    );
  if (v.protein == null || Number(v.protein) < targets.protein * 0.9)
    out.push("البروتين أقل من الهدف؛ جرّب مصدرًا إضافيًا أو بدّل وجبة.");
  if (summary.fruit_veg_g < 400)
    out.push("الخضار والفاكهة المخططة أقل من 400 جرام.");
  if (v.fiber == null) out.push("إجمالي الألياف غير مكتمل في المراجع.");
  else if (Number(v.fiber) < 25)
    out.push("الألياف أقل من 25 جرامًا؛ جرّب بقولًا أو حبوبًا كاملة.");
  if (v.sodium != null && Number(v.sodium) > 2000)
    out.push("الصوديوم المرجعي أعلى من 2000 mg قبل أي ملح تضيفه.");
  if (
    v.saturated != null &&
    v.energy != null &&
    Number(v.saturated) * 9 > Number(v.energy) * 0.1
  )
    out.push("نسبة الدهون المشبعة مرتفعة مقارنة بالهدف الاسترشادي.");
  if (v.carbs == null)
    out.push(
      "تعريفات الكربوهيدرات مختلفة أو غير متوفرة؛ لم نجمعها كأنها متكافئة.",
    );
  return out;
}
export function alternatives(meal, prefs, lib, limit = 8, profile = null, accept = () => true) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 100)
    throw apiError("INVALID_ALTERNATIVE_LIMIT", "Alternative limit must be an integer between 0 and 100.", { status: 400 });
  if (limit === 0) return [];
  if (
    meal.snapshot.values.energy == null ||
    meal.snapshot.values.protein == null
  )
    return [];
  const p = validatePreferences(prefs, lib),
    e = Number(meal.snapshot.values.energy),
    protein = Number(meal.snapshot.values.protein);
  const seen = new Set([ingredientIdentity(meal.snapshot)]);
  const ranked = preparePool(lib, p, profile)
    .filter(
      (t) =>
        t.meal_slots.includes(meal.slot) && t.id !== meal.snapshot.template_id,
    )
    .map((t) => {
      const snapshot = fitMeal(t, e, protein, lib);
      return {
        snapshot,
        energy_delta: round(Number(snapshot.values.energy) - e),
        protein_delta: round(Number(snapshot.values.protein) - protein),
      };
    })
    .sort(
      (a, b) =>
        Math.abs(a.energy_delta) / Math.max(e, 1) +
        Math.abs(a.protein_delta) / Math.max(protein, 10) -
        Math.abs(b.energy_delta) / Math.max(e, 1) -
        Math.abs(b.protein_delta) / Math.max(protein, 10),
    )
    ;
  // Apply day-level rules before limiting results, stopping after enough valid choices.
  const result = [];
  for (const alternative of ranked) {
    const key = ingredientIdentity(alternative.snapshot);
    if (seen.has(key) || !accept(alternative)) continue;
    seen.add(key);
    result.push(alternative);
    if (result.length === limit) break;
  }
  return result;
}
// Recalculate from frozen reference observations; never rewrite actual-intake history.
export function simplifyPlannedSnapshot(snapshot){
 if(snapshot.components?.length){
  const components=snapshot.components.map(simplifyPlannedSnapshot),totals=sumSnapshots(components);
  return {...copy(snapshot),components,ingredients:components.flatMap(s=>copy(s.ingredients)),values:totals.values,fruit_veg_g:totals.fruit_veg_g};
 }
 if(!snapshot.ingredients?.length||snapshot.source_quantity||snapshot.quantity_basis||snapshot.ingredients.some(i=>i.grams==null||!i.values_per_100g))return copy(snapshot);
 const ingredients=snapshot.ingredients.map(i=>({...copy(i),grams:roundedHouseholdGrams(i)}));
 const result=aggregate(ingredients.map(i=>({grams:i.grams,values:i.values_per_100g,factors:Object.fromEntries(METRICS.map(k=>[k,'1']))})),METRICS);
 const values=Object.fromEntries(METRICS.map(k=>[k,result.nutrients[k].total]));
 if(new Set(ingredients.map(i=>i.carb_id)).size>1)values.carbs=null;
 return {...copy(snapshot),ingredients,values,fruit_veg_g:ingredients.filter(i=>['veg','fruit'].includes(i.role)).reduce((n,i)=>n+Number(i.grams),0)};
}
export function scaleSnapshot(snapshot, multiplier) {
  const q = finite(multiplier, 0.1, 4, "quantity");
  const values = Object.fromEntries(
    METRICS.map((k) => [
      k,
      snapshot.values[k] == null
        ? null
        : product(snapshot.values[k], String(q)),
    ]),
  );
  const result = {
    ...copy(snapshot),
    values,
    fruit_veg_g: round((snapshot.fruit_veg_g || 0) * q),
    ingredients: (snapshot.ingredients || []).map((i) => ({
      ...copy(i),
      grams: i.grams == null ? null : product(i.grams, String(q)),
      ...(i.quantity == null
        ? {}
        : { quantity: product(i.quantity, String(q)) }),
    })),
    portion_multiplier: Number(
      product(snapshot.portion_multiplier ?? "1", String(q)),
    ),
  };
  if (snapshot.components)
    result.components = snapshot.components.map((s) => scaleSnapshot(s, q));
  if (snapshot.source_quantity)
    result.source_quantity = {
      ...copy(snapshot.source_quantity),
      quantity: product(snapshot.source_quantity.quantity, String(q)),
      scale: product(snapshot.source_quantity.scale, String(q)),
    };
  if (result.quantity_basis?.quantity != null)
    result.quantity_basis.quantity = product(
      result.quantity_basis.quantity,
      String(q),
    );
  if (result.quantity_basis?.type === "ingredient_formulation") {
    result.quantity_basis.multiplier = product(
      result.quantity_basis.multiplier,
      String(q),
    );
    result.quantity_basis.input_mass_g = product(
      result.quantity_basis.input_mass_g,
      String(q),
    );
    result.quantity_basis.ingredients = result.quantity_basis.ingredients.map(
      (i) => ({ ...i, allocated_grams: product(i.allocated_grams, String(q)) }),
    );
  }
  return result;
}
export function snapshotFood(
  food,
  detail,
  quantity,
  unit = "grams",
  portionId = null,
  acknowledged = false,
) {
  if (
    (detail?.food_id && detail.food_id !== food.id) ||
    (detail?.id && detail.id !== food.id)
  )
    throw apiError("FOOD_DETAIL_MISMATCH", "Food detail metadata does not match the requested food ID.", { status: 400 });
  const q = finite(quantity, 0.001, 100000, "quantity");
  let grams = null,
    scale,
    raw,
    quality =
      food.status === "estimated" ? "calculated_estimate" : "reference_food";
  if (food.status === "estimated") {
    if (!acknowledged)
      throw apiError("FOOD_APPROXIMATE_CONFIRMATION_REQUIRED", "Approximate recipe/proxy food requires explicit acknowledgment.", { status: 400 });
    if (unit !== "reference")
      throw apiError("RECIPE_WEIGHT_MISSING", "Approximate recipe lacks verified cooked final weight; use reference servings.", { status: 400 });
    scale = String(q);
  } else if (food.basis === "reference_serving") {
    if (unit !== "reference")
      throw apiError("PORTION_WEIGHT_UNKNOWN", "Serving gram weight is unknown; use source reference serving count.", { status: 400 });
    scale = String(q);
  } else {
    if (unit === "grams") grams = q;
    else if (unit === "portion") {
      const p = detail.portions.find((p) => p.id === portionId);
      if (!p || p.grams == null)
        throw apiError("PORTION_GRAMS_MISSING", "Selected portion has no verified gram weight.", { status: 400 });
      grams = product(p.grams, String(q));
    } else if (unit === "ml") {
      if (!food.volume_evidence)
        throw apiError("VOLUME_CONVERSION_UNAVAILABLE", "No verified volume-to-gram conversion exists for this food.", { status: 400 });
      grams = volumeGrams(String(q), food.volume_evidence);
    } else throw apiError("INVALID_QUANTITY_UNIT", "Quantity unit must be grams, portion, ml, or reference.", { status: 400 });
    if (grams > 100000 || grams <= 0)
      throw apiError("QUANTITY_OUT_OF_RANGE", "Calculated food weight must be between 0 and 100000 grams.", { status: 400 });
    scale = product(String(grams), "0.01");
  }
  if (food.status === "estimated") {
    const r = estimateTotals(detail, String(q));
    const ids = {
      energy: "fdc:1008",
      protein: "fdc:1003",
      fat: "fdc:1004",
      carbs: "fdc:1005",
      fiber: "fdc:1079",
      saturated: "fdc:1258",
      sodium: "fdc:1093",
      sugars: "fdc:2000",
    };
    return {
      name: food.name,
      template_id: null,
      quality,
      is_approximate: true,
      values: Object.fromEntries(
        METRICS.map((k) => [k, r.nutrients[ids[k]] ?? null]),
      ),
      carb_ids: [food.carb_id],
      fruit_veg_g: 0,
      notes: "نموذج تقريبي للمقادير؛ وزن الناتج النهائي غير موثق.",
      quantity_basis: r.quantity_basis,
      ingredients: [
        {
          food_id: food.id,
          name: food.name,
          grams: null,
          quantity: String(q),
          unit: "reference",
          source: food.source,
        },
      ],
      data_version: detail.data_version || null,
    };
  }
  const obs = Object.fromEntries(
    (detail.nutrients || []).map((n) => [n.id, n]),
  );
  const micronutrientIds =
    food.source === "cofid-2021"
      ? {
          fiber: "cofid:AOACFIB",
          saturated: "cofid:SATFOD",
          sodium: "cofid:NA",
          sugars: "cofid:TOTSUG",
        }
      : {
          fiber: "fdc:1079",
          saturated: "fdc:1258",
          sodium: "fdc:1093",
          sugars: "fdc:2000",
        };
  const values = {
    ...Object.fromEntries(
      ["energy", "protein", "fat", "carbs"].map((k, i) => [
        k,
        food.macros[i] == null ? null : product(food.macros[i], scale),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(micronutrientIds).map(([k, n]) => [
        k,
        obs[n]?.value == null ? null : product(obs[n].value, scale),
      ]),
    ),
  };
  return {
    name: food.name.slice(0, 120),
    template_id: null,
    quality,
    data_version: detail.data_version || null,
    values,
    nutrient_ids: micronutrientIds,
    metric_definitions: {
      fiber: food.source === "cofid-2021" ? "cofid:AOACFIB" : "fdc:fiber",
      sugars: food.source === "cofid-2021" ? "cofid:TOTSUG" : "fdc:sugars",
    },
    carb_ids: [food.carb_id],
    fruit_veg_g: ["fruit", "veg"].includes(food.planning?.role)
      ? Number(grams || 0)
      : 0,
    budget_tier: food.planning?.budget_tier || "medium",
    notes: food.basis_label,
    ingredients: [
      {
        food_id: food.id,
        name: food.name,
        grams: grams == null ? null : String(grams),
        quantity: String(q),
        unit,
        portion_id: portionId,
        source: food.source,
        state: food.state,
        role: food.planning?.role,
        reference: {
          profile_id: detail.profile_id,
          sha256: detail.sha256,
          source_external_id: food.external_id,
        },
        quantity_basis: food.quantity_basis,
      },
    ],
    source_quantity: {
      quantity: String(q),
      unit,
      portion_id: portionId,
      scale,
    },
    is_approximate: food.status === "estimated",
  };
}
export function customFood(input, id) {
  const name = String(input.name || "").trim();
  if (!name || name.length > 120)
    throw apiError("INVALID_CUSTOM_FOOD_NAME", "Custom food name must be non-empty and at most 120 characters.", { status: 400 });
  if (!["per100g", "serving"].includes(input.basis))
    throw apiError("INVALID_NUTRITION_BASIS", "Invalid nutrition declaration basis.", { status: 400 });
  const cap = input.basis === "per100g" ? 900 : 5000;
  const values = {
    energy: String(finite(input.energy, 0, cap, "energy")),
    protein: String(
      finite(
        input.protein,
        0,
        input.basis === "per100g" ? 100 : 500,
        "protein",
      ),
    ),
    fat: String(
      finite(input.fat, 0, input.basis === "per100g" ? 100 : 500, "fat"),
    ),
    carbs: String(
      finite(
        input.carbs,
        0,
        input.basis === "per100g" ? 100 : 500,
        "carbs",
      ),
    ),
    fiber: null,
    saturated: null,
    sodium: null,
    sugars: null,
  };
  if (
    input.basis === "per100g" &&
    Number(values.protein) + Number(values.fat) + Number(values.carbs) > 110
  )
    throw apiError("MACROS_INCONSISTENT_WITH_100G", "Sum of macronutrients per 100g exceeds 100g.", { status: 400 });
  if (!["fdc:1005", "cofid:CHO", "user:unknown"].includes(input.carb_id))
    throw apiError("INVALID_CARB_DEFINITION", "Specify a valid carbohydrate definition.", { status: 400 });
  return {
    id,
    name,
    basis: input.basis,
    basis_label:
      input.basis === "per100g"
        ? "100 جرام"
        : String(input.serving_label || "حصة أدخلتها")
            .trim()
            .slice(0, 60),
    carb_id: input.carb_id,
    values,
    source: "user_input",
    quality: "user_entered_unverified",
    created_at: new Date().toISOString(),
  };
}
export function customSnapshot(food, quantity) {
  const q = finite(quantity, 0.001, 100000, "quantity"),
    scale = food.basis === "per100g" ? product(String(q), "0.01") : String(q);
  if (scale > 1000)
    throw apiError("QUANTITY_OUT_OF_RANGE", "Calculated food weight must be between 0 and 100000 grams.", { status: 400 });
  return {
    name: food.name,
    template_id: null,
    quality: "user_entered_unverified",
    is_approximate: true,
    values: Object.fromEntries(
      METRICS.map((k) => [
        k,
        food.values[k] == null ? null : product(food.values[k], String(scale)),
      ]),
    ),
    carb_ids: [food.carb_id],
    fruit_veg_g: 0,
    notes: "بيانات أدخلها المستخدم؛ لا تُنشر في قاعدة الأغذية المرجعية.",
    ingredients: [
      {
        food_id: food.id,
        name: food.name,
        grams: food.basis === "per100g" ? String(q) : null,
        quantity: String(q),
        unit: food.basis,
        serving_label: food.basis_label,
        source: "user_input",
      },
    ],
  };
}
export function combineSnapshots(name, snapshots) {
  if (!name?.trim() || !snapshots.length)
    throw apiError("MEAL_COMPONENTS_REQUIRED", "Provide a custom meal name and at least one ingredient.", { status: 400 });
  if (snapshots.reduce((n, s) => n + (s.ingredients?.length || 0), 0) > 100)
    throw apiError("MAX_INGREDIENTS_EXCEEDED", "A custom meal cannot exceed 100 ingredients.", { status: 400 });
  const s = sumSnapshots(snapshots);
  return {
    name: name.trim().slice(0, 120),
    template_id: null,
    quality: snapshots.some((x) => x.is_approximate)
      ? "mixed_with_estimates"
      : "user_assembly_from_references",
    values: s.values,
    carb_ids: s.carb_ids,
    metric_definitions: s.metric_definitions,
    fruit_veg_g: s.fruit_veg_g,
    ingredients: snapshots.flatMap((x) => copy(x.ingredients || [])),
    is_approximate: snapshots.some((x) => x.is_approximate),
    components: copy(snapshots),
    notes:
      "المجموع للمكونات والكميات التي اخترتها، وليس ملفًا غذائيًا جديدًا معتمدًا.",
  };
}
export function groceryList(plan, mode = "whole", diary = [], todayDate = null) {
  const done = new Set(diary.map((e) => e.mealId || e.plan_meal_id).filter(Boolean)),
    map = new Map();
  let days = plan.days || [];
  if (mode === "3") {
    const startIdx = todayDate ? Math.max(0, days.findIndex((d) => d.date >= todayDate)) : 0;
    days = days.slice(startIdx, startIdx + 3);
  }
  for (const day of days)
    for (const m of day.meals) {
      if (mode === "remaining" && (done.has(m.id) || (todayDate && day.date < todayDate))) continue;
      for (const i of m.snapshot.ingredients || []) {
        const key =
          (i.key || i.food_id) +
          "|" +
          i.state +
          "|" +
          (i.grams == null ? i.unit : "grams");
        const row = map.get(key) || {
          ingredientKey: i.key || i.food_id,
          food_id: i.food_id,
          name: i.name,
          state: i.state,
          grams: i.grams == null ? null : 0,
          quantity: i.grams == null ? 0 : null,
          unit: i.grams == null ? i.unit : "grams",
          serving_label: i.serving_label,
          mealRefs: [],
          notes:
            "Cooked weights represent ready-to-eat portions, not raw purchase weight, and are not converted without a documented yield factor.",
        };
        if (!row.mealRefs.includes(m.id)) row.mealRefs.push(m.id);
        const field = i.grams != null ? "grams" : "quantity";
        row[field] = referenceTotals(
          [
            { scale: "1", values: { amount: String(row[field]) } },
            { scale: "1", values: { amount: String(i[field]) } },
          ],
          ["amount"],
        ).nutrients.amount.total;
        map.set(key, row);
      }
    }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
}
