import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {REGIONAL_RECIPES,regionalFoodTemplates,REGION_COUNTRIES} from '../regional-foods.mjs';
import {planningTemplates,prepareTemplate,snapshotTemplate,validatePreferences} from '../planner-core.mjs';
import {library,foodCommand} from '../server/food.mjs';
import {empty,generate} from '../server/coaching.mjs';
import {withClock} from '../server/clock.mjs';
import {getFoodCatalogItem,searchFoodCatalog} from '../server/food-catalog.mjs';
import {createInitialOnboardingDraft} from '../onboarding-chat.mjs';
const date='2026-11-02',now=Date.parse(date+'T12:00:00Z');
test('2405 unique regional models cover every requested country with usable ingredient references',()=>{
 assert.equal(REGIONAL_RECIPES.length,2405);assert.equal(new Set(REGIONAL_RECIPES.map(r=>r.id)).size,2405);
 assert.equal(new Set(REGIONAL_RECIPES.map(r=>JSON.stringify(r.items.map(i=>[i.key,i.grams]).sort()))).size,2405);
 assert.equal(new Set(REGIONAL_RECIPES.filter(r=>r.country).map(r=>r.country)).size,15);
 for(const region of Object.keys(REGION_COUNTRIES)){
  const recipes=regionalFoodTemplates(library,region);assert.equal(recipes.length,({egypt:1461,gulf:1230,levant:1406,maghreb:1406})[region]);
  for(const r of recipes){assert.match(r.source_url,/^https:\/\//);for(const i of r.items){assert.ok(library.ingredients[i.key]);assert.ok(Number(i.grams)>0);assert.ok(library.ingredients[i.key].regions.includes(region));}}
 }
});
test('selected cuisine survives onboarding and generates region-compatible real weekly plans',()=>withClock(now,()=>{
 for(const region of Object.keys(REGION_COUNTRIES)){
  assert.equal(createInitialOnboardingDraft({preferences:{region}}).region,region);
  const s=generate(empty(),{name:'Regional',age:30,sex:'male',height:175,weight:80,goal:'maintain',region,serviceTrack:'nutrition_only',dietType:'balanced',budget:'high'},'regional-'+region);
  assert.equal(s.preferences.region,region);
  const plan=s.plans.find(p=>p.id===s.active_plan_id);assert.equal(plan.days.length,7);
  assert.ok(plan.days.some(d=>d.meals.some(m=>m.snapshot.template_id.startsWith('regional-'+region))), 'New regional meals actually selected');
  for(const d of plan.days)for(const m of d.meals)assert.ok(m.snapshot.regions.includes(region));
  assert.ok(planningTemplates(library,s.preferences).some(t=>t.id.startsWith('regional-'+region)));
 }
}));
test('regional recipes respect ingredient exclusions, preserve uncertainty and stay out of strict DASH',()=>{
 const prefs=validatePreferences({region:'gulf',budget:'high',proteins:['chicken','meat','fish','eggs','dairy','legumes'],excludedKeys:['milk','wholemilk']},library);
 const saleeg=regionalFoodTemplates(library,'gulf').find(t=>t.id.endsWith('-saleeg'));
 assert.equal(prepareTemplate(saleeg,library,prefs),null);
 assert.ok(planningTemplates(library,{...prefs,diet:'dash'}).every(t=>!t.id.startsWith('regional-')));
 const snap=snapshotTemplate(saleeg,saleeg.items,library);assert.equal(snap.is_approximate,true);assert.equal(snap.values.sodium,null);assert.equal(snap.components[0].values.sodium,null);
});
test('regional search and gram logging use the same serving calculations and mark estimates',()=>withClock(now,()=>{
 const r=REGIONAL_RECIPES.find(x=>x.id.endsWith('-mbakbaka')),item=getFoodCatalogItem(r.id);
 assert.ok(searchFoodCatalog({q:'مبكبكة',scope:'planning'}).items.some(x=>x.id===r.id));
 assert.equal(item.status,'estimated');assert.equal(item.values.sodium,null);
 const snap=snapshotTemplate(r,r.items,library),grams=r.items.reduce((n,x)=>n+Number(x.grams),0);
 assert.ok(Math.abs(Number(item.values.energy)*grams/100-Number(snap.values.energy))<.0001);
 const s=empty();foodCommand(s,'food_entry',{source:'ingredient',key:r.id,date,slot:'lunch',grams:200});
 assert.equal(s.foodEntries.length,1);assert.equal(s.foodEntries[0].snapshot.is_approximate,true);assert.equal(s.foodEntries[0].snapshot.values.sodium,null);
}));
test('shared combinations are indexed once, keep region eligibility and expose their model kind',()=>{
 const models=REGIONAL_RECIPES.filter(r=>r.model_kind==='meal_combination');
 assert.equal(models.length,2085);
 const shared=models.find(r=>r.regions.length===4),food=getFoodCatalogItem(shared.id);
 assert.equal(food.region,'MENA');assert.equal(food.modelKind,'meal_combination');assert.equal(food.country,undefined);
 assert.deepEqual(food.regions,shared.regions);
 for(const region of Object.keys(REGION_COUNTRIES)){
  const prefs=validatePreferences({region,budget:'low',diet:'vegan',proteins:['legumes','nuts'],excludedKeys:['tomato','tomatocooked','peanuts']},library);
  const eligible=regionalFoodTemplates(library,region).map(t=>prepareTemplate(t,library,prefs)).filter(Boolean);
  assert.ok(eligible.length>0);
  for(const t of eligible)for(const i of t.items){assert.ok(!['tomato','tomatocooked','peanuts'].includes(i.key));assert.equal(library.ingredients[i.key].budget_tier,'low');}
 }
});

test('new ingredients retain exact approved source nutrients, identity and portion evidence',()=>{
 const metrics={energy:'fdc:1008',protein:'fdc:1003',fat:'fdc:1004',carbs:'fdc:1005',fiber:'fdc:1079',saturated:'fdc:1258',sodium:'fdc:1093',sugars:'fdc:2000'};
 for(const key of ['taro','corn','mushrooms','cauliflower','beetroot','pumpkin']){
  const ingredient=library.ingredients[key],id=ingredient.food_id;
  const source=JSON.parse(fs.readFileSync(new URL('../data/details/'+id.slice(0,2)+'.json',import.meta.url)))[id];
  assert.equal(ingredient.reference.sha256,source.sha256);assert.equal(ingredient.reference.profile_id,source.profile_id);
  assert.deepEqual(ingredient.portions,source.portions);
  for(const [metric,nutrient] of Object.entries(metrics))assert.equal(ingredient.values[metric],source.nutrients.find(n=>n.id===nutrient)?.value??null);
  const prefs=validatePreferences({region:'egypt',budget:'high',proteins:['chicken','meat','fish','eggs','dairy','legumes','nuts'],excludedGroups:[key]},library);
  const eligible=regionalFoodTemplates(library,'egypt').map(t=>prepareTemplate(t,library,prefs)).filter(Boolean);
  assert.ok(eligible.every(t=>t.items.every(i=>i.key!==key)));
 }
 const prefs=validatePreferences({region:'levant',budget:'high',proteins:['chicken','meat','fish','eggs','dairy','legumes','nuts']},library);
 const eligible=regionalFoodTemplates(library,'levant').map(t=>prepareTemplate(t,library,prefs,{diseases:['ibs']})).filter(Boolean);
 assert.ok(eligible.every(t=>t.items.every(i=>!['mushrooms','cauliflower'].includes(i.key))));
});
