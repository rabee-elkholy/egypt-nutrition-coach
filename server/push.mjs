// Push Token Registry (FCM HTTP v1 & APNs HTTP/2) & Hourly Cron Notification Sweep
// Respects Quiet Hours (with Ramadan Suhoor exemption) and prunes unregistered device tokens automatically.

import { fetchWithTimeout, getGoogleServiceAccountToken, signEs256Jwt } from './external-crypto.mjs';
import { createApiError, logEvent } from './logger.mjs';
import { isoNow } from './clock.mjs';
import { localTimeParts, validTimeZone, SUPPORTED_LOCALES } from '../coaching-shared.mjs';
import { computeStreakAndEngagement } from './progress-analytics.mjs';

const PUSH_FETCH_TIMEOUT_MS = 6000;

async function buildApnsJwt(env) {
  return signEs256Jwt({
    header: { kid: env.APNS_KEY_ID },
    payload: { iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) },
    privateKeyPem: env.APNS_PRIVATE_KEY
  });
}

async function sendPushMessage(row, trigger, env, authCache) {
  const messages = {
    daily_checkin_reminder: { title: 'Daily Readiness Check-In', body: 'Log your morning sleep and readiness to personalize today\'s plan.' },
    coaching_case_review: { title: 'Coaching Follow-Up Due', body: 'Your scheduled coaching check-in is ready for review.' },
    weekly_checkin_due: { title: 'Weekly Check-In Ready', body: 'Review your 7-day progress and update your weekly plan.' },
    plan_renewal_due: { title: 'New Weekly Plan Ready', body: 'Your 7-day nutrition plan has ended. Tap to generate next week.' },
    trial_ending_day5: { title: 'CuraFit Pro Trial Ending Soon', body: 'Your 7-day free trial ends in 48 hours. Manage anytime in store settings.' },
    ramadan_suhoor_reminder: { title: 'Suhoor Window Reminder', body: 'Complete Suhoor hydration and protein before cutoff time.' }
  };
  const copy = messages[trigger] || messages.daily_checkin_reminder;

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
          data: { trigger, code: trigger.toUpperCase() }
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
        code: trigger.toUpperCase()
      })
    }, PUSH_FETCH_TIMEOUT_MS);
    if (res.status === 410) return { delivered: false, pruneToken: true };
    return { delivered: res.ok, pruneToken: false };
  }

  return { delivered: false, dryRun: true, pruneToken: false };
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
  const locale = body?.locale && SUPPORTED_LOCALES.has(body.locale) ? body.locale : 'en';
  const timezone = body?.timezone && validTimeZone(body.timezone) ? body.timezone : 'Africa/Cairo';
  const appVersion = body?.appVersion ? String(body.appVersion).trim().slice(0, 40) : null;
  const now = isoNow();
  await db.prepare(
    'INSERT OR REPLACE INTO coaching_push_tokens(user_id,device_id,platform,push_token,locale,timezone,app_version,updated_at) VALUES(?,?,?,?,?,?,?,?)'
  ).bind(userId, deviceId, platform, token, locale, timezone, appVersion, now).run();
  return { registered: true, deviceId, platform, updatedAt: now };
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

