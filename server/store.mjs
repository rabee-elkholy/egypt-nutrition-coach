import {empty,normalize} from './coaching.mjs';
import {localDate,dateOffset} from '../coaching-shared.mjs';

const reference=p=>({id:p.id,start_date:p.start_date,end_date:p.days.at(-1)?.date,created_at:p.created_at,effective_from:p.effective_from,energy:p.targets.energy,reason:p.changeReason||'إنشاء خطة',parent_id:p.parent_id});

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
 }catch{return false;}
}

export async function loadAccount(db,user){
 const row=await db.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(user).first();
 const parsed=row?JSON.parse(row.body):empty();
 // Hydrate normalized tables if present and if aggregate trimmed old historical logs
 if(row&&await hasNormalizedTables(db)){
  try{
   if(parsed._normalizedStorage){
    const [fe,wl,wgl,wkl,ss,ck]=await Promise.all([
     db.prepare('SELECT body FROM coaching_food_entries WHERE user_id=? AND deleted=0 ORDER BY date, entry_id').bind(user).all(),
     db.prepare('SELECT body FROM coaching_water_logs WHERE user_id=? ORDER BY date').bind(user).all(),
     db.prepare('SELECT body FROM coaching_weight_logs WHERE user_id=? ORDER BY date').bind(user).all(),
     db.prepare('SELECT body FROM coaching_workout_logs WHERE user_id=? AND deleted=0 ORDER BY date, log_id').bind(user).all(),
     db.prepare('SELECT body FROM coaching_sessions WHERE user_id=? ORDER BY date, session_id').bind(user).all(),
     db.prepare('SELECT body FROM coaching_checkins WHERE user_id=? ORDER BY date').bind(user).all()
    ]);
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
   }
  }catch(error){throw Object.assign(Error('تعذر تحميل السجلات؛ لم نغيّر بياناتك.'),{status:503,cause:error});}
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
  const plan=await findPlan(s.active_plan_id);if(!plan)throw Error('تعذر تحميل الخطة المحفوظة.');s.plans=[plan];
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
 const collections=[['foodEntries','food_entry','id'],['foodLogs','food_day','date'],['waterLogs','water_log','date'],['weights','weight_log','date'],['workoutLogs','workout_log','id'],['sessions','workout_session','id'],['checkins','recovery_checkin','date'],['activityLogs','activity_log','id']];
 for(const [key,type,idKey]of collections){
  const before=new Map((previousState[key]||[]).map(x=>[String(x[idKey]),x]));
  const after=new Map((state[key]||[]).map(x=>[String(x[idKey]),x]));
  for(const [id,item]of after)if(canonicalJson(before.get(id))!==canonicalJson(item))deltas.push({entityType:type,entityId:id,op:'upsert',payload:item});
  for(const [id]of before)if(!after.has(id))deltas.push({entityType:type,entityId:id,op:'delete',payload:{id,deletedAt:nowIso}});
 }
 const roots=[['profile',{profile:state.profile,preferences:state.preferences,onboarding:state.onboarding},{profile:previousState.profile,preferences:previousState.preferences,onboarding:previousState.onboarding}],['coaching_review',{lastReview:state.lastReview,adaptations:state.adaptations},{lastReview:previousState.lastReview,adaptations:previousState.adaptations}],['settings',{notificationPreferences:state.notificationPreferences,entitlements:state.entitlements},{notificationPreferences:previousState.notificationPreferences,entitlements:previousState.entitlements}]];
 for(const [type,value,before]of roots)if(canonicalJson(value)!==canonicalJson(before))deltas.push({entityType:type,entityId:type,op:'upsert',payload:value});
 const oldNutrition=previousState.plans?.find(p=>p.id===previousState.active_plan_id),nutrition=state.plans?.find(p=>p.id===state.active_plan_id);
 if(canonicalJson(nutrition)!==canonicalJson(oldNutrition))deltas.push({entityType:'nutrition_plan',entityId:nutrition?.id||'active',op:nutrition?'upsert':'delete',payload:nutrition?{planId:nutrition.id,requiresFetch:true}:null});
 if(canonicalJson(state.workoutPlan)!==canonicalJson(previousState.workoutPlan))deltas.push({entityType:'workout_plan',entityId:state.workoutPlan?.id||'active',op:state.workoutPlan?'upsert':'delete',payload:state.workoutPlan?{planId:state.workoutPlan.id,requiresFetch:true}:null});
 return deltas;
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
 previousState ||= normalizedReady?await loadAccount(db,user):empty();
 const nowIso=new Date().toISOString();
 const tz=state.profile?.timezone||'Africa/Cairo';
 const cutoffDate=dateOffset(localDate(Date.now(),tz),-95);

 // If normalized tables exist and the aggregate is growing large (>800 KB), archive older than 95-day entries into normalized tables while keeping active 95-day window in aggregate
 const stateForAggregate={...state,_commitToken:crypto.randomUUID(),plans:[],workoutArchives:[]};
 delete stateForAggregate._syncDeltas;
 delete stateForAggregate._lastReceiptResource;
 delete stateForAggregate._lastReceipt;

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
  }
 }

 const body=JSON.stringify(stateForAggregate);
 if(new TextEncoder().encode(body).length>1500000)throw Object.assign(Error('سجل المتابعة وصل لسعة النسخة التجريبية؛ صدّر بياناتك قبل إضافة سجلات جديدة.'),{status:413});

 const deltas=deriveSyncDeltas(state,action,payload,nowIso,previousState);
 const receipt=JSON.stringify({revision:state.revision,at:nowIso,action,affected:deltas});

 const sourceGuard=claimSource?" WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM coaching_auth_sessions WHERE user_id=? AND session_id='__claimed__')":" WHERE 1";
 const accountSql='INSERT INTO coaching_accounts(user_id,revision,body) SELECT ?,?,?'+sourceGuard+' ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,body=excluded.body WHERE coaching_accounts.revision=?';
 const accountArgs=[user,state.revision,body,...(claimSource?[claimSource.userId,claimSource.revision,claimSource.userId]:[]),previousRevision];
 const statements=[db.prepare(accountSql).bind(...accountArgs)];
 // The exact body guards every dependent insert inside one atomic batch.
 for(const plan of state.plans)statements.push(db.prepare('INSERT OR IGNORE INTO coaching_plans(user_id,plan_id,created_at,body) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,plan.id,plan.created_at,JSON.stringify(plan),user,state.revision,body));
 for(const plan of workouts)statements.push(db.prepare('INSERT OR IGNORE INTO coaching_workout_plans(user_id,plan_id,body) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,plan.id,JSON.stringify(plan),user,state.revision,body));
 statements.push(db.prepare('INSERT OR IGNORE INTO coaching_requests(user_id,request_key,digest,response) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,key,digest,receipt,user,state.revision,body));
 statements.push(db.prepare('INSERT OR IGNORE INTO coaching_changes(user_id,revision,action,at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,state.revision,action,nowIso,user,state.revision,body));

 if(normalizedReady){
  // Dual-write affected entities and sync outbox deltas guarded by the winning account write
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
   }
  }
 }

 if(claimSource){
  const from=claimSource.userId;
  for(const [table,columns]of [['coaching_plans','plan_id,created_at,body'],['coaching_workout_plans','plan_id,body'],['coaching_account_consents','consent_type,version,accepted,at']])statements.push(db.prepare(`INSERT OR IGNORE INTO ${table}(user_id,${columns}) SELECT ?,${columns} FROM ${table} WHERE user_id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)`).bind(user,from,user,state.revision,body));
  for(const table of ['coaching_food_entries','coaching_water_logs','coaching_weight_logs','coaching_workout_logs','coaching_sessions','coaching_checkins','coaching_sync_outbox','coaching_account_consents','coaching_requests','coaching_plans','coaching_workout_plans','coaching_changes','coaching_accounts'])statements.push(db.prepare(`DELETE FROM ${table} WHERE user_id=? AND EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)`).bind(from,user,state.revision,body));
  statements.push(db.prepare("INSERT INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) SELECT ?,'__claimed__',?,?,NULL,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)").bind(from,user,nowIso,nowIso,user,state.revision,body));
 }
 const result=await db.batch(statements);
 if(!result[0].meta.changes)throw Object.assign(Error('تعارض تحديث؛ حدّث بياناتك وحاول تاني.'),{status:409});
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
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_food_entries(user_id,entry_id,date,slot,source,updated_at,deleted,body) VALUES(?,?,?,?,?,?,0,?)').bind(user,e.id,e.date,e.slot||'snack',e.source||'manual',e.at||nowIso,JSON.stringify(e)));
 }
 for(const w of s.waterLogs||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_water_logs(user_id,date,cups,liters,updated_at,body) VALUES(?,?,?,?,?,?)').bind(user,w.date,w.cups||0,String(w.liters||0),w.at||nowIso,JSON.stringify(w)));
 }
 for(const w of s.weights||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_weight_logs(user_id,date,kg,source,updated_at,body) VALUES(?,?,?,?,?,?)').bind(user,w.date,String(w.kg),w.source||'manual',nowIso,JSON.stringify(w)));
 }
 for(const l of s.workoutLogs||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_workout_logs(user_id,log_id,date,exercise_id,plan_id,updated_at,deleted,body) VALUES(?,?,?,?,?,?,0,?)').bind(user,l.id,l.date,l.exerciseId,l.planId||'unknown',l.at||nowIso,JSON.stringify(l)));
 }
 for(const sess of s.sessions||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_sessions(user_id,session_id,date,day_index,status,updated_at,body) VALUES(?,?,?,?,?,?,?)').bind(user,sess.id,sess.date,sess.dayIndex||0,sess.status||'completed',nowIso,JSON.stringify(sess)));
 }
 for(const c of s.checkins||[]){
  stmts.push(db.prepare('INSERT OR REPLACE INTO coaching_checkins(user_id,date,at,body) VALUES(?,?,?,?)').bind(user,c.date,c.at||nowIso,JSON.stringify(c)));
 }
 if(stmts.length)await db.batch(stmts);
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

export async function exportFullAccountData(db,user){
 const state=await loadAccount(db,user);
 const [plansRows,workoutPlansRows,changesRows,consentsRows]=await Promise.all([
  db.prepare('SELECT plan_id,created_at,body FROM coaching_plans WHERE user_id=? ORDER BY created_at').bind(user).all(),
  db.prepare('SELECT plan_id,body FROM coaching_workout_plans WHERE user_id=?').bind(user).all(),
  db.prepare('SELECT revision,action,at FROM coaching_changes WHERE user_id=? ORDER BY revision').bind(user).all(),
  hasNormalizedTables(db).then(ok=>ok?db.prepare('SELECT consent_type,version,accepted,at FROM coaching_account_consents WHERE user_id=?').bind(user).all():{results:[]})
 ]);
 return {
  schemaVersion:3,
  exportedAt:new Date().toISOString(),
  userId:user,
  revision:state.revision,
  profile:state.profile,
  preferences:state.preferences,
  onboarding:state.onboarding,
  activeNutritionPlanId:state.active_plan_id,
  activeWorkoutPlan:state.workoutPlan,
  logs:{
   foodEntries:state.foodEntries||[],
   foodLogs:state.foodLogs||[],
   waterLogs:state.waterLogs||[],
   weights:state.weights||[],
   workoutLogs:state.workoutLogs||[],
   sessions:state.sessions||[],
   checkins:state.checkins||[],
   adaptations:state.adaptations||[],
   history:state.history||[]
  },
  archivedNutritionPlans:(plansRows?.results||[]).map(r=>JSON.parse(r.body)),
  archivedWorkoutPlans:(workoutPlansRows?.results||[]).map(r=>JSON.parse(r.body)),
  changeAuditLog:changesRows?.results||[],
  consents:consentsRows?.results||[]
 };
}

export async function deleteFullAccountData(db,user){
 const nowIso=new Date().toISOString();
 const normalized=await hasNormalizedTables(db);
 const tables=['coaching_accounts','coaching_requests','coaching_plans','coaching_changes','coaching_workout_plans'];
 if(normalized){
  tables.push('coaching_food_entries','coaching_water_logs','coaching_weight_logs','coaching_workout_logs','coaching_sessions','coaching_checkins','coaching_sync_outbox','coaching_account_consents','coaching_auth_sessions');
 }
 const stmts=tables.map(t=>db.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(user));
 if(normalized){
  stmts.push(db.prepare('INSERT INTO coaching_auth_sessions(user_id,session_id,device_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?)').bind(user,'__deleted__','system',nowIso,null,nowIso));
 }
 await db.batch(stmts);
 return {deleted:true,userId:user,deletedAt:nowIso,tablesCleared:tables.length};
}
