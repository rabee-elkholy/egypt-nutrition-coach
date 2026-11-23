# CuraFit API v1 — Cloudflare Workers & D1

Production-grade REST API running natively on **Cloudflare Workers + Cloudflare D1 + Cloudflare R2** (`curafit-api` for Production, `curafit-api-dev` for Cloud Dev). Designed for **Kotlin Multiplatform Mobile (KMM)** with uniform JSON envelopes, 100% English machine-coded errors (`contracts/error-codes.json`), and canonical coaching codes (`contracts/coaching-codes.json`).

---

## 1. Servers & Environments

Switch between environments from the top-right **Environment selector** in Postman:

| Environment Name | `baseUrl` | Cloudflare Worker / D1 | Purpose |
| :--- | :--- | :--- | :--- |
| **CuraFit — Cloud Dev** | `https://curafit-api-dev.egypt-nutrition-coach.workers.dev` | `curafit-api-dev` / `curafit-db-dev` | Feature development & staging on Cloudflare edge (`dev` branch, full clone of Prod D1) |
| **CuraFit — Production** | `https://curafit-api.egypt-nutrition-coach.workers.dev` | `curafit-api` / `egypt-nutrition-coaching` | Live Cloudflare Workers + D1 production server (`main` branch) |
| **CuraFit — Local Dev** | `http://127.0.0.1:8787` | Local Miniflare | Local development server (`npm run dev`) |

---

## 2. Authentication (Google & Apple OIDC Only + First-Party JWT/D1 Sessions)

- **Public endpoints (No Auth):** `GET /v1/health`, `GET /v1/capabilities`, `POST /v1/eligibility`, `POST /v1/plans/preview`, `POST /v1/auth/oauth/google`, `POST /v1/auth/oauth/apple`, `POST /v1/auth/refresh`, `POST /v1/webhooks/apple`, `POST /v1/webhooks/google-play`, and HMAC-signed `GET/PUT /v1/media/signed/{token}`.
- **Authenticated endpoints:** Send `Authorization: Bearer {{accessToken}}` (inherited automatically at collection level).
- **Access Token:** HS256 JWT (TTL: `900s` / 15 minutes).
- **Refresh Token:** Opaque rotating token (`cfrt_...`, TTL: 30 days) stored SHA-256 hashed in D1. Replaying an already-rotated token revokes the entire session (`401 AUTH_REFRESH_TOKEN_REUSED`).

---

## 3. Unified Command Pipeline (`POST /v1/commands`), Revision & Idempotency

All domain mutations pass through `POST /v1/commands`:
- **`Idempotency-Key` header (`string`, UUID, max 100 chars, required):** Auto-generated before every Postman request. Retry with the exact same key and intent (`action` + `payload`) on network timeout even after a revision rebase.
- **`revision` (`integer >= 0`, required):** Must equal the server's current account revision. Mismatches return `409 REVISION_CONFLICT` with `error.params.currentRevision` and `error.details.mergeHints`.
- **Response Mode (`?view=receipt` vs `?view=full`):** `?view=receipt` (or `Prefer: return=minimal`) returns a compact `< 2 KB` delta receipt inside `data`; `?view=full` returns the full account snapshot inside `data`.

---

## 4. Uniform KMM Envelopes & Pure-English Error / Coaching Contracts

Every JSON endpoint returns the canonical envelope:

- **Success (`2xx`):** `{ "ok": true, "data": <T>, "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>", "revision"?: <int> } }`
- **Error (`4xx` / `5xx`):** `{ "ok": false, "error": { "code", "message", "params", "fieldErrors", "retryable", "details"?: {...} }, "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>" } }`

| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `false` on all `4xx`/`5xx` responses |
| `error.code` | `string` | Stable uppercase error code (293 codes cataloged in `contracts/error-codes.json` and `docs/ERROR_CODES.md`) |
| `error.message` | `string` | Canonical English message (zero Arabic in API errors; mobile clients translate by `error.code` and `error.params`) |
| `error.params` | `object` | Interpolation parameters for client-side localization |
| `error.fieldErrors` | `Array<{field, code, message, params?}>` | Optional per-field validation errors (also 100% English) |
| `error.retryable` | `boolean` | Whether the client may safely retry (`true` for `429`/`503`/`500`) |
| `error.details` | `object` (optional) | Structured recovery data such as `currentRevision` and `mergeHints` on `409` |
| `meta.requestId` | `string (UUID)` | Trace ID matching `X-Request-Id` header |
| `meta.serverTime` | `string (ISO-8601)` | Server UTC timestamp |

> **Coaching Codes:** All coaching briefs, agreements, readiness summaries, and eligibility reasons return canonical English text plus `code` and `params` cataloged in `contracts/coaching-codes.json` (`docs/COACHING_CODES.md`). AI routes (`POST /v1/nutrition/ai-parse`, `POST /v1/coaching/chat`, `GET /v1/coaching/chat/history`) are deferred to the final AI rollout phase (`501 FEATURE_DEFERRED_TO_AI_PHASE`).

---

## 5. Collection & Environment Variables Reference

| Variable | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `baseUrl` | `string (URL)` | Environment | Server base URL (`Cloud Dev`, `Production`, or `Local Dev`) |
| `deviceId` | `string` | Environment | Client device ID (`max 120` chars) |
| `clientPlatform` | `string (enum)` | Environment | `android` \| `ios` \| `web` |
| `clientVersion` | `string` | Environment | App semantic version (e.g. `1.0.0`) |
| `accessToken` | `string (JWT)` | Collection (auto) | Auto-saved by Google / Apple OIDC Sign-In or Refresh |
| `refreshToken` | `string` | Collection (auto) | Auto-saved & rotated by Google / Apple OIDC Sign-In or Refresh |
| `sessionId` | `string` | Collection (auto) | Current D1 session ID |
| `userId` | `string` | Collection (auto) | Authenticated user ID (`user:<uuid>`) |
| `revision` | `integer` | Collection (auto) | Current optimistic-concurrency revision |
| `idempotencyKey` | `string (UUID)` | Pre-request (auto) | Fresh UUID generated before every request |
| `todayDate` | `string (YYYY-MM-DD)` | Collection (auto) | Current server local date |
| `lastEtag` | `string` | Collection (auto) | Last `ETag` response header for `If-None-Match` |
| `activePlanId` | `string` | Collection (auto) | Active nutrition plan ID |
| `activeWorkoutPlanId` | `string` | Collection (auto) | Active workout plan ID |
| `sampleMealId` | `string (UUID)` | Collection (auto) | First meal ID from today's active plan |
| `sampleAltTemplateId` | `string` | Collection (auto) | Alternative meal template ID |
| `sampleFoodEntryId` | `string (UUID)` | Collection (auto) | Last created food entry ID |
| `sampleDayIndex` | `integer (0..6)` | Collection (auto) | Workout weekday index (`0=Sun .. 6=Sat`) |
| `sampleExerciseId` | `string` | Collection (auto) | Exercise ID in the active workout plan |
| `sampleAltExerciseId` | `string` | Collection (auto) | Validated alternative exercise ID |
| `sampleRescheduleDate` | `string (YYYY-MM-DD)` | Collection (auto) | Next available rest date within 13 days |
| `sampleProposalId` | `string (UUID)` | Collection (auto) | Active pending adaptation proposal ID |
| `sampleCaseId` | `string` | Collection (auto) | Active coaching agreement/case ID |
| `sampleFoodId` | `string` | Collection (auto) | Food item ID from `/v1/foods` |
| `sampleCatalogExerciseId` | `string (URL-encoded)` | Collection (auto) | Exercise catalog ID from `/v1/exercises` |
| `nextSeqCursor` | `integer` | Collection (auto) | Incremental outbox sequence cursor for `/v1/sync/changes` |
| `anonymousUserId` | `string` | Collection | Anonymous `anon:...` ID for `/v1/auth/claim-anonymous` |
| `sampleBarcode` | `string` | Collection | Sample EAN/UPC barcode (`6221000000001`) for `/v1/foods/barcode/{ean}` |
| `samplePhotoId` | `string` | Collection | Progress photo ID for `/v1/progress/photos/{photoId}` |
| `signedMediaToken` | `string` | Collection | Short-lived HMAC-signed token for `/v1/media/signed/{token}` |
| `oauthProvider` | `string (enum)` | Collection | OAuth provider (`google` \| `apple`) for `/v1/auth/oauth/{provider}` |

---

## 6. Complete Endpoint Reference (16 Groups / 140 Endpoints)

## 01. System & Health

Public liveness probe and runtime capability manifest. No authentication required.

### Health Check

Public health probe returning API version, engine version, and trace `requestId`.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/health`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/health`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/health`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/health`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `status` | `string` | `"ok"` when Worker is healthy. |
| `apiVersion` | `string` | API major version (`"1"`). |
| `engineVersion` | `string` | Backend engine semver (e.g. `"0.13.0"`). |
| `requestId` | `string (UUID)` | Request trace ID. |

