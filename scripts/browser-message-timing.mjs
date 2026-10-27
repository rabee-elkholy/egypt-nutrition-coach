import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {migrateLocal} from './local-migrations.mjs';
import {dateOffset} from '../coaching-shared.mjs';
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],assets:{directory:'dist/client',binding:'ASSETS',routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true}},port:8796,host:'127.0.0.1'});
let browser;
const results=[];
try{
 await migrateLocal(await mf.getD1Database('DB'));const origin=String(await mf.ready).replace(/\/$/,'');
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:950},extraHTTPHeaders:{'oai-authenticated-user-id':'timing-'+crypto.randomUUID()}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'Timing',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true}}});
  assert.equal(response.status(),200,await response.text());const initial=await response.json();
  // UI boundary injection only: real generated state, controlled later server snapshots.
  let snapshot=structuredClone(initial),reads=0;
  await page.route('**/v1/state',async route=>{reads++;await route.fulfill({json:snapshot});});
  await page.route('**/v1/bootstrap',async route=>route.fulfill({json:{revision:snapshot.revision,serverDate:snapshot.serverDate,serverNow:snapshot.serverNow}}));
  await page.clock.install();await page.goto(origin+'/#planner');await page.locator('[data-personal-role]:visible').first().waitFor();
  const oldDate=initial.serverDate,newDate=dateOffset(oldDate,10);
  snapshot.serverDate=newDate;snapshot.serverNow=newDate+'T12:00:00Z';
  snapshot.adaptations=[{id:'expired-test',kind:'calories',status:'pending',reason:'expired recommendation',delta:-100,expiresAt:initial.serverNow}];
  await page.clock.fastForward(60001);
  await page.getByText('خطة الأكل السابقة انتهت.',{exact:false}).first().waitFor();
  assert.equal(await page.getByRole('heading',{name:/وجبات النهاردة/}).count(),0);
  assert.equal(await page.locator('[data-adapt="expired-test"]').count(),0);
  assert.ok(reads>=2);results.push({width,check:'visible timer refresh, expired plan never labelled today',passed:true});
  await page.locator('[data-tab="review"]').click();
  const form=page.locator('[data-coaching-feedback="nutrition"]');await form.locator('[name="hunger"]').fill('4');
  const count=reads;await page.clock.fastForward(60001);assert.equal(reads,count);assert.equal(await form.locator('[name="hunger"]').inputValue(),'4');
  snapshot.revision++;
  snapshot.serverDate=dateOffset(newDate,1);snapshot.serverNow=snapshot.serverDate+'T12:00:00Z';
  await form.locator('[name="hunger"]').blur();await page.clock.fastForward(60001);
  await page.locator('.specialist-brief:visible').getByText(snapshot.serverDate,{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-coaching-feedback="nutrition"] [name="hunger"]')?.value==='4');
  assert.ok(reads>count);results.push({width,check:'editing defers refresh and draft survives subsequent refresh',passed:true});
  snapshot.workoutLogs=[{date:oldDate,at:initial.serverNow,planId:initial.workoutPlan.id,exerciseId:initial.workoutPlan.days[0].exercises[0].id,sets:[{reps:10,rir:2,kg:10}]}];
  snapshot.revision++;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByText('آخر تمرينة مسجلة بتاريخ '+oldDate,{exact:false}).waitFor({state:'attached'});
  await page.getByText('تفاصيل أرقامك والتمرين والاستشفاء',{exact:true}).click();
  assert.match(await page.locator('#coach-review').innerText(),new RegExp(oldDate));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5),false);assert.deepEqual(errors,[]);
  results.push({width,check:'return focus refresh, old workout dated, no browser errors or overflow',passed:true});
  await context.close();
 }
 mkdirSync('outputs/audit/message-timing-20261027',{recursive:true});writeFileSync('outputs/audit/message-timing-20261027/browser.json',JSON.stringify({scope:'isolated Worker generation; controlled state snapshots for UI time boundaries',results},null,2));
 console.log(JSON.stringify({passed:true,checks:results.length,viewports:[390,1280]}));
}finally{await browser?.close();await mf.dispose();}
