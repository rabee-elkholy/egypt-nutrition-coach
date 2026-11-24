# AI Agent Instructions & Unified Hosting Contract (`CuraFit API v1`)

> **MANDATORY RULES FOR OPENAI CODEX & GOOGLE ANTIGRAVITY:**
> 1. **TWO CANONICAL CLOUDFLARE ENVIRONMENTS (`dev` & `main`):**
>    - **Cloud Dev (`dev` branch):** Worker `curafit-api-dev` -> Cloudflare D1 `curafit-db-dev` (`database_id`: `0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0` — **full clone** of Production D1 data/schema, **NEVER** an empty DB).
>    - **Production (`main` branch):** Worker `curafit-api` -> existing full Production D1 `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab` — **NEVER** replace with an empty DB).
> 2. **TWO CANONICAL BRANCHES ONLY (`dev` -> `main`):** Always develop and test changes on **`dev`** (`origin/dev`, Cloud Dev) first, verify green CI, and only then fast-forward merge **`dev` -> `main`** (`origin/main`, Production). **NEVER** create ad-hoc feature branches or deploy to OpenAI preview hosting or GitHub Pages.
> 3. **PURE-ENGLISH DOCS, ERROR & COACHING MESSAGE CONTRACTS:**
>    - All `4xx`/`5xx` API responses must follow `{ ok: false, error: { code, message, params, fieldErrors, retryable, details? }, meta: { requestId, serverTime } }` with **100% English** messages (`contracts/error-codes.json`). All `2xx` responses must follow `{ ok: true, data, meta: { requestId, serverTime, revision? } }`.
>    - All server coaching, brief, review, and eligibility messages are **100% English** with canonical codes & params (`contracts/coaching-codes.json`); the KMM mobile client localizes non-English languages (such as Arabic) on-device.
>    - All documentation (`docs/`, `postman/`, `README.md`, `AGENTS.md`), OpenAPI contracts, examples, and Postman definitions must contain **zero Arabic characters** (enforced automatically by `tests/error-contract.test.mjs`).
> 4. **PRESERVE CATALOGS & KEEP RETIRED SYSTEMS REMOVED:**
>    - Preserve all food and exercise catalogs in `data/` (`node scripts/check-data-manifest.mjs`).
>    - Direct first-party Google Sign-In & Apple Sign-In OIDC verification inside Cloudflare Workers (keeping first-party HS256 JWT + D1 refresh tokens) is explicitly supported; third-party BaaS IdPs (Supabase, Auth0, Firebase Auth) remain permanently banned.
>    - The legacy Web UI MVP (`#planner`), simulation mode (`?simulation=1`, `simulation_*`), legacy Worker `egypt-nutrition-coach`, and GitHub Pages are permanently removed; CuraFit Workers (`curafit-api-dev`, `curafit-api`) serve pure KMM Mobile API (`/v1/*`).

---

## 1. Canonical Live URLs, Branches & Resources

* **Production API (`main` branch):** `https://curafit-api.egypt-nutrition-coach.workers.dev` (Pure KMM Mobile API `/v1/*`; legacy Web UI MVP permanently removed)
  * Worker: `curafit-api`
  * D1 Database: `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab`, binding: `DB`)
