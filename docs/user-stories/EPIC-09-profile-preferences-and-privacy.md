# EPIC-09: Profile Management, Plan Reconfiguration, Localization & GDPR Privacy

> **Epic ID:** `EPIC-09` *(Replaces legacy Jira Epic `KAN-6: Profile`)*
> **Target Platforms:** KMM (Android Jetpack Compose & iOS SwiftUI)
> **Scope:** Production
> **Labels:** `production`, `mobile`, `profile`, `settings`, `privacy`, `localization`

---

## Epic Overview

`EPIC-09` powers the **Profile Tab** (`Tab 5`), allowing users to manage their identity/avatar, adjust their body measurements/goals/training/nutrition settings safely (preserving historical diary & workout logs while archiving old plans cleanly), switch between **Arabic (RTL)** and **English (LTR)** instantaneously without app restart, sync regional/timezone settings, manage consents, export complete GDPR JSON archives, log out across devices, and permanently delete their account (`DELETE /v1/account/delete`).

### Child User Stories
- `US-PRF-01`: Profile Overview, Account Header, Display Name & Avatar Photo Upload
- `US-PRF-02`: Edit Body Metrics, Maternal Status, Fitness Goal, Target Weight & Weekly Pace
- `US-PRF-03`: Edit Service Track & Training Setup (Mode, Location, Days, Equipment, Split, Duration & Injuries)
- `US-PRF-04`: Edit Nutrition Preferences (Activity, Conditions, Diet School, Meal Timing/Count, Budget, Region & Exclusions)
- `US-PRF-05`: App Language (`Arabic` RTL / `English` LTR Instant Live Switch), Digit Style & Automatic Timezone Sync
- `US-PRF-06`: Privacy Center, Health Consents, GDPR Data Export, Multi-Device Sign Out & Permanent Account Deletion
- `US-PRF-07`: Help Center, Clinical/Non-Medical Disclaimers, Legal Terms, Support Contact & App Info

---

## US-PRF-01: Profile Overview, Account Header, Display Name & Avatar Photo Upload

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRF-01` |
| **Epic** | `EPIC-09` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `profile`, `avatar` |
| **Target Screens** | `ProfileOverviewScreen`, `EditNameAndAvatarSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` (`POST /v1/profile/avatar`, `DELETE /v1/profile/avatar`, `action: "profile_update"`, `GET /v1/auth/oauth/providers`, `POST /v1/auth/oauth/link`, `DELETE /v1/auth/oauth/{provider}`) |

### STORY
As a logged-in user opening the Profile tab, I want to see my name, avatar photo, connected Google/Apple sign-in methods, subscription tier badge, current program summary, quick shortcuts to Analytics/Measurements/Photos/Connected Apps, and easily update my display name or profile photo so my account feels personal and organized.

### PRECONDITIONS
- User is authenticated with `onboardingCompleted == true` (mobile authentication uses **Google Sign-In and Apple Sign-In OAuth ONLY** — no email/password login, Forgot Password, or Change Password UI exists in the mobile app).

### SCREEN AND UI DETAILS
1. **Profile Header Card:**
   - Circular Avatar (`72dp`) showing uploaded photo (hydrated via short-lived 900s signed `avatarUrl` in `GET /v1/bootstrap` and auth responses), Google/Apple avatar, or styled monogram initials + subtle camera edit badge.
   - Display Name (`profile.name`), Linked Sign-In Email & Provider pill (`Google` / `Apple`), and Entitlement Pill (`Free Plan` -> `[Upgrade to Pro]` OR `CuraFit Pro (Active)` -> `[Manage]`).
2. **Active Program Summary Strip:**
   - Quick KPIs: `Weight: 81.4 kg`, `Goal: Lose Fat -> 75 kg`, `Calories: 1,850 kcal/d`, `Track: Nutrition + Workouts (4d/wk)`.
3. **Structured Settings Menu Sections:**
   - **My Progress & Body Tools:** `Weight & Analytics` (`US-PRG-01`), `Body Measurements` (`US-PRG-02`), `Private Photos Vault` (`US-PRG-03`), `Streaks & Badges` (`US-PRG-04`), `Cycle Awareness & Discreet Mode` (`US-PRG-06`, Female profiles only).
   - **My Plan & Coaching Preferences:** `Body Metrics & Goal` (`US-PRF-02`), `Training & Dual-Mode Setup` (`US-PRF-03`), `Nutrition & Food Exclusions` (`US-PRF-04`).
   - **App & Integrations:** `Apple Health / Health Connect` (`US-INT-01`), `Notifications & Quiet Hours` (`US-INT-02`), `Language, Region & Units` (`US-PRF-05`).
   - **Account & Privacy:** `Connected Sign-In Methods (Google / Apple)`, `Subscription & Billing` (`US-MON-04`), `Privacy, Consents & Export` (`US-PRF-06`), `Help, Legal & App Info` (`US-PRF-07`).
4. **Edit Name & Avatar Bottom Sheet (`EditNameAndAvatarSheet`):**
   - Photo options: `[Take Photo]`, `[Choose from Gallery]`, `[Remove Photo]` (compresses to square `512x512` JPEG/PNG/WebP `<= 512 KB` / `524288` bytes).
   - Name input field (`2..50` alphabetic chars + spaces/hyphens, matching `US-MOB-03` validation!) + `[Save Changes]`.
5. **Connected Sign-In Methods Sheet (`ConnectedAuthMethodsSheet`):**
   - Lists linked providers from `GET /v1/auth/oauth/providers` (Google, Apple).
   - Allows linking a second provider (`[Link Google]` / `[Link Apple]` -> `POST /v1/auth/oauth/link`) or unlinking a secondary provider (`DELETE /v1/auth/oauth/{provider}` — prevents unlinking the last remaining sign-in method via `409 CANNOT_UNLINK_LAST_AUTH_METHOD`).

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "profile_update"`)
   - Lightweight profile metadata command (`name`, optional `workoutUiMode`, optional `unitSystem: "metric" | "imperial"`) that updates `s.profile` **without** regenerating meal/workout plans!
   - Payload: `{ "name": "Ahmed Hassan", "unitSystem": "metric" }`.
2. **`POST /v1/profile/avatar`** (Accepts `multipart/form-data` with `image` or `file` field, OR raw `image/jpeg | image/png | image/webp` binary up to **512 KB / `524288` bytes** stored in private Cloudflare R2; automatically deletes any superseded `avatars/{userId}/*` object on re-upload and returns `{ avatarKey, avatarUrl, expiresAt }` with a short-lived 900s signed URL via `/v1/media/signed/{token}`, also hydrated automatically on `GET /v1/bootstrap` and auth responses) & **`DELETE /v1/profile/avatar`**.
   - Error Codes: `400 INVALID_PROFILE_NAME`, `400 INVALID_UNIT_SYSTEM`, `413 PHOTO_TOO_LARGE` (`> 512 KB`), `415 UNSUPPORTED_IMAGE_FORMAT`.
