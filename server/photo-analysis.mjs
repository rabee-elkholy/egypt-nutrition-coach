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
import { fetchWithTimeout } from './external-crypto.mjs';
import { workingSetsOf } from './training-state.mjs';
import { consumeFeatureAccess, FREE_LIMITS, PRO_FAIR_USE_LIMITS } from './subscriptions.mjs';

const VALID_POSES = new Set(['front', 'side', 'back']);
const MIN_DAYS_BETWEEN_PHOTOS = 7;
const GEMINI_VISION_MODEL = 'gemini-2.5-flash';
const VALID_COMPARABILITY_SCORES = new Set(['high', 'moderate', 'low']);
const VALID_COMPARABILITY_NOTES = new Set([
  'PHOTO_FRAMING_CONSISTENT',
  'PHOTO_LIGHTING_MISMATCH',
  'PHOTO_DISTANCE_MISMATCH',
  'PHOTO_ANGLE_MISMATCH',
  'PHOTO_LOOSE_CLOTHING_DETECTED',
  'PHOTO_SHORT_INTERVAL_WINDOW'
]);
const VALID_REGIONS = new Set(['upper_body', 'midsection', 'lower_body', 'posture']);
const FORBIDDEN_VISUAL_COPY_RE = /\b(AI|AI Coach|Smart Coach|Smart|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM|DEXA|body\s*fat\s*%|body\s*fat\s*percentage|beauty\s*score|attractiveness|ugly|flabby|chubby|gross|disgusting|\d+\s*\/\s*10)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;

