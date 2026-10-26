import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWeek} from '../planner-core.mjs';
import {library} from '../server/food.mjs';
import {independentPlanIssues} from '../scripts/audit/scenario-http.mjs';
const profile={age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:65,activity:'light',timezone:'Africa/Cairo',trainingDays:3,workoutDays:[1,3,5],diseases:[]};
const prefs={diet:'balanced',region:'egypt',budget:'medium',meals:4,proteins:['legumes','eggs','dairy','chicken','fish','meat','nuts'],fasting:'none',eatingStart:'12:00',excludedKeys:[],excludedFoodIds:[],excludedGroups:[]};
for(const seed of ['long-horizon-renewal-57','long-horizon-renewal-control'])test('renewed generation fits the accepted target directly: '+seed,()=>{
 const unchanged=JSON.stringify({profile,prefs});
 const plan=makeWeek(profile,prefs,library,'2026-12-19',seed,1663);
 assert.equal(plan.targets.energy,1663);assert.equal(plan.targets.protein,128);
 assert.deepEqual(independentPlanIssues(plan,library),[]);assert.equal(JSON.stringify({profile,prefs}),unchanged);
 assert.equal(plan.targets.energy_change,Math.round((1663-plan.targets.tdee)*10)/10);
});
test('internal target override cannot bypass existing absolute energy limits',()=>{
 assert.throws(()=>makeWeek(profile,prefs,library,'2026-12-19','below-floor',1399));
 assert.throws(()=>makeWeek(profile,prefs,library,'2026-12-19','above-ceiling',4201));
});
