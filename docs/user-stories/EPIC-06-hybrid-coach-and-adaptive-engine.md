# EPIC-06: Hybrid Smart Coach Hub, Daily Recovery Check-In & Evidence-Backed Adaptations

> **Epic ID:** `EPIC-06`
> **Target Platforms:** KMM (Android Jetpack Compose & iOS SwiftUI)
> **Scope:** Production
> **Labels:** `production`, `mobile`, `coach`, `recovery`, `adaptive-engine`, `ai-coach`

---

## Epic Overview

`EPIC-06` defines the **Coach Tab** using a **Hybrid 3-Specialist Scientific Care Team Architecture**:
1. **Deterministic Clinical & Scientific Core (100% Backend-Verified):** Every user experiences structured guidance from three coordinated domains — **Clinical Nutritionist (`nutrition`)**, **Strength & Conditioning Coach (`training`)**, and **Recovery & Habit Specialist (`followup`)**. Every nutrition calorie adjustment (`<= 5% / <= 150 kcal`, minimum 14-day cooldown), temporary 24-hour workout deload (`-20%` or `-40%` sets), muscle-gain weekly volume progression (`+1 set`), goal-reached maintenance transition, urgent medical Red-Flag Stop alert, and structured Coaching Agreements run strictly through CuraFit's audited deterministic backend engine (`recovery.mjs`, `coaching.mjs`, `coaching-journey.mjs`, `personal-brief.mjs`), returning pure-English copy paired with canonical codes & params (`contracts/coaching-codes.json`) for on-device KMM localization.
2. **Guarded AI Coach Q&A ("Ask the Coach" — Final AI Phase):** An interactive bilingual Arabic/English conversational assistant grounded in the user's actual logged profile, meals, workouts, and active coaching holds — **strictly non-prescriptive**, prohibited from inventing medical diagnoses, overriding safety holds, or bypassing explicit proposal acceptance *(scheduled for Final AI Phase; `capabilities.ai_coach_qa` disabled until Final AI Phase)*.

### Child User Stories
- `US-CCH-01`: Coach Hub Home — 3-Specialist Care Team Strip, Daily Brief, Readiness Pill & Priority Action Queue
- `US-CCH-02`: Daily Recovery & Readiness Check-In (Body-Map Soreness, Pain Regions & Urgent Red-Flag Safety Stop)
- `US-CCH-03`: Adaptive Review Engine & Explicit Proposal Cards ("See the Science & Your Data", Calories, 24h Deload, Volume & Maintenance)
- `US-CCH-04`: Coaching Inbox, Barrier Check-In (`hunger`/`energy`/`satiety`) & Active Coaching Agreements
- `US-CCH-05`: Guarded AI Coach Q&A ("Ask the Coach" — Log-Grounded Chat with Strict Safety Guardrails) *(Final AI Phase)*
- `US-CCH-06`: Structured Weekly Care-Team Check-In, Scientific Progress Audit & Zero-Guilt "Comeback Protocol"

---

## US-CCH-01: Coach Hub Home — On-Demand Daily Brief, Readiness Pill & Priority Action Queue

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-CCH-01` |
| **Epic** | `EPIC-06` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `coach`, `brief` |
| **Target Screens** | `CoachHubScreen` |
| **Entitlement** | `Freemium` (`Free`: Daily Brief + Recovery Check-In + Safety Adaptations + Coaching Inbox; `Pro`: Nutrition/Volume Adaptive Review Proposals + Final AI Phase Coach Q&A) |
| **Backend Status** | `Modified` (`GET /v1/coaching/brief` pure-English `contracts/coaching-codes.json` `code`/`params`/`action`/`actionTarget` + `bootstrap.engagementState`) |

### STORY
As a user opening the Coach tab, I want an organized coaching command center displaying my current Recovery Readiness status, prioritized Daily Coaching Brief notes, any pending adaptation proposals waiting for my approval, active coaching agreements, and quick access to Ask the Coach so I always know what matters most today.

### PRECONDITIONS
- User is authenticated with `onboardingCompleted == true`.

### SCREEN AND UI DETAILS
1. **Coach Hub Header & 3-Specialist Care Team Strip:**
   - Coach Header: *"Your Smart Care Team"* + **Readiness Status Badge** (color-coded from `bootstrap.todaySummary.recovery`):
     - `ready` -> Green `"Ready to Train"`
     - `caution` -> Amber `"Moderate Fatigue — Monitor Load"`
     - `high` -> Orange `"High Fatigue — Deload Suggested"`
     - `hold` -> Red/Amber `"Safety Hold — Pain/Illness"`
     - `stop` -> Urgent Red `"Medical Safety Stop"`
     - `unknown` -> Slate `"Check-In Needed"` + `[30-Sec Check-In]` button!
   - **3-Specialist Live Status Strip** *(Adapted cleanly to active `serviceTrack`)*:
     - `Clinical Nutritionist` (`role: "nutrition"`) *(active dot: Green on-track / Amber low-evidence or hunger alert)*
     - `Strength & Conditioning Coach` (`role: "training"`) *(active dot: Green ready / Amber deload or pain hold / Red safety stop)*
     - `Recovery & Habit Specialist` (`role: "followup"`) *(active dot: Green checked-in / Slate check-in needed or comeback due)*
   - Prominent header CTA pill: **`[💬 Ask the Coach AI]`** (`US-CCH-05`, enabled in Final AI Phase when `capabilities.ai_coach_qa == true`).
2. **Urgent / Pending Queue (Shown Only When Non-Empty, Strict Priority Order):**
   - **Slot A (`status == "stop"`):** Non-dismissible urgent Red-Flag Safety Card (`RED_FLAGS_STOP`) advising immediate workout stop & medical assessment (`US-CCH-02`).
   - **Slot B (`engagementState.comebackTier != "none"`):** Warm Zero-Guilt **Comeback Protocol** card (`US-CCH-06`) welcoming the user back smoothly after `>= 3` days off without shame.
   - **Slot C (`pendingAdaptations.length > 0`):** Explicit Proposal Approval Card(s) (`US-CCH-03`) with `[Accept]`, `[Decline]`, and `[See the Science]`.
   - **Slot D (`engagementState.weeklyCheckinDue == true`):** Highlighted `[Start 60-Sec Weekly Care Team Check-In]` banner (`US-CCH-06`).
   - **Slot E (`coachingInbox.items` with `reviewDue == true` or `status == "question" | "proposed"`):** Barrier & Agreement Card (`US-CCH-04`).
3. **Today's Personal Brief Feed (`GET /v1/coaching/brief`):**
   - Renders structured `notes[]` ordered by `priority` (`"urgent" | "attention" | "normal"`) across the 3 canonical specialist roles (`role: "nutrition" | "training" | "followup"`), with specialist avatar & role badge mapped directly from `note.role`.
   - Each brief note includes pure-English server `title`/`text`/`action` guidance plus canonical `code`, `params` (`contracts/coaching-codes.json`), and a deterministic `actionTarget` deep-link route (`[Log Recovery]`, `[Open Food Diary]`, `[View Workout]`, `[Run Adaptive Review]`). KMM localizes display copy into Arabic/English on-device by `(code, params)`.
4. **Adaptive Weekly Checkup Trigger Card:**
   - Displays evidence progress (`"10/10 food days ✓ • 6/6 weigh-ins ✓"` or missing items count) and `[Run Coach Review Now]` button (`US-CCH-03`).

### API & BACKEND CONTRACT
1. **`[MODIFIED BACKEND] GET /v1/coaching/brief`** (Sends `If-None-Match` saved `briefEtag` -> `304 Not Modified` when unchanged!)
   - Returns `{ apiVersion, viewKind: "on_demand_coaching_brief", date, timezone, revision, requiresOnboarding, notes: [{ id, role: "nutrition" | "training" | "followup", priority: "urgent" | "attention" | "normal", code, params, text, action, actionTarget, basedOnRevision, relatedPlanId }] }` with 100% pure-English `text` and `action` guidance (zero Arabic from server; localized on KMM via `contracts/coaching-codes.json`).
2. **`[EXISTING] GET /v1/coaching/inbox`** -> Active coaching agreements & barrier questions (pure-English + `code`/`params`).
3. **`[EXISTING] GET /v1/progress/summary`** -> Evidence coverage metrics for calorie/workout reviews.

### RULES & BUSINESS LOGIC
1. **Pure Read-Only Brief & Inbox:** Opening `CoachHubScreen` NEVER mutates server state or silently auto-acknowledges `coachingInbox` items (`coaching_ack` is only triggered on explicit user interaction/view of a case card).
2. **Explicit `System-Generated Guidance` Framing:** Maintain a subtle clear footer label `"System-Generated Coaching Guidance — Not Medical Diagnosis"` matching `reviewScope` across all deterministic cards.

### MAIN FLOW
1. User taps Tab 4 (`Coach`).
2. `CoachHubScreen` displays `Readiness: Unknown (Check-In Needed)` at top, 1 open `coachingInbox` barrier prompt (`"We noticed 2 missed sessions this week — what got in the way?"`), and 3 Personal Brief cards.
3. User taps `[30-Sec Check-In]` right from the header -> Completes `US-CCH-02` -> Readiness updates immediately to `Ready to Train ✓`.

### EDGE CASES
- **Offline Open:** Serves last cached `coaching/brief` and `coaching/inbox` from SQLDelight cleanly with subtle `"Offline Snapshot"` timestamp.
- **Workouts-Only or Nutrition-Only Track:** Hides irrelevant domain cards and specialist pills (e.g., `nutrition_only` hides the Strength Coach domain dot and training deload cards).
- **Brief Requires Fresh Onboarding (`requiresOnboarding == true`):** Shows clean callout prompting profile completion (`US-PRF-02`..`04`) instead of crashing on missing targets.
- **Brief Changes Mid-Day After User Logs Recovery Check-In:** Automatically re-fetches `GET /v1/coaching/brief` on next resume/refresh (`ETag` changes when `revision` increments) so stale `"Check-In Needed"` notes clear cleanly.

### ACCEPTANCE CRITERIA
- **Scenario 1: `If-None-Match` avoids redundant brief payload downloads**
  - **Given** SQLDelight holds `briefEtag` from a prior fetch
  - **When** user re-opens `Coach` tab without any new logs
  - **Then** `GET /v1/coaching/brief` returns `304 Not Modified` and renders cached brief notes cleanly.
- **Scenario 2: Safety stop overrides top slot**
  - **Given** `recovery.status == "stop"`
  - **When** `CoachHubScreen` renders
  - **Then** the non-dismissible Red-Flag medical stop card appears at the very top above all brief notes and proposals.
- **Scenario 3: Specialist strip adapts to single-domain tracks**
  - **Given** `serviceTrack == "workouts_only"`
  - **When** `CoachHubScreen` renders
  - **Then** Strength Coach and Recovery Specialist pills appear while Clinical Nutritionist calorie cards stay hidden cleanly.

### ANALYTICS
- `coach_hub_viewed` (`readiness_status`: `string`, `pending_adaptations_count`: `integer`, `inbox_count`: `integer`)
- `coach_brief_note_action_clicked` (`role`: `string`, `action_target`: `string`)

---

## US-CCH-02: Daily Recovery & Readiness Check-In (Body-Map Soreness, Pain Regions & Urgent Red-Flag Safety Stop)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-CCH-02` |
| **Epic** | `EPIC-06` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `coach`, `recovery`, `safety` |
| **Target Screens** | `RecoveryCheckinModal`, `BodyMapSorenessPicker`, `RedFlagSafetyStopView` |
| **Entitlement** | `Free` |
| **Backend Status** | `Existing` |

