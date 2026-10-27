import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})}),origin='http://127.0.0.1:8787';
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:950},extraHTTPHeaders:{'oai-authenticated-user-id':'release-011-'+width+'-'+Date.now()}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const read=async()=>await(await context.request.get(origin+'/v1/state')).json();
  const response=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'تجربة',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[0,2,4]}}});assert.equal(response.status(),200,await response.text());
  await page.goto(origin+'/#planner');await page.locator('#food-diary').waitFor();
  await page.locator('#food-diary details > summary').click();
  await page.locator('#manual-food [name=name]').fill('وجبة اختبار');await page.locator('#manual-food [name=energy]').fill('2400');await page.locator('#manual-food button').click();
  await page.getByRole('button',{name:'✅ أؤكد إني سجلت كل أكلي النهارده',exact:true}).waitFor();
  let s=await read();assert.equal(s.foodLogs[0].complete,false);
  await page.locator('#toggle-complete').click();await page.getByRole('button',{name:'إعادة فتح اليوم للتعديل',exact:true}).waitFor();
  s=await read();assert.equal(s.foodLogs[0].complete,true);assert.ok(s.foodLogs[0].confirmedAt);
  await page.reload();await page.getByRole('button',{name:'إعادة فتح اليوم للتعديل',exact:true}).waitFor();
  await page.locator('[data-delete-food]').first().click();await page.waitForFunction(()=>!document.querySelector('[data-delete-food]'));
  s=await read();assert.equal(s.foodLogs[0].complete,false);assert.equal(s.foodLogs[0].confirmedAt,null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`outputs/release-011-${width}.png`});await context.close();
 }
 console.log('0.11 mobile/desktop: manual intake, explicit confirmation, reload, deletion, no overflow or JS errors passed.');
}finally{await browser.close();}
