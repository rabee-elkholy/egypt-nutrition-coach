import {scenarioRuntime,independentPlanIssues} from './scenario-http.mjs';
import {library} from '../../server/food.mjs';
const output=process.argv[2];if(!output)throw Error('Usage: gain-ceiling-horizon.mjs <new-output>');
const runtime=await scenarioRuntime(output,'180_DAY_GAIN_TARGET_UPPER_BOUND_AND_REPEATED_RENEWAL_HTTP_HISTORY'),{client,check,report}=runtime;
const c=client('gain-ceiling-history');report.reviews=[];report.accepted=[];report.observations=[];let error;
const healthy={sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false};
try{
 await c.command('generate',{name:'Upper-bound history',age:30,weight:80,height:175,sex:'male',goal:'gain',targetWeight:95,serviceTrack:'nutrition_and_workouts',dietType:'balanced',budget:'medium',selectedWorkoutDays:[1,3,5],healthConfirmed:true});
 const active=()=>c.state.plans.find(p=>p.id===c.state.active_plan_id);
 for(let day=1;day<=180;day++){
  c.day=day;const date=new Date(Date.parse('2026-10-24T12:00:00Z')+(day-1)*86400000).toISOString().slice(0,10);
  if(active().days.at(-1).date<date)await c.command('renew_plan',{});
  const issues=independentPlanIssues(active(),library);check('valid-plan:'+day,issues.length===0,{issues});check('absolute-energy-ceiling:'+day,active().targets.energy<=4200);
  await c.command('weight',{date,kg:80});await c.command('food',{date,energy:active().targets.energy,complete:true});await c.command('recovery',healthy);
  if(day%7===0){
   await c.command('review',{});const n=c.state.lastReview.nutrition;report.reviews.push({day,energy:active().targets.energy,delta:n.delta||0,reasonCode:n.reasonCode,reason:n.reason});
   if(n.reasonCode==='MIN_SAFE_ENERGY_FLOOR_HOLD'&&active().targets.energy+(n.delta||0)>4200)report.observations.push({code:'CEILING_HOLD_MISLABELED_AS_FLOOR',day,energy:active().targets.energy,delta:n.delta});
   if(active().targets.energy+(n.delta||0)>4200)check('upper-bound-explanation:'+day,n.reasonCode==='MAX_SAFE_ENERGY_CEILING_HOLD'&&n.action==='hold');
   const a=c.state.adaptations.find(a=>a.kind==='calories'&&a.status==='pending');
   if(a){const before=active().targets.energy;await c.command('adaptation',{id:a.id,accept:true});report.accepted.push({day,from:before,to:active().targets.energy});check('accepted-target:'+day,active().targets.energy===before+a.delta&&active().targets.energy<=4200);}
  }
  const brief=await c.brief();check('truthful-brief:'+day,brief.status===200&&brief.response.date===date&&brief.response.notes.every(n=>n.deliveryStatus==='NOT_MEASURED'&&n.renderingStatus==='NOT_MEASURED'));
  if(day%60===0)console.log(JSON.stringify({day,energy:active().targets.energy,accepted:report.accepted.length}));
 }
 report.summary={journeys:1,userDays:180,acceptedAdjustments:report.accepted.length,observedProductGaps:report.observations.length};
 report.limitations.push('Constant reported weight despite increases is a deliberate controller-boundary probe, not a physiological prediction.');
}catch(e){error=e;}
finally{await runtime.finish(error);}
