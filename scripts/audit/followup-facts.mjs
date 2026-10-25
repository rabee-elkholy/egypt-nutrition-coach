// Independent finite factual checks of original backend brief HTTP notes.
// No imports from the planner, message generator or its decision helpers.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const digest=value=>createHash('sha256').update(value).digest('hex');
const offset=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const n=value=>Math.round(value*10)/10;
const latest=values=>values.toSorted((a,b)=>a.date.localeCompare(b.date)||Date.parse(a.at)-Date.parse(b.at)).at(-1);
function inspect(b,event){
 const s=b.state,date=b.date,now=Date.parse(event.response.generatedAt),failures=[],notes=event.response.notes||[],ready=s.recovery||{},p=s.workoutPlan;
 const fail=(rule,note)=>failures.push({rule,noteId:note?.id||null,key:note?.key||null});
 if(event.response.date!==date)fail('BRIEF_DATE');
 if(!b.behavior.openedApp)fail('ABSENT_USER_FETCH');
 const owner=event.request.simulation?'__simulation__:'+digest(b.userId):b.userId;
 const entries=(s.foodEntries||[]).filter(x=>x.date===date),food=(s.foodLogs||[]).find(x=>x.date===date);
 const activity=['foodLogs','foodEntries','workoutLogs','sessions','waterLogs','weights','checkins'].flatMap(key=>s[key]||[]).filter(x=>x.date<=date);
 const fresh=latest((s.checkins||[]).filter(x=>x.date<=date&&Date.parse(x.at)<=now&&now-Date.parse(x.at)<=86400000));
 const ownedSessions=(s.sessions||[]).filter(x=>x.date===date&&(p?.programId?x.programId===p.programId:x.planId===p?.id)),session=latest(ownedSessions);
 const training=notes.find(x=>x.role==='training');
 if(p&&['hold','stop'].includes(ready.status)&&(training?.key!=='safety'||training?.priority!=='urgent'))fail('SAFETY_PRIORITY',training);
 for(const note of notes){
  if(note.id!=='brief-'+digest(JSON.stringify([owner,date,note.role])))fail('NOTE_IDENTITY',note);
  if(note.basedOnRevision!==event.response.revision||event.response.revision!==s.revision)fail('NOTE_REVISION',note);
  if(note.status!=='GENERATED'||note.deliveryStatus!=='NOT_MEASURED'||note.renderingStatus!=='NOT_MEASURED')fail('FALSE_DELIVERY',note);
  if(/undefined|NaN/.test(note.text+note.action))fail('INVALID_TEXT',note);
  const key=note.key;
  if(key==='food-missing'&&entries.length)fail('FALSE_MISSING_FOOD',note);
  if(key==='food-partial'&&(!entries.length||food?.complete||!note.text.includes('عندك '+entries.length+' تسجيل أكل')))fail('FALSE_PARTIAL_FOOD',note);
  if(key==='food-complete'&&!food?.complete)fail('FALSE_FOOD_COMPLETE',note);
  if(key==='protein'){
   const plan=(s.plans||[]).find(x=>x.id===s.active_plan_id),target=plan?.days.find(x=>x.date===date)?.targets||plan?.targets;
   if(!food?.complete||!Number.isFinite(food.protein)||!Number.isFinite(target?.protein)||!note.text.includes('النهاردة '+n(food.protein)+' جم')||!note.text.includes('خطتك '+n(target.protein)+' جم'))fail('FALSE_PROTEIN_FACT',note);
  }
  if(key==='weight-trend'||key==='weight-coverage'){
   const weights=(s.weights||[]).filter(x=>Number.isFinite(x.kg)&&x.date>=offset(date,-13)&&x.date<=date),older=weights.filter(x=>x.date<offset(date,-6)),newer=weights.filter(x=>x.date>=offset(date,-6));
   if(key==='weight-trend'&&(older.length<3||newer.length<3||!note.text.includes('الحالي '+n(newer.reduce((sum,x)=>sum+x.kg,0)/newer.length)+' كجم')||!note.text.includes('والسابق '+n(older.reduce((sum,x)=>sum+x.kg,0)/older.length))))fail('FALSE_WEIGHT_TREND',note);
   if(key==='weight-coverage'&&(!weights.length||older.length>=3&&newer.length>=3||!note.text.includes('عندك '+weights.length+' قياسات')))fail('FALSE_WEIGHT_COVERAGE',note);
  }
  if(['completed','partial','missed'].includes(key)&&session?.status!==key)fail('FALSE_SESSION_STATUS',note);
  if(key==='completed'&&Number.isFinite(session?.duration)&&!note.text.includes('في '+session.duration+' دقيقة'))fail('FALSE_SESSION_DURATION',note);
  if(key==='adjustment-active'){
   const a=s.sessionAdjustment;
   if(!a||Date.parse(a.expiresAt)<=now||a.planId&&a.planId!==p?.id||!(a.setFactor<1)||!p?.days.some(d=>d.exercises.some(e=>e.sets>1)))fail('FALSE_ACTIVE_ADJUSTMENT',note);
  }
  if(key==='fatigue-declined'&&!(s.adaptations||[]).some(a=>a.kind==='recovery'&&a.status==='rejected'&&a.setFactor===ready.setFactor&&Date.parse(a.expiresAt)>now&&(a.recoveryEvidenceAt?a.recoveryEvidenceAt===ready.asOf:Date.parse(a.at)>=Date.parse(ready.asOf))))fail('FALSE_REMEMBERED_DECLINE',note);
  if(key==='short-sleep'&&(!fresh||!(fresh.sleepHours<7)||!note.text.includes('سجلته '+fresh.sleepHours+' ساعات')))fail('FALSE_SHORT_SLEEP',note);
  if(key==='sleep'&&(!fresh||!Number.isFinite(fresh.sleepHours)||!note.text.includes('مسجل '+fresh.sleepHours+' ساعات')))fail('FALSE_SLEEP',note);
  if(key==='tired'&&(!fresh||!(fresh.fatigue>=4)||!note.text.includes('متابعة '+fresh.fatigue+' من')))fail('FALSE_FATIGUE',note);
  if(key==='return'){
   const previous=latest(activity.filter(x=>x.date<date));
   if(!previous||previous.date>=offset(date,-2)||!activity.some(x=>x.date===date)||!note.text.includes(previous.date))fail('FALSE_RETURN',note);
  }
  if(key==='activity'){
   const count=new Set(activity.filter(x=>x.date>=offset(date,-6)).map(x=>x.date)).size;
   if(!note.text.includes('في '+count+' أيام مختلفة'))fail('FALSE_ACTIVITY_COUNT',note);
  }
  if(key==='rest'&&(s.scheduledSessions||[]).some(x=>x.date===date))fail('FALSE_REST_DAY',note);
 }
 return failures;
}

