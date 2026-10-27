import {Miniflare} from 'miniflare';
import {migrateLocal} from './local-migrations.mjs';
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],d1Persist:'.wrangler/local-d1',assets:{directory:'dist/client',binding:'ASSETS',routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true}},port:8787,host:'127.0.0.1'});
const db=await mf.getD1Database('DB');
await migrateLocal(db);
console.log('Local QA:',String(await mf.ready),'(API requires test identity header; production uses the canonical Cloudflare cookie/Bearer gateway)');
