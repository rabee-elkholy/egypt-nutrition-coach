import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWeek} from '../planner-core.mjs';
import {library} from '../server/food.mjs';
const profile={age:39,weight:97.4,height:189,sex:'male',goal:'lose',targetWeight:83.8,goalPace:'moderate',activity:'sedentary',timezone:'Africa/Cairo',trainingDays:5,workoutDays:[1,2,3,5,6],diseases:[]};
const prefs={diet:'vegan',region:'egypt',budget:'high',meals:4,proteins:['legumes','nuts'],fasting:'none',eatingStart:'12:00',excludedKeys:[],excludedFoodIds:[],excludedGroups:[]};
function rejection(run,code){assert.throws(run,e=>{assert.equal(e.code,'PLAN_CONSTRAINTS_UNMET');assert.equal(e.status,400);assert.equal(e.retryable,false);assert.equal(e.fieldErrors[0].code,code);assert.ok(e.fieldErrors[0].message);return true;});}
test('empty permitted slot returns an actionable coverage error',()=>rejection(()=>makeWeek(profile,{...prefs,excludedKeys:Object.keys(library.ingredients)},library,'2026-10-24','empty'),'NO_ELIGIBLE_MEAL_FOR_SLOT'));
test('missing measured DASH sodium is a diet candidate limit error, without inventing data',()=>{
 const missing={...library,ingredients:Object.fromEntries(Object.entries(library.ingredients).map(([k,v])=>[k,{...v,values:{...v.values,sodium:null}}]))};
 rejection(()=>makeWeek(profile,{...prefs,diet:'dash',proteins:['legumes','nuts','eggs','dairy','chicken','fish','meat']},missing,'2026-10-24','missing-sodium'),'NO_CANDIDATE_WITHIN_DIET_LIMITS');
});
test('nonempty pool with injected zero protein returns target-fit failure rather than empty-library error',()=>{
 // The original vegan persona is now supported. Preserve this error contract
 // using explicit nutrient fault injection rather than expecting that old bug.
 const insufficient={...library,ingredients:Object.fromEntries(Object.entries(library.ingredients).map(([k,v])=>[k,{...v,values:{...v.values,protein:'0'}}]))};
 rejection(()=>makeWeek(profile,prefs,insufficient,'2026-10-24','zero-protein-control'),'NUTRIENT_TARGETS_UNMET');
});