function selfTest(){
 const date='2026-10-25',fixture={userId:'test-owner',date,behavior:{openedApp:true},state:{revision:2,foodEntries:[{date}],foodLogs:[]}},event={request:{simulation:false},response:{date,revision:2,generatedAt:date+'T12:00:00Z',notes:[{id:'brief-'+digest(JSON.stringify(['test-owner',date,'nutrition'])),role:'nutrition',key:'food-partial',text:'عندك 1 تسجيل أكل',action:'next',basedOnRevision:2,status:'GENERATED',deliveryStatus:'NOT_MEASURED',renderingStatus:'NOT_MEASURED'}]}};
 assert.deepEqual(inspect(fixture,event),[]);
 const controls=[['FALSE_PARTIAL_FOOD',b=>b.state.foodEntries=[]],['BRIEF_DATE',(b,e)=>e.response.date='2026-10-24'],['NOTE_IDENTITY',(b,e)=>e.response.notes[0].id='other'],['NOTE_REVISION',b=>b.state.revision=3],['FALSE_DELIVERY',(b,e)=>e.response.notes[0].renderingStatus='RENDERED'],['FALSE_SESSION_STATUS',(b,e)=>e.response.notes[0].key='completed'],['FALSE_ACTIVE_ADJUSTMENT',(b,e)=>e.response.notes[0].key='adjustment-active'],['FALSE_REMEMBERED_DECLINE',(b,e)=>e.response.notes[0].key='fatigue-declined'],['FALSE_RETURN',(b,e)=>e.response.notes[0].key='return'],['SAFETY_PRIORITY',b=>{b.state.workoutPlan={id:'p'};b.state.recovery={status:'stop'};}]];
 for(const [rule,mutate]of controls){const b=structuredClone(fixture),e=structuredClone(event);mutate(b,e);assert.ok(inspect(b,e).some(f=>f.rule===rule),rule);}
 console.log(JSON.stringify({validFixture:1,negativeControls:controls.length,passed:true}));
}

if(process.argv.includes('--self-test'))selfTest();
else{
 const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);if(fs.existsSync(output))throw Error('Preserve prior audit');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),config=JSON.parse(fs.readFileSync(path.join(root,'simulation_config.json'))),cohort=JSON.parse(fs.readFileSync(path.join(root,'cohort.json'))),failures=[],keys={},counts={days:0,briefViews:0,notes:0,absentDays:0},identityContent=new Map();
 for(const persona of cohort){const dir=path.join(root,'users',persona.userId,'days');if(!fs.existsSync(dir))continue;for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.json.gz'))){
  const b=JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,file))));counts.days++;if(!b.behavior.openedApp)counts.absentDays++;
  for(const event of b.records.filter(x=>x.request.method==='GET'&&x.request.endpoint==='coaching/brief'&&x.status===200)){
   counts.briefViews++;counts.notes+=event.response.notes.length;
   failures.push(...inspect(b,event).map(f=>({...f,userId:b.userId,day:b.day,eventId:event.eventId})));
   for(const note of event.response.notes){keys[note.key]=(keys[note.key]||0)+1;const identities=identityContent.get(b.userId)||[];identities.push({date:b.date,role:note.role,key:note.key,text:note.text,action:note.action});identityContent.set(b.userId,identities);}
  }
 }}
 const repetition=[...identityContent].map(([userId,messages])=>({userId,notes:messages.length,uniqueTexts:new Set(messages.map(m=>m.text)).size,uniqueTextActionPairs:new Set(messages.map(m=>JSON.stringify([m.text,m.action]))).size}));
 const result={scope:'FINITE_FACTUAL_CHECKS_OF_ACTUAL_BRIEF_HTTP_NOTES',run:root,sourceCommit:manifest.gitCommit,auditorSha256:digest(fs.readFileSync(new URL(import.meta.url))),auditedAt:new Date().toISOString(),runComplete:manifest.status==='complete'&&counts.days===config.users*config.days,passedFiniteChecks:failures.length===0,counts,keys,failures,repetition,limitations:['No assessment of clinical effectiveness, notification delivery/rendering, reading or human satisfaction.','Selected numerical, temporal, ownership, session and decision facts only; not exhaustive Arabic-language semantic verification.','Exact text and text/action pair uniqueness have different denominators and do not establish a natural human experience.','State-bearing responses and brief fetches are sequential in this harness; this is not a concurrent-reader proof.']};
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,runComplete:result.runComplete,passedFiniteChecks:result.passedFiniteChecks,counts,keys,failures:failures.slice(0,10)}));if(failures.length)process.exitCode=1;
}
