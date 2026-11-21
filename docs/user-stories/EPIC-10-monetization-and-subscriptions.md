# EPIC-10: Freemium Entitlements, Soft Paywall, 7-Day Free Trial & Subscription Management

> **Epic ID:** `EPIC-10`
> **Target Platforms:** KMM (Android Google Play Billing v7+ & iOS StoreKit 2)
> **Scope:** Production V2
> **Labels:** `production-v2`, `mobile-v2`, `monetization`, `paywall`, `subscriptions`

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
| **Labels** | `production-v2`, `mobile-v2`, `monetization`, `entitlements` |
| **Target Screens** | `ContextualProUpsellSheet` (Triggered smoothly from gated feature entry points) |
| **Entitlement** | `Freemium` |
| **Backend Status** | `Modified` (`GET /v1/entitlements` expanded V2 feature keys & status fields) |

### STORY
As a Free-tier user exploring CuraFit, I want complete clarity on which core tracking features are Free forever vs. which advanced automation/AI tools belong to CuraFit Pro, with helpful preview teasers rather than frustrating sudden blocks — and never paywall-locking critical safety tools.

### PRECONDITIONS
- App holds latest `entitlements` from `GET /v1/bootstrap` or `GET /v1/entitlements`.

### SCREEN AND UI DETAILS
1. **Free vs. Pro Feature Entitlement Matrix (Authoritative Product Contract):**

| Capability | Free Tier | CuraFit Pro |
| :--- | :--- | :--- |
| Conversational Onboarding & Initial 7-Day Plan | Unlimited (`Free`) | Unlimited |
| Daily Today Hub, Hydration, Weight, Steps & Streaks | Unlimited (`Free`) | Unlimited |
| Planned Meal Logging, Manual Entry, Search (3,291 items), Recipe Calc, Pantry Finder | Unlimited (`Free`) | Unlimited |
| Ramadan Mode & 16:8 Fasting Live Timer | Unlimited (`Free`) | Unlimited |
| Workouts (`Simple` & `Pro` Modes), Rest Timer, Plate Calc, 868 Exercise Library, Reschedule | Unlimited (`Free`) | Unlimited |
| Daily Recovery Check-In & Urgent Safety Stops (`RED_FLAGS_STOP`, Injury Safety Swaps) | **Always `Free` (Safety Rule!)** | Unlimited |
| **Meal & Exercise Swaps (Voluntary Preference)** | 2 Meal swaps/day + 2 Exercise swaps/week | **Unlimited** |
| **AI Meal Photo & Arabic/English Voice/Text Quick Log** (`US-NUT-05`) | 1 Free Sample Preview | **Unlimited** (fair-use cap) |
| **MENA Supermarket Barcode Scanner** (`US-NUT-06`) | Preview teaser | **Unlimited** |
| **Smart Weekly Grocery / Shopping List** (`US-NUT-09`) | Previews top 2 items | **Full Interactive List & WhatsApp Share** |
| **Weekly Meal Plan Renewal (`renew_plan`)** (`US-NUT-01`) | Week 1 Included + 1 Bonus Renewal | **Unlimited Auto/1-Tap Renewals** |
| **Adaptive Coach Reviews & Auto Calorie/Volume Proposals** (`US-CCH-03`) | Readiness & Evidence Checklist visible | **Full Adaptive Proposals & Approvals** |
| **Guarded AI Coach Q&A ("Ask the Coach")** (`US-CCH-05`) | 3 Starter Messages | **Unlimited Coaching Chat** |
| **Multi-Horizon Analytics (`90D`/`All`) & Encrypted Cloud Photo Vault** (`US-PRG-01`/`03`) | `14D/30D` + Local Vault (6 photos) | **Full History + Unlimited R2 Cloud Vault** |

2. **Contextual Soft Paywall Sheet (`ContextualProUpsellSheet`):**
   - Shows exact value relevant to *what the user just tapped* (e.g., *"Scan Any Supermarket Barcode in 2 Seconds with Pro"* or *"Turn Your 7-Day Plan Into an Aisle-Sorted Grocery List"*).
   - Buttons: `[Start 7-Day Free Trial]` (opens `PaywallScreen` `US-MON-02`) | `[Maybe Later]` (dismisses cleanly!).

