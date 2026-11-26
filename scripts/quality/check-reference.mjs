import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {gunzipSync,gzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const dir=mkdtempSync(join(tmpdir(),'coaching-reference-'));
try{
 const baseline=join(dir,'before.json'),after=join(dir,'after.json'),gzPath=join(root,'docs/regional-foods/reference-after.json.gz');
 if(process.argv.includes('--update')){execFileSync(process.execPath,['scripts/quality/behavior-reference.mjs',after],{cwd:root,stdio:'inherit'});writeFileSync(gzPath,gzipSync(readFileSync(after)));console.log('Updated baseline: docs/regional-foods/reference-after.json.gz');}
 else{writeFileSync(baseline,gunzipSync(readFileSync(gzPath)));execFileSync(process.execPath,['scripts/quality/behavior-reference.mjs',after,baseline],{cwd:root,stdio:'inherit'});}
}finally{rmSync(dir,{recursive:true,force:true});}
