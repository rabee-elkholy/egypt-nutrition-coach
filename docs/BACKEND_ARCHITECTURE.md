# معمارية الخادم والبيانات — Backend Architecture (`v0.12.0`)

يوثّق هذا المستند معمارية الباك إند لمشروع **Egypt Nutrition Coach** على منصة **Cloudflare Workers + Cloudflare D1**، وحدود المسؤوليات بين طبقة الـHTTP API ومحركات المجال (Domain Engines) وطبقة التخزين المزدوجة (Aggregate + Normalized Relational D1) الجاهزة لتكامل تطبيق **Kotlin Multiplatform (KMM)** على Android وiOS.

---

## 1. المبادئ المعمارية وحدود الخدمة (Service Boundaries)

1. **فصل منطق المجال عن النقل والتخزين (Clean Domain Separation):**
   - محركات حساب الاحتياجات وتخطيط الوجبات (`planner-core.mjs`, `diet-patterns.mjs`, `calculator.mjs`) ومحركات التمرين والاستشفاء (`server/workouts.mjs`, `server/recovery.mjs`, `server/training-review.mjs`, `server/coaching.mjs`) تعمل كدوال حتمية نقية (Deterministic Pure Functions) لا تعتمد على تفاصيل Cloudflare أو واجهة الويب.
   - تطبيق الموبايل (KMM) لا يكرر معادلات التغذية أو قواعد التدرج التدريبي محليًا؛ الباك إند هو مصدر الحقيقة الوحيد (Single Source of Truth) مع دعم كامل للتخزين المؤقت والمزامنة الأوفلاين.
2. **التزام صارم بعقد الاستضافة الموحد (`AGENTS.md`):**
   - **Worker Name:** `egypt-nutrition-coach`
   - **Entrypoint:** `server/cloudflare-entry.mjs` (يُبنى إلى `dist/server/cloudflare.js`)
   - **D1 Database:** `egypt-nutrition-coaching` (`90fa62f1-7866-4156-ac29-f0aec4814bab`)
   - **Branch:** `main` فقط.

---

## 2. مكونات الخادم (Server Components)

| المكوّن | الملف | المسؤولية |
| --- | --- | --- |
| **Edge Gateway & Cookie Adapter** | `server/cloudflare-entry.mjs` | تجريد أي هيدر هوية مرسل من العميل (`oai-authenticated-user-id`) لمنع الانتحال؛ تمرير توكن `Authorization: Bearer <JWT>` لتطبيق KMM، أو توليد كوكي `coach_uid` (`HttpOnly; Secure; SameSite=Lax`) لواجهة الويب التجريبية. |
| **API Router & Contract Layer** | `server/worker.mjs` | توجيه طلبات `/v1/*`، التحقق من حجم الطلب (40 KB streaming limit) وترميز UTF-8، دعم `ETag`/`If-None-Match`، تقديم `/v1/bootstrap` والاستجابات المختصرة (`?view=receipt`)، وتوحيد غلاف الخطأ (`ErrorEnvelope`). |
| **Authentication & Rate Limiter** | `server/auth.mjs` | التحقق التشفيري من JWT (`HS256`/`RS256`/`ES256` عبر WebCrypto SubtleCrypto)، فحص `iss` و`aud` و`exp` و`nbf` مع هامش انحراف ساعة 60 ثانية، فحص جدول إبطال الجلسات والحسابات المحذوفة (`coaching_auth_sessions`)، وتحديد معدل الطلبات لكل مستخدم. |
| **Structured Redacting Logger** | `server/logger.mjs` | تسجيل الأحداث بصيغة JSON مهيكلة مع `requestId` وتنقية تلقائية (`redactObject`) لأي رموز مصادقة أو بيانات صحية أو قياسات جسم. |
| **Dual-Model Persistence & Sync** | `server/store.mjs` | إدارة المعاملات الذرية (`db.batch`) بشرط التفاؤل (`revision` CAS + `_commitToken`)، حساب البصمة المعيارية للطلبات (`canonicalCommandDigest`)، الكتابة المزدوجة في الجداول المفهرسة و`coaching_sync_outbox`، والتصدير والحذف الشاملين. |
| **Food Catalog & Beverage Engine** | `server/food-catalog.mjs` | فهرسة 3,291 صنفًا غذائيًا ومشروبًا مع التطبيع العربي والمرادفات المصرية، فصل الأصناف المعتمدة (`Approved`) عن التقديرية (`Pending Review`)، وحساب المشروبات والوصفات مع حارس الكثافة والـYield. |
| **Domain Time & Timezone Context** | `server/clock.mjs` + `coaching-shared.mjs` | توفير الوقت المحلي للطلب عبر `AsyncLocalStorage` مع احترام المنطقة الزمنية `IANA timezone` الخاصة بكل مستخدم (`Africa/Cairo`, `Asia/Riyadh`, `Asia/Dubai`، إلخ) وعزل وضع المحاكاة (`simulation=1`). |

---

## 3. مخططات التتابع (Sequence Diagrams)

