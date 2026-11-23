# EPIC-01: Mobile Conversational Onboarding & Smart Plan Engine — API Alignment & Live Backend Contract

> **Existing Jira Epic:** `KAN-34` (*Mobile Conversational Onboarding & Smart Plan Engine*)
> **Child Jira Stories (Preserved):** `KAN-35` (`US-MOB-01`) through `KAN-43` (`US-MOB-09`)
> **Purpose of This Document:** The UX screens, chat steps, safety gates, and mathematical equations in `KAN-34` (`KAN-35`..`KAN-43`) map 1:1 to live **CuraFit API v1** endpoints. All backend preview, eligibility, onboarding generation, maternal/senior safety, and bootstrap contracts documented below are **implemented and live** on Cloudflare Workers + D1.

---

## 1. Story-by-Story Endpoint Mapping (`US-MOB-01` .. `US-MOB-09`)

| Story ID (Jira) | Story Title | Endpoints & Commands | Status | Alignment Rules & Live Backend Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **`US-MOB-01`** (`KAN-35`) | App Launch Routing, Account Check (`account_check`), Login Return & Data Recovery | `GET /v1/health`<br>`GET /v1/capabilities`<br>`GET /v1/bootstrap` (`If-None-Match`)<br>`POST /v1/auth/oauth/google`<br>`POST /v1/auth/oauth/apple` | `Implemented` | When returning from Sign-In (`account_check = "yes"`), authenticate via Social OAuth (`EPIC-02`), then call `GET /v1/bootstrap`. If `data.profile == null` (`onboardingCompleted == false`, auth state `signed_in_needs_onboarding`), return to Onboarding Chat at first unanswered step. If `data.profile != null` (`onboardingCompleted == true`, auth state `signed_in_active`), show the **Data Recovery Prompt** (`restore_data` -> hydrate local SQLDelight + fetch active plans `/v1/plans/{id}` & `/v1/workout-plans/{id}` and go to Today; `start_fresh` -> keep auth session and start local draft from `name`). |
| **`US-MOB-02`** (`KAN-36`) | Conversational Chat Framework, Dynamic Progress, Local Persistence & In-Chat Answer Editing | Local-only SQLDelight / DataStore (`onboardingDraft`) until Summary sync; optional `POST /v1/commands?view=receipt` (`action: "timezone"`) if user changes region/timezone post-login | `Implemented` | All Q&A bubbles, edits, and the Dependency Invalidation Matrix run deterministically offline on-device during onboarding with zero network latency per step. |
| **`US-MOB-03`** (`KAN-37`) | Name, Age & Age Safety Gate (`underage_gate` `<18` & `70+ Senior Mode`) | Pre-screening check via `POST /v1/eligibility` and `POST /v1/plans/preview` | `Implemented` | `planner-core.mjs`, `server/coaching.mjs`, and `server/workouts.mjs` support `age` in `18..95` and automatically enable `seniorMode = true` for `age >= 70` (deficit capped at `-400 kcal`, protein floor `>= 1.2 g/kg`, high-impact/heavy spinal-loading exercise exclusions). Under-18 remains strictly blocked. Profile `name` is validated (`2..50` characters, `400 INVALID_PROFILE_NAME`). |
| **`US-MOB-04`** (`KAN-38`) | Biological Sex, Maternal Status (`pregnant_t1|t2|t3`, `breastfeeding`), Measurements & Unit System | Included in `POST /v1/eligibility`, `POST /v1/plans/preview`, and `POST /v1/commands` (`action: "generate"`) | `Implemented` | Backend enforces `maternalStatus` (`none`, `pregnant_t1`, `pregnant_t2`, `pregnant_t3`, `breastfeeding`) for `sex === "female"` and `age <= 50` (otherwise returns `400 INVALID_MATERNAL_PROFILE`). Pregnancy calorie calibration does **not** stack on `gain` surplus (`T1 +0`, `T2 +340`, `T3 +450` above maintenance). Breastfeeding deficit is capped at `-300 kcal` before adding `+400 kcal`. Also supports `unitSystem: "metric" | "imperial"` (`400 INVALID_UNIT_SYSTEM` if invalid). |
| **`US-MOB-05`** (`KAN-39`) | Fitness Goal, Target Weight with Live BMI Warning & Weekly Goal Pace | Included in `POST /v1/eligibility`, `POST /v1/plans/preview`, and `POST /v1/commands` (`action: "generate"`) | `Implemented` | Uses canonical `goalPace: "slow" | "moderate" | "fast"`. `lose` is blocked when `currentBmi < 18.5` (`400 WEIGHT_LOSS_UNDERWEIGHT_UNSAFE`) or pregnant (`422 MATERNAL_CALORIE_CUT_BLOCKED`). `targetWeight` bounds are `35..250 kg`. Recomposition activates on `muscle_gain` when `abs(targetWeight - weight) < 0.5 kg`. Passing `bmiWarningOverride: true` allows intentional custom targets while strictly preserving calorie floors (`1500` M / `1200` F / `1800` Pregnant / `1600` Breastfeeding). |
| **`US-MOB-06`** (`KAN-40`) | Service Track Selection & Workout Setup (`fitness_level`, `workout_location`, `workout_days`, `workout_day_split`, `home_equipment`) | Included in `POST /v1/plans/preview` and `POST /v1/commands` (`action: "generate"`) | `Implemented` | `normalizeWeekdayDraft` converts `weekdayConvention: "saturday_0"` to canonical `js_sunday_0` automatically. Supports `1..7` workout days (with recovery warning on 7-day schedules), canonical `workoutLocation: "gym_only" | "home_only" | "home_and_gym"`, `homeEquipment` aliases (`bands -> resistance_bands`, `chair -> bench`), and optional `externalTrainingDays` on `nutrition_only + muscle_gain` (included in daily water target `+500 ml` boost). |
| **`US-MOB-07`** (`KAN-41`) | Smart Hybrid Workout Split, Session Duration & Injury-Safe Filtering | Included in `POST /v1/eligibility`, `POST /v1/plans/preview`, and `POST /v1/commands` (`action: "generate"`) | `Implemented` | Short injury keys (`knee`, `lower_back`, `shoulder`, `neck`, `wrist`, `ankle`, `elbow`, `hip`, `diastasis_recti`) map cleanly to canonical `*_pain` filters including elbow-safe substitutions. `pregnant_t1` excludes high-impact/plyo/crunch/deadlift movements (`PREGNANCY_ALL_TRIMESTERS_UNSAFE_RE`); `pregnant_t2`/`t3` additionally exclude supine/flat-bench movements (`PREGNANCY_POST_T1_SUPINE_RE`). `advanced` lifters receive `4` sets on compound movements when `sessionDuration >= 45` (falling back to `3` sets if time budget is exceeded). |
| **`US-MOB-08`** (`KAN-42`) | Nutrition Setup (Activity, Conditions, Diet School, IF Start Hour / Meals Count, Budget & Allergies) | Included in `POST /v1/eligibility`, `POST /v1/plans/preview`, and `POST /v1/commands` (`action: "generate"`) | `Implemented` | `generate` and `previewPlan` honor `activity || dailyActivity` and `diseases || conditions` (`diabetes_t1`, `diabetes_t2`, `hypothyroid`, `celiac`, `kidney`, `insulin_resistance`, `pcos`, `hypertension`, `cholesterol`, `ibs`, `gout`). Uses canonical `budget: "low" | "medium" | "high"`, `region: "egypt" | "gulf" | "levant" | "maghreb"`, `ifStartHour` mapped to `eatingStart`, and canonical lowercase `excludedGroups` (`spicy`, etc.). |
| **`US-MOB-09`** (`KAN-43`) | Plan Summary Screen, Mathematical Equations & Dual-Path `"Start Plan"` Handoff | Canonical CuraFit API v1 sequence:<br>1. `POST /v1/plans/preview` (public, IP rate-limited)<br>2. OAuth (`POST /v1/auth/oauth/google` or `/apple`) if unauthenticated<br>3. `POST /v1/account/consents` (single or batch `items[]`: `health_data_processing`, `terms_and_privacy`)<br>4. `POST /v1/eligibility` (public, IP rate-limited)<br>5. `POST /v1/commands?view=full` (`action: "generate"`)<br>6. `GET /v1/bootstrap` (sync smart `ETag`, `consents`, & `revision`) | `Implemented` | Mobile calls stateless `POST /v1/plans/preview` for the Summary Screen preview (with local mirror fallback only when offline), then executes the canonical sequence above. Offline entry to `Today` before initial `generate` succeeds is disallowed. `generate` enforces `overwriteExisting: false` (`409 PROFILE_ALREADY_EXISTS`) when an account already has a profile, clamps onboarding initial energy safely at `4200 kcal` with a transparent ceiling note instead of erroring, validates `healthConfirmed: true` on `workouts_only`, and persists `unitSystem` and `workoutUiMode` (`"simple" \| "pro"`). |

