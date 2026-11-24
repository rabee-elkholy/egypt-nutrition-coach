import {coachingSafetyHold} from '../coaching-journey.mjs';
import {usesKg} from '../exercise-load.mjs';
import {clockNow,isoNow,clockDate,clockTimeZone} from './clock.mjs';
import {eachSide} from './workouts.mjs';
import {workingSetsOf} from './training-state.mjs';
import {localDate,dateOffset,MUSCLE_REGIONS,validDate} from '../coaching-shared.mjs';
const DAY=86400000;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const reportComplete=c=>Number.isFinite(c.sleepHours)&&c.sleepHours>=0&&c.sleepHours<=24&&Number.isInteger(c.sleepQuality)&&c.sleepQuality>=1&&c.sleepQuality<=5&&Number.isInteger(c.fatigue)&&c.fatigue>=1&&c.fatigue<=5&&['pain','illness','redFlags'].every(k=>typeof c[k]==='boolean');
const validReports=(reports,now,days,tz='Africa/Cairo')=>[...new Map(reports.filter(c=>reportComplete(c)&&Number.isFinite(Date.parse(c.at))&&Date.parse(c.at)<=now&&Date.parse(c.at)>=now-days*DAY&&!c.illness&&!c.redFlags).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).map(c=>[c.date||localDate(Date.parse(c.at),tz),c])).values()];
export function chronologicalExposures(logs,now=clockNow(),days=28,tz=clockTimeZone()){
 const start=dateOffset(localDate(now,tz),-(days-1)),end=localDate(now,tz),dated=logs.map(l=>({...l,date:l.date||l.at?.slice(0,10)})).filter(l=>validDate(l.date)&&l.date>=start&&l.date<=end);
 return [...new Map(dated.sort((a,b)=>a.date.localeCompare(b.date)||(Date.parse(a.at)||0)-(Date.parse(b.at)||0)).map(l=>[l.date,l])).values()];
}
export function recovery(checkins, now=clockNow(),workoutLogs=[],tz=clockTimeZone()){
 const fresh=checkins.filter(c=>Date.parse(c.at)<=now&&now-Date.parse(c.at)<=DAY).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);
 const coverage=validReports(checkins,now,14,tz);const baselineReports=validReports(checkins.filter(c=>(c.date||c.at?.slice(0,10))<(fresh?.date||fresh?.at?.slice(0,10)||localDate(now,tz))),now,28,tz);
 const baselineReady=baselineReports.length>=7;
 const baseline=baselineReady?{sleepHours:mean(baselineReports.map(c=>c.sleepHours)),fatigue:mean(baselineReports.map(c=>c.fatigue)),reports:baselineReports.length}:null;
 const base={confidence:coverage.length>=14?'high':baselineReady?'medium':'low',baselineReady,baseline,coverage:coverage.length,muscles:{},setFactor:1,progressionAllowed:false,reviewScope:'system_generated_guidance'};
 if(fresh?.redFlags===true)return {...base,status:'stop',reasonCode:'RED_FLAGS_STOP',reasons:['Urgent safety notice: stop exercising immediately and seek medical evaluation for symptoms such as chest pain or severe dizziness.'],setFactor:0};
 const newPain=workoutLogs.some(l=>validDate(l.date)&&l.date>=dateOffset(localDate(now,tz),-1)&&l.date<=localDate(now,tz)&&Date.parse(l.at)<=now&&Date.parse(l.at)>=now-DAY&&(!fresh||Date.parse(l.at)>Date.parse(fresh.at))&&l.sets?.some(set=>set.pain===true));
 if(newPain)return {...base,status:'hold',reasonCode:'WORKOUT_PAIN_HOLD',reasons:['Pain was logged during your recent workout, so load progression is paused. Update your recovery check-in before resuming heavy effort.']};
 if(!fresh||!reportComplete(fresh))return {...base,status:'unknown',reasonCode:'CHECKIN_MISSING_OR_STALE',reasons:['Submit today\'s recovery check-in (sleep, fatigue, and pain status) so the CuraFit Specialist Team can safely calibrate today\'s workout load.']};
 const domains=[];const reasons=[];
 if(fresh.sleepHours<6||fresh.sleepQuality<=2||(baseline?.sleepHours&&fresh.sleepHours<baseline.sleepHours-1.5)){domains.push('sleep');reasons.push(fresh.sleepHours<6||fresh.sleepQuality<=2?`Logged sleep was ${fresh.sleepHours}h (quality ${fresh.sleepQuality}/5); prioritize rest before increasing load.`:`Logged sleep (${fresh.sleepHours}h) is below your recent baseline (${Math.round(baseline.sleepHours*10)/10}h).`);}
 if(fresh.fatigue>=4||(baseline?.fatigue&&fresh.fatigue>=baseline.fatigue+1.5)){domains.push('fatigue');reasons.push(fresh.fatigue>=4?`Logged fatigue is elevated (${fresh.fatigue}/5).`:`Logged fatigue (${fresh.fatigue}/5) is above your baseline (${Math.round(baseline.fatigue*10)/10}).`);}
 if(fresh.stress>=4){domains.push('stress');reasons.push(`Logged stress is elevated (${fresh.stress}/5); training load will account for recovery strain.`);}
 const regional=Object.entries(fresh.sorenessByRegion||{});
 if(fresh.soreness>=7||regional.some(([,v])=>v>=7)){domains.push('soreness');reasons.push('Elevated muscle soreness was logged; load recommendations will be moderated.');}
 const pains=new Set(fresh.painRegions||[]);
 for(const key of Object.keys(MUSCLE_REGIONS)){
  const score=fresh.sorenessByRegion?.[key];base.muscles[key]={soreness:score??null,status:pains.has(key)?'hold':score==null?'unknown':score>=7?'caution':'ready'};
 }
 if(fresh.redFlags)return {...base,status:'stop',reasonCode:'RED_FLAGS_STOP',reasons:['Urgent safety notice: stop exercising immediately and seek medical evaluation for symptoms such as chest pain or severe dizziness.'],setFactor:0};
 if(fresh.pain||fresh.illness)return {...base,status:'hold',reasonCode:fresh.illness?'ILLNESS_HOLD':'JOINT_PAIN_HOLD',reasons:[fresh.illness?'Health comes first: pause today\'s workout while experiencing illness symptoms and consult a clinician if symptoms persist.':'Joint pain reported; pause painful movements, use safe alternatives or rest, and pause progression until pain resolves.']};
 const recent=validReports(checkins,now,7,tz);const difficult=recent.filter(c=>[c.sleepHours<6||c.sleepQuality<=2,c.fatigue>=4,c.stress>=4,c.soreness>=7||Object.values(c.sorenessByRegion||{}).some(v=>v>=7)].filter(Boolean).length>=2).length;
 const performanceDrop=hasPerformanceDrop(workoutLogs,now,tz);
 const status=domains.length>=3||(difficult>=3&&performanceDrop)?'high':domains.length>=2||difficult>=3?'caution':'ready';
 if(difficult>=3)reasons.push('Elevated strain detected across 3 or more check-ins over the past 7 days.');
 if(performanceDrop&&difficult>=3)reasons.push('Recent training performance dip alongside fatigue indicates recovery priority.');
 return {...base,status,reasonCode:status==='ready'?'RECOVERY_READY':'RECOVERY_DELOAD_SUGGESTED',reasons:reasons.length?reasons:['Current recovery check-in supports normal training intensity while monitoring technique and perceived effort.'],setFactor:status==='high'?.6:status==='caution'?.8:1,progressionAllowed:status==='ready',domains,asOf:fresh.at};
}
export function accountRecovery(s,now=clockNow(),tz=s.profile?.timezone||clockTimeZone()){
 const result=recovery(s.checkins||[],now,s.workoutLogs||[],tz);
 if(result.status!=='stop'&&coachingSafetyHold(s,localDate(now,tz)))return {...result,status:'hold',progressionAllowed:false,reasonCode:'FEEDBACK_PAIN_HOLD',reasons:['You reported pain as a training barrier. Stop painful movements and submit a pain-free recovery check-in before increasing load.']};
 return result;
}
export function hasPerformanceDrop(logs,now=clockNow(),tz=clockTimeZone()){
 const grouped=new Map();
 for(const l of logs){
  if(l.adHoc||(l.entryMode==='simple'&&l.loadMode!=='bodyweight'))continue;
  const ws=workingSetsOf(l.sets);
  if(!ws.length||ws.some(s=>s.pain)||(eachSide(l)&&l.bothSides!==true))continue;
  if(l.loadMode!=='bodyweight'&&ws.every(s=>Number(s.kg||0)===0))continue;
  const k=l.exerciseId+'|'+l.loadMode+'|'+(l.progressionKey||l.planId);
  const a=grouped.get(k)||[];a.push({...l,sets:ws});grouped.set(k,a);
 }
 for(const records of grouped.values()){
  const byDate=chronologicalExposures(records,now,14,tz).slice(-2);if(byDate.length<2)continue;
  const [a,b]=byDate,sum=x=>x.sets.reduce((v,s)=>v+s.reps,0);
  const avgKg=x=>x.sets.reduce((v,s)=>v+s.kg,0)/x.sets.length;
  if(a.sets.length===b.sets.length&&a.sets.every((s,i)=>s.kg===b.sets[i].kg)&&sum(b)<sum(a)*.9)return true;
  if(avgKg(a)>0&&avgKg(b)<avgKg(a)*.9&&b.sets.every(s=>s.rir!=null&&s.rir<=1))return true;
 }
 return false;
}
export function workoutProgressionSummary(workoutPlan,logs=[],now=clockNow(),tz=clockTimeZone()){
 const loadIncreases=[],loadDecreases=[],repIncreases=[],readyForNextLoad=[];
 if(!workoutPlan?.days)return {loadIncreases,loadDecreases,repIncreases,readyForNextLoad,summaryText:'No workout sessions logged yet.'};
 const seen=new Set();
 for(const day of workoutPlan.days){
  for(const ex of day.exercises||[]){
   if(seen.has(ex.id))continue;
   seen.add(ex.id);
   const isWeighted=usesKg(ex);
   const compatible=logs.filter(l=>!l.adHoc&&!(l.entryMode==='simple'&&isWeighted)&&l.exerciseId===ex.id&&(ex.progressionKey?l.progressionKey===ex.progressionKey:l.planId===workoutPlan.id)&&workingSetsOf(l.sets).length>0);
   const hist=chronologicalExposures(compatible,now,14,tz);
   if(!hist.length)continue;
   const latest=hist.at(-1);
   const latestSets=workingSetsOf(latest.sets);
   const latestKg=Math.round(latestSets.reduce((v,s)=>v+Number(s.kg||0),0)/latestSets.length*10)/10;
   const latestReps=latestSets.reduce((v,s)=>v+Number(s.reps||0),0);
   if(ex.suggestedKg!=null){
    readyForNextLoad.push({exerciseId:ex.id,name:ex.name,kg:latestKg,suggestedKg:ex.suggestedKg});
   }
   if(hist.length>=2){
    const prev=hist.at(-2);
    const prevSets=workingSetsOf(prev.sets);
    const prevKg=Math.round(prevSets.reduce((v,s)=>v+Number(s.kg||0),0)/prevSets.length*10)/10;
    const prevReps=prevSets.reduce((v,s)=>v+Number(s.reps||0),0);
    if(isWeighted&&(latestKg===0||prevKg===0))continue;
    if(latestKg>prevKg){
     loadIncreases.push({exerciseId:ex.id,name:ex.name,fromKg:prevKg,toKg:latestKg,deltaKg:Math.round((latestKg-prevKg)*10)/10,date:latest.date});
    }else if(latestKg<prevKg){
     const fatigueDrop=latestSets.some(s=>s.rir!=null&&s.rir<=1)||latestReps<prevReps;
     loadDecreases.push({exerciseId:ex.id,name:ex.name,fromKg:prevKg,toKg:latestKg,deltaKg:Math.round((prevKg-latestKg)*10)/10,date:latest.date,fatigueDrop});
    }else if(latestReps>prevReps){
     repIncreases.push({exerciseId:ex.id,name:ex.name,kg:latestKg,fromReps:prevReps,toReps:latestReps,date:latest.date});
    }
   }
  }
 }
 const parts=[];
 if(loadIncreases.length)parts.push(`Load increased (${loadIncreases.map(x=>`${x.name}: ${x.fromKg}->${x.toKg} kg`).join(', ')})`);
 if(repIncreases.length)parts.push(`Reps increased (${repIncreases.map(x=>`${x.name}: ${x.fromReps}->${x.toReps} reps`).join(', ')})`);
 if(loadDecreases.length)parts.push(`Load decreased (${loadDecreases.map(x=>`${x.name}: ${x.fromKg}->${x.toKg} kg`).join(', ')})`);
 if(readyForNextLoad.length)parts.push(`Next load suggestions pending readiness (${readyForNextLoad.map(x=>`${x.name} -> ${x.suggestedKg} kg`).join(', ')})`);
 return {loadIncreases,loadDecreases,repIncreases,readyForNextLoad,summaryText:parts.length?parts.join(' | '):'No comparable progression change yet; continue logging load and reps.'};
}
export function calorieReview(weights,foodDays,goal,energy,now=clockNow(),lastChange=0,tz=clockTimeZone()){
 const end=localDate(now,tz),start=dateOffset(end,-13),middle=dateOffset(end,-6);
 if(lastChange&&now-lastChange<14*DAY)return {action:'hold',reasonCode:'COOLDOWN_14D',reviewScope:'system_generated_guidance',reason:'Monitoring your response to the last adjustment; at least 14 days are required before proposing another calorie change.'};
 const recent=[...new Map(weights.filter(x=>x.date>=start&&x.date<=end&&Number.isFinite(x.kg)).map(x=>[x.date,x])).values()];
 const a=recent.filter(x=>x.date<middle),b=recent.filter(x=>x.date>=middle);
 const completed=[...new Map(foodDays.filter(x=>x.complete&&x.energy>0&&x.adherence>=80&&x.date>=start&&x.date<=end).map(x=>[x.date,x])).values()];
 const prev7AvgKg=a.length?Math.round(mean(a.map(x=>x.kg))*100)/100:null;
 const curr7AvgKg=b.length?Math.round(mean(b.map(x=>x.kg))*100)/100:null;
 const coverage={previousWeights:a.length,currentWeights:b.length,completeFoodDays:completed.length,previous7dAvgKg:prev7AvgKg,current7dAvgKg:curr7AvgKg};
 if(a.length<3||b.length<3||completed.length<10)return {action:'hold',reasonCode:'INSUFFICIENT_EVIDENCE_COVERAGE',reviewScope:'system_generated_guidance',reason:'Keep logging: adaptive calorie reviews require at least 3 weigh-ins in each of the last 2 weeks and 10 adherent complete food days.',coverage};
 const elapsedDays=(mean(b.map(x=>Date.parse(x.date+'T12:00:00Z')))-mean(a.map(x=>Date.parse(x.date+'T12:00:00Z'))))/DAY;
 if(elapsedDays<4)return {action:'hold',reasonCode:'WEIGHT_SAMPLING_TOO_CLOSE',reason:'Spread weigh-ins across the week so trend velocity can be calculated reliably.',coverage};
 const rate=(mean(b.map(x=>x.kg))-mean(a.map(x=>x.kg)))/mean(a.map(x=>x.kg))*100*7/elapsedDays;
 let delta=0;if(goal==='lose')delta=rate>-.25?-1:rate< -1?1:0;
 if(['gain','muscle_gain'].includes(goal))delta=rate<.1?1:rate>.5?-1:0;
 if(['maintain','recomposition'].includes(goal))delta=rate<-.5?1:rate>.5?-1:0;
 if(!delta)return {action:'hold',reasonCode:'TREND_ON_TRACK',reviewScope:'system_generated_guidance',reason:`Your 2-week weight trend (${rate.toFixed(2)}%/week) is within the expected target range; no calorie adjustment is needed.`,rate,coverage};
 const step=delta*Math.min(150,Math.floor(energy*.05));
 return {action:'propose',reasonCode:step<0?'CALORIE_DEFICIT_STEP':'CALORIE_SURPLUS_STEP',reviewScope:'system_generated_guidance',delta:step,rate,coverage,previous7dAvgKg:prev7AvgKg,current7dAvgKg:curr7AvgKg,reason:step<0?`Based on adherent food logs and a ${rate.toFixed(2)}%/week weight trend, we propose a modest ${Math.abs(step)} kcal daily reduction.`:`Based on adherent food logs and a ${rate.toFixed(2)}%/week weight trend, we propose a modest +${step} kcal daily increase.`};
}
export function progression(exercise,logs,readiness){
 const compatible=logs.filter(l=>!l.adHoc&&!(l.entryMode==='simple'&&usesKg(exercise))&&l.exerciseId===exercise.id&&l.loadMode===exercise.loadMode&&(exercise.progressionKey?l.progressionKey===exercise.progressionKey:!exercise.planId||l.planId===exercise.planId));
 const last=chronologicalExposures(compatible).slice(-2);
 if(!readiness.progressionAllowed||last.length<2)return {action:'hold',reasonCode:'INSUFFICIENT_EXPOSURES_OR_RECOVERY',reason:'Log at least two comparable sessions with ready recovery before load increases are suggested.'};
 if(eachSide(exercise)&&!last.every(l=>l.bothSides===true))return {action:'hold',reasonCode:'UNILATERAL_BOTH_SIDES_REQUIRED',reason:'Confirm both left and right sides are completed equally before increasing load on unilateral exercises.'};
 if(!last.every(l=>{const ws=workingSetsOf(l.sets);return ws.length>=exercise.sets&&ws.every(s=>!s.pain&&s.reps>=exercise.repMax&&s.rir!=null&&s.rir>=exercise.rir);}))return {action:'hold',reasonCode:'REP_OR_RIR_THRESHOLD_NOT_MET',reason:'Reach the top of the prescribed rep range at or above target RIR across two sessions before increasing weight.'};
 const kg=workingSetsOf(last[1].sets)[0].kg;
 if(!last.every(l=>workingSetsOf(l.sets).every(s=>s.kg===kg)))return {action:'hold',reasonCode:'UNIFORM_LOAD_REQUIRED',reason:'Complete all working sets at the same load across two sessions before increasing weight.'};
 const increment=last[1].increment??2.5;
 const allowsLoad=usesKg(exercise)||(exercise.supportsAddedWeight&&kg>0);
 if(!allowsLoad)return {action:'hold',reasonCode:'BODYWEIGHT_PROGRESSION_REPS_ONLY',reason:'Progress bodyweight movements through additional reps and tempo control.'};
 if(!increment||!kg||increment>kg*.05)return {action:'hold',reasonCode:'VALID_INCREMENT_REQUIRED',reason:'Current weight increment exceeds conservative progression bounds (<= 5%); build reps and control first.'};
 const nextKg=Math.max(0,kg+(exercise.loadMode==='assisted'?-increment:increment));
 return {action:'increase',reasonCode:'DOUBLE_PROGRESSION_READY',kg:nextKg,reason:`Target reps achieved cleanly across two consecutive sessions; consider progressing to ${nextKg} kg if technique and recovery feel solid.`};
}
