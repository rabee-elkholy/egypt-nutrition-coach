import {present,presentBootstrap,presentReceipt} from './presentation.mjs';
import {requestJson,cursor,paginateDateCollection,wantsMinimalResponse} from './http.mjs';
import {coachingInbox,reconcileCoaching} from '../coaching-journey.mjs';
import {clockNow,isoNow,withClock,simulationTime} from './clock.mjs';
import {simulationCommand} from './simulation.mjs';


import {command,review,evaluateEligibility,progressSummary} from './coaching.mjs';
import {catalog,exerciseAlternatives,regionForMuscle} from './workouts.mjs';

import {loadAccount,saveAccount,canonicalCommandDigest,exportFullAccountData,deleteFullAccountData,backfillAccountToNormalizedTables,sha256Hex} from './store.mjs';
import {mealAlternatives,dayTotals} from './food.mjs';
import {searchFoodCatalog,getFoodCatalogItem,getFoodCatalogManifest,calculatePreparedBeverageOrRecipe} from './food-catalog.mjs';
import {authenticateRequest,checkRateLimit} from './auth.mjs';
import {formatErrorBody,createApiError,logEvent} from './logger.mjs';
import {personalBrief} from '../personal-brief.mjs';
import {localDate,integer,validDate} from '../coaching-shared.mjs';

const SECURITY_HEADERS={
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'no-referrer'
};

const json=(data,status=200,headers={},requestId=null)=>Response.json(data,{
 status,
 headers:{
  ...SECURITY_HEADERS,
  ...(requestId?{'X-Request-Id':requestId}:{}),
  ...headers
 }
});

const errorJson=(message,status=400,requestId=null,options={},headers={})=>json(
 formatErrorBody(message,status,requestId,options),
 status,
 headers,
 requestId
);

