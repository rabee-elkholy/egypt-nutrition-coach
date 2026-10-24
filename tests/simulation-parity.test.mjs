import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate,command} from '../server/coaching.mjs';
import {simulationCommand} from '../server/simulation.mjs';
import {withClock} from '../server/clock.mjs';
import {recovery} from '../server/recovery.mjs';
import {usesKg} from '../exercise-load.mjs';
const now=Date.parse('2026-10-24T12:00:00Z');
const draft={name:'Parity',age:30,weight:80,height:175,sex:'male',goal:'maintain',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[6],workoutLocation:'home_only',homeEquipment:['none']};
const view=s=>({logs:s.workoutLogs.map(l=>({date:l.date,exerciseId:l.exerciseId,sets:l.sets,increment:l.increment})),sessions:s.sessions.map(x=>({date:x.date,status:x.status,completionRatio:x.completionRatio})),recovery:recovery(s.checkins,now,s.workoutLogs).status,review:s.lastReview?{recovery:s.lastReview.recovery,nutrition:s.lastReview.nutrition,volume:s.lastReview.volume}:null});
for(const situation of ['ready','tired','pain'])test('real/simulation parity: '+situation,()=>withClock(now,()=>{
 let real=generate(empty(),draft),sim=structuredClone(real);sim.simulation={day:1,startedDate:'2026-10-24',history:[],scenarioByDate:{}};
 const day=real.workoutPlan.days[0],ex=day.exercises[0];
 const actions=[['recovery',{sleepHours:situation==='tired'?5:8,sleepQuality:situation==='tired'?2:4,fatigue:situation==='tired'?4:1,stress:1,pain:situation==='pain',illness:false,redFlags:false}],['workout',{dayIndex:day.dayIndex,exerciseId:ex.id,date:'2026-10-24',sets:Array.from({length:ex.sets},()=>({kg:usesKg(ex)?20:0,reps:ex.repMax,rir:3,pain:situation==='pain'})),bothSides:true,increment:2.5,autoSession:true}],['review',{}]];
 for(const [action,payload]of actions){real=command(real,action,payload);sim=simulationCommand(sim,action,payload);assert.deepEqual(view(real),view(sim));}
}));
