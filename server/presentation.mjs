import {clockNow,isoNow,withClock,simulationTime} from './clock.mjs';
import {simulationSummary} from './simulation.mjs';
import {assertDietDay} from '../diet-patterns.mjs';
import {nutritionQualityIssues} from '../planner-core.mjs';
import {progressSummary,dailyWaterTarget} from './coaching.mjs';
import {workoutSafetyIssues,scheduledSessions} from './workouts.mjs';
import {accountRecovery} from './recovery.mjs';
import {deriveSyncDeltas} from './store.mjs';
import {dayTotals} from './food.mjs';
import {localDate,needsHealthConfirmation,needsScheduleConfirmation} from '../coaching-shared.mjs';
export const present=s=>withClock(simulationTime(s),()=>{
 const tz=s.profile?.timezone||'Africa/Cairo';
 const currDate=localDate(clockNow(),tz);
 const plan=s.plans.find(p=>p.id===s.active_plan_id),ready=accountRecovery(s,clockNow(),tz),needsHealth=needsHealthConfirmation(s),needsSchedule=needsScheduleConfirmation(s);
 const safety=workoutSafetyIssues(s),dietIssues=[];
 if(plan)for(const day of plan.days){try{assertDietDay(day.meals.map(m=>m.snapshot),s.preferences.diet,day.targets||plan.targets,s.profile);}catch(e){dietIssues.push({date:day.date,message:e.message});}}
 if(safety.length){ready.progressionAllowed=false;if(ready.status!=='stop'){ready.status='hold';ready.reasons=['الخطة القديمة تحتوي تمارين مستبعدة حسب إصابتك. استبدلها أو أعد إنشاء الخطة وراجع مختصًا.'];}}
 return {
  ...s,
  workoutSafetyIssues:safety,
  dietVerificationIssues:dietIssues,
  serverNow:isoNow(),
  serverDate:currDate,
  timezone:tz,
  simulationToday:s.simulation?simulationSummary(s):null,
  eligibility:{needsHealthConfirmation:needsHealth,needsScheduleConfirmation:needsSchedule,status:needsHealth?'needs_health_confirmation':needsSchedule?'needs_schedule_confirmation':'eligible'},
  planQuality:plan?.days.flatMap(d=>nutritionQualityIssues(d.summary,d.targets||plan.targets).map(message=>({date:d.date,message})))||[],
  scheduledSessions:scheduledSessions(s,currDate),
  progressSummary:progressSummary(s),
  recovery:{...ready,progressionAllowed:ready.progressionAllowed&&!needsHealth&&!needsSchedule}
 };
});

export const presentBootstrap=s=>withClock(simulationTime(s),()=>{
 const tz=s.profile?.timezone||'Africa/Cairo';
 const currDate=localDate(clockNow(),tz);
 const plan=s.plans.find(p=>p.id===s.active_plan_id);
 const ready=accountRecovery(s,clockNow(),tz);
 const needsHealth=needsHealthConfirmation(s),needsSchedule=needsScheduleConfirmation(s);
 const safety=workoutSafetyIssues(s);
 const todayDiary=dayTotals(s,currDate);
 const wTarget=dailyWaterTarget(s,currDate);
 const todayWater=(s.waterLogs||[]).find(w=>w.date===currDate);
 const latestWeight=(s.weights||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).at(-1)||null;
 return {
  schemaVersion:s.schemaVersion||3,
  revision:s.revision,
  serverNow:isoNow(),
  serverDate:currDate,
  timezone:tz,
  profile:s.profile,
  preferences:s.preferences,
  eligibility:{needsHealthConfirmation:needsHealth,needsScheduleConfirmation:needsSchedule,status:needsHealth?'needs_health_confirmation':needsSchedule?'needs_schedule_confirmation':'eligible'},
  activeNutritionPlanRef:plan?{id:plan.id,start_date:plan.start_date,end_date:plan.days.at(-1)?.date,effective_from:plan.effective_from,targets:plan.targets}:null,
  activeWorkoutPlanRef:s.workoutPlan?{id:s.workoutPlan.id,version:s.workoutPlan.version,split:s.workoutPlan.split,daysCount:s.workoutPlan.days.length,weeklySets:s.workoutPlan.weeklySets,coverage:s.workoutPlan.coverage}:null,
  todaySummary:{
   date:currDate,
   nutrition:{energy:todayDiary.totals.energy,protein:todayDiary.totals.protein,targetEnergy:todayDiary.planEnergy,complete:todayDiary.complete,entriesCount:todayDiary.entries.length},
   hydration:{cups:todayWater?.cups||0,liters:todayWater?.liters||0,targetCups:wTarget.targetCups,targetLiters:wTarget.liters},
   latestWeight,
   recovery:{status:safety.length?(ready.status==='stop'?'stop':'hold'):ready.status,reasonCode:ready.reasonCode,progressionAllowed:ready.progressionAllowed&&!needsHealth&&!needsSchedule&&!safety.length},
   scheduledWorkout:scheduledSessions(s,currDate,1)[0]||null
  },
  pendingAdaptations:(s.adaptations||[]).filter(a=>a.status==='pending'),
  workoutSafetyIssues:safety,
  entitlements:s.entitlements||{tier:'free',features:['core_nutrition','core_workouts','offline_sync','arabic_food_search']},
  notificationPreferences:s.notificationPreferences
 };
});

export const presentReceipt=(s,action,payload={},replayed=false)=>withClock(simulationTime(s),()=>{
 const tz=s.profile?.timezone||'Africa/Cairo';
 const currDate=localDate(clockNow(),tz);
 const deltas=s._lastReceipt?.affected||deriveSyncDeltas(s,action,payload,isoNow());
 return {
  ok:true,
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
});
