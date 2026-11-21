# EPIC-02: Passwordless Social Authentication, Session Lifecycle & Cross-Device Sync

> **Epic ID:** `EPIC-02` *(Replaces legacy Jira Epic `KAN-5: Login`)*
> **Target Platforms:** KMM (Android & iOS)
> **Scope:** Production (Passwordless Social-Only Auth: Google Sign-In + Apple Sign-In — zero email/password forms on mobile)
> **Labels:** `production`, `mobile`, `auth`, `sync`

---

## Epic Overview

`EPIC-02` handles every authentication, session lifecycle, token security, OAuth provider linking, account-conflict resolution, and offline-first synchronization scenario in CuraFit Mobile. Consistent with modern mobile UX and user choice, CuraFit mobile uses **Social-Only Passwordless Sign-In** (**Google Sign-In** on Android & iOS, plus mandatory **Sign in with Apple** on iOS). There is **no email/password login UI, no Forgot Password flow, and no Email Verification flow** in the mobile app; `/v1/auth/register` and `/v1/auth/login` exist on the server strictly as internal Dev/QA/test utility endpoints.

### Child User Stories
- `US-AUTH-01`: Passwordless Social Sign-In Screen (Google & Apple), OAuth Account Linking, Entry Routing & Offline Fallback
- `US-AUTH-02`: Post-Authentication Account Resolution, Plan Conflict Dialog & Mandatory Consent Gate
- `US-AUTH-03`: Persistent Session, Silent Refresh Token Rotation & Security Reuse/Deletion Recovery
- `US-AUTH-04`: App Bootstrap (`ETag` / `304`), Offline Outbox Queue & `409 REVISION_CONFLICT` Auto-Rebase

---

