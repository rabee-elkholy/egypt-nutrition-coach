# CuraFit API v1 — Postman Collection & Cloudflare Workers Guide

This directory contains the ready-to-use **Postman Collection v2.1** (`16` folders / `140` endpoints) and **three environment presets** (**Cloud Dev**, **Production**, and **Local Dev**) running natively on **Cloudflare Workers + Cloudflare D1 + Cloudflare R2** with direct Google/Apple OIDC verification and zero third-party BaaS IdP dependency.

## Files

| File | Description |
| :--- | :--- |
| `CuraFit_API.postman_collection.json` | Complete Postman v2.1 collection covering all routes and `/v1/commands` actions with automated JWT, `revision`, and `Idempotency-Key` handling |
| `CuraFit_Cloud_Dev.postman_environment.json` | Cloud Dev environment (`dev` branch) -> `https://curafit-api-dev.egypt-nutrition-coach.workers.dev` bound to D1 `curafit-db-dev` (full clone of Production D1) |
| `CuraFit_Production.postman_environment.json` | Production environment (`main` branch) -> `https://curafit-api.egypt-nutrition-coach.workers.dev` bound to D1 `egypt-nutrition-coaching` |
| `CuraFit_Local_Dev.postman_environment.json` | Local Miniflare environment (`npm run dev`) -> `http://127.0.0.1:8787` |

## Quick Start in Postman

1. Open Postman and click **Import** (or open the workspace directly).
2. Import `CuraFit_API.postman_collection.json` along with `CuraFit_Cloud_Dev.postman_environment.json`, `CuraFit_Production.postman_environment.json`, and `CuraFit_Local_Dev.postman_environment.json`.
3. Select **CuraFit — Cloud Dev** from the environment selector in the top-right corner for development and QA testing.
4. Run requests in sequence (collection variables auto-populate from `res.data` and `res.meta`):
   1. `01. System & Health` -> **Health Check** and **Capabilities Manifest**
   2. `02. Authentication (Google & Apple OIDC)` -> **Sign In / Register with Google OIDC** (or **Sign In / Register with Apple OIDC**) using a signed OIDC ID/identity token, which automatically saves `accessToken`, `refreshToken`, `sessionId`, and `userId`
   3. `03. Onboarding & Pre-Screening` -> **Pre-Screening Eligibility Check** then **Generate Initial Plan**, which saves `revision`, `activePlanId`, `activeWorkoutPlanId`, `todayDate`, `sampleMealId`, `sampleDayIndex`, `sampleExerciseId`, and `sampleRescheduleDate`
   4. Exercise any domain endpoints across Nutrition, Hydration, Weight, Workouts, Recovery, Coaching, Catalog, Sync, and Privacy/GDPR.

## Uniform KMM Envelopes & Automation

- **Success (`2xx`):** `{ "ok": true, "data": T, "meta": { "requestId", "serverTime", "revision"? } }`
- **Error (`4xx` / `5xx`):** `{ "ok": false, "error": { "code", "message", "params", "fieldErrors", "retryable", "details"? }, "meta": { "requestId", "serverTime" } }`
- **Pure-English Error Contract:** All error messages returned by the API are English-only; client apps localize user-facing copy by `error.code` and `error.params` using [`../docs/ERROR_CODES.md`](../docs/ERROR_CODES.md) and [`../contracts/error-codes.json`](../contracts/error-codes.json).
- **Automatic `Idempotency-Key`:** The collection pre-request script generates a fresh UUID before each request.
- **Automatic `revision` & JWT Capture:** Post-response scripts unwrap `res.data` and `res.meta.revision` to keep optimistic concurrency and Bearer tokens updated automatically.

## Development & Promotion Flow (`dev` -> `main`)

```powershell
cd e:\Egypt_Nutrition_Local\website\dist
npm.cmd run check
npm.cmd run deploy:dev     # Deploy and verify on Cloud Dev (curafit-api-dev)
npm.cmd run deploy:prod    # Promote to Production (curafit-api) after fast-forward merge to main
```

For local Miniflare development:

```powershell
cd e:\Egypt_Nutrition_Local\website\dist
npm.cmd run build
npm.cmd run dev
```
