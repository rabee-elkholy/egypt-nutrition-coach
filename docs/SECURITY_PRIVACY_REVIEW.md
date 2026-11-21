# Security, Authentication & Privacy Review

This document summarizes the threat model, authentication architecture, RBAC boundaries, structured log redaction, and GDPR data-lifecycle controls implemented in **CuraFit API v1**.

---

## 1. Threat Model & Implemented Controls

| Threat Vector | Severity | Implemented Control | Verification Suite |
| :--- | :---: | :--- | :--- |
| **Edge Identity Header Spoofing (`oai-authenticated-user-id`)** | P0 | `server/cloudflare-entry.mjs` strips untrusted identity headers at the Cloudflare edge before passing requests to `server/worker.mjs`. | `tests/e2e-release-scenarios.test.mjs` |
| **Cross-Account Access (IDOR)** | P0 | Every D1 query (`coaching_accounts`, `coaching_plans`, `coaching_workout_plans`, `coaching_sync_outbox`, and all relational tables) scopes by `WHERE user_id = ?` derived solely from verified server auth context. | `tests/api.test.mjs`, `tests/e2e-release-scenarios.test.mjs` |
| **Token Theft, Weak Algorithms, or Stolen Device** | P0 | `server/auth.mjs` enforces cryptographic WebCrypto signature validation (`HS256` / `RS256` / `ES256`), validates `exp`/`nbf`/`iat`/`iss`/`aud`, rejects `alg: "none"`, checks `coaching_auth_sessions` revocation state, and supports per-session or all-device revocation via `/v1/auth/revoke` & `/v1/auth/logout`. | `tests/native-auth.test.mjs`, `tests/e2e-release-scenarios.test.mjs` |
| **Refresh Token Replay / Session Hijack** | P0 | `server/native-auth.mjs` hashes opaque refresh tokens (`cfrt_...`) with SHA-256 and rotates on every `POST /v1/auth/refresh`. Replaying a previously rotated token revokes the entire session immediately (`401 AUTH_REFRESH_TOKEN_REUSED`). | `tests/native-auth.test.mjs` |
| **Unauthorized Anonymous Account Claim** | P0 | `POST /v1/auth/claim-anonymous` requires an authenticated Bearer user token, matching ownership cookie, and explicit `{ consent: true }`, then writes a `__claimed__` marker preventing duplicate claims. | `tests/native-auth.test.mjs`, `tests/e2e-release-scenarios.test.mjs` |
| **Resurrecting Deleted Accounts with Old Tokens** | P0 | `DELETE /v1/account/delete` atomically erases user rows across 18 tables in `db.batch` and writes a `__deleted__` tombstone so prior JWTs fail closed with `401 ACCOUNT_DELETED`. | `tests/native-auth.test.mjs`, `tests/e2e-release-scenarios.test.mjs` |
| **PII / Health Telemetry Leakage in Logs** | P0 | `server/logger.mjs` applies `redactObject` and `maskSubject` to redact `Authorization`, `Cookie`, passwords, weights, diseases, injuries, pain regions, and check-ins before emitting logs. | `tests/e2e-release-scenarios.test.mjs` |
| **Payload DoS, Rate Abuse & Origin CSRF** | P1 | Streaming body byte cap (`40 KB` -> `413 PAYLOAD_TOO_LARGE`), rate limiting (`429 RATE_LIMITED`), `Origin` verification, and pure-English error contracts (`contracts/error-codes.json`). | `tests/api-audit.test.mjs`, `tests/error-contract.test.mjs` |

---

## 2. Authorization & Least Privilege

- **Granted Scopes:** `coach:read` (state, plans, logs, catalogs, exports) and `coach:write` (commands, consents, account mutations scoped to the caller's own `user_id`).
- **No Client-Trusted Roles:** Server endpoints ignore client-supplied admin flags or entitlement tiers in request bodies; entitlements are read strictly from verified server claims or server-persisted records.

---

## 3. Privacy-by-Design, Export & Deletion Controls

1. **Consent Ledger (`POST /v1/account/consents`):** Persists versioned consents (`privacy_policy`, `health_data_processing`, `medical_disclaimer`) with UTC timestamps in `coaching_account_consents`.
2. **Data Portability (`GET /v1/account/export`):** Returns complete machine-readable JSON covering profile, preferences, logs, archived plans, change history, and recorded consents.
3. **Permanent Erasure (`DELETE /v1/account/delete`):** Requires `{ confirm: true }` and deletes all user data, credentials (`coaching_users`), and tokens (`coaching_refresh_tokens`) atomically while recording erasure tombstones.
4. **Compliance Disclaimer:** Technical consent, export, and deletion controls are implemented in code; formal regulatory compliance statements (e.g., Egyptian Law No. 151/2020 or Saudi PDPL) require legal review of deployed privacy notices and hosting disclosures.

---

## 4. Native Cloudflare Authentication Configuration

CuraFit uses first-party Cloudflare D1 + Worker authentication (`cloudflare_d1_native`):

- `AUTH_JWT_SECRET`: Required Wrangler secret (`>= 32` chars; `64` random bytes hex provisioned on both `curafit-api-dev` and `curafit-api`). Missing secrets fail closed with `503 AUTH_SECRET_NOT_CONFIGURED`.
- `AUTH_ISSUER` & `AUTH_AUDIENCE` (optional overrides): Default cleanly for first-party JWT issuance and verification (`server/auth.mjs`).
