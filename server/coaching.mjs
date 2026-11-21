/** @typedef {import('../types/coaching').AccountSnapshot} AccountSnapshot */
/** @typedef {import('../types/coaching').Adaptation} Adaptation */
import {settingsActions,applySettingsCommand} from './coaching-settings.mjs';
import {handleCoachingCommand,currentFeedback} from '../coaching-journey.mjs';
import {usesKg} from '../exercise-load.mjs';
import {clockNow,isoNow,clockDate,clockTimeZone} from './clock.mjs';
import {makeWeek,scaleSnapshot,sumSnapshots,assessDay,validatePreferences,nutritionQualityIssues} from '../planner-core.mjs';
import {FIXED_DIET_MEALS,assertDietDay} from '../diet-patterns.mjs';
import {workoutPlan,workoutSafetyIssues,exerciseAlternatives,muscleRegions,weeklySetTotals,scheduledSessions,estimatedSessionMinutes} from './workouts.mjs';
import {recovery,accountRecovery,calorieReview,progression,hasPerformanceDrop,workoutProgressionSummary} from './recovery.mjs';
import {library,activePlan,foodCommand,replaceMeal,plannedEnergyForDate} from './food.mjs';
import {ensureTrainingState,forkWorkout,expectedExercises,sessionCompletion,reconcileSessions} from './training-state.mjs';
import {volumeReview} from './training-review.mjs';
import {nutritionEvidenceKey,matchingNutritionDecline} from '../nutrition-decisions.mjs';
import {localDate,dateOffset,dateForLog as validateLogDate,validDate,validTimeZone,number,integer,boolean,stringList,plainRecord,MUSCLE_REGIONS,needsHealthConfirmation,needsScheduleConfirmation,normalizeWeekdayDraft,canonicalInjuries,SUPPORTED_WORKOUT_INJURIES} from '../coaching-shared.mjs';
import {apiError} from '../coaching-error.mjs';

