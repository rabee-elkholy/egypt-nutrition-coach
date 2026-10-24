> نتيجة التحقق اللاحق والتصحيحات وحدود الجاهزية موثقة في [فحص استيراد 0.12](IMPORT_VERIFICATION_012_AR.md). تُقدّم نتائجه على ادعاءات الاكتمال والقياسات السابقة في هذا المستند.

# مراجعة الأمان والخصوصية ونموذج التهديدات — Security & Privacy Review (`v0.12.0`)

يوثّق هذا المستند نموذج التهديدات (Threat Model)، وضوابط المصادقة وتفويض الموارد، وتنقية السجلات، وسياسة الخصوصية وحذف البيانات الحساسة في **Egypt Nutrition Coach**.

---

## 1. نموذج التهديدات وضوابط الحماية (Threat Model & Mitigations)

| التهديد (Threat) | مستوى الخطر | الضابط المنفذ في الكود (Mitigation) | دليل الاختبار |
| --- | --- | --- | --- |
| **انتحال الهوية عبر الهيدر (`oai-authenticated-user-id` Spoofing)** | حرج (P0) | يقوم `server/cloudflare-entry.mjs` بحذف الهيدر `oai-authenticated-user-id` من أي طلب وارد على الحافة قبل تمريره إلى `server/worker.mjs`. | `tests/e2e-release-scenarios.test.mjs` (`E01`) |
| **الوصول لبيانات مستخدم آخر (IDOR / Cross-Account Leakage)** | حرج (P0) | جميع استعلامات D1 (`coaching_accounts`, `coaching_plans`, `coaching_workout_plans`, `coaching_sync_outbox`, والجداول المفهرسة) مقيّدة بـ`WHERE user_id = ?` المشتق حصريًا من التوكن الموثق على الخادم. | `tests/api.test.mjs`, `tests/e2e-release-scenarios.test.mjs` (`E02`) |
| **سرقة أو انتهاء صلاحية JWT أو استخدام جهاز مفقود** | عالٍ (P0) | التحقق التشفيري الكامل في `server/auth.mjs` (`RS256`/`ES256`/`HS256`)، فحص `exp`/`nbf`/`iat`/`iss`/`aud`، ورفض خوارزمية `none`، مع جدول `coaching_auth_sessions` لإبطال جلسة جهاز محدد أو جميع الأجهزة فورًا عبر `/v1/auth/revoke`. | `tests/e2e-release-scenarios.test.mjs` (`E02`) |
| **الاستحواذ غير المصرح به على الجلسة المجهولة (Anonymous Claim Hijack)** | عالٍ (P0) | يتطلب `/v1/auth/claim-anonymous` توكن مستخدم موثق + موافقة صريحة (`consent: true`)، ويسجل tombstone `__claimed__` يمنع المطالبة بنفس الجلسة المجهولة مرة ثانية. | `tests/e2e-release-scenarios.test.mjs` (`E01`) |
| **إعادة استخدام توكن قديم بعد حذف الحساب (Deleted Account Resurrection)** | عالٍ (P0) | يسجل `/v1/account/delete` علامة `__deleted__` في `coaching_auth_sessions` بعد مسح جميع الجداول، ما يجعل أي توكن سابق يُرفض فورًا بـ`401 ACCOUNT_DELETED`. | `tests/e2e-release-scenarios.test.mjs` (`E12`) |
| **تسرب البيانات الصحية أو الرموز في السجلات (PII / Health Log Leakage)** | عالٍ (P0) | وحدة `server/logger.mjs` تطبق `redactObject` و`maskSubject` لتعمية `Authorization`, `Cookie`, `weight`, `diseases`, `injuries`, `painRegions`, `checkins`, وأي حقول صحية قبل كتابة السجل. | `tests/e2e-release-scenarios.test.mjs` (`E14`) |
| **إغراق الخادم أو استنزاف الذاكرة (DoS / Oversized Body / Abuse)** | متوسط (P1) | إلغاء القراءة المتدفقة (Streaming Cancel) فور تجاوز 40,000 بايت (`413 PAYLOAD_TOO_LARGE`)، وتحديد معدل الطلبات لكل مستخدم في `checkRateLimit` (`429 RATE_LIMITED`)، وفحص `Origin` ضد هجمات CSRF. | `tests/api-audit.test.mjs`, `tests/e2e-release-scenarios.test.mjs` (`E14`) |

