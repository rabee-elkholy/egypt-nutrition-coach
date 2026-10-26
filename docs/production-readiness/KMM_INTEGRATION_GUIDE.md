# KMM integration readiness

Status: PARTIALLY_IMPLEMENTED; not yet cleared for final integration acceptance. See API_CONTRACT.md and the existing `docs/KMM_BACKEND_INTEGRATION.md`, whose claims must be checked against current tests.

Use verified bearer tokens with the deployed issuer/audience settings; the current local harness uses a trusted internal identity adapter, so its journeys do not validate mobile login or refresh. Token issuance/refresh requires a provider decision and separate lifecycle evidence.

For an offline mutation queue, retain the original action, payload, idempotency key and base revision. Retry the same request after uncertain transport delivery. On 409, distinguish stale revision from reused-key/different-content errors, fetch current state/changes and explicitly rebase a new command; do not silently overwrite. Local E03/E04 tests exercise finite retry, reordered JSON and two-device conflict cases. Actual native queue persistence and real-network behavior are not measured here.

Bootstrap can return lightweight plan references, with lazy plan/history fetches. Store server ETags as opaque strings. Preserve unknown nutrient values as nullable types; distinguish a missing diary day from a reported zero. Server dates depend on the user's timezone, so do not derive calendar days by truncating UTC timestamps.

Outstanding release gates: exhaustive typed request/response/error schemas, Kotlin serialization fixtures, provider token lifecycle, paging/sync completeness across long histories, deprecation policy, and integration by the separate Android/iOS team. No mobile UI is implemented in this assignment.

Page sync deltas with nextSeqCursor/afterSeq, because a revision may contain more than 100 changes. Do not advance only the revision cursor past an incompletely downloaded revision.

For permanent account deletion, call POST or DELETE /v1/account/delete with {"confirm":true} outside simulation mode. The response describes tables/namespaces cleared; minimal revocation tombstones remain. In-app reset of a simulation uses its existing simulation commands, not account deletion.

Fetch GET /v1/coaching/brief for Arabic personal nutrition/training/follow-up notes. Cache its ETag as opaque, and upsert each current note by id when revision/content changes. An accepted adjustment updates the same daily training-note identity. GENERATED and NOT_MEASURED fields do not acknowledge notification delivery or UI rendering. Native clients must not count repeated fetches as new notifications or claim user reading from an API response.

Bootstrap's nutrition reference is activeNutritionPlanRef.id, with end_date; the full-state view uses active_plan_id. After an extended absence, the existing plan can be expired. Explicit renew_plan starts at the current user-local date and retains the old plan. A normal-account return/retry journey verifies this boundary, the original archive and stale-device/ownership responses; no simulation command is needed. It is one locally clock-controlled journey, not a native-client integration test.

For routine tracking mutations, opt into the existing lightweight command receipt with `Prefer: return=minimal` or `POST /v1/commands?view=receipt`. Apply its revision/affected deltas and use the brief, bootstrap and paginated history for views instead of requesting a complete account after every mutation. On an isolated copy of a measured 365-day account, 30 interleaved requests per mode produced p95 JSON sizes of 747,359 bytes for the default full response and 419 bytes for a minimal receipt. Five receipt retries preserved idempotency; 60 original commands produced exactly 60 revisions. These are local payload measurements, not a mobile-network SLA. Full responses remain compatible.

Handle `PLAN_CONSTRAINTS_UNMET` as a non-retryable coverage/search outcome, using fieldErrors for `NO_ELIGIBLE_MEAL_FOR_SLOT`, `NO_CANDIDATE_WITHIN_DIET_LIMITS`, and `NUTRIENT_TARGETS_UNMET`. Do not silently alter budget/diet or loop automatic retries. A failed generation leaves the account unonboarded. Rejected nutrition decisions are acknowledged while their nutrition evidence is unchanged; new evidence permits a fresh review.

A late idempotent replay preserves the original `affected` entities and original `commandReceipt.revision`, while the outer `revision` can describe a newer account. Do not treat old affected payloads as new mutations or advance a fully consumed sync cursor to the outer revision. Compare the original receipt revision with local entity state and fetch unseen deltas from the retained cursor. Existing receipt replay and two-device tests cover the server distinction; the actual native queue/cache still needs integration verification.
