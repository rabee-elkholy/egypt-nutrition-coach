# Actual test execution

All commands run locally from the canonical repository on main. Evidence directories preserve full named results, stderr, elapsed time, source commit, source hashes, dirty state and machine information. There are no inferred test totals.

| Evidence directory | Command | Actual result |
|---|---|---|
| baseline-check | npm.cmd run check | build/data manifest check succeeded; 188 pass, 0 fail/skip |
| evaluator-baseline | node --test --test-reporter=tap tests/evaluator-negative-controls.test.mjs | 11 pass, 0 fail/skip; included in baseline 188 |
| stress-fast-baseline | node scripts/test-stress.mjs | 20/20 domain assertions |
| stress-http-baseline | node scripts/cohort/stress.mjs --output=... | Printed 32/32; one had no dispatch, so this is not 32 evidence-backed passes |
| stress-http-corrected | same harness, fresh output | 31 PASS, 0 FAIL, 1 NOT_TESTED |
| p0-final-check | npm.cmd run check | 195 pass, 0 fail/skip after seven added Node tests |
| archive-controls | python scripts/audit/test_archive_evidence.py | 6/6 controls; full names and Python summary in stderr.log |
| http-pilot-strict-verify | node scripts/cohort/verify.mjs --output=... | 70 days, 276 HTTP events, 2,417 messages; all checks pass |
| recovery-drill | node scripts/audit/check-recovery.mjs | expected injected child exit 1; resume/control exit 0; complete checkpoints equal |

The first Python archive-test invocation failed with an import-name mismatch; it was corrected and the independently captured six-control run passed. No assertion was weakened to obtain that pass. The injected recovery failure is intentional and retained; it is not counted as an ordinary successful application operation.

A test labeled as a whole release scenario may contain several subtests. Node's recorded totals include these and must not be described as 195 unrelated backend features. Production/mobile networks, operational restore and complete clinical/safety matrices are NOT_TESTED by these commands.

Phase 2: privacy-regressions-before-fix records 0/3 passing, then privacy-fix-check passes 198/198. privacy-claim-regressions-before-fix records 3 pass / 2 fail; privacy-claim-fix-check passes 200/200 and privacy-claim-regressions-after-fix passes 5/5. These failures are retained as defect reproduction, not hidden or counted as successful application operations. Final focused coverage includes both POST and DELETE account deletion.

local-restore-drill passed schema/row equality, two encryption integrity controls, migration rerun and restored HTTP reads. validated-local-benchmarks first failed on a prohibited SQLite introspection function; validated-local-benchmarks-v2 completed with unavailable version metadata, nine expected conflicts and zero unexpected HTTP errors.

## Current verified checkpoint

`coherent-followup-verified-check`: npm run check, **229 pass, 0 fail, 0 skip**, including parent/subtest counts. New coverage includes seven follow-up continuity regressions, seven brief API tests/subtests, temporal/source snapshot controls, food-category controls and transactional account snapshot races. Earlier failed executions are retained. The delayed-backfill injection was adjusted to continue targeting its write boundary after read-only batches were introduced; its conflict and preserved-data assertions were retained.

`coherent-followup-http-stress`: 31 PASS / 0 FAIL / 1 NOT_TESTED; `coherent-followup-fast-stress`: 20/20. `archive-controls-v2-final`: seven Python archive controls pass, including complete database-table evidence and runtime requirements. These are separate suites, not extra tests to add to Node's 229.

`backend-brief-cohort-pilot` and `backend-brief-cohort-verification`: 5 × 14 days, 282 HTTP events, 75 actual HTTP brief notes, no rejected operations in this small pilot, strict verification passed. Frozen historical full-run source verification passed against its original inputs, while an independent calendar audit failed it. The failed temporal gate must not be reported as release acceptance.

`everyday-followup-before-fix`: 7 pass / 2 fail. `everyday-followup-after-fix`: 18 pass (nine continuity plus nine personal-brief cases). `everyday-followup-complete-check`: **231 pass, zero fail/skip**. These cover decision memory after ordinary logging and acknowledgement of a completed session with unknown recovery, preserving safety priorities. The partial corrected full attempt was intentionally stopped to include these fixes in a fresh source-frozen candidate; its captured nonzero exit is not an application success.

## Corrected full-run acceptance evidence

`current-followup-100x90` completes 9,000 records and 31,266 HTTP operations. `current-full-source-verification` passes all recorded sources/artifacts and exact original HTTP note matching. `current-full-calendar-verification` passes 9,000 unique dates with zero failures. `current-full-followup-factual-audit` checks all 7,311 notes with zero selected-rule failures; its ten independent negative controls are separate from Node's 231 total. `current-full-d1-export` records 70,101 rows across 14 tables. `current-full-plan-transition-audit` passes 1,225 snapshots/transitions. `current-workout-prescription-audit` passes 192 canonical snapshots / 28 transitions; six independent mutation controls pass.

`normal-return-journey-v2` passes nine checks over 11 ordinary-account HTTP requests, including a 19-day absence, factual return, explicit renewal, immutable history, idempotent retry, 404 ownership and 409 revision boundaries. The original fixture failed because it expected active_plan_id on bootstrap; it was corrected to activeNutritionPlanRef.id, preserving assertions and failed evidence. `large-history-brief-benchmark-v3` completes 240 actual loopback read samples after earlier inline-Miniflare harness initialization failures; the retained source/hash and size checks identify its exact limited scope.

These passing finite checks do not clear the 18 onboarding failures, product tolerances, operational/provider/contract gates, notification-delivery lifecycle or real human experience. No clinical effectiveness or production capacity was measured.

## Subsequent planner repairs and latest validation

The bounded repair and strict-pool variety fixes are later than the d86f3a8 full archive. Before/after controls each recorded three failures and one passing negative control, then all passed. The complete check first reached 235, then 239 tests. Exact initial-HTTP comparison records 300 requests and **92 supported / 8 rejected**, with zero regressions among previous successes.

One newly supported vegan case at c63009e passes 90 days / 317 HTTP requests / 72 note checks / 15 persisted nutrition transitions. Three newly supported contexts at 743cebd pass **270 days / 881 HTTP requests / 189 note checks / 44 persisted nutrition transitions**. All targeted source/artifact/factual/history checks pass. They are not another full 100×90 result.

Post-planner domain stress initially failed 19/20 because an old case demanded rejection of a now-feasible DASH profile. The replacement requires successful generation and independently recomputes canonical measured sodium for all seven days; missing evidence and excessive quantities fail. A rejection does not pass that case. Two dedicated oracle tests pass; corrected domain stress is 20/20. Latest complete build/data/Node check: **241 pass, zero fail/skip**. HTTP stress remains 31 PASS / 0 FAIL / 1 NOT_TESTED. No assertion or safety bound was loosened to accept an invalid plan; the obsolete rejection premise and failed execution remain documented.
