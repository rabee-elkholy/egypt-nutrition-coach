import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate,command,review} from '../server/coaching.mjs';
import {withClock} from '../server/clock.mjs';
import {currentFeedback,handleCoachingCommand} from '../coaching-journey.mjs';
import {personalBrief} from '../personal-brief.mjs';
const now=Date.parse('2026-10-26T12:00:00Z'),today='2026-10-26';
const draft={name:'Feedback memory',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const account=()=>withClock(now,()=>generate(empty(),draft,'feedback-memory'));
const report=(s,p,at=now)=>handleCoachingCommand(s,'coaching_feedback',{domain:'nutrition',...p},at);
function plateau(){
 const s=account();s.nutritionContextStartedOn='2026-10-13';
 withClock(now,()=>command(s,'recovery',{sleepHours:8,sleepQuality:4,fatigue:1,stress:1,pain:false,illness:false,redFlags:false}));
 for(let i=0;i<14;i++){const date=new Date(now-i*86400000).toISOString().slice(0,10);s.weights.push({date,kg:80});s.foodLogs.push({date,complete:true,energy:s.plans[0].targets.energy,adherence:100});}
 return s;
}
test('partial reports preserve each recent metric and its actual observation date without mutating history',()=>{
 const s=account();report(s,{barrier:'hunger',hunger:5,energy:1,satiety:2});
 const original=structuredClone(s.coachingFeedback[0]);report(s,{barrier:'budget'},now+86400000);
 const before=JSON.stringify(s),f=currentFeedback(s,'nutrition','2026-10-27');
 assert.equal(f.barrier,'budget');assert.equal(f.hunger,5);assert.equal(f.energy,1);assert.equal(f.satiety,2);
 assert.equal(f.metricEvidence.hunger.date,today);assert.equal(f.metricEvidence.hunger.feedbackId,original.id);
 assert.deepEqual(s.coachingFeedback[0],original);assert.equal(JSON.stringify(s),before);
});
test('an explicit rating supersedes only that metric; null and absent ratings do not clear evidence',()=>{
 const s=account();report(s,{barrier:'hunger',hunger:5,energy:1});
 report(s,{barrier:'none',hunger:2,energy:null},now+1000);
 const f=currentFeedback(s,'nutrition',today);assert.equal(f.hunger,2);assert.equal(f.energy,1);
 report(s,{barrier:'budget',energy:4},now+2000);
 assert.equal(currentFeedback(s,'nutrition',today).hunger,2);assert.equal(currentFeedback(s,'nutrition',today).energy,4);
});
test('omissions never refresh old metric expiry, and domains, contexts and future dates stay isolated',()=>{
 const s=account();report(s,{barrier:'hunger',hunger:5,energy:1});
 report(s,{barrier:'budget'},now+2*86400000);report(s,{barrier:'time'},now+3*86400000);
 assert.equal(currentFeedback(s,'nutrition','2026-10-28').hunger,5);
 assert.equal(currentFeedback(s,'nutrition','2026-10-29').hunger,null);
 const other=account();report(other,{barrier:'hunger',hunger:5});
 other.active_plan_id='other-plan';report(other,{barrier:'budget'},now+1000);
 assert.equal(currentFeedback(other,'nutrition',today).hunger,null);
 assert.equal(currentFeedback(other,'training',today),undefined);
 assert.equal(currentFeedback(other,'nutrition','2026-10-25'),undefined);
});
test('missing hunger or energy cannot remove the calorie-cut proposal guard',()=>withClock(now,()=>{
 const s=plateau();review(s);assert.equal(s.lastReview.nutrition.action,'propose');
 report(s,{barrier:'hunger',hunger:5,energy:1});report(s,{barrier:'budget'},now+1000);review(s);
 assert.equal(s.lastReview.nutrition.reasonCode,'APPETITE_ENERGY_REVIEW_REQUIRED');
 assert.equal(s.adaptations.some(a=>a.status==='pending'&&a.kind==='calories'),false);
 report(s,{barrier:'none',hunger:2,energy:4},now+2000);review(s);
 assert.equal(s.lastReview.nutrition.action,'propose');
}));
test('accepting a retained calorie cut rechecks all recent metrics after a partial report',()=>withClock(now,()=>{
 const s=plateau();review(s);const a=s.adaptations.find(a=>a.status==='pending'&&a.kind==='calories');assert.ok(a);
 s.revision=a.baseRevision;
 report(s,{barrier:'hunger',hunger:5,energy:1});report(s,{barrier:'budget'},now+1000);
 const plans=JSON.stringify(s.plans);
 assert.throws(()=>command(s,'adaptation',{id:a.id,accept:true}),/الجوع أو الطاقة/);
 assert.equal(JSON.stringify(s.plans),plans);assert.equal(a.status,'pending');
}));
test('hunger message attributes the rating to its original date rather than a newer unrelated report',()=>{
 const s=account();report(s,{barrier:'hunger',hunger:5});report(s,{barrier:'budget'},now+86400000);
 const notes=personalBrief({...s,serverNow:new Date(now+86400000).toISOString(),recovery:{status:'ready'}},'2026-10-27');
 const n=notes.find(n=>n.key==='high-hunger');assert.ok(n);assert.match(n.text,/2026-10-26/);assert.doesNotMatch(n.text,/2026-10-27/);
});
