import {mountPlanner} from './coaching-ui.mjs';
import {planningFilter,SLOTS,BUDGETS} from './planning-tags.mjs';
import {portionInfo,sourceVolume,volumeGrams} from './portions.mjs';
import {
  normalize,
  filterFoods,
  decimalProduct,
  csvCell,
  searchScore,
} from "./core.mjs";
import { aggregate, referenceTotals, estimateTotals } from "./calculator.mjs";
import { catalogMatches, groupLabel, qualityLabel } from "./ui.mjs";
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const numeric = (x) =>
  x == null
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
        Number(x),
      );
const count = (x) => new Intl.NumberFormat("en").format(x),
  stateLabels = {
    raw: "نيّ",
    cooked: "مطبوخ",
    dried: "مجفف",
    as_sold: "كما ورد بالمصدر",
    unknown: "غير محدد",
  };
const kindLabels = {
    ingredient: "مكوّن",
    dish: "طبق / مخبوزات",
    beverage: "مشروب",
  },
  methodLabels = {
    measured: "مقاسة",
    calculated: "محسوبة",
    unknown: "غير محددة",
    label: "بطاقة غذائية",
  };
const aliases = {
  "fdc:1008": "الطاقة",
  "fdc:1003": "البروتين",
  "fdc:1004": "إجمالي الدهون",
  "fdc:1005": "الكربوهيدرات بالفرق",
  "cofid:CHO": "الكربوهيدرات المتاحة",
  "fdc:1079": "الألياف الغذائية",
  "fdc:2000": "السكريات",
  "fdc:1258": "الدهون المشبعة",
  "fdc:1253": "الكوليسترول",
  "fdc:1087": "الكالسيوم",
  "fdc:1089": "الحديد",
  "fdc:1090": "المغنيسيوم",
  "fdc:1091": "الفوسفور",
  "fdc:1092": "البوتاسيوم",
  "fdc:1093": "الصوديوم",
  "fdc:1095": "الزنك",
  "fdc:1162": "فيتامين C",
  "fdc:1114": "فيتامين D",
  "fdc:1178": "فيتامين B12",
  "fdc:1109": "فيتامين E",
  "fdc:1185": "فيتامين K",
  "fdc:1051": "الماء",
  "fdc:1018": "الكحول",
};
let meta,
  foods,
  nutrientDefs,
  egyptCatalog,
  egyptShown = 40,
  currentView = "egypt",
  filtered = [],
  page = 1,
  status = "published",
  kind = "",
  activeFood = null,
  activeDetail = null,
  dialogSequence = 0;
const chunkCache = new Map();
const PAGE_SIZE = 20;
let toastTimer,
  lastTrigger = null,
  suppressDialogHistory = false;
function toast(text) {
  clearTimeout(toastTimer);
  $("toast").textContent = text;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function planningBadges(f){const t=f.planning;if(!t)return '';return `<div class="planning-tags" title="${esc(t.explanation)}"><span>${t.meal_slots.map(k=>SLOTS[k]).join(' · ')}</span><span class="budget-tag">ميزانية ${BUDGETS[t.budget_tier]} · تقديرية</span>${t.role==='ingredient'?'<span>استخدام كمكوّن</span>':''}</div>`;}
function qualityBadge(f) {
  const q = qualityLabel(f);
  return `<span class="quality-badge ${q.className}">${esc(q.label)}</span>`;
}
function presets(field, unit, choices = null) {
  const amounts = choices || (field === "quantity" ? ["100", "150", "200"] : ["0.5", "1", "2"]);
  return `<div class="quantity-presets" aria-label="كميات سريعة">${amounts.map((v) => `<button type="button" data-quantity-field="${field}" data-quantity-value="${v}">${v} ${unit}</button>`).join("")}</div>`;
}
function syncFilters() {
  const f = queryFilters();
  const active = [
    $("name-scope").value === "all" ? "all-names" : "",
    f.source,
    f.state,
    f.category,
    f.meal,
    f.budget,
    f.kind,
    f.status !== "published" ? f.status : "",
  ].filter(Boolean).length;
  $("filter-count").textContent = count(active);
  $("filter-count").hidden = !active;
  $("reset-all").hidden = !active && !f.query;
  $("clear-search").hidden = !f.query;
  $("download-results").disabled = !filtered.length;
  document.querySelectorAll(".chip").forEach((b) => {
    const selected = b.dataset.kind === kind;
    b.classList.toggle("active", selected);
    b.setAttribute("aria-pressed", String(selected));
  });
}
function debounce(fn) {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, 120);
  };
}

