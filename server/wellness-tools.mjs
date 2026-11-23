// Wellness & Lifestyle Tools: Custom Home Recipes (US-NUT-12), Dedicated Cardio Tracking (US-WRK-11),
// and Optional Female Menstrual Cycle Awareness (US-PRG-06).
// Leaf-level, acyclic module — imports only clock, food-catalog, shared helpers, and apiError.
import { clockNow, isoNow, clockTimeZone } from './clock.mjs';
import { calculatePreparedBeverageOrRecipe, getFoodCatalogItem } from './food-catalog.mjs';
import {
  localDate,
  dateOffset,
  dateForLog as validateLogDate,
  validDate,
  integer,
  canonicalInjuries,
  isPregnantStatus
} from '../coaching-shared.mjs';
import { apiError } from '../coaching-error.mjs';

export const MAX_CUSTOM_RECIPES = 100;
export const MAX_CARDIO_PER_DAY = 5;
export const CYCLE_DISCLAIMER = 'wellness_tracking_not_contraception_or_medical_diagnosis';

const RECIPE_METRICS = ['energy', 'protein', 'fat', 'carbs', 'fiber', 'saturated', 'sodium', 'sugars'];

export const CARDIO_MODALITIES = Object.freeze([
  'walking',
  'brisk_walking',
  'running',
  'cycling',
  'stationary_bike',
  'swimming',
  'elliptical',
  'rowing',
  'jump_rope',
  'hiit'
]);
const CARDIO_MODALITY_SET = new Set(CARDIO_MODALITIES);
const CARDIO_INTENSITIES = new Set(['low', 'moderate', 'vigorous']);
const CARDIO_SOURCES = new Set(['manual', 'health_connect', 'apple_health']);
const HIGH_IMPACT_MODALITIES = new Set(['running', 'jump_rope', 'hiit']);
const HIGH_IMPACT_INJURIES = new Set(['knee_pain', 'ankle_pain', 'lower_back_pain', 'hip_pain']);

const CARDIO_METS = Object.freeze({
  walking: { low: 2.8, moderate: 3.5, vigorous: 4.3 },
  brisk_walking: { low: 3.5, moderate: 4.3, vigorous: 5.0 },
  running: { low: 7.0, moderate: 9.8, vigorous: 11.5 },
  cycling: { low: 4.0, moderate: 6.8, vigorous: 10.0 },
  stationary_bike: { low: 4.0, moderate: 6.8, vigorous: 8.8 },
  swimming: { low: 5.0, moderate: 7.0, vigorous: 9.8 },
  elliptical: { low: 4.5, moderate: 5.8, vigorous: 7.5 },
  rowing: { low: 4.8, moderate: 7.0, vigorous: 8.5 },
  jump_rope: { low: 8.0, moderate: 10.0, vigorous: 12.3 },
  hiit: { low: 6.0, moderate: 8.0, vigorous: 10.5 }
});

const CYCLE_FLOW_LEVELS = new Set(['none', 'spotting', 'light', 'medium', 'heavy']);
const CYCLE_SYMPTOMS = new Set([
  'cramps',
  'bloating',
  'fatigue',
  'headache',
  'mood_changes',
  'cravings',
  'back_pain',
  'tender_breasts',
  'insomnia'
]);

const round2 = v => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
const round1 = v => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);

function userTz(s) {
  return s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
}

function logDateFor(s, rawDate) {
  const tz = userTz(s);
  return validateLogDate(rawDate || localDate(clockNow(), tz), clockNow(), tz);
}

// ---------------------------------------------------------------------------
// 1. Saved Custom Home Recipes ("My Recipes" — US-NUT-12)
// ---------------------------------------------------------------------------

