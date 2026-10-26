import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: rejection-census.mjs <run> <new-verdict>');if(fs.existsSync(output))throw Error('Preserve previous census');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),cohort=JSON.parse(fs.readFileSync(path.join(root,'cohort.json'))),groups=new Map(),onboarding=[];let days=0,events=0;
for(const persona of cohort){
 const dir=path.join(root,'users',persona.userId),initial=path.join(dir,'onboarding.json');
 if(fs.existsSync(initial)){const r=JSON.parse(fs.readFileSync(initial));onboarding.push({userId:persona.userId,status:r.status});}
 const dayDir=path.join(dir,'days');if(!fs.existsSync(dayDir))continue;
 // Only atomically committed gzip bundles; never reads an active journal/database.
 for(const file of fs.readdirSync(dayDir).filter(f=>/^\d+\.json\.gz$/.test(f))){
  const b=JSON.parse(gunzipSync(fs.readFileSync(path.join(dayDir,file))));days++;
  for(const e of b.records){events++;if(e.status<400)continue;
   const value={action:e.request.body?.action||e.request.endpoint,status:e.status,code:e.response.code||null,stage:e.response.fieldErrors?.[0]?.code||null,message:e.response.message||e.response.error||null,expectedOutcome:e.expectedOutcome||null,classification:e.classification||null};
   const key=JSON.stringify(value),g=groups.get(key)||{...value,count:0,examples:[]};g.count++;if(g.examples.length<3)g.examples.push({userId:persona.userId,day:b.day,eventId:e.eventId});groups.set(key,g);
  }
 }
}
const result={scope:manifest.status==='complete'?'COMPLETE_COMMITTED_DAY_REJECTION_CENSUS':'PARTIAL_COMMITTED_DAY_REJECTION_CENSUS_NOT_ACCEPTANCE',sourceCommit:manifest.gitCommit,runStatus:manifest.status,scannedAt:new Date().toISOString(),days,events,onboarding:{observed:onboarding.length,supported:onboarding.filter(u=>u.status===200).length,rejected:onboarding.filter(u=>u.status!==200)},rejections:[...groups.values()].sort((a,b)=>b.count-a.count),limitations:['Request classifications are retained observations, not independent proof that a rejection is correct.','An incomplete run census is a diagnostic checkpoint only.']};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
