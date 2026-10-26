import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {generate,empty} from '../../server/coaching.mjs';
import {withClock} from '../../server/clock.mjs';
import {library} from '../../server/food.mjs';
import {fitMeal,daySlots,nutritionQualityIssues,sumSnapshots} from '../../planner-core.mjs';
import {assertDietDay} from '../../diet-patterns.mjs';
import {sha256,sourceProvenance} from './evidence.mjs';

const [sourceRun,output]=process.argv.slice(2);if(!sourceRun||!output)throw Error('Usage: vegan-coverage-diagnostic.mjs <original-run> <new-output>');
if(fs.existsSync(output))throw Error('Preserve previous diagnostic');fs.mkdirSync(output,{recursive:true});
const cohort=JSON.parse(fs.readFileSync(path.join(sourceRun,'cohort.json'))),config=JSON.parse(fs.readFileSync(path.join(sourceRun,'simulation_config.json'))),persona=cohort.find(p=>p.userId==='user-017');
const original=fs.readFileSync('planner-core.mjs','utf8'),line=original.split(/\r?\n/).find(s=>s.includes('if(quality.length)throw '));
if(!line)throw Error('Expected diagnostic attachment point missing');
const errorExpression=line.trim().slice('if(quality.length)throw '.length,-1);
let instrumented=original.replace(line,`    if(quality.length){const error=${errorExpression};error.diagnostic={day,summary,targets,meals,pool};throw error;}`);
instrumented=instrumented.replace(/from\s*(['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+q+pathToFileURL(path.resolve(p)).href+q);
const clone=path.resolve(output,'planner-diagnostic.mjs');fs.writeFileSync(clone,instrumented);
const {makeWeek}=await import(pathToFileURL(clone).href);
function word(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(16).padStart(8,'0');}
const text=config.seed+':user-017-2:1',h=[0,1,2,3].map(i=>word(text+':'+i)).join(''),seed=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20);
const normalized=withClock(Date.parse(config.startDate+'T12:00:02Z'),()=>generate(empty(),{...persona.onboarding,serviceTrack:'workouts_only'},'normalization'));
let diagnostic,errorMessage;
try{makeWeek(normalized.profile,normalized.preferences,library,config.startDate,seed);}catch(e){diagnostic=e.diagnostic;errorMessage=e.message;}
if(!diagnostic)throw Error('Expected quality failure not reproduced');
const {targets,pool}=diagnostic,slots=daySlots(normalized.preferences.meals,normalized.preferences.diet),candidates=slots.map(slot=>{
 const desiredEnergy=targets.energy*slot.share,desiredProtein=targets.protein*slot.share;
 const fitted=[];
 for(const template of pool.filter(t=>t.meal_slots.includes(slot.slot)))for(const multiplier of [1,1.5,2]){
  const snapshot=fitMeal(template,desiredEnergy,desiredProtein*multiplier,library);
  fitted.push({templateId:template.id,multiplier,snapshot});
 }
 return fitted;
});
let evaluated=0,witness=null,best=null;
function walk(index,chosen){
 if(witness)return;
 if(index<candidates.length){for(const item of candidates[index]){walk(index+1,[...chosen,item]);if(witness)break;}return;}
 evaluated++;const snapshots=chosen.map(x=>x.snapshot),summary=sumSnapshots(snapshots),issues=nutritionQualityIssues(summary,targets);
 try{assertDietDay(snapshots,normalized.preferences.diet,targets,normalized.profile);}catch{return;}
 if(!best||Number(summary.values.protein)>Number(best.summary.values.protein))best={summary,items:chosen.map(c=>({templateId:c.templateId,multiplier:c.multiplier}))};
 if(!issues.length)witness={summary,items:chosen};
}
walk(0,[]);
const report={scope:'DIAGNOSTIC_ONLY_FAILURE_FACTS_AND_FINITE_FEASIBILITY_WITNESS',provenance:sourceProvenance(),productionSourceSha256:sha256(original),instrumentedSourceSha256:sha256(instrumented),seed,errorMessage,profile:normalized.profile,preferences:normalized.preferences,failedDay:diagnostic.day,targets,failedSummary:diagnostic.summary,qualityIssues:nutritionQualityIssues(diagnostic.summary,targets),candidateCounts:candidates.map(a=>a.length),evaluated,witness,best,limitations:['Diagnostic clone attaches failure facts and relocates imports; no production validation is removed.','Finite per-slot fitting and combinations; no infeasibility proof if no witness exists.','A single-day witness does not constitute a completed week or a production repair.']};
fs.writeFileSync(path.join(output,'diagnostic.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,failedDay:report.failedDay,targets,failedEnergy:diagnostic.summary.values.energy,failedProtein:diagnostic.summary.values.protein,issues:report.qualityIssues,evaluated,witness:witness?{energy:witness.summary.values.energy,protein:witness.summary.values.protein}:null}));