---

## 2. صلاحيات الحسابات والأدوار (Role Scopes & Least Privilege)

- **نطاقات المستخدم القياسية (`scopes`):**
  - `coach:read` — قراءة حالة الحساب، الخطط، السجلات، والكتالوج.
  - `coach:write` — تنفيذ الأوامر على الحساب المملوك للمستخدم فقط.
- **عدم الثقة بأي دور يرسله العميل:**
  - لا يقبل الخادم أي صلاحيات إدارية أو استحقاقات باقات (`entitlements`) من جسم الطلب؛ تُقرأ الصلاحيات فقط من ادعاءات التوكن الموقع (`payload.scopes` و`payload.entitlement`) أو من حالة الحساب المحفوظة على الخادم.

---

## 3. الخصوصية حسب التصميم، التصدير، والحذف الشامل (Privacy-by-Design, Export & Deletion)

نظرًا لأن التطبيق يتعامل مع بيانات صحية وغذائية حساسة (الوزن، الأمراض المعلنة، الإصابات، النوم، الاستشفاء):

1. **توثيق الموافقات الصريحة (`POST /v1/account/consents`):**
   - يسجل نوع الموافقة (`privacy_policy`, `health_data_processing`, `medical_disclaimer`) وإصدارها وطابعها الزمني في جدول `coaching_account_consents`.
2. **الحق في نقل البيانات (`GET /v1/account/export`):**
   - يصدر ملف JSON مهيكل وكامل يضم الملف الشخصي، التفضيلات، جميع السجلات اليومية، جميع نسخ خطط التغذية والتمرين المؤرشفة، سجل التغييرات، والموافقات المسجلة.
3. **الحق في المسح الشامل (`POST /v1/account/delete`):**
   - يحذف في معاملة ذرية واحدة (`db.batch`) جميع صفوف المستخدم من الجداول الـ14 (`coaching_accounts`, `coaching_requests`, `coaching_plans`, `coaching_changes`, `coaching_workout_plans`, `coaching_food_entries`, `coaching_water_logs`, `coaching_weight_logs`, `coaching_workout_logs`, `coaching_sessions`, `coaching_checkins`, `coaching_sync_outbox`, `coaching_account_consents`, `coaching_auth_sessions`)، ويضع شاهد قبر (`__deleted__`) يمنع إعادة تنشيط الحساب بتوكن قديم.
4. **ملاحظة قانونية وتنظيمية (مصر والخليج):**
   - البنية البرمجية للتصدير والحذف وتوثيق الموافقة وتنقية السجلات منفذة ومختبرة، لكن **لا يُدّعى امتثال قانوني رسمي (مثل قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020 أو نظام PDPL السعودي)** إلا بعد مراجعة مستشار قانوني لنص سياسة الخصوصية ومكان استضافة المزود النهائي.

---

## 4. قرار المالك المطلوب لاختيار موفر الهوية (Identity Provider Decision Gate)

الكود في `server/auth.mjs` جاهز للعمل الفوري مع أي موفر متوافق مع OIDC/JWT عبر متغيرات البيئة التالية في Cloudflare Worker:

- `AUTH_ISSUER`: رابط مُصدِر التوكن (مثل `https://securetoken.google.com/<project-id>` لـFirebase أو `https://<ref>.supabase.co/auth/v1` لـSupabase).
- `AUTH_AUDIENCE`: جمهور التطبيق (`<project-id>` أو `authenticated`).
- `AUTH_JWKS_URI` أو `AUTH_JWKS_JSON`: رابط أو محتوى مفاتيح التوقيع العامة (`RS256` / `ES256`)، أو `AUTH_JWT_SECRET` في حالة `HS256`.
