# CuraFit Manual Setup, Secrets & Deployment Checklist

This document lists **every action that requires manual operator intervention** (in Cloudflare Dashboard, Antigravity Desktop / local Wrangler CLI, Google Cloud / Play Console, Apple Developer Console, or Firebase Console) before promoting CuraFit to Cloud Dev (`dev`) and Production (`main`).

> **Scope Note:** All backend code, SQL migrations (`0001`..`0007`), pure-English error & coaching contracts, bilingual exercise/muscle i18n (`868` exercises + `69` muscles), canonical OpenAPI 3.1 specification (`contracts/openapi.yaml`), and verification tests are maintained on branch **`dev`**. Default runtime `[vars]` (`ENFORCE_PRO_ENTITLEMENTS`, `ENABLE_OPENFOODFACTS`, `STRICT_STORE_VERIFICATION`, `MIN_ANDROID_VERSION`, `MIN_IOS_VERSION`, `LATEST_ANDROID_VERSION`, `LATEST_IOS_VERSION`) are explicitly configured in `wrangler.jsonc`. The items below are strictly external infrastructure provisioning, secrets, and release operations.

---

## 0. Quick Handoff Summary (What to Run on Antigravity Desktop / Local)

| # | Action | Where | Required Before |
| :-: | :--- | :--- | :--- |
| 1 | Create private R2 buckets (`curafit-media-dev`, `curafit-media-prod`) & uncomment `r2_buckets` in `wrangler.jsonc` | Local Wrangler CLI | Cloud Dev & Prod media uploads |
| 2 | Run `npm run deploy:d1:dev` and `npm run deploy:dev` (verify `/v1/health` & `/v1/capabilities`) | Local Antigravity Desktop | Cloud Dev QA |
| 3 | Set Worker secrets via `wrangler secret put` (Section 2 below — OAuth, Store Billing, FCM/APNs, optional `GEMINI_API_KEY`, `STRICT_STORE_VERIFICATION`, `ENFORCE_PRO_ENTITLEMENTS`) | Local Wrangler CLI / Cloudflare Dashboard | Live OAuth, Push, Subscriptions & Photo Vision |
| 4 | Sync mobile KMM/Swift/Kotlin clients against canonical `contracts/openapi.yaml` (plus optional Jira `KAN` status sync) | Mobile Repo / Jira | Team / Mobile QA |
| 5 | After Cloud Dev QA & green CI: export Prod D1 backup, fast-forward `dev` -> `main`, run `npm run deploy:d1:prod` & `npm run deploy:prod` | Local Antigravity Desktop | Production Launch |

---

## 1. Cloudflare Infrastructure Provisioning (Cloud Dev & Production)

### 1.1 Enable R2 & Create Private Cloudflare R2 Buckets
First enable **R2 Object Storage** in the Cloudflare Dashboard (account `7a3acfb886853d23106e93102fb81731` — required once before Wrangler R2 commands succeed; otherwise Wrangler returns error `10042`), then create two **private** R2 buckets (no public bucket URL; all reads/writes pass through Worker HMAC-signed `/v1/media/signed/{token}`):

```bash
wrangler r2 bucket create curafit-media-dev
wrangler r2 bucket create curafit-media-prod
```

Then uncomment the `r2_buckets` binding blocks in [`wrangler.jsonc`](../wrangler.jsonc):
- Default / Production (`curafit-api`): `binding: "CURAFIT_MEDIA_BUCKET"`, `bucket_name: "curafit-media-prod"`
- Cloud Dev (`env.dev` / `curafit-api-dev`): `binding: "CURAFIT_MEDIA_BUCKET"`, `bucket_name: "curafit-media-dev"`

### 1.2 Apply D1 SQL Migrations (`0006_production_features.sql` & `0007_wave2_production.sql`)
Always migrate **Cloud Dev (`dev`) first**, verify live endpoints, and **back up Production D1 before migrating Production**:

```bash
# 1. Cloud Dev (curafit-db-dev: 0a6b8bf6-8491-4ca1-95fd-e1c00430e3d0)
npm run deploy:d1:dev

# 2. Production backup BEFORE Production migration (egypt-nutrition-coaching: 90fa62f1-7866-4156-ac29-f0aec4814bab)
wrangler d1 export egypt-nutrition-coaching --remote --output ./backup-prod-pre-0007.sql
npm run deploy:d1:prod
```

> **Important:** `drizzle/0007_wave2_production.sql` is strictly additive (`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`). It provisions all **14 Wave 2 tables** (`public_challenges`, `challenge_participations`, `friend_challenges`, `friend_challenge_members`, `friend_challenge_cheers`, `friend_challenge_blocks`, `user_badges`, `private_circles`, `private_circle_members`, `private_circle_cheers`, `private_circle_blocks`, `coaching_referrals`, `coaching_referral_redemptions`, `coaching_photo_analyses`, `coaching_retention_intents`), seeds the curated clinically-tagged public challenges, and pre-seeds verified MENA supermarket barcode SKUs (Egypt, Saudi Arabia, UAE, Levant) into `food_barcodes`.

