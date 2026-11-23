# CuraFit API v1 — Production Backend Implementation & Contract Specification

> **Purpose:** Complete engineering bridge between **CuraFit API v1** (`contracts/openapi.yaml` — **84 OpenAPI paths**, **50 `POST /v1/commands` actions**; `docs/API_REFERENCE.md` & `postman/CuraFit_API.postman_collection.json` — **16 Postman groups / 140 endpoints**; `contracts/error-codes.json` — **293 error codes**; `contracts/coaching-codes.json` — **97 coaching codes**) and the **Production Mobile User Stories** (`EPIC-01` .. `EPIC-10`).
> **Audience:** Cloudflare Workers / D1 Backend Team, KMM Mobile Team (`shared` networking & SQLDelight), QA Automation.
> **Contract Rules:**
> 1. All endpoints preserve uniform `{ ok: true, data, meta }` and `{ ok: false, error: { code, message, params, fieldErrors, retryable, details? }, meta }` envelopes.
> 2. **Zero Arabic characters** in API error messages (`contracts/error-codes.json`), server coaching/brief/review/eligibility messages (`contracts/coaching-codes.json`), or documentation (`tests/error-contract.test.mjs`). The KMM mobile app localizes non-English UI languages on-device by `(code, params)`.
> 3. Domain state mutations execute through `POST /v1/commands?view=receipt|full` with `revision` CAS + `Idempotency-Key` (whose request digest excludes `revision` so timeout + rebase replays cleanly) + `coaching_sync_outbox` whenever modifying account aggregate or synced user logs.
> 4. **Implementation Status:** All core non-AI endpoints, commands, production FCM/APNs push notifications (6 Cron triggers), StoreKit 2 & Google Play `subscriptionsv2.get` verification, and consolidated schema migration (`drizzle/0006_production_features.sql`) are **Implemented**. ONLY the 3 AI endpoints (`POST /v1/nutrition/ai-parse`, `POST /v1/coaching/chat`, `GET /v1/coaching/chat/history`) remain explicitly **Deferred to the Final AI Phase** (`501 FEATURE_DEFERRED_TO_AI_PHASE`; `capabilities.deferredFeatures: ["ai_meal_parse", "ai_coach_qa"]`).

---

## 1. Master Coverage Matrix — Core API Operations (16 Postman Groups / 140 Endpoints, 84 OpenAPI Paths, 50 Command Actions)

