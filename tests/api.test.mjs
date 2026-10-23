import test from 'node:test';import assert from 'node:assert/strict';import {Miniflare} from 'miniflare';import {migrateLocal} from '../scripts/local-migrations.mjs';
test('D1 API authenticates, isolates accounts, persists and rejects stale/idempotency conflicts',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',d1Databases:['DB']});
 try{
 const db=await mf.getD1Database('DB');await migrateLocal(db);
 const req=(path='state',opts={})=>mf.dispatchFetch('http://localhost/v1/'+path,opts);
 assert.equal((await req()).status,401);
 const headers={'oai-authenticated-user-id':'user-a','Content-Type':'application/json','Idempotency-Key':'test-1'};
 const body=JSON.stringify({revision:0,action:'generate',payload:{name:'Test',age:30,weight:80,height:175,sex:'male',goal:'maintain',serviceTrack:'workouts_only',selectedWorkoutDays:[1,3,5]}});
 let r=await req('commands',{method:'POST',headers,body});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).revision,1);
 r=await req('commands',{method:'POST',headers,body});assert.equal(r.status,200);
 r=await req('commands',{method:'POST',headers:{...headers,'Idempotency-Key':'different'},body});assert.equal(r.status,409);
 r=await req('commands',{method:'POST',headers,body:JSON.stringify({revision:1,action:'weight',payload:{kg:79}})});assert.equal(r.status,409);
 assert.equal((await (await req('state',{headers:{'oai-authenticated-user-id':'user-b'}})).json()).profile,null);
 assert.equal((await (await req('state',{headers})).json()).profile.name,'Test');
 r=await req('commands',{method:'POST',headers:{...headers,'Idempotency-Key':'cross-origin',Origin:'https://evil.example'},body});assert.equal(r.status,403);
 const generation={name:'Plan history',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced'};
 for(const revision of [1,2]){const response=await req('commands',{method:'POST',headers:{...headers,'Idempotency-Key':'plan-'+revision},body:JSON.stringify({revision,action:'generate',payload:generation})});assert.equal(response.status,200,await response.clone().text());}
 let current=await (await req('state',{headers})).json();assert.equal(current.revision,3);assert.equal(current.plans.length,1);assert.equal(current.planRefs.length,2);
 const compact=await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind('user-a').first();assert.deepEqual(JSON.parse(compact.body).plans,[]);assert.ok(compact.body.length<50000);
 const archived=await req('plans/'+current.planRefs[0].id,{headers});assert.equal(archived.status,200);
 assert.equal((await req('plans/'+current.planRefs[0].id,{headers:{'oai-authenticated-user-id':'user-b'}})).status,404);
 const savedReceipt=await db.prepare('SELECT response FROM coaching_requests WHERE user_id=? AND request_key=?').bind('user-a','plan-1').first();assert.ok(savedReceipt.response.length<100);
 const replay=await req('commands',{method:'POST',headers,body});assert.equal(replay.headers.get('Idempotency-Replayed'),'true');const replayed=await replay.json();assert.equal(replayed.revision,3);assert.equal(replayed.commandReceipt.revision,1);
 const race=await Promise.all([1,2].map(n=>req('commands',{method:'POST',headers:{...headers,'Idempotency-Key':'race-'+n},body:JSON.stringify({revision:3,action:'weight',payload:{kg:78+n}})})));assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
 const changes=await (await req('sync/changes?after=1',{headers})).json();assert.deepEqual(changes.items.map(x=>x.revision),[2,3,4]);
 const legacy={...current,revision:0,planRefs:[],workoutPlanRefs:[]};delete legacy.recovery;delete legacy.serverDate;delete legacy.scheduledSessions;
 await db.prepare('INSERT INTO coaching_accounts(user_id,revision,body) VALUES(?,?,?)').bind('legacy-user',0,JSON.stringify(legacy)).run();
 const migrated=await req('commands',{method:'POST',headers:{...headers,'oai-authenticated-user-id':'legacy-user','Idempotency-Key':'migration'},body:JSON.stringify({revision:0,action:'weight',payload:{kg:79}})});assert.equal(migrated.status,200,await migrated.clone().text());
 const migratedBody=JSON.parse((await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind('legacy-user').first()).body);assert.deepEqual(migratedBody.plans,[]);assert.equal(migratedBody.active_plan_id,legacy.active_plan_id);
 assert.equal((await req('plans/'+legacy.active_plan_id,{headers:{'oai-authenticated-user-id':'legacy-user'}})).status,200);
 const malformed=await req('commands',{method:'POST',headers:{...headers,'Idempotency-Key':'malformed'},body:'null'});assert.equal(malformed.status,400);
 }finally{await mf.dispose();}
});
