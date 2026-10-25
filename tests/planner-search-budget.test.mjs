import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWeek} from '../planner-core.mjs';
import {library} from '../server/food.mjs';

// Exact normalized inputs of rejected HTTP persona user-089. The UUID seed is
// derived from its recorded harness request; alternate seeds prove feasibility.
const profile={name:'Search regression',age:42,sex:'female',height:155,weight:84,targetWeight:74.4,goal:'lose',goalPace:'slow',activity:'sedentary',timezone:'Asia/Amman',trainingDays:6,workoutDays:[1,2,3,4,5,6],diseases:[],recomposition:false};
const preferences={diet:'vegan',region:'levant',budget:'low',meals:4,proteins:['legumes','nuts'],fasting:'none',eatingStart:'12:00',excludedKeys:[],excludedFoodIds:[],excludedGroups:[]};

for(const seed of ['f560dbcc-f660-4d5f-a760-def2f860e085','user-089:coverage-seed:1','user-089:coverage-seed:2']){
 test('bounded repair finds a compliant low-budget vegan week for '+seed,()=>{
  const inputs=JSON.stringify({profile,preferences}),plan=makeWeek(profile,preferences,library,'2026-10-24',seed);
  assert.equal(JSON.stringify({profile,preferences}),inputs,'Search must not relax or mutate the input');
  assert.equal(plan.id,'plan-'+seed);assert.equal(plan.days.length,7);
  assert.equal(plan.preferences.diet,'vegan');assert.equal(plan.preferences.region,'levant');assert.equal(plan.preferences.budget,'low');
  for(const day of plan.days){
   let energy=0,protein=0;
   for(const meal of day.meals){
    assert.equal(meal.snapshot.budget_tier,'low');
    for(const part of meal.snapshot.ingredients){
     const ingredient=library.ingredients[part.key];assert.ok(ingredient);
     assert.ok(!['eggs','dairy','chicken','fish','meat'].includes(ingredient.protein_group));assert.notEqual(part.key,'honey');
     energy+=Number(part.grams)*Number(ingredient.values.energy)/100;
     protein+=Number(part.grams)*Number(ingredient.values.protein)/100;
    }
   }
   assert.ok(Math.abs(energy-Number(day.summary.values.energy))<.00001);
   assert.ok(Math.abs(protein-Number(day.summary.values.protein))<.00001);
   assert.ok(Math.abs(energy-day.targets.energy)<=day.targets.energy*.15);
   assert.ok(protein>=day.targets.protein*.8);
  }
 });
}

test('more repair work cannot create a meal after every ingredient is explicitly excluded',()=>{
 const excluded={...preferences,excludedKeys:Object.keys(library.ingredients)},before=JSON.stringify(excluded);
 assert.throws(()=>makeWeek(profile,excluded,library,'2026-10-24','all-excluded'));
 assert.equal(JSON.stringify(excluded),before);
});