---

## 2. Exact Sync Sequence for Onboarding Commit (`US-MOB-09`)

Before tapping **`[Start My Plan]`**, the Summary Screen calls **`POST /v1/plans/preview`** (stateless, public/unauthenticated, IP rate-limited) with the onboarding draft to fetch authoritative targets (`dailyCalories`, `macros` respecting `high_protein`/`low_carb`/`keto` overrides, `waterTarget`, `waterTargetLiters`, `restDayWaterTarget`, `workoutDayWaterTarget`, `estimatedExercisesPerSession`, `estimatedWeeksMin`, `estimatedWeeksMax`, `recommendedSplit`, `seniorMode`, `warnings`, `clinicalBlocks`, `workoutUiModeDefault`, and `eligibility`) directly from the unified backend engine (falling back to the identical local KMM mirror formula only when offline).

When the user taps **`[Start My Plan]`** on the Onboarding Summary screen:

### Path A: Already Authenticated (`isAuthenticated == true`)
1. Record versioned legal & health consents atomically (single object or batch `items[]`):
   - `POST /v1/account/consents` -> `{ "items": [{ "consentType": "health_data_processing", "version": "1.0.0", "accepted": true }, { "consentType": "terms_and_privacy", "version": "1.0.0", "accepted": true }] }`