## US-AUTH-01: Passwordless Social Sign-In Screen (Google & Apple), OAuth Account Linking, Entry Routing & Offline Fallback

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-AUTH-01` |
| **Epic** | `EPIC-02` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `auth` |
| **Target Screens** | `SocialLoginScreen` (Modal / Stack Screen), `LinkedProvidersSheet` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a mobile user who wants to sign in or save my personalized coaching plan without memorizing passwords, I want one-tap Google Sign-In and Sign in with Apple options — with safe multi-provider account linking, clear context for where I came from, and graceful offline handling — so that authentication feels effortless and reliable.

### PRECONDITIONS
- The user reaches `SocialLoginScreen` from one of four `entrySource` paths:
  1. `onboarding_account_check`: User tapped *"Yes, I already have an account — Log In"* at Step 0 (`US-MOB-01`).
  2. `onboarding_summary_start_plan`: Unauthenticated user completed onboarding and tapped `[Continue to Log In & Start My Plan]` (`US-MOB-09`).
  3. `session_expired`: An authenticated user's 30-day refresh token expired, was revoked remotely, or triggered `AUTH_REFRESH_TOKEN_REUSED`.
  4. `settings_reauth`: User explicitly signed out (`US-PRF-06`) and taps Sign In again.
- Google Sign-In SDK (Credential Manager on Android / GoogleSignIn SDK on iOS) and Apple `ASAuthorizationController` (on iOS) are configured with client IDs matching server `AUTH_OAUTH_*` verification settings.

### SCREEN AND UI DETAILS
1. **Top Bar:**
   - Contextual Back (`<-` / `X`) button:
     - Enabled for `onboarding_account_check` and `onboarding_summary_start_plan` (returns cleanly to the chat/summary screen without losing any local draft).
     - Hidden for `session_expired` when local unauthenticated mode is disallowed (or offers `"Switch Account"`).
   - Subtle CuraFit brand emblem + localized language badge (Arabic native script label / `English`).
2. **Hero Header (Dynamic Copy by `entrySource`):**
   - `onboarding_summary_start_plan`: Title *"Save & Activate Your Custom Plan"*, Subtitle *"Sign in with one tap to sync your personalized calories, meals, and workouts safely to your account."* (Plus a compact mini-pill preview: `{targetCalories} kcal • {workoutDaysCount} days/wk`).
   - `onboarding_account_check`: Title *"Welcome Back to CuraFit"*, Subtitle *"Sign in with the account you used before to restore your plans and progress."*
   - `session_expired`: Title *"Please Sign In Again"*, Subtitle *"For your security, your session ended. Sign in to continue syncing your progress."*
3. **Authentication Action Buttons (Primary Stack):**
   - **iOS:**
     1. **Sign in with Apple** button (official Apple HIG dark/light pill button, `48pt` height minimum, placed at the top per App Store Review Guideline 4.8).
     2. **Continue with Google** button (official Google branding button, `48pt` height).
   - **Android:**
     1. **Continue with Google** primary button (`48dp` height).
     2. **Continue with Apple** secondary button (available via Apple Web OAuth flow so cross-platform iOS-to-Android switchers can recover their Apple-created account!).
   - **Loading State:** Tapping either button shows an inline spinner inside that button, disables both buttons to prevent double OAuth prompts, and displays *"Signing you in..."*.
4. **Offline Banner / Fallback State:**
   - If device connectivity is offline before tapping or a network timeout occurs:
     - Inline alert card: *"No internet connection. Check your connection and try again."* + `[Retry]`.
     - **Special Fallback ONLY when `entrySource == "onboarding_account_check"`:** Secondary button `[Continue as new user without logging in for now]` -> sets `onboardingDraft.accountCheck = "no"` and navigates straight to `name` (`US-MOB-03`).
     - **Special Fallback ONLY when `entrySource == "onboarding_summary_start_plan"`:** Secondary informational banner noting local `pendingSyncPlan` is safely stored on the phone until online.
5. **Legal Footer:**
   - *"By continuing, you agree to CuraFit's [Terms of Service] and [Privacy Policy]."* (Opens in-app legal sheet without losing auth state).

### API & BACKEND CONTRACT
1. **`POST /v1/auth/oauth/google`**
   - **Auth:** Public (`No Auth`)
   - **Headers:** `Content-Type: application/json`, `Accept: application/json`, `X-Client-Platform: android|ios`, `X-Client-Version: <semver>`
   - **Request Body:**
     ```json
     {
       "idToken": "<google-oidc-id-token>",
       "deviceId": "<persistent-device-uuid>",
       "platform": "android",
       "locale": "ar-EG",
       "timezone": "Africa/Cairo",
       "linkExisting": false
     }
     ```
   - **Success Response (`200 OK` returning user / `201 Created` new user):**
     ```json
     {
       "ok": true,
       "data": {
         "tokenType": "Bearer",
         "accessToken": "<hs256-jwt>",
         "expiresIn": 900,
         "expiresAt": "2026-11-21T12:45:00.000Z",
         "refreshToken": "cfrt_...",
         "refreshExpiresIn": 2592000,
         "refreshExpiresAt": "2026-12-21T12:30:00.000Z",
         "sessionId": "sess_<uuid>",
         "isNewUser": true,
         "provider": "google",
         "user": {
           "userId": "user:<uuid>",
           "email": "user@gmail.com",
           "name": "Ahmed Mohamed",
           "avatarUrl": "https://...",
           "entitlement": "free",
           "createdAt": "2026-11-21T12:30:00.000Z"
         }
       },
       "meta": { "requestId": "<uuid>", "serverTime": "<iso8601>" }
     }
     ```
2. **`POST /v1/auth/oauth/apple`**
   - **Auth:** Public (`No Auth`)
   - **Request Body:**
     ```json
     {
       "identityToken": "<apple-jwt-identity-token>",
       "authorizationCode": "<apple-auth-code>",
       "fullName": "Sara Ali",
       "deviceId": "<persistent-device-uuid>",
       "platform": "ios",
       "locale": "ar-EG",
       "timezone": "Africa/Cairo",
       "linkExisting": false
     }
     ```
   - **Notes:**
     - Apple only sends `fullName` on the user's very first sign-in; mobile MUST capture `fullName` if non-null and send it so the backend persists `user.name`. Subsequent Apple sign-ins match by verified `sub` claim (`oauth_subject`).
     - Apple `authorizationCode` is exchanged server-side for a real Apple refresh token and stored encrypted in D1 (`apple_refresh_token_enc`), so GDPR permanent deletion (`DELETE /v1/account/delete`) revokes Sign in with Apple automatically per Apple Guideline 5.1.1(v).
3. **Authenticated OAuth Provider Management Endpoints (Account Security / Profile):**
   - **`GET /v1/auth/oauth/providers`**: Lists linked OAuth providers (`{ items: [{ provider, email, linkedAt }] }`).
   - **`POST /v1/auth/oauth/link`**: Links an additional provider (`{ provider: "google" | "apple", idToken? | identityToken?, authorizationCode? }`) to the currently signed-in account.
   - **`DELETE /v1/auth/oauth/{provider}`**: Unlinks a secondary provider; blocks unlinking the user's only remaining sign-in method with **`409 CANNOT_UNLINK_LAST_AUTH_METHOD`** (and returns `404 OAUTH_PROVIDER_NOT_LINKED` if not linked).
   - **Error Codes Handled:**
     - `401 AUTH_OAUTH_TOKEN_INVALID`: Expired, malformed, or wrong-audience Google/Apple ID token -> Show *"Sign-in verification failed. Please try again."*
     - *(Note on previously deleted accounts: Because GDPR deletion in `US-PRF-06` unlinks `coaching_oauth_identities`, a previously deleted Google/Apple user signing in fresh creates a brand-new empty account (`isNewUser: true`, `profile: null`), whereas stale tokens from the deleted account fail with `401 ACCOUNT_DELETED`.)*
     - `409 AUTH_PROVIDER_EMAIL_CONFLICT`: Account email already exists under a different sign-in provider (`params.existingProvider`) -> Prompt the user to confirm linking this provider to their existing account, then retry `POST /v1/auth/oauth/google` or `/apple` with **`linkExisting: true`**.
     - `409 CANNOT_UNLINK_LAST_AUTH_METHOD`: Attempted to unlink the sole remaining sign-in method -> Inform user to link another provider before unlinking.
     - `429 RATE_LIMITED`: Auth rate limit (`30 req/min/IP`) -> Show cooldown retry message using `error.params.retryAfterSeconds`.
     - `503 AUTH_JWKS_UNAVAILABLE`: Upstream Google/Apple JWKS unreachable -> Show retryable error button.

### RULES & BUSINESS LOGIC
1. **No Password UI Anywhere:** Mobile builds strictly omit email/password login forms, registration forms, forgot-password flows, and email-verification flows. (`/v1/auth/register` and `/v1/auth/login` exist solely as internal Dev/QA/test utility endpoints.)
2. **Token Storage:** Save `accessToken`, `refreshToken`, `sessionId`, and `userId` exclusively inside platform-secure storage (**Android EncryptedSharedPreferences / Keystore**, **iOS Keychain**). Never write tokens to plaintext `SharedPreferences`, `UserDefaults`, or crash logs.
3. **Cancellation Safety:** If the user dismisses the native Google account picker or Apple Sign-In sheet (`canceled`), perform zero API calls, show zero error toasts, re-enable buttons, and remain safely on `SocialLoginScreen`.
4. **Google Play Services Missing (Android):** Catch `GooglePlayServicesNotAvailableException` / Credential Manager unavailability and offer the `"Continue with Apple"` fallback or prompt *"Google Play Services is required for Google Sign-In. Update Google Play Services or use Apple Sign-In."*
5. **Social Display Name Retention:** Store `user.name` into `socialNameSuggestion` for Step 1 (`name`) in `US-MOB-03`, never overwriting a name the user already typed during onboarding unless empty.
6. **Unauthenticated & Incomplete-Onboarding Deep-Link Redirect (`US-INT-03` / `US-PRG-05`):** If an unauthenticated or mid-onboarding user taps a push notification or Home Screen Widget (`curafit://...`), persist `pendingDeepLinkRoute` locally, route first through `SocialLoginScreen` (and finish/restore Onboarding if `profile == null`), and replay `pendingDeepLinkRoute` automatically only after authentication and bootstrap hydration succeed.