export function saveCustomRecipe(s, p = {}) {
  const name = typeof p?.name === 'string' ? p.name.trim() : '';
  if (name.length < 2 || name.length > 80) {
    throw apiError('INVALID_RECIPE_PAYLOAD', 'Recipe name must be between 2 and 80 characters.', { status: 400 });
  }
  const servingsNum = Number(p?.servings);
  if (!Number.isFinite(servingsNum) || servingsNum < 0.5 || servingsNum > 30) {
    throw apiError('INVALID_RECIPE_PAYLOAD', 'Recipe servings must be a number between 0.5 and 30.', { status: 400 });
  }
  const servings = round2(servingsNum);
  const rawItems = Array.isArray(p?.items) ? p.items : (Array.isArray(p?.ingredients) ? p.ingredients : null);
  if (!rawItems || rawItems.length < 1 || rawItems.length > 25) {
    throw apiError('INVALID_RECIPE_PAYLOAD', 'Recipe must contain between 1 and 25 ingredients.', { status: 400 });
  }

  s.customRecipes ||= [];
  const requestedId = typeof p?.id === 'string' && p.id.trim() ? p.id.trim().slice(0, 80) : null;
  const existing = requestedId ? s.customRecipes.find(r => r.id === requestedId) : null;
  if (!existing && s.customRecipes.length >= MAX_CUSTOM_RECIPES) {
    throw apiError('RECIPE_LIMIT_REACHED', `Maximum saved custom recipes limit (${MAX_CUSTOM_RECIPES}) reached.`, {
      status: 409,
      params: { max: MAX_CUSTOM_RECIPES }
    });
  }

  const calcIngredients = [];
  const calcAdditions = [];
  const storedIngredients = [];
  let rawSumGrams = 0;

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      throw apiError('INVALID_RECIPE_PAYLOAD', 'Each recipe ingredient must be an object with foodId and grams or ml.', { status: 400 });
    }
    const foodId = typeof raw.foodId === 'string' ? raw.foodId.trim() : (typeof raw.key === 'string' ? raw.key.trim() : (typeof raw.id === 'string' ? raw.id.trim() : ''));
    const hasMl = raw.ml != null && raw.ml !== '';
    const amountNum = Number(hasMl ? raw.ml : raw.grams);
    if (!foodId || !Number.isFinite(amountNum) || amountNum < 1 || amountNum > 5000) {
      throw apiError('INVALID_RECIPE_PAYLOAD', 'Each recipe ingredient requires a valid foodId and grams or ml between 1 and 5000.', { status: 400 });
    }
    const catItem = getFoodCatalogItem(foodId);
    if (!catItem) {
      throw apiError('INVALID_RECIPE_PAYLOAD', `Recipe ingredient not found in food catalog: ${foodId}.`, { status: 400 });
    }
    let grams = round1(amountNum);
    if (hasMl) {
      if (catItem.volume_evidence) {
        const refG = Number(catItem.volume_evidence.reference_grams || catItem.volume_evidence.grams || 0);
        const refMl = Number(catItem.volume_evidence.reference_ml || catItem.volume_evidence.ml || 0);
        grams = refG > 0 && refMl > 0 ? round1(amountNum * (refG / refMl)) : round1(amountNum);
      } else if (raw.densityGPerMl != null && Number(raw.densityGPerMl) > 0) {
        grams = round1(amountNum * Number(raw.densityGPerMl));
      }
      calcIngredients.push({ id: catItem.id, ml: amountNum, ...(raw.densityGPerMl != null ? { densityGPerMl: Number(raw.densityGPerMl) } : {}) });
    } else {
      calcIngredients.push({ id: catItem.id, grams });
    }
    rawSumGrams += grams;
    storedIngredients.push({
      foodId: catItem.id,
      key: catItem.planningKey || catItem.id,
      name: catItem.name,
      nameEn: catItem.name_en || catItem.name,
      nameAr: catItem.name_ar || null,
      grams,
      ...(hasMl ? { ml: round1(amountNum) } : {}),
      state: catItem.state || 'as_sold',
      source: catItem.source || 'catalog',
      isApproximate: Boolean(catItem.isApproximate),
      values_per_100g: catItem.values
    });
  }

  const rawAdditions = Array.isArray(p?.additions) ? p.additions : [];
  if (rawAdditions.length > 15) {
    throw apiError('INVALID_RECIPE_PAYLOAD', 'Recipe can include at most 15 additions.', { status: 400 });
  }
  for (const raw of rawAdditions) {
    const foodId = typeof raw?.foodId === 'string' ? raw.foodId.trim() : (typeof raw?.key === 'string' ? raw.key.trim() : (typeof raw?.id === 'string' ? raw.id.trim() : ''));
    const hasMl = raw?.ml != null && raw?.ml !== '';
    const amountNum = Number(hasMl ? raw.ml : raw?.grams);
    if (!foodId || !Number.isFinite(amountNum) || amountNum < 1 || amountNum > 5000) {
      throw apiError('INVALID_RECIPE_PAYLOAD', 'Each recipe addition requires a valid foodId and grams or ml between 1 and 5000.', { status: 400 });
    }
    const catItem = getFoodCatalogItem(foodId);
    if (!catItem) {
      throw apiError('INVALID_RECIPE_PAYLOAD', `Recipe ingredient not found in food catalog: ${foodId}.`, { status: 400 });
    }
    let grams = round1(amountNum);
    if (hasMl) {
      if (raw.densityGPerMl != null && Number(raw.densityGPerMl) > 0) grams = round1(amountNum * Number(raw.densityGPerMl));
      calcAdditions.push({ id: catItem.id, ml: amountNum, ...(raw.densityGPerMl != null ? { densityGPerMl: Number(raw.densityGPerMl) } : {}) });
    } else {
      calcAdditions.push({ id: catItem.id, grams });
    }
    rawSumGrams += grams;
    storedIngredients.push({
      foodId: catItem.id,
      key: catItem.planningKey || catItem.id,
      name: catItem.name,
      nameEn: catItem.name_en || catItem.name,
      nameAr: catItem.name_ar || null,
      grams,
      ...(hasMl ? { ml: round1(amountNum) } : {}),
      isAddition: true,
      state: catItem.state || 'as_sold',
      source: catItem.source || 'catalog',
      isApproximate: Boolean(catItem.isApproximate),
      values_per_100g: catItem.values
    });
  }

  let customFinalWeight = null;
  if (p?.finalWeightGrams !== undefined && p.finalWeightGrams !== null && p.finalWeightGrams !== '') {
    const fw = Number(p.finalWeightGrams);
    if (!Number.isFinite(fw) || fw < 1 || fw > 25000) {
      throw apiError('INVALID_RECIPE_PAYLOAD', 'finalWeightGrams must be a number between 1 and 25000.', { status: 400 });
    }
    customFinalWeight = round1(fw);
  }

  const calcPreview = calculatePreparedBeverageOrRecipe({
    ingredients: calcIngredients,
    additions: calcAdditions,
    finalWeightGrams: customFinalWeight || Math.max(1, round1(rawSumGrams)),
    requireApproved: false
  });

  const inputWeightGrams = round1(Number(calcPreview.inputWeightGrams || rawSumGrams));
  const totalGrams = customFinalWeight || inputWeightGrams;
  const yieldRatio = customFinalWeight && inputWeightGrams > 0 ? round2(customFinalWeight / inputWeightGrams) : null;

  const totalEnergy = Number(calcPreview.nutrients?.energy?.total);
  if (!Number.isFinite(totalEnergy) || totalEnergy <= 0) {
    throw apiError('INVALID_RECIPE_PAYLOAD', 'Custom recipe payload is invalid or contains zero-energy ingredients.', { status: 400 });
  }

  const totals = {};
  const perServing = {};
  const per100g = {};
  for (const k of RECIPE_METRICS) {
    const tVal = calcPreview.nutrients?.[k]?.total != null ? Number(calcPreview.nutrients[k].total) : null;
    const p100Val = calcPreview.nutrients?.[k]?.per100g != null ? Number(calcPreview.nutrients[k].per100g) : null;
    totals[k] = round2(tVal);
    perServing[k] = tVal == null ? null : round2(tVal / servings);
    per100g[k] = round2(p100Val);
  }

  const now = isoNow();
  const notes = p?.notes != null ? String(p.notes).trim().slice(0, 300) || null : (existing?.notes ?? null);
  const record = {
    id: existing?.id || requestedId || crypto.randomUUID(),
    name,
    servings,
    inputWeightGrams,
    finalWeightGrams: customFinalWeight,
    yieldRatio,
    totalGrams,
    gramsPerServing: round1(totalGrams / servings),
    qualityTier: calcPreview.qualityTier,
    totals,
    perServing,
    per100g,
    ingredients: storedIngredients,
    isApproximate: storedIngredients.some(i => i.isApproximate),
    notes,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  s.customRecipes = s.customRecipes.filter(r => r.id !== record.id);
  s.customRecipes.unshift(record);
  return record;
}

