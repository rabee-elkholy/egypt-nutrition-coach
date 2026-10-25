# Release gates

| Gate | Current status | Required closure |
|---|---|---|
| Evidence integrity | PARTIALLY_IMPLEMENTED | Corrected full source/calendar/factual/persisted checks pass; broader evaluator semantic/clinical mutation coverage remains incomplete; archive integrity is separate |
| Core product / safety | PARTIALLY_IMPLEMENTED | Trace all supported scopes, justified transitions, quality gaps and finite safety matrix |
| Authentication / privacy / isolation | PARTIALLY_IMPLEMENTED | Provider login/refresh + production configuration, distributed protections and scoped independent review |
| Data integrity / recoverability | PARTIALLY_IMPLEMENTED | Corrected full nutrition/workout archive checks and local logical restore pass; production backup/key/recovery and broader failure-mode evidence remain open |
| KMM API contract | PARTIALLY_IMPLEMENTED | Exhaustive response/error contracts and Kotlin serialization/integration fixtures |
| Operations / rollback / monitoring | MISSING | Implemented and measured operational controls; production execution requires owner authorization |
| Performance / capacity | PARTIALLY_IMPLEMENTED | Domain/D1/dispatch/loopback and bounded 1,095-day food-history measurements exist; sustained, mixed maximum-history and production/mobile capacity remain unmeasured |
| Specialist approval | BLOCKED | Qualified human review where required by intended health/medical scope |
| Remote source freshness | VERIFIED_AT_CHECKPOINT | Actual fetch and ff-only pull succeeded on 2026-10-25: local main six ahead / zero behind at d86f3a8; reconcile again before a later authorized push |
| Personal follow-up | PARTIALLY_IMPLEMENTED | Decision continuity, factual notes, actual brief HTTP and consistent reads tested; fresh long run, persisted notification lifecycle, delivery/rendering and real-user perception remain open |

No unexecuted test or absent operational proof can satisfy a gate. Synthetic simulations cannot establish clinical efficacy or production capacity. Conditional approval requires explicit scope and remaining conditions, not a blanket “ready” label.
