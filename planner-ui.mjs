import {DIETS,DIET_INFO,FASTING,FIXED_DIET_MEALS,assertDietDay} from './diet-patterns.mjs';
import {SPORTS} from './sports.mjs';
import {householdQuantity} from './planner-household.mjs';
import {pantryCatalog,pantryAlternatives} from './pantry.mjs';
import {mealComponents, componentAlternatives, replaceMealComponent} from "./meal-components.mjs";
import {mountOnboardingChat, QUICK_EXCLUSION_CHIPS, computeSmartOnboardingInsights} from "./onboarding-chat.mjs";
import {generateWorkoutWeek, getExerciseAlternatives, WEEKDAYS_AR, getAvailableWorkoutSplits, WORKOUT_SPLITS} from "./workout-engine.mjs";
import {
  makeWeek,
  planningTemplates,
  REGIONS,
  GOALS,
  regionAllows,
  mealAvailability,
  blockedExclusionSlots,
  MIN_MEAL_CHOICES,
  sumSnapshots,
  assessDay,
  alternatives,
  scaleSnapshot,
  simplifyPlannedSnapshot,
  snapshotFood,
  customFood,
  customSnapshot,
  combineSnapshots,
  groceryList,
} from "./planner-core.mjs";
import {
  openStore,
  activatePlan,
  simplifyActivePlan,
  recordPlanned,
  replacePlanned,
  actualForDate,
  STORAGE_KEY,
} from "./planner-storage.mjs";
import { SLOTS, BUDGETS, PROTEINS } from "./planning-tags.mjs";
import {
  EXCLUSIONS,
  preferenceText,
  excludedTaste,
} from "./planner-exclusions.mjs";
import { filterFoods, csvCell } from "./core.mjs";
import { portionInfo } from "./portions.mjs";
import { displayMealName, displayIngredientName } from "./meal-presentation.mjs";
import { EGYPTIAN_NAME_SOURCES } from "./egyptian-meals.mjs";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const n = (v) =>
  v == null
    ? "غير مكتمل"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(
        Number(v),
      );
