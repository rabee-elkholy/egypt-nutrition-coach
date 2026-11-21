> Current release: **1.0.0 (`CuraFit API v1`)** — Pure Cloudflare Workers + D1 + R2 backend for Kotlin Multiplatform Mobile (KMM) Android & iOS clients.

# CuraFit (`curafit-api`)

Server-driven Arabic & regional nutrition planning, workout prescription, and adaptive longitudinal coaching for weight, hydration, sleep, and recovery. All planning and coaching engines run deterministically on Cloudflare Workers, D1, and R2 with **zero runtime AI API calls** (AI meal parsing and Q&A are deferred to the final AI rollout phase), returning uniform `{ ok, data, error, meta }` KMM JSON envelopes and 100% pure-English canonical catalogs ([`contracts/error-codes.json`](contracts/error-codes.json), [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md), [`contracts/coaching-codes.json`](contracts/coaching-codes.json), [`docs/COACHING_CODES.md`](docs/COACHING_CODES.md)).

## Canonical Hosting & Repository Contract

- **Production API (`main` branch):** `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/health`
- **Cloud Dev API (`dev` branch):** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/health`
- **Git Repository:** [rabee-elkholy/egypt-nutrition-coach](https://github.com/rabee-elkholy/egypt-nutrition-coach) — Branches: **`dev`** (Cloud Dev) & **`main`** (Production)
- **Cloudflare Workers:** `curafit-api` (Production) & `curafit-api-dev` (Cloud Dev)
- **Cloudflare D1 Databases:** `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab`, binding: `DB`) & `curafit-db-dev` (`database_id`: `0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`, full production clone for Cloud Dev)
- **Deployment Configuration:** [`wrangler.jsonc`](wrangler.jsonc), Worker entrypoint [`server/cloudflare-entry.mjs`](server/cloudflare-entry.mjs)

Full repository, branching, and AI agent development workflow rules are defined in [`AGENTS.md`](AGENTS.md) and [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).

## Nutrition Planning & Adaptive Follow-Up

- **Regional & Constraint-Aware Meal Plans:** Supports regional food availability (`egypt`, `levant`, `gulf`, `maghreb`), dietary patterns (`balanced`, `low_carb`, `keto`, `high_protein`, `intermittent_fasting`, `vegetarian`, `vegan`, `mediterranean`, `dash`), budget tiers (`low`, `medium`, `high`), ingredient/group exclusions, and supported health conditions (including pregnancy/breastfeeding, `seniorMode`, `diabetes_t1`/`diabetes_t2`, `hypothyroid`, `celiac`, and `kidney` guardrails).
- **Reference-Backed Nutrient Provenance:** All planning ingredients map to verified reference profiles (`data/planning-library.json` version `0.6.0-data.5`, 100g edible basis, explicit household portion rules in [`planner-household.mjs`](planner-household.mjs)).
- **Bounded Quality-Guided Weekly Solver:** Deterministic multi-pass meal allocation, variety fallback within strict dietary/sodium/budget pools, and bounded swap repair toward `>=85%` protein and `±12%` energy targets without relaxing implemented safety boundaries (`>=80%` protein, `±15%` energy, DASH `<=1800 mg` sodium, safe floors `1500 M / 1200 F / 1800 Pregnant / 1600 Breastfeeding`).
- **Explicit Day Completion, Pantry, Grocery, Barcode & Fasting:** Supports logging planned meals at custom multipliers (`0.1..4`), gram-based and reference-serving ingredient entries, manual meals, pantry alternatives (`/v1/pantry/*`), grocery lists (`/v1/plans/{id}/grocery-list`), favorites, copy-meal, EAN barcode lookup/submit, and intermittent fasting / Ramadan mode.
- **Personalized Coaching Brief (`/v1/coaching/brief`) & Decision Memory:** Delivers structured, server-authored pure-English follow-up with stable `code`, `params`, and deterministic `actionTarget` across nutrition, training, hydration, and recovery for client-side KMM localization.
  - Remembers accepted and declined adaptations (calorie adjustments and recovery deloads) across subsequent reviews and everyday logging until new underlying data arrives or the active window expires.
  - Renewing a nutrition week after an accepted calorie adjustment generates the new week directly at the accepted calorie target while preserving prior plan snapshots in `plans`.
  - Distinguishes between lower-floor calorie holds, upper-ceiling holds, and ingredient/portion-fit bounds with canonical English explanations and reason codes.
  - Automated coaching is transparent: it never claims human clinical review, never treats missing logs as non-compliance, and never treats muscle soreness (DOMS) as proof of hypertrophy.

## Workout Prescription & Performance Logging

- **Bilingual Exercise Catalog:** 868 exercises derived from OpenExerciseDB (`data/exercises.json`) enriched with Arabic & English names, step-by-step instructions, common mistakes, and 69 Arabic muscle translations (`data/exercises-i18n.json`), preserving upstream attribution and license metadata.
- **Training Splits:** Full Body, Upper/Lower, Push/Pull/Legs, and Body-Part (Bro) splits (up to 7 days) tailored to available days, session duration, equipment, fitness level, `seniorMode`, pregnancy filters, and supported injury/joint restrictions (including `elbow_pain`).
- **Dual-Mode Logging & PR Engine:**
  - Supports `simple` and `pro` workout UI modes, ad-hoc bonus exercises, warmup set exclusion, optional weighted bodyweight (`+Added kg`), and personal records (`/v1/workouts/prs`) with assisted-exercise load inversion.
  - Automatic load-increase recommendations require repeated comparable working-set performance, target reps/RIR completion, and adequate recovery.
  - Accepting a recovery deload (`sessionAdjustment`) or Comeback Protocol (`comeback_restart`) reduces effective sets while keeping the base training program intact.
- **8-Week Full-Body Split Review:** Evaluates adherence, recovery, and available training days after 8 weeks from the first completed session before suggesting a split transition ([`split-review.mjs`](split-review.mjs)).

## Privacy, Account Erasure & API Contract

- **Privacy & Account Erasure Guarantees:** Deleting an account (`DELETE /v1/account/delete`) atomically clears the account namespace and any claimed anonymous namespaces within one database batch, and records tombstones so late or concurrent writes cannot resurrect deleted health data.
- **Uniform Response Envelope & KMM Error Catalog:**
  - `2xx`: `{ ok: true, data: T, meta: { requestId, serverTime, revision? } }`
  - `4xx`/`5xx`: `{ ok: false, error: { code, message, params, fieldErrors, retryable, details? }, meta: { requestId, serverTime } }` — 100% English error messages, machine-translatable via `contracts/error-codes.json`.

## Local Development

Requires **Node.js 24+**. Run from `E:\Egypt_Nutrition_Local\website\dist`:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run dev
```

Local preview runs at `http://127.0.0.1:8787`. Local tests use the `oai-authenticated-user-id` header only in local test harnesses; the public Cloudflare Worker entrypoint derives identity strictly from authenticated tokens/sessions. See [`contracts/openapi.yaml`](contracts/openapi.yaml) and [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md).

## Verification

```powershell
npm.cmd run check
npm.cmd run audit:matrix
npm.cmd run benchmark
```

## Deployment

Develop and verify on `dev` (Cloud Dev) first, then fast-forward merge `dev` -> `main` for Production:

```powershell
cd E:\Egypt_Nutrition_Local\website\dist
npm.cmd run check
npm.cmd run deploy:dev    # Cloud Dev (curafit-api-dev)
npm.cmd run deploy:prod   # Production (curafit-api)
```

For D1 SQL migrations (`drizzle/*.sql`):

```powershell
npm.cmd run deploy:d1:dev
npm.cmd run deploy:d1:prod
```

## Documentation & Contracts

- **AI & Developer Workflow (`dev` -> `main`):** [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) and [`AGENTS.md`](AGENTS.md)
- **Canonical Error Catalog & KMM Spec:** [`contracts/error-codes.json`](contracts/error-codes.json), [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md), [`contracts/openapi.yaml`](contracts/openapi.yaml), and [`docs/KMM_BACKEND_INTEGRATION.md`](docs/KMM_BACKEND_INTEGRATION.md)
- **Architecture, Safety & D1 Ops:** [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md), [`docs/DATA_SAFETY_AND_SOURCES.md`](docs/DATA_SAFETY_AND_SOURCES.md), [`docs/DB_MIGRATION_AND_RECOVERY.md`](docs/DB_MIGRATION_AND_RECOVERY.md), [`docs/SECURITY_PRIVACY_REVIEW.md`](docs/SECURITY_PRIVACY_REVIEW.md)
- **API Reference & Postman:** [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md), [`postman/`](postman) (generated via `npm.cmd run postman:generate`), and Published Docs: `https://documenter-api.postman.tech/view/9137216/2sBYPv2s1w`

## Data Sources & Licensing

Exercise data in `data/exercises.json` is derived from [OpenExerciseDB](https://github.com/rfivesix/OpenExerciseDB) under **CC BY-SA 4.0**, preserving upstream attribution and license metadata (pinned revision `202610112340`, text-only without media).

```powershell
python scripts/import-exercises.py
```

The importer halts if the pinned SHA-256 fingerprint changes. Nutrition reference profiles in `data/planning-library.json` and `data/details/*.json` retain their USDA FDC identifiers and SHA-256 digests.
