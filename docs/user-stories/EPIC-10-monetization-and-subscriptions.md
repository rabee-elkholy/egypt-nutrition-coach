# EPIC-10: Freemium Entitlements, Soft Paywall, 7-Day Free Trial & Subscription Management

> **Epic ID:** `EPIC-10`
> **Target Platforms:** KMM (Android Google Play Billing v7+ & iOS StoreKit 2)
> **Scope:** Production
> **Labels:** `production`, `mobile`, `monetization`, `paywall`, `subscriptions`

---

## Epic Overview

`EPIC-10` implements CuraFit's **Freemium + Soft Paywall & 7-Day Free Trial** monetization engine. Users experience the complete conversational onboarding (`EPIC-01`), daily logging, planned meals, core workouts (`Simple` & `Pro` modes), 3,291 food catalog, and 868 exercises completely **Free** — building trust and daily habit loops first. **CuraFit Pro** seamlessly unlocks high-value AI, automation, and adaptive intelligence features via native **StoreKit 2 (iOS)** and **Google Play Billing (Android)** verified server-side on Cloudflare Workers + D1 (`GET /v1/entitlements`).

### Child User Stories
- `US-MON-01`: Feature Entitlement Matrix & Contextual Soft Paywall Triggers
- `US-MON-02`: High-Converting Paywall Screen (7-Day Free Trial, MENA Pricing & Store Disclosures)
- `US-MON-03`: StoreKit 2 & Google Play Billing Purchase Flow, Server Receipt Verification & Restore Purchases
- `US-MON-04`: Subscription Management, Trial Countdown, Billing Grace Period & Zero-Data-Loss Downgrade

---

