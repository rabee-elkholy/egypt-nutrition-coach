import {clockNow,isoNow,clockDate} from './clock.mjs';
import {makeWeek,scaleSnapshot,sumSnapshots,assessDay,validatePreferences,nutritionQualityIssues} from '../planner-core.mjs';
import {FIXED_DIET_MEALS,assertDietDay} from '../diet-patterns.mjs';
import {workoutPlan,exerciseAlternatives,muscleRegions,weeklySetTotals,scheduledSessions,estimatedSessionMinutes,eachSide} from './workouts.mjs';
import {recovery,calorieReview,progression} from './recovery.mjs';
import {library,activePlan,foodCommand,replaceMeal,plannedEnergyForDate} from './food.mjs';
import {ensureTrainingState,forkWorkout,expectedExercises,sessionCompletion,reconcileSessions} from './training-state.mjs';
import {volumeReview} from './training-review.mjs';
import {localDate,dateOffset,dateForLog as validateLogDate,validDate,number,integer,boolean,stringList,plainRecord,MUSCLE_REGIONS,needsHealthConfirmation,needsScheduleConfirmation,normalizeWeekdayDraft} from '../coaching-shared.mjs';
const dateForLog=date=>validateLogDate(date,clockNow());
export {number};export const today=clockDate;
export const empty=()=>({schemaVersion:3,revision:0,profile:null,preferences:null,onboarding:null,plans:[],planRefs:[],workoutPlan:null,foodLogs:[],foodEntries:[],weights:[],workoutLogs:[],sessions:[],checkins:[],adaptations:[],history:[]});
const clean=a=>a==null?[]:stringList(a,'قائمة الاختيارات').filter(x=>x!=='none');
export function normalize(s){for(const key of ['workoutPlanRefs','planRefs','foodEntries','sessions','foodLogs','weights','workoutLogs','checkins','adaptations','history'])s[key]||=[];s.schemaVersion=3;ensureTrainingState(s);reconcileSessions(s);return s;}
function discardPending(s){for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';}
export function generate(s,d,seed=crypto.randomUUID()){
 d=normalizeWeekdayDraft(d);
 const age=integer(d.age,18,70,'العمر'),weight=number(d.weight,35,250,'الوزن'),height=number(d.height,120,230,'الطول');
 if(!['male','female'].includes(d.sex))throw Error('حدد الجنس لحساب الاحتياجات.');
 if(age>70||clean(d.diseases).length||clean(d.injuries).length||(d.maternalStatus&&d.maternalStatus!=='none'))throw Error('الحالة تحتاج مراجعة متخصص قبل إنشاء خطة آلية. النسخة الحالية للبالغين الأصحاء بدون إصابة.');
 if(!['lose','maintain','gain','muscle_gain'].includes(d.goal))throw Error('هدف غير صالح');
 if(!['nutrition_only','workouts_only','nutrition_and_workouts'].includes(d.serviceTrack))throw Error('مسار غير صالح');
 const bmi=weight/((height/100)**2);if(bmi<12.5||bmi>65)throw Error('الوزن والطول خارج نطاق التخطيط الآلي؛ راجع القياسات أو متخصصًا.');if(bmi<18.5&&d.goal==='lose')throw Error('تقليل الوزن غير مناسب مع مؤشر كتلة الجسم الحالي.');
 if(d.diseases!=null&&!Array.isArray(d.diseases)||d.injuries!=null&&!Array.isArray(d.injuries))throw Error('بيانات الحالة الصحية غير صالحة.');
 const wp=d.serviceTrack==='nutrition_only'?null:workoutPlan(d);
 const externalTrainingDays=d.externalTrainingDays==null?[]:(Array.isArray(d.externalTrainingDays)&&d.externalTrainingDays.length<=6?[...new Set(d.externalTrainingDays.map(v=>integer(v,0,6,'يوم تمرينك خارج التطبيق')))]:(()=>{throw Error('أيام التمرين خارج التطبيق غير صالحة.');})());
 if(d.serviceTrack==='nutrition_only'&&d.goal==='muscle_gain'&&!externalTrainingDays.length)throw Error('هدف زيادة العضلات يحتاج أيام مقاومة مؤكدة، حتى لو خطتك هنا للأكل فقط.');
 const profile={weekdayConvention:'js_sunday_0',name:String(d.name||'').slice(0,100),age,weight,height,sex:d.sex,goal:d.goal,targetWeight:d.targetWeight!=null&&d.targetWeight!==''?number(d.targetWeight,35,250,'الوزن المستهدف'):null,goalPace:d.goalPace,activity:d.dailyActivity||'light',trainingDays:wp?.days.length||externalTrainingDays.length,workoutDays:wp?.days.map(x=>x.dayIndex)||externalTrainingDays,externalTrainingDays,diseases:[],maternalStatus:'none',ketoAcknowledged:d.dietType==='keto',fastingAcknowledged:d.dietType==='intermittent_fasting'};
 if(profile.targetWeight&&profile.goal==='lose'&&(profile.targetWeight>=weight||profile.targetWeight/(height/100)**2<18.5))throw Error('الوزن المستهدف لازم يكون أقل من الحالي وفوق حد النحافة.');
 const fixed=FIXED_DIET_MEALS[d.dietType];
 const prefs={diet:d.dietType||'balanced',fasting:fixed?.fasting||'none',eatingStart:d.eatingStart||'12:00',region:d.region||'egypt',budget:d.budget||'medium',meals:fixed?.meals||integer(d.mealsCount??4,2,5,'الوجبات'),proteins:d.dietType==='vegan'?['legumes','nuts']:d.dietType==='vegetarian'?['legumes','eggs','dairy','nuts']:['legumes','eggs','dairy','chicken','fish','meat','nuts'],excludedKeys:[],excludedFoodIds:[],excludedGroups:clean(d.excludedGroups)};
 profile.recomposition=profile.goal==='muscle_gain'&&profile.targetWeight===weight;
 validatePreferences(prefs,library);
 const plan=d.serviceTrack==='workouts_only'?null:makeWeek(profile,prefs,library,today(),seed);
 if(d.serviceTrack==='workouts_only'&&d.healthConfirmed!==true)throw Error('أكد مراجعة حالتك الصحية قبل إنشاء خطة تمرين مستقلة.');
 if(profile.targetWeight&&(profile.goal==='gain'&&profile.targetWeight<=weight||profile.goal==='muscle_gain'&&profile.targetWeight<weight))throw Error('الوزن المستهدف للزيادة لازم يكون أكبر من الحالي.');
 if(s.profile)s.history.push({at:isoNow(),kind:'profile',profile:s.profile,planId:s.active_plan_id,workoutPlanId:s.workoutPlan?.id});
 if(s.workoutPlan){s.workoutArchives||=[];s.workoutArchives.push(s.workoutPlan);}
 s.profile=profile;s.preferences=prefs;s.workoutPlan=wp;s.nutritionAdjustment=null;
 const workoutPrefs={weekdayConvention:'js_sunday_0',fitnessLevel:wp?d.fitnessLevel??'beginner':'beginner',selectedWorkoutDays:wp?.days.map(x=>x.dayIndex)||externalTrainingDays,workoutDaysCount:wp?.days.length||externalTrainingDays.length,workoutSplitPreference:wp?d.workoutSplitPreference??'auto':'auto',workoutLocation:wp?d.workoutLocation??'gym_only':'gym_only',dayLocations:wp?Object.fromEntries(wp.days.map(day=>[day.dayIndex,day.location])):{},homeEquipment:wp?stringList(d.homeEquipment??['none'],'المعدات',20):['none'],sessionDuration:wp?d.sessionDuration??45:45,injuries:['none'],healthConfirmed:d.healthConfirmed===true,externalTrainingDays};
 s.onboarding={serviceTrack:d.serviceTrack,workoutPrefs,isAuthenticated:true};ensureTrainingState(s);
 if(plan){plan.created_at=isoNow();plan.effective_from=today();s.plans.push(plan);s.active_plan_id=plan.id;}else s.active_plan_id=null;
 s.nutritionContextStartedOn=today();s.lastReview=null;s.sessionAdjustment=null;discardPending(s);return s;
}
export function review(s){
 if(needsScheduleConfirmation(s)){discardPending(s);s.lastReview={at:isoNow(),recovery:'unknown',nutrition:{action:'hold',reason:'أكد أيام التمرين المحفوظة بعد توحيد ترقيم التقويم.'},volume:{action:'hold',reason:'أيام التمرين تحتاج تأكيدًا.'},workout:{completed:0,partial:0,missed:0},message:'نحتاج تأكيد أيام التمرين أولًا.'};return s;}
 if(needsHealthConfirmation(s)){discardPending(s);s.lastReview={at:isoNow(),recovery:'unknown',nutrition:{action:'hold',reason:'أكد حالتك الصحية أولًا؛ مسار التمرين فقط لم يسأل عنها في الأسئلة الأصلية.'},volume:{action:'hold',reason:'نحتاج تأكيد الجاهزية الصحية.'},workout:{completed:0,partial:0,missed:0},message:'مراجعة الخطة تحتاج تأكيد الحالة الصحية.'};return s;}
 reconcileSessions(s);
 const ready=recovery(s.checkins,clockNow(),s.workoutLogs),plan=activePlan(s),proposals=[];
 let nutrition={action:'hold',reason:plan?'نحتاج استشفاء مستقر قبل تعديل السعرات.':'مسارك لا يحتوي على خطة أكل.'};
 if(['caution','high'].includes(ready.status)&&s.workoutPlan)proposals.push({kind:'recovery',setFactor:ready.setFactor,regions:Object.entries(ready.muscles).filter(([,m])=>m.status==='caution').map(([r])=>r),reason:ready.reasons.join('؛ '),expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 const profileChange=s.history.filter(h=>h.kind==='profile').at(-1)?.at;
 const contextStart=s.nutritionContextStartedOn||(profileChange?localDate(Date.parse(profileChange)):null);
 const contextWeights=s.weights.filter(w=>!contextStart||w.date>=contextStart),contextFood=s.foodLogs.filter(d=>!contextStart||d.date>=contextStart);
 const targetWeights=contextWeights.filter(w=>w.date>=dateOffset(today(),-6)&&w.date<=today());
 const averageWeight=targetWeights.length?targetWeights.reduce((n,w)=>n+w.kg,0)/targetWeights.length:null;
 const reached=!s.profile.recomposition&&targetWeights.length>=3&&s.profile.targetWeight&&((s.profile.goal==='lose'&&averageWeight<=s.profile.targetWeight)||(['gain','muscle_gain'].includes(s.profile.goal)&&averageWeight>=s.profile.targetWeight));
 if(plan&&ready.status==='ready'&&reached){
  nutrition={action:'propose',reason:'متوسط 3 أوزان على الأقل وصل للهدف؛ نقترح الانتقال للحفاظ على الوزن بدل الاستمرار في العجز أو الفائض.'};
  proposals.push({kind:'maintenance',averageWeight,...nutrition,expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 }
 else if(plan&&ready.status==='ready'&&(!s.lastVolumeChange||clockNow()-s.lastVolumeChange>=14*86400000)){
  nutrition=calorieReview(contextWeights,contextFood,s.profile.recomposition?'recomposition':s.profile.goal,Number(plan.targets.energy),clockNow(),s.lastCalorieChange||0);
  if(contextStart)nutrition.contextStartedOn=contextStart;
  if(nutrition.action==='propose'){
   try{validateEnergyChange(s,Number(plan.targets.energy)+nutrition.delta);retargetPlan(structuredClone(plan),Number(plan.targets.energy)+nutrition.delta,s.preferences,dateOffset(today(),1));proposals.push({kind:'calories',...nutrition,expiresAt:new Date(clockNow()+86400000).toISOString()});}
   catch(error){if(error instanceof TypeError||error instanceof ReferenceError)throw error;nutrition={...nutrition,action:'hold',reason:'التعديل لا يحقق حدود السعرات أو قيود النظام الحالي؛ احتفظنا بالخطة بدل اقتراح تغيير غير قابل للتطبيق.'};}
  }
 }
 const volume=volumeReview(s,ready);
 if(!proposals.length&&volume.action==='propose')proposals.push({...volume,expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 discardPending(s);
 for(const p of proposals)s.adaptations.push({...p,id:crypto.randomUUID(),baseRevision:s.revision+1,status:'pending',at:isoNow()});
 const sessions=s.sessions.filter(x=>x.date>=dateOffset(today(),-13));
 s.lastReview={at:isoNow(),recovery:ready.status,nutrition,volume,workout:{partial:sessions.filter(x=>x.status==='partial').length,completed:sessions.filter(x=>x.status==='completed').length,missed:sessions.filter(x=>x.status==='missed').length},message:proposals.length?'في اقتراح جاهز للمراجعة.':'احتفظنا بخطتك؛ التفاصيل بتوضح البيانات المطلوبة أو سبب عدم التعديل.'};
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
 }else if(action==='food'){
  const date=dateForLog(p.date),plan=activePlan(s);if(s.foodEntries.some(e=>e.date===date))throw Error('اليوم فيه وجبات تفصيلية؛ استخدم إغلاق اليوم.');
  const energy=number(p.energy,0,10000,'السعرات الفعلية'),complete=boolean(p.complete,'اكتمال اليوم'),plannedEnergy=plannedEnergyForDate(s,date);
  s.foodLogs=s.foodLogs.filter(x=>x.date!==date);s.foodLogs.push({date,complete,adherence:plannedEnergy?Math.max(0,Math.round(100-Math.abs(energy-plannedEnergy)/plannedEnergy*100)):null,energy,plannedEnergy,planId:plan?.id,source:'daily_total'});
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
  if(existing)s.workoutLogs=s.workoutLogs.filter(l=>l.id!==existing.id);s.workoutLogs.push(entry);reconcileSessions(s);
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
  discardPending(s);s.adaptations.push({id:crypto.randomUUID(),kind:'schedule',dayIndex,fromDate,toDate:date,status:'pending',baseRevision:s.revision+1,at:isoNow(),expiresAt:new Date(clockNow()+86400000).toISOString(),reason:'نقل جلسة '+dayIndex+' إلى '+date+' باختيارك، بدون تقليل سعرات الأكل.'});
 }else if(action==='review')return review(s);
 else if(action==='adaptation'){
  const a=s.adaptations.find(x=>x.id===p.id&&x.status==='pending');if(!a)throw Error('الاقتراح غير موجود.');
  if(p.accept===false){a.status='rejected';return s;}if(p.accept!==true)throw Error('حدد موافقتك على الاقتراح.');
  if(a.baseRevision!==s.revision)throw Object.assign(Error('بياناتك اتغيرت؛ اطلب مراجعة جديدة.'),{status:409});
  if(a.expiresAt&&Date.parse(a.expiresAt)<clockNow())throw Error('الاقتراح انتهت صلاحيته؛ اطلب مراجعة جديدة.');
  if((needsHealthConfirmation(s)||needsScheduleConfirmation(s))&&a.kind!=='schedule')throw Error('أكد الجاهزية الصحية واطلب مراجعة جديدة.');
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
   const before=s.workoutPlan,next=structuredClone(before);next.id=crypto.randomUUID();next.parent_id=before.id;next.version++;
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
