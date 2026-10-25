import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';
import {signHs256Jwt} from '../server/auth.mjs';
import {empty,generate,command,today,evaluateEligibility} from '../server/coaching.mjs';
import {loadAccount,saveAccount,backfillAccountToNormalizedTables,deleteFullAccountData} from '../server/store.mjs';
import {dateOffset} from '../coaching-shared.mjs';
import {calorieReview} from '../server/recovery.mjs';
const config={AUTH_JWT_SECRET:'local-regression-key-with-32-characters-minimum',AUTH_ISSUER:'https://test-issuer.local',AUTH_AUDIENCE:'coach-test',RATE_LIMIT_PER_MINUTE:'10000'};
const draft={name:'Import regression',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[0,2,4]};
const token=async sub=>{const now=Math.floor(Date.now()/1000);return signHs256Jwt({sub,sid:'session',iss:config.AUTH_ISSUER,aud:config.AUTH_AUDIENCE,iat:now-10,exp:now+3600},config.AUTH_JWT_SECRET);};
test('Imported 0.12 public edge security and durable state transitions',async t=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/cloudflare.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],bindings:config});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  const req=(path,opts={})=>mf.dispatchFetch('https://edge.test/v1/'+path,opts);
  const post=(path,data,headers={})=>req(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  let cookie,anonId;
  await t.test('claims require the owning cookie; spoofed internal headers and cross-origin mutations fail',async()=>{
   const session=await req('auth/session');cookie=session.headers.get('Set-Cookie').split(';')[0];anonId=(await session.json()).userId;
   assert.equal((await post('commands',{revision:0,action:'generate',payload:draft},{Cookie:cookie,'Idempotency-Key':'init'})).status,200);
   const authorization='Bearer '+await token('claim-owner');
   for(const headers of [{Authorization:authorization},{Authorization:authorization,'x-anonymous-cookie-uid':anonId},{Authorization:authorization,Cookie:'coach_uid='+anonId.slice(5)}]){
    const r=await post('auth/claim-anonymous',{anonymousUserId:anonId,consent:true},headers);assert.equal(r.status,403,await r.text());
   }
   const csrf=await post('account/delete',{confirm:true},{Cookie:cookie,Origin:'https://evil.test'});assert.equal(csrf.status,403);
  });
  await t.test('legacy cookie accounts and simulation-only histories keep their identity',async()=>{
   for(const simulationOnly of [false,true]){
    const uid=crypto.randomUUID(),legacy='anon:'+uid;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(legacy));
    const key=simulationOnly?'__simulation__:'+Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join(''):legacy;
    await db.prepare('INSERT INTO coaching_accounts(user_id,revision,body) VALUES(?,?,?)').bind(key,0,JSON.stringify(empty())).run();
    const response=await req('auth/session',{headers:{Cookie:'coach_uid='+uid}});assert.equal(response.status,200);assert.equal((await response.json()).userId,legacy);
   }
  });
  await t.test('two claims are atomic: one owner wins, historical plans survive, anonymous access closes',async()=>{
   const before=await loadAccount(db,anonId);const oldPlan=structuredClone(before.plans[0]);oldPlan.id='archived-owned-plan';
   await db.prepare('INSERT INTO coaching_plans(user_id,plan_id,created_at,body) VALUES(?,?,?,?)').bind(anonId,oldPlan.id,oldPlan.created_at,JSON.stringify(oldPlan)).run();
   const headers=await Promise.all(['a','b'].map(async x=>({Cookie:cookie,Authorization:'Bearer '+await token('racing-'+x)})));
   const responses=await Promise.all(headers.map(h=>post('auth/claim-anonymous',{anonymousUserId:anonId,consent:true},h)));
   assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
   const winner=responses.findIndex(r=>r.status===200);assert.ok(responses[winner].headers.get('Set-Cookie').includes('Max-Age=0'));
   assert.equal((await req('plans/'+oldPlan.id,{headers:headers[winner]})).status,200);
   assert.equal((await req('bootstrap',{headers:{Cookie:cookie}})).status,401);
   assert.equal(await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind(anonId).first(),null);
  });
  await t.test('first normalized save preserves legacy old logs before compaction and never resurrects deleted food',async()=>{
   const user='legacy-compaction',s=generate(empty(),draft,'legacy-storage');
   s.foodEntries=Array.from({length:160},(_,i)=>({id:'legacy-'+i,date:dateOffset(today(),-120-i),slot:'lunch',source:'manual',snapshot:{name:'legacy',values:{energy:'100'},detail:'x'.repeat(6500)}}));
   await db.prepare('INSERT INTO coaching_accounts(user_id,revision,body) VALUES(?,?,?)').bind(user,0,JSON.stringify(s)).run();
   let loaded=await loadAccount(db,user),next=command(structuredClone(loaded),'water',{cups:2});next.revision=1;
   await saveAccount(db,user,next,0,{key:'migrate',digest:'test',action:'water',previousState:loaded});
   const aggregate=JSON.parse((await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind(user).first()).body);assert.equal(aggregate.foodEntries.length,0);
   loaded=await loadAccount(db,user);assert.equal(loaded.foodEntries.length,160);
   next=command(structuredClone(loaded),'food_delete',{id:'legacy-0'});next.revision=2;
   await saveAccount(db,user,next,1,{key:'delete',digest:'test2',action:'food_delete',payload:{id:'legacy-0'},previousState:loaded});
   loaded=await loadAccount(db,user);assert.equal(loaded.foodEntries.length,159);assert.ok(!loaded.foodEntries.some(x=>x.id==='legacy-0'));
   const deltas=await db.prepare('SELECT entity_type,op FROM coaching_sync_outbox WHERE user_id=? AND revision=2').bind(user).all();assert.ok(deltas.results.some(x=>x.entity_type==='food_entry'&&x.op==='delete'));assert.ok(deltas.results.some(x=>x.entity_type==='food_day'));
  });
  await t.test('a delayed backfill cannot replace a newer committed log',async()=>{
   const user='backfill-race',s=generate(empty(),draft,'backfill-race');s.revision=1;s.waterLogs=[{date:today(),cups:2,liters:.5}];
   await saveAccount(db,user,s,0,{key:'seed',digest:'seed',action:'generate'});
   let injected=false,backfillPrepared=false;
   const wrapped={prepare:sql=>{if(sql.startsWith('INSERT OR REPLACE INTO coaching_'))backfillPrepared=true;return db.prepare(sql);},batch:async statements=>{
    // Delay the backfill write, after its snapshot read, not the new read-only batch.
    if(backfillPrepared&&!injected){injected=true;const before=await loadAccount(db,user),next=command(structuredClone(before),'water',{cups:4});next.revision=2;await saveAccount(db,user,next,1,{key:'newer',digest:'newer',action:'water',previousState:before});}
    return db.batch(statements);
   }};
   await assert.rejects(()=>backfillAccountToNormalizedTables(wrapped,user),e=>e.status===409);
   assert.equal(injected,true);
   assert.equal((await loadAccount(db,user)).waterLogs[0].cups,4);
  });
  await t.test('an already authenticated write cannot recreate an account deleted before commit',async()=>{
   const user='delete-race',s=generate(empty(),draft,'delete-race');s.revision=1;
   await saveAccount(db,user,s,0,{key:'seed',digest:'seed',action:'generate'});
   const before=await loadAccount(db,user),next=command(structuredClone(before),'water',{cups:3});next.revision=2;
   await deleteFullAccountData(db,user);
   await assert.rejects(()=>saveAccount(db,user,next,1,{key:'late-write',digest:'late',action:'water',previousState:before}),e=>e.status===409);
   assert.equal(await db.prepare('SELECT body FROM coaching_accounts WHERE user_id=?').bind(user).first(),null);
  });
  await t.test('receipt replay returns original affected entities after later writes; wearable retry commits once',async()=>{
   const headers={Authorization:'Bearer '+await token('receipts')};
   const send=async(revision,action,payload,key)=>post('commands?view=receipt',{revision,action,payload},{...headers,'Idempotency-Key':key});
   assert.equal((await send(0,'generate',draft,'generate')).status,200);
   const added=await send(1,'food_entry',{source:'manual',slot:'lunch',name:'one',energy:100},'one');assert.equal(added.status,200);const original=await added.json();
   assert.equal((await send(2,'food_entry',{source:'manual',slot:'lunch',name:'two',energy:200},'two')).status,200);
   const replay=await send(1,'food_entry',{source:'manual',slot:'lunch',name:'one',energy:100},'one');assert.deepEqual((await replay.json()).affected,original.affected);
   const data={records:[{type:'weight',date:today(),kg:79.5}]};
   const a=await post('wearables/ingest',data,{...headers,'Idempotency-Key':'wearable'});assert.equal(a.status,200);const first=await a.json();
   const b=await post('wearables/ingest',data,{...headers,'Idempotency-Key':'wearable'});assert.equal(b.status,200);assert.equal((await b.json()).revision,first.revision);
  });
 }finally{await mf.dispose();}
});
test('irregular weight sampling is normalized by elapsed time; automatic sessions retain unknown exertion',()=>{
 const weights=[...[-13,-12,-11].map(d=>({date:dateOffset(today(),d),kg:80})),...[-2,-1,0].map(d=>({date:dateOffset(today(),d),kg:79.04}))];
 const food=Array.from({length:14},(_,i)=>({date:dateOffset(today(),-i),complete:true,energy:2000,adherence:100}));
 const review=calorieReview(weights,food,'lose',2000);assert.equal(review.action,'hold');assert.ok(Math.abs(review.rate-(-1.2*7/11))<.001);
 const s=generate(empty(),draft,'actual-session');const day=s.workoutPlan.days[0],e=day.exercises[0];command(s,'workout',{dayIndex:day.dayIndex,exerciseId:e.id,sets:[{kg:20,reps:8,rir:3}],autoSession:true});assert.equal(s.sessions[0].rpe,null);assert.equal(s.sessions[0].duration,null);assert.ok(s.sessions[0].estimatedDuration>0);
});

