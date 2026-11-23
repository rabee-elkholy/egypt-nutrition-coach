# EPIC-05: Adaptive Workout Plans, Dual-Mode Live Player (Simple & Pro) & Exercise Library

> **Epic ID:** `EPIC-05`
> **Target Platforms:** KMM (Android Jetpack Compose & iOS SwiftUI)
> **Scope:** Production
> **Labels:** `production`, `mobile`, `workouts`, `dual-mode`, `gym-ux`

---

## Epic Overview

`EPIC-05` solves the biggest UX divide in fitness applications by introducing **Dual Workout Experience Modes (`Simple / Guided Mode` vs. `Pro / Performance Mode`)** on top of CuraFit's single deterministic training engine:
- **Simple / Guided Mode** (smart auto-default for Beginners & Home-Only users): Clean visual exercise cards, large animated demo guides, automatic rest countdowns, and 1-tap completion with zero overwhelming gym jargon.
- **Pro / Performance Mode** (smart auto-default for Intermediate/Advanced Gym & Mix users): Set-by-set `kg / reps / RIR` logging, previous-session history inline, Double Progression green badges, unilateral both-sides verification, Barbell Plate Calculator, Supersets/Drop-Sets, and ad-hoc exercise additions.
- Users can toggle **`Simple <-> Pro`** instantaneously in the Workout Player header or Profile Settings without losing any logged sets. Both modes write standardized `workout` and `session` commands so `>= 80%` session coverage, recovery deloads, and PR streaks stay 100% consistent.

### Child User Stories
- `US-WRK-01`: Weekly Workout Schedule, 14-Day Calendar Projection, Muscle Volume & Safety/Schedule Gates
- `US-WRK-02`: Dual Workout Experience Mode — Smart Auto-Default & Instant `Simple <-> Pro` Toggle
- `US-WRK-03`: Live Workout Player — Simple / Guided Mode (Visual Cards, Auto Rest Timer & 1-Tap Set/Exercise Completion)
- `US-WRK-04`: Live Workout Player — Pro / Performance Mode (Set Table, Double Progression, Unilateral L/R & Pain Flagging)
- `US-WRK-05`: Pro Gym Tools — Barbell Plate Calculator, Supersets / Drop-Sets & Ad-Hoc Free Exercise Addition
- `US-WRK-06`: Guided Warm-Up, Dynamic Mobility & Post-Workout Cool-Down Checklist
- `US-WRK-07`: Exercise Demo Media, Interactive Muscle Map & Bilingual Form/Mistake Guide (868 Catalog)
- `US-WRK-08`: Live & Planned Exercise Swap (Equipment-, Injury- & Time-Budget-Safe Substitutions)
- `US-WRK-09`: Flexible Workout Rescheduling (14-Day One-Off Rest-Day Move) & Missed Session Logging
- `US-WRK-10`: Session Completion Reconciliation (`>= 80%`), Session RPE/Duration, Personal Records Summary & Shareable Card
- `US-WRK-11`: Dedicated Cardio & Walking Session Tracking (`cardio_log`, ACSM MET, Hydration Boost & Injury Caution)

---

## US-WRK-01: Weekly Workout Schedule, 14-Day Calendar Projection, Muscle Volume & Safety/Schedule Gates

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-01` |
| **Epic** | `EPIC-05` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `workouts`, `schedule` |
| **Target Screens** | `WorkoutScheduleScreen`, `LegacyHealthConfirmationSheet`, `ScheduleConfirmationSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user with a training plan, I want to view my 14-day projected workout calendar (including moved sessions and rest days), inspect each day's exercises, time budget, and direct weekly sets per muscle group, and resolve any required health or weekday-schedule confirmations cleanly so my training week is transparent and safe.

### PRECONDITIONS
- `serviceTrack != "nutrition_only"` and `activeWorkoutPlanRef != null`.

### SCREEN AND UI DETAILS
1. **Required Confirmation Gates (Modal / Blocking Top Banner if Needed):**
   - **Health Confirmation Gate (`eligibility.needsHealthConfirmation == true`):**
     - Prompt: *"Before unlocking adaptive workout guidance, please confirm you have no unmanaged medical contraindications or acute injuries."*
     - Two required toggles (`healthy: true`, `injuryFree: true`) + `[Confirm Health Readiness]` (`confirm_health`).
   - **Legacy Schedule Weekday Confirmation Gate (`eligibility.needsScheduleConfirmation == true`):**
     - Prompt for legacy accounts lacking `weekdayConvention`: Interactive 7-day picker confirming exact weekdays (`js_sunday_0`) + `[Confirm My Workout Weekdays]` (`confirm_schedule`).
   - **Workout Safety Exclusion Alert (`workoutSafetyIssues.length > 0`):**
     - Highlights any legacy exercises flagged unsafe for current injuries with 1-tap `[Swap Unsafe Exercise]` (`US-WRK-08`).
2. **Workouts Tab Header:**
   - Active Split & Location pill (`"Upper / Lower • Gym • 45 min"`), **Dual Mode Quick Toggle** (`[Simple | Pro]`, `US-WRK-02`), and `[868 Exercise Library]` shortcut (`US-WRK-07`).
   - Horizontal **14-Day Projected Calendar Strip** showing:
     - Workout day dot (`Completed` green, `Scheduled` brand accent, `Moved` blue indicator, `Partial` amber, `Missed` gray, `Rest` muted).
3. **Selected Day Card & Exercise List:**
   - Focus title (`Upper Body`), location badge (`Gym` / `Home`), estimated duration (`42 min`), active injury filters, and optional deload notice (`"-20% sets for 24h recovery"`, 24h `cycle_gentle_session`, or multi-day Comeback ramp-in via `comeback_restart` in `US-CCH-06`).
   - **Weekly Muscle Volume Strip (Collapsible, emphasized in Pro mode):** Horizontal chips from `workoutPlan.weeklySets` (`Chest: 9 sets`, `Back: 9 sets`, `Quads: 6 sets`) + `weeklyMuscleSets`, plus `missing` pattern notice if home equipment/time budget left an explicit gap.
   - **8-Week Split Review Banner (`GET /v1/workouts/split-review`):** When `due == true`, displays the Coach's calm split progression summary (e.g., Full Body -> Upper/Lower or Push/Pull/Legs) using pure-English localized `code` + `params` (`SPLIT_REVIEW_*`).
   - **Primary CTA on Today:** `[Start Workout]` (or `[Resume Partial Workout]` when `status == "partial"`, preserving already-logged sets and upgrading to `completed` once `>= 80%` sets are done!).
   - **Overflow / Quick Actions:** `[Move Day (Reschedule)]` (`US-WRK-09`) | `[Mark Session Missed]` | `[Delete Logged Session]` (`session_delete`).

### API & BACKEND CONTRACT
1. **`GET /v1/workout-plans`** -> Lists plan version refs `{ id, version, split, parent_id }`.
2. **`GET /v1/workout-plans/{activeWorkoutPlanId}`** -> Returns full enriched plan (`days` with exercises containing `targetRepsRange`, `targetRir`, `restSeconds`, plus `weeklyMuscleSets`, `weeklySets`, `warnings`, `coverage`, `injuryPolicyVersion`).
3. **`GET /v1/workouts/split-review`** -> Evaluates 8-week Full Body split progression readiness returning `{ due, kind, code, params, text }` in pure English.
4. **`GET /v1/sessions?offset=0&limit=30`** -> Paginated historical completion records.
5. **`POST /v1/commands?view=receipt`** (`action: "confirm_health"`) -> `{ "healthy": true, "injuryFree": true }`.
6. **`POST /v1/commands?view=receipt`** (`action: "confirm_schedule"`) -> `{ "dayMap": { "1": 1, "3": 3, "5": 5 } }`.
   - Error Codes: `HEALTH_CONFIRMATION_REQUIRED`, `HEALTH_ALREADY_CONFIRMED`, `SCHEDULE_ALREADY_CONFIRMED`, `INVALID_SCHEDULE_MAPPING`, `WORKOUT_PLAN_NOT_FOUND`.

### RULES & BUSINESS LOGIC
1. **Canonical Calendar (`js_sunday_0`) & Weekly Continuity:** All 14-day projections match server `scheduledSessions` (`0=Sun .. 6=Sat`), layering active `scheduleOverrides` on top of `workoutPlan.days`. Unlike 7-day dated nutrition plans (which expire and require `renew_plan`), the active `workoutPlan` repeats weekly indefinitely with Strength Coach attribution on weekly muscle volume (`MEV/MAV`) until the user modifies training setup (`US-PRF-03`), accepts a `weekly_volume` adaptation (`US-CCH-03`), or swaps an exercise (`US-WRK-08`).
2. **Time Budget Transparency:** Display `day.estimatedMinutes` honestly; if a legacy plan exceeds `sessionDuration` due to unilateral both-sides timing (`training-state.mjs`), display the backend warning banner suggesting plan renewal (`US-PRF-03`).
3. **Archived Versions Support:** Switching to past sessions uses `workoutArchives` / `GET /v1/workout-plans/{id}` so historical logs display against the exact exercise prescription used on that date.
4. **Partial Session Resume:** Resuming a `partial` session on the same date preserves all previously logged exercise sets in `workoutLogs` and automatically promotes the session status to `completed` once `>= 80%` of prescribed working sets are recorded.

### MAIN FLOW
1. User taps `Workouts` tab.
2. App renders the 14-day projected calendar from SQLDelight (`today` pre-selected).
3. User sees `Upper Body • Gym • 6 Exercises • 42 min`, scans the exercise list, and taps `[Start Workout]`.

### EDGE CASES
- **Consecutive Full-Body Days Warning (`workouts.mjs`):** Render `workoutPlan.warnings` inside an info strip at the top of the schedule.
- **Rest Day Selected on Calendar:** Displays active-recovery guidance, `"0 workouts scheduled today"`, and `[Move Another Workout Here]` shortcut (`US-WRK-09`).
- **Offline Workout Schedule View:** Renders full 14-day projection, weekly muscle set badges, and exercise list 100% offline from SQLDelight.
- **`serviceTrack == "nutrition_only"` Discovery State:** Replaces active schedule with `"Workouts Inactive"` banner, `[Browse 868 Exercise Library]` (`US-WRK-07`), and `[Enable Workout Program]` CTA (`US-PRF-03`).

### ACCEPTANCE CRITERIA
- **Scenario 1: 14-day projection reflects accepted reschedule override**
  - **Given** Wednesday's session was moved to Thursday via accepted `schedule` adaptation
  - **When** `WorkoutScheduleScreen` renders the 14-day calendar
  - **Then** Wednesday displays as Rest and Thursday displays the moved Upper Body session.
- **Scenario 2: Unconfirmed legacy `workouts_only` account sees Health Confirmation Gate**
  - **Given** `eligibility.needsHealthConfirmation == true`
  - **When** user opens `Workouts` tab
  - **Then** Health Readiness modal blocks progression features until user confirms both checkboxes (`confirm_health`).
