import fs from 'node:fs';
import path from 'node:path';
import {empty,generate,command} from '../../server/coaching.mjs';
import {withClock} from '../../server/clock.mjs';
import {dateOffset} from '../../coaching-shared.mjs';
const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Usage: probe-adjustment-holds.mjs <cohort-run> <new-output>');if(fs.existsSync(output))throw Error('Preserve earlier probe');
const cohort=JSON.parse(fs.readFileSync(path.join(source,'cohort.json'))),date='2026-10-24',now=Date.parse(date+'T12:00:00Z'),probes=[];let witness=null;
withClock(now,()=>{
 for(const persona of cohort){
  const draft={...persona.onboarding,targetWeight:null},seed='hold-probe-'+persona.userId;
  let s;try{s=generate(empty(),draft,seed);}catch{continue;}
  const plan=s.plans.find(p=>p.id===s.active_plan_id);if(!plan)continue;
  s.nutritionContextStartedOn=dateOffset(date,-20);
  s.weights=Array.from({length:14},(_,i)=>({date:dateOffset(date,-i),kg:s.profile.weight+(s.profile.goal==='lose'?0:(13-i)*s.profile.weight*.002)}));
  s.foodLogs=s.weights.map(w=>({date:w.date,complete:true,energy:plan.targets.energy,adherence:100}));
  s.checkins=[{date,at:new Date(now).toISOString(),sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false}];
  const next=command(s,'review',{}),n=next.lastReview.nutrition;probes.push({userId:persona.userId,energy:plan.targets.energy,reasonCode:n.reasonCode});
  if(n.reasonCode==='PLAN_CONSTRAINTS_ADJUSTMENT_HOLD'){witness={draft,seed,energy:plan.targets.energy,protein:plan.targets.protein,futureRatios:plan.days.slice(1).map(d=>Number(d.summary.values.protein)/d.targets.protein),delta:n.delta};break;}
 }
});
fs.writeFileSync(output,JSON.stringify({scope:'ESTABLISHED_VALID_PLAN_TARGET_FIT_HOLD_FIXTURE_SEARCH',probes,witness,limitations:['Domain fixture search for a valid generated plan; historical coverage is explicit synthetic input, not an executed customer journey.']},null,2)+'\n');console.log(JSON.stringify({probes:probes.length,witness}));if(!witness)process.exitCode=1;