3. **Connected OAuth Linking Endpoints (Google & Apple Only):**
   - **`GET /v1/auth/oauth/providers`** -> Lists linked Google/Apple identities for the signed-in account.
   - **`POST /v1/auth/oauth/link`** -> `{ "provider": "google" | "apple", "idToken"?, "identityToken"?, "authorizationCode"? }`.
   - **`DELETE /v1/auth/oauth/{provider}`** -> Unlinks provider; returns `409 CANNOT_UNLINK_LAST_AUTH_METHOD` if it is the user's last remaining sign-in method.

### RULES & BUSINESS LOGIC
1. **Non-Destructive Name Edit:** Editing `name`, `unitSystem`, or uploading an avatar uses `profile_update` (or avatar endpoint) and NEVER triggers unnecessary meal/workout plan regeneration or resets active streaks.
2. **Name Validation Parity (`US-MOB-03`):** Enforce identical `2..50` char validation rejecting digits-only, symbols-only, or emoji-only strings.
3. **Last Sign-In Method Protection:** Disable or confirm against unlinking the sole remaining OAuth provider (`409 CANNOT_UNLINK_LAST_AUTH_METHOD`) so users can never lock themselves out of their account.

### MAIN FLOW
1. User taps Tab 5 (`Profile`), then taps `[Edit]` on the Profile Header.
2. User edits display name to `"Ahmed El-Masry"`, picks a photo from gallery, crops to square, and taps `[Save Changes]`.
3. Client uploads compressed avatar via `POST /v1/profile/avatar` and updates name via `profile_update`; Profile & Today greeting reflect changes immediately.

### EDGE CASES
- **Offline Name Edit:** Queues `profile_update` into outbox and updates UI immediately; avatar photo upload shows `"Connect to internet to upload photo"` gracefully.
- **Permission Denied for Camera/Gallery:** Show rationale dialog + `[Open System Settings]` without crashing.
- **Name Fails Validation (`< 2` chars, Digits-Only `"12345"`, or Symbols `"@@"`):** Inline localized error matching `INVALID_PROFILE_NAME` (`US-MOB-03`) blocks submission safely.
- **Avatar Exceeds `512 KB` Raw Gallery Image (`> 10 MB` DSLR Photo):** Client automatically crops to `512x512` and compresses JPEG/PNG/WebP `<= 512 KB` prior to upload so `413 PHOTO_TOO_LARGE` never blocks normal users.
- **Attempting to Unlink Last OAuth Provider (`409 CANNOT_UNLINK_LAST_AUTH_METHOD`):** Shows clear inline explanation *"Link another sign-in method (Google or Apple) before removing your only sign-in method."*

### ACCEPTANCE CRITERIA
- **Scenario 1: Editing display name updates profile without regenerating active plans**
  - **Given** user is on `ProfileOverviewScreen` with active plan `plan-123`
  - **When** user changes `name` to `"Sara Karim"` and saves
  - **Then** `profile_update` commits, Today greeting updates to `"Sara Karim"`, and `activeNutritionPlanRef.id` remains `plan-123`.
- **Scenario 2: Selecting a large phone gallery photo compresses under 512 KB cleanly**
  - **Given** user picks an `8 MB` portrait photo from the phone gallery
  - **When** user crops and confirms upload
  - **Then** client compresses to `<= 512 KB` JPEG/PNG/WebP and `POST /v1/profile/avatar` returns `200 OK` with a short-lived signed `avatarUrl` (900s TTL).
- **Scenario 3: Unlinking the last remaining sign-in method is blocked cleanly**
  - **Given** user has only Google linked
  - **When** attempting `DELETE /v1/auth/oauth/google`
  - **Then** server returns `409 CANNOT_UNLINK_LAST_AUTH_METHOD` and keeps Google linked.

### ANALYTICS
- `profile_overview_viewed` (`entitlement`: `"free" | "pro"`)
- `profile_name_updated` (`length`: `integer`)
- `profile_avatar_updated` (`action`: `"upload" | "remove"`)
- `oauth_provider_link_updated` (`provider`: `"google" | "apple"`, `action`: `"link" | "unlink"`)

---

## US-PRF-02: Edit Body Metrics, Maternal Status, Fitness Goal, Target Weight & Weekly Pace

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRF-02` |
| **Epic** | `EPIC-09` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `profile`, `goals`, `recalculation` |
| **Target Screens** | `EditBodyAndGoalScreen` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` (`POST /v1/eligibility`, `POST /v1/plans/preview`, `action: "generate"`) |

### STORY
As a user whose goals, age, maternal status, or target weight evolve over time, I want to edit my body measurements, maternal status, primary fitness goal, target weight, and pace with live calorie/macro recalculation preview and clinical safety guards — while preserving 100% of my past food, weight, and workout history.

### PRECONDITIONS
- User navigates to `Profile -> Body Metrics & Goal`.

### SCREEN AND UI DETAILS
1. **Editable Form Fields (Pre-populated from `profile`):**
   - `Age` (`18..95`, shows `Senior Mode` toggle hint if `>= 70`; blocks `< 18`).
   - `Biological Sex` (`Male` / `Female`).
   - `Maternal Status` *(Shown if Female `18..50`)*: `None` | `Pregnant T1` | `Pregnant T2` | `Pregnant T3` | `Breastfeeding`.
   - `Height (cm)` (`120..230`, supports meter auto-convert like `1.75 -> 175`).
   - `Current Reference Weight (kg)` (pre-filled from latest weight log or profile).
   - `Goal`: `Lose Fat`, `Build Muscle`, `Gain Weight`, `Maintain Weight` (hides/blocks `Lose` if pregnant OR `currentBmi < 18.5`!).
   - `Target Weight (kg)` (`35..250 kg`, hidden if Maintain) + Healthy BMI Range chip (`minHealthyWeight..maxHealthyWeight kg`) + Live BMI Warning modal (`US-MOB-05`) if outside `18.5–24.9`.
   - `Weekly Pace` (`Slow` / `Moderate` / `Fast` — hides `Fast` for `seniorMode` or `breastfeeding`!).
2. **Live Impact Preview Banner (Sticky Bottom Bar before Saving):**
   - Computes exact preview equations via `POST /v1/plans/preview` (or local KMM mirror matching `US-MOB-09`):
     - *"New Targets: **1,780 kcal/day** (`-70 kcal`) • 145g P / 155g C / 64g F • New meal plan will generate starting today."*
   - Primary CTA: `[Recalculate & Update Plan]`.

### API & BACKEND CONTRACT
1. **`POST /v1/eligibility`** -> Pre-screens updated demographics/goal/maternal status.
2. **`POST /v1/commands?view=full`** (`action: "generate"`)
   - Sends complete merged preferences + new biometrics/goal with current server `revision`.
   - Server automatically archives previous profile into `s.history`, archives old plans into `s.plans`/`s.workoutArchives`, generates new active plans effective `currDate`, resets `s.nutritionContextStartedOn = currDate`, and **retains all historical `foodEntries`, `waterLogs`, `weights`, `workoutLogs`, `sessions`, and `checkins`**!
   - **Note on Existing Today Logs (`FUTURE_FOOD_ENTRIES_CONFLICT` protection):** If user already logged food today (`date == currDate`), notify clearly *"Today's logged meals stay safe in your diary; updated targets apply from this moment onward."*
   - Error Codes: `403 HEALTH_CONSENT_REQUIRED`, `INVALID_TARGET_WEIGHT`, `WEIGHT_LOSS_UNDERWEIGHT_UNSAFE`, `CLINICAL_REVIEW_REQUIRED`, `BMI_OUT_OF_RANGE`.

