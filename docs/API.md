# HTTP API v1

JSON over HTTPS. Existing Sites identity is used for the preview. Mobile login work is deferred; the untrusted caller must never choose `oai-authenticated-user-id` in a public production mobile gateway. No new auth endpoint is added here.

## Reads

| Endpoint | Response |
| --- | --- |
| `GET /v1/health` | Public runtime/API/engine version |
| `GET /v1/state` | Account revision, profile/preferences, active plans, plan references, diary/logs, recovery, eligibility confirmations, legacy planQuality warnings, last review, pending proposals, serverDate, next 14 scheduled sessions |
| `GET /v1/foods?q=` | Up to 40 reference ingredients: key, name, state, values/100g, source |
| `GET /v1/food-diary?date=YYYY-MM-DD` | Actual entries, nullable totals, day completion and target energy |
| `GET /v1/meal-alternatives?mealId=` | Up to 6 validated alternatives with template ID and nutrient differences |
| `GET /v1/exercise-alternatives?dayIndex=&exerciseId=` | Up to 6 exercises matching pattern/level/equipment/muscle |
| `GET /v1/exercises?q=&muscle=&equipment=&offset=` | Catalog items, total and nextOffset; 30/page |
| `GET /v1/exercises/{id}` | Full exercise (URL-encode IDs such as `oedb:12`) |
| `GET /v1/catalog/manifest` | Pinned source version/hash/license/count |
| `GET /v1/catalog/muscles` | Muscle taxonomy and English labels |
| `GET /v1/plans` / `GET /v1/plans/{id}` | Nutrition version references / full owned plan |
| `GET /v1/workout-plans` / `GET /v1/workout-plans/{id}` | Workout version references / full owned plan |
| `GET /v1/sync/changes?after=revision` | Up to 100 change metadata records, currentRevision, nextCursor, hasMore |

A sync consumer reads state to refresh changed aggregates; the change stream is metadata rather than a full replayable event log. Account partitioning applies to every archive and cursor query.

## Writes

`POST /v1/commands` with `Content-Type: application/json`, a unique `Idempotency-Key` per logical action, and the revision last read from state:

```json
{"revision":12,"action":"food_entry","payload":{"source":"planned","date":"2026-10-23","mealId":"meal-id","slot":"lunch","quantity":0.5}}
```

| Action | Payload |
| --- | --- |
| `generate` | Existing onboarding draft: age/sex/height/weight/goal/targetWeight/goalPace/serviceTrack/dailyActivity, regional diet/meal/budget/exclusions and workout preferences; optional weekdayConvention; workouts_only requires healthConfirmed:true; nutrition_only muscle_gain requires externalTrainingDays |
| `confirm_health` | Legacy workout-only account: `{healthy:true,injuryFree:true}` after explicit confirmation |
| `confirm_schedule` | Legacy ambiguous calendar: `{dayMap:{"oldDayIndex":newSundayZeroIndex,...}}`; exactly one distinct new day per existing session; creates versions, keeps actual dates, archives old one-off moves for explicit reapplication |
| `renew_plan` | `{}` after the current nutrition week expires |
| `food_entry` | `source:"planned"`, mealId/date/slot/quantity; or `source:"ingredient"`, key/grams/date/slot; or `source:"manual"`, name/date/slot/energy and optional protein/carbs/fat |
| `food_delete` | `{id}` actual entry ID |
| `food_complete` | `{date,complete:boolean}` |
| `food` | Legacy daily total `{date,energy,complete}`; cannot overwrite a day containing detailed entries |
| `food_switch_to_entries` | `{date,confirm:true}` explicitly archives the legacy total and starts detailed logging for that day; it does not invent individual entries from the total |
| `replace_meal` | `{mealId,templateId}` from current validated alternatives |
| `weight` | `{kg,date?}`; same-date entry is corrected rather than duplicated |
| `recovery` | sleepHours 0–24, sleepQuality 1–5, fatigue 1–5; optional stress 1–5, soreness 0–10 and sorenessByRegion map; required pain/illness/redFlags booleans; optional painRegions array |
| `workout` | exerciseId/dayIndex/date?, sets `[{kg,reps,rir?,pain?}]`, increment?, bothSides:boolean; same exposure date/day/exercise is corrected; unilateral/alternating work requires bothSides:true for progression and paired completion |
| `session` | dayIndex/date/status `completed`, `partial` or `missed`; any actual work requires duration 1–240 min and rpe 0–10; returned completionRatio uses actual vs snapshotted expected sets, below 80% becomes partial |
| `replace_exercise` | dayIndex/exerciseId/alternativeId from current validated alternatives |
| `reschedule` | dayIndex/toDate within the next 14 days; produces an approval proposal |
| `review` | `{}` creates explained review and optional proposal |
| `adaptation` | `{id,accept:boolean}`; accepts only a current, unexpired proposal |

Successful writes return refreshed state with an incremented revision. A same-key retry returns the latest state plus `commandReceipt:{revision,replayed:true}` and `Idempotency-Replayed:true`; this does not mean a second mutation occurred. Use the original request body/key unchanged after a network timeout. A fresh user action needs a fresh key.

Idempotency digests use the raw body bytes, so preserve serialization as well as semantic content. The browser retries an uncertain write with the same bytes/key and defers unrelated mutations until resolution. Proposals require both their exact baseRevision and unexpired validity; recovery and eligibility are rechecked on acceptance. A failed generation/adaptation does not commit a partial account or relax preferences.

Errors: 400 invalid values/eligibility/rules/JSON/UTF-8, 401 missing preview identity, 403 unexpected Origin, 404 unknown owned resource, 405 unsupported health method, 409 stale revision/proposal or key reused with different content, 413 payload/account capacity, 415 wrong content type, 500 unexpected internal failure, 503 database unavailable. JSON command bodies are limited to 40,000 streamed bytes; revisions/cursors must be nonnegative safe integers. A conflict requires refreshing state; don't silently overwrite with stale input.

Dates use `YYYY-MM-DD`; `serverDate` follows Africa/Cairo for this preview. Past diary/measurement entries are allowed for 90 days; future actual logs are rejected. Replacements affect plan versions, never frozen actual intake. Region keys are defined by `MUSCLE_REGIONS` in `coaching-shared.mjs`.

All canonical weekday indexes are Sunday=0 through Saturday=6. `generate` accepts `weekdayConvention:"saturday_0"` for the unchanged legacy onboarding and converts selectedWorkoutDays, dayLocations and externalTrainingDays once. Omission defaults to `js_sunday_0` for API clients. Saved profiles/preferences always carry `weekdayConvention:"js_sunday_0"`; a legacy saved account without that marker requires `confirm_schedule` rather than guessed conversion. Do not use the legacy UI convention in KMM without the explicit marker.

Exercise alternatives require a valid dayIndex, respect the full session's time budget including both sides, and may return an empty items list. Nutrition alternatives can also be empty under strict constraints. Nutrition day.targets is the historical target for that day; top-level plan.targets can describe a later accepted adjustment. A muscle_gain target equal to current weight is accepted as recomposition, beginning at estimated maintenance.
