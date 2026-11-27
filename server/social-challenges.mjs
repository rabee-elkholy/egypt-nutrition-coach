// KAN-123 (US-PRG-09) & KAN-120 (US-PRG-07): Public Community Challenges, Private Friend Challenges,
// Opt-In Private Accountability Circles & Anti-Abuse Friend Referrals.
// Enforces strict clinical/track safety filtering, fair 0-100% personal-target normalized scoring,
// daily anti-cheat caps, rate-limited cheers, and ZERO-PII social projections.

import { clockNow, isoNow, clockTimeZone } from './clock.mjs';
import {
  localDate,
  dateOffset,
  validDate,
  integer,
  canonicalInjuries,
  isPregnantStatus
} from '../coaching-shared.mjs';
import { apiError } from '../coaching-error.mjs';
import { loadAccount, sha256Hex } from './store.mjs';
import { dailyWaterTarget } from './coaching.mjs';
import { accountRecovery } from './recovery.mjs';
import { activePlan, dayTotals } from './food.mjs';
import { computeStreakAndEngagement } from './progress-analytics.mjs';
import { signAvatarUrlIfNeeded } from './media.mjs';
import { sendFriendChallengeCheerPush } from './push.mjs';
import { resolveEntitlements, FREE_LIMITS } from './subscriptions.mjs';

const VALID_FRIEND_METRICS = new Set(['hydration', 'protein', 'workouts', 'steps_cardio', 'sleep', 'all_round']);
const VALID_FRIEND_DURATIONS = new Set([7, 14, 30]);
const VALID_REACTIONS = new Set(['cheer', 'clap', 'spark', 'water_drop', 'muscle', 'calm_wave']);
const MAX_CHEERS_PER_FRIEND_PER_DAY = 3;
const MAX_REWARDED_REFERRALS_PER_YEAR = 3;
const REFERRAL_BONUS_DAYS = 7;

function extractFirstName(rawName) {
  const cleaned = String(rawName || '').trim();
  if (!cleaned) return 'Member';
  return cleaned.split(/\s+/)[0].slice(0, 32);
}

function generateInviteCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function isPublicChallengeEligibleForUser(challenge, s, now = clockNow()) {
  const track = s?.onboarding?.serviceTrack || 'nutrition_and_workouts';
  let tracks = [];
  let safeFlags = {};
  try { tracks = JSON.parse(challenge.tracks_json || '[]'); } catch {}
  try { safeFlags = JSON.parse(challenge.clinical_safe_for_json || '{}'); } catch {}

  if (tracks.length && !tracks.includes(track)) return false;

  const profile = s?.profile || {};
  const isPregnant = isPregnantStatus(profile.maternalStatus);
  const isSenior = Boolean(profile.seniorMode || Number(profile.age) >= 70);
  const injuries = canonicalInjuries(s?.onboarding?.workoutPrefs?.injuries || []);
  const tz = profile.timezone || clockTimeZone() || 'Africa/Cairo';
  const ready = accountRecovery(s, now, tz);
  const redFlagStop = ready.status === 'stop' || s?.onboarding?.workoutPrefs?.parqRedFlag === true;

  if (isPregnant && safeFlags.allowPregnant === false) return false;
  if (isSenior && safeFlags.allowSenior === false) return false;
  if (redFlagStop && safeFlags.allowRedFlags === false) return false;
  if (injuries.length >= 3 && safeFlags.allowMultiInjury === false) return false;
  return true;
}

// Compute verified progress deterministically from D1-backed user state with 1-credit/day anti-cheat cap
function computeVerifiedPublicProgress(s, challenge, joinedDate, today) {
  const startDate = joinedDate > challenge.start_date ? joinedDate : challenge.start_date;
  const endBound = today < challenge.end_date ? today : challenge.end_date;
  const metric = challenge.metric_type;
  const plan = activePlan(s);
  const targetProtein = Number(plan?.targets?.protein || 0);
  const dailyGrid = [];
  let progressValue = 0;

  // Iterate capped window (at most 90 days)
  const capStart = dateOffset(endBound, -Math.min(89, Math.max(0, Number(challenge.duration_days || 30) - 1)));
  const effStart = startDate > capStart ? startDate : capStart;

  for (let d = effStart; d <= endBound && dailyGrid.length < 90; d = dateOffset(d, 1)) {
    let qualified = false;
    if (metric === 'hydration_days') {
      const w = (s.waterLogs || []).find(x => x.date === d);
      const tgt = w?.targetCups || dailyWaterTarget(s, d).targetCups;
      qualified = Boolean(w && Number(w.cups || 0) >= Math.ceil(tgt * 0.8));
    } else if (metric === 'workout_sessions') {
      const hasScheduled = (s.sessions || []).some(x => x.date === d && x.status === 'completed');
      const hasOpen = (s.openWorkoutSessions || []).some(x => x.date === d);
      qualified = hasScheduled || hasOpen;
    } else if (metric === 'walking_cardio_days') {
      const cardioMins = (s.cardioLogs || []).filter(c => c.date === d).reduce((sum, c) => sum + Number(c.durationMinutes || 0), 0);
      const steps = (s.activityLogs || []).filter(a => a.date === d).reduce((mx, a) => Math.max(mx, Number(a.steps || 0)), 0);
      qualified = cardioMins >= 20 || steps >= 6000;
    } else if (metric === 'protein_target_days') {
      const f = (s.foodLogs || []).find(x => x.date === d);
      if (f && f.protein != null) {
        qualified = targetProtein > 0 ? Number(f.protein) >= targetProtein * 0.85 : Number(f.protein) >= 60;
      }
    } else if (metric === 'sleep_recovery_days') {
      const c = (s.checkins || []).find(x => x.date === d);
      qualified = Boolean(c && Number(c.sleepHours || 0) >= 7 && Number(c.sleepQuality || 0) >= 3);
    } else {
      // qualifying_days (all-round healthy habit)
      const hasFood = (s.foodEntries || []).some(e => e.date === d) || (s.foodLogs || []).some(f => f.date === d && Number(f.energy || 0) > 0);
      const w = (s.waterLogs || []).find(x => x.date === d);
      const hasWater = Boolean(w && Number(w.cups || 0) >= Math.ceil((w.targetCups || dailyWaterTarget(s, d).targetCups) * 0.8));
      const hasWorkout = (s.sessions || []).some(x => x.date === d && x.status !== 'missed') || (s.openWorkoutSessions || []).some(x => x.date === d);
      const hasCheckin = (s.checkins || []).some(c => c.date === d);
      qualified = hasFood || hasWater || hasWorkout || hasCheckin;
    }
    if (qualified) progressValue += 1;
    dailyGrid.push({ date: d, completed: qualified });
  }

  const targetValue = Math.max(1, Number(challenge.target_value || 7));
  const progressPct = Math.min(100, Math.round((progressValue / targetValue) * 100));
  const daysRemaining = Math.max(0, Math.floor((Date.parse(`${challenge.end_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000));
  return {
    progressValue,
    targetValue,
    progressPct,
    completed: progressValue >= targetValue,
    daysRemaining,
    dailyGrid
  };
}

// ---------------------------------------------------------------------------
// 1. Public Community Challenges (KAN-123)
// ---------------------------------------------------------------------------

export async function listPublicChallenges(db, s, userId, now = clockNow()) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  let rows = [];
  let parts = [];
  try {
    const [chgRes, partRes] = await Promise.all([
      db.prepare('SELECT * FROM public_challenges WHERE end_date >= ? ORDER BY is_seasonal DESC, duration_days ASC').bind(today).all(),
      db.prepare('SELECT * FROM challenge_participations WHERE user_id=?').bind(userId).all()
    ]);
    rows = chgRes?.results || [];
    parts = partRes?.results || [];
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return { items: [], filteredOutCount: 0 };
    throw e;
  }

  const partMap = new Map(parts.map(p => [p.challenge_id, p]));
  const items = [];
  let filteredOutCount = 0;

  for (const chg of rows) {
    const eligible = isPublicChallengeEligibleForUser(chg, s, now);
    if (!eligible) {
      filteredOutCount++;
      continue;
    }
    const part = partMap.get(chg.id) || null;
    let progress = null;
    if (part) {
      const joinedDate = String(part.joined_at || today).slice(0, 10);
      progress = computeVerifiedPublicProgress(s, chg, joinedDate, today);
    }
    items.push({
      id: chg.id,
      slug: chg.slug,
      titleKey: chg.title_key,
      category: chg.category,
      metricType: chg.metric_type,
      targetValue: chg.target_value,
      durationDays: chg.duration_days,
      startDate: chg.start_date,
      endDate: chg.end_date,
      badgeId: chg.badge_id || null,
      isSeasonal: Boolean(chg.is_seasonal),
      joined: Boolean(part),
      isPinned: Boolean(part?.is_pinned),
      progressPct: progress ? progress.progressPct : 0,
      progressValue: progress ? progress.progressValue : 0,
      completed: progress ? progress.completed : false,
      daysRemaining: Math.max(0, Math.floor((Date.parse(`${chg.end_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000))
    });
  }
  return { items, filteredOutCount };
}

