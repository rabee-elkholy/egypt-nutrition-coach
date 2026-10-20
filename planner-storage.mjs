import {DIETS,assertDietDay,fastingTimes} from './diet-patterns.mjs';
import { EXCLUSIONS } from "./planner-exclusions.mjs";
import {
  METRICS,
  simplifyPlannedSnapshot,
  sumSnapshots,
  validDate,
  addDays,
  estimateNeeds,
  assessDay,
  REGIONS,
} from "./planner-core.mjs";
export const STORAGE_KEY = "egypt-nutrition-private-planner-v1";
const clone = (x) => JSON.parse(JSON.stringify(x));
export const emptyState = () => ({
  schema_version: 1,
  revision: 0,
  active_plan_id: null,
  plans: [],
  diary: [],
  customFoods: [],
  profile: null,
  preferences: null,
  workoutPlan: null,
  onboarding: null,
});
export function validateBackup(s) {
  const fail = (message) => {
    throw Error(message);
  };
  const id = (x) => typeof x === "string" && /^[A-Za-z0-9_:.-]{1,160}$/.test(x);
  const text = (x, max = 1000) => typeof x === "string" && x.length <= max;
  const numeric = (x, max = 1e8) =>
    typeof x !== "boolean" &&
    /^\d+(?:\.\d+)?$/.test(String(x)) &&
    Number.isFinite(Number(x)) &&
    Number(x) <= max;
  const strings = (x, max = 100) =>
    Array.isArray(x) && x.length <= max && x.every((v) => text(v, 120));
  const preferences = (p) => {
    if (
      !p ||
      !Object.hasOwn(DIETS,p.diet??"balanced") ||
      !["low", "medium", "high"].includes(p.budget) ||
      ![2, 3, 4, 5].includes(p.meals) ||
      (p.region != null && !Object.hasOwn(REGIONS, p.region)) ||
      !strings(p.proteins, 7) ||
      !p.proteins.length ||
      p.proteins.some(
        (g) =>
          ![
            "legumes",
            "eggs",
            "dairy",
            "chicken",
            "fish",
            "meat",
            "nuts",
          ].includes(g),
      ) ||
      !strings(p.excludedKeys) ||
      !strings(p.excludedFoodIds || [], 10000) ||
      !strings(p.excludedGroups || []) ||
      (p.excludedGroups || []).some(
        (id) => !EXCLUSIONS.some((g) => g.id === id),
      )
    )
      fail("اختيارات محفوظة غير صحيحة");
    fastingTimes(p,p.meals);
  };
  if (
    !s ||
    s.schema_version !== 1 ||
    !Number.isInteger(s.revision) ||
    s.revision < 0 ||
    !Array.isArray(s.plans) ||
    s.plans.length > 100 ||
    !Array.isArray(s.diary) ||
    s.diary.length > 10000 ||
    !Array.isArray(s.customFoods) ||
    s.customFoods.length > 1000
  )
    fail("ملف النسخة الاحتياطية غير صالح أو حجمه كبير");
  if (s.pantry != null && (!strings(s.pantry,100) || s.pantry.some(v=>!id(v)))) fail("قائمة مكونات البيت غير صالحة");
  if (s.profile) estimateNeeds(s.profile);
  if (s.preferences) preferences(s.preferences);
  const snap = (m, depth = 0) => {
    if (
      depth > 10 ||
      !m ||
      !text(m.name, 120) ||
      !m.name.trim() ||
      !m.values ||
      !Array.isArray(m.ingredients) ||
      m.ingredients.length > 100 ||
      !strings(m.carb_ids, 100) ||
      m.carb_ids.some((v) => !v) ||
      (m.notes != null && !text(m.notes, 10000))
    )
      fail("بيانات وجبة غير صحيحة");
    if (
      m.fruit_veg_g != null &&
      (!Number.isFinite(m.fruit_veg_g) ||
        m.fruit_veg_g < 0 ||
        m.fruit_veg_g > 1e6)
    )
      fail("كمية خضار وفاكهة غير صحيحة");
    for (const k of METRICS)
      if (m.values[k] != null && !numeric(m.values[k]))
        fail("قيمة غذائية غير صالحة");
    for (const i of m.ingredients) {
      if (
        !i ||
        !text(i.name, 1000) ||
        !i.name.trim() ||
        (i.food_id != null && !id(i.food_id)) ||
        (i.grams != null && !numeric(i.grams, 1e6)) ||
        (i.quantity != null && !numeric(i.quantity, 1e6)) ||
        (i.grams == null && (i.quantity == null || !text(i.unit, 120)))
      )
        fail("مكوّن أو كمية غير صالحة");
    }
    if (
      m.source_quantity &&
      (!numeric(m.source_quantity.quantity, 1e6) ||
        !numeric(m.source_quantity.scale, 1e6) ||
        !text(m.source_quantity.unit, 120))
    )
      fail("أساس كمية غير صحيح");
    if (m.components != null) {
      if (!Array.isArray(m.components) || m.components.length > 100)
        fail("مكونات وجبة غير صحيحة");
      for (const c of m.components) snap(c, depth + 1);
    }
  };
  const planIds = new Set(),
    meals = new Map();
  for (const p of s.plans) {
    if (
      !id(p.id) ||
      planIds.has(p.id) ||
      !Array.isArray(p.days) ||
      p.days.length !== 7
    )
      fail("خطة غير صحيحة");
    planIds.add(p.id);
    validDate(p.start_date);
    estimateNeeds(p.profile);
    preferences(p.preferences);
    if (
      !p.targets ||
      !Number.isFinite(p.targets.energy) ||
      p.targets.energy < 1150 ||
      p.targets.energy > 4200 ||
      !Array.isArray(p.targets.notes) ||
      p.targets.notes.some((v) => !text(v, 10000)) ||
      [
        "protein",
        "fat",
        "carbs",
        "ree",
        "tdee",
        "activity_factor",
        "energy_change",
      ].some((k) => !Number.isFinite(p.targets[k])) ||
      p.targets.protein <= 0 ||
      p.targets.fat < 0 ||
      p.targets.carbs < 0
    )
      fail("أهداف غير صحيحة");
    p.days.forEach((d, index) => {
      if (d.date !== addDays(p.start_date, index))
        fail("أيام الأسبوع غير متتابعة");
      validDate(d.date);
      if (!Array.isArray(d.meals) || d.meals.length !== p.preferences.meals)
        fail("عدد وجبات غير صحيح");
      for (const m of d.meals) {
        if (
          !id(m.id) ||
          meals.has(m.id) ||
          !["breakfast", "lunch", "dinner", "snack"].includes(m.slot)
        )
          fail("معرف أو موعد وجبة غير صحيح");
        meals.set(m.id, { date: d.date, slot: m.slot });
        snap(m.snapshot);
      }
      assertDietDay(d.meals.map(m=>m.snapshot),p.preferences.diet,p.targets);
      const times=fastingTimes(p.preferences,p.preferences.meals);
      if(times.length&&d.meals.some((m,i)=>m.time!==times[i]))fail("مواعيد الوجبات لا تطابق نافذة الأكل");
    });
  }
  const diaryIds = new Set(),
    logged = new Set();
  for (const e of s.diary) {
    validDate(e.date);
    if (
      !id(e.id) ||
      diaryIds.has(e.id) ||
      !["breakfast", "lunch", "dinner", "snack"].includes(e.slot)
    )
      fail("سجل أكل غير صحيح");
    diaryIds.add(e.id);
    if (e.plan_meal_id) {
      const m = meals.get(e.plan_meal_id);
      if (
        logged.has(e.plan_meal_id) ||
        !m ||
        m.date !== e.date ||
        m.slot !== e.slot
      )
        fail("سجل الأكل لا يطابق الوجبة والتاريخ");
      logged.add(e.plan_meal_id);
    }
    snap(e.snapshot);
  }
  if (s.active_plan_id != null && !planIds.has(s.active_plan_id))
    fail("الخطة النشطة غير موجودة");
  const customIds = new Set();
  for (const f of s.customFoods) {
    if (
      !id(f.id) ||
      customIds.has(f.id) ||
      !text(f.name, 120) ||
      !f.name.trim() ||
      !["per100g", "serving"].includes(f.basis) ||
      !text(f.basis_label, 60) ||
      !["fdc:1005", "cofid:CHO", "user:unknown"].includes(f.carb_id) ||
      !f.values ||
      ["energy", "protein", "fat", "carbs"].some(
        (k) =>
          f.values[k] == null ||
          !numeric(
            f.values[k],
            k === "energy"
              ? f.basis === "per100g"
                ? 900
                : 5000
              : f.basis === "per100g"
                ? 100
                : 500,
          ),
      )
    )
      fail("بيانات طعام شخصي غير صحيحة");
    customIds.add(f.id);
    if (
      f.basis === "per100g" &&
      Number(f.values.protein) + Number(f.values.fat) + Number(f.values.carbs) >
        110
    )
      fail("ماكروز الطعام الشخصي تتجاوز أساس الوزن");
  }
  const validated = clone(s);
  for (const plan of validated.plans) refreshPlan(plan);
  return validated;
}
export function openStore(storage) {
  let state;
  try {
    const text = storage.getItem(STORAGE_KEY);
    state = text ? validateBackup(JSON.parse(text)) : emptyState();
  } catch {
    throw Error(
      "تعذر قراءة البيانات المحلية. صدّر الملف الخام قبل الإصلاح أو استخدم المتصفح الذي حفظت عليه خطتك.",
    );
  }
  const persist = (next) => {
    const current = storage.getItem(STORAGE_KEY);
    let rev = 0;
    try {
      rev = current ? JSON.parse(current).revision : 0;
    } catch {
      throw Error("البيانات تغيرت أو تلفت؛ لم نكتب فوقها");
    }
    if (rev !== state.revision)
      throw Error("الخطة تغيرت في تبويب آخر. أعد تحميل الصفحة قبل التعديل.");
    next.revision = state.revision + 1;
    next = validateBackup(next);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw Error(
        "لم تُحفظ البيانات: مساحة المتصفح غير كافية أو التخزين محظور. صدّر نسخة احتياطية.",
      );
    }
    state = next;
    return clone(state);
  };
  return {
    get: () => clone(state),
    update(fn) {
      const next = clone(state);
      fn(next);
      return persist(next);
    },
    import(text) {
      if (text.length > 10e6) throw Error("ملف النسخة أكبر من 10 MB");
      const next = validateBackup(JSON.parse(text));
      return persist(next);
    },
    export: () => JSON.stringify(state, null, 2),
    clear() {
      return persist(emptyState());
    },
  };
}
export function activatePlan(state, plan) {
  state.plans.push(clone(plan));
  state.active_plan_id = plan.id;
  state.profile = clone(plan.profile);
  state.preferences = clone(plan.preferences);
}
export function recordPlanned(state, meal, date, checked) {
  const index = state.diary.findIndex((e) => e.plan_meal_id === meal.id);
  if (checked && index < 0)
    state.diary.push({
      id: "eaten-" + meal.id,
      plan_meal_id: meal.id,
      date: validDate(date),
      slot: meal.slot,
      snapshot: clone(meal.snapshot),
      recorded_at: new Date().toISOString(),
    });
  if (!checked && index >= 0) state.diary.splice(index, 1);
}
export function actualForDate(state, date) {
  return sumSnapshots(
    state.diary.filter((e) => e.date === date).map((e) => e.snapshot),
  );
}
export function replacePlanned(state, mealId, snapshot) {
  if (state.diary.some((e) => e.plan_meal_id === mealId))
    throw Error(
      "الوجبة مسجلة كأكل فعلي؛ عدّل السجل الفعلي أو ألغِ العلامة أولًا.",
    );
  for (const plan of state.plans) {
    for (const day of plan.days) {
      const meal = day.meals.find((m) => m.id === mealId);
      if (!meal) continue;
      assertDietDay(day.meals.map(m=>m.id===mealId?snapshot:m.snapshot),plan.preferences.diet,plan.targets);
      meal.snapshot = clone(snapshot);
      refreshPlan(plan);
      return;
    }
  }
  throw Error("الوجبة غير موجودة");
}
// Derived caches only: source values and frozen actual-intake snapshots stay intact.
function refreshPlan(plan) {
  plan.warnings = [];
  for (const day of plan.days) {
    day.summary = sumSnapshots(day.meals.map((meal) => meal.snapshot));
    const messages = assessDay(day.summary, plan.targets);
    if (messages.length) plan.warnings.push({ date: day.date, messages });
  }
}

export function simplifyActivePlan(state){
 const plan=state.plans.find(p=>p.id===state.active_plan_id);
 if(!plan||plan.portion_policy==='simple-1')return;
 const logged=new Set(state.diary.map(e=>e.plan_meal_id));let skipped=0;
 for(const day of plan.days){
  const snapshots=day.meals.map(m=>logged.has(m.id)?m.snapshot:simplifyPlannedSnapshot(m.snapshot));
  try{assertDietDay(snapshots,plan.preferences.diet,plan.targets);}
  catch{skipped++;continue;}
  day.meals.forEach((m,i)=>{if(!logged.has(m.id))m.snapshot=snapshots[i];});
 }
 plan.portion_policy='simple-1';plan.portion_rounding_skipped_days=skipped;refreshPlan(plan);
}
