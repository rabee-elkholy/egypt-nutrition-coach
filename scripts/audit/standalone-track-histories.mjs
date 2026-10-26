import {scenarioRuntime,independentPlanIssues} from './scenario-http.mjs';
import {library} from '../../server/food.mjs';
import {usesKg} from '../../exercise-load.mjs';
const output=process.argv[2];if(!output)throw Error('Usage: standalone-track-histories.mjs <new-output>');
const runtime=await scenarioRuntime(output,'THREE_180_DAY_SINGLE_SERVICE_TRACK_HTTP_HISTORIES'),{client,check,report}=runtime;
report.journeys=[];let error;
const base={name:'Standalone track',age:35,weight:80,height:175,sex:'male',goal:'maintain',dailyActivity:'light',dietType:'balanced',budget:'medium',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const healthy={sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false};
const specs=[{id:'nutrition-muscle-gain',draft:{...base,serviceTrack:'nutrition_only',goal:'muscle_gain',targetWeight:90,externalTrainingDays:[1,3,5]}},{id:'nutrition-dash-hypertension',draft:{...base,serviceTrack:'nutrition_only',dietType:'dash',region:'gulf',diseases:['hypertension']}},{id:'workouts-low-budget-keto',draft:{...base,serviceTrack:'workouts_only',dietType:'keto',budget:'low'}}];
try{
 for(const spec of specs){
  const c=client(spec.id),entry={id:spec.id,days:180,workoutExposures:0,reviewCodes:{}};report.journeys.push(entry);await c.command('generate',spec.draft);
  for(let day=1;day<=180;day++){
   c.day=day;const date=new Date(Date.parse('2026-10-24T12:00:00Z')+(day-1)*86400000).toISOString().slice(0,10);
   let plan=c.state.plans.find(p=>p.id===c.state.active_plan_id);
   if(plan){
    if(plan.days.at(-1).date<date){await c.command('renew_plan',{});plan=c.state.plans.find(p=>p.id===c.state.active_plan_id);}
    const issues=independentPlanIssues(plan,library);check(spec.id+':source-and-targets:'+day,issues.length===0,{issues});
    if(spec.id==='nutrition-dash-hypertension')check(spec.id+':measured-sodium:'+day,plan.days.every(d=>d.meals.every(m=>m.snapshot.values.sodium!=null)&&Number(d.summary.values.sodium)<=2300));
    await c.command('food',{date,energy:plan.days.find(d=>d.date===date)?.targets.energy||plan.targets.energy,complete:true});
   }
   await c.command('weight',{date,kg:spec.id==='nutrition-muscle-gain'?Math.round((80+(day-1)*.02)*100)/100:80});
   await c.command('recovery',healthy);await c.command('water',{date,cups:7});
   if(c.state.workoutPlan){
    const scheduled=c.state.scheduledSessions?.find(s=>s.date===date),trainingDay=c.state.workoutPlan.days.find(d=>d.dayIndex===scheduled?.dayIndex);
    if(trainingDay){
     const exercise=trainingDay.exercises[0];await c.command('workout',{date,dayIndex:trainingDay.dayIndex,exerciseId:exercise.id,bothSides:true,increment:1,autoSession:true,sets:Array.from({length:exercise.sets},()=>({kg:usesKg(exercise)?20:0,reps:exercise.repMin,rir:3,pain:false}))});entry.workoutExposures++;
    }
   }
   if(day%14===0){await c.command('review',{});const reason=c.state.lastReview.nutrition.reasonCode;entry.reviewCodes[reason]=(entry.reviewCodes[reason]||0)+1;if(spec.draft.serviceTrack==='workouts_only')check(spec.id+':no-nutrition-adjustment:'+day,reason==='WORKOUTS_ONLY_TRACK'&&!c.state.adaptations.some(a=>a.status==='pending'&&['calories','maintenance'].includes(a.kind)));}
   const brief=await c.brief(),roles=brief.response.notes.map(n=>n.role);
   check(spec.id+':correct-service-and-factual-envelope:'+day,brief.status===200&&brief.response.date===date&&brief.response.notes.every(n=>n.deliveryStatus==='NOT_MEASURED'&&n.renderingStatus==='NOT_MEASURED')&&(spec.draft.serviceTrack==='nutrition_only'?!roles.includes('training')&&!c.state.workoutPlan:!roles.includes('nutrition')&&!c.state.active_plan_id));
   if(day%90===0)console.log(JSON.stringify({id:spec.id,day,workoutExposures:entry.workoutExposures}));
  }
  await c.request('GET','state');check(spec.id+':180-days-retained',c.state.weights.length===180&&c.state.waterLogs.length===180&&c.state.checkins.length===180);
 }
 report.summary={journeys:specs.length,userDays:540,workoutExposures:report.journeys.reduce((n,j)=>n+j.workoutExposures,0)};
 report.limitations.push('Standalone tracks and declared outside-training days are explicit synthetic inputs; no real mobile, clinical or delivery claim.');
}catch(e){error=e;}
finally{await runtime.finish(error);}
