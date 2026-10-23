import {empty,normalize} from './coaching.mjs';
export async function loadAccount(db,user){
 const row=await db.prepare('SELECT revision,body FROM coaching_accounts WHERE user_id=?').bind(user).first();
 const s=normalize(row?JSON.parse(row.body):empty());
 if(s.active_plan_id&&!s.plans.some(p=>p.id===s.active_plan_id)){
  const plan=await db.prepare('SELECT body FROM coaching_plans WHERE user_id=? AND plan_id=?').bind(user,s.active_plan_id).first();
  if(!plan)throw Error('تعذر تحميل الخطة المحفوظة.');s.plans=[JSON.parse(plan.body)];
 }
 return s;
}
export async function saveAccount(db,user,state,previousRevision,{key,digest,action}){
 const refs=new Map((state.planRefs||[]).map(p=>[p.id,p]));
 for(const p of state.plans)refs.set(p.id,{id:p.id,start_date:p.start_date,end_date:p.days.at(-1)?.date,created_at:p.created_at,effective_from:p.effective_from,energy:p.targets.energy,reason:p.changeReason||'إنشاء خطة',parent_id:p.parent_id});
 state.planRefs=[...refs.values()];
 const workouts=[...(state.workoutArchives||[]),...(state.workoutPlan?[state.workoutPlan]:[])];
 const workoutRefs=new Map((state.workoutPlanRefs||[]).map(p=>[p.id,p]));
 for(const p of workouts)workoutRefs.set(p.id,{id:p.id,version:p.version,split:p.split,parent_id:p.parent_id});
 state.workoutPlanRefs=[...workoutRefs.values()];
 const body=JSON.stringify({...state,plans:[],workoutArchives:[]});if(new TextEncoder().encode(body).length>1500000)throw Object.assign(Error('سجل المتابعة وصل لسعة النسخة التجريبية؛ صدّر بياناتك قبل إضافة سجلات جديدة.'),{status:413});
 const receipt=JSON.stringify({revision:state.revision,at:new Date().toISOString()});
 const statements=[db.prepare('INSERT INTO coaching_accounts(user_id,revision,body) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,body=excluded.body WHERE coaching_accounts.revision=?').bind(user,state.revision,body,previousRevision)];
 // The exact body guards every dependent insert inside one atomic batch.
 for(const plan of state.plans)statements.push(db.prepare('INSERT OR IGNORE INTO coaching_plans(user_id,plan_id,created_at,body) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,plan.id,plan.created_at,JSON.stringify(plan),user,state.revision,body));
 for(const plan of workouts)statements.push(db.prepare('INSERT OR IGNORE INTO coaching_workout_plans(user_id,plan_id,body) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,plan.id,JSON.stringify(plan),user,state.revision,body));
 statements.push(db.prepare('INSERT OR IGNORE INTO coaching_requests(user_id,request_key,digest,response) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,key,digest,receipt,user,state.revision,body));
 statements.push(db.prepare('INSERT OR IGNORE INTO coaching_changes(user_id,revision,action,at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,state.revision,action,new Date().toISOString(),user,state.revision,body));
 const result=await db.batch(statements);
 if(!result[0].meta.changes)throw Object.assign(Error('تعارض تحديث؛ حدّث بياناتك وحاول تاني.'),{status:409});
 state.workoutArchives=[];return state;
}
