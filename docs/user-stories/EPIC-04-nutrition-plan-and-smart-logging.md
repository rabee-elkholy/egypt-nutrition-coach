# EPIC-04: Personalized Meal Plans, Smart Multi-Modal Logging & MENA Kitchen Tools

> **Epic ID:** `EPIC-04`
> **Target Platforms:** KMM (Android Jetpack Compose & iOS SwiftUI)
> **Scope:** Production
> **Labels:** `production`, `mobile`, `nutrition`, `ai-logging`, `ramadan`, `pantry`

---

## Epic Overview

`EPIC-04` powers the entire **Nutrition Tab** and **Multi-Modal Food Logging** ecosystem. It unites CuraFit's clinically validated, 100% regional 7-day meal plan engine (`Egypt`, `Gulf`, `Levant`, `Maghreb`) and 3,291 reference/estimated foods & beverages + 2,437 regional serving models (`5,728` total indexed) Arabic/English catalog with market-leading consumer conveniences: **MENA Supermarket Barcode Scanner**, **"What's in My Fridge?" Pantry Finder** (powered by existing `pantry.mjs`), **Smart Weekly Grocery List**, **Quick Repeat / Favorites / Copy Yesterday**, **Intermittent Fasting (16:8) + Ramadan Mode**, and (in Final AI Phase) **AI Meal Photo & Dialect Voice/Text Quick Log**.

### Child User Stories
- `US-NUT-01`: 7-Day Regional Meal Plan Viewer, Calendar Switcher & Smart Plan Renewal
- `US-NUT-02`: 1-Tap Planned Meal Logging, Portion Multiplier, Ingredient Breakdown & Entry Deletion
- `US-NUT-03`: Smart Meal Swap & Constraint-Validated Alternatives
- `US-NUT-04`: Bilingual Arabic/English Food & Beverage Search (3,291 Foods/Beverages + 2,437 Regional Serving Models) & Custom Recipe Calculator
- `US-NUT-05`: AI Meal Photo & Egyptian/Arabic Dialect Voice/Text Quick Log *(Final AI Phase)*
- `US-NUT-06`: MENA Supermarket Barcode Scanner & Community Product Submission
- `US-NUT-07`: Quick Repeat — Favorites, Recent Foods, Manual Macro Entry & 1-Tap Copy Yesterday
- `US-NUT-08`: Pantry / "What's in My Fridge?" Smart Meal Finder
- `US-NUT-09`: Smart Weekly Grocery / Shopping List (Aisle-Grouped, Budget-Aware & Shareable)
- `US-NUT-10`: Intermittent Fasting (16:8) Live Timer & Automatic Ramadan Mode
- `US-NUT-11`: Daily Food Diary Completion Confirmation & Adaptive Evidence Readiness Indicator

---

## US-NUT-01: 7-Day Regional Meal Plan Viewer, Calendar Switcher & Smart Plan Renewal

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-01` |
| **Epic** | `EPIC-04` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `nutrition`, `plans` |
| **Target Screens** | `NutritionHubScreen`, `PlanArchiveSheet` |
| **Entitlement** | `Freemium` (`Free` view active plan + 1 bonus weekly renewal; `Pro` unlimited weekly renewals + early renewal + full plan archive history) |
| **Backend Status** | `Implemented` |

### STORY
As a user following a weekly nutrition plan, I want to browse each day of my 7-day regional meal plan, switch cleanly between my Planned Menu and Actual Food Diary, view past archived weeks, and renew my plan (either after the 7 days finish or early starting tomorrow) so I always have fresh, balanced meals aligned with my latest targets.

### PRECONDITIONS
- `serviceTrack != "workouts_only"` and `activeNutritionPlanRef != null`.

### SCREEN AND UI DETAILS
1. **Top Sticky Nutrition Header:**
   - Horizontal 7-Day Calendar Strip (`start_date`..`end_date`) highlighting Today, plus `[Past Plans History]` icon button (`GET /v1/plans`) and `[Refresh Plan Starting Tomorrow]` overflow option (`earlyRenew: true`).
   - Compact **Daily Target Bar**: Shows `Plan Target` (`1,850 kcal • 145g P / 170g C / 65g F`) vs `Logged Today` progress.
   - Sub-tab toggle or unified view: **`Today's Meals`** (shows planned slots + any extra ad-hoc logged foods inline) | **`Grocery List`** shortcut (`US-NUT-09`) | **`Pantry Finder`** shortcut (`US-NUT-08`).
2. **Meal Slot Cards (Breakfast, Lunch, Dinner, Snacks — or Suhoor/Iftar in Ramadan Mode):**
   - Each card displays: Slot badge + scheduled time window (e.g., `12:00 PM` when IF active), Dish Name (localized Arabic/English), Estimated Prep Tag, Calories + Macros pills (`520 kcal • 42g P • 54g C • 14g F`), Status indicator (`Planned` vs `Logged ✓ 1.0x`), `[Log ✓]` button, and `[Swap ⇄]` button.
3. **Plan Expiry & Renewal Banner (Shown when `today > activePlan.end_date`):**
   - Prominent card: *"Your 7-day meal plan ended on {end_date}! Generate a fresh week tailored to your current calorie target ({latestEnergy} kcal) and preferences."*
   - CTA: `[Generate Next 7-Day Plan]` (Uses `entitlements.quotas.freePlanRenewalsRemaining`: Week 1 included + `1` bonus Free renewal; once Free renewal bonus is used, displays Soft Paywall `US-MON-01` for unlimited renewals).
4. **Empty / Plan Warnings State:**
   - If `plan.warnings` contains day warnings from `planner-core.mjs`, show a calm inline info pill rather than hiding the plan.

### API & BACKEND CONTRACT
1. **`GET /v1/plans`** -> Lists active & archived `{ id, start_date, end_date, energy, reason, parent_id }`.
2. **`GET /v1/plans/{activePlanId}`** -> Fetches full 7-day plan once on sync/restore and caches in SQLDelight.
3. **`GET /v1/plans/{activePlanId}/days/{YYYY-MM-DD}`** -> Lazy-loads any single day (`{ planId, targets, day }`).
4. **`POST /v1/commands?view=receipt`** (`action: "renew_plan"`, `payload: {}` or `{ "earlyRenew": true }`)
   - **Standard Renewal (`payload: {}`):** Allowed when `end_date < currDate`; generates a new 7-day plan starting today (`currDate`).
   - **Early Plan Renewal (`payload: { "earlyRenew": true }`):** Regenerates remaining days starting **tomorrow** (`dateOffset(currDate, 1)`) while preserving today's plan day and all of today's logged meals cleanly (`todayPlanDay` preserved).
   - Enforces Pro entitlement once `entitlements.quotas.freePlanRenewalsRemaining == 0` when entitlement enforcement is enabled (`402 PRO_ENTITLEMENT_REQUIRED`).
   - Error Codes:
     - `400 PLAN_STILL_ACTIVE`: Active plan hasn't ended yet (`end_date >= currDate`) and `earlyRenew: true` was not passed.
     - `400 PLAN_NOT_ACTIVE_FOR_TRACK`: Account is `workouts_only`.
     - `400 PLAN_CONSTRAINTS_UNMET` / `LIBRARY_INSUFFICIENT_FOR_DIET_GOALS`: Show actionable prompt to review exclusions/diet in `US-PRF-04`.
     - `402 PRO_ENTITLEMENT_REQUIRED`: Free renewal bonus already consumed (`US-MON-01`).

### RULES & BUSINESS LOGIC
1. **Immutable Historical Targets:** When viewing a past plan date (`date < today`), always read `day.targets || plan.targets` from that historical plan version — never rewrite past day targets with today's adjusted calories (`IMPLEMENTATION.md`).
2. **Renewal Eligibility & Quota:** Standard `renew_plan` succeeds when `current.days.at(-1).date < currDate`, while `{ earlyRenew: true }` allows refreshing upcoming days starting tomorrow without disturbing today's logged meals. Free users get 1 bonus weekly renewal (`freePlanRenewalsRemaining == 1 -> 0`) before Pro gating activates cleanly (`US-MON-01`), ensuring Week 2 habit formation before any Paywall on renewals. It always uses the latest `profile`, `preferences`, and any accepted `nutritionAdjustment.energy`.
3. **Cache Strategy & 5-Meal / Ramadan Slot Display:** Fetch `GET /v1/plans/{activePlanId}` upon onboarding completion, plan replacement (`replace_meal`), adaptation acceptance (`calories` / `maintenance`), or `renew_plan`, keeping all 7 days available 100% offline. 4- or 5-meal Balanced schedules display sub-slots (`Snack 1`, `Snack 2`) visually while mapping every log wire call cleanly onto the 4 canonical server slots (`breakfast | lunch | dinner | snack`) + `displaySlot`.

### MAIN FLOW
1. User taps `Nutrition` tab.
2. App renders today's planned meals from SQLDelight immediately while verifying `GET /v1/food-diary?date={today}`.
3. User taps `Tomorrow` on the 7-day strip -> Switches smoothly to tomorrow's meals (`[Swap]` allowed, `[Log]` disabled for future dates).
4. On Day 8 (`end_date < today`), user taps `[Generate Next 7-Day Plan]` -> Calls `renew_plan` -> Fetches new plan and displays the next 7 days immediately (or taps `[Refresh Plan Starting Tomorrow]` mid-week to call `renew_plan` with `{ earlyRenew: true }`).

### EDGE CASES
- **User Views a Future Plan Day and Taps `[Log Meal]`:** Disabled with subtle tooltip *"You can log meals on today or past days; you can still swap future meals now."* (`DATE_IN_FUTURE`).
- **Offline Plan Renewal Attempt:** Disabled with clear offline prompt *"Connect to the internet to generate your next 7-day meal plan."*
- **Historical Archive Read:** Tapping `[Past Plans History]` displays archived versions created by meal swaps or calorie adaptations (Pro feature for older than current/previous week).
- **Free User Uses Bonus Week-2 Renewal Then Attempts Week-3 Renewal:** `freePlanRenewalsRemaining == 0` gracefully presents `ContextualProUpsellSheet` (`US-MON-01`) while keeping Week 2 completely usable.

### ACCEPTANCE CRITERIA
- **Scenario 1: Plan renewal succeeds after 7-day cycle ends (and early renewal preserves today)**
  - **Given** the active plan's `end_date` is `2026-11-20` and `serverDate` is `2026-11-21`
  - **When** the user taps `[Generate Next 7-Day Plan]`
  - **Then** `POST /v1/commands` (`action: "renew_plan"`) creates a new 7-day plan starting `2026-11-21` and sets it active; when `earlyRenew: true` is used mid-week, today's plan day and logged meals remain untouched while upcoming days regenerate from tomorrow.
- **Scenario 2: Past plan days preserve historical calorie targets**
  - **Given** a calorie adaptation reduced targets from `2,000` to `1,850 kcal` starting tomorrow
  - **When** the user navigates back to yesterday in the diary/plan strip
  - **Then** yesterday still shows `2,000 kcal` target accurately.
- **Scenario 3: Free user exhausting bonus renewal sees soft paywall without blocking active week view**
  - **Given** `tier == "free"`, `freePlanRenewalsRemaining == 0`, and current plan expired
  - **When** user taps `[Generate Next 7-Day Plan]`
  - **Then** the Soft Paywall (`US-MON-01`) triggers cleanly while historical logs and current saved plan items remain viewable.

### ANALYTICS
- `nutrition_plan_viewed` (`plan_id`: `string`, `day_offset`: `integer`)
- `nutrition_plan_renewed` (`previous_plan_id`: `string`, `new_plan_id`: `string`, `energy`: `number`, `early_renew`: `boolean`)

---

