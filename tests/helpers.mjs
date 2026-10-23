import {localDate,dateOffset} from '../coaching-shared.mjs';
export function healthyCheckin(offset=0,extra={}){return {date:dateOffset(localDate(),-offset),at:new Date(Date.now()-offset*86400000).toISOString(),sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false,...extra};}
export function completedTraining(s,count=6){
 s.sessions=[];s.workoutLogs=[];
 for(let i=0;i<count;i++){
  const offset=(count-1-i)*2,day=s.workoutPlan.days[i%s.workoutPlan.days.length],date=dateOffset(localDate(),-offset),at=new Date(Date.now()-offset*86400000).toISOString();
  s.sessions.push({id:'session-'+i,date,dayIndex:day.dayIndex,planId:s.workoutPlan.id,programId:s.workoutPlan.programId,status:'completed',duration:45,rpe:6,expectedExercises:day.exercises.map(e=>({exerciseId:e.id,sets:e.sets,progressionKey:e.progressionKey}))});
  for(const e of day.exercises)s.workoutLogs.push({id:'log-'+i+'-'+e.id,date,at,dayIndex:day.dayIndex,planId:s.workoutPlan.id,exerciseId:e.id,progressionKey:e.progressionKey,loadMode:e.loadMode,increment:1,sets:Array.from({length:e.sets},()=>({kg:e.loadMode==='bodyweight'?0:20,reps:e.repMin+2,rir:3,pain:false}))});
 }
 return s;
}
