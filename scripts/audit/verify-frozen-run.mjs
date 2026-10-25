// Execute the recorded verifier against the exact archived inputs, not today's release.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {sha256} from './evidence.mjs';

const root=path.resolve(process.argv[2]||''),manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'))),snapshot=path.join(root,'source');
const changed=Object.entries(manifest.provenance.sourceHashes).filter(([p,h])=>!existsSync(p)||sha256(readFileSync(p))!==h).map(([p])=>p);
const result=spawnSync(process.execPath,[path.join(snapshot,'scripts/cohort/verify.mjs'),'--output='+root],{cwd:snapshot,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
const evidence={scope:'HISTORICAL_FROZEN_INPUTS_NOT_CURRENT_RELEASE',sourceCommit:manifest.gitCommit,verifiedSourceRoot:snapshot,currentCheckoutDiffers:changed.length>0,changedInputs:changed,exitCode:result.status,error:result.error?.message||null,
 limitation:'Passing artifact/source verification does not clear the recorded quality findings, prove clinical safety, or validate later production fixes.'};
writeFileSync('docs/production-readiness/evidence/frozen-source-verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));process.exitCode=result.status??1;
