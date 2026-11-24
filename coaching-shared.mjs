import { apiError, hasArabicText } from './coaching-error.mjs';

// Canonical workout injury IDs; short mobile keys normalize cleanly for policy lookup.
export const SUPPORTED_WORKOUT_INJURIES = Object.freeze([
  'knee_pain', 'lower_back_pain', 'shoulder_pain', 'wrist_pain',
  'ankle_pain', 'neck_pain', 'hip_pain', 'elbow_pain', 'diastasis_recti'
]);
export const INJURY_ID_ALIASES = Object.freeze({
  shoulder_injury: 'shoulder_pain',
  ankle_injury: 'ankle_pain',
  knee: 'knee_pain',
  lower_back: 'lower_back_pain',
  shoulder: 'shoulder_pain',
  wrist: 'wrist_pain',
  ankle: 'ankle_pain',
  neck: 'neck_pain',
  hip: 'hip_pain',
  elbow: 'elbow_pain'
});
export function canonicalInjuries(items = []) {
  return [...new Set(
    items
      .filter(x => x && x !== 'none')
      .map(x => {
        const key = String(x).trim().toLowerCase();
        return Object.hasOwn(INJURY_ID_ALIASES, key) ? INJURY_ID_ALIASES[key] : key;
      })
  )];
}

export const MUSCLE_REGIONS = {
  chest: 'Chest', back: 'Back', lower_back: 'Lower Back', shoulders: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs',
  glutes: 'Glutes', quadriceps: 'Quadriceps', hamstrings: 'Hamstrings',
  calves: 'Calves', hips: 'Hips', neck: 'Neck'
};
export const FOCUS_LABELS = {
  full_body: 'Full Body', upper: 'Upper Body', lower: 'Lower Body',
  push: 'Push', pull: 'Pull', legs: 'Legs', chest: 'Chest',
  back: 'Back', shoulders: 'Shoulders', arms: 'Arms', core: 'Core'
};
export const SLOTS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
export const SUPPORTED_TIMEZONES = new Set([
  'Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar',
  'Asia/Bahrain', 'Asia/Muscat', 'Asia/Amman', 'Asia/Beirut',
  'Africa/Casablanca', 'Africa/Tunis', 'Africa/Algiers', 'Europe/London', 'UTC'
]);
export const SUPPORTED_LOCALES = new Set([
  'en', 'ar', 'ar-EG', 'ar-SA', 'ar-AE', 'ar-KW', 'ar-QA', 'ar-BH', 'ar-OM', 'ar-JO', 'ar-LB', 'ar-MA', 'ar-TN', 'ar-DZ'
]);
export const SUPPORTED_REGIONS = Object.freeze(['egypt', 'gulf', 'levant', 'maghreb']);
export const COUNTRY_TO_REGION = Object.freeze({
  EG: 'egypt',
  SA: 'gulf', AE: 'gulf', KW: 'gulf', QA: 'gulf', BH: 'gulf', OM: 'gulf', YE: 'gulf',
  JO: 'levant', LB: 'levant', SY: 'levant', PS: 'levant', IQ: 'levant',
  MA: 'maghreb', DZ: 'maghreb', TN: 'maghreb', LY: 'maghreb', MR: 'maghreb'
});
export function countryToRegion(countryCode) {
  const code = typeof countryCode === 'string' ? countryCode.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
  return Object.hasOwn(COUNTRY_TO_REGION, code) ? COUNTRY_TO_REGION[code] : null;
}

export function isPregnantStatus(maternalStatus) {
  return ['pregnant_t1', 'pregnant_t2', 'pregnant_t3', 'pregnant'].includes(maternalStatus);
}

export function minSafeEnergyFloor(profile = {}) {
  const maternal = profile?.maternalStatus || 'none';
  if (isPregnantStatus(maternal)) return 1800;
  if (maternal === 'breastfeeding') return 1600;
  return profile?.sex === 'female' ? 1200 : 1500;
}

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

export function computeAgeFromBirthDate(birthDate, referenceDate = localDate()) {
  if (typeof birthDate !== 'string' || !validDate(birthDate)) {
    throw apiError('INVALID_BIRTH_DATE', 'Date of birth must be a valid YYYY-MM-DD calendar date.', {
      status: 400,
      params: { minAge: 18, maxAge: 95, computedAge: null },
      fieldErrors: [{ field: 'birthDate', code: 'INVALID_BIRTH_DATE', message: 'Date of birth must be a valid YYYY-MM-DD calendar date.' }]
    });
  }
  const ref = validDate(referenceDate) ? referenceDate : localDate();
  if (birthDate > ref) {
    throw apiError('INVALID_BIRTH_DATE', 'Date of birth cannot be in the future.', {
      status: 400,
      params: { minAge: 18, maxAge: 95, computedAge: null },
      fieldErrors: [{ field: 'birthDate', code: 'INVALID_BIRTH_DATE', message: 'Date of birth cannot be in the future.' }]
    });
  }
  const [bY, bM, bD] = birthDate.split('-').map(Number);
  const [rY, rM, rD] = ref.split('-').map(Number);
  let age = rY - bY;
  if (rM < bM || (rM === bM && rD < bD)) age -= 1;
  return age;
}

