import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';
import {loadAccount,saveAccount,sha256Hex} from '../server/store.mjs';
import {command,generate,empty} from '../server/coaching.mjs';

const draft={name:'Synthetic privacy regression',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dailyActivity:'light',dietType:'balanced',region:'egypt',budget:'medium',mealsCount:4,selectedWorkoutDays:[1,3,5],healthConfirmed:true};

test('full account deletion clears its simulation namespace and blocks in-flight resurrection',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  let seq=0;
  const req=(user,endpoint,body,method=body?'POST':'GET')=>mf.dispatchFetch('https://privacy.local/v1/'+endpoint,{method,headers:{'oai-authenticated-user-id':user,'Content-Type':'application/json','Idempotency-Key':'privacy-'+ ++seq},...(body?{body:JSON.stringify(body)}:{})});
  for(const user of ['privacy-a','privacy-b']){
   assert.equal((await req(user,'commands',{revision:0,action:'generate',payload:draft})).status,200);
   assert.equal((await req(user,'commands?simulation=1',{revision:0,action:'simulation_reset',payload:{source:'current'}})).status,200);
  }
  const simulation='__simulation__:'+await sha256Hex('privacy-a');
  const before=await loadAccount(db,simulation),late=command(structuredClone(before),'water',{cups:4});late.revision=before.revision+1;
  const deletion=await req('privacy-a','account/delete',{confirm:true},'DELETE');assert.equal(deletion.status,200);assert.equal((await deletion.json()).namespacesCleared,2);
  for(const table of ['coaching_accounts','coaching_requests','coaching_plans','coaching_workout_plans','coaching_changes','coaching_sync_outbox','coaching_food_entries','coaching_water_logs']){
   const row=await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id IN (?,?)`).bind('privacy-a',simulation).first();assert.equal(row.n,0,'Residual data in '+table);
  }
  for(const identity of ['privacy-a',simulation])assert.ok(await db.prepare("SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id='__deleted__'").bind(identity).first());
  await assert.rejects(()=>saveAccount(db,simulation,late,before.revision,{key:'late-simulation',digest:'late',action:'water',previousState:before}),e=>e.status===409);
  assert.equal((await req('privacy-a','state')).status,401);
  assert.equal((await req('privacy-a','state?simulation=1')).status,401);
  assert.equal((await req('privacy-b','state')).status,200);
  assert.equal((await req('privacy-b','state?simulation=1')).status,200);
 }finally{await mf.dispose();}
});

test('account deletion in simulation mode is rejected without deleting either account',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  const headers={'oai-authenticated-user-id':'privacy-mode','Content-Type':'application/json','Idempotency-Key':'mode-gen'};
  const post=(endpoint,body)=>mf.dispatchFetch('https://privacy.local/v1/'+endpoint,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post('commands',{revision:0,action:'generate',payload:draft})).status,200);
  const response=await post('account/delete?simulation=1',{confirm:true});assert.equal(response.status,400);assert.equal((await response.json()).code,'ACCOUNT_DELETION_SIMULATION_FORBIDDEN');
  assert.ok(await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind('privacy-mode').first());
 }finally{await mf.dispose();}
});

test('quiet-hours clock values must be valid HH:mm with 00-23 hours and 00-59 minutes',()=>{
 for(const key of ['quietHoursStart','quietHoursEnd']){
  for(const value of ['24:00','99:99','12:60','-1:20','7:00'])assert.throws(()=>command(generate(empty(),draft,'quiet-hours'), 'notification_preferences',{[key]:value}),value);
  for(const value of ['00:00','23:59','07:05']){const state=command(generate(empty(),draft,'quiet-valid'),'notification_preferences',{[key]:value});assert.equal(state.notificationPreferences[key],value);}
 }
});

test('claiming an anonymous account erases its simulation copy and closes in-flight simulation writes',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);let seq=0;
  const source='anon:privacy-claim',target='privacy-claimed';
  const req=(user,path,body,extra={})=>mf.dispatchFetch('https://privacy.local/v1/'+path,{method:'POST',headers:{'oai-authenticated-user-id':user,'Content-Type':'application/json','Idempotency-Key':'claim-cleanup-'+ ++seq,...extra},body:JSON.stringify(body)});
  assert.equal((await req(source,'commands',{revision:0,action:'generate',payload:draft})).status,200);
  assert.equal((await req(source,'commands?simulation=1',{revision:0,action:'simulation_reset',payload:{source:'current'}})).status,200);
  const sim='__simulation__:'+await sha256Hex(source),before=await loadAccount(db,sim),late=command(structuredClone(before),'water',{cups:2});late.revision=before.revision+1;
  const response=await req(target,'auth/claim-anonymous',{anonymousUserId:source,consent:true},{'x-anonymous-cookie-uid':source});assert.equal(response.status,200,await response.clone().text());
  assert.equal(await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind(sim).first(),null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM coaching_plans WHERE user_id=?').bind(sim).first()).n,0);
  await assert.rejects(()=>saveAccount(db,sim,late,before.revision,{key:'late-after-claim',digest:'late',action:'water',previousState:before}),e=>e.status===409);
  assert.equal((await loadAccount(db,target)).profile.name,draft.name);
 }finally{await mf.dispose();}
});

test('deletion also erases simulation copies left by legacy anonymous claims',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  const target='privacy-legacy-owner',source='anon:legacy-claim',sim='__simulation__:'+await sha256Hex(source);
  for(const user of [target,sim]){const state=generate(empty(),draft,user);state.revision=1;await saveAccount(db,user,state,0,{key:'legacy-seed',digest:'seed',action:'generate'});}
  const now=new Date().toISOString();
  await db.prepare('INSERT INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)').bind(source,'__claimed__',target,now,null,now).run();
  const response=await mf.dispatchFetch('https://privacy.local/v1/account/delete',{method:'POST',headers:{'oai-authenticated-user-id':target,'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});assert.equal(response.status,200);assert.equal((await response.json()).namespacesCleared,4);
  assert.equal(await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind(sim).first(),null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM coaching_plans WHERE user_id=?').bind(sim).first()).n,0);
 }finally{await mf.dispose();}
});