## US-MON-01: Feature Entitlement Matrix & Contextual Soft Paywall Triggers

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-MON-01` |
| **Epic** | `EPIC-10` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `monetization`, `entitlements` |
| **Target Screens** | `ContextualProUpsellSheet` (Triggered smoothly from gated feature entry points) |
| **Entitlement** | `Freemium` |
| **Backend Status** | `Implemented` (`GET /v1/entitlements` with canonical `tier: "pro" | "free"`, `FREE_FEATURES`, `PRO_FEATURES`, quotas & billing flags) |

### STORY
As a Free-tier user exploring CuraFit, I want complete clarity on which core tracking features are Free forever vs. which advanced automation/AI tools belong to CuraFit Pro, with helpful preview teasers rather than frustrating sudden blocks — and never paywall-locking critical safety tools.

### PRECONDITIONS
- App holds latest `entitlements` from `GET /v1/bootstrap` or `GET /v1/entitlements`.

### SCREEN AND UI DETAILS
1. **Free vs. Pro Feature Entitlement Matrix (Canonical Product Contract):**

| Capability | Free Tier (`FREE_FEATURES`) | CuraFit Pro (`PRO_FEATURES`, enforced when `ENFORCE_PRO_ENTITLEMENTS=true`) |
| :--- | :--- | :--- |
| Conversational Onboarding & Initial 7-Day Meal & Workout Plans | Unlimited (`Free`) | Unlimited |
| Daily Today Hub, Full Logging, Hydration, Weight, Steps & Gentle Streaks (1 Streak Freeze / 7 days) | Unlimited (`Free`) | Unlimited |
| Planned Meal Logging, Manual Entry, Search (3,291 foods/beverages + 2,437 regional models), `custom_recipes`, `pantry_finder`, `cardio_tracking`, `cycle_awareness` | Unlimited (`Free`) | Unlimited |
| Ramadan Mode, 16:8 Fasting Live Timer (`ramadan_fasting`) & Eid Flex Mode (`seasonal_flex`) | Unlimited (`Free`) | Unlimited |
| Workouts (`Simple` & `Pro` Modes), Rest Timer, Plate Calc, 868 Exercise Library, `workout_reschedule` | Unlimited (`Free`) | Unlimited |
| Daily Recovery Check-In, `safety_recovery_deload`, `injury_safety_swaps`, `comeback_protocol`, & Urgent Safety Stops (`RED_FLAGS_STOP`) | **Always `Free` (Safety Rule!)** | Unlimited |
| **Voluntary Meal & Exercise Swaps** | Free quota (`dailyMealSwapsLimit: 2/day` + `weeklyExerciseSwapsLimit: 2/week`) | **Unlimited** (`unlimited_meal_swaps`, `unlimited_exercise_swaps`) |
| **MENA Supermarket Barcode Scanner** (`US-NUT-06`) | Preview teaser | **Unlimited** (`barcode_scanner`) |
| **Smart Weekly Grocery / Shopping List** (`US-NUT-09`) | Free preview teaser (`?preview=true`, top preview rows) | **Full Interactive List & Share** (`grocery_list`) |
| **Weekly Meal Plan Renewal (`renew_plan`)** (`US-NUT-01`) | Week 1 Included + 1 Free Bonus Renewal (after plan ends) | **Unlimited + Early Mid-Week Renewal (`earlyRenew: true`)** (`unlimited_plan_renewals`) |
| **Adaptive Proposals (`calories`, `weekly_volume`, `maintenance`)** (`US-CCH-03`) | Readiness & Evidence Checklist visible | **Full Adaptive Proposals & Approvals** (`adaptive_calorie_volume`) |
| **Multi-Horizon Analytics (`90D`/`All`) & Progress Photos Cloud Upload** (`US-PRG-01`/`03`) | `14D/30D` + Local Vault + Viewing/Deleting Existing Cloud Photos | **Full `90D`/`All` History (`advanced_analytics`) + Cloud Upload (`progress_photos_cloud`)** |
| **AI Meal Photo/Voice/Text Quick Log** (`US-NUT-05` — *Final AI Phase, Deferred `501`*) | 1 Free Sample Preview *(once AI enabled)* | **Unlimited** (fair-use cap) |
| **Guarded AI Coach Q&A ("Ask the Coach")** (`US-CCH-05` — *Final AI Phase, Deferred `501`*) | 3 Starter Messages *(once AI enabled)* | **Unlimited Coaching Chat** |

2. **Contextual Soft Paywall Sheet (`ContextualProUpsellSheet`):**
   - Shows exact value relevant to *what the user just tapped* (e.g., *"Scan Any Supermarket Barcode in 2 Seconds with Pro"* or *"Turn Your 7-Day Plan Into an Aisle-Sorted Grocery List"*).
   - Buttons: `[Start 7-Day Free Trial]` (opens `PaywallScreen` `US-MON-02`) | `[Maybe Later]` (dismisses cleanly!).

### API & BACKEND CONTRACT
1. **`GET /v1/entitlements`**
   - **Unified Response (`200 OK`):**
     ```json
     {
       "ok": true,
       "data": {
         "tier": "free",
         "status": "none",
         "productId": null,
         "provider": null,
         "expiresAt": null,
         "autoRenewEnabled": false,
         "trialEligible": true,
         "isInGracePeriod": false,
         "isOnHold": false,
         "isPaused": false,
         "managementUrl": null,
         "quotas": {
           "aiParsesRemainingFree": 1,
           "aiCoachMessagesRemainingFree": 3,
           "freePlanRenewalsRemaining": 1,
           "dailyMealSwapsLimit": 2,
           "dailyMealSwapsRemaining": 2,
           "weeklyExerciseSwapsLimit": 2,
           "weeklyExerciseSwapsRemaining": 2
         },
         "features": [
           "core_nutrition",
           "core_workouts",
           "offline_sync",
           "arabic_food_search",
           "pantry_finder",
           "ramadan_fasting",
           "safety_recovery_deload",
           "workout_reschedule",
           "injury_safety_swaps",
           "comeback_protocol",
           "custom_recipes",
           "cardio_tracking",
           "cycle_awareness",
           "seasonal_flex"
         ]
       }
     }
     ```
   - *(When `tier == "pro"`, `features` equals `PRO_FEATURES`, adding `"unlimited_meal_swaps"`, `"unlimited_exercise_swaps"`, `"unlimited_plan_renewals"`, `"grocery_list"`, `"barcode_scanner"`, `"adaptive_calorie_volume"`, `"advanced_analytics"`, and `"progress_photos_cloud"` — plus future Final AI Phase capabilities once enabled).*

### RULES & BUSINESS LOGIC
1. **Strict Safety Exemption Rule:** NEVER gate `confirm_health`, `confirm_schedule`, `recovery` check-ins, safety-critical adaptations (`kind: "recovery"` & `kind: "schedule"`), `RED_FLAGS_STOP`, injury-safety exercise swaps (`workoutSafetyIssues`), viewing/deleting existing progress photos, GDPR export, or account deletion behind Pro!
2. **Server-Authoritative Enforcement (`ENFORCE_PRO_ENTITLEMENTS=true`):** Backend endpoints (`GET /v1/plans/{id}/grocery-list`, `GET /v1/foods/barcode/{ean}`, `POST /v1/progress/photos/upload-url`, `GET /v1/progress/analytics` `90d|all`, `renew_plan`, `replace_meal`, `replace_exercise`, `adaptation` for `calories`/`weekly_volume`/`maintenance`, plus Final AI Phase `POST /v1/nutrition/ai-parse` & `POST /v1/coaching/chat`) independently verify `entitlements.tier === "pro"` (or remaining free sample quota) and return `402 PRO_ENTITLEMENT_REQUIRED` when enforcement is active.

### MAIN FLOW
1. A Free user uses their free meal swap quota or taps the Supermarket Barcode Scanner.
2. App checks `entitlements` (`tier == "free"`) -> Displays `ContextualProUpsellSheet`: *"Scan Any Supermarket Barcode in 2 Seconds with CuraFit Pro!"*.
3. User taps `[Start 7-Day Free Trial]` -> Routes smoothly to `PaywallScreen` (`US-MON-02`).

### EDGE CASES
- **Offline Entitlement Check:** Read cached `entitlements` + `expiresAt` from SQLDelight so paid Pro users keep full Pro access offline inside gyms (`grace period` of `48h` past `expiresAt` offline until next online validation!).
- **Trial Expires While User Is Actively Viewing a Grocery List:** Finishes displaying current session readably and triggers Soft Paywall gracefully ONLY when invoking the next gated request (`402 PRO_ENTITLEMENT_REQUIRED`).
- **Simultaneous Multi-Device Usage of Free Quotas:** Server atomically increments `coaching_usage_quotas` on D1 so two phones logged into one Free account cannot double-claim unlimited free quotas.
- **Urgent Medical / Red-Flag State While Free User Is Exceeding Quotas:** Safety stops (`RED_FLAGS_STOP`), recovery check-ins, and injury exercise swaps bypass every quota and never display Paywall sheets.

### ACCEPTANCE CRITERIA
- **Scenario 1: Safety features remain accessible to Free users at all times**
  - **Given** a Free user has an injury-flagged exercise in `workoutSafetyIssues`
  - **When** tapping to swap that unsafe exercise
  - **Then** swap proceeds immediately without showing any Paywall.
- **Scenario 2: Gated Pro endpoint enforces server-side `402 PRO_ENTITLEMENT_REQUIRED`**
  - **Given** `tier == "free"` and `ENFORCE_PRO_ENTITLEMENTS=true`
  - **When** `GET /v1/plans/{id}/grocery-list` or `GET /v1/progress/analytics?range=90d` is called
  - **Then** backend rejects with `402 PRO_ENTITLEMENT_REQUIRED` and client launches the Soft Paywall cleanly.
- **Scenario 3: Offline Pro subscriber retains cached Pro capabilities cleanly**
  - **Given** cached `entitlements.tier == "pro"` and `expiresAt` is 10 days in the future
  - **When** user opens Pro features offline
  - **Then** Pro UI capabilities remain unlocked without network verification delays.

### ANALYTICS
- `soft_paywall_triggered` (`feature_key`: `string`, `trigger_screen`: `string`, `free_quota_remaining`: `integer`)
- `soft_paywall_action` (`feature_key`: `string`, `action`: `"open_paywall" | "dismissed"`)

---

## US-MON-02: High-Converting Paywall Screen (7-Day Free Trial, MENA Pricing & Store Disclosures)

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-MON-02` |
| **Epic** | `EPIC-10` |
| **Priority** | `High` |
| **Labels** | `production`, `mobile`, `monetization`, `paywall`, `store-compliance` |
| **Target Screens** | `PaywallScreen` |
| **Entitlement** | `Freemium` |
| **Backend Status** | `Implemented` (`GET /v1/subscriptions/offerings`) |

