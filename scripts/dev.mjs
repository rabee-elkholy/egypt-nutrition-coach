import {Miniflare} from 'miniflare';
import {migrateLocal} from './local-migrations.mjs';
const jwtSecret=process.env.AUTH_JWT_SECRET||'local-dev-only-jwt-secret-change-in-production-32chars';
const mf=new Miniflare({
 modules:true,
 scriptPath:'dist/server/cloudflare.js',
 compatibilityDate:'2025-10-11',
 compatibilityFlags:['nodejs_als'],
 d1Databases:['DB'],
 d1Persist:'.wrangler/local-d1',
 bindings:{
  AUTH_JWT_SECRET:jwtSecret,
  AUTH_ISSUER:process.env.AUTH_ISSUER||'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE:process.env.AUTH_AUDIENCE||'egypt-nutrition-coach-kmm'
 },
 assets:{directory:'dist/client',binding:'ASSETS',routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true}},
 port:8787,
 host:'127.0.0.1'
});
const db=await mf.getD1Database('DB');
await migrateLocal(db);
console.log('Local Cloudflare Worker + D1 API ready at:',String(await mf.ready));
console.log('Auth endpoints enabled: POST /v1/auth/register, /v1/auth/login, /v1/auth/refresh, /v1/auth/logout');