### RULES & BUSINESS LOGIC
1. **Strict Maternal Safety Consistency:** If user switches `maternalStatus` to `pregnant_*` or `breastfeeding` while current `dietType` is `keto` or `intermittent_fasting`, automatically alert user inside the form *"Keto / Intermittent Fasting is blocked for your maternal status — your diet style will update to Balanced (or choose another safe style) before saving."*
2. **Zero Historical Erasure:** `coaching.mjs` preserves all past food, weight, and training logs when regenerating plans on an existing account.
3. **Senior Mode Auto-Enforcement:** Changing `age` to `>= 70` enables `seniorMode = true`, hides `fast` pace, raises protein floor `>= 1.2 g/kg`, and updates workout exclusions immediately.

### MAIN FLOW
1. User reaches `75 kg` (or decides to switch from `lose` to `muscle_gain`) and opens `Profile -> Body Metrics & Goal`.
2. User changes `Goal` to `Build Muscle & Tone`, enters `Target Weight = 78 kg`, selects `Moderate` pace (`+min(tdee * 0.08, 250)` -> e.g. `+250 kcal`).
3. Sticky preview shows `New Target: 2,400 kcal • 135g Protein`.
4. User taps `[Recalculate & Update Plan]` -> Calls `POST /v1/eligibility` + `POST /v1/commands?view=full` (`generate`) -> Hydrates new nutrition & training plan into SQLDelight and confirms update.

### EDGE CASES
- **Offline Attempt:** Plan regeneration requires deterministic backend solver (`makeWeek` & `workoutPlan`); disable `[Recalculate & Update Plan]` when offline with clear message *"Connect to the internet to generate your updated plan."*
- **User Edits Only `Current Weight` Without Changing Goal:** Suggest logging a daily Weigh-In (`US-HOME-04`) instead unless they explicitly want to reset their baseline program targets immediately.
- **Under-18 Age Correction or Underweight Target (`BMI < 18.5`) Without Override:** Enforces `US-MOB-03`/`05` safety gates cleanly (`age < 18` blocked, or explicit `bmiWarningOverride` confirmation modal shown before `generate`).
- **Simultaneous Multi-Device Revision Conflict (`409` During Profile Save):** Fetches latest `revision`, preserves edited form values, and re-prompts clean save without wiping form inputs.

### ACCEPTANCE CRITERIA
- **Scenario 1: Switching goal preserves historical workout and food logs**
  - **Given** user has 14 days of logged `foodEntries` and `weights`
  - **When** user updates `goal` from `"lose"` to `"maintain"` in `EditBodyAndGoalScreen`
  - **Then** `generate` archives the old plan, sets `goal = "maintain"`, updates `nutritionContextStartedOn`, and retains all 14 days of logs.
- **Scenario 2: Switching maternal status to pregnant blocks `lose` and `keto`**
  - **Given** user previously had `goal = "lose"` and `dietType = "keto"`
  - **When** user selects `maternalStatus = "pregnant_t2"`
  - **Then** UI forces selecting a non-loss goal and pregnancy-safe diet before permitting submission.
- **Scenario 3: Updating age to 70+ activates Senior Safety Mode bounds**
  - **Given** user updates `age` from `69` to `71` and taps `[Recalculate & Update Plan]`
  - **When** `generate` commits
  - **Then** `profile.seniorMode` becomes `true`, weekly pace omits `fast`, and protein target stays `>= 1.2 g/kg`.

### ANALYTICS
- `profile_body_goal_updated` (`changed_fields`: `string[]`, `old_goal`: `string`, `new_goal`: `string`, `new_calories`: `number`)

---

## US-PRF-03: Edit Service Track & Training Setup (Mode, Location, Days, Equipment, Split, Duration & Injuries)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRF-03` |
| **Epic** | `EPIC-09` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `profile`, `workouts`, `injuries` |
| **Target Screens** | `EditTrainingSetupScreen` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` (`action: "generate"`, `action: "workout_ui_mode"`) |

### STORY
As a user whose gym membership, free schedule, injuries, or coaching track changed (for instance, switching from Home Only to Gym, upgrading from Nutrition Only to Nutrition + Workouts, or reporting a new knee injury), I want to edit my complete training setup in one clean screen so my workout schedule and safety exclusions update safely.

### PRECONDITIONS
- User opens `Profile -> Training & Dual-Mode Setup` (or tapped `[Enable Workout Program]` from `US-HOME-01`).

### SCREEN AND UI DETAILS
1. **Workout Player Mode Selector (Instant Non-Regenerating Setting):**
   - `[Simple / Guided Mode]` vs `[Pro / Performance Mode]` -> Uses `workout_ui_mode` (`US-WRK-02`) if user ONLY changes UI mode!
2. **Program Configuration Form (Triggers Workout/Plan Update):**
   - `Service Track`: `Nutrition + Workouts` | `Nutrition Only` | `Workouts Only`.
   - *(If `serviceTrack == "nutrition_only"` & `goal == "muscle_gain"`):* Show optional `External Resistance Training Days` weekday selector (if left empty, defaults cleanly with an informational coaching note reminding that hypertrophy requires external resistance stimulus).
   - *(If `serviceTrack != "nutrition_only"`):*
     - `Fitness Level`: `Beginner` | `Intermediate` | `Advanced`.
     - `Training Location`: `Gym Only` (`gym_only`) | `Home Only` (`home_only`) | `Mix (Home & Gym)` (`home_and_gym`).
     - `Exact Workout Weekdays` (`Saturday..Friday` pills `1..7` days) + `Per-Day Location Split` (if Mix).
     - `Available Home Equipment` (if `Home` or `Mix` — `Bodyweight Only` [`none`], `Dumbbells` [`dumbbells`], `Resistance Bands` [`resistance_bands`], `Pull-up Bar` [`pullup_bar`], `Kettlebell` [`kettlebell`], `Bench` [`bench`], `Barbell` [`barbell`], `Yoga Mat` [`yoga_mat`], `Jump Rope` [`jump_rope`], `Cardio Machine` [`cardio_machine`]).
     - `Workout Split` (shown when `location != home_only` AND days `>= 2`, filtered dynamically by day count: `2–7d` `auto` / `full_body` / `upper_lower`; `3–7d` `ppl` [4d balanced `push/pull/legs/full_body`, 5d `push/pull/legs/upper/lower`]; `4–7d` `bro_split` — exposing all 5 splits at `4+` days!).
     - `Session Duration`: `20` | `30` | `45` | `60` | `90 min`.
     - `Joint Pain & Injuries`: `None`, `Knee`, `Lower Back`, `Shoulder`, `Neck`, `Wrist`, `Ankle`, `Elbow`, `Hip`, `Postpartum Diastasis Recti` (if Female).
     - *(If `serviceTrack == "workouts_only"`):* Explicit `Health Readiness Confirmation` checkbox (`healthConfirmed: true`).
3. **Smart Save Logic Button:**
   - Only changed `Simple/Pro` UI Mode -> `[Save View Mode]` (`workout_ui_mode`).
   - Changed schedule/equipment/injuries/track -> `[Update Workout Program]` (calls `generate` -> forks/creates workout plan + refreshes daily water workout-day boost if schedule changed).

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "workout_ui_mode"`) -> When only UI mode changed.
2. **`POST /v1/commands?view=full`** (`action: "generate"`) -> Rebuilds workout plan (and nutrition plan if `serviceTrack` changed).
   - Error Codes: `403 HEALTH_CONSENT_REQUIRED`, `WORKOUT_INFEASIBLE`, `NO_ELIGIBLE_EXERCISES`, `HEALTH_CONFIRMATION_REQUIRED`.

