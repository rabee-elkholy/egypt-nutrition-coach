import test from 'node:test';
import assert from 'node:assert/strict';
import {alternatives,snapshotTemplate} from '../planner-core.mjs';
import {library} from '../server/food.mjs';
import {regionalFoodTemplates} from '../regional-foods.mjs';
import {workoutPlan,exerciseAlternatives,primaryRegions,estimatedSessionMinutes,isFriendlyForInjuries} from '../server/workouts.mjs';

test('daily constraints search beyond the first thirty ranked food alternatives',()=>{
 const template=regionalFoodTemplates(library,'egypt').find(t=>t.id==='regional-egypt-koshari');
 const meal={slot:'lunch',snapshot:snapshotTemplate(template,template.items,library)};
 const prefs={region:'egypt',budget:'high',proteins:['chicken','meat','fish','eggs','dairy','legumes']};
 const ranked=alternatives(meal,prefs,library,100);assert.ok(ranked.length>35);
 const wanted=ranked[35].snapshot.template_id;
 const accepted=alternatives(meal,prefs,library,6,null,a=>a.snapshot.template_id===wanted);
 assert.equal(accepted.length,1);assert.equal(accepted[0].snapshot.template_id,wanted);
 assert.deepEqual(alternatives(meal,prefs,library,6,null,()=>false),[]);
 assert.deepEqual(alternatives(meal,prefs,library,0),[]);
 for(const invalid of [-1,1.5,NaN,Infinity,101])assert.throws(()=>alternatives(meal,prefs,library,invalid));
});
test('workout alternatives retain every primary muscle region within time and equipment constraints',()=>{
 let checked=0;
 for(const workoutLocation of ['gym_only','home_only'])for(const fitnessLevel of ['beginner','intermediate']){
 const prefs={workoutLocation,fitnessLevel,homeEquipment:['dumbbells','bench'],selectedWorkoutDays:[1,3,5],sessionDuration:45,injuries:['neck_pain']};
 const plan=workoutPlan(prefs),s={workoutPlan:plan,onboarding:{workoutPrefs:prefs}};
 for(const day of plan.days)for(const old of day.exercises)for(const next of exerciseAlternatives(s,day.dayIndex,old.id)){
 checked++;assert.ok(primaryRegions(old).every(r=>primaryRegions(next).includes(r)));assert.ok(isFriendlyForInjuries(next,prefs.injuries));
 assert.ok(estimatedSessionMinutes({...day,exercises:day.exercises.map(e=>e.id===old.id?{...next,sets:old.sets,repMax:old.repMax,restSeconds:old.restSeconds}:e)})<=day.duration);
 }
 }
 assert.ok(checked>0);
});