### STORY
As a user considering upgrading to CuraFit Pro, I want a clean, trustworthy Paywall screen clearly comparing Monthly vs. Annual plans in my local currency (EGP / SAR / AED / USD), showing a transparent 7-day Free Trial timeline ("Today: Free -> Day 5: Reminder -> Day 7: Billing Begins"), and complying 100% with Apple App Store and Google Play subscription transparency guidelines.

### PRECONDITIONS
- Triggered from Soft Paywall (`US-MON-01`), Profile Upgrade Banner (`US-PRF-01`), or explicit `"Upgrade to Pro"` CTA.
- StoreKit 2 / Google Play `ProductDetails` queried alongside backend offerings.

### SCREEN AND UI DETAILS
1. **Top Close Button (`X`) & Header:** Always visibly dismissible (`Soft Paywall` — never trap the user!).
2. **Hero Value Stack:**
   - Personalized calm athletic headline: *"CuraFit Pro — Adaptive Coaching & Complete Automation"*
   - Scannable 4-bullet visual checklist (Barcode Scanner & Grocery List, Unlimited Meal/Exercise Swaps & Early Renewals, Adaptive Calorie/Volume Reviews, Advanced `90D`/`All` Analytics & Cloud Vault — plus AI Photo/Voice Log & AI Coach Q&A in Final AI Phase).
3. **Trial Timeline Explainer (If `trialEligible == true` — Proven High-Trust Pattern):**
   - `Day 1 (Today):` Instant full Pro access — **0.00 charged today**.
   - `Day 5:` Friendly reminder before trial ends *(via Cron `trial_ending_day5` push alert if enabled)*.
   - `Day 7:` Subscription begins — cancel anytime in 1 tap via App Store / Google Play.
4. **Plan Selector Cards (Fetched from StoreKit 2 / Play Billing + Backend Offerings):**
   - **Annual Plan (Pre-Selected, `Best Value • Save {calculatedSavingsPct}%` badge):** Computes exact savings dynamically from live StoreKit 2 / Google Play `Product` / `ProductDetails` localized annual vs `12 x monthly` prices (falling back to `offerings.bestValuePct` before live store prices finish resolving), showing equivalent monthly price + billed yearly total in local currency (e.g., `EGP 999 / year` or `SAR 189 / year`).
   - **Monthly Plan:** Standard monthly billing (e.g., `EGP 149 / month` or `SAR 29 / month`).
