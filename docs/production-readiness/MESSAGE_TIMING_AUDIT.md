# Message wording and appearance audit — 2026-10-27

Scope: current in-app personal briefs, agreement inbox, review banners, workout-history copy, daily tips and refresh behavior. Source baseline: `29819680e927a961329671f6517caf80cdb8c570`. This is a targeted audit, not a new 100-person/90-day cohort or a clinical review of every educational claim.

## Corrections

1. A saved agreement could replace fresh short-sleep or fatigue guidance. Those observations now retain priority; the agreement remains available in its inbox.
2. Questions derived from old evidence never expired. Unanswered questions now expire after seven elapsed days, leave the daily brief, and are replaced only when fresh qualifying evidence exists. Accepted agreements keep their promised review dates.
3. Missing program IDs compared equal and allowed old-program missed sessions to trigger questions. Matching now requires an actual program ID or the current plan ID.
4. A page left open retained yesterday's messages and expired recommendations. Visible real-mode pages now check the compact server bootstrap every minute and on return to the page. Full state is fetched only when revision/date changes or a known expiry boundary is crossed. Server time is authoritative; simulation never advances from device time.
5. Refresh testing exposed a draft-key collision between nutrition and training feedback forms. Draft keys now include the domain. Refresh waits while editing or while a write is pending, preserves drafts and open details, ignores obsolete responses, and warns when refresh fails.
6. Past workout logs could produce “today/tomorrow” soreness wording. Historical logs now show their actual date without inferring current soreness; unsupported/future/old-plan history is excluded. No logged session is described as completed merely because a plan exists.
7. An expired nutrition plan's first day appeared under “today's meals.” Only an exact date match is labelled today; the renewal action remains available.
8. Expired adaptation proposals still had acceptance buttons. They now show a request for a fresh review instead. The backend already rejects expired acceptance.
9. Future nutrition changes always said “tomorrow.” They now state the effective date.
10. Header copy could claim exercise readiness without a fresh check-in, describe illness as local pain, or discuss exercise on a nutrition-only track. It now respects readiness, the actual hold reason and enabled track.

## Appearance rules inspected

| Surface | Trigger and time rule | Suppression / precedence |
|---|---|---|
| Nutrition brief | Today's food record, 14 local dates of weights, active plan dates | Expired plan first; explicit recent hunger and remembered decline before ordinary summaries; no invented meal adherence |
| Training brief | Current-program today's session/schedule and server-derived recovery | Stop/hold before fatigue, completed/partial/missed sessions, readiness and scheduled/rest guidance |
| Recovery habit note | Reports at or before server time, at most 24 elapsed hours old | Safety, short sleep and fatigue before generic tips/agreements; exactly 24h remains valid, +1ms expires |
| Return/activity | Actual recorded activity today and previous recorded date; seven local dates for activity count | Missing logs never prove missed habits |
| Feedback ratings | Latest explicit rating separately for each metric across today and previous two local dates, same plan/goal context | Omission does not erase or extend a rating; future local dates excluded |
| Barrier proposal | Explicit barrier report; seven elapsed days to respond | Repeated report does not duplicate an active agreement; context changes retire it |
| Automatic question | Two distinct recorded missed-session or low-adherence dates in the last seven local dates | No inference from absent logs; seven-day question expiry; new evidence required to renew |
| Accepted agreement | Local review date: next day for pain, three days for other barriers | No early positive outcome; completed/declined/superseded excluded; overdue persists until response/context change |
| Adaptation banner | Pending unexpired proposal, using server timestamp | Expired action buttons removed; existing backend acceptance guard retained |
| Workout-history note | Current/compatible plan logs on or before today | Historical date explicitly shown; today's wording requires today's log |
| Daily information | Deterministic date/category selection; explicit “more” rotates | General information is labelled separately from personal observations; not a scheduled notification |
| Eight-week split review | 56 days since first qualifying completed session | Recovery, current-program attendance and recent coverage gate the suggestion; not an automatic split change |

## Validation and evidence

- New `tests/message-timing.test.mjs`: 10 tests, including all 13 domain/barrier choices, six zones × five dates around DST transitions, exact proposal/recovery boundaries, context changes, terminal states, rating expiry and evidence-driven question renewal.
- Initial regression capture: 3 passed / 3 failed. The three failures reproduced agreement-over-sleep, old-program matching and immortal questions before fixes.
- Full release check: **308 passed / 0 failed / 0 skipped**, including existing HTTP/D1 coaching lifecycle, brief and safety suites. Final evidence: `evidence/message-timing-final-check-v3-20261027/`.
- Browser timing suite: 390px and 1280px; controlled server snapshots over real locally generated Worker/D1 state. Checks date rollover, expired plan headings, expired proposal buttons, draft preservation, editing deferral, focus refresh, historical workout date, errors and overflow. These injected time boundaries are UI tests, not claims of production time travel.
- Existing real local Worker/D1 browser journey also passed both widths: feedback, acceptance, persisted reload and outcome follow-up (`evidence/message-timing-journey-browser-20261027/`).
- Message-library census: nutrition 39 variants, training 61, motivation 26, soreness/pre-session 5, daily tips 65 (196 total). Existing template tests validate rendering; the legacy nutrition/training/motivation pools are not the current personal-brief UI. Count is not a claim that 196 distinct messages were delivered.
- Failed intermediate runs are retained, including the draft-collision discovery and an asynchronous browser-test synchronization failure subsequently corrected.

## Limits

There is no hour-of-day delivery scheduler or push provider. Inbox metadata remains `channel: in_app`, `pushConfigured: false`, `deliveryStatus: NOT_SENT`. Minute refresh depends on browser visibility/network and is deferred during editing; it is not a notification SLA. No claim of human readership, clinical validation, or exhaustive absence of future message defects is made. No schema migration is required by these changes.

## Publication

Deployed successfully to the canonical `egypt-nutrition-coach` Worker, version `96fd8e63-6284-4351-ba5d-e44329614896`. Read-only live health, capabilities and inbox checks returned HTTP 200; all three changed public modules exactly matched tested local bytes. Evidence: `evidence/message-timing-live-20261027.json`. No database migration was needed.
