import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,empty,command} from '../server/coaching.mjs';
import {makeWeek} from '../planner-core.mjs';
import {library} from '../server/food.mjs';
import {withClock} from '../server/clock.mjs';
import {dateOffset} from '../coaching-shared.mjs';
const now=Date.parse('2026-10-24T12:00:00Z'),date='2026-10-24';
function established(draft,seed,energy){
 const s=generate(empty(),draft,seed);
 if(energy){const plan=makeWeek(s.profile,s.preferences,library,date,'boundary-plan',energy);s.plans=[plan];s.active_plan_id=plan.id;}
 const target=s.plans.find(p=>p.id===s.active_plan_id).targets.energy;s.nutritionContextStartedOn=dateOffset(date,-20);
 s.weights=Array.from({length:14},(_,i)=>({date:dateOffset(date,-i),kg:s.profile.weight}));
 s.foodLogs=s.weights.map(w=>({date:w.date,complete:true,energy:target,adherence:100}));
 s.checkins=[{date,at:new Date(now).toISOString(),sleepHours:8,sleepQuality:4,fatigue:1,stress:1,soreness:0,pain:false,illness:false,redFlags:false}];return s;
}
const base={name:'Hold reason',age:30,weight:80,height:175,sex:'male',goal:'gain',targetWeight:95,serviceTrack:'nutrition_and_workouts',dietType:'balanced',selectedWorkoutDays:[1,3,5],healthConfirmed:true};
test('an upper energy hold explains the upper bound rather than a calorie deficit',()=>withClock(now,()=>{
 const s=established(base,'ceiling',4150),next=command(s,'review',{});
 assert.equal(next.lastReview.nutrition.reasonCode,'MAX_SAFE_ENERGY_CEILING_HOLD');
 assert.doesNotMatch(next.lastReview.nutrition.reason,/خصم|أقل من الحد/);
 assert.equal(next.adaptations.some(a=>a.kind==='calories'&&a.status==='pending'),false);
}));
test('an existing lower energy hold keeps its compatible reason code',()=>withClock(now,()=>{
 const s=established({...base,age:65,weight:65,height:170,goal:'lose',targetWeight:60,dailyActivity:'sedentary'},'floor',1400),next=command(s,'review',{});
 assert.equal(next.lastReview.nutrition.reasonCode,'MIN_SAFE_ENERGY_FLOOR_HOLD');
}));
test('portion/protein validation failure inside energy bounds does not claim a floor breach',()=>withClock(now,()=>{
 const s=established({name:'Target-fit hold',age:29,sex:'male',height:191,weight:99.8,targetWeight:null,goal:'lose',goalPace:'slow',serviceTrack:'nutrition_and_workouts',dailyActivity:'sedentary',dietType:'balanced',region:'egypt',timezone:'Africa/Cairo',budget:'low',mealsCount:4,selectedWorkoutDays:[0,1,2,4,5],workoutDaysCount:5,weekdayConvention:'js_sunday_0',fitnessLevel:'beginner',sessionDuration:45,workoutLocation:'gym_only',homeEquipment:['dumbbells','pullup_bar','bench'],dayLocations:{0:'home',1:'gym',2:'home',4:'gym',5:'home'},workoutSplitPreference:'ppl',injuries:['knee_pain'],diseases:['hypertension'],healthConfirmed:true,excludedGroups:['fish'],eatingStart:'12:00'},'hold-probe-user-001');
 const before=JSON.stringify(s.plans),next=command(s,'review',{});
 assert.equal(next.lastReview.nutrition.reasonCode,'PLAN_CONSTRAINTS_ADJUSTMENT_HOLD');
 assert.equal(JSON.stringify(next.plans),before);assert.doesNotMatch(next.lastReview.nutrition.reason,/أقل من الحد/);
}));
