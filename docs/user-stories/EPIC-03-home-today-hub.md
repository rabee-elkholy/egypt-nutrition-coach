# EPIC-03: Today Dashboard, Quick-Log Hub & Adaptive Daily Experience

> **Epic ID:** `EPIC-03`
> **Target Platforms:** KMM (Android Jetpack Compose & iOS SwiftUI)
> **Scope:** Production
> **Labels:** `production`, `mobile`, `home`, `today-hub`

---

## Epic Overview

`EPIC-03` defines the primary post-onboarding command center (**Today Tab**) and the global **5-Tab Coach-First Navigation Shell** (`Today`, `Nutrition`, `Workouts`, `Coach`, `Profile` + floating `+` Quick-Log Action Button). Designed for sub-3-second daily check-ins, it surfaces calories/macros, fasting/Ramadan timers, next meal, today's workout/rest status, hydration, quick weight, steps/activity, and daily coach priorities — while adapting gracefully when the user's `serviceTrack` is `nutrition_only` or `workouts_only`.

### Child User Stories
- `US-HOME-01`: Today Dashboard Shell, 5-Tab Adaptive Navigation & Service-Track Adaptation
- `US-HOME-02`: Daily Calorie, Macro Rings & Live Fasting / Ramadan Status Hero Card
- `US-HOME-03`: Today's Schedule Stream (Next Meal, Today's Workout / Rest & Daily Coach Brief Banner)
- `US-HOME-04`: Quick-Log Hydration Tracker & Rapid Body Weight Check-In
- `US-HOME-05`: Floating Quick-Log (`+`) Action Sheet (Multi-Modal Universal Logger)
- `US-HOME-06`: Daily Steps & Active Energy Card with Manual Entry & Wearables Live Sync Badge

---

## US-HOME-01: Today Dashboard Shell, 5-Tab Adaptive Navigation & Service-Track Adaptation

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-HOME-01` |
| **Epic** | `EPIC-03` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `navigation`, `today-hub` |
| **Target Screens** | `MainTabScaffold`, `TodayDashboardScreen`, `TrackLockedDiscoveryCard` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As an active CuraFit user opening the app each day, I want a fast, clean 5-tab navigation shell centered on a Today Dashboard that adapts automatically to my chosen service track (`Nutrition + Workouts`, `Nutrition Only`, or `Workouts Only`) so that I only see tools relevant to my goals without clutter.

### PRECONDITIONS
- User has `onboardingCompleted == true` and a cached/synced `profile` in SQLDelight.
- `GET /v1/bootstrap` has been queried or cached locally.

### SCREEN AND UI DETAILS
1. **Persistent Bottom Navigation Bar (5 Tabs + Elevated Center/Side `+` FAB):**
   - **Tab 1 — `Today`:** Sun/Home icon -> `TodayDashboardScreen`.
   - **Tab 2 — `Nutrition`:** Utensils/Bowl icon -> `NutritionHubScreen` (`EPIC-04`).
     - *If `serviceTrack == "workouts_only"`:* Shows a clean discovery screen *"Nutrition Plan Inactive"* with quick `[Explore Food & Calorie Catalog]` link and 1-tap `[Enable Nutrition Plan]` CTA (routes to `US-PRF-03`).
   - **Floating Action Button (`+` Quick-Log):** Elevated circular brand-primary button (`56dp`) -> Opens `QuickLogBottomSheet` (`US-HOME-05`).
   - **Tab 3 — `Workouts`:** Dumbbell icon -> `WorkoutScheduleScreen` (`EPIC-05`).
     - *If `serviceTrack == "nutrition_only"`:* Shows *"Workout Plan Inactive"* with `[Browse 868 Exercise Library]` link and 1-tap `[Add Workout Program]` CTA (routes to `US-PRF-03`).
   - **Tab 4 — `Coach`:** Sparkle/Coach Avatar icon (with unread red/amber dot if `pendingAdaptations.length > 0` or `unreadCoachingInboxCount > 0`) -> `CoachHubScreen` (`EPIC-06`).
   - **Tab 5 — `Profile`:** User Avatar / Person icon -> `ProfileOverviewScreen` (`EPIC-09`).
2. **Today Top Header Bar:**
   - Personalized greeting in user's language (`"Good morning, {name}"` / localized greeting by `timezone`), current date selector strip (`Today` + quick swipe across last 7 days), subtle **Gentle Streak Pill** (`🔥 6 Days`, taps to `US-PRG-04`), and **Notification Bell / Sync Pill** (`US-AUTH-04`).
   - If `seniorMode == true`, display subtle `"Senior Safety Mode"` pill and ensure minimum `16sp` body font scaling.
   - If `maternalStatus != "none"`, display reassuring maternal badge (e.g., `"2nd Trimester Plan"` or `"Breastfeeding Plan"`).
3. **Interactive States:**
   - **First Render / Skeleton:** Render immediately from SQLDelight (`< 100ms` cold start) with subtle background refresh; show skeleton cards ONLY on brand-new restore prior to hydration.
   - **Pending Confirmation Banner (Top Priority Slot):**
     - If `eligibility.needsScheduleConfirmation == true` -> Persistent amber card `[Confirm Weekly Workout Days]` (`US-WRK-01`).
     - If `eligibility.needsHealthConfirmation == true` -> Persistent safety card `[Confirm Health Readiness]` (`US-WRK-01`).
     - If `workoutSafetyIssues.length > 0` -> Urgent caution banner `[Review Injury-Excluded Exercises]` (`US-WRK-08`).
   - **RTL Mirroring:** Tab bar order mirrors cleanly for Arabic (`Today` at start/right, `Profile` at end/left), swipeable date strip flips horizontal scroll direction naturally.

### API & BACKEND CONTRACT
1. **`GET /v1/bootstrap`**
   - **Headers:** `Authorization: Bearer <accessToken>`, `If-None-Match: <bootstrapEtag>` (smart state-fingerprint `ETag` `W/"boot-..."` that changes automatically on `revision`, local date, `entitlements`, `consents`, `avatar`, or `recovery.status` changes).
   - **Response Fields Consumed:** `revision`, `serverDate`, `timezone`, `onboardingCompleted` (`boolean`), `onboarding` (`object | null` with `serviceTrack`, `journeyStartedOn`, `workoutUiMode`, `workoutPrefs`), `consents`, `profile` (incl. `activity`, `unitSystem`, `seniorMode`, `maternalStatus`, `workoutUiMode`), `eligibility`, `scheduledSessions` (14d), `todaySummary` (`nutrition` incl. `carbs`/`fat`/`targets`, `activity` incl. `updatedAt`, `cardio` incl. `sessionsCount`/`totalMinutes`/`totalKcal`, `hydration`, `latestWeight`, `recovery`, `scheduledWorkout` incl. `fromDate`, `fastingState`, `ramadanMode`, `cycleState` nullable when not female or disabled), `unreadCoachingInboxCount` (`integer`), `pendingAdaptations`, `workoutSafetyIssues`, `entitlements`, `streakSummary`, `engagementState`, `notificationPreferences`.
2. **`GET /v1/coaching/brief`** (Cached via `If-None-Match` `W/"brief-..."` ETag; pure-English + `code`/`params`/`actionTarget`)
3. **`GET /v1/widgets/snapshot`** (For OS Home Screen Widgets — includes `streakDays`, `readinessStatus`, `caloriesRemaining`, `waterCups`, `waterTargetCups`, `fastingState`, `nextWorkout`)

### RULES & BUSINESS LOGIC
1. **Cache-First Instant Render:** Never block Today UI behind a network spinner if SQLDelight holds a valid local profile. Run `GET /v1/bootstrap` asynchronously and animate state updates only on `200 OK` diffs.
2. **Date Strip Window:** Allows viewing Today (`serverDate`) and reviewing/backdating logs up to `90` days prior (`DATE_TOO_OLD` bound from `coaching-shared.mjs`), while quick-switching the last 7 days directly from the Today header calendar pills.
3. **Track Card Filtering:**
   - `nutrition_and_workouts`: Renders Calories/Macros (`US-HOME-02`), Next Meal (`US-HOME-03`), Workout Card (`US-HOME-03`), Water (`US-HOME-04`), Weight (`US-HOME-04`), Steps (`US-HOME-06`), Coach Brief (`US-HOME-03`).
   - `nutrition_only`: Omits Workout Session card (shows external resistance day tag if `goal == "muscle_gain"` and `externalTrainingDays` includes today).
   - `workouts_only`: Replaces Calorie/Macro ring hero with **Training Readiness & Weekly Volume Hero Card** and omits Next Meal card.
4. **Gentle Streak Hydration & Freeze Rules:** Hydration-only streak credit requires `>= 80%` of the user's daily water target (`dailyWaterTarget`), and `streak_freeze` enforces a bidirectional 7-day window (`409` if another freeze already exists within ±6 days).

### MAIN FLOW
1. User taps the CuraFit app icon.
2. App checks startup routing (`US-MOB-01`), detects `onboardingCompleted == true`, and opens `MainTabScaffold` on Tab 1 (`Today`).
3. SQLDelight renders the cached dashboard immediately (`< 100ms`).
4. In the background, `TokenManager` ensures a fresh JWT (`US-AUTH-03`), drains any queued outbox items (`US-AUTH-04`), and calls `GET /v1/bootstrap` with `If-None-Match`.
5. If `304 Not Modified`, nothing flashes; if `200 OK`, updated summary metrics animate smoothly into place.

### EDGE CASES
- **Midnight Timezone Rollover While App Is Open:** Compare `localDate(now, profile.timezone)` on foreground resume; when date advances, auto-reset Today date header to new `serverDate` and refresh `GET /v1/bootstrap`.
- **User Travels to Different Timezone (e.g., Cairo -> Riyadh):** App detects OS timezone shift (`Asia/Riyadh != profile.timezone`) and shows non-intrusive snackbar/prompt `[Update Plan Timezone to Riyadh?]` triggering `POST /v1/commands` (`action: "timezone"`).
- **Offline Cold Start:** Renders full cached plan, today's targets, and local water/food/workout counts with top `"Offline"` badge.
- **Unauthenticated / Incomplete Onboarding Deep-Link Arrival:** If a user opens a Home Widget or push deep-link (`curafit://...`) before finishing onboarding/login, save `pendingDeepLinkRoute` and route cleanly to `US-AUTH-01` / `US-MOB-01` before landing on `TodayDashboardScreen`.

