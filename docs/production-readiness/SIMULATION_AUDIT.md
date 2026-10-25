# Simulation authority and evidence

`sim:fast` calls scripts/run-full-simulation.mjs -> simulation/engine-runner.mjs -> domain functions in process. Its operation names, string statuses, counts, seed, old hard-coded commit and dashboard layout identify the delivered run. It never establishes HTTP/D1 integration.

`sim:100:90` calls scripts/cohort/run.mjs -> Miniflare dispatchFetch -> harness-only local-worker.mjs -> real server/worker.mjs -> migrated local D1. It uses real Request/Response parsing, status codes, validation, idempotency, revisions and D1 transactions. The clock and trusted identity are local test adapters; public edge stripping, cookie issuance, JWT and mobile transport require separate tests. Its latency provenance is LOCAL_MINIFLARE_DISPATCH_WITH_D1, not real socket HTTP or mobile latency.

Separate pilots existed before this audit, including 5×14 days. They do not establish a complete earlier 100×90 HTTP/D1 execution. The directory named curafit-authoritative-v1 contains the FAST format and is misleadingly named.

Fresh audit pilot: 5 users × 14 days = 70 days; 276 operations; two expected invalid-water submissions. All stricter structural checks and every manifest-listed hash pass. Independent quality evaluation records seven protein-target-gap user-days; this remains an investigation, not a simulator success assertion.

New raw requests include URL, method, body, synthetic identity headers, idempotency key, response body/hash, request ID, numeric status, latency provenance and expected rejection context. Hidden facts remain in truth/behavior records; only explicit observed user actions enter request payloads. Generated does not mean delivered/rendered/read/actioned.

Archive verification:

```powershell
python scripts/audit/archive-evidence.py verify <raw.zip>
python scripts/audit/archive-evidence.py verify <reports.zip>
```

Each archive inventories only its own files. Required day bundles and per-user journals are derived from config/cohort, so deleting a day and removing its inventory entry still fails. Seven archive negative controls pass. Schema v2 additionally verifies all logical D1 tables/row counts/hashes and the exact compressed runtime. Integrity verification does not establish clinical correctness or cryptographic authenticity against an attacker who rewrites all artifacts.

## Frozen diagnostic full run

`audit-authoritative-100x90-20261024` completed 100 personas, 9,000 daily records and 31,048 HTTP operations. Statuses: 30,770 HTTP 200; 278 HTTP 400; no HTTP 5xx. Of the rejections, 256 are expected invalid-water controls and 22 require product review. Onboarding succeeded for 82 and failed for 18. The original source and exact runtime are preserved; source verification passes against those frozen inputs, not the later release.

An independent temporal audit FAILED this run: 18 rejected-onboarding personas repeated day one's date. Only 7,398 distinct user-dates exist; 1,602 dates mismatch the preregistered calendar and 1,602 duplicate dates were detected. Therefore 9,000 records cannot be represented as a valid completed 100×90 temporal acceptance gate. Calendar progression is fixed. A targeted 90-day replay of user-006 now passes, preserving the original failed baseline.

All 1,236 nutrition snapshots/transitions matched persisted D1; zero transition audit failures. A complete export contains 80,747 rows across 14 tables. A failed simultaneous database audit is retained; exclusive retry passed. All 58 original P0 food flags were shrimp falsely categorized as a fish-only taste exclusion. The public preference contract separates fish and shellfish; three controls verify the corrected evaluator and preserve actual exclusion detection. Separate re-evaluation records zero P0 under these finite rules. It does not clear the calendar failure or establish clinical safety. Strict protein-gap observations remain on 208 user-days, energy-gap observations on seven, and constrained movement coverage remains limited.

## Actual backend follow-up evidence

The old extractor counted repeated frontend message observations from many state-bearing responses; these were never delivered notifications. New configuration `messageEvidence: BACKEND_BRIEF_API` records notes from GET /v1/coaching/brief only when an onboarded persona opens the app. A 5×14 pilot passes strict verification with 282 HTTP events and 75 actual notes. Behavior memory now receives fetched notes; absent users receive no synthetic fetched briefs. Source copies are automatically frozen before execution, with archived reports excluded from the next run's input provenance.

A fresh corrected full run now completes at audit-current-followup-100x90-20261025: 100 personas, 9,000 records and 9,000 unique user-dates, 31,266 HTTP operations. Source/artifact and temporal verification pass. HTTP statuses are 31,025 × 200 and 241 × 400, with no 5xx. The latter comprise 220 preregistered invalid-water controls, 18 onboarding coverage failures, two empty-diary closures and one stale reschedule acceptance. Onboarding remains 82 successful / 18 failed.

The factual auditor checks all 7,311 notes from 2,437 actual brief views with zero selected-rule failures. Persisted audits pass for all 1,225 nutrition snapshots/transitions and 192 canonical workout prescriptions / 28 workout transitions. Complete logical export: 70,101 rows across 14 tables. The old frozen baseline and a deliberately interrupted 1,808-user-day attempt remain separate; neither is substituted for this corrected result.

Mean per-user exact-text repetition is 17.1059% among 82 users with notes; pooled repetition is 59.6225%. Sampling/behavior feedback differ from the old frontend extractor, so these are not a controlled improvement percentage or human-experience score. Delivery/rendering/reading remain NOT_MEASURED. Current strict observations: 235 protein-gap days, five energy-gap days, and 5,760 constrained-movement-coverage days. No clinical safety claim follows from zero P0 observations under the finite rules.

The cohort uses the combined nutrition/workout track and advances via simulation_next. Separate finite service-track and normal-route tests do not turn it into an end-to-end mobile or ordinary production-clock 100×90 journey. See CURRENT_RUN_RESULTS.md, FOLLOWUP_QUALITY.md and ONBOARDING_COVERAGE.md for scope and next product work.
