import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,command,today} from '../server/coaching.mjs';
import {clockNow,clockDate,simulationTime,withClock} from '../server/clock.mjs';
import {simulationCommand,simulationSummary} from '../server/simulation.mjs';
import {activePlan} from '../server/food.mjs';
import {dateOffset,localDate} from '../coaching-shared.mjs';
const run=(s,action,p={})=>withClock(simulationTime(s),()=>{const next=simulationCommand(structuredClone(s),action,p);next.revision=s.revision+1;return next;});
const start=()=>run(empty(),'simulation_reset',{source:'sample'});
test('SIM-01: concurrent virtual clocks cannot leak into each other or real time',async()=>{
 const before=Date.now();const result=await Promise.all([100000,200000].map(n=>withClock(n,async()=>{await new Promise(resolve=>setTimeout(resolve,5));return clockNow();})));
 assert.deepEqual(result,[100000,200000]);assert.ok(clockNow()>=before);assert.ok(Date.now()>=before);
});
test('SIM-02: 15 real engine days renew plans, accumulate evidence and propose a plateau adjustment',()=>{
 let s=start();const firstPlan=activePlan(s).id,startDate=s.simulation.startedDate;
 for(let day=1;day<=14;day++){
  assert.equal(withClock(simulationTime(s),clockDate),dateOffset(startDate,day-1));
  s=run(s,'simulation_fill',{scenario:'plateau'});
  assert.equal(s.foodLogs.filter(x=>x.complete).length,day);assert.equal(s.weights.length,day);
  if(day<14)s=run(s,'simulation_next');
 }
 assert.notEqual(activePlan(s).id,firstPlan);assert.equal(s.nutritionContextStartedOn,startDate);assert.equal(s.lastReview.nutrition.action,'propose');
 const proposal=s.adaptations.find(a=>a.status==='pending'&&a.kind==='calories');assert.ok(proposal);const energy=activePlan(s).targets.energy;
 s=run(s,'adaptation',{id:proposal.id,accept:true});assert.ok(activePlan(s).targets.energy<energy);
 const changed=activePlan(s);assert.equal(changed.effective_from,dateOffset(startDate,14));
 s=run(s,'simulation_next');assert.equal(s.simulation.day,15);assert.equal(s.simulation.history.length,14);assert.equal(s.revision,30);
 assert.equal(withClock(simulationTime(s),()=>simulationSummary(s).recovery),'unknown');
 assert.equal(today(),localDate(),'virtual dates never change the real engine default');
});
test('SIM-03: incomplete days stay incomplete and synthetic fill never overwrites manual logs',()=>{
 let s=start();s=run(s,'food_entry',{source:'manual',slot:'snack',name:'اختبار يدوي',energy:150});
 assert.throws(()=>run(s,'simulation_fill',{scenario:'consistent'}),/بيانات مسجلة/);s=run(s,'simulation_next');
 assert.equal(s.simulation.history[0].energy,150);assert.equal(s.simulation.history[0].foodComplete,false);assert.equal(s.weights.length,0);
 assert.equal(s.foodEntries.length,1);assert.equal(s.checkins.length,0);
});
test('SIM-04: poor recovery and movement pain produce actual engine holds, not canned decisions',()=>{
 for(const scenario of ['poor_recovery','pain']){let s=start();s=run(s,'simulation_fill',{scenario});assert.equal(s.lastReview.recovery,scenario==='pain'?'hold':'high');assert.equal(s.lastReview.nutrition.action,'hold');if(scenario==='poor_recovery')assert.ok(s.adaptations.some(a=>a.kind==='recovery'&&a.status==='pending'));}
});
test('SIM-05: reset needs intent, preserves revision and creates a fresh independent round',()=>{
 let s=start();s=run(s,'simulation_fill',{scenario:'consistent'});const original=JSON.stringify(s),oldRun=s.simulation.runId;
 assert.throws(()=>run(s,'simulation_reset',{source:'sample'}),/أكد/);
 const next=run(s,'simulation_reset',{source:'sample',confirm:true});assert.notEqual(next.simulation.runId,oldRun);assert.equal(next.simulation.day,1);assert.equal(next.weights.length,0);assert.equal(next.foodEntries.length,0);assert.equal(next.revision,s.revision+1);assert.equal(JSON.stringify(s),original);
 assert.throws(()=>command(empty(),'simulation_next',{}));
});
test('SIM-06: invalid scenarios, advancing before start and day 91 are rejected',()=>{
 assert.throws(()=>run(empty(),'simulation_next'));let s=start();assert.throws(()=>run(s,'simulation_fill',{scenario:'arbitrary'}));s.simulation.day=90;assert.throws(()=>run(s,'simulation_next'),/90/);
});
test('SIM-07: manual logs use virtual dates and reject dates beyond the simulated today',()=>{
 let s=start();s=run(s,'simulation_next');const date=dateOffset(s.simulation.startedDate,1);s=run(s,'weight',{date,kg:79.9});assert.equal(s.weights[0].date,date);
 assert.throws(()=>run(s,'weight',{date:dateOffset(date,1),kg:79.8}),/المستقبل/);
});
