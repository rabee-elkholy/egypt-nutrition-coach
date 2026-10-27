import {esc,round,macroLine,ingredientLine} from './coaching-view-helpers.mjs';
import {SLOTS,localDate,dateOffset} from './coaching-shared.mjs';
import {displayMealName} from './meal-presentation.mjs';




export function nutritionView({state,diaryDate}){
 function waterHTML(todayStr){
  const hyd=state.progressSummary?.hydration||{todayCups:0,targetCups:10,todayLiters:0,targetLiters:2.5,isWorkoutDay:false,adherence7d:0};
  const waterRow=(state.waterLogs||[]).find(w=>w.date===todayStr);
  const curCups=waterRow?waterRow.cups:(hyd.todayCups||0);
  const targetCups=hyd.targetCups||10;
  const curLiters=Math.round(curCups*0.25*100)/100;
  const targetLiters=hyd.targetLiters||Math.round(targetCups*0.25*10)/10;
  const pct=Math.min(100,Math.round((curCups/Math.max(1,targetCups))*100));
  const done=curCups>=targetCups;
  return `<section id="water-tracker" class="coach-card" style="background:linear-gradient(135deg,#f2f9ff 0%,#e6f3fc 100%);border-color:#b8dcf5">
   <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
    <h3 style="margin:0;color:#0d47a1">💧 شرب المية النهاردة (${todayStr})</h3>
    <span style="font-size:12px;padding:4px 10px;border-radius:999px;font-weight:700;background:${done?'#d7f5e2':'#fff'};color:${done?'#1b4332':'#0d47a1'};border:1px solid #b8dcf5">${done?'✅ قفّلت هدف المية اليوم!':`${curCups} / ${targetCups} كوب (${curLiters} من ${targetLiters} لتر)`}</span>
   </div>
   <p style="margin:6px 0;font-size:13px;color:#1b3a57">${hyd.isWorkoutDay?'🏋️ لأن النهاردة يوم تمرين، أخصائي التغذية زود هدفك كوبايتين مية (+0.5 لتر) كتقدير إضافي للسوائل؛ احتياجك الفعلي حسب العرق والجو وتعليمات مختصك.':'وزّع الشرب على اليوم حسب هدفك؛ المية مش علاج لاحتباس السوائل ولا وسيلة مباشرة لحرق الدهون.'}</p>
   <div class="water-progress-track" aria-hidden="true">
    <div class="water-progress-fill" style="width:${pct}%"></div>
   </div>
   <div class="sim-chip-grid" style="margin-top:10px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
    <button type="button" class="sim-chip water-btn" data-water-add="1" data-date="${todayStr}">➕ كوب مية (250 مل)</button>
    <button type="button" class="sim-chip water-btn" data-water-add="2" data-date="${todayStr}">➕ زجاجة (500 مل)</button>
    ${!done?`<button type="button" class="sim-chip water-btn" data-water-set="${targetCups}" data-date="${todayStr}">✅ شربت هدفي كله (${targetCups} كوب)</button>`:''}
    ${curCups>0?`<button type="button" class="sim-chip secondary water-btn" data-water-add="-1" data-date="${todayStr}">➖ تقليل كوب</button>`:''}
   </div>
  </section>`;
 }
 function diaryHTML(){
  const entries=(state.foodEntries||[]).filter(x=>x.date===diaryDate),record=state.foodLogs.find(x=>x.date===diaryDate);
  const total=k=>!entries.length&&record?.source!=='entries'?record?.[k]??null:entries.length&&entries.every(e=>e.snapshot.values[k]!=null)?entries.reduce((s,e)=>s+Number(e.snapshot.values[k]),0):null;
  return `<section id="food-diary" class="coach-card">
   <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
    <h3 style="margin:0">🍽️ اللي أكلته النهاردة (${diaryDate})</h3>
    <span style="font-size:12px;padding:4px 10px;border-radius:999px;font-weight:700;background:${record?.complete?'#e6f4ea':'#f0f5f2'};color:#1b4332">${record?.complete?'✅ تسجيل اليوم مؤكد — الالتزام بيتحسب بشكل منفصل':'⏳ محتاج تأكيد إنك سجلت كل أكلك'}</span>
   </div>
   <div class="coach-metrics compact" style="margin-top:10px">
    <div><strong>${round(total('energy'))}</strong> سعر مسجل</div>
    <div><strong>${round(total('protein'))}</strong> جم بروتين</div>
   </div>
   ${record&&record.source!=='entries'?`<button id="switch-diary-mode" class="secondary">تعديل وجبات اليوم بالتفصيل</button>`:''}
   ${entries.map(e=>`<article class="diary-row"><div><strong>${esc(displayMealName(e.snapshot))}</strong><p>${SLOTS[e.slot]} · ${macroLine(e.snapshot)}</p></div><button class="secondary" data-delete-food="${e.id}" aria-label="حذف ${esc(displayMealName(e.snapshot))}">حذف</button></article>`).join('')||'<p style="margin:6px 0"><small>علّم على وجباتك من فوق بضغطة على «✓ أكلت الوجبة» وهتتحسب هنا تلقائياً.</small></p>'}
   <details style="margin-top:8px"><summary>➕ أكلت صنف إضافي أو وجبة من بره الخطة؟</summary>
    <label>تاريخ اليوم <input id="diary-date" type="date" min="${dateOffset(state.serverDate||localDate(),-90)}" max="${state.serverDate||localDate()}" value="${diaryDate}"></label>
    <form id="food-search"><input name="q" aria-label="اسم الصنف" placeholder="ابحث عن صنف: فول، بيض، فراخ، أرز…"><button>بحث</button></form>
    <div id="food-search-results"></div>
    <hr style="border:0;border-top:1px solid #e2ece6;margin:12px 0">
    <form id="manual-food" data-diary-date="${diaryDate}" class="coach-grid">
     <label>اسم الأكلة أو المشروب <input name="name" maxlength="120" placeholder="مثال: قهوة بالحليب / سناك" required></label>
     <label>الوجبة <select name="slot">${Object.entries(SLOTS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
     <label>السعرات التقريبية <input name="energy" type="number" min="1" max="10000" required></label>
     <label>البروتين بالجرام (اختياري) <input name="protein" type="number" step="0.1" min="0" max="2000"></label>
     <button>إضافة لسجل اليوم</button>
    </form>
   </details>
    ${entries.length?`<div style="margin-top:10px"><button type="button" id="toggle-complete" class="secondary">${record?.complete?'إعادة فتح اليوم للتعديل':'✅ أؤكد إني سجلت كل أكلي النهارده'}</button></div>`:''}
  </section>`;
 }
 function mealHTML(m,date){
  const recorded=(state.foodEntries||[]).some(e=>e.mealId===m.id&&e.date===date),canLog=date<=(state.serverDate||localDate());
  return `<article class="meal-card">
   <h3>${esc(SLOTS[m.slot]||'وجبة')}: ${esc(displayMealName(m.snapshot))}</h3>
   <p><strong>${macroLine(m.snapshot)}</strong></p>
   <ul>${m.snapshot.ingredients.map(ingredientLine).join('')}</ul>
   <div class="meal-actions">
    ${recorded?'<span class="coach-success">✓ متسجلة في يومك</span>':canLog?`<form class="planned-food" data-meal="${m.id}" data-date="${date}" data-slot="${m.slot}" data-energy="${Number(m.snapshot.values.energy)||0}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%"><select name="quantity" aria-label="الكمية" style="flex:1;min-width:120px;margin:0"><option value="1">أكلت الوجبة كاملة (100%)</option><option value="0.75">ثلاثة أرباع الوجبة (75%)</option><option value="0.5">نصف الوجبة (50%)</option><option value="1.5">حصة ونصف (150%)</option></select><button style="margin:0">✓ أكلت الوجبة</button></form>`:'<small>متاح في يومه</small>'}
    ${!recorded&&date>=(state.serverDate||localDate())?`<button class="secondary" data-meal-alt="${m.id}">🔄 تبديل بأكلة تانية</button>`:''}
   </div>
  </article>`;
 }
 return {waterHTML,diaryHTML,mealHTML};
}
