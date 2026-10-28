# إعادة التحقق من محاكاة جودة الكود

الحملة تقارن المرجع `329fae6a401c07eb5e7872a266514aa57a227581` بالباك إند المحسن. البذرة `quality-329fae6-v1`، والبداية `2026-10-24`، و100 شخصية مولدة قبل تقسيمها إلى 8 مجموعات. كل شخصية تمر بـ90 تاريخًا محليًا متتابعًا؛ المجموع 9000 يوم لكل نسخة.

تُشغل كل نسخة من مجلد مصدر مستقل ومجمد، وعلى قاعدة D1 محلية منفصلة لكل مجموعة. استُخدمت ملفات أدوات المحاكاة نفسها في النسختين، بما فيها دعم التقسيم ومسار modulesRoot في Miniflare. لا يتغير مصدر أثناء تسجيل مجموعة أو استكمالها. هذه نسخ ملفات للاختبار، ولا تنشئ فروع Git أو موارد Cloudflare جديدة.

لتحضير المرجع، استخدم مجلدًا جديدًا فارغًا، وخذ أرشيف الكوميت المرجعي، ثم انسخ أداتي التشغيل والتقسيم فقط من المرشح المجمد. لا تستبدل ملفات المحركات أو البيانات. مثال من جذر مستودع المرشح، مع استخدام مسارات مطلقة فعلية:

```bash
QUALITY_REPO=/absolute/repo
QUALITY_REFERENCE=/absolute/frozen-reference
mkdir -p "$QUALITY_REFERENCE"
git -C "$QUALITY_REPO" archive 329fae6a401c07eb5e7872a266514aa57a227581 | tar -x -C "$QUALITY_REFERENCE"
cp "$QUALITY_REPO/scripts/cohort/run.mjs" "$QUALITY_REFERENCE/scripts/cohort/run.mjs"
cp "$QUALITY_REPO/scripts/cohort/runtime.mjs" "$QUALITY_REFERENCE/scripts/cohort/runtime.mjs"
ln -s "$QUALITY_REPO/node_modules" "$QUALITY_REFERENCE/node_modules"
ln -s "$QUALITY_REPO/.git" "$QUALITY_REFERENCE/.git"
```

يُحضّر المرشح أيضًا من لقطة ملفات مستقلة للكوميت المذكور في codeVerification، مع نفس node_modules وبيانات Git. يجب أن تكون كائنات الكوميت المرجعي متاحة في المستودع؛ ربط بيانات Git لا يغير ملفات المرجع ولا ينشئ فرعًا. تبقى نسختا المصدر دون تعديل أثناء التسجيل.

بيانات Git في نسخ الملفات قد تشير إلى main الحالي؛ رقم HEAD وحده لا يثبت مصدر المرجع. الأداة النهائية تتحقق من ملفات Worker المرجعي مقابل كائنات Git الأصلية، ومن مطابقة بصمة Worker لكل مجموعة للبناء الصحيح. تُفحص الملفات المجمدة أيضًا وفق قوائم SHA-256 المسجلة داخل كل manifest.

مثال لتوليد مجموعة واحدة، مع تغيير رقم `--shard` من 0 إلى 7 لكل نسخة ومجلد إخراج مستقل. يحدد `--users=100` الفوج الأصلي قبل التقسيم؛ عدد أفراد المجموعة الواحدة 12 أو 13:

```bash
flock -n /absolute/evidence/candidate/shard-0.lock node scripts/cohort/run.mjs --users=100 --days=90 --seed=quality-329fae6-v1 --shards=8 --shard=0 --output=/absolute/evidence/candidate/shard-0
```

يُضاف `--resume` فقط لاستكمال مصدر وإعدادات وبذرة لم تتغير. عندما يحوي التشغيل فشل نقل أو استجابة إعادة طلب تختلف عن التجربة المقابلة، نحفظ المجلد كاملًا ونعيد المجموعة في مجلد جديد بقاعدة فارغة. لا نعدل التواريخ أو الردود، ولا نستثني حقولًا إضافية حتى تمر المقارنة. سجل infrastructure-reruns.json يوضح المحاولات المتأثرة في هذه الحملة. يُستخدم قفل تشغيل خارجي لكل مجلد بيانات، ولا يبدأ التدقيق أثناء وجود كاتب. توازي مجموعتين فقط كان مناسبًا لبيئة الاختبار ذات معالجين وذاكرة 8GB؛ لا تمثل هذه الأرقام اختبار سعة إنتاجية.

للتحقق من مجموعة مكتملة، يُشغل فاحص HTTP من مجلد `source` المحفوظ معها، لأن هذا هو المصدر الذي أُخذت بصمته:

```bash
cd /absolute/evidence/candidate/shard-0/source
node /absolute/repo/scripts/cohort/verify.mjs --output=/absolute/evidence/candidate/shard-0
```

ثم يُفحص الحفظ الفعلي دون إعادة بناء Worker الملتقط أو تطبيق ترحيلات، وتُقارن الردود والبيانات بالمرجع. الأوامر التالية تُشغل من جذر المشروع:

```bash
node scripts/quality/verify-persistence.mjs /absolute/evidence/candidate/shard-0
node scripts/cohort/compare.mjs --left=/absolute/evidence/baseline/shard-0 --right=/absolute/evidence/candidate/shard-0
```

يُكرر التحقق والحفظ لكل مجموعات النسختين، والمقارنة لكل زوج. أدوات التحقق تحفظ نتائجها في مجلد المجموعة. فشل أي خطوة لا يتحول إلى نجاح بمجرد وجود ملخص أو اكتمال عداد الأيام.

التجميع النهائي يرفض المجموعات الناقصة، والفحوصات الفاشلة، والفروق غير المفسرة، وتغير مصدر الباك إند، وتكرار المستخدمين أو نقص عددهم. يراجع كذلك أسباب الرفض الإضافية من الردود الأصلية. اختبارات الماء السالب تُحسب كطلبات رفض مقصودة، ولا تُعرض باعتبارها HTTP 200:

```bash
node scripts/quality/finalize-cohort.mjs --left=/absolute/evidence/baseline --right=/absolute/evidence/candidate --output=/absolute/evidence/cohort-verification.json
```

في بيئة تنفيذ هذه الحملة، المرجع المعتمد محفوظ في `/workspace/scratch/quality-evidence/baseline-shards` والمرشح في `/workspace/scratch/quality-evidence/final-v4`. المحاولات المستبعدة وأسباب استبعادها محفوظة في `failed-infrastructure` بجوارهما. لا يُرفع الحجم الكامل للردود وقواعد SQLite إلى Git؛ يُرفع التقرير المدمج وبصمات المصدر والأدلة المهمة. لا تثبت هذه المحاكاة دقة سريرية أو احتفاظًا حقيقيًا بالمستخدمين، ولا تحل محل اختبارات واجهة المستخدم أو بوابة المصادقة.