### MAIN FLOW
1. User reaches `SocialLoginScreen` from `onboarding_summary_start_plan`.
2. User taps **Continue with Google** (or **Sign in with Apple**).
3. Native OS account picker / biometric sheet appears; user selects their account and confirms.
4. Mobile receives the OIDC `idToken` (Google) or `identityToken` + `authorizationCode` + `fullName` (Apple) and calls `POST /v1/auth/oauth/google` (or `/apple`).
5. Backend verifies the token signature cryptographically against Google/Apple JWKS via WebCrypto, exchanges Apple `authorizationCode` for an encrypted refresh token if provided, creates or fetches the user row (`coaching_users` + `coaching_oauth_identities`), creates a session + rotating refresh token in D1, and returns the token pair.
6. Mobile stores tokens securely in Keychain/Keystore and immediately transitions to `US-AUTH-02` (Post-Auth Account Resolution).

### EDGE CASES
- **Apple Hide My Email (`privaterelay.appleid.com`):** Accepted seamlessly as a valid email; `sub` (`apple:<subject>`) is the immutable primary identity key in `coaching_oauth_identities`.
- **User Kills App While OAuth Request Is In-Flight:** On cold relaunch, since `onboardingCompleted == false` and tokens were not persisted yet, app opens right back at `pendingSyncPlan` / `summary` (`US-MOB-01`) with zero lost onboarding answers.
- **Same Email on Google & Apple (Explicit Linking):** If the verified email already belongs to an existing account under another provider, the backend returns `409 AUTH_PROVIDER_EMAIL_CONFLICT` to prevent silent takeover; the app prompts the user to confirm linking and retries with `linkExisting: true` (or lets authenticated users manage providers via `GET/POST/DELETE /v1/auth/oauth/*`).
- **Double-Tap on Sign-In Button:** Disabled immediately after first tap until OAuth flow returns success, cancellation, or error.

### ACCEPTANCE CRITERIA
- **Scenario 1: Successful Apple Sign-In on iOS**
  - **Given** the user is on `SocialLoginScreen` on iOS
  - **When** the user taps `Sign in with Apple` and authorizes Face ID
  - **Then** `POST /v1/auth/oauth/apple` returns `200/201` with `accessToken` and `refreshToken`, tokens are saved to iOS Keychain, and post-auth resolution runs.
- **Scenario 2: User cancels Google account picker**
  - **Given** the user tapped `Continue with Google`
  - **When** the user dismisses the native OS picker without picking an account
  - **Then** no error message is shown, buttons re-enable, and all local `onboardingDraft` / `pendingSyncPlan` data remains intact.
- **Scenario 3: Offline fallback from Step 0 `account_check`**
  - **Given** the user came from `onboarding_account_check` and the device is offline
  - **When** the login attempt fails due to network unavailability
  - **Then** the screen displays an offline message alongside `[Continue as new user without logging in for now]`, which routes cleanly into the `name` onboarding step.

### ANALYTICS
- `auth_screen_viewed` (`entry_source`: `string`)
- `auth_provider_clicked` (`provider`: `"google" | "apple"`, `entry_source`: `string`)
- `auth_completed` (`provider`: `"google" | "apple"`, `is_new_user`: `boolean`, `duration_ms`: `number`)
- `auth_cancelled` (`provider`: `"google" | "apple"`, `entry_source`: `string`)
- `auth_failed` (`provider`: `"google" | "apple"`, `error_code`: `string`)

---

