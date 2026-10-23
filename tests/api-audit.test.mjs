import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';
import worker from '../server/worker.mjs';
import {empty} from '../server/coaching.mjs';
const media={'oai-authenticated-user-id':'audit-api','Content-Type':'application/json','Idempotency-Key':'audit'};
test('HTTP and D1 audit scenarios',async t=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  const req=(path,opts={})=>mf.dispatchFetch('https://audit.test/v1/'+path,opts);
  const post=(body,headers=media)=>req('commands',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
  for(const [name,value]of [['null','null'],['array','[]'],['invalid JSON','{'],['missing payload',{action:'generate',revision:0}],['negative revision',{revision:-1,action:'weight',payload:{kg:80}}],['unsafe revision',{revision:1e20,action:'weight',payload:{kg:80}}],['fractional revision',{revision:.5,action:'weight',payload:{kg:80}}],['array payload',{revision:0,action:'generate',payload:[]}]])await t.test(name,async()=>assert.equal((await post(value)).status,400));
  await t.test('media type must be application/json',async()=>assert.equal((await post('{}',{...media,'Content-Type':'text/not-application/json'})).status,415));
  await t.test('UTF-8 byte limit is enforced',async()=>assert.equal((await post(JSON.stringify({revision:0,action:'generate',payload:{name:'أ'.repeat(22000)}}))).status,413));
  await t.test('invalid cursors and dates are 400, not database failures',async()=>{
   for(const path of ['exercises?offset=Infinity','exercises?offset=-1','exercises?offset=1.5','sync/changes?after=NaN','sync/changes?after=9007199254740992','food-diary?date=2026-02-30'])assert.equal((await req(path,{headers:media})).status,400,path);
  });
  await t.test('invalid requests leave a new account empty',async()=>{const s=await (await req('state',{headers:media})).json();assert.equal(s.revision,0);assert.equal(s.profile,null);});
  await t.test('same-origin checks reject cross-origin JSON writes',async()=>assert.equal((await post({revision:0,action:'weight',payload:{kg:80}},{...media,Origin:'https://other.test'})).status,403));
  await t.test('first-write race commits exactly one account, plan, receipt and change',async()=>{
   const draft={name:'Race',age:30,weight:80,height:175,sex:'male',goal:'maintain',serviceTrack:'workouts_only',healthConfirmed:true};
   const results=await Promise.all([1,2].map(i=>post({revision:0,action:'generate',payload:draft},{...media,'oai-authenticated-user-id':'first-race','Idempotency-Key':'first-'+i})));
   assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
   for(const table of ['coaching_accounts','coaching_workout_plans','coaching_requests','coaching_changes']){const row=await db.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE user_id=?').bind('first-race').first();assert.equal(row.n,1,table);}
  });
  await t.test('active day targets in a legacy future adjustment are reconstructed from an owned ancestor',async()=>{
   const original={id:'parent',start_date:'2026-10-23',targets:{energy:2000,protein:120},days:[{date:'2026-10-23',meals:[],summary:{values:{energy:'2000',protein:'120'}}}],created_at:'2026-10-23T00:00:00Z'};
   const future={...structuredClone(original),id:'child',parent_id:'parent',effective_from:'2026-10-24',targets:{energy:1900,protein:120}};
   for(const p of [original,future])await db.prepare('INSERT INTO coaching_plans(user_id,plan_id,created_at,body) VALUES(?,?,?,?)').bind('legacy-adjusted',p.id,p.created_at,JSON.stringify(p)).run();
   await db.prepare('INSERT INTO coaching_accounts(user_id,revision,body) VALUES(?,?,?)').bind('legacy-adjusted',1,JSON.stringify({...empty(),revision:1,active_plan_id:'child'})).run();
   const s=await (await req('state',{headers:{...media,'oai-authenticated-user-id':'legacy-adjusted'}})).json();assert.equal(s.plans[0].days[0].targets.energy,2000);assert.equal(s.plans[0].targets.energy,1900);
   const stored=await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind('legacy-adjusted','child').first();assert.equal(JSON.parse(stored.body).days[0].targets,undefined);
  });
  await t.test('missing bindings fail explicitly',async()=>{const r=await worker.fetch(new Request('https://audit.test/v1/state',{headers:media}),{});assert.equal(r.status,503);});
 }finally{await mf.dispose();}
});
test('streaming requests are cancelled as soon as they exceed the byte limit',async()=>{
 let cancelled=false,read=0;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(++read===1?20000:20001));},cancel(){cancelled=true;}});
 const request=new Request('https://audit.test/v1/commands',{method:'POST',headers:media,body,duplex:'half'});
 const db={prepare(){return {bind(){return this;},async first(){return null;}};}};
 const result=await worker.fetch(request,{DB:db});assert.equal(result.status,413);assert.equal(cancelled,true);assert.ok(read<=4);
});
