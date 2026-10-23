import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {workoutPlan,equipmentAllowed,weeklySetTotals,estimatedSessionMinutes} from '../server/workouts.mjs';
import {empty,generate} from '../server/coaching.mjs';
import {assertDietDay} from '../diet-patterns.mjs';
const base={name:'Matrix',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5]};
const results={at:new Date().toISOString(),workouts:{cases:0,partialCases:0,errors:[]},nutrition:{cases:0,generated:0,blocked:[],errors:[],quality:[]}};
const places=[{workoutLocation:'gym_only'},{workoutLocation:'home_only',homeEquipment:['none']},{workoutLocation:'home_only',homeEquipment:['dumbbells']},{workoutLocation:'home_only',homeEquipment:['dumbbells','bench','resistance_bands']},{workoutLocation:'home_and_gym',homeEquipment:['dumbbells'],dayLocations:{0:'gym',1:'home',2:'gym',3:'home',4:'gym',5:'home',6:'gym'}}];
for(const fitnessLevel of ['beginner','intermediate','advanced'])for(const sessionDuration of [20,30,45,60,90])for(const workoutSplitPreference of ['auto','full_body','upper_lower','ppl','bro_split'])for(let count=1;count<=6;count++)for(const place of places){
 const prefs={...base,...place,selectedWorkoutDays:Array.from({length:count},(_,i)=>Math.floor(i*7/count)),workoutDaysCount:count,fitnessLevel,sessionDuration,workoutSplitPreference};results.workouts.cases++;
 try{
  const p=workoutPlan(prefs);assert.equal(p.days.length,count);assert.deepEqual(p.weeklySets,weeklySetTotals(p.days));
  if(p.days.some(d=>d.missing.length))results.workouts.partialCases++;
  for(const d of p.days){assert.ok(d.exercises.length>0);assert.ok(d.estimatedMinutes<=sessionDuration);assert.equal(d.estimatedMinutes,estimatedSessionMinutes(d));assert.equal(new Set(d.exercises.map(e=>e.id)).size,d.exercises.length);
   for(const e of d.exercises){assert.ok(equipmentAllowed(e,prefs,d.location));assert.ok(e.muscles.some(m=>m.role==='primary'));if(fitnessLevel==='beginner')assert.equal(e.difficulty,'beginner');}
  }
 }catch(e){results.workouts.errors.push({prefs,error:e.message});}
}
const nutritionCases=[];
for(const dietType of ['balanced','high_protein','low_carb','keto','mediterranean','dash','vegetarian','vegan','intermittent_fasting'])for(const sex of ['male','female'])for(const goal of ['lose','maintain','gain','muscle_gain'])nutritionCases.push({...base,dietType,sex,goal});
for(const activity of ['sedentary','moderate','active'])for(const sex of ['male','female'])for(const goal of ['lose','maintain','gain','muscle_gain'])nutritionCases.push({...base,dailyActivity:activity,sex,goal});
for(const region of ['egypt','levant','gulf','maghreb','any'])for(const budget of ['low','medium','high'])nutritionCases.push({...base,region,budget});
results.nutrition.configurations=nutritionCases.length;results.nutrition.seeds=3;
for(const [configuration,prefs]of nutritionCases.entries())for(let seed=0;seed<3;seed++){
 results.nutrition.cases++;const s=empty();
 try{generate(s,prefs,'audit-v1-'+configuration+'-'+seed);const p=s.plans[0];assert.equal(p.days.length,7);assert.deepEqual(p.preferences.excludedGroups,[]);for(const d of p.days){assertDietDay(d.meals.map(m=>m.snapshot),p.preferences.diet,p.targets);assert.ok(Number.isFinite(Number(d.summary.values.energy)));if(Math.abs(Number(d.summary.values.energy)-p.targets.energy)>p.targets.energy*.15||Number(d.summary.values.protein)<p.targets.protein*.8)results.nutrition.quality.push({diet:prefs.dietType,sex:prefs.sex,goal:prefs.goal,region:prefs.region||'egypt',budget:prefs.budget||'medium',date:d.date,target:p.targets.energy,energy:d.summary.values.energy,protein:d.summary.values.protein,proteinTarget:p.targets.protein});}results.nutrition.generated++;
 }catch(e){if(e instanceof assert.AssertionError||e instanceof TypeError||e instanceof ReferenceError||s.profile||!/المكتبة|لا يوجد اختيار|لا تحقق|لا تكفي|مفيش وجبات|لا توجد وجبات|لم نغيّر|لم نحفظ|حد الكربوهيدرات|الصوديوم/.test(e.message))results.nutrition.errors.push({prefs,error:e.message});else results.nutrition.blocked.push({configuration,seed,diet:prefs.dietType,sex:prefs.sex,goal:prefs.goal,region:prefs.region||'egypt',budget:prefs.budget||'medium',reason:e.message});}
}
await mkdir('outputs',{recursive:true});await writeFile('outputs/audit-matrix.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({workouts:results.workouts,nutrition:{cases:results.nutrition.cases,generated:results.nutrition.generated,blocked:results.nutrition.blocked.length,errors:results.nutrition.errors,quality:results.nutrition.quality}},null,2));
if(results.workouts.errors.length||results.nutrition.errors.length||results.nutrition.quality.length)process.exitCode=1;
