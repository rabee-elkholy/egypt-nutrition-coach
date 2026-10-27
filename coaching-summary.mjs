// @ts-check
import {withinElapsed} from './coaching-time.mjs';
export function summarizeFirstWeek(evidence,today,now){
 const {food,entries,checks,water,weights,sessions,workout,feedback}=evidence;
 const dates=[...new Set([...food,...entries,...checks,...water,...weights,...sessions,...workout,...feedback].map(x=>x.date))].sort();
 return {dates,todayRecorded:dates.includes(today),completedFood:new Set(food.filter(x=>x.complete).map(x=>x.date)).size,completedSessions:new Set(sessions.filter(x=>x.status==='completed').map(x=>x.date+':'+x.dayIndex)).size,freshCheck:checks.some(x=>withinElapsed(x.at,now))};
}
// Render-scoped memoization: identity, revision, date and server clock are part of the key.
export function createBriefSelector(compute){let cache;return (state,today)=>{if(!cache||cache.state!==state||cache.today!==today||cache.revision!==state.revision||cache.clock!==state.serverNow)cache={state,today,revision:state.revision,clock:state.serverNow,notes:compute(state,today)};return cache.notes;};}
