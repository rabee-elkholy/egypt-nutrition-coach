// Layer-separated local measurements. Correctness checks precede every timing conclusion.
import {Miniflare,Log,LogLevel} from 'miniflare';
import {migrateLocal} from '../local-migrations.mjs';
import {searchFoodCatalog} from '../../server/food-catalog.mjs';
import {writeFileSync,existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {cpus,totalmem} from 'node:os';

const socket=process.argv.includes('--socket'),httpLayer=socket?'LOCAL_LOOPBACK_HTTP_WITH_D1':'LOCAL_MINIFLARE_DISPATCH_WITH_D1';
const label=process.argv.find(a=>a.startsWith('--label='))?.slice(8);
if(label&&!/^[a-z0-9-]+$/.test(label))throw Error('Invalid benchmark label');
const output='docs/production-readiness/evidence/'+(label?label+'-benchmark-results.json':socket?'socket-benchmark-results.json':'local-benchmark-results.json');
if(existsSync(output))throw Error('Preserve existing benchmark evidence');
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],bindings:{RATE_LIMIT_PER_MINUTE:'100000'},host:'127.0.0.1',port:0,log:new Log(LogLevel.ERROR)});
const socketUrl=socket?await mf.ready:null;
const base={name:'Local benchmark synthetic',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dailyActivity:'light',dietType:'balanced',region:'egypt',budget:'medium',mealsCount:4,selectedWorkoutDays:[1,3,5],weekdayConvention:'js_sunday_0',workoutLocation:'gym_only',fitnessLevel:'beginner',sessionDuration:45,healthConfirmed:true};
const cases=[],events=[];let seq=0;
const percentile=(values,p)=>values[Math.max(0,Math.ceil(values.length*p)-1)]??null;
function summarize(name,layer,start,records,concurrency){const latencies=records.map(x=>x.latencyMs).sort((a,b)=>a-b),bytes=records.map(x=>x.responseBytes).filter(Number.isFinite).sort((a,b)=>a-b),durationMs=performance.now()-start;return {name,layer,concurrency,samples:records.length,durationMs,throughputPerSecond:records.length/(durationMs/1000),statusCounts:records.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{}),p50Ms:percentile(latencies,.5),p95Ms:percentile(latencies,.95),p99Ms:percentile(latencies,.99),responseBytes:{samples:bytes.length,p50:percentile(bytes,.5),p95:percentile(bytes,.95),max:bytes.at(-1)??null}};}
async function request(user,endpoint,body=null){const id=++seq,start=performance.now(),options={method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,'Content-Type':'application/json','Idempotency-Key':'bench-validated-'+id},...(body?{body:JSON.stringify(body)}:{})},response=socket?await fetch(new URL('/v1/'+endpoint,socketUrl),options):await mf.dispatchFetch('http://benchmark.local/v1/'+endpoint,options);const value=await response.json();const event={id,user,endpoint,action:body?.action||null,requestRevision:body?.revision??null,status:response.status,code:value.error?.code||value.code||null,responseRevision:value.revision??null,latencyMs:performance.now()-start,responseBytes:Buffer.byteLength(JSON.stringify(value))};events.push(event);return {event,value};}
async function scenario(name,layer,n,concurrency,fn,expected=[200]){const start=performance.now(),records=[];let next=0;await Promise.all(Array.from({length:concurrency},async()=>{while(next<n){const i=next++,result=await fn(i);assert.ok(expected.includes(result.event.status),JSON.stringify(result));records.push(result.event);}}));const result=summarize(name,layer,start,records,concurrency);cases.push(result);return result;}
try{
 const db=await mf.getD1Database('DB');await migrateLocal(db);
 let version;
 try{version=await db.prepare('SELECT sqlite_version() AS version').first();}
 catch(error){version={version:null,unavailableReason:error.message};}
 const oldPayload={name:'Bench',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],mealsCount:4};
 const legacyControl=await request('legacy-benchmark-control','commands',{revision:0,action:'generate',payload:oldPayload});
 const generated=await request('validated-benchmark','commands',{revision:0,action:'generate',payload:base});assert.equal(generated.event.status,200,JSON.stringify(generated.value));let revision=generated.value.revision;
 await scenario('catalog search','DOMAIN_IN_PROCESS',100,1,async i=>{const start=performance.now();searchFoodCatalog({q:['فول','كشري','شاي بسكر'][i%3],limit:20});return {event:{status:200,latencyMs:performance.now()-start}};});
 await scenario('SELECT account revision','LOCAL_D1_BINDING',100,1,async()=>{const start=performance.now(),row=await db.prepare('SELECT revision FROM coaching_accounts WHERE user_id=?').bind('validated-benchmark').first();assert.equal(row.revision,revision);return {event:{status:200,latencyMs:performance.now()-start}};});
 await scenario('sequential bootstrap',httpLayer,100,1,()=>request('validated-benchmark','bootstrap'));
 await scenario('concurrent bootstrap',httpLayer,100,10,()=>request('validated-benchmark','bootstrap'));
 await scenario('sequential receipt writes',httpLayer,50,1,async i=>{const r=await request('validated-benchmark','commands?view=receipt',{revision,action:'water',payload:{cups:i%12+1}});if(r.event.status===200)revision=r.value.revision;return r;});
 const race=await scenario('same-revision write contention',httpLayer,10,10,()=>request('validated-benchmark','commands?view=receipt',{revision,action:'water',payload:{cups:7}}),[200,409]);assert.equal(race.statusCounts[200],1);assert.equal(race.statusCounts[409],9);
 revision=(await request('validated-benchmark','bootstrap')).value.revision;
 await scenario('rebased conflict recovery with new keys',httpLayer,9,1,async()=>{const r=await request('validated-benchmark','commands?view=receipt',{revision,action:'water',payload:{cups:7}});if(r.event.status===200)revision=r.value.revision;return r;});
 for(let i=0;i<5;i++){const r=await request('mixed-'+i,'commands',{revision:0,action:'generate',payload:base});assert.equal(r.event.status,200);}
 await scenario('mixed five reads and five independent writes',httpLayer,10,10,i=>i<5?request('validated-benchmark','bootstrap'):request('mixed-'+(i-5),'commands?view=receipt',{revision:1,action:'water',payload:{cups:4}}));
 let sampleBriefResponse=null;
 if(process.argv.includes('--brief')||label==='coaching-brief'){
  let r=await request('validated-benchmark','commands',{revision,action:'recovery',payload:{sleepHours:4,sleepQuality:1,fatigue:5,stress:5,soreness:8,pain:false,illness:false,redFlags:false}});assert.equal(r.event.status,200);revision=r.value.revision;
  r=await request('validated-benchmark','commands',{revision,action:'review',payload:{}});assert.equal(r.event.status,200);revision=r.value.revision;
  sampleBriefResponse=(await request('validated-benchmark','coaching/brief')).value;assert.equal(sampleBriefResponse.notes.length,3);
  await scenario('sequential coaching brief',httpLayer,100,1,()=>request('validated-benchmark','coaching/brief'));
  await scenario('concurrent coaching brief',httpLayer,100,10,()=>request('validated-benchmark','coaching/brief'));
 }
 const report={measuredAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,transport:socket?'loopback socket HTTP':'Miniflare dispatchFetch',cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem(),sqliteVersion:version.version,sqliteVersionReadError:version.unavailableReason||null},legacyBenchmarkGenerationControl:legacyControl.event,sampleBriefResponse,cases,events,unexpectedHttpErrors:events.filter(e=>e.id!==legacyControl.event.id&&e.status>=400&&e.status!==409).length,limitations:['Small synthetic accounts and bounded sample counts; empirical quantiles, no production SLA.','Other local engineering/audit tasks can contend for the same computer; this is not a dedicated benchmark host.','Loopback socket and Miniflare dispatch are separate local transports; neither is staging, production edge, or mobile-network latency.','Large-history performance, sustained capacity and production RTO/RPO remain unmeasured.']};
 mkdirSync('docs/production-readiness/evidence',{recursive:true});writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({output,legacyControl:legacyControl.event,cases,unexpectedHttpErrors:report.unexpectedHttpErrors}));
}finally{await mf.dispose();}
