import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),origin='http://127.0.0.1:8787';
async function setup(suffix){
 const context=await browser.newContext({viewport:{width:1280,height:900},extraHTTPHeaders:{'oai-authenticated-user-id':'audit-browser-'+suffix+'-'+Date.now()}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const generation=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'مراجعة',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5]}}});assert.equal(generation.status(),200,await generation.text());
 await page.goto(origin);await page.locator('[data-view="planner"]').click();await page.locator('#weight-log').waitFor({state:'attached'});
 return {page,context,errors,settled:()=>page.waitForFunction(()=>!document.querySelector('#planner-view[aria-busy=true]'))};
}
try{
 {
  const {page,context,errors,settled}=await setup('drafts');
  await page.locator('#food-diary details > summary').click();await page.locator('#manual-food [name=name]').fill('مسودة محفوظة');await page.locator('#manual-food [name=energy]').fill('80');
  await page.locator('[data-tab=workout]').click();await page.locator('.workout-log [name=set_kg_0]').first().fill('17.5');
  await page.locator('[data-tab=recovery]').click();
  await page.locator('#weight-log [name=kg]').fill('79.5');await page.locator('#weight-log button').click();await settled();
  assert.equal(await page.locator('#manual-food [name=name]').inputValue(),'مسودة محفوظة');assert.equal(await page.locator('.workout-log [name=set_kg_0]').first().inputValue(),'17.5');
  await page.locator('[data-tab=nutrition]').click();await page.locator('#food-diary details > summary').click();
  const today=await page.locator('#diary-date').inputValue(),previous=new Date(today+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
  await page.locator('#diary-date').fill(previous.toISOString().slice(0,10));assert.equal(await page.locator('#manual-food [name=name]').inputValue(),'');
  await page.locator('#food-diary details > summary').click();await page.locator('#diary-date').fill(today);assert.equal(await page.locator('#manual-food [name=name]').inputValue(),'مسودة محفوظة');
  const catalog=await (await context.request.get(origin+'/v1/exercises?q=squat')).json(),base=catalog.items[0];
  let releaseSlow,seenSlow;const slowSeen=new Promise(resolve=>seenSlow=resolve),slowGate=new Promise(resolve=>releaseSlow=resolve);
  await page.route('**/v1/exercises?*',async route=>{const q=new URL(route.request().url()).searchParams.get('q');if(q==='slow'){seenSlow();await slowGate;}await route.fulfill({contentType:'application/json',body:JSON.stringify({total:1,items:[{...base,name:q==='slow'?'Slow result':'Fast result'}],nextOffset:null})});});
  await page.locator('[data-tab=catalog]').click();await page.locator('#catalog-search input').fill('slow');await page.locator('#catalog-search button').click();await slowSeen;
  await page.locator('#catalog-search input').fill('fast');await page.locator('#catalog-search button').click();await page.getByText('Fast result',{exact:true}).waitFor();
  const response=page.waitForResponse(r=>new URL(r.url()).searchParams.get('q')==='slow');releaseSlow();await (await response).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.ok((await page.locator('#catalog-results').innerText()).includes('Fast result'));assert.ok(!(await page.locator('#catalog-results').innerText()).includes('Slow result'));
  let releaseAfter,seenAfter;const afterSeen=new Promise(resolve=>seenAfter=resolve),afterGate=new Promise(resolve=>releaseAfter=resolve);await page.unroute('**/v1/exercises?*');
  await page.route('**/v1/exercises?*',async route=>{seenAfter();await afterGate;await route.fulfill({contentType:'application/json',body:JSON.stringify({total:1,items:[base],nextOffset:null})});});
  await page.locator('#catalog-search button').click();await afterSeen;await page.locator('[data-tab=nutrition]').click();await page.locator('#edit-profile').click();await page.locator('#coach-onboarding-section').waitFor();const afterResponse=page.waitForResponse(r=>r.url().includes('/v1/exercises?'));releaseAfter();await (await afterResponse).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(errors,[]);
  await context.close();
 }
 {
  const {page,context,errors,settled}=await setup('uncertain');
  await page.locator('#food-diary details > summary').click();await page.locator('#manual-food [name=name]').fill('قهوة واحدة');await page.locator('#manual-food [name=energy]').fill('50');
  let lost=0;await page.route('**/v1/commands',async route=>{await route.fetch();lost++;await route.abort('connectionreset');});
  await page.locator('#manual-food button').click();await page.locator('#retry-uncertain-write').waitFor();await settled();assert.equal(lost,2);
  let s=await (await context.request.get(origin+'/v1/state')).json();assert.equal(s.foodEntries.length,1);
  await page.locator('[data-tab=recovery]').click();await page.locator('#weight-log [name=kg]').fill('79');await page.locator('#weight-log button').click();await page.locator('#retry-uncertain-write').waitFor();s=await (await context.request.get(origin+'/v1/state')).json();assert.equal(s.weights.length,0);
  await page.unroute('**/v1/commands');await page.locator('#retry-uncertain-write').click();await page.locator('.diary-row').filter({hasText:'قهوة واحدة'}).waitFor({state:'attached'});await settled();
  s=await (await context.request.get(origin+'/v1/state')).json();assert.equal(s.foodEntries.length,1);assert.equal(await page.locator('#manual-food [name=name]').inputValue(),'');assert.equal(await page.locator('#weight-log [name=kg]').inputValue(),'79');assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('Browser audit passed: unsubmitted drafts, date isolation, out-of-order searches, stale response after navigation, two lost post-commit responses, safe same-key retry, and blocked unrelated writes while uncertain.');
}finally{await browser.close();}