- **Scenario 3: Week-2+ schedule continues automatically without manual workout plan renewal**
  - **Given** the user finishes Week 1 of their `workoutPlan`
  - **When** Week 2 begins on Saturday/Sunday
  - **Then** scheduled sessions continue projecting accurately onto the 14-day calendar without requiring a `renew_plan` call.

### ANALYTICS
- `workout_schedule_viewed` (`split`: `string`, `ui_mode`: `"simple" | "pro"`, `has_safety_issues`: `boolean`)
- `workout_health_confirmed` (`source`: `"gate"`)
- `workout_schedule_confirmed` (`days_count`: `integer`)

---

## US-WRK-02: Dual Workout Experience Mode — Smart Auto-Default & Instant `Simple <-> Pro` Toggle

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-02` |
| **Epic** | `EPIC-05` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `workouts`, `dual-mode`, `ux` |
| **Target Screens** | `WorkoutModeToggleBar`, `WorkoutScheduleScreen`, `LiveWorkoutPlayer` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a fitness app user, I want the workout interface to start automatically in the right complexity level for me — Simple Guided Mode if I am a beginner or training at home, or Pro Performance Mode if I am an experienced gym lifter — while letting me switch instantly between Simple and Pro in one tap without losing any progress.

### PRECONDITIONS
- `serviceTrack != "nutrition_only"`.

### SCREEN AND UI DETAILS
1. **Segmented Mode Switcher Pill (`[Simple | Pro]`):**
   - Placed prominently in the top bar of `Workouts` tab AND inside the top bar of the `LiveWorkoutPlayer`, plus in Training Settings (`US-PRF-03`).
   - Tooltip / First-Time Coach Bubble (dismissible once):
     - On Simple default: *"Guided Mode keeps things clean with visual steps and auto timers. Want kg/RIR tables and plate math? Tap Pro anytime!"*
     - On Pro default: *"Pro Mode shows set tables, RIR, Double Progression & plate calculator. Want a simpler view? Tap Simple anytime!"*
2. **Comparison Table (Visual Preview when tapping `?` next to toggle):**
   - **Simple Mode:** Animated Exercise Demo, 1-Tap Check-off (`Complete Set` / `Complete Exercise`), Auto Rest Timer, Swap Exercise, Pain Flag.
   - **Pro Mode:** Full Set-by-Set `kg / reps / RIR` grid, Previous Session History (`Last: 20kg x 10`), Double Progression `+2.5 kg` green chip, Unilateral Both-Sides Confirm, Plate Calculator, Supersets/Drop-Sets, Ad-Hoc Exercise Add.

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "workout_ui_mode"`)
   - Payload: `{ "mode": "simple" | "pro" }`
   - Persists `profile.workoutUiMode` on D1 so the user's preferred mode follows them across Android & iOS!
2. **`GET /v1/bootstrap`** -> Returns `profile.workoutUiMode` and `onboarding.workoutUiMode`.

### RULES & BUSINESS LOGIC
1. **Smart Auto-Default Algorithm (Executed once at Onboarding `US-MOB-09`):**
   - If `fitnessLevel == "beginner"` OR `workoutLocation == "home_only"` -> Default `"simple"`.
   - Else (`intermediate` or `advanced` AND `workoutLocation != "home_only"`) -> Default `"pro"`.
2. **Zero Data Loss During Mid-Session Toggle:**
   - Switching from `Simple` to `Pro` (or `Pro` to `Simple`) **while a live workout session is active** preserves every set already checked/logged in the current session!
   - Specifically: sets checked in `Simple` mode populate with prescribed `repMax`/`repMin` midpoint (or previous logged weight) and `rir = exercise.rir` in Pro's editable table so the user can refine exact weights immediately; switching back from `Pro` to `Simple` keeps the recorded `kg`/`reps` safely in memory & SQLDelight while showing Simple's clean check-off UI.

### MAIN FLOW
1. A `beginner` user opens their first gym workout -> Player automatically launches in **Simple / Guided Mode**.
2. After 3 weeks, the user wants to track exact barbell weights; they tap `[Pro]` right inside the Live Workout Player header during Set 2 of Bench Press.
3. Screen transitions smoothly to the **Pro / Performance** set table with Set 1 already checked off, triggers `workout_ui_mode` (`"pro"`) in the background, and saves future sessions in Pro mode.

### EDGE CASES
- **Offline Mode Switch:** Updates local SQLDelight `workoutUiMode` instantaneously and syncs `workout_ui_mode` via outbox when online.
- **Unilateral Exercise Started in Simple Mode Then Switched to Pro:** Unilateral exercise retains `bothSides` confirmation state transparently.
- **Running Rest Timer During Mode Toggle:** Switching `Simple <-> Pro` mid-rest keeps the exact countdown running smoothly from shared `restTargetEpochMs` without resetting or canceling the timer.
- **User With `Pro` Mode Default Switches to `Home Only` Later (`US-PRF-03`):** Respects explicit manual `workoutUiMode` if previously toggled, or nudges gently once if switching to bodyweight-only home workouts.

### ACCEPTANCE CRITERIA
- **Scenario 1: Auto-default selects Simple for beginners and Home Only**
  - **Given** onboarding completed with `fitnessLevel = "beginner"` and `workoutLocation = "gym_only"`
  - **When** `Workouts` tab loads for the first time
  - **Then** `workoutUiMode` defaults to `"simple"`.
- **Scenario 2: Mid-session switch from Simple to Pro preserves logged sets**
  - **Given** the user completed 2 of 3 sets of Dumbbell Press in Simple Mode
  - **When** the user taps `[Pro]` in the Live Player top bar
  - **Then** the Pro set table renders with Sets 1 and 2 already marked complete and Set 3 ready for weight/rep input.
- **Scenario 3: Mode preference synchronizes across devices**
  - **Given** user switches `workoutUiMode` to `"pro"` on Android
  - **When** `workout_ui_mode` commits and user signs into iOS (`GET /v1/bootstrap`)
  - **Then** iOS launches `LiveWorkoutPlayer` directly in `"pro"` mode.

### ANALYTICS
- `workout_ui_mode_initialized` (`default_mode`: `"simple" | "pro"`, `fitness_level`: `string`, `location`: `string`)
- `workout_ui_mode_toggled` (`from_mode`: `"simple" | "pro"`, `to_mode`: `"simple" | "pro"`, `surface`: `"schedule" | "live_player" | "settings"`)

---

## US-WRK-03: Live Workout Player — Simple / Guided Mode

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-03` |
| **Epic** | `EPIC-05` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `workouts`, `simple-mode`, `live-player` |
| **Target Screens** | `LiveWorkoutPlayerSimpleScreen`, `GuidedRestTimerOverlay` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a beginner or casual fitness user who doesn't want spreadsheets or RIR jargon during my workout, I want a clean, visual, step-by-step guided workout player where I see a large animated exercise demo, clear target sets/reps, an automatic rest timer after each set, and big 1-tap buttons to finish each set or exercise effortlessly.

### PRECONDITIONS
- User started a scheduled workout session (`US-WRK-01`) with `workoutUiMode == "simple"`.

### SCREEN AND UI DETAILS
1. **Top Player Bar:**
   - Elapsed Session Clock (`12:34`), Exercise Progress (`Exercise 2 of 6`), `[Simple | Pro]` toggle pill, and `[End / Pause]` button.
2. **Hero Media Card:**
   - Auto-looping animated GIF/Lottie/MP4 of the active exercise (`US-WRK-07`), Exercise Name (AR/EN), Target Muscle tag, and `[Form Tips]` pill.
3. **Clear Prescription Banner (Zero Jargon):**
   - *"Do **3 sets** of **10–12 reps** • Controlled pace"* (translates technical `rir: 2` into plain-language guidance: *"Stop when you feel you could still do ~2 clean reps"*).
   - If the exercise is unilateral (`laterality in ["unilateral", "alternating"]`), shows a clear pill: *"Both Sides (Left + Right)"* with checkbox `[Both Left & Right Done]` before final completion (`bothSides` defaults to `true` server-side unless explicitly unchecked).
   - If `usesKg(exercise)` is true and user wants to note a weight optionally, offers a single clean optional pill `"+ Note Weight (optional)"` — never required in Simple Mode! (When explicit `kg > 0` is entered, it also counts toward Personal Records in `GET /v1/workouts/prs`!)
4. **Big Visual Set Check Circles:**
   - E.g. `[Set 1 Done]`, `[Set 2]`, `[Set 3]` (adjusted automatically by `effectiveSets` if a 24h recovery or `cycle_gentle_session` deload is active, e.g., `2 sets` instead of `3` with a soft `"Recovery Deload Applied"` hint!).
   - Tapping a Set circle:
     1. Marks the set done with haptic feedback.
     2. Immediately launches the **Floating Auto Rest Timer** (`exercise.restSeconds`, e.g., `90s`) with `[-15s]`, `[+15s]`, `[Skip Rest]` buttons, and soft audio chime + vibration when rest ends (respecting mute/background notification!).
5. **Quick Exercise Controls (Bottom Sticky Dock):**
   - Primary CTA: `[Done Next Set]` / `[Complete Exercise & Next]` (auto-completes remaining sets if user taps `"Done All Sets"` shortcut, with optional compact exercise note field `notes` max 300 chars).
   - Secondary Actions: `[Swap Exercise]` (`US-WRK-08`) | `[Report Pain / Discomfort]` (sets `pain: true` cleanly, pauses progression, and suggests swapping or resting) | `[Undo / Delete Logged Exercise]` (`workout_delete`).

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "workout"`)
   - Client maps Simple Mode completion cleanly into the exact schema `coaching.mjs` validates:
     ```json
     {
       "revision": 14,
       "action": "workout",
       "payload": {
         "date": "2026-11-21",
         "dayIndex": 6,
         "exerciseId": "oedb:203",
         "entryMode": "simple",
         "bothSides": true,
         "sets": [
           { "kg": 0, "reps": 10, "rir": 2, "pain": false },
           { "kg": 0, "reps": 10, "rir": 2, "pain": false },
           { "kg": 0, "reps": 10, "rir": 2, "pain": false }
         ],
         "autoSession": false
       }
     }
     ```
2. **`POST /v1/commands?view=receipt`** (`action: "workout_delete"`)
   - Payload: `{ "id": "<workoutLogId>" }` — deletes an accidentally logged exercise entry and automatically reconciles session completion coverage (`404 WORKOUT_LOG_NOT_FOUND`).
   - **Important Backend Rule:** `coaching.mjs` requires `sets` length `1..15`, `reps` integer `1..100`, `kg` `0..500` (if `usesKg` -> send `0` or optional noted `kg`; if bodyweight -> `0`). Simple Mode defaults `reps = round((repMin + repMax) / 2)` (or `repMin`) and `rir = exercise.rir` so `sessionCompletion` (`>= 80%` sets) and `recovery` work identically! If `kg == 0` on external load in Simple mode, `progression()`, volume escalation, performance-drop checks, and PRs safely exclude `kg: 0` sets; if the user notes explicit `kg > 0` in Simple Mode, the PR engine (`GET /v1/workouts/prs`) includes it cleanly.

