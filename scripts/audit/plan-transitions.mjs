import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare,Log,LogLevel} from 'miniflare';

const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const simulationId=value=>'__simulation__:'+createHash('sha256').update(value).digest('hex');

export function inspectNutritionHistory(bundles,persisted){
 const failures=[],transitions=[],snapshots=new Map(),previous=new Map();
 const archives=new Map(persisted.map(p=>[p.namespace+':'+p.plan.id,p.plan]));
 for(const bundle of bundles)for(const event of bundle.records){
  if(!event.response?.profile)continue;
  const state=event.response,namespace=event.request.simulation?'simulation':'real',action=event.request.body?.action||null;
  const plans=state.plans||[],ids=plans.map(p=>p.id);
  if(new Set(ids).size!==ids.length)failures.push({code:'DUPLICATE_PLAN_ID',eventId:event.eventId});
  for(const plan of plans){
   const key=namespace+':'+plan.id,hash=digest(plan),prior=snapshots.get(key);
   if(prior&&prior.hash!==hash)failures.push({code:'MUTATED_NUTRITION_SNAPSHOT',planId:plan.id,eventId:event.eventId,previousEvent:prior.eventId});
   else if(!prior)snapshots.set(key,{namespace,planId:plan.id,hash,eventId:event.eventId,plan});
  }
  const active=state.active_plan_id||null,prior=previous.get(namespace);
  if(active&&!ids.includes(active))failures.push({code:'MISSING_ACTIVE_SNAPSHOT',planId:active,eventId:event.eventId});
  if(active&&active!==prior?.active){
   let reason=null;
   if(action==='generate')reason=prior?.active?'USER_REQUESTED_REGENERATION':'INITIAL_CREATION';
   if(action==='simulation_reset')reason='SIMULATION_RESET';
   if(action==='simulation_next'||action==='renew_plan')reason='WEEKLY_RENEWAL';
   if(action==='replace_meal')reason='MEAL_SUBSTITUTION';
   if(action==='confirm_schedule')reason='SCHEDULE_CONFIRMATION';
   if(action==='adaptation'&&event.request.body.payload?.accept===true){
    const proposal=prior?.state.adaptations?.find(a=>a.id===event.request.body.payload.id);
    if(!proposal||proposal.status!=='pending')failures.push({code:'MISSING_ADAPTATION_PROPOSAL',eventId:event.eventId});
    if(!state.adaptations?.some(a=>a.id===proposal?.id&&a.status==='accepted'))failures.push({code:'ADAPTATION_NOT_ACCEPTED',eventId:event.eventId});
    reason='ACCEPTED_ADAPTATION';
   }
   if(!reason)failures.push({code:'UNJUSTIFIED_PLAN_TRANSITION',eventId:event.eventId,action,previousId:prior?.active||null,nextId:active});
   const plan=plans.find(p=>p.id===active);
   if(prior?.active&&['MEAL_SUBSTITUTION','WEEKLY_RENEWAL','SCHEDULE_CONFIRMATION'].includes(reason)&&plan?.parent_id!==prior.active)failures.push({code:'BROKEN_PARENT_CHAIN',eventId:event.eventId,planId:active,parent:plan?.parent_id,expected:prior.active});
   const previousPlan=prior?.state.plans?.find(p=>p.id===prior.active);
   if(reason==='WEEKLY_RENEWAL'&&previousPlan?.days.at(-1)?.date>=state.serverDate)failures.push({code:'PREMATURE_WEEKLY_RENEWAL',eventId:event.eventId});
   if(reason==='MEAL_SUBSTITUTION'){
    const payload=event.request.body.payload||{},meal=plan?.days.flatMap(d=>d.meals).find(m=>m.id===payload.mealId);
    if(!meal||(payload.templateId||payload.alternativeId)!==meal.snapshot?.template_id)failures.push({code:'MEAL_SUBSTITUTION_PAYLOAD_MISMATCH',eventId:event.eventId});
   }
   transitions.push({namespace,day:bundle.day,date:bundle.date,eventId:event.eventId,requestId:event.requestId,action,reason,previousId:prior?.active||null,nextId:active,parentId:plan?.parent_id||null,recordedChangeReason:plan?.changeReason||null,revision:state.revision});
  }
  previous.set(namespace,{active,state});
 }
 for(const [key,snapshot] of snapshots){
  const archived=archives.get(key);
  if(!archived)failures.push({code:'MISSING_PERSISTED_SNAPSHOT',namespace:snapshot.namespace,planId:snapshot.planId});
  else if(digest(archived)!==snapshot.hash)failures.push({code:'PERSISTED_SNAPSHOT_MISMATCH',namespace:snapshot.namespace,planId:snapshot.planId,eventId:snapshot.eventId});
  if(!transitions.some(t=>t.namespace===snapshot.namespace&&t.nextId===snapshot.planId))failures.push({code:'UNOBSERVED_PLAN_TRANSITION',namespace:snapshot.namespace,planId:snapshot.planId});
 }
 for(const [key,plan] of archives)if(!snapshots.has(key))failures.push({code:'UNOBSERVED_PERSISTED_PLAN',planId:plan.id});
 return {passed:failures.length===0,transitions,snapshots:[...snapshots.values()].map(({plan,...s})=>s),failures,
  limitations:['Nutrition snapshots and command-backed transitions only; workout presentation can change with live recovery/suggestions and needs a separate canonical-prescription audit.','A supported trigger and retained snapshot do not establish clinical appropriateness.']};
}

async function main(){
 const root=path.resolve(process.argv[2]||''),destination=path.resolve(process.argv[3]||'docs/production-readiness/evidence/plan-transition-audit.json');
 if(existsSync(destination))throw Error('Preserve existing audit output; select a new destination');
 const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'))),config=JSON.parse(readFileSync(path.join(root,'simulation_config.json'))),cohort=JSON.parse(readFileSync(path.join(root,'cohort.json')));
 if(manifest.status!=='complete')throw Error('Wait for the frozen run to complete before querying its persisted database');
 const mf=new Miniflare({modules:true,scriptPath:path.join(root,'.runtime/worker.js'),compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],d1Persist:path.join(root,'.local-d1'),log:new Log(LogLevel.ERROR)});
 try{
  const db=await mf.getD1Database('DB'),users=[];
  for(const persona of cohort){
   function* bundles(){for(let i=1;i<=config.days;i++)yield JSON.parse(gunzipSync(readFileSync(path.join(root,'users',persona.userId,'days',String(i).padStart(3,'0')+'.json.gz'))));}
   const persisted=[];
   for(const [namespace,identity] of [['real',persona.userId],['simulation',simulationId(persona.userId)]]){
    const rows=await db.prepare('SELECT body FROM coaching_plans WHERE user_id=?').bind(identity).all();
    persisted.push(...rows.results.map(r=>({namespace,plan:JSON.parse(r.body)})));
   }
   const result=inspectNutritionHistory(bundles(),persisted);users.push({userId:persona.userId,...result});
  }
  const report={sourceRun:root,sourceCommit:manifest.gitCommit,scope:'Full recorded nutrition transitions vs actual persisted local D1 archive',passed:users.every(u=>u.passed),users,
    totals:{users:users.length,snapshots:users.reduce((n,u)=>n+u.snapshots.length,0),transitions:users.reduce((n,u)=>n+u.transitions.length,0),failures:users.reduce((n,u)=>n+u.failures.length,0)}};
  writeFileSync(destination,JSON.stringify(report,null,2));console.log(JSON.stringify({output:destination,passed:report.passed,totals:report.totals}));if(!report.passed)process.exitCode=1;
 }finally{await mf.dispose();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
