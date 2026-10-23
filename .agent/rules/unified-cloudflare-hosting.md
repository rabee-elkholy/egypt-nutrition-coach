---
description: Unified Cloudflare Workers + D1 Hosting and Main-Branch-Only Rule for Codex & Antigravity
globs: "**/*"
alwaysApply: true
---

# Unified Cloudflare Hosting & `main` Branch Rule (Codex & Antigravity)

1. **Single Canonical Live Host:**
   - All web and backend deployments MUST target the single Cloudflare Worker **`egypt-nutrition-coach`** (`https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/#planner`) and the Cloudflare D1 database **`egypt-nutrition-coaching`** (`database_id: 90fa62f1-7866-4156-ac29-f0aec4814bab`).
   - Simulation URL: `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/?simulation=1#planner`
2. **Single Branch (`main` ONLY — No Sub-Branches):**
   - All commits and pushes MUST go directly to `origin/main` on `https://github.com/rabee-elkholy/egypt-nutrition-coach.git`.
   - NEVER create or push feature/sub-branches (`feat/*`, `fix/*`, `codex/*`).
3. **Deployment Command:**
   - Always deploy using `npm.cmd run deploy` (`node scripts/build.mjs && npx wrangler deploy --config wrangler.jsonc`), then `git push origin main`.
