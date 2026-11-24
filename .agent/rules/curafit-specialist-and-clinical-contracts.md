---
description: Cross-cutting CuraFit backend contracts for Specialist Team brand voice, machine-readable codes, shared clinical safety gates, unit_system/region_id hydration parity, and calibrationMetadata.
globs: "**/*"
alwaysApply: true
---

# CuraFit Backend Cross-Cutting Contracts (`CuraFit API v1`)

Every existing and upcoming Cloudflare Worker endpoint (`server/*.mjs`), domain module (`*.mjs`), error/coaching catalog (`contracts/*.json`), push notification template (`server/push.mjs`), and future Q&A prompt (`EPIC-06 / KAN-84`) MUST satisfy these five mandatory standards while preserving full backwards compatibility with existing KMM mobile clients (`{ ok: true, data, meta }` / `{ ok: false, error: { code, message, params, fieldErrors, retryable, details? }, meta }` and `js_sunday_0` weekday indexing).

---

## 1. Human-Expert Brand Voice ("CuraFit Specialist Team" — Zero AI / Automated Exposure)
- **Zero Robotic/AI Copy in User-Facing Output:** Never expose mechanical or AI terminology in any user-facing server string (plan warnings, eligibility reasons, clinical summaries, daily briefs, meal/workout explanations, push notifications, error messages shown to end users, or Q&A prompts/responses).
  - **Forbidden English terms in user-facing copy (case-insensitive):** `AI`, `AI Coach`, `Smart Coach`, `automated`, `automatic`, `automatically`, `algorithm`, `algorithmic`, `engine`, `bot`, `LLM`.
  - **Forbidden Arabic terms in any user-facing or future Q&A output:** Arabic equivalents of automated (`\u0622\u0644\u064A`), smart (`\u0627\u0644\u0630\u0643\u064A`), and engine (`\u0645\u062D\u0631\u0643`). (Note: all backend API contracts, error messages, coaching messages, and docs remain 100% pure English; Arabic localization happens on-device in the KMM client.)
- **Canonical Brand Framing:** Frame all guidance, reviews, screening summaries, and Q&A (`US-CCH-05` / `KAN-84`) strictly as the **CuraFit Specialist Team** (e.g., `"Ask the CuraFit Specialist Team"`, `"CuraFit Specialist Team screening summary"`).
- **Backwards-Compatible Internal Wire Keys:** Do not rename existing machine-only wire keys (such as `reviewScope` enum tokens or error `code` IDs like `FEATURE_DEFERRED_TO_AI_PHASE`) in ways that break deployed clients; update the user-facing `message` copy and ensure clients never render raw internal keys.

## 2. Machine-Readable Clinical, Warning & Calibration Codes (Non-Breaking Additive Fields)
- **Never Rely on Substring Parsing:** Every response that returns human-readable warnings, eligibility reasons, or calibration notes MUST also return parallel machine-readable `UPPER_SNAKE_CASE` code arrays while keeping existing string fields for backwards compatibility:
  - Keep `warnings: string[]` and add `warningCodes: string[]` (plus optional structured `warningItems: [{ code, params, message }]`).
  - Keep `eligibility.reasons` / `eligibilityReasons: string[]` and add `eligibilityReasonCodes: string[]`.
  - Register every emitted code in `contracts/coaching-codes.json` (or `contracts/error-codes.json` for `4xx`/`5xx`) and run `node scripts/sync-error-contracts.mjs` so `docs/COACHING_CODES.md` and `docs/ERROR_CODES.md` stay in sync.