export async function runScheduledNotifications(env, nowMs = Date.now()) {
  if (!env?.DB) return { checked: 0, queued: 0, delivered: 0, pruned: 0 };
  let rows = [];
  try {
    const res = await env.DB.prepare(
      `SELECT t.user_id, t.device_id, t.platform, t.push_token, t.locale, t.timezone,
              a.body,
              (SELECT expires_at FROM coaching_subscriptions s WHERE s.user_id = t.user_id AND s.status = 'trialing' ORDER BY s.expires_at DESC LIMIT 1) AS trial_expires_at
       FROM coaching_push_tokens t
       LEFT JOIN coaching_accounts a ON a.user_id = t.user_id
       LIMIT 500`
    ).all();
    rows = res?.results || [];
  } catch (err) {
    if (/no such table/i.test(err?.message || '')) return { checked: 0, queued: 0, delivered: 0, pruned: 0 };
    throw err;
  }

  let queued = 0;
  let delivered = 0;
  let pruned = 0;
  const authCache = {};

  for (const row of rows) {
    const tz = row.timezone || 'Africa/Cairo';
    const parts = localTimeParts(nowMs, tz);
    const hhmm = parts.time.slice(0, 5);
    const today = parts.date;
    let account = null;
    try { account = row.body ? JSON.parse(row.body) : null; } catch {}
    const prefs = account?.notificationPreferences || {};
    const channels = Array.isArray(prefs.channels) ? prefs.channels : ['in_app', 'push'];
    const pushAllowed = channels.includes('push') || !prefs.channels;
    if (!pushAllowed) continue;

    const quiet = isWithinQuietHours(hhmm, prefs.quietHoursStart || '22:00', prefs.quietHoursEnd || '08:00');
    const hour = Number(hhmm.slice(0, 2));
    const triggers = [];

    // 1. Ramadan Suhoor reminder (exempt from Quiet Hours when exemptSuhoorFromQuietHours is true)
    if (account?.ramadanMode?.enabled && prefs.ramadanSuhoorReminder === true) {
      const suhoorH = Number((account.ramadanMode.suhoorCutoffTime || '04:20').slice(0, 2));
      const remindH = (suhoorH + 23) % 24;
      if (hour === remindH && (!quiet || prefs.exemptSuhoorFromQuietHours === true)) {
        triggers.push('ramadan_suhoor_reminder');
      }
    }

    if (!quiet) {
      // 2. Daily readiness check-in reminder at 09:00 local
      if (hour === 9 && prefs.dailyReminder !== false) triggers.push('daily_checkin_reminder');
      // 3. Coaching case follow-up due today at 10:00 local
      if (hour === 10 && (account?.coachingCases || []).some(c => c.reviewOn === today && c.status !== 'closed')) {
        triggers.push('coaching_case_review');
      }
      // 4. Weekly check-in due at 10:00 local
      if (hour === 10 && prefs.weeklyReviewReminder !== false && account?.profile) {
        const { engagementState } = computeStreakAndEngagement(account, nowMs);
        if (engagementState.weeklyCheckinDue) triggers.push('weekly_checkin_due');
      }
      // 5. Expired nutrition plan renewal at 11:00 local
      if (hour === 11 && account?.active_plan_id) {
        const activePlan = (account.plans || []).find(p => p.id === account.active_plan_id);
        const endDate = activePlan?.days?.at(-1)?.date;
        if (endDate && endDate < today) triggers.push('plan_renewal_due');
      }
      // 6. Pro Trial Day-5 notice (<= 48h remaining) at 12:00 local
      if (hour === 12 && row.trial_expires_at) {
        const remainingMs = Date.parse(row.trial_expires_at) - nowMs;
        if (remainingMs > 0 && remainingMs <= 48 * 3600000) triggers.push('trial_ending_day5');
      }
    }

    for (const trigger of triggers) {
      queued++;
      try {
        const res = await sendPushMessage(row, trigger, env, authCache);
        if (res.delivered) delivered++;
        if (res.pruneToken) {
          await env.DB.prepare('DELETE FROM coaching_push_tokens WHERE user_id=? AND device_id=?').bind(row.user_id, row.device_id).run();
          pruned++;
        }
        logEvent('info', 'push_notification_processed', {
          userId: row.user_id,
          details: { platform: row.platform, trigger, delivered: res.delivered, dryRun: Boolean(res.dryRun), pruned: res.pruneToken }
        });
      } catch (err) {
        logEvent('warn', 'push_notification_failed', { userId: row.user_id, details: { trigger, message: err?.message } });
      }
    }
  }
  return { checked: rows.length, queued, delivered, pruned };
}
