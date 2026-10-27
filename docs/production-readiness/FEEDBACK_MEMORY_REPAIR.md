# Partial feedback memory repair — 2026-10-27

On `fc6b8f6`, a recent hunger=5 / energy=1 report followed by a budget report with omitted ratings made `currentFeedback` return null ratings. Both the calorie proposal guard and its acceptance guard could lose the earlier evidence.

The current feedback view now selects the latest explicit value of each rating independently, within the existing domain, plan context and three-local-date window. Omission/null does not erase a prior observation. A newer explicit value replaces that metric only. Unrelated reports do not renew its expiry. Persisted reports remain unchanged; the derived view carries each rating's source feedback ID, observation date and timestamp. The hunger message uses the actual hunger observation date.

Validation:

- Six regressions: zero pass / six fail before repair; six pass after. Includes partial and null updates, independent rating replacement, expiry without renewal, context/domain/future-date isolation, proposal and acceptance guards, original-date messaging, and unchanged history.
- Complete `npm run check`: **298 pass / zero fail or skip**.
- Local ordinary Worker/D1 HTTP journey: **14 days / 52 requests / 10 checks**. Establishes an actual plateau proposal, persists adverse feedback, records an incomplete budget report, reloads state, verifies continued hold, then explicitly improves both ratings before accepting a new cut. Independent streamed census and selected factual checks pass.
- Coaching browser journey passes at widths 390 and 1280 through installed Microsoft Edge. The first attempt could not locate bundled Playwright Chromium; that failed log is retained.

Evidence is retained locally under `evidence/feedback-memory-*-20261027/` and `reports/simulation-100-users-90-days/audit-feedback-memory-http-20261027/`. No production user data is included in Git.

Deployment scope is the canonical Worker `egypt-nutrition-coach` and existing D1 `90fa62f1-7866-4156-ac29-f0aec4814bab`. Before applying the existing `0004_coaching_journey.sql` dependency, a complete D1 SQL export was saved outside the repository at `E:/Egypt_Nutrition_Local/audit-backups/2026-10-27-feedback-memory/before-deploy.sql`; restoring it into an in-memory SQLite database passed `integrity_check`. The existing migration applied successfully. The first deployment build encountered a Windows file lock held by the local QA server; QA was stopped and deployment retried. Final deployment and live verification are recorded in the local deployment evidence.

Deployment succeeded with version ID `8b1bbfd4-52f0-42fc-9c83-b49e5a58a3fa`. Live health, capabilities and coaching inbox return 200 with the expected behavior. Both modified public modules match the local source byte-for-byte by SHA256. Live verification is read-only; the full guard/persistence journey runs against local Worker/D1. See [compact verification results](FEEDBACK_MEMORY_RESULTS.json).

This closes the measured partial-feedback defect. Push scheduling/delivery, identity-provider integration and remaining production acceptance gates retain their previous scope.