## 3. Centralized Clinical Safety Gate Parity (`EPIC-01`, `EPIC-04`, `EPIC-05`, `EPIC-09 / KAN-96`)
- **Single Source of Truth:** Onboarding (`/v1/eligibility`, `/v1/plans/preview`, `generate`), profile edits (`profile_update`), plan reconfiguration/renewal (`renew_plan`, `comeback_restart`), meal swaps (`replace_meal`, `meal-alternatives`, `pantry/alternatives`), and workout swaps (`replace_exercise`, `exercise-alternatives`, `ad_hoc_exercise`) MUST all invoke the same centralized clinical safety gate (`evaluateClinicalSafetyGate()`):
  - **Workout Clinical Review Gate:** `>= 4` canonical active injuries OR `parqRedFlag === true` on any workout-bearing track (`nutrition_and_workouts`, `workouts_only`) -> require specialist clinical review (`MULTI_INJURY_REQUIRES_REVIEW` / `PARQ_CLEARANCE_REQUIRED`, `workoutFeasible: false`), while STILL evaluating and returning `nutritionFeasible` so the client can offer safe `nutrition_only` fallback.
  - **Multi-Condition Dietary Gate:** `>= 3` overlapping dietary-restricting chronic conditions (`diabetes_t1`, `diabetes_t2`, `hypertension`, `cholesterol`, `celiac`, `ibs`, `gout`, `kidney`), OR `kidney + diabetes_t1`, OR `pregnant_* + (kidney | diabetes_t1)` -> `MULTI_CONDITION_CLINICAL_REVIEW`.
  - **Mutual Exclusion:** `diabetes_t1` + `diabetes_t2` -> `400 CONFLICTING_CONDITIONS` on all preview, eligibility, commit, and edit paths.
  - **Condition & Exclusion Parity:** Enforce identical rules for `dash` (`<= 2300 mg` sodium/day), `favism` (fava/falafel excluded), `lactose_intolerance` (all dairy excluded), `celiac` (all gluten excluded), and `offal` (`liver` excluded) across planning, previews, meal swaps, and pantry alternatives.
  - **Last-Protein-Pillar Protection:** Compute `activeProteinPillars` after applying `dietType`, `diseases`, and `excludedGroups`; block or mark `nutritionFeasible: false` cleanly before meal generation whenever zero usable protein pillars remain.
  - **Maternal & Senior Safety Floors:** Enforce pregnancy energy floor `>= 1800 kcal` (caloric cuts forbidden; T1 `+0`, T2 `+340`, T3 `+450`), breastfeeding floor `>= 1600 kcal` (`+400 kcal` buffer, max `-300 kcal` deficit, forced `slow` pace), maternal protein `>= 1.4 g/kg` + trimester add-on, senior (`70+`) deficit cap `-400 kcal`, protein floor `>= 1.2 g/kg`, `workoutUiModeDefault: 'simple'`, and joint/pregnancy/senior exercise exclusions.

## 4. Persist & Sync `unit_system` and `region_id` + Regional Hydration Bonuses (`EPIC-02`, `EPIC-07`, `EPIC-09`)
- **Canonical Storage & Dual-Key Backwards Compatibility:**
  - Accept both camelCase and snake_case inputs on onboarding, preview, and profile edit endpoints: `unitSystem` / `unit_system` (`"metric" | "imperial"`, default `"metric"`) and `region` / `regionId` / `region_id` (`"egypt" | "gulf" | "levant" | "maghreb"`, default `"egypt"`).
  - Persist in D1 (`coaching_accounts.body` profile + preferences, and sync outbox) and return consistently across `/v1/plans/preview`, `/v1/bootstrap`, `/v1/state`, and profile update receipts (`unitSystem` + `unit_system`, `region` + `region_id`).
- **Uniform Regional & Clinical Hydration Calculation (`dailyWaterTarget()`):**
  - Every hydration target across previews, bootstrap, water logs, progress summary, weekly wrapped, and widgets MUST call the single `dailyWaterTarget()` helper with:
    - Base: `weightKg * 35 ml` (+ activity `+350 ml` moderate / `+500 ml` active)
    - Warm climate (`egypt`, `gulf`): `+200 ml`
    - Workout day or `>= 30 min` cardio: `+500 ml`
    - Gout: `+500 ml`
    - Pregnancy (`pregnant_t1` / `pregnant_t2` / `pregnant_t3` / `pregnant`): `+300 ml`
    - Breastfeeding: `+600 ml`
    - Clamped to `2.0 L .. 5.0 L` (rounded to `0.1 L`, `targetCups = Math.round((liters * 1000) / 250)`), exposing structured bonus breakdown (`bonuses`) alongside `liters` and `targetCups`.

## 5. Structured `calibrationMetadata` for Staged Specialist UX (`EPIC-04`, `EPIC-05`, `EPIC-06 / KAN-85`)
- Plan previews (`/v1/plans/preview`), plan creation/regeneration (`generate`, `renew_plan`, `comeback_restart`), weekly check-ins (`review`), and accepted adaptive changes (`adaptation`) MUST return an additive `calibrationMetadata` object so the client's `SpecialistPlanPreparationCard` can render truthful, personalized review milestones:
  - `calibrationReasons: string[]` (canonical `UPPER_SNAKE_CASE` codes explaining what was calibrated)
  - `adjustedCalories: number | null` (and `previousCalories?: number | null`, `calorieDelta?: number`)
  - `adjustedMacros: { protein: number, carbs: number, fat: number } | null`
  - `protectedJoints: string[]` (canonical active injury keys + senior/maternal joint flags when applicable)
  - `activeProteinPillars: string[]` (effective protein pillars remaining after diet, conditions, and exclusions)

## 6. Postman Retired (Do Not Regenerate or Update Postman Artifacts)
- Postman is retired for CuraFit API v1. Do **NOT** run `npm run postman:generate`, modify `postman/*.json`, or publish Postman Cloud collections/docs on future changes. Maintain `contracts/openapi.yaml`, `contracts/error-codes.json`, `contracts/coaching-codes.json`, and `docs/ERROR_CODES.md` / `docs/COACHING_CODES.md` directly.