## US-AUTH-02: Post-Authentication Account Resolution, Plan Conflict Dialog & Mandatory Consent Gate

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-AUTH-02` |
| **Epic** | `EPIC-02` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `auth`, `onboarding` |
| **Target Screens** | `PostAuthResolutionOverlay`, `PlanConflictModal`, `HealthConsentModal` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a newly authenticated user, I want the app to automatically determine whether my account is brand new, has an existing cloud plan, or has pending local onboarding answers — and let me safely choose how to resolve any conflict — so I never accidentally lose my old progress or my newly generated plan.

### PRECONDITIONS
- User has just received a valid `accessToken` + `refreshToken` pair from `US-AUTH-01`.
- Client knows `entrySource` and whether `pendingSyncPlan` exists locally.

### SCREEN AND UI DETAILS
1. **Resolving Account State Spinner:**
   - Full-screen clean loading indicator: *"Checking your coaching profile..."* while fetching `GET /v1/bootstrap`.
2. **Conflict Resolution Bottom Sheet / Modal (Shown ONLY when `serverProfile != null` AND conflict applies):**
   - **Variant A — `entrySource == "onboarding_account_check"` (Data Recovery Prompt, matching `KAN-35`):**
     - Title: *"Welcome Back! Saved Plan Found"*
     - Summary Pill: Displays saved server profile snapshot (`Goal`, `Current/Target Calories`, `Last Updated Date`).
     - Primary Button: `[Restore My Saved Data (Go to Today)]`
     - Secondary Button: `[Start Fresh From the Beginning]`
   - **Variant B — `entrySource == "onboarding_summary_start_plan"` & `pendingSyncPlan != null` (New vs. Old Plan Conflict, matching `KAN-43`):**
     - Title: *"Existing Account Plan Detected"*
     - Body: *"This account already has a previously saved plan ({oldCalories} kcal • {oldSplit}). Would you like to activate the new plan you just built ({newCalories} kcal • {newSplit}), or restore your old saved plan?"*
     - Primary Button: `[Use My New Plan (Update Account)]`
     - Secondary Button: `[Restore My Old Saved Plan]`
3. **Mandatory Health & Privacy Consent Gate (`HealthConsentModal`):**
   - Deterministically gated using `data.consents` returned by `GET /v1/bootstrap` (also queryable via `GET /v1/account/consents`): triggered if the server has no accepted `health_data_processing` (`v1.0.0`) consent yet (or policy version bumped):
   - Plain-language explanation: *"CuraFit calculates personalized nutrition and workout targets using your health, body, and recovery inputs. It provides structured fitness guidance, not medical diagnosis or treatment."*
   - Required checkbox + `[Agree & Continue]` button.

### API & BACKEND CONTRACT
1. **`GET /v1/bootstrap`**
   - **Headers:** `Authorization: Bearer <accessToken>`, `Accept: application/json`
   - **Key Fields Inspected:** `data.revision`, `data.onboardingCompleted`, `data.onboarding` (`object | null`), `data.profile`, `data.consents` (deterministic `HealthConsentModal` gate), `data.preferences`, `data.activeNutritionPlanRef`, `data.activeWorkoutPlanRef`, `data.eligibility`, `data.todaySummary`, `data.unreadCoachingInboxCount`, `data.streakSummary`, `data.engagementState`, `data.pendingAdaptations`, `data.entitlements`, `data.notificationPreferences`.
2. **`POST /v1/account/consents`** (plus **`GET /v1/account/consents`** for standalone consent audit)
   - **Request Body:** `{ "consentType": "health_data_processing", "version": "1.0.0", "accepted": true }`
3. **`POST /v1/commands?view=full` (`action: "generate"`)**
   - Used when uploading `pendingSyncPlan` to either a new account (`revision: 0`) or overwriting an existing account (`revision: <serverRevision>`, `payload.overwriteExisting: true`; omitting overwrite with `overwriteExisting: false` returns `409 PROFILE_ALREADY_EXISTS`).
4. **`GET /v1/plans/{planId}` & `GET /v1/workout-plans/{id}`**
   - Used when restoring an existing server plan so Today/Nutrition/Workouts load complete 7-day schedules into SQLDelight immediately.
5. **`POST /v1/auth/claim-anonymous`** *(Legacy / web-migration only — not used by native mobile fresh auth)*:
   - Request Body: `{ "anonymousUserId": "anon:...", "consent": true }`
   - Error Codes: `403 ANONYMOUS_OWNERSHIP_REQUIRED`, `409 ANONYMOUS_ALREADY_CLAIMED`, `409 TARGET_ACCOUNT_NOT_EMPTY`.

### RULES & BUSINESS LOGIC
1. **Routing Matrix After `GET /v1/bootstrap` (Canonical Auth States: `signed_in_needs_onboarding` & `signed_in_active`):**
   - **Case 1: `entrySource == "onboarding_account_check"` + `data.profile == null` (`signed_in_needs_onboarding`)**:
     - Keep `isAuthenticated = true`, set auth state to `signed_in_needs_onboarding`, pre-fill `socialNameSuggestion`, and return to Onboarding Chat (`US-MOB-01` Scenario 3A).
   - **Case 2: `entrySource == "onboarding_account_check"` + `data.profile != null` (`signed_in_active`)**:
     - Present Conflict Variant A (`Restore` vs `Start Fresh`).
     - `Restore`: Fetch active nutrition/workout plans + last 14 days of logs, hydrate SQLDelight, set `onboardingCompleted = true` (`signed_in_active`), replace stack to `Today`.
     - `Start Fresh`: Keep `isAuthenticated = true`, transition local onboarding state to `signed_in_needs_onboarding` with cleared draft, and route to `name` (`US-MOB-03`). Old server data stays untouched until user completes Summary and taps `[Start My Plan]`.
   - **Case 3: `entrySource == "onboarding_summary_start_plan"` + `data.profile == null` (`signed_in_needs_onboarding`)**:
     - Record consent (`POST /v1/account/consents`), upload `pendingSyncPlan` via `POST /v1/commands?view=full` (`action: "generate"`), set `onboardingCompleted = true` (`signed_in_active`), clear `pendingSyncPlan`, and route to `Today`.
   - **Case 4: `entrySource == "onboarding_summary_start_plan"` + `data.profile != null` (`signed_in_active`)**:
     - Present Conflict Variant B (`Use New Plan` vs `Restore Old Plan`).
     - `Use New Plan`: Record consent, call `generate` with `revision: data.revision` and `overwriteExisting: true` (server archives previous profile/plans into `s.history` & `s.workoutArchives` without deleting historical logs).
     - `Restore Old Plan`: Discard `pendingSyncPlan`, fetch server plans into SQLDelight, set `onboardingCompleted = true` (`signed_in_active`), route to `Today`.
   - **Case 5: `entrySource == "session_expired"`**:
     - If `data.profile != null`, silently reconcile any pending local offline outbox queue (`US-AUTH-04`) against the server (if same `userId`), or clear old user's local cache and hydrate new `userId`'s data if user signed in with a different account!
2. **Account Switch Guard (`previousUserId != newUserId`):**
   - If the newly authenticated `userId` differs from the previously cached local `userId`, wipe all prior user SQLDelight tables (`food_entries`, `workout_logs`, `plans`, `photos_cache`) **before** hydrating the new account so zero cross-user data leakage occurs.
3. **Upload Failure Resilience:** Never delete `pendingSyncPlan` until `POST /v1/commands` (`action: "generate"`) returns `200 OK`. If upload fails due to network timeout, allow retry with the **exact same `Idempotency-Key`** (note: server `Idempotency-Key` digest excludes `revision` so a timeout + revision rebase replays cleanly). Do NOT enter `Today` offline before initial `generate` succeeds.

### MAIN FLOW
1. Authentication succeeds in `US-AUTH-01`.
2. App invokes `GET /v1/bootstrap`.
3. Server returns `profile != null` while user came from `onboarding_summary_start_plan`.
4. Conflict Resolution sheet appears showing Old Plan vs. New Plan summary.
5. User taps `[Use My New Plan (Update Account)]`.
6. App posts consent (`POST /v1/account/consents`), executes `POST /v1/commands?view=full` (`action: "generate"`, `revision: serverRev`, `overwriteExisting: true`), commits the response into SQLDelight, clears `pendingSyncPlan`, and replaces navigation stack to `Today`.

### EDGE CASES
- **Upload Fails Mid-Way (`503 DATABASE_UNAVAILABLE` or Timeout):** Keep user signed in, preserve `pendingSyncPlan`, show *"Could not save your plan right now. Please try again."* with `[Retry]` reusing the exact same `Idempotency-Key`.
- **Legacy `workouts_only` Account Restored Without `healthConfirmed` or With `saturday_0` Schedule:** `data.eligibility.needsHealthConfirmation` or `needsScheduleConfirmation` is `true` -> `US-WRK-01` immediately surfaces the confirmation sheet on arrival.
- **Consent Declined:** User tapping `"Decline"` on `HealthConsentModal` cannot proceed to `Today`; offers `"Review Terms Again"` or `"Sign Out"` (`POST /v1/auth/logout`).
- **`409 REVISION_CONFLICT` During `generate` Overwrite (Another Device Simultaneously Updated Account):** Re-fetch `GET /v1/bootstrap` to obtain latest `revision` and confirm conflict choice cleanly.

### ACCEPTANCE CRITERIA
- **Scenario 1: New user completes onboarding then signs in with new Google account**
  - **Given** `pendingSyncPlan` exists locally and `entrySource == "onboarding_summary_start_plan"`
  - **When** Google Sign-In succeeds and `GET /v1/bootstrap` returns `profile == null` (`signed_in_needs_onboarding`)
  - **Then** the app records consent, calls `POST /v1/commands?view=full` (`action: "generate"`), sets `onboardingCompleted = true` (`signed_in_active`), clears `pendingSyncPlan`, and navigates to `Today`.
- **Scenario 2: Existing account login during Step 0 offers Restore vs. Start Fresh**
  - **Given** `entrySource == "onboarding_account_check"`
  - **When** Apple Sign-In succeeds and `GET /v1/bootstrap` returns an active `profile`
  - **Then** the Conflict Resolution prompt appears with `[Restore My Saved Data]` and `[Start Fresh From the Beginning]`.
- **Scenario 3: Switching accounts on the same phone prevents data leakage**
  - **Given** User A was previously cached locally and signed out
  - **When** User B signs in on the same device
  - **Then** User A's SQLDelight tables are cleared atomically before User B's bootstrap and plans are written.

### ANALYTICS
- `auth_account_resolved` (`resolution`: `"new_onboarding" | "upload_pending_plan" | "conflict_prompt" | "session_resumed"`)
- `auth_plan_conflict_resolved` (`choice`: `"use_new_plan" | "restore_old_plan" | "start_fresh"`, `entry_source`: `string`)
- `account_consent_recorded` (`consent_type`: `string`, `version`: `string`, `accepted`: `boolean`)
- `auth_account_switched` (`had_prior_local_cache`: `boolean`)

---

## US-AUTH-03: Persistent Session, Silent Refresh Token Rotation & Security Reuse Recovery

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-AUTH-03` |
| **Epic** | `EPIC-02` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `auth`, `security` |
| **Target Screens** | Background Ktor Auth Interceptor + `SessionExpiredAlert` -> `SocialLoginScreen` |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a daily CuraFit user, I want to stay signed in seamlessly across app restarts without frequent re-logins, while my short-lived access tokens rotate automatically in the background and compromised tokens are revoked safely.