2. Verify eligibility pre-screen:
   - `POST /v1/eligibility` (public pre-screening) with onboarding biometrics, conditions, injuries, maternal status, `serviceTrack`, and `healthConfirmed`.
3. Generate and persist canonical server profile + 7-day nutrition plan + workout plan:
   - `POST /v1/commands?view=full`
   - Headers: `Authorization: Bearer <accessToken>`, `Idempotency-Key: <deterministic-onboarding-uuid>`, `X-Client-Platform: android|ios`, `X-Client-Version: <semver>`
   - Body:
     ```json
     {
       "revision": 0,
       "action": "generate",
       "payload": {
         "name": "Ahmed Mohamed",
         "age": 30,
         "sex": "male",
         "maternalStatus": "none",
         "seniorMode": false,
         "unitSystem": "metric",
         "height": 175,
         "weight": 85,
         "goal": "lose",
         "targetWeight": 75,
         "bmiWarningOverride": false,
         "goalPace": "moderate",
         "serviceTrack": "nutrition_and_workouts",
         "fitnessLevel": "intermediate",
         "workoutLocation": "gym_only",
         "weekdayConvention": "saturday_0",
         "selectedWorkoutDays": [0, 1, 3, 5],
         "dayLocations": {},
         "homeEquipment": ["none"],
         "workoutSplitPreference": "auto",
         "sessionDuration": 45,
         "injuries": ["knee"],
         "healthConfirmed": true,
         "activity": "light",
         "diseases": ["insulin_resistance"],
         "dietType": "balanced",
         "eatingStart": "12:00",
         "mealsCount": 3,
         "region": "egypt",
         "locale": "ar-EG",
         "timezone": "Africa/Cairo",
         "budget": "medium",
         "excludedGroups": ["fish", "shellfish"],
         "overwriteExisting": true,
         "workoutUiMode": "pro"
       }
     }
     ```
4. Hydrate SQLDelight local database from `data` (`profile`, `preferences`, `plans`, `workoutPlan`, `revision`, `entitlements`, `notificationPreferences`), call `GET /v1/bootstrap` to lock initial smart `ETag` (`W/"boot-..."`) and `consents`, clear `onboardingDraft`, mark `onboardingCompleted = true` (`signed_in_active`), and replace navigation stack to **`Today` (`US-HOME-01`)**.

### Path B: Unauthenticated (`isAuthenticated == false`)
1. Save `pendingSyncPlan` locally in encrypted storage / SQLDelight.
2. Navigate to **Passwordless Social Sign-In (`US-AUTH-01`)** with `entrySource = "onboarding_summary_start_plan"`.
3. Authenticate via Google or Apple (`POST /v1/auth/oauth/google` or `/apple`).
4. Call `GET /v1/bootstrap` and inspect `data.profile` (`data.onboardingCompleted`):
   - **If `data.profile == null` (`signed_in_needs_onboarding`)**: Immediately run Steps 1–4 of Path A above using the account's current `revision` (usually `0`), then navigate to **`Today`**.
   - **If `data.profile != null` (`signed_in_active`)**: Show the **Plan Conflict Resolution Sheet (`US-AUTH-02`)**:
     - **`[Use My New Plan (Overwrite Old Plan)]`** -> Runs Path A with the account's latest `revision` (`overwriteExisting: true`), archiving the old server plans safely via `s.history` / `s.workoutArchives`.
     - **`[Restore My Old Saved Plan]`** -> Discards `pendingSyncPlan`, hydrates local SQLDelight from server `GET /v1/bootstrap` + `GET /v1/plans/{id}` + `GET /v1/workout-plans/{id}`, and navigates to **`Today`**.

---

