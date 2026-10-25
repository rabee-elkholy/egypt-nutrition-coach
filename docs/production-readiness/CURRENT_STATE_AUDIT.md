# CuraFit current-state audit — 2026-10-24

Initial HEAD: `2720fe150fa63862e3a0a9d0002f88b8fdb14831`, branch `main`, Node v24.14.0 / npm 11.9.0, Windows x64. `git fetch origin main` failed: could not resolve github.com. A later read-only connected GitHub comparison verified remote main identical to that initial HEAD; evidence/remote-main-verification.json preserves the response. No remote production mutation, push or deployment was performed.

The initial working tree contained uncommitted simulator/evaluator fixes, a production meal-alternative alias, changed historical reports, untracked tests, audit scripts and reports. Initial patch and touched-file copies are preserved outside Git at `E:/Egypt_Nutrition_Local/audit-backups/2026-10-24-initial/`. Execution records include actual source hashes and dirty-tree status; a HEAD alone cannot reproduce that initial working tree.

## Evidence matrix

| Capability or claim | Status | Actual evidence / limit |
|---|---|---|
| Delivered run identity | VERIFIED | ZIP run-1792850501931; SHA-256 a816892fed9069759bd5cbdeabe50c5d236f6fe153b7eb9b3dff58ded8db1d78 |
| Delivered 100 users / 9,000 days / 51,267 operations | VERIFIED | Independently decoded embedded dashboard; evidence/delivered-archive.json |
| Delivered run is HTTP/D1 integration | FAILED | Zero numeric HTTP statuses and zero HTTP request envelopes. Matches scripts/run-full-simulation.mjs and simulation/engine-runner.mjs |
| Delivered manifest is complete | FAILED | 19 files; 1,518 manifest entries; 1,508 missing; additional narrative reports unlisted |
| Repetition approximately 42% | FAILED | Dashboard and separate local raw JSONL both give 62.2857109008% mean per user; pooled rate 84.1465268278% is a different denominator |
| New run meal replacements | VERIFIED | Local raw journal: 1,710 successes / 1,710 attempts. Historical behavior evidence only |
| New run active nutrition IDs have snapshots | VERIFIED | Raw JSONL reference-membership audit finds zero missing; does not establish every transition's justification |
| Previous run missing snapshots | VERIFIED | Raw audit finds 87 affected users |
| 188 tests | VERIFIED | Baseline npm run check: 188 pass, zero fail/skip; includes 11 evaluator controls and four cohort-harness tests, not 188 independent backend cases plus those suites |
| 11 negative controls | VERIFIED | Separate actual TAP execution; controls do not include several cases claimed in the old TEST_REPORT.md |
| 20 fast stress cases | VERIFIED | 20 pass in recorded current source execution; scope is domain engine |
| 32 meaningful HTTP stress passes | FAILED | Reproduced historical script output 32/32, but one case dispatches no request. Corrected output: 31 PASS, 0 FAIL, 1 NOT_TESTED |
| JWT, revocation, public edge, tenant isolation | PARTIALLY_IMPLEMENTED | Local E2E/API tests verify finite cases; cohort bypasses public edge/JWT via harness-only identity wrapper |
| Distributed rate limiting | PARTIALLY_IMPLEMENTED | server/auth.mjs uses an in-memory Map, per isolate; burst unit coverage is not a globally enforced quota |
| Provider login/refresh | MISSING | No POST /v1/auth/refresh; verified-token adapter exists; production identity-provider lifecycle remains unverified |
| OpenAPI | PARTIALLY_IMPLEMENTED | contracts/openapi.yaml structurally validated by E15; broad object responses and command payloads remain insufficient as exhaustive KMM contracts |
| Scheduled encrypted backups / external monitoring | MISSING | Claimed backup-d1.mjs absent; no deployment evidence for proposed R2 backup or five-region monitors |
| Restore readiness | PARTIALLY_IMPLEMENTED | Local logical restore verified 14 schemas, synthetic rows, encryption tamper rejection, migration rerun and HTTP readback; production backup/key custody/recovery remain unverified |
| 1,000 beta users / 100,000 capacity / sub-50ms regional mobile latency | FAILED | Unsupported extrapolations from local in-process observations; no measured production/mobile load evidence |
| Message rendering / reading | NOT_MEASURED | On-demand backend notes verified against actual HTTP; generated raw messages remain NOT_MEASURED for rendering/delivery |
| Country / experience / medical diversity | PARTIALLY_IMPLEMENTED | Actual experience 52 beginner/36 intermediate/12 advanced; region 80 Egypt/20 Gulf. Specific country absent for 100; medical fields populated; 14 male-persona grammatical occupation mismatches |
| Local HTTP/D1 pilot | VERIFIED | 5 users × 14 days, 276 operations, 2 deliberate invalid requests, 70 day bundles; stricter verifier passed |
| Journal recovery | VERIFIED | Injected interruption after response journal write; resumed checkpoint/memory/sequence exactly match independent control for one user × 14 days |
| Commercial release | BLOCKED | See PRODUCTION_GATES.md; no unverified capability is declared production-ready |

