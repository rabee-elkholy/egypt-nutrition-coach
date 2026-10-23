---
description: Unified Cloudflare Workers + D1 Hosting Rule for Egypt Nutrition Coach
globs: "**/*"
alwaysApply: true
---

# Unified Cloudflare Hosting Rule

1. **Single Canonical Live Host:**
   - All web and backend deployments MUST target the single Cloudflare Worker **`egypt-nutrition-coach`** (`https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/#planner`) and the Cloudflare D1 database **`egypt-nutrition-coaching`** (`database_id: 90fa62f1-7866-4156-ac29-f0aec4814bab`).
   - Simulation URL: `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/?simulation=1#planner`
2. **Deployment Command:**
   - Always deploy using `npm.cmd run deploy` (`node scripts/build.mjs && npx wrangler deploy --config wrangler.jsonc`), then `git push origin main`.
   - NEVER deploy to a separate Worker name, a new D1 database, or static-only GitHub Pages.
