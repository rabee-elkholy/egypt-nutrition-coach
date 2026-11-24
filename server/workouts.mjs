import {clockNow,isoNow,clockDate} from './clock.mjs';
import {localDate,dateOffset,integer,stringList,plainRecord,canonicalInjuries,isPregnantStatus} from '../coaching-shared.mjs';
import {apiError} from '../coaching-error.mjs';
import catalog from '../data/exercises.json' with {type:'json'};
export {catalog};
const equipmentMap={
 dumbbells:['dumbbell'],
 resistance_bands:['resistance_band'],
 bands:['resistance_band'],
 bench:['flat_bench'],
 chair:['flat_bench'],
 yoga_mat:['mat'],
 pullup_bar:['pullup_bar'],
 barbell:['barbell'],
 kettlebell:['kettlebell'],
 jump_rope:['jump_rope'],
 cardio_machine:['cardio_machine']
};
const byMuscle=new Map(catalog.muscles.map(m=>[m.id,m]));
const regionAliases={quads:'quadriceps',adductors:'hips'};
export function regionForMuscle(id){const group=byMuscle.get(id)?.group_id||id;return regionAliases[group]||group;}
export function primaryRegions(exercise){return [...new Set(exercise.muscles.filter(m=>m.role==='primary').map(m=>regionForMuscle(m.muscle_id)))];}
export function muscleRegions(exercise){return [...new Set(exercise.muscles.map(m=>regionForMuscle(m.muscle_id)))];}
const schemes={full_body:['squat','horizontal_push','horizontal_pull','hinge','anti_extension','vertical_pull'],upper:['horizontal_push','horizontal_pull','vertical_push','vertical_pull','elbow_flexion','elbow_extension'],lower:['squat','hinge','lunge','knee_flexion','plantar_flexion','anti_extension'],push:['horizontal_push','vertical_push','shoulder_abduction','elbow_extension'],pull:['horizontal_pull','vertical_pull','elbow_flexion','scapular_elevation'],legs:['squat','hinge','lunge','knee_flexion','plantar_flexion'],chest:['horizontal_push','horizontal_push','elbow_extension'],back:['horizontal_pull','vertical_pull','scapular_elevation'],shoulders:['vertical_push','shoulder_abduction','horizontal_pull'],arms:['elbow_flexion','elbow_extension','elbow_flexion'],core:['squat','hinge','anti_extension'],chest_tri:['horizontal_push','horizontal_push','vertical_push','elbow_extension'],back_bi:['horizontal_pull','vertical_pull','scapular_elevation','elbow_flexion'],shoulders_core:['vertical_push','shoulder_abduction','horizontal_pull','anti_extension']};
// Conservative exclusion policy, not a clinical clearance or rehabilitation prescription.
export const INJURY_POLICY_VERSION=2;
const INJURY_PATTERNS={
 knee_pain:['squat','lunge','knee_extension'], lower_back_pain:['hinge'],
 shoulder_pain:['vertical_push','shoulder_abduction'], wrist_pain:['elbow_flexion'],
 ankle_pain:['plantar_flexion','lunge'], neck_pain:['scapular_elevation'],
 hip_pain:['squat','lunge','hinge'], elbow_pain:[], diastasis_recti:['spinal_flexion','hip_flexion']
};
const INJURY_NAMES={
 knee_pain:/jump|plyo|pistol|sissy|lunge|split squat/i,
 lower_back_pain:/good morning|deadlift|back squat|sit.?up/i,
 shoulder_pain:/upright row|behind.*neck|dip|overhead/i,
 wrist_pain:/barbell curl|close.grip bench|handstand|push.?up/i,
 ankle_pain:/jump|hop|sprint|plyo|calf raise/i,
 neck_pain:/neck|shrug/i, hip_pain:/sumo|wide.stance|split squat|lunge/i,
 elbow_pain:/skull.?crusher|french press|preacher curl|close.grip|dip|behind.*head/i,
 diastasis_recti:/crunch|sit.?up|v.?up|leg raise/i
};
const SENIOR_UNSAFE_RE=/jump|plyo|box jump|barbell back squat|conventional deadlift|snatch|clean|jerk|behind.*neck/i;
const PREGNANCY_ALL_TRIMESTERS_UNSAFE_RE=/crunch|sit.?up|v.?up|leg raise|jump|plyo|box jump|deadlift/i;
const PREGNANCY_POST_T1_SUPINE_RE=/supine|flat bench|barbell bench/i;