## Changes since previous simulation

Git log contains the original simulation harness in af10f11 and report edits in db64820. The candidate fixes responsible for the new run were still uncommitted at initial inspection. Their diff repairs templateId payload selection, pain-region mapping, rest-day selection, replaced exercise IDs, weekly snapshots, finite medical checks, N/A scoring and exception handling. The new artifacts alone do not tie those changes to their claimed hard-coded f23b9f6 provenance. Focused local commits and source hashes now provide the audit trail for this work.

The HTTP/D1 harness at scripts/cohort/run.mjs is the authoritative integration candidate. The separate sim:fast runner remains useful for domain tests and must retain its IN_PROCESS_DOMAIN_ENGINE label. Full-run results will be recorded in SIMULATION_AUDIT.md; a pilot does not satisfy the final 100×90 gate.

The earlier frozen baseline completed 9,000 records / 31,048 HTTP operations but FAILED calendar acceptance (7,398 unique user-dates). It remains preserved with its original source and diagnostic verdict. Its complete raw/reports ZIPs independently verify 10,630 / 682 files.

The corrected full run at d86f3a8 now passes source/artifact and independent calendar checks: 9,000 distinct user-dates / 31,266 HTTP operations, no 5xx. Onboarding is 82 successful / 18 rejected. All 7,311 actual brief notes pass selected factual rules, 1,225 nutrition snapshots/transitions match actual D1, and 192 canonical workout prescriptions / 28 transitions match the complete logical export (70,101 rows / 14 tables). Latest build/data check and Node suite: 231 pass, zero fail/skip. Actual fetch and ff-only pull also succeeded on 2026-10-25, six local commits ahead / zero behind at that checkpoint. See CURRENT_RUN_RESULTS.md for complete provenance and open product/release gates. All changes remain local.

Subsequent source checkpoint: the bounded planner-repair fix reproduces and resolves user-089's original rejected seed without relaxing preferences or bounds. Latest Node check is **235 pass**, zero fail/skip. Exact initial HTTP replay of all 100 profiles gives **83 successful / 17 rejected**, zero regressions among the previously supported 82. The d86f3a8 full archives remain a separate earlier input set; no full 100×90 rerun of this later planner change is claimed. See PLANNER_SEARCH_REPAIR.md.

Latest source checkpoint: an additional variety-pool fix restores compliant options hidden by nonrepetition preferences, retaining the same nutrient checks. Latest Node check: **239 pass**, zero fail/skip. Exact initial HTTP replay now supports **92 / 100**, with eight remaining rejections and no regressions among the earlier 83. The c63009e user-089 replay also passes 90 days / 317 HTTP events, 72-note factual audit and 15 persisted nutrition transitions. New DASH/medical-context longitudinal checks remain separate from the earlier full archive. See PLANNER_VARIETY_REPAIR.md.

Final validation at this checkpoint: **241 Node tests pass, zero fail/skip** after adding two independent DASH stress-oracle controls. The three targeted 743cebd trajectories pass 270 days / 881 HTTP events / 189 factual-note checks / 44 persisted nutrition transitions. Post-planner HTTP stress passes 31 with zero failures and one NOT_TESTED; domain stress is 20/20 after replacing an obsolete rejection expectation with a stronger successful-plan measured-sodium invariant. The initial 19/20 failure is retained. The full ZIP pair remains the earlier d86f3a8 source; latest source/product gates are still NOT_READY.
