// Nutrition services: Pantry Finder, Smart Grocery List, MENA Barcode Lookup/Submission, and Fasting/Ramadan state
import { pantryCatalog, pantryAlternatives } from '../pantry.mjs';
import { groceryList, nutritionQualityIssues, sumSnapshots } from '../planner-core.mjs';
import { preferredPortion } from '../planner-household.mjs';
import { assertDietDay } from '../diet-patterns.mjs';
import { library, plannedMeal, activePlan } from './food.mjs';
import { getFoodCatalogItem } from './food-catalog.mjs';
import { clockNow, isoNow } from './clock.mjs';
import { localDate, localTimeParts, number, integer } from '../coaching-shared.mjs';
import { apiError } from '../coaching-error.mjs';

const BARCODE_RE = /^\d{8,14}$/;
const AISLE_META = {
  produce: { categoryId: 'produce', label: 'Produce & Vegetables' },
  proteins: { categoryId: 'proteins', label: 'Meat, Poultry, Fish & Eggs' },
  dairy: { categoryId: 'dairy', label: 'Dairy & Cheese' },
  grains_bakery: { categoryId: 'grains_bakery', label: 'Grains, Bread & Legumes' },
  fats_pantry: { categoryId: 'fats_pantry', label: 'Oils, Nuts & Pantry' }
};

function aisleForItem(ingredientKey) {
  const ing = library.ingredients[ingredientKey];
  const pg = ing?.protein_group;
  if (['chicken', 'fish', 'meat', 'eggs'].includes(pg)) return 'proteins';
  if (pg === 'dairy') return 'dairy';
  if (pg === 'legumes') return 'grains_bakery';
  if (pg === 'nuts') return 'fats_pantry';
  if (['bread', 'wholebread', 'toast', 'rice', 'brownrice', 'basmati', 'pasta', 'oats', 'potato', 'sweetpotato', 'bulgur', 'couscous', 'quinoa'].includes(ingredientKey)) return 'grains_bakery';
  if (['olive', 'sunfloweroil', 'tahini', 'honey'].includes(ingredientKey)) return 'fats_pantry';
  return 'produce';
}

export function getPantryCatalog() {
  return { items: pantryCatalog(library) };
}

export function getPantryAlternatives(s, body = {}) {
  const selected = body?.selectedIngredients ?? body?.keys;
  const limit = body?.limit == null ? 12 : integer(body.limit, 1, 50, 'limit');
  let meal = null;
  let day = null;
  let plan = activePlan(s);
  if (body?.mealId) {
    const found = plannedMeal(s, body.mealId);
    plan = found.plan;
    day = found.day;
    meal = found.meal;
  } else {
    const slot = ['breakfast', 'lunch', 'dinner', 'snack'].includes(body?.slot) ? body.slot : 'lunch';
    const targetEnergy = plan?.targets?.energy ? Math.round(Number(plan.targets.energy) * (slot === 'snack' ? 0.15 : 0.3)) : 500;
    meal = { id: null, slot, target_energy: targetEnergy, snapshot: { template_id: null, name: '', values: { energy: String(targetEnergy) }, ingredients: [] } };
  }
  const accept = (day && plan)
    ? (alt => {
        try {
          const snaps = day.meals.map(m => m.id === meal.id ? alt.snapshot : m.snapshot);
          assertDietDay(snaps, s.preferences?.diet || 'balanced', day.targets || plan.targets, s.profile);
          return !nutritionQualityIssues(sumSnapshots(snaps), day.targets || plan.targets).length;
        } catch {
          return false;
        }
      })
    : null;
  const rows = pantryAlternatives(meal, s.preferences || { diet: 'balanced', region: 'egypt', budget: 'medium', meals: 4, proteins: ['chicken', 'eggs', 'dairy', 'legumes'] }, library, selected, null, limit, s.profile, accept);
  return {
    items: rows.map(r => ({
      id: r.snapshot.template_id,
      templateId: r.snapshot.template_id,
      name: r.snapshot.name,
      snapshot: r.snapshot,
      energy_delta: r.energy_delta,
      protein_delta: r.protein_delta,
      matchedIngredientKeys: (r.snapshot.ingredients || []).map(i => i.key)
    }))
  };
}

