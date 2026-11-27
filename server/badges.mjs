// KAN-123 (US-PRG-09) & KAN-90/120: Unified 24-Badge Discipline Mastery Vault & Non-Punitive Mastery Rank
import { clockNow, isoNow, clockTimeZone } from './clock.mjs';
import { localDate, dateOffset, validDate, localTimeParts } from '../coaching-shared.mjs';
import { computeStreakAndEngagement, computeChallengeDayScore } from './progress-analytics.mjs';
import { computeWorkoutPrs } from './workouts-insights.mjs';
import { dailyWaterTarget } from './coaching.mjs';
import { activePlan } from './food.mjs';

const TIER_ORDER = ['none', 'bronze', 'silver', 'gold', 'platinum'];
const TIER_POINTS = { bronze: 25, silver: 50, gold: 100, platinum: 200 };

export const BADGE_REGISTRY = Object.freeze([
  // 1. Streaks & Comeback (All Tracks)
  { badgeId: 'STREAK_7D', category: 'streaks_comeback', thresholds: [7], tiers: ['bronze'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'STREAK_14D', category: 'streaks_comeback', thresholds: [14], tiers: ['silver'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'STREAK_30D', category: 'streaks_comeback', thresholds: [30, 60, 100, 365], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'COMEBACK_RESILIENT', category: 'streaks_comeback', thresholds: [1, 2, 4, 6], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },

  // 2. Nutrition Mastery (Hidden for workouts_only)
  { badgeId: 'CONSISTENT_LOGGER_5D', category: 'nutrition_mastery', thresholds: [1, 4, 12, 26], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: ['nutrition_and_workouts', 'nutrition_only'], isSeasonal: false, isProExclusive: false },
  { badgeId: 'NUTRITION_PRECISION_85', category: 'nutrition_mastery', thresholds: [1, 4, 12, 26], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: ['nutrition_and_workouts', 'nutrition_only'], isSeasonal: false, isProExclusive: false },
  { badgeId: 'PROTEIN_ANCHOR_7D', category: 'nutrition_mastery', thresholds: [1, 3, 8, 16], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: ['nutrition_and_workouts', 'nutrition_only'], isSeasonal: false, isProExclusive: false },
  { badgeId: 'HOME_CHEF_MASTER', category: 'nutrition_mastery', thresholds: [5, 20, 50, 100], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: ['nutrition_and_workouts', 'nutrition_only'], isSeasonal: false, isProExclusive: false },

  // 3. Strength, Cardio & PRs
  { badgeId: 'WORKOUT_WARRIOR_3X', category: 'strength_cardio', thresholds: [1, 4, 12, 26], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: ['nutrition_and_workouts', 'workouts_only'], isSeasonal: false, isProExclusive: false },
  { badgeId: 'NEW_PERSONAL_RECORD', category: 'strength_cardio', thresholds: [1, 5, 15, 40], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: ['nutrition_and_workouts', 'workouts_only'], isSeasonal: false, isProExclusive: false },
  { badgeId: 'VOLUME_MILESTONE', category: 'strength_cardio', thresholds: [10, 25, 75, 150], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: ['nutrition_and_workouts', 'workouts_only'], isSeasonal: false, isProExclusive: false },
  { badgeId: 'CARDIO_STRIDE_CLUB', category: 'strength_cardio', thresholds: [5, 20, 50, 120], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },

  // 4. Hydration Rhythm (All Tracks)
  { badgeId: 'HYDRATION_HERO_5D', category: 'hydration_rhythm', thresholds: [1, 4, 12, 26], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'HYDRATION_STREAK_14D', category: 'hydration_rhythm', thresholds: [14, 30, 60, 100], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'WORKOUT_HYDRATION_PRO', category: 'hydration_rhythm', thresholds: [5, 15, 40, 80], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'MORNING_HYDRATION_HABIT', category: 'hydration_rhythm', thresholds: [10, 30, 75, 150], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },

  // 5. Recovery & Specialist Synergy (All Tracks)
  { badgeId: 'RECOVERY_CHECKIN_7D', category: 'recovery_synergy', thresholds: [7, 30, 90, 180], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'RESTORATIVE_SLEEP_5D', category: 'recovery_synergy', thresholds: [1, 4, 12, 26], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'WEEKLY_AUDIT_CHAMPION', category: 'recovery_synergy', thresholds: [2, 8, 20, 40], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'SPECIALIST_SYNC_PARTNER', category: 'recovery_synergy', thresholds: [2, 6, 15, 30], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },

  // 6. Seasonal, Challenges & Social
  { badgeId: 'RAMADAN_MINDFUL_MONTH', category: 'seasonal_social', thresholds: [15, 25, 29], tiers: ['bronze', 'silver', 'gold'], tracks: 'all', isSeasonal: true, isProExclusive: false },
  { badgeId: 'PUBLIC_CHALLENGE_FINISHER', category: 'seasonal_social', thresholds: [1, 3, 6, 12], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'FRIEND_CHALLENGE_CHAMPION', category: 'seasonal_social', thresholds: [1, 3, 8, 15], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false },
  { badgeId: 'ACCOUNTABILITY_SUPPORTER', category: 'seasonal_social', thresholds: [5, 25, 75, 200], tiers: ['bronze', 'silver', 'gold', 'platinum'], tracks: 'all', isSeasonal: false, isProExclusive: false }
]);

const MASTERY_RANKS = [
  { tier: 'initiate', min: 0, nextTier: 'dedicated', nextMin: 250 },
  { tier: 'dedicated', min: 250, nextTier: 'resilient', nextMin: 750 },
  { tier: 'resilient', min: 750, nextTier: 'elite', nextMin: 1750 },
  { tier: 'elite', min: 1750, nextTier: 'legend', nextMin: 3500 },
  { tier: 'legend', min: 3500, nextTier: null, nextMin: null }
];

function weekKeyOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return dateOffset(dateStr, -d.getUTCDay());
}

function resolveTierAndNext(def, progressCurrent) {
  let currentTier = 'none';
  let progressNext = def.thresholds[0];
  for (let i = 0; i < def.thresholds.length; i++) {
    if (progressCurrent >= def.thresholds[i]) {
      currentTier = def.tiers[i];
      progressNext = def.thresholds[i + 1] ?? null;
    } else {
      progressNext = def.thresholds[i];
      break;
    }
  }
  return { currentTier, progressNext };
}

function tierPointsCumulative(def, currentTier) {
  if (!currentTier || currentTier === 'none') return 0;
  let pts = 0;
  for (const t of def.tiers) {
    pts += TIER_POINTS[t] || 0;
    if (t === currentTier) break;
  }
  return pts;
}

export function computeMasteryRank(points) {
  const safePts = Math.max(0, Math.floor(Number(points) || 0));
  let matched = MASTERY_RANKS[0];
  for (const r of MASTERY_RANKS) {
    if (safePts >= r.min) matched = r;
  }
  return {
    tier: matched.tier,
    points: safePts,
    nextTier: matched.nextTier,
    pointsToNext: matched.nextMin != null ? Math.max(0, matched.nextMin - safePts) : 0
  };
}

async function fetchSocialBadgeMetrics(db, userId, today = null, s = null) {
  const out = {
    publicCompleted: 0,
    friendHighScoreCount: 0,
    cheersSent: 0,
    socialOptedIn: false
  };
  if (!db) return out;
  try {
    const [pub, fcCheers, pcCheers, fcCount, pcCount] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM challenge_participations WHERE user_id=? AND completed_at IS NOT NULL').bind(userId).first().catch(() => null),
      db.prepare('SELECT COUNT(*) AS n FROM friend_challenge_cheers WHERE from_user_id=?').bind(userId).first().catch(() => null),
      db.prepare('SELECT COUNT(*) AS n FROM private_circle_cheers WHERE from_user_id=?').bind(userId).first().catch(() => null),
      db.prepare('SELECT COUNT(*) AS n FROM friend_challenge_members WHERE user_id=? AND left_at IS NULL').bind(userId).first().catch(() => null),
      db.prepare('SELECT COUNT(*) AS n FROM private_circle_members WHERE user_id=?').bind(userId).first().catch(() => null)
    ]);
    out.publicCompleted = Number(pub?.n || 0);
    out.cheersSent = Number(fcCheers?.n || 0) + Number(pcCheers?.n || 0);
    const joinedPub = await db.prepare('SELECT COUNT(*) AS n FROM challenge_participations WHERE user_id=?').bind(userId).first().catch(() => null);
    out.socialOptedIn = Number(fcCount?.n || 0) > 0 || Number(pcCount?.n || 0) > 0 || Number(joinedPub?.n || 0) > 0 || out.cheersSent > 0;

    // Count completed/ended friend challenges where user achieved >= 80% normalized score (KAN-123 C2)
    const refDay = today || localDate(clockNow(), 'Africa/Cairo');
    const endedRes = await db.prepare(
      `SELECT c.id, c.metric_type, c.start_date, c.end_date FROM friend_challenge_members m
       JOIN friend_challenges c ON c.id = m.challenge_id
       WHERE m.user_id=? AND m.left_at IS NULL AND (c.status='completed' OR c.end_date < ?)`
    ).bind(userId, refDay).all().catch(() => null);
    let highCount = 0;
    for (const fc of endedRes?.results || []) {
      if (!s) { highCount++; continue; }
      const endBound = refDay < fc.end_date ? refDay : fc.end_date;
      let sum = 0;
      let days = 0;
      for (let d = fc.start_date; d <= endBound && days < 31; d = dateOffset(d, 1)) {
        sum += computeChallengeDayScore(s, fc.metric_type, d);
        days++;
      }
      if (days > 0 && Math.round(sum / days) >= 80) highCount++;
    }
    out.friendHighScoreCount = highCount;
  } catch {}
  return out;
}

