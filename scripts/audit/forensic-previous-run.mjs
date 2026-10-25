// Phase-1 forensic re-computation of the previous "fast" simulation artifacts.
// Reads raw JSONL only; never trusts the narrative reports. Usage:
//   node scripts/audit/forensic-previous-run.mjs --run=reports/simulation-100-users-90-days/run-1792840358320
import {readFileSync,existsSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const arg=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const run=arg.run||'reports/simulation-100-users-90-days/run-1792840358320';
const jl=p=>existsSync(p)?readFileSync(p,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
const out={run,source:'raw JSONL in run directory',claims:{},recomputed:{}};
const m=JSON.parse(readFileSync(path.join(run,'manifest.json'),'utf8'));
out.claims={gitCommitInManifest:m.gitCommit,qualityScore:m.averageQualityScore,safety:m.safetyGatesStatus,stress:m.stressTestsPassed,commands:m.totalCommandsExecuted,errors:m.totalErrors};

const users=readdirSync(path.join(run,'users'));
let events=0,failed=0,replaceFail=0,replaceTotal=0,replaceOk=0;const failByAction={},failMsg={};
let perUserRep=[],pooled=new Map(),pooledN=0,rendered=0,messages=0,renderedWithoutOpen=0;
let workoutRecords=0,sessionsCompleted=0,sessionsPartial=0,sessionsMissed=0,setsLogged=0,exerciseLogs=0;
let planSnapshotUsers=[];
for(const u of users){
 const dir=path.join(run,'users',u);
 const ev=jl(path.join(dir,'api_events.jsonl'));
 for(const e of ev){events++;const ok=e.status==='success';if(!ok){failed++;failByAction[e.action]=(failByAction[e.action]||0)+1;}
  if(e.action==='replace_meal'){replaceTotal++;ok?replaceOk++:replaceFail++;}}
 for(const er of jl(path.join(dir,'errors.jsonl'))){const k=er.action+': '+String(er.error||'').slice(0,90)+' | payloadKeys='+Object.keys(er.payload||{}).join(',');failMsg[k]=(failMsg[k]||0)+1;}
 const msgs=jl(path.join(dir,'messages.jsonl'));messages+=msgs.length;
 const texts=msgs.map(x=>x.exactText);perUserRep.push(texts.length?1-new Set(texts).size/texts.length:null);
 for(const t of texts){pooled.set(t,(pooled.get(t)||0)+1);pooledN++;}
 rendered+=msgs.filter(x=>x.wasActuallyRendered).length;
 const wh=jl(path.join(dir,'workout_history.jsonl'));workoutRecords+=wh.length;
 for(const w of wh){if(w.type==='session'||w.status){if(w.status==='completed')sessionsCompleted++;if(w.status==='partial')sessionsPartial++;if(w.status==='missed')sessionsMissed++;}
  const sets=w.sets?.sets||w.sets;if(Array.isArray(sets)){exerciseLogs++;setsLogged+=sets.length;}}
 const st=jl(path.join(dir,'daily_app_state.jsonl'));
 for(const s of st)for(const x of s.sessionsDone||[]){const k=typeof x==='string'?x:x.status;if(k==='completed')sessionsCompleted++;else if(k==='partial')sessionsPartial++;else if(k==='missed')sessionsMissed++;}
 const activeIds=new Set(st.map(s=>s.activePlanId||s.active_plan_id||s.nutritionPlanId).filter(Boolean));
 const snaps=jl(path.join(dir,'nutrition_plans.jsonl'));
 const snapIds=new Set(snaps.map(s=>s.plan?.id||s.planId||s.id).filter(Boolean));
 planSnapshotUsers.push({user:u,distinctActivePlanIds:activeIds.size,snapshots:snaps.length,missing:[...activeIds].filter(x=>!snapIds.has(x)).length});
}
const rep=perUserRep.filter(x=>x!=null);
out.recomputed={
 users:users.length,events,failed,failByAction,topFailureMessages:Object.entries(failMsg).sort((a,b)=>b[1]-a[1]).slice(0,10),
 replaceMeal:{total:replaceTotal,ok:replaceOk,failed:replaceFail},
 messages:{total:messages,claimedRendered:rendered,perUserRepetitionMean:rep.reduce((a,b)=>a+b,0)/rep.length,pooledRepetition:1-pooled.size/pooledN,definitionNote:'repetition = 1 - unique/total exact texts'},
 workout:{workoutHistoryRecords:workoutRecords,exerciseLogs,setsLogged,sessionsCompleted,sessionsPartial,sessionsMissed},
 planHistory:{usersWithMissingSnapshots:planSnapshotUsers.filter(x=>x.missing>0).length,worst:planSnapshotUsers.sort((a,b)=>b.missing-a.missing).slice(0,3)}
};
const target=arg.out||path.join('reports','audit','previous-run-forensics.json');
writeFileSync(target,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
