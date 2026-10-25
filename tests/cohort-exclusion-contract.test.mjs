import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDay} from '../scripts/cohort/evaluate.mjs';
import {EXCLUSIONS,expandedKeys} from '../planner-exclusions.mjs';

function evaluate(key,excluded){
 const date='2026-10-24',bundle={userId:'fixture',day:1,date,revisionBefore:0,records:[],behavior:{food:[]},state:{profile:{name:'Synthetic'},preferences:{diet:'balanced',excludedGroups:[excluded]},onboarding:{workoutPrefs:{injuries:[]}},active_plan_id:'p',plans:[{id:'p',targets:{energy:100,protein:10},days:[{date,summary:{values:{energy:100,protein:10}},meals:[{id:'m',snapshot:{ingredients:[{key,grams:100,values_per_100g:{energy:100,protein:10}}],values:{energy:100,protein:10}}}]}]}]}};
 return evaluateDay(bundle,{onboarding:{name:'Synthetic'}},{ingredients:{[key]:{protein_group:'fish'}}}).issues.filter(i=>i.code==='FOOD_EXCLUSION');
}
test('fish and shellfish are separate documented preference categories',()=>{
 assert.ok(EXCLUSIONS.some(g=>g.id==='fish'));assert.ok(EXCLUSIONS.some(g=>g.id==='shellfish'));
 assert.ok(!expandedKeys({excludedGroups:['fish'],excludedKeys:[]}).includes('shrimp'));
 assert.equal(evaluate('shrimp','fish').length,0,'The nutrition protein family is broader than the fish taste category');
});
test('independent evaluator still rejects all documented fish keys',()=>{
 for(const key of ['fish','seabass','tuna','salmon'])assert.ok(evaluate(key,'fish').length>0,key);
});
test('independent evaluator rejects shellfish when shellfish is explicitly excluded',()=>{
 assert.ok(evaluate('shrimp','shellfish').length>0);
});
