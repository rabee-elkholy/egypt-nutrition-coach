# Egypt Nutrition Coach (CuraFit) — Postman Collection & Cloudflare API Guide

هذا المجلد يحتوي على **Postman Collection جاهزة للاستخدام المباشر** مع بيئتين (Production على Cloudflare Workers و Local Dev على Miniflare)، تعمل بالكامل على **Cloudflare Workers + Cloudflare D1** بدون أي اعتماد على Supabase.

## الملفات المتوفرة

| الملف | الوصف |
| --- | --- |
| `Egypt_Nutrition_Coach_API.postman_collection.json` | الكولليكشن الكاملة (Postman v2.1) — 13 مجلد تغطي **كل** endpoints الـ API و**كل** الـ 30 command action مع أتمتة كاملة للتوكنات والـ `revision` والـ `Idempotency-Key` |
| `Cloudflare_Production.postman_environment.json` | بيئة الإنتاج على `https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev` |
| `Local_Dev.postman_environment.json` | بيئة التشغيل المحلي على `http://127.0.0.1:8787` (`npm run dev`) |

## خطوات التشغيل السريع في Postman

1. افتح Postman واضغط **Import**.
2. استورد ملف الكولليكشن `Egypt_Nutrition_Coach_API.postman_collection.json` + ملف البيئة المطلوب (`Cloudflare_Production` أو `Local_Dev`).
3. اختر البيئة من أعلى اليمين في Postman.
4. ابدأ بالترتيب التالي (كل المتغيرات بتتحفظ أوتوماتيك):
   1. `01. System & Health` -> **Health Check** و **Capabilities Manifest**
   2. `02. Authentication (Cloudflare Native D1)` -> **Register User** (أو **Login User** لو مسجل بالفعل)
      - بيحفظ `accessToken`, `refreshToken`, `sessionId`, `userId` تلقائيًا في متغيرات الكولليكشن.
   3. `03. Onboarding & Pre-Screening` -> **Pre-Screening Eligibility Check** ثم **Generate Initial Plan**
      - بيحفظ `revision`, `activePlanId`, `activeWorkoutPlanId`, `todayDate`, `sampleMealId`, `sampleDayIndex`, `sampleExerciseId`, `sampleRescheduleDate` تلقائيًا.
   4. جرّب أي Endpoint تاني في باقي المجلدات (التغذية، المية، الوزن، التمارين، الاستشفاء، البدائل، الكتالوج، المزامنة، المحاكاة 90 يوم، وتصدير/حذف الحساب).

## أتمتة جاهزة داخل الكولليكشن

- **`Idempotency-Key` أوتوماتيك**: الـ Pre-request script يولّد UUID جديد قبل كل طلب كتابة.
- **مزامنة `revision` أوتوماتيك**: الـ Test script يحدّث `revision` (و `simRevision` في وضع `?simulation=1`) بعد كل استجابة ناجحة لمنع أخطاء `409 REVISION_CONFLICT`.
- **حفظ الـ Tokens أوتوماتيك**: `Register`, `Login`, و `Refresh` يحدّثوا `accessToken` و `refreshToken` تلقائيًا.

## إعداد Cloudflare Production قبل الاستخدام الأول للـ Auth

على Cloudflare Worker (`egypt-nutrition-coach`)، تأكد من تطبيق المايجريشن الجديد `0005_native_auth.sql` وإضافة سر توقيع JWT مرة واحدة:

```powershell
cd e:\Egypt_Nutrition_Local\website\dist
npx.cmd wrangler secret put AUTH_JWT_SECRET --config wrangler.jsonc
npm.cmd run deploy:d1
npm.cmd run deploy
```

> للتشغيل المحلي المباشر بدون إعدادات:
> ```powershell
> cd e:\Egypt_Nutrition_Local\website\dist
> npm.cmd run build
> npm.cmd run dev
> ```
> ثم اختر بيئة `Local_Dev` في Postman وجرّب فورًا على `http://127.0.0.1:8787`.
