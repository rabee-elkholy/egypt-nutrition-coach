import {makeWeek,scaleSnapshot,sumSnapshots,assessDay} from '../planner-core.mjs';
import {FIXED_DIET_MEALS} from '../diet-patterns.mjs';
import library from '../data/planning-library.json' with {type:'json'};
import {workoutPlan} from './workouts.mjs';
import {recovery,calorieReview,progression} from './recovery.mjs';
export const empty=()=>({revision:0,profile:null,preferences:null,onboarding:null,plans:[],workoutPlan:null,foodLogs:[],weights:[],workoutLogs:[],checkins:[],adaptations:[],history:[]});
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function number(v,min,max,label){if(v==null||v===''||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)throw Error(label+' خارج النطاق');return Number(v);}
const clean=a=>Array.isArray(a)?a.filter(x=>x&&x!=='none'):[];
export function generate(s,d){
 const age=number(d.age,18,90,'العمر'),weight=number(d.weight,35,250,'الوزن'),height=number(d.height,120,230,'الطول');
 if(!['male','female'].includes(d.sex))throw Error('حدد الجنس لحساب الاحتياجات.');
 if(age>70||clean(d.diseases).length||clean(d.injuries).length||(d.maternalStatus&&d.maternalStatus!=='none'))throw Error('الحالة تحتاج مراجعة متخصص قبل إنشاء خطة آلية. النسخة الحالية للبالغين الأصحاء بدون إصابة.');
 if(!['lose','maintain','gain','muscle_gain'].includes(d.goal))throw Error('هدف غير صالح');
 if(!['nutrition_only','workouts_only','nutrition_and_workouts'].includes(d.serviceTrack))throw Error('مسار غير صالح');
 const bmi=weight/((height/100)**2);if(bmi<18.5&&d.goal==='lose')throw Error('تقليل الوزن غير مناسب مع مؤشر كتلة الجسم الحالي.');
 const wp=d.serviceTrack==='nutrition_only'?null:workoutPlan(d);
 const profile={name:String(d.name||'').slice(0,100),age,weight,height,sex:d.sex,goal:d.goal,targetWeight:d.targetWeight?number(d.targetWeight,35,250,'الوزن المستهدف'):null,goalPace:d.goalPace,activity:d.dailyActivity||'light',trainingDays:wp?.days.length||0,workoutDays:wp?.days.map(x=>x.dayIndex)||[],diseases:[],maternalStatus:'none',ketoAcknowledged:d.dietType==='keto',fastingAcknowledged:d.dietType==='intermittent_fasting'};
 const fixed=FIXED_DIET_MEALS[d.dietType];
 const prefs={diet:d.dietType||'balanced',fasting:fixed?.fasting||'none',eatingStart:d.eatingStart||'12:00',region:d.region||'egypt',budget:d.budget||'medium',meals:fixed?.meals||number(d.mealsCount||4,2,6,'الوجبات'),proteins:d.dietType==='vegan'?['legumes','nuts']:d.dietType==='vegetarian'?['legumes','eggs','dairy','nuts']:['legumes','eggs','dairy','chicken','fish','meat','nuts'],excludedKeys:[],excludedFoodIds:[],excludedGroups:clean(d.excludedGroups)};
 // Never relax dietary exclusions or budget when generation fails.
 const plan=d.serviceTrack==='workouts_only'?null:makeWeek(profile,prefs,library,today(),crypto.randomUUID());
 if(s.profile)s.history.push({at:new Date().toISOString(),profile:s.profile,planId:s.active_plan_id,workoutPlan:s.workoutPlan});
 s.profile=profile;s.preferences=prefs;s.workoutPlan=wp;s.onboarding={serviceTrack:d.serviceTrack,workoutPrefs:{...d},isAuthenticated:true};
 // Remove simulated onboarding authentication from persisted domain data.
 delete s.onboarding.workoutPrefs.authEmail;delete s.onboarding.workoutPrefs.socialSuggestedName;
 if(plan){s.plans.push(plan);s.active_plan_id=plan.id;}else s.active_plan_id=null;
 s.adaptations=[];return s;
}
export function review(s){
 const ready=recovery(s.checkins);const plan=s.plans.find(p=>p.id===s.active_plan_id);
 const proposals=[];
 if(['caution','high'].includes(ready.status)&&s.workoutPlan)proposals.push({kind:'recovery',setFactor:ready.setFactor,reason:ready.reasons.join('؛ '),expiresAt:new Date(Date.now()+86400000).toISOString()});
 if(plan&&!proposals.length){const result=calorieReview(s.weights,s.foodLogs,s.profile.goal,Number(plan.targets.energy),Date.now(),s.lastCalorieChange||0);if(result.action==='propose')proposals.push({kind:'calories',...result});}
 for(const a of s.adaptations)if(a.status==='pending')a.status='superseded';
 const pending=[];
 for(const p of proposals)if(!pending.some(a=>a.kind===p.kind&&a.baseRevision===s.revision))s.adaptations.push({...p,id:crypto.randomUUID(),baseRevision:s.revision+1,status:'pending',at:new Date().toISOString()});
 return s;
}
export function command(s,action,p){
 if(action==='generate')return generate(s,p);
 if(!s.profile)throw Error('أكمل بياناتك أولًا.');
 if(action==='weight'){
 const kg=number(p.kg,35,250,'الوزن');s.weights=s.weights.filter(x=>x.date!==today());s.weights.push({date:today(),kg});
 }else if(action==='food'){
 const plan=s.plans.find(x=>x.id===s.active_plan_id);const day=plan?.days.find(x=>x.date===p.date);if(!day)throw Error('اليوم غير موجود في الخطة.');
 if(p.date>today())throw Error('لا يمكن تسجيل يوم مستقبلي.');
 s.foodLogs=s.foodLogs.filter(x=>x.date!==p.date);s.foodLogs.push({date:p.date,complete:p.complete===true,adherence:number(p.adherence,0,100,'الالتزام'),energy:number(p.energy,0,10000,'السعرات الفعلية'),planId:plan.id});
 }else if(action==='recovery'){
 for(const key of ['pain','illness','redFlags'])if(typeof p[key]!=='boolean')throw Error('أجب على أسئلة الألم والمرض.');
 const c={at:new Date().toISOString(),date:today(),sleepHours:number(p.sleepHours,0,24,'ساعات النوم'),sleepQuality:number(p.sleepQuality,1,5,'جودة النوم'),fatigue:number(p.fatigue,1,5,'الإجهاد'),stress:number(p.stress,1,5,'الضغط'),soreness:number(p.soreness,0,10,'ألم العضلات'),pain:p.pain,illness:p.illness,redFlags:p.redFlags};
 s.checkins=s.checkins.filter(x=>x.date!==c.date);s.checkins.push(c);
 }else if(action==='workout'){
 const exercise=s.workoutPlan?.days.flatMap(x=>x.exercises).find(x=>x.id===p.exerciseId);if(!exercise)throw Error('التمرين غير موجود في خطتك.');
 if(!Array.isArray(p.sets)||p.sets.length<1||p.sets.length>10)throw Error('سجل المجموعات الفعلية.');
 const sets=p.sets.map(x=>({kg:number(x.kg,0,500,'الوزن'),reps:number(x.reps,1,100,'التكرارات'),rir:x.rir==null?null:number(x.rir,0,10,'التكرارات المتبقية'),pain:x.pain===true}));
 s.workoutLogs.push({id:crypto.randomUUID(),at:new Date().toISOString(),exerciseId:exercise.id,planId:s.workoutPlan.id,loadMode:exercise.loadMode,sets,increment:p.increment?number(p.increment,.1,20,'زيادة الوزن'):null});
 const next=progression(exercise,s.workoutLogs,recovery(s.checkins));
 if(next.action==='increase'){exercise.suggestedKg=next.kg;exercise.progressionReason=next.reason;}
 }else if(action==='review')return review(s);
 else if(action==='adaptation'){
 const a=s.adaptations.find(x=>x.id===p.id&&x.status==='pending');if(!a)throw Error('الاقتراح غير موجود.');
 if(p.accept===false){a.status='rejected';return s;}
 if(a.baseRevision!==s.revision)throw Object.assign(Error('بياناتك اتغيرت؛ اطلب مراجعة جديدة.'),{status:409});
 if(a.expiresAt&&Date.parse(a.expiresAt)<Date.now())throw Error('الاقتراح انتهت صلاحيته؛ سجّل استشفاء جديد.');
 if(a.kind==='recovery')s.sessionAdjustment={setFactor:a.setFactor,expiresAt:a.expiresAt,reason:a.reason};
 else if(a.kind==='calories'){
 const previous=s.plans.find(x=>x.id===s.active_plan_id);const plan=structuredClone(previous);
 const energy=Number(plan.targets.energy)+a.delta;
 if(energy<(s.profile.sex==='female'?1200:1400)||energy>4200)throw Error('التعديل يتجاوز حدود الخطة الآلية؛ راجع متخصصًا.');
 const factor=energy/Number(plan.targets.energy);plan.id='plan-'+crypto.randomUUID();plan.created_at=new Date().toISOString();plan.parent_id=previous.id;
 for(const key of ['energy','protein','fat','carbs'])plan.targets[key]=Math.round(Number(plan.targets[key])*factor);
 plan.warnings=[];for(const day of plan.days){for(const meal of day.meals){meal.id=crypto.randomUUID();meal.snapshot=scaleSnapshot(meal.snapshot,factor);}day.summary=sumSnapshots(day.meals.map(m=>m.snapshot));const warnings=assessDay(day.summary,plan.targets);if(warnings.length)plan.warnings.push({date:day.date,messages:warnings});}
 s.plans.push(plan);s.active_plan_id=plan.id;s.lastCalorieChange=Date.now();
 }
 a.status='accepted';a.acceptedAt=new Date().toISOString();
 }else throw Error('عملية غير معروفة');
 return s;
}