## US-NUT-02: 1-Tap Planned Meal Logging, Portion Multiplier, Atomic In-Place Edit & Entry Deletion

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-02` |
| **Epic** | `EPIC-04` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `nutrition`, `food-diary` |
| **Target Screens** | `MealDetailBottomSheet`, `NutritionDiarySection` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user eating from my daily plan, I want to inspect the exact gram weights and ingredients of any planned meal, adjust my actual portion multiplier (such as `0.5x` or `1.5x`), log it in one tap, and atomically edit or delete logged entries if I made a mistake.

### PRECONDITIONS
- An active plan day exists for `date <= serverDate`.

### SCREEN AND UI DETAILS
1. **Meal Detail Bottom Sheet (Opens when tapping any planned meal card):**
   - Dish header + `Verified Source` / `Approximate` provenance badge + Calories & Macro pills (`kcal`, `P`, `C`, `F`, `Fiber`, `Sodium`).
   - **Portion Multiplier Selector:** Interactive horizontal chips `[0.5x]`, `[0.75x]`, `[1.0x (Planned)]`, `[1.25x]`, `[1.5x]`, `[2.0x]` + slider (`0.1x .. 4.0x` on initial log; `0.25x .. 3.0x` on in-place edit). Scaling updates all ingredient grams and nutrition totals live!
   - **Ingredients List:** Each row shows ingredient name, scaled grams (`"150g Chicken Breast"`), an explicit **`Raw (Dry)` vs `Cooked` state badge** (prevents 2–3x rice/pasta/meat weighing errors!), and household measure hint (e.g., `"~1 medium fillet"` / `"~6 cooked tbsp"`).
   - **Simple Preparation Steps** (when present in regional recipe metadata).
   - **Primary CTA:** `[Log This Meal ({scaledCalories} kcal)]` -> Commits `food_entry` (`source: "planned"`).
   - **Secondary CTA:** `[Swap for Another Meal]` (`US-NUT-03`) or `[Copy to Favorites ☆]` (`US-NUT-07`).
2. **Logged Food Diary Entry Row (Shown once logged):**
   - Displays green check, actual logged name, multiplier/grams, exact frozen calories & macros, timestamp, `[Edit Portion]` button, and **Swipe-to-Delete** or `Trash` button -> Confirmation toast with quick `[Undo]` (`food_delete`).
   - Editing quantity, grams, slot, or manual nutrients of ANY already-logged entry (`planned`, `ingredient`, or `manual`) executes atomically via a single **`food_entry_update`** command (preserving the entry `id`, recomputing scaled macros for `planned`/`ingredient` or updating `manual` fields in place, and reopening `complete = false`) — eliminating fragile multi-step delete+create chains!

### API & BACKEND CONTRACT
1. **`GET /v1/food-diary?date={YYYY-MM-DD}`** -> Returns `entries`, `totals`, `complete`, `planEnergy`.
2. **`POST /v1/commands?view=receipt`** (`action: "food_entry"`, `source: "planned"`)
   - Payload: `{ "date": "2026-11-21", "source": "planned", "mealId": "<uuid>", "slot": "<meal.slot>", "displaySlot": "suhoor", "quantity": 1.0 }` (`quantity` valid `0.1..4.0`; `slot` MUST strictly be one of `"breakfast" | "lunch" | "dinner" | "snack"` for `food.mjs`, while optional `displaySlot` stores `"snack_1" | "snack_2" | "suhoor" | "iftar" | "night_snack"`).
3. **`POST /v1/commands?view=receipt`** (`action: "food_entry_update"`) — **Atomic In-Place Edit:**
   - Preserves `id` and `date`, recomputes scaled macros from the existing snapshot for `planned` (`quantity` `0.25..3.0`) and `ingredient` (`grams` `1..2000` or `quantity` `0.25..10` for `unit: "reference"`), or updates `manual` `name`/`slot`/nutrient fields cleanly in 1 atomic revision!
   - Payload examples:
     - Planned: `{ "id": "<entry-uuid>", "quantity": 0.75, "slot": "lunch" }`
     - Ingredient: `{ "id": "<entry-uuid>", "grams": 180 }`
     - Manual: `{ "id": "<entry-uuid>", "name": "Grilled Chicken Wrap", "energy": 480, "protein": 38, "carbs": 42, "fat": 16 }`
4. **`POST /v1/commands?view=receipt`** (`action: "food_delete"`)
   - Payload: `{ "id": "<entry-uuid>" }`.
   - Error Codes: `PLANNED_MEAL_ALREADY_LOGGED`, `MEAL_DATE_MISMATCH`, `MEAL_SLOT_MISMATCH`, `INVALID_MEAL_SLOT`, `DAILY_TOTAL_REQUIRES_DETAILED_CONVERSION`, `FOOD_ENTRY_NOT_FOUND`.

### RULES & BUSINESS LOGIC
1. **Frozen Snapshot Guarantee:** Once logged, the food entry stores a frozen nutrient `snapshot`. Subsequent calorie adjustments or meal swaps on future days never alter past logged consumption.
2. **Auto-Reopening Day Completion:** Any `food_entry`, `food_entry_update`, or `food_delete` sets `complete = false` on the server (`food.mjs`). The mobile UI reflects this immediately (`"Changes logged — confirm day complete when done"`).
3. **Quantity Bounds:** Enforce exact backend bounds (`0.1..4.0` on initial `food_entry`, `0.25..3.0` on `food_entry_update` for planned meals).
4. **Canonical Wire Slot Mapping Rule (Planned vs. Ad-Hoc):**
   - **For `source: "planned"` (including during Ramadan Mode or 5-meal Balanced plans):** ALWAYS send the planned meal's actual `meal.slot` as wire `slot` (preventing `MEAL_SLOT_MISMATCH`), and pass the Ramadan or multi-snack presentation label (`"suhoor" | "iftar" | "night_snack" | "snack_1" | "snack_2"`) in `displaySlot`!
   - **For ad-hoc logs (`source: "ingredient" | "manual"`):** Map Ramadan presentation slots to canonical wire slots: `Suhoor` -> `slot: "breakfast"` (`displaySlot: "suhoor"`), `Iftar` -> `slot: "dinner"` (`displaySlot: "iftar"`), `Night Snack` / `Snack 1` / `Snack 2` -> `slot: "snack"` (`displaySlot: "night_snack" | "snack_1" | "snack_2"`).

### MAIN FLOW
1. User taps Lunch (`Kofta & Rice with Salad`, `610 kcal`).
2. `MealDetailBottomSheet` displays exact ingredient grams (`160g Lean Kofta (Raw)`, `150g Cooked Rice (~7 tbsp)`, `120g Green Salad`).
3. User ate a smaller portion of rice/kofta -> Taps `[0.75x]` -> Calories live-update to `458 kcal`.
4. User taps `[Log This Meal (458 kcal)]` -> Optimistically marks Lunch logged, pushes `food_entry`, updates daily calorie ring.

### EDGE CASES
- **Editing an Already-Logged Entry In Place:** Tapping `[Edit Portion]` dispatches a single atomic `food_entry_update` command preserving the entry's `id`, avoiding duplicate errors (`PLANNED_MEAL_ALREADY_LOGGED`) or partial failure between delete and re-create.
- **Trying to Log Planned Meal From Yesterday on Today's Date:** App always submits the meal's scheduled `day.date` (or disables planned-meal button on mismatched dates while allowing `"Copy Yesterday"` via `US-NUT-07` which logs on Today!).
- **Rapid Undo After Swipe-to-Delete:** Tapping `[Undo]` within 5 seconds re-queues `food_entry` using the previously cached frozen snapshot/mealId safely.
- **Ramadan `Suhoor` or 5-Meal `Snack 2` Planned Log:** Sends the planned meal's actual `meal.slot` as wire `slot` alongside `displaySlot: "suhoor"` / `"snack_2"` so server `MEAL_SLOT_MISMATCH` never triggers; ad-hoc logs under Suhoor/Iftar/Night Snack map to `breakfast`/`dinner`/`snack` + `displaySlot`.

### ACCEPTANCE CRITERIA
- **Scenario 1: Portion scaling updates snapshot macros and commits**
  - **Given** a planned meal is `600 kcal` at `1.0x`
  - **When** the user selects `1.5x` and taps Log
  - **Then** `food_entry` sends `quantity: 1.5` and daily diary totals increase by `900 kcal`.
- **Scenario 2: Deleting a logged meal reopens day completion**
  - **Given** today was marked `complete = true`
  - **When** the user deletes a logged lunch entry via `food_delete`
  - **Then** the entry disappears, daily totals decrease, and day completion resets to `false`.
- **Scenario 3: Editing portion of an already-logged planned meal updates atomically in place**
  - **Given** Lunch `meal-1` is already logged at `1.0x` (`entry-1`)
  - **When** the user edits it to `0.75x`
  - **Then** client commits a single `food_entry_update` (`id: "entry-1"`, `quantity: 0.75`), preserving the entry ID and updating scaled diary totals cleanly in 1 revision.

### ANALYTICS
- `planned_meal_detail_viewed` (`meal_id`: `string`, `slot`: `string`)
- `food_entry_logged` (`source`: `"planned"`, `slot`: `string`, `quantity`: `number`, `kcal`: `number`)
- `food_entry_updated` (`entry_id`: `string`, `source`: `string`)
- `food_entry_deleted` (`entry_id`: `string`, `source`: `string`)

---

## US-NUT-03: Smart Meal Swap & Constraint-Validated Alternatives

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-03` |
| **Epic** | `EPIC-04` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `nutrition`, `swaps` |
| **Target Screens** | `MealAlternativesSheet` |
| **Entitlement** | `Freemium` (`Free`: up to 2 swaps/day; `Pro`: unlimited swaps) |
| **Backend Status** | `Implemented` |

### STORY
As a user who doesn't feel like eating a specific planned dish, I want to swap that meal with curated alternatives guaranteed to fit my medical conditions, allergies, diet school, budget, and daily macro tolerances so I stay on track without breaking my plan.

### PRECONDITIONS
- The target planned meal is on `date >= serverDate` (`PAST_DAY_PLAN_IMMUTABLE`) and has **not** already been logged as consumed (`MEAL_ALREADY_CONSUMED`).

### SCREEN AND UI DETAILS
1. **Meal Alternatives Bottom Sheet:**
   - Top summary bar showing the original meal (`"Replacing: Oats & Milk (420 kcal • 22g P)"`).
   - Vertical list of up to 6 validated alternatives returned by `/v1/meal-alternatives`, each showing:
     - Dish name (`snapshot.name`), key ingredients preview (`snapshot.ingredients`), Calories & Macros, and a **Delta Pill** (e.g., `"+15 kcal • +4g P"` from `energy_delta` / `protein_delta`).
     - `[Preview Ingredients]` expand toggle + `[Select Replacement]` button.
   - *Free Tier Quota Banner:* Shows subtle `"1 of 2 free swaps left today"` (or triggers Soft Paywall `US-MON-01` when exceeded).
   - *Empty State:* If zero alternatives meet strict constraints (e.g., multiple severe allergies + vegan), show *"No alternative dishes satisfy all your current allergies and calorie limits for this slot. You can still eat something else and log it via Search or Manual Entry."*

### API & BACKEND CONTRACT
1. **`GET /v1/meal-alternatives?mealId={mealId}`**
   - Returns `{ items: [{ snapshot: { template_id, name, slot, ingredients, values, ... }, energy_delta, protein_delta }] }`.
2. **`POST /v1/commands?view=receipt`** (`action: "replace_meal"`)
   - Payload: `{ "mealId": "<uuid>", "templateId": "<snapshot.template_id>" }`.
   - Enforces Free daily swap quota (`2/day` via `coaching_usage_quotas` when entitlement enforcement is enabled; unlimited on Pro), returning `402 PRO_ENTITLEMENT_REQUIRED` when exceeded.
   - After `200 OK`, fetch the newly created plan version (`GET /v1/plans/{newPlanId}`) using `affected` delta or `GET /v1/bootstrap` so local SQLDelight holds the new immutable plan version.
   - Error Codes: `PAST_DAY_PLAN_IMMUTABLE`, `MEAL_ALREADY_CONSUMED`, `MEAL_ALTERNATIVE_UNAVAILABLE`, `PLANNED_MEAL_NOT_FOUND`, `402 PRO_ENTITLEMENT_REQUIRED`.

