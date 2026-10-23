import {clockNow,isoNow,clockDate} from './clock.mjs';
import {makeWeek,scaleSnapshot,sumSnapshots,assessDay,validatePreferences,nutritionQualityIssues} from '../planner-core.mjs';
import {FIXED_DIET_MEALS,assertDietDay} from '../diet-patterns.mjs';
import {workoutPlan,workoutSafetyIssues,exerciseAlternatives,muscleRegions,weeklySetTotals,scheduledSessions,estimatedSessionMinutes,eachSide} from './workouts.mjs';
import {recovery,calorieReview,progression,hasPerformanceDrop,workoutProgressionSummary} from './recovery.mjs';
import {library,activePlan,foodCommand,replaceMeal,plannedEnergyForDate} from './food.mjs';
import {ensureTrainingState,forkWorkout,expectedExercises,sessionCompletion,reconcileSessions} from './training-state.mjs';
import {volumeReview} from './training-review.mjs';
import {localDate,dateOffset,dateForLog as validateLogDate,validDate,number,integer,boolean,stringList,plainRecord,MUSCLE_REGIONS,needsHealthConfirmation,needsScheduleConfirmation,normalizeWeekdayDraft} from '../coaching-shared.mjs';
const dateForLog=date=>validateLogDate(date,clockNow());
export {number};export const today=clockDate;
export const SUPPORTED_WELLNESS_CONDITIONS=new Set(['hypertension','insulin_resistance','pcos','ibs','cholesterol','gout','anemia','vitamin_d_deficiency','lactose_intolerance','favism','fatty_liver']);
export const SUPPORTED_MILD_INJURIES=new Set(['knee_pain','lower_back_pain','shoulder_pain','wrist_pain','ankle_pain','neck_pain','hip_pain','diastasis_recti']);
export const empty=()=>({schemaVersion:3,revision:0,profile:null,preferences:null,onboarding:null,plans:[],planRefs:[],workoutPlan:null,foodLogs:[],foodEntries:[],waterLogs:[],weights:[],workoutLogs:[],sessions:[],checkins:[],adaptations:[],history:[]});
const clean=a=>a==null?[]:stringList(a,'قائمة الاختيارات').filter(x=>x!=='none');
export function normalize(s){for(const key of ['workoutPlanRefs','planRefs','foodEntries','waterLogs','sessions','foodLogs','weights','workoutLogs','checkins','adaptations','history'])s[key]||=[];s.schemaVersion=3;
 let reopened=false;
 for(const log of s.foodLogs)if(log.source==='entries'&&log.completionPolicy!==1){log.legacyCompletion=!!log.complete;log.complete=false;log.completionPolicy=1;log.confirmedAt=null;reopened=true;}
 if(reopened){for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';s.lastReview=null;}
 s.workoutSafetyIssues=workoutSafetyIssues(s);
 if(s.workoutSafetyIssues.length){for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';for(const day of s.workoutPlan.days)for(const exercise of day.exercises){delete exercise.suggestedKg;delete exercise.progressionReason;}}
 ensureTrainingState(s);reconcileSessions(s);return s;}
export function dailyWaterTarget(s,date=today()){
 const w=Number(s?.profile?.weight)||75;
 let ml=w*35;
 if(s?.profile?.activity==='moderate')ml+=350;
 else if(s?.profile?.activity==='active')ml+=500;
 const isWorkoutDay=scheduledSessions(s,date,1).some(x=>x.date===date)||(s?.sessions||[]).some(x=>x.date===date&&x.status!=='missed');
 if(isWorkoutDay)ml+=500;
 const liters=Math.max(1.8,Math.min(5.0,Math.round((ml/1000)*10)/10));
 const targetCups=Math.round((liters*1000)/250);
 return {liters,targetCups,isWorkoutDay};
}
function discardPending(s){for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';}
export function generate(s,d,seed=crypto.randomUUID()){
 d=normalizeWeekdayDraft(d);
 const age=integer(d.age,18,70,'العمر'),weight=number(d.weight,35,250,'الوزن'),height=number(d.height,120,230,'الطول');
 if(!['male','female'].includes(d.sex))throw Error('حدد الجنس لحساب الاحتياجات.');
 if(d.diseases!=null&&!Array.isArray(d.diseases)||d.injuries!=null&&!Array.isArray(d.injuries))throw Error('بيانات الحالة الصحية غير صالحة.');
 const declaredDiseases=clean(d.diseases),declaredInjuries=clean(d.injuries);
 const unsupportedClinical=declaredDiseases.some(x=>!SUPPORTED_WELLNESS_CONDITIONS.has(x))||declaredInjuries.some(x=>!SUPPORTED_MILD_INJURIES.has(x))||(d.maternalStatus&&d.maternalStatus!=='none');
 if(age>70||unsupportedClinical)throw Error('الحالة تحتاج مراجعة متخصص قبل إنشاء خطة آلية. النسخة الحالية تدعم الحالات الشائعة المستقرة وتستبعد الحالات الحرجة كالسكري غير المنتظم أو الحمل.');
 if(!['lose','maintain','gain','muscle_gain'].includes(d.goal))throw Error('هدف غير صالح');
 if(!['nutrition_only','workouts_only','nutrition_and_workouts'].includes(d.serviceTrack))throw Error('مسار غير صالح');
 const bmi=weight/((height/100)**2);if(bmi<12.5||bmi>65)throw Error('الوزن والطول خارج نطاق التخطيط الآلي؛ راجع القياسات أو متخصصًا.');if(bmi<18.5&&d.goal==='lose')throw Error('تقليل الوزن غير مناسب مع مؤشر كتلة الجسم الحالي.');
 const wp=d.serviceTrack==='nutrition_only'?null:workoutPlan({...d,injuries:declaredInjuries});
 const externalTrainingDays=d.externalTrainingDays==null?[]:(Array.isArray(d.externalTrainingDays)&&d.externalTrainingDays.length<=6?[...new Set(d.externalTrainingDays.map(v=>integer(v,0,6,'يوم تمرينك خارج التطبيق')))]:(()=>{throw Error('أيام التمرين خارج التطبيق غير صالحة.');})());
 if(d.serviceTrack==='nutrition_only'&&d.goal==='muscle_gain'&&!externalTrainingDays.length)throw Error('هدف زيادة العضلات يحتاج أيام مقاومة مؤكدة، حتى لو خطتك هنا للأكل فقط.');
 const profile={weekdayConvention:'js_sunday_0',name:String(d.name||'').slice(0,100),age,weight,height,sex:d.sex,goal:d.goal,targetWeight:d.targetWeight!=null&&d.targetWeight!==''?number(d.targetWeight,35,250,'الوزن المستهدف'):null,goalPace:d.goalPace,activity:d.dailyActivity||'light',trainingDays:wp?.days.length||externalTrainingDays.length,workoutDays:wp?.days.map(x=>x.dayIndex)||externalTrainingDays,externalTrainingDays,diseases:declaredDiseases,maternalStatus:'none',ketoAcknowledged:d.dietType==='keto',fastingAcknowledged:d.dietType==='intermittent_fasting'};
 if(profile.targetWeight&&profile.goal==='lose'&&(profile.targetWeight>=weight||profile.targetWeight/(height/100)**2<18.5))throw Error('الوزن المستهدف لازم يكون أقل من الحالي وفوق حد النحافة.');
 const fixed=FIXED_DIET_MEALS[d.dietType];
 const excludedGroups=[...new Set([...clean(d.excludedGroups),...(declaredDiseases.includes('favism')?['fava']:[])])];
 const prefs={diet:d.dietType||'balanced',fasting:fixed?.fasting||'none',eatingStart:d.eatingStart||'12:00',region:d.region||'egypt',budget:d.budget||'medium',meals:fixed?.meals||integer(d.mealsCount??4,2,5,'الوجبات'),proteins:d.dietType==='vegan'?['legumes','nuts']:d.dietType==='vegetarian'?['legumes','eggs','dairy','nuts']:['legumes','eggs','dairy','chicken','fish','meat','nuts'],excludedKeys:[],excludedFoodIds:[],excludedGroups};
 profile.recomposition=profile.goal==='muscle_gain'&&profile.targetWeight===weight;
 validatePreferences(prefs,library);
 const plan=d.serviceTrack==='workouts_only'?null:makeWeek(profile,prefs,library,today(),seed);
 if(d.serviceTrack==='workouts_only'&&d.healthConfirmed!==true)throw Error('أكد مراجعة حالتك الصحية قبل إنشاء خطة تمرين مستقلة.');
 if(profile.targetWeight&&(profile.goal==='gain'&&profile.targetWeight<=weight||profile.goal==='muscle_gain'&&profile.targetWeight<weight))throw Error('الوزن المستهدف للزيادة لازم يكون أكبر من الحالي.');
 if(s.profile)s.history.push({at:isoNow(),kind:'profile',profile:s.profile,planId:s.active_plan_id,workoutPlanId:s.workoutPlan?.id});
 if(s.workoutPlan){s.workoutArchives||=[];s.workoutArchives.push(s.workoutPlan);}
 s.profile=profile;s.preferences=prefs;s.workoutPlan=wp;s.nutritionAdjustment=null;
 const workoutPrefs={weekdayConvention:'js_sunday_0',fitnessLevel:wp?d.fitnessLevel??'beginner':'beginner',selectedWorkoutDays:wp?.days.map(x=>x.dayIndex)||externalTrainingDays,workoutDaysCount:wp?.days.length||externalTrainingDays.length,workoutSplitPreference:wp?d.workoutSplitPreference??'auto':'auto',workoutLocation:wp?d.workoutLocation??'gym_only':'gym_only',dayLocations:wp?Object.fromEntries(wp.days.map(day=>[day.dayIndex,day.location])):{},homeEquipment:wp?stringList(d.homeEquipment??['none'],'المعدات',20):['none'],sessionDuration:wp?d.sessionDuration??45:45,injuries:declaredInjuries.length?declaredInjuries:['none'],healthConfirmed:d.healthConfirmed===true,externalTrainingDays};
 s.onboarding={serviceTrack:d.serviceTrack,workoutPrefs,isAuthenticated:true};ensureTrainingState(s);
 if(plan){plan.created_at=isoNow();plan.effective_from=today();s.plans.push(plan);s.active_plan_id=plan.id;}else s.active_plan_id=null;
 s.nutritionContextStartedOn=today();s.lastReview=null;s.sessionAdjustment=null;discardPending(s);return s;
}
export function review(s){
 if(needsScheduleConfirmation(s)){discardPending(s);s.lastReview={at:isoNow(),recovery:'unknown',nutrition:{action:'hold',reason:'كابتن التدريب ينتظر تأكيد أيام تمرينك في الأسبوع أولاً.'},volume:{action:'hold',reason:'أيام التمرين تحتاج تأكيدًا.'},workout:{completed:0,partial:0,missed:0},message:'نحتاج تأكيد أيام التمرين أولًا.'};return s;}
 if(needsHealthConfirmation(s)){discardPending(s);s.lastReview={at:isoNow(),recovery:'unknown',nutrition:{action:'hold',reason:'فريق المتابعة ينتظر تأكيد حالتك الصحية أولًا للاطمئنان عليك.'},volume:{action:'hold',reason:'نحتاج تأكيد الجاهزية الصحية.'},workout:{completed:0,partial:0,missed:0},message:'مراجعة الخطة تحتاج تأكيد الحالة الصحية.'};return s;}
 reconcileSessions(s);
 const ready=recovery(s.checkins,clockNow(),s.workoutLogs),plan=activePlan(s),proposals=[];
 if(workoutSafetyIssues(s).length){discardPending(s);s.lastReview={at:isoNow(),recovery:ready.status==='stop'?'stop':'hold',nutrition:{action:'hold',reason:'راجع التمارين المستبعدة في خطتك القديمة واستبدلها أو أعد إنشاء الخطة.'},message:ready.status==='stop'?ready.reasons.join(' '):'الخطة القديمة تحتوي حركات مستبعدة حسب إصابتك؛ لا تؤدّها. استبدلها أو راجع مختصًا.'};return s;}
 if(plan&&s.preferences?.diet==='dash'){
  try{for(const d of plan.days.filter(d=>d.date>=today()))assertDietDay(d.meals.map(m=>m.snapshot),'dash',d.targets||plan.targets);}
  catch(e){discardPending(s);s.lastReview={at:isoNow(),recovery:ready.status,nutrition:{action:'hold',reason:'لا يمكن اعتماد الصوديوم في الخطة القديمة؛ أعد إنشاء الخطة.'},message:e.message};return s;}
 }
 let nutrition={action:'hold',reason:plan?'أخصائي التغذية ينصح باستقرار النوم والاستشفاء أولاً قبل أي تعديل في سعراتك.':'مسارك الحالي للتمارين فقط بدون خطة أكل.'};
 if(['caution','high'].includes(ready.status)&&s.workoutPlan)proposals.push({kind:'recovery',setFactor:ready.setFactor,regions:Object.entries(ready.muscles).filter(([,m])=>m.status==='caution').map(([r])=>r),reason:`توصية من كابتن التدريب: لأن ${ready.reasons.join(' و')}، نقترح تخفيف جولة واحدة من تمرين النهاردة لحماية عضلاتك ومفاصلك.`,expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 const profileChange=s.history.filter(h=>h.kind==='profile').at(-1)?.at;
 const contextStart=s.nutritionContextStartedOn||(profileChange?localDate(Date.parse(profileChange)):null);
 const contextWeights=s.weights.filter(w=>!contextStart||w.date>=contextStart),contextFood=s.foodLogs.filter(d=>!contextStart||d.date>=contextStart);
 const targetWeights=contextWeights.filter(w=>w.date>=dateOffset(today(),-6)&&w.date<=today());
 const averageWeight=targetWeights.length?targetWeights.reduce((n,w)=>n+w.kg,0)/targetWeights.length:null;
 const reached=!s.profile.recomposition&&targetWeights.length>=3&&s.profile.targetWeight&&((s.profile.goal==='lose'&&averageWeight<=s.profile.targetWeight)||(['gain','muscle_gain'].includes(s.profile.goal)&&averageWeight>=s.profile.targetWeight));
 if(plan&&ready.status==='ready'&&reached){
  nutrition={action:'propose',reason:'مبروك يا بطل! 🎉 رسالة من فريق التغذية: متوسط وزنك وصل للهدف بنجاح؛ نقترح الانتقال لخطة تثبيت الوزن للحفاظ على النتيجة اللي حققتها.'};
  proposals.push({kind:'maintenance',averageWeight,...nutrition,expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 }
 else if(plan&&ready.status==='ready'&&(!s.lastVolumeChange||clockNow()-s.lastVolumeChange>=14*86400000)){
  nutrition=calorieReview(contextWeights,contextFood,s.profile.recomposition?'recomposition':s.profile.goal,Number(plan.targets.energy),clockNow(),s.lastCalorieChange||0);
  if(contextStart)nutrition.contextStartedOn=contextStart;
  if(nutrition.action==='propose'&&nutrition.delta<0&&hasPerformanceDrop(s.workoutLogs,clockNow()))nutrition={...nutrition,action:'hold',reason:'قرار مشترك من أخصائي التغذية وكابتن التدريب: رغم ثبات الوزن، لاحظنا انخفاضًا في أداء التمرين؛ لذلك ثبتنا السعرات لحماية الكتلة العضلية واستعادة طاقتك أولاً.'};
  if(nutrition.action==='propose'){
   try{validateEnergyChange(s,Number(plan.targets.energy)+nutrition.delta);retargetPlan(structuredClone(plan),Number(plan.targets.energy)+nutrition.delta,s.preferences,dateOffset(today(),1));proposals.push({kind:'calories',...nutrition,expiresAt:new Date(clockNow()+86400000).toISOString()});}
   catch(error){if(error instanceof TypeError||error instanceof ReferenceError)throw error;nutrition={...nutrition,action:'hold',reason:'أخصائي التغذية احتفظ بسعراتك الحالية لأن أي خصم إضافي هيكون أقل من الحد الصحي الآمن لجسمك.'};}
  }
 }
 const volume=volumeReview(s,ready);
 if(!proposals.length&&volume.action==='propose')proposals.push({...volume,expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 discardPending(s);
 for(const p of proposals)s.adaptations.push({...p,id:crypto.randomUUID(),baseRevision:s.revision+1,status:'pending',at:isoNow()});
 const sessions=s.sessions.filter(x=>x.date>=dateOffset(today(),-13));
 const workoutInsights=workoutProgressionSummary(s.workoutPlan,s.workoutLogs,clockNow());
 const wTarget=dailyWaterTarget(s,today());
 const recentWater=(s.waterLogs||[]).filter(x=>x.date>=dateOffset(today(),-13)&&x.date<=today());
 const avgCups=recentWater.length?Math.round(recentWater.reduce((sum,x)=>sum+Number(x.cups||0),0)/recentWater.length*10)/10:null;
 const hydrationReason=!recentWater.length
  ?`سجّل شرب المية يومياً (هدفك ${wTarget.targetCups} كوب ≈ ${wTarget.liters} لتر) علشان نتابع التسجيل مقارنة بهدف خطتك.`
  :avgCups<wTarget.targetCups*0.7
  ?`متوسط شربك للمية (${avgCups} من ${wTarget.targetCups} كوب) أقل من هدف اليوم الحالي؛ المقارنة تقريبية لأن الأهداف قد تختلف بين الأيام، والتسجيل مش قياسًا مباشرًا للجفاف.`
  :`متوسط المية المسجلة ${avgCups} كوب في ${recentWater.length} أيام مسجلة؛ ده ملخص التسجيل ومش تشخيصًا لترطيب الجسم.`;
 s.lastReview={at:isoNow(),recovery:ready.status,nutrition,volume,hydration:{avgCups,targetCups:wTarget.targetCups,targetLiters:wTarget.liters,loggedDays:recentWater.length,reason:hydrationReason},workoutInsights,workout:{partial:sessions.filter(x=>x.status==='partial').length,completed:sessions.filter(x=>x.status==='completed').length,missed:sessions.filter(x=>x.status==='missed').length},message:proposals.length?'فريق المتابعة جهّز لك توصية جديدة بانتظار موافقتك.':'مفيش تعديل جديد مقترح بناءً على البيانات المتاحة؛ راجع أسباب القرار وتغطية التسجيل أدناه.'};
 return s;
}
export function retargetPlan(plan,energy,prefs,effective){
 const factor=energy/Number(plan.targets.energy),previous=structuredClone(plan.targets);
 plan.targets.energy=energy;plan.targets.protein=previous.protein;
 const fatShare=Number(previous.fat)*9/Math.max(1,Number(previous.energy)-Number(previous.protein)*4);
 plan.targets.fat=Math.round(Math.max(0,(energy-plan.targets.protein*4)*fatShare)/9);
 plan.targets.carbs=Math.round(Math.max(0,energy-plan.targets.protein*4-plan.targets.fat*9)/4);
 for(const day of plan.days){
  day.targets||=structuredClone(previous);
  if(day.date<effective)continue;
  day.targets=structuredClone(plan.targets);
  for(const meal of day.meals){meal.id=crypto.randomUUID();meal.target_energy*=factor;meal.snapshot=scaleSnapshot(meal.snapshot,factor);}
  assertDietDay(day.meals.map(m=>m.snapshot),prefs.diet,plan.targets);
  day.summary=sumSnapshots(day.meals.map(m=>m.snapshot));if(nutritionQualityIssues(day.summary,day.targets).length)throw Error('التعديل لا يحقق حدود السعرات والبروتين؛ احتفظ بخطتك الحالية.');
 }
 plan.warnings=plan.days.flatMap(d=>{const messages=assessDay(d.summary,d.targets||plan.targets);return messages.length?[{date:d.date,messages}]:[];});
 return plan;
}
function validateEnergyChange(s,energy){if(energy<(s.profile.sex==='female'?1200:1400)||energy>4200)throw Error('التعديل يتجاوز حدود الخطة الآلية؛ راجع متخصصًا.');}
function adjustCalories(s,a){
 const previous=activePlan(s),energy=Number(previous.targets.energy)+a.delta;
 validateEnergyChange(s,energy);
 const effective=dateOffset(today(),1),plan=structuredClone(previous);
 plan.id='plan-'+crypto.randomUUID();plan.parent_id=previous.id;plan.created_at=isoNow();plan.effective_from=effective;plan.changeReason=a.reason;
 if(s.foodEntries.some(e=>e.date>=effective))throw Error('في تسجيل فعلي ليوم قادم؛ راجع التاريخ الأول.');
 retargetPlan(plan,energy,s.preferences,effective);
 s.plans.push(plan);s.active_plan_id=plan.id;s.lastCalorieChange=clockNow();s.nutritionAdjustment={energy,protein:plan.targets.protein,effectiveFrom:effective,reason:a.reason};
}
export function command(input,action,p){
 const s=normalize(input);
 if(action==='generate')return generate(s,p);
 if(!s.profile)throw Error('أكمل بياناتك أولًا.');
 if(action!=='review')s.lastReview=null;
 if(!['review','adaptation'].includes(action))discardPending(s);
 if(action==='confirm_schedule'){
  if(!needsScheduleConfirmation(s))throw Error('التقويم مؤكد بالفعل.');
  const map=plainRecord(p.dayMap,'توزيع أيام الجلسات'),before=s.workoutPlan;
  if(Object.keys(map).length!==before.days.length||before.days.some(d=>!Object.hasOwn(map,String(d.dayIndex)))||new Set(Object.values(map).map(v=>integer(v,0,6,'يوم الأسبوع'))).size!==before.days.length)throw Error('اختار يومًا مختلفًا لكل جلسة.');
  const next=structuredClone(before),reverse={};next.id=crypto.randomUUID();next.parent_id=before.id;next.version++;
  for(const day of next.days){const old=day.dayIndex;day.dayIndex=integer(map[old],0,6,'يوم الأسبوع');reverse[day.dayIndex]=old;}
  next.days.sort((a,b)=>a.dayIndex-b.dayIndex);forkWorkout(s,next,{oldDayIndexByNew:reverse,carryCalendar:false});
  s.history.push({kind:'schedule_basis_confirmation',at:isoNow(),previousId:before.id,nextId:next.id,dayMap:structuredClone(map),previousOverrides:(s.scheduleOverrides||[]).filter(o=>o.planId===before.id)});
  s.onboarding||={serviceTrack:s.active_plan_id?'nutrition_and_workouts':'workouts_only',workoutPrefs:{}};s.onboarding.workoutPrefs||={};s.profile.weekdayConvention='js_sunday_0';s.profile.workoutDays=next.days.map(d=>d.dayIndex);s.onboarding.workoutPrefs.weekdayConvention='js_sunday_0';s.onboarding.workoutPrefs.selectedWorkoutDays=s.profile.workoutDays;s.onboarding.workoutPrefs.dayLocations=Object.fromEntries(next.days.map(d=>[d.dayIndex,d.location]));
  const current=activePlan(s);if(current){const plan=structuredClone(current);plan.id='plan-'+crypto.randomUUID();plan.parent_id=current.id;plan.created_at=isoNow();plan.changeReason='تأكيد أيام التدريب بعد توحيد التقويم';plan.profile=structuredClone(s.profile);for(const day of plan.days)if(day.date>=today())day.is_workout_day=s.profile.workoutDays.includes(new Date(day.date+'T12:00:00Z').getUTCDay());s.plans.push(plan);s.active_plan_id=plan.id;}
  discardPending(s);return s;
 }
 if(action==='confirm_health'){if(!needsHealthConfirmation(s))throw Error('الجاهزية الصحية مؤكدة بالفعل.');if(p.healthy!==true||p.injuryFree!==true)throw Error('الخطة الآلية تحتاج تأكيد عدم وجود مرض أو إصابة تستدعي متخصصًا.');s.onboarding.workoutPrefs.healthConfirmed=true;s.onboarding.workoutPrefs.healthConfirmedAt=isoNow();discardPending(s);return s;}
 if(['food_entry','food_delete','food_complete','food_switch_to_entries'].includes(action))return foodCommand(s,action,p);
 if(action==='replace_meal')return replaceMeal(s,p);
 if(action==='renew_plan'){
  const current=activePlan(s);if(!current)throw Error('مسارك للتمرين فقط.');
  if(current.days.at(-1).date>=today())throw Error('الخطة الحالية لسه شغالة؛ الأسبوع الجديد يظهر بعد انتهائها.');
  const next=makeWeek(s.profile,s.preferences,library,today(),crypto.randomUUID());next.created_at=isoNow();next.parent_id=current.id;next.effective_from=today();
  if(s.nutritionAdjustment)retargetPlan(next,s.nutritionAdjustment.energy,s.preferences,today());
  s.plans.push(next);s.active_plan_id=next.id;
 }else if(action==='weight'){
  const date=dateForLog(p.date||today()),kg=number(p.kg,35,250,'الوزن');s.weights=s.weights.filter(x=>x.date!==date);s.weights.push({date,kg});
 }else if(action==='water'){
  const date=dateForLog(p.date||today()),target=dailyWaterTarget(s,date);
  const existing=(s.waterLogs||[]).find(x=>x.date===date);
  const cups=p.addCups!=null?Math.max(0,Math.min(30,(existing?.cups||0)+integer(p.addCups,-10,20,'تعديل الأكواب'))):integer(p.cups,0,30,'أكواب المية');
  s.waterLogs=(s.waterLogs||[]).filter(x=>x.date!==date);
  s.waterLogs.push({date,cups,liters:Math.round(cups*0.25*100)/100,targetCups:target.targetCups,targetLiters:target.liters,at:isoNow()});
 }else if(action==='food'){
  const date=dateForLog(p.date),plan=activePlan(s);if(s.foodEntries.some(e=>e.date===date))throw Error('اليوم فيه وجبات تفصيلية؛ استخدم إغلاق اليوم.');
  const energy=number(p.energy,0,10000,'السعرات الفعلية'),complete=boolean(p.complete,'اكتمال اليوم'),plannedEnergy=plannedEnergyForDate(s,date);
  s.foodLogs=s.foodLogs.filter(x=>x.date!==date);s.foodLogs.push({date,complete,adherence:plannedEnergy?Math.max(0,Math.round(100-Math.abs(energy-plannedEnergy)/plannedEnergy*100)):null,energy,plannedEnergy,planId:plan?.id,source:'daily_total',completionPolicy:1,confirmedAt:complete?isoNow():null});
 }else if(action==='recovery'){
  for(const key of ['pain','illness','redFlags'])if(typeof p[key]!=='boolean')throw Error('أجب على أسئلة الألم والمرض.');
  const sorenessByRegion={};for(const [key,v]of Object.entries(p.sorenessByRegion==null?{}:plainRecord(p.sorenessByRegion,'تقييم العضلات'))){if(!Object.hasOwn(MUSCLE_REGIONS,key))throw Error('منطقة عضلية غير صالحة.');sorenessByRegion[key]=number(v,0,10,'ألم العضلات');}
  const painRegions=p.painRegions||[];if(!Array.isArray(painRegions)||painRegions.some(r=>typeof r!=='string'||!Object.hasOwn(MUSCLE_REGIONS,r)))throw Error('مناطق الألم غير صالحة.');
  const c={at:isoNow(),date:today(),sleepHours:number(p.sleepHours,0,24,'ساعات النوم'),sleepQuality:integer(p.sleepQuality,1,5,'جودة النوم'),fatigue:integer(p.fatigue,1,5,'الإجهاد'),stress:p.stress==null||p.stress===''?null:integer(p.stress,1,5,'الضغط'),soreness:number(p.soreness??0,0,10,'ألم العضلات'),sorenessByRegion,painRegions,pain:p.pain||painRegions.length>0,illness:p.illness,redFlags:p.redFlags};
  s.checkins=s.checkins.filter(x=>x.date!==c.date);s.checkins.push(c);s.sessionAdjustment=null;for(const day of s.workoutPlan?.days||[])for(const exercise of day.exercises){delete exercise.suggestedKg;delete exercise.progressionReason;}
 }else if(action==='workout'){
  const dayIndex=integer(p.dayIndex,0,6,'يوم التمرين'),day=s.workoutPlan?.days.find(d=>d.dayIndex===dayIndex),exercise=day?.exercises.find(x=>x.id===p.exerciseId);if(!exercise)throw Error('التمرين غير موجود في يومك المحدد.');
  if(!Array.isArray(p.sets)||p.sets.length<1||p.sets.length>10)throw Error('سجل المجموعات الفعلية.');
  const date=dateForLog(p.date||today());const sets=p.sets.map(x=>({kg:number(x.kg,0,500,'الوزن'),reps:number(x.reps,1,100,'التكرارات'),rir:x.rir==null?null:number(x.rir,0,10,'التكرارات المتبقية'),pain:boolean(x.pain,'الألم أثناء المجموعة',false)}));
  if(sets.some(x=>!Number.isInteger(x.reps)))throw Error('التكرارات لازم تكون أعداد صحيحة.');
  const existing=s.workoutLogs.find(l=>l.date===date&&l.exerciseId===exercise.id&&l.dayIndex===(day?.dayIndex??null)&&l.planId===s.workoutPlan.id);
  const entry={id:existing?.id||crypto.randomUUID(),at:isoNow(),date,exerciseId:exercise.id,dayIndex:day?.dayIndex??null,planId:s.workoutPlan.id,loadMode:exercise.loadMode,progressionKey:exercise.progressionKey,laterality:exercise.laterality,bothSides:boolean(p.bothSides,'إكمال الجانبين',false),sets,increment:p.increment==null||p.increment===''?null:number(p.increment,.1,20,'زيادة الوزن')};
  if(existing)s.workoutLogs=s.workoutLogs.filter(l=>l.id!==existing.id);s.workoutLogs.push(entry);
  if(p.autoSession===true){
   const autoSess={id:crypto.randomUUID(),date,dayIndex,planId:s.workoutPlan.id,programId:s.workoutPlan.programId,status:'completed',expectedExercises:expectedExercises(s,day,date)};
   Object.assign(autoSess,sessionCompletion(s,autoSess));
   autoSess.status=autoSess.completionRatio>=.8?'completed':'partial';
   autoSess.duration=day.estimatedMinutes||day.duration||45;
   autoSess.rpe=7.5;
   s.sessions=s.sessions.filter(x=>!(x.date===date&&x.dayIndex===dayIndex&&x.planId===s.workoutPlan.id));
   s.sessions.push(autoSess);
  }
  reconcileSessions(s);
  if(workoutSafetyIssues(s).length){delete exercise.suggestedKg;delete exercise.progressionReason;return s;}
  const ready=recovery(s.checkins,clockNow(),s.workoutLogs);const localBlocked=muscleRegions(exercise).some(r=>['caution','hold'].includes(ready.muscles[r]?.status));
  const next=progression({...exercise,planId:s.workoutPlan.id},s.workoutLogs,{...ready,progressionAllowed:ready.progressionAllowed&&!needsHealthConfirmation(s)&&!needsScheduleConfirmation(s)&&!localBlocked&&date===today()});
  delete exercise.suggestedKg;delete exercise.progressionReason;
  if(next.action==='increase'){exercise.suggestedKg=next.kg;exercise.progressionReason=next.reason;exercise.suggestionAt=isoNow();}
 }else if(action==='session'){
  const dayIndex=integer(p.dayIndex,0,6,'يوم التمرين'),date=dateForLog(p.date||today()),day=s.workoutPlan?.days.find(d=>d.dayIndex===dayIndex);
  if(!day||!['completed','partial','missed'].includes(p.status))throw Error('جلسة غير صالحة.');
  const session={id:crypto.randomUUID(),date,dayIndex,planId:s.workoutPlan.id,programId:s.workoutPlan.programId,status:p.status,expectedExercises:expectedExercises(s,day,date)};
  Object.assign(session,sessionCompletion(s,session));
  if(p.status!=='missed'&&!session.actualSets)throw Error('سجّل مجموعات تمرين واحد على الأقل قبل إنهاء الجلسة.');
  if(session.actualSets&&session.completionRatio<.8)session.status='partial';
  if(session.actualSets){session.duration=number(p.duration,1,240,'مدة الجلسة');session.rpe=number(p.rpe,0,10,'مجهود الجلسة');}
  else{session.duration=null;session.rpe=null;}
  s.sessions=s.sessions.filter(x=>!(x.date===date&&x.dayIndex===dayIndex&&x.planId===s.workoutPlan.id));s.sessions.push(session);
 }else if(action==='replace_exercise'){
  const alternatives=exerciseAlternatives(s,p.dayIndex,p.exerciseId),choice=alternatives.find(e=>e.id===p.alternativeId);if(!choice)throw Error('البديل مش مناسب لنفس الحركة أو المعدات.');
  const previous=s.workoutPlan,next=structuredClone(previous);next.id=crypto.randomUUID();next.parent_id=previous.id;next.version++;
  const day=next.days.find(d=>d.dayIndex===Number(p.dayIndex));const i=day.exercises.findIndex(e=>e.id===p.exerciseId),old=day.exercises[i];
  day.exercises[i]={...choice,regions:muscleRegions(choice),sets:old.sets,repMin:old.repMin,repMax:old.repMax,rir:old.rir,restSeconds:old.restSeconds};
  day.estimatedMinutes=estimatedSessionMinutes(day);
  s.history.push({at:isoNow(),kind:'workout_replacement',previousId:previous.id,nextId:next.id,exerciseId:old.id,alternativeId:choice.id});next.weeklySets=weeklySetTotals(next.days);forkWorkout(s,next);discardPending(s);
 }else if(action==='reschedule'){
  const date=p.toDate;if(!validDate(date)||date<today()||date>dateOffset(today(),13))throw Error('اختار يوم خلال الأسبوعين الجايين.');
  const dayIndex=integer(p.dayIndex,0,6,'يوم التمرين');if(!s.workoutPlan?.days.some(d=>d.dayIndex===dayIndex))throw Error('اليوم غير موجود في خطتك.');
  const existing=scheduledSessions(s).find(x=>x.date===date);if(existing||s.sessions.some(x=>x.date===date&&x.status==='completed'))throw Error('في جلسة تانية في نفس اليوم؛ اختار يوم راحة.');
  const currentOccurrence=scheduledSessions(s).find(x=>x.dayIndex===dayIndex);const priorOverride=(s.scheduleOverrides||[]).find(o=>o.planId===s.workoutPlan.id&&o.dayIndex===dayIndex&&o.toDate===currentOccurrence?.date);const fromDate=priorOverride?.fromDate||currentOccurrence?.date;if(!fromDate||fromDate===date)throw Error('اختار موعد مختلف عن موعد الجلسة الحالي.');
  discardPending(s);s.adaptations.push({id:crypto.randomUUID(),kind:'schedule',dayIndex,fromDate,toDate:date,status:'pending',baseRevision:s.revision+1,at:isoNow(),expiresAt:new Date(clockNow()+86400000).toISOString(),reason:'تأكيد نقل موعد تمرينك إلى يوم '+date+' مع الحفاظ على سعراتك اليومية.'});
 }else if(action==='review')return review(s);
 else if(action==='adaptation'){
  const a=s.adaptations.find(x=>x.id===p.id&&x.status==='pending');if(!a)throw Error('الاقتراح غير موجود.');
  if(p.accept===false){a.status='rejected';return s;}if(p.accept!==true)throw Error('حدد موافقتك على الاقتراح.');
  if(a.baseRevision!==s.revision)throw Object.assign(Error('بياناتك اتغيرت؛ اطلب مراجعة جديدة.'),{status:409});
  if(a.expiresAt&&Date.parse(a.expiresAt)<clockNow())throw Error('الاقتراح انتهت صلاحيته؛ اطلب مراجعة جديدة.');
  if((needsHealthConfirmation(s)||needsScheduleConfirmation(s))&&a.kind!=='schedule')throw Error('أكد الجاهزية الصحية واطلب مراجعة جديدة.');
  if(workoutSafetyIssues(s).length)throw Error('راجع التمارين المستبعدة في الخطة قبل قبول تعديلات.');
  const currentRecovery=recovery(s.checkins,clockNow(),s.workoutLogs);
  if(a.kind==='recovery'&&!['caution','high'].includes(currentRecovery.status))throw Error('بيانات الاستشفاء اتغيرت أو انتهت؛ اطلب مراجعة جديدة.');
  if(['weekly_volume','calories','maintenance'].includes(a.kind)&&currentRecovery.status!=='ready')throw Error('نحتاج متابعة استشفاء حديثة ومناسبة؛ اطلب مراجعة جديدة.');
  if(a.kind==='weekly_volume'){
   const valid=volumeReview(s,currentRecovery);if(valid.action!=='propose'||valid.exerciseId!==a.exerciseId||valid.dayIndex!==a.dayIndex)throw Error('بيانات الاستشفاء أو الأداء لم تعد تؤيد الزيادة؛ اطلب مراجعة جديدة.');
  }
  if(a.kind==='recovery')s.sessionAdjustment={planId:s.workoutPlan?.id,setFactor:a.setFactor,regions:a.regions,expiresAt:a.expiresAt,reason:a.reason};
  else if(a.kind==='calories')adjustCalories(s,a);
  else if(a.kind==='maintenance'){
   const before=activePlan(s),profile={...s.profile,weight:Math.round(a.averageWeight*10)/10,goal:'maintain',targetWeight:null};
   const start=dateOffset(today(),1),plan=makeWeek(profile,s.preferences,library,start,crypto.randomUUID());
   const currentDay=before.days.find(d=>d.date===today());if(currentDay)plan.days.unshift(structuredClone(currentDay));
   plan.created_at=isoNow();plan.parent_id=before.id;plan.effective_from=start;plan.changeReason=a.reason;
   s.history.push({kind:'goal_maintenance',at:isoNow(),profile:s.profile,planId:before.id});
   s.profile=profile;s.plans.push(plan);s.active_plan_id=plan.id;s.nutritionContextStartedOn=start;s.lastCalorieChange=clockNow();s.nutritionAdjustment={energy:plan.targets.energy,protein:plan.targets.protein,effectiveFrom:start,reason:a.reason};
  }
  else if(a.kind==='weekly_volume'){
   if(s.workoutPlan.id!==a.planId)throw Object.assign(Error('خطة التمرين اتغيرت؛ اطلب مراجعة جديدة.'),{status:409});
   const before=s.workoutPlan,next=structuredClone(before);next.id=crypto.randomUUID();next.parent_id=previousId(before);next.version++;
   function previousId(w){return w.id;}
   const exercise=next.days.find(d=>d.dayIndex===a.dayIndex)?.exercises.find(e=>e.id===a.exerciseId);
   if(!exercise)throw Error('التمرين غير موجود.');exercise.sets+=a.extraSets;
   next.weeklySets=weeklySetTotals(next.days);
   s.history.push({kind:'weekly_volume',at:isoNow(),previousId:before.id,nextId:next.id,reason:a.reason});
   next.days.find(d=>d.dayIndex===a.dayIndex).estimatedMinutes=estimatedSessionMinutes(next.days.find(d=>d.dayIndex===a.dayIndex));forkWorkout(s,next);s.lastVolumeChange=clockNow();
  }
  else if(a.kind==='schedule'){if(a.fromDate<today()||a.toDate<today())throw Error('موعد الجلسة فات؛ اطلب نقلًا جديدًا.');s.scheduleOverrides||=[];s.scheduleOverrides=s.scheduleOverrides.filter(x=>x.dayIndex!==a.dayIndex);s.scheduleOverrides.push({dayIndex:a.dayIndex,fromDate:a.fromDate,toDate:a.toDate,planId:s.workoutPlan.id});}
  a.status='accepted';a.acceptedAt=isoNow();
 }else throw Error('عملية غير معروفة');
 return s;
}
export function evaluateEligibility(d={}){
 const reasons=[],questions=[];
 const ageNum=Number(d.age),weightNum=Number(d.weight),heightNum=Number(d.height);
 if(d.age==null||!Number.isInteger(ageNum)||ageNum<18){reasons.push({code:'AGE_UNSUPPORTED_OR_MISSING',severity:'requires_review',message:'التخطيط الآلي متاح للبالغين من 18 إلى 70 سنة فقط.'});}
 else if(ageNum>70){reasons.push({code:'SENIOR_REQUIRES_REVIEW',severity:'requires_review',message:'العمر فوق 70 سنة يحتاج تقييمًا فرديًا من متخصص.'});}
 const diseases=Array.isArray(d.diseases)?d.diseases.filter(x=>x&&x!=='none'):[];
 const injuries=Array.isArray(d.injuries)?d.injuries.filter(x=>x&&x!=='none'):[];
 const maternal=d.maternalStatus&&d.maternalStatus!=='none'?d.maternalStatus:null;
 const unsupportedDiseases=diseases.filter(x=>!SUPPORTED_WELLNESS_CONDITIONS.has(x));
 const unsupportedInjuries=injuries.filter(x=>!SUPPORTED_MILD_INJURIES.has(x));
 if(unsupportedDiseases.length||unsupportedInjuries.length||maternal){
  reasons.push({code:'CLINICAL_OR_INJURY_REQUIRES_REVIEW',severity:'requires_review',message:'الحالة الصحية أو الإصابة الحادة أو الحمل/الرضاعة تحتاج مراجعة متخصص مباشر قبل إصدار خطة.'});
 }
 if(Number.isFinite(weightNum)&&Number.isFinite(heightNum)&&heightNum>=120&&heightNum<=230){
  const bmi=weightNum/((heightNum/100)**2);
  if(bmi<12.5||bmi>65)reasons.push({code:'BMI_OUT_OF_RANGE',severity:'requires_review',message:'الوزن والطول خارج النطاق الفسيولوجي للتخطيط الآلي.'});
  else if(bmi<18.5&&d.goal==='lose')reasons.push({code:'UNDERWEIGHT_LOSS_FORBIDDEN',severity:'requires_review',message:'هدف إنقاص الوزن غير آمن مع مؤشر كتلة جسم أقل من 18.5.'});
 }
 if(d.serviceTrack==='workouts_only'&&d.healthConfirmed!==true){
  questions.push({code:'CONFIRM_WORKOUT_HEALTH',field:'healthConfirmed',prompt:'أكد عدم وجود حالة صحية أو إصابة حالية تحتاج خطة متخصص.'});
 }
 if(d.serviceTrack==='nutrition_only'&&d.goal==='muscle_gain'&&(!Array.isArray(d.externalTrainingDays)||!d.externalTrainingDays.length)){
  questions.push({code:'CONFIRM_EXTERNAL_TRAINING_DAYS',field:'externalTrainingDays',prompt:'حدد أيام تمارين المقاومة التي تؤديها خارج التطبيق لهدف بناء العضلات.'});
 }
 const status=reasons.length?'requires_review':questions.length?'needs_input':'eligible';
 return {
  status,
  reasons,
  questions,
  supportedAdaptations:{
   diseases:diseases.filter(x=>SUPPORTED_WELLNESS_CONDITIONS.has(x)),
   injuries:injuries.filter(x=>SUPPORTED_MILD_INJURIES.has(x))
  },
  permittedFunctions:status==='requires_review'?['browse_food_catalog','browse_exercise_catalog','export_clinical_summary']:['generate_plan','log_execution','adaptive_review'],
  clinicalSummary:status==='requires_review'?{generatedAt:isoNow(),age:Number.isFinite(ageNum)?ageNum:null,weightKg:Number.isFinite(weightNum)?weightNum:null,heightCm:Number.isFinite(heightNum)?heightNum:null,declaredDiseases:diseases,declaredInjuries:injuries,maternalStatus:maternal||'none',note:'ملخص قابل للمشاركة مع طبيب أو أخصائي تغذية/علاج طبيعي.'}:null
 };
}
export function progressSummary(s){
 const end=today(),start14=dateOffset(end,-13),mid7=dateOffset(end,-6);
 const w14=[...new Map((s.weights||[]).filter(x=>x.date>=start14&&x.date<=end).map(x=>[x.date,x])).values()];
 const prev7=w14.filter(x=>x.date<mid7),curr7=w14.filter(x=>x.date>=mid7);
 const avg=arr=>arr.length?Math.round(arr.reduce((sum,x)=>sum+x.kg,0)/arr.length*100)/100:null;
 const prevAvg=avg(prev7),currAvg=avg(curr7);
 const weeklyChangePct=prevAvg&&currAvg?Math.round((currAvg-prevAvg)/prevAvg*10000)/100:null;
 const completeFood14=[...new Map((s.foodLogs||[]).filter(x=>x.complete&&x.energy>0&&x.date>=start14&&x.date<=end).map(x=>[x.date,x])).values()].length;
 const sessions14=(s.sessions||[]).filter(x=>x.date>=start14&&x.date<=end);
 const perfDrop=hasPerformanceDrop(s.workoutLogs||[],clockNow());
 const workoutInsights=workoutProgressionSummary(s.workoutPlan,s.workoutLogs||[],clockNow());
 const wTarget=dailyWaterTarget(s,end);
 const water14=(s.waterLogs||[]).filter(x=>x.date>=start14&&x.date<=end);
 const todayWater=(s.waterLogs||[]).find(x=>x.date===end);
 return {
  windowStart:start14,
  windowEnd:end,
  weightTrend:{measurements14d:w14.length,previous7dCount:prev7.length,current7dCount:curr7.length,previous7dAvgKg:prevAvg,current7dAvgKg:currAvg,weeklyChangePct,note:'فريق التغذية بيعتمد على متوسط الأسبوعين مش تذبذب الميزان اليومي.'},
  foodCompleteness:{completeDays14d:completeFood14,requiredDays14d:10,sufficientForCalorieReview:completeFood14>=10&&prev7.length>=3&&curr7.length>=3},
  hydration:{todayCups:todayWater?.cups||0,targetCups:wTarget.targetCups,todayLiters:Math.round((todayWater?.cups||0)*0.25*100)/100,targetLiters:wTarget.liters,isWorkoutDay:wTarget.isWorkoutDay,loggedDays14d:water14.length,adherentDays14d:water14.filter(x=>x.cups>=Math.ceil((x.targetCups||wTarget.targetCups)*0.8)).length},
  hydrationSummary:{todayCups:todayWater?.cups||0,targetCups:wTarget.targetCups,todayLiters:Math.round((todayWater?.cups||0)*0.25*100)/100,targetLiters:wTarget.liters,isWorkoutDay:wTarget.isWorkoutDay,loggedDays14d:water14.length,adherentDays14d:water14.filter(x=>x.cups>=Math.ceil((x.targetCups||wTarget.targetCups)*0.8)).length},
  workoutSummary:{completed14d:sessions14.filter(x=>x.status==='completed').length,partial14d:sessions14.filter(x=>x.status==='partial').length,missed14d:sessions14.filter(x=>x.status==='missed').length,performanceDrop:perfDrop,insights:workoutInsights}
 };
}
