import {personalBrief} from '../../personal-brief.mjs';
import {dailyTips,SORENESS,SORENESS_PRE,say} from '../../coach-messages.mjs';
import {splitReview} from '../../split-review.mjs';
import {hash} from './common.mjs';
// Collect exact engine strings recursively, plus the actual frontend message functions.
export function messages(state,ctx){
 const found=[];
 const add=(text,type,source,reasonCode=null,trigger=null)=>{if(typeof text!=='string'||!text.trim())return;found.push({...ctx,messageId:'msg-'+hash([ctx.userId,ctx.day,ctx.engineStateRevision,type,text]).slice(0,24),messageType:type,exactText:text,reasonCode,trigger,sourceFileOrFunction:source,generatedAt:state.serverNow,visibleAt:null,wasActuallyRendered:false,displayStatus:'GENERATED',renderingStatus:'NOT_MEASURED',deliveryStatus:'NOT_MEASURED',eligibleForDisplay:ctx.openedApp,relatedPlanId:state.active_plan_id,relatedDecisionId:null});};
 if(state.profile){for(const n of personalBrief(state,state.serverDate)){add(n.text,'personal:'+n.role,'personal-brief.mjs:personalBrief',n.key);add(n.action,'action:'+n.role,'personal-brief.mjs:personalBrief',n.key);}
 for(const t of dailyTips(state.serverDate,{hasWorkout:!!state.workoutPlan,offset:0}))add(t.text,'tip','coach-messages.mjs:dailyTips',t.cat);
 const split=splitReview(state,state.serverDate);if(split)add(split.text,'split-review','split-review.mjs:splitReview');}
 function walk(o,source,trail=''){if(!o||typeof o!=='object')return;for(const [k,v]of Object.entries(o)){if(typeof v==='string'&&['reason','message','summaryText','progressionReason'].includes(k))add(v,trail+'.'+k,source,o.reasonCode||null);else if(k==='reasons'&&Array.isArray(v))v.forEach(x=>add(x,trail+'.reasons',source,o.reasonCode||null));else if(v&&typeof v==='object')walk(v,source,trail+'.'+k);}}
 walk(state.lastReview,'server/coaching.mjs:review','review');walk(state.recovery,'server/recovery.mjs:recovery','recovery');walk(state.progressSummary,'server/coaching.mjs:progressSummary','progressSummary');
 for(const a of state.adaptations||[])if(a.status==='pending')add(a.reason,'adaptation','server/coaching.mjs:review',a.reasonCode,a.id);
 for(const e of state.workoutPlan?.days.flatMap(d=>d.exercises)||[])if(e.progressionReason)add(e.progressionReason,'progression','server/recovery.mjs:progression');
 for(const p of state.plans||[])for(const w of p.warnings||[])for(const t of w.messages||[])add(t,'nutrition-warning','planner-core.mjs:makeWeek');
 for(const t of state.workoutPlan?.warnings||[])add(t,'workout-warning','server/workouts.mjs:workoutPlan');
 if(state.simulation?.renewalError)add(state.simulation.renewalError,'renewal-error','server/simulation.mjs:simulationCommand');
 return [...new Map(found.map(m=>[m.messageId,m])).values()];
}