5. **Primary CTA & Mandatory Legal Footer:**
   - Dynamic CTA Label:
     - If `trialEligible`: `[Start 7-Day Free Trial]`
     - If prior trial used: `[Subscribe Now for {localizedPrice}]`
   - Secondary Links Row: `[Restore Purchases]` | `[Redeem Offer Code]` *(iOS `presentCodeRedemptionSheet` / Android Play Store promo deep-link for MENA coach campaigns)* | `[Terms of Use]` | `[Privacy Policy]`.
   - **Store-Required Auto-Renewal Fine Print:** Clear readable text noting payment charges to Apple ID / Google Play account at confirmation (or end of 7-day trial) and renews automatically unless cancelled `>= 24 hours` before period end.

### API & BACKEND CONTRACT
1. **`GET /v1/subscriptions/offerings?platform=android|ios&region=egypt|gulf|levant|maghreb`**
   - Returns active Store product IDs (iOS: `com.curafit.pro.annual`, `com.curafit.pro.monthly`; Android: `curafit_pro.annual`, `curafit_pro.monthly`), trial eligibility (`trialEligible` computed from `coaching_subscriptions` AND anonymized `coaching_trial_tombstones`), promotional badges (`bestValuePct: 42`), and `trialDays` (`7` or `0`).
2. **Native Store SDK Product Query:** Always render exact localized currency strings (`formattedPrice`, `introductoryOffer`) directly from Apple StoreKit 2 `Product` / Google Play `ProductDetails` — never hardcode currency strings in UI!

### RULES & BUSINESS LOGIC
1. **Single-Trial-Per-Identity Guard (`coaching_trial_tombstones`):** Both Apple/Google Store IDs AND backend `coaching_subscriptions` + anonymized SHA-256 `coaching_trial_tombstones` (which survive GDPR account deletion with zero PII) track prior trial usage. Once used, `trialEligible` returns `false` and the CTA switches from `"Start 7-Day Free Trial"` to `"Subscribe Now"` so unlimited delete-and-recreate trial abuse is prevented while remaining 100% GDPR-compliant.
2. **Store Billing Load Failure:** If App Store / Play Store product fetch fails (e.g. simulator or store outage), show `[Retry Loading Plans]` cleanly instead of blank price cards.

### MAIN FLOW
1. User taps `[Start 7-Day Free Trial]` on Soft Paywall.
2. `PaywallScreen` renders `GET /v1/subscriptions/offerings` + live StoreKit 2 / Play localized prices with Annual (`Save {calculatedSavingsPct}%`) pre-selected.
3. User inspects the 7-day timeline and taps `[Start 7-Day Free Trial]` -> Launches native OS payment sheet (`US-MON-03`).

### EDGE CASES
- **User Already Pro (`tier == "pro"`):** If deep-linked accidentally to `PaywallScreen`, auto-redirect cleanly to `ManageSubscriptionScreen` (`US-MON-04`).
- **Store Country Differs From Profile Region (e.g., Egyptian App Store Account Using UAE Profile Region):** Displays currency strictly from Apple/Google Store `Product` localized price metadata rather than profile region heuristics so charged price matches checkout receipt 100%.
- **Offline Paywall Open:** Shows clear offline notice (`"Connect to internet to view live Store pricing & subscribe"`) with `[Retry]` and clean `[Dismiss]`.
- **Arabic RTL Trial Timeline Alignment:** Mirrors Day 1 -> Day 5 -> Day 7 progression steps Right-to-Left cleanly while keeping numeric dates and prices formatted legibly.

### ACCEPTANCE CRITERIA
- **Scenario 1: Localized store currency and trial eligibility display accurately**
  - **Given** user is eligible for trial and store region is Egypt (`EGP`)
  - **When** `PaywallScreen` loads
  - **Then** StoreKit 2 / Play localized EGP pricing displays on Monthly and Annual cards and the CTA reads `[Start 7-Day Free Trial]`.
- **Scenario 2: Ineligible user (including post-GDPR-deletion returning identity) sees direct subscription CTA**
  - **Given** `trialEligible == false` (via `coaching_subscriptions` or anonymized `coaching_trial_tombstones`)
  - **When** `PaywallScreen` opens
  - **Then** trial timeline hides and CTA displays `[Subscribe Now]`.
- **Scenario 3: Store product loading failure recovers gracefully with Retry action**
  - **Given** StoreKit 2 / Google Play `queryProductDetails` fails due to transient store outage
  - **When** `PaywallScreen` renders
  - **Then** placeholder skeleton resolves to a clean retry card rather than showing empty `0.00` prices.

