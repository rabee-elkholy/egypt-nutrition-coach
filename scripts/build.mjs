import {build} from 'esbuild';
import {mkdir,rm,cp,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['server/worker.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',external:['node:async_hooks'],target:'es2022',minify:true});
await build({entryPoints:['server/cloudflare-entry.mjs'],outfile:'dist/server/cloudflare.js',bundle:true,format:'esm',platform:'browser',external:['node:async_hooks'],target:'es2022',minify:true});
await cp('drizzle','dist/drizzle',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'curafit-api',main:'index.js',compatibility_date:'2025-10-11',compatibility_flags:['nodejs_als'],d1_databases:[{binding:'DB',database_name:'coaching',database_id:'local',migrations_dir:'../drizzle'}]}));
console.log('Built CuraFit KMM API Worker and schema migrations.');
