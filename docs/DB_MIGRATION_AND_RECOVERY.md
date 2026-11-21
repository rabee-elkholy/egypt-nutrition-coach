# Database Migration, Backup & Disaster Recovery

This document outlines the schema migration pipeline, atomic dual-write storage, backup/export workflow, and disaster recovery runbook for **CuraFit** on **Cloudflare D1**.

- **Cloud Dev Database (`dev` branch):** `curafit-db-dev` (`database_id`: `0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`, full clone of Production D1).
- **Production Database (`main` branch):** `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab`).

---

## 1. Drizzle SQL Migrations (`drizzle/`)

All migrations in `drizzle/` (indexed by `drizzle/meta/_journal.json`) are **append-only, forward-only, and idempotent**:

| Migration File | Purpose | Tables & Indexes |
| :--- | :--- | :--- |
| `0000_purple_solo.sql` | Core account state & idempotency receipts | `coaching_accounts`, `coaching_requests` |
| `0001_sweet_talon.sql` | Nutrition plan archive & change audit log | `coaching_changes`, `coaching_plans` |
| `0002_woozy_spitfire.sql` | Workout plan archive | `coaching_workout_plans` |
| `0003_production_readiness.sql` | Indexed entity tables, KMM outbox sync, session/consent tracking | `coaching_food_entries`, `coaching_water_logs`, `coaching_weight_logs`, `coaching_workout_logs`, `coaching_sessions`, `coaching_checkins`, `coaching_sync_outbox`, `coaching_auth_sessions`, `coaching_account_consents` + `(user_id, date)` / `(user_id, revision)` indexes |
| `0004_coaching_journey.sql` | Coaching follow-up agreements & barrier feedback | `coaching_cases`, `coaching_feedback` + `(user_id, date)` indexes |
| `0005_native_auth.sql` | Native Cloudflare D1 users & rotating refresh tokens | `coaching_users`, `coaching_refresh_tokens` + `(user_id, session_id)` / `(expires_at)` indexes |

---

## 2. Expand -> Dual-Write -> Backfill -> Verify Strategy

1. **Expand:** Migrations use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for safe re-application.
2. **Dual-Write:** `server/store.mjs` (`saveAccount`) executes a single atomic `db.batch(...)` guarded by optimistic-concurrency CAS (`revision` + `_commitToken`), writing simultaneously to `coaching_accounts`, normalized relational tables, `coaching_sync_outbox`, `coaching_changes`, and `coaching_requests`. Active JSON documents exceeding 900 KB trim logs older than 95 days while preserving complete history in relational tables.
3. **Backfill:** `POST /v1/account/backfill` (`backfillAccountToNormalizedTables`) idempotently migrates legacy aggregate rows into normalized tables without dropping IDs or dates.

---

## 3. Applying Migrations & Promoting Schema Changes (`dev` -> `main`)

Always apply and verify migrations on **Cloud Dev** before promoting to **Production**:

```powershell
cd e:\Egypt_Nutrition_Local\website\dist

# 1. Inspect / backup before remote schema changes
npx.cmd wrangler d1 time-travel info curafit-db-dev --env dev --config wrangler.jsonc
npx.cmd wrangler d1 time-travel info egypt-nutrition-coaching --config wrangler.jsonc

# 2. Apply to Cloud Dev (dev branch)
npm.cmd run deploy:d1:dev
npm.cmd run deploy:dev

# 3. Export pre-migration Production backup and promote on main
npx.cmd wrangler d1 export egypt-nutrition-coaching --remote --output=backup-pre-deploy.sql --config wrangler.jsonc
npm.cmd run deploy:d1:prod
npm.cmd run deploy:prod
```

---

## 4. Backup, Time Travel & Rollback Runbook

- **Cloudflare D1 Time Travel:** Supports point-in-time inspection (`wrangler d1 time-travel info <db>`) and restoration (`wrangler d1 time-travel restore <db> --timestamp="<ISO-8601>"`) within the D1 retention window.
- **Full SQL Exports (`wrangler d1 export --remote`):** Note that Cloudflare D1 enforces a single SQL statement length ceiling (~100 KB). When importing SQL exports containing large serialized plan rows (>60 KB) via `wrangler d1 execute --file`, split long `body` string literals into `INSERT` + concatenated `UPDATE ... SET body = body || '...'` chunks and strip `sqlite_sequence` writes so imports succeed atomically without hitting `SQLITE_TOOBIG`.
- **Worker Code Rollback:** `npx.cmd wrangler rollback --config wrangler.jsonc` restores the previous Worker deployment immediately; additive migrations (`0003`–`0005`) remain backward-compatible with prior schemas.