### RULES & BUSINESS LOGIC
1. **Background Rest Timer & Process-Death Persistence:** Every tapped set writes immediately into local SQLDelight (`activeWorkoutDraft`), storing rest countdowns as an absolute epoch timestamp (`restTargetEpochMs`). Locking the phone, switching apps, or OS process kill recovers the exact active exercise, checked sets, elapsed workout duration, and zero-drift rest timer on reopen!
2. **24-Hour Recovery Deload Rounding (`setFactor`):** When a `-20%` (`0.8`) or `-40%` (`0.6`) recovery deload (or multi-day Comeback ramp-in) is active, `effectiveSets = Math.max(1, factor < 1 ? Math.min(plannedSets - 1, Math.round(plannedSets * factor)) : Math.round(plannedSets * factor))` — matching backend `effectiveSets` 1:1 and guaranteeing that even a 2-set movement scales down by at least 1 set while never dropping below `1`.
3. **Pain Safety Trigger:** If the user taps `[Report Pain / Discomfort]`, set `pain: true` on the active/logged set, record it via `workout`, immediately offer `[Swap to Joint-Safe Alternative]` (`US-WRK-08`), and trigger backend `WORKOUT_PAIN_HOLD` automatically (`recovery.mjs`).
4. **Unilateral Confirmation:** For `laterality in ["unilateral", "alternating"]` exercises, require checking `"Both Left & Right Completed"` so `bothSides: true` reaches the server accurately.

### MAIN FLOW
1. Beginner user taps `[Start Workout]` and finishes Warm-Up (`US-WRK-06`).
2. `LiveWorkoutPlayerSimpleScreen` displays Exercise 1 (`Dumbbell Goblet Squat`) with looping animation and 3 big Set buttons.
3. User taps `[Set 1]` -> Set highlights green completed and 90-second Rest Timer counts down with haptic alert when finished.
4. User finishes Sets 2 and 3, taps `[Complete Exercise & Next]`.
5. `workout` command commits cleanly via outbox; player advances smoothly to Exercise 2.
6. After Exercise 6, player routes to `SessionSummaryScreen` (`US-WRK-10`).

### EDGE CASES
- **User Skips an Exercise (Machine Busy & Doesn't Want to Swap):** Can tap `[Skip for Now]` to jump to Exercise 3 and come back later in the session, or finish session as `partial` if `< 80%` sets completed (and resume later the same day to reach `>= 80%` `completed`).
- **Screen Auto-Lock Prevention:** Provide optional `"Keep Screen Awake During Workout"` toggle (enabled by default in Live Player).
- **Phone Call / OS Process Kill Mid-Workout:** Restores `activeWorkoutDraft` cleanly with a non-blocking banner `"Resume Active Workout (Exercise 3 of 6 • 18:42 elapsed)"` and exact `restTargetEpochMs` countdown.
- **Offline Gym Workout Execution:** Plays cached animations and saves every set locally in SQLDelight + outbox so zero-signal gyms never interrupt training.

### ACCEPTANCE CRITERIA
- **Scenario 1: Simple Mode logs valid sets and triggers auto rest timer**
  - **Given** a user in `Simple` mode has `Dumbbell Goblet Squat` (`3 sets x 8-12 reps, 90s rest`)
  - **When** the user taps `[Set 1]`
  - **Then** Set 1 marks complete, the 90s rest timer begins counting down, and completing the exercise submits 3 valid sets to `POST /v1/commands` (`action: "workout"`).
- **Scenario 2: Pain flag triggers safety swap prompt**
  - **Given** the user taps `[Report Pain]` during Shoulder Press
  - **When** confirmed
  - **Then** `pain: true` is sent in the `workout` log and the user is offered safe alternatives or rest without progression suggestions.
- **Scenario 3: Process death mid-workout recovers active sets and rest timer**
  - **Given** user completed 2 sets and had 45s remaining on Rest Timer when OS terminated the app
  - **When** user reopens the app 20 seconds later
  - **Then** `activeWorkoutDraft` restores Sets 1–2 checked and Rest Timer at `00:25` remaining accurately.

### ANALYTICS
- `workout_player_started` (`ui_mode`: `"simple"`, `exercises_count`: `integer`, `day_index`: `integer`)
- `workout_set_checked_simple` (`exercise_id`: `string`, `set_number`: `integer`)
- `workout_rest_timer_completed` (`skipped`: `boolean`, `duration_sec`: `integer`)
- `workout_pain_reported` (`exercise_id`: `string`, `ui_mode`: `"simple" | "pro"`)

---

## US-WRK-04: Live Workout Player — Pro / Performance Mode

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-04` |
| **Epic** | `EPIC-05` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `workouts`, `pro-mode`, `double-progression` |
| **Target Screens** | `LiveWorkoutPlayerProScreen` |
| **Entitlement** | `Free` *(Core Pro Lifting UX — `US-WRK-05` tools like Plate Calculator & Ad-hoc/Supersets integrate right here)* |
| **Backend Status** | `Implemented` |

### STORY
As an experienced lifter training at the gym, I want a structured Pro workout table showing each exercise's previous weights/reps, live Double Progression load-increase suggestions, exact per-set kg/reps/RIR inputs, unilateral both-sides confirmation, bodyweight added-kg tracking, and per-set pain flags so I can apply progressive overload precisely.

### PRECONDITIONS
- User started a workout session with `workoutUiMode == "pro"`.

### SCREEN AND UI DETAILS
1. **Top Exercise Header & Action Bar:**
   - Session timer, total session Volume (`kg` — or `lb` when `unitSystem == "imperial"`) ticker, `[Simple | Pro]` toggle, `[Swap]` (`US-WRK-08`), `[Plate Calc]` (`US-WRK-05`), `[Add Exercise]` (`US-WRK-05`), and compact `[Notes]` icon (`notes` up to 300 chars).
2. **Exercise Prescription & Double Progression Banner:**
   - Displays prescribed range (`"3 sets • 8–12 reps • Target RIR 2 • Rest 120s"`).
   - **Double Progression Green Badge (`exercise.suggestedKg != null`):**
     - *"Progress Ready: Try **{suggestedKg} kg** today ({progressionReason})"* -> 1-tap `[Apply {suggestedKg} kg to All Sets]`.
   - **Safety Hold Badge (`recovery.progressionAllowed == false` or local muscle caution):**
     - Clear muted notice (*"Progression paused today due to recovery/pain status — match or reduce weight safely"*).
3. **Clean 5-Column Pro Set Table (`1..15` sets — Hevy/Strong ergonomics):**
   - **5 Core Columns:** `Set` *(tap badge for `W` Warm-up / `1..N` Normal / `D` Drop / `F` Failure + compact `RIR` & `Pain` toggles inside the expandable row chip so narrow mobile screens stay spacious!)* | `Previous` (e.g., `60kg × 10`) | `kg` *(or `+kg` when `weightedBodyweight: true`; hidden/0 on unloaded bodyweight)* | `Reps` | `Done` (checkmark icon).
   - **Quick Fill Helpers:** Changing Set 1's `kg` shows `"Copy 62.5 kg down?"` pill to save typing; pre-fills inputs lightly with `suggestedKg` or last session's weight as placeholder.
   - **Weighted Bodyweight & Assisted Rules (`usesKg` & `supportsAddedWeight` from `exercise-load.mjs`):**
     - Loaded bodyweight movements (`supportsAddedWeight === true`, e.g. weighted dips/pull-ups) send explicit **`weightedBodyweight: true`** and per-set **`addedKg`** (or `kg`) so external added weight persists without breaking pure bodyweight defaults (`kg: 0`, `BODYWEIGHT_PROGRESSION_REPS_ONLY`).
     - Assisted machine exercises show `"Assisted kg (Lower = Harder)"` badge clearly (matching `recovery.mjs` assisted decrement logic).
   - **Unilateral Both-Sides Bar (`laterality in ["unilateral", "alternating"]`):**
     - Prompt: *"Unilateral movement: Log weaker side's reps & lowest RIR at the same load, and keep [Both Sides Completed] checked to qualify for progression."* (`bothSides` defaults to `true`; unchecking sends `bothSides: false`).
   - **Preferred Load Step (`increment`):** Subtle step chip (`+1.25 kg` / `+2.5 kg` / `+5 kg`) bounded `<= 5%` for next-session Double Progression calculation.
   - **Add/Remove Set & Exercise Delete:** `[+ Add Set]` (up to `15` sets max, accommodating warm-up + working sets) / swipe left to delete extra set (`min 1`); overflow `[Delete Logged Exercise]` invokes `workout_delete`.
4. **Auto Rest Timer Banner:** Sticky collapsible timer at bottom after checking any set done (`exercise.restSeconds`).

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "workout"`)
   - Payload:
     ```json
     {
       "revision": 15,
       "action": "workout",
       "payload": {
         "date": "2026-11-21",
         "dayIndex": 1,
         "exerciseId": "oedb:73",
         "weightedBodyweight": false,
         "sets": [
           { "kg": 62.5, "reps": 10, "rir": 2, "pain": false },
           { "kg": 62.5, "reps": 10, "rir": 2, "pain": false },
           { "kg": 62.5, "reps": 9, "rir": 2, "pain": false }
         ],
         "bothSides": true,
         "increment": 2.5,
         "notes": "Controlled 2s eccentric"
       }
     }
     ```
2. **`POST /v1/commands?view=receipt`** (`action: "workout_delete"`)
   - Payload: `{ "id": "<workoutLogId>" }` — removes an exercise log entry and reconciles session coverage cleanly (`404 WORKOUT_LOG_NOT_FOUND`).
3. **`GET /v1/workout-logs?exerciseId={id}&from={30d_ago}&to={today}&limit=100`** (Populates `Previous` column & per-exercise history cleanly).
   - Error Codes: `WORKOUT_SETS_REQUIRED` (`1..15` sets), `WORKOUT_REPS_MUST_BE_INTEGER`, `EXERCISE_NOT_IN_DAY`, `NUMBER_OUT_OF_RANGE`, `WORKOUT_LOG_NOT_FOUND`.

### RULES & BUSINESS LOGIC
1. **Exact Backend Parity for Double Progression (`recovery.mjs` `progression()`):**
   - Double Progression only unlocks when backend sees **2 distinct exposure dates within 28 days** with same load across all working sets (excluding `setType === "warmup"` and Simple-mode `kg: 0`), all `reps >= repMax`, `rir >= exercise.rir`, `pain == false`, `bothSides == true` (if unilateral), `increment <= kg * 0.05`, and `ready.status == "ready"`.
   - Client displays this transparently in an `"Why no progression yet?"` tooltip (e.g., *"Hit 12 reps on all 3 sets with same weight on 1 more session to unlock +2.5 kg!"*).
