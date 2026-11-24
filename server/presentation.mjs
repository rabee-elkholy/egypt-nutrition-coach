import {clockNow,isoNow} from './clock.mjs';
import {assertDietDay} from '../diet-patterns.mjs';
import {nutritionQualityIssues} from '../planner-core.mjs';
import {progressSummary,dailyWaterTarget} from './coaching.mjs';
import {workoutSafetyIssues,scheduledSessions} from './workouts.mjs';
import {accountRecovery} from './recovery.mjs';
import {deriveSyncDeltas} from './store.mjs';
import {dayTotals} from './food.mjs';
import {getFastingState} from './nutrition-tools.mjs';
import {todayCardioSummary,bootstrapCycleSummary,dailyCardioMinutes} from './wellness-tools.mjs';
import {computeStreakAndEngagement} from './progress-analytics.mjs';
import {coachingInbox} from '../coaching-journey.mjs';
import {FREE_FEATURES} from './subscriptions.mjs';
import {localDate,needsHealthConfirmation,hasActiveParqRedFlag,needsScheduleConfirmation,isPregnantStatus,effectiveProfileWithLiveAge} from '../coaching-shared.mjs';

function buildEligibilityStatusBlock(needsHealth,parqBlocked,needsSchedule){
 const reasons=[];
 const reasonCodes=[];
 if(parqBlocked){
  reasonCodes.push('PARQ_CLEARANCE_REQUIRED');
  reasons.push('Physician clearance is required before workout planning after a positive PAR-Q screening response.');
 }
 if(needsHealth){
  reasonCodes.push('HEALTH_CONFIRMATION_REQUIRED');
  reasons.push('Confirm health readiness clearance before starting workouts.');
 }
 if(needsSchedule){
  reasonCodes.push('SCHEDULE_CONFIRMATION_REQUIRED');
  reasons.push('Confirm your weekly workout days before CuraFit Specialist Team reviews run.');
 }
 return {
  needsHealthConfirmation:needsHealth,
  parqClearanceRequired:parqBlocked,
  needsScheduleConfirmation:needsSchedule,
  status:parqBlocked?'requires_review':needsHealth?'needs_health_confirmation':needsSchedule?'needs_schedule_confirmation':'eligible',
  eligibilityReasons:reasons,
  eligibilityReasonCodes:reasonCodes
 };
}

export const present=s=>{
 const tz=s.profile?.timezone||'Africa/Cairo';
 const currDate=localDate(clockNow(),tz);
 const liveProfile=effectiveProfileWithLiveAge(s.profile,currDate);
 const resolvedUnitSystem=liveProfile?.unitSystem||liveProfile?.unit_system||'metric';
 const resolvedRegion=s.preferences?.region||liveProfile?.region||liveProfile?.region_id||'egypt';
 const hydratedProfile=liveProfile?{...liveProfile,unitSystem:resolvedUnitSystem,unit_system:resolvedUnitSystem,region:resolvedRegion,region_id:resolvedRegion}:null;
 const hydratedPrefs=s.preferences?{...s.preferences,region:resolvedRegion,region_id:resolvedRegion,unitSystem:resolvedUnitSystem,unit_system:resolvedUnitSystem}:null;
 const liveState=liveProfile===s.profile?s:{...s,profile:liveProfile};
 const plan=s.plans.find(p=>p.id===s.active_plan_id),ready=accountRecovery(s,clockNow(),tz),needsHealth=needsHealthConfirmation(s),parqBlocked=hasActiveParqRedFlag(s),needsSchedule=needsScheduleConfirmation(s);
 const safety=workoutSafetyIssues(liveState),dietIssues=[];
 if(plan)for(const day of plan.days){try{assertDietDay(day.meals.map(m=>m.snapshot),s.preferences.diet,day.targets||plan.targets,liveProfile);}catch(e){dietIssues.push({date:day.date,message:e.message});}}
 if(safety.length){ready.progressionAllowed=false;if(ready.status!=='stop'){ready.status='hold';ready.reasonCode='WORKOUT_SAFETY_EXCLUSION_HOLD';ready.reasons=['Your current workout plan contains movements excluded for your declared injuries; swap them or regenerate your plan before progressing.'];}}
 const calibrationMetadata=s.lastReview?.calibrationMetadata||plan?.calibrationMetadata||s.lastCalibrationMetadata||null;
 return {
  ...s,
  ...(hydratedProfile?{profile:hydratedProfile}:{}),
  ...(hydratedPrefs?{preferences:hydratedPrefs}:{}),
  workoutSafetyIssues:safety,
  dietVerificationIssues:dietIssues,
  serverNow:isoNow(),
  serverDate:currDate,
  timezone:tz,
  eligibility:buildEligibilityStatusBlock(needsHealth,parqBlocked,needsSchedule),
  ...(calibrationMetadata?{calibrationMetadata}:{}),
  planQuality:plan?.days.flatMap(d=>nutritionQualityIssues(d.summary,d.targets||plan.targets).map(message=>({date:d.date,message})))||[],
  scheduledSessions:scheduledSessions(s,currDate),
  progressSummary:progressSummary(s),
  recovery:{...ready,progressionAllowed:ready.progressionAllowed&&!parqBlocked&&!needsHealth&&!needsSchedule}
 };
};