### PRECONDITIONS
- User has an active `accessToken` (15-minute TTL = `900s`) and rotating opaque `refreshToken` (`cfrt_...`, 30-day TTL = `2592000s`) stored in Keychain / EncryptedSharedPreferences.

### SCREEN AND UI DETAILS
- **Happy Path (Invisible to User):** All refreshes happen silently in the Ktor `AuthInterceptor` without interrupting UI scrolling, workout timers, or meal logging.
- **Session Revoked / Expired Screen Behavior:**
  - If refresh fails permanently (30-day inactivity, remote `"Log Out All Devices"`, `AUTH_REFRESH_TOKEN_REUSED`, `AUTH_REFRESH_TOKEN_CONCURRENT_REUSE`, `AUTH_REFRESH_TOKEN_REVOKED`, `AUTH_USER_NOT_FOUND`, or `ACCOUNT_DELETED`):
  - Present a non-alarming modal dialog (never crash or wipe local unsynced diary/workout logs unless `ACCOUNT_DELETED` or `AUTH_USER_NOT_FOUND`):
    - If `AUTH_REFRESH_TOKEN_EXPIRED`: *"Your session expired after inactivity. Sign in again to resume syncing."*
    - If `AUTH_REFRESH_TOKEN_REUSED` / `AUTH_REFRESH_TOKEN_CONCURRENT_REUSE` / `AUTH_REFRESH_TOKEN_REVOKED` / `AUTH_SESSION_REVOKED` / `AUTH_ALL_SESSIONS_REVOKED`: *"For your security, your session was signed out. Please sign in again."*
    - Button: `[Sign In]` -> Navigates to `SocialLoginScreen` (`entrySource = "session_expired"`).

### API & BACKEND CONTRACT
1. **`POST /v1/auth/refresh`**
   - **Auth:** Public (`No Auth`, uses `refreshToken` in body)
   - **Headers:** `Content-Type: application/json`, `Accept: application/json`
   - **Request Body:** `{ "refreshToken": "cfrt_...", "deviceId": "<device-uuid>" }`
   - **Success Response (`200 OK`):** Returns new `accessToken`, `expiresIn` (`900`), `expiresAt`, **newly rotated `refreshToken` (`cfrt_...`)**, `refreshExpiresIn` (`2592000`), `sessionId`, `user`.
   - **Error Codes:**
     - `401 AUTH_REFRESH_TOKEN_INVALID`: Unrecognized token -> Clear tokens, route to `SocialLoginScreen`.
     - `401 AUTH_REFRESH_TOKEN_REUSED` / `AUTH_REFRESH_TOKEN_CONCURRENT_REUSE`: Already-rotated token replayed (or concurrent double-refresh race); server revokes entire session -> Clear tokens, prompt re-auth.
     - `401 AUTH_REFRESH_TOKEN_REVOKED`: Refresh token explicitly revoked -> Clear tokens, prompt re-auth.
     - `401 AUTH_REFRESH_TOKEN_EXPIRED`: 30-day TTL elapsed -> Prompt re-auth.
     - `401 AUTH_SESSION_REVOKED` / `AUTH_ALL_SESSIONS_REVOKED`: Revoked from another device -> Prompt re-auth.
     - `401 AUTH_USER_NOT_FOUND`: Underlying user record no longer exists -> Clear tokens and local cache cleanly, reset to `US-MOB-01`.
     - `401 ACCOUNT_DELETED`: Account permanently deleted -> Wipe local user data cleanly and return to `US-MOB-01` fresh install state!
2. **`GET /v1/auth/session`**
   - **Auth:** `Authorization: Bearer <accessToken>`
   - **Use Case:** Optional diagnostic check on active session validity, scopes (`["coach:read","coach:write"]`), `entitlement`, and `expiresAt`.

