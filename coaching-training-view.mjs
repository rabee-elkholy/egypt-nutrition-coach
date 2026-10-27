import {esc,round,days,regionNames,defaultStartKg} from './coaching-view-helpers.mjs';
import {FOCUS_LABELS,localDate,dateOffset,effectiveSets} from './coaching-shared.mjs';

import {usesKg,loadLabel,setSummary} from './exercise-load.mjs';



export function trainingView({state,editingExercises}){
 function exerciseHTML(e,day){
  const todayStr=state.serverDate||localDate();
  const adjustment=state.sessionAdjustment&&Date.parse(state.sessionAdjustment.expiresAt)>Date.parse(state.serverNow||new Date().toISOString())?state.sessionAdjustment:null;
  const sets=effectiveSets(state,e,todayStr,Date.parse(state.serverNow||new Date().toISOString()));
  const history=state.workoutLogs.filter(l=>l.exerciseId===e.id&&(e.progressionKey?l.progressionKey===e.progressionKey:l.planId===state.workoutPlan.id)).sort((a,b)=>(a.date||a.at.slice(0,10)).localeCompare(b.date||b.at.slice(0,10))||Date.parse(a.at)-Date.parse(b.at));
  const todayLog=history.filter(l=>(l.date||l.at.slice(0,10))===todayStr&&l.dayIndex===day.dayIndex).at(-1);
  const last=todayLog||history.at(-1);
  const loggedToday=!!todayLog;
  const prevLog=loggedToday?history.filter(l=>(l.date||l.at.slice(0,10))<todayStr).at(-1):last;
  const editKey=todayStr+':'+day.dayIndex+':'+e.id;
  const editorOpen=!loggedToday||editingExercises.has(editKey);
  const regions=e.regions||[];const blocked=regions.some(r=>['hold','caution'].includes(state.recovery?.muscles?.[r]?.status));
  const weighted=usesKg(e);
  const startKg=defaultStartKg(e,state);
  const suggestedKg=!weighted?0:e.suggestedKg!=null&&state.recovery?.progressionAllowed&&!blocked?e.suggestedKg:(prevLog?.sets?.[0]?.kg??startKg);
  const prevReps=prevLog?.sets?.[0]?.reps;
  const suggestedReps=e.suggestedKg!=null&&state.recovery?.progressionAllowed&&!blocked?e.repMin:(prevReps!=null?Math.min(e.repMax,Math.max(e.repMin,prevReps+(prevLog?.sets?.[0]?.rir>=1&&prevReps<e.repMax?1:0))):Math.round((e.repMin+e.repMax)/2));
  const activeSetsCount=loggedToday&&last?.sets?.length?last.sets.length:sets;
  const defaultEffort=last?.sets?.[0]?.rir!=null?String(last.sets[0].rir):String(e.rir);
  const stepKg=2.5;
  let comparisonNote='';
  if(loggedToday&&prevLog){
   const curAvgKg=Math.round((last.sets.reduce((s,x)=>s+(Number(x.kg)||0),0)/last.sets.length)*10)/10;
   const prevAvgKg=Math.round((prevLog.sets.reduce((s,x)=>s+(Number(x.kg)||0),0)/prevLog.sets.length)*10)/10;
   const curAvgReps=Math.round(last.sets.reduce((s,x)=>s+(Number(x.reps)||0),0)/last.sets.length);
   const prevAvgReps=Math.round(prevLog.sets.reduce((s,x)=>s+(Number(x.reps)||0),0)/prevLog.sets.length);
   if(weighted&&curAvgKg>prevAvgKg)comparisonNote=`${e.loadMode==='assisted'?'وزن المساعدة':'الحمل'} اتغير من ${prevAvgKg} إلى ${curAvgKg} كجم — قارن التغيير مع العدات وجودة الحركة.`;
   else if(weighted&&curAvgKg<prevAvgKg)comparisonNote=`${e.loadMode==='assisted'?'وزن المساعدة':'الحمل'} قل من ${prevAvgKg} إلى ${curAvgKg} كجم — سبب التغيير بيتراجع مع العدات والمجهود.`;
   else if(curAvgReps>prevAvgReps)comparisonNote=`💪 تطور ممتاز! زودت عداتك من ${prevAvgReps} إلى ${curAvgReps} عدة${weighted?` بنفس ${e.loadMode==='assisted'?'وزن المساعدة':'الوزن'} (${curAvgKg} كجم)`:' بوزن الجسم أو المقاومة المعتادة'}.`;
  }
  return `<article class="meal-card exercise-card ${loggedToday?'exercise-saved':''}" data-exercise-card="${e.id}">
   <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
    <h3 dir="auto" style="margin:0">${esc(e.name)}</h3>
    <span style="font-size:12px;background:#e6f2ec;color:#1b4332;padding:4px 8px;border-radius:8px;font-weight:700">${esc(regionNames(regions))}</span>
   </div>
   ${loggedToday?`<div class="exercise-done-summary"><span class="exercise-done-mark" aria-hidden="true">✓</span><div><strong>تم تسجيل التمرين</strong><p>${last.sets.length} مجموعات · ${setSummary(e,last.sets)}</p>${last.sets.some(x=>x.pain)?'<small class="exercise-pain">⚠ ألم مسجل — راجع حالتك قبل تكرار الحركة</small>':''}</div><button type="button" class="secondary exercise-edit" data-edit-exercise="${esc(editKey)}" aria-expanded="${editorOpen}" aria-controls="exercise-editor-${day.dayIndex}-${e.id.replace(/[^a-z0-9]/gi,'-')}"><span aria-hidden="true">✎</span> ${editorOpen?'إغلاق':'تعديل'}</button></div>`:''}
   <div class="exercise-editor" id="exercise-editor-${day.dayIndex}-${e.id.replace(/[^a-z0-9]/gi,'-')}" ${editorOpen?'':'hidden'}>
   <div class="prescription-box" style="margin:8px 0;padding:10px 12px;background:#f4faf6;border:1px solid #cce3d6;border-radius:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
     <strong style="color:#1b4332;font-size:13px">🎯 اقتراح الكابتن النهاردة ${['unilateral','alternating'].includes(e.laterality)?'(لكل جانب)':''}</strong>
     <small style="color:#436253;font-weight:700">راحة ${e.restSeconds} ثانية بين الجولات</small>
    </div>
    <div class="coach-metrics compact" style="margin:0">
     <div><strong>${sets}</strong> مجموعات مقترحة</div>
     <div><strong>${suggestedReps} عدة</strong> <small>(المدى ${e.repMin}–${e.repMax})</small></div>
     <div><strong>${weighted?`${suggestedKg} كجم`:e.loadMode==='bodyweight'?'وزن الجسم':'مقاومة الاستك'}</strong> <small>${weighted?(e.loadMode==='assisted'?'(وزن المساعدة)':prevLog?'(حسب آخر تسجيل)':'(حمل بداية مقترح)'):'بدون إدخال وزن'}</small></div>
    </div>
    ${prevLog?`<small style="display:block;margin-top:6px;color:#2c523f">📌 آخر أداء مسجل (${prevLog.date||prevLog.at.slice(0,10)}): <strong>${setSummary(e,prevLog.sets)}</strong></small>`:`<small style="display:block;margin-top:6px;color:#2c523f">💡 تقدر تعدّل ${weighted?'الوزن والعدات':'العدات'} والجولات حسب إحساسك الفعلي.</small>`}
   </div>
   ${adjustment?`<small class="coach-notice" style="display:block">💡 كابتن التدريب خفف لك عدد الجولات النهاردة مراعاةً لاستشفائك.</small>`:''}
   ${weighted&&e.suggestedKg!=null&&state.recovery?.progressionAllowed&&!blocked?`<p class="coach-success">⬆️ توصية الكابتن اليوم: ${e.loadMode==='assisted'?'وزن المساعدة المقترح':'الحمل المقترح'} ${e.suggestedKg} كجم (${esc(e.progressionReason)})</p>`:''}
   ${blocked?'<p class="coach-notice">⚠️ في ملاحظة ألم أو إجهاد على المنطقة دي؛ وقف الحركة المؤلمة وراجع حالتك قبل تكمل.</p>':''}
   ${loggedToday?`<p class="coach-success">✓ تم حفظ تمرينك اليوم (${setSummary(e,last.sets)})${comparisonNote?`<br><small>${esc(comparisonNote)}</small>`:''}</p>`:''}
   <form class="workout-log" data-id="${e.id}" data-day="${day.dayIndex}" data-uses-kg="${weighted}" data-load-label="${loadLabel(e)}" data-step-kg="${stepKg}" data-default-kg="${suggestedKg}" data-default-reps="${suggestedReps}">
    <input type="hidden" name="date" value="${todayStr}">
    <input type="hidden" name="effort_rir" value="${esc(defaultEffort)}">
    <div class="set-rows">
     ${Array.from({length:activeSetsCount},(_,idx)=>{
      const curSet=loggedToday?last?.sets?.[idx]:(prevLog?.sets?.[idx]||prevLog?.sets?.[0]);
      const rowKg=e.suggestedKg!=null&&state.recovery?.progressionAllowed&&!blocked&&!loggedToday?e.suggestedKg:(curSet?.kg??suggestedKg);
      const rowReps=loggedToday&&curSet?.reps!=null?curSet.reps:suggestedReps;
      return `<div class="set-row ${weighted?'':'reps-only'}">
       <strong class="set-label">جولة ${idx+1}</strong>
       ${weighted?`<div class="stepper-field">
        <span class="stepper-caption">${loadLabel(e)}</span>
        <div class="stepper-control">
         <button type="button" class="stepper-btn" data-step-target="set_kg_${idx}" data-step="-${stepKg}" aria-label="تقليل الوزن">−</button>
         <input type="number" name="set_kg_${idx}" step="2.5" min="0" max="500" value="${rowKg}" readonly tabindex="-1" aria-label="${loadLabel(e)}" required>
         <button type="button" class="stepper-btn" data-step-target="set_kg_${idx}" data-step="${stepKg}" aria-label="زيادة الوزن">+</button>
        </div>
       </div>`:''}
       <div class="stepper-field">
        <span class="stepper-caption">العدات</span>
        <div class="stepper-control">
         <button type="button" class="stepper-btn" data-step-target="set_reps_${idx}" data-step="-1" aria-label="تقليل العدات">−</button>
         <input type="number" name="set_reps_${idx}" min="1" max="100" value="${rowReps}" required>
         <button type="button" class="stepper-btn" data-step-target="set_reps_${idx}" data-step="1" aria-label="زيادة العدات">+</button>
        </div>
       </div>
      </div>`;
     }).join('')}
    </div>
    <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
     <button type="button" class="secondary set-adjust-btn" data-add-set="1" style="padding:6px 12px;font-size:12px" aria-label="إضافة جولة" title="إضافة جولة"><span aria-hidden="true">＋</span></button>
     <button type="button" class="secondary set-adjust-btn" data-remove-set="1" style="padding:6px 12px;font-size:12px" aria-label="حذف آخر جولة" title="حذف آخر جولة"><span aria-hidden="true">−</span></button>
    </div>
    <div style="margin:8px 0">
     <small style="display:block;margin-bottom:4px;font-weight:700;color:#1b4332">إحساسك بالمجهود في آخر عدة:</small>
     <div class="sim-chip-grid" style="grid-template-columns:repeat(3,1fr)">
      <button type="button" class="sim-chip effort-chip ${Number(defaultEffort)>=3?'active-chip':''}" data-effort="3">😊 كان خفيف</button>
      <button type="button" class="sim-chip effort-chip ${Number(defaultEffort)===2?'active-chip':''}" data-effort="2">👌 مظبوط وقوي</button>
      <button type="button" class="sim-chip effort-chip ${Number(defaultEffort)<=1?'active-chip':''}" data-effort="0">🥵 جبت آخري</button>
     </div>
    </div>
    ${['unilateral','alternating'].includes(e.laterality)?'<label><input name="bothSides" type="checkbox" checked> لعبت الجانبين اليمين والشمال بنفس الأداء</label>':''}
    <div class="meal-actions">
     <button type="submit" aria-label="حفظ أداء التمرين"><span aria-hidden="true">✓</span> حفظ</button>
     <button type="button" class="secondary" data-exercise-alt="${e.id}" data-day="${day.dayIndex}" aria-label="تبديل التمرين" title="تبديل التمرين"><span aria-hidden="true">⇄</span></button>
    </div>
    <details style="margin-top:8px"><summary>شرح الأداء أو الإبلاغ عن ألم مفصلي</summary>
     <label><input name="pain" type="checkbox"> حسيت بألم أو نغزة في المفصل أثناء التمرين ده</label>
     <p dir="ltr" class="exercise-description">${esc(e.description)}</p>
    </details>
   </form>
   </div>
  </article>`;
 }
 function singleWorkoutDayCard(d,todayStr,plan,isTodayScheduled=true){
  const loggedCount=d.exercises.filter(e=>state.workoutLogs.some(l=>l.date===todayStr&&l.dayIndex===d.dayIndex&&l.exerciseId===e.id&&l.planId===plan.id)).length;
  const todaySess=state.sessions.find(s=>s.date===todayStr&&s.dayIndex===d.dayIndex&&s.planId===plan.id);
  const targetRegions=[...new Set(d.exercises.flatMap(e=>e.regions||[]))];
  return `<section class="coach-card" data-day="${d.dayIndex}">
   <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
    <h3 style="margin:0;color:#163a2c">🏋️ تمرينة اليوم (${days[new Date(todayStr+'T12:00:00Z').getUTCDay()]} ${todayStr}) · ${esc(FOCUS_LABELS[d.focus]||d.focus)}</h3>
    <span style="font-size:12px;background:#e6f4ec;color:#145335;padding:4px 10px;border-radius:999px;font-weight:700">${d.location==='home'?'🏠 البيت':'🏋️ الجيم'} · ${d.estimatedMinutes||d.duration} د ${loggedCount?`· ✓ ${loggedCount}/${d.exercises.length}`:''}</span>
   </div>
   ${targetRegions.length?`<p style="margin:4px 0 8px;font-size:13px;color:#2c523f">🎯 <strong>العضلات المستهدفة النهاردة:</strong> ${esc(regionNames(targetRegions))} <small>(الوجع مش شرط ولا دليل على بناء العضلات)</small></p>`:''}
   <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
    <span style="font-size:13px;font-weight:700;color:#1b4332">${todaySess?.status==='completed'?'🎉 عاش يا بطل! قفّلت تمرينة اليوم بالكامل ✓':loggedCount?`⏳ سجّلت ${loggedCount} من ${d.exercises.length} تمارين (الجلسة بتتقفل تلقائياً مع حفظ التمارين)`:'سجّل العدات والمجهود، والوزن في التمارين اللي بتستخدم أوزان:'}</span>
   </div>
   ${d.exercises.map(e=>exerciseHTML(e,d)).join('')}
   ${isTodayScheduled?`<details style="margin-top:8px"><summary>📅 مقدرتش أتمرن النهاردة؟ (تأجيل الجلسة ليوم تاني)</summary>
    <form class="reschedule-form" data-day="${d.dayIndex}" style="margin-top:8px">
     <label>اختار يوم بديل للتمرين خلال الأسبوعين الجايين <input name="toDate" type="date" min="${todayStr}" max="${dateOffset(todayStr,13)}" required></label>
     <button class="secondary">نقل موعد التمرينة</button>
    </form>
    <form class="session-log" data-day="${d.dayIndex}" style="margin-top:8px">
     <input type="hidden" name="date" value="${todayStr}">
     <input type="hidden" name="status" value="missed">
     <label>المدة الفعلية بالدقائق (اختياري)<input type="number" name="duration" min="1" max="240"></label>
     <label>مجهود الجلسة من 0 إلى 10 (اختياري)<input type="number" name="rpe" min="0" max="10" step="0.5"></label>
     <button class="secondary">تسجيل إن الجلسة فاتتني هذا الأسبوع</button>
    </form>
   </details>`:''}
  </section>`;
 }
 function workoutHTML(){
  const plan=state.workoutPlan;
  if(state.eligibility?.status==='needs_health_confirmation')return `<form id="confirm-existing-health" class="coach-card"><h3>تأكيد الجاهزية الصحية مع الكابتن</h3><p>أكد عدم وجود موانع صحية حادة قبل متابعة التمارين.</p><label><input name="healthy" type="checkbox" required> لا توجد حالة صحية حادة تمنع التمرين.</label><label><input name="injuryFree" type="checkbox" required> لا توجد إصابة حادة حالية.</label><button>تأكيد ومتابعة خطتي</button></form>`;
  if(state.eligibility?.needsScheduleConfirmation&&plan)return `<form id="confirm-schedule" class="coach-card"><h3>تأكيد أيام تمرينك في الأسبوع</h3><p>اختار اليوم المقصود لكل جلسة:</p>${plan.days.map(d=>`<label>${esc(FOCUS_LABELS[d.focus]||d.focus)} (${d.exercises[0]?esc(d.exercises[0].name):'جلسة'})<select name="day:${d.dayIndex}" required><option value="">اختار اليوم المقصود</option>${days.map((name,index)=>`<option value="${index}">${name}</option>`).join('')}</select></label>`).join('')}<button>تأكيد الأيام</button></form>`;
  if(!plan)return '<div class="coach-card"><p>مسارك الحالي للأكل فقط بدون جدول تمارين.</p></div>';
  const todayStr=state.serverDate||localDate();
  const todayDayIndex=new Date(todayStr+'T12:00:00Z').getUTCDay();
  const todaySched=(state.scheduledSessions||[]).find(s=>s.date===todayStr);
  const hasTrainedBefore=(state.workoutLogs||[]).length>0||(state.sessions||[]).some(s=>s.status==='completed'||s.status==='partial');
  const todayWorkoutDay=todaySched?plan.days.find(d=>d.dayIndex===todaySched.dayIndex):(plan.days.find(d=>d.dayIndex===todayDayIndex)||(!hasTrainedBefore?plan.days[0]:null));
  const nextSched=(state.scheduledSessions||[])[0];
  const fallbackDay=nextSched?plan.days.find(d=>d.dayIndex===nextSched.dayIndex)||plan.days[0]:plan.days[0];
  return `${plan.goalNote?`<p class="coach-notice">🎯 <strong>خطة كابتن التدريب:</strong> ${esc(plan.goalNote)}</p>`:''}
   ${plan.warnings.map(w=>`<p class="coach-notice">${esc(w)}</p>`).join('')}
   ${todayWorkoutDay
    ?singleWorkoutDayCard(todayWorkoutDay,todayStr,plan,true)
    :`<section class="coach-card" style="background:linear-gradient(135deg,#f4faf6 0%,#e9f5ee 100%);border-color:#b7dec9">
      <h3 style="margin:0 0 6px;color:#1b4332">🌿 النهاردة (${days[todayDayIndex]} ${todayStr}) يوم راحة حسب جدولك</h3>
      <p style="margin:0 0 8px;font-size:14px;color:#1e3a2f">الراحة والتغذية والنوم بيدعموا التكيف مع التدريب على المدى الطويل. ${nextSched?`تمرينتك الجاية يوم <strong>${days[nextSched.dayIndex]} (${nextSched.date}) · ${esc(FOCUS_LABELS[nextSched.focus]||nextSched.focus)}</strong>.`:''}</p>
      ${fallbackDay?`<details style="margin-top:8px"><summary>💪 عايز تتمرن النهاردة بدل يوم الراحة؟ افتح تمرينة اليوم</summary>${singleWorkoutDayCard(fallbackDay,todayStr,plan,false)}</details>`:''}
     </section>`}`;
 }
 return {exerciseHTML,singleWorkoutDayCard,workoutHTML};
}
