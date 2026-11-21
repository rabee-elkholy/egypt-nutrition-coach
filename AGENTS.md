# AI Agent Instructions & Unified Hosting Contract (`CuraFit API v1`)

> **MANDATORY RULES FOR OPENAI CODEX & GOOGLE ANTIGRAVITY:**
> 1. **TWO CANONICAL CLOUDFLARE ENVIRONMENTS (`dev` & `main`):**
>    - **Cloud Dev (`dev` branch):** Worker `curafit-api-dev` -> Cloudflare D1 `curafit-db-dev` (`database_id`: `0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0` — **full clone** of Production D1 data/schema, **NEVER** an empty DB).
>    - **Production (`main` branch):** Worker `curafit-api` -> existing full Production D1 `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab` — **NEVER** replace with an empty DB).
> 2. **TWO CANONICAL BRANCHES ONLY (`dev` -> `main`):** Always develop and test changes on **`dev`** (`origin/dev`, Cloud Dev) first, verify green CI, and only then fast-forward merge **`dev` -> `main`** (`origin/main`, Production). **NEVER** create ad-hoc feature branches or deploy to OpenAI preview hosting or GitHub Pages.
> 3. **PURE-ENGLISH DOCS & KMM ERROR CONTRACT:**
>    - All `4xx`/`5xx` API responses must follow `{ ok: false, error: { code, message, params, fieldErrors, retryable, details? }, meta: { requestId, serverTime } }` with **100% English** messages (`contracts/error-codes.json`). All `2xx` responses must follow `{ ok: true, data, meta: { requestId, serverTime, revision? } }`.
>    - All documentation (`docs/`, `postman/`, `README.md`, `AGENTS.md`), OpenAPI contracts, examples, and Postman definitions must contain **zero Arabic characters** (enforced automatically by `tests/error-contract.test.mjs`).
> 4. **PRESERVE CATALOGS & KEEP RETIRED SYSTEMS REMOVED:**
>    - Preserve all food and exercise catalogs in `data/` (`node scripts/check-data-manifest.mjs`).
>    - Keep simulation mode (`?simulation=1`, `simulation_*`), Supabase/external IdPs, legacy Worker `egypt-nutrition-coach`, and GitHub Pages permanently removed.

---

## 1. Canonical Live URLs, Branches & Resources

* **Production App & API (`main` branch):** `https://curafit-api.egypt-nutrition-coach.workers.dev` (Web UI: `#planner`)
  * Worker: `curafit-api`
  * D1 Database: `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab`, binding: `DB`)
* **Cloud Dev App & API (`dev` branch):** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev` (Web UI: `#planner`)
  * Worker: `curafit-api-dev`
  * D1 Database: `curafit-db-dev` (`database_id`: `0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`, binding: `DB`)
* **Git Repository & Branches:** `https://github.com/rabee-elkholy/egypt-nutrition-coach.git` — Branches: **`dev`** & **`main`**
* **Postman Documentation (Published):** `https://documenter-api.postman.tech/view/9137216/2sBYPv2s1w` (`CuraFit API v1`, `12` groups / `77` endpoints; environments: `CuraFit — Cloud Dev`, `CuraFit — Production`, `CuraFit — Local Dev`)
* **Worker Entrypoint & Config:** `server/cloudflare-entry.mjs` (bundled into `dist/server/cloudflare.js`), `wrangler.jsonc`, `drizzle/`

Full step-by-step instructions for AI agents and developers (error contract sync, OpenAPI/Postman regeneration, Drizzle D1 migrations, browser QA, and CI/CD) live in [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md).

---

## 2. Quick Build, Sync, Test & Deployment Workflow

Run from `e:\Egypt_Nutrition_Local\website\dist`:

1. **Sync Contracts When Editing Errors, Endpoints, or Docs:**
   ```powershell
   node scripts/sync-error-contracts.mjs   # syncs contracts/error-codes.json -> docs/ERROR_CODES.md
   npm.cmd run postman:generate             # regenerates postman/*.json & docs/API_REFERENCE.md
   ```
2. **Develop, Test & Deploy on `dev` (Cloud Dev) First:**
   ```powershell
   git checkout dev
   git pull --ff-only origin dev
   npm.cmd run check                        # typecheck, manifest, build, module/ref checks, 297+ tests
   npm.cmd run deploy:d1:dev                # only when new drizzle/*.sql migrations exist
   npm.cmd run deploy:dev
   git add -A
   git commit -m "<concise commit message>"
   git push origin dev
   ```
3. **Wait for Green CI on `dev`, Then Promote to Production (`main`):**
   ```powershell
   gh run watch <dev-verify-run-id> --exit-status
   git checkout main
   git pull --ff-only origin main
   git merge --ff-only dev
   npm.cmd run check
   npm.cmd run deploy:d1:prod               # only after backup when new drizzle/*.sql exists
   npm.cmd run deploy:prod
   git push origin main
   ```

---

## 3. Strict Prohibitions for Codex & Antigravity

1. **Do NOT create branches other than `dev` and `main`.**
2. **Do NOT replace Production D1 `90fa62f1-7866-4156-ac29-f0aec4814bab` with an empty DB, and do NOT reset `curafit-db-dev` (`0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0`) to an empty schema without cloning Production data.**
3. **Do NOT commit Arabic text into `contracts/`, `docs/`, `postman/`, `README.md`, `AGENTS.md`, or server/domain error responses.** Web UI Arabic labels live strictly in `error-messages-ar.mjs` and `200 OK` coaching content.
4. **Do NOT overwrite `scripts/build.mjs` to remove the `dist/server/cloudflare.js` build target or skip `npm.cmd run check` before pushing.**
5. **Do NOT use `.openai/hosting.json`, GitHub Pages, or any Supabase integration.**
