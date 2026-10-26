// Replay original initial HTTP requests into a fresh local Worker/D1.
// It is an onboarding comparison, not another completed 100x90 cohort.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {localRuntime} from '../cohort/runtime.mjs';
import {sourceProvenance,sha256} from './evidence.mjs';
import {independentPlanIssues} from './scenario-http.mjs';
import {library} from '../../server/food.mjs';

const source=path.resolve(process.argv[2]||''),output=path.resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3])throw Error('Usage: onboarding-replay.mjs <completed-source-run> <new-output>');
if(fs.existsSync(output))throw Error('Preserve previous replay');
const read=file=>JSON.parse(fs.readFileSync(file)),manifest=read(path.join(source,'manifest.json')),config=read(path.join(source,'simulation_config.json')),cohort=read(path.join(source,'cohort.json'));
const priorReplay=process.argv[4]?read(path.resolve(process.argv[4])):null;
if(priorReplay)assert.equal(priorReplay.passed,true,'Prior comparison must have completed successfully');
assert.equal(manifest.status,'complete');
const provenance=sourceProvenance(),{mf,db}=await localRuntime(output),events=[],users=[],failures=[];
const report={scope:'EXACT_INITIAL_HTTP_COHORT_ONBOARDING_COMPARISON',sourceRun:source,originalSourceCommit:manifest.gitCommit,currentProvenance:provenance,startedAt:new Date().toISOString(),status:'RUNNING',users,failures,limitations:['Trusted harness identity/clock; not public login or mobile-network testing.','Initial onboarding only; not a replacement for a full longitudinal run.','Implemented nutrient bounds and persistence are checked; clinical suitability is not established.']};
try{
 for(const persona of cohort){
  const before=read(path.join(source,'users',persona.userId,'onboarding.json'));let seq=0;
  async function request(method,endpoint,body){
   seq++;const eventId=persona.userId+'-'+seq,key=sha256(config.seed+':'+eventId).slice(0,32),headers={'oai-authenticated-user-id':persona.userId,'Content-Type':'application/json','Idempotency-Key':key,'x-cohort-key':config.seed+':'+eventId,'x-cohort-now':String(Date.parse(config.startDate+'T12:00:00Z')+seq*1000)},url='http://onboarding-replay.local/v1/'+endpoint,start=performance.now(),response=await mf.dispatchFetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),value=await response.json();
   const event={userId:persona.userId,eventId,url,method,headers,body,status:response.status,requestId:response.headers.get('X-Request-Id'),response:value,latencyMs:performance.now()-start};events.push(event);return event;
  }
  await request('POST','eligibility',persona.onboarding);
  const generation=await request('POST','commands',{revision:0,action:'generate',payload:persona.onboarding}),reload=await request('GET','state');
  const result={userId:persona.userId,beforeStatus:before.status,afterStatus:generation.status,requestId:generation.requestId,reloadStatus:reload.status,afterPlanId:generation.response.active_plan_id||null,error:generation.response.message||null};users.push(result);
  if(generation.status>=500||reload.status!==200)failures.push({userId:persona.userId,code:'HTTP_OR_RELOAD_FAILURE'});
  if(before.status===200&&generation.status!==200)failures.push({userId:persona.userId,code:'PREVIOUSLY_SUPPORTED_PROFILE_REGRESSED'});
  if(priorReplay?.users.some(u=>u.userId===persona.userId&&u.afterStatus===200)&&generation.status!==200)failures.push({userId:persona.userId,code:'PRIOR_REPLAY_PROFILE_REGRESSED'});
  if(generation.status===200){
   assert.equal(reload.response.profile.name,persona.onboarding.name);assert.equal(reload.response.revision,1);assert.equal(reload.response.active_plan_id,generation.response.active_plan_id);
   const plan=reload.response.plans.find(p=>p.id===reload.response.active_plan_id);assert.equal(plan.days.length,7);assert.deepEqual(independentPlanIssues(plan,library),[],'Independent source arithmetic and nutrient bounds');
   for(const day of plan.days){const e=Number(day.summary.values.energy),p=Number(day.summary.values.protein);assert.ok(day.summary.values.energy!=null&&Number.isFinite(e));assert.ok(day.summary.values.protein!=null&&Number.isFinite(p));assert.ok(Math.abs(e-day.targets.energy)<=day.targets.energy*.15);assert.ok(p>=day.targets.protein*.8);}
  }else{assert.equal(reload.response.profile,null);assert.equal(reload.response.revision,0);}
 }
 const persisted=(await db.prepare('SELECT COUNT(*) AS n FROM coaching_accounts').first()).n,success=users.filter(u=>u.afterStatus===200).length;assert.equal(persisted,success);
 report.status='COMPLETED';report.passed=failures.length===0;report.totals={users:users.length,httpEvents:events.length,beforeSuccess:users.filter(u=>u.beforeStatus===200).length,afterSuccess:success,remainingRejected:users.filter(u=>u.afterStatus!==200).length,improved:users.filter(u=>u.beforeStatus!==200&&u.afterStatus===200).map(u=>u.userId),regressions:users.filter(u=>u.beforeStatus===200&&u.afterStatus!==200).map(u=>u.userId),persistedAccounts:persisted};
 if(priorReplay)report.priorComparison={source:path.resolve(process.argv[4]),supportedBefore:priorReplay.users.filter(u=>u.afterStatus===200).length,regressions:priorReplay.users.filter(u=>u.afterStatus===200&&!users.some(n=>n.userId===u.userId&&n.afterStatus===200)).map(u=>u.userId),additionalSupported:users.filter(u=>u.afterStatus===200&&priorReplay.users.some(p=>p.userId===u.userId&&p.afterStatus!==200)).map(u=>u.userId)};
 if(!report.passed)process.exitCode=1;
}catch(error){report.status='FAILED';report.passed=false;report.error={message:error.message,stack:error.stack};throw error;}
finally{report.finishedAt=new Date().toISOString();report.runtimeSha256=sha256(fs.readFileSync(path.join(output,'.runtime/worker.js')));fs.writeFileSync(path.join(output,'onboarding-http-events.json.gz'),gzipSync(JSON.stringify(events)));fs.writeFileSync(path.join(output,'onboarding-replay.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,status:report.status,passed:report.passed,totals:report.totals,failures}));await mf.dispose();}
