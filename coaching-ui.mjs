import {journeyHTML,bindJourney} from './coaching-journey-ui.mjs';
import {usesKg,loadLabel,setSummary} from './exercise-load.mjs';
import {simulationPanel} from './simulation-ui.mjs?v=sim8';
import {mountOnboardingChat} from './onboarding-chat.mjs';
import {MUSCLE_REGIONS,FOCUS_LABELS,SLOTS,localDate,dateOffset,effectiveSets,onboardingState} from './coaching-shared.mjs';
import {householdQuantity,displayPortion} from './planner-household.mjs';
import {displayMealName,displayIngredientName} from './meal-presentation.mjs';
import {say,seedPick,SORENESS,dailyTips} from './coach-messages.mjs?v=msg3';
import {personalBrief} from './personal-brief.mjs';
import {splitReview} from './split-review.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=n=>n==null?'—':Math.round(Number(n)||0);
const days=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
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

function defaultStartKg(e,state){
 if(!usesKg(e))return 0;
 const level=state.onboarding?.workoutPrefs?.level||'beginner';
 const adv=level==='intermediate'||level==='advanced';
 if(['squat','hinge'].includes(e.pattern))return adv?30:20;
 if(['horizontal_push','horizontal_pull'].includes(e.pattern))return adv?22.5:15;
 if(['vertical_push','vertical_pull','lunge'].includes(e.pattern))return adv?15:10;
 return adv?12.5:8;
}

const DISEASE_LABELS={
 hypertension:'الضغط المرتفع (ملح منخفض)',
 insulin_resistance:'مقاومة الإنسولين (مؤشر جلايسيمي هادئ)',
 pcos:'تكيس المبايض (توازن الإنسولين)',
 ibs:'القولون العصبي (خفيف على الهضم)',
 cholesterol:'الكوليسترول (دهون صحية)',
 gout:'النقرس (تقليل البيورين وضبط البروتين)',
 anemia:'الأنيميا',
 vitamin_d_deficiency:'نقص فيتامين د',
 lactose_intolerance:'عدم تحمّل اللاكتوز',
 favism:'أنيميا الفول (استبعاد الفول)',
 fatty_liver:'دهون الكبد'
};
const INJURY_LABELS={
 knee_pain:'حماية الركبة',
 lower_back_pain:'حماية أسفل الظهر',
 shoulder_pain:'مراعاة ألم الكتف',
 shoulder_injury:'مراعاة الكتف',
 wrist_pain:'حماية الرسغ',
 ankle_pain:'مراعاة ألم الكاحل',
 ankle_injury:'مراعاة الكاحل',
 neck_pain:'حماية الرقبة',
 hip_pain:'حماية الحوض',
 diastasis_recti:'حماية جدار البطن'
};

function buildSpecialistBrief(state,todayStr,todayPlanDay){
 const notes=personalBrief(state,todayStr);
 const roles={nutrition:'🥗 أخصائي التغذية',training:'💪 كابتن التدريب',followup:'💚 متابعة العادات والاستشفاء'};
 const splitAdvice=splitReview(state,todayStr);
 const diseases=(state.profile?.diseases||[]).filter(x=>x&&x!=='none').map(x=>DISEASE_LABELS[x]||x);
 const injuries=(state.onboarding?.workoutPrefs?.injuries||[]).filter(x=>x&&x!=='none').map(x=>INJURY_LABELS[x]||x);
 const tags=[...diseases,...injuries];
 return `<section class="coach-card specialist-brief" style="background:linear-gradient(135deg,#f1f8f5 0%,#e6f4ed 100%);border-color:#b7dec9">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
   <strong style="color:#1b4332;font-size:15px">💬 رسائلك النهاردة</strong>
   <span style="font-size:12px;background:#fff;color:#1b4332;padding:3px 10px;border-radius:999px;border:1px solid #cce3d6;font-weight:700">${todayStr}</span>
  </div>
  <small class="brief-context">متابعة آلية مبنية على تسجيلاتك؛ بتتحدث لما بياناتك تتغير.</small>
  ${notes.map(n=>`<article class="personal-note" data-personal-role="${n.role}" ${n.priority==='urgent'?'role="alert"':''}>
   <strong>${roles[n.role]}</strong><p>${esc(n.text)}</p>${['recovery','food','feedback','workout'].includes(n.actionTarget)?`<button type="button" data-brief-action="${n.actionTarget}">${esc(n.action)}</button>`:`<p class="personal-action">${esc(n.action)}</p>`}
  </article>`).join('')}
  ${splitAdvice?`<details class="brief-details"><summary>مراجعة تقسيمة التمرين بعد ٨ أسابيع</summary><p>${esc(splitAdvice.text)}</p></details>`:''}
  ${tags.length?`<div class="coach-tags" style="margin-top:8px">${tags.map(t=>`<span style="background:#fff;border-color:#b7dec9;color:#1b4332">🩺 مراعاة: ${esc(t)}</span>`).join('')}</div>`:''}
 </section>`;
}