### API & BACKEND CONTRACT
1. **`[MODIFIED BACKEND] GET /v1/entitlements`**
   - **Response (`200 OK`):**
     ```json
     {
       "ok": true,
       "data": {
         "tier": "free",
         "status": "none",
         "provider": null,
         "expiresAt": null,
         "trialEligible": true,
         "isInGracePeriod": false,
         "quotas": {
           "aiParsesRemainingFree": 1,
           "aiCoachMessagesRemainingFree": 3,
           "freePlanRenewalsRemaining": 1,
           "dailyMealSwapsLimit": 2,
           "weeklyExerciseSwapsLimit": 2
         },
         "features": [
           "core_nutrition",
           "core_workouts",
           "offline_sync",
           "arabic_food_search",
           "ramadan_fasting"
         ]
       }
     }
     ```
   - *(When `tier == "premium"`, `features` includes `"ai_meal_logging"`, `"barcode_scanner"`, `"smart_grocery_list"`, `"unlimited_swaps"`, `"unlimited_plan_renewal"`, `"adaptive_coaching_proposals"`, `"ai_coach_chat"`, `"advanced_analytics"`, `"cloud_photo_vault"`).*

### RULES & BUSINESS LOGIC
1. **Strict Safety Exemption Rule:** NEVER gate `confirm_health`, `confirm_schedule`, `recovery` check-ins, `RED_FLAGS_STOP`, injury-safety exercise swaps (`workoutSafetyIssues`), GDPR export, or account deletion behind Pro!
2. **Server-Authoritative Enforcement:** Backend endpoints (`POST /v1/nutrition/ai-parse`, `GET /v1/plans/{id}/grocery-list`, `POST /v1/coaching/chat`, `renew_plan`, `adaptation` after free grace) independently verify `entitlements.tier === "premium"` (or remaining free sample quota) and return `402 PRO_ENTITLEMENT_REQUIRED` if bypassed!

### MAIN FLOW
1. A Free user uses their 1 free AI Meal Photo sample on Day 1 and loves it.
2. On Day 3, they tap `AI Photo / Voice` again in Quick-Log `+`.
3. App checks `entitlements` (`aiParsesRemainingFree == 0`, `tier == "free"`) -> Displays `ContextualProUpsellSheet`: *"Save 10 minutes a day with unlimited AI Photo & Arabic Voice meal logging!"*.
4. User taps `[Start 7-Day Free Trial]` -> Routes smoothly to `PaywallScreen` (`US-MON-02`).

### EDGE CASES
- **Offline Entitlement Check:** Read cached `entitlements` + `expiresAt` from SQLDelight so paid Pro users keep full Pro access offline inside gyms (`grace period` of `48h` past `expiresAt` offline until next online validation!).
- **Trial Expires While User Is Actively Editing a Grocery List / AI Chat:** Finishes displaying current session readably and triggers Soft Paywall gracefully ONLY when invoking the next gated mutation (`402 PRO_ENTITLEMENT_REQUIRED`).
- **Simultaneous Multi-Device Usage of Free AI Sample Quota:** Server atomically decrements `aiParsesRemainingFree` / `freePlanRenewalsRemaining` on D1 so two phones logged into one Free account cannot double-claim unlimited free AI parses.
- **Urgent Medical / Red-Flag State While Free User Is Exceeding Quotas:** Safety stops (`RED_FLAGS_STOP`), recovery check-ins, and injury exercise swaps bypass every quota and never display Paywall sheets.

### ACCEPTANCE CRITERIA
- **Scenario 1: Safety features remain accessible to Free users at all times**
  - **Given** a Free user has an injury-flagged exercise in `workoutSafetyIssues`
  - **When** tapping to swap that unsafe exercise
  - **Then** swap proceeds immediately without showing any Paywall.
