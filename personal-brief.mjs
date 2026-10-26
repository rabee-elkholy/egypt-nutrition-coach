import {usesKg} from './exercise-load.mjs';
import {dateOffset,FOCUS_LABELS,effectiveSets} from './coaching-shared.mjs';
import {seedPick} from './coach-messages.mjs';
import {matchingNutritionDecline} from './nutrition-decisions.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const num=n=>Math.round(n*10)/10;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const recent=(items,today,days)=>items.filter(x=>x.date>=dateOffset(today,1-days)&&x.date<=today);
const latest=items=>items.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(Date.parse(a.at)||0)-(Date.parse(b.at)||0)).at(-1);
const voices={
 nutrition:['خلّينا نبص على أكلك بهدوء.', 'دي أهم ملاحظة من سجل أكلك.', 'ناخد التغذية خطوة خطوة.', 'عندي لك نقطة من بيانات الأكل.', 'خلّينا نسهل اختيارك الجاي.', 'نبني على اللي سجلته فعلًا.', 'متابعة أكلك تبدأ من الصورة دي.'],
 training:['خلّينا نختار مجهود مناسب ليك.', 'دي نقطة التدريب اللي تستحق انتباهك.', 'نبص على تمرينك من واقع السجل.', 'ناخد التمرين خطوة محسوبة.', 'المهم إن الجلسة تناسب حالتك.', 'خلّينا نرتب أولويتك في التمرين.', 'دي ملاحظتي على تدريبك.'],
 followup:['خلّينا نخلي الخطوة الجاية بسيطة.', 'مش مطلوب تصلح كل حاجة مرة واحدة.', 'عندي لك ملاحظة تساعدك تنظم يومك.', 'ناخد المتابعة من غير ضغط.', 'دي نقطة صغيرة تستحق اهتمامك.', 'خلّينا نبني عادة تناسب ظروفك.', 'نركز على حاجة واحدة تقدر تعملها.']
};
const actions={
 food:['سجّل وجبتك الجاية بعد ما تخلصها.', 'كمّل يومك وسجّل الأكل الفعلي، حتى لو مختلف عن الخطة.', 'خدها وجبة وجبة؛ التسجيل مش امتحان.', 'ابدأ بتسجيل اللي أكلته لحد دلوقتي.', 'لو اختيار مش مناسبك، راجع بدائله في الخطة.'],
 complete:['راجع إن السجل شامل أي وجبة أو مشروب نسيت تضيفه.', 'حضّر اختيار بسيط لبكرة يناسب وقتك.', 'خليك مرن مع بكرة؛ مش مطلوب يوم مثالي.', 'لاحظ إيه اللي سهّل التسجيل وكرره.', 'خد دقيقة تخطط للوجبة اللي عادة بتتلخبط فيها.'],
 weight:['قارن القياسات في ظروف متشابهة.', 'ما تغيّرش أكلك بسبب قراءة منفردة.', 'تابع الاتجاه مع طاقتك وأداءك، مش الميزان وحده.', 'خلّي الحكم على متوسطات متكررة.', 'استمر على خطتك لحد مراجعة كافية للبيانات.'],
 sleep:['اختار معاد نوم تقدر تحافظ عليه الليلة.', 'سيب وقت هادي قبل النوم من غير مهام زيادة.', 'جهّز مكان نوم هادي ومريح.', 'قلل الكافيين المتأخر لو بيأثر على نومك.', 'ادّي النوم مساحة في جدولك زي التمرين.'],
 checkin:['سجّل نومك وتعبك وأي ألم في «حالتي».', 'حدّث «حالتي» قبل تحديد مجهود الجلسة.', 'تسجيل حالتك الحالية هيساعدنا نوجهك بشكل أدق.', 'خد دقيقة تسجّل إحساسك الحالي بدل الاعتماد على بيانات قديمة.', 'ابدأ بتحديث النوم والطاقة في «حالتي».'],
 rest:['اختار راحة أو حركة خفيفة مريحة حسب إحساسك.', 'مش محتاج تعوض الراحة بمجهود إضافي.', 'جهّز احتياجات جلستك الجاية من غير ضغط.', 'خلي نشاطك مناسب لطاقتك النهاردة.', 'استغل الوقت في روتين هادي تقدر تكرره.'],
 train:['ابدأ بإحماء تدريجي وسجّل مجهودك الحقيقي.', 'حافظ على التحكم قبل ما تفكر تزود الحمل.', 'ابدأ بأول حركة وخد الجلسة خطوة خطوة.', 'خد راحة كفاية بين المجموعات للحفاظ على الأداء.', 'سجّل الحمل والعدات؛ المقارنة بتحتاج الاتنين.'],
 done:['خد وقتك تهدأ واهتم بوجباتك ونومك.', 'اكتفي بالمجهود المخطط وخد فرصتك في الراحة.', 'سجّل إحساسك بعد الجلسة في «حالتي».', 'الانتظام أهم من إضافة تمرين مرهق بعد ما خلصت.', 'جهّز وقت للراحة ضمن بقية يومك.'],
 water:['وزّع الشرب على اليوم حسب هدفك وتعليمات مختصك.', 'حدّث السجل لو شربت أكواب ولسه ما سجلتهاش.', 'خلي المية في مكان واضح يساعدك تفتكر.', 'ما تحاولش تعوض الهدف بشرب كمية كبيرة مرة واحدة.', 'سجّل الشرب أول بأول علشان الصورة تبقى أدق.']
};