### RULES & BUSINESS LOGIC
1. **Immediate Contraindication Audit:** Adding an injury (e.g., `lower_back`) immediately excludes contraindicated exercises (`deadlift`, `good morning`, `back squat`) and clears `workoutSafetyIssues`.
2. **Infeasible Equipment Guard:** If `WORKOUT_INFEASIBLE` occurs (e.g., user picked `20 min` + `Bodyweight Only` + 4 conflicting injuries), show exact actionable guidance to adjust duration or equipment before overwriting active plan.
3. **Progression Lineage Check:** Preserve compatible exercise `progressionKey` history across unchanged movements where possible.

### MAIN FLOW
1. User joins a commercial gym after 2 months of Home workouts and opens `Profile -> Training Setup`.
2. User switches `Location` from `Home Only` to `Gym Only`, unlocks `Workout Split` and selects `Upper / Lower` (4 days), and taps `[Update Workout Program]`.
3. Backend generates the new Gym Upper/Lower program; old Home plan is safely archived and `Workouts` tab immediately loads the new exercises.

### EDGE CASES
- **Switching From `Nutrition + Workouts` to `Nutrition Only`:** Safely hides Workout tab cards without erasing historical `workoutLogs` or `sessions` (so switching back months later restores past strength PR history!).
- **Tapping Back With Unsaved Changes:** Prompt `"Discard unsaved training setup changes?"`.
- **Upgrading From `Nutrition Only` to `Nutrition + Workouts` Without Health Confirm:** Automatically verifies safety questions / `healthConfirmed: true` inside the setup sheet before dispatching `generate`.
- **Offline Save of Training Reconfiguration:** Allows instant offline save ONLY if changing `workoutUiMode` (`Simple <-> Pro`); disables full program regeneration offline with calm `"Connect to internet to rebuild workout plan"` notice.

### ACCEPTANCE CRITERIA
- **Scenario 1: Adding a knee injury regenerates workout without contraindicated squats/lunges**
  - **Given** user's existing plan contains `Barbell Squat` and `Walking Lunge`
  - **When** user adds `knee` in `EditTrainingSetupScreen` and saves
  - **Then** the newly generated plan contains zero knee-contraindicated exercises and `workoutSafetyIssues` is empty.
- **Scenario 2: Changing only `workoutUiMode` avoids regenerating plans**
  - **Given** user switches `Simple -> Pro` without changing split/days/injuries
  - **When** user taps Save
  - **Then** only `workout_ui_mode` executes and existing `workoutPlan.id` remains unchanged.
- **Scenario 3: Switching to `Nutrition Only` preserves past workout logs and adapts navigation**
  - **Given** user has 10 logged gym sessions under `nutrition_and_workouts`
  - **When** user changes track to `nutrition_only` and saves
  - **Then** Today omits Workout cards while preserving `workoutLogs` intact in backend/export storage.

### ANALYTICS
- `profile_training_setup_updated` (`track`: `string`, `location`: `string`, `split`: `string`, `days_count`: `integer`, `injuries_count`: `integer`)

---

