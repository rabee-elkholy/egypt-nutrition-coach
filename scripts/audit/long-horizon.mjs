import {scenarioRuntime,independentPlanIssues} from './scenario-http.mjs';
import {library} from '../../server/food.mjs';
const output=process.argv[2];if(!output)throw Error('Usage: long-horizon.mjs <new-output>');
const runtime=await scenarioRuntime(output,'TWO_365_DAY_HTTP_JOURNEYS_REPEATED_ADJUSTMENTS_AND_GOAL_CHANGE'),{report,client,check,db}=runtime;
report.journeys=[];report.observations=[];let error;
const draft={name:'Long horizon',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:65,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const active=s=>s.plans.find(p=>p.id===s.active_plan_id),healthy={sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false};
const dateFor=d=>new Date(Date.parse('2026-10-24T12:00:00Z')+(d-1)*86400000).toISOString().slice(0,10);
try{
 for(const sex of ['male','female']){
  const c=client('long-horizon-'+sex),entry={sex,days:365,reviews:[],accepted:[],goalChanges:[],initialEnergy:null,minimumEnergy:Infinity};report.journeys.push(entry);
  await c.command('generate',{...draft,sex},{seedKey:'long-horizon-baseline-'+sex});entry.initialEnergy=active(c.state).targets.energy;
  for(let day=1;day<=365;day++){
   c.day=day;const date=dateFor(day);
   if(day===181&&sex==='female'){
    const previousId=active(c.state).id,previousBody=(await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(c.userId,previousId).first()).body;
    await c.command('generate',{...draft,sex,goal:'maintain',targetWeight:null});entry.goalChanges.push({day,goal:'maintain'});
    check(sex+':goal-change-preserves-old-plan',(await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(c.userId,previousId).first()).body===previousBody);
   }
   if(active(c.state).days.at(-1).date<date)await c.command('renew_plan',{});
   const plan=active(c.state),issues=independentPlanIssues(plan,library);check(sex+':day:'+day+':source-and-nutrient-bounds',issues.length===0,{issues});
   entry.minimumEnergy=Math.min(entry.minimumEnergy,plan.targets.energy);
   check(sex+':day:'+day+':energy-floor',plan.targets.energy>=(sex==='male'?1400:1200));
   await c.command('weight',{date,kg:80});await c.command('food',{date,energy:plan.days.find(d=>d.date===date)?.targets.energy||plan.targets.energy,complete:true});await c.command('recovery',healthy);
   if(day%7===0||day===181||day===188||day===194){
    await c.command('review',{});const n=c.state.lastReview.nutrition,proposal=c.state.adaptations.find(a=>a.status==='pending'&&a.kind==='calories');
    entry.reviews.push({day,reasonCode:n.reasonCode,delta:n.delta||0,energy:active(c.state).targets.energy});
    if(sex==='female'&&day>=181&&day<194)check('new-goal-context-insufficient-evidence:'+day,n.reasonCode==='INSUFFICIENT_EVIDENCE_COVERAGE');
    if(sex==='female'&&day>=194)check('maintenance-stable-weight-no-calorie-cut:'+day,!proposal&&n.reasonCode==='TREND_ON_TRACK');
    if(n.reasonCode==='MIN_SAFE_ENERGY_FLOOR_HOLD'&&active(c.state).targets.energy+(n.delta||0)>=(sex==='male'?1400:1200))report.observations.push({code:'PLAN_CONSTRAINT_FAILURE_MISLABELED_AS_ENERGY_FLOOR',sex,day,energy:active(c.state).targets.energy,attemptedDelta:n.delta});
    if(proposal){
     const before=active(c.state),id=before.id,body=(await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(c.userId,id).first()).body;
     await c.command('adaptation',{id:proposal.id,accept:true});entry.accepted.push({day,from:before.targets.energy,to:active(c.state).targets.energy});
     check(sex+':accepted-target-and-parent:'+day,active(c.state).targets.energy===before.targets.energy+proposal.delta&&active(c.state).parent_id===id);
     check(sex+':accepted-parent-immutable:'+day,(await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(c.userId,id).first()).body===body);
     await c.command('review',{});check(sex+':no-immediate-second-adjustment:'+day,c.state.lastReview.nutrition.reasonCode==='COOLDOWN_14D');
    }
   }
   const brief=await c.brief();check(sex+':day:'+day+':brief-date-and-evidence',brief.status===200&&brief.response.date===date&&brief.response.notes.every(n=>n.status==='GENERATED'&&n.deliveryStatus==='NOT_MEASURED'&&n.renderingStatus==='NOT_MEASURED'&&!/undefined|NaN/.test(n.text+n.action)));
   if(day%90===0)console.log(JSON.stringify({sex,day,energy:active(c.state).targets.energy,accepted:entry.accepted.length}));
  }
  await c.request('GET','state');check(sex+':final-year-history-retained',c.state.weights.length===365&&c.state.foodLogs.length===365&&c.state.checkins.length===365);
 }
 report.summary={journeys:2,userDays:730,acceptedAdjustments:report.journeys.reduce((n,j)=>n+j.accepted.length,0),observedProductGaps:report.observations.length};
 report.limitations.push('Constant recorded weight despite scripted calorie changes deliberately probes control limits; it is not a physiological outcome model.','Two finite synthetic histories do not establish production capacity or clinical/human acceptance.');
}catch(e){error=e;}
finally{await runtime.finish(error);}