### ACCEPTANCE CRITERIA
- **Scenario 1: Service-track adaptation hides irrelevant cards**
  - **Given** a user with `serviceTrack == "nutrition_only"`
  - **When** `TodayDashboardScreen` loads
  - **Then** the Calorie/Macro Hero, Next Meal, Hydration, Weight, Steps, and Coach Brief cards render, while the Workout Session card is hidden.
- **Scenario 2: Safety & confirmation banners surface at top priority**
  - **Given** `eligibility.needsHealthConfirmation == true` on a restored `workouts_only` account
  - **When** `TodayDashboardScreen` opens
  - **Then** a pinned top banner prompts health readiness confirmation before workout progression unlocks.
- **Scenario 3: Coach tab badge reflects pending actions and unread inbox items**
  - **Given** `pendingAdaptations.length == 1` or `unreadCoachingInboxCount > 0` in bootstrap
  - **When** `MainTabScaffold` renders
  - **Then** the `Coach` bottom tab displays a visible unread badge dot.

### ANALYTICS
- `today_dashboard_viewed` (`service_track`: `string`, `date`: `string`, `offline_mode`: `boolean`)
- `main_tab_switched` (`from_tab`: `string`, `to_tab`: `string`)
- `today_date_strip_selected` (`days_offset`: `integer`)

---

