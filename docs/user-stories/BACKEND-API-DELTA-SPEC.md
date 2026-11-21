# CuraFit API v1 -> Production Backend Delta Specification

> **Purpose:** Complete engineering bridge between **CuraFit API v1** (`docs/API_REFERENCE.md` — 12 Groups / 77 Operations) and the **Production Mobile User Stories** (`EPIC-01` .. `EPIC-10`).
> **Audience:** Cloudflare Workers / D1 Backend Team, KMM Mobile Team (`shared` networking & SQLDelight), QA Automation.
> **Contract Rules:**
> 1. All new & modified endpoints preserve uniform `{ ok: true, data, meta }` and `{ ok: false, error: { code, message, params, fieldErrors, retryable, details? }, meta }` envelopes.
> 2. **Zero Arabic characters** in API error messages (`contracts/error-codes.json`), server coaching/brief/review/eligibility messages (`contracts/coaching-codes.json`), or documentation (`tests/error-contract.test.mjs`). The KMM mobile app localizes non-English UI languages on-device by `(code, params)`.
> 3. Domain state mutations execute through `POST /v1/commands?view=receipt|full` with `revision` CAS + `Idempotency-Key` (whose request digest excludes `revision` so timeout + rebase replays cleanly) + `coaching_sync_outbox` whenever modifying account aggregate or synced user logs.
> 4. **Rollout Phase Note (AI Features):** `POST /v1/nutrition/ai-parse` (`US-NUT-05`) and `POST /v1/coaching/chat` + `GET /v1/coaching/chat/history` (`US-CCH-05`) are scheduled for the **Final AI Phase** (after core launch); capabilities flags `ai_meal_parse` and `ai_coach_qa` remain disabled until Final AI Phase.

---

## 1. Master Coverage Matrix — All 77 `[EXISTING]` CuraFit API v1 Operations

