// Read verified, immutable evidence; never turn an incomplete campaign into a pass.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';

const options=Object.fromEntries(process.argv.slice(2).map(value=>{const [key,...parts]=value.replace(/^--/,'').split('=');return [key,parts.join('=')];}));
assert.ok(options.left&&options.right&&options.output,'Use --left=<baseline shards> --right=<candidate shards> --output=<report.json>');
const project=fileURLToPath(new URL('../../',import.meta.url));
const left=path.resolve(options.left),right=path.resolve(options.right),output=path.resolve(options.output);
const digest=value=>createHash('sha256').update(value).digest('hex');
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const bundle=await build({absWorkingDir:project,entryPoints:['scripts/cohort/local-worker.mjs'],outfile:'quality-runtime.js',bundle:true,format:'esm',platform:'browser',external:['node:async_hooks'],target:'es2022',minify:true,write:false,metafile:true});
const runtimeSha256=digest(bundle.outputFiles[0].contents);
const allUsers={baseline:new Set(),candidate:new Set()},parts=[];
const totals={baseline:{users:0,days:0,events:0,messages:0,normalizedRecords:0,archivedPlans:0,expectedValidationRejections:0,guardRejections:0},candidate:{users:0,days:0,events:0,messages:0,normalizedRecords:0,archivedPlans:0,expectedValidationRejections:0,guardRejections:0}};

function inspectGuard(root,error){
 const body=error.request.body,rawPath=path.join(root,'users',error.userId,'days',String(error.day).padStart(3,'0')+'.json.gz');
 const day=JSON.parse(gunzipSync(readFileSync(rawPath)));
 const recorded=day.records.find(record=>record.eventId===error.eventId);
 assert.deepEqual(recorded.response,error.response,'Derived error must agree with the original response');
 let reason;
 if(body.action==='food_complete'&&error.response.message==='سجّل أكلك الأول قبل إغلاق اليوم.'){
  assert.equal(day.state.foodEntries.filter(entry=>entry.date===body.payload.date).length,0);
  reason='The harness tried to close a date without recorded food; the API correctly required food first.';
 }else if(body.action==='workout'&&error.response.message==='التمرين غير موجود في يومك المحدد.'){
  const index=day.records.indexOf(recorded),prior=day.records.slice(0,index).findLast(record=>record.response.workoutPlan)?.response.workoutPlan;
  assert.ok(prior,'A preceding full response must establish the actual workout plan');
  const exercises=prior.days.find(value=>value.dayIndex===body.payload.dayIndex)?.exercises||[];
  assert.ok(!exercises.some(value=>value.id===body.payload.exerciseId));
  reason='The harness retained an exercise from before regeneration; the API correctly rejected an exercise outside the current day.';
 }else throw Error('Unexplained rejection '+error.eventId);
 return {eventId:error.eventId,date:day.date,action:body.action,status:error.status,reason};
}

for(let index=0;index<8;index++){
 const part={shard:index};
 for(const [kind,parent]of [['baseline',left],['candidate',right]]){
  const root=path.join(parent,'shard-'+index),manifest=read(root+'/manifest.json');
  assert.equal(manifest.status,'complete',root+' incomplete');
  const verification=read(root+'/verification.json'),persistence=read(root+'/persistence-verification.json'),config=read(root+'/simulation_config.json'),cohort=read(root+'/cohort.json');
  assert.equal(config.days,90);assert.equal(config.cohortGenerationUsers,100);assert.equal(config.shards,8);assert.equal(config.shard,index);
  assert.equal(verification.passed,true,root+' HTTP/calendar/source verification failed');
  assert.deepEqual(verification.failures,[]);
  assert.ok(Object.values(verification.checks).every(check=>check.passed));
  assert.equal(verification.counts.days,cohort.length*90);
  assert.equal(persistence.auditorVersion,2);assert.equal(persistence.passed,true);assert.deepEqual(persistence.failures,[]);assert.equal(persistence.users,cohort.length);
  for(const user of cohort){assert.ok(!allUsers[kind].has(user.userId),'Duplicate user across shards');allUsers[kind].add(user.userId);}
  const guards=[];let expectedValidationRejections=0;
  for(const line of readFileSync(root+'/all_errors.jsonl','utf8').split('\n').filter(Boolean)){
   const error=JSON.parse(line);
   assert.equal(error.status,400,'Infrastructure failures and unexplained conflicts require a fresh run: '+error.eventId);
   if(error.expectedOutcome==='VALIDATION_ERROR'){
    assert.equal(error.request.body.action,'water');assert.equal(error.request.body.payload.cups,-1);expectedValidationRejections++;
   }else guards.push(inspectGuard(root,error));
  }
  const runtimeHash=digest(readFileSync(root+'/.runtime/worker.js'));
  if(kind==='candidate')assert.equal(runtimeHash,runtimeSha256,'Captured backend differs from the current Worker graph');
  part[kind]={directory:root,seed:config.seed,counts:verification.counts,normalizedRecords:persistence.records,archivedPlans:persistence.plans,expectedValidationRejections,guardRejections:guards,manifestSha256:digest(readFileSync(root+'/manifest.json')),runtimeSha256:runtimeHash,sourceFiles:manifest.sourceSnapshot.files,verification,persistence};
  const total=totals[kind];total.users+=cohort.length;total.days+=verification.counts.days;total.events+=verification.counts.events;total.messages+=verification.counts.messages;total.normalizedRecords+=persistence.records;total.archivedPlans+=persistence.plans;total.expectedValidationRejections+=expectedValidationRejections;total.guardRejections+=guards.length;
 }
 assert.equal(part.baseline.seed,part.candidate.seed);
 assert.deepEqual(part.baseline.counts,part.candidate.counts);
 const comparison=read(path.join(right,'shard-'+index,'comparison.json'));
 assert.equal(comparison.passed,true);assert.deepEqual(comparison.differences,[]);assert.deepEqual(comparison.missing,[]);assert.equal(comparison.comparedDays,part.candidate.counts.days);
 part.comparison=comparison;parts.push(part);
}
for(const kind of ['baseline','candidate']){assert.equal(allUsers[kind].size,100);assert.equal(totals[kind].users,100);assert.equal(totals[kind].days,9000);}
assert.deepEqual([...allUsers.baseline].sort(),[...allUsers.candidate].sort());
const report={passed:true,completedAt:new Date().toISOString(),baselineCommit:'329fae6a401c07eb5e7872a266514aa57a227581',currentCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim(),totals,comparedDays:9000,differences:0,runtimeSha256,runtimeInputs:Object.fromEntries(Object.keys(bundle.metafile.inputs).map(file=>[file,digest(readFileSync(path.resolve(project,file)))])),parts,limitations:['Synthetic 100-person cohort with 90 consecutive local calendar dates; not a clinical certification or retention measurement.','Real local Worker HTTP/D1, with harness-only deterministic time/UUID and trusted identity; public JWT/edge behavior is covered separately.','Frontend lifecycle and date-draft fixes are validated by separate real-browser tests; they do not enter this backend bundle.','Latency, diagnostic response size and run timestamps are excluded from comparisons; logical HTTP responses, state, messages and decisions are compared exactly.','Failed infrastructure attempts are preserved separately and replaced with full clean shard runs; no failed records or dates are removed from a completed run.']};
mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,totals,comparedDays:9000,differences:0,output}));