| # | Group | Operation / Command Action | Method & Path | Mobile User Stories | Status |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | 01. System | Health Check | `GET /v1/health` | `US-MOB-01`, `US-PRF-07` | `Implemented` |
| 2 | 01. System | Capabilities Manifest | `GET /v1/capabilities` | `US-MOB-01`, `US-AUTH-04`, `US-PRF-07` | `Implemented` (feature flags, `deferredFeatures`, `minSupportedVersion`, `maintenanceMode`) |
| 3 | 02. Auth | Refresh Access Token (Rotating `cfrt_...`) | `POST /v1/auth/refresh` | `US-AUTH-03` | `Implemented` |
| 4 | 02. Auth | Inspect Current Session | `GET /v1/auth/session` | `US-AUTH-03` | `Implemented` |
| 5 | 02. Auth | Claim Anonymous Web Session | `POST /v1/auth/claim-anonymous` | `US-AUTH-02` *(Legacy / Web-migration only)* | `Legacy / Web-Migration Only` |
| 6 | 02. Auth | Revoke Session (Current or All Devices) | `POST /v1/auth/revoke` | `US-PRF-06` | `Implemented` (clears push tokens on `allDevices: true`) |
| 7 | 02. Auth | Logout | `POST /v1/auth/logout` | `US-PRF-06` | `Implemented` (clears push tokens automatically) |
| 8 | 03. Onboarding | Pre-Screening Eligibility Check | `POST /v1/eligibility` | `US-MOB-03`..`09`, `US-PRF-02`..`04` | `Implemented` |
| 9 | 03. Onboarding | Generate Initial / Updated Plan (`generate`) | `POST /v1/commands?view=full` | `US-MOB-09`, `US-AUTH-02`, `US-PRF-02`..`04` | `Implemented` (requires `health_data_processing` consent) |
| 10 | 03. Onboarding | Confirm Health (`confirm_health`) | `POST /v1/commands?view=receipt` | `US-WRK-01` | `Implemented` |
| 11 | 03. Onboarding | Confirm Schedule (`confirm_schedule`) | `POST /v1/commands?view=receipt` | `US-WRK-01` | `Implemented` |
| 12 | 03. Onboarding | Renew Weekly Nutrition Plan (`renew_plan`) | `POST /v1/commands?view=receipt` | `US-NUT-01`, `US-CCH-06` | `Implemented` (free renewal quota + `402 PRO_ENTITLEMENT_REQUIRED` + `403 HEALTH_CONSENT_REQUIRED`) |
| 13 | 04. State | Get Bootstrap (`If-None-Match`) | `GET /v1/bootstrap` | `US-MOB-01`, `US-AUTH-02`, `US-AUTH-04`, `US-HOME-01`, `US-WRK-02`, `US-CCH-06`, `US-PRG-04` | `Implemented` |
| 14 | 04. State | Get Full Account State | `GET /v1/state` | `US-AUTH-04` (resync fallback) | `Implemented` |
| 15 | 04. State | Get 14-Day Progress Summary | `GET /v1/progress/summary` | `US-NUT-11`, `US-PRG-01` | `Implemented` |
| 16 | 05. Nutrition | Get Food Diary for Date / Range | `GET /v1/food-diary?date=` or `?from=&to=` | `US-HOME-02`, `US-NUT-01`, `US-NUT-02` | `Implemented` |
| 17 | 05. Nutrition | Log Planned Meal (`food_entry` planned) | `POST /v1/commands?view=receipt` | `US-HOME-03`, `US-NUT-02` | `Implemented` (`displaySlot` metadata) |
| 18 | 05. Nutrition | Log Reference Ingredient (`food_entry` ingredient) | `POST /v1/commands?view=receipt` | `US-NUT-04`, `US-NUT-05`, `US-NUT-06` | `Implemented` (`displaySlot` metadata + `unit: "reference"`) |
| 19 | 05. Nutrition | Log Manual / Barcode Entry (`food_entry` manual/barcode) | `POST /v1/commands?view=receipt` | `US-NUT-04`, `US-NUT-06`, `US-NUT-07` | `Implemented` (`displaySlot`, `source: "barcode" \| "manual"`) |
| 20 | 05. Nutrition | Batch Quick-Log Tray (`food_entry_batch`) | `POST /v1/commands?view=receipt` | `US-NUT-04`, `US-NUT-07` | `Implemented` (`1..15` entries atomically) |
| 21 | 05. Nutrition | Update Food Entry (`food_entry_update`) | `POST /v1/commands?view=receipt` | `US-NUT-02` | `Implemented` (no `0.1..4.0` clamp, `grams<->servings`, `displaySlot`) |
| 21 | 05. Nutrition | Confirm Food Day Complete (`food_complete`) | `POST /v1/commands?view=receipt` | `US-HOME-02`, `US-NUT-11` | `Implemented` |
| 22 | 05. Nutrition | Delete Food Entry (`food_delete`) | `POST /v1/commands?view=receipt` | `US-NUT-02` | `Implemented` |
| 23 | 05. Nutrition | Log Legacy Daily Total (`food`) | `POST /v1/commands?view=receipt` | `US-NUT-11` (Legacy fallback) | `Implemented` |
| 24 | 05. Nutrition | Switch Legacy Day (`food_switch_to_entries`) | `POST /v1/commands?view=receipt` | `US-NUT-11` | `Implemented` |
| 25 | 05. Nutrition | Get Meal Alternatives | `GET /v1/meal-alternatives?mealId=` | `US-HOME-03`, `US-NUT-03` | `Implemented` |
| 26 | 05. Nutrition | Replace Planned Meal (`replace_meal`) | `POST /v1/commands?view=receipt` | `US-NUT-03`, `US-NUT-08` | `Implemented` (free swap quota via `coaching_usage_quotas`) |
| 27 | 06. Biometrics | Log Water — Set/Increment Cups (`water`) | `POST /v1/commands?view=receipt` | `US-HOME-04`, `US-PRG-05` | `Implemented` |
| 28 | 06. Biometrics | List Water Logs | `GET /v1/water-logs` | `US-HOME-04`, `US-PRG-01` | `Implemented` |
| 29 | 06. Biometrics | Log Body Weight (`weight`) | `POST /v1/commands?view=receipt` | `US-HOME-04`, `US-CCH-06` | `Implemented` |
| 30 | 06. Biometrics | List Weight Logs | `GET /v1/weight-logs` | `US-HOME-04`, `US-PRG-01`, `US-INT-01` | `Implemented` |
| 31 | 06. Biometrics | Log Daily Steps (`steps`) | `POST /v1/commands?view=receipt` | `US-HOME-06` | `Implemented` |
| 32 | 06. Biometrics | Log Activity & Active Energy (`activity`) | `POST /v1/commands?view=receipt` | `US-HOME-06` | `Implemented` |
| 33 | 06. Biometrics | List Activity Logs | `GET /v1/activity-logs` | `US-HOME-06`, `US-INT-01` | `Implemented` |
| 34 | 06. Biometrics | Ingest Wearables Batch | `POST /v1/wearables/ingest` | `US-HOME-06`, `US-INT-01` | `Implemented` |
| 35 | 07. Workouts | List Workout Plans | `GET /v1/workout-plans` | `US-WRK-01` | `Implemented` |
| 36 | 07. Workouts | Get Workout Plan by ID | `GET /v1/workout-plans/{id}` | `US-AUTH-02`, `US-HOME-03`, `US-WRK-01` | `Implemented` (enriched with `targetRepsRange`, `targetRir`, `restSeconds`, `weeklyMuscleSets`) |
| 37 | 07. Workouts | Log Exercise Sets (`workout`) | `POST /v1/commands?view=receipt` | `US-WRK-03`, `US-WRK-04`, `US-WRK-05` | `Implemented` (`entryMode`, `weightedBodyweight`/`addedKg`, `notes`, `setType`, `supersetGroupId`, max `15` sets) |
| 38 | 07. Workouts | Delete Workout Log (`workout_delete`) | `POST /v1/commands?view=receipt` | `US-WRK-04` | `Implemented` |
| 39 | 07. Workouts | List Workout Logs | `GET /v1/workout-logs?exerciseId=` | `US-WRK-04`, `US-PRG-01` | `Implemented` (filterable by date range and `exerciseId`) |
| 40 | 07. Workouts | Complete/Update Session (`session`) | `POST /v1/commands?view=receipt` | `US-WRK-09`, `US-WRK-10` | `Implemented` (optional `notes`) |
| 41 | 07. Workouts | Delete Session (`session_delete`) | `POST /v1/commands?view=receipt` | `US-WRK-10` | `Implemented` |
| 42 | 07. Workouts | List Workout Sessions | `GET /v1/sessions` | `US-WRK-01`, `US-WRK-10` | `Implemented` |
| 43 | 07. Workouts | Get Exercise Alternatives | `GET /v1/exercise-alternatives` | `US-WRK-08` | `Implemented` |
| 44 | 07. Workouts | Replace Exercise (`replace_exercise`) | `POST /v1/commands?view=receipt` | `US-WRK-08` | `Implemented` (free weekly quota `2/wk`, safety swaps always Free) |
| 45 | 07. Workouts | Propose Reschedule (`reschedule`) | `POST /v1/commands?view=receipt` | `US-WRK-09` | `Implemented` |
| 46 | 08. Coaching | Submit Recovery Check-In (`recovery`) | `POST /v1/commands?view=full` | `US-CCH-02`, `US-CCH-06` | `Implemented` |
| 47 | 08. Coaching | List Recovery Check-Ins | `GET /v1/checkins` | `US-CCH-02`, `US-PRG-01` | `Implemented` |
| 48 | 08. Coaching | Trigger Adaptive Review (`review`) | `POST /v1/commands?view=full` | `US-CCH-01`, `US-CCH-03`, `US-CCH-06` | `Implemented` (floors/ceiling, maternal/senior caps, 97 coaching codes, `403 HEALTH_CONSENT_REQUIRED`) |
| 49 | 08. Coaching | Accept/Reject Proposal (`adaptation`) | `POST /v1/commands?view=receipt` | `US-WRK-09`, `US-CCH-03` | `Implemented` (Free for `recovery`/`schedule`; Pro for `calories`/`weekly_volume`/`maintenance`; 7-day maintenance plan) |
| 50 | 08. Coaching | Get On-Demand Coaching Brief | `GET /v1/coaching/brief` | `US-HOME-01`, `US-HOME-03`, `US-CCH-01` | `Implemented` (`code`/`params` + `actionTarget` enum) |
| 51 | 08. Coaching | Get Coaching Inbox | `GET /v1/coaching/inbox` | `US-HOME-01`, `US-CCH-01`, `US-CCH-04` | `Implemented` (pure-English `code`/`params` + dynamic `pushConfigured`) |
| 52 | 08. Coaching | Get Coaching History | `GET /v1/coaching/history` | `US-CCH-04` | `Implemented` |
| 53 | 08. Coaching | Submit Coaching Feedback (`coaching_feedback`) | `POST /v1/commands?view=receipt` | `US-WRK-09`, `US-CCH-04`, `US-CCH-06` | `Implemented` |
| 54 | 08. Coaching | Acknowledge Case (`coaching_ack`) | `POST /v1/commands?view=receipt` | `US-CCH-04` | `Implemented` |
| 55 | 08. Coaching | Decide Coaching Case (`coaching_decision`) | `POST /v1/commands?view=receipt` | `US-CCH-04` | `Implemented` |
| 56 | 08. Coaching | Report Outcome (`coaching_outcome`) | `POST /v1/commands?view=receipt` | `US-CCH-04` | `Implemented` |
| 57 | 09. Plans | List Nutrition Plan Refs | `GET /v1/plans` | `US-NUT-01` | `Implemented` |
| 58 | 09. Plans | Get Full Nutrition Plan | `GET /v1/plans/{planId}` | `US-AUTH-02`, `US-NUT-01` | `Implemented` |
| 59 | 09. Plans | Lazy-Load Single Plan Day | `GET /v1/plans/{planId}/days/{date}` | `US-HOME-03`, `US-NUT-01` | `Implemented` |
| 60 | 10. Catalogs | Get Catalog Provenance Manifest | `GET /v1/catalog/manifest` | `US-WRK-07`, `US-PRF-07` | `Implemented` |
| 61 | 10. Catalogs | List Muscle Taxonomy & Labels | `GET /v1/catalog/muscles` | `US-WRK-07` | `Implemented` (enriched with Arabic translations via `data/exercises-i18n.json`) |
| 62 | 10. Catalogs | Search Foods (AR/EN + Synonyms) | `GET /v1/foods` | `US-NUT-04` | `Implemented` |
| 63 | 10. Catalogs | Get Food Item Detail | `GET /v1/foods/{id}` | `US-NUT-04` | `Implemented` |
| 64 | 10. Catalogs | Search Egyptian & Ramadan Beverages | `GET /v1/beverages` | `US-NUT-04` | `Implemented` |
| 65 | 10. Catalogs | Calculate Custom Recipe / Drink | `POST /v1/foods/calculate` | `US-NUT-04` | `Implemented` |
| 66 | 10. Catalogs | Search Exercises Catalog (868 items) | `GET /v1/exercises` | `US-WRK-05`, `US-WRK-07` | `Implemented` (`nameAr`, nullable `mediaUrl`/`thumbnailUrl`) |
| 67 | 10. Catalogs | Get Exercise Detail by ID | `GET /v1/exercises/{id}` | `US-WRK-07` | `Implemented` (`nameAr`, `instructionsAr`, `commonMistakes*`, nullable `mediaUrl`/`thumbnailUrl`) |
| 68 | 11. Settings | Get Incremental Sync Changes & Deltas | `GET /v1/sync/changes` | `US-AUTH-04` | `Implemented` |
| 69 | 11. Settings | Update Timezone & Locale (`timezone`) | `POST /v1/commands?view=receipt` | `US-MOB-02`, `US-HOME-01`, `US-PRF-05` | `Implemented` |
| 70 | 11. Settings | Get Notification Preferences | `GET /v1/notifications/preferences` | `US-INT-02` | `Implemented` (includes `exemptSuhoorFromQuietHours` & lead time `15\|30\|60\|120`) |
| 71 | 11. Settings | Update Notification Prefs (`notification_preferences`) | `POST /v1/commands?view=receipt` | `US-INT-02` | `Implemented` |
| 72 | 11. Settings | Get Entitlements | `GET /v1/entitlements` | `US-NUT-03`, `US-WRK-08`, `US-MON-01`, `US-MON-04` | `Implemented` (`tier: "pro" \| "free"`, full billing state machine & quotas) |
| 73 | 12. Privacy | Record Privacy / Health Consent | `POST /v1/account/consents` | `US-MOB-09`, `US-AUTH-02`, `US-PRF-06` | `Implemented` (single or batch `items[]`; persists `recordedAt`; withdrawing `health_data_processing` returns `403 HEALTH_CONSENT_REQUIRED`) |
| 74 | 12. Privacy | Backfill Normalized Tables | `POST /v1/account/backfill` | *Internal/Server Migration Ops* | `Implemented` |
| 75 | 12. Privacy | Export Full Account Data (GDPR) | `GET /v1/account/export` | `US-PRF-06` | `Implemented` (`oauthIdentities`, `registeredDevices`, `aiMessages`, live `entitlements`, signed media URLs) |
| 76 | 12. Privacy | Delete Account Permanently (GDPR) | `DELETE` / `POST /v1/account/delete` | `US-PRF-06` | `Implemented` (two-phase: atomic D1 + `coaching_trial_tombstones` FIRST, then R2 purge + Apple revoke) |

*(Groups 13–16 endpoints and all 50 command actions are detailed in Section 3 below.)*

