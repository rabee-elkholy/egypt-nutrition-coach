import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';
import {empty,generate,command} from '../server/coaching.mjs';
import {loadAccount,saveAccount,deleteFullAccountData} from '../server/store.mjs';

const draft={name:'Snapshot regression',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};

// Inject a completed competing transaction after the initial aggregate read,
// before history hydration. SQL still executes against a real migrated D1.
function afterSchemaRead(db,change){
 let injected=false;
 const wrap=(statement,sql)=>new Proxy(statement,{get(target,key){
  if(key==='bind')return (...values)=>wrap(target.bind(...values),sql);
  if(key==='first')return async(...args)=>{const result=await target.first(...args);if(!injected&&sql.includes('sqlite_master')){injected=true;await change();}return result;};
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 return {prepare:sql=>wrap(db.prepare(sql),sql),batch:statements=>db.batch(statements)};
}

test('account snapshots keep revision, profile and normalized history in one committed view',async t=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  async function seed(user){const state=generate(empty(),draft,user);state.revision=1;state.waterLogs=[{date:'2026-10-24',cups:2,liters:.5}];await saveAccount(db,user,state,0,{key:'seed',digest:'seed',action:'generate'});}
  await t.test('a write between aggregate and history reads cannot mix revisions',async()=>{
   const user='snapshot-race';await seed(user);
   const wrapped=afterSchemaRead(db,async()=>{const before=await loadAccount(db,user),next=command(structuredClone(before),'water',{date:'2026-10-24',cups:7});next.revision=2;await saveAccount(db,user,next,1,{key:'new',digest:'new',action:'water',previousState:before});});
   const loaded=await loadAccount(wrapped,user);
   assert.equal(loaded.waterLogs.find(x=>x.date==='2026-10-24').cups,7);
   assert.equal(loaded.revision,2,'A newer diary must not be attributed to the previous revision');
  });
  await t.test('deletion during hydration returns an empty account, without the old profile or diary',async()=>{
   const user='snapshot-delete';await seed(user);
   const loaded=await loadAccount(afterSchemaRead(db,()=>deleteFullAccountData(db,user)),user);
   assert.equal(loaded.profile,null);assert.equal(loaded.revision,0);assert.deepEqual(loaded.waterLogs,[]);
  });
  await t.test('a failed history snapshot rejects the read instead of returning a partial view',async()=>{
   const user='snapshot-failure';await seed(user);
   await assert.rejects(()=>loadAccount({prepare:sql=>db.prepare(sql),batch:async()=>{throw Error('Injected snapshot failure');}},user),error=>error.status===503);
  });
 }finally{await mf.dispose();}
});
