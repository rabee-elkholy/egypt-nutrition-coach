import {clockNow,isoNow,clockDate} from './clock.mjs';
import {localDate,dateOffset,integer,stringList,plainRecord} from '../coaching-shared.mjs';
import catalog from '../data/exercises.json' with {type:'json'};
export {catalog};
const equipmentMap={dumbbells:['dumbbell'],resistance_bands:['resistance_band'],bench:['flat_bench'],yoga_mat:['mat'],pullup_bar:['pullup_bar'],barbell:['barbell'],kettlebell:['kettlebell'],jump_rope:['jump_rope'],cardio_machine:['cardio_machine']};
const byMuscle=new Map(catalog.muscles.map(m=>[m.id,m]));
const regionAliases={quads:'quadriceps',adductors:'hips'};
export function regionForMuscle(id){const group=byMuscle.get(id)?.group_id||id;return regionAliases[group]||group;}
export function primaryRegions(exercise){return [...new Set(exercise.muscles.filter(m=>m.role==='primary').map(m=>regionForMuscle(m.muscle_id)))];}
export function muscleRegions(exercise){return [...new Set(exercise.muscles.map(m=>regionForMuscle(m.muscle_id)))];}
const schemes={full_body:['squat','horizontal_push','horizontal_pull','hinge','anti_extension','vertical_pull'],upper:['horizontal_push','horizontal_pull','vertical_push','vertical_pull','elbow_flexion','elbow_extension'],lower:['squat','hinge','lunge','knee_flexion','plantar_flexion','anti_extension'],push:['horizontal_push','vertical_push','shoulder_abduction','elbow_extension'],pull:['horizontal_pull','vertical_pull','elbow_flexion','scapular_elevation'],legs:['squat','hinge','lunge','knee_flexion','plantar_flexion'],chest:['horizontal_push','horizontal_push','elbow_extension'],back:['horizontal_pull','vertical_pull','scapular_elevation'],shoulders:['vertical_push','shoulder_abduction','horizontal_pull'],arms:['elbow_flexion','elbow_extension','elbow_flexion'],core:['squat','hinge','anti_extension']};
// Conservative exclusion policy, not a clinical clearance or rehabilitation prescription.
export const INJURY_POLICY_VERSION=1;
const INJURY_PATTERNS={
 knee_pain:['squat','lunge','knee_extension'], lower_back_pain:['hinge'],
 shoulder_pain:['vertical_push','shoulder_abduction'], wrist_pain:['elbow_flexion'],
 ankle_pain:['plantar_flexion','lunge'], neck_pain:['scapular_elevation'],
 hip_pain:['squat','lunge','hinge'], diastasis_recti:['spinal_flexion','hip_flexion']
};
const INJURY_NAMES={
 knee_pain:/jump|plyo|pistol|sissy|lunge|split squat/i,
 lower_back_pain:/good morning|deadlift|back squat|sit.?up/i,
 shoulder_pain:/upright row|behind.*neck|dip|overhead/i,
 wrist_pain:/barbell curl|close.grip bench|handstand|push.?up/i,
 ankle_pain:/jump|hop|sprint|plyo|calf raise/i,
 neck_pain:/neck|shrug/i, hip_pain:/sumo|wide.stance|split squat|lunge/i,
 diastasis_recti:/crunch|sit.?up|v.?up|leg raise/i
};
export function isFriendlyForInjuries(e,injuries=[]){
 return injuries.filter(x=>x!=='none').every(injury=>Object.hasOwn(INJURY_PATTERNS,injury)&&
 !INJURY_PATTERNS[injury].includes(e.pattern)&&!INJURY_NAMES[injury].test(e.name));
}
export function workoutSafetyIssues(s){
 const injuries=s.onboarding?.workoutPrefs?.injuries||[];
 return (s.workoutPlan?.days||[]).flatMap(d=>d.exercises.filter(e=>!isFriendlyForInjuries(e,injuries)).map(e=>({dayIndex:d.dayIndex,exerciseId:e.id,name:e.name})));
}
export function equipmentAllowed(exercise,prefs,location){
 if(!exercise.equipment.length||exercise.equipment.some(e=>e.equipment_id==='other'))return false;
 if(location==='gym')return true;
 const allowed=new Set(['bodyweight',...(prefs.homeEquipment||[]).flatMap(x=>equipmentMap[x]||[])]);
 return exercise.equipment.length>0&&exercise.equipment.every(q=>allowed.has(q.equipment_id));
}
function score(e,location){return (/\b(squat|push-up|push up|bench press|row|lat pulldown|deadlift|curl|calf raise)\b/i.test(e.name)?-20:0)+(e.loadMode==='assisted'?10:0)+e.equipment.length+(location==='gym'&&e.loadMode==='external'?-5:0);}
function candidates(pattern,prefs,location,exclude=[]){
 const base=catalog.exercises.filter(e=>e.modality==='strength'&&e.pattern===pattern&&['weight_reps','bodyweight_reps'].includes(e.tracking)&&(prefs.fitnessLevel==='advanced'||e.difficulty!=='advanced')&&(prefs.fitnessLevel!=='beginner'||e.difficulty==='beginner')&&!exclude.includes(e.id)&&equipmentAllowed(e,prefs,location)).sort((a,b)=>score(a,location)-score(b,location)||a.id.localeCompare(b.id));
 const injuries=Array.isArray(prefs.injuries)?prefs.injuries.filter(x=>x&&x!=='none'):[];
 if(!injuries.length)return base;
 const friendly=base.filter(e=>isFriendlyForInjuries(e,injuries));
 return friendly;
}
export const eachSide=e=>['unilateral','alternating'].includes(e.laterality);
export const repetitionSeconds=e=>e.repMax*3*(eachSide(e)?2:1);
export function estimatedSessionMinutes(day){return Math.ceil((300+day.exercises.reduce((sum,e)=>sum+e.sets*repetitionSeconds(e)+(e.sets-1)*e.restSeconds+60,0))/60);}
export function weeklySetTotals(days){const totals={};for(const d of days)for(const e of d.exercises)for(const r of new Set(e.muscles.filter(m=>m.role==='primary').map(m=>regionForMuscle(m.muscle_id))))totals[r]=(totals[r]||0)+e.sets;return totals;}
export function workoutPlan(draft){
 const count=integer(draft.workoutDaysCount??3,1,6,'عدد أيام التدريب');
 if(draft.selectedWorkoutDays!=null&&(!Array.isArray(draft.selectedWorkoutDays)||draft.selectedWorkoutDays.length>6))throw Error('أيام التدريب غير صالحة.');
 const selected=draft.selectedWorkoutDays?.length?draft.selectedWorkoutDays:Array.from({length:count},(_,i)=>Math.floor(i*7/count));
 const days=[...new Set(selected.map(d=>integer(d,0,6,'يوم التدريب')))].sort();
 const level=draft.fitnessLevel??'beginner',duration=integer(draft.sessionDuration??45,20,90,'مدة التمرين');
 if(!['beginner','intermediate','advanced'].includes(level)||![20,30,45,60,90].includes(duration))throw Error('مستوى التمرين أو مدته غير صالح.');
 const workoutLocation=draft.workoutLocation??'gym_only';
 if(!['gym_only','home_only','home_and_gym'].includes(workoutLocation))throw Error('مكان التمرين غير صالح.');
 const homeEquipment=draft.homeEquipment==null?['none']:stringList(draft.homeEquipment,'المعدات',20);
 if(homeEquipment.some(e=>e!=='none'&&!Object.hasOwn(equipmentMap,e)))throw Error('معدات غير معروفة.');
 const dayLocations=draft.dayLocations==null?{}:plainRecord(draft.dayLocations,'أماكن الأيام');
 if(Object.entries(dayLocations).some(([key,value])=>!/^\d$/.test(key)||Number(key)>6||!['home','gym','home_only','gym_only'].includes(value)))throw Error('مكان أحد الأيام غير صالح.');
 const injuries=Array.isArray(draft.injuries)?draft.injuries.filter(x=>x&&x!=='none'):[];
 const goal=draft.goal||'maintain';
 draft={...draft,workoutLocation,homeEquipment,dayLocations,fitnessLevel:level,injuries,goal};
 let split=draft.workoutSplitPreference==='auto'||!draft.workoutSplitPreference?(days.length<=3?'full_body':'upper_lower'):draft.workoutSplitPreference;
 if(!['full_body','upper_lower','ppl','bro_split'].includes(split))throw Error('تقسيمة التمرين غير صالحة.');
 const warnings=[];
 if(injuries.length)warnings.push('استبعدنا حركات احترازيًا حسب الإصابة؛ الاختيارات المتبقية ليست تصريحًا طبيًا. أوقف الحركة المؤلمة وراجع مختصًا.');
 if(split==='upper_lower'&&days.length<2){warnings.push('تقسيمة علوي/سفلي تحتاج يومين؛ استخدمنا الجسم كله لتغطية العضلات.');split='full_body';}
 if(split==='bro_split'&&days.length<5){warnings.push('تقسيمة العضلة الواحدة تحتاج 5 أيام؛ استخدمنا الجسم كله لتغطية العضلات في الأيام المتاحة.');split='full_body';}
 if(split==='ppl'&&days.length<3){warnings.push('الدفع والسحب والأرجل يحتاجوا 3 أيام على الأقل؛ استخدمنا الجسم كله.');split='full_body';}
 const goalNote=goal==='lose'?'خطة مقاومة لحماية العضلات وتنشيط الحرق (مع 15 دقيقة مشي سريع بعد الجلسة عند الإمكان)':goal==='muscle_gain'||goal==='gain'?'خطة بناء عضلي بالتركيز على المدى الحركي الكامل والتدرج في الأوزان':'خطة متوازنة للحفاظ على القوة واللياقة وصحة المفاصل';
 const sessions=days.map((dayIndex,i)=>{
  const rawLocation=draft.workoutLocation==='home_only'?'home':draft.workoutLocation==='home_and_gym'?(draft.dayLocations?.[dayIndex]||'home'):'gym';
  const location=['gym','gym_only'].includes(rawLocation)?'gym':'home';
  const focus=split==='upper_lower'?(i%2?'lower':'upper'):split==='ppl'?['push','pull','legs'][i%3]:split==='bro_split'?['chest','back','legs','shoulders','arms','core'][i%6]:'full_body';
  const used=[],missing=[];let seconds=300;
  const exercises=[];
  const patternOrder=focus==='full_body'&&duration<=30&&i%2?['hinge','horizontal_pull','horizontal_push','squat','anti_extension','vertical_pull']:schemes[focus];
  for(const pattern of patternOrder){
   const pool=candidates(pattern,{...draft,fitnessLevel:level},location,used);const e=pool[0];if(!e){missing.push(pattern);continue;}
   const sets=level==='beginner'?2:3;const compound=['squat','hinge','horizontal_push','horizontal_pull','vertical_push','vertical_pull','lunge'].includes(pattern);
   const restSeconds=compound?(goal==='lose'&&duration>=45?90:120):(goal==='lose'&&duration>=45?60:75);
   const repMin=compound?8:10,repMax=compound?(goal==='lose'&&level==='beginner'?12:12):(goal==='lose'?15:15);
   const cost=sets*repMax*3*(eachSide(e)?2:1)+(sets-1)*restSeconds+60;
   if(seconds+cost>duration*60){missing.push(pattern);continue;}
   seconds+=cost;used.push(e.id);exercises.push({...e,regions:muscleRegions(e),sets,repMin,repMax,rir:level==='beginner'?3:2,restSeconds});
  }
  return {dayIndex,location,focus,goalNote,exercises,missing,duration,estimatedMinutes:Math.ceil(seconds/60),isTrainingDay:true};
 });
 if(sessions.some(s=>!s.exercises.length)){
  if(split!=='full_body'){
   const fallback=workoutPlan({...draft,workoutSplitPreference:'full_body'});
   fallback.warnings.unshift('التقسيمة المطلوبة تحتاج معدات غير متاحة؛ استخدمنا الجسم كله بنفس المعدات والوقت بدل يوم تدريب فارغ.');return fallback;
  }
  throw Error('المعدات والوقت الحاليان لا يسمحان بجلسة مناسبة؛ راجع اختياراتك قبل إنشاء الخطة.');
 }
 if(sessions.some(s=>s.missing.length))warnings.push('بعض الحركات لا تناسب الوقت أو المعدات المتاحة؛ النقص موضح في كل يوم.');
 if(sessions.some(s=>s.exercises.length===0))warnings.push('في يوم لا يحتوي على تمرين مناسب؛ راجع المعدات أو مستوى التمرين قبل البدء.');
 if(split==='full_body'&&days.some((d,i)=>days.length>1&&(days[(i+1)%days.length]-d+7)%7===1))warnings.push('في أيام تمرين متتالية؛ راقب الاستشفاء ويفضل يوم راحة بين جلسات الجسم كله.');
 const weeklySets=weeklySetTotals(sessions);
 return {injuryPolicyVersion:INJURY_POLICY_VERSION,id:crypto.randomUUID(),version:1,split,goalNote,days:sessions,warnings,weeklySets,sourceVersion:catalog.manifest.version};
}
export function exerciseAlternatives(s,dayIndex,exerciseId){
 const index=integer(dayIndex,0,6,'يوم التمرين');
 const day=s.workoutPlan?.days.find(d=>d.dayIndex===index),exercise=day?.exercises.find(e=>e.id===exerciseId);
 if(!exercise)throw Error('التمرين غير موجود في اليوم ده.');
 const primary=primaryRegions(exercise);
 return candidates(exercise.pattern,s.onboarding?.workoutPrefs||{},day.location,day.exercises.map(e=>e.id)).filter(e=>primaryRegions(e).some(r=>primary.includes(r))).filter(e=>{
  const next={...day,exercises:day.exercises.map(x=>x===exercise?{...e,sets:exercise.sets,repMax:exercise.repMax,restSeconds:exercise.restSeconds}:x)};
  return estimatedSessionMinutes(next)<=(day.duration??s.onboarding?.workoutPrefs?.sessionDuration??45);
 }).slice(0,6);
}

export function scheduledSessions(s,from=clockDate(),count=14){
 const plan=s.workoutPlan;if(!plan)return [];
 const overrides=(s.scheduleOverrides||[]).filter(o=>o.planId===plan.id);
 const sessions=[];
 for(let i=0;i<count;i++){
  const date=dateOffset(from,i),dayIndex=new Date(date+'T12:00:00Z').getUTCDay();
  for(const day of plan.days){
   if(day.dayIndex===dayIndex&&!overrides.some(o=>o.dayIndex===day.dayIndex&&o.fromDate===date))sessions.push({date,dayIndex:day.dayIndex,focus:day.focus,location:day.location,moved:false});
   if(overrides.some(o=>o.dayIndex===day.dayIndex&&o.toDate===date))sessions.push({date,dayIndex:day.dayIndex,focus:day.focus,location:day.location,moved:true});
  }
 }
 return sessions.sort((a,b)=>a.date.localeCompare(b.date));
}
