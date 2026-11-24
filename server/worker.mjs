import {present,presentBootstrap,presentReceipt} from './presentation.mjs';
import {requestJson,cursor,paginateDateCollection,wantsMinimalResponse} from './http.mjs';
import {coachingInbox,reconcileCoaching} from '../coaching-journey.mjs';
import {clockNow,isoNow} from './clock.mjs';

import {command,review,evaluateEligibility,progressSummary,previewPlan} from './coaching.mjs';
import {catalog,exerciseAlternatives,regionForMuscle,workoutSafetyIssues} from './workouts.mjs';
import {enrichExercise,matchesExerciseQuery,enrichMuscleCatalog,computeWorkoutPrs} from './workouts-insights.mjs';
import {accountRecovery} from './recovery.mjs';
import {splitReview} from '../split-review.mjs';
import {getPantryCatalog,getPantryAlternatives,getPlanGroceryList,lookupBarcode,submitBarcode,getFastingState} from './nutrition-tools.mjs';
import {listCustomRecipes,listCardioLogs,computeCycleState} from './wellness-tools.mjs';
import {computeProgressAnalytics,computeWeeklyWrapped,buildWidgetSnapshot,computeStreakAndEngagement} from './progress-analytics.mjs';
import {authenticateSocialOAuth,linkOAuthProvider,unlinkOAuthProvider,listLinkedProviders,revokeAppleTokenOnDelete} from './oauth.mjs';
import {handleSignedMediaRequest,signAvatarUrlIfNeeded,uploadProfileAvatar,deleteProfileAvatar,createProgressPhotoUploadUrl,confirmProgressPhoto,listProgressPhotos,deleteProgressPhoto,exportSignedMediaRefs,collectUserMediaKeys,purgeMediaKeys} from './media.mjs';
import {resolveEntitlements,requireProOrConsumeQuota,getSubscriptionOfferings,verifyStoreSubscription,restoreStoreSubscriptions,handleStoreWebhook,isoWeekKeyForDate,recordTrialTombstones} from './subscriptions.mjs';
import {registerPushToken,deletePushToken,deleteAllPushTokens} from './push.mjs';

import {loadAccount,saveAccount,canonicalCommandDigest,exportFullAccountData,deleteFullAccountData,backfillAccountToNormalizedTables,sha256Hex} from './store.mjs';
import {mealAlternatives,dayTotals} from './food.mjs';
import {searchFoodCatalog,getFoodCatalogItem,getFoodCatalogManifest,calculatePreparedBeverageOrRecipe} from './food-catalog.mjs';
import {authenticateRequest,checkRateLimit} from './auth.mjs';
import {refreshUserSession,logoutUserSession,revokeRefreshTokensForSession} from './native-auth.mjs';
import {formatSuccessBody,formatErrorBody,createApiError,logEvent} from './logger.mjs';
import {personalBrief} from '../personal-brief.mjs';
import {localDate,dateOffset,integer,validDate,SUPPORTED_REGIONS,countryToRegion} from '../coaching-shared.mjs';

const hasPushConfigured=env=>Boolean(env?.FCM_SERVICE_ACCOUNT_JSON||(env?.APNS_KEY_ID&&env?.APNS_TEAM_ID&&env?.APNS_PRIVATE_KEY&&env?.APNS_BUNDLE_ID));
const enrichWorkoutPlan=wp=>wp?{...wp,weeklyMuscleSets:wp.weeklySets,days:(wp.days||[]).map(d=>({...d,exercises:(d.exercises||[]).map(e=>{const en=enrichExercise(e);return {...en,targetRepsRange:`${e.repMin}-${e.repMax}`,targetRir:e.rir};})}))}:wp;

const SECURITY_HEADERS={
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'no-referrer'
};

const rawJson=(payload,status=200,headers={},requestId=null)=>Response.json(payload,{
 status,
 headers:{
  ...SECURITY_HEADERS,
  ...(requestId?{'X-Request-Id':requestId}:{}),
  ...headers
 }
});

const json=(data,status=200,headers={},requestId=null,metaExtra={})=>rawJson(
 formatSuccessBody(data,requestId,metaExtra),
 status,
 headers,
 requestId
);

const errorJson=(message,status=400,requestId=null,options={},headers={})=>rawJson(
 formatErrorBody(message,status,requestId,options),
 status,
 headers,
 requestId
);

function compareSemver(a,b){
 const pa=String(a||'0.0.0').split('.').map(n=>Number(n)||0);
 const pb=String(b||'0.0.0').split('.').map(n=>Number(n)||0);
 for(let i=0;i<3;i++){if(pa[i]!==pb[i])return pa[i]-pb[i];}
 return 0;
}

async function listUserConsents(db,userId){
 try{
  const rows=await db.prepare('SELECT consent_type,version,accepted,at FROM coaching_account_consents WHERE user_id=? ORDER BY consent_type').bind(userId).all();
  return (rows?.results||[]).map(r=>({consentType:r.consent_type,version:r.version,accepted:Boolean(r.accepted),at:r.at,recordedAt:r.at}));
 }catch(e){
  if(/no such table/i.test(e?.message||''))return [];
  throw e;
 }
}

async function isHealthConsentWithdrawn(db,userId){
 try{
  const row=await db.prepare("SELECT accepted FROM coaching_account_consents WHERE user_id=? AND consent_type='health_data_processing'").bind(userId).first();
  return row!=null&&Number(row.accepted)===0;
 }catch(e){
  if(/no such table/i.test(e?.message||''))return false;
  throw e;
 }
}

async function hydrateAuthPayloadAvatar(payload,origin,env){
 if(!payload?.user?.avatarUrl||!payload?.user?.userId)return payload;
 const signed=await signAvatarUrlIfNeeded(origin,payload.user.avatarUrl,payload.user.userId,env);
 return {...payload,user:{...payload.user,avatarUrl:signed}};
}

