import {scenarioRuntime} from './scenario-http.mjs';
import {usesKg} from '../../exercise-load.mjs';
const output=process.argv[2];if(!output)throw Error('Usage: workout-progress-paths.mjs <new-output>');
const runtime=await scenarioRuntime(output,'FOUR_MATCHED_28_DAY_WORKOUT_PERFORMANCE_AND_RECOVERY_HTTP_PATHS'),{client,check,report}=runtime;
const draft={name:'Workout progression',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:65,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
const healthy={sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false};
report.journeys=[];let error;
try{
 for(const mode of ['progression','performance-drop','poor-recovery','pain']){
  const c=client('workout-path-'+mode),entry={mode,days:28,exposures:[]};report.journeys.push(entry);await c.command('generate',draft,{seedKey:'workout-matched-baseline'});
  const dayPlan=c.state.workoutPlan.days.find(d=>d.exercises.some(e=>usesKg(e)&&e.loadMode!=='assisted')),exercise=dayPlan.exercises.find(e=>usesKg(e)&&e.loadMode!=='assisted');
  const baseline=JSON.stringify(c.state.workoutPlan);
  for(let day=1;day<=28;day++){
   c.day=day;const date=new Date(Date.parse('2026-10-24T12:00:00Z')+(day-1)*86400000).toISOString().slice(0,10),active=c.state.plans.find(p=>p.id===c.state.active_plan_id);
   if(active.days.at(-1).date<date)await c.command('renew_plan',{});
   await c.command('weight',{date,kg:80});await c.command('food',{date,energy:c.state.plans.find(p=>p.id===c.state.active_plan_id).targets.energy,complete:true});
   await c.command('recovery',mode==='poor-recovery'?{...healthy,sleepHours:4,sleepQuality:1,fatigue:5,stress:5,soreness:8}:healthy);
   if([1,4,8,11,15,18,22,25].includes(day)){
    const index=entry.exposures.length,reps=mode==='performance-drop'&&index%2===1?Math.max(1,Math.floor(exercise.repMax*.6)):exercise.repMax;
    await c.command('workout',{date,dayIndex:dayPlan.dayIndex,exerciseId:exercise.id,bothSides:true,increment:1,sets:Array.from({length:exercise.sets},()=>({kg:20,reps,rir:Math.max(3,exercise.rir),pain:mode==='pain'}))});
    const current=c.state.workoutPlan.days.find(d=>d.dayIndex===dayPlan.dayIndex).exercises.find(e=>e.id===exercise.id);
    entry.exposures.push({day,reps,suggestedKg:current.suggestedKg??null,recoveryStatus:c.state.recovery.status,performanceDrop:c.state.progressSummary.workoutSummary.performanceDrop});
    if(mode==='progression'&&index>=1)check('two-successful-exposures-permit-conservative-load:'+day,current.suggestedKg===21);
    if(mode==='performance-drop'&&index%2===1)check('falling-reps-block-progression:'+day,current.suggestedKg==null&&c.state.progressSummary.workoutSummary.performanceDrop===true);
    if(['poor-recovery','pain'].includes(mode))check(mode+':no-load-increase:'+day,current.suggestedKg==null);
    if(mode==='pain'){const brief=await c.brief();check('pain:brief-safety-priority:'+day,brief.response.notes.find(n=>n.role==='training')?.key==='safety');}
   }
   if(day===14){
    await c.command('review',{});
    if(mode==='performance-drop')check('performance-drop-blocks-otherwise-indicated-calorie-cut',c.state.lastReview.nutrition.reasonCode==='PERFORMANCE_DROP_CALORIE_CUT_HOLD'&&!c.state.adaptations.some(a=>a.kind==='calories'&&a.status==='pending'));
   }
   // Suggestions may change; the canonical prescription and identities must not.
   const clean=structuredClone(c.state.workoutPlan);for(const d of clean.days)for(const e of d.exercises){delete e.suggestedKg;delete e.progressionReason;delete e.suggestionAt;}
   check(mode+':baseline-prescription-preserved:'+day,JSON.stringify(clean)===baseline);
  }
  console.log(JSON.stringify({mode,exposures:entry.exposures}));
 }
 report.summary={journeys:4,userDays:112,exposures:report.journeys.reduce((n,j)=>n+j.exposures.length,0)};
}catch(e){error=e;}
finally{await runtime.finish(error);}
