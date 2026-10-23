import {empty,generate,command,dailyWaterTarget} from './coaching.mjs';
import {activePlan,dayTotals} from './food.mjs';
import {scheduledSessions,eachSide} from './workouts.mjs';
import {recovery} from './recovery.mjs';
import {clockDate,clockNow,withClock,simulationTime} from './clock.mjs';
import {localDate,effectiveSets,needsScheduleConfirmation,needsHealthConfirmation} from '../coaching-shared.mjs';

export const SCENARIOS=['consistent','plateau','poor_recovery','missed_workout','low_adherence','pain'];
const sample={name:'شخصية المحاكاة',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,goalPace:'moderate',serviceTrack:'nutrition_and_workouts',dailyActivity:'light',dietType:'balanced',region:'egypt',budget:'medium',mealsCount:4,selectedWorkoutDays:[1,3,5],workoutLocation:'gym_only',fitnessLevel:'beginner',sessionDuration:45,weekdayConvention:'js_sunday_0'};
function draftFromAccount(s){
 if(!s?.profile)throw Error('أكمل بياناتك الفعلية أولًا أو ابدأ بشخصية تجريبية جاهزة.');
 if(needsScheduleConfirmation(s)||needsHealthConfirmation(s))throw Error('أكد تقويمك وجاهزيتك في حسابك الحالي أولًا، أو ابدأ بشخصية تجريبية جاهزة.');
 const p=s.profile,prefs=s.preferences;
 return {...p,...s.onboarding?.workoutPrefs,weekdayConvention:'js_sunday_0',serviceTrack:s.onboarding.serviceTrack,dailyActivity:p.activity,dietType:prefs.diet,region:prefs.region,budget:prefs.budget,mealsCount:prefs.meals,excludedGroups:prefs.excludedGroups,eatingStart:prefs.eatingStart};
}
export function simulationSummary(s){
 const date=clockDate(),food=dayTotals(s,date),sessions=s.sessions.filter(x=>x.date===date),checkin=s.checkins.find(x=>x.date===date),weight=s.weights.find(x=>x.date===date),plan=activePlan(s);
 return {day:s.simulation?.day,date,energy:food.totals.energy,protein:food.totals.protein,foodComplete:food.complete,targetEnergy:food.planEnergy,weight:weight?.kg??null,recovery:recovery(s.checkins,clockNow(),s.workoutLogs).status,recoveryLogged:!!checkin,scheduled:scheduledSessions(s).filter(x=>x.date===date),sessions:sessions.map(x=>({dayIndex:x.dayIndex,status:x.status,completionRatio:x.completionRatio})),review:s.lastReview?.nutrition?.reason??null,changes:s.adaptations.filter(a=>a.status==='accepted'&&localDate(Date.parse(a.acceptedAt))===date).map(a=>a.reason),planId:plan?.id??null,scenario:s.simulation?.scenarioByDate?.[date]??'manual'};
}
export function simulationCommand(input,action,p,source){
 if(action==='simulation_reset'){
  if(input.simulation&&p.confirm!==true)throw Error('أكد بدء جولة جديدة؛ سجلات الجولة الحالية لن تظهر في الجولة الجديدة.');
  if(!['sample','current'].includes(p.source))throw Error('اختار بياناتك الحالية أو الشخصية التجريبية.');
  const next=empty();next.revision=input.revision;
  next.simulation={runId:crypto.randomUUID(),day:1,startedDate:localDate(),source:p.source,history:[],scenarioByDate:{}};
  return withClock(simulationTime(next),()=>generate(next,p.source==='sample'?sample:draftFromAccount(source)));
 }
 if(!input.simulation)throw Error('ابدأ جولة محاكاة أولًا.');
 const s=input;
 if(action==='simulation_next'){
  if(s.simulation.day>=90)throw Error('وصلت لنهاية 90 يومًا في هذه الجولة. ابدأ محاكاة جديدة لتجربة سيناريو آخر.');
  s.simulation.history.push(simulationSummary(s));s.simulation.day++;s.lastReview=null;
  for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';
  return withClock(simulationTime(s),()=>{
   s.simulation.renewalError=null;
   if(activePlan(s)?.days.at(-1).date<clockDate()){
    try{command(s,'renew_plan',{});}catch(error){if(error instanceof TypeError||error instanceof ReferenceError)throw error;s.simulation.renewalError=error.message;}
   }
   return s;
  });
 }
 if(action!=='simulation_fill')return command(s,action,p);
 if(!SCENARIOS.includes(p.scenario))throw Error('سيناريو غير صالح.');
 const date=clockDate();
 if([s.foodLogs,s.weights,s.checkins,s.workoutLogs,s.sessions].some(list=>list.some(x=>x.date===date)))throw Error('في بيانات مسجلة لليوم ده. كمّل يدويًا أو انتقل ليوم جديد لاستخدام التعبئة التجريبية؛ لم نستبدل تسجيلاتك.');
 const poor=p.scenario==='poor_recovery',pain=p.scenario==='pain';
 command(s,'recovery',{sleepHours:poor?5:8,sleepQuality:poor?2:4,fatigue:poor?4:1,stress:poor?4:1,soreness:poor?8:1,pain,illness:false,redFlags:false});
 const goal=s.profile.goal,direction=goal==='lose'?-1:['gain','muscle_gain'].includes(goal)&&!s.profile.recomposition?1:0;
 const change=p.scenario==='plateau'?0:direction*(s.simulation.day-1)*.04;
 command(s,'weight',{date,kg:Math.round(Math.max(35,Math.min(250,s.profile.weight+change))*10)/10});
 const wTarget=dailyWaterTarget(s,date);
 command(s,'water',{date,cups:p.scenario==='low_adherence'?Math.max(3,Math.round(wTarget.targetCups*0.5)):wTarget.targetCups});
 const plan=activePlan(s),day=plan?.days.find(d=>d.date===date);
 if(plan&&!day)throw Error('جدّد خطة الأكل أو راجع بيانات المحاكاة قبل تعبئة اليوم.');
 for(const meal of day?.meals||[])command(s,'food_entry',{date,source:'planned',mealId:meal.id,slot:meal.slot,quantity:p.scenario==='low_adherence'?.6:1});
 if(day)command(s,'food_complete',{date,complete:true});
 for(const occurrence of scheduledSessions(s).filter(x=>x.date===date)){
  const session=s.workoutPlan.days.find(d=>d.dayIndex===occurrence.dayIndex);
  if(p.scenario==='missed_workout'||poor){command(s,'session',{dayIndex:session.dayIndex,date,status:'missed'});continue;}
  const exercises=pain?session.exercises.slice(0,1):session.exercises;
  for(const exercise of exercises){
   const count=pain?1:effectiveSets(s,exercise,date,clockNow());
   command(s,'workout',{exerciseId:exercise.id,dayIndex:session.dayIndex,date,sets:Array.from({length:count},()=>({kg:exercise.loadMode==='bodyweight'?0:20,reps:exercise.repMax,rir:exercise.rir+1,pain})),bothSides:eachSide(exercise),increment:1});
  }
  command(s,'session',{dayIndex:session.dayIndex,date,status:pain?'partial':'completed',duration:pain?5:session.estimatedMinutes,rpe:pain?8:6});
 }
 s.simulation.scenarioByDate[date]=p.scenario;
 return command(s,'review',{});
}
