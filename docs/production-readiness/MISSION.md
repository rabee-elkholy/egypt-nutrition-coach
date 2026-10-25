# CURAFIT — CONTINUOUS BACKEND ENGINEERING, INDEPENDENT AUDIT & PRODUCTION READINESS

## Your mission

You are my long-term Principal Backend Engineer, Software Architect, QA Lead, and Independent Technical Auditor.

Repository:

https://github.com/rabee-elkholy/egypt-nutrition-coach

This is a **continuous engineering assignment**.

I will continue working with you in this same Codex conversation until we achieve the final objective.

Do not treat this request as a one-shot task that ends after writing a report.

Do not stop after creating a roadmap.

Investigate, implement, test, verify, document, and continue iteratively until the acceptance criteria are satisfied or an explicit external blocker requires my decision.

---

# 1. The actual goal

We are building CuraFit, a commercial fitness, nutrition, and health-tracking application targeting Egypt, Saudi Arabia, the Gulf, and the wider Middle East.

The mobile application is being developed separately using Kotlin Multiplatform (KMM), targeting Android and iOS.

The current web application is primarily a development and testing environment.

Our goal is to have the **entire backend ready before the mobile application is completed**.

By the time the KMM team is ready to integrate, the backend should already be:

- Functionally complete for the agreed product scope.
- Secure.
- Well-tested.
- Reliable.
- Scalable within documented limits.
- Stable at the API level.
- Compatible with mobile offline/retry behavior.
- Operationally maintainable.
- Ready for a controlled production release.
- Competitive in the quality of its nutrition, workout, and tracking functionality.

The objective is not merely to produce successful tests.

The objective is to deliver a backend that performs correctly under realistic conditions and can safely serve actual users.

**AI-powered features are explicitly excluded from this assignment.**

Do not implement, modify, or evaluate generative AI coaching, AI meal scanning, or AI-generated plans.

Focus on deterministic product functionality and backend engineering.

---

# 2. Project principles

Follow these rules throughout the assignment.

1. Continue the existing project. Do not rebuild it from scratch.
2. Inspect the latest repository before making changes.
3. Preserve working functionality and existing data compatibility.
4. Verify all claims against actual code and execution evidence.
5. Fix root causes rather than symptoms.
6. Add regression tests for every confirmed defect.
7. Do not weaken assertions to obtain passing tests.
8. Do not invent results or performance numbers.
9. Do not modify production data or deploy without explicit authorization.
10. Keep all work traceable to actual Git commits.
11. Distinguish verified implementation from proposed implementation.
12. Never declare production readiness based exclusively on synthetic simulations.

Treat previous AI-generated reports as untrusted claims until verified.

---

# 3. Context: what has already happened

A previous agent, running Gemini 3.8 Flash in Antigravity, worked on the repository and produced simulation reports.

There have been two major simulation runs.

## Previous run

Run ID:

`run-1792840358320`

Reported:

- 100 users.
- 9,000 user-days.
- 51,233 operations.
- 2,052 rejected operations.
- 90.92/100 average quality score.
- 20/20 stress tests.

An independent review identified major simulator and evaluator problems.

## New run

Run ID:

`run-1792850501931`

Reported:

- 100 users.
- 9,000 user-days.
- 51,267 operations.
- Zero rejected operations.
- 85.64/100 average quality score.
- 20/20 stress tests.
- 188 backend tests passed.
- 11 evaluator negative-control tests passed.
- 32 cohort stress tests passed.

The new reports were delivered in:

- `curafit-reports.zip`
- `reports.zip`

The two ZIP files are byte-for-byte identical.

If available in your execution environment, inspect the archives directly.

If they are not available, explicitly request them or proceed with source-code inspection while documenting which artifact-level checks remain unavailable.

---

# 4. Findings from an independent review of the new reports

The reports were inspected independently.

The following issues require investigation.

## Finding 1 — Full backend simulation is not independently demonstrated

The delivered dashboard contains 100 users and 9,000 simulated days.

However, its operation records resemble in-process function calls.

Example operation metadata contains fields such as:

- `day`
- `action`
- `status`
- `revision`
- `latencyMs`

It does not provide the full HTTP evidence expected from the authoritative cohort harness:

- HTTP method.
- Endpoint.
- Request body.
- Response body.
- Numeric HTTP status.
- Request ID.
- User identity context.
- Database operation evidence.
- Idempotency context.

Investigate whether the latest result was actually produced by:

`npm run sim:fast`

or:

`npm run sim:100:90`

The repository previously contained separate simulation implementations:

- `scripts/run-full-simulation.mjs`
- `scripts/cohort/run.mjs`

Determine exactly which implementation generated the delivered artifacts.

Do not describe an in-memory simulation as full HTTP/D1 integration testing.

If the full harness was executed separately, locate its actual raw journals and test logs.

If it was not executed, run it after validating the harness.

## Finding 2 — Contradictory message repetition reports

The latest `QUALITY_REPORT_AR.md` claims approximately 42% message repetition.

However, independent calculations from the 9,000 daily records embedded in the dashboard found approximately:

**62.3% average per-user exact-text repetition.**

The production readiness report itself mentions approximately 62.5%.

Correct the metric definitions and report generation.

All documents must derive the number from the same canonical metric.

No manually written report may override measured data.

## Finding 3 — Incomplete deliverable integrity

The latest manifest references approximately 1,518 output files.

However, the delivered reports ZIP contains only 19 files.

Most per-user JSONL files and full event journals are absent from the supplied archive.

Some newly authored engineering reports are not included in the simulation manifest.

Fix the release packaging.

Deliver two independently verifiable archives:

1. Complete raw simulation evidence.
2. Reports and dashboard.

Each archive must have its own accurate manifest.

A verifier must reject an archive when required files are missing.

## Finding 4 — Invalid cohort-diversity analysis

The latest `cohort_diversity.json` reports:

- Training experience missing for 100 users.
- Countries missing for 100 users.
- Empty medical-conditions distribution.

However, the cohort contains populated fields such as:

- `fitnessLevel`
- `region`
- `diseases`
- `injuries`

This indicates a schema mismatch in the diversity evaluator.

Correct the field mappings.

Validate the resulting distributions against the actual 100 personas.

Also inspect persona consistency. Some male personas have explicitly feminine occupation descriptions.

Do not claim realistic demographic diversity without validating the generated personas.

## Finding 5 — Test execution evidence is incomplete

The reports claim:

- 188/188 backend tests.
- 11/11 evaluator negative controls.
- 32/32 cohort stress tests.
- 20/20 simulation stress tests.

These claims require independently reproducible test execution evidence.

Run the actual test commands.

Capture:

- Commands.
- Environment.
- Source commit.
- Test names.
- Results.
- Failures.
- Skips.
- Logs.
- Execution times.

Do not count ordinary successful application operations as passed test cases.

## Finding 6 — Security and operations claims need validation

`SECURITY_REPORT.md` and `PRODUCTION_READINESS.md` make strong claims about:

- JWT verification.
- Session revocation.
- Tenant isolation.
- Edge header stripping.
- Rate limiting.
- Backups.
- Disaster recovery.
- Monitoring.
- Database capacity.
- Production readiness for 1,000 beta users.
- Scaling beyond 100,000 users.

Do not accept these statements automatically.

For each claim, determine whether it is:

- Implemented and tested.
- Implemented but not tested.
- Documented but not implemented.
- Planned.
- Unsupported.

Delete or correct claims that cannot be substantiated.

Do not infer production capacity from synthetic virtual user-days.

## Finding 7 — Unverified performance projections

The performance report includes very optimistic projected mobile response times for Egypt and Gulf countries.

Local in-process or Miniflare execution cannot establish real mobile network latency.

Separate:

- Pure algorithm latency.
- Local HTTP latency.
- Local database latency.
- Staging latency.
- Production edge latency.
- Mobile end-to-end latency.

Do not publish precise production latency predictions without measurements.

## Finding 8 — Conflicting rendering claims

The English limitations report states that mobile/UI rendering was not measured.

The Arabic limitations report claims DOM-level verification.

