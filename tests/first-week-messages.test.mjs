import test from 'node:test';
import assert from 'node:assert/strict';
import {firstWeekDay} from '../first-week-messages.mjs';
import {personalBrief} from '../personal-brief.mjs';
import {empty,generate,command} from '../server/coaching.mjs';
import {withClock} from '../server/clock.mjs';
import {dateOffset} from '../coaching-shared.mjs';
const start='2026-10-27';
const draft={name:'أحمد',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const state=(day=1)=>({profile:{name:'أحمد',goal:'lose'},onboarding:{journeyStartedOn:start},active_plan_id:'n',plans:[{id:'n',days:[]}],workoutPlan:{id:'w',programId:'p',days:[]},serverNow:dateOffset(start,day-1)+'T12:00:00Z',recovery:{status:'unknown'},checkins:[]});
const notes=(s,day=1)=>personalBrief(s,dateOffset(start,day-1));
test('first visit welcomes without zero-day judgement or invented success and has one primary action',()=>{
 const list=notes(state());assert.equal(list.filter(n=>n.actionTarget).length,1);
 const n=list.find(n=>n.role==='followup');assert.equal(n.key,'first-week-1');assert.equal(n.actionTarget,'recovery');assert.match(n.text,/أهلًا يا أحمد/);
 assert.doesNotMatch(JSON.stringify(list),/0 أيام|سهّل التسجيل وكرره|أحسنت|جاهز لزيادة/);
});
test('seven local days have distinct stable stage messages; day eight and unknown legacy start use regular briefs',()=>{
 const seen=new Set();for(let day=1;day<=7;day++){
  const s=state(day),a=notes(s,day),b=notes(s,day);assert.deepEqual(a,b);
  const n=a.find(n=>n.role==='followup');assert.equal(n.key,'first-week-'+day);seen.add(n.text);
 }
 assert.equal(seen.size,7);assert.equal(firstWeekDay(state(),dateOffset(start,-1)),null);assert.equal(firstWeekDay(state(),dateOffset(start,7)),null);
 const legacy=state();delete legacy.onboarding.journeyStartedOn;assert.ok(!notes(legacy).some(n=>n.key.startsWith('first-week')));
});
test('one actual action changes the welcome but never claims a whole day or workout was completed',()=>{
 const s=state();s.waterLogs=[{date:start,cups:1}];const n=notes(s).find(n=>n.role==='followup');assert.match(n.text,/أول تسجيل/);assert.doesNotMatch(n.text,/أنهيت|ملتزم|اكتمل/);
 s.waterLogs=[{date:dateOffset(start,1),cups:1}];assert.match(notes(s).find(n=>n.role==='followup').text,/أهلًا/);
});
test('primary action respects service track and current recovery evidence',()=>{
 const nutrition=state();nutrition.workoutPlan=null;assert.equal(notes(nutrition).find(n=>n.actionTarget).actionTarget,'food');
 const training=state();training.active_plan_id=null;training.plans=[];assert.equal(notes(training).find(n=>n.actionTarget).actionTarget,'recovery');
 training.checkins=[{date:start,at:start+'T11:00:00Z',sleepHours:8,fatigue:1}];training.recovery.status='ready';
 assert.equal(notes(training).find(n=>n.actionTarget).actionTarget,'workout');assert.ok(!notes(training).some(n=>n.role==='nutrition'));
});
test('weekly summary counts distinct actual dates, complete food days and scoped completed sessions only',()=>{
 const s=state(7);s.recovery.status='ready';s.foodLogs=[{date:start,complete:true},{date:start,complete:true},{date:dateOffset(start,1),complete:false}];
 s.sessions=[{date:start,dayIndex:2,programId:'p',status:'completed'},{date:start,dayIndex:2,programId:'p',status:'completed'},{date:start,dayIndex:4,programId:'old',status:'completed'},{date:dateOffset(start,1),programId:'p',status:'missed'}];
 const n=notes(s,7).find(n=>n.role==='followup');assert.match(n.text,/تسجيلات في 2 من/);assert.match(n.text,/سجل الأكل فيها: 1/);assert.match(n.text,/جلسات مسجلة مكتملة: 1/);assert.equal(n.actionTarget,'feedback');
});
test('first-week onboarding never hides safety, low sleep, fatigue, high hunger or explicit agreements',()=>{
 for(const status of ['stop','hold','high','caution']){const s=state();s.recovery.status=status;assert.ok(!notes(s).some(n=>n.key.startsWith('first-week')));}
 for(const [sleepHours,fatigue,key] of [[5,1,'short-sleep'],[8,5,'tired']]){const s=state();s.checkins=[{date:start,at:start+'T11:00:00Z',sleepHours,fatigue}];assert.equal(notes(s).find(n=>n.role==='followup').key,key);}
 const s=state();s.coachingFeedback=[{domain:'nutrition',date:start,at:start+'T11:00:00Z',context:JSON.stringify(['n','lose']),hunger:5}];assert.ok(notes(s).some(n=>n.key==='high-hunger'));assert.ok(!notes(s).some(n=>n.key.startsWith('first-week')));
 s.coachingFeedback=[];s.coachingCases=[{id:'c',domain:'nutrition',context:JSON.stringify(['n','lose']),createdAt:start+'T11:00:00Z',status:'accepted',reviewOn:dateOffset(start,3),title:'Agreement',step:'Step'}];assert.equal(notes(s).find(n=>n.role==='followup').key,'coaching-accepted');
});
test('successful onboarding anchor persists through profile edits, track changes and weekly renewal',()=>{
 const initial=Date.parse(start+'T12:00:00Z');let s=withClock(initial,()=>generate(empty(),draft,'first-week-anchor'));
 assert.equal(s.onboarding.journeyStartedOn,start);
 withClock(initial+8*86400000,()=>{command(s,'renew_plan',{});assert.equal(s.onboarding.journeyStartedOn,start);s=generate(s,{...draft,serviceTrack:'workouts_only'},'first-week-edit');});
 assert.equal(s.onboarding.journeyStartedOn,start);assert.equal(firstWeekDay(s,dateOffset(start,8)),null);
 delete s.onboarding.journeyStartedOn;withClock(initial+10*86400000,()=>generate(s,draft,'legacy'));assert.equal(s.onboarding.journeyStartedOn,undefined);
});