function selectPrimaryTodayActivity(logs, currDate) {
 const todayLogs = (logs || []).filter(a => a.date === currDate);
 if (!todayLogs.length) return null;
 const wearables = todayLogs.filter(a => a.source && a.source !== 'manual');
 const manuals = todayLogs.filter(a => !a.source || a.source === 'manual');
 const latestWearable = wearables.at(-1) || null;
 const latestManual = manuals.at(-1) || null;
 if (!latestWearable) return latestManual;
 if (!latestManual) return latestWearable;
 const wAt = Date.parse(latestWearable.at || '') || 0;
 const mAt = Date.parse(latestManual.at || '') || 0;
 if (mAt > wAt && Number(latestManual.steps || 0) > Number(latestWearable.steps || 0)) return latestManual;
 return latestWearable;
}

export const presentBootstrap=(s,extras={})=>{
 const tz=s.profile?.timezone||'Africa/Cairo';
 const currDate=localDate(clockNow(),tz);
 const plan=s.plans.find(p=>p.id===s.active_plan_id);
 const planDay=plan?.days?.find(d=>d.date===currDate);
 const dayTargets=planDay?.targets||plan?.targets||null;
 const ready=accountRecovery(s,clockNow(),tz);
 const needsHealth=needsHealthConfirmation(s),parqBlocked=hasActiveParqRedFlag(s),needsSchedule=needsScheduleConfirmation(s);
 const liveProfile=effectiveProfileWithLiveAge(s.profile,currDate);
 const liveState=liveProfile===s.profile?s:{...s,profile:liveProfile};
 const safety=workoutSafetyIssues(liveState);
 const todayDiary=dayTotals(s,currDate);
 const wTarget=dailyWaterTarget(s,currDate);
 const todayWater=(s.waterLogs||[]).find(w=>w.date===currDate);
 const latestWeight=(s.weights||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;
 const todayActivity=selectPrimaryTodayActivity(s.activityLogs,currDate);
 const upcoming14=scheduledSessions(s,currDate,14);
 const todaySched=upcoming14.find(x=>x.date===currDate)||null;
 const todaySess=(s.sessions||[]).find(x=>x.date===currDate)||null;
 const {streakSummary,engagementState}=computeStreakAndEngagement(s,clockNow());
 const inbox=coachingInbox(s,clockNow(),{pushConfigured:Boolean(extras.pushConfigured)});
 const unreadCoachingInboxCount=inbox.items.filter(c=>c.readStatus!=='ACKNOWLEDGED').length;
 const resolvedUnitSystem=liveProfile?.unitSystem||liveProfile?.unit_system||'metric';
 const resolvedRegion=s.preferences?.region||liveProfile?.region||liveProfile?.region_id||'egypt';
 const hydratedProfile=liveProfile?{...liveProfile,unitSystem:resolvedUnitSystem,unit_system:resolvedUnitSystem,region:resolvedRegion,region_id:resolvedRegion,...(extras.signedAvatarUrl!==undefined?{avatarUrl:extras.signedAvatarUrl}:{})}:null;
 const fastingState=getFastingState(s,clockNow());
 const cardioMins=dailyCardioMinutes(s,currDate);
 const isCardioHydrationDay=!wTarget.isWorkoutDay&&cardioMins>=30;
 const hydrationBoostMl=(wTarget.isWorkoutDay||isCardioHydrationDay)?500:0;
 const hydrationBoostReason=wTarget.isWorkoutDay?'workout':isCardioHydrationDay?'cardio':'none';
 const mat=s.profile?.maternalStatus||'none';
 const maternalContext=mat!=='none'?{
  status:mat,
  themeToken:'maternal_warm',
  extraKcal:mat==='pregnant_t2'?340:mat==='pregnant_t3'?450:mat==='breastfeeding'?400:0,
  safetyMode:true
 }:null;
 const calibrationMetadata=s.lastReview?.calibrationMetadata||plan?.calibrationMetadata||s.lastCalibrationMetadata||null;
 return {
  schemaVersion:s.schemaVersion||3,
  revision:s.revision,
  serverNow:isoNow(),
  serverDate:currDate,
  timezone:tz,
  onboardingCompleted:Boolean(s.profile),
  serviceTrack:s.onboarding?.serviceTrack||null,
  onboarding:s.onboarding?{
   serviceTrack:s.onboarding.serviceTrack,
   journeyStartedOn:s.onboarding.journeyStartedOn||null,
   workoutUiMode:s.profile?.workoutUiMode||'simple',
   workoutPrefs:s.onboarding.workoutPrefs||null
  }:null,
  profile:hydratedProfile,
  preferences:s.preferences?{...s.preferences,region:resolvedRegion,region_id:resolvedRegion,unitSystem:resolvedUnitSystem,unit_system:resolvedUnitSystem}:null,
  consents:extras.consents||[],
  eligibility:buildEligibilityStatusBlock(needsHealth,parqBlocked,needsSchedule),
  ...(calibrationMetadata?{calibrationMetadata}:{}),
  activeNutritionPlanRef:plan?{id:plan.id,start_date:plan.start_date,end_date:plan.days.at(-1)?.date,effective_from:plan.effective_from,targets:plan.targets}:null,
  activeWorkoutPlanRef:s.workoutPlan?{id:s.workoutPlan.id,version:s.workoutPlan.version,split:s.workoutPlan.split,daysCount:s.workoutPlan.days.length,weeklySets:s.workoutPlan.weeklySets,coverage:s.workoutPlan.coverage}:null,
  scheduledSessions:upcoming14,
  todaySummary:{
   date:currDate,
   nutrition:{
    energy:todayDiary.totals.energy,
    protein:todayDiary.totals.protein,
    carbs:todayDiary.totals.carbs,
    fat:todayDiary.totals.fat,
    targetEnergy:fastingState.seasonalContext?.maintenanceTargetKcal??todayDiary.planEnergy,
    basePlanEnergy:todayDiary.planEnergy,
    targetProtein:dayTargets?.protein??null,
    targetCarbs:dayTargets?.carbs??null,
    targetFat:dayTargets?.fat??null,
    complete:todayDiary.complete,
    entriesCount:todayDiary.entries.length
   },
   hydration:{cups:todayWater?.cups||0,liters:todayWater?.liters||0,targetCups:wTarget.targetCups,targetLiters:wTarget.liters,boostMl:hydrationBoostMl,boostReason:hydrationBoostReason,region:resolvedRegion,region_id:resolvedRegion,bonuses:wTarget.bonuses},
   activity:todayActivity?{steps:todayActivity.steps,activeEnergyKcal:todayActivity.activeEnergyKcal,source:todayActivity.source,updatedAt:todayActivity.at||null}:null,
   cardio:todayCardioSummary(s,currDate),
   latestWeight,
   fastingState,
   ramadanMode:fastingState.ramadanMode,
   seasonalContext:fastingState.seasonalContext,
   cycleState:bootstrapCycleSummary(s,clockNow()),
   maternalContext,
   recovery:{status:safety.length?(ready.status==='stop'?'stop':'hold'):ready.status,reasonCode:safety.length&&ready.status!=='stop'?'WORKOUT_SAFETY_EXCLUSION_HOLD':ready.reasonCode,progressionAllowed:ready.progressionAllowed&&!parqBlocked&&!needsHealth&&!needsSchedule&&!safety.length},
   scheduledWorkout:todaySched?{...todaySched,status:todaySess?.status||'scheduled'}:null
  },
  streakSummary,
  engagementState,
  weeklyCheckinDue:Boolean(engagementState.weeklyCheckinDue),
  unreadCoachingInboxCount,
  pendingAdaptations:(s.adaptations||[]).filter(a=>a.status==='pending'),
  workoutSafetyIssues:safety,
  entitlements:extras.entitlements||s.entitlements||{tier:'free',status:'none',features:[...FREE_FEATURES]},
  notificationPreferences:s.notificationPreferences
 };
};

export const presentReceipt=(s,action,payload={},replayed=false)=>{
 const tz=s.profile?.timezone||'Africa/Cairo';
 const currDate=localDate(clockNow(),tz);
 const deltas=s._lastReceipt?.affected||deriveSyncDeltas(s,action,payload,isoNow());
 const calibrationMetadata=['generate','review','renew_plan','comeback_restart','adaptation'].includes(action)
  ?(s.lastReview?.calibrationMetadata||s.lastCalibrationMetadata||null)
  :null;
 return {
  revision:s.revision,
  serverNow:isoNow(),
  serverDate:currDate,
  timezone:tz,
  commandReceipt:{
   revision:s.revision,
   action,
   replayed,
   at:s._lastReceipt?.at||isoNow()
  },
  ...(calibrationMetadata?{calibrationMetadata}:{}),
  affected:deltas
 };
};
