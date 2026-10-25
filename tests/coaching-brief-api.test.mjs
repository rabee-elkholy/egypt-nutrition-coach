import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';

test('KMM coaching brief uses real follow-up state, stable IDs, tenant isolation and truthful delivery states',async t=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);let seq=0,state;
  const user='brief-owner';
  const get=(userId=user,extra={})=>mf.dispatchFetch('https://brief.local/v1/coaching/brief',{headers:{...(userId?{'oai-authenticated-user-id':userId}:{}),...extra}});
  const command=async(action,payload)=>{const r=await mf.dispatchFetch('https://brief.local/v1/commands',{method:'POST',headers:{'oai-authenticated-user-id':user,'Content-Type':'application/json','Idempotency-Key':'brief-'+ ++seq},body:JSON.stringify({revision:state?.revision||0,action,payload})});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));state=body;return body;};
  await t.test('requires authentication and never invents personal notes for an empty account',async()=>{
   assert.equal((await get(null)).status,401);const r=await get('empty-brief-user'),body=await r.json();assert.equal(r.status,200);assert.equal(body.requiresOnboarding,true);assert.deepEqual(body.notes,[]);
  });
  await command('generate',{name:'متابعة شخصية',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true});
  await command('recovery',{sleepHours:4,sleepQuality:1,fatigue:5,stress:5,soreness:8,pain:false,illness:false,redFlags:false});
  await command('review',{});
  let original;
  await t.test('response satisfies declared required fields and uses recorded sleep',async()=>{
   const response=await get();original=await response.json();assert.equal(response.status,200);assert.equal(original.revision,state.revision);
   const api=parse(readFileSync('contracts/openapi.yaml','utf8'));
   for(const field of api.components.schemas.CoachingBriefResponse.required)assert.ok(field in original,field);
   assert.equal(original.notes.length,3);
   for(const note of original.notes){for(const field of api.components.schemas.CoachingBriefNote.required)assert.ok(field in note,field);assert.equal(note.status,'GENERATED');assert.equal(note.deliveryStatus,'NOT_MEASURED');assert.equal(note.renderingStatus,'NOT_MEASURED');assert.ok(!/undefined|NaN/.test(note.text+note.action));}
   assert.match(original.notes.find(n=>n.role==='followup').text,/4/);
  });
  await t.test('refresh preserves identity/content and does not mutate the account revision',async()=>{
   const response=await get(),again=await response.json();assert.deepEqual(again.notes,original.notes);assert.equal((await db.prepare('SELECT revision FROM coaching_accounts WHERE user_id=?').bind(user).first()).revision,state.revision);
   const conditional=await get(user,{'If-None-Match':response.headers.get('ETag')});assert.equal(conditional.status,304);
  });
  await t.test('accepted adaptation changes the message in place and is remembered on subsequent review',async()=>{
   const proposal=state.adaptations.find(a=>a.kind==='recovery'&&a.status==='pending');assert.ok(proposal);
   await command('adaptation',{id:proposal.id,accept:true});await command('review',{});
   assert.equal(state.adaptations.filter(a=>a.kind==='recovery'&&a.status==='pending').length,0);
   const body=await (await get()).json(),note=body.notes.find(n=>n.role==='training');assert.equal(note.key,'adjustment-active');assert.equal(note.id,original.notes.find(n=>n.role==='training').id);assert.notEqual(note.text,original.notes.find(n=>n.role==='training').text);assert.equal(note.basedOnRevision,state.revision);
  });
  await t.test('another account receives none of the owner notes',async()=>{
   const body=await (await get('other-brief-user')).json();assert.deepEqual(body.notes,[]);assert.ok(!JSON.stringify(body).includes('متابعة شخصية'));
  });
  await t.test('conditional validators are scoped to the account and actual time-sensitive content',async()=>{
   const one=await get('empty-one'),two=await get('empty-two',{'If-None-Match':one.headers.get('ETag')});assert.equal(two.status,200);assert.notEqual(two.headers.get('ETag'),one.headers.get('ETag'));
   const active=await get(),tag=active.headers.get('ETag');
   const row=await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind(user).first(),stored=JSON.parse(row.body);
   stored.sessionAdjustment.expiresAt=new Date(Date.now()-1000).toISOString();
   await db.prepare('UPDATE coaching_accounts SET body=? WHERE user_id=?').bind(JSON.stringify(stored),user).run();
   const changed=await get(user,{'If-None-Match':tag});assert.equal(changed.status,200);assert.notEqual(changed.headers.get('ETag'),tag);assert.notEqual((await changed.json()).notes.find(n=>n.role==='training').key,'adjustment-active');
  });
 }finally{await mf.dispose();}
});
