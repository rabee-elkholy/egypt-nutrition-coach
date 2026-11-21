# EPIC-08: Apple Health / Health Connect Sync & Intelligent Push Notifications

> **Epic ID:** `EPIC-08`
> **Target Platforms:** KMM (Android Health Connect + FCM; iOS HealthKit + APNs)
> **Scope:** Production V2
> **Labels:** `production-v2`, `mobile-v2`, `wearables`, `notifications`, `integrations`

---

## Epic Overview

`EPIC-08` connects CuraFit to the operating system's native health ecosystem and timely reminder infrastructure so tracking feels automatic instead of manual chore work:
1. **HealthKit (iOS) & Health Connect (Android):** Deduplicated background sync of Steps, Active Energy, Body Weight, and Last Night's Sleep Hours (auto-pre-filling Daily Recovery Check-In `US-CCH-02`).
2. **Smart Push & Local Notifications:** Contextual reminders for meals, Intermittent Fasting windows, Ramadan Suhoor/Iftar, hydration, workouts, weekly weigh-ins, plan renewals, and due Coaching Agreements — strictly obeying user toggles and `quietHoursStart..quietHoursEnd` (`HH:mm`).

### Child User Stories
- `US-INT-01`: Apple Health (HealthKit) & Android Health Connect Setup, Permissions & Deduplicated Batch Sync
- `US-INT-02`: Push Notification Token Registration, Granular Preferences & Quiet Hours
- `US-INT-03`: Contextual Smart Notification Triggers & Deep-Link Routing

---

## US-INT-01: Apple Health (HealthKit) & Android Health Connect Setup, Permissions & Deduplicated Batch Sync

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-INT-01` |
| **Epic** | `EPIC-08` |
| **Priority** | `High` |
| **Labels** | `production-v2`, `mobile-v2`, `wearables`, `healthkit`, `health-connect` |
| **Target Screens** | `HealthSyncSetupScreen` (Accessible from Today Activity Card & Profile > Connected Apps) |
| **Entitlement** | `Free` |
| **Backend Status** | `Existing` (`POST /v1/wearables/ingest`, `GET /v1/activity-logs`, `GET /v1/weight-logs`) |

### STORY
As a user with an Apple Watch, Garmin, Xiaomi Band, or smartphone step counter, I want to connect Apple Health or Google Health Connect with clear privacy controls so my steps, active calories, smart-scale weigh-ins, and sleep duration sync automatically into CuraFit without duplicate entries.

### PRECONDITIONS
- User is authenticated (`onboardingCompleted == true`).
- OS supports HealthKit (iOS) or Health Connect (Android 14+ built-in / Android 9–13 Health Connect APK).

### SCREEN AND UI DETAILS
1. **Connected Health Setup Screen (`HealthSyncSetupScreen`):**
   - Clean illustration showing `CuraFit <-> Apple Health` (iOS) or `CuraFit <-> Health Connect` (Android).
   - **Granular Data Read Toggles (Explain WHY each is requested):**
     - `Steps & Active Energy` -> *"Updates your Today movement card automatically."*
     - `Body Weight` -> *"Imports smart-scale weigh-ins cleanly for your 7-day trend."*
     - `Sleep Duration` -> *"Pre-fills your morning Recovery Check-In sleep hours."*
   - **Connection Status Card:** Shows `"Connected • Last synced 2 mins ago"`, `[Sync Last 7 Days Now]` button, and `[Disconnect]` button.
   - **Android Health Connect Missing Fallback:** If Android < 14 and Health Connect app isn't installed, show friendly prompt with `[Install Health Connect on Play Store]`.

### API & BACKEND CONTRACT
1. **`[EXISTING] POST /v1/wearables/ingest`**
   - **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`, optional `Idempotency-Key`
   - **Request Body:** Max `100` records per batch:
     ```json
     {
       "records": [
         {
           "type": "weight",
           "date": "2026-11-21",
           "kg": 81.3,
           "source": "apple_health",
           "externalRecordId": "hk-weight-uuid-123"
         },
         {
           "type": "activity",
           "date": "2026-11-21",
           "steps": 9420,
           "activeEnergyKcal": 415,
           "source": "apple_health",
           "externalRecordId": "hk-act-2026-11-21"
         }
       ]
     }
     ```
   - **Response (`200 OK`):** `{ ok: true, data: { ok: true, revision, ingested } }`.
   - **Error Codes:** `400 INVALID_WEARABLES_BATCH` (`> 100` records), `400 DATE_TOO_OLD` (`> 90` days), `409 IDEMPOTENCY_KEY_REUSED_MISMATCH`.
