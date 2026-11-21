# Egypt Nutrition Coach (CuraFit) — Cloudflare Workers API v1

Complete, production-ready REST API running natively on **Cloudflare Workers + Cloudflare D1** (`egypt-nutrition-coach`). Zero Supabase or external IdP dependency.

---

## 1. Servers & Environments

Switch between environments from the top-right **Environment selector** in Postman:

| Environment Name | `baseUrl` | Purpose |
| :--- | :--- | :--- |
| **Production Server (Cloudflare Workers)** | `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev` | Live Cloudflare Workers + Cloudflare D1 production server |
| **Dev Server (Local Miniflare / Dev)** | `http://127.0.0.1:8787` | Local development server (`npm run dev`) or custom dev/staging URL |

---

## 2. Authentication (Cloudflare Native D1)

- **Public endpoints (No Auth):** `GET /v1/health`, `GET /v1/capabilities`, `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`.
- **Authenticated endpoints:** Send `Authorization: Bearer {{accessToken}}` (inherited automatically at collection level).
- **Access Token:** HS256 JWT (TTL: `900s` / 15 minutes).
- **Refresh Token:** Opaque rotating token (`cfrt_...`, TTL: 30 days) stored SHA-256 hashed in D1. Replaying an already-rotated token revokes the entire session (`401 AUTH_REFRESH_TOKEN_REUSED`).
- **Web MVP Fallback:** Browser clients without Bearer token continue to use the `HttpOnly` `coach_uid` anonymous cookie and can migrate via `POST /v1/auth/claim-anonymous`.

---

## 3. Unified Command Pipeline (`POST /v1/commands`), Revision & Idempotency

All domain mutations pass through `POST /v1/commands`:
- **`Idempotency-Key` header (`string`, UUID, max 100 chars, required):** Auto-generated before every Postman request. Retry with the exact same key and body on network timeout.
- **`revision` (`integer >= 0`, required):** Must equal the server's current account revision. Mismatches return `409 REVISION_CONFLICT` with `currentRevision` and `mergeHints`.
- **Response Mode (`?view=receipt` vs `?view=full`):** `?view=receipt` (or `Prefer: return=minimal`) returns a compact `< 2 KB` delta receipt; `?view=full` returns the full account snapshot.
- **Simulation Mode (`?simulation=1`):** Isolates all reads/writes into the user's 90-day virtual simulation namespace without touching real account data.

---

## 4. Standard Error Envelope

All `4xx` / `5xx` errors return:

| Field | Type | Description |
| :--- | :--- | :--- |
| `error` | `string` | Human-readable Arabic error message |
| `code` | `string` | Stable machine-readable code (e.g. `VALIDATION_ERROR`, `UNAUTHENTICATED`, `REVISION_CONFLICT`, `RATE_LIMITED`) |
| `message` | `string` | Same as `error` |
| `fieldErrors` | `Array<{field, code, message}>` | Optional per-field validation errors |
| `requestId` | `string (UUID)` | Trace ID matching `X-Request-Id` header |
| `retryable` | `boolean` | Whether the client may safely retry (`true` for `429`/`503`/`500`) |
| `currentRevision` | `integer` (optional) | Returned on `409 REVISION_CONFLICT` |
| `mergeHints` | `object` (optional) | Sync recovery hints on `409` |

---

## 5. Collection & Environment Variables Reference

| Variable | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `baseUrl` | `string (URL)` | Environment | Server base URL (`Production` or `Dev`) |
| `testEmail` | `string (email)` | Environment | Email used in Register / Login |
| `testPassword` | `string (secret)` | Environment | Password (`8..128` chars) |
| `testNewPassword` | `string (secret)` | Environment | New password for Change Password |
| `deviceId` | `string` | Environment | Client device ID (`max 120` chars) |
| `clientPlatform` | `string (enum)` | Environment | `android` \| `ios` \| `web` |
| `clientVersion` | `string` | Environment | App semantic version (e.g. `1.0.0`) |
| `accessToken` | `string (JWT)` | Collection (auto) | Auto-saved by Register / Login / Refresh |
| `refreshToken` | `string` | Collection (auto) | Auto-saved & rotated by Register / Login / Refresh |
| `sessionId` | `string` | Collection (auto) | Current D1 session ID |
| `userId` | `string` | Collection (auto) | Authenticated user ID (`user:<uuid>`) |
| `revision` | `integer` | Collection (auto) | Current optimistic-concurrency revision (real account) |
| `simRevision` | `integer` | Collection (auto) | Current revision for `?simulation=1` namespace |
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