test('legacy onboarding injury IDs and canonical API IDs enforce the same exclusions without changing drafts',()=>{
 for(const [legacy,canonical]of [['shoulder_injury','shoulder_pain'],['ankle_injury','ankle_pain']]){
  assert.equal(evaluateEligibility({...draft,injuries:[legacy]}).status,evaluateEligibility({...draft,injuries:[canonical]}).status);
  const a=generate(empty(),{...draft,injuries:[legacy]},'alias-policy'),b=generate(empty(),{...draft,injuries:[canonical]},'alias-policy');
  assert.deepEqual(a.workoutPlan.days.map(d=>d.exercises.map(e=>e.id)),b.workoutPlan.days.map(d=>d.exercises.map(e=>e.id)));
  assert.deepEqual(a.onboarding.workoutPrefs.injuries,[legacy]);
 }
 assert.equal(evaluateEligibility({...draft,injuries:['elbow_pain']}).status,'requires_review');
 assert.throws(()=>generate(empty(),{...draft,injuries:['elbow_pain']}),/الكوع/);
});

test('account deletion fails closed before the revocation schema is installed',async()=>{
 let wrote=false;const db={prepare(){return {async first(){return null;}};},async batch(){wrote=true;return [];}};
 await assert.rejects(()=>deleteFullAccountData(db,'legacy'),e=>e.status===503);assert.equal(wrote,false);
});
