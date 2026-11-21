# EPIC-01: Mobile Conversational Onboarding & Smart Plan Engine — API Alignment & Backend Parity

> **Existing Jira Epic:** `KAN-34` (*Mobile Conversational Onboarding & Smart Plan Engine*)
> **Child Jira Stories (Preserved):** `KAN-35` (`US-MOB-01`) through `KAN-43` (`US-MOB-09`)
> **Purpose of This Document:** The UX screens, chat steps, safety gates, and mathematical equations in `KAN-34` (`KAN-35`..`KAN-43`) are already finalized and actively in UI design. This document **does NOT alter any designed onboarding UI or step ordering**; instead, it maps every existing story to live **CuraFit API v1** endpoints and specifies the exact `[MODIFIED BACKEND]` updates required so the Cloudflare Worker matches onboarding 100%.

---

## 1. Story-by-Story Endpoint Mapping (`US-MOB-01` .. `US-MOB-09`)

| Story ID (Jira) | Story Title | Endpoints & Commands Required | Status Tag | Notes & Alignment Rules |
| :--- | :--- | :--- | :--- | :--- |
| **`US-MOB-01`** (`KAN-35`) | App Launch Routing, Account Check (`account_check`), Login Return & Data Recovery | `GET /v1/health`<br>`GET /v1/capabilities`<br>`GET /v1/bootstrap` (`If-None-Match`)<br>`POST /v1/auth/oauth/google`<br>`POST /v1/auth/oauth/apple` | `[EXISTING]`<br>`[EXISTING]`<br>`[MODIFIED BACKEND]`<br>`[NEW BACKEND]`<br>`[NEW BACKEND]` | When returning from Login (`account_check = "yes"`), authenticate via Social OAuth (`EPIC-02`), then call `GET /v1/bootstrap`. If `data.profile == null` (new/incomplete account), return to Onboarding Chat at first unanswered step. If `data.profile != null`, show the **Data Recovery Prompt** (`restore_data` -> hydrate local SQLDelight + fetch active plans `/v1/plans/{id}` & `/v1/workout-plans/{id}` and go to Today; `start_fresh` -> keep auth session and start local draft from `name`). |
| **`US-MOB-02`** (`KAN-36`) | Conversational Chat Framework, Dynamic Progress, Local Persistence & In-Chat Answer Editing | Local-only SQLDelight/MMKV (`onboardingDraft`) until Summary sync; optional `POST /v1/commands?view=receipt` (`action: "timezone"`) if user changes region/timezone post-login | `[EXISTING]` (post-auth timezone sync) | All Q&A bubbles, edits, and Dependency Invalidation Matrix run deterministically offline on-device during onboarding with zero network latency per step. |
| **`US-MOB-03`** (`KAN-37`) | Name, Age & Age Safety Gate (`underage_gate` `<18` & `70+ Senior Mode`) | Pre-screening check via `POST /v1/eligibility` (called at Summary or on final validation when authenticated) | `[MODIFIED BACKEND]` | **Backend Parity Gap:** `coaching.mjs` `generate` and `evaluateEligibility` currently hard-cap `age` at `18..70`. Must be updated to allow `70..95` when `seniorMode` safety bounds are active (`minCalorieFloor`, protein `>= 1.2 g/kg`, deficit cap `-400 kcal`, low-impact exercise exclusions). Under-18 remains strictly blocked. |
| **`US-MOB-04`** (`KAN-38`) | Biological Sex, Maternal Status (`pregnant_t1|t2|t3`, `breastfeeding`) & Measurements | Included in `POST /v1/eligibility` and `POST /v1/commands` (`action: "generate"`) | `[MODIFIED BACKEND]` | **Backend Parity Gap:** `coaching.mjs` currently rejects any `maternalStatus != 'none'` (`CLINICAL_REVIEW_REQUIRED`). Must be updated to support `pregnant_t1`, `pregnant_t2`, `pregnant_t3`, and `breastfeeding` deterministic calorie/protein/water add-ons and clinical diet/exercise blocks matching `KAN-38`. |
| **`US-MOB-05`** (`KAN-39`) | Fitness Goal, Target Weight with Live BMI Warning & Weekly Goal Pace | Included in `POST /v1/eligibility`, `POST /v1/plans/preview`, and `POST /v1/commands` (`action: "generate"`) | `[MODIFIED BACKEND]` | **Backend Parity Notes:** (1) Backend ALREADY uses canonical `goalPace: "slow" | "moderate" | "fast"` (matching `KAN-39` 1:1 — no `"gentle"` alias needed). (2) `lose` is hidden/blocked when `currentBmi < 18.5`; `targetWeight` upper bound is `250 kg` (matching `weight`). (3) `generate` currently throws `INVALID_TARGET_WEIGHT` if `goal === 'lose'` and `targetWeight / heightM^2 < 18.5`; when `bmiWarningOverride: true` is sent after user explicitly taps `"Continue anyway"`, accept `targetWeight` down to safe floor or store milestone flag while enforcing calorie floors (`1500` M / `1200` F / `1800` Pregnant / `1600` Breastfeeding). |
| **`US-MOB-06`** (`KAN-40`) | Service Track Selection & Workout Setup (`fitness_level`, `workout_location`, `workout_days`, `workout_day_split`, `home_equipment`) | Included in `POST /v1/plans/preview` and `POST /v1/commands` (`action: "generate"`) | `[MODIFIED BACKEND]` | **Backend Parity Notes:** (1) `KAN-40` uses `weekdayConvention: "saturday_0"` (`0=Sat..6=Fri`). `coaching-shared.mjs` `normalizeWeekdayDraft` **already converts `saturday_0` to `js_sunday_0`!** Always send `"weekdayConvention": "saturday_0"` when sending raw `KAN-40` indices OR convert once in KMM and send `"js_sunday_0"`. (2) `KAN-40` allows up to **7 workout days**; `workouts.mjs` currently caps at `6` days (`1..6`) — update to allow `7` with active-recovery rotation. (3) Backend ALREADY uses canonical `workoutLocation: "gym_only" | "home_only" | "home_and_gym"` and `homeEquipment: "bench"` — keep ONLY the real alias `homeEquipment: "bands" -> "resistance_bands"`. (4) `nutrition_only + muscle_gain` supports optional `externalTrainingDays` (or defaults cleanly with an informational coaching note). |
| **`US-MOB-07`** (`KAN-41`) | Smart Hybrid Workout Split, Session Duration & Injury-Safe Filtering | Included in `POST /v1/eligibility`, `POST /v1/plans/preview`, and `POST /v1/commands` (`action: "generate"`) | `[MODIFIED BACKEND]` | **Backend Parity Gaps:** (1) `KAN-41` sends short injury keys (`knee`, `lower_back`, `shoulder`, `neck`, `wrist`, `ankle`, `elbow`, `hip`, `diastasis_recti`), while `coaching-shared.mjs` uses `*_pain` (`knee_pain`, etc.) and throws `UNSUPPORTED_ELBOW_PAIN` on `elbow_pain`. Update `canonicalInjuries` to map short keys (`knee` -> `knee_pain`, `elbow` -> `elbow_pain`) and support conservative elbow-safe substitutions (neutral-grip/machine alternatives) instead of blocking automated generation. |
| **`US-MOB-08`** (`KAN-42`) | Nutrition Setup (Activity, Conditions, Diet School, IF Start Hour / Meals Count, Budget & Allergies) | Included in `POST /v1/eligibility`, `POST /v1/plans/preview`, and `POST /v1/commands` (`action: "generate"`) | `[MODIFIED BACKEND]` | **Backend Parity Notes:** (1) Map `KAN-42` `conditions` (`diabetes_t1`, `diabetes_t2`, `hypothyroid`, `celiac`, `kidney`) into `SUPPORTED_WELLNESS_CONDITIONS` or structured dietary-constraint rules (`hypothyroid` `-5%` REE, `celiac` auto-`gluten` exclusion, `kidney` protein cap `<= 1.1 g/kg`, `diabetes_*` blocking `keto`/`intermittent_fasting`, conservative medical blocks on `keto + cholesterol` and `intermittent_fasting + breastfeeding`). (2) Backend ALREADY uses canonical `budget: "low" | "medium" | "high"` (no `"economical"` / `"flexible"` aliases needed). (3) Persist `profile.activity` (not `dailyActivity`). (4) Support `region: "egypt" | "gulf" | "levant" | "maghreb"` in regional food/recipe filtering. (5) Support `ifStartHour: 10 | 12 | 14 | 16` mapped to `eatingStart: "10:00" | "12:00" | "14:00" | "16:00"`. (6) Use canonical lowercase `"spicy"` and all 14 allergen groups in `excludedGroups`. |
| **`US-MOB-09`** (`KAN-43`) | Plan Summary Screen, Mathematical Equations & Dual-Path `"Start Plan"` Handoff | **Replaces placeholder `/api/v1/user/onboarding-sync` with real CuraFit API v1 sequence:**<br>1. `POST /v1/plans/preview` (stateless, public/unauthenticated summary preview matching backend engine 100%)<br>2. Auth (`POST /v1/auth/oauth/google` or `/apple`) if unauthenticated<br>3. `POST /v1/account/consents` (`health_data_processing`, `terms_and_privacy`)<br>4. `POST /v1/eligibility`<br>5. `POST /v1/commands?view=full` (`action: "generate"`)<br>6. `GET /v1/bootstrap` (sync header `ETag`, `consents`, & `revision`) | `[NEW BACKEND]` + `[EXISTING]` + `[MODIFIED BACKEND]` | **Critical Replacement:** `KAN-43` previously cited a placeholder URL `POST /api/v1/user/onboarding-sync`. Mobile MUST call stateless `POST /v1/plans/preview` for the Summary Screen preview (with local mirror fallback if offline), then execute the canonical CuraFit API v1 pipeline above. Offline entry to `Today` before initial `generate` succeeds is disallowed. Include `overwriteExisting: true` in `generate` (or resolve server conflict via `US-AUTH-02` before calling `generate`), and set `healthConfirmed: true` explicitly when the user confirms health safety during `workouts_only` onboarding. Also persist `workoutUiMode: "simple" | "pro"` default (`beginner` or `home_only` -> `"simple"`; `intermediate`/`advanced` with gym/mix -> `"pro"`). |