| # | Group | Operation / Command Action | Method & Path | Mobile User Stories | Status |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | 01. System | Health Check | `GET /v1/health` | `US-MOB-01`, `US-PRF-07` | `[EXISTING]` |
| 2 | 01. System | Capabilities Manifest | `GET /v1/capabilities` | `US-MOB-01`, `US-AUTH-04`, `US-PRF-07` | `[MODIFIED]` ( feature flags, `minSupportedVersion`, `maintenanceMode`) |
| 3 | 02. Auth | Register User (Email/Password) | `POST /v1/auth/register` | *Omitted on mobile (Social-Only Auth)* | `[DEPRECATED FOR MOBILE]` (kept for QA compatibility) |
| 4 | 02. Auth | Login User (Email/Password) | `POST /v1/auth/login` | *Omitted on mobile (Social-Only Auth)* | `[DEPRECATED FOR MOBILE]` (kept for QA compatibility) |
| 5 | 02. Auth | Refresh Access Token (Rotating `cfrt_...`) | `POST /v1/auth/refresh` | `US-AUTH-03` | `[EXISTING]` |
| 6 | 02. Auth | Inspect Current Session | `GET /v1/auth/session` | `US-AUTH-03` | `[EXISTING]` |
| 7 | 02. Auth | Change Password | `POST /v1/auth/change-password` | *Omitted on mobile (Social-Only Auth)* | `[DEPRECATED FOR MOBILE]` (kept for QA compatibility) |
| 8 | 02. Auth | Claim Anonymous Web Session | `POST /v1/auth/claim-anonymous` | `US-AUTH-02` *(Legacy / Web-migration only)* | `[LEGACY / WEB-MIGRATION ONLY]` |
| 9 | 02. Auth | Revoke Session (Current or All Devices) | `POST /v1/auth/revoke` | `US-PRF-06` | `[EXISTING]` |
| 10 | 02. Auth | Logout | `POST /v1/auth/logout` | `US-PRF-06` | `[EXISTING]` |
| 11 | 03. Onboarding | Pre-Screening Eligibility Check | `POST /v1/eligibility` | `US-MOB-03`..`09`, `US-PRF-02`..`04` | `[MODIFIED]` |
| 12 | 03. Onboarding | Generate Initial / Updated Plan (`generate`) | `POST /v1/commands?view=full` | `US-MOB-09`, `US-AUTH-02`, `US-PRF-02`..`04` | `[MODIFIED]` |
| 13 | 03. Onboarding | Confirm Health (`confirm_health`) | `POST /v1/commands?view=receipt` | `US-WRK-01` | `[EXISTING]` |
| 14 | 03. Onboarding | Confirm Schedule (`confirm_schedule`) | `POST /v1/commands?view=receipt` | `US-WRK-01` | `[EXISTING]` |
| 15 | 03. Onboarding | Renew Weekly Nutrition Plan (`renew_plan`) | `POST /v1/commands?view=receipt` | `US-NUT-01`, `US-CCH-06` | `[MODIFIED]` *(Free renewal quota enforcement + `402 PRO_ENTITLEMENT_REQUIRED`)* |
| 16 | 04. State | Get Bootstrap (`If-None-Match`) | `GET /v1/bootstrap` | `US-MOB-01`, `US-AUTH-02`, `US-AUTH-04`, `US-HOME-01`, `US-WRK-02`, `US-CCH-06`, `US-PRG-04` | `[MODIFIED]` |
| 17 | 04. State | Get Full Account State | `GET /v1/state` | `US-AUTH-04` (resync fallback) | `[EXISTING]` |
| 18 | 04. State | Get 14-Day Progress Summary | `GET /v1/progress/summary` | `US-NUT-11`, `US-PRG-01` | `[EXISTING]` |
| 19 | 05. Nutrition | Get Food Diary for Date | `GET /v1/food-diary?date=` | `US-HOME-02`, `US-NUT-01`, `US-NUT-02` | `[EXISTING]` |
| 20 | 05. Nutrition | Log Planned Meal (`food_entry` planned) | `POST /v1/commands?view=receipt` | `US-HOME-03`, `US-NUT-02` | `[MODIFIED]` (`displaySlot` metadata) |
| 21 | 05. Nutrition | Log Reference Ingredient (`food_entry` ingredient) | `POST /v1/commands?view=receipt` | `US-NUT-04`, `US-NUT-05`, `US-NUT-06` | `[MODIFIED]` (`displaySlot` metadata + `unit: "reference"`) |
| 22 | 05. Nutrition | Log Manual Food Entry (`food_entry` manual) | `POST /v1/commands?view=receipt` | `US-NUT-04`, `US-NUT-05`, `US-NUT-06`, `US-NUT-07` | `[MODIFIED]` (`displaySlot` metadata) |
| 23 | 05. Nutrition | Confirm Food Day Complete (`food_complete`) | `POST /v1/commands?view=receipt` | `US-HOME-02`, `US-NUT-11` | `[EXISTING]` |
| 24 | 05. Nutrition | Delete Food Entry (`food_delete`) | `POST /v1/commands?view=receipt` | `US-NUT-02` | `[EXISTING]` |
| 25 | 05. Nutrition | Log Legacy Daily Total (`food`) | `POST /v1/commands?view=receipt` | `US-NUT-11` (Legacy fallback) | `[EXISTING]` |
| 26 | 05. Nutrition | Switch Legacy Day (`food_switch_to_entries`) | `POST /v1/commands?view=receipt` | `US-NUT-11` | `[EXISTING]` |
| 27 | 05. Nutrition | Get Meal Alternatives | `GET /v1/meal-alternatives?mealId=` | `US-HOME-03`, `US-NUT-03` | `[EXISTING]` |
| 28 | 05. Nutrition | Replace Planned Meal (`replace_meal`) | `POST /v1/commands?view=receipt` | `US-NUT-03`, `US-NUT-08` | `[MODIFIED]` *(Free daily swap quota `2/day` via `coaching_usage_quotas`)* |
| 29 | 06. Biometrics | Log Water — Set Cups (`water`) | `POST /v1/commands?view=receipt` | `US-HOME-04` | `[EXISTING]` |
| 30 | 06. Biometrics | Log Water — Increment Cups (`water`) | `POST /v1/commands?view=receipt` | `US-HOME-04`, `US-PRG-05` | `[EXISTING]` |
| 31 | 06. Biometrics | List Water Logs | `GET /v1/water-logs` | `US-HOME-04`, `US-PRG-01` | `[EXISTING]` |
| 32 | 06. Biometrics | Log Body Weight (`weight`) | `POST /v1/commands?view=receipt` | `US-HOME-04`, `US-CCH-06` | `[EXISTING]` |
| 33 | 06. Biometrics | List Weight Logs | `GET /v1/weight-logs` | `US-HOME-04`, `US-PRG-01`, `US-INT-01` | `[EXISTING]` |
| 34 | 06. Biometrics | Log Daily Steps (`steps`) | `POST /v1/commands?view=receipt` | `US-HOME-06` | `[EXISTING]` |
| 35 | 06. Biometrics | Log Activity & Active Energy (`activity`) | `POST /v1/commands?view=receipt` | `US-HOME-06` | `[EXISTING]` |
| 36 | 06. Biometrics | List Activity Logs | `GET /v1/activity-logs` | `US-HOME-06`, `US-INT-01` | `[EXISTING]` |
| 37 | 06. Biometrics | Ingest Wearables Batch | `POST /v1/wearables/ingest` | `US-HOME-06`, `US-INT-01` | `[EXISTING]` |
| 38 | 07. Workouts | List Workout Plans | `GET /v1/workout-plans` | `US-WRK-01` | `[EXISTING]` |
| 39 | 07. Workouts | Get Workout Plan by ID | `GET /v1/workout-plans/{id}` | `US-AUTH-02`, `US-HOME-03`, `US-WRK-01` | `[EXISTING]` |
| 40 | 07. Workouts | Log Exercise Sets (`workout`) | `POST /v1/commands?view=receipt` | `US-WRK-03`, `US-WRK-04`, `US-WRK-05` | `[MODIFIED]` (`entryMode`, `setType`, `supersetGroupId`, max `15` sets) |
| 41 | 07. Workouts | List Workout Logs | `GET /v1/workout-logs` | `US-WRK-04`, `US-PRG-01` | `[EXISTING]` |
| 42 | 07. Workouts | Complete/Update Session (`session`) | `POST /v1/commands?view=receipt` | `US-WRK-09`, `US-WRK-10` | `[EXISTING]` |
| 43 | 07. Workouts | List Workout Sessions | `GET /v1/sessions` | `US-WRK-01`, `US-WRK-10` | `[EXISTING]` |
| 44 | 07. Workouts | Get Exercise Alternatives | `GET /v1/exercise-alternatives` | `US-WRK-08` | `[EXISTING]` |
| 45 | 07. Workouts | Replace Exercise (`replace_exercise`) | `POST /v1/commands?view=receipt` | `US-WRK-08` | `[MODIFIED]` *(Free weekly swap quota `2/wk`, safety swaps always Free)* |
| 46 | 07. Workouts | Propose Reschedule (`reschedule`) | `POST /v1/commands?view=receipt` | `US-WRK-09` | `[EXISTING]` |
| 47 | 08. Coaching | Submit Recovery Check-In (`recovery`) | `POST /v1/commands?view=full` | `US-CCH-02`, `US-CCH-06` | `[EXISTING]` |
| 48 | 08. Coaching | List Recovery Check-Ins | `GET /v1/checkins` | `US-CCH-02`, `US-PRG-01` | `[EXISTING]` |
| 49 | 08. Coaching | Trigger Adaptive Review (`review`) | `POST /v1/commands?view=full` | `US-CCH-01`, `US-CCH-03`, `US-CCH-06` | `[MODIFIED]` *( floors/ceiling, maternal/senior bounds, pure-English `coaching-codes.json`)* |
| 50 | 08. Coaching | Accept/Reject Proposal (`adaptation`) | `POST /v1/commands?view=receipt` | `US-WRK-09`, `US-CCH-03` | `[MODIFIED]` *(Free for `recovery`/`schedule`; Pro for `calories`/`weekly_volume`/`maintenance`)* |
| 51 | 08. Coaching | Get On-Demand Coaching Brief | `GET /v1/coaching/brief` | `US-HOME-01`, `US-HOME-03`, `US-CCH-01` | `[MODIFIED]` *(pure-English `code`/`params`/`action`/`actionTarget` via `coaching-codes.json`)* |
| 52 | 08. Coaching | Get Coaching Inbox | `GET /v1/coaching/inbox` | `US-HOME-01`, `US-CCH-01`, `US-CCH-04` | `[MODIFIED]` *(pure-English `code`/`params`)* |
| 53 | 08. Coaching | Get Coaching History | `GET /v1/coaching/history` | `US-CCH-04` | `[EXISTING]` |
| 54 | 08. Coaching | Submit Coaching Feedback (`coaching_feedback`) | `POST /v1/commands?view=receipt` | `US-WRK-09`, `US-CCH-04`, `US-CCH-06` | `[EXISTING]` |
| 55 | 08. Coaching | Acknowledge Case (`coaching_ack`) | `POST /v1/commands?view=receipt` | `US-CCH-04` | `[EXISTING]` |
| 56 | 08. Coaching | Decide Coaching Case (`coaching_decision`) | `POST /v1/commands?view=receipt` | `US-CCH-04` | `[EXISTING]` |
| 57 | 08. Coaching | Report Outcome (`coaching_outcome`) | `POST /v1/commands?view=receipt` | `US-CCH-04` | `[EXISTING]` |
| 58 | 09. Plans | List Nutrition Plan Refs | `GET /v1/plans` | `US-NUT-01` | `[EXISTING]` |
| 59 | 09. Plans | Get Full Nutrition Plan | `GET /v1/plans/{planId}` | `US-AUTH-02`, `US-NUT-01` | `[EXISTING]` |
| 60 | 09. Plans | Lazy-Load Single Plan Day | `GET /v1/plans/{planId}/days/{date}` | `US-HOME-03`, `US-NUT-01` | `[EXISTING]` |
| 61 | 10. Catalogs | Get Catalog Provenance Manifest | `GET /v1/catalog/manifest` | `US-WRK-07`, `US-PRF-07` | `[EXISTING]` |
| 62 | 10. Catalogs | List Muscle Taxonomy & Labels | `GET /v1/catalog/muscles` | `US-WRK-07` | `[MODIFIED]` *(enriched with Arabic translations via `data/exercises-i18n.json`)* |
| 63 | 10. Catalogs | Search Foods (AR/EN + Synonyms) | `GET /v1/foods` | `US-NUT-04` | `[EXISTING]` |
| 64 | 10. Catalogs | Get Food Item Detail | `GET /v1/foods/{id}` | `US-NUT-04` | `[EXISTING]` |
| 65 | 10. Catalogs | Search Egyptian & Ramadan Beverages | `GET /v1/beverages` | `US-NUT-04` | `[EXISTING]` |
| 66 | 10. Catalogs | Calculate Custom Recipe / Drink | `POST /v1/foods/calculate` | `US-NUT-04` | `[EXISTING]` |
| 67 | 10. Catalogs | Search Exercises Catalog (868 items) | `GET /v1/exercises` | `US-WRK-05`, `US-WRK-07` | `[MODIFIED]` (`nameAr`, nullable `mediaUrl`/`thumbnailUrl`) |
| 68 | 10. Catalogs | Get Exercise Detail by ID | `GET /v1/exercises/{id}` | `US-WRK-07` | `[MODIFIED]` (`nameAr`, `instructionsAr`, `commonMistakes*`, nullable `mediaUrl`/`thumbnailUrl`) |
| 69 | 11. Settings | Get Incremental Sync Changes & Deltas | `GET /v1/sync/changes` | `US-AUTH-04` | `[EXISTING]` |
| 70 | 11. Settings | Update Timezone & Locale (`timezone`) | `POST /v1/commands?view=receipt` | `US-MOB-02`, `US-HOME-01`, `US-PRF-05` | `[EXISTING]` |
| 71 | 11. Settings | Get Notification Preferences | `GET /v1/notifications/preferences` | `US-INT-02` | `[MODIFIED]` (add meal/fasting toggles & `15|30|60|120` lead time) |
| 72 | 11. Settings | Update Notification Prefs (`notification_preferences`) | `POST /v1/commands?view=receipt` | `US-INT-02` | `[MODIFIED]` (accept meal/fasting toggles & `15|30|60|120` lead time) |
| 73 | 11. Settings | Get Entitlements | `GET /v1/entitlements` | `US-NUT-03`, `US-WRK-08`, `US-MON-01`, `US-MON-04` | `[MODIFIED]` (add billing status, `productId`, `autoRenewEnabled`, `managementUrl`, quotas, `trialEligible`) |
| 74 | 12. Privacy | Record Privacy / Health Consent | `POST /v1/account/consents` | `US-MOB-09`, `US-AUTH-02`, `US-PRF-06` | `[EXISTING]` |
| 75 | 12. Privacy | Backfill Normalized Tables | `POST /v1/account/backfill` | *Internal/Server Migration Ops* | `[EXISTING]` |
| 76 | 12. Privacy | Export Full Account Data (GDPR) | `GET /v1/account/export` | `US-PRF-06` | `[MODIFIED]` (include tables: measurements, favorites, chat, subs) |
| 77 | 12. Privacy | Delete Account Permanently (GDPR) | `DELETE /v1/account/delete` *(+ `POST /v1/account/delete` fallback)* | `US-PRF-06` | `[MODIFIED]` (purge tables + R2 objects + OAuth links + Apple revoke) |