export function deleteCustomRecipe(s, p = {}) {
  const id = typeof p?.id === 'string' ? p.id.trim() : '';
  const list = s.customRecipes || [];
  const idx = list.findIndex(r => r.id === id);
  if (!id || idx < 0) {
    throw apiError('RECIPE_NOT_FOUND', 'Saved custom recipe not found.', { status: 404 });
  }
  s.customRecipes = list.filter(r => r.id !== id);
  return { deleted: true, id };
}

export function listCustomRecipes(s, query = {}) {
  const offset = query?.offset != null && query.offset !== '' ? integer(query.offset, 0, 100000, 'offset') : 0;
  const limit = query?.limit != null && query.limit !== '' ? integer(query.limit, 1, 100, 'limit') : 20;
  const q = typeof query?.q === 'string' ? query.q.trim().toLowerCase() : '';
  let items = [...(s.customRecipes || [])].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (q) {
    items = items.filter(r =>
      String(r.name || '').toLowerCase().includes(q) ||
      (r.ingredients || []).some(i =>
        String(i.name || '').toLowerCase().includes(q) ||
        String(i.nameEn || '').toLowerCase().includes(q) ||
        String(i.nameAr || '').toLowerCase().includes(q)
      )
    );
  }
  const total = items.length;
  const slice = items.slice(offset, offset + limit);
  return {
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : null,
    items: slice
  };
}