export async function joinPublicChallenge(db, s, userId, challengeId, body = {}, now = clockNow()) {
  const id = String(challengeId || '').trim();
  const chg = await db.prepare('SELECT * FROM public_challenges WHERE id=? OR slug=?').bind(id, id).first();
  if (!chg) {
    throw apiError('CHALLENGE_NOT_FOUND', 'Public challenge not found.', { status: 404, params: { challengeId: id } });
  }
  if (!isPublicChallengeEligibleForUser(chg, s, now)) {
    throw apiError('CHALLENGE_INELIGIBLE_CLINICAL', 'This challenge is not recommended for your active track or clinical safety profile.', {
      status: 403,
      params: { challengeId: chg.id }
    });
  }
  const existing = await db.prepare('SELECT 1 FROM challenge_participations WHERE user_id=? AND challenge_id=?').bind(userId, chg.id).first();
  if (existing) {
    throw apiError('ALREADY_JOINED', 'You have already joined this challenge.', { status: 409, params: { challengeId: chg.id } });
  }
  const nowIso = isoNow();
  const isPinned = body?.pin === true ? 1 : 0;
  if (isPinned) {
    await db.prepare('UPDATE challenge_participations SET is_pinned=0 WHERE user_id=?').bind(userId).run().catch(() => {});
  }
  await db.prepare(
    'INSERT INTO challenge_participations(user_id,challenge_id,joined_at,completed_at,progress_value,progress_pct,is_pinned,updated_at) VALUES(?,?,?,NULL,0,0,?,?)'
  ).bind(userId, chg.id, nowIso, isPinned, nowIso).run();
  return { joined: true, challengeId: chg.id, titleKey: chg.title_key, joinedAt: nowIso, isPinned: Boolean(isPinned) };
}

export async function getPublicChallengeProgress(db, s, userId, challengeId, now = clockNow()) {
  const id = String(challengeId || '').trim();
  const chg = await db.prepare('SELECT * FROM public_challenges WHERE id=? OR slug=?').bind(id, id).first();
  if (!chg) {
    throw apiError('CHALLENGE_NOT_FOUND', 'Public challenge not found.', { status: 404, params: { challengeId: id } });
  }
  const part = await db.prepare('SELECT * FROM challenge_participations WHERE user_id=? AND challenge_id=?').bind(userId, chg.id).first();
  if (!part) {
    throw apiError('CHALLENGE_NOT_FOUND', 'You have not joined this public challenge yet.', { status: 404, params: { challengeId: chg.id } });
  }
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const joinedDate = String(part.joined_at || today).slice(0, 10);
  const calc = computeVerifiedPublicProgress(s, chg, joinedDate, today);
  const nowIso = isoNow();
  const completedAt = part.completed_at || (calc.completed ? nowIso : null);

  await db.prepare(
    'UPDATE challenge_participations SET progress_value=?, progress_pct=?, completed_at=?, updated_at=? WHERE user_id=? AND challenge_id=?'
  ).bind(calc.progressValue, calc.progressPct, completedAt, nowIso, userId, chg.id).run();

  const cohortStats = await db.prepare(
    'SELECT COUNT(*) AS total, SUM(CASE WHEN progress_pct > ? THEN 1 ELSE 0 END) AS higher FROM challenge_participations WHERE challenge_id=?'
  ).bind(calc.progressPct, chg.id).first().catch(() => ({ total: 1, higher: 0 }));
  const totalParticipants = Math.max(1, Number(cohortStats?.total || 1));
  const higherCount = Number(cohortStats?.higher || 0);
  const topPct = Math.max(1, Math.min(100, Math.ceil(((higherCount + 1) / totalParticipants) * 100)));

  return {
    challengeId: chg.id,
    titleKey: chg.title_key,
    category: chg.category,
    metricType: chg.metric_type,
    progressValue: calc.progressValue,
    targetValue: calc.targetValue,
    progressPct: calc.progressPct,
    daysRemaining: calc.daysRemaining,
    completed: calc.completed,
    completedAt,
    cohortPercentile: topPct,
    cohortSize: totalParticipants,
    finisherMedallionEligible: calc.completed,
    dailyGrid: calc.dailyGrid
  };
}

// ---------------------------------------------------------------------------
// 2. Private Friend Challenges — Fair Normalized Scoring (0-100%) & Zero-PII
// ---------------------------------------------------------------------------

