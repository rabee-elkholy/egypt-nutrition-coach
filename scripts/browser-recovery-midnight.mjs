import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {Miniflare} from 'miniflare';
import {migrateLocal} from './local-migrations.mjs';
import {dateOffset} from '../coaching-shared.mjs';

const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],assets:{directory:'dist/client',binding:'ASSETS',routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true}},port:8798,host:'127.0.0.1'});
let browser;
try{
 await migrateLocal(await mf.getD1Database('DB'));
 const origin=String(await mf.ready).replace(/\/$/,'');
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 for(const width of [390,1280])for(const kind of (process.env.QUALITY_DRAFT_KIND?[process.env.QUALITY_DRAFT_KIND]:['recovery','weight']))for(const decision of ['save','start_today']){
  const context=await browser.newContext({viewport:{width,height:950},extraHTTPHeaders:{'oai-authenticated-user-id':'midnight-'+crypto.randomUUID()}}),page=await context.newPage();
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Optional frozen UI replay preserves failing evidence without reverting the working tree.
  if(process.env.QUALITY_BROWSER_REFERENCE)for(const file of ['coaching-ui.mjs','coaching-followup-view.mjs','coaching-drafts.mjs','coaching-training-view.mjs']){
   await page.route('**/'+file,route=>route.fulfill({contentType:'text/javascript',body:readFileSync(path.join(process.env.QUALITY_BROWSER_REFERENCE,file),'utf8')}));
  }
  const generated=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'Midnight',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'workouts_only',selectedWorkoutDays:[1,3,5],healthConfirmed:true}}});
  assert.equal(generated.status(),200);
  let snapshot=await generated.json();
  const oldDate=snapshot.serverDate,newDate=dateOffset(oldDate,1),writes=[],formId=kind+'-log';
  // The UI clock boundary is controlled. Generation and writes still use real Worker/D1.
  await page.route('**/v1/state',route=>route.fulfill({json:snapshot}));
  await page.route('**/v1/bootstrap',route=>route.fulfill({json:{revision:snapshot.revision,serverDate:snapshot.serverDate,serverNow:snapshot.serverNow}}));
  await page.route('**/v1/commands',async route=>{
   writes.push(route.request().postDataJSON());
   const response=await route.fetch();assert.equal(response.status(),200);
   snapshot={...await response.json(),serverDate:newDate,serverNow:newDate+'T12:00:00Z'};
   await route.fulfill({json:snapshot});
  });
  await page.goto(origin+'/#planner');
  await page.locator('[data-tab="recovery"]').click();
  if(kind==='recovery'){
   await page.locator('#recovery-log [data-sleep="5"]').click();
   await page.locator('#recovery-log [data-fatigue="4"]').click();
  }
  else{await page.locator('#weight-log [name="kg"]').fill('80.4');await page.locator('#weight-log [name="kg"]').blur();}
  await page.evaluate(()=>{
   window.__midnightRendered=false;
   const observer=new MutationObserver(()=>{window.__midnightRendered=true;observer.disconnect();});
   observer.observe(document.querySelector('#planner-view'),{childList:true});
  });
  snapshot={...snapshot,serverDate:newDate,serverNow:newDate+'T12:00:00Z'};
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>window.__midnightRendered);
  const form=page.locator('#'+formId),value=kind==='recovery'?'sleepHours':'kg',expected=kind==='recovery'?'5':'80.4';
  assert.equal(await form.locator('[name="'+value+'"]').inputValue(),expected,'An edited draft must remain accessible after midnight');
  assert.equal(await form.locator('[name="date"]').inputValue(),oldDate,'The retained draft must keep its original date');
  if(kind==='recovery'){
   assert.equal(await form.locator('.sleep-preset.active-chip').getAttribute('data-sleep'),'5');
   assert.equal(await form.locator('.energy-preset.active-chip').getAttribute('data-fatigue'),'4');
  }
  assert.match(await form.locator('h3').innerText(),new RegExp(oldDate),'The visible date must agree with the submitted date');
  await form.locator('#'+kind+'-draft-day').waitFor();
  if(decision==='save'){
   await form.locator(kind==='recovery'?'button[type="submit"]':'button:not([type])').click();
   await page.waitForFunction(({id,date})=>document.querySelector('#'+id+' [name="date"]')?.value===date,{id:formId,date:newDate});
   assert.equal(writes.length,1);assert.equal(writes[0].payload.date,oldDate);assert.equal(writes[0].payload[value],expected);
   const persisted=await(await context.request.get(origin+'/v1/state')).json(),records=kind==='recovery'?persisted.checkins:persisted.weights;
   assert.equal(records.length,1);assert.equal(records[0].date,oldDate);assert.equal(records[0][value],Number(expected));
  }else{
   await form.locator('[data-start-draft]').click();
   assert.equal(await page.locator('#'+formId+' [name="date"]').inputValue(),newDate);
   assert.equal(writes.length,0,'Discarding an old draft must not create a log');
  }
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5),false);
  await context.close();console.log('PASS '+width+' '+kind+' '+decision+': edited draft stays visible and correctly dated across midnight.');
 }
}finally{await browser?.close();await mf.dispose();}
