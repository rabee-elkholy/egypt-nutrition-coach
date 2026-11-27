// KAN-121 (US-MON-05): Value-Led Retention Suite — Pro Impact Ledger, Pause Plan & Clinical Summary PDF DTO
import { clockNow, isoNow, clockTimeZone } from './clock.mjs';
import {
  localDate,
  dateOffset,
  normalizeLocale,
  canonicalInjuries,
  isPregnantStatus
} from '../coaching-shared.mjs';
import { apiError } from '../coaching-error.mjs';
import { dailyWaterTarget } from './coaching.mjs';
import { activePlan, dayTotals } from './food.mjs';
import { computeWorkoutPrs } from './workouts-insights.mjs';
import { computeProgressAnalytics } from './progress-analytics.mjs';
import { resolveEntitlements } from './subscriptions.mjs';
import { INJURY_POLICY_VERSION } from './workouts.mjs';

const VALID_RETENTION_INTENTS = new Set([
  'pause_14d',
  'pause_30d',
  'maintenance_mode',
  'proceed_to_store_cancel'
]);

const CONDITION_GUARDRAIL_SUMMARIES = {
  diabetes: 'Glycemic carbohydrate ceiling (<= 40% kcal) and low-glycemic meal selection.',
  diabetes_t1: 'Type 1 diabetes glycemic carbohydrate pacing (<= 40% kcal) with fasted workout caution.',
  diabetes_t2: 'Type 2 diabetes glycemic carbohydrate control (<= 40% kcal) and steady protein distribution.',
  hypertension: 'DASH-aligned sodium ceiling (<= 2300 mg/day) and moderate-intensity non-Valsalva training.',
  cholesterol: 'Cardiovascular saturated fat cap (<= 8% kcal) and lean unsaturated fat emphasis.',
  celiac: 'Strict gluten-free food exclusions across all meals and swaps.',
  ibs: 'Digestive comfort exclusions and +150 ml daily hydration adjustment.',
  gout: 'Purine-aware protein cap (<= 1.4 g/kg) and +500 ml daily hydration support.',
  kidney: 'Clinician-guided renal support: <= 2000 mg sodium/day, protein cap <= 1.1 g/kg, and 2.5 L fluid ceiling.',
  pcos: 'Insulin-sensitive carbohydrate pacing and consistent protein targeting.',
  insulin_resistance: 'Moderate carbohydrate ceiling (<= 40% kcal) paired with high fiber intake.',
  hypothyroid: 'Conservative 5% resting energy calibration tracked against 7-day rolling weight trends.',
  favism: 'Strict fava bean and falafel exclusion across planning and meal swaps.',
  lactose_intolerance: 'Complete dairy exclusion across meals and pantry recommendations.'
};

