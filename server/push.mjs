// Push Token Registry (FCM HTTP v1 & APNs HTTP/2) & Hourly Cron Notification Sweep
// Bilingual AR/EN lock-screen copy personalized with user first name, respects Quiet Hours
// (with Ramadan Suhoor exemption), strictly suppresses food/hydration alerts during IF/Ramadan
// fasting hours, supports 30-minute pre-workout reminders, and prunes unregistered device tokens.

import { fetchWithTimeout, getGoogleServiceAccountToken, signEs256Jwt } from './external-crypto.mjs';
import { createApiError, logEvent } from './logger.mjs';
import { isoNow } from './clock.mjs';
import { localTimeParts, validTimeZone, normalizeLocale } from '../coaching-shared.mjs';
import { computeStreakAndEngagement } from './progress-analytics.mjs';

const PUSH_FETCH_TIMEOUT_MS = 6000;

function extractFirstName(rawName) {
  const cleaned = String(rawName || '').trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/)[0].slice(0, 32);
}

function hhmmToMinutes(hhmm) {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function minutesToHhmm(totalMins) {
  const norm = ((totalMins % 1440) + 1440) % 1440;
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
}

export function isTimeInSpan(hhmm, start, end) {
  const cur = hhmmToMinutes(hhmm);
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (cur == null || s == null || e == null || s === e) return false;
  if (s < e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

export function isFastingFoodHydrationSuppressed(account, hhmm, today) {
  if (!account || !hhmm) return false;
  const ramadanActive = Boolean(
    account.ramadanMode?.enabled &&
    !(account.ramadanMode.endDate && today && today > account.ramadanMode.endDate)
  );
  if (ramadanActive) {
    const suhoor = account.ramadanMode.suhoorCutoffTime || '04:20';
    const iftar = account.ramadanMode.iftarTime || '18:05';
    // Suppress food & hydration reminders throughout Ramadan daylight fasting hours
    if (isTimeInSpan(hhmm, suhoor, iftar)) return true;
  }
  const fs = account.fastingState || {};
  if (fs.phase === 'fasting') return true;
  const isIf = account.preferences?.diet === 'intermittent_fasting' || (typeof fs.mode === 'string' && fs.mode.startsWith('if_'));
  if (isIf && fs.windowStart && fs.windowEnd && !isTimeInSpan(hhmm, fs.windowStart, fs.windowEnd)) {
    return true;
  }
  return false;
}

export function formatPushNotification(trigger, { locale = 'en', userName = '', params = {} } = {}) {
  const lang = normalizeLocale(locale, 'en') || 'en';
  const firstName = extractFirstName(userName);
  const arGreeting = firstName ? `${firstName}، ` : '';
  const enGreeting = firstName ? `${firstName}, ` : '';
  const minsBefore = Number(params?.minutesBefore || 30);
  const senderFirstName = extractFirstName(params?.senderFirstName || params?.senderName || '');
  const fastingActive = params?.fastingActive === true;

  const messages = {
    daily_checkin_reminder: {
      en: {
        title: 'CuraFit Specialist Team Check-In',
        body: `${enGreeting}share your morning sleep and readiness so your specialists can calibrate today's plan.`
      },
      ar: {
        title: 'متابعة الصباح من فريق مختصي CuraFit',
        body: `${arGreeting}شاركنا نومك وجهوزيتك اليوم ليضبط لك مختصو الفريق خطتك بدقة.`
      }
    },
    pre_workout_reminder: {
      en: {
        title: `Workout Starting in ${minsBefore} Minutes`,
        body: `${enGreeting}your scheduled training session starts in ${minsBefore} minutes. Warm up gradually and focus on clean form.`
      },
      ar: {
        title: `تمرينك بعد ${minsBefore} دقيقة`,
        body: `${arGreeting}حصتك التدريبية تبدأ خلال ${minsBefore} دقيقة. ابدأ بالإحماء التدريجي وركّز على جودة الأداء.`
      }
    },
    meal_reminder: {
      en: {
        title: 'Meal Window Check-In',
        body: `${enGreeting}your planned meal is ready in your eating window. Log what you eat to keep your nutrition specialist updated.`
      },
      ar: {
        title: 'تذكير وجبتك المخططة',
        body: `${arGreeting}حان وقت وجبتك ضمن نافذة الأكل. سجّل ما تتناوله لتبقى متابعتك الغذائية دقيقة.`
      }
    },
    hydration_reminder: {
      en: {
        title: 'Hydration Check-In',
        body: `${enGreeting}take a calm glass of water and stay steady toward today's hydration target.`
      },
      ar: {
        title: 'تذكير شرب الماء',
        body: `${arGreeting}اشرب كوب ماء بهدوء ووزّع احتياجك اليومي بانتظام.`
      }
    },
    coaching_case_review: {
      en: {
        title: 'Your Follow-Up Specialist Checked In',
        body: `${enGreeting}your agreed follow-up step is ready for review whenever you have a minute.`
      },
      ar: {
        title: 'مراجعة خطوة المتابعة مع أخصائيك',
        body: `${arGreeting}خطوة المتابعة التي اتفقنا عليها جاهزة لمراجعتك في أي وقت مناسب لك.`
      }
    },
    weekly_checkin_due: {
      en: {
        title: 'Weekly Specialist Review Ready',
        body: `${enGreeting}review your 7-day progress with the CuraFit Specialist Team and calibrate next week.`
      },
      ar: {
        title: 'مراجعتك الأسبوعية جاهزة',
        body: `${arGreeting}راجع تقدمك خلال 7 أيام مع فريق مختصي CuraFit لضبط خطة الأسبوع القادم.`
      }
    },
    plan_renewal_due: {
      en: {
        title: 'Next Week\'s Plan Awaits',
        body: `${enGreeting}your 7-day nutrition plan is complete. Tap so your nutrition specialist can prepare next week.`
      },
      ar: {
        title: 'خطة الأسبوع الجديد بانتظارك',
        body: `${arGreeting}انتهى أسبوع خطتك الغذائية بنجاح. افتح التطبيق ليجهّز أخصائي التغذية أسبوعك القادم.`
      }
    },
    trial_ending_day5: {
      en: {
        title: 'CuraFit Pro Trial Ending Soon',
        body: `${enGreeting}your 7-day free trial ends in 48 hours. Manage anytime in store settings.`
      },
      ar: {
        title: 'تقترب نهاية تجربة CuraFit Pro',
        body: `${arGreeting}تنتهي تجربتك المجانية خلال 48 ساعة. يمكنك إدارة الاشتراك في أي وقت من إعدادات المتجر.`
      }
    },
    ramadan_suhoor_reminder: {
      en: {
        title: 'Suhoor Hydration & Protein Reminder',
        body: `${enGreeting}your CuraFit Specialist Team reminds you to pace water and protein before Suhoor cutoff.`
      },
      ar: {
        title: 'تذكير السحور والماء قبل الإمساك',
        body: `${arGreeting}فريق مختصي CuraFit يذكّرك بتوزيع الماء والبروتين بهدوء قبل موعد الإمساك.`
      }
    },
    streak_saver_evening: {
      en: {
        title: 'Keep Your Gentle Streak Alive',
        body: fastingActive
          ? `${enGreeting}a quick 10-second readiness check-in or calm mobility log keeps your gentle streak going tonight.`
          : `${enGreeting}a quick check-in, meal, or water log tonight keeps your gentle streak moving smoothly without pressure.`
      },
      ar: {
        title: 'حافظ على استمراريتك الهادئة',
        body: fastingActive
          ? `${arGreeting}تسجيل سريع لجهوزيتك أو متابعتك اليومية يحافظ على سلسلتك الهادئة الليلة دون أي ضغط.`
          : `${arGreeting}تسجيل سريع لوجبة أو كوب ماء أو متابعتك اليومية يحافظ على سلسلتك الهادئة الليلة.`
      }
    },
    friend_challenge_cheer: {
      en: {
        title: 'Challenge Cheer Received',
        body: senderFirstName
          ? `${enGreeting}${senderFirstName} sent you a cheer in your CuraFit challenge!`
          : `${enGreeting}a friend sent you a cheer in your CuraFit challenge!`
      },
      ar: {
        title: 'وصلك تشجيع في التحدي',
        body: senderFirstName
          ? `${arGreeting}أرسل لك ${senderFirstName} تحية تشجيع في تحدي CuraFit!`
          : `${arGreeting}أرسل لك صديقك تحية تشجيع في تحدي CuraFit!`
      }
    }
  };
  const entry = messages[trigger] || messages.daily_checkin_reminder;
  return { ...(entry[lang] || entry.en), locale: lang };
}

function resolveScheduledWorkoutTimeHhmm(account, today) {
  const prefs = account?.notificationPreferences || {};
  const explicit = prefs.preferredWorkoutTime || account?.onboarding?.workoutPrefs?.preferredWorkoutTime;
  if (explicit && hhmmToMinutes(explicit) != null) return explicit;
  const ramadanActive = Boolean(
    account?.ramadanMode?.enabled &&
    !(account.ramadanMode.endDate && today > account.ramadanMode.endDate)
  );
  if (ramadanActive) {
    const iftarMins = hhmmToMinutes(account.ramadanMode.iftarTime || '18:05') ?? (18 * 60 + 5);
    const timing = account.ramadanMode.workoutTiming || 'post_iftar';
    if (timing === 'pre_iftar') return minutesToHhmm(iftarMins - 60);
    if (timing === 'post_taraweeh') return '21:30';
    return minutesToHhmm(iftarMins + 90);
  }
  return '18:00';
}

function hasWorkoutScheduledToday(account, today) {
  const wp = account?.workoutPlan;
  if (!wp?.days?.length) return false;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const overrides = (account.scheduleOverrides || []).filter(o => o.planId === wp.id);
  const movedIn = overrides.some(o => o.toDate === today);
  if (movedIn) return true;
  return wp.days.some(d => d.dayIndex === weekday && !overrides.some(o => o.dayIndex === d.dayIndex && o.fromDate === today));
}

async function buildApnsJwt(env) {
  return signEs256Jwt({
    header: { kid: env.APNS_KEY_ID },
    payload: { iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) },
    privateKeyPem: env.APNS_PRIVATE_KEY
  });
}

async function sendPushMessage(row, trigger, env, authCache, extraParams = {}, account = null) {
  const copy = formatPushNotification(trigger, {
    locale: row.locale || account?.profile?.locale || 'en',
    userName: account?.profile?.name || '',
    params: extraParams
  });
  const noticeParams = { trigger, date: row._localDate || null, locale: copy.locale, ...extraParams };

  if (row.platform === 'android' && env?.FCM_SERVICE_ACCOUNT_JSON) {
    if (!authCache.fcm) {
      authCache.fcm = await getGoogleServiceAccountToken(
        env.FCM_SERVICE_ACCOUNT_JSON,
        'https://www.googleapis.com/auth/firebase.messaging',
        PUSH_FETCH_TIMEOUT_MS
      );
    }
    const projectId = env.FCM_PROJECT_ID || authCache.fcm.projectId;
    const res = await fetchWithTimeout(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authCache.fcm.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: row.push_token,
          notification: { title: copy.title, body: copy.body },
          data: { trigger, code: trigger.toUpperCase(), locale: copy.locale, params: JSON.stringify(noticeParams) }
        }
      })
    }, PUSH_FETCH_TIMEOUT_MS);
    if (res.status === 404 || res.status === 410) return { delivered: false, pruneToken: true };
    return { delivered: res.ok, pruneToken: false };
  }

  if (row.platform === 'ios' && env?.APNS_KEY_ID && env?.APNS_TEAM_ID && env?.APNS_PRIVATE_KEY && env?.APNS_BUNDLE_ID) {
    if (!authCache.apnsJwt) authCache.apnsJwt = await buildApnsJwt(env);
    const host = env.APNS_USE_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    const res = await fetchWithTimeout(`${host}/3/device/${encodeURIComponent(row.push_token)}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${authCache.apnsJwt}`,
        'apns-topic': env.APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        aps: { alert: { title: copy.title, body: copy.body }, sound: 'default' },
        trigger,
        code: trigger.toUpperCase(),
        locale: copy.locale,
        params: noticeParams
      })
    }, PUSH_FETCH_TIMEOUT_MS);
    if (res.status === 410) return { delivered: false, pruneToken: true };
    return { delivered: res.ok, pruneToken: false };
  }

  return { delivered: false, dryRun: true, pruneToken: false, preview: copy };
}

