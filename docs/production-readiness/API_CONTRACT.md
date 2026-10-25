# API contract audit, phase 1

Versioned source: `contracts/openapi.yaml`, OpenAPI 3.1, info.version 1.0.0, application 0.12.0. E15 validates document structure, not exhaustive runtime conformance.

| Requested example | Actual implementation |
|---|---|
| POST /v1/eligibility | Exists, server/worker.mjs |
| POST /v1/commands | Exists: revision, action, payload and Idempotency-Key required |
| GET /v1/account | Absent; GET /v1/state and GET /v1/bootstrap supply current account views |
| GET /v1/meal-alternatives | Exists; query mealId |
| GET /v1/exercise-alternatives | Exists; query dayIndex, exerciseId |
| GET /v1/export | Absent; actual route GET /v1/account/export |
| DELETE /v1/account | Absent; actual route DELETE or POST /v1/account/delete |
| POST /v1/auth/refresh | Absent; no first-party refresh lifecycle established |

Do not implement missing aliases solely because they appeared as examples in a prompt. Stabilize the actual agreed integration surface first.

Critical contract requirements: null nutritional values retain null; dates are user-local YYYY-MM-DD while timestamps use UTC ISO strings; revision conflicts use 409; idempotency keys must be retained across retries. ETags returned by the server must be stored verbatim because they depend on revision and time. Export/delete, account claim, consent, catalog, plans/history, diary pagination and incremental changes exist with local tests. Completeness of all request/response error schemas, units, nullability and deprecation guarantees remains PARTIALLY_IMPLEMENTED.

The current OpenAPI uses broad object shapes for several aggregate responses and command payloads. It is not yet an exhaustive typed KMM contract. Exact examples should be taken from recorded HTTP journals, not invented successful responses.

Phase 2 privacy contract: POST/DELETE /v1/account/delete must be called outside simulation mode. It atomically clears owned account/simulation data, including recoverable legacy anonymous-claim namespaces, and retains revocation tombstones. A simulation query returns 400 ACCOUNT_DELETION_SIMULATION_FORBIDDEN. The response now has an explicit AccountDeletionResponse schema, including namespacesCleared. Both verbs have local regression coverage.

Incremental sync: persist nextSeqCursor and send afterSeq to continue deltas. A single revision can contain more than 100 entity changes; advancing only after to that revision can skip its remaining deltas. Revision remains the optimistic concurrency token, while the sequence cursor pages individual entities. Full native queue integration is still outstanding.

GET /v1/coaching/brief is now implemented with explicit CoachingBriefResponse/CoachingBriefNote schemas for KMM. It exposes deterministic personalized text from recorded state. Notes have stable namespace/day/role IDs; content and basedOnRevision update after real actions. ETags are scoped to the identity and actual note content, including expiry-sensitive changes. This is an on-demand view: it persists no notification, marks neither delivery nor rendering, and returns no notes for unonboarded accounts.
