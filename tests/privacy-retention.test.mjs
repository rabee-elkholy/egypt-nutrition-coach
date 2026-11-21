import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';
import {loadAccount,saveAccount} from '../server/store.mjs';
import {command,generate,empty} from '../server/coaching.mjs';

const draft={name:'Synthetic privacy regression',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dailyActivity:'light',dietType:'balanced',region:'egypt',budget:'medium',mealsCount:4,selectedWorkoutDays:[1,3,5],healthConfirmed:true};

test('full account deletion clears all user tables and blocks in-flight resurrection',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  let seq=0;
  const req=(user,endpoint,body,method=body?'POST':'GET')=>mf.dispatchFetch('https://privacy.local/v1/'+endpoint,{method,headers:{'oai-authenticated-user-id':user,'Content-Type':'application/json','Idempotency-Key':'privacy-'+ ++seq},...(body?{body:JSON.stringify(body)}:{})});
  for(const user of ['privacy-a','privacy-b']){
   assert.equal((await req(user,'commands',{revision:0,action:'generate',payload:draft})).status,200);
  }
  const before=await loadAccount(db,'privacy-a'),late=command(structuredClone(before),'water',{cups:4});late.revision=before.revision+1;
  const deletion=await req('privacy-a','account/delete',{confirm:true},'DELETE');assert.equal(deletion.status,200);
  const delBody=await deletion.json();
  assert.equal(delBody.ok,true);
  assert.equal(delBody.data.deleted,true);
  assert.equal(delBody.data.namespacesCleared,1);
  for(const table of ['coaching_accounts','coaching_requests','coaching_plans','coaching_workout_plans','coaching_changes','coaching_sync_outbox','coaching_food_entries','coaching_water_logs']){
   const row=await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).bind('privacy-a').first();assert.equal(row.n,0,'Residual data in '+table);
  }
  assert.ok(await db.prepare("SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id='__deleted__'").bind('privacy-a').first());
  await assert.rejects(()=>saveAccount(db,'privacy-a',late,before.revision,{key:'late-write',digest:'late',action:'water',previousState:before}),e=>e.status===409);
  assert.equal((await req('privacy-a','state')).status,401);
  assert.equal((await req('privacy-b','state')).status,200);
 }finally{await mf.dispose();}
});

test('account deletion requires explicit confirm:true',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  const headers={'oai-authenticated-user-id':'privacy-confirm','Content-Type':'application/json','Idempotency-Key':'mode-gen'};
  const post=(endpoint,body)=>mf.dispatchFetch('https://privacy.local/v1/'+endpoint,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post('commands',{revision:0,action:'generate',payload:draft})).status,200);
  const response=await mf.dispatchFetch('https://privacy.local/v1/account/delete',{method:'DELETE',headers,body:JSON.stringify({confirm:false})});
  assert.equal(response.status,400);
  const errBody=await response.json();
  assert.equal(errBody.ok,false);
  assert.equal(errBody.error.code,'DELETE_CONFIRMATION_REQUIRED');
  assert.ok(await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind('privacy-confirm').first());
 }finally{await mf.dispose();}
});

test('quiet-hours clock values must be valid HH:mm with 00-23 hours and 00-59 minutes',()=>{
 for(const key of ['quietHoursStart','quietHoursEnd']){
  for(const value of ['24:00','99:99','12:60','-1:20','7:00'])assert.throws(()=>command(generate(empty(),draft,'quiet-hours'), 'notification_preferences',{[key]:value}),value);
  for(const value of ['00:00','23:59','07:05']){const state=command(generate(empty(),draft,'quiet-valid'),'notification_preferences',{[key]:value});assert.equal(state.notificationPreferences[key],value);}
 }
});

test('claiming an anonymous account deletes source anonymous tables and deletion clears claimed history',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);let seq=0;
  const source='anon:privacy-claim',target='privacy-claimed';
  const req=(user,path,body,extra={})=>mf.dispatchFetch('https://privacy.local/v1/'+path,{method:'POST',headers:{'oai-authenticated-user-id':user,'Content-Type':'application/json','Idempotency-Key':'claim-cleanup-'+ ++seq,...extra},body:JSON.stringify(body)});
  assert.equal((await req(source,'commands',{revision:0,action:'generate',payload:draft})).status,200);
  const before=await loadAccount(db,source),late=command(structuredClone(before),'water',{cups:2});late.revision=before.revision+1;
  const response=await req(target,'auth/claim-anonymous',{anonymousUserId:source,consent:true},{'x-anonymous-cookie-uid':source});assert.equal(response.status,200,await response.clone().text());
  assert.equal(await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind(source).first(),null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM coaching_plans WHERE user_id=?').bind(source).first()).n,0);
  await assert.rejects(()=>saveAccount(db,source,late,before.revision,{key:'late-after-claim',digest:'late',action:'water',previousState:before}),e=>e.status===409);
  assert.equal((await loadAccount(db,target)).profile.name,draft.name);
  const del=await mf.dispatchFetch('https://privacy.local/v1/account/delete',{method:'DELETE',headers:{'oai-authenticated-user-id':target,'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});
  assert.equal(del.status,200);
  assert.equal((await del.json()).data.namespacesCleared,2);
 }finally{await mf.dispose();}
});
