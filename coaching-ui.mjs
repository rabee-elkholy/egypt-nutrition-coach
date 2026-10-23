import {simulationPanel} from './simulation-ui.mjs?v=sim2';
import {mountOnboardingChat} from './onboarding-chat.mjs';
import {MUSCLE_REGIONS,FOCUS_LABELS,SLOTS,localDate,dateOffset,effectiveSets,onboardingState} from './coaching-shared.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=n=>n==null?'—':Math.round(Number(n)||0);
const days=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const stateLabels={cooked:'مطبوخ',raw:'نيّ',as_sold:'كما يباع'};
const regionNames=regions=>(regions||[]).map(r=>MUSCLE_REGIONS[r]||r).join('، ');
const macroLine=s=>`${round(s.values.energy)} سعر · ${round(s.values.protein)} جرام بروتين`;
const formData=form=>{const p=Object.fromEntries(new FormData(form));for(const x of form.querySelectorAll('[type=checkbox]'))p[x.name]=x.checked;return p;};

export async function mountPlanner({root,toast}){
 let state,busy=false,diaryDate=localDate(),activeTab='nutrition',catalogQuery='',catalogOffset=0,viewVersion=0,catalogRequest=0,foodRequest=0,alternativeRequest=0,submittedForm=null,uncertainWrite=null;
 let simulationMode=new URL(location.href).searchParams.get('simulation')==='1';
 const drafts=new Map();
 const formKey=form=>(form.id||[form.classList[0],form.dataset.day||'',form.dataset.id||form.dataset.meal||form.dataset.key||''].join('|'))+(form.dataset.diaryDate?'|'+form.dataset.diaryDate:'')+(simulationMode?'|sim-day:'+state?.simulation?.day:'');
 function captureDrafts(excluded){for(const form of root.querySelectorAll('form'))if(!form.closest('#coach-onboarding-section')&&formKey(form)!==excluded)drafts.set(formKey(form),formData(form));if(excluded)drafts.delete(excluded);}
 function restoreDrafts(scope=root){for(const form of scope.querySelectorAll('form')){const draft=drafts.get(formKey(form));if(!draft)continue;for(const [name,value]of Object.entries(draft)){const field=form.elements.namedItem(name);if(field&&'value'in field){if(field.type==='checkbox')field.checked=!!value;else field.value=String(value);}}}}
 if(root._coachSubmit)root.removeEventListener('submit',root._coachSubmit,true);
 root._coachSubmit=e=>{if(!e.target.id.includes('search')&&!e.target.closest('#coach-onboarding-section'))submittedForm=formKey(e.target);};root.addEventListener('submit',root._coachSubmit,true);
 const api=async(path,options={})=>{const r=await fetch('/v1/'+path+(simulationMode?(path.includes('?')?'&':'?')+'simulation=1':''),options);const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'تعذر الاتصال'),{status:r.status});return data;};
 function notice(message,isError=false){const el=root.querySelector('#coach-feedback');if(el){el.textContent=message;el.hidden=false;el.setAttribute('role',isError?'alert':'status');}if(isError)toast?.(message);}
 async function send(action,payload){
  if(busy)return false;const fingerprint=JSON.stringify({action,payload});if(uncertainWrite&&uncertainWrite.fingerprint!==fingerprint){notice('في عملية لسه مش متأكدين من حفظها؛ أعد محاولتها الأول.',true);retryUncertain();return false;}busy=true;root.setAttribute('aria-busy','true');
  const key=uncertainWrite?.key||crypto.randomUUID(),body=uncertainWrite?.body||JSON.stringify({action,payload,revision:state.revision});let confirmed=false;
  const submitted=uncertainWrite?.submitted||submittedForm,submittedData=[...root.querySelectorAll('form')].find(f=>formKey(f)===submitted);const rejectedDraft=submittedData?formData(submittedData):null;const clearSubmitted=!uncertainWrite||JSON.stringify(rejectedDraft)===JSON.stringify(uncertainWrite.submittedData)?submitted:null;submittedForm=null;captureDrafts(clearSubmitted);
  const controls=[...root.querySelectorAll('input,select,textarea,button')].map(el=>({el,disabled:el.disabled}));controls.forEach(({el})=>el.disabled=true);
  try{
   const options={method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body};
   try{state=await api('commands',options);}catch(e){if(e instanceof TypeError)state=await api('commands',options);else throw e;}
   confirmed=true;uncertainWrite=null;
   const openDays=[...root.querySelectorAll('details[data-day][open]')].map(d=>d.dataset.day);
   if(['generate','simulation_reset'].includes(action))drafts.clear();
   if(['simulation_reset','simulation_next'].includes(action))diaryDate=state.serverDate;
   if(action==='review'||(action==='simulation_fill'&&state.adaptations?.some(a=>a.status==='pending')))activeTab='review';
   render();for(const id of openDays)root.querySelector(`details[data-day="${id}"]`)?.setAttribute('open','');
   notice(action==='simulation_next'?`بدأ اليوم ${state.simulation?.day||''} في المحاكاة.`:action==='simulation_fill'?'تم تسجيل سيناريو اليوم ومراجعة الخطة.':action==='review'?state.lastReview?.message||'تمت المراجعة.':'تم الحفظ بنجاح ✓');return true;
  }catch(e){
   if(!confirmed&&(!e.status||e.status>=500)){uncertainWrite={key,body,fingerprint,action,payload,submitted,submittedData:uncertainWrite?.submittedData||rejectedDraft};notice('الاتصال انقطع أو الحفظ لم يتأكد. أعد المحاولة بنفس العملية علشان ما تتسجلش مرتين.',true);retryUncertain();}
   else{uncertainWrite=null;if(submitted&&rejectedDraft)drafts.set(submitted,rejectedDraft);if(e.status===409){try{state=await api('state');render();}catch{}}notice(confirmed?'بياناتك اتحفظت؛ حدّث الصفحة لإعادة عرضها.':e.message,true);}return false;
  }
  finally{for(const {el,disabled}of controls)if(el.isConnected)el.disabled=disabled;busy=false;root.removeAttribute('aria-busy');}
 }
 async function switchSimulation(enabled){
  if(busy)return;if(uncertainWrite){notice('أكد العملية المعلقة قبل تبديل وضع التجربة.',true);retryUncertain();return;}
  const before=simulationMode;busy=true;viewVersion++;simulationMode=enabled;
  try{const next=await api('state');state=next;drafts.clear();diaryDate=state.serverDate;const url=new URL(location.href);if(enabled)url.searchParams.set('simulation','1');else url.searchParams.delete('simulation');history.replaceState(null,'',url);root.replaceChildren();busy=false;render();root.scrollIntoView({block:'start'});}
  catch(error){simulationMode=before;notice(error.message,true);}finally{busy=false;}
 }
 function wireSimulation(){
  root.querySelector('#enter-simulation')?.addEventListener('click',()=>switchSimulation(true));
  root.querySelector('#leave-simulation')?.addEventListener('click',()=>switchSimulation(false));
  root.querySelector('#simulation-start-current')?.addEventListener('click',()=>send('simulation_reset',{source:'current'}));
  root.querySelector('#simulation-start-sample')?.addEventListener('click',()=>send('simulation_reset',{source:'sample'}));
  root.querySelector('#simulation-reset')?.addEventListener('click',()=>{if(confirm('تبدأ جولة محاكاة جديدة من اليوم 1؟'))send('simulation_reset',{source:state.simulation.source,confirm:true});});
  root.querySelector('#simulation-next')?.addEventListener('click',async()=>{if(await send('simulation_next',{}))root.querySelector('#simulation-panel')?.scrollIntoView({block:'start',behavior:'smooth'});});
  root.querySelector('#simulation-fast-day')?.addEventListener('click',async()=>{
   if(await send('simulation_fill',{scenario:'consistent'})){
    if(!state.adaptations?.some(a=>a.status==='pending')&&state.simulation?.day<90){
     await send('simulation_next',{});
    }
   }
  });
  root.querySelector('#simulation-review')?.addEventListener('click',async()=>{activeTab='review';if(await send('review',{}))root.querySelector('#coach-review')?.scrollIntoView({block:'start',behavior:'smooth'});});
  root.querySelectorAll('[data-quick-scenario]').forEach(btn=>btn.addEventListener('click',async()=>{
   await send('simulation_fill',{scenario:btn.dataset.quickScenario});
  }));
  root.querySelectorAll('[data-sim-tab]').forEach(btn=>btn.addEventListener('click',()=>{
   activeTab=btn.dataset.simTab;render();
   const target=btn.dataset.simScroll?root.querySelector(btn.dataset.simScroll):null;
   if(target)target.scrollIntoView({block:'start',behavior:'smooth'});
  }));
 }
 function retryUncertain(){const feedback=root.querySelector('#coach-feedback');if(feedback&&uncertainWrite&&!feedback.querySelector('button')){const b=document.createElement('button');b.textContent='أعد محاولة العملية غير المؤكدة';b.id='retry-uncertain-write';b.onclick=()=>send(uncertainWrite.action,uncertainWrite.payload);feedback.append(' ',b);}}
 function onboarding(){
  if(busy)return;captureDrafts();viewVersion++;root.innerHTML='<div id="coach-feedback" role="alert" class="coach-notice" hidden></div><div class="coach-app">'+simulationPanel(state,simulationMode,{compact:true})+'</div><section id="coach-onboarding-section"></section>';
  wireSimulation();
  mountOnboardingChat({container:root.querySelector('section'),getState:()=>onboardingState(state),onRestoreExisting:async()=>{try{state=await api('state');if(!state.profile)throw Error('مفيش خطة محفوظة للحساب ده. أكمل إنشاء خطتك من الأسئلة.');render();}catch(e){notice(e.message,true);}},onCompleteOnboarding:d=>confirmReadiness(d)});
 }
 function confirmReadiness(draft){
  draft={...draft,weekdayConvention:'saturday_0'};viewVersion++;
  const needsHealth=draft.serviceTrack==='workouts_only';
  const needsExternal=draft.serviceTrack==='nutrition_only'&&draft.goal==='muscle_gain';
  if(!needsHealth&&!needsExternal)return send('generate',draft);
  root.innerHTML=`<div id="coach-feedback" role="alert" class="coach-notice" hidden></div><section class="coach-app"><h2>مراجعة جاهزية خطتك</h2><form id="readiness-form" class="coach-card">${needsHealth?'<p>مسار التمرين فقط لم يسألك عن الأمراض. الخطة الآلية الحالية للبالغين الأصحاء بدون إصابة أو موانع صحية للتمرين.</p><label><input name="healthConfirmed" type="checkbox" required> أؤكد عدم وجود حالة صحية أو إصابة حالية تحتاج خطة متخصص.</label>':''}${needsExternal?`<p>لأنك اخترت الأكل فقط مع زيادة العضلات، حدّد أيام تمارين المقاومة اللي بتعملها خارج التطبيق.</p><div class="coach-tags">${days.map((name,index)=>`<label><input type="checkbox" name="external:${index}"> ${name}</label>`).join('')}</div>`:''}<button>إنشاء الخطة</button><button type="button" id="back-onboarding" class="secondary">الرجوع لبياناتي</button></form></section>`;
  root.querySelector('#back-onboarding').onclick=onboarding;
  root.querySelector('#readiness-form').onsubmit=e=>{e.preventDefault();const data=formData(e.target);const externalTrainingDays=Object.keys(data).filter(k=>k.startsWith('external:')&&data[k]).map(k=>Number(k.slice(9)));if(needsExternal&&!externalTrainingDays.length){notice('اختار يوم مقاومة واحدًا على الأقل، أو راجع هدفك.',true);return;}send('generate',{...draft,...(needsHealth?{healthConfirmed:data.healthConfirmed}:{}),...(needsExternal?{externalTrainingDays:externalTrainingDays.map(d=>(d+1)%7)}:{})});};
 }
 function diaryHTML(){
  const entries=(state.foodEntries||[]).filter(x=>x.date===diaryDate),record=state.foodLogs.find(x=>x.date===diaryDate);
  const total=k=>!entries.length&&record?.source!=='entries'?record?.[k]??null:entries.length&&entries.every(e=>e.snapshot.values[k]!=null)?entries.reduce((s,e)=>s+Number(e.snapshot.values[k]),0):null;
  return `<section id="food-diary" class="coach-card">
   <h3>🍽️ سجل أكلك الفعلي (${diaryDate})</h3>
   <div class="coach-metrics compact">
    <div><strong>${round(total('energy'))}</strong> سعر مسجل</div>
    <div><strong>${round(total('protein'))}</strong> جم بروتين</div>
    <div><strong>${record?.complete?'مكتمل ✓':'مفتوح'}</strong> حالة اليوم</div>
   </div>
   ${record&&record.source!=='entries'?`<p class="coach-notice">اليوم محفوظ كإجمالي ${round(record.energy)} سعر.</p><button id="switch-diary-mode" class="secondary">حوّل اليوم لتسجيل الوجبات</button>`:''}
   ${entries.map(e=>`<article class="diary-row"><div><strong>${esc(e.snapshot.name)}</strong><p>${SLOTS[e.slot]} · ${macroLine(e.snapshot)}${e.snapshot.is_approximate?' · تقدير يدوي':''}</p></div><button class="secondary" data-delete-food="${e.id}" aria-label="حذف ${esc(e.snapshot.name)}">حذف</button></article>`).join('')||'<p>لسه مفيش وجبات مسجلة لليوم ده. اضغط «✓ أكلت الوجبة» من وجبات اليوم فوق أو ضيف وجبة يدوية.</p>'}
   <div class="meal-actions">
    <button id="toggle-complete" ${!entries.length?'disabled':''}>${record?.complete?'إعادة فتح اليوم للتعديل':'✅ قفل اليوم (سجلت كل أكلي)'}</button>
   </div>
   <details><summary>➕ إضافة صنف بالجرام أو وجبة خارجية</summary>
    <label>تاريخ التسجيل <input id="diary-date" type="date" min="${dateOffset(state.serverDate||localDate(),-90)}" max="${state.serverDate||localDate()}" value="${diaryDate}"></label>
    <form id="food-search"><input name="q" aria-label="اسم الصنف" placeholder="ابحث عن صنف: فول، فراخ، أرز…"><button>بحث عن صنف</button></form>
    <div id="food-search-results"></div>
    <hr style="border:0;border-top:1px solid #e2ece6;margin:12px 0">
    <form id="manual-food" data-diary-date="${diaryDate}" class="coach-grid">
     <label>اسم الوجبة اليدوية <input name="name" maxlength="120" required></label>
     <label>الوجبة <select name="slot">${Object.entries(SLOTS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
     <label>السعرات <input name="energy" type="number" min="1" max="10000" required></label>
     <label>البروتين بالجرام (اختياري) <input name="protein" type="number" step="0.1" min="0" max="2000"></label>
     <button>إضافة الوجبة</button>
    </form>
   </details>
  </section>`;
 }
 function mealHTML(m,date){
  const recorded=(state.foodEntries||[]).some(e=>e.mealId===m.id&&e.date===date),canLog=date<=(state.serverDate||localDate());
  return `<article class="meal-card">
   <h3>${esc(SLOTS[m.slot]||'وجبة')}: ${esc(m.snapshot.name)}</h3>
   <p><strong>${macroLine(m.snapshot)}</strong></p>
   <ul>${m.snapshot.ingredients.map(x=>`<li>${esc(x.name)}: ${round(x.grams)} جرام <small>(${esc(stateLabels[x.state]||x.state)})</small></li>`).join('')}</ul>
   <div class="meal-actions">
    ${recorded?'<span class="coach-success">✓ متسجلة في يومك</span>':canLog?`<form class="planned-food" data-meal="${m.id}" data-date="${date}" data-slot="${m.slot}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%"><select name="quantity" aria-label="الكمية" style="flex:1;min-width:120px;margin:0"><option value="1">الحصة كاملة (100%)</option><option value="0.5">نصف الحصة (50%)</option><option value="0.75">ثلاثة أرباع (75%)</option><option value="1.5">حصة ونصف (150%)</option></select><button style="margin:0">✓ أكلت الوجبة</button></form>`:'<small>متاح في يومه</small>'}
    ${!recorded&&date>=(state.serverDate||localDate())?`<button class="secondary" data-meal-alt="${m.id}">🔄 تبديل الوجبة</button>`:''}
   </div>
  </article>`;
 }
 function exerciseHTML(e,day){
  const adjustment=state.sessionAdjustment&&Date.parse(state.sessionAdjustment.expiresAt)>Date.parse(state.serverNow||new Date().toISOString())?state.sessionAdjustment:null;
  const sets=effectiveSets(state,e,state.serverDate||localDate(),Date.parse(state.serverNow||new Date().toISOString()));
  const last=state.workoutLogs.filter(l=>l.exerciseId===e.id&&(e.progressionKey?l.progressionKey===e.progressionKey:l.planId===state.workoutPlan.id)).sort((a,b)=>(a.date||a.at.slice(0,10)).localeCompare(b.date||b.at.slice(0,10))||Date.parse(a.at)-Date.parse(b.at)).at(-1);
  const regions=e.regions||[];const blocked=regions.some(r=>['hold','caution'].includes(state.recovery?.muscles?.[r]?.status));
  const defaultKg=e.suggestedKg!=null&&state.recovery?.progressionAllowed&&!blocked?e.suggestedKg:(last?.sets?.[0]?.kg??(e.loadMode==='bodyweight'?0:20));
  const loggedToday=last&&(last.date||last.at.slice(0,10))===(state.serverDate||localDate());
  return `<article class="meal-card">
   <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
    <h3 dir="auto" style="margin:0">${esc(e.name)}</h3>
    <span style="font-size:12px;background:#e6f2ec;color:#1b4332;padding:4px 8px;border-radius:8px;font-weight:700">${esc(regionNames(regions))}</span>
   </div>
   <p style="margin:6px 0"><strong>المطلوب:</strong> ${sets} مجموعات × ${e.repMin}–${e.repMax} عدات ${['unilateral','alternating'].includes(e.laterality)?'(لكل جانب)':''} · راحة ${e.restSeconds}ث · احتياط RIR ${e.rir}</p>
   ${adjustment?`<small class="coach-notice" style="display:block">تخفيف مؤقت للاستشفاء (الخطة الأساسية ${e.sets} مجموعات).</small>`:''}
   ${e.suggestedKg!=null&&state.recovery?.progressionAllowed&&!blocked?`<p class="coach-success">⬆️ الحمل المقترح اليوم: ${e.suggestedKg} كجم (${esc(e.progressionReason)})</p>`:''}
   ${blocked?'<p class="coach-notice">⚠️ العضلات المستهدفة مجهدة؛ ثبت الوزن أو خففه اليوم.</p>':''}
   ${loggedToday?`<p class="coach-success">✓ تم تسجيل التمرين اليوم (${last.sets.map(s=>`${s.kg}كجم×${s.reps}`).join('، ')})</p>`:''}
   <form class="workout-log" data-id="${e.id}" data-day="${day.dayIndex}">
    <input type="hidden" name="date" value="${state.serverDate||localDate()}">
    <div class="set-rows">
     ${Array.from({length:sets},(_,idx)=>{
      const prevSet=last?.sets?.[idx]||last?.sets?.[0];
      return `<div class="set-row">
       <strong>مجموعة ${idx+1}</strong>
       <label>الوزن (كجم)<input type="number" name="set_kg_${idx}" step="0.5" min="0" max="500" value="${prevSet?.kg??defaultKg}" required></label>
       <label>العدات<input type="number" name="set_reps_${idx}" min="1" max="100" value="${e.repMax}" required></label>
       <label>الاحتياط RIR<input type="number" name="set_rir_${idx}" min="0" max="10" value="${e.rir}" required></label>
      </div>`;
     }).join('')}
    </div>
    ${['unilateral','alternating'].includes(e.laterality)?'<label><input name="bothSides" type="checkbox" checked> كملت مجموعات الجانبين بنفس الوزن</label>':''}
    <div class="meal-actions">
     <button type="submit">✓ حفظ أداء التمرين</button>
     <button type="button" class="secondary" data-exercise-alt="${e.id}" data-day="${day.dayIndex}">🔄 تبديل التمرين</button>
    </div>
    <details style="margin-top:8px"><summary>خيارات متقدمة وشرح التمرين</summary>
     <label>أصغر زيادة متاحة في الجيم (كجم) <input name="increment" type="number" min="0.1" step="0.1" value="2.5"></label>
     <label><input name="pain" type="checkbox"> حسيت بألم مفصلي أثناء الحركة</label>
     <p dir="ltr" class="exercise-description">${esc(e.description)}</p>
    </details>
   </form>
  </article>`;
 }
 function workoutHTML(){
  const plan=state.workoutPlan;
  if(state.eligibility?.status==='needs_health_confirmation')return `<form id="confirm-existing-health" class="coach-card"><h3>تأكيد الجاهزية الصحية</h3><p>نسختك السابقة للتمرين فقط لم تسأل عن الأمراض. أكّد حالتك قبل اقتراح تدريب جديد.</p><label><input name="healthy" type="checkbox" required> لا توجد حالة صحية أو موانع تحتاج خطة متخصص.</label><label><input name="injuryFree" type="checkbox" required> لا توجد إصابة حالية تحتاج خطة علاجية.</label><button>تأكيد ومتابعة خطتي</button></form>`;
  if(state.eligibility?.needsScheduleConfirmation&&plan)return `<form id="confirm-schedule" class="coach-card"><h3>تأكيد أيام الجلسات المحفوظة</h3><p>اختار اليوم المقصود لكل جلسة:</p>${plan.days.map(d=>`<label>${esc(FOCUS_LABELS[d.focus]||d.focus)} (${d.exercises[0]?esc(d.exercises[0].name):'جلسة'})<select name="day:${d.dayIndex}" required><option value="">اختار اليوم المقصود</option>${days.map((name,index)=>`<option value="${index}">${name}</option>`).join('')}</select></label>`).join('')}<button>تأكيد الأيام</button></form>`;
  if(!plan)return '<div class="coach-card"><p>مسارك الحالي للأكل فقط بدون جدول تمارين.</p></div>';
  const todayDayIndex=new Date((state.serverDate||localDate())+'T12:00:00Z').getUTCDay();
  return `${state.scheduledSessions?.[0]?`<p class="coach-notice">📅 الجلسة القادمة: <strong>${state.scheduledSessions[0].date}</strong> · ${esc(FOCUS_LABELS[state.scheduledSessions[0].focus]||state.scheduledSessions[0].focus)}</p>`:''}
   ${plan.warnings.map(w=>`<p class="coach-notice">${esc(w)}</p>`).join('')}
   ${plan.days.map((d,idx)=>`<details class="coach-card" data-day="${d.dayIndex}" ${(d.dayIndex===todayDayIndex||idx===0)?'open':''}>
    <summary>${days[d.dayIndex]} · ${esc(FOCUS_LABELS[d.focus]||d.focus)} · ${d.location==='home'?'🏠 البيت':'🏋️ الجيم'} (${d.estimatedMinutes||d.duration} د)</summary>
    ${d.exercises.map(e=>exerciseHTML(e,d)).join('')}
    <form class="session-log meal-card" data-day="${d.dayIndex}" style="margin-top:12px">
     <h3>✅ إنهاء الجلسة بالكامل</h3>
     <input type="hidden" name="date" value="${state.serverDate||localDate()}">
     <div class="coach-grid">
      <label>حالة الجلسة <select name="status"><option value="completed">كملت الجلسة ✓</option><option value="partial">كملت جزء منها</option><option value="missed">فاتتني الجلسة</option></select></label>
      <label>المدة الفعلية (دقائق) <input name="duration" type="number" min="1" max="240" value="${d.estimatedMinutes||d.duration}"></label>
      <label>صعوبة الجلسة (RPE من 10) <input name="rpe" type="number" min="0" max="10" step="0.5" value="7.5"></label>
     </div>
     <button>حفظ إنهاء الجلسة</button>
    </form>
    <details style="margin-top:8px"><summary>📅 تأجيل أو نقل موعد الجلسة ليوم آخر</summary>
     <form class="reschedule-form" data-day="${d.dayIndex}">
      <label>الموعد البديل <input name="toDate" type="date" min="${state.serverDate||localDate()}" max="${dateOffset(state.serverDate||localDate(),13)}" required></label>
      <button class="secondary">نقل الجلسة</button>
     </form>
    </details>
   </details>`).join('')}
   <details class="coach-card"><summary>📊 إجمالي المجموعات الأسبوعية لكل عضلة</summary>
    <div class="coach-tags">${Object.entries(plan.weeklySets||{}).map(([r,n])=>`<span>${esc(MUSCLE_REGIONS[r]||r)}: ${n} مجموعات</span>`).join('')}</div>
   </details>`;
 }
 function recoveryHTML(){
  const latest=state.checkins.at(-1),muscles=state.recovery?.muscles||{};
  const lastWeight=state.weights.at(-1)?.kg??state.profile?.weight??80;
  return `<form id="weight-log" class="coach-card">
   <h3>⚖️ تسجيل وزن اليوم (${state.serverDate||localDate()})</h3>
   <input type="hidden" name="date" value="${state.serverDate||localDate()}">
   <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
    <label style="flex:1;min-width:160px;margin:0">الوزن بالكيلوجرام <input name="kg" type="number" step="0.1" min="35" max="250" value="${lastWeight}" required></label>
    <button style="margin:0">✓ حفظ الوزن</button>
   </div>
   ${state.weights.length?`<div class="coach-tags" style="margin-top:10px">${state.weights.slice(-7).reverse().map(w=>`<span>${w.date}: <strong>${w.kg} كجم</strong></span>`).join('')}</div>`:'<p><small>لم تسجل أوزان بعد في هذه الجولة.</small></p>'}
  </form>
  <form id="recovery-log" class="coach-card">
   <h3>😴 متابعة الاستشفاء والنوم اليومية</h3>
   <p><small>القيم جاهزة افتراضياً ليوم طبيعي لتسهيل التجربة على الموبايل — عدّلها أو اضغط حفظ مباشرة:</small></p>
   <div class="coach-grid">
    ${[['sleepHours','ساعات النوم',0,24,.5,7.5],['sleepQuality','جودة النوم (1 ضعيف — 5 ممتاز)',1,5,1,4],['fatigue','الإجهاد العام (1 قليل — 5 شديد)',1,5,1,2],['stress','الضغط النفسي (1 قليل — 5 شديد)',1,5,1,2]].map(([k,l,min,max,step,def])=>`<label>${l}<input name="${k}" type="number" min="${min}" max="${max}" step="${step}" ${k==='stress'?'':'required'} value="${latest?.date===(state.serverDate||localDate())?esc(latest[k]??def):def}"></label>`).join('')}
   </div>
   <details style="margin:10px 0"><summary>تحديد شدة وجع العضلات (DOMS) أو ألم الحركة (اختياري)</summary>
    <div class="coach-grid">${Object.entries(MUSCLE_REGIONS).map(([key,name])=>`<label>${name} (0-10)<input name="sore:${key}" type="number" min="0" max="10" placeholder="0"><small>${muscles[key]?.soreness==null?'':`آخر متابعة: ${muscles[key].soreness}/10`}</small></label>`).join('')}</div>
    <label><input type="checkbox" name="pain"> عندي ألم حاد أو ألم مفصلي أثناء الحركة</label>
    <div class="coach-tags">${Object.entries(MUSCLE_REGIONS).map(([key,name])=>`<label><input type="checkbox" name="pain:${key}"> ${name}</label>`).join('')}</div>
    <label><input type="checkbox" name="illness"> عندي أعراض برد أو سخونية اليوم</label>
    <label><input type="checkbox" name="redFlags"> ألم صدر أو دوخة شديدة</label>
   </details>
   <button>✓ حفظ متابعة الاستشفاء</button>
  </form>`;
 }
 function render(){
  if(!busy)captureDrafts();viewVersion++;
  if(simulationMode&&!state.simulation){root.innerHTML='<div class="coach-app" dir="rtl"><div id="coach-feedback" role="alert" class="coach-notice" hidden></div>'+simulationPanel(state,true)+'</div>';wireSimulation();return;}
  if(!state.profile)return onboarding();
  const plan=state.plans.find(p=>p.id===state.active_plan_id),ready=state.recovery||{status:'unknown',reasons:[]};
  const status={unknown:'في انتظار تسجيل متابعة اليوم',ready:'جاهز للتمرين بحمل كامل ✓',caution:'ينصح بتخفيف المجهود اليوم',high:'إجهاد مرتفع — الأولوية للاستشفاء',hold:'وقّف الحركة المؤلمة فوراً',stop:'أوقف التمرين واطلب تقييم طبي'};
  const pendingAdaptations=state.adaptations.filter(a=>a.status==='pending');
  const todayStr=state.serverDate||localDate();
  const todayPlanDay=plan?.days.find(d=>d.date===todayStr)||plan?.days[0];
  const otherPlanDays=plan?.days.filter(d=>d!==todayPlanDay)||[];

  root.innerHTML=`<div class="coach-app" dir="rtl">
   <div id="coach-feedback" role="status" class="coach-notice" hidden></div>
   ${simulationPanel(state,simulationMode)}
   <header class="coach-heading">
    <div>
     <small>خطتك الذكية ومتابعتك اليومية</small>
     <h2>أهلًا ${esc(state.profile.name)} 👋</h2>
     <p>${esc(status[ready.status])} ${ready.reasons?.length?'· '+ready.reasons.map(esc).join('، '):''}</p>
    </div>
    <div class="coach-heading-actions">
     <button id="edit-profile" class="secondary">⚙️ بياناتي</button>
     <button id="export-coach" class="secondary">📥 تصدير</button>
    </div>
   </header>

   ${pendingAdaptations.length?`<section class="coach-notice proposal-banner" role="alert">
    <strong>🔔 اقتراح جديد من المحرك جاهز لموافقتك:</strong>
    ${pendingAdaptations.map(a=>`<div style="margin-top:8px">
     <p style="margin:0 0 8px"><strong>${esc(a.reason)}</strong> ${a.delta?`(${a.delta>0?'+'+a.delta:a.delta} سعر/يوم بداية من الغد)`:''}</p>
     <button data-adapt="${a.id}" data-accept="true">✅ موافق على التعديل</button>
     <button class="secondary" data-adapt="${a.id}" data-accept="false">احتفظ بخطتي الحالية</button>
    </div>`).join('')}
   </section>`:''}

   <nav class="coach-tabs" aria-label="أقسام المتابعة">
    <button type="button" class="tab-btn ${activeTab==='nutrition'?'active':''}" data-tab="nutrition"><span class="tab-icon">🥗</span><span>الأكل</span></button>
    <button type="button" class="tab-btn ${activeTab==='workout'?'active':''}" data-tab="workout"><span class="tab-icon">💪</span><span>التمرين</span></button>
    <button type="button" class="tab-btn ${activeTab==='recovery'?'active':''}" data-tab="recovery"><span class="tab-icon">😴</span><span>الوزن والنوم</span></button>
    <button type="button" class="tab-btn ${activeTab==='review'?'active':''}" data-tab="review"><span class="tab-icon">📊</span><span>المراجعة ${pendingAdaptations.length?`<b class="tab-badge">${pendingAdaptations.length}</b>`:''}</span></button>
    <button type="button" class="tab-btn ${activeTab==='catalog'?'active':''}" data-tab="catalog"><span class="tab-icon">📚</span><span>المكتبة</span></button>
   </nav>

   <section id="nutrition-coach" ${activeTab==='nutrition'?'':'hidden'}>
    ${plan?`<div class="coach-metrics">
     <div><strong>${round(plan.targets.energy)}</strong> سعر/يوم</div>
     <div><strong>${round(plan.targets.protein)}</strong> جم بروتين</div>
     <div><strong>${round(plan.targets.carbs)}</strong> جم كارب</div>
     <div><strong>${round(plan.targets.fat)}</strong> جم دهون</div>
    </div>
    ${plan.effective_from&&(plan.effective_from>todayStr)?`<p class="coach-notice">الأهداف الجديدة تبدأ يوم ${plan.effective_from}. سجل الأيام السابقة محفوظ.</p>`:''}
    ${todayPlanDay?`<div class="coach-card">
     <h3>📅 وجبات يومك المقترحة (${todayPlanDay.date} · ${round(todayPlanDay.summary.values.energy)} سعر)</h3>
     <p><small>اضغط «✓ أكلت الوجبة» لتسجيلها في يومك الفعلي بضغطة واحدة:</small></p>
     ${todayPlanDay.meals.map(m=>mealHTML(m,todayPlanDay.date)).join('')}
    </div>`:''}
    ${otherPlanDays.length?`<details class="coach-card"><summary>🗓️ عرض باقي أيام الأسبوع (${otherPlanDays.length} أيام)</summary>
     ${otherPlanDays.map(d=>`<details style="margin:10px 0;padding:8px;border:1px solid #e2ece6;border-radius:12px"><summary>${d.date} · ${round(d.summary.values.energy)} سعر</summary>${d.meals.map(m=>mealHTML(m,d.date)).join('')}</details>`).join('')}
    </details>`:''}
    ${plan.days.at(-1).date<todayStr?'<button id="renew-plan">🔄 جهز أسبوع جديد بنفس اختياراتي</button>':''}`:'<p class="coach-card">مسارك الحالي للتمارين فقط؛ وتقدر تسجل أكلك الفعلي بالأسفل.</p>'}
    ${diaryHTML()}
   </section>

   <section id="workout-coach" ${activeTab==='workout'?'':'hidden'}>
    ${workoutHTML()}
   </section>

   <section id="recovery-coach" ${activeTab==='recovery'?'':'hidden'}>
    ${recoveryHTML()}
   </section>

   <section class="coach-card" id="coach-review" ${activeTab==='review'?'':'hidden'}>
    <h2>📊 مراجعة الأداء والقرارات الذكية</h2>
    <p>المحرك بيراجع اتجاه الوزن لآخر أسبوعين (مطلوب 3 أوزان على الأقل في كل أسبوع)، واكتمال تسجيل الأكل (10 أيام من 14)، وأداء التمارين والاستشفاء.</p>
    <button id="review-coach">🔍 شغّل مراجعة الأداء الآن</button>
    ${state.lastReview?`<div class="coach-notice" style="margin-top:14px">
     <strong>النتيجة: ${esc(state.lastReview.message)}</strong>
     <p>🥗 <strong>التغذية:</strong> ${esc(state.lastReview.nutrition.reason)}</p>
     ${state.lastReview.nutrition.coverage?`<div class="coach-tags">
      <span>أوزان الأسبوع السابق: ${state.lastReview.nutrition.coverage.previousWeights}/3</span>
      <span>أوزان الأسبوع الحالي: ${state.lastReview.nutrition.coverage.currentWeights}/3</span>
      <span>أيام الأكل المكتملة: ${state.lastReview.nutrition.coverage.completeFoodDays}/10</span>
     </div>`:''}
     ${state.lastReview.volume?`<p>💪 <strong>حجم التمرين:</strong> ${esc(state.lastReview.volume.reason)}</p>`:''}
     <p>🏋️ <strong>ملخص الجلسات (آخر 14 يوم):</strong> ${state.lastReview.workout.completed} مكتملة · ${state.lastReview.workout.partial||0} جزئية · ${state.lastReview.workout.missed} فائتة</p>
    </div>`:''}
    ${pendingAdaptations.map(a=>`<article class="meal-card" style="margin-top:12px">
     <p><strong>${esc(a.reason)}</strong></p>
     ${a.delta?`<p>التعديل المقترح: ${a.delta} سعر/يوم (يبدأ من الغد بعد موافقتك).</p>`:''}
     <button data-adapt="${a.id}" data-accept="true">✅ موافق على التعديل</button>
     <button class="secondary" data-adapt="${a.id}" data-accept="false">احتفظ بخطتي</button>
    </article>`).join('')}
    <details style="margin-top:16px"><summary>📜 نسخ خطط الأكل السابقة (${state.planRefs?.length||0})</summary>
     ${(state.planRefs||[]).slice().reverse().map(p=>`<p>${p.start_date} · ${round(p.energy)} سعر · ${esc(p.reason)} <button class="secondary" data-view-plan="${p.id}">عرض</button></p>`).join('')}
    </details>
   </section>

   <section id="catalog-coach" class="coach-card" ${activeTab==='catalog'?'':'hidden'}>
    <h2>📚 مكتبة التمارين المعتمدة (868 تمرين)</h2>
    <form id="catalog-search" class="coach-grid">
     <label>اسم التمرين <input name="q" placeholder="Squat, Row, Bench…" value="${esc(catalogQuery)}"></label>
     <label>العضلة المستهدفة <select name="muscle"><option value="">كل العضلات</option>${Object.entries(MUSCLE_REGIONS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
     <button>بحث في المكتبة</button>
    </form>
    <div id="catalog-results"></div>
   </section>

   <dialog id="coach-dialog"><button id="close-dialog" class="secondary" aria-label="إغلاق">✕ إغلاق</button><div id="dialog-body"></div></dialog>
  </div>`;
  wire();wireSimulation();restoreDrafts();
 }
 function showDialog(html){const dialog=root.querySelector('#coach-dialog');dialog.querySelector('#dialog-body').innerHTML=html;dialog.showModal();}
 function wire(){
  root.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{activeTab=btn.dataset.tab;render();});
  root.querySelector('#edit-profile').onclick=()=>{if(uncertainWrite){notice('أكد العملية المعلقة الأول.',true);retryUncertain();}else onboarding();};
  root.querySelector('#close-dialog').onclick=()=>root.querySelector('#coach-dialog').close();
  root.querySelector('#export-coach').onclick=async()=>{
   try{const plans=[],workoutPlans=[];for(const p of state.planRefs||[])plans.push(await api('plans/'+encodeURIComponent(p.id)));for(const p of state.workoutPlanRefs||[])workoutPlans.push(await api('workout-plans/'+encodeURIComponent(p.id)));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({...state,plans,workoutPlans},null,2)],{type:'application/json'}));a.download='coaching-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){notice(e.message,true);}
  };
  const diaryInput=root.querySelector('#diary-date');
  if(diaryInput)diaryInput.onchange=e=>{diaryDate=e.target.value;render();};
  root.querySelector('#switch-diary-mode')?.addEventListener('click',()=>send('food_switch_to_entries',{date:diaryDate,confirm:true}));
  const toggleBtn=root.querySelector('#toggle-complete');
  if(toggleBtn)toggleBtn.onclick=()=>send('food_complete',{date:diaryDate,complete:!state.foodLogs.find(x=>x.date===diaryDate)?.complete});
  root.querySelectorAll('[data-delete-food]').forEach(b=>b.onclick=()=>send('food_delete',{id:b.dataset.deleteFood}));
  root.querySelectorAll('.planned-food').forEach(form=>form.onsubmit=e=>{e.preventDefault();diaryDate=form.dataset.date;send('food_entry',{...formData(form),date:form.dataset.date,slot:form.dataset.slot,mealId:form.dataset.meal,source:'planned'});});
  const manualForm=root.querySelector('#manual-food');
  if(manualForm)manualForm.onsubmit=e=>{e.preventDefault();send('food_entry',{...formData(e.target),date:diaryDate,source:'manual'});};
  const foodSearchForm=root.querySelector('#food-search');
  if(foodSearchForm)foodSearchForm.onsubmit=async e=>{
   e.preventDefault();const version=viewVersion,request=++foodRequest;try{const result=await api('foods?q='+encodeURIComponent(new FormData(e.target).get('q')));if(version!==viewVersion||request!==foodRequest)return;root.querySelector('#food-search-results').innerHTML=result.items.map(i=>`<form class="ingredient-log" data-diary-date="${diaryDate}" data-key="${esc(i.key)}"><h4>${esc(i.name)}</h4><p>${round(i.values.energy)} سعر/100 جرام · ${esc(stateLabels[i.state]||i.state)}</p><label>الكمية بالجرام <input name="grams" type="number" min="1" max="2000" required></label><label>الوجبة<select name="slot">${Object.entries(SLOTS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><button>إضافة الصنف</button></form>`).join('')||'<p>مفيش نتيجة في مكتبة الأصناف الحالية؛ استخدم الإضافة اليدوية.</p>';restoreDrafts(root.querySelector('#food-search-results'));root.querySelectorAll('.ingredient-log').forEach(form=>form.onsubmit=e=>{e.preventDefault();send('food_entry',{...formData(form),source:'ingredient',key:form.dataset.key,date:diaryDate});});}catch(e){notice(e.message,true);}
  };
  root.querySelectorAll('[data-meal-alt]').forEach(b=>b.onclick=async()=>{const version=viewVersion,request=++alternativeRequest;try{const result=await api('meal-alternatives?mealId='+encodeURIComponent(b.dataset.mealAlt));if(version!==viewVersion||request!==alternativeRequest)return;showDialog('<h2>بدائل بنفس القيود الغذائية</h2>'+result.items.map(a=>`<article><h3>${esc(a.snapshot.name)}</h3><p>${macroLine(a.snapshot)}</p><p>فرق السعرات ${a.energy_delta} · فرق البروتين ${a.protein_delta} جرام</p><button data-replace-meal="${esc(a.snapshot.template_id)}">اختيار البديل</button></article>`).join('')+(result.items.length?'':'<p>مفيش بديل متاح يحقق نفس اختياراتك وحدود النظام.</p>'));root.querySelectorAll('[data-replace-meal]').forEach(choice=>choice.onclick=()=>send('replace_meal',{mealId:b.dataset.mealAlt,templateId:choice.dataset.replaceMeal}));}catch(e){notice(e.message,true);}});
  root.querySelectorAll('[data-exercise-alt]').forEach(b=>b.onclick=async()=>{const version=viewVersion,request=++alternativeRequest;try{const result=await api('exercise-alternatives?exerciseId='+encodeURIComponent(b.dataset.exerciseAlt)+'&dayIndex='+b.dataset.day);if(version!==viewVersion||request!==alternativeRequest)return;showDialog('<h2>بدائل لنفس الحركة والمعدات</h2>'+result.items.map(a=>`<article><h3 dir="auto">${esc(a.name)}</h3><p dir="ltr">${a.equipment.map(q=>esc(q.equipment_id)).join(', ')}</p><button data-replace-exercise="${a.id}">اختيار التمرين</button></article>`).join('')+(result.items.length?'':'<p>مفيش بديل مناسب متاح بالمعدات دي.</p>'));root.querySelectorAll('[data-replace-exercise]').forEach(choice=>choice.onclick=()=>send('replace_exercise',{dayIndex:Number(b.dataset.day),exerciseId:b.dataset.exerciseAlt,alternativeId:choice.dataset.replaceExercise}));}catch(e){notice(e.message,true);}});
  root.querySelectorAll('.workout-log').forEach(form=>form.onsubmit=e=>{
   e.preventDefault();const fd=new FormData(form);
   const sets=[];
   for(let idx=0;fd.has(`set_kg_${idx}`);idx++){
    sets.push({kg:fd.get(`set_kg_${idx}`),reps:fd.get(`set_reps_${idx}`),rir:fd.get(`set_rir_${idx}`)||null,pain:fd.has('pain')});
   }
   send('workout',{exerciseId:form.dataset.id,dayIndex:Number(form.dataset.day),date:fd.get('date'),sets,bothSides:fd.has('bothSides'),increment:fd.get('increment')});
  });
  root.querySelectorAll('.session-log').forEach(form=>form.onsubmit=e=>{e.preventDefault();send('session',{...formData(form),dayIndex:Number(form.dataset.day)});});
  root.querySelectorAll('.reschedule-form').forEach(form=>form.onsubmit=e=>{e.preventDefault();send('reschedule',{...formData(form),dayIndex:Number(form.dataset.day)});});
  const weightForm=root.querySelector('#weight-log');
  if(weightForm)weightForm.onsubmit=e=>{e.preventDefault();send('weight',formData(e.target));};
  const recoveryForm=root.querySelector('#recovery-log');
  if(recoveryForm)recoveryForm.onsubmit=e=>{
   e.preventDefault();const p=formData(e.target);p.sorenessByRegion={};p.painRegions=[];for(const key of Object.keys(p)){if(key.startsWith('sore:')){if(p[key]!=='')p.sorenessByRegion[key.slice(5)]=Number(p[key]);delete p[key];}else if(key.startsWith('pain:')){if(p[key])p.painRegions.push(key.slice(5));delete p[key];}}send('recovery',p);
  };
  root.querySelector('#confirm-schedule')?.addEventListener('submit',e=>{e.preventDefault();const values=formData(e.target),dayMap=Object.fromEntries(Object.entries(values).map(([k,v])=>[k.slice(4),Number(v)]));send('confirm_schedule',{dayMap});});
  root.querySelector('#confirm-existing-health')?.addEventListener('submit',e=>{e.preventDefault();send('confirm_health',formData(e.target));});
  const reviewBtn=root.querySelector('#review-coach');
  if(reviewBtn)reviewBtn.onclick=()=>send('review',{});
  root.querySelectorAll('[data-adapt]').forEach(b=>b.onclick=()=>send('adaptation',{id:b.dataset.adapt,accept:b.dataset.accept==='true'}));
  root.querySelector('#renew-plan')?.addEventListener('click',()=>send('renew_plan',{}));
  root.querySelectorAll('[data-view-plan]').forEach(b=>b.onclick=async()=>{try{const p=await api('plans/'+encodeURIComponent(b.dataset.viewPlan));showDialog(`<h2>نسخة ${esc(p.created_at.slice(0,10))}</h2><p>${round(p.targets.energy)} سعر · ${esc(p.changeReason||'الخطة الأصلية')}</p>`+p.days.map(d=>`<h3>${d.date}</h3>${d.meals.map(m=>`<p>${esc(m.snapshot.name)} · ${macroLine(m.snapshot)}</p>`).join('')}`).join(''));}catch(e){notice(e.message,true);}});
  const search=async(offset=0)=>{
   const form=root.querySelector('#catalog-search'),fd=new FormData(form);catalogQuery=String(fd.get('q'));catalogOffset=offset;const version=viewVersion,request=++catalogRequest;
   try{const d=await api('exercises?q='+encodeURIComponent(catalogQuery)+'&muscle='+encodeURIComponent(fd.get('muscle'))+'&offset='+offset);if(version!==viewVersion||request!==catalogRequest)return;root.querySelector('#catalog-results').innerHTML=`<p>${d.total} نتيجة · ${Math.min(offset+1,d.total)}–${Math.min(offset+30,d.total)}</p>`+d.items.map(x=>`<details><summary>${esc(x.name)}</summary><p>أساسية: ${x.muscles.filter(m=>m.role==='primary').map(m=>esc(m.muscle_id)).join(', ')}</p><p>ثانوية: ${x.muscles.filter(m=>m.role==='secondary').map(m=>esc(m.muscle_id)).join(', ')||'غير مسجلة'}</p><p dir="ltr" class="exercise-description">${esc(x.description)}</p><p dir="ltr">${x.equipment.map(q=>esc(q.equipment_id)).join(', ')}</p><small>${esc(x.source)} · ${esc(x.author)} · ${esc(x.license)}</small></details>`).join('')+`<div>${offset?'<button id="catalog-prev" class="secondary">السابق</button>':''}${d.nextOffset!=null?'<button id="catalog-next">التالي</button>':''}</div>`;root.querySelector('#catalog-prev')?.addEventListener('click',()=>search(Math.max(0,catalogOffset-30)));root.querySelector('#catalog-next')?.addEventListener('click',()=>search(d.nextOffset));}catch(e){notice(e.message,true);}
  };
  const catalogForm=root.querySelector('#catalog-search');
  if(catalogForm)catalogForm.onsubmit=e=>{e.preventDefault();search();};
 }
 try{state=await api('state');diaryDate=state.serverDate;render();}catch(e){root.innerHTML=`<div class="coach-notice"><p>${esc(e.message)}</p><button id="retry-coach">حاول تاني</button></div>`;root.querySelector('button').onclick=()=>mountPlanner({root,toast});}
}
