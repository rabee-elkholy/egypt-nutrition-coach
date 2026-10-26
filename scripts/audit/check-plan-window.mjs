import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: check-plan-window.mjs <completed-run> <new-verdict>');if(fs.existsSync(output))throw Error('Preserve previous verdict');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),cohort=JSON.parse(fs.readFileSync(path.join(root,'cohort.json'))),config=JSON.parse(fs.readFileSync(path.join(root,'simulation_config.json'))),gaps=[];if(manifest.status!=='complete')throw Error('Only audit completed runs');let nutritionDays=0;
for(const p of cohort)for(let day=1;day<=config.days;day++){
 const b=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'users',p.userId,'days',String(day).padStart(3,'0')+'.json.gz')))),s=b.state;
 if(!s.profile||s.onboarding?.serviceTrack==='workouts_only')continue;nutritionDays++;
 const plan=s.plans?.find(p=>p.id===s.active_plan_id);
 if(!plan?.days.some(d=>d.date===b.date))gaps.push({userId:p.userId,day,date:b.date,planId:plan?.id||null,renewalError:s.simulation?.renewalError||null});
}
const result={scope:'INDEPENDENT_ACTIVE_NUTRITION_DAY_WINDOW_CHECK',sourceCommit:manifest.gitCommit,nutritionDays,passed:gaps.length===0,gaps};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(gaps.length)process.exitCode=1;
