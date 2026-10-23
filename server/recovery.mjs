import {clockNow,isoNow,clockDate} from './clock.mjs';
import {eachSide} from './workouts.mjs';
import {localDate,dateOffset,MUSCLE_REGIONS,validDate} from '../coaching-shared.mjs';
const DAY=86400000;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const reportComplete=c=>Number.isFinite(c.sleepHours)&&c.sleepHours>=0&&c.sleepHours<=24&&Number.isInteger(c.sleepQuality)&&c.sleepQuality>=1&&c.sleepQuality<=5&&Number.isInteger(c.fatigue)&&c.fatigue>=1&&c.fatigue<=5&&['pain','illness','redFlags'].every(k=>typeof c[k]==='boolean');
const validReports=(reports,now,days)=>[...new Map(reports.filter(c=>reportComplete(c)&&Number.isFinite(Date.parse(c.at))&&Date.parse(c.at)<=now&&Date.parse(c.at)>=now-days*DAY&&!c.illness&&!c.redFlags).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).map(c=>[c.date||localDate(Date.parse(c.at)),c])).values()];
export function chronologicalExposures(logs,now=clockNow(),days=28){
 const start=dateOffset(localDate(now),-(days-1)),end=localDate(now),dated=logs.map(l=>({...l,date:l.date||l.at?.slice(0,10)})).filter(l=>validDate(l.date)&&l.date>=start&&l.date<=end);
 return [...new Map(dated.sort((a,b)=>a.date.localeCompare(b.date)||(Date.parse(a.at)||0)-(Date.parse(b.at)||0)).map(l=>[l.date,l])).values()];
}
export function recovery(checkins, now=clockNow(),workoutLogs=[]){
 const fresh=checkins.filter(c=>Date.parse(c.at)<=now&&now-Date.parse(c.at)<=DAY).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);
 const coverage=validReports(checkins,now,14);const baselineReports=validReports(checkins.filter(c=>(c.date||c.at?.slice(0,10))<(fresh?.date||fresh?.at?.slice(0,10)||localDate(now))),now,28);
 const baselineReady=baselineReports.length>=7;
 const baseline=baselineReady?{sleepHours:mean(baselineReports.map(c=>c.sleepHours)),fatigue:mean(baselineReports.map(c=>c.fatigue)),reports:baselineReports.length}:null;
 const base={confidence:coverage.length>=14?'high':baselineReady?'medium':'low',baselineReady,baseline,coverage:coverage.length,muscles:{},setFactor:1,progressionAllowed:false};
 if(fresh?.redFlags===true)return {...base,status:'stop',reasons:['أوقف التمرين واطلب تقييمًا طبيًا عاجلًا مع ألم الصدر أو الدوخة الشديدة.'],setFactor:0};
 const newPain=workoutLogs.some(l=>validDate(l.date)&&l.date>=dateOffset(localDate(now),-1)&&l.date<=localDate(now)&&Date.parse(l.at)<=now&&Date.parse(l.at)>=now-DAY&&(!fresh||Date.parse(l.at)>Date.parse(fresh.at))&&l.sets?.some(set=>set.pain===true));
 if(newPain)return {...base,status:'hold',reasons:['سجلت ألمًا أثناء تمرين بعد آخر متابعة؛ أوقف الحركة المؤلمة وسجّل تقييم استشفاء جديدًا قبل زيادة الحمل.']};
 if(!fresh||!reportComplete(fresh))return {...base,status:'unknown',reasons:['سجّل النوم والإجهاد والألم قبل التمرين؛ غياب البيانات مش معناه استشفاء كامل.']};
 const domains=[];const reasons=[];
 if(fresh.sleepHours<6||fresh.sleepQuality<=2||(baseline?.sleepHours&&fresh.sleepHours<baseline.sleepHours-1.5)){domains.push('sleep');reasons.push('النوم قليل أو جودته ضعيفة مقارنة باحتياجك المعتاد');}
 if(fresh.fatigue>=4||(baseline?.fatigue&&fresh.fatigue>=baseline.fatigue+1.5)){domains.push('fatigue');reasons.push('الإجهاد أعلى من المعتاد');}
 if(fresh.stress>=4){domains.push('stress');reasons.push('الضغط النفسي مرتفع');}
 const regional=Object.entries(fresh.sorenessByRegion||{});
 if(fresh.soreness>=7||regional.some(([,v])=>v>=7)){domains.push('soreness');reasons.push('في عضلات ألمها بعد التمرين مرتفع');}
 const pains=new Set(fresh.painRegions||[]);
 for(const key of Object.keys(MUSCLE_REGIONS)){
  const score=fresh.sorenessByRegion?.[key];base.muscles[key]={soreness:score??null,status:pains.has(key)?'hold':score==null?'unknown':score>=7?'caution':'ready'};
 }
 if(fresh.redFlags)return {...base,status:'stop',reasons:['أوقف التمرين واطلب تقييمًا طبيًا عاجلًا مع ألم الصدر أو الدوخة الشديدة.'],setFactor:0};
 if(fresh.pain||fresh.illness)return {...base,status:'hold',reasons:[fresh.illness?'أعراض المرض تستدعي تأجيل التمرين حتى تتحسن.':'في ألم جديد: أوقف الحركة المؤلمة واطلب تقييمًا متخصصًا إذا استمر.']};
 const recent=validReports(checkins,now,7);const difficult=recent.filter(c=>[c.sleepHours<6||c.sleepQuality<=2,c.fatigue>=4,c.stress>=4,c.soreness>=7||Object.values(c.sorenessByRegion||{}).some(v=>v>=7)].filter(Boolean).length>=2).length;
 const performanceDrop=hasPerformanceDrop(workoutLogs,now);
 const status=domains.length>=3||(difficult>=3&&performanceDrop)?'high':domains.length>=2||difficult>=3?'caution':'ready';
 if(difficult>=3)reasons.push('تكرار ضعف الاستشفاء 3 أيام خلال الأسبوع');
 if(performanceDrop&&difficult>=3)reasons.push('مع انخفاض أداء في جلسات قابلة للمقارنة');
 return {...base,status,reasons:reasons.length?reasons:['البيانات الحالية تسمح بتمرينك المعتاد؛ راقب إحساسك أثناء الحركة.'],setFactor:status==='high'?.6:status==='caution'?.8:1,progressionAllowed:status==='ready',domains,asOf:fresh.at};
}
export function hasPerformanceDrop(logs,now=clockNow()){
 const grouped=new Map();for(const l of logs){if(!l.sets?.length||l.sets.some(s=>s.pain)||eachSide(l)&&l.bothSides!==true)continue;const k=l.exerciseId+'|'+l.loadMode+'|'+(l.progressionKey||l.planId);const a=grouped.get(k)||[];a.push(l);grouped.set(k,a);}
 for(const records of grouped.values()){
  const byDate=chronologicalExposures(records,now,14).slice(-2);if(byDate.length<2)continue;
  const [a,b]=byDate;if(a.sets.length!==b.sets.length||a.sets.some((s,i)=>s.kg!==b.sets[i].kg))continue;
  const sum=x=>x.sets.reduce((v,s)=>v+s.reps,0);if(sum(b)<sum(a)*.9)return true;
 }
 return false;
}
export function calorieReview(weights,foodDays,goal,energy,now=clockNow(),lastChange=0){
 const end=localDate(now),start=dateOffset(end,-13),middle=dateOffset(end,-6);
 if(lastChange&&now-lastChange<14*DAY)return {action:'hold',reason:'نحتاج 14 يومًا بعد آخر تعديل.'};
 const recent=[...new Map(weights.filter(x=>x.date>=start&&x.date<=end&&Number.isFinite(x.kg)).map(x=>[x.date,x])).values()];
 const a=recent.filter(x=>x.date<middle),b=recent.filter(x=>x.date>=middle);
 const completed=[...new Map(foodDays.filter(x=>x.complete&&x.energy>0&&x.adherence>=80&&x.date>=start&&x.date<=end).map(x=>[x.date,x])).values()];
 const coverage={previousWeights:a.length,currentWeights:b.length,completeFoodDays:completed.length};
 if(a.length<3||b.length<3||completed.length<10)return {action:'hold',reason:'نحتاج 3 قياسات وزن في كل أسبوع و10 أيام أكل مكتملة قريبة من الخطة خلال أسبوعين.',coverage};
 const rate=(mean(b.map(x=>x.kg))-mean(a.map(x=>x.kg)))/mean(a.map(x=>x.kg))*100;
 let delta=0;if(goal==='lose')delta=rate>-.25?-1:rate< -1?1:0;
 if(['gain','muscle_gain'].includes(goal))delta=rate<.1?1:rate>.5?-1:0;
 if(['maintain','recomposition'].includes(goal))delta=rate<-.5?1:rate>.5?-1:0;
 if(!delta)return {action:'hold',reason:'اتجاه الوزن مناسب؛ مفيش تعديل سعرات مطلوب دلوقتي.',rate,coverage};
 return {action:'propose',delta:delta*Math.min(150,Math.floor(energy*.05)),rate,coverage,reason:`متوسط الوزن اتغير ${rate.toFixed(2)}% في الأسبوع مع بيانات كافية؛ نقترح تعديلًا صغيرًا بموافقتك.`};
}
export function progression(exercise,logs,readiness){
 const compatible=logs.filter(l=>l.exerciseId===exercise.id&&l.loadMode===exercise.loadMode&&(exercise.progressionKey?l.progressionKey===exercise.progressionKey:!exercise.planId||l.planId===exercise.planId));
 const last=chronologicalExposures(compatible).slice(-2);
 if(!readiness.progressionAllowed||last.length<2)return {action:'hold'};
 if(eachSide(exercise)&&!last.every(l=>l.bothSides===true))return {action:'hold',reason:'نحتاج تأكيد إتمام الجانبين بأداء الجانب الأضعف.'};
 if(!last.every(l=>l.sets.length===exercise.sets&&l.sets.every(s=>!s.pain&&s.reps>=exercise.repMax&&s.rir!=null&&s.rir>=exercise.rir)))return {action:'hold'};
 const kg=last[1].sets[0].kg;
 if(!last.every(l=>l.sets.every(s=>s.kg===kg)))return {action:'hold',reason:'المجموعات مش بنفس الحمل؛ نحتاج جلستين قابلتين للمقارنة.'};
 const increment=last[1].increment;
 if(exercise.loadMode==='bodyweight')return {action:'hold',reason:'وزن الجسم لا يزيد آليًا؛ تابع التكرارات والتكنيك وسجّل الوزن الإضافي فقط لو مستخدم.'};
 if(!increment||!kg||increment>kg*.05)return {action:'hold',reason:'أكد أصغر زيادة متاحة؛ لا نفترض وزنًا للمعدات.'};
 return {action:'increase',kg:Math.max(0,kg+(exercise.loadMode==='assisted'?-increment:increment)),reason:'أتممت الحد الأعلى للتكرارات مرتين مع احتياطي تكرارات مناسب وبدون ألم.'};
}
