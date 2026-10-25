// Local synthetic-data restore drill. Never reads production bindings or credentials.
import {createCipheriv, createDecipheriv, randomBytes, createHash} from 'node:crypto';
import {mkdirSync, existsSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {localRuntime} from '../cohort/runtime.mjs';
import {migrateLocal} from '../local-migrations.mjs';

const root=path.resolve('reports/simulation-100-users-90-days/audit-local-restore-20261024');
if(existsSync(root))throw Error('Restore evidence already exists; do not overwrite it');
mkdirSync(root,{recursive:true});
const started=performance.now(),source=await localRuntime(path.join(root,'source-db'));
let restored;
const digest=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function snapshot(db){
  const tables=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name LIKE 'coaching_%' ORDER BY name").all()).results;
  const result=[];
  for(const {name,sql} of tables){
    if(!/^coaching_[a-z_]+$/.test(name))throw Error('Unexpected table identifier');
    const rows=(await db.prepare('SELECT * FROM "'+name+'"').all()).results.sort((a,b)=>canonical(a).localeCompare(canonical(b)));
    result.push({name,sql,rows});
  }
  assert.ok(result.length>5,'Expected actual coaching schema');
  return result;
}
const commands=[['generate',{name:'Local restore synthetic account',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dailyActivity:'light',dietType:'balanced',region:'egypt',budget:'medium',mealsCount:4,selectedWorkoutDays:[1,3,5],weekdayConvention:'js_sunday_0',workoutLocation:'gym_only',fitnessLevel:'beginner',sessionDuration:45,healthConfirmed:true}],['weight',{kg:79.5}],['water',{cups:6}],['food_entry',{source:'ingredient',key:'banana',grams:100,slot:'snack'}]];
let revision=0;
const requests=[];
try{
  for(const [i,[action,payload]] of commands.entries()){
    const response=await source.mf.dispatchFetch('http://restore.local/v1/commands',{method:'POST',headers:{'oai-authenticated-user-id':'restore-synthetic','Content-Type':'application/json','Idempotency-Key':'restore-drill-'+i,'x-cohort-now':String(Date.parse('2026-10-24T12:00:00Z')),'x-cohort-key':'restore-'+i},body:JSON.stringify({revision,action,payload})});
    const body=await response.json();requests.push({action,status:response.status,revision:body.revision});
    assert.equal(response.status,200,JSON.stringify(body));revision=body.revision;
  }
  const before=await snapshot(source.db),plaintext=Buffer.from(canonical({schemaVersion:1,tables:before}));
  const key=randomBytes(32),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]),tag=cipher.getAuthTag();
  writeFileSync(path.join(root,'synthetic-backup.aes-gcm'),Buffer.concat([nonce,tag,ciphertext]));
  function decrypt(bytes,authTag=tag){const decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAuthTag(authTag);return Buffer.concat([decipher.update(bytes),decipher.final()]);}
  const corrupted=Buffer.from(ciphertext);corrupted[0]^=1;
  assert.throws(()=>decrypt(corrupted),'Tampering must fail authentication');
  assert.throws(()=>decrypt(ciphertext,Buffer.alloc(16)),'Wrong authentication tag must fail');
  const backup=JSON.parse(decrypt(ciphertext));
  restored=await localRuntime(path.join(root,'restored-db'));
  const statements=backup.tables.map(t=>restored.db.prepare('DELETE FROM "'+t.name+'"'));
  for(const table of backup.tables)for(const row of table.rows){const columns=Object.keys(row);statements.push(restored.db.prepare('INSERT INTO "'+table.name+'" ('+columns.map(c=>'"'+c+'"').join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').bind(...columns.map(c=>row[c])));}
  await restored.db.batch(statements);
  const after=await snapshot(restored.db);
  assert.deepEqual(after,before,'Restored table schemas and every row must match');
  await migrateLocal(restored.db);
  assert.deepEqual(await snapshot(restored.db),before,'Re-running migration runner must preserve restored rows');
  const response=await restored.mf.dispatchFetch('http://restore.local/v1/state',{headers:{'oai-authenticated-user-id':'restore-synthetic','x-cohort-key':'restore-read','x-cohort-now':String(Date.parse('2026-10-24T12:00:00Z'))}});
  const state=await response.json();assert.equal(response.status,200);assert.equal(state.revision,revision);assert.equal(state.foodEntries.length,1);assert.equal(state.weights.length,1);assert.equal(state.waterLogs.length,1);
  const proof={passed:true,scope:'LOCAL_SYNTHETIC_D1_EXPORT_ENCRYPT_RESTORE',durationMs:performance.now()-started,requests,
    tableCounts:Object.fromEntries(before.map(t=>[t.name,t.rows.length])),plaintextSha256:digest(plaintext),ciphertextSha256:digest(ciphertext),
    checks:{allSchemasAndRowsEqual:true,tamperedCiphertextRejected:true,wrongAuthenticationTagRejected:true,migrationRerunPreservesData:true,restoredHttpReadPassed:true},
    limitations:['Local logical export only; not a Cloudflare remote export, Time Travel, production backup schedule or production disaster-recovery proof.','Encryption key is ephemeral in-memory for this drill; production key storage/rotation/recovery is not implemented.','Small synthetic account; restore performance and RTO/RPO under real data volume remain unmeasured.']};
  writeFileSync(path.join(root,'restore-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await source.mf.dispose();if(restored)await restored.mf.dispose();}
