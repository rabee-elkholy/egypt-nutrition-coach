// Logical export of the isolated completed cohort D1. Never opens a remote database.
import {Miniflare,Log,LogLevel} from 'miniflare';
import {createHash} from 'node:crypto';
import {createWriteStream,readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.argv[2]||'');
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'))),cohort=JSON.parse(readFileSync(path.join(root,'cohort.json')));
if(manifest.status!=='complete')throw Error('Only export a completed isolated run');
const output=path.join(root,'database');
if(existsSync(output))throw Error('Preserve existing database evidence');
mkdirSync(output);
const mf=new Miniflare({modules:true,scriptPath:path.join(root,'.runtime/worker.js'),compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],d1Persist:path.join(root,'.local-d1'),log:new Log(LogLevel.ERROR)});
try{
 const db=await mf.getD1Database('DB');
 const schema=(await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name LIKE 'coaching_%' OR name LIKE 'idx_%' OR name='local_schema_migrations' ORDER BY type,name").all()).results;
 const migrations=(await db.prepare('SELECT name FROM local_schema_migrations ORDER BY name').all()).results;
 writeFileSync(path.join(output,'schema.jsonl'),JSON.stringify({schema,migrations})+'\n');
 const identities=cohort.flatMap(p=>[p.userId,'__simulation__:'+createHash('sha256').update(p.userId).digest('hex')]);
 const tables=schema.filter(s=>s.type==='table'&&s.name.startsWith('coaching_')).map(s=>s.name),files=[];
 for(const table of tables){
  if(!/^coaching_[a-z_]+$/.test(table))throw Error('Unexpected table identifier');
  const destination=path.join(output,table+'.jsonl.gz'),stream=createWriteStream(destination),gzip=createGzip({level:6}),finished=once(stream,'finish');gzip.pipe(stream);let rows=0;
  for(const identity of identities){
   const result=await db.prepare('SELECT * FROM "'+table+'" WHERE user_id=?').bind(identity).all();
   for(const row of result.results){rows++;if(!gzip.write(JSON.stringify(row)+'\n'))await once(gzip,'drain');}
  }
  gzip.end();await finished;
  const total=(await db.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').first()).n;
  assert.equal(rows,total,'Export omitted rows or encountered an unexpected namespace: '+table);
  files.push({path:table+'.jsonl.gz',rows,sha256:createHash('sha256').update(readFileSync(destination)).digest('hex')});
 }
 const proof={scope:'COMPLETE_LOCAL_COHORT_LOGICAL_D1_EXPORT',sourceCommit:manifest.gitCommit,sourceManifestSha256:createHash('sha256').update(readFileSync(path.join(root,'manifest.json'))).digest('hex'),exportedAt:new Date().toISOString(),files,
  queryTemplate:'SELECT * FROM <validated coaching table> WHERE user_id=?; all preregistered real/simulation identities; exported row totals equal actual table totals',
  limitations:['Synthetic local database only; not a production backup.','JSON body strings and numeric/null SQLite values are preserved; no live data or external credentials used.']};
 writeFileSync(path.join(output,'export_manifest.jsonl'),JSON.stringify(proof)+'\n');
 console.log(JSON.stringify({directory:output,tables:files.length,rows:files.reduce((n,f)=>n+f.rows,0),counts:Object.fromEntries(files.map(f=>[f.path,f.rows]))}));
}finally{await mf.dispose();}
