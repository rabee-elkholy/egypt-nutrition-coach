# CuraFit API v1 — Canonical Error Codes Reference

Generated automatically from [`contracts/error-codes.json`](../contracts/error-codes.json).

> **KMM Integration Rule:** API error responses **never contain Arabic text** in `error.message`. Clients localize strictly via `error.code` + `error.params` using this catalog.

## Error Envelope Shape (`4xx` / `5xx`)

```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account state has changed; sync and retry with the latest revision.",
    "params": { "expectedRevision": 4, "currentRevision": 5 },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 5,
      "mergeHints": { ... }
    }
  },
  "meta": {
    "requestId": "9a7b6c5d-...",
    "serverTime": "2026-11-21T14:00:00.000Z"
  }
}
```

## Error Code Catalog

| Code | HTTP | Retryable | Params | English Message (`error.message`) |
| :--- | :---: | :---: | :--- | :--- |
| `VALIDATION_ERROR` | `400` | No | — | The request payload failed validation. |
| `NUMBER_OUT_OF_RANGE` | `400` | No | `field`, `min`, `max` | {field} must be between {min} and {max}. |
| `INVALID_INTEGER` | `400` | No | `field`, `min`, `max` | {field} must be a whole integer. |
| `INVALID_BOOLEAN` | `400` | No | `field` | {field} must be a boolean true or false. |
| `INVALID_STRING_LIST` | `400` | No | `field` | {field} must be a valid list of non-empty strings. |
| `INVALID_RECORD` | `400` | No | `field` | {field} must be a valid key-value object. |
| `INVALID_DECIMAL` | `400` | No | `field` | {field} must be a valid non-negative decimal number. |
| `VALUE_MUST_BE_POSITIVE` | `400` | No | `field` | {field} must be greater than zero. |
| `INVALID_DATE` | `400` | No | `field` | Invalid calendar date format; expected YYYY-MM-DD. |
| `DATE_IN_FUTURE` | `400` | No | `date` | Logging date cannot be in the future. |
| `DATE_TOO_OLD` | `400` | No | `maxDays` | Backdating logs is limited to the last {maxDays} days. |
| `INVALID_DATE_RANGE` | `400` | No | `field` | Invalid date range or analytics range parameter (expected YYYY-MM-DD or one of 14d, 30d, 90d, all). |
| `INVALID_WEEKDAY_CONVENTION` | `400` | No | — | weekdayConvention must be either js_sunday_0 or saturday_0. |
| `INVALID_WORKOUT_DAYS` | `400` | No | — | Selected training days list is invalid (max 7 days). |
| `INVALID_DAY_LOCATIONS` | `400` | No | — | dayLocations keys must be weekday indices 0..6 with valid location values. |
| `INVALID_TIMEZONE` | `400` | No | — | Invalid IANA timezone identifier. |
| `INVALID_QUIET_HOURS` | `400` | No | `field` | {field} must be formatted as 24-hour HH:mm. |
| `INVALID_WEARABLES_BATCH` | `400` | No | — | Wearables payload must contain a records array with at most 100 items. |
| `EMPTY_BODY` | `400` | No | — | A JSON request body is required. |
| `PAYLOAD_TOO_LARGE` | `413` | No | — | Request body exceeds the 40 KB limit. |
| `INVALID_UTF8` | `400` | No | — | Request body must be valid UTF-8 encoded text. |
| `INVALID_JSON` | `400` | No | — | Malformed JSON request body. |
| `INVALID_REQUEST_BODY` | `400` | No | — | Request body must be a JSON object. |
| `INVALID_COMMAND_ENVELOPE` | `400` | No | — | Command body must include integer revision >= 0, string action, and object payload. |
| `UNKNOWN_COMMAND_ACTION` | `400` | No | `action` | Unsupported command action. |
| `IDEMPOTENCY_KEY_REQUIRED` | `400` | No | — | Idempotency-Key header (1..100 characters) is required. |
| `IDEMPOTENCY_KEY_REUSED_MISMATCH` | `409` | No | — | Idempotency-Key was already used with a different request payload. |
| `REVISION_CONFLICT` | `409` | No | `expectedRevision`, `currentRevision` | Account state has changed; sync and retry with the latest revision. |
| `CONFLICT` | `409` | No | — | Request conflicted with current resource state. |
| `ROUTE_NOT_FOUND` | `404` | No | — | API endpoint not found. |
| `METHOD_NOT_ALLOWED` | `405` | No | `allowedMethod` | HTTP method is not allowed for this endpoint. |
| `ORIGIN_FORBIDDEN` | `403` | No | — | Cross-origin write requests are forbidden. |
| `UNSUPPORTED_MEDIA_TYPE` | `415` | No | — | Content-Type must be application/json. |
| `STORAGE_LIMIT_REACHED` | `413` | No | — | Account history reached storage capacity; export your data before adding new logs. |
| `RATE_LIMITED` | `429` | Yes | `retryAfterSeconds` | Too many requests per minute; wait a moment and retry. |
| `DATABASE_UNAVAILABLE` | `503` | Yes | — | Database binding is temporarily unavailable. |
| `DATABASE_ERROR` | `503` | Yes | — | Unable to persist data right now; retry shortly. |
| `INTERNAL_ERROR` | `500` | Yes | — | Unexpected internal server error; retry shortly. |
| `SERVICE_UNAVAILABLE` | `503` | Yes | — | Service temporarily unavailable; retry shortly. |
| `UNAUTHENTICATED` | `401` | No | — | Authentication required; provide a valid Bearer access token. |
| `AUTH_HEADER_INVALID` | `401` | No | — | Authorization header must use Bearer token format. |
| `AUTH_TOKEN_MALFORMED` | `401` | No | — | Malformed JWT access token. |
| `AUTH_PROVIDER_NOT_CONFIGURED` | `503` | No | — | Authentication provider key material is not configured on the server. |
| `AUTH_JWKS_UNAVAILABLE` | `503` | Yes | `provider` | Unable to fetch JWKS verification keys. |
| `AUTH_KEY_ROTATED_OR_UNKNOWN` | `401` | No | — | JWT signing key ID (kid) is unknown or rotated. |
| `AUTH_UNSUPPORTED_ALG` | `401` | No | — | Unsupported JWT signing method. |
| `AUTH_INVALID_SIGNATURE` | `401` | No | — | Invalid JWT signature. |
| `AUTH_TOKEN_MISSING_EXP` | `401` | No | — | JWT access token is missing required exp claim. |
| `AUTH_TOKEN_EXPIRED` | `401` | No | — | Access token has expired; refresh your session. |
| `AUTH_TOKEN_NOT_YET_VALID` | `401` | No | — | JWT access token is not valid yet (nbf claim in future). |
| `AUTH_TOKEN_INVALID_IAT` | `401` | No | — | JWT issued-at timestamp (iat) is in the future. |
| `AUTH_INVALID_ISSUER` | `401` | No | — | Untrusted JWT issuer. |
| `AUTH_INVALID_AUDIENCE` | `401` | No | — | JWT audience claim does not match. |
| `AUTH_INVALID_SUBJECT` | `401` | No | — | Invalid or missing JWT subject (sub). |
| `AUTH_INVALID_SESSION` | `401` | No | — | Invalid session identifier claim in access token. |
| `AUTH_SESSION_REVOKED` | `401` | No | — | Session has been revoked; sign in again. |
| `AUTH_ALL_SESSIONS_REVOKED` | `401` | No | — | All sessions were revoked; sign in again. |
| `AUTH_SESSION_CHECK_UNAVAILABLE` | `503` | Yes | — | Unable to verify session status; retry shortly. |
| `AUTH_SCOPE_REQUIRED` | `403` | No | — | Token lacks required authorization scope. |
| `AUTH_INVALID_EMAIL` | `400` | No | — | Please enter a valid email address. |
| `AUTH_WEAK_PASSWORD` | `400` | No | `minLength`, `maxLength` | Password must be between {minLength} and {maxLength} characters. |
| `AUTH_JWT_SECRET_MISSING` | `503` | No | — | AUTH_JWT_SECRET is not configured on the server. |
| `AUTH_SCHEMA_NOT_MIGRATED` | `503` | No | — | Authentication tables are not migrated in D1 yet. |
| `AUTH_EMAIL_ALREADY_EXISTS` | `409` | No | — | An account with this email already exists. |
| `AUTH_INVALID_CREDENTIALS` | `401` | No | — | Invalid email or password. |
| `AUTH_REFRESH_TOKEN_INVALID` | `401` | No | — | Invalid or unrecognized refresh token. |
| `AUTH_REFRESH_TOKEN_REUSED` | `401` | No | — | Refresh token reuse detected; session revoked for security. |
| `AUTH_REFRESH_TOKEN_REVOKED` | `401` | No | — | Refresh token has been revoked. |
| `AUTH_REFRESH_TOKEN_EXPIRED` | `401` | No | — | Refresh token has expired; sign in again. |
| `AUTH_REFRESH_TOKEN_CONCURRENT_REUSE` | `401` | No | — | Concurrent refresh token reuse detected; session revoked for security. |
| `AUTH_USER_NOT_FOUND` | `404` | No | — | Authentication user account not found. |
| `AUTH_VERIFIED_ACCOUNT_REQUIRED` | `403` | No | — | Password changes are only available for registered email accounts. |
| `AUTH_CURRENT_PASSWORD_REQUIRED` | `400` | No | — | Current password is required. |
| `AUTH_PASSWORD_UNCHANGED` | `400` | No | — | New password must differ from current password. |
| `INVALID_SESSION_ID` | `400` | No | — | Invalid sessionId parameter. |
| `ACCOUNT_DELETED` | `401` | No | — | This account has been permanently deleted. |
| `CLAIM_REQUIRES_VERIFIED_ACCOUNT` | `403` | No | — | Sign in with a verified account to claim an anonymous session. |
| `INVALID_CLAIM_REQUEST` | `400` | No | — | Explicit consent and a valid anon: user ID are required to claim data. |
| `ANONYMOUS_OWNERSHIP_REQUIRED` | `403` | No | — | Proof of ownership for the anonymous session cookie is required. |
| `ANONYMOUS_ALREADY_CLAIMED` | `409` | No | — | Anonymous session has already been claimed. |
| `ANONYMOUS_ACCOUNT_NOT_FOUND` | `404` | No | — | No stored account data found for the specified anonymous session. |
| `TARGET_ACCOUNT_NOT_EMPTY` | `409` | No | — | Authenticated account already has a profile; specify a merge policy. |
| `DELETE_CONFIRMATION_REQUIRED` | `400` | No | — | Permanent account deletion requires confirm: true. |
| `ACCOUNT_DELETION_MIGRATION_REQUIRED` | `503` | No | — | Account deletion requires normalized session revocation tables to be migrated. |
| `INVALID_CONSENT_PAYLOAD` | `400` | No | — | Consent payload requires string consentType, string version, and boolean accepted. |
| `ACCOUNT_SNAPSHOT_READ_FAILED` | `503` | Yes | — | Unable to load account records; no changes were made. |
| `ACCOUNT_BACKFILL_CONFLICT` | `409` | No | — | Account changed during migration backfill; reload and retry. |
| `PROFILE_REQUIRED` | `400` | No | — | Complete onboarding profile generation before running this command. |
| `INVALID_SEX` | `400` | No | — | sex must be male or female. |
| `INVALID_HEALTH_FLAGS` | `400` | No | — | diseases and injuries must be arrays of condition IDs. |
| `UNSUPPORTED_ELBOW_PAIN` | `400` | No | — | Elbow pain requires specialist assessment before adapting exercises for this injury. |
| `CLINICAL_REVIEW_REQUIRED` | `400` | No | — | Declared clinical conditions or age require direct specialist review before plan generation. |
| `INVALID_GOAL` | `400` | No | — | goal must be one of lose, maintain, gain, or muscle_gain. |
| `INVALID_SERVICE_TRACK` | `400` | No | — | serviceTrack must be one of nutrition_only, workouts_only, or nutrition_and_workouts. |
| `BMI_OUT_OF_RANGE` | `400` | No | — | Calculated BMI is outside the standard CuraFit Specialist Team planning range (12.5..65). |
| `WEIGHT_LOSS_UNDERWEIGHT_UNSAFE` | `400` | No | — | Weight loss plans are not suitable when current BMI is below 18.5. |
| `INVALID_EXTERNAL_TRAINING_DAYS` | `400` | No | — | externalTrainingDays must be an array of up to 7 weekday integers (0..6). |
| `MUSCLE_GAIN_REQUIRES_RESISTANCE_DAYS` | `400` | No | — | Muscle gain goal in nutrition_only track requires confirmed external resistance training days. |
| `INVALID_TARGET_WEIGHT` | `400` | No | — | targetWeight is inconsistent with your goal and safe BMI floor (18.5). |
| `HEALTH_CONFIRMATION_REQUIRED` | `400` | No | — | Confirm health readiness clearance before creating or modifying a workout plan. |
| `HEALTH_ALREADY_CONFIRMED` | `400` | No | — | Health readiness has already been confirmed. |
| `SCHEDULE_ALREADY_CONFIRMED` | `400` | No | — | Workout schedule weekday convention has already been confirmed. |
| `INVALID_SCHEDULE_MAPPING` | `400` | No | — | Provide a unique weekday index (0..6) for each workout day in dayMap. |
| `INVALID_AGE` | `400` | No | — | age must be a whole number of years between 18 and 95. |
| `INVALID_BIRTH_DATE` | `400` | No | `minAge`, `maxAge`, `computedAge` | Date of birth must correspond to an adult aged 18 to 95 years. |
| `INVALID_PROFILE_METRICS` | `400` | No | — | Invalid sex, activity level, or goal selection. |
| `INVALID_TRAINING_DAYS` | `400` | No | — | trainingDays must be an integer between 0 and 7. |
| `INVALID_GOAL_PACE` | `400` | No | — | goalPace must be one of slow, moderate, or fast. |
| `INVALID_DIET_TYPE` | `400` | No | — | Selected dietType is not supported. |
| `INVALID_BUDGET_OR_MEALS` | `400` | No | — | Invalid budget tier or daily meal count (2..5). |
| `PROTEIN_SOURCE_REQUIRED` | `400` | No | — | Select at least one primary protein source. |
| `INVALID_EXCLUDED_INGREDIENTS` | `400` | No | — | excludedKeys must be a valid array of known ingredient keys. |
| `INVALID_REGION` | `400` | No | — | region must be a supported regional catalog selection. |
| `INVALID_SPORT_MODE` | `400` | No | — | exerciseMode must be included or separate with up to 8 sports rows. |
| `UNKNOWN_OR_DUPLICATE_SPORT` | `400` | No | — | Sport ID is unknown or duplicated. |
| `INVALID_SPORT_SCHEDULE` | `400` | No | — | Check sport minutes (5..180) and sessions per week (1..7). |
| `SPORT_DURATION_EXCEEDED` | `400` | No | — | Weekly sport duration exceeds the planning cap of 180 minutes average per training day. |
| `SPORT_REQUIRED_FOR_SEPARATE_MODE` | `400` | No | — | Add at least one sport with duration when exerciseMode is separate. |
| `WORKOUT_DAYS_EXCEED_SPORTS` | `400` | No | — | Training days count exceeds total weekly sport sessions declared. |
| `KETO_REQUIRES_CONFIRMATION` | `400` | No | — | Keto diet requires explicit acknowledgment and is blocked with contraindicated medical conditions. |
| `FASTING_REQUIRES_CONFIRMATION` | `400` | No | — | Intermittent fasting requires explicit acknowledgment and is blocked with contraindicated conditions. |
| `FASTING_WINDOW_INVALID` | `400` | No | — | Invalid fasting mode or eating window start time (eating window must fit within the same day). |
| `PLAN_CONSTRAINTS_UNMET` | `400` | No | `stage` | Unable to generate a complete nutrition plan satisfying all dietary and calorie/protein constraints. |
| `NO_ELIGIBLE_MEAL_FOR_SLOT` | `400` | No | — | No eligible meals match your dietary exclusions for a required meal slot. |
| `NO_CANDIDATE_WITHIN_DIET_LIMITS` | `400` | No | — | No candidate satisfies diet rules for this meal slot with your current preferences. |
| `NUTRIENT_TARGETS_UNMET` | `400` | No | — | Meal search could not meet daily calorie and protein tolerances under your constraints. |
| `PLAN_NOT_FOUND` | `404` | No | — | Nutrition plan not found. |
| `PLAN_DAY_NOT_FOUND` | `404` | No | — | Specified calendar day not found in nutrition plan. |
| `PLAN_LOAD_FAILED` | `503` | Yes | — | Unable to load saved nutrition plan. |
| `PLAN_NOT_ACTIVE_FOR_TRACK` | `400` | No | — | No active nutrition plan exists for a workouts-only track. |
| `PLAN_STILL_ACTIVE` | `400` | No | — | Current weekly nutrition plan is still active; renewal is allowed after it ends or with earlyRenew: true. |
| `PLANNED_MEAL_NOT_FOUND` | `404` | No | — | Planned meal not found in the active nutrition plan. |
| `FUTURE_FOOD_ENTRIES_CONFLICT` | `400` | No | — | Food logs already exist on or after the effective adjustment date. |
| `DAILY_TOTAL_REQUIRES_DETAILED_CONVERSION` | `400` | No | — | This day already has a daily total log; switch to detailed entries before adding individual meals. |
| `FOOD_DAY_REQUIRES_CLOSURE` | `400` | No | — | This day already uses detailed meal entries; confirm day completion with food_complete instead. |
| `INVALID_FOOD_ACTION` | `400` | No | — | Unknown food command action. |
| `INVALID_FOOD_SOURCE` | `400` | No | — | Food entry source must be planned, ingredient, recipe, barcode, or manual. |
| `INVALID_MEAL_SLOT` | `400` | No | — | slot must be one of breakfast, lunch, dinner, or snack. |
| `MEAL_DATE_MISMATCH` | `400` | No | — | Logged date does not match the planned meal's scheduled date. |
| `MEAL_SLOT_MISMATCH` | `400` | No | — | Logged slot does not match the planned meal's slot. |
| `PLANNED_MEAL_ALREADY_LOGGED` | `400` | No | — | Planned meal has already been logged; update or delete the entry to adjust quantity. |
| `FOOD_NOT_FOUND` | `404` | No | — | Food item not found or lacks gram-based portion reference. |
| `INVALID_MEAL_NAME` | `400` | No | — | Manual meal name must be non-empty and at most 120 characters. |
| `MANUAL_MEAL_ENERGY_REQUIRED` | `400` | No | — | Positive actual energy (kcal > 0) is required for manual food entries. |
| `CONVERT_DETAILED_CONFIRMATION_REQUIRED` | `400` | No | — | Switching a daily-total log to detailed entries requires confirm: true on a daily-total day. |
| `FOOD_ENTRY_NOT_FOUND` | `404` | No | — | Food entry ID not found. |
| `FOOD_COMPLETE_FLAG_REQUIRED` | `400` | No | — | complete boolean flag is required. |
| `FOOD_LOG_REQUIRED_BEFORE_COMPLETE` | `400` | No | — | Log at least one meal entry before marking the food day complete. |
| `PAST_DAY_PLAN_IMMUTABLE` | `400` | No | — | Past plan days cannot be modified. |
| `MEAL_ALREADY_CONSUMED` | `400` | No | — | Cannot replace a meal that has already been logged as consumed. |
| `MEAL_ALTERNATIVE_UNAVAILABLE` | `400` | No | — | Selected meal alternative is no longer valid under your current constraints. |
| `ENERGY_CHANGE_OUT_OF_RANGE` | `400` | No | — | Adjusted daily calories exceed safe planning bounds (1200/1500/1600/1800..4200 kcal). |
| `ENERGY_CHANGE_TARGETS_UNMET` | `400` | No | — | Proposed calorie change cannot satisfy minimum protein or nutrition targets. |
| `INVALID_DIET_PLAN_CONFIG` | `400` | No | — | Unsupported diet rule verification mode. |
| `MEAL_EXCLUDED_BY_HEALTH_CONDITION` | `400` | No | — | Meal conflicts with declared medical/wellness exclusions; changes were not saved. |
| `MEAL_VIOLATES_DIET_OR_UNVERIFIED` | `400` | No | — | Meal does not comply with diet rules or contains unverified ingredients. |
| `HIGH_PROTEIN_TARGET_UNMET` | `400` | No | — | Meals fall below the minimum protein threshold for high_protein diet. |
| `DASH_SODIUM_LIMIT_EXCEEDED` | `400` | No | — | Plan exceeds the 2300mg daily sodium limit required for DASH diet or lacks sodium measurements. |
| `KETO_CARB_DEFINITION_REQUIRED` | `400` | No | — | Keto diet verification requires consistent total-carbohydrate (fdc:1005) definitions. |
| `CARB_LIMIT_EXCEEDED` | `400` | No | `maxCarbsGrams` | Selection exceeds the daily carbohydrate ceiling of {maxCarbsGrams}g. |
| `LIBRARY_INSUFFICIENT_FOR_DIET_GOALS` | `400` | No | — | Food catalog cannot satisfy calorie, protein, or macro goals under current diet exclusions. |
| `INVALID_ALTERNATIVE_LIMIT` | `400` | No | — | Alternative limit must be an integer between 0 and 100. |
| `FOOD_DETAIL_MISMATCH` | `400` | No | — | Food detail metadata does not match the requested food ID. |
| `FOOD_APPROXIMATE_CONFIRMATION_REQUIRED` | `400` | No | — | Approximate recipe/proxy food requires explicit acknowledgment. |
| `RECIPE_WEIGHT_MISSING` | `400` | No | — | Approximate recipe lacks verified cooked final weight; use reference servings. |
| `PORTION_WEIGHT_UNKNOWN` | `400` | No | — | Serving gram weight is unknown; use source reference serving count. |
| `PORTION_GRAMS_MISSING` | `400` | No | — | Selected portion has no verified gram weight. |
| `VOLUME_CONVERSION_UNAVAILABLE` | `400` | No | — | No verified volume-to-gram conversion exists for this food. |
| `INVALID_QUANTITY_UNIT` | `400` | No | — | Quantity unit must be grams, portion, ml, or reference. |
| `QUANTITY_OUT_OF_RANGE` | `400` | No | — | Calculated food weight must be between 0 and 100000 grams. |
| `INVALID_CUSTOM_FOOD_NAME` | `400` | No | — | Custom food name must be non-empty and at most 120 characters. |
| `INVALID_NUTRITION_BASIS` | `400` | No | — | Invalid nutrition declaration basis. |
| `MACROS_INCONSISTENT_WITH_100G` | `400` | No | — | Sum of macronutrients per 100g exceeds physiological 100g tolerance. |
| `INVALID_CARB_DEFINITION` | `400` | No | — | Specify a valid carbohydrate definition. |
| `MEAL_COMPONENTS_REQUIRED` | `400` | No | — | Provide a custom meal name and at least one ingredient. |
| `MAX_INGREDIENTS_EXCEEDED` | `400` | No | — | A custom meal cannot exceed 100 ingredients. |
| `EXTERNAL_CATALOG_SNAPSHOT_INVALID` | `500` | No | — | External food catalog snapshot has an invalid format. |
| `DENSITY_REQUIRED_FOR_ML` | `400` | No | — | Milliliter conversion requires verified density or reference volume basis. |
| `INGREDIENT_NOT_IN_CATALOG` | `400` | No | `ingredient` | Ingredient not found in approved catalog: {ingredient}. |
| `INGREDIENT_NOT_VERIFIED` | `400` | No | `ingredient` | Ingredient is not reference-verified and cannot be used in verified calculations: {ingredient}. |
| `LIQUID_DENSITY_MISSING` | `400` | No | `ingredient` | Liquid ingredient lacks verified density factor to convert milliliters to grams: {ingredient}. |
| `MEAL_COMPONENT_NOT_FOUND` | `404` | No | — | Requested meal component index not found. |
| `MEAL_COMPONENT_REPLACEMENT_INVALID` | `400` | No | — | Replacement component must have valid ingredients. |
| `INVALID_PANTRY_SELECTION` | `400` | No | — | Invalid pantry ingredient selection. |
| `WORKOUT_PLAN_NOT_FOUND` | `404` | No | — | Workout plan not found. |
| `EXERCISE_NOT_FOUND` | `404` | No | — | Exercise not found in catalog. |
| `EXERCISE_NOT_IN_DAY` | `400` | No | — | Exercise is not scheduled in the specified workout day. |
| `INVALID_WORKOUT_SETTINGS` | `400` | No | — | fitnessLevel must be beginner/intermediate/advanced and sessionDuration must be 20, 30, 45, 60, or 90. |
| `INVALID_WORKOUT_LOCATION` | `400` | No | — | workoutLocation must be gym_only, home_only, or home_and_gym. |
| `UNKNOWN_EQUIPMENT` | `400` | No | — | homeEquipment contains one or more unknown equipment IDs. |
| `INVALID_WORKOUT_SPLIT` | `400` | No | — | workoutSplitPreference must be auto, full_body, upper_lower, ppl, or bro_split. |
| `WORKOUT_INFEASIBLE` | `400` | No | — | Current equipment, injury exclusions, and duration cannot build a valid workout session. |
| `NO_ELIGIBLE_EXERCISES` | `400` | No | — | No exercises satisfy both the selected equipment and declared injury exclusions. |
| `WORKOUT_SETS_REQUIRED` | `400` | No | — | sets array must contain between 1 and 15 performed sets. |
| `WORKOUT_REPS_MUST_BE_INTEGER` | `400` | No | — | Performed set reps must be whole integers. |
| `INVALID_WORKOUT_SESSION` | `400` | No | — | Workout session day or status (completed, partial, missed) is invalid. |
| `SESSION_REQUIRES_ACTUAL_SETS` | `400` | No | — | Log at least one exercise set before marking a session completed or partial. |
| `EXERCISE_ALTERNATIVE_INVALID` | `400` | No | — | Alternative exercise is incompatible with movement pattern, injuries, or equipment. |
| `RESCHEDULE_DATE_OUT_OF_RANGE` | `400` | No | — | Target reschedule date must be between today and today + 13 days. |
| `WORKOUT_DAY_NOT_IN_PLAN` | `400` | No | — | Requested dayIndex is not present in your active workout plan. |
| `RESCHEDULE_DAY_OCCUPIED` | `409` | No | — | Another workout session already exists on the target reschedule date. |
| `RESCHEDULE_DATE_UNCHANGED` | `400` | No | — | Target reschedule date must differ from the session's current date. |
| `RECOVERY_FLAGS_REQUIRED` | `400` | No | — | Boolean flags pain, illness, and redFlags are required for recovery check-ins. |
| `INVALID_MUSCLE_REGION` | `400` | No | `region` | Unknown muscle region key: {region}. |
| `INVALID_PAIN_REGIONS` | `400` | No | — | painRegions must be an array of supported muscle region keys. |
| `ADAPTATION_NOT_FOUND` | `404` | No | — | Pending adaptation proposal not found. |
| `ADAPTATION_ACCEPT_REQUIRED` | `400` | No | — | Boolean accept field (true or false) is required. |
| `ADAPTATION_STALE_REVISION` | `409` | No | — | Account data changed since this proposal was generated; run review again. |
| `ADAPTATION_EXPIRED` | `400` | No | — | Adaptation proposal has expired; run review again. |
| `ADAPTATION_CONFIRMATION_REQUIRED` | `400` | No | — | Confirm health clearance and schedule before accepting adaptations. |
| `ADAPTATION_UNSAFE_WORKOUT` | `400` | No | — | Resolve excluded exercises in your workout plan before accepting adaptations. |
| `ADAPTATION_RECOVERY_STALE` | `400` | No | — | Recovery check-in has expired or no longer supports this deload proposal; run review again. |
| `ADAPTATION_NEEDS_FRESH_RECOVERY` | `400` | No | — | Accepting this adaptation requires a fresh ready recovery check-in. |
| `ADAPTATION_VOLUME_NO_LONGER_SUPPORTED` | `400` | No | — | Current recovery or performance evidence no longer supports volume progression. |
| `ADAPTATION_CALORIE_CUT_BLOCKED` | `400` | No | — | Recent high hunger or low energy requires review before applying a calorie cut. |
| `ADAPTATION_WORKOUT_PLAN_CHANGED` | `409` | No | — | Active workout plan changed since this proposal was generated; run review again. |
| `ADAPTATION_SCHEDULE_DATE_PASSED` | `400` | No | — | Proposed reschedule date has already passed. |
| `COACHING_FEEDBACK_INVALID` | `400` | No | — | Valid domain (nutrition \| training) and matching barrier are required. |
| `COACHING_RATING_OUT_OF_RANGE` | `400` | No | `field` | Subjective ratings (hunger, energy, satiety) must be integers from 1 to 5. |
| `COACHING_HUNGER_NUTRITION_ONLY` | `400` | No | — | Hunger and satiety ratings are only valid for nutrition coaching feedback. |
| `COACHING_TRACK_NOT_ENABLED` | `400` | No | — | Requested coaching domain is not enabled on this account. |
| `COACHING_CASE_NOT_FOUND` | `404` | No | — | Coaching case ID not found. |
| `COACHING_CONTEXT_CHANGED` | `409` | No | — | Coaching context changed since this agreement was created; review current coaching status. |
| `COACHING_DECISION_INVALID` | `400` | No | — | Boolean accept flag is required for coaching_decision. |
| `COACHING_CASE_ALREADY_DECIDED` | `409` | No | — | Coaching agreement has already been decided or is no longer open. |
| `COACHING_CASE_EXPIRED` | `409` | No | — | Coaching agreement proposal has expired (older than 7 days); log updated feedback first. |
| `COACHING_OUTCOME_REQUIRES_ACCEPTED_CASE` | `409` | No | — | Reporting an outcome requires an accepted coaching agreement. |
| `COACHING_OUTCOME_INVALID` | `400` | No | — | outcome must be one of helped, not_helped, or not_tried. |
| `COACHING_REVIEW_DATE_NOT_REACHED` | `409` | No | `reviewOn` | Cannot confirm helped outcome before the scheduled coaching review date. |
| `COACHING_COMMAND_UNKNOWN` | `400` | No | — | Unknown coaching command action. |
| `INVALID_EMAIL` | `400` | No | — | A valid email address is required. |
| `INVALID_PASSWORD` | `400` | No | `minLength` | Password must be at least 8 characters long. |
| `AUTH_SECRET_NOT_CONFIGURED` | `503` | No | — | Session signing key (AUTH_JWT_SECRET) is not configured on the server. |
| `AUTH_MIGRATION_REQUIRED` | `503` | Yes | — | Authentication database tables have not been migrated yet; run D1 migrations. |
| `CURRENT_PASSWORD_REQUIRED` | `400` | No | — | Current password is required to set a new password. |
| `PASSWORD_UNCHANGED` | `400` | No | — | New password must be different from your current password. |
| `AUTH_OAUTH_TOKEN_INVALID` | `401` | No | `provider` | Identity provider token is invalid or expired. |
| `AUTH_PROVIDER_EMAIL_CONFLICT` | `409` | No | `existingProvider` | An account with this email is already linked to another sign-in method. |
| `PRO_ENTITLEMENT_REQUIRED` | `402` | No | `feature` | This feature requires an active CuraFit Pro subscription. |
| `AI_FOOD_NOT_RECOGNIZED` | `422` | No | — | Could not recognize any food items from the provided input. |
| `INVALID_BARCODE_FORMAT` | `400` | No | — | Barcode must be a valid 8 to 14 digit EAN or UPC code. |
| `BARCODE_NOT_FOUND` | `404` | No | `barcode` | No product nutrition record found for this barcode. |
| `CHAT_MESSAGE_TOO_LONG` | `400` | No | `maxLength` | Coach chat message must not exceed 1000 characters. |
| `EMPTY_MEASUREMENT_RECORD` | `400` | No | — | Provide at least one body measurement or body fat value. |
| `PHOTO_NOT_FOUND` | `404` | No | — | Progress photo record not found. |
| `PHOTO_TOO_LARGE` | `413` | No | `maxBytes` | Uploaded image exceeds the maximum allowed byte size. |
| `UNSUPPORTED_IMAGE_FORMAT` | `415` | No | — | Image must be JPEG, PNG, or WebP format. |
| `STREAK_FREEZE_UNAVAILABLE` | `409` | No | — | Weekly streak freeze allowance has already been used. |
| `INVALID_PROFILE_NAME` | `400` | No | — | Profile name must be 2 to 50 alphabetic characters. |
| `INVALID_SUBSCRIPTION_RECEIPT` | `400` | No | `platform` | Store subscription receipt could not be verified. |
| `SUBSCRIPTION_OWNED_BY_OTHER_ACCOUNT` | `409` | No | — | This store subscription is already linked to a different CuraFit account. |
| `BILLING_VERIFICATION_UNAVAILABLE` | `503` | Yes | — | Subscription verification provider is temporarily unavailable; retry shortly. |
| `MATERNAL_CALORIE_CUT_BLOCKED` | `422` | No | — | Calorie reductions are disabled during pregnancy for maternal safety. |
| `MAINTENANCE_MODE` | `503` | Yes | — | Service is temporarily in maintenance mode; offline logging remains active. |
| `CLIENT_UPDATE_REQUIRED` | `426` | No | `minVersion` | Please update CuraFit to the latest version to continue syncing. |
| `MEDIA_STORAGE_UNAVAILABLE` | `503` | Yes | — | Media storage is temporarily unavailable; retry shortly. |
| `INVALID_MEDIA_TOKEN` | `403` | No | — | Signed media token is invalid or expired. |
| `INVALID_LOCALE` | `400` | No | `locale` | Unsupported locale code. |
| `EMPTY_ACTIVITY_RECORD` | `400` | No | — | Provide steps or activeEnergyKcal for an activity log. |
| `INVALID_COMEBACK_REQUEST` | `400` | No | — | Comeback restart payload is invalid. |
| `INVALID_FASTING_REQUEST` | `400` | No | — | Fasting log operation or timestamp is invalid. |
| `INVALID_RAMADAN_CONFIG` | `400` | No | — | Ramadan mode requires valid HH:mm iftar and suhoor times and workoutTiming. |
| `RAMADAN_MEDICAL_CLEARANCE_REQUIRED` | `400` | No | — | Confirm medical clearance before enabling Ramadan fasting mode with declared high-risk conditions. |
| `INVALID_FAVORITE_PAYLOAD` | `400` | No | — | Favorite food command requires valid op (add or remove) and item details. |
| `INVALID_COPY_MEAL_PAYLOAD` | `400` | No | — | Copy meal requires valid fromDate, toDate, and slot with existing entries to copy. |
| `INVALID_SUPPORT_FEEDBACK` | `400` | No | — | Support feedback requires a valid category and message (1..2000 characters). |
| `INVALID_PUSH_TOKEN` | `400` | No | — | Push token registration requires deviceId, platform (android or ios), and token. |
| `WEBHOOK_SIGNATURE_INVALID` | `401` | No | `provider` | Store webhook signature or authorization token is invalid. |
| `AD_HOC_EXERCISE_INVALID` | `400` | No | — | Ad-hoc exercise payload requires a valid catalog exerciseId and 1 to 15 performed sets. |
| `INVALID_WORKOUT_UI_MODE` | `400` | No | — | workoutUiMode must be simple or pro. |
| `MEDICAL_DIET_CONFLICT` | `400` | No | `dietType` | The selected diet pattern is contraindicated for your declared medical conditions, maternal status, or goal. |
| `PROFILE_ALREADY_EXISTS` | `409` | No | — | An existing profile already exists on this account; pass overwriteExisting: true to replace it. |
| `HEALTH_CONSENT_REQUIRED` | `403` | No | — | Active health_data_processing consent is required to generate plans or compute coaching reviews. |
| `ACTIVE_SUBSCRIPTION_ON_OTHER_PLATFORM` | `409` | No | `activeProvider`, `requestedProvider` | You already have an active Pro subscription on {activeProvider}; manage or cancel it there before subscribing on {requestedProvider}. |
| `CANNOT_UNLINK_LAST_AUTH_METHOD` | `409` | No | `provider` | Cannot unlink your only active sign-in provider; link another provider first. |
| `OAUTH_PROVIDER_NOT_LINKED` | `404` | No | `provider` | The specified OAuth provider is not linked to this account. |
| `FOOD_DAY_MODE_CONFLICT` | `409` | No | `date` | Target date already has a legacy daily_total log; switch to entries or pass replaceDailyTotal: true. |
| `WORKOUT_LOG_NOT_FOUND` | `404` | No | `logId` | The specified workout log was not found. |
| `SESSION_NOT_FOUND` | `404` | No | `sessionId` | The specified workout session was not found. |
| `AD_HOC_INJURY_WARNING` | `409` | No | `injuries` | This exercise conflicts with your declared joint injuries ({injuries}); pass overrideInjuryWarning: true to log it anyway. |
| `INVALID_MATERNAL_PROFILE` | `400` | No | — | Maternal status is only applicable to female profiles aged 18 to 50. |
| `INVALID_UNIT_SYSTEM` | `400` | No | — | unitSystem must be either metric or imperial. |
| `RECIPE_NOT_FOUND` | `404` | No | — | Saved custom recipe not found. |
| `RECIPE_LIMIT_REACHED` | `409` | No | `max` | Maximum saved custom recipes limit ({max}) reached. |
| `INVALID_RECIPE_PAYLOAD` | `400` | No | — | Custom recipe payload is invalid or contains zero-energy ingredients. |
| `CARDIO_LOG_NOT_FOUND` | `404` | No | — | Cardio session log not found. |
| `INVALID_CARDIO_PAYLOAD` | `400` | No | — | Cardio session payload is invalid. |
| `CARDIO_DAILY_LIMIT_EXCEEDED` | `400` | No | `max` | Maximum number of cardio sessions ({max}) logged for this date has been reached. |
| `CYCLE_TRACKING_UNAVAILABLE` | `403` | No | — | Menstrual cycle awareness is only available for female profiles. |
| `INVALID_CYCLE_PAYLOAD` | `400` | No | — | Cycle settings or cycle log payload is invalid. |
| `AUTH_OAUTH_EMAIL_UNVERIFIED` | `409` | No | `provider` | Identity provider email is not verified; link or sign in with a verified email. |
| `AUTH_OAUTH_ALREADY_LINKED_OTHER_USER` | `409` | No | `existingProvider` | This sign-in identity is already linked to a different CuraFit account. |
| `SESSION_ALREADY_COMPLETED` | `409` | No | — | Completed sessions cannot be rescheduled. |
| `PARQ_CLEARANCE_REQUIRED` | `422` | No | `serviceTrack` | Physician clearance is required before workout planning after a positive PAR-Q screening response. Switch serviceTrack to nutrition_only or obtain medical clearance. |
| `CONFLICTING_CONDITIONS` | `400` | No | `conditions` | diabetes_t1 and diabetes_t2 are mutually exclusive and cannot be selected together. |
| `MULTI_CONDITION_CLINICAL_REVIEW` | `422` | No | `conditions`, `maternalStatus` | Multiple overlapping or high-acuity clinical conditions require direct specialist review before plan generation. |
| `MULTI_INJURY_REQUIRES_REVIEW` | `422` | No | `injuryCount`, `injuries` | Four or more concurrent injuries (or zero safe exercises for a scheduled day) require specialist review before workout planning; switch to nutrition_only or seek clinical clearance. |
| `KIDNEY_SODIUM_LIMIT_EXCEEDED` | `400` | No | `limitMg` | Plan exceeds the 2000mg daily sodium limit required for kidney support or lacks sodium measurements. |
| `CHOLESTEROL_SATURATED_FAT_EXCEEDED` | `400` | No | `maxSatSharePct` | Plan exceeds the 8% daily saturated fat ceiling required for cholesterol management. |
| `FAIR_USE_LIMIT_REACHED` | `429` | Yes | `feature`, `window`, `limit`, `retryAfterSeconds` | Fair-use limit reached for this CuraFit Specialist Team feature; limit resets in the next window. |
| `DINING_OUT_CATEGORY_INVALID` | `400` | No | `category` | Dining-out category must be one of grill, shawarma, cafe, pizza, seafood, or family_feast. |
| `DINING_OUT_OPTION_NOT_FOUND` | `404` | No | `optionId` | Selected dining-out option was not found. |
| `REBALANCE_BLOCKED_CLINICAL` | `409` | No | `reason`, `minEnergyFloor` | Gentle multi-day calorie spread is disabled for this clinical safety profile or calorie floor; use zero_guilt_reset instead. |
| `INVALID_RETENTION_INTENT` | `400` | No | `intent` | Retention intent must be pause_14d, pause_30d, maintenance_mode, or proceed_to_store_cancel. |
| `CIRCLE_NOT_FOUND` | `404` | No | `circleId` | Private circle or member not found. |
| `INVALID_INVITE_CODE` | `404` | No | — | Invite or referral code is invalid or expired. |
| `CIRCLE_FULL` | `409` | No | `maxMembers` | This private circle has reached its maximum capacity of members. |
| `ALREADY_IN_CIRCLE` | `409` | No | `circleId` | You are already a member of this private circle. |
| `CHEER_RATE_LIMITED` | `429` | Yes | `maxPerDay` | Daily cheer limit (3 per friend per day) has been reached. |
| `CHALLENGE_NOT_FOUND` | `404` | No | `challengeId` | Challenge or active membership not found. |
| `CHALLENGE_INELIGIBLE_CLINICAL` | `403` | No | `challengeId` | This challenge is not recommended for your active track or clinical safety profile. |
| `CHALLENGE_FULL` | `409` | No | `maxMembers` | This friend challenge has reached its maximum capacity of members. |
| `ALREADY_JOINED` | `409` | No | `challengeId` | You have already joined this challenge. |
| `REFERRAL_INELIGIBLE` | `409` | No | `reason` | This account or device is not eligible to redeem this referral bonus. |
| `SESSION_ALREADY_COMPLETED_TODAY` | `409` | No | `date` | Today's scheduled workout session is already marked completed. |
| `RED_FLAG_STOP_ACTIVE` | `403` | No | — | Workout overrides are paused while a medical red-flag stop or PAR-Q clearance hold is active. |
| `SAME_PHOTO_PAIR` | `400` | No | — | Select two distinct progress photos to compare. |
| `POSE_MISMATCH` | `400` | No | `beforePose`, `afterPose` | Both photos must share the same pose (front, side, or back) for an accurate comparison. |
| `PHOTOS_TOO_CLOSE_DAYS` | `400` | No | `minDays`, `daysBetween` | Progress photos must be at least {minDays} days apart to evaluate meaningful changes. |
| `VISUAL_ANALYSIS_CONSENT_REQUIRED` | `403` | No | — | Explicit visual_progress_analysis consent is required before running a Specialist Visual Difference Analysis. |