export function isFriendlyForInjuries(e,injuries=[],profile={}){
 const injuryOk=canonicalInjuries(injuries).every(injury=>Object.hasOwn(INJURY_PATTERNS,injury)&&
  !INJURY_PATTERNS[injury].includes(e.pattern)&&!INJURY_NAMES[injury].test(e.name));
 if(!injuryOk)return false;
 if(profile?.seniorMode&&SENIOR_UNSAFE_RE.test(e.name))return false;
 if(isPregnantStatus(profile?.maternalStatus)){
  if(PREGNANCY_ALL_TRIMESTERS_UNSAFE_RE.test(e.name))return false;
  if(profile.maternalStatus!=='pregnant_t1'&&PREGNANCY_POST_T1_SUPINE_RE.test(e.name))return false;
 }
 return true;
}
export function workoutSafetyIssues(s){
 const injuries=s.onboarding?.workoutPrefs?.injuries||[];
 return (s.workoutPlan?.days||[]).flatMap(d=>d.exercises.filter(e=>!isFriendlyForInjuries(e,injuries,s.profile)).map(e=>({dayIndex:d.dayIndex,exerciseId:e.id,name:e.name})));
}
export function equipmentAllowed(exercise,prefs,location){
 if(!exercise.equipment.length||exercise.equipment.some(e=>e.equipment_id==='other'))return false;
 if(location==='gym')return true;
 const allowed=new Set(['bodyweight',...(prefs.homeEquipment||[]).flatMap(x=>equipmentMap[x]||[])]);
 return exercise.equipment.length>0&&exercise.equipment.every(q=>allowed.has(q.equipment_id));
}
function score(e,location){return (/\b(squat|push-up|push up|bench press|row|lat pulldown|deadlift|curl|calf raise)\b/i.test(e.name)?-20:0)+(e.loadMode==='assisted'?10:0)+e.equipment.length+(location==='gym'&&e.loadMode==='external'?-5:0);}
// Immutable catalog index; user equipment, level and injury filters stay request-local.
const patternIndex=new Map();
for(const exercise of catalog.exercises){
 if(!patternIndex.has(exercise.pattern))patternIndex.set(exercise.pattern,[]);
 patternIndex.get(exercise.pattern).push(exercise);
}
function candidates(pattern,prefs,location,exclude=[],profile={}){
 const excluded=new Set(exclude);
 const base=(patternIndex.get(pattern)||[]).filter(e=>e.modality==='strength'&&e.pattern===pattern&&['weight_reps','bodyweight_reps'].includes(e.tracking)&&(prefs.fitnessLevel==='advanced'||e.difficulty!=='advanced')&&(prefs.fitnessLevel!=='beginner'||e.difficulty==='beginner')&&!excluded.has(e.id)&&equipmentAllowed(e,prefs,location)).sort((a,b)=>score(a,location)-score(b,location)||a.id.localeCompare(b.id));
 const injuries=Array.isArray(prefs.injuries)?canonicalInjuries(prefs.injuries):[];
 return base.filter(e=>isFriendlyForInjuries(e,injuries,profile));
}
export const eachSide=e=>['unilateral','alternating'].includes(e.laterality);
export const repetitionSeconds=e=>e.repMax*3*(eachSide(e)?2:1);
export function estimatedSessionMinutes(day){return Math.ceil((300+day.exercises.reduce((sum,e)=>sum+e.sets*repetitionSeconds(e)+(e.sets-1)*e.restSeconds+60,0))/60);}
export function weeklySetTotals(days){const totals={};for(const d of days)for(const e of d.exercises)for(const r of new Set(e.muscles.filter(m=>m.role==='primary').map(m=>regionForMuscle(m.muscle_id))))totals[r]=(totals[r]||0)+e.sets;return totals;}
export function workoutPlan(draft){
 const count=integer(draft.workoutDaysCount??3,1,7,'workoutDaysCount');
 if(draft.selectedWorkoutDays!=null&&(!Array.isArray(draft.selectedWorkoutDays)||draft.selectedWorkoutDays.length>7))throw apiError('INVALID_WORKOUT_DAYS','Selected training days list is invalid (max 7 days).',{status:400});
 const selected=draft.selectedWorkoutDays?.length?draft.selectedWorkoutDays:Array.from({length:count},(_,i)=>Math.floor(i*7/count));
 const days=[...new Set(selected.map(d=>integer(d,0,6,'dayIndex')))].sort();
 const level=draft.fitnessLevel??'beginner',duration=integer(draft.sessionDuration??45,20,90,'sessionDuration');
 if(!['beginner','intermediate','advanced'].includes(level)||![20,30,45,60,90].includes(duration))throw apiError('INVALID_WORKOUT_SETTINGS','fitnessLevel must be beginner/intermediate/advanced and sessionDuration must be 20, 30, 45, 60, or 90.',{status:400});
 const workoutLocation=draft.workoutLocation??'gym_only';
 if(!['gym_only','home_only','home_and_gym'].includes(workoutLocation))throw apiError('INVALID_WORKOUT_LOCATION','workoutLocation must be gym_only, home_only, or home_and_gym.',{status:400});
 const rawEquipment=draft.homeEquipment==null?['none']:stringList(draft.homeEquipment,'homeEquipment',20);
 const homeEquipment=rawEquipment.map(e=>e==='bands'?'resistance_bands':e==='chair'?'bench':e);
 if(homeEquipment.some(e=>e!=='none'&&!Object.hasOwn(equipmentMap,e)))throw apiError('UNKNOWN_EQUIPMENT','homeEquipment contains one or more unknown equipment IDs.',{status:400});
 const dayLocations=draft.dayLocations==null?{}:plainRecord(draft.dayLocations,'dayLocations');
 if(Object.entries(dayLocations).some(([key,value])=>!/^\d$/.test(key)||Number(key)>6||!['home','gym','home_only','gym_only'].includes(value)))throw apiError('INVALID_DAY_LOCATIONS','dayLocations keys must be weekday indices 0..6 with valid location values.',{status:400});
 const injuries=Array.isArray(draft.injuries)?canonicalInjuries(draft.injuries):[];
 const goal=draft.goal||'maintain';
 const safetyProfile={seniorMode:Boolean(draft.seniorMode||(Number(draft.age)>=70)),maternalStatus:draft.maternalStatus||'none'};
 draft={...draft,workoutLocation,homeEquipment,dayLocations,fitnessLevel:level,injuries,goal};
 let split=draft.workoutSplitPreference==='auto'||!draft.workoutSplitPreference?(days.length<=3?'full_body':days.length>=5?'ppl':'upper_lower'):draft.workoutSplitPreference;
 if(!['full_body','upper_lower','ppl','bro_split'].includes(split))throw apiError('INVALID_WORKOUT_SPLIT','workoutSplitPreference must be auto, full_body, upper_lower, ppl, or bro_split.',{status:400});
 const warnings=[];
 const warningCodes=[];
 const addWarning=(code,msg)=>{warnings.push(msg);if(code&&!warningCodes.includes(code))warningCodes.push(code);};
 if(injuries.length)addWarning('WORKOUT_INJURY_EXCLUSIONS_ACTIVE','Movements contraindicated for declared injuries were excluded precautionarily; remaining selections are not medical clearance. Stop any painful movement.');
 if(safetyProfile.seniorMode)addWarning('WORKOUT_SENIOR_SAFETY_ACTIVE','Senior safety mode (70+): high-impact plyometrics and heavy spinal loading were excluded.');
 if(isPregnantStatus(safetyProfile.maternalStatus))addWarning('WORKOUT_PREGNANCY_SAFETY_ACTIVE','Pregnancy safety filters active: high-impact, crunches, and post-first-trimester supine movements were excluded.');
 if(days.length===7)addWarning('WORKOUT_SEVEN_DAY_RECOVERY_CAUTION','7-day schedule detected: monitor daily recovery closely and keep intensity moderate on back-to-back sessions.');
 if(split==='upper_lower'&&days.length<2){addWarning('WORKOUT_SPLIT_FALLBACK_FULL_BODY','Upper/Lower split requires at least 2 days; switched to Full Body for balanced muscle coverage.');split='full_body';}
 if(split==='bro_split'&&days.length<4){addWarning('WORKOUT_SPLIT_FALLBACK_FULL_BODY','Bro Split requires at least 4 days; switched to Full Body for balanced muscle coverage.');split='full_body';}
 if(split==='ppl'&&days.length<3){addWarning('WORKOUT_SPLIT_FALLBACK_FULL_BODY','Push/Pull/Legs split requires at least 3 days; switched to Full Body for balanced muscle coverage.');split='full_body';}
 const goalNote=goal==='lose'?'Resistance plan designed to preserve lean muscle mass during fat loss (pair with light walking when feasible).':goal==='muscle_gain'||goal==='gain'?'Hypertrophy-focused resistance plan emphasizing full range of motion and progressive overload.':'Balanced strength and mobility plan for fitness maintenance and joint health.';
 // Track used exercises per focus/pattern across the week so multi-day full_body or repeated focus days rotate variations deterministically
 const focusOccurrenceCount=new Map();
 const sessions=days.map((dayIndex,i)=>{
  const rawLocation=draft.workoutLocation==='home_only'?'home':draft.workoutLocation==='home_and_gym'?(draft.dayLocations?.[dayIndex]||'home'):'gym';
  const location=['gym','gym_only'].includes(rawLocation)?'gym':'home';
  const focus=split==='upper_lower'?(i%2?'lower':'upper'):split==='ppl'?(days.length===4?['push','pull','legs','full_body'][i]:days.length===5?['push','pull','legs','upper','lower'][i]:['push','pull','legs'][i%3]):split==='bro_split'?(days.length===4?['chest_tri','back_bi','shoulders_core','legs'][i]:['chest','back','legs','shoulders','arms','core'][i%6]):'full_body';
  const focusOccurrence=focusOccurrenceCount.get(focus)||0;
  focusOccurrenceCount.set(focus,focusOccurrence+1);
  const used=[],missing=[];let seconds=300;
  const exercises=[];
  const fullBodyOrders=[
   ['squat','horizontal_push','horizontal_pull','hinge','anti_extension','vertical_pull'],
   ['hinge','horizontal_pull','horizontal_push','squat','anti_extension','vertical_pull'],
   ['squat','vertical_pull','horizontal_push','hinge','horizontal_pull','anti_extension']
  ];
  const patternOrder=focus==='full_body'?(duration<=30?(i%2?fullBodyOrders[1]:fullBodyOrders[0]):fullBodyOrders[focusOccurrence%fullBodyOrders.length]):schemes[focus];
  for(const pattern of patternOrder){
   const pool=candidates(pattern,{...draft,fitnessLevel:level},location,used,safetyProfile);
   if(!pool.length){missing.push(pattern);continue;}
   const compound=['squat','hinge','horizontal_push','horizontal_pull','vertical_push','vertical_pull','lunge'].includes(pattern);
   let sets=level==='beginner'?2:(level==='advanced'&&compound&&duration>=45?4:3);
   const restSeconds=compound?(goal==='lose'&&duration>=45?90:120):(goal==='lose'&&duration>=45?60:75);
   const repMin=compound?8:10,repMax=compound?12:15;
   let fitting=pool.filter(cand=>{
    const cCost=sets*repMax*3*(eachSide(cand)?2:1)+(sets-1)*restSeconds+60;
    return seconds+cCost<=duration*60;
   });
   if(!fitting.length&&sets===4){
    sets=3;
    fitting=pool.filter(cand=>{
     const cCost=sets*repMax*3*(eachSide(cand)?2:1)+(sets-1)*restSeconds+60;
     return seconds+cCost<=duration*60;
    });
   }
   if(!fitting.length){missing.push(pattern);continue;}
   const e=fitting[focusOccurrence%fitting.length];
   const cost=sets*repMax*3*(eachSide(e)?2:1)+(sets-1)*restSeconds+60;
   seconds+=cost;used.push(e.id);exercises.push({...e,regions:muscleRegions(e),sets,repMin,repMax,rir:level==='beginner'?3:2,restSeconds});
  }
  return {dayIndex,location,focus,goalNote,exercises,missing,duration,estimatedMinutes:Math.ceil(seconds/60),isTrainingDay:true};
 });
 if(sessions.some(s=>!s.exercises.length)){
  if(split!=='full_body'){
   const fallback=workoutPlan({...draft,workoutSplitPreference:'full_body'});
   fallback.warnings.unshift('Requested split required unavailable equipment; switched to Full Body matching your equipment and time budget.');
   fallback.warningCodes=['WORKOUT_EQUIPMENT_FALLBACK_FULL_BODY',...(fallback.warningCodes||[]).filter(c=>c!=='WORKOUT_EQUIPMENT_FALLBACK_FULL_BODY')];
   return fallback;
  }
  throw apiError('WORKOUT_INFEASIBLE','Current equipment, injury exclusions, and duration cannot build a valid workout session.',{status:400});
 }
 if(sessions.some(s=>s.missing.length))addWarning('WORKOUT_MISSING_PATTERNS_NOTED','Some movement patterns did not fit current equipment, injuries, or session duration; gaps are noted per day.');
 if(split==='full_body'&&days.some((d,i)=>days.length>1&&(days[(i+1)%days.length]-d+7)%7===1))addWarning('WORKOUT_CONSECUTIVE_FULL_BODY_CAUTION','Consecutive Full Body training days detected; monitor recovery and prefer a rest day between sessions when possible.');
 const weeklySets=weeklySetTotals(sessions);
 const totalPatternsRequested=sessions.reduce((sum,s)=>sum+s.exercises.length+s.missing.length,0);
 const totalPatternsCovered=sessions.reduce((sum,s)=>sum+s.exercises.length,0);
 return {
  injuryPolicyVersion:INJURY_POLICY_VERSION,
  id:crypto.randomUUID(),
  version:1,
  split,
  goalNote,
  days:sessions,
  warnings,
  warningCodes,
  weeklySets,
  coverage:{
   requestedPatterns:totalPatternsRequested,
   coveredPatterns:totalPatternsCovered,
   missingPatternsCount:totalPatternsRequested-totalPatternsCovered,
   complete:totalPatternsRequested===totalPatternsCovered,
   reviewScope:'system_generated_heuristic_not_clinical_clearance'
  },
  sourceVersion:catalog.manifest.version
 };
}
export function exerciseAlternatives(s,dayIndex,exerciseId){
 const index=integer(dayIndex,0,6,'dayIndex');
 const day=s.workoutPlan?.days.find(d=>d.dayIndex===index),exercise=day?.exercises.find(e=>e.id===exerciseId);
 if(!exercise)throw apiError('EXERCISE_NOT_IN_DAY','Exercise is not scheduled in the specified workout day.',{status:400});
 const primary=primaryRegions(exercise);
 const prefs=s.onboarding?.workoutPrefs||{};
 const usedIds=day.exercises.map(e=>e.id);
 const fitsTime=e=>{
  const next={...day,exercises:day.exercises.map(x=>x===exercise?{...e,sets:exercise.sets,repMax:exercise.repMax,restSeconds:exercise.restSeconds}:x)};
  return estimatedSessionMinutes(next)<=(day.duration??prefs.sessionDuration??45);
 };
 const samePattern=candidates(exercise.pattern,prefs,day.location,usedIds,s.profile)
  .filter(e=>primary.length>0&&primary.every(r=>primaryRegions(e).includes(r)))
  .filter(fitsTime);
 if(samePattern.length)return samePattern.slice(0,6);
 // If the original exercise is unsafe due to an INJURY_PATTERNS exclusion, relax pattern matching to safe exercises targeting overlapping primary regions.
 const injuries=prefs.injuries||[];
 if(!isFriendlyForInjuries(exercise,injuries,s.profile)){
  const excluded=new Set(usedIds);
  const safeRegionMatches=catalog.exercises
   .filter(e=>e.modality==='strength'&&['weight_reps','bodyweight_reps'].includes(e.tracking)&&(prefs.fitnessLevel==='advanced'||e.difficulty!=='advanced')&&(prefs.fitnessLevel!=='beginner'||e.difficulty==='beginner')&&!excluded.has(e.id)&&equipmentAllowed(e,prefs,day.location)&&isFriendlyForInjuries(e,injuries,s.profile))
   .filter(e=>primary.some(r=>primaryRegions(e).includes(r)))
   .filter(fitsTime)
   .sort((a,b)=>score(a,day.location)-score(b,day.location)||a.id.localeCompare(b.id));
  return safeRegionMatches.slice(0,6);
 }
 return [];
}

export function scheduledSessions(s,from=clockDate(),count=14){
 const plan=s.workoutPlan;if(!plan)return [];
 const overrides=(s.scheduleOverrides||[]).filter(o=>o.planId===plan.id);
 const sessions=[];
 for(let i=0;i<count;i++){
  const date=dateOffset(from,i),dayIndex=new Date(date+'T12:00:00Z').getUTCDay();
  for(const day of plan.days){
   const baseMeta={dayIndex:day.dayIndex,focus:day.focus,location:day.location,exerciseCount:(day.exercises||[]).length,estimatedMinutes:day.estimatedMinutes||day.duration||45};
   if(day.dayIndex===dayIndex&&!overrides.some(o=>o.dayIndex===day.dayIndex&&o.fromDate===date))sessions.push({date,...baseMeta,moved:false,fromDate:null});
   const movedOverride=overrides.find(o=>o.dayIndex===day.dayIndex&&o.toDate===date);
   if(movedOverride)sessions.push({date,...baseMeta,moved:true,fromDate:movedOverride.fromDate});
  }
 }
 return sessions.sort((a,b)=>a.date.localeCompare(b.date));
}
