import fs from 'node:fs';
import path from 'node:path';
import {scenarioRuntime,independentPlanIssues} from './scenario-http.mjs';
import {library} from '../../server/food.mjs';
const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Usage: service-track-matrix.mjs <original-run> <new-output>');
const cohort=JSON.parse(fs.readFileSync(path.join(source,'cohort.json'))),runtime=await scenarioRuntime(output,'100_PROFILES_ACROSS_THREE_SERVICE_TRACKS_INITIAL_HTTP_MATRIX'),{client,check,report}=runtime;
report.users=[];let error;
try{
 for(const persona of cohort)for(const track of ['nutrition_only','workouts_only','nutrition_and_workouts']){
  const userId=persona.userId+'-track-'+track,c=client(userId),draft={...persona.onboarding,serviceTrack:track};
  // Explicit fixture declaration of outside training for nutrition-only users.
  if(track==='nutrition_only')draft.externalTrainingDays=[...draft.selectedWorkoutDays];
  const response=await c.command('generate',draft,{allowFailure:true,seedKey:'track-matrix:'+userId}),reload=await c.request('GET','state'),brief=await c.brief();
  const row={userId,personaId:persona.userId,track,status:response.status,code:response.response.code||null,message:response.response.message||null};report.users.push(row);
  check(userId+':readable-no-server-errors',response.status<500&&reload.status===200&&brief.status===200);
  if(response.status===200){
   check(userId+':track-persisted',c.state.onboarding.serviceTrack===track);
   check(userId+':only-selected-services',track==='workouts_only'?c.state.active_plan_id===null&&c.state.workoutPlan!=null:track==='nutrition_only'?c.state.active_plan_id!=null&&c.state.workoutPlan===null:c.state.active_plan_id!=null&&c.state.workoutPlan!=null);
   if(track!=='workouts_only'){const issues=independentPlanIssues(c.state.plans.find(p=>p.id===c.state.active_plan_id),library);check(userId+':independent-nutrition-bounds',issues.length===0,{issues});}
   check(userId+':brief-roles-match-track',brief.response.notes.some(n=>n.role==='followup')&&(track==='workouts_only'?!brief.response.notes.some(n=>n.role==='nutrition'):brief.response.notes.some(n=>n.role==='nutrition'))&&(track==='nutrition_only'?!brief.response.notes.some(n=>n.role==='training'):brief.response.notes.some(n=>n.role==='training')));
  }else check(userId+':rejection-leaves-empty-account',c.state.profile===null&&c.state.revision===0&&brief.response.notes.length===0);
 }
 report.summary={profiles:cohort.length,cases:report.users.length,tracks:Object.fromEntries(['nutrition_only','workouts_only','nutrition_and_workouts'].map(t=>[t,{accepted:report.users.filter(u=>u.track===t&&u.status===200).length,rejected:report.users.filter(u=>u.track===t&&u.status!==200).length}]))};
 report.limitations.push('Initial service-track eligibility and state/brief separation, not 300 completed longitudinal histories.','Nutrition-only external training days are explicitly supplied fixture inputs, not inferred user activity.');
}catch(e){error=e;}
finally{await runtime.finish(error);}