2. **`[EXISTING] GET /v1/activity-logs?offset=0&limit=30`** & **`GET /v1/weight-logs?offset=0&limit=30`**

### RULES & BUSINESS LOGIC
1. **90-Day & 100-Record Batch Chunking:** On initial connect, pull at most the last `14` days (configurable up to `90`) and chunk into arrays of `<= 100` records per `POST /v1/wearables/ingest` call.
2. **Stable Deterministic `externalRecordId`:**
   - For HealthKit / Health Connect Weight samples: use OS sample `UUID / metadata.id`.
   - For daily Steps + Active Energy aggregates: use `"hk-daily-{YYYY-MM-DD}"` or `"hc-daily-{YYYY-MM-DD}"` (Note: because `coaching-settings.mjs` ignores duplicate `externalRecordId` in `activityLogs`, for intra-day incremental step updates either omit `externalRecordId` so `s.activityLogs` replaces `(date, source)` cleanly on today, OR append an hourly bucket timestamp / revision tag!). **Recommended Rule:** For today's evolving daily total, send `action: "activity"` / `wearables/ingest` with `externalRecordId: null` so same-day `(date, source)` updates cleanly in place, while immutable past days use `hc-final-{YYYY-MM-DD}` for strict deduplication!
3. **Sleep Stays Local-to-Check-In Until Confirmed:** HealthKit/Health Connect sleep duration pre-fills the `sleepHours` slider inside `RecoveryCheckinModal` (`US-CCH-02`) — user still taps Sleep Quality `1..5` and confirms `pain`/`illness`/`redFlags` manually so safety booleans are never forged automatically!
4. **Update Local Revision:** Since `POST /v1/wearables/ingest` increments `revision`, update `localRevision = data.revision` (or trigger `GET /v1/bootstrap` if out of order) immediately on `200 OK`.

### MAIN FLOW
1. User taps `[Connect Apple Health]` on Today Activity Card.
2. `HealthSyncSetupScreen` explains Steps, Weight, and Sleep usage; user taps `[Allow Access]`.
3. Native iOS HealthKit permission sheet opens; user grants read access.
4. Client reads last 7 days of Steps, Active Energy, and Weight, batches into `POST /v1/wearables/ingest`, updates `localRevision`, and displays `"Connected • Synced 7 days"` cleanly.

### EDGE CASES
- **Partial Permission Granted (User Allowed Steps Only, Denied Weight):** Sync steps seamlessly without nagging or failing on denied weight permissions; reflect `"Steps: Active • Weight: Not Permitted"` cleanly in settings.
- **No Smart Scale Data in HealthKit:** Do not overwrite user's manual weights; ignore empty days cleanly.
- **Over 100 Records Selected on Initial 90-Day Backfill:** Automatically split records into chunks of `<= 100` (`chunked(100)`) sequentially so `400 INVALID_WEARABLES_BATCH` never occurs!
- **Multiple Wearable Apps Writing Duplicates to Apple Health (Watch + iPhone + Mi Fit):** Client prefers OS-aggregated HealthKit statistics / Health Connect `AggregateResult` for daily steps & energy rather than blindly summing raw overlapping samples.

### ACCEPTANCE CRITERIA
- **Scenario 1: Batch ingestion commits up to 100 records and updates local revision**
  - **Given** Health Connect returns 7 days of steps and 3 weigh-ins (`10` records total)
  - **When** `POST /v1/wearables/ingest` executes
  - **Then** server returns `{ ingested: 10, revision: N+1 }`, UI updates `localRevision`, and Today Activity Card shows today's steps.
