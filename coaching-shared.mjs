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
export const SUPPORTED_WELLNESS_CONDITIONS = Object.freeze(new Set([
  'hypertension', 'insulin_resistance', 'pcos', 'ibs', 'cholesterol', 'gout', 'anemia',
  'vitamin_d_deficiency', 'lactose_intolerance', 'favism', 'fatty_liver',
  'diabetes', 'diabetes_t1', 'diabetes_t2', 'hypothyroid', 'celiac', 'kidney'
]));
export const MATERNAL_STATUSES = Object.freeze(new Set([
  'none', 'pregnant_t1', 'pregnant_t2', 'pregnant_t3', 'pregnant', 'breastfeeding'
]));
export const ACTIVE_ONBOARDING_CONDITIONS = Object.freeze([
  'diabetes_t1', 'diabetes_t2', 'insulin_resistance', 'pcos', 'hypothyroid',
  'hypertension', 'cholesterol', 'ibs', 'celiac', 'gout', 'kidney', 'favism', 'lactose_intolerance'
]);
export const SUPPORTED_UNIT_SYSTEMS = Object.freeze(['metric', 'imperial']);

export function resolveUnitSystemInput(input = {}, fallback = 'metric') {
  const raw = input?.unitSystem !== undefined ? input.unitSystem : input?.unit_system;
  if (raw === undefined || raw === null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (!SUPPORTED_UNIT_SYSTEMS.includes(normalized)) {
    throw apiError('INVALID_UNIT_SYSTEM', 'unitSystem must be either metric or imperial.', {
      status: 400,
      params: { unitSystem: normalized },
      fieldErrors: [{ field: 'unitSystem', code: 'INVALID_UNIT_SYSTEM', message: 'unitSystem must be either metric or imperial.' }]
    });
  }
  return normalized;
}

export function resolveRegionInput(input = {}, fallback = 'egypt', { allowAny = true } = {}) {
  const raw = input?.region !== undefined
    ? input.region
    : (input?.regionId !== undefined ? input.regionId : input?.region_id);
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  const valid = SUPPORTED_REGIONS.includes(normalized) || (allowAny && normalized === 'any');
  if (!valid) {
    throw apiError('INVALID_REGION', 'region must be a supported regional catalog selection.', {
      status: 400,
      params: { region: normalized },
      fieldErrors: [{ field: 'region', code: 'INVALID_REGION', message: 'region must be one of egypt, gulf, levant, or maghreb.' }]
    });
  }
  return normalized;
}

export function computeActiveProteinPillars(dietType = 'balanced', diseases = [], excludedGroups = []) {
  const diet = String(dietType || 'balanced').trim().toLowerCase();
  const base = diet === 'vegan'
    ? ['legumes', 'soy', 'nuts']
    : diet === 'vegetarian'
      ? ['eggs', 'dairy', 'legumes', 'soy', 'nuts']
      : diet === 'keto'
        ? ['poultry', 'red_meat', 'fish', 'eggs', 'dairy', 'nuts']
        : ['mediterranean', 'dash'].includes(diet)
          ? ['poultry', 'fish', 'eggs', 'dairy', 'legumes', 'soy', 'nuts']
          : ['poultry', 'red_meat', 'fish', 'eggs', 'dairy', 'legumes', 'soy', 'nuts'];
  const conds = new Set((Array.isArray(diseases) ? diseases : []).map(x => String(x || '').trim().toLowerCase()).filter(x => x && x !== 'none'));
  const excluded = new Set((Array.isArray(excludedGroups) ? excludedGroups : []).map(x => String(x || '').trim().toLowerCase()).filter(x => x && x !== 'none'));
  const remaining = new Set(base);
  if (excluded.has('poultry') || excluded.has('chicken')) remaining.delete('poultry');
  if (excluded.has('red_meat') || excluded.has('meat') || conds.has('gout')) remaining.delete('red_meat');
  if (excluded.has('fish')) remaining.delete('fish');
  if (excluded.has('eggs')) remaining.delete('eggs');
  if (excluded.has('dairy') || conds.has('lactose_intolerance')) remaining.delete('dairy');
  if (excluded.has('legumes')) remaining.delete('legumes');
  if (excluded.has('soy')) remaining.delete('soy');
  if (excluded.has('nuts') || (excluded.has('tree_nuts') && excluded.has('peanuts'))) remaining.delete('nuts');
  return [...remaining];
}

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

export function assertNoConflictingDiabetes(diseases = []) {
  if (hasConflictingDiabetesConditions(diseases)) {
    throw apiError('CONFLICTING_CONDITIONS', 'diabetes_t1 and diabetes_t2 are mutually exclusive and cannot be selected together.', {
      status: 400,
      params: { conditions: ['diabetes_t1', 'diabetes_t2'] },
      fieldErrors: [{ field: 'diseases', code: 'CONFLICTING_CONDITIONS', message: 'Select either diabetes_t1 or diabetes_t2, not both.' }]
    });
  }
}

export function evaluateClinicalSafetyGate({
  age = NaN,
  sex = null,
  weight = NaN,
  height = NaN,
  goal = null,
  serviceTrack = 'nutrition_and_workouts',
  diseases = [],
  injuries = [],
  maternalStatus = 'none',
  parqRedFlag = null,
  healthConfirmed = false,
  dietType = 'balanced',
  excludedGroups = []
} = {}) {
  const cleanDiseases = Array.isArray(diseases) ? diseases.filter(x => x && x !== 'none') : [];
  assertNoConflictingDiabetes(cleanDiseases);
  const cleanInjuries = Array.isArray(injuries) ? canonicalInjuries(injuries) : [];
  const maternal = maternalStatus && maternalStatus !== 'none' ? maternalStatus : null;
  const reasons = [];
  const notes = [];
  const questions = [];

  if (!Number.isInteger(age) || age < 18 || age > 95) {
    reasons.push({
      code: 'AGE_UNSUPPORTED_OR_MISSING',
      severity: 'requires_review',
      message: 'CuraFit Specialist Team plans are available for adults aged 18 to 95 only.'
    });
  } else if (age >= 70) {
    notes.push({
      code: 'SENIOR_MODE_ACTIVE',
      severity: 'info',
      message: 'Senior safety mode (70+) is active: moderate deficit cap (-400 kcal), protein floor >= 1.2 g/kg, and joint-friendly low-impact exercises.'
    });
  }

  if (maternal && !MATERNAL_STATUSES.has(maternal)) {
    reasons.push({
      code: 'CLINICAL_OR_INJURY_REQUIRES_REVIEW',
      severity: 'requires_review',
      message: 'Unsupported maternal status requires direct CuraFit Specialist Team review.'
    });
  }
  if (maternal && (sex === 'male' || (Number.isFinite(age) && age > 50))) {
    reasons.push({
      code: 'CLINICAL_OR_INJURY_REQUIRES_REVIEW',
      severity: 'requires_review',
      message: 'Maternal status is only applicable to female profiles aged 18 to 50.'
    });
  }
  if (isPregnantStatus(maternal) && goal === 'lose') {
    reasons.push({
      code: 'MATERNAL_WEIGHT_LOSS_FORBIDDEN',
      severity: 'requires_review',
      message: 'Weight loss goals are disabled during pregnancy for maternal and fetal safety.'
    });
  }

  const supportedInjuries = new Set(SUPPORTED_WORKOUT_INJURIES);
  const unsupportedDiseases = cleanDiseases.filter(x => !SUPPORTED_WELLNESS_CONDITIONS.has(x));
  const unsupportedInjuries = cleanInjuries.filter(x => !supportedInjuries.has(x));
  if (unsupportedDiseases.length || unsupportedInjuries.length) {
    reasons.push({
      code: 'CLINICAL_OR_INJURY_REQUIRES_REVIEW',
      severity: 'requires_review',
      message: 'Declared clinical conditions or injuries require direct specialist review before plan generation.'
    });
  }
  if (hasMultiConditionClinicalReview(cleanDiseases, maternal || 'none')) {
    reasons.push({
      code: 'MULTI_CONDITION_CLINICAL_REVIEW',
      severity: 'requires_review',
      message: 'Multiple overlapping or high-acuity clinical conditions require direct specialist review before plan generation.'
    });
  }
  if (parqRedFlag === true && serviceTrack !== 'nutrition_only') {
    reasons.push({
      code: 'PARQ_CLEARANCE_REQUIRED',
      severity: 'requires_review',
      message: 'Physician clearance is required before workout planning after a positive PAR-Q screening response. You can switch to nutrition_only in the meantime.'
    });
  }
  if (serviceTrack !== 'nutrition_only') {
    if (cleanInjuries.length === 3) {
      notes.push({
        code: 'MULTI_INJURY_WARNING',
        severity: 'warning',
        message: 'Three concurrent injuries limit available exercises; monitor joint comfort closely or consider switching to nutrition_only during recovery.'
      });
    } else if (cleanInjuries.length >= 4) {
      reasons.push({
        code: 'MULTI_INJURY_REQUIRES_REVIEW',
        severity: 'requires_review',
        message: 'Four or more concurrent injuries require specialist review before workout planning; switch to nutrition_only or seek clinical clearance.'
      });
    }
  }

  if (Number.isFinite(weight) && Number.isFinite(height) && height >= 120 && height <= 230) {
    const bmi = weight / ((height / 100) ** 2);
    if (bmi < 12.5 || bmi > 65) {
      reasons.push({
        code: 'BMI_OUT_OF_RANGE',
        severity: 'requires_review',
        message: 'Height and weight fall outside the standard CuraFit Specialist Team planning BMI range (12.5 to 65).'
      });
    } else if (bmi < 18.5 && goal === 'lose') {
      reasons.push({
        code: 'UNDERWEIGHT_LOSS_FORBIDDEN',
        severity: 'requires_review',
        message: 'Weight loss goals are unsafe when current BMI is below 18.5.'
      });
    }
  }

  if (serviceTrack === 'workouts_only' && parqRedFlag == null && healthConfirmed !== true) {
    questions.push({
      code: 'CONFIRM_WORKOUT_HEALTH',
      field: 'healthConfirmed',
      prompt: 'Confirm that you have no acute condition or injury requiring specialist clearance before starting workouts.'
    });
  }

  const activeProteinPillars = computeActiveProteinPillars(dietType, cleanDiseases, excludedGroups);
  const noProteinPillarsRemaining = serviceTrack !== 'workouts_only' && activeProteinPillars.length === 0;
  const seniorMode = Number.isInteger(age) && age >= 70 && age <= 95;
  const protectedJoints = [
    ...new Set([
      ...cleanInjuries,
      ...(seniorMode ? ['senior_joints'] : []),
      ...(isPregnantStatus(maternal) ? ['maternal_core'] : [])
    ])
  ];

  return {
    reasons,
    notes,
    questions,
    eligibilityReasons: reasons.map(r => r.message),
    eligibilityReasonCodes: [...new Set(reasons.map(r => r.code))],
    warningCodes: [...new Set(notes.map(n => n.code))],
    seniorMode,
    unsupportedDiseases,
    unsupportedInjuries,
    cleanDiseases,
    cleanInjuries,
    maternal: maternal || 'none',
    activeProteinPillars,
    noProteinPillarsRemaining,
    protectedJoints
  };
}

export function buildCalibrationMetadata({
  calibrationReasons = [],
  adjustedCalories = null,
  previousCalories = null,
  adjustedMacros = null,
  injuries = [],
  seniorMode = false,
  maternalStatus = 'none',
  dietType = 'balanced',
  diseases = [],
  excludedGroups = [],
  activeProteinPillars = null
} = {}) {
  const cleanInjuries = canonicalInjuries(Array.isArray(injuries) ? injuries : []);
  const protectedJoints = [
    ...new Set([
      ...cleanInjuries,
      ...(seniorMode ? ['senior_joints'] : []),
      ...(isPregnantStatus(maternalStatus) ? ['maternal_core'] : [])
    ])
  ];
  const resolvedPillars = Array.isArray(activeProteinPillars)
    ? [...new Set(activeProteinPillars)]
    : computeActiveProteinPillars(dietType, diseases, excludedGroups);
  const adjCal = adjustedCalories != null && Number.isFinite(Number(adjustedCalories))
    ? Math.round(Number(adjustedCalories))
    : null;
  const prevCal = previousCalories != null && Number.isFinite(Number(previousCalories))
    ? Math.round(Number(previousCalories))
    : null;
  const calorieDelta = adjCal != null && prevCal != null ? adjCal - prevCal : 0;
  const macros = adjustedMacros && Number.isFinite(Number(adjustedMacros.protein))
    ? {
        protein: Math.round(Number(adjustedMacros.protein) * 10) / 10,
        carbs: Math.round(Number(adjustedMacros.carbs) * 10) / 10,
        fat: Math.round(Number(adjustedMacros.fat) * 10) / 10
      }
    : null;
  return {
    calibrationReasons: [...new Set(calibrationReasons.filter(Boolean))],
    adjustedCalories: adjCal,
    previousCalories: prevCal,
    calorieDelta,
    adjustedMacros: macros,
    protectedJoints,
    activeProteinPillars: resolvedPillars
  };
}

/**
 * Build a priority-ranked list of specialist personalization highlights so the
 * mobile app can explain concrete clinical, nutritional, training, synergy, and
 * hydration actions taken by the CuraFit Specialist Team.
 */
export function buildSpecialistHighlights({
  maternalStatus = 'none',
  seniorMode = false,
  diseases = [],
  allergies = [],
  excludedGroups = [],
  injuries = [],
  protectedJoints = [],
  goal = 'maintain',
  goalPace = 'balanced',
  recomposition = false,
  serviceTrack = 'both',
  workoutDaysCount = 0,
  region = 'egypt',
  restDayWaterTarget = null,
  workoutDayWaterTarget = null,
  warningCodes = [],
  maxItems = 6
} = {}) {
  const items = [];
  const seenCodes = new Set();
  const push = (entry) => {
    if (!entry || !entry.code || seenCodes.has(entry.code)) return;
    seenCodes.add(entry.code);
    items.push({
      id: entry.id,
      domain: entry.domain,
      priority: entry.priority,
      code: entry.code,
      params: Array.isArray(entry.params) ? entry.params : [],
      message: entry.message
    });
  };

  const diseaseSet = new Set((diseases || []).map(x => String(x || '').trim()).filter(Boolean));
  const allergySet = new Set((allergies || []).map(x => String(x || '').trim()).filter(Boolean));
  const exclSet = new Set((excludedGroups || []).map(x => String(x || '').trim()).filter(Boolean));
  const warnSet = new Set((warningCodes || []).map(x => String(x || '').trim()).filter(Boolean));
  const pregnant = isPregnantStatus(maternalStatus);
  const trains = serviceTrack !== 'nutrition_only' && Number(workoutDaysCount) > 0;
  const hasBothTracks = serviceTrack === 'nutrition_and_workouts' || serviceTrack === 'both';

  // Priority 1: Maternal & Senior safety
  if (maternalStatus === 'pregnant_t1') {
    push({
      id: 'maternal_t1',
      domain: 'clinical',
      priority: 1,
      code: 'PLAN_PREGNANCY_T1_CALIBRATION',
      message: 'First-trimester pregnancy nutrition active: deficit goals are blocked and protein is elevated.'
    });
  } else if (maternalStatus === 'pregnant_t2') {
    push({
      id: 'maternal_t2',
      domain: 'clinical',
      priority: 1,
      code: 'PLAN_PREGNANCY_T2_CALIBRATION',
      message: 'Second-trimester pregnancy nutrition active: +340 kcal daily allowance and elevated protein applied.'
    });
  } else if (maternalStatus === 'pregnant_t3') {
    push({
      id: 'maternal_t3',
      domain: 'clinical',
      priority: 1,
      code: 'PLAN_PREGNANCY_T3_CALIBRATION',
      message: 'Third-trimester pregnancy nutrition active: +452 kcal daily allowance and elevated protein applied.'
    });
  } else if (maternalStatus === 'breastfeeding') {
    push({
      id: 'maternal_bf',
      domain: 'clinical',
      priority: 1,
      code: 'PLAN_BREASTFEEDING_CALIBRATION',
      message: 'Breastfeeding nutrition active: +400 kcal allowance and elevated protein applied to support lactation.'
    });
  }

  if (pregnant) {
    push({
      id: 'pregnancy_food_safety',
      domain: 'nutrition',
      priority: 1,
      code: 'PLAN_PREGNANCY_FOOD_SAFETY',
      message: 'Pregnancy food safety active: organ meats such as liver are excluded to avoid excess vitamin A, and minimum carbohydrate intake is maintained.'
    });
    if (trains) {
      push({
        id: 'pregnancy_workout_safety',
        domain: 'training',
        priority: 1,
        code: 'WORKOUT_PREGNANCY_SAFETY_ACTIVE',
        message: 'Pregnancy training safety active: high-impact jumping, heavy abdominal loading, and post-first-trimester supine movements are excluded, with volume capped conservatively.'
      });
    }
  }

  if (seniorMode) {
    push({
      id: 'senior_mode',
      domain: 'clinical',
      priority: 1,
      code: 'SENIOR_MODE_ACTIVE',
      message: 'Senior protection mode (70+) active: protein target is boosted for muscle preservation, deficits are capped conservatively, and high-impact plyometrics are excluded.'
    });
  }

  // Priority 2: Medical conditions & dietary exclusions
  const hasGlycemic = ['diabetes', 'diabetes_t1', 'diabetes_t2', 'diabetes_type1', 'diabetes_type2', 'insulin_resistance', 'pcos'].some(d => diseaseSet.has(d));
  if (hasGlycemic) {
    push({
      id: 'diabetes_sugar_filter',
      domain: 'nutrition',
      priority: 2,
      code: 'HIGHLIGHT_DIABETES_SUGAR_FILTER',
      message: 'Glycemic control active: dates, honey, added sugars, and high-glycemic spikes are filtered out and carbs are capped at 40% of calories.'
    });
    if (trains && ['diabetes', 'diabetes_t1', 'diabetes_t2', 'diabetes_type1', 'diabetes_type2'].some(d => diseaseSet.has(d))) {
      push({
        id: 'diabetes_training_guidance',
        domain: 'training',
        priority: 2,
        code: 'WORKOUT_DIABETES_GUIDANCE',
        message: 'Diabetes training guidance active: monitor blood glucose around sessions, stay hydrated, and avoid exhaustive fasted workouts.'
      });
    }
  }

  if (diseaseSet.has('hypertension')) {
    push({
      id: 'hypertension_sodium',
      domain: 'nutrition',
      priority: 2,
      code: 'PLAN_HYPERTENSION_SODIUM_CEILING',
      params: [1500],
      message: 'Hypertension safety applied: sodium is limited to 1500 mg/day and high-sodium options are filtered.'
    });
    if (trains) {
      push({
        id: 'hypertension_training',
        domain: 'training',
        priority: 2,
        code: 'WORKOUT_HYPERTENSION_GUIDANCE',
        message: 'Hypertension training safety active: breath-holding movements are avoided, sets are capped conservatively, and controlled breathing is coached.'
      });
    }
  }

  if (diseaseSet.has('kidney') || diseaseSet.has('kidney_disease')) {
    push({
      id: 'kidney_protein_cap',
      domain: 'clinical',
      priority: 2,
      code: 'PLAN_KIDNEY_PROTEIN_CAP',
      message: 'Protein conservatively capped at <= 1.1 g/kg for kidney condition support and total training volume is moderated.'
    });
  }

  if (diseaseSet.has('gout')) {
    push({
      id: 'gout_protection',
      domain: 'clinical',
      priority: 2,
      code: 'PLAN_GOUT_PROTEIN_CAP',
      message: 'Protein capped at <= 1.4 g/kg with red-meat avoidance for gout management and elevated hydration.'
    });
  }

  if (diseaseSet.has('cholesterol')) {
    push({
      id: 'cholesterol_lipids',
      domain: 'nutrition',
      priority: 2,
      code: 'HIGHLIGHT_CHOLESTEROL_LIPID_FILTER',
      message: 'Lipid protection active: high-saturated-fat dairy and meats are filtered out and dietary fat is capped at 30% of calories.'
    });
  }

  if (diseaseSet.has('hypothyroid')) {
    push({
      id: 'hypothyroid_ree',
      domain: 'clinical',
      priority: 2,
      code: 'PLAN_HYPOTHYROID_REE_CALIBRATION',
      message: 'Hypothyroid energy calibration applied: daily calories reflect a moderated baseline metabolic rate.'
    });
  }

  if (diseaseSet.has('celiac') || allergySet.has('gluten') || exclSet.has('gluten')) {
    push({
      id: 'celiac_gluten_free',
      domain: 'nutrition',
      priority: 2,
      code: 'PLAN_CELIAC_GLUTEN_EXCLUSION',
      message: 'Gluten-free safety active: all wheat, barley, rye, and gluten-containing foods are excluded.'
    });
  }

  if (diseaseSet.has('favism')) {
    push({
      id: 'favism_filter',
      domain: 'nutrition',
      priority: 2,
      code: 'PLAN_FAVISM_EXCLUSION',
      message: 'G6PD (favism) protection active: fava beans and legume triggers are strictly excluded from all meals.'
    });
  }

  if (diseaseSet.has('lactose_intolerance') || allergySet.has('dairy') || exclSet.has('dairy')) {
    push({
      id: 'lactose_filter',
      domain: 'nutrition',
      priority: 2,
      code: 'PLAN_LACTOSE_EXCLUSION',
      message: 'Dairy-free safety active: milk, yogurt, and dairy cheeses are excluded from meal plans.'
    });
  }

  if (diseaseSet.has('ibs')) {
    push({
      id: 'ibs_filter',
      domain: 'nutrition',
      priority: 2,
      code: 'PLAN_IBS_EXCLUSIONS_ACTIVE',
      message: 'Digestive comfort active: heavy legumes and high-fermentation triggers are filtered for IBS tolerance.'
    });
  }

  // Priority 3: Protected joints & injuries
  const joints = Array.isArray(protectedJoints) && protectedJoints.length
    ? protectedJoints
    : canonicalInjuries(injuries);
  if (serviceTrack !== 'nutrition_only' && joints.length > 0) {
    const jointLabel = joints.map(j => String(j).replace(/_/g, ' ')).join(', ');
    push({
      id: 'protected_joints',
      domain: 'training',
      priority: 3,
      code: 'HIGHLIGHT_PROTECTED_JOINTS',
      params: [jointLabel],
      message: `Joint protection active for ${jointLabel}: aggravating movements are swapped for safer alternatives with controlled intensity.`
    });
  }

  // Priority 4: Cross-module goal synergy & energy calibration
  if (goal === 'maintain' && !recomposition && trains && hasBothTracks) {
    push({
      id: 'goal_maintain_synergy',
      domain: 'synergy',
      priority: 4,
      code: 'HIGHLIGHT_MAINTAIN_SYNERGY',
      params: [Number(workoutDaysCount)],
      message: `Weight maintenance synergy active: nutrition calories cover your ${workoutDaysCount}-day training expenditure while sessions hold moderate 2-3 set RIR >= 3 volume to keep weight stable.`
    });
  } else if (goal === 'lose' && recomposition) {
    push({
      id: 'goal_recomp_synergy',
      domain: 'synergy',
      priority: 4,
      code: 'HIGHLIGHT_RECOMP_SYNERGY',
      message: 'Body recomposition active: nutrition is held near maintenance with high protein while resistance training drives fat loss and lean tissue retention.'
    });
  } else if (goal === 'lose' && trains && hasBothTracks) {
    const paceLabel = String(goalPace || 'balanced').replace(/_/g, ' ');
    push({
      id: 'goal_lose_synergy',
      domain: 'synergy',
      priority: 4,
      code: 'HIGHLIGHT_LOSE_SYNERGY',
      params: [paceLabel],
      message: `Fat-loss synergy active: nutrition targets a ${paceLabel} calorie deficit with muscle-sparing protein alongside strength training to protect lean mass.`
    });
  } else if (goal === 'muscle_gain' && trains && hasBothTracks) {
    push({
      id: 'goal_muscle_gain_synergy',
      domain: 'synergy',
      priority: 4,
      code: 'HIGHLIGHT_MUSCLE_GAIN_SYNERGY',
      message: 'Lean muscle-gain synergy active: a moderate caloric surplus and high daily protein pair directly with progressive hypertrophy programming.'
    });
  } else if (goal === 'gain' && trains && hasBothTracks) {
    push({
      id: 'goal_gain_synergy',
      domain: 'synergy',
      priority: 4,
      code: 'HIGHLIGHT_GAIN_SYNERGY',
      message: 'Healthy weight-gain synergy active: progressive resistance training pairs with a steady daily energy surplus to support quality weight gain.'
    });
  }

  if (warnSet.has('PLAN_SEDENTARY_WORKOUT_ENERGY_NOTE')) {
    push({
      id: 'sedentary_workout_energy',
      domain: 'synergy',
      priority: 4,
      code: 'PLAN_SEDENTARY_WORKOUT_ENERGY_NOTE',
      message: 'Energy budget note: your daily calorie target reflects a sedentary daily lifestyle alongside your planned training sessions.'
    });
  }
  if (warnSet.has('PLAN_MUSCLE_GAIN_EXTERNAL_TRAINING_NOTE')) {
    push({
      id: 'muscle_gain_external_training',
      domain: 'synergy',
      priority: 4,
      code: 'PLAN_MUSCLE_GAIN_EXTERNAL_TRAINING_NOTE',
      message: 'Nutrition-only muscle gain: protein is set for lean tissue support; pair this meal plan with external resistance training for muscle growth.'
    });
  }
  if (warnSet.has('PLAN_FLOOR_NEEDS_ACTIVITY_FOR_DEFICIT')) {
    push({
      id: 'floor_activity_note',
      domain: 'clinical',
      priority: 4,
      code: 'PLAN_FLOOR_NEEDS_ACTIVITY_FOR_DEFICIT',
      message: 'Energy safety floor active: calories cannot safely drop lower, so gentle daily movement will support your pace.'
    });
  }
  if (warnSet.has('PLAN_ABW_PROTEIN_SCALING')) {
    push({
      id: 'abw_protein',
      domain: 'nutrition',
      priority: 4,
      code: 'PLAN_ABW_PROTEIN_SCALING',
      message: 'Adjusted Body Weight protein scaling applied to prevent excess protein load while supporting fat loss.'
    });
  }
  if (warnSet.has('PLAN_UNDERWEIGHT_NUTRIENT_CARE')) {
    push({
      id: 'underweight_care',
      domain: 'clinical',
      priority: 4,
      code: 'PLAN_UNDERWEIGHT_NUTRIENT_CARE',
      message: 'Underweight recovery nutrition active: weight-loss deficits are paused in favor of restorative nutrient density.'
    });
  }

  // Priority 5: Hydration & climate adjustments
  if (pregnant || maternalStatus === 'breastfeeding') {
    push({
      id: 'hydration_maternal',
      domain: 'hydration',
      priority: 5,
      code: 'MATERNAL_HYDRATION_BONUS',
      message: 'Maternal hydration bonus (+300 ml pregnancy / +600 ml breastfeeding) applied.'
    });
  }
  if (diseaseSet.has('gout')) {
    push({
      id: 'hydration_gout',
      domain: 'hydration',
      priority: 5,
      code: 'GOUT_HYDRATION_BONUS',
      message: 'Gout support hydration bonus (+500 ml) applied.'
    });
  }
  if (['egypt', 'gulf'].includes(String(region || '').toLowerCase())) {
    push({
      id: 'hydration_warm_climate',
      domain: 'hydration',
      priority: 5,
      code: 'WARM_CLIMATE_HYDRATION_BONUS',
      message: 'Regional warm-climate hydration bonus (+200 ml) applied.'
    });
  }
  const trainingMl = Number(workoutDayWaterTarget?.bonuses?.trainingMl || 0);
  if (trains && trainingMl > 0) {
    push({
      id: 'hydration_training_boost',
      domain: 'hydration',
      priority: 5,
      code: 'HIGHLIGHT_TRAINING_HYDRATION_BOOST',
      params: [trainingMl],
      message: `Training-day hydration boost applied: +${trainingMl} ml added on scheduled workout days.`
    });
  }

  items.sort((a, b) => a.priority - b.priority);
  const limit = Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Number(maxItems) : 6;
  return items.slice(0, limit);
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