- **Scenario 2: Gated Pro endpoint enforces server-side `402 PRO_ENTITLEMENT_REQUIRED`**
  - **Given** `tier == "free"` and `aiParsesRemainingFree == 0`
  - **When** `POST /v1/nutrition/ai-parse` is called
  - **Then** backend rejects with `402 PRO_ENTITLEMENT_REQUIRED` and client launches the Soft Paywall cleanly.
- **Scenario 3: Offline Pro subscriber retains cached Pro capabilities cleanly**
  - **Given** cached `entitlements.tier == "premium"` and `expiresAt` is 10 days in the future
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
| **Labels** | `production-v2`, `mobile-v2`, `monetization`, `paywall`, `store-compliance` |
| **Target Screens** | `PaywallScreen` |
| **Entitlement** | `Freemium` |
| **Backend Status** | `New` (`GET /v1/subscriptions/offerings`) |

### STORY
As a user considering upgrading to CuraFit Pro, I want a clean, trustworthy Paywall screen clearly comparing Monthly vs. Annual plans in my local currency (EGP / SAR / AED / USD), showing a transparent 7-day Free Trial timeline ("Today: Free -> Day 5: Reminder -> Day 7: Billing Begins"), and complying 100% with Apple App Store and Google Play subscription transparency guidelines.

### PRECONDITIONS
- Triggered from Soft Paywall (`US-MON-01`), Profile Upgrade Banner (`US-PRF-01`), or explicit `"Upgrade to Pro"` CTA.
- StoreKit 2 / Google Play `ProductDetails` queried alongside backend offerings.

### SCREEN AND UI DETAILS
1. **Top Close Button (`X`) & Header:** Always visibly dismissible (`Soft Paywall` — never trap the user!).
2. **Hero Value Stack:**
   - Personalized headline: *"Unlock Your Full Smart Coach, {name}"*
   - Scannable 4-bullet visual checklist (AI Photo/Voice Log, Barcode Scanner & Grocery List, Adaptive Calorie/Volume Reviews, Unlimited AI Coach Q&A & Cloud Vault).
3. **Trial Timeline Explainer (If `trialEligible == true` — Proven High-Trust Pattern):**
   - `Day 1 (Today):` Instant full Pro access — **0.00 charged today**.
   - `Day 5:` Friendly reminder before trial ends *(via local/push alert if enabled)*.
   - `Day 7:` Subscription begins — cancel anytime in 1 tap via App Store / Google Play.
4. **Plan Selector Cards (Fetched from StoreKit 2 / Play Billing + Backend Offerings):**
   - **Annual Plan (Pre-Selected, `Best Value • Save 45%` badge):** Shows equivalent monthly price + billed yearly total in local currency (e.g., `EGP 999 / year` or `SAR 189 / year`).
   - **Monthly Plan:** Standard monthly billing (e.g., `EGP 149 / month` or `SAR 29 / month`).
5. **Primary CTA & Mandatory Legal Footer:**
   - Dynamic CTA Label:
     - If `trialEligible`: `[Start 7-Day Free Trial]`
     - If prior trial used: `[Subscribe Now for {localizedPrice}]`
   - Secondary Links Row: `[Restore Purchases]` | `[Redeem Offer Code]` *(iOS `presentCodeRedemptionSheet` / Android Play Store promo deep-link for MENA coach campaigns)* | `[Terms of Use]` | `[Privacy Policy]`.
   - **Store-Required Auto-Renewal Fine Print:** Clear readable text noting payment charges to Apple ID / Google Play account at confirmation (or end of 7-day trial) and renews automatically unless cancelled `>= 24 hours` before period end.

### API & BACKEND CONTRACT
1. **`[NEW BACKEND] GET /v1/subscriptions/offerings?platform=android|ios&region=egypt|gulf|levant|maghreb`**
   - Returns active Store product IDs (`curafit_pro_annual`, `curafit_pro_monthly`), trial eligibility (`trialEligible` from `coaching_subscriptions`), promotional badges (`best_value_pct: 45`), and copy tags.
2. **Native Store SDK Product Query:** Always render exact localized currency strings (`formattedPrice`, `introductoryOffer`) directly from Apple StoreKit 2 `Product` / Google Play `ProductDetails` — never hardcode currency strings in UI!