The dashboard records messages as not independently verified as rendered.

Resolve the contradiction.

Use the correct states:

- GENERATED.
- DELIVERY_ELIGIBLE.
- DELIVERED.
- RENDERED.
- READ.
- ACTIONED.
- NOT_MEASURED.

Never equate opening the app with rendering a message.

## Finding 9 — Previous scoring and simulator defects

The earlier simulation had these verified weaknesses:

- Incorrect meal-replacement payload.
- Invalid recovery pain-region values.
- Workout rescheduling collisions.
- Exercise replacement followed by logging the obsolete exercise ID.
- Missing historical plan snapshots.
- Automatic stress-test passes after exceptions.
- Awarding full points to non-applicable service tracks.
- Incorrect workout session counting.
- Incomplete safety evaluation.

The latest artifacts indicate improvements in several areas.

For example:

- 1,710 meal replacement operations succeeded.
- Non-applicable nutrition/workout scoring fields are now blank in the per-user CSV.
- The previous 2,052 rejected operations disappeared from the latest simulated event records.

These are positive signals.

However, independently verify that the fixes exist in the latest source code and are covered by regression tests.

Do not regress them.

Also inspect why the new simulation has zero rejected user operations. Determine whether the simulator avoids invalid actions entirely and whether realistic user-error cases are adequately covered elsewhere.

## Finding 10 — Plan history requires evidence

Some users have considerably more than 13 distinct active nutrition plan IDs across 90 days.

Many changes appear associated with meal replacements or accepted adaptations rather than unnecessary weekly regeneration.

Do not assume this is a defect.

Instead, verify every transition:

- Initial creation.
- Weekly renewal.
- Meal substitution.
- Accepted adaptation.
- Goal or preference change.
- Other supported transition.

Every plan ID must correspond to a valid historical snapshot and justified transition.

---

# 5. Your first task: independently establish the actual state

Before implementing additional features, answer these questions with code and evidence.

1. What is the current exact Git HEAD SHA?
2. What changed since the previous simulation?
3. Are the claimed fixes committed?
4. Which simulation scripts are currently authoritative?
5. Does the authoritative harness exercise the real HTTP and D1 path?
6. Can the reported 188, 11, 32, and 20 tests be reproduced?
7. Are the API and database contracts consistent?
8. Are the reports derived from real recorded outputs?
9. What functionality is production-ready?
10. What is incomplete, unsafe, untested, or undocumented?

Create a current-state evidence matrix.

Use these statuses:

- VERIFIED.
- IMPLEMENTED_UNVERIFIED.
- PARTIALLY_IMPLEMENTED.
- MISSING.
- FAILED.
- BLOCKED.
- NOT_APPLICABLE.

No unverified feature may be marked production-ready.

---

# 6. Complete product functionality audit

Audit all backend capabilities required for CuraFit.

## Onboarding and user profiles

Verify:

- Eligibility screening.
- Personal details.
- Goals.
- Activity level.
- Dietary preferences.
- Training experience.
- Available workout days.
- Equipment.
- Injuries.
- Relevant medical conditions.
- Budget.
- Region.
- Timezone.
- Service track.
- Preference changes.
- Profile updates.
- Onboarding interruption and recovery.
- Invalid or contradictory inputs.

## Nutrition

Verify:

- Calorie targets.
- Macronutrient targets.
- Goal consistency.
- Diet constraints.
- Food catalog accuracy.
- Egyptian and Gulf localization.
- Budget-aware meals.
- Dietary exclusions.
- Meal alternatives.
- Meal logging.
- Corrections and deletions.
- Portion quantities.
- Weekly plan renewal.
- Historical plans.
- Plateau detection.
- Calorie adaptation.
- Incomplete tracking.
- Missing nutrient values.
- Medical safeguards.

No nutritional value may be invented to satisfy a test.

## Workouts

Verify:

- Exercise selection.
- Fitness level.
- Workout location.
- Available equipment.
- Frequency.
- Weekly volume.
- Progression.
- Repetitions and weights.
- RIR/RPE.
- Injury exclusions.
- Exercise alternatives.
- Recovery status.
- Deload decisions.
- Missed sessions.
- Partial sessions.
- Rescheduling.
- Session completion.
- Actual changes after accepted adaptations.
- Historical workout records.

