import fs from 'node:fs';
import path from 'node:path';
import {createGunzip,gunzipSync} from 'node:zlib';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: scenario-performance.mjs <completed-run> <new-report>');if(fs.existsSync(output))throw Error('Preserve prior measurement');
const report=JSON.parse(fs.readFileSync(path.join(root,'measurement.json')));if(report.status!=='COMPLETED'||!report.passed)throw Error('Requires a completed scenario');
const groups=new Map();let count=0;
function event(e){
 if(e.status!==200)return;count++;if(!Number.isFinite(e.latencyMs)||e.latencyMs<0)throw Error('Missing real timing');
 const horizon=e.day<=30?'first-30-days':e.day>=336?'last-30-days':'middle',action=e.endpoint==='commands'?e.body.action:e.endpoint;
 const key=JSON.stringify([e.userId,horizon,action]),g=groups.get(key)||{userId:e.userId,window:horizon,operation:action,latencies:[],bytes:[]};
 g.latencies.push(e.latencyMs);g.bytes.push(Buffer.byteLength(JSON.stringify(e.response)));groups.set(key,g);
}
const file=path.join(root,report.eventsFile||'http-events.json.gz'),hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);if(hash.digest('hex')!==report.eventsSha256)throw Error('Raw digest mismatch');
if(report.eventsFormat==='NDJSON_GZIP_V1'){
 const stream=fs.createReadStream(file).pipe(createGunzip()),reader=createInterface({input:stream,crlfDelay:Infinity});let error;stream.on('error',e=>{error=e;reader.close();});for await(const line of reader)if(line.trim())event(JSON.parse(line));if(error)throw error;
}else for(const e of JSON.parse(gunzipSync(fs.readFileSync(file))))event(e);
function stats(a){a.sort((a,b)=>a-b);const q=p=>a[Math.floor((a.length-1)*p)];return {n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1)};}
const result={scope:'OBSERVED_LOCAL_DISPATCH_TIMING_AND_JSON_BYTES_DURING_SCRIPTED_YEAR_HISTORIES',root:path.resolve(root),status:'MEASURED',requests:count,rows:[...groups.values()].map(g=>({userId:g.userId,window:g.window,operation:g.operation,latencyMs:stats(g.latencies),responseJsonBytes:stats(g.bytes)})),limitations:['Actual measured dispatch/response parsing times; no production edge/mobile/network latency claim.','Early and late windows are observational and include varying records/operations and possible concurrent local run contention.','A day has one scripted food summary/weight/check-in; not maximum mixed histories, sustained capacity or an SLA.','No fixed timing threshold is inferred from these samples.']};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,requests:count,rows:result.rows.filter(r=>['first-30-days','last-30-days'].includes(r.window)&&['weight','food','recovery','coaching/brief'].includes(r.operation))}));
