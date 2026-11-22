import {empty,normalize} from './coaching.mjs';
import {localDate,dateOffset} from '../coaching-shared.mjs';
import {apiError} from '../coaching-error.mjs';

const reference=p=>({id:p.id,start_date:p.start_date,end_date:p.days.at(-1)?.date,created_at:p.created_at,effective_from:p.effective_from,energy:p.targets.energy,reason:p.changeReason||'Initial plan',parent_id:p.parent_id});

export function canonicalJson(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(v=>canonicalJson(v===undefined?null:v)).join(',')+']';
 const keys=Object.keys(value).filter(k=>value[k]!==undefined).sort();
 return '{'+keys.map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
}

export async function sha256Hex(text){
 const bytes=new TextEncoder().encode(text);
 const buf=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');
}

export async function canonicalCommandDigest(rawOrObj){
 const obj=typeof rawOrObj==='string'?JSON.parse(rawOrObj):rawOrObj;
 return await sha256Hex(canonicalJson(obj));
}

async function hasNormalizedTables(db){
 try{
  const row=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='coaching_sync_outbox'").first();
  return !!row?.name;
 }catch(error){throw apiError('DATABASE_ERROR','Unable to verify storage schema.',{status:503,retryable:true,cause:error});}
}

async function hasCoachingTables(db){
 const result=await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('coaching_cases','coaching_feedback')").first();
 return result?.total===2;
}

async function hasNativeAuthTables(db){
 const result=await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('coaching_users','coaching_refresh_tokens')").first();
 return result?.total===2;
}

