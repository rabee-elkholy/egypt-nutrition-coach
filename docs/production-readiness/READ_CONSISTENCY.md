# Consistent inputs for personal follow-up

A real local D1 regression reproduced an account at revision 1 with water history from a completed revision 2 write. Independent aggregate/history queries allowed a competing transaction between reads. This could attach personal advice and conditional validators to the wrong revision.

Normalized account hydration now re-reads the aggregate revision/body together with all six normalized history collections in one D1 batch. This reduces separate binding calls and prevents that mixed view. It does not establish production throughput or eliminate the need to fetch immutable plan archives. Cloudflare documents [batch transactions and reduced network round trips](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

The deterministic race injection executes real migrated D1 queries. It completes a competing write after the first aggregate read and before history hydration. The returned diary and revision now both belong to revision 2. Concurrent deletion returns an empty account at that boundary, and a failed snapshot rejects the read with 503 instead of returning partial history.

Evidence: `evidence/account-snapshot-before-fix/` records all three subtests failing; `evidence/account-snapshot-after-fix/` records all three passing (Node totals include the parent, 4 tests). The first complete suite exposed a regression-test injection that now ran before the newly introduced read batch, instead of before the backfill write. Its injection was moved to the original write boundary; the 409 rejection and preserved newer log assertions remain intact. The corrected complete check records 229 pass, zero fail/skip in `evidence/coherent-followup-verified-check/`.

This is local verified behavior. It neither retroactively validates the frozen cohort nor changes deployed production.
