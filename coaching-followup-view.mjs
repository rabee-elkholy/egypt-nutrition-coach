import {esc,round,days} from './coaching-view-helpers.mjs';
import {MUSCLE_REGIONS,localDate} from './coaching-shared.mjs';


import {say,SORENESS} from './coach-messages.mjs';
import {buildSpecialistBrief} from './coaching-brief-view.mjs';

export function followupView({state,simulationMode,notes}){
 function reviewHTML(todayStr,plan,todayPlanDay,pendingAdaptations){
  const todayDayIndex=new Date(todayStr+'T12:00:00Z').getUTCDay();
  const sim=state.simulation;
  const simDayEmpty=sim&&state.simulationToday&&!state.simulationToday.foodComplete&&!state.simulationToday.recoveryLogged&&state.simulationToday.weight==null&&!state.simulationToday.sessions.length;
  // 1. Identify muscles worked in latest session or today's workout
  const wPlan=state.workoutPlan;
  const recentLogs=(state.workoutLogs||[]).filter(l=>(l.date||l.at?.slice(0,10))<=todayStr&&(l.planId===wPlan?.id||wPlan?.days?.some(d=>d.exercises?.some(e=>e.id===l.exerciseId&&e.progressionKey&&e.progressionKey===l.progressionKey)))).slice().sort((a,b)=>(a.date||a.at.slice(0,10)).localeCompare(b.date||b.at.slice(0,10))||Date.parse(a.at)-Date.parse(b.at));
  const lastLogDate=recentLogs.at(-1)?.date||recentLogs.at(-1)?.at?.slice(0,10);
  const lastDayLogs=lastLogDate?recentLogs.filter(l=>(l.date||l.at.slice(0,10))===lastLogDate):[];
  const todaySched=(state.scheduledSessions||[]).find(s=>s.date===todayStr);
  const activeWorkoutDay=todaySched&&wPlan?wPlan.days.find(d=>d.dayIndex===todaySched.dayIndex):(wPlan?.days.find(d=>d.dayIndex===todayDayIndex)||wPlan?.days?.[0]);
  const allPlanEx=wPlan?.days?.flatMap(d=>d.exercises||[])||[];
  const workedExercises=lastDayLogs.length
   ?[...new Map(lastDayLogs.map(l=>{const ex=allPlanEx.find(e=>e.id===l.exerciseId)||{id:l.exerciseId,name:l.exerciseId,regions:l.regions||[]};return [ex.id,{ex,log:l}];})).values()]
   :(activeWorkoutDay?.exercises||[]).map(ex=>({ex,log:null}));
  const muscleMap=new Map();
  let hardSetsCount=0,totalLoggedSets=0;
  for(const {ex,log} of workedExercises){
   for(const r of ex.regions||[]){
    const label=MUSCLE_REGIONS[r]||r;
    if(!muscleMap.has(label))muscleMap.set(label,[]);
    if(!muscleMap.get(label).includes(ex.name))muscleMap.get(label).push(ex.name);
   }
   if(log?.sets?.length){
    for(const s of log.sets){
     totalLoggedSets++;
     if(s.rir!=null&&Number(s.rir)<=2)hardSetsCount++;
    }
   }
  }
  const muscleEntries=[...muscleMap.entries()];
  const muscleNamesList=muscleEntries.map(([m])=>m).join('، ')||'عضلات الجسم الأساسية';

  // 2. Nutrition, Hydration, Weight & Recovery personalized numbers
  const entriesToday=(state.foodEntries||[]).filter(x=>x.date===todayStr);
  const foodRec=state.foodLogs.find(x=>x.date===todayStr);
  const loggedEnergy=entriesToday.length?Math.round(entriesToday.reduce((s,e)=>s+(Number(e.snapshot?.values?.energy)||0),0)):(foodRec?.energy?Math.round(foodRec.energy):0);
  const loggedProtein=entriesToday.length?Math.round(entriesToday.reduce((s,e)=>s+(Number(e.snapshot?.values?.protein)||0),0)):(foodRec?.protein?Math.round(foodRec.protein):0);
  const targetEnergy=round(todayPlanDay?.targets?.energy??plan?.targets?.energy);
  const targetProtein=round(todayPlanDay?.targets?.protein??plan?.targets?.protein);
  const hyd=state.progressSummary?.hydration||{todayCups:0,targetCups:10,todayLiters:0,targetLiters:2.5};
  const wt=state.progressSummary?.weightTrend||{};
  const lastW=(state.weights||[]).filter(w=>w.date<=todayStr).slice().sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.kg??state.profile?.weight??'—';
  const targetW=plan?.targets?.forecast?.target_weight_kg??state.profile?.targetWeight;
  const remKg=targetW&&Number.isFinite(Number(lastW))?Math.abs(Math.round((Number(lastW)-Number(targetW))*10)/10):null;
  const insights=state.progressSummary?.workoutSummary?.insights;
  const latestCheckin=(state.checkins||[]).filter(c=>c.date<=todayStr).slice().sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);

  return `
   <div class="coach-card" style="background:linear-gradient(135deg,#eef7f2 0%,#e2f2e9 100%);border-color:#9fd0b5;margin-top:0">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
     <div>
      <small style="color:#1f5c3f;font-weight:700">📅 متابعة اليوم الحالي: ${days[todayDayIndex]} ${todayStr}${sim?` · اليوم ${sim.day} من 90`:''}</small>
      <h2 style="margin:2px 0 4px">💬 متابعة الفريق النهارده</h2>
     </div>
     <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${simulationMode&&sim?`
       ${simDayEmpty&&sim.day<90?`<button type="button" id="review-fast-day" style="background:#0f766e;margin:0">⚡ قفّل اليوم ملتزم + اليوم التالي (${sim.day+1}) ←</button>`:''}
       <button type="button" id="review-next-day" style="margin:0" ${sim.day>=90?'disabled':''}>⏭️ اليوم التالي (${Math.min(90,sim.day+1)}) ←</button>
      `:`<button type="button" id="review-enter-sim" class="secondary" style="margin:0">⏭️ تجربة اليوم التالي (محاكاة)</button>`}
      <button type="button" id="review-coach" class="secondary" style="margin:0">🔍 تحديث قرار الفريق</button>
     </div>
    </div>
   </div>

   ${buildSpecialistBrief(state,todayStr,todayPlanDay,notes)}
   <details class="coach-card brief-details"><summary>تفاصيل أرقامك والتمرين والاستشفاء</summary>
   ${wPlan?`<section class="coach-card" style="border-color:#cce3d6;background:#fbfdfc">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
     <h3 style="margin:0;color:#145335">🔥 العضلات المستهدفة في الجلسة المعروضة</h3>
     <span style="font-size:12px;background:#e6f4ec;color:#145335;padding:4px 10px;border-radius:999px;font-weight:700">${lastDayLogs.length?`بناءً على تمرينة ${lastLogDate}`:'تمارين مخططة؛ مش دليل إنها اتعملت'}</span>
    </div>
    <p style="margin:4px 0 10px;font-size:13.5px;color:#234236">المناطق التالية مرتبطة بالتمارين المعروضة؛ ده مش تقييم لحالتها الحالية:</p>
    <div class="coach-tags" style="padding:0 0 8px">
     ${muscleEntries.map(([m,exList])=>`<span style="background:#eef7f2;border:1px solid #b7dec9;color:#145335;font-weight:700">💪 ${esc(m)} <small style="font-weight:400;color:#436253">(${esc(exList.slice(0,2).join('، '))})</small></span>`).join('')}
    </div>
    <div class="coach-notice" style="margin:8px 0 0;background:#f2faf5">
     <strong>✅ ملاحظة الكابتن عن الوجع العضلي:</strong>
     <p style="margin:4px 0;font-size:13.5px;line-height:1.6">
      ${totalLoggedSets>0&&lastLogDate===todayStr
       ?esc(say(SORENESS,todayStr+':sore',{sets:totalLoggedSets,hard:hardSetsCount,muscles:muscleNamesList}))
       :lastLogDate?esc('آخر تمرينة مسجلة بتاريخ '+lastLogDate+'؛ السجل القديم مش دليل على وجود وجع أو استشفاء النهاردة. حدّث حالتك الحالية.')
       :esc('دي عضلات مستهدفة في الخطة؛ مفيش جلسة مسجلة نستنتج منها مجهودك أو إحساسك الحالي.')}
     </p>
     <small style="display:block;color:#355849;margin-top:4px">💡 <strong>الفرق في ثانية:</strong> وجع العضلات مش دليل نمو ولا هدف للتمرين. الألم الحاد أو المتزايد، والتورم الشديد أو البول الداكن بعد مجهود شديد، محتاجين توقف وتقييم طبي.</small>
    </div>
   </section>`:''}

   <section class="coach-card">
    <h3 style="margin:0 0 10px;color:#163a2c">📊 متابعة الفريق لأرقامك واستجابة جسمك</h3>
    <div class="coach-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
     <div style="background:#f5f9f6;border:1px solid #dce8e1;border-radius:12px;padding:12px">
      <strong style="color:#1b4332;font-size:14px">🥗 أخصائي التغذية وبناء العضلات</strong>
      <p style="margin:6px 0 0;font-size:13.5px;color:#234236">
       سعرات اليوم: <strong>${loggedEnergy} / ${targetEnergy} سعر</strong><br>
       بروتين اليوم: <strong>${loggedProtein} / ${targetProtein} جم</strong><br>
       <small style="color:#496559">${loggedProtein>=Number(targetProtein)*0.8?'تسجيل البروتين قريب من هدف الخطة؛ الرقم وحده مش تقييم كامل لتغذيتك.':'راجع وجباتك المسجلة وهدف البروتين، من غير إضافة أكل لمجرد نقص التسجيل.'}</small>
      </p>
     </div>
     <div style="background:#f2f9ff;border:1px solid #b8dcf5;border-radius:12px;padding:12px">
      <strong style="color:#0d47a1;font-size:14px">💧 الترطيب وتوازن السوائل</strong>
      <p style="margin:6px 0 0;font-size:13.5px;color:#1b3a57">
       شرب المية اليوم: <strong>${hyd.todayCups||0} / ${hyd.targetCups||10} كوب (${hyd.todayLiters||0} من ${hyd.targetLiters||2.5} لتر)</strong><br>
       <small style="color:#32567a">${(hyd.todayCups||0)>=(hyd.targetCups||10)*0.8?'تسجيل المية قريب من هدفك؛ احتياجك بيتأثر بالجو والمجهود وتعليمات مختصك.':'المسجل أقل من هدف اليوم؛ حدّث التسجيل ووزّع الشرب على وقتك، من غير تعويض سريع.'}</small>
      </p>
     </div>
     <div style="background:#f5f9f6;border:1px solid #dce8e1;border-radius:12px;padding:12px">
      <strong style="color:#1b4332;font-size:14px">📈 تطور الأوزان والعدات (آخر أسبوعين)</strong>
      <p style="margin:6px 0 0;font-size:13.5px;color:#234236">
       الجلسات المكتملة: <strong>${state.progressSummary?.workoutSummary?.completed14d||0} تمرينات</strong><br>
       <small style="color:#496559">${esc(insights?.summaryText||'سجّل أوزانك وعداتك في التمرين علشان الكابتن يقارن تطور قوتك جلسة بجلسة.')}</small>
      </p>
     </div>
     <div style="background:#f5f9f6;border:1px solid #dce8e1;border-radius:12px;padding:12px">
      <strong style="color:#1b4332;font-size:14px">⚖️ اتجاه الميزان والاستشفاء</strong>
      <p style="margin:6px 0 0;font-size:13.5px;color:#234236">
       آخر وزن: <strong>${lastW} كجم</strong> ${remKg!=null?`<small>(الفرق عن هدف ${targetW} كجم: ${remKg} كجم)</small>`:''}<br>
       متوسط الأسبوع: <strong>${wt.current7dAvgKg??'—'} كجم</strong> (السابق: ${wt.previous7dAvgKg??'—'} كجم)<br>
       <small style="color:#496559">${latestCheckin?`النوم المسجل بتاريخ ${latestCheckin.date}: ${latestCheckin.sleepHours} ساعات؛ الجاهزية تحتاج متابعة حديثة.`:'سجّل وزنك ونومك في تبويب «حالتي» لمتابعة أدق.'}</small>
      </p>
     </div>
    </div>
   </section>

   ${state.lastReview?`<section class="coach-notice" style="margin-top:12px">
    <strong>📋 مراجعة ${esc(state.lastReview.at?.slice(0,10))}: ${esc(state.lastReview.message)}</strong>
    <p>🥗 <strong>أخصائي التغذية:</strong> ${esc(state.lastReview.nutrition.reason)}</p>
    ${state.lastReview.hydration?`<p>💧 <strong>متابعة المية:</strong> ${esc(state.lastReview.hydration.reason)}</p>`:''}
    ${state.lastReview.volume?`<p>💪 <strong>كابتن التدريب:</strong> ${esc(state.lastReview.volume.reason)}</p>`:''}
    ${state.lastReview.workoutInsights?`<p>📈 <strong>ملخص الأوزان والعدات:</strong> ${esc(state.lastReview.workoutInsights.summaryText)}</p>`:''}
   </section>`:''}

   </details>
   ${pendingAdaptations.map(a=>`<article class="meal-card" style="margin-top:12px;border-color:#f59e0b;background:#fffbeb">
    <p style="margin:0 0 6px"><strong>🔔 توصية جاهزة لموافقتك: ${esc(a.reason)}</strong></p>
    ${a.delta?`<p style="margin:0 0 8px">التعديل المقترح: ${a.delta>0?'+'+a.delta:a.delta} سعر/يوم بداية من الغد.</p>`:''}
    <button data-adapt="${a.id}" data-accept="true">✅ موافق على توصية الفريق</button>
    <button class="secondary" data-adapt="${a.id}" data-accept="false">أكمل على خطتي الحالية</button>
   </article>`).join('')}
  `;
 }
 function recoveryHTML(draftDates={}){
  const todayStr=state.serverDate||localDate();
  const recoveryDate=draftDates.recovery||todayStr,weightDate=draftDates.weight||todayStr;
  const latest=state.checkins.find(c=>c.date===recoveryDate)||state.checkins.at(-1);
  const lastWeight=state.weights.at(-1)?.kg??state.profile?.weight??80;
  const curSleep=latest?.date===recoveryDate?latest.sleepHours:7.5;
  const curQual=latest?.date===recoveryDate?latest.sleepQuality:4;
  const curFatigue=latest?.date===recoveryDate?latest.fatigue:2;
  const curStress=latest?.date===recoveryDate?(latest.stress??2):2;
  const hasPainOrSore=latest?.date===recoveryDate&&(latest.pain||(latest.soreness??0)>=7||Object.values(latest.sorenessByRegion||{}).some(v=>v>=7));
  return `<form id="weight-log" data-diary-date="${weightDate}" class="coach-card">
   <h3>⚖️ ${weightDate===todayStr?'ميزان النهاردة':'ميزان يوم'} (${weightDate})</h3>
   ${weightDate!==todayStr?`<p id="weight-draft-day">دي مسودة وزنك ليوم ${weightDate}. <button type="button" data-start-draft="weight-log" class="secondary">ابدأ تسجيل اليوم ${todayStr} بدل المسودة</button></p>`:''}
   <p><small>فريق التغذية بيعتمد على متوسط الميزان خلال الأسبوعين مش تغير يوم واحد:</small></p>
   <input type="hidden" name="date" value="${weightDate}">
   <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
    <label style="flex:1;min-width:160px;margin:0">وزنك بالكيلوجرام <input name="kg" type="number" step="0.1" min="35" max="250" value="${lastWeight}" required></label>
    <button style="margin:0">✓ حفظ الميزان</button>
   </div>
   ${state.weights.length?`<div class="coach-tags" style="margin-top:10px">${state.weights.slice(-7).reverse().map(w=>`<span>${w.date}: <strong>${w.kg} كجم</strong></span>`).join('')}</div>`:''}
  </form>
  <form id="recovery-log" data-diary-date="${recoveryDate}" class="coach-card">
   <input type="hidden" name="date" value="${recoveryDate}">
   <h3>😴 طمّن فريق المتابعة على نومك وطاقتك (${recoveryDate})</h3>
   ${recoveryDate!==todayStr?`<p id="recovery-draft-day">دي مسودة حالتك ليوم ${recoveryDate}. حفظها هيسجلها لليوم ده. <button type="button" id="recovery-start-today" data-start-draft="recovery-log" class="secondary">ابدأ متابعة اليوم ${todayStr} بدل المسودة</button></p>`:''}
   <p><small>اختار بلمسة واحدة علشان كابتن التدريب يظبط لك حمل التمرين:</small></p>
   <input type="hidden" name="sleepHours" value="${curSleep}">
   <input type="hidden" name="sleepQuality" value="${curQual}">
   <input type="hidden" name="fatigue" value="${curFatigue}">
   <input type="hidden" name="stress" value="${curStress}">

   <div style="margin:10px 0">
    <strong style="font-size:14px;display:block;margin-bottom:6px">1. نمت كام ساعة إمبارح؟</strong>
    <div class="sim-chip-grid">
     <button type="button" class="sim-chip sleep-preset ${curSleep<6?'active-chip':''}" data-sleep="5" data-qual="2">😴 أقل من 6 ساعات</button>
     <button type="button" class="sim-chip sleep-preset ${curSleep>=6&&curSleep<7?'active-chip':''}" data-sleep="6.5" data-qual="3">🙂 6 إلى 7 ساعات</button>
     <button type="button" class="sim-chip sleep-preset ${curSleep>=7&&curSleep<=8?'active-chip':''}" data-sleep="7.5" data-qual="4">😌 7.5–8 ساعات ✓</button>
     <button type="button" class="sim-chip sleep-preset ${curSleep>8?'active-chip':''}" data-sleep="8.5" data-qual="5">🌟 أكتر من 8 ساعات</button>
    </div>
   </div>

   <div style="margin:12px 0">
    <strong style="font-size:14px;display:block;margin-bottom:6px">2. طاقتك وإحساس جسمك النهاردة؟</strong>
    <div class="sim-chip-grid" style="grid-template-columns:repeat(3,1fr)">
     <button type="button" class="sim-chip energy-preset ${curFatigue<=1?'active-chip':''}" data-fatigue="1" data-stress="1">🔥 فايق ومستعد</button>
     <button type="button" class="sim-chip energy-preset ${curFatigue>=2&&curFatigue<=3?'active-chip':''}" data-fatigue="2" data-stress="2">👌 يوم عادي</button>
     <button type="button" class="sim-chip energy-preset ${curFatigue>=4?'active-chip':''}" data-fatigue="4" data-stress="4">😮‍💨 مرهق شوية</button>
    </div>
   </div>

   <details style="margin:10px 0" ${hasPainOrSore?'open':''}><summary>🩺 حاسس بشد عضلي قوي أو ألم مفصلي أو دور برد؟ (اضغط للتحديد)</summary>
    <p style="margin:6px 0"><small>لو في عضلة معينة مرهقة جداً أو بتوجعك، علم عليها علشان الكابتن يخفف حملها اليوم:</small></p>
    <div class="coach-tags">${Object.entries(MUSCLE_REGIONS).map(([key,name])=>`<label><input type="checkbox" name="pain:${key}"> ألم مفصلي: ${name}</label>`).join('')}</div>
    <div class="coach-grid" style="margin-top:8px">${Object.entries(MUSCLE_REGIONS).map(([key,name])=>`<label>شد عضلي ${name} (0-10)<input name="sore:${key}" type="number" min="0" max="10" placeholder="0"></label>`).join('')}</div>
    <label><input type="checkbox" name="pain"> عندي ألم يمنعني من بعض التمارين اليوم</label>
    <label><input type="checkbox" name="illness"> عندي أعراض برد أو سخونية اليوم</label>
    <label><input type="checkbox" name="redFlags"> أشعر بدوخة شديدة أو ألم بالصدر</label>
   </details>
   <button type="submit">✓ حفظ حالتي ليوم ${recoveryDate}</button>
  </form>`;
 }
 return {reviewHTML,recoveryHTML};
}
