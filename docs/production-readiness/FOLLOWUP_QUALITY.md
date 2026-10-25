# Follow-up quality and adaptive behavior

User priority: the system must follow each person's actual progress, remember decisions, respond appropriately to setbacks and new evidence, and communicate naturally. Human perception must ultimately be evaluated with real users; synthetic journeys cannot establish that people feel cared for.

## Verified local improvements

Four continuity regressions originally failed: accepted recovery adjustments were proposed again, declined advice was proposed again without new evidence, personal messages still asked for agreement after acceptance, and a fixed “one set” reduction claim contradicted actual variable rounding. These now pass. A five-set prescription becomes three effective sets under the accepted 0.6 factor while the permanent program is preserved. New check-in evidence permits renewed review after a rejection.

Three further regressions originally failed: accepting at the exact expiry boundary produced an already inactive adjustment; first-check-in copy claimed a personal “usual” baseline; and soreness was attributed to a previous workout without recorded workout evidence. Expired/invalid timestamps are now rejected, and reasons cite actual reported sleep/fatigue/stress instead of inventing a history or cause. All seven focused tests pass.

`GET /v1/coaching/brief` now exposes the deterministic personal follow-up to KMM. The backend derives the view from authenticated, recorded state and returns typed nutrition/training/follow-up notes. IDs stay stable per namespace/day/role, so refreshing or accepting advice updates the current note rather than creating a stream of duplicate notifications. The API is a read-only view and does not advance account revision.

## Acceptance matrix

| Requirement | Evidence and current limit |
|---|---|
| Remember accepted and rejected advice | Seven follow-up continuity tests; new evidence reopens review |
| Real effect after acceptance | Actual effective-set calculation 5 -> 3; unchanged baseline program asserted |
| Acknowledge accepted adjustment | Personal brief key adjustment-active, with expiry and owning-plan checks |
| Report only observed facts | No personal baseline on a first check-in, no invented soreness cause; existing missing-data and stale-data controls |
| Stable refresh behavior | API tests compare complete notes and IDs across reads, and verify unchanged D1 revision |
| Context changes update advice | API test accepts adaptation, reviews again, and receives changed content under the same daily role ID |
| Tenant isolation | Empty/other account receives no owner notes; unauthenticated call rejected |
| Accurate API contract | CoachingBriefResponse and CoachingBriefNote schemas; seven executed API tests/subtests, including identity/content scoped conditional validators |
| Delivery/rendering truth | GENERATED; delivery/rendering NOT_MEASURED. API fetch does not constitute a client acknowledgement |
| Performance | 100 sequential loopback brief calls: p95 23.055 ms, 2,322 bytes; 100 calls at concurrency 10: p95 174.599 ms; zero unexpected errors. Small local samples only |
| Quiet hours and notification preferences | Clock-value validation verified; scheduled delivery/push and preference enforcement on notifications are not implemented by this on-demand view |
| Message history | Account/review/adaptation history exists; no dedicated persisted notification/message-history lifecycle is established by the brief API |
| Longitudinal adaptation quality | Corrected full run completes 9,000 dates; 7,311 notes pass selected factual checks; 1,225 nutrition and 192 canonical workout snapshots match persisted evidence. Human/clinical quality remains unestablished |
| Human experience | NOT_MEASURED; requires actual user evaluation and specialist review where appropriate |

Repeated message observations in the old HTTP extractor are not delivered/read notifications. The frozen run recorded 250,485 generated observations with 90.6695% mean exact-text repetition among its 82 onboarded personas; this sampling differs from the legacy fast runner's once-per-day collection. Neither metric establishes actual user exposure or satisfaction.

Generative AI features and mobile UI remain outside this work. No message claims that a human clinician reviewed the account.

Brief validators invalidate expired-context content even when account revision is unchanged, and a validator from one identity cannot suppress another identity's response. Exact command logs are under evidence/coaching-brief-cache-contract/.

The authoritative runner now fetches actual brief API responses only when an onboarded synthetic user opens the app. Its behavior memory receives these fetched notes rather than unseen frontend extractions. A 5-user × 14-day pilot recorded 75 notes from 25 successful brief responses, 282 HTTP events and 70 day bundles. Strict verification matched every note to its original HTTP response; no delivery or rendering was inferred. Negative controls reject fabricated text, omitted responses, false rendering, duplicate note IDs and brief fetches while the persona is absent. This pilot preceded the completed full run described below.

Account revision and normalized history are now read in a single transactional snapshot after reproducing a concurrent-write mismatch. See READ_CONSISTENCY.md. Complete validation at that checkpoint: 229 pass, zero fail/skip in evidence/coherent-followup-verified-check/. Performance source: evidence/coherent-brief-benchmark-results.json; the earlier comparable local run remains preserved separately.

Two further everyday-journey regressions failed before repair: logging water invalidated the cached review and made the brief forget a still-valid rejected adjustment; and a completed session was hidden behind an unknown recovery state. The brief now reads the persisted decision evidence directly, and acknowledges completed/partial/missed sessions while requesting a new check-in when recovery is unknown. Safety stop/hold and fatigue priorities remain above session acknowledgement. Nine continuity tests and nine existing personal-brief tests pass; complete check now records **231 pass, zero fail/skip** in evidence/everyday-followup-complete-check/.

The first corrected full attempt was deliberately stopped after these two additional defects were reproduced. Its partial journals and nonzero capture exit are preserved, and it is not counted as a completed run. A new full candidate must include these fixes from startup.

An ordinary-account HTTP journey also passes nine checks across 11 requests, without simulation commands or a simulation query: after 19 absent days, opening alone does not fabricate a tracking action; recording water triggers a return message with the actual last activity date. Explicit renewal begins on the current date, preserves its ancestor byte-for-byte, and retry creates no second plan. An unrelated owner receives 404, and a stale device receives 409. Clock/identity still use local test adapters; this is one explicit normal-account journey, not full mobile/production testing. The first fixture incorrectly expected the full-state active_plan_id field on bootstrap; it was corrected to the actual activeNutritionPlanRef.id contract, retaining the assertions and failed evidence.

A separate factual auditor imports no production planner/message helpers. Ten negative controls verify that it rejects selected fabricated identity, revision, delivery, activity, session, decision and safety facts. Its partial-run inspection covered 3,322 committed days and 2,946 actual notes with zero selected-rule failures; completion and exhaustive semantic coverage are not implied by this prefix result.

The final full inspection now covers all 9,000 days, 2,437 actual brief views and 7,311 notes, with zero selected-rule failures. Recorded categories include 279 active-adjustment acknowledgements, 162 remembered declines, 410 factual returns, 174 completed-session acknowledgements and 93 weight comparisons. Mean per-user exact-text repetition is 17.1059% (82 users with notes), pooled exact-text repetition 59.6225%, and mean per-user text/action-pair repetition 4.4509%. Different sampling and behavior feedback prevent treating the old extraction baseline as a controlled comparison. Generated counts are not delivery, rendering, reading or human-satisfaction results.

Current physical-history evidence also passes: 1,225 nutrition snapshots/transitions and 192 canonical workout prescriptions / 28 transitions match persisted local evidence. The complete export has 70,101 rows across 14 coaching tables. Exact scope and remaining failures are in CURRENT_RUN_RESULTS.md; notably 18 onboarding profiles remain rejected and scheduled notification lifecycle remains incomplete.
