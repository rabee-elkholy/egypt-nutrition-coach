# EPIC-01 (Full Jira Export): Mobile Conversational Onboarding & Smart Plan Engine (V2)

> **Jira Epic Key:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34)
> **Priority:** `Medium`
> **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`
> **API Alignment Reference:** See [`EPIC-01-onboarding-v2-alignment.md`](EPIC-01-onboarding-v2-alignment.md) for CuraFit API v1 sequence & backend parity updates.

---

**EPIC OVERVIEW**

End-to-end mobile specification for the **Conversational Onboarding & Smart Plan Calculation Engine (V2)** for the Middle East Nutrition & Workout Coach mobile application.

This Epic covers the complete conversational chat onboarding flow, authentication & saved-data recovery routing, local draft persistence & session resume, in-chat answer editing with smart dependency invalidation, clinical/maternal/age safety gates, anthropometric & macronutrient mathematical equations, location-first workout programming, and the dual-path "Start My Plan" handoff to the Home screen.

---

**CHILD USER STORIES IN THIS EPIC**

- **KAN-35 (**`US-MOB-01`): App Launch Routing, Account Check (First Chat Question), Login Return & Data Recovery
- **KAN-36 (**`US-MOB-02`): Conversational Chat Framework, Dynamic Progress, Local Persistence & In-Chat Answer Editing
- **KAN-37 (**`US-MOB-03`): Name, Age & Age Safety Gate (Under-18 Block & 70+ Senior Mode)
- **KAN-38 (**`US-MOB-04`): Biological Sex, Maternal Status (Pregnancy Trimesters & Breastfeeding) & Body Measurements (Height & Weight)
- **KAN-39 (**`US-MOB-05`): Fitness Goal, Target Weight with Live BMI Range Warning & Weekly Goal Pace Calculator
- **KAN-40 (**`US-MOB-06`): Service Track Selection & Workout Setup (Fitness Level, Location-First Routing, Custom Weekdays & Home Equipment)
- **KAN-41 (**`US-MOB-07`): Smart Hybrid Workout Split Selection, Session Duration & Injury-Safe Exercise Filtering
- **KAN-42 (**`US-MOB-08`): Nutrition Setup — Daily Activity, Clinical Conditions, Diet School, Meal Timing/Count, Budget & Exclusions
- **KAN-43 (**`US-MOB-09`): Plan Summary Screen, Complete Mathematical Equations & Dual-Path "Start Plan" Handoff (Server Sync vs. Login)

---

## US-MOB-01: App Launch Routing, Account Check (First Chat Question), Login Return & Data Recovery

> **Jira Key:** [`KAN-35`](https://abdulrahman-alaa.atlassian.net/browse/KAN-35) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a new or returning mobile user launching the app, I want the app to automatically detect my region, resume where I left off if I had an incomplete onboarding session, ask me as the very first chat question whether I already have an account, and handle login and saved-data restoration smoothly so that I never lose my progress or repeat questions unnecessarily.

---

**PRECONDITIONS**

- The mobile app is launched (cold start or foreground resume).
- Local storage (`AsyncStorage` / `SharedPreferences` / `MMKV`) and the authentication token store are accessible.
- The user has not already completed onboarding with an active synced plan on this device (`onboardingCompleted == false`), OR has just authenticated via the Login screen.

---

**SCREEN AND UI DETAILS**

**1. Auto-Region Detection & Header Switcher**

- On first launch, inspect device timezone and locale (`Intl.DateTimeFormat().resolvedOptions().timeZone` & device locale) and map silently to one of 4 supported regions:
  - `egypt`: `Africa/Cairo` or `*-EG` -> Header Badge: `Egypt`
  - `gulf`: `Asia/Riyadh`, `Asia/Dubai`, `Asia/Kuwait`, `Asia/Qatar`, `Asia/Bahrain`, `Asia/Muscat` -> Header Badge: `Gulf (GCC)`
  - `levant`: `Asia/Amman`, `Asia/Beirut`, `Asia/Damascus`, `Asia/Gaza`, `Asia/Hebron` -> Header Badge: `Levant`
  - `maghreb`: `Africa/Casablanca`, `Africa/Algiers`, `Africa/Tunis`, `Africa/Tripoli` -> Header Badge: `Maghreb`
  - Default fallback if outside these zones: `egypt` (`Egypt`).
- Display a compact region badge in the top header allowing the user to manually switch regions at any time via a bottom sheet.

**2. First Chat Question (**`account_check`)

- **Coach Greeting Bubble:**
  - *"Welcome to your Smart Nutrition & Workout Coach! Before we start building your personalized plan, do you already have an account with us?"*
- **Sticky Bottom Input Area (2 Action Cards):**
  - Option 1: `[No, I'm a new user — Let's start]` (`account_check = "no"`)
  - Option 2: `[Yes, I already have an account — Log In]` (`account_check = "yes"`)

**3. Saved Data Conflict / Recovery Prompt (**`data_recovery_prompt`)

- Triggered inside the chat (or modal sheet) when:
  - **Case A:** The user logs in (from `account_check = "yes"` or later) and the backend returns an existing profile/plan (`hasCompletedOnboarding == true` or saved server data), OR
  - **Case B:** The app detects a pre-existing saved profile/plan on the device or server that conflicts with starting a new session.
- **Coach Bubble / Prompt:**
  - *"We found previously saved data and a plan on your account! Would you like to restore your saved data and go straight to the Home screen, or start fresh from the beginning?"*
- **Options:**
  - `[Restore my saved data (Go to Home)]` (`restore_data`)
  - `[Start fresh from the beginning]` (`start_fresh`)

---

**RULES & ROUTING LOGIC**

1. **App Launch Decision Tree (**`resolveStartupDestination()`):
  - **State 1 — Active Completed User:** `onboardingCompleted == true` AND valid local plan exists -> Navigate directly to **Home Screen** (`HomeScreen`).
  - **State 2 — Mid-Onboarding Resume (App Killed & Reopened):** `onboardingCompleted == false` AND `onboardingDraft.lastActiveStepId != null` AND at least 1 step answered -> Navigate to **Onboarding Chat Screen**, render all previously answered Q&A bubbles from `onboardingDraft`, and scroll smoothly to `lastActiveStepId` with a resume banner (*"Welcome back! Let's pick up right where you left off."*).
  - **State 3 — Fresh Install / No Draft:** `onboardingDraft` is empty -> Navigate to **Onboarding Chat Screen** and start at Step 0 (`account_check`).
2. **First Question (**`account_check`) Routing:
  - If user selects `No` (`"no"`):
    - Set `onboardingDraft.accountCheck = "no"`, `isAuthenticated = false`.
    - Append user bubble `"No, I'm a new user"` and advance immediately to the `name` question (`US-MOB-03`).
  - If user selects `Yes` (`"yes"`):
    - Navigate to **Login Screen** (`entrySource = "onboarding_account_check"`).
3. **Post-Login Routing Matrix (When returning from Login Screen):**
  - **Scenario 3A — Logged-in Account is NEW (**`serverProfile.onboardingCompleted == false` and no saved server plan/data):
    - Keep user authenticated (`isAuthenticated = true`, store `authToken` & `userId`).
    - Return user automatically to **Onboarding Chat Screen**.
    - Mark `account_check` as completed (`"logged_in_new_account"`), pre-fill `name` as a 1-tap suggestion if available from the social/account profile, and continue the onboarding chat from the first unanswered question.
    - Show coach confirmation bubble: *"You're logged in! Since your account is new and hasn't completed setup yet, let's finish a few quick questions to build your custom plan."*
  - **Scenario 3B — Logged-in Account has OLD Saved Data (**`serverProfile.onboardingCompleted == true` or `serverSavedData != null`):
    - Present the **Data Recovery Prompt** (`restore_data` vs. `start_fresh`):
      - If user selects `Restore saved data` (`restore_data`):
        - Download and hydrate local storage with `serverSavedData`, set `onboardingCompleted = true`, and navigate directly to **Home Screen**.
      - If user selects `Start fresh` (`start_fresh`):
        - Keep user authenticated (`isAuthenticated = true`), clear local `onboardingDraft` answers (except `accountCheck = "logged_in_restart"`), and start the onboarding chat from the `name` question. Upon completion, clicking "Start Plan" on the Summary screen will overwrite the old server data with the newly generated plan.
  - **Scenario 3C — User Presses Back on Login Screen without Logging In:**
    - Return to **Onboarding Chat Screen** at the `account_check` step so the user can choose `"No, I'm a new user"` or try logging in again.

---

**MAIN FLOW**

1. User opens the app for the first time.
2. System detects region automatically (e.g., `egypt`) and opens the Onboarding Chat Screen.
3. Coach asks the first question (`account_check`): *"Do you already have an account with us?"*
4. **Path A (New User):** User taps *"No, I'm a new user"* -> Chat records the answer and immediately displays the `name` question.
5. **Path B (Existing Account — New/Incomplete):** User taps *"Yes, I already have an account"* -> Authenticates on Login Screen -> Server indicates the account has never completed onboarding -> App returns to Onboarding Chat authenticated and continues from `name`.
6. **Path C (Existing Account — Has Saved Data):** User taps *"Yes, I already have an account"* -> Authenticates on Login Screen -> Server indicates saved data exists -> Coach asks *"Restore saved data or start fresh?"* -> User chooses either **Home Screen** (Restore) or **Onboarding Chat** (Start fresh).

---

**EDGE CASES**

- **App Killed Mid-Onboarding:** User answers up to `current_weight`, force-closes the app, and reopens it later -> App skips `account_check` and all answered steps, renders the saved chat history, and resumes directly at `goal`.
- **Offline Login Attempt:** If the user taps *"Yes, I already have an account"* while offline, the Login screen shows a clear offline message and a `[Continue as new user without logging in for now]` secondary button that sets `accountCheck = "no"` and continues onboarding locally.
- **Corrupted Local Draft JSON:** If local `onboardingDraft` fails schema validation on startup, catch the error, clear the corrupted draft key, and start cleanly at `account_check` without crashing.
- **Social Login Provides Display Name:** Pre-fill the display name as a 1-tap suggestion chip in the `name` step rather than silently skipping `name`, so the user can confirm or edit their preferred coaching name.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: First question asks about existing account**
  - **Given** a fresh install with no saved local state
  - **When** the Onboarding Chat screen loads
  - **Then** the very first question displayed is `account_check` with two options (`No, I'm a new user` and `Yes, I already have an account`).
