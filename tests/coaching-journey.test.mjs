import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate,command,review} from '../server/coaching.mjs';
import {accountRecovery} from '../server/recovery.mjs';
import {volumeReview} from '../server/training-review.mjs';
import {withClock} from '../server/clock.mjs';
import {coachingInbox,reconcileCoaching} from '../coaching-journey.mjs';
import {personalBrief} from '../personal-brief.mjs';
const now=Date.parse('2026-10-26T12:00:00Z');
const draft={name:'Journey',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const account=()=>generate(empty(),draft,'journey-tests');
const healthy={sleepHours:8,sleepQuality:4,fatigue:1,stress:1,pain:false,illness:false,redFlags:false};
test('coaching agreement preserves the actual plan, remembers acknowledgement and measures only user-reported outcome',()=>withClock(now,()=>{
 const s=account(),plans=JSON.stringify([s.plans,s.workoutPlan]);
 command(s,'coaching_feedback',{domain:'nutrition',barrier:'time',hunger:3,satiety:3,energy:4});
 const c=s.coachingCases[0];
 assert.equal(c.status,'proposed');assert.equal(coachingInbox(s,now).items[0].readStatus,'UNKNOWN');
 command(s,'coaching_ack',{id:c.id});assert.equal(coachingInbox(s,now).items[0].readStatus,'ACKNOWLEDGED');
 command(s,'coaching_decision',{id:c.id,accept:true});
 assert.equal(c.reviewOn,'2026-10-29');assert.equal(coachingInbox(s,now).items[0].deliveryStatus,'NOT_SENT');
 assert.throws(()=>command(s,'coaching_outcome',{id:c.id,outcome:'helped'}),/موعد/);
 withClock(now+3*86400000,()=>command(s,'coaching_outcome',{id:c.id,outcome:'helped'}));
 assert.deepEqual(c.outcome,{value:'helped',at:'2026-10-29T12:00:00.000Z',source:'user_report'});
 assert.equal(coachingInbox(s,now+3*86400000).items.length,0);
 assert.equal(JSON.stringify([s.plans,s.workoutPlan]),plans);
}));
test('duplicate reports do not duplicate agreements and invalid feedback cannot alter the account',()=>withClock(now,()=>{
 const s=account();command(s,'coaching_feedback',{domain:'training',barrier:'time'});command(s,'coaching_feedback',{domain:'training',barrier:'time'});
 assert.equal(s.coachingCases.length,1);
 for(const payload of [{domain:'__proto__',barrier:'time'},{domain:'training',barrier:'budget'},{domain:'nutrition',barrier:'time',hunger:0},{domain:'nutrition',barrier:'time',energy:'5'}]){
  const before=JSON.stringify(s);assert.throws(()=>command(s,'coaching_feedback',payload));assert.equal(JSON.stringify(s),before);
 }
 const c=s.coachingCases[0];command(s,'coaching_decision',{id:c.id,accept:false});
 assert.throws(()=>command(s,'coaching_decision',{id:c.id,accept:true}),/بالفعل/);
 assert.throws(()=>command(s,'coaching_ack',{id:'other-user-case'}),e=>e.status===404);
}));
test('stale proposals renew only on fresh explicit feedback; context changes retire agreements',()=>withClock(now,()=>{
 const s=account();command(s,'coaching_feedback',{domain:'nutrition',barrier:'budget'});const old=s.coachingCases[0];
 withClock(now+7*86400000,()=>{
  assert.throws(()=>command(s,'coaching_decision',{id:old.id,accept:true}),/قديم/);
  command(s,'coaching_feedback',{domain:'nutrition',barrier:'budget'});
 });
 assert.equal(old.status,'superseded');assert.equal(s.coachingCases.length,2);
 s.active_plan_id='new-plan';reconcileCoaching(s,now+8*86400000);
 assert.equal(coachingInbox(s,now+8*86400000).items.length,0);
}));
test('pain reported through barriers blocks progression until a later explicit health reassessment',()=>withClock(now,()=>{
 const s=account();command(s,'recovery',healthy);command(s,'coaching_feedback',{domain:'training',barrier:'pain'});
 assert.equal(accountRecovery(s,now).reasonCode,'FEEDBACK_PAIN_HOLD');
 withClock(now+86400000*4,()=>{
  command(s,'coaching_feedback',{domain:'training',barrier:'none'});
  assert.equal(accountRecovery(s).progressionAllowed,false);
  command(s,'recovery',healthy);assert.equal(accountRecovery(s).status,'ready');
 });
}));
test('fresh high hunger blocks a calorie cut despite otherwise sufficient plateau evidence',()=>withClock(now,()=>{
 const s=account();s.nutritionContextStartedOn='2026-10-13';command(s,'recovery',healthy);
 for(let i=0;i<14;i++){const date=new Date(now-i*86400000).toISOString().slice(0,10);s.weights.push({date,kg:80});s.foodLogs.push({date,complete:true,energy:s.plans[0].targets.energy,adherence:100});}
 review(s);assert.equal(s.lastReview.nutrition.action,'propose');
 command(s,'coaching_feedback',{domain:'nutrition',barrier:'hunger',hunger:5,energy:2});review(s);
 assert.equal(s.lastReview.nutrition.reasonCode,'APPETITE_ENERGY_REVIEW_REQUIRED');
 assert.equal(s.adaptations.filter(a=>a.status==='pending'&&a.kind==='calories').length,0);
}));
test('repeated explicitly missed sessions ask for a cause without assuming fatigue or punishing missing logs',()=>withClock(now,()=>{
 const s=account();reconcileCoaching(s,now);assert.equal(s.coachingCases.length,0);
 s.sessions=[{date:'2026-10-24',status:'missed',planId:s.workoutPlan.id},{date:'2026-10-25',status:'missed',planId:s.workoutPlan.id}];
 reconcileCoaching(s,now);reconcileCoaching(s,now);assert.equal(s.coachingCases.length,1);
 assert.equal(s.coachingCases[0].status,'question');assert.equal(s.coachingCases[0].barrier,null);
}));
test('due agreement replaces a generic tip but cannot override an urgent safety note',()=>withClock(now,()=>{
 const s=account();command(s,'coaching_feedback',{domain:'nutrition',barrier:'time'});command(s,'coaching_decision',{id:s.coachingCases[0].id,accept:true});
 const state={...s,serverNow:new Date(now+3*86400000).toISOString(),recovery:{status:'ready'}};
 assert.match(personalBrief(state,'2026-10-29').find(n=>n.role==='followup').text,/موعد/);
 state.recovery={status:'stop',reasons:['أعراض تستدعي التقييم']};assert.equal(personalBrief(state,'2026-10-29').find(n=>n.role==='followup').key,'safety-support');
}));
test('no-data training hold never claims proven optimal volume or progress',()=>withClock(now,()=>{
 const result=volumeReview(account(),{status:'unknown'});
 assert.doesNotMatch(result.reason,/مضبوط تمام|تطور ممتاز|مناسب جداً/);
}));
