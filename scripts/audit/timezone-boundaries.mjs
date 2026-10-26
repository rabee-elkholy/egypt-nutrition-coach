import {scenarioRuntime} from './scenario-http.mjs';
import {dateOffset} from '../../coaching-shared.mjs';
const output=process.argv[2];if(!output)throw Error('Usage: timezone-boundaries.mjs <new-output>');
const runtime=await scenarioRuntime(output,'SIX_TIMEZONES_AROUND_MIDNIGHT_AND_CLOCK_TRANSITION_HTTP_BOUNDARIES'),{client,check,report}=runtime;
const zones=['Africa/Cairo','Asia/Riyadh','Asia/Amman','Africa/Casablanca','UTC','America/New_York'];
// UTC instants deliberately span local midnight and a clock-transition period.
// Expected local dates come from Intl's IANA rules, not hard-coded offsets.
const clocks=['2026-10-29T20:30:00Z','2026-10-29T21:30:00Z','2026-10-29T22:30:00Z','2026-10-30T00:30:00Z','2026-10-30T22:30:00Z'];
report.cases=[];let error;
const draft={name:'Timezone boundary',age:30,weight:80,height:175,sex:'male',goal:'maintain',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
try{
 for(const zone of zones){
  const c=client('clock-'+zone.replaceAll('/','-'));let now=Date.parse(clocks[0]);
  await c.command('generate',{...draft,timezone:zone},{now});
  for(const time of clocks){
   now=Date.parse(time);const date=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
   const read=await c.request('GET','state',null,{now}),before=c.state.revision,brief=await c.request('GET','coaching/brief',null,{now});
   report.cases.push({zone,utc:time,expectedLocalDate:date,stateDate:read.response.serverDate,briefDate:brief.response.date});
   check(zone+':'+time+':local-dates',read.status===200&&read.response.serverDate===date&&brief.response.date===date&&brief.response.timezone===zone);
   check(zone+':'+time+':reads-do-not-mutate',brief.response.revision===before);
   await c.command('water',{date,cups:4},{now});
   const invalid=await c.command('weight',{date:dateOffset(date,1),kg:80},{now,allowFailure:true}),reload=await c.request('GET','state',null,{now});
   check(zone+':'+time+':future-log-rejected-without-revision',invalid.status===400&&reload.response.revision===before+1&&!reload.response.weights.some(w=>w.date>date));
  }
  // Moving between timezones preserves historical log dates and is explicit.
  const logs=JSON.stringify(c.state.waterLogs.map(w=>({date:w.date,cups:w.cups}))),to=zone==='UTC'?'Asia/Riyadh':'UTC';
  await c.command('timezone',{timezone:to},{now});const reload=await c.request('GET','state',null,{now});
  check(zone+':timezone-change-preserves-log-dates',reload.response.profile.timezone===to&&JSON.stringify(reload.response.waterLogs.map(w=>({date:w.date,cups:w.cups})))===logs);
 }
 report.summary={timezones:zones.length,utcInstants:clocks.length,boundaryCases:report.cases.length};
 report.limitations.push('Tests server-side IANA date handling and explicit timezone changes. It does not test phone OS clocks or scheduled notification quiet hours.');
}catch(e){error=e;}
finally{await runtime.finish(error);}
