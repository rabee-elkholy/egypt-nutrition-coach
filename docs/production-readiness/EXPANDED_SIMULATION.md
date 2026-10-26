# Expanded deterministic simulation — 2026-10-26

The user authorized publishing the existing source first, then measuring the remaining eight profiles and accumulated progress/decisions, and subsequently expanded permission to additional profiles and horizons beyond 90 days. Initial publication is `70b58c44c86116de21625667136212ef9ec4c15a`: 82 selected source/test/contract/report files, no detailed evidence logs, databases, generated cohort outputs or ZIPs. Both associated GitHub Actions runs completed successfully. No manual production deployment was performed.

## Completed measurements

| Measurement | Executed scope | Result |
| --- | --- | --- |
| Exact remaining profiles | 8 profiles × 12 fixed seeds; isolated higher-budget counterfactuals | 214 HTTP events; all 96 original-preference seed attempts rejected; seven have an empty eligible meal slot, one vegan target/search case remains unresolved |
| Typed coverage errors | Same matrix after error-contract repair | 324 checks pass; rejected accounts remain empty and errors are actionable, non-retryable 400s |
| Progress/decision paths | Six matched 42-day paths plus 14 days of opposite recovery decisions | 266 user-days, 1,336 HTTP events, 854 checks pass after nutrition decision-memory repair |
| Workout performance | Four matched 28-day paths; eight exposures each | 112 user-days, 396 HTTP events, 148 checks pass; progression, performance drop, poor recovery and pain gates verified |
| Service tracks | Same 100 personas × three service tracks | 900 HTTP events, 1,352 checks pass; workouts-only 100 accepted, nutrition-only 92, combined 92 |

Local raw data and frozen source are retained in distinct `reports/simulation-100-users-90-days/audit-*` directories; execution metadata/logs are retained under local `docs/production-readiness/evidence/`. They are deliberately excluded from Git publication. These are ordinary account routes with synthetic trusted identity/time, not public JWT/mobile/production tests. On-demand notes remain GENERATED, with delivery and rendering NOT_MEASURED.

## Confirmed defects and repairs

1. Rejected calorie advice was immediately re-proposed without new evidence. Original 42-day measurement captured the exact rejected/new proposal IDs. Four regressions initially recorded three failures. Nutrition and maintenance proposals now retain exact deterministic nutrition evidence, respect rejection while that evidence is unchanged, survive ordinary logging and fresh recovery timestamps, and permit reconsideration after changed nutrition evidence. The brief acknowledges a matching rejection directly from persisted adaptations even when the cached review was cleared. Old proposals without evidence are not guessed to match.
2. The initial annual journey failed on day 57 when renewing after accepted targets 2040 → 1938 → 1842 → 1750 → 1663. Renewal previously generated at the original target then scaled all portions, reducing protein below its unchanged floor. The planner now supports a validated internal accepted-energy input and fits the renewed week directly to it while preserving protein, exclusions and diet limits. Three regression tests failed before and pass after. Target-derived energy-change/forecast metadata is refreshed. This internal parameter is not a new client command field.
3. Unsupported plans returned generic validation errors. They now return `PLAN_CONSTRAINTS_UNMET`, with a stage of `NO_ELIGIBLE_MEAL_FOR_SLOT`, `NO_CANDIDATE_WITHIN_DIET_LIMITS`, or `NUTRIENT_TARGETS_UNMET`. A finite search failure does not claim mathematical infeasibility. Three controls failed before and pass after; the real HTTP matrix verifies the envelope and absence of partial persistence.
4. The first completed annual execution could not serialize its entire response array: Node reported `RangeError: Invalid string length`. It is not accepted as a complete evidence packet. New scenario capture streams original HTTP events to gzip NDJSON with backpressure and retains compact counters. The annual replay must complete with independently verified raw evidence before acceptance.

## Scope of the unresolved coverage

Seven low-budget keto/low-carb profiles lack an eligible meal slot in the current library/policy. All fourteen isolated medium/high-budget diagnostic controls succeed, without changing original accounts. This identifies a coverage boundary, not a justification to silently upgrade budget or alter the diet.

The high-budget Egyptian vegan profile reaches 113.369346 g protein in the original failed day, below the existing 124.64 g floor (target 155.8 g). A diagnostic-only clone attaches failure facts without removing assertions. A finite 867,510-combination search over three per-slot fitting levels found no valid single-day witness. This is not an infeasibility proof or a clinical assessment, and the eight profiles remain unsupported.

## Validation and remaining gates

Latest complete source check: **255 pass / zero fail / zero skip**. Domain stress: **20/20**. HTTP stress: **31 PASS / zero FAIL / one NOT_TESTED**. Mutation controls validate the scenario nutrient arithmetic and independent evidence census.

The two 365-day journeys and a fresh complete 100×90 cohort require their own final raw/source/calendar/factual/persistence verification. Prior immutable 100×90 ZIPs describe the older d86f3a8 runtime and must not be relabeled as this source. Notification scheduling/delivery/reading, production operations/capacity, KMM/provider integration (provider decision deferred), human experience and specialist acceptance remain separate gates. Synthetic success never establishes release readiness.