## US-PRF-04: Edit Nutrition Preferences (Activity, Conditions, Diet School, Meal Timing/Count, Budget, Region & Exclusions)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRF-04` |
| **Epic** | `EPIC-09` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `profile`, `nutrition`, `medical-safety` |
| **Target Screens** | `EditNutritionPrefsScreen` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` (`POST /v1/eligibility`, `action: "generate"`) |

### STORY
As a user whose daily activity, health conditions, grocery budget, region, food dislikes, or preferred diet school changed, I want to update my nutrition preferences with live medical diet filtering and zero-compromise ingredient exclusion validation so my meal plan stays appetizing, affordable, and medically safe.

### PRECONDITIONS
- User opens `Profile -> Nutrition & Food Exclusions` (or tapped `[Enable Nutrition Plan]` from `US-HOME-01`).

### SCREEN AND UI DETAILS
1. **Form Sections (Mirroring `US-MOB-08` Medical Guardrails):**
   - `Daily Activity (`profile.activity`)`: `Sedentary (1.2x)` | `Light (1.375x)` | `Moderate (1.55x)` | `Very Active (1.725x)`.
   - `Health & Metabolic Conditions`: Multi-select chips (`None`, `Insulin Resistance` [`insulin_resistance`], `Type 2 Diabetes` [`diabetes_t2`], `Type 1 Diabetes` [`diabetes_t1`], `PCOS` [`pcos`, Female], `Hypothyroid` [`hypothyroid`], `Hypertension` [`hypertension`], `High Cholesterol` [`cholesterol`], `IBS` [`ibs`], `Celiac / Gluten` [`celiac`], `Lactose Intolerance` [`lactose_intolerance`], `Favism` [`favism`], `Anemia` [`anemia`], `Vitamin D Deficiency` [`vitamin_d_deficiency`], `Fatty Liver` [`fatty_liver`], `Gout` [`gout`], `Kidney Sensitivity` [`kidney`]).
   - `Diet School` *(Clinically filtered live — hides `Keto` / `IF` whenever blocked by newly checked conditions or maternal status, including conservative blocks on `keto + cholesterol` and `intermittent_fasting + breastfeeding`, highlighting a `(Recommended)` fit pill!)*: `Balanced`, `Low Carb`, `High Protein`, `Intermittent Fasting (16:8)`, `Keto`, `Mediterranean`, `DASH`, `Vegetarian`, `Vegan`.
   - `IF Start Hour` (`6..16`, i.e., `6:00 AM` to `4:00 PM`) *(Only if `intermittent_fasting`)* OR `Meals & Snacks per Day` (`2 / 3 / 4 / 5`) *(Only if `balanced`)*.
   - `Grocery Budget Tier` (`budget: "low" | "medium" | "high"`): `Economic` | `Moderate` | `Premium`.
   - `Regional Cuisine`: `Egypt` | `Gulf (GCC)` | `Levant` | `Maghreb`.
   - `Food Allergies & Exclusions`: Multi-select (`None`, `Dairy`, `Eggs`, `Fish`, `Shellfish`, `Peanuts`, `Tree Nuts`, `Wheat & Gluten`, `Soy`, `Sesame/Tahini`, `Red Meat`, `Poultry`, `Legumes`, `Oats`, `Spicy` — wire key `"spicy"`).
2. **Primary CTA:** `[Generate Updated Meal Plan]` (`POST /v1/eligibility` -> `POST /v1/commands?view=full` `generate`).

### API & BACKEND CONTRACT
1. **`POST /v1/eligibility`** + **`POST /v1/commands?view=full`** (`action: "generate"`).
   - Error Codes: `403 HEALTH_CONSENT_REQUIRED`, `PLAN_CONSTRAINTS_UNMET`, `LIBRARY_INSUFFICIENT_FOR_DIET_GOALS`, `NO_ELIGIBLE_MEAL_FOR_SLOT`, `KETO_REQUIRES_CONFIRMATION`, `FASTING_REQUIRES_CONFIRMATION`.

### RULES & BUSINESS LOGIC
1. **Constraint Integrity (`IMPLEMENTATION.md`):** Never silently clear an allergy or raise budget to make an infeasible meal plan pass (`LIBRARY_INSUFFICIENT_FOR_DIET_GOALS`); instead, display a clear helpful prompt identifying which combination (e.g., *Vegan + No Legumes + No Soy + No Nuts*) narrowed available protein templates too far.
2. **Automatic Conflict Resolution:** If adding `diabetes_t2` or `cholesterol` conflicts with currently selected `keto`, highlight `dietType` section automatically and require picking a safe school (`Low Carb (Recommended)` or `Balanced` / `Mediterranean`) before saving.

### MAIN FLOW
1. User gets diagnosed with Hypertension and opens `Profile -> Nutrition Preferences`.
2. User toggles `High Blood Pressure (Hypertension)` -> Coach highlights `DASH Diet (Recommended)`.
3. User switches from `High Protein` to `DASH Diet`, keeps `medium` budget, and taps `[Generate Updated Meal Plan]`.
4. Backend applies low-sodium (`<= 2300 mg/day`) filters and generates a fresh 7-day regional DASH meal plan immediately.

### EDGE CASES
- **Already Logged Today's Breakfast Before Updating Preferences Today:** Preserve Today's already-logged entries in `foodEntries` while updating remaining unlogged slots & Days 2–7.
- **Switching Region (`Egypt -> Gulf`):** Immediately updates localized dish names and recipe pool on the generated week.
- **Conflict Between Newly Added `diabetes_t2` and Existing `keto` Diet:** Highlights Diet School selector inline with warning *"Keto is hidden for diabetes safety — please pick Balanced, Low Carb, or Mediterranean"* before enabling Save.
- **Offline Save Attempt:** Keeps form editable offline as local draft or informs `"Internet connection needed to generate your updated meal plan."`

### ACCEPTANCE CRITERIA
- **Scenario 1: Adding `celiac` enforces gluten-free meals even if `allergies` doesn't list gluten**
  - **Given** user enables `celiac` in `EditNutritionPrefsScreen` and keeps `allergies = ["none"]`
  - **When** `[Generate Updated Meal Plan]` succeeds
  - **Then** server injects `gluten` exclusion automatically and the generated 7-day plan contains zero gluten items.
- **Scenario 2: Infeasible exclusion stack fails gracefully without mutating old plan**
  - **Given** an impossible diet + exclusion combination
  - **When** backend returns `400 LIBRARY_INSUFFICIENT_FOR_DIET_GOALS`
  - **Then** the user's existing active plan stays intact and a clear adjustment suggestion appears.
- **Scenario 3: Switching region updates meal pool cleanly without losing logged food entries**
  - **Given** Breakfast on Today is logged under `"egypt"` region
  - **When** user changes `region` to `"gulf"` and regenerates meal plan
  - **Then** Today's logged breakfast snapshot remains untouched while future plan days use Gulf dishes.

### ANALYTICS
- `profile_nutrition_prefs_updated` (`diet_type`: `string`, `region`: `string`, `budget`: `string`, `conditions_count`: `integer`, `allergies_count`: `integer`)

---

## US-PRF-05: App Language (`Arabic` RTL / `English` LTR Instant Live Switch), Unit System, Digit Style & Automatic Timezone Sync

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRF-05` |
| **Epic** | `EPIC-09` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `profile`, `localization`, `rtl`, `timezone`, `units` |
| **Target Screens** | `LanguageAndRegionSettingsScreen`, `LanguagePickerSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` (`action: "timezone"`, `action: "profile_update"`, `POST /v1/devices/push-token`) |

### STORY
As a bilingual user in the Middle East, I want to switch the entire app between **Arabic (RTL)** and **English (LTR)** instantaneously without restarting the app, choose my unit system (`Metric` vs `Imperial`) and digit display style (Western `123` default vs Eastern Arabic), and keep my IANA timezone & regional cuisine aligned accurately when I travel.

### PRECONDITIONS
- Available both inside `Profile -> Language, Region & Units` AND via the compact language pill on `SocialLoginScreen` / Onboarding header (`KAN-33` parity).

### SCREEN AND UI DETAILS
1. **Language Selector:** Two native-script rows:
   - Native Arabic script label *(Arabic — Right-to-Left layout)*
   - `English` *(English — Left-to-Right layout)*
   - Current choice marked cleanly with an active radio/check indicator.
2. **Unit System Selector (`unitSystem`):**
   - `Metric (kg, cm, ml / L)` (Default) vs `Imperial (lb, in, fl oz)` — synced via `action: "profile_update"` (`unitSystem: "metric" | "imperial"`) and hydrated in `bootstrap.profile.unitSystem` and `bootstrap.preferences.unitSystem` while keeping canonical SI metric values (`kg`, `cm`) on the API wire.