### STORY
As a user wanting safe, personalized training loads, I want a 30-second daily recovery check-in where I log my sleep hours/quality, fatigue, optional stress, regional muscle soreness on an interactive body map, and any joint pain, illness, or medical red flags — with immediate clear safety guidance if a serious symptom is reported.

### PRECONDITIONS
- User opens Check-In from `Today`, `Workouts`, or `Coach` tab. (Freshness window is `24 hours`).

### SCREEN AND UI DETAILS
1. **Step/Section 1 — Sleep & Energy (Fast Sliders & 1–5 Emoji Chips):**
   - **Sleep Hours (`0..24`, 0.5h steps):** Pre-filled automatically if Apple Health / Health Connect reported last night's sleep (`US-INT-01`) with `"From Apple Health — edit if needed"` hint!
   - **Sleep Quality (`1..5` stars/faces, Required):** `1 = Very Poor` .. `5 = Restorative`.
   - **Fatigue Level (`1..5`, Required):** `1 = Fresh / High Energy` .. `5 = Exhausted`.
   - **Stress Level (`1..5`, Optional):** Defaults to `"Skip / Not Reported"` (`null` — NEVER coerced to `1` or `0`!).
2. **Step/Section 2 — Interactive Body-Map Soreness & Pain:**
   - **Quick Toggle:** `[No Pain or Unusual Soreness ✓]` (sets `pain: false`, `painRegions: []`, `soreness: 0`) OR `[Tap Body Map to Mark Soreness / Pain]`.
   - **Body Map Regions (Exact 14 canonical `MUSCLE_REGIONS` keys from `coaching-shared.mjs`):**
     `chest`, `back`, `lower_back`, `shoulders`, `biceps`, `triceps`, `forearms`, `abs`, `glutes`, `quadriceps`, `hamstrings`, `calves`, `hips`, `neck`.
   - Tapping any body region opens a crisp mini-popover:
     - **Muscle Soreness (`0..10` slider — normal post-workout ache)**
     - **Sharp / Joint Pain Toggle (`painRegions` — distinct from normal soreness!)**
   - Unvisited regions stay `omitted` (unknown, NOT `0`, matching `recovery.mjs`!).
3. **Step/Section 3 — Health & Red Flags Screening (Strict Boolean Switches):**
   - **Currently Ill / Fever / Infection?** (`illness`: `true | false`, Required)
   - **Any Urgent Red Flags (chest pain, severe dizziness/fainting, shortness of breath at rest, sudden numbness)?** (`redFlags`: `true | false`, Required)
4. **Submit & Immediate Assessment View:**
   - CTA: `[Submit Recovery Check-In]` -> Calls `POST /v1/commands?view=full` (`action: "recovery"`) to receive the full computed readiness evaluation immediately (or uses `?view=receipt` followed by `GET /v1/bootstrap` refresh).
   - **Urgent Red-Flag Stop Screen (`redFlags == true`):**
     - Full-attention red alert card: *"Urgent Safety Notice: Stop all exercise immediately and seek prompt medical evaluation from a physician or emergency service. CuraFit has paused workout progression and training recommendations for your safety."*

