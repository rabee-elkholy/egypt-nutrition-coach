import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNutritionHistory} from '../scripts/audit/plan-transitions.mjs';

const plan=(id,parent_id)=>({id,parent_id:parent_id||null,days:[{date:'2026-10-24',meals:[{id:'m',snapshot:{template_id:'original',ingredients:[]}}]}],targets:{energy:2000}});
function fixture(){const p=plan('p1'),next=plan('p2','p1');next.days[0].meals[0].snapshot.template_id='alternate';return {bundles:[{day:1,date:'2026-10-24',records:[{eventId:'e1',requestId:'r1',request:{simulation:true,body:{action:'generate'}},response:{profile:{name:'Synthetic'},revision:1,active_plan_id:'p1',plans:[p]}},{eventId:'e2',requestId:'r2',request:{simulation:true,body:{action:'replace_meal',payload:{mealId:'m',templateId:'alternate'}}},response:{profile:{name:'Synthetic'},revision:2,active_plan_id:'p2',plans:[p,next]}}]}],persisted:[{namespace:'simulation',plan:p},{namespace:'simulation',plan:next}]};}
test('nutrition transition audit accepts justified snapshots backed by persistence',()=>{const f=fixture(),r=inspectNutritionHistory(f.bundles,f.persisted);assert.equal(r.passed,true);assert.deepEqual(r.transitions.map(t=>t.reason),['INITIAL_CREATION','MEAL_SUBSTITUTION']);});
test('nutrition transition negative controls reject every injected history defect',()=>{
 for(const [code,mutate] of [
  ['MISSING_ACTIVE_SNAPSHOT',f=>f.bundles[0].records[1].response.plans.pop()],
  ['DUPLICATE_PLAN_ID',f=>f.bundles[0].records[1].response.plans.push(f.bundles[0].records[1].response.plans[0])],
  ['MUTATED_NUTRITION_SNAPSHOT',f=>f.bundles[0].records[1].response.plans[0]={...plan('p1'),targets:{energy:1900}}],
  ['BROKEN_PARENT_CHAIN',f=>f.bundles[0].records[1].response.plans[1]={...plan('p2'),parent_id:'unknown'}],
  ['UNJUSTIFIED_PLAN_TRANSITION',f=>f.bundles[0].records[1].request.body={action:'adaptation',payload:{accept:false}}],
  ['MISSING_PERSISTED_SNAPSHOT',f=>f.persisted.pop()],
  ['PERSISTED_SNAPSHOT_MISMATCH',f=>f.persisted[1]={namespace:'simulation',plan:{...plan('p2','p1'),targets:{energy:2100}}}],
  ['MEAL_SUBSTITUTION_PAYLOAD_MISMATCH',f=>f.bundles[0].records[1].request.body.payload.templateId='unsupported'],
  ['UNOBSERVED_PERSISTED_PLAN',f=>f.persisted.push({namespace:'simulation',plan:plan('orphan')})],
  ['PREMATURE_WEEKLY_RENEWAL',f=>{f.bundles[0].records[1].request.body.action='renew_plan';f.bundles[0].records[1].response.serverDate='2026-10-24';}],
  ['MISSING_ADAPTATION_PROPOSAL',f=>f.bundles[0].records[1].request.body={action:'adaptation',payload:{accept:true,id:'missing'}}],
 ]){const f=structuredClone(fixture());mutate(f);const result=inspectNutritionHistory(f.bundles,f.persisted);assert.equal(result.passed,false,code);assert.ok(result.failures.some(x=>x.code===code),code);}
});