### RULES & BUSINESS LOGIC
1. **Immutable Plan Versioning:** `replace_meal` creates a new `planId` (`parent_id = oldPlanId`) on the server so history and previously logged days remain untampered.
2. **Swap Guardrails:** Client disables `[Swap]` on past days (`date < serverDate`) and shows `"Delete logged entry first to swap"` if the meal was already logged today (`MEAL_ALREADY_CONSUMED`).
3. **Full-Day Diet Revalidation:** Alternatives returned are already pre-verified against `assertDietDay` (e.g., DASH `<= 2300 mg` sodium, Keto carb limit, Celiac gluten-free, Favism fava-free).

### MAIN FLOW
1. User doesn't have chicken today and taps `[Swap ⇄]` on Dinner.
2. Sheet loads `GET /v1/meal-alternatives?mealId=...` and displays 5 valid substitutes (e.g., *Tuna & Bean Salad*, *Grilled Tilapia & Brown Rice*, *Cottage Cheese & Baked Potato*).
3. User taps `[Select Replacement]` on *Tuna & Bean Salad*.
4. `replace_meal` commits, local plan updates seamlessly to the new version, and Dinner updates in place.

### EDGE CASES
- **Stale Alternative (`MEAL_ALTERNATIVE_UNAVAILABLE`):** If preferences changed on another device, refresh `GET /v1/meal-alternatives` automatically and show *"Alternatives refreshed for your latest preferences."*
- **User Already Logged the Meal:** Swap icon switches to a lock/tooltip explaining *"Unlog this meal first if you want to swap it."*
- **Offline Swap Attempt:** Swap button clearly informs *"Connect to internet to verify diet-safe meal replacements."* because `replace_meal` must run server-side `assertDietDay` revalidation.
- **Free Daily Swap Quota Exceeded (`2/2` Used Today):** Tapping swap on a 3rd meal shows `ContextualProUpsellSheet` (`US-MON-01`) with countdown until tomorrow's quota reset.

### ACCEPTANCE CRITERIA
- **Scenario 1: Valid meal swap versions plan and updates UI**
  - **Given** Dinner today is unlogged and alternatives exist
  - **When** the user selects an alternative and confirms
  - **Then** `replace_meal` commits with `snapshot.template_id`, a new plan version becomes active, and Dinner renders the selected replacement dish.
- **Scenario 2: Consumed meal cannot be swapped**
  - **Given** Breakfast today has already been logged
  - **When** viewing Breakfast options
  - **Then** direct meal swap is disabled until the user deletes the logged entry.
- **Scenario 3: Past day plan swaps are disallowed**
  - **Given** user navigates to yesterday's Nutrition tab (`date < serverDate`)
  - **When** inspecting past planned meals
  - **Then** `[Swap]` actions are hidden/disabled cleanly (`PAST_DAY_PLAN_IMMUTABLE`).

### ANALYTICS
- `meal_alternatives_opened` (`meal_id`: `string`, `alternatives_count`: `integer`)
- `meal_swapped` (`meal_id`: `string`, `new_template_id`: `string`)

---

## US-NUT-04: Bilingual Arabic/English Food & Beverage Search (3,291 Foods/Beverages + 2,437 Regional Serving Models) & Custom Recipe Calculator

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-04` |
| **Epic** | `EPIC-04` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `nutrition`, `catalog`, `arabic-search` |
| **Target Screens** | `FoodSearchScreen`, `FoodItemDetailSheet`, `CustomRecipeCalculatorSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user wanting to log everyday Egyptian, Gulf, Levantine, or homemade foods and drinks not in my meal plan, I want fast bilingual search across 3,291 reference/estimated foods & beverages + 2,437 regional serving models (`5,728` total indexed) with colloquial Egyptian synonym matching, clear Verified vs. Estimated provenance badges, null-nutrient honesty, and a custom recipe/drink macro calculator.

### PRECONDITIONS
- User is authenticated (`serviceTrack != "workouts_only"` or browsing library).

### SCREEN AND UI DETAILS
1. **Food & Beverage Search Screen:**
   - Top search bar with `300ms` debounce supporting Arabic script queries (e.g., `"ful medames"`, `"mango"`, `"tea with sugar"` in Arabic), colloquial Egyptian transliteration (`"taameya"`, `"koshary"`), and English (`"chicken breast"`).
   - Scope filter chips: `[All]` (`scope=all`), `[Verified Only]` (`scope=approved`), `[Drinks & Cafe]` (`scope=beverages`), `[Plan Staples]` (`scope=planning`).
   - **Coverage & Provenance Notice Banner (`coverageStatus`):**
     - `verified_reference_available`: Subtle green `"Verified nutrition data"` badge.
     - `mixed_verified_and_estimated` / `estimated_model_only_requires_specialist_review`: Clear distinction badge on each card:
       - `Approved` -> Green `"Verified Source"` shield.
       - `Pending Review` -> Amber `"Estimated Recipe"` pill.
   - **Infinite Scroll Pagination:** Loads `20–40` items per page using `offset` & `nextOffset`.
   - Top-right CTA button: `[+ Recipe Calculator]` -> Opens `CustomRecipeCalculatorSheet`.
2. **Food Item Detail Sheet (`GET /v1/foods/{id}`):**
   - Full macro breakdown per `100g` + clear **`Raw (Dry)` vs `Cooked` state indicator** + household serving unit chips (`portions[].grams` paired with `portion_units` labels such as `1 tbsp`, `1 medium baladi loaf`, `1 cup`) + gram input (`1..2000g`) or reference serving count (`unit: "reference"` for estimated beverages/recipes).
   - Shows actual audited provenance source (`USDA FDC`, `UK CoFID 2021`, `Egyptian Baladi Study 2018`, `Lebanese Lab Study 2021`, or `Regional Serving Models`).
   - Null nutrients explicitly render `"Not available in source"` (never `0`).
   - *Approximate Item Acknowledgment:* If `isApproximate == true` (`Pending Review`), shows unobtrusive note `"Nutritional values are recipe estimates"` before logging.
   - CTA: `[Log to {Slot} ({kcal} kcal)]`. Also supports editing saved `grams` on an existing diary entry atomically via `food_entry_update`.
3. **Custom Recipe & Beverage Calculator Sheet (`POST /v1/foods/calculate`):**
   - Add multiple verified base ingredients (e.g., `Chicken 150g` + `Rice 120g`) + additions (e.g., `Olive oil 10ml` or `Sugar 5g`), optional `Final Cooked Weight (g)` (`yieldRatio` calculation).
   - Live `[Calculate Totals & Per 100g]` button displays exact server output (`total`, `per100g`, `coverageByWeight`) and allows `[Save & Log Portion to Diary]`.

### API & BACKEND CONTRACT
1. **`GET /v1/foods?q={q}&scope={scope}&includeEstimated=true&offset={n}&limit=20`**
2. **`GET /v1/foods/{id}`**
3. **`GET /v1/beverages?q={q}&includeEstimated=true&offset={n}&limit=20`**
4. **`POST /v1/foods/calculate`**
   - Request Body: `{ "ingredients": [{ "key": "chicken", "grams": 150 }], "additions": [], "finalWeightGrams": 240 }`.
   - Error Codes: `INGREDIENT_NOT_IN_CATALOG`, `INGREDIENT_NOT_VERIFIED`, `LIQUID_DENSITY_MISSING`, `DENSITY_REQUIRED_FOR_ML`.
5. **`POST /v1/commands?view=receipt`** (`action: "food_entry"`, `source: "ingredient"` or `"manual"` for custom calculated recipes)
   - Note: `source: "ingredient"` accepts planning keys OR approved/regional-serving catalog items (`1..2000g` in `food.mjs`), AND supports logging estimated beverages/recipes by reference serving count using `unit: "reference"` (e.g., `{ "source": "ingredient", "key": "<id>", "unit": "reference", "quantity": 1 }`); custom multi-ingredient recipes log via `source: "manual"` with frozen calculated values!

### RULES & BUSINESS LOGIC
1. **Stale Response Guard:** Ignore search responses whose `querySequenceId` is older than the latest input keystroke so slow responses never overwrite newer typed queries.
2. **Gram Validation (`1..2000g`) & Reference Servings:** Enforce `food.mjs` exact gram bounds on gram-based `source: "ingredient"` entries, converting household portion chips (`1 cup`, `1 piece`) using catalog `portions[].grams` (displayed with `portion_units` labels). For estimated beverages and regional serving models that define per-serving nutrition without `100g` scaling, submit `unit: "reference"` with serving `quantity`.
3. **Zero Null Coercion:** Never convert `null` nutrient values (such as missing fiber or sodium) to `0`.

### MAIN FLOW
1. User taps `+` -> `Search Food & Drinks`.
2. User types `"shai bil-laban"` in Arabic script (or `"mango juice"`) with `Drinks & Cafe` active.
3. App calls `GET /v1/beverages?q=...&includeEstimated=true` and returns matches including Egyptian cafe drinks with `Verified` vs `Estimated` badges.
4. User taps the item, selects `250 ml / 1 Cup` (`portions[].grams` or `unit: "reference"`), verifies `115 kcal`, and taps `[Log to Snack]` -> Commits and updates Today totals.

### EDGE CASES
- **Search Returns 0 Items (`coverageStatus == "missing_coverage"`):** Show friendly empty state with two direct shortcuts: `[Log Custom Calories Manually]` (`US-NUT-07`) or `[Try AI Text/Photo Log]` (`US-NUT-05`, once enabled in Final AI Phase).
- **Liquid Added in `ml` Lacks Density (`LIQUID_DENSITY_MISSING`):** Custom recipe calculator highlights the offending ingredient and asks the user to weigh in `grams` instead.
- **Gram Input Out of Range (`< 1g` or `> 2000g` per `food.mjs`):** Inline validation prevents API failure and shows `"Enter between 1 and 2,000 grams per entry."`.
- **Offline Catalog Search:** Searches locally cached common Egyptian/MENA staples in SQLDelight (plus user Favorites/Recent) seamlessly when disconnected, with subtle `"Searching offline essentials"` footer.

### ACCEPTANCE CRITERIA
- **Scenario 1: Search clearly distinguishes Verified vs. Estimated provenance**
  - **Given** a search query returns both `approved` and `estimated` items
  - **When** `FoodSearchScreen` renders the results list
  - **Then** `approved` items show a green `Verified Source` badge and `estimated` items show an amber `Estimated Recipe` badge.
- **Scenario 2: Custom recipe calculator computes cooked yield accurately**
  - **Given** the user inputs `150g` chicken + `120g` rice and `finalWeightGrams = 240`
  - **When** the user taps `[Calculate]`
  - **Then** `POST /v1/foods/calculate` returns exact `yieldRatio` and `per100g` nutrients without null-to-zero coercion.
- **Scenario 3: Fast typing ignores stale out-of-order search responses**
  - **Given** user types `"fu"` then `"ful"` quickly
  - **When** the slow `"fu"` response arrives after `"ful"`
  - **Then** `querySequenceId` filtering discards `"fu"` results and renders only `"ful"` matches.

### ANALYTICS
- `food_search_executed` (`query_length`: `integer`, `scope`: `string`, `results_total`: `integer`, `coverage_status`: `string`)
- `food_catalog_item_logged` (`food_id`: `string`, `status`: `"approved" | "estimated"`, `grams`: `number`, `slot`: `string`)
- `recipe_calculated` (`ingredients_count`: `integer`, `has_final_weight`: `boolean`)

---

## US-NUT-05: AI Meal Photo & Egyptian/Arabic Dialect Voice/Text Quick Log

