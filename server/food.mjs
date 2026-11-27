import {clockNow,isoNow,clockDate,clockTimeZone} from './clock.mjs';
import library from '../data/planning-library.json' with {type:'json'};
import {alternatives,scaleSnapshot,sumSnapshots,assessDay,nutritionQualityIssues} from '../planner-core.mjs';
import {assertDietDay} from '../diet-patterns.mjs';
import {number,dateForLog as validateLogDate,localDate} from '../coaching-shared.mjs';
import {getFoodCatalogItem} from './food-catalog.mjs';
import {apiError} from '../coaching-error.mjs';
export {library};
const dateForLog=(date,tz=clockTimeZone())=>validateLogDate(date,clockNow(),tz);
const metrics=['energy','protein','fat','carbs','fiber','saturated','sodium','sugars'];
const SLOTS=new Set(['breakfast','lunch','dinner','snack']);
const DISPLAY_SLOTS=new Set(['breakfast','lunch','dinner','snack','snack_1','snack_2','suhoor','iftar','night_snack','ramadan_snack']);
export const activePlan=s=>(s?.plans||[]).find(p=>p.id===s?.active_plan_id);
export function plannedEnergyForDate(s,date){
 const direct=activePlan(s)?.days.find(d=>d.date===date);if(direct?.targets?.energy!=null)return direct.targets.energy;
 const refs=[...(s?.planRefs||[]),...(s?.plans||[]).filter(p=>!(s?.planRefs||[]).some(r=>r.id===p.id)).map(p=>({start_date:p.start_date,end_date:p.days.at(-1)?.date,effective_from:p.effective_from,energy:p.targets.energy}))];
 return refs.slice().reverse().find(p=>(p.effective_from||p.start_date)<=date&&p.end_date>=date)?.energy??null;
}
export function plannedMeal(s,id){const plan=activePlan(s);const day=plan?.days.find(d=>d.meals.some(m=>m.id===id));const meal=day?.meals.find(m=>m.id===id);if(!meal)throw apiError('PLANNED_MEAL_NOT_FOUND','Planned meal not found in the active nutrition plan.',{status:404});return {plan,day,meal};}
function freezeSnapshot(snapshot){return {name:snapshot.name,values:structuredClone(snapshot.values),estimated_values:snapshot.estimated_values,template_id:snapshot.template_id,ingredients:(snapshot.ingredients||[]).map(i=>({key:i.key,name:i.name,grams:i.grams,state:i.state,food_id:i.food_id,source:i.source,reference:i.reference,values_per_100g:i.values_per_100g})),is_approximate:!!snapshot.is_approximate};}
export function dayTotals(s,date){
 const dayEntries=(s?.foodEntries||[]).filter(e=>e.date===date);
 const totals=Object.fromEntries(metrics.map(k=>[k,dayEntries.length&&dayEntries.every(e=>e.snapshot.values[k]!=null)?Math.round(dayEntries.reduce((sum,e)=>sum+Number(e.snapshot.values[k]),0)*100)/100:null]));
 const day=(s?.foodLogs||[]).find(d=>d.date===date);
 if(!dayEntries.length&&day&&day.source!=='entries')for(const key of metrics)totals[key]=day[key]??null;
 return {date,entries:dayEntries,totals,complete:!!day?.complete,planEnergy:day?.plannedEnergy??plannedEnergyForDate(s,date)};
}
function refreshDay(s,date){
 const day=s.foodLogs.find(d=>d.date===date)||{date,complete:false};
 const {totals}=dayTotals(s,date);const energy=totals.energy||0;const plannedEnergy=day.plannedEnergy??plannedEnergyForDate(s,date);
 const adherence=plannedEnergy?Math.max(0,Math.round(100-Math.abs(energy-plannedEnergy)/plannedEnergy*100)):null;
 s.foodLogs=s.foodLogs.filter(d=>d.date!==date);s.foodLogs.push({...day,energy,protein:totals.protein,plannedEnergy,adherence,source:'entries',planId:day.planId||s.active_plan_id});
}
function rescaleSnapshotDirect(snapshot,factor){
 const scaleVal=v=>v==null?null:String(Math.round(Number(v)*factor*100)/100);
 return {
  ...snapshot,
  values:Object.fromEntries(metrics.map(k=>[k,scaleVal(snapshot.values?.[k])])),
  estimated_values:snapshot.estimated_values?Object.fromEntries(Object.entries(snapshot.estimated_values).map(([k,v])=>[k,scaleVal(v)])):snapshot.estimated_values,
  ingredients:(snapshot.ingredients||[]).map(i=>({...i,...(i.grams!=null?{grams:String(Math.round(Number(i.grams)*factor*10)/10)}:{}),...(i.quantity!=null?{quantity:String(Math.round(Number(i.quantity)*factor*100)/100)}:{})}))
 };
}
function applySingleFoodEntry(s,p,tz){
 const date=dateForLog(p.date||localDate(clockNow(),tz),tz);
 if(!['planned','ingredient','recipe','barcode','manual'].includes(p.source))throw apiError('INVALID_FOOD_SOURCE','Food entry source must be planned, ingredient, recipe, barcode, or manual.',{status:400});
 if(!SLOTS.has(p.slot))throw apiError('INVALID_MEAL_SLOT','slot must be one of breakfast, lunch, dinner, or snack.',{status:400});
 const displaySlot=p.displaySlot!=null?(DISPLAY_SLOTS.has(String(p.displaySlot))?String(p.displaySlot):(()=>{throw apiError('INVALID_MEAL_SLOT','Invalid displaySlot value.',{status:400});})()):null;
 const previous=s.foodLogs.find(d=>d.date===date);if(previous&&previous.source!=='entries')throw apiError('DAILY_TOTAL_REQUIRES_DETAILED_CONVERSION','This day already has a daily total log; switch to detailed entries before adding individual meals.',{status:400});
 let snapshot,mealId=null,planId=null,recipeId=null,recipeUnit=null,recipeTotalGrams=null,recipeServings=null,barcode=null,quantity,fromPantry=p.fromPantry===true;
 if(p.source==='planned'){
  const {plan,day,meal}=plannedMeal(s,p.mealId);if(day.date!==date)throw apiError('MEAL_DATE_MISMATCH','Logged date does not match the planned meal\'s scheduled date.',{status:400});if(p.slot!==meal.slot)throw apiError('MEAL_SLOT_MISMATCH','Logged slot does not match the planned meal\'s slot.',{status:400});
  if(s.foodEntries.some(e=>e.date===date&&e.mealId===meal.id))throw apiError('PLANNED_MEAL_ALREADY_LOGGED','Planned meal has already been logged; update or delete the entry to adjust quantity.',{status:400});
  quantity=number(p.quantity,.1,10,'quantity');snapshot=rescaleSnapshotDirect(meal.snapshot,quantity);mealId=meal.id;planId=plan.id;if(meal.fromPantry)fromPantry=true;
 }else if(p.source==='ingredient'){
  const itemKey=typeof p.key==='string'?p.key:(typeof p.foodId==='string'?p.foodId:null);
  const i=itemKey&&Object.hasOwn(library.ingredients,itemKey)?library.ingredients[itemKey]:null;
  const catItem=!i&&itemKey?getFoodCatalogItem(itemKey):null;
  if(!i&&!catItem)throw apiError('FOOD_NOT_FOUND','Food item not found.',{status:404});
  const gramsAvailable=Boolean(i||catItem?.quantity_basis?.grams_available);
  const isReferenceServing=Boolean(!i&&catItem&&(p.unit==='reference'||(!gramsAvailable&&(p.quantity!=null||p.servings!=null))));
  if(isReferenceServing){
   quantity=number(p.quantity??p.servings??1,.1,20,'quantity');
   snapshot={
    name:catItem.name,
    is_approximate:catItem.status==='estimated'||Boolean(catItem.isApproximate),
    values:Object.fromEntries(metrics.map(k=>[k,catItem.values[k]==null?null:String(Math.round(Number(catItem.values[k])*quantity*100)/100)])),
    ingredients:[{key:catItem.id,name:catItem.name,grams:null,quantity:String(quantity),unit:'reference',state:catItem.state,food_id:catItem.id,source:catItem.source,reference:catItem.reference,values_per_100g:catItem.values}]
   };
  }else{
   if(!gramsAvailable)throw apiError('FOOD_NOT_FOUND','Food item does not have verified gram-basis nutrition; log with unit: "reference" and quantity.',{status:404});
   quantity=number(p.grams,1,5000,'grams');
   if(i){
    snapshot={name:i.label,values:Object.fromEntries(metrics.map(k=>[k,i.values[k]==null?null:String(Number(i.values[k])*quantity/100)])),ingredients:[{key:i.key,name:i.label,grams:String(quantity),state:i.state,food_id:i.food_id,source:i.source,reference:i.reference,values_per_100g:i.values}]};
   }else{
    snapshot={name:catItem.name,is_approximate:catItem.status==='estimated'||Boolean(catItem.isApproximate),values:Object.fromEntries(metrics.map(k=>[k,catItem.values[k]==null?null:String(Number(catItem.values[k])*quantity/100)])),ingredients:[{key:catItem.id,name:catItem.name,grams:String(quantity),state:catItem.state,food_id:catItem.id,source:catItem.source,reference:catItem.reference,values_per_100g:catItem.values}]};
   }
  }
 }else if(p.source==='recipe'){
  const targetId=typeof p.recipeId==='string'?p.recipeId.trim():'';
  const recipe=(s.customRecipes||[]).find(r=>r.id===targetId);
  if(!recipe)throw apiError('RECIPE_NOT_FOUND','Saved custom recipe not found.',{status:404});
  const byGrams=p.grams!=null&&p.grams!==''&&p.servings==null;
  let scaleRatio;
  if(byGrams){
   quantity=number(p.grams,1,5000,'grams');
   recipeUnit='grams';
   scaleRatio=quantity/(Number(recipe.totalGrams)||100);
  }else{
   quantity=number(p.servings??p.quantity??1,.1,20,'quantity');
   recipeUnit='servings';
   scaleRatio=quantity/(Number(recipe.servings)||1);
  }
  recipeId=recipe.id;recipeTotalGrams=Number(recipe.totalGrams)||100;recipeServings=Number(recipe.servings)||1;
  const values=Object.fromEntries(metrics.map(k=>{
   const tot=recipe.totals?.[k];
   return [k,tot==null?null:String(Math.round(Number(tot)*scaleRatio*100)/100)];
  }));
  snapshot={
   name:recipe.name,
   is_approximate:Boolean(recipe.isApproximate),
   values,
   ingredients:(recipe.ingredients||[]).map(ing=>({
    key:ing.key||ing.foodId,
    name:ing.name,
    grams:String(Math.round(Number(ing.grams)*scaleRatio*10)/10),
    state:ing.state||'as_sold',
    food_id:ing.foodId,
    source:ing.source||'catalog',
    values_per_100g:ing.values_per_100g
   }))
  };
 }else if(p.source==='barcode'){
  barcode=String(p.barcode??p.ean??'').trim().slice(0,32)||null;
  const name=(typeof p.nameEn==='string'&&p.nameEn.trim())||(typeof p.name==='string'&&p.name.trim())||(barcode?`Product ${barcode}`:'');
  if(!barcode||!name||name.length>160)throw apiError('INVALID_BARCODE_FORMAT','Barcode food entry requires barcode/ean and product name.',{status:400});
  const provenance=typeof p.provenance==='string'?p.provenance:'verified_brand';
  const isApprox=typeof p.isApproximate==='boolean'?p.isApproximate:(provenance==='pending_review');
  const brand=typeof p.brand==='string'&&p.brand.trim()?p.brand.trim().slice(0,120):null;
  if(p.valuesPer100g&&typeof p.valuesPer100g==='object'){
   const grams=p.grams!=null?number(p.grams,1,5000,'grams'):(number(p.servings??p.quantity??1,.1,20,'servings')*number(p.servingSizeGrams??100,1,2000,'servingSizeGrams'));
   quantity=Math.round(grams*10)/10;
   const vp=p.valuesPer100g;
   const vals=Object.fromEntries(metrics.map(k=>[k,vp[k]==null?null:String(Math.round(Number(vp[k])*quantity/100*100)/100)]));
   if(vals.energy==null||Number(vals.energy)<=0)throw apiError('MANUAL_MEAL_ENERGY_REQUIRED','Positive actual energy (kcal > 0) is required for food entries.',{status:400});
   snapshot={name,...(brand?{brand}:{}),values:vals,ingredients:[{key:barcode,name,grams:String(quantity),state:'as_sold',food_id:barcode,source:`barcode:${provenance}`,values_per_100g:vp}],is_approximate:isApprox};
  }else{
   quantity=p.grams!=null?number(p.grams,1,5000,'grams'):100;
   const vals=Object.fromEntries(metrics.map(k=>[k,p[k]==null||p[k]===''?null:String(number(p[k],0,k==='energy'?10000:k==='sodium'?50000:2000,k))]));
   if(vals.energy==null||Number(vals.energy)<=0)throw apiError('MANUAL_MEAL_ENERGY_REQUIRED','Positive actual energy (kcal > 0) is required for food entries.',{status:400});
   snapshot={name,...(brand?{brand}:{}),values:vals,ingredients:[],is_approximate:isApprox};
  }
 }else{
  const explicitName=p.name;
  const rawName=explicitName==null?'':String(explicitName).trim();
  const name=!rawName&&Number(p.energy)>0?'Quick Add':rawName;
  if(!name||name.length>120)throw apiError('INVALID_MEAL_NAME','Manual meal name must be non-empty and at most 120 characters.',{status:400});
  snapshot={name,values:Object.fromEntries(metrics.map(k=>[k,p[k]==null||p[k]===''?null:String(number(p[k],0,k==='energy'?10000:k==='sodium'?50000:2000,k))])),ingredients:[],is_approximate:true};
  if(snapshot.values.energy==null||Number(snapshot.values.energy)<=0)throw apiError('MANUAL_MEAL_ENERGY_REQUIRED','Positive actual energy (kcal > 0) is required for manual food entries.',{status:400});
 }
 s.foodEntries.push({id:crypto.randomUUID(),date,slot:p.slot,...(displaySlot?{displaySlot}:{}),source:p.source,mealId,planId,...(recipeId?{recipeId,recipeUnit,recipeTotalGrams,recipeServings}:{}),...(barcode?{barcode}:{}),...(fromPantry?{fromPantry:true}:{}),quantity,at:isoNow(),snapshot:freezeSnapshot(snapshot)});
 refreshDay(s,date);
 Object.assign(s.foodLogs.find(d=>d.date===date),{complete:false,completionPolicy:1,confirmedAt:null});
}
export function foodCommand(s,action,p){
 s.foodEntries||=[];
 const tz=s?.profile?.timezone||clockTimeZone();
 if(action==='food_entry'){
  applySingleFoodEntry(s,p,tz);
 }else if(action==='food_entry_batch'){
  const items=p?.items;
  if(!Array.isArray(items)||items.length<1||items.length>15)throw apiError('VALIDATION_ERROR','food_entry_batch requires items array containing 1 to 15 food entries.',{status:400});
  const staged=structuredClone(s);
  for(const item of items){
   if(!item||typeof item!=='object')throw apiError('VALIDATION_ERROR','Each batch entry must be a JSON object.',{status:400});
   applySingleFoodEntry(staged,{...(p.date&&!item.date?{date:p.date}:{}),...(p.slot&&!item.slot?{slot:p.slot}:{}),...(p.displaySlot&&item.displaySlot===undefined?{displaySlot:p.displaySlot}:{}),...item},tz);
  }
  s.foodEntries=staged.foodEntries;
  s.foodLogs=staged.foodLogs;
 }else if(action==='food_switch_to_entries'){
  const date=dateForLog(p.date,tz),previous=s.foodLogs.find(d=>d.date===date);
  if(p.confirm!==true||!previous||previous.source==='entries')throw apiError('CONVERT_DETAILED_CONFIRMATION_REQUIRED','Switching a daily-total log to detailed entries requires confirm: true on a daily-total day.',{status:400});
  s.history.push({kind:'food_diary_mode',at:isoNow(),previous:structuredClone(previous)});
  s.foodLogs=s.foodLogs.filter(d=>d.date!==date);refreshDay(s,date);
 }else if(action==='food_entry_update'){
  const idx=(s.foodEntries||[]).findIndex(e=>e.id===p.id);
  if(idx<0)throw apiError('FOOD_ENTRY_NOT_FOUND','Food log entry not found.',{status:404});
  const existing=s.foodEntries[idx];
  const nextSlot=p.slot!=null?p.slot:existing.slot;
  if(!SLOTS.has(nextSlot))throw apiError('INVALID_MEAL_SLOT','Meal slot must be breakfast, lunch, dinner, or snack.',{status:400});
  let nextDisplaySlot=existing.displaySlot;
  if(p.displaySlot!==undefined){
   nextDisplaySlot=p.displaySlot==null||p.displaySlot===''?undefined:(DISPLAY_SLOTS.has(String(p.displaySlot))?String(p.displaySlot):(()=>{throw apiError('INVALID_MEAL_SLOT','Invalid displaySlot value.',{status:400});})());
  }
  let nextQuantity=existing.quantity,nextSnapshot=existing.snapshot,nextRecipeUnit=existing.recipeUnit;
  if(existing.source==='planned'){
   nextQuantity=p.quantity!=null?number(p.quantity,.1,10,'quantity'):existing.quantity;
   if(nextQuantity!==existing.quantity){
    const factor=nextQuantity/(Number(existing.quantity)||1);
    nextSnapshot=freezeSnapshot(rescaleSnapshotDirect(existing.snapshot,factor));
   }
  }else if(existing.source==='ingredient'||existing.source==='barcode'){
   const firstIng=existing.snapshot?.ingredients?.[0];
   const isRef=existing.source==='ingredient'&&(p.unit==='reference'||(p.unit==null&&firstIng?.unit==='reference'));
   if(isRef){
    nextQuantity=p.quantity!=null?number(p.quantity,.1,20,'quantity'):existing.quantity;
   }else{
    nextQuantity=p.grams!=null?number(p.grams,1,5000,'grams'):(p.quantity!=null?number(p.quantity,1,5000,'grams'):existing.quantity);
   }
   if(nextQuantity!==existing.quantity){
    if(firstIng?.values_per_100g&&!isRef){
     const vp=firstIng.values_per_100g;
     const nextVals=Object.fromEntries(metrics.map(k=>[k,vp[k]==null?null:String(Math.round(Number(vp[k])*nextQuantity/100*100)/100)]));
     nextSnapshot=freezeSnapshot({...existing.snapshot,values:nextVals,ingredients:[{...firstIng,grams:String(nextQuantity)}]});
    }else if(firstIng?.values_per_100g&&isRef){
     const vp=firstIng.values_per_100g;
     const nextVals=Object.fromEntries(metrics.map(k=>[k,vp[k]==null?null:String(Math.round(Number(vp[k])*nextQuantity*100)/100)]));
     nextSnapshot=freezeSnapshot({...existing.snapshot,values:nextVals,ingredients:[{...firstIng,quantity:String(nextQuantity)}]});
    }else{
     const factor=nextQuantity/(Number(existing.quantity)||1);
     nextSnapshot=freezeSnapshot(rescaleSnapshotDirect(existing.snapshot,factor));
    }
   }
  }else if(existing.source==='recipe'){
   const rec=(s.customRecipes||[]).find(r=>r.id===existing.recipeId)||null;
   if(p.grams!=null&&p.grams!==''){
    const prevTotalGrams=(existing.recipeUnit==='grams'?Number(existing.quantity):(existing.recipeTotalGrams?(Number(existing.recipeTotalGrams)/Math.max(0.5,Number(existing.recipeServings||1)))*Number(existing.quantity||1):0))||((existing.snapshot?.ingredients||[]).reduce((sum,i)=>sum+Number(i.grams||0),0)||Number(existing.quantity||100));
    nextQuantity=number(p.grams,1,5000,'grams');
    nextRecipeUnit='grams';
    if(rec){
     const ratio=nextQuantity/(Number(rec.totalGrams)||100);
     const vals=Object.fromEntries(metrics.map(k=>[k,rec.totals?.[k]==null?null:String(Math.round(Number(rec.totals[k])*ratio*100)/100)]));
     nextSnapshot=freezeSnapshot({...existing.snapshot,values:vals,ingredients:(rec.ingredients||[]).map(ing=>({...ing,grams:String(Math.round(Number(ing.grams)*ratio*10)/10)}))});
    }else{
     nextSnapshot=freezeSnapshot(rescaleSnapshotDirect(existing.snapshot,nextQuantity/(prevTotalGrams||1)));
    }
   }else if(p.servings!=null||p.quantity!=null){
    nextQuantity=number(p.servings??p.quantity,.1,20,'quantity');
    nextRecipeUnit='servings';
    if(rec){
     const ratio=nextQuantity/(Number(rec.servings)||1);
     const vals=Object.fromEntries(metrics.map(k=>[k,rec.totals?.[k]==null?null:String(Math.round(Number(rec.totals[k])*ratio*100)/100)]));
     nextSnapshot=freezeSnapshot({...existing.snapshot,values:vals,ingredients:(rec.ingredients||[]).map(ing=>({...ing,grams:String(Math.round(Number(ing.grams)*ratio*10)/10)}))});
    }else{
     const baseTotalG=existing.recipeTotalGrams||((existing.snapshot?.ingredients||[]).reduce((sum,i)=>sum+Number(i.grams||0),0)||(Number(existing.quantity)||100));
     const baseServ=existing.recipeServings||1;
     const prevServings=existing.recipeUnit==='grams'?(Number(existing.quantity)/Math.max(1,baseTotalG))*baseServ:(Number(existing.quantity)||1);
     nextSnapshot=freezeSnapshot(rescaleSnapshotDirect(existing.snapshot,nextQuantity/Math.max(0.01,prevServings)));
    }
   }
  }else{
   const nextName=p.name!=null?String(p.name).trim():existing.snapshot?.name||'';
   if(!nextName||nextName.length>120)throw apiError('INVALID_MEAL_NAME','Manual meal name must be non-empty and at most 120 characters.',{status:400});
   const prevVals=existing.snapshot?.values||{};
   const nextVals=Object.fromEntries(metrics.map(k=>{
    if(p[k]!==undefined)return [k,p[k]==null||p[k]===''?null:String(number(p[k],0,k==='energy'?10000:k==='sodium'?50000:2000,k))];
    return [k,prevVals[k]??null];
   }));
   if(nextVals.energy==null||Number(nextVals.energy)<=0)throw apiError('MANUAL_MEAL_ENERGY_REQUIRED','Positive actual energy (kcal > 0) is required for manual food entries.',{status:400});
   nextSnapshot=freezeSnapshot({...existing.snapshot,name:nextName,values:nextVals});
  }
  const updatedEntry={...existing,slot:nextSlot,quantity:nextQuantity,...(nextRecipeUnit?{recipeUnit:nextRecipeUnit}:{}),snapshot:nextSnapshot,updatedAt:isoNow()};
  if(nextDisplaySlot!==undefined)updatedEntry.displaySlot=nextDisplaySlot;else delete updatedEntry.displaySlot;
  s.foodEntries[idx]=updatedEntry;
  refreshDay(s,existing.date);
  Object.assign(s.foodLogs.find(d=>d.date===existing.date),{complete:false,confirmedAt:null,completionPolicy:1});
 }else if(action==='food_delete'){
  const entry=s.foodEntries.find(e=>e.id===p.id);if(!entry)throw apiError('FOOD_ENTRY_NOT_FOUND','Food log entry not found.',{status:404});s.foodEntries=s.foodEntries.filter(e=>e.id!==p.id);refreshDay(s,entry.date);
  Object.assign(s.foodLogs.find(d=>d.date===entry.date),{complete:false,confirmedAt:null,completionPolicy:1});
 }else if(action==='food_complete'){
  const date=dateForLog(p.date,tz);if(typeof p.complete!=='boolean')throw apiError('FOOD_COMPLETE_FLAG_REQUIRED','Boolean complete field is required.',{status:400});
  if(!s.foodEntries.some(e=>e.date===date))throw apiError('FOOD_LOG_REQUIRED_BEFORE_COMPLETE','Log at least one meal before closing the day.',{status:400});
  refreshDay(s,date);Object.assign(s.foodLogs.find(d=>d.date===date),{complete:p.complete,completionPolicy:1,confirmedAt:p.complete?isoNow():null});
 }else throw apiError('INVALID_FOOD_ACTION','Unknown food command action.',{status:400});
 return s;
}
export function mealAlternatives(s,mealId,limit=6){
 const {plan,day,meal}=plannedMeal(s,mealId);
 return alternatives(meal,s.preferences,library,limit,s.profile,a=>{
  try{const snapshots=day.meals.map(m=>m.id===mealId?a.snapshot:m.snapshot);assertDietDay(snapshots,s.preferences.diet,day.targets||plan.targets,s.profile);return !nutritionQualityIssues(sumSnapshots(snapshots),day.targets||plan.targets).length;}catch{return false;}
 });
}
export function replaceMeal(s,p){
 const tz=s?.profile?.timezone||clockTimeZone();
 const {plan,day,meal}=plannedMeal(s,p.mealId);
 if(day.date<localDate(clockNow(),tz))throw apiError('PAST_DAY_PLAN_IMMUTABLE','Past plan days cannot be modified.',{status:400});
 if((s.foodEntries||[]).some(e=>e.mealId===meal.id))throw apiError('MEAL_ALREADY_CONSUMED','Cannot replace a meal that has already been logged as consumed.',{status:400});
 const targetTemplate=p.templateId||p.alternativeId;
 // Validate against the full eligible alternative pool (up to 100) so Pantry alternatives are accepted cleanly.
 const alternative=mealAlternatives(s,p.mealId,100).find(a=>a.snapshot.template_id===targetTemplate);if(!alternative)throw apiError('MEAL_ALTERNATIVE_UNAVAILABLE','Selected meal alternative is no longer valid under your current constraints.',{status:400});
 const next=structuredClone(plan);next.id='plan-'+crypto.randomUUID();next.parent_id=plan.id;next.created_at=isoNow();next.changeReason='Meal replaced by user selection';
 const updated=next.days.find(d=>d.date===day.date);const updatedMeal=updated.meals.find(m=>m.id===meal.id);updatedMeal.snapshot=alternative.snapshot;if(p.fromPantry===true)updatedMeal.fromPantry=true;
 updated.summary=sumSnapshots(updated.meals.map(m=>m.snapshot));next.warnings=next.days.flatMap(d=>{const messages=assessDay(d.summary,d.targets||next.targets);return messages.length?[{date:d.date,messages}]:[];});
 if(s.groceryChecks){
  const prefix=plan.id+':';
  for(const [k,v] of Object.entries(s.groceryChecks)){
   if(k.startsWith(prefix)&&v?.checked){
    const ingKey=k.slice(prefix.length);
    s.groceryChecks[`${next.id}:${ingKey}`]={planId:next.id,ingredientKey:ingKey,checked:true,updatedAt:v.updatedAt||next.created_at};
   }
  }
 }
 s.plans.push(next);s.active_plan_id=next.id;return s;
}
