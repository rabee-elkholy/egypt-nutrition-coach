# CuraFit Mobile App (KMM Android & iOS) — Production User Stories & API Specification

> **Document Status:** Production Complete & Verified on Jira (Project `KAN`)
> **Jira Board:** [https://abdulrahman-alaa.atlassian.net/jira/software/projects/KAN/boards/1?filter=&groupBy=epic](https://abdulrahman-alaa.atlassian.net/jira/software/projects/KAN/boards/1?filter=&groupBy=epic)
> **Scope:** Full Production Scope (No MVP Deferral — All 10 Epics / 68 Stories Target Production Launch)
> **Target Platforms:** Kotlin Multiplatform Mobile (KMM — Android & iOS), Native Jetpack Compose & SwiftUI UI
> **Target Markets:** Middle East & North Africa (`egypt`, `gulf`, `levant`, `maghreb`) — Bilingual Arabic (RTL) & English (LTR)
> **Backend Baseline:** CuraFit API v1 (`Cloudflare Workers + D1 + R2`) — `82` OpenAPI paths (`contracts/openapi.yaml`), `47` command actions, `290` canonical error codes (`contracts/error-codes.json`), `88` canonical coaching codes (`contracts/coaching-codes.json`), Postman collection (`16` groups / `135` endpoints) — Cloud Dev (`https://curafit-api-dev.egypt-nutrition-coach.workers.dev`) & Production (`https://curafit-api.egypt-nutrition-coach.workers.dev`)
> **Implementation Status:** All non-AI endpoints and commands across `EPIC-01`..`EPIC-10` are **Implemented & Live** in CuraFit API v1. Only the 3 Final AI Phase endpoints (`POST /v1/nutrition/ai-parse`, `POST /v1/coaching/chat`, `GET /v1/coaching/chat/history`) remain explicitly deferred to the Final AI Phase (returning `501 FEATURE_DEFERRED_TO_AI_PHASE` until AI rollout).

---

## 1. Product Vision & Competitive Positioning

CuraFit Mobile is an end-to-end, clinically guarded, culturally native **Nutrition & Workout Coaching Application** built specifically for MENA households, gyms, kitchens, and Ramadan routines. Rather than acting as a generic Western calorie counter or an overly technical gym spreadsheet, CuraFit combines:

1. **Conversational Smart Onboarding (`EPIC-01`, `KAN-34`)**: Fast, adaptive chat onboarding with live clinical/maternal/age safety gates (`18..95`, `70+ Senior Mode`), ideal BMI guidance, `unitSystem` (`metric | imperial`) support, location-first workout routing, stateless `POST /v1/plans/preview`, and deterministic energy/macro/hydration equations.
2. **Passwordless Social-First Entry (`EPIC-02`)**: Instant **Google Sign-In** and **Sign in with Apple** OAuth ONLY (`POST /v1/auth/oauth/google`, `POST /v1/auth/oauth/apple`) with zero email/password endpoints or flows on server or mobile. Includes explicit OAuth account linking (`linkExisting: true`, `GET /v1/auth/oauth/providers`, `POST /v1/auth/oauth/link`, `DELETE /v1/auth/oauth/{provider}`), server-side Apple `authorizationCode` refresh-token exchange for automated GDPR revocation, silent rotating refresh tokens (`60s` proactive refresh threshold), smart state-fingerprint bootstrap `ETag` (`W/"boot-..."`), and multi-device offline SQLDelight outbox sync (`409 REVISION_CONFLICT` auto-rebase + poison-pill terminal `4xx` handling).
3. **Coach-First Daily Command Center (`EPIC-03`)**: A 5-Tab adaptive shell (`Today`, `Nutrition`, `Workouts`, `Coach`, `Profile`) plus a floating Quick-Log (`+`) sheet that adapts seamlessly to `nutrition_and_workouts`, `nutrition_only`, and `workouts_only`.
4. **Best-in-Class MENA Nutrition & Smart Logging (`EPIC-04`)**:
   - Deterministic 7-day regional meal plans (`Egypt`, `Gulf`, `Levant`, `Maghreb`) built from a verified 3,291 reference/estimated foods & beverages + 2,437 regional serving models catalog (`5,728` total indexed), with **Early Plan Renewal** (`renew_plan` `{ earlyRenew: true }` preserving today's logged meals) and **Atomic In-Place Meal Editing** (`food_entry_update`).
   - Multi-modal logging: **MENA Supermarket Barcode Scanner** (Pro), **1-Tap Planned Meal Logging**, **Saved Custom Home Recipes ("My Recipes", Free — `US-NUT-12`)**, **Favorites/Recents/Copy Yesterday**, **"What's in My Fridge?" Pantry Finder** (Free), plus **AI Meal Photo & Egyptian/Arabic Dialect Voice/Text Quick Log** *(Final AI Phase — deferred; `POST /v1/nutrition/ai-parse` returns `501 FEATURE_DEFERRED_TO_AI_PHASE` until AI rollout)*.
   - **Smart Weekly Grocery List** (Pro — aisle-grouped, budget-aware, with explicit `preparationState` / `state` badges and bilingual WhatsApp Share) and **Intermittent Fasting (16:8) + Ramadan Mode** (Free — Suhoor / Iftar / Snack scheduling + workout timing shift).
5. **Dual-Mode Live Workout Experience & Cardio Tracking (`EPIC-05`)**:
   - **Simple / Guided Mode** (auto-default for Beginners & Home-Only): Large visual exercise cards, 1-tap completion, automatic guided rest timer, zero gym jargon.
   - **Pro / Performance Mode** (auto-default for Intermediate/Advanced Gym): Set-by-set kg/reps/RIR logging, previous session metrics, Double Progression green badges, unilateral L/R confirmation, Barbell Plate Calculator, Supersets/Drop-Sets, injury-guarded ad-hoc exercises (`409 AD_HOC_INJURY_WARNING`), workout/session deletion (`workout_delete`, `session_delete`), and rich PR tracking (`GET /v1/workouts/prs`).
   - **Dedicated Cardio & Walking Sessions (`US-WRK-11`, Free):** Log walking, running, cycling, swimming, HIIT, and sports with deterministic MET calorie estimation, high-impact injury/pregnancy/senior caution, `+0.5 L` hydration boost, and streak credit without double-counting TDEE.
   - Instant `Simple <-> Pro` toggle in the player header without losing any logged sets.
6. **Hybrid Adaptive Smart Coach (`EPIC-06`)**:
   - 100% deterministic, evidence-backed coaching engine: On-Demand Daily Brief, Daily Recovery Check-in with interactive body-map soreness & urgent Red-Flag Safety Stop, explicit Accept/Reject adaptation cards (`<= 5% / 150 kcal` calorie adjustments, 24h deloads, muscle-gain weekly volume boosts, maintenance transitions), Comeback Protocol (`comeback_restart`), and structured Coaching Agreements.
   - Paired with a **Guarded AI Coach Q&A** ("Ask the Coach") grounded in the user's real logs, strictly forbidden from overriding clinical holds or deterministic equations *(Final AI Phase — deferred; `POST /v1/coaching/chat` and `GET /v1/coaching/chat/history` return `501 FEATURE_DEFERRED_TO_AI_PHASE` until AI rollout)*.
7. **Analytics, Retention, Cycle Awareness, Wearables & Widgets (`EPIC-07`, `EPIC-08`)**:
   - 7-day moving-average weight trend vs. trajectory curve, partial-merge body measurements, encrypted private progress photo vault with Split/Slider comparisons, Gentle Streaks (`>= 80%` hydration credit, `>= 20m` cardio credit, bidirectional 7-day Freeze window), shareable **Weekly Wrapped** cards (WhatsApp & Instagram Stories), **Optional Female Menstrual Cycle Awareness (`US-PRG-06`, Free)** with automatic pregnancy pause & luteal water-retention scale guidance, partial-success Apple Health / Health Connect batch sync, smart Quiet-Hours notifications, and Android Glance / iOS WidgetKit home screen widgets (`streakDays`, `readinessStatus`, explicit `date` on water quick-log).
8. **Freemium Soft Paywall & Subscription Engine (`EPIC-10`)**:
   - Free tier (`tier: "free"`) covers onboarding, daily plan viewing, manual/planned/recipe food logging, Saved Custom Recipes, Pantry Finder (`pantry_finder`), Ramadan & IF mode (`ramadan_fasting`), water/weight/cardio/cycle tracking, basic workouts, safety-critical adaptations (`recovery`/`schedule`), Comeback Protocol, injury-safety swaps, daily meal swaps (`2/day`), weekly voluntary exercise swaps (`2/week`), 1 bonus plan renewal, and the 868-exercise catalog.
   - Pro tier (`tier: "pro"`, 7-day Free Trial, Monthly/Annual MENA-localized StoreKit 2 & Google Play Billing) unlocks Barcode Scanner, Grocery List & WhatsApp export, Unlimited Meal/Exercise Swaps, Unlimited Plan Renewals, Performance/Nutrition Adaptive Coach Reviews (`calories`/`weekly_volume`/`maintenance`), Advanced Analytics (`90d`/`all`), Cloud Progress Photo Vault, and (in Final AI Phase) AI Photo/Voice Log & AI Coach Q&A.

---

## 2. 5-Tab Navigation Shell & Service Track Adaptation

### 2.1 Bottom Navigation Bar Architecture

| Position | Tab ID | Icon & Label | Primary Destination | Service Track Behavior |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `today` | Home / Today | Today Dashboard (`US-HOME-01`..`06`) | Always visible across all tracks; hides unavailable domain cards |
| **2** | `nutrition` | Nutrition | Meal Plan & Food Diary (`US-NUT-01`..`12`) | Visible in `nutrition_and_workouts` and `nutrition_only`; replaced or shows clean "Add Nutrition Track" upsell card in `workouts_only` |
| **FAB** | `quick_log` | Floating `+` Action Button | Quick-Log Bottom Sheet (`US-HOME-05`) | Anchored above/center-right of tab bar; dynamically filters options to active `serviceTrack` |
| **3** | `workouts` | Workouts | Workout Schedule, Dual-Mode Player & Cardio (`US-WRK-01`..`11`) | Visible in `nutrition_and_workouts` and `workouts_only`; shows clean "Add Workout Track" card + Cardio & Exercise Library browser in `nutrition_only` |
| **4** | `coach` | Coach | Hybrid 3-Specialist Care Team & Analytics (`US-CCH-01`..`06`) | Always visible across all tracks; adapts brief & proposals to active track |
| **5** | `profile` | Profile | Profile, Analytics Entry, Settings & Privacy (`US-PRF-01`..`07`) | Always visible across all tracks; includes top shortcut to Progress, Measurements & Optional Cycle (`EPIC-07`) and Subscription (`EPIC-10`) |

> **Design Note for Track Adaptation:** Keeping the 5-tab bar structure consistent while swapping the inactive track tab into a clean "Activate Track + Browse Library" discovery screen prevents jarring bottom-bar layout shifts while supporting 1-tap track upgrades in `US-PRF-03`. Alternatively, KMM renders a compact 4-tab bar when strictly single-track if preferred by the design team; both layouts are explicitly supported in `US-HOME-01`.

---

## 3. Master Epic & User Story Index (10 Epics / 68 Stories)

| Epic | Jira Epic | Epic File & Title | Stories (Jira Keys) | Total | Backend Status |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **EPIC-01** | [`KAN-34`](https://abdulrahman-alaa.atlassian.net/browse/KAN-34) | [EPIC-01-onboarding-full.md](EPIC-01-onboarding-full.md) (Full Spec) & [EPIC-01-onboarding-alignment.md](EPIC-01-onboarding-alignment.md) (API Alignment) — *Mobile Conversational Onboarding & Smart Plan Engine* | `US-MOB-01` .. `US-MOB-09` (`KAN-35`..`KAN-43`) | **9** | Implemented (Live in API v1) |
| **EPIC-02** | [`KAN-44`](https://abdulrahman-alaa.atlassian.net/browse/KAN-44) | [EPIC-02-authentication-and-session.md](EPIC-02-authentication-and-session.md) — *Passwordless Social Authentication, Session Lifecycle & Cross-Device Sync* | `US-AUTH-01` .. `US-AUTH-04` (`KAN-45`..`KAN-48`) | **4** | Implemented (Live in API v1) |
| **EPIC-03** | [`KAN-49`](https://abdulrahman-alaa.atlassian.net/browse/KAN-49) | [EPIC-03-home-today-hub.md](EPIC-03-home-today-hub.md) — *Today Dashboard, Quick-Log Hub & Adaptive Daily Experience* | `US-HOME-01` .. `US-HOME-06` (`KAN-50`..`KAN-55`) | **6** | Implemented (Live in API v1) |
| **EPIC-04** | [`KAN-56`](https://abdulrahman-alaa.atlassian.net/browse/KAN-56) | [EPIC-04-nutrition-plan-and-smart-logging.md](EPIC-04-nutrition-plan-and-smart-logging.md) — *Personalized Meal Plans, Smart Multi-Modal Logging, My Recipes & MENA Kitchen Tools* | `US-NUT-01` .. `US-NUT-12` (`KAN-57`..`KAN-67` + `US-NUT-12`) | **12** | Implemented (Live; `US-NUT-05` deferred to Final AI Phase — `501 FEATURE_DEFERRED_TO_AI_PHASE`) |
| **EPIC-05** | [`KAN-68`](https://abdulrahman-alaa.atlassian.net/browse/KAN-68) | [EPIC-05-workouts-and-dual-mode-player.md](EPIC-05-workouts-and-dual-mode-player.md) — *Adaptive Workout Plans, Dual-Mode Live Player (Simple & Pro), Cardio & Exercise Library* | `US-WRK-01` .. `US-WRK-11` (`KAN-69`..`KAN-78` + `US-WRK-11`) | **11** | Implemented (Live in API v1) |
| **EPIC-06** | [`KAN-79`](https://abdulrahman-alaa.atlassian.net/browse/KAN-79) | [EPIC-06-hybrid-coach-and-adaptive-engine.md](EPIC-06-hybrid-coach-and-adaptive-engine.md) — *Hybrid 3-Specialist Care Team, Daily Recovery, Weekly Check-Ins & Adaptive Engine* | `US-CCH-01` .. `US-CCH-06` (`KAN-80`..`KAN-85`) | **6** | Implemented (Live; `US-CCH-05` deferred to Final AI Phase — `501 FEATURE_DEFERRED_TO_AI_PHASE`) |
| **EPIC-07** | [`KAN-86`](https://abdulrahman-alaa.atlassian.net/browse/KAN-86) | [EPIC-07-progress-analytics-and-retention.md](EPIC-07-progress-analytics-and-retention.md) — *Progress Analytics, Body Tracking, Gentle Streaks, Widgets & Optional Female Cycle Awareness* | `US-PRG-01` .. `US-PRG-06` (`KAN-87`..`KAN-91` + `US-PRG-06`) | **6** | Implemented (Live in API v1) |
| **EPIC-08** | [`KAN-92`](https://abdulrahman-alaa.atlassian.net/browse/KAN-92) | [EPIC-08-wearables-and-smart-notifications.md](EPIC-08-wearables-and-smart-notifications.md) — *Apple Health / Health Connect Sync & Intelligent Push Notifications* | `US-INT-01` .. `US-INT-03` (`KAN-93`..`KAN-95`) | **3** | Implemented (Live in API v1) |
| **EPIC-09** | [`KAN-96`](https://abdulrahman-alaa.atlassian.net/browse/KAN-96) | [EPIC-09-profile-preferences-and-privacy.md](EPIC-09-profile-preferences-and-privacy.md) — *Profile Management, Plan Reconfiguration, Localization & GDPR Privacy* | `US-PRF-01` .. `US-PRF-07` (`KAN-97`..`KAN-103`) | **7** | Implemented (Live in API v1) |
| **EPIC-10** | [`KAN-104`](https://abdulrahman-alaa.atlassian.net/browse/KAN-104) | [EPIC-10-monetization-and-subscriptions.md](EPIC-10-monetization-and-subscriptions.md) — *Freemium Entitlements, Soft Paywall, 7-Day Free Trial & Subscription Management* | `US-MON-01` .. `US-MON-04` (`KAN-105`..`KAN-108`) | **4** | Implemented (Live in API v1) |
| **CONTRACT** | — | [BACKEND-API-DELTA-SPEC.md](BACKEND-API-DELTA-SPEC.md) — *Complete API Contract Reference (`82` OpenAPI Paths, `47` Command Actions, `135` Postman Requests, `290` Error Codes, `88` Coaching Codes & D1/R2 Schema)* | Cross-cutting Reference | — | Production Contract Reference |
| **TOTAL** | **10 Epics** | **All 13 Documentation Files** | **`68` Stories (`KAN-34` .. `KAN-108` + 3 new)** | **68** | **66 Live + 2 Final AI Phase** |

---

## 4. Global Engineering, UX & API Contract Standards

### 4.1 Uniform CuraFit API v1 Envelopes & Command Pipeline
- **Success (`2xx`):** `{ "ok": true, "data": <T>, "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>", "revision"?: <int> } }`
- **Error (`4xx`/`5xx`):** `{ "ok": false, "error": { "code": "<UPPER_SNAKE>", "message": "<Pure English>", "params": {}, "fieldErrors": [], "retryable": <bool>, "details"?: {} }, "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>" } }`
- **Command Mutations (`47` canonical actions):** All account-mutating domain commands execute through `POST /v1/commands?view=receipt` (or `?view=full`) with:
  - Headers: `Authorization: Bearer <accessToken>`, `Idempotency-Key: <uuid-v4>`, `Prefer: return=minimal`, `X-Client-Platform: android|ios`, `X-Client-Version: <semver>`.
  - Body: `{ "revision": <int>, "action": "<action>", "payload": { ... } }`.
- **Optimistic Concurrency, Offline Outbox & Poison-Pill Policy:**
  - On `409 REVISION_CONFLICT`, the KMM sync coordinator fetches `GET /v1/sync/changes?after=<localRev>` (adding `&afterSeq=<lastSeq>` only when `lastSeq > 0`), applies entity deltas (`upsert` / `delete`) in ascending `seq` order into SQLDelight, updates `localRevision`, and replays the queued command with the **same `Idempotency-Key`** (server idempotency digest excludes `revision` so timeout+rebase replays cleanly).
  - On any **permanent `4xx` error** (every `4xx` except `409 REVISION_CONFLICT`, and excluding retryable `429 RATE_LIMITED`), the outbox worker immediately moves that mutation to a `failed_terminal` / discardable state, rolls back its optimistic local row, surfaces a clear dismissible user notification with the localized reason, and continues draining remaining queued mutations instead of retrying forever.

### 4.2 Pure-English Error & Coaching Message Contracts + Client Localization
- Every API `error.code` (`290` canonical codes in `contracts/error-codes.json`) returns strictly canonical English in `error.message` and `fieldErrors[].message`.
- Every server coaching, brief, review, and eligibility message returns strictly canonical English paired with deterministic `code` and `params` (`88` canonical codes in `contracts/coaching-codes.json`).
- Mobile clients **never display raw server English text** to Arabic users; instead, KMM resolves localized strings in `ar` and `en` by `(error.code, error.params)` or `(coachingCode, params)` (e.g., `RECOVERY_DELOAD_PROPOSAL`, `PERFORMANCE_DROP_CALORIE_CUT_HOLD`, `INSUFFICIENT_EVIDENCE_COVERAGE`, `DOUBLE_PROGRESSION_READY`, `RED_FLAGS_STOP`, `CYCLE_LUTEAL_WATER_RETENTION`).

### 4.3 Mandatory Bilingual UX, RTL, Digits & Nutritional Null-Safety
1. **Live RTL/LTR Switching:** Switching between Arabic (`ar-EG` / `ar-SA`) and English (`en`) applies immediately without restarting the app, mirroring layouts (`Start`/`End` alignment, directional icons, charts where appropriate) while keeping user-entered names untranslated.
2. **Digit Normalization:** Every numeric field converts Eastern Arabic numerals (`0x0660..0x0669`) and Persian numerals (`0x06F0..0x06F9`) to standard Western digits before validation and API transmission.
3. **Null Nutrient Integrity:** `GET /v1/food-diary` returns `null` for all 8 nutrient totals (`energy, protein, fat, carbs, fiber, saturated, sodium, sugars`) when `entries.length === 0` — clients render `0` when empty. When `entries.length > 0` and any entry lacks a reference metric (`totals[metric] == null`), **never coerce `null` to `0`** — render `"Partial (source N/A)"` (or `--`) with a subtle provenance indicator.
4. **Provenance & Clinical Transparency:** Clearly distinguish `Verified Source` (`approved`) items from `Calculated / Pending Review` (`estimated`) foods and `System-Generated Guidance` (`reviewScope`) from medical diagnosis. Red-flag safety states (`redFlags == true`) always render urgent non-dismissible stop-and-seek-care guidance.
5. **Accessibility & Touch Targets:** All interactive chips, water increment buttons, workout set checkboxes, and bottom-bar targets maintain a minimum `48dp x 48dp` (`44pt x 44pt` iOS) hit area and full TalkBack / VoiceOver semantics.

### 4.4 Offline-Capable vs. Online-Required Feature Matrix

| Feature Area | Mode / Guarantee | Notes |
| :--- | :--- | :--- |
| **Conversational Onboarding Flow (`EPIC-01`)** | **100% Offline** | Persists locally (`onboardingDraft`); requires online at final Auth & `[Start My Plan]` `generate` sync (`US-MOB-09`, no offline Today entry before `generate` succeeds). |
| **Social OAuth Sign-In (`EPIC-02`)** | **Online Required** | Except Step 0 offline new-user bypass (`[Continue without logging in for now]`, `US-AUTH-01`). |
| **Today Hub, Water, Weight, Food Diary, Favorites & Workouts Player (`Simple`/`Pro`)** | **100% Offline + Auto-Sync** | Reads cached SQLDelight plans/media; writes locally immediately & drains deterministically through `outbox_commands` (`409` auto-rebase). |
| **Recovery Check-In, Grocery Check-Off, Body Measurements, Local Photos & Language Switch** | **100% Offline + Auto-Sync** | Instant local feedback; syncs asynchronously when connectivity returns. |
| **Uncached Barcodes, Pantry Search, Store Billing (+ Final AI Phase Photo/Voice Parse & AI Coach Chat)** | **Online Required** | Degrades gracefully offline with clear retry & offline fallback (`Search` / `Manual` logging); Pro entitlements retain a `48h` offline grace cache. |
| **Plan Regeneration (`generate`, `renew_plan`), Meal/Exercise Swaps & Adaptive Acceptance** | **Online Required** | Requires server deterministic solver & `assertDietDay` / injury validation so unsafe or conflicting versions are never committed offline. |
| **GDPR Data Export (`GET /v1/account/export`) & Permanent Delete (`DELETE /v1/account/delete`)** | **Online Required** | Never deletes tokens locally unless server confirms `200 OK` deletion. |

### 4.5 The 3-Specialist Scientific Care Team & Clinical Precedence Hierarchy
CuraFit unifies daily decisions under three coordinated specialist domains (**Clinical Nutritionist**, **Strength & Conditioning Coach**, **Recovery & Habit Specialist**) governed by a strict non-negotiable precedence order:
1. **Priority 1 — Acute Medical Red Flags (`RED_FLAGS_STOP`)**: Overrides every plan card, blocks workout starts & progression, and prompts immediate medical attention (`US-CCH-02`).
2. **Priority 2 — Maternal, Senior & Clinical Constraints**: Blocks pregnancy weight-loss goals & pregnancy calorie cuts (`MATERNAL_CALORIE_CUT_BLOCKED`), enforces maternal/gender calorie floors (`1800` pregnant / `1600` breastfeeding / `1500` M / `1200` F), celiac gluten exclusions, kidney protein bounds, `seniorMode` safety bounds, and injury exclusions across workouts & warm-ups (`EPIC-01`, `US-CCH-03`, `US-WRK-08`, `US-PRF-02..04`).
3. **Priority 3 — Recovery & Pain Safety Holds / Comeback Deloads**: Joint pain holds progression (`JOINT_PAIN_HOLD`), multi-domain fatigue emits temporary 24h `-20%` / `-40%` deload proposals, and `>= 7` day absence triggers non-punitive `-20%` re-entry deloads (`US-CCH-02`, `US-CCH-06`).
4. **Priority 4 — Subscription Entitlements (`US-MON-01`)**: Safety features, recovery check-ins, and injury safety swaps are **always 100% Free** and can never be gated behind Paywalls.

---

## 5. Jira Synchronization & Cleanup Manifest (Completed & Verified)

> **Sync Status:** **Completed & Programmatically Verified** on Jira project **`KAN`** (`abdulrahman-alaa.atlassian.net` — **75 active work items**: **10 Epics** + **65 Stories**, 0 legacy issues, 0 orphans, 0 duplicates).

| Action Executed on Jira (`KAN`) | Issue Keys / Scope | Result |
| :--- | :--- | :--- |
| **KEPT & ANNOTATED** | `KAN-34` (`US-MOB-01`..`US-MOB-09`: `KAN-35`..`KAN-43`) | Preserved all designed Onboarding UX screens/stories intact; added `production`, `mobile`, `onboarding` labels and appended API Alignment comments on `KAN-34` & `KAN-43`. |
| **DELETED LEGACY V1 ISSUES** | `KAN-4` (*Launch & Onboarding*: `KAN-7`..`KAN-19`)<br>`KAN-5` (*Login*: `KAN-20`..`KAN-22`)<br>`KAN-6` (*Profile*: `KAN-24`..`KAN-33`) | Deleted all **29 legacy V1 work items** (`3` Epics + `26` Stories; `KAN-23` did not exist). Verified 0 legacy issues remain on board. |
| **CREATED EPICS & STORIES** | Epics `KAN-44`, `KAN-49`, `KAN-56`, `KAN-68`, `KAN-79`, `KAN-86`, `KAN-92`, `KAN-96`, `KAN-104` + Child Stories `KAN-45`..`KAN-108` | Created all **9 new Epics** and **56 new Stories** with Markdown formatting, Priority (`Highest`/`High`/`Medium`), domain labels, and verified Epic parent links. |