### ANALYTICS
- `paywall_viewed` (`trigger_feature`: `string`, `trial_eligible`: `boolean`, `annual_price`: `string`)
- `paywall_plan_selected` (`product_id`: `string`, `billing_period`: `"monthly" | "annual"`)
- `paywall_cta_tapped` (`product_id`: `string`, `trial_eligible`: `boolean`)
- `paywall_dismissed` (`trigger_feature`: `string`)

---

## US-MON-03: StoreKit 2 & Google Play Billing Purchase Flow, Server Receipt Verification & Restore Purchases

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-MON-03` |
| **Epic** | `EPIC-10` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `monetization`, `billing`, `storekit2`, `play-billing` |
| **Target Screens** | Native OS Payment Sheet + `PurchaseProcessingOverlay`, `ProUnlockedModal` |
| **Entitlement** | `Freemium` |
| **Backend Status** | `Implemented` (`POST /v1/subscriptions/verify`, `POST /v1/subscriptions/restore`, `POST /v1/webhooks/apple`, `POST /v1/webhooks/google-play`) |

### STORY
As a user tapping Subscribe or Restore Purchases, I want my Apple App Store or Google Play transaction verified securely with CuraFit's server, acknowledged promptly so I am never auto-refunded, protected against accidental double-billing across stores, and unlocked instantaneously across all my devices.

### PRECONDITIONS
- User tapped Purchase on `PaywallScreen` (`US-MON-02`) or `[Restore Purchases]` on Paywall / Profile.

### SCREEN AND UI DETAILS
1. **Processing State:** Non-blocking spinner overlay *"Confirming your CuraFit Pro membership..."* while verifying receipt with Cloudflare Worker.
2. **Success Confirmation Modal (`ProUnlockedModal`):**
   - *"Welcome to CuraFit Pro"*
   - Direct button returning right back into the gated action the user originally tried (e.g., `[Scan Barcode Now]` or `[Open Grocery List]`).
3. **Pending / Interrupted State (e.g., Store Pending Payment / Ask-to-Buy):**
   - *"Purchase pending store approval — Pro will activate automatically once confirmed."*
4. **Failure / Restore Empty State:**
   - If Restore finds no active store entitlement: *"No active CuraFit Pro subscription was found for this Apple ID / Google account."*

### API & BACKEND CONTRACT
1. **`POST /v1/subscriptions/verify`**
   - **Auth:** Required (`Authorization: Bearer <accessToken>`)
   - **Request Body:**
     - **iOS (StoreKit 2):** `{ "platform": "ios", "productId": "com.curafit.pro.annual", "signedTransactionJws": "<storekit2-jws>", "transactionId": "200000...", "isTrial": true }` *(accepts `signedTransactionJws` or `signedTransactionInfo`)*.
     - **Android (Google Play Billing):** `{ "platform": "android", "productId": "curafit_pro.annual", "purchaseToken": "<play-purchase-token>", "orderId": "GPA....", "isTrial": true }`.
   - **Production Server Verification (`STRICT_STORE_VERIFICATION=true` in Production; dev/test fallback when unset):**
     - **Apple:** Verifies transaction via **Apple App Store Server API** (`/inApps/v1/transactions/{transactionId}` production + sandbox fallback, signed with ES256 JWT using `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`) and validates JWS / `bundleId`.
     - **Google Play:** Verifies via **Google Play Developer API** (`purchases.subscriptionsv2.get`) using `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` and **acknowledges** unacknowledged purchases server-side via `:acknowledge`.
     - **Cross-Store Double-Billing Guard:** Rejects with `409 ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM` if the user already holds an active Pro subscription on the other store (`apple` vs `google`).
     - Writes `coaching_subscriptions` in D1, records anonymized SHA-256 `coaching_trial_tombstones` if a trial started, updates `coaching_users.entitlement = "pro"`, and returns `{ verified: true, entitlements }` (`tier: "pro"`).
2. **`POST /v1/subscriptions/restore`** -> Accepts `{ platform: "ios" | "android", tokens: [string | { purchaseToken?, transactionId?, signedTransactionJws?, productId?, orderId?, isTrial? }] }` (up to 10 active StoreKit 2 `currentEntitlements` / Play `queryPurchasesAsync` string tokens or structured receipt objects). Rejects tokens owned by another user with `409 SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`, restores active Pro subscriptions on the same account, and supports re-verifying a valid paid receipt onto a fresh account (e.g., after GDPR account deletion).
3. **`POST /v1/webhooks/apple` & `POST /v1/webhooks/google-play`** -> Production real-time webhook handlers:
   - **Apple App Store Server Notifications v2:** Decodes `signedPayload` JWS + nested `signedTransactionInfo` and `signedRenewalInfo`, handling `SUBSCRIBED`, `DID_RENEW`, `DID_CHANGE_RENEWAL_STATUS` (`AUTO_RENEW_ENABLED` -> `active`, otherwise `cancelled_active`), `DID_CHANGE_RENEWAL_PREF` (mid-cycle upgrade/downgrade), `DID_FAIL_TO_RENEW` (`GRACE_PERIOD` -> `grace_period`, otherwise `billing_retry`), and `EXPIRED` / `GRACE_PERIOD_EXPIRED` / `REVOKE` / `REFUND` -> `expired`.
   - **Google Play RTDN (Cloud Pub/Sub):** Decodes base64 Pub/Sub `message.data`, maps notification types (`1, 2, 4, 7` -> `active`, `3` -> `cancelled_active`, `5` -> `account_hold`, `6` -> `grace_period`, `10` -> `paused`, `12, 13` -> `expired`), and refreshes authoritative `expiryTime` & `productId` (including mid-cycle plan switches) via `purchases.subscriptionsv2.get`.
   - Error Codes: `400 INVALID_SUBSCRIPTION_RECEIPT`, `401 WEBHOOK_SIGNATURE_INVALID`, `409 ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM`, `409 SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`, `503 BILLING_VERIFICATION_UNAVAILABLE` (`retryable: true` on Store API outage), `503 SERVICE_UNAVAILABLE` (`retryable: true` when strict store credentials unconfigured).

### RULES & BUSINESS LOGIC
1. **Finish Transaction ONLY After Server Verification:** Never call `transaction.finish()` (iOS) or `acknowledgePurchase` (Android) until `POST /v1/subscriptions/verify` commits `200 OK` (or duplicate already verified for this user), ensuring failed network transactions automatically retry on next launch!
2. **Cross-Account Store Receipt Guard (`SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`):** If a single Apple ID / Google account tries to restore an active subscription already bound to a different CuraFit `userId`, inform user clearly *"This store subscription is already linked to another CuraFit account."*
3. **Cross-Store Double-Billing Guard (`ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM`):** Prevent an active iOS subscriber from accidentally purchasing a second Google Play subscription (and vice versa), directing them to manage their existing store subscription instead.

### MAIN FLOW
1. User completes Face ID payment inside native StoreKit 2 sheet for `com.curafit.pro.annual` (7-day Free Trial).
2. Client obtains signed `Transaction.jwsRepresentation` and calls `POST /v1/subscriptions/verify`.
3. Cloudflare Worker verifies with Apple App Store Server API, records active `trialing` row in D1 (`expiresAt = +7 days`) plus anonymized trial tombstone, and returns updated `entitlements` (`tier: "pro"`).
4. Client calls `transaction.finish()`, updates SQLDelight `entitlements`, displays `ProUnlockedModal`, and returns straight to the user's requested feature!

### EDGE CASES
- **Network Drop After Google/Apple Charged User Before Server Verify Returned:** Unfinished transaction remains in OS Store queue (`Transaction.updates` / `queryPurchasesAsync`); on next foreground/retry, client automatically re-submits `POST /v1/subscriptions/verify` silently without charging twice!
- **User Cancels Native OS Payment Dialog:** Return cleanly to `PaywallScreen` with zero error alerts.
- **Ask-to-Buy / Deferred Pending Payment (`PURCHASE_STATE_PENDING`):** Displays non-blocking status banner *"Waiting for family/bank approval — Pro activates automatically once Store confirms"* and never calls `verify` until Store transitions to purchased!
- **Same Apple ID / Google Account Restored on Wrong CuraFit Account (`409 SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`):** Clearly informs user which sign-in account currently holds the subscription without overwriting ownership silently.
- **Upstream Store Verification Outage (`503 BILLING_VERIFICATION_UNAVAILABLE`):** Leaves the OS store transaction unfinished (`transaction.finish()` / `acknowledgePurchase` deferred) and prompts calm retry on next launch without double-charging.
- **User Deleted Account (GDPR) Then Re-Signed In and Tapped `[Restore Purchases]`:** Because GDPR deletion cleared old `coaching_subscriptions` rows, `POST /v1/subscriptions/restore` re-verifies the active store receipt cleanly onto the new account while preserving anonymized trial tombstones.

### ACCEPTANCE CRITERIA
- **Scenario 1: Verified StoreKit 2 / Play purchase unlocks Pro entitlements immediately**
  - **Given** user completes a valid purchase on iOS or Android
  - **When** `POST /v1/subscriptions/verify` returns `200 OK`
  - **Then** `entitlements.tier` becomes `"pro"`, OS transaction is finished/acknowledged, and Pro features unlock immediately.
- **Scenario 2: Cross-store duplicate purchase is blocked cleanly**
  - **Given** user already has an active `apple` Pro subscription
  - **When** attempting to verify a new `google` subscription for the same user
  - **Then** server returns `409 ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM` preventing double-billing.
- **Scenario 3: Restore purchases when Store has no active entitlement fails cleanly**
  - **Given** user taps `[Restore Purchases]` with zero active StoreKit 2 / Play receipts
  - **When** `POST /v1/subscriptions/restore` completes
  - **Then** user stays on `free` tier with clear localized message *"No active CuraFit Pro subscription found for this store account."*

### ANALYTICS
- `subscription_purchase_started` (`platform`: `"ios" | "android"`, `product_id`: `string`)
- `subscription_verified_success` (`platform`: `string`, `product_id`: `string`, `is_trial`: `boolean`)
- `subscription_purchase_failed` (`platform`: `string`, `error_code`: `string`)
- `subscription_restored` (`found_active`: `boolean`)

---

## US-MON-04: Subscription Management, Trial Countdown, Billing States & Zero-Data-Loss Downgrade

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-MON-04` |
| **Epic** | `EPIC-10` |
| **Priority** | `Medium` |
| **Labels** | `production`, `mobile`, `monetization`, `retention`, `billing` |
| **Target Screens** | `ManageSubscriptionScreen`, `BillingGraceBanner` |
| **Entitlement** | `Freemium` |
| **Backend Status** | `Implemented` (`GET /v1/entitlements`, `POST /v1/webhooks/apple`, `POST /v1/webhooks/google-play`) |