function computeRawBadgeProgress(s, socialMetrics, now = clockNow()) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const { streakSummary } = computeStreakAndEngagement(s, now);
  const maxStreak = Math.max(streakSummary.currentDays || 0, streakSummary.longestDays || 0);

  // Qualifying dates for comeback & mastery points
  const activityDates = new Set();
  for (const x of s.foodEntries || []) if (x.date) activityDates.add(x.date);
  for (const x of s.foodLogs || []) if (x.date && Number(x.energy || 0) > 0) activityDates.add(x.date);
  for (const x of s.waterLogs || []) if (x.date && Number(x.cups || 0) > 0) activityDates.add(x.date);
  for (const x of s.sessions || []) if (x.date && x.status !== 'missed') activityDates.add(x.date);
  for (const x of s.openWorkoutSessions || []) if (x.date) activityDates.add(x.date);
  for (const x of s.checkins || []) if (x.date) activityDates.add(x.date);
  for (const x of s.cardioLogs || []) if (x.date && Number(x.durationMinutes || 0) >= 20) activityDates.add(x.date);

  const sortedAct = [...activityDates].filter(validDate).sort();
  const gapWindows = [];
  for (let i = 1; i < sortedAct.length; i++) {
    const gap = Math.floor((Date.parse(`${sortedAct[i]}T12:00:00Z`) - Date.parse(`${sortedAct[i - 1]}T12:00:00Z`)) / 86400000);
    if (gap >= 7) gapWindows.push({ start: sortedAct[i - 1], end: dateOffset(sortedAct[i], 2) });
  }
  const explicitComebacks = (s.history || []).filter(h => h.kind === 'comeback_restart').filter(h => {
    const hDate = h.at ? localDate(Date.parse(h.at), tz) : null;
    if (!hDate || !validDate(hDate)) return true;
    return !gapWindows.some(w => hDate >= w.start && hDate <= w.end);
  }).length;
  const comebackCount = gapWindows.length + explicitComebacks;

  // Nutrition Mastery metrics
  const completeFoodByWeek = new Map();
  const precisionByWeek = new Map();
  const planProtein = Number(activePlan(s)?.targets?.protein || 0);
  const proteinHitDates = new Set();
  for (const f of s.foodLogs || []) {
    if (!validDate(f.date)) continue;
    const wk = weekKeyOf(f.date);
    if (f.complete) {
      completeFoodByWeek.set(wk, (completeFoodByWeek.get(wk) || 0) + 1);
    }
    const proteinRatio = planProtein > 0 && f.protein != null ? Number(f.protein) / planProtein : (f.adherence != null ? Number(f.adherence) / 100 : 0);
    if (proteinRatio >= 0.9) proteinHitDates.add(f.date);
    if (Number(f.adherence || 0) >= 85 && proteinRatio >= 0.85) {
      precisionByWeek.set(wk, (precisionByWeek.get(wk) || 0) + 1);
    }
  }
  const consistentLoggerWeeks = [...completeFoodByWeek.values()].filter(n => n >= 5).length;
  const nutritionPrecisionWeeks = [...precisionByWeek.values()].filter(n => n >= 5).length;

  // Non-overlapping 10-day windows hitting >= 7 protein target days
  const sortedProt = [...proteinHitDates].sort();
  let proteinAnchorBlocks = 0;
  let idx = 0;
  while (idx + 6 < sortedProt.length) {
    const span = Math.floor((Date.parse(`${sortedProt[idx + 6]}T12:00:00Z`) - Date.parse(`${sortedProt[idx]}T12:00:00Z`)) / 86400000);
    if (span <= 9) {
      proteinAnchorBlocks++;
      idx += 7;
    } else {
      idx++;
    }
  }

  const homeChefMeals = (s.foodEntries || []).filter(e =>
    e.source === 'recipe' ||
    Boolean(e.fromPantry) ||
    Boolean(s.preferences?.batchPrepMode && e.source === 'planned')
  ).length;

  // Strength, Cardio & PRs
  const workoutsByWeek = new Map();
  let totalCompletedWorkouts = 0;
  for (const sess of s.sessions || []) {
    if (sess.status === 'completed' && validDate(sess.date)) {
      totalCompletedWorkouts++;
      const wk = weekKeyOf(sess.date);
      workoutsByWeek.set(wk, (workoutsByWeek.get(wk) || 0) + 1);
    }
  }
  for (const os of s.openWorkoutSessions || []) {
    if (validDate(os.date)) {
      totalCompletedWorkouts++;
      const wk = weekKeyOf(os.date);
      workoutsByWeek.set(wk, (workoutsByWeek.get(wk) || 0) + 1);
    }
  }
  const workoutWarriorWeeks = [...workoutsByWeek.values()].filter(n => n >= 3).length;
  const verifiedPrsCount = computeWorkoutPrs(s).items.length;
  const cardioStrideCount = (s.cardioLogs || []).filter(c => Number(c.durationMinutes || 0) >= 20).length;

  // Hydration Rhythm
  const waterAdherentDates = [];
  const waterWeeks = new Map();
  let workoutHydrationDays = 0;
  let morningHydrationDays = 0;
  const ramadanIftarMins = (() => {
    const [h, m] = String(s.ramadanMode?.iftarTime || '18:05').split(':').map(Number);
    return (h || 18) * 60 + (m || 5);
  })();
  for (const w of s.waterLogs || []) {
    if (!validDate(w.date) || !(Number(w.cups || 0) > 0)) continue;
    const wt = dailyWaterTarget(s, w.date);
    const targetCups = w.targetCups || wt.targetCups;
    if (Number(w.cups) >= Math.ceil(targetCups * 0.8)) {
      waterAdherentDates.push(w.date);
      const wk = weekKeyOf(w.date);
      waterWeeks.set(wk, (waterWeeks.get(wk) || 0) + 1);
    }
    if (wt.isWorkoutDay && Number(w.cups) >= targetCups) {
      workoutHydrationDays++;
    }
    if (w.at && Number.isFinite(Date.parse(w.at))) {
      const tp = localTimeParts(Date.parse(w.at), tz);
      const [hh, mm] = tp.time.slice(0, 5).split(':').map(Number);
      const mins = hh * 60 + mm;
      const inRamadan = Boolean(s.ramadanMode?.enabled && !(s.ramadanMode.endDate && w.date > s.ramadanMode.endDate));
      if (inRamadan) {
        if (mins >= ramadanIftarMins && mins <= ramadanIftarMins + 60) morningHydrationDays++;
      } else if (mins < 11 * 60) {
        morningHydrationDays++;
      }
    }
  }
  const hydrationHeroWeeks = [...waterWeeks.values()].filter(n => n >= 5).length;
  const uniqueWaterSorted = [...new Set(waterAdherentDates)].sort();
  let maxHydrationStreak = 0;
  let run = 0;
  for (let i = 0; i < uniqueWaterSorted.length; i++) {
    if (i === 0 || dateOffset(uniqueWaterSorted[i - 1], 1) === uniqueWaterSorted[i]) run++;
    else run = 1;
    if (run > maxHydrationStreak) maxHydrationStreak = run;
  }

  // Recovery & Specialist Synergy
  const totalCheckins = (s.checkins || []).length;
  const sleepWeeks = new Map();
  for (const c of s.checkins || []) {
    if (validDate(c.date) && Number(c.sleepHours || 0) >= 7 && Number(c.sleepQuality || 0) >= 4) {
      const wk = weekKeyOf(c.date);
      sleepWeeks.set(wk, (sleepWeeks.get(wk) || 0) + 1);
    }
  }
  const restorativeSleepWeeks = [...sleepWeeks.values()].filter(n => n >= 5).length;
  const auditDates = new Set();
  for (const f of s.coachingFeedback || []) {
    if (f?.date && validDate(f.date)) auditDates.add(f.date);
  }
  if (s.lastWeeklyCheckinAt && Number.isFinite(Date.parse(s.lastWeeklyCheckinAt))) {
    auditDates.add(localDate(Date.parse(s.lastWeeklyCheckinAt), tz));
  }
  const weeklyAuditsCount = auditDates.size;
  const specialistSyncCount =
    (s.adaptations || []).filter(a => ['accepted', 'rejected'].includes(a.status)).length +
    (s.coachingCases || []).filter(c => ['accepted', 'resolved', 'declined'].includes(c.status)).length;

  // Ramadan qualifying days (bounded to startDate..endDate so pre-Ramadan logs never pre-unlock on Day 1)
  const ramadanDays = s.ramadanMode?.enabled
    ? sortedAct.filter(d =>
        (!s.ramadanMode.startDate || d >= s.ramadanMode.startDate) &&
        (!s.ramadanMode.endDate || d <= s.ramadanMode.endDate)
      ).length
    : 0;

  return {
    progressByBadge: {
      STREAK_7D: maxStreak,
      STREAK_14D: maxStreak,
      STREAK_30D: maxStreak,
      COMEBACK_RESILIENT: comebackCount,
      CONSISTENT_LOGGER_5D: consistentLoggerWeeks,
      NUTRITION_PRECISION_85: nutritionPrecisionWeeks,
      PROTEIN_ANCHOR_7D: proteinAnchorBlocks,
      HOME_CHEF_MASTER: homeChefMeals,
      WORKOUT_WARRIOR_3X: workoutWarriorWeeks,
      NEW_PERSONAL_RECORD: verifiedPrsCount,
      VOLUME_MILESTONE: totalCompletedWorkouts,
      CARDIO_STRIDE_CLUB: cardioStrideCount,
      HYDRATION_HERO_5D: hydrationHeroWeeks,
      HYDRATION_STREAK_14D: maxHydrationStreak,
      WORKOUT_HYDRATION_PRO: workoutHydrationDays,
      MORNING_HYDRATION_HABIT: morningHydrationDays,
      RECOVERY_CHECKIN_7D: totalCheckins,
      RESTORATIVE_SLEEP_5D: restorativeSleepWeeks,
      WEEKLY_AUDIT_CHAMPION: weeklyAuditsCount,
      SPECIALIST_SYNC_PARTNER: specialistSyncCount,
      RAMADAN_MINDFUL_MONTH: ramadanDays,
      PUBLIC_CHALLENGE_FINISHER: socialMetrics.publicCompleted,
      FRIEND_CHALLENGE_CHAMPION: socialMetrics.friendHighScoreCount,
      ACCOUNTABILITY_SUPPORTER: socialMetrics.cheersSent
    },
    qualifyingDaysTotal: sortedAct.length,
    weeklyAuditsCount,
    challengesCompletedTotal: socialMetrics.publicCompleted + socialMetrics.friendHighScoreCount,
    today
  };
}

