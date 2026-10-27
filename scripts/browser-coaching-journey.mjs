import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const origin=process.env.COACH_ORIGIN||'http://127.0.0.1:8787';
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:950},extraHTTPHeaders:{'oai-authenticated-user-id':'journey-browser-'+crypto.randomUUID()}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const read=async()=>await(await context.request.get(origin+'/v1/state')).json();
  const send=async(action,payload)=>{const s=await read();const r=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:s.revision,action,payload}});assert.equal(r.status(),200,await r.text());return r.json();};
  await send('generate',{name:'Journey Browser',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true});
  await page.goto(origin+'/#planner');await page.locator('[data-tab="review"]').click();
  const form=page.locator('[data-coaching-feedback="nutrition"]');
  await form.locator('[name="barrier"]').selectOption('time');await form.locator('[name="hunger"]').fill('4');await form.locator('button').click();
  await page.locator('[data-coaching-decision="true"]').waitFor();
  let s=await read();assert.equal(s.coachingFeedback[0].hunger,4);const id=s.coachingCases[0].id;
  await page.locator('[data-coaching-decision="true"]').click();
  await page.getByText('متفقين نراجع يوم',{exact:false}).waitFor();
  s=await read();assert.equal(s.coachingCases[0].status,'accepted');
  await page.reload();await page.locator('[data-tab="review"]').click();await page.getByText('متفقين نراجع يوم',{exact:false}).waitFor();
  await send('coaching_outcome',{id,outcome:'not_tried'});
  await page.reload();await page.locator('[data-tab="review"]').click();await page.getByRole('heading',{name:'الخطوة لم تتجرب؛ نختار حاجة أسهل؟'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`outputs/coaching-journey-${width}.png`});await context.close();
 }
 console.log('Coaching journey: feedback, acceptance, persisted reload, outcome follow-up and mobile/desktop passed.');
}finally{await browser.close();}
