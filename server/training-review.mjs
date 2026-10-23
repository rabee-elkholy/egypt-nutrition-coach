import {dateOffset,localDate} from '../coaching-shared.mjs';
import {regionForMuscle} from './workouts.mjs';
export function volumeReview(s,readiness,now=Date.now()){
 const hold=reason=>({action:'hold',reason});const plan=s.workoutPlan;
 if(!plan||s.profile.goal!=='muscle_gain')return hold('زيادة حجم التمرين مش مطلوبة تلقائيًا لهدفك الحالي.');
 if(readiness.status!=='ready'||!readiness.baselineReady)return hold('نحتاج استشفاء مستقر وخط أساس من 7 متابعات سابقة قبل زيادة المجموعات.');
 if((s.lastVolumeChange&&now-s.lastVolumeChange<14*86400000)||(s.lastCalorieChange&&now-s.lastCalorieChange<14*86400000))return hold('بنراقب نتيجة آخر تعديل لمدة أسبوعين قبل تغيير الحجم.');
 const from=dateOffset(localDate(now),-13),sessions=(s.sessions||[]).filter(x=>x.planId===plan.id&&x.date>=from&&x.date<=localDate(now)&&x.status==='completed');
 const completed=new Set(sessions.map(x=>x.date));
 if(completed.size<Math.ceil(plan.days.length*2*.8))return hold('نحتاج التزامًا بـ80% من جلسات أسبوعين قبل زيادة المجموعات.');
 const all=plan.days.flatMap(d=>d.exercises.map(e=>({day:d,exercise:e})));
 for(const {day,exercise}of all){
  const region=exercise.muscles.filter(m=>m.role==='primary').map(m=>regionForMuscle(m.muscle_id)).find(r=>(plan.weeklySets?.[r]||0)>=5&&(plan.weeklySets?.[r]||0)<12);
  if((day.estimatedMinutes||0)+(exercise.repMax*3+exercise.restSeconds)/60>day.duration)continue;
  if(!region||exercise.sets>=4||['caution','hold'].includes(readiness.muscles[region]?.status))continue;
  const comparable=[...new Map(s.workoutLogs.filter(l=>l.planId===plan.id&&l.exerciseId===exercise.id&&l.date>=from).map(l=>[l.date,l])).values()].slice(-3);
  if(comparable.length<3||!comparable.every(l=>l.sets.length===exercise.sets&&l.sets.every(set=>!set.pain&&set.rir>=exercise.rir&&set.reps>=exercise.repMin)))continue;
  const load=comparable[0].sets[0].kg,total=l=>l.sets.reduce((sum,set)=>sum+set.reps,0);
  if(!comparable.every(l=>l.sets.every(set=>set.kg===load))||Math.max(...comparable.map(total))-Math.min(...comparable.map(total))>1)continue;
  // Add one weekly set, <=20% of direct weekly sets, after stable performance.
  return {action:'propose',kind:'weekly_volume',planId:plan.id,dayIndex:day.dayIndex,exerciseId:exercise.id,region,extraSets:1,reason:'أداء ثابت في 3 جلسات قابلة للمقارنة، التزام جيد واستشفاء مستقر؛ نقترح مجموعة إضافية واحدة في الأسبوع للعضلة، بموافقتك.'};
 }
 return hold('الحجم الحالي مناسب للمتابعة؛ مفيش بيانات كافية تثبت احتياج زيادة أسبوعية.');
}
