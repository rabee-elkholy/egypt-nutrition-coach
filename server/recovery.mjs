export function recovery(checkins, now = Date.now()) {
  const fresh = checkins.filter(c => now - Date.parse(c.at) >= 0 && now - Date.parse(c.at) <= 86400000).at(-1);
  if (!fresh) return {status:'unknown',reasons:['سجّل النوم والإجهاد والألم قبل التمرين؛ غياب البيانات مش معناه استشفاء كامل.'],setFactor:1,progressionAllowed:false};
  if (fresh.redFlags) return {status:'stop',reasons:['أوقف التمرين واطلب تقييمًا طبيًا عاجلًا مع ألم الصدر أو الدوخة الشديدة.'],setFactor:0,progressionAllowed:false};
  if (fresh.pain || fresh.illness) return {status:'hold',reasons:['في ألم جديد أو مرض: أوقف الحركة المؤلمة ولا تزود الحمل؛ اطلب تقييمًا متخصصًا إذا استمر.'],setFactor:1,progressionAllowed:false};
  const reasons=[];
  if(fresh.sleepHours<6 || fresh.sleepQuality<=2) reasons.push('النوم أقل من المعتاد أو جودته ضعيفة');
  if(fresh.fatigue>=4) reasons.push('الإجهاد مرتفع');
  if(fresh.stress>=4) reasons.push('الضغط النفسي مرتفع');
  if(fresh.soreness>=7) reasons.push('ألم العضلات بعد التمرين مرتفع');
  const status=reasons.length>=3?'high':reasons.length>=2?'caution':'ready';
  const coverage=checkins.filter(c=> now-Date.parse(c.at)<14*86400000).length;
  return {status,reasons:reasons.length?reasons:['البيانات الحالية تسمح بتمرينك المعتاد؛ راقب إحساسك أثناء الحركة.'],setFactor:status==='high'?.6:status==='caution'?.8:1,progressionAllowed:status==='ready',confidence:coverage>=7?'medium':'low',baselineReady:coverage>=7};
}
export function calorieReview(weights,foodDays,goal,energy,now=Date.now(),lastChange=0){
 const since=now-14*86400000;
 if(now-lastChange<14*86400000) return {action:'hold',reason:'نحتاج 14 يومًا بعد آخر تعديل.'};
 const recent=weights.filter(x=>Date.parse(x.date)>=since&&Date.parse(x.date)<=now);
 const week=n=>recent.filter(x=>Date.parse(x.date)>=since+n*7*86400000&&Date.parse(x.date)<since+(n+1)*7*86400000);
 const a=week(0),b=week(1);
 if(a.length<3||b.length<3||foodDays.filter(x=>x.complete&&x.adherence>=80&&Date.parse(x.date)>=since&&Date.parse(x.date)<=now).length<10)return {action:'hold',reason:'نحتاج 3 قياسات وزن في كل أسبوع و10 أيام أكل مكتملة على الأقل خلال أسبوعين.'};
 const avg=x=>x.reduce((s,v)=>s+v.kg,0)/x.length;
 const rate=(avg(b)-avg(a))/avg(a)*100;
 let delta=0;
 if(goal==='lose'&&rate>-.25)delta=-1;
 if(goal==='lose'&&rate< -1)delta=1;
 if(['gain','muscle_gain'].includes(goal)&&rate<.1)delta=1;
 if(['gain','muscle_gain'].includes(goal)&&rate>.5)delta=-1;
 if(!delta)return {action:'hold',reason:'اتجاه الوزن مناسب أو الهدف لا يحتاج تعديلًا تلقائيًا.',rate};
 return {action:'propose',delta:delta*Math.min(150,Math.round(energy*.05)),rate,reason:'اقتراح بناءً على متوسطات الوزن وسجل الأكل لمدة أسبوعين؛ يحتاج موافقتك.'};
}
export function progression(exercise,logs,readiness){
 const unique=new Map();for(const l of logs.filter(l=>l.exerciseId===exercise.id&&l.loadMode===exercise.loadMode))unique.set(l.at?.slice(0,10),l);const last=[...unique.values()].slice(-2);
 if(!readiness.progressionAllowed||last.length<2)return {action:'hold'};
 if(!last.every(l=>l.sets.length===exercise.sets&&l.sets.every(s=>!s.pain&&s.reps>=exercise.repMax&&s.rir!=null&&s.rir>=exercise.rir)))return {action:'hold'};
 if(last[0].sets[0].kg!==last[1].sets[0].kg)return {action:'hold'};
 const kg=last[1].sets[0].kg,increment=last[1].increment;
 if(!increment||!kg||increment>kg*.05||exercise.loadMode==='bodyweight')return {action:'hold',reason:'أكد أصغر زيادة متاحة؛ لا نفترض وزنًا للمعدات.'};
 return {action:'increase',kg:Math.max(0,kg+(exercise.loadMode==='assisted'?-increment:increment)),reason:'أتممت الحد الأعلى للتكرارات مرتين مع احتياطي تكرارات مناسب وبدون ألم.'};
}