---

## 2. Detailed Specification of `[MODIFIED BACKEND]` Endpoints

### M1. `POST /v1/eligibility`, `POST /v1/plans/preview` & `POST /v1/commands` (`action: "generate"`) — Onboarding Parity
- **Files Affected:** `server/coaching.mjs`, `server/workouts.mjs`, `coaching-shared.mjs`, `planner-core.mjs`
- **Required Changes:**
  1. **Age `18..95` & `seniorMode`:** Accept integers `18..95`; when `age >= 70`, set `profile.seniorMode = true`, cap deficit at `-400 kcal`, enforce protein `>= 1.2 g/kg`, and filter out plyometrics / heavy spinal loading (`barbell_back_squat`, `conventional_deadlift`, `heavy_overhead_press`).
  2. **Maternal Status (`pregnant_t1 | pregnant_t2 | pregnant_t3 | breastfeeding | none`):** Apply additive modifiers (`+0/+340/+450/+400 kcal`, `+0/+15/+25/+20g` protein or min `1.4 g/kg`, `+300/+600 ml` water), block `goal == "lose"` during pregnancy, cap deficit at `-300 kcal` during breastfeeding, block `keto` and `intermittent_fasting` in pregnancy AND breastfeeding, and filter supine/high-fall-risk exercises after T1.
  3. **Canonical Enums & Real Alias Only:**
     - Backend ALREADY uses canonical `goalPace: "slow" | "moderate" | "fast"`, `budget: "low" | "medium" | "high"`, `workoutLocation: "gym_only" | "home_only" | "home_and_gym"`, `homeEquipment: "bench"`, `excludedGroups: "spicy"`, and persisted `profile.activity` — keep these canonical values directly with zero legacy backwards aliases.
     - Keep ONLY the real alias `homeEquipment: "bands" -> "resistance_bands"`.
     - `injuries`: map short keys (`knee`, `lower_back`, `shoulder`, `neck`, `wrist`, `ankle`, `elbow`, `hip`, `diastasis_recti`) in `canonicalInjuries()` and support conservative `elbow_pain` substitutions instead of throwing `UNSUPPORTED_ELBOW_PAIN`.
     - `diseases`: support `diabetes_t1`, `diabetes_t2`, `hypothyroid` (`0.95 * REE`), `celiac` (auto-inject `gluten`), `kidney` (cap protein `<= 1.1 g/kg`), `gout` (cap protein `<= 1.4 g/kg`, `+500 ml` water), and enforce conservative medical blocks on `keto + cholesterol` and `intermittent_fasting + breastfeeding`.
  4. **Clinical Safety Bounds, 7-Day Workouts & Override Flags:** Hide/block `lose` when `currentBmi < 18.5`; raise `targetWeight` upper bound to `250 kg` (matching `weight`); allow `selectedWorkoutDays` up to 7 days (`1..7`); support optional `externalTrainingDays` for `nutrition_only + muscle_gain` (defaulting cleanly with an informational coaching note if omitted); accept optional `bmiWarningOverride: boolean`, `overwriteExisting: boolean`, and `workoutUiMode: "simple" | "pro"`.
  5. **Unified Energy & Water Equations:**
     - Mifflin-St Jeor REE * `activityMultiplier` (no separate TDEE workout bonus); percentage-of-TDEE capped deltas (`lose`: `-min(tdee * {0.10, 0.15, 0.20}, 500)`, `muscle_gain`: `+min(tdee * {0.05, 0.08, 0.10}, 250)`, recomposition = `0 kcal`, `gain`: `+min(tdee * {0.08, 0.12, 0.15}, 400)`).
     - Calorie floors `1500` M / `1200` F / `1800` Pregnant / `1600` Breastfeeding; ceiling `4200 kcal`.
     - Adjusted Body Weight for `bmi > 30`: `IBW = 24 * H^2`, `effectiveWeight = IBW + 0.35 * (w - IBW)`.
     - Protein `1.0..1.8 g/kg` (`>= 1.2` `seniorMode`, `<= 1.1` `kidney`, `<= 1.4` `gout`, maternal `+0/+15/+25/+20g` or min `1.4 g/kg`); total carbs (`keto <= 50g`, `low_carb <= 130g`); timeline range `estimatedWeeksMin..Max` (`7700 kcal/kg`).
     - Unified `dailyWaterTarget`: `weight * 35 + activity(+350 mod / +500 act) + workoutDay(+500) + maternal(+300 preg / +600 bf) + gout(+500) + hotClimate(+200 egypt/gulf)`, clamped `2.0..5.0 L`.
  6. **Preserve Existing Logs on `generate` Re-run (`US-PRF-02`..`04`):** Never erase `foodEntries`, `weights`, `waterLogs`, `workoutLogs`, or `sessions` when `generate` runs on an authenticated account updating goals/preferences.
  7. **Adaptive Review Floor, Ceiling & Safety Alignment (`US-CCH-03`):** Update `validateEnergyChange` in `coaching.mjs` to enforce `1500 kcal` Male / `1200 kcal` Female / `1800 kcal` Pregnant / `1600 kcal` Breastfeeding floors and `4200 kcal` ceiling (emitting `MIN_SAFE_ENERGY_FLOOR_HOLD` / `MAX_SAFE_ENERGY_CEILING_HOLD`), block negative calorie adjustments (`delta < 0`) during `pregnant_t1|t2|t3` (`MATERNAL_CALORIE_CUT_BLOCKED`), cap breastfeeding deficit at `-300 kcal`, and cap `seniorMode` (`70+`) deficit at `-400 kcal` with `protein >= 1.2 g/kg`.

