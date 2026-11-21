# Test & Verification Matrix Overview

This document describes the automated verification commands, test suites (`tests/*.test.mjs`), and quality gates enforced for **CuraFit API v1** in CI (`.github/workflows/check.yml`) and local release checks.

---

## 1. Standard Verification Commands (Run from `e:\Egypt_Nutrition_Local\website\dist`)

| Command | Scope & Purpose |
| :--- | :--- |
| `npm.cmd run check` | Runs TypeScript check (`tsc -p tsconfig.quality.json`), food data manifest verification (`scripts/check-data-manifest.mjs`), bundle build (`scripts/build.mjs`), module boundary check (`scripts/quality/check-modules.mjs`), behavior reference check (`scripts/quality/check-reference.mjs`), and the complete Node test suite (`node --test tests/*.test.mjs`). |
| `npm.cmd run audit:matrix` | Runs the deterministic full matrix across **2,250 workout combinations** and **333 nutrition planning scenarios** (`111` profiles x `3` seeds), asserting 0 runtime errors and full constraint validation. |
| `npm.cmd run benchmark` | Executes live Miniflare/D1 request dispatch measurements and writes `outputs/benchmark-report.json`. |
| `npm.cmd run postman:generate` | Regenerates `postman/CuraFit_API.postman_collection.json`, the 3 `postman/CuraFit_*.postman_environment.json` presets, and `docs/API_REFERENCE.md`. |

---

## 2. Active Test Suites (`tests/*.test.mjs`)

| Test File | Coverage Area |
| :--- | :--- |
| `tests/error-contract.test.mjs` | Asserts 100% pure-English `contracts/error-codes.json` and `docs/ERROR_CODES.md`, verifies 0 Arabic characters across documentation/contract files and server error throws, and tests live HTTP `{ ok, data, error, meta }` envelopes across `200`/`201`/`400`/`401`/`403`/`404`/`405`/`409`/`413`/`415`/`429`. |
| `tests/native-auth.test.mjs` | Verifies Cloudflare-native PBKDF2 auth, fail-closed `503 AUTH_SECRET_NOT_CONFIGURED`, register/login/refresh token rotation + reuse revocation, change-password, logout, anonymous claim, GDPR delete, and validates Postman collection + 3 environments (`curafit-api-dev`, `curafit-api`, `127.0.0.1:8787`) & OpenAPI parity. |
| `tests/e2e-release-scenarios.test.mjs` | End-to-end release scenarios (`E01`–`E16` / `F01`–`F22`): auth isolation, JWT validation, offline sync `409` + outbox deltas + tombstones, canonical JSON idempotency, catalog search, density guards, hypertension sodium gate, favism/lactose exclusions, bootstrap payload size, pagination, timezone midnight boundaries, export/delete, backfill, log redaction, and OpenAPI schema validity. |
| `tests/api.test.mjs` & `tests/api-audit.test.mjs` | Core `/v1/*` API contract, D1 persistence, concurrent first-write races, streaming 40 KB payload limit, `Origin` check, and archived plan day target lookups. |
| `tests/coaching-journey.test.mjs`, `tests/coaching-journey-api.test.mjs`, `tests/coaching-brief-api.test.mjs`, `tests/coaching-feedback-memory.test.mjs` | Follow-up agreements, subjective barrier feedback (hunger/satiety/energy/pain), outcome review, and caching contracts. |
| `tests/audit.test.mjs`, `tests/followup.test.mjs`, `tests/followup-continuity.test.mjs`, `tests/medical-transitions.test.mjs`, `tests/release-011.test.mjs`, `tests/release-011-api.test.mjs`, `tests/maturity.test.mjs` | Deterministic nutrition/workout/recovery regressions, injury exclusions, clinical condition transitions, explicit food completion confirmation, and weekly goal/deload progression guards. |
| `tests/spec-value.test.mjs`, `tests/coaching.test.mjs`, `tests/personal-brief.test.mjs`, `tests/coach-messages.test.mjs`, `tests/split-review.test.mjs`, `tests/plan-history-audit.test.mjs`, `tests/import-012-regressions.test.mjs` | ABW gout formulas, pregnancy/lactation screening, household portions across 86 ingredients, message timing/rotation, split reviews, and archived plan history integrity. |

---

## 3. Verification Reporting Policy

All check/test/benchmark metrics reported for releases are obtained by executing `npm.cmd run check`, `npm.cmd run audit:matrix`, and `npm.cmd run benchmark` directly against the current commit and observing `0` failures and `0` skipped tests before promotion from `dev` to `main`.