## Daily tracking

Verify:

- Food.
- Water.
- Weight.
- Steps.
- Workout logs.
- Sleep and recovery.
- User adherence.
- Progress history.
- Corrections.
- Duplicate prevention.
- Missing data.
- Long-term consistency.

## Coaching and notifications

Verify deterministic:

- Daily messages.
- Weekly summaries.
- Contextual reminders.
- Relevant suggestions.
- Trigger correctness.
- Message timing.
- Notification preferences.
- Quiet hours.
- Repetition.
- Contradictions.
- Message history.
- Delivery state.

Do not touch generative AI functionality.

---

# 7. Build an authoritative simulation system

The final simulation must use real backend behavior.

Prefer the existing full cohort harness if valid.

Do not build a new simulation framework unnecessarily.

The system must support:

- Deterministic random seeds.
- Multiple independent runs.
- Checkpointing.
- Recovery after interruption.
- Independent user state.
- Local database isolation.
- Full HTTP request/response journaling.
- Idempotency verification.
- Revision tracking.
- Historical snapshots.
- Reproducible reporting.

Run 100 users over 90 days.

All 100 users must have meaningfully different trajectories.

Include realistic:

- Non-adherence.
- Inactivity.
- Return after inactivity.
- Meal skipping.
- Overeating.
- Incomplete tracking.
- Workout skipping.
- Schedule conflicts.
- Fatigue.
- Injuries.
- Travel.
- Goal changes.
- Different budgets.
- Different food preferences.
- Different training equipment.
- Adaptation acceptance and rejection.
- Unexpected user actions.

Maintain strict separation between:

**Hidden synthetic ground truth** and **application-observed data**.

The backend must never receive hidden facts unavailable to the actual user-facing system.

The simulation should exercise both successful actions and realistic invalid actions.

Differentiate:

- Successful operation.
- Expected safe rejection.
- User validation error.
- Simulator defect.
- Backend defect.
- Infrastructure failure.
- Authorization failure.

Zero failures is not automatically evidence of a superior system.

---

# 8. Build a trustworthy independent evaluator

The evaluator must be capable of rejecting incorrect results.

Implement negative controls and mutation-style tests.

Examples:

- Unsafe food inserted into a restricted diet.
- Prohibited exercise inserted into an injury-constrained plan.
- Duplicate historical plan ID.
- Missing plan snapshot.
- User A accessing User B's data.
- Invalid adaptation accepted.
- Unsupported meal alternative.
- Fabricated message-rendering status.
- Incorrect session completion count.
- Inconsistent calorie calculation.
- Invalid latency provenance.
- Undocumented state change.

Every deliberately injected defect must cause the corresponding test to fail.

If a negative control does not detect the injected error, fix the evaluator before trusting its scores.

Do not make the runner and evaluator share a single optimistic success flag.

Use evidence-backed results:

- PASS.
- FAIL.
- NOT_TESTED.
- NOT_APPLICABLE.
- INSUFFICIENT_EVIDENCE.

Never turn missing evidence into success.

---

# 9. Backend security and production hardening

Perform an independent audit and implement verified missing protections.

Scope includes:

- Authentication.
- Token verification.
- Refresh lifecycle.
- Logout.
- Session revocation.
- Authorization.
- Cross-user isolation.
- IDOR protection.
- Request validation.
- Rate limiting.
- Idempotency.
- Optimistic concurrency.
- Atomic state updates.
- Database integrity.
- Transaction behavior.
- Secrets management.
- Secure logging.
- Sensitive health data handling.
- Account deletion.
- Data export.
- Backup strategy.
- Backup restoration.
- Database migrations.
- Safe deployments.
- Rollback strategy.
- Monitoring.
- Error tracking.
- Operational alerts.

Do not assume documentation proves implementation.

For backup, restore, security, and migration claims, require actual verification.

Never run destructive tests against production data.

---

# 10. KMM integration readiness

