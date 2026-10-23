# Coaching preview 0.8

## Boundaries

The original onboarding UI/module remains unchanged; its calculation dependency can use the selected goal pace. The food browser and original sources remain available. There are no production AI calls. Authentication development is deferred by the user; the existing private Sites access and dispatch identity remain in place. Independent KMM authentication is not implemented.

This is a healthy adult general fitness engine, not clinical rehabilitation or automatic treatment: 18–70, with reported disease, injury or maternal status routed away from autonomous prescriptions. Scientific equations and source data are distinguished from conservative product rules; this release is not an assertion of specialist certification.

## Nutrition

Mifflin–St Jeor resting energy with the selected activity factor; the selected activity includes exercise and is not counted twice. Goal pace selects loss deficits of 10/15/20% capped at 500 kcal; muscle-gain surplus 5/8/10% capped at 250 kcal; general gain 8/12/15% capped at 400 kcal. These are bounded starting heuristics, not promised kg/week or deadlines. Source: https://pubmed.ncbi.nlm.nih.gov/2305711/ . Protein guidance source: https://pubmed.ncbi.nlm.nih.gov/28642676/ . Estimates adapt to recorded outcomes rather than assuming measured metabolism. The pre-existing food-library energy bounds remain product limits; they are not a medical safety guarantee.

Regional menus, diet rules, excluded ingredient groups, budget and meal count are enforced by the existing source-based food engine. Failures never clear exclusions or silently raise budget. Workout weekdays use actual calendar dates; meal timing does not assume lunch follows the workout. Meal alternatives are revalidated against the full day's diet constraints. An already logged meal cannot be replaced; a replacement creates an archived plan version.

Actual consumption is separate: planned meal portion multiplier, reference ingredient grams, or manual name/energy and optional macros. Frozen nutrient totals and source references preserve actual history. Unknown macros remain null. Adding/deleting food reopens completion. Day energy/adherence is calculated from actual entries, not user-entered adherence percentages. An explicit completion marker means the user declares all food and drinks logged. Legacy daily-total logs remain compatible.

Calorie reviews require 3 distinct weights in each of two calendar weeks and 10 complete food days within 20% of target, with recorded energy. Loss change bands 0.25–1%/week and gain 0.1–0.5%/week are product heuristics. Adjustments are <=5% and <=150 kcal, never more often than 14 days. No calorie reduction is triggered by missed exercise, fatigue, illness or pain. New targets require acceptance and take effect tomorrow; protein target is preserved, diet constraints are rechecked, and actual history is untouched. After at least 3 recent weights reach the user's target, an accepted maintenance proposal generates the maintenance plan. Expired weeks can be renewed under the current saved preferences and accepted energy adjustment.

## Training

OpenExerciseDB source SHA-256, English descriptions, primary/secondary muscle relations, required primary/setup equipment, source author/licenses and AI translation statuses are retained. Quads/adductors source groups normalize to quadriceps/hips check-in regions. No invented fractional muscle contributions. Active catalog is 868; no arbitrary human-review-count gate. Catalog `source_only` is explicit.

Equipment must match every primary/setup item at home; absence is not interpreted as availability. Candidate selection requires the pattern, level and tracking type. Missing patterns are reported. Stable named movements are preferred. Session budget includes a 5-minute warm-up allowance, per-set repetition time, inter-set rest and transitions; planned estimate never exceeds selected duration. Estimates do not promise actual elapsed time. Full-body, upper/lower, PPL and >=5-day bro split are supported; incompatible split/day choices produce explicit fallbacks. Direct weekly sets by muscle are exposed; secondary participation is displayed without invented percentage weights.

Double progression requires two different dates in the current workout plan at the same load for every set, all top-range reps, known target RIR, no pain, current ready recovery and no affected-muscle caution/hold. Equipment increments must be supplied and <=5%; assisted loads decrease instead. Past entries, unknown recovery and mixed loads cannot authorize increases. Same-date corrections replace that exposure rather than count it twice. Fresh recovery reports clear stale suggestions. Workout/session logs preserve plan and exercise IDs; session duration/RPE and missed sessions are recorded.

