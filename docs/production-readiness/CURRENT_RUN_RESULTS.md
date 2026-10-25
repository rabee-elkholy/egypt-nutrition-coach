# Current verified local cohort — 2026-10-25

Release decision: **NOT_READY**. The local structural/evidence checks pass. This is an engineering checkpoint, not completion of the continuous backend mission.

Source commit: d86f3a8a470ac9e70a6d588bfafbbd7f8bd7fc46. Exact startup inputs are frozen in source/ with hashes; the pre-existing meal-alternative alias was dirty at startup. Production was not deployed, migrated, modified or pushed.

Subsequent source work is recorded separately in PLANNER_SEARCH_REPAIR.md: 235 Node tests and an exact initial-HTTP replay support 83 onboardings / 17 rejections after a bounded-search fix. The full results below still refer to the frozen d86f3a8 inputs. The already delivered ZIPs preserve that earlier report verbatim.

Latest separate checkpoint: PLANNER_VARIETY_REPAIR.md records 239 Node passes and 92 / 100 supported initial HTTP profiles, with zero regressions. Three targeted 90-day contexts pass 881 HTTP operations, 189 selected-note fact checks and 44 persisted nutrition transitions. No full 100×90 rerun of that later source is claimed here.

| Evidence | Actual result |
|---|---|
| Cohort/calendar | 100 personas; 9000 records; 9000 unique user-dates; zero temporal failures |
| HTTP | 31266 operations; {"200":31025,"400":241}; no 5xx |
| Rejections | 220 preregistered invalid-water controls; 18 onboarding coverage failures; two empty-diary closures and one stale reschedule acceptance rejected |
| Onboarding | 82 succeeded / 18 failed |
| Actual backend brief | 2437 views / 7311 notes; zero selected factual-rule failures |
| Nutrition archive | 1225 snapshots/transitions matched actual local D1; 0 failures |
| Workout archive | 192 canonical prescriptions / 28 transitions matched the complete logical D1 export; 0 failures |
| Logical D1 export | 70101 rows across 14 coaching tables |
| Build/data/Node check | 231 pass, 0 fail, 0 skip; includes parent/subtest counts |

Full source/artifact verification and the separate calendar auditor pass. The original baseline remains preserved and still fails its own calendar acceptance. A deliberately interrupted corrected attempt remains separate, with 1,808 committed user-days and a nonzero exit.

## Follow-up behavior

Observed note categories include 279 acknowledgements of active accepted adjustments, 162 remembered declines, 410 returns after actual tracking actions, 174 completed-session acknowledgements and 93 supported weight comparisons. These are generated observations, not delivered/read notifications. Ten independent negative controls and six workout-prescription controls pass; they are separate from Node’s 231 total.

Mean per-user exact-text repetition: 17.1059% across 82 users with notes. Pooled exact-text repetition: 59.6225%. Mean per-user text/action-pair repetition: 4.4509%. The older frontend-extraction baseline used different sampling and behavior feedback, so these are not a controlled improvement percentage or human-satisfaction score.

An additional ordinary-account return journey passes nine checks across 11 HTTP requests without simulation commands/query. Its test clock/identity still bypass the public edge. Accepted/rejected decisions survive ordinary logging, real effective sets change after acceptance, and recorded sessions are acknowledged without inventing recovery readiness.

## Limits requiring further work

- 18 rejected onboarding profiles: coverage/search/library gaps remain.
- 235 strict protein-target-gap days and five strict energy-target-gap days; separate implemented floor/tolerance audit retained.
- Scheduled notification history/delivery/read acknowledgement and real human perception remain unestablished.
- Production provider login/refresh, typed API completeness, distributed limits, operations, capacity and specialist release evidence remain open.

The strict target audit measured 7,380 planned days: minimum protein ratio 0.8010565709, no observation below the implemented 80% floor; maximum absolute energy deviation 0.1348832491, none outside 15%. The stricter 85% protein / 12% energy observations remain findings. No assertion or constraint was weakened. Constrained movement coverage has 5,760 flagged user-days across 64 personas; an intentionally excluded movement is not automatically a clinical defect.

A separate local loopback read fixture verified 4,381 food rows: brief payload 1,995 bytes; sequential p95 71.628 ms, concurrency-five p95 295.609 ms, 240 measured HTTP 200 responses over all sizes/concurrencies. Direct historical insertion does not measure writes, mixed maximum histories or production/mobile capacity.

The identity-provider decision remains deferred by the user. Actual git fetch/pull succeeded on 2026-10-25; the checked main was six local commits ahead and zero behind. No production action is authorized by this report.

## Archive use

Keep raw and reports ZIPs intact and verify each with VERIFY.py verify <archive.zip>. Extract both into one fresh folder for the explorer. Each ZIP has its own archive-manifest.json; retain the ZIPs for independent checking. The raw acceptance-verdict.jsonl preserves the release restriction even when inspected separately. Archive integrity does not establish product or clinical readiness.
