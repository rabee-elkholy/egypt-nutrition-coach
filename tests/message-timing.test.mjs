import test from 'node:test';
import assert from 'node:assert/strict';
import {BARRIERS,coachingContext,coachingInbox,currentFeedback,handleCoachingCommand,reconcileCoaching} from '../coaching-journey.mjs';
import {personalBrief} from '../personal-brief.mjs';
import {localDate} from '../coaching-shared.mjs';
const now=Date.parse('2026-10-27T12:00:00Z'),today='2026-10-27';
const state=()=>({revision:0,profile:{timezone:'Africa/Cairo',goal:'lose'},active_plan_id:'n',plans:[{id:'n',days:[]}],workoutPlan:{id:'w',days:[]},serverNow:new Date(now).toISOString(),recovery:{status:'ready'},checkins:[],sessions:[],coachingCases:[],coachingFeedback:[]});
function agreement(s){handleCoachingCommand(s,'coaching_feedback',{domain:'nutrition',barrier:'time'},now);return s.coachingCases[0];}
test('fresh short sleep and fatigue are not hidden by an agreement',()=>{
 for(const [sleepHours,fatigue,key] of [[6,1,'short-sleep'],[8,4,'tired']]){
  const s=state();agreement(s);s.checkins=[{date:today,at:new Date(now).toISOString(),sleepHours,fatigue}];
  assert.equal(personalBrief(s,today).find(n=>n.role==='followup').key,key);
 }
});
test('old programs without program IDs cannot trigger a missed-session question',()=>{
 const s=state();s.sessions=['2026-10-25','2026-10-26'].map(date=>({date,planId:'old',status:'missed'}));
 reconcileCoaching(s,now);assert.equal(s.coachingCases.length,0);
 s.sessions.forEach(x=>x.planId='w');reconcileCoaching(s,now);assert.equal(s.coachingCases.length,1);
});
test('questions expire after seven elapsed days and stop occupying the daily brief',()=>{
 const s=state();s.coachingCases=[{id:'old',domain:'nutrition',context:coachingContext(s,'nutrition'),date:'2026-10-20',createdAt:new Date(now-7*86400000).toISOString(),status:'question',title:'old question',step:'old step'}];
 assert.equal(coachingInbox(s,now-1).items[0].expired,false);
 assert.equal(coachingInbox(s,now).items[0].expired,true);
 assert.notEqual(personalBrief(s,today).find(n=>n.role==='followup').key,'coaching-question');
});
test('proposal expiry is exact elapsed time; decision and inbox agree',()=>{
 const s=state(),c=agreement(s),expiry=now+7*86400000;
 assert.equal(coachingInbox(s,expiry-1).items[0].expired,false);
 assert.equal(coachingInbox(s,expiry).items[0].expired,true);
 assert.throws(()=>handleCoachingCommand(s,'coaching_decision',{id:c.id,accept:true},expiry),e=>e.status===409);
});
test('reviews start on the promised local date across zones and DST transitions',()=>{
 for(const start of ['2026-03-06T12:00:00Z','2026-03-26T12:00:00Z','2026-04-23T12:00:00Z','2026-10-27T12:00:00Z','2026-10-30T12:00:00Z']){
 for(const timezone of ['Africa/Cairo','America/New_York','Europe/London','Asia/Kolkata','Pacific/Kiritimati','Pacific/Honolulu']){
  const s=state();s.profile.timezone=timezone;const begin=Date.parse(start);
  handleCoachingCommand(s,'coaching_feedback',{domain:'nutrition',barrier:'time'},begin);const c=s.coachingCases[0];handleCoachingCommand(s,'coaching_decision',{id:c.id,accept:true},begin);
  let boundary=begin;while(localDate(boundary,timezone)<c.reviewOn)boundary+=3600000;
  while(localDate(boundary-60000,timezone)>=c.reviewOn)boundary-=60000;
  assert.equal(coachingInbox(s,boundary-1).items[0].reviewDue,false,timezone);
  assert.equal(coachingInbox(s,boundary).items[0].reviewDue,true,timezone);
 }
 }
});
test('every barrier has clean wording, no duplicate proposal, and its promised review delay',()=>{
 for(const [domain,barriers] of Object.entries(BARRIERS))for(const barrier of barriers){
  const s=state();handleCoachingCommand(s,'coaching_feedback',{domain,barrier},now);handleCoachingCommand(s,'coaching_feedback',{domain,barrier},now+1);
  assert.equal(s.coachingCases.length,barrier==='none'?0:1);if(barrier==='none')continue;
  const c=s.coachingCases[0];assert.ok(!/undefined|NaN|null/.test(c.title+c.step));
  handleCoachingCommand(s,'coaching_decision',{id:c.id,accept:true},now+2);
  assert.equal((Date.parse(c.reviewOn)-Date.parse(today))/86400000,barrier==='pain'?1:3);
  assert.equal(coachingInbox(s,now+2).items[0].reviewDue,false);
 }
});
test('declined, completed and superseded cases never reappear in active messages',()=>{
 for(const status of ['declined','completed','superseded']){
  const s=state(),c=agreement(s);c.status=status;
  assert.equal(coachingInbox(s,now).items.length,0);
  assert.ok(!personalBrief(s,today).some(n=>n.caseId===c.id));
 }
 const s=state(),c=agreement(s);s.active_plan_id='replacement';
 assert.equal(coachingInbox(s,now).items.length,0);reconcileCoaching(s,now);assert.equal(c.status,'superseded');
});
test('rating memory expires by original local date, never by partial report time',()=>{
 const s=state();handleCoachingCommand(s,'coaching_feedback',{domain:'nutrition',barrier:'hunger',hunger:5},now);
 handleCoachingCommand(s,'coaching_feedback',{domain:'nutrition',barrier:'budget'},now+2*86400000);
 assert.equal(currentFeedback(s,'nutrition','2026-10-29').hunger,5);
 assert.equal(currentFeedback(s,'nutrition','2026-10-30').hunger,null);
});
test('new recorded evidence renews an expired question once; stale evidence never renews it',()=>{
 const s=state();s.sessions=['2026-10-25','2026-10-26'].map(date=>({date,planId:'w',status:'missed'}));
 reconcileCoaching(s,now);const old=s.coachingCases[0];
 reconcileCoaching(s,now+8*86400000);assert.equal(s.coachingCases.length,1);
 s.sessions.push(...['2026-11-02','2026-11-03'].map(date=>({date,planId:'w',status:'missed'})));
 reconcileCoaching(s,now+8*86400000);reconcileCoaching(s,now+8*86400000);
 assert.equal(old.status,'superseded');assert.equal(s.coachingCases.length,2);
 assert.equal(coachingInbox(s,now+8*86400000).items.length,1);
});
test('recovery message expires only after 24 hours and ignores future reports',()=>{
 const s=state();s.checkins=[{date:'2026-10-26',at:new Date(now-86400000).toISOString(),sleepHours:5}];
 assert.equal(personalBrief(s,today).find(n=>n.role==='followup').key,'short-sleep');
 s.serverNow=new Date(now+1).toISOString();assert.notEqual(personalBrief(s,today).find(n=>n.role==='followup').key,'short-sleep');
 s.checkins[0].at=new Date(now+1000).toISOString();assert.notEqual(personalBrief(s,today).find(n=>n.role==='followup').key,'short-sleep');
});
