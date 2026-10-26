# Local performance measurements

Actual benchmark evidence: [local-benchmark-results.json](evidence/local-benchmark-results.json). Node v24.14.0, AMD Ryzen 7 8700G w/ Radeon 780M Graphics, 16 logical CPUs. SQLite version was not observable because local D1 forbids sqlite_version(); no version was invented. The full cohort was running concurrently on this computer.

| Scenario / measured layer | Samples | Concurrency | p50 ms | p95 ms | p99 ms | requests/s | Status counts |
|---|---:|---:|---:|---:|---:|---:|---|
| catalog search / DOMAIN_IN_PROCESS | 100 | 1 | 2.032 | 3.425 | 4.497 | 473.84 | {"200": 100} |
| SELECT account revision / LOCAL_D1_BINDING | 100 | 1 | 6.760 | 8.866 | 9.554 | 142.44 | {"200": 100} |
| sequential bootstrap / LOCAL_MINIFLARE_DISPATCH_WITH_D1 | 100 | 1 | 16.798 | 19.644 | 26.532 | 57.78 | {"200": 100} |
| concurrent bootstrap / LOCAL_MINIFLARE_DISPATCH_WITH_D1 | 100 | 10 | 157.409 | 168.294 | 175.242 | 62.70 | {"200": 100} |
| sequential receipt writes / LOCAL_MINIFLARE_DISPATCH_WITH_D1 | 50 | 1 | 42.253 | 47.229 | 55.149 | 23.61 | {"200": 50} |
| same-revision write contention / LOCAL_MINIFLARE_DISPATCH_WITH_D1 | 10 | 10 | 412.905 | 412.976 | 412.976 | 24.20 | {"200": 1, "409": 9} |
| rebased conflict recovery with new keys / LOCAL_MINIFLARE_DISPATCH_WITH_D1 | 9 | 1 | 42.741 | 45.995 | 45.995 | 23.27 | {"200": 9} |
| mixed five reads and five independent writes / LOCAL_MINIFLARE_DISPATCH_WITH_D1 | 10 | 10 | 269.617 | 269.995 | 269.995 | 37.02 | {"200": 10} |

The same-revision contention scenario intentionally returns nine 409 conflicts and one successful write. All nine rebased writes then succeed with new keys. Zero unexpected HTTP errors were recorded in the measured cases. Ordinary successful requests are timing samples, not test cases.

The benchmark legacy-generation control returned 200, so the older benchmark initialization is not asserted defective. Its unvalidated status collection and hard-coded SQLite version still cannot independently establish full performance claims.

No socket HTTP, staging, production edge or mobile network was measured by these dispatch scenarios. Large histories, sustained capacity and production recovery targets remain unmeasured. Virtual user-days are sequential histories, not simultaneous users. Empirical local quantiles do not establish a production SLA or maximum capacity.

## Actual loopback socket HTTP

A separate run used fetch over Miniflare's 127.0.0.1 HTTP listener. It is distinct from dispatchFetch and also recorded zero unexpected HTTP errors, one winning concurrent write, nine expected 409 conflicts and nine successful rebased writes.

| Scenario | Samples | Concurrency | p50 ms | p95 ms | p99 ms | requests/s |
|---|---:|---:|---:|---:|---:|---:|
| sequential bootstrap | 100 | 1 | 16.355 | 19.803 | 22.016 | 59.38 |
| concurrent bootstrap | 100 | 10 | 155.506 | 163.487 | 163.646 | 64.78 |
| sequential receipt writes | 50 | 1 | 43.766 | 54.434 | 61.847 | 22.21 |
| same-revision write contention | 10 | 10 | 181.814 | 182.058 | 182.058 | 54.69 |
| rebased conflict recovery with new keys | 9 | 1 | 38.419 | 51.813 | 51.813 | 24.53 |
| mixed five reads and five independent writes | 10 | 10 | 260.932 | 261.182 | 261.182 | 38.20 |

Source: evidence/socket-benchmark-results.json and local-socket-benchmarks execution logs. Public edge/JWT and mobile/production network latencies are separate scopes; this benchmark uses a synthetic trusted internal identity.

## Personal follow-up brief

