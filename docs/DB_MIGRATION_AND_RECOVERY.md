# ترحيل قاعدة البيانات والنسخ الاحتياطي والتعافي — DB Migration & Recovery (`v0.12.0`)

يوثّق هذا المستند استراتيجية ترحيل المخطط (Schema Migrations)، والكتابة المزدوجة وترحيل الحسابات القديمة (Backfill)، وإجراءات النسخ الاحتياطي والاسترجاع (Backup/Restore Drill) لقاعدة بيانات **Cloudflare D1 (`egypt-nutrition-coaching`)**.

---

## 1. سجل الترحيلات (Drizzle SQL Migrations)

جميع ملفات الترحيل محفوظة في `drizzle/` ومفهرسة في `drizzle/meta/_journal.json`، وهي **Append-Only / Forward-Only Idempotent**:

| الملف | الغرض | الجداول والفهارس |
| --- | --- | --- |
| `0000_purple_solo.sql` | الجدول الأساسي للحساب وإيصالات منع التكرار | `coaching_accounts`, `coaching_requests` |
| `0001_sweet_talon.sql` | أرشيف خطط التغذية وسجل التغييرات | `coaching_changes`, `coaching_plans` |
| `0002_woozy_spitfire.sql` | أرشيف خطط التمارين | `coaching_workout_plans` |
| `0003_production_readiness.sql` | الجداول العلائقية المفهرسة، وطابور المزامنة (`sync_outbox`)، وإدارة الجلسات والموافقات | `coaching_food_entries` (+ index `user_id, date`), `coaching_water_logs`, `coaching_weight_logs`, `coaching_workout_logs` (+ index `user_id, date`), `coaching_sessions` (+ index `user_id, date`), `coaching_checkins`, `coaching_sync_outbox` (+ index `user_id, revision`), `coaching_auth_sessions`, `coaching_account_consents` |

---

## 2. استراتيجية التوسع التدريجي (Expand → Dual-Write → Backfill → Verify)

لضمان عدم انقطاع الخدمة أو كسر الحسابات القديمة:

1. **Expand (توسيع المخطط):**
   - يستخدم `0003_production_readiness.sql` صيغة `CREATE TABLE IF NOT EXISTS` و`CREATE INDEX IF NOT EXISTS` بحيث يكون تطبيقه آمنًا وقابلًا للإعادة (Idempotent).
2. **Dual-Write (الكتابة المزدوجة الذرية):**
   - في `server/store.mjs` (`saveAccount`)، يتحقق الخادم من وجود الجداول الجديدة (`hasNormalizedTables`).
   - داخل نفس الدفعة الذرية `db.batch(statements)` المحمية بشرط تطابق `revision` و`_commitToken`، يكتب الخادم التحديث في `coaching_accounts` ويكتب السجل المفصل في الجدول العلائقي المقابل (`coaching_food_entries`, `coaching_water_logs`, إلخ) وفي `coaching_sync_outbox`.
   - إذا تجاوز حجم وثيقة الحساب النشطة 900 KB، يقوم الخادم تلقائيًا بتقليم السجلات الأقدم من 95 يومًا من وثيقة JSON مع الاحتفاظ بها كاملة في الجداول العلائقية المفهرسة.
3. **Backfill (ترحيل السجلات التاريخية):**
   - الدالة `backfillAccountToNormalizedTables(db, user)` والمسار `POST /v1/account/backfill` يقومان بنسخ كامل السجلات التاريخية من وثيقة الحساب القديمة إلى الجداول العلائقية دون فقد أي معرّف (`id`) أو تاريخ.
   - **تم إثبات ذلك في الاختبار `E13`:** حساب قديم يحتوي على 365 يومًا من سجلات الوزن والماء والوجبات جرى ترحيله والتحقق من تطابق الأعداد (`365/365`) بنسبة 100%.

---

## 3. النسخ الاحتياطي والاسترجاع والتعافي من الكوارث (Backup, Restore & DR)

### 3.1. آلية النسخ الاحتياطي في Cloudflare D1

توفّر Cloudflare D1 ميزتين أساسيتين للنسخ الاحتياطي يجب استخدامهما معًا قبل أي ترحيل أو نشر:

1. **Time Travel (الاسترجاع الزمني المدمج):**
   - يحتفظ Cloudflare D1 بسجل تغييرات يتيح استعادة قاعدة البيانات إلى أي دقيقة خلال آخر 30 يومًا (في الخطة المدفوعة) أو 7 أيام.
   - أمر التحقق من العلامة الزمنية الحالية قبل الترحيل:
     ```bash
     npx wrangler d1 time-travel info egypt-nutrition-coaching --config wrangler.jsonc
     ```
2. **التصدير الكامل لملف SQL (`d1 export`):**
   - لأخذ نسخة احتياطية كاملة خارجية قبل تطبيق أي migration:
     ```bash
     npx wrangler d1 export egypt-nutrition-coaching --remote --output=backups/d1-backup-$(date +%Y%m%d-%H%M%S).sql --config wrangler.jsonc
     ```

### 3.2. تجربة الاسترجاع والتراجع (Restore Drill & Rollback Limits)

- **أهداف التعافي المقترحة (Proposed RPO / RTO):**
  - **RPO (Recovery Point Objective):** `<= 1 دقيقة` عبر D1 Time Travel، و`24 ساعة` عبر النسخ المصدرة المشفرة خارجيًا.
  - **RTO (Recovery Time Objective):** `<= 15 دقيقة` لاستعادة قاعدة البيانات أو التراجع عن إصدار الـWorker.
- **خطوات استعادة قاعدة البيانات عند الطوارئ:**
  ```bash
  # استعادة قاعدة البيانات إلى اللحظة التي سبقت الترحيل مباشرة
  npx wrangler d1 time-travel restore egypt-nutrition-coaching --timestamp="<ISO-TIMESTAMP>" --config wrangler.jsonc

  # التراجع الفوري عن نشر الكود إلى الإصدار السابق على Cloudflare Workers
  npx wrangler rollback --config wrangler.jsonc
  ```
- **توافق التراجع (Backward Compatibility Window):**
  - لأن الترحيل `0003` يضيف جداول جديدة فقط دون حذف أو تغيير أعمدة الجداول الأربعة القديمة (`coaching_accounts`, `coaching_plans`, `coaching_workout_plans`, `coaching_requests`, `coaching_changes`)، فإن التراجع عن الكود (`wrangler rollback` إلى `v0.11.0`) يظل متوافقًا ولا يكسر قراءة الحسابات.

---

## 4. بوابة الإنتاج (Production Gate)

وفق تعليمات `AGENTS.md` والـMaster Prompt:
- **لم يتم تنفيذ أي اتصال أو ترحيل على قاعدة D1 الحية (`--remote`)** أثناء هذه المهمة.
- جميع الترحيلات والاختبارات شُغّلت محليًا على SQLite 3.40.1 عبر `scripts/local-migrations.mjs`.
- لتطبيق الترحيل على الإنتاج بعد موافقة المالك وأخذ نسخة احتياطية:
  ```bash
  npx wrangler d1 export egypt-nutrition-coaching --remote --output=backup-pre-012.sql --config wrangler.jsonc
  npm run deploy:d1
  npm run deploy
  ```