export default {async fetch(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/v1/'))return env.ASSETS.fetch(request);
 const reqId=request.headers.get('X-Request-Id')||crypto.randomUUID();

 if(request.method==='OPTIONS'){
  const origin=request.headers.get('Origin')||url.origin;
  return new Response(null,{status:204,headers:{...SECURITY_HEADERS,'X-Request-Id':reqId,'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Idempotency-Key, Prefer, If-None-Match, X-Request-Id, X-Client-Device-Id'}});
 }

 if(url.pathname==='/v1/health'&&request.method!=='GET')return errorJson('GET فقط.',405,reqId,{code:'METHOD_NOT_ALLOWED'},{Allow:'GET'});
 if(url.pathname==='/v1/health')return json({ok:true,apiVersion:'1',engineVersion:'0.13.0',requestId:reqId},200,{},reqId);
 if(url.pathname==='/v1/capabilities'&&request.method==='GET')return json({apiVersion:'1',schemaVersion:3,engineVersion:'0.13.0',catalogVersion:catalog.manifest.version,foodCatalogVersion:getFoodCatalogManifest().version,serverTime:isoNow(),requestId:reqId,features:['adaptive_nutrition','adaptive_workouts','recovery_readiness','simulation_90d','eligibility_screening','progress_summary','kmm_bootstrap','delta_receipts','offline_sync_v2','arabic_food_catalog','multi_timezone','account_export_delete','coaching_agreements','coaching_feedback','automatic_evidence_review']},200,{},reqId);

 try{
  const auth=await authenticateRequest(request,env);
  const identity=auth.userId;
  checkRateLimit(identity,request.method==='GET'?'read':'write',env);

  const simulation=url.searchParams.get('simulation');
  if(simulation!==null&&simulation!=='1')throw createApiError('وضع المحاكاة غير صالح.',400,{code:'INVALID_SIMULATION_PARAM'});
  const simulationMode=simulation==='1';
  const user=simulationMode?'__simulation__:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)))).map(x=>x.toString(16).padStart(2,'0')).join(''):identity;

  if(!env.DB)return errorJson('قاعدة البيانات غير متاحة.',503,reqId,{code:'DATABASE_UNAVAILABLE',retryable:true});

  if(request.method!=='GET'&&request.method!=='OPTIONS'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)throw createApiError('Origin غير مسموح.',403,{code:'ORIGIN_FORBIDDEN'});
  if(!auth.scopes.includes(request.method==='GET'?'coach:read':'coach:write'))throw createApiError('صلاحية الرمز لا تسمح بالعملية.',403,{code:'AUTH_SCOPE_REQUIRED'});

  // Public/Catalog Reads (require auth)
  if(request.method==='GET'&&url.pathname==='/v1/catalog/manifest')return json({...catalog.manifest,foodCatalog:getFoodCatalogManifest()},200,{},reqId);
  if(request.method==='GET'&&url.pathname==='/v1/catalog/muscles')return json({items:catalog.muscles,translations:catalog.muscleTranslations},200,{},reqId);
  if(request.method==='GET'&&url.pathname==='/v1/exercises'){
   const q=(url.searchParams.get('q')||'').toLowerCase().slice(0,100),muscle=url.searchParams.get('muscle'),equipment=url.searchParams.get('equipment');const offset=cursor(url.searchParams.get('offset'),'بداية الصفحة');
   const found=catalog.exercises.filter(e=>(!q||e.name.toLowerCase().includes(q))&&(!muscle||e.muscles.some(m=>m.muscle_id===muscle||regionForMuscle(m.muscle_id)===muscle))&&(!equipment||e.equipment.some(x=>x.equipment_id===equipment)));
   return json({total:found.length,items:found.slice(offset,offset+30),nextOffset:offset+30<found.length?offset+30:null},200,{},reqId);
  }
  if(request.method==='GET'&&url.pathname.startsWith('/v1/exercises/')){
   const e=catalog.exercises.find(e=>e.id===decodeURIComponent(url.pathname.slice(14)));
   return e?json(e,200,{},reqId):errorJson('التمرين غير موجود.',404,reqId,{code:'EXERCISE_NOT_FOUND'});
  }
  if(request.method==='GET'&&url.pathname==='/v1/foods'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,100);
   const scope=url.searchParams.get('scope')||'all';
   const includeEstimated=url.searchParams.get('includeEstimated')==='true'||url.searchParams.get('status')==='published';
   const offset=cursor(url.searchParams.get('offset'),'بداية الصفحة');
   const limit=url.searchParams.get('limit')==null?40:integer(url.searchParams.get('limit'),1,100,'حجم الصفحة');
   const kind=url.searchParams.get('kind')||null;
   const category=url.searchParams.get('category')||null;
   const res=searchFoodCatalog({q,scope,includeEstimated,offset,limit,kind,category});
   return json(res,200,{},reqId);
  }
  if(request.method==='GET'&&url.pathname.startsWith('/v1/foods/')){
   const id=decodeURIComponent(url.pathname.slice(10));
   const item=getFoodCatalogItem(id);
   return item?json(item,200,{},reqId):errorJson('الصنف الغذائي غير موجود.',404,reqId,{code:'FOOD_NOT_FOUND'});
  }
  if(request.method==='GET'&&url.pathname==='/v1/beverages'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,100);
   const includeEstimated=url.searchParams.get('includeEstimated')==='true';
   const offset=cursor(url.searchParams.get('offset'),'بداية الصفحة');
   const limit=url.searchParams.get('limit')==null?40:integer(url.searchParams.get('limit'),1,100,'حجم الصفحة');
   const res=searchFoodCatalog({q,scope:'beverages',includeEstimated,offset,limit});
   return json(res,200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/foods/calculate'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('JSON مطلوب.',415,reqId);
   const body=JSON.parse(await requestJson(request));
   if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('صيغة الطلب غير صالحة.',400,reqId);
   return json(calculatePreparedBeverageOrRecipe(body),200,{},reqId);
  }

  // Auth & Session Management Endpoints
  if(request.method==='GET'&&url.pathname==='/v1/auth/session'){
   return json({
    userId:auth.userId,
    subject:auth.subject,
    sessionId:auth.sessionId,
    deviceId:auth.deviceId,
    authMethod:auth.authMethod,
    isAnonymous:auth.isAnonymous,
    scopes:auth.scopes,
    entitlement:auth.entitlement,
    issuedAt:auth.issuedAt,
    expiresAt:auth.expiresAt
   },200,{},reqId);
  }

  if(request.method==='POST'&&url.pathname==='/v1/auth/revoke'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('JSON مطلوب.',415,reqId);
   const body=JSON.parse(await requestJson(request));
   const targetSession=body?.allDevices===true?'__all__':(body?.sessionId||auth.sessionId);
   if(body?.allDevices!==true&&(typeof targetSession!=='string'||!targetSession||targetSession.length>200||targetSession.startsWith('__')))throw createApiError('معرّف الجلسة غير صالح.',400,{code:'INVALID_SESSION_ID'});
   const nowIso=new Date().toISOString();
   await env.DB.prepare('INSERT OR REPLACE INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)').bind(identity,String(targetSession),auth.deviceId||'manual',nowIso,null,nowIso).run();
   return json({revoked:true,sessionId:targetSession,revokedAt:nowIso},200,{},reqId);
  }

  if(request.method==='POST'&&url.pathname==='/v1/auth/claim-anonymous'){
   if(auth.isAnonymous)throw createApiError('يجب تسجيل الدخول بحساب موثّق للمطالبة ببيانات الجلسة المجهولة.',403,{code:'CLAIM_REQUIRES_VERIFIED_ACCOUNT'});
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('JSON مطلوب.',415,reqId);
   const body=JSON.parse(await requestJson(request));
   if(!body||body.consent!==true||typeof body.anonymousUserId!=='string'||!body.anonymousUserId.startsWith('anon:'))throw createApiError('موافقة صريحة ومعرّف الجلسة المجهولة مطلوبان لدمج البيانات.',400,{code:'INVALID_CLAIM_REQUEST'});
   const anonId=body.anonymousUserId;
   if(request.headers.get('x-anonymous-cookie-uid')!==anonId)throw createApiError('إثبات امتلاك جلسة الويب المجهولة مطلوب.',403,{code:'ANONYMOUS_OWNERSHIP_REQUIRED'});
   // Check if already claimed
   const claimedCheck=await env.DB.prepare('SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id=?').bind(anonId,'__claimed__').first();
   if(claimedCheck?.revoked_at)throw createApiError('تم نقل بيانات هذه الجلسة المجهولة مسبقًا ولا يمكن المطالبة بها مرتين.',409,{code:'ANONYMOUS_ALREADY_CLAIMED'});
   const anonRow=await env.DB.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(anonId).first();
   if(!anonRow)throw createApiError('لا توجد بيانات محفوظة للجلسة المجهولة المحددة.',404,{code:'ANONYMOUS_ACCOUNT_NOT_FOUND'});
   const targetRow=await env.DB.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(identity).first();
   if(targetRow&&JSON.parse(targetRow.body)?.profile)throw createApiError('الحساب الموثق يحتوي بالفعل على ملف شخصي؛ حدد سياسة الدمج.',409,{code:'TARGET_ACCOUNT_NOT_EMPTY'});
   const anonState=await loadAccount(env.DB,anonId);
   anonState.revision=(targetRow?.revision||0)+1;
   await saveAccount(env.DB,identity,anonState,targetRow?.revision||0,{key:'claim-'+anonId,digest:'claim',action:'claim_anonymous',claimSource:{userId:anonId,revision:anonRow.revision}});
   return json({claimed:true,fromAnonymousId:anonId,toUserId:identity,revision:anonState.revision},200,{'Set-Cookie':'coach_uid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'},reqId);
  }

  // Account Privacy, Export & Deletion Endpoints
  if(request.method==='GET'&&url.pathname==='/v1/account/export'){
   const exported=await exportFullAccountData(env.DB,user);
   return json(exported,200,{},reqId);
  }
  if((request.method==='POST'||request.method==='DELETE')&&url.pathname==='/v1/account/delete'){
   if(simulationMode)throw createApiError('حذف الحساب متاح خارج وضع المحاكاة فقط ويشمل بيانات المحاكاة المرتبطة.',400,{code:'ACCOUNT_DELETION_SIMULATION_FORBIDDEN'});
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('JSON مطلوب.',415,reqId);
   const body=JSON.parse(await requestJson(request));
   if(body?.confirm!==true)throw createApiError('تأكيد حذف الحساب نهائيًا مطلوب (confirm: true).',400,{code:'DELETE_CONFIRMATION_REQUIRED'});
   const res=await deleteFullAccountData(env.DB,user);
   return json(res,200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/account/consents'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('JSON مطلوب.',415,reqId);
   const body=JSON.parse(await requestJson(request));
   if(!body||typeof body.consentType!=='string'||typeof body.version!=='string'||typeof body.accepted!=='boolean')throw createApiError('بيانات الموافقة غير مكتملة.',400,{code:'INVALID_CONSENT_PAYLOAD'});
   const nowIso=new Date().toISOString();
   await env.DB.prepare('INSERT OR REPLACE INTO coaching_account_consents(user_id,consent_type,version,accepted,at) VALUES(?,?,?,?,?)').bind(user,body.consentType.slice(0,60),body.version.slice(0,30),body.accepted?1:0,nowIso).run();
   return json({consentType:body.consentType,version:body.version,accepted:body.accepted,at:nowIso},200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/account/backfill'){
   const res=await backfillAccountToNormalizedTables(env.DB,user);
   return json(res,200,{},reqId);
  }

  const s=await loadAccount(env.DB,user);
  return await withClock(simulationTime(s),async()=>{
   const tz=s.profile?.timezone||'Africa/Cairo';
   const currDate=localDate(clockNow(),tz);
   const etag=`W/"rev-${s.revision}-${currDate}-${Math.floor(clockNow()/60000)}"`;

   if(request.method==='GET'){
    if(url.pathname==='/v1/bootstrap'){
     if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{...SECURITY_HEADERS,ETag:etag,'X-Request-Id':reqId}});
     return json(presentBootstrap(s),200,{ETag:etag},reqId);
    }
    if(url.pathname==='/v1/state'){
     if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{...SECURITY_HEADERS,ETag:etag,'X-Request-Id':reqId}});
     return json(present(s),200,{ETag:etag},reqId);
    }
    if(url.pathname==='/v1/progress/summary')return json(progressSummary(s),200,{ETag:etag},reqId);
    if(url.pathname==='/v1/coaching/inbox')return json(coachingInbox(s,clockNow()),200,{},reqId);
    if(url.pathname==='/v1/coaching/history')return json(paginateDateCollection(s.coachingCases||[],url),200,{},reqId);
    if(url.pathname==='/v1/coaching/brief'){
     const snapshot=present(s),notes=s.profile?personalBrief(snapshot,currDate):[];
     const briefEtag=`W/"brief-${await sha256Hex(JSON.stringify([user,s.revision,currDate,notes]))}"`;
     if(request.headers.get('If-None-Match')===briefEtag)return new Response(null,{status:304,headers:{...SECURITY_HEADERS,ETag:briefEtag,'X-Request-Id':reqId}});
     const items=await Promise.all(notes.map(async note=>{
      const id=await sha256Hex(JSON.stringify([user,currDate,note.role]));
      return {...note,id:'brief-'+id,basedOnRevision:s.revision,relatedPlanId:note.role==='nutrition'?s.active_plan_id||null:note.role==='training'?s.workoutPlan?.id||null:null,status:'GENERATED',deliveryStatus:'NOT_MEASURED',renderingStatus:'NOT_MEASURED'};
     }));
     return json({apiVersion:'1',viewKind:'on_demand_coaching_brief',date:currDate,timezone:tz,revision:s.revision,generatedAt:snapshot.serverNow,requiresOnboarding:!s.profile,notes:items,requestId:reqId},200,{ETag:briefEtag},reqId);
    }
    if(url.pathname==='/v1/food-diary'){
     const date=url.searchParams.get('date')||currDate;
     if(!validDate(date))throw createApiError('تاريخ غير صالح.',400,{code:'INVALID_DATE'});
     return json(dayTotals(s,date),200,{},reqId);
    }
    if(url.pathname==='/v1/water-logs')return json(paginateDateCollection(s.waterLogs,url),200,{},reqId);
    if(url.pathname==='/v1/weight-logs')return json(paginateDateCollection(s.weights,url),200,{},reqId);
    if(url.pathname==='/v1/workout-logs')return json(paginateDateCollection(s.workoutLogs,url),200,{},reqId);
    if(url.pathname==='/v1/sessions')return json(paginateDateCollection(s.sessions,url),200,{},reqId);
    if(url.pathname==='/v1/checkins')return json(paginateDateCollection(s.checkins,url),200,{},reqId);
    if(url.pathname==='/v1/activity-logs')return json(paginateDateCollection(s.activityLogs,url),200,{},reqId);
    if(url.pathname==='/v1/notifications/preferences')return json(s.notificationPreferences||{},200,{},reqId);
    if(url.pathname==='/v1/entitlements')return json(s.entitlements||{tier:'free',features:['core_nutrition','core_workouts','offline_sync','arabic_food_search']},200,{},reqId);
    if(url.pathname==='/v1/meal-alternatives')return json({items:mealAlternatives(s,url.searchParams.get('mealId'))},200,{},reqId);
    if(url.pathname==='/v1/exercise-alternatives')return json({items:exerciseAlternatives(s,url.searchParams.get('dayIndex'),url.searchParams.get('exerciseId'))},200,{},reqId);
    if(url.pathname==='/v1/plans')return json({items:s.planRefs||[]},200,{},reqId);
    if(url.pathname.startsWith('/v1/plans/')){
     const rest=url.pathname.slice(10);
     const dayMatch=rest.match(/^([^/]+)\/days\/(\d{4}-\d{2}-\d{2})$/);
     const id=decodeURIComponent(dayMatch?dayMatch[1]:rest);
     let plan=s.plans.find(p=>p.id===id);
     if(!plan){
      const row=await env.DB.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(user,id).first();
      if(row)plan=JSON.parse(row.body);
     }
     if(!plan)return errorJson('الخطة غير موجودة.',404,reqId,{code:'PLAN_NOT_FOUND'});
     if(dayMatch){
      const day=plan.days.find(d=>d.date===dayMatch[2]);
      return day?json({planId:plan.id,targets:day.targets||plan.targets,day},200,{},reqId):errorJson('اليوم غير موجود في الخطة.',404,reqId,{code:'PLAN_DAY_NOT_FOUND'});
     }
     return json(plan,200,{},reqId);
    }
    if(url.pathname==='/v1/workout-plans')return json({items:s.workoutPlanRefs||[]},200,{},reqId);
    if(url.pathname.startsWith('/v1/workout-plans/')){
     const id=decodeURIComponent(url.pathname.slice(18));
     if(s.workoutPlan?.id===id)return json(s.workoutPlan,200,{},reqId);
     const row=await env.DB.prepare('SELECT body FROM coaching_workout_plans WHERE user_id=? AND plan_id=?').bind(user,id).first();
     return row?json(JSON.parse(row.body),200,{},reqId):errorJson('الخطة غير موجودة.',404,reqId,{code:'WORKOUT_PLAN_NOT_FOUND'});
    }
    if(url.pathname==='/v1/sync/changes'){
     const after=cursor(url.searchParams.get('after'),'مؤشر المزامنة');
     const afterSeq=url.searchParams.get('afterSeq')==null?null:cursor(url.searchParams.get('afterSeq'),'مؤشر تسلسل المزامنة');
     const rows=await env.DB.prepare('SELECT revision,action,at FROM coaching_changes WHERE user_id=? AND revision>? ORDER BY revision LIMIT 100').bind(user,after).all();
     let deltas=[];
     let nextSeqCursor=afterSeq||0;
     let hasMoreDeltas=false;
     try{
      const outboxSql='SELECT seq,revision,entity_type,entity_id,op,at,payload FROM coaching_sync_outbox WHERE user_id=? AND '+(afterSeq!=null?'seq>?':'revision>?')+' ORDER BY seq LIMIT 100';
      const outboxRows=await env.DB.prepare(outboxSql).bind(user,afterSeq!=null?afterSeq:after).all();
      deltas=(outboxRows?.results||[]).map(r=>({
       seq:r.seq,
       revision:r.revision,
       entityType:r.entity_type,
       entityId:r.entity_id,
       op:r.op,
       at:r.at,
       payload:JSON.parse(r.payload)
      }));
      if(deltas.length)nextSeqCursor=deltas.at(-1).seq;
      hasMoreDeltas=deltas.length===100;
     }catch(error){if(!/no such table/i.test(error.message||''))throw error;}
     return json({
      items:rows.results,
      deltas,
      currentRevision:s.revision,
      nextCursor:rows.results.at(-1)?.revision||after,
      nextSeqCursor,
      hasMore:rows.results.length===100||hasMoreDeltas,
      resyncRequired:after>s.revision
     },200,{},reqId);
    }
   }

   if(request.method==='POST'&&url.pathname==='/v1/eligibility'){
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('JSON مطلوب.',415,reqId);
    const body=JSON.parse(await requestJson(request));
    if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('صيغة الطلب غير صالحة.',400,reqId);
    return json(evaluateEligibility(body),200,{},reqId);
   }

   if(request.method==='POST'&&url.pathname==='/v1/wearables/ingest'){
    if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return errorJson('Origin غير مسموح.',403,reqId);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('JSON مطلوب.',415,reqId);
    const raw=await requestJson(request);
    const body=JSON.parse(raw);
    const key=request.headers.get('Idempotency-Key')||`wearable-${await canonicalCommandDigest(body)}`;
    if(!body||typeof body!=='object'||!Array.isArray(body.records)||body.records.length>100)return errorJson('صيغة دفعة الأجهزة القابلة للارتداء غير صالحة.',400,reqId);
    const digest=await canonicalCommandDigest(body);
    const prior=await env.DB.prepare('SELECT digest,response FROM coaching_requests WHERE user_id=? AND request_key=?').bind(user,key).first();
    if(prior){if(prior.digest!==digest)throw createApiError('مفتاح الطلب مستخدم لمحتوى مختلف.',409,{code:'IDEMPOTENCY_KEY_REUSED_MISMATCH'});return json({...JSON.parse(prior.response),ok:true,replayed:true},200,{'Idempotency-Replayed':'true'},reqId);}
    let next=structuredClone(s);
    let ingested=0;
    for(const rec of body.records){
     if(rec.type==='weight'){
      next=command(next,'weight',{date:rec.date,kg:rec.kg,source:rec.source||'wearable'});
      ingested++;
     }else if(rec.type==='steps'||rec.type==='activity'){
      next=command(next,'activity',{date:rec.date,steps:rec.steps,activeEnergyKcal:rec.activeEnergyKcal,source:rec.source||'wearable',externalRecordId:rec.externalRecordId});
      ingested++;
     }
    }
    next.revision=s.revision+1;
    await saveAccount(env.DB,user,next,s.revision,{key,digest,action:'wearable_ingest',payload:{count:ingested},previousState:s});
    return json({ok:true,revision:next.revision,ingested},200,{},reqId);
   }

   if(request.method!=='POST'||url.pathname!=='/v1/commands')return errorJson('المسار غير موجود.',404,reqId,{code:'ROUTE_NOT_FOUND'});
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return errorJson('Origin غير مسموح.',403,reqId,{code:'ORIGIN_FORBIDDEN'});
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('JSON مطلوب.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});

   const raw=await requestJson(request);
   const body=JSON.parse(raw),key=request.headers.get('Idempotency-Key');
   if(!body||Array.isArray(body)||typeof body.action!=='string'||!Number.isSafeInteger(body.revision)||body.revision<0||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return errorJson('صيغة العملية غير صالحة.',400,reqId,{code:'INVALID_COMMAND_ENVELOPE'});
   if(!key||key.length>100)return errorJson('Idempotency-Key مطلوب.',400,reqId,{code:'IDEMPOTENCY_KEY_REQUIRED'});

   // Support both exact raw-byte digest (legacy tests) and canonical JSON key-order-independent digest (F07)
   const rawDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const canonDigest=await canonicalCommandDigest(body);

   const previous=await env.DB.prepare('SELECT digest,response FROM coaching_requests WHERE user_id=? AND request_key=?').bind(user,key).first();
   if(previous){
    if(previous.digest!==rawDigest&&previous.digest!==canonDigest){
     return errorJson('مفتاح الطلب مستخدم لمحتوى مختلف.',409,reqId,{code:'IDEMPOTENCY_KEY_REUSED_MISMATCH',currentRevision:s.revision});
    }
    const latestState=await loadAccount(env.DB,user);
    const parsedReceipt=JSON.parse(previous.response);
    if(wantsMinimalResponse(request,url)){
     return json({
      ...presentReceipt({...latestState,_lastReceipt:{...parsedReceipt,affected:parsedReceipt.affected||[]}},body.action,body.payload,true),
      commandReceipt:{revision:parsedReceipt.revision,action:body.action,replayed:true,at:parsedReceipt.at}
     },200,{'Idempotency-Replayed':'true'},reqId);
    }
    return json({...present(latestState),commandReceipt:{revision:parsedReceipt.revision,replayed:true}},200,{'Idempotency-Replayed':'true'},reqId);
   }

   if(body.revision!==s.revision){
    return errorJson('تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.',409,reqId,{
     code:'REVISION_CONFLICT',
     currentRevision:s.revision,
     mergeHints:{
      expectedRevision:body.revision,
      serverRevision:s.revision,
      syncChangesEndpoint:`/v1/sync/changes?after=${body.revision}`,
      resolutionPolicy:'fetch_sync_deltas_then_rebase_or_retry'
     }
    });
   }

   const source=simulationMode&&body.action==='simulation_reset'&&body.payload.source==='current'?await loadAccount(env.DB,identity):null;
   const next=simulationMode?simulationCommand(structuredClone(s),body.action,body.payload,source):command(structuredClone(s),body.action,body.payload);
   // Recompute decisions in the same transaction as new relevant evidence.
   if(['recovery','weight','food','food_entry','food_complete','food_delete','session','workout','coaching_feedback','renew_plan','timezone','confirm_health','confirm_schedule'].includes(body.action))review(next);
   reconcileCoaching(next,clockNow());
   // Hydration/activity/notification bookkeeping does not invalidate plan evidence.
   if(['water','steps','activity','notification_preferences'].includes(body.action))next.adaptations=structuredClone(s.adaptations);
   if(['water','steps','activity','notification_preferences','coaching_ack','coaching_decision','coaching_outcome'].includes(body.action))for(const a of next.adaptations)if(a.status==='pending'&&a.baseRevision===s.revision)a.baseRevision=s.revision+1;
   next.revision=s.revision+1;
   await saveAccount(env.DB,user,next,s.revision,{key,digest:canonDigest,action:body.action,payload:body.payload,previousState:s});

   if(wantsMinimalResponse(request,url)){
    return json(presentReceipt(next,body.action,body.payload,false),200,{ETag:`W/"rev-${next.revision}"`},reqId);
   }
   return json(present({...next,plans:next.plans.filter(p=>p.id===next.active_plan_id)}),200,{ETag:`W/"rev-${next.revision}"`},reqId);
  });
 }catch(error){
  if(!error.status&&(error instanceof TypeError||error instanceof ReferenceError)){
   logEvent('error','unhandled_runtime_error',{requestId:reqId,path:url.pathname,method:request.method,status:500,details:{name:error.name}});
   return errorJson('تعذر تنفيذ العملية؛ حاول مرة أخرى.',500,reqId,{code:'INTERNAL_ERROR',retryable:true});
  }
  if(/D1_ERROR|SQLITE|no such table/i.test(error.message||'')){
   logEvent('error','database_operation_failed',{requestId:reqId,path:url.pathname,method:request.method,status:503});
   return errorJson('تعذر حفظ البيانات حاليًا؛ حاول تاني بعد لحظات.',503,reqId,{code:'DATABASE_ERROR',retryable:true});
  }
  const status=error.status||400;
  const msg=error instanceof SyntaxError?'JSON غير صالح.':error.message||'تعذر تنفيذ الطلب.';
  return errorJson(msg,status,reqId,{
   code:error.code||(error instanceof SyntaxError?'INVALID_JSON':undefined),
   fieldErrors:error.fieldErrors,
   retryable:error.retryable,
   currentRevision:error.currentRevision,
   mergeHints:error.mergeHints
  });
 }
}};