### M2. `GET /v1/bootstrap`
- **File Affected:** `server/presentation.mjs`
- **New / Extended Response Fields inside `data`:**
  - `onboarding`: `{ serviceTrack, journeyStartedOn, workoutPrefs }`.
  - `consents`: Array/map of recorded consents (`health_data_processing`, `terms_and_privacy`, `analytics_telemetry`) for deterministic `HealthConsentModal` gating (`US-AUTH-02`, `US-PRF-06`).
  - `profile.activity`, `profile.seniorMode` (`boolean`), `profile.maternalStatus` (`string`), `profile.workoutUiMode` (`"simple" | "pro"`).
  - `scheduledSessions`: 14-day projected schedule array (applying accepted `scheduleOverrides`, including `fromDate` on moved sessions).
  - `todaySummary.nutrition`: `{ energy, protein, carbs, fat, complete, targets: { energy, protein, carbs, fat } }`.
  - `todaySummary.activity`: `{ steps, activeEnergyKcal, source, updatedAt }`.
  - `todaySummary.scheduledWorkout`: includes `fromDate` (`string | null`) when rescheduled.
  - `todaySummary.fastingState`: `{ mode, phase, windowStart, windowEnd, startedAt, targetEndAt, ramadanConfig, streakDays }`.
  - `todaySummary.ramadanMode`: `{ enabled, iftarTime, suhoorCutoffTime, workoutTiming }`.
  - `streakSummary`: `{ currentDays, longestDays, freezeAvailable, freezeUsedDates[], todayQualified }`.
  - `engagementState`: `{ daysSinceLastLog, lastLoggedAt, weeklyCheckinDue, comebackTier }` (`"none" | "short_3_6d" | "medium_7_13d" | "detrained_14d_plus"` for `US-CCH-06`).
  - `entitlements`: Expanded object (`tier`, `status`, `productId`, `provider`, `expiresAt`, `autoRenewEnabled`, `trialEligible`, `isInGracePeriod`, `managementUrl`, `quotas`, `features`).

### M3. `POST /v1/commands` (`action: "workout"`)
- **Files Affected:** `server/coaching.mjs`, `server/training-state.mjs`, `server/recovery.mjs`
- **Payload Extensions:**
  - `entryMode`: `"simple" | "pro"` (optional, defaults `"pro"`).
  - `supersetGroupId`: `string | null` (optional).
  - `sets[].setType`: `"normal" | "warmup" | "dropset" | "failure"` (optional, defaults `"normal"`).
  - Raise maximum `sets` length from `10` to **`15`** (`1..15` sets) to support warm-up + working sets cleanly.
- **Engine Update (All 5 Evaluation Functions):** Consistently exclude `setType === "warmup"` AND Simple-mode `kg: 0` (on external-load movements) across all 5 workout/recovery evaluation functions:
  1. `sessionCompletion` (`>= 80%` prescribed working sets)
  2. `progression()` (Double Progression uniform load & top-rep check)
  3. `performanceDrop` (`PERFORMANCE_DROP_CALORIE_CUT_HOLD`)
  4. `weeklyVolumeEscalation` (`weekly_volume` +1 set check)
  5. PR / Estimated 1RM analytics (`GET /v1/workouts/prs`, `GET /v1/progress/analytics`)

### M4. `GET /v1/exercises`, `GET /v1/exercises/{id}` & `GET /v1/catalog/muscles`
- **Files Affected:** `server/worker.mjs`, `server/workouts.mjs`, `data/exercises-i18n.json`
- **Response Extensions:**
  - Enrich `/v1/catalog/muscles`, `/v1/exercises`, and `/v1/exercises/{id}` with Arabic translations from `data/exercises-i18n.json` (`nameAr`, `instructionsAr[]`, `commonMistakesAr[]`, muscle Arabic labels).
  - Include `mediaUrl` and `thumbnailUrl` as **nullable** (`string | null`) until hosted animation/video assets are uploaded to R2/CDN.

### M5. `GET /v1/notifications/preferences` & `action: "notification_preferences"`
- **Files Affected:** `server/coaching-settings.mjs`, `server/coaching.mjs`
- **Added Boolean Toggles:** `mealReminders`, `fastingReminder`, `ramadanSuhoorReminder`, and integer `preferredWorkoutReminderMinutesBefore` (`15 | 30 | 60 | 120`).

### M6. `GET /v1/entitlements`
- **Files Affected:** `server/worker.mjs`
- **Unified Response Extensions (matching `US-MON-01` & `US-MON-04`):** `tier`, `status` (`"active" | "trialing" | "grace_period" | "cancelled_active" | "expired" | "none"`), `productId`, `provider` (`"apple" | "google" | null`), `expiresAt`, `autoRenewEnabled`, `trialEligible`, `isInGracePeriod`, `managementUrl`, `quotas: { aiParsesRemainingFree, aiCoachMessagesRemainingFree, freePlanRenewalsRemaining, dailyMealSwapsLimit, weeklyExerciseSwapsLimit }`, `features[]`.