async function sumQuotaByKey(db, userId, quotaKey) {
  try {
    const row = await db.prepare(
      'SELECT COALESCE(SUM(used_count), 0) AS total FROM coaching_usage_quotas WHERE user_id=? AND quota_key=?'
    ).bind(userId, quotaKey).first();
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

export async function computeProImpactLedger(db, s, userId, env = null, now = clockNow()) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const ent = await resolveEntitlements(db, s, userId, today, env);

  const journeyStart = s?.onboarding?.journeyStartedOn || s?.nutritionContextStartedOn || dateOffset(today, -29);
  const daysElapsed = Math.max(1, Math.min(365, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${journeyStart}T12:00:00Z`)) / 86400000) + 1));
  const cycleDays = Math.min(30, daysElapsed);
  const windowStart = dateOffset(today, -(cycleDays - 1));

  const [mealCapturesCount, specialistConsultationsCount, barcodeScansCount] = await Promise.all([
    sumQuotaByKey(db, userId, 'meal_capture'),
    sumQuotaByKey(db, userId, 'specialist_consultation'),
    sumQuotaByKey(db, userId, 'barcode_scan')
  ]);

  const foodDatesInWindow = new Set([
    ...(s?.foodLogs || []).filter(f => f.date >= windowStart && f.date <= today && Number(f.energy || 0) > 0).map(f => f.date),
    ...(s?.foodEntries || []).filter(e => e.date >= windowStart && e.date <= today).map(e => e.date)
  ]);
  const activeRef = (s?.planRefs || []).find(r => r.id === s?.active_plan_id) || (s?.planRefs || []).at(-1) || null;
  const planProtein = Number(activePlan(s)?.targets?.protein || activeRef?.protein || 0);
  let proteinAdherentDays = 0;
  for (const d of foodDatesInWindow) {
    const fLog = (s?.foodLogs || []).find(x => x.date === d);
    const diary = dayTotals(s, d);
    const dayProtein = diary.totals?.protein != null ? Number(diary.totals.protein) : (fLog?.protein != null ? Number(fLog.protein) : null);
    if (dayProtein != null && (planProtein > 0 ? dayProtein >= planProtein * 0.85 : dayProtein >= 60)) {
      proteinAdherentDays++;
    }
  }
  const proteinAdherencePct = foodDatesInWindow.size ? Math.round((proteinAdherentDays / foodDatesInWindow.size) * 100) : 0;

  const recentWater = (s?.waterLogs || []).filter(w => w.date >= windowStart && w.date <= today);
  const waterAdherentDays = recentWater.filter(w => {
    const tgt = w.targetCups || dailyWaterTarget(s, w.date).targetCups;
    return Number(w.cups || 0) >= Math.ceil(tgt * 0.8);
  }).length;
  const hydrationAdherencePct = recentWater.length ? Math.round((waterAdherentDays / recentWater.length) * 100) : 0;

  const completedScheduled = (s?.sessions || []).filter(x => x.date >= windowStart && x.date <= today && x.status === 'completed').length;
  const completedOpen = (s?.openWorkoutSessions || []).filter(x => x.date >= windowStart && x.date <= today).length;
  const sessionsCompleted = completedScheduled + completedOpen;

  const prs = computeWorkoutPrs(s, { since: windowStart });
  const prsAchieved = prs.items.length;

  const dateFromIsoOrStr = val => {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const ms = Date.parse(val);
    return Number.isFinite(ms) ? localDate(ms, tz) : null;
  };
  const inWindow = d => Boolean(d && d >= windowStart && d <= today);

  // Calibrations strictly scoped to [windowStart, today] with ZERO double-counting between acceptedAdaptations and planRefs
  const acceptedAdaptationsInWindow = (s?.adaptations || []).filter(a => {
    if (a.status !== 'accepted') return false;
    const d = dateFromIsoOrStr(a.decidedAt || a.resolvedAt || a.updatedAt || a.createdAt || a.at);
    return inWindow(d);
  });
  const acceptedCalorieDates = new Set(
    acceptedAdaptationsInWindow
      .filter(a => ['calories', 'maintenance'].includes(a.kind))
      .map(a => dateFromIsoOrStr(a.decidedAt || a.resolvedAt || a.updatedAt || a.createdAt || a.at))
      .filter(Boolean)
  );
  const weeklyCheckinsInWindow = (s?.coachingFeedback || []).filter(f => inWindow(f.date)).length;

  const uniquePlansById = new Map();
  for (const r of s?.planRefs || []) if (r?.id) uniquePlansById.set(r.id, r);
  for (const p of s?.plans || []) {
    if (p?.id && !uniquePlansById.has(p.id)) {
      uniquePlansById.set(p.id, { id: p.id, start_date: p.start_date, created_at: p.created_at, reason: p.changeReason || 'Initial plan' });
    }
  }
  const orderedPlans = [...uniquePlansById.values()].sort((a, b) => String(a.created_at || a.start_date || '').localeCompare(String(b.created_at || b.start_date || '')));
  const initialPlanId = orderedPlans[0]?.id || null;
  const plansInWindow = orderedPlans.filter(p => inWindow(dateFromIsoOrStr(p.created_at || p.start_date)));
  const nonAdaptationRenewalsInWindow = plansInWindow.filter(p => {
    if (p.id === initialPlanId) return false;
    const reason = String(p.reason || '');
    const pDate = dateFromIsoOrStr(p.created_at || p.start_date);
    if (/adapt|retarget|calorie|maintenance|post_feast/i.test(reason)) return false;
    if (pDate && acceptedCalorieDates.has(pDate)) return false;
    return true;
  }).length;
  const calibrationsApplied = acceptedAdaptationsInWindow.length + weeklyCheckinsInWindow + nonAdaptationRenewalsInWindow;

  const checkedGroceries = Object.values(s?.groceryChecks || {}).filter(v => v?.checked).length;
  const batchPrepBonusMin = (s?.preferences?.batchPrepMode || s?.profile?.batchPrepMode) ? 45 : 0;
  const mealSwapsInWindow = (s?.foodEntries || []).filter(e =>
    e.date >= windowStart && e.date <= today && (e.fromPantry === true || e.source === 'dining_out' || e.source === 'pantry')
  ).length + (s?.history || []).filter(h =>
    h.kind === 'meal_replace' && inWindow(dateFromIsoOrStr(h.at))
  ).length;
  const weeklyPlanTimeSavedMin = Math.min(plansInWindow.length, 5) * 20;
  const adaptivePlanTimeSavedMin = acceptedAdaptationsInWindow.length * 12;
  const swapTimeSavedMin = Math.min(mealSwapsInWindow, 30) * 5;
  const estimatedMinutesSaved = Math.round(
    mealCapturesCount * 2.5 +
    barcodeScansCount * 1.5 +
    specialistConsultationsCount * 4 +
    checkedGroceries * 1.5 +
    batchPrepBonusMin +
    weeklyPlanTimeSavedMin +
    adaptivePlanTimeSavedMin +
    swapTimeSavedMin
  );

  let renewalReminderEligible = false;
  if (ent.expiresAt && ent.tier === 'pro') {
    const msLeft = Date.parse(ent.expiresAt) - now;
    renewalReminderEligible = msLeft > 0 && msLeft <= 5 * 86400000;
  }

  return {
    cycleDays,
    estimatedMinutesSaved,
    calibrationsApplied,
    prsAchieved,
    proteinAdherencePct,
    hydrationAdherencePct,
    sessionsCompleted,
    mealCapturesCount,
    specialistConsultationsCount,
    barcodeScansCount,
    renewalReminderEligible,
    nextRenewalAt: ent.expiresAt || null,
    managementUrl: ent.managementUrl || null
  };
}

export async function recordRetentionIntent(db, s, userId, body = {}, env = null) {
  const intent = String(body?.intent || '').trim();
  if (!VALID_RETENTION_INTENTS.has(intent)) {
    throw apiError('INVALID_RETENTION_INTENT', 'intent must be pause_14d, pause_30d, maintenance_mode, or proceed_to_store_cancel.', {
      status: 400,
      params: { intent }
    });
  }
  const reasonCode = String(body?.reasonCode || 'USER_INITIATED').trim().slice(0, 80) || 'USER_INITIATED';
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(clockNow(), tz);
  const nowIso = isoNow();
  const intentId = `ret_${crypto.randomUUID()}`;

  let pauseUntil = null;
  let coachingPaused = false;

  if (intent === 'pause_14d' || intent === 'pause_30d') {
    const days = intent === 'pause_30d' ? 30 : 14;
    pauseUntil = dateOffset(today, days);
    coachingPaused = true;
    s.coachingPause = {
      active: true,
      intent,
      reasonCode,
      startedOn: today,
      pauseUntil,
      updatedAt: nowIso
    };
  } else if (intent === 'maintenance_mode') {
    s.coachingPause = {
      active: false,
      intent,
      reasonCode,
      maintenancePreferred: true,
      pauseUntil: null,
      updatedAt: nowIso
    };
  } else if (intent === 'proceed_to_store_cancel') {
    // Transparent handoff — zero obstruction, preserve history
    s.coachingPause = s.coachingPause || null;
  }

  try {
    await db.prepare(
      'INSERT INTO coaching_retention_intents(id,user_id,intent,reason_code,pause_until,created_at) VALUES(?,?,?,?,?,?)'
    ).bind(intentId, userId, intent, reasonCode, pauseUntil, nowIso).run();
  } catch (e) {
    if (!/no such table/i.test(e?.message || '')) throw e;
  }

  const ent = await resolveEntitlements(db, s, userId, today, env);

  return {
    recorded: true,
    intentId,
    intent,
    reasonCode,
    pauseUntil,
    coachingPaused,
    billingDisclosureCode: 'STORE_BILLING_MANAGED_BY_PLATFORM',
    billingDisclosureEn: 'Pausing coaching goals pauses daily nudges and streak pressure inside CuraFit. Subscription billing pause or cancellation is governed directly through your Apple App Store or Google Play account settings.',
    managementUrl: ent.managementUrl || null,
    createdAt: nowIso
  };
}

export function buildClinicalSummaryReport(s, { periodDays = 30, locale = 'en' } = {}, now = clockNow()) {
  const daysNum = Number(periodDays);
  if (daysNum !== 30 && daysNum !== 90) {
    throw apiError('INVALID_DATE_RANGE', 'periodDays must be 30 or 90.', { status: 400, params: { field: 'periodDays' } });
  }
  const normalizedLocale = normalizeLocale(String(locale || 'en'), 'en') || 'en';
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const windowStart = dateOffset(today, -(daysNum - 1));
  const profile = s?.profile || {};
  const plan = activePlan(s);
  const waterTarget = dailyWaterTarget(s, today);
  const analytics = computeProgressAnalytics(s, { range: daysNum === 90 ? '90d' : '30d' }, now);

  const ws = analytics.weightSeries || [];
  const ma = analytics.weightMovingAvg7d || [];
  const startKg = ws.length ? ws[0].kg : (profile.weight != null ? Number(profile.weight) : null);
  const endKg = ws.length ? ws.at(-1).kg : (profile.weight != null ? Number(profile.weight) : null);
  const deltaKg = startKg != null && endKg != null ? Math.round((endKg - startKg) * 100) / 100 : null;
  const movingAvg7dStartKg = ma.length ? ma[0].avgKg : startKg;
  const movingAvg7dEndKg = ma.length ? ma.at(-1).avgKg : endKg;
  const weeksSpan = Math.max(1, daysNum / 7);
  const weeklyAvgDeltaPct = movingAvg7dStartKg && movingAvg7dEndKg
    ? Math.round(((movingAvg7dEndKg - movingAvg7dStartKg) / movingAvg7dStartKg) * (100 / weeksSpan) * 100) / 100
    : null;

  const bmi = profile.weight && profile.height
    ? Math.round((Number(profile.weight) / ((Number(profile.height) / 100) ** 2)) * 10) / 10
    : null;

  const diseases = Array.isArray(profile.diseases) ? profile.diseases.filter(d => d && d !== 'none') : [];
  const clinicalGuardrails = diseases.map(cond => ({
    code: `GUARDRAIL_${String(cond).toUpperCase()}`,
    condition: cond,
    summaryEn: CONDITION_GUARDRAIL_SUMMARIES[cond] || `Clinical adaptation active for ${cond}.`
  }));
  if (isPregnantStatus(profile.maternalStatus)) {
    clinicalGuardrails.push({
      code: 'GUARDRAIL_MATERNAL_PREGNANCY',
      condition: profile.maternalStatus,
      summaryEn: 'Pregnancy safety mode active: minimum 1800 kcal floor, calorie deficits disabled, supine/high-impact exercises excluded.'
    });
  } else if (profile.maternalStatus === 'breastfeeding') {
    clinicalGuardrails.push({
      code: 'GUARDRAIL_MATERNAL_BREASTFEEDING',
      condition: 'breastfeeding',
      summaryEn: 'Lactation safety mode active: minimum 1600 kcal floor, +400 kcal lactation buffer, max -300 kcal deficit.'
    });
  }
  if (profile.seniorMode || Number(profile.age) >= 70) {
    clinicalGuardrails.push({
      code: 'GUARDRAIL_SENIOR_70_PLUS',
      condition: 'senior_mode',
      summaryEn: 'Senior safety mode (70+): deficit capped at -400 kcal, protein >= 1.2 g/kg, 3.5 L hydration cap, low-impact movements.'
    });
  }

  const activeInjuries = canonicalInjuries(s?.onboarding?.workoutPrefs?.injuries || []).map(inj => ({
    injuryId: inj,
    policyVersion: INJURY_POLICY_VERSION,
    status: 'precautionary_exclusions_active'
  }));

  const periodFood = (s?.foodLogs || []).filter(f => f.date >= windowStart && f.date <= today && Number(f.energy || 0) > 0);
  const avgCaloriesKcal = periodFood.length
    ? Math.round(periodFood.reduce((sum, f) => sum + Number(f.energy || 0), 0) / periodFood.length)
    : null;
  const proteinLogged = periodFood.filter(f => f.protein != null);
  const avgProteinG = proteinLogged.length
    ? Math.round(proteinLogged.reduce((sum, f) => sum + Number(f.protein || 0), 0) / proteinLogged.length)
    : null;
  const adhFood = periodFood.filter(f => f.adherence != null);
  const foodAdherencePct = adhFood.length
    ? Math.round(adhFood.reduce((sum, f) => sum + Number(f.adherence || 0), 0) / adhFood.length)
    : null;

  const periodWater = (s?.waterLogs || []).filter(w => w.date >= windowStart && w.date <= today);
  const hydrationAdherentDays = periodWater.filter(w => Number(w.cups || 0) >= Math.ceil((w.targetCups || waterTarget.targetCups) * 0.8)).length;
  const hydrationAdherencePct = periodWater.length ? Math.round((hydrationAdherentDays / periodWater.length) * 100) : null;

  const workoutsCompleted =
    (s?.sessions || []).filter(x => x.date >= windowStart && x.date <= today && x.status === 'completed').length +
    (s?.openWorkoutSessions || []).filter(x => x.date >= windowStart && x.date <= today).length;
  const cardioMinutesTotal = (s?.cardioLogs || [])
    .filter(c => c.date >= windowStart && c.date <= today)
    .reduce((sum, c) => sum + Number(c.durationMinutes || 0), 0);
  const periodCheckins = (s?.checkins || []).filter(c => c.date >= windowStart && c.date <= today && Number.isFinite(Number(c.sleepHours)));
  const avgSleepHours = periodCheckins.length
    ? Math.round((periodCheckins.reduce((sum, c) => sum + Number(c.sleepHours), 0) / periodCheckins.length) * 10) / 10
    : null;

  return {
    generatedAt: isoNow(),
    periodDays: daysNum,
    windowStart,
    windowEnd: today,
    locale: normalizedLocale,
    patientProfile: {
      name: profile.name || null,
      age: profile.age ?? null,
      sex: profile.sex || null,
      heightCm: profile.height ?? null,
      currentWeightKg: endKg ?? profile.weight ?? null,
      bmi,
      unitSystem: profile.unitSystem || 'metric',
      region: s?.preferences?.region || profile.region || 'egypt',
      serviceTrack: s?.onboarding?.serviceTrack || null,
      maternalStatus: profile.maternalStatus || 'none',
      seniorMode: Boolean(profile.seniorMode)
    },
    weightTrend: {
      startKg,
      endKg,
      deltaKg,
      movingAvg7dStartKg,
      movingAvg7dEndKg,
      weeklyAvgDeltaPct,
      measurementsCount: ws.length
    },
    activeTargets: {
      dailyCaloriesKcal: plan?.targets?.energy != null ? Number(plan.targets.energy) : null,
      proteinG: plan?.targets?.protein != null ? Number(plan.targets.protein) : null,
      carbsG: plan?.targets?.carbs != null ? Number(plan.targets.carbs) : null,
      fatG: plan?.targets?.fat != null ? Number(plan.targets.fat) : null,
      fiberG: plan?.targets?.fiber ?? (plan?.targets?.energy ? Math.max(25, Math.min(45, Math.round((Number(plan.targets.energy) / 1000) * 14))) : null),
      hydrationLiters: waterTarget.liters,
      hydrationCups: waterTarget.targetCups,
      hydrationClinicianGuided: Boolean(waterTarget.clinicianGuided),
      dietType: s?.preferences?.diet || 'balanced'
    },
    clinicalGuardrails,
    activeInjuries,
    adherenceSummary: {
      foodLoggedDays: periodFood.length,
      foodAdherencePct,
      avgCaloriesKcal,
      avgProteinG,
      hydrationLoggedDays: periodWater.length,
      hydrationAdherentDays,
      hydrationAdherencePct,
      workoutsCompleted,
      cardioMinutesTotal,
      avgSleepHours
    },
    disclaimerCode: 'CLINICAL_SUMMARY_INFORMATIONAL_ONLY',
    disclaimerEn: 'Prepared by the CuraFit Specialist Team for informational review with a licensed physician, registered dietitian, or physical therapist. This summary is not a medical diagnosis or prescription.'
  };
}
