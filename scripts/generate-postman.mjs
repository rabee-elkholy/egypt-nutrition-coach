// Authoritative Generator for:
// 1. postman/CuraFit_API.postman_collection.json (fully documented v2.1 + saved examples)
// 2. postman/CuraFit_Cloud_Dev.postman_environment.json (Cloud Dev Server)
// 3. postman/CuraFit_Production.postman_environment.json (Production Server)
// 4. postman/CuraFit_Local_Dev.postman_environment.json (Local Dev Server)
// 5. docs/API_REFERENCE.md (complete Markdown API documentation synced with Postman)
//
// Canonical Backend: Cloudflare Workers + Cloudflare D1 (Zero Supabase dependency)
import { mkdir, writeFile } from 'node:fs/promises';

const SCHEMA_V21 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const CLOUD_DEV_URL = 'https://curafit-api-dev.egypt-nutrition-coach.workers.dev';
const PROD_URL = 'https://curafit-api.egypt-nutrition-coach.workers.dev';
const LOCAL_DEV_URL = 'http://127.0.0.1:8787';

const COLLECTION_OVERVIEW_MD = [
  '# CuraFit API v1 — Cloudflare Workers & D1',
  '',
  'Production-grade REST API running natively on **Cloudflare Workers + Cloudflare D1** (`curafit-api` for Production, `curafit-api-dev` for Cloud Dev). Designed for **Kotlin Multiplatform Mobile (KMM)** and clean Web User Stories with uniform JSON envelopes and 100% English machine-coded errors.',
  '',
  '---',
  '',
  '## 1. Servers & Environments',
  '',
  'Switch between environments from the top-right **Environment selector** in Postman:',
  '',
  '| Environment Name | `baseUrl` | Cloudflare Worker / D1 | Purpose |',
  '| :--- | :--- | :--- | :--- |',
  `| **CuraFit — Cloud Dev** | \`${CLOUD_DEV_URL}\` | \`curafit-api-dev\` / \`curafit-db-dev\` | Feature development & staging on Cloudflare edge (\`dev\` branch, full clone of Prod D1) |`,
  `| **CuraFit — Production** | \`${PROD_URL}\` | \`curafit-api\` / \`egypt-nutrition-coaching\` | Live Cloudflare Workers + D1 production server (\`main\` branch) |`,
  `| **CuraFit — Local Dev** | \`${LOCAL_DEV_URL}\` | Local Miniflare | Local development server (\`npm run dev\`) |`,
  '',
  '---',
  '',
  '## 2. Authentication (Cloudflare Native D1)',
  '',
  '- **Public endpoints (No Auth):** `GET /v1/health`, `GET /v1/capabilities`, `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`.',
  '- **Authenticated endpoints:** Send `Authorization: Bearer {{accessToken}}` (inherited automatically at collection level).',
  '- **Access Token:** HS256 JWT (TTL: `900s` / 15 minutes).',
  '- **Refresh Token:** Opaque rotating token (`cfrt_...`, TTL: 30 days) stored SHA-256 hashed in D1. Replaying an already-rotated token revokes the entire session (`401 AUTH_REFRESH_TOKEN_REUSED`).',
  '- **Web Fallback:** Browser clients without Bearer token continue to use the `HttpOnly` `coach_uid` anonymous cookie and can migrate via `POST /v1/auth/claim-anonymous`.',
  '',
  '---',
  '',
  '## 3. Unified Command Pipeline (`POST /v1/commands`), Revision & Idempotency',
  '',
  'All domain mutations pass through `POST /v1/commands`:',
  '- **`Idempotency-Key` header (`string`, UUID, max 100 chars, required):** Auto-generated before every Postman request. Retry with the exact same key and body on network timeout.',
  '- **`revision` (`integer >= 0`, required):** Must equal the server\'s current account revision. Mismatches return `409 REVISION_CONFLICT` with `error.details.currentRevision` and `error.details.mergeHints`.',
  '- **Response Mode (`?view=receipt` vs `?view=full`):** `?view=receipt` (or `Prefer: return=minimal`) returns a compact `< 2 KB` delta receipt inside `data`; `?view=full` returns the full account snapshot inside `data`.',
  '',
  '---',
  '',
  '## 4. Uniform KMM Envelopes & Pure-English Error Contract',
  '',
  'Every JSON endpoint returns the canonical envelope:',
  '',
  '- **Success (`2xx`):** `{ "ok": true, "data": <T>, "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>", "revision"?: <int> } }`',
  '- **Error (`4xx` / `5xx`):** `{ "ok": false, "error": { "code", "message", "params", "fieldErrors", "retryable", "details"?: {...} }, "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>" } }`',
  '',
  '| Field | Type | Description |',
  '| :--- | :--- | :--- |',
  '| `ok` | `boolean` | `false` on all `4xx`/`5xx` responses |',
  '| `error.code` | `string` | Stable uppercase error code (235 codes cataloged in `contracts/error-codes.json` and `docs/ERROR_CODES.md`) |',
  '| `error.message` | `string` | Canonical English message (zero Arabic in API errors; mobile clients translate by `error.code` and `error.params`) |',
  '| `error.params` | `object` | Interpolation parameters for client-side localization |',
  '| `error.fieldErrors` | `Array<{field, code, message, params?}>` | Optional per-field validation errors (also 100% English) |',
  '| `error.retryable` | `boolean` | Whether the client may safely retry (`true` for `429`/`503`/`500`) |',
  '| `error.details` | `object` (optional) | Structured recovery data such as `currentRevision` and `mergeHints` on `409` |',
  '| `meta.requestId` | `string (UUID)` | Trace ID matching `X-Request-Id` header |',
  '| `meta.serverTime` | `string (ISO-8601)` | Server UTC timestamp |',
  '',
  '---',
  '',
  '## 5. Collection & Environment Variables Reference',
  '',
  '| Variable | Type | Scope | Description |',
  '| :--- | :--- | :--- | :--- |',
  '| `baseUrl` | `string (URL)` | Environment | Server base URL (`Cloud Dev`, `Production`, or `Local Dev`) |',
  '| `testEmail` | `string (email)` | Environment | Email used in Register / Login |',
  '| `testPassword` | `string (secret)` | Environment | Password (`8..128` chars) |',
  '| `testNewPassword` | `string (secret)` | Environment | New password for Change Password |',
  '| `deviceId` | `string` | Environment | Client device ID (`max 120` chars) |',
  '| `clientPlatform` | `string (enum)` | Environment | `android` \\| `ios` \\| `web` |',
  '| `clientVersion` | `string` | Environment | App semantic version (e.g. `1.0.0`) |',
  '| `accessToken` | `string (JWT)` | Collection (auto) | Auto-saved by Register / Login / Refresh |',
  '| `refreshToken` | `string` | Collection (auto) | Auto-saved & rotated by Register / Login / Refresh |',
  '| `sessionId` | `string` | Collection (auto) | Current D1 session ID |',
  '| `userId` | `string` | Collection (auto) | Authenticated user ID (`user:<uuid>`) |',
  '| `revision` | `integer` | Collection (auto) | Current optimistic-concurrency revision |',
  '| `idempotencyKey` | `string (UUID)` | Pre-request (auto) | Fresh UUID generated before every request |',
  '| `todayDate` | `string (YYYY-MM-DD)` | Collection (auto) | Current server local date |',
  '| `lastEtag` | `string` | Collection (auto) | Last `ETag` response header for `If-None-Match` |',
  '| `activePlanId` | `string` | Collection (auto) | Active nutrition plan ID |',
  '| `activeWorkoutPlanId` | `string` | Collection (auto) | Active workout plan ID |',
  '| `sampleMealId` | `string (UUID)` | Collection (auto) | First meal ID from today\'s active plan |',
  '| `sampleAltTemplateId` | `string` | Collection (auto) | Alternative meal template ID |',
  '| `sampleFoodEntryId` | `string (UUID)` | Collection (auto) | Last created food entry ID |',
  '| `sampleDayIndex` | `integer (0..6)` | Collection (auto) | Workout weekday index (`0=Sun .. 6=Sat`) |',
  '| `sampleExerciseId` | `string` | Collection (auto) | Exercise ID in the active workout plan |',
  '| `sampleAltExerciseId` | `string` | Collection (auto) | Validated alternative exercise ID |',
  '| `sampleRescheduleDate` | `string (YYYY-MM-DD)` | Collection (auto) | Next available rest date within 13 days |',
  '| `sampleProposalId` | `string (UUID)` | Collection (auto) | Active pending adaptation proposal ID |',
  '| `sampleCaseId` | `string` | Collection (auto) | Active coaching agreement/case ID |',
  '| `sampleFoodId` | `string` | Collection (auto) | Food item ID from `/v1/foods` |',
  '| `sampleCatalogExerciseId` | `string (URL-encoded)` | Collection (auto) | Exercise catalog ID from `/v1/exercises` |',
  '| `nextSeqCursor` | `integer` | Collection (auto) | Incremental outbox sequence cursor for `/v1/sync/changes` |',
  '| `anonymousUserId` | `string` | Collection | Anonymous `anon:...` ID for `/v1/auth/claim-anonymous` |'
].join('\n');

function buildEndpointMarkdown({ method, path, summary, noAuth, headers, optionalHeaders, pathParams, queryParams, fields, responseFields, errors, rawBody }) {
  const lines = [];
  if (summary) {
    lines.push(summary, '');
  }
  lines.push('### Endpoint Info');
  lines.push(`- **Method:** \`${method}\``);
  lines.push(`- **URL:** \`{{baseUrl}}${path}\``);
  lines.push(`- **Cloud Dev URL:** \`${CLOUD_DEV_URL}${path}\``);
  lines.push(`- **Production URL:** \`${PROD_URL}${path}\``);
  lines.push(`- **Local Dev URL:** \`${LOCAL_DEV_URL}${path}\``);
  lines.push(`- **Auth:** ${noAuth ? 'Public (`No Auth`)' : 'Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)'}`);
  lines.push('');

  const allHeaders = [...(headers || []), ...(optionalHeaders || [])];
  if (allHeaders.length) {
    lines.push('### Headers');
    lines.push('| Header | Type | Required | Description |');
    lines.push('| :--- | :--- | :---: | :--- |');
    for (const h of allHeaders) {
      lines.push(`| \`${h.key}\` | \`string\` | ${h.required === false ? 'No' : 'Yes'} | ${h.description || h.value} |`);
    }
    lines.push('');
  }

  if (pathParams?.length) {
    lines.push('### Path Parameters');
    lines.push('| Parameter | Type | Required | Description |');
    lines.push('| :--- | :--- | :---: | :--- |');
    for (const p of pathParams) {
      lines.push(`| \`${p.key}\` | \`${p.type}\` | ${p.required === false ? 'No' : 'Yes'} | ${p.description} |`);
    }
    lines.push('');
  }

  if (queryParams?.length) {
    lines.push('### Query Parameters');
    lines.push('| Parameter | Type | Required | Constraints / Default | Description |');
    lines.push('| :--- | :--- | :---: | :--- | :--- |');
    for (const q of queryParams) {
      lines.push(`| \`${q.key}\` | \`${q.type}\` | ${q.required ? 'Yes' : 'No'} | ${q.constraints || '—'} | ${q.description} |`);
    }
    lines.push('');
  }

  if (fields?.length) {
    lines.push('### Request Body Fields');
    lines.push('| Field | Type | Required | Constraints / Allowed Values | Description |');
    lines.push('| :--- | :--- | :---: | :--- | :--- |');
    for (const f of fields) {
      lines.push(`| \`${f.name}\` | \`${f.type}\` | ${f.required ? 'Yes' : 'No'} | ${f.constraints || '—'} | ${f.description} |`);
    }
    lines.push('');
  }

  if (rawBody) {
    lines.push('### Request Body Example');
    lines.push('```json', rawBody, '```', '');
  }

  if (responseFields?.length) {
    lines.push('### Response Fields');
    lines.push('| Field | Type | Description |');
    lines.push('| :--- | :--- | :--- |');
    for (const rf of responseFields) {
      lines.push(`| \`${rf.name}\` | \`${rf.type}\` | ${rf.description} |`);
    }
    lines.push('');
  }

  if (errors?.length) {
    lines.push('### Possible Error Responses');
    lines.push('| HTTP Status | Error Code | When |');
    lines.push('| :---: | :--- | :--- |');
    for (const e of errors) {
      lines.push(`| \`${e.status}\` | \`${e.code}\` | ${e.description} |`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

function parseUrl(rawPath) {
  const [pathOnly, queryStr] = rawPath.split('?');
  const pathSegments = pathOnly.replace(/^\//, '').split('/').filter(Boolean);
  const query = queryStr
    ? queryStr.split('&').map(pair => {
        const [key, ...rest] = pair.split('=');
        return { key, value: rest.join('=') };
      })
    : undefined;
  return {
    raw: `{{baseUrl}}${rawPath}`,
    host: ['{{baseUrl}}'],
    path: pathSegments,
    ...(query ? { query } : {})
  };
}

function wrapEnvelopeBody(ex) {
  if (typeof ex.body === 'string') return ex.body;
  const b = ex.body;
  if (b && typeof b === 'object' && 'meta' in b && ('data' in b || 'error' in b)) {
    return JSON.stringify(b, null, 2);
  }
  const envelope = {
    ok: true,
    data: b,
    meta: {
      requestId: 'req-uuid',
      serverTime: '2026-11-21T12:30:00.000Z',
      ...(b && typeof b === 'object' && typeof b.revision === 'number' ? { revision: b.revision } : {})
    }
  };
  return JSON.stringify(envelope, null, 2);
}

function makeSavedResponses(requestObj, examples = []) {
  const { description: _omitDesc, ...compactOriginalRequest } = requestObj;
  return examples.map(ex => ({
    name: ex.name,
    originalRequest: compactOriginalRequest,
    status: ex.status || (ex.code === 201 ? 'Created' : ex.code === 401 ? 'Unauthorized' : ex.code === 409 ? 'Conflict' : 'OK'),
    code: ex.code || 200,
    _postman_previewlanguage: 'json',
    header: [
      { key: 'Content-Type', value: 'application/json; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-store' }
    ],
    body: wrapEnvelopeBody(ex)
  }));
}

function req({
  name,
  method = 'GET',
  path,
  summary = '',
  headers = [],
  optionalHeaders = [],
  pathParams = [],
  queryParams = [],
  fields = [],
  responseFields = [],
  errors = [],
  examples = [],
  body = undefined,
  noAuth = false,
  testScript = null,
  prerequestScript = null
}) {
  const finalHeaders = headers.map(h => ({ ...h }));
  if (body !== undefined && !finalHeaders.some(h => h.key.toLowerCase() === 'content-type')) {
    finalHeaders.unshift({ key: 'Content-Type', value: 'application/json', description: 'Must be application/json' });
  }
  if (!finalHeaders.some(h => h.key.toLowerCase() === 'accept')) {
    finalHeaders.push({ key: 'Accept', value: 'application/json', description: 'JSON response format' });
  }

  const rawBody = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body, null, 2)) : undefined;
  const fullDesc = buildEndpointMarkdown({
    method,
    path,
    summary,
    noAuth,
    headers: finalHeaders,
    optionalHeaders,
    pathParams,
    queryParams,
    fields,
    responseFields,
    errors,
    rawBody
  });

  const event = [];
  if (prerequestScript) {
    event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: prerequestScript } });
  }
  if (testScript) {
    event.push({ listen: 'test', script: { type: 'text/javascript', exec: testScript } });
  }

  const requestObj = {
    ...(noAuth ? { auth: { type: 'noauth' } } : {}),
    method,
    header: finalHeaders.map(({ key, value, description }) => ({
      key,
      value,
      ...(description ? { description } : {})
    })),
    ...(rawBody !== undefined
      ? {
          body: {
            mode: 'raw',
            raw: rawBody,
            options: { raw: { language: 'json' } }
          }
        }
      : {}),
    url: parseUrl(path),
    description: fullDesc
  };

  return {
    name,
    ...(event.length ? { event } : {}),
    request: requestObj,
    response: makeSavedResponses(requestObj, examples)
  };
}