## US-HOME-02: Daily Calorie, Macro Rings & Live Fasting / Ramadan Status Hero Card

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-HOME-02` |
| **Epic** | `EPIC-03` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `nutrition`, `fasting`, `ramadan` |
| **Target Screens** | `TodayDashboardScreen` (Hero Card Section) |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user tracking my daily nutrition, I want a prominent visual summary of my remaining calories, Protein/Carbs/Fats progress bars, diary completion state, and live Intermittent Fasting or Ramadan Suhoor/Iftar countdown at the top of my Today screen so I know my nutritional status in one glance.

### PRECONDITIONS
- `serviceTrack != "workouts_only"` and an active nutrition plan exists (or user is browsing historical date).

### SCREEN AND UI DETAILS
1. **Calorie Ring (Primary Visual Anchor):**
   - Smooth animated circular arc showing **Remaining kcal** in bold center typography (`"1,120 kcal left"` or `"140 kcal over"` in gentle amber, never punishing red), flanked by **Consumed** (`730`) and **Target** (`1,850`).
   - Displays **Energy Source Sub-Badge** when active energy burn from wearables is recorded (`"Includes planned targets"` — never silently inflates calorie targets beyond deterministic engine plan).
2. **Macro Mini-Bars (3 Horizontal Progress Bars below Ring):**
   - **Protein:** `{consumed}g / {target}g`
   - **Carbs:** `{consumed}g / {target}g`
   - **Fats:** `{consumed}g / {target}g`
   - **Null-Nutrient Safety Rule (`KMM_BACKEND_INTEGRATION.md`):** `GET /v1/food-diary` returns `null` for all 8 nutrients (`energy, protein, fat, carbs, fiber, saturated, sodium, sugars`) when `entries.length === 0` — the client renders `0` (`0 kcal`, `0g / {target}g`) when `entries.length === 0`. Only when **`entries.length > 0 && totals[metric] == null`** (because one or more logged foods lack macro provenance in the reference source) does the client render `"{knownSum}g + --"` or `"Partial (source N/A)"` with an info tooltip explaining *"One logged item does not report this nutrient in its reference source"* — **never display `0g` as if consumed were zero when entries exist!**
3. **Diary Completion Pill (`food_complete`):**
   - Subtle pill at bottom-right of Hero Card:
     - `Open`: `"Logging in progress"` -> `[Mark Day Complete ✓]` (enabled once `entries.length >= 1`, calls `food_complete`).
     - `Completed`: `"Day Confirmed ✓"` (tappable to view summary or reopen).
4. **Live Fasting / Ramadan Strip (Conditional — Shown inside Hero Card if `dietType == "intermittent_fasting"` OR `todaySummary.ramadanMode.enabled == true`):**
   - Shows current phase pill (`"Fasting Window — 03h 18m left"` or `"Eating Window — Closes at 20:00"` / `"Ramadan Mode: Iftar in 02h 10m"`), progress bar along the fasting arc, and quick `[Start/End Fast]` or `[View Ramadan Schedule]` tap action routing to `US-NUT-10`.

### API & BACKEND CONTRACT
1. **`GET /v1/food-diary?date={YYYY-MM-DD}`**
   - Returns `{ date, entries, totals: { energy, protein, fat, carbs, fiber, saturated, sodium, sugars }, complete, planEnergy }` (all 8 `totals` fields are `null` when `entries.length === 0`).
2. **`GET /v1/nutrition/fasting-state`** (Also embedded inside `GET /v1/bootstrap` -> `todaySummary.fastingState` & `todaySummary.ramadanMode`)
   - Returns `{ mode: "if_16_8" | "ramadan" | "off", phase: "fasting" | "eating", windowStart, windowEnd, startedAt, targetEndAt, ramadanConfig, streakDays }`.
3. **`POST /v1/commands?view=receipt`** (`action: "food_complete"`)

### RULES & BUSINESS LOGIC
1. **Deterministic Calculation Consistency:** Displayed consumed totals come directly from `dayTotals` aggregation (`food.mjs`): when `entries.length === 0`, all 8 metrics (`energy, protein, fat, carbs, fiber, saturated, sodium, sugars`) are returned as `null` and rendered by the client as `0`. When `entries.length > 0`, if ANY entry has `null` for a metric, the server returns `null` for that aggregate metric, and the client renders `"Partial (source N/A)"` (or partial sum labeled `+ unknown`).
2. **Calories Over Target & Anti-Crash-Dieting Guidance:** Exceeding `planEnergy` shows calm neutral/amber feedback (`"+120 kcal over target"`) with zero shaming graphics. If intake exceeds `120%` of `planEnergy`, Nutrition Specialist displays a brief calm reassurance strip (*"One higher day does not derail your 7-day trend — return right to your normal target tomorrow without fasting or skipping meals to compensate"*).
3. **Protein Pacing Smart Nudge:** When `consumedEnergy >= 0.75 * planEnergy` AND `consumedProtein < 0.50 * targetProtein` (and `protein != null`), display a subtle actionable pill (`"Protein pace low today — view high-protein picks"`) routing straight to filtered Food Search / Pantry (`US-NUT-04` / `US-NUT-08`).
4. **Tapping Hero Card:** Navigates straight to `NutritionHubScreen` (`US-NUT-01` / `US-NUT-02`) for that date.

### MAIN FLOW
1. User opens Today tab after logging breakfast (`480 kcal`, `32g P`).
2. Hero card displays `1,370 kcal left` (`480 / 1,850`), Protein bar `32g / 145g`, and active 16:8 Eating Window badge (`12:00 PM – 8:00 PM`).
3. After dinner, user taps `[Mark Day Complete ✓]` right from the Hero Card -> `food_complete` command commits and badge updates to `"Day Confirmed ✓"`.

### EDGE CASES
- **Zero Meals Logged Today (`entries.length === 0`):** Server returns `null` for all 8 nutrient totals; client renders `0%` (`"1,850 kcal left"`, `0g / {target}g`, NOT `"Partial (source N/A)"`); `[Mark Day Complete]` is disabled with hint *"Log at least one meal first"* (enforcing `FOOD_LOG_REQUIRED_BEFORE_COMPLETE`).
- **Manual Food Logged Without Macros (`entries.length > 0 && totals.protein == null`):** Ring displays exact `energy` (`480 kcal`), while Protein bar displays `"Partial (source N/A)"` so the user is never misled into thinking their food had `0g` protein.
- **Workout-Only Track:** Hero Card swaps cleanly to **Weekly Training Consistency & Readiness Card** (showing `Sessions This Week: 2/4`, current Recovery Readiness status, and target muscle focus).
- **Ramadan & Pregnancy Active Together (`maternalStatus != "none"`):** Hero ring maintains safe `minCalorieFloor` (`1800` pregnancy) even under Ramadan nighttime eating compression and prominently shows a Nutrition Specialist prenatal adequacy notice.

### ACCEPTANCE CRITERIA
- **Scenario 1: Empty diary renders `0`, while logged null macro renders `"Partial (source N/A)"`**
  - **Given** a day with `entries.length === 0` returns `null` totals -> Hero renders `0 kcal` and `0g` macros
  - **When** a logged manual food item is added with `energy = 500` and `protein = null` (`entries.length > 0 && totals.protein == null`)
  - **Then** calories update to `500 kcal`, and protein displays `"Partial (source N/A)"` rather than coercing `null` to `0g`.
- **Scenario 2: Fasting countdown displays inside Hero Card**
  - **Given** `dietType == "intermittent_fasting"` with `ifStartHour = 12` and current time `10:30`
  - **When** `TodayDashboardScreen` loads
  - **Then** the Hero Card displays `"Fasting • 01h 30m until 12:00 PM window"`.
- **Scenario 3: Protein pacing nudge surfaces when calories are high but protein lags**
  - **Given** user consumed `1,450` of `1,850 kcal` (`78%`) and `50g` of `150g` protein (`33%`)
  - **When** Today Hero Card renders
  - **Then** the Nutrition Specialist displays the lean high-protein suggestion pill without erroring.

### ANALYTICS
- `today_hero_viewed` (`remaining_kcal`: `number`, `fasting_active`: `boolean`, `ramadan_mode`: `boolean`)
- `today_food_complete_tapped` (`date`: `string`, `entries_count`: `integer`, `adherence_pct`: `number`)

---

## US-HOME-03: Today's Schedule Stream (Next Meal, Today's Workout / Rest & Daily Coach Brief Banner)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-HOME-03` |
| **Epic** | `EPIC-03` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `today-hub`, `coaching` |
| **Target Screens** | `TodayDashboardScreen` (Action Stream) |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user checking Today to see what to do right now, I want actionable cards showing my Daily Coach Brief insight, my next unlogged meal with a 1-tap Log button, and today's scheduled workout (or Rest & Recovery card) with a 1-tap Start Workout button so I can execute my plan effortlessly.