export function resolveProfileBirthDateAndAge(input = {}, referenceDate = localDate()) {
  const hasRawBirthDate = input?.birthDate !== undefined && input?.birthDate !== null;
  const trimmedBirthDate = hasRawBirthDate ? String(input.birthDate).trim() : '';
  if (trimmedBirthDate !== '') {
    const computedAge = computeAgeFromBirthDate(trimmedBirthDate, referenceDate);
    if (computedAge < 18 || computedAge > 95) {
      throw apiError('INVALID_BIRTH_DATE', 'Date of birth must correspond to an adult aged 18 to 95 years.', {
        status: 400,
        params: { minAge: 18, maxAge: 95, computedAge },
        fieldErrors: [{ field: 'birthDate', code: 'INVALID_BIRTH_DATE', message: 'Date of birth must correspond to an adult aged 18 to 95 years.' }]
      });
    }
    return { birthDate: trimmedBirthDate, age: computedAge };
  }
  if (hasRawBirthDate && input?.age == null) {
    throw apiError('INVALID_BIRTH_DATE', 'Date of birth must correspond to an adult aged 18 to 95 years.', {
      status: 400,
      params: { minAge: 18, maxAge: 95, computedAge: null },
      fieldErrors: [{ field: 'birthDate', code: 'INVALID_BIRTH_DATE', message: 'Date of birth must correspond to an adult aged 18 to 95 years.' }]
    });
  }
  return {
    birthDate: null,
    age: integer(input?.age, 18, 95, 'age')
  };
}

export function effectiveProfileWithLiveAge(profile, referenceDate = localDate()) {
  if (!profile || !profile.birthDate || !validDate(profile.birthDate)) return profile;
  const ref = validDate(referenceDate) ? referenceDate : localDate();
  if (profile.birthDate > ref) return profile;
  const liveAge = Math.min(95, Math.max(18, computeAgeFromBirthDate(profile.birthDate, ref)));
  const seniorMode = liveAge >= 70 || profile.seniorMode === true;
  if (profile.age === liveAge && Boolean(profile.seniorMode) === seniorMode) return profile;
  return { ...profile, age: liveAge, seniorMode };
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
  const activeWindow = a && Date.parse(a.expiresAt) > now && (!a.planId || a.planId === s.workoutPlan?.id);
  const dateMatches = a?.multiDay === true ? (date >= (a.startsOn || localDate(now, tz)) && date <= localDate(Date.parse(a.expiresAt), tz)) : date === localDate(now, tz);
  const factor = activeWindow && dateMatches ? a.setFactor : 1;
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

export const DIETARY_CHRONIC_CONDITIONS = Object.freeze(new Set([
  'diabetes_t1', 'diabetes_t2', 'hypertension', 'cholesterol', 'celiac', 'ibs', 'gout', 'kidney'
]));
export const ACTIVE_ONBOARDING_CONDITIONS = Object.freeze([
  'diabetes_t1', 'diabetes_t2', 'insulin_resistance', 'pcos', 'hypothyroid',
  'hypertension', 'cholesterol', 'ibs', 'celiac', 'gout', 'kidney', 'favism', 'lactose_intolerance'
]);

export function hasConflictingDiabetesConditions(diseases = []) {
  const set = new Set(Array.isArray(diseases) ? diseases : []);
  return set.has('diabetes_t1') && set.has('diabetes_t2');
}

export function hasMultiConditionClinicalReview(diseases = [], maternalStatus = 'none') {
  const set = new Set(Array.isArray(diseases) ? diseases : []);
  if (set.has('kidney') && set.has('diabetes_t1')) return true;
  if (isPregnantStatus(maternalStatus) && (set.has('kidney') || set.has('diabetes_t1'))) return true;
  let dietaryCount = 0;
  for (const cond of set) {
    if (DIETARY_CHRONIC_CONDITIONS.has(cond)) dietaryCount++;
  }
  return dietaryCount >= 3;
}

export const hasActiveParqRedFlag = s => s.onboarding?.serviceTrack !== 'nutrition_only' && s.onboarding?.workoutPrefs?.parqRedFlag === true;

export const needsHealthConfirmation = s => s.onboarding?.serviceTrack === 'workouts_only' && s.onboarding?.workoutPrefs?.parqRedFlag == null && s.onboarding?.workoutPrefs?.healthConfirmed !== true;

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
      if (!Array.isArray(draft[key]) || draft[key].length > 7) {
        throw apiError('INVALID_WORKOUT_DAYS', 'Selected training days list is invalid (max 7 days).', { status: 400 });
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
