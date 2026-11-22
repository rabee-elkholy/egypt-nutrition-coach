# KMM Backend Integration Guide (`CuraFit API v1`)

Practical integration specification for the **Kotlin Multiplatform Mobile (Android & iOS)** client connecting to **CuraFit API v1** on Cloudflare Workers + D1.

- **Cloud Dev Server (`dev` branch):** `https://curafit-api-dev.egypt-nutrition-coach.workers.dev`
- **Production Server (`main` branch):** `https://curafit-api.egypt-nutrition-coach.workers.dev`
- **OpenAPI 3.1 Contract:** [`contracts/openapi.yaml`](../contracts/openapi.yaml)
- **Postman Collection & API Docs:** [`postman/CuraFit_API.postman_collection.json`](../postman/CuraFit_API.postman_collection.json) and [`docs/API_REFERENCE.md`](API_REFERENCE.md)
- **Pure-English Error Codes Catalog:** [`contracts/error-codes.json`](../contracts/error-codes.json) and [`docs/ERROR_CODES.md`](ERROR_CODES.md)

---

## 1. Uniform KMM Envelopes & Client-Side Error Localization

Every JSON response from `/v1/*` uses a uniform envelope:

### Success (`2xx`)
```json
{
  "ok": true,
  "data": { ... },
  "meta": {
    "requestId": "197fd531-bb73-41f2-822e-63664ad450df",
    "serverTime": "2026-11-21T15:24:05.997Z",
    "revision": 4
  }
}
```

### Error (`4xx` / `5xx`)
```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Account was updated; refresh and try again.",
    "params": {
      "expectedRevision": 10,
      "serverRevision": 12
    },
    "fieldErrors": [],
    "retryable": false,
    "details": {
      "currentRevision": 12,
      "mergeHints": {
        "expectedRevision": 10,
        "serverRevision": 12,
        "syncChangesEndpoint": "/v1/sync/changes?after=10",
        "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
      }
    }
  },
  "meta": {
    "requestId": "9a1c4b22-6e81-4f09-b812-33d4e5f6a7b8",
    "serverTime": "2026-11-21T15:24:08.797Z"
  }
}
```

- **Zero Arabic in API Errors:** `error.message` and `fieldErrors[].message` are strictly canonical English. KMM must key UI localization (`ar` / `en`) by `error.code` (and `error.params` interpolation) using the 235 cataloged codes in [`contracts/error-codes.json`](../contracts/error-codes.json).
- **Coaching Review Reason Codes:** Similarly, map `lastReview.reasonCode` (e.g. `RECOVERY_DELOAD_PROPOSED`, `PERFORMANCE_DROP_CALORIE_CUT_HOLD`, `INSUFFICIENT_EVIDENCE_COVERAGE`) to localized client copy.

---

## 2. Typed Ktor / `kotlinx.serialization` Client Generation

Generate a starter Kotlin Multiplatform client from OpenAPI 3.1:

```bash
npx @openapitools/openapi-generator-cli generate \
  -i contracts/openapi.yaml \
  -g kotlin \
  --library multiplatform \
  --additional-properties=serializationLibrary=kotlinx_serialization,packageName=com.curafit.shared.api,useCoroutines=true \
  -o kmm-api-client
```

---

## 3. Native Cloudflare Authentication & Token Lifecycle

1. **Social OIDC Sign-In (`POST /v1/auth/oauth/google`, `POST /v1/auth/oauth/apple`):**
   - Returns `{ accessToken, expiresIn: 900, refreshToken, refreshExpiresIn: 2592000, sessionId, user }` inside `data`.
   - Attach `Authorization: Bearer <accessToken>`, `X-Client-Platform: android|ios`, and `X-Client-Version: <semver>` to authenticated requests. Never send custom identity headers (`oai-authenticated-user-id` is stripped at the edge).
2. **Rotating Refresh Tokens (`POST /v1/auth/refresh`):**
   - `refreshToken` (`cfrt_...`) rotates on every refresh. Persist the newly returned `refreshToken` atomically before issuing the next request; replaying a rotated token revokes the entire session with `401 AUTH_REFRESH_TOKEN_REUSED`.
3. **Session & Logout (`GET /v1/auth/session`, `POST /v1/auth/revoke`, `POST /v1/auth/logout`):**
   - Revoke current session (`{ sessionId }`) or all devices (`{ allDevices: true }`).
   - Account deletion (`DELETE /v1/account/delete` with `{ confirm: true }`) writes a permanent `__deleted__` tombstone so prior JWTs fail with `401 ACCOUNT_DELETED`.

