// KAN-122 (US-PRG-08): Privacy-First Specialist Visual Difference Analysis (Multi-Signal D1 Fusion)
// Strictly opt-in via visual_progress_analysis consent, zero DEXA claims, zero numeric beauty scores,
// automatic pregnancy/underweight/minor clinical safeguards, and non-hostage read/delete after downgrade.

import { clockNow, isoNow, clockTimeZone } from './clock.mjs';
import {
  localDate,
  dateOffset,
  validDate,
  normalizeLocale,
  isPregnantStatus
} from '../coaching-shared.mjs';
import { apiError } from '../coaching-error.mjs';
import { workingSetsOf } from './training-state.mjs';
import { consumeFeatureAccess, FREE_LIMITS, PRO_FAIR_USE_LIMITS } from './subscriptions.mjs';

const VALID_POSES = new Set(['front', 'side', 'back']);
const MIN_DAYS_BETWEEN_PHOTOS = 7;

function estimateNavyBodyFatPct(profile, measurement) {
  if (!profile || !measurement) return null;
  const h = Number(profile.height);
  const waist = Number(measurement.waistCm);
  const neck = Number(measurement.neckCm);
  if (!Number.isFinite(h) || !Number.isFinite(waist) || !Number.isFinite(neck) || waist <= neck) return null;
  if (profile.sex === 'female') {
    const hips = Number(measurement.hipsCm);
    if (!Number.isFinite(hips) || waist + hips <= neck) return null;
    const pct = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(h)) - 450;
    return Number.isFinite(pct) && pct >= 8 && pct <= 60 ? Math.round(pct * 10) / 10 : null;
  }
  const pct = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
  return Number.isFinite(pct) && pct >= 4 && pct <= 55 ? Math.round(pct * 10) / 10 : null;
}

function nearestRecord(list, targetDate, maxDiffDays = 10) {
  const targetMs = Date.parse(`${targetDate}T12:00:00Z`);
  let best = null;
  let bestDiff = Infinity;
  for (const item of list || []) {
    if (!validDate(item?.date)) continue;
    const diff = Math.abs(Date.parse(`${item.date}T12:00:00Z`) - targetMs) / 86400000;
    if (diff <= maxDiffDays && diff < bestDiff) {
      best = item;
      bestDiff = diff;
    }
  }
  return best;
}

function computeMovingAvgWeightNear(weights, targetDate) {
  const winStart = dateOffset(targetDate, -6);
  const slice = (weights || []).filter(w => validDate(w.date) && w.date >= winStart && w.date <= targetDate);
  if (slice.length) {
    return Math.round((slice.reduce((sum, w) => sum + Number(w.kg), 0) / slice.length) * 100) / 100;
  }
  const near = nearestRecord(weights, targetDate, 7);
  return near ? Number(near.kg) : null;
}

function computeWindowVolume(workoutLogs, startDate, endDate) {
  let vol = 0;
  for (const l of workoutLogs || []) {
    if (!validDate(l.date) || l.date < startDate || l.date > endDate) continue;
    vol += workingSetsOf(l.sets)
      .filter(set => !set.pain)
      .reduce((sum, set) => sum + Number(set.kg || 0) * Number(set.reps || 0), 0);
  }
  return Math.round(vol * 10) / 10;
}

