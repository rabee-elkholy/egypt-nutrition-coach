// Structured, PII/Health-redacting logger and error envelope utilities for Egypt Nutrition Coach

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'access_token', 'refresh_token', 'id_token', 'authorization', 'cookie', 'set-cookie',
  'secret', 'jwt', 'diseases', 'injuries', 'maternalStatus', 'maternal_status', 'medical_conditions',
  'weight', 'kg', 'height', 'sleepHours', 'sleepQuality', 'fatigue', 'stress', 'soreness',
  'sorenessByRegion', 'painRegions', 'pain', 'illness', 'redFlags', 'body', 'foodEntries', 'foodLogs',
  'weights', 'waterLogs', 'workoutLogs', 'checkins', 'clinicalSummary', 'email', 'phone', 'name'
]);

export function redactObject(value, depth = 0) {
  if (depth > 4) return '[REDACTED_DEPTH]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 200) return value.slice(0, 48) + '...[TRUNCATED]';
    if (/^Bearer\s+/i.test(value) || /^eyJ[A-Za-z0-9_-]+\./.test(value)) return '[REDACTED_TOKEN]';
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(k) || /token|secret|password|auth|cookie|health|disease|injury|weight|pain/i.test(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactObject(v, depth + 1);
    }
  }
  return out;
}

export function maskSubject(userId) {
  if (!userId || typeof userId !== 'string') return 'anonymous';
  if (userId.startsWith('__simulation__:')) return 'sim:' + userId.slice(15, 23);
  if (userId.startsWith('anon:')) return 'anon:' + userId.slice(5, 13);
  return 'usr:' + userId.slice(0, 8);
}

export function logEvent(level, event, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId: meta.requestId || null,
    subjectHash: meta.userId ? maskSubject(meta.userId) : undefined,
    method: meta.method,
    path: meta.path,
    status: meta.status,
    code: meta.code,
    durationMs: meta.durationMs,
    details: meta.details ? redactObject(meta.details) : undefined
  };
  for (const k of Object.keys(entry)) {
    if (entry[k] === undefined) delete entry[k];
  }
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  }
  return entry;
}

const DEFAULT_ERROR_CODES = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE'
};

export function createApiError(message, status = 400, options = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = options.code || DEFAULT_ERROR_CODES[status] || 'BAD_REQUEST';
  err.fieldErrors = options.fieldErrors || [];
  err.retryable = options.retryable ?? (status === 429 || status === 503 || status === 500);
  if (options.details) err.details = options.details;
  return err;
}

export function formatErrorBody(message, status = 400, requestId = null, options = {}) {
  const code = options.code || DEFAULT_ERROR_CODES[status] || 'BAD_REQUEST';
  const retryable = options.retryable ?? (status === 429 || status === 503 || status === 500);
  const fieldErrors = Array.isArray(options.fieldErrors) ? options.fieldErrors : [];
  return {
    error: message,
    code,
    message,
    fieldErrors,
    requestId: requestId || crypto.randomUUID(),
    retryable,
    ...(options.currentRevision !== undefined ? { currentRevision: options.currentRevision } : {}),
    ...(options.mergeHints ? { mergeHints: options.mergeHints } : {})
  };
}