export default {async fetch(request,env){
 const url=new URL(request.url);
 const reqId=request.headers.get('X-Request-Id')||crypto.randomUUID();
 if(!url.pathname.startsWith('/v1/'))return errorJson('API endpoint not found.',404,reqId,{code:'ROUTE_NOT_FOUND'});

 if(request.method==='OPTIONS'){
  const origin=request.headers.get('Origin')||url.origin;
  return new Response(null,{status:204,headers:{...SECURITY_HEADERS,'X-Request-Id':reqId,'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Idempotency-Key, Prefer, If-None-Match, X-Request-Id, X-Client-Device-Id, X-Client-Platform, X-Client-Version, X-Webhook-Secret'}});
 }

 if(url.pathname==='/v1/health'&&request.method!=='GET')return errorJson('Only GET is allowed for /v1/health.',405,reqId,{code:'METHOD_NOT_ALLOWED',params:{allowedMethod:'GET'}},{Allow:'GET'});
 if(url.pathname==='/v1/health'){
  if(env?.DB){
   try{await env.DB.prepare('SELECT 1').first();}
   catch{return errorJson('Database binding is temporarily unavailable.',503,reqId,{code:'DATABASE_UNAVAILABLE',retryable:true});}
  }
  return json({status:'ok',apiVersion:'1',engineVersion:'0.14.0',requestId:reqId},200,{},reqId);
 }

 if(url.pathname==='/v1/capabilities'&&request.method==='GET'){
  const maintenanceActive=env?.MAINTENANCE_MODE==='true';
  const rawCountry=String(request.cf?.country||request.headers.get('CF-IPCountry')||'').trim().toUpperCase();
  const detectedCountry=/^[A-Z]{2}$/.test(rawCountry)&&rawCountry!=='XX'&&rawCountry!=='T1'?rawCountry:null;
  return json({
   apiVersion:'1',
   schemaVersion:3,
   engineVersion:'0.14.0',
   coachingCodesVersion:'1.0.0',
   catalogVersion:catalog.manifest.version,
   foodCatalogVersion:getFoodCatalogManifest().version,
   serverTime:isoNow(),
   requestId:reqId,
   minSupportedVersion:{android:env?.MIN_ANDROID_VERSION||'1.0.0',ios:env?.MIN_IOS_VERSION||'1.0.0'},
   maintenanceMode:{active:maintenanceActive,message:maintenanceActive?(env?.MAINTENANCE_MESSAGE||'Scheduled maintenance in progress.'):null},
   auth:{provider:'cloudflare_d1_native_and_oidc',configured:Boolean(env?.AUTH_JWT_SECRET)},
   features:[
    'adaptive_nutrition','adaptive_workouts','recovery_readiness','eligibility_screening',
    'progress_summary','kmm_bootstrap','delta_receipts','offline_sync','arabic_food_catalog',
    'multi_timezone','account_export_delete','coaching_agreements','coaching_feedback',
    'automatic_evidence_review','native_cloudflare_auth','social_oauth','pantry_finder',
    'grocery_list','barcode_lookup','ramadan_fasting','body_measurements','progress_photos_r2',
    'store_subscriptions','push_notifications','widgets_snapshot','english_canonical_coaching_codes',
    'custom_recipes','cardio_tracking','cycle_awareness','seasonal_flex'
   ],
   deferredFeatures:['ai_meal_parse','ai_coach_qa'],
   supportedRegions:[...SUPPORTED_REGIONS],
   detectedGeo:{
    countryCode:detectedCountry,
    region:detectedCountry?countryToRegion(detectedCountry):null,
    source:detectedCountry?'cloudflare_edge_ip':'unknown'
   }
  },200,{},reqId);
 }

 // Client version & maintenance gates (except health/capabilities/webhooks/signed media)
 const isWebhook=url.pathname==='/v1/webhooks/apple'||url.pathname==='/v1/webhooks/google-play';
 const isSignedMedia=url.pathname.startsWith('/v1/media/signed/');
 if(!isWebhook&&!isSignedMedia){
  if(env?.MAINTENANCE_MODE==='true')return errorJson('Service is temporarily in maintenance mode; offline logging remains active.',503,reqId,{code:'MAINTENANCE_MODE',retryable:true});
  const clientPlatform=(request.headers.get('X-Client-Platform')||'').toLowerCase();
  const clientVersion=request.headers.get('X-Client-Version');
  if(clientVersion&&(clientPlatform==='android'||clientPlatform==='ios')){
   const minVer=clientPlatform==='android'?env?.MIN_ANDROID_VERSION:env?.MIN_IOS_VERSION;
   if(minVer&&compareSemver(clientVersion,minVer)<0){
    return errorJson('Please update CuraFit to the latest version to continue syncing.',426,reqId,{code:'CLIENT_UPDATE_REQUIRED',params:{minVersion:minVer}});
   }
  }
 }

 try{
  // Signed R2 media proxy (HMAC-verified, no Bearer needed)
  if(isSignedMedia){
   const token=decodeURIComponent(url.pathname.slice('/v1/media/signed/'.length));
   return await handleSignedMediaRequest(request,env,token);
  }

  // Public Store Webhooks (Apple App Store Server Notifications & Google Play RTDN)
  if(isWebhook){
   if(request.method!=='POST')return errorJson('Only POST is allowed for this endpoint.',405,reqId,{code:'METHOD_NOT_ALLOWED',params:{allowedMethod:'POST'}},{Allow:'POST'});
   if(!env.DB)return errorJson('Database binding is temporarily unavailable.',503,reqId,{code:'DATABASE_UNAVAILABLE',retryable:true});
   const provider=url.pathname==='/v1/webhooks/apple'?'apple':'google';
   return json(await handleStoreWebhook(env.DB,env,provider,request),200,{},reqId);
  }

  // Stateless Onboarding Summary Preview (Public, IP rate-limited)
  if(url.pathname==='/v1/plans/preview'){
   if(request.method!=='POST')return errorJson('Only POST is allowed for /v1/plans/preview.',405,reqId,{code:'METHOD_NOT_ALLOWED',params:{allowedMethod:'POST'}},{Allow:'POST'});
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const previewKey='preview:'+(request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')||'local');
   checkRateLimit(previewKey,'read',env);
   const body=JSON.parse(await requestJson(request));
   if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Request body must be a JSON object.',400,reqId,{code:'INVALID_REQUEST_BODY'});
   return json(previewPlan(body),200,{},reqId);
  }

  // Stateless Eligibility Pre-Screening (Public, IP rate-limited)
  if(url.pathname==='/v1/eligibility'){
   if(request.method!=='POST')return errorJson('Only POST is allowed for /v1/eligibility.',405,reqId,{code:'METHOD_NOT_ALLOWED',params:{allowedMethod:'POST'}},{Allow:'POST'});
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const eligKey='elig:'+(request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')||'local');
   checkRateLimit(eligKey,'read',env);
   const body=JSON.parse(await requestJson(request));
   if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Request body must be a JSON object.',400,reqId,{code:'INVALID_REQUEST_BODY'});
   return json(evaluateEligibility(body),200,{},reqId);
  }

  // First-Party Cloudflare Workers + D1 Session Refresh & Direct Google/Apple OIDC Sign-In
  if(url.pathname==='/v1/auth/refresh'||((url.pathname==='/v1/auth/oauth/google'||url.pathname==='/v1/auth/oauth/apple')&&request.method!=='DELETE')){
   if(request.method!=='POST')return errorJson('Only POST is allowed for this endpoint.',405,reqId,{code:'METHOD_NOT_ALLOWED',params:{allowedMethod:'POST'}},{Allow:'POST'});
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)throw createApiError('Cross-origin write requests are forbidden.',403,{code:'ORIGIN_FORBIDDEN'});
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   if(!env.DB)return errorJson('Database binding is temporarily unavailable.',503,reqId,{code:'DATABASE_UNAVAILABLE',retryable:true});
   const clientKey='auth:'+(request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')||'local');
   checkRateLimit(clientKey,'auth',env);
   const body=JSON.parse(await requestJson(request));
   if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Request body must be a JSON object.',400,reqId,{code:'INVALID_REQUEST_BODY'});
   if(url.pathname==='/v1/auth/refresh')return json(await hydrateAuthPayloadAvatar(await refreshUserSession(env.DB,env,body,request),url.origin,env),200,{},reqId);
   const provider=url.pathname.endsWith('/google')?'google':'apple';
   const oauthRes=await authenticateSocialOAuth(env.DB,env,provider,body,request);
   return json(await hydrateAuthPayloadAvatar(oauthRes.data,url.origin,env),oauthRes.status,{},reqId);
  }

  const auth=await authenticateRequest(request,env);
  const identity=auth.userId;
  checkRateLimit(identity,request.method==='GET'?'read':'write',env);
  const user=identity;

  if(!env.DB)return errorJson('Database binding is temporarily unavailable.',503,reqId,{code:'DATABASE_UNAVAILABLE',retryable:true});
  if(request.method!=='GET'&&request.method!=='OPTIONS'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)throw createApiError('Cross-origin write requests are forbidden.',403,{code:'ORIGIN_FORBIDDEN'});
  if(!auth.scopes.includes(request.method==='GET'?'coach:read':'coach:write'))throw createApiError('Token lacks required authorization scope.',403,{code:'AUTH_SCOPE_REQUIRED'});

  // Deferred CuraFit Specialist Team Q&A and meal-parsing routes
  if(url.pathname==='/v1/nutrition/ai-parse'||url.pathname==='/v1/coaching/chat'||url.pathname==='/v1/coaching/chat/history'){
   return errorJson('This CuraFit Specialist Team feature is scheduled for an upcoming release.',501,reqId,{code:'FEATURE_DEFERRED_TO_AI_PHASE',params:{feature:url.pathname}});
  }

  // Catalog Reads (require auth)
  if(request.method==='GET'&&url.pathname==='/v1/catalog/manifest')return json({...catalog.manifest,foodCatalog:getFoodCatalogManifest()},200,{},reqId);
  if(request.method==='GET'&&url.pathname==='/v1/catalog/muscles')return json(enrichMuscleCatalog(),200,{},reqId);
  if(request.method==='GET'&&url.pathname==='/v1/exercises'){
   const q=(url.searchParams.get('q')||'').toLowerCase().slice(0,100),muscle=url.searchParams.get('muscle'),equipment=url.searchParams.get('equipment');const offset=cursor(url.searchParams.get('offset'),'offset');
   const found=catalog.exercises.filter(e=>matchesExerciseQuery(e,q)&&(!muscle||e.muscles.some(m=>m.muscle_id===muscle||regionForMuscle(m.muscle_id)===muscle))&&(!equipment||e.equipment.some(x=>x.equipment_id===equipment)));
   return json({total:found.length,items:found.slice(offset,offset+30).map(enrichExercise),nextOffset:offset+30<found.length?offset+30:null},200,{},reqId);
  }
  if(request.method==='GET'&&url.pathname.startsWith('/v1/exercises/')){
   const e=catalog.exercises.find(e=>e.id===decodeURIComponent(url.pathname.slice(14)));
   return e?json(enrichExercise(e),200,{},reqId):errorJson('Exercise not found in catalog.',404,reqId,{code:'EXERCISE_NOT_FOUND'});
  }
  if(request.method==='GET'&&url.pathname==='/v1/pantry/catalog')return json(getPantryCatalog(),200,{},reqId);

  // IMPORTANT: Register specific /v1/foods/* routes BEFORE generic /v1/foods/{id}
  if(request.method==='GET'&&url.pathname==='/v1/foods/recent'){
   const acc=await loadAccount(env.DB,user);
   const tzAcc=acc.profile?.timezone||'Africa/Cairo';
   const todayAcc=localDate(clockNow(),tzAcc);
   const daysWindow=url.searchParams.get('days')==null?14:integer(url.searchParams.get('days'),1,90,'days');
   const limit=url.searchParams.get('limit')==null?30:integer(url.searchParams.get('limit'),1,100,'limit');
   const sinceDate=dateOffset(todayAcc,-(daysWindow-1));
   const dedup=new Map();
   const recentEntries=(acc.foodEntries||[]).filter(e=>e.date&&e.date>=sinceDate&&e.date<=todayAcc).slice().sort((a,b)=>String(b.at||b.date).localeCompare(String(a.at||a.date)));
   for(const e of recentEntries){
    const firstIng=e.snapshot?.ingredients?.[0];
    const dedupKey=e.barcode?`barcode:${e.barcode}`:e.recipeId?`recipe:${e.recipeId}`:firstIng?.key?`ing:${firstIng.key}`:e.mealId?`meal:${e.snapshot?.name||e.mealId}`:`manual:${String(e.snapshot?.name||'').toLowerCase()}`;
    const existing=dedup.get(dedupKey);
    if(existing){
     existing.logCount+=1;
     continue;
    }
    const isGrams=e.source==='ingredient'&&firstIng?.unit!=='reference'||(e.source==='recipe'&&e.recipeUnit==='grams')||e.source==='barcode';
    const isServings=(e.source==='ingredient'&&firstIng?.unit==='reference')||(e.source==='recipe'&&e.recipeUnit!=='grams')||e.source==='planned';
    dedup.set(dedupKey,{
     foodId:firstIng?.food_id||firstIng?.key||null,
     key:firstIng?.key||null,
     barcode:e.barcode||null,
     recipeId:e.recipeId||null,
     name:e.snapshot?.name||'',
     source:e.source,
     grams:isGrams&&e.quantity!=null?Number(e.quantity):null,
     servings:isServings&&e.quantity!=null?Number(e.quantity):null,
     lastLoggedDate:e.date,
     lastLoggedAt:e.at||`${e.date}T12:00:00.000Z`,
     lastSlot:e.slot,
     lastQuantity:e.quantity,
     logCount:1,
     snapshot:e.snapshot,
     macroSnapshot:e.snapshot
    });
   }
   const items=[...dedup.values()].sort((a,b)=>b.logCount-a.logCount||String(b.lastLoggedAt).localeCompare(String(a.lastLoggedAt))).slice(0,limit);
   return json({total:items.length,days:daysWindow,items},200,{},reqId);
  }
  if(request.method==='GET'&&url.pathname==='/v1/foods/favorites'){
   const acc=await loadAccount(env.DB,user);
   const offset=cursor(url.searchParams.get('offset'),'offset');
   const limit=url.searchParams.get('limit')==null?40:integer(url.searchParams.get('limit'),1,100,'limit');
   const all=acc.foodFavorites||[];
   return json({total:all.length,offset,limit,nextOffset:offset+limit<all.length?offset+limit:null,items:all.slice(offset,offset+limit)},200,{},reqId);
  }
  if(request.method==='GET'&&url.pathname.startsWith('/v1/foods/barcode/')){
   if(env?.ENFORCE_PRO_ENTITLEMENTS==='true'){
    const acc=await loadAccount(env.DB,user);
    await requireProOrConsumeQuota(env.DB,acc,user,{feature:'barcode_scanner'},env);
   }
   const ean=decodeURIComponent(url.pathname.slice('/v1/foods/barcode/'.length));
   return json(await lookupBarcode(env.DB,env,ean),200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/foods/barcode'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   if(env?.ENFORCE_PRO_ENTITLEMENTS==='true'){
    const acc=await loadAccount(env.DB,user);
    await requireProOrConsumeQuota(env.DB,acc,user,{feature:'barcode_scanner'},env);
   }
   const body=JSON.parse(await requestJson(request));
   if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Request body must be a JSON object.',400,reqId,{code:'INVALID_REQUEST_BODY'});
   return json(await submitBarcode(env.DB,user,body),201,{},reqId);
  }
  if(request.method==='GET'&&url.pathname==='/v1/foods'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,100);
   const scope=url.searchParams.get('scope')||'all';
   const includeEstimated=url.searchParams.get('includeEstimated')==='true'||url.searchParams.get('status')==='published';
   const offset=cursor(url.searchParams.get('offset'),'offset');
   const limit=url.searchParams.get('limit')==null?40:integer(url.searchParams.get('limit'),1,100,'limit');
   const kind=url.searchParams.get('kind')||null;
   const category=url.searchParams.get('category')||null;
   const res=searchFoodCatalog({q,scope,includeEstimated,offset,limit,kind,category});
   return json(res,200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/foods/calculate'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Request body must be a JSON object.',400,reqId,{code:'INVALID_REQUEST_BODY'});
   return json(calculatePreparedBeverageOrRecipe(body),200,{},reqId);
  }
  if(request.method==='GET'&&url.pathname.startsWith('/v1/foods/')){
   const id=decodeURIComponent(url.pathname.slice(10));
   const item=getFoodCatalogItem(id);
   return item?json(item,200,{},reqId):errorJson('Food item not found.',404,reqId,{code:'FOOD_NOT_FOUND'});
  }
  if(request.method==='GET'&&url.pathname==='/v1/beverages'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,100);
   const includeEstimated=url.searchParams.get('includeEstimated')==='true';
   const offset=cursor(url.searchParams.get('offset'),'offset');
   const limit=url.searchParams.get('limit')==null?40:integer(url.searchParams.get('limit'),1,100,'limit');
   const res=searchFoodCatalog({q,scope:'beverages',includeEstimated,offset,limit});
   return json(res,200,{},reqId);
  }

  // Auth, Session & OAuth Linking Endpoints
  if(request.method==='GET'&&url.pathname==='/v1/auth/session'){
   return json({
    userId:auth.userId,subject:auth.subject,sessionId:auth.sessionId,deviceId:auth.deviceId,
    authMethod:auth.authMethod,isAnonymous:auth.isAnonymous,scopes:auth.scopes,
    entitlement:auth.entitlement,issuedAt:auth.issuedAt,expiresAt:auth.expiresAt
   },200,{},reqId);
  }
  if(request.method==='GET'&&url.pathname==='/v1/auth/oauth/providers'){
   return json({items:await listLinkedProviders(env.DB,identity)},200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/auth/oauth/link'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Request body must be a JSON object.',400,reqId,{code:'INVALID_REQUEST_BODY'});
   return json(await linkOAuthProvider(env.DB,env,identity,body.provider,body),200,{},reqId);
  }
  if(request.method==='DELETE'&&url.pathname.startsWith('/v1/auth/oauth/')){
   const provider=decodeURIComponent(url.pathname.slice('/v1/auth/oauth/'.length));
   return json(await unlinkOAuthProvider(env.DB,identity,provider),200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/auth/revoke'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   const targetSession=body?.allDevices===true?'__all__':(body?.sessionId||auth.sessionId);
   if(body?.allDevices!==true&&(typeof targetSession!=='string'||!targetSession||targetSession.length>200||targetSession.startsWith('__')))throw createApiError('Invalid sessionId parameter.',400,{code:'INVALID_SESSION_ID'});
   const nowIso=new Date().toISOString();
   await env.DB.prepare('INSERT OR REPLACE INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)').bind(identity,String(targetSession),auth.deviceId||'manual',nowIso,null,nowIso).run();
   await revokeRefreshTokensForSession(env.DB,identity,targetSession,nowIso);
   if(body?.allDevices===true)await deleteAllPushTokens(env.DB,identity);
   return json({revoked:true,sessionId:targetSession,revokedAt:nowIso},200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/auth/logout'){
   const rawBody=request.body?await requestJson(request).catch(e=>{if(e?.code==='EMPTY_BODY')return '';throw e;}):'';
   if(rawBody.trim()&&!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=rawBody.trim()?JSON.parse(rawBody):{};
   if(!body||typeof body!=='object'||Array.isArray(body))return errorJson('Request body must be a JSON object.',400,reqId,{code:'INVALID_REQUEST_BODY'});
   return json(await logoutUserSession(env.DB,auth,body),200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/auth/claim-anonymous'){
   if(auth.isAnonymous)throw createApiError('Sign in with a verified account to claim an anonymous session.',403,{code:'CLAIM_REQUIRES_VERIFIED_ACCOUNT'});
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   if(!body||body.consent!==true||typeof body.anonymousUserId!=='string'||!body.anonymousUserId.startsWith('anon:'))throw createApiError('Explicit consent and a valid anon: user ID are required to claim data.',400,{code:'INVALID_CLAIM_REQUEST'});
   const anonId=body.anonymousUserId;
   if(request.headers.get('x-anonymous-cookie-uid')!==anonId)throw createApiError('Proof of ownership for the anonymous session cookie is required.',403,{code:'ANONYMOUS_OWNERSHIP_REQUIRED'});
   const claimedCheck=await env.DB.prepare('SELECT revoked_at FROM coaching_auth_sessions WHERE user_id=? AND session_id=?').bind(anonId,'__claimed__').first();
   if(claimedCheck?.revoked_at)throw createApiError('Anonymous session has already been claimed.',409,{code:'ANONYMOUS_ALREADY_CLAIMED'});
   const anonRow=await env.DB.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(anonId).first();
   if(!anonRow)throw createApiError('No stored account data found for the specified anonymous session.',404,{code:'ANONYMOUS_ACCOUNT_NOT_FOUND'});
   const targetRow=await env.DB.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(identity).first();
   if(targetRow&&JSON.parse(targetRow.body)?.profile)throw createApiError('Authenticated account already has a profile; specify a merge policy.',409,{code:'TARGET_ACCOUNT_NOT_EMPTY'});
   const anonState=await loadAccount(env.DB,anonId);
   anonState.revision=(targetRow?.revision||0)+1;
   await saveAccount(env.DB,identity,anonState,targetRow?.revision||0,{key:'claim-'+anonId,digest:'claim',action:'claim_anonymous',claimSource:{userId:anonId,revision:anonRow.revision}});
   const clearSecure = url.protocol === 'https:' ? '; Secure' : '';
   return json({claimed:true,fromAnonymousId:anonId,toUserId:identity,revision:anonState.revision},200,{'Set-Cookie':`coach_uid=; Path=/; Max-Age=0; HttpOnly${clearSecure}; SameSite=Lax`},reqId);
  }

  // Push Token Management
  if(request.method==='POST'&&url.pathname==='/v1/devices/push-token'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   return json(await registerPushToken(env.DB,user,body),200,{},reqId);
  }
  if(request.method==='DELETE'&&url.pathname==='/v1/devices/push-token'){
   const qDeviceId=url.searchParams.get('deviceId');
   let body={deviceId:qDeviceId};
   if(!qDeviceId){
    const rawBody=await request.text();
    if(rawBody.trim())body=JSON.parse(rawBody);
   }
   return json(await deletePushToken(env.DB,user,body),200,{},reqId);
  }

  // Support Feedback
  if(request.method==='POST'&&url.pathname==='/v1/support/feedback'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   const category=String(body?.category||'').trim().slice(0,60);
   const message=String(body?.message||'').trim();
   if(!category||!message||message.length>2000)throw createApiError('Support feedback requires a valid category and message (1..2000 characters).',400,{code:'INVALID_SUPPORT_FEEDBACK'});
   const ticketId=`tkt_${crypto.randomUUID()}`;
   const now=isoNow();
   const diagnostics=body?.includeDiagnostics?{foodOrExerciseId:body.foodOrExerciseId||null,appVersion:body.appVersion||null,platform:body.platform||null,locale:body.locale||null,engineVersion:body.engineVersion||'0.14.0',lastRequestId:body.lastRequestId||null}:null;
   await env.DB.prepare('INSERT INTO coaching_support_tickets(ticket_id,user_id,category,message,diagnostics_json,created_at) VALUES(?,?,?,?,?,?)').bind(ticketId,user,category,message,diagnostics?JSON.stringify(diagnostics):null,now).run();
   return json({ticketId,receivedAt:now},201,{},reqId);
  }

  // Profile Avatar (binary/multipart bypasses 40KB JSON cap)
  if(request.method==='POST'&&url.pathname==='/v1/profile/avatar'){
   return json(await uploadProfileAvatar(request,env,env.DB,user,url.origin),200,{},reqId);
  }
  if(request.method==='DELETE'&&url.pathname==='/v1/profile/avatar'){
   return json(await deleteProfileAvatar(env,env.DB,user),200,{},reqId);
  }

  // Account Privacy, Consents, Export & Deletion Endpoints
  if(request.method==='GET'&&url.pathname==='/v1/account/consents'){
   return json({items:await listUserConsents(env.DB,user)},200,{},reqId);
  }
  if(request.method==='GET'&&url.pathname==='/v1/account/export'){
   const [mediaRefs,entitlements]=await Promise.all([
    exportSignedMediaRefs(env.DB,env,user,url.origin),
    resolveEntitlements(env.DB,null,user,null,env)
   ]);
   const exported=await exportFullAccountData(env.DB,user,{
    signedAvatarUrl:mediaRefs.avatarUrl,
    signedProgressPhotos:mediaRefs.progressPhotos,
    entitlements
   });
   return json(exported,200,{},reqId);
  }
  if((request.method==='POST'||request.method==='DELETE')&&url.pathname==='/v1/account/delete'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   if(body?.confirm!==true)throw createApiError('Permanent account deletion requires confirm: true.',400,{code:'DELETE_CONFIRMATION_REQUIRED'});
   // Safe deletion order: (1) Snapshot R2 keys, Apple token & anonymized trial tombstones -> (2) Atomic D1 deletion -> (3) Best-effort R2 & Apple cleanup
   const mediaKeys=await collectUserMediaKeys(env.DB,user);
   let appleEnc=null;
   try{
    const row=await env.DB.prepare("SELECT apple_refresh_token_enc FROM coaching_oauth_identities WHERE user_id=? AND provider='apple' AND apple_refresh_token_enc IS NOT NULL LIMIT 1").bind(user).first();
    appleEnc=row?.apple_refresh_token_enc||null;
   }catch{}
   await recordTrialTombstones(env.DB,user);
   const res=await deleteFullAccountData(env.DB,user);
   const [mediaPurge,appleRevoke]=await Promise.all([
    purgeMediaKeys(env,mediaKeys),
    revokeAppleTokenOnDelete(null,env,user,appleEnc)
   ]);
   return json({...res,appleTokenRevoked:appleRevoke.revoked,mediaObjectsDeleted:mediaPurge.objectsDeleted},200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/account/consents'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   const nowIso=new Date().toISOString();
   if(Array.isArray(body?.items)){
    if(body.items.length<1||body.items.length>10)throw createApiError('Consent items batch must contain between 1 and 10 entries.',400,{code:'INVALID_CONSENT_PAYLOAD'});
    const stmts=[];
    const recorded=[];
    for(const item of body.items){
     if(!item||typeof item.consentType!=='string'||typeof item.version!=='string'||typeof item.accepted!=='boolean')throw createApiError('Consent payload requires string consentType, string version, and boolean accepted.',400,{code:'INVALID_CONSENT_PAYLOAD'});
     const ct=item.consentType.slice(0,60),ver=item.version.slice(0,30);
     stmts.push(env.DB.prepare('INSERT OR REPLACE INTO coaching_account_consents(user_id,consent_type,version,accepted,at) VALUES(?,?,?,?,?)').bind(user,ct,ver,item.accepted?1:0,nowIso));
     recorded.push({consentType:ct,version:ver,accepted:item.accepted,at:nowIso,recordedAt:nowIso});
    }
    await env.DB.batch(stmts);
    return json({items:recorded,consents:recorded,recordedAt:nowIso},200,{},reqId);
   }
   if(!body||typeof body.consentType!=='string'||typeof body.version!=='string'||typeof body.accepted!=='boolean')throw createApiError('Consent payload requires string consentType, string version, and boolean accepted.',400,{code:'INVALID_CONSENT_PAYLOAD'});
   await env.DB.prepare('INSERT OR REPLACE INTO coaching_account_consents(user_id,consent_type,version,accepted,at) VALUES(?,?,?,?,?)').bind(user,body.consentType.slice(0,60),body.version.slice(0,30),body.accepted?1:0,nowIso).run();
   return json({consentType:body.consentType,version:body.version,accepted:body.accepted,at:nowIso,recordedAt:nowIso},200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/account/backfill'){
   const res=await backfillAccountToNormalizedTables(env.DB,user);
   return json(res,200,{},reqId);
  }

  const s=await loadAccount(env.DB,user);
  const tz=s.profile?.timezone||'Africa/Cairo';
  const currDate=localDate(clockNow(),tz);
  const etag=`W/"rev-${s.revision}-${currDate}"`;

  // Progress Photos (R2-backed; GET & DELETE remain accessible for downgraded Free users, only upload-url is Pro-gated)
  if(request.method==='GET'&&url.pathname==='/v1/progress/photos'){
   const offset=cursor(url.searchParams.get('offset'),'offset');
   const limit=url.searchParams.get('limit')==null?30:integer(url.searchParams.get('limit'),1,100,'limit');
   return json(await listProgressPhotos(env.DB,env,user,url.origin,{offset,limit}),200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/progress/photos/upload-url'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   if(env?.ENFORCE_PRO_ENTITLEMENTS==='true'){
    await requireProOrConsumeQuota(env.DB,s,user,{feature:'progress_photos_cloud'},env);
   }
   const body=JSON.parse(await requestJson(request));
   return json(await createProgressPhotoUploadUrl(env,user,url.origin,body),200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/progress/photos/confirm'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   return json(await confirmProgressPhoto(env.DB,env,user,url.origin,body),201,{},reqId);
  }
  if(request.method==='DELETE'&&url.pathname.startsWith('/v1/progress/photos/')){
   const photoId=decodeURIComponent(url.pathname.slice('/v1/progress/photos/'.length));
   return json(await deleteProgressPhoto(env.DB,env,user,photoId),200,{},reqId);
  }

  // Subscriptions & Offerings
  if(request.method==='GET'&&url.pathname==='/v1/subscriptions/offerings'){
   const ent=await resolveEntitlements(env.DB,s,user,currDate,env);
   return json(getSubscriptionOfferings(url.searchParams.get('platform')||'android',url.searchParams.get('region')||s.preferences?.region||'egypt',ent.trialEligible),200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/subscriptions/verify'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   return json(await verifyStoreSubscription(env.DB,env,s,user,body),200,{},reqId);
  }
  if(request.method==='POST'&&url.pathname==='/v1/subscriptions/restore'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   return json(await restoreStoreSubscriptions(env.DB,env,s,user,body),200,{},reqId);
  }

  // Pantry Alternatives (Free)
  if(request.method==='POST'&&url.pathname==='/v1/pantry/alternatives'){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const body=JSON.parse(await requestJson(request));
   return json(getPantryAlternatives(s,body),200,{},reqId);
  }

  if(request.method==='GET'){
   if(url.pathname==='/v1/bootstrap'){
    const [consents,entitlements,userRow]=await Promise.all([
     listUserConsents(env.DB,user),
     resolveEntitlements(env.DB,s,user,currDate,env),
     env.DB.prepare('SELECT avatar_url FROM coaching_users WHERE user_id=?').bind(user).first().catch(()=>null)
    ]);
    const rawAvatar=userRow?.avatar_url??s.profile?.avatarUrl??null;
    const signedAvatarUrl=await signAvatarUrlIfNeeded(url.origin,rawAvatar,user,env);
    const bootPayload=presentBootstrap(s,{consents,entitlements,signedAvatarUrl,pushConfigured:hasPushConfigured(env)});
    const fp=await sha256Hex(JSON.stringify([
     s.revision,currDate,entitlements.tier,entitlements.status,entitlements.updatedAt,
     consents.map(c=>`${c.consentType}:${c.accepted}:${c.at}`),
     rawAvatar||'',bootPayload.todaySummary?.recovery?.status||'',
     bootPayload.todaySummary?.fastingState?.phase||'',
     bootPayload.todaySummary?.seasonalContext?.mode||'standard',
     bootPayload.pendingAdaptations?.length||0,
     bootPayload.unreadCoachingInboxCount||0
    ]));
    const bootEtag=`W/"boot-${s.revision}-${currDate}-${fp.slice(0,12)}"`;
    if(request.headers.get('If-None-Match')===bootEtag)return new Response(null,{status:304,headers:{...SECURITY_HEADERS,ETag:bootEtag,'X-Request-Id':reqId}});
    return json(bootPayload,200,{ETag:bootEtag},reqId);
   }
   if(url.pathname==='/v1/state'){
    if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:{...SECURITY_HEADERS,ETag:etag,'X-Request-Id':reqId}});
    return json(present(s),200,{ETag:etag},reqId);
   }
   if(url.pathname==='/v1/progress/summary')return json(progressSummary(s),200,{ETag:etag},reqId);
   if(url.pathname==='/v1/progress/analytics'){
    const rangeParam=url.searchParams.get('range')||'30d';
    if(env?.ENFORCE_PRO_ENTITLEMENTS==='true'&&(rangeParam==='90d'||rangeParam==='all')){
     await requireProOrConsumeQuota(env.DB,s,user,{feature:'advanced_analytics'},env);
    }
    return json(computeProgressAnalytics(s,{range:rangeParam,exerciseId:url.searchParams.get('exerciseId')||null},clockNow()),200,{ETag:etag},reqId);
   }
   if(url.pathname==='/v1/progress/weekly-wrapped')return json(computeWeeklyWrapped(s,url.searchParams.get('weekEnd')||null,clockNow()),200,{ETag:etag},reqId);
   if(url.pathname==='/v1/widgets/snapshot'){
    const snapFasting=getFastingState(s,clockNow());
    const widgetEtag=`W/"rev-${s.revision}-${currDate}-${snapFasting.phase}-${snapFasting.seasonalContext?.mode||'standard'}"`;
    if(request.headers.get('If-None-Match')===widgetEtag)return new Response(null,{status:304,headers:{...SECURITY_HEADERS,ETag:widgetEtag,'X-Request-Id':reqId}});
    return json(buildWidgetSnapshot(s,clockNow()),200,{ETag:widgetEtag},reqId);
   }
   if(url.pathname==='/v1/measurements')return json(paginateDateCollection(s.bodyMeasurements||[],url),200,{},reqId);
   if(url.pathname==='/v1/recipes')return json(listCustomRecipes(s,{offset:url.searchParams.get('offset'),limit:url.searchParams.get('limit'),q:url.searchParams.get('q')}),200,{},reqId);
   if(url.pathname==='/v1/cardio-logs')return json(listCardioLogs(s,{from:url.searchParams.get('from'),to:url.searchParams.get('to'),offset:url.searchParams.get('offset'),limit:url.searchParams.get('limit')}),200,{},reqId);
   if(url.pathname==='/v1/cycle/state')return json(computeCycleState(s,clockNow()),200,{},reqId);
   if(url.pathname==='/v1/workouts/prs')return json(computeWorkoutPrs(s,{since:url.searchParams.get('since')||null,exerciseId:url.searchParams.get('exerciseId')||null}),200,{},reqId);
   if(url.pathname==='/v1/workouts/split-review'){
    const readyState=accountRecovery(s,clockNow(),tz);
    const reviewRes=splitReview({...s,recovery:readyState},currDate);
    return json(reviewRes?{due:true,...reviewRes}:{due:false,kind:'not_due',code:'SPLIT_REVIEW_NOT_DUE',params:{},text:'8-week Full Body split review is available after 8 weeks and 16+ completed workouts on a 4+ day Full Body program.'},200,{},reqId);
   }
   if(url.pathname==='/v1/nutrition/fasting-state')return json(getFastingState(s,clockNow()),200,{},reqId);
   if(url.pathname==='/v1/coaching/inbox')return json(coachingInbox(s,clockNow(),{pushConfigured:hasPushConfigured(env)}),200,{},reqId);
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
    const from=url.searchParams.get('from');
    const to=url.searchParams.get('to');
    if(from||to){
     const startDate=from||dateOffset(to||currDate,-6);
     const endDate=to||currDate;
     if(!validDate(startDate)||!validDate(endDate)||startDate>endDate)throw createApiError('Invalid date range query parameters; expected from <= to in YYYY-MM-DD.',400,{code:'INVALID_DATE_RANGE',params:{field:'from'}});
     const spanDays=Math.floor((Date.parse(`${endDate}T12:00:00Z`)-Date.parse(`${startDate}T12:00:00Z`))/86400000)+1;
     if(spanDays>62)throw createApiError('Food diary range queries are capped at 62 days.',400,{code:'INVALID_DATE_RANGE',params:{field:'to'}});
     const days=[];
     for(let d=startDate;d<=endDate;d=dateOffset(d,1))days.push(dayTotals(s,d));
     return json({from:startDate,to:endDate,days},200,{},reqId);
    }
    const date=url.searchParams.get('date')||currDate;
    if(!validDate(date))throw createApiError('Invalid calendar date format; expected YYYY-MM-DD.',400,{code:'INVALID_DATE',params:{field:'date'}});
    return json(dayTotals(s,date),200,{},reqId);
   }
   if(url.pathname==='/v1/water-logs')return json(paginateDateCollection(s.waterLogs,url),200,{},reqId);
   if(url.pathname==='/v1/weight-logs')return json(paginateDateCollection(s.weights,url),200,{},reqId);
   if(url.pathname==='/v1/workout-logs'){
    const exFilter=url.searchParams.get('exerciseId');
    const filteredLogs=exFilter?(s.workoutLogs||[]).filter(l=>l.exerciseId===exFilter):s.workoutLogs;
    return json(paginateDateCollection(filteredLogs,url),200,{},reqId);
   }
   if(url.pathname==='/v1/sessions')return json(paginateDateCollection(s.sessions,url),200,{},reqId);
   if(url.pathname==='/v1/checkins')return json(paginateDateCollection(s.checkins,url),200,{},reqId);
   if(url.pathname==='/v1/activity-logs')return json(paginateDateCollection(s.activityLogs,url),200,{},reqId);
   if(url.pathname==='/v1/notifications/preferences')return json(s.notificationPreferences||{},200,{},reqId);
   if(url.pathname==='/v1/entitlements')return json(await resolveEntitlements(env.DB,s,user,currDate,env),200,{},reqId);
   if(url.pathname==='/v1/meal-alternatives')return json({items:mealAlternatives(s,url.searchParams.get('mealId'))},200,{},reqId);
   if(url.pathname==='/v1/exercise-alternatives')return json({items:exerciseAlternatives(s,url.searchParams.get('dayIndex'),url.searchParams.get('exerciseId')).map(enrichExercise)},200,{},reqId);
   if(url.pathname==='/v1/plans')return json({items:s.planRefs||[]},200,{},reqId);
   if(url.pathname.startsWith('/v1/plans/')){
    const rest=url.pathname.slice(10);
    const groceryMatch=rest.match(/^([^/]+)\/grocery-list$/);
    const dayMatch=rest.match(/^([^/]+)\/days\/(\d{4}-\d{2}-\d{2})$/);
    const id=decodeURIComponent(groceryMatch?groceryMatch[1]:(dayMatch?dayMatch[1]:rest));
    let plan=s.plans.find(p=>p.id===id);
    if(!plan){
     const row=await env.DB.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(user,id).first();
     if(row)plan=JSON.parse(row.body);
    }
    if(!plan)return errorJson('Nutrition plan not found.',404,reqId,{code:'PLAN_NOT_FOUND'});
    if(groceryMatch){
     const isPreview=url.searchParams.get('preview')==='true';
     if(env?.ENFORCE_PRO_ENTITLEMENTS==='true'&&!isPreview){
      await requireProOrConsumeQuota(env.DB,s,user,{feature:'grocery_list'},env);
     }
     const daysScope=url.searchParams.get('days')||'all';
     return json(getPlanGroceryList(s,plan,daysScope,currDate,{preview:isPreview}),200,{},reqId);
    }
    if(dayMatch){
     const day=plan.days.find(d=>d.date===dayMatch[2]);
     return day?json({planId:plan.id,targets:day.targets||plan.targets,day},200,{},reqId):errorJson('Specified calendar day not found in nutrition plan.',404,reqId,{code:'PLAN_DAY_NOT_FOUND'});
    }
    return json(plan,200,{},reqId);
   }
   if(url.pathname==='/v1/workout-plans')return json({items:s.workoutPlanRefs||[]},200,{},reqId);
   if(url.pathname.startsWith('/v1/workout-plans/')){
    const id=decodeURIComponent(url.pathname.slice(18));
    if(s.workoutPlan?.id===id)return json(enrichWorkoutPlan(s.workoutPlan),200,{},reqId);
    const row=await env.DB.prepare('SELECT body FROM coaching_workout_plans WHERE user_id=? AND plan_id=?').bind(user,id).first();
    return row?json(enrichWorkoutPlan(JSON.parse(row.body)),200,{},reqId):errorJson('Workout plan not found.',404,reqId,{code:'WORKOUT_PLAN_NOT_FOUND'});
   }
   if(url.pathname==='/v1/sync/changes'){
    const after=cursor(url.searchParams.get('after'),'after');
    const afterSeq=url.searchParams.get('afterSeq')==null?null:cursor(url.searchParams.get('afterSeq'),'afterSeq');
    const useSeqFilter=afterSeq!=null&&afterSeq>0;
    const rows=await env.DB.prepare('SELECT revision,action,at FROM coaching_changes WHERE user_id=? AND revision>? ORDER BY revision LIMIT 100').bind(user,after).all();
    let deltas=[];
    let nextSeqCursor=afterSeq||0;
    let hasMoreDeltas=false;
    try{
     const outboxSql='SELECT seq,revision,entity_type,entity_id,op,at,payload FROM coaching_sync_outbox WHERE user_id=? AND '+(useSeqFilter?'seq>?':'revision>?')+' ORDER BY seq LIMIT 100';
     const outboxRows=await env.DB.prepare(outboxSql).bind(user,useSeqFilter?afterSeq:after).all();
     deltas=(outboxRows?.results||[]).map(r=>({
      seq:r.seq,revision:r.revision,entityType:r.entity_type,entityId:r.entity_id,op:r.op,at:r.at,payload:JSON.parse(r.payload)
     }));
     if(deltas.length)nextSeqCursor=deltas.at(-1).seq;
     hasMoreDeltas=deltas.length===100;
    }catch(error){if(!/no such table/i.test(error.message||''))throw error;}
    return json({
     items:rows.results,deltas,currentRevision:s.revision,
     nextCursor:rows.results.at(-1)?.revision||after,nextSeqCursor,
     hasMore:rows.results.length===100||hasMoreDeltas,resyncRequired:after>s.revision
    },200,{},reqId);
   }
  }

  if(request.method==='POST'&&url.pathname==='/v1/wearables/ingest'){
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return errorJson('Cross-origin write requests are forbidden.',403,reqId,{code:'ORIGIN_FORBIDDEN'});
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});
   const raw=await requestJson(request);
   const body=JSON.parse(raw);
   const key=request.headers.get('Idempotency-Key')||`wearable-${await canonicalCommandDigest(body)}`;
   if(!body||typeof body!=='object'||!Array.isArray(body.records)||body.records.length>100)return errorJson('Wearables payload must contain a records array with at most 100 items.',400,reqId,{code:'INVALID_WEARABLES_BATCH'});
   const digest=await canonicalCommandDigest(body);
   const prior=await env.DB.prepare('SELECT digest,response FROM coaching_requests WHERE user_id=? AND request_key=?').bind(user,key).first();
   if(prior){if(prior.digest!==digest)throw createApiError('Idempotency-Key was already used with a different request payload.',409,{code:'IDEMPOTENCY_KEY_REUSED_MISMATCH'});return json({...JSON.parse(prior.response),replayed:true},200,{'Idempotency-Replayed':'true'},reqId);}
   let next=structuredClone(s);
   let ingested=0;
   const skippedRecords=[];
   for(let i=0;i<body.records.length;i++){
    const rec=body.records[i];
    try{
     if(rec.type==='weight'){
      next=command(next,'weight',{date:rec.date,kg:rec.kg,source:rec.source||'wearable',externalRecordId:rec.externalRecordId||null,protectManual:true});
      if(!next._weightSkipped)ingested++;
      else skippedRecords.push({index:i,type:'weight',reason:'manual_or_duplicate_protected'});
     }else if(rec.type==='steps'||rec.type==='activity'){
      const beforeCount=(next.activityLogs||[]).length;
      const alreadyHad=rec.externalRecordId&&(next.activityLogs||[]).some(x=>x.externalRecordId===rec.externalRecordId);
      if(!alreadyHad){
       next=command(next,'activity',{date:rec.date,steps:rec.steps,activeEnergyKcal:rec.activeEnergyKcal,source:rec.source||'wearable',externalRecordId:rec.externalRecordId,preservePending:true});
       if((next.activityLogs||[]).length>=beforeCount)ingested++;
      }else{
       skippedRecords.push({index:i,type:rec.type,reason:'duplicate_external_record_id'});
      }
     }else if(rec.type==='cardio'){
      const alreadyHad=rec.externalRecordId&&(next.cardioLogs||[]).some(x=>x.externalRecordId===rec.externalRecordId);
      if(!alreadyHad){
       next=command(next,'cardio_log',{date:rec.date,modality:rec.modality,durationMinutes:rec.durationMinutes,intensity:rec.intensity||'moderate',distanceKm:rec.distanceKm,caloriesKcal:rec.caloriesKcal,notes:rec.notes,source:rec.source==='apple_health'?'apple_health':'health_connect',externalRecordId:rec.externalRecordId||null});
       ingested++;
      }else{
       skippedRecords.push({index:i,type:'cardio',reason:'duplicate_external_record_id'});
      }
     }
    }catch(recErr){
     skippedRecords.push({index:i,type:rec?.type||'unknown',code:recErr?.code||'VALIDATION_ERROR',reason:recErr?.message||'Record skipped'});
    }
   }
   if(ingested>0){
    // Preserve pending Coach adaptations across background wearable syncs so user approvals never fail with 409
    next.adaptations=structuredClone(s.adaptations||[]);
    for(const a of next.adaptations)if(a.status==='pending'&&a.baseRevision===s.revision)a.baseRevision=s.revision+1;
    next.revision=s.revision+1;
    await saveAccount(env.DB,user,next,s.revision,{key,digest,action:'wearable_ingest',payload:{count:ingested},previousState:s});
   }
   return json({revision:ingested>0?next.revision:s.revision,ingested,skippedCount:skippedRecords.length,skippedRecords},200,{},reqId);
  }

  if(request.method!=='POST'||url.pathname!=='/v1/commands')return errorJson('API endpoint not found.',404,reqId,{code:'ROUTE_NOT_FOUND'});
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return errorJson('Cross-origin write requests are forbidden.',403,reqId,{code:'ORIGIN_FORBIDDEN'});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return errorJson('Content-Type must be application/json.',415,reqId,{code:'UNSUPPORTED_MEDIA_TYPE'});

  const raw=await requestJson(request);
  const body=JSON.parse(raw),key=request.headers.get('Idempotency-Key');
  if(!body||Array.isArray(body)||typeof body.action!=='string'||!Number.isSafeInteger(body.revision)||body.revision<0||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return errorJson('Command body must include integer revision >= 0, string action, and object payload.',400,reqId,{code:'INVALID_COMMAND_ENVELOPE'});
  if(!key||key.length>100)return errorJson('Idempotency-Key header (1..100 characters) is required.',400,reqId,{code:'IDEMPOTENCY_KEY_REQUIRED'});

  // Enforce withdrawn health_data_processing consent lock on personalized calculation & cycle health commands
  if(['generate','review','adaptation','renew_plan','comeback_restart','cycle_settings','cycle_log','cycle_gentle_session'].includes(body.action)&&await isHealthConsentWithdrawn(env.DB,user)){
   return errorJson('Active health_data_processing consent is required to generate plans or compute coaching reviews.',403,reqId,{code:'HEALTH_CONSENT_REQUIRED'});
  }

  // Idempotency digest excludes `revision` so timeout + rebase replay succeeds cleanly while still recognizing legacy digests.
  const rawDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const legacyCanonDigest=await canonicalCommandDigest(body);
  const intentDigest=await canonicalCommandDigest({action:body.action,payload:body.payload});

  const previous=await env.DB.prepare('SELECT digest,response FROM coaching_requests WHERE user_id=? AND request_key=?').bind(user,key).first();
  if(previous){
   if(previous.digest!==intentDigest&&previous.digest!==rawDigest&&previous.digest!==legacyCanonDigest){
    return errorJson('Idempotency-Key was already used with a different request payload.',409,reqId,{code:'IDEMPOTENCY_KEY_REUSED_MISMATCH',currentRevision:s.revision});
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
   return errorJson('Account state has changed; sync and retry with the latest revision.',409,reqId,{
    code:'REVISION_CONFLICT',
    params:{expectedRevision:body.revision,currentRevision:s.revision},
    currentRevision:s.revision,
    mergeHints:{
     expectedRevision:body.revision,
     serverRevision:s.revision,
     syncChangesEndpoint:`/v1/sync/changes?after=${body.revision}`,
     resolutionPolicy:'fetch_sync_deltas_then_rebase_or_retry'
    }
   });
  }

  if(body.action==='streak_freeze'&&s.profile){
   const {streakSummary}=computeStreakAndEngagement(s,clockNow());
   const targetDate=body.payload?.date||currDate;
   const targetMs=Date.parse(targetDate+'T12:00:00Z');
   if(Number.isFinite(targetMs)&&(streakSummary.autoAppliedFreezes||[]).some(d=>Math.abs(Date.parse(d+'T12:00:00Z')-targetMs)<7*86400000)){
    throw createApiError('Weekly streak freeze allowance has already been used.',409,{code:'STREAK_FREEZE_UNAVAILABLE'});
   }
  }
  const next=command(structuredClone(s),body.action,body.payload);

  // Server-side Free Quota & Pro Entitlement Enforcement AFTER domain validation succeeds
  // so invalid/rejected commands never burn a Free user's quota (safety actions are ALWAYS 100% Free!)
  if(env?.ENFORCE_PRO_ENTITLEMENTS==='true'){
   if(body.action==='replace_meal'){
    await requireProOrConsumeQuota(env.DB,s,user,{feature:'unlimited_meal_swaps',quotaKey:'meal_swap',windowKey:currDate,freeLimit:2},env);
   }else if(body.action==='replace_exercise'){
    const isSafetySwap=workoutSafetyIssues(s).some(x=>x.dayIndex===Number(body.payload?.dayIndex)&&x.exerciseId===body.payload?.exerciseId);
    if(!isSafetySwap){
     await requireProOrConsumeQuota(env.DB,s,user,{feature:'unlimited_exercise_swaps',quotaKey:'exercise_swap',windowKey:isoWeekKeyForDate(currDate),freeLimit:2},env);
    }
   }else if(body.action==='renew_plan'){
    if(body.payload?.earlyRenew===true){
     await requireProOrConsumeQuota(env.DB,s,user,{feature:'unlimited_plan_renewals'},env);
    }else{
     await requireProOrConsumeQuota(env.DB,s,user,{feature:'unlimited_plan_renewals',quotaKey:'plan_renewal',windowKey:'lifetime',freeLimit:1},env);
    }
   }else if(body.action==='adaptation'&&body.payload?.accept===true){
    const targetAdapt=(s.adaptations||[]).find(a=>a.id===body.payload?.id&&a.status==='pending');
    if(targetAdapt&&['calories','weekly_volume','maintenance'].includes(targetAdapt.kind)){
     await requireProOrConsumeQuota(env.DB,s,user,{feature:'adaptive_calorie_volume'},env);
    }
   }
  }

  if(['recovery','weight','food','food_entry','food_entry_batch','food_entry_update','food_complete','food_delete','copy_meal','session','session_delete','workout','workout_delete','coaching_feedback','renew_plan','comeback_restart','timezone','confirm_health','confirm_schedule'].includes(body.action)){
   review(next);
   if(next.lastReview)next.lastReview.auto=true;
  }
  if(body.action==='review'||body.action==='coaching_feedback'){
   next.lastWeeklyCheckinAt=next.lastReview?.at||isoNow();
  }
  reconcileCoaching(next,clockNow());
  if(['water','steps','activity','notification_preferences','workout_ui_mode','profile_update','food_favorite','grocery_toggle','fasting_log','ramadan_mode','seasonal_flex','cycle_gentle_session','body_measurement','streak_freeze','recipe_save','recipe_delete','cardio_log','cardio_delete','cycle_settings','cycle_log','ad_hoc_exercise'].includes(body.action))next.adaptations=structuredClone(s.adaptations);
  if(['water','steps','activity','notification_preferences','workout_ui_mode','profile_update','food_favorite','grocery_toggle','fasting_log','ramadan_mode','seasonal_flex','cycle_gentle_session','body_measurement','streak_freeze','recipe_save','recipe_delete','cardio_log','cardio_delete','cycle_settings','cycle_log','ad_hoc_exercise','coaching_ack','coaching_decision','coaching_outcome'].includes(body.action))for(const a of next.adaptations)if(a.status==='pending'&&a.baseRevision===s.revision)a.baseRevision=s.revision+1;
  next.revision=s.revision+1;
  await saveAccount(env.DB,user,next,s.revision,{key,digest:intentDigest,action:body.action,payload:body.payload,previousState:s});
  if(body.action==='profile_update'&&body.payload?.name!==undefined&&next.profile?.name){
   await env.DB.prepare('UPDATE coaching_users SET display_name=?, updated_at=? WHERE user_id=?').bind(next.profile.name,isoNow(),user).run().catch(()=>{});
  }

  if(wantsMinimalResponse(request,url)){
   return json(presentReceipt(next,body.action,body.payload,false),200,{ETag:`W/"rev-${next.revision}"`},reqId);
  }
  return json(present({...next,plans:next.plans.filter(p=>p.id===next.active_plan_id)}),200,{ETag:`W/"rev-${next.revision}"`},reqId);
 }catch(error){
  if(!error.status&&(error instanceof TypeError||error instanceof ReferenceError)){
   logEvent('error','unhandled_runtime_error',{requestId:reqId,path:url.pathname,method:request.method,status:500,details:{name:error.name}});
   return errorJson('Unexpected internal server error; retry shortly.',500,reqId,{code:'INTERNAL_ERROR',retryable:true});
  }
  if(/D1_ERROR|SQLITE|no such table/i.test(error.message||'')){
   logEvent('error','database_operation_failed',{requestId:reqId,path:url.pathname,method:request.method,status:503});
   return errorJson('Unable to persist data right now; retry shortly.',503,reqId,{code:'DATABASE_ERROR',retryable:true});
  }
  const status=error.status||400;
  const msg=error instanceof SyntaxError?'Malformed JSON request body.':error.message||'The request payload failed validation.';
  const extraHeaders=status===429&&error.params?.retryAfterSeconds?{'Retry-After':String(error.params.retryAfterSeconds)}:{};
  return errorJson(msg,status,reqId,{
   code:error.code||(error instanceof SyntaxError?'INVALID_JSON':undefined),
   params:error.params,
   fieldErrors:error.fieldErrors,
   retryable:error.retryable,
   details:error.details,
   currentRevision:error.currentRevision,
   mergeHints:error.mergeHints
  },extraHeaders);
 }
}};