function computeNormalizedDayScore(memberState, metricType, date) {
  const track = memberState?.onboarding?.serviceTrack || 'nutrition_and_workouts';
  const waterScore = () => {
    const w = (memberState.waterLogs || []).find(x => x.date === date);
    const tgt = w?.targetCups || dailyWaterTarget(memberState, date).targetCups;
    if (!w || !(tgt > 0)) return 0;
    return Math.min(100, Math.round((Number(w.cups || 0) / tgt) * 100));
  };
  const proteinScore = () => {
    const planP = Number(activePlan(memberState)?.targets?.protein || 0);
    const f = (memberState.foodLogs || []).find(x => x.date === date);
    if (!f || f.protein == null) return 0;
    const denom = planP > 0 ? planP : 80;
    return Math.min(100, Math.round((Number(f.protein) / denom) * 100));
  };
  const workoutScore = () => {
    const hasCompleted = (memberState.sessions || []).some(x => x.date === date && x.status === 'completed') ||
      (memberState.openWorkoutSessions || []).some(x => x.date === date);
    if (hasCompleted) return 100;
    const hasPartial = (memberState.sessions || []).some(x => x.date === date && x.status === 'partial');
    return hasPartial ? 60 : 0;
  };
  const stepsCardioScore = () => {
    const mins = (memberState.cardioLogs || []).filter(c => c.date === date).reduce((sum, c) => sum + Number(c.durationMinutes || 0), 0);
    const steps = (memberState.activityLogs || []).filter(a => a.date === date).reduce((mx, a) => Math.max(mx, Number(a.steps || 0)), 0);
    return Math.min(100, Math.max(Math.round((mins / 30) * 100), Math.round((steps / 8000) * 100)));
  };
  const sleepScore = () => {
    const c = (memberState.checkins || []).find(x => x.date === date);
    if (!c) return 0;
    return Number(c.sleepHours || 0) >= 7 ? 100 : Math.min(95, Math.round((Number(c.sleepHours || 0) / 7) * 100));
  };

  if (metricType === 'hydration') return waterScore();
  if (metricType === 'protein') return proteinScore();
  if (metricType === 'workouts') return workoutScore();
  if (metricType === 'steps_cardio') return stepsCardioScore();
  if (metricType === 'sleep') return sleepScore();

  // all_round: fair track-normalized average so nutrition_only & both compete 100% equally!
  const components = [waterScore()];
  if (track !== 'workouts_only') {
    const diary = dayTotals(memberState, date);
    const fScore = diary.entries.length > 0 ? Math.max(proteinScore(), 80) : 0;
    components.push(fScore);
  }
  if (track !== 'nutrition_only') {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const isTrainingDay = (memberState.workoutPlan?.days || []).some(d => d.dayIndex === weekday);
    if (isTrainingDay) components.push(workoutScore());
  }
  const hasCheckin = (memberState.checkins || []).some(c => c.date === date);
  if (hasCheckin) components.push(100);
  return Math.round(components.reduce((sum, v) => sum + v, 0) / Math.max(1, components.length));
}

export async function createFriendChallenge(db, env, s, userId, body = {}, now = clockNow()) {
  const title = String(body?.title || '').trim();
  if (title.length < 2 || title.length > 80) {
    throw apiError('VALIDATION_ERROR', 'Friend challenge title must be between 2 and 80 characters.', { status: 400 });
  }
  const metricType = String(body?.metricType || 'all_round').trim().toLowerCase();
  if (!VALID_FRIEND_METRICS.has(metricType)) {
    throw apiError('VALIDATION_ERROR', 'metricType must be hydration, protein, workouts, steps_cardio, sleep, or all_round.', { status: 400 });
  }
  const durationDays = Number(body?.durationDays ?? 14);
  if (!VALID_FRIEND_DURATIONS.has(durationDays)) {
    throw apiError('VALIDATION_ERROR', 'durationDays must be 7, 14, or 30.', { status: 400 });
  }
  const maxMembers = body?.maxMembers == null ? 12 : integer(body.maxMembers, 2, 12, 'maxMembers');
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const startDate = body?.startDate ? String(body.startDate).trim() : today;
  if (!validDate(startDate) || startDate < dateOffset(today, -1) || startDate > dateOffset(today, 30)) {
    throw apiError('INVALID_DATE', 'startDate must be a valid YYYY-MM-DD date within the next 30 days.', { status: 400, params: { field: 'startDate' } });
  }
  const endDate = dateOffset(startDate, durationDays - 1);

  // Entitlement gate: Free users can host 1 active Friend Challenge at a time; Pro unlimited
  if (env?.ENFORCE_PRO_ENTITLEMENTS === 'true') {
    const ent = await resolveEntitlements(db, s, userId, today, env);
    if (ent.tier !== 'pro') {
      const activeHosted = await db.prepare(
        "SELECT COUNT(*) AS n FROM friend_challenges WHERE creator_user_id=? AND status='active' AND end_date>=?"
      ).bind(userId, today).first();
      if (Number(activeHosted?.n || 0) >= FREE_LIMITS.activeHostedFriendChallengesLimit) {
        throw apiError('PRO_ENTITLEMENT_REQUIRED', 'Free accounts can host 1 active friend challenge at a time; upgrade to CuraFit Pro for unlimited hosted challenges.', {
          status: 402,
          params: { feature: 'friend_challenges_unlimited' }
        });
      }
    }
  }

  const id = `fchg_${crypto.randomUUID()}`;
  const inviteCode = generateInviteCode(6);
  const nowIso = isoNow();
  await db.batch([
    db.prepare(
      "INSERT INTO friend_challenges(id,creator_user_id,invite_code,title,metric_type,duration_days,start_date,end_date,max_members,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'active',?)"
    ).bind(id, userId, inviteCode, title, metricType, durationDays, startDate, endDate, maxMembers, nowIso),
    db.prepare(
      'INSERT INTO friend_challenge_members(challenge_id,user_id,joined_at,is_pinned,left_at) VALUES(?,?,?,1,NULL)'
    ).bind(id, userId, nowIso)
  ]);

  return {
    id,
    title,
    metricType,
    durationDays,
    startDate,
    endDate,
    maxMembers,
    inviteCode,
    shareDeepLink: `curafit://challenges/friends/join/${inviteCode}`,
    status: 'active',
    createdAt: nowIso
  };
}