2. **Real-Time Validation Before Commit:** Only submit checked sets (require `>= 1` checked set with integer `reps` `1..100` and `kg` `0..500`); normalize Eastern Arabic digits automatically. Persist each checked set immediately in `activeWorkoutDraft` with `restTargetEpochMs` for zero-loss crash recovery, and apply `effectiveSets = Math.max(1, factor < 1 ? Math.min(plannedSets - 1, Math.round(plannedSets * factor)) : Math.round(plannedSets * factor))` when a 24h recovery deload is active!
3. **Scroll-Friendly Multi-Exercise View OR Card Pager:** Allow scrolling cleanly across all exercises in today's workout (saving each exercise as sets complete) so experienced lifters can jump out of order if a gym bench is occupied!

### MAIN FLOW
1. Experienced lifter starts Gym Push Day in **Pro Mode**.
2. Bench Press (`oedb:73`) shows `Previous: 60 kg × 12, 12, 12` and a green banner: **"Progress Ready: Try 62.5 kg today!"**.
3. User taps `[Apply 62.5 kg]`, completes 3 sets (`10, 10, 9` reps at `RIR 2`), marking each set Done while the 120s Rest Timer runs.
4. Client commits `workout` command cleanly; total session volume updates live (`+1,812.5 kg`).

### EDGE CASES
- **User Logs Weight Only on 2 of 3 Prescribed Sets:** Commits the 2 logged sets cleanly; `sessionCompletion` counts `2/3` expected sets toward the `>= 80%` threshold (`US-WRK-10`).
- **Mid-Workout Timer Background Drift:** Rest countdown uses absolute `restTargetEpochMs` persisted in `activeWorkoutDraft` and recovers accurately across OS sleep/app switch.
- **Imperial Weight Entry (`unitSystem == "imperial"`):** Displays `lb` headers & `+5 lb` steps while converting deterministically to canonical `kg` (`round1(lb * 0.45359237)`) before transmitting `workout`.
- **User Enters Different Weights Per Set (Pyramid Sets, e.g., `50, 60, 65 kg`):** Fully allowed! Note cleanly in Progression hint that uniform load across all working sets is required to trigger automatic Double Progression suggestions (`UNIFORM_LOAD_REQUIRED`).
- **Per-Set Pain Checked (`pain: true`):** Immediately triggers red warning border on that set, blocks Double Progression automatically, and excludes the set from PR calculations.
- **Process Death Mid-Set or Multi-Device Offline Rebase:** Persisted `activeWorkoutDraft` restores unfinished table rows locally on crash recovery without duplicating already-committed exercise logs.

### ACCEPTANCE CRITERIA
- **Scenario 1: Double Progression banner applies suggested load cleanly**
  - **Given** `exercise.suggestedKg == 62.5` on `Bench Press` (`oedb:73`)
  - **When** the user taps `[Apply 62.5 kg]` and checks all 3 sets at `10` reps, `RIR 2`
  - **Then** `workout` submits `kg: 62.5` for all 3 sets and increments live session volume.
- **Scenario 2: Unilateral exercise warns when `bothSides` is unchecked**
  - **Given** `Single-Arm Dumbbell Row` has `laterality == "unilateral"`
  - **When** user logs 3 sets without checking `[Both Sides Completed]`
  - **Then** `bothSides: false` is sent and UI shows an inline note that both sides must be confirmed to unlock Double Progression.
- **Scenario 3: Pure bodyweight movement avoids invalid external-load requirement**
  - **Given** an exercise has `usesKg == false` (`BODYWEIGHT_PROGRESSION_REPS_ONLY`)
  - **When** Pro Mode set table renders
  - **Then** load defaults to `0` (or optional `+Added kg` if `supportsAddedWeight == true`) while progression evaluates top-rep targets cleanly.

### ANALYTICS
- `workout_pro_exercise_logged` (`exercise_id`: `string`, `sets_count`: `integer`, `total_volume_kg`: `number`, `accepted_suggested_kg`: `boolean`)
- `workout_double_progression_applied` (`exercise_id`: `string`, `from_kg`: `number`, `to_kg`: `number`)

---

## US-WRK-05: Pro Gym Tools — Barbell Plate Calculator, Supersets / Drop-Sets & Ad-Hoc Free Exercise Addition

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-05` |
| **Epic** | `EPIC-05` |
| **Priority** | `Medium` |
| **Labels** | `production`, `mobile`, `workouts`, `pro-mode`, `gym-tools` |
| **Target Screens** | `PlateCalculatorSheet`, `AddAdHocExerciseSheet`, `LiveWorkoutPlayerProScreen` |
| **Entitlement** | `Free` *(Built directly into Pro Mode tools to compete head-to-head with Hevy/Strong)* |
| **Backend Status** | `Implemented` |

### STORY
As an advanced lifter using Pro Mode, I want a visual Barbell Plate Calculator, the ability to tag sets as Warm-up / Working / Drop-Set or group two exercises into a Superset, and the option to add an extra ad-hoc exercise from the 868-exercise library mid-session (with injury/maternal safety warnings) without altering my core template permanently.

### PRECONDITIONS
- User is in `LiveWorkoutPlayerProScreen` (`workoutUiMode == "pro"`).

### SCREEN AND UI DETAILS
1. **Barbell Plate Calculator (`PlateCalculatorSheet`):**
   - Triggered from Plate icon next to any barbell exercise `kg` input.
   - Input target weight (e.g. `87.5 kg`), select Bar Weight (`20 kg Olympic` default, `15 kg Women's`, `10 kg EZ Bar`, or custom), and toggle available gym plates (`25`, `20`, `15`, `10`, `5`, `2.5`, `1.25 kg`).
   - Renders color-coded **Visual Barbell Plate Diagram** + exact text: *"Per Side: `20kg + 10kg + 2.5kg + 1.25kg` (Total = 87.5 kg)"*.
   - `[Apply 87.5 kg]` button populates the active set input immediately.
2. **Set Type Tag & Superset Grouping (`Pro Mode Set Menu`):**
   - Tapping the set number badge (`1`, `2`, `3`) opens a compact popover:
     - `W` — **Warm-up Set** (excluded from working-set progression, session completion, volume, PRs, and performance-drop checks!)
     - `1..N` — **Normal Working Set**
     - `D` — **Drop-Set**
     - `F` — **To Failure**
   - Overflow menu on an exercise card: `[Link as Superset with Next Exercise]` -> Visually connects the two exercise cards with a vertical brand-colored bracket and runs Rest Timer only after both movements in the superset finish!
