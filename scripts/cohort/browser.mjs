import {chromium} from '@playwright/test';
import path from 'node:path';
import {mkdirSync,existsSync} from 'node:fs';
import {args,read,json,lines,hash} from './common.mjs';
import {loadDay,generateReports} from './report.mjs';
import {serve} from './serve.mjs';
export async function browserChecks(root){
 const config=read(path.join(root,'simulation_config.json')),cohort=read(path.join(root,'cohort.json')),samples=[],errors=[],checks=[];let fixture;
 const server=serve(process.cwd(),8795),viewerServer=serve(root,8796),browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 try{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)){await route.abort();return;}if(url.pathname==='/__cohort-render'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><link rel="stylesheet" href="/coaching.css"><link rel="stylesheet" href="/planner.css"><body><main id="planner-view"></main><script type="module">import {mountPlanner} from "/coaching-ui.mjs"; await mountPlanner({root:document.querySelector("main"),toast:()=>{}});window.mounted=true;</script></body></html>'});return;}if(url.pathname.startsWith('/v1/')){await route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)});return;}await route.continue();});
 const chosen=[cohort[0],cohort.find(p=>p.userId==='user-042'),...cohort.filter(p=>p.split==='holdout').slice(0,2),...cohort.filter(p=>p.split==='development').sort((a,b)=>hash(config.seed+':dom:'+a.userId).localeCompare(hash(config.seed+':dom:'+b.userId))).slice(0,3)].filter(Boolean);
 for(const p of [...new Map(chosen.map(p=>[p.userId,p])).values()])for(const day of [...new Set([1,Math.min(14,config.days),Math.min(38,config.days),config.days])]){
  const file=path.join(root,'users',p.userId,'days',String(day).padStart(3,'0')+'.json.gz');if(!existsSync(file))continue;const b=loadDay(file);if(!b.state.profile)continue;fixture=b.state;
  await page.goto('http://127.0.0.1:8795/__cohort-render?simulation=1');await page.waitForFunction(()=>window.mounted===true);const texts=await page.locator('p,li,small,h3').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,visible:!!n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'})));
  const result={userId:p.userId,day,revision:fixture.revision,checkedAt:new Date().toISOString(),messages:b.messages.filter(m=>m.engineStateRevision===fixture.revision).map(m=>({messageId:m.messageId,visible:texts.some(t=>t.visible&&t.text===m.exactText),checkedAt:new Date().toISOString()})),visibleText:texts.filter(t=>t.visible).map(t=>t.text),stateReference:`users/${p.userId}/days/${String(day).padStart(3,'0')}.json.gz`};samples.push(result);
 }
 json(path.join(root,'render_checks.json'),{samples,errors,method:'Actual mountPlanner imported unchanged; authenticated HTTP-produced captured state provided at frontend read boundary. Text content and visibility checked in Edge DOM.'});
 await generateReports(root);
 await page.goto('http://127.0.0.1:8796/explorer.html');await page.waitForFunction(()=>document.querySelector('#content pre'));
 const target=cohort.find(p=>p.userId==='user-042')?.userId||cohort[0].userId;await page.selectOption('#user',target);await page.locator('#day').fill(String(Math.min(38,config.days)));await page.locator('#day').dispatchEvent('input');await page.waitForFunction(id=>document.querySelector('#title').textContent.includes(id),target);
 for(const tab of ['onboarding','nutrition','training','observed','truth','messages','changes','errors','overview']){await page.locator('[data-key="'+tab+'"]').click();await page.waitForTimeout(80);checks.push({tab,loaded:!(await page.locator('#content').innerText()).includes('undefined')});}
 mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.screenshot({path:path.join(root,'screenshots/explorer-desktop.png'),fullPage:true});
 for(const width of [1024,390]){await page.setViewportSize({width,height:950});await page.screenshot({path:path.join(root,`screenshots/explorer-${width}.png`),fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);checks.push({width,overflow,passed:overflow===0});}
 json(path.join(root,'browser_checks.json'),{samples:samples.length,visibleMessages:samples.reduce((n,x)=>n+x.messages.filter(m=>m.visible).length,0),errors,checks,passed:!errors.length&&checks.every(x=>x.passed!==false&&x.loaded!==false)});
 console.log(JSON.stringify({browserSamples:samples.length,errors,checks}));
 }finally{await browser.close();server.close();viewerServer.close();}
}
if(process.argv[1]?.endsWith('browser.mjs'))await browserChecks(path.resolve(String(args().output||'reports/simulation-100-users-90-days/baseline-v1')));