---

## 4. Bootstrap, Lazy Plan Loading & Pagination

Prefer lightweight endpoints over `GET /v1/state` (full legacy Web UI snapshot):

1. **App Startup (`GET /v1/bootstrap`):**
   - Send the exact server `ETag` from the previous response in `If-None-Match` (do not synthesize ETags locally).
   - Returns `304 Not Modified` (`0 B`) when unchanged, or a compact (~3.25 KB) snapshot (`revision`, `serverNow`, `serverDate`, `timezone`, `profile`, `activeNutritionPlanRef`, `activeWorkoutPlanRef`, `todaySummary`, `pendingAdaptations`).
2. **On-Demand Day Details:** `GET /v1/plans/{planId}/days/{YYYY-MM-DD}` and `GET /v1/workout-plans/{id}`.
3. **Paginated Logs:** Use `from`, `to`, `offset`, `limit` (`1..100`) on `/v1/food-diary`, `/v1/water-logs`, `/v1/weight-logs`, `/v1/workout-logs`, `/v1/sessions`, and `/v1/checkins`.

---

## 5. Offline Outbox & `409 REVISION_CONFLICT` Protocol

### 5.1. Command Execution (`POST /v1/commands?view=receipt`)
- Always pass `?view=receipt` (or `Prefer: return=minimal`) to receive compact delta receipts (~535 B).
- Generate a deterministic UUID v4 `Idempotency-Key` per user action and store it in your local SQLDelight outbox before transmission. Canonical JSON key sorting on the server guarantees safe idempotent retries (`Idempotency-Replayed: true`).

### 5.2. Resolving `409 REVISION_CONFLICT`
When another device advances `revision`:
1. Call `GET /v1/sync/changes?after=<localRev>&afterSeq=<lastSeq>`.
2. Apply returned `deltas` in ascending `seq` order (`op: "upsert"` or `op: "delete"`). Continue paginating while `hasMore == true`.
3. If `requiresFetch == true` on a `nutrition_plan` or `workout_plan` delta, fetch the full resource from `/v1/plans/{id}` or `/v1/workout-plans/{id}`.
4. Advance `localRevision = data.currentRevision` only after all deltas up to that revision are committed locally.
5. Re-submit the queued command with the updated `revision`.

---

## 6. Timezones & Units

- **Timezones:** Store IANA timezones in `profile.timezone` (`Africa/Cairo`, `Asia/Riyadh`, `Asia/Dubai`). When device timezone changes, send `POST /v1/commands` with `action: "timezone"`.
- **Units:** Body/training loads in `kg`; food weights in `grams`; water in standard `cups` (`250 mL`) and `liters`; energy in `kcal`.
- **Null Nutrient Handling:** Nutrient fields (`protein`, `carbs`, `fat`, `fiber`, `sodium`, etc.) may be `null` when absent in reference sources. Never coerce `null` to `0` in UI; display a localized `"Not available in source"` label.

---

## 7. Minimal Ktor Client Sketch (Illustrative)

```kotlin
@Serializable
data class ApiEnvelope<T>(
    val ok: Boolean,
    val data: T? = null,
    val error: ApiErrorBody? = null,
    val meta: ApiMeta
)

class CuraFitApiClient(
    private val http: HttpClient,
    private val baseUrl: String,
    private val tokenProvider: suspend () -> String
) {
    private var bootstrapEtag: String? = null

    suspend fun fetchBootstrap(): ApiEnvelope<BootstrapData>? {
        val response = http.get("$baseUrl/v1/bootstrap") {
            header(HttpHeaders.Authorization, "Bearer ${tokenProvider()}")
            bootstrapEtag?.let { header(HttpHeaders.IfNoneMatch, it) }
        }
        if (response.status == HttpStatusCode.NotModified) return null
        bootstrapEtag = response.headers[HttpHeaders.ETag]
        return response.body()
    }

    suspend fun sendCommandReceipt(
        idempotencyKey: String,
        revision: Int,
        action: String,
        payload: JsonObject
    ): ApiEnvelope<CommandReceiptData> {
        return http.post("$baseUrl/v1/commands?view=receipt") {
            header(HttpHeaders.Authorization, "Bearer ${tokenProvider()}")
            header("Idempotency-Key", idempotencyKey)
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("revision", revision)
                put("action", action)
                put("payload", payload)
            })
        }.body()
    }
}
```
