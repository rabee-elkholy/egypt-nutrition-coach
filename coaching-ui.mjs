import {createDraftStore} from './coaching-drafts.mjs';
import {createBriefSelector} from './coaching-summary.mjs';
import {followupView} from './coaching-followup-view.mjs';
import {trainingView} from './coaching-training-view.mjs';
import {nutritionView} from './coaching-nutrition-view.mjs';
import {esc,round,days,stateLabels,macroLine,ingredientLine,formData} from './coaching-view-helpers.mjs';
import {buildSpecialistBrief} from './coaching-brief-view.mjs';
import {createCoachingApiClient} from './coaching-api-client.mjs';
import {createPageLifecycle} from './coaching-page-lifecycle.mjs';
import {journeyHTML,bindJourney} from './coaching-journey-ui.mjs';
import {usesKg,loadLabel} from './exercise-load.mjs';
import {simulationPanel} from './simulation-ui.mjs?v=sim8';
import {mountOnboardingChat} from './onboarding-chat.mjs';
import {MUSCLE_REGIONS,SLOTS,localDate,onboardingState} from './coaching-shared.mjs';
import {displayPortion} from './planner-household.mjs';
import {displayMealName,displayIngredientName} from './meal-presentation.mjs';
import {seedPick,dailyTips} from './coach-messages.mjs?v=msg3';
import {personalBrief} from './personal-brief.mjs';

