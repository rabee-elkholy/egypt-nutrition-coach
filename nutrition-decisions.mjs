import {localDate,dateOffset} from './coaching-shared.mjs';

// Exact, deterministic evidence identity; no timestamps from unrelated logging,
// no lossy hash, and no assumption about legacy proposals without evidence.
export function nutritionEvidenceKey(state,now,timezone=state.profile?.timezone||'Africa/Cairo'){
 const end=localDate(now,timezone),start=dateOffset(end,-13),plan=state.plans?.find(p=>p.id===state.active_plan_id);
 const profileChange=state.history?.filter(h=>h.kind==='profile').at(-1)?.at;
 const context=state.nutritionContextStartedOn||(profileChange?localDate(Date.parse(profileChange),timezone):null);
 const inWindow=x=>x.date>=start&&x.date<=end&&(!context||x.date>=context);
 const unique=rows=>[...new Map(rows.map(x=>[x[0],x])).values()].sort((a,b)=>a[0].localeCompare(b[0]));
 return JSON.stringify({version:1,planId:plan?.id||null,energy:plan?.targets?.energy??null,goal:state.profile?.goal,targetWeight:state.profile?.targetWeight??null,recomposition:!!state.profile?.recomposition,context,
  weights:unique((state.weights||[]).filter(x=>inWindow(x)&&Number.isFinite(x.kg)).map(x=>[x.date,x.kg])),
  food:unique((state.foodLogs||[]).filter(x=>inWindow(x)&&x.complete&&x.energy>0&&x.adherence>=80).map(x=>[x.date,x.energy,x.adherence]))});
}
export function matchingNutritionDecline(state,now,timezone,kind){
 const key=nutritionEvidenceKey(state,now,timezone);
 return [...(state.adaptations||[])].reverse().find(a=>a.status==='rejected'&&['calories','maintenance'].includes(a.kind)&&(!kind||a.kind===kind)&&a.nutritionEvidence===key)||null;
}