---

## 6. Complete Endpoint Reference (13 Groups / 81 Endpoints)

## 01. System & Health

Public liveness probe and runtime capability manifest. No authentication required.

### Health Check

Public health probe returning API version, engine version, and trace `requestId`.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/health`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/health`
- **Dev URL:** `http://127.0.0.1:8787/v1/health`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `ok` | `boolean` | `true` when Worker is healthy. |
| `apiVersion` | `string` | API major version (`"1"`). |
| `engineVersion` | `string` | Backend engine semver (e.g. `"0.13.0"`). |
| `requestId` | `string (UUID)` | Request trace ID. |

#### Example Response — 200 OK — Healthy
```json
{
  "ok": true,
  "apiVersion": "1",
  "engineVersion": "0.13.0",
  "requestId": "req-uuid"
}
```

---

### Capabilities Manifest

Returns API/schema/catalog versions, enabled feature flags, and native Cloudflare D1 authentication status.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/capabilities`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/capabilities`
- **Dev URL:** `http://127.0.0.1:8787/v1/capabilities`
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
  "apiVersion": "1",
  "schemaVersion": 3,
  "engineVersion": "0.13.0",
  "catalogVersion": "open-exercise-db-2026",
  "foodCatalogVersion": "0.6.0",
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
    "offline_sync_v2"
  ]
}
```

---

## 02. Authentication (Cloudflare Native D1)

First-party authentication on Cloudflare Workers + D1 using WebCrypto PBKDF2-SHA256 passwords, HS256 Access JWTs (15 min), and rotating D1 Refresh Tokens (30 days) with replay reuse detection.

### Register User

Registers a new user in Cloudflare D1 (`coaching_users`), creates a session, and issues an Access JWT + Refresh Token pair. Auto-saves tokens in Postman.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/register`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/auth/register`
- **Dev URL:** `http://127.0.0.1:8787/v1/auth/register`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `email` | `string (email)` | Yes | Trimmed, lowercased, max 160 chars, unique | User email address. |
| `password` | `string` | Yes | 8..128 chars | Plaintext password (hashed via PBKDF2-SHA256 100k iterations). |
| `name` | `string` | No | max 100 chars | Optional display name. |
| `deviceId` | `string` | No | max 120 chars | Optional client device identifier. |