export async function loadAccount(db,user){
 const coachingReady=await hasCoachingTables(db);
 const extendedReady=await hasExtendedTables(db);
 const wellnessReady=await hasWellnessTables(db);
 const row=await db.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(user).first();
 let parsed=row?JSON.parse(row.body):empty();
 // The transactional revision column is authoritative for legacy/restored bodies.
 if(Number.isSafeInteger(row?.revision))parsed.revision=row.revision;
 // Hydrate normalized tables if present and if aggregate trimmed old historical logs
 if(row&&await hasNormalizedTables(db)){
  try{
   if(parsed._normalizedStorage){
    // Re-read the aggregate and all normalized history in one D1 transaction.
    // Separate reads could attach newer logs to an older account revision.
    const batchStmts=[
     db.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(user),
     db.prepare('SELECT body FROM coaching_food_entries WHERE user_id=? AND deleted=0 ORDER BY date, entry_id').bind(user),
     db.prepare('SELECT body FROM coaching_water_logs WHERE user_id=? ORDER BY date').bind(user),
     db.prepare('SELECT body FROM coaching_weight_logs WHERE user_id=? ORDER BY date').bind(user),
     db.prepare('SELECT body FROM coaching_workout_logs WHERE user_id=? AND deleted=0 ORDER BY date, log_id').bind(user),
     db.prepare('SELECT body FROM coaching_sessions WHERE user_id=? ORDER BY date, session_id').bind(user),
     db.prepare('SELECT body FROM coaching_checkins WHERE user_id=? ORDER BY date').bind(user)
    ];
    const coachingStart=batchStmts.length;
    if(coachingReady){
     batchStmts.push(
      db.prepare('SELECT body FROM coaching_cases WHERE user_id=? ORDER BY date,case_id').bind(user),
      db.prepare('SELECT body FROM coaching_feedback WHERE user_id=? ORDER BY date,feedback_id').bind(user)
     );
    }
    const extStart=batchStmts.length;
    if(extendedReady){
     batchStmts.push(
      db.prepare('SELECT body FROM coaching_activity_logs WHERE user_id=? ORDER BY date, log_id').bind(user),
      db.prepare('SELECT body FROM coaching_body_measurements WHERE user_id=? ORDER BY date').bind(user),
      db.prepare('SELECT body FROM coaching_food_favorites WHERE user_id=? ORDER BY created_at DESC').bind(user),
      db.prepare('SELECT date FROM coaching_streak_freezes WHERE user_id=? ORDER BY date').bind(user)
     );
    }
    const wellnessStart=batchStmts.length;
    if(wellnessReady){
     batchStmts.push(
      db.prepare('SELECT payload_json FROM coaching_custom_recipes WHERE user_id=? ORDER BY updated_at DESC').bind(user),
      db.prepare('SELECT body FROM coaching_cardio_logs WHERE user_id=? ORDER BY date, id').bind(user),
      db.prepare('SELECT body FROM coaching_cycle_logs WHERE user_id=? ORDER BY date').bind(user)
     );
    }
    const results=await db.batch(batchStmts);
    const [account,fe,wl,wgl,wkl,ss,ck]=results;
    const cases=coachingReady?results[coachingStart]:null;
    const feedback=coachingReady?results[coachingStart+1]:null;
    const actLogs=extendedReady?results[extStart]:null;
    const bodyMeas=extendedReady?results[extStart+1]:null;
    const favs=extendedReady?results[extStart+2]:null;
    const freezes=extendedReady?results[extStart+3]:null;
    const recipesRows=wellnessReady?results[wellnessStart]:null;
    const cardioRows=wellnessReady?results[wellnessStart+1]:null;
    const cycleRows=wellnessReady?results[wellnessStart+2]:null;

    const snapshotRow=account.results[0];
    if(!snapshotRow)return empty();
    parsed=JSON.parse(snapshotRow.body);
    if(Number.isSafeInteger(snapshotRow.revision))parsed.revision=snapshotRow.revision;
    if(parsed._coachingStorage){
     if(!coachingReady)throw Error('Coaching storage migration is missing');
     parsed.coachingCases=(cases?.results||[]).map(r=>JSON.parse(r.body));
     parsed.coachingFeedback=(feedback?.results||[]).map(r=>JSON.parse(r.body));
    }
    if(fe?.results?.length){
     const map=new Map((parsed.foodEntries||[]).map(x=>[x.id,x]));
     for(const r of fe.results){const item=JSON.parse(r.body);map.set(item.id,item);}
     parsed.foodEntries=[...map.values()];
    }
    if(wl?.results?.length){
     const map=new Map((parsed.waterLogs||[]).map(x=>[x.date,x]));
     for(const r of wl.results){const item=JSON.parse(r.body);map.set(item.date,item);}
     parsed.waterLogs=[...map.values()];
    }
    if(wgl?.results?.length){
     const map=new Map((parsed.weights||[]).map(x=>[x.date,x]));
     for(const r of wgl.results){const item=JSON.parse(r.body);map.set(item.date,item);}
     parsed.weights=[...map.values()];
    }
    if(wkl?.results?.length){
     const map=new Map((parsed.workoutLogs||[]).map(x=>[x.id,x]));
     for(const r of wkl.results){const item=JSON.parse(r.body);map.set(item.id,item);}
     parsed.workoutLogs=[...map.values()];
    }
    if(ss?.results?.length){
     const map=new Map((parsed.sessions||[]).map(x=>[x.id,x]));
     for(const r of ss.results){const item=JSON.parse(r.body);map.set(item.id,item);}
     parsed.sessions=[...map.values()];
    }
    if(ck?.results?.length){
     const map=new Map((parsed.checkins||[]).map(x=>[x.date,x]));
     for(const r of ck.results){const item=JSON.parse(r.body);map.set(item.date,item);}
     parsed.checkins=[...map.values()];
    }
    if(actLogs?.results?.length){
     const map=new Map((parsed.activityLogs||[]).map(x=>[x.id,x]));
     for(const r of actLogs.results){const item=JSON.parse(r.body);map.set(item.id,item);}
     parsed.activityLogs=[...map.values()];
    }
    if(bodyMeas?.results?.length){
     const map=new Map((parsed.bodyMeasurements||[]).map(x=>[x.date,x]));
     for(const r of bodyMeas.results){const item=JSON.parse(r.body);map.set(item.date,item);}
     parsed.bodyMeasurements=[...map.values()];
    }
    if(favs?.results?.length&&!(parsed.foodFavorites||[]).length){
     parsed.foodFavorites=favs.results.map(r=>JSON.parse(r.body));
    }
    if(freezes?.results?.length){
     parsed.streakFreezes=[...new Set([...(parsed.streakFreezes||[]),...freezes.results.map(r=>r.date)])].sort();
    }
    if(recipesRows?.results?.length){
     const map=new Map((parsed.customRecipes||[]).map(x=>[x.id,x]));
     for(const r of recipesRows.results){const item=JSON.parse(r.payload_json);map.set(item.id,item);}
     parsed.customRecipes=[...map.values()];
    }
    if(cardioRows?.results?.length){
     const map=new Map((parsed.cardioLogs||[]).map(x=>[x.id,x]));
     for(const r of cardioRows.results){const item=JSON.parse(r.body);map.set(item.id,item);}
     parsed.cardioLogs=[...map.values()];
    }
    if(cycleRows?.results?.length){
     const map=new Map((parsed.cycleLogs||[]).map(x=>[x.date,x]));
     for(const r of cycleRows.results){const item=JSON.parse(r.body);map.set(item.date,item);}
     parsed.cycleLogs=[...map.values()];
    }
   }
  }catch(error){throw apiError('ACCOUNT_SNAPSHOT_READ_FAILED','Unable to load account records; no changes were made.',{status:503,retryable:true,cause:error});}
 }
 const s=normalize(parsed);
 delete s._commitToken;
 delete s._normalizedStorage;
 delete s._syncDeltas;
 delete s._lastReceiptResource;
 const cache=new Map(s.plans.map(p=>[p.id,p]));
 const findPlan=async id=>{
  if(cache.has(id))return cache.get(id);
  const r=await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(user,id).first();
  const plan=r?JSON.parse(r.body):null;cache.set(id,plan);return plan;
 };
 if(s.active_plan_id&&!s.plans.some(p=>p.id===s.active_plan_id)){
  const plan=await findPlan(s.active_plan_id);if(!plan)throw apiError('PLAN_LOAD_FAILED','Unable to load saved nutrition plan.',{status:503,retryable:true});s.plans=[plan];
 }
 // Derive missing day targets from owned immutable ancestors; no request-time DDL or blind overwrites.
 for(const plan of s.plans)for(const day of plan.days){
  if(day.targets)continue;
  let ancestor=plan;const seen=new Set();
  while(ancestor?.parent_id&&ancestor.effective_from>day.date&&!seen.has(ancestor.id)&&seen.size<32){seen.add(ancestor.id);ancestor=await findPlan(ancestor.parent_id);}
  day.targets=structuredClone(ancestor?.days.find(d=>d.date===day.date)?.targets||ancestor?.targets||plan.targets);
 }
 const refs=new Map(s.planRefs.map(p=>[p.id,p]));for(const p of s.plans)refs.set(p.id,reference(p));s.planRefs=[...refs.values()];
 return s;
}

