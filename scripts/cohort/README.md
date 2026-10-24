# Independent 100-user / 90-day evaluation

Run in `E:\Egypt_Nutrition_Local\website\dist` on `main`. No deployment, production database, notifications, billing or external inference services are involved.

```powershell
npm.cmd run check
npm.cmd run sim:100:90 -- --users=5 --days=14 --seed=egypt-100x90-v1 --output=reports/simulation-100-users-90-days/pilot-v2
npm.cmd run sim:100:90 -- --users=100 --days=90 --seed=egypt-100x90-v1 --output=reports/simulation-100-users-90-days/baseline-v1
npm.cmd run sim:verify -- --output=reports/simulation-100-users-90-days/baseline-v1
npm.cmd run sim:stress -- --output=reports/simulation-100-users-90-days/baseline-v1
npm.cmd run sim:browser -- --output=reports/simulation-100-users-90-days/baseline-v1
npm.cmd run sim:report -- --output=reports/simulation-100-users-90-days/baseline-v1
npm.cmd run sim:serve -- --output=reports/simulation-100-users-90-days/baseline-v1
```

Open the localhost address printed by `sim:serve`. The explorer is an offline local artifact; it uses no CDN, fonts or external services. The tiny local server is necessary because browsers generally block file-URL fetches. Stop with Ctrl+C.

## Architecture and trust boundary

* `personas.mjs`: independently constructs 100 unique numeric/behavioral profiles using a seeded PRNG. The 80/20 split is frozen before any outcomes. All four supported goals, nine diets, four regions, budgets, sexes, levels, supported stable conditions, injuries and equipment vary. General fitness maps to maintenance; recomposition uses the application's existing same-weight muscle goal. Real allergies and unsupported clinical conditions are excluded from the primary cohort.
* `behavior.mjs`: autoregressive stress, fatigue, motivation, persistent travel/illness/absence/plateau episodes and previous-message/outcome memory. Food preferences and time burden affect adherence. Weight evolution is hypothetical, not a physiological predictor. Most properties are probabilistic and jointly affect logging/exercise. No future days are precomputed.
* `run.mjs`: actual HTTP generation, eligibility, `simulation_reset(source=current)`, actual validated logging/review/accept/reject/replacement/rescheduling/timezone/generation commands, `simulation_next`, and GET reload through `server/worker.mjs`. Never uses `simulation_fill`. Every command is saved through production `saveAccount` into migrated local D1.
* `local-worker.mjs`: harness-only deterministic UUID/time provider, per serialized request. UUIDs retain UUID format. This wrapper is separately bundled under the output folder, never used in production builds. Request clock uses the fixed start date; the application's existing simulation clock determines simulated local days. Rate limits are raised via the existing configuration to avoid measuring test-run speed as human request abuse. Rate-limit protection is therefore outside primary-run coverage.
* `evaluate.mjs`: imports no application calculation/validation/recovery modules. Independently multiplies grams and reference nutrients, checks NULL propagation, configured exclusions, diet restrictions, equipment, injury movement/name exclusions, session time, missing plan days, future records, identity leakage and specified adaptation gates. It does not claim exhaustive clinical safety or semantic correctness of every sentence.
* `messages.mjs`: calls actual `personalBrief`, `dailyTips`, and `splitReview` frontend functions and saves exact server guidance strings from every full response. DOM verification is separately performed by mounting the real frontend against captured state. Generated/eligible/visible are distinct.
* `report.mjs`: deterministic data-derived aggregation and Arabic individual/cohort reports. No LLM is invoked to produce journeys, results or replacement messages.

Ground truth is written to day bundles and `ground_truth.jsonl`. The adapter sends only explicit user-observed payloads. Missing values are not filled. A false self-report of food completion can occur; that is a user report and the hidden truth remains separate. Late entries are entered as catalog ingredient estimates, not an invented fully documented copy of an old whole meal. Source values retain their source labels and NULLs.

## Durability and replay

Each user has a separate authenticated identity and simulation account in local D1. Each day has an append-only in-progress request journal; completed days are atomically compressed into `users/user-NNN/days/DDD.json.gz`. These contain every full original response and the final GET state. The next-day checkpoint is atomically replaced. On interruption `--resume` replays the cached request journal; a request interrupted after D1 commit uses its original idempotency key. Existing committed days are not rewritten. `--from-day=N` requires N to be the next uncommitted day, so it cannot inject future state into earlier days.

```powershell
npm.cmd run sim:100:90 -- --resume --users=100 --days=90 --output=reports/simulation-100-users-90-days/baseline-v1
npm.cmd run sim:100:90 -- --users=100 --days=90 --user-id=42 --output=reports/simulation-100-users-90-days/replay-user42
npm.cmd run sim:compare -- --left=reports/simulation-100-users-90-days/baseline-v1 --right=reports/simulation-100-users-90-days/replay-user42
```

To investigate days 30–40, replay that user from day 1 into a **new** output directory with `--days=40`; use the explorer to select the interval. This preserves causal history. `--user-id=user-042` and `--user-id=42` both work. Replaying a subset intentionally leaves other users unexecuted and verification reports that incompleteness. Config mismatch or changed engine hashes prevents accidental baseline resume.

Logical comparison excludes measured latency, run timestamps and request-body sizes from timing diagnostics; original response bodies, profile choices, decisions and day truth must otherwise match. Node version is part of manifest. The harness itself and engine/data files are fingerprinted. Identical seed alone cannot guarantee identical results across changed harness/data/Node versions.

## Metrics and evaluation policy

No composite quality score is used. Safety, execution completeness, generation coverage and experience are separate gates. Nutrition plan fingerprints sort ingredients/meals/days so reordering does not count as variety. Quantified-plan and ingredient-composition fingerprints are distinct. Workout signatures use exercises and sets/reps/RIR, ignoring names and IDs of the enclosing plan. Missing coverage, repetitions and refusals remain in denominators. P10/P90 use the floor index of the sorted finite values, means omit NULL values and record finite sample counts. Local p50/p95/p99 include serialization and instrumentation and are not production load-test results.

Nutrition energy fit >12% deviation or protein below 85% of target are product audit thresholds, not clinical treatment standards. Ingredient sums allow max(0.15 units, 0.1%) rounding tolerance. Macronutrient energy is not re-derived with 4/4/9 because regional reference definitions differ. Injury checks independently encode the repository's declared conservative policy; clinical suitability beyond that policy is unknown. Equipment verification requires every declared item. Safety P0 findings prevent a favorable safety gate. Unsupported/clinical rejections are separately classified and do not automatically mean unsafe handling.

Raw plan versions retain actual engine identifiers plus content SHA-256, including in-place suggestion changes. `all_plans.jsonl` counts snapshots; distinct canonical plan IDs are separately reported per user. Day files point to original plan versions instead of duplicating entire weeks. API events include request inputs, response digest, measured latency, status, request ID and raw bundle reference. The compressed bundle is the authoritative full response when compact derived event fields omit unchanged account data. Rejected commands are preserved.

## Limitations requiring human follow-up

Synthetic behavior distributions are not calibrated to real users. Hidden weight and strength are not clinical outcomes. Message repetition can be appropriate. Exhaustive semantic contradiction detection, clinical appropriateness for all stable conditions, real notifications, multi-device real-network behavior, production latency and real-user satisfaction require additional review. DOM checks cover selected recorded states, not all 9,000 days. No message is marked rendered without a visible DOM match.
