import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'}),origin='http://127.0.0.1:8787';
try{
 const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{'oai-authenticated-user-id':'browser-smoke-'+Date.now()}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 const read=async()=>await(await context.request.get(origin+'/v1/state')).json();
 const settled=()=>page.waitForFunction(()=>!document.querySelector('#planner-view[aria-busy=true]'));
 await page.goto(origin+'/#planner');await page.locator('#coach-onboarding-section').waitFor();
 const initial=await read(),weekday=new Date(initial.serverDate+'T12:00:00Z').getUTCDay();
 const r=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'تجربة',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[weekday]}}});assert.equal(r.status(),200,await r.text());
 await page.reload();await page.locator('.planned-food').first().waitFor();
 await page.locator('.planned-food').first().locator('select').selectOption('0.5');await page.locator('.planned-food').first().locator('button').click();await settled();
 await page.locator('#food-diary details > summary').click();await page.locator('#manual-food [name=name]').fill('قهوة بالحليب');await page.locator('#manual-food [name=energy]').fill('50');await page.locator('#manual-food button').click();await settled();
 await page.locator('#toggle-complete').click();await page.getByRole('button',{name:'إعادة فتح اليوم للتعديل',exact:true}).waitFor();await settled();
 let account=await read();assert.equal(account.foodEntries.length,2);assert.equal(account.foodEntries[0].quantity,.5);assert.equal(account.foodLogs[0].complete,true);
 await page.locator('[data-meal-alt]').first().click();await page.locator('#coach-dialog[open] [data-replace-meal]').first().click();await settled();assert.equal((await read()).planRefs.length,2);
 await page.locator('[data-tab=recovery]').click();await page.locator('.sleep-preset[data-sleep="5"]').click();await page.locator('.energy-preset[data-fatigue="4"]').click();await page.locator('#recovery-log details > summary').click();await page.locator('[name="sore:quadriceps"]').fill('8');await page.locator('#recovery-log > button').click();await settled();
 assert.equal((await read()).recovery.status,'high');
 await page.locator('[data-tab=review]').click();await page.locator('#review-coach').click();await settled();await page.locator('[data-accept=true]').first().click();await settled();assert.ok((await read()).sessionAdjustment);
 await page.locator('[data-tab=workout]').click();
 const fillWorkout=async index=>{const form=page.locator('.workout-log').nth(index);const count=await form.locator('[name^=set_reps_]').count();for(let i=0;i<count;i++){await form.locator(`[name=set_reps_${i}]`).fill('10');}await form.locator('button[type=submit]').click();await settled();};
 await fillWorkout(0);account=await read();assert.equal(account.workoutLogs.length,1);assert.equal(account.sessions[0].status,'partial');assert.equal(account.sessions[0].rpe,null);assert.equal(account.sessions[0].duration,null);
 const remaining=await page.locator('.workout-log').count();for(let i=1;i<remaining;i++)await fillWorkout(i);
 account=await read();assert.equal(account.sessions[0].status,'completed');assert.ok(account.sessions[0].completionRatio>=.8);
 await page.locator('[data-tab=catalog]').click();await page.locator('#catalog-search input').fill('squat');await page.locator('#catalog-search button').click();await page.locator('#catalog-results details').first().waitFor();if(await page.locator('#catalog-next').count()){await page.locator('#catalog-next').click();await page.locator('#catalog-prev').waitFor();}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:'outputs/mobile-coaching.png'});await page.setViewportSize({width:1366,height:900});await page.reload();await page.locator('.coach-app').waitFor();await page.screenshot({path:'outputs/desktop-coaching.png'});assert.deepEqual(errors,[]);
 await context.close();console.log('Browser smoke passed: diary portions/confirmation, medically filtered alternatives, recovery/deload, partial/full training coverage, unknown session metrics, catalog pagination, desktop/mobile.');
}finally{await browser.close();}