---

## 2. Implemented Core Engine & Endpoint Enhancements

### M1. `POST /v1/eligibility`, `POST /v1/plans/preview` & `POST /v1/commands` (`action: "generate"`) — Onboarding & Safety Parity
- **Files:** `server/coaching.mjs`, `server/workouts.mjs`, `coaching-shared.mjs`, `planner-core.mjs`
- **Implemented Rules:**
  1. **Age `18..95` & `seniorMode`:** Accepts integers `18..95`; when `age >= 70`, sets `profile.seniorMode = true`, caps deficit at `-400 kcal`, enforces protein `>= 1.2 g/kg`, and filters out plyometrics / heavy spinal loading (`barbell_back_squat`, `conventional_deadlift`, `heavy_overhead_press`).
  2. **Maternal Status (`pregnant_t1 | pregnant_t2 | pregnant_t3 | breastfeeding | none`):** Applies additive modifiers (`+0/+340/+450/+400 kcal`, `+0/+15/+25/+20g` protein or min `1.4 g/kg`, `+300/+600 ml` water), blocks `goal == "lose"` during pregnancy, caps deficit at `-300 kcal` during breastfeeding, blocks `keto` and `intermittent_fasting` in pregnancy AND breastfeeding, and filters supine/high-fall-risk exercises after T1.
  3. **Canonical Enums & Real Alias Only:**
     - Canonical `goalPace: "slow" | "moderate" | "fast"`, `budget: "low" | "medium" | "high"`, `workoutLocation: "gym_only" | "home_only" | "home_and_gym"`, `homeEquipment: "bench"`, `excludedGroups: "spicy"`, and persisted `profile.activity`.
     - Single alias `homeEquipment: "bands" -> "resistance_bands"`.
     - `injuries`: maps short keys (`knee`, `lower_back`, `shoulder`, `neck`, `wrist`, `ankle`, `elbow`, `hip`, `diastasis_recti`) in `canonicalInjuries()` with conservative `elbow_pain` substitutions.
     - `diseases`: supports `diabetes_t1`, `diabetes_t2`, `hypothyroid` (`0.95 * REE`), `celiac` (auto-inject `gluten`), `kidney` (cap protein `<= 1.1 g/kg`), `gout` (cap protein `<= 1.4 g/kg`, `+500 ml` water), and enforces conservative medical blocks on `keto + cholesterol` and `intermittent_fasting + breastfeeding`.
  4. **Clinical Safety Bounds, 7-Day Workouts & Override Flags:** Blocks `lose` when `currentBmi < 18.5`; `targetWeight` upper bound `250 kg`; `selectedWorkoutDays` `1..7`; optional `externalTrainingDays` for `nutrition_only + muscle_gain`; optional `bmiWarningOverride: boolean`, `overwriteExisting: boolean`, and `workoutUiMode: "simple" | "pro"`.
  5. **Unified Energy & Water Equations:**
     - Mifflin-St Jeor REE * `activityMultiplier`; percentage-of-TDEE capped deltas (`lose`: `-min(tdee * {0.10, 0.15, 0.20}, 500)`, `muscle_gain`: `+min(tdee * {0.05, 0.08, 0.10}, 250)`, recomposition = `0 kcal`, `gain`: `+min(tdee * {0.08, 0.12, 0.15}, 400)`).
     - Calorie floors `1500` M / `1200` F / `1800` Pregnant / `1600` Breastfeeding; ceiling `4200 kcal`.
     - Adjusted Body Weight for `bmi > 30`: `IBW = 24 * H^2`, `effectiveWeight = IBW + 0.35 * (w - IBW)`.
     - Protein `1.0..1.8 g/kg` (`>= 1.2` `seniorMode`, `<= 1.1` `kidney`, `<= 1.4` `gout`, maternal `+0/+15/+25/+20g` or min `1.4 g/kg`); total carbs (`keto <= 50g`, `low_carb <= 130g`); timeline range `estimatedWeeksMin..Max` (`7700 kcal/kg`).
     - Unified `dailyWaterTarget`: `weight * 35 + activity(+350 mod / +500 act) + workoutDay(+500) + maternal(+300 preg / +600 bf) + gout(+500) + hotClimate(+200 egypt/gulf)`, clamped `2.0..5.0 L`.
  6. **Preserve Existing Logs on `generate` Re-run (`US-PRF-02`..`04`):** Preserves all historical `foodEntries`, `weights`, `waterLogs`, `workoutLogs`, and `sessions`.
  7. **Adaptive Review, Maintenance & Consent Enforcement (`US-CCH-03`):** `validateEnergyChange` enforces `1500/1200/1800/1600` floors, `4200` ceiling, pregnancy cut block (`MATERNAL_CALORIE_CUT_BLOCKED`), breastfeeding `-300 kcal` deficit cap, and Senior `-400 kcal` deficit cap. `maintenance` adaptation checks `FUTURE_FOOD_ENTRIES_CONFLICT` and generates a clean 7-day maintenance plan (never 8 days). Withdrawn `health_data_processing` consent blocks `generate`, `review`, `adaptation`, and `renew_plan` with `403 HEALTH_CONSENT_REQUIRED`.

### M2. `GET /v1/bootstrap`
- **File:** `server/presentation.mjs`
- **Response Fields inside `data`:**
  - `onboarding`: `{ serviceTrack, journeyStartedOn, workoutPrefs }`.
  - `consents`: Recorded consents (`health_data_processing`, `terms_and_privacy`, `analytics_telemetry`) with `recordedAt`.
  - `profile`: Includes `activity`, `seniorMode` (`boolean`), `maternalStatus`, `workoutUiMode` (`"simple" | "pro"`), `unitSystem` (`"metric" | "imperial"`), and hydrated short-lived signed `avatarUrl` (900s TTL).
  - `preferences`: Includes `unitSystem` (`"metric" | "imperial"`).
  - `scheduledSessions`: 14-day projected schedule array (applying accepted `scheduleOverrides`, including `fromDate` on moved sessions).
  - `todaySummary.nutrition`: `{ energy, protein, carbs, fat, complete, targets: { energy, protein, carbs, fat } }`.
  - `todaySummary.activity`: `{ steps, activeEnergyKcal, source, updatedAt }`.
  - `todaySummary.cardio`: `{ sessionsCount, totalMinutes, totalKcal }`.
  - `todaySummary.scheduledWorkout`: includes `fromDate` (`string | null`) when rescheduled.
  - `todaySummary.fastingState`: `{ mode, phase, windowStart, windowEnd, startedAt, targetEndAt, ramadanConfig, streakDays }`.
  - `todaySummary.ramadanMode`: `{ enabled, iftarTime, suhoorCutoffTime, workoutTiming, endDate }`.
  - `todaySummary.cycleState`: `null` when non-female or disabled; otherwise `{ enabled, phase, cycleDay, waterRetentionLikely, pausedReason, nextPeriodEstimateDate, coachingHintCode }`.
  - `streakSummary`: `{ currentDays, longestDays, freezeAvailable, freezeUsedDates[], todayQualified }`.
  - `engagementState`: `{ daysSinceLastLog, lastLoggedAt, weeklyCheckinDue, comebackTier }` (`weeklyCheckinDue` uses `journeyStartedOn` + last weekly review/feedback cadence, not daily recovery check-ins).
  - `entitlements`: Canonical `tier: "pro" | "free"` object (`status`, `productId`, `provider`, `expiresAt`, `autoRenewEnabled`, `trialEligible`, `isInGracePeriod`, `isOnHold`, `isPaused`, `managementUrl`, `quotas`, `features`).

### M3. `POST /v1/commands` (`action: "workout"`)
- **Files:** `server/coaching.mjs`, `server/training-state.mjs`, `server/recovery.mjs`
- **Implemented Extensions:**
  - `entryMode`: `"simple" | "pro"` (defaults `"pro"`), `supersetGroupId`: `string | null`, `sets[].setType`: `"normal" | "warmup" | "dropset" | "failure"`, max `15` sets (`1..15`).
  - Consistently excludes `setType === "warmup"`, `pain: true`, `reps > 15`, assisted exercises, and Simple-mode `kg: 0` (on external-load movements) across `sessionCompletion`, `progression()`, `performanceDrop`, `weeklyVolumeEscalation`, and PR / Estimated 1RM analytics (`GET /v1/workouts/prs`, `GET /v1/progress/analytics`).

### M4. `GET /v1/exercises`, `GET /v1/exercises/{id}` & `GET /v1/catalog/muscles`
- **Files:** `server/worker.mjs`, `server/workouts.mjs`, `data/exercises-i18n.json`
- **Implemented Extensions:**
  - Enriches all 868 exercises and 69 muscles with Arabic & English translations from `data/exercises-i18n.json` (`nameAr`, `instructionsAr[]`, `commonMistakesAr[]`, muscle Arabic labels).
  - `mediaUrl` and `thumbnailUrl` are nullable (`string | null`) until hosted assets are added.