// ---------------------------------------------------------------------------
// 2. Dedicated Cardio & Walking Session Tracking (US-WRK-11)
// ---------------------------------------------------------------------------

export function estimateCardioKcal(modality, intensity, durationMinutes, weightKg = 75) {
  const metRow = CARDIO_METS[modality] || CARDIO_METS.walking;
  const met = metRow[intensity] || metRow.moderate;
  const w = Number.isFinite(Number(weightKg)) && Number(weightKg) >= 30 ? Number(weightKg) : 75;
  return Math.max(10, Math.round((met * 3.5 * w / 200) * Number(durationMinutes)));
}

export function evaluateCardioSafetyCaution(s, modality) {
  if (!HIGH_IMPACT_MODALITIES.has(modality)) return null;
  const reasons = [];
  const injuries = canonicalInjuries(s?.onboarding?.workoutPrefs?.injuries || []);
  for (const inj of injuries) {
    if (HIGH_IMPACT_INJURIES.has(inj)) reasons.push(inj);
  }
  if (isPregnantStatus(s?.profile?.maternalStatus)) reasons.push('pregnancy');
  if (s?.profile?.seniorMode === true || Number(s?.profile?.age) >= 70) reasons.push('senior_mode');
  if (!reasons.length) return null;
  const reasonsStr = reasons.join(', ');
  return {
    code: 'CARDIO_HIGH_IMPACT_CAUTION',
    params: { modality, reasons: reasonsStr },
    message: `High-impact cardio (${modality}) logged alongside joint, pregnancy, or senior safety considerations (${reasonsStr}); consider low-impact alternatives like walking, cycling, or swimming if discomfort arises.`
  };
}

export function logCardioSession(s, p = {}) {
  const date = logDateFor(s, p?.date);
  const modality = typeof p?.modality === 'string' ? p.modality.trim() : '';
  if (!CARDIO_MODALITY_SET.has(modality)) {
    throw apiError('INVALID_CARDIO_PAYLOAD', 'Cardio modality is invalid or unsupported.', { status: 400 });
  }
  const intensity = p?.intensity == null ? 'moderate' : String(p.intensity).trim();
  if (!CARDIO_INTENSITIES.has(intensity)) {
    throw apiError('INVALID_CARDIO_PAYLOAD', 'Cardio intensity must be low, moderate, or vigorous.', { status: 400 });
  }
  const durNum = Number(p?.durationMinutes);
  if (!Number.isInteger(durNum) || durNum < 5 || durNum > 360) {
    throw apiError('INVALID_CARDIO_PAYLOAD', 'durationMinutes must be an integer between 5 and 360.', { status: 400 });
  }
  const source = p?.source == null ? 'manual' : String(p.source).trim();
  if (!CARDIO_SOURCES.has(source)) {
    throw apiError('INVALID_CARDIO_PAYLOAD', 'Cardio source must be manual, health_connect, or apple_health.', { status: 400 });
  }
  let distanceKm = null;
  if (p?.distanceKm != null && p.distanceKm !== '') {
    const d = Number(p.distanceKm);
    if (!Number.isFinite(d) || d < 0 || d > 300) {
      throw apiError('INVALID_CARDIO_PAYLOAD', 'distanceKm must be between 0 and 300.', { status: 400 });
    }
    distanceKm = round2(d);
  }
  let caloriesKcal = null;
  if (p?.caloriesKcal != null && p.caloriesKcal !== '') {
    const c = Number(p.caloriesKcal);
    if (!Number.isFinite(c) || c < 10 || c > 5000) {
      throw apiError('INVALID_CARDIO_PAYLOAD', 'caloriesKcal must be between 10 and 5000.', { status: 400 });
    }
    caloriesKcal = Math.round(c);
  }
  const externalRecordId = p?.externalRecordId != null && String(p.externalRecordId).trim()
    ? String(p.externalRecordId).trim().slice(0, 128)
    : null;
  const notes = p?.notes != null ? String(p.notes).trim().slice(0, 300) || null : null;

  s.cardioLogs ||= [];
  let existing = null;
  if (externalRecordId) {
    existing = s.cardioLogs.find(c => c.source === source && c.externalRecordId === externalRecordId) || null;
  }
  if (!existing && typeof p?.id === 'string' && p.id.trim()) {
    existing = s.cardioLogs.find(c => c.id === p.id.trim()) || null;
  }

  const sameDayCount = s.cardioLogs.filter(c => c.date === date && c.id !== existing?.id).length;
  if (sameDayCount >= MAX_CARDIO_PER_DAY) {
    throw apiError('CARDIO_DAILY_LIMIT_EXCEEDED', `Maximum number of cardio sessions (${MAX_CARDIO_PER_DAY}) logged for this date has been reached.`, {
      status: 400,
      params: { max: MAX_CARDIO_PER_DAY }
    });
  }

  const estimatedKcal = caloriesKcal != null
    ? caloriesKcal
    : estimateCardioKcal(modality, intensity, durNum, Number(s?.profile?.weight) || 75);
  const safetyCaution = evaluateCardioSafetyCaution(s, modality);
  const now = isoNow();
  const record = {
    id: existing?.id || (typeof p?.id === 'string' && p.id.trim() ? p.id.trim().slice(0, 80) : crypto.randomUUID()),
    date,
    modality,
    durationMinutes: durNum,
    intensity,
    distanceKm,
    estimatedKcal,
    caloriesSource: caloriesKcal != null ? 'user_or_wearable' : 'met_estimate',
    source,
    externalRecordId,
    notes,
    safetyCaution,
    at: existing?.at || now,
    updatedAt: now
  };

  s.cardioLogs = s.cardioLogs.filter(c => c.id !== record.id);
  s.cardioLogs.push(record);
  return record;
}

