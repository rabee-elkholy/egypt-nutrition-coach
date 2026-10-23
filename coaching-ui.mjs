import {simulationPanel} from './simulation-ui.mjs?v=sim5';
import {mountOnboardingChat} from './onboarding-chat.mjs';
import {MUSCLE_REGIONS,FOCUS_LABELS,SLOTS,localDate,dateOffset,effectiveSets,onboardingState} from './coaching-shared.mjs';
import {householdQuantity,displayPortion} from './planner-household.mjs';
import {displayMealName,displayIngredientName} from './meal-presentation.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=n=>n==null?'—':Math.round(Number(n)||0);
const days=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','السبت'].length===6?['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']:['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const stateLabels={cooked:'مطبوخ',raw:'نيّ',as_sold:'كما يباع'};
const regionNames=regions=>(regions||[]).map(r=>MUSCLE_REGIONS[r]||r).join('، ');
const macroLine=s=>`${round(s.values.energy)} سعر · ${round(s.values.protein)} جرام بروتين`;
const ingredientLine=x=>{
 const h=householdQuantity(x),name=esc(displayIngredientName(x)),st=esc(stateLabels[x.state]||x.state);
 return h
  ?`<li><strong>${name}:</strong> <span style="color:#1b4332;font-weight:700">${esc(h.label)}</span> <small style="color:#52665a">(حوالي ${round(x.grams)} جم · ${st})</small></li>`
  :`<li><strong>${name}:</strong> ${round(x.grams)} جرام <small>(${st})</small></li>`;
};
const formData=form=>{const p=Object.fromEntries(new FormData(form));for(const x of form.querySelectorAll('[type=checkbox]'))p[x.name]=x.checked;return p;};

const DISEASE_LABELS={
 hypertension:'الضغط المرتفع (ملح منخفض)',
 insulin_resistance:'مقاومة الإنسولين (مؤشر جلايسيمي هادئ)',
 pcos:'تكيس المبايض (توازن الإنسولين)',
 ibs:'القولون العصبي (خفيف على الهضم)',
 cholesterol:'الكوليسترول (دهون صحية)',
 gout:'النقرس (تقليل البيورين وضبط البروتين)',
 anemia:'الأنيميا (غني بالحديد)',
 vitamin_d_deficiency:'دعم فيتامين د والكالسيوم',
 lactose_intolerance:'حساسية اللاكتوز',
 favism:'أنيميا الفول (استبعاد الفول)',
 fatty_liver:'دهون الكبد (تقليل السكريات والدهون المشبعة)'
};
const INJURY_LABELS={
 knee_pain:'حماية الركبة',
 lower_back_pain:'حماية أسفل الظهر',
 shoulder_pain:'حماية الكتف',
 wrist_pain:'حماية الرسغ',
 ankle_pain:'حماية الكاحل',
 neck_pain:'حماية الرقبة',
 hip_pain:'حماية الحوض',
 diastasis_recti:'حماية جدار البطن'
};

