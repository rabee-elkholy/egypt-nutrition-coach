// Evidence-backed coaching agreements. Pure-English baseline with canonical codes for KMM localization.
import {localDate,dateOffset} from './coaching-shared.mjs';
import {apiError} from './coaching-error.mjs';

export const BARRIERS={
 nutrition:['time','budget','taste','hunger','eating_out','logging','none'],
 training:['time','fatigue','pain','equipment','motivation','none']
};
const terminal=new Set(['completed','declined','superseded']);
const advice={
 time:['Simplify meal prep load.','Choose an easy allowed alternative from your plan and prep ingredients ahead of time.'],
 budget:['Make your plan easier on your budget.','Review budget-friendly allowed alternatives without removing your health constraints.'],
 taste:['Enjoyment supports consistency.','Try an allowed swap for any meal you dislike and report whether it works better.'],
 hunger:['Logged hunger deserves attention.','Continue logging hunger and energy over the next few days; calorie cuts are paused while hunger stays elevated.'],
 eating_out:['Handle dining out without stress.','Log ingredients and estimated portions honestly, marking unmeasured entries as approximate.'],
 logging:['Make logging frictionless before changing targets.','Start by logging one actual meal today; mark the day complete only after logging all intake.'],
 fatigue:['Match training load to current readiness.','Update sleep, fatigue, and pain in your daily recovery check-in before adjusting workout effort.'],
 pain:['Address pain before progressing.','Stop any painful movement and update your recovery check-in; persistent or worsening pain requires specialist evaluation.'],
 equipment:['Match exercises to available equipment.','Use safe exercise alternatives or update your home equipment settings in Profile.'],
 motivation:['Pick one small repeatable step.','Schedule a realistic next session without doubling effort to compensate for missed days.']
};
const fail=(code,message,status=400,extra={})=>{throw apiError(code,message,{status,...extra});};
const active=c=>!terminal.has(c.status);
const expired=(c,now)=>['proposed','question'].includes(c.status)&&Date.parse(c.createdAt)+7*86400000<=now;
export function coachingContext(s,domain){return domain==='nutrition'?JSON.stringify([s.active_plan_id,s.profile?.goal]):JSON.stringify([s.workoutPlan?.id,s.profile?.goal]);}
function evidence(s,domain,date){return {date,basedOnRevision:s.revision+1,context:coachingContext(s,domain),source:'user_report'};}
export function currentFeedback(s,domain,today){
 const recent=(s.coachingFeedback||[]).filter(f=>f.domain===domain&&f.date<=today&&f.date>=dateOffset(today,-2)&&f.context===coachingContext(s,domain)).sort((a,b)=>a.at.localeCompare(b.at));
 const latest=recent.at(-1);if(!latest)return undefined;
 const result={...latest,metricEvidence:{}};
 for(const key of ['hunger','energy','satiety']){
  const observed=recent.findLast(f=>Number.isInteger(f[key])&&f[key]>=1&&f[key]<=5);
  result[key]=observed?.[key]??null;
  if(observed)result.metricEvidence[key]={feedbackId:observed.id,date:observed.date,at:observed.at};
 }
 return result;
}
export function coachingSafetyHold(s,today){
 const f=(s.coachingFeedback||[]).filter(x=>x.domain==='training'&&x.barrier==='pain'&&x.date<=today).sort((a,b)=>a.at.localeCompare(b.at)).at(-1);
 return f?.barrier==='pain'&&!s.checkins?.some(c=>Date.parse(c.at)>Date.parse(f.at)&&!c.pain&&!c.illness&&!c.redFlags)?f:null;
}
export function handleCoachingCommand(s,action,p,now){
 s.coachingFeedback||=[];s.coachingCases||=[];
 const at=new Date(now).toISOString(),today=localDate(now,s.profile?.timezone||'Africa/Cairo');
 if(action==='coaching_feedback'){
  if(!['nutrition','training'].includes(p.domain)||typeof p.barrier!=='string'||!BARRIERS[p.domain].includes(p.barrier))fail('COACHING_FEEDBACK_INVALID','Valid domain (nutrition | training) and matching barrier are required.');
  for(const key of ['hunger','energy','satiety'])if(p[key]!=null&&(!Number.isInteger(p[key])||p[key]<1||p[key]>5))fail('COACHING_RATING_OUT_OF_RANGE','Subjective ratings (hunger, energy, satiety) must be integers from 1 to 5.',400,{params:{field:key}});
  if(p.domain!=='nutrition'&&['hunger','satiety'].some(k=>p[k]!=null))fail('COACHING_HUNGER_NUTRITION_ONLY','Hunger and satiety ratings are only valid for nutrition coaching feedback.');
  if(p.domain==='nutrition'&&!s.active_plan_id||p.domain==='training'&&!s.workoutPlan)fail('COACHING_TRACK_NOT_ENABLED','Requested coaching domain is not enabled on this account.');
  const feedback={id:crypto.randomUUID(),date:today,at,domain:p.domain,barrier:p.barrier,hunger:p.hunger??null,satiety:p.satiety??null,energy:p.energy??null,context:coachingContext(s,p.domain)};
  s.coachingFeedback.push(feedback);
  const existing=s.coachingCases.find(c=>c.domain===p.domain&&active(c)&&c.context===feedback.context&&c.barrier===p.barrier&&c.status!=='question'&&(c.status!=='proposed'||Date.parse(c.createdAt)+7*86400000>now));
  if(existing)return s;
  for(const c of s.coachingCases.filter(c=>c.domain===p.domain&&active(c))){c.status='superseded';c.closedAt=at;}
  if(p.barrier==='none')return s;
  const [title,step]=p.domain==='training'&&p.barrier==='time'?['Adjust session timing to fit your schedule.','Review your session duration and training days in Profile; workout duration is not reduced automatically without your confirmation.']:advice[p.barrier];
  s.coachingCases.push({id:crypto.randomUUID(),code:'COACHING_BARRIER_AGREEMENT',params:{domain:p.domain,barrier:p.barrier},domain:p.domain,date:today,createdAt:at,context:feedback.context,barrier:p.barrier,status:'proposed',title,step,evidence:{...evidence(s,p.domain,today),feedbackId:feedback.id},acknowledgedAt:null,acceptedAt:null,reviewOn:null,outcome:null,planMutation:false});
  return s;
 }
 const c=s.coachingCases.find(c=>c.id===p.id);
 if(!c)fail('COACHING_CASE_NOT_FOUND','Coaching case ID not found.',404);
 if(action==='coaching_ack'){
  c.acknowledgedAt||=at;return s;
 }
 if(c.context!==coachingContext(s,c.domain))fail('COACHING_CONTEXT_CHANGED','Coaching context changed since this agreement was created; review current coaching status.',409);
 if(action==='coaching_decision'){
  if(typeof p.accept!=='boolean')fail('COACHING_DECISION_INVALID','Boolean accept flag is required for coaching_decision.');
  if(c.status!=='proposed')fail('COACHING_CASE_ALREADY_DECIDED','Coaching agreement has already been decided or is no longer open.',409);
  if(Date.parse(c.createdAt)+7*86400000<=now)fail('COACHING_CASE_EXPIRED','Coaching agreement proposal has expired (older than 7 days); log updated feedback first.',409);
  c.status=p.accept?'accepted':'declined';
  c.decidedAt=at;
  if(p.accept){c.acceptedAt=at;c.reviewOn=dateOffset(today,c.barrier==='pain'?1:3);}
  else c.closedAt=at;
  return s;
 }
 if(action==='coaching_outcome'){
  if(c.status!=='accepted')fail('COACHING_OUTCOME_REQUIRES_ACCEPTED_CASE','Reporting an outcome requires an accepted coaching agreement.',409);
  if(!['helped','not_helped','not_tried'].includes(p.outcome))fail('COACHING_OUTCOME_INVALID','outcome must be one of helped, not_helped, or not_tried.');
  if(c.reviewOn>today&&p.outcome==='helped')fail('COACHING_REVIEW_DATE_NOT_REACHED','Cannot confirm helped outcome before the scheduled coaching review date.',409,{params:{reviewOn:c.reviewOn}});
  c.status='completed';c.closedAt=at;c.outcome={value:p.outcome,at,source:'user_report'};
  if(p.outcome!=='helped')s.coachingCases.push({id:crypto.randomUUID(),code:'COACHING_BARRIER_QUESTION',params:{domain:c.domain,priorOutcome:p.outcome},domain:c.domain,date:today,createdAt:at,context:c.context,priorCaseId:c.id,barrier:null,status:'question',title:p.outcome==='not_tried'?'Step was not tried yet; want to pick an easier one?':'You reported this step did not help; let us review the barrier first.',step:'Select your current barrier so we can pick a realistic step; skipping is never treated as failure.',evidence:{source:'user_report',outcome:p.outcome,caseId:c.id,basedOnRevision:s.revision+1},acknowledgedAt:null,acceptedAt:null,reviewOn:null,outcome:null,planMutation:false});
  return s;
 }
 fail('COACHING_COMMAND_UNKNOWN','Unknown coaching command action.');
}