### Request Body Example
```json
{
  "email": "{{testEmail}}",
  "password": "{{testPassword}}",
  "name": "أحمد محمد",
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
| `400` | `INVALID_EMAIL / INVALID_PASSWORD` | Malformed email or password shorter than 8 chars. |
| `409` | `AUTH_EMAIL_ALREADY_EXISTS` | Email is already registered. |
| `429` | `RATE_LIMITED` | Auth endpoint rate limit exceeded (30 req/min/IP). |

#### Example Response — 201 Created — Token Pair
```json
{
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
    "name": "أحمد محمد",
    "entitlement": "free",
    "createdAt": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Login User

Authenticates an existing user via email & password using constant-time PBKDF2 verification and returns a new Access JWT + Refresh Token.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/login`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/auth/login`
- **Dev URL:** `http://127.0.0.1:8787/v1/auth/login`
- **Auth:** Public (`No Auth`)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `email` | `string (email)` | Yes | max 160 chars | Registered email. |
| `password` | `string` | Yes | 1..128 chars | Account password. |
| `deviceId` | `string` | No | max 120 chars | Optional device ID. |

### Request Body Example
```json
{
  "email": "{{testEmail}}",
  "password": "{{testPassword}}",
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
| `401` | `AUTH_INVALID_CREDENTIALS` | Email not found or password mismatch. |
| `401` | `ACCOUNT_DELETED` | Account was permanently erased via GDPR deletion. |

#### Example Response — 200 OK — Token Pair
```json
{
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
    "name": "أحمد محمد",
    "entitlement": "free",
    "createdAt": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Refresh Access Token (Rotates Refresh Token)

Exchanges a valid `refreshToken` for a fresh Access JWT and a newly rotated `refreshToken`. Replaying an already-rotated token immediately revokes the entire session.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/refresh`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/auth/refresh`
- **Dev URL:** `http://127.0.0.1:8787/v1/auth/refresh`
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
    "name": "أحمد محمد",
    "entitlement": "free",
    "createdAt": "2026-11-21T12:30:00.000Z"
  }
}
```

---

### Inspect Current Session

Returns authenticated caller identity, session ID, auth method, scopes, entitlement tier, and JWT timestamps.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/auth/session`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/auth/session`
- **Dev URL:** `http://127.0.0.1:8787/v1/auth/session`
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
| `isAnonymous` | `boolean` | `false` for registered JWT users. |
| `scopes` | `Array<string>` | Granted scopes (`["coach:read","coach:write"]`). |
| `entitlement` | `string (enum)` | `free` | `premium`. |
| `issuedAt` | `string (ISO-8601) | null` | JWT `iat` timestamp. |
| `expiresAt` | `string (ISO-8601) | null` | JWT `exp` timestamp. |

#### Example Response — 200 OK — Session Info
```json
{
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
}
```

---

### Change Password

Verifies `currentPassword`, updates the PBKDF2-SHA256 hash in D1, and optionally revokes all other device sessions.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/change-password`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/auth/change-password`
- **Dev URL:** `http://127.0.0.1:8787/v1/auth/change-password`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `currentPassword` | `string` | Yes | Non-empty string | Existing account password. |
| `newPassword` | `string` | Yes | 8..128 chars, must differ from current | New account password. |
| `revokeOtherSessions` | `boolean` | No | default: true | If `true`, revokes all other devices while keeping current session active. |

### Request Body Example
```json
{
  "currentPassword": "{{testPassword}}",
  "newPassword": "{{testNewPassword}}",
  "revokeOtherSessions": true
}
```

### Response Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `changed` | `boolean` | `true` on success. |
| `revokedOtherSessions` | `boolean` | Whether other sessions were invalidated. |
| `updatedAt` | `string (ISO-8601 UTC)` | Password update timestamp. |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `PASSWORD_UNCHANGED` | New password equals current password. |
| `401` | `AUTH_INVALID_CREDENTIALS` | Current password is incorrect. |

#### Example Response — 200 OK — Password Changed
```json
{
  "changed": true,
  "revokedOtherSessions": true,
  "updatedAt": "2026-11-21T12:35:00.000Z"
}
```

---

### Claim Anonymous Web Session

Atomically migrates an anonymous Web MVP trial account (`anon:...`) into the logged-in verified account. Requires owning `coach_uid` cookie + explicit `consent: true`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/claim-anonymous`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/auth/claim-anonymous`
- **Dev URL:** `http://127.0.0.1:8787/v1/auth/claim-anonymous`
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
  "claimed": true,
  "fromAnonymousId": "anon:abc",
  "toUserId": "user:1a2b",
  "revision": 3
}
```

---

### Revoke Session (Current or All Devices)

Immediately revokes a specific `sessionId` or all sessions (`allDevices: true`) in D1, invalidating both Access JWTs and Refresh Tokens.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/revoke`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/auth/revoke`
- **Dev URL:** `http://127.0.0.1:8787/v1/auth/revoke`
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
  "revoked": true,
  "sessionId": "sess_123",
  "revokedAt": "2026-11-21T12:35:00.000Z"
}
```

---

### Logout

Logs out the current session (or all devices) and revokes associated refresh tokens in D1.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/auth/logout`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/auth/logout`
- **Dev URL:** `http://127.0.0.1:8787/v1/auth/logout`
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
  "loggedOut": true,
  "sessionId": "sess_123",
  "allDevices": false,
  "revokedAt": "2026-11-21T12:36:00.000Z"
}
```

---

## 03. Onboarding & Pre-Screening

Deterministic clinical/physiological pre-screening, initial 7-day nutrition & workout plan generation, legacy confirmations, and weekly plan renewal.

### Pre-Screening Eligibility Check

Fast deterministic pre-onboarding screening checking age (18..70), BMI boundaries (12.5..65), medical conditions, injuries, and maternal status before plan generation.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/eligibility`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/eligibility`
- **Dev URL:** `http://127.0.0.1:8787/v1/eligibility`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

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
}
```

---

### Generate Initial Plan (Full Response)

Creates the user profile, generates a personalized 7-day regional nutrition plan + adaptive workout program, and returns the full account state. Auto-captures `activePlanId`, `activeWorkoutPlanId`, `sampleMealId`, `sampleDayIndex`, and `sampleExerciseId`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=full`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=full`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=full`
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
    "name": "أحمد محمد",
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Confirm Health (Legacy Workouts-Only)