function icon(f) {
  const paths = f.beverage
    ? '<path d="M5 5h12v9a6 6 0 0 1-12 0V5Zm12 2h2a3 3 0 0 1 0 6h-2M3 21h18"/>'
    : f.kind === "dish"
      ? '<path d="M3 11h18a9 9 0 0 1-18 0ZM6 21h12M8 7V4m8 3V4"/>'
      : '<path d="M5 19C-1 8 12 3 21 3c0 10-6 21-16 16Zm0 0L17 7"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function queryFilters() {
  return {
    query: $("search").value,
    source: $("source-filter").value,
    state: $("state-filter").value,
    category: $("category-filter").value,
    meal: $("meal-filter").value,
    budget: $("budget-filter").value,
    kind,
    status: $("quality-filter").value,
    sort: $("sort").value,
  };
}
function render(reset = true) {
  if (!foods || !meta) return;
  if (reset) page = 1;
  filtered = planningFilter(filterFoods($("name-scope").value === "all" ? foods : foods.filter(f=>f.name_presentation?.status !== "needs_name_review"), queryFilters()),queryFilters());
  const max = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.min(page, max);
  const start = (page - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  $("food-rows").innerHTML = rows
    .map(
      (f) =>
        `<tr><td><button class="food-link" data-food="${f.id}"><span class="food-icon" aria-hidden="true">${icon(f)}</span><span class="food-text"><span class="food-name">${esc(f.name)}</span>${qualityBadge(f)}${planningBadges(f)}<span class="food-en">${esc(f.name_presentation?.variant_label || (f.name_presentation?.status === "needs_name_review" ? "اسم مرجعي يحتاج تحريرًا عربيًا" : ""))}${f.name_presentation?.same_name_profiles>1 ? " · ملف غذائي مستقل؛ راجع التحضير والمصدر" : ""}</span><small class="basis-note">${esc(quantitySummary(f))}</small>${unitSummary(f)}</span></button></td><td class="energy-cell" data-label="السعرات kcal">${numeric(f.macros?.[0])}</td><td class="numeric" data-label="البروتين g">${numeric(f.macros?.[1])}</td><td class="numeric" data-label="الدهون g">${numeric(f.macros?.[2])}</td><td class="numeric" data-label="الكربوهيدرات g">${numeric(f.macros?.[3])}</td><td class="food-source"><span class="source-tag">${esc(meta.sources[f.source].short)}</span></td><td class="food-action"><button class="row-open" data-food="${f.id}" aria-label="تفاصيل ${esc(f.name)}">‹</button></td></tr>`,
    )
    .join("");
  $("results-label").textContent = `${count(filtered.length)} نتيجة` + ($("name-scope").value === "ready" ? " · أسماء عربية مجهزة للاستخدام" : " · كل الملفات المرجعية");
  $("empty-state").hidden = !!rows.length;
  $("page-summary").textContent = rows.length
    ? `${count(start + 1)}–${count(start + rows.length)} من ${count(filtered.length)} نتيجة`
    : "لا توجد نتائج";
  $("page-number").textContent = `${page} / ${max}`;
  $("previous-page").disabled = page <= 1;
  $("next-page").disabled = page >= max;
  syncFilters();
}

function showView(view, changeHash = true) {
  if (!["egypt", "foods", "sources", "about", "planner"].includes(view)) view = "egypt";
  if(view!=="planner")window.dispatchEvent(new Event("planner-leave"));
  currentView = view;
  for (const v of ["egypt", "foods", "sources", "about", "planner"])
    $(v + "-view").hidden = v !== view;
  document.querySelectorAll(".nav").forEach((b) => {
    const selected = b.dataset.view === view;
    b.classList.toggle("active", selected);
    if (selected) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("breadcrumb").textContent = {
    egypt: "الأكل المصري",
    foods: "كل الأطعمة",
    sources: "المصادر والتوثيق",
    about: "عن الدليل",
    planner: "خطتي الأسبوعية",
  }[view];
  if (changeHash) {
    if (location.hash !== "#" + view) history.pushState(null, "", "#" + view);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
function restoreRoute() {
  const hash = location.hash.slice(1);
  if (hash.startsWith("food/")) {
    if ($("food-dialog").open && activeFood?.id === hash.slice(5)) return;
    showView(currentView || "foods", false);
    openFood(hash.slice(5), false);
  } else {
    if ($("food-dialog").open) {
      suppressDialogHistory = true;
      $("food-dialog").close();
    }
    showView(
      ["egypt", "foods", "sources", "about", "planner"].includes(hash) ? hash : "egypt",
      false,
    );
  }
}

function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function openFood(id, changeHash = true) {
  const f = foods?.find((x) => x.id === id);
  if (!f) {
    dialogSequence++;
    activeFood = null;
    activeDetail = null;
    lastTrigger = document.activeElement;
    $("detail-content").setAttribute("aria-busy", "false");
    $("detail-content").innerHTML =
      '<div class="detail-body error"><h2>الطعام غير موجود في هذه النسخة</h2><p>ارجع للدليل وابحث عن الاسم مرة أخرى.</p><button id="close-invalid" class="outline-btn">العودة للدليل</button></div>';
    if (!$("food-dialog").open) $("food-dialog").showModal();
    document.body.classList.add("dialog-open");
    return;
  }
  const sequence = ++dialogSequence;
  if (!$("food-dialog").open) lastTrigger = document.activeElement;
  activeFood = f;
  activeDetail = null;
  $("detail-content").setAttribute("aria-busy", "true");
  $("detail-content").innerHTML =
    '<div class="loading">جارٍ تحميل الملف الغذائي…</div>';
  if (!$("food-dialog").open) $("food-dialog").showModal();
  document.body.classList.add("dialog-open");
  $("food-dialog").scrollTop = 0;
  if (changeHash && location.hash !== "#food/" + id)
    history.pushState(null, "", "#food/" + id);
  try {
    const chunk = id.slice(0, 2);
    if (!chunkCache.has(chunk))
      chunkCache.set(
        chunk,
        fetch((location.hostname === "example.test" ? "" : ".") + "/data/details/" + chunk + ".json").then((r) => {
          if (!r.ok) throw Error("تعذر تحميل التفاصيل");
          return r.json();
        }),
      );
    const details = await chunkCache.get(chunk);
    if (sequence !== dialogSequence) return;
    activeDetail = details[id];
    if (!activeDetail) throw Error("الملف غير موجود في هذا الإصدار");
    f.status === "estimated"
      ? renderEstimateDetail(f, activeDetail)
      : renderDetail(f, activeDetail);
    $("detail-content").setAttribute("aria-busy", "false");
  } catch (e) {
    if (sequence === dialogSequence) {
      $("detail-content").setAttribute("aria-busy", "false");
      $("detail-content").innerHTML =
        `<div class="detail-body error">${esc(e.message)} <button class="outline-btn" id="retry-detail">إعادة المحاولة</button></div>`;
    }
  }
}
function sourceBox(f, d) {
  const s = meta.sources[f.source];
  return `<div class="detail-source"><strong>${esc(s.title)}</strong><dl><dt>منطقة المصدر</dt><dd>${esc(s.regionLabel)}</dd><dt>معرّف السجل</dt><dd dir="ltr">${esc(d.external_id || f.external_id)}</dd><dt>طريقة الاعتماد</dt><dd>${f.status === "approved" ? "مراجعة مصدرية موثقة وآلية، دون مراجعة اختصاصي بشري" : "ملف رسمي مستورد ينتظر استكمال المراجعة"}</dd><dt>ترخيص الاستخدام</dt><dd><a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">${esc(s.license)}</a></dd></dl><a href="${esc(d.locator || f.locator || s.url)}" target="_blank" rel="noopener">فتح المرجع الأصلي ↗</a><p>${esc(s.scope)}</p>${d.source_dataset === "survey_fndds_food" ? "<p>هذا ملف FNDDS مرجعي مجمع؛ قد يتضمن حسابات واستكمالات مصدرية. أوزان الحصص تقديرات مرجعية للجزء الصالح للأكل، وليست وزنًا ثابتًا لكل كوب أو طبق.</p>" : ""}</div>`;
}
function renderDetail(f, d) {
  if (d.basis === "reference_serving") {
    renderServingDetail(f, d);
    return;
  }
  $("detail-content").innerHTML =
    `<div class="detail-body"><div class="detail-tags"><span>${f.coverage === "partial" ? "توثيق غذائي جزئي" : "معتمد مرجعيًا"}</span><span>${esc(f.beverage ? "مشروب" : kindLabels[f.kind])}</span><span>${esc(stateLabels[f.state])}</span><span>${esc(meta.sources[f.source].regionLabel)}</span></div><h2 id="detail-title">${esc(f.name)}</h2><p class="detail-en">${esc(f.name_presentation?.variant_label || "")}</p><details class="source-original-title"><summary>اسم الطعام الأصلي في المرجع</summary><p dir="auto">${esc(f.english || f.name_presentation?.original_name || f.name)}</p></details>${planningBadges(f)}${f.coverage === "partial" ? '<div class="egypt-banner"><strong>هذا الملف جزئي: لا تتوفر سعرات أو ماكروز كاملة.</strong><p>العناصر غير المتاحة تظهر بدون أرقام. يمكن حساب العناصر الموثقة بالجرام، ولا تُشتق السعرات من الدهون وحدها.</p></div>' : ""}${portionButtons(f,d)}<div class="quantity-box"><label><span id="quantity-label">الكمية بالجرام</span><input id="quantity" inputmode="decimal" type="number" min="0.001" max="100000" step="any" value="100"></label><label>وحدة الحساب<select id="portion-select"><option value="grams">جرام</option>${sourceVolume(d.portions)?'<option value="ml">ملليلتر</option>':''}${d.portions.map((p, i) => `<option value="${i}">${esc(portionInfo(p,f).label)} · ${numeric(p.grams)} جم</option>`).join("")}</select></label><p id="quantity-caption">القيم لكمية 100 جرام</p></div><div id="reference-presets">${presets("quantity", "جرام")}</div><p id="portion-source" class="unit-note"></p><div class="detail-macros">${["السعرات", "البروتين", "الدهون", "الكربوهيدرات"].map((label, i) => `<div class="detail-macro"><span>${label}</span><strong id="macro-${i}">—</strong><small>${i ? "جرام" : "kcal"}</small></div>`).join("")}</div><p class="unit-note">${f.carb_id === "cofid:CHO" ? "الكربوهيدرات المتاحة بمكافئات السكريات الأحادية؛ تعريفها يختلف عن الكربوهيدرات بالفرق في USDA." : "الكربوهيدرات بحسب تعريف المرجع؛ التفاصيل في جدول العناصر."} ${d.portions.length ? "الحصص تخص هذا الملف المرجعي وطريقة تحضيره." : "لا تتوفر حصص منزلية معتمدة لهذا الملف."} الملليلتر متاح فقط عندما يوثق المصدر حجمًا ووزنًا لنفس الملف، أو توجد كثافة موثقة.</p><section class="detail-section"><h3>كل العناصر الغذائية <span id="nutrient-count"></span></h3><input class="nutrient-search" id="nutrient-search" type="search" placeholder="ابحث داخل العناصر… كالسيوم، فيتامين، sodium" aria-label="البحث داخل العناصر الغذائية"><label class="unit-note"><input type="checkbox" id="show-missing"> إظهار العناصر غير المتوفرة أيضًا</label><div class="table-wrap"><table class="nut-table"><thead><tr><th>العنصر الغذائي</th><th>الكمية</th><th>الوحدة</th><th>طريقة القيمة</th></tr></thead><tbody id="nutrient-rows"></tbody></table></div></section><section class="detail-section"><h3>المصدر وحالة المراجعة</h3>${sourceBox(f, d)}</section><details><summary>عرض دليل المراجعة والتوثيق</summary><pre>${esc(JSON.stringify(d.review_evidence, null, 2))}</pre></details><div class="detail-actions"><button class="outline-btn" id="export-detail">↓ تنزيل الملف الغذائي</button><button class="outline-btn" id="copy-link">نسخ رابط الملف</button></div></div>`;
  // Whole-fruit count is a simpler default when a source-sized fruit exists.
  const fruit=d.portions.findIndex(p=>portionInfo(p,f).unit==='حبة' && /\bmedium\b/.test(p.label));
  if(fruit>=0){$("portion-select").value=String(fruit);$("quantity").value='1';}
  updateQuantity();
  $("quantity").addEventListener("input", updateQuantity);
  $("portion-select").addEventListener("change", () => {
    $("quantity").value = ["grams","ml"].includes($("portion-select").value) ? "100" : "1";
    updateQuantity();
  });
  $("nutrient-search").addEventListener("input", updateQuantity);
  $("show-missing").addEventListener("change", updateQuantity);
}
function updateQuantity() {
  const d = activeDetail,
    f = activeFood;
  if (!d || f.status !== "approved") return;
  try {
    const portion = $("portion-select").value;
    const selected=portion==='grams'||portion==='ml'?null:d.portions[Number(portion)];
    const volume=sourceVolume(d.portions);
    const grams=portion==='ml'?volumeGrams($("quantity").value,volume):decimalProduct($("quantity").value,selected?selected.grams:'1');
    if(portion==='grams'||portion==='ml'){
     $("quantity-label").textContent=portion==='ml'?'الكمية بالملليلتر':'الكمية بالجرام';
     $("reference-presets").innerHTML=presets('quantity',portion==='ml'?'ملليلتر':'جرام');
    }else{
     $("quantity-label").textContent='عدد المقادير المختارة';
     $("reference-presets").innerHTML=presets('quantity','×',[0.5,1,2]);
    }
    document.querySelectorAll('[data-portion]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.portion===portion)));
    $("portion-source").textContent=selected?'المقدار الأصلي في المرجع: '+selected.label:portion==='ml'?'التحويل من المقدار الموثق: '+volume.source_label+' = '+volume.source_grams+' جرام':'';
    if (Number(grams) > 1000000)
      throw Error("الكمية أكبر من الحد المتاح للعرض");
    const values = Object.fromEntries(d.nutrients.map((n) => [n.id, n.value])),
      ids = nutrientDefs.map((n) => n.id);
    const result = aggregate(
      [
        {
          grams,
          profile_id: d.profile_id,
          values,
          factors: Object.fromEntries(ids.map((n) => [n, "1"])),
        },
      ],
      ids,
    );
    $("quantity-caption").textContent = selected?`القيم لـ ${numeric($("quantity").value)} × ${portionInfo(selected,f).label} · ما يعادل ${numeric(grams)} جم حسب المرجع`:portion==='ml'?`القيم لـ ${numeric($("quantity").value)} ملليلتر · ما يعادل ${numeric(grams)} جم حسب المرجع`:`القيم لكمية ${numeric(grams)} جرام`;
    $("quantity-caption").style.color = "";
    [f.energy_id, "fdc:1003", "fdc:1004", f.carb_id].forEach(
      (n, i) =>
        ($("macro-" + i).textContent = numeric(result.nutrients[n]?.total)),
    );
    const query = normalize($("nutrient-search").value),
      observations = new Map(d.nutrients.map((n) => [n.id, n]));
    const definitions = nutrientDefs.filter(
      (n) =>
        ($("show-missing").checked || observations.has(n.id)) &&
        (!query ||
          normalize(
            (aliases[n.id] || n.name_ar || "") + " " + n.name_en + " " + n.id,
          ).includes(query)),
    );
    $("nutrient-count").textContent = "· " + definitions.length;
    $("nutrient-rows").innerHTML = definitions
      .map((n) => {
        const v = observations.get(n.id);
        const total = result.nutrients[n.id]?.total;
        return `<tr><td>${esc(aliases[n.id] || n.name_ar || n.name_en)}<small dir="ltr">${esc(n.name_en)}</small><small>${esc(n.definition)}</small></td><td class="numeric">${total == null ? "غير متوفر" : numeric(total)}</td><td dir="ltr">${esc(n.unit)}</td><td>${v ? esc(methodLabels[v.method] || v.method) : "—"}${v?.qualifier === "below_loq" ? "<small>أقل من حد القياس؛ ليس صفرًا</small>" : ""}</td></tr>`;
      })
      .join("");
  } catch (e) {
    $("quantity-caption").textContent = e.message;
    $("quantity-caption").style.color = "#ad664b";
    for (let i = 0; i < 4; i++) $("macro-" + i).textContent = "—";
    $("nutrient-rows").innerHTML = "";
  }
}
function renderSources() {
  const regionFlags = { US: "US", GB: "GB", EG: "EG", LB: "LB" };
  $("source-cards").innerHTML = Object.entries(meta.sources)
    .map(
      ([id, s]) =>
        `<article class="source-card"><span class="source-tag">${esc(regionFlags[s.region])} · ${esc(s.license)}</span><h2>${esc(s.title)}</h2><div class="source-num">${count(foods.filter((f) => f.source === id && ["approved", "estimated"].includes(f.status)).length)}</div><small>صنف منشور من هذا المرجع</small><p>${esc(s.scope)}</p><p>${esc(s.citation)}</p><a href="${esc(s.url)}" target="_blank" rel="noopener">المصدر الرسمي ↗</a><p><a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">شروط الترخيص ↗</a></p></article>`,
    )
    .join("");
}
function renderAbout() {
  const downloads = [
    ["planner_lifestyle_0.5.0.zip", "تحديث الخطة: مكونات البيت والرياضة والأنظمة", "محرك الحساب والواجهة واختبارات التحديث"],
    ["nutrition_egypt_names.sqlite.gz", "SQLite بالأسماء المراجعة", "فك ضغط gzip للحصول على قاعدة الموبايل"],
    ["nutrition_egypt_names_postgres.dump", "PostgreSQL بالأسماء المراجعة", "نسخة اختُبرت استعادتها"],
    ["CATALOG_REVIEW_AR.md", "تقرير مراجعة الأسماء والخطة", "المنجز والنواقص وحدود الإنتاج"],
    ["catalog_names_manifest.json", "بصمات تحديث الأسماء", "الأحجام وبصمات SHA256"],
    ["planner_meal_parts_1.3.zip", "تحديث الوجبات وتبديل أجزائها 1.3", "وجبات محددة وحساب البدائل لكل جزء"],
    ["MEAL_PARTS_REPORT_AR.md", "تقرير الوجبات وتبديل الأجزاء", "المصادر والاختبارات والحدود"],
    ["planner_meal_parts_manifest.json", "بصمات تحديث أجزاء الوجبة", "سلامة ملفات التحديث"],
    ["planner_egypt_everyday_1.2.zip", "تحديث الخطط والأسماء المصرية 1.2", "اختيارات يومية مألوفة وحساب من المكونات الفعلية"],
    ["EGYPT_EVERYDAY_REPORT_AR.md", "بحث الأسماء واختيارات الخطة", "المصادر المحلية والتغييرات وحدود التغطية"],
    ["planner_egypt_everyday_manifest.json", "بصمات تحديث الخطط المصرية", "سلامة ملفات التحديث"],
    ["planner_names_1.1.zip", "تحديث أسماء الوجبات 1.1", "أسماء أبسط مرتبطة بنوع الطعام وطريقة التحضير"],
    ["MEAL_NAMES_REPORT_AR.md", "تقرير مراجعة الأسماء", "58 مكونًا و227 اسم وجبة، مع الحفاظ على المصدر"],
    ["planner_names_manifest.json", "بصمات تحديث الأسماء", "سلامة ملفات التحديث"],
    ["planner_simple_ui_1.0.zip", "تحديث عرض الوجبات المبسّط", "كروت واضحة وتفاصيل اختيارية على الموبايل"],
    ["SIMPLE_MEALS_REPORT_AR.md", "تقرير العرض المبسّط", "ما تغير في الواجهة والاختبارات المنفذة"],
    ["planner_simple_ui_manifest.json", "بصمات تحديث العرض", "سلامة الملفات والقواعد المحفوظة"],
    ["planner_review_0.2.1.zip", "تحديث المراجعة 0.2.1", "إصلاح البدائل والحفظ، وحد الاستبعاد وترتيب شرح الحساب"],
    ["PLANNER_REVIEW_021_AR.md", "تقرير المراجعة الأخيرة", "الاختبارات الفعلية والدقة وحدود التحقق"],
    ["planner_review_021_manifest.json", "بصمات تحديث المراجعة", "SHA256 للملفات وقواعد البيانات المحفوظة"],
    ["PLANNER_QA_REPORT_AR.md", "مراجعة الجودة وإصلاحات التخطيط", "نتائج الاختبارات الأخيرة والاستبعادات والحالات الخاصة"],
    ["nutrition_egypt_regional.sqlite.gz", "SQLite الحالي — المناطق وبناء العضلات", "إصدار data.4، يعمل دون إنترنت؛ فك gzip للحصول على ملف SQLite"],
    ["nutrition_egypt_regional_postgres.dump", "PostgreSQL الحالي — التخطيط الموسع", "نسخة قابلة للاستعادة مع 227 تركيبة وجبة وتصنيفات المنطقة"],
    ["nutrition_planner_regional_0.2.0.zip", "تحديث التخطيط 0.2.0", "هدف العضلات وأيام التمرين والمناطق والتنوع؛ فوق المشروع الحالي"],
    ["PLANNER_REGIONAL_REPORT_AR.md", "تقرير المناطق وبناء العضلات", "المقارنة مع 44 واختبارات الحساب والبحث والموبايل"],
    ["planner_regional_manifest.json", "بصمات بيانات المناطق data.4", "SHA256 وأحجام قواعد البيانات وحزمة التحديث"],
    ["planner_final_review_0.1.2.zip", "إصلاحات المراجعة الأخيرة 0.1.2", "ملخصات صحيحة، كميات مشتريات دقيقة، وتحميل واستيراد أكثر ثباتًا"],
    ["PLANNER_FINAL_REVIEW_AR.md", "تقرير المراجعة الأخيرة", "الاختبارات التي أُعيد تشغيلها ونتائج التدقيق وملاحظاته"],
    ["planner_final_review_manifest.json", "بصمات المراجعة الأخيرة", "SHA256 وأحجام حزمة الإصلاح والتقرير"],
    ["planner_qa_patch.zip", "تحديث إصلاحات التخطيط 0.1.1", "ملفات التحسين فوق إضافة التخطيط الحالية؛ بيانات الأغذية كما هي"],
    ["planner_qa_manifest.json", "بصمات تحديث الجودة", "SHA256 وأحجام ملفات الإصلاح للاستخدام والتحقق"],
    ["nutrition_egypt_planner.sqlite.gz", "SQLite بالتخطيط · data.3", "مرجع الأغذية مع تصنيفات الوجبات والميزانية؛ فك gzip أولًا"],
    ["nutrition_planner_mvp_update.zip", "إضافة التخطيط للمشروع الحالي", "تحديث تدريجي للكود والموقع؛ قواعد البيانات متاحة منفصلة"],
    ["README_PLANNER_AR.md", "دليل الخطة الأسبوعية", "الحساب والميزانية والتسجيل والخصوصية وحدود التجربة"],
    ["PLANNER_INSTALL_AR.md", "تركيب إضافة التخطيط", "استخدام SQLite والمكتبة المستقلة وAPI"],
    ["PLANNER_TEST_REPORT.md", "اختبارات التخطيط الفعلية", "نتائج PostgreSQL وSQLite ومحرك الحساب والمتصفح"],
    ["planner_manifest.json", "بصمات ملفات التخطيط SHA256", "أحجام الملفات وإصدار البيانات للتحقق من التحميل"],
    ["nutrition_fitness_v0.6_mobile.zip", "حزمة الموبايل v0.6.0", "SQLite ومكتبة الحساب والمزامنة · نحو 10 MB"],
    ["nutrition_fitness_v0.6_server.zip", "حزمة السيرفر v0.6.0", "PostgreSQL وAPI وأدوات التثبيت · نحو 18 MB"],
    ["nutrition_egypt_v0.6.sqlite.gz", "SQLite الإصدار السابق · data.2", "ملف مستقل مضغوط gzip؛ فك الضغط قبل استخدامه"],
    ["download_full_release.html", "المشروع كاملًا v0.6.0", "أجزاء صغيرة مع أداة التجميع والتحقق من SHA256"],
    ["nutrition_fitness_v0.6_reports.zip", "تقارير الإصدار", "الجودة والاختبارات والتثبيت والمزامنة"],
    ["README_INSTALL_AR.md", "دليل التثبيت بالعربي", "التشغيل المحلي أو على السيرفر"],
    ["REMAINING_88_REPORT_AR.md", "تقرير الأسماء الـ88", "طريقة الحساب والبدائل وحدودها"],
    ["EGYPTIAN_FOODS_REPORT.md", "تقرير التغطية", "الأكل المصري المتاح وحدود البيانات"],
    ["manifest.json", "بيان الملفات المنشورة", "الأحجام وبصمات SHA256 للتحقق من سلامتها"],
  ];
  $("about-content").innerHTML =
    `<h2>معلومة تقدر ترجع لمصدرها</h2><p>الدليل يجمع ملفات غذائية مرجعية ووصفات تقريبية بمقادير معلنة. كل نتيجة توضح طريقة التحضير وأساس الحساب، علشان تقدر تختار الملف الأقرب لأكلك.</p><dl><dt>إصدار البرنامج</dt><dd><code>${esc(meta.software_version || "0.6.0")}</code></dd><dt>إصدار البيانات</dt><dd><code>${esc(meta.version)}</code></dd><dt>ملفات مرجعية</dt><dd>${count(meta.food_count)}</dd><dt>نماذج تقديرية منفصلة</dt><dd>${count(meta.estimated_recipe_count)}</dd><dt>بدائل بمرجع غذاء مختلف</dt><dd>${count(meta.proxy_estimate_count)}</dd><dt>حصص مرجعية</dt><dd>${count(meta.portion_count)}</dd></dl><h2>المرجع غير الوصفة التقريبية</h2><p>الملف المرجعي يخص غذاء محددًا في مصدر موثق. الوصفة التقريبية حساب من مكونات مرجعية بكميات افتراضية معلنة، وليست تحليلًا معمليًا للطبق. البديل المرجعي قد يختلف في نوع الطعام أو التحضير؛ اختلافاته ظاهرة قبل الأرقام.</p><h2>احسب بالحصة المناسبة</h2><ul><li>الجرام متاح عندما يكون أساس الملف ووزن الحصة معروفين.</li><li>الكوب والملعقة والحبة والقطعة متاحة عندما تكون حصصًا موثقة لنفس الطعام.</li><li>الحصص مجهولة الوزن والنماذج التقديرية تُحسب على أساسها الموضح، ولا تتحول إلى 100 جرام أو ملليلتر بدون بيانات كافية.</li><li>القيم الناقصة تظهر «غير متوفر»، ولا تُحسب صفرًا.</li></ul><details><summary>نطاق البيانات والمراجعة</summary><p>${count(meta.total_usable_count)} ملف ونموذج، تشمل نسخ التحضير. العدد ليس عدد أكلات مصرية مختلفة، والتغطية لا تشمل كل المطبخ المصري. مرجع أمريكي أو بريطاني لا يثبت متوسط التركيب المصري.</p><p>مراجعة المصادر والحساب آلية ومعلنة. لا توجد مراجعة اختصاصي بشري أو ادعاء دقة علمية 100%. اكتمال السعرات والماكروز لا يعني اكتمال الفيتامينات والمعادن. الوصفات المصرية ذات الوزن النهائي الموثق: ${meta.recipe_count}.</p></details><h2>توسعة تطبيق الفيتنس</h2><p>حزم v0.6.0 تضيف بيانات المستخدم والأهداف والخطط واليوميات والوصفات الخاصة والتمارين والمزامنة. الموقع يعرض الأغذية ويحسب كمياتها، ويضيف تخطيطًا أسبوعيًا وسجل أكل شخصيًا محفوظًا في المتصفح. تسجيل الحسابات والمزامنة بين الأجهزة وواجهات التمارين ليست منشورة هنا.</p><h2>تنزيل البيانات</h2><p>البحث والحساب في المتصفح. الحزمة المحلية تعمل بدون اتصال بالسيرفر.</p><div class="about-downloads">${downloads.map(([file, label, note]) => `<a href="https://egypt-nutrition-explorer.bolddog32.chatgpt.site/downloads/${file}"${file.endsWith(".html") ? "" : " download"}>${label}<small>${note}</small></a>`).join("")}</div>`;
}

function reset() {
  for (const id of [
    "search",
    "source-filter",
    "state-filter",
    "category-filter",
    "meal-filter",
    "budget-filter",
  ])
    $(id).value = "";
  $("sort").value = "relevance";
  $("quality-filter").value = "published";
  $("name-scope").value="ready";
  kind = "";
  render();
}
function resetEgypt() {
  for (const id of ["egypt-search", "egypt-group", "egypt-quality"])
    $(id).value = "";
  renderEgypt();
}
function movePage(delta) {
  page += delta;
  render(false);
  $("results-label").scrollIntoView({ block: "start", behavior: "instant" });
}
document.querySelector(".brand").addEventListener("click", (e) => {
  e.preventDefault();
  showView("egypt");
});
document
  .querySelectorAll(".nav")
  .forEach((b) => (b.onclick = () => showView(b.dataset.view)));
document.querySelectorAll("[data-view-link]").forEach(
  (b) =>
    (b.onclick = (e) => {
      e.preventDefault();
      showView(b.dataset.viewLink);
    }),
);
$("search").addEventListener(
  "input",
  debounce(() => render()),
);
for (const id of [
  "name-scope",
  "source-filter",
  "state-filter",
  "category-filter",
  "meal-filter",
  "budget-filter",
  "quality-filter",
  "sort",
])
  $(id).onchange = () => render();
document.querySelectorAll(".chip").forEach(
  (b) =>
    (b.onclick = () => {
      kind = b.dataset.kind;
      render();
    }),
);
$("previous-page").onclick = () => movePage(-1);
$("next-page").onclick = () => movePage(1);
$("reset-filters").onclick = reset;
$("reset-all").onclick = reset;
$("clear-search").onclick = () => {
  $("search").value = "";
  render();
  $("search").focus();
};
$("food-rows").addEventListener("click", (e) => {
  const b = e.target.closest("[data-food]");
  if (b) openFood(b.dataset.food);
});
$("close-dialog").onclick = () => $("food-dialog").close();
$("food-dialog").addEventListener("close", () => {
  document.body.classList.remove("dialog-open");
  dialogSequence++;
  if (!suppressDialogHistory) history.replaceState(null, "", "#" + currentView);
  suppressDialogHistory = false;
  if (
    lastTrigger?.isConnected &&
    !lastTrigger.closest("[hidden],dialog:not([open])")
  )
    lastTrigger.focus({ preventScroll: true });
});
$("food-dialog").addEventListener("click", (e) => {
  if (e.target === $("food-dialog")) {
    const r = $("food-dialog").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("food-dialog").close();
  }
});
$("detail-content").addEventListener("click", async (e) => {
  if (e.target.id === "close-invalid") $("food-dialog").close();
  if (e.target.id === "export-detail")
    download(
      "nutrition-" + activeFood.id + ".json",
      JSON.stringify(
        { ...activeFood, details: activeDetail, version: meta.version },
        null,
        2,
      ),
    );
  if (e.target.id === "copy-link") {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("تم نسخ رابط الملف");
    } catch {
      toast("يمكنك نسخ الرابط من شريط العنوان");
    }
  }
  if (e.target.id === "retry-detail") {
    chunkCache.delete(activeFood.id.slice(0, 2));
    openFood(activeFood.id, false);
  }
  const unit=e.target.closest('[data-portion]');
  if(unit){$("portion-select").value=unit.dataset.portion;$("portion-select").dispatchEvent(new Event('change'));}
  const preset = e.target.closest("[data-quantity-field]");
  if (preset) {
    const field = preset.dataset.quantityField;

    $(field).value = preset.dataset.quantityValue;
    $(field).dispatchEvent(new Event("input", { bubbles: true }));
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) &&
    !document.activeElement.isContentEditable &&
    !$("food-dialog").open
  ) {
    e.preventDefault();
    if (currentView === "egypt") $("egypt-search").focus();
    else {
      showView("foods");
      $("search").focus();
    }
  }
});
window.addEventListener("popstate", restoreRoute);
window.addEventListener("hashchange", restoreRoute);
$("download-results").onclick = () => {
  const header = [
    "المعرف",
    "الاسم",
    "الاسم الإنجليزي",
    "الحالة",
    "أساس القياس",
    "تفاصيل الكمية",
    "السعرات kcal",
    "البروتين g",
    "الدهون g",
    "الكربوهيدرات g",
    "معرف الكربوهيدرات",
    "المصدر",
  ];
  const rows = filtered.map((f) => [
    f.id,
    f.name,
    f.english,
    f.status,
    f.basis_label || "100 جرام",
    quantitySummary(f),
    ...(f.macros || [null, null, null, null]),
    f.carb_id || "",
    meta.sources[f.source].short,
  ]);
  download(
    "nutrition-search-" + meta.version + ".csv",
    "\ufeff" +
      [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
};

function quantitySummary(f) {
  const q = f.quantity_basis;
  if (q?.type !== "ingredient_formulation")
    return "القيم لكل " + (q?.display_label || f.basis_label || "100 جرام");
  const fraction =
    Number(q.batch_divisor) === 1
      ? "المقادير التالية"
      : "1/" + q.batch_divisor + " من المقادير التالية (تقسيم حسابي)";
  return (
    "القيم لـ " +
    fraction +
    ": " +
    q.input_ingredients.map((i) => i.grams + " جم " + i.name_ar).join(" + ") +
    ". وزن الناتج بعد التحضير غير موثّق؛ لا تمثل طبقًا أو قطعة محددة."
  );
}

function unitSummary(f){
 if(f.status!=='approved'||!f.portion_units?.length)return '';
 return `<p class="available-units">الوحدات المتاحة: ${esc(f.basis==='reference_serving'?'': 'جرام · ')}${esc(f.portion_units.join(' · '))}</p>`;
}
function portionButtons(f,d){
 return `<section class="household-picker" aria-label="اختيار وحدة القياس"><h3>اختار الوحدة المناسبة</h3><p>اختار المقدار المكتوب، وبعدها اكتب كام واحد أكلت.</p><div class="portion-buttons"><button type="button" data-portion="grams">جرام</button>${sourceVolume(d.portions)?'<button type="button" data-portion="ml">ملليلتر</button>':''}${d.portions.map((p,i)=>({p,i,info:portionInfo(p,f)})).filter(x=>x.info.household).map(({p,i,info})=>`<button type="button" data-portion="${i}"><span>${esc(info.label)}</span><small>${numeric(p.grams)} جم حسب المرجع</small></button>`).join('')}</div></section>`;
}
function preview(f) {
  const q = qualityLabel(f);
  return `<div class="profile-preview ${q.className === "proxy" ? "proxy-preview" : ""}">${qualityBadge(f)}<span class="preview-name">${esc(f.name)}</span><div class="preview-basis">${esc(quantitySummary(f))}</div>${unitSummary(f)}${planningBadges(f)}${q.className === "proxy" ? '<p class="proxy-note">القيم لمرجع غذاء مختلف؛ اقرأ الاختلافات.</p>' : ""}<div class="preview-energy"><strong>${numeric(f.macros[0])}</strong><span>سعر حراري · kcal</span></div><div class="preview-macros">${[
    ["بروتين", 1],
    ["دهون", 2],
    ["كربوهيدرات", 3],
  ]
    .map(
      ([label, i]) =>
        `<div><span>${label}</span><strong>${numeric(f.macros[i])}</strong> g</div>`,
    )
    .join(
      "",
    )}</div><button type="button" class="preview-open" data-food="${f.id}" aria-label="تفاصيل وحساب ${esc(f.name)}"><span>${q.className === "proxy" ? "البديل والاختلافات" : "التفاصيل وحساب الكمية"}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg></button></div>`;
}
function renderEgypt(resetPage = true) {
  if (!egyptCatalog || !meta || !foods) return;
  if (resetPage) egyptShown = 24;
  const query = $("egypt-search").value,
    group = $("egypt-group").value,
    quality = $("egypt-quality").value;
  if ($("egypt-group").options.length === 1) {
    const groups = [
      ...new Set(egyptCatalog.map((f) => groupLabel(f.group_label))),
    ].sort((a, b) => a.localeCompare(b, "ar"));
    $("egypt-group").innerHTML += groups
      .map((g) => `<option value="${esc(g)}">${esc(g)}</option>`)
      .join("");
  }
  const matches = catalogMatches(egyptCatalog, foods, {
    query,
    group,
    quality,
  });
  $("egypt-summary").textContent =
    `${count(meta.reference_catalog_count)} اسمًا مرتبطًا بمرجع، و${count(meta.estimated_recipe_count)} نموذجًا حسابيًا، منها ${count(meta.proxy_estimate_count)} بديلًا بمرجع مختلف. التوثيق يخص كل ملف مستقلًا.`;
  $("egypt-catalog-count").textContent =
    `${count(egyptCatalog.length)} اسمًا في الدليل`;
  $("egypt-results").textContent =
    `${count(matches.length)} نتيجة${query ? " لبحث «" + query + "»" : ""}`;
  $("clear-egypt-search").hidden = !query;
  $("reset-egypt").hidden = !query && !group && !quality;
  document
    .querySelectorAll(".quick-search")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(normalize(b.dataset.query) === normalize(query)),
      ),
    );
  $("egypt-cards").innerHTML =
    matches
      .slice(0, egyptShown)
      .map(
        (f) =>
          `<article class="egypt-card"><div class="card-top"><small>${esc(f.display_group)}</small><span class="card-icon" aria-hidden="true">${icon(f.profiles[0])}</span></div><h2>${esc(f.name_ar)}</h2>${f.profiles.slice(0, 2).map(preview).join("")}${f.profiles.length > 2 ? `<details class="variant-details"><summary>عرض ${count(f.profiles.length - 2)} ملفات ونسخ أخرى</summary>${f.profiles.slice(2).map(preview).join("")}</details>` : ""}<details class="card-evidence"><summary>المصادر وحدود المطابقة</summary>${(f.approximation_relations || []).map((l) => `<p>${esc(l.reason)}</p>`).join("")}<p>${esc(f.missing_evidence)}</p>${f.evidence.map((e, i) => `<a href="${esc(e.url)}" target="_blank" rel="noopener">مرجع هوية الأكلة ${i + 1} ↗</a>`).join("<br>")}<p>مصدر الاسم لا يثبت المقادير أو القيم. كل ملف غذائي يحمل مصدره وطريقة حسابه.</p></details></article>`,
      )
      .join("") ||
    `<div class="empty"><h3>مفيش نتيجة بالاختيارات دي</h3><p>جرّب اسمًا أقصر أو ابحث في كل الأطعمة.</p><div class="empty-actions"><button class="outline-btn" id="egypt-empty-reset">مسح البحث والفلاتر</button><button class="outline-btn" id="search-all-foods">البحث في كل الأطعمة</button></div></div>`;
  $("egypt-cards").setAttribute("aria-busy", "false");
  $("egypt-more").hidden = matches.length <= egyptShown;
  $("egypt-more").textContent =
    `عرض المزيد · ${count(Math.max(0, matches.length - egyptShown))} نتيجة متبقية`;
  if ($("egypt-empty-reset")) $("egypt-empty-reset").onclick = resetEgypt;
  if ($("search-all-foods"))
    $("search-all-foods").onclick = () => {
      reset();
      $("search").value = query;
      render();
      showView("foods");
      $("search").focus();
    };
}
$("egypt-search").addEventListener(
  "input",
  debounce(() => renderEgypt()),
);
for (const id of ["egypt-group", "egypt-quality"])
  $(id).addEventListener("change", () => renderEgypt());
$("egypt-more").onclick = () => {
  egyptShown += 24;
  renderEgypt(false);
};
$("clear-egypt-search").onclick = () => {
  $("egypt-search").value = "";
  renderEgypt();
  $("egypt-search").focus();
};
$("reset-egypt").onclick = resetEgypt;
document.querySelectorAll(".quick-search").forEach(
  (b) =>
    (b.onclick = () => {
      $("egypt-search").value = b.dataset.query;
      renderEgypt();
    }),
);
$("egypt-cards").addEventListener("click", (e) => {
  const b = e.target.closest("[data-food]");
  if (b) openFood(b.dataset.food);
});

try {
  [meta, foods, nutrientDefs, egyptCatalog] = await Promise.all(
    [
      "/data/meta.json",
      "/data/index.json",
      "/data/nutrients.json",
      "/data/egypt_catalog.json",
    ].map((p) =>
      fetch((location.hostname === "example.test" ? "" : ".") + p).then((r) => {
        if (!r.ok) throw Error("تعذر تحميل قاعدة البيانات");
        return r.json();
      }),
    ),
  );
  for (const f of foods) f.searchNames = f.names.map(normalize);
  $("food-count").textContent = count(
    meta.total_usable_count || meta.food_count,
  );
  $("dish-count").textContent = count(
    meta.dish_count +
      (meta.estimated_recipe_count || 0) -
      (meta.estimated_beverage_count || 0),
  );
  $("beverage-count").textContent = count(
    meta.beverage_count + (meta.estimated_beverage_count || 0),
  );
  $("portion-count").textContent = count(meta.portion_count);
  $("approved-total").textContent = count(
    meta.total_usable_count || meta.food_count,
  );
  $("side-version").textContent = meta.version;
  $("footer-version").textContent = meta.version;
  $("source-filter").innerHTML += [...Object.entries(meta.sources)]
    .map(([id, s]) => `<option value="${id}">${esc(s.short)}</option>`)
    .join("");
  $("category-filter").innerHTML += meta.categories
    .filter((c) => c.parent_id)
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name_ar)}</option>`)
    .join("");
  renderSources();
  renderAbout();
  render();
  renderEgypt();
  $("load-status").hidden = true;
  const hash = location.hash.slice(1);
  if (hash.startsWith("food/")) {
    showView("foods", false);
    openFood(hash.slice(5), false);
  } else
    showView(
      ["egypt", "foods", "sources", "about", "planner"].includes(hash) ? hash : "egypt",
      false,
    );
  // General browsing is ready even if the separate planning library stalls.
  await mountPlanner({root:$("planner-view"),foods,detailLoader:loadPlannerDetail,toast});
} catch (e) {
  $("load-status").hidden = false;
  $("load-status").classList.add("error");
  $("load-status").innerHTML =
    'تعذر تحميل البيانات. <button class="outline-btn" id="retry-load">إعادة المحاولة</button>';
  $("retry-load").onclick = () => location.reload();
  $("egypt-results").textContent = "تعذر تحميل البيانات";
  $("egypt-cards").innerHTML =
    '<div class="empty"><h3>تعذر تحميل دليل الأكل</h3><p>راجع اتصالك واضغط إعادة المحاولة.</p></div>';
  $("egypt-cards").setAttribute("aria-busy", "false");
  $("results-label").textContent = "تعذر تحميل البيانات";
  $("food-rows").innerHTML =
    `<tr><td colspan="7"><div class="error">${esc(e.message)}. أعد تحميل الصفحة للمحاولة مرة أخرى.</div></td></tr>`;
}

function renderServingDetail(f, d) {
  $("detail-content").innerHTML =
    `<div class="detail-body"><div class="detail-tags"><span>ملف غذائي بالحصة المرجعية</span><span>${esc(meta.sources[f.source].regionLabel)}</span></div><h2 id="detail-title">${esc(f.name)}</h2><p class="detail-en">${esc(f.name_presentation?.variant_label || "")}</p><details class="source-original-title"><summary>اسم الطعام الأصلي في المرجع</summary><p dir="auto">${esc(f.english || f.name_presentation?.original_name || f.name)}</p></details>${planningBadges(f)}<div class="egypt-banner"><strong>القيم لكل ${esc(f.basis_label)}</strong><p>وزن هذه المغرفة غير مذكور في المرجع. الحساب بعدد المغارف فقط، ولا يتوفر تحويل إلى الجرام أو الملليلتر. الحشو غير موضح في المرجع للعادية؛ نسخة العدس محددة.</p></div><div class="quantity-box"><label>عدد المغارف المرجعية<input id="serving-count" type="number" min="0.001" step="any" value="1"></label><p id="quantity-caption"></p></div>${presets("serving-count", "مغرفة")}<div class="detail-macros">${["السعرات", "البروتين", "الدهون", "الكربوهيدرات"].map((label, i) => `<div class="detail-macro"><span>${label}</span><strong id="macro-${i}">—</strong><small>${i ? "جرام" : "kcal"}</small></div>`).join("")}</div><p class="unit-note">القيم ذات النجمة بالمصدر إجمالي غير مكتمل؛ تظهر بدون رقم. تعريف الكربوهيدرات التفصيلي غير مذكور، ومحفوظ بمعرّف مستقل.</p><section class="detail-section"><h3>العناصر الغذائية للحصة المختارة</h3><div class="nutrient-table-wrap"><table><thead><tr><th>العنصر</th><th>القيمة</th><th>الوحدة</th><th>طريقة المصدر</th></tr></thead><tbody id="serving-nutrients"></tbody></table></div></section>${sourceBox(f, d)}<div class="detail-actions"><button class="outline-btn" id="export-detail">↓ تنزيل الملف</button><button class="outline-btn" id="copy-link">نسخ الرابط</button></div></div>`;
  const refresh = () => {
    try {
      const v = $("serving-count").value;
      if (!/^\d+(?:\.\d+)?$/.test(v) || Number(v) <= 0)
        throw Error("اكتب عددًا موجبًا");
      const values = Object.fromEntries(
        d.nutrients.map((n) => [n.id, n.value]),
      );
      const ids = [f.energy_id, "fdc:1003", "fdc:1004", f.carb_id];
      const result = referenceTotals(
        [{ scale: v, values }],
        d.nutrients.map((n) => n.id),
      );
      ids.forEach(
        (id, i) =>
          ($("macro-" + i).textContent = numeric(result.nutrients[id].total)),
      );
      $("quantity-caption").textContent = `القيم لعدد ${v} من ${f.basis_label}`;
      $("serving-nutrients").innerHTML = d.nutrients
        .map((n) => {
          const def = nutrientDefs.find((x) => x.id === n.id) || {};
          return `<tr><td>${esc(aliases[n.id] || def.name_ar || def.name_en || n.id)}</td><td>${numeric(result.nutrients[n.id].total)}</td><td>${esc(def.unit || "")}</td><td>${esc(methodLabels[n.method] || n.method)}</td></tr>`;
        })
        .join("");
    } catch (e) {
      $("quantity-caption").textContent = e.message;
      for (let i = 0; i < 4; i++) $("macro-" + i).textContent = "—";
      $("serving-nutrients").innerHTML = "";
    }
  };
  $("serving-count").addEventListener("input", refresh);
  refresh();
}

function renderEstimateDetail(f, d) {
  const ids = ["fdc:1008", "fdc:1003", "fdc:1004", "fdc:1005"];
  $("detail-content").innerHTML =
    `<div class="detail-body"><span class="estimate-badge">${d.estimate_type === "reference_proxy" ? "بديل حسابي · عدم يقين مرتفع" : "تقريبي · وصفة محسوبة وليست تحليلًا معمليًا"}</span><h2 id="detail-title">${esc(f.name)}</h2>${planningBadges(f)}<div class="egypt-banner"><strong>${esc(d.basis_label)}</strong>${d.estimate_type === "reference_proxy" ? `<p><strong>القيم تخص مرجعًا بديلًا وقد يختلف نوع الطعام أو الحيوان أو طريقة الحفظ. لا تثبت تركيب ${esc(d.target_catalog_name || f.name)}. اقرأ اسم المرجع والاختلافات قبل استخدام الرقم.</strong></p><p>${d.notes.map(esc).join(" · ")}</p>` : ""}<p>الأرقام تخص المقادير الموضحة فقط. كمياتها نموذج تقريبي قابل للتعديل، وليست متوسطًا للأكلة أو وزن طبق منزلي مقاسًا. لا يتوفر تحويل إلى 100 جرام أو ملليلتر.</p></div><div class="quantity-box"><label>مضاعف المقادير المحددة<input id="estimate-count" type="number" min="0.001" max="1000" step="any" value="1"></label><p>القيم الأساسية تخص ${Number(d.servings) === 1 ? "كل المقادير" : "1/" + esc(d.servings) + " من المقادير"} في جدول المكونات. معامل التقسيم حسابي؛ لا يعني وزن طبق أو قطعة جاهزة.</p><p id="estimate-error" role="status"></p></div>${presets("estimate-count", "×")}<section id="estimate-quantity" class="quantity-definition" aria-live="polite"></section><div class="detail-macros">${["السعرات", "البروتين", "الدهون", "الكربوهيدرات"].map((label, i) => `<div class="detail-macro"><span>${label}</span><strong id="estimate-macro-${i}">—</strong><small>${i ? "جرام" : "kcal"}</small></div>`).join("")}</div><section class="detail-section"><h3>المكونات ومقادير الدفعة كاملة</h3><p>الجرامات للجزء الصالح للأكل في الحالة المكتوبة. غيّر السكر واللبن والزيت وباقي المقادير لتناسب وصفتك؛ صفر يحذف المكوّن من الحساب.</p><div class="estimate-ingredients">${d.ingredients.map((i) => `<label class="estimate-ingredient"><span>${esc(i.name_ar)}<small>${esc(i.source_title)} · FDC ${esc(i.external_id)}<br><a href="https://fdc.nal.usda.gov/food-details/${esc(i.external_id)}/nutrients" target="_blank" rel="noopener">مرجع المكوّن ↗</a></small></span><span><input data-ingredient="${esc(i.key)}" type="number" min="0" max="100000" step="any" value="${esc(i.grams)}" aria-label="جرامات ${esc(i.name_ar)}"> جرام</span></label>`).join("")}</div></section><section class="detail-section"><h3>طريقة التحضير والنطاق</h3><p>${esc(d.preparation)}</p><ul>${d.assumptions.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><p>الكربوهيدرات بالفرق حسب مراجع USDA، وتشمل الألياف. الفيتامينات والمعادن بعد الطبخ غير مقدرة؛ القيم المفقودة لا تعامل كصفر. عوامل طاقة المكونات محفوظة بمعرفاتها الأصلية.</p></section><section class="detail-section"><h3>عناصر إضافية محسوبة</h3><p id="estimate-extra"></p></section><div class="detail-actions"><button class="outline-btn" id="export-detail">↓ تنزيل الوصفة والأدلة</button><button class="outline-btn" id="copy-link">نسخ الرابط</button></div></div>`;
  const refresh = () => {
    try {
      const weights = Object.fromEntries(
        [...document.querySelectorAll("[data-ingredient]")].map((x) => [
          x.dataset.ingredient,
          x.value,
        ]),
      );
      const r = estimateTotals(d, $("estimate-count").value, weights);
      const q = r.quantity_basis;
      $("estimate-quantity").innerHTML =
        `<h3>الكمية التي تخصها الأرقام الآن</h3><ul>${q.ingredients
          .filter((i) => Number(i.allocated_grams) > 0)
          .map(
            (i) =>
              `<li><strong>${esc(Number(i.allocated_grams).toLocaleString("en", { maximumFractionDigits: 8 }))} جم</strong> ${esc(i.name_ar)} <small>(${esc(stateLabels[i.state] || i.state)})</small></li>`,
          )
          .join(
            "",
          )}</ul><p>مجموع أوزان المكونات للحساب: ${esc(Number(q.input_mass_g).toLocaleString("en", { maximumFractionDigits: 8 }))} جم. <strong>ده وزن المكونات في حالاتها المكتوبة، وليس وزن الأكلة بعد التحضير.</strong></p><p>وزن الناتج وعدد القطع أو الأكواب غير موثّقين؛ حساب 100 جم أو حصة منزلية غير متاح.</p>`;
      ids.forEach(
        (id, i) =>
          ($("estimate-macro-" + i).textContent = numeric(r.nutrients[id])),
      );
      $("estimate-extra").textContent = [
        "fdc:1079",
        "fdc:2000",
        "fdc:1258",
        "fdc:1253",
      ]
        .map(
          (id) =>
            `${aliases[id]}: ${numeric(r.nutrients[id])} ${id === "fdc:1253" ? "mg" : "g"}`,
        )
        .join(" · ");
      $("estimate-error").textContent = "";
      activeDetail.selected_configuration = {
        count: $("estimate-count").value,
        ingredient_grams: weights,
        result: r,
      };
    } catch (e) {
      $("estimate-error").textContent =
        "اكتب كميات مكونات غير سالبة ومضاعفًا موجبًا.";
      for (let i = 0; i < 4; i++) $("estimate-macro-" + i).textContent = "—";
      $("estimate-extra").textContent = "";
      $("estimate-quantity").textContent =
        "الكمية غير صالحة؛ لا توجد نتيجة قابلة للاستخدام.";
      delete activeDetail.selected_configuration;
    }
  };
  $("estimate-count").addEventListener("input", refresh);
  document
    .querySelectorAll("[data-ingredient]")
    .forEach((x) => x.addEventListener("input", refresh));
  refresh();
}

async function loadPlannerDetail(id){const chunk=id.slice(0,2);try{if(!chunkCache.has(chunk))chunkCache.set(chunk,fetch((location.hostname==="example.test"?"":".")+'/data/details/'+chunk+'.json').then(r=>{if(!r.ok)throw Error('تعذر تحميل التفاصيل');return r.json();}));const details=await chunkCache.get(chunk);if(!details[id])throw Error('تفاصيل الملف غير متاحة');return details[id];}catch(e){chunkCache.delete(chunk);throw e;}}