export async function joinFriendChallenge(db, userId, body = {}) {
  const code = String(body?.inviteCode || '').trim().toUpperCase();
  if (!code || code.length < 4 || code.length > 16) {
    throw apiError('INVALID_INVITE_CODE', 'Invite code is invalid or expired.', { status: 404 });
  }
  const chg = await db.prepare('SELECT * FROM friend_challenges WHERE invite_code=?').bind(code).first();
  if (!chg) {
    throw apiError('INVALID_INVITE_CODE', 'Invite code is invalid or expired.', { status: 404 });
  }
  const existing = await db.prepare(
    'SELECT left_at FROM friend_challenge_members WHERE challenge_id=? AND user_id=?'
  ).bind(chg.id, userId).first();
  if (existing && !existing.left_at) {
    throw apiError('ALREADY_JOINED', 'You have already joined this friend challenge.', { status: 409, params: { challengeId: chg.id } });
  }
  const countRow = await db.prepare(
    'SELECT COUNT(*) AS n FROM friend_challenge_members WHERE challenge_id=? AND left_at IS NULL'
  ).bind(chg.id).first();
  if (Number(countRow?.n || 0) >= Number(chg.max_members || 12)) {
    throw apiError('CHALLENGE_FULL', 'This friend challenge has reached its maximum capacity of members.', {
      status: 409,
      params: { maxMembers: Number(chg.max_members || 12) }
    });
  }
  const nowIso = isoNow();
  await db.prepare(
    'INSERT OR REPLACE INTO friend_challenge_members(challenge_id,user_id,joined_at,is_pinned,left_at) VALUES(?,?,?,0,NULL)'
  ).bind(chg.id, userId, nowIso).run();
  return { joined: true, challengeId: chg.id, title: chg.title, inviteCode: chg.invite_code, joinedAt: nowIso };
}

export async function listFriendChallenges(db, userId) {
  try {
    const res = await db.prepare(
      `SELECT c.*, m.joined_at, m.is_pinned,
              (SELECT COUNT(*) FROM friend_challenge_members m2 WHERE m2.challenge_id = c.id AND m2.left_at IS NULL) AS member_count
       FROM friend_challenges c
       JOIN friend_challenge_members m ON m.challenge_id = c.id
       WHERE m.user_id = ? AND m.left_at IS NULL
       ORDER BY c.created_at DESC`
    ).bind(userId).all();
    return {
      items: (res?.results || []).map(r => ({
        id: r.id,
        title: r.title,
        metricType: r.metric_type,
        durationDays: r.duration_days,
        startDate: r.start_date,
        endDate: r.end_date,
        inviteCode: r.invite_code,
        memberCount: Number(r.member_count || 1),
        maxMembers: Number(r.max_members || 12),
        isCreator: r.creator_user_id === userId,
        isPinned: Boolean(r.is_pinned),
        status: r.status
      }))
    };
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return { items: [] };
    throw e;
  }
}

export async function getFriendChallengeDetail(db, env, origin, userId, challengeId, now = clockNow()) {
  const chg = await db.prepare('SELECT * FROM friend_challenges WHERE id=?').bind(challengeId).first();
  if (!chg) {
    throw apiError('CHALLENGE_NOT_FOUND', 'Friend challenge not found.', { status: 404, params: { challengeId } });
  }
  const myMember = await db.prepare(
    'SELECT 1 FROM friend_challenge_members WHERE challenge_id=? AND user_id=? AND left_at IS NULL'
  ).bind(chg.id, userId).first();
  if (!myMember) {
    throw apiError('CHALLENGE_NOT_FOUND', 'Friend challenge not found.', { status: 404, params: { challengeId } });
  }

  const [membersRes, blocksRes, cheersRes] = await Promise.all([
    db.prepare(
      `SELECT m.user_id, m.joined_at, u.display_name, u.avatar_url
       FROM friend_challenge_members m
       LEFT JOIN coaching_users u ON u.user_id = m.user_id
       WHERE m.challenge_id=? AND m.left_at IS NULL`
    ).bind(chg.id).all(),
    db.prepare('SELECT blocked_user_id FROM friend_challenge_blocks WHERE user_id=?').bind(userId).all().catch(() => ({ results: [] })),
    db.prepare(
      'SELECT id, from_user_id, to_user_id, reaction_code, date, created_at FROM friend_challenge_cheers WHERE challenge_id=? ORDER BY created_at DESC LIMIT 30'
    ).bind(chg.id).all().catch(() => ({ results: [] }))
  ]);

  const blockedSet = new Set((blocksRes?.results || []).map(b => b.blocked_user_id));
  const todayUtc = localDate(now, 'Africa/Cairo');
  const evalEnd = todayUtc < chg.end_date ? todayUtc : chg.end_date;

  const members = [];
  for (const m of membersRes?.results || []) {
    if (blockedSet.has(m.user_id)) continue;
    const acc = await loadAccount(db, m.user_id);
    const mTz = acc?.profile?.timezone || 'Africa/Cairo';
    const mToday = localDate(now, mTz);
    const mEnd = mToday < chg.end_date ? mToday : chg.end_date;
    const dailyGrid = [];
    let scoreSum = 0;
    let completedDays = 0;
    for (let d = chg.start_date; d <= mEnd && dailyGrid.length < 31; d = dateOffset(d, 1)) {
      const scorePct = computeNormalizedDayScore(acc, chg.metric_type, d);
      const completed = scorePct >= 80;
      if (completed) completedDays++;
      scoreSum += scorePct;
      dailyGrid.push({ date: d, scorePct, completed });
    }
    const normalizedScorePct = dailyGrid.length ? Math.round(scoreSum / dailyGrid.length) : 0;
    const avatarUrl = await signAvatarUrlIfNeeded(origin, m.avatar_url || acc?.profile?.avatarUrl || null, m.user_id, env);
    // STRICT ZERO-PII PROJECTION: no weight, calories, BMI, diseases, injuries, or cycle fields!
    members.push({
      userId: m.user_id,
      firstName: extractFirstName(acc?.profile?.name || m.display_name),
      avatarUrl,
      normalizedScorePct,
      completedDays,
      totalDays: chg.duration_days,
      dailyGrid
    });
  }
  members.sort((a, b) => b.normalizedScorePct - a.normalizedScorePct || b.completedDays - a.completedDays);

  const daysRemaining = Math.max(0, Math.floor((Date.parse(`${chg.end_date}T12:00:00Z`) - Date.parse(`${evalEnd}T12:00:00Z`)) / 86400000));
  return {
    id: chg.id,
    title: chg.title,
    metricType: chg.metric_type,
    durationDays: chg.duration_days,
    startDate: chg.start_date,
    endDate: chg.end_date,
    daysRemaining,
    inviteCode: chg.invite_code,
    maxMembers: chg.max_members,
    status: todayUtc > chg.end_date ? 'completed' : chg.status,
    members,
    recentCheers: (cheersRes?.results || [])
      .filter(c => !blockedSet.has(c.from_user_id))
      .map(c => ({
        id: c.id,
        fromUserId: c.from_user_id,
        toUserId: c.to_user_id,
        reactionCode: c.reaction_code,
        date: c.date,
        createdAt: c.created_at
      }))
  };
}

