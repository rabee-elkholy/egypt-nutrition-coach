import {healthyCheckin,completedTraining} from './helpers.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {empty,generate,command,today} from '../server/coaching.mjs';
import {dayTotals,mealAlternatives,plannedEnergyForDate} from '../server/food.mjs';
import {recovery,calorieReview,progression} from '../server/recovery.mjs';
import {workoutPlan} from '../server/workouts.mjs';
import {dateOffset,localDate} from '../coaching-shared.mjs';
const draft={name:'Test',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5]};
const fixture=generate(empty(),draft);
const run=(s,a,p)=>{const result=command(structuredClone(s),a,p);result.revision++;return result;};
test('actual planned portions freeze quantity; duplicates are rejected; deleting reopens completion',()=>{
 const source=structuredClone(fixture),meal=source.plans[0].days[0].meals[0],energy=Number(meal.snapshot.values.energy);
 let s=run(source,'food_entry',{date:today(),source:'planned',mealId:meal.id,slot:meal.slot,quantity:.5});
 assert.ok(Math.abs(dayTotals(s,today()).totals.energy-energy*.5)<.01);assert.equal(source.foodEntries.length,0);
 assert.throws(()=>run(s,'food_entry',{date:today(),source:'planned',mealId:meal.id,slot:meal.slot,quantity:1}),/متسجلة/);
 s=run(s,'food_complete',{date:today(),complete:true});assert.equal(s.foodLogs[0].complete,true);
 s=run(s,'food_delete',{id:s.foodEntries[0].id});assert.equal(s.foodLogs[0].complete,false);assert.equal(dayTotals(s,today()).totals.energy,null);
});
test('missing manual macros remain unknown and new food invalidates completion',()=>{
 let s=run(fixture,'food_entry',{source:'manual',date:today(),slot:'snack',name:'قهوة',energy:40});
 assert.equal(s.foodEntries[0].snapshot.values.protein,null);s=run(s,'food_complete',{date:today(),complete:true});
 s=run(s,'food_entry',{source:'ingredient',date:today(),slot:'breakfast',key:'fava',grams:100});
 assert.equal(s.foodLogs[0].complete,false);assert.equal(dayTotals(s,today()).totals.protein,null);assert.equal(s.foodLogs[0].energy,150);
});
test('logged meals cannot be replaced, alternatives retain exclusions, unlogged replacement makes a new immutable plan',()=>{
 const s=structuredClone(fixture),meal=s.plans[0].days[0].meals[0],choices=mealAlternatives(s,meal.id);assert.ok(choices.length);
 const original=JSON.stringify(s.plans[0]);const next=run(s,'replace_meal',{mealId:meal.id,templateId:choices[0].snapshot.template_id});
 assert.equal(JSON.stringify(next.plans[0]),original);assert.notEqual(next.active_plan_id,s.active_plan_id);
 const logged=run(s,'food_entry',{source:'planned',date:today(),mealId:meal.id,slot:meal.slot,quantity:1});
 assert.throws(()=>run(logged,'replace_meal',{mealId:meal.id,templateId:choices[0].snapshot.template_id}),/اتسجلت/);
});
test('regional pain blocks progression; duplicated and future reports cannot create a personal baseline',()=>{
 const now=Date.now(),base={at:new Date(now).toISOString(),date:today(),sleepHours:8,sleepQuality:4,fatigue:2,stress:2,soreness:0,sorenessByRegion:{quadriceps:8},painRegions:[],pain:false,illness:false,redFlags:false};
 let r=recovery([base],now);assert.equal(r.muscles.quadriceps.status,'caution');assert.equal(r.muscles.chest.status,'unknown');
 r=recovery(Array(15).fill(base).concat([{...base,date:dateOffset(today(),1),at:new Date(now+86400000).toISOString()}]),now);assert.equal(r.baselineReady,false);assert.equal(r.coverage,1);
 const reports=Array.from({length:8},(_,i)=>({...base,date:dateOffset(today(),-i),at:new Date(now-i*86400000).toISOString(),sorenessByRegion:{quadriceps:2}}));
 r=recovery(reports,now);assert.equal(r.baselineReady,true);assert.equal(r.baseline.reports,7);
});
test('calorie review deduplicates dates and requires complete adherent days with real energy',()=>{
 const now=Date.now(),weights=Array.from({length:14},(_,i)=>({date:dateOffset(localDate(now),-i),kg:80}));
 const food=weights.map(w=>({date:w.date,energy:2000,adherence:100,complete:true}));
 assert.equal(calorieReview(weights,food,'lose',2040,now).delta,-102);
 assert.equal(calorieReview(Array(10).fill(weights[0]),food,'lose',2040,now).action,'hold');
 assert.equal(calorieReview(weights,food.map(d=>({...d,adherence:60})),'lose',2040,now).action,'hold');
});
test('accepted calorie proposal preserves past/today and protein targets; stale acceptance fails',()=>{
 const s=structuredClone(fixture),plan=s.plans[0],before=JSON.stringify(plan.days[0]);
 s.checkins=[healthyCheckin()];s.adaptations=[{id:'proposal',kind:'calories',delta:-100,reason:'test',status:'pending',baseRevision:s.revision}];
 const next=run(s,'adaptation',{id:'proposal',accept:true}),current=next.plans.find(p=>p.id===next.active_plan_id);
 assert.equal(JSON.stringify(current.days[0]),before);assert.equal(current.targets.energy,plan.targets.energy-100);assert.equal(current.targets.protein,plan.targets.protein);assert.equal(current.effective_from,dateOffset(today(),1));assert.equal(plannedEnergyForDate(next,today()),plan.targets.energy);assert.equal(plannedEnergyForDate(next,dateOffset(today(),1)),current.targets.energy);
 s.revision++;assert.throws(()=>run(s,'adaptation',{id:'proposal',accept:true}),e=>e.status===409);
});
test('mixed loads and same-day repeat logs never count as two comparable successful exposures',()=>{
 const e={id:'e',sets:2,repMax:12,rir:2,loadMode:'external'},a={exerciseId:'e',loadMode:'external',at:'2026-10-20',sets:[{kg:20,reps:12,rir:2},{kg:18,reps:12,rir:2}],increment:1};
 assert.equal(progression(e,[a,{...a,at:'2026-10-22'}],{progressionAllowed:true}).action,'hold');
 const flat={...a,sets:[{kg:20,reps:12,rir:2},{kg:20,reps:12,rir:2}]};assert.equal(progression(e,[flat,flat],{progressionAllowed:true}).action,'hold');
});
test('training respects time and split preferences, including equipment setup',()=>{
 const short=workoutPlan({...draft,sessionDuration:20,workoutLocation:'home_only',homeEquipment:['none']});
 for(const day of short.days){assert.ok(day.estimatedMinutes<=20);for(const e of day.exercises)assert.ok(e.equipment.every(x=>x.equipment_id==='bodyweight'));}
 const split=workoutPlan({...draft,selectedWorkoutDays:[0,1,2,4,5],workoutSplitPreference:'bro_split'});assert.equal(split.split,'bro_split');assert.deepEqual(split.days.map(d=>d.focus),['chest','back','legs','shoulders','arms']);
});
test('source quads/adductors map to check-in regions consistently',async()=>{
 const {regionForMuscle,muscleRegions,catalog}=await import('../server/workouts.mjs');assert.equal(regionForMuscle('quadriceps'),'quadriceps');assert.equal(regionForMuscle('hip_adductors'),'hips');
 const squat=catalog.exercises.find(e=>e.pattern==='squat'&&e.muscles.some(m=>m.muscle_id==='quadriceps'));assert.ok(muscleRegions(squat).includes('quadriceps'));
});
test('onboarding goal pace changes the bounded starting energy without changing its UI module',async()=>{
 const {estimateNeeds}=await import('../planner-core.mjs');const p=fixture.profile;
 assert.ok(estimateNeeds({...p,goalPace:'slow'}).energy>estimateNeeds({...p,goalPace:'fast'}).energy);
 assert.ok(Math.abs(estimateNeeds({...p,goalPace:'fast'}).energy_change)<=500);
});
test('stable plateau with enough recovery and adherence proposes <=20% more weekly sets, requiring acceptance',async()=>{
 const {volumeReview}=await import('../server/training-review.mjs');
 const s=structuredClone(fixture);s.profile.goal='muscle_gain';const e=s.workoutPlan.days[0].exercises[0];const plan=s.workoutPlan;
 completedTraining(s);s.checkins=Array.from({length:8},(_,i)=>healthyCheckin(i));
 const ready={status:'ready',baselineReady:true,muscles:{}};const proposal=volumeReview(s,ready);assert.equal(proposal.action,'propose');assert.ok(proposal.extraSets/plan.weeklySets[proposal.region]<=.2);
 s.adaptations=[{...proposal,id:'v',status:'pending',baseRevision:s.revision}];const next=run(s,'adaptation',{id:'v',accept:true});assert.notEqual(next.workoutPlan.id,plan.id);assert.equal(next.workoutPlan.days[0].exercises[0].sets,e.sets+1);assert.equal(s.workoutPlan.days[0].exercises[0].sets,e.sets);
 assert.equal(volumeReview(s,{...ready,baselineReady:false}).action,'hold');
});
test('reaching target weight proposes maintenance and requires acceptance; actual history is preserved',()=>{
 let s=structuredClone(fixture);s.profile.targetWeight=75;
 s.weights=[0,1,2].map(i=>({date:dateOffset(today(),-i),kg:74.9}));
 s.checkins=[{at:new Date().toISOString(),date:today(),sleepHours:8,sleepQuality:4,fatigue:2,stress:2,soreness:0,pain:false,illness:false,redFlags:false}];
 s=run(s,'review',{});assert.equal(s.adaptations.at(-1).kind,'maintenance');assert.equal(s.profile.goal,'lose');
 const before=JSON.stringify(s.plans[0].days[0]);s=run(s,'adaptation',{id:s.adaptations.at(-1).id,accept:true});assert.equal(s.profile.goal,'maintain');assert.equal(s.plans.at(-1).effective_from,dateOffset(today(),1));assert.equal(JSON.stringify(s.plans.at(-1).days[0]),before);
});
test('accepted reschedule moves one calendar occurrence without adding a second session that week',async()=>{
 const {scheduledSessions}=await import('../server/workouts.mjs');let s=structuredClone(fixture);const before=scheduledSessions(s),first=before[0];
 const rest=Array.from({length:7},(_,i)=>dateOffset(today(),i)).find(date=>!before.some(x=>x.date===date));
 s=run(s,'reschedule',{dayIndex:first.dayIndex,toDate:rest});assert.deepEqual(scheduledSessions(s),before);
 s=run(s,'adaptation',{id:s.adaptations.at(-1).id,accept:true});const after=scheduledSessions(s);
 assert.equal(after.length,before.length);assert.ok(after.some(x=>x.date===rest&&x.moved));assert.ok(!after.some(x=>x.date===first.date&&x.dayIndex===first.dayIndex));
});
test('meal generation and replacements keep a real exclusion instead of silently relaxing it',()=>{
 const s=generate(empty(),{...draft,excludedGroups:['fava']});assert.deepEqual(s.preferences.excludedGroups,['fava']);
 for(const day of s.plans[0].days)for(const meal of day.meals){assert.ok(!meal.snapshot.ingredients.some(i=>i.key==='fava'));for(const a of mealAlternatives(s,meal.id))assert.ok(!a.snapshot.ingredients.some(i=>i.key==='fava'));}
});
test('affected-muscle soreness blocks a load increase even when global recovery has only one warning',()=>{
 let s=structuredClone(fixture);const day=s.workoutPlan.days[0],e=day.exercises.find(x=>x.regions.includes('quadriceps'));
 const sets=Array.from({length:e.sets},()=>({kg:20,reps:e.repMax,rir:e.rir,pain:false}));
 s.workoutLogs=[{id:'older',at:new Date(Date.now()-2*86400000).toISOString(),date:dateOffset(today(),-2),planId:s.workoutPlan.id,dayIndex:day.dayIndex,exerciseId:e.id,loadMode:e.loadMode,sets,increment:1}];
 s.checkins=[{at:new Date().toISOString(),date:today(),sleepHours:8,sleepQuality:4,fatigue:2,stress:1,soreness:0,sorenessByRegion:{quadriceps:8},pain:false,illness:false,redFlags:false}];
 let next=run(s,'workout',{exerciseId:e.id,dayIndex:day.dayIndex,sets,increment:1});assert.equal(recovery(next.checkins).status,'ready');assert.equal(next.workoutPlan.days[0].exercises.find(x=>x.id===e.id).suggestedKg,undefined);
 s.checkins[0].sorenessByRegion.quadriceps=0;next=run(s,'workout',{exerciseId:e.id,dayIndex:day.dayIndex,sets,increment:1});assert.equal(next.workoutPlan.days[0].exercises.find(x=>x.id===e.id).suggestedKg,21);
});
test('renewing an expired week preserves the accepted energy and leaves the previous week immutable',()=>{
 const s=structuredClone(fixture),previous=s.plans[0];for(const day of previous.days)day.date=dateOffset(day.date,-7);previous.start_date=dateOffset(previous.start_date,-7);
 const frozen=JSON.stringify(previous),energy=previous.targets.energy-100;s.nutritionAdjustment={energy,protein:previous.targets.protein,reason:'accepted earlier'};
 const next=run(s,'renew_plan',{}),plan=next.plans.at(-1);assert.equal(plan.targets.energy,energy);assert.equal(plan.days[0].date,today());assert.equal(JSON.stringify(next.plans[0]),frozen);
});