function sanitizeVisualCopy(text) {
  return String(text || '')
    .replace(/\bAI Coach\b/gi, 'CuraFit Specialist Team')
    .replace(/\bSmart Coach\b/gi, 'CuraFit Specialist Team')
    .replace(/\bAI\b/gi, 'Specialist')
    .replace(/\bSmart\b/gi, 'tailored')
    .replace(/\b(automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b/gi, 'personalized')
    .replace(/\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/g, 'المختص')
    .trim();
}

function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function detectPhotoMimeType(bytes, declaredType = '', key = '') {
  if (bytes && bytes.length >= 12) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) return 'image/webp';
  }
  const norm = String(declaredType || '').toLowerCase().split(';')[0].trim();
  if (norm === 'image/png' || norm === 'image/webp' || norm === 'image/jpeg') return norm;
  if (norm === 'image/jpg') return 'image/jpeg';
  if (/\.png$/i.test(key)) return 'image/png';
  if (/\.webp$/i.test(key)) return 'image/webp';
  return 'image/jpeg';
}

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

  // 7. Optional Gemini 2.5 Flash Vision comparison when R2 objects + GEMINI_API_KEY + standard clinicalMode + explicit consent are active
  let visualObservations = [];
  let analysisSource = 'metrics_correlation';
  const locale = normalizeLocale(String(body?.locale || profile.locale || 'en'), 'en') || 'en';

  if (
    clinicalMode === 'standard' &&
    env?.GEMINI_API_KEY &&
    env?.CURAFIT_MEDIA_BUCKET &&
    beforePhoto.r2_object_key &&
    afterPhoto.r2_object_key
  ) {
    try {
      const [beforeObj, afterObj] = await Promise.all([
        env.CURAFIT_MEDIA_BUCKET.get(beforePhoto.r2_object_key),
        env.CURAFIT_MEDIA_BUCKET.get(afterPhoto.r2_object_key)
      ]);
      if (beforeObj && afterObj) {
        const [beforeBytes, afterBytes] = await Promise.all([
          beforeObj.arrayBuffer().then(b => new Uint8Array(b)),
          afterObj.arrayBuffer().then(b => new Uint8Array(b))
        ]);
        const MAX_VISION_BYTES = 5 * 1024 * 1024;
        if (
          beforeBytes.byteLength >= 32 && beforeBytes.byteLength <= MAX_VISION_BYTES &&
          afterBytes.byteLength >= 32 && afterBytes.byteLength <= MAX_VISION_BYTES
        ) {
          const beforeMime = detectPhotoMimeType(beforeBytes, beforeObj.httpMetadata?.contentType, beforePhoto.r2_object_key);
          const afterMime = detectPhotoMimeType(afterBytes, afterObj.httpMetadata?.contentType, afterPhoto.r2_object_key);
          const metricsCtx = {
            pose: beforePhoto.pose,
            daysBetween,
            weightDeltaKg,
            waistDeltaCm,
            strengthVolumeDeltaPct,
            adherencePct,
            recompositionDetected
          };
          const visionPrompt = [
            'You are the CuraFit Specialist Team reviewing two progress photos (Photo 1 = before, Photo 2 = after) alongside logged member metrics.',
            'Evaluate real visual comparability (lighting, camera distance, angle, clothing fit) and provide calm, respectful, objective observations.',
            'Strict ethical rules: NEVER estimate DEXA or body-fat percentage from photos; NEVER give numeric attractiveness/beauty scores (no X/10); NEVER use body-shaming words; NEVER mention AI, Smart, Automated, Algorithm, Engine, Bot, or LLM.',
            `Logged D1 Metrics (JSON): ${JSON.stringify(metricsCtx)}`,
            'Respond ONLY as valid JSON matching this schema:',
            '{"comparabilityScore":"high"|"moderate"|"low","comparabilityNoteCodes":["PHOTO_FRAMING_CONSISTENT"|"PHOTO_LIGHTING_MISMATCH"|"PHOTO_DISTANCE_MISMATCH"|"PHOTO_ANGLE_MISMATCH"|"PHOTO_LOOSE_CLOTHING_DETECTED"|"PHOTO_SHORT_INTERVAL_WINDOW"],"visualObservations":[{"region":"upper_body"|"midsection"|"lower_body"|"posture","summaryCode":"VISUAL_SPECIALIST_OBSERVATION","summary":"calm objective sentence in English"}]}'
          ].join('\n');

          const gRes = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: visionPrompt },
                    { inline_data: { mime_type: beforeMime, data: bytesToBase64(beforeBytes) } },
                    { inline_data: { mime_type: afterMime, data: bytesToBase64(afterBytes) } }
                  ]
                }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 512 }
              })
            },
            10000
          );
          if (gRes.ok) {
            const gJson = await gRes.json();
            const rawText = String(gJson?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            const parsed = JSON.parse(rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
            const cleanObs = Array.isArray(parsed?.visualObservations)
              ? parsed.visualObservations
                  .filter(o => o && VALID_REGIONS.has(String(o.region || '')) && typeof o.summary === 'string')
                  .map(o => ({
                    region: String(o.region),
                    summaryCode: /^[A-Z][A-Z0-9_]{2,60}$/.test(String(o.summaryCode || '')) ? String(o.summaryCode) : 'VISUAL_SPECIALIST_OBSERVATION',
                    summary: sanitizeVisualCopy(o.summary).slice(0, 320)
                  }))
                  .filter(o => o.summary.length >= 12 && !FORBIDDEN_VISUAL_COPY_RE.test(o.summary))
                  .slice(0, 4)
              : [];
            if (cleanObs.length >= 2) {
              if (VALID_COMPARABILITY_SCORES.has(parsed?.comparabilityScore)) {
                comparabilityScore = parsed.comparabilityScore;
              }
              if (Array.isArray(parsed?.comparabilityNoteCodes)) {
                const validNotes = parsed.comparabilityNoteCodes.filter(c => VALID_COMPARABILITY_NOTES.has(c));
                if (validNotes.length) {
                  comparabilityNoteCodes.splice(0, comparabilityNoteCodes.length, ...new Set(validNotes));
                }
              }
              visualObservations = cleanObs;
              analysisSource = 'vision_and_metrics';
            }
          }
        }
      }
    } catch {}
  }

  // Honest deterministic metric-grounded fallback (zero fabricated visual claims, zero body shaming, zero DEXA claims)
  if (!visualObservations.length) {
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
            ? `Logged training volume rose by +${strengthVolumeDeltaPct}% across these ${daysBetween} days; compare shoulder and upper-back photos side-by-side under consistent lighting.`
            : `Side-by-side ${daysBetween}-day check-in recorded from your logged metrics; pair these photos with progressive upper-body strength logs over the next 4 weeks.`
        },
        {
          region: 'midsection',
          summaryCode: recompositionDetected ? 'VISUAL_RECOMPOSITION_MIDSECTION' : (waistDeltaCm != null && waistDeltaCm < 0 ? 'VISUAL_MIDSECTION_TAPERING' : 'VISUAL_MIDSECTION_STEADY'),
          summary: recompositionDetected
            ? 'Body recomposition signal detected from logged records: waist measurements or strength capacity improved while scale weight remained steady.'
            : (waistDeltaCm != null && waistDeltaCm < 0
              ? `Logged waist tape decreased by ${Math.abs(waistDeltaCm)} cm alongside consistent nutrition habits across ${daysBetween} days.`
              : `No waist tape shift is logged across these ${daysBetween} days; pair side-by-side photo checks with morning tape measurements under identical lighting.`)
        },
        {
          region: 'lower_body',
          summaryCode: 'VISUAL_LOWER_BODY_FOUNDATION',
          summary: `Review your lower-body check-in photos side-by-side alongside your ${daysBetween}-day training progression logs.`
        },
        {
          region: 'posture',
          summaryCode: 'VISUAL_POSTURE_ALIGNMENT',
          summary: 'Keep relaxed shoulders, matched camera distance, and neutral spinal alignment during check-in captures so future side-by-side reviews stay consistent.'
        }
      );
    }
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
  const result = {
    analysisId,
    analysisSource,
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
