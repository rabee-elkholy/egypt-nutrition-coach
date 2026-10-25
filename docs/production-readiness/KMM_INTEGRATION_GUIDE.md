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