// Diff the committed state, including indirect effects such as diary completion and auto-sessions.
export function deriveSyncDeltas(state,action,payload={},nowIso=new Date().toISOString(),previousState={}){
 const deltas=[];
 const collections=[['foodEntries','food_entry','id'],['foodLogs','food_day','date'],['waterLogs','water_log','date'],['weights','weight_log','date'],['workoutLogs','workout_log','id'],['sessions','workout_session','id'],['checkins','recovery_checkin','date'],['activityLogs','activity_log','id'],['coachingCases','coaching_case','id'],['coachingFeedback','coaching_feedback','id'],['foodFavorites','food_favorite','id'],['bodyMeasurements','body_measurement','date'],['customRecipes','custom_recipe','id'],['cardioLogs','cardio_log','id'],['cycleLogs','cycle_log','date']];
 for(const [key,type,idKey]of collections){
  const before=new Map((previousState[key]||[]).map(x=>[String(x[idKey]),x]));
  const after=new Map((state[key]||[]).map(x=>[String(x[idKey]),x]));
  for(const [id,item]of after)if(canonicalJson(before.get(id))!==canonicalJson(item))deltas.push({entityType:type,entityId:id,op:'upsert',payload:item});
  for(const [id]of before)if(!after.has(id))deltas.push({entityType:type,entityId:id,op:'delete',payload:{id,deletedAt:nowIso}});
 }
 const roots=[['profile',{profile:state.profile,preferences:state.preferences,onboarding:state.onboarding},{profile:previousState.profile,preferences:previousState.preferences,onboarding:previousState.onboarding}],['coaching_review',{lastReview:state.lastReview,adaptations:state.adaptations},{lastReview:previousState.lastReview,adaptations:previousState.adaptations}],['settings',{notificationPreferences:state.notificationPreferences,entitlements:state.entitlements,fastingState:state.fastingState,ramadanMode:state.ramadanMode,groceryChecks:state.groceryChecks,streakFreezes:state.streakFreezes,cycleSettings:state.cycleSettings},{notificationPreferences:previousState.notificationPreferences,entitlements:previousState.entitlements,fastingState:previousState.fastingState,ramadanMode:previousState.ramadanMode,groceryChecks:previousState.groceryChecks,streakFreezes:previousState.streakFreezes,cycleSettings:previousState.cycleSettings}]];
 for(const [type,value,before]of roots)if(canonicalJson(value)!==canonicalJson(before))deltas.push({entityType:type,entityId:type,op:'upsert',payload:value});
 const oldNutrition=previousState.plans?.find(p=>p.id===previousState.active_plan_id),nutrition=state.plans?.find(p=>p.id===state.active_plan_id);
 if(canonicalJson(nutrition)!==canonicalJson(oldNutrition))deltas.push({entityType:'nutrition_plan',entityId:nutrition?.id||'active',op:nutrition?'upsert':'delete',payload:nutrition?{planId:nutrition.id,requiresFetch:true}:null});
 if(canonicalJson(state.workoutPlan)!==canonicalJson(previousState.workoutPlan))deltas.push({entityType:'workout_plan',entityId:state.workoutPlan?.id||'active',op:state.workoutPlan?'upsert':'delete',payload:state.workoutPlan?{planId:state.workoutPlan.id,requiresFetch:true}:null});
 return deltas;
}

async function hasExtendedTables(db){
 const result=await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('coaching_activity_logs','coaching_body_measurements','coaching_food_favorites','coaching_usage_quotas','coaching_streak_freezes')").first();
 return result?.total===5;
}

async function hasWellnessTables(db){
 const result=await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('coaching_custom_recipes','coaching_cardio_logs','coaching_cycle_logs')").first();
 return result?.total===3;
}