export async function registerPushToken(db, userId, body = {}) {
  const deviceId = String(body?.deviceId || '').trim().slice(0, 120);
  const platform = String(body?.platform || '').trim().toLowerCase();
  const token = String(body?.token || '').trim().slice(0, 512);
  if (!deviceId || !['android', 'ios'].includes(platform) || token.length < 10) {
    throw createApiError('Push token registration requires deviceId, platform (android or ios), and token.', 400, {
      code: 'INVALID_PUSH_TOKEN'
    });
  }
  const locale = normalizeLocale(body?.locale, 'en') || 'en';
  const timezone = body?.timezone && validTimeZone(body.timezone) ? body.timezone : 'Africa/Cairo';
  const appVersion = body?.appVersion ? String(body.appVersion).trim().slice(0, 40) : null;
  const now = isoNow();
  await db.prepare(
    'INSERT OR REPLACE INTO coaching_push_tokens(user_id,device_id,platform,push_token,locale,timezone,app_version,updated_at) VALUES(?,?,?,?,?,?,?,?)'
  ).bind(userId, deviceId, platform, token, locale, timezone, appVersion, now).run();
  return { registered: true, deviceId, platform, locale, updatedAt: now };
}

export async function deletePushToken(db, userId, body = {}) {
  const deviceId = String(body?.deviceId || '').trim().slice(0, 120);
  if (!deviceId) {
    throw createApiError('Push token deletion requires deviceId.', 400, { code: 'INVALID_PUSH_TOKEN' });
  }
  await db.prepare('DELETE FROM coaching_push_tokens WHERE user_id=? AND device_id=?').bind(userId, deviceId).run();
  return { removed: true, deviceId };
}

