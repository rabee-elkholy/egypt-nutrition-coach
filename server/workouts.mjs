import catalog from '../data/exercises.json' with {type:'json'};
export {catalog};
const equipmentMap={dumbbells:['dumbbell'],resistance_bands:['resistance_band'],bench:['flat_bench'],yoga_mat:['mat'],pullup_bar:['pullup_bar'],barbell:['barbell'],kettlebell:['kettlebell'],jump_rope:['jump_rope'],cardio_machine:['cardio_machine']};
export function workoutPlan(draft){
 const selected=Array.isArray(draft.selectedWorkoutDays)&&draft.selectedWorkoutDays.length?draft.selectedWorkoutDays:[1,3,5];
 const days=[...new Set(selected.map(Number))].sort();
 if(days.some(x=>!Number.isInteger(x)||x<0||x>6)||days.length>6)throw Error('اختر من يوم إلى 6 أيام تدريب.');
 const level=draft.fitnessLevel||'beginner',duration=Number(draft.sessionDuration)||45;
 const split=draft.workoutSplitPreference==='auto'||!draft.workoutSplitPreference?(days.length<=3?'full_body':'upper_lower'):draft.workoutSplitPreference;
 const patterns={full_body:['squat','horizontal_push','horizontal_pull','hinge','anti_extension'],upper:['horizontal_push','horizontal_pull','vertical_push','vertical_pull','elbow_flexion'],lower:['squat','hinge','lunge','knee_flexion','plantar_flexion'],push:['horizontal_push','vertical_push','elbow_extension'],pull:['horizontal_pull','vertical_pull','elbow_flexion'],legs:['squat','hinge','lunge','plantar_flexion']};
 const sessions=days.map((dayIndex,i)=>{
  const location=draft.workoutLocation==='home_only'?'home':draft.workoutLocation==='home_and_gym'?(draft.dayLocations?.[dayIndex]||'home'):'gym';
  const allowed=new Set(['bodyweight',...(draft.homeEquipment||[]).flatMap(x=>equipmentMap[x]||[])]);
  const focus=split==='upper_lower'?(i%2?'lower':'upper'):split==='ppl'?['push','pull','legs'][i%3]:'full_body';
  const used=new Set(),missing=[];
  const exercises=patterns[focus].slice(0,Math.max(3,Math.floor(duration/9))).flatMap(pattern=>{
   const candidates=catalog.exercises.filter(e=>e.modality==='strength'&&e.pattern===pattern&&['weight_reps','bodyweight_reps'].includes(e.tracking)&&e.difficulty!=='advanced'&&(level!=='beginner'||e.difficulty==='beginner')&&!used.has(e.id)&&(location==='gym'||e.equipment.every(q=>allowed.has(q.equipment_id))));
   candidates.sort((a,b)=>a.equipment.length-b.equipment.length||a.id.localeCompare(b.id));
   const e=candidates[i%candidates.length];if(!e){missing.push(pattern);return [];}
   used.add(e.id); return [{...e,sets:level==='beginner'?2:3,repMin:8,repMax:12,rir:level==='beginner'?3:2,restSeconds:120}];
  });
  return {dayIndex,location,focus,exercises,missing,duration, isTrainingDay:true};
 });
 return {id:crypto.randomUUID(),version:1,split:split==='bro_split'?'full_body':split,days:sessions,warnings:sessions.some(s=>s.missing.length)?['بعض الحركات غير متاحة بالمعدات المختارة؛ لم نستبدلها بتمارين تحتاج معدات غير موجودة.']:[],sourceVersion:catalog.manifest.version};
}
