import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';

test('coaching lifecycle is durable, isolated, replay-safe, synced and erased with the account',async t=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);let state,seq=0;
  const headers={'oai-authenticated-user-id':'journey-owner','Content-Type':'application/json'};
  const get=async(path,owner='journey-owner')=>mf.dispatchFetch('https://journey.local'+path,{headers:{'oai-authenticated-user-id':owner}});
  const send=async(action,payload={},extra={})=>{
   const request={revision:state?.revision||0,action,payload},key='journey-'+ ++seq;
   const response=await mf.dispatchFetch('https://journey.local/v1/commands',{method:'POST',headers:{...headers,'Idempotency-Key':key,...extra},body:JSON.stringify(request)});
   const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
   if(!extra.Prefer)state=body;return {body,request,key};
  };
  await send('generate',{name:'Journey',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true});
  await t.test('recovery evidence automatically triggers review without a separate review command',async()=>{
   await send('recovery',{sleepHours:4,sleepQuality:1,fatigue:5,stress:5,soreness:8,pain:false,illness:false,redFlags:false});
   assert.equal(state.lastReview.recovery,'high');assert.ok(state.adaptations.some(a=>a.kind==='recovery'&&a.status==='pending'));
  });
  let id;
  await t.test('feedback persists in normalized tables and read endpoints do not acknowledge it',async()=>{
   await send('coaching_feedback',{domain:'nutrition',barrier:'time',hunger:4});id=state.coachingCases[0].id;
   const stored=JSON.parse((await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind('journey-owner').first()).body);
   assert.deepEqual(stored.coachingCases,[]);assert.deepEqual(stored.coachingFeedback,[]);
   assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM coaching_cases').first()).n,1);
   const inbox=await (await get('/v1/coaching/inbox')).json();assert.equal(inbox.items[0].id,id);assert.equal(inbox.items[0].readStatus,'UNKNOWN');
   assert.deepEqual((await (await get('/v1/coaching/inbox','other-owner')).json()).items,[]);
   assert.equal((await (await get('/v1/state')).json()).revision,state.revision);
  });
  await t.test('acknowledging a case preserves an unrelated pending plan proposal',async()=>{
   const proposal=state.adaptations.find(a=>a.status==='pending');assert.ok(proposal);
   await send('water',{cups:2});assert.equal(state.adaptations.find(a=>a.id===proposal.id).status,'pending');
   await send('coaching_ack',{id});assert.equal(state.adaptations.find(a=>a.id===proposal.id).baseRevision,state.revision);
   await send('adaptation',{id:proposal.id,accept:true});assert.ok(state.sessionAdjustment);
  });
  await t.test('decision is replay-safe and outcome is explicitly user-reported',async()=>{
   const {request,key}=await send('coaching_decision',{id,accept:true}),revision=state.revision;
   const repeated=await mf.dispatchFetch('https://journey.local/v1/commands',{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify(request)});
   assert.equal(repeated.status,200);assert.equal((await repeated.json()).revision,revision);
   await send('coaching_outcome',{id,outcome:'not_tried'});
   assert.equal(state.coachingCases[0].outcome.source,'user_report');
   const exported=await (await get('/v1/account/export')).json();assert.ok(JSON.stringify(exported).includes(id));
   const deltas=await (await get('/v1/sync/changes?afterSeq=0')).json();assert.ok(JSON.stringify(deltas).includes('coaching_case'));
  });
  await t.test('receipt contains the actual case delta and a second owner cannot acknowledge it',async()=>{
   const {body}=await send('coaching_feedback',{domain:'training',barrier:'time'},{Prefer:'return=minimal'});
   assert.ok(JSON.stringify(body).includes('coaching_case'));
   const r=await mf.dispatchFetch('https://journey.local/v1/commands',{method:'POST',headers:{...headers,'oai-authenticated-user-id':'other-owner','Idempotency-Key':'foreign'},body:JSON.stringify({revision:0,action:'coaching_ack',payload:{id}})});
   assert.notEqual(r.status,200);
  });
  await t.test('account erasure clears both coaching tables',async()=>{
   const r=await mf.dispatchFetch('https://journey.local/v1/account/delete',{method:'POST',headers,body:JSON.stringify({confirm:true})});assert.equal(r.status,200);
   for(const table of ['coaching_cases','coaching_feedback'])assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
  });
 }finally{await mf.dispose();}
});