### M5. `GET /v1/notifications/preferences` & `action: "notification_preferences"`
- **Files:** `server/coaching-settings.mjs`, `server/push.mjs`
- **Implemented Fields:** `dailyReminder`, `workoutReminder`, `waterReminder`, `weeklyReviewReminder`, `mealReminders`, `fastingReminder`, `ramadanSuhoorReminder`, `exemptSuhoorFromQuietHours` (`boolean` — allows Cron `ramadan_suhoor_reminder` to fire even during sleep Quiet Hours), `preferredWorkoutReminderMinutesBefore` (`15 | 30 | 60 | 120`), `quietHoursStart`, `quietHoursEnd`, `channels`.

### M6. `GET /v1/entitlements`
- **File:** `server/subscriptions.mjs`
- **Canonical Response:** `tier` (`"pro" | "free"`), `status` (`"none" | "active" | "trialing" | "grace_period" | "cancelled_active" | "billing_retry" | "account_hold" | "paused" | "expired"`), `productId`, `provider` (`"apple" | "google" | null`), `expiresAt`, `autoRenewEnabled`, `trialEligible` (respects `coaching_trial_tombstones`), `isInGracePeriod`, `isOnHold`, `isPaused`, `managementUrl` (Android includes `?sku={productId}&package={GOOGLE_PLAY_PACKAGE_NAME}`), `quotas: { aiParsesRemainingFree, aiCoachMessagesRemainingFree, freePlanRenewalsRemaining, dailyMealSwapsLimit, dailyMealSwapsRemaining, weeklyExerciseSwapsLimit, weeklyExerciseSwapsRemaining }`, `features[]` (`FREE_FEATURES` / `PRO_FEATURES`).

### M7. `GET /v1/capabilities`, `GET /v1/account/export`, `DELETE`/`POST /v1/account/delete` & Pure-English Contracts
- `capabilities.features` advertises implemented capabilities (including `custom_recipes`, `cardio_tracking`, `cycle_awareness`, `ramadan_fasting`, `seasonal_flex`) plus `deferredFeatures: ["ai_meal_parse", "ai_coach_qa"]`, `minSupportedVersion: { android, ios }`, and `maintenanceMode: { active, message }`.
- Pure-English copy + canonical `code` & `params` via **`contracts/coaching-codes.json` (97 codes)** across `GET /v1/coaching/brief` (`actionTarget` enum `[recovery, food, feedback, workout, water, review]`), `GET /v1/coaching/inbox` (dynamic `pushConfigured: boolean`), `POST /v1/eligibility`, `GET /v1/workouts/split-review`, and `action: "review"`.
- `Idempotency-Key` digest excludes `revision` in `POST /v1/commands`.
- `GET /v1/account/export` includes `oauthIdentities`, `registeredDevices`, `customRecipes`, `cardioLogs`, `cycleLogs`, `cycleSettings`, `aiMessages`, live `entitlements`, normalized logs, and short-lived signed URLs for avatar & progress photos.
- `DELETE` / `POST /v1/account/delete` executes safe two-phase deletion: atomic D1 batch FIRST (including anonymized SHA-256 `coaching_trial_tombstones` and full erasure of `coaching_custom_recipes`, `coaching_cardio_logs`, `coaching_cycle_logs`), THEN best-effort R2 object purge and Apple Sign-In refresh-token revocation (`https://appleid.apple.com/auth/revoke`).

### M8. `POST /v1/commands` (`food_entry` / `food_entry_batch` / `food_entry_update`) — Display Slot, Custom Recipes & Bounds Parity (`US-NUT-02`, `US-NUT-10`, `US-NUT-12`)
- **File:** `server/food.mjs`
- Preserves canonical wire `slot` enum (`"breakfast" | "lunch" | "dinner" | "snack"`) while supporting optional `displaySlot`: `"breakfast" | "lunch" | "dinner" | "snack_1" | "snack_2" | "suhoor" | "iftar" | "ramadan_snack" | "night_snack"`, `source: "planned" | "ingredient" | "recipe" | "barcode" | "manual"`, `quantity` `0.1..10.0` (planned meals), `servings` `0.1..20.0` or `grams` `1..5000` (saved recipes with frozen `recipeTotalGrams`/`recipeServings` snapshot), `grams` `1..3000` (ingredients), and `unit: "reference"`.
- `food_entry_batch` validates and commits `1..15` entries atomically (`all-or-nothing`) without leaving partial logs.

---

## 3. Production Endpoints & All 50 Command Actions (Groups 13–16 + Full Command Registry)

### 3.1 Social OAuth, OAuth Account Linking & Stateless Onboarding Preview (Group 13)

| Method & Path | Story | Auth & Request Summary | Response Summary |
| :--- | :--- | :--- | :--- |
| `POST /v1/plans/preview` | `US-MOB-05`..`09`, `US-PRF-02` | Public (IP rate-limited): draft biometrics, `maternalStatus`, `goal`, `targetWeight`, `goalPace`, `serviceTrack`, `activity`, `diseases`, `dietType`, `region`, `healthConfirmed`, workout setup | `{ calories, macros: { protein, carbs, fat }, waterTargetLiters, restDayWaterTarget, workoutDayWaterTarget, estimatedExercisesPerSession, estimatedWeeksMin, estimatedWeeksMax, recommendedSplit, seniorMode, warnings[], clinicalBlocks[] }` |
| `POST /v1/auth/oauth/google` | `US-AUTH-01` | Public (`30 req/min/IP`): `{ idToken, deviceId, platform, locale, timezone }` | `{ tokenType, accessToken, expiresIn: 900, expiresAt, refreshToken, refreshExpiresIn, refreshExpiresAt, sessionId, isNewUser, provider: "google", user: { userId, email, name, avatarUrl, entitlement, createdAt } }` |
| `POST /v1/auth/oauth/apple` | `US-AUTH-01` | Public (`30 req/min/IP`): `{ identityToken, authorizationCode, fullName?, deviceId, platform, locale, timezone }` | Same auth envelope (`provider: "apple"`), hydrates signed `avatarUrl` (900s TTL) |
| `GET /v1/auth/oauth/providers` | `US-PRF-01`, `US-PRF-06` | Bearer Auth: lists linked Google/Apple OAuth identities | `{ items: [{ provider, email, linkedAt }] }` |
| `POST /v1/auth/oauth/link` | `US-PRF-01`, `US-PRF-06` | Bearer Auth: `{ provider: "google" \| "apple", idToken?, identityToken?, authorizationCode? }` | `{ linked: true, provider, providers[] }` |
| `DELETE /v1/auth/oauth/{provider}` | `US-PRF-01`, `US-PRF-06` | Bearer Auth: path `provider` (`google` \| `apple`) | `{ unlinked: true, provider }` (`409 CANNOT_UNLINK_LAST_AUTH_METHOD` if last sign-in method) |

---

### 3.2 Nutrition Tools — Pantry, Grocery, Favorites, Custom Recipes, Barcode, Fasting & Deferred AI Parse (Group 14)

| Method & Path | Story | Status | Request Summary | Response Summary |
| :--- | :--- | :--- | :--- | :--- |
| `GET /v1/foods/barcode/{ean}` | `US-NUT-06` | `Implemented` | Path `ean` (`8..14` digits); Pro-gated (`402`) when enforcement enabled | `{ barcode, nameAr, nameEn, brand, servingSizeGrams, servingLabel, valuesPer100g, provenance, isApproximate }` |
| `POST /v1/foods/barcode` | `US-NUT-06` | `Implemented` | `{ barcode, nameAr?, nameEn, brand, servingSizeGrams, servingLabel, valuesPer100g }` | `{ barcode, status: "pending_review", createdAt }` |
| `GET /v1/foods/recent` | `US-NUT-04`, `US-NUT-07` | `Implemented` (`Free`) | Query `days` (`1..90`, default `30`), `limit` (`1..50`, default `25`) | `{ items: [{ name, source, key?, grams?, servings?, recipeId?, barcode?, macroSnapshot, logCount, lastLoggedAt }] }` |
| `GET /v1/foods/favorites` | `US-NUT-07` | `Implemented` | Query `offset`, `limit` (`planned`, `ingredient`, `recipe`, `barcode`, `manual`) | `{ items: [{ id, name, source, key?, grams?, snapshot }] }` |
| `GET /v1/recipes` | `US-NUT-12` | `Implemented` (`Free`) | Query `offset`, `limit`, `q?` | `{ total, offset, limit, nextOffset, items: [{ id, name, servings, finalWeightGrams, totalGrams, yieldRatio, qualityTier, gramsPerServing, perServing, per100g, totals, ingredients[], additions[], notes, createdAt, updatedAt }] }` |
| `GET /v1/pantry/catalog` | `US-NUT-08` | `Implemented` (`Free`) | None (wraps `pantryCatalog(library)`) | `{ items: [{ id, label, labelEn, category, keys[] }] }` |
| `POST /v1/pantry/alternatives` | `US-NUT-08` | `Implemented` (`Free`) | `{ mealId?, slot?, selectedIngredients: string[], limit?: 12 }` | `{ items: [{ templateId, name, snapshot, matchedIngredientKeys }] }` |
| `GET /v1/plans/{planId}/grocery-list` | `US-NUT-09` | `Implemented` | Query `days=all\|remaining\|3\|7`, `preview=true\|false`; non-preview Pro-gated (`402`), `?preview=true` Free 2-item preview | `{ planId, daysScope, previewMode, lockedCount, categories: [{ categoryId, label, items: [{ ingredientKey, name, nameEn, nameAr, preparationState: "cooked"\|"raw_as_sold", totalGrams, practicalQuantityLabel, checked, mealRefs[] }] }] }` |
| `GET /v1/nutrition/fasting-state` | `US-NUT-10`, `US-INT-03` | `Implemented` (`Free`) | None (auto-reverts Ramadan after `endDate`) | `{ mode: "off" \| "if_16_8" \| "ramadan", preset, windowHours, phase: "fasting" \| "eating", windowStart, windowEnd, startedAt, targetEndAt, ramadanConfig, seasonalContext, streakDays }` |
| `POST /v1/nutrition/ai-parse` | `US-NUT-05` | **Deferred — Final AI Phase (`501 FEATURE_DEFERRED_TO_AI_PHASE`)** | `{ inputType: "photo" \| "voice" \| "text", text?, imageBase64?, audioBase64?, locale, region, slot }` | Returns `501 FEATURE_DEFERRED_TO_AI_PHASE` until Final AI Phase rollout |

