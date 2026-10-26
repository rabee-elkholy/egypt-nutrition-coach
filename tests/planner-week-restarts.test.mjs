import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWeek} from '../planner-core.mjs';
import {library} from '../server/food.mjs';
import {independentPlanIssues} from '../scripts/audit/scenario-http.mjs';
const profile={age:42,weight:84,height:155,sex:'female',goal:'lose',targetWeight:74.4,goalPace:'slow',activity:'sedentary',timezone:'Asia/Amman',trainingDays:6,workoutDays:[1,2,3,4,5,6],diseases:[],recomposition:false};
const prefs={diet:'vegan',fasting:'none',eatingStart:'12:00',region:'levant',budget:'low',meals:4,proteins:['legumes','nuts'],excludedKeys:[],excludedFoodIds:[],excludedGroups:[]};
test('exact day-43 renewal seed finds a validated week without changing inputs or public plan identity',()=>{
 const seed='43c71f24-44c7-40b7-a5c7-224a46c723dd',before=JSON.stringify({profile,prefs}),plan=makeWeek(profile,prefs,library,'2026-12-05',seed);
 assert.equal(plan.id,'plan-'+seed);assert.deepEqual(independentPlanIssues(plan,library),[]);assert.equal(JSON.stringify({profile,prefs}),before);
 assert.deepEqual(plan.preferences,prefs);for(const day of plan.days)for(const meal of day.meals)assert.equal(meal.snapshot.budget_tier,'low');
});
test('bounded restarts do not manufacture a week with no eligible ingredients',()=>{
 assert.throws(()=>makeWeek(profile,{...prefs,excludedKeys:Object.keys(library.ingredients)},library,'2026-12-05','all-excluded'),e=>e.code==='PLAN_CONSTRAINTS_UNMET'&&e.fieldErrors[0].code==='NO_ELIGIBLE_MEAL_FOR_SLOT');
});
