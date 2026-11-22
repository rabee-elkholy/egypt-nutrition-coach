import {clockNow,isoNow} from './clock.mjs';
import {assertDietDay} from '../diet-patterns.mjs';
import {nutritionQualityIssues} from '../planner-core.mjs';
import {progressSummary,dailyWaterTarget} from './coaching.mjs';
import {workoutSafetyIssues,scheduledSessions} from './workouts.mjs';
import {accountRecovery} from './recovery.mjs';
import {deriveSyncDeltas} from './store.mjs';
import {dayTotals} from './food.mjs';
import {getFastingState} from './nutrition-tools.mjs';
import {todayCardioSummary,bootstrapCycleSummary} from './wellness-tools.mjs';
import {computeStreakAndEngagement} from './progress-analytics.mjs';
import {coachingInbox} from '../coaching-journey.mjs';
import {localDate,needsHealthConfirmation,needsScheduleConfirmation} from '../coaching-shared.mjs';

export const present=s=>{
 const tz=s.profile?.timezone||'Africa/Cairo';
 const currDate=localDate(clockNow(),tz);
 const plan=s.plans.find(p=>p.id===s.active_plan_id),ready=accountRecovery(s,clockNow(),tz),needsHealth=needsHealthConfirmation(s),needsSchedule=needsScheduleConfirmation(s);
 const safety=workoutSafetyIssues(s),dietIssues=[];
 if(plan)for(const day of plan.days){try{assertDietDay(day.meals.map(m=>m.snapshot),s.preferences.diet,day.targets||plan.targets,s.profile);}catch(e){dietIssues.push({date:day.date,message:e.message});}}
 if(safety.length){ready.progressionAllowed=false;if(ready.status!=='stop'){ready.status='hold';ready.reasonCode='WORKOUT_SAFETY_EXCLUSION_HOLD';ready.reasons=['Your current workout plan contains movements excluded for your declared injuries; swap them or regenerate your plan before progressing.'];}}
 return {
  ...s,
  workoutSafetyIssues:safety,
  dietVerificationIssues:dietIssues,
  serverNow:isoNow(),
  serverDate:currDate,
  timezone:tz,
  eligibility:{needsHealthConfirmation:needsHealth,needsScheduleConfirmation:needsSchedule,status:needsHealth?'needs_health_confirmation':needsSchedule?'needs_schedule_confirmation':'eligible'},
  planQuality:plan?.days.flatMap(d=>nutritionQualityIssues(d.summary,d.targets||plan.targets).map(message=>({date:d.date,message})))||[],
  scheduledSessions:scheduledSessions(s,currDate),
  progressSummary:progressSummary(s),
  recovery:{...ready,progressionAllowed:ready.progressionAllowed&&!needsHealth&&!needsSchedule}
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
 const needsHealth=needsHealthConfirmation(s),needsSchedule=needsScheduleConfirmation(s);
 const safety=workoutSafetyIssues(s);
 const todayDiary=dayTotals(s,currDate);
 const wTarget=dailyWaterTarget(s,currDate);
 const todayWater=(s.waterLogs||[]).find(w=>w.date===currDate);
 const latestWeight=(s.weights||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;
 const todayActivity=selectPrimaryTodayActivity(s.activityLogs,currDate);
 const upcoming14=scheduledSessions(s,currDate,14);
 const todaySched=upcoming14.find(x=>x.date===currDate)||null;
 const todaySess=(s.sessions||[]).find(x=>x.date===currDate)||null;
 const {streakSummary,engagementState}=computeStreakAndEngagement(s,clockNow());
 const inbox=coachingInbox(s,clockNow());
 const unreadCoachingInboxCount=inbox.items.filter(c=>c.readStatus!=='ACKNOWLEDGED').length;
 const hydratedProfile=s.profile?{...s.profile,unitSystem:s.profile.unitSystem||'metric',...(extras.signedAvatarUrl!==undefined?{avatarUrl:extras.signedAvatarUrl}:{})}:null;
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
  preferences:s.preferences?{...s.preferences,unitSystem:s.profile?.unitSystem||'metric'}:null,
  consents:extras.consents||[],
  eligibility:{needsHealthConfirmation:needsHealth,needsScheduleConfirmation:needsSchedule,status:needsHealth?'needs_health_confirmation':needsSchedule?'needs_schedule_confirmation':'eligible'},
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
    targetEnergy:todayDiary.planEnergy,
    targetProtein:dayTargets?.protein??null,
    targetCarbs:dayTargets?.carbs??null,
    targetFat:dayTargets?.fat??null,
    complete:todayDiary.complete,
    entriesCount:todayDiary.entries.length
   },
   hydration:{cups:todayWater?.cups||0,liters:todayWater?.liters||0,targetCups:wTarget.targetCups,targetLiters:wTarget.liters},
   activity:todayActivity?{steps:todayActivity.steps,activeEnergyKcal:todayActivity.activeEnergyKcal,source:todayActivity.source,updatedAt:todayActivity.at||null}:null,
   cardio:todayCardioSummary(s,currDate),
   latestWeight,
   fastingState:getFastingState(s,clockNow()),
   ramadanMode:s.ramadanMode||{enabled:false,iftarTime:'18:05',suhoorCutoffTime:'04:20',workoutTiming:'post_iftar',medicalClearanceAcknowledged:false,endDate:null},
   cycleState:bootstrapCycleSummary(s,clockNow()),
   recovery:{status:safety.length?(ready.status==='stop'?'stop':'hold'):ready.status,reasonCode:safety.length&&ready.status!=='stop'?'WORKOUT_SAFETY_EXCLUSION_HOLD':ready.reasonCode,progressionAllowed:ready.progressionAllowed&&!needsHealth&&!needsSchedule&&!safety.length},
   scheduledWorkout:todaySched?{...todaySched,status:todaySess?.status||'scheduled'}:null
  },
  streakSummary,
  engagementState,
  unreadCoachingInboxCount,
  pendingAdaptations:(s.adaptations||[]).filter(a=>a.status==='pending'),
  workoutSafetyIssues:safety,
  entitlements:extras.entitlements||s.entitlements||{tier:'free',status:'none',features:['core_nutrition','core_workouts','offline_sync','arabic_food_search','pantry_finder','ramadan_fasting']},
  notificationPreferences:s.notificationPreferences
 };
};

export const presentReceipt=(s,action,payload={},replayed=false)=>{
 const tz=s.profile?.timezone||'Africa/Cairo';
 const currDate=localDate(clockNow(),tz);
 const deltas=s._lastReceipt?.affected||deriveSyncDeltas(s,action,payload,isoNow());
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
  affected:deltas
 };
};
