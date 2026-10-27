import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const origin='http://127.0.0.1:8787';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});

async function waitUntilReady(page,read,label){
 for(let n=0;!read();n++){
  if(n>1000)throw Error(label+' was not captured');
  await page.waitForTimeout(20);
 }
}

try{
 for(const width of [390,1280])for(const lateResponse of ['confirmed','network_error']){
  const context=await browser.newContext({viewport:{width,height:950},extraHTTPHeaders:{'oai-authenticated-user-id':'ownership-'+crypto.randomUUID()}});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  const generation=await context.request.post(origin+'/v1/commands',{
   headers:{'Idempotency-Key':crypto.randomUUID()},
   data:{revision:0,action:'generate',payload:{name:'Ownership',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_only',dietType:'balanced'}}
  });
  assert.equal(generation.status(),200);
  const initial=await generation.json();
  let firstKey,secondKey,releaseFirst,releaseSecond;
  const seen=[];
  await page.route('**/v1/commands',async route=>{
   const request=route.request(),body=request.postDataJSON(),key=request.headers()['idempotency-key'];
   seen.push({action:body.action,key});
   if(body.action!=='water'){await route.continue();return;}
   // The real Worker commits before the transport response is delayed.
   const response=await route.fetch();
   if(!firstKey){
    firstKey=key;
    await new Promise(resolve=>{releaseFirst=resolve;});
    if(lateResponse==='network_error')await route.abort('failed');
    else await route.fulfill({response});
   }else if(key===firstKey)await route.fulfill({response});
   else{
    secondKey=key;
    await new Promise(resolve=>{releaseSecond=resolve;});
    await route.fulfill({response});
   }
  });
  await page.goto(origin+'/#planner');
  await page.locator('[data-water-add="1"]').click();
  await waitUntilReady(page,()=>releaseFirst,'First write');
  await page.evaluate(async()=>{
   const {mountPlanner}=await import('/coaching-ui.mjs');
   await mountPlanner({root:document.querySelector('#planner-view'),toast:()=>{}});
  });
  const retry=page.locator('#retry-uncertain-write');
  await retry.waitFor();
  assert.equal(await page.locator('#planner-view').getAttribute('aria-busy'),null,'A new mount owns its busy state');
  // A normal click proves that the retry is visible and not blocked by old busy CSS.
  await retry.click();
  await page.waitForFunction(()=>document.querySelector('#planner-view')._coachSession.uncertainWrite===null);
  await page.locator('[data-water-add="2"]').click();
  await waitUntilReady(page,()=>releaseSecond,'Second write');
  assert.equal(await page.evaluate(()=>document.querySelector('#planner-view')._coachSession.uncertainWrite.key),secondKey);
  const firstFinished=page.waitForEvent(lateResponse==='network_error'?'requestfailed':'requestfinished',{
   predicate:request=>request.headers()['idempotency-key']===firstKey
  });
  releaseFirst();
  await firstFinished;
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.querySelector('#planner-view')._coachSession.uncertainWrite?.key),secondKey,
   'A late confirmation of A must not clear pending write B');
  assert.equal(await page.locator('#planner-view').getAttribute('aria-busy'),'true');
  releaseSecond();
  await page.waitForFunction(()=>document.querySelector('#planner-view')._coachSession.uncertainWrite===null);
  const final=await(await context.request.get(origin+'/v1/state')).json();
  assert.equal(final.revision,initial.revision+2);
  assert.equal(final.waterLogs[0].cups,3);
  assert.equal(seen.filter(item=>item.key===firstKey).length,2);
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5),false);
  await context.close();
  console.log('PASS '+width+' '+lateResponse+': late response after remount cannot clear a newer pending write; retries commit once.');
 }
}finally{await browser.close();}