### PRECONDITIONS
- User has an active profile and active nutrition/workout plan(s) for their `serviceTrack`.

### SCREEN AND UI DETAILS
1. **Daily Coach Priority Banner (Top Card in Stream):**
   - Displays highest-priority note from `GET /v1/coaching/brief` (`priority: "urgent" | "attention" | "normal"`) with a **Specialist Attribution Badge** mapped from `note.role: "nutrition" | "training" | "followup"` (`Nutrition Specialist`, `Strength Coach`, `Recovery & Follow-Up Specialist`).
   - All server notes return pure-English `title`/`body`/`action` paired with deterministic `code`, `params` (`contracts/coaching-codes.json`), and `actionTarget` for deep-link navigation; KMM localizes copy on-device by `(code, params)`.
   - Also elevates `Comeback Protocol` (`engagementState.comebackTier != "none"`, `US-CCH-06`) if user returns after `>= 3` days away, OR `Weekly Team Check-In Ready` (`engagementState.weeklyCheckinDue == true`).
   - Examples:
     - *Recovery Check-in Missing:* `"Recovery & Follow-Up Specialist: Check in on your sleep & soreness before today's workout"` -> CTA: `[30-Sec Check-In]` (`US-CCH-02`).
     - *Pending Adaptation Proposal:* `"Strength Coach suggests a 20% deload today"` -> CTA: `[Review Proposal]` (`US-CCH-03`).
     - *Plan Expired:* `"Nutrition Specialist: Your 7-day meal plan ended"` -> CTA: `[Generate Next Week]` (`US-NUT-01`).
2. **Next Meal Card (`serviceTrack != "workouts_only"`):**
   - Automatically selects the next unlogged meal slot for today (`breakfast -> lunch -> dinner -> snack`) based on current local hour and existing `foodEntries`.
   - Shows dish title (localized), calories + `P/C/F` pill, portion summary, and 2 quick actions:
     - Primary: `[Log Meal ✓]` (1-tap logs `quantity = 1.0` via `food_entry`).
     - Secondary: `[Swap]` (opens `US-NUT-03` alternatives sheet) or tap card -> full Meal Detail (`US-NUT-02`).
   - *All Planned Meals Logged State:* Shows celebratory green check card `"All planned meals logged today!"` with `[Log Extra Snack]`.
3. **Today's Workout / Rest Card (`serviceTrack != "nutrition_only"`):**
   - **On Scheduled Training Day (`scheduledWorkout != null`):**
     - Displays Focus badge (e.g., `"Upper Body"`, `"Push"`), Location badge (`Gym` or `Home`), Exercise Count & Est. Duration (`"6 exercises • ~42 min"`), and active UI Mode chip (`Simple Mode` / `Pro Mode` `US-WRK-02`).
     - *If `recovery.status == "stop"` (`RED_FLAGS_STOP`):* Card turns urgent warning red, disables `[Start Workout]`, and prompts medical check (`US-CCH-02`).
     - *If `recovery.status == "hold"` (`JOINT_PAIN_HOLD`):* Shows amber safety chip `"Progression Hold Active (Joint Pain Guard)"` — keeps planned sets at maintenance load without progression increases.
     - *If `recovery.status == "caution" | "high"` with active deload:* Renders dynamic `setFactor` percentage (`setFactor = 0.8` -> `"Deload active: -20% sets"` for `caution`; `setFactor = 0.6` -> `"Deload active: -40% sets"` for `high`) alongside `[Start Workout]`.
     - Primary CTA: `[Start Workout]` (launches Live Workout Player `US-WRK-03` or `US-WRK-04`), Secondary menu: `[Reschedule]` (`US-WRK-09`) or `[Mark Missed]`.
     - *If Session Completed Today:* Displays green `"Workout Completed ✓"` card with Volume & Duration summary (`US-WRK-10`).
   - **On Rest Day:**
     - Displays `"Rest & Recovery Day"`, muscle recovery hint, optional gentle step target (`7,500+ steps`), and `[Reschedule Another Day Here]` option (`US-WRK-09`).