### STORY
As a CuraFit Pro subscriber (or returning Free user whose trial or subscription paused, entered hold, or ended), I want clear visibility into my plan status, renewal/trial-end date, 1-tap access to cancel or switch plans in Apple/Google settings, clear payment-retry reminders during billing grace/hold/pause periods, and absolute guarantee that **none of my historical data or logs are ever deleted** if my Pro plan suspends or expires.

### PRECONDITIONS
- User navigates to `Profile -> Subscription & Billing` (or sees a billing grace/hold banner on Today).

### SCREEN AND UI DETAILS
1. **Manage Subscription Screen (`ManageSubscriptionScreen`):**
   - **Active Trial State (`trialing`):** `"CuraFit Pro (7-Day Free Trial)"` • `"Trial ends on {date} — then {price}"` • `[Manage / Cancel in Apple/Google Subscriptions]`.
   - **Active Paid State (`active`):** `"CuraFit Pro (Annual / Monthly)"` • `"Renews automatically on {date}"` • `[Manage / Switch Plan in Store Settings]` (supports mid-cycle upgrade/downgrade cleanly).
   - **Cancelled But Still Active Until Period End (`cancelled_active`):** `"Auto-renewal off — Pro access continues until {expiresAt}"` • `[Resubscribe]` button.
   - **Grace Period Banner (`isInGracePeriod == true`, `status: "grace_period"`):**
     - Gentle non-blocking top banner on Today & Profile: *"Payment issue detected — update your payment method in {Apple/Google} to avoid losing Pro features."* + `[Update Payment Method]` (Pro access remains active during store grace period).
   - **Account Hold / Billing Retry (`isOnHold == true`, `status: "account_hold" | "billing_retry"`):**
     - Pro access is cleanly suspended (`tier: "free"`) without sticky entitlements: *"Your subscription is on hold due to a payment issue — update your payment method in Store settings to resume Pro."* + `[Update Payment Method]`.
   - **Paused State (`isPaused == true`, `status: "paused"` — Google Play):**
     - Pro access is cleanly suspended (`tier: "free"`) until resumed: *"Your Google Play subscription is paused — resume anytime in Google Play."* + `[Manage in Google Play]`.
   - **Expired / Revoked / Free State (`expired` / `none`):** `"Free Plan"` • Clear note `"All your logs, photos, and active plans are safely preserved!"` • `[Upgrade to Pro]` + `[Restore Purchases]`.

