// Zero-dependency structured API error helper shared across Workers, Node, and Web UI.

export const FIELD_LABELS_EN = Object.freeze({
  age: 'age',
  weight: 'weight',
  height: 'height',
  targetWeight: 'targetWeight',
  mealsCount: 'mealsCount',
  cups: 'cups',
  addCups: 'addCups',
  kg: 'kg',
  steps: 'steps',
  activeEnergyKcal: 'activeEnergyKcal',
  dayIndex: 'dayIndex',
  reps: 'reps',
  rir: 'rir',
  increment: 'increment',
  duration: 'duration',
  rpe: 'rpe',
  energy: 'energy',
  protein: 'protein',
  fat: 'fat',
  carbs: 'carbs',
  fiber: 'fiber',
  saturated: 'saturated',
  sodium: 'sodium',
  sugars: 'sugars',
  quantity: 'quantity',
  grams: 'grams',
  sleepHours: 'sleepHours',
  sleepQuality: 'sleepQuality',
  fatigue: 'fatigue',
  stress: 'stress',
  soreness: 'soreness',
  muscleSoreness: 'muscleSoreness',
  complete: 'complete',
  bothSides: 'bothSides',
  pain: 'pain',
  offset: 'offset',
  limit: 'limit',
  after: 'after',
  afterSeq: 'afterSeq',
  weekday: 'weekday',
  externalTrainingDays: 'externalTrainingDays',
  selectedWorkoutDays: 'selectedWorkoutDays',
  workoutDaysCount: 'workoutDaysCount',
  sessionDuration: 'sessionDuration',
  dayLocations: 'dayLocations',
  homeEquipment: 'homeEquipment',
  dayMap: 'dayMap',
  sorenessByRegion: 'sorenessByRegion',
  preferences: 'preferences'
});

export function apiError(code, message, options = {}) {
  const status = options.status ?? 400;
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.params = options.params && typeof options.params === 'object' ? options.params : {};
  err.fieldErrors = Array.isArray(options.fieldErrors) ? options.fieldErrors : [];
  err.retryable = options.retryable ?? (status === 429 || status === 503 || status === 500);
  if (options.details !== undefined) err.details = options.details;
  if (options.cause !== undefined) err.cause = options.cause;
  return err;
}

export function hasArabicText(text) {
  return typeof text === 'string' && /[\u0600-\u06FF]/.test(text);
}