The mobile applications are being developed separately.

Our responsibility is to provide a stable backend contract.

Audit every endpoint and produce an accurate versioned OpenAPI specification.

Verify:

- Existing endpoints.
- Request schemas.
- Response schemas.
- Error codes.
- Authentication requirements.
- Token refresh behavior.
- Serialization compatibility.
- Dates and timezones.
- Units.
- Nullability.
- Pagination.
- Incremental synchronization.
- Retry behavior.
- Idempotency.
- 409 conflict handling.
- Offline action queues.
- Backward compatibility.
- API versioning.
- Deprecation behavior.

Do not invent endpoints in documentation.

If an endpoint is documented but missing, classify it and implement it when required for the agreed mobile scope.

Examples requiring explicit verification:

- `POST /v1/eligibility`
- `POST /v1/commands`
- `GET /v1/account`
- `GET /v1/meal-alternatives`
- `GET /v1/exercise-alternatives`
- `GET /v1/export`
- `DELETE /v1/account`
- `POST /v1/auth/refresh`

Verify their actual existence and behavior instead of assuming they are implemented.

Build contract tests.

Provide accurate example requests and responses.

Where useful, provide Kotlin-compatible data contracts and sample integration flows.

Do not implement the mobile UI.

---

# 11. Performance and reliability

Run separate benchmarks for:

1. Domain-engine execution.
2. Full local HTTP requests.
3. Local D1 persistence.
4. Concurrent writes.
5. Concurrent reads.
6. Mixed traffic.
7. Conflict and retry behavior.
8. Long-running user histories.
9. Large account states.
10. Database restore and migration scenarios.

Report p50, p95, p99, throughput, and errors.

State exact test conditions.

Do not confuse 9,000 simulated user-days with simultaneous load.

Do not extrapolate local timings into production SLAs.

Production capacity and commercial-launch claims must have defensible evidence.

---

# 12. Implementation priority

Use this order.

## P0 — Trustworthiness and safety

Resolve first:

- Invalid test assertions.
- Incomplete safety verification.
- Authentication or authorization defects.
- Cross-user data leakage.
- Data corruption.
- Missing historical data.
- Invalid persistence assumptions.
- False report claims.
- Broken simulation evidence.
- Missing critical API contracts.

## P1 — Production and KMM integration blockers

Resolve:

- Required endpoint gaps.
- Stable versioned contracts.
- Token lifecycle.
- Error handling.
- Offline synchronization behavior.
- Concurrency handling.
- Database migrations.
- Backup and restore.
- Monitoring.
- Deployment safety.
- Operational reliability.

## P2 — Product quality improvements

Evaluate and prioritize:

- Nutrition-plan diversity.
- Meal alternative quality.
- Workout progression.
- Recovery effectiveness.
- Adherence improvements.
- Message repetition.
- Regional food coverage.
- Tracking UX-related backend support.
- Performance optimization.

Do not expand into unnecessary features until critical correctness issues are resolved.

---

# 13. Required evidence and deliverables

Maintain a persistent execution directory, for example:

`docs/production-readiness/`

Include:

- `CURRENT_STATE_AUDIT.md`
- `FINDINGS_REGISTER.md`
- `IMPLEMENTATION_PLAN.md`
- `PROGRESS.md`
- `API_CONTRACT.md`
- `KMM_INTEGRATION_GUIDE.md`
- `SECURITY_AUDIT.md`
- `DATA_INTEGRITY_REPORT.md`
- `SIMULATION_AUDIT.md`
- `TEST_RESULTS.md`
- `PERFORMANCE_RESULTS.md`
- `DEPLOYMENT_READINESS.md`
- `PRODUCTION_GATES.md`
- `FINAL_ACCEPTANCE_REPORT.md`

Maintain a machine-readable findings register where possible.

For every finding, include:

- ID.
- Severity.
- Description.
- Evidence.
- Reproduction procedure.
- Root cause.
- Affected modules.
- Fix.
- Regression tests.
- Status.
- Commit reference.

All generated simulation results must include complete raw evidence and a working verification command.

Preserve old results for comparison.