The brief has been measured over actual loopback HTTP. Both runs use small synthetic accounts; the samples do not establish statistical improvement, production latency, large-history limits or a capacity ceiling.

| Source / scenario | Samples | Concurrency | p50 ms | p95 ms | p99 ms | Payload bytes |
|---|---:|---:|---:|---:|---:|---:|
| coaching-brief / sequential | 100 | 1 | 17.276 | 23.631 | 29.784 | 2,305 |
| coaching-brief / concurrent | 100 | 10 | 183.769 | 200.086 | 200.326 | 2,305 |
| coherent-brief / sequential | 100 | 1 | 15.815 | 23.055 | 23.709 | 2,322 |
| coherent-brief / concurrent | 100 | 10 | 148.206 | 174.599 | 286.072 | 2,322 |

Both captures record zero unexpected HTTP errors. The later capture includes the consistent aggregate/history read fix, with actual returned brief content retained. Source: evidence/coaching-brief-benchmark-results.json and evidence/coherent-brief-benchmark-results.json. Date-dependent wording changes payload length between captures.

## Directly seeded historical food logs

A separate actual loopback HTTP measurement checks account hydration and the brief against 0, 365 and 1,095 days of synthetic food history (four historical rows per day plus one current entry). GET state confirmed all 1 / 1,461 / 4,381 rows and the same account revision before measurement. The fixture inserts historical rows directly; it does not measure their command writes or sync completeness. A full cohort was running on the same computer.

| Historical days | Food rows including today | Concurrency | Samples | Brief p50 ms | p95 ms | p99 ms | Brief max bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0 | 1 | 1 | 40 | 14.124 | 17.736 | 19.142 | 1,995 |
| 0 | 1 | 5 | 40 | 70.572 | 72.412 | 72.470 | 1,995 |
| 365 | 1,461 | 1 | 40 | 31.783 | 39.668 | 46.035 | 1,995 |
| 365 | 1,461 | 5 | 40 | 168.065 | 245.050 | 245.201 | 1,995 |
| 1,095 | 4,381 | 1 | 40 | 59.403 | 71.628 | 136.244 | 1,995 |
| 1,095 | 4,381 | 5 | 40 | 285.207 | 295.609 | 295.668 | 1,995 |

All 240 measured brief responses returned HTTP 200 with expected revision and three notes. The full state response grew from 491,723 to 1,954,595 bytes, while the returned brief remained 1,995 bytes in this fixture. Backend processing still scales with hydrated history; a small response does not establish constant CPU/memory cost. Maximum food+water+workout+check-in histories together, sustained capacity and production/mobile conditions remain unmeasured.

Source: evidence/large-history-brief-results-v3.json; exact fixture text, its hash and command execution are retained. The first two attempts stalled during Miniflare binding initialization when run through Node inline evaluation. They were interrupted and retained. Executing the same bounded, instrumented fixture as a module file completed; no backend performance conclusion is drawn from those failed harness attempts.

## Observed historical writes and receipt payloads — 2026-10-26

Two real local HTTP histories executed 365 dates each, including 3,168 successful requests and 15 accepted calorie changes. Their original streamed raw responses independently pass integrity/calendar and selected factual checks. For the male path, first/last 30-day food-write p95 was 57.437 / 201.360 ms; brief p95 was 19.316 / 45.593 ms. The female path's corresponding figures were 67.745 / 107.797 ms and 19.802 / 37.584 ms. These are observational windows with changing history, operations and possible concurrent local-run contention, not controlled degradation or capacity estimates. A day has one food summary/weight/check-in; maximum mixed histories remain unmeasured.

A separate isolated copy of the completed male account tested 30 interleaved full/minimal water commands per mode, plus five idempotent minimal retries. All 67 HTTP requests succeeded, 98 checks passed, and the revision increased exactly 60 times while old health histories remained intact. Full vs minimal p95 JSON bytes: **747,359 vs 419**. Local dispatch p95: 81.820 vs 67.466 ms; fixed order/cache/contention prevents a causal latency claim. Default response compatibility is preserved; KMM can opt into existing receipts. Sources: annual-read-write-performance-20261026.json and audit-aged-command-receipts-20261026/measurement.json, retained locally.
