# CuraFit Manual Setup, Secrets & Deployment Checklist

This document lists **every action that requires manual operator intervention** (in Cloudflare Dashboard, Antigravity Desktop / local Wrangler CLI, Google Cloud / Play Console, Apple Developer Console, Firebase Console, or Postman) before promoting CuraFit to Cloud Dev (`dev`) and Production (`main`).

> **Scope Note:** All backend code, SQL migrations, pure-English error & coaching contracts (`294` error codes, `97` coaching codes), bilingual exercise/muscle i18n (`868` exercises + `69` muscles), OpenAPI spec (`84` paths / `50` commands), Postman collection (`16` groups / `140` endpoints), all `13` User Story documents, and `308+` automated tests are already implemented and pushed on branch **`dev`**. The items below are strictly external infrastructure provisioning, secrets, and release operations to complete from **Antigravity Desktop (local machine)** or external developer consoles.

---

## 0. Quick Handoff Summary (What to Run on Antigravity Desktop / Local)

| # | Action | Where | Required Before |
| :-: | :--- | :--- | :--- |
| 1 | Create private R2 buckets (`curafit-media-dev`, `curafit-media-prod`) & uncomment `r2_buckets` in `wrangler.jsonc` | Local Wrangler CLI | Cloud Dev & Prod media uploads |
| 2 | Run `npm run deploy:d1:dev` and `npm run deploy:dev` (verify `/v1/health` & `/v1/capabilities`) | Local Antigravity Desktop | Cloud Dev QA |
| 3 | Set Worker secrets via `wrangler secret put` (Section 2 below — OAuth, Store Billing, FCM/APNs, `STRICT_STORE_VERIFICATION`, `ENFORCE_PRO_ENTITLEMENTS`) | Local Wrangler CLI / Cloudflare Dashboard | Live OAuth, Push & Subscriptions |
| 4 | Re-import `postman/CuraFit_API.postman_collection.json` (`16` groups / `140` endpoints) & republish Postman Documenter (plus optional Jira `KAN` sync) | Postman Web / Jira | Team / Mobile QA |
| 5 | After Cloud Dev QA & green CI: export Prod D1 backup, fast-forward `dev` -> `main`, run `npm run deploy:d1:prod` & `npm run deploy:prod` | Local Antigravity Desktop | Production Launch |

---

## 1. Cloudflare Infrastructure Provisioning (Cloud Dev & Production)

### 1.1 Create Private Cloudflare R2 Buckets
Create two **private** R2 buckets (no public bucket URL; all reads/writes pass through Worker HMAC-signed `/v1/media/signed/{token}`):

```bash
wrangler r2 bucket create curafit-media-dev
wrangler r2 bucket create curafit-media-prod
```

Then uncomment the `r2_buckets` binding blocks in [`wrangler.jsonc`](../wrangler.jsonc):
- Default / Production (`curafit-api`): `binding: "CURAFIT_MEDIA_BUCKET"`, `bucket_name: "curafit-media-prod"`
- Cloud Dev (`env.dev` / `curafit-api-dev`): `binding: "CURAFIT_MEDIA_BUCKET"`, `bucket_name: "curafit-media-dev"`

### 1.2 Apply D1 SQL Migration `0006_production_features.sql`
Always migrate **Cloud Dev (`dev`) first**, verify live endpoints, and **back up Production D1 before migrating Production**:

```bash
# 1. Cloud Dev (curafit-db-dev: 0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0)
npm run deploy:d1:dev

# 2. Production backup BEFORE Production migration (egypt-nutrition-coaching: 90fa62f1-7866-4156-ac29-f0aec4814bab)
wrangler d1 export egypt-nutrition-coaching --remote --output ./backup-prod-pre-0006.sql
npm run deploy:d1:prod
```

> **Important:** `drizzle/0006_production_features.sql` is the single consolidated pre-production migration (there is **no `0007`** migration). It executes `ALTER TABLE coaching_users ADD COLUMN avatar_url text;` plus `CREATE TABLE IF NOT EXISTS` for all **17** production tables — including `coaching_streak_freezes` (with `auto_applied`), `coaching_trial_tombstones`, `coaching_custom_recipes`, `coaching_cardio_logs`, and `coaching_cycle_logs`. It is strictly additive and non-destructive.

### 1.3 Verify Cloudflare Cron Trigger
`wrangler.jsonc` already configures `"triggers": { "crons": ["0 * * * *"] }` invoking `scheduled()` in `server/cloudflare-entry.mjs` (hourly timezone-aware push reminder dispatch across all 6 production triggers: `ramadan_suhoor_reminder`, `daily_checkin_reminder`, `coaching_case_review`, `weekly_checkin_due`, `plan_renewal_due`, `trial_ending_day5`). Verify in Cloudflare Dashboard -> Workers -> `curafit-api-dev` / `curafit-api` -> **Triggers** after deploying.

---

## 2. Cloudflare Worker Secrets (`wrangler secret put`)

Set the following secrets separately for **Cloud Dev** (`--env dev`) and **Production** (default env).

