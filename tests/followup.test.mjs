import {healthyCheckin,completedTraining} from './helpers.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {empty,generate,command,today,previewPlan,evaluateEligibility} from '../server/coaching.mjs';
import {dayTotals,mealAlternatives,plannedEnergyForDate} from '../server/food.mjs';
import {recovery,calorieReview,progression} from '../server/recovery.mjs';
import {workoutPlan,scheduledSessions} from '../server/workouts.mjs';
import {saveCustomRecipe,computeCycleState} from '../server/wellness-tools.mjs';
import {getFastingState} from '../server/nutrition-tools.mjs';
import {computeStreakAndEngagement} from '../server/progress-analytics.mjs';
import {dateOffset,localDate,computeAgeFromBirthDate,resolveProfileBirthDateAndAge,effectiveProfileWithLiveAge} from '../coaching-shared.mjs';
import {present,presentBootstrap} from '../server/presentation.mjs';
const draft={name:'Test',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5]};
const fixture=generate(empty(),draft,'audit-fixture');
// These follow-up scenarios represent an established goal, not today's first onboarding.
fixture.nutritionContextStartedOn=dateOffset(today(),-28);
const run=(s,a,p)=>{const result=command(structuredClone(s),a,p);result.revision++;return result;};
test('actual planned portions freeze quantity; duplicates are rejected; deleting reopens completion',()=>{
 const source=structuredClone(fixture),meal=source.plans[0].days[0].meals[0],energy=Number(meal.snapshot.values.energy);
 let s=run(source,'food_entry',{date:today(),source:'planned',mealId:meal.id,slot:meal.slot,quantity:.5});
 assert.ok(Math.abs(dayTotals(s,today()).totals.energy-energy*.5)<.01);assert.equal(source.foodEntries.length,0);
 assert.throws(()=>run(s,'food_entry',{date:today(),source:'planned',mealId:meal.id,slot:meal.slot,quantity:1}),e=>e.code==='PLANNED_MEAL_ALREADY_LOGGED'&&/already been logged/i.test(e.message));
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
 assert.throws(()=>run(logged,'replace_meal',{mealId:meal.id,templateId:choices[0].snapshot.template_id}),e=>e.code==='MEAL_ALREADY_CONSUMED'&&/already been logged/i.test(e.message));
});
test('meal replacement accepts the existing alternativeId alias and retains templateId precedence',()=>{
 const s=structuredClone(fixture),meal=s.plans[0].days[0].meals[0],choices=mealAlternatives(s,meal.id);
 assert.ok(choices.length);
 const target=choices[0].snapshot.template_id,original=JSON.stringify(s.plans[0]);
 for(const payload of [{alternativeId:target},{templateId:target,alternativeId:'unavailable'}]){
  const next=run(s,'replace_meal',{mealId:meal.id,...payload});
  assert.equal(next.plans.find(p=>p.id===next.active_plan_id).days[0].meals.find(m=>m.id===meal.id).snapshot.template_id,target);
  assert.equal(JSON.stringify(next.plans[0]),original);
 }
 assert.throws(()=>run(s,'replace_meal',{mealId:meal.id,alternativeId:'unavailable'}),e=>e.code==='MEAL_ALTERNATIVE_UNAVAILABLE'&&/no longer valid/i.test(e.message));
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
 const e={id:'e',sets:2,repMax:12,rir:2,loadMode:'external'},a={exerciseId:'e',loadMode:'external',at:dateOffset(today(),-3),sets:[{kg:20,reps:12,rir:2},{kg:18,reps:12,rir:2}],increment:1};
 assert.equal(progression(e,[a,{...a,at:dateOffset(today(),-1)}],{progressionAllowed:true}).action,'hold');
 const flat={...a,sets:[{kg:20,reps:12,rir:2},{kg:20,reps:12,rir:2}]};assert.equal(progression(e,[flat,flat],{progressionAllowed:true}).action,'hold');
});
test('training respects time and split preferences, including equipment setup',()=>{
 const short=workoutPlan({...draft,sessionDuration:20,workoutLocation:'home_only',homeEquipment:['none']});
 for(const day of short.days){assert.ok(day.estimatedMinutes<=20);for(const e of day.exercises)assert.ok(e.equipment.every(x=>x.equipment_id==='bodyweight'));}
 const split=workoutPlan({...draft,selectedWorkoutDays:[0,1,2,4,5],workoutSplitPreference:'bro_split'});assert.equal(split.split,'bro_split');assert.deepEqual(split.days.map(d=>d.focus),['chest','back','legs','shoulders','arms']);
 const bro4=workoutPlan({...draft,workoutLocation:'gym_only',selectedWorkoutDays:[0,1,3,4],workoutSplitPreference:'bro_split'});assert.equal(bro4.split,'bro_split');assert.deepEqual(bro4.days.map(d=>d.focus),['chest_tri','back_bi','shoulders_core','legs']);
 const bro3=workoutPlan({...draft,workoutLocation:'gym_only',selectedWorkoutDays:[0,2,4],workoutSplitPreference:'bro_split'});assert.equal(bro3.split,'full_body');
 const ppl4=workoutPlan({...draft,workoutLocation:'gym_only',selectedWorkoutDays:[0,1,3,4],workoutSplitPreference:'ppl'});assert.equal(ppl4.split,'ppl');assert.deepEqual(ppl4.days.map(d=>d.focus),['push','pull','legs','full_body']);
 const ppl5=workoutPlan({...draft,workoutLocation:'gym_only',selectedWorkoutDays:[0,1,2,4,5],workoutSplitPreference:'ppl'});assert.equal(ppl5.split,'ppl');assert.deepEqual(ppl5.days.map(d=>d.focus),['push','pull','legs','upper','lower']);
});
test('previewPlan and workoutPlan maintain 4-day/5-day split parity and fallbacks',async()=>{
 const {previewPlan}=await import('../server/coaching.mjs');
 const base={...draft,serviceTrack:'nutrition_and_workouts',workoutLocation:'gym_only'};
 assert.equal(previewPlan({...base,selectedWorkoutDays:[0,1,3,4],workoutSplitPreference:'bro_split'}).recommendedSplit,'bro_split');
 assert.equal(previewPlan({...base,selectedWorkoutDays:[0,2,4],workoutSplitPreference:'bro_split'}).recommendedSplit,'full_body');
 assert.equal(previewPlan({...base,selectedWorkoutDays:[0,1,3,4],workoutSplitPreference:'ppl'}).recommendedSplit,'ppl');
 assert.equal(previewPlan({...base,selectedWorkoutDays:[0,2],workoutSplitPreference:'ppl'}).recommendedSplit,'full_body');
 assert.equal(previewPlan({...base,selectedWorkoutDays:[0,2],workoutSplitPreference:'upper_lower'}).recommendedSplit,'upper_lower');
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

test('calorie acceptance rejects an infeasible future protein prescription without changing saved input',()=>{
 const s=structuredClone(fixture);s.checkins=[healthyCheckin()];
 for(const meal of s.plans[0].days[1].meals)meal.snapshot.values.protein='1';
 s.adaptations=[{id:'invalid-quality',kind:'calories',delta:-100,reason:'test',status:'pending',baseRevision:s.revision}];
 const before=JSON.stringify(s);assert.throws(()=>run(s,'adaptation',{id:'invalid-quality',accept:true}),e=>e.code==='ENERGY_CHANGE_TARGETS_UNMET'&&/protein or nutrition targets/i.test(e.message));assert.equal(JSON.stringify(s),before);
});

test('food_entry_batch commits atomically in 1 revision, reopens day completion, and rolls back on failure',()=>{
 let s=run(fixture,'food_entry',{date:today(),source:'manual',slot:'breakfast',name:'Starter Coffee',energy:50});
 s=run(s,'food_complete',{date:today(),complete:true});
 assert.equal(s.foodLogs.find(d=>d.date===today()).complete,true);
 const revBefore=s.revision;
 s=run(s,'food_entry_batch',{date:today(),items:[
  {slot:'lunch',source:'ingredient',key:'fava',grams:150},
  {slot:'snack',source:'manual',energy:120}
 ]});
 assert.equal(s.revision,revBefore+1);
 assert.equal(s.foodEntries.length,3);
 assert.equal(s.foodEntries.at(-1).snapshot.name,'Quick Add');
 assert.equal(s.foodLogs.find(d=>d.date===today()).complete,false);
 const snapshotBeforeErr=JSON.stringify(s);
 assert.throws(()=>run(s,'food_entry_batch',{date:today(),items:[
  {slot:'dinner',source:'manual',name:'Valid Dish',energy:300},
  {slot:'dinner',source:'manual',name:'Invalid Zero',energy:0}
 ]}),e=>e.code==='MANUAL_MEAL_ENERGY_REQUIRED');
 assert.equal(JSON.stringify(s),snapshotBeforeErr);
});

test('food_entry_update supports unclamped planned scaling, displaySlot, barcode scaling, and deleted-recipe unit conversion',()=>{
 const meal=fixture.plans[0].days[0].meals[0],baseE=Number(meal.snapshot.values.energy);
 let s=run(fixture,'food_entry',{date:today(),source:'planned',mealId:meal.id,slot:meal.slot,quantity:1});
 const plannedId=s.foodEntries[0].id;
 s=run(s,'food_entry_update',{id:plannedId,quantity:3.5,displaySlot:'iftar'});
 assert.equal(s.foodEntries[0].quantity,3.5);
 assert.equal(s.foodEntries[0].displaySlot,'iftar');
 assert.ok(Math.abs(Number(s.foodEntries[0].snapshot.values.energy)-baseE*3.5)<1);

 s=run(s,'food_entry',{date:today(),source:'barcode',slot:'snack',barcode:'6221007001234',nameEn:'Greek Yogurt',servingSizeGrams:150,servings:1,valuesPer100g:{energy:80,protein:10,carbs:4,fat:2,saturated:1.2}});
 const barcodeEntry=s.foodEntries.find(e=>e.source==='barcode');
 assert.equal(barcodeEntry.quantity,150);
 s=run(s,'food_entry_update',{id:barcodeEntry.id,grams:300});
 const updatedBarcode=s.foodEntries.find(e=>e.id===barcodeEntry.id);
 assert.equal(updatedBarcode.quantity,300);
 assert.equal(Number(updatedBarcode.snapshot.values.energy),240);

 const rec=saveCustomRecipe(s,{
  name:'Milk Chicken Pot',servings:4,
  items:[{foodId:'chicken',grams:400},{foodId:'milk',ml:200,densityGPerMl:1.03}],
  additions:[{foodId:'olive',ml:15,densityGPerMl:0.91}],
  finalWeightGrams:500
 });
 assert.equal(rec.totalGrams,500);
 assert.ok(rec.yieldRatio>0);
 assert.equal(rec.qualityTier,'Calculated from Verified Ingredients');
 s=run(s,'food_entry',{date:today(),source:'recipe',slot:'dinner',recipeId:rec.id,servings:1});
 const recEntryId=s.foodEntries.at(-1).id;
 const singleServingEnergy=Number(s.foodEntries.at(-1).snapshot.values.energy);
 s=run(s,'recipe_delete',{id:rec.id});
 s=run(s,'food_entry_update',{id:recEntryId,grams:250});
 let edited=s.foodEntries.find(e=>e.id===recEntryId);
 assert.equal(edited.recipeUnit,'grams');
 assert.ok(Math.abs(Number(edited.snapshot.values.energy)-singleServingEnergy*2)<2);
 s=run(s,'food_entry_update',{id:recEntryId,servings:1.5});
 edited=s.foodEntries.find(e=>e.id===recEntryId);
 assert.equal(edited.recipeUnit,'servings');
 assert.ok(Math.abs(Number(edited.snapshot.values.energy)-singleServingEnergy*1.5)<2);
});

test('copy_meal filters entryIds/toSlot, replace_meal migrates groceryChecks, and earlyRenew preserves today',()=>{
 const yesterday=dateOffset(today(),-1);
 let s=run(fixture,'food_entry',{date:yesterday,source:'manual',slot:'breakfast',displaySlot:'suhoor',name:'Foul Bowl',energy:320});
 s=run(s,'food_entry',{date:yesterday,source:'manual',slot:'breakfast',name:'Boiled Egg',energy:140});
 const targetEntryId=s.foodEntries[0].id;
 s=run(s,'copy_meal',{fromDate:yesterday,toDate:today(),slot:'breakfast',toSlot:'dinner',entryIds:[targetEntryId]});
 const copied=s.foodEntries.filter(e=>e.date===today());
 assert.equal(copied.length,1);
 assert.equal(copied[0].slot,'dinner');
 assert.equal(copied[0].displaySlot,undefined);
 assert.equal(copied[0].snapshot.name,'Foul Bowl');

 const oldPlanId=s.active_plan_id;
 s=run(s,'grocery_toggle',{planId:oldPlanId,ingredientKey:'fava',checked:true});
 const meal=s.plans[0].days[0].meals[0];
 const alts=mealAlternatives(s,meal.id);
 assert.ok(alts.length>0);
 s=run(s,'replace_meal',{mealId:meal.id,templateId:alts[0].snapshot.template_id});
 assert.notEqual(s.active_plan_id,oldPlanId);
 assert.equal(s.groceryChecks[`${s.active_plan_id}:fava`]?.checked,true);

 const prevTodayDay=structuredClone(s.plans.find(p=>p.id===s.active_plan_id).days.find(d=>d.date===today()));
 s=run(s,'renew_plan',{earlyRenew:true});
 const earlyPlan=s.plans.at(-1);
 assert.equal(earlyPlan.days[0].date,today());
 assert.equal(JSON.stringify(earlyPlan.days[0]),JSON.stringify(prevTodayDay));
 assert.equal(earlyPlan.effective_from,dateOffset(today(),1));
});

test('previewPlan and evaluateEligibility compute 4200 clamp, rest/workout water targets, and exercise estimate',()=>{
 const highCalDraft={name:'Max Preview',age:22,sex:'male',weight:150,height:205,goal:'gain',goalPace:'fast',activity:'active',serviceTrack:'nutrition_and_workouts',workoutLocation:'gym_only',selectedWorkoutDays:[0,1,2,3,4,5,6],dietType:'balanced',healthConfirmed:true};
 const elig=evaluateEligibility(highCalDraft);
 assert.equal(elig.status,'eligible');
 const preview=previewPlan(highCalDraft);
 assert.equal(preview.dailyCalories,4200);
 assert.ok(preview.waterTarget.liters>0);
 assert.ok(preview.workoutDayWaterTarget.liters>=preview.restDayWaterTarget.liters);
 assert.ok(Number.isInteger(preview.estimatedExercisesPerSession)&&preview.estimatedExercisesPerSession>=4);
 const midPreview=previewPlan({name:'Mid Preview',age:28,sex:'male',weight:80,height:178,goal:'maintain',activity:'moderate',serviceTrack:'nutrition_and_workouts',workoutLocation:'gym_only',selectedWorkoutDays:[1,3,5],dietType:'balanced',healthConfirmed:true});
 assert.ok(midPreview.workoutDayWaterTarget.liters>midPreview.restDayWaterTarget.liters);
});

test('workouts support explicit weightedBodyweight/addedKg, workout/session notes, and reject completed reschedule',()=>{
 const todayDow=new Date(today()+'T12:00:00Z').getUTCDay();
 let s=generate(empty(),{...draft,selectedWorkoutDays:[todayDow,(todayDow+2)%7,(todayDow+4)%7],workoutLocation:'home_only',homeEquipment:['pullup_bar'],healthConfirmed:true},'bw-fixture');
 const before=scheduledSessions(s);
 const first=before[0];
 const day=s.workoutPlan.days.find(d=>d.dayIndex===first.dayIndex);
 const bwEx=day.exercises.find(e=>e.supportsAddedWeight===true)||day.exercises[0];
 for(const ex of day.exercises){
  const isBw=ex.id===bwEx.id;
  s=run(s,'workout',{
   date:first.date,dayIndex:first.dayIndex,exerciseId:ex.id,
   ...(isBw?{weightedBodyweight:true,notes:'Belt +dip chain'}:{}),
   sets:Array.from({length:ex.sets},(_,idx)=>isBw?{reps:8,addedKg:idx===0?10:12.5,rir:2-Math.min(idx,1)}:{reps:8,kg:20,rir:2})
  });
 }
 const bwLog=s.workoutLogs.find(l=>l.exerciseId===bwEx.id);
 assert.equal(bwLog.notes,'Belt +dip chain');
 assert.equal(bwLog.sets[0].kg,10);
 assert.equal(bwLog.sets[1].kg,12.5);
 s=run(s,'session',{date:first.date,dayIndex:first.dayIndex,status:'completed',notes:'Strong session'});
 assert.equal(s.sessions.at(-1).status,'completed');
 assert.equal(s.sessions.at(-1).notes,'Strong session');
 const rest=Array.from({length:7},(_,i)=>dateOffset(today(),i)).find(date=>!before.some(x=>x.date===date));
 assert.throws(()=>run(s,'reschedule',{dayIndex:first.dayIndex,toDate:rest}),e=>e.code==='SESSION_ALREADY_COMPLETED');
});

test('female cycle awareness, seasonal ramadan/eid flex, auto-freeze, and weeklyCheckinDue separation work accurately',()=>{
 assert.throws(()=>run(fixture,'cycle_settings',{enabled:true}),e=>e.code==='CYCLE_TRACKING_UNAVAILABLE');
 assert.throws(()=>run(fixture,'cycle_gentle_session',{enabled:true}),e=>e.code==='CYCLE_TRACKING_UNAVAILABLE');
 let f=generate(empty(),{...draft,sex:'female',healthConfirmed:true},'female-fixture');
 f=run(f,'cycle_settings',{enabled:true,averageCycleLengthDays:28,averagePeriodLengthDays:5,lastPeriodStartDate:dateOffset(today(),-30),discreetMode:true,adaptiveThemeEnabled:true});
 const ovCycle=computeCycleState(f);
 assert.equal(ovCycle.isOverdue,true);
 assert.equal(ovCycle.overdueDays,2);
 assert.equal(ovCycle.nextPeriodEstimateDate,null);
 assert.equal(ovCycle.phase,'luteal');
 assert.equal(ovCycle.discreetMode,true);
 assert.equal(ovCycle.phaseAccentToken,'neutral');
 f=run(f,'cycle_gentle_session',{enabled:true});
 assert.equal(f.sessionAdjustment.source,'cycle_gentle_session');
 assert.equal(f.sessionAdjustment.setFactor,0.8);

 f.ramadanMode={enabled:true,iftarTime:'18:05',suhoorCutoffTime:'04:20',workoutTiming:'post_iftar',medicalClearanceAcknowledged:false,endDate:dateOffset(today(),-1)};
 const expiredRamadan=getFastingState(f);
 assert.equal(expiredRamadan.ramadanMode.enabled,false);
 assert.equal(expiredRamadan.ramadanMode.autoRevertedOn,dateOffset(today(),-1));
 assert.equal(expiredRamadan.seasonalContext.eidTransitionAvailable,true);

 f=run(f,'seasonal_flex',{enabled:true,occasion:'eid_fitr',endDate:dateOffset(today(),2)});
 assert.equal(getFastingState(f).seasonalContext.mode,'eid_flex');
 assert.ok(f.flexDates.includes(today()));

 f.onboarding.journeyStartedOn=dateOffset(today(),-10);
 f.lastReview={at:new Date().toISOString(),auto:true};
 f.weights=[{date:dateOffset(today(),-2),kg:65},{date:today(),kg:64.8}];
 const st=computeStreakAndEngagement(f);
 assert.deepEqual(st.streakSummary.autoAppliedFreezes,[dateOffset(today(),-1)]);
 assert.equal(st.streakSummary.currentDays,3);
 assert.equal(st.engagementState.weeklyCheckinDue,true);
});

test('birthDate canonical DOB validation, leap-day & birthday rollover, seniorMode, and legacy age compatibility work cleanly',()=>{
 assert.equal(computeAgeFromBirthDate('1996-05-14','2026-05-13'),29);
 assert.equal(computeAgeFromBirthDate('1996-05-14','2026-05-14'),30);
 assert.equal(computeAgeFromBirthDate('2000-02-29','2026-02-28'),25);
 assert.equal(computeAgeFromBirthDate('2000-02-29','2026-03-01'),26);
 assert.throws(()=>computeAgeFromBirthDate('1998-02-30','2026-05-14'),e=>e.code==='INVALID_BIRTH_DATE');
 assert.throws(()=>computeAgeFromBirthDate('2099-01-01','2026-05-14'),e=>e.code==='INVALID_BIRTH_DATE');
 assert.throws(()=>resolveProfileBirthDateAndAge({birthDate:'2015-05-01'},'2026-05-14'),e=>e.code==='INVALID_BIRTH_DATE'&&e.params?.minAge===18&&e.params?.computedAge===11);
 assert.deepEqual(resolveProfileBirthDateAndAge({age:30},'2026-05-14'),{birthDate:null,age:30});

 const underElig=evaluateEligibility({birthDate:'2015-05-01',sex:'male',height:175,weight:70,goal:'maintain'});
 assert.equal(underElig.status,'requires_review');
 assert.ok(underElig.reasons.some(r=>r.code==='AGE_UNSUPPORTED_OR_MISSING'));

 const adultElig=evaluateEligibility({birthDate:'1996-05-14',sex:'male',height:178,weight:80,goal:'lose'});
 assert.equal(adultElig.status,'eligible');
 assert.equal(adultElig.seniorMode,false);
 assert.ok(adultElig.computedAge>=29);

 const seniorElig=evaluateEligibility({birthDate:'1954-05-14',sex:'male',height:175,weight:76,goal:'lose'});
 assert.equal(seniorElig.seniorMode,true);
 assert.ok(seniorElig.notes.some(n=>n.code==='SENIOR_MODE_ACTIVE'));

 assert.throws(()=>previewPlan({birthDate:'1998-02-30',sex:'male',height:175,weight:75,goal:'maintain'}),e=>e.code==='INVALID_BIRTH_DATE');
 const prev=previewPlan({birthDate:'1996-05-14',sex:'male',height:178,weight:80,goal:'lose',serviceTrack:'nutrition_and_workouts',selectedWorkoutDays:[1,3,5],healthConfirmed:true});
 assert.equal(prev.birthDate,'1996-05-14');
 assert.equal(prev.computedAge,computeAgeFromBirthDate('1996-05-14',today()));
 assert.equal(prev.seniorMode,false);

 const legacyState=generate(empty(),draft,'legacy-no-dob');
 assert.equal('birthDate' in legacyState.profile,false);
 assert.equal(legacyState.profile.age,30);

 const {age:_omitAge,...draftNoAge}=draft;
 const dobState=generate(empty(),{...draftNoAge,birthDate:'1954-05-14'},'dob-senior');
 assert.equal(dobState.profile.birthDate,'1954-05-14');
 assert.equal(dobState.profile.seniorMode,true);
 assert.ok(dobState.profile.age>=70);

 // Birthday rollover: profile stored at age 69 automatically becomes 70 + seniorMode=true on birthday
 const curr=today();
 const turning70Dob=`${Number(curr.slice(0,4))-70}${curr.slice(4)}`;
 const rolled=effectiveProfileWithLiveAge({...dobState.profile,birthDate:turning70Dob,age:69,seniorMode:false},curr);
 assert.equal(rolled.age,70);
 assert.equal(rolled.seniorMode,true);

 dobState.profile={...dobState.profile,birthDate:turning70Dob,age:69,seniorMode:false};
 assert.equal(present(dobState).profile.age,70);
 assert.equal(present(dobState).profile.seniorMode,true);
 assert.equal(presentBootstrap(dobState).profile.age,70);
 assert.equal(presentBootstrap(dobState).profile.seniorMode,true);
 const renewed=run(dobState,'renew_plan',{earlyRenew:true});
 assert.equal(renewed.profile.age,70);
 assert.equal(renewed.profile.seniorMode,true);

 // Age 95->96 rollover clamps safely at 95 so renewals never fail estimateNeeds
 const turning96Dob=`${Number(curr.slice(0,4))-96}${curr.slice(4)}`;
 const rolled96=effectiveProfileWithLiveAge({...dobState.profile,birthDate:turning96Dob,age:95,seniorMode:true},curr);
 assert.equal(rolled96.age,95);
 assert.equal(rolled96.seniorMode,true);

 // Turning 70 immediately flags senior-unsafe movements in present/bootstrap
 const seniorUnsafeState=structuredClone(dobState);
 seniorUnsafeState.profile={...seniorUnsafeState.profile,birthDate:turning70Dob,age:69,seniorMode:false};
 seniorUnsafeState.workoutPlan.days[0].exercises[0]={...seniorUnsafeState.workoutPlan.days[0].exercises[0],name:'Barbell Back Squat'};
 assert.ok(present(seniorUnsafeState).workoutSafetyIssues.length>0);
 assert.ok(presentBootstrap(seniorUnsafeState).workoutSafetyIssues.length>0);
});
