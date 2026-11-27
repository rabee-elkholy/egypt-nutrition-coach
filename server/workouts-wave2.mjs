// KAN-124 (US-WRK-13): 1-Tap Travel/Hotel Session Override, Freeform Open Workout & Muscle Recovery Heatmap
// Acyclic module — imports only workouts, workouts-insights, training-state, recovery, exercise-load, clock, shared, apiError.
import { clockNow, isoNow, clockTimeZone } from './clock.mjs';
import {
  localDate,
  dateOffset,
  validDate,
  dateForLog as validateLogDate,
  integer,
  number,
  boolean,
  canonicalInjuries,
  MUSCLE_REGIONS
} from '../coaching-shared.mjs';
import { apiError } from '../coaching-error.mjs';
import { usesKg } from '../exercise-load.mjs';
import {
  catalog,
  workoutPlan,
  isFriendlyForInjuries,
  regionForMuscle,
  scheduledSessions
} from './workouts.mjs';
import { enrichExercise } from './workouts-insights.mjs';
import { workingSetsOf } from './training-state.mjs';
import { accountRecovery } from './recovery.mjs';

const VALID_OVERRIDE_MODES = new Set(['bodyweight_hotel', 'dumbbell_only']);
const VALID_OVERRIDE_DURATIONS = new Set([20, 30, 45, 60]);
const SET_TYPES = new Set(['normal', 'warmup', 'dropset', 'failure']);
const EXERCISE_BY_ID = new Map(catalog.exercises.map(e => [e.id, e]));

const MEV_MAV_BY_LEVEL = Object.freeze({
  beginner: { mev: 6, mav: 10 },
  intermediate: { mev: 10, mav: 14 },
  advanced: { mev: 12, mav: 18 }
});

// ---------------------------------------------------------------------------
// 1. 1-Tap Travel / Hotel / Gym-Closed Ephemeral Session Override
// ---------------------------------------------------------------------------

