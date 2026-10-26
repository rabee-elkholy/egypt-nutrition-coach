// Finite diagnostic only: vary slot allocation without inventing source foods.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {generate,empty} from '../../server/coaching.mjs';
import {withClock} from '../../server/clock.mjs';
import {library} from '../../server/food.mjs';
import {fitMeal,daySlots,sumSnapshots,nutritionQualityIssues} from '../../planner-core.mjs';
import {assertDietDay} from '../../diet-patterns.mjs';
import {sourceProvenance,sha256} from './evidence.mjs';
const [root,output]=process.argv.slice(2);
if(!root||!output||fs.existsSync(output))throw Error('Supply source cohort and new diagnostic directory');
fs.mkdirSync(output,{recursive:true});
const persona=JSON.parse(fs.readFileSync(path.join(root,'cohort.json'))).find(p=>p.userId==='user-017');
const state=withClock(Date.parse('2026-10-24T12:00:00Z'),()=>generate(empty(),{...persona.onboarding,serviceTrack:'workouts_only'},'normalization'));
const original=fs.readFileSync('planner-core.mjs','utf8'),line=original.split(/\r?\n/).find(s=>s.includes('if(quality.length)throw '));
if(!line)throw Error('Diagnostic attachment missing');
const expression=line.trim().slice('if(quality.length)throw '.length,-1);
let source=original.replace(line,`    if(quality.length){const e=${expression};e.facts={targets,pool};throw e;}`);
source=source.replace(/from\s*(['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+q+pathToFileURL(path.resolve(p)).href+q);
const file=path.resolve(output,'planner.mjs');fs.writeFileSync(file,source);
let facts;try{(await import(pathToFileURL(file).href)).makeWeek(state.profile,state.preferences,library,'2026-10-24','vegan-allocation-probe');}catch(e){facts=e.facts;}
if(!facts)throw Error('Expected failing profile');
const {pool,targets}=facts,slots=daySlots(state.preferences.meals,state.preferences.diet);
const candidates=slots.map(slot=>{
 const map=new Map();
 for(const t of pool.filter(t=>t.meal_slots.includes(slot.slot)))for(const e of [.5,.75,1,1.25,1.5])for(const p of [.5,1,1.5,2,3]){
  const s=fitMeal(t,targets.energy*slot.share*e,targets.protein*slot.share*p,library);
  map.set(JSON.stringify(s.ingredients.map(i=>[i.key,i.grams])),s);
 }
 return [...map.values()];
});
let frontier=[{energy:0,protein:0,snapshots:[]}];let evaluated=0;
for(const options of candidates){
 const bins=new Map();
 for(const prev of frontier)for(const snapshot of options){
  evaluated++;const energy=prev.energy+Number(snapshot.values.energy),protein=prev.protein+Number(snapshot.values.protein);
  if(energy>targets.energy*1.15)continue;
  const bin=Math.round(energy/2),old=bins.get(bin);
  if(!old||protein>old.protein)bins.set(bin,{energy,protein,snapshots:[...prev.snapshots,snapshot]});
 }
 frontier=[...bins.values()];
}
const feasible=frontier.filter(f=>{try{assertDietDay(f.snapshots,state.preferences.diet,targets,state.profile);return !nutritionQualityIssues(sumSnapshots(f.snapshots),targets).length;}catch{return false;}});
feasible.sort((a,b)=>Math.abs(a.energy-targets.energy)-Math.abs(b.energy-targets.energy));
const witness=feasible[0]||null;
const report={scope:'FINITE_SINGLE_DAY_ALLOCATION_DIAGNOSTIC',provenance:sourceProvenance(),originalSourceSha256:sha256(original),candidateCounts:candidates.map(c=>c.length),evaluated,targets,witness,bestProteinWithinEnergy:Math.max(...frontier.filter(f=>f.energy>=targets.energy*.85).map(f=>f.protein)),limitations:['Two-kcal bins discard alternatives; no infeasibility proof.','Single-day witness is not a complete week, ordinary HTTP acceptance, or clinical assessment.']};
fs.writeFileSync(path.join(output,'diagnostic.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,provenance:undefined,witness:witness?{energy:witness.energy,protein:witness.protein}:null}));
