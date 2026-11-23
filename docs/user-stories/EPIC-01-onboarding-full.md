# EPIC-01 (Full Jira Export): Mobile Conversational Onboarding & Smart Plan Engine

> **Jira Epic Key:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34)
> **Priority:** `Medium`
> **Labels:** `MVP`, `mobile`, `onboarding`, `production`
> **API Alignment Reference:** See [`EPIC-01-onboarding-alignment.md`](EPIC-01-onboarding-alignment.md) for CuraFit API v1 sequence & backend parity updates.

---

**EPIC OVERVIEW**

End-to-end mobile specification for the **Conversational Onboarding & Smart Plan Calculation Engine** for the Middle East Nutrition & Workout Coach mobile application.

This Epic covers the complete conversational chat onboarding flow, authentication & saved-data recovery routing, local draft persistence & session resume, in-chat answer editing with smart dependency invalidation, clinical/maternal/age safety gates, anthropometric & macronutrient mathematical equations, location-first workout programming, and the dual-path "Start My Plan" handoff to the Home screen.

---

**CHILD USER STORIES IN THIS EPIC**

- **KAN-35 (**`US-MOB-01`): App Launch Routing, Account Check (First Chat Question), Sign-In Return & Data Recovery
- **KAN-36 (**`US-MOB-02`): Conversational Chat Framework, Dynamic Progress, Local Persistence & In-Chat Answer Editing
- **KAN-37 (**`US-MOB-03`): Name, Age & Age Safety Gate (Under-18 Block & 70+ Senior Mode)
- **KAN-38 (**`US-MOB-04`): Biological Sex, Maternal Status (Pregnancy Trimesters & Breastfeeding) & Body Measurements (Height & Weight)
- **KAN-39 (**`US-MOB-05`): Fitness Goal, Target Weight with Live BMI Range Warning & Weekly Goal Pace Calculator
- **KAN-40 (**`US-MOB-06`): Service Track Selection & Workout Setup (Fitness Level, Location-First Routing, Custom Weekdays & Home Equipment)
- **KAN-41 (**`US-MOB-07`): Smart Hybrid Workout Split Selection, Session Duration & Injury-Safe Exercise Filtering
- **KAN-42 (**`US-MOB-08`): Nutrition Setup — Daily Activity, Clinical Conditions, Diet School, Meal Timing/Count, Budget & Exclusions
- **KAN-43 (**`US-MOB-09`): Plan Summary Screen, Complete Mathematical Equations & Dual-Path "Start Plan" Handoff (Server Sync vs. Passwordless Social Sign-In)

---

## US-MOB-01: App Launch Routing, Account Check (First Chat Question), Sign-In Return & Data Recovery