### M7. `GET /v1/capabilities`, `GET /v1/account/export`, `DELETE` / `POST /v1/account/delete` & Pure-English Coaching Contract (`contracts/coaching-codes.json`)
- Update `capabilities.features` to advertise capabilities (`social_oauth`, `barcode_lookup`, `pantry_finder`, `grocery_list`, `ramadan_fasting`, `body_measurements`, `progress_photos_r2`, `store_subscriptions`, plus Final AI Phase flags `ai_meal_parse: false` and `ai_coach_qa: false` until Final AI Phase), plus `minSupportedVersion: { android, ios }` and `maintenanceMode: { active, message }` (`US-AUTH-04`).
- Enforce pure-English server copy + canonical `code` & `params` via **`contracts/coaching-codes.json`** across `GET /v1/coaching/brief` (`priority: "urgent" | "attention" | "normal"`, `role: "nutrition" | "training" | "followup"`, `action`, `actionTarget`), `GET /v1/coaching/inbox`, `POST /v1/eligibility`, and `action: "review"` (`US-HOME-03`, `US-CCH-01`, `US-CCH-03`).
- Exclude `revision` from `Idempotency-Key` request digest in `POST /v1/commands` so timeout + `409` rebase replays idempotently.
- Include normalized tables (`measurements`, `favorites`, `subscriptions`, `ai_chat`, `activity_logs`, `streak_freezes`) in `GET /v1/account/export`.
- Support both `DELETE /v1/account/delete` and **`POST /v1/account/delete`** fallback; cascade-delete all D1 tables + Cloudflare R2 objects (`avatars/*`, `photos/*`), unlink `coaching_oauth_identities` (allowing deleted Google/Apple users to create a fresh empty account later while tombstoned old tokens return `401 ACCOUNT_DELETED`), AND execute server-side **Apple Sign-In Refresh Token revocation** (`https://appleid.apple.com/auth/revoke` using encrypted stored token per App Store Review Guideline 5.1.1(v), `US-PRF-06`).

### M8. `POST /v1/commands` (`action: "food_entry"`) — Display Slot & Bounds Parity (`US-NUT-02`, `US-NUT-10`)
- **Files Affected:** `server/food.mjs`
- **Changes:**
  - Preserve strict wire `slot` enum (`"breakfast" | "lunch" | "dinner" | "snack"`) for backward compatibility while accepting optional `displaySlot`: `"breakfast" | "lunch" | "dinner" | "snack_1" | "snack_2" | "suhoor" | "iftar" | "night_snack"` stored in entry metadata for Ramadan & 5-meal rendering.
  - For `source: "planned"`, wire `slot` MUST match the planned meal's actual `meal.slot`; `displaySlot` carries Ramadan/multi-snack presentation labels.
  - Enforce canonical runtime bounds matching `food.mjs`: `quantity` `0.1..4.0` (planned meals), `grams` `1..2000` (gram-based ingredient logs), and `unit: "reference"` serving counts for estimated beverages & regional serving models.

---

## 3. Detailed Specification of All `[NEW BACKEND]` Endpoints & Command Actions

### 3.1 Social OAuth & Stateless Onboarding Preview Endpoints (Groups 02 / 03)

#### `POST /v1/plans/preview`
- **User Story:** `US-MOB-05`..`US-MOB-09`, `US-PRF-02`
- **Auth:** Public (`No Auth`, IP rate-limited)
- **Request Body:** Onboarding draft biometrics, `maternalStatus`, `goal`, `targetWeight`, `goalPace`, `serviceTrack`, `activity`, `diseases`, `dietType`, `region`, `selectedWorkoutDays`, `workoutLocation`, `workoutSplitPreference`, `sessionDuration`, `injuries`.
- **Success Response (`200 OK`):** Stateless authoritative targets from the unified backend engine:
  `{ calories, macros: { protein, carbs, fat }, waterTargetLiters, estimatedWeeksMin, estimatedWeeksMax, recommendedSplit, seniorMode, warnings[], clinicalBlocks[] }` (pure-English + `code`/`params` via `contracts/coaching-codes.json`).

#### `POST /v1/auth/oauth/google` & `POST /v1/auth/oauth/apple`
- **User Story:** `US-AUTH-01`
- **Auth:** Public (`No Auth`, IP rate-limited `30 req/min/IP`)
- **Request Body (`Google`):** `{ "idToken": "<jwt>", "deviceId": "string", "platform": "android|ios", "locale": "ar-EG", "timezone": "Africa/Cairo" }`
- **Request Body (`Apple`):** `{ "identityToken": "<jwt>", "authorizationCode": "string", "fullName": "string | null", "deviceId": "string", "platform": "ios|android", "locale": "ar-EG", "timezone": "Africa/Cairo" }`
- **Success Response (`200 OK` / `201 Created`):**
  ```json
  {
    "ok": true,
    "data": {
      "tokenType": "Bearer",
      "accessToken": "<hs256-jwt>",
      "expiresIn": 900,
      "expiresAt": "2026-11-21T12:45:00.000Z",
      "refreshToken": "cfrt_...",
      "refreshExpiresIn": 2592000,
      "refreshExpiresAt": "2026-12-21T12:30:00.000Z",
      "sessionId": "sess_<uuid>",
      "isNewUser": true,
      "provider": "google",
      "user": {
        "userId": "user:<uuid>",
        "email": "user@example.com",
        "name": "Ahmed Mohamed",
        "avatarUrl": null,
        "entitlement": "free",
        "createdAt": "2026-11-21T12:30:00.000Z"
      }
    },
    "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>" }
  }
  ```

---

### 3.2 New Nutrition & Catalog Endpoints (Group 05 / 10)

> **Rollout Phase:** `POST /v1/nutrition/ai-parse` (`US-NUT-05`) is scheduled for Final AI Phase (after core launch); capabilities flags `ai_meal_parse` and `ai_coach_qa` remain disabled until Final AI Phase.

