import {firstWeekEvidence} from './coaching-evidence.mjs';
import {summarizeFirstWeek} from './coaching-summary.mjs';
import {recoveryNeedsAttention,followupIsProtected,nutritionNeedsAttention} from './coaching-priority.mjs';
import {validDate} from './coaching-shared.mjs';

// Account age, not plan age: renewals/profile edits must not restart onboarding.
export function firstWeekDay(state,today){
 const start=state.onboarding?.journeyStartedOn;
 if(!validDate(start)||!validDate(today))return null;
 const day=(Date.parse(today)-Date.parse(start))/86400000+1;
 return Number.isInteger(day)&&day>=1&&day<=7?day:null;
}
export function firstWeekMessages(state,today,notes){
 const day=firstWeekDay(state,today);if(!day)return notes;
 const start=state.onboarding.journeyStartedOn,now=Date.parse(state.serverNow||today+'T23:59:59Z');
 const evidence=firstWeekEvidence(state,start,today,now);
 const {plan,food,entries}=evidence;
 const {dates,todayRecorded,completedFood,completedSessions,freshCheck}=summarizeFirstWeek(evidence,today,now);
 const nutrition=!!state.active_plan_id;
 const result=notes.map(n=>({...n}));
 const follow=result.find(n=>n.role==='followup');
 const protectedFollow=followupIsProtected(follow);
 if(protectedFollow||recoveryNeedsAttention(state.recovery?.status))return notes;
 if(nutritionNeedsAttention(result))return notes;
 let text,action,actionTarget,actionCode,stage;
 const userName=state.profile?.name?String(state.profile.name).trim():null;
 const next=()=>{
  if(plan&&!freshCheck)return ['Start with today\'s recovery check-in','recovery','BRIEF_ACTION_RECOVERY_CHECKIN'];
  if(nutrition&&!food.some(x=>x.date===today)&&!entries.some(x=>x.date===today))return ['Log your first actual meal','food','BRIEF_ACTION_LOG_MEAL'];
  if(plan)return ['Review today\'s workout schedule','workout','BRIEF_ACTION_VIEW_WORKOUT'];
  return ['Review your food diary at your pace','food','BRIEF_ACTION_LOG_MEAL'];
 };
 [action,actionTarget,actionCode]=next();
 if(day===1){
  stage=todayRecorded?'day1_first_log':'day1_welcome';
  text=todayRecorded?'First log recorded; that is a solid foundation to build on without trying to complete everything at once.':`Welcome${state.profile?.name?' '+state.profile.name:''}! Your CuraFit Specialist Team is with you from day one. Start with one simple step today — week one is for learning your rhythm, not a perfection test.`;
 }else if(day===7){
  stage=dates.length?'day7_summary':'day7_no_logs';
  const details=[nutrition?`complete food days: ${completedFood}`:null,plan?`completed sessions: ${completedSessions}`:null].filter(Boolean).join(', ');
  text=dates.length?`Day 7 summary: you logged activity on ${dates.length} of your first 7 days (${details}). This reflects recorded logs so far, not a final verdict. What felt easy and what needs adjustment?`:'Day 7 reached with no logs recorded yet. That does not mean you did not try; let us pick a smaller first step that fits your routine.';
  action='Share your main barrier or next step';actionTarget='feedback';actionCode='BRIEF_ACTION_SHARE_FEEDBACK';
 }else if(!dates.length){
  stage=`no_logs_day_${day}`;
  const texts={
   2:'Ease into week one at your own pace. One logged meal or recovery check-in is enough to start calibrating your plan.',
   3:'If getting started feels difficult, let us understand the barrier rather than adding pressure. Is time or logging friction getting in the way?',
   4:'No need to backfill earlier days. Start fresh with whatever fits today.',
   5:'Keep the first step small: pick one single item you can log today without worrying about the whole week.',
   6:'Before your week-one summary tomorrow, tell us what made starting harder so we can adjust your routine.'
  };
  text=texts[day];if([3,6].includes(day)){action='Tell us what made starting harder';actionTarget='feedback';actionCode='BRIEF_ACTION_SHARE_FEEDBACK';}
 }else if(!todayRecorded){
  stage=`returning_day_${day}`;
  text=`Your last log was on ${dates.at(-1)}. Pick up smoothly from today without trying to compensate for missed days.`;
 }else{
  stage=`momentum_day_${day}`;
  const texts={
   2:'Great follow-up after day one. Pick an easy daily cue for logging; consistency beats perfection.',
   3:'Your logs are building a clearer picture step by step. Notice what felt easy and what slowed you down.',
   4:'Halfway through week one: lock in one repeatable habit before adding more complexity.',
   5:'Week one helps verify whether your plan fits your schedule and food preferences. Log any friction early.',
   6:'Tomorrow is your day-7 recap. Just log honestly as usual so the summary reflects real life.'
  };
  text=texts[day];if([3,5].includes(day)){action='Log any current barrier';actionTarget='feedback';actionCode='BRIEF_ACTION_SHARE_FEEDBACK';}
 }
 const note={role:'followup',key:`first-week-${day}`,code:'BRIEF_FIRST_WEEK',actionCode,params:{...(userName?{userName}:{}),day,stage,activeDays:dates.length,todayRecorded,completedFood,completedSessions,...(dates.length?{lastLogDate:dates.at(-1)}:{})},priority:'normal',text,action,actionTarget};
 const index=result.findIndex(n=>n.role==='followup');if(index>=0)result[index]=note;else result.push(note);
 for(const n of result){
  if(n.role!=='followup')delete n.actionTarget;
  if(n.role==='nutrition'&&n.key==='food-missing'){
   n.params={...(n.params||{}),isFirstWeek:true,day};
   n.actionCode='BRIEF_ACTION_LOG_MEAL';
   n.text=day===1?'Your meal plan is ready. Start with the meal that fits your schedule and log what you actually eat.':'No meal logged yet today; start from your next meal without compensating for prior days.';
   n.action='Confirm day completion only after logging all intake for the day.';
  }
  if(n.role==='nutrition'&&n.key==='food-complete'){
   n.params={...(n.params||{}),isFirstWeek:true,day};
   n.actionCode='BRIEF_ACTION_CONFIRM_DAY';
   n.action='Double-check that your diary includes every meal and drink you consumed today.';
  }
  if(n.role==='training'&&n.key==='unknown'){
   n.params={...(n.params||{}),isFirstWeek:true,day};
   n.actionCode='BRIEF_ACTION_RECOVERY_CHECKIN';
   n.text='Your workout plan is ready, and logging today\'s recovery check-in helps calibrate effort safely.';
   n.action='A missing check-in does not penalize your streak or assume you missed training.';
  }
 }
 return result;
}
