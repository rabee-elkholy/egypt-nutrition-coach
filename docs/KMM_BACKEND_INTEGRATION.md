> نتيجة التحقق اللاحق والتصحيحات وحدود الجاهزية موثقة في [فحص استيراد 0.12](IMPORT_VERIFICATION_012_AR.md). تُقدّم نتائجه على ادعاءات الاكتمال والقياسات السابقة في هذا المستند.

# دليل تكامل تطبيق الموبايل (KMM) — KMM Backend Integration Guide (`v1`)

يوفر هذا الدليل لفريق تطوير **Kotlin Multiplatform (Android & iOS)** المواصفات العملية للربط مع الباك إند، بما يشمل المصادقة، بدء التشغيل السريع، طابور الأوامر الأوفلاين (Offline Outbox)، معالجة التعارضات (`409`)، المناطق الزمنية، وتوليد العميل من [contracts/openapi.yaml](../contracts/openapi.yaml).

---

## 1. توليد الـSDK والعميل المهيكل (Typed Client Generation)

العقد الرسمي موثق بصيغة **OpenAPI 3.1.0** في المسار [contracts/openapi.yaml](../contracts/openapi.yaml)، مع أمثلة حقيقية في [contracts/examples/](../contracts/examples/).

لتوليد عميل Kotlin (`Ktor` + `kotlinx.serialization`) باستخدام OpenAPI Generator:

```bash
npx @openapitools/openapi-generator-cli generate \
  -i contracts/openapi.yaml \
  -g kotlin \
  --library multiplatform \
  --additional-properties=serializationLibrary=kotlinx_serialization,packageName=eg.nutritioncoach.shared.api,useCoroutines=true \
  -o kmm-api-client
```

---

## 2. مصادقة الجلسات وترحيل الحساب التجريبي (Auth & Account Claim)

1. **إرسال رمز الدخول (Bearer Token):**
   - يرسل تطبيق KMM الهيدر `Authorization: Bearer <ID_TOKEN>` و`X-Client-Device-Id: <device-uuid>` في كل طلب إلى `/v1/*`.
   - لا ترسل أبدًا الهيدر `oai-authenticated-user-id` من تطبيق الموبايل؛ يقوم `server/cloudflare-entry.mjs` بحذفه تلقائيًا على الحافة.
2. **التحقق من الجلسة:**
   - `GET /v1/auth/session` يعيد `userId` (`user:<sub>`)، `sessionId`، `scopes`، ومستوى الباقة `entitlement` (`free` أو `premium`).
3. **إبطال الجلسة (Logout / Revoke):**
   - عند تسجيل الخروج على الجهاز الحالي: `POST /v1/auth/revoke` مع `{"sessionId": "<sid>"}`.
   - عند تسجيل الخروج من جميع الأجهزة: `POST /v1/auth/revoke` مع `{"allDevices": true}`.
4. **دمج بيانات الجلسة المجهولة (Anonymous-to-Verified Claim):**
   - إذا استخدم الزائر نسخة الويب أو وضع التجربة (`anon:<uuid>`) ثم أنشأ حسابًا موثقًا، استدعِ `POST /v1/auth/claim-anonymous` مع رمز Bearer والكوكي `coach_uid` المالكة للحساب؛ لا يكفي معرفة المعرّف وحده. جسم الطلب:
     ```json
     {
       "anonymousUserId": "anon:550e8400-e29b-41d4-a716-446655440000",
       "consent": true
     }
     ```
   - تُنقل البيانات مرة واحدة فقط ويُغلق المعرّف المجهول بعلامة `__claimed__` لمنع أي مطالبة ثانية.

---

## 3. بدء التشغيل السريع والتخزين المؤقت (Bootstrap & Lazy Loading)

بدلًا من استدعاء `GET /v1/state` (الذي يعيد الخطة الكاملة بحجم ~500 KB)، يتبع تطبيق KMM المسار التالي:

1. عند فتح التطبيق: استدعِ `GET /v1/bootstrap` مع الهيدر `If-None-Match` بقيمة `ETag` المحفوظة من آخر استجابة (لا تُنشئها من revision).
   - إذا لم يتغير الحساب، يعيد الخادم `304 Not Modified` (صفر بايت).
   - إذا تغير الحساب، يعيد الخادم ملخصًا خفيفًا (**~3.1 KB**) يشمل: `revision`، `serverNow`، `serverDate`، `timezone`، `profile`، معرف الخطة النشطة `activeNutritionPlanRef`، `todaySummary`، والتوصيات المعلقة `pendingAdaptations`.
2. عند فتح شاشة تفاصيل وجبات يوم معين: استدعِ `GET /v1/plans/{planId}/days/{YYYY-MM-DD}`.
3. عند استعراض السجلات التاريخية: استخدم المسارات المقسمة لصفحات:
   - `GET /v1/food-diary?date=YYYY-MM-DD`
   - `GET /v1/water-logs?from=2026-10-01&to=2026-10-24&limit=30&offset=0`
   - `GET /v1/weight-logs?limit=30&offset=0`
   - `GET /v1/workout-logs?limit=30&offset=0`
   - `GET /v1/sessions?limit=30&offset=0`
   - `GET /v1/checkins?limit=30&offset=0`

---

## 4. طابور الأوامر الأوفلاين وحل التعارضات (Offline Outbox & 409 Protocol)

### 4.1. إرسال الأوامر (Command Execution)

لتقليل استهلاك باقة الإنترنت والبطارية على الموبايل، أضف `?view=receipt` (أو الهيدر `Prefer: return=minimal`) عند استدعاء `POST /v1/commands`:

- **حجم الاستجابة:** **~413 بايت** فقط (بدل 500 KB).
- **Idempotency-Key:** ولّد UUID v4 فريدًا لكل فعل يقوم به المستخدم واحفظه في جدول `local_outbox` داخل SQLite/SQLDelight على الموبايل قبل الإرسال.
- **Canonical JSON Hashing:** يقوم الخادم بترتيب مفاتيح JSON معياريًا قبل حساب بصمة `SHA-256`، لذا فإن إعادة إرسال نفس الأمر بعد انقطاع الشبكة تعيد نفس الإيصال (`200 OK` مع الهيدر `Idempotency-Replayed: true`) دون تكرار التسجيل.

### 4.2. معالجة التعارض (`409 REVISION_CONFLICT`)

عندما يعدّل المستخدم حسابه من جهاز ثانٍ، يعيد الخادم `409 Conflict` بالغلاف الموحد:

```json
{
  "code": "REVISION_CONFLICT",
  "currentRevision": 12,
  "mergeHints": {
    "expectedRevision": 10,
    "serverRevision": 12,
    "syncChangesEndpoint": "/v1/sync/changes?after=10",
    "resolutionPolicy": "fetch_sync_deltas_then_rebase_or_retry"
  }
}
```

**خطوات المعالجة في KMM SyncManager:**
1. استدعِ `GET /v1/sync/changes?after=10` (أو `?afterSeq=<lastSeq>`).
2. طبّق مصفوفة `deltas` بالترتيب حسب `seq`:
   - `op: "upsert"` → حدّث السجل المحلي في SQLDelight بالـ`payload` المرفق.
   - `op: "delete"` → احذف السجل المحلي المطابق لـ`entityId` (tombstone).
3. حدّث `localRevision = currentRevision` (12).
4. أعد إرسال الأمر المعلق في الطابور المحلي برقم المراجعة الجديد (`revision: 12`) مع الاحتفاظ بنفس `Idempotency-Key` إذا كان الطلب السابق رُفض بتعارض ولم يُحفظ. عند فقدان الرد أعد نفس الطلب الأصلي أولًا للتأكد من إيصال التنفيذ.

---

## 5. المناطق الزمنية والوحدات والترجمة (Timezones, Units & Localization)

- **المناطق الزمنية (`IANA Timezone`):**
  - يُحفظ التوقيت في `profile.timezone` (مثل `Africa/Cairo`، `Asia/Riyadh`، `Asia/Dubai`).
  - عند سفر المستخدم واكتشاف تغير `TimeZone.currentSystemDefault().id` في KMM، اعرض خيار تحديث المنطقة الزمنية عبر الأمر:
    ```json
    {"revision": 12, "action": "timezone", "payload": {"timezone": "Asia/Riyadh", "locale": "ar-SA"}}
    ```
- **الوحدات القياسية (SI Units):**
  - الأوزان: `kg` (للجسم والأحمال التدريبية) و`grams` (للأطعمة).
  - السوائل: `cups` (كوب قياسي = 250 mL) و`liters`.
  - الطاقة: `kcal`.
  - المغذيات المجهولة: تُعاد دائمًا `null` (سلسلة نصية عشرية عند توفرها، أو `null` عند غيابها في المصدر). **تحذير:** لا تحوّل `null` في واجهة KMM إلى `0`؛ اعرض `"غير متوفر في المصدر"`.
- **أكواد الأخطاء والأسباب (`code` & `reasonCode`):**
  - اعتمد على `code` في غلاف الخطأ (مثل `REVISION_CONFLICT`, `AUTH_TOKEN_EXPIRED`, `RATE_LIMITED`) وعلى `lastReview.reasonCode` (مثل `RECOVERY_DELOAD_PROPOSED`, `PERFORMANCE_DROP_CALORIE_CUT_HOLD`, `INSUFFICIENT_EVIDENCE_COVERAGE`) لربط الترجمة المحلية `ar`/`en` في KMM بدل تحليل النصوص العربية برمجيًا.

---

## 6. مثال كود مختصر لعميل KMM (Kotlin / Ktor Snippet)

```kotlin
class CoachApiClient(
    private val http: HttpClient,
    private val baseUrl: String,
    private val tokenProvider: suspend () -> String
) {
    private var bootstrapEtag: String? = null

    suspend fun fetchBootstrap(): BootstrapDto? {
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
    ): CommandReceiptDto {
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

## ملاحظات المزامنة بعد التحقق

احتفظ بقيمة ETag نفسها من الاستجابة؛ المفتاح يشمل تاريخ المستخدم وانتهاء بيانات الوقت. عند وجود صفحات deltas، استعمل nextSeqCursor مع afterSeq حتى نهاية الصفحات. لا تقدّم currentRevision المحلي إلى مراجعات لم تطبق فروقها بعد. فروق nutrition_plan وworkout_plan قد تحمل requiresFetch=true؛ اجلب المورد من مساره بدل اعتبار مرجع الخطة خطة كاملة. تأكيد الأكل ونتائج الجلسة قد يصلان كفروق إضافية لنفس الأمر.

مثال Kotlin أعلاه توضيحي ويحتفظ بقيمة ETag في الذاكرة؛ خزّنها مع النسخة المحلية إذا احتجت استمرار التخزين المؤقت بعد إغلاق التطبيق. لم يتم توليد أو تجميع مشروع KMM فعلي ضمن هذه الجولة.
