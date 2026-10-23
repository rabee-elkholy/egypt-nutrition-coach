import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||"msedge"});
try {
 const context=await browser.newContext({extraHTTPHeaders:{'oai-authenticated-user-id':'messages-review-'+Date.now()}});
 const r=await context.request.post('http://127.0.0.1:8787/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'مراجعة',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[0,2,4,6],workoutSplitPreference:'full_body'}}});assert.equal(r.status(),200,await r.text());
 const page=await context.newPage();
 for(const width of [390,1024]){
 await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:8787/#planner');await page.locator('#tips-more').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
 const before=await page.locator('#tips-card').innerText();await page.locator('#tips-more').click();assert.notEqual(await page.locator('#tips-card').innerText(),before);
 assert.equal(await page.locator('[data-personal-role]:visible').count(),3);
 await page.locator('.specialist-brief:visible').screenshot({path:`outputs/brief-${width}.png`});
 await page.locator('[data-tab=review]').click();
 assert.equal(await page.locator('[data-personal-role]:visible').count(),3);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
 await page.screenshot({path:`outputs/review-${width}.png`});
 await page.getByText('تفاصيل أرقامك والتمرين والاستشفاء',{exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
 assert.ok(!/undefined|NaN/.test(await page.locator('.coach-app').innerText()));
 await page.locator('[data-tab=nutrition]').click();
 await page.locator('#tips-card').screenshot({path:`outputs/tips-${width}.png`});
 }
 const account=await (await context.request.get('http://127.0.0.1:8787/v1/state')).json();
 const recovery=await context.request.post('http://127.0.0.1:8787/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:account.revision,action:'recovery',payload:{sleepHours:5,sleepQuality:2,fatigue:4,stress:2,pain:false,illness:false,redFlags:false}}});assert.equal(recovery.status(),200,await recovery.text());
 await page.reload();await page.locator('[data-personal-role=followup]:visible').waitFor();
 assert.match(await page.locator('[data-personal-role=followup]:visible').innerText(),/5 ساعات/);
 assert.match(await page.locator('[data-personal-role=training]:visible').innerText(),/متابعة|استشفاء/);
 const wording=await page.locator('.specialist-brief:visible').innerText();await page.reload();await page.locator('.specialist-brief:visible').waitFor();assert.equal(await page.locator('.specialist-brief:visible').innerText(),wording);
 console.log('Personal messages update with sleep evidence and remain stable on reload; tips rotate; review details work; no overflow at 390/1024px.');
}finally{await browser.close();}