### API & BACKEND CONTRACT
1. **`GET /v1/coaching/brief`** (Supports `If-None-Match` ETag; returns pure-English notes with `priority: "urgent" | "attention" | "normal"`, `role: "nutrition" | "training" | "followup"`, `code`, `params`, `action`, `actionTarget`)
2. **`GET /v1/plans/{planId}/days/{YYYY-MM-DD}`**
3. **`GET /v1/workout-plans/{activeWorkoutPlanId}`**
4. **`POST /v1/commands?view=receipt`** (`action: "food_entry"` for 1-tap Next Meal logging)

### RULES & BUSINESS LOGIC
1. **Meal Slot Resolution:** Match current user-local hour (`clockNow`, `profile.timezone`) and filter out `meal.id` values already present in today's `foodEntries` (or `foodLogs` legacy daily total).
2. **Workout Date Projection Honor:** Always resolve today's workout using `scheduledSessions` (which applies `scheduleOverrides` from accepted reschedules), NOT raw weekday matching alone, so moved workouts show accurately on the destination date and clear on the original date!
3. **Safety Precedence:** If `workoutSafetyIssues.length > 0` or `recovery.status == "stop"`, Today Workout card must never show a blind `"Start Workout"` green path without routing through safety resolution / urgent warning.

### MAIN FLOW
1. User opens Today tab at `1:30 PM` on a Gym Upper-Body day.
2. Top banner shows *"Daily Readiness: Tap to complete your 30-sec check-in"*.
3. Next Meal card shows `Lunch: Grilled Chicken & Basmati Rice (560 kcal)` because Breakfast was already logged; user taps `[Log Meal ✓]` -> Optimistically logs lunch, updates Hero Calorie Ring, and shifts Next Meal card to `Snack`.
4. User taps `[Start Workout]` -> Opens Warm-Up (`US-WRK-06`) -> Live Workout Player (`US-WRK-03` / `US-WRK-04`).