export function deleteCardioSession(s, p = {}) {
  const id = typeof p?.id === 'string' ? p.id.trim() : '';
  const list = s.cardioLogs || [];
  if (!id || !list.some(c => c.id === id)) {
    throw apiError('CARDIO_LOG_NOT_FOUND', 'Cardio session log not found.', { status: 404 });
  }
  s.cardioLogs = list.filter(c => c.id !== id);
  return { deleted: true, id };
}

export function dailyCardioMinutes(s, date) {
  return (s?.cardioLogs || [])
    .filter(c => c.date === date)
    .reduce((sum, c) => sum + Number(c.durationMinutes || 0), 0);
}

export function todayCardioSummary(s, date) {
  const day = (s?.cardioLogs || []).filter(c => c.date === date);
  return {
    sessionsCount: day.length,
    totalMinutes: day.reduce((sum, c) => sum + Number(c.durationMinutes || 0), 0),
    totalKcal: day.reduce((sum, c) => sum + Number(c.estimatedKcal || 0), 0)
  };
}

export function listCardioLogs(s, query = {}) {
  const offset = query?.offset != null && query.offset !== '' ? integer(query.offset, 0, 100000, 'offset') : 0;
  const limit = query?.limit != null && query.limit !== '' ? integer(query.limit, 1, 100, 'limit') : 30;
  const from = query?.from ? String(query.from).trim() : null;
  const to = query?.to ? String(query.to).trim() : null;
  if (from && !validDate(from)) throw apiError('INVALID_DATE_RANGE', 'from must be a valid YYYY-MM-DD date.', { status: 400 });
  if (to && !validDate(to)) throw apiError('INVALID_DATE_RANGE', 'to must be a valid YYYY-MM-DD date.', { status: 400 });

  let items = [...(s.cardioLogs || [])];
  if (from) items = items.filter(c => c.date >= from);
  if (to) items = items.filter(c => c.date <= to);
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  const summary = {
    sessionsCount: items.length,
    totalMinutes: items.reduce((sum, c) => sum + Number(c.durationMinutes || 0), 0),
    totalKcal: items.reduce((sum, c) => sum + Number(c.estimatedKcal || 0), 0)
  };
  const total = items.length;
  const slice = items.slice(offset, offset + limit);
  return {
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : null,
    summary,
    items: slice
  };
}

// ---------------------------------------------------------------------------
// 3. Optional Female Menstrual Cycle Awareness (US-PRG-06)
// ---------------------------------------------------------------------------

function assertFemaleProfile(s) {
  if (s?.profile?.sex !== 'female') {
    throw apiError('CYCLE_TRACKING_UNAVAILABLE', 'Menstrual cycle awareness is only available for female profiles.', { status: 403 });
  }
}

