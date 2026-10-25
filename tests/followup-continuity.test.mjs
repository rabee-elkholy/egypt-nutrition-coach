import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate,command} from '../server/coaching.mjs';
import {recovery} from '../server/recovery.mjs';
import {withClock} from '../server/clock.mjs';
import {effectiveSets} from '../coaching-shared.mjs';
import {personalBrief} from '../personal-brief.mjs';

const now=Date.parse('2026-10-24T12:00:00Z'),date='2026-10-24';
const draft={name:'متابعة واقعية',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const checkin={date,at:new Date(now).toISOString(),sleepHours:4,sleepQuality:1,fatigue:5,stress:5,soreness:8,pain:false,illness:false,redFlags:false};
function reviewed(){let s=generate(empty(),draft,'followup-continuity');s.checkins=[structuredClone(checkin)];s=command(s,'review',{});s.revision++;const proposal=s.adaptations.find(a=>a.kind==='recovery'&&a.status==='pending');assert.ok(proposal);return {s,proposal};}
function decide(accept){const {s,proposal}=reviewed();const next=command(s,'adaptation',{id:proposal.id,accept});next.revision++;return next;}
const view=s=>({...s,serverNow:new Date(now).toISOString(),serverDate:date,recovery:recovery(s.checkins,now,s.workoutLogs,'Africa/Cairo')});

test('accepted recovery advice changes effective sets and is not requested again for the same evidence',()=>withClock(now,()=>{
 const s=decide(true),base=JSON.stringify(s.workoutPlan);
 assert.equal(effectiveSets(s,{sets:5},date,now),3);
 const next=command(s,'review',{});
 assert.equal(next.adaptations.filter(a=>a.kind==='recovery'&&a.status==='pending').length,0);
 assert.equal(JSON.stringify(next.workoutPlan),base,'Permanent program remains intact');
}));
test('declined recovery advice is respected until new check-in evidence arrives',()=>withClock(now,()=>{
 const s=decide(false),base=JSON.stringify(s.workoutPlan),next=command(s,'review',{});
 assert.equal(next.sessionAdjustment,null);
 assert.equal(JSON.stringify(next.workoutPlan),base);
 assert.equal(next.adaptations.filter(a=>a.kind==='recovery'&&a.status==='pending').length,0);
 return withClock(now+1000,()=>{const changed=command(next,'recovery',{...checkin,sleepHours:3});command(changed,'review',{});assert.equal(changed.adaptations.filter(a=>a.kind==='recovery'&&a.status==='pending').length,1);});
}));
test('personal follow-up acknowledges an active accepted adjustment rather than asking for agreement again',()=>withClock(now,()=>{
 const s=decide(true),message=personalBrief(view(s),date).find(m=>m.role==='training');
 assert.equal(message.key,'adjustment-active');assert.match(message.text,/وافقت/);
 const expired={...s,sessionAdjustment:{...s.sessionAdjustment,expiresAt:new Date(now-1).toISOString()}};
 assert.notEqual(personalBrief(view(expired),date).find(m=>m.role==='training').key,'adjustment-active');
 const wrongPlan={...s,sessionAdjustment:{...s.sessionAdjustment,planId:'other-plan'}};
 assert.notEqual(personalBrief(view(wrongPlan),date).find(m=>m.role==='training').key,'adjustment-active');
}));
test('recovery proposal text describes variable set reduction truthfully',()=>withClock(now,()=>{
 const {s,proposal}=reviewed();const accepted=command(s,'adaptation',{id:proposal.id,accept:true});
 assert.equal(effectiveSets(accepted,{sets:5},date,now),3);
 assert.doesNotMatch(proposal.reason,/تخفيف جولة واحدة/);
}));
test('an adaptation cannot be accepted exactly at its expiry boundary',()=>withClock(now,()=>{
 const {s,proposal}=reviewed();proposal.expiresAt=new Date(now).toISOString();
 assert.throws(()=>command(s,'adaptation',{id:proposal.id,accept:true}),/انتهت/);
 assert.equal(s.sessionAdjustment,null);
}));
test('first check-in follow-up cites measured sleep without inventing a personal baseline',()=>{
 const result=recovery([checkin],now,[],'Africa/Cairo');assert.equal(result.baselineReady,false);
 assert.doesNotMatch(result.reasons.join(' '),/المعتاد/);
 assert.match(result.reasons.join(' '),/4/);
});
test('muscle soreness is not attributed to a previous workout without workout evidence',()=>{
 const result=recovery([checkin],now,[],'Africa/Cairo');
 assert.ok(result.domains.includes('soreness'));assert.doesNotMatch(result.reasons.join(' '),/من التمرين السابق/);
});

test('logging water after declining advice does not make personal follow-up forget that decision',()=>withClock(now,()=>{
 const s=decide(false),next=command(s,'water',{date,cups:3});
 assert.equal(next.lastReview,null,'Ordinary logging invalidates the cached review');
 const note=personalBrief(view(next),date).find(m=>m.role==='training');
 assert.equal(note.key,'fatigue-declined');assert.match(note.text,/رفضك السابق/);
}));

test('a completed session is acknowledged even without a recovery check-in, without clearing the unknown state',()=>{
 const state={profile:{name:'متابعة',goal:'maintain'},workoutPlan:{id:'p',programId:'program',days:[]},sessions:[{date,planId:'p',programId:'program',status:'completed',duration:30}],recovery:{status:'unknown',reasons:[]},serverNow:new Date(now).toISOString()};
 const note=personalBrief(state,date).find(m=>m.role==='training');
 assert.equal(note.key,'completed');assert.match(note.text,/30/);assert.match(note.text,/مفيش متابعة استشفاء حديثة/);
 assert.equal(state.recovery.status,'unknown');assert.match(note.action,/حالتي|حالتك/);
});
