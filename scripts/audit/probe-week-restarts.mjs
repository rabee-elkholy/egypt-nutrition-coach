import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {makeWeek} from '../../planner-core.mjs';
import {library} from '../../server/food.mjs';
import {independentPlanIssues} from './scenario-http.mjs';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: probe-week-restarts.mjs <recorded-run> <new-output>');if(fs.existsSync(output))throw Error('Preserve earlier probe');
const b=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'users/user-089/days/043.json.gz')))),event=b.records.find(e=>e.request.body?.action==='simulation_next');
function word(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(16).padStart(8,'0');}
const text=event.requestHeaders['x-cohort-key']+':1',h=[0,1,2,3].map(i=>word(text+':'+i)).join(''),seed=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20),results=[];
for(const suffix of ['',':restart:1',':restart:2',':restart:3']){
 try{const plan=makeWeek(b.state.profile,b.state.preferences,library,b.date,seed+suffix);results.push({seed:seed+suffix,success:true,issues:independentPlanIssues(plan,library)});}
 catch(e){results.push({seed:seed+suffix,success:false,code:e.code,message:e.message});}
}
fs.writeFileSync(output,JSON.stringify({scope:'EXACT_RENEWAL_FAILURE_SEED_AND_UNCHANGED_INPUT_MULTI_START_PROBE',sourceRun:path.resolve(root),userId:b.userId,day:b.day,date:b.date,profile:b.state.profile,preferences:b.state.preferences,results,limitations:['Domain seed probe; not a new completed HTTP trajectory or proof that bounded search always finds a feasible week.']},null,2)+'\n');console.log(JSON.stringify({seed,results}));
