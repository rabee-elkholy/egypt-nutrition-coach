import test from 'node:test';import assert from 'node:assert/strict';
import {withinElapsed,unexpired,DAY_MS,localDate,dateOffset} from '../coaching-time.mjs';
import {latestRecord,sessionBelongsToProgram} from '../coaching-evidence.mjs';
import {createBriefSelector} from '../coaching-summary.mjs';
import {empty,generate,command} from '../server/coaching.mjs';
test('elapsed freshness and expiry retain distinct exact-boundary semantics across DST and local dates',()=>{
 const at='2026-10-29T21:59:59Z',ts=Date.parse(at);assert.equal(withinElapsed(at,ts+DAY_MS),true);assert.equal(withinElapsed(at,ts+DAY_MS+1),false);assert.equal(withinElapsed(at,ts-1),false);assert.equal(unexpired(at,ts),false);assert.equal(unexpired(at,ts-1),true);
 assert.equal(dateOffset('2026-10-30',1),'2026-10-31');assert.match(localDate(ts,'Africa/Cairo'),/^2026-10-/);
});
test('single-pass latest selection preserves stable-sort ties and program membership',()=>{
 const records=[{date:'2026-10-26',at:'invalid',n:1},{date:'2026-10-27',n:2},{date:'2026-10-27',n:3}];assert.equal(latestRecord(records).n,3);assert.equal(sessionBelongsToProgram({planId:'old',programId:'p'},{id:'new',programId:'p'}),true);assert.equal(sessionBelongsToProgram({planId:'old',programId:'q'},{id:'new',programId:'p'}),false);
});
test('brief memoization never crosses revision, date, identity or server-clock changes',()=>{
 let calls=0;const select=createBriefSelector(()=>++calls),s={revision:1,serverNow:'2026-10-27T12:00:00Z'};assert.equal(select(s,'2026-10-27'),1);assert.equal(select(s,'2026-10-27'),1);s.serverNow='2026-10-27T12:00:01Z';assert.equal(select(s,'2026-10-27'),2);s.revision++;assert.equal(select(s,'2026-10-27'),3);assert.equal(select({...s},'2026-10-27'),4);assert.equal(select(s,'2026-10-28'),5);
});
test('invalid settings cannot partially alter direct command input or discard a pending decision',()=>{
 const s=generate(empty(),{name:'Atomic',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_only',dietType:'balanced'},'atomic-quality');command(s,'review',{});const before=JSON.stringify(s);assert.throws(()=>command(s,'notification_preferences',{dailyReminder:false,quietHoursStart:'27:00'}));assert.equal(JSON.stringify(s),before);
});