3. **Add Ad-Hoc Exercise Mid-Session (`[+ Add Extra Exercise]`):**
   - Opens searchable catalog picker (`GET /v1/exercises`) pre-filtered for user's `injuries` and current session `location` (`Gym` / `Home` equipment).
   - User taps an exercise (e.g., `Arnold Shoulder Press`), adds it as `"Extra for Today Only"`, and logs its sets seamlessly.

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "workout"`)
   - Supports per-set metadata: `sets[].setType`: `"normal" | "warmup" | "dropset" | "failure"`, optional `supersetGroupId: string | null`, and `1..15` sets.
   - Warm-up sets (`setType: "warmup"`), pain sets (`pain: true`), and Simple-mode `kg: 0` sets are excluded across workout/recovery evaluation functions (`sessionCompletion`, `progression`, `performanceDrop`, `weeklyVolumeEscalation`, and PR/1RM analytics).
2. **`POST /v1/commands?view=receipt`** (`action: "ad_hoc_exercise"`)
   - Payload: `{ "date": "YYYY-MM-DD", "dayIndex": 1, "exerciseId": "oedb:20", "bothSides": true, "sets": [{ "kg": 15, "reps": 12, "rir": 2, "pain": false, "setType": "normal" }], "supersetGroupId": null, "overrideInjuryWarning": false }`.
   - **Ad-Hoc Exercise Injury & Maternal Guard:** Backend validates `exerciseId` against the user's declared `injuries`, `maternalStatus`, and `seniorMode` (`isFriendlyForInjuries`) and returns **`409 AD_HOC_INJURY_WARNING`** (with `params.injuries`) unless the user explicitly confirms the warning modal and the client resends with **`overrideInjuryWarning: true`**.
   - Error Codes: `400 AD_HOC_EXERCISE_INVALID`, `409 AD_HOC_INJURY_WARNING`.

### RULES & BUSINESS LOGIC
1. **Plate Calculator Greedy Math (Local Deterministic):** Subtract `barWeight`, divide remaining by `2`, greedily fit largest enabled plate denominations down to `1.25 kg` (`Math.floor`), and report exact achievable weight if target is off by `< 2.5 kg`.
2. **Ad-Hoc Non-Pollution:** Ad-hoc extra exercises do NOT overwrite `workoutPlan` structure or dilute `>= 80%` prescribed session completion coverage.

### MAIN FLOW
1. User is doing Barbell Squat at `95 kg`, opens Plate Calc, verifies `20kg + 15kg + 2.5kg` per side, and logs 3 sets.
2. User links `Cable Tricep Pushdown` and `Dumbbell Hammer Curl` as a Superset (`SS1`) -> Player alternates exercises before triggering the 75s rest countdown.
3. User taps `[+ Add Extra Exercise]`, searches `"Arnold Shoulder Press"`, logs 3 bonus sets (`ad_hoc_exercise`), and finishes the workout.

### EDGE CASES
- **Target Weight Less Than Selected Barbell Weight (e.g. `15 kg` on `20 kg` bar):** Shows `"Cannot be lower than 20 kg bar weight"` and suggests `10 kg EZ Bar` or dumbbells.
- **User Tries to Add an Injury- or Maternal-Contraindicated Ad-Hoc Exercise:** Backend returns `409 AD_HOC_INJURY_WARNING`; UI presents a clear caution dialog (*"Caution: Flagged for your declared injury/safety profile — consider safe alternatives"*) with `[Choose Safe Alternative]` (default) and `[Log Anyway]` (resubmits with `overrideInjuryWarning: true`).
- **Unachievable Plate Increment (e.g., `81 kg` With Smallest Enabled Plate `2.5 kg`):** Plate calculator displays nearest achievable symmetric loads (`80 kg` vs `85 kg`) cleanly instead of failing.
- **Superset Partner Swapped or Skipped Mid-Session:** Unlinks `supersetGroupId` cleanly so remaining single movement preserves normal rest timer behavior.

### ACCEPTANCE CRITERIA
- **Scenario 1: Plate calculator computes accurate per-side plate breakdown**
  - **Given** `20 kg` Olympic bar and target weight `100 kg`
  - **When** `PlateCalculatorSheet` calculates
  - **Then** per-side stack shows `2 x 20 kg` (or `1 x 25 kg + 1 x 15 kg` based on enabled plates) totaling `100 kg`.
- **Scenario 2: Warm-up sets do not break Double Progression criteria**
  - **Given** user logs `1` warm-up set (`setType: "warmup"`, lighter weight) plus `3` working sets at uniform `60 kg x 12`
  - **When** backend evaluates `workout`
  - **Then** `progression()` evaluates uniform load on the `3` working sets cleanly without failing on the warm-up set's lighter weight.
- **Scenario 3: Injury-conflicting ad-hoc exercise triggers `409 AD_HOC_INJURY_WARNING` unless explicitly overridden**
  - **Given** user declared `knee` injury and submits a contraindicated movement via `ad_hoc_exercise` without `overrideInjuryWarning: true`
  - **When** backend validates the command
  - **Then** server returns `409 AD_HOC_INJURY_WARNING` and only persists the ad-hoc entry if the user explicitly confirms and resends `overrideInjuryWarning: true`.

### ANALYTICS
- `plate_calculator_used` (`target_kg`: `number`, `bar_kg`: `number`)
- `superset_created` (`exercises_count`: `integer`)
- `ad_hoc_exercise_added` (`exercise_id`: `string`, `injury_warning_shown`: `boolean`, `override_used`: `boolean`)

---

## US-WRK-06: Guided Warm-Up, Dynamic Mobility & Post-Workout Cool-Down Checklist

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-06` |
| **Epic** | `EPIC-05` |
| **Priority** | `Medium` |
| **Labels** | `production`, `mobile`, `workouts`, `warmup`, `mobility` |
| **Target Screens** | `WarmupPreSessionSheet`, `CooldownPostSessionSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user starting or finishing a workout, I want a tailored 5-minute dynamic warm-up checklist before my first working set (targeting today's specific muscle focus and avoiding injured joints) and a brief cool-down stretch afterward so I train safely and reduce next-day soreness.

### PRECONDITIONS
- User taps `[Start Workout]` on a scheduled workout day (`US-WRK-01` / `US-HOME-03`).

### SCREEN AND UI DETAILS
1. **Pre-Workout Dynamic Warm-Up Screen (`WarmupPreSessionSheet`):**
   - Header: *"5-Min Dynamic Warm-Up • {FocusLabel}"* (aligned cleanly with `workouts.mjs` `300s` warm-up budget included in `estimatedSessionMinutes`!).
   - Displays 3–4 quick targeted drills (e.g., for `Upper`: *Arm Circles 30s*, *Scapular Wall Slides 10 reps*, *Band Pull-Aparts / Thoracic Rotations 10/side*, *Light Ramp-Up Set*).
   - Optional 30s/60s timer per drill + `[Check All & Begin Workout]` + `[Skip Warm-Up]` link (non-blocking for experienced lifters who warmed up on a treadmill).
2. **Post-Workout Cool-Down Stretch (`CooldownPostSessionSheet`):**
   - Triggered optionally from `SessionSummaryScreen` (`US-WRK-10`): *"Take 3 minutes to stretch {PrimaryMuscles}"* with 3 gentle static stretches (`30s` hold timer each) + `[Done]` button.

### API & BACKEND CONTRACT
- Driven deterministically by `workoutPlan` (`day.focus`, `day.exercises[].regions`, `workouts.mjs` `300s` warm-up budget) paired with `profile.injuries`, `profile.seniorMode`, and `profile.maternalStatus`. No extra per-drill network call needed — works 100% offline.

### RULES & BUSINESS LOGIC
1. **Injury-Safe Warm-up Filtering:** Never prescribe deep kneeling stretches to `knee_pain` users, overhead hangs to `shoulder_pain`, or loaded spinal twists to `lower_back_pain` users.
2. **Senior Mode Adaptation:** If `seniorMode == true`, prioritize seated/supported balance & joint-lubrication mobility drills.

### MAIN FLOW
1. User taps `[Start Workout]` on Lower Body day.
2. `WarmupPreSessionSheet` suggests *Hip Openers*, *Glute Bridges (Bodyweight)*, and *Ankle Mobility Rocks* (`~4 min`), filtering out deep jumping jacks for `knee` injury.
3. User ticks off drills and taps `[Begin Workout]`, launching `LiveWorkoutPlayer` smoothly.

### EDGE CASES
- **Express 20-Minute Session:** Keeps warm-up ultra-tight (`2` drills / `2–3 minutes`) so total workout duration stays strictly within the `20 min` budget.
- **Pregnant T2/T3 User (`maternalStatus != "none"`):** Excludes supine abdominal stretches during Cool-Down and substitutes seated hip-flexor / side-lying mobility.
- **User Skips Warm-Up:** Immediately launches `LiveWorkoutPlayer` with zero friction while showing a subtle reminder that first set of compounds should start light.
- **Zero-Signal Offline Gym:** Runs 100% deterministically offline from cached `workoutPlan` metadata with local countdown chime.

### ACCEPTANCE CRITERIA
- **Scenario 1: Warm-up drills match target muscles and respect injuries**
  - **Given** today's focus is `legs` and `injuries` includes `knee`
  - **When** `WarmupPreSessionSheet` renders
  - **Then** hip/glute mobility drills appear and jumping/high-knee-flexion drills are excluded.
- **Scenario 2: Senior mode replaces floor-based dynamic drills with supported standing/seated drills**
  - **Given** `profile.seniorMode == true`
  - **When** pre-workout warm-up opens
  - **Then** balance-supported drills display instead of floor jumps or rapid transitions.
- **Scenario 3: Post-workout cool-down targets muscles worked in the completed session**
  - **Given** user just completed Upper Pull session
  - **When** opening `CooldownPostSessionSheet` from Summary
  - **Then** lat, thoracic, and forearm static stretches (`30s` holds) display accurately.

### ANALYTICS
- `workout_warmup_viewed` (`focus`: `string`, `duration_min`: `integer`)
- `workout_warmup_completed` (`skipped`: `boolean`)
- `workout_cooldown_completed` (`skipped`: `boolean`)

---

## US-WRK-07: Exercise Demo Media, Interactive Muscle Map & Bilingual Form/Mistake Guide (868 Catalog)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-07` |
| **Epic** | `EPIC-05` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `workouts`, `catalog`, `media` |
| **Target Screens** | `ExerciseLibraryScreen`, `ExerciseDetailModal` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user unsure how to perform an exercise properly or exploring CuraFit's 868-exercise library, I want crisp animated demonstrations, an anatomical front/back muscle highlight map showing primary vs. secondary muscles, and clear step-by-step bilingual form cues and common mistakes so I lift safely with proper technique.

### PRECONDITIONS
- User taps `[Form Tips]` / exercise title inside the plan or opens `Exercise Library` from `Workouts` tab.

### SCREEN AND UI DETAILS
1. **Exercise Library Browser (`ExerciseLibraryScreen`):**
   - Search bar (`q`), **Muscle Filter Chips** (`Chest`, `Back`, `Shoulders`, `Biceps`, `Triceps`, `Legs`, `Abs`, etc., populated from `GET /v1/catalog/muscles`), and **Equipment Filter Chips** (`barbell`, `dumbbell`, `machine`, `cable`, `bodyweight`, `resistance_band`).
   - Paginated list (`30 items/page` via `offset` & `nextOffset`) + Catalog Provenance badge in footer (`GET /v1/catalog/manifest`).
2. **Exercise Detail View (`ExerciseDetailModal`):**
   - **Media Player Top Hero:** Smooth auto-looping MP4/WebP/GIF exercise animation when `mediaUrl` is populated (cached offline for all active plan exercises!) with crisp fallback start/end vector/illustration frames while `mediaUrl`/`thumbnailUrl` are `null` (until video assets are uploaded) or when offline and uncached.
   - **Anatomical Muscle Map (Front & Back SVG):** Primary muscles highlighted in solid brand accent; secondary assisting muscles highlighted in softer tint, with localized Arabic/English names from `/v1/catalog/muscles`.
   - **Metadata Pills:** Required Equipment, Force Vector (`Push/Pull`), Difficulty (`Beginner/Intermediate/Advanced`), Laterality (`Bilateral` / `Unilateral — Both Sides`), Tracking (`Weight & Reps` / `Bodyweight`).
   - **Structured Guide Tabs:**
     - `How to Perform` (numbered setup & execution cues)
     - `Common Mistakes to Avoid` (biomechanical safety tips)
     - `My History` (previous logged weights, estimated 1RM, personal best for this exercise!)

### API & BACKEND CONTRACT
1. **`GET /v1/exercises?q={q}&muscle={muscle}&equipment={equipment}&offset={n}`**
   - Equipment filter uses canonical catalog IDs (`barbell`, `dumbbell`, `machine`, `cable`, `bodyweight`, `resistance_band`, etc.).
   - Returns enriched items with `nameAr` (via `data/exercises-i18n.json`), `difficulty`, and nullable `mediaUrl` / `thumbnailUrl` (`string | null` until hosted video/animation assets are uploaded).
2. **`GET /v1/exercises/{urlEncodedId}`**
   - Returns full OpenExerciseDB metadata + `nameAr`, `instructionsEn`, `instructionsAr`, `commonMistakesEn`, `commonMistakesAr` (via `data/exercises-i18n.json`), nullable `mediaUrl` / `thumbnailUrl`, `muscles` (`primary` / `secondary`), `equipment`, `laterality`, `loadMode`.
3. **`GET /v1/catalog/muscles`** -> Canonical muscle IDs enriched with Arabic/English translations via `data/exercises-i18n.json` (`catalog.muscleTranslations`).
4. **`GET /v1/catalog/manifest`** -> Pinned OpenExerciseDB & food catalog provenance manifest.

### RULES & BUSINESS LOGIC
1. **Prefetch Active Plan Media:** Whenever a `workoutPlan` is downloaded (`US-AUTH-02` / `US-WRK-01`), proactively cache non-null thumbnails/animations (~20–35 exercises) in app disk cache so Live Workout Player animations run smoothly inside zero-signal basement gyms!
2. **URL Encoding for Exercise IDs:** Always URL-encode `exerciseId` when calling `/v1/exercises/{id}` (e.g., `oedb:73` -> `oedb%3A73`), matching `worker.mjs`.

### MAIN FLOW
1. User is on Bench Press in Simple or Pro Player and taps `[Form Tips]`.
2. `ExerciseDetailModal` opens instantaneously with demo media (or anatomical fallback), Chest/Triceps/Front-Delt SVG highlight, 4 bulleted execution steps, and `Common Mistakes` (e.g., *"Don't flare elbows to 90 degrees"*).
3. User switches to `My History` tab to see their best set (`65 kg × 8`), closes modal, and resumes set logging.

### EDGE CASES
- **Exercise Not Found (`404 EXERCISE_NOT_FOUND`):** Show friendly error card with `[Back to Library]`.
- **Media CDN Unreachable Offline or `mediaUrl == null`:** Show cached static start/end position illustrations + full offline text instructions cleanly without blank broken-image icons.
- **Dual-Language Arabic Script Search Query (`"Bench Press"` vs Arabic query):** Searches both English/transliterated movement names and Arabic localized metadata cleanly.
- **Catalog Filter Yielding 0 Matches (e.g., `Barbell` + `Abs`):** Clear empty state offering `[Clear Equipment Filter]` so user isn't stuck.

### ACCEPTANCE CRITERIA
- **Scenario 1: Library filters combine text query, muscle, and equipment**
  - **Given** user opens `ExerciseLibraryScreen`
  - **When** user selects muscle `"chest"` and equipment `"dumbbell"` and searches `"press"`
  - **Then** `GET /v1/exercises?q=press&muscle=chest&equipment=dumbbell&offset=0` returns matching exercises with pagination support.