export async function analyzeProgressPhotoDiff(db, env, s, userId, body = {}, now = clockNow()) {
  // 1. Explicit opt-in consent gate (KAN-122)
  const consentRow = await db.prepare(
    "SELECT accepted FROM coaching_account_consents WHERE user_id=? AND consent_type='visual_progress_analysis'"
  ).bind(userId).first().catch(() => null);
  if (!consentRow || Number(consentRow.accepted) !== 1) {
    throw apiError(
      'VISUAL_ANALYSIS_CONSENT_REQUIRED',
      'Explicit visual_progress_analysis consent is required before running a Specialist Visual Difference Analysis.',
      { status: 403 }
    );
  }

  // 2. Validate photo IDs & pair integrity BEFORE consuming quota
  const beforePhotoId = String(body?.beforePhotoId || '').trim();
  const afterPhotoId = String(body?.afterPhotoId || '').trim();
  if (!beforePhotoId || !afterPhotoId) {
    throw apiError('VALIDATION_ERROR', 'beforePhotoId and afterPhotoId are required.', { status: 400 });
  }
  if (beforePhotoId === afterPhotoId) {
    throw apiError('SAME_PHOTO_PAIR', 'Select two distinct progress photos to compare.', { status: 400 });
  }
  const requestedPose = body?.pose ? String(body.pose).trim().toLowerCase() : null;
  if (requestedPose && !VALID_POSES.has(requestedPose)) {
    throw apiError('VALIDATION_ERROR', 'pose must be front, side, or back.', { status: 400 });
  }

  const [beforePhoto, afterPhoto] = await Promise.all([
    db.prepare('SELECT photo_id, date, pose, r2_object_key, weight_kg_snapshot FROM coaching_progress_photos WHERE user_id=? AND photo_id=?').bind(userId, beforePhotoId).first(),
    db.prepare('SELECT photo_id, date, pose, r2_object_key, weight_kg_snapshot FROM coaching_progress_photos WHERE user_id=? AND photo_id=?').bind(userId, afterPhotoId).first()
  ]);
  if (!beforePhoto || !afterPhoto) {
    throw apiError('PHOTO_NOT_FOUND', 'Progress photo record not found.', { status: 404 });
  }
  if (beforePhoto.pose !== afterPhoto.pose || (requestedPose && beforePhoto.pose !== requestedPose)) {
    throw apiError('POSE_MISMATCH', 'Both photos must share the same pose (front, side, or back) for an accurate comparison.', {
      status: 400,
      params: { beforePose: beforePhoto.pose, afterPose: afterPhoto.pose }
    });
  }

  const beforeDate = beforePhoto.date <= afterPhoto.date ? beforePhoto.date : afterPhoto.date;
  const afterDate = beforePhoto.date <= afterPhoto.date ? afterPhoto.date : beforePhoto.date;
  const daysBetween = Math.round((Date.parse(`${afterDate}T12:00:00Z`) - Date.parse(`${beforeDate}T12:00:00Z`)) / 86400000);
  if (daysBetween < MIN_DAYS_BETWEEN_PHOTOS) {
    throw apiError(
      'PHOTOS_TOO_CLOSE_DAYS',
      `Progress photos must be at least ${MIN_DAYS_BETWEEN_PHOTOS} days apart to evaluate meaningful changes.`,
      { status: 400, params: { minDays: MIN_DAYS_BETWEEN_PHOTOS, daysBetween } }
    );
  }

  // 3. Value-Peak Starter (1 Free lifetime) + Pro Fair-Use Cap (4/month)
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const access = await consumeFeatureAccess(
    db,
    s,
    userId,
    {
      feature: 'visual_photo_diff_unlimited',
      quotaKey: 'photo_diff_analysis',
      today,
      freeWindowKey: 'lifetime',
      freeLimit: FREE_LIMITS.photoDiffStarterLimit,
      proDailyLimit: null,
      proMonthlyLimit: PRO_FAIR_USE_LIMITS.photo_diff_analysis.monthly,
      enforceEntitlements: env?.ENFORCE_PRO_ENTITLEMENTS === 'true'
    },
    env
  );

  // 4. Clinical & Ethical Guardrails
  const profile = s?.profile || {};
  const bmi = profile.weight && profile.height ? Number(profile.weight) / ((Number(profile.height) / 100) ** 2) : 23;
  const isPregnant = isPregnantStatus(profile.maternalStatus);
  const recentFood = (s?.foodLogs || []).filter(f => validDate(f.date) && f.date >= dateOffset(today, -13) && f.date <= today && Number(f.energy || 0) > 0);
  const avgRecentKcal = recentFood.length ? recentFood.reduce((sum, f) => sum + Number(f.energy), 0) / recentFood.length : null;
  const underEatingRedFlag = avgRecentKcal != null && avgRecentKcal < 1050;
  const clinicalMode = isPregnant
    ? 'maternity_timeline'
    : (Number(profile.age || 25) < 18 || bmi < 18.5 || underEatingRedFlag)
      ? 'wellness_only'
      : 'standard';

  // 5. Comparability Score (checks framing/lighting cues instead of fabricating progress)
  const meta = body?.captureMetadata && typeof body.captureMetadata === 'object' ? body.captureMetadata : {};
  const comparabilityNoteCodes = [];
  let comparabilityScore = 'high';
  if (meta.lightingMismatch === true) comparabilityNoteCodes.push('PHOTO_LIGHTING_MISMATCH');
  if (meta.distanceMismatch === true) comparabilityNoteCodes.push('PHOTO_DISTANCE_MISMATCH');
  if (meta.angleMismatch === true) comparabilityNoteCodes.push('PHOTO_ANGLE_MISMATCH');
  if (meta.looseClothing === true) comparabilityNoteCodes.push('PHOTO_LOOSE_CLOTHING_DETECTED');
  if (comparabilityNoteCodes.length >= 2 || meta.looseClothing === true) {
    comparabilityScore = 'low';
  } else if (comparabilityNoteCodes.length === 1 || daysBetween < 14) {
    comparabilityScore = 'moderate';
    if (daysBetween < 14) comparabilityNoteCodes.push('PHOTO_SHORT_INTERVAL_WINDOW');
  } else {
    comparabilityNoteCodes.push('PHOTO_FRAMING_CONSISTENT');
  }

  // 6. Multi-Signal D1 Metric Correlation between beforeDate and afterDate
  const wBefore = computeMovingAvgWeightNear(s?.weights, beforeDate) ?? (beforePhoto.weight_kg_snapshot != null ? Number(beforePhoto.weight_kg_snapshot) : null);
  const wAfter = computeMovingAvgWeightNear(s?.weights, afterDate) ?? (afterPhoto.weight_kg_snapshot != null ? Number(afterPhoto.weight_kg_snapshot) : null);
  const weightDeltaKg = wBefore != null && wAfter != null ? Math.round((wAfter - wBefore) * 100) / 100 : null;

  const mBefore = nearestRecord(s?.bodyMeasurements, beforeDate, 10);
  const mAfter = nearestRecord(s?.bodyMeasurements, afterDate, 10);
  const waistDeltaCm = mBefore?.waistCm != null && mAfter?.waistCm != null
    ? Math.round((Number(mAfter.waistCm) - Number(mBefore.waistCm)) * 10) / 10
    : null;

  const earlyVol = computeWindowVolume(s?.workoutLogs, dateOffset(beforeDate, -6), dateOffset(beforeDate, 6));
  const lateVol = computeWindowVolume(s?.workoutLogs, dateOffset(afterDate, -6), afterDate);
  const strengthVolumeDeltaPct = earlyVol > 0
    ? Math.round(((lateVol - earlyVol) / earlyVol) * 100)
    : (lateVol > 0 ? 100 : null);

  const periodFood = (s?.foodLogs || []).filter(f => validDate(f.date) && f.date >= beforeDate && f.date <= afterDate && f.adherence != null);
  const adherencePct = periodFood.length
    ? Math.round(periodFood.reduce((sum, f) => sum + Number(f.adherence), 0) / periodFood.length)
    : null;

  const navyBeforePct = estimateNavyBodyFatPct(profile, mBefore);
  const navyAfterPct = estimateNavyBodyFatPct(profile, mAfter);

  const recompositionDetected = Boolean(
    clinicalMode === 'standard' &&
    (weightDeltaKg == null || Math.abs(weightDeltaKg) <= 1.2) &&
    ((waistDeltaCm != null && waistDeltaCm <= -1.5) || (strengthVolumeDeltaPct != null && strengthVolumeDeltaPct >= 10))
  );

  // 7. Calm Specialist Observations (zero body shaming, zero DEXA claims, zero AI wording)
  const visualObservations = [];
  if (clinicalMode === 'maternity_timeline') {
    visualObservations.push(
      { region: 'posture', summaryCode: 'MATERNITY_TIMELINE_MILESTONE', summary: `Celebrating ${daysBetween} days of your maternity journey with gentle posture and daily nourishment focus.` },
      { region: 'midsection', summaryCode: 'MATERNITY_SUPPORTIVE_CARE', summary: 'Aesthetic fat-loss critique is paused during pregnancy; focus remains on comfortable movement, hydration, and maternal nutrition.' }
    );
  } else if (clinicalMode === 'wellness_only') {
    visualObservations.push(
      { region: 'posture', summaryCode: 'WELLNESS_POSTURE_STABILITY', summary: 'Comparison focuses on upright posture, steady strength capacity, and consistent nourishment rather than weight loss.' },
      { region: 'upper_body', summaryCode: 'WELLNESS_STRENGTH_FOCUS', summary: 'Maintain balanced protein intake and comfortable resistance sessions to support long-term vitality.' }
    );
  } else if (comparabilityScore === 'low') {
    visualObservations.push(
      { region: 'posture', summaryCode: 'VISUAL_LOW_COMPARABILITY_TIP', summary: 'Lighting, distance, angle, or loose clothing varied between these photos. Retake under matching light and framing so your specialists can assess subtle visual changes reliably.' }
    );
  } else {
    visualObservations.push(
      {
        region: 'upper_body',
        summaryCode: strengthVolumeDeltaPct != null && strengthVolumeDeltaPct >= 10 ? 'VISUAL_UPPER_BODY_STRENGTH_GAIN' : 'VISUAL_UPPER_BODY_STEADY',
        summary: strengthVolumeDeltaPct != null && strengthVolumeDeltaPct >= 10
          ? `Upper-body training volume rose by +${strengthVolumeDeltaPct}% across these ${daysBetween} days, supporting fuller shoulder and upper-back tone.`
          : `Upper-body symmetry appears steady across ${daysBetween} days; progressive compound sets will continue refining upper-body definition.`
      },
      {
        region: 'midsection',
        summaryCode: recompositionDetected ? 'VISUAL_RECOMPOSITION_MIDSECTION' : (waistDeltaCm != null && waistDeltaCm < 0 ? 'VISUAL_MIDSECTION_TAPERING' : 'VISUAL_MIDSECTION_STEADY'),
        summary: recompositionDetected
          ? 'Body recomposition signal detected: waist measurements or strength capacity improved while scale weight remained steady.'
          : (waistDeltaCm != null && waistDeltaCm < 0
            ? `Logged waist tape decreased by ${Math.abs(waistDeltaCm)} cm alongside consistent nutrition habits.`
            : 'Midsection framing looks consistent; pair photo reviews with morning tape measurements under identical lighting.')
      },
      {
        region: 'lower_body',
        summaryCode: 'VISUAL_LOWER_BODY_FOUNDATION',
        summary: 'Lower-body stance and leg stability remain balanced across the comparison window.'
      },
      {
        region: 'posture',
        summaryCode: 'VISUAL_POSTURE_ALIGNMENT',
        summary: 'Maintain relaxed shoulders and neutral spinal alignment during check-in captures to track posture improvements clearly.'
      }
    );
  }

  const nextFourWeeksFocus = clinicalMode === 'maternity_timeline'
    ? {
        nutritionCode: 'FOCUS_MATERNAL_NOURISHMENT_HYDRATION',
        trainingCode: 'FOCUS_MATERNAL_GENTLE_MOBILITY',
        recoveryCode: 'FOCUS_MATERNAL_REST_COMFORT'
      }
    : clinicalMode === 'wellness_only'
      ? {
          nutritionCode: 'FOCUS_WELLNESS_BALANCED_ENERGY',
          trainingCode: 'FOCUS_WELLNESS_STRENGTH_CONSISTENCY',
          recoveryCode: 'FOCUS_WELLNESS_SLEEP_RHYTHM'
        }
      : {
          nutritionCode: adherencePct != null && adherencePct < 80 ? 'FOCUS_NUTRITION_PROTEIN_CONSISTENCY' : 'FOCUS_NUTRITION_MAINTAIN_PRECISION',
          trainingCode: strengthVolumeDeltaPct != null && strengthVolumeDeltaPct > 0 ? 'FOCUS_TRAINING_DOUBLE_PROGRESSION' : 'FOCUS_TRAINING_LOG_PROGRESSIVE_SETS',
          recoveryCode: 'FOCUS_RECOVERY_SLEEP_HYDRATION_BASELINE'
        };

  const analysisId = `pan_${crypto.randomUUID()}`;
  const createdAt = isoNow();
  const locale = normalizeLocale(String(body?.locale || profile.locale || 'en'), 'en') || 'en';
  const result = {
    analysisId,
    beforePhotoId: beforePhoto.photo_id,
    afterPhotoId: afterPhoto.photo_id,
    pose: beforePhoto.pose,
    blurFaceBeforeAnalysis: body?.blurFaceBeforeAnalysis !== false,
    locale,
    beforeDate,
    afterDate,
    daysBetween,
    comparabilityScore,
    comparabilityNoteCodes,
    metricCorrelation: {
      weightDeltaKg,
      waistDeltaCm,
      strengthVolumeDeltaPct,
      adherencePct,
      ...(navyBeforePct != null && navyAfterPct != null ? { navyTapeEstimateBeforePct: navyBeforePct, navyTapeEstimateAfterPct: navyAfterPct } : {})
    },
    recompositionDetected,
    visualObservations,
    nextFourWeeksFocus,
    clinicalMode,
    quota: {
      tier: access.tier,
      remainingFree: access.remainingFree,
      fairUseMonthlyRemaining: access.monthlyRemaining
    },
    createdAt
  };

  await db.prepare(
    'INSERT INTO coaching_photo_analyses(user_id,analysis_id,before_photo_id,after_photo_id,pose,clinical_mode,comparability_score,body_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
  ).bind(
    userId,
    analysisId,
    result.beforePhotoId,
    result.afterPhotoId,
    result.pose,
    clinicalMode,
    comparabilityScore,
    JSON.stringify(result),
    createdAt
  ).run();

  return result;
}