### RULES & BUSINESS LOGIC
1. **Single-Trial-Per-Account Guard:** Both Apple/Google Store IDs AND backend `coaching_subscriptions` track `trialUsed`; once used, CTA automatically switches from `"Start 7-Day Free Trial"` to `"Subscribe Now"` so Apple/Google never reject for misleading trial claims.
2. **Store Billing Load Failure:** If App Store / Play Store product fetch fails (e.g. simulator or store outage), show `[Retry Loading Plans]` cleanly instead of blank price cards.

### MAIN FLOW
1. User taps `[Start 7-Day Free Trial]` on Soft Paywall.
2. `PaywallScreen` renders `GET /v1/subscriptions/offerings` + StoreKit/Play localized prices with Annual (`Save 45%`) pre-selected.
3. User inspects the 7-day timeline and taps `[Start 7-Day Free Trial]` -> Launches native OS payment sheet (`US-MON-03`).

### EDGE CASES
- **User Already Pro (`tier == "premium"`):** If deep-linked accidentally to `PaywallScreen`, auto-redirect cleanly to `ManageSubscriptionScreen` (`US-MON-04`).
- **Store Country Differs From Profile Region (e.g., Egyptian App Store Account Using UAE Profile Region):** Displays currency strictly from Apple/Google Store `Product` localized price metadata rather than profile region heuristics so charged price matches checkout receipt 100%.
- **Offline Paywall Open:** Shows clear offline notice (`"Connect to internet to view live Store pricing & subscribe"`) with `[Retry]` and clean `[Dismiss]`.
- **Arabic RTL Trial Timeline Alignment:** Mirrors Day 1 -> Day 5 -> Day 7 progression steps Right-to-Left cleanly while keeping numeric dates and prices formatted legibly.

### ACCEPTANCE CRITERIA
- **Scenario 1: Localized store currency and trial eligibility display accurately**
  - **Given** user is eligible for trial and store region is Egypt (`EGP`)
  - **When** `PaywallScreen` loads
  - **Then** StoreKit/Play localized EGP pricing displays on Monthly and Annual cards and the CTA reads `[Start 7-Day Free Trial]`.
- **Scenario 2: Ineligible user sees direct subscription CTA instead of misleading Free Trial copy**
  - **Given** `trialEligible == false`
  - **When** `PaywallScreen` opens
  - **Then** trial timeline hides and CTA displays `[Subscribe Now]`.
- **Scenario 3:Store product loading failure recovers gracefully with Retry action**
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
| **Labels** | `production-v2`, `mobile-v2`, `monetization`, `billing`, `storekit2`, `play-billing` |
| **Target Screens** | Native OS Payment Sheet + `PurchaseProcessingOverlay`, `ProUnlockedModal` |
| **Entitlement** | `Freemium` |
| **Backend Status** | `New` (`POST /v1/subscriptions/verify`, `POST /v1/subscriptions/restore`, `POST /v1/webhooks/apple`, `POST /v1/webhooks/google-play`) |

### STORY
As a user tapping Subscribe or Restore Purchases, I want my Apple App Store or Google Play transaction verified securely with CuraFit's server, acknowledged promptly so I am never auto-refunded, and unlocked instantaneously across all my devices.

### PRECONDITIONS
- User tapped Purchase on `PaywallScreen` (`US-MON-02`) or `[Restore Purchases]` on Paywall / Profile.

### SCREEN AND UI DETAILS
1. **Processing State:** Non-blocking spinner overlay *"Confirming your CuraFit Pro membership..."* while verifying receipt with Cloudflare Worker.
2. **Success Celebration Modal (`ProUnlockedModal`):**
   - *"Welcome to CuraFit Pro! 🎉"*
   - Direct button returning right back into the gated action the user originally tried (e.g., `[Scan Barcode Now]` or `[Open Grocery List]`).
3. **Pending / Interrupted State (e.g., Store Pending Payment / Ask-to-Buy):**
   - *"Purchase pending store approval — Pro will activate automatically once confirmed."*
4. **Failure / Restore Empty State:**
   - If Restore finds no active store entitlement: *"No active CuraFit Pro subscription was found for this Apple ID / Google account."*

