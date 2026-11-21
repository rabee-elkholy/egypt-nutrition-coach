import {latestRecord,recentByDate} from './coaching-evidence.mjs';
import {agreementMayReplaceFollowup} from './coaching-priority.mjs';
import {withinElapsed} from './coaching-time.mjs';
import {coachingInbox,currentFeedback} from './coaching-journey.mjs';
import {firstWeekMessages} from './first-week-messages.mjs';
import {usesKg} from './exercise-load.mjs';
import {dateOffset,FOCUS_LABELS,effectiveSets} from './coaching-shared.mjs';
import {seedPick} from './coach-messages.mjs';
import {matchingNutritionDecline} from './nutrition-decisions.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const num=n=>Math.round(n*10)/10;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const recent=recentByDate;
const latest=latestRecord;
const voices={
 nutrition:['Let us review your nutrition calmly.','Key nutrition takeaway from your logs:','Taking nutrition one meal at a time:','Building on what you actually logged:','Here is your nutrition focus today:','Keep your next meal simple and steady:','Nutrition check-in based on your diary:'],
 training:['Let us calibrate today\'s training effort.','Training note from your recent logs:','Taking training one session at a time:','Match today\'s effort to your readiness:','Here is your training priority today:','Focus on clean execution today:','Training check-in based on your logs:'],
 followup:['Keep the next habit step simple.','Focus on one small win today.','Here is a practical habit note for today:','Steady progress without pressure:','One small detail worth attention today:','Build a routine that fits real life:','Habit check-in for today:']
};
const actions={
 food:['Log your next meal after finishing it.','Record what you actually eat today, even if it differs from the plan.','Take it one meal at a time; logging is feedback, not an exam.','Start by logging what you have eaten so far today.','If a planned meal does not fit, pick an allowed alternative.'],
 complete:['Verify your diary includes any snacks or beverages you had today.','Prep one simple meal choice for tomorrow.','Stay flexible for tomorrow; consistency beats perfection.','Notice what made logging easy today and repeat it.','Plan ahead for the meal slot that usually feels hardest.'],
 weight:['Compare weigh-ins under consistent morning conditions.','Avoid changing calories over a single daily scale reading.','Track weekly averages alongside energy and strength.','Let multi-week trends guide adjustments.','Stay steady on your targets until enough data accumulates.'],
 sleep:['Pick a realistic bedtime you can repeat tonight.','Leave a short wind-down window before sleep.','Keep your bedroom dark, cool, and quiet.','Limit late caffeine if it affects sleep quality.','Treat sleep as a scheduled recovery pillar.'],
 checkin:['Log your sleep, fatigue, and pain status in Recovery Check-In.','Update your daily check-in before calibrating session load.','A quick recovery log keeps load progression accurate.','Record how you feel today instead of relying on stale data.','Start with today\'s recovery check-in.'],
 rest:['Take a true rest day or light comfortable movement.','No need to compensate for rest with extra volume.','Prepare gear and meals for your next scheduled workout.','Keep activity aligned with today\'s energy.','Use rest days to recharge sleep and hydration.'],
 train:['Start with a gradual warm-up and log actual sets.','Prioritize technique and control before adding weight.','Focus on one exercise at a time.','Take full rest between working sets to preserve quality.','Log both load and reps so progression stays accurate.'],
 done:['Cool down and prioritize protein and hydration.','Stick to your completed session; extra junk volume is unnecessary.','Log how you feel in tomorrow\'s recovery check-in.','Consistent sessions beat occasional exhaustive workouts.','Protect recovery for the rest of today.'],
 water:['Spread hydration steadily across the day.','Update your water counter if you drank cups not yet logged.','Keep a bottle visible as an easy reminder.','Avoid trying to chug your entire target all at once.','Log water regularly for an accurate daily view.']
};

