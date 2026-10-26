import {scenarioRuntime} from './scenario-http.mjs';
const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Usage: aged-command-receipts.mjs <completed-year-run> <new-output>');
const runtime=await scenarioRuntime(output,'INTERLEAVED_FULL_VS_MINIMAL_COMMANDS_ON_ISOLATED_365_DAY_HISTORY_COPY',{seedD1From:source}),{client,check,report}=runtime;
const c=client('long-horizon-male');c.day=366;report.samples=[];let error;
const bytes=e=>Buffer.byteLength(JSON.stringify(e.response));
function stats(values){values.sort((a,b)=>a-b);const q=p=>values[Math.floor((values.length-1)*p)];return {n:values.length,p50:q(.5),p95:q(.95),p99:q(.99)};}
try{
 await c.request('GET','state');let revision=c.state.revision;const before=revision,weights=c.state.weights.length,checkins=c.state.checkins.length;
 for(let i=0;i<30;i++)for(const mode of ['full','minimal']){
  const key=`aged-${i}-${mode}`,body={revision,action:'water',payload:{cups:4+i%4}},endpoint=mode==='minimal'?'commands?view=receipt':'commands';
  const e=await c.request('POST',endpoint,body,{key});check('command-success:'+key,e.status===200&&e.response.revision===revision+1);revision=e.response.revision;
  report.samples.push({mode,index:i,latencyMs:e.latencyMs,responseJsonBytes:bytes(e),revision});
  if(mode==='minimal'){
   check('receipt-has-affected-deltas:'+key,e.response.ok===true&&Array.isArray(e.response.affected)&&e.response.affected.length>0&&!('plans' in e.response));
   if(i%6===0){const replay=await c.request('POST',endpoint,body,{key});check('receipt-retry-idempotent:'+key,replay.status===200&&replay.response.revision===revision&&replay.response.commandReceipt.replayed===true);}
  }
 }
 const final=await c.request('GET','state');check('exactly-sixty-mutations',final.response.revision===before+60);
 check('old-health-history-preserved',final.response.weights.length===weights&&final.response.checkins.length===checkins);
 check('one-new-water-date-not-sixty-duplicates',final.response.waterLogs.filter(w=>w.date===final.response.serverDate).length===1);
 report.summary={samples:60,idempotentReplays:5,initialRevision:before,finalRevision:revision,modes:Object.fromEntries(['full','minimal'].map(mode=>{const a=report.samples.filter(s=>s.mode===mode);return [mode,{latencyMs:stats(a.map(s=>s.latencyMs)),responseJsonBytes:stats(a.map(s=>s.responseJsonBytes))}]}))};
 report.limitations.push('The original completed annual D1 is copied before opening a new runtime; this fixture never mutates that original or production.','Thirty interleaved samples per mode under local resource contention do not establish an SLA or mobile-network latency.','Minimal receipts are an existing opt-in API capability; this test does not change default command response compatibility.');
}catch(e){error=e;}
finally{await runtime.finish(error);}
