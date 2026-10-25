import {clockNow,isoNow,clockDate,clockTimeZone} from './clock.mjs';
import library from '../data/planning-library.json' with {type:'json'};
import {alternatives,scaleSnapshot,sumSnapshots,assessDay,nutritionQualityIssues} from '../planner-core.mjs';
import {assertDietDay} from '../diet-patterns.mjs';
import {number,dateForLog as validateLogDate,localDate} from '../coaching-shared.mjs';
import {getFoodCatalogItem} from './food-catalog.mjs';
export {library};
const dateForLog=(date,tz=clockTimeZone())=>validateLogDate(date,clockNow(),tz);
const metrics=['energy','protein','fat','carbs','fiber','saturated','sodium','sugars'];
export const activePlan=s=>s.plans.find(p=>p.id===s.active_plan_id);
export function plannedEnergyForDate(s,date){
 const direct=activePlan(s)?.days.find(d=>d.date===date);if(direct?.targets?.energy!=null)return direct.targets.energy;
 const refs=[...(s.planRefs||[]),...s.plans.filter(p=>!(s.planRefs||[]).some(r=>r.id===p.id)).map(p=>({start_date:p.start_date,end_date:p.days.at(-1)?.date,effective_from:p.effective_from,energy:p.targets.energy}))];
 return refs.slice().reverse().find(p=>(p.effective_from||p.start_date)<=date&&p.end_date>=date)?.energy??null;
}
export function plannedMeal(s,id){const plan=activePlan(s);const day=plan?.days.find(d=>d.meals.some(m=>m.id===id));const meal=day?.meals.find(m=>m.id===id);if(!meal)throw Error('الوجبة غير موجودة في الخطة الحالية.');return {plan,day,meal};}
function freezeSnapshot(snapshot){return {name:snapshot.name,values:structuredClone(snapshot.values),estimated_values:snapshot.estimated_values,template_id:snapshot.template_id,ingredients:(snapshot.ingredients||[]).map(i=>({key:i.key,name:i.name,grams:i.grams,state:i.state,food_id:i.food_id,source:i.source,reference:i.reference,values_per_100g:i.values_per_100g})),is_approximate:!!snapshot.is_approximate};}
export function dayTotals(s,date){
 const dayEntries=(s.foodEntries||[]).filter(e=>e.date===date);
 const totals=Object.fromEntries(metrics.map(k=>[k,dayEntries.length&&dayEntries.every(e=>e.snapshot.values[k]!=null)?Math.round(dayEntries.reduce((sum,e)=>sum+Number(e.snapshot.values[k]),0)*100)/100:null]));
 const day=s.foodLogs.find(d=>d.date===date);
 if(!dayEntries.length&&day&&day.source!=='entries')for(const key of metrics)totals[key]=day[key]??null;
 return {date,entries:dayEntries,totals,complete:!!day?.complete,planEnergy:day?.plannedEnergy??plannedEnergyForDate(s,date)};
}
function refreshDay(s,date){
 const day=s.foodLogs.find(d=>d.date===date)||{date,complete:false};
 const {totals}=dayTotals(s,date);const energy=totals.energy||0;const plannedEnergy=day.plannedEnergy??plannedEnergyForDate(s,date);
 const adherence=plannedEnergy?Math.max(0,Math.round(100-Math.abs(energy-plannedEnergy)/plannedEnergy*100)):null;
 s.foodLogs=s.foodLogs.filter(d=>d.date!==date);s.foodLogs.push({...day,energy,protein:totals.protein,plannedEnergy,adherence,source:'entries',planId:day.planId||s.active_plan_id});
}
export function foodCommand(s,action,p){
 s.foodEntries||=[];
 const tz=s?.profile?.timezone||clockTimeZone();
 if(action==='food_entry'){
  const date=dateForLog(p.date||localDate(clockNow(),tz),tz);if(!['planned','ingredient','manual'].includes(p.source))throw Error('مصدر الوجبة غير صالح.');
  if(!['breakfast','lunch','dinner','snack'].includes(p.slot))throw Error('حدد الوجبة.');
  const previous=s.foodLogs.find(d=>d.date===date);if(previous&&previous.source!=='entries')throw Error('اليوم مسجل كإجمالي؛ حوّله صراحةً إلى السجل التفصيلي قبل إضافة وجبات.');
  let snapshot,mealId=null,planId=null,quantity;
  if(p.source==='planned'){
   const {plan,day,meal}=plannedMeal(s,p.mealId);if(day.date!==date)throw Error('التاريخ لا يطابق الوجبة المخططة.');if(p.slot!==meal.slot)throw Error('نوع الوجبة لا يطابق الخطة.');
   if(s.foodEntries.some(e=>e.date===date&&e.mealId===meal.id))throw Error('الوجبة دي متسجلة بالفعل؛ احذف التسجيل قبل تصحيح الكمية.');
   quantity=number(p.quantity,.1,4,'نسبة الحصة');snapshot=scaleSnapshot(meal.snapshot,quantity);mealId=meal.id;planId=plan.id;
  }else if(p.source==='ingredient'){
   const i=typeof p.key==='string'&&Object.hasOwn(library.ingredients,p.key)?library.ingredients[p.key]:null;
   const catItem=!i&&typeof p.key==='string'?getFoodCatalogItem(p.key):null;
   if(!i&&(!catItem||catItem.status!=='approved'||!catItem.quantity_basis?.grams_available))throw Error('الصنف غير موجود.');
   quantity=number(p.grams,1,2000,'الكمية بالجرام');
   if(i){
    snapshot={name:i.label,values:Object.fromEntries(metrics.map(k=>[k,i.values[k]==null?null:String(Number(i.values[k])*quantity/100)])),ingredients:[{key:i.key,name:i.label,grams:String(quantity),state:i.state,food_id:i.food_id,source:i.source,reference:i.reference,values_per_100g:i.values}]};
   }else{
    snapshot={name:catItem.name,values:Object.fromEntries(metrics.map(k=>[k,catItem.values[k]==null?null:String(Number(catItem.values[k])*quantity/100)])),ingredients:[{key:catItem.id,name:catItem.name,grams:String(quantity),state:catItem.state,food_id:catItem.id,source:catItem.source,values_per_100g:catItem.values}]};
   }
  }else{
   const name=typeof p.name==='string'?p.name.trim():'';if(!name||name.length>120)throw Error('اكتب اسم الوجبة في حدود 120 حرف.');
   snapshot={name,values:Object.fromEntries(metrics.map(k=>[k,p[k]==null||p[k]===''?null:String(number(p[k],0,k==='energy'?10000:k==='sodium'?50000:2000,k))])),ingredients:[],is_approximate:true};
   if(snapshot.values.energy==null||Number(snapshot.values.energy)<=0)throw Error('السعرات الفعلية مطلوبة للوجبة اليدوية.');
  }
  s.foodEntries.push({id:crypto.randomUUID(),date,slot:p.slot,source:p.source,mealId,planId,quantity,at:isoNow(),snapshot:freezeSnapshot(snapshot)});
  refreshDay(s,date);
  Object.assign(s.foodLogs.find(d=>d.date===date),{complete:false,completionPolicy:1,confirmedAt:null});
 }else if(action==='food_switch_to_entries'){
  const date=dateForLog(p.date,tz),previous=s.foodLogs.find(d=>d.date===date);
  if(p.confirm!==true||!previous||previous.source==='entries')throw Error('تأكيد تحويل إجمالي اليوم إلى تسجيل تفصيلي مطلوب.');
  s.history.push({kind:'food_diary_mode',at:isoNow(),previous:structuredClone(previous)});
  s.foodLogs=s.foodLogs.filter(d=>d.date!==date);refreshDay(s,date);
 }else if(action==='food_delete'){
  const entry=s.foodEntries.find(e=>e.id===p.id);if(!entry)throw Error('التسجيل غير موجود.');s.foodEntries=s.foodEntries.filter(e=>e.id!==p.id);refreshDay(s,entry.date);
  Object.assign(s.foodLogs.find(d=>d.date===entry.date),{complete:false,confirmedAt:null,completionPolicy:1});
 }else if(action==='food_complete'){
  const date=dateForLog(p.date,tz);if(typeof p.complete!=='boolean')throw Error('حدد اكتمال اليوم.');
  if(!s.foodEntries.some(e=>e.date===date))throw Error('سجّل أكلك الأول قبل إغلاق اليوم.');
  refreshDay(s,date);Object.assign(s.foodLogs.find(d=>d.date===date),{complete:p.complete,completionPolicy:1,confirmedAt:p.complete?isoNow():null});
 }else throw Error('عملية أكل غير معروفة');
 return s;
}
export function mealAlternatives(s,mealId){
 const {plan,day,meal}=plannedMeal(s,mealId);
 return alternatives(meal,s.preferences,library,30,s.profile).filter(a=>{
  try{const snapshots=day.meals.map(m=>m.id===mealId?a.snapshot:m.snapshot);assertDietDay(snapshots,s.preferences.diet,day.targets||plan.targets,s.profile);return !nutritionQualityIssues(sumSnapshots(snapshots),day.targets||plan.targets).length;}catch{return false;}
 }).slice(0,6);
}
export function replaceMeal(s,p){
 const tz=s?.profile?.timezone||clockTimeZone();
 const {plan,day,meal}=plannedMeal(s,p.mealId);
 if(day.date<localDate(clockNow(),tz))throw Error('لا نغيّر خطط أيام فاتت.');
 if((s.foodEntries||[]).some(e=>e.mealId===meal.id))throw Error('الوجبة اتسجلت كأكل فعلي؛ اختار وجبة لسه متاكلتش.');
 const targetTemplate=p.templateId||p.alternativeId;
 const alternative=mealAlternatives(s,p.mealId).find(a=>a.snapshot.template_id===targetTemplate);if(!alternative)throw Error('البديل لم يعد متاحًا تحت نفس اختياراتك.');
 const next=structuredClone(plan);next.id='plan-'+crypto.randomUUID();next.parent_id=plan.id;next.created_at=isoNow();next.changeReason='استبدال وجبة باختيارك';
 const updated=next.days.find(d=>d.date===day.date);updated.meals.find(m=>m.id===meal.id).snapshot=alternative.snapshot;
 updated.summary=sumSnapshots(updated.meals.map(m=>m.snapshot));next.warnings=next.days.flatMap(d=>{const messages=assessDay(d.summary,d.targets||next.targets);return messages.length?[{date:d.date,messages}]:[];});
 s.plans.push(next);s.active_plan_id=next.id;return s;
}
