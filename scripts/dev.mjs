import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',d1Databases:['DB'],d1Persist:'.wrangler/local-d1',assets:{directory:'dist/client',binding:'ASSETS',routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true}},port:8787,host:'127.0.0.1'});
const db=await mf.getD1Database('DB');
const exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='coaching_accounts'").first();
if(!exists)for(const sql of (await readFile('drizzle/0000_purple_solo.sql','utf8')).split('--> statement-breakpoint'))await db.prepare(sql.trim()).run();
console.log('Local QA:',String(await mf.ready),'(API requires test identity header; production uses Sites identity)');