For muscle gain, weekly volume increase requires a personal recovery baseline, ready status, >=80% of two weeks' sessions completed on distinct dates, 3 comparable stable exposures, and no recent energy/volume change in 14 days. It proposes one weekly set, <=20% of the target muscle's existing direct sets, preserving the session time budget. Acceptance creates a new workout version; history and the previous version are archived. Maintenance and fat-loss goals do not automatically escalate volume.

Rescheduling proposes a dated one-off move within 14 days. The accepted move removes the original occurrence, adds the destination on a rest day, and does not increase total sessions. The next 14 calendar days are projected by the API. A moved date does not change food energy automatically.

## Recovery

Freshness is 24 hours. Required sleep hours/quality, fatigue and pain/illness/red flags; stress is optional. Soreness is 0–10 by region; omitted regions remain unknown, rather than 0. Pain location is separate from normal post-exercise soreness.

Sleep <6h, quality <=2 or 1.5h below individual baseline count as one domain. Fatigue >=4 or 1.5 above baseline, stress >=4 and soreness >=7 add domains. Two domains suggest 20% fewer sets; three suggest 40%. Repeated poor recovery on 3 of 7 days increases caution; comparable performance decline can escalate to high concern. Fresh pain blocks progression, illness suggests postponement, and red flags advise stopping/urgent assessment without diagnosis.

Distinct eligible historical reports form the rolling 28-day baseline after 7 earlier reports, with current 14-day coverage reported separately. Duplicate/future/illness/red-flag reports cannot inflate it. Coverage confidence is a data-coverage label, not a clinical probability. A temporary accepted deload expires within 24 hours and does not rewrite baseline weekly sets; a new check-in clears it for reassessment.

## Persistence and compatibility

Worker HTTP API + D1 supplied by Sites. The only durable account key is dispatch-owned `oai-authenticated-user-id`; simulated onboarding emails do not identify backend records. One account aggregate contains active workout, profile and logs. Nutrition and workout plan versions live separately in `coaching_plans`/`coaching_workout_plans`; `coaching_changes` provides cursor-based change metadata. Requests store compact idempotency receipts, not repeated full meal plans.

The initial legacy inline plans are archived on the next successful write without deleting records. Every mutation is a transactional compare-and-swap with the expected account revision. Dependent archive/receipt/change inserts are guarded by the exact successful account body; a lost race cannot commit its history. Repeated keys with a different request return 409; same-key retries return current state with the original receipt and `replayed:true`.

SQL migrations and Drizzle metadata are append-only and schema-only. No request executes schema DDL. `scripts/local-migrations.mjs` runs explicit local preview migrations, separately from hosted deployment migrations. No registration/auth changes are needed for this upgrade.

The preview aggregate still has a 1.5 MB log-state limit, 40 KB command payload limit and 90-day backfill window. Version archives do not count toward the aggregate limit. Full export includes all archived plans. A long-running public launch should move diary/log aggregates to paginated relational records and add operational rate limiting/retention policy; PostgreSQL requires a new storage adapter plus migration. These operational items, independent mobile authentication, push notifications and clinician review are not implemented by this preview. Reviews run when requested; there are no background notifications or hidden automation jobs.

## Verification and deployment

`npm ci`, `npm run build`, `npm test`, `npm run dev`; `node scripts/browser-smoke.mjs` runs portable browser QA after installing Chromium. Tests cover clinical eligibility, source completeness, equipment/time constraints, real weekdays, diary/portion/completion rules, immutable history, regional recovery/baselines, comparable progression, calorie/goal/volume approvals, dated rescheduling, D1 isolation, concurrent updates, compact receipts and plan archives. Mobile and desktop browser QA covers the primary write/read flows and catalog pagination.

Deploy build artifacts from the exact pushed source commit to the existing private Site; preserve Site ID and audience. The deployment archive includes `.openai/hosting.json`, `dist/server`, `dist/client` and `drizzle`. Confirm hosted migrations and terminal successful deployment before reporting publication. User requested publishing the completed Site before pushing that same source to the original GitHub repository.
