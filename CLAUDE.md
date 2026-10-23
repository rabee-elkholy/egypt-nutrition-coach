# AI Agent Instructions & Unified Hosting Contract (`egypt-nutrition-coach`)

See [`AGENTS.md`](./AGENTS.md) for the mandatory hosting, build, test, and deployment rules.

## Quick Summary for Agents
- **Single Canonical Live Host:** Cloudflare Workers + Cloudflare D1 (`https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/#planner`)
- **Simulation URL:** `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev/?simulation=1#planner`
- **Worker Name:** `egypt-nutrition-coach` (`wrangler.jsonc`)
- **D1 Database:** `egypt-nutrition-coaching` (`90fa62f1-7866-4156-ac29-f0aec4814bab`)
- **Web & Worker Directory:** `e:\Egypt_Nutrition_Local\website\dist`
- **Single Deploy Command:** `npm run deploy` (inside `e:\Egypt_Nutrition_Local\website\dist`)
- **Never deploy to another Worker name, another D1 instance, or static-only hosting.**