export async function deleteAllPushTokens(db, userId) {
  try {
    await db.prepare('DELETE FROM coaching_push_tokens WHERE user_id=?').bind(userId).run();
  } catch (e) {
    if (!/no such table/i.test(e?.message || '')) throw e;
  }
}

export function isWithinQuietHours(hhmm, start = '22:00', end = '08:00') {
  if (!hhmm || !start || !end || start === end) return false;
  if (start < end) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end;
}

async function alreadyNoticed(db, userId, quotaKey, windowKey) {
  try {
    const row = await db.prepare('SELECT used_count FROM coaching_usage_quotas WHERE user_id=? AND quota_key=? AND window_key=?')
      .bind(userId, quotaKey, windowKey).first();
    return Number(row?.used_count || 0) > 0;
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return false;
    return false;
  }
}

async function markNoticed(db, userId, quotaKey, windowKey) {
  try {
    await db.prepare(
      'INSERT OR REPLACE INTO coaching_usage_quotas(user_id,quota_key,window_key,used_count,updated_at) VALUES(?,?,?,1,?)'
    ).bind(userId, quotaKey, windowKey, isoNow()).run();
  } catch {}
}

export async function runScheduledNotifications(env, nowMs = Date.now()) {
  if (!env?.DB) return { checked: 0, queued: 0, delivered: 0, pruned: 0 };
  let checked = 0;
  let queued = 0;
  let delivered = 0;
  let pruned = 0;
  const authCache = {};
  let lastRowId = 0;
  const BATCH_SIZE = 200;

  while (true) {
    let rows = [];
    try {
      const res = await env.DB.prepare(
        `SELECT t.rowid AS _rid, t.user_id, t.device_id, t.platform, t.push_token, t.locale, t.timezone,
                a.body,
                (SELECT expires_at FROM coaching_subscriptions s WHERE s.user_id = t.user_id AND s.status = 'trialing' ORDER BY s.expires_at DESC LIMIT 1) AS trial_expires_at
         FROM coaching_push_tokens t
         LEFT JOIN coaching_accounts a ON a.user_id = t.user_id
         WHERE t.rowid > ?
         ORDER BY t.rowid ASC
         LIMIT ?`
      ).bind(lastRowId, BATCH_SIZE).all();
      rows = res?.results || [];
    } catch (err) {
      if (/no such table/i.test(err?.message || '')) break;
      throw err;
    }
    if (!rows.length) break;
    lastRowId = Number(rows[rows.length - 1]._rid || lastRowId);
    checked += rows.length;

    for (const row of rows) {
      const tz = row.timezone || 'Africa/Cairo';
      const parts = localTimeParts(nowMs, tz);
      const hhmm = parts.time.slice(0, 5);
      const today = parts.date;
      row._localDate = today;
      let account = null;
      try { account = row.body ? JSON.parse(row.body) : null; } catch {}
      const prefs = account?.notificationPreferences || {};
      const channels = Array.isArray(prefs.channels) ? prefs.channels : ['in_app', 'push'];
      const pushAllowed = channels.includes('push') || !prefs.channels || prefs.channelsConfigured !== true;
      if (!pushAllowed) continue;

      const quiet = isWithinQuietHours(hhmm, prefs.quietHoursStart || '22:00', prefs.quietHoursEnd || '08:00');
      const fastingSuppressed = isFastingFoodHydrationSuppressed(account, hhmm, today);
      const hour = Number(hhmm.slice(0, 2));
      const nowMins = hhmmToMinutes(hhmm);
      const triggers = [];
      const ramadanActive = Boolean(
        account?.ramadanMode?.enabled &&
        !(account.ramadanMode.endDate && today > account.ramadanMode.endDate)
      );

      // 1. Ramadan Suhoor reminder (exempt from Quiet Hours when exemptSuhoorFromQuietHours is true; stops after endDate)
      if (ramadanActive && prefs.ramadanSuhoorReminder === true) {
        const suhoorH = Number((account.ramadanMode.suhoorCutoffTime || '04:20').slice(0, 2));
        const remindH = (suhoorH + 23) % 24;
        if (hour === remindH && (!quiet || prefs.exemptSuhoorFromQuietHours === true)) {
          triggers.push({ trigger: 'ramadan_suhoor_reminder' });
        }
      }

      if (!quiet) {
        const coachingPaused = Boolean(
          account?.coachingPause?.active &&
          (!account.coachingPause.pauseUntil || today <= account.coachingPause.pauseUntil)
        );
        // 2. Daily readiness check-in reminder at 09:00 local
        if (!coachingPaused && hour === 9 && prefs.dailyReminder !== false) triggers.push({ trigger: 'daily_checkin_reminder' });

        // 3. Pre-workout reminder (default 30 min before scheduled workout time)
        if (!coachingPaused && prefs.workoutReminder !== false && hasWorkoutScheduledToday(account, today)) {
          const minsBefore = Number(prefs.preferredWorkoutReminderMinutesBefore || 30);
          const workoutHhmm = resolveScheduledWorkoutTimeHhmm(account, today);
          const workoutMins = hhmmToMinutes(workoutHhmm);
          if (workoutMins != null && nowMins != null) {
            const reminderMins = ((workoutMins - minsBefore) + 1440) % 1440;
            const reminderHour = Math.floor(reminderMins / 60);
            const diffToWorkout = workoutMins - nowMins;
            const inWindow = (diffToWorkout >= 0 && diffToWorkout <= minsBefore + 30) || hour === reminderHour;
            if (inWindow && !(await alreadyNoticed(env.DB, row.user_id, 'push_notice_pre_workout', today))) {
              triggers.push({
                trigger: 'pre_workout_reminder',
                extraParams: { minutesBefore: minsBefore, scheduledTime: workoutHhmm },
                dedupe: ['push_notice_pre_workout', today]
              });
            }
          }
        }

        // 4. Optional meal & hydration reminders — strictly suppressed during active IF fasting or Ramadan daylight hours
        if (!coachingPaused && !fastingSuppressed) {
          if (prefs.mealReminders === true && (hour === 13 || hour === 19)) {
            const mWin = `${today}:${hour}`;
            if (!(await alreadyNoticed(env.DB, row.user_id, 'push_notice_meal', mWin))) {
              triggers.push({ trigger: 'meal_reminder', dedupe: ['push_notice_meal', mWin] });
            }
          }
          if (prefs.waterReminder === true && hour === 15) {
            if (!(await alreadyNoticed(env.DB, row.user_id, 'push_notice_hydration', today))) {
              triggers.push({ trigger: 'hydration_reminder', dedupe: ['push_notice_hydration', today] });
            }
          }
        }

        // 5. Coaching case follow-up due today at 10:00 local (reads normalized coaching_cases table + fallback)
        if (!coachingPaused && hour === 10) {
          let cases = Array.isArray(account?.coachingCases) ? account.coachingCases : [];
          if (!cases.length) {
            try {
              const caseRows = await env.DB.prepare('SELECT body FROM coaching_cases WHERE user_id=?').bind(row.user_id).all();
              cases = (caseRows?.results || []).map(r => { try { return JSON.parse(r.body); } catch { return null; } }).filter(Boolean);
            } catch {}
          }
          const dueCase = cases.find(c => c.reviewOn === today && c.status === 'accepted');
          if (dueCase) {
            triggers.push({ trigger: 'coaching_case_review', extraParams: dueCase.id ? { caseId: dueCase.id } : {} });
          }
        }
        // 6. Weekly check-in due at 10:00 local
        if (!coachingPaused && hour === 10 && prefs.weeklyReviewReminder !== false && account?.profile) {
          const { engagementState } = computeStreakAndEngagement(account, nowMs);
          if (engagementState.weeklyCheckinDue) triggers.push({ trigger: 'weekly_checkin_due' });
        }
        // 7. Expired nutrition plan renewal at 11:00 local (checks planRefs since plans[] is stripped in D1 body)
        if (!coachingPaused && hour === 11 && account?.active_plan_id) {
          const activePlan = (account.plans || []).find(p => p.id === account.active_plan_id);
          const activeRef = (account.planRefs || []).find(p => p.id === account.active_plan_id);
          const endDate = activePlan?.days?.at(-1)?.date || activeRef?.end_date;
          if (endDate && endDate < today) {
            const win = `${account.active_plan_id}:${endDate}`;
            if (!(await alreadyNoticed(env.DB, row.user_id, 'push_notice_plan_renewal', win))) {
              triggers.push({ trigger: 'plan_renewal_due', dedupe: ['push_notice_plan_renewal', win] });
            }
          }
        }
        // 8. Pro Trial Day-5 notice (<= 48h remaining) at 12:00 local (deduped once per trial cycle)
        if (hour === 12 && row.trial_expires_at) {
          const remainingMs = Date.parse(row.trial_expires_at) - nowMs;
          if (remainingMs > 0 && remainingMs <= 48 * 3600000) {
            const win = String(row.trial_expires_at);
            if (!(await alreadyNoticed(env.DB, row.user_id, 'push_notice_trial_day5', win))) {
              triggers.push({ trigger: 'trial_ending_day5', dedupe: ['push_notice_trial_day5', win] });
            }
          }
        }
        // 9. Evening Streak Saver (20:30 local or 60 min before Quiet Hours, only when streak >= 2 and today not yet qualified)
        if (!coachingPaused && prefs.streakSaverReminder !== false && account?.profile) {
          const quietStartMins = hhmmToMinutes(prefs.quietHoursStart || '22:00') ?? (22 * 60);
          const targetSaverMins = Math.min(20 * 60 + 30, ((quietStartMins - 60) + 1440) % 1440);
          const saverHour = Math.floor(targetSaverMins / 60);
          if (hour === saverHour) {
            const { streakSummary } = computeStreakAndEngagement(account, nowMs);
            if (!streakSummary.todayQualified && streakSummary.currentDays >= 2) {
              if (!(await alreadyNoticed(env.DB, row.user_id, 'push_notice_streak_saver', today))) {
                triggers.push({
                  trigger: 'streak_saver_evening',
                  extraParams: {
                    fastingActive: fastingSuppressed,
                    streakDays: streakSummary.currentDays,
                    deepLink: 'curafit://today'
                  },
                  dedupe: ['push_notice_streak_saver', today]
                });
              }
            }
          }
        }
      }

      for (const item of triggers) {
        queued++;
        try {
          const res = await sendPushMessage(row, item.trigger, env, authCache, item.extraParams || {}, account);
          if (item.dedupe) await markNoticed(env.DB, row.user_id, item.dedupe[0], item.dedupe[1]);
          if (res.delivered) delivered++;
          if (res.pruneToken) {
            await env.DB.prepare('DELETE FROM coaching_push_tokens WHERE user_id=? AND device_id=?').bind(row.user_id, row.device_id).run();
            pruned++;
          }
          logEvent('info', 'push_notification_processed', {
            trigger: item.trigger,
            platform: row.platform,
            delivered: res.delivered,
            dryRun: Boolean(res.dryRun),
            pruned: Boolean(res.pruneToken)
          });
        } catch (err) {
          logEvent('warn', 'push_notification_failed', { trigger: item.trigger, platform: row.platform, error: err?.message || 'push_error' });
        }
      }
    }
  }
  return { checked, queued, delivered, pruned };
}