export async function mountPlanner({root,toast}){
 root._coachRefreshCleanup?.();
 root.removeAttribute('aria-busy');
 const selectBrief=createBriefSelector(personalBrief);
 let tipOffset=0;
 const tipsHTML=(todayStr)=>{
  const tips=dailyTips(todayStr,{hasWorkout:!!state.workoutPlan,offset:tipOffset});
  const follow=selectBrief(state,todayStr).find(n=>n.role==='followup');
  const preferred=follow?.key==='short-sleep'?'sleep':['safety-support','tired'].includes(follow?.key)?'recovery':follow?.key==='water'?'water':seedPick(tips,todayStr+':tip-topic',tipOffset)?.cat;
  tips.sort((a,b)=>Number(b.cat===preferred)-Number(a.cat===preferred));
  return `<section class="coach-card tips-card" id="tips-card" style="background:#fffdf6;border-color:#eadfb8">
   <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
    <strong style="color:#5b4a14;font-size:15px">📚 معلومة النهاردة من الفريق</strong>
    <button type="button" id="tips-more" class="secondary" style="min-height:34px;padding:4px 12px;font-size:12.5px;margin:0">🔄 معلومات تانية</button>
   </div>
   ${tips.slice(0,1).map(t=>`<p style="margin:6px 0;font-size:13.5px;line-height:1.65;color:#3d3415"><span style="display:inline-block;min-width:68px;font-weight:700;color:#6b5a1c">${t.icon} ${t.label}:</span> ${esc(t.text)}</p>`).join('')}
   <details class="brief-details"><summary>معلومات عامة عن باقي الجوانب</summary>${tips.slice(1).map(t=>`<p><strong>${t.icon} ${t.label}:</strong> ${esc(t.text)}</p>`).join('')}</details>
   <small>معلومات عامة؛ أهداف خطتك وتعليمات مختصك مقدّمة عليها.</small><details class="brief-details"><summary>مصادر المعلومات</summary><a href="https://pubmed.ncbi.nlm.nih.gov/38595233/" target="_blank" rel="noopener noreferrer">دليل تقسيمات التدريب</a> · <a href="https://www.cdc.gov/sleep/about/" target="_blank" rel="noopener noreferrer">النوم — CDC</a> · <a href="https://www.army.mil/article-amp/279545/military_health_expert_clarifies_no_pain_no_gain_workout_myths" target="_blank" rel="noopener noreferrer">الألم وجودة التدريب</a></details>
  </section>`;
 };
 const session=root._coachSession||={drafts:new Map(),uncertainWrite:null};
 let state,busy=false,diaryDate=localDate(),activeTab='nutrition',catalogQuery='',catalogOffset=0,viewVersion=0,catalogRequest=0,foodRequest=0,alternativeRequest=0,submittedForm=null,uncertainWrite=session.uncertainWrite;
 const setUncertain=value=>{uncertainWrite=value;session.uncertainWrite=value;};
 const clearUncertain=key=>{uncertainWrite=null;if(session.uncertainWrite?.key===key)session.uncertainWrite=null;};
 let simulationMode=uncertainWrite?.simulationMode??(new URL(location.href).searchParams.get('simulation')==='1');
 const drafts=session.drafts;
 const editingExercises=new Set();
 const formKey=form=>(form.id||[form.classList[0],form.dataset.day||'',form.dataset.id||form.dataset.meal||form.dataset.key||form.dataset.coachingFeedback||''].join('|'))+(form.dataset.diaryDate?'|'+form.dataset.diaryDate:'')+(simulationMode?'|sim-day:'+state?.simulation?.day:'');
 const {captureDrafts,restoreDrafts}=createDraftStore({root,formKey,drafts});
 if(root._coachSubmit)root.removeEventListener('submit',root._coachSubmit,true);
 root._coachSubmit=e=>{if(!e.target.id.includes('search')&&!e.target.closest('#coach-onboarding-section'))submittedForm=formKey(e.target);};root.addEventListener('submit',root._coachSubmit,true);
 const client=createCoachingApiClient({scope:()=>simulationMode});
 const api=client.request;
 // Re-read the server clock and evidence while visible. Do not interrupt forms,
 // race writes, or advance a simulation from the device clock.
 let refreshing=false,disposed=false,loadingInitial=false;
 const editing=()=>root.contains(document.activeElement)&&document.activeElement.matches('input,select,textarea,[contenteditable="true"]');
 async function refreshMessages(){
  if(!state){if(!disposed&&!root.hidden&&root.isConnected)await loadInitialState();return;}
  if(disposed||refreshing||busy||uncertainWrite||!state?.profile||simulationMode||root.hidden||!root.isConnected||document.visibilityState==='hidden'||root.querySelector('#coach-onboarding-section')||editing())return;
  refreshing=true;const previous=state,version=viewVersion;
  try{
   const summary=await api('bootstrap');
   if(disposed||busy||uncertainWrite||state!==previous||viewVersion!==version||editing())return;
   const before=Date.parse(state.serverNow),after=Date.parse(summary.serverNow);
   const deadlines=[...(state.checkins||[]).map(c=>Date.parse(c.at)+86400000+1),...(state.adaptations||[]).filter(a=>a.status==='pending').map(a=>Date.parse(a.expiresAt)),...(state.coachingCases||[]).filter(c=>['proposed','question'].includes(c.status)).map(c=>Date.parse(c.createdAt)+7*86400000),Date.parse(state.sessionAdjustment?.expiresAt)];
   if(summary.revision===state.revision&&summary.serverDate===state.serverDate&&!deadlines.some(t=>t>before&&t<=after))return;
   const next=await api('state');
   if(disposed||busy||uncertainWrite||state!==previous||viewVersion!==version||editing())return;
   captureDrafts();const open=[...root.querySelectorAll('details[open]')].map(el=>[...root.querySelectorAll('details')].indexOf(el));
   if(diaryDate===state.serverDate)diaryDate=next.serverDate;
   state=next;render();for(const index of open)root.querySelectorAll('details')[index]?.setAttribute('open','');
  }catch(error){if(error.name!=='AbortError')notice('تعذر تحديث المتابعة؛ الرسائل المعروضة حسب آخر تحديث. هنحاول تاني تلقائيًا.');}
  finally{refreshing=false;}
 }
 const lifecycle=createPageLifecycle({root,refresh:refreshMessages,invalidate:client.invalidateReads});
 root._coachRefreshCleanup=()=>{if(disposed)return;captureDrafts();disposed=true;lifecycle.dispose();client.dispose();root.removeEventListener('submit',root._coachSubmit,true);};
 function notice(message,isError=false){if(disposed||!message)return;const el=root.querySelector('#coach-feedback');if(el){el.textContent=message;el.hidden=false;el.setAttribute('role',isError?'alert':'status');}if(isError)toast?.(message);}
 async function send(action,payload){
  if(disposed||busy)return false;client.invalidateReads();const fingerprint=JSON.stringify({action,payload});if(uncertainWrite&&uncertainWrite.fingerprint!==fingerprint){notice('في عملية لسه مش متأكدين من حفظها؛ أعد محاولتها الأول.',true);retryUncertain();return false;}busy=true;root.setAttribute('aria-busy','true');
  const key=uncertainWrite?.key||crypto.randomUUID(),body=uncertainWrite?.body||JSON.stringify({action,payload,revision:state.revision});let confirmed=false;
  const submitted=uncertainWrite?.submitted||submittedForm,submittedData=[...root.querySelectorAll('form')].find(f=>formKey(f)===submitted);const rejectedDraft=submittedData?formData(submittedData):null;const clearSubmitted=!uncertainWrite||JSON.stringify(rejectedDraft)===JSON.stringify(uncertainWrite.submittedData)?submitted:null;submittedForm=null;captureDrafts(clearSubmitted);
  setUncertain({key,body,fingerprint,action,payload,submitted,simulationMode,submittedData:uncertainWrite?.submittedData||rejectedDraft});
  const controls=[...root.querySelectorAll('input,select,textarea,button')].map(el=>({el,disabled:el.disabled}));controls.forEach(({el})=>el.disabled=true);
  try{
   const options={method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body};
   try{state=await api('commands',options);}catch(e){if(e instanceof TypeError)state=await api('commands',options);else throw e;}
   confirmed=true;clearUncertain(key);if(disposed)return false;
   const openDays=[...root.querySelectorAll('details[data-day][open]')].map(d=>d.dataset.day);
   if(['generate','simulation_reset'].includes(action))drafts.clear();
   if(['simulation_reset','simulation_next'].includes(action))diaryDate=state.serverDate;
   if(action==='review'||(action==='simulation_fill'&&state.adaptations?.some(a=>a.status==='pending')))activeTab='review';
   render();for(const id of openDays)root.querySelector(`details[data-day="${id}"]`)?.setAttribute('open','');
   notice(action==='simulation_next'?`بدأ اليوم ${state.simulation?.day||''} في المحاكاة.`:action==='simulation_fill'?'تم تسجيل سيناريو اليوم ومراجعة الخطة.':action==='review'?state.lastReview?.message||'تمت مراجعة فريق المتابعة.':'تم الحفظ بنجاح ✓');return true;
  }catch(e){
   if(disposed)return false;
   if(!confirmed&&(!e.status||e.status>=500)){setUncertain({key,body,fingerprint,action,payload,submitted,simulationMode,submittedData:uncertainWrite?.submittedData||rejectedDraft});notice('الاتصال انقطع أو الحفظ لم يتأكد. أعد المحاولة بنفس العملية علشان ما تتسجلش مرتين.',true);retryUncertain();}
   else{clearUncertain(key);if(submitted&&rejectedDraft)drafts.set(submitted,rejectedDraft);if(e.status===409){try{state=await api('state');render();}catch{}}notice(confirmed?'بياناتك اتحفظت؛ حدّث الصفحة لإعادة عرضها.':e.message,true);}return false;
  }
  finally{for(const {el,disabled}of controls)if(el.isConnected)el.disabled=disabled;busy=false;if(!disposed)root.removeAttribute('aria-busy');}
 }
 async function switchSimulation(enabled){
  if(disposed||busy)return;if(uncertainWrite){notice('أكد العملية المعلقة قبل تبديل وضع التجربة.',true);retryUncertain();return;}
  client.invalidateReads();const before=simulationMode;busy=true;viewVersion++;simulationMode=enabled;
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
 function retryUncertain(){const feedback=root.querySelector('#coach-feedback');if(feedback&&uncertainWrite&&!feedback.querySelector('button')){feedback.hidden=false;if(!feedback.textContent.trim())feedback.textContent='في عملية حفظ لسه لم نتأكد من نتيجتها. أعد محاولة نفس العملية علشان ما تتسجلش مرتين.';const b=document.createElement('button');b.textContent='أعد محاولة العملية غير المؤكدة';b.id='retry-uncertain-write';b.onclick=()=>send(uncertainWrite.action,uncertainWrite.payload);feedback.append(' ',b);}}
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
 const waterHTML=(...args)=>nutritionView({state,diaryDate}).waterHTML(...args);
 const diaryHTML=(...args)=>nutritionView({state,diaryDate}).diaryHTML(...args);
 const mealHTML=(...args)=>nutritionView({state,diaryDate}).mealHTML(...args);
 const exerciseHTML=(...args)=>trainingView({state,editingExercises}).exerciseHTML(...args);
 const singleWorkoutDayCard=(...args)=>trainingView({state,editingExercises}).singleWorkoutDayCard(...args);
 const workoutHTML=(...args)=>trainingView({state,editingExercises}).workoutHTML(...args);
 const reviewHTML=(...args)=>followupView({state,simulationMode,notes:selectBrief(state,state.serverDate||localDate())}).reviewHTML(...args);
 const recoveryHTML=(...args)=>followupView({state,simulationMode,notes:selectBrief(state,state.serverDate||localDate())}).recoveryHTML(...args);
 function render(){
  if(!busy)captureDrafts();viewVersion++;
  if(simulationMode&&!state.simulation){root.innerHTML='<div class="coach-app" dir="rtl"><div id="coach-feedback" role="alert" class="coach-notice" hidden></div>'+simulationPanel(state,true)+'</div>';wireSimulation();return;}
  if(!state.profile)return onboarding();
  const plan=state.plans.find(p=>p.id===state.active_plan_id),ready=state.recovery||{status:'unknown',reasons:[]};
  const isFirstDay=!state.checkins?.length&&!(state.workoutLogs||[]).length&&!(state.foodEntries||[]).length;
  const status={unknown:isFirstDay?'خطتك جاهزة للعرض؛ سجّل حالتك قبل تحديد مجهود التمرين.':'فريق المتابعة في انتظار تسجيل حالتك اليومية',ready:'بياناتك الحالية تسمح بتمرينك المعتاد ✓',caution:'كابتن التدريب ينصح بتمرين خفيف اليوم',high:'الأولوية النهاردة للاستشفاء والراحة',hold:ready.reasons?.[0]||'أجّل التمرين وراجع سبب التوقف في حالتك الحالية',stop:'تنبيه طبي: أوقف التمرين واطمئن طبياً'};
  const pendingAdaptations=state.adaptations.filter(a=>a.status==='pending'&&(!a.expiresAt||Date.parse(a.expiresAt)>Date.parse(state.serverNow)));
  const expiredAdaptations=state.adaptations.some(a=>a.status==='pending'&&a.expiresAt&&Date.parse(a.expiresAt)<=Date.parse(state.serverNow));
  const todayStr=state.serverDate||localDate();
  const todayPlanDay=plan?.days.find(d=>d.date===todayStr);
  const otherPlanDays=plan?.days.filter(d=>d!==todayPlanDay)||[];

  root.innerHTML=`<div class="coach-app" dir="rtl">
   <div id="coach-feedback" role="status" class="coach-notice" hidden></div>
   ${simulationPanel(state,simulationMode,{activeTab})}

   ${expiredAdaptations?'<p class="coach-notice">انتهت صلاحية توصية سابقة؛ اطلب مراجعة جديدة من تبويب المتابعة.</p>':''}
   ${pendingAdaptations.length&&activeTab!=='review'?`<section class="coach-notice proposal-banner" role="alert">
    <strong>🔔 توصية جديدة من فريق المتابعة جاهزة لموافقتك:</strong>
    ${pendingAdaptations.map(a=>`<div style="margin-top:8px">
     <p style="margin:0 0 8px"><strong>${esc(a.reason)}</strong> ${a.delta?`(${a.delta>0?'+'+a.delta:a.delta} سعر/يوم بداية من الغد)`:''}</p>
     <button data-adapt="${a.id}" data-accept="true">✅ موافق على توصية الفريق</button>
     <button class="secondary" data-adapt="${a.id}" data-accept="false">أكمل على خطتي الحالية</button>
    </div>`).join('')}
   </section>`:''}

   ${(state.workoutSafetyIssues||[]).length?`<aside role="alert" class="coach-card">⚠️ خطتك القديمة فيها حركات مستبعدة حسب إصابتك: ${state.workoutSafetyIssues.map(x=>esc(x.name)).join('، ')}. لا تؤدّها؛ استبدلها أو أعد إنشاء الخطة وراجع مختصًا.</aside>`:''}
   ${(state.dietVerificationIssues||[]).some(x=>x.date>=todayStr)?'<aside role="alert" class="coach-card">⚠️ لا يمكن اعتماد القيود الغذائية لبعض أيام خطتك الحالية. أعد إنشاء الخطة؛ القيم المجهولة لا تعني صفرًا.</aside>':''}
   <nav class="coach-tabs" aria-label="أقسام المتابعة">
    <button type="button" class="tab-btn ${activeTab==='nutrition'?'active':''}" data-tab="nutrition"><span class="tab-icon">🥗</span><span>الأكل</span></button>
    <button type="button" class="tab-btn ${activeTab==='workout'?'active':''}" data-tab="workout"><span class="tab-icon">💪</span><span>التمرين</span></button>
    <button type="button" class="tab-btn ${activeTab==='recovery'?'active':''}" data-tab="recovery"><span class="tab-icon">⚖️</span><span>حالتي</span></button>
    <button type="button" class="tab-btn ${activeTab==='review'?'active':''}" data-tab="review"><span class="tab-icon">👨‍⚕️</span><span>المتابعة${pendingAdaptations.length?` <b class="tab-badge">${pendingAdaptations.length}</b>`:''}</span></button>
    <button type="button" class="tab-btn ${activeTab==='catalog'?'active':''}" data-tab="catalog"><span class="tab-icon">📚</span><span>المكتبة</span></button>
   </nav>

   <section id="nutrition-coach" ${activeTab==='nutrition'?'':'hidden'}>
    <header class="coach-heading">
     <div>
      <small>متابعة آلية للأكل والتمرين — ليست مراجعة من مختص بشري</small>
      <h2>أهلًا يا ${esc(state.profile.name)} 👋</h2>
      <p>${esc(state.workoutPlan?status[ready.status]:'تابع أكلك وتسجيلاتك حسب خطتك الحالية.')}</p>
     </div>
     <div class="coach-heading-actions">
      <button id="edit-profile" class="secondary">⚙️ بياناتي</button>
      <button id="export-coach" class="secondary">📥 ملخصي</button>
     </div>
    </header>
    ${buildSpecialistBrief(state,todayStr,todayPlanDay)}
    ${plan?`<div class="coach-metrics">
     <div><strong>${round(plan.targets.energy)}</strong> سعر/يوم</div>
     <div><strong>${round(plan.targets.protein)}</strong> جم بروتين</div>
     <div><strong>${round(plan.targets.carbs)}</strong> جم كارب</div>
     <div><strong>${round(plan.targets.fat)}</strong> جم دهون</div>
    </div>
    ${plan.effective_from&&(plan.effective_from>todayStr)?`<p class="coach-notice">✨ تعديل التغذية الجديد يبدأ بتاريخ (${plan.effective_from}).</p>`:''}
    ${plan.targets.forecast?`<p class="coach-notice">🎯 <strong>خطة الوصول لهدفك (${plan.targets.forecast.target_weight_kg} كجم):</strong> متوقع خلال <strong>${plan.targets.forecast.estimated_weeks_min}–${plan.targets.forecast.estimated_weeks_max} أسبوع</strong> كتقدير قابل للتغير حسب استجابتك.</p>`:''}
    ${todayPlanDay?`<div class="coach-card">
     <h3>📅 وجبات النهاردة (${todayPlanDay.date} · ${round(todayPlanDay.summary.values.energy)} سعر)</h3>
     <p><small>اضغط «✓ أكلت الوجبة» جنب كل وجبة تخلصها، أو بدّلها بأكلة تانية على ذوقك:</small></p>
     ${todayPlanDay.meals.map(m=>mealHTML(m,todayPlanDay.date)).join('')}
    </div>`:''}
    ${plan.days.at(-1).date<todayStr?'<button id="renew-plan">🔄 استلام جدول أكل الأسبوع الجديد</button>':''}`:'<p class="coach-card">مسارك الحالي للتمارين فقط؛ وتقدر تسجل وجباتك اليومية بالأسفل.</p>'}
    ${waterHTML(todayStr)}
    ${tipsHTML(todayStr)}
    ${diaryHTML()}
   </section>

   <section id="workout-coach" ${activeTab==='workout'?'':'hidden'}>
    ${workoutHTML()}
   </section>

   <section id="recovery-coach" ${activeTab==='recovery'?'':'hidden'}>
    ${recoveryHTML()}
   </section>

   <section id="coach-review" ${activeTab==='review'?'':'hidden'}>
    ${journeyHTML(state)}
    ${reviewHTML(todayStr,plan,todayPlanDay,pendingAdaptations)}
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
  wire();wireSimulation();restoreDrafts();retryUncertain();
 }
 function showDialog(html){const dialog=root.querySelector('#coach-dialog');dialog.querySelector('#dialog-body').innerHTML=html;dialog.showModal();}
 function wire(){
  root.querySelectorAll('[data-edit-exercise]').forEach(btn=>btn.onclick=()=>{
   const key=btn.dataset.editExercise,editor=root.querySelector('[id="'+btn.getAttribute('aria-controls')+'"]');
   if(!editor)return;editor.hidden=!editor.hidden;
   if(editor.hidden)editingExercises.delete(key);else editingExercises.add(key);
   btn.setAttribute('aria-expanded',String(!editor.hidden));btn.innerHTML='<span aria-hidden="true">✎</span> '+(editor.hidden?'تعديل':'إغلاق');
  });
  root.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{activeTab=btn.dataset.tab;render();window.scrollTo({top:0,behavior:'instant'});});
  root.querySelectorAll('[data-brief-action]').forEach(btn=>btn.onclick=()=>{
   const route={recovery:['recovery','#recovery-log'],food:['nutrition','#food-diary'],feedback:['review','#coaching-journey'],workout:['workout','#workout-coach']}[btn.dataset.briefAction];
   if(!route)return;captureDrafts();activeTab=route[0];render();root.querySelector(route[1])?.scrollIntoView({block:'start',behavior:'smooth'});
  });
  root.querySelector('#edit-profile').onclick=()=>{if(uncertainWrite){notice('أكد العملية المعلقة الأول.',true);retryUncertain();}else onboarding();};
  root.querySelector('#close-dialog').onclick=()=>root.querySelector('#coach-dialog').close();
  root.querySelector('#export-coach').onclick=async()=>{
   try{const plans=[],workoutPlans=[];for(const p of state.planRefs||[])plans.push(await api('plans/'+encodeURIComponent(p.id)));for(const p of state.workoutPlanRefs||[])workoutPlans.push(await api('workout-plans/'+encodeURIComponent(p.id)));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({...state,plans,workoutPlans},null,2)],{type:'application/json'}));a.download='coaching-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){notice(e.message,true);}
  };
  const diaryInput=root.querySelector('#diary-date');
  if(diaryInput)diaryInput.onchange=e=>{diaryDate=e.target.value;render();};
  root.querySelectorAll('[data-water-add]').forEach(btn=>btn.onclick=()=>send('water',{date:btn.dataset.date||(state.serverDate||localDate()),addCups:Number(btn.dataset.waterAdd)}));
  root.querySelectorAll('[data-water-set]').forEach(btn=>btn.onclick=()=>send('water',{date:btn.dataset.date||(state.serverDate||localDate()),cups:Number(btn.dataset.waterSet)}));
  root.querySelector('#switch-diary-mode')?.addEventListener('click',()=>send('food_switch_to_entries',{date:diaryDate,confirm:true}));
  const toggleBtn=root.querySelector('#toggle-complete');
  if(toggleBtn)toggleBtn.onclick=()=>send('food_complete',{date:diaryDate,complete:!state.foodLogs.find(x=>x.date===diaryDate)?.complete});
  root.querySelectorAll('[data-delete-food]').forEach(b=>b.onclick=()=>send('food_delete',{id:b.dataset.deleteFood}));
  root.querySelectorAll('.planned-food').forEach(form=>form.onsubmit=e=>{
   e.preventDefault();diaryDate=form.dataset.date;
   const fd=formData(form);
   send('food_entry',{...fd,date:form.dataset.date,slot:form.dataset.slot,mealId:form.dataset.meal,source:'planned'});
  });
  const manualForm=root.querySelector('#manual-food');
  if(manualForm)manualForm.onsubmit=e=>{
   e.preventDefault();const fd=formData(e.target);
   send('food_entry',{...fd,date:diaryDate,source:'manual'});
  };
  const foodSearchForm=root.querySelector('#food-search');
  if(foodSearchForm)foodSearchForm.onsubmit=async e=>{
   e.preventDefault();const version=viewVersion,request=++foodRequest;try{const result=await api('foods?scope=planning&q='+encodeURIComponent(new FormData(e.target).get('q')));if(version!==viewVersion||request!==foodRequest)return;root.querySelector('#food-search-results').innerHTML=result.items.map(i=>{const u=displayPortion(i);return `<form class="ingredient-log" data-diary-date="${diaryDate}" data-key="${esc(i.key)}" data-kcal100="${Number(i.values.energy)||0}"><h4>${esc(displayIngredientName(i))}</h4><p>${round(i.values.energy)} سعر/100 جرام · ${esc(stateLabels[i.state]||i.state)}${u?` · <strong>الوحدة: ${esc(u.label)} ≈ ${round(u.grams)} جم</strong>`:''}</p><label>الكمية بالجرام <input name="grams" type="number" min="1" max="2000" value="${u?round(u.grams):100}" required></label><label>الوجبة<select name="slot">${Object.entries(SLOTS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><button>إضافة الصنف</button></form>`;}).join('')||'<p>مفيش نتيجة في مكتبة الأصناف الحالية؛ استخدم الإضافة اليدوية.</p>';restoreDrafts(root.querySelector('#food-search-results'));root.querySelectorAll('.ingredient-log').forEach(form=>form.onsubmit=e=>{e.preventDefault();const fd=formData(form);send('food_entry',{...fd,source:'ingredient',key:form.dataset.key,date:diaryDate});});}catch(e){notice(e.message,true);}
  };
  root.querySelectorAll('[data-meal-alt]').forEach(b=>b.onclick=async()=>{const version=viewVersion,request=++alternativeRequest;try{const result=await api('meal-alternatives?mealId='+encodeURIComponent(b.dataset.mealAlt));if(version!==viewVersion||request!==alternativeRequest)return;showDialog('<h2>بدائل مقترحة من أخصائي التغذية</h2>'+result.items.map(a=>`<article class="meal-card" style="margin:10px 0"><h3>${esc(displayMealName(a.snapshot))}</h3><p><strong>${macroLine(a.snapshot)}</strong></p><ul>${(a.snapshot.ingredients||[]).map(ingredientLine).join('')}</ul><p><small>فرق السعرات ${a.energy_delta} · فرق البروتين ${a.protein_delta} جرام</small></p><button data-replace-meal="${esc(a.snapshot.template_id)}">اختيار هذه الوجبة</button></article>`).join('')+(result.items.length?'':'<p>مفيش بديل متاح يحقق نفس اختياراتك وحدود النظام.</p>'));root.querySelectorAll('[data-replace-meal]').forEach(choice=>choice.onclick=()=>send('replace_meal',{mealId:b.dataset.mealAlt,templateId:choice.dataset.replaceMeal}));}catch(e){notice(e.message,true);}});
  root.querySelectorAll('[data-exercise-alt]').forEach(b=>b.onclick=async()=>{const version=viewVersion,request=++alternativeRequest;try{const result=await api('exercise-alternatives?exerciseId='+encodeURIComponent(b.dataset.exerciseAlt)+'&dayIndex='+b.dataset.day);if(version!==viewVersion||request!==alternativeRequest)return;showDialog('<h2>بدائل مقترحة من كابتن التدريب</h2>'+result.items.map(a=>`<article><h3 dir="auto">${esc(a.name)}</h3><p dir="ltr">${a.equipment.map(q=>esc(q.equipment_id)).join(', ')}</p><button data-replace-exercise="${a.id}">اختيار هذا التمرين</button></article>`).join('')+(result.items.length?'':'<p>مفيش بديل مناسب متاح بالمعدات دي.</p>'));root.querySelectorAll('[data-replace-exercise]').forEach(choice=>choice.onclick=()=>send('replace_exercise',{dayIndex:Number(b.dataset.day),exerciseId:b.dataset.exerciseAlt,alternativeId:choice.dataset.replaceExercise}));}catch(e){notice(e.message,true);}});

  function bindSteppers(scope=root){
   scope.querySelectorAll('[data-step-target]').forEach(btn=>btn.onclick=()=>{
    const form=btn.closest('form');if(!form)return;
    const input=form.elements.namedItem(btn.dataset.stepTarget);if(!input)return;
    const delta=Number(btn.dataset.step)||0;
    const min=input.min!==''?Number(input.min):0;
    const max=input.max!==''?Number(input.max):500;
    const cur=Number(input.value)||0;
    const next=Math.min(max,Math.max(min,Math.round((cur+delta)*10)/10));
    input.value=String(next);
   });
  }
  bindSteppers(root);

  root.querySelectorAll('[data-add-set]').forEach(btn=>btn.onclick=()=>{
   const form=btn.closest('form');if(!form)return;
   const container=form.querySelector('.set-rows');if(!container)return;
   const rows=container.querySelectorAll('.set-row');
   if(rows.length>=8)return;
   const idx=rows.length;
   const lastRow=rows[rows.length-1];
   const defKg=lastRow?.querySelector(`input[name^="set_kg_"]`)?.value??form.dataset.defaultKg??15;
   const defReps=lastRow?.querySelector(`input[name^="set_reps_"]`)?.value??form.dataset.defaultReps??10;
   const stepKg=form.dataset.stepKg||2.5;
   const div=document.createElement('div');
   const weighted=form.dataset.usesKg==='true';
   div.className='set-row'+(weighted?'':' reps-only');
   div.innerHTML=`<strong class="set-label">جولة ${idx+1}</strong>
    ${weighted?`<div class="stepper-field">
     <span class="stepper-caption">${esc(form.dataset.loadLabel)}</span>
     <div class="stepper-control">
      <button type="button" class="stepper-btn" data-step-target="set_kg_${idx}" data-step="-${stepKg}" aria-label="تقليل الوزن">−</button>
      <input type="number" name="set_kg_${idx}" step="2.5" min="0" max="500" value="${esc(defKg)}" readonly tabindex="-1" aria-label="${esc(form.dataset.loadLabel)}" required>
      <button type="button" class="stepper-btn" data-step-target="set_kg_${idx}" data-step="${stepKg}" aria-label="زيادة الوزن">+</button>
     </div>
    </div>`:''}
    <div class="stepper-field">
     <span class="stepper-caption">العدات</span>
     <div class="stepper-control">
      <button type="button" class="stepper-btn" data-step-target="set_reps_${idx}" data-step="-1" aria-label="تقليل العدات">−</button>
      <input type="number" name="set_reps_${idx}" min="1" max="100" value="${esc(defReps)}" required>
      <button type="button" class="stepper-btn" data-step-target="set_reps_${idx}" data-step="1" aria-label="زيادة العدات">+</button>
     </div>
    </div>`;
   container.appendChild(div);
   bindSteppers(div);
  });

  root.querySelectorAll('[data-remove-set]').forEach(btn=>btn.onclick=()=>{
   const form=btn.closest('form');if(!form)return;
   const container=form.querySelector('.set-rows');if(!container)return;
   const rows=container.querySelectorAll('.set-row');
   if(rows.length<=1)return;
   rows[rows.length-1].remove();
  });

  root.querySelectorAll('.effort-chip').forEach(btn=>btn.onclick=()=>{
   const form=btn.closest('form');if(!form)return;
   form.querySelector('[name=effort_rir]').value=btn.dataset.effort;
   form.querySelectorAll('.effort-chip').forEach(c=>c.classList.toggle('active-chip',c===btn));
  });

  root.querySelectorAll('.workout-log').forEach(form=>form.onsubmit=e=>{
   e.preventDefault();const fd=new FormData(form);
   const rir=fd.get('effort_rir')??2;
   const sets=[];
   for(let idx=0;fd.has(`set_reps_${idx}`);idx++){
    sets.push({kg:form.dataset.usesKg==='true'?fd.get(`set_kg_${idx}`):0,reps:fd.get(`set_reps_${idx}`),rir,pain:fd.has('pain')});
   }
   const safeInc=2.5;
   editingExercises.delete(fd.get('date')+':'+form.dataset.day+':'+form.dataset.id);
   send('workout',{exerciseId:form.dataset.id,dayIndex:Number(form.dataset.day),date:fd.get('date'),sets,bothSides:fd.has('bothSides'),increment:form.dataset.usesKg==='true'?safeInc:null,autoSession:true});
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
  bindJourney(root,send);
  const reviewBtn=root.querySelector('#review-coach');
  if(reviewBtn)reviewBtn.onclick=()=>send('review',{});
  root.querySelector('#review-next-day')?.addEventListener('click',async()=>{if(await send('simulation_next',{}))window.scrollTo({top:0,behavior:'smooth'});});
  root.querySelector('#review-fast-day')?.addEventListener('click',async()=>{
   if(await send('simulation_fill',{scenario:'consistent'})){
    if(!state.adaptations?.some(a=>a.status==='pending')&&state.simulation?.day<90){
     await send('simulation_next',{});
    }
    window.scrollTo({top:0,behavior:'smooth'});
   }
  });
  root.querySelector('#review-enter-sim')?.addEventListener('click',()=>switchSimulation(true));
  const moreTips=()=>{
   tipOffset++;
   const card=root.querySelector('#tips-card');if(!card)return;
   card.outerHTML=tipsHTML(state.serverDate||localDate());
   root.querySelector('#tips-more')?.addEventListener('click',moreTips);
  };
  root.querySelector('#tips-more')?.addEventListener('click',moreTips);
  root.querySelectorAll('[data-adapt]').forEach(b=>b.onclick=()=>send('adaptation',{id:b.dataset.adapt,accept:b.dataset.accept==='true'}));
  root.querySelector('#renew-plan')?.addEventListener('click',()=>send('renew_plan',{}));
  const search=async(offset=0)=>{
   const form=root.querySelector('#catalog-search'),fd=new FormData(form);catalogQuery=String(fd.get('q'));catalogOffset=offset;const version=viewVersion,request=++catalogRequest;
   try{const d=await api('exercises?q='+encodeURIComponent(catalogQuery)+'&muscle='+encodeURIComponent(fd.get('muscle'))+'&offset='+offset);if(version!==viewVersion||request!==catalogRequest)return;root.querySelector('#catalog-results').innerHTML=`<p>${d.total} نتيجة · ${Math.min(offset+1,d.total)}–${Math.min(offset+30,d.total)}</p>`+d.items.map(x=>`<details><summary>${esc(x.name)}</summary><p>أساسية: ${x.muscles.filter(m=>m.role==='primary').map(m=>esc(m.muscle_id)).join(', ')}</p><p>ثانوية: ${x.muscles.filter(m=>m.role==='secondary').map(m=>esc(m.muscle_id)).join(', ')||'غير مسجلة'}</p><p dir="ltr" class="exercise-description">${esc(x.description)}</p><p dir="ltr">${x.equipment.map(q=>esc(q.equipment_id)).join(', ')}</p><small>${esc(x.source)} · ${esc(x.author)} · ${esc(x.license)}</small></details>`).join('')+`<div>${offset?'<button id="catalog-prev" class="secondary">السابق</button>':''}${d.nextOffset!=null?'<button id="catalog-next">التالي</button>':''}</div>`;root.querySelector('#catalog-prev')?.addEventListener('click',()=>search(Math.max(0,catalogOffset-30)));root.querySelector('#catalog-next')?.addEventListener('click',()=>search(d.nextOffset));}catch(e){notice(e.message,true);}
  };
  const catalogForm=root.querySelector('#catalog-search');
  if(catalogForm)catalogForm.onsubmit=e=>{e.preventDefault();search();};
 }
 async function loadInitialState(){
  if(loadingInitial||disposed)return;loadingInitial=true;let aborted=false;
  try{state=await api('state');if(disposed)return;diaryDate=state.serverDate;render();}
  catch(e){if(e.name==='AbortError'){aborted=true;return;}if(disposed)return;root.innerHTML=`<div class="coach-notice"><p>${esc(e.message)}</p><button id="retry-coach">حاول تاني</button></div>`;root.querySelector('button').onclick=()=>mountPlanner({root,toast});}
  finally{loadingInitial=false;if(aborted&&!disposed&&!root.hidden&&root.isConnected)queueMicrotask(loadInitialState);}
 }
 await loadInitialState();
}