export function createTodaySessionOverride(s, body = {}, now = clockNow()) {
  if (!s?.profile) {
    throw apiError('PROFILE_REQUIRED', 'Complete onboarding profile generation before creating a travel session override.', { status: 400 });
  }
  const tz = s.profile.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const date = body?.date ? String(body.date).trim() : today;
  if (!validDate(date) || date < today || date > dateOffset(today, 1)) {
    throw apiError('INVALID_DATE', 'Session override date must be today or tomorrow in YYYY-MM-DD format.', { status: 400, params: { field: 'date' } });
  }

  const mode = String(body?.mode || 'bodyweight_hotel').trim();
  if (!VALID_OVERRIDE_MODES.has(mode)) {
    throw apiError('VALIDATION_ERROR', 'mode must be bodyweight_hotel or dumbbell_only.', { status: 400 });
  }
  const durationMin = Number(body?.durationMin ?? 30);
  if (!VALID_OVERRIDE_DURATIONS.has(durationMin)) {
    throw apiError('VALIDATION_ERROR', 'durationMin must be 20, 30, 45, or 60.', { status: 400 });
  }

  // Clinical red-flag guard
  const ready = accountRecovery(s, now, tz);
  if (ready.status === 'stop' || s.onboarding?.workoutPrefs?.parqRedFlag === true) {
    throw apiError(
      'RED_FLAG_STOP_ACTIVE',
      'Workout overrides are paused while a medical red-flag stop or PAR-Q clearance hold is active.',
      { status: 403 }
    );
  }

  // Reject if today's session is already completed
  const alreadyCompleted = (s.sessions || []).some(x => x.date === date && x.status === 'completed');
  if (alreadyCompleted) {
    throw apiError(
      'SESSION_ALREADY_COMPLETED_TODAY',
      'Today\'s scheduled workout session is already marked completed.',
      { status: 409, params: { date } }
    );
  }

  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const todaySched = scheduledSessions(s, date, 1).find(x => x.date === date) || null;
  const prefs = s.onboarding?.workoutPrefs || {};
  const injuries = canonicalInjuries(prefs.injuries || []);
  const homeEquipment = mode === 'dumbbell_only' ? ['dumbbells'] : ['none'];

  // Build ephemeral 1-day safe replacement without mutating permanent s.workoutPlan!
  const tempPlan = workoutPlan({
    workoutDaysCount: 1,
    selectedWorkoutDays: [weekday],
    fitnessLevel: prefs.fitnessLevel || 'beginner',
    sessionDuration: durationMin,
    workoutLocation: 'home_only',
    homeEquipment,
    workoutSplitPreference: 'full_body',
    injuries,
    diseases: s.profile.diseases || [],
    age: s.profile.age,
    seniorMode: Boolean(s.profile.seniorMode),
    maternalStatus: s.profile.maternalStatus || 'none',
    goal: s.profile.goal || 'maintain',
    goalPace: s.profile.goalPace || 'moderate',
    recomposition: Boolean(s.profile.recomposition)
  });

  const day = tempPlan.days[0];
  const enrichedExercises = (day.exercises || []).map(e => ({
    ...enrichExercise(e),
    targetRepsRange: `${e.repMin}-${e.repMax}`,
    targetRir: e.rir
  }));

  const override = {
    id: `ovr_${crypto.randomUUID()}`,
    date,
    dayIndex: todaySched?.dayIndex ?? weekday,
    mode,
    durationMin,
    focus: todaySched?.focus || day.focus || 'full_body',
    location: 'home',
    isTemporaryOverride: true,
    permanentSplitPreserved: true,
    estimatedMinutes: day.estimatedMinutes || durationMin,
    exercises: enrichedExercises,
    warnings: tempPlan.warnings || [],
    warningCodes: tempPlan.warningCodes || [],
    createdAt: isoNow()
  };

  s.todayWorkoutOverrides ||= {};
  s.todayWorkoutOverrides[date] = override;
  return override;
}

// ---------------------------------------------------------------------------
// 2. Freeform Open Workout Session (`action: 'open_workout_session'`)
// ---------------------------------------------------------------------------

