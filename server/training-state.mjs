import {catalog,eachSide,estimatedSessionMinutes} from './workouts.mjs';
import {localDate,effectiveSets} from '../coaching-shared.mjs';
export const prescriptionSignature=e=>[e.id,e.loadMode,e.tracking,e.laterality,e.sets,e.repMin,e.repMax,e.rir,e.restSeconds].join('|');
export function ensureTrainingState(s){
 const p=s.workoutPlan;if(!p)return s;
 p.programId||=p.id;
 for(const d of p.days)for(const e of d.exercises){
  const source=catalog.exercises.find(x=>x.id===e.id);
  if(source&&p.sourceVersion===catalog.manifest.version){e.laterality??=source.laterality;e.supportsAddedWeight??=source.supportsAddedWeight;}
  e.progressionKey||=p.programId+'|'+prescriptionSignature(e);
 }
 for(const day of p.days){
  day.estimatedMinutes=estimatedSessionMinutes(day);
  if(day.estimatedMinutes>(day.duration??s.onboarding?.workoutPrefs?.sessionDuration??45)){
   const warning='حساب وقت خطتك القديمة بعد احتساب الجانبين يتجاوز الوقت المختار؛ راجع بياناتك وجدّد الخطة لتطبيق الميزانية الحالية.';
   p.warnings||=[];if(!p.warnings.includes(warning))p.warnings.push(warning);
  }
 }
 for(const log of s.workoutLogs||[]){
  if(log.planId!==p.id)continue;
  const day=p.days.find(d=>d.dayIndex===log.dayIndex),exercise=(day?.exercises||p.days.flatMap(d=>d.exercises)).find(e=>e.id===log.exerciseId);
  if(exercise&&!log.progressionKey)log.progressionKey=exercise.progressionKey;
 }
 for(const session of s.sessions||[]){
  if(session.planId===p.id&&!session.expectedExercises){
   const day=p.days.find(d=>d.dayIndex===session.dayIndex);if(day)session.expectedExercises=day.exercises.map(e=>({exerciseId:e.id,sets:e.sets,progressionKey:e.progressionKey,requiresBothSides:eachSide(e)}));
   session.programId||=p.programId;
  }
 }
 return s;
}
export function expectedExercises(s,day,date){return day.exercises.map(e=>({exerciseId:e.id,sets:effectiveSets(s,e,date),progressionKey:e.progressionKey,requiresBothSides:eachSide(e)}));}
export function sessionCompletion(s,session){
 const plan=s.workoutPlan;
 const expected=session.expectedExercises||(session.planId===plan?.id?plan.days.find(d=>d.dayIndex===session.dayIndex)?.exercises.map(e=>({exerciseId:e.id,sets:e.sets})):null);
 if(!expected?.length)return {completionRatio:0,expectedSets:0,actualSets:0};
 let actualSets=0,completedSets=0,total=0;
 for(const e of expected){
  total+=e.sets;
  const log=s.workoutLogs.filter(l=>l.date===session.date&&l.dayIndex===session.dayIndex&&l.planId===session.planId&&l.exerciseId===e.exerciseId).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);
  const performed=Math.min(e.sets,log?.sets.length||0);actualSets+=performed;if(!e.requiresBothSides||log?.bothSides===true)completedSets+=performed;
 }
 return {completionRatio:total?completedSets/total:0,expectedSets:total,actualSets,completedSets};
}
export function reconcileSessions(s){
 for(const session of s.sessions||[]){
  const coverage=sessionCompletion(s,session);Object.assign(session,coverage);
  if(session.status==='completed'&&coverage.completionRatio<.8){session.declaredStatus||='completed';session.status=coverage.actualSets?'partial':'missed';}
 }
}
export function forkWorkout(s,next,{oldDayIndexByNew={},carryCalendar=true}={}){
 const previous=s.workoutPlan;next.programId=previous.programId||previous.id;
 for(const day of next.days)for(const e of day.exercises){
  const old=previous.days.find(d=>d.dayIndex===(oldDayIndexByNew[day.dayIndex]??day.dayIndex))?.exercises.find(x=>x.id===e.id&&prescriptionSignature(x)===prescriptionSignature(e));
  e.progressionKey=old?.progressionKey||next.id+'|'+prescriptionSignature(e);
  delete e.suggestedKg;delete e.progressionReason;delete e.suggestionAt;
 }
 // A new prescription version does not cancel a previously accepted calendar move.
 const moved=carryCalendar?(s.scheduleOverrides||[]).filter(o=>o.planId===previous.id&&(o.fromDate>=localDate()||o.toDate>=localDate())):[];
 s.scheduleOverrides=[...(s.scheduleOverrides||[]),...moved.map(o=>({...o,planId:next.id}))];
 s.workoutArchives||=[];s.workoutArchives.push(previous);
 s.workoutPlan=next;s.sessionAdjustment=null;return s;
}