const DEFAULT_RECEIPT_EXAMPLE = action => ({
  name: `200 OK — ${action} Receipt`,
  code: 200,
  status: 'OK',
  body: {
    revision: 2,
    serverNow: '2026-11-21T12:30:00.000Z',
    serverDate: '2026-11-21',
    timezone: 'Africa/Cairo',
    commandReceipt: { revision: 2, action, replayed: false, at: '2026-11-21T12:30:00.000Z' },
    affected: [{ entityType: action, entityId: 'example-id', op: 'upsert', payload: {} }]
  }
});

const CONFLICT_EXAMPLE = {
  name: '409 Conflict — Stale Revision',
  code: 409,
  status: 'Conflict',
  body: {
    ok: false,
    error: {
      code: 'REVISION_CONFLICT',
      message: 'Account was updated; refresh and try again.',
      params: {
        expectedRevision: 4,
        serverRevision: 5
      },
      fieldErrors: [],
      retryable: false,
      details: {
        currentRevision: 5,
        mergeHints: {
          expectedRevision: 4,
          serverRevision: 5,
          syncChangesEndpoint: '/v1/sync/changes?after=4',
          resolutionPolicy: 'fetch_sync_deltas_then_rebase_or_retry'
        }
      }
    },
    meta: {
      requestId: 'req-uuid',
      serverTime: '2026-11-21T12:30:00.000Z'
    }
  }
};

function cmdReq({
  name,
  action,
  payload,
  view = 'receipt',
  summary = '',
  payloadFields = [],
  responseFields = [],
  errors = [],
  examples = null,
  extraTests = []
}) {
  const params = [];
  const queryMeta = [];
  if (view) {
    params.push(`view=${view}`);
    queryMeta.push({ key: 'view', type: 'string (enum)', required: false, constraints: 'receipt | minimal | delta | full', description: 'Response verbosity; receipt returns compact <2KB delta.' });
  }
  const qs = params.length ? `?${params.join('&')}` : '';
  const rawBody = JSON.stringify({ revision: '__REV__', action, payload }, null, 2)
    .replace('"__REV__"', '{{revision}}')
    .replace(/"__DAY_IDX__"/g, '{{sampleDayIndex}}');

  const allFields = [
    { name: 'revision', type: 'integer', required: true, constraints: '>= 0 (must match server revision)', description: 'Current optimistic-concurrency account revision.' },
    { name: 'action', type: 'string (const)', required: true, constraints: `"${action}"`, description: 'Domain command action identifier.' },
    { name: 'payload', type: 'object', required: true, constraints: 'JSON object', description: `Action-specific payload for \`${action}\`.` },
    ...payloadFields.map(f => ({ ...f, name: `payload.${f.name}` }))
  ];

  const defaultRespFields = responseFields.length
    ? responseFields
    : [
        { name: 'ok', type: 'boolean', description: '`true` when committed or idempotently replayed.' },
        { name: 'revision', type: 'integer', description: 'New monotonic account revision.' },
        { name: 'serverNow', type: 'string (ISO-8601 UTC)', description: 'Current server timestamp.' },
        { name: 'serverDate', type: 'string (YYYY-MM-DD)', description: 'User-local calendar date.' },
        { name: 'commandReceipt', type: 'object', description: '`{ revision, action, replayed, at }` receipt metadata.' },
        { name: 'affected', type: 'Array<object>', description: 'Entity deltas `{ entityType, entityId, op, payload }`.' }
      ];

  const allErrors = [
    { status: 400, code: 'VALIDATION_ERROR', description: 'Invalid payload values, business rule violation, or missing Idempotency-Key.' },
    { status: 401, code: 'UNAUTHENTICATED', description: 'Missing, expired, or revoked Bearer JWT.' },
    { status: 409, code: 'REVISION_CONFLICT', description: 'Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`.' },
    { status: 409, code: 'IDEMPOTENCY_KEY_REUSED_MISMATCH', description: 'Same Idempotency-Key sent with different JSON body.' },
    ...errors
  ];

  return req({
    name,
    method: 'POST',
    path: `/v1/commands${qs}`,
    summary,
    headers: [
      { key: 'Idempotency-Key', value: '{{idempotencyKey}}', required: true, description: 'Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script.' },
      { key: 'X-Client-Platform', value: '{{clientPlatform}}', required: false, description: 'Client platform: android | ios | web.' },
      { key: 'X-Client-Version', value: '{{clientVersion}}', required: false, description: 'Client app semantic version (e.g. 1.0.0).' }
    ],
    queryParams: queryMeta,
    fields: allFields,
    responseFields: defaultRespFields,
    errors: allErrors,
    examples: examples || [DEFAULT_RECEIPT_EXAMPLE(action), CONFLICT_EXAMPLE],
    body: rawBody,
    testScript: [
      'pm.test("Command succeeded (HTTP 200)", function () {',
      '  pm.response.to.have.status(200);',
      '});',
      ...extraTests
    ]
  });
}

const COLLECTION_PREREQUEST = [
  '// Auto-generate a unique Idempotency-Key for every write request',
  'pm.variables.set("idempotencyKey", pm.variables.replaceIn("{{$guid}}"));',
  'if (!pm.environment.get("todayDate") && !pm.collectionVariables.get("todayDate")) {',
  '  pm.collectionVariables.set("todayDate", new Date().toISOString().slice(0, 10));',
  '}'
];

const COLLECTION_TEST = [
  '// Auto-sync revision, serverDate, and ETag across requests',
  'const etagHeader = pm.response.headers.get("ETag");',
  'if (etagHeader) pm.collectionVariables.set("lastEtag", etagHeader);',
  'if (pm.response.code >= 200 && pm.response.code < 300) {',
  '  try {',
  '    const res = pm.response.json();',
  '    const data = res && res.ok === true && res.data !== undefined ? res.data : res;',
  '    const metaRev = res && res.meta && typeof res.meta.revision === "number" ? res.meta.revision : null;',
  '    if (typeof data.revision === "number") {',
  '      pm.collectionVariables.set("revision", String(data.revision));',
  '    } else if (metaRev !== null) {',
  '      pm.collectionVariables.set("revision", String(metaRev));',
  '    }',
  '    if (typeof data.serverDate === "string") {',
  '      pm.collectionVariables.set("todayDate", data.serverDate);',
  '    }',
  '    if (Array.isArray(data.pendingAdaptations) && data.pendingAdaptations.length) {',
  '      pm.collectionVariables.set("sampleProposalId", data.pendingAdaptations[0].id);',
  '    }',
  '    if (Array.isArray(data.adaptations)) {',
  '      const pending = data.adaptations.find(a => a.status === "pending");',
  '      if (pending) pm.collectionVariables.set("sampleProposalId", pending.id);',
  '    }',
  '  } catch (e) {}',
  '}'
];

const SAVE_AUTH_TOKENS_TEST = [
  'pm.test("Auth token pair returned", function () {',
  '  pm.expect([200, 201]).to.include(pm.response.code);',
  '  const res = pm.response.json();',
  '  pm.expect(res.ok).to.eql(true);',
  '  const d = res.data || res;',
  '  pm.expect(d.accessToken).to.be.a("string");',
  '  pm.expect(d.refreshToken).to.be.a("string");',
  '  pm.collectionVariables.set("accessToken", d.accessToken);',
  '  pm.collectionVariables.set("refreshToken", d.refreshToken);',
  '  pm.collectionVariables.set("sessionId", d.sessionId);',
  '  if (d.user && d.user.userId) pm.collectionVariables.set("userId", d.user.userId);',
  '});'
];

const CAPTURE_STATE_IDS_TEST = [
  'try {',
  '  const res = pm.response.json();',
  '  const d = res && res.ok === true && res.data !== undefined ? res.data : res;',
  '  const plan = d.activePlan || (Array.isArray(d.plans) ? d.plans[0] : null);',
  '  if (plan && plan.id) pm.collectionVariables.set("activePlanId", plan.id);',
  '  if (d.activeNutritionPlanRef && d.activeNutritionPlanRef.id) pm.collectionVariables.set("activePlanId", d.activeNutritionPlanRef.id);',
  '  if (plan && Array.isArray(plan.days) && plan.days.length) {',
  '    const today = d.serverDate || plan.days[0].date;',
  '    const dayObj = plan.days.find(x => x.date === today) || plan.days[0];',
  '    if (dayObj && Array.isArray(dayObj.meals) && dayObj.meals.length) {',
  '      pm.collectionVariables.set("sampleMealId", dayObj.meals[0].id);',
  '    }',
  '  }',
  '  const wp = d.workoutPlan;',
  '  if (wp && wp.id) pm.collectionVariables.set("activeWorkoutPlanId", wp.id);',
  '  if (d.activeWorkoutPlanRef && d.activeWorkoutPlanRef.id) pm.collectionVariables.set("activeWorkoutPlanId", d.activeWorkoutPlanRef.id);',
  '  if (wp && Array.isArray(wp.days) && wp.days.length) {',
  '    const firstDay = wp.days[0];',
  '    pm.collectionVariables.set("sampleDayIndex", String(firstDay.dayIndex));',
  '    if (Array.isArray(firstDay.exercises) && firstDay.exercises.length) {',
  '      pm.collectionVariables.set("sampleExerciseId", firstDay.exercises[0].id);',
  '    }',
  '    const workoutDays = new Set(wp.days.map(x => x.dayIndex));',
  '    const base = new Date((d.serverDate || pm.collectionVariables.get("todayDate")) + "T12:00:00Z");',
  '    for (let i = 1; i <= 13; i++) {',
  '      const dt = new Date(base.getTime() + i * 86400000);',
  '      if (!workoutDays.has(dt.getUTCDay())) {',
  '        pm.collectionVariables.set("sampleRescheduleDate", dt.toISOString().slice(0, 10));',
  '        break;',
  '      }',
  '    }',
  '  }',
  '  if (Array.isArray(d.foodEntries) && d.foodEntries.length) {',
  '    pm.collectionVariables.set("sampleFoodEntryId", d.foodEntries[d.foodEntries.length - 1].id);',
  '  }',
  '  if (Array.isArray(d.coachingCases) && d.coachingCases.length) {',
  '    pm.collectionVariables.set("sampleCaseId", d.coachingCases[d.coachingCases.length - 1].id);',
  '  }',
  '} catch (e) {}'
];

const AUTH_RESPONSE_FIELDS = [
  { name: 'tokenType', type: 'string (const)', description: 'Always `"Bearer"`.' },
  { name: 'accessToken', type: 'string (JWT)', description: 'HS256 signed JWT for `Authorization: Bearer <token>`.' },
  { name: 'expiresIn', type: 'integer (seconds)', description: 'Access token TTL in seconds (default `900`).' },
  { name: 'expiresAt', type: 'string (ISO-8601 UTC)', description: 'Access token expiration timestamp.' },
  { name: 'refreshToken', type: 'string', description: 'Opaque rotating refresh token (`cfrt_...`). Store securely on device.' },
  { name: 'refreshExpiresIn', type: 'integer (seconds)', description: 'Refresh token TTL in seconds (default `2592000` = 30 days).' },
  { name: 'refreshExpiresAt', type: 'string (ISO-8601 UTC)', description: 'Refresh token expiration timestamp.' },
  { name: 'sessionId', type: 'string', description: 'Server D1 session ID (`sess_<uuid>`).' },
  { name: 'user', type: 'object', description: '`{ userId, email, name, entitlement, createdAt }`.' }
];

const AUTH_TOKEN_EXAMPLE = (code = 200) => ({
  name: `${code} ${code === 201 ? 'Created' : 'OK'} — Token Pair`,
  code,
  status: code === 201 ? 'Created' : 'OK',
  body: {
    tokenType: 'Bearer',
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature',
    expiresIn: 900,
    expiresAt: '2026-11-21T12:45:00.000Z',
    refreshToken: 'cfrt_example_opaque_refresh_token_32bytes',
    refreshExpiresIn: 2592000,
    refreshExpiresAt: '2026-12-21T12:30:00.000Z',
    sessionId: 'sess_8c7b1e3a-2b4d-4c8f-a1b2-3c4d5e6f7a8b',
    user: {
      userId: 'user:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
      email: 'demo.user@curafit.app',
      name: 'Ahmed Mohamed',
      entitlement: 'free',
      createdAt: '2026-11-21T12:30:00.000Z'
    }
  }
});