| Method & Path | Story | Request Summary | Response Summary |
| :--- | :--- | :--- | :--- |
| `POST /v1/nutrition/ai-parse` *(Final AI Phase)* | `US-NUT-05` | `{ inputType: "photo" \| "voice" \| "text", text?, imageBase64?, audioBase64?, locale, region, slot }` | `{ parseId, transcript, items: [{ label, matchedFoodId, source, grams, portionLabel, confidence, isApproximate, nutrients }], totals, remainingFreePreviews }` |
| `GET /v1/foods/barcode/{ean}` | `US-NUT-06` | Path `ean` (`8..14` digits) | `{ barcode, nameAr, nameEn, brand, servingSizeGrams, servingLabel, valuesPer100g, provenance, isApproximate }` |
| `POST /v1/foods/barcode` | `US-NUT-06` | `{ barcode, nameAr?, nameEn, brand, servingSizeGrams, servingLabel, valuesPer100g }` | `{ barcode, status: "pending_review", createdAt }` |
| `GET /v1/foods/favorites` | `US-NUT-07` | Query `offset`, `limit` | `{ items: [{ id, name, source, key?, grams?, snapshot }] }` |
| `GET /v1/pantry/catalog` | `US-NUT-08` | None (wraps `pantryCatalog(library)`) | `{ items: [{ id, label, labelEn, category, keys[] }] }` |
| `POST /v1/pantry/alternatives` | `US-NUT-08` | `{ mealId?, slot?, selectedIngredients: string[], limit?: 12 }` | `{ items: [{ templateId, name, snapshot, matchedIngredientKeys }] }` |
| `GET /v1/plans/{planId}/grocery-list` | `US-NUT-09` | Query `days=all\|remaining\|3` | `{ planId, daysScope, categories: [{ categoryId, label, items: [{ ingredientKey, name, preparationState: "cooked"\|"raw_as_sold", totalGrams, practicalQuantityLabel, checked, mealRefs[] }] }] }` |
| `GET /v1/nutrition/fasting-state` | `US-NUT-10` | None | `{ mode: "off" \| "if_16_8" \| "ramadan", phase: "fasting" \| "eating", windowStart, windowEnd, startedAt, targetEndAt, ramadanConfig, streakDays }` |

---

### 3.3 New Workouts, Coaching, Media & Progress Endpoints (Groups 07 / 08 / 04)

> **Rollout Phase:** `POST /v1/coaching/chat` and `GET /v1/coaching/chat/history` (`US-CCH-05`) are scheduled for Final AI Phase (after core launch); capabilities flags `ai_meal_parse` and `ai_coach_qa` remain disabled until Final AI Phase.

| Method & Path | Story | Request Summary | Response Summary |
| :--- | :--- | :--- | :--- |
| `GET /v1/workouts/prs` | `US-WRK-10` | Query `since?`, `exerciseId?` | `{ items: [{ exerciseId, type: "heaviest_kg" \| "best_reps" \| "highest_volume" \| "estimated_1rm", value, previousValue, reps, date, loadMode }], summaryByExercise: { [exerciseId]: { heaviestWeightKg, bestRepsAtWeight, highestVolumeKg, estimated1RM, loadMode } } }` *(inverts lower-kg-is-better for `loadMode === "assisted"`)* |
| `POST /v1/coaching/chat` *(Final AI Phase)* | `US-CCH-05` | `{ threadId: "default", message: string (<=1000), locale }` | `{ messageId, reply, citations[], suggestedActions: [{ label, route }], safetyNoticeTriggered, remainingFreeMessages }` |
| `GET /v1/coaching/chat/history` *(Final AI Phase)* | `US-CCH-05` | Query `limit=50`, `before?` | `{ items: [{ messageId, role: "user" \| "assistant", content, citations[], suggestedActions[], createdAt }], nextCursor }` |
| `GET /v1/progress/analytics` | `US-PRG-01` | Query `range=14d\|30d\|90d\|all`, `exerciseId?` | `{ weightSeries[], weightMovingAvg7d[], calorieAdherence[], weeklyVolume[], exercise1RmSeries[], estimatedWeeksRemaining }` |
| `GET /v1/measurements` | `US-PRG-02` | Query `from?`, `to?`, `offset`, `limit` | `{ total, offset, limit, nextOffset, items: [{ id, date, waistCm, hipsCm, chestCm, neckCm, leftArmCm, rightArmCm, leftThighCm, rightThighCm, bodyFatPct, notes }] }` |
| `POST /v1/progress/photos/upload-url` | `US-PRG-03` | `{ date, pose: "front"\|"side"\|"back", contentType, byteSize }` | `{ photoId, uploadUrl: "/v1/media/signed/<token>", maxBytes }` *(only photos endpoint gated by `402 PRO_ENTITLEMENT_REQUIRED`)* |
| `POST /v1/progress/photos/confirm` | `US-PRG-03` | `{ photoId, date, pose, weightKgSnapshot? }` | `{ id, date, pose, weightKgSnapshot, downloadUrl: "/v1/media/signed/<token>", createdAt }` |
| `GET /v1/progress/photos` | `US-PRG-03` | Query `offset`, `limit` | `{ items: [{ id, date, pose, weightKgSnapshot, downloadUrl: "/v1/media/signed/<token>", expiresAt, createdAt }] }` *(always accessible even after downgrade)* |
| `DELETE /v1/progress/photos/{id}` | `US-PRG-03` | Path `id` | `{ deleted: true, id }` *(always accessible even after downgrade)* |
| `GET` / `PUT /v1/media/signed/{token}` | `US-PRG-03`, `US-PRF-01` | Worker-proxied HMAC-SHA256 signed token (`15m` TTL, bound to `userId`, `r2Key`, `op`) | Streams private R2 binary (`GET`) or writes validated binary (`PUT`) without exposing raw R2 S3 credentials |
| `GET /v1/progress/weekly-wrapped` | `US-PRG-04` | Query `weekEnd?` | `{ weekStart, weekEnd, adherenceScorePct, workoutsCompleted, totalVolumeKg, newPrsCount, avgCalories, avgProteinGrams, weightDeltaKg, badgesUnlocked[] }` |
| `GET /v1/widgets/snapshot` | `US-PRG-05` | None (compact `< 1.5 KB` with `ETag`) | `{ date, timezone, serviceTrack, caloriesRemaining, caloriesTarget, proteinGrams, carbsGrams, fatGrams, waterCups, waterTargetCups, fastingPhase, fastingEndsAt, nextWorkoutFocus, workoutStatus }` |

---

### 3.4 New Device, Privacy, Profile, Support & Subscription Endpoints

| Method & Path | Story | Request Summary | Response Summary |
| :--- | :--- | :--- | :--- |
| `GET /v1/account/consents` | `US-AUTH-02`, `US-PRF-06` | None (`Authorization: Bearer`) | `{ items: [{ consentType, version, accepted, recordedAt }] }` |
| `POST /v1/devices/push-token` | `US-INT-02` | `{ deviceId, platform: "android"\|"ios", token, locale, timezone, appVersion }` | `{ registered: true, updatedAt }` |
| `DELETE /v1/devices/push-token` | `US-INT-02`, `US-PRF-06` | `{ deviceId }` | `{ removed: true }` |
| `POST /v1/profile/avatar` | `US-PRF-01` | Multipart `image` (`<= 512 KB`, WebP/JPEG/PNG) | `{ avatarUrl: "/v1/media/signed/<token>" }` |
| `DELETE /v1/profile/avatar` | `US-PRF-01` | None | `{ deleted: true }` |
| `POST /v1/support/feedback` | `US-PRF-07` | `{ category, message, foodOrExerciseId?, includeDiagnostics, appVersion, platform, lastRequestId? }` | `{ ticketId, receivedAt }` |
| `GET /v1/subscriptions/offerings` | `US-MON-02` | Query `platform`, `region` | `{ products: [{ productId, period: "monthly"\|"annual", bestValuePct? }], trialEligible }` |
| `POST /v1/subscriptions/verify` | `US-MON-03` | `{ platform, productId, signedTransactionJws?, transactionId?, purchaseToken?, orderId? }` | `{ verified: true, entitlements }` |
| `POST /v1/subscriptions/restore` | `US-MON-03` | `{ platform, tokens: string[] }` | `{ restored: boolean, entitlements }` |
| `POST /v1/webhooks/apple` | `US-MON-03`/`04` | Apple App Store Server Notifications JWS | `{ received: true }` *(Public webhook, Apple JWS verified)* |
| `POST /v1/webhooks/google-play` | `US-MON-03`/`04` | Google Play RTDN Cloud Pub/Sub message | `{ received: true }` *(Public webhook, Google OIDC JWT verified)* |