export async function cheerFriendChallenge(db, env, s, userId, challengeId, body = {}, now = clockNow()) {
  const targetUserId = String(body?.targetUserId || '').trim();
  const reactionCode = String(body?.reactionCode || 'cheer').trim().toLowerCase();
  if (!targetUserId || targetUserId === userId || !VALID_REACTIONS.has(reactionCode)) {
    throw apiError('VALIDATION_ERROR', 'targetUserId (another member) and valid reactionCode are required.', { status: 400 });
  }
  const membersCheck = await db.prepare(
    'SELECT user_id FROM friend_challenge_members WHERE challenge_id=? AND user_id IN (?,?) AND left_at IS NULL'
  ).bind(challengeId, userId, targetUserId).all();
  if ((membersCheck?.results || []).length < 2) {
    throw apiError('CHALLENGE_NOT_FOUND', 'Both users must be active members of this friend challenge.', { status: 404 });
  }
  const blocked = await db.prepare(
    'SELECT 1 FROM friend_challenge_blocks WHERE (user_id=? AND blocked_user_id=?) OR (user_id=? AND blocked_user_id=?)'
  ).bind(targetUserId, userId, userId, targetUserId).first().catch(() => null);
  if (blocked) {
    throw apiError('CHALLENGE_NOT_FOUND', 'Cannot send cheer to this user.', { status: 404 });
  }

  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const dailyRow = await db.prepare(
    'SELECT COUNT(*) AS n FROM friend_challenge_cheers WHERE from_user_id=? AND to_user_id=? AND date=?'
  ).bind(userId, targetUserId, today).first();
  if (Number(dailyRow?.n || 0) >= MAX_CHEERS_PER_FRIEND_PER_DAY) {
    throw apiError('CHEER_RATE_LIMITED', 'Daily cheer limit (3 per friend per day) has been reached.', {
      status: 429,
      retryable: true,
      params: { maxPerDay: MAX_CHEERS_PER_FRIEND_PER_DAY }
    });
  }

  const cheerId = `chr_${crypto.randomUUID()}`;
  const nowIso = isoNow();
  await db.prepare(
    'INSERT INTO friend_challenge_cheers(id,challenge_id,from_user_id,to_user_id,reaction_code,date,created_at) VALUES(?,?,?,?,?,?,?)'
  ).bind(cheerId, challengeId, userId, targetUserId, reactionCode, today, nowIso).run();

  const pushRes = await sendFriendChallengeCheerPush(
    env,
    targetUserId,
    {
      senderFirstName: extractFirstName(s?.profile?.name),
      challengeId,
      reactionCode,
      deepLink: `curafit://challenges/friends/${challengeId}`
    },
    now
  );

  return {
    cheerId,
    challengeId,
    targetUserId,
    reactionCode,
    remainingTodayForFriend: Math.max(0, MAX_CHEERS_PER_FRIEND_PER_DAY - Number(dailyRow?.n || 0) - 1),
    pushQueued: pushRes.queued > 0,
    createdAt: nowIso
  };
}

export async function leaveFriendChallenge(db, userId, challengeId) {
  const existing = await db.prepare(
    'SELECT 1 FROM friend_challenge_members WHERE challenge_id=? AND user_id=? AND left_at IS NULL'
  ).bind(challengeId, userId).first();
  if (!existing) {
    throw apiError('CHALLENGE_NOT_FOUND', 'Active membership in this friend challenge was not found.', { status: 404 });
  }
  const nowIso = isoNow();
  await db.prepare('UPDATE friend_challenge_members SET left_at=? WHERE challenge_id=? AND user_id=?').bind(nowIso, challengeId, userId).run();
  return { left: true, challengeId, leftAt: nowIso };
}

export async function blockFriendChallengeUser(db, userId, challengeId, body = {}) {
  const targetUserId = String(body?.targetUserId || '').trim();
  if (!targetUserId || targetUserId === userId) {
    throw apiError('VALIDATION_ERROR', 'Valid targetUserId is required to block.', { status: 400 });
  }
  const nowIso = isoNow();
  const reason = body?.reason ? String(body.reason).trim().slice(0, 200) : null;
  await db.prepare(
    'INSERT OR REPLACE INTO friend_challenge_blocks(user_id,blocked_user_id,reason,created_at) VALUES(?,?,?,?)'
  ).bind(userId, targetUserId, reason, nowIso).run();
  return { blocked: true, challengeId, blockedUserId: targetUserId, blockedAt: nowIso };
}

// ---------------------------------------------------------------------------
// 3. Opt-In Private Accountability Circles (KAN-120 Comment 3 — Max 8 Members, Strict Zero-PII)
// ---------------------------------------------------------------------------

export async function createPrivateCircle(db, userId, body = {}) {
  const name = String(body?.name || '').trim();
  if (name.length < 2 || name.length > 60) {
    throw apiError('VALIDATION_ERROR', 'Circle name must be between 2 and 60 characters.', { status: 400 });
  }
  const maxMembers = body?.maxMembers == null ? 8 : integer(body.maxMembers, 2, 8, 'maxMembers');
  const id = `cir_${crypto.randomUUID()}`;
  const inviteCode = generateInviteCode(6);
  const nowIso = isoNow();
  await db.batch([
    db.prepare(
      'INSERT INTO private_circles(id,creator_user_id,name,invite_code,max_members,created_at) VALUES(?,?,?,?,?,?)'
    ).bind(id, userId, name, inviteCode, maxMembers, nowIso),
    db.prepare(
      'INSERT INTO private_circle_members(circle_id,user_id,joined_at) VALUES(?,?,?)'
    ).bind(id, userId, nowIso)
  ]);
  return { id, name, inviteCode, maxMembers, shareDeepLink: `curafit://circles/join/${inviteCode}`, createdAt: nowIso };
}

