import {coachingSafetyHold} from '../coaching-journey.mjs';
import {usesKg} from '../exercise-load.mjs';
import {clockNow,isoNow,clockDate,clockTimeZone} from './clock.mjs';
import {eachSide} from './workouts.mjs';
import {localDate,dateOffset,MUSCLE_REGIONS,validDate} from '../coaching-shared.mjs';
const DAY=86400000;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const reportComplete=c=>Number.isFinite(c.sleepHours)&&c.sleepHours>=0&&c.sleepHours<=24&&Number.isInteger(c.sleepQuality)&&c.sleepQuality>=1&&c.sleepQuality<=5&&Number.isInteger(c.fatigue)&&c.fatigue>=1&&c.fatigue<=5&&['pain','illness','redFlags'].every(k=>typeof c[k]==='boolean');
const validReports=(reports,now,days,tz='Africa/Cairo')=>[...new Map(reports.filter(c=>reportComplete(c)&&Number.isFinite(Date.parse(c.at))&&Date.parse(c.at)<=now&&Date.parse(c.at)>=now-days*DAY&&!c.illness&&!c.redFlags).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).map(c=>[c.date||localDate(Date.parse(c.at),tz),c])).values()];
export function chronologicalExposures(logs,now=clockNow(),days=28,tz=clockTimeZone()){
 const start=dateOffset(localDate(now,tz),-(days-1)),end=localDate(now,tz),dated=logs.map(l=>({...l,date:l.date||l.at?.slice(0,10)})).filter(l=>validDate(l.date)&&l.date>=start&&l.date<=end);
 return [...new Map(dated.sort((a,b)=>a.date.localeCompare(b.date)||(Date.parse(a.at)||0)-(Date.parse(b.at)||0)).map(l=>[l.date,l])).values()];
}
export function recovery(checkins, now=clockNow(),workoutLogs=[],tz=clockTimeZone()){
 const fresh=checkins.filter(c=>Date.parse(c.at)<=now&&now-Date.parse(c.at)<=DAY).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);
 const coverage=validReports(checkins,now,14,tz);const baselineReports=validReports(checkins.filter(c=>(c.date||c.at?.slice(0,10))<(fresh?.date||fresh?.at?.slice(0,10)||localDate(now,tz))),now,28,tz);
 const baselineReady=baselineReports.length>=7;
 const baseline=baselineReady?{sleepHours:mean(baselineReports.map(c=>c.sleepHours)),fatigue:mean(baselineReports.map(c=>c.fatigue)),reports:baselineReports.length}:null;
 const base={confidence:coverage.length>=14?'high':baselineReady?'medium':'low',baselineReady,baseline,coverage:coverage.length,muscles:{},setFactor:1,progressionAllowed:false,reviewScope:'system_generated_guidance'};
 if(fresh?.redFlags===true)return {...base,status:'stop',reasonCode:'RED_FLAGS_STOP',reasons:['تنبيه طبي عاجل: أوقف التمرين فوراً واطلب تقييماً طبياً للاطمئنان مع وجود ألم الصدر أو الدوخة الشديدة.'],setFactor:0};
 const newPain=workoutLogs.some(l=>validDate(l.date)&&l.date>=dateOffset(localDate(now,tz),-1)&&l.date<=localDate(now,tz)&&Date.parse(l.at)<=now&&Date.parse(l.at)>=now-DAY&&(!fresh||Date.parse(l.at)>Date.parse(fresh.at))&&l.sets?.some(set=>set.pain===true));
 if(newPain)return {...base,status:'hold',reasonCode:'WORKOUT_PAIN_HOLD',reasons:['لأنك سجلت ألمًا أثناء التمرين الأخير، أوقفنا اقتراح زيادة الحمل. حدّث حالتك قبل مراجعة المجهود المناسب.']};
 if(!fresh||!reportComplete(fresh))return {...base,status:'unknown',reasonCode:'CHECKIN_MISSING_OR_STALE',reasons:['محرك المتابعة الآلي في انتظار تسجيل حالتك اليومية (النوم والطاقة) لضبط حمل تمرين النهاردة بأمان.']};
 const domains=[];const reasons=[];
 if(fresh.sleepHours<6||fresh.sleepQuality<=2||(baseline?.sleepHours&&fresh.sleepHours<baseline.sleepHours-1.5)){domains.push('sleep');reasons.push(fresh.sleepHours<6||fresh.sleepQuality<=2?`آخر نوم سجلته ${fresh.sleepHours} ساعات وجودته ${fresh.sleepQuality} من ٥؛ الراحة تحتاج اهتمام قبل زيادة المجهود`:`آخر نوم سجلته ${fresh.sleepHours} ساعات، أقل من متوسط متابعاتك السابقة ${Math.round(baseline.sleepHours*10)/10} ساعات`);}
 if(fresh.fatigue>=4||(baseline?.fatigue&&fresh.fatigue>=baseline.fatigue+1.5)){domains.push('fatigue');reasons.push(fresh.fatigue>=4?`التعب المسجل في آخر متابعة ${fresh.fatigue} من ٥`:`التعب المسجل ${fresh.fatigue} من ٥، أعلى من متوسط متابعاتك السابقة ${Math.round(baseline.fatigue*10)/10}`);}
 if(fresh.stress>=4){domains.push('stress');reasons.push(`الضغط المسجل في آخر متابعة ${fresh.stress} من ٥، وهنراعيه في المجهود`);}
 const regional=Object.entries(fresh.sorenessByRegion||{});
 if(fresh.soreness>=7||regional.some(([,v])=>v>=7)){domains.push('soreness');reasons.push('سجلت شدًا عضليًا مرتفعًا في آخر متابعة؛ هنراعيه عند اقتراح المجهود');}
 const pains=new Set(fresh.painRegions||[]);
 for(const key of Object.keys(MUSCLE_REGIONS)){
  const score=fresh.sorenessByRegion?.[key];base.muscles[key]={soreness:score??null,status:pains.has(key)?'hold':score==null?'unknown':score>=7?'caution':'ready'};
 }
 if(fresh.redFlags)return {...base,status:'stop',reasonCode:'RED_FLAGS_STOP',reasons:['تنبيه طبي عاجل: أوقف التمرين فوراً واطلب تقييماً طبياً للاطمئنان مع وجود ألم الصدر أو الدوخة الشديدة.'],setFactor:0};
 if(fresh.pain||fresh.illness)return {...base,status:'hold',reasonCode:fresh.illness?'ILLNESS_HOLD':'JOINT_PAIN_HOLD',reasons:[fresh.illness?'توجيه النظام الآلي: صحتك أولاً — أجّل تمرين النهاردة لحد تقييم الأعراض وتحسنها؛ سجل المرض وحده مش بيحدد نوعه.':'توجيه النظام الآلي للتدريب: مع وجود ألم مفصلي، وقّف الحركة المؤلمة النهاردة وبدّلها أو ارتاح لحماية مفاصلك.']};
 const recent=validReports(checkins,now,7,tz);const difficult=recent.filter(c=>[c.sleepHours<6||c.sleepQuality<=2,c.fatigue>=4,c.stress>=4,c.soreness>=7||Object.values(c.sorenessByRegion||{}).some(v=>v>=7)].filter(Boolean).length>=2).length;
 const performanceDrop=hasPerformanceDrop(workoutLogs,now,tz);
 const status=domains.length>=3||(difficult>=3&&performanceDrop)?'high':domains.length>=2||difficult>=3?'caution':'ready';
 if(difficult>=3)reasons.push('لاحظنا إجهادًا في ٣ متابعات أو أكتر خلال آخر ٧ أيام');
 if(performanceDrop&&difficult>=3)reasons.push('مع هبوط بسيط في الأداء محتاج استشفاء');
 return {...base,status,reasonCode:status==='ready'?'RECOVERY_READY':'RECOVERY_DELOAD_SUGGESTED',reasons:reasons.length?reasons:['متابعة الاستشفاء الحالية تسمح بالتمرين المعتاد مع مراقبة إحساسك.'],setFactor:status==='high'?.6:status==='caution'?.8:1,progressionAllowed:status==='ready',domains,asOf:fresh.at};
}
export function accountRecovery(s,now=clockNow(),tz=s.profile?.timezone||clockTimeZone()){
 const result=recovery(s.checkins||[],now,s.workoutLogs||[],tz);
 if(result.status!=='stop'&&coachingSafetyHold(s,localDate(now,tz)))return {...result,status:'hold',progressionAllowed:false,reasonCode:'FEEDBACK_PAIN_HOLD',reasons:['سجلت الألم كعائق للتمرين. أوقف الحركة المؤلمة وحدّث حالتك قبل أي زيادة في المجهود.']};
 return result;
}
export function hasPerformanceDrop(logs,now=clockNow(),tz=clockTimeZone()){
 const grouped=new Map();for(const l of logs){if(!l.sets?.length||l.sets.some(s=>s.pain)||eachSide(l)&&l.bothSides!==true)continue;const k=l.exerciseId+'|'+l.loadMode+'|'+(l.progressionKey||l.planId);const a=grouped.get(k)||[];a.push(l);grouped.set(k,a);}
 for(const records of grouped.values()){
  const byDate=chronologicalExposures(records,now,14,tz).slice(-2);if(byDate.length<2)continue;
  const [a,b]=byDate,sum=x=>x.sets.reduce((v,s)=>v+s.reps,0);
  const avgKg=x=>x.sets.reduce((v,s)=>v+s.kg,0)/x.sets.length;
  if(a.sets.length===b.sets.length&&a.sets.every((s,i)=>s.kg===b.sets[i].kg)&&sum(b)<sum(a)*.9)return true;
  if(avgKg(a)>0&&avgKg(b)<avgKg(a)*.9&&b.sets.every(s=>s.rir!=null&&s.rir<=1))return true;
 }
 return false;
}
export function workoutProgressionSummary(workoutPlan,logs=[],now=clockNow(),tz=clockTimeZone()){
 const loadIncreases=[],loadDecreases=[],repIncreases=[],readyForNextLoad=[];
 if(!workoutPlan?.days)return {loadIncreases,loadDecreases,repIncreases,readyForNextLoad,summaryText:'لا توجد تمارين مسجلة بعد.'};
 const seen=new Set();
 for(const day of workoutPlan.days){
  for(const ex of day.exercises||[]){
   if(seen.has(ex.id))continue;
   seen.add(ex.id);
   const compatible=logs.filter(l=>l.exerciseId===ex.id&&(ex.progressionKey?l.progressionKey===ex.progressionKey:l.planId===workoutPlan.id)&&l.sets?.length);
   const hist=chronologicalExposures(compatible,now,14,tz);
   if(!hist.length)continue;
   const latest=hist.at(-1);
   const latestKg=Math.round(latest.sets.reduce((v,s)=>v+Number(s.kg||0),0)/latest.sets.length*10)/10;
   const latestReps=latest.sets.reduce((v,s)=>v+Number(s.reps||0),0);
   if(ex.suggestedKg!=null){
    readyForNextLoad.push({exerciseId:ex.id,name:ex.name,kg:latestKg,suggestedKg:ex.suggestedKg});
   }
   if(hist.length>=2){
    const prev=hist.at(-2);
    const prevKg=Math.round(prev.sets.reduce((v,s)=>v+Number(s.kg||0),0)/prev.sets.length*10)/10;
    const prevReps=prev.sets.reduce((v,s)=>v+Number(s.reps||0),0);
    if(latestKg>prevKg){
     loadIncreases.push({exerciseId:ex.id,name:ex.name,fromKg:prevKg,toKg:latestKg,deltaKg:Math.round((latestKg-prevKg)*10)/10,date:latest.date});
    }else if(latestKg<prevKg){
     const fatigueDrop=latest.sets.some(s=>s.rir!=null&&s.rir<=1)||latestReps<prevReps;
     loadDecreases.push({exerciseId:ex.id,name:ex.name,fromKg:prevKg,toKg:latestKg,deltaKg:Math.round((prevKg-latestKg)*10)/10,date:latest.date,fatigueDrop});
    }else if(latestReps>prevReps){
     repIncreases.push({exerciseId:ex.id,name:ex.name,kg:latestKg,fromReps:prevReps,toReps:latestReps,date:latest.date});
    }
   }
  }
 }
 const parts=[];
 if(loadIncreases.length)parts.push(`زودت أوزانك في (${loadIncreases.map(x=>`${x.name}: ${x.fromKg}←${x.toKg} كجم`).join('، ')})`);
 if(repIncreases.length)parts.push(`زودت عداتك في (${repIncreases.map(x=>`${x.name}: ${x.fromReps}←${x.toReps} عدة`).join('، ')})`);
 if(loadDecreases.length)parts.push(`خففت الوزن في (${loadDecreases.map(x=>`${x.name}: ${x.fromKg}←${x.toKg} كجم`).join('، ')}) ${loadDecreases.some(x=>x.fatigueDrop)?'واعتبرناه مؤشر إجهاد لحماية سعراتك وعضلاتك':'وسبب التغيير ما نقدرش نحدده من الحمل وحده'}`);
 if(readyForNextLoad.length)parts.push(`اقتراحات حمل تحتاج استشفاء مناسب قبل التطبيق في (${readyForNextLoad.map(x=>`${x.name} إلى ${x.suggestedKg} كجم`).join('، ')})`);
 return {loadIncreases,loadDecreases,repIncreases,readyForNextLoad,summaryText:parts.length?parts.join(' · '):'مفيش تغير قابل للمقارنة ظاهر في السجلات المتاحة؛ كمّل تسجيل الحمل والعدات.'};
}
export function calorieReview(weights,foodDays,goal,energy,now=clockNow(),lastChange=0,tz=clockTimeZone()){
 const end=localDate(now,tz),start=dateOffset(end,-13),middle=dateOffset(end,-6);
 if(lastChange&&now-lastChange<14*DAY)return {action:'hold',reasonCode:'COOLDOWN_14D',reviewScope:'system_generated_guidance',reason:'محرك التغذية الآلي يتابع استجابة جسمك لآخر تعديل (ننتظر 14 يوماً للحكم بدقة على النتائج).'};
 const recent=[...new Map(weights.filter(x=>x.date>=start&&x.date<=end&&Number.isFinite(x.kg)).map(x=>[x.date,x])).values()];
 const a=recent.filter(x=>x.date<middle),b=recent.filter(x=>x.date>=middle);
 const completed=[...new Map(foodDays.filter(x=>x.complete&&x.energy>0&&x.adherence>=80&&x.date>=start&&x.date<=end).map(x=>[x.date,x])).values()];
 const coverage={previousWeights:a.length,currentWeights:b.length,completeFoodDays:completed.length};
 if(a.length<3||b.length<3||completed.length<10)return {action:'hold',reasonCode:'INSUFFICIENT_EVIDENCE_COVERAGE',reviewScope:'system_generated_guidance',reason:'توجيه النظام الآلي للتغذية: مكملين على خطتك الحالية لحد ما يكتمل تسجيل 3 أوزان في كل أسبوع و10 أيام التزام بالأكل علشان نعدل سعراتك بدقة.',coverage};
 const elapsedDays=(mean(b.map(x=>Date.parse(x.date+'T12:00:00Z')))-mean(a.map(x=>Date.parse(x.date+'T12:00:00Z'))))/DAY;
 if(elapsedDays<4)return {action:'hold',reasonCode:'WEIGHT_SAMPLING_TOO_CLOSE',reason:'وزّع قياسات الوزن على الأسبوع قبل تقييم المعدل.'};
 const rate=(mean(b.map(x=>x.kg))-mean(a.map(x=>x.kg)))/mean(a.map(x=>x.kg))*100*7/elapsedDays;
 let delta=0;if(goal==='lose')delta=rate>-.25?-1:rate< -1?1:0;
 if(['gain','muscle_gain'].includes(goal))delta=rate<.1?1:rate>.5?-1:0;
 if(['maintain','recomposition'].includes(goal))delta=rate<-.5?1:rate>.5?-1:0;
 if(!delta)return {action:'hold',reasonCode:'TREND_ON_TRACK',reviewScope:'system_generated_guidance',reason:'توجيه النظام الآلي للتغذية: اتجاه المتوسطات داخل نطاق المتابعة الحالي؛ مفيش تعديل سعرات مقترح من البيانات دي.',rate,coverage};
 const step=delta*Math.min(150,Math.floor(energy*.05));
 return {action:'propose',reasonCode:step<0?'CALORIE_DEFICIT_STEP':'CALORIE_SURPLUS_STEP',reviewScope:'system_generated_guidance',delta:step,rate,coverage,reason:step<0?`توصية النظام الآلي للتغذية: بناءً على تسجيل الأكل واتجاه متوسط وزنك (${rate.toFixed(2)}% في الأسبوع) مقارنة بهدفك، نقترح خصم بسيط (${Math.abs(step)} سعر) مع متابعة الجوع والطاقة بعد التعديل.`:`توصية النظام الآلي للتغذية: بناءً على متوسط وزنك في الأسبوعين اللي فاتوا (${rate.toFixed(2)}%)، نقترح زيادة بسيطة (+${step} سعر) لدعم طاقتك وعضلاتك.`};
}
export function progression(exercise,logs,readiness){
 const compatible=logs.filter(l=>l.exerciseId===exercise.id&&l.loadMode===exercise.loadMode&&(exercise.progressionKey?l.progressionKey===exercise.progressionKey:!exercise.planId||l.planId===exercise.planId));
 const last=chronologicalExposures(compatible).slice(-2);
 if(!readiness.progressionAllowed||last.length<2)return {action:'hold',reasonCode:'INSUFFICIENT_EXPOSURES_OR_RECOVERY'};
 if(eachSide(exercise)&&!last.every(l=>l.bothSides===true))return {action:'hold',reasonCode:'UNILATERAL_BOTH_SIDES_REQUIRED',reason:'محرك التدريب الآلي ينصح بإتمام الجانبين بنفس القوة أولاً قبل رفع الوزن.'};
 if(!last.every(l=>l.sets.length===exercise.sets&&l.sets.every(s=>!s.pain&&s.reps>=exercise.repMax&&s.rir!=null&&s.rir>=exercise.rir)))return {action:'hold',reasonCode:'REP_OR_RIR_THRESHOLD_NOT_MET'};
 const kg=last[1].sets[0].kg;
 if(!last.every(l=>l.sets.every(s=>s.kg===kg)))return {action:'hold',reasonCode:'UNIFORM_LOAD_REQUIRED',reason:'ثبّت نفس الوزن في كل مجموعات التمرين الأول قبل الزيادة الجاية.'};
 const increment=last[1].increment??2.5;
 if(!usesKg(exercise))return {action:'hold',reasonCode:'BODYWEIGHT_PROGRESSION_REPS_ONLY',reason:'تمارين وزن الجسم بنطوّر فيها العدات والتحكم في الأداء.'};
 if(!increment||!kg||increment>kg*.05)return {action:'hold',reasonCode:'VALID_INCREMENT_REQUIRED',reason:'خطوة الحمل الحالية أكبر من الزيادة المحافظة المناسبة؛ كمّل تطوير العدات والتحكم قبل اقتراح حمل أعلى.'};
 return {action:'increase',reasonCode:'DOUBLE_PROGRESSION_READY',kg:Math.max(0,kg+(exercise.loadMode==='assisted'?-increment:increment)),reason:'عاش يا بطل! 💪 لأنك قفّلت العدات المطلوبة مرتين ورا بعض بقوة وثبات، فيه حمل مستهدف جديد مقترح؛ طبقه بس لو الحركة والاستشفاء مناسبين.'};
}
