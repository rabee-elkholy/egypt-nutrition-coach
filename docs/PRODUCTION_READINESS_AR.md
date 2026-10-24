> نتيجة التحقق اللاحق والتصحيحات وحدود الجاهزية موثقة في [فحص استيراد 0.12](IMPORT_VERIFICATION_012_AR.md). تُقدّم نتائجه على ادعاءات الاكتمال والقياسات السابقة في هذا المستند.

# جاهزية الإنتاج ودليل التشغيل وقرارات المالك — Production Readiness & Runbook (`v0.12.0`)

يوثّق هذا المستند حالة الجاهزية الحالية لمشروع **Egypt Nutrition Coach**، وبوابات القرار (`Go / No-Go Gates`)، والقرارات المطلوبة من المالك، ودليل التشغيل والمراقبة والتعامل مع الحوادث (Operational Runbook).

---

## 1. الحكم النزيه على الجاهزية (Honest Readiness Verdict)

> **الحالة العامة:** **Integration-ready in code, deployment/clinical/data gates pending**

| المسار | الحكم (Status) | التبرير |
| --- | --- | --- |
| **1. MVP Web Status** | **Local browser journeys verified** | واجهة الويب الحالية وأونبوردينج المحادثة ومحاكاة الـ90 يومًا نجحت في الرحلات المحلية المحددة، بما يشمل محاكاة 15 يومًا. |
| **2. KMM API Integration Status** | **Integration candidate; KMM client verification pending** | عقد `OpenAPI 3.1` اجتاز التحقق البنيوي، ولم يُجمع عميل KMM فعلي، `/v1/bootstrap` وإيصالات مختصرة (مثال المياه 413 بايت؛ الحجم يتغير بحسب الفروق) جاهزة، محول `Bearer JWT` وإبطال الجلسات ودمج الحساب المجهول جاهز، والمزامنة الأوفلاين (`deltas` + `tombstones` + `409 mergeHints`) والمنطقة الزمنية لكل مستخدم والبحث العربي في الكتالوج جاهزة ومختبرة. |
| **3. Production Launch Readiness** | **Pending External Owner Gates** | لا يجوز وصف النظام بأنه جاهز للإطلاق التجاري العام للجمهور قبل إغلاق البوابات الخارجية الأربع أدناه (ربط موفر الهوية الحي، نشر الترحيل والكود على Cloudflare بصلاحية المالك، ربط قاعدة البيانات الغذائية المصرية الكاملة، واعتماد مختصين بشريين للقواعد الطبية والرياضية). |

---

## 2. قرارات المالك المتبقية (Owner Decisions Required — Ranked by Impact)

| # | القرار المطلوب من المالك | الخيار الافتراضي المجهز في الكود حاليًا | ما سيحدث فور اتخاذ القرار |
| --- | --- | --- | --- |
| **1** | **اختيار موفر الهوية (Identity Provider):** هل سيتم اعتماد **Firebase Auth** أم **Supabase Auth** لتطبيق KMM؟ | واجهة `server/auth.mjs` تدعم التحقق القياسي من `Bearer JWT` (`RS256`/`ES256`/`HS256` + `JWKS`) مع بقاء كوكي `coach_uid` المجهول لواجهة الويب فقط. | ضبط متغيرات البيئة `AUTH_ISSUER` و`AUTH_AUDIENCE` و`AUTH_JWKS_URI` في Cloudflare Worker دون تعديل سطر كود واحد. |
| **2** | **صلاحية النشر والترحيل على Cloudflare (`CLOUDFLARE_API_TOKEN`):** الإذن بتطبيق الترحيل `0003_production_readiness.sql` ونشر الكود على الـWorker المعتمد `egypt-nutrition-coach`. | الترحيل والكود اجتازا الاختبارات المحلية المحددة؛ هذا لا يثبت حدود البنية الحية؛ لم يُلمس الإنتاج احترامًا لقواعد الصلاحيات. | أخذ نسخة احتياطية (`wrangler d1 export`) ثم تشغيل `npm run deploy:d1 && npm run deploy`. |
| **3** | **ربط قاعدة البيانات الغذائية المصرية (`Egypt Nutrition Database`):** توفير لقطة التصدير المعتمدة أو واجهة الاتصال بمشروع PostgreSQL/Supabase المنفصل. | `server/food-catalog.mjs` يفهرس الـ3,291 صنفًا الحالية (ويفصل الـ3,070 المعتمدة عن الـ221 التقديرية) ويوفر الدالة `registerExternalFoodCatalogSnapshot`. | استيراد اللقطة المعتمدة لتوسيع الأكلات والمشروبات المصرية المعتمدة مخبريًا بنفس عقد الـAPI الحالي. |
| **4** | **المراجعة الطبية والرياضية المتخصصة (Clinical & Coaching Sign-off):** مراجعة أخصائي تغذية علاجية وعلاج طبيعي لقواعد الحالات الصحية (`hypertension`, `lactose_intolerance`, `favism`, `gout`, `ibs`) وجدول استبعادات الإصابات. | حواجز أمان محافظة (Fail-Closed)، فرض الصوديوم المرجعي في الضغط، استبعاد الألبان والفول/الطعمية، ووسم جميع المخرجات بـ`system_generated_guidance`. | توثيق اعتماد المختصين أو تعديل الحدود الرقمية وفق توصياتهم الرسمية. |
| **5** | **بيئة Staging معزولة (اختياري):** قواعد `AGENTS.md` الحالية تنص على بيئة واحدة وفرع `main` فقط. هل يرغب المالك مستقبلًا في إضافة بيئة `staging` في `wrangler.jsonc`؟ | الالتزام الكامل بقواعد `AGENTS.md` (عدم إنشاء أي Worker أو D1 بديل). | في حال الموافقة، يُضاف `[env.staging]` بمعرّف D1 منفصل لاختبار الترحيلات قبل الإنتاج. |
| **6** | **مزودو الإشعارات والاشتراكات (Push & Billing Vendors):** تحديد مزود الإشعارات (FCM/APNs) وبوابة الاشتراكات (RevenueCat / Play Billing / StoreKit). | مسارات `/v1/notifications/preferences` و`/v1/entitlements` جاهزة في العقد. | ربط Webhook المزود لتحديث حقل `entitlements.tier` وإرسال الإشعارات المجدولة. |

