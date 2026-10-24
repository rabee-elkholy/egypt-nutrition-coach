import test from 'node:test';
import assert from 'node:assert/strict';
import {usesKg,setSummary} from '../exercise-load.mjs';
import {generate,empty,command,today} from '../server/coaching.mjs';
import {progression} from '../server/recovery.mjs';
const draft={name:'Bodyweight',age:30,weight:80,height:175,sex:'male',goal:'maintain',serviceTrack:'workouts_only',workoutLocation:'home_only',homeEquipment:['none'],healthConfirmed:true,selectedWorkoutDays:[1,3,5]};
test('load controls distinguish bodyweight, bands, external weights and assisted machines',()=>{
 assert.equal(usesKg({loadMode:'bodyweight'}),false);assert.equal(usesKg({loadMode:'variable'}),false);assert.equal(usesKg({loadMode:'external'}),true);
 assert.equal(usesKg({loadMode:'assisted',equipment:[{equipment_id:'machine'}]}),true);assert.equal(usesKg({loadMode:'assisted',equipment:[{equipment_id:'resistance_band'}]}),false);
 assert.equal(setSummary({loadMode:'bodyweight'},[{kg:25,reps:12}]),'12 عدة');
});
test('bodyweight saves and edits normalize legacy kg and do not create load progression',()=>{
 let s=generate(empty(),draft);const day=s.workoutPlan.days[0],ex=day.exercises.find(e=>!usesKg(e));assert.ok(ex);
 s=command(s,'workout',{dayIndex:day.dayIndex,exerciseId:ex.id,date:today(),sets:[{kg:99,reps:10,rir:2,pain:false},{reps:12,rir:2,pain:false}],increment:2,bothSides:true,autoSession:true});
 assert.deepEqual(s.workoutLogs[0].sets.map(x=>x.kg),[0,0]);assert.equal(s.workoutLogs[0].increment,null);assert.ok(s.sessions.length);
 s=command(s,'workout',{dayIndex:day.dayIndex,exerciseId:ex.id,date:today(),sets:[{reps:15,rir:3,pain:false}],bothSides:true,autoSession:true});
 assert.equal(s.workoutLogs.length,1);assert.equal(s.workoutLogs[0].sets[0].reps,15);assert.equal(s.workoutLogs[0].sets[0].kg,0);assert.equal(progression(ex,s.workoutLogs,{progressionAllowed:true}).action,'hold');
});