const PAGINATION_QUERY_PARAMS = [
  { key: 'from', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Optional start date', description: 'Filter logs with `date >= from`.' },
  { key: 'to', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Optional end date', description: 'Filter logs with `date <= to`.' },
  { key: 'offset', type: 'integer', required: false, constraints: '>= 0, default 0', description: 'Zero-based pagination offset.' },
  { key: 'limit', type: 'integer', required: false, constraints: '1..100, default 30', description: 'Maximum records returned per page.' }
];

const PAGINATION_RESPONSE_FIELDS = [
  { name: 'total', type: 'integer', description: 'Total matching records.' },
  { name: 'offset', type: 'integer', description: 'Current offset.' },
  { name: 'limit', type: 'integer', description: 'Page size.' },
  { name: 'nextOffset', type: 'integer | null', description: 'Next page offset, or `null` if on the last page.' },
  { name: 'items', type: 'Array<object>', description: 'Page records ordered by date descending.' }
];

const collection = {
  info: {
    _postman_id: '7c94f8e1-4c9a-4f3b-9b5a-2e8d6a1f0c31',
    name: 'CuraFit API v1',
    description: COLLECTION_OVERVIEW_MD,
    schema: SCHEMA_V21
  },
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }]
  },
  event: [
    { listen: 'prerequest', script: { type: 'text/javascript', exec: COLLECTION_PREREQUEST } },
    { listen: 'test', script: { type: 'text/javascript', exec: COLLECTION_TEST } }
  ],
  variable: [
    { key: 'baseUrl', value: CLOUD_DEV_URL },
    { key: 'testEmail', value: 'demo.user@curafit.app' },
    { key: 'testPassword', value: 'CuraFit#2026!' },
    { key: 'testNewPassword', value: 'CuraFit#2027!' },
    { key: 'accessToken', value: '' },
    { key: 'refreshToken', value: '' },
    { key: 'sessionId', value: '' },
    { key: 'userId', value: '' },
    { key: 'deviceId', value: 'postman-client-01' },
    { key: 'clientPlatform', value: 'android' },
    { key: 'clientVersion', value: '1.0.0' },
    { key: 'revision', value: '0' },
    { key: 'todayDate', value: '' },
    { key: 'lastEtag', value: '' },
    { key: 'activePlanId', value: '' },
    { key: 'activeWorkoutPlanId', value: '' },
    { key: 'sampleMealId', value: '' },
    { key: 'sampleAltTemplateId', value: '' },
    { key: 'sampleFoodEntryId', value: '' },
    { key: 'sampleDayIndex', value: '1' },
    { key: 'sampleExerciseId', value: '' },
    { key: 'sampleAltExerciseId', value: '' },
    { key: 'sampleRescheduleDate', value: '' },
    { key: 'sampleProposalId', value: '' },
    { key: 'sampleCaseId', value: '' },
    { key: 'sampleFoodId', value: '' },
    { key: 'sampleCatalogExerciseId', value: '' },
    { key: 'nextSeqCursor', value: '0' },
    { key: 'anonymousUserId', value: '' }
  ],
  item: [
    {
      id: 'f0000001-0000-4000-8000-000000000001',
      name: '01. System & Health',
      description: 'Public liveness probe and runtime capability manifest. No authentication required.',
      item: [
        req({
          name: 'Health Check',
          method: 'GET',
          path: '/v1/health',
          noAuth: true,
          summary: 'Public health probe returning API version, engine version, and trace `requestId`.',
          responseFields: [
            { name: 'status', type: 'string', description: '`"ok"` when Worker is healthy.' },
            { name: 'apiVersion', type: 'string', description: 'API major version (`"1"`).' },
            { name: 'engineVersion', type: 'string', description: 'Backend engine semver (e.g. `"0.13.0"`).' },
            { name: 'requestId', type: 'string (UUID)', description: 'Request trace ID.' }
          ],
          examples: [{ name: '200 OK — Healthy', code: 200, body: { status: 'ok', apiVersion: '1', engineVersion: '0.13.0', requestId: 'req-uuid' } }],
          testScript: [
            'pm.test("Service is healthy", function () {',
            '  pm.response.to.have.status(200);',
            '  const r = pm.response.json();',
            '  pm.expect(r.ok).to.eql(true);',
            '  pm.expect((r.data || r).status).to.eql("ok");',
            '});'
          ]
        }),
        req({
          name: 'Capabilities Manifest',
          method: 'GET',
          path: '/v1/capabilities',
          noAuth: true,
          summary: 'Returns API/schema/catalog versions, enabled feature flags, and native Cloudflare D1 authentication status.',
          responseFields: [
            { name: 'apiVersion', type: 'string', description: 'API version (`"1"`).' },
            { name: 'schemaVersion', type: 'integer', description: 'Account storage schema version (`3`).' },
            { name: 'engineVersion', type: 'string', description: 'Coaching engine version.' },
            { name: 'catalogVersion', type: 'string', description: 'Pinned OpenExerciseDB version.' },
            { name: 'foodCatalogVersion', type: 'string', description: 'Pinned Egyptian/Gulf food catalog version.' },
            { name: 'serverTime', type: 'string (ISO-8601 UTC)', description: 'Current edge server UTC time.' },
            { name: 'auth', type: 'object', description: '`{ provider: "cloudflare_d1_native", configured: boolean }`.' },
            { name: 'features', type: 'Array<string>', description: 'Enabled backend feature flags.' }
          ],
          examples: [{
            name: '200 OK — Capabilities',
            code: 200,
            body: {
              apiVersion: '1', schemaVersion: 3, engineVersion: '0.13.0',
              catalogVersion: '202610112340', foodCatalogVersion: '0.6.0-data.4',
              serverTime: '2026-11-21T12:30:00.000Z',
              auth: { provider: 'cloudflare_d1_native', configured: true },
              features: ['adaptive_nutrition', 'adaptive_workouts', 'native_cloudflare_auth', 'kmm_bootstrap', 'offline_sync_v2']
            }
          }],
          testScript: [
            'pm.test("Capabilities returned", function () {',
            '  pm.response.to.have.status(200);',
            '  const res = pm.response.json();',
            '  const d = res.data || res;',
            '  pm.expect(d.apiVersion).to.eql("1");',
            '  pm.expect(d.features).to.include("native_cloudflare_auth");',
            '});'
          ]
        })
      ]
    },
    {
      id: 'f0000002-0000-4000-8000-000000000002',
      name: '02. Authentication (Cloudflare Native D1)',
      description: 'First-party authentication on Cloudflare Workers + D1 using WebCrypto PBKDF2-SHA256 passwords, HS256 Access JWTs (15 min), and rotating D1 Refresh Tokens (30 days) with replay reuse detection.',
      item: [
        req({
          name: 'Register User',
          method: 'POST',
          path: '/v1/auth/register',
          noAuth: true,
          summary: 'Registers a new user in Cloudflare D1 (`coaching_users`), creates a session, and issues an Access JWT + Refresh Token pair. Auto-saves tokens in Postman.',
          fields: [
            { name: 'email', type: 'string (email)', required: true, constraints: 'Trimmed, lowercased, max 160 chars, unique', description: 'User email address.' },
            { name: 'password', type: 'string', required: true, constraints: '8..128 chars', description: 'Plaintext password (hashed via PBKDF2-SHA256 100k iterations).' },
            { name: 'name', type: 'string', required: false, constraints: 'max 100 chars', description: 'Optional display name.' },
            { name: 'deviceId', type: 'string', required: false, constraints: 'max 120 chars', description: 'Optional client device identifier.' }
          ],
          responseFields: AUTH_RESPONSE_FIELDS,
          errors: [
            { status: 400, code: 'INVALID_EMAIL / INVALID_PASSWORD', description: 'Malformed email or password shorter than 8 chars.' },
            { status: 409, code: 'AUTH_EMAIL_ALREADY_EXISTS', description: 'Email is already registered.' },
            { status: 429, code: 'RATE_LIMITED', description: 'Auth endpoint rate limit exceeded (30 req/min/IP).' }
          ],
          examples: [AUTH_TOKEN_EXAMPLE(201)],
          body: { email: '{{testEmail}}', password: '{{testPassword}}', name: 'Ahmed Mohamed', deviceId: '{{deviceId}}' },
          testScript: [
            ...SAVE_AUTH_TOKENS_TEST,
            'if (pm.response.code === 201) {',
            '  pm.collectionVariables.set("revision", "0");',
            '}'
          ]
        }),
        req({
          name: 'Login User',
          method: 'POST',
          path: '/v1/auth/login',
          noAuth: true,
          summary: 'Authenticates an existing user via email & password using constant-time PBKDF2 verification and returns a new Access JWT + Refresh Token.',
          fields: [
            { name: 'email', type: 'string (email)', required: true, constraints: 'max 160 chars', description: 'Registered email.' },
            { name: 'password', type: 'string', required: true, constraints: '1..128 chars', description: 'Account password.' },
            { name: 'deviceId', type: 'string', required: false, constraints: 'max 120 chars', description: 'Optional device ID.' }
          ],
          responseFields: AUTH_RESPONSE_FIELDS,
          errors: [
            { status: 401, code: 'AUTH_INVALID_CREDENTIALS', description: 'Email not found or password mismatch.' },
            { status: 401, code: 'ACCOUNT_DELETED', description: 'Account was permanently erased via GDPR deletion.' }
          ],
          examples: [AUTH_TOKEN_EXAMPLE(200)],
          body: { email: '{{testEmail}}', password: '{{testPassword}}', deviceId: '{{deviceId}}' },
          testScript: SAVE_AUTH_TOKENS_TEST
        }),
        req({
          name: 'Refresh Access Token (Rotates Refresh Token)',
          method: 'POST',
          path: '/v1/auth/refresh',
          noAuth: true,
          summary: 'Exchanges a valid `refreshToken` for a fresh Access JWT and a newly rotated `refreshToken`. Replaying an already-rotated token immediately revokes the entire session.',
          fields: [
            { name: 'refreshToken', type: 'string', required: true, constraints: '20..256 chars (`cfrt_...`)', description: 'Current unrotated refresh token.' },
            { name: 'deviceId', type: 'string', required: false, constraints: 'max 120 chars', description: 'Optional device ID override.' }
          ],
          responseFields: AUTH_RESPONSE_FIELDS,
          errors: [
            { status: 401, code: 'AUTH_REFRESH_TOKEN_INVALID', description: 'Token unrecognized.' },
            { status: 401, code: 'AUTH_REFRESH_TOKEN_REUSED', description: 'Token was already rotated; entire session revoked for security.' },
            { status: 401, code: 'AUTH_REFRESH_TOKEN_EXPIRED', description: '30-day refresh TTL elapsed; login required.' }
          ],
          examples: [AUTH_TOKEN_EXAMPLE(200)],
          body: { refreshToken: '{{refreshToken}}', deviceId: '{{deviceId}}' },
          testScript: SAVE_AUTH_TOKENS_TEST
        }),
        req({
          name: 'Inspect Current Session',
          method: 'GET',
          path: '/v1/auth/session',
          summary: 'Returns authenticated caller identity, session ID, auth method, scopes, entitlement tier, and JWT timestamps.',
          responseFields: [
            { name: 'userId', type: 'string', description: 'Internal user ID (`user:<uuid>` or `anon:<hash>`).' },
            { name: 'subject', type: 'string', description: 'JWT `sub` claim.' },
            { name: 'sessionId', type: 'string', description: 'Active session ID.' },
            { name: 'deviceId', type: 'string | null', description: 'Bound device ID.' },
            { name: 'authMethod', type: 'string (enum)', description: '`bearer_jwt` | `anonymous_cookie` | `platform_header`.' },
            { name: 'isAnonymous', type: 'boolean', description: '`false` for registered JWT users.' },
            { name: 'scopes', type: 'Array<string>', description: 'Granted scopes (`["coach:read","coach:write"]`).' },
            { name: 'entitlement', type: 'string (enum)', description: '`free` | `premium`.' },
            { name: 'issuedAt', type: 'string (ISO-8601) | null', description: 'JWT `iat` timestamp.' },
            { name: 'expiresAt', type: 'string (ISO-8601) | null', description: 'JWT `exp` timestamp.' }
          ],
          examples: [{ name: '200 OK — Session Info', code: 200, body: { userId: 'user:1a2b', subject: 'user:1a2b', sessionId: 'sess_123', deviceId: 'postman-prod-01', authMethod: 'bearer_jwt', isAnonymous: false, scopes: ['coach:read', 'coach:write'], entitlement: 'free', issuedAt: '2026-11-21T12:30:00.000Z', expiresAt: '2026-11-21T12:45:00.000Z' } }],
          testScript: [
            'pm.test("Session active", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json().data || pm.response.json();',
            '  pm.expect(d.userId).to.be.a("string");',
            '});'
          ]
        }),
        req({
          name: 'Change Password',
          method: 'POST',
          path: '/v1/auth/change-password',
          summary: 'Verifies `currentPassword`, updates the PBKDF2-SHA256 hash in D1, and optionally revokes all other device sessions.',
          fields: [
            { name: 'currentPassword', type: 'string', required: true, constraints: 'Non-empty string', description: 'Existing account password.' },
            { name: 'newPassword', type: 'string', required: true, constraints: '8..128 chars, must differ from current', description: 'New account password.' },
            { name: 'revokeOtherSessions', type: 'boolean', required: false, constraints: 'default: true', description: 'If `true`, revokes all other devices while keeping current session active.' }
          ],
          responseFields: [
            { name: 'changed', type: 'boolean', description: '`true` on success.' },
            { name: 'revokedOtherSessions', type: 'boolean', description: 'Whether other sessions were invalidated.' },
            { name: 'updatedAt', type: 'string (ISO-8601 UTC)', description: 'Password update timestamp.' }
          ],
          errors: [
            { status: 400, code: 'PASSWORD_UNCHANGED', description: 'New password equals current password.' },
            { status: 401, code: 'AUTH_INVALID_CREDENTIALS', description: 'Current password is incorrect.' }
          ],
          examples: [{ name: '200 OK — Password Changed', code: 200, body: { changed: true, revokedOtherSessions: true, updatedAt: '2026-11-21T12:35:00.000Z' } }],
          body: { currentPassword: '{{testPassword}}', newPassword: '{{testNewPassword}}', revokeOtherSessions: true }
        }),
        req({
          name: 'Claim Anonymous Web Session',
          method: 'POST',
          path: '/v1/auth/claim-anonymous',
          summary: 'Atomically migrates an anonymous Web MVP trial account (`anon:...`) into the logged-in verified account. Requires owning `coach_uid` cookie + explicit `consent: true`.',
          fields: [
            { name: 'anonymousUserId', type: 'string', required: true, constraints: 'Must start with `anon:` and match cookie', description: 'Anonymous session userId from Web MVP.' },
            { name: 'consent', type: 'boolean', required: true, constraints: 'Must be `true`', description: 'Explicit user consent to merge data.' }
          ],
          responseFields: [
            { name: 'claimed', type: 'boolean', description: '`true` when migrated.' },
            { name: 'fromAnonymousId', type: 'string', description: 'Source anonymous ID.' },
            { name: 'toUserId', type: 'string', description: 'Destination verified user ID.' },
            { name: 'revision', type: 'integer', description: 'New target account revision.' }
          ],
          errors: [
            { status: 403, code: 'ANONYMOUS_OWNERSHIP_REQUIRED', description: 'Missing owning `coach_uid` cookie.' },
            { status: 409, code: 'ANONYMOUS_ALREADY_CLAIMED / TARGET_ACCOUNT_NOT_EMPTY', description: 'Already claimed or verified account already has a profile.' }
          ],
          examples: [{ name: '200 OK — Claimed', code: 200, body: { claimed: true, fromAnonymousId: 'anon:abc', toUserId: 'user:1a2b', revision: 3 } }],
          body: { anonymousUserId: '{{anonymousUserId}}', consent: true }
        }),
        req({
          name: 'Revoke Session (Current or All Devices)',
          method: 'POST',
          path: '/v1/auth/revoke',
          summary: 'Immediately revokes a specific `sessionId` or all sessions (`allDevices: true`) in D1, invalidating both Access JWTs and Refresh Tokens.',
          fields: [
            { name: 'sessionId', type: 'string', required: false, constraints: 'max 200 chars, cannot start with `__`', description: 'Session ID to revoke (defaults to current session).' },
            { name: 'allDevices', type: 'boolean', required: false, constraints: 'default: false', description: 'If `true`, revokes all sessions across every device.' }
          ],
          responseFields: [
            { name: 'revoked', type: 'boolean', description: '`true`.' },
            { name: 'sessionId', type: 'string', description: 'Revoked session ID or `"__all__"`.' },
            { name: 'revokedAt', type: 'string (ISO-8601 UTC)', description: 'Revocation timestamp.' }
          ],
          examples: [{ name: '200 OK — Revoked', code: 200, body: { revoked: true, sessionId: 'sess_123', revokedAt: '2026-11-21T12:35:00.000Z' } }],
          body: { sessionId: '{{sessionId}}', allDevices: false }
        }),
        req({
          name: 'Logout',
          method: 'POST',
          path: '/v1/auth/logout',
          summary: 'Logs out the current session (or all devices) and revokes associated refresh tokens in D1.',
          fields: [
            { name: 'allDevices', type: 'boolean', required: false, constraints: 'default: false', description: 'Set `true` to log out everywhere.' },
            { name: 'sessionId', type: 'string', required: false, constraints: 'Optional specific session', description: 'Defaults to active session.' }
          ],
          responseFields: [
            { name: 'loggedOut', type: 'boolean', description: '`true`.' },
            { name: 'sessionId', type: 'string', description: 'Revoked session ID or `"__all__"`.' },
            { name: 'allDevices', type: 'boolean', description: 'Whether all devices were logged out.' },
            { name: 'revokedAt', type: 'string (ISO-8601 UTC)', description: 'Logout timestamp.' }
          ],
          examples: [{ name: '200 OK — Logged Out', code: 200, body: { loggedOut: true, sessionId: 'sess_123', allDevices: false, revokedAt: '2026-11-21T12:36:00.000Z' } }],
          body: { allDevices: false }
        })
      ]
    },
    {
      id: 'f0000003-0000-4000-8000-000000000003',
      name: '03. Onboarding & Pre-Screening',
      description: 'Deterministic clinical/physiological pre-screening, initial 7-day nutrition & workout plan generation, legacy confirmations, and weekly plan renewal.',
      item: [
        req({
          name: 'Pre-Screening Eligibility Check',
          method: 'POST',
          path: '/v1/eligibility',
          summary: 'Fast deterministic pre-onboarding screening checking age (18..70), BMI boundaries (12.5..65), medical conditions, injuries, and maternal status before plan generation.',
          fields: [
            { name: 'age', type: 'integer', required: true, constraints: '18..70', description: 'User age in years.' },
            { name: 'sex', type: 'string (enum)', required: true, constraints: '`male` | `female`', description: 'Biological sex for BMR/energy calculation.' },
            { name: 'height', type: 'number', required: true, constraints: '120..230 (cm)', description: 'Height in centimeters.' },
            { name: 'weight', type: 'number', required: true, constraints: '35..250 (kg)', description: 'Current body weight in kg.' },
            { name: 'goal', type: 'string (enum)', required: true, constraints: '`lose` | `maintain` | `gain` | `muscle_gain`', description: 'Primary fitness/nutrition goal.' },
            { name: 'targetWeight', type: 'number | null', required: false, constraints: '35..250 (kg)', description: 'Optional target weight.' },
            { name: 'serviceTrack', type: 'string (enum)', required: false, constraints: '`nutrition_only` | `workouts_only` | `nutrition_and_workouts`', description: 'Selected coaching track.' },
            { name: 'diseases', type: 'Array<string>', required: false, constraints: 'Supported: `hypertension`, `insulin_resistance`, `pcos`, `ibs`, `cholesterol`, `gout`, `anemia`, `vitamin_d_deficiency`, `lactose_intolerance`, `favism`, `fatty_liver`', description: 'Declared wellness/medical conditions. Critical conditions (e.g. `diabetes`) return `requires_review`.' },
            { name: 'maternalStatus', type: 'string (enum)', required: false, constraints: '`none` | `pregnant` | `breastfeeding`', description: 'Non-`none` returns `requires_review`.' },
            { name: 'injuries', type: 'Array<string>', required: false, constraints: 'e.g. `knee_pain`, `lower_back_pain`, `shoulder_pain`', description: 'Declared joint discomforts/injuries.' }
          ],
          responseFields: [
            { name: 'status', type: 'string (enum)', description: '`eligible` | `needs_input` | `requires_review`.' },
            { name: 'reasons', type: 'Array<object>', description: 'Blocking clinical reasons when `requires_review`.' },
            { name: 'questions', type: 'Array<object>', description: 'Additional confirmation prompts when `needs_input`.' },
            { name: 'supportedAdaptations', type: 'object', description: '`{ diseases: string[], injuries: string[] }` handled automatically.' },
            { name: 'permittedFunctions', type: 'Array<string>', description: 'Allowed client features.' }
          ],
          examples: [{ name: '200 OK — Eligible', code: 200, body: { status: 'eligible', reviewScope: 'system_generated_screening_not_medical_diagnosis', reasons: [], questions: [], supportedAdaptations: { diseases: [], injuries: [] }, permittedFunctions: ['generate_plan', 'log_execution', 'adaptive_review'], clinicalSummary: null } }],
          body: { age: 29, sex: 'male', height: 178, weight: 82, goal: 'lose', targetWeight: 75, serviceTrack: 'nutrition_and_workouts', diseases: [], maternalStatus: 'none', injuries: [] },
          testScript: [
            'pm.test("Eligibility evaluated", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json().data || pm.response.json();',
            '  pm.expect(d.status).to.be.oneOf(["eligible", "needs_input", "requires_review"]);',
            '});'
          ]
        }),
        cmdReq({
          name: 'Generate Initial Plan (Full Response)',
          action: 'generate',
          view: 'full',
          summary: 'Creates the user profile, generates a personalized 7-day regional nutrition plan + adaptive workout program, and returns the full account state. Auto-captures `activePlanId`, `activeWorkoutPlanId`, `sampleMealId`, `sampleDayIndex`, and `sampleExerciseId`.',
          payloadFields: [
            { name: 'name', type: 'string', required: false, constraints: 'max 100 chars', description: 'Display name.' },
            { name: 'age', type: 'integer', required: true, constraints: '18..70', description: 'Age in years.' },
            { name: 'weight', type: 'number', required: true, constraints: '35..250 (kg)', description: 'Current weight in kg.' },
            { name: 'height', type: 'number', required: true, constraints: '120..230 (cm)', description: 'Height in cm.' },
            { name: 'sex', type: 'string (enum)', required: true, constraints: '`male` | `female`', description: 'Biological sex.' },
            { name: 'goal', type: 'string (enum)', required: true, constraints: '`lose` | `maintain` | `gain` | `muscle_gain`', description: 'Target goal.' },
            { name: 'targetWeight', type: 'number | null', required: false, constraints: '35..250 (kg)', description: 'Goal weight (optional).' },
            { name: 'goalPace', type: 'string (enum)', required: false, constraints: '`gentle` | `moderate` | `fast`', description: 'Calorie deficit/surplus pace.' },
            { name: 'serviceTrack', type: 'string (enum)', required: true, constraints: '`nutrition_only` | `workouts_only` | `nutrition_and_workouts`', description: 'Active coaching track.' },
            { name: 'dailyActivity', type: 'string (enum)', required: false, constraints: '`sedentary` | `light` | `moderate` | `active`', description: 'Non-exercise daily activity level.' },
            { name: 'dietType', type: 'string (enum)', required: false, constraints: '`balanced` | `high_protein` | `low_carb` | `keto` | `mediterranean` | `dash` | `vegetarian` | `vegan` | `intermittent_fasting`', description: 'Dietary pattern.' },
            { name: 'region', type: 'string (enum)', required: false, constraints: '`egypt` | `gulf` | `levant` | `maghreb`', description: 'Regional cuisine preference.' },
            { name: 'budget', type: 'string (enum)', required: false, constraints: '`economical` | `medium` | `flexible`', description: 'Meal budget tier.' },
            { name: 'mealsCount', type: 'integer', required: false, constraints: '2..5 (default 4)', description: 'Daily meal slots count.' },
            { name: 'selectedWorkoutDays', type: 'Array<integer>', required: false, constraints: 'Values `0..6` (`0=Sun .. 6=Sat`)', description: 'Weekly resistance training days.' },
            { name: 'workoutLocation', type: 'string (enum)', required: false, constraints: '`gym_only` | `home_only` | `hybrid`', description: 'Training location.' },
            { name: 'fitnessLevel', type: 'string (enum)', required: false, constraints: '`beginner` | `intermediate` | `advanced`', description: 'Resistance training experience.' },
            { name: 'sessionDuration', type: 'integer', required: false, constraints: '20..120 (minutes)', description: 'Target workout duration.' },
            { name: 'healthConfirmed', type: 'boolean', required: false, constraints: 'Required `true` for `workouts_only`', description: 'Explicit health clearance confirmation.' },
            { name: 'weekdayConvention', type: 'string (enum)', required: false, constraints: '`js_sunday_0` (recommended) | `saturday_0`', description: 'Weekday indexing convention.' }
          ],
          payload: {
            name: 'Ahmed Mohamed', age: 29, weight: 82, height: 178, sex: 'male', goal: 'lose',
            targetWeight: 75, goalPace: 'moderate', serviceTrack: 'nutrition_and_workouts',
            dailyActivity: 'light', dietType: 'balanced', region: 'egypt', budget: 'medium',
            mealsCount: 4, selectedWorkoutDays: [1, 3, 5], workoutLocation: 'gym_only',
            fitnessLevel: 'beginner', sessionDuration: 45, healthConfirmed: true,
            weekdayConvention: 'js_sunday_0'
          },
          extraTests: [CAPTURE_STATE_IDS_TEST.join('\n')]
        }),
        cmdReq({
          name: 'Confirm Health (Legacy Workouts-Only)',
          action: 'confirm_health',
          summary: 'Explicit health confirmation for legacy `workouts_only` accounts that have not yet confirmed medical readiness.',
          payloadFields: [
            { name: 'healthy', type: 'boolean', required: true, constraints: 'Must be `true`', description: 'Confirms no acute medical contraindication.' },
            { name: 'injuryFree', type: 'boolean', required: true, constraints: 'Must be `true`', description: 'Confirms no unmanaged acute injury.' }
          ],
          payload: { healthy: true, injuryFree: true }
        }),
        cmdReq({
          name: 'Confirm Schedule (Legacy Calendar Migration)',
          action: 'confirm_schedule',
          summary: 'Maps legacy workout day indexes to canonical `js_sunday_0` (`0=Sun .. 6=Sat`).',
          payloadFields: [
            { name: 'dayMap', type: 'Record<string, integer>', required: true, constraints: 'Distinct target values `0..6` for every existing workout day', description: 'Map of old dayIndex -> canonical dayIndex.' }
          ],
          payload: { dayMap: { '1': 1, '3': 3, '5': 5 } }
        }),
        cmdReq({
          name: 'Renew Weekly Nutrition Plan',
          action: 'renew_plan',
          summary: 'Generates the next 7-day nutrition plan after the active plan\'s end date has elapsed.',
          payloadFields: [],
          payload: {}
        })
      ]
    },
    {
      id: 'f0000004-0000-4000-8000-000000000004',
      name: '04. Account State & Bootstrap (KMM)',
      description: 'Mobile startup bootstrap (`< 10 KB`), full state aggregate, and 14-day progress analytics with ETag caching (`304 Not Modified`).',
      item: [
        req({
          name: 'Get Bootstrap (Lightweight KMM Startup)',
          method: 'GET',
          path: '/v1/bootstrap',
          summary: 'Lightweight mobile startup payload (`< 10 KB`) returning profile, preferences, active plan refs, `todaySummary`, pending adaptations, and `ETag`.',
          optionalHeaders: [{ key: 'If-None-Match', value: '{{lastEtag}}', required: false, description: 'Optional saved `ETag` to receive `304 Not Modified` when unchanged.' }],
          responseFields: [
            { name: 'schemaVersion', type: 'integer', description: 'Schema version (`3`).' },
            { name: 'revision', type: 'integer', description: 'Current optimistic-concurrency revision.' },
            { name: 'serverNow', type: 'string (ISO-8601 UTC)', description: 'Current server timestamp.' },
            { name: 'serverDate', type: 'string (YYYY-MM-DD)', description: 'User-local date.' },
            { name: 'timezone', type: 'string (IANA)', description: 'Configured user timezone.' },
            { name: 'profile', type: 'object | null', description: 'User profile (`null` before onboarding).' },
            { name: 'activeNutritionPlanRef', type: 'object | null', description: 'Reference to active nutrition plan.' },
            { name: 'activeWorkoutPlanRef', type: 'object | null', description: 'Reference to active workout plan.' },
            { name: 'todaySummary', type: 'object', description: 'Today\'s food, water, recovery, and session status.' },
            { name: 'pendingAdaptations', type: 'Array<object>', description: 'Unexpired pending adaptation proposals.' }
          ],
          examples: [{ name: '200 OK — Bootstrap', code: 200, body: { schemaVersion: 3, revision: 1, serverNow: '2026-11-21T12:30:00.000Z', serverDate: '2026-11-21', timezone: 'Africa/Cairo', profile: { name: 'Ahmed Mohamed', goal: 'lose', weight: 82 }, activeNutritionPlanRef: { id: 'plan-uuid' }, activeWorkoutPlanRef: { id: 'wp-uuid' }, todaySummary: {}, pendingAdaptations: [] } }],
          testScript: [
            'pm.test("Bootstrap loaded", function () {',
            '  pm.expect([200, 304]).to.include(pm.response.code);',
            '});',
            ...CAPTURE_STATE_IDS_TEST
          ]
        }),
        req({
          name: 'Get Full Account State',
          method: 'GET',
          path: '/v1/state',
          summary: 'Returns the complete account aggregate including active 7-day nutrition plan, workout plan, diary logs, recovery check-ins, and review history. Supports `If-None-Match` ETag.',
          optionalHeaders: [{ key: 'If-None-Match', value: '{{lastEtag}}', required: false, description: 'Optional saved `ETag`.' }],
          responseFields: [
            { name: 'revision', type: 'integer', description: 'Account revision.' },
            { name: 'profile', type: 'object | null', description: 'Saved onboarding profile.' },
            { name: 'activePlan', type: 'object | null', description: 'Full 7-day active nutrition plan.' },
            { name: 'workoutPlan', type: 'object | null', description: 'Full active workout plan.' },
            { name: 'foodEntries', type: 'Array<object>', description: 'Detailed food diary entries.' },
            { name: 'waterLogs', type: 'Array<object>', description: 'Daily hydration logs.' },
            { name: 'weights', type: 'Array<object>', description: 'Body weight log history.' },
            { name: 'lastReview', type: 'object | null', description: 'Most recent adaptive coaching review.' }
          ],
          testScript: [
            'pm.test("State loaded", function () {',
            '  pm.expect([200, 304]).to.include(pm.response.code);',
            '});',
            ...CAPTURE_STATE_IDS_TEST
          ]
        }),
        req({
          name: 'Get 14-Day Progress Summary',
          method: 'GET',
          path: '/v1/progress/summary',
          summary: 'Returns 14-day weight trend (7d vs previous 7d average), food completeness, hydration adherence, and workout progression insights.',
          responseFields: [
            { name: 'windowStart', type: 'string (YYYY-MM-DD)', description: 'Start of 14-day window.' },
            { name: 'windowEnd', type: 'string (YYYY-MM-DD)', description: 'Today (user-local).' },
            { name: 'weightTrend', type: 'object', description: '14d measurements count, 7d averages, weekly change %.' },
            { name: 'foodCompleteness', type: 'object', description: 'Complete diary days vs required 10/14.' },
            { name: 'hydration', type: 'object', description: 'Today cups/liters vs dynamic target & 14d adherence.' },
            { name: 'workoutSummary', type: 'object', description: 'Completed/partial/missed sessions and load progression.' }
          ],
          testScript: [
            'pm.test("Progress summary returned", function () {',
            '  pm.response.to.have.status(200);',
            '});'
          ]
        })
      ]
    },
    {
      id: 'f0000005-0000-4000-8000-000000000005',
      name: '05. Nutrition & Food Diary',
      description: 'Daily food diary summary, planned/ingredient/manual food logging, explicit completion confirmation, deletion, and validated meal substitutions.',
      item: [
        req({
          name: 'Get Food Diary for Date',
          method: 'GET',
          path: '/v1/food-diary?date={{todayDate}}',
          summary: 'Returns actual food entries, nullable nutrient totals, completion status, and planned energy target for a specific user-local date.',
          queryParams: [
            { key: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'User-local calendar date.' }
          ],
          responseFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', description: 'Diary date.' },
            { name: 'entries', type: 'Array<object>', description: 'Logged food entries for the date.' },
            { name: 'totals', type: 'object', description: 'Nullable summed macros `{ energy, protein, carbs, fat, fiber, sodium }`.' },
            { name: 'complete', type: 'boolean', description: 'Explicit user confirmation flag.' },
            { name: 'planEnergy', type: 'number | null', description: 'Planned energy target for that date.' }
          ]
        }),
        cmdReq({
          name: 'Log Planned Meal (food_entry — planned)',
          action: 'food_entry',
          summary: 'Logs consumption of a planned meal from the active nutrition plan. Reopens day completion until explicitly confirmed via `food_complete`.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Within past 90 days up to today', description: 'Log date.' },
            { name: 'source', type: 'string (const)', required: true, constraints: '"planned"', description: 'Planned meal entry source.' },
            { name: 'mealId', type: 'string (UUID)', required: true, constraints: 'Must exist in active plan', description: 'Planned meal ID.' },
            { name: 'slot', type: 'string (enum)', required: true, constraints: '`breakfast` | `lunch` | `dinner` | `snack` | `snack1` | `snack2`', description: 'Meal slot.' },
            { name: 'quantity', type: 'number', required: false, constraints: '0.1..5 (default 1)', description: 'Portion multiplier (e.g. `0.5`, `1`, `1.5`).' }
          ],
          payload: { date: '{{todayDate}}', source: 'planned', mealId: '{{sampleMealId}}', slot: 'breakfast', quantity: 1 },
          extraTests: [
            'try {',
            '  const res = pm.response.json();',
            '  const d = res.data || res;',
            '  const hit = (d.affected || []).find(a => a.entityType === "food_entry" && a.op === "upsert");',
            '  if (hit && hit.entityId) pm.collectionVariables.set("sampleFoodEntryId", hit.entityId);',
            '} catch (e) {}'
          ]
        }),
        cmdReq({
          name: 'Log Reference Ingredient (food_entry — ingredient)',
          action: 'food_entry',
          summary: 'Logs a verified reference ingredient by planning key (e.g. `chicken`, `rice`, `fava`, `egg`, `oats`) and weight in grams.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Past 90 days..today', description: 'Log date.' },
            { name: 'source', type: 'string (const)', required: true, constraints: '"ingredient"', description: 'Reference ingredient source.' },
            { name: 'key', type: 'string', required: true, constraints: 'Valid key from `/v1/foods` (e.g. `chicken`, `rice`, `fava`)', description: 'Ingredient key.' },
            { name: 'grams', type: 'number', required: true, constraints: '1..3000 (grams)', description: 'Consumed weight in grams.' },
            { name: 'slot', type: 'string (enum)', required: true, constraints: '`breakfast` | `lunch` | `dinner` | `snack`', description: 'Meal slot.' }
          ],
          payload: { date: '{{todayDate}}', source: 'ingredient', key: 'chicken', grams: 150, slot: 'lunch' },
          extraTests: [
            'try {',
            '  const res = pm.response.json();',
            '  const d = res.data || res;',
            '  const hit = (d.affected || []).find(a => a.entityType === "food_entry" && a.op === "upsert");',
            '  if (hit && hit.entityId) pm.collectionVariables.set("sampleFoodEntryId", hit.entityId);',
            '} catch (e) {}'
          ]
        }),
        cmdReq({
          name: 'Log Manual Food Entry (food_entry — manual)',
          action: 'food_entry',
          summary: 'Logs a custom manual food item with calories and optional protein/carbs/fat.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Past 90 days..today', description: 'Log date.' },
            { name: 'source', type: 'string (const)', required: true, constraints: '"manual"', description: 'Manual entry source.' },
            { name: 'name', type: 'string', required: true, constraints: '1..120 chars', description: 'Meal/food label.' },
            { name: 'slot', type: 'string (enum)', required: true, constraints: '`breakfast` | `lunch` | `dinner` | `snack`', description: 'Meal slot.' },
            { name: 'energy', type: 'number', required: true, constraints: '0..5000 (kcal)', description: 'Total energy in kcal.' },
            { name: 'protein', type: 'number | null', required: false, constraints: '0..400 (g)', description: 'Optional protein grams.' },
            { name: 'carbs', type: 'number | null', required: false, constraints: '0..800 (g)', description: 'Optional carbs grams.' },
            { name: 'fat', type: 'number | null', required: false, constraints: '0..300 (g)', description: 'Optional fat grams.' }
          ],
          payload: { date: '{{todayDate}}', source: 'manual', name: 'Medium Koshary Bowl', slot: 'dinner', energy: 480, protein: 16, carbs: 82, fat: 9 },
          extraTests: [
            'try {',
            '  const res = pm.response.json();',
            '  const d = res.data || res;',
            '  const hit = (d.affected || []).find(a => a.entityType === "food_entry" && a.op === "upsert");',
            '  if (hit && hit.entityId) pm.collectionVariables.set("sampleFoodEntryId", hit.entityId);',
            '} catch (e) {}'
          ]
        }),
        cmdReq({
          name: 'Confirm Food Day Complete (food_complete)',
          action: 'food_complete',
          summary: 'Explicitly confirms whether all food intake for `date` has been recorded (independent of calorie adherence).',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Past 90 days..today', description: 'Diary date.' },
            { name: 'complete', type: 'boolean', required: true, constraints: '`true` | `false`', description: 'Explicit user confirmation.' }
          ],
          payload: { date: '{{todayDate}}', complete: true }
        }),
        cmdReq({
          name: 'Delete Food Entry (food_delete)',
          action: 'food_delete',
          summary: 'Deletes a logged food entry by ID and reopens that day\'s completion status.',
          payloadFields: [
            { name: 'id', type: 'string (UUID)', required: true, constraints: 'Existing entry ID', description: 'Food entry ID to delete.' }
          ],
          payload: { id: '{{sampleFoodEntryId}}' }
        }),
        cmdReq({
          name: 'Log Legacy Daily Total (food)',
          action: 'food',
          summary: 'Logs a single daily calorie total for a date that has no detailed entries.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Past 90 days..today', description: 'Diary date.' },
            { name: 'energy', type: 'number', required: true, constraints: '0..10000 (kcal)', description: 'Daily total calories.' },
            { name: 'complete', type: 'boolean', required: true, constraints: '`true` | `false`', description: 'Completion flag.' }
          ],
          payload: { date: '{{todayDate}}', energy: 1850, complete: true }
        }),
        cmdReq({
          name: 'Switch Legacy Day to Detailed Entries (food_switch_to_entries)',
          action: 'food_switch_to_entries',
          summary: 'Archives a legacy daily total so detailed food entries can be logged for that date.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Date with legacy daily total', description: 'Target date.' },
            { name: 'confirm', type: 'boolean', required: true, constraints: 'Must be `true`', description: 'Explicit switch confirmation.' }
          ],
          payload: { date: '{{todayDate}}', confirm: true }
        }),
        req({
          name: 'Get Meal Alternatives',
          method: 'GET',
          path: '/v1/meal-alternatives?mealId={{sampleMealId}}',
          summary: 'Returns up to 6 validated culinary substitutes matching diet, budget, exclusions, and clinical constraints.',
          queryParams: [
            { key: 'mealId', type: 'string (UUID)', required: true, constraints: 'Meal ID from active plan', description: 'Meal to find alternatives for.' }
          ],
          responseFields: [
            { name: 'items', type: 'Array<object>', description: 'Validated substitutes with `templateId`, `name`, macros, and nutrient deltas.' }
          ],
          testScript: [
            'pm.test("Meal alternatives fetched", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json().data || pm.response.json();',
            '  const items = d.items || [];',
            '  if (items.length && items[0].templateId) {',
            '    pm.collectionVariables.set("sampleAltTemplateId", items[0].templateId);',
            '  }',
            '});'
          ]
        }),
        cmdReq({
          name: 'Replace Planned Meal (replace_meal)',
          action: 'replace_meal',
          summary: 'Substitutes a planned meal with a validated `templateId` from `GET /v1/meal-alternatives`.',
          payloadFields: [
            { name: 'mealId', type: 'string (UUID)', required: true, constraints: 'Active plan meal ID', description: 'Target planned meal.' },
            { name: 'templateId', type: 'string', required: true, constraints: 'From `/v1/meal-alternatives`', description: 'Replacement template ID.' }
          ],
          payload: { mealId: '{{sampleMealId}}', templateId: '{{sampleAltTemplateId}}' }
        })
      ]
    },
    {
      id: 'f0000006-0000-4000-8000-000000000006',
      name: '06. Hydration, Weight & Activity',
      description: 'Water tracking, body weight scale logs, daily steps/activity, and idempotent wearable batch ingestion (Health Connect / Apple Health).',
      item: [
        cmdReq({
          name: 'Log Water Intake — Set Cups (water)',
          action: 'water',
          summary: 'Sets total water intake (cups, 250 mL each) for the given date.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Log date.' },
            { name: 'cups', type: 'integer', required: true, constraints: '0..30', description: 'Total cups (250 mL/cup).' }
          ],
          payload: { date: '{{todayDate}}', cups: 8 }
        }),
        cmdReq({
          name: 'Log Water Intake — Increment Cups (water)',
          action: 'water',
          summary: 'Increments or decrements water intake relative to the date\'s existing total.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Log date.' },
            { name: 'addCups', type: 'integer', required: true, constraints: '-10..20 (clamped 0..30)', description: 'Delta cups to add or subtract.' }
          ],
          payload: { date: '{{todayDate}}', addCups: 2 }
        }),
        req({
          name: 'List Water Logs',
          method: 'GET',
          path: '/v1/water-logs?offset=0&limit=30',
          summary: 'Paginated water intake logs ordered by date descending.',
          queryParams: PAGINATION_QUERY_PARAMS,
          responseFields: PAGINATION_RESPONSE_FIELDS
        }),
        cmdReq({
          name: 'Log Body Weight (weight)',
          action: 'weight',
          summary: 'Records or updates scale weight (kg) for a date (same-date entries update in place).',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Measurement date.' },
            { name: 'kg', type: 'number', required: true, constraints: '35..250 (kg)', description: 'Body weight in kilograms.' },
            { name: 'source', type: 'string', required: false, constraints: '`manual` | `wearable` | `health_connect` | `apple_health`', description: 'Measurement source.' }
          ],
          payload: { date: '{{todayDate}}', kg: 81.4, source: 'manual' }
        }),
        req({
          name: 'List Weight Logs',
          method: 'GET',
          path: '/v1/weight-logs?offset=0&limit=30',
          summary: 'Paginated weight measurements ordered by date descending.',
          queryParams: PAGINATION_QUERY_PARAMS,
          responseFields: PAGINATION_RESPONSE_FIELDS
        }),
        cmdReq({
          name: 'Log Daily Steps (steps)',
          action: 'steps',
          summary: 'Logs daily step count.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Log date.' },
            { name: 'steps', type: 'integer', required: true, constraints: '0..100000', description: 'Step count.' },
            { name: 'source', type: 'string (enum)', required: false, constraints: '`manual` | `health_connect` | `apple_health` | `wearable`', description: 'Data source.' }
          ],
          payload: { date: '{{todayDate}}', steps: 8500, source: 'manual' }
        }),
        cmdReq({
          name: 'Log Activity & Active Energy (activity)',
          action: 'activity',
          summary: 'Logs daily steps and active energy burn with optional deduplication via `externalRecordId`.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Log date.' },
            { name: 'steps', type: 'integer | null', required: false, constraints: '0..100000', description: 'Daily steps.' },
            { name: 'activeEnergyKcal', type: 'number | null', required: false, constraints: '0..5000 (kcal)', description: 'Active energy burned.' },
            { name: 'source', type: 'string (enum)', required: false, constraints: '`manual` | `health_connect` | `apple_health` | `wearable`', description: 'Data source.' },
            { name: 'externalRecordId', type: 'string | null', required: false, constraints: 'max 120 chars', description: 'Idempotent external record ID for deduplication.' }
          ],
          payload: { date: '{{todayDate}}', steps: 9200, activeEnergyKcal: 410, source: 'health_connect', externalRecordId: 'hc-sample-001' }
        }),
        req({
          name: 'List Activity Logs',
          method: 'GET',
          path: '/v1/activity-logs?offset=0&limit=30',
          summary: 'Paginated activity and step logs.',
          queryParams: PAGINATION_QUERY_PARAMS,
          responseFields: PAGINATION_RESPONSE_FIELDS
        }),
        req({
          name: 'Ingest Wearables Batch (Health Connect / Apple Health)',
          method: 'POST',
          path: '/v1/wearables/ingest',
          summary: 'Idempotent batch ingestion of up to 100 weight/steps/activity records from Android Health Connect or Apple HealthKit.',
          headers: [{ key: 'Idempotency-Key', value: '{{idempotencyKey}}', required: false, description: 'Optional UUID (server derives canonical digest key if omitted).' }],
          fields: [
            { name: 'records', type: 'Array<object>', required: true, constraints: '1..100 records', description: 'Array of wearable records.' },
            { name: 'records[].type', type: 'string (enum)', required: true, constraints: '`weight` | `steps` | `activity`', description: 'Record type.' },
            { name: 'records[].date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Past 90 days..today', description: 'Record date.' },
            { name: 'records[].kg', type: 'number', required: false, constraints: 'Required for `weight` (35..250)', description: 'Weight in kg.' },
            { name: 'records[].steps', type: 'integer', required: false, constraints: '0..100000', description: 'Steps count.' },
            { name: 'records[].activeEnergyKcal', type: 'number', required: false, constraints: '0..5000', description: 'Active calories.' },
            { name: 'records[].externalRecordId', type: 'string', required: false, constraints: 'max 120 chars', description: 'Deduplication ID.' }
          ],
          responseFields: [
            { name: 'ok', type: 'boolean', description: '`true`.' },
            { name: 'revision', type: 'integer', description: 'Updated account revision.' },
            { name: 'ingested', type: 'integer', description: 'Count of processed records.' }
          ],
          examples: [{ name: '200 OK — Ingested', code: 200, body: { ok: true, revision: 6, ingested: 2 } }],
          body: {
            records: [
              { type: 'weight', date: '{{todayDate}}', kg: 81.3, source: 'health_connect' },
              { type: 'activity', date: '{{todayDate}}', steps: 9600, activeEnergyKcal: 430, source: 'health_connect', externalRecordId: 'hc-batch-001' }
            ]
          },
          testScript: [
            'pm.test("Wearables batch ingested", function () {',
            '  pm.response.to.have.status(200);',
            '  const res = pm.response.json();',
            '  pm.expect(res.ok).to.eql(true);',
            '});'
          ]
        })
      ]
    },
    {
      id: 'f0000007-0000-4000-8000-000000000007',
      name: '07. Workouts & Training',
      description: 'Workout plan reads, exercise set logging with automated progression, session completion, injury-safe exercise alternatives, and session rescheduling.',
      item: [
        req({
          name: 'List Workout Plans',
          method: 'GET',
          path: '/v1/workout-plans',
          summary: 'Lists active and archived workout plan version references owned by the user.',
          responseFields: [{ name: 'items', type: 'Array<{id, version, split, parent_id}>', description: 'Owned workout plan refs.' }]
        }),
        req({
          name: 'Get Workout Plan by ID',
          method: 'GET',
          path: '/v1/workout-plans/{{activeWorkoutPlanId}}',
          summary: 'Fetches full owned workout plan with days, exercises, target reps/RIR, rest seconds, and weekly set totals.',
          pathParams: [{ key: 'activeWorkoutPlanId', type: 'string (UUID)', required: true, description: 'Owned workout plan ID.' }]
        }),
        cmdReq({
          name: 'Log Exercise Sets (workout)',
          action: 'workout',
          summary: 'Logs performed sets (`kg`, `reps`, `rir`, `pain`) for a scheduled exercise and computes progression suggestions.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Exposure date.' },
            { name: 'dayIndex', type: 'integer', required: true, constraints: '0..6 (`0=Sun .. 6=Sat`)', description: 'Workout day index in active plan.' },
            { name: 'exerciseId', type: 'string', required: true, constraints: 'Must exist in day\'s exercises', description: 'Exercise ID.' },
            { name: 'sets', type: 'Array<object>', required: true, constraints: '1..10 sets: `{ kg: 0..500, reps: int 1..100, rir?: 0..10, pain?: boolean }`', description: 'Performed sets.' },
            { name: 'bothSides', type: 'boolean', required: false, constraints: 'Required `true` for unilateral exercises to progress', description: 'Confirms both sides completed.' },
            { name: 'increment', type: 'number | null', required: false, constraints: '0.1..20 (kg)', description: 'Optional preferred load step.' },
            { name: 'autoSession', type: 'boolean', required: false, constraints: 'default: false', description: 'Automatically creates/updates session coverage record.' }
          ],
          payload: {
            date: '{{todayDate}}',
            dayIndex: '__DAY_IDX__',
            exerciseId: '{{sampleExerciseId}}',
            sets: [
              { kg: 20, reps: 10, rir: 2, pain: false },
              { kg: 20, reps: 10, rir: 2, pain: false },
              { kg: 20, reps: 10, rir: 2, pain: false }
            ],
            bothSides: true,
            increment: 2.5
          }
        }),
        req({
          name: 'List Workout Logs',
          method: 'GET',
          path: '/v1/workout-logs?offset=0&limit=30',
          summary: 'Paginated exercise set/rep/load logs.',
          queryParams: PAGINATION_QUERY_PARAMS,
          responseFields: PAGINATION_RESPONSE_FIELDS
        }),
        cmdReq({
          name: 'Complete / Update Workout Session (session)',
          action: 'session',
          summary: 'Marks a workout session as `completed`, `partial`, or `missed`. Completion ratio below 80% automatically classifies as `partial`.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Session date.' },
            { name: 'dayIndex', type: 'integer', required: true, constraints: '0..6', description: 'Workout day index.' },
            { name: 'status', type: 'string (enum)', required: true, constraints: '`completed` | `partial` | `missed`', description: 'Session completion status.' },
            { name: 'duration', type: 'number | null', required: false, constraints: '1..240 (minutes)', description: 'Total workout duration.' },
            { name: 'rpe', type: 'number | null', required: false, constraints: '0..10', description: 'Session perceived exertion.' }
          ],
          payload: { date: '{{todayDate}}', dayIndex: '__DAY_IDX__', status: 'completed', duration: 45, rpe: 7 }
        }),
        req({
          name: 'List Workout Sessions',
          method: 'GET',
          path: '/v1/sessions?offset=0&limit=30',
          summary: 'Paginated workout session completion records.',
          queryParams: PAGINATION_QUERY_PARAMS,
          responseFields: PAGINATION_RESPONSE_FIELDS
        }),
        req({
          name: 'Get Exercise Alternatives',
          method: 'GET',
          path: '/v1/exercise-alternatives?dayIndex={{sampleDayIndex}}&exerciseId={{sampleExerciseId}}',
          summary: 'Returns up to 6 biomechanically equivalent, injury-safe, equipment-matched, time-budget-validated exercise substitutes.',
          queryParams: [
            { key: 'dayIndex', type: 'integer', required: true, constraints: '0..6', description: 'Target workout day index.' },
            { key: 'exerciseId', type: 'string', required: true, constraints: 'Exercise ID in that day', description: 'Exercise to substitute.' }
          ],
          responseFields: [{ name: 'items', type: 'Array<object>', description: 'Validated alternative exercise objects.' }],
          testScript: [
            'pm.test("Exercise alternatives fetched", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json().data || pm.response.json();',
            '  const items = d.items || [];',
            '  if (items.length && items[0].id) {',
            '    pm.collectionVariables.set("sampleAltExerciseId", items[0].id);',
            '  }',
            '});'
          ]
        }),
        cmdReq({
          name: 'Replace Exercise (replace_exercise)',
          action: 'replace_exercise',
          summary: 'Forks the workout plan replacing `exerciseId` with a validated `alternativeId` while preserving historical logs.',
          payloadFields: [
            { name: 'dayIndex', type: 'integer', required: true, constraints: '0..6', description: 'Workout day index.' },
            { name: 'exerciseId', type: 'string', required: true, constraints: 'Current exercise ID', description: 'Exercise being replaced.' },
            { name: 'alternativeId', type: 'string', required: true, constraints: 'From `/v1/exercise-alternatives`', description: 'Approved substitute ID.' }
          ],
          payload: { dayIndex: '__DAY_IDX__', exerciseId: '{{sampleExerciseId}}', alternativeId: '{{sampleAltExerciseId}}' }
        }),
        cmdReq({
          name: 'Propose Workout Reschedule (reschedule)',
          action: 'reschedule',
          summary: 'Creates a pending schedule adaptation proposal moving a workout day to a rest day within the next 13 days.',
          payloadFields: [
            { name: 'dayIndex', type: 'integer', required: true, constraints: '0..6', description: 'Workout day to move.' },
            { name: 'toDate', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Rest day within `today..today+13`', description: 'Target date.' }
          ],
          payload: { dayIndex: '__DAY_IDX__', toDate: '{{sampleRescheduleDate}}' }
        })
      ]
    },
    {
      id: 'f0000008-0000-4000-8000-000000000008',
      name: '08. Recovery & Adaptive Coaching',
      description: 'Daily recovery check-ins, deterministic coaching reviews, adaptation approvals, personalized coaching brief, and structured coaching agreements.',
      item: [
        cmdReq({
          name: 'Submit Daily Recovery Check-in (recovery)',
          action: 'recovery',
          summary: 'Records daily sleep, fatigue, stress, regional muscle soreness, pain regions, illness, and red flags; feeds directly into workout readiness and deload logic.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Check-in date.' },
            { name: 'sleepHours', type: 'number', required: true, constraints: '0..24', description: 'Hours slept.' },
            { name: 'sleepQuality', type: 'integer', required: true, constraints: '1..5', description: 'Sleep quality score (`1=poor .. 5=great`).' },
            { name: 'fatigue', type: 'integer', required: true, constraints: '1..5', description: 'Fatigue score (`1=low .. 5=high`).' },
            { name: 'stress', type: 'integer | null', required: false, constraints: '1..5', description: 'Stress score.' },
            { name: 'soreness', type: 'number', required: false, constraints: '0..10 (default 0)', description: 'Overall muscle soreness.' },
            { name: 'sorenessByRegion', type: 'Record<string, number>', required: false, constraints: 'Keys from `MUSCLE_REGIONS`, values `0..10`', description: 'Per-region soreness map.' },
            { name: 'pain', type: 'boolean', required: true, constraints: 'boolean', description: 'Whether joint/sharp pain is present.' },
            { name: 'painRegions', type: 'Array<string>', required: false, constraints: 'Valid `MUSCLE_REGIONS` keys', description: 'Affected pain regions.' },
            { name: 'illness', type: 'boolean', required: true, constraints: 'boolean', description: 'Whether user is currently ill.' },
            { name: 'redFlags', type: 'boolean', required: true, constraints: 'boolean', description: 'Severe clinical red-flag symptoms (triggers stop recommendation).' }
          ],
          payload: {
            date: '{{todayDate}}', sleepHours: 7.5, sleepQuality: 4, fatigue: 2, stress: 2,
            soreness: 2, sorenessByRegion: { chest: 2, quads: 1 }, pain: false, painRegions: [],
            illness: false, redFlags: false
          }
        }),
        req({
          name: 'List Recovery Check-ins',
          method: 'GET',
          path: '/v1/checkins?offset=0&limit=30',
          summary: 'Paginated daily recovery check-ins.',
          queryParams: PAGINATION_QUERY_PARAMS,
          responseFields: PAGINATION_RESPONSE_FIELDS
        }),
        cmdReq({
          name: 'Trigger Adaptive Review (review)',
          action: 'review',
          view: 'full',
          summary: 'Evaluates recovery readiness, 14-day weight & nutrition evidence, and workout volume progression; generates explained review and optional pending adaptation proposals.',
          payloadFields: [],
          payload: {}
        }),
        cmdReq({
          name: 'Accept or Reject Adaptation Proposal (adaptation)',
          action: 'adaptation',
          summary: 'Accepts (`accept: true`) or declines (`accept: false`) a current, unexpired pending adaptation proposal.',
          payloadFields: [
            { name: 'id', type: 'string (UUID)', required: true, constraints: 'Pending proposal ID', description: 'Proposal ID from `pendingAdaptations`.' },
            { name: 'accept', type: 'boolean', required: true, constraints: '`true` | `false`', description: 'Decision.' }
          ],
          payload: { id: '{{sampleProposalId}}', accept: true }
        }),
        req({
          name: 'Get On-Demand Coaching Brief',
          method: 'GET',
          path: '/v1/coaching/brief',
          summary: 'Returns deterministic personalized nutrition, training, and follow-up coaching notes for today (read-only; supports `If-None-Match` ETag).',
          optionalHeaders: [{ key: 'If-None-Match', value: '{{lastEtag}}', required: false, description: 'Optional saved ETag.' }],
          responseFields: [
            { name: 'apiVersion', type: 'string', description: '`"1"`.' },
            { name: 'viewKind', type: 'string', description: '`"on_demand_coaching_brief"`.' },
            { name: 'date', type: 'string (YYYY-MM-DD)', description: 'User-local date.' },
            { name: 'revision', type: 'integer', description: 'Account revision.' },
            { name: 'requiresOnboarding', type: 'boolean', description: '`true` if no profile exists yet.' },
            { name: 'notes', type: 'Array<CoachingBriefNote>', description: 'Structured notes with `id`, `role`, `priority`, `text`, `action`, `actionTarget`.' }
          ]
        }),
        req({
          name: 'Get Coaching Inbox (Active Agreements)',
          method: 'GET',
          path: '/v1/coaching/inbox',
          summary: 'Lists active in-app coaching agreements and review dates (read-only; never auto-acknowledges).',
          responseFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', description: 'Current date.' },
            { name: 'revision', type: 'integer', description: 'Account revision.' },
            { name: 'channel', type: 'string', description: '`"in_app"`.' },
            { name: 'items', type: 'Array<CoachingCase>', description: 'Active coaching cases.' }
          ],
          testScript: [
            'try {',
            '  const d = pm.response.json().data || pm.response.json();',
            '  const items = d.items || [];',
            '  if (items.length) pm.collectionVariables.set("sampleCaseId", items[0].id);',
            '} catch (e) {}'
          ]
        }),
        req({
          name: 'Get Coaching Agreement History',
          method: 'GET',
          path: '/v1/coaching/history?offset=0&limit=30',
          summary: 'Paginated historical coaching cases/agreements.',
          queryParams: PAGINATION_QUERY_PARAMS,
          responseFields: PAGINATION_RESPONSE_FIELDS
        }),
        cmdReq({
          name: 'Submit Coaching Feedback (coaching_feedback)',
          action: 'coaching_feedback',
          summary: 'Logs nutrition or training adherence barriers and subjective scores (1..5), opening a follow-up agreement when warranted.',
          payloadFields: [
            { name: 'domain', type: 'string (enum)', required: true, constraints: '`nutrition` | `training`', description: 'Coaching domain.' },
            { name: 'barrier', type: 'string (enum)', required: true, constraints: 'Nutrition: `time|budget|taste|hunger|eating_out|logging|none`; Training: `time|fatigue|pain|equipment|motivation|none`', description: 'Primary barrier.' },
            { name: 'hunger', type: 'integer | null', required: false, constraints: '1..5 (nutrition only)', description: 'Hunger score.' },
            { name: 'satiety', type: 'integer | null', required: false, constraints: '1..5 (nutrition only)', description: 'Satiety score.' },
            { name: 'energy', type: 'integer | null', required: false, constraints: '1..5', description: 'Subjective energy score.' }
          ],
          payload: { domain: 'nutrition', barrier: 'time', hunger: 2, satiety: 4, energy: 4 },
          extraTests: [
            'try {',
            '  const res = pm.response.json();',
            '  const d = res.data || res;',
            '  const c = (d.affected || []).find(a => a.entityType === "coaching_case" && a.op === "upsert");',
            '  if (c && c.entityId) pm.collectionVariables.set("sampleCaseId", c.entityId);',
            '} catch (e) {}'
          ]
        }),
        cmdReq({
          name: 'Acknowledge Coaching Case (coaching_ack)',
          action: 'coaching_ack',
          summary: 'Explicitly marks a coaching agreement/message as read/acknowledged.',
          payloadFields: [{ name: 'id', type: 'string', required: true, constraints: 'Coaching case ID', description: 'Case ID from `/v1/coaching/inbox`.' }],
          payload: { id: '{{sampleCaseId}}' }
        }),
        cmdReq({
          name: 'Decide on Coaching Case (coaching_decision)',
          action: 'coaching_decision',
          summary: 'Accepts or declines a proposed coaching agreement.',
          payloadFields: [
            { name: 'id', type: 'string', required: true, constraints: 'Coaching case ID', description: 'Case ID.' },
            { name: 'accept', type: 'boolean', required: true, constraints: '`true` | `false`', description: 'Accept or decline.' }
          ],
          payload: { id: '{{sampleCaseId}}', accept: true }
        }),
        cmdReq({
          name: 'Report Coaching Outcome (coaching_outcome)',
          action: 'coaching_outcome',
          summary: 'Records user-reported outcome for an accepted coaching agreement.',
          payloadFields: [
            { name: 'id', type: 'string', required: true, constraints: 'Accepted coaching case ID', description: 'Case ID.' },
            { name: 'outcome', type: 'string (enum)', required: true, constraints: '`helped` | `not_helped` | `not_tried`', description: 'User-reported result.' }
          ],
          payload: { id: '{{sampleCaseId}}', outcome: 'helped' }
        })
      ]
    },
    {
      id: 'f0000009-0000-4000-8000-000000000009',
      name: '09. Nutrition Plans & Archives',
      description: 'List active/archived nutrition plan versions, fetch a full 7-day plan, or lazy-load a single day.',
      item: [
        req({
          name: 'List Nutrition Plan Refs',
          method: 'GET',
          path: '/v1/plans',
          summary: 'Lists active and archived nutrition plan references owned by the caller.',
          responseFields: [{ name: 'items', type: 'Array<{id, start_date, end_date, energy, reason, parent_id}>', description: 'Plan version refs.' }]
        }),
        req({
          name: 'Get Full Nutrition Plan by ID',
          method: 'GET',
          path: '/v1/plans/{{activePlanId}}',
          summary: 'Fetches the full 7-day owned nutrition plan by ID.',
          pathParams: [{ key: 'activePlanId', type: 'string', required: true, description: 'Owned nutrition plan ID.' }]
        }),
        req({
          name: 'Lazy-Load Single Nutrition Plan Day',
          method: 'GET',
          path: '/v1/plans/{{activePlanId}}/days/{{todayDate}}',
          summary: 'Lazy-loads a single day\'s meals, summary, and historical macro targets from an owned nutrition plan.',
          pathParams: [
            { key: 'activePlanId', type: 'string', required: true, description: 'Owned nutrition plan ID.' },
            { key: 'todayDate', type: 'string (YYYY-MM-DD)', required: true, description: 'Calendar date within the plan.' }
          ]
        })
      ]
    },
    {
      id: 'f0000010-0000-4000-8000-000000000010',
      name: '10. Food, Beverage & Exercise Catalogs',
      description: '3,070+ Egyptian/Gulf/reference foods with Arabic synonym normalization, prepared beverages, custom recipe calculator, and 868 OpenExerciseDB exercises.',
      item: [
        req({
          name: 'Get Catalog Provenance Manifest',
          method: 'GET',
          path: '/v1/catalog/manifest',
          summary: 'Returns pinned versions, source hashes, licenses, and item counts for both exercise and food catalogs.'
        }),
        req({
          name: 'List Muscle Taxonomy & Arabic Labels',
          method: 'GET',
          path: '/v1/catalog/muscles',
          summary: 'Returns canonical muscle IDs and Arabic/English translations.'
        }),
        req({
          name: 'Search Foods (Arabic & English)',
          method: 'GET',
          path: '/v1/foods?q=chicken&scope=all&includeEstimated=true&offset=0&limit=20',
          summary: 'Searches the Egyptian/Gulf & reference food catalog with Arabic normalization, colloquial synonyms, and provenance status.',
          queryParams: [
            { key: 'q', type: 'string', required: false, constraints: 'max 100 chars', description: 'Arabic or English search term.' },
            { key: 'scope', type: 'string (enum)', required: false, constraints: '`all` | `approved` | `planning` | `beverages` (default `all`)', description: 'Catalog scope filter.' },
            { key: 'includeEstimated', type: 'boolean', required: false, constraints: 'default `false`', description: 'Include calculated recipe estimates.' },
            { key: 'offset', type: 'integer', required: false, constraints: '>= 0, default 0', description: 'Pagination offset.' },
            { key: 'limit', type: 'integer', required: false, constraints: '1..100, default 40', description: 'Page size.' }
          ],
          responseFields: [
            { name: 'items', type: 'Array<FoodCatalogItem>', description: 'Matched foods with `id`, `key`, `name_ar`, `values` (per 100g), `status`, `qualityTier`.' },
            { name: 'total', type: 'integer', description: 'Total matched items.' },
            { name: 'nextOffset', type: 'integer | null', description: 'Next page offset.' },
            { name: 'coverageStatus', type: 'string (enum)', description: '`verified_reference_available` | `mixed_verified_and_estimated` | `estimated_model_only_requires_specialist_review` | `missing_coverage`.' }
          ],
          testScript: [
            'pm.test("Foods returned", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json().data || pm.response.json();',
            '  const items = d.items || [];',
            '  if (items.length) pm.collectionVariables.set("sampleFoodId", items[0].id);',
            '});'
          ]
        }),
        req({
          name: 'Get Food Item Detail',
          method: 'GET',
          path: '/v1/foods/{{sampleFoodId}}',
          summary: 'Returns full provenance, nutrient basis, household portions, and recipe estimate metadata for a food item.',
          pathParams: [{ key: 'sampleFoodId', type: 'string', required: true, description: 'Food ID or planning key.' }]
        }),
        req({
          name: 'Search Egyptian & Ramadan Beverages',
          method: 'GET',
          path: '/v1/beverages?q=tea&includeEstimated=true&offset=0&limit=20',
          summary: 'Searches prepared Egyptian, cafe, Ramadan, and fresh juice beverages.',
          queryParams: [
            { key: 'q', type: 'string', required: false, constraints: 'max 100 chars', description: 'Search query.' },
            { key: 'includeEstimated', type: 'boolean', required: false, constraints: 'default `false`', description: 'Include recipe estimates.' },
            { key: 'offset', type: 'integer', required: false, constraints: '>= 0', description: 'Offset.' },
            { key: 'limit', type: 'integer', required: false, constraints: '1..100', description: 'Page size.' }
          ]
        }),
        req({
          name: 'Calculate Custom Recipe / Beverage Nutrients',
          method: 'POST',
          path: '/v1/foods/calculate',
          summary: 'Calculates aggregate nutrients and per-100g cooked yield from verified ingredients.',
          fields: [
            { name: 'ingredients', type: 'Array<object>', required: true, constraints: 'Array of `{ key: string, grams?: number, ml?: number }`', description: 'Base ingredients from approved catalog.' },
            { name: 'additions', type: 'Array<object>', required: false, constraints: 'Same shape as `ingredients`', description: 'Optional toppings/sweeteners.' },
            { name: 'finalWeightGrams', type: 'number | null', required: false, constraints: '> 0 (grams)', description: 'Measured cooked/final weight to compute `per100g` and `yieldRatio`.' }
          ],
          responseFields: [
            { name: 'qualityTier', type: 'string', description: 'Provenance quality tier.' },
            { name: 'inputWeightGrams', type: 'string', description: 'Total raw input grams.' },
            { name: 'finalWeightGrams', type: 'string | null', description: 'Final cooked weight.' },
            { name: 'yieldRatio', type: 'string | null', description: 'Cooked/raw yield ratio.' },
            { name: 'nutrients', type: 'object', description: '`energy`, `protein`, `fat`, `carbs`, `fiber`, `saturated`, `sodium`, `sugars` with `total`, `per100g`, `coverageByWeight`.' }
          ],
          examples: [{ name: '200 OK — Recipe Calculated', code: 200, body: { qualityTier: 'Calculated from Verified Ingredients', inputWeightGrams: '270', finalWeightGrams: '240', yieldRatio: '0.8889', per100gAvailable: true, nutrients: { energy: { total: '412', per100g: '171.7', coverageByWeight: '1' } } } }],
          body: { ingredients: [{ key: 'chicken', grams: 150 }, { key: 'rice', grams: 120 }], finalWeightGrams: 240 },
          testScript: [
            'pm.test("Recipe calculated", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json().data || pm.response.json();',
            '  pm.expect(d.nutrients).to.be.an("object");',
            '});'
          ]
        }),
        req({
          name: 'Search Exercises Catalog',
          method: 'GET',
          path: '/v1/exercises?q=bench&offset=0',
          summary: 'Searches and filters the 868-exercise catalog (30 items per page).',
          queryParams: [
            { key: 'q', type: 'string', required: false, constraints: 'max 100 chars', description: 'Exercise name substring.' },
            { key: 'muscle', type: 'string', required: false, constraints: 'Muscle ID or region', description: 'Optional target muscle filter.' },
            { key: 'equipment', type: 'string', required: false, constraints: 'Equipment ID', description: 'Optional equipment filter.' },
            { key: 'offset', type: 'integer', required: false, constraints: '>= 0, default 0', description: 'Pagination offset (30/page).' }
          ],
          testScript: [
            'pm.test("Exercises returned", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json().data || pm.response.json();',
            '  const items = d.items || [];',
            '  if (items.length) pm.collectionVariables.set("sampleCatalogExerciseId", encodeURIComponent(items[0].id));',
            '});'
          ]
        }),
        req({
          name: 'Get Exercise Detail by ID',
          method: 'GET',
          path: '/v1/exercises/{{sampleCatalogExerciseId}}',
          summary: 'Returns full exercise metadata, target muscles, equipment, and instructions.',
          pathParams: [{ key: 'sampleCatalogExerciseId', type: 'string (URL-encoded)', required: true, description: 'URL-encoded exercise ID (e.g. `oedb%3A12`).' }]
        })
      ]
    },
    {
      id: 'f0000011-0000-4000-8000-000000000011',
      name: '11. Offline Sync & User Settings',
      description: 'Incremental delta outbox sync feed for offline-first mobile apps, timezone/locale settings, notification preferences, and entitlements.',
      item: [
        req({
          name: 'Get Incremental Sync Changes & Entity Deltas',
          method: 'GET',
          path: '/v1/sync/changes?after=0&afterSeq={{nextSeqCursor}}',
          summary: 'Returns incremental revision metadata and entity-level outbox deltas (`upsert` and `delete` tombstones) for offline SQLite/SQLDelight synchronization.',
          queryParams: [
            { key: 'after', type: 'integer', required: false, constraints: '>= 0, default 0', description: 'Last synced account revision.' },
            { key: 'afterSeq', type: 'integer', required: false, constraints: '>= 0', description: 'Last synced outbox sequence cursor (`nextSeqCursor`).' }
          ],
          responseFields: [
            { name: 'items', type: 'Array<{revision, action, at}>', description: 'Revision audit entries.' },
            { name: 'deltas', type: 'Array<{seq, revision, entityType, entityId, op, at, payload}>', description: 'Entity-level deltas (max 100/page).' },
            { name: 'currentRevision', type: 'integer', description: 'Latest server revision.' },
            { name: 'nextCursor', type: 'integer', description: 'Next `after` revision cursor.' },
            { name: 'nextSeqCursor', type: 'integer', description: 'Next `afterSeq` cursor — persist verbatim.' },
            { name: 'hasMore', type: 'boolean', description: '`true` if more pages remain.' },
            { name: 'resyncRequired', type: 'boolean', description: '`true` if client cursor exceeds server revision.' }
          ],
          testScript: [
            'pm.test("Sync feed returned", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json().data || pm.response.json();',
            '  if (typeof d.nextSeqCursor === "number") {',
            '    pm.collectionVariables.set("nextSeqCursor", String(d.nextSeqCursor));',
            '  }',
            '});'
          ]
        }),
        cmdReq({
          name: 'Update Timezone & Locale (timezone)',
          action: 'timezone',
          summary: 'Updates user IANA timezone and optional UI locale.',
          payloadFields: [
            { name: 'timezone', type: 'string (IANA)', required: true, constraints: 'Valid IANA timezone (e.g. `Africa/Cairo`, `Asia/Riyadh`, `Asia/Dubai`)', description: 'Target timezone.' },
            { name: 'locale', type: 'string (enum)', required: false, constraints: '`ar-EG` | `ar-SA` | `en`', description: 'Optional preferred locale.' }
          ],
          payload: { timezone: 'Africa/Cairo', locale: 'ar-EG' }
        }),
        req({
          name: 'Get Notification Preferences',
          method: 'GET',
          path: '/v1/notifications/preferences',
          summary: 'Returns stored reminder flags and quiet-hours window.'
        }),
        cmdReq({
          name: 'Update Notification Preferences (notification_preferences)',
          action: 'notification_preferences',
          summary: 'Updates reminder toggles and HH:mm quiet-hours window.',
          payloadFields: [
            { name: 'dailyReminder', type: 'boolean', required: false, constraints: 'boolean', description: 'Daily check-in reminder.' },
            { name: 'workoutReminder', type: 'boolean', required: false, constraints: 'boolean', description: 'Workout day reminder.' },
            { name: 'waterReminder', type: 'boolean', required: false, constraints: 'boolean', description: 'Hydration reminder.' },
            { name: 'weeklyReviewReminder', type: 'boolean', required: false, constraints: 'boolean', description: 'Weekly review reminder.' },
            { name: 'quietHoursStart', type: 'string (HH:mm)', required: false, constraints: '`00:00`..`23:59`', description: 'Quiet hours start.' },
            { name: 'quietHoursEnd', type: 'string (HH:mm)', required: false, constraints: '`00:00`..`23:59`', description: 'Quiet hours end.' }
          ],
          payload: { dailyReminder: true, workoutReminder: true, waterReminder: true, weeklyReviewReminder: true, quietHoursStart: '22:00', quietHoursEnd: '08:00' }
        }),
        req({
          name: 'Get Entitlements',
          method: 'GET',
          path: '/v1/entitlements',
          summary: 'Returns current account subscription tier (`free` | `premium`) and enabled feature list.'
        })
      ]
    },
    {
      id: 'f0000013-0000-4000-8000-000000000013',
      name: '12. Privacy, Export & GDPR Deletion',
      description: 'Versioned health/privacy consent recording, normalized table backfill, full machine-readable GDPR JSON export, and irreversible GDPR account erasure.',
      item: [
        req({
          name: 'Record Privacy / Health Consent',
          method: 'POST',
          path: '/v1/account/consents',
          summary: 'Records versioned explicit user consent in Cloudflare D1 (`coaching_account_consents`).',
          fields: [
            { name: 'consentType', type: 'string', required: true, constraints: 'max 60 chars', description: 'Consent category (e.g. `health_data_processing`).' },
            { name: 'version', type: 'string', required: true, constraints: 'max 30 chars', description: 'Policy/terms version string.' },
            { name: 'accepted', type: 'boolean', required: true, constraints: 'boolean', description: 'Whether accepted or withdrawn.' }
          ],
          responseFields: [
            { name: 'consentType', type: 'string', description: 'Recorded consent type.' },
            { name: 'version', type: 'string', description: 'Version.' },
            { name: 'accepted', type: 'boolean', description: 'Acceptance boolean.' },
            { name: 'at', type: 'string (ISO-8601 UTC)', description: 'Recorded timestamp.' }
          ],
          examples: [{ name: '200 OK — Consent Recorded', code: 200, body: { consentType: 'health_data_processing', version: '1.0.0', accepted: true, at: '2026-11-21T12:30:00.000Z' } }],
          body: { consentType: 'health_data_processing', version: '1.0.0', accepted: true }
        }),
        req({
          name: 'Backfill Normalized Tables',
          method: 'POST',
          path: '/v1/account/backfill',
          summary: 'Backfills legacy aggregate logs into normalized Cloudflare D1 tables atomically.',
          fields: [
            { name: '(empty body)', type: 'object', required: false, constraints: '`{}`', description: 'Send an empty JSON object `{}`; user is derived from Bearer token.' }
          ],
          responseFields: [
            { name: 'migrated', type: 'boolean', description: '`true` when migrated.' },
            { name: 'counts', type: 'object', description: 'Counts of migrated foodEntries, waterLogs, weights, workoutLogs, sessions, checkins.' }
          ],
          examples: [{ name: '200 OK — Backfilled', code: 200, body: { migrated: true, counts: { foodEntries: 12, waterLogs: 7, weights: 7, workoutLogs: 9, sessions: 3, checkins: 7 } } }],
          body: {}
        }),
        req({
          name: 'Export Full Account Data (GDPR)',
          method: 'GET',
          path: '/v1/account/export',
          summary: 'Exports complete machine-readable JSON of profile, preferences, active & archived nutrition/workout plans, all logs, audit trail, and consents.',
          responseFields: [
            { name: 'schemaVersion', type: 'integer', description: 'Export schema version (`3`).' },
            { name: 'exportedAt', type: 'string (ISO-8601 UTC)', description: 'Export timestamp.' },
            { name: 'userId', type: 'string', description: 'Account owner ID.' },
            { name: 'profile', type: 'object | null', description: 'User profile.' },
            { name: 'logs', type: 'object', description: 'All food, water, weight, workout, session, checkin, adaptation, coaching logs.' },
            { name: 'archivedNutritionPlans', type: 'Array<object>', description: 'All archived nutrition plans.' },
            { name: 'archivedWorkoutPlans', type: 'Array<object>', description: 'All archived workout plans.' },
            { name: 'consents', type: 'Array<object>', description: 'Recorded consents.' }
          ]
        }),
        req({
          name: 'Delete Account Permanently (GDPR — Destructive)',
          method: 'DELETE',
          path: '/v1/account/delete',
          summary: '**IRREVERSIBLE:** Permanently erases all account data, auth credentials (`coaching_users`), and refresh tokens (`coaching_refresh_tokens`) in one atomic D1 batch, and writes revocation tombstones.',
          fields: [
            { name: 'confirm', type: 'boolean', required: true, constraints: 'Must be `true`', description: 'Explicit irreversible deletion confirmation.' }
          ],
          responseFields: [
            { name: 'deleted', type: 'boolean', description: '`true`.' },
            { name: 'userId', type: 'string', description: 'Deleted account ID.' },
            { name: 'deletedAt', type: 'string (ISO-8601 UTC)', description: 'Erasure timestamp.' },
            { name: 'tablesCleared', type: 'integer', description: 'Number of D1 tables cleared.' },
            { name: 'namespacesCleared', type: 'integer', description: 'Number of namespaces cleared (primary + claimed).' }
          ],
          errors: [
            { status: 400, code: 'DELETE_CONFIRMATION_REQUIRED', description: 'Missing `confirm: true`.' }
          ],
          examples: [{ name: '200 OK — Permanently Deleted', code: 200, body: { deleted: true, userId: 'user:1a2b', deletedAt: '2026-11-21T12:40:00.000Z', tablesCleared: 18, namespacesCleared: 1 } }],
          body: { confirm: true }
        })
      ]
    }
  ]
};

