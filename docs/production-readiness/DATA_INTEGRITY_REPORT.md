# Data integrity evidence

Local D1 migrations and atomic batch writes are exercised by API/E2E tests. Tests cover first-write races, anonymous ownership transfer, deletion during an already authenticated write, old-history backfill, stale backfill, original receipt replay and normalized log preservation. This is finite local coverage, not operational restoration evidence.

Historical fast-run active-ID membership: old run has missing nutrition snapshots for 87 users; new run has zero under the implemented membership check. Counts above 13 can be valid meal substitutions or accepted adaptations. The later full frozen-run audit checked all 1,236 nutrition snapshots/transitions against persisted D1, with zero failures; its broader temporal acceptance still failed independently.

New HTTP day bundles record original request/response bodies and response hashes. Each completed day ends with a real GET state reload; the verifier compares this response to the recorded final state. Cross-day revisions, identity, idempotency context, current plan membership, duplicate IDs, generated message provenance and file hashes are independently checked. Final persisted_accounts.json records actual local D1 account revisions and aggregate byte lengths.

A local injected journal interruption/resume produced exactly the same checkpoint, memory and event sequence as an uninterrupted control. This verifies one recovery point, not every process/database/disk failure mode. The local logical restoration scope below is verified; production backup/export/import readiness remains unverified.

Phase 2 local restore proof is now available: evidence/local-restore-drill/stdout.log and reports/simulation-100-users-90-days/audit-local-restore-20261024/restore-proof.json. It checks all 14 coaching schemas and every synthetic row, authenticated encryption rejection of tampered input, migration rerun preservation and HTTP readback. Production export, encrypted scheduler, key custody/recovery and operational restoration remain unverified.

Account deletion defects were reproduced and repaired: erasure now covers the principal namespace, its simulation copy, and legacy anonymous claim namespaces recoverable through trusted claim tombstones. All are closed against in-flight saves in the same batch. New claims erase and close the source simulation copy. Five focused tests cover this scope and invalid quiet-hour values. Revocation markers deliberately remain; this is not a claim of deletion of every byte in backups or external services.

The full frozen baseline export contains 80,747 rows across all 14 coaching tables, with schemas, compressed table journals, per-table row counts and hashes. This export preserves diagnostic evidence; it is not a scheduled operational backup.

Concurrent-read regression: separate queries could attach revision-2 normalized logs to a revision-1 aggregate. The corrected D1 read batch takes aggregate/history together; real D1 injection tests cover competing writes, deletion at that boundary and snapshot failure. See READ_CONSISTENCY.md and commit 53d806a.

The corrected full run now independently verifies all 1,225 nutrition snapshots/transitions against actual D1, with zero failures. A canonical workout audit compares selected physical prescription fields to the complete hash-checked logical export: 192 snapshots / 28 transitions, zero failures. It checks immutable IDs, retained parents, command-backed forks, replacement effects and accepted volume changes; derived live load suggestions/localization are outside its canonical scope. Six mutation controls pass after correcting a shared-reference fixture bug; the failed attempt remains retained.

The corrected run's export contains 70,101 rows across 14 coaching tables. Export and direct D1 transition audit ran sequentially after simulation completion; the workout audit reads the verified export without opening a competing D1 runtime. No operational backup or production recovery is implied. A separate normal-account return journey verifies old archive byte equality and renewal/retry after 19 absent days without simulation commands.
