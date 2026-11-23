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
  'Production-grade REST API running natively on **Cloudflare Workers + Cloudflare D1 + Cloudflare R2** (`curafit-api` for Production, `curafit-api-dev` for Cloud Dev). Designed for **Kotlin Multiplatform Mobile (KMM)** with uniform JSON envelopes, 100% English machine-coded errors (`contracts/error-codes.json`), and canonical coaching codes (`contracts/coaching-codes.json`).',
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
  '## 2. Authentication (Google & Apple OIDC Only + First-Party JWT/D1 Sessions)',
  '',
  '- **Public endpoints (No Auth):** `GET /v1/health`, `GET /v1/capabilities`, `POST /v1/eligibility`, `POST /v1/plans/preview`, `POST /v1/auth/oauth/google`, `POST /v1/auth/oauth/apple`, `POST /v1/auth/refresh`, `POST /v1/webhooks/apple`, `POST /v1/webhooks/google-play`, and HMAC-signed `GET/PUT /v1/media/signed/{token}`.',
  '- **Authenticated endpoints:** Send `Authorization: Bearer {{accessToken}}` (inherited automatically at collection level).',
  '- **Access Token:** HS256 JWT (TTL: `900s` / 15 minutes).',
  '- **Refresh Token:** Opaque rotating token (`cfrt_...`, TTL: 30 days) stored SHA-256 hashed in D1. Replaying an already-rotated token revokes the entire session (`401 AUTH_REFRESH_TOKEN_REUSED`).',
  '',
  '---',
  '',
  '## 3. Unified Command Pipeline (`POST /v1/commands`), Revision & Idempotency',
  '',
  'All domain mutations pass through `POST /v1/commands`:',
  '- **`Idempotency-Key` header (`string`, UUID, max 100 chars, required):** Auto-generated before every Postman request. Retry with the exact same key and intent (`action` + `payload`) on network timeout even after a revision rebase.',
  '- **`revision` (`integer >= 0`, required):** Must equal the server\'s current account revision. Mismatches return `409 REVISION_CONFLICT` with `error.params.currentRevision` and `error.details.mergeHints`.',
  '- **Response Mode (`?view=receipt` vs `?view=full`):** `?view=receipt` (or `Prefer: return=minimal`) returns a compact `< 2 KB` delta receipt inside `data`; `?view=full` returns the full account snapshot inside `data`.',
  '',
  '---',
  '',
  '## 4. Uniform KMM Envelopes & Pure-English Error / Coaching Contracts',
  '',
  'Every JSON endpoint returns the canonical envelope:',
  '',
  '- **Success (`2xx`):** `{ "ok": true, "data": <T>, "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>", "revision"?: <int> } }`',
  '- **Error (`4xx` / `5xx`):** `{ "ok": false, "error": { "code", "message", "params", "fieldErrors", "retryable", "details"?: {...} }, "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>" } }`',
  '',
  '| Field | Type | Description |',
  '| :--- | :--- | :--- |',
  '| `ok` | `boolean` | `false` on all `4xx`/`5xx` responses |',
  '| `error.code` | `string` | Stable uppercase error code (293 codes cataloged in `contracts/error-codes.json` and `docs/ERROR_CODES.md`) |',
  '| `error.message` | `string` | Canonical English message (zero Arabic in API errors; mobile clients translate by `error.code` and `error.params`) |',
  '| `error.params` | `object` | Interpolation parameters for client-side localization |',
  '| `error.fieldErrors` | `Array<{field, code, message, params?}>` | Optional per-field validation errors (also 100% English) |',
  '| `error.retryable` | `boolean` | Whether the client may safely retry (`true` for `429`/`503`/`500`) |',
  '| `error.details` | `object` (optional) | Structured recovery data such as `currentRevision` and `mergeHints` on `409` |',
  '| `meta.requestId` | `string (UUID)` | Trace ID matching `X-Request-Id` header |',
  '| `meta.serverTime` | `string (ISO-8601)` | Server UTC timestamp |',
  '',
  '> **Coaching Codes:** All coaching briefs, agreements, readiness summaries, and eligibility reasons return canonical English text plus `code` and `params` cataloged in `contracts/coaching-codes.json` (`docs/COACHING_CODES.md`). AI routes (`POST /v1/nutrition/ai-parse`, `POST /v1/coaching/chat`, `GET /v1/coaching/chat/history`) are deferred to the final AI rollout phase (`501 FEATURE_DEFERRED_TO_AI_PHASE`).',
  '',
  '---',
  '',
  '## 5. Collection & Environment Variables Reference',
  '',
  '| Variable | Type | Scope | Description |',
  '| :--- | :--- | :--- | :--- |',
  '| `baseUrl` | `string (URL)` | Environment | Server base URL (`Cloud Dev`, `Production`, or `Local Dev`) |',
  '| `deviceId` | `string` | Environment | Client device ID (`max 120` chars) |',
  '| `clientPlatform` | `string (enum)` | Environment | `android` \\| `ios` \\| `web` |',
  '| `clientVersion` | `string` | Environment | App semantic version (e.g. `1.0.0`) |',
  '| `accessToken` | `string (JWT)` | Collection (auto) | Auto-saved by Google / Apple OIDC Sign-In or Refresh |',
  '| `refreshToken` | `string` | Collection (auto) | Auto-saved & rotated by Google / Apple OIDC Sign-In or Refresh |',
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
  '| `anonymousUserId` | `string` | Collection | Anonymous `anon:...` ID for `/v1/auth/claim-anonymous` |',
  '| `sampleBarcode` | `string` | Collection | Sample EAN/UPC barcode (`6221000000001`) for `/v1/foods/barcode/{ean}` |',
  '| `samplePhotoId` | `string` | Collection | Progress photo ID for `/v1/progress/photos/{photoId}` |',
  '| `signedMediaToken` | `string` | Collection | Short-lived HMAC-signed token for `/v1/media/signed/{token}` |',
  '| `oauthProvider` | `string (enum)` | Collection | OAuth provider (`google` \\| `apple`) for `/v1/auth/oauth/{provider}` |'
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
    { key: 'anonymousUserId', value: '' },
    { key: 'sampleBarcode', value: '6221000000001' },
    { key: 'samplePhotoId', value: '' },
    { key: 'signedMediaToken', value: '' },
    { key: 'oauthProvider', value: 'google' }
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
              features: ['adaptive_nutrition', 'adaptive_workouts', 'native_cloudflare_auth', 'kmm_bootstrap', 'offline_sync']
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
      name: '02. Authentication (Google & Apple OIDC)',
      description: 'Passwordless Google Sign-In & Apple Sign-In OIDC verification on Cloudflare Workers + D1, issuing first-party HS256 Access JWTs (15 min) and rotating D1 Refresh Tokens (30 days) with replay reuse detection.',
      item: [
        req({
          name: 'Sign In / Register with Google OIDC',
          method: 'POST',
          path: '/v1/auth/oauth/google',
          noAuth: true,
          summary: 'Verifies a Google ID token JWKS signature directly on Cloudflare Workers and issues first-party CuraFit tokens (creates a new D1 user on first sign-in or signs into an existing linked account). Auto-saves tokens in Postman.',
          fields: [
            { name: 'idToken', type: 'string (JWT)', required: true, constraints: 'Google OIDC ID token', description: 'Signed Google ID token from mobile Google Sign-In.' },
            { name: 'deviceId', type: 'string', required: false, constraints: 'max 120 chars', description: 'Client device identifier.' },
            { name: 'name', type: 'string', required: false, constraints: 'max 100 chars', description: 'Optional display name fallback.' },
            { name: 'fullName', type: 'string', required: false, constraints: 'max 100 chars', description: 'Optional full name fallback.' },
            { name: 'linkExisting', type: 'boolean', required: false, constraints: 'default: false', description: 'When `true`, links Google to an existing verified account sharing the same verified email.' }
          ],
          responseFields: AUTH_RESPONSE_FIELDS,
          errors: [
            { status: 401, code: 'AUTH_OAUTH_TOKEN_INVALID', description: 'Google ID token is missing, expired, malformed, or fails JWKS verification.' },
            { status: 409, code: 'AUTH_PROVIDER_EMAIL_CONFLICT', description: 'Email is already associated with another OIDC provider; pass `linkExisting: true` after confirmation.' },
            { status: 429, code: 'RATE_LIMITED', description: 'Auth endpoint rate limit exceeded (30 req/min/IP).' }
          ],
          examples: [AUTH_TOKEN_EXAMPLE(200), AUTH_TOKEN_EXAMPLE(201)],
          body: { idToken: '<google-oidc-id-token>', deviceId: '{{deviceId}}', name: 'CuraFit User' },
          testScript: [
            ...SAVE_AUTH_TOKENS_TEST,
            'if (pm.response.code === 201) {',
            '  pm.collectionVariables.set("revision", "0");',
            '}'
          ]
        }),
        req({
          name: 'Sign In / Register with Apple OIDC',
          method: 'POST',
          path: '/v1/auth/oauth/apple',
          noAuth: true,
          summary: 'Verifies an Apple identity token JWKS signature directly on Cloudflare Workers and issues first-party CuraFit tokens (exchanging `authorizationCode` for encrypted revocation storage on first Apple login). Auto-saves tokens in Postman.',
          fields: [
            { name: 'identityToken', type: 'string (JWT)', required: true, constraints: 'Apple OIDC identity token', description: 'Signed Apple identity token from Sign in with Apple.' },
            { name: 'authorizationCode', type: 'string', required: false, constraints: 'Optional first-login code', description: 'Exchanged for encrypted Apple refresh token for GDPR revocation.' },
            { name: 'fullName', type: 'string', required: false, constraints: 'max 100 chars', description: 'Optional display name sent on first Apple login.' },
            { name: 'name', type: 'string', required: false, constraints: 'max 100 chars', description: 'Optional display name alias.' },
            { name: 'deviceId', type: 'string', required: false, constraints: 'max 120 chars', description: 'Client device identifier.' },
            { name: 'linkExisting', type: 'boolean', required: false, constraints: 'default: false', description: 'When `true`, links Apple to an existing verified account sharing the same verified email.' }
          ],
          responseFields: AUTH_RESPONSE_FIELDS,
          errors: [
            { status: 401, code: 'AUTH_OAUTH_TOKEN_INVALID', description: 'Apple identity token is missing, expired, malformed, or fails JWKS verification.' },
            { status: 409, code: 'AUTH_PROVIDER_EMAIL_CONFLICT', description: 'Email is already associated with another OIDC provider; pass `linkExisting: true` after confirmation.' },
            { status: 429, code: 'RATE_LIMITED', description: 'Auth endpoint rate limit exceeded (30 req/min/IP).' }
          ],
          examples: [AUTH_TOKEN_EXAMPLE(200), AUTH_TOKEN_EXAMPLE(201)],
          body: { identityToken: '<apple-oidc-identity-token>', authorizationCode: '<optional-auth-code>', fullName: 'CuraFit User', deviceId: '{{deviceId}}' },
          testScript: [
            ...SAVE_AUTH_TOKENS_TEST,
            'if (pm.response.code === 201) {',
            '  pm.collectionVariables.set("revision", "0");',
            '}'
          ]
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
            { name: 'isAnonymous', type: 'boolean', description: '`false` for verified OIDC JWT users.' },
            { name: 'scopes', type: 'Array<string>', description: 'Granted scopes (`["coach:read","coach:write"]`).' },
            { name: 'entitlement', type: 'string (enum)', description: '`free` | `pro`.' },
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
          name: 'Claim Anonymous Web Session',
          method: 'POST',
          path: '/v1/auth/claim-anonymous',
          summary: 'Atomically migrates a legacy Web anonymous trial account (`anon:...`) into the logged-in verified account. Requires owning `coach_uid` Web cookie + explicit `consent: true` (Web-only).',
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
          noAuth: true,
          summary: 'Public fast deterministic pre-onboarding screening checking age (18..70), BMI boundaries (12.5..65), medical conditions, injuries, and maternal status before plan generation.',
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
          summary: 'Generates the next 7-day nutrition plan after the active plan\'s end date has elapsed, or early when `earlyRenew: true` (starting today while keeping today\'s meals; Pro-gated when enforcement is enabled).',
          payloadFields: [
            { name: 'earlyRenew', type: 'boolean', required: false, constraints: 'default: false (Pro when true)', description: 'When `true`, regenerates a full 7-day plan starting today while preserving today\'s meals.' }
          ],
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
          summary: 'Returns actual food entries, nullable nutrient totals, completion status, and planned energy target for a specific user-local date or `from..to` range (up to 62 days).',
          queryParams: [
            { key: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'User-local calendar date.' },
            { key: 'from', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Optional range start (with `to`)', description: 'Range start date (inclusive).' },
            { key: 'to', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Optional range end (max 62 days)', description: 'Range end date (inclusive).' }
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
          name: 'Log Food Entries Batch (food_entry_batch)',
          action: 'food_entry_batch',
          summary: 'Atomically logs 1..15 food entries (multi-select quick-log tray across recent, planned, ingredient, recipe, barcode, or manual items) in a single request.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Optional batch default date', description: 'Default date applied when omitted per item.' },
            { name: 'slot', type: 'string (enum)', required: false, constraints: 'Optional batch default slot', description: 'Default slot applied when omitted per item.' },
            { name: 'displaySlot', type: 'string (enum)', required: false, constraints: '`suhoor` | `iftar` | `ramadan_snack` | null', description: 'Optional batch default Ramadan display slot.' },
            { name: 'items', type: 'Array<object>', required: true, constraints: '1..15 food_entry objects', description: 'Array of food entries to validate and commit atomically.' }
          ],
          payload: {
            date: '{{todayDate}}',
            slot: 'breakfast',
            items: [
              { source: 'ingredient', key: 'egg', grams: 120 },
              { source: 'manual', name: 'Espresso Without Sugar', energy: 5 }
            ]
          }
        }),
        cmdReq({
          name: 'Update Food Entry Atomically (food_entry_update)',
          action: 'food_entry_update',
          summary: 'Atomically edits an existing food entry in place (preserving ID, scaling without 0.1..4.0 clamp, converting grams/servings, and updating displaySlot).',
          payloadFields: [
            { name: 'id', type: 'string (UUID)', required: true, constraints: 'Existing food entry ID', description: 'Food entry ID to update.' },
            { name: 'slot', type: 'string (enum)', required: false, constraints: '`breakfast` | `lunch` | `dinner` | `snack`', description: 'Updated meal slot.' },
            { name: 'displaySlot', type: 'string (enum) | null', required: false, constraints: '`suhoor` | `iftar` | `ramadan_snack` | null', description: 'Updated Ramadan display slot.' },
            { name: 'quantity', type: 'number', required: false, constraints: '0.1..10 (planned entries)', description: 'Updated portion multiplier.' },
            { name: 'grams', type: 'number', required: false, constraints: '1..5000 (ingredient/recipe entries)', description: 'Updated weight in grams.' },
            { name: 'servings', type: 'number', required: false, constraints: '0.1..20 (recipe entries)', description: 'Updated recipe servings.' },
            { name: 'name', type: 'string', required: false, constraints: '1..120 chars (manual entries)', description: 'Updated label.' },
            { name: 'energy', type: 'number', required: false, constraints: '0..5000 (manual entries)', description: 'Updated calories.' }
          ],
          payload: { id: '{{sampleFoodEntryId}}', slot: 'dinner', energy: 510, protein: 18 }
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
          summary: 'Idempotent batch ingestion of up to 100 weight/steps/activity/cardio records from Android Health Connect or Apple HealthKit with partial skippedRecords[] reporting.',
          headers: [{ key: 'Idempotency-Key', value: '{{idempotencyKey}}', required: false, description: 'Optional UUID (server derives canonical digest key if omitted).' }],
          fields: [
            { name: 'records', type: 'Array<object>', required: true, constraints: '1..100 records', description: 'Array of wearable records.' },
            { name: 'records[].type', type: 'string (enum)', required: true, constraints: '`weight` | `steps` | `activity` | `cardio`', description: 'Record type.' },
            { name: 'records[].date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Past 90 days..today', description: 'Record date.' },
            { name: 'records[].kg', type: 'number', required: false, constraints: 'Required for `weight` (35..250)', description: 'Weight in kg.' },
            { name: 'records[].steps', type: 'integer', required: false, constraints: '0..100000', description: 'Steps count.' },
            { name: 'records[].activeEnergyKcal', type: 'number', required: false, constraints: '0..5000', description: 'Active calories.' },
            { name: 'records[].modality', type: 'string', required: false, constraints: 'For `cardio` (walking, running, cycling, swimming, etc.)', description: 'Cardio modality.' },
            { name: 'records[].durationMinutes', type: 'integer', required: false, constraints: 'For `cardio` (5..360)', description: 'Cardio duration in minutes.' },
            { name: 'records[].externalRecordId', type: 'string', required: false, constraints: 'max 120 chars', description: 'Deduplication ID.' }
          ],
          responseFields: [
            { name: 'ok', type: 'boolean', description: '`true`.' },
            { name: 'revision', type: 'integer', description: 'Updated account revision.' },
            { name: 'ingested', type: 'integer', description: 'Count of processed records.' },
            { name: 'skippedRecords', type: 'Array<object>', description: 'Validation-skipped records without blocking valid rows.' }
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
          summary: 'Fetches full owned workout plan enriched with days, exercises, targetRepsRange, targetRir, restSeconds, and weeklyMuscleSets.',
          pathParams: [{ key: 'activeWorkoutPlanId', type: 'string (UUID)', required: true, description: 'Owned workout plan ID.' }]
        }),
        cmdReq({
          name: 'Log Exercise Sets (workout)',
          action: 'workout',
          summary: 'Logs performed sets (`kg`/`addedKg`, `reps`, `rir`, `pain`, `setType`) plus optional session notes and computes progression suggestions.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Defaults to today', description: 'Exposure date.' },
            { name: 'dayIndex', type: 'integer', required: true, constraints: '0..6 (`0=Sun .. 6=Sat`)', description: 'Workout day index in active plan.' },
            { name: 'exerciseId', type: 'string', required: true, constraints: 'Must exist in day\'s exercises', description: 'Exercise ID.' },
            { name: 'weightedBodyweight', type: 'boolean', required: false, constraints: 'Opt-in loaded bodyweight', description: 'Enables addedKg/kg tracking for supported bodyweight movements.' },
            { name: 'sets', type: 'Array<object>', required: true, constraints: '1..10 sets: `{ kg?: 0..500, addedKg?: 0..500, reps: int 1..100, rir?: 0..10, pain?: boolean, setType?: string }`', description: 'Performed sets.' },
            { name: 'bothSides', type: 'boolean', required: false, constraints: 'default: true (`false` pauses unilateral progression)', description: 'Confirms both sides completed.' },
            { name: 'increment', type: 'number | null', required: false, constraints: '0.1..20 (kg)', description: 'Optional preferred load step.' },
            { name: 'notes', type: 'string', required: false, constraints: 'max 300 chars', description: 'Optional exercise performance notes.' },
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
          summary: 'Paginated exercise set/rep/load logs ordered by date descending, optionally filtered by `exerciseId`.',
          queryParams: [
            ...PAGINATION_QUERY_PARAMS,
            { key: 'exerciseId', type: 'string', required: false, constraints: 'Optional exercise ID filter', description: 'Filter history to one exercise.' }
          ],
          responseFields: PAGINATION_RESPONSE_FIELDS
        }),
        cmdReq({
          name: 'Delete Exercise Log (workout_delete)',
          action: 'workout_delete',
          summary: 'Deletes a logged exercise set record by ID (or by `date`, `dayIndex`, and `exerciseId`).',
          payloadFields: [
            { name: 'id', type: 'string (UUID)', required: false, constraints: 'Existing workout log ID (or pass `date` + `dayIndex` + `exerciseId`)', description: 'Workout log ID to delete.' },
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Optional composite key fallback', description: 'Workout date.' },
            { name: 'dayIndex', type: 'integer', required: false, constraints: '0..6', description: 'Workout day index.' },
            { name: 'exerciseId', type: 'string', required: false, constraints: 'Exercise ID', description: 'Exercise ID.' }
          ],
          payload: { date: '{{todayDate}}', dayIndex: '__DAY_IDX__', exerciseId: '{{sampleExerciseId}}' }
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
            { name: 'rpe', type: 'number | null', required: false, constraints: '0..10', description: 'Session perceived exertion.' },
            { name: 'notes', type: 'string | null', required: false, constraints: 'max 300 chars', description: 'Optional workout session notes.' }
          ],
          payload: { date: '{{todayDate}}', dayIndex: '__DAY_IDX__', status: 'completed', duration: 45, rpe: 7 }
        }),
        cmdReq({
          name: 'Delete Workout Session (session_delete)',
          action: 'session_delete',
          summary: 'Deletes a logged workout session record by ID (or `date` + `dayIndex`) and optionally clears its exercise logs (`deleteWorkouts: true`).',
          payloadFields: [
            { name: 'id', type: 'string (UUID)', required: false, constraints: 'Existing session ID (or pass `date` + `dayIndex`)', description: 'Session ID to delete.' },
            { name: 'date', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Optional composite key fallback', description: 'Session date.' },
            { name: 'dayIndex', type: 'integer', required: false, constraints: '0..6', description: 'Workout day index.' },
            { name: 'deleteWorkouts', type: 'boolean', required: false, constraints: 'default: false', description: 'When `true`, also removes exercise logs from that session.' }
          ],
          payload: { date: '{{todayDate}}', dayIndex: '__DAY_IDX__', deleteWorkouts: false }
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
          summary: 'Creates a pending schedule adaptation proposal moving a workout day to a rest day within the next 13 days (returns `409 SESSION_ALREADY_COMPLETED` if completed).',
          payloadFields: [
            { name: 'dayIndex', type: 'integer', required: true, constraints: '0..6', description: 'Workout day to move.' },
            { name: 'toDate', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Rest day within `today..today+13`', description: 'Target date.' }
          ],
          payload: { dayIndex: '__DAY_IDX__', toDate: '{{sampleRescheduleDate}}' }
        }),
        req({
          name: 'Get 8-Week Split Review',
          method: 'GET',
          path: '/v1/workouts/split-review',
          summary: 'Evaluates 8-week Full Body split progression readiness returning `{ due, kind, code, params, text }` in canonical pure English.'
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
            { name: 'ramadanSuhoorReminder', type: 'boolean', required: false, constraints: 'boolean', description: 'Ramadan pre-dawn Suhoor reminder.' },
            { name: 'exemptSuhoorFromQuietHours', type: 'boolean', required: false, constraints: 'boolean', description: 'Allow Suhoor alert even during quiet hours.' },
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
          summary: 'Records one or a batch (`items[]`) of versioned explicit user consents in Cloudflare D1 (`coaching_account_consents`).',
          fields: [
            { name: 'consentType', type: 'string', required: false, constraints: 'max 60 chars (single mode)', description: 'Consent category (e.g. `health_data_processing`).' },
            { name: 'version', type: 'string', required: false, constraints: 'max 30 chars (single mode)', description: 'Policy/terms version string.' },
            { name: 'accepted', type: 'boolean', required: false, constraints: 'boolean (single mode)', description: 'Whether accepted or withdrawn.' },
            { name: 'items', type: 'Array<object>', required: false, constraints: '1..10 items `{ consentType, version, accepted }`', description: 'Atomic batch consent payload alternative to single fields.' }
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
          examples: [{ name: '200 OK — Permanently Deleted', code: 200, body: { deleted: true, userId: 'user:1a2b', deletedAt: '2026-11-21T12:40:00.000Z', tablesCleared: 28, namespacesCleared: 1, appleTokenRevoked: false, mediaObjectsDeleted: 0 } }],
          body: { confirm: true }
        }),
        req({
          name: 'List Privacy / Health Consents',
          method: 'GET',
          path: '/v1/account/consents',
          summary: 'Lists all persisted legal and medical disclaimer consents for the signed-in account.'
        }),
        req({
          name: 'Submit In-App Support Feedback',
          method: 'POST',
          path: '/v1/support/feedback',
          summary: 'Creates a persisted support ticket or catalog correction report in D1.',
          fields: [
            { name: 'category', type: 'string (enum)', required: true, constraints: '`bug` | `feature` | `food_catalog_correction` | `exercise_catalog_correction` | `billing` | `other`', description: 'Feedback category.' },
            { name: 'message', type: 'string', required: true, constraints: '3..2000 chars', description: 'User message describing the report.' },
            { name: 'includeDiagnostics', type: 'boolean', required: false, constraints: 'default: false', description: 'Include non-PII diagnostic metadata.' },
            { name: 'appVersion', type: 'string', required: false, constraints: 'max 40 chars', description: 'Client app version.' },
            { name: 'platform', type: 'string', required: false, constraints: '`android` | `ios` | `web`', description: 'Client platform.' }
          ],
          body: { category: 'food_catalog_correction', message: 'Please verify protein per 100g on item #104.', includeDiagnostics: true, appVersion: '1.0.0', platform: 'android' }
        })
      ]
    },
    {
      id: 'f0000014-0000-4000-8000-000000000014',
      name: '13. OAuth Linking, Plan Preview & Profile',
      description: 'Linked OAuth provider management (Google/Apple), stateless onboarding plan preview, profile updates, and Comeback Protocol.',
      item: [
        req({
          name: 'Preview Onboarding Plan (Public)',
          method: 'POST',
          path: '/v1/plans/preview',
          noAuth: true,
          summary: 'Stateless onboarding calculation returning daily kcal/macros, safe calorie floors, `restDayWaterTarget`, `workoutDayWaterTarget`, `estimatedExercisesPerSession`, eligibility, and weekly forecast range.',
          fields: [
            { name: 'name', type: 'string', required: false, constraints: 'max 100 chars', description: 'Optional display name.' },
            { name: 'age', type: 'integer', required: true, constraints: '18..70', description: 'Age in years.' },
            { name: 'sex', type: 'string (enum)', required: true, constraints: '`male` | `female`', description: 'Biological sex.' },
            { name: 'weight', type: 'number', required: true, constraints: '35..250 (kg)', description: 'Current body weight in kg.' },
            { name: 'height', type: 'number', required: true, constraints: '120..230 (cm)', description: 'Height in cm.' },
            { name: 'goal', type: 'string (enum)', required: true, constraints: '`lose` | `maintain` | `gain` | `muscle_gain`', description: 'Primary coaching goal.' },
            { name: 'targetWeight', type: 'number | null', required: false, constraints: '35..250 (kg)', description: 'Optional target weight.' },
            { name: 'activity', type: 'string (enum)', required: false, constraints: '`sedentary` | `light` | `moderate` | `active`', description: 'Daily activity level.' },
            { name: 'dietType', type: 'string (enum)', required: false, constraints: 'Supported diet enum', description: 'Dietary pattern.' },
            { name: 'serviceTrack', type: 'string (enum)', required: false, constraints: '`nutrition_only` | `workouts_only` | `nutrition_and_workouts`', description: 'Coaching track.' },
            { name: 'selectedWorkoutDays', type: 'Array<integer>', required: false, constraints: '0..6', description: 'Selected weekly workout days.' },
            { name: 'healthConfirmed', type: 'boolean', required: false, constraints: 'boolean', description: 'Health clearance confirmation.' }
          ],
          body: { name: 'Preview User', age: 30, sex: 'male', weight: 82, height: 178, goal: 'lose', targetWeight: 75, activity: 'moderate', dietType: 'balanced', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }
        }),
        req({
          name: 'List Linked OAuth Providers',
          method: 'GET',
          path: '/v1/auth/oauth/providers',
          summary: 'Returns linked Google and Apple OAuth identities for the authenticated user.'
        }),
        req({
          name: 'Link OAuth Provider (Google or Apple)',
          method: 'POST',
          path: '/v1/auth/oauth/link',
          summary: 'Links an additional Google or Apple OIDC identity to the currently signed-in account.',
          fields: [
            { name: 'provider', type: 'string (enum)', required: true, constraints: '`google` | `apple`', description: 'OAuth provider to link.' },
            { name: 'idToken', type: 'string (JWT)', required: false, constraints: 'Required for `google`', description: 'Verified Google ID token.' },
            { name: 'identityToken', type: 'string (JWT)', required: false, constraints: 'Required for `apple`', description: 'Verified Apple identity token.' },
            { name: 'authorizationCode', type: 'string', required: false, constraints: 'Optional for `apple`', description: 'Apple authorization code for refresh-token exchange.' }
          ],
          body: { provider: 'google', idToken: '<google-oidc-id-token>' }
        }),
        req({
          name: 'Unlink OAuth Provider',
          method: 'DELETE',
          path: '/v1/auth/oauth/{{oauthProvider}}',
          summary: 'Unlinks Google or Apple from the signed-in account. Returns `409 CANNOT_UNLINK_LAST_AUTH_METHOD` if it is the last sign-in method.',
          pathParams: [
            { key: 'oauthProvider', type: 'string (enum)', required: true, description: '`google` | `apple`.' }
          ]
        }),
        cmdReq({
          name: 'Update Profile Settings (profile_update)',
          action: 'profile_update',
          summary: 'Updates non-regenerative profile metadata such as display name, preferred measurement unit system, or workout UI mode.',
          payloadFields: [
            { name: 'name', type: 'string', required: false, constraints: 'max 100 chars', description: 'Updated display name.' },
            { name: 'unitSystem', type: 'string (enum)', required: false, constraints: '`metric` | `imperial`', description: 'Preferred measurement unit system.' },
            { name: 'workoutUiMode', type: 'string (enum)', required: false, constraints: '`simple` | `pro`', description: 'Workout logger UI mode.' }
          ],
          payload: { name: 'Updated Name', unitSystem: 'metric', workoutUiMode: 'pro' }
        }),
        cmdReq({
          name: 'Activate Comeback Protocol (comeback_restart)',
          action: 'comeback_restart',
          summary: 'Activates a safe deload or 7-day volume ramp-in after a training gap, optionally updating current weight and renewing the meal plan.',
          payloadFields: [
            { name: 'mode', type: 'string (enum)', required: false, constraints: '`24h_deload` | `7d_ramp` (optional when `applyDeload` is set)', description: 'Comeback protocol mode.' },
            { name: 'applyDeload', type: 'boolean', required: false, constraints: 'boolean', description: 'Whether to apply a temporary deload/volume ramp.' },
            { name: 'deloadDurationDays', type: 'integer', required: false, constraints: '1..14', description: 'Optional deload duration in days.' },
            { name: 'updatedWeightKg', type: 'number', required: false, constraints: '35..250', description: 'Optional updated body weight in kg (alias `currentWeightKg`).' },
            { name: 'reason', type: 'string', required: false, constraints: 'max 200 chars', description: 'Optional comeback reason (e.g. `travel`, `illness`, `busy`).' },
            { name: 'renewMealPlan', type: 'boolean', required: false, constraints: 'default: false', description: 'When `true`, refreshes the nutrition plan starting today.' }
          ],
          payload: { mode: '7d_ramp', applyDeload: true, deloadDurationDays: 7, updatedWeightKg: 81.2 }
        })
      ]
    },
    {
      id: 'f0000015-0000-4000-8000-000000000015',
      name: '14. Nutrition Tools — Pantry, Grocery, Favorites, Barcode & Fasting',
      description: 'Pantry catalog & meal matching, plan grocery lists, favorites, copy meal, EAN barcode lookup/submit, and intermittent fasting / Ramadan timer.',
      item: [
        req({ name: 'Get Pantry Ingredient Catalog', method: 'GET', path: '/v1/pantry/catalog', summary: 'Returns all pantry ingredient keys grouped by category with English & Arabic labels.' }),
        req({
          name: 'Find Pantry Meal Alternatives',
          method: 'POST',
          path: '/v1/pantry/alternatives',
          summary: 'Matches user pantry ingredients against safe meal templates (Free feature).',
          fields: [
            { name: 'selectedIngredients', type: 'Array<string>', required: true, constraints: '1..40 pantry keys', description: 'Selected pantry ingredient keys.' },
            { name: 'slot', type: 'string (enum)', required: false, constraints: '`breakfast` | `lunch` | `dinner` | `snack`', description: 'Optional meal slot filter.' },
            { name: 'limit', type: 'integer', required: false, constraints: '1..30 (default 15)', description: 'Maximum matched meals returned.' }
          ],
          body: { selectedIngredients: ['eggs', 'fava', 'olive', 'tomato'], limit: 15 }
        }),
        req({
          name: 'Get Plan Grocery List',
          method: 'GET',
          path: '/v1/plans/{{activePlanId}}/grocery-list?days=all',
          summary: 'Aggregated shopping list (`days=all|remaining|3|7`) with checked item state (Pro feature; append `?preview=true` for Free 2-item teaser).',
          queryParams: [
            { key: 'days', type: 'string (enum)', required: false, constraints: '`all` | `remaining` | `3` | `7`', description: 'Day window filter.' },
            { key: 'preview', type: 'boolean', required: false, constraints: 'default: false (`true` = Free teaser)', description: 'Returns 2 sample items + lock count for Free tier.' }
          ]
        }),
        cmdReq({
          name: 'Toggle Grocery Item (grocery_toggle)',
          action: 'grocery_toggle',
          summary: 'Persists checked/unchecked state for a grocery list item.',
          payloadFields: [
            { name: 'planId', type: 'string', required: true, constraints: 'Active plan ID', description: 'Nutrition plan identifier.' },
            { name: 'ingredientKey', type: 'string', required: true, constraints: 'Non-empty string', description: 'Grocery ingredient key.' },
            { name: 'checked', type: 'boolean', required: true, constraints: 'boolean', description: 'Checked state.' }
          ],
          payload: { planId: '{{activePlanId}}', ingredientKey: 'egg', checked: true }
        }),
        req({
          name: 'List Recent Logged Foods',
          method: 'GET',
          path: '/v1/foods/recent?days=30&limit=25',
          summary: 'Returns recently logged unique foods ranked by frequency and recency for zero-query rapid logging.',
          queryParams: [
            { key: 'days', type: 'integer', required: false, constraints: '1..90 (default 30)', description: 'Lookback window in days.' },
            { key: 'limit', type: 'integer', required: false, constraints: '1..50 (default 25)', description: 'Max unique items returned.' }
          ]
        }),
        req({ name: 'List Food Favorites', method: 'GET', path: '/v1/foods/favorites?offset=0&limit=40', summary: 'Returns pinned/favorite foods for quick logging.' }),
        cmdReq({
          name: 'Toggle Food Favorite (food_favorite)',
          action: 'food_favorite',
          summary: 'Pins or unpins a food item (`planned`, `ingredient`, `recipe`, `barcode`, or `manual`) as a user favorite.',
          payloadFields: [
            { name: 'op', type: 'string (enum)', required: true, constraints: '`add` | `remove`', description: 'Favorite operation.' },
            { name: 'item', type: 'object', required: true, constraints: 'Food item descriptor', description: 'Food item to pin or remove.' }
          ],
          payload: { op: 'add', item: { name: 'Boiled Eggs', source: 'ingredient', key: 'egg', grams: 120 } }
        }),
        cmdReq({
          name: 'Copy Meals from Previous Day (copy_meal)',
          action: 'copy_meal',
          summary: 'Copies logged food entries (all, by slot, or specific `entryIds[]`) into `toDate` and optional target `toSlot`.',
          payloadFields: [
            { name: 'fromDate', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Source log date.' },
            { name: 'toDate', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Destination log date.' },
            { name: 'slot', type: 'string (enum)', required: false, constraints: '`breakfast` | `lunch` | `dinner` | `snack`', description: 'Optional source meal slot filter.' },
            { name: 'toSlot', type: 'string (enum)', required: false, constraints: '`breakfast` | `lunch` | `dinner` | `snack`', description: 'Optional destination slot override.' },
            { name: 'entryIds', type: 'Array<string>', required: false, constraints: '1..30 entry IDs', description: 'Specific entry IDs from `fromDate` to copy.' }
          ],
          payload: { fromDate: '{{todayDate}}', toDate: '{{todayDate}}', slot: 'breakfast' }
        }),
        req({ name: 'Lookup Packaged Food by Barcode', method: 'GET', path: '/v1/foods/barcode/{{sampleBarcode}}', summary: 'Looks up a packaged food product by EAN/UPC barcode (D1 cache + OpenFoodFacts fallback; Pro feature when enforcement is enabled).' }),
        req({
          name: 'Submit User Barcode Food',
          method: 'POST',
          path: '/v1/foods/barcode',
          summary: 'Contributes a packaged food barcode item to D1 (Pro feature when enforcement is enabled).',
          fields: [
            { name: 'barcode', type: 'string', required: true, constraints: '8..14 numeric digits', description: 'EAN/UPC barcode string.' },
            { name: 'nameEn', type: 'string', required: true, constraints: '2..120 chars', description: 'English product name.' },
            { name: 'brand', type: 'string', required: false, constraints: 'max 80 chars', description: 'Brand name.' },
            { name: 'servingSizeGrams', type: 'number', required: false, constraints: '1..2000', description: 'Default serving size in grams.' },
            { name: 'servingLabel', type: 'string', required: false, constraints: 'max 40 chars', description: 'Optional human-friendly serving label (e.g. `1 cup`, `1 bar`).' },
            { name: 'valuesPer100g', type: 'object', required: true, constraints: '`{ energy, protein, carbs, fat, saturated?, fiber?, sodium?, sugars? }`', description: 'Nutrition facts per 100g.' }
          ],
          body: { barcode: '6221000000001', nameEn: 'Greek Yogurt Plain', brand: 'Local Dairy', servingSizeGrams: 170, valuesPer100g: { energy: 97, protein: 9.0, carbs: 3.6, fat: 5.0 } }
        }),
        req({ name: 'Get Fasting / Ramadan Timer State', method: 'GET', path: '/v1/nutrition/fasting-state', summary: 'Returns active intermittent fasting or Ramadan window progress (Free feature).' }),
        cmdReq({
          name: 'Start / End Fasting Log (fasting_log)',
          action: 'fasting_log',
          summary: 'Starts or completes a fasting session log.',
          payloadFields: [
            { name: 'op', type: 'string (enum)', required: true, constraints: '`start` | `end`', description: 'Fasting session action.' },
            { name: 'protocol', type: 'string', required: false, constraints: '`16_8` | `14_10` | `18_6` | `ramadan`', description: 'Fasting protocol identifier.' },
            { name: 'targetHours', type: 'number', required: false, constraints: '8..24', description: 'Target fast duration in hours.' }
          ],
          payload: { op: 'start', protocol: '16_8', targetHours: 16 }
        }),
        cmdReq({
          name: 'Toggle Ramadan Mode (ramadan_mode)',
          action: 'ramadan_mode',
          summary: 'Enables or disables Ramadan Iftar/Suhoor meal slot remapping with automatic post-Ramadan reversion (Free feature; works for both nutrition and workouts-only users).',
          payloadFields: [
            { name: 'enabled', type: 'boolean', required: true, constraints: 'boolean', description: 'Whether Ramadan mode is enabled.' },
            { name: 'iftarTime', type: 'string (HH:mm)', required: false, constraints: '`00:00`..`23:59`', description: 'Local Iftar start time.' },
            { name: 'suhoorCutoffTime', type: 'string (HH:mm)', required: false, constraints: '`00:00`..`23:59`', description: 'Local Suhoor cutoff time.' },
            { name: 'endDate', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Optional Eid/Ramadan end date', description: 'Optional auto-expiration date for Ramadan mode.' }
          ],
          payload: { enabled: true, iftarTime: '18:15', suhoorCutoffTime: '04:00' }
        }),
        cmdReq({
          name: 'Toggle Seasonal / Eid Flex Mode (seasonal_flex)',
          action: 'seasonal_flex',
          summary: 'Activates temporary maintenance calories (`tdee`) and automatic `flexDates` streak protection for Eid, travel, or seasonal breaks (1..7 days, Free feature).',
          payloadFields: [
            { name: 'enabled', type: 'boolean', required: true, constraints: 'boolean', description: 'Enable or disable Seasonal Flex Mode.' },
            { name: 'occasion', type: 'string (enum)', required: false, constraints: '`eid_fitr` | `eid_adha` | `travel` | `custom`', description: 'Seasonal occasion tag.' },
            { name: 'endDate', type: 'string (YYYY-MM-DD)', required: false, constraints: '`today`..`today+7d` (default `+2d`)', description: 'Last inclusive date for maintenance/flex protection.' },
            { name: 'dismissEidPrompt', type: 'boolean', required: false, constraints: 'Optional when `enabled: false`', description: 'Dismisses the post-Ramadan Eid prompt cleanly.' }
          ],
          payload: { enabled: true, occasion: 'eid_fitr' }
        }),
        req({
          name: 'List Saved Custom Recipes',
          method: 'GET',
          path: '/v1/recipes?offset=0&limit=20',
          summary: 'Lists the user\'s saved multi-ingredient home recipes ("My Recipes") with optional text search `q` (Free feature).'
        }),
        cmdReq({
          name: 'Save Custom Home Recipe (recipe_save)',
          action: 'recipe_save',
          summary: 'Creates or updates a saved multi-ingredient home recipe (max 100 recipes) with cooked yield (`finalWeightGrams`), custom additions, `ml` liquid conversions, and quality tier (Free feature).',
          payloadFields: [
            { name: 'id', type: 'string', required: false, constraints: 'Optional UUID for update', description: 'Existing recipe ID to update in place.' },
            { name: 'name', type: 'string', required: true, constraints: '2..80 chars', description: 'Recipe display name.' },
            { name: 'servings', type: 'number', required: true, constraints: '0.5..30', description: 'Total servings produced by the recipe batch.' },
            { name: 'finalWeightGrams', type: 'number', required: false, constraints: '20..15000 (cooked batch yield)', description: 'Optional final cooked batch weight for accurate yield ratio.' },
            { name: 'items', type: 'Array<object>', required: true, constraints: '1..25 items `{ foodId, grams? , ml? }`', description: 'Catalog ingredient IDs with grams or ml (auto-converted by density).' },
            { name: 'additions', type: 'Array<object>', required: false, constraints: '0..10 items `{ name, energy, protein?, carbs?, fat?, grams? }`', description: 'Optional non-catalog additions (spices, sauces, oils).' },
            { name: 'notes', type: 'string', required: false, constraints: 'max 300 chars', description: 'Optional preparation notes.' }
          ],
          payload: { name: 'Home Grilled Chicken Rice Bowl', servings: 2, items: [{ foodId: 'chicken', grams: 300 }, { foodId: 'rice', grams: 200 }] }
        }),
        cmdReq({
          name: 'Delete Custom Home Recipe (recipe_delete)',
          action: 'recipe_delete',
          summary: 'Deletes a saved custom recipe while preserving frozen historical food diary snapshots intact.',
          payloadFields: [
            { name: 'id', type: 'string', required: true, constraints: 'Saved recipe ID', description: 'ID of the saved recipe to delete.' }
          ],
          payload: { id: 'recipe-id-placeholder' }
        })
      ]
    },
    {
      id: 'f0000016-0000-4000-8000-000000000016',
      name: '15. Workouts Insights, Cardio, Cycle Awareness, Analytics & Widgets',
      description: 'Workout UI modes, ad-hoc exercises, dedicated cardio sessions, optional female cycle awareness, PR engine, multi-series progress analytics, weekly wrapped, body measurements, streak freeze, and home-screen widget snapshots.',
      item: [
        cmdReq({
          name: 'Set Workout UI Mode (workout_ui_mode)',
          action: 'workout_ui_mode',
          summary: 'Switches between simple (bodyweight/rep-focused) and pro (load + RIR) workout logging.',
          payloadFields: [
            { name: 'mode', type: 'string (enum)', required: true, constraints: '`simple` | `pro`', description: 'Target workout logging UI mode.' }
          ],
          payload: { mode: 'pro' }
        }),
        cmdReq({
          name: 'Add Ad-Hoc Exercise (ad_hoc_exercise)',
          action: 'ad_hoc_exercise',
          summary: 'Adds a bonus exercise to a specific workout date without mutating baseline progression. Returns `409 AD_HOC_INJURY_WARNING` if unsafe for declared injuries unless `overrideInjuryWarning: true`.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Workout session date.' },
            { name: 'exerciseId', type: 'string', required: true, constraints: 'Catalog exercise ID', description: 'Exercise ID from `/v1/exercises`.' },
            { name: 'sets', type: 'Array<object>', required: true, constraints: '1..15 set objects `{ reps, kg, rir?, isWarmup? }`', description: 'Logged ad-hoc sets.' },
            { name: 'overrideInjuryWarning', type: 'boolean', required: false, constraints: 'default: false', description: 'Explicit confirmation to log despite an injury caution.' }
          ],
          payload: { date: '{{todayDate}}', exerciseId: '{{sampleCatalogExerciseId}}', sets: [{ reps: 12, kg: 10 }] }
        }),
        req({ name: 'List Dedicated Cardio Logs', method: 'GET', path: '/v1/cardio-logs?offset=0&limit=30', summary: 'Lists dedicated walking/running/cycling/swimming/HIIT cardio sessions with summary totals (Free feature).' }),
        cmdReq({
          name: 'Log Cardio Session (cardio_log)',
          action: 'cardio_log',
          summary: 'Logs a dedicated cardio or walking session with deterministic MET calorie estimation, rest-day hydration boost (>=30m), streak credit (>=20m), and non-blocking high-impact safety cautions (Free feature).',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Cardio session date.' },
            { name: 'modality', type: 'string (enum)', required: true, constraints: '`walking` | `brisk_walking` | `running` | `cycling` | `stationary_bike` | `swimming` | `elliptical` | `rowing` | `jump_rope` | `hiit`', description: 'Cardio modality.' },
            { name: 'durationMinutes', type: 'integer', required: true, constraints: '5..360', description: 'Session duration in minutes.' },
            { name: 'intensity', type: 'string (enum)', required: true, constraints: '`low` | `moderate` | `vigorous`', description: 'Perceived cardio intensity.' },
            { name: 'distanceKm', type: 'number', required: false, constraints: '0..300', description: 'Optional distance in kilometers.' },
            { name: 'caloriesKcal', type: 'number', required: false, constraints: '10..5000', description: 'Optional wearable/manual energy expenditure (MET-estimated if omitted).' }
          ],
          payload: { date: '{{todayDate}}', modality: 'brisk_walking', durationMinutes: 35, intensity: 'moderate', distanceKm: 3.2 }
        }),
        cmdReq({
          name: 'Delete Cardio Session (cardio_delete)',
          action: 'cardio_delete',
          summary: 'Deletes a logged cardio session by ID.',
          payloadFields: [
            { name: 'id', type: 'string', required: true, constraints: 'Cardio log ID', description: 'ID of the cardio session to delete.' }
          ],
          payload: { id: 'cardio-log-id-placeholder' }
        }),
        req({ name: 'Get Female Cycle Awareness State', method: 'GET', path: '/v1/cycle/state', summary: 'Returns optional female menstrual cycle awareness state (`phase`, `coachingHintCode`, `discreetMode`, `adaptiveThemeEnabled`, `phaseAccentToken`, `suggestedGentleSession`, `isOverdue`/`overdueDays`, luteal water-retention flag, and pregnancy auto-pause; Free opt-in feature).' }),
        cmdReq({
          name: 'Update Cycle Awareness Settings (cycle_settings)',
          action: 'cycle_settings',
          summary: 'Enables/disables optional female cycle awareness, discreet mode, adaptive phase accent, and cycle lengths (female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent).',
          payloadFields: [
            { name: 'enabled', type: 'boolean', required: true, constraints: 'boolean', description: 'Opt-in toggle for cycle awareness.' },
            { name: 'discreetMode', type: 'boolean', required: false, constraints: 'default: false', description: 'Masks sensitive cycle labels and disables tinted cycle accent.' },
            { name: 'adaptiveThemeEnabled', type: 'boolean', required: false, constraints: 'default: true', description: 'Allows subtle cycle-phase accent tokens when Discreet Mode is off.' },
            { name: 'averageCycleLengthDays', type: 'integer', required: false, constraints: '21..45 (default 28)', description: 'Average menstrual cycle length in days.' },
            { name: 'averagePeriodLengthDays', type: 'integer', required: false, constraints: '2..10 (default 5)', description: 'Average period duration in days.' },
            { name: 'lastPeriodStartDate', type: 'string (YYYY-MM-DD)', required: false, constraints: 'Within last 180 days or null', description: 'Start date of last menstrual period.' }
          ],
          payload: { enabled: true, averageCycleLengthDays: 28, averagePeriodLengthDays: 5, lastPeriodStartDate: '{{todayDate}}' }
        }),
        cmdReq({
          name: 'Log Daily Cycle Entry (cycle_log)',
          action: 'cycle_log',
          summary: 'Logs period start, flow level, cramp severity, and wellness symptoms for a calendar date (female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent).',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Calendar date for the cycle log.' },
            { name: 'periodStart', type: 'boolean', required: false, constraints: 'default: false', description: 'Marks day 1 of a new cycle and advances lastPeriodStartDate.' },
            { name: 'flowLevel', type: 'string (enum)', required: false, constraints: '`none` | `spotting` | `light` | `medium` | `heavy`', description: 'Daily menstrual flow level.' },
            { name: 'crampSeverity', type: 'integer', required: false, constraints: '0..5', description: 'Self-reported cramp intensity.' },
            { name: 'symptoms', type: 'Array<string>', required: false, constraints: 'Supported wellness symptom keys', description: 'Optional symptom tags (e.g. `cramps`, `bloating`, `fatigue`).' }
          ],
          payload: { date: '{{todayDate}}', periodStart: true, flowLevel: 'medium', crampSeverity: 2, symptoms: ['cramps', 'fatigue'] }
        }),
        cmdReq({
          name: 'Toggle Cycle Comfort Session (cycle_gentle_session)',
          action: 'cycle_gentle_session',
          summary: 'One-tap female cycle comfort adjustment scaling working workout sets by 0.8x for 24 hours without mutating base plan progression (female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent).',
          payloadFields: [
            { name: 'enabled', type: 'boolean', required: true, constraints: 'boolean', description: 'Activate or clear the 24h gentle comfort adjustment.' }
          ],
          payload: { enabled: true }
        }),
        req({ name: 'Get Workout Personal Records (PRs)', method: 'GET', path: '/v1/workouts/prs', summary: 'Returns best weight, reps, estimated 1RM, and session volume per exercise (with assisted-exercise load inversion).' }),
        req({ name: 'Get Progress Analytics', method: 'GET', path: '/v1/progress/analytics?range=30d', summary: 'Returns weight moving average trend, calorie adherence, training volume, and exercise e1RM series (`14d`/`30d` Free; `90d`/`all` Pro).' }),
        req({ name: 'Get Weekly Wrapped Recap', method: 'GET', path: '/v1/progress/weekly-wrapped', summary: 'Returns shareable privacy-safe weekly recap metrics including cardio session count and minutes.' }),
        req({ name: 'Get Home Widget Snapshot', method: 'GET', path: '/v1/widgets/snapshot', summary: 'Ultra-lightweight (< 1.5 KB) snapshot for Android Glance & iOS WidgetKit with ETag support (never exposes sensitive cycle data).' }),
        req({ name: 'List Body Measurements', method: 'GET', path: '/v1/measurements?offset=0&limit=30', summary: 'Paginated waist, chest, hips, arms, thighs, and neck measurements.' }),
        cmdReq({
          name: 'Log Body Measurement (body_measurement)',
          action: 'body_measurement',
          summary: 'Logs or merges daily body circumference measurements for a date.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Measurement date.' },
            { name: 'waistCm', type: 'number', required: false, constraints: '40..220', description: 'Waist circumference in cm.' },
            { name: 'chestCm', type: 'number', required: false, constraints: '50..200', description: 'Chest circumference in cm.' }
          ],
          payload: { date: '{{todayDate}}', waistCm: 84.5, chestCm: 101.0 }
        }),
        cmdReq({
          name: 'Use Streak Freeze (streak_freeze)',
          action: 'streak_freeze',
          summary: 'Consumes one manual streak freeze token (max 1 per 7 days) alongside automatic Weekly Auto-Freeze protection (`autoAppliedFreezes`) for missed logging days.',
          payloadFields: [
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Date to protect with a streak freeze token.' }
          ],
          payload: { date: '{{todayDate}}' }
        })
      ]
    },
    {
      id: 'f0000017-0000-4000-8000-000000000017',
      name: '16. Media (R2), Push, Billing & Deferred AI Phase',
      description: 'Worker-proxied HMAC-signed R2 avatars & progress photos, FCM/APNs push tokens, StoreKit/Play Billing verification & webhooks, and deferred AI phase 501 placeholders.',
      item: [
        req({
          name: 'Upload Profile Avatar (Multipart / Binary)',
          method: 'POST',
          path: '/v1/profile/avatar',
          summary: 'Uploads a profile avatar directly via `multipart/form-data` (`image`/`file`) or raw binary (`image/jpeg`, `image/png`, `image/webp`, max 512 KB) into private Cloudflare R2 with old-avatar cleanup and returns a short-lived signed GET URL.',
          fields: [
            { name: 'image', type: 'file (binary)', required: true, constraints: 'JPEG/PNG/WebP, max 512 KB (multipart/form-data or raw image body)', description: 'Avatar binary file.' }
          ],
          body: {}
        }),
        req({ name: 'Delete Profile Avatar', method: 'DELETE', path: '/v1/profile/avatar', summary: 'Deletes the signed-in user avatar from Cloudflare R2.' }),
        req({ name: 'List Progress Photos', method: 'GET', path: '/v1/progress/photos?offset=0&limit=30', summary: 'Lists progress photos with short-lived Worker-signed GET URLs (always free to read/delete).' }),
        req({
          name: 'Create Progress Photo Upload URL',
          method: 'POST',
          path: '/v1/progress/photos/upload-url',
          summary: 'Issues a short-lived HMAC-signed PUT URL for private R2 upload.',
          fields: [
            { name: 'contentType', type: 'string (enum)', required: true, constraints: '`image/jpeg` | `image/png` | `image/webp`', description: 'Photo MIME type.' },
            { name: 'byteSize', type: 'integer', required: true, constraints: '1..5242880', description: 'Declared file size in bytes (max 5 MB).' },
            { name: 'pose', type: 'string (enum)', required: true, constraints: '`front` | `side` | `back`', description: 'Progress photo pose.' },
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Photo date.' },
            { name: 'weightKgSnapshot', type: 'number', required: false, constraints: '35..250', description: 'Optional weight snapshot.' }
          ],
          body: { contentType: 'image/jpeg', byteSize: 250000, pose: 'front', date: '{{todayDate}}', weightKgSnapshot: 79.5 }
        }),
        req({
          name: 'Confirm Progress Photo Upload',
          method: 'POST',
          path: '/v1/progress/photos/confirm',
          summary: 'Confirms uploaded R2 object and persists metadata in D1.',
          fields: [
            { name: 'photoId', type: 'string', required: true, constraints: 'UUID from upload-url', description: 'Photo ID issued by upload-url.' },
            { name: 'objectKey', type: 'string', required: true, constraints: 'User-scoped R2 key', description: 'R2 object key issued by upload-url.' },
            { name: 'pose', type: 'string (enum)', required: true, constraints: '`front` | `side` | `back`', description: 'Progress photo pose.' },
            { name: 'date', type: 'string (YYYY-MM-DD)', required: true, constraints: 'Valid ISO date', description: 'Photo date.' }
          ],
          body: { photoId: 'photo-id', objectKey: 'users/user-id/photos/photo-id.jpg', pose: 'front', date: '{{todayDate}}' }
        }),
        req({
          name: 'Delete Progress Photo',
          method: 'DELETE',
          path: '/v1/progress/photos/{{samplePhotoId}}',
          summary: 'Deletes a progress photo from Cloudflare R2 and D1 (always permitted even after Pro downgrade).'
        }),
        req({
          name: 'Upload Binary to Signed Media URL',
          method: 'PUT',
          path: '/v1/media/signed/{{signedMediaToken}}',
          noAuth: true,
          summary: 'Worker-proxied HMAC-signed binary upload into private Cloudflare R2 with magic-byte verification.',
          headers: [{ key: 'Content-Type', value: 'image/jpeg', description: 'Must match the MIME type embedded in the signed token' }]
        }),
        req({
          name: 'Download Private Media via Signed URL',
          method: 'GET',
          path: '/v1/media/signed/{{signedMediaToken}}',
          noAuth: true,
          summary: 'Streams a private avatar or progress photo from Cloudflare R2 after verifying the short-lived HMAC signature.'
        }),
        req({
          name: 'Register Push Token',
          method: 'POST',
          path: '/v1/devices/push-token',
          summary: 'Registers or refreshes an FCM/APNs push token for Cron reminder delivery.',
          fields: [
            { name: 'deviceId', type: 'string', required: true, constraints: 'max 120 chars', description: 'Client device ID.' },
            { name: 'platform', type: 'string (enum)', required: true, constraints: '`android` | `ios`', description: 'Mobile push platform.' },
            { name: 'token', type: 'string', required: true, constraints: '10..4096 chars', description: 'FCM or APNs registration token.' },
            { name: 'locale', type: 'string', required: false, constraints: 'e.g. `en`, `ar-EG`', description: 'Preferred push notification locale.' }
          ],
          body: { deviceId: '{{deviceId}}', platform: 'android', token: 'fcm-device-token-sample', locale: 'en' }
        }),
        req({ name: 'Unregister Push Token', method: 'DELETE', path: '/v1/devices/push-token?deviceId={{deviceId}}', summary: 'Removes a device push token.' }),
        req({ name: 'Get Subscription Offerings', method: 'GET', path: '/v1/subscriptions/offerings?platform=android&region=egypt', summary: 'Returns StoreKit/Play Billing product offerings and trial eligibility.' }),
        req({
          name: 'Verify Store Subscription',
          method: 'POST',
          path: '/v1/subscriptions/verify',
          summary: 'Verifies an Apple StoreKit 2 or Google Play purchase and activates Pro entitlements (fails closed with `503 BILLING_VERIFICATION_UNAVAILABLE` if store upstream fails).',
          fields: [
            { name: 'platform', type: 'string (enum)', required: true, constraints: '`android` | `ios`', description: 'Store platform.' },
            { name: 'provider', type: 'string (enum)', required: false, constraints: '`apple` | `google`', description: 'Optional explicit billing provider.' },
            { name: 'productId', type: 'string', required: false, constraints: 'Configured SKU ID', description: 'Store subscription product ID.' },
            { name: 'purchaseToken', type: 'string', required: false, constraints: 'Required for `android`', description: 'Google Play purchase token.' },
            { name: 'orderId', type: 'string', required: false, constraints: 'Optional for `android`', description: 'Google Play order ID.' },
            { name: 'signedTransactionInfo', type: 'string', required: false, constraints: 'For `ios` StoreKit 2', description: 'Apple StoreKit 2 JWS transaction.' },
            { name: 'signedTransactionJws', type: 'string', required: false, constraints: 'Alias for `signedTransactionInfo`', description: 'Apple StoreKit 2 JWS transaction alias.' },
            { name: 'transactionId', type: 'string', required: false, constraints: 'Optional for `ios`', description: 'Apple transaction identifier.' },
            { name: 'originalTransactionId', type: 'string', required: false, constraints: 'Optional for `ios`', description: 'Apple original transaction identifier.' },
            { name: 'isTrial', type: 'boolean', required: false, constraints: 'boolean', description: 'Marks introductory trial transaction.' }
          ],
          body: { platform: 'android', productId: 'curafit_pro.monthly', purchaseToken: 'test-purchase-token' }
        }),
        req({
          name: 'Restore Store Subscriptions',
          method: 'POST',
          path: '/v1/subscriptions/restore',
          summary: 'Reconciles prior store purchases (`string` tokens or receipt objects) and restores active entitlements.',
          fields: [
            { name: 'platform', type: 'string (enum)', required: true, constraints: '`android` | `ios`', description: 'Store platform.' },
            { name: 'provider', type: 'string (enum)', required: false, constraints: '`apple` | `google`', description: 'Optional explicit billing provider.' },
            { name: 'tokens', type: 'Array<string | object>', required: false, constraints: 'Optional purchase tokens or `{ purchaseToken, transactionId, signedTransactionJws }` objects', description: 'Active store purchase tokens/receipts to reconcile.' }
          ],
          body: { platform: 'android', tokens: [] }
        }),
        req({
          name: 'Apple Store Server Webhook (Public)',
          method: 'POST',
          path: '/v1/webhooks/apple',
          noAuth: true,
          summary: 'Receives Apple App Store Server Notifications events.',
          fields: [
            { name: 'notificationType', type: 'string', required: false, constraints: 'e.g. `DID_RENEW`, `EXPIRED`', description: 'App Store Server Notification type (or inside `signedPayload` JWS).' },
            { name: 'data', type: 'object', required: false, constraints: '`{ originalTransactionId, expiresDate? }`', description: 'Decoded notification payload.' }
          ],
          body: { notificationType: 'DID_RENEW', data: { originalTransactionId: 'tx-123' } }
        }),
        req({
          name: 'Google Play RTDN Webhook (Public)',
          method: 'POST',
          path: '/v1/webhooks/google-play',
          noAuth: true,
          summary: 'Receives Google Play Real-Time Developer Notifications.',
          fields: [
            { name: 'subscriptionNotification', type: 'object', required: false, constraints: '`{ notificationType, purchaseToken }`', description: 'Direct RTDN payload (or base64 inside Pub/Sub `message.data`).' }
          ],
          body: { subscriptionNotification: { notificationType: 2, purchaseToken: 'token-123' } }
        }),
        req({
          name: 'AI Meal Parse (Deferred — 501)',
          method: 'POST',
          path: '/v1/nutrition/ai-parse',
          summary: 'Reserved for Final AI Phase; returns 501 FEATURE_DEFERRED_TO_AI_PHASE.',
          fields: [
            { name: 'text', type: 'string', required: true, constraints: '1..500 chars', description: 'Natural language meal description.' }
          ],
          body: { text: '2 boiled eggs and brown toast' }
        }),
        req({
          name: 'AI Coach Chat (Deferred — 501)',
          method: 'POST',
          path: '/v1/coaching/chat',
          summary: 'Reserved for Final AI Phase; returns 501 FEATURE_DEFERRED_TO_AI_PHASE.',
          fields: [
            { name: 'message', type: 'string', required: true, constraints: '1..1000 chars', description: 'Coaching question text.' }
          ],
          body: { message: 'How can I increase protein at breakfast?' }
        }),
        req({
          name: 'AI Coach Chat History (Deferred — 501)',
          method: 'GET',
          path: '/v1/coaching/chat/history',
          summary: 'Reserved for Final AI Phase; returns 501 FEATURE_DEFERRED_TO_AI_PHASE.'
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
    { key: 'deviceId', value: 'postman-cloud-dev-01', type: 'default', enabled: true, description: 'Client device ID (string, max 120)' },
    { key: 'clientPlatform', value: 'android', type: 'default', enabled: true, description: 'android | ios' },
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
    { key: 'deviceId', value: 'postman-prod-01', type: 'default', enabled: true, description: 'Client device ID (string, max 120)' },
    { key: 'clientPlatform', value: 'android', type: 'default', enabled: true, description: 'android | ios' },
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
    { key: 'deviceId', value: 'postman-local-dev-01', type: 'default', enabled: true, description: 'Client device ID (string, max 120)' },
    { key: 'clientPlatform', value: 'android', type: 'default', enabled: true, description: 'android | ios' },
    { key: 'clientVersion', value: '1.0.0', type: 'default', enabled: true, description: 'Client semver' }
  ],
  _postman_variable_scope: 'environment'
};

// Generate standalone Markdown API Reference from the exact same collection definition
const totalGroups = collection.item.length;
const totalEndpoints = collection.item.reduce((sum, f) => sum + (f.item?.length || 0), 0);
const mdParts = [COLLECTION_OVERVIEW_MD, '', '---', '', `## 6. Complete Endpoint Reference (${totalGroups} Groups / ${totalEndpoints} Endpoints)`, ''];
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