const cloudDevEnv = {
  id: 'c80f5bd3-77c9-4d55-ae3e-3be5cb67b408',
  name: 'CuraFit — Cloud Dev',
  values: [
    { key: 'baseUrl', value: CLOUD_DEV_URL, type: 'default', enabled: true, description: 'Canonical Cloudflare Workers Cloud Dev Base URL (curafit-api-dev)' },
    { key: 'envName', value: 'cloud-dev', type: 'default', enabled: true, description: 'Environment label' },
    { key: 'testEmail', value: 'dev.user@curafit.app', type: 'default', enabled: true, description: 'Cloud Dev test user email (string, email)' },
    { key: 'testPassword', value: '', type: 'secret', enabled: true, description: 'Set your Cloud Dev test password locally in Postman' },
    { key: 'testNewPassword', value: '', type: 'secret', enabled: true, description: 'Set new password locally for Change Password' },
    { key: 'deviceId', value: 'postman-cloud-dev-01', type: 'default', enabled: true, description: 'Client device ID (string, max 120)' },
    { key: 'clientPlatform', value: 'android', type: 'default', enabled: true, description: 'android | ios | web' },
    { key: 'clientVersion', value: '1.0.0', type: 'default', enabled: true, description: 'Client semver' }
  ],
  _postman_variable_scope: 'environment'
};