- **Scenario 2: Exercise detail displays primary vs secondary muscle highlight**
  - **Given** user opens `Incline Dumbbell Fly` (`oedb:308`)
  - **When** `ExerciseDetailModal` renders
  - **Then** `Chest` shows as Primary muscle and `Shoulders` show as Secondary muscles.
- **Scenario 3: Offline cached plan exercise shows instructions and cached demo cleanly**
  - **Given** user is offline inside a gym
  - **When** user taps `[Form Tips]` on a planned movement
  - **Then** prefetched animation (or anatomical fallback when `mediaUrl == null`) + full bilingual setup cues render immediately from local storage.

### ANALYTICS
- `exercise_library_searched` (`q`: `string`, `muscle`: `string`, `equipment`: `string`, `results_total`: `integer`)
- `exercise_detail_viewed` (`exercise_id`: `string`, `source`: `"live_player" | "schedule" | "library"`)

---

## US-WRK-08: Live & Planned Exercise Swap (Equipment-, Injury- & Time-Budget-Safe Substitutions)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-08` |
| **Epic** | `EPIC-05` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `workouts`, `swaps` |
| **Target Screens** | `ExerciseAlternativesSheet` |
| **Entitlement** | `Freemium` (`Free`: 2 voluntary exercise swaps/week; `Pro`: unlimited swaps + instant injury-fix swaps always `Free`!) |
| **Backend Status** | `Implemented` |

### STORY
As a user at a busy gym where a machine is taken or an exercise causes discomfort, I want to swap any planned exercise for biomechanically equivalent alternatives already filtered for my injuries, available equipment, and remaining session time budget so my workout stays safe and uninterrupted.

### PRECONDITIONS
- Target exercise exists in `workoutPlan.days` for `dayIndex`.

### SCREEN AND UI DETAILS
1. **Exercise Alternatives Bottom Sheet:**
   - Top card: *"Replacing: {currentExerciseName} ({sets} sets × {repMin}–{repMax} reps)"*.
   - List of up to 6 validated alternatives from `GET /v1/exercise-alternatives`:
     - Thumbnail animation preview, Exercise Name (AR/EN), Required Equipment badge (`Dumbbells` / `Cable` / `Bodyweight`), Target Muscles, and **Time Impact Pill** (`"Same duration"` or `"+2 min — fits 45m budget"`).
     - `[Swap Exercise]` CTA button.
   - **Important Safety Exemption:** If `workoutSafetyIssues` flagged the current exercise as injury-unsafe, show urgent green banner `"Free Safety Swap — Removing Excluded Movement"` (never Paywall-gate safety fixes!).

### API & BACKEND CONTRACT
1. **`GET /v1/exercise-alternatives?dayIndex={0..6}&exerciseId={id}`**
   - Returns up to 6 enriched movements matching movement pattern (`squat`, `horizontal_push`, etc.), primary muscle overlap, user equipment, difficulty level, injury/maternal/senior exclusions, and `estimatedSessionMinutes <= sessionDuration`.
2. **`POST /v1/commands?view=receipt`** (`action: "replace_exercise"`)
   - Payload: `{ "dayIndex": 1, "exerciseId": "oedb:73", "alternativeId": "oedb:75" }`.
   - Enforces Free weekly voluntary swap quota (`2/week` via `coaching_usage_quotas` when entitlement enforcement is enabled; unlimited on Pro), returning `402 PRO_ENTITLEMENT_REQUIRED` when exceeded; **automatically bypasses quota** whenever the swapped exercise is flagged in `workoutSafetyIssues`.
   - Note: `replace_exercise` forks the workout plan cleanly (`forkWorkout` increments `workoutPlan.version`, sets `parent_id`, archives old version in `workoutArchives`, and preserves historical `workoutLogs` and accepted future calendar moves!). After `200 OK`, fetch `GET /v1/workout-plans/{newPlanId}` or reconcile outbox delta.
   - Error Codes: `EXERCISE_ALTERNATIVE_INVALID`, `EXERCISE_NOT_IN_DAY`, `402 PRO_ENTITLEMENT_REQUIRED`.

### RULES & BUSINESS LOGIC
1. **Progression Lineage Preservation:** Changing an exercise assigns a fresh `progressionKey` to the new movement while preserving progression lineage on every unchanged exercise in the forked plan (`training-state.mjs` `forkWorkout`).
2. **Time Budget Enforcement:** Backend refuses alternatives that push `estimatedSessionMinutes` past `sessionDuration`; if user already started logging sets for the old exercise in today's session before swapping mid-session, inform user *"Previous sets stay in history; start fresh sets on {newExercise}"*.

### MAIN FLOW
1. User enters the gym for Push Day; the Bench Press station is out of order.
2. User taps `[Swap]` right inside Live Player -> `GET /v1/exercise-alternatives` returns *Dumbbell Bench Press (`oedb:75`)*, *Decline Dumbbell Fly (`oedb:239`)*, and *Incline Dumbbell Fly (`oedb:308`)*.
3. User taps *Dumbbell Bench Press* -> `[Swap Exercise]`.
4. `replace_exercise` commits, updated plan loads seamlessly into Live Player, and user immediately starts Dumbbell Bench Press.

### EDGE CASES
- **Zero Valid Alternatives Returned (Strict Home Bodyweight + Multiple Injuries):** Explain clearly *"No other exercises in our safe catalog fit your exact movement pattern, equipment, and injury constraints for this time budget."* and offer `[Skip Exercise Today]`.
- **Offline Swap Attempt:** Disable swap (requires server fork validation) with offline notice.
- **Mid-Session Swap After Logging 1 Set on Old Exercise:** Retains the 1 logged set cleanly in history and starts Set 1 on the newly forked alternative without double-penalizing `sessionCompletion`.
- **Free Weekly Swap Limit Reached (`2/2` Voluntary Swaps Used):** Shows `ContextualProUpsellSheet` (`US-MON-01`), while keeping injury-safety swaps (`workoutSafetyIssues.length > 0`) 100% Free!

### ACCEPTANCE CRITERIA
- **Scenario 1: Exercise swap replaces movement and recalculates session minutes**
  - **Given** a planned exercise in `dayIndex = 1`
  - **When** the user selects a returned alternative and commits `replace_exercise`
  - **Then** `workoutPlan.version` increments, old version is archived, `estimatedMinutes <= sessionDuration` holds, and historical logs remain intact.
- **Scenario 2: Safety-flagged exercise swaps bypass Free tier swap limits**
  - **Given** a Free user has `workoutSafetyIssues.length > 0`
  - **When** swapping the unsafe exercise
  - **Then** the swap proceeds without Paywall blocking.
- **Scenario 3: Voluntary 3rd weekly swap by Free user triggers contextual paywall**
  - **Given** Free user already performed 2 voluntary exercise swaps this week with zero safety flags
  - **When** tapping Swap on another movement
  - **Then** the Soft Paywall explains unlimited swaps in CuraFit Pro without disrupting the current workout.

### ANALYTICS
- `exercise_alternatives_viewed` (`exercise_id`: `string`, `count`: `integer`, `in_live_player`: `boolean`)
- `exercise_swapped` (`old_exercise_id`: `string`, `new_exercise_id`: `string`, `is_safety_fix`: `boolean`)

---

## US-WRK-09: Flexible Workout Rescheduling (14-Day One-Off Rest-Day Move) & Missed Session Logging

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-09` |
| **Epic** | `EPIC-05` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `workouts`, `reschedule` |
| **Target Screens** | `RescheduleWorkoutSheet`, `MissedSessionReasonSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user with an unexpected busy day, illness, or travel, I want to reschedule a planned workout to an upcoming rest day within the next 14 days (without double-booking or losing nutrition alignment) or cleanly mark a session as Missed so my schedule stays realistic without guilt.

### PRECONDITIONS
- `workoutPlan` exists and at least 1 uncompleted scheduled workout falls within `today..today+13`.

### SCREEN AND UI DETAILS
1. **Reschedule Workout Bottom Sheet (`RescheduleWorkoutSheet`):**
   - Header: *"Move {FocusLabel} ({currentDate}) to a Rest Day"*
   - Displays a 14-day mini-calendar starting `today` through `today + 13`:
     - **Rest Days:** Highlighted tappable green/slate slots (`"Available Rest Day"`).
     - **Occupied Training Days / Completed Dates:** Grayed out with lock badge (`"Occupied — Workout Scheduled"`).
   - **Confirmation Banner:** *"Moving this workout preserves your daily calorie targets and keeps your weekly session count balanced."*
   - **Primary CTA:** `[Confirm Move to {SelectedDate}]` (Executes `reschedule` AND transparently presents/commits the resulting `schedule` proposal via `adaptation`, explaining in 1 smooth UX flow!).
