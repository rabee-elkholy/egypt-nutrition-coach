import {clockNow,isoNow,clockDate,clockTimeZone} from './clock.mjs';
import {dateOffset,localDate,needsHealthConfirmation,needsScheduleConfirmation} from '../coaching-shared.mjs';
import {sessionCompletion} from './training-state.mjs';
import {chronologicalExposures} from './recovery.mjs';
import {regionForMuscle,muscleRegions,eachSide,repetitionSeconds} from './workouts.mjs';
export function volumeReview(s,readiness,now=clockNow()){
 const tz=s?.profile?.timezone||clockTimeZone();
 const hold=(reason,reasonCode='VOLUME_HOLD')=>({action:'hold',reasonCode,reviewScope:'system_generated_guidance',reason});
 const plan=s.workoutPlan;
 if(needsHealthConfirmation(s)||needsScheduleConfirmation(s))return hold('محرك التدريب الآلي ينتظر تأكيد الجاهزية الصحية قبل زيادة المجموعات.','HEALTH_OR_SCHEDULE_UNCONFIRMED');
 if(!plan||s.profile.goal!=='muscle_gain')return hold('زيادة المجموعات في المسار الحالي مخصصة لهدف بناء العضلات؛ عدم اقتراح زيادة لا يثبت أن الحجم مثالي.','GOAL_NOT_MUSCLE_GAIN');
 if(readiness.status!=='ready'||!readiness.baselineReady)return hold('محرك التدريب الآلي يتابع استقرار نومك واستشفائك لمدة أسبوع كامل الأول قبل إضافة أي مجموعات جديدة.','RECOVERY_BASELINE_NOT_READY');
 if((s.lastVolumeChange&&now-s.lastVolumeChange<14*86400000)||(s.lastCalorieChange&&now-s.lastCalorieChange<14*86400000))return hold('محرك المتابعة الآلي بيراقب استجابة جسمك لآخر تعديل لمدة أسبوعين قبل إضافة حمل جديد.','COOLDOWN_14D');
 const from=dateOffset(localDate(now,tz),-13),sessions=(s.sessions||[]).filter(x=>(x.planId===plan.id||x.programId===(plan.programId||plan.id))&&x.date>=from&&x.date<=localDate(now,tz)&&x.status==='completed'&&sessionCompletion(s,x).completionRatio>=.8);
 const completed=new Set(sessions.map(x=>x.date));
 if(completed.size<Math.ceil(plan.days.length*2*.8))return hold('محرك التدريب الآلي ينصح بالانتظام في 80% من تمارين الأسبوعين الأول قبل زيادة عدد المجموعات.','INSUFFICIENT_SESSION_ADHERENCE');
 const all=plan.days.flatMap(d=>d.exercises.map(e=>({day:d,exercise:e})));
 for(const {day,exercise}of all){
  const region=exercise.muscles.filter(m=>m.role==='primary').map(m=>regionForMuscle(m.muscle_id)).find(r=>(plan.weeklySets?.[r]||0)>=5&&(plan.weeklySets?.[r]||0)<12);
  if((day.estimatedMinutes||0)+(repetitionSeconds(exercise)+exercise.restSeconds)/60>day.duration)continue;
  if(!region||exercise.sets>=4||muscleRegions(exercise).some(r=>['caution','hold'].includes(readiness.muscles[r]?.status)))continue;
  const exactLogs=s.workoutLogs.filter(l=>(exercise.progressionKey?l.progressionKey===exercise.progressionKey:l.planId===plan.id)&&l.exerciseId===exercise.id);
  const patternLogs=s.workoutLogs.filter(l=>l.planId===plan.id&&plan.days.flatMap(d=>d.exercises).find(x=>x.id===l.exerciseId)?.pattern===exercise.pattern&&l.loadMode===exercise.loadMode);
  const rawComparable=chronologicalExposures(exactLogs,now,14,tz);
  const comparable=(rawComparable.length>=3?rawComparable:chronologicalExposures(patternLogs,now,14,tz)).slice(-3);
  if(eachSide(exercise)&&!comparable.every(l=>l.bothSides===true))continue;
  if(comparable.length<3||!comparable.every(l=>l.sets.length===exercise.sets&&l.sets.every(set=>!set.pain&&set.rir>=exercise.rir&&set.reps>=exercise.repMin)))continue;
  const load=comparable[0].sets[0].kg,total=l=>l.sets.reduce((sum,set)=>sum+set.reps,0);
  if(!comparable.every(l=>l.sets.every(set=>set.kg===load))||Math.max(...comparable.map(total))-Math.min(...comparable.map(total))>1)continue;
  return {action:'propose',reasonCode:'WEEKLY_VOLUME_INCREASE_PROPOSED',reviewScope:'system_generated_guidance',kind:'weekly_volume',planId:plan.id,dayIndex:day.dayIndex,exerciseId:exercise.id,region,extraSets:1,reason:'توصية النظام الآلي للتدريب: لأن أداءك والتزامك في آخر 3 تمرينات كان قوي ومستقر مع استشفاء ممتاز، نقترح إضافة مجموعة واحدة أسبوعياً لتعزيز البناء العضلي.'};
 }
 return hold('توجيه النظام الآلي للتدريب: السجلات المتاحة لا تحقق شروط اقتراح زيادة المجموعات حاليًا؛ استمر في التسجيل لمراجعة الاستجابة.','VOLUME_INCREASE_NOT_JUSTIFIED');
}
