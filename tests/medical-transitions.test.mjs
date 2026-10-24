import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate,command,today,retargetPlan} from '../server/coaching.mjs';
import {mealAlternatives,replaceMeal} from '../server/food.mjs';
import {medicalContraindicatedKeys,assertDietDay} from '../diet-patterns.mjs';
import {dateOffset} from '../coaching-shared.mjs';
const draft={name:'Medical transitions',age:30,weight:80,height:175,sex:'male',goal:'lose',serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[0,2,4]};
for(const disease of ['hypertension','lactose_intolerance','gout','ibs','cholesterol','favism','insulin_resistance','pcos'])test('medical policy applies to generation, all alternatives and accepted replacement: '+disease,()=>{
 const s=generate(empty(),{...draft,diseases:[disease]},'review-011'),blocked=medicalContraindicatedKeys(s.profile);let choice=null;
 for(const day of s.plans[0].days){
  assertDietDay(day.meals.map(m=>m.snapshot),s.preferences.diet,day.targets,s.profile);
  for(const m of day.meals)for(const a of mealAlternatives(s,m.id)){
   assert.ok(a.snapshot.ingredients.every(i=>!blocked.has(i.key)),disease+': '+a.snapshot.name);
   choice||={mealId:m.id,templateId:a.snapshot.template_id};
  }
 }
 assert.ok(choice,'a feasible alternative should remain');
 const next=replaceMeal(structuredClone(s),choice),plan=next.plans.find(p=>p.id===next.active_plan_id);
 for(const day of plan.days)assertDietDay(day.meals.map(m=>m.snapshot),s.preferences.diet,day.targets,s.profile);
});
test('legacy violating food plans hold review and reject calorie retargeting for every medical condition',()=>{
 for(const disease of ['gout','ibs','lactose_intolerance','favism','cholesterol','insulin_resistance']){
  const s=generate(empty(),{...draft,diseases:[disease]},'review-011'),key=[...medicalContraindicatedKeys(s.profile)][0];
  s.plans[0].days[1].meals[0].snapshot.ingredients[0].key=key;
  const reviewed=command(structuredClone(s),'review',{});assert.equal(reviewed.lastReview.nutrition.action,'hold');assert.equal(reviewed.lastReview.reasonCode,'PLAN_CONSTRAINTS_VERIFICATION_FAILED');
  assert.throws(()=>retargetPlan(structuredClone(s.plans[0]),s.plans[0].targets.energy+100,s.preferences,dateOffset(today(),1),s.profile),/الحالة الصحية/);
 }
});
