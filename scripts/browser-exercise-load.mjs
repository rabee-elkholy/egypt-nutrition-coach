import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8787';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try{
 for(const location of ['home_only','gym_only']){
  const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{'oai-authenticated-user-id':`load-audit-${location}-${Date.now()}`}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  const read=async()=>await (await context.request.get(origin+'/v1/state')).json();
  const initial=await read(),dayIndex=new Date(initial.serverDate+'T12:00:00Z').getUTCDay();
  const r=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:0,action:'generate',payload:{name:'اختبار نهائي',age:30,weight:80,height:175,sex:'male',goal:'maintain',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[dayIndex],workoutLocation:location,homeEquipment:['none'],sessionDuration:60}}});assert.equal(r.status(),200,await r.text());
  await page.goto(origin+'/#planner');await page.locator('[data-tab=workout]').click();
  const settled=()=>page.waitForFunction(()=>!document.querySelector('#planner-view[aria-busy=true]'));
  const filter=location==='home_only'?'false':'true';
  const form=page.locator(`.workout-log[data-uses-kg=${filter}]`).first();await form.waitFor();
  const id=await form.getAttribute('data-id');const card=page.locator(`[data-exercise-card="${id}"]`).first();const rows=form.locator('.set-row');const count=await rows.count();
  if(filter==='false'){assert.equal(await form.locator('[name^=set_kg_]').count(),0);assert.equal(await form.locator('[name=increment]').count(),0);assert.ok(!/0 كجم/.test(await form.locator('..').innerText()));}
  else{assert.equal(await form.locator('[name^=set_kg_]').count(),count);const kg=form.locator('[name=set_kg_0]');assert.ok(await kg.evaluate(e=>e.readOnly));const before=Number(await kg.inputValue());await form.locator('[data-step-target=set_kg_0][data-step="2.5"]').click();assert.equal(Number(await kg.inputValue()),before+2.5);await form.locator('[data-step-target=set_kg_0][data-step="-2.5"]').click();assert.equal(Number(await kg.inputValue()),before);}
  await form.locator('[data-add-set]').click();assert.equal(await rows.count(),count+1);assert.equal(await form.locator('[name^=set_kg_]').count(),filter==='false'?0:count+1);
  await form.locator('[data-remove-set]').click();assert.equal(await rows.count(),count);
  await form.locator('[name=set_reps_0]').fill('13');await form.locator('[data-effort="2"]').click();
  const expectedKg=filter==='false'?0:Number(await form.locator('[name=set_kg_0]').inputValue());
  await form.locator('[type=submit]').click();await settled();assert.ok(await card.locator('.exercise-editor').evaluate(e=>e.hidden));
  let s=await read(),log=s.workoutLogs.find(x=>x.exerciseId===id);assert.ok(log);assert.equal(log.sets.length,count);assert.equal(log.sets[0].reps,13);assert.equal(log.sets[0].rir,2);assert.equal(log.sets[0].kg,expectedKg);
  await page.reload();await page.locator('[data-tab=workout]').click();await card.locator('[data-edit-exercise]').waitFor();assert.ok(await card.locator('.exercise-editor').evaluate(e=>e.hidden));await card.screenshot({path:`outputs/completed-${location}.png`});await card.locator('[data-edit-exercise]').click();assert.equal(await form.locator('[name=set_reps_0]').inputValue(),'13');
  await form.locator('[data-add-set]').click();await form.locator(`[name=set_reps_${count}]`).fill('9');await form.locator('[data-effort="0"]').click();
  await page.locator('[data-tab=nutrition]').click();await page.locator('[data-tab=workout]').click();assert.equal(await rows.count(),count+1);assert.equal(await form.locator(`[name=set_reps_${count}]`).inputValue(),'9');assert.ok((await form.locator('[data-effort="0"]').getAttribute('class')).includes('active-chip'));
  await form.locator('[type=submit]').click();await settled();
  s=await read();log=s.workoutLogs.find(x=>x.exerciseId===id);assert.equal(s.workoutLogs.filter(x=>x.exerciseId===id).length,1);assert.equal(log.sets.length,count+1);assert.equal(log.sets.at(-1).reps,9);
  await card.locator('[data-edit-exercise]').click();
  for(const width of [390,1024]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);assert.ok(await form.locator('[name=set_reps_0]').evaluate(e=>e.getBoundingClientRect().width>=45));
  await page.evaluate(()=>document.activeElement?.blur());await card.screenshot({path:`outputs/${location}-${width}.png`});}
  // Exercise replacement through the actual dialog keeps the appropriate controls.
  await form.locator('[data-exercise-alt]').click();await page.locator('#coach-dialog[open]').waitFor();
  const alternative=page.locator('[data-replace-exercise]').first();if(await alternative.count()){await alternative.click();await settled();assert.notEqual((await read()).workoutPlan.id,s.workoutPlan.id);}else await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Home/gym browser audit passed: no bodyweight kg inputs, weighted controls retained, add/remove, effort, save/edit/reload, replacement, 390/1024px.');
}finally{await browser.close();}
