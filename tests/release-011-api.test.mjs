import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';
import {empty,generate,today} from '../server/coaching.mjs';
import {foodCommand} from '../server/food.mjs';

test('0.11 HTTP/D1: ambiguous old completion reopens, explicit confirmation persists without losing intake',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  const s=generate(empty(),{name:'Legacy',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[0,2,4],workoutSplitPreference:'ppl',sessionDuration:90},'legacy-011');
  foodCommand(s,'food_entry',{source:'manual',name:'Recorded meal',energy:1600,slot:'lunch'});
  s.foodLogs[0].complete=true;delete s.foodLogs[0].completionPolicy;delete s.foodLogs[0].confirmedAt;
  s.onboarding.workoutPrefs.injuries=['neck_pain'];
  s.checkins=[{at:new Date().toISOString(),date:today(),redFlags:true}];
  s.adaptations=[{id:'old',kind:'calories',status:'pending',baseRevision:0,delta:-100}];
  await db.prepare('INSERT INTO coaching_accounts(user_id,revision,body) VALUES(?,?,?)').bind('legacy-011',0,JSON.stringify(s)).run();
  const headers={'oai-authenticated-user-id':'legacy-011'};
  const read=async()=>await(await mf.dispatchFetch('https://test.local/v1/state',{headers})).json();
  let state=await read();assert.equal(state.recovery.status,'stop');assert.ok(state.workoutSafetyIssues.length);assert.equal(state.foodLogs[0].complete,false);assert.equal(state.foodEntries.length,1);assert.equal(state.adaptations[0].status,'superseded');
  const response=await mf.dispatchFetch('https://test.local/v1/commands',{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':'confirm-011'},body:JSON.stringify({revision:0,action:'food_complete',payload:{date:today(),complete:true}})});
  assert.equal(response.status,200,await response.text());
  state=await read();assert.equal(state.foodLogs[0].complete,true);assert.ok(state.foodLogs[0].confirmedAt);assert.equal(state.foodLogs[0].completionPolicy,1);assert.equal(state.foodEntries[0].snapshot.values.energy,'1600');
 }finally{await mf.dispose();}
});