2. **Mark Missed Flow (`MissedSessionReasonSheet`):**
   - Triggered when tapping `[Mark Missed]` on today's/past scheduled workout:
     - Optional quick reason chips (`Too Busy`, `Fatigued / Need Rest`, `Mild Pain`, `Gym Unavailable`, `Skip Reason`) — tapping a barrier optionally logs `coaching_feedback` (`domain: "training"`) for empathetic coach follow-up!
     - `[Confirm Missed Session]` -> Calls `session` (`status: "missed"`).

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "reschedule"`)
   - Payload: `{ "dayIndex": 3, "toDate": "2026-11-24" }`.
   - **Important Backend Flow Note:** `reschedule` creates a `pending` adaptation of `kind: "schedule"` inside `s.adaptations`. Unless the user wants to review it separately in Coach Inbox (`US-CCH-03`), when the user explicitly tapped `[Confirm Move to {SelectedDate}]` in this sheet, the client automatically chains step 2:
2. **`POST /v1/commands?view=receipt`** (`action: "adaptation"`)
   - Payload: `{ "id": "<proposalIdFromScheduleReceipt>", "accept": true }`.
   - *(Client passes `view=full` on `reschedule` or extracts the created `pendingAdaptations` ID to immediately finalize `adaptation` `accept: true` on user confirmation!)*
3. **`POST /v1/commands?view=receipt`** (`action: "session"`)
   - Missed Payload: `{ "date": "2026-11-21", "dayIndex": 6, "status": "missed", "notes"?: string }`.
   - Error Codes: `RESCHEDULE_DATE_OUT_OF_RANGE`, `RESCHEDULE_DAY_OCCUPIED`, `RESCHEDULE_DATE_UNCHANGED`, `SESSION_ALREADY_COMPLETED` (`409` if source session is already completed), `WORKOUT_DAY_NOT_IN_PLAN`, `ADAPTATION_SCHEDULE_DATE_PASSED`.

### RULES & BUSINESS LOGIC
1. **Strict 14-Day Window (`today .. today+13`):** Only dates in `[serverDate, dateOffset(serverDate, 13)]` that have zero scheduled or completed sessions are selectable.
2. **Zero Calorie Inflation & Zero Session Doubling:** Moving a session never adds extra total sessions per week (`IMPLEMENTATION.md`) and never alters food calories automatically.
3. **Never Double Effort After Missed Session:** When a user marks a session `missed`, Coach UI explicitly reminds *"Rest and pick up normally at your next session — never double workouts to make up for a missed day."*

### MAIN FLOW
1. User realizes Wednesday evening is slammed with family dinner; opens `Workouts` -> taps `[Move Day]` on Wednesday (`Pull Day`).
2. `RescheduleWorkoutSheet` shows Thursday (`Nov 26`) as an Available Rest Day.
3. User taps `Nov 26` and taps `[Confirm Move to Nov 26]`.
4. Client executes `reschedule` -> accepts the created `schedule` adaptation (`adaptation` `accept: true`) -> 14-day calendar updates instantly to show Rest on Wednesday and Pull Day on Thursday.

### EDGE CASES
- **User Trains 6 Days/Week & Moves Session to the Only Rest Day, Then Tries Moving Another:** Target day becomes occupied; second move shows `RESCHEDULE_DAY_OCCUPIED` disabled visually.
- **Session Already Completed Today (`status == "completed"`):** `[Move Day]` is disabled for completed dates.
- **Network Drops Between Step 1 (`reschedule`) & Step 2 (`adaptation` Accept):** Pending `schedule` adaptation remains safely in `Coaching Inbox` (`US-CCH-03`) or auto-completes on next retry without corrupting schedule state.
- **Date Past 13-Day Horizon (`> today + 13`):** Target picker constrains strictly to `[today .. today+13]` so `RESCHEDULE_DATE_OUT_OF_RANGE` cannot occur.

### ACCEPTANCE CRITERIA
- **Scenario 1: Moving workout to rest day updates projected calendar**
  - **Given** `dayIndex = 3` (Wednesday) is scheduled and Thursday (`today+3`) is a Rest day
  - **When** user confirms moving Wednesday to Thursday
  - **Then** `reschedule` and `adaptation` (`accept: true`) commit and `scheduledSessions` places `dayIndex = 3` on Thursday.
- **Scenario 2: Moving onto occupied training day is prevented**
  - **Given** Friday already has a scheduled Legs workout
  - **When** user views `RescheduleWorkoutSheet`
  - **Then** Friday appears disabled/occupied and cannot be selected.
- **Scenario 3: Marking session missed records optional barrier without calorie punishment**
  - **Given** user opens `MissedSessionReasonSheet` and chooses barrier `"Too Busy"`
  - **When** confirming `[Confirm Missed Session]`
  - **Then** `session` (`status: "missed"`) commits alongside optional `coaching_feedback` while daily calorie targets remain unchanged.

### ANALYTICS
- `workout_rescheduled` (`day_index`: `integer`, `from_date`: `string`, `to_date`: `string`)
- `workout_marked_missed` (`day_index`: `integer`, `reason_barrier`: `string | null`)

---

## US-WRK-10: Session Completion Reconciliation (`>= 80%`), Session Delete, RPE/Duration, Personal Records Summary & Shareable Card

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-10` |
| **Epic** | `EPIC-05` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `workouts`, `completion`, `pr`, `sharing` |
| **Target Screens** | `FinishWorkoutSheet`, `WorkoutSummaryScreen` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user finishing a workout session, I want to record how long the session took, how hard it felt (`RPE 1–10`), and optional session notes, see whether my completed sets earned Full Completion (`>= 80%`) or Partial credit honestly (with the option to resume a partial session or delete an erroneous workout/session), review any new Personal Records (PRs) in weight/reps/volume/1RM cleanly, and optionally share a crisp summary card on Instagram/WhatsApp.

### PRECONDITIONS
- User logged at least 1 exercise set during today's session (`actualSets >= 1`, enforcing `SESSION_REQUIRES_ACTUAL_SETS`).

### SCREEN AND UI DETAILS
1. **Finish Workout Review Sheet (`FinishWorkoutSheet`):**
   - Displays transparent completion coverage bar:
     - e.g. `17 / 18 prescribed sets completed (94% Full Session)` OR `9 / 18 sets completed (50% • Partial Session)`.
     - **Explicit Rule Hint if `< 80%`:** *"Sessions below 80% of prescribed sets (or missing Both Sides on unilateral moves) are saved as Partial so your coach doesn't prematurely increase your load. You can resume this workout later today to reach 80%+ completion."*
   - Pre-filled **Elapsed Duration (min)** (`1..240`, from live workout timer, editable) + optional **Session Notes (`max 300` chars)**.
   - **Session RPE Slider (`1..10`)** with crisp athletic intensity bands (`1-4 Light`, `5-6 Moderate`, `7-8 Challenging`, `9-10 Max Effort`).
   - Primary CTA: `[Save & Finish Workout]`.
2. **Workout Summary & Personal Records Screen (`WorkoutSummaryScreen`):**
   - Calm Strava/Hevy-caliber athletic summary (zero confetti cannons or childish trophy icons) + Streak progress badge (`Week Streak Updated`).
   - **Session Highlights Grid:** Total Duration, Exercises Completed, Total Volume (`kg` lifted, hidden/replaced by Total Reps in Simple Mode when `kg == 0`), Session Status badge (`Completed` / `Partial`).
   - **New PRs Unlocked Card** *(from `GET /v1/workouts/prs`)*: Highlights crisp athletic PR tags: `New Best Load` (or `Lowest Assisted Weight` for `loadMode === "assisted"`, including first-time weight PRs), `New Rep PR`, `Highest Volume`, and `New Est. 1RM` (`1 <= reps <= 15`) per exercise.
   - **Action Buttons:** `[3-Min Cool-Down Stretch]` (`US-WRK-06`) | `[Share Workout Card]` (renders clean branded portrait PNG card for Instagram Stories / WhatsApp) | `[Back to Today]`.

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "session"`)
   - Payload: `{ "date": "2026-11-21", "dayIndex": 6, "status": "completed", "duration": 44, "rpe": 7, "notes": "Strong pressing day" }`.
   - **Server Reconciliation Rule (`training-state.mjs`):** Even if client passes `status: "completed"`, server evaluates `completionRatio = completedSets / expectedSets`. If `< 0.80` (including unilateral logs lacking `bothSides: true`), server stores `status = "partial"` cleanly! Resuming a `partial` session preserves already-logged sets and promotes `status` to `"completed"` automatically once `completionRatio >= 0.80`.
2. **`POST /v1/commands?view=receipt`** (`action: "session_delete"`) & **`action: "workout_delete"`**
   - `session_delete` payload: `{ "id": "<sessionId>", "deleteWorkouts"?: true }` OR `{ "date": "YYYY-MM-DD", "dayIndex": 6, "deleteWorkouts"?: true }` (`404 SESSION_NOT_FOUND`; `deleteWorkouts: true` removes attached workout logs together).
   - `workout_delete` payload: `{ "id": "<workoutLogId>" }` (`404 WORKOUT_LOG_NOT_FOUND`); automatically reconciles session coverage.
3. **`GET /v1/workouts/prs?since={YYYY-MM-DD_or_ISO}&exerciseId={optional}`** (`?since=` normalizes both ISO timestamps and calendar dates cleanly)
   - Unified schema returning:
     ```json
     {
       "items": [
         {
           "exerciseId": "oedb:73",
           "name": "Barbell Bench Press",
           "nameAr": null,
           "type": "heaviest_kg",
           "prType": "weight",
           "value": 62.5,
           "previousValue": 60,
           "reps": 10,
           "loadMode": "external",
           "achievedAt": "2026-11-21T18:30:00.000Z",
           "date": "2026-11-21"
         }
       ],
       "summaryByExercise": {
         "oedb:73": {
           "exerciseId": "oedb:73",
           "name": "Barbell Bench Press",
           "nameAr": null,
           "loadMode": "external",
           "heaviestWeightKg": 62.5,
           "bestRepsAtWeight": 10,
           "highestVolumeKg": 1812.5,
           "estimated1RM": 83.3
         }
       }
     }
     ```
   - **PR Engine Rules (`server/workouts-insights.mjs`):**
     - Emits canonical `type` (`heaviest_kg | best_reps | highest_volume | estimated_1rm`), `prType` (`weight | reps | volume | 1rm`), `reps`, and `loadMode`.
     - Excludes sets with `setType === "warmup"` and **`pain === true`**.
     - Supports explicit **`kg > 0` in Simple Mode** (skips weighted Simple Mode logs only when zero sets have `kg > 0`).
     - Restricts **`estimated_1rm`** (Epley formula `kg * (1 + reps / 30)`) strictly to **`1 <= reps <= 15`** and excludes `loadMode === "assisted"`.
     - Emits **first-time weight PRs** (`previousValue: null`), and **inverts weight PR direction (lower assisted `kg` is better)** whenever `loadMode === "assisted"`.
   - Error Codes: `SESSION_REQUIRES_ACTUAL_SETS`, `INVALID_WORKOUT_SESSION`, `SESSION_NOT_FOUND`, `WORKOUT_LOG_NOT_FOUND`.

### RULES & BUSINESS LOGIC
1. **Prevent Zero-Set Fake Completions:** Client disables `[Finish Workout]` if `actualSets == 0`, showing `"Log at least 1 set or mark session as Missed"`.
2. **Simple Mode Compatibility:** Because Simple Mode writes full integer sets (`kg: 0` or optional explicit `kg > 0`, `reps`, `bothSides: true`) via `workout` (`US-WRK-03`), `completionRatio` reaches `100%` cleanly and marks `status = "completed"` honestly!
3. **Shareable Privacy Safety:** The shared PNG workout summary card NEVER includes body weight, injuries, medical conditions, or calories — only workout title, duration, exercises/volume (optional toggle), streak, and CuraFit branding.
4. **Comeback Integration (`US-CCH-06`):** After an absence of `>= 7` days, accepting `comeback_restart` (`{ tier?, mode?, applyDeload?, deloadDurationDays?, updatedWeightKg?, currentWeightKg?, reason?, renewMealPlan? }`) activates a `0.8x` working-set ramp-in automatically so returning sessions stay achievable and still earn `completed` status cleanly.

### MAIN FLOW
1. User finishes Exercise 6 of 6 (`18 / 18` sets = `100%`).
2. `FinishWorkoutSheet` opens showing `Duration: 42 min` and user selects `RPE: 8`, then taps `[Save & Finish Workout]`.
3. `session` commits, fetches detected PRs (`Bench Press: New 3x10 PR at 62.5 kg`), and displays `WorkoutSummaryScreen`.
4. User taps `[Back to Today]` -> Today's Workout Card now displays `"Completed • 42 min"`.

### EDGE CASES
- **User Ends Session Early After 2 of 6 Exercises (`6/18` sets = `33%`):** Sheet clearly explains *"Logged 33% of sets — will save as Partial Session"* so user isn't surprised when `Sessions` lists it as `Partial`; resuming later today preserves those 6 sets and updates to `Completed` once `>= 80%` sets are logged.
- **Unilateral Exercise Logged Without Both-Sides Confirmation:** Counts `0` toward `completedSets` for `>= 80%` threshold; Finish sheet warns *"Confirm Left & Right sides on Single-Arm Row for full credit."*
- **Simple Mode Session With Zero `kg` Weights Recorded:** Celebration screen displays Total Reps, Active Sets Completed, and Consistency Streak instead of `0 kg Total Volume` so Simple Mode feels genuinely rewarding!
- **Warm-Up Only or Pain-Flagged Sets (`setType: "warmup"` / `pain: true`):** Never inflate `>= 80%` completion or false-trigger PR badges.

### ACCEPTANCE CRITERIA
- **Scenario 1: Session below 80% set completion reconciles as `partial`, and resuming upgrades to `completed`**
  - **Given** `expectedSets == 18` and user logged `10` sets (`55.6% < 80%`)
  - **When** `session` commits
  - **Then** server and UI store `status == "partial"`, and resuming later to log 5+ more sets (`>= 80%`) upgrades `status` to `"completed"` while preserving earlier sets.
- **Scenario 2: Zero-set session completion is blocked**
  - **Given** user started a workout and logged `0` sets
  - **When** tapping Finish
  - **Then** Finish is blocked (`SESSION_REQUIRES_ACTUAL_SETS`) and prompts logging at least 1 set or marking Missed.
- **Scenario 3: PR engine excludes `pain: true` sets and bounds `estimated_1rm` to `1..15` reps**
  - **Given** a lifter logs a heavy set marked `pain: true` and a 20-rep high-rep set
  - **When** `GET /v1/workouts/prs` computes PRs
  - **Then** the pain-flagged set is excluded from all PRs and the 20-rep set does not emit an `estimated_1rm` PR.
- **Scenario 4: Shareable workout image hides clinical/private biometric data**
  - **Given** user achieved 2 PRs and has `injuries: ["knee"]` and `weight: 81.4`
  - **When** generating the shareable summary card PNG
  - **Then** card renders workout title, duration, PR badges, and CuraFit branding with zero weight, calories, or clinical details.

### ANALYTICS
- `workout_session_completed` (`status`: `"completed" | "partial"`, `completion_ratio`: `number`, `duration_min`: `number`, `rpe`: `number`, `prs_count`: `integer`)
- `workout_summary_shared` (`ui_mode`: `"simple" | "pro"`, `has_prs`: `boolean`)

---

## US-WRK-11: Dedicated Cardio & Walking Session Tracking

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-WRK-11` |
| **Epic** | `EPIC-05` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `workouts`, `cardio`, `walking`, `activity` |
| **Target Screens** | `LogCardioSheet`, `CardioHistorySection` (inside `Workouts` tab & `Today` Activity card) |
| **Entitlement** | `Free` *(Core fitness tracking across all service tracks including `nutrition_only`)* |
| **Backend Status** | `Implemented` (`GET /v1/cardio-logs`, `cardio_log`, `cardio_delete`) |