### 2.1 Core Auth & Media Signing (Required)
| Secret Name | Purpose | Notes |
| :--- | :--- | :--- |
| `AUTH_JWT_SECRET` | HS256 JWT signing & verification (already configured) | Exact binding read by `server/auth.mjs` & `server/native-auth.mjs` (minimum 32 random bytes) |
| `MEDIA_SIGNING_SECRET` | HMAC-SHA256 signing for `/v1/media/signed/{token}` R2 proxy URLs | Falls back to `AUTH_JWT_SECRET` if unset, but using a dedicated secret is recommended |
| `OAUTH_TOKEN_ENC_KEY` | AES-GCM encryption key for stored Apple refresh tokens | Required for App Store Guideline 5.1.1(v) token revocation on GDPR account deletion |

### 2.2 Social Sign-In (Google & Apple OIDC — Required for Social Login)
| Secret / Var Name | Source | Notes |
| :--- | :--- | :--- |
| `OAUTH_GOOGLE_CLIENT_IDS` | Google Cloud Console -> Credentials -> OAuth 2.0 Client IDs | Comma-separated Android, iOS, and Web client IDs accepted in `aud` claim (`GOOGLE_OAUTH_CLIENT_IDS` is also accepted as an alias) |
| `APPLE_CLIENT_ID` | Apple Developer -> Identifiers -> App ID / Services ID | Bundle ID (e.g. `com.curafit.app`) accepted in `aud` claim (`OAUTH_APPLE_CLIENT_IDS` supported for multi-ID lists) |
| `APPLE_BUNDLE_ID` | Apple Developer -> Identifiers -> App ID | iOS bundle ID verified in Apple StoreKit 2 transactions (falls back to `APPLE_CLIENT_ID` if unset) |
| `APPLE_TEAM_ID` | Apple Developer -> Membership | 10-char Team ID (used for Apple `/auth/token` exchange & `/auth/revoke` on GDPR delete) |
| `APPLE_KEY_ID` | Apple Developer -> Keys (Sign in with Apple / App Store Connect key) | 10-char Key ID |
| `APPLE_PRIVATE_KEY` | Downloaded `.p8` private key | PKCS#8 PEM string for ES256 JWT signing (Apple `/auth/token`, `/auth/revoke` & App Store Server API) |
| `APPLE_ISSUER_ID` | App Store Connect -> Users and Access -> Integrations -> In-App Purchase | UUID Issuer ID for App Store Server API transaction verification |

### 2.3 Push Notifications (FCM HTTP v1 & Apple APNs HTTP/2 — Required for Cron Reminders)
| Secret / Var Name | Source | Notes |
| :--- | :--- | :--- |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase Console -> Service Accounts -> Generate New Private Key | JSON string (`project_id`, `client_email`, `private_key`) for WebCrypto RS256 OAuth2 token exchange |
| `APNS_KEY_ID` | Apple Developer -> Keys (APNs `.p8` key) | 10-char Key ID |
| `APNS_TEAM_ID` | Apple Developer -> Membership | 10-char Team ID |
| `APNS_PRIVATE_KEY` | Downloaded APNs `.p8` key | PKCS#8 PEM string for ES256 APNs HTTP/2 JWT |
| `APNS_BUNDLE_ID` | Apple Developer -> App ID | iOS bundle ID (`apns-topic`) |
| `APNS_USE_SANDBOX` | Environment flag | `"true"` on Cloud Dev (`--env dev`), `"false"` on Production |

### 2.4 Store Billing & Webhooks (Apple StoreKit 2 & Google Play Billing)
| Secret / Var Name | Source | Notes |
| :--- | :--- | :--- |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Play Console -> API Access -> Service Account | JSON string for Google Play Developer API (`purchases.subscriptionsv2.get` & `:acknowledge`) |
| `GOOGLE_PLAY_PACKAGE_NAME` | Google Play Console -> App ID | Android package name (e.g. `com.curafit.app`, also used in Play subscription management deep links) |
| `APPLE_WEBHOOK_SECRET` | Shared secret / verification header | Verified on `POST /v1/webhooks/apple` |
| `GOOGLE_PUBSUB_TOKEN` | Google Cloud Pub/Sub push subscription token | Verified on `POST /v1/webhooks/google-play` |
| `STRICT_STORE_VERIFICATION` | Environment flag | Set `"true"` in Production to require live Apple App Store Server API & Google Play `subscriptionsv2.get` verification (dev/test fallback allowed when unset) |
| `ENFORCE_PRO_ENTITLEMENTS` | Environment flag | Set `"true"` in Production (and Cloud Dev when testing paywall gating) to enforce `402 PRO_ENTITLEMENT_REQUIRED` on Pro features & free quotas |

