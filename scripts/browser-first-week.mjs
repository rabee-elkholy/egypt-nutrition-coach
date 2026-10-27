import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {migrateLocal} from './local-migrations.mjs';
import {mkdirSync} from 'node:fs';
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-11',compatibilityFlags:['nodejs_als'],d1Databases:['DB'],assets:{directory:'dist/client',binding:'ASSETS',routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true}},port:8797,host:'127.0.0.1'});
let browser;
try{
 await migrateLocal(await mf.getD1Database('DB'));const origin=String(await mf.ready).replace(/\/$/,'');
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});mkdirSync('outputs/audit/first-week-browser-20261027',{recursive:true});
 for(const width of [390,1280])for(const track of ['nutrition_only','workouts_only','nutrition_and_workouts']){
  const context=await browser.newContext({viewport:{width,height:950},extraHTTPHeaders:{'oai-authenticated-user-id':'first-week-'+crypto.randomUUID()}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let s;const send=async(action,payload)=>{const r=await context.request.post(origin+'/v1/commands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{revision:s?.revision||0,action,payload}});assert.equal(r.status(),200,await r.text());s=await r.json();};
  await send('generate',{name:'أحمد',age:30,weight:80,height:175,sex:'male',goal:'lose',targetWeight:75,serviceTrack:track,dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true});
  await page.goto(origin+'/#planner');const cta=page.locator('[data-brief-action]:visible');await cta.waitFor();assert.equal(await cta.count(),1);
  assert.match(await page.locator('[data-personal-role="followup"]:visible').innerText(),/أهلًا يا أحمد/);
  const target=track==='nutrition_only'?'food':'recovery';assert.equal(await cta.getAttribute('data-brief-action'),target);await cta.click();
  assert.equal(await page.locator(target==='food'?'#food-diary':'#recovery-log').isVisible(),true);
  const fetched=await(await context.request.get(origin+'/v1/state')).json();assert.equal(fetched.revision,s.revision,'navigation must not create a log');
  if(track!=='nutrition_only'){
   await send('recovery',{sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false});
   await page.reload();await page.locator('[data-brief-action]:visible').waitFor();assert.equal(await page.locator('[data-brief-action]:visible').getAttribute('data-brief-action'),track==='workouts_only'?'workout':'food');
  }
  await page.locator('[data-tab="review"]').click();await page.locator('[data-brief-action]:visible').waitFor();
  assert.equal(await page.locator('[data-brief-action]:visible').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5),false);assert.deepEqual(errors,[]);
  await page.locator('.specialist-brief:visible').screenshot({path:`outputs/audit/first-week-browser-20261027/${track}-${width}.png`});await context.close();
 }
 console.log('PASS: six viewport/track journeys, welcome, one next-step CTA, navigation without writes, updated CTA after real recovery, review tab, no errors/overflow.');
}finally{await browser?.close();await mf.dispose();}