export function applyOpenWorkoutSession(s, p = {}, now = clockNow()) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const date = validateLogDate(p?.date || localDate(now, tz), now, tz);
  const title = String(p?.title || 'Open Workout').trim().slice(0, 80) || 'Open Workout';
  if (!Array.isArray(p?.exercises) || p.exercises.length < 1 || p.exercises.length > 20) {
    throw apiError('AD_HOC_EXERCISE_INVALID', 'open_workout_session requires an exercises array with 1 to 20 exercises.', { status: 400 });
  }
  const durationMin = p?.durationMin == null || p.durationMin === '' ? null : number(p.durationMin, 1, 240, 'durationMin');
  const rpe = p?.rpe == null || p.rpe === '' ? null : number(p.rpe, 0, 10, 'rpe');
  const notes = p?.notes != null ? String(p.notes).trim().slice(0, 300) || null : null;

  const injuries = canonicalInjuries(s.onboarding?.workoutPrefs?.injuries || []);
  const dayIndex = new Date(`${date}T12:00:00Z`).getUTCDay();
  const openSessionId = `open_${crypto.randomUUID()}`;
  const nowIso = isoNow();
  const stagedLogs = [];

  for (const item of p.exercises) {
    const ex = EXERCISE_BY_ID.get(item?.exerciseId);
    if (!ex || !Array.isArray(item?.sets) || item.sets.length < 1 || item.sets.length > 15) {
      throw apiError('AD_HOC_EXERCISE_INVALID', 'Each exercise in open_workout_session requires a valid exerciseId and 1 to 15 sets.', { status: 400 });
    }
    if (!isFriendlyForInjuries(ex, injuries, s.profile) && item.overrideInjuryWarning !== true) {
      const safetyReasons = [
        ...injuries,
        ...(s.profile?.seniorMode ? ['senior_mode'] : []),
        ...(s.profile?.maternalStatus && s.profile.maternalStatus !== 'none' ? [s.profile.maternalStatus] : [])
      ];
      const reasonText = safetyReasons.join(', ') || 'profile_safety_filter';
      throw apiError(
        'AD_HOC_INJURY_WARNING',
        `Exercise ${ex.name} conflicts with your declared safety constraints (${reasonText}); pass overrideInjuryWarning: true to log it anyway.`,
        { status: 409, params: { injuries: reasonText, exerciseId: ex.id } }
      );
    }
    const acceptsKg = usesKg(ex) || ex.supportsAddedWeight === true;
    const sets = item.sets.map(x => ({
      kg: acceptsKg ? (x.kg == null ? 0 : number(x.kg, 0, 500, 'kg')) : 0,
      reps: integer(x.reps, 1, 100, 'reps'),
      rir: x.rir == null ? null : number(x.rir, 0, 10, 'rir'),
      pain: boolean(x.pain, 'pain', false),
      ...(x.setType && SET_TYPES.has(x.setType) && x.setType !== 'normal' ? { setType: x.setType } : {})
    }));
    stagedLogs.push({
      id: crypto.randomUUID(),
      at: nowIso,
      date,
      exerciseId: ex.id,
      dayIndex,
      planId: 'open_workout',
      openSessionId,
      adHoc: true,
      loadMode: ex.loadMode,
      laterality: ex.laterality,
      bothSides: boolean(item.bothSides, 'bothSides', false),
      entryMode: item.entryMode === 'simple' ? 'simple' : 'pro',
      ...(item.supersetGroupId ? { supersetGroupId: String(item.supersetGroupId).slice(0, 64) } : {}),
      sets
    });
  }

  s.workoutLogs ||= [];
  s.workoutLogs.push(...stagedLogs);

  const totalWorkingSets = stagedLogs.reduce((sum, l) => sum + workingSetsOf(l.sets).length, 0);
  const totalVolumeKg = Math.round(
    stagedLogs.reduce((sum, l) =>
      sum + workingSetsOf(l.sets).filter(set => !set.pain).reduce((v, set) => v + Number(set.kg || 0) * Number(set.reps || 0), 0),
    0) * 10
  ) / 10;

  const openSessionRecord = {
    id: openSessionId,
    date,
    title,
    durationMin,
    rpe,
    notes,
    exerciseCount: stagedLogs.length,
    totalWorkingSets,
    totalVolumeKg,
    logIds: stagedLogs.map(l => l.id),
    prescribedSplitUntouched: true,
    createdAt: nowIso
  };
  s.openWorkoutSessions ||= [];
  s.openWorkoutSessions.push(openSessionRecord);
  return openSessionRecord;
}

// ---------------------------------------------------------------------------
// 3. Interactive Muscle Recovery Heatmap & Weekly Volume Balance (14 MUSCLE_REGIONS)
// ---------------------------------------------------------------------------

