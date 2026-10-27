> Current development release: **0.13.0** — [persistent coaching agreements, feedback, API and deployment limits](docs/COACHING_JOURNEY_013_AR.md). This source version does not certify the deployed Worker version.

# Egypt Nutrition Coach (CuraFit)

Server-driven Arabic nutrition planning, workout prescription, and adaptive longitudinal coaching for weight, hydration, sleep, and recovery. All planning and coaching engines run deterministically on Cloudflare Workers and D1 with **zero runtime AI API calls**. Current package version: **0.12.0**.

## Canonical Hosting & Repository Contract

- **Live Production App:** [https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/#planner](https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/#planner)
- **Live 90-Day Interactive Simulation:** [https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/?simulation=1#planner](https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/?simulation=1#planner)
- **Git Repository:** [rabee-elkholy/egypt-nutrition-coach](https://github.com/rabee-elkholy/egypt-nutrition-coach) — **Branch: `main` only**
- **Working Directory:** `E:\Egypt_Nutrition_Local\website\dist`
- **Cloudflare Worker:** `egypt-nutrition-coach`
- **Cloudflare D1 Database:** `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab`, binding: `DB`)
- **Deployment Configuration:** [`wrangler.jsonc`](wrangler.jsonc), Worker entrypoint [`server/cloudflare-entry.mjs`](server/cloudflare-entry.mjs)

This is the single canonical hosting environment. Full repository and deployment rules are defined in [`AGENTS.md`](AGENTS.md).

## Nutrition Planning & Adaptive Follow-Up

- **Regional & Constraint-Aware Meal Plans:** Supports regional food availability (`egypt`, `levant`, `gulf`, `maghreb`), dietary patterns (`balanced`, `low_carb`, `keto`, `high_protein`, `intermittent_fasting`, `vegetarian`, `vegan`, `mediterranean`, `dash`), budget tiers (`low`, `medium`, `high`), ingredient/group exclusions, and supported health conditions.
- **Reference-Backed Nutrient Provenance:** All planning ingredients map to verified reference profiles (`data/planning-library.json` version `0.6.0-data.5`, 100g edible basis, explicit household portion rules in [`planner-household.mjs`](planner-household.mjs)).
- **Bounded Quality-Guided Weekly Solver:** Deterministic multi-pass meal allocation, variety fallback within strict dietary/sodium/budget pools, and bounded swap repair toward `>=85%` protein and `±12%` energy targets without relaxing implemented safety boundaries (`>=80%` protein, `±15%` energy, DASH `<=1800 mg` sodium).
- **Explicit Day Completion & Meal Alternatives:** Supports logging planned meals at custom multipliers, gram-based ingredient entries, and manual meals. Logging food or reaching a calorie percentage never auto-closes a day; explicit day confirmation is required. Meal replacements honor the active diet and exclusion rules while keeping plan-version history immutable and separate from the food diary.
- **Personalized Coaching Brief (`/v1/coaching/brief`) & Decision Memory:** Delivers structured, server-authored Arabic follow-up across nutrition, training, hydration, and recovery.
  - Remembers accepted and declined adaptations (calorie adjustments and recovery deloads) across subsequent reviews and everyday logging (water, meals, workouts, weight) until new underlying data arrives or the active window expires.
  - Renewing a nutrition week after an accepted calorie adjustment generates the new week directly at the accepted calorie target while preserving prior plan snapshots in `plans`.
  - Distinguishes between lower-floor calorie holds, upper-ceiling holds, and ingredient/portion-fit bounds with accurate Arabic explanations.
  - Automated coaching is transparent: it never claims human clinical review, never treats missing logs as non-compliance, and never treats muscle soreness (DOMS) as proof of hypertrophy.

## Workout Prescription & Performance Logging

- **Exercise Catalog:** 868 exercises derived from OpenExerciseDB with muscle groups, equipment requirements, movement patterns, English execution notes, and source license metadata.
- **Training Splits:** Full Body, Upper/Lower, Push/Pull/Legs, and Body-Part (Bro) splits tailored to available days, session duration, equipment, fitness level, and supported injury/joint restrictions.
- **Bodyweight vs. Weighted Logging Rules:**
  - Bodyweight and non-kilogram resistance exercises log sets, reps, and RPE **without a weight input field or `0 kg` label** on the workout card. Assisted machines display assistance weight where applicable.
  - External load inputs are read-only display fields controlled by **2.5 kg** increment/decrement buttons within field bounds.
- **Progression & Deloads:**
  - Automatic load-increase recommendations require repeated comparable performance, target reps/RPE completion, and adequate recovery.
  - Accepting a recovery deload (`sessionAdjustment`) reduces effective sets (e.g., `0.65x` set factor) while keeping the base training program intact.
- **Draft Persistence & Unilateral Tracking:** Preserves set drafts across tab navigation, updates existing same-day session logs in place instead of duplicating sessions, requires both sides for unilateral exercises, and never fabricates session duration or RPE when omitted.
- **8-Week Full-Body Split Review:** Evaluates adherence, recovery, and available training days after 8 weeks from the first completed session before suggesting a split transition ([`split-review.mjs`](split-review.mjs)).

## Interactive 90-Day Simulation & Longitudinal Audit Harness

- **Interactive Browser Simulation (`?simulation=1#planner`):** Uses the exact production command engine with an isolated virtual clock and separate storage namespace (`__simulation__`). Users can run preset personas or clone their own profile across up to 90 simulated days.
- **Privacy & Account Erasure Guarantees:** Deleting an account (`POST /v1/account/delete`) atomically erases both the primary account and its `__simulation__` namespace (plus any linked legacy anonymous claim sources) and records tombstones so late or concurrent writes cannot resurrect deleted health data.
- **Longitudinal HTTP + D1 Audit Suite (`scripts/cohort/*`, `scripts/audit/*`):**
  - End-to-end Miniflare Worker + D1 SQLite execution with full HTTP request/response journaling, SHA-256 manifest verification, D1 table export, plan-transition auditing, and factual verification of generated coaching notes.
  - Extended multi-month (`180-day` and `365-day`) longitudinal harnesses covering adherence plateaus, relapses, goal transitions, repeated accept/decline decision chains, and return-after-absence flows.

## Local Development

Requires **Node.js 24+** (Python 3 is only required when re-importing the exercise catalog or running standalone ZIP archive verifiers).

Run from `E:\Egypt_Nutrition_Local\website\dist`:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run dev
```

Local preview runs at `http://127.0.0.1:8787`. Local tests use the `oai-authenticated-user-id` test header only in local/test harnesses; the public Cloudflare Worker entrypoint strips client-supplied internal identity headers and derives identity strictly from authenticated tokens/sessions. See [`docs/KMM_BACKEND_INTEGRATION.md`](docs/KMM_BACKEND_INTEGRATION.md) and [`contracts/openapi.yaml`](contracts/openapi.yaml).

## Verification & Latest Audit Status

Keep the local dev server running in a separate terminal when executing browser checks:

```powershell
npm.cmd run check
node scripts/test-stress.mjs
node scripts/cohort/stress.mjs --output=reports/simulation-100-users-90-days/stress-check
npm.cmd run test:browser
```

Latest verified engineering audit (**October 26, 2026**):

- **`npm.cmd run check`:** **276 passing tests** (`0` failed, `0` skipped), covering build verification, API contracts, D1 persistence, idempotency, optimistic concurrency (`409`), account/simulation erasure, follow-up decision memory, and nutrition/workout invariants.
- **100-Persona Initial Onboarding Coverage:** **100 / 100** cohort personas succeed over HTTP (`300` requests, `0` rejections, up from `82 / 100` prior to planner search, variety fallback, and reference food coverage repairs), with **0** strict protein (`<85%`) or energy (`>±12%`) gap days.
- **Paired Archived-Plans Solver Replay:** **1,268 / 1,268** unique archived cohort plans (`8,876` plan days) succeed with **0** strict protein-gap days (`245 -> 0`) and **0** strict energy-gap days (`34 -> 0`), and zero support or quality regressions.
- **Longitudinal Adaptive Simulations:**
  - `100 users × 90 days` HTTP + D1 cohort (`9,000` distinct user-dates, `34,794` HTTP operations, `0` `5xx` errors, `8,160` fact-checked coaching notes, `1,372` verified nutrition transitions, `216` verified workout prescriptions).
  - Targeted `90-day` HTTP + D1 journeys for all newly supported coverage personas, `266-day` progress/decision trajectories, `180-day` extended horizons, and `2 × 365-day` annual adaptive journeys (`3,168` HTTP requests, `2,190` coaching notes).
- **Stress Suites:** Domain stress `20 / 20` passing; HTTP stress `31 PASS / 0 FAIL / 1 NOT_TESTED`.

> **Scope Note:** Automated simulation and local Worker/D1 benchmarks verify deterministic backend logic, persistence integrity, and factual consistency of generated messages. Native mobile push-notification delivery/rendering, production edge capacity SLAs, external identity-provider lifecycle, and human clinical/UX evaluation remain separate operational gates documented in [`docs/production-readiness/CURRENT_STATE_AUDIT.md`](docs/production-readiness/CURRENT_STATE_AUDIT.md).

## Deployment

All commits, pushes, and deployments run from `E:\Egypt_Nutrition_Local\website\dist` on `main` targeting the canonical Cloudflare Worker and D1 database:

```powershell
cd E:\Egypt_Nutrition_Local\website\dist
git checkout main
git pull --ff-only origin main
npm.cmd run check
npm.cmd run deploy
git add <selected-files>
git commit -m "Describe the change"
git push origin main
```

When new D1 SQL migrations are introduced, apply them to the canonical D1 database before deploying code that depends on them:

```powershell
npm.cmd run deploy:d1
```

Stop any running local preview server on Windows before rebuilding or deploying if `dist/client` files are locked.

## Documentation & Contracts

- **Production-Readiness Audit & Evidence Register:** [`docs/production-readiness/CURRENT_STATE_AUDIT.md`](docs/production-readiness/CURRENT_STATE_AUDIT.md), [`docs/production-readiness/PROGRESS.md`](docs/production-readiness/PROGRESS.md), [`docs/production-readiness/FINDINGS_REGISTER.md`](docs/production-readiness/FINDINGS_REGISTER.md)
- **Planner & Follow-Up Repair Reports:** [`docs/production-readiness/PLANNER_SEARCH_REPAIR.md`](docs/production-readiness/PLANNER_SEARCH_REPAIR.md), [`docs/production-readiness/PLANNER_VARIETY_REPAIR.md`](docs/production-readiness/PLANNER_VARIETY_REPAIR.md), [`docs/production-readiness/NUTRITION_QUALITY_REPAIR.md`](docs/production-readiness/NUTRITION_QUALITY_REPAIR.md), [`docs/production-readiness/FOLLOWUP_QUALITY.md`](docs/production-readiness/FOLLOWUP_QUALITY.md)
- **OpenAPI Specification & KMM Integration:** [`contracts/openapi.yaml`](contracts/openapi.yaml), [`docs/API.md`](docs/API.md), [`docs/KMM_BACKEND_INTEGRATION.md`](docs/KMM_BACKEND_INTEGRATION.md), [`docs/production-readiness/KMM_INTEGRATION_GUIDE.md`](docs/production-readiness/KMM_INTEGRATION_GUIDE.md)
- **Architecture, Database & Security:** [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md), [`docs/DB_MIGRATION_AND_RECOVERY.md`](docs/DB_MIGRATION_AND_RECOVERY.md), [`docs/DATA_SAFETY_AND_SOURCES.md`](docs/DATA_SAFETY_AND_SOURCES.md), [`docs/SECURITY_PRIVACY_REVIEW.md`](docs/SECURITY_PRIVACY_REVIEW.md)

## Data Sources & Licensing

Exercise data in `data/exercises.json` is derived from [OpenExerciseDB](https://github.com/rfivesix/OpenExerciseDB) under **CC BY-SA 4.0**, preserving upstream attribution and license metadata (pinned revision `202610112340`, text-only without media).

```powershell
python scripts/import-exercises.py
```

The importer halts if the pinned SHA-256 fingerprint changes. Nutrition reference profiles in `data/planning-library.json` and `data/details/*.json` retain their USDA FDC identifiers and SHA-256 digests.
