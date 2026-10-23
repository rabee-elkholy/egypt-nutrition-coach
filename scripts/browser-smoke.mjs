import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const origin='http://127.0.0.1:8787',user='browser-qa-'+Date.now();
try{
 const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{'oai-authenticated-user-id':user}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const settled=()=>page.waitForFunction(()=>!document.querySelector('#planner-view[aria-busy=true]'));
 await page.goto(origin);await page.locator('[data-view="planner"]').click();await page.locator('#coach-onboarding-section').waitFor();assert.ok((await page.locator('#coach-onboarding-section').innerText()).length>20);
 const r=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'تجربة',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5]}}});assert.equal(r.status(),200,await r.text());
 await page.reload();await page.locator('[data-view="planner"]').click();await page.locator('#recovery-log').waitFor();
 const planned=page.locator('.planned-food').first();await planned.locator('select').selectOption('0.5');await planned.locator('button').click();await page.getByText('✓ الوجبة متسجلة في يومك',{exact:true}).waitFor();await settled();
 await page.getByText('إضافة وجبة أو مشروب يدويًا',{exact:true}).click();await page.locator('#manual-food [name=name]').fill('قهوة بالحليب');await page.locator('#manual-food [name=energy]').fill('50');await page.locator('#manual-food button').click();await page.locator('.diary-row').filter({hasText:'قهوة بالحليب'}).waitFor();await settled();
 await page.locator('#toggle-complete').click();await page.getByRole('button',{name:'افتح اليوم للتصحيح',exact:true}).waitFor();await settled();
 let account=await (await context.request.get(origin+'/v1/state')).json();assert.equal(account.foodEntries.length,2);assert.equal(account.foodLogs[0].complete,true);
 const alternative=page.locator('[data-meal-alt]').first();await alternative.click();await page.locator('#coach-dialog[open] [data-replace-meal]').first().click();await settled();await page.locator('#coach-feedback').filter({hasText:'اتحفظت'}).waitFor();
 for(const [name,value]of Object.entries({sleepHours:5,sleepQuality:2,fatigue:4,stress:4}))await page.locator(`#recovery-log [name="${name}"]`).fill(String(value));
 await page.getByText('وجع العضلات بعد التمرين حسب المنطقة (0–10)',{exact:true}).click();await page.locator('[name="sore:quadriceps"]').fill('8');await page.locator('#recovery-log button').click();await page.getByText('الاستشفاء محتاج اهتمام',{exact:true}).waitFor();await settled();
 await page.locator('#review-coach').click();await page.getByRole('button',{name:'موافق على التعديل',exact:true}).waitFor();await settled();await page.getByRole('button',{name:'موافق على التعديل',exact:true}).click();await settled();
 await page.locator('details[data-day]').first().locator('summary').first().click();
 let workout=page.locator('.workout-log').first();await workout.locator('textarea').fill('20, 10, 3\n20, 10, 2');if(await workout.locator('[name=bothSides]').count())await workout.locator('[name=bothSides]').check();await workout.locator('button').click();await settled();
 const session=page.locator('.session-log').first();await session.locator('[name=duration]').fill('30');await session.locator('[name=rpe]').fill('7');await session.locator('button').click();await settled();
 account=await (await context.request.get(origin+'/v1/state')).json();assert.equal(account.workoutLogs.length,1);assert.equal(account.sessions[0].status,'partial');assert.ok(account.sessions[0].completionRatio<.8);assert.equal(account.recovery.muscles.quadriceps.status,'caution');assert.equal(account.planRefs.length,2);
 const remaining=await page.locator('details[data-day]').first().locator('.workout-log').count();
 for(let index=1;index<remaining;index++){
  const form=page.locator('details[data-day]').first().locator('.workout-log').nth(index);await form.locator('textarea').fill('20, 10, 3');
  if(await form.locator('[name=bothSides]').count())await form.locator('[name=bothSides]').check();
  await form.locator('button').click();await settled();
 }
 const complete=page.locator('.session-log').first();await complete.locator('[name=duration]').fill('30');await complete.locator('[name=rpe]').fill('7');await complete.locator('button').click();await settled();
 account=await (await context.request.get(origin+'/v1/state')).json();assert.equal(account.sessions[0].status,'completed');assert.ok(account.sessions[0].completionRatio>=.8);
 await page.locator('#catalog-search input').fill('squat');await page.locator('#catalog-search button').click();await page.locator('#catalog-results details').first().waitFor();if(await page.locator('#catalog-next').count()){await page.locator('#catalog-next').click();await page.locator('#catalog-prev').waitFor();}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5),false,'mobile horizontal overflow');assert.deepEqual(errors,[]);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'outputs/mobile-coaching.png'});
 await page.setViewportSize({width:1366,height:900});await page.reload();await page.locator('[data-view="planner"]').click();await page.locator('#recovery-log').waitFor();await page.screenshot({path:'outputs/desktop-coaching.png'});assert.deepEqual(errors,[]);
 console.log('Browser smoke passed: unchanged onboarding, half-portion and manual diary, completion, meal replacement/version, regional recovery, accepted deload, partial/full session coverage, workout logging, catalog pagination, mobile and desktop without JS errors.');
}finally{await browser.close();}
