# Nutrition search quality repair — 2026-10-26

The bounded day repair stopped as soon as the plan passed the implemented 80% protein / ±15% energy acceptance boundaries. It therefore missed available improvements toward the independent audit's 85% / ±12% targets. Repair now continues toward those tighter search goals, still with at most twice the meal count in swaps, the same eligible recipes, source quantities, restrictions and final acceptance checks. A proposed swap cannot turn a valid day into an invalid one. The tighter goals are not silently made mandatory for all constrained libraries.

## Paired evidence

- Exact original initial HTTP requests, seeds and clocks: 100 profiles / 300 requests before and after; 92 supported / eight rejected in both; zero support regressions. Among 644 generated plan days, strict protein gaps fall from 15 to zero and energy gaps from one to zero. Persisted reloads and independent ingredient arithmetic pass.
- Replay of 1,268 unique plans visible in the frozen cohort's end-of-day states: 8,876 regenerated plan days per version. All 1,268 inputs succeed before and after; independent source arithmetic and implemented constraints pass. Strict protein-gap days fall from 245 to one, energy-gap days from 34 to zero, without a per-plan increase in either metric.
- The remaining strict protein gap is in user-089 / `plan-eea3b662-efa3-47f5-aca3-b33ceda3b4cf`. It is retained as unresolved, not rounded away.
- Five fixed-input regressions fail against the unchanged `8ac9c4a` planner and pass after repair. Full check: 265 pass / zero fail or skip. Domain stress: 20/20; HTTP stress: 31 PASS / zero FAIL / one NOT_TESTED.
- Fresh progress/decision HTTP journeys: 266 distinct user-days / 1,336 requests / 854 checks / 804 notes. Fresh annual journeys: two × 365 days / 3,168 requests / 2,268 checks / 15 accepted adjustments / 2,190 notes. Both complete with zero observed product gaps; independent streamed census and selected factual checks pass. The annual case includes a day-181 goal change. These are scoped repeats, not another full cohort.

The 1,268-plan comparison is a solver replay at each stored target energy, including derived snapshots. It is **not** a new 90-day HTTP cohort, not all 1,372 intermediate snapshots, and does not replace the old cohort's 235 observed protein-gap / 31 energy-gap user-days. The baseline planner imports the unchanged current shared dependencies; only planner-core differs. Historical evidence remains immutable.

## Regression-fixture correction

The first complete check was 264 pass / one fail: an older hold-reason fixture expected a nutrient-fit hold, but the improved plan now legitimately permits a calorie proposal. A probe of 92 supported profiles found no replacement generated witness. The test now reconstructs the exact reference quantities of an actual valid `8ac9c4a` day, verifies its original acceptance bounds independently, and checks that a calorie cut on a retained tight-protein plan still holds without falsely describing an energy-floor breach. This preserves the assertion and covers existing saved plans. Failed runs remain in local evidence.

## Remaining coverage diagnostic

A finite allocation probe for unsupported vegan user-017 varied meal energy/protein fitting, retaining the existing pool and quantity bounds. Across 79,767 partial combinations it found a **single-day** witness: 2,268.435598 kcal / 125.056894 g protein against targets 2,000 kcal / 155.8 g. This meets current acceptance but misses tighter quality goals. It establishes that the prior fixed-allocation search missed a feasible day; it does not establish an acceptable diverse week, clinical suitability or HTTP coverage. No new fallback, recipe, nutrient data or preference relaxation is shipped from this diagnostic. Seven empty-slot low-budget profiles also remain unresolved.

## Local immutable evidence

- `evidence/quality-initial-before-20261026/` and `quality-initial-after-20261026/`
- `outputs/audit/quality-archived-plans-20261026/comparison.json` (paired rows and input hashes)
- `evidence/quality-frozen-tests-before-20261026/`, `quality-complete-check-20261026/`, `quality-final-check-20261026/`
- `evidence/quality-final-fixtures-check-20261026/`: 265 pass with JSON regression fixtures included in source provenance.
- `evidence/quality-domain-stress-20261026/`, `quality-http-stress-20261026/`
- `evidence/quality-progress-20261026/`, `quality-annual-20261026/`, and their independent `quality-*-census-20261026.json` / `quality-*-facts-20261026.json` verdicts.
- `outputs/audit/vegan-allocation-probe-20261026/diagnostic.json`

The source repair does not establish notification delivery, read acknowledgements, user-perceived care or production capacity. Release remains **NOT_READY**; identity-provider selection stays deferred.
