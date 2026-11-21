import { apiError, hasArabicText } from './coaching-error.mjs';

// The old onboarding IDs name body regions; preserve them in drafts and normalize only for policy lookup.
export const SUPPORTED_WORKOUT_INJURIES = Object.freeze(['knee_pain', 'lower_back_pain', 'shoulder_pain', 'wrist_pain', 'ankle_pain', 'neck_pain', 'hip_pain', 'diastasis_recti']);
export const INJURY_ID_ALIASES = Object.freeze({ shoulder_injury: 'shoulder_pain', ankle_injury: 'ankle_pain' });
export function canonicalInjuries(items = []) {
  return [...new Set(items.filter(x => x && x !== 'none').map(x => Object.hasOwn(INJURY_ID_ALIASES, x) ? INJURY_ID_ALIASES[x] : x))];
}
export const MUSCLE_REGIONS = {
  chest: 'الصدر', back: 'الظهر', lower_back: 'أسفل الظهر', shoulders: 'الكتف', biceps: 'البايسبس', triceps: 'الترايسبس', forearms: 'الساعد', abs: 'البطن', glutes: 'المقعدة', quadriceps: 'الأماميات', hamstrings: 'الخلفيات', calves: 'السمانة', hips: 'الحوض', neck: 'الرقبة'
};
export const FOCUS_LABELS = { full_body: 'الجسم كله', upper: 'الجزء العلوي', lower: 'الجزء السفلي', push: 'دفع', pull: 'سحب', legs: 'أرجل', chest: 'صدر', back: 'ظهر', shoulders: 'أكتاف', arms: 'ذراع', core: 'بطن' };
export const SLOTS = { breakfast: 'فطار', lunch: 'غداء', dinner: 'عشاء', snack: 'سناك' };
export const SUPPORTED_TIMEZONES = new Set(['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Muscat', 'Asia/Amman', 'Asia/Beirut', 'Africa/Casablanca', 'Africa/Tunis', 'Africa/Algiers', 'Europe/London', 'UTC']);

function fieldKey(label) {
  return typeof label === 'string' && label.trim() && !hasArabicText(label) ? label.trim() : 'value';
}

export function validTimeZone(tz) {
  if (typeof tz !== 'string' || !tz.trim() || tz.length > 64) return false;
  if (SUPPORTED_TIMEZONES.has(tz)) return true;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date(0)); return true; } catch { return false; }
}
export function localDate(now = Date.now(), timeZone = 'Africa/Cairo') {
  const tz = validTimeZone(timeZone) ? timeZone : 'Africa/Cairo';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}
export function localTimeParts(now = Date.now(), timeZone = 'Africa/Cairo') {
  const tz = validTimeZone(timeZone) ? timeZone : 'Africa/Cairo';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(now));
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const hour = m.hour === '24' ? '00' : m.hour;
  return { date: `${m.year}-${m.month}-${m.day}`, time: `${hour}:${m.minute}:${m.second}`, timeZone: tz };
}
export function dateOffset(date, offset) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T12:00:00Z')) && new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date;
}

export function number(value, min, max, label) {
  const field = fieldKey(label);
  if (value == null || typeof value === 'boolean' || !['number', 'string'].includes(typeof value) || (typeof value === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) {
    const message = `${field} must be between ${min} and ${max}.`;
    throw apiError('NUMBER_OUT_OF_RANGE', message, { status: 400, params: { field, min, max }, fieldErrors: [{ field, code: 'NUMBER_OUT_OF_RANGE', message }] });
  }
  return Number(value);
}

export function integer(value, min, max, label) {
  const field = fieldKey(label);
  const n = number(value, min, max, field);
  if (!Number.isSafeInteger(n)) {
    const message = `${field} must be a whole integer.`;
    throw apiError('INVALID_INTEGER', message, { status: 400, params: { field, min, max }, fieldErrors: [{ field, code: 'INVALID_INTEGER', message }] });
  }
  return n;
}

export function boolean(value, label, fallback) {
  const field = fieldKey(label);
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') {
    const message = `${field} must be a boolean true or false.`;
    throw apiError('INVALID_BOOLEAN', message, { status: 400, params: { field }, fieldErrors: [{ field, code: 'INVALID_BOOLEAN', message }] });
  }
  return value;
}