- **Scenario 2: Sleep duration pre-fills Recovery Check-In without fabricating boolean flags**
  - **Given** HealthKit reports `6.5` hours of sleep last night
  - **When** user opens `RecoveryCheckinModal` (`US-CCH-02`)
  - **Then** `sleepHours` defaults to `6.5` with a `"From Apple Health"` label while `pain`, `illness`, and `redFlags` remain explicitly user-selected.
- **Scenario 3: Initial 90-day backfill exceeding 100 records chunks requests safely**
  - **Given** HealthKit returns 90 daily step records and 35 weight samples (`125` records total)
  - **When** initial backfill runs
  - **Then** client splits upload into two `POST /v1/wearables/ingest` calls (`100` + `25`) sequentially with zero `INVALID_WEARABLES_BATCH` errors.

### ANALYTICS
- `health_sync_prompt_viewed` (`platform`: `"apple_health" | "health_connect"`)
- `health_sync_connected` (`permissions_granted`: `string[]`)
- `health_sync_batch_uploaded` (`records_count`: `integer`, `source`: `string`)

---

## US-INT-02: Push Notification Token Registration, Granular Preferences & Quiet Hours

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-INT-02` |
| **Epic** | `EPIC-08` |
| **Priority** | `High` |
| **Labels** | `production-v2`, `mobile-v2`, `notifications`, `settings` |
| **Target Screens** | `NotificationSettingsScreen`, `PrePermissionPrimerSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Mixed` (`[MODIFIED BACKEND]` `/v1/notifications/preferences` + `[NEW BACKEND]` `/v1/devices/push-token`) |

### STORY
As a user managing my daily wellness routine, I want control over exactly which reminders I receive (meals, water, fasting/Ramadan windows, workout days, weekly weigh-in, and coach reviews) and quiet hours where my phone won't buzz while I sleep so notifications help instead of annoy me.

### PRECONDITIONS
- User is authenticated (`onboardingCompleted == true`).

### SCREEN AND UI DETAILS
1. **Contextual Permission Primer (Shown ONLY after user completes Onboarding / Today arrival — NEVER on cold launch splash!):**
   - Clean friendly sheet: *"Want gentle reminders for your meals, water, and workout days? (Quiet Hours default 10 PM – 8 AM)"* -> `[Enable Helpful Reminders]` (triggers OS iOS/Android 13+ notification permission dialog) | `[Not Now]`.
2. **Notification Preferences Screen (`NotificationSettingsScreen`):**
   - **OS Status Alert Banner (If OS notifications disabled):** *"Notifications are turned off in phone settings. [Open Settings]"*.
   - **Master & Granular Toggles:**
     - `Daily Morning Check-In & Brief` (`dailyReminder`)
     - `Workout Day Reminders` (`workoutReminder` — hidden if `nutrition_only`)
     - `Smart Hydration Nudges` (`waterReminder` — auto-adapts to Ramadan nighttime when active)
     - `Meal & Intermittent Fasting Window Alerts` (`mealReminders`, `fastingReminder` — hidden if `workouts_only`)
     - `Weekly Progress & Coach Review` (`weeklyReviewReminder`)
   - **Quiet Hours Picker (`24h HH:mm`):**
     - `Do Not Disturb From:` (default `22:00`) `To:` (default `08:00`) — note that in **Ramadan Mode**, user can adjust Quiet Hours (e.g., `04:30` to `11:00` or exempt Suhoor alarm explicitly!).
   - `[Save Preferences]` (or auto-save toggle debounced cleanly).

### API & BACKEND CONTRACT
1. **`[EXISTING/MODIFIED BACKEND] GET /v1/notifications/preferences`**
   - Existing fields: `{ dailyReminder, workoutReminder, waterReminder, weeklyReviewReminder, quietHoursStart, quietHoursEnd, channels }`.
   - Extended V2 fields (`[MODIFIED BACKEND]`): `mealReminders` (boolean), `fastingReminder` (boolean), `ramadanSuhoorReminder` (boolean), `preferredWorkoutReminderMinutesBefore` (`30 | 60 | 120`).
2. **`[EXISTING/MODIFIED BACKEND] POST /v1/commands?view=receipt`** (`action: "notification_preferences"`)
   - Error Codes: `INVALID_QUIET_HOURS` (`HH:mm` 24-hour format required), `INVALID_BOOLEAN`.
3. **`[NEW BACKEND] POST /v1/devices/push-token`**
   - Registers/refreshes FCM (Android) or APNs (iOS) token + `deviceId`, `platform`, `locale`, `timezone`, `appVersion` for server-driven push delivery (`coachingInbox` & `planRenewal`).
4. **`[NEW BACKEND] DELETE /v1/devices/push-token`**
   - Unregisters device push token immediately upon Logout (`US-PRF-06`) or account deletion so another user logging into the phone never receives the previous user's pushes!

### RULES & BUSINESS LOGIC
1. **Language Synchronization on Toggle/Switch (`US-PRF-05`):** Whenever user changes app language (`Arabic <-> English`), immediately reschedule all local notifications in the new language AND update `locale` on `POST /v1/devices/push-token` so server pushes match!
2. **Quiet Hours Enforcement:** Both local OS notification scheduler AND Cloudflare push dispatcher MUST verify `userLocalTime` is outside `[quietHoursStart, quietHoursEnd]` (handling midnight wrap-around like `22:00 -> 08:00` accurately) before firing non-urgent notifications.

### MAIN FLOW
1. After finishing onboarding and seeing Today, user receives the gentle Notification Primer and taps `[Enable Helpful Reminders]`.
2. OS permission granted -> Client retrieves FCM/APNs token and calls `POST /v1/devices/push-token`.
3. Later in `Profile -> Notifications`, user sets Quiet Hours `23:00` to `07:30` and disables `Meal Reminders`.
4. `notification_preferences` command commits and local scheduled alarms update immediately.

### EDGE CASES
- **OS Permission Denied by User:** Save user's in-app preferences cleanly without crashing, show the `"Disabled in OS Settings"` banner, and offer `[Open System Settings]` deep-link.
- **FCM/APNs Token Rotated by OS:** Background `onNewToken` / `didRegisterForRemoteNotificationsWithDeviceToken` silently posts updated token to `POST /v1/devices/push-token`.
- **Quiet Hours Wrap Midnight (`22:00 -> 08:00` vs Equal Start/End `00:00 -> 00:00`):** Handles cross-midnight interval math (`time >= start || time < end`) accurately and prevents identical start/end strings (`INVALID_QUIET_HOURS`).
- **Offline Notification Preference Toggle:** Saves toggle immediately in SQLDelight, re-schedules local OS notifications right away, and syncs `notification_preferences` via `POST /v1/commands` once online.

### ACCEPTANCE CRITERIA
- **Scenario 1: Invalid quiet-hours format is rejected or prevented by picker**
  - **Given** user picks `23:30` start and `07:00` end
  - **When** `notification_preferences` submits
  - **Then** payload sends valid `HH:mm` strings (`"23:30"`, `"07:00"`) and server updates cleanly.
- **Scenario 2: Sign out unregisters push token cleanly**
  - **Given** User A is signed in with push notifications active
  - **When** User A logs out (`US-PRF-06`)
  - **Then** `DELETE /v1/devices/push-token` revokes the token and cancels all pending local scheduled notifications on the device.
- **Scenario 3: Switching app language re-localizes scheduled notifications and server token locale**
  - **Given** notifications are enabled in `English`
  - **When** user switches app language to `Arabic` (`US-PRF-05`)
  - **Then** upcoming local alarms reschedule with Arabic text and `POST /v1/devices/push-token` updates `locale: "ar-EG"`.

### ANALYTICS
- `notification_permission_prompted` (`outcome`: `"granted" | "denied" | "dismissed_primer"`)
- `notification_preferences_updated` (`water`: `boolean`, `workout`: `boolean`, `meal`: `boolean`, `fasting`: `boolean`, `quiet_start`: `string`, `quiet_end`: `string`)

---

## US-INT-03: Contextual Smart Notification Triggers & Deep-Link Routing

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-INT-03` |
| **Epic** | `EPIC-08` |
| **Priority** | `High` |
| **Labels** | `production-v2`, `mobile-v2`, `notifications`, `deep-linking` |
| **Target Screens** | Background Notification Scheduler + App Deep-Link Router |
| **Entitlement** | `Free` |
| **Backend Status** | `Mixed` (Local smart scheduling + `[NEW BACKEND]` server-triggered pushes for agreements & weekly expiry) |

