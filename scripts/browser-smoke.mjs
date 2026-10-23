import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{'oai-authenticated-user-id':'browser-qa-'+Date.now()}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787/');await page.locator('[data-view="planner"]').click();
 await page.locator('#coach-onboarding-section').waitFor();
 assert.ok((await page.locator('#coach-onboarding-section').innerText()).length>20);
 const r=await context.request.post('http://127.0.0.1:8787/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'تجربة',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5]}}});assert.equal(r.status(),200,await r.text());
 await page.reload();await page.locator('[data-view="planner"]').click();await page.locator('#recovery-log').waitFor();
 for(const [name,value] of Object.entries({sleepHours:5,sleepQuality:2,fatigue:4,stress:4,soreness:3}))await page.locator(`#recovery-log [name="${name}"]`).fill(String(value));
 await page.locator('#recovery-log button').click();await page.getByText('الاستشفاء محتاج اهتمام',{exact:true}).waitFor();
 await page.locator('#review-coach').click();await page.getByRole('button',{name:'موافق على التعديل'}).click();
 await page.locator('#catalog-search input').fill('squat');await page.locator('#catalog-search button').click();await page.locator('#catalog-results details').first().waitFor();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5);assert.equal(overflow,false,'mobile horizontal overflow');assert.deepEqual(errors,[]);
 await page.screenshot({path:'outputs/mobile-coaching.png',fullPage:true});console.log('Browser smoke passed: onboarding, remote generation, recovery, review acceptance, catalog, mobile width, no JS errors.');
}finally{await browser.close();}