### 3.1. بدء تشغيل تطبيق KMM والكتابة المختصرة (Bootstrap & Delta Receipt Flow)

```
KMM App (Android/iOS)                   Cloudflare Edge (worker.mjs)                 Cloudflare D1 (SQLite)
        |                                            |                                         |
        |--- GET /v1/bootstrap --------------------->|                                         |
        |    Authorization: Bearer <JWT>             |-- Verify JWT + Check Revocation ------->|
        |    If-None-Match: W/"rev-4"                |-- SELECT revision, body --------------->|
        |<-- 200 OK (3.1 KB JSON, ETag: W/"rev-5") --|                                         |
        |                                            |                                         |
        |--- POST /v1/commands?view=receipt -------->|                                         |
        |    Idempotency-Key: <UUID>                 |-- Canonical SHA-256 Digest ------------>|
        |    {"revision":5,"action":"water",...}     |-- Atomic Batch (CAS revision=5 -> 6) -->|
        |                                            |   1. UPDATE coaching_accounts           |
        |                                            |   2. INSERT coaching_water_logs         |
        |                                            |   3. INSERT coaching_sync_outbox (seq)  |
        |                                            |   4. INSERT coaching_requests (receipt) |
        |<-- 200 OK (413 Bytes Receipt + Delta) -----|                                         |
```

### 3.2. مزامنة جهازين أوفلاين وحل التعارض (Two-Device Offline Sync & 409 Resolution)

```
Device A (Offline Queue)                Cloudflare Worker                            Device B (Online)
        |                                       |                                            |
        |                                       |<-- POST /v1/commands (rev 5 -> 6) ---------|
        |                                       |    (Deletes meal entry "m-101")            |
        |                                       |--> Writes Tombstone to coaching_sync_outbox|
        |                                       |                                            |
        |--- POST /v1/commands (rev 5) -------->|                                            |
        |<-- 409 Conflict ----------------------|                                            |
        |    code: "REVISION_CONFLICT"          |                                            |
        |    currentRevision: 6                 |                                            |
        |    mergeHints.syncChangesEndpoint     |                                            |
        |                                       |                                            |
        |--- GET /v1/sync/changes?after=5 ----->|                                            |
        |<-- 200 OK ----------------------------|                                            |
        |    deltas: [{seq:601, op:"delete",    |                                            |
        |      entityType:"food_entry",         |                                            |
        |      entityId:"m-101"}]               |                                            |
        |                                       |                                            |
        |--- Rebase local SQLite & retry ------>|                                            |
        |    POST /v1/commands (rev 6 -> 7)     |                                            |
        |<-- 200 OK (Receipt rev 7) ------------|                                            |
```

---

## 4. مخطط قاعدة البيانات الموحد (D1 Schema v0.12.0)

يجمع المخطط بين جدول الحالة النشطة (`coaching_accounts`) لسرعة القراءة الذرية وجداول الكيانات المفهرسة (`0003_production_readiness.sql`) لمنع تضخم الوثيقة ودعم الاستعلامات المقسمة لصفحات:

- `coaching_accounts (user_id PK, revision, body)` — يحتفظ بالملف الشخصي والإعدادات والنافذة النشطة (95 يومًا)، بينما تُحفظ الخطط والسجلات التاريخية في الجداول العلائقية.
- `coaching_plans (user_id, plan_id PK, created_at, body)` — أرشيف خطط التغذية غير القابل للتعديل (Immutable).
- `coaching_workout_plans (user_id, plan_id PK, body)` — أرشيف خطط التمارين غير القابل للتعديل.
- `coaching_requests (user_id, request_key PK, digest, response)` — إيصالات منع تكرار العمليات (Idempotency Receipts).
- `coaching_changes (user_id, revision PK, action, at)` — سجل التدقيق التاريخي للمراجعات.
- `coaching_sync_outbox (user_id, seq PK, revision, entity_type, entity_id, op, at, payload)` — سجل التغييرات التفصيلي (`upsert`/`delete`) لمزامنة تطبيق KMM.
- `coaching_food_entries (user_id, entry_id PK, date, slot, source, updated_at, deleted, body)` — مفهرس بـ`(user_id, date)`.
- `coaching_water_logs (user_id, date PK, cups, liters, updated_at, body)`
- `coaching_weight_logs (user_id, date PK, kg, source, updated_at, body)`
- `coaching_workout_logs (user_id, log_id PK, date, exercise_id, plan_id, updated_at, deleted, body)` — مفهرس بـ`(user_id, date)`.
- `coaching_sessions (user_id, session_id PK, date, day_index, status, updated_at, body)` — مفهرس بـ`(user_id, date)`.
- `coaching_checkins (user_id, date PK, at, body)`
- `coaching_auth_sessions (user_id, session_id PK, device_id, created_at, expires_at, revoked_at)` — لإبطال الجلسات وتوثيق حذف الحسابات أو دمج الجلسات المجهولة.
- `coaching_account_consents (user_id, consent_type PK, version, accepted, at)` — لتوثيق موافقات الخصوصية والبيانات الصحية.