// Quantity display must never turn a positive ingredient into zero.
const quantityNumber = (v) => {
  const value = Number(v);
  if (value > 0 && value < 0.001) return "أقل من 0.001";
  return new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(
    value,
  );
};
const copy = (x) => JSON.parse(JSON.stringify(x));
const today = () => {
  let d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  String(Date.now()) + "-" + Math.random().toString(36).slice(2);
const dateLabel = (s) =>
  new Date(s + "T12:00:00").toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const macros = (v) =>
  `<div class="plan-macros"><span><b>${n(v.energy)}</b> kcal</span><span><b>${n(v.protein)}</b> بروتين g</span><span><b>${n(v.carbs)}</b> كربوهيدرات g</span><span><b>${n(v.fat)}</b> دهون g</span></div>`;
const briefMacros = (v) =>
  `<div class="plan-brief-macros"><span><bdi>${n(v.energy)}</bdi> سعرة</span><span><bdi>${n(v.protein)}</bdi> جم بروتين</span></div>`;
const options = (obj, current) =>
  Object.entries(obj)
    .map(
      ([k, v]) =>
        `<option value="${k}" ${k === current ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join("");
export async function mountPlanner({ root, foods, detailLoader, toast }) {
  const $ = (id) => root.querySelector("#" + id);
  let library,
    store,
    state,
    selectedDate,
    selectedWorkoutDayIndex = 0,
    homeTab = "nutrition",
    chatController = null,
    workoutSwapContext = null,
    context,
    basket = [],
    selectedFood,
    selectedDetail,
    sequence = 0,
    importSequence = 0,
    searchTimer,
    lastFocus;
  root.innerHTML =
    '<div class="plan-notice" role="status"><h1>خطتي الأسبوعية</h1><p>جارٍ تحميل مكتبة التخطيط…</p></div>';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch((location.hostname === "example.test" ? "" : ".") + "/data/planning-library.json", {
      signal: controller.signal,
    });
    if (!r.ok) throw Error("تعذر تحميل مكتبة التخطيط");
    library = await r.json();
    store = openStore(window.localStorage);
    state = store.get();
    if(state.plans.some(p=>p.id===state.active_plan_id&&p.portion_policy!=='simple-1'))state=store.update(s=>simplifyActivePlan(s));
  } catch (e) {
    if (controller.signal.aborted)
      e = Error(
        "تحميل مكتبة التخطيط أخذ وقتًا طويلًا. جرّب إعادة المحاولة؛ تصفح الأطعمة متاح.",
      );
    root.innerHTML = `<div class="plan-notice"><h1>خطتي الأسبوعية</h1><p>${esc(e.message)}</p><button id="planner-retry" class="outline-btn">إعادة المحاولة</button><button id="planner-raw" class="outline-btn">حفظ البيانات المحلية الخام</button></div>`;
    $("planner-retry").onclick = () =>
      mountPlanner({ root, foods, detailLoader, toast });
    $("planner-raw").onclick = () => {
      try {
        download(
          "planner-recovery.json",
          window.localStorage.getItem(STORAGE_KEY) || "{}",
          "application/json",
        );
      } catch {
        toast(
          "المتصفح يمنع قراءة التخزين؛ جرّب السماح بالتخزين أو متصفحًا آخر.",
        );
      }
    };
    return;
  } finally {
    clearTimeout(timeout);
  }
  const active = () => state.plans.find((p) => p.id === state.active_plan_id);
  function download(name, text, type = "application/json") {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const safely = (fn) => {
    try {
      fn();
    } catch (e) {
      toast(e.message);
      const target =
        context && $("plan-picker").open
          ? $("picker-error")
          : $("planner-error");
      if (target) {
        target.textContent = e.message;
        target.hidden = false;
      }
    }
  };
  function save(fn) {
    try {
      state = store.update(fn);
    } catch (e) {
      renderPlan();
      throw e;
    }
    renderPlan();
  }
  const quantityLabel = (i) =>
    i.unit === "serving"
      ? i.serving_label || "حصة أدخلتها"
      : i.unit === "reference"
        ? "المقدار المكتوب بالمصدر أو النموذج"
        : i.unit;
  const ingredientLabel = (i) => {
    const h=householdQuantity(i),amount=h?esc(h.label):i.grams==null?`${quantityNumber(i.quantity)} × ${esc(quantityLabel(i))}`:`${quantityNumber(i.grams)} جرام`;
    return `${esc(displayIngredientName(i))} · <strong>${amount}</strong>${h?` <small>(حوالي ${quantityNumber(i.grams)} جم)</small><details class="portion-evidence"><summary>وزن الحصة ومصدرها</summary>${quantityNumber(i.grams)} جرام؛ الوحدة المرجعية ${quantityNumber(h.source_grams)} جرام. الحجم الفعلي قد يختلف.${i.key==='bread'?' الرغيف بحجم عينة المصدر، وليس وزنًا ثابتًا لكل العيش.':''}</details>`:''}`;
  };
  root.innerHTML = `<div class="plan-hero"><span class="eyebrow">كوتش التغذية والتمارين للشرق الأوسط</span><h1>خطتك الذكية<span class="heading-dot">.</span></h1><p>نظام غذائي من أكلنا اليومي وجدول تمارين مفصّل لهدفك وميزانيتك ومكان تمرينك. علّم اللي أكلته أو اتمرنته، وبدّل أي وجبة أو تمرين بضغطة واحدة.</p><div class="plan-privacy">بياناتك وخطتك محفوظة محلياً على جهازك فقط لخصوصيتك الكاملة.</div></div>
 <div class="plan-toolbar"><button class="primary-btn" id="open-coach-chat-btn" type="button">💬 المحادثة الذكية مع الكوتش</button><button class="outline-btn" id="plan-export">حفظ نسخة احتياطية</button><label class="outline-btn plan-file">استرجاع نسخة<input type="file" id="plan-import" accept="application/json,.json"></label><button class="outline-btn" id="plan-clear">مسح بياناتي</button></div>
 <div id="planner-error" class="plan-notice" role="alert" hidden></div>
 <section id="coach-onboarding-section"></section>
 <details id="plan-settings" hidden style="display:none !important"><summary>جهّز الأسبوع (الإعدادات المفصلة)</summary><form id="plan-form"><fieldset><legend>1. جسمك وهدفك</legend><div class="plan-fields"><label>الوزن بالكيلو<input name="weight" type="number" min="35" max="250" step="0.1" required></label><label>الطول بالسنتيمتر<input name="height" type="number" min="120" max="230" step="0.1" required></label><label>العمر بالسنوات<input name="age" type="number" min="18" max="90" step="1" required></label><label>النوع في معادلة الاحتياج<select name="sex"><option value="male">ذكر</option><option value="female">أنثى</option></select></label><label><span id="activity-label">نشاطك المعتاد شامل التمرين</span><select name="activity">${options({ sedentary: "جلوس أغلب اليوم", light: "نشاط خفيف", moderate: "نشاط متوسط", active: "نشاط مرتفع" }, "light")}</select></label><label>هدفك<select name="goal">${options(GOALS, "maintain")}</select></label><label>عدد أيام التمارين أسبوعيًا<input name="trainingDays" type="number" min="0" max="7" step="1" value="0" required></label><label>بداية الأسبوع<input name="startDate" type="date" required value="${today()}"></label></div><details class="plan-sports"><summary>الرياضات اللي بتمارسها</summary><label>طريقة حساب النشاط<select name="exerciseMode"><option value="included">مستوى نشاطي يشمل التمرين</option><option value="separate">أحسب نشاطي اليومي والرياضة بشكل منفصل</option></select></label><p id="sports-method" class="plan-hint"></p><div class="sports-list">${Object.entries(SPORTS).map(([id,sport])=>`<div class="sport-row"><label class="plan-check"><input type="checkbox" data-sport="${id}">${esc(sport.label)}</label><div class="plan-fields"><label>دقائق المرة<input data-sport-minutes="${id}" type="number" min="5" max="180" step="1" value="30" disabled></label><label>مرات أسبوعيًا<input data-sport-sessions="${id}" type="number" min="1" max="7" step="1" value="1" disabled></label></div></div>`).join('')}</div><p class="plan-hint">اختار وصف المجهود الأقرب لتمرينك. المدة الفعلية لكل رياضة، من غير تكرار نفس الوقت في رياضتين. التقدير موزع على أيام الأسبوع، وليس قياسًا مباشرًا للحرق.</p><a href="https://pacompendium.com/" target="_blank" rel="noopener">مرجع الأنشطة البدنية 2024 ↗</a></details><label class="plan-check"><input name="healthNeeds" type="checkbox"> عندي حمل أو رضاعة أو حساسية غذائية أو حالة تحتاج نظامًا علاجيًا</label><p class="plan-hint">اختار عدد الأيام من 0 إلى 7. افتح الرياضات لتحديد النوع والمدة وطريقة احتسابها.</p></fieldset>
 <fieldset><legend>2. نظامك وأكل منطقتك</legend><label>تحب تمشي على أي نظام؟<select name="diet">${options(DIETS,'balanced')}</select></label><div id="diet-description" class="diet-guide"></div><details class="plan-sports"><summary>مواعيد الأكل والصيام المتقطع — اختياري</summary><p class="plan-hint">الصيام المتقطع تنظيم لمواعيد الأكل، مش نوع أكل ولا تخفيض إضافي للسعرات. قد يناسبك لو الالتزام بوقت محدد أسهل؛ مش شرط لنزول الوزن. هنا لا نمنع الماء.</p><label>نظام المواعيد<select name="fasting">${options(FASTING,'none')}</select></label><div id="fasting-settings" hidden><label>بداية وقت الأكل<input name="eatingStart" type="time" value="08:00"></label><p class="plan-hint">هنوزع الوجبات داخل النافذة، وآخر موعد قبل نهايتها بنصف ساعة. لا يدخل الصيام في حساب الحرق.</p><label class="plan-check"><input name="fastingRisk" type="checkbox"> عندي سكري أو أدوية خفض السكر أو اضطراب أكل</label><label class="plan-check"><input name="fastingAcknowledged" type="checkbox"> لا تنطبق عليّ هذه الحالات وقرأت شروط الصيام</label></div></details><div id="keto-screen" hidden><p class="plan-notice">الكيتو هنا بحد أقصى 50 جرام كربوهيدرات كلية يوميًا. مع السكري أو أدوية خفض السكر، أو أمراض الكلى أو الكبد أو البنكرياس: استخدم خطة مختص.</p><label class="plan-check"><input name="ketoRisk" type="checkbox"> عندي إحدى الحالات أو الأدوية المذكورة</label><label class="plan-check"><input name="ketoAcknowledged" type="checkbox"> قرأت الشروط، ولا تنطبق عليّ الحالات المذكورة</label></div><div class="plan-fields"><label>منطقتك<select name="region">${options(REGIONS, "egypt")}</select></label><label>الميزانية<select name="budget">${options(BUDGETS, "medium")}</select></label><label>عدد مرات الأكل يوميًا<select name="meals"><option value="2">وجبتين كبار</option><option value="3">3 وجبات</option><option value="4" selected>3 وجبات + سناك</option><option value="5">3 وجبات + 2 سناك</option></select></label></div><p id="plan-region-summary" class="plan-hint" role="status" aria-live="polite"></p><h3>مصادر البروتين اللي تحبها</h3><div class="plan-check-grid">${Object.entries(
   PROTEINS,
 )
   .map(
     ([k, v]) =>
       `<label class="plan-check"><input type="checkbox" name="protein" value="${k}" checked> ${v}</label>`,
   )
   .join("")}</div></fieldset>
 <fieldset><legend>3. مكونات مش على ذوقك</legend><p class="plan-hint">علّم على اللي مش بتحبه. استبعاد المجموعة يشمل الأنواع الموجودة تحتها، مثل الأرز الأبيض والبني أو كل الألبان.</p><label>ابحث عن مكوّن<input id="plan-exclusion-search" type="search" placeholder="مثلاً بصل، بيض، جبنة، سمك…"></label><p id="plan-exclusion-summary" class="plan-hint" role="status" aria-live="polite"></p><div class="plan-availability-panel"><p class="plan-hint">الاستبعاد متاح طالما بقيت ${MIN_MEAL_CHOICES} اقتراحات مختلفة على الأقل لكل موعد وجبة.</p><div id="plan-availability" class="plan-availability" role="status" aria-live="polite"></div><p id="plan-availability-warning" class="plan-hint" role="status"></p><p id="plan-exclusion-limit" class="plan-notice" role="alert" hidden></p></div><details id="plan-extra-exclusions" hidden><summary>استبعادات طعام محفوظة</summary><div id="plan-extra-exclusion-items" class="plan-check-grid"></div></details><div class="plan-exclusion-groups">${[
   ...new Set(EXCLUSIONS.map((g) => g.section)),
 ]
   .map(
     (section) =>
       `<section data-exclusion-section><h3>${esc(section)}</h3><div class="plan-check-grid">${EXCLUSIONS.filter(
         (g) => g.section === section,
       )
         .map(
           (g) =>
             `<label class="plan-check" data-exclusion-name="${esc(g.aliases.join(" "))}"><input type="checkbox" name="excludedGroup" value="${esc(g.id)}"><span>${esc(g.label)}${!g.keys.length ? "<small>متاح عند إضافة أكلة بنفسك</small>" : ""}</span></label>`,
         )
         .join("")}</div></section>`,
   )
   .join(
     "",
   )}</div><p id="plan-exclusion-empty" class="plan-hint" hidden>مفيش مكوّن مطابق. جرّب اسمه الشائع أو الإنجليزي.</p><details class="plan-exclusion-details"><summary>استبعاد نوع محدد من مكونات الخطة</summary><div class="plan-check-grid plan-exclusions">${Object.values(
   library.ingredients,
 )
   .map(
     (i) =>
       `<label class="plan-check"><input type="checkbox" name="excluded" value="${esc(i.key)}"> ${esc(displayIngredientName(i))}</label>`,
   )
   .join(
     "",
   )}</div></details><p class="plan-hint">${EXCLUSIONS.length} اختيارًا للذوق. مكتبة التخطيط فيها ${Object.keys(library.ingredients).length} مكوّنًا موثقًا، وقائمة مصر فيها ${planningTemplates(library, {region:"egypt"}).length} وجبة وسناك مختارة، ضمن ${new Set(planningTemplates(library, {region:"egypt"}).filter(t=>!t.meal_slots.includes("snack")).map(t=>t.dish_family)).size} عائلة أطباق رئيسية؛ وتتغير الخيارات حسب المنطقة. بقية الاختيارات تُنبّهك عند البحث اليدوي إذا ظهر المكوّن في الاسم؛ لا تكشف مكونات طبق غير موثقة ولا تصلح لمنع الحساسية.</p></fieldset><button class="primary-btn plan-primary" type="submit" id="plan-generate">اعمل خطة 7 أيام</button><p class="plan-hint">الأسماء والوجبات الجديدة تظهر لما تعمل خطة جديدة؛ الخطط المحفوظة وسجل أكلك يفضلوا زي ما هم. الأوزان للكميات المقترحة من المكونات بالحالة المكتوبة. ليست وصفات مصرية مقاسة أو اعتمادًا غذائيًا جديدًا.</p></form></details>
 <div id="plan-dashboard"></div>
 <details class="plan-method" hidden style="display:none !important"><summary>إزاي حسبنا الاحتياج واخترنا الوجبات؟</summary>
 <div class="plan-method-intro">الخطة تقدير كبداية، ونوضح لك الحساب والاختيارات خطوة بخطوة.</div>
 <div class="plan-method-grid">
 <section class="plan-method-card"><h3><span aria-hidden="true">1</span> احتياجك من الطاقة</h3><p>نحسب معدل الراحة بمعادلة <bdi dir="ltr">Mifflin–St Jeor</bdi>:</p>
 <div class="plan-equation" aria-label="عشرة في الوزن، زائد ستة وربع في الطول، ناقص خمسة في العمر"><div><span>الوزن بالكيلو</span><bdi dir="ltr">× 10</bdi></div><div><span>نضيف ناتج الطول بالسنتيمتر</span><bdi dir="ltr">× 6.25</bdi></div><div><span>نطرح ناتج العمر بالسنوات</span><bdi dir="ltr">× 5</bdi></div></div>
 <p class="plan-hint">الوزن بالكيلو، الطول بالسنتيمتر، والعمر بالسنوات. ثم نضيف <bdi dir="ltr">5</bdi> للذكر، أو نطرح <bdi dir="ltr">161</bdi> للأنثى.</p>
 <p>نضرب النتيجة في معامل نشاط تقريبي:</p><dl class="plan-method-rows"><div><dt>جلوس أغلب اليوم</dt><dd><bdi dir="ltr">1.2</bdi></dd></div><div><dt>نشاط خفيف</dt><dd><bdi dir="ltr">1.375</bdi></dd></div><div><dt>نشاط متوسط</dt><dd><bdi dir="ltr">1.55</bdi></dd></div><div><dt>نشاط مرتفع</dt><dd><bdi dir="ltr">1.725</bdi></dd></div></dl>
 <p class="plan-method-note">في الوضع الشامل، مستوى النشاط يشمل التمرين. في الوضع المنفصل نضيف متوسط الزيادة من الرياضات بعد خصم طاقة النشاط الأساسي لنفس الوقت.</p></section>
 <section class="plan-method-card"><h3><span aria-hidden="true">2</span> التعديل حسب هدفك</h3><dl class="plan-method-rows"><div><dt>الحفاظ على الوزن</dt><dd>بدون تعديل</dd></div><div><dt>تقليل الوزن</dt><dd>عجز <bdi dir="ltr">15%</bdi><small>بحد <bdi dir="ltr">500 kcal</bdi></small></dd></div><div><dt>زيادة الوزن أو الكتلة العضلية</dt><dd>فائض <bdi dir="ltr">8%</bdi><small>بحد <bdi dir="ltr">250 kcal</bdi></small></dd></div></dl>
 <p class="plan-method-note">الاحتياج الفعلي قد يختلف. بناء العضلات يحتاج تمرينًا مناسبًا ومتابعة الوزن والأداء؛ زيادة السعرات وحدها لا تضمن زيادة عضلية صافية.</p></section>
 <section class="plan-method-card"><h3><span aria-hidden="true">3</span> البروتين والدهون والكربوهيدرات</h3><p>هدف البروتين لكل كيلو من وزنك:</p><dl class="plan-method-rows"><div><dt>الحفاظ على الوزن مع تمرين</dt><dd><bdi dir="ltr">1.4 g/kg</bdi></dd></div><div><dt>بقية الأهداف مع تمرين، ومنها بناء العضلات</dt><dd><bdi dir="ltr">1.6 g/kg</bdi></dd></div><div><dt>بدون تمرين</dt><dd><bdi dir="ltr">1 g/kg</bdi></dd></div></dl>
 <ul><li>الدهون: <bdi dir="ltr">30%</bdi> من هدف الطاقة.</li><li>الباقي تقسيم استرشادي للكربوهيدرات.</li><li>عدد الأيام لا يحدد نوع تمرينك أو مدته.</li></ul><p class="plan-method-note">سعرات الطعام من المرجع نفسه. لا نغيّرها لإجبارها على مطابقة معادلة <bdi dir="ltr">4 / 4 / 9</bdi>.</p></section>
 <section class="plan-method-card"><h3><span aria-hidden="true">4</span> اختيار الوجبات ومراجعتها</h3><ul><li>نلتزم بمنطقتك والميزانية ومصادر البروتين والاستبعادات.</li><li>الأولوية للبقول والخضار والفاكهة والبروتين الأقل دهونًا، مع نشويات مألوفة لمنطقتك.</li><li>في مصر نبدأ بالفول والبيض والعيش البلدي، والفراخ والبلطي مع الرز أو البطاطس؛ ونقلّل تكرار نفس المكونات.</li><li>نراجع فرق السعرات والبروتين عن هدفك. عند قلة الخيارات نستخدم باقي الوجبات المناسبة لاختياراتك، مع إتاحة التبديل.</li></ul><div class="plan-method-targets"><div><bdi dir="ltr">400 g</bdi><span>خضار وفاكهة يوميًا</span></div><div><bdi dir="ltr">25 g</bdi><span>ألياف يوميًا</span></div></div><p class="plan-method-note">أهداف استرشادية ننبّهك عند نقصها. حد الاستبعاد يحافظ على تنوع الخيارات، ولا يضمن وحده اكتمال التغذية.</p><details><summary>مصادر أسماء الأكل في مصر</summary><p class="plan-hint">راجعنا قوائم ووصفات محلية لاختيار أسماء وأكلات مألوفة. السعرات تُحسب من مصادر المكونات الموضحة لكل وجبة.</p>${EGYPTIAN_NAME_SOURCES.map(s=>`<p><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></p>`).join('')}</details></section>
 </div><div class="plan-method-limits"><p>البيانات المفقودة تظل غير مكتملة. سجّل أي زيت أو ملح تضيفه، وراجع ملاحظات يومك. الخطة لا تثبت اكتمال كل الفيتامينات والمعادن.</p></div>
 <nav class="plan-method-sources" aria-label="مراجع طريقة حساب الخطة"><a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener">معادلة الاحتياج <span aria-hidden="true">↗</span></a><a href="https://pubmed.ncbi.nlm.nih.gov/28642676/" target="_blank" rel="noopener">البروتين والتمارين <span aria-hidden="true">↗</span></a><a href="https://www.who.int/news-room/fact-sheets/detail/healthy-diet" target="_blank" rel="noopener">إرشادات WHO <span aria-hidden="true">↗</span></a></nav></details>
 <dialog id="plan-picker" aria-labelledby="picker-title"><div class="picker-head"><h2 id="picker-title">اختار بديل على ذوقك</h2><button type="button" id="picker-close" aria-label="إغلاق">×</button></div><div id="picker-parts"></div><div class="picker-tabs"><button data-picker-tab="suggestions">اقتراحات قريبة</button><button data-picker-tab="pantry">من مكونات البيت</button><button data-picker-tab="search">ابحث بنفسك</button><button data-picker-tab="custom">أدخل أكلة</button></div><div id="picker-error" class="plan-notice" role="alert" hidden></div><div id="picker-suggestions"></div><div id="picker-pantry" hidden><h3>إيه الموجود عندك؟</h3><p class="plan-hint">اختار المكونات، بما فيها الزيت والإضافات. هنقترح وجبات مكتملة بالموجود ضمن ميزانيتك واستبعاداتك. ده اختيار توافر، مش جرد للكميات؛ راجع إن الكمية تكفي وطريقة التحضير تناسبك.</p><label>ابحث عن مكوّن<input id="pantry-search" type="search" placeholder="بيض، فراخ، رز…"></label><div id="pantry-options" class="plan-check-grid pantry-options"></div><p id="pantry-status" role="status"></p><button id="pantry-find" class="outline-btn" type="button">اقترح من الموجود</button><div id="pantry-results" aria-live="polite"></div></div><div id="picker-search" hidden><label>ابحث عن طعام<input id="plan-food-search" type="search" placeholder="فول، بيض، شاي…"></label><div id="plan-food-results"></div><div id="plan-food-quantity"></div></div><div id="picker-custom" hidden><p>بياناتك الخاصة لا تصبح مرجعًا معتمدًا ولا تُنشر للمستخدمين.</p><form id="custom-food-form"><div class="plan-fields"><label>اسم الأكلة<input name="name" maxlength="120" required></label><label>أساس البيانات<select name="basis"><option value="per100g">لكل 100 جرام</option><option value="serving">لكل حصة محددة عندي</option></select></label><label>وصف الحصة إن اخترتها<input name="serving_label" placeholder="مثلاً قطعة من وصفتي"></label><label>السعرات kcal<input name="energy" type="number" min="0" step="any" required></label><label>بروتين g<input name="protein" type="number" min="0" step="any" required></label><label>كربوهيدرات g<input name="carbs" type="number" min="0" step="any" required></label><label>دهون g<input name="fat" type="number" min="0" step="any" required></label><label>تعريف الكربوهيدرات<select name="carb_id"><option value="user:unknown">غير معروف (لا يُجمع مع تعريف مختلف)</option><option value="fdc:1005">بالفرق وتشمل الألياف</option><option value="cofid:CHO">متاحة بمكافئات السكريات الأحادية</option></select></label><label>الكمية: جرام أو عدد حصص<input name="quantity" type="number" min="0.001" max="100000" step="any" value="100" required></label></div><button class="outline-btn" type="submit">احفظ الطعام وأضفه للوجبة</button></form></div><div class="plan-basket"><h3>مكونات الوجبة المختارة</h3><div id="plan-basket-items"></div><label>اسم الوجبة<input id="plan-basket-name" maxlength="120" placeholder="مثلاً فطار اليوم"></label><button class="primary-btn plan-primary" id="plan-basket-save">احفظ الوجبة المختارة</button><p class="plan-hint">هذه الوجبة من اختيارك؛ قد تختلف عن ميزانية الخطة أو استبعاداتها. راجع المكونات قبل الحفظ.</p></div></dialog>`;
  function fillForm() {
    const f = $("plan-form");
    if (active()) f.elements.startDate.value = active().start_date;
    for (const [k, v] of Object.entries(
      active()?.profile || state.profile || {},
    ))
      if (f.elements.namedItem(k) && k !== "healthNeeds")
        f.elements.namedItem(k).value = v;
    f.elements.healthNeeds.checked = Boolean(
      (active()?.profile || state.profile)?.healthNeeds,
    );
    const savedProfile = active()?.profile || state.profile;
    if (savedProfile)
      f.elements.trainingDays.value =
        savedProfile.trainingDays ?? savedProfile.resistance ?? 0;
    for(const [id] of Object.entries(SPORTS)){
      const r=savedProfile?.sports?.find(r=>r.id===id);
      root.querySelector(`[data-sport="${id}"]`).checked=!!r;
      root.querySelector(`[data-sport-minutes="${id}"]`).value=r?.minutes??30;
      root.querySelector(`[data-sport-sessions="${id}"]`).value=r?.sessions??1;
    }
    f.elements.fastingRisk.checked=!!savedProfile?.fastingRisk;
    f.elements.fastingAcknowledged.checked=!!savedProfile?.fastingAcknowledged;
    f.elements.ketoRisk.checked=!!savedProfile?.ketoRisk;
    f.elements.ketoAcknowledged.checked=!!savedProfile?.ketoAcknowledged;
    updateSports();
    const p = active()?.preferences || state.preferences;
    if (p) {
      f.elements.fasting.value=p.fasting??"none";f.elements.eatingStart.value=p.eatingStart??"08:00";
      f.elements.diet.value = p.diet ?? "balanced";
      f.elements.region.value = p.region ?? "egypt";
      f.elements.budget.value = p.budget;
      f.elements.meals.value = p.meals;
      root
        .querySelectorAll('[name="protein"]')
        .forEach((e) => (e.checked = p.proteins.includes(e.value)));
      root
        .querySelectorAll('[name="excluded"]')
        .forEach((e) => (e.checked = p.excludedKeys.includes(e.value)));
      root
        .querySelectorAll('[name="excludedGroup"]')
        .forEach(
          (e) => (e.checked = (p.excludedGroups || []).includes(e.value)),
        );
    }
    const extra = p?.excludedFoodIds || [];
    const names = new Map(foods.map((food) => [food.id, food.name]));
    $("plan-extra-exclusion-items").innerHTML = extra.map((id) => `<label class="plan-check"><input type="checkbox" name="excludedFoodId" value="${esc(id)}" checked> ${esc(names.get(id) || "طعام محفوظ خارج الكتالوج الحالي")}</label>`).join('');
    $("plan-extra-exclusions").hidden = !extra.length;
    $("plan-exclusion-limit").hidden = true;
    updateExclusionSummary();
    updateRegionSummary();
    updateAvailability();
  }
  function renderWorkoutsPanel() {
    const wp = state.workoutPlan || (active() ? generateWorkoutWeek(
      state.onboarding?.workoutPrefs || { workoutDaysCount: active().profile.trainingDays || 3 },
      active().profile
    ) : null);
    if (!wp) return "";
    const dayObj = wp.days[selectedWorkoutDayIndex] || wp.days[0];
    const completedSet = new Set(state.onboarding?.completedExercises || []);
    const availableSplits = getAvailableWorkoutSplits(wp.workoutDaysCount);
    const currentSplitPref = wp.workoutSplitPreference || state.onboarding?.workoutPrefs?.workoutSplitPreference || "auto";
    return `
      <section class="home-workouts-panel" id="home-workouts-panel" ${homeTab === "nutrition" && active() ? "hidden" : ""}>
        <div class="workout-overview-banner">
          <div>
            <span class="eyebrow">جدول التمارين الأسبوعي الذكي · ${esc(wp.splitName)}</span>
            <h2>${esc(wp.workoutLocationLabel)} · ${wp.workoutDaysCount} أيام تمرين أسبوعياً (${esc(wp.fitnessLevelLabel)})</h2>
            <p class="plan-hint">مدة الحصة: ${wp.sessionDuration} دقيقة · اضغط على أي يوم لعرض تمارينه أو تبديل مكانه بين البيت 🏠 والجيم 🏋️.</p>
            ${wp.workoutLocation !== "home_only" && wp.workoutDaysCount >= 3 ? `
              <div class="workout-split-switcher">
                <span>نظام تقسيمة العضلات:</span>
                <div class="workout-split-chips">
                  ${availableSplits.map(sp => `
                    <button type="button" class="outline-btn chat-chip ${currentSplitPref === sp.id ? "is-selected" : ""}" data-switch-workout-split="${sp.id}">
                      ${esc(sp.shortLabel)}
                    </button>
                  `).join("")}
                </div>
              </div>
            ` : ""}
            ${wp.injuryAdjustments?.length ? `<div class="workout-injury-banner">🛡️ <strong>حماية المفاصل والإصابات المفعّلة:</strong><ul>${wp.injuryAdjustments.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
          </div>
        </div>
        <nav class="plan-days workout-days-nav" aria-label="أيام التمرين">
          ${wp.days.map(d => `
            <button type="button" data-workout-day="${d.dayIndex}" aria-pressed="${d.dayIndex === dayObj.dayIndex}">
              <span>${esc(d.dayName)}</span>
              <bdi>${d.isTrainingDay ? (d.location === "home" ? "🏠 بيت" : "🏋️ جيم") : "🌿 راحة"}</bdi>
            </button>
          `).join("")}
        </nav>
        <div class="workout-day-card">
          <div class="workout-day-header">
            <div>
              <h3>${esc(dayObj.dayName)} · ${esc(dayObj.title)}</h3>
              <p class="plan-hint">${esc(dayObj.focus)}</p>
            </div>
            ${dayObj.isTrainingDay ? `
              <div class="workout-loc-switcher">
                <span>مكان تمرين اليوم:</span>
                <button type="button" class="outline-btn ${dayObj.location === "gym" ? "is-selected" : ""}" data-toggle-workout-loc="${dayObj.dayIndex}" data-loc="gym">🏋️ جيم</button>
                <button type="button" class="outline-btn ${dayObj.location === "home" ? "is-selected" : ""}" data-toggle-workout-loc="${dayObj.dayIndex}" data-loc="home">🏠 بيت</button>
              </div>
            ` : ""}
          </div>
          ${!dayObj.isTrainingDay ? `
            <div class="workout-rest-box">
              <h4>🌿 يوم استشفاء وراحة عضلية</h4>
              <p>العضلات بتكبر وتستشفي وقت الراحة والنوم! امشِ 15–20 دقيقة خفيفة، اشرب مية كفاية، والتزم بوجبات البروتين النهاردة.</p>
            </div>
          ` : `
            <div class="workout-warmup-note">🔥 <strong>الإحماء:</strong> ${esc(dayObj.warmup)}</div>
            <div class="workout-exercises-grid">
              ${dayObj.exercises.map((ex, idx) => {
                const doneKey = `${dayObj.dayIndex}-${ex.id}`;
                const isDone = completedSet.has(doneKey);
                return `
                  <article class="workout-exercise-card ${isDone ? "is-eaten" : ""}">
                    <div class="plan-meal-top">
                      <span class="exercise-order-badge">تمرين ${idx + 1} · ${esc(ex.name_en)}</span>
                      <label class="plan-eaten"><input type="checkbox" data-workout-done="${esc(doneKey)}" ${isDone ? "checked" : ""}> اتمرنته 💪</label>
                    </div>
                    <h4>${esc(ex.name_ar)}</h4>
                    ${ex.injury_safe_badge ? `<span class="workout-safe-badge">🛡️ ${esc(ex.injury_safe_badge)}</span>` : ""}
                    <div class="workout-rx-pills">
                      <span><b>${ex.sets}</b> مجموعات</span>
                      <span><b>${esc(ex.reps)}</b></span>
                      <span>راحة: <b>${esc(ex.rest)}</b></span>
                    </div>
                    <p class="plan-hint">الأداء: ${esc(ex.tempo)}</p>
                    <ul class="workout-instructions">
                      ${ex.instructions.map(step => `<li>${esc(step)}</li>`).join("")}
                    </ul>
                    <div class="plan-meal-actions">
                      <button type="button" class="outline-btn" data-workout-swap="${dayObj.dayIndex}" data-slot-idx="${idx}" data-ex-id="${esc(ex.id)}">🔄 بدّل التمرين</button>
                    </div>
                  </article>
                `;
              }).join("")}
            </div>
            <div class="workout-warmup-note">🧘 <strong>التهدئة والإطالة:</strong> ${esc(dayObj.cooldown)}</div>
          `}
        </div>
      </section>
    `;
  }

  function renderPlan() {
    const plan = active();
    if (!plan && !state.workoutPlan) {
      $("plan-dashboard").innerHTML =
        '<div class="plan-empty"><h2>أول أسبوع يبدأ باختياراتك</h2><p>جاوب على أسئلة الكوتش الذكي فوق في ثواني، وهنجهزلك خطة 7 أيام للتغذية والتمارين قابلة للتعديل.</p></div>';
      return;
    }
    if (!plan && state.workoutPlan) {
      homeTab = "workouts";
      $("plan-dashboard").innerHTML = renderWorkoutsPanel();
      return;
    }
    if (!plan.days.some((d) => d.date === selectedDate))
      selectedDate = plan.days[0].date;
    const day = plan.days.find((d) => d.date === selectedDate),
      planned = sumSnapshots(day.meals.map((m) => m.snapshot)),
      actual = actualForDate(state, day.date),
      checks = assessDay(planned, plan.targets),
      logs = state.diary.filter((e) => e.date === day.date);
    const hasWorkouts = Boolean(state.workoutPlan || (plan.profile.trainingDays ?? 0) > 0);
    const homeTabsHtml = hasWorkouts ? `
      <nav class="home-unified-tabs" aria-label="أقسام خطتك اليومية">
        <button type="button" class="home-tab-btn ${homeTab === "nutrition" ? "is-active" : ""}" data-home-tab="nutrition">🥗 التغذية ووجبات اليوم</button>
        <button type="button" class="home-tab-btn ${homeTab === "workouts" ? "is-active" : ""}" data-home-tab="workouts">💪 جدول التمارين (${n(state.workoutPlan?.workoutDaysCount ?? plan.profile.trainingDays ?? 3)} أيام)</button>
      </nav>
    ` : "";
    const dashInsights = computeSmartOnboardingInsights({
      weight: plan.profile.weight,
      height: plan.profile.height,
      age: plan.profile.age,
      sex: plan.profile.sex,
      maternalStatus: plan.profile.maternalStatus,
      dailyActivity: plan.profile.activity,
      goal: plan.profile.goal,
      targetWeight: plan.profile.targetWeight,
      goalPace: plan.profile.goalPace,
      workoutDaysCount: plan.profile.trainingDays ?? plan.profile.resistance ?? 0,
      diseases: plan.profile.diseases || [],
      dietType: plan.preferences.diet ?? "balanced",
    });
    const targetWeightLine = plan.profile.targetWeight && (plan.profile.goal === "lose" || plan.profile.goal === "gain")
      ? ` · 🎯 الوزن المستهدف: ${n(plan.profile.targetWeight)} كجم (${esc(dashInsights.chosenPace.durationText)})`
      : plan.profile.targetWeight
        ? ` · 🎯 الوزن المستهدف: ${n(plan.profile.targetWeight)} كجم`
        : "";
    $("plan-dashboard").innerHTML =
      `${homeTabsHtml}<div id="home-nutrition-panel" ${homeTab === "workouts" ? "hidden" : ""}><section class="plan-overview"><div><span class="eyebrow">تقدير يومي قابل للتعديل مع تغير احتياجك</span><h2>${n(plan.targets.energy)} <small>kcal / يوم</small></h2><p>هدف البروتين: <strong>${n(plan.targets.protein)} جم يوميًا</strong> · 💧 المية اليومية: <strong>${n(dashInsights.waterLiters)} لتر (~${dashInsights.waterCups} أكواب)</strong>${targetWeightLine}</p><p class="plan-hint">${esc(DIETS[plan.preferences.diet??"balanced"])} · ${esc(GOALS[plan.profile.goal])} · ${esc(plan.preferences.region ? REGIONS[plan.preferences.region] : "منطقة لم تُحدد في الخطة القديمة")} · ${n(plan.profile.trainingDays ?? plan.profile.resistance ?? 0)} أيام تمرين أسبوعيًا.</p><details class="plan-target-details"><summary>تفاصيل حساب هدفك</summary><p>بروتين ${n(plan.targets.protein)} g · دهون ${n(plan.targets.fat)} g · كربوهيدرات استرشادية ${n(plan.targets.carbs)} g</p><p class="plan-hint">معدل الراحة ${n(plan.targets.ree)} × نشاط ${plan.targets.activity_factor}${plan.targets.exercise?.mode === "separate" ? ` + نحو ${n(plan.targets.exercise.daily_extra)} سعر من الرياضة يوميًا` : ""} → تقدير ${n(plan.targets.tdee)} kcal، ثم تعديل الهدف ${n(plan.targets.energy_change)} kcal.</p></details>${plan.portion_rounding_skipped_days ? '<p class="plan-hint">بعض أيام الخطة احتفظت بكمياتها لأن التقريب يتعارض مع حدود النظام المختار.</p>' : ''}${plan.targets.notes.length ? `<p class="plan-hint">${esc(plan.targets.notes.join(" "))}</p>` : ""}</div><div class="plan-overview-actions"><label>الأسابيع المحفوظة<select id="plan-archive">${state.plans
        .slice()
        .reverse()
        .map(
          (p) =>
            `<option value="${esc(p.id)}" ${p.id === plan.id ? "selected" : ""}>${esc(dateLabel(p.start_date))} · ${BUDGETS[p.preferences.budget]}</option>`,
        )
        .join(
          "",
        )}</select></label><button id="plan-shopping-toggle" class="outline-btn">قائمة المشتريات</button><button id="plan-csv" class="outline-btn">تنزيل الأسبوع CSV</button><button id="plan-print" class="outline-btn">طباعة الخطة</button></div></section><nav class="plan-days" aria-label="أيام الأسبوع">${plan.days.map((d) => `<button type="button" data-plan-date="${d.date}" aria-pressed="${d.date === day.date}" aria-label="${esc(dateLabel(d.date))}"><span>${esc(new Date(d.date + "T12:00:00").toLocaleDateString("ar-EG", {weekday:"short"}))}</span><bdi>${Number(d.date.slice(8))}</bdi></button>`).join("")}</nav><section class="plan-today"><h2>${esc(dateLabel(day.date))}${day.is_workout_day ? ' <span class="workout-day-pill">🏋️ يوم تمرين</span>' : ''}</h2><div class="plan-comparison"><div><h3>المخطط</h3>${briefMacros(planned.values)}</div><div><h3>أكلته فعلًا · ${logs.length} تسجيل</h3>${briefMacros(actual.values)}<p class="plan-hint">${actual.values.energy == null ? "السعرات الفعلية غير مكتملة" : n((Number(actual.values.energy) / plan.targets.energy) * 100) + "% من تقدير اليوم"} · ${actual.values.protein == null ? "البروتين الفعلي غير مكتمل" : n((Number(actual.values.protein) / plan.targets.protein) * 100) + "% من هدف البروتين"}</p></div></div><p class="plan-hint">علامة الصح تسجل نفس الكمية المعروضة. عدّل كميتك قبل التسجيل، أو عدّل السجل الفعلي بعده. الإجمالي الفعلي يضم الأكل الإضافي وأي خطة سابقة في نفس التاريخ.</p><div class="plan-alerts">${checks.map((t) => `<p>◦ ${esc(t)}</p>`).join("")}</div><details class="plan-daily-details"><summary>تفاصيل تغذية اليوم</summary>${macros(planned.values)}<p class="plan-hint">خضار وفاكهة مخططة ${n(planned.fruit_veg_g)} g · ألياف ${n(planned.values.fiber)} g · صوديوم ${n(planned.values.sodium)} mg (قبل الملح الإضافي) · دهون مشبعة ${n(planned.values.saturated)} g</p></details><p class="plan-hint">الكميات المقترحة موجودة في تفاصيل كل وجبة.</p><div class="plan-meals">${day.meals
        .map((m) => {
          const done = logs.some((e) => e.plan_meal_id === m.id);
          return `<article class="plan-meal ${done ? "is-eaten" : ""}"><div class="plan-meal-top"><span>${SLOTS[m.slot]}${m.time?` · <bdi>${esc(m.time)}</bdi>`:""}${m.workout_tag ? ` · <strong class="meal-workout-tag">${esc(m.workout_tag)}</strong>` : ""}</span><label class="plan-eaten"><input type="checkbox" data-eaten="${esc(m.id)}" ${done ? "checked" : ""}> أكلتها</label></div><h3>${esc(displayMealName(m.snapshot))}</h3>${m.snapshot.is_approximate ? '<span class="estimate-badge">تقديري أو بيانات شخصية</span>' : ""}${briefMacros(m.snapshot.values)}<div class="plan-meal-actions"><button class="outline-btn" data-meal-details="${esc(m.id)}">التفاصيل</button><button class="outline-btn" data-swap="${esc(m.id)}" ${done ? "disabled" : ""}>بدّل</button></div><dialog class="plan-meal-sheet" data-details-id="${esc(m.id)}" aria-labelledby="meal-title-${esc(m.id)}"><div class="plan-sheet-head"><h2 id="meal-title-${esc(m.id)}">تفاصيل ${SLOTS[m.slot]}</h2><button type="button" data-details-close aria-label="إغلاق تفاصيل الوجبة">×</button></div><h3>${esc(displayMealName(m.snapshot))}</h3>${macros(m.snapshot.values)}<h4>المكونات</h4><ul class="plan-simple-ingredients">${mealComponents(m.snapshot).map((part,index) => `<li><span>${esc(displayMealName(part))}</span><button class="outline-btn" data-component-swap="${esc(m.id)}" data-component-index="${index}" ${done ? "disabled" : ""}>بدّل</button></li>`).join('')}</ul><details class="plan-amounts"><summary>الكميات المقترحة</summary><ul class="plan-ingredients">${m.snapshot.ingredients.map(i => `<li>${ingredientLabel(i)}</li>`).join('')}</ul><p class="plan-hint">السعرات للمقادير دي. لو أكلت كمية مختلفة، عدّل حجم الوجبة قبل التسجيل.</p></details><details class="plan-size"><summary>عدّل حجم الوجبة</summary><div class="plan-meal-actions"><label>الكمية بالنسبة للمقترح<select data-scale="${esc(m.id)}" ${done ? "disabled" : ""}><option value="0.5">نصف الكمية</option><option value="1" selected>نفس الكمية</option><option value="1.5">مرة ونصف</option><option value="2">ضعف الكمية</option><option value="3">3 أضعاف</option></select></label><button class="outline-btn" data-scale-save="${esc(m.id)}" ${done ? "disabled" : ""}>احفظ الكمية</button></div>${done ? '<p class="plan-hint">الوجبة متسجلة؛ عدّل الأكل الفعلي من سجل اليوم أو ألغِ علامة أكلتها أولًا.</p>' : ''}</details><details><summary>المصدر وطريقة الحساب</summary><p>${esc(m.snapshot.notes || "مجموع المكونات المرجعية بالحالة والكمية المكتوبة؛ تركيب وجبة وليس وصفة تقليدية مقاسة.")}</p>${m.snapshot.ingredients.map(i => `<p>${esc(i.name)}: ${esc(i.source_name || i.source || "مدخل شخصي")} ${esc(i.source_external_id || "")} ${i.reference?.locator && /^https:\/\//.test(i.reference.locator) ? `<a href="${esc(i.reference.locator)}" target="_blank" rel="noopener">المرجع ↗</a>` : ""}</p>`).join('')}</details></dialog></article>`;
        })
        .join(
          "",
        )}</div><section class="plan-actual"><h3>سجل اللي اتاكل</h3>${logs.map((e) => `<div class="plan-log"><span>${SLOTS[e.slot]} · ${esc(displayMealName(e.snapshot))} · ${n(e.snapshot.values.energy)} kcal</span><button class="outline-btn" data-log-edit="${esc(e.id)}">تعديل الفعلي</button><button class="outline-btn" data-log-remove="${esc(e.id)}">حذف التسجيل</button></div>`).join("") || "<p>لسه مفيش أكل متسجل في اليوم ده.</p>"}<label>موعد الأكل الإضافي<select id="plan-extra-slot">${options(SLOTS, "snack")}</select></label><button class="outline-btn" id="plan-add-extra">＋ سجّل أكلة خارج الخطة</button></section></section><section class="plan-shopping" id="plan-shopping" hidden><h2>قائمة المكونات للأسبوع</h2><label>اعرض<select id="plan-shopping-mode"><option value="whole">الأسبوع كله</option><option value="remaining">الوجبات اللي لسه ما اتاكلتش</option></select></label><p class="plan-hint">أوزان الجزء الصالح للأكل بالحالة المعروضة: المطبوخ جاهز للأكل. ليست أوزان شراء خامًا؛ فاقد الطبخ والقشر يختلف ولا نفترض تحويله.</p><div id="plan-shopping-items"></div><button class="outline-btn" id="plan-shopping-csv">تنزيل القائمة CSV</button></section></div>${hasWorkouts ? renderWorkoutsPanel() : ""}`;
    $("plan-archive").onchange = (e) =>
      safely(() => {
        selectedDate = null;
        save((s) => (s.active_plan_id = e.target.value));
        fillForm();
      });
    $("plan-shopping-toggle").onclick = () => {
      $("plan-shopping").hidden = !$("plan-shopping").hidden;
      renderShopping();
      if (!$("plan-shopping").hidden)
        $("plan-shopping").scrollIntoView({ behavior: "smooth" });
    };
    $("plan-shopping-mode").onchange = renderShopping;
    $("plan-shopping-csv").onclick = () =>
      exportCsv("shopping.csv", [
        [
          "الاسم",
          "الحالة",
          "جرام جاهز للأكل",
          "عدد مقدار مرجعي",
          "وحدة المقدار",
        ],
        ...groceryList(plan, $("plan-shopping-mode").value, state.diary).map(
          (r) => [
            r.name,
            r.state || "",
            r.grams ?? "",
            r.quantity ?? "",
            r.grams == null ? quantityLabel(r) : "جرام",
          ],
        ),
      ]);
    $("plan-csv").onclick = () =>
      exportCsv("weekly-plan.csv", [
        [
          "التاريخ",
          "الوجبة",
          "الاسم",
          "kcal",
          "بروتين g",
          "دهون g",
          "كربوهيدرات g",
          "المكونات",
        ],
        ...plan.days.flatMap((d) =>
          d.meals.map((m) => [
            d.date,
            SLOTS[m.slot],
            m.snapshot.name,
            m.snapshot.values.energy,
            m.snapshot.values.protein,
            m.snapshot.values.fat,
            m.snapshot.values.carbs,
            m.snapshot.ingredients
              .map(
                (i) =>
                  `${i.name} ${i.grams ?? i.quantity} ${i.grams == null ? i.unit : "g"}`,
              )
              .join(" + "),
          ]),
        ),
      ]);
    $("plan-print").onclick = () => {
      const node = document.createElement("div");
      node.className = "plan-print-only";
      node.innerHTML = plan.days
        .map(
          (d) =>
            `<section class="plan-print-day"><h2>${esc(dateLabel(d.date))}</h2>${macros(sumSnapshots(d.meals.map((m) => m.snapshot)).values)}${d.meals.map((m) => `<h3>${SLOTS[m.slot]} · ${esc(displayMealName(m.snapshot))}</h3><p>${m.snapshot.ingredients.map(ingredientLabel).join(" + ")}</p>`).join("")}</section>`,
        )
        .join("");
      $("plan-dashboard").append(node);
      window.print();
      node.remove();
    };
    $("plan-add-extra").onclick = () =>
      openPicker({
        type: "extra",
        slot: $("plan-extra-slot").value,
        date: day.date,
      });
  }
  function exportCsv(name, rows) {
    download(
      name,
      "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  function renderShopping() {
    const rows = groceryList(
      active(),
      $("plan-shopping-mode").value,
      state.diary,
    );
    const ingredients = active().days.flatMap(d => d.meals.flatMap(m => m.snapshot.ingredients));
    const rowLabel = row => displayIngredientName(ingredients.find(i => i.food_id === row.food_id && i.state === row.state && i.name === row.name) || row);
    $("plan-shopping-items").innerHTML = rows
      .map(
        (r) =>
          `<p>${esc(rowLabel(r))} · ${r.grams == null ? quantityNumber(r.quantity) + " × " + esc(quantityLabel(r)) : quantityNumber(r.grams) + " جرام"} · ${esc({ cooked: "مطبوخ جاهز", raw: "نيء", dried: "مجفف" }[r.state] || r.state || "كما سجلته")}</p>`,
      )
      .join("");
  }
  if ($("plan-settings-toggle")) {
    $("plan-settings-toggle").onclick = () => {
      $("plan-settings").open = !$("plan-settings").open;
      if ($("plan-settings").open)
        $("plan-settings").scrollIntoView({ behavior: "smooth" });
    };
  }
  $("plan-form").onsubmit = (e) => {
    e.preventDefault();
    safely(() => {
      const f = e.target,
        profile = Object.fromEntries(
          [
            "weight",
            "height",
            "age",
            "sex",
            "activity",
            "goal",
            "trainingDays",
          ].map((k) => [k, f.elements[k].value]),
        );
      profile.healthNeeds = f.elements.healthNeeds.checked;
      profile.fastingRisk=f.elements.fastingRisk.checked;
      profile.fastingAcknowledged=f.elements.fastingAcknowledged.checked;
      profile.ketoRisk=f.elements.ketoRisk.checked;
      profile.ketoAcknowledged=f.elements.ketoAcknowledged.checked;
      profile.exerciseMode=f.elements.exerciseMode.value;
      profile.sports=[...root.querySelectorAll('[data-sport]:checked')].map(e=>({id:e.dataset.sport,minutes:root.querySelector(`[data-sport-minutes="${e.dataset.sport}"]`).value,sessions:root.querySelector(`[data-sport-sessions="${e.dataset.sport}"]`).value}));
      const preferences = readPreferences();
      const availability = mealAvailability(preferences, library);
      if (!availability.sufficient)
        throw Error(`اختياراتك لا تترك ${MIN_MEAL_CHOICES} اقتراحات مختلفة لكل موعد وجبة. غيّر الميزانية أو أضف مصدر بروتين أو قلّل الاستبعادات.`);
      const plan = makeWeek(
        profile,
        preferences,
        library,
        f.elements.startDate.value,
        uid(),
      );
      selectedDate = plan.start_date;
      save((s) => activatePlan(s, plan));
      $("planner-error").hidden = true;
      $("plan-settings").open = false;
      $("plan-dashboard").scrollIntoView({ behavior: "smooth" });
      toast("اتحفظ أسبوعك. راجع الكميات وملاحظات الأيام قبل البدء.");
    });
  };
  function readPreferences() {
      const f = $("plan-form");
      return {
        diet: f.elements.diet.value,
        fasting: f.elements.fasting.value,
        eatingStart:f.elements.eatingStart.value,
        region: f.elements.region.value,
        budget: f.elements.budget.value,
        meals: Number(f.elements.meals.value),
        proteins: [...root.querySelectorAll('[name="protein"]:checked')].map(
          (e) => e.value,
        ),
        excludedKeys: [
          ...root.querySelectorAll('[name="excluded"]:checked'),
        ].map((e) => e.value),
        excludedFoodIds: [...root.querySelectorAll('[name="excludedFoodId"]:checked')].map((e) => e.value),
        excludedGroups: [
          ...root.querySelectorAll('[name="excludedGroup"]:checked'),
        ].map((e) => e.value),
      };
  }
  function updateAvailability() {
    const element = $("plan-availability");
    try {
      const a = mealAvailability(readPreferences(), library);
      element.innerHTML = Object.entries(a.choices).map(([slot, count]) =>
        `<span class="${count < a.minimum ? 'is-limited' : ''}">${SLOTS[slot]} <b>${count}</b></span>`).join('');
      $("plan-generate").disabled = !a.sufficient;
      $("plan-availability-warning").textContent = a.sufficient ? '' : `التنوع قليل. نحتاج ${a.minimum} اقتراحات مختلفة لكل موعد وجبة؛ قلّل الاستبعادات أو أضف بروتينًا أو غيّر الميزانية.`;
    } catch (e) {
      element.textContent = e.message;
      $("plan-generate").disabled = true;
      $("plan-availability-warning").textContent = '';
    }
  }
  function updateRegionSummary() {
    const region = $("plan-form").elements.region.value;
    const available = planningTemplates(library, {region,diet:$("plan-form").elements.diet.value}).filter((t) =>
      regionAllows(t, region),
    ).length;
    $("plan-region-summary").textContent =
      `${REGIONS[region]}: ${available} اقتراح وجبة قبل تطبيق ميزانيتك واستبعاداتك.` +
      (region === 'egypt' ? ' نبدأ بالأكل اليومي المألوف، ونعرض أسماء المكونات الفعلية.' : '');
  }
  $("plan-form").elements.region.onchange = updateRegionSummary;
  function updateExclusionSummary() {
    const chosen = [
      ...root.querySelectorAll('[name="excludedGroup"]:checked'),
    ].map((e) => EXCLUSIONS.find((g) => g.id === e.value).label);
    $("plan-exclusion-summary").textContent = chosen.length
      ? "مستبعد: " + chosen.join("، ")
      : "لم تستبعد أي مجموعة؛ اضغط على المكونات التي لا تحبها.";
  }
  $("plan-exclusion-search").oninput = (e) => {
    const q = preferenceText(e.target.value);
    root
      .querySelectorAll("[data-exclusion-name]")
      .forEach(
        (el) =>
          (el.hidden = Boolean(
            q && !preferenceText(el.dataset.exclusionName).includes(q),
          )),
      );
    root
      .querySelectorAll("[data-exclusion-section]")
      .forEach(
        (el) =>
          (el.hidden = ![...el.querySelectorAll("[data-exclusion-name]")].some(
            (e) => !e.hidden,
          )),
      );
    $("plan-exclusion-empty").hidden = Boolean(
      root.querySelector("[data-exclusion-name]:not([hidden])"),
    );
  };
  root.addEventListener("change", (e) => {
    const target = e.target;
    if (!["region","budget","meals","protein","excludedGroup","excluded","excludedFoodId"].includes(target.name)) return;
    $("plan-exclusion-limit").hidden = true;
    if (["excludedGroup","excluded","excludedFoodId"].includes(target.name) && target.checked) {
      try {
        const after = readPreferences(), before = copy(after);
        const key = {excludedGroup:'excludedGroups', excluded:'excludedKeys', excludedFoodId:'excludedFoodIds'}[target.name];
        before[key] = before[key].filter((v) => v !== target.value);
        const blocked = blockedExclusionSlots(before, after, library);
        if (blocked.length) {
          target.checked = false;
          const message = `لم نضف هذا الاستبعاد لأنه يترك أقل من ${MIN_MEAL_CHOICES} اقتراحات مختلفة في ${blocked.map((s) => SLOTS[s]).join('، ')}. أضف مصدر بروتين أو غيّر الميزانية أولًا.`;
          $("plan-exclusion-limit").textContent = message;
          $("plan-exclusion-limit").hidden = false;
          toast("الاستبعاد ده يقلّل خيارات الخطة؛ راجع التنبيه.");
        }
      } catch (e) {
        target.checked = false;
        $("plan-exclusion-limit").textContent = e.message;
        $("plan-exclusion-limit").hidden = false;
      }
    }
    updateExclusionSummary();
    updateAvailability();
  });
  $("plan-export").onclick = () =>
    download("my-nutrition-backup.json", store.export());
  $("plan-import").onchange = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // Allows retrying the same file after rejection or cancellation.
    if (!file || input.disabled) return;
    if (file.size > 10e6) {
      toast("الملف أكبر من 10 MB");
      return;
    }
    if (
      !window.confirm(
        "استرجاع النسخة سيستبدل خطط هذا المتصفح. احفظ نسخة حالية أولًا لو محتاجها.",
      )
    )
      return;
    const revision = state.revision;
    const request = ++importSequence;
    input.disabled = true;
    toast("جارٍ قراءة النسخة الاحتياطية…");
    try {
      const text = await file.text();
      if (request !== importSequence || state.revision !== revision)
        throw Error(
          "بياناتك اتغيرت أثناء قراءة الملف. لم نستبدلها؛ جرّب الاسترجاع مرة أخرى.",
        );
      state = store.import(text);
      selectedDate = null;
      fillForm();
      renderPlan();
      toast(
        "اتسترجعت النسخة. قيم الملف المستورد مسؤولية صاحبه وليست اعتمادًا جديدًا.",
      );
    } catch (err) {
      toast(err.message);
    } finally {
      if (request === importSequence) input.disabled = false;
    }
  };
  $("plan-clear").onclick = () => {
    if (window.confirm("مسح كل خططك وسجل أكلك وأطعمتك الشخصية من هذا المتصفح؟"))
      safely(() => {
        state = store.clear();
        selectedDate = null;
        renderPlan();
        $("plan-form").reset();
        $("plan-extra-exclusion-items").innerHTML = '';
        $("plan-extra-exclusions").hidden = true;
        $("plan-exclusion-limit").hidden = true;
        $("plan-exclusion-search").dispatchEvent(new Event("input"));
        updateExclusionSummary();
        updateRegionSummary();
        updateAvailability();
        $("plan-settings").open = false;
        const onboardingSec = $("coach-onboarding-section");
        if (onboardingSec) {
          onboardingSec.hidden = false;
          chatController?.refresh(state, true);
          onboardingSec.scrollIntoView({ behavior: "smooth" });
        }
      });
  };
  root.addEventListener("change", (e) => {
    const id = e.target.dataset.eaten;
    if (id)
      safely(() => {
        const p = active(),
          d = p.days.find((d) => d.date === selectedDate),
          m = d.meals.find((m) => m.id === id);
        save((s) => recordPlanned(s, m, d.date, e.target.checked));
      });
    const doneWorkoutKey = e.target.dataset.workoutDone;
    if (doneWorkoutKey) {
      safely(() => {
        save((s) => {
          s.onboarding = s.onboarding || {};
          const set = new Set(s.onboarding.completedExercises || []);
          if (e.target.checked) set.add(doneWorkoutKey);
          else set.delete(doneWorkoutKey);
          s.onboarding.completedExercises = [...set];
        });
      });
    }
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    safely(() => {
      if (b.dataset.homeTab) {
        homeTab = b.dataset.homeTab;
        renderPlan();
        return;
      }
      if (b.dataset.workoutDay != null) {
        selectedWorkoutDayIndex = Number(b.dataset.workoutDay);
        renderPlan();
        return;
      }
      if (b.dataset.switchWorkoutSplit != null) {
        const newSplit = b.dataset.switchWorkoutSplit;
        save((s) => {
          s.onboarding = s.onboarding || {};
          const wpPrefs = s.onboarding.workoutPrefs || {
            fitnessLevel: "beginner",
            workoutDaysCount: active()?.profile?.trainingDays || 3,
            workoutLocation: "gym_only",
            homeEquipment: ["none"],
            sessionDuration: 45,
            injuries: ["none"],
          };
          wpPrefs.workoutSplitPreference = newSplit;
          s.onboarding.workoutPrefs = wpPrefs;
          s.workoutPlan = generateWorkoutWeek(wpPrefs, active()?.profile || s.profile || {});
        });
        toast(`اتحدثت تقسيمة التمارين إلى: ${WORKOUT_SPLITS[newSplit]?.shortLabel || newSplit} 💪`);
        return;
      }
      if (b.dataset.toggleWorkoutLoc != null) {
        const dayIdx = Number(b.dataset.toggleWorkoutLoc);
        const newLoc = b.dataset.loc;
        save((s) => {
          s.onboarding = s.onboarding || {};
          const wpPrefs = s.onboarding.workoutPrefs || {
            fitnessLevel: "beginner",
            workoutDaysCount: active()?.profile?.trainingDays || 3,
            workoutLocation: "home_and_gym",
            homeEquipment: ["none"],
            sessionDuration: 45,
            injuries: ["none"],
          };
          const currentPlan = s.workoutPlan || generateWorkoutWeek(wpPrefs, active()?.profile || s.profile || {});
          const dayLocations = {};
          for (const d of currentPlan.days) {
            if (d.isTrainingDay) dayLocations[d.dayIndex] = d.location;
          }
          dayLocations[dayIdx] = newLoc;
          wpPrefs.workoutLocation = "home_and_gym";
          wpPrefs.dayLocations = dayLocations;
          s.onboarding.workoutPrefs = wpPrefs;
          s.workoutPlan = generateWorkoutWeek(wpPrefs, active()?.profile || s.profile || {});
        });
        toast(`اتحدث تمرين ${WEEKDAYS_AR[dayIdx]?.name || "اليوم"} ليكون في ${newLoc === "home" ? "البيت 🏠" : "الجيم 🏋️"}`);
        return;
      }
      if (b.dataset.workoutSwap != null) {
        const dayIdx = Number(b.dataset.workoutSwap);
        const slotIdx = Number(b.dataset.slotIdx);
        const exId = b.dataset.exId;
        const wp = state.workoutPlan || generateWorkoutWeek(state.onboarding?.workoutPrefs || {}, active()?.profile || {});
        const dayObj = wp.days[dayIdx];
        if (!dayObj) return;
        const alts = getExerciseAlternatives(exId, dayObj.location, state.onboarding?.workoutPrefs || {}, active()?.profile || state.profile || {});
        if (!alts.length) {
          toast("لا توجد بدائل إضافية مطابقة لنفس الأدوات والإصابات حالياً.");
          return;
        }
        const nextEx = alts[0];
        save((s) => {
          if (!s.workoutPlan) s.workoutPlan = wp;
          const targetDay = s.workoutPlan.days[dayIdx];
          if (targetDay && targetDay.exercises[slotIdx]) {
            targetDay.exercises[slotIdx] = {
              ...targetDay.exercises[slotIdx],
              id: nextEx.id,
              name_ar: nextEx.name_ar,
              name_en: nextEx.name_en,
              pattern: nextEx.pattern,
              movement: nextEx.movement,
              muscles: nextEx.muscles,
              equipment: nextEx.equipment,
              sets: nextEx.sets,
              reps: nextEx.reps,
              rest: nextEx.rest,
              tempo: nextEx.tempo,
              instructions: nextEx.instructions,
            };
          }
        });
        toast(`تم تبديل التمرين إلى: ${nextEx.name_ar} 💪`);
        return;
      }
      if (b.dataset.planDate) {
        selectedDate = b.dataset.planDate;
        renderPlan();
      }
      if (b.dataset.mealDetails) {
        const dialog = [...root.querySelectorAll('.plan-meal-sheet')].find(d => d.dataset.detailsId === b.dataset.mealDetails);
        if (dialog) {
          b.focus();
          dialog.showModal();
        }
      }
      if (b.hasAttribute('data-details-close')) b.closest('dialog').close();
      if (b.dataset.componentSwap) {
        const m = active().days.flatMap(d => d.meals).find(m => m.id === b.dataset.componentSwap);
        b.closest('.plan-meal-sheet')?.close();
        openPicker({type:'component',meal:m,index:Number(b.dataset.componentIndex),slot:m.slot,date:selectedDate,original:JSON.stringify(m.snapshot)});
      }
      if (b.dataset.swap) {
        const m = active()
          .days.flatMap((d) => d.meals)
          .find((m) => m.id === b.dataset.swap);
        openPicker({ type: "swap", meal: m, slot: m.slot, date: selectedDate });
      }
      if (b.dataset.scaleSave) {
        const id = b.dataset.scaleSave,
          m = active()
            .days.flatMap((d) => d.meals)
            .find((m) => m.id === id),
          q = root.querySelector(`[data-scale="${id}"]`).value;
        const dialog = b.closest('dialog');
        if (dialog?.open) dialog.close();
        save((s) => replacePlanned(s, id, simplifyPlannedSnapshot(scaleSnapshot(m.snapshot, q))));
        [...root.querySelectorAll('[data-meal-details]')].find(b => b.dataset.mealDetails === id)?.focus();
      }
      if (b.dataset.logRemove)
        save(
          (s) =>
            (s.diary = s.diary.filter((e) => e.id !== b.dataset.logRemove)),
        );
      if (b.dataset.logEdit) {
        const log = state.diary.find((e) => e.id === b.dataset.logEdit);
        openPicker({ type: "actual", log, slot: log.slot, date: log.date });
      }
    });
  });
  function pickerTab(tab) {
    for (const t of ["suggestions", "pantry", "search", "custom"])
      $("picker-" + t).hidden = t !== tab;
    root
      .querySelectorAll("[data-picker-tab]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.pickerTab === tab)),
      );
  }
  function suitableReplacement(c, snapshot) {
    if (!['swap','component'].includes(c.type)) return true;
    const plan=active(), day=plan.days.find(d=>d.meals.some(m=>m.id===c.meal.id));
    if (!day) return false;
    try {
      const replacement=c.type==='component'?replaceMealComponent(c.meal.snapshot,c.index,snapshot):snapshot;
      assertDietDay(day.meals.map(m=>m.id===c.meal.id?replacement:m.snapshot),plan.preferences.diet??'balanced',plan.targets);
      return true;
    } catch { return false; }
  }
  function openPicker(c) {
    context = c;
    basket = [];
    lastFocus = c.meal ? [...root.querySelectorAll("[data-meal-details]")].find(b => b.dataset.mealDetails === c.meal.id) : document.activeElement;
    $("picker-title").textContent =
      c.type === "component" ? "بدّل " + displayMealName(mealComponents(c.meal.snapshot)[c.index]) : c.type === "swap"
        ? "بدّل " + SLOTS[c.slot]
        : c.type === "actual"
          ? "عدّل الأكل الفعلي"
          : "سجّل " + SLOTS[c.slot];
    $("picker-parts").innerHTML = c.type === 'swap' ? '<h3>بدّل جزء من الوجبة</h3>' + mealComponents(c.meal.snapshot).map((part,index) => `<div class="plan-part-choice"><span>${esc(displayMealName(part))}</span><button class="outline-btn" data-component-swap="${esc(c.meal.id)}" data-component-index="${index}">بدّل</button></div>`).join('') + '<h3>أو اختار وجبة كاملة</h3>' : c.type === 'component' ? '<p class="plan-hint">هتغيّر الجزء ده فقط. باقي الوجبة يفضل زي ما هو، والسعرات تتحدث بعد الاختيار.</p>' : '';
    $("plan-basket-save").textContent = c.type === 'component' ? 'احفظ بديل الجزء ده' : 'احفظ الوجبة المختارة';
    $("picker-error").hidden = true;
    $("plan-basket-name").value =
      c.type === "component" ? "" : c.meal?.snapshot.name || c.log?.snapshot.name || "";
    $("plan-food-quantity").innerHTML = "";
    $("plan-food-search").value = "";
    selectedFood = null;
    sequence++;
    $("plan-food-results").innerHTML = "";
    if (c.type === "actual") basket = [copy(c.log.snapshot)];
    renderBasket();
    const anchor =
      c.meal ||
      (c.log
        ? { slot: c.slot, snapshot: c.log.snapshot }
        : {
            slot: c.slot,
            snapshot: {
              values: { energy: 300, protein: 15 },
              template_id: null,
            },
          });
    c.anchor=anchor;
    renderPantry();
    const suggestions = (c.type === "component" ? componentAlternatives(c.meal.snapshot,c.index,active().preferences,library,c.slot) : alternatives(anchor, active().preferences, library,1000)).filter(a=>suitableReplacement(c,a.snapshot)).slice(0,8);
    $("picker-suggestions").innerHTML =
      suggestions
        .map(
          (a, i) =>
            `<article class="plan-suggestion"><h3>${esc(displayMealName(a.snapshot))}</h3>${briefMacros(a.snapshot.values)}<p class="plan-hint">فرق السعرات ${n(a.energy_delta)} kcal · فرق البروتين ${n(a.protein_delta)} g</p><details><summary>المكونات والكميات</summary><ul class="plan-ingredients">${a.snapshot.ingredients.map((i) => `<li>${ingredientLabel(i)}</li>`).join("")}</ul></details><button class="outline-btn" data-alternative="${i}">اختار البديل</button></article>`,
        )
        .join("") ||
      "<p>مفيش اقتراح قريب ضمن اختياراتك. استخدم البحث أو راجع الاستبعادات.</p>";
    $("picker-suggestions").onclick = (e) => {
      const b = e.target.closest("[data-alternative]");
      if (b)
        safely(() =>
          commitSnapshot(suggestions[Number(b.dataset.alternative)].snapshot),
        );
    };
    pickerTab(c.type === "actual" ? "search" : "suggestions");
    if (!$("plan-picker").open) $("plan-picker").showModal();
    document.body.classList.add("planner-dialog-open");
    $("picker-close").focus();
  }
  function closePicker() {
    $("plan-picker").close();
    clearTimeout(searchTimer);
    document.body.classList.remove("planner-dialog-open");
    sequence++;
    const mealId=context?.meal?.id;
    context = null;
    const returnButton=[...root.querySelectorAll("[data-meal-details]")].find(b=>b.dataset.mealDetails===mealId);
    (returnButton || (lastFocus?.isConnected && lastFocus.getClientRects().length ? lastFocus : $("open-coach-chat-btn"))).focus();
  }
  $("plan-picker").addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const items = [
        ...$("plan-picker").querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.getClientRects().length > 0),
      first = items[0],
      last = items.at(-1);
    if (!first) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  $("picker-close").onclick = closePicker;
  window.addEventListener("planner-leave", () => {
    if ($("plan-picker").open) closePicker();
  });
  $("plan-picker").addEventListener("cancel", e => {e.preventDefault();closePicker();});
  root
    .querySelectorAll("[data-picker-tab]")
    .forEach((b) => (b.onclick = () => pickerTab(b.dataset.pickerTab)));
  function commitSnapshot(snap) {
    save((s) => {
      if (context.type === "component") {
        const m = s.plans.flatMap(p => p.days.flatMap(d => d.meals)).find(m => m.id === context.meal.id);
        if (!m || JSON.stringify(m.snapshot) !== context.original) throw Error('الوجبة اتغيرت؛ اقفل الاختيار وافتحها من جديد');
        replacePlanned(s,m.id,replaceMealComponent(m.snapshot,context.index,snap));
      }
      else if (context.type === "swap") replacePlanned(s, context.meal.id, snap);
      else if (context.type === "actual") {
        const e = s.diary.find((e) => e.id === context.log.id);
        e.snapshot = copy(snap);
        e.updated_at = new Date().toISOString();
      } else
        s.diary.push({
          id: "extra-" + uid(),
          plan_meal_id: null,
          date: context.date,
          slot: context.slot,
          snapshot: copy(snap),
          recorded_at: new Date().toISOString(),
        });
    });
    closePicker();
    toast("اتحفظ اختيارك. الإجمالي اتحدث من نفس الكميات.");
  }
  function renderBasket() {
    $("plan-basket-items").innerHTML =
      basket
        .map(
          (s, i) =>
            `<div class="plan-log"><span>${esc(s.name)} · ${n(s.values.energy)} kcal</span><button class="outline-btn" data-basket-remove="${i}" aria-label="حذف ${esc(s.name)}">حذف</button></div>`,
        )
        .join("") +
      (basket.length
        ? macros(sumSnapshots(basket).values)
        : "<p>اختار طعامًا من البحث أو أدخل بياناتك.</p>");
    $("plan-basket-save").disabled = !basket.length;
  }
  $("plan-basket-items").onclick = (e) => {
    const b = e.target.closest("[data-basket-remove]");
    if (b) {
      basket.splice(Number(b.dataset.basketRemove), 1);
      renderBasket();
    }
  };
  $("plan-basket-save").onclick = () =>
    safely(() =>
      commitSnapshot(combineSnapshots($("plan-basket-name").value, basket)),
    );
  function searchFoods() {
    const q = $("plan-food-search").value;
    if (q.trim().length < 2) {
      $("plan-food-results").innerHTML = "<p>اكتب حرفين أو أكثر.</p>";
      return;
    }
    const matches = filterFoods(foods.filter(f=>f.name_presentation?.status!=="needs_name_review"), {
        query: q,
        status: "published",
        sort: "relevance",
      }).slice(0, 20),
      custom = state.customFoods
        .filter((f) => preferenceText(f.name).includes(preferenceText(q)))
        .slice(0, 5);
    $("plan-food-results").innerHTML =
      matches
        .map(
          (f) =>
            `<button class="plan-food-result" data-plan-food="${esc(f.id)}"><strong>${esc(f.name)}</strong>${f.name_presentation?.variant_label ? `<small>${esc(f.name_presentation.variant_label)}</small>` : ""}<span>${f.status === "estimated" ? "تقريبي / بديل" : "مرجع غذائي"} · ${esc(f.basis_label || "100 جرام")} · ${n(f.macros[0])} kcal</span>${f.planning?.requires_preparation ? "<small>مكوّن قبل التحضير؛ لا تستخدمه بدل القيمة المطبوخة</small>" : ""}</button>`,
        )
        .join("") +
        custom
          .map(
            (f) =>
              `<button class="plan-food-result" data-custom-food="${esc(f.id)}"><strong>${esc(f.name)}</strong><span>بياناتك الشخصية · ${esc(f.basis_label)}</span></button>`,
          )
          .join("") || "<p>لا توجد نتائج؛ غيّر الاسم أو أدخل طعامك الخاص.</p>";
  }
  $("plan-food-search").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchFoods, 160);
  };
  $("plan-food-results").onclick = async (e) => {
    const b = e.target.closest("[data-plan-food],[data-custom-food]");
    if (!b) return;
    const seq = ++sequence;
    $("plan-food-quantity").innerHTML =
      '<p role="status">جارٍ تحميل الوحدات الموثقة…</p>';
    try {
      const custom = Boolean(b.dataset.customFood);
      const food = custom
        ? state.customFoods.find((f) => f.id === b.dataset.customFood)
        : foods.find((f) => f.id === b.dataset.planFood);
      if (!food) throw Error("الطعام غير موجود");
      const detail = custom ? null : await detailLoader(food.id);
      if (seq !== sequence || !context) return;
      selectedFood = food;
      selectedDetail = detail;
      renderQuantity(custom);
    } catch (err) {
      if (seq === sequence)
        $("plan-food-quantity").innerHTML =
          `<p role="alert">${esc(err.message)}. اختار الطعام مرة أخرى للمحاولة.</p>`;
    }
  };
  function renderQuantity(custom) {
    const f = selectedFood,
      d = selectedDetail,
      disliked = excludedTaste(f, active().preferences, library),
      reference = custom
        ? f.basis === "serving"
        : f.status === "estimated" || f.basis === "reference_serving";
    const portions = custom
      ? []
      : (d.portions || []).filter((p) => p.grams != null);
    $("plan-food-quantity").innerHTML =
      `<h3>${esc(f.name)}</h3><p>${esc(custom ? "بياناتك الشخصية غير المعتمدة" : f.status === "estimated" ? "مقادير نموذج تقريبي؛ ليست وزن طبق نهائي" : f.basis_label || "القيم المرجعية لكل 100 جرام")}</p>${!custom && f.status === "estimated" ? '<label class="plan-check"><input id="plan-approx-ack" type="checkbox"> فاهم إن ده نموذج تقريبي أو مرجع بديل وراجعت تفاصيله</label><a href="#food/' + esc(f.id) + '" target="_blank" rel="noopener">افتح المكونات والاختلافات في صفحة مستقلة ↗</a>' : ""}${disliked.length ? `<label class="plan-check plan-notice"><input id="plan-taste-ack" type="checkbox"><span>ده ضمن استبعاداتك (${esc(disliked.join("، "))}). عايز أضيفه باختياري للوجبة دي.</span></label>` : ""}<div class="plan-fields"><label>الوحدة<select id="plan-food-unit">${reference ? '<option value="reference">عدد المقادير / الحصص المكتوبة</option>' : '<option value="grams">جرام</option>' + (!custom && f.volume_evidence ? '<option value="ml">ملليلتر (تحويل موثق)</option>' : "") + portions.map((p) => `<option value="portion:${esc(p.id)}">${esc(portionInfo(p, f).label)} · ${n(p.grams)} جرام حسب المرجع</option>`).join("")}</select></label><label>الكمية<input id="plan-food-amount" type="number" min="0.001" max="100000" step="any" value="${reference ? 1 : 100}"></label></div><p class="plan-hint">${reference ? "لا نفترض وزنًا بالجرام للحصة مجهولة الوزن." : "الحصص تخص هذا الملف وحالته. اختر العدد بالنسبة للمقدار المكتوب؛ وزن رغيفك أو كوبك قد يختلف."}</p><div id="plan-quantity-preview"></div><button id="plan-food-add" class="outline-btn">أضف للوجبة المختارة</button>`;
    const snapshot = () => {
      if (disliked.length && !$("plan-taste-ack").checked)
        throw Error(
          "الطعام ضمن استبعاداتك؛ اختار بديلًا أو وافق صراحة على إضافته",
        );
      const unit = $("plan-food-unit").value,
        amount = $("plan-food-amount").value;
      return custom
        ? customSnapshot(f, amount)
        : snapshotFood(
            f,
            d,
            amount,
            unit.startsWith("portion:") ? "portion" : unit,
            unit.startsWith("portion:") ? unit.slice(8) : null,
            $("plan-approx-ack")?.checked,
          );
    };
    const preview = () => {
      try {
        $("plan-quantity-preview").innerHTML = macros(snapshot().values);
      } catch (err) {
        $("plan-quantity-preview").textContent = err.message;
      }
    };
    $("plan-food-unit").onchange = () => {
      $("plan-food-amount").value = ["grams", "ml"].includes(
        $("plan-food-unit").value,
      )
        ? 100
        : 1;
      preview();
    };
    $("plan-food-amount").oninput = preview;
    if ($("plan-approx-ack")) $("plan-approx-ack").onchange = preview;
    if ($("plan-taste-ack")) $("plan-taste-ack").onchange = preview;
    $("plan-food-add").onclick = () =>
      safely(() => {
        if (basket.flatMap((s) => s.ingredients).length >= 100)
          throw Error("وصلت للحد: 100 مكوّن في الوجبة");
        basket.push(snapshot());
        if (!$("plan-basket-name").value) $("plan-basket-name").value = f.name;
        renderBasket();
        toast("اتضاف للمكونات المختارة");
      });
    preview();
  }
  $("custom-food-form").elements.basis.onchange = (e) =>
    ($("custom-food-form").elements.quantity.value =
      e.target.value === "serving" ? 1 : 100);
  $("custom-food-form").onsubmit = (e) => {
    e.preventDefault();
    safely(() => {
      if (basket.flatMap((s) => s.ingredients).length >= 100)
        throw Error("وصلت للحد: 100 مكوّن في الوجبة");
      const f = e.target,
        input = Object.fromEntries(
          [...f.elements].filter((e) => e.name).map((e) => [e.name, e.value]),
        ),
        food = customFood(input, "user-" + uid()),
        snap = customSnapshot(food, input.quantity);
      save((s) => s.customFoods.push(food));
      basket.push(snap);
      if (!$("plan-basket-name").value) $("plan-basket-name").value = food.name;
      renderBasket();
      toast("اتحفظ في أطعمتك الخاصة فقط");
    });
  };
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      $("planner-error").innerHTML =
        '<p>بياناتك تغيرت في تبويب آخر. أعد تحميل الصفحة قبل التعديل. صدّر النسخة المفتوحة أولًا لو تحتاجها.</p><button class="outline-btn" id="plan-reload">تحميل آخر نسخة محفوظة</button>';
      $("plan-reload").onclick = () => location.reload();
      $("planner-error").hidden = false;
    }
  });

  function updateSports(){
    const separate=$('plan-form').elements.exerciseMode.value==='separate';
    $('activity-label').textContent=separate?'نشاطك اليومي بدون الرياضة':'نشاطك المعتاد شامل التمرين';
    $('sports-method').textContent=separate?'اختار مستوى نشاطك خارج وقت الرياضة. نحسب الرياضة من النوع والمدة والتكرار، ونخصم الطاقة الأساسية لنفس الوقت لتجنب احتسابها مرتين.':'معامل النشاط يشمل رياضتك بالفعل. تحديد الرياضات هنا لا يضيف سعراتها مرة ثانية؛ اختار الوضع المنفصل لإدخالها في الحساب بالتفصيل.';
    for(const e of root.querySelectorAll('[data-sport]'))for(const attr of ['minutes','sessions'])root.querySelector(`[data-sport-${attr}="${e.dataset.sport}"]`).disabled=!e.checked;
  }
  $('plan-form').elements.exerciseMode.onchange=updateSports;
  for(const e of root.querySelectorAll('[data-sport]'))e.onchange=updateSports;
  function renderPantry(){
    const selected=new Set(state.pantry||[]);
    $('pantry-options').innerHTML=pantryCatalog(library).map(r=>`<label class="plan-check" data-pantry-label="${esc(r.label)}"><input type="checkbox" data-pantry="${esc(r.id)}" ${selected.has(r.id)?'checked':''}>${esc(r.label)}</label>`).join('');
    $('pantry-status').textContent=`${selected.size} مكوّن محدد`;
    $('pantry-results').innerHTML='';$('pantry-search').value='';
  }
  $('pantry-options').onchange=()=>safely(()=>{
    const selected=[...root.querySelectorAll('[data-pantry]:checked')].map(e=>e.dataset.pantry);
    state=store.update(s=>{s.pantry=selected;});
    $('pantry-status').textContent=`${selected.length} مكوّن محدد`;
    $('pantry-results').innerHTML='';
  });
  $('pantry-search').oninput=()=>{
    const norm=s=>s.normalize('NFKD').replace(/[\u064b-\u065f]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').toLowerCase();
    const q=norm($('pantry-search').value.trim());
    for(const e of root.querySelectorAll('[data-pantry-label]'))e.hidden=!norm(e.dataset.pantryLabel).includes(q);
  };
  $('pantry-find').onclick=()=>safely(()=>{
    if(!context)return;
    const c=context,rows=pantryAlternatives(c.anchor,active().preferences,library,state.pantry||[],c.type==='component'?c.index:null,1000).filter(a=>suitableReplacement(c,a.snapshot)).slice(0,12);
    $('pantry-results').innerHTML=rows.length?rows.map((a,index)=>`<article class="plan-suggestion"><h3>${esc(displayMealName(a.snapshot))}</h3>${briefMacros(a.snapshot.values)}<p>فرق السعرات ${n(a.energy_delta)} · فرق البروتين ${n(a.protein_delta)} جرام</p><details><summary>المكونات والكميات</summary><ul class="plan-ingredients">${a.snapshot.ingredients.map(i=>`<li>${ingredientLabel(i)}</li>`).join('')}</ul></details><button class="outline-btn" data-pantry-choice="${index}">اختار البديل</button></article>`).join(''):'<p class="plan-notice">مفيش بديل مكتمل من المكونات المحددة يناسب الوجبة واختياراتك. زوّد الموجود عندك فعلًا، أو استخدم البحث اليدوي. لم نفترض زيتًا أو إضافات غير محددة.</p>';
    $('pantry-results').onclick=e=>{const b=e.target.closest('[data-pantry-choice]');if(b)safely(()=>commitSnapshot(rows[Number(b.dataset.pantryChoice)].snapshot));};
  });

  function updateDiet(){
    const diet=$('plan-form').elements.diet.value;
    $('keto-screen').hidden=diet!=='keto';
    const info=DIET_INFO[diet];
    $('diet-description').innerHTML=`<p><strong>يناسبك إمتى؟</strong> ${esc(info.fit)}</p><p><strong>مميزاته</strong> ${esc(info.benefit)}</p><p><strong>خلي بالك</strong> ${esc(info.limit)}</p>`;
    $('fasting-settings').hidden=$('plan-form').elements.fasting.value==='none';
    const links={mediterranean:'https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/nutrition-basics/mediterranean-diet',dash:'https://www.nhlbi.nih.gov/health/dash-eating-plan',vegan:'https://www.nhs.uk/live-well/eat-well/how-to-eat-a-balanced-diet/the-vegan-diet/',vegetarian:'https://www.nhs.uk/live-well/eat-well/how-to-eat-a-balanced-diet/the-vegetarian-diet/',keto:'https://www.ncbi.nlm.nih.gov/books/NBK499830/',low_carb:'https://www.ncbi.nlm.nih.gov/books/NBK537084/',high_protein:'https://pubmed.ncbi.nlm.nih.gov/28642676/'};
    if(links[diet])$('diet-description').innerHTML+=`<a href="${links[diet]}" target="_blank" rel="noopener">اقرأ عن النظام ومحدوديته ↗</a>`;
    updateRegionSummary();updateAvailability();
  }
  $('plan-form').elements.diet.onchange=updateDiet;
  $('plan-form').elements.fasting.onchange=updateDiet;
  fillForm();updateDiet();
  renderPlan();
  if (active()) $("plan-settings").open = false;

  const onboardingSection = $("coach-onboarding-section");
  if (onboardingSection) {
    onboardingSection.hidden = Boolean(active() || state.workoutPlan);
    chatController = mountOnboardingChat({
      container: onboardingSection,
      getState: () => state,
      onRestoreExisting: (draftFromChat) => {
        safely(() => {
          if (!active() && !state.workoutPlan) {
            const restoredProfile = {
              name: draftFromChat?.name || "أحمد",
              weight: Number(draftFromChat?.weight) || 82,
              height: Number(draftFromChat?.height) || 175,
              age: Number(draftFromChat?.age) || 29,
              seniorMode: false,
              sex: draftFromChat?.sex || "male",
              maternalStatus: "none",
              activity: "light",
              goal: "lose",
              targetWeight: 73,
              goalPace: "moderate",
              trainingDays: 4,
              workoutDays: [0, 1, 3, 4],
              diseases: [],
            };
            const restoredWorkoutPrefs = {
              fitnessLevel: "intermediate",
              selectedWorkoutDays: [0, 1, 3, 4],
              workoutDaysCount: 4,
              workoutSplitPreference: "auto",
              workoutLocation: "gym_only",
              sessionDuration: 45,
              injuries: ["none"],
            };
            const restoredWorkout = generateWorkoutWeek(restoredWorkoutPrefs, restoredProfile);
            const restoredPlan = makeWeek(
              restoredProfile,
              {
                diet: "balanced",
                fasting: "none",
                eatingStart: "12:00",
                region: draftFromChat?.region || "egypt",
                budget: "medium",
                meals: 4,
                proteins: ["legumes", "eggs", "dairy", "chicken", "fish", "meat", "nuts"],
                excludedKeys: [],
                excludedFoodIds: [],
                excludedGroups: [],
              },
              library,
              today(),
              uid()
            );
            save((s) => {
              s.onboarding = {
                completedAt: new Date().toISOString(),
                accountCheck: "logged_in_existing",
                isAuthenticated: true,
                authEmail: draftFromChat?.authEmail || "returning@coach.app",
                serviceTrack: "nutrition_and_workouts",
                workoutPrefs: restoredWorkoutPrefs,
                completedExercises: [],
              };
              s.workoutPlan = restoredWorkout;
              selectedDate = restoredPlan.start_date;
              activatePlan(s, restoredPlan);
              simplifyActivePlan(s);
            });
            fillForm();
          }
          onboardingSection.hidden = true;
          $("plan-settings").open = false;
          renderPlan();
          $("plan-dashboard").scrollIntoView({ behavior: "smooth" });
          toast("🔄 تم استرجاع بياناتك وخطتك المحفوظة بنجاح ودخول الصفحة الرئيسية 🚀");
        });
      },
      onCompleteOnboarding: (draft) => {
        safely(() => {
          const cleanDiseases = (draft.diseases || []).filter((x) => x && x !== "none");
          const cleanInjuries = (draft.injuries || []).filter((x) => x && x !== "none");
          const cleanExclusions = (draft.excludedGroups || []).filter((x) => x && x !== "none");
          const selectedWorkoutDays =
            Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
              ? draft.selectedWorkoutDays
              : null;
          const workoutDaysCount =
            draft.serviceTrack === "nutrition_only"
              ? 0
              : selectedWorkoutDays
                ? selectedWorkoutDays.length
                : Number(draft.workoutDaysCount) || 3;

          const workoutPrefs = {
            fitnessLevel: draft.fitnessLevel || "beginner",
            selectedWorkoutDays,
            workoutDaysCount: workoutDaysCount || 3,
            workoutSplitPreference: draft.workoutSplitPreference || "auto",
            workoutLocation: draft.workoutLocation || "gym_only",
            dayLocations: draft.dayLocations || null,
            homeEquipment: draft.homeEquipment || ["none"],
            sessionDuration: Number(draft.sessionDuration) || 45,
            injuries: cleanInjuries.length ? cleanInjuries : ["none"],
          };

          const profileObj = {
            name: draft.name || "بطل",
            weight: Number(draft.weight) || 75,
            height: Number(draft.height) || 170,
            age: Math.min(70, Math.max(18, Number(draft.age) || 30)),
            seniorMode: Number(draft.age) > 70,
            sex: draft.sex || "male",
            maternalStatus: draft.sex === "female" ? draft.maternalStatus || "none" : "none",
            activity: draft.dailyActivity || "light",
            goal: draft.goal || "lose",
            targetWeight: draft.targetWeight ? Number(draft.targetWeight) : null,
            goalPace: draft.goalPace || "moderate",
            trainingDays: workoutDaysCount,
            diseases: cleanDiseases,
            ketoAcknowledged: draft.dietType === "keto",
            fastingAcknowledged: draft.dietType === "intermittent_fasting",
          };

          const generatedWorkout = draft.serviceTrack !== "nutrition_only"
            ? generateWorkoutWeek(workoutPrefs, profileObj)
            : null;

          if (generatedWorkout) {
            profileObj.workoutDays = generatedWorkout.days
              .filter((d) => d.isTrainingDay)
              .map((d) => d.dayIndex);
          }

          let generatedPlan = null;
          if (draft.serviceTrack !== "workouts_only") {
            const fixed = FIXED_DIET_MEALS[draft.dietType];
            const meals = fixed ? fixed.meals : Number(draft.mealsCount) || 4;
            const fasting = fixed ? fixed.fasting : "none";
            let proteins = ["legumes", "eggs", "dairy", "chicken", "fish", "meat", "nuts"];
            if (draft.dietType === "vegetarian") proteins = ["legumes", "eggs", "dairy", "nuts"];
            if (draft.dietType === "vegan") proteins = ["legumes", "nuts"];

            const prefsObj = {
              diet: draft.dietType || "balanced",
              fasting,
              eatingStart: draft.eatingStart || "12:00",
              region: draft.region || "egypt",
              budget: draft.budget || "medium",
              meals,
              proteins,
              excludedKeys: [],
              excludedFoodIds: [],
              excludedGroups: cleanExclusions,
            };

            try {
              generatedPlan = makeWeek(profileObj, prefsObj, library, today(), uid());
            } catch {
              // Fallback if strict exclusions/budget blocked a slot: relax budget to medium/high
              generatedPlan = makeWeek(
                profileObj,
                { ...prefsObj, budget: prefsObj.budget === "low" ? "medium" : "high", excludedGroups: [] },
                library,
                today(),
                uid()
              );
            }
          }

          save((s) => {
            s.onboarding = {
              completedAt: new Date().toISOString(),
              accountCheck: draft.accountCheck || "no",
              isAuthenticated: Boolean(draft.isAuthenticated),
              authEmail: draft.authEmail || "",
              serviceTrack: draft.serviceTrack,
              workoutPrefs,
              completedExercises: [],
            };
            s.workoutPlan = generatedWorkout;
            if (generatedPlan) {
              selectedDate = generatedPlan.start_date;
              activatePlan(s, generatedPlan);
              simplifyActivePlan(s);
            } else {
              s.profile = profileObj;
            }
          });

          homeTab = draft.serviceTrack === "workouts_only" ? "workouts" : "nutrition";
          onboardingSection.hidden = true;
          $("plan-settings").open = false;
          fillForm();
          renderPlan();
          $("plan-dashboard").scrollIntoView({ behavior: "smooth" });
          toast(`☁️ تم مزامنة بياناتك مع الحساب (${draft.authEmail || "حسابك"}) وفتح خطتك يا ${profileObj.name} 🎯`);
        });
      },
    });
  }

  if ($("open-coach-chat-btn")) {
    $("open-coach-chat-btn").onclick = () => {
      if (!onboardingSection) return;
      const willShow = onboardingSection.hidden;
      onboardingSection.hidden = !willShow;
      if (willShow) {
        chatController?.refresh(state, false);
        onboardingSection.scrollIntoView({ behavior: "smooth" });
      }
    };
  }
}
