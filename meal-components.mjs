import {METRICS,ingredientAllowed,fitMeal,combineSnapshots,validatePreferences,planningTemplates} from './planner-core.mjs';
import {aggregate} from './calculator.mjs';
import {MENU_PARTS} from './egyptian-menu.mjs';
import {displayIngredientName,displayMealName} from './meal-presentation.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const tiers={low:1,medium:2,high:3};
const roleOf=i=>({protein:'main',carb:'starch',veg:'side',fruit:'fruit',fat:'fat'}[i.role]||'other');
// Existing authored/custom component snapshots retain their own quantity basis,
// including source servings with unknown mass. Never subtract from NULL totals.
export function mealComponents(snapshot) {
  if(snapshot.components?.length)return snapshot.components.map(clone);
  if(!snapshot.ingredients?.length)return [];
  if(snapshot.ingredients.some(i=>!i.values_per_100g||i.grams==null))return [clone(snapshot)];
  return snapshot.ingredients.map(i=>{
    const result=aggregate([{grams:i.grams,values:i.values_per_100g,factors:Object.fromEntries(METRICS.map(k=>[k,'1']))}],METRICS);
    return {name:displayIngredientName(i),template_id:null,quality:snapshot.quality,
      values:Object.fromEntries(METRICS.map(k=>[k,result.nutrients[k].total])),
      carb_ids:[i.carb_id],fruit_veg_g:['veg','fruit'].includes(i.role)?Number(i.grams):0,
      ingredients:[clone(i)],component_role:roleOf(i),is_approximate:!!snapshot.is_approximate,
      notes:snapshot.notes};
  });
}
export function componentAlternatives(snapshot,index,prefs,lib,slot=null) {
  const p=validatePreferences(prefs,lib),parts=mealComponents(snapshot),current=parts[index];
  if(!current)throw Error('الجزء المطلوب غير موجود');
  if(current.values.energy == null || Number(current.values.energy)<=0)return [];
  const role=current.component_role||roleOf(current.ingredients?.[0]||{});
  const fingerprint=s=>s.ingredients.map(i=>i.food_id).sort().join('|');
  const eligibleNames=slot&&p.region==='egypt'?new Set(planningTemplates(lib,p).filter(t=>t.meal_slots.includes(slot)).flatMap(t=>t.component_definitions.map(c=>c.name))):null;
  const choices=[];
  let availableParts=MENU_PARTS;
  if(p.diet&&p.diet!=='balanced'){
    availableParts={};
    for(const t of planningTemplates(lib,p))for(const c of t.component_definitions||[])availableParts[t.id+'-'+c.id]={name:c.name,role:c.role,budget:t.budget_tier,items:t.items.filter(i=>i.component_id===c.id).map(({component_id,...i})=>i)};
  }
  for(const [id,part]of Object.entries(availableParts)){
    if(eligibleNames&&!eligibleNames.has(part.name))continue;
    if(part.role!==role||tiers[part.budget]>tiers[p.budget]||part.items.some(i=>!lib.ingredients[i.key]||!ingredientAllowed(lib.ingredients[i.key],p)))continue;
    const t={practical_portions:true,id:'part-'+id,name:part.name,items:part.items,regions:[p.region],budget_tier:part.budget,
      notes:'بديل مقترح بكمية محسوبة من مصدر المكونات؛ راجع فرق السعرات والبروتين.'};
    const next=fitMeal(t,Number(current.values.energy)||150,role==='main'?Number(current.values.protein)||0:0,lib);
    next.template_id=null;next.component_role=role;
    if(fingerprint(next)===fingerprint(current))continue;
    const de=Number(next.values.energy)-Number(current.values.energy),dp=Number(next.values.protein)-Number(current.values.protein);
    choices.push({snapshot:next,energy_delta:current.values.energy==null?null:de,protein_delta:current.values.protein==null?null:dp});
  }
  return choices.sort((a,b)=>Math.abs(a.energy_delta)-Math.abs(b.energy_delta)||Math.abs(a.protein_delta)-Math.abs(b.protein_delta));
}
export function replaceMealComponent(snapshot,index,replacement) {
  const parts=mealComponents(snapshot);
  if(!Number.isInteger(index)||index<0||index>=parts.length)throw Error('الجزء المطلوب غير موجود');
  if(!replacement?.ingredients?.length)throw Error('اختار بديلًا له بيانات وكمية');
  const role=parts[index].component_role||roleOf(parts[index].ingredients?.[0]||{});
  parts[index]={...clone(replacement),component_role:role};
  const name=parts.map(displayMealName).join(' + ').slice(0,120);
  return {...combineSnapshots(name,parts),source_template_id:snapshot.source_template_id||snapshot.template_id||null,
    component_edit:true,engine_version:'weekly-planner-0.3.1'};
}
