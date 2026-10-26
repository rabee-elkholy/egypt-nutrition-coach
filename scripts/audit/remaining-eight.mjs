import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {scenarioRuntime,independentPlanIssues} from './scenario-http.mjs';
import {generate,empty} from '../../server/coaching.mjs';
import {withClock} from '../../server/clock.mjs';
import {library} from '../../server/food.mjs';
import {planningTemplates,prepareTemplate,daySlots} from '../../planner-core.mjs';

const [source,output]=process.argv.slice(2);
if(!source||!output)throw Error('Usage: remaining-eight.mjs <original-complete-run> <new-output>');
const cohort=JSON.parse(fs.readFileSync(path.join(source,'cohort.json'))),config=JSON.parse(fs.readFileSync(path.join(source,'simulation_config.json')));
const ids=['009','017','018','047','054','063','074','092'].map(n=>'user-'+n),runtime=await scenarioRuntime(output,'REMAINING_EIGHT_EXACT_HTTP_AND_FIXED_SEED_MATRIX');
const {report,client,check}=runtime;report.sourceRun=path.resolve(source);report.users=[];let error;
try{
 for(const id of ids){
  const persona=cohort.find(p=>p.userId===id);assert.ok(persona,id);
  const normalized=withClock(Date.parse(config.startDate+'T12:00:02Z'),()=>generate(empty(),{...persona.onboarding,serviceTrack:'workouts_only'},'diagnostic-normalization'));
  const templates=planningTemplates(library,normalized.preferences),prepared=templates.map(t=>prepareTemplate(t,library,normalized.preferences,normalized.profile)).filter(Boolean);
  const slots=[...new Set(daySlots(normalized.preferences.meals,normalized.preferences.diet).map(s=>s.slot))];
  const structural={templates:templates.length,prepared:prepared.length,slots:Object.fromEntries(slots.map(s=>[s,{beforePreferences:templates.filter(t=>t.meal_slots.includes(s)).length,afterPreferences:prepared.filter(t=>t.meal_slots.includes(s)).length}]))};
  const entry={userId:id,diet:normalized.preferences.diet,budget:normalized.preferences.budget,region:normalized.preferences.region,structural,seeds:[],budgetCounterfactuals:[]};report.users.push(entry);
  for(let seed=0;seed<12;seed++){
   const c=client(seed===0?id:`${id}-coverage-seed-${seed}`);
   if(seed===0)await c.request('POST','eligibility',persona.onboarding,{seedKey:config.seed+':'+id+'-1'});
   const result=await c.command('generate',persona.onboarding,{allowFailure:true,seedKey:seed===0?config.seed+':'+id+'-2':`${config.seed}:${id}:coverage-probe:${seed}`});
   const reload=await c.request('GET','state');
   check(id+':seed:'+seed+':no-server-error-and-readable',result.status<500&&reload.status===200);
   const row={seed,status:result.status,code:result.response.code||null,message:result.response.message||null,latencyMs:result.latencyMs};entry.seeds.push(row);
   if(result.status===200){
    const plan=c.state.plans.find(p=>p.id===c.state.active_plan_id),issues=independentPlanIssues(plan,library);
    row.planIssues=issues;check(id+':seed:'+seed+':valid-plan',issues.length===0,{issues});
    check(id+':seed:'+seed+':unchanged-preferences',JSON.stringify(c.state.preferences)===JSON.stringify(normalized.preferences));
   }else{
    check(id+':seed:'+seed+':no-partial-account',c.state.profile===null&&c.state.revision===0&&(c.state.plans||[]).length===0);
    check(id+':seed:'+seed+':actionable-coverage-contract',result.response.code==='PLAN_CONSTRAINTS_UNMET'&&result.response.retryable===false&&result.response.fieldErrors?.some(e=>['NO_ELIGIBLE_MEAL_FOR_SLOT','NO_CANDIDATE_WITHIN_DIET_LIMITS','NUTRIENT_TARGETS_UNMET'].includes(e.code)));
   }
   if(seed===0)check(id+':original-rejection-reproduced',result.status===400);
  }
  // Explicit diagnostic counterfactual: NEVER applied to an original user's account.
  if(entry.budget==='low')for(const budget of ['medium','high']){
   const c=client(id+'-diagnostic-budget-'+budget),result=await c.command('generate',{...persona.onboarding,budget},{allowFailure:true});
   const row={budget,status:result.status,message:result.response.message||null};entry.budgetCounterfactuals.push(row);
   check(id+':budget:'+budget+':no-server-error',result.status<500);
   if(result.status===200){const issues=independentPlanIssues(c.state.plans.find(p=>p.id===c.state.active_plan_id),library);check(id+':budget:'+budget+':valid-plan',issues.length===0,{issues});}
  }
  entry.classification=Object.values(structural.slots).some(s=>s.afterPreferences===0)?'EMPTY_ELIGIBLE_SLOT_LIBRARY':entry.seeds.some(s=>s.status===200)?'SEED_SENSITIVE_SEARCH_FAILURE':'BOUNDED_SEARCH_OR_PORTION_COVERAGE_UNRESOLVED';
  console.log(JSON.stringify({userId:id,classification:entry.classification,originalStatus:entry.seeds[0].status,seedSuccesses:entry.seeds.filter(s=>s.status===200).length,budgetCounterfactuals:entry.budgetCounterfactuals.map(c=>({budget:c.budget,status:c.status}))}));
 }
 report.summary={profiles:report.users.length,seedAttempts:report.users.reduce((s,u)=>s+u.seeds.length,0),seedSuccesses:report.users.reduce((s,u)=>s+u.seeds.filter(p=>p.status===200).length,0),classifications:report.users.reduce((a,u)=>(a[u.classification]=(a[u.classification]||0)+1,a),{})};
 report.limitations.push('Twelve fixed seeds are a finite search probe, not a proof of mathematical infeasibility.','Workouts-only normalization is used only to inspect profile/preferences without triggering nutrition generation.','Higher-budget counterfactuals are isolated diagnostic accounts and are not proposed preference changes or successful original profiles.');
}catch(e){error=e;}
finally{await runtime.finish(error);}