### API & BACKEND CONTRACT
1. **`[EXISTING] POST /v1/commands?view=full`** (`action: "recovery"` — returns full readiness immediately on `view=full`; `?view=receipt` returns the stored check-in delta and client refreshes readiness via `GET /v1/bootstrap`)
   - Payload:
     ```json
     {
       "revision": 18,
       "action": "recovery",
       "payload": {
         "date": "2026-11-21",
         "sleepHours": 7.5,
         "sleepQuality": 4,
         "fatigue": 2,
         "stress": null,
         "soreness": 2,
         "sorenessByRegion": { "chest": 3, "quadriceps": 2 },
         "pain": false,
         "painRegions": [],
         "illness": false,
         "redFlags": false
       }
     }
     ```
   - **Critical Key Mapping Check:** Always use `"quadriceps"` (NOT `"quads"`) and `"hips"` (NOT `"adductors"`) matching `MUSCLE_REGIONS` in `coaching-shared.mjs`!
2. **`[EXISTING] GET /v1/checkins?offset=0&limit=30`** -> Paginated historical check-ins.
   - Error Codes: `RECOVERY_FLAGS_REQUIRED`, `INVALID_MUSCLE_REGION`, `INVALID_PAIN_REGIONS`, `NUMBER_OUT_OF_RANGE`.

### RULES & BUSINESS LOGIC
1. **Deterministic Domain Scoring Transparency (`recovery.mjs`):**
   - `Sleep` domain triggered if `sleepHours < 6` OR `sleepQuality <= 2` OR `1.5h` below personal 28-day baseline (`>= 7` prior valid check-ins).
   - `Fatigue` domain triggered if `fatigue >= 4` OR `1.5` above personal baseline.
   - `Stress` domain triggered if `stress >= 4`.
   - `Soreness` domain triggered if `soreness >= 7` OR any `sorenessByRegion >= 7`.
   - `2 domains` -> `caution` (`-20%` sets deload suggestion); `3+ domains` -> `high` (`-40%` sets deload suggestion).
2. **Submitting a New Check-In Clears Stale Adjustments:** Server clears `s.sessionAdjustment` and stale `suggestedKg` values automatically (`coaching.mjs` line 229); client immediately refreshes today's workout preview.
3. **24-Hour Freshness:** If check-in is `> 24h` old, Readiness pill displays `"Check-In Expired — Update for Today"` (`CHECKIN_MISSING_OR_STALE`).

### MAIN FLOW
1. User taps `[30-Sec Check-In]` on Coach Hub or Today.
2. Sleep hours pre-fills `5.5h` from HealthKit; user sets `Sleep Quality = 2`, `Fatigue = 4`, marks `quadriceps` soreness `4`, and confirms `pain = false`, `illness = false`, `redFlags = false`.
3. User taps `[Submit Recovery Check-In]`.
4. `recovery` commits (and triggers `review` automatically on the worker per `worker.mjs` line 399!).
5. Coach immediately updates Readiness to `Caution` and surfaces a 24h `-20% sets` deload proposal card (`US-CCH-03`).

### EDGE CASES
- **User Skips Stress Field:** Payload sends `"stress": null` — never defaults to `0` or `1` (sending `stress: 0` throws `400 NUMBER_OUT_OF_RANGE` for `1..5`).
- **User Reports Joint Pain in `shoulders` (`painRegions: ["shoulders"]`, `pain: true`):** Even with great sleep, backend triggers conservative global `JOINT_PAIN_HOLD` (`status == "hold"`, pausing progression safely across the session) while the UI highlights the affected `shoulders` region on the body map and recommends skipping/swapping painful movements.
- **User Accidentally Taps `redFlags: true`:** Can submit a corrected check-in same-day with `redFlags: false` if tapped by mistake (with gentle confirmation prompt `"Are you sure? Only turn off if you selected chest pain / dizziness by mistake"`).
- **Offline Check-In Submission in Zero-Signal Gym Locker Room:** Computes provisional local Readiness badge immediately (especially locking `redFlags: true` locally if flagged!), writes to SQLDelight `outbox_commands` (`action: "recovery"`), and syncs seamlessly when online.

### ACCEPTANCE CRITERIA
- **Scenario 1: Two fatigued domains generate a `caution` status and `-20%` deload suggestion**
  - **Given** user submits `sleepHours: 5.0`, `sleepQuality: 2`, `fatigue: 4`, `pain: false`, `illness: false`, `redFlags: false`
  - **When** `recovery` commits on `worker.mjs`
  - **Then** `accountRecovery` evaluates `status == "caution"`, `setFactor == 0.8`, and creates a pending `recovery` deload proposal.
- **Scenario 2: `redFlags: true` locks training progression and renders urgent safety stop**
  - **Given** user toggles `redFlags: true`
  - **When** check-in is submitted
  - **Then** `status == "stop"`, `setFactor == 0`, and `RedFlagSafetyStopView` blocks workout start CTAs.
- **Scenario 3: Muscle region keys match server `MUSCLE_REGIONS` dictionary**
  - **Given** user taps front thigh on the interactive body map
  - **When** saving `sorenessByRegion`
  - **Then** the payload uses key `"quadriceps"` (never `"quads"`).

### ANALYTICS
- `recovery_checkin_submitted` (`sleep_hours`: `number`, `sleep_quality`: `integer`, `fatigue`: `integer`, `pain`: `boolean`, `illness`: `boolean`, `red_flags`: `boolean`, `resulting_status`: `string`)
- `recovery_red_flag_triggered` (`date`: `string`)

---

## US-CCH-03: Adaptive Review Engine & Explicit Proposal Cards (Calories, 24h Deload, Volume & Maintenance)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-CCH-03` |
| **Epic** | `EPIC-06` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `coach`, `adaptive-engine`, `pro-feature` |
| **Target Screens** | `CoachProposalsList`, `AdaptiveReviewExplainSheet` |
| **Entitlement** | `Freemium` (`Free`: Safety-critical adaptations `kind: "recovery"` & `kind: "schedule"`, Readiness status & evidence checklist; `Pro`: `calories`, `weekly_volume`, & `maintenance` proposals) |
| **Backend Status** | `Modified` (`action: "review"` & `action: "adaptation"` floors `1500/1200/1800/1600`, ceiling `4200`, pure-English `contracts/coaching-codes.json`, and Pro gating strictly on `calories`/`weekly_volume`/`maintenance`) |

### STORY
As a user committed to long-term results, I want my Smart Coach to analyze my 14-day weigh-ins, food adherence, performance, and recovery, explain *why* it proposes or holds any plan change, and require my explicit **Accept** or **Decline** before modifying tomorrow's calories, today's workout sets, muscle-gain volume, or transitioning me to Maintenance.

### PRECONDITIONS
- User has an active profile (`eligibility` complete, `workoutSafetyIssues` empty).

