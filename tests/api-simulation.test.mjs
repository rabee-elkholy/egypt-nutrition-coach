import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';
import {loadAccount,saveAccount} from '../server/store.mjs';
import {localDate,dateOffset} from '../coaching-shared.mjs';
test('simulation HTTP isolation, persistence, replay and concurrent writes',async t=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  const headers={'oai-authenticated-user-id':'simulation-owner','Content-Type':'application/json'};
  const get=(path='state',sim=false,user='simulation-owner')=>mf.dispatchFetch('https://qa.test/v1/'+path+(sim?(path.includes('?')?'&':'?')+'simulation=1':''),{headers:{...headers,'oai-authenticated-user-id':user}});
  const post=(body,sim=false,key=crypto.randomUUID())=>mf.dispatchFetch('https://qa.test/v1/commands'+(sim?'?simulation=1':''),{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify(body)});
  const draft={name:'Real profile',age:31,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced'};
  let r=await post({revision:0,action:'generate',payload:draft});assert.equal(r.status,200);const real=await r.json();
  const before=(await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind('simulation-owner').first()).body;
  let simulation;
  await t.test('copy preferences only; real aggregate and archives are untouched',async()=>{
   r=await post({revision:0,action:'simulation_reset',payload:{source:'current'}},true,'start-simulation');assert.equal(r.status,200,await r.clone().text());simulation=await r.json();
   assert.equal(simulation.profile.age,31);assert.equal(simulation.simulation.day,1);assert.equal(simulation.foodEntries.length,0);assert.notEqual(simulation.active_plan_id,real.active_plan_id);
   assert.equal((await get('plans/'+real.active_plan_id,true)).status,404);assert.equal((await get('plans/'+simulation.active_plan_id,false)).status,404);assert.equal((await get('plans/'+simulation.active_plan_id,true,'someone-else')).status,404);
   assert.equal((await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind('simulation-owner').first()).body,before);
  });
  await t.test('advance and replay are durable; future simulation logging does not permit future real logging',async()=>{
   const advance={revision:simulation.revision,action:'simulation_next',payload:{}};r=await post(advance,true,'next-day');assert.equal(r.status,200);simulation=await r.json();assert.equal(simulation.serverDate,dateOffset(localDate(),1));
   const replay=await (await post(advance,true,'next-day')).json();assert.equal(replay.simulation.day,2);assert.equal(replay.commandReceipt.replayed,true);
   const reads=await Promise.all([get(),get('state',true)]);const [actual,virtual]=await Promise.all(reads.map(x=>x.json()));assert.equal(actual.serverDate,localDate());assert.equal(virtual.serverDate,dateOffset(localDate(),1));
   r=await post({revision:virtual.revision,action:'weight',payload:{date:virtual.serverDate,kg:79.9}},true);assert.equal(r.status,200);
   r=await post({revision:real.revision,action:'weight',payload:{date:virtual.serverDate,kg:79.9}});assert.equal(r.status,400);
   const oldCreationReplay=await (await post({revision:0,action:'simulation_reset',payload:{source:'current'}},true,'start-simulation')).json();assert.equal(oldCreationReplay.simulation.day,2);assert.equal(oldCreationReplay.weights.length,1);
   assert.equal((await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind('simulation-owner').first()).body,before);
  });
  await t.test('simulation commands cannot mutate the real account',async()=>{
   assert.equal((await post({revision:real.revision,action:'simulation_next',payload:{}})).status,400);
   assert.equal((await get('state?simulation=banana')).status,400);
  });
  await t.test('two identical account bodies racing produce only one mutation receipt',async()=>{
   const state=await loadAccount(db,'simulation-owner');state.revision++;state.weights=[{date:localDate(),kg:79}];
   const writes=await Promise.allSettled([1,2].map(i=>saveAccount(db,'simulation-owner',structuredClone(state),state.revision-1,{key:'identical-'+i,digest:'digest-'+i,action:'weight'})));
   assert.equal(writes.filter(x=>x.status==='fulfilled').length,1);
   const receipts=await db.prepare("SELECT COUNT(*) AS n FROM coaching_requests WHERE user_id=? AND request_key LIKE 'identical-%'").bind('simulation-owner').first();assert.equal(receipts.n,1);
   const fetched=await (await get()).json();assert.equal(fetched._commitToken,undefined);
  });
 }finally{await mf.dispose();}
});
