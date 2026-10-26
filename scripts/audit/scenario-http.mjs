import fs from 'node:fs';
import path from 'node:path';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {once} from 'node:events';
import {localRuntime} from '../cohort/runtime.mjs';
import {sourceProvenance,snapshotSource,sha256} from './evidence.mjs';

// Test identity/clock adapter only. Uses ordinary account routes, never production.
export async function scenarioRuntime(output,scope){
 output=path.resolve(output);
 if(fs.existsSync(output))throw Error('Preserve previous measurement: '+output);
 fs.mkdirSync(output,{recursive:true});
 const provenance=sourceProvenance();snapshotSource(output,provenance.sourceHashes);
 const {mf,db}=await localRuntime(output),events=[],checks=[];
 const rawPath=path.join(output,'http-events.jsonl.gz'),gzip=createGzip();let streamError;
 const streamDone=pipeline(gzip,fs.createWriteStream(rawPath)).catch(e=>{streamError=e;});
 const report={scope,startedAt:new Date().toISOString(),provenance,checks,status:'RUNNING',limitations:['Synthetic local Worker/D1 HTTP dispatch with trusted identity/clock, not public JWT, edge or mobile networking.','On-demand generated notes are not delivered/read notifications or human-perception measurements.','Product-rule verification does not establish clinical suitability.']};
 function check(name,condition,details={}){checks.push({name,status:condition?'PASS':'FAIL',...details});}
 function client(userId){
  let seq=0,day=1,state={revision:0};
  return {userId,get state(){return state;},set day(n){day=n;},get day(){return day;},
   async request(method,endpoint,body=null,options={}){
    seq++;const key=options.key||`${userId}:${seq}`,now=Date.parse('2026-10-24T12:00:00Z')+(day-1)*86400000+seq*1000;
    const headers={'oai-authenticated-user-id':userId,'Content-Type':'application/json','Idempotency-Key':key,'x-cohort-key':options.seedKey||key,'x-cohort-now':String(now)};
    const start=performance.now(),response=await mf.dispatchFetch('http://scenario.local/v1/'+endpoint,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),value=await response.json();
    const event={userId,day,seq,method,endpoint,headers,body,status:response.status,requestId:response.headers.get('X-Request-Id'),response:value,latencyMs:performance.now()-start};
    if(streamError)throw streamError;
    if(!gzip.write(JSON.stringify(event)+'\n'))await once(gzip,'drain');
    events.push({userId,day,seq,status:event.status,latencyMs:event.latencyMs});
    if(response.status===200&&endpoint==='state')state=value;
    return event;
   },
   async command(action,payload={},options={}){
    const e=await this.request('POST','commands',{revision:state.revision,action,payload},options);
    if(e.status===200)state=e.response;
    if(!options.allowFailure&&e.status!==200)throw Error(`${userId} day ${day} ${action}: ${e.status} ${JSON.stringify(e.response)}`);
    return e;
   },
   async brief(){return this.request('GET','coaching/brief');},
  };
 }
 return {output,report,events,checks,check,client,db,
  async finish(error){
   report.status=error?'FAILED':'COMPLETED';if(error)report.error={message:error.message,stack:error.stack};
   report.finishedAt=new Date().toISOString();report.passed=!error&&!checks.some(c=>c.status==='FAIL');
   report.totals={httpEvents:events.length,checks:checks.length,failedChecks:checks.filter(c=>c.status==='FAIL').length,statuses:events.reduce((a,e)=>(a[e.status]=(a[e.status]||0)+1,a),{})};
   report.runtimeSha256=sha256(fs.readFileSync(path.join(output,'.runtime/worker.js')));
   gzip.end();await streamDone;
   if(streamError){report.status='FAILED';report.passed=false;report.error={message:streamError.message};}
   report.eventsFile='http-events.jsonl.gz';report.eventsFormat='NDJSON_GZIP_V1';report.eventsSha256=sha256(fs.readFileSync(rawPath));
   fs.writeFileSync(path.join(output,'measurement.json'),JSON.stringify(report,null,2)+'\n');
   console.log(JSON.stringify({output,scope,status:report.status,passed:report.passed,totals:report.totals,summary:report.summary}));await mf.dispose();
   if(!report.passed)process.exitCode=1;
  }
 };
}

export function independentPlanIssues(plan,library){
 const issues=[];if(!plan?.days||plan.days.length!==7)return ['MISSING_SEVEN_DAY_PLAN'];
 for(const day of plan.days){
  const sums={energy:0,protein:0,carbs:0,sodium:0};
  if(!day.meals?.length)issues.push('EMPTY_DAY');
  for(const meal of day.meals||[]){
   if(!meal.snapshot?.ingredients?.length){issues.push('EMPTY_MEAL');continue;}
   for(const metric of Object.keys(sums)){
    let total=0;
    for(const item of meal.snapshot.ingredients){
     const source=library.ingredients[item.key],v=source?.values?.[metric];
     if(!source||!(Number(item.grams)>0)||v==null||!Number.isFinite(Number(v))){total=null;break;}
     if(Number(item.values_per_100g?.[metric])!==Number(v))issues.push('SOURCE_REFERENCE_MISMATCH');
     total+=Number(item.grams)*Number(v)/100;
    }
    if(total==null){if(['energy','protein'].includes(metric))issues.push('MISSING_'+metric);sums[metric]=null;continue;}
    const declared=meal.snapshot.values[metric];if(declared==null||Math.abs(total-Number(declared))>1e-5)issues.push('MEAL_ARITHMETIC_'+metric);
    if(sums[metric]!=null)sums[metric]+=total;
   }
  }
  for(const metric of ['energy','protein'])if(sums[metric]==null||Math.abs(sums[metric]-Number(day.summary.values[metric]))>1e-5)issues.push('DAY_ARITHMETIC_'+metric);
  if(sums.energy==null||Math.abs(sums.energy-day.targets.energy)>day.targets.energy*.15+1e-7)issues.push('ENERGY_BOUND');
  if(sums.protein==null||sums.protein+1e-7<day.targets.protein*.8)issues.push('PROTEIN_BOUND');
  if(plan.preferences?.diet==='keto'&&(sums.carbs==null||sums.carbs>50+1e-7))issues.push('KETO_CARB_BOUND');
  if(plan.preferences?.diet==='low_carb'&&(sums.carbs==null||sums.carbs>130+1e-7))issues.push('LOW_CARB_BOUND');
 }
 return [...new Set(issues)];
}