> **Rollout Phase:** **Final AI Phase (Deferred — returns `501 FEATURE_DEFERRED_TO_AI_PHASE` until AI rollout).** `ai_meal_parse` is listed in `GET /v1/capabilities` -> `deferredFeatures` until the Final AI Phase launches.

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-05` |
| **Epic** | `EPIC-04` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `nutrition`, `ai-logging`, `pro-feature`, `final-ai-phase` |
| **Target Screens** | `AIMealLoggerScreen` (Camera / Gallery / Mic / Text Tabs), `AIParsedMealReviewSheet` |
| **Entitlement** | `Pro` (Soft Paywall value teaser + 1 free lifetime sample preview for Free users) |
| **Backend Status** | `Final AI Phase (Deferred — POST /v1/nutrition/ai-parse returns 501 FEATURE_DEFERRED_TO_AI_PHASE until AI rollout)` |

### STORY
As a user eating home-cooked Arabic meals or dining out, I want to snap a photo of my plate, speak into my microphone in Egyptian/Gulf Arabic or English (e.g., *"I ate 2 boiled eggs, half a baladi loaf, and 2 tablespoons of ful"*), or type a quick sentence, and review editable itemized calorie/macro estimates matched against CuraFit's food catalog before saving so logging takes under 10 seconds.

### PRECONDITIONS
- Final AI Phase is enabled (`ai_meal_parse` promoted from `deferredFeatures` to `features` in `GET /v1/capabilities`).
- User has `Pro` entitlement (or uses their 1 free onboarding/trial demo scan).
- Camera / Microphone runtime permissions are requested contextually with clear rationale only when tapping Camera or Mic.

### SCREEN AND UI DETAILS
1. **Capture Screen (`AIMealLoggerScreen`):**
   - **3 Mode Switcher Pills:** `[📷 Photo]` | `[🎙️ Voice]` | `[⌨️ Quick Text]`.
   - **Photo Mode:** Clean camera viewfinder with plate-framing guide, flash toggle, gallery picker icon, and helpful tip *"Works great on Koshary, Mahshi, Grilled Meats & Mixed Plates!"*.
   - **Voice Mode:** Large pulsing microphone button with live Arabic/English waveform, language auto-detect (`ar-EG` / `ar-SA` / `en`), and example prompts carousel.
   - **Quick Text Mode:** Multi-line field with one-tap example chips (`"2 boiled eggs + 1 baladi bread"`, `"Chicken shawarma wrap + small fries"`).
2. **Processing State:**
   - Branded shimmer animation (`"Identifying MENA dishes & matching portions..."`) with `[Cancel]` button (`2–5s` timeout budget).
3. **Editable Review Sheet (`AIParsedMealReviewSheet` — Mandatory Before Saving):**
   - Shows uploaded thumbnail/transcript at top + total parsed summary (`545 kcal • 28g P • 62g C • 18g F`).
   - **Itemized Detected Foods List:** Each row shows:
     - Matched food name + provenance badge (`Catalog Match ✓` in green if linked to `food_catalog` ID, or `AI Estimate ⚠️` with confidence `%`).
     - Editable portion quantity / gram weight (`+ / -` buttons or tap to adjust) + `[Replace Match]` (opens quick search) + `[Remove Item]`.
   - **Slot & Date Picker:** Pre-filled from context (`Breakfast` / `Lunch` / `Dinner` / `Snack`).
   - **Primary CTA:** `[Confirm & Log All ({N} Items)]` -> Commits clean `food_entry` commands (or batch).

### API & BACKEND CONTRACT
1. **`POST /v1/nutrition/ai-parse`** *(Final AI Phase — Deferred: returns `501 FEATURE_DEFERRED_TO_AI_PHASE` until AI rollout)*
   - **Auth:** Required (`Authorization: Bearer <accessToken>`, checks `entitlements.features` includes `"ai_meal_logging"` or free trial allowance)
   - **Headers:** `Content-Type: application/json` (or `multipart/form-data` for JPEG/WebP `<= 2 MB` resized client-side to max `1024px`)
   - **Request Body (JSON or Multipart):**
     ```json
     {
       "inputType": "text",
       "text": "2 boiled eggs, half baladi bread, 3 spoons foul with olive oil",
       "locale": "ar-EG",
       "region": "egypt",
       "slot": "breakfast"
     }
     ```
     *(For `inputType: "photo"`: `imageBase64` or multipart `image` + optional caption; for `inputType: "voice"`: `audioBase64` AAC/M4A `<= 30s` or client STT transcript + audio).*
   - **Target Response Schema (`200 OK` once enabled in Final AI Phase):**
     ```json
     {
       "ok": true,
       "data": {
         "parseId": "aip_<uuid>",
         "transcript": "2 boiled eggs, half baladi bread, 3 spoons ful",
         "items": [
           {
             "label": "Boiled Egg",
             "matchedFoodId": "egg",
             "source": "ingredient",
             "grams": 100,
             "portionLabel": "2 large eggs",
             "confidence": 0.96,
             "isApproximate": false,
             "nutrients": { "energy": 155, "protein": 12.6, "carbs": 1.1, "fat": 10.6 }
           }
         ],
         "totals": { "energy": 430, "protein": 21.4, "carbs": 48.2, "fat": 15.8 },
         "remainingFreePreviews": 0
       },
       "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>" }
     }
     ```
2. **`POST /v1/commands?view=receipt`** (`action: "food_entry"`)
   - For items with `matchedFoodId` in approved/planning catalog -> commits as `source: "ingredient"` (`key`, `grams`).
   - For uncataloged AI estimates -> commits as `source: "manual"` (`name`, `energy`, `protein`, `carbs`, `fat`).
   - **Error Codes:**
     - `501 FEATURE_DEFERRED_TO_AI_PHASE`: Returned until Final AI Phase rollout.
     - `402 PRO_ENTITLEMENT_REQUIRED`: Free quota used -> Opens `PaywallScreen` (`US-MON-02`).
     - `422 AI_FOOD_NOT_RECOGNIZED`: Photo was blurry / non-food or empty voice -> Prompt to retake photo or enter text.
     - `429 RATE_LIMITED`: Protect AI inference quota (`20 parses / hour`).

### RULES & BUSINESS LOGIC
1. **Strict Human-in-the-Loop Confirmation:** AI parsing NEVER writes directly to `coaching_food_entries`. Every detected dish MUST appear in `AIParsedMealReviewSheet` with clear confidence and provenance tags so the user confirms or tweaks portions before committing via `food_entry`.
2. **Client-Side Image Compression:** Always downscale camera/gallery photos to max `1024px` long edge at `80%` JPEG/WebP (`< 400 KB`) on-device before upload for snappy performance on Egyptian 4G networks.
3. **Catalog Grounding First:** Backend AI parser resolves detected foods against `food-catalog.mjs` (`EGYPTIAN_SYNONYMS`) whenever possible so nutrients inherit verified audited provenance (`USDA FDC`, `UK CoFID 2021`, `Egyptian Baladi Study 2018`, `Lebanese Lab Study 2021`, `Regional Serving Models`) instead of hallucinated macros.

### MAIN FLOW
1. User taps `+` -> `[AI Photo / Voice]`.
2. User points camera at a plate of grilled chicken, molokhia, and Egyptian rice and taps shutter.
3. Client compresses image (`310 KB`) and posts to `POST /v1/nutrition/ai-parse`.
4. `AIParsedMealReviewSheet` renders 3 detected items (`Grilled Chicken Breast 150g`, `White Rice with Vermicelli 180g`, `Molokhia 200ml`), totaling `615 kcal`.
5. User nudges Rice down from `180g` to `120g` -> Totals update live to `535 kcal` -> Taps `[Confirm & Log All]`.
6. Client submits 3 `food_entry` commands cleanly (preserving offline outbox safety) and returns to `Today`.

### EDGE CASES
- **Blurry or Non-Food Photo (`AI_FOOD_NOT_RECOGNIZED`):** Shows friendly card *"We couldn't spot food clearly in that photo. Try better lighting, or describe your meal in a quick message!"* with `[Retake]` and `[Type Meal]`.
- **Voice Recording Offline:** Speech-to-text/upload requires network; if offline, inform user and offer offline `[Food Search]` or `[Manual Entry]` right from the same modal.
- **Mixed Arabic + English Code-Switching (`"2 scoops whey + 200ml halib"` in mixed script):** Supported natively by the backend parser.
- **Rate Limit Hit (`429 RATE_LIMITED` after `20` parses/hour):** Display calm countdown timer and offer instant `[Search Foods]` / `[Manual Entry]` fallback so logging never stalls.

### ACCEPTANCE CRITERIA
- **Scenario 1: AI photo parse requires confirmation and edits scale macros live**
  - **Given** Final AI Phase is active, a Pro user captures a meal photo, and `POST /v1/nutrition/ai-parse` returns 2 detected items
  - **When** the user decreases item 2 from `200g` to `100g` on `AIParsedMealReviewSheet` and taps Confirm
  - **Then** totals recalculate before logging and `food_entry` commits the adjusted `100g` entry.
- **Scenario 2: Non-food photo returns graceful recovery prompt**
  - **Given** the user photographs a blank table
  - **When** backend returns `422 AI_FOOD_NOT_RECOGNIZED`
  - **Then** zero diary entries are written and `[Retake]` / `[Type Meal]` actions are shown.
- **Scenario 3: User rejects/cancels review sheet without saving**
  - **Given** `AIParsedMealReviewSheet` is open with 3 AI-detected items
  - **When** user taps Back / Dismiss without tapping `[Confirm & Log All]`
  - **Then** zero `food_entry` mutations occur on client or server.

### ANALYTICS
- `ai_meal_parse_started` (`input_type`: `"photo" | "voice" | "text"`)
- `ai_meal_parse_succeeded` (`input_type`: `string`, `items_count`: `integer`, `catalog_match_count`: `integer`, `latency_ms`: `number`)
- `ai_meal_parse_confirmed` (`items_logged`: `integer`, `edited_portions_count`: `integer`)

---

## US-NUT-06: MENA Supermarket Barcode Scanner & Community Product Submission

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-06` |
| **Epic** | `EPIC-04` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `nutrition`, `barcode`, `pro-feature` |
| **Target Screens** | `BarcodeScannerScreen`, `ScannedProductSheet`, `SubmitBarcodeProductSheet` |
| **Entitlement** | `Pro` (`402 PRO_ENTITLEMENT_REQUIRED` for Free users when enforcement is enabled; Soft Paywall on scan) |
| **Backend Status** | `Implemented` |

### STORY
As a user buying packaged dairy, snacks, protein bars, or drinks in Egyptian and Gulf supermarkets, I want to scan product barcodes (EAN-13 / UPC-A) with instant nutrition label lookup — and submit missing local products easily — so packaged foods take 3 seconds to log accurately.

### PRECONDITIONS
- Camera permission granted; device has internet connectivity (or product barcode already in SQLDelight local cache).

### SCREEN AND UI DETAILS
1. **Scanner Viewfinder (`BarcodeScannerScreen`):**
   - Full-screen fast MLKit / VisionKit camera scanner (`EAN-13`, `EAN-8`, `UPC-A`, `UPC-E`) with torch toggle and manual barcode number entry fallback.
2. **Product Found Sheet (`ScannedProductSheet`):**
   - Displays Brand & Product Name (AR/EN), Serving Size (`e.g. 1 Cup / 100g / 1 Bar 45g`), Macros per serving & per `100g`, Provenance badge (`Verified Label` vs `Community Submitted`), and `[Log {qty} Serving(s)]`.
3. **Product Not Found Flow (`SubmitBarcodeProductSheet`):**
   - Friendly state: *"Product barcode `{ean}` isn't in our MENA database yet."*
   - **2 Fast Options:**
     1. `[Log Once Manually]` (`US-NUT-07`).
     2. `[Add Label & Contribute]` (Optional quick form: Product Name, Brand, Serving Grams, `kcal / P / C / F` per `100g` or per serving) -> Calls `POST /v1/foods/barcode` (`201 Created`, `status: "pending_review"`).