export function updateCycleSettings(s, p = {}) {
  assertFemaleProfile(s);
  if (typeof p?.enabled !== 'boolean') {
    throw apiError('INVALID_CYCLE_PAYLOAD', 'Boolean enabled field is required for cycle_settings.', { status: 400 });
  }
  if (p?.discreetMode !== undefined && typeof p.discreetMode !== 'boolean') {
    throw apiError('INVALID_CYCLE_PAYLOAD', 'discreetMode must be a boolean.', { status: 400 });
  }
  if (p?.adaptiveThemeEnabled !== undefined && typeof p.adaptiveThemeEnabled !== 'boolean') {
    throw apiError('INVALID_CYCLE_PAYLOAD', 'adaptiveThemeEnabled must be a boolean.', { status: 400 });
  }
  const prev = s.cycleSettings || { enabled: false, averageCycleLengthDays: 28, averagePeriodLengthDays: 5, lastPeriodStartDate: null, discreetMode: false, adaptiveThemeEnabled: true };
  const avgCycle = p.averageCycleLengthDays !== undefined ? Number(p.averageCycleLengthDays) : prev.averageCycleLengthDays;
  const avgPeriod = p.averagePeriodLengthDays !== undefined ? Number(p.averagePeriodLengthDays) : prev.averagePeriodLengthDays;
  if (!Number.isInteger(avgCycle) || avgCycle < 21 || avgCycle > 45) {
    throw apiError('INVALID_CYCLE_PAYLOAD', 'averageCycleLengthDays must be an integer between 21 and 45.', { status: 400 });
  }
  if (!Number.isInteger(avgPeriod) || avgPeriod < 2 || avgPeriod > 10 || avgPeriod >= avgCycle) {
    throw apiError('INVALID_CYCLE_PAYLOAD', 'averagePeriodLengthDays must be an integer between 2 and 10.', { status: 400 });
  }
  const today = localDate(clockNow(), userTz(s));
  let lastPeriodStartDate = prev.lastPeriodStartDate ?? null;
  if (p.lastPeriodStartDate !== undefined) {
    if (p.lastPeriodStartDate === null || p.lastPeriodStartDate === '') {
      lastPeriodStartDate = null;
    } else {
      const d = String(p.lastPeriodStartDate).trim();
      if (!validDate(d) || d > today || d < dateOffset(today, -180)) {
        throw apiError('INVALID_CYCLE_PAYLOAD', 'lastPeriodStartDate must be a valid YYYY-MM-DD date within the last 180 days and not in the future.', { status: 400 });
      }
      lastPeriodStartDate = d;
    }
  }
  const discreetMode = p?.discreetMode !== undefined ? p.discreetMode : Boolean(prev.discreetMode);
  const adaptiveThemeEnabled = p?.adaptiveThemeEnabled !== undefined ? p.adaptiveThemeEnabled : (prev.adaptiveThemeEnabled !== undefined ? Boolean(prev.adaptiveThemeEnabled) : true);
  s.cycleSettings = {
    enabled: p.enabled,
    averageCycleLengthDays: avgCycle,
    averagePeriodLengthDays: avgPeriod,
    lastPeriodStartDate,
    discreetMode,
    adaptiveThemeEnabled,
    updatedAt: isoNow()
  };
  return s.cycleSettings;
}

