// Independent evaluator: no application engine validators, calculators or decision functions imported.
import {hash,round} from './common.mjs';
const metrics=['energy','protein','fat','carbs','fiber','saturated','sodium','sugars'];
const bans={knee_pain:['squat','lunge','knee_extension'],lower_back_pain:['hinge'],shoulder_pain:['vertical_push','shoulder_abduction'],wrist_pain:['elbow_flexion'],ankle_pain:['plantar_flexion','lunge'],neck_pain:['scapular_elevation'],hip_pain:['squat','lunge','hinge'],diastasis_recti:['spinal_flexion','hip_flexion']};
const names={knee_pain:/jump|plyo|pistol|sissy|lunge|split squat/i,lower_back_pain:/good morning|deadlift|back squat|sit.?up/i,shoulder_pain:/upright row|behind.*neck|dip|overhead/i,wrist_pain:/barbell curl|close.grip bench|handstand|push.?up/i,ankle_pain:/jump|hop|sprint|plyo|calf raise/i,neck_pain:/neck|shrug/i,hip_pain:/sumo|wide.stance|split squat|lunge/i,diastasis_recti:/crunch|sit.?up|v.?up|leg raise/i};
const equipment={none:[],dumbbells:['dumbbell'],bench:['flat_bench'],resistance_bands:['resistance_band'],yoga_mat:['mat'],pullup_bar:['pullup_bar'],barbell:['barbell'],kettlebell:['kettlebell'],jump_rope:['jump_rope'],cardio_machine:['cardio_machine']};
// Independently encode the public taste-category distinction. The nutrition
// protein family "fish" also contains shrimp and is not this preference contract.
const distinctTasteKeys={fish:new Set(['fish','seabass','tuna','salmon']),shellfish:new Set(['shrimp'])};
export const nutritionSignature=p=>hash(p.days.map(d=>d.meals.map(m=>m.snapshot.ingredients.map(i=>[i.key,round(Number(i.grams),0)]).sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export const menuSignature=p=>hash(p.days.flatMap(d=>d.meals.map(m=>m.snapshot.ingredients.map(i=>i.key).sort().join('+'))).sort());
export const workoutSignature=p=>hash(p.days.map(d=>d.exercises.map(e=>[e.id,e.sets,e.repMin,e.repMax,e.rir]).sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export function evaluateDay(bundle,persona,library){
 const {state:s,day,userId,date,records}=bundle,issues=[];
 const add=(code,severity,evidence,recommendation,source=null)=>issues.push({findingId:`${userId}-d${day}-${code}-${issues.length}`,code,severity,userId,day,date,evidence,rawReference:`users/${userId}/days/${String(day).padStart(3,'0')}.json.gz`,recommendation,source,reviewScope:'software-product-rule; not clinical judgment'});
 const plan=s.plans?.find(p=>p.id===s.active_plan_id),foodDay=plan?.days.find(d=>d.date===date),nutrition={known:0,unknown:0,referenceIngredients:0,unreferencedIngredients:0,estimated:0,energyRatio:null,proteinRatio:null,ingredientKeys:[],proteinSources:[],carbSources:[],fatSources:[]};
 if(!s.profile)add('ONBOARDING_REJECTED','P1',{failure:s.onboardingFailure,configuration:persona.onboarding},'راجع تغطية التركيبة المدعومة؛ احتفظ بالرفض ولا تتجاوز الحماية.','server/coaching.mjs:generate / planner-core.mjs:makeWeek');
 if(plan&&!foodDay)add('EXPIRED_OR_MISSING_DAY','P1',{planId:plan.id,lastDate:plan.days.at(-1)?.date,date,renewalError:s.simulation?.renewalError},'وفّر مسار تجديد آمن مع تفسير تعذر إنشاء يوم جديد.','server/simulation.mjs:simulationCommand');
 for(const meal of foodDay?.meals||[]){
  const snap=meal.snapshot;
  if(snap.is_approximate)nutrition.estimated++;
  for(const k of metrics){
   const values=snap.ingredients.map(i=>({g:Number(i.grams),v:i.values_per_100g?.[k]})),allKnown=values.length&&values.every(x=>x.v!=null&&Number.isFinite(Number(x.v)));
   const actual=snap.values?.[k];if(actual==null)nutrition.unknown++;else nutrition.known++;
   if(!allKnown&&actual!=null&&Number(actual)===0)add('UNKNOWN_CONVERTED_TO_ZERO','P0',{mealId:meal.id,metric:k,actual,ingredients:values},'احتفظ بالقيمة المجهولة NULL ولا تعتبرها صفرًا.','planner-core.mjs:snapshotTemplate');
   if(allKnown&&actual!=null){const expected=values.reduce((n,x)=>n+x.g*Number(x.v)/100,0);if(Math.abs(expected-Number(actual))>Math.max(.15,Math.abs(expected)*.001))add('NUTRIENT_ARITHMETIC','P1',{mealId:meal.id,metric:k,expected,actual},'راجع ضرب القيم المرجعية في الكمية والتقريب.','planner-core.mjs:snapshotTemplate');}
  }
  for(const ing of snap.ingredients){
   const ref=library.ingredients[ing.key];nutrition.ingredientKeys.push(ing.key);if(ing.reference?.locator&&ing.source)nutrition.referenceIngredients++;else nutrition.unreferencedIngredients++;
   if(ing.role==='protein')nutrition.proteinSources.push(ing.key);if(ing.role==='carb')nutrition.carbSources.push(ing.key);if(ing.role==='fat')nutrition.fatSources.push(ing.key);
   if(!ref)add('UNKNOWN_CATALOG_INGREDIENT','P1',{ing},'اربط كل مكون بمصدر النظام.');
   const excluded=s.preferences?.excludedGroups||[],groups=[...(ref?.groups||[]),...(ref?.tags||[]),ref?.group,ref?.protein_group,ing.key].filter(Boolean);
   if(excluded.some(g=>distinctTasteKeys[g]?distinctTasteKeys[g].has(ing.key):groups.includes(g)))add('FOOD_EXCLUSION','P0',{ingredient:ing.key,groups,excluded,mealId:meal.id},'طبّق استبعاد الصنف على جميع مراحل التخطيط والبدائل.','planner-core.mjs:ingredientAllowed');
   const animal=['chicken','fish','meat'].includes(ref?.protein_group)||['beef','lamb','liver','turkey','shrimp','salmon','tuna','seabass','shawarma_chicken','shawarma_beef'].includes(ing.key),dairyEgg=['egg','eggwhite','friedegg','milk','wholemilk','yogurt','greekyogurt','cottage','feta','mozzarella'].includes(ing.key);
   if((s.preferences?.diet==='vegan'&&(animal||dairyEgg))||(s.preferences?.diet==='vegetarian'&&animal))add('DIET_RESTRICTION','P0',{ingredient:ing.key,diet:s.preferences.diet,mealId:meal.id},'راجع المكونات الحيوانية في النظام النباتي.','diet-patterns.mjs');
   const diseases=new Set(persona.onboarding?.diseases||s.profile?.diseases||[]);
   if(diseases.has('favism')&&(ing.key==='fava'||ing.key==='falafel'||ing.key.includes('fava')))add('FAVISM_CONTRAINDICATION','P0',{ingredient:ing.key,mealId:meal.id},'استبعد الفول والفلافل لمريض أنيميا الفول.','diet-patterns.mjs');
   if(diseases.has('lactose_intolerance')&&['milk','wholemilk','yogurt','greekyogurt','cheese','cottage','feta','mozzarella'].includes(ing.key))add('LACTOSE_CONTRAINDICATION','P0',{ingredient:ing.key,mealId:meal.id},'استبعد الألبان لمريض حساسية اللاكتوز.','diet-patterns.mjs');
   if(diseases.has('gout')&&['liver','shrimp','lamb','beef','shawarma_beef','fava'].includes(ing.key))add('GOUT_CONTRAINDICATION','P0',{ingredient:ing.key,mealId:meal.id},'استبعد مصادر البيورين العالية لمريض النقرس.','diet-patterns.mjs');
   if(diseases.has('cholesterol')&&['lamb','liver','wholemilk','shawarma_beef'].includes(ing.key))add('CHOLESTEROL_CONTRAINDICATION','P0',{ingredient:ing.key,mealId:meal.id},'استبعد الدهون المشبعة العالية لمريض الكوليسترول.','diet-patterns.mjs');
   if(diseases.has('hypertension')&&['feta','bread','shawarma_chicken','shawarma_beef','tabbouleh','fattoush','babaghanouj'].includes(ing.key))add('HYPERTENSION_FOOD_RESTRICTION','P0',{ingredient:ing.key,mealId:meal.id},'استبعد الأطعمة عالية الصوديوم لمريض الضغط.','diet-patterns.mjs');
   if(diseases.has('ibs')&&['fava','kidney','whitebeans','chickpeas','falafel','cabbage','onion','garlic'].includes(ing.key))add('IBS_CONTRAINDICATION','P0',{ingredient:ing.key,mealId:meal.id},'استبعد الفودماب العالي لمريض القولون العصبي.','diet-patterns.mjs');
   if(diseases.has('celiac')&&['bread','pasta','flour','wheat'].includes(ing.key))add('CELIAC_CONTRAINDICATION','P0',{ingredient:ing.key,mealId:meal.id},'استبعد الجلوتين لمريض السيلياك.','diet-patterns.mjs');
  }
 }
 if(foodDay){
  const diseases=new Set(persona.onboarding?.diseases||s.profile?.diseases||[]);
  if((diseases.has('gout')||diseases.has('cholesterol')||diseases.has('diabetes'))&&s.preferences?.diet==='keto')add('KETO_DISEASE_CONTRAINDICATION','P0',{diet:'keto',diseases:[...diseases]},'الكيتو محظور مع هذه الحالة الطبية.','diet-patterns.mjs');
  if(diseases.has('hypertension')&&foodDay.summary?.values?.sodium!=null&&Number(foodDay.summary.values.sodium)>2300)add('HYPERTENSION_SODIUM_LIMIT','P0',{sodium:foodDay.summary.values.sodium},'صوديوم اليوم يتجاوز 2300 ملجم لمريض الضغط.','diet-patterns.mjs');
  const target=foodDay.targets||plan.targets,energy=foodDay.summary.values.energy,protein=foodDay.summary.values.protein;
  nutrition.energyRatio=energy==null?null:Number(energy)/target.energy;nutrition.proteinRatio=protein==null?null:Number(protein)/target.protein;
  if(nutrition.energyRatio!==null&&Math.abs(nutrition.energyRatio-1)>.12)add('PLAN_ENERGY_TARGET_GAP','P1',{planId:plan.id,target:target.energy,actual:energy,ratio:nutrition.energyRatio},'حسّن تغطية الوجبات مع الاحتفاظ بقيود الأمان.','planner-core.mjs:makeWeek');
  if(nutrition.proteinRatio!==null&&nutrition.proteinRatio<.85)add('PLAN_PROTEIN_TARGET_GAP','P1',{planId:plan.id,target:target.protein,actual:protein,ratio:nutrition.proteinRatio},'راجع تغطية البروتين ووضوح عجز المكتبة.','planner-core.mjs:makeWeek');
 }
 const workout={missing:s.workoutPlan?.coverage?.missingPatternsCount??null,exercises:0,sets:0,patterns:[],weeklySets:{},minutes:[]};
 for(const d of s.workoutPlan?.days||[]){
  let sec=300;for(const e of d.exercises){workout.exercises++;workout.sets+=e.sets;workout.patterns.push(e.pattern);const lateral=['unilateral','alternating'].includes(e.laterality)?2:1;sec+=e.sets*e.repMax*3*lateral+(e.sets-1)*e.restSeconds+60;
   for(const inj of s.onboarding.workoutPrefs.injuries||[])if(bans[inj]?.includes(e.pattern)||names[inj]?.test(e.name))add('INJURY_EXCLUSION','P0',{injury:inj,exerciseId:e.id,name:e.name,pattern:e.pattern},'استبعد الحركة قبل حفظ الخطة وراجع البديل.','server/workouts.mjs:workoutPlan');
   if(d.location==='home'){const allowed=new Set(['bodyweight',...(s.onboarding.workoutPrefs.homeEquipment||[]).flatMap(x=>equipment[x]||[])]);if(e.equipment.some(q=>!allowed.has(q.equipment_id)))add('UNAVAILABLE_EQUIPMENT','P0',{exerciseId:e.id,required:e.equipment,allowed:[...allowed]},'تحقق من كل المعدات المطلوبة، لا المعدة الرئيسية فقط.','server/workouts.mjs:equipmentAllowed');}
  }
  const minutes=Math.ceil(sec/60);workout.minutes.push(minutes);if(minutes>Number(s.onboarding.workoutPrefs.sessionDuration)+1)add('SESSION_TIME_OVERRUN','P2',{dayIndex:d.dayIndex,estimatedMinutes:minutes,available:s.onboarding.workoutPrefs.sessionDuration},'أعد حساب الوقت بعد إضافة المجموعات والبدائل.','server/workouts.mjs:estimatedSessionMinutes');
 }
 if(workout.missing>0)add('WORKOUT_COVERAGE_GAP','P2',{missing:s.workoutPlan.days.flatMap(d=>d.missing||[]),coverage:s.workoutPlan.coverage},'اشرح حركات التدريب الناقصة ووفّر بدائل مناسبة للمعدات والإصابة.','server/workouts.mjs:workoutPlan');
 const todayLogs=(s.workoutLogs||[]).filter(x=>x.date===date),check=(s.checkins||[]).find(x=>x.date===date);
 if((check?.pain||check?.illness||todayLogs.some(l=>l.sets.some(x=>x.pain)))&&s.recovery?.progressionAllowed)add('PROGRESSION_WITH_PAIN','P0',{check,todayLogs,recovery:s.recovery},'أوقف اقتراح زيادة الحمل مع ألم حديث.','server/recovery.mjs:recovery');
 for(const a of s.adaptations||[]){if(a.status==='pending'&&a.kind==='calories'&&a.coverage&&(a.coverage.completeFoodDays<10||a.coverage.previousWeights<3||a.coverage.currentWeights<3))add('CALORIE_CHANGE_WITHOUT_EVIDENCE','P0',{proposal:a},'اشترط تغطية التسجيل والقياسات قبل التعديل.','server/recovery.mjs:calorieReview');}
 const allLogs=['foodEntries','weights','waterLogs','workoutLogs','sessions','checkins','activityLogs'];
 for(const k of allLogs){const a=s[k]||[];if(a.some(x=>x.date>date))add('FUTURE_DATA','P0',{collection:k,future:a.filter(x=>x.date>date)},'ارفض التسجيل المستقبلي وعزل الزمن الافتراضي.');const ids=a.map(x=>x.id).filter(Boolean);if(new Set(ids).size!==ids.length)add('DUPLICATE_RECORD_IDS','P1',{collection:k},'حافظ على تفرّد معرفات السجلات.');}
 let expected=bundle.revisionBefore;
 for(const rec of records){
  if(rec.request.body?.action==='simulation_fill')add('FORBIDDEN_FILL','P0',{eventId:rec.eventId},'لا تستخدم سيناريوهات التعبئة.');
  if(rec.status>=500)add('HTTP_ENGINE_FAILURE','P1',{eventId:rec.eventId,status:rec.status,response:rec.response},'عالج سبب الفشل وأعد نفس الطلب.');
  if(rec.status>=400&&rec.status<500)add('REQUEST_REJECTION','P2',{eventId:rec.eventId,status:rec.status,action:rec.request.body?.action,response:rec.response},'راجع سبب الرفض وميّز رفض الأمان عن فجوة التغطية.');
  if(rec.response.profile?.name&&rec.response.profile.name!==persona.onboarding.name)add('CROSS_ACCOUNT_DATA','P0',{eventId:rec.eventId,name:rec.response.profile.name},'أصلح عزل الهوية والتخزين.');
 }
 const recordedFood=s.foodEntries?.filter(x=>x.date===date)||[],actualEaten=bundle.behavior.food.filter(x=>x.eaten).length;
 return {issues,nutrition,workout,missing:{food:recordedFood.length===0,weight:!(s.weights||[]).some(x=>x.date===date),water:!(s.waterLogs||[]).some(x=>x.date===date),recovery:!check,steps:!(s.activityLogs||[]).some(x=>x.date===date)},observability:{actualPlannedMeals:actualEaten,recordedMeals:recordedFood.length,hiddenPlannedMeals:bundle.behavior.food.filter(x=>x.eaten&&!x.logged).length,checkinKnown:!!check},safetyPassed:!issues.some(x=>x.severity==='P0'),ruleCoverage:{nutrientArithmetic:'independent ingredient multiplication',targetFit:'12% energy / 15% protein product tolerance',injuries:'declared conservative movement/name exclusion policy',equipment:'all required equipment',clinicalEffectiveness:'not evaluated',medicalMicronutrientAppropriateness:'not fully evaluated',messageSemanticContradictions:'requires targeted human review; exact strings retained'}};
}