### API & BACKEND CONTRACT
1. **`GET /v1/entitlements`**
   - Full state machine response: `{ tier ("pro" | "free"), status ("none" | "active" | "trialing" | "grace_period" | "cancelled_active" | "billing_retry" | "account_hold" | "paused" | "expired"), productId, provider ("apple" | "google" | null), expiresAt, autoRenewEnabled, trialEligible, isInGracePeriod, isOnHold, isPaused, managementUrl, quotas, features[] }`.
   - `account_hold`, `billing_retry`, `paused`, and `expired` cleanly resolve `tier: "free"` (D1 `coaching_subscriptions` rows are authoritative, preventing sticky Pro entitlement bugs).
   - Android `managementUrl` includes deep-link parameters: `https://play.google.com/store/account/subscriptions?sku={productId}&package={GOOGLE_PLAY_PACKAGE_NAME}`; iOS returns `https://apps.apple.com/account/subscriptions`.
2. **Production Webhooks (`/v1/webhooks/apple` & `/v1/webhooks/google-play`)** keep status transitions (`DID_FAIL_TO_RENEW` -> `grace_period`/`billing_retry`, `DID_CHANGE_RENEWAL_PREF` -> mid-cycle plan switch, Google RTDN `nt === 5` -> `account_hold`, `nt === 10` -> `paused`, `EXPIRED`/`REVOKE`/`REFUND` -> `expired`) synchronized asynchronously in D1 even when the user hasn't opened the app.

