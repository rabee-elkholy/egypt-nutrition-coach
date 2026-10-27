import {Miniflare,Log,LogLevel} from 'miniflare';
import {build} from 'esbuild';
import {migrateLocal} from '../local-migrations.mjs';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
export async function localRuntime(root){
 mkdirSync(path.join(root,'.runtime'),{recursive:true});
 const scriptPath=path.resolve(root,'.runtime/worker.js');
 await build({entryPoints:['scripts/cohort/local-worker.mjs'],outfile:scriptPath,bundle:true,format:'esm',platform:'browser',external:['node:async_hooks'],target:'es2022',minify:true});
 const mf=new Miniflare({modules:true,modulesRoot:path.dirname(scriptPath),scriptPath,compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],d1Persist:path.resolve(root,'.local-d1'),log:new Log(LogLevel.ERROR),bindings:{RATE_LIMIT_PER_MINUTE:'100000'}});
 const db=await mf.getD1Database('DB');await migrateLocal(db);
 return {mf,db};
}