---

## 3. دليل التشغيل والمراقبة والاستجابة للحوادث (Operational Runbook)

### 3.1. المؤشرات والتنبيهات التشغيلية (Metrics & Alarms)

يصدر الخادم سجلات JSON مهيكلة ومنقاة من البيانات الشخصية عبر `server/logger.mjs`. عند ربط Cloudflare Workers Logs / Logpush، يجب مراقبة المؤشرات التالية:

1. **معدل أخطاء الخادم (`status >= 500` / `event: "unhandled_runtime_error"` أو `"database_operation_failed"`):**
   - **العتبة (Alarm Threshold):** `> 0.5%` من الطلبات خلال 5 دقائق.
   - **إجراء التحقيق:** افحص `requestId` و`path` في سجلات Cloudflare، وتحقق من حالة Cloudflare D1 عبر `npx wrangler d1 info egypt-nutrition-coaching`.
2. **معدل فشل المصادقة (`status == 401` / `code: "AUTH_*"`):**
   - **العتبة:** ارتفاع مفاجئ `> 10%` بعد تدوير مفاتيح JWKS أو تغيير إعدادات المزود.
   - **إجراء التحقيق:** تحقق من تطابق `AUTH_ISSUER` و`AUTH_AUDIENCE` وصلاحية رابط `AUTH_JWKS_URI`.
3. **معدل تعارضات المزامنة (`status == 409` / `code: "REVISION_CONFLICT"`):**
   - **العتبة:** `> 5%` من طلبات `POST /v1/commands`.
   - **إجراء التحقيق:** يشير إلى تأخر عميل KMM في قراءة `/v1/sync/changes` قبل إعادة المحاولة.
4. **معدل حجب الطلبات الزائدة (`status == 429` / `code: "RATE_LIMITED"`):**
   - يحمي Worker وD1 من الحلقات اللانهائية في العميل أو محاولات الإغراق.

### 3.2. قائمة التحقق قبل النشر للإنتاج (Deployment-Gated Checklist)

قبل تنفيذ أي نشر على Cloudflare:
- [ ] تشغيل `npm run check` والتأكد من نجاح جميع الاختبارات (0 Failed).
- [ ] تشغيل `npm run audit:matrix` والتأكد من `0 errors` في التمارين والتغذية.
- [ ] تشغيل `npm run benchmark` والتأكد من بقاء حجم `/v1/bootstrap` أقل من 10 KB وإيصال الكتابة أقل من 2 KB.
- [ ] أخذ نسخة احتياطية من قاعدة D1 الحية (`npx wrangler d1 export egypt-nutrition-coaching --remote --output=backup.sql`).
- [ ] تطبيق الترحيلات الجديدة (`npm run deploy:d1`).
- [ ] نشر الكود (`npm run deploy`) والتحقق من `GET /v1/health` و`GET /v1/capabilities`.
