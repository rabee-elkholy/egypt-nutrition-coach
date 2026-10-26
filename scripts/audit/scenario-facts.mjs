import fs from 'node:fs';
import path from 'node:path';
import {createGunzip,gunzipSync} from 'node:zlib';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {inspect} from './followup-facts.mjs';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: scenario-facts.mjs <completed-run> <new-verdict>');if(fs.existsSync(output))throw Error('Preserve prior verdict');
const report=JSON.parse(fs.readFileSync(path.join(root,'measurement.json'))),states=new Map(),failures=[],keys={};let events=0,views=0,notes=0;
function event(e){
 events++;if(e.status!==200)return;
 if((e.method==='POST'&&e.endpoint==='commands')||e.endpoint==='state')states.set(e.userId,e.response);
 if(e.endpoint!=='coaching/brief')return;
 views++;notes+=e.response.notes.length;
 const state=states.get(e.userId);
 if(!state){failures.push({userId:e.userId,day:e.day,rule:'MISSING_PRIOR_STATE'});return;}
 for(const note of e.response.notes)keys[note.key]=(keys[note.key]||0)+1;
 failures.push(...inspect({userId:e.userId,date:e.response.date,state,behavior:{openedApp:true}},{request:{simulation:false},response:e.response}).map(f=>({...f,userId:e.userId,day:e.day,seq:e.seq})));
}
const file=path.join(root,report.eventsFile||'http-events.json.gz'),hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);if(hash.digest('hex')!==report.eventsSha256)throw Error('Raw digest mismatch');
if(report.eventsFormat==='NDJSON_GZIP_V1'){
 const stream=fs.createReadStream(file).pipe(createGunzip()),reader=createInterface({input:stream,crlfDelay:Infinity});let streamError;stream.on('error',e=>{streamError=e;reader.close();});
 for await(const line of reader)if(line.trim())event(JSON.parse(line));if(streamError)throw streamError;
}else for(const e of JSON.parse(gunzipSync(fs.readFileSync(file))))event(e);
const result={scope:'FINITE_FACTUAL_RULES_ON_ORIGINAL_SCENARIO_HTTP_NOTES',root:path.resolve(root),auditorSha256:createHash('sha256').update(fs.readFileSync(new URL('./followup-facts.mjs',import.meta.url))).digest('hex'),passed:report.status==='COMPLETED'&&report.passed===true&&events===report.totals.httpEvents&&!failures.length,events,views,notes,keys,failures,limitations:['Selected factual rules only; no clinical, delivery, reading, human satisfaction or exhaustive language claim.']};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,failures:failures.slice(0,15)}));if(!result.passed)process.exitCode=1;
