import test from 'node:test';import assert from 'node:assert/strict';import {Miniflare} from 'miniflare';import {readFile} from 'node:fs/promises';
test('D1 API authenticates, isolates accounts, persists and rejects stale/idempotency conflicts',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',d1Databases:['DB']});
 try{
 const db=await mf.getD1Database('DB');for(const sql of (await readFile('drizzle/0000_purple_solo.sql','utf8')).split('--> statement-breakpoint'))await db.prepare(sql.trim()).run();
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
 }finally{await mf.dispose();}
});