### STORY
As a user who walks briskly, runs, cycles, swims, or plays sports alongside (or instead of) gym resistance workouts, I want a clean 10-second cardio logger that records my modality, duration, intensity, and optional distance, estimates active calories transparently by MET formula, boosts my daily hydration goal when sessions exceed 30 minutes, warns me safely if a high-impact activity conflicts with my injuries or pregnancy, and counts toward my consistency streak without artificially inflating my diet calorie target.

### PRECONDITIONS
- User is authenticated (`onboardingCompleted == true`; works across `nutrition_and_workouts`, `workouts_only`, and `nutrition_only`).

### SCREEN AND UI DETAILS
1. **Log Cardio Bottom Sheet (`LogCardioSheet` — Launched from `+` Quick-Log, `Today` Activity Card, or `Workouts` Tab):**
   - **Modality Grid (10 Clean Icons — exact backend `CARDIO_MODALITIES` keys):** `Walking` (`walking`), `Brisk Walking` (`brisk_walking`), `Running` (`running`), `Cycling` (`cycling`), `Stationary Bike` (`stationary_bike`), `Swimming` (`swimming`), `Elliptical` (`elliptical`), `Rowing` (`rowing`), `Jump Rope` (`jump_rope`), `HIIT` (`hiit`).
   - **Duration Input (`5..360` min):** Quick preset chips (`15m`, `30m`, `45m`, `60m`) + custom stepper.
   - **Intensity Selector:** `Low (Conversational)` | `Moderate (Brisk)` | `Vigorous (Hard)`.
   - **Optional Fields:** Distance (`km` or `mi` converted to `km`, `0.01..300`), Manual Calories Override (`10..5000 kcal`, defaults to live **ACSM MET** estimate), Date (`past 90 days..today`), Notes (`<= 200` chars).
   - **Non-Blocking Safety Caution Strip (`CARDIO_HIGH_IMPACT_CAUTION`):** If `modality` is high-impact (`running | jump_rope | hiit`) AND user has `knee_pain` / `ankle_pain` / `lower_back_pain` / `hip_pain`, pregnancy (`pregnant_t1|t2|t3`), or `seniorMode == true`, displays a calm amber tip suggesting lower-impact alternatives (`brisk walking`, `cycling`, `swimming`) while still permitting logging if cleared by user.
2. **Today Activity & Cardio Summary Strip:**
   - Displays today's logged cardio sessions (e.g., `"Brisk Walk • 35 min • ~175 kcal"`) with swipe-to-delete (`cardio_delete`).
   - Clear info caption: *"Cardio boosts your hydration goal and streak — diet calories stay aligned to your deterministic plan."*

### API & BACKEND CONTRACT
1. **`GET /v1/cardio-logs?from={YYYY-MM-DD}&to={YYYY-MM-DD}&offset=0&limit=30`**
   - Returns paginated `{ total, offset, limit, nextOffset, items: [{ id, date, modality, durationMinutes, intensity, distanceKm, estimatedKcal, caloriesSource, safetyCaution, notes, source, externalRecordId, at }] }` (`caloriesSource`: `"user_or_wearable"` | `"met_estimate"`).
2. **`POST /v1/commands?view=receipt`** (`action: "cardio_log"`)
   - Payload: `{ "date": "2026-11-21", "modality": "walking", "durationMinutes": 35, "intensity": "moderate", "distanceKm": 3.2, "notes": "Evening corniche walk", "source": "manual" }`.
   - Server computes **ACSM MET-based `estimatedKcal`** (`round(MET * weightKg * (durationMinutes / 60))`, setting `caloriesSource: "met_estimate"`) when `caloriesKcal` is omitted (`caloriesSource: "user_or_wearable"` when provided), deduplicates by `externalRecordId`, enforces max `5` sessions per date (`400 CARDIO_DAILY_LIMIT_EXCEEDED`), and attaches `safetyCaution` (`code: "CARDIO_HIGH_IMPACT_CAUTION"`) when high-impact conflicts with injury/pregnancy/senior constraints.
3. **`POST /v1/commands?view=receipt`** (`action: "cardio_delete"`)
   - Payload: `{ "id": "<cardioLogId>" }` (`404 CARDIO_LOG_NOT_FOUND`).
   - Error Codes: `INVALID_CARDIO_PAYLOAD`, `CARDIO_DAILY_LIMIT_EXCEEDED`, `CARDIO_LOG_NOT_FOUND`, `DATE_IN_FUTURE`, `DATE_TOO_OLD`.

### RULES & BUSINESS LOGIC
1. **Zero TDEE Double-Counting:** Consistent with `US-HOME-06`, logged cardio does **not** automatically add eat-back calories onto the daily nutrition plan target; instead, real weight trends feed into the 14-day adaptive review (`US-CCH-03`).
2. **Smart Hydration Boost (`dailyWaterTarget`):** Logging `>= 30` cumulative cardio minutes on a non-resistance-training date adds `+0.5 L` (`+2` cups) to `dailyWaterTarget(s, date)` (capped cleanly at `2.0..5.0 L`, never double-stacked on top of an already-applied resistance-day `+0.5 L` boost).
3. **Gentle Streak & Weekly Wrapped Credit:** Logging `>= 20` cumulative cardio minutes qualifies the date for the active Gentle Streak (`US-PRG-04`), and `GET /v1/progress/weekly-wrapped` surfaces `cardioSessionsCount` and `cardioMinutes`.
4. **Red-Flag Recovery Guard:** When `recovery.status == "stop"` (`RED_FLAGS_STOP`), `LogCardioSheet` displays the urgent medical-rest banner (`US-CCH-02`) advising rest before logging vigorous movement.
5. **GDPR & Offline Sync:** Persisted in `coaching_cardio_logs`, works 100% offline via `outbox_commands`, included in `GET /v1/account/export`, and erased permanently in `DELETE /v1/account/delete`.

### MAIN FLOW
1. User taps `+` Quick-Log -> `Log Cardio`.
2. User selects `Walking`, taps `30m`, picks `Moderate`, and taps `[Save Cardio]`.
3. `cardio_log` commits (`estimatedKcal: 155`), Today's hydration target updates (`+2 cups`), Today Activity card displays `Walking • 30m`, and Gentle Streak marks today qualified.

### EDGE CASES
- **High-Impact Cardio Logged by Knee-Injury or Pregnant User:** Server records the entry cleanly and attaches `safetyCaution: { code: "CARDIO_HIGH_IMPACT_CAUTION", ... }`; UI shows a non-punitive low-impact swap suggestion (`walking`, `swimming`, `cycling`).
- **Duplicate Wearable Cardio Import (`externalRecordId`):** Server deduplicates cleanly without creating duplicate sessions or inflating Weekly Wrapped minutes.
- **More Than 5 Sessions on One Calendar Date:** Server rejects the 6th entry cleanly with `400 CARDIO_DAILY_LIMIT_EXCEEDED`.
- **Accidental Entry Deleted (`cardio_delete`):** Removes the log cleanly and recalculates Today's hydration target & cardio total immediately.

### ACCEPTANCE CRITERIA
- **Scenario 1: Cardio session computes MET calories and boosts rest-day water target**
  - **Given** an `80 kg` user on a rest day logs `35 min` moderate `walking` without manual calories
  - **When** `cardio_log` commits
  - **Then** server computes deterministic MET `estimatedKcal`, adds `+0.5 L` to today's `dailyWaterTarget`, and exposes today's cardio total inside `bootstrap.todaySummary.cardio`.
- **Scenario 2: High-impact cardio triggers safety caution for knee injury or pregnancy**
  - **Given** a user with `injuries: ["knee_pain"]` or `maternalStatus: "pregnant_t2"`
  - **When** logging `running` or `hiit` via `cardio_log`
  - **Then** the saved record includes `safetyCaution.code == "CARDIO_HIGH_IMPACT_CAUTION"`.
- **Scenario 3: Deleting a cardio session removes it from logs and recalculates totals**
  - **Given** a logged cardio session `id`
  - **When** `cardio_delete` commits
  - **Then** `GET /v1/cardio-logs` no longer contains that session and Weekly Wrapped totals reflect the removal.

### ANALYTICS
- `cardio_session_logged` (`modality`: `string`, `duration_min`: `integer`, `intensity`: `string`, `had_safety_caution`: `boolean`)
- `cardio_session_deleted` (`cardio_id`: `string`)
