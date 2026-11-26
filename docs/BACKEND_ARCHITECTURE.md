# CuraFit API v1 — Backend Architecture

This document describes the production architecture for **CuraFit API v1** running natively on **Cloudflare Workers + Cloudflare D1**, covering API boundaries, deterministic domain engines, native D1 authentication, and dual aggregate + normalized relational storage designed for **Kotlin Multiplatform Mobile (KMM)** on Android and iOS.

---

## 1. Architectural Principles & Canonical Hosting Contract

1. **Clean Domain Separation:**
   - Nutrition planning and metabolic calculators (`planner-core.mjs`, `diet-patterns.mjs`, `clinical-constants.mjs`, `calculator.mjs`) and training/recovery/coaching engines (`server/workouts.mjs`, `server/recovery.mjs`, `server/training-review.mjs`, `server/coaching.mjs`) operate as deterministic modules decoupled from Cloudflare HTTP transport and UI code.
   - Mobile clients (KMM) never duplicate nutrition formulas, clinical exclusions, or workout progression rules locally; the backend is the single source of truth with offline caching and delta outbox synchronization.
2. **Canonical Cloudflare Environments & Branches ([`AGENTS.md`](../AGENTS.md)):**
   - **Cloud Dev (`dev` branch):** Worker `curafit-api-dev` (`https://curafit-api-dev.egypt-nutrition-coach.workers.dev`) bound to D1 `curafit-db-dev` (`0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`, full clone of Production D1).
   - **Production (`main` branch):** Worker `curafit-api` (`https://curafit-api.egypt-nutrition-coach.workers.dev`) bound to D1 `egypt-nutrition-coaching` (`90fa62f1-7866-4156-ac29-f0aec4814bab`).
   - **Entrypoint:** `server/cloudflare-entry.mjs` bundled into `dist/server/cloudflare.js`.
   - **Promotion Policy:** All changes ship to `dev` (Cloud Dev) first, verify via `npm run check` and live API tests, and fast-forward merge `dev` -> `main` for Production.

---

## 2. Server Components

| Component | Module | Responsibility |
| :--- | :--- | :--- |
| **Edge Gateway & Identity Adapter** | `server/cloudflare-entry.mjs` | Strips untrusted identity spoofing headers at the edge; authenticates KMM requests via `Authorization: Bearer <JWT>` or browser Web UI sessions via `HttpOnly; Secure; SameSite=Lax` `coach_uid` cookies. |
| **API Router & Contract Layer** | `server/worker.mjs` | Routes `/v1/*` HTTP requests, enforces streaming payload limits (40 KB) and UTF-8 validation, serves `ETag` / `If-None-Match` (`304 Not Modified`), exposes `/v1/bootstrap` and compact command receipts (`?view=receipt`), and formats uniform `{ ok, data, meta }` and `{ ok: false, error, meta }` envelopes with 100% English error messages. |
| **Native D1 Auth & Session Manager** | `server/native-auth.mjs` + `server/oauth.mjs` | First-party passwordless authentication using direct Google & Apple OIDC JWKS verification (`POST /v1/auth/oauth/google`, `POST /v1/auth/oauth/apple`), anonymous session claim, and SHA-256 hashed rotating refresh tokens (`cfrt_...`) stored in D1 with replay reuse detection. |
| **JWT Verifier & Rate Limiter** | `server/auth.mjs` | Cryptographic JWT verification via WebCrypto `SubtleCrypto` (`HS256` / `RS256` / `ES256`), `iss`/`aud`/`exp`/`nbf` validation (60s clock skew tolerance), session/account revocation checks (`coaching_auth_sessions`), and per-IP/user rate limiting. |
| **Structured Redacting Logger** | `server/logger.mjs` | Emits structured JSON logs keyed by `requestId` with automated redaction (`redactObject`) of auth secrets, tokens, cookies, weight, medical conditions, injuries, pain regions, and check-ins. |
| **Dual-Model Persistence & Sync** | `server/store.mjs` | Executes atomic optimistic-concurrency batches (`db.batch` with `revision` CAS and `_commitToken`), canonical JSON request hashing (`canonicalCommandDigest`) for idempotency, dual-writes to relational tables and `coaching_sync_outbox`, GDPR export, and atomic account erasure. |
| **Food Catalog & Beverage Engine** | `server/food-catalog.mjs` | Indexes the 3,291 food and beverage entries with Arabic/English normalization and regional synonyms, separates `Approved` reference entries from `Pending Review` estimates, and calculates custom recipes/beverages with density and cooking yield guards. |
| **Domain Time & Timezone Context** | `server/clock.mjs` + `coaching-shared.mjs` | Provides request-scoped `AsyncLocalStorage` clock/time helpers honoring each user's IANA timezone (`Africa/Cairo`, `Asia/Riyadh`, `Asia/Dubai`, etc.). |

---

## 3. Sequence Flows

### 3.1. KMM App Bootstrap & Delta Receipt Write

