import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import path from 'node:path';
import {localRuntime} from '../cohort/runtime.mjs';
const root=path.resolve(process.argv[2]),{mf,db}=await localRuntime(root),failures=[];let users=0,records=0,plans=0;
const canonical=x=>x&&typeof x==='object'?Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const prescription=p=>{const c=structuredClone(p);for(const d of c.days||[])for(const e of d.exercises||[]){delete e.suggestedKg;delete e.progressionReason;delete e.suggestionAt;}return c;};
try{
 for(const persona of JSON.parse(readFileSync(path.join(root,'cohort.json')))){
  const dir=path.join(root,'users',persona.userId,'days'),files=readdirSync(dir).filter(f=>f.endsWith('.json.gz')).sort(),nutrition=new Map(),workouts=new Map();let last;
  for(const file of files){const b=JSON.parse(gunzipSync(readFileSync(path.join(dir,file))));last=b;for(const r of b.records)if(r.response.profile){for(const p of r.response.plans||[])if(!nutrition.has(p.id))nutrition.set(p.id,hash(p));if(r.response.workoutPlan){const p=r.response.workoutPlan;if(!workouts.has(p.id))workouts.set(p.id,hash(prescription(p)));}}}
  if(!last?.state.profile)continue;users++;
  const owner='__simulation__:'+createHash('sha256').update(persona.userId).digest('hex'),row=await db.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(owner).first();
  if(row?.revision!==last.state.revision)failures.push(persona.userId+':revision');
  for(const [field,table,key,deleted]of [['foodEntries','coaching_food_entries','id',true],['waterLogs','coaching_water_logs','date'],['weights','coaching_weight_logs','date'],['workoutLogs','coaching_workout_logs','id',true],['sessions','coaching_sessions','id'],['checkins','coaching_checkins','date'],['coachingCases','coaching_cases','id'],['coachingFeedback','coaching_feedback','id']]){
   const rows=(await db.prepare(`SELECT body FROM ${table} WHERE user_id=?${deleted?' AND deleted=0':''}`).bind(owner).all()).results.map(r=>JSON.parse(r.body));records+=rows.length;
   const ordered=a=>a.toSorted((x,y)=>String(x[key]).localeCompare(String(y[key])));
   if(hash(ordered(rows))!==hash(ordered(last.state[field]||[])))failures.push(persona.userId+':'+field);
  }
  for(const [expected,table,workout]of [[nutrition,'coaching_plans',false],[workouts,'coaching_workout_plans',true]])for(const [id,digest]of expected){plans++;const r=await db.prepare(`SELECT body FROM ${table} WHERE user_id=? AND plan_id=?`).bind(owner,id).first();if(!r||hash(workout?prescription(JSON.parse(r.body)):JSON.parse(r.body))!==digest)failures.push(persona.userId+':plan:'+id);}
 }
}finally{await mf.dispose();}
const result={passed:failures.length===0,users,records,plans,failures,scope:'Owner-scoped normalized rows and immutable nutrition/workout prescriptions vs original HTTP responses. Three transient workout suggestion fields excluded explicitly.'};writeFileSync(path.join(root,'persistence-verification.json'),JSON.stringify(result,null,2));console.log(result);if(failures.length)process.exitCode=1;
