import {scenarioRuntime,independentPlanIssues} from './scenario-http.mjs';
import {library} from '../../server/food.mjs';

const output=process.argv[2];if(!output)throw Error('Usage: progress-decisions.mjs <new-output>');
const runtime=await scenarioRuntime(output,'MATCHED_42_DAY_PROGRESS_AND_ACCUMULATED_DECISION_HTTP_JOURNEYS');
const {client,check,report,db}=runtime;report.trajectories=[];report.observations=[];
const draft={name:'Matched trajectory',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:65,serviceTrack:'nutrition_and_workouts',dietType:'balanced',budget:'medium',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const cases=[{id:'on-track',slope:-.06},{id:'plateau',slope:0,accept:true},{id:'regression',slope:.06,reject:true},{id:'rapid-loss',slope:-.17,accept:true},{id:'sparse-evidence',slope:0,sparse:true},{id:'poor-recovery',slope:0,poor:true}];
const dateFor=day=>new Date(Date.parse('2026-10-24T12:00:00Z')+(day-1)*86400000).toISOString().slice(0,10);
const active=s=>s.plans.find(p=>p.id===s.active_plan_id);
const pending=s=>s.adaptations.filter(a=>a.status==='pending');
const healthy={sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false};
let error;
try{
 for(const spec of cases){
  const c=client('trajectory-'+spec.id),entry={id:spec.id,days:42,reviews:[],decisions:[],briefs:0};report.trajectories.push(entry);
  await c.command('generate',draft,{seedKey:'matched-progress-initial'});
  const originalWorkout=JSON.stringify(c.state.workoutPlan);
  for(let day=1;day<=42;day++){
   c.day=day;const date=dateFor(day);
   if(active(c.state).days.at(-1).date<date)await c.command('renew_plan',{});
   const plan=active(c.state);check(spec.id+':day:'+day+':plan-evidence',independentPlanIssues(plan,library).length===0);
   await c.command('recovery',spec.poor?{...healthy,sleepHours:4,sleepQuality:1,fatigue:5,stress:5,soreness:8}:healthy);
   if(!spec.sparse||day%7===0){
    await c.command('weight',{kg:Math.round((80+spec.slope*(day-1))*100)/100});
    await c.command('food',{date,energy:Number(plan.days.find(d=>d.date===date)?.targets.energy||plan.targets.energy),complete:true});
   }
   await c.command('water',{cups:6});
   if(day%7===0){
    await c.command('review',{});
    const n=c.state.lastReview.nutrition,proposals=pending(c.state),row={day,reasonCode:n.reasonCode,action:n.action,delta:n.delta||0,rate:n.rate??null,coverage:n.coverage||null,energy:active(c.state).targets.energy,proposals:proposals.map(a=>({id:a.id,kind:a.kind,delta:a.delta,status:a.status}))};entry.reviews.push(row);
    if(day===7&&!spec.poor)check(spec.id+':insufficient-first-week',n.reasonCode==='INSUFFICIENT_EVIDENCE_COVERAGE');
    if(spec.id==='on-track'&&day>=14)check(spec.id+':no-unnecessary-change:'+day,n.reasonCode==='TREND_ON_TRACK'&&!proposals.some(a=>a.kind==='calories'));
    if(spec.sparse)check(spec.id+':no-adjustment-on-sparse-evidence:'+day,n.reasonCode==='INSUFFICIENT_EVIDENCE_COVERAGE'&&!proposals.some(a=>a.kind==='calories'));
    if(spec.poor)check(spec.id+':no-calorie-change-during-poor-recovery:'+day,!proposals.some(a=>a.kind==='calories'));
    if(day===14&&['plateau','regression','rapid-loss'].includes(spec.id))check(spec.id+':direction-at-two-weeks',n.action==='propose'&&(spec.id==='rapid-loss'?n.delta>0:n.delta<0));
    if(day===21&&spec.accept)check(spec.id+':accepted-change-cooldown',n.reasonCode==='COOLDOWN_14D'&&!proposals.some(a=>a.kind==='calories'));
    const proposal=proposals.find(a=>a.kind==='calories');
    if(proposal&&((spec.accept&&[14,28].includes(day))||(spec.reject&&day===14))){
     const before=active(c.state),beforeId=before.id,oldBody=(await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(c.userId,beforeId).first()).body;
     const accept=!!spec.accept;await c.command('adaptation',{id:proposal.id,accept});
     entry.decisions.push({day,kind:'calories',accept,proposalId:proposal.id,previousEnergy:before.targets.energy,nextEnergy:active(c.state).targets.energy,delta:proposal.delta});
     check(spec.id+':day:'+day+':decision-kept',c.state.adaptations.some(a=>a.id===proposal.id&&a.status===(accept?'accepted':'rejected')));
     check(spec.id+':day:'+day+':previous-plan-immutable',(await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(c.userId,beforeId).first()).body===oldBody);
     if(accept)check(spec.id+':day:'+day+':actual-target-change',active(c.state).targets.energy===before.targets.energy+proposal.delta&&active(c.state).parent_id===beforeId);
     else check(spec.id+':decline-does-not-change-target',active(c.state).id===beforeId&&active(c.state).targets.energy===before.targets.energy);
     // Observation deliberately does not assume calories share recovery's decision-memory implementation.
     await c.command('review',{});
     if(!accept){
      const repeated=pending(c.state).some(a=>a.kind==='calories');
      if(repeated)report.observations.push({code:'DECLINED_CALORIE_ADVICE_REPROPOSED_WITHOUT_NEW_EVIDENCE',userId:c.userId,day,rejectedId:proposal.id,newIds:pending(c.state).filter(a=>a.kind==='calories').map(a=>a.id)});
      check(spec.id+':decline-respected-without-new-evidence',!repeated&&c.state.lastReview.nutrition.reasonCode==='CALORIE_ADVICE_DECLINED');
      await c.command('water',{cups:7});const remembered=await c.brief();check(spec.id+':decline-visible-after-ordinary-logging',remembered.response.notes.find(n=>n.role==='nutrition')?.key==='calories-declined');
     }
    }
   }
   const brief=await c.brief();entry.briefs++;
   check(spec.id+':day:'+day+':factual-brief-envelope',brief.status===200&&brief.response.revision===c.state.revision&&brief.response.date===date&&brief.response.notes.every(n=>n.status==='GENERATED'&&n.deliveryStatus==='NOT_MEASURED'&&n.renderingStatus==='NOT_MEASURED'&&!/undefined|NaN/.test(n.text+n.action)));
   check(spec.id+':day:'+day+':workout-baseline-preserved',JSON.stringify(c.state.workoutPlan)===originalWorkout);
  }
  const beforeReload=c.state;await c.request('GET','state');
  check(spec.id+':persisted-decisions-survive-reload',JSON.stringify(c.state.adaptations)===JSON.stringify(beforeReload.adaptations));
  console.log(JSON.stringify({id:spec.id,reviews:entry.reviews.map(r=>({day:r.day,reason:r.reasonCode,delta:r.delta})),decisions:entry.decisions}));
 }
 // Multi-step, opposite decisions with intervening ordinary logging and changing evidence.
 const c=client('accumulated-recovery-decisions');await c.command('generate',draft,{seedKey:'matched-progress-initial'});
 const baseline=JSON.stringify(c.state.workoutPlan),decisions=[];
 const fatigued={...healthy,sleepHours:4,sleepQuality:1,fatigue:5,stress:5,soreness:8};
 for(let day=1;day<=14;day++){
  c.day=day;
  if([1,2,4,6,8,10,12,14].includes(day)){
   await c.command('recovery',fatigued);await c.command('review',{});const a=pending(c.state).find(a=>a.kind==='recovery');
   check('recovery:new-evidence-permits-review:'+day,!!a);
   if(!a)continue;
   const accept=day%4!==0;await c.command('adaptation',{id:a.id,accept});decisions.push({day,id:a.id,accept});
   await c.command('water',{cups:5});await c.command('review',{});
   check('recovery:same-evidence-not-reproposed:'+day,!pending(c.state).some(a=>a.kind==='recovery'));
   const brief=await c.brief(),training=brief.response.notes.find(n=>n.role==='training');
   check('recovery:decision-reflected-in-brief:'+day,training?.key===(accept?'adjustment-active':'fatigue-declined'));
   check('recovery:accumulated-decisions-retained:'+day,decisions.every(d=>c.state.adaptations.some(a=>a.id===d.id&&a.status===(d.accept?'accepted':'rejected'))));
   check('recovery:baseline-never-rewritten:'+day,JSON.stringify(c.state.workoutPlan)===baseline);
   if(day===6){await c.command('recovery',{...healthy,redFlags:true});const safety=await c.brief();check('recovery:safety-supersedes-accepted-adjustment',safety.response.notes.find(n=>n.role==='training')?.key==='safety'&&c.state.sessionAdjustment===null);}
  }else{
   const brief=await c.brief();check('recovery:expired-decision-not-described-active:'+day,brief.response.notes.find(n=>n.role==='training')?.key!=='adjustment-active');
  }
 }
 await c.request('GET','state');check('recovery:all-decisions-persisted',decisions.every(d=>c.state.adaptations.some(a=>a.id===d.id&&a.status===(d.accept?'accepted':'rejected'))));
 report.accumulatedRecovery={days:14,decisions};
 report.summary={matchedTrajectories:cases.length,matchedUserDays:cases.length*42,recoveryUserDays:14,decisionCount:report.trajectories.reduce((n,t)=>n+t.decisions.length,0)+decisions.length,observedProductGaps:report.observations.length};
 report.limitations.push('Weight, food completion and recovery paths are scripted independent inputs, not a physiological prediction or proof of actual eating/exercise.','Only the listed finite paths and checks are measured; further performance/volume progression and notification lifecycle tests are separate.');
}catch(e){error=e;}
finally{await runtime.finish(error);}