Do not overwrite the previous baseline.

---

# 14. Keep the work resumable across this Codex conversation

This is extremely important.

We will work together across multiple messages and sessions.

At the end of every meaningful implementation phase:

1. Update `PROGRESS.md`.
2. Record completed tasks.
3. Record remaining tasks.
4. Record test commands and actual outcomes.
5. Record important architectural decisions.
6. Record new findings.
7. Record current Git commit and working-tree status.
8. Identify the next highest-priority implementation task.

A future Codex session must be able to continue from the repository without depending on conversational memory.

Avoid large undocumented changes.

Use focused, reviewable commits.

Do not declare the entire mission complete merely because one phase passed.

---

# 15. Mandatory anti-self-deception rules

You must follow these rules strictly.

- Never fabricate test execution.
- Never invent successful HTTP responses.
- Never present estimated latency as measured latency.
- Never present a document as evidence of a feature's implementation.
- Never classify an unexecuted test as passed.
- Never hide failed or rejected operations.
- Never alter expected results merely to improve the score.
- Never assume synthetic behavior is equivalent to real-world human behavior.
- Never claim medical or clinical validation without qualified human review.
- Never claim production readiness solely from local simulation.
- Never label a message rendered without actual rendering evidence.
- Never treat `N/A` as a perfect score.
- Never hard-code Git provenance.
- Never deliver incomplete archives with manifests claiming files that are not included.
- Never claim that 100% safety has been proven if the safety matrix is incomplete.

A truthful failure report is better than a misleading success report.

---

# 16. Definition of Done

The mission is not complete until we can demonstrate:

### Functional readiness

All agreed core backend features work correctly and pass integration tests.

### Security readiness

Critical authentication, authorization, privacy, and data-isolation gates have been verified.

### Data integrity

All user data, plans, revisions, and relevant history remain consistent and recoverable.

### Simulation credibility

The 100-user × 90-day simulation is executed through the verified authoritative backend path.

Its raw artifacts are complete, independently verifiable, and reproducible.

### KMM readiness

Android and iOS developers have a stable, accurate API contract with no unresolved critical integration ambiguity.

### Operational readiness

Database migrations, monitoring, failure handling, backup/restore, and deployment controls have been implemented and tested to an agreed release standard.

### Product quality

Nutrition, workout, recovery, and tracking functionality have been evaluated with objective evidence.

### External approvals

Where clinical, legal, or specialist sign-off is required, the release scope is appropriately restricted until approval is obtained.

### Final decision

Provide a justified release verdict:

- READY.
- CONDITIONALLY_READY.
- NOT_READY.

The verdict must explicitly state whether it applies to:

- Local development.
- KMM integration.
- Internal testing.
- Closed beta.
- Limited production.
- Public commercial release.

These are different readiness levels.

Do not collapse them into one general label.

---

# 17. How I want you to work

Start with the latest repository.

Your first response should provide a concise evidence-based assessment containing:

1. Current commit and project state.
2. Which previous claims you verified.
3. Which claims are unsupported or contradictory.
4. The most critical real blockers.
5. A prioritized implementation plan.
6. The first changes you are going to execute.

Then begin implementing P0 fixes.

Do not spend the entire turn writing a plan.

Continue making concrete progress.

After each phase, tell me:

- What was fixed.
- What was tested.
- What passed.
- What failed.
- What remains.
- What you recommend next.

When a decision genuinely requires my input, explain the available options and their tradeoffs.

Otherwise, continue autonomously within the authorized development and testing scope.

Do not push to a protected branch, modify production databases, deploy to production, or perform other production-impacting changes without my explicit approval.

---

## The most important instruction

**Your job is to help me finish the CuraFit backend, not to convince me that it is already finished.**

I want to keep working with you until it is genuinely ready for KMM integration and ultimately for commercial production.

Do not optimize for a perfect-looking report.

Optimize for actual correctness, reliability, safety, maintainability, and complete evidence.

A verified 70/100 is more valuable than an unsupported 100/100.

Begin now by independently auditing the latest repository, validating the previous Gemini-generated work, and executing the highest-priority verified fixes.