---

### 3.5 New `POST /v1/commands` Domain Actions (All Use `revision` + `Idempotency-Key` + `coaching_sync_outbox`)

| `action` Value | Story | Exact `payload` Contract |
| :--- | :--- | :--- |
| `food_favorite` | `US-NUT-07` | `{ "op": "add" \| "remove", "id"?: string, "item"?: { "name": string, "source": "ingredient"\|"manual", "key"?: string, "grams"?: number, "snapshot"?: object } }` |
| `copy_meal` | `US-NUT-07` | `{ "fromDate": "YYYY-MM-DD", "toDate": "YYYY-MM-DD", "slot": "breakfast" \| "lunch" \| "dinner" \| "snack" \| "all" }` |
| `grocery_toggle` | `US-NUT-09` | `{ "planId": string, "ingredientKey": string, "checked": boolean }` |
| `fasting_log` | `US-NUT-10` | `{ "op": "start" \| "end" \| "adjust_window", "at": "<iso8601>", "ifStartHour"?: 10\|12\|14\|16 }` |
| `ramadan_mode` | `US-NUT-10` | `{ "enabled": boolean, "iftarTime": "HH:mm", "suhoorCutoffTime": "HH:mm", "workoutTiming": "pre_iftar"\|"post_iftar"\|"post_taraweeh", "medicalClearanceAcknowledged"?: boolean }` |
| `workout_ui_mode` | `US-WRK-02`, `US-PRF-03` | `{ "mode": "simple" \| "pro" }` |
| `ad_hoc_exercise` | `US-WRK-05` | `{ "date": "YYYY-MM-DD", "dayIndex": 0..6, "exerciseId": string, "bothSides"?: boolean, "supersetGroupId"?: string \| null, "sets": [{ "kg": number, "reps": int, "rir"?: int, "pain"?: boolean, "setType"?: "normal"\|"warmup"\|"dropset"\|"failure" }] }` |
| `comeback_restart` | `US-CCH-06` | `{ "tier": "short_3_6d" \| "medium_7_13d" \| "detrained_14d_plus", "applyDeload": boolean, "deloadDurationDays"?: 1 \| 7, "updatedWeightKg"?: number, "reason"?: string, "renewMealPlan"?: boolean }` |
| `body_measurement` | `US-PRG-02`, `US-CCH-06` | `{ "date": "YYYY-MM-DD", "waistCm"?: number, "hipsCm"?: number, "chestCm"?: number, "neckCm"?: number, "leftArmCm"?: number, "rightArmCm"?: number, "leftThighCm"?: number, "rightThighCm"?: number, "bodyFatPct"?: number, "notes"?: string }` |
| `streak_freeze` | `US-PRG-04` | `{ "date": "YYYY-MM-DD" }` |
| `profile_update` | `US-PRF-01` | `{ "name"?: string, "workoutUiMode"?: "simple" \| "pro" }` |

---

## 4. Proposed Pure-English Error & Coaching Message Contracts (`contracts/error-codes.json` & `contracts/coaching-codes.json`)

All error messages (`contracts/error-codes.json`) and coaching/brief/review/eligibility messages (`contracts/coaching-codes.json`) MUST be 100% pure English and validated by `tests/error-contract.test.mjs`:

| Error Code | HTTP | Canonical English `message` | Params | Retryable |
| :--- | :---: | :--- | :--- | :---: |
| `AUTH_OAUTH_TOKEN_INVALID` | `401` | `Identity provider token is invalid or expired.` | `["provider"]` | `false` |
| `AUTH_PROVIDER_EMAIL_CONFLICT` | `409` | `An account with this email is already linked to another sign-in method.` | `["existingProvider"]` | `false` |
| `AUTH_JWKS_UNAVAILABLE` | `503` | `Identity provider signing keys are temporarily unavailable; retry shortly.` | `["provider"]` | `true` |
| `PRO_ENTITLEMENT_REQUIRED` | `402` | `This feature requires an active CuraFit Pro subscription.` | `["feature"]` | `false` |
| `AI_FOOD_NOT_RECOGNIZED` | `422` | `Could not recognize any food items from the provided input.` | `[]` | `false` |
| `INVALID_BARCODE_FORMAT` | `400` | `Barcode must be a valid 8 to 14 digit EAN or UPC code.` | `[]` | `false` |
| `BARCODE_NOT_FOUND` | `404` | `No product nutrition record found for this barcode.` | `["barcode"]` | `false` |
| `CHAT_MESSAGE_TOO_LONG` | `400` | `Coach chat message must not exceed 1000 characters.` | `["maxLength"]` | `false` |
| `EMPTY_MEASUREMENT_RECORD` | `400` | `Provide at least one body measurement or body fat value.` | `[]` | `false` |
| `PHOTO_NOT_FOUND` | `404` | `Progress photo record not found.` | `[]` | `false` |
| `PHOTO_TOO_LARGE` | `413` | `Uploaded image exceeds the maximum allowed byte size.` | `["maxBytes"]` | `false` |
| `UNSUPPORTED_IMAGE_FORMAT` | `415` | `Image must be JPEG, PNG, or WebP format.` | `[]` | `false` |
| `STREAK_FREEZE_UNAVAILABLE` | `409` | `Weekly streak freeze allowance has already been used.` | `[]` | `false` |
| `INVALID_PROFILE_NAME` | `400` | `Profile name must be 2 to 50 alphabetic characters.` | `[]` | `false` |
| `INVALID_SUBSCRIPTION_RECEIPT` | `400` | `Store subscription receipt could not be verified.` | `["platform"]` | `false` |
| `SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT` | `409` | `This store subscription is already linked to a different CuraFit account.` | `[]` | `false` |
| `BILLING_VERIFICATION_UNAVAILABLE` | `503` | `Subscription verification provider is temporarily unavailable; retry shortly.` | `[]` | `true` |
| `MATERNAL_CALORIE_CUT_BLOCKED` | `422` | `Calorie reductions are disabled during pregnancy for maternal safety.` | `[]` | `false` |
| `MAINTENANCE_MODE` | `503` | `Service is temporarily in maintenance mode; offline logging remains active.` | `[]` | `true` |
| `CLIENT_UPDATE_REQUIRED` | `426` | `Please update CuraFit to the latest version to continue syncing.` | `["minVersion"]` | `false` |