export async function joinPrivateCircle(db, userId, body = {}) {
  const code = String(body?.inviteCode || '').trim().toUpperCase();
  if (!code || code.length < 4 || code.length > 16) {
    throw apiError('INVALID_INVITE_CODE', 'Circle invite code is invalid or expired.', { status: 404 });
  }
  const circle = await db.prepare('SELECT * FROM private_circles WHERE invite_code=?').bind(code).first();
  if (!circle) {
    throw apiError('INVALID_INVITE_CODE', 'Circle invite code is invalid or expired.', { status: 404 });
  }
  const existing = await db.prepare('SELECT 1 FROM private_circle_members WHERE circle_id=? AND user_id=?').bind(circle.id, userId).first();
  if (existing) {
    throw apiError('ALREADY_IN_CIRCLE', 'You are already a member of this private circle.', { status: 409, params: { circleId: circle.id } });
  }
  const cnt = await db.prepare('SELECT COUNT(*) AS n FROM private_circle_members WHERE circle_id=?').bind(circle.id).first();
  if (Number(cnt?.n || 0) >= Number(circle.max_members || 8)) {
    throw apiError('CIRCLE_FULL', 'This private circle has reached its maximum capacity of 8 members.', {
      status: 409,
      params: { maxMembers: Number(circle.max_members || 8) }
    });
  }
  const nowIso = isoNow();
  await db.prepare('INSERT INTO private_circle_members(circle_id,user_id,joined_at) VALUES(?,?,?)').bind(circle.id, userId, nowIso).run();
  return { joined: true, circleId: circle.id, name: circle.name, inviteCode: circle.invite_code, joinedAt: nowIso };
}

export async function listPrivateCircles(db, userId) {
  try {
    const res = await db.prepare(
      `SELECT c.*, m.joined_at,
              (SELECT COUNT(*) FROM private_circle_members m2 WHERE m2.circle_id = c.id) AS member_count
       FROM private_circles c
       JOIN private_circle_members m ON m.circle_id = c.id
       WHERE m.user_id = ?
       ORDER BY c.created_at DESC`
    ).bind(userId).all();
    return {
      items: (res?.results || []).map(r => ({
        id: r.id,
        name: r.name,
        inviteCode: r.invite_code,
        memberCount: Number(r.member_count || 1),
        maxMembers: Number(r.max_members || 8),
        isCreator: r.creator_user_id === userId,
        joinedAt: r.joined_at
      }))
    };
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return { items: [] };
    throw e;
  }
}

export async function getPrivateCircleFeed(db, env, origin, userId, circleId, now = clockNow()) {
  const circle = await db.prepare('SELECT * FROM private_circles WHERE id=?').bind(circleId).first();
  if (!circle) {
    throw apiError('CIRCLE_NOT_FOUND', 'Private circle not found.', { status: 404, params: { circleId } });
  }
  const myMem = await db.prepare('SELECT 1 FROM private_circle_members WHERE circle_id=? AND user_id=?').bind(circleId, userId).first();
  if (!myMem) {
    throw apiError('CIRCLE_NOT_FOUND', 'Private circle not found.', { status: 404, params: { circleId } });
  }

  const [membersRes, blocksRes, cheersRes] = await Promise.all([
    db.prepare(
      `SELECT m.user_id, u.display_name, u.avatar_url
       FROM private_circle_members m
       LEFT JOIN coaching_users u ON u.user_id = m.user_id
       WHERE m.circle_id=?`
    ).bind(circleId).all(),
    db.prepare('SELECT blocked_user_id FROM private_circle_blocks WHERE user_id=?').bind(userId).all().catch(() => ({ results: [] })),
    db.prepare('SELECT id, from_user_id, to_user_id, reaction_code, date, created_at FROM private_circle_cheers WHERE circle_id=? ORDER BY created_at DESC LIMIT 30').bind(circleId).all().catch(() => ({ results: [] }))
  ]);

  const blockedSet = new Set((blocksRes?.results || []).map(b => b.blocked_user_id));
  const members = [];

  for (const m of membersRes?.results || []) {
    if (blockedSet.has(m.user_id)) continue;
    const acc = await loadAccount(db, m.user_id);
    const mTz = acc?.profile?.timezone || 'Africa/Cairo';
    const mToday = localDate(now, mTz);
    const wLog = (acc.waterLogs || []).find(w => w.date === mToday);
    const wTarget = wLog?.targetCups || dailyWaterTarget(acc, mToday).targetCups;
    const { streakSummary } = computeStreakAndEngagement(acc, now);
    const avatarUrl = await signAvatarUrlIfNeeded(origin, m.avatar_url || acc?.profile?.avatarUrl || null, m.user_id, env);

    // STRICT ZERO-PII PROJECTION (KAN-120 Comment 3): ONLY binary habit signals!
    members.push({
      userId: m.user_id,
      firstName: extractFirstName(acc?.profile?.name || m.display_name),
      avatarUrl,
      todaySignals: {
        workoutDone: Boolean(
          (acc.sessions || []).some(x => x.date === mToday && x.status === 'completed') ||
          (acc.openWorkoutSessions || []).some(x => x.date === mToday)
        ),
        hydrationDone: Boolean(wLog && Number(wLog.cups || 0) >= Math.ceil(wTarget * 0.8)),
        mealLogged: Boolean(
          (acc.foodEntries || []).some(e => e.date === mToday) ||
          (acc.foodLogs || []).some(f => f.date === mToday && Number(f.energy || 0) > 0)
        ),
        streakActive: Boolean((streakSummary.currentDays || 0) > 0)
      }
    });
  }

  return {
    circleId: circle.id,
    name: circle.name,
    inviteCode: circle.invite_code,
    maxMembers: circle.max_members,
    members,
    recentCheers: (cheersRes?.results || [])
      .filter(c => !blockedSet.has(c.from_user_id))
      .map(c => ({
        id: c.id,
        fromUserId: c.from_user_id,
        toUserId: c.to_user_id,
        reactionCode: c.reaction_code,
        date: c.date,
        createdAt: c.created_at
      }))
  };
}

export async function cheerPrivateCircle(db, env, s, userId, circleId, body = {}, now = clockNow()) {
  const targetUserId = String(body?.targetUserId || '').trim();
  const reactionCode = String(body?.reactionCode || 'cheer').trim().toLowerCase();
  if (!targetUserId || targetUserId === userId || !VALID_REACTIONS.has(reactionCode)) {
    throw apiError('VALIDATION_ERROR', 'targetUserId (another member) and valid reactionCode are required.', { status: 400 });
  }
  const mems = await db.prepare(
    'SELECT user_id FROM private_circle_members WHERE circle_id=? AND user_id IN (?,?)'
  ).bind(circleId, userId, targetUserId).all();
  if ((mems?.results || []).length < 2) {
    throw apiError('CIRCLE_NOT_FOUND', 'Private circle or member not found.', { status: 404, params: { circleId } });
  }
  const blocked = await db.prepare(
    'SELECT 1 FROM private_circle_blocks WHERE (user_id=? AND blocked_user_id=?) OR (user_id=? AND blocked_user_id=?)'
  ).bind(targetUserId, userId, userId, targetUserId).first().catch(() => null);
  if (blocked) {
    throw apiError('CIRCLE_NOT_FOUND', 'Cannot send cheer to this circle member.', { status: 404, params: { circleId } });
  }

  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const dailyRow = await db.prepare(
    'SELECT COUNT(*) AS n FROM private_circle_cheers WHERE from_user_id=? AND to_user_id=? AND date=?'
  ).bind(userId, targetUserId, today).first();
  if (Number(dailyRow?.n || 0) >= MAX_CHEERS_PER_FRIEND_PER_DAY) {
    throw apiError('CHEER_RATE_LIMITED', 'Daily cheer limit (3 per friend per day) has been reached.', {
      status: 429,
      retryable: true,
      params: { maxPerDay: MAX_CHEERS_PER_FRIEND_PER_DAY }
    });
  }

  const cheerId = `cchr_${crypto.randomUUID()}`;
  const nowIso = isoNow();
  await db.prepare(
    'INSERT INTO private_circle_cheers(id,circle_id,from_user_id,to_user_id,reaction_code,date,created_at) VALUES(?,?,?,?,?,?,?)'
  ).bind(cheerId, circleId, userId, targetUserId, reactionCode, today, nowIso).run();

  await sendFriendChallengeCheerPush(
    env,
    targetUserId,
    {
      senderFirstName: extractFirstName(s?.profile?.name),
      challengeId: circleId,
      reactionCode,
      deepLink: `curafit://circles/${circleId}`
    },
    now
  );

  return {
    cheerId,
    circleId,
    targetUserId,
    reactionCode,
    remainingTodayForFriend: Math.max(0, MAX_CHEERS_PER_FRIEND_PER_DAY - Number(dailyRow?.n || 0) - 1),
    createdAt: nowIso
  };
}