## 3. Live Backend Capabilities Summary for Epic 01 Parity

1. **`POST /v1/plans/preview` & `POST /v1/eligibility`:**
   - Both endpoints are stateless & public (`security: []`, IP rate-limited); `previewPlan` returns deterministic onboarding summary calculations (`dailyCalories`, `macros` honoring `high_protein`/`low_carb`/`keto` diet macro overrides, `waterTarget`, `waterTargetLiters`, `restDayWaterTarget`, `workoutDayWaterTarget`, `estimatedExercisesPerSession`, `estimatedWeeksMin`, `estimatedWeeksMax`, `recommendedSplit`, `seniorMode`, `warnings`, `clinicalBlocks`, `workoutUiModeDefault`, and `eligibility`) using the exact same unified engine as `action: "generate"` (including `healthConfirmed` and underweight/targetWeight/BMI parity).
2. **`POST /v1/eligibility` & `POST /v1/commands` (`action: "generate"`):**
   - `age` bounds `18..95` (`70..95` activates `seniorMode = true` with `-400 kcal` deficit cap, `>= 1.2 g/kg` protein floor, and joint-safe low-impact exercise exclusions).
   - `maternalStatus` (`none`, `pregnant_t1`, `pregnant_t2`, `pregnant_t3`, `breastfeeding`) validated strictly for `female` and `age <= 50` (`400 INVALID_MATERNAL_PROFILE`); pregnancy calorie add-ons (`+0 / +340 / +450`) do not stack on `gain` surplus; breastfeeding deficit capped at `-300 kcal` before adding `+400 kcal`; `pregnant_t1` excludes unsafe high-impact/crunch/deadlift exercises (`PREGNANCY_ALL_TRIMESTERS_UNSAFE_RE`) and `pregnant_t2`/`t3` additionally exclude supine/flat-bench movements (`PREGNANCY_POST_T1_SUPINE_RE`).
   - Clinical blocks enforced: `lose` blocked when `currentBmi < 18.5` (`400 WEIGHT_LOSS_UNDERWEIGHT_UNSAFE`) or pregnant (`422 MATERNAL_CALORIE_CUT_BLOCKED`); `targetWeight` `35..250 kg`; recomposition threshold `< 0.5 kg` delta on `muscle_gain`; `keto` blocked for pregnancy/breastfeeding/diabetes/gout/kidney/cholesterol; `intermittent_fasting` blocked for pregnancy/breastfeeding/diabetes; optional `externalTrainingDays` supported on `nutrition_only + muscle_gain`.
   - Canonical enums (`goalPace: "slow" | "moderate" | "fast"`, `budget: "low" | "medium" | "high"`, `workoutLocation: "gym_only" | "home_only" | "home_and_gym"`, `unitSystem: "metric" | "imperial"`, `excludedGroups` lowercase) plus input normalization (`activity || dailyActivity`, `diseases || conditions`, `homeEquipment: "bands" -> "resistance_bands"`, `"chair" -> "bench"`).
   - Accepts `1..7` `selectedWorkoutDays` (`saturday_0` auto-normalized to `js_sunday_0`), `advanced` fitness level gets `4` sets on compound movements when `sessionDuration >= 45` (falling back to `3` if time budget exceeded), and `overwriteExisting: false` returns `409 PROFILE_ALREADY_EXISTS`.
   - `dailyWaterTarget` computes `weight * 35 + activity(+350 mod / +500 act) + workoutOrExternalTrainingDay(+500) + maternal(+300 preg / +600 bf) + gout(+500) + hotClimate(+200 egypt/gulf)`, clamped `2.0..5.0 L`.
   - Adaptive calorie floors (`1500 kcal` Male / `1200 kcal` Female / `1800 kcal` Pregnant / `1600 kcal` Breastfeeding; ceiling `4200 kcal`) match onboarding floors 1:1.
3. **`GET /v1/bootstrap`:**
   - Returns `onboarding: object | null` (`serviceTrack`, `journeyStartedOn`, `workoutUiMode`, `workoutPrefs`), `onboardingCompleted: boolean`, `unreadCoachingInboxCount: integer`, `consents`, `profile` (incl. `unitSystem`, `workoutUiMode`, `seniorMode`, `maternalStatus`), `scheduledSessions` (14d), `todaySummary` (`nutrition`, `hydration`, `activity` with `updatedAt`, `latestWeight`, `fastingState`, `ramadanMode`, `recovery`, `scheduledWorkout`), `streakSummary`, `engagementState`, `pendingAdaptations`, `workoutSafetyIssues`, `entitlements`, and `notificationPreferences`, protected by smart state-fingerprint `ETag` (`W/"boot-..."`).