### Coaching Message Catalog (`contracts/coaching-codes.json`)
- Canonical registry mapping every deterministic coaching/brief/review/eligibility code (e.g., `RED_FLAGS_STOP`, `JOINT_PAIN_HOLD`, `RECOVERY_DELOAD_PROPOSAL`, `PERFORMANCE_DROP_CALORIE_CUT_HOLD`, `INSUFFICIENT_EVIDENCE_COVERAGE`, `MIN_SAFE_ENERGY_FLOOR_HOLD`, `MAX_SAFE_ENERGY_CEILING_HOLD`, `MATERNAL_CALORIE_CUT_BLOCKED`, `DOUBLE_PROGRESSION_READY`, `TREND_ON_TRACK`, `COOLDOWN_14D`) to its pure-English template and typed `params[]`. KMM resolves Arabic/English user copy deterministically from `(code, params)`.

---

## 5. Proposed Cloudflare D1 & R2 Migration (`drizzle/0006_production_features.sql`)

```sql
-- 0. User Profile Alterations (Avatar URL & Passwordless OAuth Support)
ALTER TABLE coaching_users ADD COLUMN avatar_url TEXT;
ALTER TABLE coaching_users ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'password'; -- 'password' | 'oauth_only'
-- Note: For passwordless OAuth users, password_hash stores a non-loginable sentinel ('!oauth') or nullable column migration so password login is strictly rejected.

-- 1. Passwordless Social OAuth Identities (Google & Apple)
CREATE TABLE IF NOT EXISTS coaching_oauth_identities (
  provider TEXT NOT NULL, -- 'google' | 'apple'
  subject TEXT NOT NULL, -- Verified OIDC sub claim
  user_id TEXT NOT NULL, -- FK -> coaching_users.user_id
  email TEXT,
  apple_refresh_token_enc TEXT, -- AES-GCM encrypted refresh token for Guideline 5.1.1(v) revoke on delete
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON coaching_oauth_identities(user_id);

-- 2. Push Notification Device Tokens (FCM & APNs)
CREATE TABLE IF NOT EXISTS coaching_push_tokens (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'android' | 'ios'
  push_token TEXT NOT NULL,
  locale TEXT NOT NULL,
  timezone TEXT NOT NULL,
  app_version TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

-- 3. MENA Barcode Catalog & User Submissions
CREATE TABLE IF NOT EXISTS food_barcodes (
  barcode TEXT PRIMARY KEY,
  name_ar TEXT,
  name_en TEXT NOT NULL,
  brand TEXT,
  serving_size_grams REAL NOT NULL,
  serving_label TEXT,
  values_per_100g_json TEXT NOT NULL,
  provenance TEXT NOT NULL, -- 'verified_brand' | 'openfoodfacts' | 'pending_review'
  submitted_by_user_id TEXT,
  created_at TEXT NOT NULL
);

-- 4. User Favorite Foods & Grocery Check-off Ledger
CREATE TABLE IF NOT EXISTS coaching_food_favorites (
  user_id TEXT NOT NULL,
  favorite_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, favorite_id)
);

CREATE TABLE IF NOT EXISTS coaching_grocery_checks (
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  ingredient_key TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, plan_id, ingredient_key)
);

-- 5. Body Measurements & Private R2 Progress Photo Metadata
CREATE TABLE IF NOT EXISTS coaching_body_measurements (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS coaching_progress_photos (
  user_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  date TEXT NOT NULL,
  pose TEXT NOT NULL, -- 'front' | 'side' | 'back'
  r2_object_key TEXT NOT NULL,
  weight_kg_snapshot REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, photo_id)
);
CREATE INDEX IF NOT EXISTS idx_photos_user_date ON coaching_progress_photos(user_id, date DESC);

-- 6. Guarded AI Coach Conversation Messages (Final AI Phase)
CREATE TABLE IF NOT EXISTS coaching_ai_messages (
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, thread_id, message_id)
);

-- 7. StoreKit 2 & Google Play Subscriptions
CREATE TABLE IF NOT EXISTS coaching_subscriptions (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'apple' | 'google'
  external_tx_id TEXT NOT NULL, -- originalTransactionId / purchaseToken
  product_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'active' | 'trialing' | 'grace_period' | 'cancelled_active' | 'expired'
  trial_used INTEGER NOT NULL DEFAULT 0,
  auto_renew_enabled INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  raw_state_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, external_tx_id)
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON coaching_subscriptions(user_id);

-- 8. Support Tickets
CREATE TABLE IF NOT EXISTS coaching_support_tickets (
  ticket_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  diagnostics_json TEXT,
  created_at TEXT NOT NULL
);

-- 9. Freemium Usage Quotas (Atomic Multi-Device Enforcement)
CREATE TABLE IF NOT EXISTS coaching_usage_quotas (
  user_id TEXT NOT NULL,
  quota_key TEXT NOT NULL, -- 'free_plan_renewals' | 'meal_swaps:YYYY-MM-DD' | 'exercise_swaps:YYYY-Www' | 'ai_parse_free' | 'ai_chat_free'
  used_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, quota_key)
);

-- 10. Normalized Activity Logs (Steps & Active Energy)
CREATE TABLE IF NOT EXISTS coaching_activity_logs (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL, -- 'manual' | 'apple_health' | 'health_connect'
  external_record_id TEXT,
  steps INTEGER NOT NULL DEFAULT 0,
  active_energy_kcal REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date, source)
);
CREATE INDEX IF NOT EXISTS idx_activity_user_date ON coaching_activity_logs(user_id, date DESC);

-- 11. Gentle Streak Freezes (Max 1 per 7 Calendar Days)
CREATE TABLE IF NOT EXISTS coaching_streak_freezes (
  user_id TEXT NOT NULL,
  freeze_date TEXT NOT NULL, -- 'YYYY-MM-DD'
  auto_applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, freeze_date)
);
```

### Cloudflare R2 Private Bucket Policy (`CURAFIT_MEDIA_BUCKET`) & Worker-Proxied HMAC-Signed URLs
- Bucket must remain **100% private** (public HTTP access disabled, zero R2 S3 access keys exposed to mobile clients).
- All private media reads and uploads route through **Worker-proxied HMAC-SHA256 signed URLs (`GET` / `PUT /v1/media/signed/{token}`)** (`15m` TTL, token payload signs `{ userId, r2Key, op, contentType?, maxBytes?, exp }` using Worker secret `MEDIA_SIGNING_SECRET`).
- `avatars/{userId}/{uuid}.webp` -> Uploaded via `POST /v1/profile/avatar` (`<= 512 KB`) and served via `/v1/media/signed/{token}`.
- `users/{userId}/photos/{photoId}.webp` -> Uploaded via `/v1/media/signed/{token}` issued by `POST /v1/progress/photos/upload-url`, read exclusively by the owning `userId` via `/v1/media/signed/{token}`, and deleted synchronously upon `DELETE /v1/progress/photos/{id}` or `DELETE` / `POST /v1/account/delete`.