export async function sendFriendChallengeCheerPush(
  env,
  targetUserId,
  { senderFirstName = '', challengeId = null, reactionCode = 'cheer', deepLink = null } = {},
  nowMs = Date.now()
) {
  if (!env?.DB || !targetUserId) return { queued: 0, delivered: 0, suppressed: true };
  let rows = [];
  try {
    const res = await env.DB.prepare(
      `SELECT t.user_id, t.device_id, t.platform, t.push_token, t.locale, t.timezone, a.body
       FROM coaching_push_tokens t
       LEFT JOIN coaching_accounts a ON a.user_id = t.user_id
       WHERE t.user_id = ?`
    ).bind(targetUserId).all();
    rows = res?.results || [];
  } catch {
    return { queued: 0, delivered: 0, suppressed: true };
  }
  if (!rows.length) return { queued: 0, delivered: 0, suppressed: false };

  const authCache = {};
  let queued = 0;
  let delivered = 0;
  let suppressed = false;

  for (const row of rows) {
    const tz = row.timezone || 'Africa/Cairo';
    const parts = localTimeParts(nowMs, tz);
    const hhmm = parts.time.slice(0, 5);
    const today = parts.date;
    row._localDate = today;
    let account = null;
    try { account = row.body ? JSON.parse(row.body) : null; } catch {}
    const prefs = account?.notificationPreferences || {};
    const channels = Array.isArray(prefs.channels) ? prefs.channels : ['in_app', 'push'];
    const pushAllowed = channels.includes('push') || !prefs.channels || prefs.channelsConfigured !== true;
    if (!pushAllowed || prefs.challengeNotifications === false) {
      suppressed = true;
      continue;
    }
    const quiet = isWithinQuietHours(hhmm, prefs.quietHoursStart || '22:00', prefs.quietHoursEnd || '08:00');
    const ramadanActive = Boolean(
      account?.ramadanMode?.enabled &&
      !(account.ramadanMode.endDate && today > account.ramadanMode.endDate)
    );
    const ramadanDaylight = ramadanActive && isTimeInSpan(hhmm, account.ramadanMode.suhoorCutoffTime || '04:20', account.ramadanMode.iftarTime || '18:05');
    if (quiet || ramadanDaylight) {
      suppressed = true;
      continue;
    }
    queued++;
    try {
      const res = await sendPushMessage(
        row,
        'friend_challenge_cheer',
        env,
        authCache,
        {
          senderFirstName: extractFirstName(senderFirstName),
          reactionCode: String(reactionCode || 'cheer').slice(0, 40),
          ...(challengeId ? { challengeId } : {}),
          deepLink: deepLink || (challengeId ? `curafit://challenges/friends/${challengeId}` : 'curafit://challenges')
        },
        account
      );
      if (res.delivered) delivered++;
      if (res.pruneToken) {
        await env.DB.prepare('DELETE FROM coaching_push_tokens WHERE user_id=? AND device_id=?').bind(row.user_id, row.device_id).run();
      }
    } catch (err) {
      logEvent('warn', 'push_notification_failed', { trigger: 'friend_challenge_cheer', platform: row.platform, error: err?.message || 'push_error' });
    }
  }
  return { queued, delivered, suppressed };
}
