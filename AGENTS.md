# AI Agent Instructions & Unified Hosting Contract (`egypt-nutrition-coach`)

> **MANDATORY RULES FOR OPENAI CODEX & GOOGLE ANTIGRAVITY:**
> 1. **SINGLE CANONICAL HOSTING:** This project has **ONE canonical hosting environment** on **Cloudflare Workers + Cloudflare D1** (`egypt-nutrition-coach`). **NEVER** deploy to a different Worker name, a new D1 database, OpenAI preview hosting, GitHub Pages, or any other host.
> 2. **SINGLE BRANCH (`main` ONLY):** All work, commits, and pushes MUST be done directly on the **`main`** branch (`origin/main`). **NEVER** create or push feature/sub-branches (such as `feat/*`, `fix/*`, `codex/*`).

---

## 1. Canonical Live URLs, Branch & Cloudflare Resources

* **Primary Live Application (Production):**
  `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/#planner`
* **90-Day Adaptive Simulation Mode:**
  `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/?simulation=1#planner`
* **GitHub Repository & Branch:**
  `https://github.com/rabee-elkholy/egypt-nutrition-coach.git` — **Branch: `main` ONLY**
* **Cloudflare Worker Name:**
  `egypt-nutrition-coach`
* **Cloudflare Worker Entrypoint:**
  `server/cloudflare-entry.mjs` (bundled into `dist/server/cloudflare.js` by `npm run build`)
* **Cloudflare D1 Database:**
  * `database_name`: `egypt-nutrition-coaching`
  * `database_id`: `90fa62f1-7866-4156-ac29-f0aec4814bab`
  * `binding`: `DB`
  * `migrations_dir`: `drizzle`
* **Wrangler Config File:**
  `wrangler.jsonc`

---

## 2. Standard Build, Test & Deployment Workflow

Whenever you make changes to the frontend, planner engines, or backend Worker:

1. **Always Work on `main`:**
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Run Verification Suites Before Deploying:**
   ```bash
   npm run check
   ```
3. **Deploy to the Canonical Cloudflare Worker:**
   ```bash
   npm run deploy
   ```
   *(Runs `node scripts/build.mjs && npx wrangler deploy --config wrangler.jsonc` and updates `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev` in place).*
4. **If D1 Schema Migrations Were Added (`drizzle/*.sql`):**
   ```bash
   npm run deploy:d1
   ```
5. **Commit and Push Directly to `origin/main`:**
   ```bash
   git add -A
   git commit -m "<concise commit message>"
   git push origin main
   ```

---

## 3. Strict Prohibitions for Codex & Antigravity

1. **Do NOT create or push any branch other than `main`.**
2. **Do NOT change `"name": "egypt-nutrition-coach"` or `"database_id": "90fa62f1-7866-4156-ac29-f0aec4814bab"` in `wrangler.jsonc`.**
3. **Do NOT overwrite `scripts/build.mjs` to remove the `dist/server/cloudflare.js` build target.**
4. **Do NOT use `.openai/hosting.json` or `rabee-elkholy.github.io` as a deployment target** — `rabee-elkholy.github.io` automatically redirects to `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev`.
