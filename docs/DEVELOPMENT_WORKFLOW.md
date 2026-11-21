# CuraFit AI & Developer Workflow (`dev` -> `main`)

This document is the authoritative end-to-end engineering workflow for **CuraFit API v1** (pure Cloudflare Workers + Cloudflare D1 + Cloudflare R2 backend serving Kotlin Multiplatform Mobile Android & iOS clients). Every AI coding agent and developer working in this repository **must** follow this lifecycle strictly.

---

## 1. Canonical Environment & Branch Topology

CuraFit uses **strictly two Git branches (`dev` and `main`)** mapped 1:1 to **two Cloudflare Workers + D1 environments**, plus an optional local Miniflare server for rapid offline iteration:

| Environment | Git Branch | Cloudflare Worker | Cloudflare D1 Database (`database_id`) | Base URL | Postman Environment |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **Cloud Dev** | `dev` | `curafit-api-dev` | `curafit-db-dev` (`0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`, full clone of Prod D1) | `https://curafit-api-dev.egypt-nutrition-coach.workers.dev` | `CuraFit — Cloud Dev` |
| **Production** | `main` | `curafit-api` | `egypt-nutrition-coaching` (`90fa62f1-7866-4156-ac29-f0aec4814bab`) | `https://curafit-api.egypt-nutrition-coach.workers.dev` | `CuraFit — Production` |
| **Local Dev** | `dev` | Miniflare (`npm.cmd run dev`) | Local SQLite (`.wrangler/local-d1`) | `http://127.0.0.1:8787` | `CuraFit — Local Dev` |

- **Repository Root:** `e:\Egypt_Nutrition_Local\website\dist`
- **Remote Repository:** `https://github.com/rabee-elkholy/egypt-nutrition-coach.git`
- **Worker Entrypoint:** `server/cloudflare-entry.mjs` (built into `dist/server/cloudflare.js` by `npm.cmd run build`)
- **Postman Public Docs:** `https://documenter-api.postman.tech/view/9137216/2sBYPv2s1w` (`CuraFit API v1`, `16` groups / `123` endpoints)

---

## 2. Standard Feature & Fix Lifecycle (5 Phases)

Always develop, test, deploy, and validate on **`dev` (Cloud Dev)** before promoting anything to **`main` (Production)**.

### Phase 1 — Sync and Start from `dev`
```powershell
cd e:\Egypt_Nutrition_Local\website\dist
git checkout dev
git pull --ff-only origin dev
```

### Phase 2 — Implement Changes & Synchronize Contracts
Keep every API contract, error & coaching catalog, database schema, and Postman definition synchronized with code changes:

1. **API Error & Coaching Codes (`100% English Contract`):**
   - Never hardcode Arabic error or coaching messages in backend endpoints (`server/*.mjs`) or shared domain modules.
   - Add or update error definitions in `contracts/error-codes.json` and coaching definitions in `contracts/coaching-codes.json` (English-only `message`, `params`).
   - Run `node scripts/sync-error-contracts.mjs` to regenerate `docs/ERROR_CODES.md` and `docs/COACHING_CODES.md` and validate zero Arabic characters.
   - KMM mobile clients localize user-facing copy on-device by `code` and `params`.
2. **Endpoints, Request Schemas & Postman Collection:**
   - Update `contracts/openapi.yaml` and `scripts/generate-postman.mjs` (zero Arabic text or sample values in docs/collection).
   - Run `npm.cmd run postman:generate` to regenerate all 4 `postman/CuraFit_*.json` files and `docs/API_REFERENCE.md`.
   - Sync updated Postman Cloud collection/requests and republish public docs (`https://documenter-api.postman.tech/view/9137216/2sBYPv2s1w`).
3. **Database Schema Changes (Cloudflare D1 / Drizzle):**
   - Add append-only SQL migrations in `drizzle/` (indexed by `drizzle/meta/_journal.json`). **Never edit already-applied migrations.**
   - Apply and test on `curafit-db-dev` (`npm.cmd run deploy:d1:dev`) before touching Production.
   - Before running `npm.cmd run deploy:d1:prod`, always export a fresh Production D1 snapshot:
     ```powershell
     npx.cmd wrangler d1 export egypt-nutrition-coaching --remote --config wrangler.jsonc --output backup-pre-deploy.sql
     ```
4. **Local Miniflare Iteration (Optional):**
   ```powershell
   npm.cmd run build
   npm.cmd run dev
   ```
   Test against `http://127.0.0.1:8787` using the `CuraFit — Local Dev` Postman environment.

### Phase 3 — Run Full Local Verification Gates
All local checks must pass with **0 failures and 0 skipped tests** before deploying or pushing:

