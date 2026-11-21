# AI Agent Instructions & Unified Hosting Contract (`CuraFit API`)

> **MANDATORY RULES FOR OPENAI CODEX & GOOGLE ANTIGRAVITY:**
> 1. **TWO CANONICAL CLOUDFLARE ENVIRONMENTS (`dev` & `main`):**
>    - **Cloud Dev (`dev` branch):** Worker `curafit-api-dev` -> Cloudflare D1 `curafit-db-dev` (**full clone** of Production D1 data/schema — **NEVER** start an empty DB).
>    - **Production (`main` branch):** Worker `curafit-api` -> existing full Production D1 `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab` — **NEVER** replace with an empty DB).
> 2. **TWO CANONICAL BRANCHES ONLY (`dev` -> `main`):** Develop and test new features on **`dev`** (`origin/dev`, Cloud Dev) first, then fast-forward merge **`dev` -> `main`** (`origin/main`, Production). **NEVER** create ad-hoc feature branches or deploy to OpenAI preview hosting or GitHub Pages.
> 3. **KMM ERROR CONTRACT:** All API error responses (`4xx`/`5xx`) MUST follow `{ ok: false, error: { code, message, params, fieldErrors, retryable }, meta: { requestId, serverTime } }` with **100% English** messages (`contracts/error-codes.json`). Never emit Arabic text in API errors.

---

## 1. Canonical Live URLs, Branches & Cloudflare Resources

* **Production App & API (`main` branch):**
  `https://curafit-api.egypt-nutrition-coach.workers.dev` (Web UI: `#planner`)
  * Worker: `curafit-api`
  * D1 Database: `egypt-nutrition-coaching` (`database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab`, binding: `DB`)
* **Cloud Dev App & API (`dev` branch):**
  `https://curafit-api-dev.egypt-nutrition-coach.workers.dev` (Web UI: `#planner`)
  * Worker: `curafit-api-dev`
  * D1 Database: `curafit-db-dev` (full production clone, binding: `DB`)
* **Git Repository & Branches:**
  `https://github.com/rabee-elkholy/egypt-nutrition-coach.git` — Branches: **`dev`** (Cloud Dev) & **`main`** (Production)
* **Cloudflare Worker Entrypoint:**
  `server/cloudflare-entry.mjs` (bundled into `dist/server/cloudflare.js` by `npm run build`)
* **Wrangler Config File:**
  `wrangler.jsonc` (`drizzle/` migrations dir)

---

## 2. Standard Build, Test & Deployment Workflow

Run from `e:\Egypt_Nutrition_Local\website\dist`:

1. **Develop & Verify on `dev` First:**
   ```powershell
   git checkout dev
   git pull --ff-only origin dev
   npm.cmd run check
   ```
2. **Deploy to Cloud Dev & Commit/Push `dev`:**
   ```powershell
   npm.cmd run deploy:d1:dev   # if new D1 migrations exist
   npm.cmd run deploy:dev
   git add -A
   git commit -m "<concise commit message>"
   git push origin dev
   ```
3. **Promote Verified `dev` to Production (`main`):**
   ```powershell
   git checkout main
   git pull --ff-only origin main
   git merge --ff-only dev
   npm.cmd run check
   npm.cmd run deploy:d1:prod  # if new D1 migrations exist
   npm.cmd run deploy:prod
   git push origin main
   ```

---

## 3. Strict Prohibitions for Codex & Antigravity

1. **Do NOT create branches other than `dev` and `main`.**
2. **Do NOT replace Production D1 `90fa62f1-7866-4156-ac29-f0aec4814bab` with an empty DB, and do NOT reset `curafit-db-dev` to an empty schema without cloning Production data.**
3. **Do NOT overwrite `scripts/build.mjs` to remove the `dist/server/cloudflare.js` build target.**
4. **Do NOT use `.openai/hosting.json` or GitHub Pages (`rabee-elkholy.github.io`) as a deployment target.**