export function getPlanGroceryList(s, plan, daysScope = 'all', todayDate = null, { preview = false } = {}) {
  const mode = daysScope === 'remaining' ? 'remaining' : (daysScope === '3' ? '3' : 'whole');
  const rawItems = groceryList(plan, mode, s.foodEntries || [], todayDate);
  const checks = s.groceryChecks || {};
  const buckets = new Map();
  let totalItemsCount = 0;
  for (const item of rawItems) {
    totalItemsCount++;
    if (preview && totalItemsCount > 2) continue;
    const aisleKey = aisleForItem(item.ingredientKey);
    if (!buckets.has(aisleKey)) buckets.set(aisleKey, { ...AISLE_META[aisleKey], items: [] });
    const totalGrams = item.grams != null ? Math.round(Number(item.grams)) : null;
    const ing = library.ingredients[item.ingredientKey];
    let practicalQuantityLabel = totalGrams != null ? `${totalGrams} g` : `${item.quantity} ${item.serving_label || item.unit}`;
    if (totalGrams != null && ing) {
      try {
        const portion = preferredPortion(ing, totalGrams);
        if (portion?.label) practicalQuantityLabel = `${totalGrams} g (~${portion.label})`;
      } catch {}
    }
    const checkRecord = checks[`${plan.id}:${item.ingredientKey}`];
    const catItem = getFoodCatalogItem(item.food_id || item.ingredientKey);
    const nameAr = catItem?.name_ar || ing?.label || item.name;
    const nameEn = catItem?.name_en || item.name;
    buckets.get(aisleKey).items.push({
      ingredientKey: item.ingredientKey,
      foodId: item.food_id,
      name: item.name,
      nameEn,
      nameAr,
      state: item.state,
      preparationState: item.state,
      totalGrams,
      practicalQuantityLabel,
      checked: Boolean(checkRecord?.checked),
      mealRefs: item.mealRefs || [],
      notes: item.notes
    });
  }
  return {
    planId: plan.id,
    daysScope: daysScope === 'remaining' || daysScope === '3' || daysScope === '7' ? daysScope : 'all',
    preview: Boolean(preview),
    previewMode: Boolean(preview),
    totalItemsCount,
    lockedCount: preview ? Math.max(0, totalItemsCount - 2) : 0,
    categories: [...buckets.values()]
  };
}

