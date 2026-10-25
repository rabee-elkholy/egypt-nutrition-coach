# Static endpoint census

OpenAPI 3.1.0; contract 1.0.0. 41 documented paths / 42 operations. Static inventory, not runtime conformance-test execution.

| Path | Methods | Declared response statuses |
|---|---|---|
| /v1/health | GET | GET: 200 |
| /v1/capabilities | GET | GET: 200 |
| /v1/bootstrap | GET | GET: 200,304,401 |
| /v1/state | GET | GET: 200,304,401 |
| /v1/commands | POST | POST: 200,400,401,409,413,429 |
| /v1/foods | GET | GET: 200 |
| /v1/foods/{id} | GET | GET: 200,404 |
| /v1/beverages | GET | GET: 200 |
| /v1/foods/calculate | POST | POST: 200 |
| /v1/food-diary | GET | GET: 200 |
| /v1/water-logs | GET | GET: 200 |
| /v1/weight-logs | GET | GET: 200 |
| /v1/workout-logs | GET | GET: 200 |
| /v1/sessions | GET | GET: 200 |
| /v1/checkins | GET | GET: 200 |
| /v1/plans | GET | GET: 200 |
| /v1/plans/{id} | GET | GET: 200,404 |
| /v1/plans/{id}/days/{date} | GET | GET: 200,404 |
| /v1/workout-plans | GET | GET: 200 |
| /v1/workout-plans/{id} | GET | GET: 200,404 |
| /v1/exercises | GET | GET: 200 |
| /v1/exercises/{id} | GET | GET: 200,404 |
| /v1/meal-alternatives | GET | GET: 200 |
| /v1/exercise-alternatives | GET | GET: 200 |
| /v1/progress/summary | GET | GET: 200 |
| /v1/coaching/brief | GET | GET: 200,304,401,429,503 |
| /v1/eligibility | POST | POST: 200 |
| /v1/sync/changes | GET | GET: 200 |
| /v1/auth/session | GET | GET: 200 |
| /v1/auth/revoke | POST | POST: 200 |
| /v1/auth/claim-anonymous | POST | POST: 200,409 |
| /v1/account/export | GET | GET: 200 |
| /v1/account/delete | POST, DELETE | POST: 200,400,401,415,503; DELETE: 200,400,401,415,503 |
| /v1/account/consents | POST | POST: 200 |
| /v1/wearables/ingest | POST | POST: 200 |
| /v1/activity-logs | GET | GET: 200 |
| /v1/notifications/preferences | GET | GET: 200 |
| /v1/entitlements | GET | GET: 200 |
| /v1/catalog/manifest | GET | GET: 200 |
| /v1/catalog/muscles | GET | GET: 200 |
| /v1/account/backfill | POST | POST: 200 |

Source: evidence/api-contract-census-current.json and current-api-contract-census execution logs. The earlier inventory is preserved.

CommandRequest.payload remains a generic object; action-specific DTOs and complete runtime error/response conformance remain incomplete. See API_CONTRACT.md.

The typed coaching brief is an on-demand view. Its declaration does not establish notification scheduling, delivery, rendering or reading.