---

### 3.3 Workouts Insights, Cardio, Cycle Awareness, Analytics, Measurements, Media, Widgets & Deferred AI Chat (Groups 15 & 16)

| Method & Path | Story | Status | Request Summary | Response Summary |
| :--- | :--- | :--- | :--- | :--- |
| `GET /v1/workouts/prs` | `US-WRK-10` | `Implemented` | Query `since?`, `exerciseId?` | `{ items: [{ exerciseId, type, value, previousValue, reps, date, loadMode }], summaryByExercise }` (inverts lower-kg-is-better for `loadMode === "assisted"`) |
| `GET /v1/workouts/split-review` | `US-WRK-01`, `US-CCH-03` | `Implemented` (`Free`) | None | `{ due: boolean, kind, code, params, text }` (pure-English canonical split progression evaluation) |
| `GET /v1/cardio-logs` | `US-WRK-11` | `Implemented` (`Free`) | Query `from?`, `to?`, `offset`, `limit` | `{ total, offset, limit, nextOffset, summary: { sessionsCount, totalMinutes, totalKcal }, items: [{ id, date, modality, durationMinutes, intensity, distanceKm, estimatedKcal, source, externalRecordId, notes, safetyCaution }] }` |
| `GET /v1/cycle/state` | `US-PRG-06` | `Implemented` (`Free`, Female Opt-In) | None (`available: false` for male profiles) | `{ available, enabled, pausedReason, disclaimer, settings, currentCycleDay, phase, isOverdue, overdueDays, discreetMode, adaptiveThemeEnabled, phaseAccentToken, suggestedGentleSession, waterRetentionLikely, nextPeriodEstimateDate, coachingHintCode, recentLogs[] }` |
| `GET /v1/progress/analytics` | `US-PRG-01` | `Implemented` | Query `range=14d\|30d\|90d\|all` (`400 INVALID_DATE_RANGE`), `exerciseId?`; `90d`/`all` Pro-gated (`402`) when enforcement enabled | `{ weightSeries[], weightMovingAvg7d[], calorieAdherence[], weeklyVolume[], exercise1RmSeries[], estimatedWeeksRemaining }` (1RM excludes `pain: true`, `reps > 15`, assisted; forecast `null` during pregnancy) |
| `GET /v1/measurements` | `US-PRG-02` | `Implemented` | Query `from?`, `to?`, `offset`, `limit` | `{ total, offset, limit, nextOffset, items: [{ id, date, waistCm, hipsCm, chestCm, neckCm, leftArmCm, rightArmCm, leftThighCm, rightThighCm, bodyFatPct, notes }] }` |
| `POST /v1/progress/photos/upload-url` | `US-PRG-03` | `Implemented` | Required `[contentType, byteSize, pose, date]` (max **5 MB / `5242880`**); Pro-gated (`402`) when enforcement enabled | `{ photoId, objectKey, uploadUrl: "/v1/media/signed/<token>", maxBytes: 5242880, expiresAt }` |
| `POST /v1/progress/photos/confirm` | `US-PRG-03` | `Implemented` | Required `[photoId, pose, date]`, optional `objectKey`, `weightKgSnapshot` | `{ id, date, pose, weightKgSnapshot, downloadUrl: "/v1/media/signed/<token>", expiresAt, createdAt }` |
| `GET /v1/progress/photos` | `US-PRG-03` | `Implemented` | Query `offset`, `limit` (**always accessible even after Pro downgrade**) | `{ items: [{ id, date, pose, weightKgSnapshot, downloadUrl: "/v1/media/signed/<token>", expiresAt, createdAt }] }` |
| `DELETE /v1/progress/photos/{photoId}` | `US-PRG-03` | `Implemented` | Path `photoId` (**always accessible even after Pro downgrade**) | `{ deleted: true, id }` |
| `GET` / `PUT /v1/media/signed/{token}` | `US-PRG-03`, `US-PRF-01` | `Implemented` | User-bound HMAC-SHA256 signed R2 media URL (`403 INVALID_MEDIA_TOKEN` on invalid/expired/mismatched token) | Streams private R2 binary (`GET`) or validates & writes binary (`PUT`) |
| `GET /v1/progress/weekly-wrapped` | `US-PRG-04` | `Implemented` | Query `weekEnd?` | `{ weekStart, weekEnd, adherenceScorePct, workoutsCompleted, totalVolumeKg, cardioSessionsCount, cardioMinutes, newPrsCount, avgCalories, avgProteinGrams, weightDeltaKg, badgesUnlocked[] }` (multi-track `adherenceScorePct`, up to 8 badges) |
| `GET /v1/widgets/snapshot` | `US-PRG-05` | `Implemented` | None (compact `< 1.5 KB` with `ETag`; NEVER includes cycle data) | `{ date, timezone, serviceTrack, caloriesRemaining, caloriesTarget, proteinGrams, carbsGrams, fatGrams, waterCups, waterTargetCups, streakDays, readinessStatus, seasonalMode, fastingPhase, fastingEndsAt, nextWorkoutFocus, workoutStatus }` |
| `POST /v1/coaching/chat` | `US-CCH-05` | **Deferred — Final AI Phase (`501 FEATURE_DEFERRED_TO_AI_PHASE`)** | `{ threadId: "default", message: string (<=1000), locale }` | Returns `501 FEATURE_DEFERRED_TO_AI_PHASE` until Final AI Phase rollout |
| `GET /v1/coaching/chat/history` | `US-CCH-05` | **Deferred — Final AI Phase (`501 FEATURE_DEFERRED_TO_AI_PHASE`)** | Query `limit=50`, `before?` | Returns `501 FEATURE_DEFERRED_TO_AI_PHASE` until Final AI Phase rollout |

---

### 3.4 Device Push, Privacy, Profile, Support & Subscription Endpoints (Group 16)

| Method & Path | Story | Status | Request Summary | Response Summary |
| :--- | :--- | :--- | :--- | :--- |
| `GET /v1/account/consents` | `US-AUTH-02`, `US-PRF-06` | `Implemented` | None (`Authorization: Bearer`) | `{ items: [{ consentType, version, accepted, recordedAt }] }` |
| `POST /v1/devices/push-token` | `US-INT-02` | `Implemented` | `{ deviceId, platform: "android"\|"ios", token, locale, timezone, appVersion }` | `{ registered: true, deviceId, platform, updatedAt }` |
| `DELETE /v1/devices/push-token` | `US-INT-02`, `US-PRF-06` | `Implemented` | Query `?deviceId=...` (or JSON `{ deviceId }`) | `{ removed: true, deviceId }` |
| `POST /v1/profile/avatar` | `US-PRF-01` | `Implemented` | JPEG/PNG/WebP up to **512 KB (`524288` bytes)** stored in R2 | `{ avatarKey, avatarUrl: "/v1/media/signed/<token>", expiresAt }` (900s TTL) |
| `DELETE /v1/profile/avatar` | `US-PRF-01` | `Implemented` | None | `{ deleted: true }` |
| `POST /v1/support/feedback` | `US-PRF-07` | `Implemented` | `{ category, message, foodOrExerciseId?, includeDiagnostics, appVersion, platform, lastRequestId? }` | `{ ticketId, receivedAt }` |
| `GET /v1/subscriptions/offerings` | `US-MON-02` | `Implemented` | Query `platform`, `region` | `{ platform, region, trialEligible, products: [{ productId, period: "monthly"\|"annual", bestValuePct?, trialDays }] }` |
| `POST /v1/subscriptions/verify` | `US-MON-03` | `Implemented` | `{ platform, productId, signedTransactionJws?, transactionId?, purchaseToken?, orderId? }` (Apple Server API / Google `subscriptionsv2.get` + `:acknowledge`, strict mode via `STRICT_STORE_VERIFICATION=true`) | `{ verified: true, entitlements }` (`409 ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM`, `409 SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`) |
| `POST /v1/subscriptions/restore` | `US-MON-03` | `Implemented` | `{ platform, tokens: (string \| object)[] }` | `{ restored: boolean, entitlements }` (supports re-verification after GDPR deletion; `409 SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`) |
| `POST /v1/webhooks/apple` | `US-MON-03`/`04` | `Implemented` | Apple App Store Server Notifications v2 (`signedPayload` -> `signedTransactionInfo` + `signedRenewalInfo` + subtypes `AUTO_RENEW_ENABLED`, `GRACE_PERIOD`, `DID_CHANGE_RENEWAL_PREF`) | `{ received: true, provider: "apple", processedAt }` |
| `POST /v1/webhooks/google-play` | `US-MON-03`/`04` | `Implemented` | Google Play RTDN Cloud Pub/Sub (`nt === 5` -> `account_hold`, `nt === 10` -> `paused`, authoritative `subscriptionsv2.get` refresh) | `{ received: true, provider: "google", processedAt }` |