### RULES & BUSINESS LOGIC
1. **Single-Flight Mutex Lock (Mandatory for Token Rotation Safety):**
   - CuraFit backend enforces **strict refresh-token reuse detection** (`401 AUTH_REFRESH_TOKEN_REUSED` / `AUTH_REFRESH_TOKEN_CONCURRENT_REUSE` revokes the entire session immediately).
   - Therefore, KMM `TokenManager` MUST serialize all refresh attempts behind a single coroutine `Mutex`:
     - If 5 concurrent API calls receive `401 AUTH_TOKEN_EXPIRED` or proactively refresh at `<= 60s` before `expiresAt`, **only 1** request calls `POST /v1/auth/refresh`.
     - The remaining 4 coroutines await the mutex and retry their HTTP calls using the newly persisted `accessToken`.
2. **Atomic Persistence Before Next Request:**
   - Persist both the newly returned `accessToken` AND the newly rotated `refreshToken` synchronously to Keychain / EncryptedSharedPreferences **before** releasing the mutex.
3. **Proactive Refresh Window (`60s` Standard):** Trigger proactive refresh when `currentTime >= expiresAt - 60 seconds` (`<= 60s` remaining) on foreground resume or before dispatching any queued write command.
4. **Offline Grace Behavior:** If `POST /v1/auth/refresh` fails due to `IOException` / offline network (`!isHttp401`), **do NOT log the user out**! Keep the user inside the app in Offline Mode reading cached SQLDelight plans and queuing mutations in the local outbox (`US-AUTH-04`) until connectivity returns.

### MAIN FLOW
1. User opens the app 2 days after last use (`accessToken` expired, `refreshToken` valid).
2. `TokenManager` acquires the refresh `Mutex` and calls `POST /v1/auth/refresh`.
3. Server validates and rotates the refresh token, returning a fresh 15-min `accessToken` and new `refreshToken`.
4. `TokenManager` commits both tokens atomically, releases the mutex, and `GET /v1/bootstrap` runs seamlessly.
5. User lands directly on `Today` without seeing any login prompt.

### EDGE CASES
- **App Killed After Server Rotated Refresh Token But Before Client Saved It (Rare Crash Window):** Subsequent launch gets `401 AUTH_REFRESH_TOKEN_REUSED`; client gracefully signs out local session tokens (preserving offline unsynced outbox items tagged to `userId` in case the same user signs right back in!) and opens `SocialLoginScreen` (`entrySource = "session_expired"`).
- **Concurrent Calls on App Resume (`bootstrap` + `brief` + `wearables/ingest`):** Single-flight `Mutex` guarantees only 1 `/v1/auth/refresh` call fires across all coroutines.
- **User Revoked All Devices From Another Phone (`POST /v1/auth/revoke`):** Next API call returns `401 AUTH_ALL_SESSIONS_REVOKED`; client prompts re-auth cleanly.
- **Widget Extension Refreshes While Main App Refreshes Token (`US-PRG-05`):** Shared Keychain App Group / Android WorkManager inter-process lock serializes `refreshToken` access so OS Widget timeline updates never trigger `AUTH_REFRESH_TOKEN_REUSED` / `AUTH_REFRESH_TOKEN_CONCURRENT_REUSE` races.

### ACCEPTANCE CRITERIA
- **Scenario 1: Concurrent requests on expired JWT trigger only one refresh call**
  - **Given** `accessToken` is expired and 3 parallel endpoints fire simultaneously
  - **When** Ktor interceptor intercepts the `401 AUTH_TOKEN_EXPIRED` responses
  - **Then** exactly 1 call is made to `POST /v1/auth/refresh`, the new rotated `refreshToken` is saved atomically, and all 3 endpoints succeed with the new `accessToken`.
- **Scenario 2: Offline launch keeps user logged in**
  - **Given** the device has no internet connection and `accessToken` is past `expiresAt`
  - **When** the user launches the app
  - **Then** the user is NOT logged out, sees cached Today/Nutrition/Workout plans from SQLDelight, and can log actions offline into the outbox.
- **Scenario 3: Revoked or deleted account clears session cleanly**
  - **Given** the user's account was deleted from another device
  - **When** refresh returns `401 ACCOUNT_DELETED` (or `401 AUTH_USER_NOT_FOUND`)
  - **Then** all local tokens and user health records are wiped and the app resets to Onboarding Step 0 (`US-MOB-01`).

### ANALYTICS
- `auth_token_refreshed` (`trigger`: `"proactive" | "reactive_401"`)
- `auth_session_invalidated` (`reason_code`: `string`)

---

## US-AUTH-04: App Bootstrap (`ETag` / `304`), Offline Outbox Queue & `409 REVISION_CONFLICT` Auto-Rebase

### METADATA
| Field | Value |
| :--- | :--- |
| **Story ID** | `US-AUTH-04` |
| **Epic** | `EPIC-02` |
| **Priority** | `Highest` |
| **Labels** | `production`, `mobile`, `sync`, `offline` |
| **Target Screens** | Global Sync Engine + Top Subtle Sync Status Pill (`Synced ✓` / `Offline — N Pending` / `Syncing...`) |
| **Entitlement** | `Free` |
| **Backend Status** | `Implemented` |

### STORY
As a user who logs meals and workouts inside gyms with poor Wi-Fi or across multiple phones, I want my actions to apply optimistically offline, sync silently with idempotency protection, and automatically resolve multi-device revision conflicts without ever losing my logs or showing cryptic sync errors.

### PRECONDITIONS
- User is authenticated with `onboardingCompleted == true`.
- KMM SQLDelight local store maintains `localRevision`, `lastSeqCursor`, `bootstrapEtag`, and an ordered `outbox_commands` table (`idempotencyKey`, `action`, `payloadJson`, `status`, `createdAt`).

### SCREEN AND UI DETAILS
1. **Non-Intrusive Global Sync Indicator (Top App Bar Pill when Offline or Syncing):**
   - `Synced`: Hidden (clean UI — no clutter when everything is up to date).
   - `Offline with Queued Actions`: Compact amber/slate pill *"Offline • {N} change(s) saved on phone"*.
   - `Syncing`: Subtle pulsing indicator *"Syncing..."*.
   - `Permanent Validation Rejection` (poison-pill `4xx` where a server rule permanently blocks an offline action, e.g., logging a planned meal that was replaced on another device): Clear non-blocking banner *"1 offline change couldn't be synced: [Reason]. [View / Dismiss]"*.
