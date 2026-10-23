import test from 'node:test';
import assert from 'node:assert/strict';
import {splitReview} from '../split-review.mjs';
import {seedPick,NUTRITION} from '../coach-messages.mjs';
const today='2026-10-23';
const state=()=>({workoutPlan:{id:'p',programId:'program',split:'full_body',days:[0,2,4,6].map(dayIndex=>({dayIndex}))},recovery:{status:'ready'},sessions:Array.from({length:29},(_,i)=>({programId:'program',date:new Date(Date.parse(today)-(56-i*2)*86400000).toISOString().slice(0,10),status:'completed'}))});
test('split review requires eight weeks and current program evidence',()=>{const s=state();assert.equal(splitReview(s,today).kind,'suggest');assert.equal(splitReview(s,'2026-10-22'),null);s.workoutPlan.programId='other';assert.equal(splitReview(s,today),null);});
test('split review respects recovery, attendance and available days',()=>{const s=state();s.recovery.status='hold';assert.equal(splitReview(s,today).kind,'recovery');s.recovery.status='ready';s.workoutPlan.days.pop();assert.equal(splitReview(s,today).kind,'stay');s.sessions=s.sessions.slice(0,2);assert.equal(splitReview(s,today).kind,'consistency');s.workoutPlan.split='upper_lower';assert.equal(splitReview(s,today),null);});
test('daily messages rotate without adjacent repeats and remain stable within a day',()=>{const pool=NUTRITION.planReady;assert.equal(seedPick(pool,today+':pr'),seedPick(pool,today+':pr'));assert.notEqual(seedPick(pool,today+':pr'),seedPick(pool,'2026-10-24:pr'));});
