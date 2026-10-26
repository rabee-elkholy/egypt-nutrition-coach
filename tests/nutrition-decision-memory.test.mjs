import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate,command} from '../server/coaching.mjs';
import {withClock} from '../server/clock.mjs';
import {dateOffset} from '../coaching-shared.mjs';
import {personalBrief} from '../personal-brief.mjs';

const now=Date.parse('2026-10-24T12:00:00Z'),date='2026-10-24';
function fixture(maintenance=false){
 const s=generate(empty(),{name:'Nutrition decisions',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:maintenance?79:65,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true},'nutrition-memory');
 s.nutritionContextStartedOn=dateOffset(date,-20);
 s.weights=Array.from({length:14},(_,i)=>({date:dateOffset(date,-i),kg:maintenance?79:80}));
 s.foodLogs=s.weights.map(w=>({date:w.date,complete:true,energy:s.plans[0].targets.energy,adherence:100}));
 s.checkins=[{date,at:new Date(now).toISOString(),sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false}];return s;
}
const run=(s,a,p={})=>{const next=command(structuredClone(s),a,p);next.revision++;return next;};
function rejected(maintenance=false){const reviewed=run(fixture(maintenance),'review'),proposal=reviewed.adaptations.find(a=>a.kind===(maintenance?'maintenance':'calories')&&a.status==='pending');assert.ok(proposal);return {state:run(reviewed,'adaptation',{id:proposal.id,accept:false}),id:proposal.id};}

test('declined calorie adjustment is not proposed again without new nutrition evidence',()=>withClock(now,()=>{
 const {state,id}=rejected(),before=JSON.stringify(state.plans);
 let next=run(state,'water',{date,cups:5});next=run(next,'review');
 assert.equal(next.lastReview.nutrition.reasonCode,'CALORIE_ADVICE_DECLINED');
 assert.equal(next.adaptations.filter(a=>a.kind==='calories'&&a.status==='pending').length,0);
 assert.equal(next.adaptations.find(a=>a.id===id).status,'rejected');assert.equal(JSON.stringify(next.plans),before);
 const logged=run(next,'water',{date,cups:6});assert.equal(logged.lastReview,null);
 assert.equal(personalBrief({...logged,serverNow:new Date(now).toISOString()},date).find(n=>n.role==='nutrition').key,'calories-declined');
}));
test('a fresh recovery timestamp alone does not erase a nutrition decision',()=>withClock(now,()=>{
 const {state}=rejected();return withClock(now+3600000,()=>{
  let next=run(state,'recovery',{sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false});next=run(next,'review');
  assert.equal(next.lastReview.nutrition.reasonCode,'CALORIE_ADVICE_DECLINED');
 });
}));
test('new weight evidence permits reconsideration and retains the old rejection',()=>withClock(now,()=>{
 const {state,id}=rejected();let next=run(state,'weight',{date,kg:79.9});next=run(next,'review');
 assert.ok(next.adaptations.some(a=>a.kind==='calories'&&a.status==='pending'));
 assert.equal(next.adaptations.find(a=>a.id===id).status,'rejected');
}));
test('declined maintenance transition respects the same nutrition evidence',()=>withClock(now,()=>{
 const {state,id}=rejected(true),next=run(state,'review');
 assert.equal(next.lastReview.nutrition.reasonCode,'MAINTENANCE_ADVICE_DECLINED');
 assert.equal(next.adaptations.filter(a=>a.kind==='maintenance'&&a.status==='pending').length,0);
 assert.equal(next.adaptations.find(a=>a.id===id).status,'rejected');assert.equal(next.profile.goal,'lose');
}));
