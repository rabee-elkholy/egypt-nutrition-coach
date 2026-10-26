import fs from 'node:fs';
import path from 'node:path';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export async function verifyScenario(root){
 const report=JSON.parse(fs.readFileSync(path.join(root,'measurement.json'))),failures=[],statuses={},days=new Set(),sequences=new Map();let count=0,notes=0;
 if(report.status!=='COMPLETED'||report.passed!==true)failures.push('MEASUREMENT_NOT_COMPLETE_OR_CHECK_FAILED');
 const file=path.join(root,report.eventsFile||'http-events.json.gz');
 const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
 if(hash.digest('hex')!==report.eventsSha256)failures.push('RAW_DIGEST_MISMATCH');
 async function inspect(event){
  count++;statuses[event.status]=(statuses[event.status]||0)+1;
  if(!event.userId||!Number.isInteger(event.day)||event.day<1||!event.requestId)failures.push('INVALID_EVENT_IDENTITY');
  const expected=1+(sequences.get(event.userId)||0);if(event.seq!==expected)failures.push('EVENT_SEQUENCE_GAP_OR_DUPLICATE');sequences.set(event.userId,event.seq);
  days.add(event.userId+':'+event.day);
  const date=event.headers?.['x-cohort-now']&&event.response.timezone?new Intl.DateTimeFormat('en-CA',{timeZone:event.response.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(event.headers['x-cohort-now']))):new Date(Date.parse('2026-10-24T12:00:00Z')+(event.day-1)*86400000).toISOString().slice(0,10);
  if(event.status>=500)failures.push('SERVER_ERROR');
  if(event.endpoint==='coaching/brief'&&event.status===200){
   if(event.response.date!==date)failures.push('BRIEF_CALENDAR_MISMATCH');
   for(const note of event.response.notes){notes++;if(note.status!=='GENERATED'||note.deliveryStatus!=='NOT_MEASURED'||note.renderingStatus!=='NOT_MEASURED'||!note.id||!note.text)failures.push('INVALID_NOTE_EVIDENCE');}
  }
 }
 if(report.eventsFormat==='NDJSON_GZIP_V1'){
  const stream=fs.createReadStream(file).pipe(createGunzip()),reader=createInterface({input:stream,crlfDelay:Infinity});
  // Forward decompression errors so corrupt gzip cannot masquerade as early EOF.
  stream.on('error',e=>reader.close());let streamError;stream.on('error',e=>{streamError=e;});
  for await(const line of reader)if(line.trim())await inspect(JSON.parse(line));
  if(streamError)failures.push('RAW_DECOMPRESSION_FAILED');
 }else{
  const {gunzipSync}=await import('node:zlib');for(const event of JSON.parse(gunzipSync(fs.readFileSync(file))))await inspect(event);
 }
 if(count!==report.totals.httpEvents)failures.push('HTTP_COUNT_MISMATCH');
 if(JSON.stringify(Object.entries(statuses).sort())!==JSON.stringify(Object.entries(report.totals.statuses).sort()))failures.push('STATUS_COUNT_MISMATCH');
 const s=report.summary,expectedDays=s?.matchedUserDays!=null?s.matchedUserDays+s.recoveryUserDays:s?.userDays??s?.cases;
 if(expectedDays!=null&&days.size!==expectedDays)failures.push('UNIQUE_USER_DAY_COUNT_MISMATCH');
 const result={scope:'INDEPENDENT_STREAMED_HTTP_EVIDENCE_CENSUS',root:path.resolve(root),passed:failures.length===0,httpEvents:count,uniqueUserDays:days.size,users:sequences.size,notes,statuses,failures:[...new Set(failures)],limitations:['Structural evidence and truthful note status checks; does not replace the scenario semantic checks or establish production/human acceptance.']};return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: verify-scenarios.mjs <completed-run> <new-verdict-file>');if(fs.existsSync(output))throw Error('Preserve previous verdict');
 const result=await verifyScenario(root);fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