export async function mountPlanner({root,toast}){
 root._coachRefreshCleanup?.();
 let tipOffset=0;
 const tipsHTML=(todayStr)=>{
  const tips=dailyTips(todayStr,{hasWorkout:!!state.workoutPlan,offset:tipOffset});
  const follow=personalBrief(state,todayStr).find(n=>n.role==='followup');
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
 let state,busy=false,diaryDate=localDate(),activeTab='nutrition',catalogQuery='',catalogOffset=0,viewVersion=0,catalogRequest=0,foodRequest=0,alternativeRequest=0,submittedForm=null,uncertainWrite=null;
 let simulationMode=new URL(location.href).searchParams.get('simulation')==='1';
 const syncPlannerClass=()=>document.body?.classList.toggle('planner-active',!root.hidden);
 syncPlannerClass();
 window.addEventListener('hashchange',syncPlannerClass);
 window.addEventListener('planner-leave',()=>document.body?.classList.remove('planner-active'));
 const drafts=new Map();
 const editingExercises=new Set();
 const formKey=form=>(form.id||[form.classList[0],form.dataset.day||'',form.dataset.id||form.dataset.meal||form.dataset.key||form.dataset.coachingFeedback||''].join('|'))+(form.dataset.diaryDate?'|'+form.dataset.diaryDate:'')+(simulationMode?'|sim-day:'+state?.simulation?.day:'');
 function captureDrafts(excluded){for(const form of root.querySelectorAll('form'))if(!form.closest('#coach-onboarding-section')&&formKey(form)!==excluded)drafts.set(formKey(form),formData(form));if(excluded)drafts.delete(excluded);}
 function restoreDrafts(scope=root){for(const form of scope.querySelectorAll('form')){const draft=drafts.get(formKey(form));if(!draft)continue;
  if(form.matches('.workout-log')){
   const count=Object.keys(draft).filter(k=>/^set_reps_\d+$/.test(k)).length;
   if(count>=1&&count<=10){
    for(let i=form.querySelectorAll('.set-row').length;i<count;i++)form.querySelector('[data-add-set]')?.click();
    for(let i=form.querySelectorAll('.set-row').length;i>count;i--)form.querySelector('[data-remove-set]')?.click();
   }
  }
  for(const [name,value]of Object.entries(draft)){const field=form.elements.namedItem(name);if(field&&'value'in field){if(field.type==='checkbox')field.checked=!!value;else field.value=String(value);}}
  if(form.matches('.workout-log')){const rir=Number(draft.effort_rir);form.querySelectorAll('.effort-chip').forEach(b=>b.classList.toggle('active-chip',Number(b.dataset.effort)===(rir>=3?3:rir<=1?0:2)));}
 }}
 if(root._coachSubmit)root.removeEventListener('submit',root._coachSubmit,true);
 root._coachSubmit=e=>{if(!e.target.id.includes('search')&&!e.target.closest('#coach-onboarding-section'))submittedForm=formKey(e.target);};root.addEventListener('submit',root._coachSubmit,true);
 const api=async(path,options={})=>{const r=await fetch('/v1/'+path+(simulationMode?(path.includes('?')?'&':'?')+'simulation=1':''),options);const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'تعذر الاتصال'),{status:r.status});return data;};
 // Re-read the server clock and evidence while visible. Do not interrupt forms,
 // race writes, or advance a simulation from the device clock.
 let refreshing=false,disposed=false;
 const editing=()=>root.contains(document.activeElement)&&document.activeElement.matches('input,select,textarea,[contenteditable="true"]');
 async function refreshMessages(){
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
  }catch{notice('تعذر تحديث المتابعة؛ الرسائل المعروضة حسب آخر تحديث. هنحاول تاني تلقائيًا.');}
  finally{refreshing=false;}
 }
 const refreshTimer=setInterval(refreshMessages,60000);
 window.addEventListener('focus',refreshMessages);document.addEventListener('visibilitychange',refreshMessages);
 root._coachRefreshCleanup=()=>{disposed=true;clearInterval(refreshTimer);window.removeEventListener('focus',refreshMessages);document.removeEventListener('visibilitychange',refreshMessages);};
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

   ${buildSpecialistBrief(state,todayStr,todayPlanDay)}
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
    <div class="coach-grid" style="margin-top:8px">${Object.entries(MUSCLE_REGIONS).map(([key,name])=>`<label>شد عضلي ${name} (0-10)<input name="sore:${key}" type="number" min="0" max="10" placeholder="0"></label>`).join('')}</div>
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
  wire();wireSimulation();restoreDrafts();
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
 try{state=await api('state');diaryDate=state.serverDate;render();}catch(e){root.innerHTML=`<div class="coach-notice"><p>${esc(e.message)}</p><button id="retry-coach">حاول تاني</button></div>`;root.querySelector('button').onclick=()=>mountPlanner({root,toast});}
}
