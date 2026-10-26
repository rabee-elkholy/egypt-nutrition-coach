# Nutrition coverage & reference food repair — 2026-10-26

## Root causes of the remaining eight onboarding rejections

The diagnostic matrix (`scripts/audit/remaining-eight.mjs`, 96 seed attempts across the eight previously rejected profiles) and the vegan allocation probe (`scripts/audit/vegan-coverage-diagnostic.mjs`) isolated two distinct coverage gaps:

1. **Seven low-budget keto and low-carb profiles (`user-009`, `user-018`, `user-047`, `user-054`, `user-063`, `user-074`, `user-092`):** Every existing keto/low-carb template in `diet-patterns.mjs` depended on `olive` oil (`medium` budget tier) or medium/high-tier proteins, leaving zero eligible `low`-budget slot templates when `budget === 'low'`.
2. **One high-protein 2-meal vegan profile (`user-017`):** Existing vegan templates lacked a dense cooked legume protein source (`soybeans`) and multi-pass meal fitting across 2-meal high-protein days.

## Implemented repair

- **Reference-backed ingredient promotion (`scripts/add-coverage-ingredients.mjs`, `data/planning-library.json` `0.6.0-data.5`):**
  - Promoted two already-approved USDA FDC reference profiles from `data/index.json` / `data/details/*.json` into `data/planning-library.json` without modifying any nutrient values, portions, or SHA-256 reference fingerprints:
    - `soybeans` (`c48612e1-bf61-4708-9cff-c2d4130984f2`, mature cooked boiled soybeans without salt, 100g basis, `protein`, `legumes`).
    - `sunfloweroil` (`ffed97f3-9836-4044-a2f1-d407f52a7882`, sunflower oil, 100g basis, `fat`, `low` relative budget tier for measured recipe quantities).
- **Economical keto/low-carb & soy-based vegan templates (`diet-patterns.mjs`):**
  - Added measured `sunfloweroil`, egg, cottage cheese, peanut, and vegetable templates for `keto` and `low_carb` slots, plus `soybeans` recipes for `vegan` slots, without relabeling olive oil or altering existing recipes.
- **Exclusion & household-portion rules (`planner-exclusions.mjs`, `planner-household.mjs`, `planner-core.mjs`):**
  - Added explicit `soy` and `legumes` exclusion coverage and household portion formatting for `soybeans` and `sunfloweroil`, plus bounded multi-pass meal fitting and target-guided repair in `planner-core.mjs`.

## Verification evidence

- **Exact 8-profile HTTP & 12-seed matrix (`coverage-eight-fixed-20261026`):** All **8 / 8** profiles succeed on their original onboarding request (`200 OK`) and across all **96 / 96** seed attempts (`214` HTTP events, `508` checks, `0` failures).
- **Exact 100-persona initial HTTP replay (`coverage-all100-20261026`):** **100 / 100** personas succeed (`300` HTTP requests, `92 -> 100` supported, `0` remaining rejections, `0` regressions, `100` persisted accounts), with **0** strict protein (`<85%`) or energy (`>±12%`) gap days.
- **Paired replay of 1,268 archived cohort plans (`coverage-archived-plans-v2-20261026`):** **1,268 / 1,268** plans (`8,876` plan days) succeed with **0** strict protein-gap days (`1 -> 0` vs `5492a88`, `245 -> 0` vs `8ac9c4a`) and **0** strict energy-gap days, with zero regressions.
- **Targeted 90-day HTTP + D1 longitudinal journeys for all eight previously unsupported personas (`coverage-user-*-90day-20261026`):** **720** distinct user-dates (`8 × 90`), **2,503** HTTP operations, **480** fact-checked coaching notes, and **117** persisted D1 nutrition snapshots/transitions pass strict verification with `0` safety or transition failures.
- **Full test suite (`coverage-final-check-20261026`):** **276 passing tests**, `0` failures, `0` skipped.
