import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'}),origin='http://127.0.0.1:8787';
try{
 for(const serviceTrack of ['workouts_only','nutrition_only','nutrition_and_workouts']){
  const context=await browser.newContext({extraHTTPHeaders:{'oai-authenticated-user-id':'journey-'+serviceTrack+'-'+Date.now()}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(origin);await page.locator('[data-view="planner"]').click();await page.locator('[data-chat-action="account-check-no"]').click();
  const goal=serviceTrack==='nutrition_only'?'muscle_gain':'maintain';
  const fields={name:'مراجعة الرحلة',age:'30',height:'175',weight:'80','target-weight':'80'};
  const choices={sex:'male',goal,serviceTrack,fitnessLevel:'beginner',workoutLocation:'gym_only',workoutSplitPreference:'auto',sessionDuration:'45',dailyActivity:'light',dietType:'balanced',mealsCount:'4',budget:'medium'};
  let finished=false,selectedDays=[];
  for(let step=0;step<60;step++){
   if(await page.locator('#weight-log').count()){finished=true;break;}
   if(await page.locator('#readiness-form').count()){
    if(serviceTrack==='workouts_only')await page.locator('#readiness-form [name=healthConfirmed]').check();
    else for(const d of [1,3,5])await page.locator(`#readiness-form [name="external:${d}"]`).check();
    await page.locator('#readiness-form button').first().click();await page.locator('#weight-log').waitFor({state:'attached'});finished=true;break;
   }
   const force=page.locator('[data-chat-action="force-target-weight"]');if(await force.isVisible()){await force.click();continue;}
   let acted=false;
   for(const [key,value]of Object.entries(fields)){const input=page.locator('#chat-input-'+key);if(await input.isVisible()){await input.fill(value);await page.locator('[data-chat-action="submit-'+key+'"]').click();acted=true;break;}}
   if(acted)continue;
   for(const [key,value]of Object.entries(choices)){const choice=page.locator(`[data-chat-select="${key}"][data-val="${value}"]`);if(await choice.isVisible()){await choice.click();acted=true;break;}}
   if(acted)continue;
   for(const action of ['confirm-workout-days','confirm-day-split','finish-onboarding','login-summary-clean-sync']){const button=page.locator(`[data-chat-action="${action}"]`);if(await button.isVisible()){if(action==='confirm-workout-days')selectedDays=await page.locator('[data-toggle-workout-day][aria-pressed="true"]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.toggleWorkoutDay)));await button.click();if(action==='login-summary-clean-sync')await page.locator('#readiness-form,#weight-log').first().waitFor({state:'attached'});acted=true;break;}}
   if(acted)continue;
   const multi=page.locator('[data-chat-action="confirm-multi"]');if(await multi.isVisible()){await multi.click();continue;}
   throw Error('Unrecognized onboarding step: '+(await page.locator('#planner-view').innerText()).slice(-1500));
  }
  assert.equal(finished,true,serviceTrack);const state=await (await context.request.get(origin+'/v1/state')).json();assert.equal(state.profile.weekdayConvention,'js_sunday_0');assert.equal(state.onboarding.serviceTrack,serviceTrack);
  if(serviceTrack==='workouts_only'){assert.equal(state.onboarding.workoutPrefs.healthConfirmed,true);assert.ok(state.workoutPlan);assert.deepEqual(state.profile.workoutDays,selectedDays.map(d=>(d+6)%7).sort());}
  if(serviceTrack==='nutrition_only'){assert.equal(state.profile.recomposition,true);assert.deepEqual(state.profile.workoutDays,[1,3,5]);assert.equal(state.workoutPlan,null);}
  if(serviceTrack==='nutrition_and_workouts')assert.deepEqual(state.profile.workoutDays,selectedDays.map(d=>(d+6)%7).sort());
  assert.deepEqual(errors,[]);console.log('Full onboarding journey passed:',serviceTrack);await context.close();
 }
}finally{await browser.close();}