const userTz=s=>s?.profile?.timezone||clockTimeZone()||'Africa/Cairo';
const userToday=s=>localDate(clockNow(),userTz(s));
const dateForLog=(date,s)=>validateLogDate(date,clockNow(),userTz(s));
export {number};export const today=clockDate;
export const SUPPORTED_WELLNESS_CONDITIONS=new Set(['hypertension','insulin_resistance','pcos','ibs','cholesterol','gout','anemia','vitamin_d_deficiency','lactose_intolerance','favism','fatty_liver']);
export const SUPPORTED_MILD_INJURIES=new Set(SUPPORTED_WORKOUT_INJURIES);
export const empty=()=>({schemaVersion:3,revision:0,profile:null,preferences:null,onboarding:null,plans:[],planRefs:[],workoutPlan:null,foodLogs:[],foodEntries:[],waterLogs:[],weights:[],activityLogs:[],workoutLogs:[],sessions:[],checkins:[],adaptations:[],history:[],notificationPreferences:{dailyReminder:true,workoutReminder:true,waterReminder:true,weeklyReviewReminder:true,quietHoursStart:'22:00',quietHoursEnd:'08:00',channels:['in_app']},entitlements:{tier:'free',features:['core_nutrition','core_workouts','offline_sync','arabic_food_search'],updatedAt:null}});
const clean=a=>a==null?[]:stringList(a,'selections').filter(x=>x!=='none');
export function normalize(s){
 for(const key of ['workoutPlanRefs','planRefs','foodEntries','waterLogs','weights','activityLogs','workoutLogs','sessions','foodLogs','checkins','adaptations','history','coachingCases','coachingFeedback'])s[key]||=[];
 s.notificationPreferences||={dailyReminder:true,workoutReminder:true,waterReminder:true,weeklyReviewReminder:true,quietHoursStart:'22:00',quietHoursEnd:'08:00',channels:['in_app']};
 s.entitlements||={tier:'free',features:['core_nutrition','core_workouts','offline_sync','arabic_food_search'],updatedAt:null};
 s.schemaVersion=3;
 let reopened=false;
 for(const log of s.foodLogs)if(log.source==='entries'&&log.completionPolicy!==1){log.legacyCompletion=!!log.complete;log.complete=false;log.completionPolicy=1;log.confirmedAt=null;reopened=true;}
 if(reopened){for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';s.lastReview=null;}
 s.workoutSafetyIssues=workoutSafetyIssues(s);
 if(s.workoutSafetyIssues.length){for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';for(const day of s.workoutPlan.days)for(const exercise of day.exercises){delete exercise.suggestedKg;delete exercise.progressionReason;}}
 ensureTrainingState(s);reconcileSessions(s);return s;
}
export function dailyWaterTarget(s,date=userToday(s)){
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
 const age=integer(d.age,18,70,'age'),weight=number(d.weight,35,250,'weight'),height=number(d.height,120,230,'height');
 if(!['male','female'].includes(d.sex))throw apiError('INVALID_SEX','sex must be male or female.',{status:400});
 if(d.diseases!=null&&!Array.isArray(d.diseases)||d.injuries!=null&&!Array.isArray(d.injuries))throw apiError('INVALID_HEALTH_FLAGS','diseases and injuries must be arrays of condition IDs.',{status:400});
 const declaredDiseases=clean(d.diseases),rawInjuries=clean(d.injuries),declaredInjuries=canonicalInjuries(rawInjuries);
 if(rawInjuries.includes('elbow_pain'))throw apiError('UNSUPPORTED_ELBOW_PAIN','Elbow pain requires specialist assessment; automated workout adaptation is not supported for this injury.',{status:400});
 const unsupportedClinical=declaredDiseases.some(x=>!SUPPORTED_WELLNESS_CONDITIONS.has(x))||declaredInjuries.some(x=>!SUPPORTED_MILD_INJURIES.has(x))||(d.maternalStatus&&d.maternalStatus!=='none');
 if(age>70||unsupportedClinical)throw apiError('CLINICAL_REVIEW_REQUIRED','Declared clinical conditions or age require specialist review before automated plan generation.',{status:400});
 if(!['lose','maintain','gain','muscle_gain'].includes(d.goal))throw apiError('INVALID_GOAL','goal must be one of lose, maintain, gain, or muscle_gain.',{status:400});
 if(!['nutrition_only','workouts_only','nutrition_and_workouts'].includes(d.serviceTrack))throw apiError('INVALID_SERVICE_TRACK','serviceTrack must be one of nutrition_only, workouts_only, or nutrition_and_workouts.',{status:400});
 const bmi=weight/((height/100)**2);if(bmi<12.5||bmi>65)throw apiError('BMI_OUT_OF_RANGE','Calculated BMI is outside the automated planning range (12.5..65).',{status:400});if(bmi<18.5&&d.goal==='lose')throw apiError('WEIGHT_LOSS_UNDERWEIGHT_UNSAFE','Weight loss plans are not suitable when current BMI is below 18.5.',{status:400});
 const timezone=d.timezone?String(d.timezone).trim():(d.region==='gulf'?'Asia/Riyadh':'Africa/Cairo');
 if(!validTimeZone(timezone))throw apiError('INVALID_TIMEZONE','Invalid IANA timezone identifier.',{status:400});
 const locale=['ar-EG','ar-SA','en'].includes(d.locale)?d.locale:(d.region==='gulf'?'ar-SA':'ar-EG');
 const wp=d.serviceTrack==='nutrition_only'?null:workoutPlan({...d,injuries:declaredInjuries});
 const externalTrainingDays=d.externalTrainingDays==null?[]:(Array.isArray(d.externalTrainingDays)&&d.externalTrainingDays.length<=6?[...new Set(d.externalTrainingDays.map(v=>integer(v,0,6,'externalTrainingDays')))]:(()=>{throw apiError('INVALID_EXTERNAL_TRAINING_DAYS','externalTrainingDays must be an array of up to 6 weekday integers (0..6).',{status:400});})());
 if(d.serviceTrack==='nutrition_only'&&d.goal==='muscle_gain'&&!externalTrainingDays.length)throw apiError('MUSCLE_GAIN_REQUIRES_RESISTANCE_DAYS','Muscle gain goal in nutrition_only track requires confirmed external resistance training days.',{status:400});
 const profile={weekdayConvention:'js_sunday_0',name:String(d.name||'').slice(0,100),age,weight,height,sex:d.sex,goal:d.goal,targetWeight:d.targetWeight!=null&&d.targetWeight!==''?number(d.targetWeight,35,250,'targetWeight'):null,goalPace:d.goalPace,activity:d.dailyActivity||'light',timezone,locale,trainingDays:wp?.days.length||externalTrainingDays.length,workoutDays:wp?.days.map(x=>x.dayIndex)||externalTrainingDays,externalTrainingDays,diseases:declaredDiseases,maternalStatus:'none',ketoAcknowledged:d.dietType==='keto',fastingAcknowledged:d.dietType==='intermittent_fasting'};
 if(profile.targetWeight&&profile.goal==='lose'&&(profile.targetWeight>=weight||profile.targetWeight/(height/100)**2<18.5))throw apiError('INVALID_TARGET_WEIGHT','targetWeight is inconsistent with your goal and safe BMI floor (18.5).',{status:400});
 const fixed=FIXED_DIET_MEALS[d.dietType];
 const excludedGroups=[...new Set([
  ...clean(d.excludedGroups),
  ...(declaredDiseases.includes('favism')?['fava']:[]),
  ...(declaredDiseases.includes('lactose_intolerance')?['dairy','milk','yogurt','cheese']:[])
 ])];
 const baseProteins=d.dietType==='vegan'?['legumes','nuts']:d.dietType==='vegetarian'?['legumes','eggs','dairy','nuts']:['legumes','eggs','dairy','chicken','fish','meat','nuts'];
 const proteins=declaredDiseases.includes('lactose_intolerance')?baseProteins.filter(p=>p!=='dairy'):baseProteins;
 const prefs={diet:d.dietType||'balanced',fasting:fixed?.fasting||'none',eatingStart:d.eatingStart||'12:00',region:d.region||'egypt',budget:d.budget||'medium',meals:fixed?.meals||integer(d.mealsCount??4,2,5,'mealsCount'),proteins,excludedKeys:[],excludedFoodIds:[],excludedGroups};
 profile.recomposition=profile.goal==='muscle_gain'&&profile.targetWeight===weight;
 validatePreferences(prefs,library);
 const startLocalDate=localDate(clockNow(),timezone);
 const plan=d.serviceTrack==='workouts_only'?null:makeWeek(profile,prefs,library,startLocalDate,seed);
 if(d.serviceTrack==='workouts_only'&&d.healthConfirmed!==true)throw apiError('HEALTH_CONFIRMATION_REQUIRED','Confirm health readiness clearance before creating or modifying a workout plan.',{status:400});
 if(profile.targetWeight&&(profile.goal==='gain'&&profile.targetWeight<=weight||profile.goal==='muscle_gain'&&profile.targetWeight<weight))throw apiError('INVALID_TARGET_WEIGHT','targetWeight for weight gain must be greater than current weight.',{status:400});
 const journeyStartedOn=s.onboarding?.journeyStartedOn??(!s.profile?startLocalDate:null);
 if(s.profile)s.history.push({at:isoNow(),kind:'profile',profile:s.profile,planId:s.active_plan_id,workoutPlanId:s.workoutPlan?.id});
 if(s.workoutPlan){s.workoutArchives||=[];s.workoutArchives.push(s.workoutPlan);}
 s.profile=profile;s.preferences=prefs;s.workoutPlan=wp;s.nutritionAdjustment=null;
 const workoutPrefs={weekdayConvention:'js_sunday_0',fitnessLevel:wp?d.fitnessLevel??'beginner':'beginner',selectedWorkoutDays:wp?.days.map(x=>x.dayIndex)||externalTrainingDays,workoutDaysCount:wp?.days.length||externalTrainingDays.length,workoutSplitPreference:wp?d.workoutSplitPreference??'auto':'auto',workoutLocation:wp?d.workoutLocation??'gym_only':'gym_only',dayLocations:wp?Object.fromEntries(wp.days.map(day=>[day.dayIndex,day.location])):{},homeEquipment:wp?stringList(d.homeEquipment??['none'],'homeEquipment',20):['none'],sessionDuration:wp?d.sessionDuration??45:45,injuries:rawInjuries.length?rawInjuries:['none'],healthConfirmed:d.healthConfirmed===true,externalTrainingDays};
 s.onboarding={serviceTrack:d.serviceTrack,workoutPrefs,isAuthenticated:true,...(journeyStartedOn?{journeyStartedOn}:{})};ensureTrainingState(s);
 if(plan){plan.created_at=isoNow();plan.effective_from=startLocalDate;s.plans.push(plan);s.active_plan_id=plan.id;}else s.active_plan_id=null;
 s.nutritionContextStartedOn=startLocalDate;s.lastReview=null;s.sessionAdjustment=null;discardPending(s);return s;
}
export function review(s){
 const tz=userTz(s),currDate=userToday(s);
 if(needsScheduleConfirmation(s)){discardPending(s);s.lastReview={at:isoNow(),reviewScope:'system_generated_guidance',reasonCode:'SCHEDULE_CONFIRMATION_REQUIRED',recovery:'unknown',nutrition:{action:'hold',reasonCode:'SCHEDULE_CONFIRMATION_REQUIRED',reason:'محرك التدريب الآلي ينتظر تأكيد أيام تمرينك في الأسبوع أولاً.'},volume:{action:'hold',reasonCode:'SCHEDULE_CONFIRMATION_REQUIRED',reason:'أيام التمرين تحتاج تأكيدًا.'},workout:{completed:0,partial:0,missed:0},message:'نحتاج تأكيد أيام التمرين أولًا.'};return s;}
 if(needsHealthConfirmation(s)){discardPending(s);s.lastReview={at:isoNow(),reviewScope:'system_generated_guidance',reasonCode:'HEALTH_CONFIRMATION_REQUIRED',recovery:'unknown',nutrition:{action:'hold',reasonCode:'HEALTH_CONFIRMATION_REQUIRED',reason:'محرك المتابعة الآلي ينتظر تأكيد حالتك الصحية أولًا للاطمئنان عليك.'},volume:{action:'hold',reasonCode:'HEALTH_CONFIRMATION_REQUIRED',reason:'نحتاج تأكيد الجاهزية الصحية.'},workout:{completed:0,partial:0,missed:0},message:'مراجعة الخطة تحتاج تأكيد الحالة الصحية.'};return s;}
 reconcileSessions(s);
 const ready=accountRecovery(s,clockNow(),tz),plan=activePlan(s),proposals=[];
 if(workoutSafetyIssues(s).length){discardPending(s);s.lastReview={at:isoNow(),reviewScope:'system_generated_guidance',reasonCode:'WORKOUT_SAFETY_EXCLUSION_HOLD',recovery:ready.status==='stop'?'stop':'hold',nutrition:{action:'hold',reasonCode:'WORKOUT_SAFETY_EXCLUSION_HOLD',reason:'راجع التمارين المستبعدة في خطتك القديمة واستبدلها أو أعد إنشاء الخطة.'},message:ready.status==='stop'?ready.reasons.join(' '):'الخطة القديمة تحتوي حركات مستبعدة حسب إصابتك؛ لا تؤدّها. استبدلها أو راجع مختصًا.'};return s;}
 if(plan){
  try{for(const d of plan.days.filter(d=>d.date>=currDate))assertDietDay(d.meals.map(m=>m.snapshot),s.preferences?.diet||'balanced',d.targets||plan.targets,s.profile);}
  catch(e){discardPending(s);s.lastReview={at:isoNow(),reviewScope:'system_generated_guidance',reasonCode:'PLAN_CONSTRAINTS_VERIFICATION_FAILED',recovery:ready.status,nutrition:{action:'hold',reasonCode:'PLAN_CONSTRAINTS_VERIFICATION_FAILED',reason:'الخطة القديمة لا تحقق قيودك الحالية؛ أعد إنشاء الخطة.'},message:e.message};return s;}
 }
 let nutrition={action:'hold',reasonCode:plan?'RECOVERY_NOT_READY_FOR_CALORIE_CHANGE':'WORKOUTS_ONLY_TRACK',reviewScope:'system_generated_guidance',reason:plan?'توجيه النظام الآلي للتغذية: يُنصح باستقرار النوم والاستشفاء أولاً قبل أي تعديل في سعراتك.':'مسارك الحالي للتمارين فقط بدون خطة أكل.'};
 const needsRecoveryAdvice=['caution','high'].includes(ready.status)&&!!s.workoutPlan;
 const currentAdjustment=s.sessionAdjustment;
 const acceptedRecovery=needsRecoveryAdvice&&currentAdjustment&&(!currentAdjustment.planId||currentAdjustment.planId===s.workoutPlan.id)&&Date.parse(currentAdjustment.expiresAt)>clockNow()&&currentAdjustment.setFactor===ready.setFactor;
 const declinedRecovery=needsRecoveryAdvice&&[...s.adaptations].reverse().find(a=>a.kind==='recovery'&&a.status==='rejected'&&a.setFactor===ready.setFactor&&Date.parse(a.expiresAt)>clockNow()&&(a.recoveryEvidenceAt?a.recoveryEvidenceAt===ready.asOf:Date.parse(a.at)>=Date.parse(ready.asOf)));
 if(needsRecoveryAdvice&&!acceptedRecovery&&!declinedRecovery)proposals.push({kind:'recovery',reasonCode:'RECOVERY_DELOAD_PROPOSAL',reviewScope:'system_generated_guidance',recoveryEvidenceAt:ready.asOf,setFactor:ready.setFactor,regions:Object.entries(ready.muscles).filter(([,m])=>m.status==='caution').map(([r])=>r),reason:`توصية النظام الآلي للتدريب: لأن ${ready.reasons.join(' و')}، نقترح تقليل عدد الجولات مؤقتًا؛ تطبيق التعديل يحتاج موافقتك.`,expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 const profileChange=s.history.filter(h=>h.kind==='profile').at(-1)?.at;
 const contextStart=s.nutritionContextStartedOn||(profileChange?localDate(Date.parse(profileChange),tz):null);
 const contextWeights=s.weights.filter(w=>!contextStart||w.date>=contextStart),contextFood=s.foodLogs.filter(d=>!contextStart||d.date>=contextStart);
 const targetWeights=contextWeights.filter(w=>w.date>=dateOffset(currDate,-6)&&w.date<=currDate);
 const averageWeight=targetWeights.length?targetWeights.reduce((n,w)=>n+w.kg,0)/targetWeights.length:null;
 const reached=!s.profile.recomposition&&targetWeights.length>=3&&s.profile.targetWeight&&((s.profile.goal==='lose'&&averageWeight<=s.profile.targetWeight)||(['gain','muscle_gain'].includes(s.profile.goal)&&averageWeight>=s.profile.targetWeight));
 if(plan&&ready.status==='ready'&&reached){
  nutrition={action:'propose',reasonCode:'GOAL_WEIGHT_REACHED_MAINTENANCE',reviewScope:'system_generated_guidance',reason:'مبروك يا بطل! 🎉 إشعار النظام الآلي للتغذية: متوسط وزنك وصل للهدف بنجاح؛ نقترح الانتقال لخطة تثبيت الوزن للحفاظ على النتيجة اللي حققتها.'};
  if(matchingNutritionDecline(s,clockNow(),tz,'maintenance'))nutrition={...nutrition,action:'hold',reasonCode:'MAINTENANCE_ADVICE_DECLINED',reason:'رفضك السابق للانتقال إلى التثبيت محفوظ. لم نغيّر هدفك؛ نراجع التوصية عند تغير بيانات التغذية أو الخطة.'};
  else proposals.push({kind:'maintenance',averageWeight,...nutrition,nutritionEvidence:nutritionEvidenceKey(s,clockNow(),tz),expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 }
 else if(plan&&ready.status==='ready'&&(!s.lastVolumeChange||clockNow()-s.lastVolumeChange>=14*86400000)){
  nutrition=calorieReview(contextWeights,contextFood,s.profile.recomposition?'recomposition':s.profile.goal,Number(plan.targets.energy),clockNow(),s.lastCalorieChange||0,tz);
  if(contextStart)nutrition.contextStartedOn=contextStart;
  if(nutrition.action==='propose'&&nutrition.delta<0&&hasPerformanceDrop(s.workoutLogs,clockNow(),tz))nutrition={...nutrition,action:'hold',reasonCode:'PERFORMANCE_DROP_CALORIE_CUT_HOLD',reason:'قرار مشترك من محركي التغذية والتدريب الآليين: رغم ثبات الوزن، لاحظنا انخفاضًا في أداء التمرين؛ لذلك ثبتنا السعرات لحماية الكتلة العضلية واستعادة طاقتك أولاً.'};
  const feedback=currentFeedback(s,'nutrition',currDate);
  if(nutrition.action==='propose'&&nutrition.delta<0&&(feedback?.hunger>=4||feedback?.energy<=2&&feedback?.energy!=null))nutrition={...nutrition,action:'hold',reasonCode:'APPETITE_ENERGY_REVIEW_REQUIRED',reason:'سجلت جوعًا مرتفعًا أو طاقة منخفضة مؤخرًا؛ ثبتنا السعرات لحين متابعة السبب بدل خفضها تلقائيًا.'};
  if(nutrition.action==='propose'&&matchingNutritionDecline(s,clockNow(),tz,'calories'))nutrition={...nutrition,action:'hold',reasonCode:'CALORIE_ADVICE_DECLINED',reason:'رفضك السابق لتعديل السعرات محفوظ، وخطتك لم تتغير. نراجع التوصية عند تغير بيانات التغذية أو الخطة.'};
  if(nutrition.action==='propose'){
   const requestedEnergy=Number(plan.targets.energy)+nutrition.delta;
   if(requestedEnergy<(s.profile.sex==='female'?1200:1400))nutrition={...nutrition,action:'hold',reasonCode:'MIN_SAFE_ENERGY_FLOOR_HOLD',reason:'محرك التغذية الآلي احتفظ بسعراتك الحالية لأن أي خصم إضافي هيكون أقل من الحد الأدنى للتخطيط الآلي؛ ده مش تقييمًا فرديًا لكفاية الطاقة.'};
   else if(requestedEnergy>4200)nutrition={...nutrition,action:'hold',reasonCode:'MAX_SAFE_ENERGY_CEILING_HOLD',reason:'احتفظنا بسعراتك الحالية لأن الزيادة المقترحة تتجاوز الحد الأعلى للتخطيط الآلي. راجع احتياجاتك مع مختص قبل زيادة أخرى.'};
   else try{validateEnergyChange(s,requestedEnergy);retargetPlan(structuredClone(plan),requestedEnergy,s.preferences,dateOffset(currDate,1),s.profile);proposals.push({kind:'calories',...nutrition,nutritionEvidence:nutritionEvidenceKey(s,clockNow(),tz),expiresAt:new Date(clockNow()+86400000).toISOString()});}
   catch(error){if(error instanceof TypeError||error instanceof ReferenceError)throw error;nutrition={...nutrition,action:'hold',reasonCode:'PLAN_CONSTRAINTS_ADJUSTMENT_HOLD',reason:'احتفظنا بخطتك الحالية لأن التعديل المقترح لم يحقق قيود الوجبات أو السعرات أو البروتين. لم نغيّر القيود أو نطبّق التعديل.'};}
  }
 }
 const volume=volumeReview(s,ready,clockNow());
 if(!proposals.length&&volume.action==='propose')proposals.push({...volume,expiresAt:new Date(Math.min(clockNow()+86400000,Date.parse(ready.asOf||s.checkins.at(-1)?.at)+86400000)).toISOString()});
 discardPending(s);
 for(const p of proposals)s.adaptations.push({...p,id:crypto.randomUUID(),baseRevision:s.revision+1,status:'pending',at:isoNow()});
 const sessions=s.sessions.filter(x=>x.date>=dateOffset(currDate,-13));
 const workoutInsights=workoutProgressionSummary(s.workoutPlan,s.workoutLogs,clockNow(),tz);
 const wTarget=dailyWaterTarget(s,currDate);
 const recentWater=(s.waterLogs||[]).filter(x=>x.date>=dateOffset(currDate,-13)&&x.date<=currDate);
 const avgCups=recentWater.length?Math.round(recentWater.reduce((sum,x)=>sum+Number(x.cups||0),0)/recentWater.length*10)/10:null;
 const hydrationReason=!recentWater.length
  ?`سجّل شرب المية يومياً (هدفك ${wTarget.targetCups} كوب ≈ ${wTarget.liters} لتر) علشان نتابع التسجيل مقارنة بهدف خطتك.`
  :avgCups<wTarget.targetCups*0.7
  ?`متوسط شربك للمية (${avgCups} من ${wTarget.targetCups} كوب) أقل من هدف اليوم الحالي؛ المقارنة تقريبية لأن الأهداف قد تختلف بين الأيام، والتسجيل مش قياسًا مباشرًا للجفاف.`
  :`متوسط المية المسجلة ${avgCups} كوب في ${recentWater.length} أيام مسجلة؛ ده ملخص التسجيل ومش تشخيصًا لترطيب الجسم.`;
 const recoveryAdvice={status:acceptedRecovery?'active':declinedRecovery?'declined':needsRecoveryAdvice?'pending':'not_needed',evidenceAt:ready.asOf||null,planId:s.workoutPlan?.id||null,expiresAt:acceptedRecovery?currentAdjustment.expiresAt:declinedRecovery?declinedRecovery.expiresAt:proposals.find(a=>a.kind==='recovery')?.expiresAt||null};
 s.lastReview={at:isoNow(),reviewScope:'system_generated_guidance',reasonCode:proposals.length?proposals[0].reasonCode||'ADAPTATION_PROPOSED':acceptedRecovery?'RECOVERY_ADJUSTMENT_ACTIVE':declinedRecovery?'RECOVERY_ADVICE_DECLINED':nutrition.reasonCode||'NO_CHANGE_NEEDED',recovery:ready.status,recoveryAdvice,nutrition,volume,hydration:{avgCups,targetCups:wTarget.targetCups,targetLiters:wTarget.liters,loggedDays:recentWater.length,reason:hydrationReason},workoutInsights,workout:{partial:sessions.filter(x=>x.status==='partial').length,completed:sessions.filter(x=>x.status==='completed').length,missed:sessions.filter(x=>x.status==='missed').length},message:proposals.length?'محرك المتابعة الآلي جهّز لك توصية جديدة بانتظار موافقتك.':acceptedRecovery?'التخفيف اللي وافقت عليه لسه ساري. مش محتاج توافق على نفس التعديل تاني.':declinedRecovery?'رفضك السابق للتخفيف محفوظ، ولم نغيّر جولتك. هنراجع التوصية بعد متابعة جديدة لحالتك.':'مفيش تعديل جديد مقترح بناءً على البيانات المتاحة؛ راجع أسباب القرار وتغطية التسجيل أدناه.'};
 return s;
}
export function retargetPlan(plan,energy,prefs,effective,profile=null){
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
  assertDietDay(day.meals.map(m=>m.snapshot),prefs.diet,plan.targets,profile||plan.profile);
  day.summary=sumSnapshots(day.meals.map(m=>m.snapshot));if(nutritionQualityIssues(day.summary,day.targets).length)throw apiError('ENERGY_CHANGE_TARGETS_UNMET','Proposed calorie change cannot satisfy minimum protein or nutrition targets.',{status:400});
 }
 plan.warnings=plan.days.flatMap(d=>{const messages=assessDay(d.summary,d.targets||plan.targets);return messages.length?[{date:d.date,messages}]:[];});
 return plan;
}
function validateEnergyChange(s,energy){if(energy<(s.profile.sex==='female'?1200:1400)||energy>4200)throw apiError('ENERGY_CHANGE_OUT_OF_RANGE','Adjusted daily calories exceed safe automated bounds (1200/1400..4200 kcal).',{status:400});}
function adjustCalories(s,a){
 const currDate=userToday(s);
 const previous=activePlan(s),energy=Number(previous.targets.energy)+a.delta;
 validateEnergyChange(s,energy);
 const effective=dateOffset(currDate,1),plan=structuredClone(previous);
 plan.id='plan-'+crypto.randomUUID();plan.parent_id=previous.id;plan.created_at=isoNow();plan.effective_from=effective;plan.changeReason=a.reason;
 if(s.foodEntries.some(e=>e.date>=effective))throw apiError('FUTURE_FOOD_ENTRIES_CONFLICT','Food logs already exist on or after the effective adjustment date.',{status:400});
 retargetPlan(plan,energy,s.preferences,effective,s.profile);
 s.plans.push(plan);s.active_plan_id=plan.id;s.lastCalorieChange=clockNow();s.nutritionAdjustment={energy,protein:plan.targets.protein,effectiveFrom:effective,reason:a.reason};
}
export function command(input,action,p){
 const s=normalize(input);
 if(action==='generate')return generate(s,p);
 if(!s.profile)throw apiError('PROFILE_REQUIRED','Complete onboarding profile generation before running this command.',{status:400});
 if(['coaching_feedback','coaching_decision','coaching_outcome','coaching_ack'].includes(action))return handleCoachingCommand(s,action,p,clockNow());
 const tz=userTz(s),currDate=userToday(s);
 if(settingsActions.has(action)){const result=applySettingsCommand(s,action,p);s.lastReview=null;if(['steps','activity'].includes(action))discardPending(s);return result;}
 if(action!=='review')s.lastReview=null;
 if(!['review','adaptation','timezone','notification_preferences'].includes(action))discardPending(s);
 if(action==='confirm_schedule'){
  if(!needsScheduleConfirmation(s))throw apiError('SCHEDULE_ALREADY_CONFIRMED','Workout schedule weekday convention has already been confirmed.',{status:400});
  const map=plainRecord(p.dayMap,'dayMap'),before=s.workoutPlan;
  if(Object.keys(map).length!==before.days.length||before.days.some(d=>!Object.hasOwn(map,String(d.dayIndex)))||new Set(Object.values(map).map(v=>integer(v,0,6,'weekday'))).size!==before.days.length)throw apiError('INVALID_SCHEDULE_MAPPING','Provide a unique weekday index (0..6) for each workout day in dayMap.',{status:400});
  const next=structuredClone(before),reverse={};next.id=crypto.randomUUID();next.parent_id=before.id;next.version++;
  for(const day of next.days){const old=day.dayIndex;day.dayIndex=integer(map[old],0,6,'weekday');reverse[day.dayIndex]=old;}
  next.days.sort((a,b)=>a.dayIndex-b.dayIndex);forkWorkout(s,next,{oldDayIndexByNew:reverse,carryCalendar:false});
  s.history.push({kind:'schedule_basis_confirmation',at:isoNow(),previousId:before.id,nextId:next.id,dayMap:structuredClone(map),previousOverrides:(s.scheduleOverrides||[]).filter(o=>o.planId===before.id)});
  s.onboarding||={serviceTrack:s.active_plan_id?'nutrition_and_workouts':'workouts_only',workoutPrefs:{}};s.onboarding.workoutPrefs||={};s.profile.weekdayConvention='js_sunday_0';s.profile.workoutDays=next.days.map(d=>d.dayIndex);s.onboarding.workoutPrefs.weekdayConvention='js_sunday_0';s.onboarding.workoutPrefs.selectedWorkoutDays=s.profile.workoutDays;s.onboarding.workoutPrefs.dayLocations=Object.fromEntries(next.days.map(d=>[d.dayIndex,d.location]));
  const current=activePlan(s);if(current){const plan=structuredClone(current);plan.id='plan-'+crypto.randomUUID();plan.parent_id=current.id;plan.created_at=isoNow();plan.changeReason='تأكيد أيام التدريب بعد توحيد التقويم';plan.profile=structuredClone(s.profile);for(const day of plan.days)if(day.date>=currDate)day.is_workout_day=s.profile.workoutDays.includes(new Date(day.date+'T12:00:00Z').getUTCDay());s.plans.push(plan);s.active_plan_id=plan.id;}
  discardPending(s);return s;
 }
 if(action==='confirm_health'){if(!needsHealthConfirmation(s))throw apiError('HEALTH_ALREADY_CONFIRMED','Health readiness has already been confirmed.',{status:400});if(p.healthy!==true||p.injuryFree!==true)throw apiError('HEALTH_CONFIRMATION_REQUIRED','Confirm health readiness clearance before creating or modifying a workout plan.',{status:400});s.onboarding.workoutPrefs.healthConfirmed=true;s.onboarding.workoutPrefs.healthConfirmedAt=isoNow();discardPending(s);return s;}
 if(['food_entry','food_delete','food_complete','food_switch_to_entries'].includes(action))return foodCommand(s,action,p);
 if(action==='replace_meal')return replaceMeal(s,p);
 if(action==='renew_plan'){
  const current=activePlan(s);if(!current)throw apiError('PLAN_NOT_ACTIVE_FOR_TRACK','No active nutrition plan exists for a workouts-only track.',{status:400});
  if(current.days.at(-1).date>=currDate)throw apiError('PLAN_STILL_ACTIVE','Current weekly nutrition plan is still active; renewal is allowed after it ends.',{status:400});
  const next=makeWeek(s.profile,s.preferences,library,currDate,crypto.randomUUID(),s.nutritionAdjustment?.energy??null);next.created_at=isoNow();next.parent_id=current.id;next.effective_from=currDate;
  s.plans.push(next);s.active_plan_id=next.id;
 }else if(action==='weight'){
  const date=dateForLog(p.date||currDate,s),kg=number(p.kg,35,250,'kg');s.weights=s.weights.filter(x=>x.date!==date);s.weights.push({date,kg,source:p.source||'manual',at:isoNow()});
 }else if(action==='water'){
  const date=dateForLog(p.date||currDate,s),target=dailyWaterTarget(s,date);
  const existing=(s.waterLogs||[]).find(x=>x.date===date);
  const cups=p.addCups!=null?Math.max(0,Math.min(30,(existing?.cups||0)+integer(p.addCups,-10,20,'addCups'))):integer(p.cups,0,30,'cups');
  s.waterLogs=(s.waterLogs||[]).filter(x=>x.date!==date);
  s.waterLogs.push({date,cups,liters:Math.round(cups*0.25*100)/100,targetCups:target.targetCups,targetLiters:target.liters,at:isoNow()});
 }else if(action==='food'){
  const date=dateForLog(p.date,s),plan=activePlan(s);if(s.foodEntries.some(e=>e.date===date))throw apiError('DAILY_TOTAL_REQUIRES_DETAILED_CONVERSION','This day has detailed food entries; use food_complete instead.',{status:400});
  const energy=number(p.energy,0,10000,'energy'),complete=boolean(p.complete,'complete'),plannedEnergy=plannedEnergyForDate(s,date);
  s.foodLogs=s.foodLogs.filter(x=>x.date!==date);s.foodLogs.push({date,complete,adherence:plannedEnergy?Math.max(0,Math.round(100-Math.abs(energy-plannedEnergy)/plannedEnergy*100)):null,energy,plannedEnergy,planId:plan?.id,source:'daily_total',completionPolicy:1,confirmedAt:complete?isoNow():null});
 }else if(action==='recovery'){
  for(const key of ['pain','illness','redFlags'])if(typeof p[key]!=='boolean')throw apiError('RECOVERY_FLAGS_REQUIRED','Boolean flags pain, illness, and redFlags are required for recovery check-ins.',{status:400});
  const sorenessByRegion={};for(const [key,v]of Object.entries(p.sorenessByRegion==null?{}:plainRecord(p.sorenessByRegion,'sorenessByRegion'))){if(!Object.hasOwn(MUSCLE_REGIONS,key))throw apiError('INVALID_MUSCLE_REGION',`Unknown muscle region key: ${key}.`,{status:400,params:{region:key}});sorenessByRegion[key]=number(v,0,10,'soreness');}
  const painRegions=p.painRegions||[];if(!Array.isArray(painRegions)||painRegions.some(r=>typeof r!=='string'||!Object.hasOwn(MUSCLE_REGIONS,r)))throw apiError('INVALID_PAIN_REGIONS','painRegions must be an array of supported muscle region keys.',{status:400});
  const c={at:isoNow(),date:p.date?dateForLog(p.date,s):currDate,sleepHours:number(p.sleepHours,0,24,'sleepHours'),sleepQuality:integer(p.sleepQuality,1,5,'sleepQuality'),fatigue:integer(p.fatigue,1,5,'fatigue'),stress:p.stress==null||p.stress===''?null:integer(p.stress,1,5,'stress'),soreness:number(p.soreness??0,0,10,'soreness'),sorenessByRegion,painRegions,pain:p.pain||painRegions.length>0,illness:p.illness,redFlags:p.redFlags};
  s.checkins=s.checkins.filter(x=>x.date!==c.date);s.checkins.push(c);s.sessionAdjustment=null;for(const day of s.workoutPlan?.days||[])for(const exercise of day.exercises){delete exercise.suggestedKg;delete exercise.progressionReason;}
 }else if(action==='workout'){
  const dayIndex=integer(p.dayIndex,0,6,'dayIndex'),day=s.workoutPlan?.days.find(d=>d.dayIndex===dayIndex),exercise=day?.exercises.find(x=>x.id===p.exerciseId);if(!exercise)throw apiError('EXERCISE_NOT_IN_DAY','Exercise is not scheduled in the specified workout day.',{status:400});
  if(!Array.isArray(p.sets)||p.sets.length<1||p.sets.length>10)throw apiError('WORKOUT_SETS_REQUIRED','sets array must contain between 1 and 10 performed sets.',{status:400});
  const date=dateForLog(p.date||currDate,s);const sets=p.sets.map(x=>({kg:usesKg(exercise)?number(x.kg,0,500,'kg'):0,reps:number(x.reps,1,100,'reps'),rir:x.rir==null?null:number(x.rir,0,10,'rir'),pain:boolean(x.pain,'pain',false)}));
  if(sets.some(x=>!Number.isInteger(x.reps)))throw apiError('WORKOUT_REPS_MUST_BE_INTEGER','Performed set reps must be whole integers.',{status:400});
  const existing=s.workoutLogs.find(l=>l.date===date&&l.exerciseId===exercise.id&&l.dayIndex===(day?.dayIndex??null)&&l.planId===s.workoutPlan.id);
  const entry={id:existing?.id||crypto.randomUUID(),at:isoNow(),date,exerciseId:exercise.id,dayIndex:day?.dayIndex??null,planId:s.workoutPlan.id,loadMode:exercise.loadMode,progressionKey:exercise.progressionKey,laterality:exercise.laterality,bothSides:boolean(p.bothSides,'bothSides',false),sets,increment:!usesKg(exercise)||p.increment==null||p.increment===''?null:number(p.increment,.1,20,'increment')};
  if(existing)s.workoutLogs=s.workoutLogs.filter(l=>l.id!==existing.id);s.workoutLogs.push(entry);
  if(p.autoSession===true){
   const autoSess={id:crypto.randomUUID(),date,dayIndex,planId:s.workoutPlan.id,programId:s.workoutPlan.programId,status:'completed',expectedExercises:expectedExercises(s,day,date)};
   Object.assign(autoSess,sessionCompletion(s,autoSess));
   autoSess.status=autoSess.completionRatio>=.8?'completed':'partial';
   autoSess.estimatedDuration=day.estimatedMinutes||day.duration||45;
   autoSess.duration=null;
   autoSess.rpe=null;autoSess.metricsSource='automatic_coverage';
   s.sessions=s.sessions.filter(x=>!(x.date===date&&x.dayIndex===dayIndex&&x.planId===s.workoutPlan.id));
   s.sessions.push(autoSess);
  }
  reconcileSessions(s);
  if(workoutSafetyIssues(s).length){delete exercise.suggestedKg;delete exercise.progressionReason;return s;}
  const ready=accountRecovery(s,clockNow(),tz);const localBlocked=muscleRegions(exercise).some(r=>['caution','hold'].includes(ready.muscles[r]?.status));
  const next=progression({...exercise,planId:s.workoutPlan.id},s.workoutLogs,{...ready,progressionAllowed:ready.progressionAllowed&&!needsHealthConfirmation(s)&&!needsScheduleConfirmation(s)&&!localBlocked&&date===currDate});
  delete exercise.suggestedKg;delete exercise.progressionReason;
  if(next.action==='increase'){exercise.suggestedKg=next.kg;exercise.progressionReason=next.reason;exercise.suggestionAt=isoNow();}
 }else if(action==='session'){
  const dayIndex=integer(p.dayIndex,0,6,'dayIndex'),date=dateForLog(p.date||currDate,s),day=s.workoutPlan?.days.find(d=>d.dayIndex===dayIndex);
  if(!day||!['completed','partial','missed'].includes(p.status))throw apiError('INVALID_WORKOUT_SESSION','Workout session day or status (completed, partial, missed) is invalid.',{status:400});
  const session={id:crypto.randomUUID(),date,dayIndex,planId:s.workoutPlan.id,programId:s.workoutPlan.programId,status:p.status,expectedExercises:expectedExercises(s,day,date)};
  Object.assign(session,sessionCompletion(s,session));
  if(p.status!=='missed'&&!session.actualSets)throw apiError('SESSION_REQUIRES_ACTUAL_SETS','Log at least one exercise set before marking a session completed or partial.',{status:400});
  if(session.actualSets&&session.completionRatio<.8)session.status='partial';
  if(session.actualSets){session.duration=p.duration==null||p.duration===''?null:number(p.duration,1,240,'duration');session.rpe=p.rpe==null||p.rpe===''?null:number(p.rpe,0,10,'rpe');session.metricsSource='user_report';}
  else{session.duration=null;session.rpe=null;}
  s.sessions=s.sessions.filter(x=>!(x.date===date&&x.dayIndex===dayIndex&&x.planId===s.workoutPlan.id));s.sessions.push(session);
 }else if(action==='replace_exercise'){
  const alternatives=exerciseAlternatives(s,p.dayIndex,p.exerciseId),choice=alternatives.find(e=>e.id===p.alternativeId);if(!choice)throw apiError('EXERCISE_ALTERNATIVE_INVALID','Alternative exercise is incompatible with movement pattern, injuries, or equipment.',{status:400});
  const previous=s.workoutPlan,next=structuredClone(previous);next.id=crypto.randomUUID();next.parent_id=previous.id;next.version++;
  const day=next.days.find(d=>d.dayIndex===Number(p.dayIndex));const i=day.exercises.findIndex(e=>e.id===p.exerciseId),old=day.exercises[i];
  day.exercises[i]={...choice,regions:muscleRegions(choice),sets:old.sets,repMin:old.repMin,repMax:old.repMax,rir:old.rir,restSeconds:old.restSeconds};
  day.estimatedMinutes=estimatedSessionMinutes(day);
  s.history.push({at:isoNow(),kind:'workout_replacement',previousId:previous.id,nextId:next.id,exerciseId:old.id,alternativeId:choice.id});next.weeklySets=weeklySetTotals(next.days);forkWorkout(s,next);discardPending(s);
 }else if(action==='reschedule'){
  const date=p.toDate;if(!validDate(date)||date<currDate||date>dateOffset(currDate,13))throw apiError('RESCHEDULE_DATE_OUT_OF_RANGE','Target reschedule date must be between today and today + 13 days.',{status:400});
  const dayIndex=integer(p.dayIndex,0,6,'dayIndex');if(!s.workoutPlan?.days.some(d=>d.dayIndex===dayIndex))throw apiError('WORKOUT_DAY_NOT_IN_PLAN','Requested dayIndex is not present in your active workout plan.',{status:400});
  const existing=scheduledSessions(s,currDate).find(x=>x.date===date);if(existing||s.sessions.some(x=>x.date===date&&x.status==='completed'))throw apiError('RESCHEDULE_DAY_OCCUPIED','Another workout session already exists on the target reschedule date.',{status:409});
  const currentOccurrence=scheduledSessions(s,currDate).find(x=>x.dayIndex===dayIndex);const priorOverride=(s.scheduleOverrides||[]).find(o=>o.planId===s.workoutPlan.id&&o.dayIndex===dayIndex&&o.toDate===currentOccurrence?.date);const fromDate=priorOverride?.fromDate||currentOccurrence?.date;if(!fromDate||fromDate===date)throw apiError('RESCHEDULE_DATE_UNCHANGED','Target reschedule date must differ from the session\'s current date.',{status:400});
  discardPending(s);s.adaptations.push({id:crypto.randomUUID(),kind:'schedule',reasonCode:'WORKOUT_RESCHEDULE_PROPOSAL',reviewScope:'system_generated_guidance',dayIndex,fromDate,toDate:date,status:'pending',baseRevision:s.revision+1,at:isoNow(),expiresAt:new Date(clockNow()+86400000).toISOString(),reason:'تأكيد نقل موعد تمرينك إلى يوم '+date+' مع الحفاظ على سعراتك اليومية.'});
 }else if(action==='review')return review(s);
 else if(action==='adaptation'){
  const a=s.adaptations.find(x=>x.id===p.id&&x.status==='pending');if(!a)throw apiError('ADAPTATION_NOT_FOUND','Pending adaptation proposal not found.',{status:404});
  if(p.accept===false){a.status='rejected';a.rejectedAt=isoNow();return s;}if(p.accept!==true)throw apiError('ADAPTATION_ACCEPT_REQUIRED','Boolean accept field (true or false) is required.',{status:400});
  if(a.baseRevision!==s.revision)throw apiError('ADAPTATION_STALE_REVISION','Account data changed since this proposal was generated; run review again.',{status:409});
  if(a.expiresAt&&(!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=clockNow()))throw apiError('ADAPTATION_EXPIRED','Adaptation proposal has expired; run review again.',{status:400});
  if((needsHealthConfirmation(s)||needsScheduleConfirmation(s))&&a.kind!=='schedule')throw apiError('ADAPTATION_CONFIRMATION_REQUIRED','Confirm health clearance and schedule before accepting adaptations.',{status:400});
  if(workoutSafetyIssues(s).length)throw apiError('ADAPTATION_UNSAFE_WORKOUT','Resolve excluded exercises in your workout plan before accepting adaptations.',{status:400});
  const currentRecovery=accountRecovery(s,clockNow(),tz);
  if(a.kind==='recovery'&&!['caution','high'].includes(currentRecovery.status))throw apiError('ADAPTATION_RECOVERY_STALE','Recovery check-in has expired or no longer supports this deload proposal; run review again.',{status:400});
  if(['weekly_volume','calories','maintenance'].includes(a.kind)&&currentRecovery.status!=='ready')throw apiError('ADAPTATION_NEEDS_FRESH_RECOVERY','Accepting this adaptation requires a fresh ready recovery check-in.',{status:400});
  if(a.kind==='weekly_volume'){
   const valid=volumeReview(s,currentRecovery,clockNow());if(valid.action!=='propose'||valid.exerciseId!==a.exerciseId||valid.dayIndex!==a.dayIndex)throw apiError('ADAPTATION_VOLUME_NO_LONGER_SUPPORTED','Current recovery or performance evidence no longer supports volume progression.',{status:400});
  }
  if(a.kind==='recovery')s.sessionAdjustment={planId:s.workoutPlan?.id,setFactor:a.setFactor,regions:a.regions,expiresAt:a.expiresAt,reason:a.reason};
  else if(a.kind==='calories'){
   const f=currentFeedback(s,'nutrition',currDate);
   if(a.delta<0&&(f?.hunger>=4||f?.energy!=null&&f.energy<=2))throw apiError('ADAPTATION_CALORIE_CUT_BLOCKED','Recent high hunger or low energy requires review before applying a calorie cut.',{status:400});
   adjustCalories(s,a);
  }
  else if(a.kind==='maintenance'){
   const before=activePlan(s),profile={...s.profile,weight:Math.round(a.averageWeight*10)/10,goal:'maintain',targetWeight:null};
   const start=dateOffset(currDate,1),plan=makeWeek(profile,s.preferences,library,start,crypto.randomUUID());
   const currentDay=before.days.find(d=>d.date===currDate);if(currentDay)plan.days.unshift(structuredClone(currentDay));
   plan.created_at=isoNow();plan.parent_id=before.id;plan.effective_from=start;plan.changeReason=a.reason;
   s.history.push({kind:'goal_maintenance',at:isoNow(),profile:s.profile,planId:before.id});
   s.profile=profile;s.plans.push(plan);s.active_plan_id=plan.id;s.nutritionContextStartedOn=start;s.lastCalorieChange=clockNow();s.nutritionAdjustment={energy:plan.targets.energy,protein:plan.targets.protein,effectiveFrom:start,reason:a.reason};
  }
  else if(a.kind==='weekly_volume'){
   if(s.workoutPlan.id!==a.planId)throw apiError('ADAPTATION_WORKOUT_PLAN_CHANGED','Active workout plan changed since this proposal was generated; run review again.',{status:409});
   const before=s.workoutPlan,next=structuredClone(before);next.id=crypto.randomUUID();next.parent_id=previousId(before);next.version++;
   function previousId(w){return w.id;}
   const exercise=next.days.find(d=>d.dayIndex===a.dayIndex)?.exercises.find(e=>e.id===a.exerciseId);
   if(!exercise)throw apiError('EXERCISE_NOT_IN_DAY','Exercise is not scheduled in the specified workout day.',{status:404});exercise.sets+=a.extraSets;
   next.weeklySets=weeklySetTotals(next.days);
   s.history.push({kind:'weekly_volume',at:isoNow(),previousId:before.id,nextId:next.id,reason:a.reason});
   next.days.find(d=>d.dayIndex===a.dayIndex).estimatedMinutes=estimatedSessionMinutes(next.days.find(d=>d.dayIndex===a.dayIndex));forkWorkout(s,next);s.lastVolumeChange=clockNow();
  }
  else if(a.kind==='schedule'){if(a.fromDate<currDate||a.toDate<currDate)throw apiError('ADAPTATION_SCHEDULE_DATE_PASSED','Proposed reschedule date has already passed.',{status:400});s.scheduleOverrides||=[];s.scheduleOverrides=s.scheduleOverrides.filter(x=>x.dayIndex!==a.dayIndex);s.scheduleOverrides.push({dayIndex:a.dayIndex,fromDate:a.fromDate,toDate:a.toDate,planId:s.workoutPlan.id});}
  a.status='accepted';a.acceptedAt=isoNow();
 }else throw apiError('UNKNOWN_COMMAND_ACTION','Unsupported command action.',{status:400,params:{action}});
 return s;
}
export function evaluateEligibility(d={}){
 const reasons=[],questions=[];
 const ageNum=Number(d.age),weightNum=Number(d.weight),heightNum=Number(d.height);
 if(d.age==null||!Number.isInteger(ageNum)||ageNum<18){reasons.push({code:'AGE_UNSUPPORTED_OR_MISSING',severity:'requires_review',message:'التخطيط الآلي متاح للبالغين من 18 إلى 70 سنة فقط.'});}
 else if(ageNum>70){reasons.push({code:'SENIOR_REQUIRES_REVIEW',severity:'requires_review',message:'العمر فوق 70 سنة يحتاج تقييمًا فرديًا من متخصص.'});}
 const diseases=Array.isArray(d.diseases)?d.diseases.filter(x=>x&&x!=='none'):[];
 const injuries=Array.isArray(d.injuries)?canonicalInjuries(d.injuries):[];
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
  reviewScope:'system_generated_screening_not_medical_diagnosis',
  reasons,
  questions,
  supportedAdaptations:{
   diseases:diseases.filter(x=>SUPPORTED_WELLNESS_CONDITIONS.has(x)),
   injuries:injuries.filter(x=>SUPPORTED_MILD_INJURIES.has(x))
  },
  permittedFunctions:status==='requires_review'?['browse_food_catalog','browse_exercise_catalog','export_clinical_summary']:['generate_plan','log_execution','adaptive_review'],
  clinicalSummary:status==='requires_review'?{generatedAt:isoNow(),age:Number.isFinite(ageNum)?ageNum:null,weightKg:Number.isFinite(weightNum)?weightNum:null,heightCm:Number.isFinite(heightNum)?heightNum:null,declaredDiseases:diseases,declaredInjuries:injuries,maternalStatus:maternal||'none',note:'ملخص آلي قابل للمشاركة عند استشارة طبيب أو مختص تغذية/علاج طبيعي.'}:null
 };
}
export function progressSummary(s){
 const tz=userTz(s),end=userToday(s),start14=dateOffset(end,-13),mid7=dateOffset(end,-6);
 const w14=[...new Map((s.weights||[]).filter(x=>x.date>=start14&&x.date<=end).map(x=>[x.date,x])).values()];
 const prev7=w14.filter(x=>x.date<mid7),curr7=w14.filter(x=>x.date>=mid7);
 const avg=arr=>arr.length?Math.round(arr.reduce((sum,x)=>sum+x.kg,0)/arr.length*100)/100:null;
 const prevAvg=avg(prev7),currAvg=avg(curr7);
 const weeklyChangePct=prevAvg&&currAvg?Math.round((currAvg-prevAvg)/prevAvg*10000)/100:null;
 const completeFood14=[...new Map((s.foodLogs||[]).filter(x=>x.complete&&x.energy>0&&x.date>=start14&&x.date<=end).map(x=>[x.date,x])).values()].length;
 const sessions14=(s.sessions||[]).filter(x=>x.date>=start14&&x.date<=end);
 const perfDrop=hasPerformanceDrop(s.workoutLogs||[],clockNow(),tz);
 const workoutInsights=workoutProgressionSummary(s.workoutPlan,s.workoutLogs||[],clockNow(),tz);
 const wTarget=dailyWaterTarget(s,end);
 const water14=(s.waterLogs||[]).filter(x=>x.date>=start14&&x.date<=end);
 const todayWater=(s.waterLogs||[]).find(x=>x.date===end);
 return {
  windowStart:start14,
  windowEnd:end,
  timezone:tz,
  reviewScope:'system_generated_guidance',
  weightTrend:{measurements14d:w14.length,previous7dCount:prev7.length,current7dCount:curr7.length,previous7dAvgKg:prevAvg,current7dAvgKg:currAvg,weeklyChangePct,note:'محرك التغذية الآلي بيعتمد على متوسط الأسبوعين مش تذبذب الميزان اليومي.'},
  foodCompleteness:{completeDays14d:completeFood14,requiredDays14d:10,sufficientForCalorieReview:completeFood14>=10&&prev7.length>=3&&curr7.length>=3},
  hydration:{todayCups:todayWater?.cups||0,targetCups:wTarget.targetCups,todayLiters:Math.round((todayWater?.cups||0)*0.25*100)/100,targetLiters:wTarget.liters,isWorkoutDay:wTarget.isWorkoutDay,loggedDays14d:water14.length,adherentDays14d:water14.filter(x=>x.cups>=Math.ceil((x.targetCups||wTarget.targetCups)*0.8)).length},
  hydrationSummary:{todayCups:todayWater?.cups||0,targetCups:wTarget.targetCups,todayLiters:Math.round((todayWater?.cups||0)*0.25*100)/100,targetLiters:wTarget.liters,isWorkoutDay:wTarget.isWorkoutDay,loggedDays14d:water14.length,adherentDays14d:water14.filter(x=>x.cups>=Math.ceil((x.targetCups||wTarget.targetCups)*0.8)).length},
  workoutSummary:{completed14d:sessions14.filter(x=>x.status==='completed').length,partial14d:sessions14.filter(x=>x.status==='partial').length,missed14d:sessions14.filter(x=>x.status==='missed').length,performanceDrop:perfDrop,insights:workoutInsights}
 };
}