export function reconcileCoaching(s,now){
 s.coachingCases||=[];
 const today=localDate(now,s.profile?.timezone||'Africa/Cairo'),at=new Date(now).toISOString();
 for(const c of s.coachingCases)if(active(c)&&c.context!==coachingContext(s,c.domain)){c.status='superseded';c.closedAt=at;}
 const recent=(s.sessions||[]).filter(x=>x.date>=dateOffset(today,-6)&&x.date<=today&&x.status==='missed'&&((s.workoutPlan?.programId&&x.programId===s.workoutPlan.programId)||(s.workoutPlan?.id&&x.planId===s.workoutPlan.id)));
 const food=(s.foodLogs||[]).filter(x=>x.date>=dateOffset(today,-6)&&x.date<=today&&x.complete&&x.adherence!=null&&x.adherence<80);
 for(const domain of ['nutrition','training']){
  const dates=[...new Set((domain==='training'?recent:food).map(x=>x.date))];
  if(dates.length<2||domain==='nutrition'&&!s.active_plan_id||domain==='training'&&!s.workoutPlan)continue;
  if(s.coachingCases.some(c=>c.domain===domain&&c.context===coachingContext(s,domain)&&(active(c)&&!expired(c,now)||c.date>=dateOffset(today,-6))))continue;
  for(const c of s.coachingCases.filter(c=>c.domain===domain&&active(c)&&expired(c,now))){c.status='superseded';c.closedAt=at;}
  s.coachingCases.push({id:crypto.randomUUID(),code:'COACHING_BARRIER_QUESTION',params:{domain,datesCount:dates.length},domain,date:today,createdAt:at,context:coachingContext(s,domain),barrier:null,status:'question',title:domain==='nutrition'?'Several logged days differed from your meal plan targets.':'Two or more scheduled sessions were missed this week.',step:'Tell us the main barrier so we can choose a realistic step without guessing.',evidence:{dates,source:'recorded_logs',basedOnRevision:s.revision+1},acknowledgedAt:null,acceptedAt:null,reviewOn:null,outcome:null,planMutation:false});
 }
 return s;
}

export function coachingInbox(s,now,{pushConfigured=false}={}){
 const today=localDate(now,s.profile?.timezone||'Africa/Cairo');
 const items=(s.coachingCases||[]).filter(c=>active(c)&&c.context===coachingContext(s,c.domain)).map(c=>({...c,code:c.code||(c.status==='question'?'COACHING_BARRIER_QUESTION':'COACHING_BARRIER_AGREEMENT'),reviewDue:c.status==='accepted'&&c.reviewOn<=today,expired:expired(c,now),deliveryStatus:'NOT_SENT',readStatus:c.acknowledgedAt?'ACKNOWLEDGED':'UNKNOWN'}));
 items.sort((a,b)=>Number(b.barrier==='pain')-Number(a.barrier==='pain')||Number(b.reviewDue)-Number(a.reviewDue)||b.createdAt.localeCompare(a.createdAt));
 return {date:today,revision:s.revision,channel:'in_app',pushConfigured:Boolean(pushConfigured),items};
}
