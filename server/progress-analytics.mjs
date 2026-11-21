// Progress Analytics, Streaks, Engagement/Comeback Tier, Weekly Wrapped, and Home Screen Widget Snapshot
import { clockNow } from './clock.mjs';
import { localDate, dateOffset, validDate } from '../coaching-shared.mjs';
import { workingSetsOf } from './training-state.mjs';
import { dailyWaterTarget } from './coaching.mjs';
import { dayTotals, activePlan } from './food.mjs';
import { scheduledSessions } from './workouts.mjs';
import { getFastingState } from './nutrition-tools.mjs';
import { computeWorkoutPrs } from './workouts-insights.mjs';

function activityDatesSet(s) {
  const dates = new Set();
  for (const x of s.foodEntries || []) if (x.date) dates.add(x.date);
  for (const x of s.foodLogs || []) if (x.date && x.energy > 0) dates.add(x.date);
  for (const x of s.waterLogs || []) if (x.date && x.cups > 0) dates.add(x.date);
  for (const x of s.weights || []) if (x.date) dates.add(x.date);
  for (const x of s.workoutLogs || []) if (x.date) dates.add(x.date);
  for (const x of s.sessions || []) if (x.date && x.status !== 'missed') dates.add(x.date);
  for (const x of s.checkins || []) if (x.date) dates.add(x.date);
  return dates;
}

