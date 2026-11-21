# EPIC-07: Progress Analytics, Body Tracking, Gentle Streaks & Home Screen Widgets

> **Epic ID:** `EPIC-07`
> **Target Platforms:** KMM (Android Jetpack Compose & Glance + iOS SwiftUI & WidgetKit)
> **Scope:** Production V2
> **Labels:** `production-v2`, `mobile-v2`, `progress`, `analytics`, `retention`, `widgets`

---

## Epic Overview

`EPIC-07` drives long-term retention, visual transformation clarity, and motivating daily adherence without toxic guilt mechanics. It combines CuraFit's 14-day progress summary (`GET /v1/progress/summary`) with rich multi-horizon analytics charts, waist/circumference measurements, an encrypted private Before & After Progress Photos vault, **Gentle Streaks** (with Streak Freeze Days + Weekly Wrapped), and native **Home Screen Widgets** for Android and iOS.

### Child User Stories
- `US-PRG-01`: Weight Trend & Multi-Horizon Analytics Dashboard (7-Day Moving Average & Strength Curves)
- `US-PRG-02`: Body Measurements Tracker (Waist, Chest, Hips, Arms, Thighs & Body Fat %)
- `US-PRG-03`: Private Progress Photos Vault (Local vs. Encrypted Cloud & Before/After Split-Slider)
- `US-PRG-04`: Gentle Streaks (Streak Freeze Day), Milestone Badges & Visual "Weekly Wrapped" Report
- `US-PRG-05`: Home Screen Widgets (Android Glance & iOS WidgetKit for Calories, Water, Workout & Fasting)

---