* **Cloud Dev API (`dev` branch):** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev` (Pure KMM Mobile API `/v1/*`)
  * Worker: `curafit-api-dev`
  * D1 Database: `curafit-db-dev` (`database_id`: `0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`, binding: `DB`)
* **Git Repository & Branches:** `https://github.com/rabee-elkholy/egypt-nutrition-coach.git` — Branches: **`dev`** & **`main`**
* **Postman Documentation (Published):** `https://documenter-api.postman.tech/view/9137216/2sBYPv2s1w` (`CuraFit API v1`, `16` groups / `140` endpoints; environments: `CuraFit — Cloud Dev`, `CuraFit — Production`, `CuraFit — Local Dev`)
* **Worker Entrypoint & Config:** `server/cloudflare-entry.mjs` (bundled into `dist/server/cloudflare.js`), `wrangler.jsonc`, `drizzle/`

Full step-by-step instructions for AI agents and developers (error & coaching contract sync, OpenAPI/Postman regeneration, Drizzle D1 migrations, QA, and CI/CD) live in [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).

---

## 2. Quick Build, Sync, Test & Deployment Workflow

Run from `e:\Egypt_Nutrition_Local\website\dist`:

1. **Sync Contracts When Editing Errors, Coaching Codes, Endpoints, or Docs:**
   ```powershell
   node scripts/sync-error-contracts.mjs   # syncs contracts/error-codes.json & coaching-codes.json -> docs/
   npm.cmd run postman:generate             # regenerates postman/*.json & docs/API_REFERENCE.md
   ```
2. **Develop, Test & Deploy on `dev` (Cloud Dev) First:**
   ```powershell
   git checkout dev
   git pull --ff-only origin dev
   npm.cmd run check                        # typecheck, manifest, build, module/ref checks, 297+ tests
   npm.cmd run deploy:d1:dev                # only when new drizzle/*.sql migrations exist
   npm.cmd run deploy:dev
   git add -A
   git commit -m "<concise commit message>"
   git push origin dev
   ```
3. **Wait for Green CI on `dev`, Then Promote to Production (`main`):**
   ```powershell
   gh run watch <dev-verify-run-id> --exit-status
   git checkout main
   git pull --ff-only origin main
   git merge --ff-only dev
   npm.cmd run check
   npm.cmd run deploy:d1:prod               # only after backup when new drizzle/*.sql exists
   npm.cmd run deploy:prod
   git push origin main
   ```

---

## 3. Strict Prohibitions for Codex & Antigravity

1. **Do NOT create branches other than `dev` and `main`.**
2. **Do NOT replace Production D1 `90fa62f1-7866-4156-ac29-f0aec4814bab` with an empty DB, and do NOT reset `curafit-db-dev` (`0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`) to an empty schema without cloning Production data.**
3. **Do NOT commit Arabic text into `contracts/`, `docs/`, `postman/`, `README.md`, `AGENTS.md`, or server/domain error or coaching responses.** All server error messages (`contracts/error-codes.json`) and coaching/brief/review/eligibility messages (`contracts/coaching-codes.json`) are pure English with canonical codes & params; non-English UI translations live strictly in the KMM mobile app (and bilingual food/exercise catalog data in `data/`).
4. **Do NOT overwrite `scripts/build.mjs` to remove the `dist/server/cloudflare.js` build target or skip `npm.cmd run check` before pushing.**
5. **Do NOT use `.openai/hosting.json`, GitHub Pages, or any third-party BaaS IdP (Supabase, Auth0, Firebase Auth).** First-party Google Sign-In and Apple Sign-In OIDC token verification directly inside Cloudflare Workers with first-party HS256 JWT + D1 refresh tokens is explicitly permitted.

---

## 4. Clean Code & Production Safety Standards

Every change merged to `dev` or promoted to `main` must satisfy these production-engineering invariants:

1. **Acyclic, Single-Responsibility Modules (Zero Duplication):**
   - Keep `server/` strictly acyclic (verified automatically by `scripts/quality/check-modules.mjs`).
   - Centralize shared external crypto and outbound HTTP helpers in `server/external-crypto.mjs` (PEM decoding, ES256 JWT signing, cached Google Service Account OAuth2 token exchange, and bounded-timeout `fetchWithTimeout`) — never duplicate WebCrypto or OAuth2 boilerplate across `oauth.mjs`, `subscriptions.mjs`, and `push.mjs`.
2. **Bounded External I/O Timeouts (Cloudflare Workers Safety):**
   - Every outbound `fetch()` to third-party APIs (Apple, Google, FCM, APNs, OpenFoodFacts, JWKS) **must** enforce an explicit `AbortSignal.timeout(...)` via `fetchWithTimeout()` so a slow upstream never stalls a Worker isolate or exhausts a Cron execution window.
3. **Structured PII-Safe Logging Only:**
   - Never use raw `console.log` in `server/`. Emit structured JSON events exclusively through `logEvent()` (`server/logger.mjs`) so tokens, emails, and health payloads remain automatically redacted.
4. **Atomic Persistence, Safe Deletion Order & Idempotency:**
   - All domain mutations pass through `POST /v1/commands` with optimistic-concurrency `revision` checks and intent-digest `Idempotency-Key` replay safety.
   - Destructive account erasure (`DELETE /v1/account/delete`) must commit the atomic D1 batch (including anonymized SHA-256 `coaching_trial_tombstones`) **before** purging R2 objects or calling Apple `/auth/revoke`.
5. **Fail-Closed Production Flags & Environment Variable Parity:**
   - Production must run with `STRICT_STORE_VERIFICATION="true"` and `ENFORCE_PRO_ENTITLEMENTS="true"`.
   - Every Worker secret or environment variable read in `server/*.mjs` must be documented in [`docs/MANUAL_SETUP_AND_DEPLOY_CHECKLIST.md`](docs/MANUAL_SETUP_AND_DEPLOY_CHECKLIST.md).
6. **Zero-Regression Verification Before Every Push:**
   - Always run `npm run check` (`typecheck`, `check-data-manifest`, `build`, `check-modules`, `check-reference`, and all `307+` tests) plus `npm run audit:matrix` whenever domain engines (`planner-core.mjs`, `server/workouts.mjs`, `server/coaching.mjs`) are modified.

---

## 5. Cross-Cutting Brand Voice, Clinical Safety, Regional/Unit & Calibration Contracts

All current and upcoming Worker endpoints (`EPIC-01` through `EPIC-10`) MUST follow `.agent/rules/curafit-specialist-and-clinical-contracts.md` without breaking existing KMM mobile clients (`{ ok, data, meta }` / `{ ok, error, meta }`, `js_sunday_0` weekday indexing):

1. **Human-Expert Brand Voice ("CuraFit Specialist Team" — Zero AI/Automated Exposure):** Never output `AI`, `AI Coach`, `Smart Coach`, `automated`, `automatic`, `automatically`, `algorithm`, `engine`, `bot`, or their Arabic equivalents in any user-facing string (warnings, eligibility reasons, briefs, meal/workout explanations, push notifications, or future Q&A prompts/responses). Frame all guidance strictly as the **CuraFit Specialist Team** (e.g., `"Ask the CuraFit Specialist Team"` for `US-CCH-05` / `KAN-84`).
2. **Additive Machine-Readable Codes:** Keep existing `warnings: string[]` and `eligibility.reasons` / `eligibilityReasons` for backwards compatibility AND emit parallel `warningCodes: string[]` and `eligibilityReasonCodes: string[]` registered in `contracts/coaching-codes.json` so mobile clients localize cleanly without substring matching.
3. **Centralized Clinical Safety Gate Parity:** Reuse one shared clinical gate across onboarding, profile edits, plan reconfiguration, meal swaps, and workout swaps (`>= 4` injuries or `parqRedFlag === true` -> specialist review for workouts while still computing `nutritionFeasible`; `>= 3` overlapping dietary-restricting chronic conditions -> specialist review; `diabetes_t1`/`diabetes_t2` mutual exclusion; `dash`/`favism`/`lactose_intolerance`/`offal` parity; last-protein-pillar protection; maternal `T1`/`T2`/`T3`/`breastfeeding` and senior `70+` safety floors).
4. **Persist & Sync `unit_system` and `region_id` + Regional Hydration Bonuses:** Accept and return both camelCase (`unitSystem`, `region`) and snake_case (`unit_system`, `region_id`) across preview, commit, profile update, and hydration endpoints, applying `dailyWaterTarget()` (`+200 ml` warm climate, `+500 ml` training/cardio/gout, `+300 ml` pregnancy, `+600 ml` breastfeeding) consistently everywhere.
5. **Structured `calibrationMetadata`:** Return additive `calibrationMetadata` (`calibrationReasons`, `adjustedCalories`, `adjustedMacros`, `protectedJoints`, `activeProteinPillars`) on plan previews, generations, renewals, weekly check-ins, and adaptive calibrations to power `SpecialistPlanPreparationCard`.
6. **Postman Retired:** Do **NOT** update `postman/*`, run `npm run postman:generate`, or publish Postman collections going forward; keep `contracts/openapi.yaml`, `contracts/error-codes.json`, and `contracts/coaching-codes.json` as the canonical API contracts.