export function stringList(value, label, max = 100) {
  const field = fieldKey(label);
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== 'string' || !v || v.length > 120)) {
    const message = `${field} must be a valid list of non-empty strings.`;
    throw apiError('INVALID_STRING_LIST', message, { status: 400, params: { field }, fieldErrors: [{ field, code: 'INVALID_STRING_LIST', message }] });
  }
  return [...new Set(value)];
}

export function plainRecord(value, label) {
  const field = fieldKey(label);
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const message = `${field} must be a valid key-value object.`;
    throw apiError('INVALID_RECORD', message, { status: 400, params: { field }, fieldErrors: [{ field, code: 'INVALID_RECORD', message }] });
  }
  return value;
}

export function effectiveSets(s, exercise, date = localDate(Date.now(), s?.profile?.timezone || 'Africa/Cairo'), now = Date.now()) {
  const tz = s?.profile?.timezone || 'Africa/Cairo';
  const a = s.sessionAdjustment;
  const factor = a && date === localDate(now, tz) && Date.parse(a.expiresAt) > now && (!a.planId || a.planId === s.workoutPlan?.id) ? a.setFactor : 1;
  const rounded = Math.round(exercise.sets * factor);
  return Math.max(1, factor < 1 ? Math.min(exercise.sets - 1, rounded) : rounded);
}

export function dateForLog(date, now = Date.now(), timeZone = 'Africa/Cairo') {
  const todayLocal = localDate(now, timeZone);
  if (!validDate(date)) {
    throw apiError('INVALID_DATE', 'Invalid calendar date format; expected YYYY-MM-DD.', { status: 400, params: { field: 'date' } });
  }
  if (date > todayLocal) {
    throw apiError('DATE_IN_FUTURE', 'Logging date cannot be in the future.', { status: 400, params: { date } });
  }
  if (date < dateOffset(todayLocal, -90)) {
    throw apiError('DATE_TOO_OLD', 'Backdating logs is limited to the last 90 days.', { status: 400, params: { maxDays: 90 } });
  }
  return date;
}

export const needsHealthConfirmation = s => s.onboarding?.serviceTrack === 'workouts_only' && s.onboarding?.workoutPrefs?.healthConfirmed !== true;

export function normalizeWeekdayDraft(draft) {
  const basis = draft.weekdayConvention ?? 'js_sunday_0';
  if (!['js_sunday_0', 'saturday_0'].includes(basis)) {
    throw apiError('INVALID_WEEKDAY_CONVENTION', 'weekdayConvention must be either js_sunday_0 or saturday_0.', { status: 400 });
  }
  const convert = value => {
    const n = integer(value, 0, 6, 'weekday');
    return basis === 'saturday_0' ? (n + 6) % 7 : n;
  };
  const result = { ...draft, weekdayConvention: 'js_sunday_0' };
  for (const key of ['selectedWorkoutDays', 'externalTrainingDays']) {
    if (draft[key] != null) {
      if (!Array.isArray(draft[key]) || draft[key].length > 6) {
        throw apiError('INVALID_WORKOUT_DAYS', 'Selected training days list is invalid (max 6 days).', { status: 400 });
      }
      result[key] = draft[key].map(convert);
    }
  }
  if (draft.dayLocations != null) {
    const value = plainRecord(draft.dayLocations, 'dayLocations');
    if (Object.keys(value).some(k => !/^[0-6]$/.test(k))) {
      throw apiError('INVALID_DAY_LOCATIONS', 'dayLocations keys must be weekday indices 0..6 with valid location values.', { status: 400 });
    }
    result.dayLocations = Object.fromEntries(Object.entries(value).map(([day, place]) => [convert(day), place]));
  }
  return result;
}

export function onboardingState(state) {
  if (state.profile?.weekdayConvention !== 'js_sunday_0') return state;
  const wp = state.onboarding?.workoutPrefs || {}, convert = d => (Number(d) + 1) % 7;
  return { ...state, profile: { ...state.profile, weekdayConvention: 'saturday_0', workoutDays: state.profile.workoutDays?.map(convert) }, onboarding: { ...state.onboarding, workoutPrefs: { ...wp, weekdayConvention: 'saturday_0', selectedWorkoutDays: wp.selectedWorkoutDays?.map(convert), dayLocations: wp.dayLocations ? Object.fromEntries(Object.entries(wp.dayLocations).map(([d, p]) => [convert(d), p])) : null } } };
}

export const needsScheduleConfirmation = s => !!s.workoutPlan && s.profile?.weekdayConvention !== 'js_sunday_0';