Explicit health confirmation for legacy `workouts_only` accounts that have not yet confirmed medical readiness.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Confirm Schedule (Legacy Calendar Migration)

Maps legacy workout day indexes to canonical `js_sunday_0` (`0=Sun .. 6=Sat`).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Renew Weekly Nutrition Plan

Generates the next 7-day nutrition plan after the active plan's end date has elapsed.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/bootstrap`
- **Dev URL:** `http://127.0.0.1:8787/v1/bootstrap`
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
  "schemaVersion": 3,
  "revision": 1,
  "serverNow": "2026-11-21T12:30:00.000Z",
  "serverDate": "2026-11-21",
  "timezone": "Africa/Cairo",
  "profile": {
    "name": "أحمد محمد",
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
}
```

---

### Get Full Account State

Returns the complete account aggregate including active 7-day nutrition plan, workout plan, diary logs, recovery check-ins, and review history. Supports `If-None-Match` ETag.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/state`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/state`
- **Dev URL:** `http://127.0.0.1:8787/v1/state`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/progress/summary`
- **Dev URL:** `http://127.0.0.1:8787/v1/progress/summary`
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

Returns actual food entries, nullable nutrient totals, completion status, and planned energy target for a specific user-local date.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/food-diary?date={{todayDate}}`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/food-diary?date={{todayDate}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/food-diary?date={{todayDate}}`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `date` | `string (YYYY-MM-DD)` | No | Defaults to today | User-local calendar date. |

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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Log Reference Ingredient (food_entry — ingredient)

Logs a verified reference ingredient by planning key (e.g. `chicken`, `rice`, `fava`, `egg`, `oats`) and weight in grams.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Log Manual Food Entry (food_entry — manual)

Logs a custom manual food item with calories and optional protein/carbs/fat.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
    "name": "طبق كشري متوسط",
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Confirm Food Day Complete (food_complete)

Explicitly confirms whether all food intake for `date` has been recorded (independent of calorie adherence).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Delete Food Entry (food_delete)

Deletes a logged food entry by ID and reopens that day's completion status.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Log Legacy Daily Total (food)

Logs a single daily calorie total for a date that has no detailed entries.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Switch Legacy Day to Detailed Entries (food_switch_to_entries)

Archives a legacy daily total so detailed food entries can be logged for that date.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Get Meal Alternatives

Returns up to 6 validated culinary substitutes matching diet, budget, exclusions, and clinical constraints.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/meal-alternatives?mealId={{sampleMealId}}`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/meal-alternatives?mealId={{sampleMealId}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/meal-alternatives?mealId={{sampleMealId}}`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Log Water Intake — Increment Cups (water)

Increments or decrements water intake relative to the date's existing total.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### List Water Logs

Paginated water intake logs ordered by date descending.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/water-logs?offset=0&limit=30`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/water-logs?offset=0&limit=30`
- **Dev URL:** `http://127.0.0.1:8787/v1/water-logs?offset=0&limit=30`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### List Weight Logs

