import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {dateOffset} from '../coaching-shared.mjs';
const browser=await chromium.launch({headless:true}),origin='http://127.0.0.1:8787';
try{
 const context=await browser.newContext({viewport:{width:1280,height:950},extraHTTPHeaders:{'oai-authenticated-user-id':'browser-simulation-'+Date.now()}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 const read=async()=>await (await context.request.get(origin+'/v1/state?simulation=1')).json();
 const settled=()=>page.waitForFunction(()=>!document.querySelector('#planner-view[aria-busy=true]'));
 await page.goto(origin);await page.locator('[data-view=planner]').click();await page.locator('#enter-simulation').click();await page.locator('#simulation-start-sample').click();await page.locator('#simulation-next').waitFor();await settled();
 let s=await read();const firstDate=s.serverDate;assert.equal(s.simulation.day,1);
 await page.locator('#food-diary details > summary').click();await page.locator('#manual-food [name=name]').fill('تسجيل يدوي في المحاكاة');await page.locator('#manual-food [name=energy]').fill('150');await page.locator('#manual-food button').click();await settled();
 await page.locator('[data-tab=recovery]').click();await page.locator('#weight-log [name=kg]').fill('80');await page.locator('#weight-log button').click();await settled();
 await page.locator('[data-tab=nutrition]').click();await page.locator('#simulation-next').click();await settled();s=await read();assert.equal(s.simulation.day,2);assert.equal(s.serverDate,dateOffset(firstDate,1));assert.equal(s.simulation.history[0].energy,150);assert.equal(s.simulation.history[0].foodComplete,false);assert.equal(await page.locator('#diary-date').inputValue(),s.serverDate);
 await page.reload();await page.locator('[data-view=planner]').click();await page.locator('#simulation-panel').waitFor();assert.equal((await read()).simulation.day,2);
 for(let day=2;day<=14;day++){
  await page.locator(`[data-quick-scenario=${day===3?'poor_recovery':'plateau'}]`).click();await settled();
  s=await read();assert.equal(s.simulation.day,day);assert.equal(s.weights.length,day);if(day===3)assert.equal(s.lastReview.recovery,'high');
  if(day<14){await page.locator('[data-tab=nutrition]').click();await page.locator('#simulation-next').click();await settled();}
 }
 const proposal=s.adaptations.find(a=>a.status==='pending'&&a.kind==='calories');assert.ok(proposal,'plateau generates an actual calorie proposal');const previousEnergy=s.plans.find(p=>p.id===s.active_plan_id).targets.energy;
 await page.locator(`[data-adapt="${proposal.id}"][data-accept=true]`).click();await settled();await page.locator('[data-tab=nutrition]').click();await page.locator('#simulation-next').click();await settled();s=await read();assert.equal(s.simulation.day,15);assert.ok(s.plans.find(p=>p.id===s.active_plan_id).targets.energy<previousEnergy);assert.ok(s.simulation.history[13].changes.length);
 await page.locator('#simulation-panel').screenshot({path:'outputs/simulation-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#simulation-panel').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#simulation-panel').screenshot({path:'outputs/simulation-mobile.png'});
 await page.locator('#leave-simulation').click();await page.locator('#coach-onboarding-section').waitFor();const actual=await (await context.request.get(origin+'/v1/state')).json();assert.equal(actual.profile,null);assert.equal(actual.revision,0);assert.equal(actual.foodEntries.length,0);
 await page.locator('#enter-simulation').click();await page.locator('#simulation-next').waitFor();assert.equal((await read()).simulation.day,15);
 page.once('dialog',dialog=>dialog.accept());await page.locator('#simulation-reset').click();await settled();s=await read();assert.equal(s.simulation.day,1);assert.equal(s.foodEntries.length,0);assert.equal(s.simulation.history.length,0);assert.deepEqual(errors,[]);
 console.log('Browser simulation passed: original onboarding entry, manual logs, next-day dates, reload persistence, 15 days, poor recovery, real plateau proposal/acceptance, weekly renewal, decision history, mobile layout, isolation, resume and reset.');
 await context.close();
}finally{await browser.close();}
