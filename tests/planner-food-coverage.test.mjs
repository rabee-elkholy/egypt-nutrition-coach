import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generate,empty} from '../server/coaching.mjs';
import {withClock} from '../server/clock.mjs';
import {library} from '../server/food.mjs';
import {planningTemplates,prepareTemplate,makeWeek} from '../planner-core.mjs';
import {independentPlanIssues} from '../scripts/audit/scenario-http.mjs';
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/nutrition-eight-coverage.json',import.meta.url)));
for(const f of fixtures)test('previously unsupported original preferences: '+f.id,()=>withClock(Date.parse('2026-10-24T12:00:00Z'),()=>{
 const before=JSON.stringify(f.draft),s=generate(empty(),f.draft,'coverage-'+f.id),plan=s.plans.find(p=>p.id===s.active_plan_id);
 assert.equal(JSON.stringify(f.draft),before);assert.equal(s.preferences.budget,f.draft.budget);assert.equal(s.preferences.diet,f.draft.dietType);
 assert.deepEqual(independentPlanIssues(plan,library),[]);
 for(const day of plan.days){
  assert.ok(Number(day.summary.values.protein)>=day.targets.protein*.85);
  assert.ok(Math.abs(Number(day.summary.values.energy)-day.targets.energy)<=day.targets.energy*.12);
 }
 if(f.draft.budget==='low')for(const day of plan.days)for(const m of day.meals){
  assert.equal(m.snapshot.budget_tier,'low');
  for(const i of m.snapshot.ingredients)assert.equal(library.ingredients[i.key].budget_tier,'low');
 }
}));
test('new planning nutrients, portions and source fingerprints exactly match retained reference profiles',()=>{
 for(const key of ['soybeans','sunfloweroil']){
  const i=library.ingredients[key],d=JSON.parse(fs.readFileSync(new URL('../data/details/'+i.food_id.slice(0,2)+'.json',import.meta.url)))[i.food_id];
  const metrics={energy:'fdc:1008',protein:'fdc:1003',fat:'fdc:1004',carbs:'fdc:1005',fiber:'fdc:1079',saturated:'fdc:1258',sodium:'fdc:1093',sugars:'fdc:2000'};
  assert.equal(i.reference.sha256,d.sha256);assert.equal(i.reference.profile_id,d.profile_id);assert.equal(Number(d.basis_g),100);
  assert.deepEqual(i.portions,d.portions);
  for(const [k,id]of Object.entries(metrics)){const n=d.nutrients.find(n=>n.id===id);assert.equal(i.values[k],n.value);assert.deepEqual(i.nutrient_evidence[id],n);}
 }
});
test('soy preferences, exact food exclusions and all-legume exclusions remove every soy recipe',()=>withClock(Date.parse('2026-10-24T12:00:00Z'),()=>{
 const f=fixtures.find(f=>f.id==='user-017'),s=generate(empty(),{...f.draft,serviceTrack:'workouts_only'},'normalize');
 for(const prefs of [{...s.preferences,excludedGroups:['soy']},{...s.preferences,excludedGroups:['legumes']},{...s.preferences,excludedKeys:['soybeans']},{...s.preferences,excludedFoodIds:[library.ingredients.soybeans.food_id]}]){
  const pool=planningTemplates(library,prefs).map(t=>prepareTemplate(t,library,prefs,s.profile)).filter(Boolean);
  assert.ok(pool.every(t=>t.items.every(i=>i.key!=='soybeans')));
 }
 const none={...s.preferences,excludedKeys:Object.keys(library.ingredients)};
 assert.throws(()=>makeWeek(s.profile,none,library,'2026-10-24','excluded'),e=>e.code==='PLAN_CONSTRAINTS_UNMET');
}));
