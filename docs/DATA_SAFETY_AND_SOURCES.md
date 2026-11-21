# Data Safety, Nutrition Sources & Clinical Guardrails

This document specifies the food/exercise catalog provenance in **CuraFit API v1**, strict separation between verified references and calculated recipe estimates, missing-nutrient (`NULL`) handling, and conservative health exclusions.

---

## 1. Repository Catalog Inventory (`data/meta.json` v0.6.0-data.4)

All counts are automatically verified in CI and local checks via `node scripts/check-data-manifest.mjs`:

| Metric | Count | Verification & Approval Status |
| :--- | :---: | :--- |
| **Total Indexed Catalog Entries (`total_usable_count`)** | 3,291 | Total items in `data/index.json` indexed by `server/food-catalog.mjs`. |
| **Approved Reference Items (`food_count`)** | 3,070 | Source datasets (`usda-fdc`, `cofid-2021`, `lebanon-lab-2021`, `egypt-baladi-2018`, `dcps-recipes-2025`) tagged `status: "approved"`. |
| **Estimated Recipe & Beverage Models (`estimated_recipe_count`)** | 221 | Approximate recipe/beverage models in `data/recipe_estimates.json` tagged `status: "estimated"`, `reviewStatus: "Pending Review"`, and `approvedForPlanning: false`. |
| **Lab-Verified Compound Egyptian Recipes (`recipe_count`)** | 0 | Automated meal planning uses the 86 approved planning ingredients in `data/planning-library.json`. |
| **Direct Egyptian Lab Sources (`egypt_source_count`)** | 1 | Egyptian Baladi Bread study (Al-Dalain & Morsy 2018, Toukh, Egypt — `egypt-baladi-2018`). |
| **Indexed Beverages (`beverage_count` / `estimated_beverage_count`)** | 52 / 39 | 52 verified reference beverages plus 39 estimated cafe/Ramadan/local beverage models. |
| **Localized vs Pending Display Names (`name_ready_count` / `name_pending_count`)** | 1,802 / 1,489 | 1,489 USDA records retain source labels pending consumer localization review. |

---

## 2. Quality Tiers & Provenance Rules

`/v1/foods`, `/v1/beverages`, and `/v1/foods/{id}` classify entries transparently:

1. **`Verified Source` (`reviewStatus: "Approved"`):**
   - Direct reference measurement per 100g edible portion.
   - The 86 curated ingredients in `data/planning-library.json` carry `approvedForPlanning: true`.
2. **`Calculated from Verified Ingredients (Requires Specialist Review)` (`reviewStatus: "Pending Review"`):**
   - The 221 estimated local dish/beverage models in `data/recipe_estimates.json` (e.g., koshary, falafel, sweetened tea, Turkish coffee with milk, sobia, carob, tamarind, qamar el-din).
   - **Invariant:** Always flagged `approvedForPlanning: false` and `isApproximate: true`, never included automatically in therapeutic meal plan generation, and `per_100g` stays `null` unless a cooked/final weight is supplied.
3. **Unknown Nutrients Policy (`NULL`, Never `0`):**
   - Unmeasured micronutrients, fiber, or sodium in source references stay `null` in catalogs, API responses, and daily nutrition rollups (`dayTotals`).
   - In `calculator.mjs` and `server/food.mjs`, if any logged item on a day lacks a measured sub-nutrient (such as sodium or fiber), the daily rollup reports `null` rather than undercounting by substituting `0`.
4. **Density & Cooking Yield Guardrail:**
   - `calculatePreparedBeverageOrRecipe` and `snapshotFood` block `per-100mL` to `per-100g` conversions unless source `volume_evidence` or a verified density (`densityGPerMl`) is present.

---

## 3. Clinical Exclusions & Conservative Guardrails

CuraFit is a **general adult nutrition and fitness planner (`18–70` years)** and is not a medical device or clinical substitute:

1. **Blocked Profiles Routed to `requires_review`:**
   - Diabetes (`diabetes`), chronic kidney/liver/cardiac contraindications, pregnancy or lactation (`maternalStatus !== 'none'`), acute unmanaged injuries, age outside `18–70`, BMI outside `12.5–65`, or weight-loss requests when `BMI < 18.5`.
2. **Hypertension (`hypertension`) & Verified Sodium Gate:**
   - All dietary patterns selected with `hypertension` enforce verified reference sodium (`sodium != null && sodium <= 2300 mg/day` before added table salt) inside `assertDietDay`, `makeWeek`, and `review`.
   - Foods missing verified sodium measurements (`bread`, `shawarma_chicken`, `shawarma_beef`, `tabbouleh`, `fattoush`, `babaghanouj`) and high-salt cheeses (`feta`) are excluded automatically under `hypertension`, substituting verified whole-wheat bread (`wholebread`).
3. **Favism, Lactose Intolerance & Gout Rules:**
   - **`favism` (G6PD):** Strict exclusion of `fava` and `falafel` in both `medicalContraindicatedKeys` and `excludedGroups`.
   - **`lactose_intolerance`:** Excludes all dairy items (`milk`, `wholemilk`, `yogurt`, `greekyogurt`, `cottage`, `feta`, `mozzarella`) and removes `dairy` from auto-selected protein groups.
   - **`gout`:** Caps protein at `1.4 g/kg` (using Adjusted Body Weight when `BMI > 30`) and excludes red meat, liver, shrimp, and fava beans.
4. **Automated Scope Disclosure:**
   - Structured guidance metadata explicitly sets `reviewScope: "system_generated_guidance"` or `"system_generated_screening_not_medical_diagnosis"` so client UIs clearly present automated coaching recommendations rather than human medical review.

---

## 4. External Catalog Hook

`server/food-catalog.mjs` exports `registerExternalFoodCatalogSnapshot(snapshot)` so future verified regional food exports can be mounted into the catalog index without breaking any `/v1/*` contract.
