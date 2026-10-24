# دليل إعادة التشغيل والتحقق (Reproducibility Guide)

لإعادة تشغيل هذه المحاكاة بالكامل والحصول على نفس النتائج المنطقية والبيانات الموثقة:

```bash
# الانتقال إلى المجلد التنفيذي الرئيسي
cd website/dist

# التأكد من التحديث
git checkout main

# تشغيل المحاكاة الكاملة (100 مستخدم × 90 يومًا)
npm run sim:100:90

# أو تشغيل المحاكاة مع خيارات مخصصة
node scripts/run-full-simulation.mjs --users=100 --days=90 --seed=42100

# تشغيل التحقق المستقل من السجلات الناتجة
npm run sim:verify
```

- **Commit SHA:** f23b9f6
- **Engine Version:** 0.12.0
- **Random Seed:** 42100
- **Run Identifier:** run-1792840358320