> **Jira Key:** [`KAN-35`](https://abdulrahman-alaa.atlassian.net/browse/KAN-35) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a new or returning mobile user launching the app, I want the app to automatically detect my region, resume where I left off if I had an incomplete onboarding session, ask me as the very first chat question whether I already have an account, and handle Passwordless Social Sign-In (`EPIC-02`) and saved-data restoration smoothly so that I never lose my progress or repeat questions unnecessarily.

---

**PRECONDITIONS**

- The mobile app is launched (cold start or foreground resume).
- KMM local storage (**SQLDelight** / **DataStore**) and platform-secure authentication token storage (**iOS Keychain** / **Android EncryptedSharedPreferences**) are accessible.
- The user has not already completed onboarding with an active synced plan on this device (`onboardingCompleted == false`), OR has just authenticated via Passwordless Social Sign-In (`EPIC-02`).

---

**SCREEN AND UI DETAILS**

**1. Auto-Region Detection & Header Switcher**

- On first launch, inspect device timezone and locale (`kotlinx.datetime.TimeZone.currentSystemDefault()` & platform `Locale`) and map silently to one of 4 supported regions:
  - `egypt`: `Africa/Cairo` or `*-EG` -> Header Badge: `Egypt`
  - `gulf`: `Asia/Riyadh`, `Asia/Dubai`, `Asia/Kuwait`, `Asia/Qatar`, `Asia/Bahrain`, `Asia/Muscat` -> Header Badge: `Gulf (GCC)`
  - `levant`: `Asia/Amman`, `Asia/Beirut`, `Asia/Damascus`, `Asia/Gaza`, `Asia/Hebron` -> Header Badge: `Levant`
  - `maghreb`: `Africa/Casablanca`, `Africa/Algiers`, `Africa/Tunis`, `Africa/Tripoli` -> Header Badge: `Maghreb`
  - Default fallback if outside these zones: `egypt` (`Egypt`).
- Display a compact region badge in the top header allowing the user to manually switch regions at any time via a bottom sheet.

**2. First Chat Question (`account_check`)**

- **Coach Greeting Bubble:**
  - *"Welcome to CuraFit! Give me 2 quick minutes to learn about your body and routine so I can craft a pro-grade nutrition & workout blueprint tailored 100% to you. First, do you already have an account with us?"*
  - **Micro-Why Caption:** *"Your answers let us calculate clinical-grade calories, safe workouts, and local meals for your exact goal."*
- **Sticky Bottom Input Area (2 Action Cards):**
  - Option 1: `[No, I'm a new user — Let's start]` (`account_check = "no"`)
  - Option 2: `[Yes, I already have an account — Sign In]` (`account_check = "yes"`)

**3. Saved Data Conflict / Recovery Prompt (**`data_recovery_prompt`)

- Triggered inside the chat (or modal sheet) when:
  - **Case A:** The user signs in via Passwordless Social Sign-In (`EPIC-02`, from `account_check = "yes"` or later) and `GET /v1/bootstrap` returns an existing profile/plan (`data.profile != null`), OR
  - **Case B:** The app detects a pre-existing saved profile/plan on the device or server that conflicts with starting a new session.
- **Coach Bubble / Prompt:**
  - *"We found previously saved data and a plan on your account! Would you like to restore your saved data and go straight to the Home screen, or start fresh from the beginning?"*
- **Options:**
  - `[Restore my saved data (Go to Home)]` (`restore_data`)
  - `[Start fresh from the beginning]` (`start_fresh`)

---

**RULES & ROUTING LOGIC**

1. **App Launch Decision Tree (**`resolveStartupDestination()`):
  - **State 1 — Active Completed User (`signed_in_active`):** `onboardingCompleted == true` AND valid synced plan exists -> Navigate directly to **Home Screen** (`HomeScreen`).
  - **State 2 — Mid-Onboarding Resume (App Killed & Reopened):** `onboardingCompleted == false` AND `onboardingDraft.lastActiveStepId != null` AND at least 1 step answered -> Navigate to **Onboarding Chat Screen**, render all previously answered Q&A bubbles from `onboardingDraft`, and scroll smoothly to `lastActiveStepId` with a resume banner (*"Welcome back! Let's pick up right where you left off."*).
  - **State 3 — Fresh Install / No Draft:** `onboardingDraft` is empty -> Navigate to **Onboarding Chat Screen** and start at Step 0 (`account_check`).
2. **First Question (**`account_check`) Routing:
  - If user selects `No` (`"no"`):
    - Set `onboardingDraft.accountCheck = "no"`, `isAuthenticated = false`.
    - Append user bubble `"No, I'm a new user"` and advance immediately to the `name` question (`US-MOB-03`).
  - If user selects `Yes` (`"yes"`):
    - Navigate to **Passwordless Social Sign-In (`EPIC-02`)** (`entrySource = "onboarding_account_check"`).
3. **Post-Sign-In Routing Matrix (When returning from Passwordless Social Sign-In (`EPIC-02`)):**
  - **Scenario 3A — Signed-in Account is NEW (**`GET /v1/bootstrap` returns `data.profile == null`, canonical auth state `signed_in_needs_onboarding`):
    - Keep user authenticated (`isAuthenticated = true`, auth state `signed_in_needs_onboarding`, store `accessToken`, `refreshToken`, & `userId`).
    - Return user automatically to **Onboarding Chat Screen**.
    - Mark `account_check` as completed (`"signed_in_needs_onboarding"`), pre-fill `name` as a 1-tap suggestion if available from the Google/Apple OIDC profile, and continue the onboarding chat from the first unanswered question.
    - Show coach confirmation bubble: *"You're signed in! Since your account is new and hasn't completed setup yet, let's finish a few quick questions to build your custom plan."*
  - **Scenario 3B — Signed-in Account has OLD Saved Data (**`GET /v1/bootstrap` returns `data.profile != null`, canonical auth state `signed_in_active`):
    - Present the **Data Recovery Prompt** (`restore_data` vs. `start_fresh`):
      - If user selects `Restore saved data` (`restore_data`):
        - Hydrate local SQLDelight storage from `GET /v1/bootstrap`, set `onboardingCompleted = true` (`signed_in_active`), and navigate directly to **Home Screen**.
      - If user selects `Start fresh` (`start_fresh`):
        - Keep user authenticated (`isAuthenticated = true`, auth state `signed_in_needs_onboarding`), clear local `onboardingDraft` answers, and start the onboarding chat from the `name` question. Upon completion, tapping "Start Plan" on the Summary screen runs the canonical `POST /v1/commands?view=full` (`action: "generate"`, `overwriteExisting: true`) sequence to replace the old server plan.
  - **Scenario 3C — User Presses Back on Passwordless Social Sign-In without Signing In:**
    - Return to **Onboarding Chat Screen** at the `account_check` step so the user can choose `"No, I'm a new user"` or try signing in again.

---

**MAIN FLOW**

1. User opens the app for the first time.
2. System detects region automatically (e.g., `egypt`) and opens the Onboarding Chat Screen.
3. Coach asks the first question (`account_check`): *"Do you already have an account with us?"*
4. **Path A (New User):** User taps *"No, I'm a new user"* -> Chat records the answer and immediately displays the `name` question.
5. **Path B (Existing Account — New/Incomplete):** User taps *"Yes, I already have an account"* -> Authenticates via **Passwordless Social Sign-In (`EPIC-02`)** -> `GET /v1/bootstrap` returns `data.profile == null` (`signed_in_needs_onboarding`) -> App returns to Onboarding Chat authenticated and continues from `name`.
6. **Path C (Existing Account — Has Saved Data):** User taps *"Yes, I already have an account"* -> Authenticates via **Passwordless Social Sign-In (`EPIC-02`)** -> `GET /v1/bootstrap` returns `data.profile != null` (`signed_in_active`) -> Coach asks *"Restore saved data or start fresh?"* -> User chooses either **Home Screen** (Restore) or **Onboarding Chat** (Start fresh).

---

**EDGE CASES**

- **App Killed Mid-Onboarding:** User answers up to `current_weight`, force-closes the app, and reopens it later -> App skips `account_check` and all answered steps, renders the saved chat history, and resumes directly at `goal`.
- **Offline Sign-In Attempt:** If the user taps *"Yes, I already have an account"* while offline, the Passwordless Social Sign-In sheet (`EPIC-02`) shows a clear offline message and a `[Continue as new user without signing in for now]` secondary button that sets `accountCheck = "no"` and continues onboarding locally until the Summary handoff (where connectivity is required to sign in and run initial `generate`).
- **Corrupted Local Draft JSON:** If local `onboardingDraft` fails schema validation on startup, catch the error, clear the corrupted draft key, and start cleanly at `account_check` without crashing.
- **Social Sign-In Provides Display Name:** Pre-fill the display name as a 1-tap suggestion chip in the `name` step rather than silently skipping `name`, so the user can confirm or edit their preferred coaching name.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: First question asks about existing account**
  - **Given** a fresh install with no saved local state
  - **When** the Onboarding Chat screen loads
  - **Then** the very first question displayed is `account_check` with two options (`No, I'm a new user` and `Yes, I already have an account`).
- **Scenario 2: Selecting "No" continues onboarding chat**
  - **Given** the user is at `account_check`
  - **When** the user taps `"No, I'm a new user"`
  - **Then** the answer bubble is appended to the chat and the coach immediately asks the `name` question without requiring sign-in.
- **Scenario 3: Selecting "Yes" and signing into a new account (never completed onboarding)**
  - **Given** the user taps `"Yes, I already have an account"` and authenticates via Passwordless Social Sign-In (`EPIC-02`)
  - **When** `GET /v1/bootstrap` returns `data.profile == null` (`signed_in_needs_onboarding`)
  - **Then** the app keeps the user authenticated, navigates back to the Onboarding Chat screen, and continues from the first unanswered onboarding question.
- **Scenario 4: Selecting "Yes" and signing into an account with existing saved data**
  - **Given** the user authenticates via Passwordless Social Sign-In (`EPIC-02`)
  - **When** `GET /v1/bootstrap` returns `data.profile != null` (`signed_in_active`)
  - **Then** the app prompts the user to choose between **Restore saved data** (which hydrates local state and navigates directly to Home) or **Start fresh** (which keeps them authenticated and starts the onboarding questions from the beginning).
- **Scenario 5: Resuming incomplete onboarding after closing the app**
  - **Given** a user answered 6 onboarding questions and closed the app before completing onboarding
  - **When** the user reopens the app
  - **Then** all 6 previous answers are restored in the chat history and the active input bar opens at question 7 (`lastActiveStepId`).

---

**ANALYTICS**

- `onboarding_started` (`auto_detected_region`, `has_existing_draft`)
- `onboarding_account_check_selected` (`choice`: `"yes"` | `"no"`)
- `onboarding_login_return` (`account_state`: `"signed_in_needs_onboarding"` | `"signed_in_active"` | `"cancelled"`)
- `onboarding_data_recovery_decision` (`decision`: `"restore_data"` | `"start_fresh"`)
- `onboarding_resumed` (`resumed_at_step_id`, `completed_steps_count`)

---

## US-MOB-02: Conversational Chat Framework, Dynamic Progress, Local Persistence & In-Chat Answer Editing

> **Jira Key:** [`KAN-36`](https://abdulrahman-alaa.atlassian.net/browse/KAN-36) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a user going through the conversational onboarding, I want a fast, natural chat interface where I can see my dynamic progress, have every answer saved automatically, and tap any previous answer at any time to edit it—with the chat intelligently preserving valid downstream answers and only re-asking questions invalidated by my change.

---

**PRECONDITIONS**

- User is on the **Onboarding Chat Screen** (`US-MOB-01`).
- Local persistence engine (`onboardingDraft` store in SQLDelight / DataStore) is initialized.

---

**SCREEN AND UI DETAILS**

**1. Top Header Bar**

- **Coach Identity:** Coach Avatar + Title *"Smart Nutrition & Workout Coach"* + online status indicator dot.
- **Dynamic Progress Bar & Counter:**
  - Displays `Step X of Y` and a smooth progress fill bar (`percentage = round((currentStepIndex / totalActiveSteps) * 100)`).
  - `Y` (`totalActiveSteps`) dynamically recalculates whenever conditional branching changes (e.g., `male` vs. `female`, `nutrition_only` vs. `nutrition_and_workouts`, `home_only` vs. `gym_only`).
- **Region Badge (**`Egypt` / `Gulf` / `Levant` / `Maghreb`) + **Reset Action (**`Start Over`) with confirmation modal.

**2. Chat Stream Area (Jetpack Compose `LazyColumn` / SwiftUI `LazyVStack`)**

- **Coach Message Bubbles:** Coach-side aligned, rounded corners, optional subtitle/helper hint.
- **Typing Indicator:** Animated 3-dot bubble shown for `250ms–400ms` max before rendering the next question.
- **User Answer Bubbles (Interactive & Editable):**
  - User-side aligned with distinct brand accent background.
  - Every user answer bubble includes a visible `Edit` (`✏️`) badge/icon and is tappable (`onClick -> openEditStep(stepId)`).

**3. Sticky Bottom Dynamic Input Dock**

- Changes control type automatically based on the active step's `type`:
  - `single-select`: 1-tap option cards (auto-advances on tap).
  - `multi-select`: Toggleable chips/cards with sticky `[Confirm Selection (N)]` primary button.
  - `number-with-chips`: Quick-select value chips on top + numeric input field & `[Confirm]` button below.
  - `text`: Single-line text field with `[Send]` button.
  - `weekdays`: 7 day-of-week toggle buttons (`Saturday` to `Friday`) + quick preset pills.
  - `day-location-split`: Per-selected-day toggle (`Home` vs. `Gym`).
  - `summary`: Full-screen or expandable rich summary card with `[Start My Plan]` CTA.

**4. In-Chat Answer Edit Mode (Bottom Sheet / Inline Re-Prompt)**

- When the user taps any previous User Answer Bubble (`stepId`):
  - Open an **Edit Answer Bottom Sheet** (or inline active input dock focused on that question) displaying the question prompt and the user's current selection pre-highlighted, plus a `[Cancel]` button.
- When the user confirms the new value:
    - Update the answer bubble text in-place with an `"Edited ✓"` indicator.
    - Run the **Dependency Invalidation Matrix** (see below).
    - If any downstream answers were invalidated, show a brief coach notification bubble (*"Since you updated [Question Name], let's quickly confirm this step as well:"*) and focus the first invalidated step.
    - If no downstream answers were invalidated, return the user directly to the step they were on before editing (including returning directly to the `summary` screen with recalculated numbers if they edited from `summary`).

**5. Conversational Energy & Micro-Value Copy Standards (Compact UI Rule)**

To make onboarding feel engaging and scientifically valuable without adding screen clutter or long paragraphs:
- **1-Line Micro-Why Caption (`12sp`, muted text):** Directly under each question bubble, include at most 1 concise line (<= 12 words) explaining *why* that input personalizes their plan.
- **Instant 1-Line Coach Micro-Reactions:** Immediately after key milestone answers (`name`, `current_weight`, `goal_pace`, `workout_days`, `conditions`), emit a crisp 1-line dynamic insight showing the plan taking shape live (e.g., healthy weight range preview, timeline confidence, or weekly split tip).
- **Crisp 1-Line Card Subtitles (`5–8 words`):** Every `single-select` card displays a brief, scannable subtitle clarifying how options differ without expanding card height excessively.

---

**RULES & DEPENDENCY INVALIDATION MATRIX**

**1. Active Steps Calculation (**`getActiveSteps(state)`):
The ordered step list is evaluated dynamically from `state`:

1. `account_check`
2. `name`
3. `age` -> *(If *`age < 18`: route to `underage_gate` and stop until age is edited to `>= 18`)
4. `gender`
5. `maternal_status` *(Active ONLY if *`gender == 'female'` AND `age >= 18` AND `age <= 50`)
6. `height`
7. `current_weight`
8. `goal`
9. `target_weight` *(Active ONLY if *`goal != 'maintain'`)
10. `goal_pace` *(Active ONLY if *`goal != 'maintain'` AND `abs(current_weight - target_weight) >= 0.5`)
11. `service_track` (`nutrition_and_workouts` | `nutrition_only` | `workouts_only`)
12. **Workout Block** *(Active ONLY if *`service_track != 'nutrition_only'`):
  - `fitness_level`
  - `workout_location` (`gym_only` | `home_only` | `home_and_gym`)
  - `workout_days`
  - `workout_day_split` *(Active ONLY if *`workout_location == 'home_and_gym'`)
  - `home_equipment` *(Active ONLY if *`workout_location == 'home_only'` OR `workout_location == 'home_and_gym'`)
  - `workout_split` *(Active ONLY if *`workout_location != 'home_only'` AND `workout_days.length >= 3`)
  - `session_duration`
  - `injuries`
13. **Nutrition Block** *(Active ONLY if *`service_track != 'workouts_only'`):
  - `activity`
  - `conditions`
  - `diet_type`
  - `if_start_hour` *(Active ONLY if *`diet_type == 'intermittent_fasting'`)
  - `meals_count` *(Active ONLY if *`diet_type == 'balanced'`)
  - `budget`
  - `allergies`
14. `summary`

**2. Dependency Invalidation Rules When Editing an Answer (**`handleEditAnswer(stepId, newValue)`):
Never wipe all downstream answers blindly. Apply these exact rules:

| Edited Step (`stepId`) | Downstream Keys Preserved vs. Invalidated |
| :--- | :--- |
| `name` | **Invalidate:** None. Update name in-place and return to current step. |
| `age` | **If **`newValue < 18`: Route immediately to `underage_gate`.<br>**If **`newValue >= 70`: Enable `seniorMode = true`.<br>**If **`gender == 'female'` and `newValue > 50`: Clear `maternal_status`. Otherwise preserve all downstream answers and recalculate BMR/TDEE. |
| `gender` | **If changed from **`female` -> `male`: Clear `maternal_status` and remove `'diastasis_recti'` from `injuries` if present.<br>**If changed from **`male` -> `female` (and `18 <= age <= 50`): Insert `maternal_status` as unanswered and prompt it immediately; preserve height/weight/workout/nutrition answers unless invalidated by subsequent `maternal_status` selection. |
| `maternal_status` | **If changed to **`pregnant_t1`/`t2`/`t3`:<br>• If `goal == 'lose'`, clear `goal`, `target_weight`, and `goal_pace` (since weight loss is blocked in pregnancy).<br>• If `diet_type` is `'keto'` or `'intermittent_fasting'`, clear `diet_type` and `if_start_hour`.<br>**If changed to **`breastfeeding`:<br>• If `goal_pace` is `'moderate'` or `'fast'` and `goal == 'lose'`, cap deficit at `-300 kcal/day` or re-prompt `goal_pace` (`slow` only).<br>• If `diet_type` is `'keto'` or `'intermittent_fasting'`, clear `diet_type` and `if_start_hour`. |
| `height` or `current_weight` | Recalculate BMI, Ideal Weight Range (`minWeight`–`maxWeight`), and `ABW`.<br>**If **`newCurrentBmi < 18.5` and `goal == 'lose'`: Clear `goal`, `target_weight`, and `goal_pace` (weight loss is hidden/blocked when `currentBmi < 18.5`).<br>**Invalidate **`target_weight` & `goal_pace` ONLY IF:<br>• `goal == 'lose'` and `target_weight >= newCurrentWeight`, OR<br>• `goal == 'gain'` and `target_weight <= newCurrentWeight`, OR<br>• `goal == 'muscle_gain'` and `target_weight < newCurrentWeight`.<br>Otherwise keep `target_weight` and recalculate `goal_pace` timeline (`estimated_weeks_min..max`) automatically. |
| `goal` | **If changed to **`'maintain'`: Clear `target_weight` and `goal_pace` (`target_weight = current_weight`).<br>**If changed between **`'lose'`, `'gain'`, `'muscle_gain'`: Check if existing `target_weight` violates directional rule (`lose < current`, `gain > current`, `muscle_gain >= current`). If violated (or previously `'maintain'`), clear `target_weight` and `goal_pace` and prompt `target_weight`. |
| `target_weight` | Keep `goal_pace` selection if already chosen (`slow`/`moderate`/`fast`), and automatically recalculate `estimated_weeks_min..max` for the new weight difference. If `abs(current_weight - newTargetWeight) < 0.5`, skip `goal_pace`. |
| `service_track` | **If switched to **`'nutrition_only'`: Bypass Workout Block steps (keep any previously entered workout answers cached in draft in case user switches back, or exclude from active payload; when `goal == 'muscle_gain'`, support optional `externalTrainingDays` or default cleanly with an informational coaching note). Prompt any unanswered Nutrition Block steps.<br>**If switched to **`'workouts_only'`: Bypass Nutrition Block steps and prompt any unanswered Workout Block steps.<br>**If switched to **`'nutrition_and_workouts'`: Prompt any unanswered steps in either Workout or Nutrition blocks in sequence. |
| `workout_location` | **If changed to **`'home_only'`: Clear `workout_day_split` and `workout_split` (auto-handled for home). Prompt `home_equipment` if unanswered.<br>**If changed to **`'gym_only'`: Clear `workout_day_split` and `home_equipment`. Prompt `workout_split` if `workout_days.length >= 3` and unanswered.<br>**If changed to **`'home_and_gym'`: Prompt `workout_day_split` (mapped to `workout_days`), `home_equipment`, and `workout_split` (if `workout_days.length >= 3`). |
| `workout_days` | **If **`workout_location == 'home_and_gym'`: Preserve day-location assignments for days that remain selected; require assignment for newly added days in `workout_day_split`.<br>**If **`workout_split` was already selected: Check if the selected `workout_split` is still valid for the new `workout_days.length` (`full_body`: 1–4d, `upper_lower`: 2–6d, `ppl`: 3–7d, `bro_split`: 4–6d). If `workout_days.length < 3`, clear `workout_split`. If invalid for the new count, clear `workout_split` and re-prompt. |
| `conditions` | Check if current `diet_type` is medically blocked by the newly added condition(s) (e.g., `'diabetes_t1'`, `'diabetes_t2'`, `'gout'`, `'kidney'`, or `'cholesterol'` blocking `'keto'`; `'diabetes_t1'` or `'diabetes_t2'` blocking `'intermittent_fasting'`; `'kidney'` blocking `'high_protein'`). If blocked, clear `diet_type` (and `if_start_hour` / `meals_count`) and re-prompt `diet_type`. |
| `diet_type` | **If changed to **`'intermittent_fasting'`: Clear `meals_count` and prompt `if_start_hour`.<br>**If changed to **`'balanced'`: Clear `if_start_hour` and prompt `meals_count`.<br>**If changed to any other diet:** Clear both `if_start_hour` and `meals_count`. |

**3. Local State Persistence (**`saveDraft()`):

- Save the full `onboardingDraft` object to local SQLDelight / DataStore immediately after every step confirmation and after every edit:
```json
{
  "version": 2,
  "region": "egypt",
  "unitSystem": "metric",
  "lastActiveStepId": "workout_location",
  "updatedAt": "2026-10-21T12:00:00Z",
  "answers": { ... }
}
```

---

**MAIN FLOW**

1. User answers questions sequentially in the chat.
2. At each step, the progress bar updates (`Step X of Y`) and `onboardingDraft` is persisted locally.
3. At step 12 (`diet_type`), user realizes they entered `current_weight = 95 kg` instead of `85 kg` back at step 7.
4. User scrolls up in the chat and taps the `95 kg ✏️` answer bubble.
5. An Edit Bottom Sheet opens for `current_weight`. User enters `85` and taps `Confirm`.
6. System updates `current_weight` to `85`, recalculates BMI and ideal weight range, verifies that `target_weight = 75 kg` is still `< 85 kg` (valid for `lose`), updates the timeline automatically, updates the bubble text to `85 kg ✓`, and scrolls right back to `diet_type` without losing any intermediate workout answers.

---

**EDGE CASES**

- **Editing a Step That Unlocks Multiple New Steps:** E.g., User originally chose `service_track = "nutrition_only"`, reached the `summary` screen, and tapped `[Edit]` on `service_track` to change it to `"nutrition_and_workouts"`. The engine detects that the Workout Block steps (`fitness_level` through `injuries`) are now active and unanswered, transitions from `summary` to `fitness_level`, and once `injuries` is answered, returns directly to `summary` (since the Nutrition Block was already answered).
- **Rapid Double-Tap Prevention:** Disable option cards during the `300ms` transition after a selection to prevent duplicate answer submissions.
- **Cancel Edit:** If the user opens the edit sheet for a previous question and taps `Cancel` (or swipes down to dismiss), no state or downstream answers are modified.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Editing an independent answer preserves all other answers**
  - **Given** the user has reached the `summary` screen
  - **When** the user taps their `name` or `budget` bubble and changes the value
  - **Then** only that answer is updated, all other answers remain intact, and the user stays on the updated `summary` screen.
- **Scenario 2: Editing an upstream branching answer clears only conflicting downstream answers**
  - **Given** a user selected `goal = "lose"`, `target_weight = 75` (with `current_weight = 85`), and completed workout setup
  - **When** the user edits `goal` to `"gain"`
  - **Then** `target_weight` and `goal_pace` are cleared and re-asked because `75 < 85` is invalid for weight gain, while all Workout and Nutrition answers are preserved.
- **Scenario 3: Switching workout location from Gym to Home**
  - **Given** a user selected `workout_location = "gym_only"`, `workout_days = [Sat, Mon, Wed, Thu]`, and `workout_split = "upper_lower"`
  - **When** the user edits `workout_location` to `"home_only"`
  - **Then** `workout_split` is cleared/skipped automatically, `workout_days` is preserved, and the coach asks `home_equipment` before returning to the user's progress point.

---

**ANALYTICS**

- `onboarding_step_viewed` (`step_id`, `step_index`, `total_active_steps`)
- `onboarding_step_answered` (`step_id`, `answer_value`, `duration_ms`)
- `onboarding_answer_edited` (`step_id`, `old_value`, `new_value`, `invalidated_steps`: `string[]`)
- `onboarding_region_switched` (`from_region`, `to_region`, `at_step_id`)

---

## US-MOB-03: Name, Age & Age Safety Gate (Under-18 Block & 70+ Senior Mode)

> **Jira Key:** [`KAN-37`](https://abdulrahman-alaa.atlassian.net/browse/KAN-37) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a user starting the onboarding questions, I want to enter my name and age quickly with support for both standard Western and Eastern Arabic digits, while the app enforces medical safety rules for minors (Under-18 blocking gate) and older adults (70+ Senior Mode).

---

**PRECONDITIONS**

- User has completed or bypassed `account_check` (`US-MOB-01`) and is on the Onboarding Chat Screen.

---

**SCREEN AND UI DETAILS**

**1. Step: **`name` (User's Preferred Name)

- **Coach Bubble:**
  - *"Welcome aboard! What name should I put on your personal coaching plan?"*
  - **Micro-Why Caption:** *"Personalizes your daily coach brief, check-ins, and weekly recaps."*
- **Input Control (**`text`):
  - Text field placeholder: `"Type your name here..."`
  - Primary button: `[Confirm]`
  - If authenticated via Apple/Google and a profile display name exists, render a 1-tap suggestion chip above the input: `[Use "{socialName}"]`.

**2. Step: **`age` (User's Age in Years)

- **Coach Bubble:**
  - *"Great to meet you, {name}! How old are you?"*
  - **Micro-Why Caption:** *"Age fine-tunes your resting metabolic rate (BMR) and safe training intensity."*
  - *(After valid adult input, optional 1-line transition before `gender`: *"Metabolic baseline ready — let's dial in your body profile."*) *
- **Input Control (**`number-with-chips`):
  - Quick-select chips: `[18]`, `[22]`, `[25]`, `[30]`, `[35]`, `[40]`, `[50]`.
  - Numeric input field (Compose `KeyboardType.Number` / SwiftUI `.numberPad`, placeholder `"e.g. 28"`) + `[Confirm]` button.

**3. Conditional Blocking Step: **`underage_gate` (Triggered when `10 <= age < 18`)

- **Coach Safety Card (Warning / Blocking State):**
  - **Title:** *"Important Age Safety Notice"*
  - **Message:** *"Hi {name}, because you are under 18, your body is still growing and should not follow adult calorie-restriction equations or unsupervised diet programs without a qualified pediatric nutritionist or parental/medical supervision."*
- **Sticky Bottom Actions:**
  - Primary Action: `[Edit Age (if entered by mistake)]` -> Re-opens the `age` input sheet.
  - Secondary Action: `[Close / Exit Onboarding]`

---

**RULES, VALIDATION & LOGIC**

1. **Numeral Normalization Helper (**`normalizeDigits(str)`):
  - All numeric inputs across the entire onboarding flow MUST convert Eastern Arabic numerals (`0x0660–0x0669`) and Persian numerals (`0x06F0–0x06F9`) to standard Western digits (`0-9`) before parsing.
2. **Name Validation (**`validateName(raw)`):
  - Trim leading/trailing whitespace and collapse multiple internal spaces into a single space.
  - Minimum length: `2` characters; Maximum length: `50` characters.
  - Allowed characters: alphabetic letters (Latin or Arabic script), spaces, and hyphens.
  - Reject digits-only, symbols-only, or emoji-only strings with friendly inline coach feedback: *"Please enter a valid name using letters (at least 2 characters)."*
3. **Age Validation & Safety Thresholds (**`validateAge(raw)`):
  - Parse integer after `normalizeDigits(raw)`.
  - **Hard Bounds (**`< 10` or `> 95` or `NaN`): Reject input and show inline error: *"Please enter a valid age between 10 and 95 years."*
  - **Under-18 Gate (**`10 <= age < 18`):
    - Store the entered number in `state.age`, render the user bubble, and transition immediately to `underage_gate`.
    - Do **not** allow advancing to `gender` or generating any calorie/workout plan while `age < 18`.
  - **Adult Standard (**`18 <= age <= 69`):
    - Set `state.seniorMode = false` and advance to `gender`.
  - **Senior Mode (**`70 <= age <= 95`):
    - Set `state.seniorMode = true`.
    - Display a reassuring coach note bubble: *"We have enabled Senior Safety Mode for your plan (joint-friendly exercise selection and optimal protein floor to preserve lean muscle mass)."*
    - **Downstream Effects of **`seniorMode = true`:
      - Minimum daily protein floor is raised to `>= 1.2 g / kg` of reference weight (to prevent age-related sarcopenia), even on maintenance or weight loss.
      - Maximum calorie deficit is capped at `-400 kcal/day` (`fast` pace is hidden in `goal_pace`).
      - Workout generator automatically excludes high-impact plyometrics, heavy axial spinal loading (barbell back squats, conventional deadlifts), and heavy overhead maximal presses.

---

**MAIN FLOW**

1. Coach asks for `name`.
2. User types `"Ahmed"` and taps `Confirm`.
3. Coach greets `"Ahmed"` by name and asks `age`.
4. User taps the `[25]` chip (or types `25` and taps `Confirm`).
5. System validates `25`, sets `seniorMode = false`, persists state, and advances to `gender` (`US-MOB-04`).

---

**EDGE CASES**

- **User accidentally types **`17` instead of `27`: User hits the `underage_gate`, taps `[Edit Age]`, updates age to `27`, and the app clears the gate and advances seamlessly to `gender`.
- **User enters decimal age (e.g., **`25.5`): Round down (`Math.floor(25.5) -> 25`) or restrict keyboard to integer digits only.
- **User enters **`72`: `seniorMode = true` is set; if user later edits `age` to `65`, `seniorMode` automatically resets to `false`.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Valid name and age submission**
  - **Given** the user enters `"Sara"` for `name` and `"28"` for `age`
  - **When** the user submits both steps
  - **Then** `state.name` is `"Sara"`, `state.age` is integer `28`, and the chat advances to `gender`.
- **Scenario 2: Under-18 safety block and recovery**
  - **Given** the user is on the `age` step
  - **When** the user enters `16`
  - **Then** the chat routes to `underage_gate` and blocks progression to `gender`
  - **And when** the user taps `[Edit Age]` and changes `age` to `19`
  - **Then** the block is lifted and the chat advances to `gender`.
- **Scenario 3: 70+ Senior Mode activation**
  - **Given** the user enters `72` for `age`
  - **When** the step is confirmed
  - **Then** `state.seniorMode` is set to `true`, the senior safety coach message is displayed, and downstream protein floor (`>= 1.2 g/kg`) and low-impact exercise filters are enforced.

---

**ANALYTICS**

- `onboarding_name_submitted` (`used_social_suggestion`: `boolean`)
- `onboarding_age_submitted` (`age_bucket`: `"under_18"` | `"18_29"` | `"30_49"` | `"50_69"` | `"70_plus"`, `senior_mode`: `boolean`)
- `onboarding_underage_blocked` (`entered_age`: `number`)

---

## US-MOB-04: Biological Sex, Maternal Status (Pregnancy Trimesters & Breastfeeding) & Body Measurements (Height & Weight)

> **Jira Key:** [`KAN-38`](https://abdulrahman-alaa.atlassian.net/browse/KAN-38) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a user completing my physical profile, I want to specify my biological sex, maternal status (if applicable), height, and current weight so that the app calculates my exact BMI, Ideal Weight Range, Adjusted Body Weight (ABW), and maternal calorie/protein/hydration adjustments accurately.

---

**PRECONDITIONS**

- User has completed `age` (`>= 18`) in `US-MOB-03`.

---

**SCREEN AND UI DETAILS**

**1. Step: **`gender` (Biological Sex)

- **Coach Bubble:** *"What is your biological sex?"*
  - **Micro-Why Caption:** *"Used strictly for accurate metabolic rate (Mifflin-St Jeor) and nutrient baselines."*
- **Input Control (**`single-select` — 2 Cards):
  - `male`: `Male` — Subtitle: `"Standard male BMR equation & calorie floor (1,500 kcal)"`
  - `female`: `Female` — Subtitle: `"Female BMR equation, calorie floor & maternal/cycle options"`

**2. Conditional Step: **`maternal_status` (Shown ONLY if `gender == 'female'` AND `18 <= age <= 50`)

- **Coach Bubble:** *"Are you currently pregnant or breastfeeding?"*
  - **Micro-Why Caption:** *"Safely calibrates pregnancy/lactation calories, protein, hydration & exercise filters."*
- **Input Control (**`single-select` — 5 Cards):
  - `none`: `None` — Subtitle: `"Standard adult nutrition and training targets"`
  - `pregnant_t1`: `Pregnant — 1st Trimester (Months 1–3)` — Subtitle: `"Maintenance focus; blocks calorie deficits"`
  - `pregnant_t2`: `Pregnant — 2nd Trimester (Months 4–6)` — Subtitle: `"Adds +340 kcal/day & +15g protein"`
  - `pregnant_t3`: `Pregnant — 3rd Trimester (Months 7–9)` — Subtitle: `"Adds +450 kcal/day & +25g protein"`
  - `breastfeeding`: `Breastfeeding` — Subtitle: `"Adds +400 kcal, +20g protein & +600 ml water"`

**3. Step: **`height` (Height in cm — or ft/in when `unitSystem == "imperial"`)

- **Coach Bubble:** *"What is your height in centimeters (cm)?"* (includes a compact `[Metric (cm/kg) | Imperial (ft/lb)]` unit toggle persisting `unitSystem: "metric" | "imperial"`, converting imperial inputs deterministically to canonical metric `cm`/`kg` on wire!).
  - **Micro-Why Caption:** *"Combines with weight to calculate your healthy BMI range and ideal weight window."*
- **Input Control (**`number-with-chips`):
  - Quick-select chips: `[155]`, `[160]`, `[165]`, `[170]`, `[175]`, `[180]`, `[185]`.
  - Numeric input (`120` to `230` cm) + `[Confirm]`.

**4. Step: **`current_weight` (Current Body Weight in kg — or lb when `unitSystem == "imperial"`)

- **Coach Bubble:** *"And what is your current weight in kilograms (kg)?"*
  - **Micro-Why Caption:** *"Sets exact protein targets, daily hydration liters, and starting energy."*
- **Input Control (**`number-with-chips`):
  - Quick-select chips: `[55]`, `[65]`, `[75]`, `[85]`, `[95]`, `[105]`, `[120]`.
  - Numeric input (`35` to `250` kg, supports 1 decimal place e.g. `82.5`) + `[Confirm]`.
- **Instant Coach Micro-Reaction (Rendered right after confirming weight):**
  - *"Logged, {name}! At {height} cm, your healthy BMI weight zone is {minHealthyWeight}–{maxHealthyWeight} kg — let's pick your goal."*

---

**CALCULATIONS, RULES & MEDICAL LOGIC**

1. **Maternal Routing & Clinical Overrides (**`maternal_status`):
  - If `gender == 'male'` OR `age > 50`: Automatically set `maternal_status = 'none'` and skip the step (backend strictly rejects non-`'none'` `maternalStatus` for males or `age > 50` with `400 INVALID_MATERNAL_PROFILE`).
  - **Pregnancy (**`pregnant_t1`, `pregnant_t2`, `pregnant_t3`):
    - **Calorie & Protein Calibration (Does NOT stack on `gain` / `muscle_gain` surplus):**
      - `pregnant_t1`: `+0 kcal/day` above maintenance (`TDEE`), `+0g protein/day`, `+300 ml water/day`.
      - `pregnant_t2`: `+340 kcal/day` above maintenance (`TDEE`), `+15g protein/day`, `+300 ml water/day`.
      - `pregnant_t3`: `+450 kcal/day` above maintenance (`TDEE`), `+25g protein/day`, `+300 ml water/day`.
    - **Hard Safety Blocks during Pregnancy:**
      - Weight loss (`goal = 'lose'`) is **hidden/blocked** in the next step (`US-MOB-05`, `422 MATERNAL_CALORIE_CUT_BLOCKED`).
      - `keto` and `intermittent_fasting` diets are **hidden/blocked** (`US-MOB-08`, `400 MEDICAL_DIET_CONFLICT`).
      - `pregnant_t1` excludes high-impact, plyometric, crunch, and deadlift movements (`PREGNANCY_ALL_TRIMESTERS_UNSAFE_RE`); `pregnant_t2` and `pregnant_t3` additionally exclude supine / flat-bench abdominal-compression movements (`PREGNANCY_POST_T1_SUPINE_RE`) (`US-MOB-07`).
  - **Breastfeeding (**`breastfeeding`):
    - **Add-ons:** `+400 kcal/day`, `+20g protein/day` (with min `1.4 g/kg` effective weight, unless capped by `kidney` at `<= 1.1 g/kg`), `+600 ml (+0.6L) water/day`.
    - **Safety Caps:** If user selects weight loss (`goal = 'lose'`), daily calorie deficit is capped at `-300 kcal/day` **before** adding `+400 kcal/day` (`slow` pace only, to protect milk supply), and both `keto` and `intermittent_fasting` diets are blocked.
2. **Height, Weight & Unit System Validation:**
  - `unitSystem`: `"metric"` (default) or `"imperial"` (`400 INVALID_UNIT_SYSTEM` if invalid); all heights and weights are stored and transmitted canonically in `cm` and `kg`.
  - `height`: Integer or decimal between `120` and `230` cm. If user enters meters by mistake (e.g., `1.75` where `1.20 <= val <= 2.30`), auto-convert to cm (`Math.round(val * 100) -> 175`) and confirm in the bubble (`175 cm`).
  - `current_weight`: Number between `35` and `250` kg (round to 1 decimal place: `Math.round(val * 10) / 10`).
3. **Core Anthropometric Equations (Executed immediately after **`current_weight`):
  - **Height in meters (**`heightM`):
$$heightM = \frac{heightCm}{100}$$
  - **Current BMI (**`currentBmi`):
$$currentBmi = \text{round1}\left(\frac{currentWeight}{heightM^2}\right)$$
  - **Healthy Ideal Weight Range (**`BMI 18.5` to `24.9`):
$$minHealthyWeight = \text{round}\left(18.5 \times heightM^2\right)$$
$$maxHealthyWeight = \text{round}\left(24.9 \times heightM^2\right)$$
$$idealMidWeight = \text{round}\left(21.7 \times heightM^2\right)$$
  - **Ideal Body Weight (**`IBW` at `BMI 24`) & Adjusted Body Weight (`ABW` for Obesity `BMI > 30`):
    - Used later for accurate protein calculation so protein is not overestimated in high-adiposity users (matching the unified backend calculation engine):
$$IBW = 24 \times heightM^2$$
$$effectiveWeight = \begin{cases} IBW + 0.35 \times (currentWeight - IBW) & \text{if } currentBmi > 30 \\ currentWeight & \text{if } currentBmi \le 30 \end{cases}$$

---

**MAIN FLOW**

1. User selects `gender` (`male` or `female`).
2. If `female` and `age <= 50`, coach asks `maternal_status`; user selects an option (e.g., `none`). If `male`, step is skipped automatically.
3. Coach asks `height`; user selects or enters `175` cm.
4. Coach asks `current_weight`; user enters `85` kg.
5. System computes `currentBmi = 27.8`, `minHealthyWeight = 57 kg`, `maxHealthyWeight = 76 kg`, `idealMidWeight = 66 kg`, persists to draft, and advances to `goal` (`US-MOB-05`).

---

**EDGE CASES**

- **User enters height in meters (**`1.72`): Auto-detect values in `[1.20, 2.30]`, convert to `172 cm`, and save `172`.
- **Female aged 54:** `maternal_status` is automatically skipped and defaulted to `'none'`.
- **User edits **`gender` from `female` (with `pregnant_t2` selected) to `male`: `maternal_status` is reset to `'none'`, pregnancy calorie/protein add-ons are removed, and weight-loss/Keto/IF options are unlocked.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Male skips maternal status**
  - **Given** `age = 30`
  - **When** the user selects `gender = "male"`
  - **Then** `maternal_status` is skipped and the next question is immediately `height`.
- **Scenario 2: Female under 50 sees maternal status and pregnancy rules apply**
  - **Given** `gender = "female"` and `age = 29`
  - **When** the user selects `pregnant_t2`
  - **Then** `+340 kcal` and `+15g protein` maternal modifiers are stored and weight-loss goal is blocked in `US-MOB-05`.
- **Scenario 3: Accurate BMI, Ideal Range, and ABW calculation**
  - **Given** `height = 170 cm` and `current_weight = 100 kg`
  - **When** `current_weight` is confirmed
  - **Then** `currentBmi` is `34.6`, `minHealthyWeight` is `53 kg`, `maxHealthyWeight` is `72 kg`, `idealMidWeight` is `63 kg`, and `effectiveWeight` uses the unified `ABW` formula (`IBW = 24 * 1.7^2 = 69.36 kg`, `69.36 + 0.35 * (100 - 69.36) = 80.1 kg`).

---

**ANALYTICS**

- `onboarding_gender_selected` (`gender`: `"male"` | `"female"`)
- `onboarding_maternal_status_selected` (`status`: `"none"` | `"pregnant_t1"` | `"pregnant_t2"` | `"pregnant_t3"` | `"breastfeeding"`)
- `onboarding_measurements_submitted` (`height_cm`, `weight_kg`, `bmi`, `bmi_category`)

---

## US-MOB-05: Fitness Goal, Target Weight with Live BMI Range Warning & Weekly Goal Pace Calculator

> **Jira Key:** [`KAN-39`](https://abdulrahman-alaa.atlassian.net/browse/KAN-39) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a user setting my body transformation goal, I want the coach to recommend the healthiest goal based on my BMI, show me my personalized healthy weight range when asking for my target weight, warn me if I enter a target weight outside the healthy BMI limits (18.5–24.9) while allowing me to either adopt the nearest healthy weight or proceed with my choice, and let me choose my weekly pace with a clear timeline range in weeks and months.

---

**PRECONDITIONS**

- User has completed `height` and `current_weight` (`US-MOB-04`).
- `currentBmi`, `minHealthyWeight`, `maxHealthyWeight`, and `idealMidWeight` are computed.

---

**SCREEN AND UI DETAILS**

**1. Step: **`goal` (Primary Fitness Goal)

- **Coach Bubble:**
  - Displays personalized BMI insight + question:
  - *"Your current BMI is ****{currentBmi}**** (healthy zone for {height} cm: ****{minHealthyWeight}–{maxHealthyWeight} kg****). What is your primary goal right now?"*
  - **Micro-Why Caption:** *"Sets your safe calorie direction and protein ratio without guesswork."*
- **Input Control (**`single-select` — Dynamic Options with `Recommended` Badge & 1-Line Subtitles):
  - `lose`: `Lose Fat & Weight` — Subtitle: `"Steady calorie deficit to drop fat while protecting lean muscle"` *(Hidden/blocked if *`maternal_status` is `pregnant_t1`, `pregnant_t2`, or `pregnant_t3`, **OR if `currentBmi < 18.5`**; marked `⭐ Recommended` if `currentBmi >= 25`)
  - `muscle_gain`: `Build Muscle & Tone` — Subtitle: `"Lean surplus (or recomp at current weight) for strength & shape"` *(Marked *`⭐ Recommended` if `18.5 <= currentBmi < 25` and not pregnant)
  - `gain`: `Gain Weight (Healthy Mass)` — Subtitle: `"Structured calorie surplus for steady, healthy mass gain"` *(Marked *`⭐ Recommended` if `currentBmi < 18.5`)
  - `maintain`: `Maintain Weight & General Health` — Subtitle: `"Balanced maintenance calories focused on energy, habits & fitness"` *(Marked *`⭐ Recommended` if pregnant)

**2. Conditional Step: **`target_weight` (Shown ONLY if `goal != 'maintain'`)

- **Coach Bubble (Explicitly shows the user's Ideal Weight Range):**
  - *"Great goal! What target weight (in kg) would you like to aim for?"*
  - **Micro-Why Caption:** *"Calculates your realistic weekly milestone window cleanly."*
  - **Highlighted Info Banner inside Bubble:**
*"Healthy Ideal Weight Range for your height ({height} cm): ****{minHealthyWeight} kg – {maxHealthyWeight} kg**** (Ideal midpoint: ~****{idealMidWeight} kg****)."*
- **Input Control (**`number-with-chips`):
  - Dynamically generated smart chips (`getTargetWeightChips(state)`):
    - For `lose`: up to 4 chips below `current_weight` (e.g., `idealMidWeight`, `maxHealthyWeight`, `currentWeight - 5`, `currentWeight - 10`, filtered to `< currentWeight` and `>= 35`).
    - For `gain` / `muscle_gain`: up to 4 chips `>= current_weight` (e.g., `minHealthyWeight`, `idealMidWeight`, `currentWeight + 5`, `currentWeight + 8`).
  - Numeric input (`35` to `250` kg, matching `current_weight`) + `[Confirm]`.

**3. Live BMI Boundary Warning Modal / In-Chat Confirmation (**`bmi_target_warning`)

- Triggered when `target_weight` passes directional validation (`lose < current`, `gain > current`, `muscle_gain >= current`), **BUT** `targetBmi < 18.5` OR `targetBmi > 24.9`:
  - **Case A — Underweight Target (**`targetBmi < 18.5`, i.e., `target_weight < minHealthyWeight`):
    - **Warning Message:** *"Health Warning: A target weight of {target_weight} kg puts your BMI at ****{targetBmi}****, which is below the safe minimum healthy limit (****18.5****, or ****{minHealthyWeight} kg**** for your height) and may cause fatigue, muscle loss, and nutrient deficiencies. Would you like to set your target to the nearest healthy weight (****{minHealthyWeight} kg****) or continue with your chosen weight?"*
    - **Button 1 (Primary Recommended):** `[Adopt Safe Healthy Weight ({minHealthyWeight} kg)]` -> Sets `target_weight = minHealthyWeight`, `bmiWarningOverride = false`, and advances to `goal_pace`.
    - **Button 2 (Secondary Override):** `[Continue with {target_weight} kg anyway]` -> Keeps `target_weight`, sets `bmiWarningOverride = true`, and advances to `goal_pace`.
  - **Case B — Above Standard BMI Target (**`targetBmi > 24.9`, i.e., `target_weight > maxHealthyWeight`):
    - **Warning Message:** *"Health Note: A target weight of {target_weight} kg corresponds to a BMI of ****{targetBmi}****, which is above the standard BMI range (****24.9****, or ****{maxHealthyWeight} kg**** for your height). (If this is an initial milestone goal or high muscle-mass target, that is completely fine!). Would you like to adjust your target to ****{maxHealthyWeight} kg**** or continue with ****{target_weight} kg****?"*
    - **Button 1 (Primary):** `[Adjust Target to {maxHealthyWeight} kg]` -> Sets `target_weight = maxHealthyWeight`, `bmiWarningOverride = false`, and advances.
    - **Button 2 (Secondary Override):** `[Continue with {target_weight} kg as current target]` -> Keeps `target_weight`, sets `bmiWarningOverride = true`, and advances.

**4. Conditional Step: **`goal_pace` (Shown ONLY if `goal != 'maintain'` AND `abs(current_weight - target_weight) >= 0.5`)

- **Coach Bubble:**
  - *"At what weekly pace would you like to reach ****{target_weight} kg**** ({weightDiff} kg to go)?"*
  - **Micro-Why Caption:** *"Controls daily hunger vs. speed within safe clinical calorie floors."*
- **Input Control (**`single-select` — Dynamic Cards with Calculated Timeline Range):
  - **Option 1: **`slow` (`Steady & Easy`)
    - Subtitle: `"Easiest adherence, minimal hunger — Est. {slowWeeksMin}–{slowWeeksMax} weeks"`
  - **Option 2: **`moderate` (`Balanced & Sustainable ⭐ (Recommended)`) *(Hidden if *`maternal_status == 'breastfeeding'` and `goal == 'lose'`, where only `slow` capped at `-300 kcal` is allowed)
    - Subtitle: `"Best speed-to-muscle balance — Est. {modWeeksMin}–{modWeeksMax} weeks"`
  - **Option 3: **`fast` (`Fast & Intensive`) *(Hidden when *`seniorMode == true` or `maternal_status != 'none'`)
    - Subtitle: `"Faster results, higher focus — Est. {fastWeeksMin}–{fastWeeksMax} weeks"`
- **Instant Coach Micro-Reaction:**
  - *"Locked in! At a {pace} pace, reaching {target_weight} kg fits cleanly in {estimated_weeks_min}–{estimated_weeks_max} weeks."*

---

**CALCULATIONS & VALIDATION LOGIC**

1. **Directional & Clinical Validation on **`goal` & `target_weight`:
  - If `currentBmi < 18.5` or `maternal_status` is `pregnant_t1`/`t2`/`t3`: `goal = 'lose'` is hidden in UI and rejected by backend eligibility/validation.
  - `target_weight` valid numeric range: `35` to `250` kg (matching `current_weight`).
  - If `goal == 'lose'` and `target_weight >= current_weight`:
    - Block & show inline coach error: *"Since your goal is fat loss, your target weight must be lower than your current weight ({current_weight} kg)."*
  - If `goal == 'gain'` and `target_weight <= current_weight`:
    - Block & show inline coach error: *"Since your goal is weight gain, your target weight must be higher than your current weight ({current_weight} kg)."*
  - If `goal == 'muscle_gain'` and `target_weight < current_weight`:
    - Block & show inline coach error: *"For muscle gain, your target weight must be equal to or greater than your current weight ({current_weight} kg). If you want to lose weight first, you can edit your goal to Lose Fat."*
2. **Percentage-of-TDEE Capped Calorie Delta & Timeline Range Equations (**`computeTimeline(currentWeight, targetWeight, tdee, goal, pace)`):
  - `weightDiff = Math.abs(currentWeight - targetWeight)`
  - **Daily Calorie Adjustment (`dailyCalorieDelta`, unified percentage-of-TDEE capped formulas):**
    - **When **`goal == 'lose'`:
      - `slow`: $-\min(TDEE \times 0.10, 500)$ *(breastfeeding hard-capped at `<= 300 kcal` deficit)*
      - `moderate`: $-\min(TDEE \times 0.15, 500)$
      - `fast`: $-\min(TDEE \times 0.20, 500)$
    - **When **`goal == 'muscle_gain'`:
      - Recomposition (`target_weight == current_weight` or `weightDiff < 0.5`): `dailyCalorieDelta = 0 kcal`
      - `slow`: $+\min(TDEE \times 0.05, 250)$
      - `moderate`: $+\min(TDEE \times 0.08, 250)$
      - `fast`: $+\min(TDEE \times 0.10, 250)$
    - **When **`goal == 'gain'`:
      - `slow`: $+\min(TDEE \times 0.08, 400)$
      - `moderate`: $+\min(TDEE \times 0.12, 400)$
      - `fast`: $+\min(TDEE \times 0.15, 400)$
    - **When **`goal == 'maintain'` OR `weightDiff < 0.5`:
      - `dailyCalorieDelta = 0 kcal`
  - **Expected Duration Range (`estimated_weeks_min..estimated_weeks_max`, using `7700 kcal/kg`, matching `planner-core.mjs`):**
    - Compute effective daily delta after calorie floor/ceiling clamping: `effectiveDeltaAbs = Math.abs(targetCalories - TDEE)`.
    - Weekly weight change rate:
$$weeklyKg = \text{round2}\left(\frac{effectiveDeltaAbs \times 7}{7700}\right)$$
$$centerWeeks = \max\left(1,\ \text{ceil}\left(\frac{weightDiff}{\max(0.1,\ weeklyKg)}\right)\right)$$
$$estimated\_weeks\_min = \max(1,\ \text{floor}(centerWeeks \times 0.85)), \quad estimated\_weeks\_max = \text{ceil}(centerWeeks \times 1.25)$$
    - *(For quick inline pace preview cards before `activity` is selected, estimate `TDEE` with `1.375x` light activity and finalize exact numbers on the Summary Screen via `POST /v1/plans/preview`.)*

---

**MAIN FLOW**

1. Coach displays current BMI and healthy weight range (`57–76 kg`) and asks `goal`.
2. User selects `lose` (`Lose Fat & Weight`).
3. Coach asks `target_weight`, prominently displaying `"Healthy Ideal Weight Range for your height: 57 - 76 kg"`.
4. User enters `52` kg (`targetBmi = 17.0 < 18.5`).
5. System displays the **Live BMI Boundary Warning** explaining that `52 kg` is below the safe minimum of `57 kg` (`BMI 18.5`), offering `[Adopt Safe Healthy Weight (57 kg)]` or `[Continue with 52 kg anyway]`.
6. User taps `[Adopt Safe Healthy Weight (57 kg)]` (or chooses to proceed with `52 kg`).
7. Coach asks `goal_pace` showing realistic timeline ranges (`estimated_weeks_min..max`) for each pace option.
8. User selects `moderate` (`Balanced & Sustainable ⭐`) and advances to `service_track` (`US-MOB-06`).

---

**EDGE CASES**

- **Goal is **`maintain`: Both `target_weight` and `goal_pace` are skipped automatically; `target_weight` is set equal to `current_weight`.
- **Goal is **`muscle_gain` and user enters `target_weight == current_weight` (Body Recomposition): Allowed! Since `weightDiff == 0 < 0.5`, `goal_pace` is skipped automatically and a `0 kcal` maintenance recomposition target is applied (with high protein + resistance training).
- **Current BMI is `< 18.5`:** `lose` is hidden/blocked in `goal` selection so underweight users cannot select fat loss; `gain` is highlighted as `⭐ Recommended`.
- **User starts above BMI 35 (**`current_weight = 125 kg`, `maxHealthyWeight = 76 kg`) and sets a staging target of `100 kg` (`targetBmi = 32.7`): The warning banner uses encouraging milestone language so the user feels supported when choosing `[Continue with 100 kg as current target]`.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Healthy weight range is visible inside the Target Weight question**
  - **Given** `height = 175 cm` (`minHealthyWeight = 57`, `maxHealthyWeight = 76`, `idealMidWeight = 66`)
  - **When** the `target_weight` question is rendered
  - **Then** the coach bubble explicitly displays the `57 kg` to `76 kg` ideal range and `66 kg` midpoint.
- **Scenario 2: Target weight exceeding BMI boundary triggers warning with both options**
  - **Given** `height = 175 cm`, `current_weight = 85 kg`, and `goal = "lose"`
  - **When** the user enters `target_weight = 50 kg` (`BMI = 16.3 < 18.5`)
  - **Then** the app shows the BMI safety warning before advancing, allowing the user either to adopt `57 kg` in 1 tap or confirm `50 kg`.
- **Scenario 3: Directional mismatch is blocked & underweight users cannot select `lose`**
  - **Given** `current_weight = 80 kg` and `goal = "lose"`
  - **When** the user enters `target_weight = 85 kg`
  - **Then** submission is blocked with an inline error explaining that target weight for fat loss must be less than `80 kg`.
  - **And given** `currentBmi < 18.5`
  - **When** the `goal` step renders
  - **Then** `lose` is hidden/blocked and `gain` is marked `⭐ Recommended`.

---

**ANALYTICS**

- `onboarding_goal_selected` (`goal`, `was_recommended`: `boolean`, `current_bmi`)
- `onboarding_target_weight_submitted` (`target_weight`, `target_bmi`, `triggered_bmi_warning`: `"underweight"` | `"overweight"` | `"none"`, `warning_resolution`: `"adopted_healthy"` | `"overridden"` | `"n/a"`)
- `onboarding_goal_pace_selected` (`pace`, `estimated_weeks_min`, `estimated_weeks_max`, `daily_calorie_delta`)

---

## US-MOB-06: Service Track Selection & Workout Setup (Fitness Level, Location-First Routing, Custom Weekdays & Home Equipment)

> **Jira Key:** [`KAN-40`](https://abdulrahman-alaa.atlassian.net/browse/KAN-40) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a user customizing my coaching program, I want to choose whether I want Nutrition + Workouts, Nutrition Only, or Workouts Only, and if my plan includes workouts, I want to specify my fitness level, my training location FIRST (`Gym`, `Home`, or `Mix`), the exact days of the week I want to train, per-day location assignment (if Mix), and available home equipment (if training at home).

---

**PRECONDITIONS**

- User has completed the Goal block (`US-MOB-05`).

---

**SCREEN AND UI DETAILS**

**1. Step: **`service_track` (Coaching Track Selection)

- **Coach Bubble:** *"How would you like CuraFit to coach you, {name}?"*
  - **Micro-Why Caption:** *"Skips irrelevant questions and configures your 5-tab Home dashboard."*
- **Input Control (**`single-select` — 3 Cards):
  - `nutrition_and_workouts`: `Nutrition + Workouts ⭐ (Recommended)` — Subtitle: `"Synced meals & training for fastest body transformation"`
  - `nutrition_only`: `Nutrition Plan Only` — Subtitle: `"Personalized daily meals, calories & macros (keeps Cardio & Exercise Library)"`
  - `workouts_only`: `Workout Plan Only` — Subtitle: `"Tailored training schedule without a meal plan"`

**2. Conditional Step: **`fitness_level` (Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"What is your current training experience?"*
  - **Micro-Why Caption:** *"Sets weekly working sets (2–4 sets), intensity (RIR), and Player Mode (Simple vs. Pro)."*
- **Input Control (**`single-select` — 3 Cards):
  - `beginner`: `Beginner` — Subtitle: `"New or returning — 2 sets/exercise, RIR 3, guided Simple Mode"`
  - `intermediate`: `Intermediate ⭐` — Subtitle: `"Consistent 3–12 mo — 3 sets/exercise, RIR 2, balanced load"`
  - `advanced`: `Advanced` — Subtitle: `"1+ years training — up to 4 compound sets (>=45m) & RIR 2"`

**3. Conditional Step: **`workout_location` (Asked BEFORE Days & Split; Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"Where will you work out?"*
  - **Micro-Why Caption:** *"Tailors exercises to your real equipment and skips unnecessary split prompts at home."*
- **Input Control (**`single-select` — 3 Cards):
  - `gym_only`: `Gym Only` — Subtitle: `"Full access to machines, cables, barbells & dumbbells"`
  - `home_only`: `Home Only` — Subtitle: `"Home routines built strictly around what you own"`
  - `home_and_gym`: `Mix (Home & Gym)` — Subtitle: `"Alternate gym days and home days each week"`

**4. Conditional Step: **`workout_days` (Exact Weekday Picker; Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"Which exact days fit your weekly workout routine?"*
  - **Micro-Why Caption:** *"Locks workouts onto your calendar and boosts hydration (+500 ml) on training days."*
- **Input Control (**`weekdays` Multi-Select):
  - **7 Day Toggle Pills (Ordered Saturday to Friday):**
    - `0`: `Saturday` (`Sat`)
    - `1`: `Sunday` (`Sun`)
    - `2`: `Monday` (`Mon`)
    - `3`: `Tuesday` (`Tue`)
    - `4`: `Wednesday` (`Wed`)
    - `5`: `Thursday` (`Thu`)
    - `6`: `Friday` (`Fri`)
  - **Quick Preset Helper Chips:**
    - `[3 Days (Sat, Mon, Wed)]` -> `[0, 2, 4]`
    - `[4 Days (Sat, Sun, Tue, Thu)]` -> `[0, 1, 3, 5]`
    - `[5 Days (Sat, Sun, Mon, Wed, Thu)]` -> `[0, 1, 2, 4, 5]`
  - **Live Counter & Confirm Button:** `[Confirm Selected Days ({count} days)]` (Requires `1 <= count <= 7`).
- **Instant Coach Micro-Reaction:**
  - If `count == 4` and `workout_location != 'home_only'`: *"4 gym days is the golden sweet spot for muscle growth and strong recovery."*
  - Otherwise: *"{count} training days locked into your weekly calendar."*

**5. Conditional Step: **`workout_day_split` (Shown ONLY if `workout_location == 'home_and_gym'`)

- **Coach Bubble:** *"Which days are at the Gym vs. at Home?"*
  - **Micro-Why Caption:** *"Matches each day's exercises precisely to that day's location."*
- **Input Control (**`day-location-split`):
  - Renders one row per selected day in `workout_days` (e.g., `Saturday`, `Monday`, `Wednesday`), each with a 2-segment toggle:
    - `[Gym]` vs. `[Home]`
  - Default initial assignment: alternating Gym/Home, editable per day.
  - Confirm Button: `[Confirm Day Locations]`.

**6. Conditional Step: **`home_equipment` (Shown ONLY if `workout_location == 'home_only'` OR `workout_location == 'home_and_gym'`)

- **Coach Bubble:** *"What equipment do you have at home?"*
  - **Micro-Why Caption:** *"Filters every exercise strictly to equipment you actually own — zero impossible moves."*
- **Input Control (**`multi-select` — All 10 Backend Options):
  - `none`: `Bodyweight Only (No Equipment)` — Subtitle: `"Uses bodyweight only"` *(Mutually exclusive with all other options)*
  - `dumbbells`: `Dumbbells` — Subtitle: `"Free-weight isolation & compound progress"`
  - `resistance_bands` *(alias `bands` accepted)*: `Resistance Bands` — Subtitle: `"Joint-friendly progressive tension"`
  - `pullup_bar`: `Doorway Pull-Up Bar` — Subtitle: `"Vertical pulling & lat development"`
  - `kettlebell`: `Kettlebell` — Subtitle: `"Dynamic hinges & full-body conditioning"`
  - `bench` *(alias `chair` accepted)*: `Flat / Adjustable Bench` — Subtitle: `"Pressing angles & split-squat support"`
  - `barbell`: `Home Barbell` — Subtitle: `"Heavy compound strength lifts"`
  - `yoga_mat`: `Yoga / Exercise Mat` — Subtitle: `"Floor core, mobility & mat work"`
  - `jump_rope`: `Jump Rope` — Subtitle: `"Compact high-burn conditioning"`
  - `cardio_machine`: `Home Cardio Machine` — Subtitle: `"Treadmill, bike, or indoor cardio"`

---

**RULES & LOGIC**

1. **Why **`workout_location` is Asked Before `workout_days` and `workout_split`:
  - Asking `workout_location` first ensures that if the user chooses `home_only`, the flow immediately knows to ask `home_equipment` and **skip** the gym-oriented `workout_split` question (`US-MOB-07`), keeping the conversation concise and logical.
2. **Service Track Branching:**
  - If `service_track == 'nutrition_only'`: Skip all Workout steps (`fitness_level`, `workout_location`, `workout_days`, `workout_day_split`, `home_equipment`, `workout_split`, `session_duration`, `injuries`) and jump directly to `activity` (`US-MOB-08`).
  - **Nutrition-Only + Muscle Gain (`service_track == 'nutrition_only' && goal == 'muscle_gain'`):** Supports an optional `externalTrainingDays` count/array (`0..7`, for users who train independently outside CuraFit so workout-day hydration `+500 ml` boost and coaching notes stay accurate), or defaults cleanly without blocking onboarding while attaching an informational coaching note that muscle hypertrophy relies on external resistance training.
3. **Exact Weekday Indexing:**
  - Store `workout_days` as a sorted array of day indices `0..6` where `0 = Saturday`, `1 = Sunday`, ..., `6 = Friday` (sent with `weekdayConvention: "saturday_0"` so backend `normalizeWeekdayDraft` converts cleanly to `js_sunday_0`).
  - Any day index in `0..6` NOT in `workout_days` is rendered as a scheduled Rest/Recovery day (`Rest & Recovery`) in the 7-day workout schedule.
4. **Mutual Exclusion on **`home_equipment`:
  - Tapping `none` (`Bodyweight Only`) deselects `dumbbells`, `resistance_bands`, `pullup_bar`, `kettlebell`, `bench`.
  - Tapping any equipment item automatically deselects `none`.
5. **Fitness Level Set Prescription (`server/workouts.mjs`):**
  - `beginner`: `2` sets per exercise (`RIR 3`), beginner-difficulty movements only.
  - `intermediate`: `3` sets per exercise (`RIR 2`), beginner + intermediate movements.
  - `advanced`: `4` sets on compound movements (`squat`, `hinge`, `horizontal_push`, `horizontal_pull`, `vertical_push`, `vertical_pull`, `lunge`) when `sessionDuration >= 45` (gracefully falling back to `3` sets if the session time budget would be exceeded), and `3` sets on isolation movements (`RIR 2`).

---

**MAIN FLOW**

1. User selects `service_track = "nutrition_and_workouts"`.
2. User selects `fitness_level = "intermediate"`.
3. User selects `workout_location = "home_only"`.
4. User taps `Saturday`, `Monday`, `Wednesday`, `Thursday` (`[0, 2, 4, 5]`) in `workout_days` and confirms `4 days`.
5. `workout_day_split` is skipped (since location is not `home_and_gym`).
6. Coach asks `home_equipment`; user selects `dumbbells` + `resistance_bands` and taps Confirm.
7. Chat advances to `US-MOB-07` (where `workout_split` will be automatically skipped because `workout_location == 'home_only'`).

---

**EDGE CASES**

- **User selects **`home_and_gym` and assigns ALL days to `Home` inside `workout_day_split`:
  - Show a helpful inline hint or automatically normalize behavior so `home_equipment` is still asked and home exercises are generated for all selected days.
- **User selects all 7 days (**`[0,1,2,3,4,5,6]`):
  - Allowed, and show a supportive coach tip: *"Great dedication! Remember that muscles grow during recovery, so we will include lighter active-recovery sessions to prevent overtraining."*
- **User selects `service_track = "nutrition_only"` with `goal = "muscle_gain"`:**
  - Allowed cleanly: optionally accepts `externalTrainingDays` (or defaults to `0` with an informational coaching note reminding the user to pair the high-protein nutrition plan with external resistance training).

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Nutrition-only track skips all workout questions**
  - **Given** the user is at `service_track`
  - **When** the user selects `nutrition_only`
  - **Then** all workout steps are skipped and the next question is `activity` (`US-MOB-08`) (with optional `externalTrainingDays` when `goal == 'muscle_gain'`).
- **Scenario 2: User picks exact weekdays rather than just a number**
  - **Given** the user is at `workout_days`
  - **When** the user toggles `Sunday (1)`, `Tuesday (3)`, and `Thursday (5)` and confirms
  - **Then** `state.workoutDays` is stored as `[1, 3, 5]` and the generated 7-day plan places workouts on Sunday, Tuesday, and Thursday and Rest on Saturday, Monday, Wednesday, and Friday.
- **Scenario 3: Mutual exclusion in **`home_equipment`
  - **Given** the user is at `home_equipment` and has selected `dumbbells` and `resistance_bands`
  - **When** the user taps `none` (`Bodyweight Only`)
  - **Then** `dumbbells` and `resistance_bands` are automatically deselected and only `["none"]` remains selected.

---

**ANALYTICS**

- `onboarding_service_track_selected` (`track`: `"nutrition_and_workouts"` | `"nutrition_only"` | `"workouts_only"`)
- `onboarding_workout_location_selected` (`location`: `"gym_only"` | `"home_only"` | `"home_and_gym"`)
- `onboarding_workout_days_selected` (`days_count`: `number`, `selected_day_indices`: `number[]`)
- `onboarding_home_equipment_selected` (`equipment`: `string[]`)

---

## US-MOB-07: Smart Hybrid Workout Split Selection, Session Duration & Injury-Safe Exercise Filtering

> **Jira Key:** [`KAN-41`](https://abdulrahman-alaa.atlassian.net/browse/KAN-41) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a user whose program includes workouts, I want the app to ask me for my preferred training split ONLY when it is relevant (Gym or Mix with 3+ training days, filtered by my selected day count), let me pick my preferred workout session duration, and screen for joint or postpartum injuries so that unsafe exercises are automatically substituted with safe alternatives.

---

**PRECONDITIONS**

- `service_track != 'nutrition_only'` and user has completed `workout_location`, `workout_days`, and (if applicable) `workout_day_split` / `home_equipment` (`US-MOB-06`).

---

**SCREEN AND UI DETAILS**

**1. Conditional Step: **`workout_split` (Shown ONLY if `workout_location != 'home_only'` AND `workout_days.length >= 3`)

- **Coach Bubble:**
  - *"For your ****{workout_days.length} training days/week****, how should we split your muscle groups?"*
  - **Micro-Why Caption:** *"Controls recovery between sessions and weekly stimulus per muscle."*
- **Input Control (**`single-select` — Dynamically Filtered by `daysCount = workout_days.length`, showing all **5** real backend splits at 4 days!):
  - `auto`: `Coach's Smart Choice ⭐ (Recommended)` — *Always shown (`1..7` days). Resolves deterministically to `Full Body` (`<= 3d`), `Upper / Lower` (`4d`), or `Push / Pull / Legs` (`>= 5d`).*
    - Subtitle dynamically shows the resolved split (e.g., for `4d`: `"Scientifically pairs Upper / Lower twice a week"`).
  - `upper_lower`: `Upper / Lower Split` — *Shown when *`2 <= daysCount <= 6`
    - Subtitle: `"Alternates upper & lower body — ideal 2x/wk frequency for 4d"`
  - `full_body`: `Full Body Split` — *Shown when *`1 <= daysCount <= 4`
    - Subtitle: `"Hits every major muscle group each session — great flexibility"`
  - `ppl`: `Push / Pull / Legs (PPL)` — *Shown when *`3 <= daysCount <= 7`
    - Subtitle: `"3d rotates Push/Pull/Legs · 4d adds Full Body · 5d adds Upper/Lower"`
  - `bro_split`: `Body-Part Split (Bro Split)` — *Shown when *`4 <= daysCount <= 6` *(backend auto-falls back to `full_body` only when `< 4` days)*
    - Subtitle: `"Focused muscle days (4d: Chest+Tri, Back+Bi, Shoulders+Core, Legs; 5–6d: 1 muscle/day)"`

**2. Conditional Step: **`session_duration` (Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"How long should each workout session last?"*
  - **Micro-Why Caption:** *"Keeps every workout strictly inside your clock budget including warm-up and rest."*
- **Input Control (**`single-select` — 5 Cards):
  - `20`: `20 Minutes (Express)` — Subtitle: `"Fast compound essentials when time is tight"`
  - `30`: `30 Minutes (Compact)` — Subtitle: `"Efficient strength focus with short rest periods"`
  - `45`: `45 Minutes ⭐ (Recommended)` — Subtitle: `"Ideal balance for full compound + accessory work"`
  - `60`: `60 Minutes (Full Session)` — Subtitle: `"Complete main lifts plus targeted hypertrophy isolation"`
  - `90`: `90 Minutes (Extended)` — Subtitle: `"Maximum volume and longer heavy-compound recovery"`

**3. Conditional Step: **`injuries` (Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"Any current joint pain or injuries we must protect?"*
  - **Micro-Why Caption:** *"Automatically swaps out risky lifts for joint-safe alternatives."*
- **Input Control (**`multi-select` — All 10 Options):
  - `none`: `No Injuries (100% Ready)` — Subtitle: `"Full joint-safe exercise pool enabled"` *(Mutually exclusive with all injury items)*
  - `knee`: `Knee Pain / Injury` — Subtitle: `"Protects knees from squats, lunges & jumps"`
  - `lower_back`: `Lower Back Pain / Disc Issue` — Subtitle: `"Removes heavy spinal hinges & deadlifts"`
  - `shoulder`: `Shoulder Pain / Impingement` — Subtitle: `"Avoids painful overhead & upright-row strain"`
  - `neck`: `Neck / Cervical Pain` — Subtitle: `"Excludes cervical load & shrug movements"`
  - `wrist`: `Wrist / Carpal Tunnel Pain` — Subtitle: `"Removes stressful wrist-flexion curls & dips"`
  - `ankle`: `Ankle Instability / Sprain` — Subtitle: `"Excludes jumping, hops, lunges & calf impact"`
  - `elbow`: `Elbow Pain (Tennis / Golfer's Elbow)` — Subtitle: `"Swaps skull-crushers & dips for cable/neutral grips"`
  - `hip`: `Hip Tightness / Pain` — Subtitle: `"Removes deep sumo, wide-stance & split-squats"`
  - `diastasis_recti`: `Postpartum Diastasis Recti (Abdominal Separation)` — Subtitle: `"Replaces crunches & sit-ups with deep core safety"` *(Shown ONLY when *`gender == 'female'`)

---

**RULES, SPLIT ENGINE & INJURY FILTERING LOGIC**

1. **When **`workout_split` is Automatically Skipped:
  - **Condition A (**`workout_location == 'home_only'`): Skipped automatically (`workout_split = 'auto'`), because home workouts are structured around available home equipment and full-body/upper-lower metabolic templates rather than gym machine splits.
  - **Condition B (**`workout_days.length <= 2`): Skipped automatically (`workout_split = 'full_body'`), because training 1–2 days/week scientifically requires Full Body sessions to hit every muscle group weekly.
2. `auto` & Explicit Split Resolution Algorithm (`server/workouts.mjs` & `previewPlan`):
  - If `workoutSplit != 'auto'` and valid for `daysCount`:
    - `upper_lower`: `>= 2` days (`upper` / `lower` alternating)
    - `ppl`: `>= 3` days (`4d`: `push / pull / legs / full_body`; `5d`: `push / pull / legs / upper / lower`; `3` or `6+`: `push / pull / legs` rotation)
    - `bro_split`: `>= 4` days (`4d`: `chest_tri / back_bi / shoulders_core / legs`; `5–6d`: `chest / back / legs / shoulders / arms / core`)
    - Backend falls back to `'full_body'` only when `upper_lower < 2`, `ppl < 3`, or `bro_split < 4` days (or if home equipment lacks exercises for split focus days).
  - If `workoutSplit == 'auto'`:
    - `daysCount <= 3` -> `'full_body'`
    - `daysCount == 4` -> `'upper_lower'`
    - `daysCount >= 5` -> `'ppl'` (`5d`: `push / pull / legs / upper / lower`)
3. **Session Duration Time-Budget Engine (`server/workouts.mjs`):**
  - Every session reserves `300s` (`5 min`) dynamic warm-up plus per-exercise working/rest/transition time (`sets * repMax * 3 * (unilateral ? 2 : 1) + (sets - 1) * restSeconds + 60`) strictly capped at `sessionDuration * 60` seconds (`20`, `30`, `45`, `60`, or `90` minutes).
4. **Injury, Senior & Trimester-Aware Pregnancy Contraindication Matrix (`server/workouts.mjs`):**
  - `knee`: Excludes squat/lunge/knee_extension patterns and plyometric/jump/split-squat names.
  - `lower_back`: Excludes hinge pattern and deadlift/good-morning/back-squat/sit-up names.
  - `shoulder`: Excludes vertical_push/shoulder_abduction patterns and upright-row/behind-neck/dip/overhead names.
  - `wrist`: Excludes elbow_flexion pattern and barbell-curl/close-grip-bench/handstand/push-up names.
  - `ankle`: Excludes plantar_flexion/lunge patterns and jump/hop/sprint/plyo/calf-raise names.
  - `elbow`: Excludes skull-crusher/french-press/preacher-curl/close-grip/dip/behind-head names while keeping neutral-grip/machine alternatives.
  - `neck` / `hip`: Excludes scapular_elevation / neck/shrug and wide-stance/sumo/split-squat/lunge movements respectively.
  - `diastasis_recti`: Excludes spinal_flexion/hip_flexion patterns and crunch/sit-up/v-up/leg-raise names.
  - **`pregnant_t1`:** Excludes unsafe high-impact, plyometric, crunch, sit-up, v-up, leg-raise, and deadlift movements (`PREGNANCY_ALL_TRIMESTERS_UNSAFE_RE`).
  - **`pregnant_t2` & `pregnant_t3`:** Excludes all `pregnant_t1` movements **plus** supine / flat-bench / barbell-bench movements (`PREGNANCY_POST_T1_SUPINE_RE`).
  - **`seniorMode` (`age >= 70`):** Excludes high-impact plyometrics, box jumps, barbell back squats, conventional deadlifts, Olympic lifts, and behind-the-neck presses (`SENIOR_UNSAFE_RE`).

---

**MAIN FLOW**

1. User previously selected `gym_only` and `4 days` (`[0, 1, 3, 5]`).
2. Since `workout_location != 'home_only'` and `daysCount == 4 >= 3`, coach asks `workout_split` showing `Coach's Smart Choice ⭐`, `Full Body`, `Upper / Lower`, `Push / Pull / Legs`, and `Bro Split`.
3. User selects `Coach's Smart Choice ⭐` (resolves to `upper_lower`).
4. Coach asks `session_duration`; user selects `45 Minutes ⭐`.
5. Coach asks `injuries`; user selects `knee` and taps `Confirm`.
6. System stores workout configuration and advances to the Nutrition Block (`US-MOB-08`) or directly to `summary` (`US-MOB-09`) if `service_track == 'workouts_only'`.

---

**EDGE CASES**

- **User selects **`workouts_only` in `service_track`: After confirming `injuries`, all Nutrition Block questions (`US-MOB-08`) are skipped and the user transitions directly to `summary` (`US-MOB-09`).
- **User selects multiple injuries (e.g., **`knee` + `lower_back` + `shoulder`): The exercise filter applies the **union** of all contraindicated tags (`excludedTags`) and guarantees every scheduled day still populates the target number of exercises using joint-safe machine/cable/floor alternatives.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: **`workout_split` is skipped for Home-Only users
  - **Given** `workout_location = "home_only"` and `workout_days = [0, 2, 4, 5]` (4 days)
  - **When** the user completes `home_equipment`
  - **Then** `workout_split` is automatically skipped and the next question is `session_duration`.
- **Scenario 2: **`workout_split` is skipped for 1–2 training days even in Gym
  - **Given** `workout_location = "gym_only"` and `workout_days = [0, 3]` (2 days)
  - **When** the user confirms `workout_days`
  - **Then** `workout_split` is automatically set to `full_body` without prompting the user, and the next question is `session_duration`.
- **Scenario 3: Injury selection removes contraindicated exercises**
  - **Given** the user selects `lower_back` and `knee` in `injuries`
  - **When** the 7-day workout plan is generated
  - **Then** zero exercises tagged as contraindicated for `lower_back` or `knee` appear in the plan, and safe alternatives are substituted.

---

**ANALYTICS**

- `onboarding_workout_split_selected` (`selected_split`, `resolved_split`, `days_count`)
- `onboarding_session_duration_selected` (`minutes`, `exercises_per_session`)
- `onboarding_injuries_selected` (`injuries`: `string[]`, `injuries_count`: `number`)

---

## US-MOB-08: Nutrition Setup — Daily Activity, Clinical Conditions, Diet School, Meal Timing/Count, Budget & Exclusions

> **Jira Key:** [`KAN-42`](https://abdulrahman-alaa.atlassian.net/browse/KAN-42) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a user whose program includes nutrition, I want to specify my daily non-exercise activity level, chronic medical conditions, preferred diet school (filtered for my medical safety), meal timing or daily meal count, grocery budget, and food exclusions/allergies so that my meal plan is 100% medically safe, affordable, and tailored to my regional cuisine.

---

**PRECONDITIONS**

- `service_track != 'workouts_only'` and user has completed the Goal block (`US-MOB-05`) and (if applicable) the Workout block (`US-MOB-06` & `US-MOB-07`).

---

**SCREEN AND UI DETAILS**

**1. Step: **`activity` (Daily Non-Workout Activity Level)

- **Coach Bubble:** *"Outside of workouts, how active is your typical daily routine?"*
  - **Micro-Why Caption:** *"Adjusts non-exercise burn (NEAT), which drives up to 30% of daily energy needs."*
- **Input Control (**`single-select` — 4 Cards):
  - `sedentary`: `Sedentary / Desk Job (1.2x)` — Subtitle: `"Mostly sitting, office/computer work, under 4,000 steps/day"`
  - `light`: `Lightly Active (1.375x)` — Subtitle: `"Light daily movement, teaching, housework, 4,000–7,500 steps/day"`
  - `moderate`: `Moderately Active (1.55x)` — Subtitle: `"On your feet most of the day, field work, 7,500–10,000 steps/day"`
  - `active`: `Very Active / Physical Job (1.725x)` — Subtitle: `"Heavy manual labor or 10,000+ steps/day outside workouts"`

**2. Step: **`conditions` (Clinical & Metabolic Health Conditions)

- **Coach Bubble:** *"Any health or food-sensitivity conditions we should protect your meals around?"*
  - **Micro-Why Caption:** *"Auto-filters risky ingredients, hides unsafe diets, and adjusts metabolic equations."*
- **Input Control (**`multi-select` — All 17 Backend Options: `none` + 16 Supported Clinical/Wellness Conditions):
  - `none`: `None (No Health Conditions)` — Subtitle: `"Standard healthy adult meal filtering"` *(Mutually exclusive with all clinical options)*
  - `insulin_resistance`: `Insulin Resistance / Prediabetes` — Subtitle: `"Recommends Low Carb & removes high-glycemic honey"`
  - `diabetes_t2`: `Type 2 Diabetes` — Subtitle: `"Protects glycemic balance; hides Keto & IF"`
  - `diabetes_t1`: `Type 1 Diabetes` — Subtitle: `"Strict carb-timing awareness; hides Keto & IF"`
  - `pcos`: `PCOS (Polycystic Ovary Syndrome)` — Subtitle: `"Supports insulin sensitivity via Low Carb priority"` *(Shown ONLY when *`gender == 'female'`)
  - `hypothyroid`: `Hypothyroidism (Underactive Thyroid)` — Subtitle: `"Applies realistic -5% BMR calibration"`
  - `hypertension`: `High Blood Pressure (Hypertension)` — Subtitle: `"Limits sodium, removes pickles/salted cheeses & prioritizes DASH"`
  - `cholesterol`: `High Cholesterol / Triglycerides` — Subtitle: `"Prefers lean fats & Mediterranean; blocks Keto"`
  - `ibs`: `IBS / Sensitive Colon` — Subtitle: `"Removes high-FODMAP triggers like fried legumes & heavy onion"`
  - `celiac`: `Celiac Disease / Gluten Intolerance` — Subtitle: `"Auto-enforces 100% gluten-free meals & excludes wheat"`
  - `gout`: `Gout / High Uric Acid` — Subtitle: `"Caps protein <= 1.4 g/kg, removes purines & adds +500 ml water"`
  - `kidney`: `Chronic Kidney Sensitivity / Mild Renal Issue` — Subtitle: `"Protects renal load (protein <= 1.1 g/kg; blocks High Protein/Keto)"`
  - `favism`: `Favism (G6PD Deficiency)` — Subtitle: `"Strictly removes all fava beans & falafel from plan & swaps"`
  - `lactose_intolerance`: `Lactose Intolerance / Dairy Sensitivity` — Subtitle: `"Auto-excludes milk, yogurt & dairy while replacing protein sources"`
  - `anemia`: `Iron-Deficiency Anemia` — Subtitle: `"Recorded clinically for nutrition review & iron-aware planning"`
  - `vitamin_d_deficiency`: `Vitamin D Deficiency` — Subtitle: `"Recorded clinically to guide Vitamin-D nutrient awareness"`
  - `fatty_liver`: `Fatty Liver (NAFLD)` — Subtitle: `"Recorded clinically to support liver-friendly whole-food planning"`

**3. Step: **`diet_type` (Diet School Selection — Dynamically Filtered by Medical Safety)

- **Coach Bubble:** *"Which eating style matches your taste best?"*
  - **Micro-Why Caption:** *"Shapes your daily meal variety and macros — unsafe clinical options are already hidden."*
- **Input Control (**`single-select` — Up to 9 Diet Schools):
  - `balanced`: `Balanced Local Cuisine ⭐` — Subtitle: `"Flexible home-cooked variety; choose 2–5 meals/day"`
  - `low_carb`: `Low Carb (Moderate Reduction)` — Subtitle: `"Reduces refined carbs (<=130g) for steady energy & insulin control"`
  - `high_protein`: `High Protein Athlete` — Subtitle: `"Maximizes satiety, recovery & lean muscle retention"`
  - `intermittent_fasting`: `Intermittent Fasting (16:8)` — Subtitle: `"Eat in a structured 8h window with zero food restrictions"`
  - `keto`: `Ketogenic Diet (Strict Keto)` — Subtitle: `"High healthy fats, strict <= 50g total carbs/day"`
  - `mediterranean`: `Mediterranean Diet` — Subtitle: `"Heart-healthy olive oil, fish, legumes & whole grains"`
  - `dash`: `DASH Diet (Blood Pressure & Heart Friendly)` — Subtitle: `"Low sodium (<1800mg), potassium-rich whole foods"`
  - `vegetarian`: `Vegetarian (Plant-Based + Dairy & Eggs)` — Subtitle: `"Meatless meals powered by eggs, dairy & legumes"`
  - `vegan`: `100% Vegan (Strictly Plant-Based)` — Subtitle: `"100% plant proteins, grains & nuts — zero animal products"`

**4. Conditional Step: **`if_start_hour` (Shown ONLY if `diet_type == 'intermittent_fasting'`)

- **Coach Bubble:** *"When would you like to eat your first meal (break your fast)?"*
  - **Micro-Why Caption:** *"Aligns your 8-hour eating window and fasting timer with your daily routine."*
- **Input Control (**`single-select` + custom hour picker covering full backend range `6..16` / `06:00`–`16:00`):
  - `8`: `8:00 AM (Eating window: 8:00 AM – 4:00 PM)`
  - `10`: `10:00 AM (Eating window: 10:00 AM – 6:00 PM)`
  - `12`: `12:00 PM ⭐ (Eating window: 12:00 PM – 8:00 PM)`
  - `14`: `2:00 PM (Eating window: 2:00 PM – 10:00 PM)`
  - `16`: `4:00 PM (Eating window: 4:00 PM – 12:00 AM)`
  - Plus compact `[Pick Custom Start Hour (06:00–16:00)]` stepper (`integer 6..16`) matching `resolveEatingStart` in `server/coaching.mjs`.

**5. Conditional Step: **`meals_count` (Shown ONLY if `diet_type == 'balanced'`)

- **Coach Bubble:** *"How many meals and snacks fit your daily schedule?"*
  - **Micro-Why Caption:** *"Distributes the exact same daily calories across your preferred meal rhythm."*
- **Input Control (**`single-select` — 4 Options):
  - `2`: `2 Main Meals per Day` — Subtitle: `"Larger portions, minimal kitchen prep"`
  - `3`: `3 Main Meals per Day ⭐ (Recommended)` — Subtitle: `"Classic Breakfast, Lunch & Dinner"`
  - `4`: `3 Main Meals + 1 Snack (4 Total)` — Subtitle: `"Extra afternoon satiety without shrinking main meals"`
  - `5`: `3 Main Meals + 2 Snacks (5 Total)` — Subtitle: `"Ideal for high calorie targets or muscle gain"`
  - *(Note: Specialty diets use structured meal layouts in `FIXED_DIET_MEALS` — `keto`: 3 meals, `intermittent_fasting`: 3 feeds inside 8h window, other specialty diets: 4 feeds — so users aren't asked an ineffective `meals_count` question.)*

**6. Step: **`budget` (Grocery Budget Level)

- **Coach Bubble:** *"What grocery budget fits your weekly shopping best?"*
  - **Micro-Why Caption:** *"Keeps every suggested meal realistic, affordable, and available nearby."*
- **Input Control (**`single-select` — 3 Cards):
  - `low`: `Economic / Budget-Friendly` — Subtitle: `"Eggs, cottage/feta cheese, legumes, oats, chicken & seasonal produce"`
  - `medium`: `Moderate / Standard ⭐ (Recommended)` — Subtitle: `"Balanced mix of poultry, beef, fish, dairy & everyday groceries"`
  - `high`: `Premium / Open Budget` — Subtitle: `"Adds salmon, steak, nuts, avocado, berries & specialty cuts"`

**7. Step: **`allergies` (Food Exclusions & Allergies)

- **Coach Bubble:** *"Almost done! Any foods you are allergic to or strongly dislike?"*
  - **Micro-Why Caption:** *"Excluded 100% across your plan, meal swaps, and grocery list — never auto-relaxed."*
- **Input Control (**`multi-select` — 15 Options):
  - `none`: `None (I Eat Everything)` *(Mutually exclusive with all exclusion items)*
  - `dairy`: `Dairy & Milk`
  - `eggs`: `Eggs`
  - `fish`: `Fish`
  - `shellfish`: `Shellfish & Shrimp`
  - `peanuts`: `Peanuts`
  - `tree_nuts`: `Tree Nuts (Almonds, Walnuts, etc.)`
  - `gluten`: `Wheat & Gluten`
  - `soy`: `Soy`
  - `sesame`: `Sesame & Tahini`
  - `red_meat`: `Red Meat`
  - `poultry`: `Poultry / Chicken`
  - `legumes`: `Legumes (Beans, Lentils, Chickpeas)`
  - `oats`: `Oats`
  - `spicy`: `Spicy / Chili Foods`

---

**CLINICAL DIET FILTERING & NUTRITION LOGIC**

1. **Medical Diet Contraindication Rules (**`getAvailableDietOptions(state)`):
  - `keto` is HIDDEN/BLOCKED when ANY of the following apply:
    - `maternal_status` is `pregnant_t1`, `pregnant_t2`, `pregnant_t3`, or `breastfeeding`
    - `conditions` includes `diabetes_t1`, `diabetes_t2`, `gout`, `kidney`, or `cholesterol` *(conservative clinical lipid safety block)*
    - `goal == 'gain'` (weight gain requires adequate carbohydrates)
  - `intermittent_fasting` is HIDDEN/BLOCKED when ANY of the following apply:
    - `maternal_status` is `pregnant_t1`, `pregnant_t2`, `pregnant_t3`, or `breastfeeding` *(conservative lactation hydration & energy safety block)*
    - `conditions` includes `diabetes_t1` or `diabetes_t2` (hypoglycemia risk)
    - `goal == 'gain'`
  - `high_protein` is HIDDEN/BLOCKED when:
    - `conditions` includes `kidney` (caps protein at `<= 1.1 g/kg` to avoid renal hyperfiltration).
2. **Smart Clinical Diet Recommendations (**`⭐ Recommended` Badge):
  - If `conditions` includes `insulin_resistance`, `diabetes_t2`, or `pcos` -> Recommend `low_carb` (`⭐`).
  - If `conditions` includes `hypertension` -> Recommend `dash` (`⭐`).
  - If `conditions` includes `cholesterol` -> Recommend `mediterranean` (`⭐`).
  - Otherwise -> Recommend `balanced` (`⭐`).
3. **Automatic Ingredient-Level Clinical Filters (`clinicalIngredientFilters`):**
  - `celiac` -> Auto-injects `gluten` exclusion even if user doesn't manually toggle `gluten` in `allergies`.
  - `favism` -> Auto-injects `fava` exclusion (removes fava beans & falafel automatically even if user taps `none` in `allergies`).
  - `lactose_intolerance` -> Auto-injects `dairy`, `milk`, `yogurt`, `cheese` exclusions and removes dairy protein sources automatically.
  - `hypertension` -> Filters out high-sodium items (pickles, salted cheeses, processed meats).
  - `gout` -> Filters out high-purine items (organ meats, sardines/anchovies, concentrated meat gravies) and increases daily water target by `+500 ml`.
  - `ibs` -> Filters out heavy high-FODMAP triggers (fried legumes, raw onion/garlic-heavy meals).
  - `hypothyroid` -> Applies a realistic `-5%` BMR metabolic adjustment (`0.95 * REE`) so calorie targets match slower thyroid metabolism without starvation.
4. **Default Meal Count When **`meals_count` Step is Skipped:
  - If `diet_type == 'intermittent_fasting'` -> Default to `2` main meals + `1` snack inside the 8-hour window (`12:00 PM`, `4:00 PM`, `7:30 PM` for `if_start_hour = 12`).
  - If `diet_type != 'balanced'` and `diet_type != 'intermittent_fasting'` -> Default to `3` meals/day (`4` meals/day if `goal == 'gain'` or `goal == 'muscle_gain'`).

---

**MAIN FLOW**

1. User selects `activity = "light"` (`1.375x`).
2. User selects `conditions = ["insulin_resistance"]` and confirms.
3. Coach asks `diet_type` with `Low Carb ⭐ (Recommended)` highlighted at the top.
4. User selects `balanced` (`Balanced Local Cuisine`).
5. Since `diet_type == 'balanced'`, `if_start_hour` is skipped and coach asks `meals_count`. User selects `3`.
6. Coach asks `budget`; user selects `medium`.
7. Coach asks `allergies`; user selects `fish` + `shellfish` and confirms.
8. Chat transitions to the Final Plan Summary Screen (`US-MOB-09`).

---

**EDGE CASES**

- **User selects **`vegan` diet AND excludes `legumes`, `soy`, `tree_nuts`, `peanuts`, and `oats` in `allergies`:
  - The meal generator still succeeds by falling back to remaining plant-based grains/seeds/vegetables (quinoa, rice, potatoes, tahini/sesame, mushrooms, spinach) without crashing or returning empty meals, and displays a gentle note about diversifying plant protein sources.
- **User selects **`celiac` in `conditions` and taps `none` in `allergies`:
  - The backend/engine still enforces `100% gluten-free` recipes because clinical conditions take precedence over `allergies = ["none"]`.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Medical conditions block unsafe diets**
  - **Given** the user selected `diabetes_t2` or `gout` in `conditions`
  - **When** the `diet_type` options are rendered
  - **Then** `keto` is completely hidden from the options list and cannot be selected.
- **Scenario 2: Conditional meal timing vs. meal count branching**
  - **Given** the user is at `diet_type`
  - **When** the user selects `intermittent_fasting`
  - **Then** the next step is `if_start_hour` and `meals_count` is skipped
  - **And when** the user edits `diet_type` to `balanced`
  - **Then** `if_start_hour` is cleared and `meals_count` is asked.
- **Scenario 3: Food exclusions remove all matching recipes**
  - **Given** the user selects `dairy` and `eggs` in `allergies`
  - **When** the 7-day nutrition plan is generated
  - **Then** zero meals containing dairy or eggs are included in the plan.

---

**ANALYTICS**

- `onboarding_activity_selected` (`activity_level`, `multiplier`)
- `onboarding_conditions_selected` (`conditions`: `string[]`)
- `onboarding_diet_selected` (`diet_type`, `was_clinically_recommended`: `boolean`)
- `onboarding_budget_selected` (`budget_tier`: `"low"` | `"medium"` | `"high"`)
- `onboarding_allergies_selected` (`allergies`: `string[]`)

---

## US-MOB-09: Plan Summary Screen, Complete Mathematical Equations & Dual-Path "Start Plan" Handoff (Server Sync vs. Passwordless Social Sign-In)

> **Jira Key:** [`KAN-43`](https://abdulrahman-alaa.atlassian.net/browse/KAN-43) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile`, `onboarding`, `production`

**STORY**

As a user who has answered all onboarding questions, I want to review a comprehensive Summary Screen with a live numerical preview of my calculated daily calories, macronutrients, hydration, workout schedule, and expected transformation timeline (powered by `POST /v1/plans/preview`), be able to edit any section in 1 tap, and tap "Start My Plan" so that my plan either generates and syncs immediately via the canonical CuraFit API v1 sequence (if I am already signed in) or routes me through **Passwordless Social Sign-In (`EPIC-02`)** first before consenting, running eligibility, generating the plan, bootstrapping, and entering the Home screen.

---

**PRECONDITIONS**

- All active onboarding steps (`getActiveSteps(state)`) have been answered.
- `POST /v1/plans/preview` (stateless unauthenticated-safe preview endpoint) and the local deterministic preview engine (`computePlanSummary(state)`) share the exact same unified backend formulas.

---

**SCREEN AND UI DETAILS**

**1. Staged Blueprint Reveal (1.5s Entry Transition) & Summary Header**

- On first transition from the last question (`allergies` or `injuries`) to `summary`, display a crisp 1.5-second live build card while `POST /v1/plans/preview` resolves:
  - `1. Calculating BMR, Calories & Macros ✓`
  - `2. Applying Clinical & Regional Meal Filters ✓`
  - `3. Structuring Your Weekly Workout Blueprint ✓`
- **Title:** *"Your Personalized Blueprint is Ready, {name}!"*
- **Region Selector Pill:** `[Region: Egypt / Gulf / Levant / Maghreb ▾]` — Changing the region immediately calls `POST /v1/plans/preview` (with deterministic local fallback) to refresh regional dish names and climate hydration in the preview.

**2. Live Numerical Preview Cards (Hero Metrics Grid)**

- **Card 1 — Body & Goal Timeline:**
  - Current Weight (`{current_weight} kg`, `BMI {currentBmi}`) -> Target Weight (`{target_weight} kg`, `BMI {targetBmi}`)
  - Healthy Ideal Weight Range Badge: `{minHealthyWeight} – {maxHealthyWeight} kg` *(If *`bmiWarningOverride == true`, show subtle amber badge: `"Custom Target Outside Standard BMI"`)
  - Expected Timeline Range: `{estimated_weeks_min}–{estimated_weeks_max} Weeks` (`~{expectedMonthsMin}–{expectedMonthsMax} Months`).
- **Card 2 — Daily Nutrition & Hydration Targets *****(Shown if ***`service_track != 'workouts_only'`):
  - **Target Daily Calories:** `{targetCalories} kcal / day` *(with TDEE *`{tdee} kcal` & daily delta `{dailyCalorieDelta} kcal` subtitle)
  - **Daily Macros:**
    - **Protein:** `{proteinGrams}g` (`{proteinPct}%`)
    - **Total Carbs:** `{carbsGrams}g` (`{carbsPct}%`)
    - **Fats:** `{fatsGrams}g` (`{fatsPct}%`)
  - **Daily Water Intake:** `{waterLiters} L / day` (`~{waterCups} cups`) *(shows rest-day baseline and `+500 ml` training-day target when training days are scheduled)*
- **Card 3 — Weekly Training Blueprint *****(Shown if ***`service_track != 'nutrition_only'`):
  - **Location & Split:** `{workoutLocationLabel}` • `{resolvedSplitLabel}`
  - **Schedule:** `{workoutDays.length} Days/Week` (`{selectedWeekdayNames}`) • `{session_duration} min/session` (`{exercisesPerSession} exercises`)
  - **Safety Filters Active:** Lists any active injury protections (`knee`, `lower_back`, etc.) or `Senior Safety Mode`.
  - *(If `service_track == 'nutrition_only'` and `goal == 'muscle_gain'`, display optional `externalTrainingDays` summary or an informational coaching note that muscle growth relies on external resistance training.)*

**3. Section-Level Quick Edit Links (**`[Edit ✏️]`)

- Grouped summary rows with 1-tap `[Edit]` buttons that open the corresponding step's Edit Bottom Sheet (`US-MOB-02`):
  - **Personal & Body Measurements** (`name`, `age`, `gender`, `maternal_status`, `height`, `current_weight`)
  - **Goal & Pace** (`goal`, `target_weight`, `goal_pace`)
  - **Workout Preferences** (`service_track`, `fitness_level`, `workout_location`, `workout_days`, `workout_split`, `session_duration`, `injuries`)
  - **Nutrition Preferences** (`activity`, `conditions`, `diet_type`, `meals_count`/`if_start_hour`, `budget`, `allergies`)

**4. Sticky Bottom Primary CTA**

- Button Label:
  - If `isAuthenticated == true`: `[Start My Plan & Sync to Account]`
  - If `isAuthenticated == false`: `[Continue to Sign In & Start My Plan]`

---

**COMPLETE MATHEMATICAL EQUATIONS & UNIFIED ENGINE SPECIFICATION**

`POST /v1/plans/preview`, `POST /v1/commands?view=full` (`action: "generate"`), and the KMM client preview MUST implement these exact deterministic unified backend formulas (`planner-core.mjs` & `server/coaching.mjs`):

**1. Resting Energy Expenditure (**`REE` — Mifflin–St Jeor Equation):

- **Male:**
$$REE = (10 \times currentWeight) + (6.25 \times heightCm) - (5 \times age) + 5$$
- **Female:**
$$REE = (10 \times currentWeight) + (6.25 \times heightCm) - (5 \times age) - 161$$
- **Hypothyroid Adjustment:** If `conditions` includes `'hypothyroid'`, multiply $REE$ by $0.95$.

**2. Total Daily Energy Expenditure (**`TDEE`):

- **Activity Multiplier (**`activityMultiplier`) — NO separate TDEE workout bonus (unless `exerciseMode: "separate"` with explicit sports rows):**
  - `sedentary` = $1.2$, `light` = $1.375$, `moderate` = $1.55$, `active` = $1.725$
$$TDEE = REE \times activityMultiplier$$
  *(Reported rounded to 1 decimal place in `targets.tdee`.)*

**3. Percentage-of-TDEE Capped Calorie Delta, Maternal Non-Stacking Calibration & Clinical Safety Bounds:**

- **Base Daily Delta (`change`):**
  - `goal == 'lose'`:
    - `maxDeficit = seniorMode ? 400 : 500` (`seniorMode` active for `age >= 70`)
    - `slow`: $-\min(TDEE \times 0.10,\ maxDeficit)$
    - `moderate`: $-\min(TDEE \times 0.15,\ maxDeficit)$
    - `fast`: $-\min(TDEE \times 0.20,\ maxDeficit)$
  - `goal == 'muscle_gain'`:
    - Recomposition (`targetWeight != null` and `abs(targetWeight - currentWeight) < 0.5`): `change = 0 kcal`
    - `slow`: $+\min(TDEE \times 0.05,\ 250)$
    - `moderate`: $+\min(TDEE \times 0.08,\ 250)$
    - `fast`: $+\min(TDEE \times 0.10,\ 250)$
  - `goal == 'gain'`:
    - `slow`: $+\min(TDEE \times 0.08,\ 400)$
    - `moderate`: $+\min(TDEE \times 0.12,\ 400)$
    - `fast`: $+\min(TDEE \times 0.15,\ 400)$
  - `goal == 'maintain'`: `change = 0 kcal`
- **Maternal Calibration Override (Pregnancy NEVER stacks `gain`/`muscle_gain` surplus on top of trimester add-ons):**
  - `pregnant_t1`: `change = 0`
  - `pregnant_t2`: `change = +340`
  - `pregnant_t3`: `change = +450`
  - `breastfeeding`: `boundedOffset = (goal == 'lose') ? max(-300, change) : change`; `change = boundedOffset + 400`
- **Enforce Upgraded Clinical Calorie Floors (`minCalorieFloor`) & Maximum Ceiling (`4200 kcal`):**
  - `gender == 'male'`: **$1500\text{ kcal/day}$**
  - `gender == 'female'` (non-pregnant/non-breastfeeding): **$1200\text{ kcal/day}$**
  - `pregnant_t1` / `pregnant_t2` / `pregnant_t3`: **$1800\text{ kcal/day}$**
  - `breastfeeding`: **$1600\text{ kcal/day}$**
  - Maximum Safe Calorie Ceiling: **$4200\text{ kcal/day}$** (`> 4200` throws `400 ENERGY_CHANGE_OUT_OF_RANGE`)
$$targetCalories = \max\left(minCalorieFloor,\ \text{roundToNearest10}(TDEE + change)\right)$$

**4. Macronutrient Calculation (`proteinGrams`, `fatsGrams`, `carbsGrams` — Total Carbs):**

- **Effective Reference Weight for Protein (`effectiveWeight` via ABW when `currentBmi > 30`):**
  - If $currentBmi > 30$:
$$IBW = 24 \times heightM^2, \quad effectiveWeight = IBW + 0.35 \times (currentWeight - IBW)$$
  - Else: $effectiveWeight = currentWeight$.
- **Base Protein Factor (`planner-core.mjs`):**
  - If `trainingDays > 0`: `1.4 g/kg` for `maintain`, `1.6 g/kg` for `lose` / `gain` / `muscle_gain`.
  - If `trainingDays == 0`: `1.4 g/kg` for `lose`, `1.3 g/kg` for `gain`, `1.0 g/kg` for `maintain`.
  - **Clinical Overrides on Protein Factor:**
    - If `seniorMode == true` (`age >= 70`): `factor = max(factor, 1.2)`.
    - If `maternalStatus != 'none'`: `factor = max(factor, 1.4)`.
    - If `conditions` includes `'gout'`: `factor = min(factor, 1.4)`.
    - If `conditions` includes `'kidney'`: `factor = min(factor, 1.1)` (and maternal protein add-on is omitted for renal safety).
  - **Maternal Protein Add-On:** `+0g` (`pregnant_t1`), `+15g` (`pregnant_t2`), `+25g` (`pregnant_t3`), or `+20g` (`breastfeeding`) when `'kidney'` is not declared:
$$proteinGrams = \text{round1}(effectiveWeight \times factor + maternalProteinAddon)$$
- **Base Fats & Total Carbohydrates Split (`planner-core.mjs` — always Total Carbs, never Net Carbs):**
  - `fatShare = conditions.includes('cholesterol') ? 0.25 : 0.30`
  - `fatGrams = round1((targetCalories * fatShare) / 9)`
  - `carbGrams = round1(max(0, targetCalories - proteinGrams * 4 - fatGrams * 9) / 4)`
  - **Glycemic Support Calibration (`diabetes*`, `insulin_resistance`, `pcos`):** Caps carbohydrate energy at `<= 38%` of `targetCalories`, rebalancing protein (up to `maxProtFactor`: `1.1` kidney / `1.4` gout / `1.8` default) and fats cleanly.
- **Diet-Specific Macro Overrides (`applyDietMacroPreview` in `server/coaching.mjs`):**
  - **`high_protein`:** Raises `protein_factor` to `min(max_protein_factor, max(protein_factor, 1.6))`, sets `protein = round(effectiveWeight * resolvedFactor)`, and allocates remaining calories to carbs.
  - **`low_carb`:** Targets `carbs = 100 g` (total carbs ceiling `<= 130 g/day`), with `fat = round(max(0, targetCalories - protein * 4 - 400) / 9)`.
  - **`keto`:** Targets `carbs = 30 g` (strict total carbs ceiling `<= 50 g/day`, never net carbs), with `fat = round(max(0, targetCalories - protein * 4 - 120) / 9)`.

**5. Expected Timeline Range (`estimated_weeks_min..max`, `7700 kcal/kg`):**

- When `targetWeight != null` and `abs(targetWeight - currentWeight) >= 0.2` and `actualChange = targetCalories - TDEE != 0`:
$$weeklyKg = \text{round2}\left(\frac{|actualChange| \times 7}{7700}\right), \quad centerWeeks = \max\left(1,\ \text{ceil}\left(\frac{|targetWeight - currentWeight|}{\max(0.1,\ weeklyKg)}\right)\right)$$
$$estimated\_weeks\_min = \max(1,\ \text{floor}(centerWeeks \times 0.85)), \quad estimated\_weeks\_max = \text{ceil}(centerWeeks \times 1.25)$$

**6. Daily Hydration Equation (**`waterLiters` & `waterCups`):

- Base water (ml): $baseWaterMl = currentWeight \times 35$
- Daily activity addition: `+350 ml` if `activity == 'moderate'`, `+500 ml` if `activity == 'active'` (`0 ml` for `sedentary` / `light`).
- Training-day addition: `+500 ml` on scheduled training days (or external training days when `externalTrainingDays` includes today).
- Maternal addition: `+300 ml` if pregnant (`pregnant_t1`/`t2`/`t3`), `+600 ml` if `breastfeeding`.
- Gout addition: `+500 ml` if `conditions` includes `'gout'`.
- Hot climate / region addition: `+200 ml` for `'gulf'` and `'egypt'`.
$$totalWaterMl = baseWaterMl + activityAddon + workoutDayAddon + maternalAddon + goutAddon + hotClimateAddon$$
$$waterLiters = \text{round1}\left(\frac{\text{clamp}(totalWaterMl, 2000, 5000)}{1000}\right)$$
$$waterCups = \text{round}\left(\frac{waterLiters \times 1000}{250}\right)$$

---

**DUAL-PATH "START MY PLAN" HANDOFF & CANONICAL CURAFIT API V1 SEQUENCE**

When the Summary Screen loads and when the user taps the primary `[Start My Plan]` button:

1. **Stateless Preview on Summary Load (`POST /v1/plans/preview`):**
   - Call `POST /v1/plans/preview` (public, IP rate-limited) with the draft onboarding answers to obtain authoritative `dailyCalories`, `macros`, `waterTarget` / `waterTargetLiters` (including `externalTrainingDays` boost), `estimatedWeeksMin`, `estimatedWeeksMax`, `recommendedSplit`, `seniorMode`, `warnings`, `clinicalBlocks`, `workoutUiModeDefault`, and `eligibility` without requiring authentication.
   - Persist the draft onboarding answers locally (`onboardingDraft`) so zero input is ever lost.
2. **Canonical CuraFit API v1 Commit Sequence (Mandatory Online Completion Before Home):**
   - Full sequence:
     1. `POST /v1/plans/preview` *(already called on Summary load / edit)*
     2. **OAuth (`EPIC-02`):** If `isAuthenticated == false`, navigate to **Passwordless Social Sign-In (`EPIC-02`)** (`POST /v1/auth/oauth/google` or `POST /v1/auth/oauth/apple`).
     3. **`POST /v1/account/consents`:** If `bootstrap.consents` indicates required health/terms consents are not yet accepted, present `HealthConsentModal` and record explicit acceptance.
     4. **`POST /v1/eligibility`:** Validate clinical, age (`18..95`), BMI, and maternal safety gates on the server (`status: "eligible"` or `"eligible_with_cautions"`).
     5. **`POST /v1/commands?view=full`** with `{ revision, action: "generate", payload: { ... } }` (including `unitSystem`, `workoutUiMode`, and `overwriteExisting: true` when replacing an existing profile; passing `overwriteExisting: false` on an existing profile returns `409 PROFILE_ALREADY_EXISTS`) and a stable `Idempotency-Key` header.
     6. **`GET /v1/bootstrap`:** Hydrate the authoritative user workspace, smart `ETag` (`W/"boot-..."`), `revision`, `onboardingCompleted`, `consents`, `entitlements`, `todaySummary`, and `scheduledSessions`.
3. **Path 1 — User IS Already Signed In (`isAuthenticated == true`):**
   - *(Happens when the user signed in at Step 0 `account_check` with a new account or chose `Start fresh` after sign-in).*
   - Show loading state on button (`"Building & syncing your custom plan..."`).
   - Execute steps 3–6 of the canonical sequence (`POST /v1/account/consents` -> `POST /v1/eligibility` -> `POST /v1/commands?view=full` `action: "generate"` -> `GET /v1/bootstrap`).
   - **On API Success (`200 OK`):**
     - Set `onboardingCompleted = true` (`signed_in_active`), `syncStatus = "synced"`, clear temporary `onboardingDraft`, and navigate to **Home Screen** (`replace` navigation stack so pressing Back on Home does not return to onboarding).
   - **On Network / Offline Error (NO Offline Home Entry Before Initial `generate` Succeeds):**
     - Keep `onboardingDraft` persisted safely on-device, stay on the **Summary Screen**, display a clear inline connectivity message (*"An internet connection is required to generate and save your initial plan. Your answers are safely saved — tap Retry once you are back online."*), and keep `[Retry]` enabled.
     - Do **NOT** set `onboardingCompleted = true` or navigate to the **Home Screen** until `POST /v1/commands?view=full` (`action: "generate"`) succeeds on the server.
4. **Path 2 — User IS NOT Signed In Yet (`isAuthenticated == false`):**
   - *(Happens when the user answered `"No, I'm a new user"` at Step 0 `account_check` and completed the entire onboarding chat first).*
   - Persist `pendingOnboardingPayload` locally so zero answers can be lost.
   - Navigate to **Passwordless Social Sign-In (`EPIC-02`)** (`entrySource = "onboarding_summary_start_plan"`).
   - **Once Authentication Succeeds via Passwordless Social Sign-In (`EPIC-02`):**
     - Call `GET /v1/bootstrap` to inspect `data.profile`:
     - **Subcase 2A — Newly Created Account OR Existing Account with No Prior Server Plan (`data.profile == null`, `signed_in_needs_onboarding`):**
       - Automatically execute steps 3–6 (`POST /v1/account/consents` -> `POST /v1/eligibility` -> `POST /v1/commands?view=full` `action: "generate"` -> `GET /v1/bootstrap`).
       - Mark `onboardingCompleted = true` (`signed_in_active`), `syncStatus = "synced"`, clear `onboardingDraft`, and navigate directly to **Home Screen**.
     - **Subcase 2B — User Signs Into an Existing Account That Already Has an Old Plan (`data.profile != null`, `signed_in_active`):**
       - Show conflict resolution prompt:
         - *"This account already has a previously saved plan. Would you like to save and activate the new plan you just created, or restore your old saved plan?"*
         - Option A (Primary): `[Use My New Plan (Overwrite Old Data)]` -> Runs `POST /v1/account/consents` (if needed) -> `POST /v1/eligibility` -> `POST /v1/commands?view=full` (`action: "generate"`, `overwriteExisting: true`) -> `GET /v1/bootstrap` and navigates to **Home Screen**.
         - Option B (Secondary): `[Restore My Old Saved Plan]` -> Hydrates local state directly from `GET /v1/bootstrap` and navigates to **Home Screen**.

---

**MAIN FLOW**

1. User completes the final question (`allergies` or `injuries`) and lands on the `summary` screen; the app calls `POST /v1/plans/preview`.
2. User reviews their calculated calories (`2,100 kcal`), macros (`136g P / 231.5g C / 70g F`), hydration (`3.2 L` rest / `3.7 L` workout day), workout split (`4 Days Upper/Lower`), and timeline range (`25–38 weeks`).
3. User taps `[Start My Plan]`.
4. **If already signed in:** App executes `POST /v1/account/consents` -> `POST /v1/eligibility` -> `POST /v1/commands?view=full` (`action: "generate"`) -> `GET /v1/bootstrap` and opens the **Home Screen**.
5. **If not signed in:** App opens **Passwordless Social Sign-In (`EPIC-02`)**, user signs in with Google or Apple, app executes the canonical consent/eligibility/generate/bootstrap sequence, and opens the **Home Screen**.

---

**EDGE CASES**

- **User kills the app during Passwordless Social Sign-In (after finishing Summary):**
  - Because `pendingOnboardingPayload` and `onboardingDraft` (`lastActiveStepId = "summary"`) are persisted locally, reopening the app lands the user right back on the `summary` screen with all numbers ready—zero questions need to be re-answered.
- **User is offline when tapping `[Start My Plan]`:**
  - The app remains on the Summary Screen with all answers preserved locally and shows a retryable offline banner; it never enters Home with an un-generated placeholder plan.
- **User edits an answer from the Summary Screen (e.g., changes **`goal_pace` from `moderate` to `slow`):
  - The Edit Bottom Sheet updates `goal_pace = "slow"`, immediately recalculates via `POST /v1/plans/preview` (and local mirror), and refreshes `targetCalories`, `macros`, and `estimated_weeks_min..max` in place.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Live numerical preview matches exact unified backend equations**
  - **Given** a 30-year-old male, `175 cm`, `85 kg`, `goal = "lose"`, `target_weight = 75 kg`, `goal_pace = "moderate"`, `activity = "light"` (`1.375x`), `diet_type = "balanced"`, `region = "egypt"`, `4 workout days`
  - **When** the Summary Screen renders (`POST /v1/plans/preview`)
  - **Then** `REE = 1,798.8 kcal`, `TDEE = 2,473.3 kcal` (no separate workout TDEE bonus), `targetCalories = 2,100 kcal` (`energy_change = -373.3 kcal`), `protein = 136g` (`1.6 g/kg`), `carbs = 231.5g`, `fat = 70g`, hydration (`3.2 L` base / `3.7 L` workout day, `15 cups` in Egypt), `recommendedSplit = "upper_lower"`, and timeline range (`25–38 weeks` via `7700 kcal/kg`) are displayed identically to the backend.
- **Scenario 2: Signed-in user clicking "Start Plan" runs canonical API v1 sequence and goes to Home**
  - **Given** `isAuthenticated == true` and network connectivity is available
  - **When** the user taps `[Start My Plan & Sync to Account]`
  - **Then** the app runs `POST /v1/account/consents` -> `POST /v1/eligibility` -> `POST /v1/commands?view=full` (`action: "generate"`) -> `GET /v1/bootstrap`, sets `onboardingCompleted = true` (`signed_in_active`), clears the back stack, and navigates to the Home Screen.
- **Scenario 3: Unauthenticated user clicking "Start Plan" routes to Passwordless Social Sign-In (`EPIC-02`) and then commits**
  - **Given** `isAuthenticated == false`
  - **When** the user taps `[Continue to Sign In & Start My Plan]`
  - **Then** the app persists `pendingOnboardingPayload` locally, navigates to **Passwordless Social Sign-In (`EPIC-02`)**, and upon successful authentication runs the canonical consent/eligibility/generate/bootstrap sequence and navigates to the Home Screen.
- **Scenario 4: Offline failure during initial `generate` blocks premature Home entry**
  - **Given** the device is offline when the user taps `[Start My Plan & Sync to Account]`
  - **When** `POST /v1/commands?view=full` (`action: "generate"`) fails due to network error
  - **Then** the app remains on the Summary Screen, preserves `onboardingDraft`, and displays a `[Retry]` CTA instead of navigating to Home.

---

**ANALYTICS**

- `onboarding_summary_viewed` (`target_calories`, `protein_g`, `carbs_g`, `fats_g`, `water_liters`, `estimated_weeks_min`, `estimated_weeks_max`, `service_track`)
- `onboarding_start_plan_clicked` (`is_authenticated`: `boolean`)
- `onboarding_plan_synced` (`sync_path`: `"pre_authenticated"` | `"post_summary_signin"`, `overwrote_server_data`: `boolean`)
- `onboarding_completed` (`total_duration_sec`, `edits_count`, `region`)

---