#### Example Response — 200 OK — Healthy
```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "apiVersion": "1",
    "engineVersion": "0.13.0",
    "requestId": "req-uuid"
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Capabilities Manifest

Returns API/schema/catalog versions, enabled feature flags, and native Cloudflare D1 authentication status.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/capabilities`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/capabilities`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/capabilities`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/capabilities`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `apiVersion` | `string` | API version (`"1"`). |
| `schemaVersion` | `integer` | Account storage schema version (`3`). |
| `engineVersion` | `string` | Coaching engine version. |
| `catalogVersion` | `string` | Pinned OpenExerciseDB version. |
| `foodCatalogVersion` | `string` | Pinned Egyptian/Gulf food catalog version. |
| `serverTime` | `string (ISO-8601 UTC)` | Current edge server UTC time. |
| `auth` | `object` | `{ provider: "cloudflare_d1_native", configured: boolean }`. |
| `features` | `Array<string>` | Enabled backend feature flags. |

#### Example Response — 200 OK — Capabilities
```json
{
  "ok": true,
  "data": {
    "apiVersion": "1",
    "schemaVersion": 3,
    "engineVersion": "0.13.0",
    "catalogVersion": "202610112340",
    "foodCatalogVersion": "0.6.0-data.4",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "auth": {
      "provider": "cloudflare_d1_native",
      "configured": true
    },
    "features": [
      "adaptive_nutrition",
      "adaptive_workouts",
      "native_cloudflare_auth",
      "kmm_bootstrap",
      "offline_sync"
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

## 02. Authentication (Google & Apple OIDC)

Passwordless Google Sign-In & Apple Sign-In OIDC verification on Cloudflare Workers + D1, issuing first-party HS256 Access JWTs (15 min) and rotating D1 Refresh Tokens (30 days) with replay reuse detection.

### Sign In / Register with Google OIDC

Verifies a Google ID token JWKS signature directly on Cloudflare Workers and issues first-party CuraFit tokens (creates a new D1 user on first sign-in or signs into an existing linked account). Auto-saves tokens in Postman.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/oauth/google`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/oauth/google`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/oauth/google`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/oauth/google`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `idToken` | `string (JWT)` | Yes | Google OIDC ID token | Signed Google ID token from mobile Google Sign-In. |
| `deviceId` | `string` | No | max 120 chars | Client device identifier. |
| `name` | `string` | No | max 100 chars | Optional display name fallback. |
| `fullName` | `string` | No | max 100 chars | Optional full name fallback. |
| `linkExisting` | `boolean` | No | default: false | When `true`, links Google to an existing verified account sharing the same verified email. |

### Request Body Example
```json
{
  "idToken": "<google-oidc-id-token>",
  "deviceId": "{{deviceId}}",
  "name": "CuraFit User"
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `tokenType` | `string (const)` | Always `"Bearer"`. |
| `accessToken` | `string (JWT)` | HS256 signed JWT for `Authorization: Bearer <token>`. |
| `expiresIn` | `integer (seconds)` | Access token TTL in seconds (default `900`). |
| `expiresAt` | `string (ISO-8601 UTC)` | Access token expiration timestamp. |
| `refreshToken` | `string` | Opaque rotating refresh token (`cfrt_...`). Store securely on device. |
| `refreshExpiresIn` | `integer (seconds)` | Refresh token TTL in seconds (default `2592000` = 30 days). |
| `refreshExpiresAt` | `string (ISO-8601 UTC)` | Refresh token expiration timestamp. |
| `sessionId` | `string` | Server D1 session ID (`sess_<uuid>`). |
| `user` | `object` | `{ userId, email, name, entitlement, createdAt }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `401` | `AUTH_OAUTH_TOKEN_INVALID` | Google ID token is missing, expired, malformed, or fails JWKS verification. |
| `409` | `AUTH_PROVIDER_EMAIL_CONFLICT` | Email is already associated with another OIDC provider; pass `linkExisting: true` after confirmation. |
| `429` | `RATE_LIMITED` | Auth endpoint rate limit exceeded (30 req/min/IP). |

#### Example Response — 200 OK — Token Pair
```json
{
  "ok": true,
  "data": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature",
    "expiresIn": 900,
    "expiresAt": "2026-11-21T12:45:00.000Z",
    "refreshToken": "cfrt_example_opaque_refresh_token_32bytes",
    "refreshExpiresIn": 2592000,
    "refreshExpiresAt": "2026-12-21T12:30:00.000Z",
    "sessionId": "sess_8c7b1e3a-2b4d-4c8f-a1b2-3c4d5e6f7a8b",
    "user": {
      "userId": "user:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "demo.user@curafit.app",
      "name": "Ahmed Mohamed",
      "entitlement": "free",
      "createdAt": "2026-11-21T12:30:00.000Z"
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

#### Example Response — 201 Created — Token Pair
```json
{
  "ok": true,
  "data": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature",
    "expiresIn": 900,
    "expiresAt": "2026-11-21T12:45:00.000Z",
    "refreshToken": "cfrt_example_opaque_refresh_token_32bytes",
    "refreshExpiresIn": 2592000,
    "refreshExpiresAt": "2026-12-21T12:30:00.000Z",
    "sessionId": "sess_8c7b1e3a-2b4d-4c8f-a1b2-3c4d5e6f7a8b",
    "user": {
      "userId": "user:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "demo.user@curafit.app",
      "name": "Ahmed Mohamed",
      "entitlement": "free",
      "createdAt": "2026-11-21T12:30:00.000Z"
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Sign In / Register with Apple OIDC

Verifies an Apple identity token JWKS signature directly on Cloudflare Workers and issues first-party CuraFit tokens (exchanging `authorizationCode` for encrypted revocation storage on first Apple login). Auto-saves tokens in Postman.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/oauth/apple`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/oauth/apple`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/oauth/apple`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/oauth/apple`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `identityToken` | `string (JWT)` | Yes | Apple OIDC identity token | Signed Apple identity token from Sign in with Apple. |
| `authorizationCode` | `string` | No | Optional first-login code | Exchanged for encrypted Apple refresh token for GDPR revocation. |
| `fullName` | `string` | No | max 100 chars | Optional display name sent on first Apple login. |
| `name` | `string` | No | max 100 chars | Optional display name alias. |
| `deviceId` | `string` | No | max 120 chars | Client device identifier. |
| `linkExisting` | `boolean` | No | default: false | When `true`, links Apple to an existing verified account sharing the same verified email. |

### Request Body Example
```json
{
  "identityToken": "<apple-oidc-identity-token>",
  "authorizationCode": "<optional-auth-code>",
  "fullName": "CuraFit User",
  "deviceId": "{{deviceId}}"
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `tokenType` | `string (const)` | Always `"Bearer"`. |
| `accessToken` | `string (JWT)` | HS256 signed JWT for `Authorization: Bearer <token>`. |
| `expiresIn` | `integer (seconds)` | Access token TTL in seconds (default `900`). |
| `expiresAt` | `string (ISO-8601 UTC)` | Access token expiration timestamp. |
| `refreshToken` | `string` | Opaque rotating refresh token (`cfrt_...`). Store securely on device. |
| `refreshExpiresIn` | `integer (seconds)` | Refresh token TTL in seconds (default `2592000` = 30 days). |
| `refreshExpiresAt` | `string (ISO-8601 UTC)` | Refresh token expiration timestamp. |
| `sessionId` | `string` | Server D1 session ID (`sess_<uuid>`). |
| `user` | `object` | `{ userId, email, name, entitlement, createdAt }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `401` | `AUTH_OAUTH_TOKEN_INVALID` | Apple identity token is missing, expired, malformed, or fails JWKS verification. |
| `409` | `AUTH_PROVIDER_EMAIL_CONFLICT` | Email is already associated with another OIDC provider; pass `linkExisting: true` after confirmation. |
| `429` | `RATE_LIMITED` | Auth endpoint rate limit exceeded (30 req/min/IP). |

#### Example Response — 200 OK — Token Pair
```json
{
  "ok": true,
  "data": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature",
    "expiresIn": 900,
    "expiresAt": "2026-11-21T12:45:00.000Z",
    "refreshToken": "cfrt_example_opaque_refresh_token_32bytes",
    "refreshExpiresIn": 2592000,
    "refreshExpiresAt": "2026-12-21T12:30:00.000Z",
    "sessionId": "sess_8c7b1e3a-2b4d-4c8f-a1b2-3c4d5e6f7a8b",
    "user": {
      "userId": "user:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "demo.user@curafit.app",
      "name": "Ahmed Mohamed",
      "entitlement": "free",
      "createdAt": "2026-11-21T12:30:00.000Z"
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

#### Example Response — 201 Created — Token Pair
```json
{
  "ok": true,
  "data": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature",
    "expiresIn": 900,
    "expiresAt": "2026-11-21T12:45:00.000Z",
    "refreshToken": "cfrt_example_opaque_refresh_token_32bytes",
    "refreshExpiresIn": 2592000,
    "refreshExpiresAt": "2026-12-21T12:30:00.000Z",
    "sessionId": "sess_8c7b1e3a-2b4d-4c8f-a1b2-3c4d5e6f7a8b",
    "user": {
      "userId": "user:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "demo.user@curafit.app",
      "name": "Ahmed Mohamed",
      "entitlement": "free",
      "createdAt": "2026-11-21T12:30:00.000Z"
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Refresh Access Token (Rotates Refresh Token)

Exchanges a valid `refreshToken` for a fresh Access JWT and a newly rotated `refreshToken`. Replaying an already-rotated token immediately revokes the entire session.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/refresh`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/refresh`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/refresh`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/refresh`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `refreshToken` | `string` | Yes | 20..256 chars (`cfrt_...`) | Current unrotated refresh token. |
| `deviceId` | `string` | No | max 120 chars | Optional device ID override. |

### Request Body Example
```json
{
  "refreshToken": "{{refreshToken}}",
  "deviceId": "{{deviceId}}"
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `tokenType` | `string (const)` | Always `"Bearer"`. |
| `accessToken` | `string (JWT)` | HS256 signed JWT for `Authorization: Bearer <token>`. |
| `expiresIn` | `integer (seconds)` | Access token TTL in seconds (default `900`). |
| `expiresAt` | `string (ISO-8601 UTC)` | Access token expiration timestamp. |
| `refreshToken` | `string` | Opaque rotating refresh token (`cfrt_...`). Store securely on device. |
| `refreshExpiresIn` | `integer (seconds)` | Refresh token TTL in seconds (default `2592000` = 30 days). |
| `refreshExpiresAt` | `string (ISO-8601 UTC)` | Refresh token expiration timestamp. |
| `sessionId` | `string` | Server D1 session ID (`sess_<uuid>`). |
| `user` | `object` | `{ userId, email, name, entitlement, createdAt }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `401` | `AUTH_REFRESH_TOKEN_INVALID` | Token unrecognized. |
| `401` | `AUTH_REFRESH_TOKEN_REUSED` | Token was already rotated; entire session revoked for security. |
| `401` | `AUTH_REFRESH_TOKEN_EXPIRED` | 30-day refresh TTL elapsed; login required. |

#### Example Response — 200 OK — Token Pair
```json
{
  "ok": true,
  "data": {
    "tokenType": "Bearer",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature",
    "expiresIn": 900,
    "expiresAt": "2026-11-21T12:45:00.000Z",
    "refreshToken": "cfrt_example_opaque_refresh_token_32bytes",
    "refreshExpiresIn": 2592000,
    "refreshExpiresAt": "2026-12-21T12:30:00.000Z",
    "sessionId": "sess_8c7b1e3a-2b4d-4c8f-a1b2-3c4d5e6f7a8b",
    "user": {
      "userId": "user:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "demo.user@curafit.app",
      "name": "Ahmed Mohamed",
      "entitlement": "free",
      "createdAt": "2026-11-21T12:30:00.000Z"
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Inspect Current Session

Returns authenticated caller identity, session ID, auth method, scopes, entitlement tier, and JWT timestamps.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/auth/session`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/session`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/session`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/session`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `userId` | `string` | Internal user ID (`user:<uuid>` or `anon:<hash>`). |
| `subject` | `string` | JWT `sub` claim. |
| `sessionId` | `string` | Active session ID. |
| `deviceId` | `string | null` | Bound device ID. |
| `authMethod` | `string (enum)` | `bearer_jwt` | `anonymous_cookie` | `platform_header`. |
| `isAnonymous` | `boolean` | `false` for verified OIDC JWT users. |
| `scopes` | `Array<string>` | Granted scopes (`["coach:read","coach:write"]`). |
| `entitlement` | `string (enum)` | `free` | `pro`. |
| `issuedAt` | `string (ISO-8601) | null` | JWT `iat` timestamp. |
| `expiresAt` | `string (ISO-8601) | null` | JWT `exp` timestamp. |

#### Example Response — 200 OK — Session Info
```json
{
  "ok": true,
  "data": {
    "userId": "user:1a2b",
    "subject": "user:1a2b",
    "sessionId": "sess_123",
    "deviceId": "postman-prod-01",
    "authMethod": "bearer_jwt",
    "isAnonymous": false,
    "scopes": [
      "coach:read",
      "coach:write"
    ],
    "entitlement": "free",
    "issuedAt": "2026-11-21T12:30:00.000Z",
    "expiresAt": "2026-11-21T12:45:00.000Z"
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Claim Anonymous Web Session

Atomically migrates a legacy Web anonymous trial account (`anon:...`) into the logged-in verified account. Requires owning `coach_uid` Web cookie + explicit `consent: true` (Web-only).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/claim-anonymous`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/claim-anonymous`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/claim-anonymous`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/claim-anonymous`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `anonymousUserId` | `string` | Yes | Must start with `anon:` and match cookie | Anonymous session userId from Web MVP. |
| `consent` | `boolean` | Yes | Must be `true` | Explicit user consent to merge data. |

### Request Body Example
```json
{
  "anonymousUserId": "{{anonymousUserId}}",
  "consent": true
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `claimed` | `boolean` | `true` when migrated. |
| `fromAnonymousId` | `string` | Source anonymous ID. |
| `toUserId` | `string` | Destination verified user ID. |
| `revision` | `integer` | New target account revision. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `403` | `ANONYMOUS_OWNERSHIP_REQUIRED` | Missing owning `coach_uid` cookie. |
| `409` | `ANONYMOUS_ALREADY_CLAIMED / TARGET_ACCOUNT_NOT_EMPTY` | Already claimed or verified account already has a profile. |

#### Example Response — 200 OK — Claimed
```json
{
  "ok": true,
  "data": {
    "claimed": true,
    "fromAnonymousId": "anon:abc",
    "toUserId": "user:1a2b",
    "revision": 3
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 3
  }
}
```

---

### Revoke Session (Current or All Devices)

Immediately revokes a specific `sessionId` or all sessions (`allDevices: true`) in D1, invalidating both Access JWTs and Refresh Tokens.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/revoke`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/revoke`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/revoke`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/revoke`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `sessionId` | `string` | No | max 200 chars, cannot start with `__` | Session ID to revoke (defaults to current session). |
| `allDevices` | `boolean` | No | default: false | If `true`, revokes all sessions across every device. |

### Request Body Example
```json
{
  "sessionId": "{{sessionId}}",
  "allDevices": false
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `revoked` | `boolean` | `true`. |
| `sessionId` | `string` | Revoked session ID or `"__all__"`. |
| `revokedAt` | `string (ISO-8601 UTC)` | Revocation timestamp. |

#### Example Response — 200 OK — Revoked
```json
{
  "ok": true,
  "data": {
    "revoked": true,
    "sessionId": "sess_123",
    "revokedAt": "2026-11-21T12:35:00.000Z"
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Logout

Logs out the current session (or all devices) and revokes associated refresh tokens in D1.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/logout`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/logout`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/logout`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/logout`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `allDevices` | `boolean` | No | default: false | Set `true` to log out everywhere. |
| `sessionId` | `string` | No | Optional specific session | Defaults to active session. |

### Request Body Example
```json
{
  "allDevices": false
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `loggedOut` | `boolean` | `true`. |
| `sessionId` | `string` | Revoked session ID or `"__all__"`. |
| `allDevices` | `boolean` | Whether all devices were logged out. |
| `revokedAt` | `string (ISO-8601 UTC)` | Logout timestamp. |

#### Example Response — 200 OK — Logged Out
```json
{
  "ok": true,
  "data": {
    "loggedOut": true,
    "sessionId": "sess_123",
    "allDevices": false,
    "revokedAt": "2026-11-21T12:36:00.000Z"
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

## 03. Onboarding & Pre-Screening

Deterministic clinical/physiological pre-screening, initial 7-day nutrition & workout plan generation, legacy confirmations, and weekly plan renewal.

### Pre-Screening Eligibility Check

Public fast deterministic pre-onboarding screening checking age (18..70), BMI boundaries (12.5..65), medical conditions, injuries, and maternal status before plan generation.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/eligibility`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/eligibility`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/eligibility`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/eligibility`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `age` | `integer` | Yes | 18..70 | User age in years. |
| `sex` | `string (enum)` | Yes | `male` | `female` | Biological sex for BMR/energy calculation. |
| `height` | `number` | Yes | 120..230 (cm) | Height in centimeters. |
| `weight` | `number` | Yes | 35..250 (kg) | Current body weight in kg. |
| `goal` | `string (enum)` | Yes | `lose` | `maintain` | `gain` | `muscle_gain` | Primary fitness/nutrition goal. |
| `targetWeight` | `number | null` | No | 35..250 (kg) | Optional target weight. |
| `serviceTrack` | `string (enum)` | No | `nutrition_only` | `workouts_only` | `nutrition_and_workouts` | Selected coaching track. |
| `diseases` | `Array<string>` | No | Supported: `hypertension`, `insulin_resistance`, `pcos`, `ibs`, `cholesterol`, `gout`, `anemia`, `vitamin_d_deficiency`, `lactose_intolerance`, `favism`, `fatty_liver` | Declared wellness/medical conditions. Critical conditions (e.g. `diabetes`) return `requires_review`. |
| `maternalStatus` | `string (enum)` | No | `none` | `pregnant` | `breastfeeding` | Non-`none` returns `requires_review`. |
| `injuries` | `Array<string>` | No | e.g. `knee_pain`, `lower_back_pain`, `shoulder_pain` | Declared joint discomforts/injuries. |

### Request Body Example
```json
{
  "age": 29,
  "sex": "male",
  "height": 178,
  "weight": 82,
  "goal": "lose",
  "targetWeight": 75,
  "serviceTrack": "nutrition_and_workouts",
  "diseases": [],
  "maternalStatus": "none",
  "injuries": []
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `status` | `string (enum)` | `eligible` | `needs_input` | `requires_review`. |
| `reasons` | `Array<object>` | Blocking clinical reasons when `requires_review`. |
| `questions` | `Array<object>` | Additional confirmation prompts when `needs_input`. |
| `supportedAdaptations` | `object` | `{ diseases: string[], injuries: string[] }` handled automatically. |
| `permittedFunctions` | `Array<string>` | Allowed client features. |

#### Example Response — 200 OK — Eligible
```json
{
  "ok": true,
  "data": {
    "status": "eligible",
    "reviewScope": "system_generated_screening_not_medical_diagnosis",
    "reasons": [],
    "questions": [],
    "supportedAdaptations": {
      "diseases": [],
      "injuries": []
    },
    "permittedFunctions": [
      "generate_plan",
      "log_execution",
      "adaptive_review"
    ],
    "clinicalSummary": null
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Generate Initial Plan (Full Response)

Creates the user profile, generates a personalized 7-day regional nutrition plan + adaptive workout program, and returns the full account state. Auto-captures `activePlanId`, `activeWorkoutPlanId`, `sampleMealId`, `sampleDayIndex`, and `sampleExerciseId`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=full`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=full`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=full`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=full`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "generate" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `generate`. |
| `payload.name` | `string` | No | max 100 chars | Display name. |
| `payload.age` | `integer` | Yes | 18..70 | Age in years. |
| `payload.weight` | `number` | Yes | 35..250 (kg) | Current weight in kg. |
| `payload.height` | `number` | Yes | 120..230 (cm) | Height in cm. |
| `payload.sex` | `string (enum)` | Yes | `male` | `female` | Biological sex. |
| `payload.goal` | `string (enum)` | Yes | `lose` | `maintain` | `gain` | `muscle_gain` | Target goal. |
| `payload.targetWeight` | `number | null` | No | 35..250 (kg) | Goal weight (optional). |
| `payload.goalPace` | `string (enum)` | No | `gentle` | `moderate` | `fast` | Calorie deficit/surplus pace. |
| `payload.serviceTrack` | `string (enum)` | Yes | `nutrition_only` | `workouts_only` | `nutrition_and_workouts` | Active coaching track. |
| `payload.dailyActivity` | `string (enum)` | No | `sedentary` | `light` | `moderate` | `active` | Non-exercise daily activity level. |
| `payload.dietType` | `string (enum)` | No | `balanced` | `high_protein` | `low_carb` | `keto` | `mediterranean` | `dash` | `vegetarian` | `vegan` | `intermittent_fasting` | Dietary pattern. |
| `payload.region` | `string (enum)` | No | `egypt` | `gulf` | `levant` | `maghreb` | Regional cuisine preference. |
| `payload.budget` | `string (enum)` | No | `economical` | `medium` | `flexible` | Meal budget tier. |
| `payload.mealsCount` | `integer` | No | 2..5 (default 4) | Daily meal slots count. |
| `payload.selectedWorkoutDays` | `Array<integer>` | No | Values `0..6` (`0=Sun .. 6=Sat`) | Weekly resistance training days. |
| `payload.workoutLocation` | `string (enum)` | No | `gym_only` | `home_only` | `hybrid` | Training location. |
| `payload.fitnessLevel` | `string (enum)` | No | `beginner` | `intermediate` | `advanced` | Resistance training experience. |
| `payload.sessionDuration` | `integer` | No | 20..120 (minutes) | Target workout duration. |
| `payload.healthConfirmed` | `boolean` | No | Required `true` for `workouts_only` | Explicit health clearance confirmation. |
| `payload.weekdayConvention` | `string (enum)` | No | `js_sunday_0` (recommended) | `saturday_0` | Weekday indexing convention. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "generate",
  "payload": {
    "name": "Ahmed Mohamed",
    "age": 29,
    "weight": 82,
    "height": 178,
    "sex": "male",
    "goal": "lose",
    "targetWeight": 75,
    "goalPace": "moderate",
    "serviceTrack": "nutrition_and_workouts",
    "dailyActivity": "light",
    "dietType": "balanced",
    "region": "egypt",
    "budget": "medium",
    "mealsCount": 4,
    "selectedWorkoutDays": [
      1,
      3,
      5
    ],
    "workoutLocation": "gym_only",
    "fitnessLevel": "beginner",
    "sessionDuration": 45,
    "healthConfirmed": true,
    "weekdayConvention": "js_sunday_0"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — generate Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "generate",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "generate",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Confirm Health (Legacy Workouts-Only)

Explicit health confirmation for legacy `workouts_only` accounts that have not yet confirmed medical readiness.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "confirm_health" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `confirm_health`. |
| `payload.healthy` | `boolean` | Yes | Must be `true` | Confirms no acute medical contraindication. |
| `payload.injuryFree` | `boolean` | Yes | Must be `true` | Confirms no unmanaged acute injury. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "confirm_health",
  "payload": {
    "healthy": true,
    "injuryFree": true
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — confirm_health Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "confirm_health",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "confirm_health",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Confirm Schedule (Legacy Calendar Migration)

Maps legacy workout day indexes to canonical `js_sunday_0` (`0=Sun .. 6=Sat`).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "confirm_schedule" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `confirm_schedule`. |
| `payload.dayMap` | `Record<string, integer>` | Yes | Distinct target values `0..6` for every existing workout day | Map of old dayIndex -> canonical dayIndex. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "confirm_schedule",
  "payload": {
    "dayMap": {
      "1": 1,
      "3": 3,
      "5": 5
    }
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — confirm_schedule Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "confirm_schedule",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "confirm_schedule",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Renew Weekly Nutrition Plan

Generates the next 7-day nutrition plan after the active plan's end date has elapsed, or early when `earlyRenew: true` (starting today while keeping today's meals; Pro-gated when enforcement is enabled).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "renew_plan" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `renew_plan`. |
| `payload.earlyRenew` | `boolean` | No | default: false (Pro when true) | When `true`, regenerates a full 7-day plan starting today while preserving today's meals. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "renew_plan",
  "payload": {}
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — renew_plan Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "renew_plan",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "renew_plan",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

## 04. Account State & Bootstrap (KMM)

Mobile startup bootstrap (`< 10 KB`), full state aggregate, and 14-day progress analytics with ETag caching (`304 Not Modified`).

### Get Bootstrap (Lightweight KMM Startup)

Lightweight mobile startup payload (`< 10 KB`) returning profile, preferences, active plan refs, `todaySummary`, pending adaptations, and `ETag`.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/bootstrap`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/bootstrap`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/bootstrap`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/bootstrap`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |
| `If-None-Match` | `string` | No | Optional saved `ETag` to receive `304 Not Modified` when unchanged. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `schemaVersion` | `integer` | Schema version (`3`). |
| `revision` | `integer` | Current optimistic-concurrency revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local date. |
| `timezone` | `string (IANA)` | Configured user timezone. |
| `profile` | `object | null` | User profile (`null` before onboarding). |
| `activeNutritionPlanRef` | `object | null` | Reference to active nutrition plan. |
| `activeWorkoutPlanRef` | `object | null` | Reference to active workout plan. |
| `todaySummary` | `object` | Today's food, water, recovery, and session status. |
| `pendingAdaptations` | `Array<object>` | Unexpired pending adaptation proposals. |

#### Example Response — 200 OK — Bootstrap
```json
{
  "ok": true,
  "data": {
    "schemaVersion": 3,
    "revision": 1,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "profile": {
      "name": "Ahmed Mohamed",
      "goal": "lose",
      "weight": 82
    },
    "activeNutritionPlanRef": {
      "id": "plan-uuid"
    },
    "activeWorkoutPlanRef": {
      "id": "wp-uuid"
    },
    "todaySummary": {},
    "pendingAdaptations": []
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 1
  }
}
```

---

### Get Full Account State

Returns the complete account aggregate including active 7-day nutrition plan, workout plan, diary logs, recovery check-ins, and review history. Supports `If-None-Match` ETag.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/state`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/state`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/state`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/state`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |
| `If-None-Match` | `string` | No | Optional saved `ETag`. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `revision` | `integer` | Account revision. |
| `profile` | `object | null` | Saved onboarding profile. |
| `activePlan` | `object | null` | Full 7-day active nutrition plan. |
| `workoutPlan` | `object | null` | Full active workout plan. |
| `foodEntries` | `Array<object>` | Detailed food diary entries. |
| `waterLogs` | `Array<object>` | Daily hydration logs. |
| `weights` | `Array<object>` | Body weight log history. |
| `lastReview` | `object | null` | Most recent adaptive coaching review. |

---

### Get 14-Day Progress Summary

Returns 14-day weight trend (7d vs previous 7d average), food completeness, hydration adherence, and workout progression insights.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/progress/summary`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/progress/summary`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/progress/summary`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/progress/summary`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `windowStart` | `string (YYYY-MM-DD)` | Start of 14-day window. |
| `windowEnd` | `string (YYYY-MM-DD)` | Today (user-local). |
| `weightTrend` | `object` | 14d measurements count, 7d averages, weekly change %. |
| `foodCompleteness` | `object` | Complete diary days vs required 10/14. |
| `hydration` | `object` | Today cups/liters vs dynamic target & 14d adherence. |
| `workoutSummary` | `object` | Completed/partial/missed sessions and load progression. |

---

## 05. Nutrition & Food Diary

Daily food diary summary, planned/ingredient/manual food logging, explicit completion confirmation, deletion, and validated meal substitutions.

### Get Food Diary for Date

Returns actual food entries, nullable nutrient totals, completion status, and planned energy target for a specific user-local date or `from..to` range (up to 62 days).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/food-diary?date={{todayDate}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/food-diary?date={{todayDate}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/food-diary?date={{todayDate}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/food-diary?date={{todayDate}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `date` | `string (YYYY-MM-DD)` | No | Defaults to today | User-local calendar date. |
| `from` | `string (YYYY-MM-DD)` | No | Optional range start (with `to`) | Range start date (inclusive). |
| `to` | `string (YYYY-MM-DD)` | No | Optional range end (max 62 days) | Range end date (inclusive). |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `date` | `string (YYYY-MM-DD)` | Diary date. |
| `entries` | `Array<object>` | Logged food entries for the date. |
| `totals` | `object` | Nullable summed macros `{ energy, protein, carbs, fat, fiber, sodium }`. |
| `complete` | `boolean` | Explicit user confirmation flag. |
| `planEnergy` | `number | null` | Planned energy target for that date. |

---

### Log Planned Meal (food_entry — planned)

Logs consumption of a planned meal from the active nutrition plan. Reopens day completion until explicitly confirmed via `food_complete`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_entry" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_entry`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Within past 90 days up to today | Log date. |
| `payload.source` | `string (const)` | Yes | "planned" | Planned meal entry source. |
| `payload.mealId` | `string (UUID)` | Yes | Must exist in active plan | Planned meal ID. |
| `payload.slot` | `string (enum)` | Yes | `breakfast` | `lunch` | `dinner` | `snack` | `snack1` | `snack2` | Meal slot. |
| `payload.quantity` | `number` | No | 0.1..5 (default 1) | Portion multiplier (e.g. `0.5`, `1`, `1.5`). |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_entry",
  "payload": {
    "date": "{{todayDate}}",
    "source": "planned",
    "mealId": "{{sampleMealId}}",
    "slot": "breakfast",
    "quantity": 1
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_entry Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_entry",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_entry",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Log Reference Ingredient (food_entry — ingredient)

Logs a verified reference ingredient by planning key (e.g. `chicken`, `rice`, `fava`, `egg`, `oats`) and weight in grams.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_entry" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_entry`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Past 90 days..today | Log date. |
| `payload.source` | `string (const)` | Yes | "ingredient" | Reference ingredient source. |
| `payload.key` | `string` | Yes | Valid key from `/v1/foods` (e.g. `chicken`, `rice`, `fava`) | Ingredient key. |
| `payload.grams` | `number` | Yes | 1..3000 (grams) | Consumed weight in grams. |
| `payload.slot` | `string (enum)` | Yes | `breakfast` | `lunch` | `dinner` | `snack` | Meal slot. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_entry",
  "payload": {
    "date": "{{todayDate}}",
    "source": "ingredient",
    "key": "chicken",
    "grams": 150,
    "slot": "lunch"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_entry Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_entry",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_entry",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Log Manual Food Entry (food_entry — manual)

Logs a custom manual food item with calories and optional protein/carbs/fat.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_entry" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_entry`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Past 90 days..today | Log date. |
| `payload.source` | `string (const)` | Yes | "manual" | Manual entry source. |
| `payload.name` | `string` | Yes | 1..120 chars | Meal/food label. |
| `payload.slot` | `string (enum)` | Yes | `breakfast` | `lunch` | `dinner` | `snack` | Meal slot. |
| `payload.energy` | `number` | Yes | 0..5000 (kcal) | Total energy in kcal. |
| `payload.protein` | `number | null` | No | 0..400 (g) | Optional protein grams. |
| `payload.carbs` | `number | null` | No | 0..800 (g) | Optional carbs grams. |
| `payload.fat` | `number | null` | No | 0..300 (g) | Optional fat grams. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_entry",
  "payload": {
    "date": "{{todayDate}}",
    "source": "manual",
    "name": "Medium Koshary Bowl",
    "slot": "dinner",
    "energy": 480,
    "protein": 16,
    "carbs": 82,
    "fat": 9
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_entry Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_entry",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_entry",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Log Food Entries Batch (food_entry_batch)

Atomically logs 1..15 food entries (multi-select quick-log tray across recent, planned, ingredient, recipe, barcode, or manual items) in a single request.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_entry_batch" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_entry_batch`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Optional batch default date | Default date applied when omitted per item. |
| `payload.slot` | `string (enum)` | No | Optional batch default slot | Default slot applied when omitted per item. |
| `payload.displaySlot` | `string (enum)` | No | `suhoor` | `iftar` | `ramadan_snack` | null | Optional batch default Ramadan display slot. |
| `payload.items` | `Array<object>` | Yes | 1..15 food_entry objects | Array of food entries to validate and commit atomically. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_entry_batch",
  "payload": {
    "date": "{{todayDate}}",
    "slot": "breakfast",
    "items": [
      {
        "source": "ingredient",
        "key": "egg",
        "grams": 120
      },
      {
        "source": "manual",
        "name": "Espresso Without Sugar",
        "energy": 5
      }
    ]
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_entry_batch Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_entry_batch",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_entry_batch",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Update Food Entry Atomically (food_entry_update)

Atomically edits an existing food entry in place (preserving ID, scaling without 0.1..4.0 clamp, converting grams/servings, and updating displaySlot).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_entry_update" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_entry_update`. |
| `payload.id` | `string (UUID)` | Yes | Existing food entry ID | Food entry ID to update. |
| `payload.slot` | `string (enum)` | No | `breakfast` | `lunch` | `dinner` | `snack` | Updated meal slot. |
| `payload.displaySlot` | `string (enum) | null` | No | `suhoor` | `iftar` | `ramadan_snack` | null | Updated Ramadan display slot. |
| `payload.quantity` | `number` | No | 0.1..10 (planned entries) | Updated portion multiplier. |
| `payload.grams` | `number` | No | 1..5000 (ingredient/recipe entries) | Updated weight in grams. |
| `payload.servings` | `number` | No | 0.1..20 (recipe entries) | Updated recipe servings. |
| `payload.name` | `string` | No | 1..120 chars (manual entries) | Updated label. |
| `payload.energy` | `number` | No | 0..5000 (manual entries) | Updated calories. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_entry_update",
  "payload": {
    "id": "{{sampleFoodEntryId}}",
    "slot": "dinner",
    "energy": 510,
    "protein": 18
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_entry_update Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_entry_update",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_entry_update",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Confirm Food Day Complete (food_complete)

Explicitly confirms whether all food intake for `date` has been recorded (independent of calorie adherence).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_complete" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_complete`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Past 90 days..today | Diary date. |
| `payload.complete` | `boolean` | Yes | `true` | `false` | Explicit user confirmation. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_complete",
  "payload": {
    "date": "{{todayDate}}",
    "complete": true
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_complete Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_complete",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_complete",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Delete Food Entry (food_delete)

Deletes a logged food entry by ID and reopens that day's completion status.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_delete" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_delete`. |
| `payload.id` | `string (UUID)` | Yes | Existing entry ID | Food entry ID to delete. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_delete",
  "payload": {
    "id": "{{sampleFoodEntryId}}"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_delete Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_delete",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_delete",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Log Legacy Daily Total (food)

Logs a single daily calorie total for a date that has no detailed entries.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Past 90 days..today | Diary date. |
| `payload.energy` | `number` | Yes | 0..10000 (kcal) | Daily total calories. |
| `payload.complete` | `boolean` | Yes | `true` | `false` | Completion flag. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food",
  "payload": {
    "date": "{{todayDate}}",
    "energy": 1850,
    "complete": true
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Switch Legacy Day to Detailed Entries (food_switch_to_entries)

Archives a legacy daily total so detailed food entries can be logged for that date.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_switch_to_entries" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_switch_to_entries`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Date with legacy daily total | Target date. |
| `payload.confirm` | `boolean` | Yes | Must be `true` | Explicit switch confirmation. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_switch_to_entries",
  "payload": {
    "date": "{{todayDate}}",
    "confirm": true
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_switch_to_entries Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_switch_to_entries",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_switch_to_entries",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Get Meal Alternatives

Returns up to 6 validated culinary substitutes matching diet, budget, exclusions, and clinical constraints.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/meal-alternatives?mealId={{sampleMealId}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/meal-alternatives?mealId={{sampleMealId}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/meal-alternatives?mealId={{sampleMealId}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/meal-alternatives?mealId={{sampleMealId}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `mealId` | `string (UUID)` | Yes | Meal ID from active plan | Meal to find alternatives for. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `items` | `Array<object>` | Validated substitutes with `templateId`, `name`, macros, and nutrient deltas. |

---

### Replace Planned Meal (replace_meal)

Substitutes a planned meal with a validated `templateId` from `GET /v1/meal-alternatives`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "replace_meal" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `replace_meal`. |
| `payload.mealId` | `string (UUID)` | Yes | Active plan meal ID | Target planned meal. |
| `payload.templateId` | `string` | Yes | From `/v1/meal-alternatives` | Replacement template ID. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "replace_meal",
  "payload": {
    "mealId": "{{sampleMealId}}",
    "templateId": "{{sampleAltTemplateId}}"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — replace_meal Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "replace_meal",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "replace_meal",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

## 06. Hydration, Weight & Activity

Water tracking, body weight scale logs, daily steps/activity, and idempotent wearable batch ingestion (Health Connect / Apple Health).

### Log Water Intake — Set Cups (water)

Sets total water intake (cups, 250 mL each) for the given date.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "water" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `water`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Defaults to today | Log date. |
| `payload.cups` | `integer` | Yes | 0..30 | Total cups (250 mL/cup). |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "water",
  "payload": {
    "date": "{{todayDate}}",
    "cups": 8
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — water Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "water",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "water",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Log Water Intake — Increment Cups (water)

Increments or decrements water intake relative to the date's existing total.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "water" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `water`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Defaults to today | Log date. |
| `payload.addCups` | `integer` | Yes | -10..20 (clamped 0..30) | Delta cups to add or subtract. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "water",
  "payload": {
    "date": "{{todayDate}}",
    "addCups": 2
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — water Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "water",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "water",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Water Logs

Paginated water intake logs ordered by date descending.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/water-logs?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/water-logs?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/water-logs?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/water-logs?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `from` | `string (YYYY-MM-DD)` | No | Optional start date | Filter logs with `date >= from`. |
| `to` | `string (YYYY-MM-DD)` | No | Optional end date | Filter logs with `date <= to`. |
| `offset` | `integer` | No | >= 0, default 0 | Zero-based pagination offset. |
| `limit` | `integer` | No | 1..100, default 30 | Maximum records returned per page. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `total` | `integer` | Total matching records. |
| `offset` | `integer` | Current offset. |
| `limit` | `integer` | Page size. |
| `nextOffset` | `integer | null` | Next page offset, or `null` if on the last page. |
| `items` | `Array<object>` | Page records ordered by date descending. |

---

### Log Body Weight (weight)

Records or updates scale weight (kg) for a date (same-date entries update in place).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "weight" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `weight`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Defaults to today | Measurement date. |
| `payload.kg` | `number` | Yes | 35..250 (kg) | Body weight in kilograms. |
| `payload.source` | `string` | No | `manual` | `wearable` | `health_connect` | `apple_health` | Measurement source. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "weight",
  "payload": {
    "date": "{{todayDate}}",
    "kg": 81.4,
    "source": "manual"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — weight Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "weight",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "weight",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Weight Logs

Paginated weight measurements ordered by date descending.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/weight-logs?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/weight-logs?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/weight-logs?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/weight-logs?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `from` | `string (YYYY-MM-DD)` | No | Optional start date | Filter logs with `date >= from`. |
| `to` | `string (YYYY-MM-DD)` | No | Optional end date | Filter logs with `date <= to`. |
| `offset` | `integer` | No | >= 0, default 0 | Zero-based pagination offset. |
| `limit` | `integer` | No | 1..100, default 30 | Maximum records returned per page. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `total` | `integer` | Total matching records. |
| `offset` | `integer` | Current offset. |
| `limit` | `integer` | Page size. |
| `nextOffset` | `integer | null` | Next page offset, or `null` if on the last page. |
| `items` | `Array<object>` | Page records ordered by date descending. |

---

### Log Daily Steps (steps)

Logs daily step count.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "steps" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `steps`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Defaults to today | Log date. |
| `payload.steps` | `integer` | Yes | 0..100000 | Step count. |
| `payload.source` | `string (enum)` | No | `manual` | `health_connect` | `apple_health` | `wearable` | Data source. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "steps",
  "payload": {
    "date": "{{todayDate}}",
    "steps": 8500,
    "source": "manual"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — steps Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "steps",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "steps",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Log Activity & Active Energy (activity)

Logs daily steps and active energy burn with optional deduplication via `externalRecordId`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "activity" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `activity`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Defaults to today | Log date. |
| `payload.steps` | `integer | null` | No | 0..100000 | Daily steps. |
| `payload.activeEnergyKcal` | `number | null` | No | 0..5000 (kcal) | Active energy burned. |
| `payload.source` | `string (enum)` | No | `manual` | `health_connect` | `apple_health` | `wearable` | Data source. |
| `payload.externalRecordId` | `string | null` | No | max 120 chars | Idempotent external record ID for deduplication. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "activity",
  "payload": {
    "date": "{{todayDate}}",
    "steps": 9200,
    "activeEnergyKcal": 410,
    "source": "health_connect",
    "externalRecordId": "hc-sample-001"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — activity Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "activity",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "activity",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Activity Logs

Paginated activity and step logs.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/activity-logs?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/activity-logs?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/activity-logs?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/activity-logs?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `from` | `string (YYYY-MM-DD)` | No | Optional start date | Filter logs with `date >= from`. |
| `to` | `string (YYYY-MM-DD)` | No | Optional end date | Filter logs with `date <= to`. |
| `offset` | `integer` | No | >= 0, default 0 | Zero-based pagination offset. |
| `limit` | `integer` | No | 1..100, default 30 | Maximum records returned per page. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `total` | `integer` | Total matching records. |
| `offset` | `integer` | Current offset. |
| `limit` | `integer` | Page size. |
| `nextOffset` | `integer | null` | Next page offset, or `null` if on the last page. |
| `items` | `Array<object>` | Page records ordered by date descending. |

---

### Ingest Wearables Batch (Health Connect / Apple Health)

Idempotent batch ingestion of up to 100 weight/steps/activity/cardio records from Android Health Connect or Apple HealthKit with partial skippedRecords[] reporting.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/wearables/ingest`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/wearables/ingest`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/wearables/ingest`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/wearables/ingest`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | No | Optional UUID (server derives canonical digest key if omitted). |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `records` | `Array<object>` | Yes | 1..100 records | Array of wearable records. |
| `records[].type` | `string (enum)` | Yes | `weight` | `steps` | `activity` | `cardio` | Record type. |
| `records[].date` | `string (YYYY-MM-DD)` | Yes | Past 90 days..today | Record date. |
| `records[].kg` | `number` | No | Required for `weight` (35..250) | Weight in kg. |
| `records[].steps` | `integer` | No | 0..100000 | Steps count. |
| `records[].activeEnergyKcal` | `number` | No | 0..5000 | Active calories. |
| `records[].modality` | `string` | No | For `cardio` (walking, running, cycling, swimming, etc.) | Cardio modality. |
| `records[].durationMinutes` | `integer` | No | For `cardio` (5..360) | Cardio duration in minutes. |
| `records[].externalRecordId` | `string` | No | max 120 chars | Deduplication ID. |

### Request Body Example
```json
{
  "records": [
    {
      "type": "weight",
      "date": "{{todayDate}}",
      "kg": 81.3,
      "source": "health_connect"
    },
    {
      "type": "activity",
      "date": "{{todayDate}}",
      "steps": 9600,
      "activeEnergyKcal": 430,
      "source": "health_connect",
      "externalRecordId": "hc-batch-001"
    }
  ]
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true`. |
| `revision` | `integer` | Updated account revision. |
| `ingested` | `integer` | Count of processed records. |
| `skippedRecords` | `Array<object>` | Validation-skipped records without blocking valid rows. |

#### Example Response — 200 OK — Ingested
```json
{
  "ok": true,
  "data": {
    "ok": true,
    "revision": 6,
    "ingested": 2
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 6
  }
}
```

---

## 07. Workouts & Training

Workout plan reads, exercise set logging with automated progression, session completion, injury-safe exercise alternatives, and session rescheduling.

### List Workout Plans

Lists active and archived workout plan version references owned by the user.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/workout-plans`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/workout-plans`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/workout-plans`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/workout-plans`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `items` | `Array<{id, version, split, parent_id}>` | Owned workout plan refs. |

---

### Get Workout Plan by ID

Fetches full owned workout plan enriched with days, exercises, targetRepsRange, targetRir, restSeconds, and weeklyMuscleSets.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/workout-plans/{{activeWorkoutPlanId}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/workout-plans/{{activeWorkoutPlanId}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/workout-plans/{{activeWorkoutPlanId}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/workout-plans/{{activeWorkoutPlanId}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Path Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `activeWorkoutPlanId` | `string (UUID)` | Yes | Owned workout plan ID. |

---

### Log Exercise Sets (workout)

Logs performed sets (`kg`/`addedKg`, `reps`, `rir`, `pain`, `setType`) plus optional session notes and computes progression suggestions.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "workout" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `workout`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Defaults to today | Exposure date. |
| `payload.dayIndex` | `integer` | Yes | 0..6 (`0=Sun .. 6=Sat`) | Workout day index in active plan. |
| `payload.exerciseId` | `string` | Yes | Must exist in day's exercises | Exercise ID. |
| `payload.weightedBodyweight` | `boolean` | No | Opt-in loaded bodyweight | Enables addedKg/kg tracking for supported bodyweight movements. |
| `payload.sets` | `Array<object>` | Yes | 1..10 sets: `{ kg?: 0..500, addedKg?: 0..500, reps: int 1..100, rir?: 0..10, pain?: boolean, setType?: string }` | Performed sets. |
| `payload.bothSides` | `boolean` | No | default: true (`false` pauses unilateral progression) | Confirms both sides completed. |
| `payload.increment` | `number | null` | No | 0.1..20 (kg) | Optional preferred load step. |
| `payload.notes` | `string` | No | max 300 chars | Optional exercise performance notes. |
| `payload.autoSession` | `boolean` | No | default: false | Automatically creates/updates session coverage record. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "workout",
  "payload": {
    "date": "{{todayDate}}",
    "dayIndex": {{sampleDayIndex}},
    "exerciseId": "{{sampleExerciseId}}",
    "sets": [
      {
        "kg": 20,
        "reps": 10,
        "rir": 2,
        "pain": false
      },
      {
        "kg": 20,
        "reps": 10,
        "rir": 2,
        "pain": false
      },
      {
        "kg": 20,
        "reps": 10,
        "rir": 2,
        "pain": false
      }
    ],
    "bothSides": true,
    "increment": 2.5
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — workout Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "workout",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "workout",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Workout Logs

Paginated exercise set/rep/load logs ordered by date descending, optionally filtered by `exerciseId`.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/workout-logs?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/workout-logs?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/workout-logs?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/workout-logs?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `from` | `string (YYYY-MM-DD)` | No | Optional start date | Filter logs with `date >= from`. |
| `to` | `string (YYYY-MM-DD)` | No | Optional end date | Filter logs with `date <= to`. |
| `offset` | `integer` | No | >= 0, default 0 | Zero-based pagination offset. |
| `limit` | `integer` | No | 1..100, default 30 | Maximum records returned per page. |
| `exerciseId` | `string` | No | Optional exercise ID filter | Filter history to one exercise. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `total` | `integer` | Total matching records. |
| `offset` | `integer` | Current offset. |
| `limit` | `integer` | Page size. |
| `nextOffset` | `integer | null` | Next page offset, or `null` if on the last page. |
| `items` | `Array<object>` | Page records ordered by date descending. |

---

### Delete Exercise Log (workout_delete)

Deletes a logged exercise set record by ID (or by `date`, `dayIndex`, and `exerciseId`).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "workout_delete" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `workout_delete`. |
| `payload.id` | `string (UUID)` | No | Existing workout log ID (or pass `date` + `dayIndex` + `exerciseId`) | Workout log ID to delete. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Optional composite key fallback | Workout date. |
| `payload.dayIndex` | `integer` | No | 0..6 | Workout day index. |
| `payload.exerciseId` | `string` | No | Exercise ID | Exercise ID. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "workout_delete",
  "payload": {
    "date": "{{todayDate}}",
    "dayIndex": {{sampleDayIndex}},
    "exerciseId": "{{sampleExerciseId}}"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — workout_delete Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "workout_delete",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "workout_delete",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Complete / Update Workout Session (session)

Marks a workout session as `completed`, `partial`, or `missed`. Completion ratio below 80% automatically classifies as `partial`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "session" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `session`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Defaults to today | Session date. |
| `payload.dayIndex` | `integer` | Yes | 0..6 | Workout day index. |
| `payload.status` | `string (enum)` | Yes | `completed` | `partial` | `missed` | Session completion status. |
| `payload.duration` | `number | null` | No | 1..240 (minutes) | Total workout duration. |
| `payload.rpe` | `number | null` | No | 0..10 | Session perceived exertion. |
| `payload.notes` | `string | null` | No | max 300 chars | Optional workout session notes. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "session",
  "payload": {
    "date": "{{todayDate}}",
    "dayIndex": {{sampleDayIndex}},
    "status": "completed",
    "duration": 45,
    "rpe": 7
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — session Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "session",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "session",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Delete Workout Session (session_delete)

Deletes a logged workout session record by ID (or `date` + `dayIndex`) and optionally clears its exercise logs (`deleteWorkouts: true`).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "session_delete" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `session_delete`. |
| `payload.id` | `string (UUID)` | No | Existing session ID (or pass `date` + `dayIndex`) | Session ID to delete. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Optional composite key fallback | Session date. |
| `payload.dayIndex` | `integer` | No | 0..6 | Workout day index. |
| `payload.deleteWorkouts` | `boolean` | No | default: false | When `true`, also removes exercise logs from that session. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "session_delete",
  "payload": {
    "date": "{{todayDate}}",
    "dayIndex": {{sampleDayIndex}},
    "deleteWorkouts": false
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — session_delete Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "session_delete",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "session_delete",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Workout Sessions

Paginated workout session completion records.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/sessions?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/sessions?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/sessions?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/sessions?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `from` | `string (YYYY-MM-DD)` | No | Optional start date | Filter logs with `date >= from`. |
| `to` | `string (YYYY-MM-DD)` | No | Optional end date | Filter logs with `date <= to`. |
| `offset` | `integer` | No | >= 0, default 0 | Zero-based pagination offset. |
| `limit` | `integer` | No | 1..100, default 30 | Maximum records returned per page. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `total` | `integer` | Total matching records. |
| `offset` | `integer` | Current offset. |
| `limit` | `integer` | Page size. |
| `nextOffset` | `integer | null` | Next page offset, or `null` if on the last page. |
| `items` | `Array<object>` | Page records ordered by date descending. |

---

### Get Exercise Alternatives

Returns up to 6 biomechanically equivalent, injury-safe, equipment-matched, time-budget-validated exercise substitutes.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/exercise-alternatives?dayIndex={{sampleDayIndex}}&exerciseId={{sampleExerciseId}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/exercise-alternatives?dayIndex={{sampleDayIndex}}&exerciseId={{sampleExerciseId}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/exercise-alternatives?dayIndex={{sampleDayIndex}}&exerciseId={{sampleExerciseId}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/exercise-alternatives?dayIndex={{sampleDayIndex}}&exerciseId={{sampleExerciseId}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `dayIndex` | `integer` | Yes | 0..6 | Target workout day index. |
| `exerciseId` | `string` | Yes | Exercise ID in that day | Exercise to substitute. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `items` | `Array<object>` | Validated alternative exercise objects. |

---

### Replace Exercise (replace_exercise)

Forks the workout plan replacing `exerciseId` with a validated `alternativeId` while preserving historical logs.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "replace_exercise" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `replace_exercise`. |
| `payload.dayIndex` | `integer` | Yes | 0..6 | Workout day index. |
| `payload.exerciseId` | `string` | Yes | Current exercise ID | Exercise being replaced. |
| `payload.alternativeId` | `string` | Yes | From `/v1/exercise-alternatives` | Approved substitute ID. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "replace_exercise",
  "payload": {
    "dayIndex": {{sampleDayIndex}},
    "exerciseId": "{{sampleExerciseId}}",
    "alternativeId": "{{sampleAltExerciseId}}"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — replace_exercise Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "replace_exercise",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "replace_exercise",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Propose Workout Reschedule (reschedule)

Creates a pending schedule adaptation proposal moving a workout day to a rest day within the next 13 days (returns `409 SESSION_ALREADY_COMPLETED` if completed).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "reschedule" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `reschedule`. |
| `payload.dayIndex` | `integer` | Yes | 0..6 | Workout day to move. |
| `payload.toDate` | `string (YYYY-MM-DD)` | Yes | Rest day within `today..today+13` | Target date. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "reschedule",
  "payload": {
    "dayIndex": {{sampleDayIndex}},
    "toDate": "{{sampleRescheduleDate}}"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — reschedule Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "reschedule",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "reschedule",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Get 8-Week Split Review

Evaluates 8-week Full Body split progression readiness returning `{ due, kind, code, params, text }` in canonical pure English.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/workouts/split-review`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/workouts/split-review`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/workouts/split-review`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/workouts/split-review`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

## 08. Recovery & Adaptive Coaching

Daily recovery check-ins, deterministic coaching reviews, adaptation approvals, personalized coaching brief, and structured coaching agreements.

### Submit Daily Recovery Check-in (recovery)

Records daily sleep, fatigue, stress, regional muscle soreness, pain regions, illness, and red flags; feeds directly into workout readiness and deload logic.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "recovery" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `recovery`. |
| `payload.date` | `string (YYYY-MM-DD)` | No | Defaults to today | Check-in date. |
| `payload.sleepHours` | `number` | Yes | 0..24 | Hours slept. |
| `payload.sleepQuality` | `integer` | Yes | 1..5 | Sleep quality score (`1=poor .. 5=great`). |
| `payload.fatigue` | `integer` | Yes | 1..5 | Fatigue score (`1=low .. 5=high`). |
| `payload.stress` | `integer | null` | No | 1..5 | Stress score. |
| `payload.soreness` | `number` | No | 0..10 (default 0) | Overall muscle soreness. |
| `payload.sorenessByRegion` | `Record<string, number>` | No | Keys from `MUSCLE_REGIONS`, values `0..10` | Per-region soreness map. |
| `payload.pain` | `boolean` | Yes | boolean | Whether joint/sharp pain is present. |
| `payload.painRegions` | `Array<string>` | No | Valid `MUSCLE_REGIONS` keys | Affected pain regions. |
| `payload.illness` | `boolean` | Yes | boolean | Whether user is currently ill. |
| `payload.redFlags` | `boolean` | Yes | boolean | Severe clinical red-flag symptoms (triggers stop recommendation). |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "recovery",
  "payload": {
    "date": "{{todayDate}}",
    "sleepHours": 7.5,
    "sleepQuality": 4,
    "fatigue": 2,
    "stress": 2,
    "soreness": 2,
    "sorenessByRegion": {
      "chest": 2,
      "quads": 1
    },
    "pain": false,
    "painRegions": [],
    "illness": false,
    "redFlags": false
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — recovery Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "recovery",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "recovery",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Recovery Check-ins

Paginated daily recovery check-ins.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/checkins?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/checkins?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/checkins?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/checkins?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `from` | `string (YYYY-MM-DD)` | No | Optional start date | Filter logs with `date >= from`. |
| `to` | `string (YYYY-MM-DD)` | No | Optional end date | Filter logs with `date <= to`. |
| `offset` | `integer` | No | >= 0, default 0 | Zero-based pagination offset. |
| `limit` | `integer` | No | 1..100, default 30 | Maximum records returned per page. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `total` | `integer` | Total matching records. |
| `offset` | `integer` | Current offset. |
| `limit` | `integer` | Page size. |
| `nextOffset` | `integer | null` | Next page offset, or `null` if on the last page. |
| `items` | `Array<object>` | Page records ordered by date descending. |

---

### Trigger Adaptive Review (review)

Evaluates recovery readiness, 14-day weight & nutrition evidence, and workout volume progression; generates explained review and optional pending adaptation proposals.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=full`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=full`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=full`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=full`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "review" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `review`. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "review",
  "payload": {}
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — review Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "review",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "review",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Accept or Reject Adaptation Proposal (adaptation)

Accepts (`accept: true`) or declines (`accept: false`) a current, unexpired pending adaptation proposal.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "adaptation" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `adaptation`. |
| `payload.id` | `string (UUID)` | Yes | Pending proposal ID | Proposal ID from `pendingAdaptations`. |
| `payload.accept` | `boolean` | Yes | `true` | `false` | Decision. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "adaptation",
  "payload": {
    "id": "{{sampleProposalId}}",
    "accept": true
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — adaptation Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "adaptation",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "adaptation",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Get On-Demand Coaching Brief

Returns deterministic personalized nutrition, training, and follow-up coaching notes for today (read-only; supports `If-None-Match` ETag).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/coaching/brief`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/coaching/brief`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/coaching/brief`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/coaching/brief`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |
| `If-None-Match` | `string` | No | Optional saved ETag. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `apiVersion` | `string` | `"1"`. |
| `viewKind` | `string` | `"on_demand_coaching_brief"`. |
| `date` | `string (YYYY-MM-DD)` | User-local date. |
| `revision` | `integer` | Account revision. |
| `requiresOnboarding` | `boolean` | `true` if no profile exists yet. |
| `notes` | `Array<CoachingBriefNote>` | Structured notes with `id`, `role`, `priority`, `text`, `action`, `actionTarget`. |

---

### Get Coaching Inbox (Active Agreements)

Lists active in-app coaching agreements and review dates (read-only; never auto-acknowledges).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/coaching/inbox`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/coaching/inbox`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/coaching/inbox`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/coaching/inbox`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `date` | `string (YYYY-MM-DD)` | Current date. |
| `revision` | `integer` | Account revision. |
| `channel` | `string` | `"in_app"`. |
| `items` | `Array<CoachingCase>` | Active coaching cases. |

---

### Get Coaching Agreement History

Paginated historical coaching cases/agreements.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/coaching/history?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/coaching/history?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/coaching/history?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/coaching/history?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `from` | `string (YYYY-MM-DD)` | No | Optional start date | Filter logs with `date >= from`. |
| `to` | `string (YYYY-MM-DD)` | No | Optional end date | Filter logs with `date <= to`. |
| `offset` | `integer` | No | >= 0, default 0 | Zero-based pagination offset. |
| `limit` | `integer` | No | 1..100, default 30 | Maximum records returned per page. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `total` | `integer` | Total matching records. |
| `offset` | `integer` | Current offset. |
| `limit` | `integer` | Page size. |
| `nextOffset` | `integer | null` | Next page offset, or `null` if on the last page. |
| `items` | `Array<object>` | Page records ordered by date descending. |

---

### Submit Coaching Feedback (coaching_feedback)

Logs nutrition or training adherence barriers and subjective scores (1..5), opening a follow-up agreement when warranted.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "coaching_feedback" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `coaching_feedback`. |
| `payload.domain` | `string (enum)` | Yes | `nutrition` | `training` | Coaching domain. |
| `payload.barrier` | `string (enum)` | Yes | Nutrition: `time|budget|taste|hunger|eating_out|logging|none`; Training: `time|fatigue|pain|equipment|motivation|none` | Primary barrier. |
| `payload.hunger` | `integer | null` | No | 1..5 (nutrition only) | Hunger score. |
| `payload.satiety` | `integer | null` | No | 1..5 (nutrition only) | Satiety score. |
| `payload.energy` | `integer | null` | No | 1..5 | Subjective energy score. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "coaching_feedback",
  "payload": {
    "domain": "nutrition",
    "barrier": "time",
    "hunger": 2,
    "satiety": 4,
    "energy": 4
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — coaching_feedback Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "coaching_feedback",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "coaching_feedback",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Acknowledge Coaching Case (coaching_ack)

Explicitly marks a coaching agreement/message as read/acknowledged.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "coaching_ack" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `coaching_ack`. |
| `payload.id` | `string` | Yes | Coaching case ID | Case ID from `/v1/coaching/inbox`. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "coaching_ack",
  "payload": {
    "id": "{{sampleCaseId}}"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — coaching_ack Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "coaching_ack",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "coaching_ack",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Decide on Coaching Case (coaching_decision)

Accepts or declines a proposed coaching agreement.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "coaching_decision" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `coaching_decision`. |
| `payload.id` | `string` | Yes | Coaching case ID | Case ID. |
| `payload.accept` | `boolean` | Yes | `true` | `false` | Accept or decline. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "coaching_decision",
  "payload": {
    "id": "{{sampleCaseId}}",
    "accept": true
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — coaching_decision Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "coaching_decision",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "coaching_decision",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Report Coaching Outcome (coaching_outcome)

Records user-reported outcome for an accepted coaching agreement.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "coaching_outcome" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `coaching_outcome`. |
| `payload.id` | `string` | Yes | Accepted coaching case ID | Case ID. |
| `payload.outcome` | `string (enum)` | Yes | `helped` | `not_helped` | `not_tried` | User-reported result. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "coaching_outcome",
  "payload": {
    "id": "{{sampleCaseId}}",
    "outcome": "helped"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — coaching_outcome Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "coaching_outcome",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "coaching_outcome",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

## 09. Nutrition Plans & Archives

List active/archived nutrition plan versions, fetch a full 7-day plan, or lazy-load a single day.

### List Nutrition Plan Refs

Lists active and archived nutrition plan references owned by the caller.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/plans`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/plans`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/plans`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/plans`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `items` | `Array<{id, start_date, end_date, energy, reason, parent_id}>` | Plan version refs. |

---

### Get Full Nutrition Plan by ID

Fetches the full 7-day owned nutrition plan by ID.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/plans/{{activePlanId}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/plans/{{activePlanId}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/plans/{{activePlanId}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/plans/{{activePlanId}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Path Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `activePlanId` | `string` | Yes | Owned nutrition plan ID. |

---

### Lazy-Load Single Nutrition Plan Day

Lazy-loads a single day's meals, summary, and historical macro targets from an owned nutrition plan.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/plans/{{activePlanId}}/days/{{todayDate}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/plans/{{activePlanId}}/days/{{todayDate}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/plans/{{activePlanId}}/days/{{todayDate}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/plans/{{activePlanId}}/days/{{todayDate}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Path Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `activePlanId` | `string` | Yes | Owned nutrition plan ID. |
| `todayDate` | `string (YYYY-MM-DD)` | Yes | Calendar date within the plan. |

---

## 10. Food, Beverage & Exercise Catalogs

3,070+ Egyptian/Gulf/reference foods with Arabic synonym normalization, prepared beverages, custom recipe calculator, and 868 OpenExerciseDB exercises.

### Get Catalog Provenance Manifest

Returns pinned versions, source hashes, licenses, and item counts for both exercise and food catalogs.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/catalog/manifest`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/catalog/manifest`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/catalog/manifest`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/catalog/manifest`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### List Muscle Taxonomy & Arabic Labels

Returns canonical muscle IDs and Arabic/English translations.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/catalog/muscles`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/catalog/muscles`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/catalog/muscles`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/catalog/muscles`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Search Foods (Arabic & English)

Searches the Egyptian/Gulf & reference food catalog with Arabic normalization, colloquial synonyms, and provenance status.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/foods?q=chicken&scope=all&includeEstimated=true&offset=0&limit=20`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/foods?q=chicken&scope=all&includeEstimated=true&offset=0&limit=20`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/foods?q=chicken&scope=all&includeEstimated=true&offset=0&limit=20`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/foods?q=chicken&scope=all&includeEstimated=true&offset=0&limit=20`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `q` | `string` | No | max 100 chars | Arabic or English search term. |
| `scope` | `string (enum)` | No | `all` | `approved` | `planning` | `beverages` (default `all`) | Catalog scope filter. |
| `includeEstimated` | `boolean` | No | default `false` | Include calculated recipe estimates. |
| `offset` | `integer` | No | >= 0, default 0 | Pagination offset. |
| `limit` | `integer` | No | 1..100, default 40 | Page size. |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `items` | `Array<FoodCatalogItem>` | Matched foods with `id`, `key`, `name_ar`, `values` (per 100g), `status`, `qualityTier`. |
| `total` | `integer` | Total matched items. |
| `nextOffset` | `integer | null` | Next page offset. |
| `coverageStatus` | `string (enum)` | `verified_reference_available` | `mixed_verified_and_estimated` | `estimated_model_only_requires_specialist_review` | `missing_coverage`. |

---

### Get Food Item Detail

Returns full provenance, nutrient basis, household portions, and recipe estimate metadata for a food item.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/foods/{{sampleFoodId}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/foods/{{sampleFoodId}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/foods/{{sampleFoodId}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/foods/{{sampleFoodId}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Path Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `sampleFoodId` | `string` | Yes | Food ID or planning key. |

---

### Search Egyptian & Ramadan Beverages

Searches prepared Egyptian, cafe, Ramadan, and fresh juice beverages.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/beverages?q=tea&includeEstimated=true&offset=0&limit=20`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/beverages?q=tea&includeEstimated=true&offset=0&limit=20`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/beverages?q=tea&includeEstimated=true&offset=0&limit=20`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/beverages?q=tea&includeEstimated=true&offset=0&limit=20`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `q` | `string` | No | max 100 chars | Search query. |
| `includeEstimated` | `boolean` | No | default `false` | Include recipe estimates. |
| `offset` | `integer` | No | >= 0 | Offset. |
| `limit` | `integer` | No | 1..100 | Page size. |

---

### Calculate Custom Recipe / Beverage Nutrients

Calculates aggregate nutrients and per-100g cooked yield from verified ingredients.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/foods/calculate`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/foods/calculate`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/foods/calculate`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/foods/calculate`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `ingredients` | `Array<object>` | Yes | Array of `{ key: string, grams?: number, ml?: number }` | Base ingredients from approved catalog. |
| `additions` | `Array<object>` | No | Same shape as `ingredients` | Optional toppings/sweeteners. |
| `finalWeightGrams` | `number | null` | No | > 0 (grams) | Measured cooked/final weight to compute `per100g` and `yieldRatio`. |

### Request Body Example
```json
{
  "ingredients": [
    {
      "key": "chicken",
      "grams": 150
    },
    {
      "key": "rice",
      "grams": 120
    }
  ],
  "finalWeightGrams": 240
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `qualityTier` | `string` | Provenance quality tier. |
| `inputWeightGrams` | `string` | Total raw input grams. |
| `finalWeightGrams` | `string | null` | Final cooked weight. |
| `yieldRatio` | `string | null` | Cooked/raw yield ratio. |
| `nutrients` | `object` | `energy`, `protein`, `fat`, `carbs`, `fiber`, `saturated`, `sodium`, `sugars` with `total`, `per100g`, `coverageByWeight`. |

#### Example Response — 200 OK — Recipe Calculated
```json
{
  "ok": true,
  "data": {
    "qualityTier": "Calculated from Verified Ingredients",
    "inputWeightGrams": "270",
    "finalWeightGrams": "240",
    "yieldRatio": "0.8889",
    "per100gAvailable": true,
    "nutrients": {
      "energy": {
        "total": "412",
        "per100g": "171.7",
        "coverageByWeight": "1"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Search Exercises Catalog

Searches and filters the 868-exercise catalog (30 items per page).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/exercises?q=bench&offset=0`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/exercises?q=bench&offset=0`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/exercises?q=bench&offset=0`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/exercises?q=bench&offset=0`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `q` | `string` | No | max 100 chars | Exercise name substring. |
| `muscle` | `string` | No | Muscle ID or region | Optional target muscle filter. |
| `equipment` | `string` | No | Equipment ID | Optional equipment filter. |
| `offset` | `integer` | No | >= 0, default 0 | Pagination offset (30/page). |

---

### Get Exercise Detail by ID

Returns full exercise metadata, target muscles, equipment, and instructions.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/exercises/{{sampleCatalogExerciseId}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/exercises/{{sampleCatalogExerciseId}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/exercises/{{sampleCatalogExerciseId}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/exercises/{{sampleCatalogExerciseId}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Path Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `sampleCatalogExerciseId` | `string (URL-encoded)` | Yes | URL-encoded exercise ID (e.g. `oedb%3A12`). |

---

## 11. Offline Sync & User Settings

Incremental delta outbox sync feed for offline-first mobile apps, timezone/locale settings, notification preferences, and entitlements.

### Get Incremental Sync Changes & Entity Deltas

Returns incremental revision metadata and entity-level outbox deltas (`upsert` and `delete` tombstones) for offline SQLite/SQLDelight synchronization.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/sync/changes?after=0&afterSeq={{nextSeqCursor}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/sync/changes?after=0&afterSeq={{nextSeqCursor}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/sync/changes?after=0&afterSeq={{nextSeqCursor}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/sync/changes?after=0&afterSeq={{nextSeqCursor}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `after` | `integer` | No | >= 0, default 0 | Last synced account revision. |
| `afterSeq` | `integer` | No | >= 0 | Last synced outbox sequence cursor (`nextSeqCursor`). |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `items` | `Array<{revision, action, at}>` | Revision audit entries. |
| `deltas` | `Array<{seq, revision, entityType, entityId, op, at, payload}>` | Entity-level deltas (max 100/page). |
| `currentRevision` | `integer` | Latest server revision. |
| `nextCursor` | `integer` | Next `after` revision cursor. |
| `nextSeqCursor` | `integer` | Next `afterSeq` cursor — persist verbatim. |
| `hasMore` | `boolean` | `true` if more pages remain. |
| `resyncRequired` | `boolean` | `true` if client cursor exceeds server revision. |

---

### Update Timezone & Locale (timezone)

Updates user IANA timezone and optional UI locale.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "timezone" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `timezone`. |
| `payload.timezone` | `string (IANA)` | Yes | Valid IANA timezone (e.g. `Africa/Cairo`, `Asia/Riyadh`, `Asia/Dubai`) | Target timezone. |
| `payload.locale` | `string (enum)` | No | `ar-EG` | `ar-SA` | `en` | Optional preferred locale. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "timezone",
  "payload": {
    "timezone": "Africa/Cairo",
    "locale": "ar-EG"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — timezone Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "timezone",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "timezone",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Get Notification Preferences

Returns stored reminder flags and quiet-hours window.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/notifications/preferences`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/notifications/preferences`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/notifications/preferences`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/notifications/preferences`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Update Notification Preferences (notification_preferences)

Updates reminder toggles and HH:mm quiet-hours window.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "notification_preferences" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `notification_preferences`. |
| `payload.dailyReminder` | `boolean` | No | boolean | Daily check-in reminder. |
| `payload.workoutReminder` | `boolean` | No | boolean | Workout day reminder. |
| `payload.waterReminder` | `boolean` | No | boolean | Hydration reminder. |
| `payload.weeklyReviewReminder` | `boolean` | No | boolean | Weekly review reminder. |
| `payload.ramadanSuhoorReminder` | `boolean` | No | boolean | Ramadan pre-dawn Suhoor reminder. |
| `payload.exemptSuhoorFromQuietHours` | `boolean` | No | boolean | Allow Suhoor alert even during quiet hours. |
| `payload.quietHoursStart` | `string (HH:mm)` | No | `00:00`..`23:59` | Quiet hours start. |
| `payload.quietHoursEnd` | `string (HH:mm)` | No | `00:00`..`23:59` | Quiet hours end. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "notification_preferences",
  "payload": {
    "dailyReminder": true,
    "workoutReminder": true,
    "waterReminder": true,
    "weeklyReviewReminder": true,
    "quietHoursStart": "22:00",
    "quietHoursEnd": "08:00"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — notification_preferences Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "notification_preferences",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "notification_preferences",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Get Entitlements

Returns current account subscription tier (`free` | `premium`) and enabled feature list.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/entitlements`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/entitlements`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/entitlements`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/entitlements`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

## 12. Privacy, Export & GDPR Deletion

Versioned health/privacy consent recording, normalized table backfill, full machine-readable GDPR JSON export, and irreversible GDPR account erasure.

### Record Privacy / Health Consent

Records one or a batch (`items[]`) of versioned explicit user consents in Cloudflare D1 (`coaching_account_consents`).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/account/consents`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/account/consents`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/account/consents`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/account/consents`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `consentType` | `string` | No | max 60 chars (single mode) | Consent category (e.g. `health_data_processing`). |
| `version` | `string` | No | max 30 chars (single mode) | Policy/terms version string. |
| `accepted` | `boolean` | No | boolean (single mode) | Whether accepted or withdrawn. |
| `items` | `Array<object>` | No | 1..10 items `{ consentType, version, accepted }` | Atomic batch consent payload alternative to single fields. |

### Request Body Example
```json
{
  "consentType": "health_data_processing",
  "version": "1.0.0",
  "accepted": true
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `consentType` | `string` | Recorded consent type. |
| `version` | `string` | Version. |
| `accepted` | `boolean` | Acceptance boolean. |
| `at` | `string (ISO-8601 UTC)` | Recorded timestamp. |

#### Example Response — 200 OK — Consent Recorded
```json
{
  "ok": true,
  "data": {
    "consentType": "health_data_processing",
    "version": "1.0.0",
    "accepted": true,
    "at": "2026-11-21T12:30:00.000Z"
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Backfill Normalized Tables

Backfills legacy aggregate logs into normalized Cloudflare D1 tables atomically.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/account/backfill`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/account/backfill`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/account/backfill`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/account/backfill`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `(empty body)` | `object` | No | `{}` | Send an empty JSON object `{}`; user is derived from Bearer token. |

### Request Body Example
```json
{}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `migrated` | `boolean` | `true` when migrated. |
| `counts` | `object` | Counts of migrated foodEntries, waterLogs, weights, workoutLogs, sessions, checkins. |

#### Example Response — 200 OK — Backfilled
```json
{
  "ok": true,
  "data": {
    "migrated": true,
    "counts": {
      "foodEntries": 12,
      "waterLogs": 7,
      "weights": 7,
      "workoutLogs": 9,
      "sessions": 3,
      "checkins": 7
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Export Full Account Data (GDPR)

Exports complete machine-readable JSON of profile, preferences, active & archived nutrition/workout plans, all logs, audit trail, and consents.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/account/export`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/account/export`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/account/export`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/account/export`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `schemaVersion` | `integer` | Export schema version (`3`). |
| `exportedAt` | `string (ISO-8601 UTC)` | Export timestamp. |
| `userId` | `string` | Account owner ID. |
| `profile` | `object | null` | User profile. |
| `logs` | `object` | All food, water, weight, workout, session, checkin, adaptation, coaching logs. |
| `archivedNutritionPlans` | `Array<object>` | All archived nutrition plans. |
| `archivedWorkoutPlans` | `Array<object>` | All archived workout plans. |
| `consents` | `Array<object>` | Recorded consents. |

---

### Delete Account Permanently (GDPR — Destructive)

**IRREVERSIBLE:** Permanently erases all account data, auth credentials (`coaching_users`), and refresh tokens (`coaching_refresh_tokens`) in one atomic D1 batch, and writes revocation tombstones.

### Endpoint Info
- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/v1/account/delete`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/account/delete`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/account/delete`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/account/delete`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `confirm` | `boolean` | Yes | Must be `true` | Explicit irreversible deletion confirmation. |

### Request Body Example
```json
{
  "confirm": true
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `deleted` | `boolean` | `true`. |
| `userId` | `string` | Deleted account ID. |
| `deletedAt` | `string (ISO-8601 UTC)` | Erasure timestamp. |
| `tablesCleared` | `integer` | Number of D1 tables cleared. |
| `namespacesCleared` | `integer` | Number of namespaces cleared (primary + claimed). |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `DELETE_CONFIRMATION_REQUIRED` | Missing `confirm: true`. |

#### Example Response — 200 OK — Permanently Deleted
```json
{
  "ok": true,
  "data": {
    "deleted": true,
    "userId": "user:1a2b",
    "deletedAt": "2026-11-21T12:40:00.000Z",
    "tablesCleared": 28,
    "namespacesCleared": 1,
    "appleTokenRevoked": false,
    "mediaObjectsDeleted": 0
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Privacy / Health Consents

Lists all persisted legal and medical disclaimer consents for the signed-in account.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/account/consents`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/account/consents`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/account/consents`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/account/consents`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Submit In-App Support Feedback

Creates a persisted support ticket or catalog correction report in D1.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/support/feedback`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/support/feedback`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/support/feedback`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/support/feedback`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `category` | `string (enum)` | Yes | `bug` | `feature` | `food_catalog_correction` | `exercise_catalog_correction` | `billing` | `other` | Feedback category. |
| `message` | `string` | Yes | 3..2000 chars | User message describing the report. |
| `includeDiagnostics` | `boolean` | No | default: false | Include non-PII diagnostic metadata. |
| `appVersion` | `string` | No | max 40 chars | Client app version. |
| `platform` | `string` | No | `android` | `ios` | `web` | Client platform. |

### Request Body Example
```json
{
  "category": "food_catalog_correction",
  "message": "Please verify protein per 100g on item #104.",
  "includeDiagnostics": true,
  "appVersion": "1.0.0",
  "platform": "android"
}
```

---

## 13. OAuth Linking, Plan Preview & Profile

Linked OAuth provider management (Google/Apple), stateless onboarding plan preview, profile updates, and Comeback Protocol.

### Preview Onboarding Plan (Public)

Stateless onboarding calculation returning daily kcal/macros, safe calorie floors, `restDayWaterTarget`, `workoutDayWaterTarget`, `estimatedExercisesPerSession`, eligibility, and weekly forecast range.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/plans/preview`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/plans/preview`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/plans/preview`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/plans/preview`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `name` | `string` | No | max 100 chars | Optional display name. |
| `age` | `integer` | Yes | 18..70 | Age in years. |
| `sex` | `string (enum)` | Yes | `male` | `female` | Biological sex. |
| `weight` | `number` | Yes | 35..250 (kg) | Current body weight in kg. |
| `height` | `number` | Yes | 120..230 (cm) | Height in cm. |
| `goal` | `string (enum)` | Yes | `lose` | `maintain` | `gain` | `muscle_gain` | Primary coaching goal. |
| `targetWeight` | `number | null` | No | 35..250 (kg) | Optional target weight. |
| `activity` | `string (enum)` | No | `sedentary` | `light` | `moderate` | `active` | Daily activity level. |
| `dietType` | `string (enum)` | No | Supported diet enum | Dietary pattern. |
| `serviceTrack` | `string (enum)` | No | `nutrition_only` | `workouts_only` | `nutrition_and_workouts` | Coaching track. |
| `selectedWorkoutDays` | `Array<integer>` | No | 0..6 | Selected weekly workout days. |
| `healthConfirmed` | `boolean` | No | boolean | Health clearance confirmation. |

### Request Body Example
```json
{
  "name": "Preview User",
  "age": 30,
  "sex": "male",
  "weight": 82,
  "height": 178,
  "goal": "lose",
  "targetWeight": 75,
  "activity": "moderate",
  "dietType": "balanced",
  "serviceTrack": "nutrition_and_workouts",
  "selectedWorkoutDays": [
    1,
    3,
    5
  ],
  "healthConfirmed": true
}
```

---

### List Linked OAuth Providers

Returns linked Google and Apple OAuth identities for the authenticated user.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/auth/oauth/providers`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/oauth/providers`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/oauth/providers`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/oauth/providers`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Link OAuth Provider (Google or Apple)

Links an additional Google or Apple OIDC identity to the currently signed-in account.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/oauth/link`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/oauth/link`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/oauth/link`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/oauth/link`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `provider` | `string (enum)` | Yes | `google` | `apple` | OAuth provider to link. |
| `idToken` | `string (JWT)` | No | Required for `google` | Verified Google ID token. |
| `identityToken` | `string (JWT)` | No | Required for `apple` | Verified Apple identity token. |
| `authorizationCode` | `string` | No | Optional for `apple` | Apple authorization code for refresh-token exchange. |

### Request Body Example
```json
{
  "provider": "google",
  "idToken": "<google-oidc-id-token>"
}
```

---

### Unlink OAuth Provider

Unlinks Google or Apple from the signed-in account. Returns `409 CANNOT_UNLINK_LAST_AUTH_METHOD` if it is the last sign-in method.

### Endpoint Info
- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/v1/auth/oauth/{{oauthProvider}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/auth/oauth/{{oauthProvider}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/auth/oauth/{{oauthProvider}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/auth/oauth/{{oauthProvider}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Path Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `oauthProvider` | `string (enum)` | Yes | `google` | `apple`. |

---

### Update Profile Settings (profile_update)

Updates non-regenerative profile metadata such as display name, preferred measurement unit system, or workout UI mode.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "profile_update" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `profile_update`. |
| `payload.name` | `string` | No | max 100 chars | Updated display name. |
| `payload.unitSystem` | `string (enum)` | No | `metric` | `imperial` | Preferred measurement unit system. |
| `payload.workoutUiMode` | `string (enum)` | No | `simple` | `pro` | Workout logger UI mode. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "profile_update",
  "payload": {
    "name": "Updated Name",
    "unitSystem": "metric",
    "workoutUiMode": "pro"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — profile_update Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "profile_update",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "profile_update",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Activate Comeback Protocol (comeback_restart)

Activates a safe deload or 7-day volume ramp-in after a training gap, optionally updating current weight and renewing the meal plan.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "comeback_restart" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `comeback_restart`. |
| `payload.mode` | `string (enum)` | No | `24h_deload` | `7d_ramp` (optional when `applyDeload` is set) | Comeback protocol mode. |
| `payload.applyDeload` | `boolean` | No | boolean | Whether to apply a temporary deload/volume ramp. |
| `payload.deloadDurationDays` | `integer` | No | 1..14 | Optional deload duration in days. |
| `payload.updatedWeightKg` | `number` | No | 35..250 | Optional updated body weight in kg (alias `currentWeightKg`). |
| `payload.reason` | `string` | No | max 200 chars | Optional comeback reason (e.g. `travel`, `illness`, `busy`). |
| `payload.renewMealPlan` | `boolean` | No | default: false | When `true`, refreshes the nutrition plan starting today. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "comeback_restart",
  "payload": {
    "mode": "7d_ramp",
    "applyDeload": true,
    "deloadDurationDays": 7,
    "updatedWeightKg": 81.2
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — comeback_restart Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "comeback_restart",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "comeback_restart",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

## 14. Nutrition Tools — Pantry, Grocery, Favorites, Barcode & Fasting

Pantry catalog & meal matching, plan grocery lists, favorites, copy meal, EAN barcode lookup/submit, and intermittent fasting / Ramadan timer.

### Get Pantry Ingredient Catalog

Returns all pantry ingredient keys grouped by category with English & Arabic labels.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/pantry/catalog`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/pantry/catalog`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/pantry/catalog`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/pantry/catalog`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Find Pantry Meal Alternatives

Matches user pantry ingredients against safe meal templates (Free feature).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/pantry/alternatives`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/pantry/alternatives`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/pantry/alternatives`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/pantry/alternatives`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `selectedIngredients` | `Array<string>` | Yes | 1..40 pantry keys | Selected pantry ingredient keys. |
| `slot` | `string (enum)` | No | `breakfast` | `lunch` | `dinner` | `snack` | Optional meal slot filter. |
| `limit` | `integer` | No | 1..30 (default 15) | Maximum matched meals returned. |

### Request Body Example
```json
{
  "selectedIngredients": [
    "eggs",
    "fava",
    "olive",
    "tomato"
  ],
  "limit": 15
}
```

---

### Get Plan Grocery List

Aggregated shopping list (`days=all|remaining|3|7`) with checked item state (Pro feature; append `?preview=true` for Free 2-item teaser).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/plans/{{activePlanId}}/grocery-list?days=all`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/plans/{{activePlanId}}/grocery-list?days=all`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/plans/{{activePlanId}}/grocery-list?days=all`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/plans/{{activePlanId}}/grocery-list?days=all`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `days` | `string (enum)` | No | `all` | `remaining` | `3` | `7` | Day window filter. |
| `preview` | `boolean` | No | default: false (`true` = Free teaser) | Returns 2 sample items + lock count for Free tier. |

---

### Toggle Grocery Item (grocery_toggle)

Persists checked/unchecked state for a grocery list item.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "grocery_toggle" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `grocery_toggle`. |
| `payload.planId` | `string` | Yes | Active plan ID | Nutrition plan identifier. |
| `payload.ingredientKey` | `string` | Yes | Non-empty string | Grocery ingredient key. |
| `payload.checked` | `boolean` | Yes | boolean | Checked state. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "grocery_toggle",
  "payload": {
    "planId": "{{activePlanId}}",
    "ingredientKey": "egg",
    "checked": true
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — grocery_toggle Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "grocery_toggle",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "grocery_toggle",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Recent Logged Foods

Returns recently logged unique foods ranked by frequency and recency for zero-query rapid logging.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/foods/recent?days=30&limit=25`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/foods/recent?days=30&limit=25`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/foods/recent?days=30&limit=25`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/foods/recent?days=30&limit=25`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `days` | `integer` | No | 1..90 (default 30) | Lookback window in days. |
| `limit` | `integer` | No | 1..50 (default 25) | Max unique items returned. |

---

### List Food Favorites

Returns pinned/favorite foods for quick logging.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/foods/favorites?offset=0&limit=40`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/foods/favorites?offset=0&limit=40`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/foods/favorites?offset=0&limit=40`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/foods/favorites?offset=0&limit=40`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Toggle Food Favorite (food_favorite)

Pins or unpins a food item (`planned`, `ingredient`, `recipe`, `barcode`, or `manual`) as a user favorite.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "food_favorite" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `food_favorite`. |
| `payload.op` | `string (enum)` | Yes | `add` | `remove` | Favorite operation. |
| `payload.item` | `object` | Yes | Food item descriptor | Food item to pin or remove. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "food_favorite",
  "payload": {
    "op": "add",
    "item": {
      "name": "Boiled Eggs",
      "source": "ingredient",
      "key": "egg",
      "grams": 120
    }
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — food_favorite Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "food_favorite",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "food_favorite",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Copy Meals from Previous Day (copy_meal)

Copies logged food entries (all, by slot, or specific `entryIds[]`) into `toDate` and optional target `toSlot`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "copy_meal" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `copy_meal`. |
| `payload.fromDate` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Source log date. |
| `payload.toDate` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Destination log date. |
| `payload.slot` | `string (enum)` | No | `breakfast` | `lunch` | `dinner` | `snack` | Optional source meal slot filter. |
| `payload.toSlot` | `string (enum)` | No | `breakfast` | `lunch` | `dinner` | `snack` | Optional destination slot override. |
| `payload.entryIds` | `Array<string>` | No | 1..30 entry IDs | Specific entry IDs from `fromDate` to copy. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "copy_meal",
  "payload": {
    "fromDate": "{{todayDate}}",
    "toDate": "{{todayDate}}",
    "slot": "breakfast"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — copy_meal Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "copy_meal",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "copy_meal",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Lookup Packaged Food by Barcode

Looks up a packaged food product by EAN/UPC barcode (D1 cache + OpenFoodFacts fallback; Pro feature when enforcement is enabled).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/foods/barcode/{{sampleBarcode}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/foods/barcode/{{sampleBarcode}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/foods/barcode/{{sampleBarcode}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/foods/barcode/{{sampleBarcode}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Submit User Barcode Food

Contributes a packaged food barcode item to D1 (Pro feature when enforcement is enabled).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/foods/barcode`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/foods/barcode`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/foods/barcode`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/foods/barcode`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `barcode` | `string` | Yes | 8..14 numeric digits | EAN/UPC barcode string. |
| `nameEn` | `string` | Yes | 2..120 chars | English product name. |
| `brand` | `string` | No | max 80 chars | Brand name. |
| `servingSizeGrams` | `number` | No | 1..2000 | Default serving size in grams. |
| `servingLabel` | `string` | No | max 40 chars | Optional human-friendly serving label (e.g. `1 cup`, `1 bar`). |
| `valuesPer100g` | `object` | Yes | `{ energy, protein, carbs, fat, saturated?, fiber?, sodium?, sugars? }` | Nutrition facts per 100g. |

### Request Body Example
```json
{
  "barcode": "6221000000001",
  "nameEn": "Greek Yogurt Plain",
  "brand": "Local Dairy",
  "servingSizeGrams": 170,
  "valuesPer100g": {
    "energy": 97,
    "protein": 9,
    "carbs": 3.6,
    "fat": 5
  }
}
```

---

### Get Fasting / Ramadan Timer State

Returns active intermittent fasting or Ramadan window progress (Free feature).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/nutrition/fasting-state`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/nutrition/fasting-state`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/nutrition/fasting-state`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/nutrition/fasting-state`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Start / End Fasting Log (fasting_log)

Starts or completes a fasting session log.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "fasting_log" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `fasting_log`. |
| `payload.op` | `string (enum)` | Yes | `start` | `end` | Fasting session action. |
| `payload.protocol` | `string` | No | `16_8` | `14_10` | `18_6` | `ramadan` | Fasting protocol identifier. |
| `payload.targetHours` | `number` | No | 8..24 | Target fast duration in hours. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "fasting_log",
  "payload": {
    "op": "start",
    "protocol": "16_8",
    "targetHours": 16
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — fasting_log Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "fasting_log",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "fasting_log",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Toggle Ramadan Mode (ramadan_mode)

Enables or disables Ramadan Iftar/Suhoor meal slot remapping with automatic post-Ramadan reversion (Free feature; works for both nutrition and workouts-only users).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "ramadan_mode" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `ramadan_mode`. |
| `payload.enabled` | `boolean` | Yes | boolean | Whether Ramadan mode is enabled. |
| `payload.iftarTime` | `string (HH:mm)` | No | `00:00`..`23:59` | Local Iftar start time. |
| `payload.suhoorCutoffTime` | `string (HH:mm)` | No | `00:00`..`23:59` | Local Suhoor cutoff time. |
| `payload.endDate` | `string (YYYY-MM-DD)` | No | Optional Eid/Ramadan end date | Optional auto-expiration date for Ramadan mode. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "ramadan_mode",
  "payload": {
    "enabled": true,
    "iftarTime": "18:15",
    "suhoorCutoffTime": "04:00"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — ramadan_mode Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "ramadan_mode",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "ramadan_mode",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Toggle Seasonal / Eid Flex Mode (seasonal_flex)

Activates temporary maintenance calories (`tdee`) and automatic `flexDates` streak protection for Eid, travel, or seasonal breaks (1..7 days, Free feature).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "seasonal_flex" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `seasonal_flex`. |
| `payload.enabled` | `boolean` | Yes | boolean | Enable or disable Seasonal Flex Mode. |
| `payload.occasion` | `string (enum)` | No | `eid_fitr` | `eid_adha` | `travel` | `custom` | Seasonal occasion tag. |
| `payload.endDate` | `string (YYYY-MM-DD)` | No | `today`..`today+7d` (default `+2d`) | Last inclusive date for maintenance/flex protection. |
| `payload.dismissEidPrompt` | `boolean` | No | Optional when `enabled: false` | Dismisses the post-Ramadan Eid prompt cleanly. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "seasonal_flex",
  "payload": {
    "enabled": true,
    "occasion": "eid_fitr"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — seasonal_flex Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "seasonal_flex",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "seasonal_flex",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Saved Custom Recipes

Lists the user's saved multi-ingredient home recipes ("My Recipes") with optional text search `q` (Free feature).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/recipes?offset=0&limit=20`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/recipes?offset=0&limit=20`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/recipes?offset=0&limit=20`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/recipes?offset=0&limit=20`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Save Custom Home Recipe (recipe_save)

Creates or updates a saved multi-ingredient home recipe (max 100 recipes) with cooked yield (`finalWeightGrams`), custom additions, `ml` liquid conversions, and quality tier (Free feature).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "recipe_save" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `recipe_save`. |
| `payload.id` | `string` | No | Optional UUID for update | Existing recipe ID to update in place. |
| `payload.name` | `string` | Yes | 2..80 chars | Recipe display name. |
| `payload.servings` | `number` | Yes | 0.5..30 | Total servings produced by the recipe batch. |
| `payload.finalWeightGrams` | `number` | No | 20..15000 (cooked batch yield) | Optional final cooked batch weight for accurate yield ratio. |
| `payload.items` | `Array<object>` | Yes | 1..25 items `{ foodId, grams? , ml? }` | Catalog ingredient IDs with grams or ml (auto-converted by density). |
| `payload.additions` | `Array<object>` | No | 0..10 items `{ name, energy, protein?, carbs?, fat?, grams? }` | Optional non-catalog additions (spices, sauces, oils). |
| `payload.notes` | `string` | No | max 300 chars | Optional preparation notes. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "recipe_save",
  "payload": {
    "name": "Home Grilled Chicken Rice Bowl",
    "servings": 2,
    "items": [
      {
        "foodId": "chicken",
        "grams": 300
      },
      {
        "foodId": "rice",
        "grams": 200
      }
    ]
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — recipe_save Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "recipe_save",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "recipe_save",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Delete Custom Home Recipe (recipe_delete)

Deletes a saved custom recipe while preserving frozen historical food diary snapshots intact.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "recipe_delete" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `recipe_delete`. |
| `payload.id` | `string` | Yes | Saved recipe ID | ID of the saved recipe to delete. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "recipe_delete",
  "payload": {
    "id": "recipe-id-placeholder"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — recipe_delete Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "recipe_delete",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "recipe_delete",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

## 15. Workouts Insights, Cardio, Cycle Awareness, Analytics & Widgets

Workout UI modes, ad-hoc exercises, dedicated cardio sessions, optional female cycle awareness, PR engine, multi-series progress analytics, weekly wrapped, body measurements, streak freeze, and home-screen widget snapshots.

### Set Workout UI Mode (workout_ui_mode)

Switches between simple (bodyweight/rep-focused) and pro (load + RIR) workout logging.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "workout_ui_mode" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `workout_ui_mode`. |
| `payload.mode` | `string (enum)` | Yes | `simple` | `pro` | Target workout logging UI mode. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "workout_ui_mode",
  "payload": {
    "mode": "pro"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — workout_ui_mode Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "workout_ui_mode",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "workout_ui_mode",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Add Ad-Hoc Exercise (ad_hoc_exercise)

Adds a bonus exercise to a specific workout date without mutating baseline progression. Returns `409 AD_HOC_INJURY_WARNING` if unsafe for declared injuries unless `overrideInjuryWarning: true`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "ad_hoc_exercise" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `ad_hoc_exercise`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Workout session date. |
| `payload.exerciseId` | `string` | Yes | Catalog exercise ID | Exercise ID from `/v1/exercises`. |
| `payload.sets` | `Array<object>` | Yes | 1..15 set objects `{ reps, kg, rir?, isWarmup? }` | Logged ad-hoc sets. |
| `payload.overrideInjuryWarning` | `boolean` | No | default: false | Explicit confirmation to log despite an injury caution. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "ad_hoc_exercise",
  "payload": {
    "date": "{{todayDate}}",
    "exerciseId": "{{sampleCatalogExerciseId}}",
    "sets": [
      {
        "reps": 12,
        "kg": 10
      }
    ]
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — ad_hoc_exercise Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "ad_hoc_exercise",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "ad_hoc_exercise",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### List Dedicated Cardio Logs

Lists dedicated walking/running/cycling/swimming/HIIT cardio sessions with summary totals (Free feature).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/cardio-logs?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/cardio-logs?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/cardio-logs?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/cardio-logs?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Log Cardio Session (cardio_log)

Logs a dedicated cardio or walking session with deterministic MET calorie estimation, rest-day hydration boost (>=30m), streak credit (>=20m), and non-blocking high-impact safety cautions (Free feature).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "cardio_log" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `cardio_log`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Cardio session date. |
| `payload.modality` | `string (enum)` | Yes | `walking` | `brisk_walking` | `running` | `cycling` | `stationary_bike` | `swimming` | `elliptical` | `rowing` | `jump_rope` | `hiit` | Cardio modality. |
| `payload.durationMinutes` | `integer` | Yes | 5..360 | Session duration in minutes. |
| `payload.intensity` | `string (enum)` | Yes | `low` | `moderate` | `vigorous` | Perceived cardio intensity. |
| `payload.distanceKm` | `number` | No | 0..300 | Optional distance in kilometers. |
| `payload.caloriesKcal` | `number` | No | 10..5000 | Optional wearable/manual energy expenditure (MET-estimated if omitted). |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "cardio_log",
  "payload": {
    "date": "{{todayDate}}",
    "modality": "brisk_walking",
    "durationMinutes": 35,
    "intensity": "moderate",
    "distanceKm": 3.2
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — cardio_log Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "cardio_log",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "cardio_log",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Delete Cardio Session (cardio_delete)

Deletes a logged cardio session by ID.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "cardio_delete" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `cardio_delete`. |
| `payload.id` | `string` | Yes | Cardio log ID | ID of the cardio session to delete. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "cardio_delete",
  "payload": {
    "id": "cardio-log-id-placeholder"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — cardio_delete Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "cardio_delete",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "cardio_delete",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Get Female Cycle Awareness State

Returns optional female menstrual cycle awareness state (`phase`, `coachingHintCode`, `discreetMode`, `adaptiveThemeEnabled`, `phaseAccentToken`, `suggestedGentleSession`, `isOverdue`/`overdueDays`, luteal water-retention flag, and pregnancy auto-pause; Free opt-in feature).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/cycle/state`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/cycle/state`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/cycle/state`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/cycle/state`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Update Cycle Awareness Settings (cycle_settings)

Enables/disables optional female cycle awareness, discreet mode, adaptive phase accent, and cycle lengths (female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "cycle_settings" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `cycle_settings`. |
| `payload.enabled` | `boolean` | Yes | boolean | Opt-in toggle for cycle awareness. |
| `payload.discreetMode` | `boolean` | No | default: false | Masks sensitive cycle labels and disables tinted cycle accent. |
| `payload.adaptiveThemeEnabled` | `boolean` | No | default: true | Allows subtle cycle-phase accent tokens when Discreet Mode is off. |
| `payload.averageCycleLengthDays` | `integer` | No | 21..45 (default 28) | Average menstrual cycle length in days. |
| `payload.averagePeriodLengthDays` | `integer` | No | 2..10 (default 5) | Average period duration in days. |
| `payload.lastPeriodStartDate` | `string (YYYY-MM-DD)` | No | Within last 180 days or null | Start date of last menstrual period. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "cycle_settings",
  "payload": {
    "enabled": true,
    "averageCycleLengthDays": 28,
    "averagePeriodLengthDays": 5,
    "lastPeriodStartDate": "{{todayDate}}"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — cycle_settings Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "cycle_settings",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "cycle_settings",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Log Daily Cycle Entry (cycle_log)

Logs period start, flow level, cramp severity, and wellness symptoms for a calendar date (female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "cycle_log" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `cycle_log`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Calendar date for the cycle log. |
| `payload.periodStart` | `boolean` | No | default: false | Marks day 1 of a new cycle and advances lastPeriodStartDate. |
| `payload.flowLevel` | `string (enum)` | No | `none` | `spotting` | `light` | `medium` | `heavy` | Daily menstrual flow level. |
| `payload.crampSeverity` | `integer` | No | 0..5 | Self-reported cramp intensity. |
| `payload.symptoms` | `Array<string>` | No | Supported wellness symptom keys | Optional symptom tags (e.g. `cramps`, `bloating`, `fatigue`). |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "cycle_log",
  "payload": {
    "date": "{{todayDate}}",
    "periodStart": true,
    "flowLevel": "medium",
    "crampSeverity": 2,
    "symptoms": [
      "cramps",
      "fatigue"
    ]
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — cycle_log Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "cycle_log",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "cycle_log",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Toggle Cycle Comfort Session (cycle_gentle_session)

One-tap female cycle comfort adjustment scaling working workout sets by 0.8x for 24 hours without mutating base plan progression (female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "cycle_gentle_session" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `cycle_gentle_session`. |
| `payload.enabled` | `boolean` | Yes | boolean | Activate or clear the 24h gentle comfort adjustment. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "cycle_gentle_session",
  "payload": {
    "enabled": true
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — cycle_gentle_session Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "cycle_gentle_session",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "cycle_gentle_session",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Get Workout Personal Records (PRs)

Returns best weight, reps, estimated 1RM, and session volume per exercise (with assisted-exercise load inversion).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/workouts/prs`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/workouts/prs`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/workouts/prs`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/workouts/prs`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Get Progress Analytics

Returns weight moving average trend, calorie adherence, training volume, and exercise e1RM series (`14d`/`30d` Free; `90d`/`all` Pro).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/progress/analytics?range=30d`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/progress/analytics?range=30d`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/progress/analytics?range=30d`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/progress/analytics?range=30d`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Get Weekly Wrapped Recap

Returns shareable privacy-safe weekly recap metrics including cardio session count and minutes.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/progress/weekly-wrapped`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/progress/weekly-wrapped`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/progress/weekly-wrapped`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/progress/weekly-wrapped`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Get Home Widget Snapshot

Ultra-lightweight (< 1.5 KB) snapshot for Android Glance & iOS WidgetKit with ETag support (never exposes sensitive cycle data).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/widgets/snapshot`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/widgets/snapshot`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/widgets/snapshot`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/widgets/snapshot`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### List Body Measurements

Paginated waist, chest, hips, arms, thighs, and neck measurements.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/measurements?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/measurements?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/measurements?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/measurements?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Log Body Measurement (body_measurement)

Logs or merges daily body circumference measurements for a date.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "body_measurement" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `body_measurement`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Measurement date. |
| `payload.waistCm` | `number` | No | 40..220 | Waist circumference in cm. |
| `payload.chestCm` | `number` | No | 50..200 | Chest circumference in cm. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "body_measurement",
  "payload": {
    "date": "{{todayDate}}",
    "waistCm": 84.5,
    "chestCm": 101
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — body_measurement Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "body_measurement",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "body_measurement",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Use Streak Freeze (streak_freeze)

Consumes one manual streak freeze token (max 1 per 7 days) alongside automatic Weekly Auto-Freeze protection (`autoAppliedFreezes`) for missed logging days.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Idempotency-Key` | `string` | Yes | Unique UUID per logical action (max 100 chars). Auto-generated by pre-request script. |
| `X-Client-Platform` | `string` | No | Client platform: android | ios | web. |
| `X-Client-Version` | `string` | No | Client app semantic version (e.g. 1.0.0). |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `view` | `string (enum)` | No | receipt | minimal | delta | full | Response verbosity; receipt returns compact <2KB delta. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "streak_freeze" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `streak_freeze`. |
| `payload.date` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Date to protect with a streak freeze token. |

### Request Body Example
```json
{
  "revision": {{revision}},
  "action": "streak_freeze",
  "payload": {
    "date": "{{todayDate}}"
  }
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when committed or idempotently replayed. |
| `revision` | `integer` | New monotonic account revision. |
| `serverNow` | `string (ISO-8601 UTC)` | Current server timestamp. |
| `serverDate` | `string (YYYY-MM-DD)` | User-local calendar date. |
| `commandReceipt` | `object` | `{ revision, action, replayed, at }` receipt metadata. |
| `affected` | `Array<object>` | Entity deltas `{ entityType, entityId, op, payload }`. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Invalid payload values, business rule violation, or missing Idempotency-Key. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or revoked Bearer JWT. |
| `409` | `REVISION_CONFLICT` | Client revision is stale; rebase via `/v1/sync/changes` or `/v1/state`. |
| `409` | `IDEMPOTENCY_KEY_REUSED_MISMATCH` | Same Idempotency-Key sent with different JSON body. |

#### Example Response — 200 OK — streak_freeze Receipt
```json
{
  "ok": true,
  "data": {
    "revision": 2,
    "serverNow": "2026-11-21T12:30:00.000Z",
    "serverDate": "2026-11-21",
    "timezone": "Africa/Cairo",
    "commandReceipt": {
      "revision": 2,
      "action": "streak_freeze",
      "replayed": false,
      "at": "2026-11-21T12:30:00.000Z"
    },
    "affected": [
      {
        "entityType": "streak_freeze",
        "entityId": "example-id",
        "op": "upsert",
        "payload": {}
      }
    ]
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z",
    "revision": 2
  }
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 4,
      "serverRevision": 5
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": {
        "expectedRevision": 4,
        "serverRevision": 5,
        "syncChangesEndpoint": "/v1/sync/changes?after=4",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "req-uuid",
    "serverTime": "2026-11-21T12:30:00.000Z"
  }
}
```

---

## 16. Media (R2), Push, Billing & Deferred AI Phase

Worker-proxied HMAC-signed R2 avatars & progress photos, FCM/APNs push tokens, StoreKit/Play Billing verification & webhooks, and deferred AI phase 501 placeholders.

### Upload Profile Avatar (Multipart / Binary)

Uploads a profile avatar directly via `multipart/form-data` (`image`/`file`) or raw binary (`image/jpeg`, `image/png`, `image/webp`, max 512 KB) into private Cloudflare R2 with old-avatar cleanup and returns a short-lived signed GET URL.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/profile/avatar`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/profile/avatar`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/profile/avatar`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/profile/avatar`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `image` | `file (binary)` | Yes | JPEG/PNG/WebP, max 512 KB (multipart/form-data or raw image body) | Avatar binary file. |

### Request Body Example
```json
{}
```

---

### Delete Profile Avatar

Deletes the signed-in user avatar from Cloudflare R2.

### Endpoint Info
- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/v1/profile/avatar`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/profile/avatar`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/profile/avatar`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/profile/avatar`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### List Progress Photos

Lists progress photos with short-lived Worker-signed GET URLs (always free to read/delete).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/progress/photos?offset=0&limit=30`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/progress/photos?offset=0&limit=30`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/progress/photos?offset=0&limit=30`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/progress/photos?offset=0&limit=30`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Create Progress Photo Upload URL

Issues a short-lived HMAC-signed PUT URL for private R2 upload.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/progress/photos/upload-url`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/progress/photos/upload-url`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/progress/photos/upload-url`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/progress/photos/upload-url`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `contentType` | `string (enum)` | Yes | `image/jpeg` | `image/png` | `image/webp` | Photo MIME type. |
| `byteSize` | `integer` | Yes | 1..5242880 | Declared file size in bytes (max 5 MB). |
| `pose` | `string (enum)` | Yes | `front` | `side` | `back` | Progress photo pose. |
| `date` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Photo date. |
| `weightKgSnapshot` | `number` | No | 35..250 | Optional weight snapshot. |

### Request Body Example
```json
{
  "contentType": "image/jpeg",
  "byteSize": 250000,
  "pose": "front",
  "date": "{{todayDate}}",
  "weightKgSnapshot": 79.5
}
```

---

### Confirm Progress Photo Upload

Confirms uploaded R2 object and persists metadata in D1.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/progress/photos/confirm`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/progress/photos/confirm`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/progress/photos/confirm`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/progress/photos/confirm`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `photoId` | `string` | Yes | UUID from upload-url | Photo ID issued by upload-url. |
| `objectKey` | `string` | Yes | User-scoped R2 key | R2 object key issued by upload-url. |
| `pose` | `string (enum)` | Yes | `front` | `side` | `back` | Progress photo pose. |
| `date` | `string (YYYY-MM-DD)` | Yes | Valid ISO date | Photo date. |

### Request Body Example
```json
{
  "photoId": "photo-id",
  "objectKey": "users/user-id/photos/photo-id.jpg",
  "pose": "front",
  "date": "{{todayDate}}"
}
```

---

### Delete Progress Photo

Deletes a progress photo from Cloudflare R2 and D1 (always permitted even after Pro downgrade).

### Endpoint Info
- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/v1/progress/photos/{{samplePhotoId}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/progress/photos/{{samplePhotoId}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/progress/photos/{{samplePhotoId}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/progress/photos/{{samplePhotoId}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Upload Binary to Signed Media URL

Worker-proxied HMAC-signed binary upload into private Cloudflare R2 with magic-byte verification.

### Endpoint Info
- **Method:** `PUT`
- **URL:** `{{baseUrl}}/v1/media/signed/{{signedMediaToken}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/media/signed/{{signedMediaToken}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/media/signed/{{signedMediaToken}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/media/signed/{{signedMediaToken}}`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must match the MIME type embedded in the signed token |
| `Accept` | `string` | Yes | JSON response format |

---

### Download Private Media via Signed URL

Streams a private avatar or progress photo from Cloudflare R2 after verifying the short-lived HMAC signature.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/media/signed/{{signedMediaToken}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/media/signed/{{signedMediaToken}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/media/signed/{{signedMediaToken}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/media/signed/{{signedMediaToken}}`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Register Push Token

Registers or refreshes an FCM/APNs push token for Cron reminder delivery.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/devices/push-token`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/devices/push-token`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/devices/push-token`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/devices/push-token`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `deviceId` | `string` | Yes | max 120 chars | Client device ID. |
| `platform` | `string (enum)` | Yes | `android` | `ios` | Mobile push platform. |
| `token` | `string` | Yes | 10..4096 chars | FCM or APNs registration token. |
| `locale` | `string` | No | e.g. `en`, `ar-EG` | Preferred push notification locale. |

### Request Body Example
```json
{
  "deviceId": "{{deviceId}}",
  "platform": "android",
  "token": "fcm-device-token-sample",
  "locale": "en"
}
```

---

### Unregister Push Token

Removes a device push token.

### Endpoint Info
- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/v1/devices/push-token?deviceId={{deviceId}}`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/devices/push-token?deviceId={{deviceId}}`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/devices/push-token?deviceId={{deviceId}}`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/devices/push-token?deviceId={{deviceId}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Get Subscription Offerings

Returns StoreKit/Play Billing product offerings and trial eligibility.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/subscriptions/offerings?platform=android&region=egypt`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/subscriptions/offerings?platform=android&region=egypt`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/subscriptions/offerings?platform=android&region=egypt`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/subscriptions/offerings?platform=android&region=egypt`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

### Verify Store Subscription

Verifies an Apple StoreKit 2 or Google Play purchase and activates Pro entitlements (fails closed with `503 BILLING_VERIFICATION_UNAVAILABLE` if store upstream fails).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/subscriptions/verify`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/subscriptions/verify`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/subscriptions/verify`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/subscriptions/verify`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `platform` | `string (enum)` | Yes | `android` | `ios` | Store platform. |
| `provider` | `string (enum)` | No | `apple` | `google` | Optional explicit billing provider. |
| `productId` | `string` | No | Configured SKU ID | Store subscription product ID. |
| `purchaseToken` | `string` | No | Required for `android` | Google Play purchase token. |
| `orderId` | `string` | No | Optional for `android` | Google Play order ID. |
| `signedTransactionInfo` | `string` | No | For `ios` StoreKit 2 | Apple StoreKit 2 JWS transaction. |
| `signedTransactionJws` | `string` | No | Alias for `signedTransactionInfo` | Apple StoreKit 2 JWS transaction alias. |
| `transactionId` | `string` | No | Optional for `ios` | Apple transaction identifier. |
| `originalTransactionId` | `string` | No | Optional for `ios` | Apple original transaction identifier. |
| `isTrial` | `boolean` | No | boolean | Marks introductory trial transaction. |

### Request Body Example
```json
{
  "platform": "android",
  "productId": "curafit_pro.monthly",
  "purchaseToken": "test-purchase-token"
}
```

---

### Restore Store Subscriptions

Reconciles prior store purchases (`string` tokens or receipt objects) and restores active entitlements.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/subscriptions/restore`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/subscriptions/restore`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/subscriptions/restore`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/subscriptions/restore`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `platform` | `string (enum)` | Yes | `android` | `ios` | Store platform. |
| `provider` | `string (enum)` | No | `apple` | `google` | Optional explicit billing provider. |
| `tokens` | `Array<string | object>` | No | Optional purchase tokens or `{ purchaseToken, transactionId, signedTransactionJws }` objects | Active store purchase tokens/receipts to reconcile. |

### Request Body Example
```json
{
  "platform": "android",
  "tokens": []
}
```

---

### Apple Store Server Webhook (Public)

Receives Apple App Store Server Notifications events.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/webhooks/apple`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/webhooks/apple`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/webhooks/apple`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/webhooks/apple`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `notificationType` | `string` | No | e.g. `DID_RENEW`, `EXPIRED` | App Store Server Notification type (or inside `signedPayload` JWS). |
| `data` | `object` | No | `{ originalTransactionId, expiresDate? }` | Decoded notification payload. |

### Request Body Example
```json
{
  "notificationType": "DID_RENEW",
  "data": {
    "originalTransactionId": "tx-123"
  }
}
```

---

### Google Play RTDN Webhook (Public)

Receives Google Play Real-Time Developer Notifications.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/webhooks/google-play`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/webhooks/google-play`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/webhooks/google-play`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/webhooks/google-play`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `subscriptionNotification` | `object` | No | `{ notificationType, purchaseToken }` | Direct RTDN payload (or base64 inside Pub/Sub `message.data`). |

### Request Body Example
```json
{
  "subscriptionNotification": {
    "notificationType": 2,
    "purchaseToken": "token-123"
  }
}
```

---

### AI Meal Parse (Deferred — 501)

Reserved for Final AI Phase; returns 501 FEATURE_DEFERRED_TO_AI_PHASE.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/nutrition/ai-parse`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/nutrition/ai-parse`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/nutrition/ai-parse`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/nutrition/ai-parse`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `text` | `string` | Yes | 1..500 chars | Natural language meal description. |

### Request Body Example
```json
{
  "text": "2 boiled eggs and brown toast"
}
```

---

### AI Coach Chat (Deferred — 501)

Reserved for Final AI Phase; returns 501 FEATURE_DEFERRED_TO_AI_PHASE.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/coaching/chat`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/coaching/chat`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/coaching/chat`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/coaching/chat`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `message` | `string` | Yes | 1..1000 chars | Coaching question text. |

### Request Body Example
```json
{
  "message": "How can I increase protein at breakfast?"
}
```

---

### AI Coach Chat History (Deferred — 501)

Reserved for Final AI Phase; returns 501 FEATURE_DEFERRED_TO_AI_PHASE.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/coaching/chat/history`
- **Cloud Dev URL:** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/coaching/chat/history`
- **Production URL:** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/coaching/chat/history`
- **Local Dev URL:** `http://127.0.0.1:8787/v1/coaching/chat/history`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

