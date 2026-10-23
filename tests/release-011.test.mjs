import test from 'node:test';
import assert from 'node:assert/strict';
import {workoutPlan,exerciseAlternatives,isFriendlyForInjuries,workoutSafetyIssues,catalog} from '../server/workouts.mjs';
import {foodCommand} from '../server/food.mjs';
import {empty,normalize,command,today} from '../server/coaching.mjs';
import {assertDietDay} from '../diet-patterns.mjs';

const injuries=['knee_pain','lower_back_pain','shoulder_pain','wrist_pain','ankle_pain','neck_pain','hip_pain','diastasis_recti'];
test('0.11: every injury excludes its prohibited movements in plans and alternatives',()=>{
 for(const injury of injuries)for(const fitnessLevel of ['beginner','intermediate','advanced'])for(const location of ['gym_only','home_only']){
  const prefs={injuries:[injury],fitnessLevel,workoutLocation:location,homeEquipment:['dumbbells'],workoutSplitPreference:'ppl',selectedWorkoutDays:[0,2,4],sessionDuration:60};
  const plan=workoutPlan(prefs),s={workoutPlan:plan,onboarding:{workoutPrefs:prefs}};
  for(const d of plan.days)for(const e of d.exercises){assert.ok(isFriendlyForInjuries(e,[injury]));for(const alt of exerciseAlternatives(s,d.dayIndex,e.id))assert.ok(isFriendlyForInjuries(alt,[injury]));}
 }
});
test('0.11: plural names and exhausted candidate pools cannot bypass exclusions',()=>{
 for(const injury of ['knee_pain','hip_pain'])assert.equal(isFriendlyForInjuries({name:'Alternating Reverse Lunges',pattern:'lunge'},[injury]),false);
 assert.equal(isFriendlyForInjuries({name:'Cable Shrug-In',pattern:'scapular_elevation'},['neck_pain']),false);
 const plan=workoutPlan({injuries:['neck_pain'],workoutSplitPreference:'ppl',selectedWorkoutDays:[0,2,4],sessionDuration:90});
 assert.ok(plan.days.find(d=>d.focus==='pull').missing.includes('scapular_elevation'));
 assert.equal(isFriendlyForInjuries({name:'Anything',pattern:'squat'},['unknown_injury']),false);
});
test('0.11: complete intake needs explicit confirmation regardless of calorie total or legacy flag',()=>{
 const s=empty();s.plans=[];
 for(const energy of [1600,2400]){
  foodCommand(s,'food_entry',{source:'manual',slot:'lunch',name:'Actual meal',energy,autoComplete:true});
  assert.equal(s.foodLogs[0].complete,false);
  foodCommand(s,'food_complete',{date:today(),complete:true});assert.equal(s.foodLogs[0].complete,true);assert.ok(s.foodLogs[0].confirmedAt);
 }
 foodCommand(s,'food_delete',{id:s.foodEntries[0].id});assert.equal(s.foodLogs[0].complete,false);
});
test('0.11: old ambiguous completion is reopened once without losing entries or explicit new confirmations',()=>{
 const s=empty();s.foodEntries=[{id:'kept'}];s.foodLogs=[{date:today(),source:'entries',complete:true,energy:1600}];s.adaptations=[{status:'pending',kind:'calories'}];
 normalize(s);assert.equal(s.foodLogs[0].complete,false);assert.equal(s.foodLogs[0].legacyCompletion,true);assert.equal(s.foodEntries.length,1);assert.equal(s.adaptations[0].status,'superseded');
 s.foodLogs[0].complete=true;s.foodLogs[0].confirmedAt=new Date().toISOString();normalize(s);assert.equal(s.foodLogs[0].complete,true);
});
test('0.11: reference sodium is mandatory for DASH, including null, invalid and over-limit totals',()=>{
 const snapshot=value=>({ingredients:[],values:{sodium:value},estimated_values:{sodium:'0'}});
 for(const value of [null,undefined,'NaN',Infinity,-1,'2301'])assert.throws(()=>assertDietDay([snapshot(value)],'dash'));
 assert.throws(()=>assertDietDay([snapshot('1200'),snapshot('1200')],'dash'));
 assert.doesNotThrow(()=>assertDietDay([snapshot('2300')],'dash'));
 assert.doesNotThrow(()=>assertDietDay([snapshot(null)],'balanced'));
});
test('0.11: old unsafe workout plans retain history but lose progression and pending proposals',()=>{
 const s=empty();s.profile={};s.onboarding={workoutPrefs:{injuries:['neck_pain']}};
 s.workoutPlan=workoutPlan({workoutSplitPreference:'ppl',selectedWorkoutDays:[0,2,4],sessionDuration:90});
 const shrug=s.workoutPlan.days.flatMap(d=>d.exercises).find(e=>/shrug/i.test(e.name));assert.ok(shrug);shrug.suggestedKg=50;
 s.adaptations=[{status:'pending',kind:'weekly_volume'}];normalize(s);
 assert.ok(workoutSafetyIssues(s).length);assert.equal(shrug.suggestedKg,undefined);assert.equal(s.adaptations[0].status,'superseded');
 assert.ok(s.workoutPlan.days.flatMap(d=>d.exercises).some(e=>e.id===shrug.id));
});