---

### 3.5 Complete `POST /v1/commands` Domain Actions Registry (All 50 Actions)

All 50 canonical command actions execute atomically through `POST /v1/commands?view=receipt|full` with `revision` CAS, `Idempotency-Key`, and `coaching_sync_outbox`:

- **Core Onboarding & Plan Actions (4):** `generate`, `confirm_health`, `confirm_schedule`, `renew_plan`
- **Nutrition, Diary, Favorites, Custom Recipes, Grocery & Fasting Actions (16):** `food_entry`, `food_entry_batch`, `food_entry_update`, `food_delete`, `food_complete`, `food`, `food_switch_to_entries`, `replace_meal`, `food_favorite`, `recipe_save`, `recipe_delete`, `copy_meal`, `grocery_toggle`, `fasting_log`, `ramadan_mode`, `seasonal_flex`
- **Biometrics, Activity & Cycle Awareness Actions (7):** `weight`, `water`, `steps`, `activity`, `cycle_settings`, `cycle_log`, `cycle_gentle_session`
- **Workouts, Cardio & Training Actions (11):** `recovery`, `workout`, `workout_delete`, `cardio_log`, `cardio_delete`, `session`, `session_delete`, `replace_exercise`, `ad_hoc_exercise`, `workout_ui_mode`, `reschedule`
- **Coaching, Retention, Profile & Settings Actions (12):** `comeback_restart`, `profile_update`, `body_measurement`, `streak_freeze`, `review`, `adaptation`, `timezone`, `notification_preferences`, `coaching_feedback`, `coaching_decision`, `coaching_outcome`, `coaching_ack`

Key production command payload contracts:

| `action` Value | Story | Exact `payload` Contract |
| :--- | :--- | :--- |
| `renew_plan` | `US-NUT-01`, `US-MON-01` | `{ "earlyRenew"?: boolean }` (when `earlyRenew: true`, Pro-gated under `ENFORCE_PRO_ENTITLEMENTS=true`; regenerates a full 7-day plan starting today while keeping today's meals) |
| `food_entry_batch` | `US-NUT-04`, `US-NUT-07` | `{ "date"?: "YYYY-MM-DD", "slot"?: "breakfast"\|"lunch"\|"dinner"\|"snack", "displaySlot"?: string \| null, "items": [{ /* 1..15 food_entry payloads */ }] }` (validates & commits atomically) |
| `food_entry_update` | `US-NUT-02`, `US-NUT-12` | `{ "id": string, "slot"?: "breakfast"\|"lunch"\|"dinner"\|"snack", "displaySlot"?: string \| null, "quantity"?: number (0.1..10), "servings"?: number (0.1..20), "grams"?: number (1..5000), "unit"?: "reference"\|"grams", "name"?: string, "energy"?: number, "protein"?: number, "carbs"?: number, "fat"?: number }` |
| `recipe_save` | `US-NUT-12` | `{ "id"?: string, "name": string (2..80), "servings": number (0.5..30), "finalWeightGrams"?: number (20..15000), "notes"?: string, "items": [{ "foodId": string, "grams"?: number (1..5000), "ml"?: number }], "additions"?: [{ "name": string, "energy": number, "protein"?: number, "carbs"?: number, "fat"?: number, "grams"?: number }] }` (`1..25` ingredients, max `100` saved recipes -> `409 RECIPE_LIMIT_REACHED`, emits `yieldRatio` & `qualityTier`) |
| `recipe_delete` | `US-NUT-12` | `{ "id": string }` (frozen historical food_entries remain untouched; `404 RECIPE_NOT_FOUND`) |
| `workout` | `US-WRK-03`, `US-WRK-04` | `{ "date"?: "YYYY-MM-DD", "dayIndex": 0..6, "exerciseId": string, "weightedBodyweight"?: boolean, "bothSides"?: boolean, "supersetGroupId"?: string \| null, "notes"?: string (max 300), "autoSession"?: boolean, "sets": [{ "kg"?: number, "addedKg"?: number, "reps": int, "rir"?: int, "pain"?: boolean, "setType"?: "normal"\|"warmup"\|"dropset"\|"failure" }] }` |
| `workout_delete` | `US-WRK-04` | `{ "id": string }` (reconciles session completion automatically; `404 WORKOUT_LOG_NOT_FOUND`) |
| `session` | `US-WRK-09`, `US-WRK-10` | `{ "date"?: "YYYY-MM-DD", "dayIndex": 0..6, "status": "completed"\|"partial"\|"missed", "duration"?: number, "rpe"?: number, "notes"?: string (max 300) }` |
| `reschedule` | `US-WRK-09` | `{ "dayIndex": 0..6, "toDate": "YYYY-MM-DD" }` (returns `409 SESSION_ALREADY_COMPLETED` if source session is completed) |
| `cardio_log` | `US-WRK-11` | `{ "date": "YYYY-MM-DD", "modality": "walking"\|"brisk_walking"\|"running"\|"cycling"\|"stationary_bike"\|"swimming"\|"elliptical"\|"rowing"\|"jump_rope"\|"hiit", "durationMinutes": int (5..360), "intensity": "low"\|"moderate"\|"vigorous", "distanceKm"?: number, "caloriesKcal"?: number, "notes"?: string, "source"?: "manual"\|"health_connect"\|"apple_health", "externalRecordId"?: string }` (max `5`/day -> `400 CARDIO_DAILY_LIMIT_EXCEEDED`, rest-day `>=30m` adds `+0.5L` water target, `>=20m` credits streak) |
| `cardio_delete` | `US-WRK-11` | `{ "id": string }` (`404 CARDIO_LOG_NOT_FOUND`) |
| `cycle_settings` | `US-PRG-06` | `{ "enabled": boolean, "discreetMode"?: boolean, "adaptiveThemeEnabled"?: boolean, "averageCycleLengthDays"?: int (21..45), "averagePeriodLengthDays"?: int (2..10), "lastPeriodStartDate"?: "YYYY-MM-DD" \| null }` (female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent `403 HEALTH_CONSENT_REQUIRED`) |
| `cycle_log` | `US-PRG-06` | `{ "date": "YYYY-MM-DD", "periodStart"?: boolean, "flowLevel"?: "none"\|"spotting"\|"light"\|"medium"\|"heavy", "symptoms"?: string[], "crampSeverity"?: int (0..5), "notes"?: string }` (female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent) |
| `cycle_gentle_session` | `US-HOME-01`, `US-PRG-06` | `{ "enabled": boolean }` (one-tap 24h `0.8x` working-set comfort adjustment; female-only `403 CYCLE_TRACKING_UNAVAILABLE`; requires active `health_data_processing` consent `403 HEALTH_CONSENT_REQUIRED`) |
| `session_delete` | `US-WRK-10` | `{ "id"?: string, "date"?: "YYYY-MM-DD", "dayIndex"?: 0..6, "deleteWorkouts"?: boolean }` (`404 SESSION_NOT_FOUND`) |
| `food_favorite` | `US-NUT-07` | `{ "op": "add" \| "remove", "id"?: string, "item"?: { "name": string, "source": "planned"\|"ingredient"\|"recipe"\|"barcode"\|"manual", "key"?: string, "grams"?: number, "snapshot"?: object } }` |
| `copy_meal` | `US-NUT-07` | `{ "fromDate": "YYYY-MM-DD", "toDate": "YYYY-MM-DD", "slot"?: "breakfast" \| "lunch" \| "dinner" \| "snack" \| "all", "toSlot"?: "breakfast" \| "lunch" \| "dinner" \| "snack", "entryIds"?: string[] }` |
| `grocery_toggle` | `US-NUT-09` | `{ "planId": string, "ingredientKey": string, "checked": boolean }` |
| `fasting_log` | `US-NUT-10`, `US-INT-03` | `{ "op": "start" \| "end" \| "adjust_window", "at"?: "<iso8601>", "ifStartHour"?: 6..16, "targetHours"?: 8..24, "preset"?: "12_12"\|"14_10"\|"16_8"\|"18_6"\|"ramadan" }` (maternal clinical guard + auto-computes Fajr-to-Maghrib hours during Ramadan) |
| `ramadan_mode` | `US-NUT-10`, `US-INT-03` | `{ "enabled": boolean, "iftarTime"?: "HH:mm", "suhoorCutoffTime"?: "HH:mm", "workoutTiming"?: "pre_iftar"\|"post_iftar"\|"post_taraweeh", "endDate"?: "YYYY-MM-DD" \| null, "medicalClearanceAcknowledged"?: boolean }` (auto-reverts after `endDate`, works for both nutrition & `workouts_only`; disabling restores `16:8` IF when `dietType === "intermittent_fasting"`) |
| `seasonal_flex` | `US-HOME-01`, `US-NUT-10` | `{ "enabled": boolean, "occasion"?: "eid_fitr"\|"eid_adha"\|"travel"\|"custom", "endDate"?: "YYYY-MM-DD" (today..today+7d), "dismissEidPrompt"?: boolean }` (Free 1..7d maintenance kcal target + automatic `flexDates` streak & adherence exclusion) |
| `workout_ui_mode` | `US-WRK-02`, `US-PRF-03` | `{ "mode": "simple" \| "pro" }` |
| `ad_hoc_exercise` | `US-WRK-05` | `{ "date": "YYYY-MM-DD", "dayIndex": 0..6, "exerciseId": string, "bothSides"?: boolean, "supersetGroupId"?: string \| null, "sets": [{ "kg": number, "reps": int, "rir"?: int, "pain"?: boolean, "setType"?: "normal"\|"warmup"\|"dropset"\|"failure" }] }` |
| `comeback_restart` | `US-CCH-06` | `{ "tier": "short_3_6d" \| "medium_7_13d" \| "detrained_14d_plus", "applyDeload": boolean, "deloadDurationDays"?: 1 \| 7, "updatedWeightKg"?: number, "reason"?: string, "renewMealPlan"?: boolean }` |
| `body_measurement` | `US-PRG-02`, `US-CCH-06` | `{ "date": "YYYY-MM-DD", "waistCm"?: number, "hipsCm"?: number, "chestCm"?: number, "neckCm"?: number, "leftArmCm"?: number, "rightArmCm"?: number, "leftThighCm"?: number, "rightThighCm"?: number, "bodyFatPct"?: number, "notes"?: string }` |
| `streak_freeze` | `US-PRG-04` | `{ "date": "YYYY-MM-DD" }` (complements server Weekly Auto-Freeze `autoAppliedFreezes` rolling 7-day protection) |
| `profile_update` | `US-PRF-01`, `US-PRF-05` | `{ "name"?: string, "workoutUiMode"?: "simple" \| "pro", "unitSystem"?: "metric" \| "imperial" }` |

---

## 4. Pure-English Error & Coaching Message Contracts (`contracts/error-codes.json` — 293 Codes & `contracts/coaching-codes.json` — 97 Codes)

All 293 error messages (`contracts/error-codes.json`) and 97 coaching/brief/review/eligibility messages (`contracts/coaching-codes.json`) are 100% pure English and validated automatically by `tests/error-contract.test.mjs`. Key production codes include:

| Error Code | HTTP | Canonical English `message` | Params | Retryable |
| :--- | :---: | :--- | :--- | :---: |
| `AUTH_OAUTH_TOKEN_INVALID` | `401` | `Identity provider token is invalid or expired.` | `["provider"]` | `false` |
| `AUTH_OAUTH_EMAIL_UNVERIFIED` | `409` | `Identity provider email is not verified; link or sign in with a verified email.` | `["provider"]` | `false` |
| `AUTH_OAUTH_ALREADY_LINKED_OTHER_USER` | `409` | `This sign-in identity is already linked to a different CuraFit account.` | `["existingProvider"]` | `false` |
| `AUTH_PROVIDER_EMAIL_CONFLICT` | `409` | `An account with this email is already linked to another sign-in method.` | `["existingProvider"]` | `false` |
| `CANNOT_UNLINK_LAST_AUTH_METHOD` | `409` | `Cannot unlink the last remaining sign-in method on this account.` | `[]` | `false` |
| `AUTH_JWKS_UNAVAILABLE` | `503` | `Identity provider signing keys are temporarily unavailable; retry shortly.` | `["provider"]` | `true` |
| `HEALTH_CONSENT_REQUIRED` | `403` | `Active health_data_processing consent is required to generate plans or compute coaching reviews.` | `[]` | `false` |
| `PRO_ENTITLEMENT_REQUIRED` | `402` | `This feature requires an active CuraFit Pro subscription.` | `["feature"]` | `false` |
| `FEATURE_DEFERRED_TO_AI_PHASE` | `501` | `This AI capability is deferred to the Final AI Phase.` | `["feature"]` | `false` |
| `INVALID_BARCODE_FORMAT` | `400` | `Barcode must be a valid 8 to 14 digit EAN or UPC code.` | `[]` | `false` |
| `BARCODE_NOT_FOUND` | `404` | `No product nutrition record found for this barcode.` | `["barcode"]` | `false` |
| `INVALID_UNIT_SYSTEM` | `400` | `unitSystem must be either metric or imperial.` | `[]` | `false` |
| `INVALID_MEDIA_TOKEN` | `403` | `Signed media token is invalid or expired.` | `[]` | `false` |
| `EMPTY_MEASUREMENT_RECORD` | `400` | `Provide at least one body measurement or body fat value.` | `[]` | `false` |
| `PHOTO_NOT_FOUND` | `404` | `Progress photo record not found.` | `[]` | `false` |
| `PHOTO_TOO_LARGE` | `413` | `Uploaded image exceeds the maximum allowed byte size.` | `["maxBytes"]` | `false` |
| `UNSUPPORTED_IMAGE_FORMAT` | `415` | `Image must be JPEG, PNG, or WebP format.` | `[]` | `false` |
| `STREAK_FREEZE_UNAVAILABLE` | `409` | `Weekly streak freeze allowance has already been used.` | `[]` | `false` |
| `INVALID_PROFILE_NAME` | `400` | `Profile name must be 2 to 50 alphabetic characters.` | `[]` | `false` |
| `INVALID_SUBSCRIPTION_RECEIPT` | `400` | `Store subscription receipt could not be verified.` | `["platform"]` | `false` |
| `ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM` | `409` | `An active Pro subscription already exists on another store platform.` | `["activeProvider", "requestedProvider"]` | `false` |
| `SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT` | `409` | `This store subscription is already linked to a different CuraFit account.` | `[]` | `false` |
| `WEBHOOK_SIGNATURE_INVALID` | `401` | `Store webhook signature or authorization token is invalid.` | `["provider"]` | `false` |
| `BILLING_VERIFICATION_UNAVAILABLE` | `503` | `Subscription verification provider is temporarily unavailable; retry shortly.` | `[]` | `true` |
| `MATERNAL_CALORIE_CUT_BLOCKED` | `422` | `Calorie reductions are disabled during pregnancy for maternal safety.` | `[]` | `false` |
| `MAINTENANCE_MODE` | `503` | `Service is temporarily in maintenance mode; offline logging remains active.` | `[]` | `true` |
| `CLIENT_UPDATE_REQUIRED` | `426` | `Please update CuraFit to the latest version to continue syncing.` | `["minVersion"]` | `false` |
| `RECIPE_NOT_FOUND` | `404` | `Saved custom recipe not found.` | `[]` | `false` |
| `RECIPE_LIMIT_REACHED` | `409` | `Maximum saved custom recipes limit reached.` | `["max"]` | `false` |
| `INVALID_RECIPE_PAYLOAD` | `400` | `Custom recipe payload is invalid or contains zero-energy ingredients.` | `[]` | `false` |
| `CARDIO_LOG_NOT_FOUND` | `404` | `Cardio session log not found.` | `[]` | `false` |
| `INVALID_CARDIO_PAYLOAD` | `400` | `Cardio session payload is invalid.` | `[]` | `false` |
| `CARDIO_DAILY_LIMIT_EXCEEDED` | `400` | `Maximum number of cardio sessions logged for this date has been reached.` | `["max"]` | `false` |
| `CYCLE_TRACKING_UNAVAILABLE` | `403` | `Menstrual cycle awareness is only available for female profiles.` | `[]` | `false` |
| `INVALID_CYCLE_PAYLOAD` | `400` | `Cycle settings or cycle log payload is invalid.` | `[]` | `false` |
| `SESSION_ALREADY_COMPLETED` | `409` | `Completed sessions cannot be rescheduled.` | `[]` | `false` |

### Coaching Message Catalog (`contracts/coaching-codes.json` — 97 Codes)
- Canonical registry mapping all 97 deterministic coaching, brief, review, split-review, seasonal, and eligibility codes (including `RED_FLAGS_STOP`, `JOINT_PAIN_HOLD`, `RECOVERY_DELOAD_PROPOSAL`, `PERFORMANCE_DROP_CALORIE_CUT_HOLD`, `INSUFFICIENT_EVIDENCE_COVERAGE`, `MIN_SAFE_ENERGY_FLOOR_HOLD`, `MAX_SAFE_ENERGY_CEILING_HOLD`, `MATERNAL_CALORIE_CUT_BLOCKED`, `DOUBLE_PROGRESSION_READY`, `TREND_ON_TRACK`, `COOLDOWN_14D`, `BRIEF_TRAINING_PERFORMANCE`, `BRIEF_TRAINING_PERFORMANCE_UP`, `BRIEF_TRAINING_PERFORMANCE_REPS`, `BRIEF_FOLLOWUP_TIRED`, `BRIEF_FOLLOWUP_SLEEP`, `BRIEF_FOLLOWUP_ACTIVITY`, `VOLUME_HOLD`, `CARDIO_HIGH_IMPACT_CAUTION`, `SPLIT_REVIEW_SUGGEST_UPPER_LOWER`, `SPLIT_REVIEW_KEEP_FULL_BODY`, `SPLIT_REVIEW_RECOVERY_FIRST`, `SPLIT_REVIEW_BUILD_CONSISTENCY`, `SPLIT_REVIEW_NOT_DUE`, `SEASONAL_EID_FLEX_ACTIVE`, `CYCLE_GENTLE_SESSION_ACTIVE`, `CYCLE_LUTEAL_WATER_RETENTION`, `CYCLE_MENSTRUAL_GENTLE_TRAINING`, `CYCLE_FOLLICULAR_PEAK_READINESS`, `CYCLE_PAUSED_PREGNANCY`) to pure-English templates and typed `params[]`. KMM resolves Arabic/English user copy deterministically from `(code, params)`.

---

## 5. Consolidated Cloudflare D1 & R2 Schema Migration (`drizzle/0006_production_features.sql`)

> **Consolidated Pre-Production Schema:** All 17 production tables and columns — including `auto_applied` on `coaching_streak_freezes`, `coaching_trial_tombstones`, `coaching_custom_recipes`, `coaching_cardio_logs`, and `coaching_cycle_logs` — live in `drizzle/0006_production_features.sql`. There is **no `0007`** migration.

```sql
ALTER TABLE `coaching_users` ADD COLUMN `avatar_url` text;

CREATE TABLE IF NOT EXISTS `coaching_oauth_identities` (
  `provider` text NOT NULL,
  `subject` text NOT NULL,
  `user_id` text NOT NULL,
  `email` text,
  `apple_refresh_token_enc` text,
  `created_at` text NOT NULL,
  PRIMARY KEY(`provider`, `subject`)
);
CREATE INDEX IF NOT EXISTS `idx_oauth_user` ON `coaching_oauth_identities` (`user_id`);

CREATE TABLE IF NOT EXISTS `coaching_push_tokens` (
  `user_id` text NOT NULL,
  `device_id` text NOT NULL,
  `platform` text NOT NULL,
  `push_token` text NOT NULL,
  `locale` text NOT NULL,
  `timezone` text NOT NULL,
  `app_version` text,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `device_id`)
);

CREATE TABLE IF NOT EXISTS `food_barcodes` (
  `barcode` text PRIMARY KEY NOT NULL,
  `name_ar` text,
  `name_en` text NOT NULL,
  `brand` text,
  `serving_size_grams` real NOT NULL,
  `serving_label` text,
  `values_per_100g_json` text NOT NULL,
  `provenance` text NOT NULL,
  `submitted_by_user_id` text,
  `created_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `coaching_food_favorites` (
  `user_id` text NOT NULL,
  `favorite_id` text NOT NULL,
  `name` text NOT NULL,
  `source` text NOT NULL,
  `body` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `favorite_id`)
);

