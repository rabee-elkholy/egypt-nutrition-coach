import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWeek} from '../planner-core.mjs';
import {library} from '../server/food.mjs';

const prefs={diet:'dash',fasting:'none',eatingStart:'12:00',region:'gulf',budget:'low',meals:4,proteins:['legumes','eggs','dairy','chicken','fish','meat','nuts'],excludedKeys:[],excludedFoodIds:[],excludedGroups:[]};
const cases=[
 {name:'DASH Gulf low-budget dinner',seed:'173c8079-163c-4ee6-a53c-7d53143c7bc0',profile:{age:40,weight:60.2,height:157,sex:'female',goal:'muscle_gain',targetWeight:68.1,goalPace:'moderate',activity:'active',timezone:'Asia/Riyadh',trainingDays:6,workoutDays:[0,1,2,3,5,6],diseases:[]},preferences:prefs},
 {name:'balanced diet with recorded hypertension',seed:'3c7a331d-3b7a-418a-aa7a-2ff7397a2e64',profile:{age:24,weight:102.9,height:177,sex:'male',goal:'gain',targetWeight:108,goalPace:'slow',activity:'active',timezone:'Africa/Casablanca',trainingDays:4,workoutDays:[1,3,4,6],diseases:['hypertension']},preferences:{...prefs,diet:'balanced',region:'maghreb',budget:'high',eatingStart:'10:00'}},
 {name:'DASH Maghreb with retained favism exclusion',seed:'07bc947d-06bc-42ea-a5bc-915704bc8fc4',profile:{age:21,weight:89.6,height:192,sex:'male',goal:'maintain',targetWeight:89.6,goalPace:'slow',activity:'light',timezone:'Africa/Casablanca',trainingDays:2,workoutDays:[2,5],diseases:['favism']},preferences:{...prefs,region:'maghreb',eatingStart:'13:00',excludedGroups:['fava']}}
];

for(const c of cases)test('variety cannot hide a compliant option: '+c.name,()=>{
 const before=JSON.stringify(c),plan=makeWeek(c.profile,c.preferences,library,'2026-10-24',c.seed);
 assert.equal(JSON.stringify(c),before);assert.deepEqual(plan.preferences,c.preferences);assert.equal(plan.days.length,7);
 for(const day of plan.days){
  let sodium=0,energy=0,protein=0;
  for(const meal of day.meals)for(const part of meal.snapshot.ingredients){
   const source=library.ingredients[part.key];assert.deepEqual(part.values_per_100g,source.values);
   assert.ok(source.values.sodium!=null,'Only measured sodium may satisfy this check');
   sodium+=Number(part.grams)*Number(source.values.sodium)/100;
   energy+=Number(part.grams)*Number(source.values.energy)/100;
   protein+=Number(part.grams)*Number(source.values.protein)/100;
   if(c.preferences.excludedGroups.includes('fava'))assert.notEqual(part.key,'fava');
  }
  assert.ok(day.summary.values.sodium!=null);assert.ok(Math.abs(sodium-Number(day.summary.values.sodium))<.00001);assert.ok(sodium<=2300);
  assert.ok(Math.abs(energy-day.targets.energy)<=day.targets.energy*.15);assert.ok(protein>=day.targets.protein*.8);
 }
});

test('full-pool fallback cannot replace missing measured sodium with an invented zero',()=>{
 const missing=structuredClone(library);for(const ingredient of Object.values(missing.ingredients))ingredient.values.sodium=null;
 assert.throws(()=>makeWeek(cases[0].profile,prefs,missing,'2026-10-24',cases[0].seed));
});
