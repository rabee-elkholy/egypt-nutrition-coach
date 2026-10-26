// Paired solver replay of archived profile/preference/target/seed inputs.
// This is not another longitudinal HTTP run or a rewritten historical result.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {makeWeek} from '../../planner-core.mjs';
import {library} from '../../server/food.mjs';
import {independentPlanIssues} from './scenario-http.mjs';
import {sourceProvenance,sha256} from './evidence.mjs';

const [root,output,baselineRef]=process.argv.slice(2);
if(!root||!output||!baselineRef)throw Error('Usage: quality-plan-replay.mjs <completed-run> <new-output-directory> <baseline-git-ref>');
if(fs.existsSync(output))throw Error('Preserve previous evidence');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
if(read('manifest.json').status!=='complete')throw Error('Completed archive required');
fs.mkdirSync(output,{recursive:true});
const oldSource=execFileSync('git',['show',baselineRef+':planner-core.mjs'],{encoding:'utf8'});
const relocated=oldSource.replace(/from\s*(['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+q+pathToFileURL(path.resolve(p)).href+q);
const oldPath=path.resolve(output,'baseline-planner.mjs');fs.writeFileSync(oldPath,relocated);
const oldMakeWeek=(await import(pathToFileURL(oldPath).href)).makeWeek;
const rows=[],failures=[],config=read('simulation_config.json');let sourceDays=0;
function measure(make,p){
 try{
  const plan=make(p.profile,p.preferences,library,p.start_date,p.id.slice(5),p.targets.energy);
  const issues=independentPlanIssues(plan,library);
  return {supported:true,issues,days:plan.days.length,proteinGapDays:plan.days.filter(d=>Number(d.summary.values.protein)<d.targets.protein*.85).length,energyGapDays:plan.days.filter(d=>Math.abs(Number(d.summary.values.energy)-d.targets.energy)>d.targets.energy*.12).length};
 }catch(e){return {supported:false,error:e.code||e.message};}
}
for(const user of read('cohort.json')){
 const seen=new Set();
 for(let day=1;day<=config.days;day++){
  const b=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'users',user.userId,'days',String(day).padStart(3,'0')+'.json.gz'))));sourceDays++;
  for(const p of b.state.plans||[]){
   if(seen.has(p.id))continue;seen.add(p.id);
   const before=measure(oldMakeWeek,p),after=measure(makeWeek,p);
   const row={userId:user.userId,planId:p.id,inputSha256:sha256(JSON.stringify({profile:p.profile,preferences:p.preferences,start:p.start_date,energy:p.targets.energy})),before,after};rows.push(row);
   if(before.supported&&!after.supported)failures.push({userId:user.userId,planId:p.id,code:'SUPPORT_REGRESSION'});
   if(after.supported&&after.issues.length)failures.push({userId:user.userId,planId:p.id,code:'INDEPENDENT_PLAN_INVALID',issues:after.issues});
   if(before.supported&&after.supported&&(after.proteinGapDays>before.proteinGapDays||after.energyGapDays>before.energyGapDays))failures.push({userId:user.userId,planId:p.id,code:'STRICT_QUALITY_REGRESSION'});
  }
 }
 console.log(JSON.stringify({user:user.userId,plans:rows.length,failures:failures.length}));
}
const totals=side=>rows.reduce((a,r)=>{const v=r[side];a.supported+=Number(v.supported);a.rejected+=Number(!v.supported);for(const k of ['days','proteinGapDays','energyGapDays'])a[k]+=v[k]||0;return a;},{supported:0,rejected:0,days:0,proteinGapDays:0,energyGapDays:0});
const result={scope:'PAIRED_SOLVER_REPLAY_NOT_LONGITUDINAL_HTTP',baselineRef,baselineSourceSha256:sha256(oldSource),provenance:sourceProvenance(),sourceDays,plans:rows.length,before:totals('before'),after:totals('after'),passed:!failures.length,failures,rows,limitations:['Replays stored solver inputs at stored energy, including derived snapshots; does not reproduce the original adaptation or user trajectory.','Baseline planner imports current shared dependencies; only planner-core.mjs differs in this comparison.','Strict 85% / +/-12% metrics remain distinct from implemented acceptance bounds.']};
fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,plans:result.plans,before:result.before,after:result.after,failures}));
if(!result.passed)process.exitCode=1;
