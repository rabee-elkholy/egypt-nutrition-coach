// Push Token Registry (FCM & APNs) & Hourly Cron Notification Sweep respecting Quiet Hours

import { createApiError, logEvent } from './logger.mjs';
import { isoNow } from './clock.mjs';
import { localTimeParts, validTimeZone, SUPPORTED_LOCALES } from '../coaching-shared.mjs';

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

export function isWithinQuietHours(hhmm, start = '22:00', end = '08:00') {
  if (!hhmm || !start || !end || start === end) return false;
  if (start < end) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end;
}

export async function runScheduledNotifications(env, nowMs = Date.now()) {
  if (!env?.DB) return { checked: 0, queued: 0 };
  let rows = [];
  try {
    const res = await env.DB.prepare(
      'SELECT t.user_id, t.device_id, t.platform, t.push_token, t.locale, t.timezone, a.body FROM coaching_push_tokens t LEFT JOIN coaching_accounts a ON a.user_id = t.user_id LIMIT 500'
    ).all();
    rows = res?.results || [];
  } catch (err) {
    if (/no such table/i.test(err?.message || '')) return { checked: 0, queued: 0 };
    throw err;
  }

  let queued = 0;
  for (const row of rows) {
    const parts = localTimeParts(nowMs, row.timezone || 'Africa/Cairo');
    const hhmm = parts.time.slice(0, 5);
    let account = null;
    try { account = row.body ? JSON.parse(row.body) : null; } catch {}
    const prefs = account?.notificationPreferences || {};
    if (isWithinQuietHours(hhmm, prefs.quietHoursStart || '22:00', prefs.quietHoursEnd || '08:00')) continue;
    const hour = Number(hhmm.slice(0, 2));
    // Trigger morning daily check-in reminder at 09:00 local time if opted in
    if (hour === 9 && prefs.dailyReminder !== false && (prefs.channels || []).includes('push')) {
      queued++;
      logEvent('info', 'push_notification_eligible', {
        userId: row.user_id,
        details: { platform: row.platform, trigger: 'daily_checkin_reminder', configured: Boolean(env?.FCM_PROJECT_ID || env?.APNS_KEY_ID) }
      });
    }
  }
  return { checked: rows.length, queued };
}