### API & BACKEND CONTRACT
1. **`[NEW BACKEND] POST /v1/subscriptions/verify`**
   - **Auth:** Required (`Authorization: Bearer <accessToken>`)
   - **Request Body:**
     - **iOS (StoreKit 2):** `{ "platform": "ios", "productId": "curafit_pro_annual", "signedTransactionJws": "<storekit2-jws>", "transactionId": "200000..." }`
     - **Android (Google Play Billing):** `{ "platform": "android", "productId": "curafit_pro_annual", "purchaseToken": "<play-purchase-token>", "orderId": "GPA...." }`
   - **Server Action:** Verifies JWS cryptographically against Apple Root CA / Google Play Developer API (`purchases.subscriptionsv2.get`), **acknowledges Play purchase server-side**, writes `coaching_subscriptions` in D1, updates account `entitlements.tier = "premium"`, and returns the updated `entitlements` object!
2. **`[NEW BACKEND] POST /v1/subscriptions/restore`** -> Accepts array of active StoreKit 2 `currentEntitlements` / Play `queryPurchasesAsync` tokens, validates ownership, and attaches/restores `premium` tier cleanly.
3. **`[NEW BACKEND] POST /v1/webhooks/apple` & `POST /v1/webhooks/google-play`** -> Real-time Apple App Store Server Notifications V2 & Google Play RTDN Pub/Sub handlers for renewals, cancellations, refunds, and billing grace transitions.
   - Error Codes: `400 INVALID_SUBSCRIPTION_RECEIPT`, `409 SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`, `503 BILLING_VERIFICATION_UNAVAILABLE` (`retryable: true`).

### RULES & BUSINESS LOGIC
1. **Finish Transaction ONLY After Server Verification:** Never call `transaction.finish()` (iOS) or `acknowledgePurchase` (Android) until `POST /v1/subscriptions/verify` commits `200 OK` (or `409` duplicate already verified for this user), ensuring failed network transactions automatically retry on next launch!
2. **Cross-Account Store Receipt Guard (`SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`):** If a single Apple ID / Google account tries to restore an active subscription already bound to a different CuraFit `userId`, inform user clearly *"This store subscription is already linked to another CuraFit account."* (or support explicit transfer policy if allowed by product rules).

### MAIN FLOW
1. User completes Face ID payment inside native StoreKit 2 sheet for `curafit_pro_annual` (7-day Free Trial).
2. Client obtains signed `Transaction.jwsRepresentation` and calls `POST /v1/subscriptions/verify`.
3. Cloudflare Worker verifies Apple JWS, records active trial in D1 (`expiresAt = +7 days`), and returns updated `entitlements` (`tier: "premium"`).
4. Client calls `transaction.finish()`, updates SQLDelight `entitlements`, displays `ProUnlockedModal`, and returns straight to the user's requested feature!

### EDGE CASES
- **Network Drop After Google/Apple Charged User Before Server Verify Returned:** Unfinished transaction remains in OS Store queue (`Transaction.updates` / `queryPurchasesAsync`); on next foreground/retry, client automatically re-submits `POST /v1/subscriptions/verify` silently without charging twice!
- **User Cancels Native OS Payment Dialog:** Return cleanly to `PaywallScreen` with zero error alerts.
- **Ask-to-Buy / Deferred Pending Payment (`PURCHASE_STATE_PENDING`):** Displays non-blocking status banner *"Waiting for family/bank approval — Pro activates automatically once Store confirms"* and never calls `verify` until Store transitions to purchased!
- **Same Apple ID / Google Account Restored on Wrong CuraFit Account (`409 SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT`):** Clearly informs user which sign-in account currently holds the subscription without overwriting ownership silently.

### ACCEPTANCE CRITERIA
- **Scenario 1: Verified StoreKit 2 / Play purchase unlocks Pro entitlements immediately**
  - **Given** user completes a valid purchase on iOS or Android
  - **When** `POST /v1/subscriptions/verify` returns `200 OK`
  - **Then** `entitlements.tier` becomes `"premium"`, OS transaction is finished/acknowledged, and Pro features unlock immediately.
