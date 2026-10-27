import {scenarioRuntime} from './scenario-http.mjs';
import {dateOffset} from '../../coaching-shared.mjs';
const output=process.argv[2];if(!output)throw Error('Supply a new evidence directory');
const runtime=await scenarioRuntime(output,'FIRST_WEEK_MESSAGES_THREE_TRACKS_FOUR_TRAJECTORIES_EIGHT_DAYS');
const {client,check,report}=runtime,start='2026-10-24';let error;
const healthy={sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false};
try{
 for(const track of ['nutrition_only','workouts_only','nutrition_and_workouts'])for(const mode of ['empty','regular','return','agreement']){
  const c=client('week1-'+track+'-'+mode);
  await c.command('generate',{name:'أول أسبوع',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:track,dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true});
  check(c.userId+':persisted-start',c.state.onboarding.journeyStartedOn===start);
  let caseId;
  for(let day=1;day<=8;day++){
   c.day=day;const date=dateOffset(start,day-1),tag=c.userId+':'+day;
   if(day===8&&c.state.active_plan_id)await c.command('renew_plan');
   if(mode==='regular'){
    await c.command('recovery',healthy);await c.command('water',{cups:2});
    if(c.state.active_plan_id){const p=c.state.plans.find(p=>p.id===c.state.active_plan_id);await c.command('food',{date,energy:p.targets.energy,complete:true});}
   }
   if(mode==='return'&&[1,5].includes(day))await c.command('water',{cups:1});
   if(mode==='agreement'&&day===2){
    await c.command('coaching_feedback',{domain:track==='workouts_only'?'training':'nutrition',barrier:'time'});caseId=c.state.coachingCases.at(-1).id;
    await c.command('coaching_decision',{id:caseId,accept:true});
   }
   if(mode==='agreement'&&day===5)await c.command('coaching_outcome',{id:caseId,outcome:'helped'});
   const b=await c.brief(),notes=b.response.notes,follow=notes.find(n=>n.role==='followup');
   check(tag+':brief',b.status===200&&notes.length===(track==='nutrition_and_workouts'?3:2)&&notes.every(n=>! /undefined|NaN/.test(n.text+n.action)));
   check(tag+':single-next-step',notes.filter(n=>n.actionTarget).length<=1);
   const agreement=mode==='agreement'&&day>=2&&day<=4,returned=mode==='return'&&day===5;
   check(tag+':stage-or-priority',day===8?!follow.key.startsWith('first-week'):agreement?follow.key==='coaching-accepted':returned?follow.key==='return':follow.key==='first-week-'+day);
   if(day===7&&mode==='regular')check(tag+':week-summary',follow.text.includes('تسجيلات في 7 من أول ٧ أيام'));
   await c.request('GET','state');const again=await c.brief();
   check(tag+':reload-stability',JSON.stringify(again.response.notes)===JSON.stringify(notes));
   check(tag+':anchor-unchanged',c.state.onboarding.journeyStartedOn===start);
  }
 }
 report.summary={accounts:12,tracks:3,trajectories:4,daysPerAccount:8,accountDays:96,retentionUplift:'NOT_MEASURED'};
}catch(e){error=e;}finally{await runtime.finish(error);}
