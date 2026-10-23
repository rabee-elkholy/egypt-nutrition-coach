# Coaching preview 0.7

The original onboarding module is unchanged. `app.mjs` mounts `coaching-ui.mjs` after loading the food browser. The existing food browser and sources remain available. No production AI calls are made.

## Runtime and storage

Cloudflare Worker HTTP API + D1, provisioned by Sites. Sites dispatch supplies `oai-authenticated-user-id`; never trust the onboarding's simulated email/login fields as authentication. Account IDs partition both state and idempotency records. JSON domain state is versioned with optimistic compare-and-swap in a D1 transaction. This preview uses one aggregate per user with a 1.5 MB limit, not the final normalized PostgreSQL data model. Export is available in the UI. PostgreSQL migration will require a storage adapter and data migration; engines don't depend on D1.

`GET /v1/state` returns account state, revision, and current recovery. `POST /v1/commands` accepts `{revision, action, payload}` and requires `Idempotency-Key`. Actions: generate, food, weight, workout, recovery, review, adaptation. Conflicts return 409. `GET /v1/exercises?q=&muscle=&offset=` returns 30 catalog entries; `GET /v1/catalog/manifest` provides source provenance. `GET /v1/health` is unauthenticated. KMM may consume the domain contract, but its independent mobile authentication adapter is not part of this Sites preview.

## Rules and limits

General healthy adults, 18–70. Known disease, pregnancy/lactation or reported injury requires specialist review rather than automatic clinical prescriptions. Mifflin–St Jeor energy estimation and existing regional food constraints are retained. No thyroid percentage multipliers. No automatic relaxation of exclusions/budget. Training weekdays match actual calendar dates, and no meal is assumed to be before/after a workout without a workout time.

All 868 active source exercises with English descriptions and primary muscles are imported with source SHA verification. Source author/license/AI translation status are preserved; `source_only` is not human clinical review. No media is included. Home prescriptions require every listed primary/setup equipment item. Missing movements remain explicit. Beginner/intermediate repetitions use 8–12 with 2–3 RIR and 120-second rest as conservative product defaults, not universal optimal prescriptions. Full body, upper/lower, and PPL are supported; bro split currently falls back explicitly to full body. Advanced individualized periodization is not implemented.

Recovery check-ins expire after 24 hours. Sleep <6 hours or quality <=2 count as one domain; fatigue/stress >=4 and soreness >=7 add domains. Two domains suggest 20% fewer sets, three suggest 40%, with acceptance and a 24-hour expiry. New pain/illness blocks progression. Red flags advise stopping and urgent assessment. No calorie reduction from missed exercise or fatigue. Seven reports are the baseline coverage threshold; rolling individual baselines and region-specific soreness are still future work.

Double progression requires two different dates, identical load, every set reaching top reps and target RIR, no pain, fresh ready recovery and a known equipment increment <=5%. Assisted loads move downward. The suggested next load is shown without rewriting historical logs.

Calorie review requires 3 weights in each of two weeks, 10 complete food days with >=80% adherence, and >=14 days after the last accepted energy change. Weekly change targets are conservative product heuristics (loss 0.25–1%, gain 0.1–0.5%). Adjustment is <=5% and <=150 kcal, accepted explicitly. Adjusted meals and targets form a new version; past logged consumption remains unchanged. There is no scheduled job: review runs when requested. Daily food logging is totals/completeness, not a full meal-by-meal diary yet.

## Verification / operation

`npm ci`, `npm run build`, `npm test`. `npm run dev` runs a local Worker/D1 preview; local testing uses an explicit identity header. Production identity is dispatch-owned. Schema-only migrations and Drizzle metadata are committed. No schema DDL runs on requests.

Catalog reimport: `python scripts/import-exercises.py`; a changed upstream checksum fails closed and requires reviewed repinning. Catalog license: https://creativecommons.org/licenses/by-sa/4.0/ ; per-record upstream licenses/author are retained in the JSON and exposed in the catalog UI. Adapted exercise data must retain applicable attribution and share-alike terms.

Remaining before a public clinical-grade/mobile launch: independent scientific review and product validation, mobile auth, normalized storage/event synchronization, structured food-item logs/replacements, muscle-specific recovery baseline, more robust exercise review/injury workflow, scheduling, operational rate limits/monitoring, retention/deletion controls and broader browser/device testing. This is a testable preview, not completion of every item in the long-term plan.
