import {clockNow,isoNow,clockDate,clockTimeZone} from './clock.mjs';
import {dateOffset,localDate,needsHealthConfirmation,needsScheduleConfirmation} from '../coaching-shared.mjs';
import {sessionCompletion,workingSetsOf} from './training-state.mjs';
import {chronologicalExposures} from './recovery.mjs';
import {regionForMuscle,muscleRegions,eachSide,repetitionSeconds} from './workouts.mjs';
import {usesKg} from '../exercise-load.mjs';
export function volumeReview(s,readiness,now=clockNow()){
 const tz=s?.profile?.timezone||clockTimeZone();
 const hold=(reason,reasonCode='VOLUME_HOLD')=>({action:'hold',reasonCode,reviewScope:'system_generated_guidance',reason});
 const plan=s.workoutPlan;
 if(needsHealthConfirmation(s)||needsScheduleConfirmation(s))return hold('Confirm health readiness and workout schedule before volume progression is evaluated.','HEALTH_OR_SCHEDULE_UNCONFIRMED');
 if(!plan||s.profile.goal!=='muscle_gain')return hold('Progressive weekly set increases apply to muscle-gain plans; holding volume does not mean your current training is insufficient.','GOAL_NOT_MUSCLE_GAIN');
 if(readiness.status!=='ready'||!readiness.baselineReady)return hold('At least 7 valid recovery check-ins are needed to establish a baseline before proposing extra weekly sets.','RECOVERY_BASELINE_NOT_READY');
 if((s.lastVolumeChange&&now-s.lastVolumeChange<14*86400000)||(s.lastCalorieChange&&now-s.lastCalorieChange<14*86400000))return hold('Monitoring your response to the last adjustment; at least 14 days are required before proposing another volume change.','COOLDOWN_14D');
 const from=dateOffset(localDate(now,tz),-13),sessions=(s.sessions||[]).filter(x=>(x.planId===plan.id||x.programId===(plan.programId||plan.id))&&x.date>=from&&x.date<=localDate(now,tz)&&x.status==='completed'&&sessionCompletion(s,x).completionRatio>=.8);
 const completed=new Set(sessions.map(x=>x.date));
 if(completed.size<Math.ceil(plan.days.length*2*.8))return hold('Complete at least 80% of scheduled sessions over the past 2 weeks before adding weekly volume.','INSUFFICIENT_SESSION_ADHERENCE');
 const all=plan.days.flatMap(d=>d.exercises.map(e=>({day:d,exercise:e})));
 for(const {day,exercise}of all){
  const region=exercise.muscles.filter(m=>m.role==='primary').map(m=>regionForMuscle(m.muscle_id)).find(r=>(plan.weeklySets?.[r]||0)>=5&&(plan.weeklySets?.[r]||0)<12);
  if((day.estimatedMinutes||0)+(repetitionSeconds(exercise)+exercise.restSeconds)/60>day.duration)continue;
  if(!region||exercise.sets>=4||muscleRegions(exercise).some(r=>['caution','hold'].includes(readiness.muscles[r]?.status)))continue;
  const isWeighted=usesKg(exercise);
  const validLog=l=>{
   if(l.adHoc)return false;
   if(l.entryMode==='simple'&&isWeighted)return false;
   const ws=workingSetsOf(l.sets);
   if(!ws.length)return false;
   if(isWeighted&&ws.every(set=>Number(set.kg||0)===0))return false;
   return true;
  };
  const exactLogs=s.workoutLogs.filter(l=>validLog(l)&&(exercise.progressionKey?l.progressionKey===exercise.progressionKey:l.planId===plan.id)&&l.exerciseId===exercise.id);
  const patternLogs=s.workoutLogs.filter(l=>validLog(l)&&l.planId===plan.id&&plan.days.flatMap(d=>d.exercises).find(x=>x.id===l.exerciseId)?.pattern===exercise.pattern&&l.loadMode===exercise.loadMode);
  const rawComparable=chronologicalExposures(exactLogs,now,14,tz);
  const comparable=(rawComparable.length>=3?rawComparable:chronologicalExposures(patternLogs,now,14,tz)).slice(-3);
  if(eachSide(exercise)&&!comparable.every(l=>l.bothSides===true))continue;
  if(comparable.length<3||!comparable.every(l=>{const ws=workingSetsOf(l.sets);return ws.length>=exercise.sets&&ws.every(set=>!set.pain&&set.rir!=null&&set.rir>=exercise.rir&&set.reps>=exercise.repMin);}))continue;
  const load=workingSetsOf(comparable[0].sets)[0].kg,total=l=>workingSetsOf(l.sets).reduce((sum,set)=>sum+set.reps,0);
  if(!comparable.every(l=>workingSetsOf(l.sets).every(set=>set.kg===load))||Math.max(...comparable.map(total))-Math.min(...comparable.map(total))>1)continue;
  return {action:'propose',reasonCode:'WEEKLY_VOLUME_INCREASE_PROPOSED',reviewScope:'system_generated_guidance',kind:'weekly_volume',planId:plan.id,dayIndex:day.dayIndex,exerciseId:exercise.id,region,extraSets:1,reason:'Strong adherence and stable performance over the last 3 exposures support adding +1 weekly set for muscle growth.'};
 }
 return hold('Current workout logs do not yet meet criteria for adding weekly volume; continue consistent logging.','VOLUME_INCREASE_NOT_JUSTIFIED');
}
