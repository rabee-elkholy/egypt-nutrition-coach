// Bands have no reliable kg setting; assisted machines do.
export function usesKg(exercise){
 if(['bodyweight','variable'].includes(exercise.loadMode))return false;
 if(exercise.loadMode==='assisted'&&exercise.equipment?.some(e=>e.equipment_id==='resistance_band'))return false;
 return true;
}
export const loadLabel=e=>e.loadMode==='assisted'?'وزن المساعدة (كجم)':'الوزن (كجم)';
export const setSummary=(e,sets)=>(sets||[]).map(s=>usesKg(e)?`${s.kg} كجم × ${s.reps} عدة`:`${s.reps} عدة`).join('، ');
