import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {verifyScenario} from '../scripts/audit/verify-scenarios.mjs';
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'curafit-evidence-'));const event={userId:'a',day:1,seq:1,status:200,endpoint:'coaching/brief',requestId:'r',response:{date:'2026-10-24',notes:[{id:'n',text:'Measured',status:'GENERATED',deliveryStatus:'NOT_MEASURED',renderingStatus:'NOT_MEASURED'}]}};return {root,event};}
function write(root,events,mutate=()=>{}){const raw=gzipSync(events.map(e=>JSON.stringify(e)).join('\n')+'\n');fs.writeFileSync(path.join(root,'http-events.jsonl.gz'),raw);const report={status:'COMPLETED',passed:true,eventsFormat:'NDJSON_GZIP_V1',eventsFile:'http-events.jsonl.gz',eventsSha256:createHash('sha256').update(raw).digest('hex'),totals:{httpEvents:events.length,statuses:{200:events.length}},summary:{userDays:1}};mutate(report);fs.writeFileSync(path.join(root,'measurement.json'),JSON.stringify(report));}
test('independent scenario verifier accepts complete raw evidence and rejects count, digest, calendar, delivery and sequence mutations',async()=>{
 const {root,event}=fixture();try{
  write(root,[event]);assert.equal((await verifyScenario(root)).passed,true);
  for(const mutation of [r=>r.totals.httpEvents++,r=>r.eventsSha256='invalid',r=>r.summary.userDays=2]){write(root,[event],mutation);assert.equal((await verifyScenario(root)).passed,false);}
  for(const mutation of [e=>e.response.date='2026-10-25',e=>e.response.notes[0].deliveryStatus='DELIVERED',e=>e.seq=2]){const e=structuredClone(event);mutation(e);write(root,[e]);assert.equal((await verifyScenario(root)).passed,false);}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