---

## 2. Exact Sync Sequence Replacing Placeholder `/api/v1/user/onboarding-sync` (`US-MOB-09`)

Before tapping **`[Start My Plan]`**, the Summary Screen calls **`[NEW BACKEND] POST /v1/plans/preview`** (stateless, no auth required, rate-limited per IP) with the onboarding draft to fetch authoritative targets (`dailyCalories`, `macros`, `waterTargetLiters`, `estimatedWeeksMin`, `estimatedWeeksMax`, `recommendedSplit`, `warnings`, `clinicalBlocks`) directly from the unified backend engine (falling back to the identical local KMM mirror formula only when offline).

When the user taps **`[Start My Plan]`** on the Onboarding Summary screen:

### Path A: Already Authenticated (`isAuthenticated == true`)
1. Record versioned legal & health consent:
   - `POST /v1/account/consents` -> `{ "consentType": "health_data_processing", "version": "1.0.0", "accepted": true }`
2. Verify eligibility pre-screen:
   - `POST /v1/eligibility` with onboarding biometrics, conditions, injuries, maternal status, and `serviceTrack`.
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
4. Hydrate SQLDelight local database from `data` (`profile`, `preferences`, `plans`, `workoutPlan`, `revision`, `entitlements`, `notificationPreferences`), call `GET /v1/bootstrap` to lock initial `ETag` and `consents`, clear `onboardingDraft`, mark `onboardingCompleted = true`, and replace navigation stack to **`Today` (`US-HOME-01`)**.

