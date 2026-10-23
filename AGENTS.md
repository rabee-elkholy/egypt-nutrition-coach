# AI Agent Instructions & Unified Hosting Contract (`egypt-nutrition-coach`)

> **MANDATORY RULE FOR ALL AI AGENTS (Antigravity, OpenAI Codex, Claude Code, Cursor, Copilot):**
> This project has **ONE canonical hosting environment** on **Cloudflare Workers + Cloudflare D1**.
> **NEVER** deploy to a different Worker name, a new D1 database, GitHub Pages as a primary target, Vercel, Netlify, or any other host.

---

## 1. Canonical Live URLs & Cloudflare Resources

* **Primary Live Application (Production):**
  `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/#planner`
* **90-Day Adaptive Simulation Mode:**
  `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/?simulation=1#planner`
* **GitHub Repository (`origin/main`):**
  `https://github.com/rabee-elkholy/egypt-nutrition-coach.git`
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
  `wrangler.jsonc` (in `website/dist/wrangler.jsonc` or repo root)

---

## 2. Standard Build, Test & Deployment Workflow

Whenever you make changes to the frontend, planner engines, or backend Worker:

1. **Working Directory:**
   `e:\Egypt_Nutrition_Local\website\dist` (which is tracked by Git against `https://github.com/rabee-elkholy/egypt-nutrition-coach.git`).
2. **Run All Verification Suites Before Deploying:**
   ```bash
   npm run check
   node ../test-planner.mjs
   node ../test-middle-east-coach.mjs
   ```
3. **Deploy to the Canonical Cloudflare Worker:**
   ```bash
   npm run deploy
   ```
   *(This runs `node scripts/build.mjs && npx wrangler deploy --config wrangler.jsonc` and updates `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev` in place).*
4. **If D1 Schema Migrations Were Added (`drizzle/*.sql`):**
   ```bash
   npm run deploy:d1
   ```
5. **Commit and Push to GitHub (`origin/main`):**
   ```bash
   git add -A
   git commit -m "<concise commit message>"
   git push origin main
   ```

---

## 3. Strict Prohibitions

1. **Do NOT change `"name": "egypt-nutrition-coach"` or `"database_id": "90fa62f1-7866-4156-ac29-f0aec4814bab"` in `wrangler.jsonc`.**
2. **Do NOT overwrite `scripts/build.mjs` to remove the `dist/server/cloudflare.js` build target.**
3. **Do NOT tell the user to test on `rabee-elkholy.github.io`** — that legacy static URL automatically redirects to `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev`.