2. **Pull-to-Refresh:** Supported on `Today`, `Nutrition`, `Workouts`, `Coach`, and `Progress` screens — runs delta sync + `GET /v1/bootstrap` (`If-None-Match`).

### API & BACKEND CONTRACT
1. **`GET /v1/bootstrap`**
   - **Headers:** `Authorization: Bearer <accessToken>`, `If-None-Match: <exact-saved-ETag>`
   - **Smart State-Fingerprint `ETag` (`W/"boot-<rev>-<date>-<hash>"`):** Automatically changes whenever `revision`, local date, `entitlements`, `consents`, `avatar`, or `recovery.status` changes — never serves stale subscription/consent/recovery state.
   - **Responses:**
     - `304 Not Modified` (`0 B`): Zero changes since last sync; render directly from SQLDelight.
     - `200 OK`: Compact (`< 10 KB`) snapshot with new `ETag`, `revision`, `onboardingCompleted`, `onboarding` (`object | null`), `profile`, `consents`, `preferences`, `activeNutritionPlanRef`, `activeWorkoutPlanRef`, `scheduledSessions` (14d), `todaySummary` (incl. `fastingState`, `ramadanMode`, `activity` with `updatedAt`), `streakSummary`, `engagementState`, `unreadCoachingInboxCount`, `pendingAdaptations`, `entitlements`, `notificationPreferences`.
2. **`POST /v1/commands?view=receipt`**
   - **Headers:** `Authorization: Bearer <accessToken>`, `Idempotency-Key: <uuid-v4>`, `Prefer: return=minimal`, `X-Client-Platform: android|ios`, `X-Client-Version: <semver>`
   - **Request Body:** `{ "revision": <localRevision>, "action": "<action>", "payload": { ... } }`
   - **Idempotency Note:** Server request-digest calculation for `Idempotency-Key` **excludes `revision`** (hashing `action` + normalized `payload` only), so a command whose response timed out and then gets rebased onto a newer `revision` replays cleanly without throwing `409 IDEMPOTENCY_KEY_REUSED_MISMATCH`.
   - **Success Response (`200 OK`):** Returns `< 2 KB` receipt `{ revision, serverNow, serverDate, timezone, commandReceipt: { revision, action, replayed, at }, affected: [{ entityType, entityId, op, payload }] }`.
3. **`GET /v1/sync/changes?after={localRev}`** *(omit `afterSeq` when `lastSeq` is `0` or `null`; append `&afterSeq={lastSeq}` only when `lastSeq > 0`)*
   - **Success Response (`200 OK`):**
     ```json
     {
       "ok": true,
       "data": {
         "items": [{ "revision": 6, "action": "food_delete", "at": "..." }],
         "deltas": [
           {
             "seq": 601,
             "revision": 6,
             "entityType": "food_entry",
             "entityId": "m-101",
             "op": "delete",
             "at": "...",
             "payload": { "id": "m-101", "deletedAt": "2026-11-21T10:15:00.000Z" }
           }
         ],
         "currentRevision": 6,
         "nextCursor": 6,
         "nextSeqCursor": 601,
         "hasMore": false,
         "resyncRequired": false
       }
     }
     ```
4. **`GET /v1/state`** *(Fallback Full Resync ONLY when `resyncRequired == true`)*
5. **`GET /v1/capabilities`** *(Version & maintenance gating: `minSupportedVersion`, `maintenanceMode`, `426 CLIENT_UPDATE_REQUIRED`, `503 MAINTENANCE_MODE`, `features`, `deferredFeatures`)*
   - **Error Codes Handled:**
     - `409 REVISION_CONFLICT`: Expected revision < `serverRevision` -> Triggers automatic delta fetch & rebase loop.
     - `409 IDEMPOTENCY_KEY_REUSED_MISMATCH`: Bug safeguard (different `action`/`payload` reused under same key); mark item failed, generate fresh key if user retries manually.
     - `413 STORAGE_LIMIT_REACHED`: Prompt user to export GDPR data (`GET /v1/account/export`) in Profile (`US-PRF-06`).
     - `426 CLIENT_UPDATE_REQUIRED`: Blocking update prompt.
     - `429 RATE_LIMITED` / `503 MAINTENANCE_MODE` / `503 DATABASE_UNAVAILABLE` / `500 INTERNAL_ERROR` (`retryable: true`): Exponential backoff (`2s`, `4s`, `8s`, max `60s`), keeping original `Idempotency-Key`.

### RULES & BUSINESS LOGIC
1. **Deterministic Outbox Enqueueing:**
   - Every user mutation (water cup, food log, weight, workout set, recovery check-in) immediately:
     1. Generates a unique UUID v4 `idempotencyKey` and persists it in `outbox_commands` inside SQLDelight **before** sending over the network.
     2. Applies an optimistic update in SQLDelight UI views so the UI feels instant (`< 16ms`).
2. **Exact `409 REVISION_CONFLICT` Auto-Rebase Protocol:**
   - When `POST /v1/commands` returns `409 REVISION_CONFLICT`:
     1. Loop `GET /v1/sync/changes?after=<localRevision>` (adding `&afterSeq=<lastSeqCursor>` ONLY when `lastSeqCursor != null && lastSeqCursor > 0`) while `hasMore == true`.
     2. Apply each delta in strict ascending `seq` order (`upsert` / `delete`) into SQLDelight.
     3. If any delta specifies `entityType` in `["nutrition_plan", "workout_plan"]` with `payload.requiresFetch == true` (or `op == "upsert"`), immediately fetch `GET /v1/plans/{entityId}` or `GET /v1/workout-plans/{entityId}` before advancing.
     4. If `resyncRequired == true`, fall back to `GET /v1/state` to rebuild SQLDelight cleanly.
     5. Commit `localRevision = data.currentRevision` and `lastSeqCursor = data.nextSeqCursor`.
     6. Re-submit the head outbox command with `revision = localRevision` and the **exact same `Idempotency-Key` & `payload`** (bounded max 3 conflict rebases per command to prevent infinite loops; because the server `Idempotency-Key` digest excludes `revision`, retries after timeout + rebase replay idempotently).
