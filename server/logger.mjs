// Structured, PII/Health-redacting logger and KMM API envelope utilities for CuraFit API v1
import errorCatalog from '../contracts/error-codes.json' with { type: 'json' };
import { apiError, hasArabicText } from '../coaching-error.mjs';

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
  402: 'PRO_ENTITLEMENT_REQUIRED',
  403: 'FORBIDDEN',
  404: 'ROUTE_NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_ERROR',
  426: 'CLIENT_UPDATE_REQUIRED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE'
};

function interpolateEnglish(template, params = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) =>
    params[k] !== undefined && params[k] !== null ? String(params[k]) : k
  );
}

export function sanitizeEnglishErrorMessage(message, code, params = {}, status = 400) {
  if (typeof message === 'string' && message.trim() && !hasArabicText(message)) {
    return message;
  }
  const entry = (code && errorCatalog.codes[code]) || errorCatalog.codes[DEFAULT_ERROR_CODES[status]] || errorCatalog.codes.VALIDATION_ERROR;
  if (entry?.message) return interpolateEnglish(entry.message, params);
  return 'Request failed.';
}

export function createApiError(message, status = 400, options = {}) {
  const code = options.code || DEFAULT_ERROR_CODES[status] || 'VALIDATION_ERROR';
  const params = options.params && typeof options.params === 'object' ? options.params : {};
  const safeMsg = sanitizeEnglishErrorMessage(message, code, params, status);
  return apiError(code, safeMsg, { ...options, status, params });
}

export function formatSuccessBody(data, requestId = null, metaExtra = {}) {
  const meta = {
    requestId: requestId || crypto.randomUUID(),
    serverTime: new Date().toISOString(),
    ...(data && typeof data === 'object' && !Array.isArray(data) && typeof data.revision === 'number'
      ? { revision: data.revision }
      : {}),
    ...metaExtra
  };
  return {
    ok: true,
    data,
    meta
  };
}

export function formatErrorBody(message, status = 400, requestId = null, options = {}) {
  const code = options.code || DEFAULT_ERROR_CODES[status] || 'VALIDATION_ERROR';
  const params = options.params && typeof options.params === 'object' ? options.params : {};
  const catalogEntry = errorCatalog.codes[code];
  const retryable = options.retryable ?? catalogEntry?.retryable ?? (status === 429 || status === 503 || status === 500);
  const rawFieldErrors = Array.isArray(options.fieldErrors) ? options.fieldErrors : [];
  const fieldErrors = rawFieldErrors.map(fe => ({
    field: typeof fe?.field === 'string' && !hasArabicText(fe.field) ? fe.field : 'field',
    code: fe?.code || code,
    message: sanitizeEnglishErrorMessage(fe?.message, fe?.code || code, { field: fe?.field }, status)
  }));
  const details = options.details !== undefined
    ? options.details
    : (options.currentRevision !== undefined || options.mergeHints
      ? {
          ...(options.currentRevision !== undefined ? { currentRevision: options.currentRevision } : {}),
          ...(options.mergeHints ? { mergeHints: options.mergeHints } : {})
        }
      : undefined);

  const errorObj = {
    code,
    message: sanitizeEnglishErrorMessage(message, code, params, status),
    params,
    fieldErrors,
    retryable
  };
  if (details !== undefined) errorObj.details = details;

  return {
    ok: false,
    error: errorObj,
    meta: {
      requestId: requestId || crypto.randomUUID(),
      serverTime: new Date().toISOString()
    }
  };
}
