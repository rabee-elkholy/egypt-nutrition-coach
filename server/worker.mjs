import {clockNow,clockDate,isoNow,withClock,simulationTime} from './clock.mjs';
import {simulationCommand,simulationSummary} from './simulation.mjs';
import {nutritionQualityIssues} from '../planner-core.mjs';
import {command} from './coaching.mjs';
import {catalog,exerciseAlternatives,regionForMuscle,scheduledSessions} from './workouts.mjs';
import {recovery} from './recovery.mjs';
import {loadAccount,saveAccount} from './store.mjs';
import {library,mealAlternatives,dayTotals} from './food.mjs';
import {localDate,integer,validDate,needsHealthConfirmation,needsScheduleConfirmation} from '../coaching-shared.mjs';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const present=s=>withClock(simulationTime(s),()=>{
 const plan=s.plans.find(p=>p.id===s.active_plan_id),ready=recovery(s.checkins,clockNow(),s.workoutLogs),needsHealth=needsHealthConfirmation(s),needsSchedule=needsScheduleConfirmation(s);
 return {...s,serverNow:isoNow(),simulationToday:s.simulation?simulationSummary(s):null,eligibility:{needsHealthConfirmation:needsHealth,needsScheduleConfirmation:needsSchedule,status:needsHealth?'needs_health_confirmation':needsSchedule?'needs_schedule_confirmation':'eligible'},planQuality:plan?.days.flatMap(d=>nutritionQualityIssues(d.summary,d.targets||plan.targets).map(message=>({date:d.date,message})))||[],scheduledSessions:scheduledSessions(s),serverDate:clockDate(),recovery:{...ready,progressionAllowed:ready.progressionAllowed&&!needsHealth&&!needsSchedule}};
});
async function requestJson(request){
 const reader=request.body?.getReader();if(!reader)throw Error('محتوى JSON مطلوب.');const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>40000){await reader.cancel();throw Object.assign(Error('الطلب أكبر من المسموح.'),{status:413});}chunks.push(value);}
 const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{throw Object.assign(Error('ترميز JSON غير صالح.'),{status:400});}
}
function cursor(value,label){return value==null?0:integer(value,0,Number.MAX_SAFE_INTEGER,label);}
export default {async fetch(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/v1/'))return env.ASSETS.fetch(request);
 if(url.pathname==='/v1/health'&&request.method!=='GET')return json({error:'GET فقط.'},405,{Allow:'GET'});
 if(url.pathname==='/v1/health')return json({ok:true,apiVersion:'1',engineVersion:'0.10.0'});
 const identity=request.headers.get('oai-authenticated-user-id');if(!identity)return json({error:'سجّل الدخول لحفظ ومتابعة خطتك.'},401);
 try{
 const simulation=url.searchParams.get('simulation');if(simulation!==null&&simulation!=='1')throw Error('وضع المحاكاة غير صالح.');
 const simulationMode=simulation==='1';
 const user=simulationMode?'__simulation__:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)))).map(x=>x.toString(16).padStart(2,'0')).join(''):identity;
 if(!env.DB)return json({error:'قاعدة البيانات غير متاحة.'},503);
 if(request.method==='GET'&&url.pathname==='/v1/catalog/manifest')return json(catalog.manifest);
 if(request.method==='GET'&&url.pathname==='/v1/catalog/muscles')return json({items:catalog.muscles,translations:catalog.muscleTranslations});
 if(request.method==='GET'&&url.pathname==='/v1/exercises'){
  const q=(url.searchParams.get('q')||'').toLowerCase().slice(0,100),muscle=url.searchParams.get('muscle'),equipment=url.searchParams.get('equipment');const offset=cursor(url.searchParams.get('offset'),'بداية الصفحة');
  const found=catalog.exercises.filter(e=>(!q||e.name.toLowerCase().includes(q))&&(!muscle||e.muscles.some(m=>m.muscle_id===muscle||regionForMuscle(m.muscle_id)===muscle))&&(!equipment||e.equipment.some(x=>x.equipment_id===equipment)));
  return json({total:found.length,items:found.slice(offset,offset+30),nextOffset:offset+30<found.length?offset+30:null});
 }
 if(request.method==='GET'&&url.pathname.startsWith('/v1/exercises/')){const e=catalog.exercises.find(e=>e.id===decodeURIComponent(url.pathname.slice(14)));return e?json(e):json({error:'التمرين غير موجود.'},404);}
 if(request.method==='GET'&&url.pathname==='/v1/foods'){
  const q=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);return json({items:Object.values(library.ingredients).filter(i=>!q||[i.label,...(i.aliases||[])].some(x=>x.toLowerCase().includes(q))).slice(0,40).map(i=>({key:i.key,name:i.label,state:i.state,values:i.values,source:i.source}))});
 }
 const s=await loadAccount(env.DB,user);
 return await withClock(simulationTime(s),async()=>{
 if(request.method==='GET'){
  if(url.pathname==='/v1/state')return json(present(s));
  if(url.pathname==='/v1/food-diary'){const date=url.searchParams.get('date')||clockDate();if(!validDate(date))throw Error('تاريخ غير صالح.');return json(dayTotals(s,date));}
  if(url.pathname==='/v1/meal-alternatives')return json({items:mealAlternatives(s,url.searchParams.get('mealId'))});
  if(url.pathname==='/v1/exercise-alternatives')return json({items:exerciseAlternatives(s,url.searchParams.get('dayIndex'),url.searchParams.get('exerciseId'))});
  if(url.pathname==='/v1/plans')return json({items:s.planRefs||[]});
  if(url.pathname.startsWith('/v1/plans/')){
   const id=decodeURIComponent(url.pathname.slice(10));const current=s.plans.find(p=>p.id===id);if(current)return json(current);
   const row=await env.DB.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(user,id).first();return row?json(JSON.parse(row.body)):json({error:'الخطة غير موجودة.'},404);
  }
  if(url.pathname==='/v1/workout-plans')return json({items:s.workoutPlanRefs||[]});
  if(url.pathname.startsWith('/v1/workout-plans/')){
   const id=decodeURIComponent(url.pathname.slice(18));if(s.workoutPlan?.id===id)return json(s.workoutPlan);
   const row=await env.DB.prepare('SELECT body FROM coaching_workout_plans WHERE user_id=? AND plan_id=?').bind(user,id).first();return row?json(JSON.parse(row.body)):json({error:'الخطة غير موجودة.'},404);
  }
  if(url.pathname==='/v1/sync/changes'){
   const after=cursor(url.searchParams.get('after'),'مؤشر المزامنة');const rows=await env.DB.prepare('SELECT revision,action,at FROM coaching_changes WHERE user_id=? AND revision>? ORDER BY revision LIMIT 100').bind(user,after).all();return json({items:rows.results,currentRevision:s.revision,nextCursor:rows.results.at(-1)?.revision||after,hasMore:rows.results.length===100});
  }
 }
 if(request.method!=='POST'||url.pathname!=='/v1/commands')return json({error:'المسار غير موجود.'},404);
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origin غير مسموح.'},403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return json({error:'JSON مطلوب.'},415);
 const raw=await requestJson(request);
 const body=JSON.parse(raw),key=request.headers.get('Idempotency-Key');
 if(!body||Array.isArray(body)||typeof body.action!=='string'||!Number.isSafeInteger(body.revision)||body.revision<0||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return json({error:'صيغة العملية غير صالحة.'},400);
 if(!key||key.length>100)return json({error:'Idempotency-Key مطلوب.'},400);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const previous=await env.DB.prepare('SELECT digest,response FROM coaching_requests WHERE user_id=? AND request_key=?').bind(user,key).first();
 if(previous){if(previous.digest!==digest)return json({error:'مفتاح الطلب مستخدم لمحتوى مختلف.'},409);return json({...present(await loadAccount(env.DB,user)),commandReceipt:{revision:JSON.parse(previous.response).revision,replayed:true}},200,{'Idempotency-Replayed':'true'});}
 if(body.revision!==s.revision)return json({error:'تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.'},409);
 const source=simulationMode&&body.action==='simulation_reset'&&body.payload.source==='current'?await loadAccount(env.DB,identity):null;
 const next=simulationMode?simulationCommand(structuredClone(s),body.action,body.payload,source):command(structuredClone(s),body.action,body.payload);next.revision=s.revision+1;
 await saveAccount(env.DB,user,next,s.revision,{key,digest,action:body.action});
 return json(present({...next,plans:next.plans.filter(p=>p.id===next.active_plan_id)}));
 });
 }catch(error){if(!error.status&&(error instanceof TypeError||error instanceof ReferenceError)){console.error('Unexpected application failure',url.pathname,new Date().toISOString());return json({error:'تعذر تنفيذ العملية؛ حاول مرة أخرى.'},500);}if(/D1_ERROR|SQLITE|no such table/i.test(error.message||'')){console.error('Database operation failed',url.pathname,new Date().toISOString());return json({error:'تعذر حفظ البيانات حاليًا؛ حاول تاني بعد لحظات.'},503);}const status=error.status||400;return json({error:error instanceof SyntaxError?'JSON غير صالح.':error.message||'تعذر تنفيذ الطلب.'},status);}
}};