export async function saveAccount(db,user,state,previousRevision,{key,digest,action,payload={},previousState=null,claimSource=null}){
 const refs=new Map((state.planRefs||[]).map(p=>[p.id,p]));
 for(const p of state.plans)refs.set(p.id,reference(p));
 state.planRefs=[...refs.values()];
 const workouts=[...(state.workoutArchives||[]),...(state.workoutPlan?[state.workoutPlan]:[])];
 const workoutRefs=new Map((state.workoutPlanRefs||[]).map(p=>[p.id,p]));
 for(const p of workouts)workoutRefs.set(p.id,{id:p.id,version:p.version,split:p.split,parent_id:p.parent_id});
 state.workoutPlanRefs=[...workoutRefs.values()];

 const normalizedReady=await hasNormalizedTables(db);
 const coachingReady=normalizedReady&&await hasCoachingTables(db);
 const extendedReady=normalizedReady&&await hasExtendedTables(db);
 const wellnessReady=normalizedReady&&await hasWellnessTables(db);
 previousState ||= normalizedReady?await loadAccount(db,user):empty();
 const nowIso=new Date().toISOString();
 const tz=state.profile?.timezone||'Africa/Cairo';
 const cutoffDate=dateOffset(localDate(Date.now(),tz),-95);

 const stateForAggregate={...state,_commitToken:crypto.randomUUID(),plans:[],workoutArchives:[]};
 delete stateForAggregate._syncDeltas;
 delete stateForAggregate._lastReceiptResource;
 delete stateForAggregate._lastReceipt;
 delete stateForAggregate._weightSkipped;

 if(normalizedReady){
  stateForAggregate._normalizedStorage=true;
  stateForAggregate._normalizedStorageVersion=1;
  const rawLen=new TextEncoder().encode(JSON.stringify(stateForAggregate)).length;
  if(rawLen>900000){
   stateForAggregate.foodEntries=(state.foodEntries||[]).filter(e=>e.date>=cutoffDate);
   stateForAggregate.workoutLogs=(state.workoutLogs||[]).filter(l=>l.date>=cutoffDate);
   stateForAggregate.sessions=(state.sessions||[]).filter(s=>s.date>=cutoffDate);
   stateForAggregate.waterLogs=(state.waterLogs||[]).filter(w=>w.date>=cutoffDate);
   stateForAggregate.weights=(state.weights||[]).filter(w=>w.date>=cutoffDate);
   stateForAggregate.checkins=(state.checkins||[]).filter(c=>c.date>=cutoffDate);
   stateForAggregate.activityLogs=(state.activityLogs||[]).filter(a=>a.date>=cutoffDate);
   if(state.cardioLogs)stateForAggregate.cardioLogs=state.cardioLogs.filter(c=>c.date>=cutoffDate);
   if(state.cycleLogs)stateForAggregate.cycleLogs=state.cycleLogs.filter(c=>c.date>=cutoffDate);
  }
 }

 if(coachingReady){stateForAggregate._coachingStorage=true;stateForAggregate.coachingCases=[];stateForAggregate.coachingFeedback=[];}
 const body=JSON.stringify(stateForAggregate);
 if(new TextEncoder().encode(body).length>1500000)throw apiError('STORAGE_LIMIT_REACHED','Account history reached storage capacity; export your data before adding new logs.',{status:413});

 const deltas=deriveSyncDeltas(state,action,payload,nowIso,previousState);
 const receipt=JSON.stringify({revision:state.revision,at:nowIso,action,affected:deltas});

 const sourceGuard=claimSource?" WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM coaching_auth_sessions WHERE user_id=? AND session_id='__claimed__')":" WHERE 1";
 const closedGuard=normalizedReady?" AND NOT EXISTS(SELECT 1 FROM coaching_auth_sessions WHERE user_id=? AND session_id IN ('__deleted__','__claimed__') AND revoked_at IS NOT NULL)":'';
 const accountSql='INSERT INTO coaching_accounts(user_id,revision,body) SELECT ?,?,?'+sourceGuard+closedGuard+' ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,body=excluded.body WHERE coaching_accounts.revision=?';
 const accountArgs=[user,state.revision,body,...(claimSource?[claimSource.userId,claimSource.revision,claimSource.userId]:[]),...(normalizedReady?[user]:[]),previousRevision];
 const statements=[db.prepare(accountSql).bind(...accountArgs)];
 for(const plan of state.plans)statements.push(db.prepare('INSERT OR IGNORE INTO coaching_plans(user_id,plan_id,created_at,body) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,plan.id,plan.created_at,JSON.stringify(plan),user,state.revision,body));
 for(const plan of workouts)statements.push(db.prepare('INSERT OR IGNORE INTO coaching_workout_plans(user_id,plan_id,body) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,plan.id,JSON.stringify(plan),user,state.revision,body));
 statements.push(db.prepare('INSERT OR IGNORE INTO coaching_requests(user_id,request_key,digest,response) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,key,digest,receipt,user,state.revision,body));
 statements.push(db.prepare('INSERT OR IGNORE INTO coaching_changes(user_id,revision,action,at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,state.revision,action,nowIso,user,state.revision,body));

 if(normalizedReady){
  let seqOffset=Number((await db.prepare('SELECT MAX(seq) AS seq FROM coaching_sync_outbox WHERE user_id=?').bind(user).first())?.seq||0);
  for(const d of deltas){
   const seq=++seqOffset;
   statements.push(db.prepare('INSERT OR REPLACE INTO coaching_sync_outbox(user_id,seq,revision,entity_type,entity_id,op,at,payload) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,seq,state.revision,d.entityType,String(d.entityId),d.op,nowIso,JSON.stringify(d.payload??{}),user,state.revision,body));
  }
  const persistenceDeltas=(previousState._normalizedStorageVersion===1&&!claimSource)?deltas:deriveSyncDeltas(state,action,payload,nowIso,{});
  for(const d of persistenceDeltas){
   const storage={water_log:['coaching_water_logs','date'],weight_log:['coaching_weight_logs','date'],workout_session:['coaching_sessions','session_id'],recovery_checkin:['coaching_checkins','date']};
   if(d.op==='delete'&&storage[d.entityType]){const [table,column]=storage[d.entityType];statements.push(db.prepare(`DELETE FROM ${table} WHERE user_id=? AND ${column}=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)`).bind(user,String(d.entityId),user,state.revision,body));continue;}
   if(d.entityType==='food_entry'){
    if(d.op==='delete'){
     statements.push(db.prepare('UPDATE coaching_food_entries SET deleted=1,updated_at=? WHERE user_id=? AND entry_id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(nowIso,user,String(d.entityId),user,state.revision,body));
    }else if(d.payload){
     const e=d.payload;
     statements.push(db.prepare('INSERT OR REPLACE INTO coaching_food_entries(user_id,entry_id,date,slot,source,updated_at,deleted,body) SELECT ?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,e.id,e.date,e.slot||'snack',e.source||'manual',nowIso,JSON.stringify(e),user,state.revision,body));
    }
   }else if(d.entityType==='water_log'&&d.payload){
    const w=d.payload;
    statements.push(db.prepare('INSERT OR REPLACE INTO coaching_water_logs(user_id,date,cups,liters,updated_at,body) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,w.date,w.cups||0,String(w.liters||0),nowIso,JSON.stringify(w),user,state.revision,body));
   }else if(d.entityType==='weight_log'&&d.payload){
    const w=d.payload;
    statements.push(db.prepare('INSERT OR REPLACE INTO coaching_weight_logs(user_id,date,kg,source,updated_at,body) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,w.date,String(w.kg),w.source||'manual',nowIso,JSON.stringify(w),user,state.revision,body));
   }else if(d.entityType==='workout_log'&&d.op==='delete'){
    statements.push(db.prepare('UPDATE coaching_workout_logs SET deleted=1,updated_at=? WHERE user_id=? AND log_id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(nowIso,user,String(d.entityId),user,state.revision,body));
   }else if(d.entityType==='workout_log'&&d.payload){
    const l=d.payload;
    statements.push(db.prepare('INSERT OR REPLACE INTO coaching_workout_logs(user_id,log_id,date,exercise_id,plan_id,updated_at,deleted,body) SELECT ?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,l.id,l.date,l.exerciseId,l.planId||'unknown',nowIso,JSON.stringify(l),user,state.revision,body));
   }else if(d.entityType==='workout_session'&&d.payload){
    const sess=d.payload;
    statements.push(db.prepare('INSERT OR REPLACE INTO coaching_sessions(user_id,session_id,date,day_index,status,updated_at,body) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,sess.id,sess.date,sess.dayIndex||0,sess.status||'completed',nowIso,JSON.stringify(sess),user,state.revision,body));
   }else if(d.entityType==='recovery_checkin'&&d.payload){
    const c=d.payload;
    statements.push(db.prepare('INSERT OR REPLACE INTO coaching_checkins(user_id,date,at,body) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,c.date,c.at||nowIso,JSON.stringify(c),user,state.revision,body));
   }else if(extendedReady&&d.entityType==='activity_log'&&d.payload){
    const a=d.payload;
    statements.push(db.prepare('INSERT OR REPLACE INTO coaching_activity_logs(user_id,log_id,date,source,external_record_id,updated_at,body) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,a.id,a.date,a.source||'manual',a.externalRecordId||null,nowIso,JSON.stringify(a),user,state.revision,body));
   }else if(extendedReady&&d.entityType==='body_measurement'&&d.payload){
    const m=d.payload;
    statements.push(db.prepare('INSERT OR REPLACE INTO coaching_body_measurements(user_id,date,body,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,m.date,JSON.stringify(m),nowIso,user,state.revision,body));
   }else if(extendedReady&&d.entityType==='food_favorite'){
    if(d.op==='delete'){
     statements.push(db.prepare('DELETE FROM coaching_food_favorites WHERE user_id=? AND favorite_id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,String(d.entityId),user,state.revision,body));
    }else if(d.payload){
     const f=d.payload;
     statements.push(db.prepare('INSERT OR REPLACE INTO coaching_food_favorites(user_id,favorite_id,name,source,body,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,f.id,f.name,f.source||'manual',JSON.stringify(f),f.createdAt||nowIso,user,state.revision,body));
    }
   }else if(wellnessReady&&d.entityType==='custom_recipe'){
    if(d.op==='delete'){
     statements.push(db.prepare('DELETE FROM coaching_custom_recipes WHERE user_id=? AND id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,String(d.entityId),user,state.revision,body));
    }else if(d.payload){
     const r=d.payload;
     statements.push(db.prepare('INSERT OR REPLACE INTO coaching_custom_recipes(user_id,id,name,servings,total_grams,payload_json,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,r.id,r.name,Number(r.servings)||1,Number(r.totalGrams)||0,JSON.stringify(r),r.createdAt||nowIso,r.updatedAt||nowIso,user,state.revision,body));
    }
   }else if(wellnessReady&&d.entityType==='cardio_log'){
    if(d.op==='delete'){
     statements.push(db.prepare('DELETE FROM coaching_cardio_logs WHERE user_id=? AND id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,String(d.entityId),user,state.revision,body));
    }else if(d.payload){
     const c=d.payload;
     statements.push(db.prepare('INSERT OR REPLACE INTO coaching_cardio_logs(user_id,id,date,modality,duration_minutes,intensity,distance_km,estimated_kcal,source,external_record_id,body,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,c.id,c.date,c.modality,Number(c.durationMinutes)||0,c.intensity||'moderate',c.distanceKm??null,Number(c.estimatedKcal)||0,c.source||'manual',c.externalRecordId||null,JSON.stringify(c),c.updatedAt||nowIso,user,state.revision,body));
    }
   }else if(wellnessReady&&d.entityType==='cycle_log'){
    if(d.op==='delete'){
     statements.push(db.prepare('DELETE FROM coaching_cycle_logs WHERE user_id=? AND date=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,String(d.entityId),user,state.revision,body));
    }else if(d.payload){
     const cy=d.payload;
     statements.push(db.prepare('INSERT OR REPLACE INTO coaching_cycle_logs(user_id,date,period_start,flow_level,cramp_severity,body,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,cy.date,cy.periodStart?1:0,cy.flowLevel||'none',Number(cy.crampSeverity)||0,JSON.stringify(cy),cy.updatedAt||nowIso,user,state.revision,body));
    }
   }
  }
  if(extendedReady&&Array.isArray(state.streakFreezes)&&state.streakFreezes.length){
   for(const fDate of state.streakFreezes){
    const dStr=typeof fDate==='string'?fDate:fDate?.date;
    if(dStr)statements.push(db.prepare('INSERT OR IGNORE INTO coaching_streak_freezes(user_id,date,auto_applied,created_at) SELECT ?,?,0,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,dStr,nowIso,user,state.revision,body));
   }
  }
 }

 if(coachingReady){
  const entities=previousState._coachingStorage&&!claimSource?deltas:deriveSyncDeltas(state,action,payload,nowIso,{});
  for(const d of entities){
   const location={coaching_case:['coaching_cases','case_id'],coaching_feedback:['coaching_feedback','feedback_id']}[d.entityType];
   if(!location)continue;
   const [table,column]=location;
   if(d.op==='delete')statements.push(db.prepare(`DELETE FROM ${table} WHERE user_id=? AND ${column}=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)`).bind(user,d.entityId,user,state.revision,body));
   else statements.push(db.prepare(`INSERT OR REPLACE INTO ${table}(user_id,${column},date,body) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)`).bind(user,d.entityId,d.payload.date,JSON.stringify(d.payload),user,state.revision,body));
  }
 }

 if(claimSource){
  const from=claimSource.userId;
  for(const [table,columns]of [['coaching_plans','plan_id,created_at,body'],['coaching_workout_plans','plan_id,body'],['coaching_account_consents','consent_type,version,accepted,at']])statements.push(db.prepare(`INSERT OR IGNORE INTO ${table}(user_id,${columns}) SELECT ?,${columns} FROM ${table} WHERE user_id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)`).bind(user,from,user,state.revision,body));
  for(const table of ['coaching_food_entries','coaching_water_logs','coaching_weight_logs','coaching_workout_logs','coaching_sessions','coaching_checkins','coaching_sync_outbox','coaching_account_consents','coaching_requests','coaching_plans','coaching_workout_plans','coaching_changes','coaching_accounts',...(coachingReady?['coaching_cases','coaching_feedback']:[]),...(extendedReady?['coaching_activity_logs','coaching_body_measurements','coaching_food_favorites','coaching_grocery_checks','coaching_streak_freezes']:[]),...(wellnessReady?['coaching_custom_recipes','coaching_cardio_logs','coaching_cycle_logs']:[])])statements.push(db.prepare(`DELETE FROM ${table} WHERE user_id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)`).bind(from,user,state.revision,body));
  statements.push(db.prepare("INSERT INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) SELECT ?,'__claimed__',?,?,NULL,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)").bind(from,user,nowIso,nowIso,user,state.revision,body));
 }
 const result=await db.batch(statements);
 if(!result[0].meta.changes)throw apiError('CONFLICT','Request conflicted with current resource state.',{status:409});
 state.workoutArchives=[];
 state._lastReceipt={revision:state.revision,at:nowIso,action,affected:deltas};
 return state;
}

export async function backfillAccountToNormalizedTables(db,user){
 const s=await loadAccount(db,user);
 if(!(await hasNormalizedTables(db)))return {migrated:false,reason:'normalized_tables_missing'};
 const nowIso=new Date().toISOString();
 const stmts=[];
 for(const e of s.foodEntries||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_food_entries(user_id,entry_id,date,slot,source,updated_at,deleted,body) SELECT ?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=?)').bind(user,e.id,e.date,e.slot||'snack',e.source||'manual',e.at||nowIso,JSON.stringify(e),user,s.revision));
 }
 for(const w of s.waterLogs||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_water_logs(user_id,date,cups,liters,updated_at,body) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=?)').bind(user,w.date,w.cups||0,String(w.liters||0),w.at||nowIso,JSON.stringify(w),user,s.revision));
 }
 for(const w of s.weights||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_weight_logs(user_id,date,kg,source,updated_at,body) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=?)').bind(user,w.date,String(w.kg),w.source||'manual',nowIso,JSON.stringify(w),user,s.revision));
 }
 for(const l of s.workoutLogs||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_workout_logs(user_id,log_id,date,exercise_id,plan_id,updated_at,deleted,body) SELECT ?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=?)').bind(user,l.id,l.date,l.exerciseId,l.planId||'unknown',l.at||nowIso,JSON.stringify(l),user,s.revision));
 }
 for(const sess of s.sessions||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_sessions(user_id,session_id,date,day_index,status,updated_at,body) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=?)').bind(user,sess.id,sess.date,sess.dayIndex||0,sess.status||'completed',nowIso,JSON.stringify(sess),user,s.revision));
 }
 for(const c of s.checkins||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_checkins(user_id,date,at,body) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=?)').bind(user,c.date,c.at||nowIso,JSON.stringify(c),user,s.revision));
 }
 if(stmts.length){const result=await db.batch(stmts);if(!result.some(r=>r.meta.changes))throw apiError('ACCOUNT_BACKFILL_CONFLICT','Account changed during migration backfill; reload and retry.',{status:409});}
 return {
  migrated:true,
  counts:{
   foodEntries:(s.foodEntries||[]).length,
   waterLogs:(s.waterLogs||[]).length,
   weights:(s.weights||[]).length,
   workoutLogs:(s.workoutLogs||[]).length,
   sessions:(s.sessions||[]).length,
   checkins:(s.checkins||[]).length
  }
 };
}

async function safeAll(db, sql, bindVal){
 try{return (await db.prepare(sql).bind(bindVal).all())?.results||[];}
 catch(e){if(/no such table/i.test(e?.message||''))return [];throw e;}
}

export async function exportFullAccountData(db,user,extras={}){
 const state=await loadAccount(db,user);
 const [plansRows,workoutPlansRows,changesRows,consentsRows,subsRows,photosRows,ticketsRows,oauthRows,pushRows,aiRows]=await Promise.all([
  safeAll(db,'SELECT plan_id,created_at,body FROM coaching_plans WHERE user_id=? ORDER BY created_at',user),
  safeAll(db,'SELECT plan_id,body FROM coaching_workout_plans WHERE user_id=?',user),
  safeAll(db,'SELECT revision,action,at FROM coaching_changes WHERE user_id=? ORDER BY revision',user),
  safeAll(db,'SELECT consent_type,version,accepted,at FROM coaching_account_consents WHERE user_id=?',user),
  safeAll(db,'SELECT provider,external_tx_id,product_id,status,expires_at,auto_renew_enabled,updated_at FROM coaching_subscriptions WHERE user_id=?',user),
  safeAll(db,'SELECT photo_id,date,pose,weight_kg_snapshot,created_at FROM coaching_progress_photos WHERE user_id=? ORDER BY date DESC',user),
  safeAll(db,'SELECT ticket_id,category,message,created_at FROM coaching_support_tickets WHERE user_id=? ORDER BY created_at DESC',user),
  safeAll(db,'SELECT provider,email,created_at FROM coaching_oauth_identities WHERE user_id=? ORDER BY created_at ASC',user),
  safeAll(db,'SELECT device_id,platform,locale,timezone,app_version,updated_at FROM coaching_push_tokens WHERE user_id=? ORDER BY updated_at DESC',user),
  safeAll(db,'SELECT thread_id,message_id,role,content,created_at FROM coaching_ai_messages WHERE user_id=? ORDER BY created_at ASC',user)
 ]);
 const progressPhotos=Array.isArray(extras.signedProgressPhotos)?extras.signedProgressPhotos:photosRows;
 return {
  schemaVersion:3,
  exportedAt:new Date().toISOString(),
  userId:user,
  revision:state.revision,
  profile:state.profile?{...state.profile,...(extras.signedAvatarUrl!==undefined?{avatarUrl:extras.signedAvatarUrl}:{})}:null,
  preferences:state.preferences,
  onboarding:state.onboarding,
  notificationPreferences:state.notificationPreferences,
  entitlements:extras.entitlements||state.entitlements,
  fastingState:state.fastingState,
  ramadanMode:state.ramadanMode,
  cycleSettings:state.cycleSettings||null,
  activeNutritionPlanId:state.active_plan_id,
  activeWorkoutPlan:state.workoutPlan,
  logs:{
   foodEntries:state.foodEntries||[],
   foodLogs:state.foodLogs||[],
   foodFavorites:state.foodFavorites||[],
   customRecipes:state.customRecipes||[],
   groceryChecks:state.groceryChecks||{},
   waterLogs:state.waterLogs||[],
   weights:state.weights||[],
   activityLogs:state.activityLogs||[],
   cardioLogs:state.cardioLogs||[],
   cycleLogs:state.cycleLogs||[],
   bodyMeasurements:state.bodyMeasurements||[],
   streakFreezes:state.streakFreezes||[],
   workoutLogs:state.workoutLogs||[],
   sessions:state.sessions||[],
   checkins:state.checkins||[],
   adaptations:state.adaptations||[],
   coachingCases:state.coachingCases||[],
   coachingFeedback:state.coachingFeedback||[],
   history:state.history||[]
  },
  oauthIdentities:oauthRows,
  registeredDevices:pushRows,
  aiMessages:aiRows,
  subscriptions:subsRows,
  progressPhotos,
  supportTickets:ticketsRows,
  archivedNutritionPlans:plansRows.map(r=>JSON.parse(r.body)),
  archivedWorkoutPlans:workoutPlansRows.map(r=>JSON.parse(r.body)),
  changeAuditLog:changesRows,
  consents:consentsRows
 };
}

export async function deleteFullAccountData(db,user){
 const nowIso=new Date().toISOString();
 const normalized=await hasNormalizedTables(db);
 if(!normalized)throw apiError('ACCOUNT_DELETION_MIGRATION_REQUIRED','Account deletion requires normalized session revocation tables to be migrated.',{status:503});
 const coachingReady=await hasCoachingTables(db);
 const nativeAuthReady=await hasNativeAuthTables(db);
 const extendedReady=await hasExtendedTables(db);
 const wellnessReady=await hasWellnessTables(db);
 const tables=['coaching_accounts','coaching_requests','coaching_plans','coaching_changes','coaching_workout_plans'];
 if(normalized){
  tables.push('coaching_food_entries','coaching_water_logs','coaching_weight_logs','coaching_workout_logs','coaching_sessions','coaching_checkins','coaching_sync_outbox','coaching_account_consents','coaching_auth_sessions');
 }
 const claims=(await db.prepare("SELECT user_id FROM coaching_auth_sessions WHERE session_id='__claimed__' AND device_id=? AND revoked_at IS NOT NULL").bind(user).all()).results||[];
 const identities=[...new Set([user,...claims.map(row=>row.user_id)])];
 if(coachingReady)tables.push('coaching_cases','coaching_feedback');
 if(nativeAuthReady)tables.push('coaching_refresh_tokens','coaching_users');
 if(extendedReady)tables.push('coaching_oauth_identities','coaching_push_tokens','coaching_food_favorites','coaching_grocery_checks','coaching_body_measurements','coaching_progress_photos','coaching_ai_messages','coaching_subscriptions','coaching_support_tickets','coaching_usage_quotas','coaching_activity_logs','coaching_streak_freezes');
 if(wellnessReady)tables.push('coaching_custom_recipes','coaching_cardio_logs','coaching_cycle_logs');
 const stmts=identities.flatMap(identity=>tables.map(t=>db.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(identity)));
 if(normalized){
  for(const identity of identities)stmts.push(db.prepare('INSERT INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)').bind(identity,'__deleted__','system',nowIso,null,nowIso));
 }
 await db.batch(stmts);
 return {deleted:true,userId:user,deletedAt:nowIso,tablesCleared:tables.length,namespacesCleared:identities.length};
}
