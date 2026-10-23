import {makeWeek,scaleSnapshot,sumSnapshots,assessDay} from '../planner-core.mjs';
import {FIXED_DIET_MEALS,assertDietDay} from '../diet-patterns.mjs';
import {workoutPlan,exerciseAlternatives,muscleRegions,weeklySetTotals,scheduledSessions} from './workouts.mjs';
import {recovery,calorieReview,progression} from './recovery.mjs';
import {library,activePlan,foodCommand,replaceMeal,plannedEnergyForDate} from './food.mjs';
import {volumeReview} from './training-review.mjs';
import {localDate,dateOffset,dateForLog,validDate,number,MUSCLE_REGIONS} from '../coaching-shared.mjs';
export {number};export const today=localDate;
export const empty=()=>({schemaVersion:2,revision:0,profile:null,preferences:null,onboarding:null,plans:[],planRefs:[],workoutPlan:null,foodLogs:[],foodEntries:[],weights:[],workoutLogs:[],sessions:[],checkins:[],adaptations:[],history:[]});
const clean=a=>Array.isArray(a)?a.filter(x=>x&&x!=='none'):[];
export function normalize(s){for(const key of ['workoutPlanRefs','planRefs','foodEntries','sessions','foodLogs','weights','workoutLogs','checkins','adaptations','history'])s[key]||=[];s.schemaVersion=2;return s;}
function discardPending(s){for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';}
export function generate(s,d){
 const age=number(d.age,18,90,'العمر'),weight=number(d.weight,35,250,'الوزن'),height=number(d.height,120,230,'الطول');
 if(!['male','female'].includes(d.sex))throw Error('حدد الجنس لحساب الاحتياجات.');
 if(age>70||clean(d.diseases).length||clean(d.injuries).length||(d.maternalStatus&&d.maternalStatus!=='none'))throw Error('الحالة تحتاج مراجعة متخصص قبل إنشاء خطة آلية. النسخة الحالية للبالغين الأصحاء بدون إصابة.');
 if(!['lose','maintain','gain','muscle_gain'].includes(d.goal))throw Error('هدف غير صالح');
 if(!['nutrition_only','workouts_only','nutrition_and_workouts'].includes(d.serviceTrack))throw Error('مسار غير صالح');
 const bmi=weight/((height/100)**2);if(bmi<18.5&&d.goal==='lose')throw Error('تقليل الوزن غير مناسب مع مؤشر كتلة الجسم الحالي.');
 if(d.diseases!=null&&!Array.isArray(d.diseases)||d.injuries!=null&&!Array.isArray(d.injuries))throw Error('بيانات الحالة الصحية غير صالحة.');
 const wp=d.serviceTrack==='nutrition_only'?null:workoutPlan(d);
 const profile={name:String(d.name||'').slice(0,100),age,weight,height,sex:d.sex,goal:d.goal,targetWeight:d.targetWeight?number(d.targetWeight,35,250,'الوزن المستهدف'):null,goalPace:d.goalPace,activity:d.dailyActivity||'light',trainingDays:wp?.days.length||0,workoutDays:wp?.days.map(x=>x.dayIndex)||[],diseases:[],maternalStatus:'none',ketoAcknowledged:d.dietType==='keto',fastingAcknowledged:d.dietType==='intermittent_fasting'};
 if(profile.targetWeight&&profile.goal==='lose'&&(profile.targetWeight>=weight||profile.targetWeight/(height/100)**2<18.5))throw Error('الوزن المستهدف لازم يكون أقل من الحالي وفوق حد النحافة.');
 const fixed=FIXED_DIET_MEALS[d.dietType];
 const prefs={diet:d.dietType||'balanced',fasting:fixed?.fasting||'none',eatingStart:d.eatingStart||'12:00',region:d.region||'egypt',budget:d.budget||'medium',meals:fixed?.meals||number(d.mealsCount||4,2,6,'الوجبات'),proteins:d.dietType==='vegan'?['legumes','nuts']:d.dietType==='vegetarian'?['legumes','eggs','dairy','nuts']:['legumes','eggs','dairy','chicken','fish','meat','nuts'],excludedKeys:[],excludedFoodIds:[],excludedGroups:clean(d.excludedGroups)};
 const plan=d.serviceTrack==='workouts_only'?null:makeWeek(profile,prefs,library,today(),crypto.randomUUID());
 if(s.profile)s.history.push({at:new Date().toISOString(),kind:'profile',profile:s.profile,planId:s.active_plan_id,workoutPlanId:s.workoutPlan?.id});
 if(s.workoutPlan){s.workoutArchives||=[];s.workoutArchives.push(s.workoutPlan);}
 s.profile=profile;s.preferences=prefs;s.workoutPlan=wp;s.nutritionAdjustment=null;
 const {authEmail,socialSuggestedName,isAuthenticated,...workoutPrefs}=d;
 s.onboarding={serviceTrack:d.serviceTrack,workoutPrefs,isAuthenticated:true};
 if(plan){plan.effective_from=today();s.plans.push(plan);s.active_plan_id=plan.id;}else s.active_plan_id=null;
 s.sessionAdjustment=null;discardPending(s);return s;
}
export function review(s){
 const ready=recovery(s.checkins,Date.now(),s.workoutLogs),plan=activePlan(s),proposals=[];
 let nutrition={action:'hold',reason:plan?'نحتاج استشفاء مستقر قبل تعديل السعرات.':'مسارك لا يحتوي على خطة أكل.'};
 if(['caution','high'].includes(ready.status)&&s.workoutPlan)proposals.push({kind:'recovery',setFactor:ready.setFactor,regions:Object.entries(ready.muscles).filter(([,m])=>m.status==='caution').map(([r])=>r),reason:ready.reasons.join('؛ '),expiresAt:new Date(Date.now()+86400000).toISOString()});
 const targetWeights=s.weights.filter(w=>w.date>=dateOffset(today(),-6)&&w.date<=today());
 const averageWeight=targetWeights.length?targetWeights.reduce((n,w)=>n+w.kg,0)/targetWeights.length:null;
 const reached=targetWeights.length>=3&&s.profile.targetWeight&&((s.profile.goal==='lose'&&averageWeight<=s.profile.targetWeight)||(['gain','muscle_gain'].includes(s.profile.goal)&&averageWeight>=s.profile.targetWeight));
 if(plan&&ready.status==='ready'&&reached){
  nutrition={action:'propose',reason:'متوسط 3 أوزان على الأقل وصل للهدف؛ نقترح الانتقال للحفاظ على الوزن بدل الاستمرار في العجز أو الفائض.'};
  proposals.push({kind:'maintenance',averageWeight,...nutrition,expiresAt:new Date(Date.now()+7*86400000).toISOString()});
 }
 else if(plan&&ready.status==='ready'&&(!s.lastVolumeChange||Date.now()-s.lastVolumeChange>=14*86400000)){
  nutrition=calorieReview(s.weights,s.foodLogs,s.profile.goal,Number(plan.targets.energy),Date.now(),s.lastCalorieChange||0);
  if(nutrition.action==='propose')proposals.push({kind:'calories',...nutrition,expiresAt:new Date(Date.now()+7*86400000).toISOString()});
 }
 const volume=volumeReview(s,ready);
 if(!proposals.length&&volume.action==='propose')proposals.push({...volume,expiresAt:new Date(Date.now()+7*86400000).toISOString()});
 discardPending(s);
 for(const p of proposals)s.adaptations.push({...p,id:crypto.randomUUID(),baseRevision:s.revision+1,status:'pending',at:new Date().toISOString()});
 const sessions=s.sessions.filter(x=>x.date>=dateOffset(today(),-13));
 s.lastReview={at:new Date().toISOString(),recovery:ready.status,nutrition,volume,workout:{completed:sessions.filter(x=>x.status==='completed').length,missed:sessions.filter(x=>x.status==='missed').length},message:proposals.length?'في اقتراح جاهز للمراجعة.':'احتفظنا بخطتك؛ التفاصيل بتوضح البيانات المطلوبة أو سبب عدم التعديل.'};
 return s;
}
export function retargetPlan(plan,energy,prefs,effective){
 const factor=energy/Number(plan.targets.energy),previous=structuredClone(plan.targets);
 plan.targets.energy=energy;plan.targets.protein=previous.protein;
 const fatShare=Number(previous.fat)*9/Math.max(1,Number(previous.energy)-Number(previous.protein)*4);
 plan.targets.fat=Math.round(Math.max(0,(energy-plan.targets.protein*4)*fatShare)/9);
 plan.targets.carbs=Math.round(Math.max(0,energy-plan.targets.protein*4-plan.targets.fat*9)/4);
 for(const day of plan.days){
  if(day.date<effective)continue;
  for(const meal of day.meals){meal.id=crypto.randomUUID();meal.target_energy*=factor;meal.snapshot=scaleSnapshot(meal.snapshot,factor);}
  assertDietDay(day.meals.map(m=>m.snapshot),prefs.diet,plan.targets);
  day.summary=sumSnapshots(day.meals.map(m=>m.snapshot));
 }
 plan.warnings=plan.days.flatMap(d=>{const messages=assessDay(d.summary,plan.targets);return messages.length?[{date:d.date,messages}]:[];});
 return plan;
}
function adjustCalories(s,a){
 const previous=activePlan(s),energy=Number(previous.targets.energy)+a.delta;
 if(energy<(s.profile.sex==='female'?1200:1400)||energy>4200)throw Error('التعديل يتجاوز حدود الخطة الآلية؛ راجع متخصصًا.');
 const effective=dateOffset(today(),1),plan=structuredClone(previous);
 plan.id='plan-'+crypto.randomUUID();plan.parent_id=previous.id;plan.created_at=new Date().toISOString();plan.effective_from=effective;plan.changeReason=a.reason;
 if(s.foodEntries.some(e=>e.date>=effective))throw Error('في تسجيل فعلي ليوم قادم؛ راجع التاريخ الأول.');
 retargetPlan(plan,energy,s.preferences,effective);
 s.plans.push(plan);s.active_plan_id=plan.id;s.lastCalorieChange=Date.now();s.nutritionAdjustment={energy,protein:plan.targets.protein,effectiveFrom:effective,reason:a.reason};
}
export function command(input,action,p){
 const s=normalize(input);
 if(action==='generate')return generate(s,p);
 if(!s.profile)throw Error('أكمل بياناتك أولًا.');
 if(['food_entry','food_delete','food_complete'].includes(action))return foodCommand(s,action,p);
 if(action==='replace_meal')return replaceMeal(s,p);
 if(action==='renew_plan'){
  const current=activePlan(s);if(!current)throw Error('مسارك للتمرين فقط.');
  if(current.days.at(-1).date>=today())throw Error('الخطة الحالية لسه شغالة؛ الأسبوع الجديد يظهر بعد انتهائها.');
  const next=makeWeek(s.profile,s.preferences,library,today(),crypto.randomUUID());next.parent_id=current.id;next.effective_from=today();
  if(s.nutritionAdjustment)retargetPlan(next,s.nutritionAdjustment.energy,s.preferences,today());
  s.plans.push(next);s.active_plan_id=next.id;
 }else if(action==='weight'){
  const date=dateForLog(p.date||today()),kg=number(p.kg,35,250,'الوزن');s.weights=s.weights.filter(x=>x.date!==date);s.weights.push({date,kg});
 }else if(action==='food'){
  const date=dateForLog(p.date),plan=activePlan(s);if(s.foodEntries.some(e=>e.date===date))throw Error('اليوم فيه وجبات تفصيلية؛ استخدم إغلاق اليوم.');
  const energy=number(p.energy,0,10000,'السعرات الفعلية'),plannedEnergy=plannedEnergyForDate(s,date);
  s.foodLogs=s.foodLogs.filter(x=>x.date!==date);s.foodLogs.push({date,complete:p.complete===true,adherence:plannedEnergy?Math.max(0,Math.round(100-Math.abs(energy-plannedEnergy)/plannedEnergy*100)):null,energy,plannedEnergy,planId:plan?.id,source:'daily_total'});
 }else if(action==='recovery'){
  for(const key of ['pain','illness','redFlags'])if(typeof p[key]!=='boolean')throw Error('أجب على أسئلة الألم والمرض.');
  const sorenessByRegion={};for(const [key,v]of Object.entries(p.sorenessByRegion||{})){if(!(key in MUSCLE_REGIONS))throw Error('منطقة عضلية غير صالحة.');sorenessByRegion[key]=number(v,0,10,'ألم العضلات');}
  const painRegions=p.painRegions||[];if(!Array.isArray(painRegions)||painRegions.some(r=>!(r in MUSCLE_REGIONS)))throw Error('مناطق الألم غير صالحة.');
  const c={at:new Date().toISOString(),date:today(),sleepHours:number(p.sleepHours,0,24,'ساعات النوم'),sleepQuality:number(p.sleepQuality,1,5,'جودة النوم'),fatigue:number(p.fatigue,1,5,'الإجهاد'),stress:p.stress==null||p.stress===''?null:number(p.stress,1,5,'الضغط'),soreness:number(p.soreness??0,0,10,'ألم العضلات'),sorenessByRegion,painRegions,pain:p.pain||painRegions.length>0,illness:p.illness,redFlags:p.redFlags};
  s.checkins=s.checkins.filter(x=>x.date!==c.date);s.checkins.push(c);s.sessionAdjustment=null;for(const day of s.workoutPlan?.days||[])for(const exercise of day.exercises){delete exercise.suggestedKg;delete exercise.progressionReason;}
 }else if(action==='workout'){
  const day=s.workoutPlan?.days.find(d=>d.dayIndex===Number(p.dayIndex)),exercise=(day?.exercises||s.workoutPlan?.days.flatMap(x=>x.exercises))?.find(x=>x.id===p.exerciseId);if(!exercise)throw Error('التمرين غير موجود في خطتك.');
  if(!Array.isArray(p.sets)||p.sets.length<1||p.sets.length>10)throw Error('سجل المجموعات الفعلية.');
  const date=dateForLog(p.date||today());const sets=p.sets.map(x=>({kg:number(x.kg,0,500,'الوزن'),reps:number(x.reps,1,100,'التكرارات'),rir:x.rir==null?null:number(x.rir,0,10,'التكرارات المتبقية'),pain:x.pain===true}));
  if(sets.some(x=>!Number.isInteger(x.reps)))throw Error('التكرارات لازم تكون أعداد صحيحة.');
  const existing=s.workoutLogs.find(l=>l.date===date&&l.exerciseId===exercise.id&&l.dayIndex===(day?.dayIndex??null)&&l.planId===s.workoutPlan.id);
  const entry={id:existing?.id||crypto.randomUUID(),at:new Date().toISOString(),date,exerciseId:exercise.id,dayIndex:day?.dayIndex??null,planId:s.workoutPlan.id,loadMode:exercise.loadMode,sets,increment:p.increment?number(p.increment,.1,20,'زيادة الوزن'):null};
  if(existing)s.workoutLogs=s.workoutLogs.filter(l=>l.id!==existing.id);s.workoutLogs.push(entry);
  const ready=recovery(s.checkins,Date.now(),s.workoutLogs);const localBlocked=muscleRegions(exercise).some(r=>['caution','hold'].includes(ready.muscles[r]?.status));
  const next=progression({...exercise,planId:s.workoutPlan.id},s.workoutLogs,{...ready,progressionAllowed:ready.progressionAllowed&&!localBlocked&&date===today()});
  delete exercise.suggestedKg;delete exercise.progressionReason;
  if(next.action==='increase'){exercise.suggestedKg=next.kg;exercise.progressionReason=next.reason;exercise.suggestionAt=new Date().toISOString();}
 }else if(action==='session'){
  const dayIndex=number(p.dayIndex,0,6,'يوم التمرين'),date=dateForLog(p.date||today());
  if(!s.workoutPlan?.days.some(d=>d.dayIndex===dayIndex)||!['completed','missed'].includes(p.status))throw Error('جلسة غير صالحة.');
  if(p.status==='completed'&&!s.workoutLogs.some(l=>l.date===date&&l.planId===s.workoutPlan.id&&l.dayIndex===dayIndex))throw Error('سجّل مجموعات تمرين واحد على الأقل قبل إنهاء الجلسة.');
  const session={id:crypto.randomUUID(),date,dayIndex,planId:s.workoutPlan.id,status:p.status,duration:p.status==='completed'?number(p.duration,1,240,'مدة الجلسة'):null,rpe:p.status==='completed'?number(p.rpe,0,10,'مجهود الجلسة'):null};
  s.sessions=s.sessions.filter(x=>!(x.date===date&&x.dayIndex===dayIndex&&x.planId===s.workoutPlan.id));s.sessions.push(session);
 }else if(action==='replace_exercise'){
  const alternatives=exerciseAlternatives(s,p.dayIndex,p.exerciseId),choice=alternatives.find(e=>e.id===p.alternativeId);if(!choice)throw Error('البديل مش مناسب لنفس الحركة أو المعدات.');
  const previous=s.workoutPlan,next=structuredClone(previous);next.id=crypto.randomUUID();next.parent_id=previous.id;next.version++;
  const day=next.days.find(d=>d.dayIndex===Number(p.dayIndex));const i=day.exercises.findIndex(e=>e.id===p.exerciseId),old=day.exercises[i];
  day.exercises[i]={...choice,regions:muscleRegions(choice),sets:old.sets,repMin:old.repMin,repMax:old.repMax,rir:old.rir,restSeconds:old.restSeconds};
  s.history.push({at:new Date().toISOString(),kind:'workout_replacement',previousId:previous.id,nextId:next.id,exerciseId:old.id,alternativeId:choice.id});s.workoutArchives||=[];s.workoutArchives.push(previous);next.weeklySets=weeklySetTotals(next.days);for(const d of next.days)for(const e of d.exercises){delete e.suggestedKg;delete e.progressionReason;}s.workoutPlan=next;discardPending(s);
 }else if(action==='reschedule'){
  const date=p.toDate;if(!validDate(date)||date<today()||date>dateOffset(today(),14))throw Error('اختار يوم خلال الأسبوعين الجايين.');
  const dayIndex=number(p.dayIndex,0,6,'يوم التمرين');if(!s.workoutPlan?.days.some(d=>d.dayIndex===dayIndex))throw Error('اليوم غير موجود في خطتك.');
  const existing=scheduledSessions(s).find(x=>x.date===date);if(existing||s.sessions.some(x=>x.date===date&&x.status==='completed'))throw Error('في جلسة تانية في نفس اليوم؛ اختار يوم راحة.');
  const currentOccurrence=scheduledSessions(s).find(x=>x.dayIndex===dayIndex);const priorOverride=(s.scheduleOverrides||[]).find(o=>o.planId===s.workoutPlan.id&&o.dayIndex===dayIndex&&o.toDate===currentOccurrence?.date);const fromDate=priorOverride?.fromDate||currentOccurrence?.date;if(!fromDate||fromDate===date)throw Error('اختار موعد مختلف عن موعد الجلسة الحالي.');
  discardPending(s);s.adaptations.push({id:crypto.randomUUID(),kind:'schedule',dayIndex,fromDate,toDate:date,status:'pending',baseRevision:s.revision+1,at:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),reason:'نقل جلسة '+dayIndex+' إلى '+date+' باختيارك، بدون تقليل سعرات الأكل.'});
 }else if(action==='review')return review(s);
 else if(action==='adaptation'){
  const a=s.adaptations.find(x=>x.id===p.id&&x.status==='pending');if(!a)throw Error('الاقتراح غير موجود.');
  if(p.accept===false){a.status='rejected';return s;}if(p.accept!==true)throw Error('حدد موافقتك على الاقتراح.');
  if(a.baseRevision!==s.revision)throw Object.assign(Error('بياناتك اتغيرت؛ اطلب مراجعة جديدة.'),{status:409});
  if(a.expiresAt&&Date.parse(a.expiresAt)<Date.now())throw Error('الاقتراح انتهت صلاحيته؛ اطلب مراجعة جديدة.');
  if(a.kind==='recovery')s.sessionAdjustment={setFactor:a.setFactor,regions:a.regions,expiresAt:a.expiresAt,reason:a.reason};
  else if(a.kind==='calories')adjustCalories(s,a);
  else if(a.kind==='maintenance'){
   const before=activePlan(s),profile={...s.profile,weight:Math.round(a.averageWeight*10)/10,goal:'maintain',targetWeight:null};
   const start=dateOffset(today(),1),plan=makeWeek(profile,s.preferences,library,start,crypto.randomUUID());
   const currentDay=before.days.find(d=>d.date===today());if(currentDay)plan.days.unshift(structuredClone(currentDay));
   plan.parent_id=before.id;plan.effective_from=start;plan.changeReason=a.reason;
   s.history.push({kind:'goal_maintenance',at:new Date().toISOString(),profile:s.profile,planId:before.id});
   s.profile=profile;s.plans.push(plan);s.active_plan_id=plan.id;s.lastCalorieChange=Date.now();s.nutritionAdjustment={energy:plan.targets.energy,protein:plan.targets.protein,effectiveFrom:start,reason:a.reason};
  }
  else if(a.kind==='weekly_volume'){
   if(s.workoutPlan.id!==a.planId)throw Object.assign(Error('خطة التمرين اتغيرت؛ اطلب مراجعة جديدة.'),{status:409});
   const before=s.workoutPlan,next=structuredClone(before);next.id=crypto.randomUUID();next.parent_id=before.id;next.version++;
   const exercise=next.days.find(d=>d.dayIndex===a.dayIndex)?.exercises.find(e=>e.id===a.exerciseId);
   if(!exercise)throw Error('التمرين غير موجود.');exercise.sets+=a.extraSets;
   next.weeklySets=weeklySetTotals(next.days);
   s.history.push({kind:'weekly_volume',at:new Date().toISOString(),previousId:before.id,nextId:next.id,reason:a.reason});
   s.workoutArchives||=[];s.workoutArchives.push(before);for(const d of next.days)for(const e of d.exercises){delete e.suggestedKg;delete e.progressionReason;}s.workoutPlan=next;s.lastVolumeChange=Date.now();
  }
  else if(a.kind==='schedule'){s.scheduleOverrides||=[];s.scheduleOverrides=s.scheduleOverrides.filter(x=>x.dayIndex!==a.dayIndex);s.scheduleOverrides.push({dayIndex:a.dayIndex,fromDate:a.fromDate,toDate:a.toDate,planId:s.workoutPlan.id});}
  a.status='accepted';a.acceptedAt=new Date().toISOString();
 }else throw Error('عملية غير معروفة');
 return s;
}