Paginated weight measurements ordered by date descending.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/weight-logs?offset=0&limit=30`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/weight-logs?offset=0&limit=30`
- **Dev URL:** `http://127.0.0.1:8787/v1/weight-logs?offset=0&limit=30`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Log Activity & Active Energy (activity)

Logs daily steps and active energy burn with optional deduplication via `externalRecordId`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### List Activity Logs

Paginated activity and step logs.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/activity-logs?offset=0&limit=30`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/activity-logs?offset=0&limit=30`
- **Dev URL:** `http://127.0.0.1:8787/v1/activity-logs?offset=0&limit=30`
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

Idempotent batch ingestion of up to 100 weight/steps/activity records from Android Health Connect or Apple HealthKit.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/wearables/ingest`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/wearables/ingest`
- **Dev URL:** `http://127.0.0.1:8787/v1/wearables/ingest`
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
| `records[].type` | `string (enum)` | Yes | `weight` | `steps` | `activity` | Record type. |
| `records[].date` | `string (YYYY-MM-DD)` | Yes | Past 90 days..today | Record date. |
| `records[].kg` | `number` | No | Required for `weight` (35..250) | Weight in kg. |
| `records[].steps` | `integer` | No | 0..100000 | Steps count. |
| `records[].activeEnergyKcal` | `number` | No | 0..5000 | Active calories. |
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

#### Example Response — 200 OK — Ingested
```json
{
  "ok": true,
  "revision": 6,
  "ingested": 2
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/workout-plans`
- **Dev URL:** `http://127.0.0.1:8787/v1/workout-plans`
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

Fetches full owned workout plan with days, exercises, target reps/RIR, rest seconds, and weekly set totals.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/workout-plans/{{activeWorkoutPlanId}}`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/workout-plans/{{activeWorkoutPlanId}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/workout-plans/{{activeWorkoutPlanId}}`
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

Logs performed sets (`kg`, `reps`, `rir`, `pain`) for a scheduled exercise and computes progression suggestions.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
| `payload.sets` | `Array<object>` | Yes | 1..10 sets: `{ kg: 0..500, reps: int 1..100, rir?: 0..10, pain?: boolean }` | Performed sets. |
| `payload.bothSides` | `boolean` | No | Required `true` for unilateral exercises to progress | Confirms both sides completed. |
| `payload.increment` | `number | null` | No | 0.1..20 (kg) | Optional preferred load step. |
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### List Workout Logs

Paginated exercise set/rep/load logs.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/workout-logs?offset=0&limit=30`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/workout-logs?offset=0&limit=30`
- **Dev URL:** `http://127.0.0.1:8787/v1/workout-logs?offset=0&limit=30`
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

### Complete / Update Workout Session (session)

Marks a workout session as `completed`, `partial`, or `missed`. Completion ratio below 80% automatically classifies as `partial`.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### List Workout Sessions

