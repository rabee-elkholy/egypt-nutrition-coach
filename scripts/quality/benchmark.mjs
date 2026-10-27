import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const baseline=process.argv[2],output=process.argv[3];if(!baseline||!output)throw Error('Provide baseline root and output');
const before=(await import(pathToFileURL(resolve(baseline,'personal-brief.mjs')).href)).personalBrief;
const {personalBrief:after}=await import('../../personal-brief.mjs');const {createBriefSelector}=await import('../../coaching-summary.mjs');
const today='2026-10-27',now=Date.parse(today+'T12:00:00Z'),results=[];
for(const days of [7,90,365]){
 const state={revision:1,profile:{name:'Benchmark',goal:'lose'},serverNow:new Date(now).toISOString(),active_plan_id:'plan',plans:[{id:'plan',days:[{date:today,targets:{protein:120}}],targets:{protein:120}}],weights:[],foodLogs:[],foodEntries:[],waterLogs:[],workoutLogs:[],sessions:[],checkins:[],adaptations:[],coachingCases:[],coachingFeedback:[],recovery:{status:'unknown'}};
 for(let i=0;i<days;i++){const date=new Date(now-i*86400000).toISOString().slice(0,10);state.weights.push({date,kg:80-i*.01});state.foodLogs.push({date,complete:true,protein:120});state.waterLogs.push({date,cups:8});for(let j=0;j<4;j++)state.foodEntries.push({date,id:date+'-'+j});}
 assert.deepEqual(after(state,today),before(state,today));
 const samples={before:[],after:[]};
 for(let rep=0;rep<5;rep++)for(const kind of rep%2?['after','before']:['before','after']){const start=performance.now();for(let n=0;n<100;n++){if(kind==='before'){before(state,today);before(state,today);}else{const select=createBriefSelector(after);select(state,today);select(state,today);}}samples[kind].push((performance.now()-start)/100);}
 results.push({days,records:days*7,noteBytes:Buffer.byteLength(JSON.stringify(after(state,today))),samplesMsPerTwoViews:samples,medianBeforeMs:samples.before.toSorted((a,b)=>a-b)[2],medianAfterMs:samples.after.toSorted((a,b)=>a-b)[2],semantics:'exact equality; two consumers of the same snapshot; no cross-request cache'});
}
mkdirSync(resolve(output,'..'),{recursive:true});writeFileSync(output,JSON.stringify({node:process.version,iterationsPerSample:100,repeats:5,results,limitations:'In-process synthetic history, alternating order; no production/network capacity claim'},null,2)+'\n');console.log(results.map(x=>({days:x.days,before:x.medianBeforeMs,after:x.medianAfterMs})));