### API & BACKEND CONTRACT
1. **`GET /v1/foods/barcode/{ean}`**
   - **Auth:** Required (`Authorization: Bearer <accessToken>`, Pro feature `barcode_scanner` gated when enforcement is enabled -> `402 PRO_ENTITLEMENT_REQUIRED` for Free users)
   - **Success Response (`200 OK`):**
     ```json
     {
       "ok": true,
       "data": {
         "barcode": "6221007001234",
         "nameAr": "Juhayna Greek Yogurt Plain",
         "nameEn": "Juhayna Greek Yogurt Plain",
         "brand": "Juhayna",
         "servingSizeGrams": 150,
         "servingLabel": "1 Cup (150g)",
         "valuesPer100g": { "energy": 78, "protein": 9.5, "carbs": 4.2, "fat": 2.5, "sugars": 3.8, "sodium": 45 },
         "provenance": "verified_brand",
         "isApproximate": false
       }
     }
     ```
   - **Error Codes:** `404 BARCODE_NOT_FOUND`, `400 INVALID_BARCODE_FORMAT`, `402 PRO_ENTITLEMENT_REQUIRED`.
2. **`POST /v1/foods/barcode`** (Community submission, Pro-gated when enforcement is enabled; returns `201 Created`)
   - **Request Body:**
     ```json
     {
       "barcode": "6221007001234",
       "nameEn": "Juhayna Greek Yogurt Plain",
       "nameAr": null,
       "brand": "Juhayna",
       "servingSizeGrams": 150,
       "servingLabel": "1 Cup (150g)",
       "valuesPer100g": {
         "energy": 78,
         "protein": 9.5,
         "carbs": 4.2,
         "fat": 2.5,
         "fiber": 0,
         "sodium": 45,
         "sugars": 3.8
       }
     }
     ```
   - Validates `MACROS_INCONSISTENT_WITH_100G` (server rejects `protein + carbs + fat > 110g` per `100g` physiological tolerance; client validates `<= 100g` inline).
3. **`POST /v1/commands?view=receipt`** (`action: "food_entry"`, `source: "manual"` or catalog-backed `"ingredient"`).

### RULES & BUSINESS LOGIC
1. **Local Cache on Recent Scans:** Cache scanned barcodes in SQLDelight so re-scanning a favorite Greek yogurt or milk works instantaneously even inside a basement supermarket with weak signal.
2. **100g Sanity Check on Submissions:** Reject impossible label entries (`protein + carbs + fat > 100g` inline on client / `> 110g` server tolerance -> `MACROS_INCONSISTENT_WITH_100G`) before saving community items.

### MAIN FLOW
1. User taps `Scan Barcode` in Quick-Log `+`.
2. Camera recognizes EAN-13 `6221007001234` within `300ms`, vibrates gently, and fetches `GET /v1/foods/barcode/6221007001234`.
3. Sheet displays *Juhayna Greek Yogurt (150g cup — 117 kcal, 14.3g P)*.
4. User taps `[Log 1 Cup]` -> Commits `food_entry` and increments Today's totals.

### EDGE CASES
- **Barcode Found in OpenFoodFacts Upstream Proxy vs Local D1:** Backend checks local D1 `food_barcodes` table first, falls back to OpenFoodFacts `/api/v2/product/{ean}.json` when enabled (`ENABLE_OPENFOODFACTS=true`), and persists normalized record cleanly.
- **Permission Denied:** Shows clear explanation and `[Open Settings]` / `[Enter Barcode Digits Manually]` fallback.
- **Offline Repeat Scan in Supermarket Basement:** Cached barcode records inside SQLDelight resolve instantaneously offline and queue `food_entry` cleanly via outbox.
- **Malformed Barcode Checksum (`400 INVALID_BARCODE_FORMAT`):** Rejects non-8..14 digit manual inputs inline before dispatching HTTP calls.

### ACCEPTANCE CRITERIA
- **Scenario 1: Valid barcode resolves product and logs scaled serving**
  - **Given** a Pro user scans a recognized Egyptian product EAN-13
  - **When** the user selects `2 servings` and taps Log
  - **Then** scaled calories and macros commit via `food_entry` cleanly.
- **Scenario 2: Unknown barcode allows instant community label entry**
  - **Given** `GET /v1/foods/barcode/{ean}` returns `404 BARCODE_NOT_FOUND`
  - **When** the user fills the nutrition label form and submits
  - **Then** `POST /v1/foods/barcode` stores the pending product (`201 Created`) and logs the serving immediately for the user.
- **Scenario 3: Invalid `P+C+F > 100g` submission rejected safely**
  - **Given** a community submitter enters `50g` protein, `40g` carbs, and `30g` fat per `100g` (`120g > 100g`)
  - **When** submitting the barcode form
  - **Then** inline validation / `MACROS_INCONSISTENT_WITH_100G` prevents saving impossible macro data.

### ANALYTICS
- `barcode_scanned` (`ean_prefix`: `string`, `found`: `boolean`, `latency_ms`: `number`)
- `barcode_product_submitted` (`barcode`: `string`)

---

