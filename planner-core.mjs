import {DIETS,FIXED_DIET_MEALS,dietIngredientAllowed,medicalContraindicatedKeys,isDietUnsafeForProfile,dietTemplates,assertDietDay,fastingTimes} from './diet-patterns.mjs';
import {sportsEnergy} from './sports.mjs';
import {practicalParts,roundedHouseholdGrams} from './planner-household.mjs';
import { aggregate, referenceTotals, estimateTotals } from "./calculator.mjs";
import { volumeGrams } from "./portions.mjs";
import { EXCLUSIONS, expandedKeys } from "./planner-exclusions.mjs";
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

const finite = (x, min, max, label) => {
  if (
    (typeof x !== "number" && typeof x !== "string") ||
    String(x).trim() === "" ||
    !Number.isFinite(Number(x)) ||
    Number(x) < min ||
    Number(x) > max
  )
    throw Error(label + " خارج النطاق المقبول");
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
  const maxAge = input.allowSenior ? 90 : 70;
  const weight = finite(input.weight, 35, 250, "الوزن"),
    height = finite(input.height, 120, 230, "الطول"),
    age = finite(input.age, 18, maxAge, "العمر");
  if (!Number.isInteger(age)) throw Error("العمر يكون عدد سنوات كاملًا");
  if (
    !["male", "female"].includes(input.sex) ||
    !Object.hasOwn(ACTIVITY, input.activity) ||
    !Object.hasOwn(GOALS, input.goal)
  )
    throw Error("راجع النوع ومستوى النشاط والهدف");
  if (input.healthNeeds && !input.maternalStatus && (!Array.isArray(input.diseases) || !input.diseases.length))
    throw Error(
      "التخطيط التلقائي غير متاح للحمل والرضاعة أو الحساسية الغذائية أو الحالات التي تحتاج تغذية علاجية. استخدم خطة مختص؛ تصفح الأطعمة متاح.",
    );
  const bmi = weight / (height / 100) ** 2;
  if (bmi < 12.5 || bmi > 65)
    throw Error(
      "الوزن والطول المدخلان خارج النطاق الفسيولوجي المقبول؛ راجع الأرقام المدخلة.",
    );
  const trainingDays = finite(
    input.trainingDays ?? input.resistance ?? 0,
    0,
    7,
    "أيام التمرين أسبوعيًا",
  );
  if (!Number.isInteger(trainingDays)) throw Error("أيام التمرين عدد صحيح");
  if (input.goal === "muscle_gain" && trainingDays === 0)
    throw Error(
      "لهدف زيادة الكتلة العضلية اختار يوم تمرين واحدًا على الأقل أسبوعيًا.",
    );

  const diseases = new Set(Array.isArray(input.diseases) ? input.diseases : []);
  const maternalStatus = input.maternalStatus || "none";
  const notes = [];

  let ree =
    10 * weight + 6.25 * height - 5 * age + (input.sex === "male" ? 5 : -161);

  const baseline = ree * ACTIVITY[input.activity],
    exercise = sportsEnergy(input, weight, baseline),
    tdee = baseline + exercise.daily_extra;

  const pace = input.goalPace || 'moderate';
  if(!['slow','moderate','fast'].includes(pace))throw Error('سرعة الهدف غير صالحة');
  let change = 0;
  if(input.goal === 'lose')change=-Math.min(tdee*{slow:.1,moderate:.15,fast:.2}[pace],500);
  else if(input.goal === 'muscle_gain'&&(input.recomposition||Number(input.targetWeight)===weight)){change=0;notes.push('هدف بناء العضلات مع نفس الوزن يبدأ بسعرات التثبيت وتمارين المقاومة؛ نراجع الاتجاه والأداء من متابعتك.');}
  else if(input.goal === 'muscle_gain')change=Math.min(tdee*{slow:.05,moderate:.08,fast:.1}[pace],250);
  else if(input.goal === 'gain')change=Math.min(tdee*{slow:.08,moderate:.12,fast:.15}[pace],400);
  notes.push('سرعة الهدف تحدد عجزًا أو فائضًا مبدئيًا محدودًا؛ معدل تغير الوزن الفعلي بيتراجع من قياساتك، ومش ضمان لتاريخ وصول.');

  // Maternal adjustments
  if (maternalStatus === "pregnant_t1") {
    change = Math.max(0, change) + 50;
    notes.push("تم ضبط الاحتياج للثلث الأول من الحمل (منع عجز السعرات).");
  } else if (maternalStatus === "pregnant_t2" || maternalStatus === "pregnant") {
    change = Math.max(0, change) + 340;
    notes.push("تمت إضافة +340 سعرة للثلث الثاني من الحمل لدعم نمو الجنين.");
  } else if (maternalStatus === "pregnant_t3") {
    change = Math.max(0, change) + 450;
    notes.push("تمت إضافة +450 سعرة للثلث الثالث من الحمل.");
  } else if (maternalStatus === "breastfeeding") {
    change = input.goal === "lose" ? Math.max(-200, change + 300) : change + 480;
    notes.push("تمت مراعاة سعرات الرضاعة الطبيعية للحفاظ على إدرار الحليب.");
  }

  let energy = Math.round((tdee + change) / 10) * 10;
  const minEnergyFloor = maternalStatus !== "none" ? 1600 : (input.sex === "female" && input.goal === "lose" && tdee < 1750 ? 1200 : 1400);
  if (energy < minEnergyFloor) {
    energy = minEnergyFloor;
    notes.push(
      `رُفع الهدف إلى الحد الأدنى للتخطيط الآلي (${minEnergyFloor} kcal) وقد تحتاج مراجعة فردية لتقييم كفاية العناصر الغذائية.`,
    );
  }
  if (energy > 4200)
    throw Error(
      "الاحتياج خارج نطاق المكتبة الحالية (1200–4200 kcal). نحتاج خطة فردية بأحجام وتوزيع مناسبين.",
    );

  if (bmi < 18.5) {
    notes.push("مؤشر كتلة الجسم أقل من 18.5 (نحافة): ركّز على الوجبات عالية الكثافة الغذائية وتوزيع السعرات تدريجيًا.");
  } else if (bmi > 30) {
    notes.push("تم حساب البروتين على أساس الوزن المعدّل لتجنب المبالغة في الحصص مع الحفاظ على الكتلة العضلية.");
  }

  const effectiveWeight =
    bmi > 30
      ? 24 * (height / 100) ** 2 + 0.35 * (weight - 24 * (height / 100) ** 2)
      : weight;

  let factor =
    trainingDays > 0
      ? input.goal === "maintain"
        ? 1.4
        : 1.6
      : input.goal === "lose"
        ? 1.4
        : input.goal === "gain"
          ? 1.3
          : 1;

  if (maternalStatus !== "none") factor = Math.max(factor, 1.4);
  if (diseases.has("gout")) {
    factor = Math.min(factor, 1.4);
    notes.push("تم اعتدال البروتين واستبعاد اللحوم الحمراء العالية بالبيورين لمراعاة النقرس.");
  }
  if (diseases.has("ibs")) {
    notes.push("تم استبعاد البقوليات الثقيلة والكرنب والبصل النيء لمراعاة القولون العصبي.");
  }
  if (diseases.has("hypertension")) {
    notes.push("تم تفعيل سقف الصوديوم المنخفض واستبعاد الأجبان عالية الملوحة لمراعاة ضغط الدم.");
  }

  let fatShare = diseases.has("cholesterol") ? 0.25 : 0.3;
  let proteinGrams = round(effectiveWeight * factor);
  let fatGrams = round((energy * fatShare) / 9);
  let carbGrams = round(Math.max(0, energy - proteinGrams * 4 - fatGrams * 9) / 4);

  if (diseases.has("diabetes") || diseases.has("insulin_resistance") || diseases.has("pcos")) {
    const maxCarbEnergy = energy * 0.38;
    if (carbGrams * 4 > maxCarbEnergy) {
      carbGrams = round(maxCarbEnergy / 4);
      const remaining = Math.max(0, energy - carbGrams * 4);
      proteinGrams = round(Math.min(effectiveWeight * 1.8, remaining * 0.45 / 4));
      fatGrams = round(Math.max(0, energy - carbGrams * 4 - proteinGrams * 4) / 9);
      notes.push("ضبطنا نسبة الكربوهيدرات إلى نحو 38% من السعرات كبداية للتخطيط؛ النسبة لا تثبت المؤشر الجلايسيمي للوجبات ولا تغني عن خطة مختص.");
    }
  }

  if (input.goal === "gain" && trainingDays === 0)
    notes.push(
      "زيادة السعرات وحدها لا تعني زيادة عضلات؛ تمارين المقاومة مهمة لهذا الهدف.",
    );
  if (input.goal === "muscle_gain")
    notes.push(
      "هدف بناء العضلات تقديري: فائض معتدل وبروتين 1.6 جرام/كجم مع المقاومة. راقب الوزن والأداء؛ الزيادة ليست ضمانًا لكتلة عضلية صافية.",
    );
  const targetWeightNum =
    input.targetWeight != null && String(input.targetWeight).trim() !== ""
      ? finite(input.targetWeight, 35, 250, "الوزن المستهدف")
      : null;
  const actualChange = round(energy - tdee);
  const targetDeltaKg =
    targetWeightNum != null ? round(targetWeightNum - weight, 1) : null;
  let forecast = null;
  if (targetDeltaKg != null) {
    if (Math.abs(targetDeltaKg) < 0.2 || actualChange === 0) {
      forecast = {
        target_weight_kg: targetWeightNum,
        target_delta_kg: targetDeltaKg,
        daily_energy_delta: actualChange,
        weekly_rate_kg: 0,
        estimated_weeks_min: 0,
        estimated_weeks_max: 0,
        basis: "ثبات الوزن أو إعادة تشكيل الجسم حول الوزن الحالي.",
      };
    } else {
      const weeklyKg = round((Math.abs(actualChange) * 7) / 7700, 2);
      const centerWeeks = Math.max(1, Math.ceil(Math.abs(targetDeltaKg) / Math.max(0.1, weeklyKg)));
      forecast = {
        target_weight_kg: targetWeightNum,
        target_delta_kg: targetDeltaKg,
        daily_energy_delta: actualChange,
        weekly_rate_kg: actualChange < 0 ? -weeklyKg : weeklyKg,
        estimated_weeks_min: Math.max(1, Math.floor(centerWeeks * 0.85)),
        estimated_weeks_max: Math.ceil(centerWeeks * 1.25),
        basis: "تقدير مبدئي مبني على فرق السعرات الفعلي بعد تطبيق حدود الأمان؛ يُحدّث من اتجاه الوزن الفعلي.",
      };
    }
  }

  return {
    training_days: trainingDays,
    ...(input.exerciseMode || input.sports?.length ? {exercise, baseline_tdee:round(baseline)} : {}),
    training_calorie_scope:
      exercise.mode === "separate" ? "النشاط اليومي بدون التمرين، وتضاف زيادة تقديرية من الرياضات موزعة على الأسبوع بعد خصم الطاقة الأساسية لنفس الوقت." : "النشاط المختار يشمل تمرينك؛ لا نضيف سعرات التمرين مرة ثانية.",
    energy,
    protein: proteinGrams,
    protein_factor: factor,
    effective_weight: round(effectiveWeight, 2),
    max_protein_factor: diseases.has("gout") ? 1.4 : 1.8,
    fat: fatGrams,
    carbs: carbGrams,
    carb_target_scope:
      "تقسيم استرشادي للطاقة؛ القيم الغذائية المرجعية لا تُعاد اشتقاقها بمعادلة 4/4/9",
    bmi: round(bmi),
    ree: round(ree),
    tdee: round(tdee),
    activity_factor: ACTIVITY[input.activity],
    energy_change: actualChange,
    goal_pace: pace,
    ...(forecast ? { forecast } : {}),
    ...(maternalStatus !== "none" ? { maternal_status: maternalStatus } : {}),
    ...(diseases.size ? { medical_conditions: [...diseases] } : {}),
    notes,
    method:
      "Mifflin–St Jeor 1990; activity multipliers and moderate goal offsets are product heuristics, not measured expenditure",
    sources: [
      "https://pubmed.ncbi.nlm.nih.gov/2305711/",
      "https://pubmed.ncbi.nlm.nih.gov/28642676/",
    ],
  };
}
export function validatePreferences(p, library) {
  const diet = p.diet ?? "balanced";
  if (!Object.hasOwn(DIETS, diet)) throw Error("اختار نظامًا غذائيًا متاحًا");
  const mealsCount = Number(p.meals ?? (FIXED_DIET_MEALS[diet]?.meals || 4));
  if (
    !["low", "medium", "high"].includes(p.budget) ||
    ![2, 3, 4, 5].includes(mealsCount)
  )
    throw Error("راجع الميزانية وعدد الوجبات");
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
    throw Error("اختار مصدر بروتين رئيسي واحدًا على الأقل");
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
    excludedGroups.some((id) => !EXCLUSIONS.some((g) => g.id === id))
  )
    throw Error("استبعاد المكونات غير صحيح");
  const region = p.region ?? "egypt";
  if (!Object.hasOwn(REGIONS, region))
    throw Error("اختار منطقة من القائمة المتاحة");
  const result = {
    ...p,
    diet,
    region,
    meals: mealsCount,
    ...(diet === "intermittent_fasting"
      ? {
          fasting: p.fasting && p.fasting !== "none" ? p.fasting : "16",
          eatingStart: p.eatingStart || "12:00",
        }
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
function preparePool(lib, prefs, profile = null) {
  const pool = new Map();
  for (const template of planningTemplates(lib, prefs)) {
    const t = prepareTemplate(template, lib, prefs, profile);
    if (!t) continue;
    const key = JSON.stringify(t.items.map((i) => [i.key, Number(i.grams)]).sort());
    const previous = pool.get(key);
    if (previous) previous.meal_slots = [...new Set([...previous.meal_slots, ...t.meal_slots])];
    else pool.set(key, t);
  }
  return [...pool.values()];
}
export function planningTemplates(lib, prefs) {
  const region = prefs.region ?? 'egypt';
  let base;
  if (region === 'egypt') {
    base = egyptianMenus(lib);
  } else if (['gulf', 'levant', 'maghreb'].includes(region)) {
    const regMenus = lib.regional_menus?.[region] || regionalMenus(lib, region);
    base = [...regMenus, ...lib.templates.filter(t => regionAllows(t, region))];
  } else {
    base = lib.templates;
  }
  return dietTemplates(base, lib, prefs.diet ?? 'balanced', region);
}
function ingredientIdentity(snapshot) {
  if (!snapshot.ingredients?.length) return null;
  return JSON.stringify([...new Set(snapshot.ingredients.map((i) => i.food_id))].sort());
}
export const MIN_MEAL_CHOICES = 3;
export function mealAvailability(prefs, lib) {
  const p = validatePreferences(prefs, lib);
  const pool = preparePool(lib, p);
  const choices = {};
  for (const slot of new Set(daySlots(p.meals, p.diet).map((s) => s.slot))) {
    choices[slot] = new Set(pool.filter((t) => t.meal_slots.includes(slot))
      .map((t) => JSON.stringify([...new Set(t.items.map((i) => lib.ingredients[i.key].food_id))].sort()))).size;
  }
  return {minimum:MIN_MEAL_CHOICES, choices, sufficient:Object.values(choices).every((n) => n >= MIN_MEAL_CHOICES)};
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
    quality: "planned_assembly_from_reference_ingredients",
    data_version: lib.data_version,
    engine_version: ENGINE_VERSION,
    ...(template.editorial_policy_version ? { editorial_policy_version: template.editorial_policy_version } : {}),
    notes: template.notes,
    carb_ids: totals.carb_ids,
    values: totals.values,
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
      const child=snapshotTemplate({id:null,name:c.name,regions:template.regions,budget_tier:template.budget_tier,notes:template.notes},selected,lib);
      return {...child,component_role:c.role};
    }).filter(Boolean);
  }
  return result;
}
export function fitMeal(t, desiredEnergy, desiredProtein, lib) {
  const isKeto = Boolean(t.id && String(t.id).startsWith("keto-"));
  const isPart = Boolean(t.id && String(t.id).startsWith("part-"));
  const isMainMeal = !isPart && (!t.meal_slots || t.meal_slots.some(s => ["breakfast", "lunch", "dinner"].includes(s)));
  const lower = (p) => {
    const baseMin = Math.max(lib.ingredients[p.key].min_g, p.min_g || 0);
    const i = lib.ingredients[p.key];
    // Protect complete animal protein in main meals so rice/veg protein never shrinks chicken/meat/fish to tiny portions
    if (isMainMeal && i.role === "protein" && ["chicken", "meat", "fish"].includes(i.protein_group) && desiredProtein >= 22) {
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
    if (Number(v.protein) > desiredProtein * 1.15) {
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
      .filter((p) =>
        isKeto
          ? ["fat", "protein", "veg"].includes(lib.ingredients[p.key].role)
          : ["carb", "fat", "fruit", "protein"].includes(lib.ingredients[p.key].role),
      )
      .sort((a, b) => {
        const role = isKeto
          ? { fat: 0, protein: 1, veg: 2 }
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
    throw Error("تاريخ الأسبوع غير صحيح");
  return date;
}
export function addDays(date, offset) {
  validDate(date);
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
export function makeWeek(profile, prefs, lib, startDate, seed = "1") {
  const targets = estimateNeeds(profile),
    p = validatePreferences(prefs, lib),
    slots = daySlots(p.meals, p.diet);
  if(p.diet==='high_protein'){
    const weightBasis=targets.effective_weight??Number(profile.weight);
    const maxFactor=targets.max_protein_factor??1.8;
    const resolvedFactor=Math.min(maxFactor,Math.max(targets.protein_factor||1.6,1.6));
    targets.protein=round(weightBasis*resolvedFactor);
    targets.protein_factor=resolvedFactor;
    targets.carbs=round(Math.max(0,targets.energy-targets.protein*4-targets.fat*9)/4);
  }
  if(p.diet==='low_carb'){targets.carbs=100;targets.fat=round(Math.max(0,targets.energy-targets.protein*4-400)/9);targets.carb_target_scope='كربوهيدرات كلية حتى 130 جرام يوميًا؛ ليست خطة كيتو.';}
  if(p.diet==='keto'){
    if(profile.ketoAcknowledged!==true || isDietUnsafeForProfile('keto', profile))throw Error('الكيتو غير متاح تلقائيًا عند وجود سكري أو أدوية خفض السكر أو مرض بالكلى أو الكبد أو البنكرياس أو اضطراب أكل. راجع مختصًا؛ أكّد قراءة شروط الكيتو إذا لم تنطبق عليك.');
    targets.carbs=30;targets.fat=round(Math.max(0,targets.energy-targets.protein*4-120)/9);
    targets.carb_target_scope='هدف 30 جرام كربوهيدرات كلية، مع حد قبول 50 جرام يوميًا؛ لا نحسب صافي الكربوهيدرات.';
  }
  if((p.fasting&&p.fasting!=='none')||p.diet==='intermittent_fasting'){
    if(isDietUnsafeForProfile('intermittent_fasting', profile)||(p.diet!=='intermittent_fasting'&&profile.fastingAcknowledged!==true))throw Error('الصيام المتقطع يحتاج تأكيد ملاءمته؛ مع السكري أو أدوية خفض السكر أو اضطراب أكل استخدم خطة مختص.');
  }
  const schedule=fastingTimes(p,slots.length);
  validDate(startDate);
  validDate(addDays(startDate, 6));
  const pool = preparePool(lib, p, profile),
    counts = new Map(),
    templateCounts = new Map(),
    previousSlotFamily = new Map(),
    proteinCounts = new Map(),
    days = [],
    warnings = [],
    fitted = new Map();
  for (const slot of slots)
    if (!pool.some((t) => t.meal_slots.includes(slot.slot)))
      throw Error(
        "مفيش وجبات مناسبة لكل اختياراتك في " +
          {
            breakfast: "الفطار",
            lunch: "الغداء",
            dinner: "العشاء",
            snack: "السناك",
          }[slot.slot] +
          ". أضف مصدر بروتين أو غيّر الميزانية أو قلّل الاستبعادات. لم نغيّر اختياراتك تلقائيًا.",
      );

  const workoutDayIndices = new Set(
    Array.isArray(profile.workoutDays)
      ? profile.workoutDays
      : Array.from({ length: Math.min(7, targets.training_days || 0) }, (_, i) => Math.min(6, i * 2)),
  );

  for (let day = 0; day < 7; day++) {
    const isWorkoutDay = workoutDayIndices.has(new Date(addDays(startDate, day) + "T12:00:00Z").getUTCDay()) && (targets.training_days || 0) > 0;
    const meals = [];
    const chosen = new Set(),
      chosenProteins = new Set(),
      chosenMains = new Set();
    for (const slot of slots) {
      let slotShare = slot.share;
      const desired = targets.energy * slotShare,
        protein = targets.protein * slotShare;
      const mainIdentity = t => t.dish_family || (t.component_definitions
        ? t.items.filter(i => t.component_definitions.some(c => c.id === i.component_id && c.role === 'main'))
          .filter(i => lib.ingredients[i.key].role === 'protein').map(i => i.key).sort().join('|')
        : '');
      const eligibleSlotPool = egyptianSlotPool(pool, p.region, slot.slot);
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
          const key = t.id + "|" + Math.round(desired) + "|" + Math.round(protein);
          if (!fitted.has(key))
            fitted.set(key, fitMeal(t, desired, protein, lib));
          const snapshot = fitted.get(key),
            v = snapshot.values;
          const family = t.items
            .map((i) => lib.ingredients[i.key])
            .find((i) => i.role === "protein")?.protein_group;
          const isAnimalMain = ["chicken", "meat", "fish"].includes(family);
          const isRegionalMenu = Boolean(t.component_definitions && t.dish_family);
          const score =
            (Math.abs(Number(v.energy) - desired) / desired) * 5 +
            (Math.abs(protein - Number(v.protein)) / Math.max(1, protein)) *
              1.5 +
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
          if (p.diet === 'dash' || profile?.diseases?.includes('hypertension')) {
            const sod = a.snapshot.values.sodium;
            return sod != null && Number(sod) <= 2300 * slot.share;
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
      let candidates = rankCandidates(slotPool);
      // Variety is a preference within the strict pool. If it removes every
      // eligible option, reconsider that pool with the same nutrient checks.
      if(!candidates.length&&slotPool.length<eligibleSlotPool.length)candidates=rankCandidates(eligibleSlotPool);
      if(!candidates.length)throw Error('لا يوجد اختيار يحقق حدود النظام لهذا الموعد مع تفضيلاتك. جرّب ميزانية أو مصادر بروتين أخرى.');
      const best = candidates[0];
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
        const gap = targets.energy - Number(curSum.energy);
        const pGap = Math.max(0, targets.protein - Number(curSum.protein));
        if(Math.abs(gap)<targets.energy*.02 && pGap < 4)break;
        for(const m of mains) {
          const template=pool.find(t=>t.id===m.snapshot.template_id);
          if(!template)continue;
          const nextE = Math.max(1, Number(m.snapshot.values.energy) + gap / mains.length);
          const nextP = Math.max(m.target_protein, Number(m.snapshot.values.protein) + pGap / mains.length);
          const next=fitMeal(template, nextE, nextP, lib);
          const currentTotal=Number(sumSnapshots(meals.map(x=>x.snapshot)).values.energy);
          const nextTotal=currentTotal-Number(m.snapshot.values.energy)+Number(next.values.energy);
          const dashOk = (p.diet!=='dash' && !profile?.diseases?.includes('hypertension')) || (sumSnapshots(meals.map(x=>x===m?next:x.snapshot)).values.sodium != null && Number(sumSnapshots(meals.map(x=>x===m?next:x.snapshot)).values.sodium)<=2300);
          const carbOk = !['keto','low_carb'].includes(p.diet) || Number(sumSnapshots(meals.map(x=>x===m?next:x.snapshot)).values.carbs ?? 0)<=(p.diet==='keto'?50:130);
          const currentSummary=sumSnapshots(meals.map(x=>x.snapshot));
          const nextSummary=sumSnapshots(meals.map(x=>x===m?next:x.snapshot));
          if(nutritionObjective(nextSummary,targets)<nutritionObjective(currentSummary,targets) && dashOk && carbOk) {
            m.snapshot=next;
          }
        }
      }
    }
    // Nutrition feasibility outranks variety. Repair an out-of-bounds day using the same strict pool.
    // Allow bounded improvements across the whole day. Two swaps could reject
    // a feasible four-meal day before the remaining meals were repaired.
    const repairBudget=meals.length*2;
    for(let repair=0;repair<repairBudget&&nutritionQualityIssues(sumSnapshots(meals.map(m=>m.snapshot)),targets).length;repair++){
      let best=null,current=nutritionObjective(sumSnapshots(meals.map(m=>m.snapshot)),targets);
      const gap=Math.max(0,targets.protein-Number(sumSnapshots(meals.map(m=>m.snapshot)).values.protein));
      for(const meal of meals)for(const template of pool.filter(t=>t.meal_slots.includes(meal.slot))){
        const desiredProtein=meal.target_protein+gap/Math.max(1,meals.length-1),key=template.id+'|repair|'+meal.target_energy+'|'+Math.round(desiredProtein);
        if(!fitted.has(key))fitted.set(key,fitMeal(template,meal.target_energy,desiredProtein,lib));
        const snapshot=fitted.get(key),snapshots=meals.map(m=>m===meal?snapshot:m.snapshot);
        try{assertDietDay(snapshots,p.diet,targets);}catch{continue;}
        const score=nutritionObjective(sumSnapshots(snapshots),targets);
        if(score<current){best={meal,snapshot};current=score;}
      }
      if(!best)break;best.meal.snapshot=copy(best.snapshot);
    }
    assertDietDay(meals.map(m=>m.snapshot),p.diet,targets);
    const summary = sumSnapshots(meals.map((m) => m.snapshot));
    const quality=nutritionQualityIssues(summary,targets);
    if(quality.length)throw Error('المكتبة الحالية لا تحقق حدود السعرات والبروتين مع كل اختياراتك. جرّب مصادر بروتين أو ميزانية أو عدد وجبات مختلف؛ لم نغيّر القيود أو نحفظ خطة ناقصة.');
    const checks = assessDay(summary, targets);
    if (checks.length)
      warnings.push({ date: addDays(startDate, day), messages: checks });
    days.push({
      date: addDays(startDate, day),
      is_workout_day: isWorkoutDay,
      targets: copy(targets),
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
    engine_version: ENGINE_VERSION,
    data_version: lib.data_version,
    created_at: new Date().toISOString(),
  };
}
function nutritionObjective(summary,targets){
 const energy=Number(summary.values.energy),protein=Number(summary.values.protein);
 return Math.abs(energy-targets.energy)/targets.energy*5+Math.max(0,targets.protein-protein)/Math.max(1,targets.protein)*3;
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
export function alternatives(meal, prefs, lib, limit = 8, profile = null) {
  if (
    meal.snapshot.values.energy == null ||
    meal.snapshot.values.protein == null
  )
    return [];
  const p = validatePreferences(prefs, lib),
    e = Number(meal.snapshot.values.energy),
    protein = Number(meal.snapshot.values.protein);
  const seen = new Set([ingredientIdentity(meal.snapshot)]);
  return preparePool(lib, p, profile)
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
    .filter((alternative) => {
      const key = ingredientIdentity(alternative.snapshot);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
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
  const q = finite(multiplier, 0.1, 3, "عدد المرات");
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
    throw Error("تفاصيل الطعام لا تطابق هويته");
  const q = finite(quantity, 0.001, 100000, "الكمية");
  let grams = null,
    scale,
    raw,
    quality =
      food.status === "estimated" ? "calculated_estimate" : "reference_food";
  if (food.status === "estimated") {
    if (!acknowledged)
      throw Error("الملف تقريبي أو بديل؛ وافق على قراءة حدوده أولًا");
    if (unit !== "reference")
      throw Error("النموذج ليس له وزن نهائي موثق؛ استخدم عدد المقادير المحددة");
    scale = String(q);
  } else if (food.basis === "reference_serving") {
    if (unit !== "reference")
      throw Error("وزن الحصة غير معروف؛ استخدم عدد الحصص المصدرية فقط");
    scale = String(q);
  } else {
    if (unit === "grams") grams = q;
    else if (unit === "portion") {
      const p = detail.portions.find((p) => p.id === portionId);
      if (!p || p.grams == null) throw Error("لا يوجد وزن موثق لهذه الحصة");
      grams = product(p.grams, String(q));
    } else if (unit === "ml") {
      if (!food.volume_evidence) throw Error("لا يوجد تحويل حجم موثق");
      grams = volumeGrams(String(q), food.volume_evidence);
    } else throw Error("وحدة كمية غير صحيحة");
    if (grams > 100000 || grams <= 0) throw Error("الكمية خارج النطاق");
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
  if (!name || name.length > 120) throw Error("اكتب اسمًا واضحًا للأكلة");
  if (!["per100g", "serving"].includes(input.basis))
    throw Error("حدد أساس البيانات");
  const cap = input.basis === "per100g" ? 900 : 5000;
  const values = {
    energy: String(finite(input.energy, 0, cap, "السعرات")),
    protein: String(
      finite(
        input.protein,
        0,
        input.basis === "per100g" ? 100 : 500,
        "البروتين",
      ),
    ),
    fat: String(
      finite(input.fat, 0, input.basis === "per100g" ? 100 : 500, "الدهون"),
    ),
    carbs: String(
      finite(
        input.carbs,
        0,
        input.basis === "per100g" ? 100 : 500,
        "الكربوهيدرات",
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
    throw Error("مجموع الماكروز غير متسق مع أساس 100 جرام؛ راجع الوحدة");
  if (!["fdc:1005", "cofid:CHO", "user:unknown"].includes(input.carb_id))
    throw Error("حدد تعريف الكربوهيدرات");
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
  const q = finite(quantity, 0.001, 100000, "الكمية"),
    scale = food.basis === "per100g" ? product(String(q), "0.01") : String(q);
  if (scale > 1000) throw Error("الكمية خارج النطاق");
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
    throw Error("أضف اسم الوجبة ومكونًا واحدًا على الأقل");
  if (snapshots.reduce((n, s) => n + (s.ingredients?.length || 0), 0) > 100)
    throw Error("وصلت للحد: 100 مكوّن في الوجبة");
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
export function groceryList(plan, mode = "whole", diary = []) {
  const done = new Set(diary.map((e) => e.plan_meal_id)),
    map = new Map();
  for (const day of plan.days)
    for (const m of day.meals) {
      if (mode === "remaining" && done.has(m.id)) continue;
      for (const i of m.snapshot.ingredients || []) {
        const key =
          i.food_id +
          "|" +
          i.state +
          "|" +
          (i.grams == null ? i.unit : "grams");
        const row = map.get(key) || {
          food_id: i.food_id,
          name: i.name,
          state: i.state,
          grams: i.grams == null ? null : 0,
          quantity: i.grams == null ? 0 : null,
          unit: i.grams == null ? i.unit : "grams",
          serving_label: i.serving_label,
          notes:
            "المطبوخ: أوزان جاهزة للأكل؛ ليست وزن شراء خامًا ولا تُحوّل دون معامل موثق.",
        };
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
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
