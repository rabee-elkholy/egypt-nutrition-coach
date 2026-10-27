import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {migrateLocal} from '../scripts/local-migrations.mjs';
import {empty,generate,command} from '../server/coaching.mjs';
import {loadAccount,saveAccount,deleteFullAccountData} from '../server/store.mjs';

test('coaching aggregate upgrade and anonymous transfer preserve agreements atomically',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await migrateLocal(db);
  await db.prepare('DROP TABLE coaching_cases').run();await db.prepare('DROP TABLE coaching_feedback').run();
  let s=generate(empty(),{name:'Migration',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_only',dietType:'balanced'},'migration-journey');
  command(s,'coaching_feedback',{domain:'nutrition',barrier:'time'});s.revision=1;
  await saveAccount(db,'anon:coaching',s,0,{key:'before-migration',digest:'one',action:'coaching_feedback',previousState:empty()});
  const id=s.coachingCases[0].id;
  assert.equal((await loadAccount(db,'anon:coaching')).coachingCases[0].id,id);
  for(const sql of readFileSync('drizzle/0004_coaching_journey.sql','utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const previous=await loadAccount(db,'anon:coaching');s=structuredClone(previous);command(s,'coaching_decision',{id,accept:true});s.revision=2;
  await saveAccount(db,'anon:coaching',s,1,{key:'after-migration',digest:'two',action:'coaching_decision',previousState:previous});
  const restored=await loadAccount(db,'anon:coaching');assert.equal(restored.coachingCases[0].status,'accepted');assert.equal(restored.coachingFeedback.length,1);
  const target=structuredClone(restored);target.revision=1;
  await saveAccount(db,'verified:coaching',target,0,{key:'claim',digest:'three',action:'claim_anonymous',previousState:empty(),claimSource:{userId:'anon:coaching',revision:2}});
  assert.equal((await loadAccount(db,'verified:coaching')).coachingCases[0].id,id);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM coaching_cases WHERE user_id=?').bind('anon:coaching').first()).n,0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM coaching_feedback WHERE user_id=?').bind('anon:coaching').first()).n,0);
  await deleteFullAccountData(db,'verified:coaching');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM coaching_cases').first()).n,0);
 }finally{await mf.dispose();}
});