Paginated workout session completion records.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/sessions?offset=0&limit=30`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/sessions?offset=0&limit=30`
- **Dev URL:** `http://127.0.0.1:8787/v1/sessions?offset=0&limit=30`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/exercise-alternatives?dayIndex={{sampleDayIndex}}&exerciseId={{sampleExerciseId}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/exercise-alternatives?dayIndex={{sampleDayIndex}}&exerciseId={{sampleExerciseId}}`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Propose Workout Reschedule (reschedule)

Creates a pending schedule adaptation proposal moving a workout day to a rest day within the next 13 days.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

## 08. Recovery & Adaptive Coaching

Daily recovery check-ins, deterministic coaching reviews, adaptation approvals, personalized coaching brief, and structured coaching agreements.

### Submit Daily Recovery Check-in (recovery)

Records daily sleep, fatigue, stress, regional muscle soreness, pain regions, illness, and red flags; feeds directly into workout readiness and deload logic.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### List Recovery Check-ins

Paginated daily recovery check-ins.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/checkins?offset=0&limit=30`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/checkins?offset=0&limit=30`
- **Dev URL:** `http://127.0.0.1:8787/v1/checkins?offset=0&limit=30`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=full`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=full`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Accept or Reject Adaptation Proposal (adaptation)

Accepts (`accept: true`) or declines (`accept: false`) a current, unexpired pending adaptation proposal.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Get On-Demand Coaching Brief

Returns deterministic personalized nutrition, training, and follow-up coaching notes for today (read-only; supports `If-None-Match` ETag).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/coaching/brief`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/coaching/brief`
- **Dev URL:** `http://127.0.0.1:8787/v1/coaching/brief`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/coaching/inbox`
- **Dev URL:** `http://127.0.0.1:8787/v1/coaching/inbox`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/coaching/history?offset=0&limit=30`
- **Dev URL:** `http://127.0.0.1:8787/v1/coaching/history?offset=0&limit=30`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Acknowledge Coaching Case (coaching_ack)

Explicitly marks a coaching agreement/message as read/acknowledged.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Decide on Coaching Case (coaching_decision)

Accepts or declines a proposed coaching agreement.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Report Coaching Outcome (coaching_outcome)

Records user-reported outcome for an accepted coaching agreement.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/plans`
- **Dev URL:** `http://127.0.0.1:8787/v1/plans`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/plans/{{activePlanId}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/plans/{{activePlanId}}`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/plans/{{activePlanId}}/days/{{todayDate}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/plans/{{activePlanId}}/days/{{todayDate}}`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/catalog/manifest`
- **Dev URL:** `http://127.0.0.1:8787/v1/catalog/manifest`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/catalog/muscles`
- **Dev URL:** `http://127.0.0.1:8787/v1/catalog/muscles`
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
- **URL:** `{{baseUrl}}/v1/foods?q=فول&scope=all&includeEstimated=true&offset=0&limit=20`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/foods?q=فول&scope=all&includeEstimated=true&offset=0&limit=20`
- **Dev URL:** `http://127.0.0.1:8787/v1/foods?q=فول&scope=all&includeEstimated=true&offset=0&limit=20`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/foods/{{sampleFoodId}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/foods/{{sampleFoodId}}`
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
- **URL:** `{{baseUrl}}/v1/beverages?q=شاي&includeEstimated=true&offset=0&limit=20`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/beverages?q=شاي&includeEstimated=true&offset=0&limit=20`
- **Dev URL:** `http://127.0.0.1:8787/v1/beverages?q=شاي&includeEstimated=true&offset=0&limit=20`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/foods/calculate`
- **Dev URL:** `http://127.0.0.1:8787/v1/foods/calculate`
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
}
```

---

### Search Exercises Catalog

Searches and filters the 868-exercise catalog (30 items per page).

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/exercises?q=bench&offset=0`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/exercises?q=bench&offset=0`
- **Dev URL:** `http://127.0.0.1:8787/v1/exercises?q=bench&offset=0`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/exercises/{{sampleCatalogExerciseId}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/exercises/{{sampleCatalogExerciseId}}`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/sync/changes?after=0&afterSeq={{nextSeqCursor}}`
- **Dev URL:** `http://127.0.0.1:8787/v1/sync/changes?after=0&afterSeq={{nextSeqCursor}}`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Get Notification Preferences

Returns stored reminder flags and quiet-hours window.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/notifications/preferences`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/notifications/preferences`
- **Dev URL:** `http://127.0.0.1:8787/v1/notifications/preferences`
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
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt`
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
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Get Entitlements

Returns current account subscription tier (`free` | `premium`) and enabled feature list.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/entitlements`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/entitlements`
- **Dev URL:** `http://127.0.0.1:8787/v1/entitlements`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

---

## 12. 90-Day Simulation Mode (?simulation=1)

Isolated per-user 90-day virtual simulation sandbox (`?simulation=1`). Runs the real deterministic nutrition & workout engines on a virtual clock without touching real account data.

### Reset / Start Simulation Round (simulation_reset)