### 1.3 Verify Cloudflare Cron Trigger
`wrangler.jsonc` already configures `"triggers": { "crons": ["0 * * * *"] }` invoking `scheduled()` in `server/cloudflare-entry.mjs` (hourly timezone-aware bilingual AR/EN push reminder dispatch across `ramadan_suhoor_reminder`, `daily_checkin_reminder`, `pre_workout_reminder`, `meal_reminder`, `hydration_reminder`, `coaching_case_review`, `weekly_checkin_due`, `plan_renewal_due`, `trial_ending_day5`, `streak_saver_evening`, plus event-driven `friend_challenge_cheer`, with strict fasting-window suppression for food and hydration reminders and active `coachingPause` suppression). Verify in Cloudflare Dashboard -> Workers -> `curafit-api-dev` / `curafit-api` -> **Triggers** after deploying.

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
| `ENABLE_OPENFOODFACTS` | `"false"` | Set `"true"` to enable live OpenFoodFacts `/api/v2/` fallback on `GET /v1/foods/barcode/{ean}` cache misses (verified MENA SKUs are pre-seeded in `food_barcodes`) |
| `MIN_ANDROID_VERSION` | `"1.0.0"` | Minimum Android semver before returning `426 CLIENT_UPDATE_REQUIRED` |
| `MIN_IOS_VERSION` | `"1.0.0"` | Minimum iOS semver before returning `426 CLIENT_UPDATE_REQUIRED` |
| `LATEST_ANDROID_VERSION` | `"1.0.0"` | Latest Android release version exposed in `/v1/capabilities` for optional update prompts |
| `LATEST_IOS_VERSION` | `"1.0.0"` | Latest iOS release version exposed in `/v1/capabilities` for optional update prompts |
| `MAINTENANCE_MODE` | `"false"` | Set `"true"` during emergency maintenance (`503 MAINTENANCE_MODE`, while `/v1/health` and `/v1/capabilities` stay `200 OK`) |
| `MAINTENANCE_MESSAGE` | `null` | Optional English status banner exposed in `/v1/capabilities` |
| `GEMINI_API_KEY` | unset (secret) | Optional Worker secret enabling live meal-photo vision identification inside `POST /v1/nutrition/meal-parse` alongside deterministic catalog grounding |

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

3. **Canonical OpenAPI Specification (`contracts/openapi.yaml`):**
   - `contracts/openapi.yaml` (OpenAPI 3.1.0) is the single source of truth for KMM, Android, iOS, and backend contracts; validate it locally with `npm run check`.

4. **Jira Backlog Sync (Optional):**
   - Keep Jira (`KAN` project) synced with implemented Wave 1 and Wave 2 stories (`KAN-61`, `KAN-84`, `KAN-116`, `KAN-119`, `KAN-120`, `KAN-121`, `KAN-122`, `KAN-123`, `KAN-124`).

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
git commit -m "Implement Backend Wave 2 production features, D1 migration 0007, and OpenAPI sync"
git push origin dev
gh run list --branch dev --limit 3

# 5. ONLY after Cloud Dev QA & green CI on dev: backup Prod D1, promote dev -> main, and deploy Prod
wrangler d1 export egypt-nutrition-coaching --remote --output ./backup-prod-pre-0007.sql
git checkout main
git pull --ff-only origin main
git merge --ff-only dev
npm run check
npm run deploy:d1:prod
npm run deploy:prod
git push origin main
```

---

## 5. CuraFit Specialist Team Care Room, Meal Capture & Visual Difference Analysis (Day-1 Live)

All Specialist Team endpoints are **live on Day 1** (`capabilities.deferredFeatures: []`) with server-side clinical guardrails, Free Value-Peak starter quotas, and Pro Fair-Use ceilings (`429 FAIR_USE_LIMIT_REACHED`):
- `POST /v1/nutrition/meal-parse` (alias `/v1/nutrition/ai-parse`) — Meal Capture photo/voice/text parsing grounded in the 3,291-item food catalog with clinical/allergy cross-checks and mandatory human confirmation.
- `POST /v1/coaching/consultation` & `GET /v1/coaching/consultation/history` (aliases `/v1/coaching/chat`, `/v1/coaching/chat/history`) — 3-Specialist Interactive Care Room (Nutrition Specialist, Training Captain, Follow-Up Specialist) grounded in live D1 logs with urgent medical, medication-boundary, crisis, maternal, and recovery-stop guardrails.
- `POST /v1/progress/photos/analyze-diff`, `GET /v1/progress/photos/analyses`, `DELETE /v1/progress/photos/analyses/{analysisId}` — Opt-in Specialist Visual Difference Analysis with explicit `visual_progress_analysis` consent gating, multi-signal D1 correlation, and maternity/wellness protective modes.

To enable optional live image vision extraction on textless meal photos, provision `GEMINI_API_KEY` via `wrangler secret put GEMINI_API_KEY`.

---

## 6. Exercise Media Assets (Future Content Drop)

`data/exercises-i18n.json` currently provides complete Arabic & English names, step-by-step instructions, and common mistakes for all **868 exercises** and **69 muscles**, with `mediaUrl: null` and `thumbnailUrl: null`. When licensed exercise demonstration videos/GIFs/thumbnails are uploaded to your CDN/R2 bucket, populate `mediaUrl` and `thumbnailUrl` in `data/exercises-i18n.json` (no API schema changes required).