## US-PRG-01: Weight Trend & Multi-Horizon Analytics Dashboard

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRG-01` |
| **Epic** | `EPIC-07` |
| **Priority** | `High` |
| **Labels** | `production-v2`, `mobile-v2`, `progress`, `analytics`, `charts` |
| **Target Screens** | `ProgressAnalyticsScreen` (Accessible from Coach Hub, Today Weight Card & Profile) |
| **Entitlement** | `Freemium` (`Free`: `14D` & `30D` weight/adherence charts; `Pro`: `90D` / `All-Time` trends, strength 1RM curve & trajectory overlay) |
| **Backend Status** | `Mixed` (`[EXISTING]` `/v1/progress/summary`, `/v1/weight-logs`, `/v1/workout-logs` + `[NEW BACKEND] GET /v1/progress/analytics`) |

### STORY
As a user working toward a body transformation goal over months, I want an interactive analytics dashboard showing my smoothed 7-day weight trend against my expected goal trajectory (so normal daily water fluctuations don't discourage me), my calorie/macro consistency, and my strength progression per exercise.

### PRECONDITIONS
- User is authenticated with `onboardingCompleted == true`.

### SCREEN AND UI DETAILS
1. **Horizon Selector Segmented Pills:** `[14D]` | `[30D]` *(Free)* | `[90D]` | `[All Time]` *(`90D`/`All Time` gated cleanly behind Soft Paywall for Free users, matching `US-MON-01`)*.
2. **Card 1 — Weight Trend & Moving Average Chart:**
   - Light gray scatter dots for daily raw scale weigh-ins (`GET /v1/weight-logs`).
   - Bold solid curve for **7-Day Rolling Average** + dashed target line toward `targetWeight`.
   - Hero Stats Row: `Start Weight` -> `Current 7d Avg` (`Delta: -3.2 kg`) -> `Weekly Rate` (`-0.55% / wk`) + Goal Trajectory ETA (`"Est. ~8 weeks left"`).
   - **Calm Education Banner (`weightTrend.note`):** *"Your coach tracks 7-day moving averages, not single-day water weight swings."*
3. **Card 2 — Nutrition Adherence & Macro Consistency (`service_track != "workouts_only"`):**
   - Bar chart of daily logged calories vs. target band (`80%–120%` shaded green adherence zone) + 14-day averages (`Avg kcal`, `Avg Protein g`, `Complete Days: X/14`).
4. **Card 3 — Strength & Volume Progression (`service_track != "nutrition_only"`):**
   - Total Weekly Training Volume (`kg`) bar chart + Exercise Picker (`Bench Press`, `Squat`, `Lat Pulldown`, etc.) plotting Estimated 1RM & Top Set Weight over time.
   - Summary chips from `progressSummary.workoutSummary.insights` (`Load Increases`, `Rep Increases`, `Ready for Next Load`).
5. **Card 4 — Hydration & Sleep/Recovery Consistency:** Compact 14-day visual dot matrix (`water-logs` & `checkins`).

### API & BACKEND CONTRACT
1. **`[EXISTING] GET /v1/progress/summary`** -> 14-day `weightTrend`, `foodCompleteness`, `hydration`, `workoutSummary`.
2. **`[EXISTING] GET /v1/weight-logs?from={date}&to={date}&limit=100`** & **`GET /v1/workout-logs?from={date}&to={date}&limit=100`**.
3. **`[NEW BACKEND] GET /v1/progress/analytics?range=14d|30d|90d|all&exerciseId={optional}`**
   - Returns server-aggregated series (`weightMovingAvg[]`, `dailyCalories[]`, `weeklyVolume[]`, `exerciseEstimated1Rm[]`, `estimatedWeeksRemaining`) so heavy 90d+ aggregation never lags old mobile CPUs!
   - Error Codes: `400 INVALID_DATE_RANGE`, `402 PRO_ENTITLEMENT_REQUIRED` (for `90d`/`all` if Free).

### RULES & BUSINESS LOGIC
1. **Pregnancy Weight Gain Guidance:** When `maternalStatus` is `pregnant_t1|t2|t3`, chart suppresses weight-loss downward trajectory lines and displays healthy trimester weight-tracking context instead.
2. **Estimated 1RM Formula (Client/Server Consistency):** Epley formula `kg * (1 + reps / 30)` for working sets with `1 <= reps <= 15`, ignoring warm-up and pain-flagged sets!
3. **Zero-Log Empty States:** If `< 2` weigh-ins logged, display clean onboarding starting point dot with `[+ Log Today's Weight]` button instead of broken empty axes.

### MAIN FLOW
1. User taps Weight card on Today (or Progress shortcut in Coach/Profile).
2. `ProgressAnalyticsScreen` displays the 14-day smoothed weight chart immediately (`-0.6 kg` weekly trend, steady downward curve).
3. User switches to `[90D]` -> Views 3-month transformation curve alongside Bench Press strength climbing from `50 kg` to `67.5 kg`.

### EDGE CASES
- **Single Weigh-In Logged Only:** Plot single anchor point cleanly without NaN division or crash in moving average math.
- **RTL Chart Direction:** Keep chronological time axis Left-to-Right (standard scientific/financial chart convention in MENA apps) OR verify clean RTL axis labels without mirrored/backwards Arabic text!
- **All Logged Workouts Were Simple Mode (`kg == 0`) or Bodyweight Only:** Replace `Estimated 1RM (kg)` chart cleanly with `Total Reps & Completed Sessions Progression` so chart never shows flat `0 kg` lines.
- **Offline Analytics View:** `14D` & `30D` charts compute seamlessly from SQLDelight local logs offline; `90D` / `All Time` displays cached snapshot if previously loaded or `"Connect to load full archive"`.

### ACCEPTANCE CRITERIA
- **Scenario 1: 7-day moving average smooths daily fluctuations cleanly**
  - **Given** 14 consecutive weigh-ins with a `+0.8 kg` salty-meal spike on day 14
  - **When** `ProgressAnalyticsScreen` renders
  - **Then** the 7-day average curve shows steady progress and displays the reassuring anti-fluctuation note.
- **Scenario 2: Pro analytics range enforces entitlement gating cleanly**
  - **Given** a Free user selects `[90D]` (or `[All Time]`)
  - **When** tapping the range chip
  - **Then** a non-intrusive Soft Paywall teaser (`US-MON-01`) appears without crashing or losing the `14D`/`30D` view.
- **Scenario 3: Pregnancy mode hides weight-loss projection slope**
  - **Given** `profile.maternalStatus == "pregnant_t2"`
  - **When** Weight Trend chart renders
  - **Then** downward loss trajectory overlays are suppressed cleanly with trimester tracking context instead.

### ANALYTICS
- `progress_analytics_viewed` (`range`: `"14d" | "30d" | "90d" | "all"`, `entitlement`: `"free" | "premium"`)
- `progress_exercise_chart_changed` (`exercise_id`: `string`)

---

## US-PRG-02: Body Measurements Tracker (Waist, Chest, Hips, Arms, Thighs & Body Fat %)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRG-02` |
| **Epic** | `EPIC-07` |
| **Priority** | `High` |
| **Labels** | `production-v2`, `mobile-v2`, `progress`, `measurements` |
| **Target Screens** | `BodyMeasurementsScreen`, `LogMeasurementSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `New` (`GET /v1/measurements`, `action: "body_measurement"`) |

### STORY
As a user undergoing body recomposition or fat loss where the scale sometimes stalls while clothes fit looser, I want to track body circumferences (waist, chest, hips, arms, thighs, neck) and optional body fat percentage over time so I can see real centimeter changes.

### PRECONDITIONS
- User is authenticated (`onboardingCompleted == true`).

### SCREEN AND UI DETAILS
1. **Body Measurements Overview (`BodyMeasurementsScreen`):**
   - Latest Summary Grid showing each site (`Waist`, `Chest`, `Hips`, `Left/Right Arm`, `Left/Right Thigh`, `Neck`, `Body Fat %`) with delta badge vs. first/previous entry (e.g., `"Waist: 84.5 cm (-3.5 cm ↓)"`).
   - Simple line sparkline when tapping any site card.
   - CTA: `[+ Record Measurements]`.
2. **Log Measurement Sheet (`LogMeasurementSheet`):**
   - Date selector (defaults to Today; up to 90 days back).
   - Quick-focus fields (every field optional except at least 1 site must be filled!): `Waist (cm)`, `Hips (cm)`, `Chest (cm)`, `Right Arm (cm)`, `Left Arm (cm)`, `Right Thigh (cm)`, `Left Thigh (cm)`, `Neck (cm)`, `Body Fat (%)` (plus optional `"Estimate via US Navy Formula"` helper using height + waist + neck + hips!).
   - Subtle `"How to measure consistently?"` guide diagram (same time of day, relaxed tape).

### API & BACKEND CONTRACT
1. **`[NEW BACKEND] GET /v1/measurements?from={date}&to={date}&offset=0&limit=30`**
   - Returns paginated `{ id, date, waistCm, hipsCm, chestCm, neckCm, leftArmCm, rightArmCm, leftThighCm, rightThighCm, bodyFatPct, notes }`.
2. **`[NEW BACKEND] POST /v1/commands?view=receipt`** (`action: "body_measurement"`)
   - Payload: `{ "date": "2026-11-21", "waistCm": 84.5, "chestCm": 101.0, "hipsCm": 96.0, "rightArmCm": 35.5, "bodyFatPct": 18.2 }`.
   - Error Codes: `NUMBER_OUT_OF_RANGE` (`20..250 cm`, `bodyFatPct` `3..65%`), `EMPTY_MEASUREMENT_RECORD`.

### RULES & BUSINESS LOGIC
1. **Partial Measurement Support:** Allow logging just `Waist (cm)` in 5 seconds without forcing the user to measure all 9 body parts every time (`null` omitted sites remain unknown).
2. **US Navy Optional Estimator Transparency:** If user uses the built-in tape-based Body Fat % calculator (`waist`, `neck`, `height`, and `hips` if female), label result clearly as `"Navy Tape Estimate"` rather than DEXA scan certainty.
3. **Offline Support:** Works cleanly via `POST /v1/commands` outbox + SQLDelight cache.

### MAIN FLOW
1. User opens `Progress` -> `Measurements` and taps `[+ Record Measurements]`.
2. User measures Waist (`84.5 cm`) and Chest (`101 cm`), leaves other fields blank, and taps `[Save]`.
3. `body_measurement` commits; Waist card immediately displays `84.5 cm (-2.0 cm since Nov 1)`.

### EDGE CASES
- **All Inputs Left Empty on Save:** Inline validation prompts *"Enter at least one body measurement or body fat percentage."*
- **Same Date Re-Logged:** Updates/merges measurements for that `date` cleanly without duplicate rows.
- **Out-of-Bounds Value (`< 20 cm` or `> 250 cm`; `bodyFatPct < 3%` or `> 65%`):** Inline validation prevents API rejection (`NUMBER_OUT_OF_RANGE`) and highlights the invalid site input.
- **Missing Hips / Neck When Attempting US Navy Estimator:** Disables `[Estimate %]` with exact tooltip indicating required tape sites (`Waist + Neck [+ Hips for Female]`).

### ACCEPTANCE CRITERIA
- **Scenario 1: Partial measurement entry saves cleanly and computes delta**
  - **Given** a prior measurement on `2026-11-01` recorded `waistCm = 87.0`
  - **When** the user logs `waistCm = 84.5` on `2026-11-21` with all other fields blank
  - **Then** `body_measurement` succeeds and UI shows `-2.5 cm` Waist change.
- **Scenario 2: Submitting completely empty sheet fails inline before API call**
  - **Given** user opens `LogMeasurementSheet` and leaves all numeric inputs blank
  - **When** user taps `[Save]`
  - **Then** inline error prevents `EMPTY_MEASUREMENT_RECORD` network dispatch and highlights inputs.
- **Scenario 3: US Navy calculator labels body fat transparently as an estimate**
  - **Given** user taps `"Estimate via US Navy Formula"` with valid waist/neck measurements
  - **When** the result displays
  - **Then** value shows explicitly tagged `"Navy Tape Estimate"` and saves accurately into `bodyFatPct`.

### ANALYTICS
- `body_measurement_logged` (`fields_count`: `integer`, `used_navy_bf_calc`: `boolean`)

---

## US-PRG-03: Private Progress Photos Vault (Local vs. Encrypted Cloud & Before/After Split-Slider)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRG-03` |
| **Epic** | `EPIC-07` |
| **Priority** | `Medium` |
| **Labels** | `production-v2`, `mobile-v2`, `progress`, `photos`, `privacy`, `pro-feature` |
| **Target Screens** | `ProgressPhotosVaultScreen`, `GuidedPhotoCaptureScreen`, `PhotoCompareSliderScreen` |
| **Entitlement** | `Freemium` (`Free`: Local-only device storage up to 6 photos; `Pro`: Unlimited encrypted R2 cloud vault + cross-device sync + Before/After export) |
| **Backend Status** | `New` (`GET /v1/progress/photos`, `POST /v1/progress/photos/upload-url`, `POST /v1/progress/photos/confirm`, `DELETE /v1/progress/photos/{id}`) |

### STORY
As a user documenting my visual physique changes, I want a private, passcode/biometric-protected Progress Photos Vault with guided Front/Side/Back alignment frames, a strict choice between Local-Only storage (never leaves my phone) or Encrypted Cloud backup, and a Before & After comparison slider so I can see subtle visual changes safely and privately.

### PRECONDITIONS
- User grants Camera/Photo Library permission when capturing or importing a photo.

### SCREEN AND UI DETAILS
1. **Privacy First Setup & Vault Lock:**
   - Optional **Biometric / Face ID / Fingerprint Lock Toggle** (`"Require Face ID / Fingerprint to open Photos Vault"` — blurred preview cards in app switcher!).
   - Explicit Storage Choice Toggle:
     - `Device-Only (Private Local Vault)`: Zero photos leave the device (encrypted in app sandbox).
     - `Encrypted Cloud Backup (Pro)`: Synced via private presigned R2 object URLs (`private` bucket, never public URLs!).
2. **Timeline Gallery (`ProgressPhotosVaultScreen`):**
   - Grouped by date (`Nov 21 • 81.4 kg` | `Oct 15 • 85.0 kg`) with Pose tags (`Front`, `Side`, `Back`).
   - `[+ Add Photo]` and `[Compare Two Dates ↔]` buttons.
3. **Guided Capture View (`GuidedPhotoCaptureScreen`):**
   - Subtle translucent silhouette outline for `Front` / `Side` / `Back` + optional `3s / 5s / 10s` hands-free countdown timer + `"Ghost Overlay of Previous Photo"` toggle for identical framing!
4. **Before & After Comparison Screen (`PhotoCompareSliderScreen`):**
   - Two layout modes: `[Side-by-Side Split]` AND `[Interactive Drag Slider]` (with aligned date + weight labels, e.g., `Oct 15 (85 kg) -> Nov 21 (81.4 kg)`).
   - Optional `[Save / Share Comparison]` (offers clean `"Blur Face"` privacy toggle before exporting!).

### API & BACKEND CONTRACT
1. **`[NEW BACKEND] POST /v1/progress/photos/upload-url`** (Pro Cloud Sync only)
   - Request: `{ "date": "2026-11-21", "pose": "front" | "side" | "back", "contentType": "image/webp" | "image/jpeg", "byteSize": 245000 }`.
   - Response: `{ "photoId": "ph_<uuid>", "uploadUrl": "<short-lived-r2-signed-put-url>", "maxBytes": 2097152 }`.
2. **`[NEW BACKEND] POST /v1/progress/photos/confirm`** -> Finalizes metadata (`photoId`, `date`, `pose`, `weightKgSnapshot`) in D1 (`coaching_progress_photos`).
3. **`[NEW BACKEND] GET /v1/progress/photos?offset=0&limit=30`** -> Returns metadata + short-lived (`15m`) signed download URLs.
4. **`[NEW BACKEND] DELETE /v1/progress/photos/{id}`** -> Deletes from both R2 object storage AND D1 metadata immediately.
   - Error Codes: `402 PRO_ENTITLEMENT_REQUIRED`, `404 PHOTO_NOT_FOUND`, `413 PHOTO_TOO_LARGE` (`> 2 MB`).

### RULES & BUSINESS LOGIC
1. **Never Expose Photos to OS Public Gallery:** Photos taken in-app save strictly inside private app internal directory (`Context.filesDir` / iOS `Application Support`) with `.nomedia` on Android so personal physique photos never appear in Google Photos / Apple Photos or WhatsApp attachments!
2. **GDPR Complete Erasure:** `DELETE /v1/account/delete` (`US-PRF-06`) also purges all R2 objects under `users/{userId}/photos/*` atomically.
3. **Biometric Gate:** If `"Vault Lock"` is active, require OS BiometricPrompt / `LAContext` before revealing thumbnails.

### MAIN FLOW
1. User opens `Progress` -> `Photos Vault`, authenticates with Face ID, and taps `[+ Add Photo]`.
2. User picks `Front` pose, enables `5s` timer + `Ghost Overlay`, snaps photo (`310 KB` WebP), and reviews.
3. Since Pro Cloud Backup is enabled, client gets presigned URL via `POST /v1/progress/photos/upload-url`, uploads directly to private R2, and calls `confirm`.
4. User taps `[Compare]` -> Selects Oct 15 vs Nov 21 and drags slider cleanly across the visual progress.

### EDGE CASES
- **Upload Fails Offline While Cloud Backup Enabled:** Store photo securely in local pending vault queue (`syncStatus: "pending_upload"`) and upload automatically once online.
- **Biometrics Unavailable / Failed 3 Times:** Fall back gracefully to device passcode (`DEVICE_CREDENTIAL`) via OS biometric API.
- **Free User Attempts to Add 7th Photo (`> 6` Local Vault Cap):** Displays Soft Paywall value prompt (`[Unlock Unlimited Encrypted Cloud Vault]`) while keeping all 6 existing photos completely accessible & deletable!
- **Signed R2 Download URL Expires (`15m` TTL) While Gallery Stays Open:** Client transparently refreshes metadata via `GET /v1/progress/photos` on `403/404` signed-URL expiration without breaking image tiles.

### ACCEPTANCE CRITERIA
- **Scenario 1: Device-only storage prevents any cloud photo upload**
  - **Given** user set Progress Photos storage to `Device-Only`
  - **When** capturing and saving a new photo
  - **Then** zero calls are made to `/v1/progress/photos/upload-url` and the photo is excluded from OS public gallery.
- **Scenario 2: Deleting a cloud photo removes both D1 record and R2 asset**
  - **Given** an uploaded cloud progress photo
  - **When** user deletes it via `DELETE /v1/progress/photos/{id}`
  - **Then** it disappears immediately from UI and subsequent `GET /v1/progress/photos` lists.
- **Scenario 3: Vault lock hides thumbnails until biometric/passcode authentication passes**
  - **Given** `"Require Face ID / Fingerprint"` is enabled in Photos Vault
  - **When** user opens `ProgressPhotosVaultScreen`
  - **Then** private photos remain blurred/locked until OS biometric or device passcode check succeeds.

### ANALYTICS
- `progress_photo_added` (`pose`: `"front" | "side" | "back"`, `storage_mode`: `"local" | "cloud"`, `used_ghost_overlay`: `boolean`)
- `progress_photo_compared` (`mode`: `"split" | "slider"`, `days_apart`: `integer`)

---

## US-PRG-04: Gentle Streaks (Streak Freeze Day), Milestone Badges & Visual "Weekly Wrapped" Report

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRG-04` |
| **Epic** | `EPIC-07` |
| **Priority** | `Medium` |
| **Labels** | `production-v2`, `mobile-v2`, `retention`, `streaks`, `gamification` |
| **Target Screens** | `StreaksAndBadgesSheet`, `WeeklyWrappedModal` |
| **Entitlement** | `Free` |
| **Backend Status** | `New` (`GET /v1/progress/weekly-wrapped`, `action: "streak_freeze"`, extended `bootstrap.streakSummary`) |

### STORY
As a user building sustainable healthy habits, I want a motivating but forgiving **Gentle Streak** system (including 1 automatic or manual **Streak Freeze Day** per week so a single busy day never resets my hard work to zero), achievement badges, and a visual weekly recap card ("Weekly Wrapped") celebrating my consistency.

### PRECONDITIONS
- User has `onboardingCompleted == true` and at least 1 logged action (`food_entry`, `water`, `workout`, `recovery`, or `weight`).

### SCREEN AND UI DETAILS
1. **Streak & Milestones Sheet (`StreaksAndBadgesSheet` — Tapped from Today Header `🔥` Pill):**
   - **Current Streak Counter:** `"🔥 12-Day Active Streak • Best: 21 Days"`
   - **Qualifying Daily Activities Explained Clearly:** *"Any of: Logging >= 1 meal, finishing a workout (or active Rest day check-in), reaching 80% water, or submitting a recovery check-in keeps your streak alive!"*
   - **Streak Freeze Shield (`❄️ 1 Freeze Available This Week`):**
     - Allows manually pausing a scheduled missed day OR auto-protects 1 inactive day per 7-day rolling window without breaking the streak!
   - **Milestone Badges Grid (8 Clean Unlockable Badges):**
     - `First Step (Day 1)`, `7-Day Rhythm`, `30-Day Warrior`, `Hydration Master (7d 80%+)`, `First Double Progression PR`, `10-Day Food Evidence Unlock`, `Consistency Hero (4 Weeks)`, `Goal Milestone Reached`.
2. **Weekly Wrapped Card (`WeeklyWrappedModal` — Triggered Every Friday/Saturday Morning or Accessible Anytime):**
   - Story-style clean summary cards for the past 7 days:
     - Card 1: `Weekly Adherence Score: 88%` (Meals logged + Workouts completed + Hydration days)
     - Card 2: `Training Summary: 4 Workouts • 14,250 kg Lifted • 2 New PRs`
     - Card 3: `Nutrition & Weight: Avg 1,840 kcal • 142g Protein/day • -0.5 kg Trend`
     - Card 4: `[Share Weekly Recap]` (privacy-safe image without raw clinical flags) + `[Plan Next Week]`.

### API & BACKEND CONTRACT
1. **`[MODIFIED BACKEND] GET /v1/bootstrap`** -> Returns compact `streakSummary`: `{ currentDays, longestDays, freezeAvailable, freezeUsedDates[], todayQualified }`.
2. **`[NEW BACKEND] GET /v1/progress/weekly-wrapped?weekEnd={YYYY-MM-DD}`** -> Returns aggregated 7-day scorecard + unlocked badges array.
3. **`[NEW BACKEND] POST /v1/commands?view=receipt`** (`action: "streak_freeze"`) -> `{ "date": "2026-11-21" }` (max 1 freeze per 7 calendar days).
   - Error Codes: `409 STREAK_FREEZE_UNAVAILABLE` (weekly freeze quota already used).

### RULES & BUSINESS LOGIC
1. **Zero Punitive Language:** When a streak resets after missing 2+ unprotected days, show supportive encouragement (*"Streaks are just counters — your body keeps 100% of the work you've already done. Let's start a fresh chain today!"*).
2. **Scheduled Rest Days Don't Break Workout Streaks:** Only active logging habit counts daily; workouts evaluate against `scheduledSessions` weekly completion rate.

### MAIN FLOW
1. User reaches Friday morning and sees a subtle celebration banner on Today: `"Your Weekly Wrapped is Ready! ✨"`.
2. User taps to swipe through 3 colorful recap cards showing `89% Adherence`, `4/4 Workouts Done`, and `-0.5 kg` trend.
3. User closes modal feeling motivated for the weekend.

### EDGE CASES
- **First Week (< 7 Days Since Onboarding):** Weekly Wrapped waits until `>= 5` days after `journeyStartedOn` before prompting proactively, while remaining viewable manually.
- **Free User Already Used Weekly Streak Freeze (`STREAK_FREEZE_UNAVAILABLE`):** Disables extra freeze activation for the remaining 7-day window and displays clear countdown (`"Next freeze unlocks in 4 days"`).
- **Timezone Travel Across Midnight Border (`Cairo -> London`):** Streak date calculation locks cleanly to `profile.timezone` (`US-PRF-05`) so flying late at night never falsely breaks a streak!
- **Weekly Wrapped With `nutrition_only` or `workouts_only` Track:** Automatically omits inactive-domain metrics (e.g., `nutrition_only` hides lifted `kg` volume card and celebrates full diet & hydration adherence cleanly).

### ACCEPTANCE CRITERIA
- **Scenario 1: Streak Freeze preserves active streak across one missed day**
  - **Given** a 10-day streak and `freezeAvailable == true`
  - **When** user had zero activity yesterday and Streak Freeze activates for yesterday
  - **Then** streak remains at `10` instead of resetting to `0`, and `freezeAvailable` updates to `false` for 7 days.
- **Scenario 2: Attempting a second freeze within 7 days is guarded cleanly**
  - **Given** `freezeAvailable == false`
  - **When** user inspects `StreaksAndBadgesSheet`
  - **Then** the `[Use Freeze]` control is disabled with next unlock date (`STREAK_FREEZE_UNAVAILABLE`).
- **Scenario 3: Weekly Wrapped summarizes single-track users without blank or zeroed training cards**
  - **Given** `serviceTrack == "nutrition_only"` and user had 85% diet/hydration adherence
  - **When** `WeeklyWrappedModal` opens
  - **Then** nutrition and hydration highlights display cleanly and training volume cards are omitted.

### ANALYTICS
- `streak_sheet_viewed` (`current_days`: `integer`, `freeze_available`: `boolean`)
- `streak_freeze_activated` (`date`: `string`, `auto_applied`: `boolean`)
- `weekly_wrapped_viewed` (`adherence_score`: `number`, `shared`: `boolean`)

---

## US-PRG-05: Home Screen Widgets (Android Glance & iOS WidgetKit)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-PRG-05` |
| **Epic** | `EPIC-07` |
| **Priority** | `Medium` |
| **Labels** | `production-v2`, `mobile-v2`, `widgets`, `android-glance`, `ios-widgetkit` |
| **Target Screens** | OS Home Screen / Lock Screen Widgets (Small `2x2` & Medium `4x2`) |
| **Entitlement** | `Free` *(Core daily glanceability drives massive retention)* |
| **Backend Status** | `New` (`GET /v1/widgets/snapshot`) + `Existing` (`water` command for interactive +1 Cup) |

### STORY
As a busy phone user checking my home screen dozens of times a day, I want lightweight Android (Jetpack Glance) and iOS (WidgetKit) widgets showing my remaining calories & macros, 1-tap `+1 Cup` water counter, today's scheduled workout status, and live fasting timer without even opening the full app.

### PRECONDITIONS
- App shares `App Group` container (iOS `UserDefaults` / SQLite shared group) or Android `WorkManager` + `GlanceAppWidget` backed by shared SQLDelight & secure token provider.

### SCREEN AND UI DETAILS
1. **Widget 1 — Daily Calories & Quick Water (Medium `4x2` / Small `2x2`):**
   - Left side: Remaining kcal arc + `P / C / F` mini bars (adapts automatically to `Workouts Only` by showing Weekly Workout Streak & Readiness!).
   - Right side: Water cups count (`5/10`) with **Interactive `[+1 Cup]` Button** (iOS AppIntent `LogWaterIntent` & Android Glance `ActionCallback` — logs water in background without launching app UI!).
   - Footer pill: Live Fasting / Ramadan countdown (`"Eating ends 20:00"` or `"Iftar 18:05"`).
2. **Widget 2 — Today's Workout Focus (Small `2x2`):**
   - Displays `"Upper Body • Gym • 42m"` (or `"Rest & Recovery"`), `[Open Player]` deep-link directly into `US-WRK-03`/`04`.
3. **Logged-Out / Stale State:** Clean placeholder `"Tap to sign in to CuraFit"`.

### API & BACKEND CONTRACT
1. **`[NEW BACKEND] GET /v1/widgets/snapshot`**
   - Ultra-compact `< 1.5 KB` endpoint returning strictly `{ date, timezone, serviceTrack, caloriesRemaining, caloriesTarget, proteinGrams, carbsGrams, fatGrams, waterCups, waterTargetCups, fastingPhase, fastingEndsAt, nextWorkoutFocus, workoutStatus }` with short ETag caching for background widget refreshes.
2. **`[EXISTING] POST /v1/commands?view=receipt`** (`action: "water"`, `addCups: 1`) -> Invoked directly by iOS AppIntent / Android BroadcastReceiver when user taps `+1 Cup` on the home screen!

### RULES & BUSINESS LOGIC
1. **Midnight Stale Reset:** If `snapshot.date != deviceLocalDate()`, widget renders fresh day baseline (`0` consumed, full target, or background timeline entry at `00:01`) so yesterday's calories never linger at `8:00 AM`!
2. **Offline Widget Action Queue:** If user taps `[+1 Cup]` on the widget while in airplane mode, increment shared local state immediately and enqueue `water` command into SQLDelight outbox for the main app sync worker.
3. **Battery Friendly Refresh:** Respect OS widget budget (`TimelineProvider` / `WorkManager` updates on app data changes + periodic `>= 30 min` refresh, never polling every minute).

### MAIN FLOW
1. User adds CuraFit Medium `4x2` widget to iPhone/Android home screen.
2. At 2:00 PM, user finishes a glass of water, unlocks phone, and taps `[+1 Cup]` straight on the widget.
3. `LogWaterIntent` updates local widget state immediately (`5/10 -> 6/10`), dispatches `POST /v1/commands` (`water`, `addCups: 1`), and updates the widget counter cleanly.

### EDGE CASES
- **Access Token Expired During Background Widget Refresh:** Widget extension acquires refresh token safely via shared Keychain App Group (`Mutex`-guarded) OR falls back to cached local SQLDelight values until app foregrounds.
- **Arabic RTL Widget Mirroring:** Automatically obeys OS locale / app language override (`ar` RTL vs `en` LTR).
- **Unauthenticated / Signed-Out / Onboarding Incomplete User Has Widget Pinned:** Renders `"Sign in to CuraFit to view today's progress"` and deep-links straight to `US-AUTH-01` / `US-MOB-01` while saving `pendingDeepLinkRoute` (`US-AUTH-01`).
- **Simultaneous Taps of `+1 Cup` on Widget While App Is Offline:** AppIntent/Glance increments local shared water counter optimistically and inserts into shared SQLDelight `outbox_commands` with a unique `Idempotency-Key` so online flush never loses or doubles the cup.

### ACCEPTANCE CRITERIA
- **Scenario 1: Interactive `+1 Cup` widget button increments water without opening app**
  - **Given** the CuraFit widget displays `4 / 10 cups`
  - **When** user taps `[+1 Cup]` on the home screen widget
  - **Then** the widget updates to `5 / 10 cups` and dispatches `water` (`addCups: 1`) with an `Idempotency-Key`.
- **Scenario 2: Midnight rollover clears yesterday's logged calories**
  - **Given** widget cached `2026-11-21` consumption (`1,800 kcal`)
  - **When** device clock crosses midnight to `2026-11-22`
  - **Then** widget timeline resets displayed consumed calories to `0` for the new day.
- **Scenario 3: Signed-out user tapping widget routes cleanly to Social Sign-In**
  - **Given** user signed out while a CuraFit widget remains on the home screen
  - **When** widget refreshes and user taps it
  - **Then** widget shows `"Tap to sign in to CuraFit"` and opens `SocialLoginScreen` cleanly.

### ANALYTICS
- `widget_installed_detected` (`platform`: `"android" | "ios"`, `widget_family`: `string`)
- `widget_water_incremented` (`cups_after`: `integer`)
- `widget_deep_link_opened` (`target`: `"today" | "workout" | "nutrition" | "fasting"`)