// Every message retains its evidence. Wording rotates over a 35-day cycle,
// stays stable on reload and never persists health data in browser storage.
export function personalBrief(state,today){
 const notes=[],seed=today+':'+(state.profile?.name||'')+':'+(state.profile?.goal||'');
 const add=(role,key,fact,action,priority='normal')=>notes.push({role,key,priority,text:`${seedPick(voices[role],seed+':'+key)} ${fact}`,action:seedPick(actions[action]||[action],seed+':action:'+key,Math.floor(Date.parse(today)/86400000/7))});
 const food=(state.foodLogs||[]).filter(x=>x.date<=today),entries=(state.foodEntries||[]).filter(x=>x.date===today),record=latest(food.filter(x=>x.date===today));
 const plan=(state.plans||[]).find(p=>p.id===state.active_plan_id),day=plan?.days?.find(d=>d.date===today);
 const target=day?.targets||plan?.targets;
 const weights=recent((state.weights||[]).filter(x=>finite(x.kg)),today,14);
 const older=weights.filter(x=>x.date<dateOffset(today,-6)),newer=weights.filter(x=>x.date>=dateOffset(today,-6));
 const options=[];
 if(plan){
  if(record?.complete) options.push(['food-complete',`تسجيل أكلك ليوم ${today} مكتمل. أحسنت على المتابعة؛ دلوقتي نقدر نراجع يومك بصورة أوضح.`,'complete']);
  else if(entries.length) options.push(['food-partial',`عندك ${entries.length} تسجيل أكل النهاردة ولسه اليوم مفتوح؛ كمّل التسجيل على مهلك مع بقية اليوم.`,'food']);
  else options.push(['food-missing','مفيش أكل متسجل النهاردة لحد دلوقتي؛ ده مش معناه إنك ما أكلتش.','food']);
  if(record?.complete&&finite(record.protein)&&finite(target?.protein))options.push(['protein',`البروتين المسجل النهاردة ${num(record.protein)} جم، وهدف خطتك ${num(target.protein)} جم. خلي هدف خطتك مرجعك لباقي الوجبات.`,'complete']);
  if(older.length>=3&&newer.length>=3)options.push(['weight-trend',`متوسط وزنك الأسبوع الحالي ${num(mean(newer.map(x=>x.kg)))} كجم من ${newer.length} قياسات، والسابق ${num(mean(older.map(x=>x.kg)))} من ${older.length}. المتوسط أوضح من قراءة يوم واحد.`,'weight']);
  else if(weights.length)options.push(['weight-coverage',`عندك ${weights.length} قياسات وزن خلال آخر أسبوعين؛ لسه محتاجين ٣ قياسات في كل أسبوع لمقارنة المتوسطات بشكل أوضح.`,'weight']);
  const decline=matchingNutritionDecline(state,Date.parse(state.serverNow||today+'T23:59:59Z'),state.profile?.timezone);
  const selected=decline?[decline.kind==='maintenance'?'maintenance-declined':'calories-declined',decline.kind==='maintenance'?'رفضك السابق للانتقال للتثبيت محفوظ، وهدفك لم يتغير. نراجع التوصية عند تغير بيانات التغذية أو الخطة.':'رفضك السابق لتعديل السعرات محفوظ، وخطتك لم تتغير. نراجع التوصية عند تغير بيانات التغذية أو الخطة.','weight']:seedPick(options,seed+':nutrition-topic');add('nutrition',...selected);
 }
 const ready=state.recovery||{status:'unknown',reasons:[]};
 const now=Date.parse(state.serverNow||today+'T23:59:59Z');
 const check=latest((state.checkins||[]).filter(x=>x.date<=today&&Date.parse(x.at)<=now&&now-Date.parse(x.at)<=86400000));
 if(state.workoutPlan){
  const p=state.workoutPlan;
  const session=latest((state.sessions||[]).filter(s=>s.date===today&&(p.programId?s.programId===p.programId:s.planId===p.id)));
  const scheduled=(state.scheduledSessions||[]).find(s=>s.date===today);
  const next=(state.scheduledSessions||[]).filter(s=>s.date>today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const insight=state.progressSummary?.workoutSummary?.insights;
  if(['stop','hold'].includes(ready.status))add('training','safety',ready.reasons?.[0]||'بياناتك الحالية بتشير إن التمرين محتاج توقف وتقييم.','أوقف الحركة المؤلمة؛ ومع ألم الصدر أو الدوخة الشديدة اطلب تقييمًا طبيًا عاجلًا.','urgent');
  else if(['high','caution'].includes(ready.status)){
   const adjustmentActive=p.days?.some(d=>d.exercises?.some(e=>effectiveSets(state,e,today,now)<e.sets));
   const declined=(state.adaptations||[]).some(a=>a.kind==='recovery'&&a.status==='rejected'&&a.setFactor===ready.setFactor&&Date.parse(a.expiresAt)>now&&(a.recoveryEvidenceAt?a.recoveryEvidenceAt===ready.asOf:Date.parse(a.at)>=Date.parse(ready.asOf)));
   if(adjustmentActive)add('training','adjustment-active','التخفيف اللي وافقت عليه لسه ساري، والجولات المخففة متاحة لجلسة النهاردة.','اتبع عدد الجولات المعدّل؛ مش مطلوب تعوض الجولات اللي خففناها.','attention');
   else if(declined)add('training','fatigue-declined','رفضك السابق لتخفيف الجولات محفوظ، وخطتك لم تتغير. هنراجع القرار مع متابعة جديدة لحالتك.','checkin','attention');
   else add('training','fatigue',`حسب آخر متابعة: ${ready.reasons?.join('، ')||'الاستشفاء محتاج اهتمام'}.`,'راجع توصية تخفيف الحمل قبل التمرين؛ التعديل ما يتطبقش إلا بعد موافقتك.','attention');
  }
  else if(session?.status==='completed')add('training','completed',`جلسة ${today} مسجلة مكتملة${finite(session.duration)?` في ${session.duration} دقيقة`:''}. أحسنت على التسجيل والمتابعة.${ready.status==='unknown'?' مفيش متابعة استشفاء حديثة؛ سجّل حالتك قبل الجلسة الجاية.':''}`,ready.status==='unknown'?'checkin':'done');
  else if(session?.status==='partial')add('training','partial','جلسة النهاردة مسجلة جزئية. ده بيوضح اللي اتعمل فعلًا من غير ضغط لإكمالها على حساب راحتك.'+(ready.status==='unknown'?' مفيش متابعة استشفاء حديثة؛ سجّل حالتك قبل الجلسة الجاية.':''),ready.status==='unknown'?'checkin':'done');
  else if(session?.status==='missed')add('training','missed','جلسة النهاردة مسجلة فائتة. يوم واحد ما يلغيّش مجهودك السابق.',ready.status==='unknown'?'checkin':'ارجع لموعدك القادم أو استخدم نقل الموعد؛ بلاش تضاعف المجهود للتعويض.');
  else if(ready.status==='unknown')add('training','unknown','مفيش متابعة استشفاء حديثة مكتملة، فمش هنفترض إنك جاهز لزيادة الحمل.','checkin');
  else {
   const changes=[...(insight?.loadIncreases||[]).map(x=>({...x,type:'up'})),...(insight?.loadDecreases||[]).map(x=>({...x,type:'down'})),...(insight?.repIncreases||[]).map(x=>({...x,type:'reps'}))].filter(x=>x.date===today);
   const change=seedPick(changes,seed+':exercise');
   const changedExercise=p.days?.flatMap(d=>d.exercises||[]).find(e=>e.id===change?.exerciseId);
   if(change)add('training','performance',change.type==='reps'?`في تسجيل ${change.name} النهاردة: إجمالي العدات من ${change.fromReps} إلى ${change.toReps} ${changedExercise&&!usesKg(changedExercise)?'بدون وزن خارجي':`بنفس متوسط الحمل ${change.kg} كجم`}. عدد المجموعات مهم للمقارنة كمان.`:`في تسجيل ${change.name} النهاردة: متوسط الحمل من ${change.fromKg} إلى ${change.toKg} كجم. ${change.type==='up'?'قارن الحمل مع العدات وجودة الحركة.':'اختلاف الحمل لوحده ما يحددش سبب التغيير.'}`,'train');
   else if(scheduled)add('training','scheduled',`جلسة النهاردة ${FOCUS_LABELS[scheduled.focus]||'حسب جدولك'}. ${ready.domains?.length?'في ملاحظات على حالتك رغم إتاحة التمرين؛ راقب إحساسك.':'بيانات الاستشفاء الحالية تسمح بمجهودك المعتاد.'}`,'train');
   else add('training','rest',`مفيش جلسة مقررة النهاردة${next?`؛ الموعد القادم ${next.date} (${FOCUS_LABELS[next.focus]||'حسب الجدول'})`:''}.`,'rest');
  }
 }
 const activity=[...(state.foodLogs||[]),...(state.foodEntries||[]),...(state.workoutLogs||[]),...(state.sessions||[]),...(state.waterLogs||[]),...(state.weights||[]),...(state.checkins||[])].filter(x=>x.date<=today);
 const last=latest(activity.filter(x=>x.date<today));
 const daysActive=new Set(recent(activity,today,7).map(x=>x.date)).size;
 const hyd=state.progressSummary?.hydration;
 if(['hold','stop'].includes(ready.status))add('followup','safety-support','الأولوية دلوقتي للتعامل مع سبب التوقف، مش استكمال أهداف اليوم.','مش مطلوب تعوض أكل أو تمرين؛ اهتم بتقييم الأعراض أولًا.');
 else if(check&&finite(check.sleepHours)&&check.sleepHours<7)add('followup','short-sleep',`آخر نوم سجلته ${check.sleepHours} ساعات بتاريخ ${check.date}. خلّينا ندي الراحة اهتمام أكبر النهاردة.`,'sleep');
 else if(check&&finite(check.fatigue)&&check.fatigue>=4)add('followup','tired',`التعب في آخر متابعة ${check.fatigue} من ٥ بتاريخ ${check.date}. خلّي توقعاتك مناسبة لطاقتك.`,'rest');
 else if(last&&last.date<dateOffset(today,-2)&&activity.some(x=>x.date===today))add('followup','return',`رجعت تسجل النهاردة بعد آخر نشاط مسجل يوم ${last.date}. أهلًا برجوعك؛ الغياب عن التسجيل مش دليل إنك وقفت كل عاداتك.`,'complete');
 else {
  const follow=[];
  if(hyd&&finite(hyd.targetCups))follow.push(['water',`المية المسجلة النهاردة ${hyd.todayCups||0} من ${hyd.targetCups} كوب حسب هدف خطتك. لو شربت ولسه ما سجلتش، حدّث الرقم.`,'water']);
  if(!check)follow.push(['missing-checkin','مفيش تسجيل حديث للنوم والطاقة؛ المعلومات دي هتخلي متابعتك أكثر مناسبة ليومك.','checkin']);
  else if(finite(check.sleepHours))follow.push(['sleep',`آخر نوم مسجل ${check.sleepHours} ساعات بتاريخ ${check.date}. الاستمرار في التسجيل يساعد نلاحظ التغير بدل التخمين.`,'sleep']);
  follow.push(['activity',`سجلت نشاطًا في ${daysActive} أيام مختلفة خلال آخر ٧ أيام. كل تسجيل بيساعد الصورة تبقى أوضح، حتى لو اليوم مش ماشي حسب الخطة.`,'complete']);
  add('followup',...seedPick(follow,seed+':followup-topic'));
 }
 return notes;
}