### Path B: Unauthenticated (`isAuthenticated == false`)
1. Save `pendingSyncPlan` locally in encrypted storage / SQLDelight.
2. Navigate to **Passwordless Social Sign-In (`US-AUTH-01`)** with `entrySource = "onboarding_summary_start_plan"`.
3. Authenticate via Google or Apple (`POST /v1/auth/oauth/google` or `/apple`).
4. Call `GET /v1/bootstrap` and inspect `data.profile`:
   - **If `data.profile == null`**: Immediately run Steps 1–4 of Path A above using the account's current `revision` (usually `0`), then navigate to **`Today`**.
   - **If `data.profile != null`**: Show the **Plan Conflict Resolution Sheet (`US-AUTH-02`)**:
     - **`[Use My New Plan (Overwrite Old Plan)]`** -> Runs Path A with the account's latest `revision` (`overwriteExisting: true`), archiving the old server plans safely via `s.history` / `s.workoutArchives`.
     - **`[Restore My Old Saved Plan]`** -> Discards `pendingSyncPlan`, hydrates local SQLDelight from server `GET /v1/bootstrap` + `GET /v1/plans/{id}` + `GET /v1/workout-plans/{id}`, and navigates to **`Today`**.

---

## 3. Summary of Required `[MODIFIED BACKEND]` & `[NEW BACKEND]` Updates for Epic 01 Parity

