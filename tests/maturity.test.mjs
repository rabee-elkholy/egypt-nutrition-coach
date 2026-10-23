import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate,command,today} from '../server/coaching.mjs';
import {recovery,calorieReview} from '../server/recovery.mjs';
import {dayTotals} from '../server/food.mjs';
import {dateOffset,effectiveSets} from '../coaching-shared.mjs';
import {healthyCheckin} from './helpers.mjs';
const draft={name:'Lifecycle',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5]};
const fixture=generate(empty(),draft,'maturity-fixture');
const history=()=>Array.from({length:14},(_,i)=>({date:dateOffset(today(),-i),kg:80}));
test('MAT-01: pain logged after a healthy check-in blocks progression until reassessed',()=>{
 const now=Date.now(),checkin=healthyCheckin(0,{at:new Date(now-60000).toISOString()}),log={date:today(),at:new Date(now-1000).toISOString(),sets:[{kg:20,reps:10,pain:true}]};
 assert.equal(recovery([checkin],now,[log]).status,'hold');
 assert.equal(recovery([checkin],now,[log]).progressionAllowed,false);
 assert.equal(recovery([{...checkin,at:new Date(now).toISOString()}],now,[log]).status,'ready');
 assert.equal(recovery([checkin],now,[{...log,date:dateOffset(today(),-10)}]).status,'ready','editing old pain is not new pain today');
 assert.equal(recovery([{...checkin,redFlags:true}],now,[log]).status,'stop');
});
test('MAT-02: accepted caution deload actually reduces a two-set prescription',()=>{
 const s=structuredClone(fixture);s.sessionAdjustment={planId:s.workoutPlan.id,setFactor:.8,expiresAt:new Date(Date.now()+60000).toISOString()};
 assert.equal(effectiveSets(s,{sets:2}),1);assert.equal(effectiveSets(s,{sets:1}),1);
 assert.equal(effectiveSets(s,{sets:2},dateOffset(today(),-1)),2);
});
test('MAT-03: switching goal resets review context while preserving real history',()=>{
 let s=structuredClone(fixture);s.weights=history();s.foodLogs=s.weights.map(w=>({date:w.date,energy:2200,adherence:100,complete:true}));s.lastReview={message:'old goal'};s.checkins=[healthyCheckin()];
 const actual=JSON.stringify({weights:s.weights,foodLogs:s.foodLogs});
 s=generate(s,{...draft,goal:'gain',targetWeight:85},'maturity-new-goal');
 assert.equal(s.lastReview,null);s=command(s,'review',{});
 assert.equal(s.lastReview.nutrition.action,'hold');assert.ok(!s.adaptations.some(a=>a.status==='pending'&&a.kind==='calories'));
 assert.equal(JSON.stringify({weights:s.weights,foodLogs:s.foodLogs}),actual);
});
test('MAT-04: maintenance reviews detect sustained weight drift with sufficient evidence',()=>{
 for(const [direction,sign]of [[1,-1],[-1,1]]){
  const weights=history().map((w,i)=>({...w,kg:i<7?80+direction:80})),food=weights.map(w=>({date:w.date,energy:2000,adherence:100,complete:true}));
  const result=calorieReview(weights,food,'maintain',2000);assert.equal(result.action,'propose');assert.equal(Math.sign(result.delta),sign);
  assert.equal(calorieReview(weights,food.slice(0,2),'maintain',2000).action,'hold');
 }
});
test('MAT-05: diary API totals agree with the legacy total shown by the website',()=>{
 const s=structuredClone(fixture);s.foodLogs=[{date:today(),energy:2150,complete:true,source:'daily_total',plannedEnergy:2200}];
 const result=dayTotals(s,today());assert.equal(result.totals.energy,2150);assert.equal(result.totals.protein,null);assert.equal(result.complete,true);
});
test('MAT-06: legacy daily completion flags cannot silently coerce strings to false',()=>{
 assert.throws(()=>command(structuredClone(fixture),'food',{date:today(),energy:2000,complete:'true'}));
});
test('MAT-07: fresh evidence clears the old review and supersedes its pending proposals',()=>{
 const s=structuredClone(fixture);s.lastReview={message:'old review'};s.adaptations=[{id:'old',status:'pending'}];
 const next=command(s,'weight',{kg:79.9});assert.equal(next.lastReview,null);assert.equal(next.adaptations[0].status,'superseded');
});
