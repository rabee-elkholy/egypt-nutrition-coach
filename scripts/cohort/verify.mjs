import {readFileSync,existsSync,writeFileSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {args,read,lines,json,hash,inventory} from './common.mjs';
import {loadDay} from './report.mjs';
import {messages} from './messages.mjs';
import {personas} from './personas.mjs';
export async function verify(root){
 const config=read(path.join(root,'simulation_config.json')),cohort=read(path.join(root,'cohort.json')),manifest=read(path.join(root,'manifest.json')),failures=[],checks={};
 const check=(key,ok,evidence=null)=>{checks[key]={passed:!!ok,evidence};if(!ok)failures.push(key);};
 check('unique_user_ids',new Set(cohort.map(x=>x.userId)).size===config.users);
 check('unique_profiles',new Set(cohort.map(x=>hash(x.onboarding))).size===config.users);
 check('preregistered_cohort',hash(personas(config.seed,config.users))===hash(cohort));
 check('holdout_preassigned',cohort.filter(x=>x.split==='holdout').length===Math.round(config.users*.2));
 let dayCount=0,eventCount=0,messageCount=0,foodMissing=0;const engineSame=Object.entries(manifest.engineHashes).every(([p,h])=>existsSync(p)&&hash(readFileSync(p))===h);check('engine_files_unchanged',engineSame);
 for(const p of cohort){let count=0,lastDay=0,previousRevision=0;const eventIds=new Set();
  for(let n=1;n<=config.days;n++){
   const file=path.join(root,'users',p.userId,'days',String(n).padStart(3,'0')+'.json.gz');if(!existsSync(file))continue;const b=loadDay(file);count++;dayCount++;
   if(b.day!==n||b.userId!==p.userId||n!==lastDay+1)failures.push('day_identity_or_gap:'+p.userId+':'+n);lastDay=n;
   if(b.revisionBefore!==previousRevision)failures.push('revision_discontinuity:'+p.userId+':'+n);previousRevision=b.revisionAfter;
   for(const e of b.records){eventCount++;if(eventIds.has(e.eventId))failures.push('duplicate_event:'+e.eventId);eventIds.add(e.eventId);
    if(hash(e.response)!==e.responseHash)failures.push('response_hash:'+e.eventId);
    if(e.request.body?.action==='simulation_fill')failures.push('forbidden_fill:'+e.eventId);
    if(e.request.body?.payload&&Object.keys(e.request.body.payload).some(k=>['trueWeight','motivation','truth','actualMeals','groundTruth'].includes(k)))failures.push('ground_truth_leak:'+e.eventId);
    if(e.request.body?.payload?.date&&e.request.body.payload.date>b.date)failures.push('future_payload:'+e.eventId);
    if(e.response.profile&&e.response.profile.name!==p.onboarding.name)failures.push('cross_account:'+e.eventId);
   }
   const sourceMessages=new Map(b.records.filter(x=>x.response.profile).map(rec=>[rec.eventId,new Map(messages(rec.response,{userId:p.userId,day:n,date:rec.response.serverDate,engineStateRevision:rec.response.revision,openedApp:b.behavior.openedApp,eventId:rec.eventId}).map(m=>[m.messageId,m.exactText]))]));
   for(const m of b.messages){messageCount++;if(sourceMessages.get(m.eventId)?.get(m.messageId)!==m.exactText)failures.push('message_source:'+m.messageId);if(m.wasActuallyRendered)failures.push('unverified_raw_render_claim:'+m.messageId);}
   const last=b.records.at(-1);if(b.state.profile&&!(last.request.method==='GET'&&last.request.endpoint==='state'&&last.status===200&&hash(last.response)===hash(b.state)))failures.push('reload_snapshot:'+p.userId+':'+n);
   if(!b.state.foodEntries?.some(x=>x.date===b.date))foodMissing++;
  }
  check('days:'+p.userId,count===config.days,{actual:count,expected:config.days});
 }
 check('total_days',dayCount===config.users*config.days,{actual:dayCount,expected:config.users*config.days});
 check('derived_daily_count',lines(path.join(root,'all_days.jsonl')).length===dayCount);
 const inventoryFailures=[];for(const f of manifest.files||[]){const file=path.join(root,f.path);if(!existsSync(file)||hash(readFileSync(file))!==f.sha256)inventoryFailures.push(f.path);}check('file_sha256',inventoryFailures.length===0,{mismatches:inventoryFailures});
 const result={passed:failures.length===0,checkedAt:new Date().toISOString(),counts:{users:cohort.length,days:dayCount,events:eventCount,messages:messageCount,foodMissingDays:foodMissing},checks,failures,limitations:['Source checking establishes provenance, not clinical correctness','No ground-truth payload fields passed; this is a structural boundary audit, not a formal information-flow proof','Raw generated messages always start rendered=false; independent DOM checks may promote exact sampled messages in derived reports']};
 json(path.join(root,'verification.json'),result);console.log(JSON.stringify({verification:result.passed,counts:result.counts,failures:failures.slice(0,20)}));return result;
}
if(process.argv[1]?.endsWith('verify.mjs')){const result=await verify(path.resolve(String(args().output||'reports/simulation-100-users-90-days/baseline-v1')));if(!result.passed)process.exitCode=1;}
