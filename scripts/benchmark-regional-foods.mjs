import fs from 'node:fs';
import {generate,empty} from '../server/coaching.mjs';
import {withClock} from '../server/clock.mjs';
import {REGION_COUNTRIES,REGIONAL_RECIPES} from '../regional-foods.mjs';
const results=[];
for(const region of Object.keys(REGION_COUNTRIES))for(const dietType of ['balanced','vegan']){
 const start=performance.now();
 const state=withClock(Date.parse('2026-11-03T12:00:00Z'),()=>generate(empty(),{name:'Regional benchmark',age:30,sex:'male',height:175,weight:80,goal:'maintain',region,serviceTrack:'nutrition_only',dietType,budget:dietType==='vegan'?'low':'high'},'regional-bench-'+region+'-'+dietType));
 const plan=state.plans.find(p=>p.id===state.active_plan_id),meals=plan.days.flatMap(d=>d.meals);
 results.push({region,dietType,milliseconds:Math.round(performance.now()-start),days:plan.days.length,meals:meals.length,regionalSelections:meals.filter(m=>m.snapshot.template_id.startsWith('regional-')).length,combinationSelections:meals.filter(m=>m.snapshot.model_kind==='meal_combination').length});
}
const result={at:new Date().toISOString(),node:process.version,models:REGIONAL_RECIPES.length,results,limitations:'Local in-process measurements under test load, not a production latency or capacity guarantee'};
fs.writeFileSync('docs/regional-foods/benchmark.json',JSON.stringify(result,null,2)+'\n');console.log(result);