export async function leavePrivateCircle(db, userId, circleId) {
  const existing = await db.prepare('SELECT 1 FROM private_circle_members WHERE circle_id=? AND user_id=?').bind(circleId, userId).first();
  if (!existing) {
    throw apiError('CIRCLE_NOT_FOUND', 'Private circle membership not found.', { status: 404, params: { circleId } });
  }
  await db.prepare('DELETE FROM private_circle_members WHERE circle_id=? AND user_id=?').bind(circleId, userId).run();
  return { left: true, circleId };
}

export async function blockPrivateCircleUser(db, userId, circleId, body = {}) {
  const targetUserId = String(body?.targetUserId || '').trim();
  if (!targetUserId || targetUserId === userId) {
    throw apiError('VALIDATION_ERROR', 'Valid targetUserId is required to block.', { status: 400 });
  }
  const nowIso = isoNow();
  const reason = body?.reason ? String(body.reason).trim().slice(0, 200) : null;
  await db.prepare(
    'INSERT OR REPLACE INTO private_circle_blocks(user_id,blocked_user_id,reason,created_at) VALUES(?,?,?,?)'
  ).bind(userId, targetUserId, reason, nowIso).run();
  return { blocked: true, circleId, blockedUserId: targetUserId, blockedAt: nowIso };
}

// ---------------------------------------------------------------------------
// 4. Widget Active Challenge Resolver (KAN-91 & KAN-116 Comment 3)
// ---------------------------------------------------------------------------