- **Scenario 2: Selecting "No" continues onboarding chat**
  - **Given** the user is at `account_check`
  - **When** the user taps `"No, I'm a new user"`
  - **Then** the answer bubble is appended to the chat and the coach immediately asks the `name` question without requiring login.
- **Scenario 3: Selecting "Yes" and logging into a new account (never completed onboarding)**
  - **Given** the user taps `"Yes, I already have an account"` and authenticates on the Login screen
  - **When** the backend returns `onboardingCompleted == false` and no saved plan exists
  - **Then** the app keeps the user authenticated, navigates back to the Onboarding Chat screen, and continues from the first unanswered onboarding question.
- **Scenario 4: Selecting "Yes" and logging into an account with existing saved data**
  - **Given** the user authenticates on the Login screen
  - **When** the backend returns existing saved onboarding/plan data
  - **Then** the app prompts the user to choose between **Restore saved data** (which hydrates local state and navigates directly to Home) or **Start fresh** (which keeps them authenticated and starts the onboarding questions from the beginning).
- **Scenario 5: Resuming incomplete onboarding after closing the app**
  - **Given** a user answered 6 onboarding questions and closed the app before completing onboarding
  - **When** the user reopens the app
  - **Then** all 6 previous answers are restored in the chat history and the active input bar opens at question 7 (`lastActiveStepId`).

---

**ANALYTICS**

- `onboarding_started` (`auto_detected_region`, `has_existing_draft`)
- `onboarding_account_check_selected` (`choice`: `"yes"` | `"no"`)
- `onboarding_login_return` (`account_state`: `"new_account"` | `"has_saved_data"` | `"cancelled"`)
- `onboarding_data_recovery_decision` (`decision`: `"restore_data"` | `"start_fresh"`)
- `onboarding_resumed` (`resumed_at_step_id`, `completed_steps_count`)

---

## US-MOB-02: Conversational Chat Framework, Dynamic Progress, Local Persistence & In-Chat Answer Editing