3. **Digit Preference Toggle:** `Western Numerals (0–9) — Recommended` (Default) vs `Eastern Arabic Numerals (U+0660..U+0669)` *(Note: Input fields always accept both cleanly via `normalizeDigits`!)*.
4. **Timezone & Auto-Region Row:** Shows active `profile.timezone` (e.g. `Africa/Cairo (GMT+2)`) + `[Auto-Detect from Device]` switch + searchable MENA IANA timezone picker (`Cairo`, `Riyadh`, `Dubai`, `Kuwait`, `Doha`, `Manama`, `Muscat`, `Amman`, `Beirut`, `Casablanca`, `Tunis`, `Algiers`). Note initial region detection uses the 5-tier cascade (`SIM Country -> Mobile Network -> WiFi/Edge IP via GET /v1/capabilities detectedGeo -> Timezone -> Supported-Regions popup fallback` when unresolved) and never silently overwrites a manually selected cuisine region (`US-PRF-04`).

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "timezone"`)
   - Payload: `{ "timezone": "Asia/Riyadh", "locale": "ar-SA" }` (supports all 14 `SUPPORTED_LOCALES`: `en`, `ar`, `ar-EG`, `ar-SA`, `ar-AE`, `ar-KW`, `ar-QA`, `ar-BH`, `ar-OM`, `ar-JO`, `ar-LB`, `ar-MA`, `ar-TN`, `ar-DZ`, and any valid IANA timezone via `validTimeZone`).
   - Error Codes: `400 INVALID_TIMEZONE`, `400 INVALID_LOCALE`.
2. **`POST /v1/commands?view=receipt`** (`action: "profile_update"`)
   - Payload: `{ "unitSystem": "metric" | "imperial" }` (exposed in `bootstrap.profile` and `bootstrap.preferences`).
   - Error Codes: `400 INVALID_UNIT_SYSTEM`.
3. **`POST /v1/devices/push-token`** (Re-syncs push `locale` & `timezone` whenever language/timezone updates!).

### RULES & BUSINESS LOGIC
1. **Zero-Restart Live Layout Mirroring:** Switching language updates Compose `LayoutDirection` / SwiftUI `environment(\.layoutDirection)` immediately across every active screen without losing scroll state or unsaved inputs! User-typed text (`profile.name`, manual meal names) stays untouched.
2. **Notification Re-Scheduling (`US-INT-02`):** Immediately rewrites all local scheduled notification strings into the newly chosen language.
3. **Offline Language Switching:** All UI strings (`ar` / `en`) live in bundled KMM string resources (`Compose Resources` / `Localizable.xcstrings`), so switching works 100% offline, queuing `timezone` (`locale`) sync cleanly into outbox if online status is unavailable.
4. **Error & Coaching Code Localization Guarantee:** All server error codes (`contracts/error-codes.json` — 293 codes) and coaching/brief/review codes (`contracts/coaching-codes.json` — 97 codes) map `(code, params)` into the active app language cleanly on KMM.

### MAIN FLOW
1. User opens `Profile -> Language, Region & Units`.
2. User taps `English` -> Entire UI switches instantaneously to English & LTR without restarting, keeping `"Ahmed"` intact.
3. User toggles `Imperial (lb, in)` -> `profile_update` (`unitSystem: "imperial"`) syncs preference across devices while keeping canonical metric API wire payloads.
4. App sends `POST /v1/commands` (`action: "timezone"`, `locale: "en"`) in background and updates local notifications to English.

### EDGE CASES
- **User Signs In on a Second Phone Whose OS Language Differs From Server Profile:** Upon login restore (`US-AUTH-02`), adopt `serverProfile.locale` (if previously chosen) OR allow instant 1-tap switch if user prefers device locale.
- **Daylight Saving Time (Egypt DST Shifts):** Using IANA `Africa/Cairo` (not fixed `UTC+2` offsets!) guarantees midnight date rollovers stay 100% synced with `serverDate`.
- **Offline Language Switch (`Arabic <-> English`):** Applies immediately using bundled KMM resources (`0 ms` network dependency) and queues `timezone` (`locale`) update cleanly into the offline outbox.
- **Invalid Custom Timezone Fallback (`400 INVALID_TIMEZONE`):** Picker restricts choices strictly to canonical OS `TimeZone.availableZoneIds` (validated IANA strings) so invalid offsets cannot be submitted.
- **Imperial Unit Display & SI Metric Wire Round-Trip:** Converting display values (`lb <-> kg`, `in <-> cm`, `fl oz <-> ml`) preserves canonical SI metric values on the API wire so toggling units back and forth never accumulates rounding drift.

### ACCEPTANCE CRITERIA
- **Scenario 1: Language switch applies live without app restart and preserves typed names**
  - **Given** user's name is `"Ahmed"` and app is currently Arabic (RTL)
  - **When** user selects `English`
  - **Then** every tab, header, and error message switches to English (LTR) immediately without restarting, and `profile.name` remains `"Ahmed"`.
- **Scenario 2: Unit system persists across devices via `profile_update`**
  - **Given** user selects `Imperial` in `LanguageAndRegionSettingsScreen`
  - **When** `POST /v1/commands` (`action: "profile_update"`, `{ "unitSystem": "imperial" }`) commits
  - **Then** `bootstrap.profile.unitSystem` and `bootstrap.preferences.unitSystem` return `"imperial"`.
- **Scenario 3: Eastern Arabic numeral input parses consistently regardless of display digit preference**
  - **Given** user displays Western digits (`0–9`) but types Eastern Arabic numerals on an Arabic keyboard
  - **When** entering weight or gram weights anywhere in the app
  - **Then** `normalizeDigits` converts them transparently before validation and API transmission.

### ANALYTICS
- `app_language_changed` (`from_locale`: `string`, `to_locale`: `string`)
- `unit_system_changed` (`unit_system`: `"metric" | "imperial"`)
- `timezone_updated` (`from_tz`: `string`, `to_tz`: `string`)

---

## US-PRF-06: Privacy Center, Health Consents, GDPR Data Export, Multi-Device Sign Out & Permanent Account Deletion

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRF-06` |
| **Epic** | `EPIC-09` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `profile`, `privacy`, `gdpr`, `security`, `compliance` |
| **Target Screens** | `PrivacyAndSecurityScreen`, `DeleteAccountConfirmModal` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` (`GET`/`POST /v1/account/consents`, `GET /v1/account/export`, `POST /v1/auth/logout`, `POST /v1/auth/revoke`, `DELETE /v1/devices/push-token`, `DELETE`/`POST /v1/account/delete`, `bootstrap.consents`) |

### STORY
As a privacy-conscious user (and per Apple App Store & Google Play mandatory account deletion policies), I want a transparent Privacy Center where I can review/update my health data consents, download a complete machine-readable export of my data (GDPR), sign out of this device or all active devices, or permanently erase my account and every stored record irreversibly.

### PRECONDITIONS
- User is authenticated.

### SCREEN AND UI DETAILS
1. **Privacy & Consents Section:**
   - Displays `Health Data Processing Consent (v1.0.0 — Accepted on {recordedAt})` (hydrated from `GET /v1/bootstrap` `data.consents` and `GET /v1/account/consents`) + Optional `Product Analytics & Crash Telemetry` toggle (`POST /v1/account/consents`).
   - Clear explanation: *"Note: Withdrawing Health Data Processing consent locks personalized plan generation, renewals, comeback restarts, coaching reviews, and cycle mutations (`403 HEALTH_CONSENT_REQUIRED`) until re-granted; you can also export or delete your data anytime."*
2. **Data Portability (`[Download My Complete Data (JSON)]`):**
   - Calls `GET /v1/account/export` and opens the OS Share Sheet (`Files`, `Email`, `Drive`) with `curafit-export-{date}.json` containing profile, logs, archived plans, consents, `oauthIdentities`, `registeredDevices`, `aiMessages`, live `entitlements`, and short-lived signed URLs for avatar & progress photos!
3. **Session & Security Controls:**
   - `[Sign Out This Device]` -> Confirmation alert *"Sign out? Unsynced offline logs will finish syncing first (or stay saved until you sign back in)."* -> `POST /v1/auth/logout` (`allDevices: false`, which also automatically clears the device push token).
   - `[Sign Out All Devices]` -> For lost/shared phones -> `POST /v1/auth/logout` (`allDevices: true`) or `POST /v1/auth/revoke` (`allDevices: true`) — both automatically clear all server-side push tokens for the user so signed-out devices stop receiving pushes.
4. **Danger Zone — `[Delete My Account Permanently]` (Mandatory Apple Guideline 5.1.1(v) & Google Play Compliance):**
   - Step 1: Warning sheet listing everything erased permanently (`profile`, `OAuth login links`, `all nutrition & workout plans`, `food/weight/workout/recovery logs`, `R2 avatars & progress photos`, `push tokens`, `all sessions`). Also warns: *"Deleting your CuraFit account does not automatically cancel an active Apple/Google subscription — manage billing in App Store / Play Store if subscribed."* with direct `[Manage Store Subscription]` link!
   - Step 2: User must type `"DELETE"` (or tap explicit confirmation switch) -> Primary destructive red button `[Permanently Delete Everything]` (`DELETE /v1/account/delete` — or `POST /v1/account/delete` fallback for HTTP clients that strip bodies on `DELETE` — with `{ "confirm": true }`).

### API & BACKEND CONTRACT
1. **`GET /v1/account/consents`** (plus `consents` returned in `GET /v1/bootstrap`) -> Lists recorded consent types, versions, accepted status, and `recordedAt` timestamps.
2. **`POST /v1/account/consents`** -> Accepts either a single `{ "consentType": "health_data_processing" | "analytics_telemetry" | "terms_and_privacy", "version": "1.0.0", "accepted": true | false }` OR a batch `{ "items": [{ "consentType", "version", "accepted" }, ...] }` (`1..10` items) -> Persists `recordedAt` timestamp. Withdrawing `health_data_processing` (`accepted: false`) blocks `generate`, `review`, `adaptation`, `renew_plan`, `comeback_restart`, `cycle_settings`, `cycle_log`, and `cycle_gentle_session` with `403 HEALTH_CONSENT_REQUIRED` until re-granted.
3. **`GET /v1/account/export`** -> Full GDPR JSON archive (`schemaVersion`, `exportedAt`, `userId`, `profile`, `logs`, `archivedNutritionPlans`, `archivedWorkoutPlans`, `consents`, `oauthIdentities`, `registeredDevices`, `aiMessages`, live `entitlements`, and short-lived signed URLs for avatar & progress photos).
4. **`POST /v1/auth/logout`** -> `{ "allDevices": false | true }` (and `POST /v1/auth/revoke` with `{ "allDevices": true }` for remote session invalidation — both automatically clear push tokens on the server).
5. **`DELETE /v1/devices/push-token?deviceId={id}`** -> Unregisters device push notifications cleanly.
6. **`DELETE /v1/account/delete`** *(also accepts **`POST /v1/account/delete`** fallback for mobile/proxy stacks that disallow `DELETE` request bodies)* -> Request Body: `{ "confirm": true }`.
   - **Safe Two-Phase Deletion Order:**
     1. **Phase 1 (Atomic D1 Batch FIRST):** Snapshots R2 keys, Apple token, and anonymized SHA-256 `coaching_trial_tombstones` (zero PII, prevents free-trial reset abuse), then atomically erases all D1 tables (`coaching_accounts`, `coaching_plans`, `coaching_workout_plans`, `coaching_users`, `coaching_refresh_tokens`, `coaching_oauth_identities`, `coaching_push_tokens`, all normalized logs) and writes the `__deleted__` tombstone (`ACCOUNT_DELETED`).
     2. **Phase 2 (External Cleanup AFTER D1 Commit):** Purges Cloudflare R2 objects (`avatars/{userId}/*`, `users/{userId}/photos/*`) and revokes the stored encrypted **Apple Sign-In refresh token** server-side via Apple's `https://appleid.apple.com/auth/revoke` endpoint *(mandatory per App Store Review Guideline 5.1.1(v))*.
   - Error Codes: `DELETE_CONFIRMATION_REQUIRED`, `INVALID_CONSENT_PAYLOAD`, `ACCOUNT_DELETION_MIGRATION_REQUIRED`.

### RULES & BUSINESS LOGIC
1. **Pre-Logout Outbox Check:** If `outbox_commands` has unsent items when user taps `[Sign Out This Device]`, offer `[Sync & Sign Out]` (if online) or explicit warning *"You have {N} unsynced changes offline. Signing out now will discard unsynced local changes."*
2. **Complete Client Wipe on Logout / Delete:**
   - On `logout`: Delete tokens in Keychain / EncryptedSharedPreferences, unregister push token (`DELETE /v1/devices/push-token?deviceId=...`), clear local notifications, wipe cached SQLDelight user data, and navigate to Onboarding Step 0 (`US-MOB-01`) or `SocialLoginScreen`.
   - On `account/delete`: Perform identical full wipe INCLUDING local-only progress photos vault and any `pendingSyncPlan`, returning cleanly to Onboarding Step 0 (`US-MOB-01`).

### MAIN FLOW
1. User taps `Profile -> Privacy, Consents & Export`.
2. User taps `[Download My Complete Data (JSON)]` -> `GET /v1/account/export` downloads and opens OS Share Sheet cleanly.
3. User (optionally) taps `[Delete My Account Permanently]`, reviews the subscription reminder, types `"DELETE"`, and confirms.
4. `DELETE /v1/account/delete` (or `POST /v1/account/delete`) returns `{ deleted: true }`; client wipes all local state & tokens and resets smoothly to Onboarding Step 0 (`US-MOB-01`).

### EDGE CASES
- **Active Pro Subscription When Deleting Account (`US-MON-04` Cross-Link):** Prompt explicitly warns *"Deleting your CuraFit account does NOT cancel Apple App Store or Google Play recurring billing"* and provides a 1-tap `[Open Store Subscriptions]` button before final deletion confirmation!
- **Network Error During `DELETE /v1/account/delete`:** Do NOT clear tokens prematurely; keep user authenticated and display `[Retry Deletion]` so user isn't stranded thinking their server data was deleted when it wasn't.
- **Offline Sign Out With Queued Outbox Items:** Offers clear warning showing exact `{N}` pending unsynced changes before wiping local cache, preventing silent data loss!
- **Re-Signing In After Permanent Deletion:** Because deletion unlinks `coaching_oauth_identities` while tombstoning the old `userId` (and recording anonymized SHA-256 `coaching_trial_tombstones`), any old JWT or refresh token from the deleted account fails with `401 ACCOUNT_DELETED`, whereas signing in fresh with Google or Apple creates a **brand-new empty account** (`isNewUser: true`, `profile: null`) without resurrecting any erased logs (and without resetting free-trial eligibility if a trial was previously used).

### ACCEPTANCE CRITERIA
- **Scenario 1: Full GDPR export generates shareable JSON file with identities, devices, and signed media links**
  - **Given** user taps `[Download My Complete Data]`
  - **When** `GET /v1/account/export` succeeds (`200 OK`)
  - **Then** payload includes `oauthIdentities`, `registeredDevices`, `aiMessages`, live `entitlements`, and short-lived signed URLs for avatar & progress photos, and client launches the OS Share Sheet.
- **Scenario 2: Permanent deletion executes atomic D1 batch first, then R2 & Apple cleanup, and resets app**
  - **Given** user confirms `"DELETE"` on `DeleteAccountConfirmModal`
  - **When** `DELETE /v1/account/delete` (`{ "confirm": true }`) returns `200 OK`
  - **Then** server completes atomic D1 wipe (recording anonymized trial tombstones), purges R2 objects & revokes Apple refresh token, and client erases Keychain / EncryptedSharedPreferences tokens, SQLDelight caches, and local photos.
- **Scenario 3: Withdrawing `health_data_processing` consent locks plan/coaching mutations**
  - **Given** user posts `POST /v1/account/consents` with `{ "consentType": "health_data_processing", "version": "1.0.0", "accepted": false }`
  - **When** attempting `generate`, `review`, `adaptation`, `renew_plan`, `comeback_restart`, `cycle_settings`, `cycle_log`, or `cycle_gentle_session`
  - **Then** server returns `403 HEALTH_CONSENT_REQUIRED` until consent is re-granted.

### ANALYTICS
- `account_gdpr_exported` (`archived_plans_count`: `integer`)
- `account_signed_out` (`all_devices`: `boolean`, `had_pending_outbox`: `boolean`)
- `account_deleted_completed` (`entitlement`: `"free" | "pro"`)

---

## US-PRF-07: Help Center, Clinical/Non-Medical Disclaimers, Legal Terms, Support Contact & App Info

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRF-07` |
| **Epic** | `EPIC-09` |
| **Priority** | `Medium` |
| **Labels** | `production`, `mobile`, `profile`, `support`, `legal`, `compliance` |
| **Target Screens** | `HelpAndLegalScreen`, `ReportBugFeedbackSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` (`GET /v1/health`, `GET /v1/capabilities`, `GET /v1/catalog/manifest`, `POST /v1/support/feedback`) |

### STORY
As a user wanting answers to common questions, transparent scientific/medical disclaimers, legal privacy/terms documents, or a way to report a bug/food data issue with diagnostic context, I want an accessible Help & App Info center inside Profile.

### PRECONDITIONS
- User navigates to `Profile -> Help, Legal & App Info` (Terms & Privacy also accessible pre-auth from `SocialLoginScreen` `US-AUTH-01`).

### SCREEN AND UI DETAILS
1. **FAQ & Quick Guides:** Collapsible clear answers covering:
   - *How CuraFit calculates calories, protein & Ideal Weight Range*
   - *How Double Progression and 80% workout completion work*
   - *How 14-day Adaptive Calorie Reviews collect evidence*
   - *Difference between Simple Mode and Pro Mode*
2. **Medical & Scientific Disclaimer Card (Mandatory Clinical Transparency):**
   - *"CuraFit provides deterministic nutrition and training guidance grounded in peer-reviewed equations (Mifflin-St Jeor, validated nutrient datasets, OpenExerciseDB). It is not a medical device, clinical diagnosis, or substitute for a licensed physician or dietitian."*
3. **Legal Documents:**
   - `[Terms of Service]` | `[Privacy Policy]` | `[Data Sources & Licenses]` (lists `USDA FDC`, `UK CoFID 2021`, `Egyptian Baladi Study 2018`, `Lebanese Lab Study 2021`, `Regional Serving Models`, and `OpenExerciseDB` attribution cleanly from `GET /v1/catalog/manifest`!).
4. **Support & Diagnostic Feedback (`[Contact Support / Report Issue]` -> `ReportBugFeedbackSheet`):**
   - Category (`Bug Report`, `Food Data Correction`, `Exercise Media Issue`, `Billing Question`, `Feature Idea`), free-text note, and `"Include diagnostic app version & last Request ID"` toggle (NO health weights/conditions included automatically!).
   - Calls `POST /v1/support/feedback` (or opens pre-addressed support email fallback if offline).
5. **App & Server Diagnostics Footer:**
   - App Version (`1.0.0 (Build ...)`), Engine Version (`capabilities.engineVersion`), Food Catalog Version (`foodCatalogVersion`), Exercise Catalog Version (`catalogVersion`), OpenExerciseDB manifest provenance (`GET /v1/catalog/manifest`), and live Server Health indicator (`GET /v1/health`).

### API & BACKEND CONTRACT
1. **`GET /v1/health`** -> `{ status, apiVersion, engineVersion, requestId }`.
2. **`GET /v1/capabilities`** -> `{ apiVersion, schemaVersion, engineVersion, catalogVersion, foodCatalogVersion, features[] }`.
3. **`GET /v1/catalog/manifest`** -> Pinned OpenExerciseDB & food catalog provenance manifest.
4. **`POST /v1/support/feedback`** -> `{ category, message, foodOrExerciseId?, includeDiagnostics, appVersion, platform, lastRequestId }` -> Returns `{ ticketId, receivedAt }`.

### RULES & BUSINESS LOGIC
1. **Diagnostic Privacy Guard:** Support tickets automatically attach ONLY `appVersion`, `platform`, `locale`, `engineVersion`, and `lastRequestId` — NEVER attach body weight, medical conditions, photos, or JWT tokens!
2. **Accessible Pre-Auth:** Terms & Privacy viewers work inside `SocialLoginScreen` and Onboarding without requiring an active Bearer token.

### MAIN FLOW
1. User taps `Profile -> Help, Legal & App Info`.
2. User checks `Data Sources & Licenses`, sees catalog version `0.6.0-data.4` & OpenExerciseDB provenance from `GET /v1/catalog/manifest`, and taps `[Contact Support / Report Issue]`.
3. User picks `Food Data Correction`, writes a short note, and taps `[Send Feedback]` -> Receives confirmation ticket ID `"#CF-2841"`.

### EDGE CASES
- **Offline Help Browsing:** FAQ accordion, Legal summaries, and Medical Disclaimer are bundled locally in KMM assets so they read cleanly offline; support ticket submission queues or offers `[Send via Email App]`.
- **Empty Feedback Message:** Disables `[Send Feedback]` until user enters at least `10` meaningful characters explaining the issue.
- **Unauthenticated User Views Legal Docs From `SocialLoginScreen`:** Opens Terms of Service, Privacy Policy, and Non-Medical Disclaimer smoothly in modal sheets without triggering authenticated `/v1/profile` or `/v1/bootstrap` calls.
- **`GET /v1/health` Reports Degraded Database Status (`503`):** Displays calm `"Cloud Service Temporarily Slow"` status pill in Diagnostics Footer while keeping offline guides fully accessible.

### ACCEPTANCE CRITERIA
- **Scenario 1: Support feedback excludes sensitive PII/health metrics**
  - **Given** user submits a bug report with `"Include diagnostics"` enabled
  - **When** `POST /v1/support/feedback` is sent
  - **Then** payload contains `appVersion`, `platform`, and `lastRequestId` with zero weight, medical conditions, or auth tokens.
- **Scenario 2: Legal docs and disclaimers render offline and before authentication**
  - **Given** a logged-out user offline taps `[Privacy Policy]` on `SocialLoginScreen`
  - **When** the sheet opens
  - **Then** bundled localized Privacy Policy & Medical Disclaimer render completely offline with zero errors.
- **Scenario 3: Diagnostics footer displays live catalog and engine versions**
  - **Given** user opens `Help & Legal` while online
  - **When** `GET /v1/capabilities` and `GET /v1/catalog/manifest` complete
  - **Then** App Version, `engineVersion`, `foodCatalogVersion`, and OpenExerciseDB provenance match server metadata accurately.

### ANALYTICS
- `help_legal_viewed` (`section`: `"faq" | "terms" | "privacy" | "licenses" | "disclaimer"`)
- `support_feedback_submitted` (`category`: `string`)