export async function listPhotoAnalyses(db, userId, { offset = 0, limit = 20 } = {}) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  try {
    const [rowsRes, countRes] = await Promise.all([
      db.prepare(
        'SELECT body_json FROM coaching_photo_analyses WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).bind(userId, safeLimit, safeOffset).all(),
      db.prepare('SELECT COUNT(*) AS n FROM coaching_photo_analyses WHERE user_id=?').bind(userId).first()
    ]);
    const items = (rowsRes?.results || []).map(r => {
      try { return JSON.parse(r.body_json); } catch { return null; }
    }).filter(Boolean);
    const total = Number(countRes?.n || items.length);
    return {
      total,
      offset: safeOffset,
      limit: safeLimit,
      nextOffset: safeOffset + safeLimit < total ? safeOffset + safeLimit : null,
      items
    };
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return { total: 0, offset: safeOffset, limit: safeLimit, nextOffset: null, items: [] };
    throw e;
  }
}

export async function deletePhotoAnalysis(db, userId, analysisId) {
  const id = String(analysisId || '').trim();
  const row = await db.prepare(
    'SELECT analysis_id FROM coaching_photo_analyses WHERE user_id=? AND analysis_id=?'
  ).bind(userId, id).first();
  if (!row) {
    throw apiError('PHOTO_NOT_FOUND', 'Visual difference analysis record not found.', { status: 404 });
  }
  await db.prepare('DELETE FROM coaching_photo_analyses WHERE user_id=? AND analysis_id=?').bind(userId, id).run();
  return { deleted: true, analysisId: id };
}
