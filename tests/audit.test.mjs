import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate,command,today,retargetPlan} from '../server/coaching.mjs';
import {workoutPlan,scheduledSessions,exerciseAlternatives,muscleRegions,estimatedSessionMinutes} from '../server/workouts.mjs';
import {recovery,hasPerformanceDrop} from '../server/recovery.mjs';
import {dayTotals} from '../server/food.mjs';
import {dateOffset,number} from '../coaching-shared.mjs';
const draft={name:'Audit',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5]};
const fixture=generate(empty(),draft);
const clone=()=>structuredClone(fixture);
const readyCheckin=()=>({date:today(),at:new Date().toISOString(),sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false});
const run=(s,a,p)=>{const result=command(structuredClone(s),a,p);result.revision++;return result;};

test('AUD-01: accepting an unexpired volume proposal with stale recovery fails closed',t=>{
 const s=clone();s.checkins=[readyCheckin()];s.adaptations=[{id:'stale',kind:'weekly_volume',planId:s.workoutPlan.id,dayIndex:1,exerciseId:s.workoutPlan.days[0].exercises[0].id,region:'quadriceps',extraSets:1,status:'pending',baseRevision:s.revision,expiresAt:new Date(Date.now()+7*86400000).toISOString()}];
 const now=Date.now();t.mock.method(Date,'now',()=>now+2*86400000);
 assert.throws(()=>run(s,'adaptation',{id:'stale',accept:true}),/استشفاء|مراجعة/);
});
test('AUD-02: one exercise cannot count as completion of a multi-exercise session',()=>{
 const s=clone(),day=s.workoutPlan.days[0],e=day.exercises[0];
 let n=run(s,'workout',{dayIndex:day.dayIndex,exerciseId:e.id,sets:[{kg:20,reps:10,rir:3}]});
 n=run(n,'session',{dayIndex:day.dayIndex,status:'completed',duration:10,rpe:4});
 assert.notEqual(n.sessions[0].status,'completed');assert.ok(n.sessions[0].completionRatio<.8);
});
test('AUD-03: replacing an exercise preserves accepted dated moves',()=>{
 const s=clone(),first=scheduledSessions(s)[0],rest=Array.from({length:7},(_,i)=>dateOffset(today(),i)).find(d=>!scheduledSessions(s).some(x=>x.date===d));
 s.scheduleOverrides=[{planId:s.workoutPlan.id,dayIndex:first.dayIndex,fromDate:first.date,toDate:rest}];
 const before=scheduledSessions(s),e=s.workoutPlan.days[0].exercises[0],alternative=exerciseAlternatives(s,1,e.id)[0];assert.ok(alternative);
 const n=run(s,'replace_exercise',{dayIndex:1,exerciseId:e.id,alternativeId:alternative.id});
 assert.deepEqual(scheduledSessions(n),before);
});
test('AUD-04: legacy daily intake cannot be silently replaced by a single detailed item',()=>{
 const s=run(clone(),'food',{date:today(),energy:2100,complete:true});
 assert.throws(()=>run(s,'food_entry',{date:today(),source:'manual',slot:'snack',name:'قهوة',energy:50}),/إجمالي|تفصيل/);
 assert.equal(s.foodLogs[0].energy,2100);
});
test('AUD-05: invalid workout day cannot fall back to any matching exercise',()=>{
 const s=clone(),e=s.workoutPlan.days[0].exercises[0];
 assert.throws(()=>run(s,'workout',{dayIndex:99,exerciseId:e.id,sets:[{kg:20,reps:10,rir:3}]}));
});
test('AUD-06: malformed pain flags are not silently recorded as no pain',()=>{
 const s=clone(),e=s.workoutPlan.days[0].exercises[0];
 assert.throws(()=>run(s,'workout',{dayIndex:1,exerciseId:e.id,sets:[{kg:20,reps:10,rir:3,pain:'yes'}]}));
});
test('AUD-07: invalid days/count/location/duration are rejected instead of defaulted',()=>{
 for(const bad of [{workoutDaysCount:0,selectedWorkoutDays:[]},{workoutLocation:'unknown'},{sessionDuration:0},{selectedWorkoutDays:[true,3]},{homeEquipment:'dumbbells',workoutLocation:'home_only'}])assert.throws(()=>workoutPlan({...draft,...bad}));
});
test('AUD-08: arrays and inherited region/ingredient keys are rejected',()=>{
 assert.throws(()=>number('   ',0,10,'x'));
 const s=clone();assert.throws(()=>generate(s,{...draft,excludedGroups:'fava'}));
 assert.throws(()=>run(s,'recovery',{...readyCheckin(),sorenessByRegion:{constructor:1}}));
});
test('AUD-09: one-day upper/lower cannot omit the entire lower body',()=>{
 const plan=workoutPlan({...draft,selectedWorkoutDays:[1],workoutSplitPreference:'upper_lower'});assert.equal(plan.split,'full_body');
});
test('AUD-10: old performance drops do not escalate current recovery indefinitely',()=>{
 const make=(at,reps)=>({exerciseId:'x',planId:'p',loadMode:'external',at,date:at.slice(0,10),sets:[{kg:20,reps}]});
 assert.equal(hasPerformanceDrop([make('2020-01-01T12:00:00Z',12),make('2020-01-03T12:00:00Z',8)]),false);
});
test('AUD-11: late corrections are ordered by exposure date rather than edit time',()=>{
 const s=clone(),e=s.workoutPlan.days[0].exercises[0],now=Date.now();s.checkins=[readyCheckin()];
 const log=(offset,reps,editOffset)=>({id:String(offset),exerciseId:e.id,planId:s.workoutPlan.id,dayIndex:1,loadMode:e.loadMode,date:dateOffset(today(),offset),at:new Date(now+editOffset).toISOString(),increment:1,sets:Array.from({length:e.sets},()=>({kg:20,reps,rir:3,pain:false}))});
 s.workoutLogs=[log(-2,4,2),log(-4,e.repMax,3)];
 const n=run(s,'workout',{exerciseId:e.id,dayIndex:1,increment:1,sets:Array.from({length:e.sets},()=>({kg:20,reps:e.repMax,rir:3}))});
 assert.equal(n.workoutPlan.days[0].exercises[0].suggestedKg,undefined);
});
test('AUD-12: day targets are frozen when future energy targets change',()=>{
 const plan=structuredClone(fixture.plans[0]),old=plan.targets.energy;
 retargetPlan(plan,old-100,fixture.preferences,dateOffset(today(),1));
 assert.equal(plan.days[0].targets.energy,old);assert.equal(plan.days[1].targets.energy,old-100);
});
test('AUD-13: backfilled manual diary cannot obtain a target from a plan created later',()=>{
 const s=clone(),date=dateOffset(today(),-30);const n=run(s,'food_entry',{source:'manual',date,slot:'snack',name:'وجبة',energy:500});
 assert.equal(dayTotals(n,date).planEnergy,null);
});
test('AUD-14: latest observation is selected by timestamp even if reports are unsorted',()=>{
 const s=readyCheckin(),caution={...s,at:new Date(Date.now()-3600000).toISOString(),fatigue:5,sleepHours:4};
 assert.equal(recovery([s,caution]).status,'ready');
});
test('AUD-15: a current report missing the pain answer cannot authorize progression',()=>{
 const c=readyCheckin();delete c.pain;assert.equal(recovery([c]).status,'unknown');assert.equal(recovery([c]).progressionAllowed,false);
 assert.equal(recovery([{at:new Date().toISOString(),redFlags:true}]).status,'stop');
});
test('AUD-16: detailed mode requires explicit conversion and retains the prior daily total',()=>{
 let s=run(clone(),'food',{date:today(),energy:2100,complete:true});s=run(s,'food_switch_to_entries',{date:today(),confirm:true});
 s=run(s,'food_entry',{source:'manual',date:today(),slot:'snack',name:'قهوة',energy:50});assert.equal(s.foodLogs[0].energy,50);assert.equal(s.history.find(h=>h.kind==='food_diary_mode').previous.energy,2100);
});
test('AUD-17: workout-only route cannot bypass an unasked health confirmation',()=>{
 assert.throws(()=>generate(empty(),{...draft,serviceTrack:'workouts_only'}),/صحية/);
 assert.ok(generate(empty(),{...draft,serviceTrack:'workouts_only',healthConfirmed:true}).workoutPlan);
});
test('AUD-18: nutrition-only muscle gain uses confirmed external resistance days',()=>{
 assert.throws(()=>generate(empty(),{...draft,goal:'muscle_gain',serviceTrack:'nutrition_only'}));
 const s=generate(empty(),{...draft,goal:'muscle_gain',serviceTrack:'nutrition_only',externalTrainingDays:[1,3,5]});assert.equal(s.profile.trainingDays,3);assert.equal(s.workoutPlan,null);assert.ok(s.plans[0]);
});
test('AUD-19: a late acceptance cannot cut calories with unknown recovery',()=>{
 const s=clone();s.adaptations=[{id:'c',kind:'calories',delta:-100,status:'pending',baseRevision:s.revision}];assert.throws(()=>run(s,'adaptation',{id:'c',accept:true}),/استشفاء/);
});
test('AUD-20: unchanged exercise exposures survive replacement of another exercise',()=>{
 let s=clone();s.checkins=[readyCheckin()];const day=s.workoutPlan.days[0],first=day.exercises[0],other=day.exercises[2];
 const sets=Array.from({length:other.sets},()=>({kg:20,reps:other.repMax,rir:other.rir,pain:false}));
 s.workoutLogs=[{id:'previous',date:dateOffset(today(),-2),at:new Date(Date.now()-2*86400000).toISOString(),planId:s.workoutPlan.id,dayIndex:day.dayIndex,exerciseId:other.id,loadMode:other.loadMode,sets,increment:1}];
 const alternative=exerciseAlternatives(s,day.dayIndex,first.id)[0];s=run(s,'replace_exercise',{dayIndex:day.dayIndex,exerciseId:first.id,alternativeId:alternative.id});
 const next=run(s,'workout',{dayIndex:day.dayIndex,exerciseId:other.id,sets,increment:1});assert.equal(next.workoutPlan.days[0].exercises.find(e=>e.id===other.id).suggestedKg,21);
});
test('AUD-21: retry after a concurrent original commit returns a state at least as recent as the receipt',async()=>{
 const {default:worker}=await import('../server/worker.mjs');let reads=0;
 const raw=JSON.stringify({revision:0,action:'weight',payload:{kg:79}}),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)),digest=Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,'0')).join('');
 const old=empty(),next={...empty(),revision:1};
 const db={prepare(sql){return {bind(){return this;},async first(){if(sql.includes('coaching_accounts'))return {body:JSON.stringify(reads++?next:old)};if(sql.includes('coaching_requests'))return {digest,response:JSON.stringify({revision:1})};throw Error(sql);}};}};
 const response=await worker.fetch(new Request('https://example.test/v1/commands',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'u','Idempotency-Key':'same'},body:raw}),{DB:db});const result=await response.json();assert.equal(response.status,200);assert.equal(result.revision,1);assert.equal(result.commandReceipt.revision,1);
});
test('AUD-22: meal times never invent a pre/post-workout relationship',()=>{
 for(const day of fixture.plans[0].days)for(const meal of day.meals)assert.equal(meal.workout_tag,undefined);
});
test('AUD-23: bro split without equipment falls back explicitly instead of returning an empty arm day',()=>{
 const plan=workoutPlan({...draft,selectedWorkoutDays:[0,1,2,4,5],workoutDaysCount:5,workoutLocation:'home_only',homeEquipment:['none'],workoutSplitPreference:'bro_split'});assert.equal(plan.split,'full_body');assert.ok(plan.days.every(d=>d.exercises.length));assert.ok(plan.warnings.some(w=>w.includes('فارغ')));
});
test('AUD-24: impossible counts are rejected before allocating a schedule',()=>{
 assert.throws(()=>workoutPlan({...draft,selectedWorkoutDays:[],workoutDaysCount:1e9}));
});
test('AUD-25: legacy workout-only accounts require health confirmation before progression/review',()=>{
 let s=generate(empty(),{...draft,serviceTrack:'workouts_only',healthConfirmed:true});delete s.onboarding.workoutPrefs.healthConfirmed;
 s.checkins=[readyCheckin()];s=run(s,'review',{});assert.equal(s.adaptations.filter(a=>a.status==='pending').length,0);assert.match(s.lastReview.message,/الصحية/);
 s=run(s,'confirm_health',{healthy:true,injuryFree:true});assert.equal(s.onboarding.workoutPrefs.healthConfirmed,true);
});
test('AUD-26: invalid ancestry and malformed flags cannot produce a protein/energy change',()=>{
 const s=clone();assert.throws(()=>run(s,'recovery',{...readyCheckin(),pain:'no'}));assert.throws(()=>generate(empty(),{...draft,height:230,weight:35,serviceTrack:'workouts_only',healthConfirmed:true}));
});
test('AUD-27: unilateral prescriptions require both-side confirmation before increasing weight',async()=>{
 const {progression}=await import('../server/recovery.mjs');const {catalog}=await import('../server/workouts.mjs');
 const source=catalog.exercises.find(e=>e.laterality==='unilateral'&&e.loadMode==='external'),exercise={...source,sets:2,repMax:12,rir:2};
 const log=offset=>({exerciseId:exercise.id,loadMode:exercise.loadMode,date:dateOffset(today(),-offset),sets:[{kg:20,reps:12,rir:2},{kg:20,reps:12,rir:2}],increment:1});
 const logs=[log(2),log(0)];assert.equal(progression(exercise,logs,{progressionAllowed:true}).action,'hold');assert.equal(progression(exercise,logs.map(l=>({...l,bothSides:true})),{progressionAllowed:true}).kg,21);
});
test('AUD-28: setup equipment and source side metadata remain verifiable for every exercise',async()=>{
 const {catalog}=await import('../server/workouts.mjs');const muscleIds=new Set(catalog.muscles.map(m=>m.id)),equipmentIds=new Set(catalog.equipment.map(e=>e.id));
 for(const e of catalog.exercises){assert.ok(['unilateral','bilateral','alternating'].includes(e.laterality));assert.ok(Object.hasOwn(e,'upstreamId'));for(const m of e.muscles)assert.ok(muscleIds.has(m.muscle_id));for(const q of e.equipment)assert.ok(equipmentIds.has(q.equipment_id));}
});
test('AUD-29: equal target weight allowed by onboarding is handled as muscle recomposition, not invalid gain',()=>{
 let s=generate(empty(),{...draft,goal:'muscle_gain',targetWeight:80});assert.equal(s.profile.recomposition,true);assert.ok(Math.abs(s.plans[0].targets.energy-s.plans[0].targets.tdee)<10);
 s.checkins=[readyCheckin()];s.weights=[0,1,2].map(i=>({date:dateOffset(today(),-i),kg:80}));s=run(s,'review',{});assert.ok(!s.adaptations.some(a=>a.kind==='maintenance'));
});
test('AUD-30: calendar moves cannot target a date outside the projected 14-day window',()=>{
 assert.throws(()=>run(clone(),'reschedule',{dayIndex:1,toDate:dateOffset(today(),14)}));
});
test('AUD-31: Saturday-zero onboarding days and hybrid locations convert to the canonical calendar exactly once',async()=>{
 const {onboardingState}=await import('../coaching-shared.mjs');
 const s=generate(empty(),{...draft,weekdayConvention:'saturday_0',selectedWorkoutDays:[0,2,4],workoutLocation:'home_and_gym',dayLocations:{0:'home',2:'gym',4:'home'},homeEquipment:['dumbbells']});
 assert.deepEqual(s.profile.workoutDays,[1,3,6]);assert.equal(s.workoutPlan.days.find(d=>d.dayIndex===6).location,'home');assert.equal(s.workoutPlan.days.find(d=>d.dayIndex===1).location,'gym');
 const view=onboardingState(s);assert.deepEqual(view.onboarding.workoutPrefs.selectedWorkoutDays.sort(),[0,2,4]);assert.equal(view.onboarding.workoutPrefs.dayLocations[0],'home');assert.deepEqual(s.profile.workoutDays,[1,3,6]);
});
test('AUD-32: ambiguous legacy weekdays require explicit confirmation and preserve actual log dates',async()=>{
 const {needsScheduleConfirmation}=await import('../coaching-shared.mjs');let s=clone();delete s.profile.weekdayConvention;delete s.onboarding.workoutPrefs.weekdayConvention;
 const original=s.workoutPlan,day=original.days[0],exercise=day.exercises[0];s=run(s,'workout',{dayIndex:day.dayIndex,exerciseId:exercise.id,sets:[{kg:20,reps:10,rir:3}]});const frozen=JSON.stringify(s.workoutLogs);
 assert.equal(needsScheduleConfirmation(s),true);s=run(s,'confirm_schedule',{dayMap:{1:0,3:2,5:4}});assert.equal(needsScheduleConfirmation(s),false);assert.deepEqual(s.workoutPlan.days.map(d=>d.dayIndex),[0,2,4]);assert.equal(JSON.stringify(s.workoutLogs),frozen);assert.equal(s.workoutPlan.days[0].exercises[0].progressionKey,exercise.progressionKey);
});
test('AUD-33: ambiguous calendar repair retains old moves as history instead of silently remapping dated exceptions',()=>{
 let s=clone();delete s.profile.weekdayConvention;s.scheduleOverrides=[{planId:s.workoutPlan.id,dayIndex:1,fromDate:today(),toDate:dateOffset(today(),1)}];
 s=run(s,'confirm_schedule',{dayMap:{1:0,3:2,5:4}});assert.ok(!s.scheduleOverrides.some(o=>o.planId===s.workoutPlan.id));assert.equal(s.history.at(-1).previousOverrides.length,1);
});
test('AUD-34: short sessions rotate priority so an entire week does not omit pulling and hinging',()=>{
 const plan=workoutPlan({...draft,fitnessLevel:'advanced',sessionDuration:20});const patterns=new Set(plan.days.flatMap(d=>d.exercises.map(e=>e.pattern)));
 for(const pattern of ['squat','hinge','horizontal_push','horizontal_pull'])assert.ok(patterns.has(pattern),pattern);
});
test('AUD-35: alternatives and accepted replacements preserve the session time budget',()=>{
 for(const sessionDuration of [20,30,45])for(const fitnessLevel of ['beginner','intermediate','advanced']){
  const s=clone(),prefs={...draft,sessionDuration,fitnessLevel};s.workoutPlan=workoutPlan(prefs);s.onboarding.workoutPrefs=prefs;
  for(const day of s.workoutPlan.days)for(const exercise of day.exercises)for(const alternative of exerciseAlternatives(s,day.dayIndex,exercise.id)){
   const next=run(s,'replace_exercise',{dayIndex:day.dayIndex,exerciseId:exercise.id,alternativeId:alternative.id}),changed=next.workoutPlan.days.find(d=>d.dayIndex===day.dayIndex);
   assert.ok(estimatedSessionMinutes(changed)<=sessionDuration,alternative.name);assert.equal(changed.estimatedMinutes,estimatedSessionMinutes(changed));
  }
 }
});
test('AUD-36: omitted or malformed alternative day cannot implicitly select Sunday',()=>{
 const s=clone();s.workoutPlan=workoutPlan({...draft,selectedWorkoutDays:[0,2,4]});const exercise=s.workoutPlan.days[0].exercises[0];
 for(const invalid of [null,undefined,'',false,[],99])assert.throws(()=>exerciseAlternatives(s,invalid,exercise.id));
 assert.ok(Array.isArray(exerciseAlternatives(s,'0',exercise.id)));
});
test('AUD-37: legacy estimates are recomputed after source side metadata is restored',async()=>{
 const {catalog}=await import('../server/workouts.mjs');const {ensureTrainingState}=await import('../server/training-state.mjs');
 const s=clone();s.workoutPlan=workoutPlan({...draft,fitnessLevel:'intermediate',sessionDuration:20});const day=s.workoutPlan.days[0],source=catalog.exercises.find(e=>e.name==='Dumbbell Side Squat');assert.ok(source);
 day.exercises[0]={...source,sets:3,repMin:8,repMax:12,rir:2,restSeconds:120};delete day.exercises[0].laterality;day.estimatedMinutes=estimatedSessionMinutes(day);
 const before=day.estimatedMinutes;ensureTrainingState(s);assert.ok(day.estimatedMinutes>before);assert.equal(day.estimatedMinutes,estimatedSessionMinutes(day));assert.ok(s.workoutPlan.warnings.some(w=>w.includes('خطتك القديمة')));
});