## US-NUT-07: Quick Repeat — Favorites, Recent Foods, Manual Macro Entry & 1-Tap Copy Yesterday

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-07` |
| **Epic** | `EPIC-04` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `nutrition`, `quick-repeat` |
| **Target Screens** | `QuickRepeatSheet` (Tabs: `Favorites`, `Recent`, `Copy Yesterday`, `Manual Entry`) |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a creature of habit who often eats the same breakfast or snacks on multiple days, I want 1-tap access to my Favorite foods, Recently logged foods, a `"Copy Yesterday's {Slot}"` shortcut, and a fast Manual Calories/Macros entry form so repeat logging takes one tap.

### PRECONDITIONS
- User is on `NutritionHubScreen` or `QuickLogBottomSheet`.

### SCREEN AND UI DETAILS
1. **Segmented Tabs inside `QuickRepeatSheet`:**
   - **Tab 1 — `Recent`:** Automatically compiled from the last 14 days of `foodEntries` (deduplicated, sorted by frequency + recency) with a `[+ 1-Tap Log]` button on every row.
   - **Tab 2 — `Favorites ☆`:** Starred meals, catalog foods, or custom recipes (`GET /v1/foods/favorites`) with star toggle and `[+ 1-Tap Log]`.
   - **Tab 3 — `Copy Yesterday`:** Groups yesterday's logged entries by slot (`Breakfast`, `Lunch`, `Dinner`, `Snack`). Each slot header has a single `[Copy All to Today's {Slot}]` button!
   - **Tab 4 — `Manual Entry`:**
     - Clean quick form: `Food/Meal Name` (`1..120 chars`), `Calories (kcal)` (`1..5000`, required), optional `Protein (g)`, `Carbs (g)`, `Fat (g)` (`leave blank if unknown` -> sends `null`, preserving null-nutrient integrity!), and `[Save to {Slot}]`.

### API & BACKEND CONTRACT
1. **`GET /v1/foods/favorites`** -> Returns user's starred food templates & custom shortcuts (`{ total, offset, limit, nextOffset, items }`).
2. **`POST /v1/commands?view=receipt`** (`action: "food_favorite"`)
   - Add payload: `{ "op": "add", "item": { "source", "key?", "name", "grams?", "snapshot?" } }`.
   - Remove payload: supports `{ "op": "remove", "id": "<favId>" }`, `{ "op": "remove", "foodId": "<foodId>" }`, OR `{ "op": "remove", "item": { "id" | "key" | "name" } }` (also accepts legacy boolean `favorite: true | false`).
3. **`POST /v1/commands?view=receipt`** (`action: "copy_meal"`)
   - Payload: `{ "fromDate": "YYYY-MM-DD", "toDate": "YYYY-MM-DD", "slot": "breakfast" | "lunch" | "dinner" | "snack" | "all", "replaceDailyTotal"?: true }` (Server copies frozen snapshots into `toDate` cleanly in 1 atomic revision!).
   - Returns **`409 FOOD_DAY_MODE_CONFLICT`** if `toDate` is in legacy `daily_total` mode unless `replaceDailyTotal: true` is passed (or the day is converted via `food_switch_to_entries`).
4. **`POST /v1/commands?view=receipt`** (`action: "food_entry"`, `source: "manual"`) and **`action: "food_entry_update"`** (for atomic in-place edits).
   - Error Codes: `INVALID_MEAL_NAME`, `MANUAL_MEAL_ENERGY_REQUIRED`, `DAILY_TOTAL_REQUIRES_DETAILED_CONVERSION`, `409 FOOD_DAY_MODE_CONFLICT`, `INVALID_FAVORITE_PAYLOAD`, `INVALID_COPY_MEAL_PAYLOAD`.

### RULES & BUSINESS LOGIC
1. **Manual Null Macros:** When `protein`, `carbs`, or `fat` inputs are left blank in Manual Entry, send `null` (NOT `0`) so `food.mjs` preserves honest null macro metadata.
2. **Copy Yesterday Reopens Completion:** Executing `copy_meal` reopens `complete = false` on `toDate` identically to `food_entry`.
3. **Offline Recent & Favorites:** `Recent` tab renders purely from SQLDelight `foodEntries` even offline; `Favorites` caches locally and syncs via outbox.
4. **Editing Existing Manual/Favorite Logs (`food_entry_update`):** Tapping `[Edit]` on any saved `manual`, `ingredient`, or `planned` entry lets the user adjust name, slot, calories, macros, or gram weights cleanly in a single atomic `food_entry_update` command preserving the entry ID.

### MAIN FLOW
1. User taps `+` -> `Manual / Quick Repeat` -> Switches to `Copy Yesterday`.
2. Yesterday's Breakfast shows *3 Boiled Eggs + 50g Oats + Banana (460 kcal)*.
3. User taps `[Copy All to Today's Breakfast]` -> Commits `copy_meal` (`fromDate: yesterday`, `toDate: today`, `slot: "breakfast"`) in 1 atomic tap.

### EDGE CASES
- **Yesterday Had No Entries for That Slot:** Show empty state *"Nothing logged for yesterday's {Slot}"* and suggest `Recent` or `Meal Plan`.
- **Today Used Legacy Daily-Total Mode (`food`):** Backend returns `409 FOOD_DAY_MODE_CONFLICT`; UI prompts inline confirmation to convert to detailed entries (`food_switch_to_entries` or `copy_meal` with `replaceDailyTotal: true`) cleanly (`US-NUT-11`).
- **Starring a Planned Meal Whose Ingredients Contain User's Newly Added Allergen Later:** Client flags the saved Favorite clearly before logging if preferences were updated to exclude that allergen group.
- **Eastern Arabic Digits in Manual Calorie/Macro Fields (`U+0660..U+0669`):** Automatically normalized (`normalizeDigits`) before validation (`1..5000 kcal`) and API dispatch.

### ACCEPTANCE CRITERIA
- **Scenario 1: Copy Yesterday duplicates slot entries in 1 tap (and handles `daily_total` conflict)**
  - **Given** yesterday (`2026-11-20`) has 2 entries in `breakfast`
  - **When** user taps `[Copy All to Today's Breakfast]`
  - **Then** `copy_meal` adds both entries to `2026-11-21` `breakfast` and updates Today's Hero Ring (or surfaces `409 FOOD_DAY_MODE_CONFLICT` confirmation if Today is in legacy `daily_total` mode).
- **Scenario 2: Manual entry with blank optional macros preserves `null`**
  - **Given** user enters `"Wedding Cake Slice"` and `350 kcal` with empty P/C/F fields
  - **When** submitted via `food_entry` (`source: "manual"`)
  - **Then** `protein`, `carbs`, and `fat` are sent as `null`, never coerced to `0`.
- **Scenario 3: Offline Favorite toggle and Recent logging succeed via outbox**
  - **Given** the device is offline
  - **When** the user stars or removes a frequent item (`food_favorite` with `{ id }` / `{ foodId }` / `{ item }`) and logs a Recent item
  - **Then** local SQLDelight updates immediately and queues `food_favorite` + `food_entry` cleanly in `outbox_commands`.

### ANALYTICS
- `quick_repeat_logged` (`tab`: `"recent" | "favorites" | "copy_yesterday" | "manual"`, `entries_count`: `integer`)
- `food_favorite_toggled` (`op`: `"add" | "remove"`)

---

## US-NUT-08: Pantry / "What's in My Fridge?" Smart Meal Finder

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-08` |
| **Epic** | `EPIC-04` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `nutrition`, `pantry`, `differentiator` |
| **Target Screens** | `PantryFinderScreen` |
| **Entitlement** | `Free` (`pantry_finder` in `FREE_FEATURES` — always Free, never Paywall-gated) |
| **Backend Status** | `Implemented` |

### STORY
As a user looking into my fridge or kitchen before deciding what to cook, I want to tap the ingredients I currently have at home (like Eggs, Chicken Breast, Tomatoes, Oats, Ful) and immediately see healthy meal ideas and plan replacements made ONLY from those available ingredients and aligned with my calorie/diet constraints.

### PRECONDITIONS
- `serviceTrack != "workouts_only"`.

### SCREEN AND UI DETAILS
1. **Ingredient Selector (`PantryFinderScreen`):**
   - Searchable categorized ingredient chip grid populated from `GET /v1/pantry/catalog` (e.g., *Proteins*: `Eggs`, `Chicken Breast`, `Tuna`, `Fava Beans`, `Cottage Cheese`; *Carbs*: `Rice`, `Oats`, `Baladi Bread`, `Potatoes`; *Veggies/Fats*: `Tomato`, `Carrot`, `Olive Oil`, `Cucumber`).
   - Quick `"Remember My Kitchen Staples"` toggle so user doesn't re-tap basic pantry items like salt/oil/eggs next time.
   - Sticky CTA: `[Find Meals From {N} Ingredients]`.
2. **Matching Results Feed:**
   - Displays matching meals generated strictly from the selected ingredient set (`pantryAlternatives` in `pantry.mjs`), with calories, macros, prep breakdown, and:
     - `[Log to Diary Now]` (`food_entry`) OR `[Swap Into Today's {Slot}]` (`replace_meal`).

### API & BACKEND CONTRACT
1. **`GET /v1/pantry/catalog`** *(Free)*
   - Directly exposes `pantryCatalog(library)` from `pantry.mjs` returning `{ items: [{ id, label, labelEn, category, keys }] }`.
2. **`POST /v1/pantry/alternatives`** *(Free)*
   - Directly exposes `pantryAlternatives` from `pantry.mjs` via `server/nutrition-tools.mjs`.
   - **Request Body:** `{ "selectedIngredients": ["eggs", "tomato", "fava", "bread"], "slot": "lunch", "mealId": "<optional-target-meal-uuid>", "limit": 12 }` (also accepts legacy `"keys"` alias for `"selectedIngredients"`; `limit` `1..50`, default `12`).
   - **Error Codes:** `400 INVALID_PANTRY_SELECTION`.

### RULES & BUSINESS LOGIC
1. **Strict Subset Guarantee:** Every returned meal's `ingredients` MUST be a subset of the user's selected ingredient keys (`pantryAlternatives` verifies `ingredients.every(i => keys.has(i.key))`).
2. **Clinical & Allergy Safety Preserved:** `pantryAlternatives` honors the user's `preferences` (allergy exclusions, diet rules, medical flags) — never suggests an unsafe ingredient even if the user selected it in the pantry picker.

### MAIN FLOW
1. User opens `Nutrition` -> taps `[What's in My Fridge?]`.
2. User taps `Eggs`, `Tomatoes`, `Fava Beans`, and `Baladi Bread`.
3. App calls `POST /v1/pantry/alternatives` and displays *Shakshuka + Baladi Bread (440 kcal)* and *Ful with Egg & Tomato Salad (470 kcal)*.
4. User taps `[Log to Diary Now]` -> Logs the chosen meal directly to Today's slot.

### EDGE CASES
- **Too Few Ingredients Selected (0 Matches):** Displays helpful suggestion *"No full balanced meal matched just those {N} items. Try adding 1 carb or protein staple (e.g., Rice, Bread, or Eggs)."*
- **More Than 100 Ingredients Selected:** Enforces `pantry.mjs` max `100` items cap.
- **Selected Ingredient Violates User Allergy / Condition:** `pantryAlternatives` strictly honors saved exclusions (`preferences.excludedGroups`) so an allergy-unsafe template is never suggested even if tapped by mistake.
- **Offline Pantry Browse:** Caches last fetched `/v1/pantry/catalog` in SQLDelight and disables live server query with clear offline notice when disconnected.

### ACCEPTANCE CRITERIA
- **Scenario 1: Pantry Finder returns meals exclusively from selected ingredients**
  - **Given** user selects `["eggs", "chicken", "tomato", "rice"]`
  - **When** `POST /v1/pantry/alternatives` executes
  - **Then** every returned meal recipe contains ONLY ingredients from that selected set and complies with the user's diet exclusions.
- **Scenario 2: Zero-match pantry combination displays helpful staple guidance**
  - **Given** user selects only `["olive_oil", "cucumber"]`
  - **When** `POST /v1/pantry/alternatives` returns an empty list
  - **Then** UI suggests adding a protein or carbohydrate staple instead of rendering a blank screen.
- **Scenario 3: Swapping planned meal from Pantry updates active plan version**
  - **Given** user taps `[Swap Into Today's Lunch]` on a Pantry match while Lunch is unlogged
  - **When** `replace_meal` succeeds
  - **Then** Lunch updates cleanly in the Nutrition Plan using the new versioned `planId`.

### ANALYTICS
- `pantry_finder_searched` (`ingredients_count`: `integer`, `matches_count`: `integer`)
- `pantry_meal_action` (`action`: `"log" | "swap"`, `template_id`: `string`)

---

## US-NUT-09: Smart Weekly Grocery / Shopping List (Aisle-Grouped, Budget-Aware & Shareable)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-09` |
| **Epic** | `EPIC-04` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `nutrition`, `grocery`, `pro-feature` |
| **Target Screens** | `GroceryListScreen` |
| **Entitlement** | `Pro` (`402 PRO_ENTITLEMENT_REQUIRED` for Free users when enforcement is enabled; Free users preview teaser + Pro upgrade card) |
| **Backend Status** | `Implemented` |

### STORY
As a user preparing meals for the week, I want CuraFit to automatically aggregate every ingredient across my active 7-day meal plan into a practical, supermarket-aisle-grouped shopping list (showing practical units like `"1.05 kg Chicken Breast"` and `"14 Eggs"`) where I can check off what I already have at home and share via WhatsApp so grocery shopping takes minutes.

### PRECONDITIONS
- An active 7-day nutrition plan exists (`activeNutritionPlanRef != null`).

### SCREEN AND UI DETAILS
1. **Top Scope & Budget Bar:**
   - Scope pill: `[Full Week (7 Days)]` vs `[Next 3 Days]` vs `[Remaining Unlogged Days]`.
   - Active Grocery Budget badge (`Economic` / `Moderate` / `Open Budget` — from `preferences.budget: "low" | "medium" | "high"`) and progress counter (`"9 of 24 items checked ✓"`).
   - `[Share List]` button (exports clean RTL/LTR formatted text for WhatsApp/Notes) & `[Uncheck All]` overflow option.
2. **Aisle-Grouped Collapsible Sections:**
   - *Meat, Poultry, Fish & Eggs* (e.g., `Chicken Breast (Cooked) — 1,050 g`, `Eggs (Raw / As-sold) — 14 pcs`)
   - *Dairy & Cheese* (e.g., `Cottage Cheese — 600g`)
   - *Grains, Bread & Legumes* (e.g., `Baladi Bread (As-sold) — 7 loaves`, `Basmati Rice (Cooked) — 800g`, `Fava Beans — 600g`)
   - *Produce & Vegetables* (e.g., `Tomatoes (Raw / As-sold) — 900g`, `Cucumber — 700g`)
   - *Oils, Nuts & Pantry* (e.g., `Olive Oil — 140 ml`)
3. **Interactive Row:**
   - Checkbox toggle (moves checked items to a collapsed `"In Pantry / Cart ✓"` section at bottom), explicit **`Cooked` vs `Raw / As-sold` state badge** honoring `preparationState` (and `state`) from `planner-core.mjs`, and tap row to see *Which days/meals need this ingredient*.

### API & BACKEND CONTRACT
1. **`GET /v1/plans/{planId}/grocery-list?days=remaining|all|3`**
   - **Auth:** Required (`Authorization: Bearer <accessToken>`, Pro feature `grocery_list` gated -> `402 PRO_ENTITLEMENT_REQUIRED` for Free users when enforcement is enabled)
   - **Success Response (`200 OK`):**
     ```json
     {
       "ok": true,
       "data": {
         "planId": "plan-uuid",
         "daysScope": "all",
         "categories": [
           {
             "categoryId": "proteins",
             "label": "Meat, Poultry, Fish & Eggs",
             "items": [
               {
                 "ingredientKey": "chicken",
                 "foodId": "usda:171077",
                 "name": "Skinless Chicken Breast",
                 "nameEn": "Skinless Chicken Breast",
                 "nameAr": "<arabic-catalog-label>",
                 "state": "cooked",
                 "preparationState": "cooked",
                 "totalGrams": 1050,
                 "practicalQuantityLabel": "1050 g (~7 medium fillets)",
                 "checked": false,
                 "mealRefs": ["2026-11-21:lunch", "2026-11-23:dinner"],
                 "notes": null
               }
             ]
           }
         ]
       }
     }
     ```
2. **`POST /v1/commands?view=receipt`** (`action: "grocery_toggle"`)
   - Payload: `{ "planId": "<planId>", "ingredientKey": "chicken", "checked": true }`.

### RULES & BUSINESS LOGIC
1. **Honest `Cooked` vs `Raw / As-sold` Integrity (`planner-core.mjs`):** Aggregate ingredients by exact `ingredientKey` across selected plan days without applying fabricated cooked-to-raw yield conversion ratios. Each row returns both `preparationState` and `state` so the UI displays an explicit **`Cooked`** or **`Raw / As-sold`** badge matching its canonical `planner-core.mjs` ingredient state.
2. **Auto-Refresh on Plan Swap (`replace_meal`):** When a meal is swapped (`US-NUT-03`), grocery totals automatically recompute for the new `planId` while preserving checked state for matching `ingredientKey`s.
3. **Offline Check-Off:** Toggling checkboxes works smoothly offline via outbox queue while shopping in a supermarket with poor indoor signal.

### MAIN FLOW
1. User taps `Grocery List` inside `Nutrition` tab.
2. App renders the aisle-grouped list for the current 7-day plan (`1,050 g Chicken (Cooked)`, `14 Eggs (Raw / As-sold)`, `750g Oats (Raw / As-sold)`, etc.).
3. User checks off `Eggs` and `Olive Oil` (already in kitchen), then taps `[Share List]` to send remaining items to family on WhatsApp.

### EDGE CASES
- **Plan Changed Mid-Week After Meal Swap or Calorie Adaptation:** List cleanly updates remaining days' totals and clears stale `mealRefs`.
- **Single-Ingredient Custom Recipe Not in Plan:** Only planned meals aggregate into the plan's grocery list (with option to `+ Add Custom Grocery Item` locally).
- **Free User Opens Grocery List (`US-MON-01`):** Displays clean preview teaser alongside a contextual Soft Paywall upgrade card (`[Unlock Full Week Grocery List & WhatsApp Share]`); server enforces `402 PRO_ENTITLEMENT_REQUIRED` when entitlement enforcement is enabled.
- **Offline Supermarket Shopping:** Toggling checkboxes works cleanly inside low-signal supermarkets using SQLDelight + `grocery_toggle` outbox sync.

### ACCEPTANCE CRITERIA
- **Scenario 1: Grocery list aggregates ingredient totals across 7 days accurately**
  - **Given** a 7-day plan includes `150g` oats on 5 days (`750g` total)
  - **When** `GET /v1/plans/{planId}/grocery-list?days=all` loads
  - **Then** `Oats` appears once under *Grains, Bread & Legumes* showing `750g` with both `preparationState` and `state` explicitly matching its canonical `Raw / As-sold` state.
- **Scenario 2: Toggling checked item persists across app restarts and devices**
  - **Given** the user checks off `Eggs`
  - **When** `grocery_toggle` commits and user opens on another device
  - **Then** `Eggs` stays marked checked for that `planId`.
- **Scenario 3: Free user sees teaser preview and Pro paywall prompt**
  - **Given** `entitlements.tier == "free"`
  - **When** user opens `GroceryListScreen`
  - **Then** Soft Paywall prompt (`US-MON-01`) triggers cleanly (`402 PRO_ENTITLEMENT_REQUIRED` on direct API fetch when enforcement is enabled).

### ANALYTICS
- `grocery_list_viewed` (`plan_id`: `string`, `scope`: `string`, `items_count`: `integer`)
- `grocery_item_toggled` (`ingredient_key`: `string`, `checked`: `boolean`)
- `grocery_list_shared` (`unchecked_count`: `integer`)

---

## US-NUT-10: Intermittent Fasting (16:8) Live Timer & Automatic Ramadan Mode

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-10` |
| **Epic** | `EPIC-04` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `nutrition`, `fasting`, `ramadan`, `differentiator` |
| **Target Screens** | `FastingAndRamadanScreen`, `RamadanSettingsSheet` |
| **Entitlement** | `Free` (`ramadan_fasting` in `FREE_FEATURES` — core cultural & fasting differentiator for MENA market) |
| **Backend Status** | `Implemented` |

### STORY
As a user practicing Intermittent Fasting (16:8) or fasting during Ramadan, I want an interactive fasting timer aligned with my configured eating window, plus a 1-tap Ramadan Mode that shifts my daily meals into Suhoor, Iftar, and Night Snack, adds smart hydration reminders between Maghrib and Fajr, and recommends safe workout timing (before Iftar or 2 hours after Iftar).

### PRECONDITIONS
- `serviceTrack != "workouts_only"`.
- For Ramadan Mode: available globally for any user (`pregnant_t1|t2|t3`, `breastfeeding`, `diabetes_t1`, and `diabetes_t2` display an explicit medical consultation banner before enabling Ramadan fasting!).

### SCREEN AND UI DETAILS
1. **Fasting Timer Screen (`FastingAndRamadanScreen`):**
   - Large circular arc timer displaying:
     - Phase Label (`"Fasting Phase — Hydration & Black Coffee/Tea Only"` vs `"Eating Window Open"`).
     - Live `HH:MM:SS` countdown + Start Time & Target Break-Fast Time.
     - Metabolic stage badges along the arc (`0–4h Digestion`, `4–12h Blood Sugar Balance`, `12–16h Fat Oxidation`).
     - Fasting Protocol Presets: `14:10 (14h)` (`14_10`), `16:8 (16h ⭐)` (`16_8`), `18:6 (18h)` (`18_6`), `Ramadan` (`ramadan`), or custom `targetHours` (`8..24h`).
     - Primary button: `[Start Fast Now]` / `[End Fast Early]` / `[Adjust Window Start Hour (8 AM – 4 PM / 8..16)]`.
2. **Ramadan Mode Banner & Settings (`RamadanSettingsSheet`):**
   - Prominent toggle `[Ramadan Mode 🌙]`:
     - Auto-detects Maghrib / Fajr prayer window by user's region/city (`Cairo`, `Riyadh`, `Dubai`, `Amman`, `Casablanca`, etc., with manual time override).
     - **Clinical Safety Guard:** If `conditions` includes `diabetes_t1` / `diabetes_t2` / `kidney` OR `maternalStatus != "none"` (pregnancy/breastfeeding), display a clear warning modal *"Fasting with your declared medical or maternal status requires direct approval from your physician before activating Ramadan fasting mode."* requiring explicit acknowledgment (`medicalClearanceAcknowledged: true`).
     - **Workout Timing Shift Selector (When `serviceTrack != "nutrition_only"`):**
       - `Pre-Iftar (30–45 min before Maghrib — light/moderate intensity recommended)`
       - `Post-Iftar (2 hours after breaking fast — best for strength & PRs)`
       - `Post-Taraweeh (Night session)`
   - **Automatic Meal Slot Remapping:**
     - `Iftar` (at Maghrib time — light dates/soup opener + balanced protein main)
     - `Night Snack / Post-Workout`
     - `Suhoor` (45 min before Fajr — slow-digesting protein, complex carbs, potassium & water emphasis)

### API & BACKEND CONTRACT
1. **`GET /v1/nutrition/fasting-state`** -> Returns standardized DTO `{ mode: "off" | "if_16_8" | "ramadan", phase: "fasting" | "eating", windowStart, windowEnd, startedAt, targetEndAt, ramadanConfig, streakDays }` (also embedded inside `GET /v1/bootstrap` -> `todaySummary.fastingState` & `todaySummary.ramadanMode`).
2. **`POST /v1/commands?view=receipt`** (`action: "fasting_log"`)
   - Payload: `{ "op": "start" | "end" | "adjust_window", "preset": "14_10" | "16_8" | "18_6" | "ramadan", "targetHours": 16, "at": "<iso8601>", "ifStartHour": 12 }` (`targetHours` supports `8..24`; `adjust_window` accepts `ifStartHour` `8..16`, including `8` for `8:00 AM`).
3. **`POST /v1/commands?view=receipt`** (`action: "ramadan_mode"`)
   - Payload: `{ "enabled": true, "iftarTime": "18:05", "suhoorCutoffTime": "04:20", "workoutTiming": "post_iftar", "medicalClearanceAcknowledged": true }`.

### RULES & BUSINESS LOGIC
1. **Pregnancy, Breastfeeding & Diabetes Guard:** In `US-MOB-08`, `intermittent_fasting` is conservatively blocked for `pregnant_*`, `breastfeeding`, and `diabetes_*`. If a pregnant, breastfeeding, or diabetic user manually toggles `Ramadan Mode`, present the clinical safety advisory and do NOT allow silent activation without explicit confirmation (`medicalClearanceAcknowledged: true`); never drop below `minCalorieFloor` (`1800` pregnancy / `1600` breastfeeding / `1500` M / `1200` F) regardless of Ramadan meal compression.
2. **Hydration Night-Window Scheduling (`US-INT-03`):** When Ramadan Mode is enabled, water notifications (`waterReminder`) automatically reschedule solely between `iftarTime` and `suhoorCutoffTime` (`~250 ml/hour`) — zero daytime water reminders while fasting!
3. **16:8 Window Alignment:** Matches `ifStartHour` (`10`, `12`, `14`, `16`) from `US-MOB-08` (`eatingStart`).
4. **Canonical Wire Slot Mapping (`US-NUT-02`):**
   - **For `source: "planned"` meals during Ramadan:** ALWAYS send the planned meal's actual `meal.slot` as wire `slot` (avoiding `MEAL_SLOT_MISMATCH`), and set `displaySlot` to `"suhoor" | "iftar" | "night_snack" | "snack_1" | "snack_2"`.
   - **For ad-hoc logs (`source: "ingredient" | "manual"`):** Map Ramadan slots cleanly onto the 4 canonical server slots: `Suhoor` -> `slot: "breakfast"` (`displaySlot: "suhoor"`), `Iftar` -> `slot: "dinner"` (`displaySlot: "iftar"`), `Night Snack` -> `slot: "snack"` (`displaySlot: "night_snack"`), preventing `400 INVALID_MEAL_SLOT`.

### MAIN FLOW
1. User toggles **Ramadan Mode 🌙** inside `Nutrition` -> `Fasting`.
2. City (`Cairo`) auto-fills `Iftar 18:05` and `Suhoor 04:20`; user picks `Post-Iftar (2h after Maghrib)` for gym sessions.
3. App submits `ramadan_mode`, immediately relabels meal cards to `Iftar`, `Evening Snack`, and `Suhoor`, updates the Today Hero timer, and shifts hydration/meal push notifications to nighttime hours.

### EDGE CASES
- **User Breaks Fast Early (Illness / Fatigue):** Tapping `[End Fast Early]` records partial fast duration cleanly with encouraging neutral feedback (*"Listening to your body always comes first."*).
- **Ramadan Ends / User Disables Ramadan Mode:** Reverts slots cleanly back to `Breakfast / Lunch / Dinner / Snack` (or standard `16:8` schedule) without losing any historical food logs.
- **Diabetic / Pregnant / Breastfeeding User Refuses Medical Clearance Prompt:** Keeps `ramadanMode.enabled = false` without mutating profile or sending unsafe fasting reminders.
- **Midnight Crossing Between `Iftar` (`18:05`) and `Suhoor` (`04:20`):** Eating window timer computes next day `04:20` cutoff accurately across midnight without negative duration display.

### ACCEPTANCE CRITERIA
- **Scenario 1: Enabling Ramadan Mode remaps meal slots & nighttime hydration reminders**
  - **Given** a non-pregnant healthy user enables Ramadan Mode with `Iftar 18:05` and `Suhoor 04:20`
  - **When** `ramadan_mode` commits
  - **Then** the Nutrition Plan displays `Iftar` and `Suhoor` labels (sending `meal.slot` + `displaySlot` for planned meals, and `dinner`/`breakfast` + `displaySlot` for ad-hoc logs) and hydration reminders restrict to `18:05–04:20`.
- **Scenario 2: Live 16:8 timer tracks exact remaining window**
  - **Given** `dietType == "intermittent_fasting"` with `ifStartHour = 12`
  - **When** user views `FastingAndRamadanScreen` at `10:00 AM`
  - **Then** timer counts down `02:00:00` remaining in the fasting phase.
- **Scenario 3: High-risk clinical user requires medical clearance acknowledgment**
  - **Given** user has `diabetes_t1`, `pregnant_t2`, or `breastfeeding`
  - **When** user toggles `Ramadan Mode` on
  - **Then** the physician-approval warning modal blocks activation unless user explicitly checks acknowledgment.

### ANALYTICS
- `fasting_timer_action` (`op`: `"start" | "end" | "adjust_window"`, `duration_hours`: `number`)
- `ramadan_mode_toggled` (`enabled`: `boolean`, `workout_timing`: `string`, `city`: `string`)

---

## US-NUT-11: Daily Food Diary Completion Confirmation & Adaptive Evidence Readiness Indicator

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-11` |
| **Epic** | `EPIC-04` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `nutrition`, `evidence`, `adaptive-review` |
| **Target Screens** | `NutritionDiaryFooter`, `LegacyConvertConfirmationDialog` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user aiming to unlock accurate 14-day adaptive calorie reviews from my Coach, I want a clear completion checklist showing whether I have confirmed my daily food diary complete (`food_complete`) and how close I am to the `10 of 14 days` adaptive review requirement so I understand why my coach recommends or holds calorie updates.

### PRECONDITIONS
- User has logged at least 1 food entry on the selected date (`foodEntries.length >= 1`), OR is viewing a legacy account date containing a daily-total `food` log.

### SCREEN AND UI DETAILS
1. **Diary Footer Action Bar:**
   - Displays current adherence indicator (`"Today logged: 1,780 / 1,850 kcal (96% adherence)"`).
   - Primary Toggle Button:
     - When `complete == false`: `[Confirm Day Complete — I Logged Everything]`
     - When `complete == true`: `[Day Confirmed ✓ — Tap to Reopen]`
2. **Evidence Readiness Card (14-Day Progress Mini-Strip):**
   - Reads `foodCompleteness` from `GET /v1/progress/summary`:
     - *"Adaptive Review Evidence: {completeDays14d} / 10 complete days (within 80–120% target) • Weigh-ins: {prev7}/3 + {curr7}/3"*
3. **Legacy Daily-Total Conversion Dialog (Only for old web accounts with `source == "daily_total"`):**
   - If user taps `[Add Individual Meal]` on a day that only had a legacy `food` daily-total calorie number:
   - Modal: *"This day currently has a quick daily total ({legacyEnergy} kcal). Switch to detailed meal logging so you can add individual foods? (Your previous total will be archived)."* -> `[Switch to Detailed Meals]` (`food_switch_to_entries`).

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "food_complete"`)
   - Payload: `{ "date": "YYYY-MM-DD", "complete": true | false }`.
2. **`POST /v1/commands?view=receipt`** (`action: "food_switch_to_entries"`)
   - Payload: `{ "date": "YYYY-MM-DD", "confirm": true }`.
3. **`POST /v1/commands?view=receipt`** (`action: "food"`) *(Optional legacy quick total fallback ONLY if zero detailed entries exist)*.
4. **`GET /v1/progress/summary`**
   - Error Codes: `FOOD_LOG_REQUIRED_BEFORE_COMPLETE`, `CONVERT_DETAILED_CONFIRMATION_REQUIRED`, `DAILY_TOTAL_REQUIRES_DETAILED_CONVERSION`.

### RULES & BUSINESS LOGIC
1. **Explicit User Declaration:** Day adherence NEVER counts toward the 14-day `calorieReview` (`coaching.mjs`) unless `complete === true` AND `adherence` is within `80%–120%` (`coaching.mjs` / `recovery.mjs` `calorieReview` requires `completeDays14d >= 10` plus `>= 3` distinct weigh-ins in week 1 AND `>= 3` in week 2).
2. **Integrity Guard:** Adding, editing (`food_entry_update`), or deleting an entry automatically flips `complete` back to `false` on both server and client UI so partial unconfirmed edits never falsely certify an incomplete day!
3. **Anti-Crash-Dieting Guidance:** When confirming a day whose total exceeded `120%` of target, Nutrition Specialist reassuringly displays *"Logging honestly helps your coaching team keep your plan accurate — return calmly to tomorrow's target with zero extra restriction."*

### MAIN FLOW
1. User finishes logging Dinner and Evening Snack (`1,810 kcal`, `98%` of target).
2. User taps `[Confirm Day Complete — I Logged Everything]`.
3. `food_complete` (`complete: true`) commits.
4. Evidence Readiness card increments cleanly from `7 / 10 days` to `8 / 10 days`.

### EDGE CASES
- **Day Has 0 Entries:** Button is disabled with tooltip *"Log at least one meal or drink before marking your day complete."*
- **Day Logged `950 kcal` vs `1,850 kcal` Target (`51%` Adherence):** User can still confirm `complete: true` (honestly recording an under-eating day), while the Evidence Readiness tooltip clearly explains *"Confirmed days within 80–120% of target count toward automated calorie reviews."*
- **User Logs One More Snack After Confirming Day Complete:** UI toggles `complete` back to `false` automatically upon `food_entry` and displays a calm prompt `[Re-confirm Day Complete]`.
- **Offline Day Completion Toggle:** Queues `food_complete` cleanly in `outbox_commands` and updates Evidence Readiness counter optimistically.

### ACCEPTANCE CRITERIA
- **Scenario 1: Confirming day complete updates 14-day evidence counter**
  - **Given** user logged `1,800 kcal` (`97%` of `1,850 kcal` target) and `completeDays14d == 9`
  - **When** user taps `[Confirm Day Complete]`
  - **Then** `food_complete` (`complete: true`) commits and `foodCompleteness.completeDays14d` updates to `10`.
- **Scenario 2: Legacy daily-total conversion requires explicit confirmation**
  - **Given** a past date has a legacy `daily_total` record
  - **When** user attempts to add an individual food entry on that date
  - **Then** the conversion prompt appears and invokes `food_switch_to_entries` with `confirm: true` before adding the meal.
- **Scenario 3: Zero-entry day prevents premature completion**
  - **Given** user has `0` logged entries on Today
  - **When** viewing Diary Footer
  - **Then** `[Confirm Day Complete]` is disabled and explains `FOOD_LOG_REQUIRED_BEFORE_COMPLETE` clearly.

### ANALYTICS
- `food_day_confirmed` (`date`: `string`, `complete`: `boolean`, `adherence_pct`: `number`, `entries_count`: `integer`)
- `legacy_food_day_converted` (`date`: `string`)

---

## US-NUT-12: Saved Custom Home Recipes ("My Recipes") & 1-Tap Portion Logging

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-NUT-12` |
| **Epic** | `EPIC-04` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `nutrition`, `recipes`, `mena-kitchen` |
| **Target Screens** | `MyRecipesTab` (inside `FoodSearchScreen` & `NutritionHubScreen`), `CreateEditRecipeScreen`, `LogRecipePortionSheet` |
| **Entitlement** | `Free` *(Core everyday MENA home-cooking logging)* |
| **Backend Status** | `Implemented` (`GET /v1/recipes`, `recipe_save`, `recipe_delete`, `food_entry` `source: "recipe"`) |

### STORY
As a user who cooks recurring Egyptian or Gulf family dishes at home (e.g., baked oats tray, homemade grilled chicken kabsa, lentil soup pot), I want to build a recipe once from verified ingredients, save it under **"My Recipes"** with exact serving count and cooked yield weight, and log any fraction (`0.25..10` servings) or gram portion (`1..3000g`) into my daily food diary in one tap without recalculating every time.

### PRECONDITIONS
- User is authenticated (`serviceTrack != "workouts_only"` or browsing nutrition tools).

### SCREEN AND UI DETAILS
1. **My Recipes List (`MyRecipesTab`):**
   - Displays saved user recipes ordered by most recently updated, each showing Recipe Name (Arabic or English), Total Servings (e.g., `4 servings`), Per-Serving Macros (`385 kcal • 34g P • 42g C • 9g F`), Quality Tier badge (`Verified Ingredients` vs `Contains Estimated`), and quick `[Log 1 Serving]` / `[Edit]` / `[Delete]` actions.
   - Search filter bar + `[+ New Recipe]` primary CTA.
   - Empty state: *"Save your favorite home-cooked trays and smoothies once, then log a portion in 1 tap."*
2. **Create / Edit Recipe Builder (`CreateEditRecipeScreen`):**
   - Inputs: Recipe Name (`2..120` chars), Number of Servings (`1..50`, integer or `0.5` step), optional Final Cooked Weight (`finalWeightGrams`, for accurate per-100g gram logging), optional Notes (`<= 240` chars).
   - Ingredient picker (`1..30` verified catalog/planning ingredients with `grams` or `ml` + optional additions).
   - Live macro preview card computing total pot macros, per-serving macros, and per-100g cooked macros before saving.
3. **Log Recipe Portion Sheet (`LogRecipePortionSheet`):**
   - Mode toggle: `[By Servings (0.25x, 0.5x, 1x, 1.5x, 2x)]` OR `[By Cooked Grams (1..3000g)]` (enabled when `finalWeightGrams` or `inputWeightGrams > 0`).
   - Slot selector (`breakfast | lunch | dinner | snack`, plus Ramadan `displaySlot` mapping).
   - CTA: `[Log Portion ({kcal} kcal)]`.

### API & BACKEND CONTRACT
1. **`GET /v1/recipes?q={optional}&offset=0&limit=30`**
   - Returns paginated `{ total, offset, limit, nextOffset, items: [{ id, name, servings, totalGrams, finalWeightGrams, yieldRatio, qualityTier, ingredients[], additions[], notes, perServing, per100g, totals, createdAt, updatedAt }] }`.
2. **`POST /v1/commands?view=receipt`** (`action: "recipe_save"`)
   - Payload: `{ "id": "<optional-existing-uuid>", "name": "Homemade Chicken Rice Tray", "servings": 4, "ingredients": [{ "key": "chicken", "grams": 600 }, { "key": "rice", "grams": 300 }], "additions": [{ "key": "olive_oil", "grams": 20 }], "finalWeightGrams": 1100, "notes": "Oven baked" }`.
   - Server computes exact verified nutrients using `calculatePreparedBeverageOrRecipe`, persists in `coaching_custom_recipes`, and rejects > 100 saved recipes with `409 RECIPE_LIMIT_REACHED`.
3. **`POST /v1/commands?view=receipt`** (`action: "recipe_delete"`)
   - Payload: `{ "id": "<recipeId>" }` (`404 RECIPE_NOT_FOUND`).
4. **`POST /v1/commands?view=receipt`** (`action: "food_entry"`, `source: "recipe"`)
   - Payload: `{ "date": "2026-11-21", "slot": "lunch", "displaySlot": "iftar", "source": "recipe", "recipeId": "<recipeId>", "servings": 1.5 }` (OR `"grams": 275`).
   - Server freezes the recipe snapshot onto the food entry at log time; `food_entry_update` also supports scaling `servings` or `grams` atomically in place.
   - Error Codes: `INVALID_RECIPE_PAYLOAD`, `RECIPE_NOT_FOUND`, `RECIPE_LIMIT_REACHED`, `INGREDIENT_NOT_IN_CATALOG`, `LIQUID_DENSITY_MISSING`.

### RULES & BUSINESS LOGIC
1. **Immutable Historical Snapshots:** Editing or deleting a saved recipe NEVER alters or corrupts past `food_entry` logs previously recorded from that recipe, because every logged diary entry stores a frozen nutrient snapshot.
2. **Zero-Energy Guard:** Recipes with `<= 0 kcal` total energy are rejected cleanly (`400 INVALID_RECIPE_PAYLOAD`).
3. **Null-Nutrient Honesty:** If any ingredient lacks a reference micronutrient (e.g., sodium or fiber), per-serving & per-100g values preserve `null` cleanly rather than coercing to `0`.
4. **Max Library Cap (`100` Recipes):** Prevents unbounded D1/bootstrap bloat (`409 RECIPE_LIMIT_REACHED`).
5. **GDPR Compliance:** All rows in `coaching_custom_recipes` are included in `GET /v1/account/export` and permanently erased in `DELETE /v1/account/delete`.

### MAIN FLOW
1. User opens `FoodSearchScreen` -> `My Recipes` tab -> `[+ New Recipe]`.
2. User names it `"High-Protein Oats Tray"`, sets `servings: 4`, adds `oats 240g` + `milk 600g` + `egg 120g`, and taps `[Save Recipe]`.
3. `recipe_save` commits (`390 kcal / serving`).
4. User taps `[Log 1 Serving]` -> selects `Breakfast` -> `food_entry` (`source: "recipe"`, `servings: 1`) commits and updates Today macros immediately.

### EDGE CASES
- **Recipe Deleted After Being Logged Yesterday:** Yesterday's food diary continues rendering exact frozen macros (`390 kcal`) with zero broken references.
- **User Logs Non-Existent or Stale `recipeId` Offline:** Server returns `404 RECIPE_NOT_FOUND`; outbox poison-pill policy surfaces a clear dismissible alert and removes the stale pending entry cleanly.
- **User Reaches 100 Saved Recipes:** `[+ New Recipe]` displays friendly prompt `"Maximum 100 saved recipes reached — delete an older recipe to add a new one"` (`RECIPE_LIMIT_REACHED`).
- **Editing Logged Recipe Portion Later:** User edits `servings` from `1` to `1.5` via atomic `food_entry_update` without losing entry ID or reopening stale duplicates.

### ACCEPTANCE CRITERIA
- **Scenario 1: Creating and logging a custom recipe computes accurate scaled per-serving macros**
  - **Given** user saves a 4-serving recipe via `recipe_save`
  - **When** user logs `1.5` servings via `food_entry` (`source: "recipe"`)
  - **Then** the diary entry stores `1.5x` per-serving calories and macros with a frozen snapshot.
- **Scenario 2: Editing or deleting a recipe preserves historical food diary entries**
  - **Given** a recipe was logged yesterday and then deleted via `recipe_delete`
  - **When** user views yesterday's `GET /v1/food-diary`
  - **Then** yesterday's entry retains its exact original name and nutrients intact.
- **Scenario 3: Cap and validation errors are enforced cleanly**
  - **Given** invalid empty ingredients or missing `recipeId`
  - **When** submitting `recipe_save` or `food_entry` (`source: "recipe"`)
  - **Then** server returns `400 INVALID_RECIPE_PAYLOAD` or `404 RECIPE_NOT_FOUND` with pure-English error codes.

### ANALYTICS
- `custom_recipe_saved` (`is_edit`: `boolean`, `ingredients_count`: `integer`, `servings`: `number`)
- `custom_recipe_logged` (`unit_mode`: `"servings" | "grams"`, `slot`: `string`)
- `custom_recipe_deleted` (`recipe_id`: `string`)