- **Scenario 2: Interrupted verification auto-recovers on next launch**
  - **Given** network dropped before `verify` finished
  - **When** app restarts with connectivity
  - **Then** Store listener detects unfinished transaction, retries `POST /v1/subscriptions/verify`, and activates Pro cleanly.
- **Scenario 3: Restore purchases when Store has no active entitlement fails cleanly**
  - **Given** user taps `[Restore Purchases]` with zero active StoreKit/Play receipts
  - **When** `POST /v1/subscriptions/restore` completes
  - **Then** user stays on `free` tier with clear localized message *"No active CuraFit Pro subscription found for this store account."*

### ANALYTICS
- `subscription_purchase_started` (`platform`: `"ios" | "android"`, `product_id`: `string`)
- `subscription_verified_success` (`platform`: `string`, `product_id`: `string`, `is_trial`: `boolean`)
- `subscription_purchase_failed` (`platform`: `string`, `error_code`: `string`)
- `subscription_restored` (`found_active`: `boolean`)

---

## US-MON-04: Subscription Management, Trial Countdown, Billing Grace Period & Zero-Data-Loss Downgrade

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-MON-04` |
| **Epic** | `EPIC-10` |
| **Priority** | `Medium` |
| **Labels** | `production-v2`, `mobile-v2`, `monetization`, `retention`, `billing` |
| **Target Screens** | `ManageSubscriptionScreen`, `BillingGraceBanner` |
| **Entitlement** | `Freemium` |
| **Backend Status** | `Modified` (`GET /v1/entitlements`) |

### STORY
As a CuraFit Pro subscriber (or returning Free user whose trial or subscription ended), I want clear visibility into my plan status, renewal/trial-end date, 1-tap access to cancel or switch plans in Apple/Google settings, clear payment-retry reminders during a billing grace period, and absolute guarantee that **none of my historical data or logs are ever deleted** if my Pro plan expires.

### PRECONDITIONS
- User navigates to `Profile -> Subscription & Billing` (or sees a billing grace banner on Today).

### SCREEN AND UI DETAILS
1. **Manage Subscription Screen (`ManageSubscriptionScreen`):**
   - **Active Trial State:** `"CuraFit Pro (7-Day Free Trial)"` • `"Trial ends on {date} — then {price}"` • `[Manage / Cancel in Apple/Google Subscriptions]`.
   - **Active Paid State:** `"CuraFit Pro (Annual / Monthly)"` • `"Renews automatically on {date}"` • `[Manage / Switch Plan in Store Settings]`.
   - **Cancelled But Still Active Until Period End:** `"Auto-renewal off — Pro access continues until {expiresAt}"` • `[Resubscribe]` button.
   - **Grace Period / Billing Issue Banner (`isInGracePeriod == true`):**
     - Gentle non-blocking top banner on Today & Profile: *"Payment issue detected — update your payment method in {Apple/Google} to avoid losing Pro features."* + `[Update Payment Method]`.
   - **Expired / Free State:** `"Free Plan"` • Clear note `"All your logs, photos, and active plans are safely preserved!"` • `[Upgrade to Pro]` + `[Restore Purchases]`.

### API & BACKEND CONTRACT
1. **`[MODIFIED BACKEND] GET /v1/entitlements`**
   - Returns `{ tier, status ("active" | "trialing" | "grace_period" | "cancelled_active" | "expired" | "none"), productId, provider ("apple" | "google"), expiresAt, autoRenewEnabled, isInGracePeriod, managementUrl }`.
2. **`[NEW BACKEND] Webhooks (`/v1/webhooks/apple` & `/v1/webhooks/google-play`)`** keep status transitions (`DID_FAIL_TO_RENEW` -> `grace_period`, `EXPIRED` -> `free`) updated asynchronously in D1 even when the user hasn't opened the app.

### RULES & BUSINESS LOGIC
1. **Zero-Data-Loss Downgrade Guarantee:**
   - When a Pro user downgrades to `free`:
     - All existing active nutrition & workout plans remain 100% readable and loggable!
     - All previously logged meals (including past AI-logged or barcode-logged meals), measurements, workout PRs, and coach chat history remain 100% intact and readable (`GET /v1/account/export` still exports everything!).
     - Only **new** Pro actions (new AI parse, new barcode scan, generating a new grocery list, triggering new paid plan renewal beyond free quota) gracefully show the Soft Paywall (`US-MON-01`).
     - Any cloud-stored progress photos beyond the 6 free local limit remain stored safely in R2 (read-only view & delete still allowed — never held hostage or deleted on downgrade!).
2. **Native Store Management & Cross-Platform Awareness:**
   - **Same-Platform Store Management:** On iOS with `provider == "apple"`, opens `AppStore.showManageSubscriptions(in:)`. On Android with `provider == "google"`, opens `https://play.google.com/store/account/subscriptions?sku={productId}&package=com.curafit.app`.
   - **Cross-Platform Subscription Viewing (e.g., Subscribed on iOS, Signed Into Android Phone):** Full Pro features unlock seamlessly via D1 `entitlements`, while `ManageSubscriptionScreen` displays *"Managed via Apple App Store on your iOS device"* (or Google Play on Android) with zero broken OS store sheet calls!
   - **Account Deletion Cross-Link (`US-PRF-06`):** If user triggers Permanent Account Deletion while `status in ["active", "trialing", "grace_period"]`, both `US-PRF-06` and this story surface a direct `[Manage Store Subscription]` link so billing never unexpectedly auto-renews after account erasure.