export function logCycleEntry(s, p = {}) {
  assertFemaleProfile(s);
  const date = logDateFor(s, p?.date);
  const periodStart = p?.periodStart === undefined ? false : p.periodStart;
  if (typeof periodStart !== 'boolean') {
    throw apiError('INVALID_CYCLE_PAYLOAD', 'periodStart must be a boolean.', { status: 400 });
  }
  const flowLevel = p?.flowLevel == null ? (periodStart ? 'medium' : 'none') : String(p.flowLevel).trim();
  if (!CYCLE_FLOW_LEVELS.has(flowLevel)) {
    throw apiError('INVALID_CYCLE_PAYLOAD', 'flowLevel must be none, spotting, light, medium, or heavy.', { status: 400 });
  }
  const crampSeverity = p?.crampSeverity == null ? 0 : Number(p.crampSeverity);
  if (!Number.isInteger(crampSeverity) || crampSeverity < 0 || crampSeverity > 5) {
    throw apiError('INVALID_CYCLE_PAYLOAD', 'crampSeverity must be an integer between 0 and 5.', { status: 400 });
  }
  let symptoms = [];
  if (p?.symptoms !== undefined) {
    if (!Array.isArray(p.symptoms) || p.symptoms.some(x => typeof x !== 'string' || !CYCLE_SYMPTOMS.has(x))) {
      throw apiError('INVALID_CYCLE_PAYLOAD', 'symptoms must be an array of supported wellness symptom keys.', { status: 400 });
    }
    symptoms = [...new Set(p.symptoms)];
  }
  const notes = p?.notes != null ? String(p.notes).trim().slice(0, 300) || null : null;

  s.cycleLogs ||= [];
  const now = isoNow();
  const entry = {
    date,
    periodStart,
    flowLevel,
    symptoms,
    crampSeverity,
    notes,
    updatedAt: now
  };
  s.cycleLogs = s.cycleLogs.filter(x => x.date !== date);
  s.cycleLogs.push(entry);
  s.cycleLogs.sort((a, b) => a.date.localeCompare(b.date));

  if (periodStart) {
    const prev = s.cycleSettings || { enabled: true, averageCycleLengthDays: 28, averagePeriodLengthDays: 5, lastPeriodStartDate: null };
    const nextAnchor = !prev.lastPeriodStartDate || date > prev.lastPeriodStartDate ? date : prev.lastPeriodStartDate;
    s.cycleSettings = {
      ...prev,
      lastPeriodStartDate: nextAnchor,
      updatedAt: now
    };
  }
  return entry;
}

function resolveCycleAccentToken(phase, discreetMode, adaptiveThemeEnabled) {
  if (discreetMode || !adaptiveThemeEnabled) return 'neutral';
  if (phase === 'paused_pregnancy') return 'maternal_warm';
  if (phase === 'menstrual') return 'menstrual_clay';
  if (phase === 'follicular') return 'follicular_sage';
  if (phase === 'ovulatory') return 'ovulatory_gold';
  if (phase === 'luteal') return 'luteal_plum';
  return 'neutral';
}

