# Performance & Payload Benchmark Report

This document summarizes payload reductions, search/planner optimizations, and local HTTP + SQLite/D1 benchmark methodology for **CuraFit API v1**.

- **Benchmark Command:** `npm run benchmark` (`node scripts/benchmark-load.mjs`)
- **Generated Output:** `outputs/benchmark-report.json`

---

## 1. KMM Payload Reduction (vs Full Web State Snapshot)

The legacy Web UI `GET /v1/state` payload returns the complete weekly meal plan and full account snapshot (~500 KB) for browser rendering. For mobile clients (KMM), CuraFit provides `/v1/bootstrap` and `?view=receipt` (now wrapped in the uniform `{ ok, data, meta }` envelope):

| Endpoint / Flow | Response Shape | Approximate Raw Size | Primary Mechanism |
| :--- | :--- | :---: | :--- |
| **`GET /v1/bootstrap`** | Profile refs + plan refs + `todaySummary` | ~3.25 KB (`> 99.3%` reduction vs `/v1/state`) | Strips nested plan ingredients; fetches plans lazily |
| **`GET /v1/bootstrap` (`If-None-Match` hit)** | `304 Not Modified` | `0 B` (`100%` transfer reduction) | Server revision + date ETag validation |
| **`POST /v1/commands?view=receipt`** | Delta receipt (`commandReceipt` + `affected`) | ~535 B (`~99.9%` reduction vs `/v1/state`) | Avoids resending full weekly plans after logs |
| **`GET /v1/state`** | Full account + weekly nutrition/workout plans | ~500 KB | Preserved for clean Web UI User Stories |

---

## 2. Deterministic Engine & Food Search Optimizations

- **Weekly Nutrition Planner (`makeWeek`):** Uses fast scalar macro accumulation inside meal-fitting rounding loops before computing final exact decimal `BigInt` (`totalsForParts`) summaries once on the winning candidate.
- **In-Memory Arabic/English Food Search (`server/food-catalog.mjs`):** Pre-normalizes 3,291 catalog entries at Worker startup (`al-` / prefix tokenization and colloquial synonyms), keeping catalog search latency in single-digit/low-double-digit milliseconds in memory.

---

## 3. Local HTTP + D1 Latency & Capacity Considerations

- **Local Benchmark (`npm run benchmark`):** Exercises real HTTP dispatch (`server/worker.mjs`) against Miniflare/SQLite with JWT verification, atomic D1 `db.batch` writes, outbox inserts, and idempotency storage. Exact current numbers are recorded in `outputs/benchmark-report.json` on each run.
- **D1 Growth Management:** Dual-writes append to indexed entity tables and `coaching_sync_outbox` while trimming active `coaching_accounts` JSON logs older than 95 days once account documents exceed 900 KB, keeping hot reads fast as history grows.