### MAIN FLOW
1. User is on Day 6 of their Free Trial and opens `Profile -> Subscription & Billing`.
2. Screen shows `"Trial ends tomorrow (Nov 22)"` and `[Manage in App Store]`.
3. If user decides to cancel in App Store, Apple sends RTDN webhook -> `entitlements.status` updates cleanly to `"cancelled_active"` until Nov 22, after which `tier` returns to `"free"` with 100% of their diary and workouts preserved!

### EDGE CASES
- **Apple / Google Billing Retry Succeeds After 3 Days in Grace Period:** Webhook restores `status: "active"`, removes `BillingGraceBanner`, and preserves uninterrupted history.
- **iOS Subscriber Logs Into Android Tablet:** Pro unlocks seamlessly across OS boundaries via server `entitlements`, and billing instructions clearly point to Apple App Store settings.
- **Store Refund Webhook Received (`REFUNDED` / `REVOKED`):** Immediately transitions `entitlements.tier` back to `"free"` cleanly without wiping user's logged food or workout history.
- **Offline Subscription Status View:** Reads last synced `entitlements` metadata cleanly from SQLDelight showing cached expiry date alongside subtle `"Offline — live status refreshes when online"`.

### ACCEPTANCE CRITERIA
- **Scenario 1: Downgrade from Pro to Free retains all user history and cloud photos read access**
  - **Given** a Pro user had 12 cloud progress photos, 30 days of AI-logged meals, and 10 AI coach threads
  - **When** their subscription expires (`tier = "free"`)
  - **Then** all historical logs, plans, existing chat history, and existing cloud photos remain viewable/deletable/exportable without any data loss.
- **Scenario 2: Billing grace period shows non-blocking payment update banner**
  - **Given** `entitlements.isInGracePeriod == true` and `tier == "premium"`
  - **When** Today Dashboard opens
  - **Then** Pro features remain accessible during the store grace period alongside the gentle `[Update Payment Method]` banner.
- **Scenario 3: Cross-platform subscriber sees accurate billing-origin message instead of broken native sheet**
  - **Given** `entitlements.provider == "apple"` and user views `ManageSubscriptionScreen` on Android
  - **When** tapping billing management details
  - **Then** Pro remains active on Android and the UI explains `"Subscription billed through Apple App Store"` instead of crashing a Google Play URI.

### ANALYTICS
- `subscription_manage_viewed` (`status`: `string`, `provider`: `string | null`)
- `subscription_store_settings_opened` (`platform`: `"ios" | "android"`, `in_grace_period`: `boolean`)
- `subscription_status_changed` (`from_status`: `string`, `to_status`: `string`)