export async function lookupBarcode(db, env, rawEan) {
  const ean = String(rawEan || '').trim();
  if (!BARCODE_RE.test(ean)) {
    throw apiError('INVALID_BARCODE_FORMAT', 'Barcode must be a valid 8 to 14 digit EAN or UPC code.', { status: 400 });
  }
  const row = await db.prepare('SELECT * FROM food_barcodes WHERE barcode=?').bind(ean).first();
  if (row) {
    return {
      barcode: row.barcode,
      nameAr: row.name_ar || null,
      nameEn: row.name_en,
      brand: row.brand || null,
      servingSizeGrams: row.serving_size_grams,
      servingLabel: row.serving_label || null,
      valuesPer100g: JSON.parse(row.values_per_100g_json),
      provenance: row.provenance,
      isApproximate: row.provenance === 'pending_review'
    };
  }
  if (env?.ENABLE_OPENFOODFACTS === 'true') {
    try {
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined;
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json`, signal ? { signal } : undefined);
      if (res.ok) {
        const payload = await res.json();
        const p = payload?.product;
        const n = p?.nutriments;
        if (payload?.status === 1 && p && n && Number.isFinite(Number(n['energy-kcal_100g']))) {
          const valuesPer100g = {
            energy: Number(n['energy-kcal_100g']),
            protein: n.proteins_100g != null ? Number(n.proteins_100g) : null,
            carbs: n.carbohydrates_100g != null ? Number(n.carbohydrates_100g) : null,
            fat: n.fat_100g != null ? Number(n.fat_100g) : null,
            fiber: n.fiber_100g != null ? Number(n.fiber_100g) : null,
            saturated: n['saturated-fat_100g'] != null ? Number(n['saturated-fat_100g']) : null,
            sodium: n.sodium_100g != null ? Math.round(Number(n.sodium_100g) * 1000) : null,
            sugars: n.sugars_100g != null ? Number(n.sugars_100g) : null
          };
          const record = {
            barcode: ean,
            nameAr: p.product_name_ar || null,
            nameEn: p.product_name_en || p.product_name || `Product ${ean}`,
            brand: p.brands || null,
            servingSizeGrams: Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : 100,
            servingLabel: p.serving_size || '100 g',
            valuesPer100g,
            provenance: 'openfoodfacts',
            isApproximate: false
          };
          await db.prepare(
            'INSERT OR IGNORE INTO food_barcodes(barcode,name_ar,name_en,brand,serving_size_grams,serving_label,values_per_100g_json,provenance,submitted_by_user_id,created_at) VALUES(?,?,?,?,?,?,?,?,NULL,?)'
          ).bind(record.barcode, record.nameAr, record.nameEn, record.brand, record.servingSizeGrams, record.servingLabel, JSON.stringify(valuesPer100g), 'openfoodfacts', isoNow()).run();
          return record;
        }
      }
    } catch {}
  }
  throw apiError('BARCODE_NOT_FOUND', 'No product nutrition record found for this barcode.', { status: 404, params: { barcode: ean } });
}

export async function submitBarcode(db, userId, body = {}) {
  const ean = String(body?.barcode ?? body?.ean ?? '').trim();
  if (!BARCODE_RE.test(ean)) {
    throw apiError('INVALID_BARCODE_FORMAT', 'Barcode must be a valid 8 to 14 digit EAN or UPC code.', { status: 400 });
  }
  const existing = await db.prepare('SELECT provenance FROM food_barcodes WHERE barcode=?').bind(ean).first();
  if (existing && existing.provenance !== 'pending_review') {
    throw apiError('VALIDATION_ERROR', 'A verified record already exists for this barcode.', { status: 409 });
  }
  const nameEn = String(body?.nameEn ?? body?.name ?? '').trim();
  if (!nameEn || nameEn.length > 160) {
    throw apiError('INVALID_MEAL_NAME', 'Product English name must be 1 to 160 characters.', { status: 400 });
  }
  const nameAr = body?.nameAr ? String(body.nameAr).trim().slice(0, 160) : null;
  const brand = body?.brand ? String(body.brand).trim().slice(0, 120) : null;
  const servingSizeGrams = number(body?.servingSizeGrams ?? body?.servingG ?? 100, 1, 2000, 'servingSizeGrams');
  const servingLabel = body?.servingLabel ? String(body.servingLabel).trim().slice(0, 80) : `${servingSizeGrams} g`;
  const v = body?.valuesPer100g || (body?.kcalPer100g != null ? {
    energy: body.kcalPer100g,
    protein: body.proteinPer100g ?? null,
    carbs: body.carbsPer100g ?? null,
    fat: body.fatPer100g ?? null,
    fiber: body.fiberPer100g ?? null,
    saturated: body.saturatedPer100g ?? null,
    sodium: body.sodiumPer100g ?? null,
    sugars: body.sugarsPer100g ?? null
  } : null);
  if (!v || typeof v !== 'object') {
    throw apiError('VALIDATION_ERROR', 'valuesPer100g object is required.', { status: 400 });
  }
  const energy = number(v.energy, 0, 950, 'energy');
  const protein = v.protein == null ? null : number(v.protein, 0, 100, 'protein');
  const carbs = v.carbs == null ? null : number(v.carbs, 0, 100, 'carbs');
  const fat = v.fat == null ? null : number(v.fat, 0, 100, 'fat');
  if ((protein || 0) + (carbs || 0) + (fat || 0) > 110) {
    throw apiError('MACROS_INCONSISTENT_WITH_100G', 'Sum of protein, carbs, and fat per 100g exceeds physiological 100g tolerance.', { status: 400 });
  }
  const normalized = {
    energy,
    protein,
    carbs,
    fat,
    fiber: v.fiber == null ? null : number(v.fiber, 0, 100, 'fiber'),
    saturated: v.saturated == null ? null : number(v.saturated, 0, 100, 'saturated'),
    sodium: v.sodium == null ? null : number(v.sodium, 0, 50000, 'sodium'),
    sugars: v.sugars == null ? null : number(v.sugars, 0, 100, 'sugars')
  };
  const now = isoNow();
  await db.prepare(
    'INSERT OR REPLACE INTO food_barcodes(barcode,name_ar,name_en,brand,serving_size_grams,serving_label,values_per_100g_json,provenance,submitted_by_user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).bind(ean, nameAr, nameEn, brand, servingSizeGrams, servingLabel, JSON.stringify(normalized), 'pending_review', userId, now).run();
  return { barcode: ean, ean, nameEn, status: 'pending_review', createdAt: now };
}

export function getFastingState(s, now = clockNow()) {
  const tz = s.profile?.timezone || 'Africa/Cairo';
  const today = localDate(now, tz);
  const storedRamadan = s.ramadanMode || { enabled: false, iftarTime: '18:05', suhoorCutoffTime: '04:20', workoutTiming: 'post_iftar', medicalClearanceAcknowledged: false, endDate: null };
  const ramadanExpired = Boolean(storedRamadan.enabled && storedRamadan.endDate && today > storedRamadan.endDate);
  const ramadan = ramadanExpired ? { ...storedRamadan, enabled: false, autoRevertedOn: storedRamadan.endDate } : storedRamadan;
  const fs = s.fastingState || { mode: 'off', phase: 'eating', windowStart: '12:00', windowEnd: '20:00', startedAt: null, targetEndAt: null, streakDays: 0 };
  const activeIfMode = (fs.mode && fs.mode.startsWith('if_')) ? fs.mode : (s.preferences?.diet === 'intermittent_fasting' ? 'if_16_8' : 'off');
  const mode = ramadan.enabled ? 'ramadan' : activeIfMode;
  const windowStart = ramadan.enabled ? ramadan.iftarTime : (fs.windowStart || s.preferences?.eatingStart || '12:00');
  const windowEnd = ramadan.enabled ? ramadan.suhoorCutoffTime : (fs.windowEnd || '20:00');
  let phase = fs.phase || 'eating';
  if (mode !== 'off' && !fs.startedAt) {
    const parts = localTimeParts(now, tz);
    const cur = parts.time.slice(0, 5);
    if (windowStart <= windowEnd) {
      phase = (cur >= windowStart && cur < windowEnd) ? 'eating' : 'fasting';
    } else {
      // Overnight eating window (Ramadan Iftar -> Suhoor)
      phase = (cur >= windowStart || cur < windowEnd) ? 'eating' : 'fasting';
    }
  }
  const flex = s.seasonalFlex || null;
  const flexActive = Boolean(flex?.enabled && (!flex.endDate || today <= flex.endDate));
  const eidTransitionAvailable = Boolean(
    storedRamadan.endDate &&
    today > storedRamadan.endDate &&
    !flexActive &&
    !flex?.dismissedAfterEndDate
  );
  const activePlanObj = activePlan(s);
  const maintenanceTargetKcal = flexActive && activePlanObj?.targets?.tdee ? Math.round(Number(activePlanObj.targets.tdee)) : null;
  const seasonalContext = {
    mode: ramadan.enabled ? 'ramadan' : (flexActive ? 'eid_flex' : 'standard'),
    themeToken: ramadan.enabled ? 'ramadan_indigo_gold' : (flexActive ? 'eid_emerald_gold' : 'standard'),
    occasion: flexActive ? (flex.occasion || 'eid_fitr') : null,
    endDate: ramadan.enabled ? (ramadan.endDate || null) : (flexActive ? (flex.endDate || null) : null),
    maintenanceTargetKcal,
    eidTransitionAvailable,
    hydrationWindowActive: ramadan.enabled ? phase === 'eating' : false
  };
  return {
    mode,
    preset: fs.preset || (mode === 'ramadan' ? 'ramadan' : (mode.startsWith('if_') ? mode.slice(3) : null)),
    windowHours: fs.windowHours || (mode === 'if_12_12' ? 12 : mode === 'if_14_10' ? 10 : mode === 'if_18_6' ? 6 : mode === 'if_16_8' ? 8 : null),
    phase,
    windowStart,
    windowEnd,
    startedAt: fs.startedAt || null,
    targetEndAt: fs.targetEndAt || null,
    ramadanConfig: ramadan,
    ramadanMode: ramadan,
    seasonalContext,
    streakDays: fs.streakDays || 0
  };
}