const prodEnv = {
  id: '2e9b8a10-6c7d-4e5f-a1b2-3c4d5e6f7a8b',
  name: 'CuraFit — Production',
  values: [
    { key: 'baseUrl', value: PROD_URL, type: 'default', enabled: true, description: 'Canonical Cloudflare Workers Production Base URL (curafit-api)' },
    { key: 'envName', value: 'production', type: 'default', enabled: true, description: 'Environment label' },
    { key: 'testEmail', value: 'demo.user@curafit.app', type: 'default', enabled: true, description: 'Test user email (string, email)' },
    { key: 'testPassword', value: '', type: 'secret', enabled: true, description: 'Set your Production test password locally in Postman' },
    { key: 'testNewPassword', value: '', type: 'secret', enabled: true, description: 'Set new password locally for Change Password' },
    { key: 'deviceId', value: 'postman-prod-01', type: 'default', enabled: true, description: 'Client device ID (string, max 120)' },
    { key: 'clientPlatform', value: 'android', type: 'default', enabled: true, description: 'android | ios | web' },
    { key: 'clientVersion', value: '1.0.0', type: 'default', enabled: true, description: 'Client semver' }
  ],
  _postman_variable_scope: 'environment'
};

const localEnv = {
  id: '9a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
  name: 'CuraFit — Local Dev',
  values: [
    { key: 'baseUrl', value: LOCAL_DEV_URL, type: 'default', enabled: true, description: 'Local Miniflare Dev Base URL (npm run dev on 127.0.0.1:8787)' },
    { key: 'envName', value: 'development', type: 'default', enabled: true, description: 'Environment label' },
    { key: 'testEmail', value: 'dev.user@curafit.app', type: 'default', enabled: true, description: 'Local Dev test user email (string, email)' },
    { key: 'testPassword', value: '', type: 'secret', enabled: true, description: 'Set your Local Dev test password locally in Postman' },
    { key: 'testNewPassword', value: '', type: 'secret', enabled: true, description: 'Set new password locally for Change Password' },
    { key: 'deviceId', value: 'postman-local-dev-01', type: 'default', enabled: true, description: 'Client device ID (string, max 120)' },
    { key: 'clientPlatform', value: 'android', type: 'default', enabled: true, description: 'android | ios | web' },
    { key: 'clientVersion', value: '1.0.0', type: 'default', enabled: true, description: 'Client semver' }
  ],
  _postman_variable_scope: 'environment'
};