```powershell
cd e:\Egypt_Nutrition_Local\website\dist
npm.cmd run check
```
This executes:
- `tsc -p tsconfig.quality.json` (TypeScript verification)
- `node scripts/check-data-manifest.mjs` (verifies food & recipe catalog counts and integrity)
- `node scripts/build.mjs` (builds `dist/server/cloudflare.js`, `dist/server/index.js`, and migrations)
- `scripts/quality/check-modules.mjs` & `scripts/quality/check-reference.mjs`
- `node --test --test-concurrency=2 tests/*.test.mjs` (`306+` unit, D1/R2 API, native auth + OIDC, OpenAPI, Postman parity, and zero-Arabic doc/contract tests)

Optional deep verification suites:
```powershell
npm.cmd run audit:matrix     # 2,250 workout + 333 nutrition scenarios
npm.cmd run benchmark        # Payload sizes & D1 latency
```

### Phase 4 — Deploy to Cloud Dev & Verify `dev` Branch
```powershell
cd e:\Egypt_Nutrition_Local\website\dist
# Only if new D1 SQL migrations were added:
npm.cmd run deploy:d1:dev

# Deploy Worker to https://curafit-api-dev.egypt-nutrition-coach.workers.dev:
npm.cmd run deploy:dev

# Commit & push dev branch (triggers GitHub Actions CI):
git add -A
git commit -m "<type: concise summary>"
git push origin dev
```
Verification checklist before promotion:
1. Wait for `.github/workflows/check.yml` (`Verify coaching engines`) on `dev` to finish with `conclusion: success`.
2. Smoke-test changed endpoints against `https://curafit-api-dev.egypt-nutrition-coach.workers.dev` via Postman (`CuraFit — Cloud Dev`) or KMM `debug` builds.

### Phase 5 — Promote to Production (`main`)
Only promote `dev` -> `main` via **fast-forward merge** once `dev` CI and Cloud Dev checks are completely green:

```powershell
cd e:\Egypt_Nutrition_Local\website\dist
git checkout main
git pull --ff-only origin main
git merge --ff-only dev

# Re-verify check & apply prod D1 migration (with prior backup) if schema changed:
npm.cmd run check
npm.cmd run deploy:d1:prod    # only when new drizzle/*.sql exists
npm.cmd run deploy:prod       # deploys curafit-api

git push origin main
```
Confirm `.github/workflows/check.yml` (`Verify coaching engines`) on `main` finishes with `conclusion: success` and `GET https://curafit-api.egypt-nutrition-coach.workers.dev/v1/health` returns `200`.

---

## 3. GitHub Actions CI/CD Workflows

- **Verification CI ([`.github/workflows/check.yml`](../.github/workflows/check.yml)):** Runs automatically on every push/PR to `dev` and `main` (`npm ci`, `npm audit --audit-level=moderate`, `npm run check`, Playwright browser QA `test:browser` + `test:browser:release`, `audit:matrix`, and `benchmark`).
- **Auto-Deployment ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)):** Skips deployment safely until `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured in **GitHub Repository Settings -> Secrets and variables -> Actions**. Once added, pushes to `dev` auto-deploy to `curafit-api-dev` and pushes to `main` auto-deploy to `curafit-api`.

---

## 4. Non-Negotiable Architecture & Safety Invariants

1. **Uniform KMM Envelope Only:**
   - `2xx` responses must use `{ ok: true, data, meta: { requestId, serverTime, revision? } }`.
   - `4xx`/`5xx` responses must use `{ ok: false, error: { code, message, params, fieldErrors, retryable, details? }, meta: { requestId, serverTime } }`.
2. **Zero Arabic in Docs, Contracts, Postman, or API Errors:**
   - All Markdown documentation (`docs/`, `postman/README.md`, `README.md`, `AGENTS.md`), OpenAPI contracts, examples, Postman collections, and `4xx`/`5xx` API error payloads must contain **zero Arabic characters**. This invariant is enforced by `tests/error-contract.test.mjs`.
   - Note: Domain food names (`data/`, `/v1/foods`) and `200 OK` Web UI coaching content remain preserved intact for bilingual/regional UX and Web User Stories.
3. **Protect Production & Cloud Dev Databases:**
   - **Never** wipe, reset, or replace Production D1 (`90fa62f1-7866-4156-ac29-f0aec4814bab`) or initialize an empty `curafit-db-dev` (`0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`). Keep `curafit-db-dev` populated as a production clone.
4. **Preserve Food & Exercise Catalog Integrity:**
   - Never delete or truncate files in `data/` without updating manifests and passing `node scripts/check-data-manifest.mjs` and `/v1/catalog/manifest` parity checks (`3,070` approved foods, `221` estimated recipes, `94` planning ingredients, `227` planning templates, `2,437` regional serving models, `868` exercises).
5. **Two Branches Only & Retired Infrastructure Stays Retired:**
   - **Never** create ad-hoc feature branches or deploy to Supabase, GitHub Pages, legacy `egypt-nutrition-coach` Worker, or OpenAI preview hosting (`.openai/hosting.json`).
   - **Never** reintroduce the removed `?simulation=1` / `simulation_*` sandbox code or tests.