### RULES & BUSINESS LOGIC
1. **Zero-Data-Loss Downgrade Guarantee:**
   - When a Pro user enters `account_hold`, `paused`, or downgrades to `free`:
     - All existing active nutrition & workout plans remain 100% readable and loggable!
     - All previously logged meals (including past barcode-logged or AI-logged meals), measurements, workout PRs, and history remain 100% intact and readable (`GET /v1/account/export` still exports everything!).
     - Only **new** Pro actions (new barcode scan, generating a new grocery list, `90d`/`all` analytics, new cloud photo upload, paid plan renewal beyond free quota) gracefully show the Soft Paywall (`US-MON-01`).
     - Any cloud-stored progress photos remain stored safely in R2 (`GET /v1/progress/photos` and `DELETE /v1/progress/photos/{photoId}` stay 100% accessible — never held hostage or deleted on downgrade!).
2. **Native Store Management & Cross-Platform Awareness:**
   - **Same-Platform Store Management:** On iOS with `provider == "apple"`, opens `AppStore.showManageSubscriptions(in:)` (or `managementUrl`). On Android with `provider == "google"`, opens `entitlements.managementUrl` (`https://play.google.com/store/account/subscriptions?sku={productId}&package=com.curafit.app`).
   - **Cross-Platform Subscription Viewing (e.g., Subscribed on iOS, Signed Into Android Phone):** Full Pro features unlock seamlessly via D1 `entitlements`, while `ManageSubscriptionScreen` displays *"Managed via Apple App Store on your iOS device"* (or Google Play on Android) with zero broken OS store sheet calls!
   - **Account Deletion Cross-Link (`US-PRF-06`):** If user triggers Permanent Account Deletion while `status in ["active", "trialing", "grace_period"]`, both `US-PRF-06` and this story surface a direct `[Manage Store Subscription]` link so billing never unexpectedly auto-renews after account erasure.

### MAIN FLOW
1. User is on Day 6 of their Free Trial and opens `Profile -> Subscription & Billing`.
2. Screen shows `"Trial ends tomorrow (Nov 22)"` and `[Manage in App Store]`.
3. If user decides to cancel in App Store, Apple sends App Store Server Notifications v2 (`DID_CHANGE_RENEWAL_STATUS`) -> `entitlements.status` updates cleanly to `"cancelled_active"` until Nov 22, after which `tier` returns to `"free"` with 100% of their diary and workouts preserved!

### EDGE CASES
- **Apple / Google Billing Retry Succeeds After 3 Days in Grace Period or Account Hold:** Webhook restores `status: "active"`, updates `tier: "pro"`, clears `isInGracePeriod` / `isOnHold`, removes the banner, and preserves uninterrupted history.
- **Mid-Cycle Plan Switch (Monthly -> Annual or Annual -> Monthly):** Apple `DID_CHANGE_RENEWAL_PREF` or Google Play RTDN updates `productId` and `expiresAt` seamlessly while maintaining `status: "active"`.
- **iOS Subscriber Logs Into Android Tablet:** Pro unlocks seamlessly across OS boundaries via server `entitlements`, and billing instructions clearly point to Apple App Store settings.
- **Store Refund / Revoke Webhook Received (`REFUND` / `REVOKE` / RTDN `12`/`13`):** Immediately transitions `status` to `"expired"` and `entitlements.tier` back to `"free"` cleanly without wiping user's logged food or workout history.
- **Offline Subscription Status View:** Reads last synced `entitlements` metadata cleanly from SQLDelight showing cached expiry date alongside subtle `"Offline — live status refreshes when online"`.

### ACCEPTANCE CRITERIA
- **Scenario 1: Downgrade from Pro to Free retains all user history and cloud photos read/delete access**
  - **Given** a Pro user had 12 cloud progress photos and 30 days of logged meals/workouts
  - **When** their subscription expires (`tier = "free"`)
  - **Then** all historical logs, plans, and existing cloud photos remain viewable, deletable, and exportable without any data loss.
- **Scenario 2: Billing grace period retains Pro while `account_hold` and `paused` suspend Pro cleanly**
  - **Given** webhooks transition a user to `grace_period` vs `account_hold` (`isOnHold: true`) or `paused` (`isPaused: true`)
  - **When** `GET /v1/entitlements` resolves
  - **Then** `grace_period` keeps `tier == "pro"` with `isInGracePeriod: true`, while `account_hold` and `paused` resolve `tier == "free"` cleanly with zero sticky entitlement bug.
- **Scenario 3: Android `managementUrl` deep-links directly to SKU and package**
  - **Given** `entitlements.provider == "google"` and `productId == "curafit_pro.annual"`
  - **When** `GET /v1/entitlements` returns
  - **Then** `managementUrl` includes `?sku=curafit_pro.annual&package=com.curafit.app`.

### ANALYTICS
- `subscription_manage_viewed` (`status`: `string`, `provider`: `string | null`)
- `subscription_store_settings_opened` (`platform`: `"ios" | "android"`, `in_grace_period`: `boolean`)
- `subscription_status_changed` (`from_status`: `string`, `to_status`: `string`)
