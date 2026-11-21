import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,generate} from '../server/coaching.mjs';
import {library} from '../server/food.mjs';

const DASH_GULF_DRAFT={name:'DASH Gulf Stress',age:46,weight:86,height:173,sex:'male',goal:'lose',targetWeight:78,serviceTrack:'nutrition_only',dailyActivity:'light',dietType:'dash',region:'gulf',budget:'medium',mealsCount:4};
const fixture=()=>generate(empty(),DASH_GULF_DRAFT,'stress-dash-gulf');

function measuredDashSodiumInvariant(state){
 const plans=state?.plans||[];
 if(!plans.length)return false;
 for(const plan of plans){
  if(!Array.isArray(plan.days)||plan.days.length!==7)return false;
  for(const day of plan.days){
   let daySodium=0;
   for(const meal of day.meals||[]){
    const snap=meal.snapshot;
    if(!snap||snap.values?.sodium==null||!Array.isArray(snap.ingredients))return false;
    let mealSodium=0;
    for(const part of snap.ingredients){
     if(part.values_per_100g?.sodium==null||!library.ingredients[part.key])return false;
     const ref=Number(library.ingredients[part.key].values.sodium);
     const g=Number(part.grams);
     if(!Number.isFinite(ref)||!Number.isFinite(g))return false;
     mealSodium+=(g*ref)/100;
    }
    if(Math.abs(mealSodium-Number(snap.values.sodium))>5)return false;
    daySodium+=mealSodium;
   }
   if(daySodium>2300)return false;
  }
 }
 return true;
}

test('DASH stress requires a retained complete measured plan and rejects missing evidence',()=>{
 const state=fixture();assert.equal(measuredDashSodiumInvariant(state),true);
 const missing=structuredClone(state);missing.plans=[];assert.equal(measuredDashSodiumInvariant(missing),false);
 for(const mutate of [s=>s.plans[0].days.pop(),s=>s.plans[0].days[0].meals[0].snapshot.values.sodium=null,s=>s.plans[0].days[0].meals[0].snapshot.ingredients[0].values_per_100g.sodium=null]){
  const changed=structuredClone(state);mutate(changed);assert.equal(measuredDashSodiumInvariant(changed),false);
 }
});

test('DASH stress rejects an independently recomputed excessive quantity even when declared arithmetic agrees',()=>{
 const state=fixture(),day=state.plans[0].days[0],part=day.meals.flatMap(m=>m.snapshot.ingredients).find(p=>Number(library.ingredients[p.key].values.sodium)>0);assert.ok(part);
 part.grams=String(Number(part.grams)*1000000);
 for(const meal of day.meals)meal.snapshot.values.sodium=String(meal.snapshot.ingredients.reduce((n,p)=>n+Number(p.grams)*Number(library.ingredients[p.key].values.sodium)/100,0));
 day.summary.values.sodium=String(day.meals.reduce((n,m)=>n+Number(m.snapshot.values.sodium),0));assert.ok(Number(day.summary.values.sodium)>2300);assert.equal(measuredDashSodiumInvariant(state),false);
});