CREATE TABLE IF NOT EXISTS `coaching_grocery_checks` (
  `user_id` text NOT NULL,
  `plan_id` text NOT NULL,
  `ingredient_key` text NOT NULL,
  `checked` integer DEFAULT 0 NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `plan_id`, `ingredient_key`)
);

CREATE TABLE IF NOT EXISTS `coaching_body_measurements` (
  `user_id` text NOT NULL,
  `date` text NOT NULL,
  `body` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `date`)
);

CREATE TABLE IF NOT EXISTS `coaching_progress_photos` (
  `user_id` text NOT NULL,
  `photo_id` text NOT NULL,
  `date` text NOT NULL,
  `pose` text NOT NULL,
  `r2_object_key` text NOT NULL,
  `weight_kg_snapshot` real,
  `created_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `photo_id`)
);
CREATE INDEX IF NOT EXISTS `idx_photos_user_date` ON `coaching_progress_photos` (`user_id`, `date` DESC);

CREATE TABLE IF NOT EXISTS `coaching_ai_messages` (
  `user_id` text NOT NULL,
  `thread_id` text NOT NULL,
  `message_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `meta_json` text,
  `created_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `thread_id`, `message_id`)
);

CREATE TABLE IF NOT EXISTS `coaching_subscriptions` (
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `external_tx_id` text NOT NULL,
  `product_id` text NOT NULL,
  `status` text NOT NULL,
  `trial_used` integer DEFAULT 0 NOT NULL,
  `auto_renew_enabled` integer DEFAULT 1 NOT NULL,
  `expires_at` text NOT NULL,
  `raw_state_json` text,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`provider`, `external_tx_id`)
);
CREATE INDEX IF NOT EXISTS `idx_subs_user` ON `coaching_subscriptions` (`user_id`);

CREATE TABLE IF NOT EXISTS `coaching_support_tickets` (
  `ticket_id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `category` text NOT NULL,
  `message` text NOT NULL,
  `diagnostics_json` text,
  `created_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `coaching_usage_quotas` (
  `user_id` text NOT NULL,
  `quota_key` text NOT NULL,
  `window_key` text NOT NULL,
  `used_count` integer DEFAULT 0 NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `quota_key`, `window_key`)
);

CREATE TABLE IF NOT EXISTS `coaching_activity_logs` (
  `user_id` text NOT NULL,
  `log_id` text NOT NULL,
  `date` text NOT NULL,
  `source` text NOT NULL,
  `external_record_id` text,
  `updated_at` text NOT NULL,
  `body` text NOT NULL,
  PRIMARY KEY(`user_id`, `log_id`)
);
CREATE INDEX IF NOT EXISTS `idx_activity_logs_user_date` ON `coaching_activity_logs` (`user_id`, `date`);

CREATE TABLE IF NOT EXISTS `coaching_streak_freezes` (
  `user_id` text NOT NULL,
  `date` text NOT NULL,
  `auto_applied` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `date`)
);

CREATE TABLE IF NOT EXISTS `coaching_trial_tombstones` (
  `identity_hash` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `recorded_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `coaching_custom_recipes` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `name` text NOT NULL,
  `servings` real NOT NULL,
  `total_grams` real NOT NULL,
  `payload_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `id`)
);
CREATE INDEX IF NOT EXISTS `idx_custom_recipes_user_updated` ON `coaching_custom_recipes` (`user_id`, `updated_at` DESC);

CREATE TABLE IF NOT EXISTS `coaching_cardio_logs` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `date` text NOT NULL,
  `modality` text NOT NULL,
  `duration_minutes` integer NOT NULL,
  `intensity` text NOT NULL,
  `distance_km` real,
  `estimated_kcal` integer NOT NULL,
  `source` text NOT NULL,
  `external_record_id` text,
  `body` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `id`)
);
CREATE INDEX IF NOT EXISTS `idx_cardio_logs_user_date` ON `coaching_cardio_logs` (`user_id`, `date` DESC);

CREATE TABLE IF NOT EXISTS `coaching_cycle_logs` (
  `user_id` text NOT NULL,
  `date` text NOT NULL,
  `period_start` integer DEFAULT 0 NOT NULL,
  `flow_level` text NOT NULL,
  `cramp_severity` integer DEFAULT 0 NOT NULL,
  `body` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `date`)
);
```

### Cloudflare R2 Private Bucket Policy (`CURAFIT_MEDIA_BUCKET`) & Worker-Proxied HMAC-Signed URLs
- Bucket remains **100% private** (public HTTP access disabled, zero R2 S3 access keys exposed to mobile clients).
- All private media reads and uploads route through **user-bound Worker-proxied HMAC-SHA256 signed URLs (`GET` / `PUT /v1/media/signed/{token}`)** (`900s` GET / `600s` PUT TTL, returning `403 INVALID_MEDIA_TOKEN` on invalid, expired, or mismatched-user tokens; signed using Worker secret `MEDIA_SIGNING_SECRET`).
- `avatars/{userId}/{uuid}.{ext}` -> Uploaded via `POST /v1/profile/avatar` (`<= 512 KB`, JPEG/PNG/WebP) and hydrated via signed `avatarUrl` (`900s` TTL) on `/v1/bootstrap` and auth responses.
- `users/{userId}/photos/{photoId}.{ext}` -> Uploaded via `/v1/media/signed/{token}` issued by `POST /v1/progress/photos/upload-url` (`<= 5 MB`), confirmed via `POST /v1/progress/photos/confirm`, read exclusively by the owning `userId` via `/v1/media/signed/{token}`, and deleted upon `DELETE /v1/progress/photos/{photoId}` or `DELETE` / `POST /v1/account/delete`.