### SCREEN AND UI DETAILS
1. **Explicit Pending Proposal Card (`pendingAdaptations[]`):**
   - Clearly displays specialist attribution + proposal type badge + clear plain-language reason + `expiresAt` countdown + expandable **`[🔬 See the Science & Your Data]`** proof accordion:
     - **Science Proof Accordion:** Shows exact verified equation inputs (`prev7` avg weight `82.1 kg` vs `curr7` avg weight `81.9 kg` = `-0.24%/wk`; `11/14` verified food days; gym progression status = `stable`; safety bounds check = `Passed > 1500 kcal floor`) so the user feels genuine clinical transparency!
     - **Type 1 — `recovery` (24-Hour Temporary Deload — 100% Free Safety Adaptation):**
       - Title: *"Recommended Today: Lighten Volume by {20% / 40%}"*
       - Subtitle: Explains exact triggered domains (e.g., *"Sleep 5h & Fatigue 4/5"*). Note: *"Applies to today only (24h); never alters your baseline plan (`effectiveSets >= 1`)."*
       - Buttons: `[Apply Light Session Today]` (`accept: true`) | `[Keep Normal Sets]` (`accept: false`).
     - **Type 2 — `calories` (Bounded Nutrition Adjustment `<= 5% / <= 150 kcal` — Pro):**
       - Title: *"Suggested Calorie Update: {+100 or -100 kcal}/day (Effective Tomorrow)"*
       - Evidence pill: Shows 14-day weight trend rate (`-0.1%/wk vs 0.25–1% target`), `10+` complete food days verified, and confirms protein stays protected (`protein` never cut!).
       - Buttons: `[Approve Calorie Update]` | `[Keep Current Calories]`.
     - **Type 3 — `weekly_volume` (Muscle-Gain Volume Escalation `+1 set` — Pro):**
       - Title: *"Volume Boost Ready: +1 Weekly Set on {ExerciseName}"*
       - Evidence pill: Shows `>= 80%` 2-week completion, ready recovery, and 3 comparable stable exposures.
       - Buttons: `[Add +1 Set to Program]` | `[Keep Current Sets]`.
     - **Type 4 — `maintenance` (Goal Weight Reached Celebration! — Pro):**
       - Title: *"Congratulations! You Reached {targetWeight} kg 🎉"*
       - Subtitle: *"Ready to transition your meal plan to Weight Maintenance tomorrow?"*
       - Buttons: `[Start Maintenance Plan]` | `[Stay on Current Goal]`.
     - *(Note: `kind: "schedule"` reschedule proposals from `US-WRK-09` are also 100% Free!)*
2. **"Why No Change Yet?" Explainability Sheet (`lastReview`):**
   - Opens when user taps `[Run Coach Review Now]` (`action: "review"`) and `proposals` is empty (`action: "hold"`), with full `[🔬 See the Science & Your Data]` transparency.
   - Maps `lastReview.reasonCode` (`contracts/coaching-codes.json`) cleanly to transparent Arabic/English explanations:
     - `INSUFFICIENT_EVIDENCE_COVERAGE` -> Visual progress checklist (`3/3 prev week weights`, `2/3 this week weights`, `8/10 complete food days`).
     - `PERFORMANCE_DROP_CALORIE_CUT_HOLD` -> *"Your gym performance dropped slightly despite stable scale weight, so we held your calories steady to protect muscle and energy!"*
     - `APPETITE_ENERGY_REVIEW_REQUIRED` -> *"High hunger/low energy logged recently — we held calorie cuts to look after your adherence."*
     - `MATERNAL_CALORIE_CUT_BLOCKED` -> *"Prenatal safety guard: calorie cuts are disabled during pregnancy so maternal & fetal nutrition stay protected."*
     - `MIN_SAFE_ENERGY_FLOOR_HOLD` -> *"Your calories are already at the minimum clinical safety floor (`1500` M / `1200` F / `1800` Pregnant / `1600` Breastfeeding) — we will not cut further."*
     - `MAX_SAFE_ENERGY_CEILING_HOLD` -> *"Your calories have reached the maximum clinical safety ceiling (`4200 kcal`) — further increases are held."*
     - `COOLDOWN_14D` -> *"14-day observation window active since last change."*
     - `TREND_ON_TRACK` -> *"Your 2-week trend is right inside your target zone — stay the course!"*

### API & BACKEND CONTRACT
1. **`[MODIFIED BACKEND] POST /v1/commands?view=full`** (`action: "review"`, `payload: {}`) -> Computes fresh `lastReview` and `pendingAdaptations`, enforcing `validateEnergyChange` floors (`1500` M / `1200` F / `1800` pregnant / `1600` breastfeeding; ceiling `4200`), maternal cut blocks, Senior `-400 kcal` bounds, and pure-English `contracts/coaching-codes.json` reason messages.
2. **`[MODIFIED BACKEND] POST /v1/commands?view=receipt`** (`action: "adaptation"`)
   - Payload: `{ "id": "<proposal-uuid>", "accept": true | false }`.
   - **Entitlement Enforcement:** Safety-critical adaptations (`kind: "recovery"` and `kind: "schedule"`) are **always 100% Free**; Pro entitlement (`402 PRO_ENTITLEMENT_REQUIRED`) gates only `kind: "calories"`, `"weekly_volume"`, and `"maintenance"`.
   - After `accept: true` on `calories`, `maintenance`, or `weekly_volume`, immediately fetch the newly generated plan (`GET /v1/plans/{id}` or `GET /v1/workout-plans/{id}`) into SQLDelight!
   - Error Codes: `ADAPTATION_NOT_FOUND`, `ADAPTATION_STALE_REVISION` (`409` -> prompt re-running `review`), `ADAPTATION_EXPIRED`, `ADAPTATION_CONFIRMATION_REQUIRED`, `ADAPTATION_UNSAFE_WORKOUT`, `ADAPTATION_RECOVERY_STALE`, `ADAPTATION_NEEDS_FRESH_RECOVERY`, `ADAPTATION_VOLUME_NO_LONGER_SUPPORTED`, `ADAPTATION_CALORIE_CUT_BLOCKED`, `MATERNAL_CALORIE_CUT_BLOCKED`, `ENERGY_CHANGE_OUT_OF_RANGE`, `FUTURE_FOOD_ENTRIES_CONFLICT`, `402 PRO_ENTITLEMENT_REQUIRED`.

### RULES & BUSINESS LOGIC
1. **Never Auto-Accept:** Adaptations ONLY apply when the user taps the explicit Approve button (`adaptation` with `accept: true`). Declined proposals are remembered (`CALORIE_ADVICE_DECLINED`, `MAINTENANCE_ADVICE_DECLINED`) so the app doesn't nag until evidence changes.
2. **Future Food Entries Guard (`FUTURE_FOOD_ENTRIES_CONFLICT`):** Calorie/Maintenance adaptations take effect `tomorrow` (`dateOffset(currDate, 1)`); client ensures tomorrow has no prematurely backdated logs.
3. **Fresh Recovery Prerequisite:** Approving `calories`, `maintenance`, or `weekly_volume` requires a valid `ready` check-in within `24h` (`ADAPTATION_NEEDS_FRESH_RECOVERY`). If user's check-in expired before tapping `[Approve]`, guide them seamlessly through `US-CCH-02` first!
4. **Maternal, Senior & Calorie Floor/Ceiling Protections (`US-MOB-03/04/09` Parity):**
   - Strictly block any negative calorie adjustment (`delta < 0`) during `pregnant_t1 | t2 | t3` (`MATERNAL_CALORIE_CUT_BLOCKED`).
   - During `breastfeeding`, keep calorie targets `>= 1600 kcal` and total deficit `<= 300 kcal` below TDEE+400.
   - Standard adaptive calorie floors match onboarding (`1500 kcal` Male, `1200 kcal` Female, `1800 kcal` Pregnant, `1600 kcal` Breastfeeding; ceiling `4200 kcal`), emitting `MIN_SAFE_ENERGY_FLOOR_HOLD` / `MAX_SAFE_ENERGY_CEILING_HOLD` when bounded.
   - During `seniorMode` (`age >= 70`), cap deficit at `-400 kcal` and maintain `protein >= 1.2 g/kg`.