```text
KMM App (Android/iOS)                   Cloudflare Edge (worker.mjs)                 Cloudflare D1 (SQLite)
        |                                            |                                         |
        |--- GET /v1/bootstrap --------------------->|                                         |
        |    Authorization: Bearer <JWT>             |-- Verify JWT + Check Revocation ------->|
        |    If-None-Match: W/"rev-4"                |-- SELECT revision, body --------------->|
        |<-- 200 OK ({ ok: true, data, meta }) ------|                                         |
        |                                            |                                         |
        |--- POST /v1/commands?view=receipt -------->|                                         |
        |    Idempotency-Key: <UUID>                 |-- Canonical SHA-256 Digest ------------>|
        |    {"revision":5,"action":"water",...}     |-- Atomic Batch (CAS revision=5 -> 6) -->|
        |                                            |   1. UPDATE coaching_accounts           |
        |                                            |   2. INSERT coaching_water_logs         |
        |                                            |   3. INSERT coaching_sync_outbox (seq)  |
        |                                            |   4. INSERT coaching_requests (receipt) |
        |<-- 200 OK ({ ok: true, data, meta }) ------|                                         |
```

### 3.2. Multi-Device Offline Sync & `409 REVISION_CONFLICT` Resolution

```text
Device A (Offline Queue)                Cloudflare Worker                            Device B (Online)
        |                                       |                                            |
        |                                       |<-- POST /v1/commands (rev 5 -> 6) ---------|
        |                                       |    (Deletes meal entry "m-101")            |
        |                                       |--> Appends delete tombstone to outbox      |
        |                                       |                                            |
        |--- POST /v1/commands (rev 5) -------->|                                            |
        |<-- 409 Conflict ----------------------|                                            |
        |    { ok: false, error: {              |                                            |
        |      code: "REVISION_CONFLICT",       |                                            |
        |      details: { currentRevision: 6,   |                                            |
        |        mergeHints: ... } } }          |                                            |
        |                                       |                                            |
        |--- GET /v1/sync/changes?after=5 ----->|                                            |
        |<-- 200 OK ({ ok: true, data: {        |                                            |
        |      deltas: [{ seq: 601,             |                                            |
        |        op: "delete",                  |                                            |
        |        entityType: "food_entry",      |                                            |
        |        entityId: "m-101" }] } }) -----|                                            |
        |                                       |                                            |
        |--- Rebase SQLDelight & retry -------->|                                            |
        |    POST /v1/commands (rev 6 -> 7)     |                                            |
        |<-- 200 OK (Receipt rev 7) ------------|                                            |
```

---

## 4. Cloudflare D1 Relational Schema

The database pairs the active state document (`coaching_accounts`) for fast single-row reads with normalized indexed tables (`drizzle/` migrations `0000`–`0005`):

- `coaching_accounts (user_id PK, revision, body)` — Active user profile, preferences, and 95-day active rolling window.
- `coaching_plans (user_id, plan_id PK, created_at, body)` — Immutable versioned nutrition plan archive.
- `coaching_workout_plans (user_id, plan_id PK, body)` — Immutable versioned workout plan archive.
- `coaching_requests (user_id, request_key PK, digest, response)` — Canonical SHA-256 idempotency receipts.
- `coaching_changes (user_id, revision PK, action, at)` — Revision change audit log.
- `coaching_sync_outbox (user_id, seq PK, revision, entity_type, entity_id, op, at, payload)` — Ordered entity-level deltas (`upsert` / `delete`) for offline KMM sync.
- `coaching_food_entries (user_id, entry_id PK, date, slot, source, updated_at, deleted, body)` — Indexed on `(user_id, date)`.
- `coaching_water_logs (user_id, date PK, cups, liters, updated_at, body)` — Daily hydration records.
- `coaching_weight_logs (user_id, date PK, kg, source, updated_at, body)` — Body weight telemetry.
- `coaching_workout_logs (user_id, log_id PK, date, exercise_id, plan_id, updated_at, deleted, body)` — Indexed on `(user_id, date)`.
- `coaching_sessions (user_id, session_id PK, date, day_index, status, updated_at, body)` — Indexed on `(user_id, date)`.
- `coaching_checkins (user_id, date PK, at, body)` — Daily subjective readiness and recovery check-ins.
- `coaching_cases (user_id, case_id PK, ...)` & `coaching_feedback (user_id, ...)` — Continuous coaching follow-up agreements and barrier feedback (`0004_coaching_journey.sql`).
- `coaching_users (user_id PK, email UNIQUE, ...)` & `coaching_refresh_tokens (token_hash PK, ...)` — Native Cloudflare D1 authentication credentials and rotating refresh token state (`0005_native_auth.sql`).
- `coaching_auth_sessions (user_id, session_id PK, device_id, created_at, expires_at, revoked_at)` — Session revocation, anonymous claim markers (`__claimed__`), and GDPR erasure tombstones (`__deleted__`).
- `coaching_account_consents (user_id, consent_type PK, version, accepted, at)` — Versioned explicit consent log.