export function computeStreakAndEngagement(s, now = clockNow()) {
  const tz = s.profile?.timezone || 'Africa/Cairo';
  const today = localDate(now, tz);
  const activeDates = activityDatesSet(s);
  const freezes = new Set(s.streakFreezes || []);
  const qualified = new Set([...activeDates, ...freezes]);

  const todayQualified = qualified.has(today);
  let currentDays = 0;
  let cursor = todayQualified ? today : dateOffset(today, -1);
  while (qualified.has(cursor) && currentDays < 3650) {
    currentDays++;
    cursor = dateOffset(cursor, -1);
  }

  // Longest streak
  const sorted = [...qualified].filter(d => validDate(d) && d <= today).sort();
  let longestDays = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || dateOffset(sorted[i - 1], 1) === sorted[i]) run++;
    else run = 1;
    if (run > longestDays) longestDays = run;
  }

  const freezeUsedDates = (s.streakFreezes || []).filter(d => d <= today).sort();
  const freezeAvailable = !freezeUsedDates.some(d => d >= dateOffset(today, -6) && d <= today);

  // Engagement & Comeback Tier
  const sortedActivity = [...activeDates].filter(d => validDate(d) && d <= today).sort();
  const lastLoggedDate = sortedActivity.at(-1) || null;
  let daysSinceLastLog = 0;
  if (lastLoggedDate) {
    daysSinceLastLog = Math.max(0, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lastLoggedDate}T12:00:00Z`)) / 86400000));
  }
  const comebackTier = !lastLoggedDate ? 'none'
    : daysSinceLastLog >= 14 ? 'detrained_14d_plus'
    : daysSinceLastLog >= 7 ? 'medium_7_13d'
    : daysSinceLastLog >= 3 ? 'short_3_6d'
    : 'none';

  const lastCheckinDate = (s.checkins || []).map(c => c.date).filter(Boolean).sort().at(-1) || null;
  const weeklyCheckinDue = Boolean(s.profile && (!lastCheckinDate || lastCheckinDate < dateOffset(today, -6)));

  return {
    streakSummary: {
      currentDays,
      longestDays: Math.max(longestDays, currentDays),
      freezeAvailable,
      freezeUsedDates,
      todayQualified
    },
    engagementState: {
      daysSinceLastLog,
      lastLoggedAt: lastLoggedDate ? `${lastLoggedDate}T12:00:00.000Z` : null,
      weeklyCheckinDue,
      comebackTier
    }
  };
}

export function computeProgressAnalytics(s, { range = '30d', exerciseId = null } = {}, now = clockNow()) {
  const tz = s.profile?.timezone || 'Africa/Cairo';
  const today = localDate(now, tz);
  const rangeDays = range === '14d' ? 14 : range === '90d' ? 90 : range === 'all' ? 3650 : 30;
  const fromDate = dateOffset(today, -(rangeDays - 1));

  // Weight series + 7-day moving average
  const allWeights = [...new Map((s.weights || []).filter(w => validDate(w.date) && w.date <= today).map(w => [w.date, w])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightSeries = allWeights.filter(w => w.date >= fromDate).map(w => ({ date: w.date, kg: Number(w.kg), source: w.source || 'manual' }));
  const weightMovingAvg7d = weightSeries.map(pt => {
    const winStart = dateOffset(pt.date, -6);
    const slice = allWeights.filter(w => w.date >= winStart && w.date <= pt.date);
    const avg = Math.round((slice.reduce((sum, x) => sum + Number(x.kg), 0) / slice.length) * 100) / 100;
    return { date: pt.date, avgKg: avg, sampleCount: slice.length };
  });

  // Calorie adherence
  const calorieAdherence = (s.foodLogs || [])
    .filter(f => validDate(f.date) && f.date >= fromDate && f.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(f => ({
      date: f.date,
      energy: Number(f.energy || 0),
      targetEnergy: f.plannedEnergy != null ? Number(f.plannedEnergy) : null,
      protein: f.protein != null ? Number(f.protein) : null,
      adherencePct: f.adherence ?? null,
      complete: Boolean(f.complete)
    }));

  // Weekly training volume
  const weekBuckets = new Map();
  for (const l of s.workoutLogs || []) {
    if (!validDate(l.date) || l.date < fromDate || l.date > today) continue;
    const d = new Date(`${l.date}T12:00:00Z`);
    const weekStart = dateOffset(l.date, -d.getUTCDay());
    const ws = workingSetsOf(l.sets);
    const vol = ws.reduce((sum, set) => sum + Number(set.kg || 0) * Number(set.reps || 0), 0);
    const cur = weekBuckets.get(weekStart) || { weekStart, totalVolumeKg: 0, totalSets: 0 };
    cur.totalVolumeKg = Math.round((cur.totalVolumeKg + vol) * 10) / 10;
    cur.totalSets += ws.length;
    weekBuckets.set(weekStart, cur);
  }
  const weeklyVolume = [...weekBuckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // Estimated 1RM series for a target exercise
  const targetExId = exerciseId || s.workoutPlan?.days?.[0]?.exercises?.[0]?.id || null;
  const exercise1RmSeries = [];
  if (targetExId) {
    const exLogs = (s.workoutLogs || [])
      .filter(l => l.exerciseId === targetExId && validDate(l.date) && l.date >= fromDate && l.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const l of exLogs) {
      const ws = workingSetsOf(l.sets).filter(set => Number(set.kg || 0) > 0);
      if (!ws.length) continue;
      const best1Rm = Math.max(...ws.map(set => Math.round(Number(set.kg) * (1 + Number(set.reps) / 30) * 10) / 10));
      exercise1RmSeries.push({ date: l.date, exerciseId: targetExId, estimated1RmKg: best1Rm });
    }
  }

  // Estimated weeks remaining to targetWeight
  let estimatedWeeksRemaining = null;
  if (s.profile?.targetWeight != null && weightMovingAvg7d.length >= 2) {
    const latestKg = weightMovingAvg7d.at(-1).avgKg;
    const prevKg = weightMovingAvg7d[0].avgKg;
    const spanDays = Math.max(1, Math.floor((Date.parse(`${weightMovingAvg7d.at(-1).date}T12:00:00Z`) - Date.parse(`${weightMovingAvg7d[0].date}T12:00:00Z`)) / 86400000));
    const weeklySlope = ((latestKg - prevKg) / spanDays) * 7;
    const remaining = Number(s.profile.targetWeight) - latestKg;
    if ((remaining < 0 && weeklySlope < -0.05) || (remaining > 0 && weeklySlope > 0.05)) {
      estimatedWeeksRemaining = Math.min(260, Math.max(1, Math.ceil(Math.abs(remaining / weeklySlope))));
    }
  }

  return {
    range: ['14d', '30d', '90d', 'all'].includes(range) ? range : '30d',
    windowStart: fromDate,
    windowEnd: today,
    weightSeries,
    weightMovingAvg7d,
    calorieAdherence,
    weeklyVolume,
    exercise1RmSeries,
    estimatedWeeksRemaining
  };
}

export function computeWeeklyWrapped(s, weekEndParam = null, now = clockNow()) {
  const tz = s.profile?.timezone || 'Africa/Cairo';
  const weekEnd = (weekEndParam && validDate(weekEndParam)) ? weekEndParam : localDate(now, tz);
  const weekStart = dateOffset(weekEnd, -6);
  const foodWeek = (s.foodLogs || []).filter(f => f.date >= weekStart && f.date <= weekEnd && f.energy > 0);
  const completeFood = foodWeek.filter(f => f.complete);
  const avgCalories = foodWeek.length ? Math.round(foodWeek.reduce((sum, f) => sum + Number(f.energy || 0), 0) / foodWeek.length) : null;
  const proteinDays = foodWeek.filter(f => f.protein != null);
  const avgProteinGrams = proteinDays.length ? Math.round(proteinDays.reduce((sum, f) => sum + Number(f.protein || 0), 0) / proteinDays.length) : null;
  const adherenceDays = foodWeek.filter(f => f.adherence != null);
  const adherenceScorePct = adherenceDays.length ? Math.round(adherenceDays.reduce((sum, f) => sum + Number(f.adherence), 0) / adherenceDays.length) : 0;

  const sessionsWeek = (s.sessions || []).filter(x => x.date >= weekStart && x.date <= weekEnd && x.status === 'completed');
  const workoutsCompleted = sessionsWeek.length;
  const logsWeek = (s.workoutLogs || []).filter(l => l.date >= weekStart && l.date <= weekEnd);
  const totalVolumeKg = Math.round(logsWeek.reduce((sum, l) => sum + workingSetsOf(l.sets).reduce((v, set) => v + Number(set.kg || 0) * Number(set.reps || 0), 0), 0) * 10) / 10;

  const prs = computeWorkoutPrs(s, { since: weekStart });
  const newPrsCount = prs.items.filter(e => e.date <= weekEnd).length;

  const weightsWeek = (s.weights || []).filter(w => w.date >= weekStart && w.date <= weekEnd).sort((a, b) => a.date.localeCompare(b.date));
  const weightDeltaKg = weightsWeek.length >= 2 ? Math.round((Number(weightsWeek.at(-1).kg) - Number(weightsWeek[0].kg)) * 100) / 100 : null;

  const badgesUnlocked = [];
  if (completeFood.length >= 5) badgesUnlocked.push('CONSISTENT_LOGGER_5D');
  if (workoutsCompleted >= 3) badgesUnlocked.push('WORKOUT_WARRIOR_3X');
  if (newPrsCount >= 1) badgesUnlocked.push('NEW_PERSONAL_RECORD');
  if (adherenceScorePct >= 85) badgesUnlocked.push('NUTRITION_PRECISION_85');

  return {
    weekStart,
    weekEnd,
    adherenceScorePct,
    workoutsCompleted,
    totalVolumeKg,
    newPrsCount,
    avgCalories,
    avgProteinGrams,
    weightDeltaKg,
    badgesUnlocked
  };
}

export function buildWidgetSnapshot(s, now = clockNow()) {
  const tz = s.profile?.timezone || 'Africa/Cairo';
  const date = localDate(now, tz);
  const diary = dayTotals(s, date);
  const plan = activePlan(s);
  const planDay = plan?.days?.find(d => d.date === date);
  const targets = planDay?.targets || plan?.targets || null;
  const targetKcal = diary.planEnergy != null ? Number(diary.planEnergy) : (targets?.energy != null ? Number(targets.energy) : null);
  const consumedKcal = diary.totals.energy != null ? Number(diary.totals.energy) : 0;
  const waterTarget = dailyWaterTarget(s, date);
  const todayWater = (s.waterLogs || []).find(w => w.date === date);
  const fasting = getFastingState(s, now);
  const nextScheduled = scheduledSessions(s, date, 7)[0] || null;
  const todaySession = (s.sessions || []).find(x => x.date === date) || null;
  return {
    date,
    timezone: tz,
    serviceTrack: s.onboarding?.serviceTrack || null,
    caloriesRemaining: targetKcal != null ? Math.round(targetKcal - consumedKcal) : null,
    caloriesTarget: targetKcal != null ? Math.round(targetKcal) : null,
    proteinGrams: diary.totals.protein,
    carbsGrams: diary.totals.carbs,
    fatGrams: diary.totals.fat,
    waterCups: todayWater?.cups || 0,
    waterTargetCups: waterTarget.targetCups,
    fastingPhase: fasting.mode === 'off' ? 'off' : fasting.phase,
    fastingEndsAt: fasting.targetEndAt,
    nextWorkoutFocus: nextScheduled?.focus || null,
    workoutStatus: todaySession?.status || (nextScheduled?.date === date ? 'scheduled' : 'rest')
  };
}