### 2.5 Optional Feature & Operations Flags
| Var Name | Default | Purpose |
| :--- | :--- | :--- |
| `ENABLE_OPENFOODFACTS` | `"false"` | Set `"true"` to enable live OpenFoodFacts `/api/v2/` fallback on `GET /v1/foods/barcode/{ean}` cache misses |
| `MIN_ANDROID_VERSION` | `"1.0.0"` | Minimum Android semver before returning `426 CLIENT_UPDATE_REQUIRED` |
| `MIN_IOS_VERSION` | `"1.0.0"` | Minimum iOS semver before returning `426 CLIENT_UPDATE_REQUIRED` |
| `MAINTENANCE_MODE` | `"false"` | Set `"true"` during emergency maintenance (`503 MAINTENANCE_MODE`, while `/v1/health` and `/v1/capabilities` stay `200 OK`) |
| `MAINTENANCE_MESSAGE` | `null` | Optional English status banner exposed in `/v1/capabilities` |

---

## 3. External Console Configurations

1. **Google Cloud & Play Console:**
   - Configure SHA-1 / SHA-256 signing fingerprints for Android Google Sign-In.
   - Create in-app subscription products matching `GET /v1/subscriptions/offerings`:
     - `curafit_pro.monthly` (7-day free trial)
     - `curafit_pro.annual` (7-day free trial)
   - Configure Google Play Real-Time Developer Notifications (RTDN) Pub/Sub Push endpoint:
     - Cloud Dev: `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/webhooks/google-play`
     - Production: `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/webhooks/google-play`

2. **Apple Developer & App Store Connect:**
   - Enable **Sign in with Apple** and **Push Notifications** capabilities on the iOS App ID.
   - Create auto-renewable subscription products:
     - `com.curafit.pro.monthly` (7-day introductory free trial)
     - `com.curafit.pro.annual` (7-day introductory free trial)
   - Configure App Store Server Notifications v2 URL:
     - Sandbox: `https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/webhooks/apple`
     - Production: `https://curafit-api.egypt-nutrition-coach.workers.dev/v1/webhooks/apple`

3. **Postman Published Documentation (`16` Groups / `140` Endpoints):**
   - Re-import [`postman/CuraFit_API.postman_collection.json`](../postman/CuraFit_API.postman_collection.json) (`16` groups / `140` endpoints, aligned with `84` OpenAPI paths, `50` command actions, `294` error codes, and `97` coaching codes) and environments (`CuraFit — Cloud Dev`, `CuraFit — Production`, `CuraFit — Local Dev`) into Postman Workspace and republish the public Documenter URL (`https://documenter-api.postman.tech/view/9137216/2sBYPv2s1w`).

4. **Jira Backlog Sync (Optional):**
   - If you keep Jira (`KAN` project) mirrored with `docs/user-stories/`, sync the aligned production stories (`EPIC-01`..`EPIC-10`) using clean `production` and `mobile` labels.

---

## 4. Antigravity Desktop / Local Release Workflow (`dev` -> `main`)

Run from your local workspace on branch `dev`:

```bash
# 1. Verify full local gate
git checkout dev
npm run check

# 2. Deploy D1 migration & Worker to Cloud Dev
npm run deploy:d1:dev
npm run deploy:dev

# 3. Smoke-test Cloud Dev live
curl -s https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/health
curl -s https://curafit-api-dev.egypt-nutrition-coach.workers.dev/v1/capabilities

# 4. Commit & push to origin/dev and wait for green GitHub Actions CI
git add -A
git commit -m "Align user stories, pure-English contracts, bilingual exercises, and production API features"
git push origin dev
gh run list --branch dev --limit 3

# 5. ONLY after Cloud Dev QA & green CI on dev: backup Prod D1, promote dev -> main, and deploy Prod
wrangler d1 export egypt-nutrition-coaching --remote --output ./backup-prod-pre-0006.sql
git checkout main
git pull --ff-only origin main
git merge --ff-only dev
npm run check
npm run deploy:d1:prod
npm run deploy:prod
git push origin main
```

---

## 5. Deferred Final AI Phase (Planned Later)

Per product scope decision, AI features are intentionally deferred to the final rollout phase and currently return `501 FEATURE_DEFERRED_TO_AI_PHASE` (`capabilities.deferredFeatures: ["ai_meal_parse", "ai_coach_qa"]`):
- `POST /v1/nutrition/ai-parse` (`US-NUT-05` — AI photo/voice/text meal parsing)
- `POST /v1/coaching/chat` & `GET /v1/coaching/chat/history` (`US-CCH-05` — guarded log-grounded AI coach Q&A)

When ready for the Final AI Phase, provision LLM provider credentials (e.g., Gemini / OpenAI / Cloudflare Workers AI) as Worker secrets, enable the routes, and expose `ai_meal_parse` / `ai_coach_qa` in `/v1/capabilities`.

---

## 6. Exercise Media Assets (Future Content Drop)

`data/exercises-i18n.json` currently provides complete Arabic & English names, step-by-step instructions, and common mistakes for all **868 exercises** and **69 muscles**, with `mediaUrl: null` and `thumbnailUrl: null`. When licensed exercise demonstration videos/GIFs/thumbnails are uploaded to your CDN/R2 bucket, populate `mediaUrl` and `thumbnailUrl` in `data/exercises-i18n.json` (no API schema changes required).
