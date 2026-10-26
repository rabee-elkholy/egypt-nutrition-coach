import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeWeek} from '../planner-core.mjs';
import {library} from '../server/food.mjs';
import {independentPlanIssues} from '../scripts/audit/scenario-http.mjs';

// Exact initial HTTP inputs/seeds: 15 protein-gap days and one energy-gap day
// at 8ac9c4a despite passing the existing 80% / +/-15% acceptance boundaries.
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/nutrition-quality-regressions.json',import.meta.url)));
fixtures.push(JSON.parse(fs.readFileSync(new URL('./fixtures/nutrition-final-gap.json',import.meta.url))));
for(const f of fixtures)test('available tighter-quality week: '+f.id,()=>{
 const before=JSON.stringify(f),plan=makeWeek(f.profile,f.preferences,library,f.start,f.seed,f.acceptedEnergy??null);
 assert.equal(JSON.stringify(f),before);assert.equal(plan.id,'plan-'+f.seed);
 assert.deepEqual(plan.preferences,f.preferences);
 assert.deepEqual(independentPlanIssues(plan,library),[]);
 for(const day of plan.days){
  // Recompute independently from reference ingredients, not planner totals.
  let energy=0,protein=0;
  for(const m of day.meals)for(const part of m.snapshot.ingredients){
   const source=library.ingredients[part.key];
   energy+=Number(part.grams)*Number(source.values.energy)/100;
   protein+=Number(part.grams)*Number(source.values.protein)/100;
  }
  assert.ok(protein>=day.targets.protein*.85,day.date+' protein');
  assert.ok(Math.abs(energy-day.targets.energy)<=day.targets.energy*.12,day.date+' energy');
 }
});
