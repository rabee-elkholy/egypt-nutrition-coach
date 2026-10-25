import {spawnSync} from 'node:child_process';
import {readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root='reports/simulation-100-users-90-days/audit-recovery-20261024';
if(existsSync(root))throw Error('Recovery evidence already exists; preserve it and use a new run label');
mkdirSync(root,{recursive:true});
const attempts=[];
function execute(label, extra) {
  const args=['scripts/cohort/run.mjs','--users=1','--days=14','--seed=curafit-recovery-v1',...extra];
  const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:120000});
  writeFileSync(path.join(root,label+'.stdout.log'),result.stdout||'');
  writeFileSync(path.join(root,label+'.stderr.log'),result.stderr||'');
  attempts.push({label,command:['node',...args],exitCode:result.status,error:result.error?.message||null});
  return result;
}
const interrupted=execute('interrupted',['--output='+root+'/resumed','--interrupt-after-event=5']);
assert.equal(interrupted.status,1);
assert.ok(interrupted.stderr.includes('COHORT_INJECTED_INTERRUPTION_AFTER_JOURNAL'));
assert.equal(execute('resumed',['--output='+root+'/resumed','--resume']).status,0);
assert.equal(execute('control',['--output='+root+'/control']).status,0);
const checkpoint=dir=>JSON.parse(readFileSync(path.join(root,dir,'users/user-001/checkpoint.json')));
assert.deepEqual(checkpoint('resumed'),checkpoint('control'));
const proof={passed:true,assertion:'Actual persisted checkpoint, memory and event sequence equal after journal interruption/resume versus an uninterrupted control',attempts,
  limitations:['One deterministic user and one injected interruption point; not exhaustive process, disk or network failure coverage.']};
writeFileSync(path.join(root,'recovery-proof.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));
