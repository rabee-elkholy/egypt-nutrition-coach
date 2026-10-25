import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate} from '../server/coaching.mjs';
import {generateStressCohort} from '../simulation/persona-generator.mjs';
import {measuredDashSodiumInvariant} from '../simulation/stress-tests.mjs';
import {library} from '../server/food.mjs';
const fixture=()=>generate(empty(),generateStressCohort().find(c=>c.id==='stress_20').draft,'stress-dash-gulf');

test('DASH stress requires a retained complete measured plan and rejects missing evidence',()=>{
 const state=fixture();assert.equal(measuredDashSodiumInvariant(state),true);
 const missing=structuredClone(state);missing.plans=[];assert.equal(measuredDashSodiumInvariant(missing),false);
 for(const mutate of [s=>s.plans[0].days.pop(),s=>s.plans[0].days[0].meals[0].snapshot.values.sodium=null,s=>s.plans[0].days[0].meals[0].snapshot.ingredients[0].values_per_100g.sodium=null]){
  const changed=structuredClone(state);mutate(changed);assert.equal(measuredDashSodiumInvariant(changed),false);
 }
});

test('DASH stress rejects an independently recomputed excessive quantity even when declared arithmetic agrees',()=>{
 const state=fixture(),day=state.plans[0].days[0],part=day.meals.flatMap(m=>m.snapshot.ingredients).find(p=>Number(library.ingredients[p.key].values.sodium)>0);assert.ok(part);
 part.grams=String(Number(part.grams)*1000000);
 for(const meal of day.meals)meal.snapshot.values.sodium=String(meal.snapshot.ingredients.reduce((n,p)=>n+Number(p.grams)*Number(library.ingredients[p.key].values.sodium)/100,0));
 day.summary.values.sodium=String(day.meals.reduce((n,m)=>n+Number(m.snapshot.values.sodium),0));assert.ok(Number(day.summary.values.sodium)>2300);assert.equal(measuredDashSodiumInvariant(state),false);
});
