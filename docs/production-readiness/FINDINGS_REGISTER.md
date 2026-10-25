# Findings register

Machine-readable details: [findings.json](findings.json). Historical reports remain preserved as untrusted baseline artifacts. This directory supersedes their release verdicts; it does not retrospectively alter their evidence.

| ID | Priority | Finding | Phase status |
|---|---|---|---|
| EVID-001 | P0 | Fast simulation represented as authoritative HTTP/D1 evidence | Fixed labeling; corrected Worker/D1 100×90 source/calendar checks pass; public edge/mobile remain separate scopes |
| EVID-002 | P0 | Hard-coded source commit and baseline test counts | Fixed for new runs; source hashes captured |
| EVID-003 | P0 | Every-tenth-file hashing and false byte-level verification claim | Fixed, regression tested |
| EVID-004 | P0 | Incomplete ZIP / inaccurate manifest | Complete frozen diagnostic raw/reports archives independently verify 10,630 / 682 files; their failed calendar acceptance remains explicit |
| EVID-005 | P0 | False rendering evidence and contradictory limitations | New output uses GENERATED / NOT_MEASURED, null visibleAt; historical claim invalidated |
| EVAL-001 | P0 | No-dispatch stress case auto-passes | Fixed: NOT_TESTED, excluded from PASS |
| EVAL-002 | P0 | Missing plan snapshot did not fail evidence gate | Fixed, regression tested |
| EVAL-003 | P1 | Sessions counted by exercise records or repeated commands | Fixed occurrence deduplication, regression tested |
| REPORT-001 | P1 | Hard-coded 42% repetition | New reports share canonical measured metric; baseline recomputed 62.2857% |
| REPORT-002 | P1 | Diversity schema mismatch / persona inconsistency | Actual fields evaluated; 14 grammatical issues retained as findings |
| OPS-001 | P1 | Claimed encrypted backup scheduler / monitors unsupported | MISSING; implementation and drill required |
| AUTH-001 | P1 | Production login/refresh lifecycle not established | MISSING endpoint; identity-provider decision and lifecycle verification required |
| AUTH-002 | P1 | Isolate-local rate limiter presented as distributed protection | PARTIALLY_IMPLEMENTED |
| CONTRACT-001 | P1 | OpenAPI generic object shapes and missing exact compatibility guarantees | PARTIALLY_IMPLEMENTED |
| PERF-001 | P1 | Capacity and regional latency predictions unsupported | Invalidated; measurements required |
| PRODUCT-001 | P1 | Strict audit protein target gaps | 235 corrected full-run user-days below 85%; none below implemented 80% floor; stricter product tolerance remains unresolved |
| SOURCE-001 | P1 | Initial remote refresh failure | Resolved: actual fetch and ff-only pull succeeded on 2026-10-25; six local commits ahead, zero behind at the checkpoint |
| PRIV-001 | P0 | Account deletion retained copied simulation health data and did not close its in-flight writes | Fixed, before/after regressions captured |
| PRIV-002 | P0 | Anonymous claims retained simulation copies; legacy claimed copies survived owner deletion | Fixed with guarded claim cleanup and trusted alias lookup; regression tested |
| VALID-001 | P1 | Quiet-hour validation accepted impossible clock values | Fixed strict HH:mm ranges; boundary regressions |
| EVID-006 | P0 | Failed onboarding reused day-one date | Fixed; corrected full run has 9,000 unique user-dates and zero temporal failures; original failed run preserved |
| EVAL-004 | P0 | Fish/shellfish evaluator contract mismatch | Three controls pass; immutable baseline separately re-evaluated |
| FOLLOWUP-001 | P1 | Repeated decisions and invented personal context | Seven regressions pass; real effective prescription and decision memory verified |
| DATA-001 | P1 | Concurrent reads mixed revision/history | Real D1 race reproduced and fixed with transactional snapshot; commit 53d806a |
| FOLLOWUP-002 | P1 | Scheduled delivery/read lifecycle and human perception absent | On-demand view verified; delivery/rendering and human satisfaction NOT_MEASURED |
| PRODUCT-002 | P1 | Initial plan coverage gaps | Two root causes fixed: exact HTTP comparison improves 82 -> 92 supported profiles with zero regressions; eight remain rejected; targeted 90-day checks pass |

“Fixed” above applies to the described local code and regression scope, not to overall launch readiness. Exact commit ownership is available with `git log -- <affected file>` and the execution source hashes.