export async function resolveActiveChallengeForWidget(db, s, userId, now = clockNow()) {
  if (!db) return null;
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  try {
    const pub = await db.prepare(
      `SELECT p.challenge_id, p.joined_at, p.is_pinned, c.*
       FROM challenge_participations p
       JOIN public_challenges c ON c.id = p.challenge_id
       WHERE p.user_id = ? AND c.end_date >= ?
       ORDER BY p.is_pinned DESC, p.updated_at DESC
       LIMIT 1`
    ).bind(userId, today).first();
    if (pub) {
      const calc = computeVerifiedPublicProgress(s, pub, String(pub.joined_at || today).slice(0, 10), today);
      return {
        id: pub.id,
        kind: 'public',
        titleKey: pub.title_key,
        progressPct: calc.progressPct,
        daysRemaining: calc.daysRemaining
      };
    }
    const fc = await db.prepare(
      `SELECT c.*, m.is_pinned
       FROM friend_challenge_members m
       JOIN friend_challenges c ON c.id = m.challenge_id
       WHERE m.user_id = ? AND m.left_at IS NULL AND c.status = 'active' AND c.end_date >= ?
       ORDER BY m.is_pinned DESC, c.created_at DESC
       LIMIT 1`
    ).bind(userId, today).first();
    if (fc) {
      const mEnd = today < fc.end_date ? today : fc.end_date;
      let sum = 0;
      let days = 0;
      for (let d = fc.start_date; d <= mEnd && days < 31; d = dateOffset(d, 1)) {
        sum += computeNormalizedDayScore(s, fc.metric_type, d);
        days++;
      }
      const daysRemaining = Math.max(0, Math.floor((Date.parse(`${fc.end_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000));
      return {
        id: fc.id,
        kind: 'friend',
        titleKey: fc.title,
        progressPct: days ? Math.round(sum / days) : 0,
        daysRemaining
      };
    }
  } catch {}
  return null;
}

// ---------------------------------------------------------------------------
// 5. Anti-Abuse Friend Referrals (KAN-123 Comment 1)
// ---------------------------------------------------------------------------

async function grantReferralProBonus(db, userId, bonusDays = REFERRAL_BONUS_DAYS) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const existing = await db.prepare(
    "SELECT external_tx_id, expires_at FROM coaching_subscriptions WHERE user_id=? AND provider='referral' ORDER BY expires_at DESC LIMIT 1"
  ).bind(userId).first().catch(() => null);

  const baseMs = existing?.expires_at && Date.parse(existing.expires_at) > nowMs
    ? Date.parse(existing.expires_at)
    : nowMs;
  // Cap stacking strictly to max 30 days ahead from now for referral bonuses
  const maxAllowedMs = nowMs + 30 * 86400000;
  const nextExpIso = new Date(Math.min(maxAllowedMs, baseMs + bonusDays * 86400000)).toISOString();
  const txId = existing?.external_tx_id || `ref_bonus_${userId}`;

  await db.batch([
    db.prepare(
      "INSERT OR REPLACE INTO coaching_subscriptions(user_id,provider,external_tx_id,product_id,status,trial_used,auto_renew_enabled,expires_at,raw_state_json,updated_at) VALUES(?,'referral',?,'curafit_pro.referral_bonus','active',0,0,?,?,?)"
    ).bind(userId, txId, nextExpIso, JSON.stringify({ bonusDays, grantedAt: nowIso }), nowIso),
    db.prepare("UPDATE coaching_users SET entitlement='pro', updated_at=? WHERE user_id=?").bind(nowIso, userId)
  ]);
  return nextExpIso;
}

export async function getOrCreateReferralCode(db, userId) {
  let row = await db.prepare('SELECT code, created_at FROM coaching_referrals WHERE referrer_user_id=?').bind(userId).first();
  if (!row) {
    const code = `CF-${generateInviteCode(6)}`;
    const nowIso = isoNow();
    await db.prepare('INSERT INTO coaching_referrals(code,referrer_user_id,created_at) VALUES(?,?,?)').bind(code, userId, nowIso).run();
    row = { code, created_at: nowIso };
  }
  const cutoffIso = new Date(Date.now() - 365 * 86400000).toISOString();
  const cnt = await db.prepare(
    'SELECT COUNT(*) AS n FROM coaching_referral_redemptions WHERE referrer_user_id=? AND granted_at >= ?'
  ).bind(userId, cutoffIso).first().catch(() => ({ n: 0 }));
  const rewardedCountLast12Months = Number(cnt?.n || 0);
  return {
    code: row.code,
    bonusDaysPerReferral: REFERRAL_BONUS_DAYS,
    rewardedCountLast12Months,
    maxRewardedPer12Months: MAX_REWARDED_REFERRALS_PER_YEAR,
    remainingRewardSlots: Math.max(0, MAX_REWARDED_REFERRALS_PER_YEAR - rewardedCountLast12Months),
    shareDeepLink: `curafit://referrals/redeem/${row.code}`,
    createdAt: row.created_at
  };
}

export async function redeemReferralCode(db, s, userId, auth, body = {}) {
  const code = String(body?.code || '').trim().toUpperCase();
  if (!code) {
    throw apiError('INVALID_INVITE_CODE', 'Referral code is invalid.', { status: 404 });
  }
  const refRow = await db.prepare('SELECT code, referrer_user_id FROM coaching_referrals WHERE code=?').bind(code).first();
  if (!refRow) {
    throw apiError('INVALID_INVITE_CODE', 'Referral code is invalid.', { status: 404 });
  }
  const referrerUserId = refRow.referrer_user_id;

  // 1. Self-referral block
  if (referrerUserId === userId) {
    throw apiError('REFERRAL_INELIGIBLE', 'Self-referrals are not eligible for bonus Pro days.', { status: 409, params: { reason: 'self_referral' } });
  }

  // 2. Onboarding completion requirement
  if (!s?.profile) {
    throw apiError('REFERRAL_INELIGIBLE', 'Complete onboarding before redeeming a friend referral bonus.', { status: 409, params: { reason: 'onboarding_incomplete' } });
  }

  // 3. One redemption per referred user
  const alreadyRedeemed = await db.prepare('SELECT 1 FROM coaching_referral_redemptions WHERE referred_user_id=?').bind(userId).first();
  if (alreadyRedeemed) {
    throw apiError('REFERRAL_INELIGIBLE', 'This account has already redeemed a referral bonus.', { status: 409, params: { reason: 'already_redeemed' } });
  }

  // 4. Rolling 12-month referrer cap (max 3)
  const cutoffIso = new Date(Date.now() - 365 * 86400000).toISOString();
  const refCountRow = await db.prepare(
    'SELECT COUNT(*) AS n FROM coaching_referral_redemptions WHERE referrer_user_id=? AND granted_at >= ?'
  ).bind(referrerUserId, cutoffIso).first();
  if (Number(refCountRow?.n || 0) >= MAX_REWARDED_REFERRALS_PER_YEAR) {
    throw apiError('REFERRAL_INELIGIBLE', 'Referrer has already reached the annual cap of 3 rewarded referrals.', { status: 409, params: { reason: 'referrer_cap_reached' } });
  }

  // 5. Trial tombstone check (blocks deleted-and-recreated accounts)
  const userRow = await db.prepare('SELECT email FROM coaching_users WHERE user_id=?').bind(userId).first().catch(() => null);
  const oauthRows = (await db.prepare('SELECT provider, subject FROM coaching_oauth_identities WHERE user_id=?').bind(userId).all().catch(() => ({ results: [] })))?.results || [];
  const identityHashes = [];
  if (userRow?.email) identityHashes.push(await sha256Hex(`email:${userRow.email.toLowerCase()}`));
  for (const o of oauthRows) identityHashes.push(await sha256Hex(`oauth:${o.provider}:${o.subject}`));
  for (const h of identityHashes) {
    const tomb = await db.prepare('SELECT 1 FROM coaching_trial_tombstones WHERE identity_hash=?').bind(h).first().catch(() => null);
    if (tomb) {
      throw apiError('REFERRAL_INELIGIBLE', 'Previously registered accounts are not eligible for new-user referral bonuses.', { status: 409, params: { reason: 'tombstone_match' } });
    }
  }

  // 6. Distinct deviceId & distinct OAuth identity check against referrer
  const deviceId = String(body?.deviceId || auth?.deviceId || '').trim().slice(0, 120) || null;
  if (deviceId) {
    const sameDeviceRef = await db.prepare(
      `SELECT 1 FROM coaching_push_tokens WHERE user_id=? AND device_id=?
       UNION SELECT 1 FROM coaching_auth_sessions WHERE user_id=? AND device_id=?
       UNION SELECT 1 FROM coaching_referral_redemptions WHERE device_id=?`
    ).bind(referrerUserId, deviceId, referrerUserId, deviceId, deviceId).first().catch(() => null);
    if (sameDeviceRef) {
      throw apiError('REFERRAL_INELIGIBLE', 'Referral bonuses require a distinct new device.', { status: 409, params: { reason: 'device_reused' } });
    }
  }

  const primaryOauthHash = identityHashes[0] || (await sha256Hex(`user:${userId}`));
  const sameOauth = await db.prepare(
    'SELECT 1 FROM coaching_referral_redemptions WHERE oauth_identity_hash=?'
  ).bind(primaryOauthHash).first().catch(() => null);
  if (sameOauth) {
    throw apiError('REFERRAL_INELIGIBLE', 'This sign-in identity has already been used for a referral bonus.', { status: 409, params: { reason: 'identity_reused' } });
  }

  const [referredExpiresAt, referrerExpiresAt] = await Promise.all([
    grantReferralProBonus(db, userId, REFERRAL_BONUS_DAYS),
    grantReferralProBonus(db, referrerUserId, REFERRAL_BONUS_DAYS)
  ]);

  const id = `refred_${crypto.randomUUID()}`;
  const nowIso = isoNow();
  await db.prepare(
    'INSERT INTO coaching_referral_redemptions(id,code,referrer_user_id,referred_user_id,device_id,oauth_identity_hash,bonus_days,granted_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)'
  ).bind(id, code, referrerUserId, userId, deviceId, primaryOauthHash, REFERRAL_BONUS_DAYS, nowIso, referredExpiresAt).run();

  return {
    redeemed: true,
    code,
    bonusDays: REFERRAL_BONUS_DAYS,
    proExpiresAt: referredExpiresAt,
    referrerBonusGranted: Boolean(referrerExpiresAt),
    grantedAt: nowIso
  };
}