Starts or resets a 90-day virtual simulation round using either `sample` persona or a copy of the user's `current` profile.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=full&simulation=1`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=full&simulation=1`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=full&simulation=1`
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
| `simulation` | `string (const)` | Yes | "1" | Routes command to isolated 90-day simulation namespace. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "simulation_reset" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `simulation_reset`. |
| `payload.source` | `string (enum)` | Yes | `sample` | `current` | Initial profile source. |
| `payload.confirm` | `boolean` | No | Required `true` when resetting an active round | Explicit reset confirmation. |

### Request Body Example
```json
{
  "revision": {{simRevision}},
  "action": "simulation_reset",
  "payload": {
    "source": "sample",
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

#### Example Response — 200 OK — simulation_reset Receipt
```json
{
  "ok": true,
  "revision": 2,
  "serverNow": "2026-11-21T12:30:00.000Z",
  "serverDate": "2026-11-21",
  "timezone": "Africa/Cairo",
  "commandReceipt": {
    "revision": 2,
    "action": "simulation_reset",
    "replayed": false,
    "at": "2026-11-21T12:30:00.000Z"
  },
  "affected": [
    {
      "entityType": "simulation_reset",
      "entityId": "example-id",
      "op": "upsert",
      "payload": {}
    }
  ]
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Get Simulation State

Reads the isolated simulation namespace state, virtual clock, and `simulationToday` summary.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/state?simulation=1`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/state?simulation=1`
- **Dev URL:** `http://127.0.0.1:8787/v1/state?simulation=1`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Accept` | `string` | Yes | JSON response format |

### Query Parameters
| Parameter | Type | Required | Constraints / Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `simulation` | `string (const)` | Yes | "1" | Selects simulation namespace. |

---

### Fill Simulation Day Scenario (simulation_fill)

Fills an empty virtual day with synthetic logs via real domain commands and triggers adaptive review.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt&simulation=1`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt&simulation=1`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt&simulation=1`
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
| `simulation` | `string (const)` | Yes | "1" | Routes command to isolated 90-day simulation namespace. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "simulation_fill" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `simulation_fill`. |
| `payload.scenario` | `string (enum)` | Yes | `consistent` | `plateau` | `poor_recovery` | `missed_workout` | `low_adherence` | `pain` | Synthetic day behavior scenario. |

### Request Body Example
```json
{
  "revision": {{simRevision}},
  "action": "simulation_fill",
  "payload": {
    "scenario": "consistent"
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

#### Example Response — 200 OK — simulation_fill Receipt
```json
{
  "ok": true,
  "revision": 2,
  "serverNow": "2026-11-21T12:30:00.000Z",
  "serverDate": "2026-11-21",
  "timezone": "Africa/Cairo",
  "commandReceipt": {
    "revision": 2,
    "action": "simulation_fill",
    "replayed": false,
    "at": "2026-11-21T12:30:00.000Z"
  },
  "affected": [
    {
      "entityType": "simulation_fill",
      "entityId": "example-id",
      "op": "upsert",
      "payload": {}
    }
  ]
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

### Advance Simulation by 1 Day (simulation_next)

Freezes current virtual day summary, advances virtual clock by 1 day (up to day 90), supersedes stale proposals, and renews expired nutrition week.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/commands?view=receipt&simulation=1`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/commands?view=receipt&simulation=1`
- **Dev URL:** `http://127.0.0.1:8787/v1/commands?view=receipt&simulation=1`
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
| `simulation` | `string (const)` | Yes | "1" | Routes command to isolated 90-day simulation namespace. |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `revision` | `integer` | Yes | >= 0 (must match server revision) | Current optimistic-concurrency account revision. |
| `action` | `string (const)` | Yes | "simulation_next" | Domain command action identifier. |
| `payload` | `object` | Yes | JSON object | Action-specific payload for `simulation_next`. |

### Request Body Example
```json
{
  "revision": {{simRevision}},
  "action": "simulation_next",
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

#### Example Response — 200 OK — simulation_next Receipt
```json
{
  "ok": true,
  "revision": 2,
  "serverNow": "2026-11-21T12:30:00.000Z",
  "serverDate": "2026-11-21",
  "timezone": "Africa/Cairo",
  "commandReceipt": {
    "revision": 2,
    "action": "simulation_next",
    "replayed": false,
    "at": "2026-11-21T12:30:00.000Z"
  },
  "affected": [
    {
      "entityType": "simulation_next",
      "entityId": "example-id",
      "op": "upsert",
      "payload": {}
    }
  ]
}
```

#### Example Response — 409 Conflict — Stale Revision
```json
{
  "error": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "code": "REVISION_CONFLICT",
  "message": "تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.",
  "fieldErrors": [],
  "requestId": "req-uuid",
  "retryable": false,
  "currentRevision": 5,
  "mergeHints": {
    "expectedRevision": 4,
    "serverRevision": 5,
    "syncChangesEndpoint": "/v1/sync/changes?after=4",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

---

## 13. Privacy, Export & GDPR Deletion

Versioned health/privacy consent recording, normalized table backfill, full machine-readable GDPR JSON export, and irreversible GDPR account erasure.

### Record Privacy / Health Consent

Records versioned explicit user consent in Cloudflare D1 (`coaching_account_consents`).

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/account/consents`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/account/consents`
- **Dev URL:** `http://127.0.0.1:8787/v1/account/consents`
- **Auth:** Required — `Authorization: Bearer {{accessToken}}` (or Web `coach_uid` cookie)

### Headers
| Header | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `Content-Type` | `string` | Yes | Must be application/json |
| `Accept` | `string` | Yes | JSON response format |

### Request Body Fields
| Field | Type | Required | Constraints / Allowed Values | Description |
| :--- | :--- | :---: | :--- | :--- |
| `consentType` | `string` | Yes | max 60 chars | Consent category (e.g. `health_data_processing`). |
| `version` | `string` | Yes | max 30 chars | Policy/terms version string. |
| `accepted` | `boolean` | Yes | boolean | Whether accepted or withdrawn. |

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
  "consentType": "health_data_processing",
  "version": "1.0.0",
  "accepted": true,
  "at": "2026-11-21T12:30:00.000Z"
}
```

---

### Backfill Normalized Tables

Backfills legacy aggregate logs into normalized Cloudflare D1 tables atomically.

### Endpoint Info
- **Method:** `POST`
- **URL:** `{{baseUrl}}/v1/account/backfill`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/account/backfill`
- **Dev URL:** `http://127.0.0.1:8787/v1/account/backfill`
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
  "migrated": true,
  "counts": {
    "foodEntries": 12,
    "waterLogs": 7,
    "weights": 7,
    "workoutLogs": 9,
    "sessions": 3,
    "checkins": 7
  }
}
```

---

### Export Full Account Data (GDPR)

Exports complete machine-readable JSON of profile, preferences, active & archived nutrition/workout plans, all logs, audit trail, and consents.

### Endpoint Info
- **Method:** `GET`
- **URL:** `{{baseUrl}}/v1/account/export`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/account/export`
- **Dev URL:** `http://127.0.0.1:8787/v1/account/export`
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

**IRREVERSIBLE:** Permanently erases all account data, simulation copies, auth credentials (`coaching_users`), and refresh tokens (`coaching_refresh_tokens`) in one atomic D1 batch, and writes revocation tombstones. Must be called outside `?simulation=1`.

### Endpoint Info
- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/v1/account/delete`
- **Production URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/v1/account/delete`
- **Dev URL:** `http://127.0.0.1:8787/v1/account/delete`
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
| `namespacesCleared` | `integer` | Number of namespaces cleared (real + simulation + claimed). |

### Possible Error Responses
| HTTP Status | Error Code | When |
| :---: | :--- | :--- |
| `400` | `DELETE_CONFIRMATION_REQUIRED` | Missing `confirm: true`. |
| `400` | `ACCOUNT_DELETION_SIMULATION_FORBIDDEN` | Called with `?simulation=1`. |

#### Example Response — 200 OK — Permanently Deleted
```json
{
  "deleted": true,
  "userId": "user:1a2b",
  "deletedAt": "2026-11-21T12:40:00.000Z",
  "tablesCleared": 18,
  "namespacesCleared": 2
}
```

---