export function computeCycleState(s, now = clockNow()) {
  if (s?.profile?.sex !== 'female') {
    return {
      available: false,
      enabled: false,
      pausedReason: null,
      disclaimer: CYCLE_DISCLAIMER,
      settings: null,
      currentCycleDay: null,
      phase: null,
      waterRetentionLikely: false,
      nextPeriodEstimateDate: null,
      coachingHintCode: null,
      discreetMode: false,
      adaptiveThemeEnabled: true,
      phaseAccentToken: 'neutral',
      suggestedGentleSession: false,
      isOverdue: false,
      overdueDays: 0,
      recentLogs: []
    };
  }

  const discreetMode = Boolean(s.cycleSettings?.discreetMode);
  const adaptiveThemeEnabled = s.cycleSettings?.adaptiveThemeEnabled !== false;
  const settings = {
    enabled: Boolean(s.cycleSettings?.enabled),
    averageCycleLengthDays: s.cycleSettings?.averageCycleLengthDays ?? 28,
    averagePeriodLengthDays: s.cycleSettings?.averagePeriodLengthDays ?? 5,
    lastPeriodStartDate: s.cycleSettings?.lastPeriodStartDate ?? null,
    discreetMode,
    adaptiveThemeEnabled
  };
  const recentLogs = [...(s.cycleLogs || [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 30);

  if (!settings.enabled) {
    return {
      available: true,
      enabled: false,
      pausedReason: null,
      disclaimer: CYCLE_DISCLAIMER,
      settings,
      currentCycleDay: null,
      phase: null,
      waterRetentionLikely: false,
      nextPeriodEstimateDate: null,
      coachingHintCode: null,
      discreetMode,
      adaptiveThemeEnabled,
      phaseAccentToken: 'neutral',
      suggestedGentleSession: false,
      isOverdue: false,
      overdueDays: 0,
      recentLogs
    };
  }

  if (isPregnantStatus(s.profile?.maternalStatus)) {
    return {
      available: true,
      enabled: true,
      pausedReason: 'pregnancy',
      disclaimer: CYCLE_DISCLAIMER,
      settings,
      currentCycleDay: null,
      phase: 'paused_pregnancy',
      waterRetentionLikely: false,
      nextPeriodEstimateDate: null,
      coachingHintCode: 'CYCLE_PAUSED_PREGNANCY',
      discreetMode,
      adaptiveThemeEnabled,
      phaseAccentToken: resolveCycleAccentToken('paused_pregnancy', discreetMode, adaptiveThemeEnabled),
      suggestedGentleSession: false,
      isOverdue: false,
      overdueDays: 0,
      recentLogs
    };
  }

  const today = localDate(now, userTz(s));
  const loggedStart = (s.cycleLogs || [])
    .filter(l => l.periodStart === true && validDate(l.date) && l.date <= today)
    .map(l => l.date)
    .sort()
    .at(-1) || null;
  const anchorCandidates = [settings.lastPeriodStartDate, loggedStart].filter(d => d && validDate(d) && d <= today).sort();
  const anchorDate = anchorCandidates.at(-1) || null;

  if (!anchorDate) {
    return {
      available: true,
      enabled: true,
      pausedReason: null,
      disclaimer: CYCLE_DISCLAIMER,
      settings,
      currentCycleDay: null,
      phase: 'unknown',
      waterRetentionLikely: false,
      nextPeriodEstimateDate: null,
      coachingHintCode: null,
      discreetMode,
      adaptiveThemeEnabled,
      phaseAccentToken: 'neutral',
      suggestedGentleSession: false,
      isOverdue: false,
      overdueDays: 0,
      recentLogs
    };
  }

  const elapsedDays = Math.max(0, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${anchorDate}T12:00:00Z`)) / 86400000));
  const cycleLen = settings.averageCycleLengthDays;
  const periodLen = settings.averagePeriodLengthDays;
  const isOverdue = elapsedDays >= cycleLen;
  const overdueDays = isOverdue ? elapsedDays - cycleLen : 0;
  const currentCycleDay = elapsedDays + 1;
  const nextPeriodEstimateDate = isOverdue ? null : dateOffset(today, cycleLen - elapsedDays);
  const ovulationDay = Math.max(periodLen + 2, cycleLen - 14);

  let phase = 'luteal';
  let coachingHintCode = null;
  let waterRetentionLikely = false;

  if (!isOverdue && currentCycleDay <= periodLen) {
    phase = 'menstrual';
    waterRetentionLikely = currentCycleDay <= 2;
    coachingHintCode = 'CYCLE_MENSTRUAL_GENTLE_TRAINING';
  } else if (!isOverdue && currentCycleDay < ovulationDay - 1) {
    phase = 'follicular';
    coachingHintCode = 'CYCLE_FOLLICULAR_PEAK_READINESS';
  } else if (!isOverdue && currentCycleDay <= ovulationDay + 1) {
    phase = 'ovulatory';
    coachingHintCode = null;
  } else {
    phase = 'luteal';
    if (isOverdue || currentCycleDay >= cycleLen - 5) {
      waterRetentionLikely = true;
      coachingHintCode = 'CYCLE_LUTEAL_WATER_RETENTION';
    }
  }

  const yesterday = dateOffset(today, -1);
  const recentSymLog = (s.cycleLogs || []).find(l => l.date === today || l.date === yesterday);
  const suggestedGentleSession = phase === 'menstrual' && (
    currentCycleDay <= 3 ||
    Number(recentSymLog?.crampSeverity || 0) >= 3 ||
    recentSymLog?.flowLevel === 'heavy' ||
    (Array.isArray(recentSymLog?.symptoms) && recentSymLog.symptoms.includes('fatigue'))
  );

  return {
    available: true,
    enabled: true,
    pausedReason: null,
    disclaimer: CYCLE_DISCLAIMER,
    settings: { ...settings, lastPeriodStartDate: anchorDate },
    currentCycleDay,
    phase,
    waterRetentionLikely,
    nextPeriodEstimateDate,
    coachingHintCode,
    discreetMode,
    adaptiveThemeEnabled,
    phaseAccentToken: resolveCycleAccentToken(phase, discreetMode, adaptiveThemeEnabled),
    suggestedGentleSession,
    isOverdue,
    overdueDays,
    recentLogs
  };
}

export function bootstrapCycleSummary(s, now = clockNow()) {
  if (s?.profile?.sex !== 'female' || !s?.cycleSettings?.enabled) return null;
  const state = computeCycleState(s, now);
  return {
    enabled: state.enabled,
    phase: state.phase,
    cycleDay: state.currentCycleDay,
    waterRetentionLikely: state.waterRetentionLikely,
    pausedReason: state.pausedReason,
    nextPeriodEstimateDate: state.nextPeriodEstimateDate,
    coachingHintCode: state.coachingHintCode,
    discreetMode: state.discreetMode,
    adaptiveThemeEnabled: state.adaptiveThemeEnabled,
    phaseAccentToken: state.phaseAccentToken,
    suggestedGentleSession: state.suggestedGentleSession,
    isOverdue: state.isOverdue,
    overdueDays: state.overdueDays
  };
}