// Generate standalone Markdown API Reference from the exact same collection definition
const mdParts = [COLLECTION_OVERVIEW_MD, '', '---', '', '## 6. Complete Endpoint Reference (12 Groups / 77 Endpoints)', ''];
for (const folder of collection.item) {
  mdParts.push(`## ${folder.name}`, '', folder.description || '', '');
  for (const ep of folder.item) {
    mdParts.push(`### ${ep.name}`, '', ep.request.description || '', '');
    if (ep.response?.length) {
      for (const ex of ep.response) {
        mdParts.push(`#### Example Response — ${ex.name}`, '```json', ex.body, '```', '');
      }
    }
    mdParts.push('---', '');
  }
}

await mkdir('postman', { recursive: true });
await mkdir('docs', { recursive: true });
await writeFile('postman/CuraFit_API.postman_collection.json', JSON.stringify(collection, null, 2) + '\n', 'utf8');
await writeFile('postman/CuraFit_Cloud_Dev.postman_environment.json', JSON.stringify(cloudDevEnv, null, 2) + '\n', 'utf8');
await writeFile('postman/CuraFit_Production.postman_environment.json', JSON.stringify(prodEnv, null, 2) + '\n', 'utf8');
await writeFile('postman/CuraFit_Local_Dev.postman_environment.json', JSON.stringify(localEnv, null, 2) + '\n', 'utf8');
await writeFile('docs/API_REFERENCE.md', mdParts.join('\n') + '\n', 'utf8');
console.log('Generated fully documented CuraFit Postman collection, Cloud Dev/Prod/Local environments, and docs/API_REFERENCE.md');
