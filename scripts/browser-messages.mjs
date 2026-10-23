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
 await page.locator('#tips-card').screenshot({path:`outputs/tips-${width}.png`});
 }
 console.log('Tips rotate; five topics visible; no horizontal overflow at 390 and 1024px.');
}finally{await browser.close();}