// Pure-English canonical brief with stable `code`, `params`, and `actionTarget` on every note.
export function personalBrief(state,today){
 const notes=[],seed=today+':'+(state.profile?.name||'')+':'+(state.profile?.goal||'');
 const add=(role,key,fact,actionKey,priority='normal',code=null,params={},actionTarget=null)=>notes.push({
  role,
  key,
  code:code||`BRIEF_${key.toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`,
  params,
  priority,
  text:`${seedPick(voices[role],seed+':'+key)} ${fact}`,
  action:seedPick(actions[actionKey]||[actionKey],seed+':action:'+key,Math.floor(Date.parse(today)/86400000/7)),
  actionTarget:actionTarget||({food:'food',complete:'food',weight:'food',sleep:'recovery',checkin:'recovery',rest:'workout',train:'workout',done:'workout',water:'water'}[actionKey]||'review')
 });
 const food=(state.foodLogs||[]).filter(x=>x.date<=today),entries=(state.foodEntries||[]).filter(x=>x.date===today),record=latest(food.filter(x=>x.date===today));
 const plan=(state.plans||[]).find(p=>p.id===state.active_plan_id),day=plan?.days?.find(d=>d.date===today);
 const target=day?.targets||plan?.targets;
 const weights=recent((state.weights||[]).filter(x=>finite(x.kg)),today,14);
 const older=weights.filter(x=>x.date<dateOffset(today,-6)),newer=weights.filter(x=>x.date>=dateOffset(today,-6));
 const options=[];
 if(plan){
  if(record?.complete) options.push(['food-complete',`Food diary for ${today} is complete. Consistent logging enables accurate weekly reviews.`,'complete','normal','BRIEF_FOOD_COMPLETE',{date:today},'food']);
  else if(entries.length) options.push(['food-partial',`You have logged ${entries.length} meal(s) today and your day is still open; finish logging as you eat.`,'food','normal','BRIEF_FOOD_PARTIAL',{entriesCount:entries.length},'food']);
  else options.push(['food-missing','No meals logged yet today; start by logging your next actual meal.','food','normal','BRIEF_FOOD_MISSING',{},'food']);
  if(record?.complete&&finite(record.protein)&&finite(target?.protein))options.push(['protein',`Logged protein today is ${num(record.protein)} g against your ${num(target.protein)} g target.`,'complete','normal','BRIEF_PROTEIN_STATUS',{actualProtein:num(record.protein),targetProtein:num(target.protein)},'food']);
  if(older.length>=3&&newer.length>=3)options.push(['weight-trend',`Current 7-day average weight is ${num(mean(newer.map(x=>x.kg)))} kg (${newer.length} logs) vs. ${num(mean(older.map(x=>x.kg)))} kg (${older.length} logs) last week.`,'weight','normal','BRIEF_WEIGHT_TREND',{currentAvg:num(mean(newer.map(x=>x.kg))),currentCount:newer.length,previousAvg:num(mean(older.map(x=>x.kg))),previousCount:older.length},'review']);
  else if(weights.length)options.push(['weight-coverage',`You have ${weights.length} weigh-in(s) in the last 14 days; log at least 3 weigh-ins per week for reliable trend comparisons.`,'weight','normal','BRIEF_WEIGHT_COVERAGE',{count:weights.length},'food']);
  const decline=matchingNutritionDecline(state,Date.parse(state.serverNow||today+'T23:59:59Z'),state.profile?.timezone);
  const feedback=currentFeedback(state,'nutrition',today);
  const expired=plan.days?.at(-1)?.date<today;
  const selected=expired
   ?['plan-expired','Your previous 7-day nutrition plan has ended. Renew your plan to generate targets for the upcoming week.','Renew your nutrition plan from the Nutrition tab.','attention','BRIEF_PLAN_EXPIRED',{},'food']
   :feedback?.hunger>=4
   ?['high-hunger',`You logged hunger ${feedback.hunger}/5 on ${feedback.metricEvidence?.hunger?.date||feedback.date}; calorie reductions are paused while we monitor appetite and energy.`,'Continue logging hunger and energy and review your coaching step.','attention','BRIEF_HIGH_HUNGER',{hunger:feedback.hunger,date:feedback.metricEvidence?.hunger?.date||feedback.date},'feedback']
   :decline
   ?[decline.kind==='maintenance'?'maintenance-declined':'calories-declined',decline.kind==='maintenance'?'Your choice to decline the maintenance transition is saved; your goal remains unchanged.':'Your previous choice to decline a calorie change is saved; your plan was not modified.','weight','normal',decline.kind==='maintenance'?'MAINTENANCE_ADVICE_DECLINED':'CALORIE_ADVICE_DECLINED',{},'review']
   :(options.find(o=>o[0]==='weight-trend')||options.find(o=>o[0]==='protein')||options[0]);
  add('nutrition',...selected);
 }
 const ready=state.recovery||{status:'unknown',reasons:[]};
 const now=Date.parse(state.serverNow||today+'T23:59:59Z');
 const check=latest((state.checkins||[]).filter(x=>x.date<=today&&withinElapsed(x.at,now)));
 if(state.workoutPlan){
  const p=state.workoutPlan;
  const session=latest((state.sessions||[]).filter(s=>s.date===today&&(p.programId?s.programId===p.programId:s.planId===p.id)));
  const scheduled=(state.scheduledSessions||[]).find(s=>s.date===today);
  const next=(state.scheduledSessions||[]).filter(s=>s.date>today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const insight=state.progressSummary?.workoutSummary?.insights;
  if(['stop','hold'].includes(ready.status))add('training','safety',ready.reasons?.[0]||'Current recovery or safety flags indicate pausing heavy exercise and reviewing symptoms first.','Stop any painful movement; seek urgent medical care for chest pain or severe dizziness.','urgent',ready.reasonCode||'BRIEF_TRAINING_SAFETY',{},'recovery');
  else if(['high','caution'].includes(ready.status)){
   const adjustmentActive=p.days?.some(d=>d.exercises?.some(e=>effectiveSets(state,e,today,now)<e.sets));
   const declined=(state.adaptations||[]).some(a=>a.kind==='recovery'&&a.status==='rejected'&&a.setFactor===ready.setFactor&&Date.parse(a.expiresAt)>now&&(a.recoveryEvidenceAt?a.recoveryEvidenceAt===ready.asOf:Date.parse(a.at)>=Date.parse(ready.asOf)));
   if(adjustmentActive)add('training','adjustment-active','Your approved temporary set reduction is active for today\'s session.','Follow the reduced working sets; no need to make up deloaded sets later.','attention','RECOVERY_ADJUSTMENT_ACTIVE',{setFactor:ready.setFactor},'workout');
   else if(declined)add('training','fatigue-declined','Your choice to decline the set reduction is saved; your workout plan remains unchanged.','checkin','attention','RECOVERY_ADVICE_DECLINED',{},'recovery');
   else add('training','fatigue',`Recovery check-in notes: ${ready.reasons?.join(' ')||'elevated recovery strain'}.`,'Review the proposed temporary set reduction before training; nothing changes without your approval.','attention','RECOVERY_DELOAD_SUGGESTED',{setFactor:ready.setFactor},'review');
  }
  else if(session?.status==='completed')add('training','completed',`Workout session for ${today} is logged as completed${finite(session.duration)?` (${session.duration} min)`:''}.${ready.status==='unknown'?' Log a fresh recovery check-in before your next session.':''}`,ready.status==='unknown'?'checkin':'done','normal','BRIEF_TRAINING_COMPLETED',{date:today,duration:session.duration??null},ready.status==='unknown'?'recovery':'workout');
  else if(session?.status==='partial')add('training','partial','Today\'s workout is logged as partial; logging actual effort protects recovery and progression accuracy.'+(ready.status==='unknown'?' Submit a fresh recovery check-in before your next session.':''),ready.status==='unknown'?'checkin':'done','normal','BRIEF_TRAINING_PARTIAL',{},ready.status==='unknown'?'recovery':'workout');
  else if(session?.status==='missed')add('training','missed','Today\'s workout is marked missed. One missed day does not erase prior progress.',ready.status==='unknown'?'checkin':'Resume on your next scheduled day or reschedule without doubling volume.','normal','BRIEF_TRAINING_MISSED',{},'workout');
  else if(ready.status==='unknown')add('training','unknown','No fresh recovery check-in is logged yet, so load increases are held until readiness is recorded.','checkin','normal','CHECKIN_MISSING_OR_STALE',{},'recovery');
  else {
   const changes=[...(insight?.loadIncreases||[]).map(x=>({...x,type:'up'})),...(insight?.loadDecreases||[]).map(x=>({...x,type:'down'})),...(insight?.repIncreases||[]).map(x=>({...x,type:'reps'}))].filter(x=>x.date===today);
   const change=seedPick(changes,seed+':exercise');
   const changedExercise=p.days?.flatMap(d=>d.exercises||[]).find(e=>e.id===change?.exerciseId);
   if(change)add('training','performance',change.type==='reps'?`${change.name} reps progressed from ${change.fromReps} to ${change.toReps} (${changedExercise&&!usesKg(changedExercise)?'bodyweight':`${change.kg} kg`}).`:`${change.name} average load moved from ${change.fromKg} to ${change.toKg} kg.`,'train','normal','BRIEF_TRAINING_PERFORMANCE',{exerciseId:change.exerciseId,type:change.type},'workout');
   else if(scheduled)add('training','scheduled',`Today's scheduled workout is ${FOCUS_LABELS[scheduled.focus]||scheduled.focus}. ${ready.domains?.length?'Minor recovery notes exist; monitor effort closely.':'Current readiness supports your planned session.'}`,'train','normal','BRIEF_TRAINING_SCHEDULED',{focus:scheduled.focus},'workout');
   else add('training','rest',`Rest day today${next?`; next scheduled session is ${next.date} (${FOCUS_LABELS[next.focus]||next.focus})`:''}.`,'rest','normal','BRIEF_TRAINING_REST',{nextDate:next?.date||null,nextFocus:next?.focus||null},'workout');
  }
 }
 const activity=[...(state.foodLogs||[]),...(state.foodEntries||[]),...(state.workoutLogs||[]),...(state.sessions||[]),...(state.waterLogs||[]),...(state.weights||[]),...(state.checkins||[])].filter(x=>x.date<=today);
 const last=latest(activity.filter(x=>x.date<today));
 const daysActive=new Set(recent(activity,today,7).map(x=>x.date)).size;
 const hyd=state.progressSummary?.hydration;
 if(['hold','stop'].includes(ready.status))add('followup','safety-support','Priority right now is addressing the safety hold, not hitting daily targets.','No need to make up meals or workouts; focus on evaluating symptoms first.','attention',ready.reasonCode||'BRIEF_TRAINING_SAFETY',{},'recovery');
 else if(check&&finite(check.sleepHours)&&check.sleepHours<7)add('followup','short-sleep',`Last logged sleep was ${check.sleepHours} hours on ${check.date}; prioritize recovery tonight.`,'sleep','normal','BRIEF_FOLLOWUP_SHORT_SLEEP',{sleepHours:check.sleepHours,date:check.date},'recovery');
 else if(check&&finite(check.fatigue)&&check.fatigue>=4)add('followup','tired',`Logged fatigue was ${check.fatigue}/5 on ${check.date}; keep today's expectations realistic.`,'rest','normal','BRIEF_FOLLOWUP_TIRED',{fatigue:check.fatigue,date:check.date},'recovery');
 else if(last&&last.date<dateOffset(today,-2)&&activity.some(x=>x.date===today))add('followup','return',`Welcome back! Last logged activity was on ${last.date}. Resume smoothly without compensating for missed days.`,'complete','normal','BRIEF_FOLLOWUP_RETURN',{lastDate:last.date},'food');
 else {
  const follow=[];
  if(hyd&&finite(hyd.targetCups))follow.push(['water',`Hydration logged today: ${hyd.todayCups||0} of ${hyd.targetCups} cups.`,'water','normal','BRIEF_FOLLOWUP_WATER',{cups:hyd.todayCups||0,targetCups:hyd.targetCups},'water']);
  if(!check)follow.push(['missing-checkin','No recent sleep and energy check-in is logged; adding one helps calibrate daily guidance.','checkin','normal','CHECKIN_MISSING_OR_STALE',{},'recovery']);
  else if(finite(check.sleepHours))follow.push(['sleep',`Last logged sleep was ${check.sleepHours} hours on ${check.date}. Consistent logging helps spot trends early.`,'sleep','normal','BRIEF_FOLLOWUP_SLEEP',{sleepHours:check.sleepHours,date:check.date},'recovery']);
  follow.push(['activity',`You logged activity on ${daysActive} day(s) over the past 7 days. Every log clarifies your plan.`,'complete','normal','BRIEF_FOLLOWUP_ACTIVITY',{daysActive},'review']);
  add('followup',...seedPick(follow,seed+':followup-topic'));
 }
 const journey=coachingInbox(state,now).items.find(c=>!c.expired);
 if(journey&&agreementMayReplaceFollowup(ready,notes.find(n=>n.role==='followup'))){
  const index=notes.findIndex(n=>n.role==='followup');
  const fact=journey.reviewDue?'Your agreed coaching step is due for review. Did it help?':journey.status==='accepted'?'Your coaching agreement is active; scheduled review on '+journey.reviewOn+'.':journey.title;
  const note={role:'followup',key:'coaching-'+journey.status,code:journey.reviewDue?'COACHING_REVIEW_DUE':journey.code||'COACHING_BARRIER_AGREEMENT',params:{caseId:journey.id,reviewOn:journey.reviewOn||null},priority:journey.reviewDue?'attention':'normal',text:fact,action:journey.reviewDue?'Report outcome: helped, not_helped, or not_tried.':journey.step,actionTarget:'feedback',caseId:journey.id};
  if(index>=0)notes[index]=note;else notes.push(note);
 }
 return firstWeekMessages(state,today,notes);
}
