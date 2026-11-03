import fs from 'node:fs';
import {REGIONAL_RECIPES,REGION_COUNTRIES} from '../regional-foods.mjs';
const out='docs/regional-foods';fs.mkdirSync(out,{recursive:true});
const summary={version:'regional-menu-1',totalModels:REGIONAL_RECIPES.length,
 dishServingModels:REGIONAL_RECIPES.filter(r=>r.model_kind==='dish_serving').length,
 mealCombinations:REGIONAL_RECIPES.filter(r=>r.model_kind==='meal_combination').length,
 uniqueIds:new Set(REGIONAL_RECIPES.map(r=>r.id)).size,
 uniqueIngredientQuantityCombinations:new Set(REGIONAL_RECIPES.map(r=>JSON.stringify(r.items.map(i=>[i.key,i.grams]).sort()))).size,
 byRegion:Object.fromEntries(Object.keys(REGION_COUNTRIES).map(region=>[region,REGIONAL_RECIPES.filter(r=>r.regions.includes(region)).length])),
 namedModelsByCountry:REGIONAL_RECIPES.filter(r=>r.country).reduce((a,r)=>(a[r.country]=(a[r.country]||0)+1,a),{}),
 scope:'Editorial dish servings/preparation variants and menu combinations; shared combinations count once globally. Not an exhaustive census or laboratory measured recipes'};
fs.writeFileSync(out+'/catalog-summary.json',JSON.stringify(summary,null,2)+'\n');
const rows=[['id','name_ar','regions','country','model_kind','meal_slots','ingredients_ready_to_eat_grams','culinary_context_source','nutrition_quality'],...REGIONAL_RECIPES.map(r=>[r.id,r.name,r.regions.join('|'),r.country||'',r.model_kind,r.meal_slots.join('|'),r.items.map(i=>i.key+':'+i.grams).join('|'),r.source_url,r.quality])];
fs.writeFileSync(out+'/catalog.csv','\ufeff'+rows.map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
console.log(summary);