3. **Offline Outbox Poison-Pill Policy (Permanent `4xx` Isolation):**
   - If a queued mutation returns a permanent `4xx` error (any `4xx` EXCEPT `409 REVISION_CONFLICT`, and excluding retryable `429 RATE_LIMITED` or `401` token refresh), do **NOT** retry it infinitely or block the queue behind it.
   - Move that item immediately to `status = "failed_terminal"` (discardable state), roll back its optimistic SQLDelight row, surface a clear non-blocking user notification with localized `(error.code, error.params)` and `[Dismiss]`, and immediately continue draining subsequent queued outbox items.
4. **Never Synthesize ETags:** Store and resend the **exact** `ETag` response header string (`W/"boot-..."` for `GET /v1/bootstrap`, `W/"brief-..."` for `GET /v1/coaching/brief`, `W/"rev-..."` for `GET /v1/state` / `GET /v1/widgets/snapshot`).
5. **Payload Size Bound:** Enforce `< 40 KB` per command payload client-side (matching `413 PAYLOAD_TOO_LARGE` on server).
6. **Sequential FIFO Outbox Drain:** Drain queued outbox commands strictly one-by-one in FIFO order so each receipt increments `localRevision` (`N -> N+1`) cleanly without self-inflicted `409` races.
7. **Client Clock-Skew Protection & Server Date Authority:** On every `GET /v1/bootstrap` or command receipt, compute `clockSkewMs = serverNowEpochMs - deviceNowEpochMs`. Always resolve `serverDate` from server timestamps + `profile.timezone` rather than trusting tampered/wrong device clocks; if `|clockSkewMs| > 15 min`, show a non-blocking banner warning *"Your phone clock is off — dates sync with server time to protect logs."*
8. **App Version Force/Soft Update & Maintenance Gate (`GET /v1/capabilities`):** Check `capabilities.minSupportedVersion` and `capabilities.maintenanceMode` periodically on startup:
   - If client `appVersion < minSupportedVersion`: present blocking `[Update CuraFit]` Store modal (`426 CLIENT_UPDATE_REQUIRED`) while keeping historical cached data untouched.
   - If `503 MAINTENANCE_MODE` (`retryable: true`): show non-alarming top banner *"Scheduled maintenance in progress — offline logging continues safely."* and pause background outbox drain until healthy.

### MAIN FLOW
1. User trains in a basement gym with no signal and logs 5 exercises (`workout` + `session`) plus 4 cups of water (`water`).
2. Each action generates a UUID `Idempotency-Key`, updates SQLDelight optimistically, and enters `outbox_commands`. Top pill shows *"Offline • 7 changes saved on phone"*.
3. Meanwhile, on the user's tablet at home, the user replaced tomorrow's breakfast (`replace_meal`), advancing server revision from `12` to `13`.
4. User leaves the gym and regains 5G connectivity.
5. Sync worker drains item #1 (`revision: 12`) -> server returns `409 REVISION_CONFLICT` (`currentRevision: 13`).
6. Sync worker automatically calls `GET /v1/sync/changes?after=12` (with `&afterSeq=...` if `> 0`), fetches the updated plan (`GET /v1/plans/{id}`), commits `localRevision = 13`, and retries item #1 with `revision: 13` and the same `Idempotency-Key`.
7. All 7 items commit (`rev 13 -> 20`), the top sync pill flashes *"Synced ✓"* and fades out cleanly.

### EDGE CASES
- **Network Drops After Server Committed Command #1 (`200 OK` Lost in Transit):** Sync worker retries with the exact same `Idempotency-Key` and `action`/`payload` (even if `revision` rebased); server returns `200 OK` with header `Idempotency-Replayed: true` and zero duplicate entries are created!
- **Two Offline Changes Where Item #2 Conflicts With Remote Action (e.g., Remote Deleted Meal That Offline Item #2 Tried to Log):** Server returns `404 PLANNED_MEAL_NOT_FOUND` on Item #2 (`retryable: false`). Per the Poison-Pill Policy, sync worker moves Item #2 to `failed_terminal`, rolls back its optimistic row in SQLDelight, surfaces a concise dismissible notice, and continues draining Item #3+ cleanly.
- **`GET /v1/bootstrap` Returns `304 Not Modified`:** Skip JSON parsing and DB writes completely (`0 B` bandwidth).
- **Device Clock Set 2 Days Fast (`clockSkewMs < -172800000`):** Client validates food/workout dates using `serverDate` so user isn't blocked by accidental `DATE_IN_FUTURE` errors when logging Today!

### ACCEPTANCE CRITERIA
- **Scenario 1: Cold startup with unchanged server state uses `304 Not Modified`**
  - **Given** SQLDelight holds a valid `bootstrapEtag`
  - **When** the app launches and calls `GET /v1/bootstrap` with `If-None-Match`
  - **Then** the server returns `304 Not Modified` and the UI renders immediately from cached SQLDelight without re-downloading state.
- **Scenario 2: Network drop during command commit safely replays via `Idempotency-Key`**
  - **Given** an outbox command (`water`, `+2` cups) succeeded on the server but the response timed out
  - **When** the client retries with the identical `Idempotency-Key` and body
  - **Then** the server replays the saved receipt (`Idempotency-Replayed: true`), does not add +4 cups, and updates `localRevision`.
- **Scenario 3: Multi-device `409 REVISION_CONFLICT` resolves silently**
  - **Given** Device A is at `revision 5` offline and Device B updated server to `revision 6`
  - **When** Device A submits its queued command with `revision: 5`
  - **Then** Device A receives `409`, fetches `/v1/sync/changes?after=5`, updates SQLDelight to `revision 6`, and retries successfully without user intervention.

### ANALYTICS
- `sync_bootstrap_completed` (`cache_hit_304`: `boolean`, `latency_ms`: `number`, `pending_outbox_count`: `integer`)
- `sync_outbox_drained` (`commands_count`: `integer`, `replayed_count`: `integer`, `duration_ms`: `number`)
- `sync_conflict_rebased` (`expected_rev`: `integer`, `server_rev`: `integer`, `deltas_applied`: `integer`, `outcome`: `"resolved" | "failed_terminal"`)
- `sync_command_terminal_error` (`action`: `string`, `error_code`: `string`)