export function computeMuscleRecoveryHeatmap(s, dateParam = null, now = clockNow()) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const targetDate = dateParam ? String(dateParam).trim() : localDate(now, tz);
  if (!validDate(targetDate)) {
    throw apiError('INVALID_DATE', 'Invalid calendar date format; expected YYYY-MM-DD.', { status: 400, params: { field: 'date' } });
  }
  const experienceLevel = s?.onboarding?.workoutPrefs?.fitnessLevel || 'beginner';
  const band = MEV_MAV_BY_LEVEL[experienceLevel] || MEV_MAV_BY_LEVEL.beginner;
  const weekStart = dateOffset(targetDate, -6);
  const window14Start = dateOffset(targetDate, -13);
  const refMs = targetDate === localDate(now, tz) ? now : Date.parse(`${targetDate}T18:00:00Z`);

  const weeklySetsByRegion = Object.fromEntries(Object.keys(MUSCLE_REGIONS).map(r => [r, 0]));
  const lastTrainedMsByRegion = Object.fromEntries(Object.keys(MUSCLE_REGIONS).map(r => [r, null]));
  const recentPainSetByRegion = new Set();

  for (const l of s.workoutLogs || []) {
    if (!validDate(l.date) || l.date < window14Start || l.date > targetDate) continue;
    const ex = EXERCISE_BY_ID.get(l.exerciseId);
    if (!ex) continue;
    const ws = workingSetsOf(l.sets);
    if (!ws.length) continue;

    const logMs = Number.isFinite(Date.parse(l.at || '')) ? Date.parse(l.at) : Date.parse(`${l.date}T12:00:00Z`);
    const hasPainSet = l.sets.some(set => set.pain === true) && (refMs - logMs) <= 48 * 3600000;
    const inWeek = l.date >= weekStart && l.date <= targetDate;

    const primarySet = new Set();
    const secondarySet = new Set();
    for (const m of ex.muscles || []) {
      const reg = regionForMuscle(m.muscle_id);
      if (!Object.hasOwn(MUSCLE_REGIONS, reg)) continue;
      if (m.role === 'primary') primarySet.add(reg);
      else secondarySet.add(reg);
    }

    for (const reg of primarySet) {
      if (inWeek) weeklySetsByRegion[reg] += ws.length;
      if (lastTrainedMsByRegion[reg] == null || logMs > lastTrainedMsByRegion[reg]) {
        lastTrainedMsByRegion[reg] = logMs;
      }
      if (hasPainSet) recentPainSetByRegion.add(reg);
    }
    for (const reg of secondarySet) {
      if (primarySet.has(reg)) continue;
      if (inWeek) weeklySetsByRegion[reg] += ws.length * 0.5;
      if (hasPainSet) recentPainSetByRegion.add(reg);
    }
  }

  // Most recent recovery check-in within 48 hours of targetDate
  const recentCheckin = (s.checkins || [])
    .filter(c => validDate(c.date) && c.date >= dateOffset(targetDate, -2) && c.date <= targetDate)
    .sort((a, b) => a.date.localeCompare(b.date) || (Date.parse(a.at || '') || 0) - (Date.parse(b.at || '') || 0))
    .at(-1) || null;
  const checkinPainRegions = new Set(recentCheckin?.painRegions || []);

  const muscles = Object.keys(MUSCLE_REGIONS).map(region => {
    const lastMs = lastTrainedMsByRegion[region];
    const hoursSinceTrained = lastMs != null ? Math.max(0, Math.round(((refMs - lastMs) / 3600000) * 10) / 10) : null;
    const sorenessRaw = recentCheckin?.sorenessByRegion?.[region];
    const sorenessScore = sorenessRaw != null && Number.isFinite(Number(sorenessRaw)) ? Number(sorenessRaw) : null;
    const painFlag = checkinPainRegions.has(region) || recentPainSetByRegion.has(region);
    const weeklyWorkingSets = Math.round((weeklySetsByRegion[region] || 0) * 10) / 10;

    let recoveryState = 'fresh';
    if (painFlag || (sorenessScore != null && sorenessScore >= 6) || (hoursSinceTrained != null && hoursSinceTrained < 24)) {
      recoveryState = 'fatigued';
    } else if ((sorenessScore != null && sorenessScore >= 4) || (hoursSinceTrained != null && hoursSinceTrained < 48)) {
      recoveryState = 'recovering';
    }

    return {
      region,
      recoveryState,
      hoursSinceTrained,
      sorenessScore,
      painFlag,
      weeklyWorkingSets,
      targetMev: band.mev,
      targetMav: band.mav
    };
  });

  return {
    date: targetDate,
    experienceLevel,
    muscles
  };
}
