import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})}),origin='http://127.0.0.1:8787';
try{
 const context=await browser.newContext({viewport:{width:390,height:950},extraHTTPHeaders:{'oai-authenticated-user-id':'lifecycle-'+crypto.randomUUID()}});
 await context.addInitScript(()=>{
  const tracked=new Map(),timers=new Set();
  for(const [target,prefix,types]of [[window,'window',['hashchange','planner-leave','focus']],[document,'document',['visibilitychange']]]){
   const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);
   target.addEventListener=(type,fn,options)=>{if(types.includes(type)){const k=prefix+':'+type;if(!tracked.has(k))tracked.set(k,new Set());tracked.get(k).add(fn);}return add(type,fn,options);};
   target.removeEventListener=(type,fn,options)=>{tracked.get(prefix+':'+type)?.delete(fn);return remove(type,fn,options);};
  }
  const start=window.setInterval.bind(window),stop=window.clearInterval.bind(window);
  window.setInterval=(fn,ms,...args)=>{const id=start(fn,ms,...args);if(ms===60000)timers.add(id);return id;};window.clearInterval=id=>{timers.delete(id);return stop(id);};
  window.__lifecycleStats=()=>({listeners:Object.fromEntries([...tracked].map(([k,v])=>[k,v.size])),timers:timers.size});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 const r=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'Lifecycle',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true}}});assert.equal(r.status(),200,await r.text());
 const navigation=await page.goto(origin+'/#planner');assert.equal(navigation.status(),200);try{await page.locator('#manual-food').waitFor({state:'attached'});}catch(error){console.log(JSON.stringify({errors,planner:await page.locator('#planner-view').innerText()}));throw error;}
 const baseline=await page.evaluate(()=>window.__lifecycleStats());assert.equal(baseline.timers,1);
 await page.locator('#manual-food [name=name]').evaluate(el=>el.value='مسودة محفوظة');
 await page.evaluate(async()=>{const {mountPlanner}=await import('/coaching-ui.mjs');for(let i=0;i<50;i++)await mountPlanner({root:document.querySelector('#planner-view'),toast:()=>{}});});
 assert.deepEqual(await page.evaluate(()=>window.__lifecycleStats()),baseline);assert.equal(await page.locator('#manual-food [name=name]').inputValue(),'مسودة محفوظة');
 for(let i=0;i<50;i++){await page.evaluate(()=>location.hash='foods');await page.waitForFunction(()=>window.__lifecycleStats().timers===0);await page.evaluate(()=>location.hash='planner');await page.waitForFunction(()=>window.__lifecycleStats().timers===1);}
 assert.deepEqual(await page.evaluate(()=>window.__lifecycleStats()),baseline);
 await page.evaluate(()=>{const root=document.querySelector('#planner-view');root._coachRefreshCleanup();root._coachRefreshCleanup();});assert.equal((await page.evaluate(()=>window.__lifecycleStats())).timers,0);assert.deepEqual(errors,[]);
 console.log('Page lifecycle passed: 50 mounts, stable listeners, one timer, navigation pause/resume, draft retention and idempotent cleanup.');
}finally{await browser.close();}
