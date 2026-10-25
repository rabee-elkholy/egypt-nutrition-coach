// Summarise actions/statuses exercised in a cohort run directory (reads day bundles).
import {readdirSync,existsSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
const root=process.argv[2];const counts={},status={};
for(const u of readdirSync(path.join(root,'users'))){const d=path.join(root,'users',u,'days');if(!existsSync(d))continue;
 for(const f of readdirSync(d).filter(x=>x.endsWith('.json.gz'))){const b=JSON.parse(gunzipSync(readFileSync(path.join(d,f))));
  for(const r of b.records){const k=r.request.method+' '+(r.request.body?.action||r.request.endpoint.split('?')[0]);counts[k]=(counts[k]||0)+1;const s=k+' '+r.status;status[s]=(status[s]||0)+1;}}}
console.log(JSON.stringify({counts,status},null,1));
