// Eight weeks is a product review interval, not a physiological expiry date.
export function splitReview(state, today) {
 const plan=state.workoutPlan;
 if(plan?.split!=='full_body')return null;
 const sessions=(state.sessions||[]).filter(s=>(plan.programId?s.programId===plan.programId:s.planId===plan.id)&&s.status==='completed'&&s.date<=today);
 const dates=[...new Set(sessions.map(s=>s.date))].sort();
 if(!dates.length)return null;
 const elapsed=(Date.parse(today)-Date.parse(dates[0]))/86400000;
 if(!Number.isFinite(elapsed)||elapsed<56)return null;
 const recent=dates.filter(d=>Date.parse(today)-Date.parse(d)<=28*86400000).length;
 const days=new Set(plan.days.map(d=>d.dayIndex)).size;
 const base='8-week milestone review: this is an optional check-in rather than a Full Body expiration date. Research shows comparable strength and hypertrophy across splits when weekly training volume is matched.';
 if(state.recovery?.status!=='ready')return {kind:'recovery',code:'SPLIT_REVIEW_RECOVERY_FIRST',params:{days},text:`${base} Submit a fresh ready recovery check-in first; when managing pain or fatigue, recovery takes priority over changing splits.`};
 if(dates.length<16||recent<Math.min(days*3,8))return {kind:'consistency',code:'SPLIT_REVIEW_BUILD_CONSISTENCY',params:{days,completedCount:dates.length},text:`${base} Focus on session consistency first; build at least 16 completed sessions and steady recent adherence before switching splits.`};
 if(days<4)return {kind:'stay',code:'SPLIT_REVIEW_KEEP_FULL_BODY',params:{days},text:`${base} At ${days} training days per week, continuing with Full Body remains practical and time-efficient. If your schedule opens up to 4+ days, you can switch to Upper/Lower from Preferences.`};
 return {kind:'suggest',code:'SPLIT_REVIEW_SUGGEST_UPPER_LOWER',params:{days},text:`${base} Because you train ${days}+ days consistently with ready recovery, Upper/Lower or Push/Pull/Legs is available in Preferences if sessions feel long or you prefer dedicated focus days.`};
}
