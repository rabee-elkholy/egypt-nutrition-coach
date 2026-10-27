// @ts-check
import {dateOffset} from './coaching-time.mjs';
/** Current program membership is intentionally distinct from a specific plan version. */
export const sessionBelongsToProgram=(x,plan)=>!!plan&&(plan.programId?x.programId===plan.programId:!!plan.id&&x.planId===plan.id);
export const logBelongsToPlan=(x,plan)=>!!plan&&(!!plan.id&&x.planId===plan.id||!!plan.days?.some(d=>d.exercises?.some(e=>e.progressionKey&&e.progressionKey===x.progressionKey&&e.id===x.exerciseId)));
export const recentByDate=(items,today,days)=>items.filter(x=>x.date>=dateOffset(today,1-days)&&x.date<=today);
// Stable-sort/at(-1) semantics in one pass, including ties and missing timestamps.
export function latestRecord(items){let best;for(const item of items){if(!best||(item.date||'').localeCompare(best.date||'')>0||((item.date||'')===(best.date||'')&&(Date.parse(item.at)||0)>=(Date.parse(best.at)||0)))best=item;}return best;}
export function firstWeekEvidence(state,start,today,now){
 const within=x=>x.date>=start&&x.date<=today&&(!x.at||Date.parse(x.at)<=now);
 const plan=state.workoutPlan;
 const food=(state.foodLogs||[]).filter(within),entries=(state.foodEntries||[]).filter(within),checks=(state.checkins||[]).filter(within),water=(state.waterLogs||[]).filter(within),weights=(state.weights||[]).filter(within);
 const sessions=(state.sessions||[]).filter(x=>within(x)&&sessionBelongsToProgram(x,plan));
 const workout=(state.workoutLogs||[]).filter(x=>within(x)&&logBelongsToPlan(x,plan));
 const feedback=(state.coachingFeedback||[]).filter(within);
 return {plan,food,entries,checks,water,weights,sessions,workout,feedback};
}
