import path from 'node:path';
import {existsSync,readdirSync} from 'node:fs';
import {args,read,hash,json,lines} from './common.mjs';
import {loadDay} from './report.mjs';
export function compare(left,right){
 const differences=[],compared=[],missing=[];
 for(const user of readdirSync(path.join(right,'users'))){const rd=path.join(right,'users',user,'days'),ld=path.join(left,'users',user,'days');if(!existsSync(rd))continue;for(const name of readdirSync(rd).filter(x=>x.endsWith('.json.gz'))){if(!existsSync(path.join(ld,name))){missing.push(user+'/'+name);continue;}const a=loadDay(path.join(ld,name)),b=loadDay(path.join(rd,name));
  const logical=x=>({truth:x.truth,behavior:x.behavior,decisions:x.decisions,messages:x.messages,state:x.state,records:x.records.map(r=>({eventId:r.eventId,request:r.request,status:r.status,response:r.response}))});
  compared.push(user+'/'+name);if(hash(logical(a))!==hash(logical(b)))differences.push({user,file:name,stateEqual:hash(a.state)===hash(b.state),truthEqual:hash(a.truth)===hash(b.truth),responsesEqual:hash(a.records.map(r=>r.response))===hash(b.records.map(r=>r.response))});
 }}
 const result={passed:differences.length===0&&compared.length>0&&missing.length===0,comparedDays:compared.length,differences,missing,left,right,excluded:'Measured latency, response size diagnostics and run timestamps. Original logical responses otherwise compared exactly.'};json(path.join(right,'comparison.json'),result);console.log(JSON.stringify(result));return result;
}
if(process.argv[1]?.endsWith('compare.mjs')){const a=args();if(!compare(path.resolve(String(a.left)),path.resolve(String(a.right))).passed)process.exitCode=1;}
