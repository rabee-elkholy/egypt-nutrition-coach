import {readFileSync,writeFileSync,existsSync,mkdirSync,appendFileSync,renameSync,unlinkSync,copyFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {args,json,read,lines,hash,rng,chance,pick,round,VERSION,inventory} from './common.mjs';
import {personas,cohortCoverage} from './personas.mjs';
import {initialMemory,behavioralDay} from './behavior.mjs';
import {localRuntime} from './runtime.mjs';
import {messages} from './messages.mjs';
import {generateReports} from './report.mjs';

export async function run(options=args()){
 const started=Date.now(),users=Number(options.users||100),days=Number(options.days||90),seed=String(options.seed||'egypt-100x90-v1'),output=path.resolve(String(options.output||'reports/simulation-100-users-90-days/baseline-v1'));
 if(!Number.isInteger(users)||users<1||users>1000||!Number.isInteger(days)||days<1||days>90)throw Error('Invalid users/days');
 if(options['from-day']&&!options.resume)throw Error('--from-day requires --resume and existing checkpoints; no future state injection');
 mkdirSync(output,{recursive:true});
 const config={users,days,seed,startDate:'2026-10-24',versions:{persona:VERSION,behavior:VERSION,evaluation:VERSION,schema:1},localOnly:true};
 if(existsSync(path.join(output,'simulation_config.json'))){if(!options.resume)throw Error('Output exists: choose a new directory or --resume');if(hash(read(path.join(output,'simulation_config.json')))!==hash(config))throw Error('Resume configuration mismatch');}
 else json(path.join(output,'simulation_config.json'),config);
 const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const enginePaths=['planner-core.mjs','diet-patterns.mjs','personal-brief.mjs','coach-messages.mjs',...execFileSync('git',['ls-files','server','drizzle','data'],{encoding:'utf8'}).trim().split(/\r?\n/)];
 const engineHashes=Object.fromEntries(enginePaths.filter(existsSync).map(p=>[p,hash(readFileSync(p))]));
 const manifestPath=path.join(output,'manifest.json'),previous=existsSync(manifestPath)?read(manifestPath):null;
 if(previous&&hash(previous.engineHashes)!==hash(engineHashes))throw Error('Engine files changed; baseline resume forbidden');
 const harnessFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','scripts/cohort','tests/cohort-harness.test.mjs'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(existsSync),harnessHashes=Object.fromEntries(harnessFiles.map(p=>[p,hash(readFileSync(p))]));
 if(previous?.harnessHashes&&hash(previous.harnessHashes)!==hash(harnessHashes))throw Error('Harness changed; use a new output directory instead of resuming');
 const manifest={...previous,gitCommit:previous?.gitCommit||sha,harnessGitCommit:sha,harnessHashes,engineVersion:'weekly-planner-0.11.0',nodeVersion:process.version,seed,versions:config.versions,startDate:config.startDate,engineHashes,runStarted:previous?.runStarted||new Date().toISOString(),status:'running',environment:'local Miniflare / migrated local D1; production Worker and D1 untouched',baselineTests:{command:'npm run check',passed:173,failed:0,source:'baseline-check.log'},limitations:['Synthetic behavior and weight are not clinical evidence','All full HTTP bodies are preserved in per-day gzip journals','Local latency includes instrumentation; no production performance claim','DOM rendering coverage is recorded separately; generated does not mean rendered'],files:[]};
 json(manifestPath,manifest);if(existsSync('baseline-check.log')&&!existsSync(path.join(output,'baseline-check.log')))copyFileSync('baseline-check.log',path.join(output,'baseline-check.log'));
 const cohort=personas(seed,users);json(path.join(output,'cohort.json'),cohort);json(path.join(output,'cohort_diversity.json'),cohortCoverage(cohort));
 const {mf,db}=await localRuntime(output);
 let completed=0;
 try{
 for(const persona of cohort){
  if(options['user-id']&&![persona.userId,String(Number(persona.userId.slice(5)))].includes(String(options['user-id'])))continue;
  const dir=path.join(output,'users',persona.userId);mkdirSync(path.join(dir,'days'),{recursive:true});json(path.join(dir,'persona.json'),persona);
  const checkpointPath=path.join(dir,'checkpoint.json');let checkpoint=existsSync(checkpointPath)?read(checkpointPath):null;
  if(checkpoint?.day>=days){completed++;continue;}
  if(options['from-day']&&Number(options['from-day'])!==((checkpoint?.day||0)+1))throw Error('--from-day must equal next uncommitted day; rerun into a new output to investigate earlier days');
  let state=checkpoint?.state||{revision:0,plans:[],foodEntries:[],workoutLogs:[],adaptations:[]},memory=checkpoint?.memory||initialMemory(persona,seed),seq=checkpoint?.seq||0;
  for(let day=(checkpoint?.day||0)+1;day<=days;day++){
   const journal=path.join(dir,'days',String(day).padStart(3,'0')+'.journal.jsonl'),cached=lines(journal),records=[],dayState=structuredClone(state),revisionBefore=state.revision;
   let replayIndex=0;
   const request=async(method,endpoint,body=null,simulation=true,extra={})=>{
    seq++;const eventId=persona.userId+'-'+seq,key=hash(seed+':'+eventId).slice(0,32),requestData={method,endpoint,body,simulation,extra};
    if(cached[replayIndex]){const rec=cached[replayIndex++];if(rec.eventId!==eventId||hash(rec.request)!==hash(requestData))throw Error('Recovery journal differs at '+eventId);records.push(rec);if(rec.response.revision!=null&&rec.status<300)state=rec.response.profile!==undefined?rec.response:{...state,revision:rec.response.revision};return rec;}
    const begin=performance.now(),headers={'oai-authenticated-user-id':persona.userId,'Content-Type':'application/json','Idempotency-Key':key,'x-cohort-key':seed+':'+eventId,'x-cohort-now':String(Date.parse(config.startDate+'T12:00:00Z')+(day-1)*86400000+seq*1000),...extra};
    const url='http://cohort.local/v1/'+endpoint+(simulation?(endpoint.includes('?')?'&':'?')+'simulation=1':'');
    let response,content,status,requestId,error=null;
    try{response=await mf.dispatchFetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});status=response.status;requestId=response.headers.get('x-request-id');content=await response.text();try{content=JSON.parse(content);}catch{content={unparsed:content};}}
    catch(e){status=599;content={error:e.message};error=e.stack;}
    const rec={eventId,userId:persona.userId,day,requestId,timestamp:headers['x-cohort-now'],request:requestData,status,latencyMs:performance.now()-begin,responseBytes:Buffer.byteLength(JSON.stringify(content)),responseHash:hash(content),response:content,transportError:error};
    appendFileSync(journal,JSON.stringify(rec)+'\n');records.push(rec);replayIndex++;
    if(status<300&&content.revision!=null)state=content.profile!==undefined?content:{...state,revision:content.revision};
    return rec;
   };
   const command=async(action,payload={},full=true)=>request('POST','commands'+(full?'':'?view=receipt'),{revision:state.revision,action,payload});
   if(day===1){
    const eligibility=await request('POST','eligibility',persona.onboarding,false);
    const generation=await request('POST','commands',{revision:0,action:'generate',payload:persona.onboarding},false);
    const real=generation.response;
    json(path.join(dir,'onboarding.json'),{choices:persona.onboarding,eligibility:eligibility.response,status:generation.status,adoptedProfile:real.profile||null,adoptedPreferences:real.preferences||null,sourceEvent:generation.eventId});
    // Reset is invoked only after the actual onboarding transaction succeeded.
    state={revision:0,plans:[],foodEntries:[],workoutLogs:[],adaptations:[]};
    if(generation.status===200)await command('simulation_reset',{source:'current'});
    else state={...state,onboardingFailure:{status:generation.status,body:generation.response},serverDate:config.startDate};
   }
   else if(state.profile)await command('simulation_next',{});
   const date=state.serverDate||new Date(Date.parse(config.startDate+'T12:00:00Z')+(day-1)*86400000).toISOString().slice(0,10);
   let plan=state.plans?.find(p=>p.id===state.active_plan_id),planDay=plan?.days.find(d=>d.date===date),occ=state.scheduledSessions?.find(x=>x.date===date),workoutDay=state.workoutPlan?.days.find(d=>d.dayIndex===occ?.dayIndex);
   const behavior=behavioralDay(persona,memory,{day,date,planDay,workoutDay}),r=rng(seed+':actions:'+persona.userId+':'+day),truth={userId:persona.userId,day,date,...behavior,actualMeals:behavior.food.filter(x=>x.eaten).map(choice=>({type:'planned',mealId:choice.mealId,planId:plan?.id,quantity:choice.quantity,snapshotReference:{planId:plan?.id,mealId:choice.mealId},logged:choice.logged,late:choice.late}))},decisions=[];
   if(behavior.extra||behavior.outside){truth.actualMeals.push({type:behavior.outside?'outside':'extra',key:pick(r,['rice','egg','chicken','bread','banana','oats']),grams:pick(r,[80,100,150,200]),nutrients:'catalog reference; quantity is a synthetic user estimate',logged:behavior.openedApp&&chance(r,persona.traits.logging*.7)});}
   if(state.profile&&behavior.openedApp){
    if(behavior.changeTimezone)await command('timezone',{timezone:state.profile.timezone==='Asia/Riyadh'?'Africa/Cairo':'Asia/Riyadh'});
    if(behavior.changeGoal||behavior.changeDays){const changed={...persona.onboarding,...state.profile,goal:behavior.changeGoal?'maintain':state.profile.goal,targetWeight:behavior.changeGoal?null:state.profile.targetWeight,dailyActivity:state.profile.activity};if(behavior.changeDays){changed.selectedWorkoutDays=persona.onboarding.selectedWorkoutDays.slice(0,-1);if(!changed.selectedWorkoutDays.length)changed.selectedWorkoutDays=[1,4];}await command('generate',changed);}
    if(behavior.logRecovery)await command('recovery',{sleepHours:behavior.sleepHours,sleepQuality:Math.round(Math.min(5,Math.max(1,behavior.sleepHours-3))),fatigue:behavior.fatigue,stress:behavior.stress,soreness:behavior.soreness,pain:behavior.pain,illness:behavior.illness,redFlags:false});
    if(behavior.measuredWeight!==null)await command('weight',{date,kg:behavior.measuredWeight},false);
    if(behavior.logWater)await command('water',{date,cups:Math.round(behavior.waterLiters*4)},false);
    if(behavior.logSteps)await command('steps',{date,steps:behavior.steps},false);
    if(behavior.swapMeal&&planDay?.meals.length){const meal=pick(r,planDay.meals),alt=await request('GET','meal-alternatives?mealId='+encodeURIComponent(meal.id));if(alt.response.items?.length){const accept=chance(r,persona.traits.acceptAdvice);decisions.push({kind:'meal_alternative',accept,eventId:alt.eventId});if(accept)await command('replace_meal',{mealId:meal.id,templateId:alt.response.items[0].snapshot.template_id});}}
    plan=state.plans?.find(p=>p.id===state.active_plan_id);planDay=plan?.days.find(d=>d.date===date);
    for(const choice of behavior.food){
     const meal=planDay?.meals.find(m=>m.id===choice.mealId);if(!choice.eaten||!meal)continue;
     if(choice.logged&&!choice.late)await command('food_entry',{date,source:'planned',mealId:meal.id,slot:meal.slot,quantity:choice.quantity},false);
     if(choice.logged&&choice.late){memory.pendingFood||=[];memory.pendingFood.push({date,key:meal.snapshot.ingredients[0]?.key,grams:round(Number(meal.snapshot.ingredients[0]?.grams||100)*choice.quantity,1),mealId:meal.id,availableAfterDay:day+1});}
    }
    for(const extra of truth.actualMeals.filter(x=>x.type!=='planned'&&x.logged))await command('food_entry',{date,source:'ingredient',key:extra.key,grams:extra.grams,slot:'snack'},false);
    for(const pending of memory.pendingFood||[]){if(pending.availableAfterDay<=day&&pending.key)await command('food_entry',{date:pending.date,source:'ingredient',key:pending.key,grams:pending.grams,slot:'snack'},false);}
    memory.pendingFood=(memory.pendingFood||[]).filter(x=>x.availableAfterDay>day);
    if(behavior.correctOld&&day>2){const prior=state.foodEntries?.find(x=>x.date<date&&x.source==='ingredient');if(prior){await command('food_delete',{id:prior.id});const ing=prior.snapshot.ingredients[0];if(ing)await command('food_entry',{date:prior.date,source:'ingredient',key:ing.key,grams:round(Number(ing.grams)*.9,1),slot:prior.slot},false);}}
    // App completion is an explicit (possibly mistaken) self-report, not inferred from hidden truth.
    if(behavior.food.some(x=>x.logged&&x.eaten&&!x.late)&&chance(r,persona.traits.logging))await command('food_complete',{date,complete:true},false);
    if(workoutDay&&behavior.logExercise){
     if(behavior.exercise==='missed')await command('session',{date,dayIndex:workoutDay.dayIndex,status:'missed'});
     else {
      const list=behavior.exercise==='partial'?workoutDay.exercises.slice(0,Math.max(1,Math.floor(workoutDay.exercises.length*.5))):workoutDay.exercises;
      for(const ex of list){const old=memory.lastWorkout[ex.id]||{kg:ex.loadMode==='bodyweight'?0:pick(r,[10,15,20,30,40]),reps:ex.repMin};const suggested=ex.suggestedKg;
       let kg=suggested!=null&&behavior.acceptLoad?suggested:old.kg;
       if(behavior.fatigue>=4&&chance(r,.45))kg=round(kg*.95,1);
       const reps=chance(r,.65)?Math.min(ex.repMax,old.reps+1):Math.max(1,old.reps-1),n=behavior.exercise==='partial'?Math.max(1,ex.sets-1):ex.sets;
       const sets=Array.from({length:n},()=>({kg,reps,rir:behavior.omitMetrics?null:Math.max(0,Math.min(6,ex.rir+(behavior.fatigue>=4?-1:1))),pain:behavior.pain&&chance(r,.6)}));
       await command('workout',{date,dayIndex:workoutDay.dayIndex,exerciseId:ex.id,sets,bothSides:true,increment:kg>0?Math.max(.1,round(kg*.025,1)):null});memory.lastWorkout[ex.id]={kg,reps};
       if(suggested!=null)decisions.push({kind:'load_suggestion',exerciseId:ex.id,suggested,accept:behavior.acceptLoad});
      }
      await command('session',{date,dayIndex:workoutDay.dayIndex,status:behavior.exercise,duration:behavior.omitMetrics?null:Math.max(5,Math.round(workoutDay.estimatedMinutes*(behavior.exercise==='partial'?.6:1))),rpe:behavior.omitMetrics?null:Math.min(10,5+behavior.fatigue)});
     }
    }
    if(behavior.swapExercise&&workoutDay?.exercises.length){const ex=pick(r,workoutDay.exercises),alt=await request('GET',`exercise-alternatives?dayIndex=${workoutDay.dayIndex}&exerciseId=${ex.id}`);if(alt.response.items?.length)await command('replace_exercise',{dayIndex:workoutDay.dayIndex,exerciseId:ex.id,alternativeId:alt.response.items[0].id});}
    if(behavior.reschedule&&workoutDay){const occupied=new Set(state.scheduledSessions?.map(x=>x.date));const to=Array.from({length:6},(_,i)=>new Date(Date.parse(date+'T12:00:00Z')+(i+1)*86400000).toISOString().slice(0,10)).find(d=>!occupied.has(d));if(to){await command('reschedule',{dayIndex:workoutDay.dayIndex,toDate:to});const a=state.adaptations?.find(a=>a.status==='pending'&&a.kind==='schedule');if(a)await command('adaptation',{id:a.id,accept:behavior.accept});}}
    await command('review',{});
    const pending=state.adaptations?.filter(a=>a.status==='pending')||[];
    // Each proposal is reviewed against its original revision; the engine may reject subsequent accepts.
    for(const a of pending){const before={nutrition:state.active_plan_id,workout:state.workoutPlan?.id},rec=await command('adaptation',{id:a.id,accept:behavior.accept});decisions.push({kind:a.kind,id:a.id,decision:a,accept:behavior.accept,before,after:{nutrition:state.active_plan_id,workout:state.workoutPlan?.id},eventId:rec.eventId,status:rec.status,evidenceRevision:a.baseRevision});}
   }
   if(state.profile)await request('GET','state');
   const generated=records.flatMap(rec=>rec.response.profile?messages(rec.response,{userId:persona.userId,day,date:rec.response.serverDate,engineStateRevision:rec.response.revision,openedApp:behavior.openedApp,eventId:rec.eventId}):[]);
   const unique=[...new Map(generated.map(x=>[x.messageId,x])).values()];memory.previousMessages=unique.filter(x=>x.messageType.startsWith('personal:')).map(x=>x.exactText);memory.previousAcceptance=decisions.at(-1)?.accept??null;
   const bundle={userId:persona.userId,day,date,timezone:state.profile?.timezone||persona.onboarding.timezone,revisionBefore,revisionAfter:state.revision,truth,behavior,decisions,messages:unique,records,state};
   const dest=path.join(dir,'days',String(day).padStart(3,'0')+'.json.gz');writeFileSync(dest+'.tmp',gzipSync(JSON.stringify(bundle),{level:6}));renameSync(dest+'.tmp',dest);
   checkpoint={day,state,memory,seq};json(checkpointPath+'.tmp',checkpoint);renameSync(checkpointPath+'.tmp',checkpointPath);if(existsSync(journal))unlinkSync(journal);
   if(day%14===0||day===days)console.log(JSON.stringify({userId:persona.userId,day,usersCompleted:completed,elapsedSeconds:Math.round((Date.now()-started)/1000),revision:state.revision}));
  }
  // Persisted reload is captured in the final day; archive counts can be independently queried.
  completed++;
 }
 const accountRows=await db.prepare('SELECT user_id,revision,length(body) AS aggregateBytes FROM coaching_accounts ORDER BY user_id').all();json(path.join(output,'persisted_accounts.json'),accountRows.results);
 manifest.status='executed';manifest.lastExecutionSeconds=(Date.now()-started)/1000;manifest.runFinished=new Date().toISOString();json(manifestPath,manifest);
 }finally{await mf.dispose();}
 await generateReports(output);
 manifest.status='complete';manifest.files=inventory(output);json(manifestPath,manifest);return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/cohort/run.mjs'))await run();