> **Jira Key:** [`KAN-36`](https://abdulrahman-alaa.atlassian.net/browse/KAN-36) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a user going through the conversational onboarding, I want a fast, natural chat interface where I can see my dynamic progress, have every answer saved automatically, and tap any previous answer at any time to edit it—with the chat intelligently preserving valid downstream answers and only re-asking questions invalidated by my change.

---

**PRECONDITIONS**

- User is on the **Onboarding Chat Screen** (`US-MOB-01`).
- Local persistence engine (`onboardingDraft` store) is initialized.

---

**SCREEN AND UI DETAILS**

**1. Top Header Bar**

- **Coach Identity:** Coach Avatar + Title *"Smart Nutrition & Workout Coach"* + online status indicator dot.
- **Dynamic Progress Bar & Counter:**
  - Displays `Step X of Y` and a smooth progress fill bar (`percentage = round((currentStepIndex / totalActiveSteps) * 100)`).
  - `Y` (`totalActiveSteps`) dynamically recalculates whenever conditional branching changes (e.g., `male` vs. `female`, `nutrition_only` vs. `nutrition_and_workouts`, `home_only` vs. `gym_only`).
- **Region Badge (**`Egypt` / `Gulf` / `Levant` / `Maghreb`) + **Reset Action (**`Start Over`) with confirmation modal.

**2. Chat Stream Area (**`ScrollView` / `FlatList`)

- **Coach Message Bubbles:** Coach-side aligned, rounded corners, optional subtitle/helper hint.
- **Typing Indicator:** Animated 3-dot bubble shown for `250ms–400ms` max before rendering the next question.
- **User Answer Bubbles (Interactive & Editable):**
  - User-side aligned with distinct brand accent background.
  - Every user answer bubble includes a visible `Edit` (`✏️`) badge/icon and is tappable (`onPress -> openEditStep(stepId)`).

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
| `maternal_status` | **If changed to **`pregnant_t1`/`t2`/`t3`:<br>• If `goal == 'lose'`, clear `goal`, `target_weight`, and `goal_pace` (since weight loss is blocked in pregnancy).<br>• If `diet_type` is `'keto'` or `'intermittent_fasting'`, clear `diet_type` and `if_start_hour`.<br>**If changed to **`breastfeeding`:<br>• If `goal_pace == 'fast'` and `goal == 'lose'`, cap deficit at `-300 kcal/day` or re-prompt `goal_pace` (`slow` only).<br>• If `diet_type == 'keto'`, clear `diet_type`. |
| `height` or `current_weight` | Recalculate BMI, Ideal Weight Range (`minWeight`–`maxWeight`), and `ABW`.<br>**Invalidate **`target_weight` & `goal_pace` ONLY IF:<br>• `goal == 'lose'` and `target_weight >= newCurrentWeight`, OR<br>• `goal == 'gain'` and `target_weight <= newCurrentWeight`, OR<br>• `goal == 'muscle_gain'` and `target_weight < newCurrentWeight`.<br>Otherwise keep `target_weight` and recalculate `goal_pace` timeline (`weeks`/`months`) automatically. |
| `goal` | **If changed to **`'maintain'`: Clear `target_weight` and `goal_pace` (`target_weight = current_weight`).<br>**If changed between **`'lose'`, `'gain'`, `'muscle_gain'`: Check if existing `target_weight` violates directional rule (`lose < current`, `gain > current`, `muscle_gain >= current`). If violated (or previously `'maintain'`), clear `target_weight` and `goal_pace` and prompt `target_weight`. |
| `target_weight` | Keep `goal_pace` selection if already chosen (`slow`/`moderate`/`fast`), and automatically recalculate `weeks` & `months` for the new weight difference. If `abs(current_weight - newTargetWeight) < 0.5`, skip `goal_pace`. |
| `service_track` | **If switched to **`'nutrition_only'`: Bypass Workout Block steps (keep any previously entered workout answers cached in draft in case user switches back, or exclude from active payload). Prompt any unanswered Nutrition Block steps.<br>**If switched to **`'workouts_only'`: Bypass Nutrition Block steps and prompt any unanswered Workout Block steps.<br>**If switched to **`'nutrition_and_workouts'`: Prompt any unanswered steps in either Workout or Nutrition blocks in sequence. |
| `workout_location` | **If changed to **`'home_only'`: Clear `workout_day_split` and `workout_split` (auto-handled for home). Prompt `home_equipment` if unanswered.<br>**If changed to **`'gym_only'`: Clear `workout_day_split` and `home_equipment`. Prompt `workout_split` if `workout_days.length >= 3` and unanswered.<br>**If changed to **`'home_and_gym'`: Prompt `workout_day_split` (mapped to `workout_days`), `home_equipment`, and `workout_split` (if `workout_days.length >= 3`). |
| `workout_days` | **If **`workout_location == 'home_and_gym'`: Preserve day-location assignments for days that remain selected; require assignment for newly added days in `workout_day_split`.<br>**If **`workout_split` was already selected: Check if the selected `workout_split` is still valid for the new `workout_days.length` (`full_body`: 1–4d, `upper_lower`: 2–6d, `ppl`: 3–7d, `bro_split`: 3–6d). If `workout_days.length < 3`, clear `workout_split`. If invalid for the new count, clear `workout_split` and re-prompt. |
| `conditions` | Check if current `diet_type` is medically blocked by the newly added condition(s) (e.g., `'diabetes_t1'`, `'diabetes_t2'`, `'gout'`, `'kidney'` blocking `'keto'` or `'intermittent_fasting'`). If blocked, clear `diet_type` (and `if_start_hour` / `meals_count`) and re-prompt `diet_type`. |
| `diet_type` | **If changed to **`'intermittent_fasting'`: Clear `meals_count` and prompt `if_start_hour`.<br>**If changed to **`'balanced'`: Clear `if_start_hour` and prompt `meals_count`.<br>**If changed to any other diet:** Clear both `if_start_hour` and `meals_count`. |

**3. Local State Persistence (**`saveDraft()`):

- Save the full `onboardingDraft` object to local storage immediately after every step confirmation and after every edit:
```json
{
  "version": 2,
  "region": "egypt",
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

> **Jira Key:** [`KAN-37`](https://abdulrahman-alaa.atlassian.net/browse/KAN-37) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a user starting the onboarding questions, I want to enter my name and age quickly with support for both standard Western and Eastern Arabic digits, while the app enforces medical safety rules for minors (Under-18 blocking gate) and older adults (70+ Senior Mode).

---

**PRECONDITIONS**

- User has completed or bypassed `account_check` (`US-MOB-01`) and is on the Onboarding Chat Screen.

---

**SCREEN AND UI DETAILS**

**1. Step: **`name` (User's Preferred Name)

- **Coach Bubble:**
  - *"Welcome aboard! What name would you like me to call you?"*
- **Input Control (**`text`):
  - Text field placeholder: `"Type your name here..."`
  - Primary button: `[Confirm]`
  - If authenticated via Apple/Google and a profile display name exists, render a 1-tap suggestion chip above the input: `[Use "{socialName}"]`.

**2. Step: **`age` (User's Age in Years)

- **Coach Bubble:**
  - *"Nice to meet you, {name}! How old are you?"*
- **Input Control (**`number-with-chips`):
  - Quick-select chips: `[18]`, `[22]`, `[25]`, `[30]`, `[35]`, `[40]`, `[50]`.
  - Numeric input field (`keyboardType = "number-pad"`, placeholder `"e.g. 28"`) + `[Confirm]` button.

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

> **Jira Key:** [`KAN-38`](https://abdulrahman-alaa.atlassian.net/browse/KAN-38) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a user completing my physical profile, I want to specify my biological sex, maternal status (if applicable), height, and current weight so that the app calculates my exact BMI, Ideal Weight Range, Adjusted Body Weight (ABW), and maternal calorie/protein/hydration adjustments accurately.

---

**PRECONDITIONS**

- User has completed `age` (`>= 18`) in `US-MOB-03`.

---

**SCREEN AND UI DETAILS**

**1. Step: **`gender` (Biological Sex)

- **Coach Bubble:** *"Got it, {name}! What is your biological sex? (Required for accurate metabolic rate and daily nutrient equations)"*
- **Input Control (**`single-select` — 2 Cards):
  - `male`: `Male`
  - `female`: `Female`

**2. Conditional Step: **`maternal_status` (Shown ONLY if `gender == 'female'` AND `18 <= age <= 50`)

- **Coach Bubble:** *"Are you currently pregnant or breastfeeding? (So we can adjust your daily calories, protein, and hydration, and filter out unsafe diets or exercises)"*
- **Input Control (**`single-select` — 5 Cards):
  - `none`: `None`
  - `pregnant_t1`: `Pregnant — 1st Trimester (Months 1–3)` — Subtitle: `"Focuses on weight maintenance and blocks calorie deficits"`
  - `pregnant_t2`: `Pregnant — 2nd Trimester (Months 4–6)` — Subtitle: `"Adds +340 kcal/day and +15g protein/day"`
  - `pregnant_t3`: `Pregnant — 3rd Trimester (Months 7–9)` — Subtitle: `"Adds +450 kcal/day and +25g protein/day"`
  - `breastfeeding`: `Breastfeeding` — Subtitle: `"Adds +400 kcal/day, +20g protein/day, and +600 ml water/day"`

**3. Step: **`height` (Height in cm)

- **Coach Bubble:** *"What is your height in centimeters (cm)?"*
- **Input Control (**`number-with-chips`):
  - Quick-select chips: `[155]`, `[160]`, `[165]`, `[170]`, `[175]`, `[180]`, `[185]`.
  - Numeric input (`120` to `230` cm) + `[Confirm]`.

**4. Step: **`current_weight` (Current Body Weight in kg)

- **Coach Bubble:** *"And what is your current weight in kilograms (kg)?"*
- **Input Control (**`number-with-chips`):
  - Quick-select chips: `[55]`, `[65]`, `[75]`, `[85]`, `[95]`, `[105]`, `[120]`.
  - Numeric input (`35` to `250` kg, supports 1 decimal place e.g. `82.5`) + `[Confirm]`.

---

**CALCULATIONS, RULES & MEDICAL LOGIC**

1. **Maternal Routing & Clinical Overrides (**`maternal_status`):
  - If `gender == 'male'` OR `age > 50`: Automatically set `maternal_status = 'none'` and skip the step.
  - **Pregnancy (**`pregnant_t1`, `pregnant_t2`, `pregnant_t3`):
    - **Calorie & Protein Add-ons:**
      - `pregnant_t1`: `+0 kcal/day`, `+0g protein/day`, `+300 ml water/day`.
      - `pregnant_t2`: `+340 kcal/day`, `+15g protein/day`, `+300 ml water/day`.
      - `pregnant_t3`: `+450 kcal/day`, `+25g protein/day`, `+300 ml water/day`.
    - **Hard Safety Blocks during Pregnancy:**
      - Weight loss (`goal = 'lose'`) is **hidden/blocked** in the next step (`US-MOB-05`).
      - `keto` and `intermittent_fasting` diets are **hidden/blocked** (`US-MOB-08`).
      - High-fall-risk, supine (after T1), and heavy intra-abdominal pressure exercises are excluded (`US-MOB-07`).
  - **Breastfeeding (**`breastfeeding`):
    - **Add-ons:** `+400 kcal/day`, `+20g protein/day`, `+600 ml (+0.6L) water/day`.
    - **Safety Caps:** If user selects weight loss (`goal = 'lose'`), maximum allowed daily calorie deficit is capped at `-300 kcal/day` (to protect milk supply), and `keto` diet is blocked.
2. **Height & Weight Validation:**
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
  - **Ideal Body Weight (**`IBW` at `BMI 22`) & Adjusted Body Weight (`ABW` for Obesity `BMI >= 30`):
    - Used later for accurate protein calculation so protein is not overestimated in high-adiposity users:
$$IBW = 22 \times heightM^2$$
$$referenceWeightForProtein = \begin{cases} IBW + 0.4 \times (currentWeight - IBW) & \text{if } currentBmi \ge 30 \ currentWeight & \text{if } currentBmi < 30 \end{cases}$$

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
- **User edits **`gender` from `female` (with `pregnant_t2` selected) to `male`: `maternal_status` is reset to `'none'`, pregnancy calorie/protein add-ons are removed, and weight-loss/Keto options are unlocked.

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
  - **Then** `currentBmi` is `34.6`, `minHealthyWeight` is `53 kg`, `maxHealthyWeight` is `72 kg`, `idealMidWeight` is `63 kg`, and `referenceWeightForProtein` uses the `ABW` formula (`63.58 + 0.4 * (100 - 63.58) = 78.1 kg`).

---

**ANALYTICS**

- `onboarding_gender_selected` (`gender`: `"male"` | `"female"`)
- `onboarding_maternal_status_selected` (`status`: `"none"` | `"pregnant_t1"` | `"pregnant_t2"` | `"pregnant_t3"` | `"breastfeeding"`)
- `onboarding_measurements_submitted` (`height_cm`, `weight_kg`, `bmi`, `bmi_category`)

---

## US-MOB-05: Fitness Goal, Target Weight with Live BMI Range Warning & Weekly Goal Pace Calculator

> **Jira Key:** [`KAN-39`](https://abdulrahman-alaa.atlassian.net/browse/KAN-39) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a user setting my body transformation goal, I want the coach to recommend the healthiest goal based on my BMI, show me my personalized healthy weight range when asking for my target weight, warn me if I enter a target weight outside the healthy BMI limits (18.5–24.9) while allowing me to either adopt the nearest healthy weight or proceed with my choice, and let me choose my weekly pace with a clear timeline in weeks and months.

---

**PRECONDITIONS**

- User has completed `height` and `current_weight` (`US-MOB-04`).
- `currentBmi`, `minHealthyWeight`, `maxHealthyWeight`, and `idealMidWeight` are computed.

---

**SCREEN AND UI DETAILS**

**1. Step: **`goal` (Primary Fitness Goal)

- **Coach Bubble:**
  - Displays personalized BMI insight + question:
  - *"Your current BMI is ****{currentBmi}****, and the healthy weight range for your height ({height} cm) is between ****{minHealthyWeight} kg and {maxHealthyWeight} kg****. What is your primary goal right now?"*
- **Input Control (**`single-select` — Dynamic Options with `Recommended` Badge):
  - `lose`: `Lose Fat & Weight` *(Hidden if *`maternal_status` is `pregnant_t1`, `pregnant_t2`, or `pregnant_t3`; marked `⭐ Recommended` if `currentBmi >= 25`)
  - `muscle_gain`: `Build Muscle & Tone` *(Marked *`⭐ Recommended` if `18.5 <= currentBmi < 25` and not pregnant)
  - `gain`: `Gain Weight (Healthy Mass)` *(Marked *`⭐ Recommended` if `currentBmi < 18.5`)
  - `maintain`: `Maintain Weight & General Health` *(Marked *`⭐ Recommended` if pregnant)

**2. Conditional Step: **`target_weight` (Shown ONLY if `goal != 'maintain'`)

- **Coach Bubble (Explicitly shows the user's Ideal Weight Range):**
  - *"Awesome! What target weight (in kg) would you like to reach?"*
  - **Highlighted Info Banner inside Bubble:**
*"Healthy Ideal Weight Range for your height ({height} cm): ****{minHealthyWeight} kg – {maxHealthyWeight} kg**** (Ideal midpoint: ~****{idealMidWeight} kg****)."*
- **Input Control (**`number-with-chips`):
  - Dynamically generated smart chips (`getTargetWeightChips(state)`):
    - For `lose`: up to 4 chips below `current_weight` (e.g., `idealMidWeight`, `maxHealthyWeight`, `currentWeight - 5`, `currentWeight - 10`, filtered to `< currentWeight` and `>= 35`).
    - For `gain` / `muscle_gain`: up to 4 chips `>= current_weight` (e.g., `minHealthyWeight`, `idealMidWeight`, `currentWeight + 5`, `currentWeight + 8`).
  - Numeric input (`35` to `220` kg) + `[Confirm]`.

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
  - *"At what weekly pace would you like to reach ****{target_weight} kg**** (a difference of ****{weightDiff} kg****)?"*
- **Input Control (**`single-select` — Dynamic Cards with Calculated Timeline):
  - **Option 1: **`slow` (`Steady & Easy — 0.25 to 0.5 kg/week`)
    - Subtitle: `"Easiest adherence with minimal hunger — Est. timeline: ~{slowWeeks} weeks (~{slowMonths} months)"`
  - **Option 2: **`moderate` (`Balanced & Sustainable ⭐ (Recommended) — {modRateLabel} kg/week`) *(Hidden if *`maternal_status == 'breastfeeding'` and `goal == 'lose'`, where only `slow` `-300 kcal` is allowed)
    - Subtitle: `"Optimal balance between speed and muscle retention — Est. timeline: ~{modWeeks} weeks (~{modMonths} months)"`
  - **Option 3: **`fast` (`Fast & Intensive — 1.0 kg/week`) *(Shown ONLY for *`goal == 'lose'` when `seniorMode == false` and `maternal_status == 'none'`)
    - Subtitle: `"Requires high discipline — Est. timeline: ~{fastWeeks} weeks (~{fastMonths} months)"`

---

**CALCULATIONS & VALIDATION LOGIC**

1. **Directional Validation on **`target_weight`:
  - If `goal == 'lose'` and `target_weight >= current_weight`:
    - Block & show inline coach error: *"Since your goal is fat loss, your target weight must be lower than your current weight ({current_weight} kg)."*
  - If `goal == 'gain'` and `target_weight <= current_weight`:
    - Block & show inline coach error: *"Since your goal is weight gain, your target weight must be higher than your current weight ({current_weight} kg)."*
  - If `goal == 'muscle_gain'` and `target_weight < current_weight`:
    - Block & show inline coach error: *"For muscle gain, your target weight must be equal to or greater than your current weight ({current_weight} kg). If you want to lose weight first, you can edit your goal to Lose Fat."*
2. **Pace Rates, Calorie Delta & Timeline Equations (**`computeTimeline(currentWeight, targetWeight, goal, pace)`):
  - `weightDiff = Math.abs(currentWeight - targetWeight)`
  - **Weekly Rate (**`kgPerWeek`) & Daily Calorie Adjustment (`dailyCalorieDelta`):
    - **When **`goal == 'lose'`:
      - `slow`: `kgPerWeek = 0.4`, `dailyCalorieDelta = -300 kcal`
      - `moderate`: `kgPerWeek = 0.7`, `dailyCalorieDelta = -500 kcal`
      - `fast`: `kgPerWeek = 1.0`, `dailyCalorieDelta = -750 kcal`
    - **When **`goal == 'gain'` or `goal == 'muscle_gain'`:
      - `slow`: `kgPerWeek = 0.25`, `dailyCalorieDelta = +250 kcal`
      - `moderate`: `kgPerWeek = 0.45`, `dailyCalorieDelta = +400 kcal`
      - `fast` (fallback): `kgPerWeek = 0.6`, `dailyCalorieDelta = +500 kcal`
    - **When **`goal == 'maintain'` OR `weightDiff < 0.5`:
      - `dailyCalorieDelta = 0` (except `muscle_gain` at same weight recomposition: `+150 kcal`).
  - **Expected Duration Calculation:**
$$expectedWeeks = \max\left(1, \text{round}\left(\frac{weightDiff}{kgPerWeek}\right)\right)$$
$$expectedMonths = \max\left(0.5, \text{round1}\left(\frac{expectedWeeks}{4.33}\right)\right)$$

---

**MAIN FLOW**

1. Coach displays current BMI and healthy weight range (`57–76 kg`) and asks `goal`.
2. User selects `lose` (`Lose Fat & Weight`).
3. Coach asks `target_weight`, prominently displaying `"Healthy Ideal Weight Range for your height: 57 - 76 kg"`.
4. User enters `52` kg (`targetBmi = 17.0 < 18.5`).
5. System displays the **Live BMI Boundary Warning** explaining that `52 kg` is below the safe minimum of `57 kg` (`BMI 18.5`), offering `[Adopt Safe Healthy Weight (57 kg)]` or `[Continue with 52 kg anyway]`.
6. User taps `[Adopt Safe Healthy Weight (57 kg)]` (or chooses to proceed with `52 kg`).
7. Coach asks `goal_pace` showing exact weeks and months for each pace option.
8. User selects `moderate` (`Balanced & Sustainable ⭐`) and advances to `service_track` (`US-MOB-06`).

---

**EDGE CASES**

- **Goal is **`maintain`: Both `target_weight` and `goal_pace` are skipped automatically; `target_weight` is set equal to `current_weight`.
- **Goal is **`muscle_gain` and user enters `target_weight == current_weight` (Body Recomposition): Allowed! Since `weightDiff == 0 < 0.5`, `goal_pace` is skipped automatically and a mild `+150 kcal` lean recomposition adjustment is applied.
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
- **Scenario 3: Directional mismatch is blocked**
  - **Given** `current_weight = 80 kg` and `goal = "lose"`
  - **When** the user enters `target_weight = 85 kg`
  - **Then** submission is blocked with an inline error explaining that target weight for fat loss must be less than `80 kg`.

---

**ANALYTICS**

- `onboarding_goal_selected` (`goal`, `was_recommended`: `boolean`, `current_bmi`)
- `onboarding_target_weight_submitted` (`target_weight`, `target_bmi`, `triggered_bmi_warning`: `"underweight"` | `"overweight"` | `"none"`, `warning_resolution`: `"adopted_healthy"` | `"overridden"` | `"n/a"`)
- `onboarding_goal_pace_selected` (`pace`, `expected_weeks`, `daily_calorie_delta`)

---

## US-MOB-06: Service Track Selection & Workout Setup (Fitness Level, Location-First Routing, Custom Weekdays & Home Equipment)

> **Jira Key:** [`KAN-40`](https://abdulrahman-alaa.atlassian.net/browse/KAN-40) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a user customizing my coaching program, I want to choose whether I want Nutrition + Workouts, Nutrition Only, or Workouts Only, and if my plan includes workouts, I want to specify my fitness level, my training location FIRST (`Gym`, `Home`, or `Mix`), the exact days of the week I want to train, per-day location assignment (if Mix), and available home equipment (if training at home).

---

**PRECONDITIONS**

- User has completed the Goal block (`US-MOB-05`).

---

**SCREEN AND UI DETAILS**

**1. Step: **`service_track` (Coaching Track Selection)

- **Coach Bubble:** *"What would you like your custom plan to include, {name}?"*
- **Input Control (**`single-select` — 3 Cards):
  - `nutrition_and_workouts`: `Nutrition + Workouts ⭐ (Recommended)` — Subtitle: `"Calculated meal plan + tailored workout schedule for fastest results"`
  - `nutrition_only`: `Nutrition Plan Only` — Subtitle: `"Daily meal plan, calories, and macros without a workout schedule"`
  - `workouts_only`: `Workout Plan Only` — Subtitle: `"Structured training program without a meal plan"`

**2. Conditional Step: **`fitness_level` (Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"What is your current fitness and training experience level?"*
- **Input Control (**`single-select` — 3 Cards):
  - `beginner`: `Beginner` — Subtitle: `"New to training or returning after a long break (0.8x volume multiplier)"`
  - `intermediate`: `Intermediate ⭐` — Subtitle: `"Training consistently for several months with good form (1.0x volume multiplier)"`
  - `advanced`: `Advanced` — Subtitle: `"Training consistently for 1+ years with high intensity (1.2x volume multiplier)"`

**3. Conditional Step: **`workout_location` (Asked BEFORE Days & Split; Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"Where do you prefer to work out? (Asking this first so we tailor your equipment and training split to your location)"*
- **Input Control (**`single-select` — 3 Cards):
  - `gym_only`: `Gym Only` — Subtitle: `"Full access to machines, barbells, dumbbells, and cables"`
  - `home_only`: `Home Only` — Subtitle: `"Home workouts tailored to your available equipment"`
  - `home_and_gym`: `Mix (Home & Gym)` — Subtitle: `"Combine gym days and home days across your week"`

**4. Conditional Step: **`workout_days` (Exact Weekday Picker; Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"Which exact days of the week do you want to work out? (Pick the specific days that fit your schedule)"*
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

**5. Conditional Step: **`workout_day_split` (Shown ONLY if `workout_location == 'home_and_gym'`)

- **Coach Bubble:** *"Since you chose a Mix of Home & Gym, choose where you will train on each of your selected days:"*
- **Input Control (**`day-location-split`):
  - Renders one row per selected day in `workout_days` (e.g., `Saturday`, `Monday`, `Wednesday`), each with a 2-segment toggle:
    - `[Gym]` vs. `[Home]`
  - Default initial assignment: alternating Gym/Home, editable per day.
  - Confirm Button: `[Confirm Day Locations]`.

**6. Conditional Step: **`home_equipment` (Shown ONLY if `workout_location == 'home_only'` OR `workout_location == 'home_and_gym'`)

- **Coach Bubble:** *"What equipment do you have available at home? (Select all that apply, or choose Bodyweight Only)"*
- **Input Control (**`multi-select` — 6 Options):
  - `none`: `Bodyweight Only (No Equipment)` *(Mutually exclusive with all other options)*
  - `dumbbells`: `Dumbbells`
  - `bands`: `Resistance Bands`
  - `pullup_bar`: `Doorway Pull-up Bar`
  - `kettlebell`: `Kettlebell`
  - `bench`: `Flat/Adjustable Bench or Sturdy Chair`

---

**RULES & LOGIC**

1. **Why **`workout_location` is Asked Before `workout_days` and `workout_split`:
  - Asking `workout_location` first ensures that if the user chooses `home_only`, the flow immediately knows to ask `home_equipment` and **skip** the gym-oriented `workout_split` question (`US-MOB-07`), keeping the conversation concise and logical.
2. **Service Track Branching:**
  - If `service_track == 'nutrition_only'`: Skip all Workout steps (`fitness_level`, `workout_location`, `workout_days`, `workout_day_split`, `home_equipment`, `workout_split`, `session_duration`, `injuries`) and jump directly to `activity` (`US-MOB-08`).
3. **Exact Weekday Indexing:**
  - Store `workout_days` as a sorted array of day indices `0..6` where `0 = Saturday`, `1 = Sunday`, ..., `6 = Friday`.
  - Any day index in `0..6` NOT in `workout_days` is rendered as a scheduled Rest/Recovery day (`Rest & Recovery`) in the 7-day workout schedule.
4. **Mutual Exclusion on **`home_equipment`:
  - Tapping `none` (`Bodyweight Only`) deselects `dumbbells`, `bands`, `pullup_bar`, `kettlebell`, `bench`.
  - Tapping any equipment item automatically deselects `none`.
5. **Fitness Level Volume Multiplier:**
  - `beginner` = `0.8x` set volume; `intermediate` = `1.0x` set volume; `advanced` = `1.2x` set volume.

---

**MAIN FLOW**

1. User selects `service_track = "nutrition_and_workouts"`.
2. User selects `fitness_level = "intermediate"`.
3. User selects `workout_location = "home_only"`.
4. User taps `Saturday`, `Monday`, `Wednesday`, `Thursday` (`[0, 2, 4, 5]`) in `workout_days` and confirms `4 days`.
5. `workout_day_split` is skipped (since location is not `home_and_gym`).
6. Coach asks `home_equipment`; user selects `dumbbells` + `bands` and taps Confirm.
7. Chat advances to `US-MOB-07` (where `workout_split` will be automatically skipped because `workout_location == 'home_only'`).

---

**EDGE CASES**

- **User selects **`home_and_gym` and assigns ALL days to `Home` inside `workout_day_split`:
  - Show a gentle inline hint or automatically normalize behavior so `home_equipment` is still asked and home exercises are generated for all selected days.
- **User selects all 7 days (**`[0,1,2,3,4,5,6]`):
  - Allowed, and show a supportive coach tip: *"Great dedication! Remember that muscles grow during recovery, so we will include lighter active-recovery sessions to prevent overtraining."*

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Nutrition-only track skips all workout questions**
  - **Given** the user is at `service_track`
  - **When** the user selects `nutrition_only`
  - **Then** all workout steps are skipped and the next question is `activity` (`US-MOB-08`).
- **Scenario 2: User picks exact weekdays rather than just a number**
  - **Given** the user is at `workout_days`
  - **When** the user toggles `Sunday (1)`, `Tuesday (3)`, and `Thursday (5)` and confirms
  - **Then** `state.workoutDays` is stored as `[1, 3, 5]` and the generated 7-day plan places workouts on Sunday, Tuesday, and Thursday and Rest on Saturday, Monday, Wednesday, and Friday.
- **Scenario 3: Mutual exclusion in **`home_equipment`
  - **Given** the user is at `home_equipment` and has selected `dumbbells` and `bands`
  - **When** the user taps `none` (`Bodyweight Only`)
  - **Then** `dumbbells` and `bands` are automatically deselected and only `["none"]` remains selected.

---

**ANALYTICS**

- `onboarding_service_track_selected` (`track`: `"nutrition_and_workouts"` | `"nutrition_only"` | `"workouts_only"`)
- `onboarding_workout_location_selected` (`location`: `"gym_only"` | `"home_only"` | `"home_and_gym"`)
- `onboarding_workout_days_selected` (`days_count`: `number`, `selected_day_indices`: `number[]`)
- `onboarding_home_equipment_selected` (`equipment`: `string[]`)

---

## US-MOB-07: Smart Hybrid Workout Split Selection, Session Duration & Injury-Safe Exercise Filtering

> **Jira Key:** [`KAN-41`](https://abdulrahman-alaa.atlassian.net/browse/KAN-41) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a user whose program includes workouts, I want the app to ask me for my preferred training split ONLY when it is relevant (Gym or Mix with 3+ training days, filtered by my selected day count), let me pick my preferred workout session duration, and screen for joint or postpartum injuries so that unsafe exercises are automatically substituted with safe alternatives.

---

**PRECONDITIONS**

- `service_track != 'nutrition_only'` and user has completed `workout_location`, `workout_days`, and (if applicable) `workout_day_split` / `home_equipment` (`US-MOB-06`).

---

**SCREEN AND UI DETAILS**

**1. Conditional Step: **`workout_split` (Shown ONLY if `workout_location != 'home_only'` AND `workout_days.length >= 3`)

- **Coach Bubble:**
  - *"For your ****{workout_days.length} training days/week****, how would you like to structure your workout split?"*
- **Input Control (**`single-select` — Dynamically Filtered by `daysCount = workout_days.length`):
  - `auto`: `Coach's Smart Choice ⭐ (Recommended)` — *Always shown. Automatically assigns the scientifically optimal split for *`daysCount` and `fitness_level`:
    - Subtitle dynamically shows what it resolves to (e.g., for 3 days: `"Push / Pull / Legs (or Full Body for beginners)"`; for 4 days: `"Upper / Lower Split (2x/week frequency)"`; for 5 days: `"Push / Pull / Legs + Upper / Lower"`).
  - `full_body`: `Full Body Split` — *Shown ONLY when *`1 <= daysCount <= 4`
    - Subtitle: `"Trains all major muscle groups in each session — Ideal for 2 to 3 days/week"`
  - `upper_lower`: `Upper / Lower Split` — *Shown ONLY when *`2 <= daysCount <= 6`
    - Subtitle: `"Alternates upper-body and lower-body sessions — Ideal for 4 days/week"`
  - `ppl`: `Push / Pull / Legs (PPL)` — *Shown ONLY when *`3 <= daysCount <= 7`
    - Subtitle: `"Separates pushing, pulling, and leg muscles — Ideal for 3, 5, or 6 days/week"`
  - `bro_split`: `Body-Part Split (Bro Split)` — *Shown ONLY when *`3 <= daysCount <= 6`
    - Subtitle: `"Focuses on 1–2 specific muscle groups per day (Chest, Back, Shoulders, Arms, Legs)"`

**2. Conditional Step: **`session_duration` (Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"How many minutes would you like each workout session to last?"*
- **Input Control (**`single-select` — 5 Cards):
  - `20`: `20 Minutes (Express — 4 exercises)`
  - `30`: `30 Minutes (Compact — 5 exercises)`
  - `45`: `45 Minutes ⭐ (Recommended — 6 exercises)`
  - `60`: `60 Minutes (Full Session — 7 exercises)`
  - `90`: `90 Minutes (Extended — 8 exercises)`

**3. Conditional Step: **`injuries` (Shown ONLY if `service_track != 'nutrition_only'`)

- **Coach Bubble:** *"Do you have any current joint pain or injuries we should protect during workouts? (Select all that apply, or choose No Injuries)"*
- **Input Control (**`multi-select`):
  - `none`: `No Injuries (100% Ready)` *(Mutually exclusive with all injury items)*
  - `knee`: `Knee Pain / Injury`
  - `lower_back`: `Lower Back Pain / Disc Issue`
  - `shoulder`: `Shoulder Pain / Impingement`
  - `neck`: `Neck / Cervical Pain`
  - `wrist`: `Wrist / Carpal Tunnel Pain`
  - `ankle`: `Ankle Instability / Sprain`
  - `elbow`: `Elbow Pain (Tennis / Golfer's Elbow)`
  - `hip`: `Hip Tightness / Pain`
  - `diastasis_recti`: `Postpartum Diastasis Recti (Abdominal Separation)` *(Shown ONLY when *`gender == 'female'`)

---

**RULES, SPLIT ENGINE & INJURY FILTERING LOGIC**

1. **When **`workout_split` is Automatically Skipped:
  - **Condition A (**`workout_location == 'home_only'`): Skipped automatically (`workout_split = 'auto'`), because home workouts are structured around available home equipment and full-body/upper-lower metabolic templates rather than gym machine splits.
  - **Condition B (**`workout_days.length <= 2`): Skipped automatically (`workout_split = 'full_body'`), because training 1–2 days/week scientifically requires Full Body sessions to hit every muscle group weekly.
2. `auto` Split Resolution Algorithm (`resolveWorkoutSplit(workoutSplit, daysCount, fitnessLevel, workoutLocation)`):
  - If `workoutSplit != 'auto'` and valid for `daysCount`, use `workoutSplit`.
  - If `workoutSplit == 'auto'`:
    - `daysCount <= 2` -> `'full_body'`
    - `daysCount == 3` -> If `fitnessLevel == 'beginner'` OR `workoutLocation == 'home_only'` then `'full_body'`, else `'ppl'`
    - `daysCount == 4` -> `'upper_lower'`
    - `daysCount >= 5` -> `'ppl'` (For 5 days: Push, Pull, Legs, Upper, Lower; For 6 days: Push, Pull, Legs, Push, Pull, Legs)
3. **Session Duration to Exercise Count Mapping (**`getExerciseCountForDuration(minutes)`):
  - `20 min` -> `4` exercises/session
  - `30 min` -> `5` exercises/session
  - `45 min` -> `6` exercises/session
  - `60 min` -> `7` exercises/session
  - `90 min` -> `8` exercises/session
4. **Injury Contraindication & Safe Substitution Matrix:**
  - `knee`: Excludes deep barbell squats, jumping lunges, leg extensions, box jumps -> Substitutes with glute bridges, hip thrusts, Romanian deadlifts, supported box squats.
  - `lower_back`: Excludes conventional deadlifts, bent-over barbell rows, good mornings, unsupported sit-ups -> Substitutes with chest-supported rows, lat pulldowns, machine leg press/bridges, bird-dogs.
  - `shoulder`: Excludes upright rows, behind-the-neck presses, heavy overhead barbell presses, dips -> Substitutes with neutral-grip dumbbell presses, lateral raises in scapular plane, face pulls.
  - `wrist`: Excludes straight-bar curls, front squats, standard flat-palm push-ups -> Substitutes with neutral-grip hammer curls, knuckle/handle push-ups, machine/cable variations.
  - `ankle`: Excludes jump rope, plyometrics, standing calf raises, walking lunges -> Substitutes with seated exercises, machine leg curl/extension, floor core work.
  - `diastasis_recti` (or `maternal_status` is `pregnant_*`): Excludes crunches, sit-ups, leg raises, front planks, heavy Valsalva maneuvers -> Substitutes with transverse abdominis breathing, pelvic tilts, heel slides, bird-dogs.

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

> **Jira Key:** [`KAN-42`](https://abdulrahman-alaa.atlassian.net/browse/KAN-42) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a user whose program includes nutrition, I want to specify my daily non-exercise activity level, chronic medical conditions, preferred diet school (filtered for my medical safety), meal timing or daily meal count, grocery budget, and food exclusions/allergies so that my meal plan is 100% medically safe, affordable, and tailored to my regional cuisine.

---

**PRECONDITIONS**

- `service_track != 'workouts_only'` and user has completed the Goal block (`US-MOB-05`) and (if applicable) the Workout block (`US-MOB-06` & `US-MOB-07`).

---

**SCREEN AND UI DETAILS**

**1. Step: **`activity` (Daily Non-Workout Activity Level)

- **Coach Bubble:** *"Outside of workouts, how active is your typical daily routine and job?"*
- **Input Control (**`single-select` — 4 Cards):
  - `sedentary`: `Sedentary / Desk Job (1.2x)` — Subtitle: `"Mostly sitting, office/computer work, under 4,000 steps/day"`
  - `light`: `Lightly Active (1.375x)` — Subtitle: `"Light daily movement, teaching, housework, 4,000–7,500 steps/day"`
  - `moderate`: `Moderately Active (1.55x)` — Subtitle: `"On your feet most of the day, field work, 7,500–10,000 steps/day"`
  - `active`: `Very Active / Physical Job (1.725x)` — Subtitle: `"Heavy manual labor or 10,000+ steps/day outside workouts"`

**2. Step: **`conditions` (Clinical & Metabolic Health Conditions)

- **Coach Bubble:** *"Do you have any health or metabolic conditions we should tailor your nutrition around? (Select all that apply, or choose None)"*
- **Input Control (**`multi-select` — 12 Options):
  - `none`: `None (No Health Conditions)` *(Mutually exclusive with all clinical options)*
  - `insulin_resistance`: `Insulin Resistance / Prediabetes`
  - `diabetes_t2`: `Type 2 Diabetes`
  - `diabetes_t1`: `Type 1 Diabetes`
  - `pcos`: `PCOS (Polycystic Ovary Syndrome)` *(Shown ONLY when *`gender == 'female'`)
  - `hypothyroid`: `Hypothyroidism (Underactive Thyroid)`
  - `hypertension`: `High Blood Pressure (Hypertension)`
  - `cholesterol`: `High Cholesterol / Triglycerides`
  - `ibs`: `IBS / Sensitive Colon`
  - `celiac`: `Celiac Disease / Gluten Intolerance`
  - `gout`: `Gout / High Uric Acid`
  - `kidney`: `Chronic Kidney Sensitivity / Mild Renal Issue`

**3. Step: **`diet_type` (Diet School Selection — Dynamically Filtered by Medical Safety)

- **Coach Bubble:** *"Which nutrition style do you prefer? (We have highlighted the best fit for your body and automatically hidden any unsafe options)"*
- **Input Control (**`single-select` — Up to 9 Diet Schools):
  - `balanced`: `Balanced Local Cuisine ⭐` — `"All food groups in smart portions from your local kitchen"`
  - `low_carb`: `Low Carb (Moderate Carbohydrate Reduction)` — `"Reduces sugars and refined starches for steady blood sugar and fat loss"`
  - `high_protein`: `High Protein Athlete` — `"Maximizes muscle retention, recovery, and satiety"`
  - `intermittent_fasting`: `Intermittent Fasting (16:8)` — `"16-hour fasting window + 8-hour eating window"`
  - `keto`: `Ketogenic Diet (Strict Keto)` — `"70% healthy fats, 25% protein, 5% net carbs"`
  - `mediterranean`: `Mediterranean Diet` — `"Heart-healthy olive oil, fish, legumes, vegetables, and whole grains"`
  - `dash`: `DASH Diet (Blood Pressure & Heart Friendly)` — `"Low sodium, potassium-rich whole foods"`
  - `vegetarian`: `Vegetarian (Plant-Based + Dairy & Eggs)` — `"No meat, poultry, or fish"`
  - `vegan`: `100% Vegan (Strictly Plant-Based)` — `"No animal products of any kind"`

**4. Conditional Step: **`if_start_hour` (Shown ONLY if `diet_type == 'intermittent_fasting'`)

- **Coach Bubble:** *"For your 16:8 Intermittent Fasting schedule, what time do you prefer to eat your first meal (break your fast)?"*
- **Input Control (**`single-select` — 4 Time Windows):
  - `10`: `10:00 AM (Eating window: 10:00 AM – 6:00 PM)`
  - `12`: `12:00 PM ⭐ (Eating window: 12:00 PM – 8:00 PM)`
  - `14`: `2:00 PM (Eating window: 2:00 PM – 10:00 PM)`
  - `16`: `4:00 PM (Eating window: 4:00 PM – 12:00 AM)`

**5. Conditional Step: **`meals_count` (Shown ONLY if `diet_type == 'balanced'`)

- **Coach Bubble:** *"How many meals and snacks would you like per day?"*
- **Input Control (**`single-select` — 4 Options):
  - `2`: `2 Main Meals per Day` — `"Larger portions, minimal prep time"`
  - `3`: `3 Main Meals per Day ⭐ (Recommended)` — `"Breakfast, Lunch, and Dinner"`
  - `4`: `3 Main Meals + 1 Snack (4 Total)` — `"Ideal for afternoon hunger control"`
  - `5`: `3 Main Meals + 2 Snacks (5 Total)` — `"Great for high calorie targets or muscle gain"`

**6. Step: **`budget` (Grocery Budget Level)

- **Coach Bubble:** *"What grocery budget level suits you best so we pick realistic ingredients?"*
- **Input Control (**`single-select` — 3 Cards):
  - `low`: `Economic / Budget-Friendly` — `"Focuses on eggs, legumes, cottage/local cheese, oats, chicken, and seasonal produce"`
  - `medium`: `Moderate / Standard ⭐ (Recommended)` — `"Balanced variety of poultry, red meat, fish, dairy, and everyday groceries"`
  - `high`: `Premium / Open Budget` — `"Includes salmon, steak, nuts, avocado, berries, and specialty items"`

**7. Step: **`allergies` (Food Exclusions & Allergies)

- **Coach Bubble:** *"Lastly, are there any foods you are allergic to or strongly dislike so we exclude them completely?"*
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
  - `Spicy`: `Spicy / Chili Foods`

---

**CLINICAL DIET FILTERING & NUTRITION LOGIC**

1. **Medical Diet Contraindication Rules (**`getAvailableDietOptions(state)`):
  - `keto` is HIDDEN/BLOCKED when ANY of the following apply:
    - `maternal_status` is `pregnant_t1`, `pregnant_t2`, `pregnant_t3`, or `breastfeeding`
    - `conditions` includes `diabetes_t1`, `diabetes_t2`, `gout`, or `kidney`
    - `goal == 'gain'` (weight gain requires adequate carbohydrates)
  - `intermittent_fasting` is HIDDEN/BLOCKED when ANY of the following apply:
    - `maternal_status` is `pregnant_t1`, `pregnant_t2`, or `pregnant_t3`
    - `conditions` includes `diabetes_t1` or `diabetes_t2` (hypoglycemia risk)
    - `goal == 'gain'`
  - `high_protein` is HIDDEN/BLOCKED when:
    - `conditions` includes `kidney` (caps protein at `<= 1.0–1.2 g/kg` to avoid renal hyperfiltration).
2. **Smart Clinical Diet Recommendations (**`⭐ Recommended` Badge):
  - If `conditions` includes `insulin_resistance`, `diabetes_t2`, or `pcos` -> Recommend `low_carb` (`⭐`).
  - If `conditions` includes `hypertension` -> Recommend `dash` (`⭐`).
  - If `conditions` includes `cholesterol` -> Recommend `mediterranean` (`⭐`).
  - Otherwise -> Recommend `balanced` (`⭐`).
3. **Automatic Ingredient-Level Clinical Filters (**`clinicalIngredientFilters`):
  - `celiac` -> Auto-injects `gluten` exclusion even if user doesn't manually toggle `gluten` in `allergies`.
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

## US-MOB-09: Plan Summary Screen, Complete Mathematical Equations & Dual-Path "Start Plan" Handoff (Server Sync vs. Login)

> **Jira Key:** [`KAN-43`](https://abdulrahman-alaa.atlassian.net/browse/KAN-43) | **Parent Epic:** [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | **Priority:** `Medium` | **Labels:** `MVP`, `mobile-v2`, `onboarding`, `production-v2`

**STORY**

As a user who has answered all onboarding questions, I want to review a comprehensive Summary Screen with a live numerical preview of my calculated daily calories, macronutrients, hydration, workout schedule, and expected transformation timeline, be able to edit any section in 1 tap, and tap "Start My Plan" so that my plan either syncs immediately to the server (if I am already logged in) or routes me to the Login screen first before syncing and entering the Home screen.

---

**PRECONDITIONS**

- All active onboarding steps (`getActiveSteps(state)`) have been answered.
- The calculation engine (`computePlanSummary(state)`) has all required inputs.

---

**SCREEN AND UI DETAILS**

**1. Summary Header & Region Switcher**

- **Title:** *"Your Personalized Plan is Ready, {name}!"*
- **Region Selector Pill:** `[Region: Egypt / Gulf / Levant / Maghreb ▾]` — Changing the region immediately regenerates regional dish names in the meal plan preview.

**2. Live Numerical Preview Cards (Hero Metrics Grid)**

- **Card 1 — Body & Goal Timeline:**
  - Current Weight (`{current_weight} kg`, `BMI {currentBmi}`) -> Target Weight (`{target_weight} kg`, `BMI {targetBmi}`)
  - Healthy Ideal Weight Range Badge: `{minHealthyWeight} – {maxHealthyWeight} kg` *(If *`bmiWarningOverride == true`, show subtle amber badge: `"Custom Target Outside Standard BMI"`)
  - Expected Timeline: `{expectedWeeks} Weeks (~{expectedMonths} Months)` at `{kgPerWeek} kg/week`.
- **Card 2 — Daily Nutrition & Hydration Targets *****(Shown if ***`service_track != 'workouts_only'`):
  - **Target Daily Calories:** `{targetCalories} kcal / day` *(with TDEE *`{tdee} kcal` & daily delta `{dailyCalorieDelta} kcal` subtitle)
  - **Daily Macros:**
    - **Protein:** `{proteinGrams}g` (`{proteinPct}%`)
    - **Carbs:** `{carbsGrams}g` (`{carbsPct}%`)
    - **Fats:** `{fatsGrams}g` (`{fatsPct}%`)
  - **Daily Water Intake:** `{waterLiters} L / day` (`~{waterCups} cups`)
- **Card 3 — Weekly Training Blueprint *****(Shown if ***`service_track != 'nutrition_only'`):
  - **Location & Split:** `{workoutLocationLabel}` • `{resolvedSplitLabel}`
  - **Schedule:** `{workoutDays.length} Days/Week` (`{selectedWeekdayNames}`) • `{session_duration} min/session` (`{exercisesPerSession} exercises`)
  - **Safety Filters Active:** Lists any active injury protections (`knee`, `lower_back`, etc.) or `Senior Safety Mode`.

**3. Section-Level Quick Edit Links (**`[Edit ✏️]`)

- Grouped summary rows with 1-tap `[Edit]` buttons that open the corresponding step's Edit Bottom Sheet (`US-MOB-02`):
  - **Personal & Body Measurements** (`name`, `age`, `gender`, `maternal_status`, `height`, `current_weight`)
  - **Goal & Pace** (`goal`, `target_weight`, `goal_pace`)
  - **Workout Preferences** (`service_track`, `fitness_level`, `workout_location`, `workout_days`, `workout_split`, `session_duration`, `injuries`)
  - **Nutrition Preferences** (`activity`, `conditions`, `diet_type`, `meals_count`/`if_start_hour`, `budget`, `allergies`)

**4. Sticky Bottom Primary CTA**

- Button Label:
  - If `isAuthenticated == true`: `[Start My Plan & Sync to Account]`
  - If `isAuthenticated == false`: `[Continue to Log In & Start My Plan]`

---

**COMPLETE MATHEMATICAL EQUATIONS & ENGINE SPECIFICATION**

All mobile developers MUST implement these exact deterministic formulas so mobile and web produce identical numbers:

**1. Resting Energy Expenditure (**`REE` — Mifflin–St Jeor Equation):

- **Male:**
$$REE = (10 \times currentWeight) + (6.25 \times heightCm) - (5 \times age) + 5$$
- **Female:**
$$REE = (10 \times currentWeight) + (6.25 \times heightCm) - (5 \times age) - 161$$
- **Hypothyroid Adjustment:** If `conditions` includes `'hypothyroid'`, multiply $REE$ by $0.95$.

**2. Total Daily Energy Expenditure (**`TDEE`):

- **Base Activity Multiplier (**`activityMultiplier`):
  - `sedentary` = $1.2$, `light` = $1.375$, `moderate` = $1.55$, `active` = $1.725$
- **Workout Frequency Bonus (**`workoutBonus`):
  - If `service_track != 'nutrition_only'` and `workout_days.length > 0`, add:
$$workoutBonus = \min(0.15, workoutDaysCount \times 0.025)$$
  - Total Multiplier = $\min(1.9, activityMultiplier + workoutBonus)$
$$TDEE = \text{round}(REE \times \text{Total Multiplier})$$

**3. Daily Target Calories (**`targetCalories`) & Clinical Safety Floors:

- Start with:
$$rawCalories = TDEE + dailyCalorieDelta + maternalCalorieAddon$$
*(where *`maternalCalorieAddon` is `+340` for `pregnant_t2`, `+450` for `pregnant_t3`, `+400` for `breastfeeding`, `0` otherwise).
- **Enforce Minimum Safe Calorie Floors (**`minCalorieFloor`):
  - `gender == 'male'`: **$1500\text{ kcal/day}$**
  - `gender == 'female'` (non-pregnant/non-breastfeeding): **$1200\text{ kcal/day}$**
  - `pregnant_t1` / `pregnant_t2` / `pregnant_t3`: **$1800\text{ kcal/day}$**
  - `breastfeeding`: **$1600\text{ kcal/day}$**
$$targetCalories = \max(minCalorieFloor, \text{roundToNearest10}(rawCalories))$$

**4. Macronutrient Calculation (**`proteinGrams`, `fatsGrams`, `carbsGrams`):

- **Reference Weight for Protein (**`refWeight`):
  - If $currentBmi \ge 30$: $refWeight = (22 \times heightM^2) + 0.4 \times (currentWeight - 22 \times heightM^2)$ (`ABW`).
  - Else: $refWeight = currentWeight$.
- **Protein Factor (**`g/kg` of `refWeight`):
  - `keto`: $1.6\text{ g/kg}$
  - `high_protein` or `goal == 'muscle_gain'`: $2.0\text{ g/kg}$ ($2.2\text{ g/kg}$ if `advanced` workout level)
  - `goal == 'lose'`: $1.8\text{ g/kg}$
  - `goal == 'gain'`: $1.6\text{ g/kg}$
  - `goal == 'maintain'`: $1.4\text{ g/kg}$
  - **Clinical Overrides on Protein Factor:**
    - If `seniorMode == true` (`age >= 70`): $\max(proteinFactor, 1.2\text{ g/kg})$.
    - If `conditions` includes `'kidney'`: $\min(proteinFactor, 1.1\text{ g/kg})$.
  - Add Maternal Protein Add-on (`+15g` in `pregnant_t2`, `+25g` in `pregnant_t3`, `+20g` in `breastfeeding`):
$$proteinGrams = \text{round}(refWeight \times proteinFactor) + maternalProteinAddon$$
$$proteinCalories = proteinGrams \times 4$$
- **Fats & Carbohydrates Split:**
  - **If **`diet_type == 'keto'`:
    - $carbsGrams = \min(35, \text{round}((targetCalories \times 0.05) / 4))$
    - $fatsGrams = \text{round}((targetCalories - proteinCalories - (carbsGrams \times 4)) / 9)$
  - **If **`diet_type == 'low_carb'`:
    - $fatsCalories = targetCalories \times 0.40$, $fatsGrams = \text{round}(fatsCalories / 9)$
    - $carbsGrams = \max(60, \text{round}((targetCalories - proteinCalories - fatsCalories) / 4))$
  - **All Other Diets (**`balanced`, `high_protein`, `intermittent_fasting`, `mediterranean`, `dash`, `vegetarian`, `vegan`):
    - $fatsRatio = 0.30$ ($0.35$ for `mediterranean`, $0.27$ for `dash` / `high_protein`)
    - $fatsGrams = \max(\text{round}(refWeight \times 0.8), \text{round}((targetCalories \times fatsRatio) / 9))$
    - $carbsGrams = \max(50, \text{round}((targetCalories - proteinCalories - (fatsGrams \times 9)) / 4))$

**5. Daily Hydration Equation (**`waterLiters` & `waterCups`):

- Base water (ml): $baseWaterMl = currentWeight \times 35$
- Workout addition: If `service_track != 'nutrition_only'`, add $(sessionDurationMinutes / 30) \times 350\text{ ml}$ averaged or on training days (`+400 ml` daily baseline).
- Maternal addition: `+300 ml` if pregnant, `+600 ml` if breastfeeding.
- Gout/Kidney addition: `+500 ml` if `conditions` includes `'gout'`.
- Climate/Region factor: `+200 ml` for `'gulf'` and `'egypt'`.
$$waterLiters = \text{round1}\left(\frac{\text{clamp}(totalWaterMl, 2000, 5000)}{1000}\right)$$
$$waterCups = \text{round}\left(\frac{waterLiters \times 1000}{250}\right)$$

---

**DUAL-PATH "START MY PLAN" HANDOFF & SYNC LOGIC**

When the user taps the primary `[Start My Plan]` button on the Summary Screen:

1. **Generate Complete Plan Payload (**`generatedPlanPayload`):
  - Assemble `{ profile, onboardingAnswers, calculatedTargets, weeklyMealPlan, weeklyWorkoutPlan, generatedAt, version: 2 }`.
  - Persist locally immediately (`localPlan = generatedPlanPayload`).
2. **Path 1 — User IS Already Logged In (**`isAuthenticated == true`):
  - *(Happens when the user logged in at Step 0 *`account_check` with a new account or chose `Start fresh` after login).
  - Show loading state on button (`"Syncing your custom plan..."`).
  - Call `POST /api/v1/user/onboarding-sync` with `{ userId, authToken, payload: generatedPlanPayload, overwriteExisting: true }`.
  - **On API Success (**`200 OK`):
    - Set `onboardingCompleted = true`, `syncStatus = "synced"`, clear temporary `onboardingDraft`, and navigate to **Home Screen** (`replace` navigation stack so pressing Back on Home does not return to onboarding).
  - **On Network/Offline Error:**
    - Keep `localPlan` saved locally, set `onboardingCompleted = true`, `syncStatus = "pending_background_sync"`, enqueue background retry job, show toast (*"Saved to your device! Will sync to cloud automatically when back online."*), and navigate to **Home Screen**.
3. **Path 2 — User IS NOT Logged In Yet (**`isAuthenticated == false`):
  - *(Happens when the user answered *`"No, I'm a new user"` at Step 0 `account_check` and completed the entire onboarding chat first).
  - Save `pendingSyncPlan = generatedPlanPayload` locally so zero data can be lost.
  - Navigate to **Login / Sign-Up Screen** (`entrySource = "onboarding_summary_start_plan"`).
  - **Once Authentication Succeeds on Login / Sign-Up Screen:**
    - **Subcase 2A — Newly Created Account OR Existing Account with No Prior Server Plan:**
      - Automatically upload `pendingSyncPlan` via `POST /api/v1/user/onboarding-sync`.
      - Mark `onboardingCompleted = true`, `syncStatus = "synced"`, and navigate directly to **Home Screen**.
    - **Subcase 2B — User Logs Into an Existing Account That Already Has an Old Plan on the Server:**
      - Show conflict resolution prompt:
        - *"This account already has a previously saved plan. Would you like to save and activate the new plan you just created, or restore your old saved plan?"*
        - Option A (Primary): `[Use My New Plan (Overwrite Old Data)]` -> Uploads `pendingSyncPlan` to server and navigates to **Home Screen**.
        - Option B (Secondary): `[Restore My Old Saved Plan]` -> Hydrates local state from server data and navigates to **Home Screen**.

---

**MAIN FLOW**

1. User completes the final question (`allergies` or `injuries`) and lands on the `summary` screen.
2. User reviews their calculated calories (`1,850 kcal`), macros (`145g P / 170g C / 65g F`), hydration (`3.2 L`), workout split (`4 Days Upper/Lower`), and timeline (`12 weeks`).
3. User taps `[Start My Plan]`.
4. **If already logged in:** App uploads plan + profile to server and opens the **Home Screen**.
5. **If not logged in:** App opens the **Login / Sign-Up Screen**, user signs in, app syncs the newly created plan to the user's account, and opens the **Home Screen**.

---

**EDGE CASES**

- **User kills the app while on the Login Screen (after finishing Summary):**
  - Because `pendingSyncPlan` and `onboardingDraft` (`lastActiveStepId = "summary"`) are persisted locally, reopening the app lands the user right back on the `summary` screen with all numbers ready—zero questions need to be re-answered.
- **User edits an answer from the Summary Screen (e.g., changes **`goal_pace` from `moderate` to `slow`):
  - The Edit Bottom Sheet updates `goal_pace = "slow"`, immediately recalculates `targetCalories`, `macros`, and `expectedWeeks` in real time, and refreshes the Summary Screen in place.

---

**ACCEPTANCE CRITERIA**

- **Scenario 1: Live numerical preview matches exact scientific equations**
  - **Given** a 30-year-old male, `175 cm`, `85 kg`, `goal = "lose"`, `target_weight = 75 kg`, `goal_pace = "moderate"`, `activity = "light"`, `4 workout days`
  - **When** the Summary Screen renders
  - **Then** REE, TDEE, Target Calories, Macros, Water intake, and Expected Timeline (`14 weeks / ~3.2 months`) are calculated deterministically and displayed clearly.
- **Scenario 2: Logged-in user clicking "Start Plan" syncs and goes to Home**
  - **Given** `isAuthenticated == true`
  - **When** the user taps `[Start My Plan & Sync to Account]`
  - **Then** the app uploads the onboarding answers and generated plan to the server, sets `onboardingCompleted = true`, clears the back stack, and navigates to the Home Screen.
- **Scenario 3: Unauthenticated user clicking "Start Plan" routes to Login and then syncs**
  - **Given** `isAuthenticated == false`
  - **When** the user taps `[Continue to Log In & Start My Plan]`
  - **Then** the app persists `pendingSyncPlan` locally, navigates to the Login/Sign-Up screen, and upon successful authentication syncs the plan to the server and navigates to the Home Screen.

---

**ANALYTICS**

- `onboarding_summary_viewed` (`target_calories`, `protein_g`, `carbs_g`, `fats_g`, `water_liters`, `expected_weeks`, `service_track`)
- `onboarding_start_plan_clicked` (`is_authenticated`: `boolean`)
- `onboarding_plan_synced` (`sync_path`: `"pre_authenticated"` | `"post_summary_login"`, `overwrote_server_data`: `boolean`)
- `onboarding_completed` (`total_duration_sec`, `edits_count`, `region`)

---
