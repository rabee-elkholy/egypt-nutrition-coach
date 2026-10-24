# Baseline audit, before full cohort execution

Baseline Git commit: `f23b9f6bb44995ee7388c38e27f0d1e85eff9373` on `main`, pulled from origin. `npm run check`: **173 tests passed, zero failed**. Full original log retained with results. Engines remain unchanged.

| Path | Actual role and integration |
|---|---|
| server/worker.mjs | authenticated HTTP routing, optimistic revision and idempotency gates, eligibility, full presentation, history fetch, minimal receipts |
| server/coaching.mjs | onboarding/generate, supported conditions, profiles, food/water/weight/activity, workout logging, review and adaptation consent |
| server/store.mjs | D1 account and normalized archival persistence; historical plans and request receipts; atomic revision guards |
| server/simulation.mjs | isolated account reset, virtual day progression and actual renewal; **fill prohibited in primary evaluation** |
| server/clock.mjs | AsyncLocalStorage virtual date/time and timezone; simulation day based on fixed startedDate plus revisions |
| server/food.mjs | frozen actual snapshots, ingredient sources and NULL values; explicit completion, deletion, alternatives and immutable meal-plan forks |
| server/workouts.mjs | source exercise catalogue, injury/equipment filters, split/time coverage, alternates and calendar occurrences |
| server/recovery.mjs | current check-in, pain and illness holds, calorie evidence coverage, cooldown and double progression |
| server/training-state.mjs, training-review.mjs | program-version preservation, expected exposures, completed-session coverage, weekly-volume proposals |
| planner-core.mjs | needs, constrained meal fitting, nutrient snapshots, reference/estimated separation, source-based daily sums |
| diet-patterns.mjs | nine diets, clinical contraindications, fixed meal counts and constraints |
| personal-brief.mjs | exact frontend personal messages with evidence topics; no unrecorded truth inputs |
| coach-messages.mjs, split-review.mjs, coaching-ui.mjs | tips and training guidance, 8-week split advice, actual interface render |

Primary integration is through the actual HTTP Worker and migrated local Miniflare D1, retaining all validation and store paths. No direct JSON insertion of plans, decisions or reviews. Eligibility is recorded even if generation later fails. Every failed user still has all requested daily records. The adapter does not perform network notification or billing calls.

Pilot-v1 (5×14): pipeline completed 70 days; identified harness confounding of region with goal and an invalid ingredient alias (`eggs` instead of `egg`). These were corrected **before** full-run freezing; original pilot outputs remain separate. Food preferences/time burden were connected to behavior and ground-truth meals are retained even on unopened days. No application-engine modification was made.

Known test limits are documented before outcomes: hypothetical latent weight; finite independent check coverage; DOM sampling; raised existing local rate-limit setting; healthcare and user research judgments not established by simulation. Holdout assignment occurs in cohort generation before execution; full-run outcomes do not tune the simulator or engines.