### MAIN FLOW
1. User reaches Day 14 with `11` complete food days and `6` weigh-ins, having lost only `-0.08%/wk` on a `lose` goal.
2. User taps `[Run Coach Review Now]` (or sees proposal automatically populated after today's check-in).
3. Proposal Card appears: *"Clinical Nutritionist: Suggested Calorie Update: -95 kcal/day (Effective Tomorrow) — Protein preserved at 145g."* User expands `[See the Science & Your Data]` to inspect the 14-day curve metrics, then taps `[Approve Calorie Update]`.
4. `adaptation` (`accept: true`) creates the new retargeted nutrition plan starting tomorrow; client fetches updated plan and displays confirmation toast.

### EDGE CASES
- **Stale Proposal (`ADAPTATION_STALE_REVISION`):** User logged food after the proposal was created -> Prompt `[Refresh Coach Review]` (`action: "review"`) to regenerate proposal at current revision cleanly.
- **High Hunger Feedback (`coaching_feedback` `hunger >= 4`):** Approving a negative calorie delta returns `ADAPTATION_CALORIE_CUT_BLOCKED`; Coach explains why calories are held and prioritizes satiety barriers first.
- **Adaptive Cut Reaches `1500 kcal` Male / `1200 kcal` Female Clinical Floor (or `4200 kcal` Ceiling):** Server holds via `MIN_SAFE_ENERGY_FLOOR_HOLD` / `MAX_SAFE_ENERGY_CEILING_HOLD` (or `ENERGY_CHANGE_OUT_OF_RANGE`), explaining clearly why lowering calories further hurts muscle & metabolic health and suggesting gentle movement or maintenance break instead.
- **Pregnant User Triggers Coach Review:** Emits supportive prenatal energy-adequacy feedback without ever proposing weight-loss calorie cuts.

### ACCEPTANCE CRITERIA
- **Scenario 1: Accepting calorie adaptation generates new plan effective tomorrow without mutating today**
  - **Given** a pending `calories` proposal (`delta: -90`) and `ready` recovery
  - **When** user taps `[Approve Calorie Update]`
  - **Then** `adaptation` commits, today's targets stay frozen, and tomorrow's plan targets decrease by `90 kcal` while `protein` stays constant.
- **Scenario 2: Performance drop holds calorie cuts automatically**
  - **Given** weight loss stalled AND `hasPerformanceDrop == true`
  - **When** `review` runs
  - **Then** `lastReview.nutrition.reasonCode == "PERFORMANCE_DROP_CALORIE_CUT_HOLD"` and no calorie-cut proposal is emitted.
- **Scenario 3: Safety-critical adaptations remain Free while performance adaptations gate on Pro**
  - **Given** a Free user receives a `recovery` deload proposal and a `calories` proposal
  - **When** accepting the `recovery` proposal vs the `calories` proposal
  - **Then** `recovery` (and `schedule`) accept with `200 OK` on Free tier, while `calories`/`weekly_volume`/`maintenance` trigger `402 PRO_ENTITLEMENT_REQUIRED` (`US-MON-01`).

### ANALYTICS
- `coach_review_triggered` (`reason_code`: `string`, `proposals_count`: `integer`)
- `coach_adaptation_decided` (`kind`: `"recovery" | "calories" | "weekly_volume" | "maintenance" | "schedule"`, `accepted`: `boolean`, `error_code`: `string | null`)

---

## US-CCH-04: Coaching Inbox, Barrier Check-In (`hunger`/`energy`/`satiety`) & Active Coaching Agreements

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-CCH-04` |
| **Epic** | `EPIC-06` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `coach`, `coaching-agreements`, `feedback` |
| **Target Screens** | `CoachingInboxSection`, `BarrierFeedbackSheet`, `CoachingHistoryScreen` |
| **Entitlement** | `Free` |
| **Backend Status** | `Existing` |

### STORY
As a user struggling with time, hunger, budget, equipment, or motivation — or following an active coaching agreement — I want to share what's getting in my way, rate my hunger/satiety/energy, agree on one practical micro-step for 1–3 days, and report whether that step actually helped me when review day arrives.

### PRECONDITIONS
- Account has at least one active track (`active_plan_id` or `workoutPlan`).

### SCREEN AND UI DETAILS
1. **Quick Barrier & Appetite Check-In Button (`[Share What's Hard This Week]` -> `BarrierFeedbackSheet`):**
   - Domain Selector: `Nutrition` vs `Training` (filtered by active track).
   - **Nutrition Barriers:** `Time / Busy`, `Grocery Budget`, `Taste / Variety`, `High Hunger`, `Eating Out`, `Trouble Logging`, `None (All Good)`.
   - **Nutrition Subjective Sliders (`1..5` Optional):** `Hunger`, `Satiety (Fullness)`, `Energy`.
   - **Training Barriers:** `Time / Schedule`, `Fatigue`, `Joint Pain`, `Equipment Limits`, `Motivation`, `None (All Good)`.
   - **Energy (`1..5` Optional).**
   - CTA: `[Submit Feedback]` (`coaching_feedback`).
2. **Coaching Inbox Card Lifecycle (`GET /v1/coaching/inbox`):**
   - **State 1 — `status: "question"` (Auto-created by `reconcileCoaching` after 2+ missed workouts or 2+ off-plan days in 7 days):**
     - Prompt: *"Notice: We saw 2 missed workouts this week — what got in the way?"* -> Shows 1-tap Barrier chips right on the card!
   - **State 2 — `status: "proposed"` (Actionable Coaching Agreement Suggestion):**
     - Displays `title` + `step` (1 tiny doable action) + evidence pill.
     - Explicit Buttons (auto-dispatches `coaching_ack` once opened/expanded if `acknowledgedAt == null`):
       - `[I'll Try This Step (1–3 Days)]` (`coaching_decision`, `accept: true`)
       - `[Choose Something Else / Not Now]` (`coaching_decision`, `accept: false`)
   - **State 3 — `status: "accepted"` (Active Agreement):**
     - Shows countdown until `reviewOn` date (`1 day` for `pain`, `3 days` for other barriers).
     - When `reviewDue == true` (`today >= reviewOn`): Displays `[How Did It Go?]` outcome buttons:
       - `[It Helped ✓]` (`outcome: "helped"`)
       - `[Didn't Help]` (`outcome: "not_helped"` — opens next empathetic question automatically!)
       - `[Couldn't Try Yet]` (`outcome: "not_tried"` — zero guilt, offers easier step!)
3. **History Archive (`[Past Coaching Agreements]` -> `GET /v1/coaching/history`):** Paginated read-only timeline.

### API & BACKEND CONTRACT
1. **`[EXISTING] GET /v1/coaching/inbox`** -> Active agreements (`reviewDue`, `expired`, `readStatus`).
2. **`[EXISTING] GET /v1/coaching/history?offset=0&limit=30`**
3. **`[EXISTING] POST /v1/commands?view=receipt`** (`action: "coaching_feedback"`) -> `{ domain, barrier, hunger?, satiety?, energy? }`.
4. **`[EXISTING] POST /v1/commands?view=receipt`** (`action: "coaching_ack"`) -> `{ id }`.
5. **`[EXISTING] POST /v1/commands?view=receipt`** (`action: "coaching_decision"`) -> `{ id, accept: true | false }`.
6. **`[EXISTING] POST /v1/commands?view=receipt`** (`action: "coaching_outcome"`) -> `{ id, outcome: "helped" | "not_helped" | "not_tried" }`.
   - Error Codes: `COACHING_FEEDBACK_INVALID`, `COACHING_RATING_OUT_OF_RANGE`, `COACHING_HUNGER_NUTRITION_ONLY` (applies to both `hunger` AND `satiety` when `domain == "training"`), `COACHING_TRACK_NOT_ENABLED`, `COACHING_CASE_NOT_FOUND`, `COACHING_CONTEXT_CHANGED`, `COACHING_CASE_ALREADY_DECIDED`, `COACHING_CASE_EXPIRED`, `COACHING_OUTCOME_REQUIRES_ACCEPTED_CASE`, `COACHING_REVIEW_DATE_NOT_REACHED`.

### RULES & BUSINESS LOGIC
1. **Pain Barrier Safety Hold (`coachingSafetyHold`):** Submitting `domain: "training", barrier: "pain"` immediately places a safety hold on workout progression until a fresh pain-free `recovery` check-in (`US-CCH-02`) clears it; client reflects this hold immediately in Today & Workouts.
2. **High Hunger Protection (`hunger >= 4` or `energy <= 2`):** Automatically suppresses negative calorie cut proposals in `US-CCH-03` for the next 2 days (`currentFeedback` freshness window).
3. **Review Date Guard:** Disable `[It Helped ✓]` before `c.reviewOn` (`COACHING_REVIEW_DATE_NOT_REACHED`) with clear badge `"Check back on {reviewOn}"`, while keeping `[Didn't Help]` / `[Couldn't Try Yet]` available if user cancels early.

### MAIN FLOW
1. User missed 2 sessions due to a busy week -> `reconcileCoaching` creates a `question` case in `coaching/inbox`.
2. User taps `Time / Schedule` barrier chip on the Coach Hub card (`coaching_feedback`).
3. Server responds with an empathetic `proposed` step (*"Organize session timing & review your available workout length"*).
4. User taps `[I'll Try This Step]` (`coaching_decision` `accept: true`, sets `reviewOn = +3 days`).
5. 3 days later, user sees `"How Did It Go?"` and taps `[It Helped ✓]` (`coaching_outcome`).

### EDGE CASES
- **Plan Changed Mid-Agreement (`COACHING_CONTEXT_CHANGED`):** Server automatically supersedes stale agreements when plan changes; Inbox refreshes cleanly without throwing errors.
- **Proposal Expired After 7 Days (`expired == true`):** Hide stale `[Accept]` buttons and prompt `[Log Updated Check-In]`.
- **Single-Track User Submits Barrier Feedback:** Only valid `domain` (`nutrition` for `nutrition_only`, `training` for `workouts_only`) is selectable so `COACHING_TRACK_NOT_ENABLED` is never triggered; both `hunger` and `satiety` ratings are strictly hidden for `domain == "training"` (`COACHING_HUNGER_NUTRITION_ONLY`).
- **Offline Feedback / Decision / Outcome:** Queues `coaching_feedback`, `coaching_decision`, or `coaching_outcome` in SQLDelight outbox seamlessly while reflecting the new state locally.

### ACCEPTANCE CRITERIA
- **Scenario 1: Reporting `pain` barrier activates progression safety hold**
  - **Given** user submits `coaching_feedback` (`domain: "training"`, `barrier: "pain"`)
  - **When** committed
  - **Then** `recovery.status` becomes `"hold"` (`FEEDBACK_PAIN_HOLD`) and workout load-increase prompts pause until a fresh pain-free check-in.
- **Scenario 2: `It Helped` outcome enforces `reviewOn` review date**
  - **Given** an accepted agreement has `reviewOn == "2026-11-24"` and `today == "2026-11-22"`
  - **When** viewing the active agreement card
  - **Then** `[It Helped ✓]` indicates `"Available on Nov 24"` rather than triggering `409 COACHING_REVIEW_DATE_NOT_REACHED`.
- **Scenario 3: High hunger feedback suppresses negative calorie adjustments**
  - **Given** user submits nutrition feedback with `hunger = 5`
  - **When** adaptive `review` executes within 48h
  - **Then** negative calorie cuts hold under `APPETITE_ENERGY_REVIEW_REQUIRED` / `ADAPTATION_CALORIE_CUT_BLOCKED`.

### ANALYTICS
- `coaching_feedback_submitted` (`domain`: `"nutrition" | "training"`, `barrier`: `string`, `hunger`: `integer | null`, `energy`: `integer | null`)
- `coaching_agreement_decided` (`case_id`: `string`, `accepted`: `boolean`)
- `coaching_outcome_reported` (`case_id`: `string`, `outcome`: `"helped" | "not_helped" | "not_tried"`)

---

## US-CCH-05: Guarded AI Coach Q&A ("Ask the Coach" — Log-Grounded Chat with Strict Safety Guardrails)

> **Rollout Phase:** Scheduled for Final AI Phase (after core launch); capabilities flags `ai_meal_parse` and `ai_coach_qa` remain disabled until Final AI Phase.

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-CCH-05` |
| **Epic** | `EPIC-06` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `coach`, `ai-coach`, `pro-feature`, `final-ai-phase` |
| **Target Screens** | `AskCoachChatScreen` |
| **Entitlement** | `Pro` (Free users get 3 starter questions teaser + Soft Paywall) |
| **Backend Status** | `New` (`POST /v1/coaching/chat`, `GET /v1/coaching/chat/history` — Final AI Phase) |

### STORY
As a user with specific day-to-day questions (like *"What can I order at a Lebanese restaurant tonight within my 600 remaining calories?"*, *"Why didn't my coach cut my calories this week?"*, or *"Can I swap squats while my knee hurts?"*), I want a conversational AI Coach in Arabic or English that knows my exact profile, remaining macros, active conditions, and recovery holds — and gives practical answers with quick deep-links to app actions without ever overriding CuraFit's clinical safety rules.

### PRECONDITIONS
- User has `onboardingCompleted == true` and `Pro` entitlement (or remaining free sample messages).

### SCREEN AND UI DETAILS
1. **Chat Header:**
   - Coach Avatar + `"Ask Your Smart Coach"` + Context Indicator Pill (`"Synced with Today's Plan • 620 kcal left"`).
   - Disclaimer subtitle: *"Coaching Q&A — Never replaces your doctor."*
2. **Suggested Prompt Chips (Context-Aware):**
   - Dynamically reflect user state:
     - `"Why didn't my calories change yet?"`
     - `"High-protein Egyptian snack under 250 kcal"`
     - `"Eating out tips for tonight"`
     - `"How to warm up safely for my Knee injury"`
3. **Chat Message Stream:**
   - **AI Coach Bubbles:** Concise, actionable, grounded in live data (`profile`, `food-diary`, `lastReview`, `recovery`), displaying:
     - **Verified Grounding Badge** when citing user numbers (`"Based on today's 1,230 / 1,850 kcal diary"`).
     - **Actionable Deep-Link Chips** inside the reply when relevant: e.g., `[Open Meal Swap ⇄]`, `[Do Recovery Check-In]`, `[Open Food Search]`.
   - **Urgent Medical Escalation Card:** If user types chest pain, fainting, dizziness, severe eating disorder cues, or medication dosing questions, AI strictly refuses to prescribe and displays an urgent red medical-care referral banner.

### API & BACKEND CONTRACT
1. **`[NEW BACKEND] POST /v1/coaching/chat`**
   - **Auth:** Required (`Authorization: Bearer <accessToken>`, Pro gated after free sample allowance)
   - **Request Body:**
     ```json
     {
       "threadId": "default",
       "message": "What can I eat out with my friends tonight with 600 kcal left?",
       "locale": "ar-EG"
     }
     ```
   - **Success Response (`200 OK`):**
     ```json
     {
       "ok": true,
       "data": {
         "messageId": "msg_<uuid>",
         "reply": "You have 620 kcal and 48g protein remaining today...",
         "citations": ["today_diary:620_kcal_remaining", "allergies:shellfish"],
         "suggestedActions": [
           { "label": "Log Manual Meal", "route": "quick_log/manual" },
           { "label": "Search Foods", "route": "nutrition/search" }
         ],
         "safetyNoticeTriggered": false,
         "remainingFreeMessages": 0
       }
     }
     ```
2. **`[NEW BACKEND] GET /v1/coaching/chat/history?limit=50&before={msgId}`** -> Fetches persistent conversation history across devices.
   - Error Codes: `402 PRO_ENTITLEMENT_REQUIRED`, `429 RATE_LIMITED`, `400 CHAT_MESSAGE_TOO_LONG` (`max 1000` chars).

### RULES & BUSINESS LOGIC
1. **Strict Guardrail Policy (Enforced in Server System Prompt + Post-Filter):**
   - AI Coach is **strictly read-only** against domain state: it NEVER directly calls `generate`, `adjustCalories`, or changes injury/clinical flags!
   - If `recovery.status == "stop"`, AI Coach refuses any workout advice and reiterates medical evaluation first.
   - AI never advises fasting/keto to pregnant/diabetic users or prescribes medical drugs/supplements dosages.
2. **Bilingual Parity:** Responds naturally in Egyptian/MSA Arabic when user writes in Arabic (matching `locale`), or clean English when user writes in English.

### MAIN FLOW
1. User taps `[💬 Ask the Coach AI]` on Coach Hub.
2. User types `"What's a quick post-workout meal near me for 500 kcal and 40g protein?"` (user has `dairy` allergy).
3. Backend injects sanitized snapshot (`540 kcal left`, `42g protein left`, `allergies: ["dairy"]`, `region: "egypt"`) and generates tailored grilled chicken shish tawook + pita + tahini salad option (dairy-free!) with a `[Log Manual Meal]` deep-link chip.

### EDGE CASES
- **Offline Chat Open:** Displays past cached thread (`SQLDelight`) clearly with disabled input bar (`"Connect to internet to ask a new question"`).
- **User Asks to "Lower my calories by 500 kcal right now":** AI explains CuraFit's clinical calorie floor (`minCalorieFloor`) and safe `<= 5% / 150 kcal` 14-day adaptive protocol, linking `[Run Coach Review]` (`US-CCH-03`) rather than inventing unsafe starvation diets.
- **Message Over `1000` Characters (`CHAT_MESSAGE_TOO_LONG`):** Inline character counter warns cleanly before submit and prevents truncation surprises.
- **Free User Exhausts 3 Starter Messages (`402 PRO_ENTITLEMENT_REQUIRED`):** Preserves readability of existing conversation messages cleanly and opens `ContextualProUpsellSheet` (`US-MON-01`) on the 4th send tap.

### ACCEPTANCE CRITERIA
- **Scenario 1: AI Coach honors user allergies & remaining calories**
  - **Given** user has `allergies: ["fish"]` and `550 kcal` remaining today
  - **When** user asks for dinner suggestions via `POST /v1/coaching/chat`
  - **Then** suggestions stay near `550 kcal`, contain zero fish dishes, and include actionable deep-link chips.
- **Scenario 2: Red-flag safety state blocks workout recommendations in AI Coach**
  - **Given** `recovery.status == "stop"`
  - **When** user asks `"Can I still bench press light today?"`
  - **Then** AI Coach responds with `safetyNoticeTriggered: true` advising complete rest and medical evaluation.
- **Scenario 3: Medication or eating-disorder crisis query triggers urgent clinical boundary**
  - **Given** user asks `"What dose of insulin should I take tonight?"` or expresses extreme purging/starvation cues
  - **When** `POST /v1/coaching/chat` processes the prompt
  - **Then** AI strictly refuses medication dosing, displays physician/helpline escalation copy (`safetyNoticeTriggered: true`), and makes zero plan mutations.

### ANALYTICS
- `ai_coach_chat_opened` (`source`: `"coach_hub" | "today"`)
- `ai_coach_message_sent` (`locale`: `string`, `used_prompt_chip`: `boolean`, `safety_notice_triggered`: `boolean`)
- `ai_coach_action_chip_clicked` (`route`: `string`)

---

## US-CCH-06: Structured Weekly Care-Team Check-In, Scientific Progress Audit & Zero-Guilt "Comeback Protocol"

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-CCH-06` |
| **Epic** | `EPIC-06` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `coach`, `retention`, `weekly-checkin`, `comeback-protocol` |
| **Target Screens** | `WeeklyCheckinFlowScreen`, `ComebackProtocolModal` |
| **Entitlement** | `Free` *(Weekly Care-Team Check-In & Comeback Protocol are Free; applying Pro performance/nutrition adaptive proposals triggers `US-MON-01`)* |
| **Backend Status** | `Mixed` (`[EXISTING]` `weight`, `coaching_feedback`, `recovery`, `review`, `renew_plan` + `[NEW BACKEND]` `action: "comeback_restart"`, `action: "body_measurement"` + `[MODIFIED BACKEND]` `bootstrap.engagementState`) |

### STORY
As a user who wants the reassuring accountability of a full scientific coaching team checking in on my week — and an empathetic, non-punitive way to restart cleanly if I fall off track for a few days due to travel, work, or illness — I want a guided 60-second Weekly Team Check-In and a personalized Zero-Guilt Comeback Protocol so I stay consistent long-term without ever crashing or feeling judged.

### PRECONDITIONS
- **Weekly Team Check-In:** `engagementState.weeklyCheckinDue == true` (triggers weekly on user's chosen check-in day / every 7 days after `journeyStartedOn`, or manually from Coach Hub).
- **Comeback Protocol:** `engagementState.daysSinceLastLog >= 3` (`comebackTier` in `["short_3_6d", "medium_7_13d", "detrained_14d_plus"]`).

### SCREEN AND UI DETAILS
1. **Guided 60-Second Weekly Care-Team Check-In (`WeeklyCheckinFlowScreen` — 3 Short Interactive Cards):**
   - **Card 1 — Scale & Tape Pulse:** Confirms current weight (pre-filled with today's or HealthKit's latest weight) + optional 1-tap `Waist (cm)` (`weight` + `[NEW BACKEND] body_measurement`).
   - **Card 2 — Biofeedback & Weekly Barriers:** Quick 1–5 ratings for **Hunger**, **Energy**, and **Sleep/Recovery**, plus top barrier chips (`coaching_feedback` + optional `recovery`).
   - **Card 3 — 3-Specialist Scientific Verdict:**
     - **Clinical Nutritionist:** Evaluates 7-day/14-day weight trend + adherence + proposes or holds calories (with `[See the Science]` link -> `US-CCH-03`), plus `[Generate Next 7-Day Meal Plan]` button if expired (`US-NUT-01`).
     - **Strength & Conditioning Coach:** Summarizes sessions completed (`4/4` or partial), PRs unlocked, and any `weekly_volume` boost or pain hold.
     - **Recovery & Habit Specialist:** Confirms next week's Streak Freeze availability + key micro-focus agreement (`US-CCH-04`).
2. **Zero-Guilt Comeback Protocol Modal (`ComebackProtocolModal`):**
   - Headline: *"Welcome Back, {name} — No Guilt, Only Smart Momentum"*
   - Explicit anti-punishment guarantee banner: *"Missed days never require 'makeup workouts' or crash dieting. Let's pick up right where your body is today."*
   - **1-Tap Context Chips:** `"Busy / Work"` | `"Travel / Ramadan"` | `"Sick / Needed Rest"` | `"Lost Motivation"` (optional note -> recorded cleanly in `comeback_restart` / `coaching_feedback`).
   - **Tiered Automatic Re-Entry Prescription (`action: "comeback_restart"`):**
     - **Tier 1 (`short_3_6d`, 3–6 days off):** Resumes active workout & nutrition plan immediately at current weights, auto-offers fresh 7-day meal plan if expired (`renew_plan`).
     - **Tier 2 (`medium_7_13d`, 7–13 days off):** Activates a **24-Hour `-20%` Re-Entry Workout Deload** via dedicated `action: "comeback_restart"` (never fabricating a fake fatigued `recovery` check-in that would pollute sleep/fatigue baselines!) and skips past missed calendar dates cleanly.
     - **Tier 3 (`detrained_14d_plus`, >= 14 days off):** 20-second fresh Weight & Injury confirmation -> `action: "comeback_restart"` activates a gentle **7-Day `-20%` First-Week Ramp-In Deload** + optional `profile.weight` refresh before renewing/generating a fresh 7-day meal plan (`renew_plan` / `generate`) tailored to updated weight -> Sends motivational streak restart badge!

### API & BACKEND CONTRACT
1. **`[MODIFIED BACKEND] GET /v1/bootstrap`**
   - Returns `data.engagementState`: `{ "daysSinceLastLog": 9, "lastLoggedAt": "2026-11-12", "weeklyCheckinDue": false, "comebackTier": "medium_7_13d" }`.
2. **`[NEW BACKEND] POST /v1/commands?view=full`** (`action: "comeback_restart"`)
   - Payload: `{ "tier": "short_3_6d" | "medium_7_13d" | "detrained_14d_plus", "applyDeload": true, "deloadDurationDays": 1 | 7, "updatedWeightKg": 82.2, "reason": "busy_work", "renewMealPlan": true }`.
   - Applies clean `sessionAdjustment` (`setFactor: 0.8` for 24h in Tier 2 or 7 days in Tier 3) without fabricating fake `recovery` sleep/fatigue check-ins, optionally refreshes `profile.weight` (logging `weight` cleanly) before invoking `renew_plan` when expired.
3. **`[EXISTING]` + `[NEW BACKEND]` Weekly Check-In Sequence:** Executes `weight`, optional `[NEW BACKEND] body_measurement`, `coaching_feedback`, optional `recovery`, `review`, and optional `renew_plan`.

### RULES & BUSINESS LOGIC
1. **Zero-Doubling Rule (`IMPLEMENTATION.md`):** Never stack missed workout days onto today or tomorrow, and never slash calories below baseline/floor to "compensate" for missed diary days!
2. **Comeback Prompt Dismissal Cooldown:** If the user dismisses `ComebackProtocolModal` via `[I'll Just Resume Today]`, mark `comebackPromptDismissedDate = today` in SQLDelight so it doesn't nag repeatedly on every tab switch.
3. **Clinical Check Before Comeback Restart:** If `daysSinceLastLog >= 14` AND the user has `injuries.length > 0`, prompt explicitly `"Did any new joint pains develop while away?"` linking cleanly to `US-CCH-02` before heavy lifting.

### MAIN FLOW
1. User opens app after a 10-day work trip (`engagementState.comebackTier == "medium_7_13d"`).
2. Welcoming `ComebackProtocolModal` appears smoothly over Today: *"Welcome back! 10 days away is totally normal."*
3. User taps `"Busy / Work"`, reviews weight (`82.2 kg`), and taps `[Start Gently (-20% Today)]`.
4. App submits `POST /v1/commands?view=full` (`action: "comeback_restart"`, `tier: "medium_7_13d"`, `applyDeload: true`, `deloadDurationDays: 1`, `updatedWeightKg: 82.2`, `reason: "busy_work"`) -> Activates `-20%` 24h re-entry deload on today's Gym Upper session and refreshes weight cleanly without falsifying sleep/fatigue baselines!

### EDGE CASES
- **Active Pregnancy (`maternalStatus != "none"`) During Check-In or Comeback:** Suppresses weight-loss prompts, keeps calories above maternal floor, and offers gentle physician check reminder if away `>= 14` days due to medical reasons.
- **Red-Flag Illness Selected as Return Reason (`illness: true` / `redFlags: true`):** Immediately routes into `RedFlagSafetyStopView` (`US-CCH-02`) advising medical clearance instead of pushing a workout!
- **Weekly Check-In Triggered on `workouts_only` Track:** Skips meal hunger/meal renewal prompts and focuses purely on Weight + Training Soreness/Volume + Strength Coach PR audit.
- **Offline Comeback / Weekly Check-In:** Allows completing all step cards offline, queues `weight` / `body_measurement` / `coaching_feedback` / `comeback_restart` commands via SQLDelight outbox (`US-AUTH-04`), and runs server `review` automatically on reconnect.

### ACCEPTANCE CRITERIA
- **Scenario 1: Returning after 8 days inactive surfaces non-punitive Comeback Protocol**
  - **Given** `bootstrap.engagementState.daysSinceLastLog == 8` and `comebackTier == "medium_7_13d"`
  - **When** the user opens Today or Coach Hub and confirms `[Start Gently (-20% Today)]`
  - **Then** `action: "comeback_restart"` activates a clean 24h `-20%` re-entry deload without fabricating a fatigued `recovery` check-in, stacking missed workouts, or cutting calories aggressively.
- **Scenario 2: Weekly Care-Team Check-In aggregates biofeedback and triggers review**
  - **Given** `engagementState.weeklyCheckinDue == true`
  - **When** user submits updated weight, optional waist (`body_measurement`), hunger/energy ratings, and taps Finish
  - **Then** `weight`, `body_measurement`, `coaching_feedback`, and `review` execute cleanly and the 3-Specialist verdict summary renders.
- **Scenario 3: Single-track `workouts_only` user sees training-focused check-in**
  - **Given** `serviceTrack == "workouts_only"` and `weeklyCheckinDue == true`
  - **When** `WeeklyCheckinFlowScreen` opens
  - **Then** diet hunger and meal-plan renewal cards are hidden while Strength Coach volume & readiness review proceed cleanly.

### ANALYTICS
- `weekly_team_checkin_completed` (`track`: `string`, `hunger`: `integer`, `energy`: `integer`, `proposals_count`: `integer`)
- `comeback_protocol_shown` (`tier`: `string`, `days_away`: `integer`)
- `comeback_protocol_completed` (`tier`: `string`, `reason`: `string`, `accepted_deload`: `boolean`)