### STORY
As a user relying on timely nudges to stay consistent, I want my reminders to fire smartly based on my actual day (skipping water reminders if I already hit my goal, pausing daytime nudges during Ramadan fasting, alerting me when my Intermittent Fasting window opens/closes, and opening the exact target screen when I tap a notification).

### PRECONDITIONS
- OS notification permission granted and specific preference toggle enabled (`US-INT-02`).

### SCREEN AND UI DETAILS
- **Notification Catalog & Deep-Link Map:**

| Trigger ID | Trigger Timing & Smart Suppression | Notification Copy (Localized AR/EN) | Tap Deep-Link Route |
| :--- | :--- | :--- | :--- |
| `morning_recovery` | `09:00` (or `quietHoursEnd + 30m`) — *Skipped if recovery already logged today!* | *"30-sec Readiness Check: How did you sleep last night?"* | `curafit://coach/checkin` (`US-CCH-02`) |
| `workout_prep` | `60m` before usual time on `scheduledWorkout` days ONLY (*Skipped if session already completed/missed or `status == "stop"`*) | *"Today's {FocusLabel} session ({EstMin}m) is ready when you are!"* | `curafit://workouts/today` (`US-WRK-01`) |
| `rest_timer_done` | Exact `restEndsAt` timestamp during backgrounded Live Workout Player | *"Rest complete — time for Set {N}!"* | `curafit://workouts/player` |
| `hydration_nudge` | Max 3/day (`11:30`, `15:30`, `19:30` — or `Iftar..Suhoor` in Ramadan) — *Skipped if `cups >= targetCups`!* | *"Hydration check: {remainingCups} cups left to hit today's {targetLiters}L goal."* | `curafit://today?action=water` |
| `fasting_window` | `if_start_hour` & `if_start_hour + 8h` (IF Mode) OR `Iftar - 10m` & `Suhoor - 45m` (Ramadan Mode) | *"Eating window opens in 10 min!"* / *"45 min until Suhoor ends — prioritize protein & water."* | `curafit://nutrition/fasting` (`US-NUT-10`) |
| `weekly_weigh_in` | 2x/week (`Sun` & `Wed` mornings if `< 3` weigh-ins this week) | *"Quick mid-week weigh-in keeps your 7-day trend accurate."* | `curafit://today?action=weight` |
| `plan_renewal` | Morning after active 7-day `end_date` expires | *"Your new week awaits! Tap to generate your next 7-day meal plan."* | `curafit://nutrition/renew` (`US-NUT-01`) |
| `coaching_review_due` | Server push on `coachingCase.reviewOn` date (when active agreement is due) | *"Quick check-in: Did your coaching step help this week?"* | `curafit://coach/inbox?caseId={id}` (`US-CCH-04`) |
| `weekly_team_checkin` | Weekly (User's check-in day e.g. Friday morning) if `weeklyCheckinDue == true` | *"60-sec Team Audit Ready: Nutrition, Training & Recovery verdict awaits."* | `curafit://coach/weekly-checkin` (`US-CCH-06`) |
| `comeback_gentle_nudge` | Max 1 gentle nudge after `4` days of inactivity (respects Quiet Hours, zero guilt) | *"No rush — your plan is ready whenever you are for a smooth restart."* | `curafit://coach/comeback` (`US-CCH-06`) |
| `trial_ending_day5` | Day 5 of 7-day Free Trial (`US-MON-02` promise, server/local scheduled) | *"Your 7-day CuraFit Pro trial ends in 2 days — manage anytime in Settings."* | `curafit://subscription/manage` (`US-MON-04`) |

### API & BACKEND CONTRACT
1. **`[NEW BACKEND] Server Push Dispatch Queue` (Cloudflare Workers Cron Trigger):**
   - Evaluates due `coachingCases` (`reviewOn == today`), `weeklyCheckinDue`, Day-5 trial notices (`coaching_subscriptions`), and expired `coaching_plans` (`end_date == yesterday`), sending localized FCM/APNs payloads via registered `/v1/devices/push-token` records respecting `quietHoursStart..quietHoursEnd` and `timezone`.
2. **Client Local Notification Engine (`AlarmManager` / `WorkManager` / `UNUserNotificationCenter`):**
   - Re-evaluates and cancels redundant alarms immediately whenever user logs water, food, recovery, or finishes a workout!

### RULES & BUSINESS LOGIC
1. **Smart Cancel-on-Action Rule:** If user already completed their workout at `10:00 AM` or hit `10/10` water cups by `2:00 PM`, cancel remaining same-day reminders for that domain immediately so the app never sends annoying outdated nudges!
2. **Privacy on Lock Screen:** Never display raw body weight (`81.4 kg`), medical conditions, or pregnancy status inside lock-screen notification text — keep text safe for shoulder-surfing privacy.
3. **Cold-Start & Auth-Gated Deep-Link Handling (`US-AUTH-01`):** Tapping any notification while killed OR while logged out / mid-onboarding saves `pendingDeepLinkRoute` (`curafit://...`), completes required Auth / Onboarding recovery first, and then navigates directly to the target screen/sheet (or falls back cleanly to `Today` if incompatible with user's `service_track`).

### MAIN FLOW
1. User enables Ramadan Mode (`Iftar 18:05`, `Suhoor Cutoff 04:20`).
2. Local scheduler automatically cancels daytime water/meal reminders and schedules `Iftar Ready (17:55)`, `Night Hydration (21:00, 23:30)`, and `Suhoor Reminder (03:35)`.
3. At `17:55`, notification fires; tapping opens `Nutrition` tab directly on today's `Iftar` meal card.

### EDGE CASES
- **App Uninstalled/Reinstalled or OS Cleared Alarms (`ACTION_BOOT_COMPLETED` / App Resume):** Re-sync and reschedule upcoming 7-day local notifications cleanly on every `bootstrap` and device boot receiver (Android).
- **Deep-Link Targets `Workouts` After User Switched to `Nutrition Only`:** Route gracefully to `Today` instead of crashing on a disabled track route.
- **Unauthenticated User Taps Old Notification After Signing Out:** Stores `pendingDeepLinkRoute`, opens `SocialLoginScreen` (`US-AUTH-01`), and replays the deep link only if the signed-in account matches & finishes bootstrap.
- **Day-5 Trial Reminder When Trial Already Cancelled (`cancelled_active`):** Suppresses nagging cancellation-warning spam or shifts copy to *"Pro trial access ends in 2 days — your history stays safe."*

### ACCEPTANCE CRITERIA
- **Scenario 1: Smart cancellation suppresses redundant reminders**
  - **Given** user's daily water target is `8` cups and user reaches `8/8` cups at `13:00`
  - **When** the `15:30` hydration nudge window arrives
  - **Then** no hydration notification fires for the rest of that calendar day.
- **Scenario 2: Lock screen text omits sensitive biometric values**
  - **Given** a `weekly_weigh_in` or `coaching_review_due` notification triggers
  - **When** displayed on device lock screen
  - **Then** zero raw weight numbers, BMI values, or declared medical conditions appear in the message body.
- **Scenario 3: Cold-start deep link routes accurately (or defers cleanly through login)**
  - **Given** app process was killed and user taps `curafit://subscription/manage` (`trial_ending_day5`)
  - **When** the app cold-starts with an active session
  - **Then** bootstrap completes and navigates directly to `ManageSubscriptionScreen` (`US-MON-04`).

### ANALYTICS
- `notification_scheduled` (`trigger_id`: `string`, `channel`: `"local" | "push"`)
- `notification_opened` (`trigger_id`: `string`, `deep_link_route`: `string`, `cold_start`: `boolean`)
