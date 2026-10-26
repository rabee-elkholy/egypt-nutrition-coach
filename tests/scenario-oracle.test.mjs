import test from 'node:test';
import assert from 'node:assert/strict';
import {independentPlanIssues} from '../scripts/audit/scenario-http.mjs';
const source={ingredients:{a:{values:{energy:100,protein:20,carbs:1,sodium:2}}}};
const base=()=>({preferences:{diet:'balanced'},days:Array.from({length:7},()=>({targets:{energy:100,protein:20},summary:{values:{energy:100,protein:20}},meals:[{snapshot:{values:{energy:100,protein:20,carbs:1,sodium:2},ingredients:[{key:'a',grams:100,values_per_100g:{energy:100,protein:20,carbs:1,sodium:2}}]}}]}))});
test('scenario oracle requires seven complete days and matching source arithmetic',()=>{
 assert.deepEqual(independentPlanIssues(base(),source),[]);
 for(const change of [p=>p.days.pop(),p=>p.days[0].meals=[],p=>p.days[0].meals[0].snapshot.ingredients=[],p=>p.days[0].meals[0].snapshot.ingredients[0].values_per_100g.protein=999,p=>p.days[0].summary.values.energy=99,p=>p.days[0].meals[0].snapshot.values.energy=101]){
  const p=base();change(p);assert.ok(independentPlanIssues(p,source).length);
 }
});
test('scenario oracle recomputes energy, protein and carbohydrate bounds from reference ingredients',()=>{
 for(const change of [p=>p.days[0].targets.energy=200,p=>p.days[0].targets.protein=100,p=>{p.preferences.diet='keto';p.days[0].meals[0].snapshot.ingredients[0].grams=6000;},p=>{p.preferences.diet='low_carb';p.days[0].meals[0].snapshot.ingredients[0].grams=14000;}]){
  const p=base();change(p);assert.ok(independentPlanIssues(p,source).some(e=>e.endsWith('_BOUND')));
 }
});