1. **`[NEW BACKEND] POST /v1/plans/preview`:**
   - Stateless public endpoint (no auth required) returning deterministic onboarding summary calculations (`calories`, `macros`, `waterTargetLiters`, `estimatedWeeksMin`, `estimatedWeeksMax`, `recommendedSplit`, `warnings`, `clinicalBlocks`) using the exact same unified engine as `action: "generate"`.
2. **`POST /v1/eligibility` & `POST /v1/commands` (`action: "generate"`):**
   - Expand `age` bounds to `18..95` (`70..95` activates `seniorMode = true` with `-400 kcal` deficit cap, `>= 1.2 g/kg` protein floor, and joint-safe low-impact exercise filters).
   - Support `maternalStatus`: `none`, `pregnant_t1`, `pregnant_t2`, `pregnant_t3`, `breastfeeding` with automated add-ons and safety blocks (`lose` blocked in pregnancy; `keto` & `intermittent_fasting` blocked in pregnancy; `keto`, `intermittent_fasting`, & deficits `< -300` blocked in breastfeeding).
   - Enforce conservative clinical blocks: hide/block `lose` when `currentBmi < 18.5`; raise `targetWeight` upper bound to `250 kg`; block `keto + cholesterol`; support optional `externalTrainingDays` on `nutrition_only + muscle_gain` (or default with informational coaching note).
   - Keep canonical backend enums directly (`goalPace: "slow" | "moderate" | "fast"`, `budget: "low" | "medium" | "high"`, `workoutLocation: "gym_only" | "home_only" | "home_and_gym"`, `homeEquipment: "bench"`, `excludedGroups: "spicy"`, `profile.activity`), adding ONLY the real alias `homeEquipment: "bands" -> "resistance_bands"`.
   - Accept up to 7 `selectedWorkoutDays` (converting `saturday_0` cleanly via `normalizeWeekdayDraft`) with active-recovery awareness on 7-day schedules.
   - Support extended `diseases` (`diabetes_t1`, `diabetes_t2`, `hypothyroid`, `celiac`, `kidney`) and full `injuries` (`knee`, `lower_back`, `shoulder`, `neck`, `wrist`, `ankle`, `elbow`, `hip`, `diastasis_recti`).
   - Accept optional `bmiWarningOverride: true`, `overwriteExisting: true`, and `workoutUiMode: "simple" | "pro"`.
   - Extend `dailyWaterTarget` calculation in `coaching.mjs` to `weight * 35 + activity(+350 mod / +500 act) + workoutDay(+500) + maternal(+300 preg / +600 bf) + gout(+500) + hotClimate(+200 egypt/gulf)`, clamped `2.0..5.0 L`.
   - Align `validateEnergyChange` adaptive calorie floors (`coaching.mjs`) with `US-MOB-09` (`KAN-43`) and `US-CCH-03` (`1500 kcal` Male / `1200 kcal` Female / `1800 kcal` Pregnant / `1600 kcal` Breastfeeding; ceiling `4200 kcal`) instead of legacy `1400 kcal` Male so adaptive cuts never undercut onboarding floors.
   - Ensure `levant` and `maghreb` regional meal template pools fall back cleanly to Mediterranean/Middle Eastern dishes when localized recipes are added incrementally.
3. **`GET /v1/bootstrap`:**
   - Include `consents`, `onboarding` (`serviceTrack`, `journeyStartedOn`, `workoutPrefs`), `profile.workoutUiMode` (`"simple" | "pro"`), `profile.seniorMode`, `profile.maternalStatus`, `scheduledSessions` (14d), `todaySummary.nutrition.{carbs,fat,targets}`, `todaySummary.activity`, `todaySummary.fastingState`, `todaySummary.ramadanMode`, `scheduledWorkout.fromDate`, `streakSummary`, and `engagementState` (`daysSinceLastLog`, `weeklyCheckinDue`, `comebackTier`) in the `< 10 KB` startup payload (`EPIC-03`..`EPIC-07`).
