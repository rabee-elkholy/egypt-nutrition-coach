// Reevaluate immutable raw bundles without rewriting the original run/report.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {evaluateDay} from '../cohort/evaluate.mjs';
import {sourceProvenance} from './evidence.mjs';

const root=path.resolve(process.argv[2]||''),output=path.resolve(process.argv[3]||'docs/production-readiness/evidence/corrected-cohort-evaluation.json');
if(existsSync(output))throw Error('Preserve existing evaluation evidence');
const cohort=JSON.parse(readFileSync(path.join(root,'cohort.json'))),config=JSON.parse(readFileSync(path.join(root,'simulation_config.json'))),library=JSON.parse(readFileSync('data/planning-library.json'));
const counts={},examples={},p0Users=new Set(),classifications={},httpStatuses={};let days=0;
for(const persona of cohort)for(let day=1;day<=config.days;day++){
 const bundle=JSON.parse(gunzipSync(readFileSync(path.join(root,'users',persona.userId,'days',String(day).padStart(3,'0')+'.json.gz'))));days++;
 for(const issue of evaluateDay(bundle,persona,library).issues){const key=issue.severity+':'+issue.code;counts[key]=(counts[key]||0)+1;examples[key]||=issue;if(issue.severity==='P0')p0Users.add(persona.userId);}
 for(const event of bundle.records){classifications[event.classification||'UNCLASSIFIED']=(classifications[event.classification||'UNCLASSIFIED']||0)+1;httpStatuses[event.status]=(httpStatuses[event.status]||0)+1;}
}
const result={sourceRun:root,provenance:sourceProvenance(),days,counts,examples,p0Users:[...p0Users],classifications,httpStatuses,
 correction:'Original 58 FOOD_EXCLUSION flags were shrimp under fish-only taste exclusion. Product contract separates fish from shellfish; regression controls retain fish detection and add shellfish detection. Original baseline metrics/reports are preserved unchanged.',
 limitations:['Finite software-rule coverage only; no clinical safety conclusion.','Original extraction counts repeated generated message observations, not delivery/read events.','No correction removes onboarding rejections, strict nutrition target gaps or workout coverage findings.']};
writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({output,days,counts,p0Users:result.p0Users,classifications,httpStatuses}));