### EDGE CASES
- **Active Nutrition Plan Expired (`end_date < today`):** Next Meal card transforms into `"Weekly Plan Ended"` card with `[Generate Fresh 7-Day Plan]` (`US-NUT-01`).
- **Two Workouts Rescheduled / Moved:** Backend enforces max 1 session per date (`409 RESCHEDULE_DAY_OCCUPIED`); Today card cleanly renders the moved session with a subtle `"Rescheduled from Mon"` pill using `scheduledWorkout.fromDate`.
- **Ramadan Mode Active (`US-NUT-10`):** Meal slots relabel automatically to `Suhoor`, `Iftar`, `Evening Snack` via `displaySlot` (while keeping the planned meal's wire `slot` intact on `food_entry`) and workout card suggests optimal pre-Iftar / 2h-post-Iftar window.
- **Returning After 3+ Days Inactivity (`engagementState.comebackTier != "none"`):** Top Coach Priority Banner switches gracefully to a welcoming Zero-Guilt Comeback banner (`"Welcome back — let's resume smoothly"` -> `US-CCH-06`) instead of showing stale overdue prompts.

### ACCEPTANCE CRITERIA
- **Scenario 1: 1-Tap Next Meal logging advances schedule stream**
  - **Given** Breakfast is unlogged and Lunch is planned for today
  - **When** the user taps `[Log Meal ✓]` on the Next Meal card
  - **Then** `food_entry` (`source: "planned"`) executes, calories increase, and the card updates to show Lunch.
- **Scenario 2: Red-flag recovery blocks workout start CTA**
  - **Given** today's `recovery` check-in reported `redFlags: true` (`status == "stop"`)
  - **When** `TodayDashboardScreen` renders Today's Workout card
  - **Then** `[Start Workout]` is disabled/replaced by an urgent medical safety stop alert.
- **Scenario 3: Rescheduled session displays on destination rest day**
  - **Given** Monday's Push session was moved to Tuesday (formerly a Rest day)
  - **When** user views Tuesday on Today
  - **Then** the Workout card displays Push with a `"Moved from Monday"` badge.

### ANALYTICS
- `today_coach_banner_clicked` (`role`: `string`, `action_target`: `string`)
- `today_next_meal_quick_logged` (`meal_id`: `string`, `slot`: `string`)
- `today_start_workout_clicked` (`ui_mode`: `"simple" | "pro"`, `recovery_status`: `string`)

---

## US-HOME-04: Quick-Log Hydration Tracker & Rapid Body Weight Check-In

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-HOME-04` |
| **Epic** | `EPIC-03` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `hydration`, `weight` |
| **Target Screens** | `TodayDashboardScreen` (Water & Weight Cards), `WeightLogBottomSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user monitoring hydration and body weight, I want one-tap water logging (`+1 cup`, `-1 cup`, custom ml) and fast scale-weight logging directly from the Today screen so tracking takes under 5 seconds daily.

### PRECONDITIONS
- User is on `TodayDashboardScreen` (or opens Water/Weight from Quick-Log `+`).

### SCREEN AND UI DETAILS
1. **Hydration Tracker Card:**
   - Displays animated water wave/cup row: `{cups} / {targetCups} cups ({liters} L / {targetLiters} L)`.
   - Shows dynamic boost hint on scheduled or external training days (`"+500 ml training day boost"`).
   - Interactive controls:
     - `[-]` button (`addCups: -1`, disabled at `0`).
     - `[+ 1 Cup (250 ml)]` prominent primary tap (`addCups: 1`) with subtle haptic tick.
     - `[+ 500 ml Bottle]` quick chip (`addCups: 2`).
     - Long-press or `"Custom"` link opens exact cup/ml selector (`0..30` cups).
2. **Quick Body Weight Card:**
   - Displays latest logged weight (`"81.4 kg"`), delta vs. 7-day average (`"-0.6 kg vs last week"`), and source badge (`Manual` / `Apple Health` / `Health Connect`).
   - Action button `[Log Weight]` opens a clean numeric keypad bottom sheet pre-filled with last weight, `+/- 0.1 kg` stepper buttons, quick chips, and Eastern Arabic digit normalization (`normalizeDigits`).

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "water"`)
   - Increment payload: `{ "date": "YYYY-MM-DD", "addCups": 1 }` (range `-10..20`, server clamps total `0..30`).
   - Explicit set payload: `{ "date": "YYYY-MM-DD", "cups": 8 }` (`0..30`).
   - **Mandatory Date Rule for Widgets & Late-Night Offline Logs:** Every `water` command (especially from Android Glance / iOS WidgetKit quick-log buttons) MUST pass an explicit `date` (`YYYY-MM-DD`) captured at tap time so a late-night offline tap never mutates the next calendar day after midnight.
2. **`POST /v1/commands?view=receipt`** (`action: "weight"`)
   - Payload: `{ "date": "YYYY-MM-DD", "kg": 81.4, "source": "manual" }` (range `35..250`, same-date entries overwrite cleanly).
3. **`GET /v1/water-logs?offset=0&limit=30`** & **`GET /v1/weight-logs?offset=0&limit=30`**
   - Error Codes: `NUMBER_OUT_OF_RANGE` (`kg` outside `35..250`, `cups` outside `0..30`), `DATE_IN_FUTURE`, `DATE_TOO_OLD` (`> 90` days).

### RULES & BUSINESS LOGIC
1. **Coalesced Rapid Water Taps:** If the user taps `+1 Cup` 3 times rapidly within `600ms`, coalesce locally and dispatch a single `water` command (`addCups: 3` or final `cups`) with one `Idempotency-Key` and explicit `date` to keep revision count clean and responsive.
2. **Cup-to-Liter & Unified Target Parity (`US-MOB-09`):** Always match server formula (`liters = round((cups * 0.25) * 100) / 100`, `1 cup = 250 ml`, max `30 cups = 7.5 L`). Daily hydration target (`dailyWaterTarget`) computes deterministically as `weightKg * 35 ml + activity(+350 ml moderate / +500 ml active) + workoutOrExternalTrainingDay(+500 ml) + maternal(+300 ml pregnant / +600 ml breastfeeding) + gout(+500 ml) + hotClimate(+200 ml egypt/gulf)`, clamped `2.0..5.0 L` (`8..20` cups).
3. **Standardized Weight Jump UX Guard (`> 3 kg` Soft / `> 10 kg` Hard):**
   - Server retains 1 canonical weight record per `date`; logging a second weight on the same day overwrites that day's record smoothly.
   - **`|newWeight - prevWeight| > 3 kg` and `<= 10 kg` (Soft Warning):** Show a quick confirm dialog (*"That's a {delta} kg change from your last weigh-in ({prevWeight} kg). Save {newWeight} kg?"* with `[Edit]` / `[Save Anyway]`).
   - **`|newWeight - prevWeight| > 10 kg` (Hard Confirmation):** Show an elevated typo-protection confirmation requiring explicit confirmation (*"Large jump detected: Did you mean {newWeight} kg? Your last weigh-in was {prevWeight} kg."* with `[Cancel & Edit]` as default primary focus and secondary `[Confirm {newWeight} kg]`).

### MAIN FLOW
1. User taps `[+ 1 Cup]` twice on Today -> Water visual increments from `4/10` to `6/10` cups (`1.5 L / 2.5 L`) immediately and syncs via `water` command.
2. User taps `[Log Weight]`, adjusts stepper from `82.0` to `81.4`, and taps `[Save]` -> Weight updates, 7-day trend recalculates, and sheet closes.

### EDGE CASES
- **Rapid Double Tap Above 30 Cups:** Client caps at `30` cups and shows toast *"Maximum daily log is 30 cups (7.5 L)"*.
- **Suspected Weight Typo (e.g. User Types `8.1` or `181` Instead of `81`):** Values outside `35..250 kg` are blocked immediately by `NUMBER_OUT_OF_RANGE`; in-range jumps `> 3 kg` trigger the soft confirm dialog, and jumps `> 10 kg` trigger the hard confirmation guard before committing.
- **Weight Already Synced From Smart Scale via HealthKit Today:** Allows manual override (`source: "manual"`) if the user measured separately; subsequent background wearable syncs preserve manual entries via `protectManual: true`.
- **Rest Day vs. Training Day Hydration Shift:** Displays base vs. training-day adjusted water target transparently (including `externalTrainingDays` boost on `nutrition_only`, e.g., `"3.0 L today (includes +500 ml training boost)"` vs `"2.5 L rest day goal"`).

### ACCEPTANCE CRITERIA
- **Scenario 1: Incrementing water updates liters and target ratio accurately**
  - **Given** today's water count is `4` cups (`1.0 L`) of a `10`-cup target
  - **When** the user taps `[+ 500 ml Bottle]` (`addCups: 2`)
  - **Then** the command sends `addCups: 2` with explicit `date` and UI displays `6 / 10 cups (1.5 L)`.
- **Scenario 2: Out-of-bounds weight is validated cleanly**
  - **Given** the Weight bottom sheet is open
  - **When** the user enters `25` kg (`< 35`) and taps Save
  - **Then** inline localized validation prevents submission (`NUMBER_OUT_OF_RANGE`: `35..250 kg`).
- **Scenario 3: Weight jump guard applies soft warning (`> 3 kg`) and hard confirmation (`> 10 kg`)**
  - **Given** previous weight was `82.0 kg`
  - **When** user enters `86.0 kg` (`+4.0 kg`) -> soft confirm dialog prompts verification; **when** user enters `102.0 kg` (`+20.0 kg`) -> hard confirmation guard intercepts before saving.

### ANALYTICS
- `water_logged` (`delta_cups`: `integer`, `new_total_cups`: `integer`, `source`: `"today_card" | "quick_log" | "widget"`)
- `weight_logged` (`kg`: `number`, `delta_from_prev`: `number`, `source`: `"manual"`)

---

## US-HOME-05: Floating Quick-Log (`+`) Action Sheet (Multi-Modal Universal Logger)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-HOME-05` |
| **Epic** | `EPIC-03` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `quick-log`, `ux` |
| **Target Screens** | `QuickLogBottomSheet` (Accessible from any top-level tab) |
| **Entitlement** | `Freemium` |
| **Backend Status** | `Implemented` *(AI Photo/Voice tile deferred to Final AI Phase — `POST /v1/nutrition/ai-parse` returns `501 FEATURE_DEFERRED_TO_AI_PHASE`)* |

### STORY
As a busy user anywhere inside the app, I want a single floating `+` button that opens a fast, context-aware Quick-Log sheet for logging a meal by AI photo/voice *(Final AI Phase)*, scanning a barcode, searching food, logging water/weight, recording body measurements, or starting a workout/check-in in 1–2 taps.

### PRECONDITIONS
- User is on any of the 5 top-level tabs (`Today`, `Nutrition`, `Workouts`, `Coach`, `Profile`).

### SCREEN AND UI DETAILS
1. **Bottom Sheet Layout (Grid of Tactile Action Tiles — Max 2 Rows, Scannable Icons):**
   - **Nutrition Actions** *(Hidden/Disabled if `serviceTrack == "workouts_only"`)*:
     - **AI Photo / Voice Meal Log** *(Final AI Phase — Deferred: `POST /v1/nutrition/ai-parse` returns `501 FEATURE_DEFERRED_TO_AI_PHASE` until AI rollout; hidden/coming-soon while `ai_meal_parse` is in `capabilities.deferredFeatures`)* -> Opens `AIMealLoggerScreen` (`US-NUT-05`).
     - **Scan Barcode** *(Pro badge if Free)* -> Opens `BarcodeScannerScreen` (`US-NUT-06`).
     - **Search Food & My Recipes** -> Opens `FoodSearchScreen` / `MyRecipesTab` (`US-NUT-04`, `US-NUT-12`).
     - **Manual Calories / Quick Repeat** -> Opens `QuickRepeatAndManualSheet` (`US-NUT-07`).
   - **Health & Biometrics Actions:**
     - **Log Water (`+1 Cup` shortcut right on tile + tap to open)** -> `US-HOME-04`.
     - **Log Weight** -> `WeightLogBottomSheet` (`US-HOME-04`).
     - **Body Measurements** -> `MeasurementsEntrySheet` (`US-PRG-02`).
     - **Cycle Check-In** *(Shown ONLY when `profile.sex == "female"` AND `todaySummary.cycleState.enabled == true`)* -> `CycleLogSheet` (`US-PRG-06`).
   - **Training & Cardio Actions:**
     - **Daily Recovery Check-In** -> `RecoveryCheckinModal` (`US-CCH-02`).
     - **Log Cardio / Walk** *(Available across all tracks)* -> `LogCardioSheet` (`US-WRK-11`).
     - **Start Today's Workout** *(Only if `serviceTrack != "nutrition_only"` & workout scheduled/incomplete)* -> `US-WRK-03`/`04`.
2. **Meal Slot Pre-Selector Pill at Top of Sheet (for Food Actions):**
   - Auto-selects the most likely slot by local time (`05:00–10:59`: `Breakfast`; `11:00–16:59`: `Lunch`; `17:00–20:59`: `Snack` or `Dinner`; `21:00+`: `Dinner` / `Snack`; or `Suhoor`/`Iftar` during Ramadan Mode) — user can tap to override slot before picking an action.

### API & BACKEND CONTRACT
- Dispatcher sheet itself makes zero direct HTTP calls; routes directly to target screen contracts (`EPIC-04`, `EPIC-05`, `EPIC-06`, `EPIC-07`).

### RULES & BUSINESS LOGIC
1. **Service-Track Filtering:** Never display Nutrition food-logging tiles to `workouts_only` users, and never display `"Start Today's Workout"` to `nutrition_only` users.
2. **Pro Feature Preview Behavior:** Free users (`entitlements.tier == "free"`) tapping **Barcode Scanner** (or **AI Photo/Voice** once enabled in Final AI Phase) still see the tile clearly; tapping opens a brief contextual Soft Paywall preview (`US-MON-01`) showing a live example before offering the 7-day Free Trial (`tier: "pro"`).
3. **Target Date Context:** If the user is currently browsing a past date (e.g., Yesterday) inside `Today` or `Nutrition`, the Quick-Log sheet defaults `targetDate` to that viewed date with an explicit pill `"Logging for Yesterday (Nov 20)"` so entries don't land on the wrong day!

### MAIN FLOW
1. User is browsing the `Workouts` tab and remembers they forgot to log an afternoon coffee.
2. User taps the floating `+` button.
3. `QuickLogBottomSheet` slides up with `Snack` pre-selected.
4. User taps **Search Food & Drinks** -> Searches `"Latte"` -> Logs `250 ml` -> Dismisses cleanly back to where they started.

### EDGE CASES
- **Keyboard Open on Current Screen:** Dismiss keyboard smoothly before presenting the bottom sheet.
- **Double-Tap on `+` Button:** Guard sheet presentation state so only one sheet instance opens.
- **Offline Tap on Network-Only AI Tile:** Visually keeps tiles enabled with clear `"Online Required"` caption or launches into the offline fallback modal offering local `Search` / `Manual` logging immediately.
- **No Scheduled Workout Today (`Rest Day` or `Already Completed`):** Hide `[Start Today's Workout]` tile (or replace with `[Reschedule Session Here]`) so users are never prompted to start a non-existent session.

### ACCEPTANCE CRITERIA
- **Scenario 1: Context date propagates into Quick-Log sheet**
  - **Given** the user switched the Nutrition Diary calendar to yesterday (`2026-11-20`)
  - **When** the user taps the `+` Quick-Log button
  - **Then** the sheet header explicitly shows `"Logging for Nov 20"` and passes `date = "2026-11-20"` to the chosen logger.
- **Scenario 2: Pro badge triggers contextual soft paywall for free users**
  - **Given** `entitlements.tier == "free"`
  - **When** the user taps `Scan Barcode` in `QuickLogBottomSheet`
  - **Then** the sheet routes to the Soft Paywall value sheet (`US-MON-01`) rather than failing silently.
- **Scenario 3: Service-track filtering hides incompatible quick actions**
  - **Given** user's `serviceTrack == "workouts_only"`
  - **When** user opens `QuickLogBottomSheet`
  - **Then** Food Search, Barcode, AI Photo/Voice, and Manual Macro tiles are omitted, showing Water, Weight, Measurements, Recovery Check-In, and Workout actions only.

### ANALYTICS
- `quick_log_sheet_opened` (`source_tab`: `string`, `target_date`: `string`)
- `quick_log_action_selected` (`action`: `string`, `slot`: `string`, `is_pro_gated`: `boolean`)

---

## US-HOME-06: Daily Steps & Active Energy Card with Manual Entry & Wearables Live Sync Badge

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-HOME-06` |
| **Epic** | `EPIC-03` |
| **Priority** | `Medium` |
| **Labels** | `production`, `mobile`, `activity`, `wearables` |
| **Target Screens** | `TodayDashboardScreen` (Activity Card), `ManualActivitySheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user trying to stay active outside formal gym workouts, I want to see my daily step count and active calories burned on the Today screen — synced automatically from Apple Health / Health Connect or entered manually — so my daily NEAT movement stays visible.

### PRECONDITIONS
- User is on `TodayDashboardScreen`.
- Health Connect / Apple Health may or may not be connected (`US-INT-01`).

### SCREEN AND UI DETAILS
1. **Steps & Activity Card:**
   - Displays a crisp step progress bar (`6,850 / 8,000 steps` — step goal dynamically aligned with persisted `profile.activity`: `sedentary: 6,000`, `light: 7,500`, `moderate: 9,000`, `active: 10,500`).
   - Displays **Active Energy** (`310 kcal`) when reported by wearables or manual entry.
   - **Sync Source Badge:**
     - If connected (`US-INT-01`): `"Synced from Apple Health • 5m ago"` (or `Health Connect`, computed from `todaySummary.activity.updatedAt`) with `[Sync Now]` icon.
     - If not connected: Subtle `[Connect Apple Health / Health Connect]` chip + `[+ Add Steps]` manual button.
2. **Manual Steps / Activity Bottom Sheet:**
   - Inputs: `Steps` (`0..100,000`), optional `Active Energy (kcal)` (`0..5,000`), and `[Save]`.

### API & BACKEND CONTRACT
1. **`POST /v1/commands?view=receipt`** (`action: "steps"` or `"activity"`)
   - Payload (`activity`): `{ "date": "YYYY-MM-DD", "steps": 9200, "activeEnergyKcal": 410, "source": "manual" }`
2. **`GET /v1/activity-logs?offset=0&limit=30`**
3. **`POST /v1/wearables/ingest`** (Auto-invoked when wearable permissions granted; `US-INT-01`)
   - Supports **partial-success resilience**: returns `{ revision, ingested, skippedCount, skippedRecords[] }` without failing the entire batch on a single malformed record, deduplicates by `externalRecordId`, protects manual weight entries, and preserves pending Coach adaptations' `baseRevision`.
   - Error Codes: `NUMBER_OUT_OF_RANGE` (`steps` `0..100000`, `activeEnergyKcal` `0..5000`), `INVALID_WEARABLES_BATCH`.

### RULES & BUSINESS LOGIC
1. **No Double-Counting Calorie Targets:** Consistent with CuraFit's clinical engine (`IMPLEMENTATION.md`), daily calorie targets already include `activityMultiplier`; active energy burned from watches is displayed as an **informational movement card** and does **not** automatically add eat-back calories to the meal plan target! Add a small clear info note (`"Movement goal — does not auto-increase diet calories"`).
2. **Wearable Priority Over Manual (`todaySummary.activity`):** Server deduplicates by `externalRecordId` for wearables and replaces per `(date, source)` for manual entries (`coaching-settings.mjs`). In `GET /v1/bootstrap`, `todaySummary.activity` returns `{ steps, activeEnergyKcal, source, updatedAt }` and prioritizes wearable sources over manual entries unless a manual entry is **both newer AND higher** in step count.

### MAIN FLOW
1. User walks throughout the day with Apple Watch / Android phone.
2. On app foreground, `US-INT-01` ingests `9,200` steps & `410 kcal` via `/v1/wearables/ingest`.
3. Today Activity card fills green (`9,200 / 7,500 steps ✓`) with `"Synced from Apple Health"` badge.

### EDGE CASES
- **User Revoked Health Permissions in OS Settings:** Card detects missing permission, degrades cleanly to `"Sync Paused — Tap to Reconnect"`, and retains `[+ Add Steps]` manual entry.
- **Zero Steps Reported (`0`):** Displays motivating prompt rather than empty state (`"0 / 7,500 steps — take a 10-min walk after lunch!"`).
- **Steps Input Exceeds Upper Server Bound (`> 100,000`):** Inline localized validation warns before submission (`NUMBER_OUT_OF_RANGE`: `0..100,000` steps, `0..5,000` kcal).
- **Offline Manual Step Update:** Saves optimistically in SQLDelight and dispatches `action: "steps"` / `"activity"` through the FIFO outbox queue seamlessly.

### ACCEPTANCE CRITERIA
- **Scenario 1: Manual steps entry saves cleanly**
  - **Given** wearables sync is disconnected
  - **When** the user taps `[+ Add Steps]`, enters `8500`, and saves
  - **Then** `POST /v1/commands` (`action: "steps"`) commits and the Activity card renders `8,500` steps.
- **Scenario 2: Wearable burn never auto-inflates diet calorie goal**
  - **Given** Apple Health reports `500 kcal` active energy and user's diet target is `1,850 kcal`
  - **When** Today Dashboard renders
  - **Then** Activity card displays `500 kcal active energy` while the Nutrition Hero ring keeps `1,850 kcal` target unchanged.
- **Scenario 3: Revoked OS Health permissions degrade gracefully without blocking manual logs**
  - **Given** the user previously connected Health Connect and then disabled permission in Android Settings
  - **When** Today Dashboard resumes
  - **Then** the Activity Card shows a non-blocking reconnect hint while preserving `[+ Add Steps]` manual entry.

### ANALYTICS
- `activity_card_viewed` (`source`: `"wearable" | "manual" | "unconnected"`, `steps`: `integer`)
- `manual_activity_logged` (`steps`: `integer`, `active_energy_kcal`: `number | null`)
