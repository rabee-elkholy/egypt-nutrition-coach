// Canonical physical prescriptions vs the complete logical local D1 export.
// Live load suggestions are deliberately outside this immutable-prescription check.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const digest=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const physical=plan=>({id:plan.id,programId:plan.programId,parent_id:plan.parent_id,version:plan.version,split:plan.split,weekdayConvention:plan.weekdayConvention,days:plan.days.map(d=>({dayIndex:d.dayIndex,focus:d.focus,location:d.location,exercises:d.exercises.map(e=>({id:e.id,sets:e.sets,repMin:e.repMin,repMax:e.repMax,rir:e.rir,restSeconds:e.restSeconds,progressionKey:e.progressionKey,loadMode:e.loadMode,tracking:e.tracking,laterality:e.laterality,equipment:e.equipment}))}))});
function inspect(bundles,archives){
 const snapshots=new Map(),previous=new Map(),failures=[],transitions=[];
 for(const b of bundles)for(const event of b.records){
  if(event.status!==200||!event.response.profile||!event.response.workoutPlan)continue;
  const ns=event.request.simulation?'simulation':'real',plan=event.response.workoutPlan,key=ns+':'+plan.id,canon=physical(plan),signature=digest(canon),prior=previous.get(ns);
  if(snapshots.has(key)&&snapshots.get(key).signature!==signature)failures.push({code:'MUTATED_WORKOUT_PRESCRIPTION',planId:plan.id,eventId:event.eventId});
  if(!snapshots.has(key))snapshots.set(key,{namespace:ns,planId:plan.id,signature,canonical:canon,eventId:event.eventId});
  if(prior&&prior.id!==plan.id){
   const action=event.request.body?.action,proposal=event.response.adaptations?.find(a=>a.id===event.request.body?.payload?.id),allowed=['generate','simulation_reset','simulation_next','replace_exercise','confirm_schedule'].includes(action)||action==='adaptation'&&proposal?.kind==='weekly_volume'&&proposal?.status==='accepted';
   if(!allowed)failures.push({code:'UNSUPPORTED_WORKOUT_TRANSITION',from:prior.id,to:plan.id,action,eventId:event.eventId});
   if(['replace_exercise','confirm_schedule'].includes(action)||action==='adaptation'&&proposal?.kind==='weekly_volume'){
    if(plan.parent_id!==prior.id)failures.push({code:'WORKOUT_PARENT_MISMATCH',planId:plan.id,eventId:event.eventId});
   }
   if(action==='replace_exercise'){
    const p=event.request.body.payload,oldDay=prior.days.find(d=>d.dayIndex===Number(p.dayIndex)),newDay=plan.days.find(d=>d.dayIndex===Number(p.dayIndex)),index=oldDay?.exercises.findIndex(e=>e.id===p.exerciseId),old=oldDay?.exercises[index],replacement=newDay?.exercises[index];
    if(!old||!replacement||replacement.id!==p.alternativeId||replacement.sets!==old.sets||replacement.repMin!==old.repMin||replacement.repMax!==old.repMax)failures.push({code:'WORKOUT_REPLACEMENT_EFFECT',planId:plan.id,eventId:event.eventId});
   }
   if(action==='adaptation'&&proposal?.kind==='weekly_volume'){
    const old=prior.days.find(d=>d.dayIndex===proposal.dayIndex)?.exercises.find(e=>e.id===proposal.exerciseId),next=plan.days.find(d=>d.dayIndex===proposal.dayIndex)?.exercises.find(e=>e.id===proposal.exerciseId);
    if(!old||!next||next.sets!==old.sets+proposal.extraSets)failures.push({code:'WORKOUT_VOLUME_EFFECT',planId:plan.id,eventId:event.eventId});
   }
   transitions.push({namespace:ns,from:prior.id,to:plan.id,action,eventId:event.eventId});
  }
  previous.set(ns,plan);
 }
 const persisted=new Map(archives.map(a=>[a.namespace+':'+a.plan.id,a.plan]));
 for(const [key,s]of snapshots){const plan=persisted.get(key);if(!plan)failures.push({code:'MISSING_PERSISTED_WORKOUT',planId:s.planId});else if(digest(physical(plan))!==s.signature)failures.push({code:'PERSISTED_WORKOUT_MISMATCH',planId:s.planId});if(s.canonical.parent_id&&!persisted.has(s.namespace+':'+s.canonical.parent_id))failures.push({code:'MISSING_WORKOUT_PARENT',planId:s.planId});}
 for(const [key,plan]of persisted)if(!snapshots.has(key))failures.push({code:'UNOBSERVED_PERSISTED_WORKOUT',planId:plan.id});
 return {passed:!failures.length,snapshots:[...snapshots.values()].map(({canonical,...s})=>s),transitions,failures};
}
function selfTest(){
 const plan={id:'w1',version:1,days:[{dayIndex:1,exercises:[{id:'a',sets:3,repMin:8,repMax:12}]}]},next={...structuredClone(plan),id:'w2',parent_id:'w1',version:2};next.days[0].exercises[0].id='b';
 const event=(p,action,payload={})=>({eventId:action,status:200,request:{simulation:false,body:{action,payload}},response:{profile:{name:'fixture'},workoutPlan:p}}),fixture={bundles:[{records:[event(plan,'generate'),event(structuredClone(plan),'water'),event(next,'replace_exercise',{dayIndex:1,exerciseId:'a',alternativeId:'b'})]}],archives:[{namespace:'real',plan:structuredClone(plan)},{namespace:'real',plan:structuredClone(next)}]};assert.equal(inspect(fixture.bundles,fixture.archives).passed,true);
 const controls=[['MUTATED_WORKOUT_PRESCRIPTION',f=>f.bundles[0].records[1].response.workoutPlan.days[0].exercises[0].sets=99],['MISSING_PERSISTED_WORKOUT',f=>f.archives.shift()],['PERSISTED_WORKOUT_MISMATCH',f=>f.archives[1].plan.days[0].exercises[0].sets=88],['MISSING_WORKOUT_PARENT',f=>{f.archives[1].plan.parent_id='missing';f.bundles[0].records[2].response.workoutPlan.parent_id='missing';}],['UNSUPPORTED_WORKOUT_TRANSITION',f=>f.bundles[0].records[2].request.body.action='water'],['WORKOUT_REPLACEMENT_EFFECT',f=>f.bundles[0].records[2].request.body.payload.alternativeId='q']];
 for(const [code,mutate]of controls){const f=structuredClone(fixture);mutate(f);assert.ok(inspect(f.bundles,f.archives).failures.some(x=>x.code===code),code);}console.log(JSON.stringify({validFixture:1,negativeControls:controls.length,passed:true}));
}
if(process.argv.includes('--self-test'))selfTest();
else{
 const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);if(fs.existsSync(output))throw Error('Preserve existing audit');
 const manifest=JSON.parse(fs.readFileSync(root+'/manifest.json')),config=JSON.parse(fs.readFileSync(root+'/simulation_config.json')),cohort=JSON.parse(fs.readFileSync(root+'/cohort.json'));
 if(manifest.status!=='complete')throw Error('Only audit a completed run');
 const exportProof=JSON.parse(fs.readFileSync(root+'/database/export_manifest.jsonl')),table=fs.readFileSync(root+'/database/coaching_workout_plans.jsonl.gz'),proof=exportProof.files.find(f=>f.path==='coaching_workout_plans.jsonl.gz');assert.equal(digest(table),proof.sha256);
 const rows=gunzipSync(table).toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);assert.equal(rows.length,proof.rows);const users=[];
 for(const persona of cohort){const sim='__simulation__:'+digest(persona.userId),archives=rows.filter(r=>r.user_id===persona.userId||r.user_id===sim).map(r=>({namespace:r.user_id===sim?'simulation':'real',plan:JSON.parse(r.body)}));function* bundles(){for(let day=1;day<=config.days;day++)yield JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'users',persona.userId,'days',String(day).padStart(3,'0')+'.json.gz'))));}users.push({userId:persona.userId,...inspect(bundles(),archives)});}
 const report={scope:'CANONICAL_WORKOUT_PRESCRIPTIONS_VS_COMPLETE_LOGICAL_D1_EXPORT',sourceRun:root,sourceCommit:manifest.gitCommit,auditorSha256:digest(fs.readFileSync(new URL(import.meta.url))),auditedAt:new Date().toISOString(),passed:users.every(u=>u.passed),totals:{users:users.length,snapshots:users.reduce((s,u)=>s+u.snapshots.length,0),transitions:users.reduce((s,u)=>s+u.transitions.length,0),failures:users.reduce((s,u)=>s+u.failures.length,0)},users,limitations:['Selected physical prescription fields only; names, localization and derived live load suggestions are not canonicalized.','Archive equality and command-backed effects do not establish clinical or exercise-program suitability.','Persisted evidence comes from the complete hash-checked local D1 export; no production DB is accessed.']};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,passed:report.passed,totals:report.totals,failures:users.flatMap(u=>u.failures).slice(0,10)}));if(!report.passed)process.exitCode=1;
}
