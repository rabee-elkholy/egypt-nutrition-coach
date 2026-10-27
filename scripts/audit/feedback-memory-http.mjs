import {scenarioRuntime} from './scenario-http.mjs';
const output=process.argv[2];if(!output)throw Error('Supply a new evidence directory');
const runtime=await scenarioRuntime(output,'PARTIAL_NUTRITION_FEEDBACK_HTTP_GUARD_AND_PERSISTENCE'),{client,check,report}=runtime;
const healthy={sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false};
const draft={name:'Partial feedback regression',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:65,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const active=s=>s.plans.find(p=>p.id===s.active_plan_id),cuts=s=>s.adaptations.filter(a=>a.status==='pending'&&a.kind==='calories'&&a.delta<0);
let error;
try{
 const c=client('partial-feedback-memory');await c.command('generate',draft,{seedKey:'matched-progress-initial'});
 for(let day=1;day<=14;day++){
  c.day=day;const date=new Date(Date.parse('2026-10-24T12:00:00Z')+(day-1)*86400000).toISOString().slice(0,10);
  if(active(c.state).days.at(-1).date<date)await c.command('renew_plan');
  await c.command('recovery',healthy);await c.command('weight',{kg:80});
  await c.command('food',{date,energy:active(c.state).targets.energy,complete:true});
 }
 check('plateau-can-initially-propose-cut',cuts(c.state).length>0);
 const planBefore=JSON.stringify(c.state.plans),energyBefore=active(c.state).targets.energy;
 await c.command('coaching_feedback',{domain:'nutrition',barrier:'hunger',hunger:5,energy:1});
 const observation=c.state.coachingFeedback.at(-1);
 check('explicit-metrics-block-cut',c.state.lastReview.nutrition.reasonCode==='APPETITE_ENERGY_REVIEW_REQUIRED'&&cuts(c.state).length===0);
 await c.command('coaching_feedback',{domain:'nutrition',barrier:'budget'});
 check('partial-report-keeps-cut-hold',c.state.lastReview.nutrition.reasonCode==='APPETITE_ENERGY_REVIEW_REQUIRED'&&cuts(c.state).length===0);
 check('partial-report-does-not-copy-older-values-into-new-record',c.state.coachingFeedback.at(-1).hunger===null&&c.state.coachingFeedback.at(-1).energy===null);
 await c.request('GET','state');await c.command('review');
 check('persisted-reload-retains-hold',c.state.lastReview.nutrition.reasonCode==='APPETITE_ENERGY_REVIEW_REQUIRED'&&cuts(c.state).length===0);
 const b=await c.brief(),note=b.response.notes.find(n=>n.key==='high-hunger');
 check('brief-refers-to-original-rating-date',b.status===200&&note?.text.includes(observation.date));
 check('blocked-review-does-not-mutate-plan',JSON.stringify(c.state.plans)===planBefore&&active(c.state).targets.energy===energyBefore);
 await c.command('coaching_feedback',{domain:'nutrition',barrier:'none',hunger:2});
 check('explicitly-improved-hunger-does-not-clear-omitted-low-energy',c.state.lastReview.nutrition.reasonCode==='APPETITE_ENERGY_REVIEW_REQUIRED'&&cuts(c.state).length===0);
 await c.command('coaching_feedback',{domain:'nutrition',barrier:'none',energy:4});
 check('fresh-explicit-improvements-permit-review-again',cuts(c.state).length>0);
 const a=cuts(c.state)[0];if(a){await c.command('adaptation',{id:a.id,accept:true});check('accepted-cut-only-after-both-explicit-improvements',active(c.state).targets.energy<energyBefore);}
 report.summary={guardChecks:10,days:14,originalObservationDate:observation.date};
}catch(e){error=e;}finally{await runtime.finish(error);}