export async function syncAndEvaluateBadges(db, s, userId, now = clockNow()) {
  const track = s?.onboarding?.serviceTrack || 'nutrition_and_workouts';
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const socialMetrics = await fetchSocialBadgeMetrics(db, userId, localDate(now, tz), s);
  const { progressByBadge, qualifyingDaysTotal, weeklyAuditsCount, challengesCompletedTotal } = computeRawBadgeProgress(s, socialMetrics, now);

  const storedMap = new Map();
  if (db) {
    try {
      const res = await db.prepare('SELECT badge_id, current_tier, progress_current, unlocked_at, notified_at FROM user_badges WHERE user_id=?').bind(userId).all();
      for (const r of res?.results || []) storedMap.set(r.badge_id, r);
    } catch (e) {
      if (!/no such table/i.test(e?.message || '')) throw e;
    }
  }

  const nowIso = isoNow();
  const upserts = [];
  const visibleBadges = [];
  const newlyUnlockedBadges = [];
  let badgePoints = 0;

  for (const def of BADGE_REGISTRY) {
    const rawProg = Number(progressByBadge[def.badgeId] || 0);
    const prev = storedMap.get(def.badgeId) || null;
    const prevProg = prev ? Number(prev.progress_current || 0) : 0;
    const effectiveProg = Math.max(rawProg, prevProg);
    const { currentTier: calcTier, progressNext } = resolveTierAndNext(def, effectiveProg);

    // Non-punitive: earned badge tier never downgrades
    const prevTierIdx = prev ? TIER_ORDER.indexOf(prev.current_tier || 'none') : 0;
    const calcTierIdx = TIER_ORDER.indexOf(calcTier);
    const finalTier = calcTierIdx >= prevTierIdx ? calcTier : (prev?.current_tier || 'none');
    const unlockedAt = finalTier !== 'none' ? (prev?.unlocked_at || nowIso) : null;

    if (finalTier !== 'none') {
      badgePoints += tierPointsCumulative(def, finalTier);
      const upgraded = calcTierIdx > prevTierIdx;
      const notifiedAt = upgraded ? null : (prev?.notified_at || null);

      if (db && (!prev || upgraded || effectiveProg > prevProg)) {
        upserts.push(
          db.prepare(
            'INSERT OR REPLACE INTO user_badges(user_id,badge_id,current_tier,progress_current,unlocked_at,notified_at,updated_at) VALUES(?,?,?,?,?,?,?)'
          ).bind(userId, def.badgeId, finalTier, effectiveProg, unlockedAt, notifiedAt, nowIso)
        );
      }
      if (!notifiedAt) {
        newlyUnlockedBadges.push({ badgeId: def.badgeId, tier: finalTier, unlockedAt });
      }
    }

    // Track & contextual visibility rules (KAN-123 Comment 2)
    let visible = def.tracks === 'all' || (Array.isArray(def.tracks) && def.tracks.includes(track));
    if (def.badgeId === 'RAMADAN_MINDFUL_MONTH') {
      visible = Boolean(s?.ramadanMode?.enabled || finalTier !== 'none');
    }
    if (def.badgeId === 'ACCOUNTABILITY_SUPPORTER') {
      visible = Boolean(socialMetrics.socialOptedIn || finalTier !== 'none');
    }

    if (visible) {
      visibleBadges.push({
        badgeId: def.badgeId,
        category: def.category,
        currentTier: finalTier,
        progressCurrent: effectiveProg,
        progressNext,
        unlockedAt,
        isSeasonal: def.isSeasonal,
        isProExclusive: def.isProExclusive
      });
    }
  }

  if (db && upserts.length) {
    try { await db.batch(upserts); } catch {}
  }

  const totalPoints =
    badgePoints +
    qualifyingDaysTotal * 5 +
    weeklyAuditsCount * 20 +
    challengesCompletedTotal * 75;

  const unlockedCount = visibleBadges.filter(b => b.currentTier !== 'none').length;

  return {
    masteryRank: computeMasteryRank(totalPoints),
    visibleBadges,
    newlyUnlockedBadges,
    summary: {
      unlockedCount,
      totalVisibleCount: visibleBadges.length,
      totalRegistryCount: BADGE_REGISTRY.length
    }
  };
}

export async function acknowledgeBadges(db, userId, badgeIds = null) {
  const nowIso = isoNow();
  if (!db) return { acknowledged: 0, acknowledgedAt: nowIso };
  try {
    if (Array.isArray(badgeIds) && badgeIds.length > 0) {
      const cleaned = badgeIds.slice(0, 50).map(id => String(id || '').trim()).filter(Boolean);
      const stmts = cleaned.map(id =>
        db.prepare('UPDATE user_badges SET notified_at=?, updated_at=? WHERE user_id=? AND badge_id=?').bind(nowIso, nowIso, userId, id)
      );
      if (stmts.length) await db.batch(stmts);
      return { acknowledged: stmts.length, badgeIds: cleaned, acknowledgedAt: nowIso };
    }
    const res = await db.prepare('UPDATE user_badges SET notified_at=?, updated_at=? WHERE user_id=? AND notified_at IS NULL').bind(nowIso, nowIso, userId).run();
    return { acknowledged: Number(res?.meta?.changes || 0), acknowledgedAt: nowIso };
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return { acknowledged: 0, acknowledgedAt: nowIso };
    throw e;
  }
}