function buildSpecialistBrief(state,todayStr,todayPlanDay){
 const plan=state.plans.find(p=>p.id===state.active_plan_id);
 const ready=state.recovery||{status:'unknown',reasons:[]};
 const notes=[];
 // 1. Nutrition Specialist Note
 const weights=(state.weights||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
 const lastW=weights.at(-1),prevW=weights.at(-2);
 const todayFood=state.foodLogs.find(x=>x.date===todayStr);
 const yesterdayFood=state.foodLogs.find(x=>x.date===dateOffset(todayStr,-1));
 if(lastW&&prevW&&lastW.date===todayStr&&(lastW.kg-prevW.kg)>=0.4&&state.profile.goal==='lose'){
  const diff=Math.round((lastW.kg-prevW.kg)*10)/10;
  notes.push({role:'🥗 أخصائي التغذية',text:`زيادة الميزان النهاردة (+${diff} كجم) طبيعية جداً ومش دهون خالص؛ دي غالباً احتباس سوائل مؤقت بسبب الأملاح أو مجهود التمرين. مكملين على خطتنا بنفس الهدوء!`});
 }else if(lastW&&prevW&&lastW.date===todayStr&&(prevW.kg-lastW.kg)>=0.3&&state.profile.goal==='lose'){
  notes.push({role:'🥗 أخصائي التغذية',text:`نزول هايل في الميزان (${lastW.kg} كجم)! جسمك بيستجيب للخطة بشكل صحي ومنتظم من غير ما نفقد كتلة عضلية.`});
 }else if(todayFood?.complete){
  notes.push({role:'🥗 أخصائي التغذية',text:`برافو يا بطل! قفّلت وجبات النهاردة بالتزام ممتاز — جسمك كدة واخد احتياجه المظبوط من البروتين والطاقة.`});
 }else if(yesterdayFood?.complete&&(yesterdayFood.adherence??100)>=80){
  notes.push({role:'🥗 أخصائي التغذية',text:`التزامك بوجبات إمبارح كان ممتاز (${yesterdayFood.adherence||100}%)! كمل النهاردة بنفس الهدوء والبساطة.`});
 }else if(plan){
  notes.push({role:'🥗 أخصائي التغذية',text:`وجبات يومك جاهزة على مقاس هدفك (${round(plan.targets.energy)} سعر و${round(plan.targets.protein)} جم بروتين) — علّم على كل وجبة تخلصها بلمسة واحدة وهنقفل لك اليوم تلقائياً.`});
 }

 // 2. Training Captain Note
 const adjustment=state.sessionAdjustment&&Date.parse(state.sessionAdjustment.expiresAt)>Date.parse(state.serverNow||new Date().toISOString())?state.sessionAdjustment:null;
 const upgradedEx=state.workoutPlan?.days?.flatMap(d=>d.exercises||[]).find(e=>e.suggestedKg!=null);
 const todayScheduled=(state.scheduledSessions||[]).find(s=>s.date===todayStr);
 const todaySession=(state.sessions||[]).find(s=>s.date===todayStr&&s.planId===state.workoutPlan?.id);
 const nextScheduled=(state.scheduledSessions||[])[0];
 const hasTrainedBefore=(state.workoutLogs||[]).length>0||(state.sessions||[]).some(s=>s.status==='completed'||s.status==='partial');
 if(ready.status==='stop'||ready.status==='hold'){
  notes.push({role:'💪 كابتن التدريب',text:ready.reasons?.[0]||'سلامتك أولاً — ريّح جسمك النهاردة لحد ما تطمنّا عليك.'});
 }else if(adjustment||['caution','high'].includes(ready.status)){
  notes.push({role:'💪 كابتن التدريب',text:`لأن نومك كان قليل أو حاسس بإجهاد، خففنا لك حمل التمرين النهاردة علشان تحافظ على نشاطك وتحمي مفاصلك من غير إرهاق.`});
 }else if(todaySession?.status==='completed'){
  notes.push({role:'💪 كابتن التدريب',text:`عاش يا بطل! 💪 قفّلت تمرينة النهاردة بالكامل، اهتم بشرب المية ووجبة بعد التمرين للاستشفاء.`});
 }else if(upgradedEx&&ready.progressionAllowed){
  notes.push({role:'💪 كابتن التدريب',text:`تطوّر ممتاز! لأن أوزانك وعداتك في آخر تمرينتين كانت قوية وثابتة، الكابتن رفع لك الوزن المستهدف النهاردة في (${upgradedEx.name}) لـ ${upgradedEx.suggestedKg} كجم.`});
 }else if(todayScheduled){
  notes.push({role:'💪 كابتن التدريب',text:hasTrainedBefore?`عندك النهاردة تمرينة (${FOCUS_LABELS[todayScheduled.focus]||todayScheduled.focus}) — سجّل أوزانك وعداتك في كل تمرين وهنحسب لك الجلسة تلقائياً.`:`أهلاً بيك في أول يوم يا بطل! تمرينتك الأولى (${FOCUS_LABELS[todayScheduled.focus]||todayScheduled.focus}) جاهزة النهاردة في تبويب «التمرين» — ابدأ بأوزان مريحة وسجّل أداءك.`});
 }else if(state.workoutPlan&&!hasTrainedBefore){
  notes.push({role:'💪 كابتن التدريب',text:`أهلاً بيك في أول يوم يا بطل! خطة تمرينك جاهزة بالكامل في تبويب «التمرين» — تقدر تبدأ أول جلسة ليك النهاردة فوراً، أو في مواعيدك المحددة بدايةً من يوم ${nextScheduled?days[nextScheduled.dayIndex]:'التمرين القادم'}.`});
 }else if(state.workoutPlan){
  notes.push({role:'💪 كابتن التدريب',text:`النهاردة يوم راحة واستشفاء لعضلاتك بعد مجهود التمرين — خذ كفايتك من النوم والمية${nextScheduled?` استعداداً لتمرينة يوم ${days[nextScheduled.dayIndex]}`:''}.`});
 }

 const diseases=(state.profile?.diseases||[]).filter(x=>x&&x!=='none').map(x=>DISEASE_LABELS[x]||x);
 const injuries=(state.onboarding?.workoutPrefs?.injuries||[]).filter(x=>x&&x!=='none').map(x=>INJURY_LABELS[x]||x);
 const tags=[...diseases,...injuries];
 return `<section class="coach-card specialist-brief" style="background:linear-gradient(135deg,#f1f8f5 0%,#e6f4ed 100%);border-color:#b7dec9">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
   <strong style="color:#1b4332;font-size:15px">💬 متابعة فريق المتخصصين ليك النهاردة</strong>
   <span style="font-size:12px;background:#fff;color:#1b4332;padding:3px 10px;border-radius:999px;border:1px solid #cce3d6;font-weight:700">${todayStr}</span>
  </div>
  ${notes.map(n=>`<p style="margin:6px 0;font-size:14px;color:#163024;line-height:1.6"><strong>${esc(n.role)}:</strong> ${esc(n.text)}</p>`).join('')}
  ${tags.length?`<div class="coach-tags" style="margin-top:8px">${tags.map(t=>`<span style="background:#fff;border-color:#b7dec9;color:#1b4332">🩺 مراعاة: ${esc(t)}</span>`).join('')}</div>`:''}
 </section>`;
}

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
   notice(action==='simulation_next'?`بدأ اليوم ${state.simulation?.day||''} في المحاكاة.`:action==='simulation_fill'?'تم تسجيل سيناريو اليوم ومراجعة الخطة.':action==='review'?state.lastReview?.message||'تمت مراجعة فريق المتابعة.':'تم الحفظ بنجاح ✓');return true;
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
  root.innerHTML=`<div id="coach-feedback" role="alert" class="coach-notice" hidden></div><section class="coach-app"><h2>مراجعة جاهزية خطتك مع الفريق</h2><form id="readiness-form" class="coach-card">${needsHealth?'<p>لأنك اخترت مسار التمرين فقط، نستاذنك تؤكد عدم وجود موانع طبية حادة للتمرين.</p><label><input name="healthConfirmed" type="checkbox" required> أؤكد عدم وجود حالة طبية حرجة تمنع التمرين.</label>':''}${needsExternal?`<p>لأنك اخترت الأكل فقط مع هدف بناء العضلات، حدّد أيام تمارين المقاومة اللي بتعملها في الجيم أو البيت علشان نظبط لك البروتين والكارب عليها:</p><div class="coach-tags">${days.map((name,index)=>`<label><input type="checkbox" name="external:${index}"> ${name}</label>`).join('')}</div>`:''}<button>استلام خطتي الآن</button><button type="button" id="back-onboarding" class="secondary">الرجوع لبياناتي</button></form></section>`;
  root.querySelector('#back-onboarding').onclick=onboarding;
  root.querySelector('#readiness-form').onsubmit=e=>{e.preventDefault();const data=formData(e.target);const externalTrainingDays=Object.keys(data).filter(k=>k.startsWith('external:')&&data[k]).map(k=>Number(k.slice(9)));if(needsExternal&&!externalTrainingDays.length){notice('اختار يوم مقاومة واحدًا على الأقل، أو راجع هدفك.',true);return;}send('generate',{...draft,...(needsHealth?{healthConfirmed:data.healthConfirmed}:{}),...(needsExternal?{externalTrainingDays:externalTrainingDays.map(d=>(d+1)%7)}:{})});};
 }
 function diaryHTML(){
  const entries=(state.foodEntries||[]).filter(x=>x.date===diaryDate),record=state.foodLogs.find(x=>x.date===diaryDate);
  const total=k=>!entries.length&&record?.source!=='entries'?record?.[k]??null:entries.length&&entries.every(e=>e.snapshot.values[k]!=null)?entries.reduce((s,e)=>s+Number(e.snapshot.values[k]),0):null;
  return `<section id="food-diary" class="coach-card">
   <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
    <h3 style="margin:0">🍽️ اللي أكلته النهاردة (${diaryDate})</h3>
    <span style="font-size:12px;padding:4px 10px;border-radius:999px;font-weight:700;background:${record?.complete?'#e6f4ea':'#f0f5f2'};color:#1b4332">${record?.complete?'✅ يومك مكتمل ومحسوب في المتابعة':'⏳ بيتقفل تلقائياً مع تسجيل وجباتك'}</span>
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
    ${entries.length?`<div style="margin-top:10px"><button type="button" id="toggle-complete" class="secondary">${record?.complete?'إعادة فتح اليوم للتعديل':'✅ قفل اليوم يدوياً (لو اكتفيت بأكل النهاردة)'}</button></div>`:''}
   </details>
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
 function exerciseHTML(e,day){
  const adjustment=state.sessionAdjustment&&Date.parse(state.sessionAdjustment.expiresAt)>Date.parse(state.serverNow||new Date().toISOString())?state.sessionAdjustment:null;
  const sets=effectiveSets(state,e,state.serverDate||localDate(),Date.parse(state.serverNow||new Date().toISOString()));
  const last=state.workoutLogs.filter(l=>l.exerciseId===e.id&&(e.progressionKey?l.progressionKey===e.progressionKey:l.planId===state.workoutPlan.id)).sort((a,b)=>(a.date||a.at.slice(0,10)).localeCompare(b.date||b.at.slice(0,10))||Date.parse(a.at)-Date.parse(b.at)).at(-1);
  const regions=e.regions||[];const blocked=regions.some(r=>['hold','caution'].includes(state.recovery?.muscles?.[r]?.status));
  const defaultKg=e.suggestedKg!=null&&state.recovery?.progressionAllowed&&!blocked?e.suggestedKg:(last?.sets?.[0]?.kg??(e.loadMode==='bodyweight'?0:20));
  const loggedToday=last&&(last.date||last.at.slice(0,10))===(state.serverDate||localDate());
  const defaultEffort=last?.sets?.[0]?.rir!=null?String(last.sets[0].rir):String(e.rir);
  return `<article class="meal-card">
   <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
    <h3 dir="auto" style="margin:0">${esc(e.name)}</h3>
    <span style="font-size:12px;background:#e6f2ec;color:#1b4332;padding:4px 8px;border-radius:8px;font-weight:700">${esc(regionNames(regions))}</span>
   </div>
   <p style="margin:6px 0"><strong>المطلوب:</strong> ${sets} مجموعات × ${e.repMin}–${e.repMax} عدات ${['unilateral','alternating'].includes(e.laterality)?'(لكل جانب)':''} · راحة ${e.restSeconds} ثانية</p>
   ${adjustment?`<small class="coach-notice" style="display:block">💡 كابتن التدريب خفف لك عدد الجولات النهاردة مراعاةً لاستشفائك.</small>`:''}
   ${e.suggestedKg!=null&&state.recovery?.progressionAllowed&&!blocked?`<p class="coach-success">⬆️ توصية الكابتن اليوم: ارفع الوزن لـ ${e.suggestedKg} كجم (${esc(e.progressionReason)})</p>`:''}
   ${blocked?'<p class="coach-notice">⚠️ العضلة دي فيها إجهاد؛ اثبت على وزن خفيف النهاردة.</p>':''}
   ${loggedToday?`<p class="coach-success">✓ تم حفظ تمرينك اليوم (${last.sets.map(s=>`${s.kg}كجم×${s.reps}`).join('، ')})</p>`:''}
   <form class="workout-log" data-id="${e.id}" data-day="${day.dayIndex}">
    <input type="hidden" name="date" value="${state.serverDate||localDate()}">
    <input type="hidden" name="effort_rir" value="${esc(defaultEffort)}">
    <div class="set-rows">
     ${Array.from({length:sets},(_,idx)=>{
      const prevSet=last?.sets?.[idx]||last?.sets?.[0];
      return `<div class="set-row" style="grid-template-columns:auto 1fr 1fr">
       <strong>جولة ${idx+1}</strong>
       <label>الوزن (كجم)<input type="number" name="set_kg_${idx}" step="0.5" min="0" max="500" value="${prevSet?.kg??defaultKg}" required></label>
       <label>العدات<input type="number" name="set_reps_${idx}" min="1" max="100" value="${prevSet?.reps??e.repMax}" required></label>
      </div>`;
     }).join('')}
    </div>
    <div style="margin:8px 0">
     <small style="display:block;margin-bottom:4px;font-weight:700;color:#1b4332">إحساسك بالوزن في آخر عدة:</small>
     <div class="sim-chip-grid" style="grid-template-columns:repeat(3,1fr)">
      <button type="button" class="sim-chip effort-chip ${Number(defaultEffort)>=3?'active-chip':''}" data-effort="3">😊 كان خفيف</button>
      <button type="button" class="sim-chip effort-chip ${Number(defaultEffort)===2?'active-chip':''}" data-effort="${e.rir}">👌 مظبوط وقوي</button>
      <button type="button" class="sim-chip effort-chip ${Number(defaultEffort)<=1?'active-chip':''}" data-effort="0">🥵 جبت آخري</button>
     </div>
    </div>
    ${['unilateral','alternating'].includes(e.laterality)?'<label><input name="bothSides" type="checkbox" checked> لعبت الجانبين اليمين والشمال بنفس الأداء</label>':''}
    <div class="meal-actions">
     <button type="submit">✓ حفظ أداء التمرين</button>
     <button type="button" class="secondary" data-exercise-alt="${e.id}" data-day="${day.dayIndex}">🔄 تبديل التمرين</button>
    </div>
    <details style="margin-top:8px"><summary>شرح الأداء أو الإبلاغ عن ألم مفصلي</summary>
     <label><input name="pain" type="checkbox"> حسيت بألم أو نغزة في المفصل أثناء التمرين ده</label>
     <label>أصغر زيادة متاحة للدمبل/البار (كجم) <input name="increment" type="number" min="0.1" step="0.1" value="2.5"></label>
     <p dir="ltr" class="exercise-description">${esc(e.description)}</p>
    </details>
   </form>
  </article>`;
 }
 function workoutHTML(){
  const plan=state.workoutPlan;
  if(state.eligibility?.status==='needs_health_confirmation')return `<form id="confirm-existing-health" class="coach-card"><h3>تأكيد الجاهزية الصحية مع الكابتن</h3><p>أكد عدم وجود موانع صحية حادة قبل متابعة التمارين.</p><label><input name="healthy" type="checkbox" required> لا توجد حالة صحية حادة تمنع التمرين.</label><label><input name="injuryFree" type="checkbox" required> لا توجد إصابة حادة حالية.</label><button>تأكيد ومتابعة خطتي</button></form>`;
  if(state.eligibility?.needsScheduleConfirmation&&plan)return `<form id="confirm-schedule" class="coach-card"><h3>تأكيد أيام تمرينك في الأسبوع</h3><p>اختار اليوم المقصود لكل جلسة:</p>${plan.days.map(d=>`<label>${esc(FOCUS_LABELS[d.focus]||d.focus)} (${d.exercises[0]?esc(d.exercises[0].name):'جلسة'})<select name="day:${d.dayIndex}" required><option value="">اختار اليوم المقصود</option>${days.map((name,index)=>`<option value="${index}">${name}</option>`).join('')}</select></label>`).join('')}<button>تأكيد الأيام</button></form>`;
  if(!plan)return '<div class="coach-card"><p>مسارك الحالي للأكل فقط بدون جدول تمارين.</p></div>';
  const todayStr=state.serverDate||localDate();
  const todayDayIndex=new Date(todayStr+'T12:00:00Z').getUTCDay();
  return `${state.scheduledSessions?.[0]?`<p class="coach-notice">📅 تمرينتك الجاية: <strong>${state.scheduledSessions[0].date}</strong> · ${esc(FOCUS_LABELS[state.scheduledSessions[0].focus]||state.scheduledSessions[0].focus)}</p>`:''}
   ${plan.goalNote?`<p class="coach-notice">🎯 <strong>خطة كابتن التدريب:</strong> ${esc(plan.goalNote)}</p>`:''}
   ${plan.warnings.map(w=>`<p class="coach-notice">${esc(w)}</p>`).join('')}
   ${plan.days.map((d,idx)=>{
    const loggedCount=d.exercises.filter(e=>state.workoutLogs.some(l=>l.date===todayStr&&l.dayIndex===d.dayIndex&&l.exerciseId===e.id&&l.planId===plan.id)).length;
    const todaySess=state.sessions.find(s=>s.date===todayStr&&s.dayIndex===d.dayIndex&&s.planId===plan.id);
    return `<details class="coach-card" data-day="${d.dayIndex}" ${(d.dayIndex===todayDayIndex||idx===0)?'open':''}>
    <summary>${days[d.dayIndex]} · ${esc(FOCUS_LABELS[d.focus]||d.focus)} · ${d.location==='home'?'🏠 البيت':'🏋️ الجيم'} (${d.estimatedMinutes||d.duration} د) ${loggedCount?`· ✓ ${loggedCount}/${d.exercises.length} تمارين`:''}</summary>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
     <span style="font-size:13px;font-weight:700;color:#1b4332">${todaySess?.status==='completed'?'🎉 قفّلت تمرينة اليوم بالكامل ✓':loggedCount?`⏳ سجّلت ${loggedCount} من ${d.exercises.length} تمارين (الجلسة بتتقفل تلقائياً مع حفظ التمارين)`:'سجّل أوزانك وعداتك في التمارين بالأسفل:'}</span>
    </div>
    ${d.exercises.map(e=>exerciseHTML(e,d)).join('')}
    <details style="margin-top:8px"><summary>📅 مقدرتش أتمرن النهاردة؟ (تأجيل الجلسة ليوم تاني)</summary>
     <form class="reschedule-form" data-day="${d.dayIndex}" style="margin-top:8px">
      <label>اختار يوم بديل للتمرين خلال الأسبوعين الجايين <input name="toDate" type="date" min="${todayStr}" max="${dateOffset(todayStr,13)}" required></label>
      <button class="secondary">نقل موعد التمرينة</button>
     </form>
     <form class="session-log" data-day="${d.dayIndex}" style="margin-top:8px">
      <input type="hidden" name="date" value="${todayStr}">
      <input type="hidden" name="status" value="missed">
      <input type="hidden" name="duration" value="${d.estimatedMinutes||d.duration}">
      <input type="hidden" name="rpe" value="7">
      <button class="secondary">تسجيل إن الجلسة فاتتني هذا الأسبوع</button>
     </form>
    </details>
   </details>`;}).join('')}`;
 }
 function recoveryHTML(){
  const todayStr=state.serverDate||localDate();
  const latest=state.checkins.find(c=>c.date===todayStr)||state.checkins.at(-1);
  const lastWeight=state.weights.at(-1)?.kg??state.profile?.weight??80;
  const curSleep=latest?.date===todayStr?latest.sleepHours:7.5;
  const curQual=latest?.date===todayStr?latest.sleepQuality:4;
  const curFatigue=latest?.date===todayStr?latest.fatigue:2;
  const curStress=latest?.date===todayStr?(latest.stress??2):2;
  const hasPainOrSore=latest?.date===todayStr&&(latest.pain||(latest.soreness??0)>=7||Object.values(latest.sorenessByRegion||{}).some(v=>v>=7));
  return `<form id="weight-log" class="coach-card">
   <h3>⚖️ ميزان النهاردة (${todayStr})</h3>
   <p><small>فريق التغذية بيعتمد على متوسط الميزان خلال الأسبوعين مش تغير يوم واحد:</small></p>
   <input type="hidden" name="date" value="${todayStr}">
   <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
    <label style="flex:1;min-width:160px;margin:0">وزنك بالكيلوجرام <input name="kg" type="number" step="0.1" min="35" max="250" value="${lastWeight}" required></label>
    <button style="margin:0">✓ حفظ الميزان</button>
   </div>
   ${state.weights.length?`<div class="coach-tags" style="margin-top:10px">${state.weights.slice(-7).reverse().map(w=>`<span>${w.date}: <strong>${w.kg} كجم</strong></span>`).join('')}</div>`:''}
  </form>
  <form id="recovery-log" class="coach-card">
   <h3>😴 طمّن فريق المتابعة على نومك وطاقتك اليوم</h3>
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
    <div class="coach-grid" style="margin-top:8px">${Object.entries(MUSCLE_REGIONS).slice(0,6).map(([key,name])=>`<label>شد عضلي ${name} (0-10)<input name="sore:${key}" type="number" min="0" max="10" placeholder="0"></label>`).join('')}</div>
    <label><input type="checkbox" name="pain"> عندي ألم يمنعني من بعض التمارين اليوم</label>
    <label><input type="checkbox" name="illness"> عندي أعراض برد أو سخونية اليوم</label>
    <label><input type="checkbox" name="redFlags"> أشعر بدوخة شديدة أو ألم بالصدر</label>
   </details>
   <button>✓ حفظ حالتي اليوم</button>
  </form>`;
 }
 function render(){
  if(!busy)captureDrafts();viewVersion++;
  if(simulationMode&&!state.simulation){root.innerHTML='<div class="coach-app" dir="rtl"><div id="coach-feedback" role="alert" class="coach-notice" hidden></div>'+simulationPanel(state,true)+'</div>';wireSimulation();return;}
  if(!state.profile)return onboarding();
  const plan=state.plans.find(p=>p.id===state.active_plan_id),ready=state.recovery||{status:'unknown',reasons:[]};
  const isFirstDay=!state.checkins?.length&&!(state.workoutLogs||[]).length&&!(state.foodEntries||[]).length;
  const status={unknown:isFirstDay?'أول يوم في خطتك — وجباتك وتمارينك جاهزة للبداية! 🚀':'فريق المتابعة في انتظار تسجيل حالتك اليومية',ready:'جاهزيتك ممتازة للتمرين النهاردة ✓',caution:'كابتن التدريب ينصح بتمرين خفيف اليوم',high:'الأولوية النهاردة للاستشفاء والراحة',hold:'توصية الكابتن: ريّح المنطقة المؤلمة اليوم',stop:'تنبيه طبي: أوقف التمرين واطمئن طبياً'};
  const pendingAdaptations=state.adaptations.filter(a=>a.status==='pending');
  const todayStr=state.serverDate||localDate();
  const todayPlanDay=plan?.days.find(d=>d.date===todayStr)||plan?.days[0];
  const otherPlanDays=plan?.days.filter(d=>d!==todayPlanDay)||[];

  root.innerHTML=`<div class="coach-app" dir="rtl">
   <div id="coach-feedback" role="status" class="coach-notice" hidden></div>
   ${simulationPanel(state,simulationMode)}
   <header class="coach-heading">
    <div>
     <small>فريق التغذية والتدريب معاك خطوة بخطوة</small>
     <h2>أهلًا يا ${esc(state.profile.name)} 👋</h2>
     <p>${esc(status[ready.status])}</p>
    </div>
    <div class="coach-heading-actions">
     <button id="edit-profile" class="secondary">⚙️ بياناتي</button>
     <button id="export-coach" class="secondary">📥 ملخصي</button>
    </div>
   </header>

   ${buildSpecialistBrief(state,todayStr,todayPlanDay)}

   ${pendingAdaptations.length?`<section class="coach-notice proposal-banner" role="alert">
    <strong>🔔 توصية جديدة من فريق المتابعة جاهزة لموافقتك:</strong>
    ${pendingAdaptations.map(a=>`<div style="margin-top:8px">
     <p style="margin:0 0 8px"><strong>${esc(a.reason)}</strong> ${a.delta?`(${a.delta>0?'+'+a.delta:a.delta} سعر/يوم بداية من الغد)`:''}</p>
     <button data-adapt="${a.id}" data-accept="true">✅ موافق على توصية الفريق</button>
     <button class="secondary" data-adapt="${a.id}" data-accept="false">أكمل على خطتي الحالية</button>
    </div>`).join('')}
   </section>`:''}

   <nav class="coach-tabs" aria-label="أقسام المتابعة">
    <button type="button" class="tab-btn ${activeTab==='nutrition'?'active':''}" data-tab="nutrition"><span class="tab-icon">🥗</span><span>الأكل</span></button>
    <button type="button" class="tab-btn ${activeTab==='workout'?'active':''}" data-tab="workout"><span class="tab-icon">💪</span><span>التمرين</span></button>
    <button type="button" class="tab-btn ${activeTab==='recovery'?'active':''}" data-tab="recovery"><span class="tab-icon">⚖️</span><span>حالتي</span></button>
    <button type="button" class="tab-btn ${activeTab==='review'?'active':''}" data-tab="review"><span class="tab-icon">👨‍⚕️</span><span>المتابعة${pendingAdaptations.length?` <b class="tab-badge">${pendingAdaptations.length}</b>`:''}</span></button>
    <button type="button" class="tab-btn ${activeTab==='catalog'?'active':''}" data-tab="catalog"><span class="tab-icon">📚</span><span>المكتبة</span></button>
   </nav>

   <section id="nutrition-coach" ${activeTab==='nutrition'?'':'hidden'}>
    ${plan?`<div class="coach-metrics">
     <div><strong>${round(plan.targets.energy)}</strong> سعر/يوم</div>
     <div><strong>${round(plan.targets.protein)}</strong> جم بروتين</div>
     <div><strong>${round(plan.targets.carbs)}</strong> جم كارب</div>
     <div><strong>${round(plan.targets.fat)}</strong> جم دهون</div>
    </div>
    ${plan.effective_from&&(plan.effective_from>todayStr)?`<p class="coach-notice">✨ تعديل أخصائي التغذية الجديد يبدأ من بكرة (${plan.effective_from}).</p>`:''}
    ${plan.targets.forecast?`<p class="coach-notice">🎯 <strong>خطة الوصول لهدفك (${plan.targets.forecast.target_weight_kg} كجم):</strong> متوقع خلال <strong>${plan.targets.forecast.estimated_weeks_min}–${plan.targets.forecast.estimated_weeks_max} أسبوع</strong> بمعدل صحي ومستدام.</p>`:''}
    ${todayPlanDay?`<div class="coach-card">
     <h3>📅 وجبات النهاردة (${todayPlanDay.date} · ${round(todayPlanDay.summary.values.energy)} سعر)</h3>
     <p><small>اضغط «✓ أكلت الوجبة» جنب كل وجبة تخلصها، أو بدّلها بأكلة تانية على ذوقك:</small></p>
     ${todayPlanDay.meals.map(m=>mealHTML(m,todayPlanDay.date)).join('')}
    </div>`:''}
    ${otherPlanDays.length?`<details class="coach-card"><summary>🗓️ وجبات باقي أيام الأسبوع (${otherPlanDays.length} أيام)</summary>
     ${otherPlanDays.map(d=>`<details style="margin:10px 0;padding:8px;border:1px solid #e2ece6;border-radius:12px"><summary>${d.date} · ${round(d.summary.values.energy)} سعر</summary>${d.meals.map(m=>mealHTML(m,d.date)).join('')}</details>`).join('')}
    </details>`:''}
    ${plan.days.at(-1).date<todayStr?'<button id="renew-plan">🔄 استلام جدول أكل الأسبوع الجديد</button>':''}`:'<p class="coach-card">مسارك الحالي للتمارين فقط؛ وتقدر تسجل وجباتك اليومية بالأسفل.</p>'}
    ${diaryHTML()}
   </section>

   <section id="workout-coach" ${activeTab==='workout'?'':'hidden'}>
    ${workoutHTML()}
   </section>

   <section id="recovery-coach" ${activeTab==='recovery'?'':'hidden'}>
    ${recoveryHTML()}
   </section>

   <section class="coach-card" id="coach-review" ${activeTab==='review'?'':'hidden'}>
    <h2>👨‍⚕️ تقرير فريق المتابعة (التغذية والتدريب)</h2>
    <p>فريق التغذية والتدريب بيراجع متوسط وزنك لآخر أسبوعين (بحد أدنى 3 أوزان في كل أسبوع) والتزامك بوجباتك (10 أيام من 14) مع تطور أوزانك في التمرين علشان يقرر هل نكمّل زي ما إحنا ولا نعدّل الخطة.</p>
    ${state.progressSummary?`<div class="coach-tags" style="margin-bottom:10px">
     <span>⚖️ ميزان الأسبوع السابق: ${state.progressSummary.weightTrend.previous7dCount}/3 (${state.progressSummary.weightTrend.previous7dAvgKg??'—'} كجم)</span>
     <span>⚖️ ميزان الأسبوع الحالي: ${state.progressSummary.weightTrend.current7dCount}/3 (${state.progressSummary.weightTrend.current7dAvgKg??'—'} كجم)</span>
     <span>🥗 أيام الالتزام بالأكل: ${state.progressSummary.foodCompleteness.completeDays14d}/10</span>
     <span>🏋️ تمرينات مكتملة: ${state.progressSummary.workoutSummary.completed14d}</span>
    </div>`:''}
    <button id="review-coach">🔍 اطلب مراجعة فريق المتابعة الآن</button>
    ${state.lastReview?`<div class="coach-notice" style="margin-top:14px">
     <strong>📋 خلاصة مراجعة الفريق: ${esc(state.lastReview.message)}</strong>
     <p>🥗 <strong>أخصائي التغذية:</strong> ${esc(state.lastReview.nutrition.reason)}</p>
     ${state.lastReview.volume?`<p>💪 <strong>كابتن التدريب:</strong> ${esc(state.lastReview.volume.reason)}</p>`:''}
     <p>🏋️ <strong>التزامك بالتمرين (آخر أسبوعين):</strong> ${state.lastReview.workout.completed} تمرينات مكتملة · ${state.lastReview.workout.partial||0} جزئية · ${state.lastReview.workout.missed} فائتة</p>
    </div>`:''}
    ${pendingAdaptations.map(a=>`<article class="meal-card" style="margin-top:12px">
     <p><strong>${esc(a.reason)}</strong></p>
     ${a.delta?`<p>التعديل المقترح: ${a.delta>0?'+'+a.delta:a.delta} سعر/يوم بداية من الغد.</p>`:''}
     <button data-adapt="${a.id}" data-accept="true">✅ موافق على توصية الفريق</button>
     <button class="secondary" data-adapt="${a.id}" data-accept="false">أكمل على خطتي الحالية</button>
    </article>`).join('')}
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
 function shouldAutoCompleteFood(date,addedEnergy=0){
  const plan=state.plans.find(p=>p.id===state.active_plan_id);
  const day=plan?.days.find(d=>d.date===date);
  const target=day?.targets?.energy||plan?.targets?.energy||0;
  const currentEntries=(state.foodEntries||[]).filter(e=>e.date===date);
  const currentEnergy=currentEntries.reduce((s,e)=>s+(Number(e.snapshot?.values?.energy)||0),0);
  if(target>0&&(currentEnergy+addedEnergy)>=target*0.8)return true;
  return false;
 }
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
  root.querySelectorAll('.planned-food').forEach(form=>form.onsubmit=e=>{
   e.preventDefault();diaryDate=form.dataset.date;
   const fd=formData(form),qty=Number(fd.quantity||1),mealEnergy=(Number(form.dataset.energy)||0)*qty;
   send('food_entry',{...fd,date:form.dataset.date,slot:form.dataset.slot,mealId:form.dataset.meal,source:'planned',autoComplete:shouldAutoCompleteFood(form.dataset.date,mealEnergy)});
  });
  const manualForm=root.querySelector('#manual-food');
  if(manualForm)manualForm.onsubmit=e=>{
   e.preventDefault();const fd=formData(e.target);
   send('food_entry',{...fd,date:diaryDate,source:'manual',autoComplete:shouldAutoCompleteFood(diaryDate,Number(fd.energy)||0)});
  };
  const foodSearchForm=root.querySelector('#food-search');
  if(foodSearchForm)foodSearchForm.onsubmit=async e=>{
   e.preventDefault();const version=viewVersion,request=++foodRequest;try{const result=await api('foods?q='+encodeURIComponent(new FormData(e.target).get('q')));if(version!==viewVersion||request!==foodRequest)return;root.querySelector('#food-search-results').innerHTML=result.items.map(i=>{const u=displayPortion(i);return `<form class="ingredient-log" data-diary-date="${diaryDate}" data-key="${esc(i.key)}" data-kcal100="${Number(i.values.energy)||0}"><h4>${esc(displayIngredientName(i))}</h4><p>${round(i.values.energy)} سعر/100 جرام · ${esc(stateLabels[i.state]||i.state)}${u?` · <strong>الوحدة: ${esc(u.label)} ≈ ${round(u.grams)} جم</strong>`:''}</p><label>الكمية بالجرام <input name="grams" type="number" min="1" max="2000" value="${u?round(u.grams):100}" required></label><label>الوجبة<select name="slot">${Object.entries(SLOTS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><button>إضافة الصنف</button></form>`;}).join('')||'<p>مفيش نتيجة في مكتبة الأصناف الحالية؛ استخدم الإضافة اليدوية.</p>';restoreDrafts(root.querySelector('#food-search-results'));root.querySelectorAll('.ingredient-log').forEach(form=>form.onsubmit=e=>{e.preventDefault();const fd=formData(form);const added=(Number(form.dataset.kcal100)||0)*(Number(fd.grams)||0)/100;send('food_entry',{...fd,source:'ingredient',key:form.dataset.key,date:diaryDate,autoComplete:shouldAutoCompleteFood(diaryDate,added)});});}catch(e){notice(e.message,true);}
  };
  root.querySelectorAll('[data-meal-alt]').forEach(b=>b.onclick=async()=>{const version=viewVersion,request=++alternativeRequest;try{const result=await api('meal-alternatives?mealId='+encodeURIComponent(b.dataset.mealAlt));if(version!==viewVersion||request!==alternativeRequest)return;showDialog('<h2>بدائل مقترحة من أخصائي التغذية</h2>'+result.items.map(a=>`<article class="meal-card" style="margin:10px 0"><h3>${esc(displayMealName(a.snapshot))}</h3><p><strong>${macroLine(a.snapshot)}</strong></p><ul>${(a.snapshot.ingredients||[]).map(ingredientLine).join('')}</ul><p><small>فرق السعرات ${a.energy_delta} · فرق البروتين ${a.protein_delta} جرام</small></p><button data-replace-meal="${esc(a.snapshot.template_id)}">اختيار هذه الوجبة</button></article>`).join('')+(result.items.length?'':'<p>مفيش بديل متاح يحقق نفس اختياراتك وحدود النظام.</p>'));root.querySelectorAll('[data-replace-meal]').forEach(choice=>choice.onclick=()=>send('replace_meal',{mealId:b.dataset.mealAlt,templateId:choice.dataset.replaceMeal}));}catch(e){notice(e.message,true);}});
  root.querySelectorAll('[data-exercise-alt]').forEach(b=>b.onclick=async()=>{const version=viewVersion,request=++alternativeRequest;try{const result=await api('exercise-alternatives?exerciseId='+encodeURIComponent(b.dataset.exerciseAlt)+'&dayIndex='+b.dataset.day);if(version!==viewVersion||request!==alternativeRequest)return;showDialog('<h2>بدائل مقترحة من كابتن التدريب</h2>'+result.items.map(a=>`<article><h3 dir="auto">${esc(a.name)}</h3><p dir="ltr">${a.equipment.map(q=>esc(q.equipment_id)).join(', ')}</p><button data-replace-exercise="${a.id}">اختيار هذا التمرين</button></article>`).join('')+(result.items.length?'':'<p>مفيش بديل مناسب متاح بالمعدات دي.</p>'));root.querySelectorAll('[data-replace-exercise]').forEach(choice=>choice.onclick=()=>send('replace_exercise',{dayIndex:Number(b.dataset.day),exerciseId:b.dataset.exerciseAlt,alternativeId:choice.dataset.replaceExercise}));}catch(e){notice(e.message,true);}});

  root.querySelectorAll('.effort-chip').forEach(btn=>btn.onclick=()=>{
   const form=btn.closest('form');if(!form)return;
   form.querySelector('[name=effort_rir]').value=btn.dataset.effort;
   form.querySelectorAll('.effort-chip').forEach(c=>c.classList.toggle('active-chip',c===btn));
  });

  root.querySelectorAll('.workout-log').forEach(form=>form.onsubmit=e=>{
   e.preventDefault();const fd=new FormData(form);
   const rir=fd.get('effort_rir')??2;
   const sets=[];
   for(let idx=0;fd.has(`set_kg_${idx}`);idx++){
    sets.push({kg:fd.get(`set_kg_${idx}`),reps:fd.get(`set_reps_${idx}`),rir,pain:fd.has('pain')});
   }
   send('workout',{exerciseId:form.dataset.id,dayIndex:Number(form.dataset.day),date:fd.get('date'),sets,bothSides:fd.has('bothSides'),increment:fd.get('increment'),autoSession:true});
  });
  root.querySelectorAll('.session-log').forEach(form=>form.onsubmit=e=>{e.preventDefault();send('session',{...formData(form),dayIndex:Number(form.dataset.day)});});
  root.querySelectorAll('.reschedule-form').forEach(form=>form.onsubmit=e=>{e.preventDefault();send('reschedule',{...formData(form),dayIndex:Number(form.dataset.day)});});
  const weightForm=root.querySelector('#weight-log');
  if(weightForm)weightForm.onsubmit=e=>{e.preventDefault();send('weight',formData(e.target));};

  root.querySelectorAll('.sleep-preset').forEach(btn=>btn.onclick=()=>{
   const form=btn.closest('form');if(!form)return;
   form.querySelector('[name=sleepHours]').value=btn.dataset.sleep;
   form.querySelector('[name=sleepQuality]').value=btn.dataset.qual;
   form.querySelectorAll('.sleep-preset').forEach(c=>c.classList.toggle('active-chip',c===btn));
  });
  root.querySelectorAll('.energy-preset').forEach(btn=>btn.onclick=()=>{
   const form=btn.closest('form');if(!form)return;
   form.querySelector('[name=fatigue]').value=btn.dataset.fatigue;
   form.querySelector('[name=stress]').value=btn.dataset.stress;
   form.querySelectorAll('.energy-preset').forEach(c=>c.classList.toggle('active-chip',c===btn));
  });

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
  const search=async(offset=0)=>{
   const form=root.querySelector('#catalog-search'),fd=new FormData(form);catalogQuery=String(fd.get('q'));catalogOffset=offset;const version=viewVersion,request=++catalogRequest;
   try{const d=await api('exercises?q='+encodeURIComponent(catalogQuery)+'&muscle='+encodeURIComponent(fd.get('muscle'))+'&offset='+offset);if(version!==viewVersion||request!==catalogRequest)return;root.querySelector('#catalog-results').innerHTML=`<p>${d.total} نتيجة · ${Math.min(offset+1,d.total)}–${Math.min(offset+30,d.total)}</p>`+d.items.map(x=>`<details><summary>${esc(x.name)}</summary><p>أساسية: ${x.muscles.filter(m=>m.role==='primary').map(m=>esc(m.muscle_id)).join(', ')}</p><p>ثانوية: ${x.muscles.filter(m=>m.role==='secondary').map(m=>esc(m.muscle_id)).join(', ')||'غير مسجلة'}</p><p dir="ltr" class="exercise-description">${esc(x.description)}</p><p dir="ltr">${x.equipment.map(q=>esc(q.equipment_id)).join(', ')}</p><small>${esc(x.source)} · ${esc(x.author)} · ${esc(x.license)}</small></details>`).join('')+`<div>${offset?'<button id="catalog-prev" class="secondary">السابق</button>':''}${d.nextOffset!=null?'<button id="catalog-next">التالي</button>':''}</div>`;root.querySelector('#catalog-prev')?.addEventListener('click',()=>search(Math.max(0,catalogOffset-30)));root.querySelector('#catalog-next')?.addEventListener('click',()=>search(d.nextOffset));}catch(e){notice(e.message,true);}
  };
  const catalogForm=root.querySelector('#catalog-search');
  if(catalogForm)catalogForm.onsubmit=e=>{e.preventDefault();search();};
 }
 try{state=await api('state');diaryDate=state.serverDate;render();}catch(e){root.innerHTML=`<div class="coach-notice"><p>${esc(e.message)}</p><button id="retry-coach">حاول تاني</button></div>`;root.querySelector('button').onclick=()=>mountPlanner({root,toast});}
}
