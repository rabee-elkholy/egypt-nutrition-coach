# First-week onboarding messages — 2026-10-27

Purpose: make the first seven days easier to start and return to, without invented achievements, pressure to maintain streaks, extra notifications, or changes to nutrition/training prescriptions.

## Behavior

- Day 1: personal welcome before any record; acknowledge a real first record after one exists. One primary navigation button points to recovery, food logging or the workout schedule according to enabled services and fresh evidence.
- Day 2: small repeatable start; missing records are not treated as failure.
- Day 3: ask what made starting difficult and link to the existing barrier/feedback flow.
- Day 4: reinforce a manageable step; no request to compensate for missing days.
- Day 5: check whether the plan fits time/preferences and offer barrier feedback.
- Day 6: explain the upcoming summary without encouraging extra logging to improve the numbers.
- Day 7: summarize distinct recorded dates, explicitly completed food-log days and current-program completed sessions. Counts are evidence of recording, not proof of physiological progress or adherence. The next step opens the existing feedback/agreement flow.
- Day 8: ordinary follow-up resumes. Existing agreements and actual returns after inactivity keep priority over the generic onboarding sequence.

Messages branch by no records, actual records today, and prior records without today's activity. The welcome changes after an actual record, including feedback. Future records and old-program session completions do not inflate the summary. Missing food or recovery guidance uses introductory copy rather than “0 days in the last 7” or praise for things not done.

## Persistence and safety

The server sets `onboarding.journeyStartedOn` after a successful first profile generation using the profile's local date. It survives profile edits, service-track changes and plan renewal. Existing accounts without a reliable persisted start date retain normal messages; deployment does not restart their onboarding. Simulation reset intentionally creates its own independent journey.

No schema migration is needed: onboarding is already durably stored/exported in the account JSON. Safety holds, low sleep, fatigue, high hunger, expired plans, remembered nutrition declines and active coaching agreements retain priority. New action buttons only navigate; they never log activity, accept an agreement or alter a plan automatically. Optional `actionTarget` is documented in the API contract for clients.

## Verification

- Full `npm run check`: **315 tests passed, zero failures/skips** (`evidence/first-week-final-check-20261027/`). New tests cover first-visit truthfulness, day boundaries, stable reloads, track-specific navigation, deduplicated evidence counts, safety priority and persistent start dates.
- Local HTTP/D1 simulation: **12 accounts × 8 days = 96 account-days**, three service tracks and four trajectories (empty, regular, return, agreement). **387 HTTP responses, all 200; 495 checks, all passed**. Reloaded state and brief content remain stable, week summaries match recorded activity, agreement/return priorities remain intact, and renewal does not restart the week.
- HTTP evidence: `reports/simulation-100-users-90-days/audit-first-week-http-20261027/measurement.json` and compressed raw HTTP events. This uses the established trusted local identity/clock harness; it is not a production user cohort.
- Browser verification: six real local Worker/D1 journeys (three tracks at 390px and 1280px), one visible primary CTA, correct navigation without writes, CTA change after a recorded recovery check-in, review-tab rendering and no overflow/page errors. Screenshot evidence remains local.

Retention improvement is **not measured** by these tests. Real D1/D3/D7 return rates and completion of the first useful action would be needed to measure that outcome. This change does not add a push delivery provider or claim human follow-up.

## Deployment

Published to the canonical `egypt-nutrition-coach` Worker, version `e813869c-ba75-4607-a8b6-f5024af01e62`. Read-only live health/capabilities checks passed and all three changed public modules matched local tested bytes. Details: `FIRST_WEEK_RESULTS.json`.
