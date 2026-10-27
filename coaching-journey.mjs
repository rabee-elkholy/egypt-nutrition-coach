// Evidence-backed coaching agreements. No inference of delivery, reading or efficacy.
import {localDate,dateOffset} from './coaching-shared.mjs';

export const BARRIERS={
 nutrition:['time','budget','taste','hunger','eating_out','logging','none'],
 training:['time','fatigue','pain','equipment','motivation','none']
};
const terminal=new Set(['completed','declined','superseded']);
const advice={
 time:['خلّينا نقلل عبء التجهيز.','اختار وجبة مسموحة وسهلة من بدائل خطتك وجهّز مكوناتها مسبقًا.'],
 budget:['نسهّل الالتزام بميزانيتك.','راجع ميزانية الأكل والبدائل المسموحة؛ ما تغيّرش قيودك الصحية لتقليل التكلفة.'],
 taste:['الطعم مهم للاستمرار.','جرّب بديلًا مسموحًا لوجبة مش مناسبة لذوقك، وسجّل هل البديل أفضل.'],
 hunger:['الجوع اللي سجلته يستحق المتابعة.','سجّل الجوع والطاقة خلال الأيام الجاية؛ هنوقف اقتراح خفض السعرات مع الجوع المرتفع الحديث.'],
 eating_out:['نرتب التسجيل مع الأكل خارج البيت.','سجّل المكونات والحصة بقدر المتاح، واعتبر الكميات غير المقاسة تقديرية.'],
 logging:['نسهّل التسجيل قبل تغيير الخطة.','ابدأ بتسجيل وجبة واحدة فعلية؛ أكد اكتمال اليوم فقط بعد تسجيل كل ما أكلته.'],
 fatigue:['نراجع مجهودك حسب حالتك الحالية.','حدّث النوم والتعب والألم في «حالتي» قبل اقتراح تعديل التدريب.'],
 pain:['الألم يحتاج تقييمًا قبل التدرج.','أوقف الحركة المؤلمة وحدّث «حالتي»؛ الألم المستمر أو المتزايد يحتاج تقييم مختص.'],
 equipment:['نختار حركة تناسب المعدات المتاحة.','استخدم بدائل التمرين المسموحة أو حدّث المعدات؛ راجع الخطة الناتجة قبل التنفيذ.'],
 motivation:['نختار خطوة صغيرة تقدر تستمر عليها.','حدد موعدًا واقعيًا للجلسة القادمة، من غير مضاعفة المجهود لتعويض الغياب.']
};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const active=c=>!terminal.has(c.status);
const expired=(c,now)=>['proposed','question'].includes(c.status)&&Date.parse(c.createdAt)+7*86400000<=now;
export function coachingContext(s,domain){return domain==='nutrition'?JSON.stringify([s.active_plan_id,s.profile?.goal]):JSON.stringify([s.workoutPlan?.id,s.profile?.goal]);}
function evidence(s,domain,date){return {date,basedOnRevision:s.revision+1,context:coachingContext(s,domain),source:'user_report'};}
export function currentFeedback(s,domain,today){
 const recent=(s.coachingFeedback||[]).filter(f=>f.domain===domain&&f.date<=today&&f.date>=dateOffset(today,-2)&&f.context===coachingContext(s,domain)).sort((a,b)=>a.at.localeCompare(b.at));
 const latest=recent.at(-1);if(!latest)return undefined;
 const result={...latest,metricEvidence:{}};
 // Optional omissions are not reassessments. Each rating keeps its own source
 // and original freshness window, even when a newer report changes the barrier.
 for(const key of ['hunger','energy','satiety']){
  const observed=recent.findLast(f=>Number.isInteger(f[key])&&f[key]>=1&&f[key]<=5);
  result[key]=observed?.[key]??null;
  if(observed)result.metricEvidence[key]={feedbackId:observed.id,date:observed.date,at:observed.at};
 }
 return result;
}
export function coachingSafetyHold(s,today){
 const f=(s.coachingFeedback||[]).filter(x=>x.domain==='training'&&x.barrier==='pain'&&x.date<=today).sort((a,b)=>a.at.localeCompare(b.at)).at(-1);
 return f?.barrier==='pain'&&!s.checkins?.some(c=>Date.parse(c.at)>Date.parse(f.at)&&!c.pain&&!c.illness&&!c.redFlags)?f:null;
}
export function handleCoachingCommand(s,action,p,now){
 s.coachingFeedback||=[];s.coachingCases||=[];
 const at=new Date(now).toISOString(),today=localDate(now,s.profile?.timezone||'Africa/Cairo');
 if(action==='coaching_feedback'){
  if(!['nutrition','training'].includes(p.domain)||typeof p.barrier!=='string'||!BARRIERS[p.domain].includes(p.barrier))fail('اختار مجال المتابعة وسببًا صالحًا.');
  for(const key of ['hunger','energy','satiety'])if(p[key]!=null&&(!Number.isInteger(p[key])||p[key]<1||p[key]>5))fail('تقييم الجوع والشبع والطاقة من ١ إلى ٥.');
  if(p.domain!=='nutrition'&&['hunger','satiety'].some(k=>p[k]!=null))fail('الجوع والشبع يُسجلان مع متابعة التغذية.');
  if(p.domain==='nutrition'&&!s.active_plan_id||p.domain==='training'&&!s.workoutPlan)fail('مسار المتابعة غير مفعّل في حسابك.');
  const feedback={id:crypto.randomUUID(),date:today,at,domain:p.domain,barrier:p.barrier,hunger:p.hunger??null,satiety:p.satiety??null,energy:p.energy??null,context:coachingContext(s,p.domain)};
  s.coachingFeedback.push(feedback);
  const existing=s.coachingCases.find(c=>c.domain===p.domain&&active(c)&&c.context===feedback.context&&c.barrier===p.barrier&&c.status!=='question'&&(c.status!=='proposed'||Date.parse(c.createdAt)+7*86400000>now));
  if(existing)return s; // A repeated report is evidence, not a second agreement.
  for(const c of s.coachingCases.filter(c=>c.domain===p.domain&&active(c))){c.status='superseded';c.closedAt=at;}
  if(p.barrier==='none')return s;
  const [title,step]=p.domain==='training'&&p.barrier==='time'?['وقت الجلسة محتاج تنظيم.','راجع موعد الجلسة والمدة المتاحة في بياناتك؛ أي تغيير للبرنامج يحتاج خطة محدثة، ولم نقلل تمرينك تلقائيًا.']:advice[p.barrier];
  s.coachingCases.push({id:crypto.randomUUID(),domain:p.domain,date:today,createdAt:at,context:feedback.context,barrier:p.barrier,status:'proposed',title,step,evidence:{...evidence(s,p.domain,today),feedbackId:feedback.id},acknowledgedAt:null,acceptedAt:null,reviewOn:null,outcome:null,planMutation:false});
  return s;
 }
 const c=s.coachingCases.find(c=>c.id===p.id);
 if(!c)fail('المتابعة غير موجودة في حسابك.',404);
 if(action==='coaching_ack'){
  c.acknowledgedAt||=at;return s;
 }
 if(c.context!==coachingContext(s,c.domain))fail('الخطة تغيرت؛ راجع المتابعة الحالية.',409);
 if(action==='coaching_decision'){
  if(typeof p.accept!=='boolean')fail('حدد قبول الاقتراح أو رفضه.');
  if(c.status!=='proposed')fail('الاقتراح اتاخد فيه قرار بالفعل أو لم يعد متاحًا.',409);
  if(Date.parse(c.createdAt)+7*86400000<=now)fail('الاقتراح قديم؛ سجّل حالتك الحالية قبل اتخاذ قرار.',409);
  c.status=p.accept?'accepted':'declined';
  c.decidedAt=at;
  if(p.accept){c.acceptedAt=at;c.reviewOn=dateOffset(today,c.barrier==='pain'?1:3);}
  else c.closedAt=at;
  return s;
 }
 if(action==='coaching_outcome'){
  if(c.status!=='accepted')fail('تسجيل النتيجة يحتاج خطوة وافقت عليها.',409);
  if(!['helped','not_helped','not_tried'].includes(p.outcome))fail('اختار نتيجة صالحة للمتابعة.');
  if(c.reviewOn>today&&p.outcome==='helped')fail('نستنى موعد المراجعة قبل الحكم على نتيجة الخطوة.',409);
  c.status='completed';c.closedAt=at;c.outcome={value:p.outcome,at,source:'user_report'};
  if(p.outcome!=='helped')s.coachingCases.push({id:crypto.randomUUID(),domain:c.domain,date:today,createdAt:at,context:c.context,priorCaseId:c.id,barrier:null,status:'question',title:p.outcome==='not_tried'?'الخطوة لم تتجرب؛ نختار حاجة أسهل؟':'قلت إن الخطوة لم تساعدك؛ نراجع السبب قبل تكرارها.',step:'سجّل العائق الحالي علشان نختار خطوة مناسبة؛ مش هنعتبر عدم التجربة فشلًا.',evidence:{source:'user_report',outcome:p.outcome,caseId:c.id,basedOnRevision:s.revision+1},acknowledgedAt:null,acceptedAt:null,reviewOn:null,outcome:null,planMutation:false});
  return s;
 }
 fail('عملية متابعة غير معروفة.');
}

export function reconcileCoaching(s,now){
 s.coachingCases||=[];
 const today=localDate(now,s.profile?.timezone||'Africa/Cairo'),at=new Date(now).toISOString();
 for(const c of s.coachingCases)if(active(c)&&c.context!==coachingContext(s,c.domain)){c.status='superseded';c.closedAt=at;}
 const recent=(s.sessions||[]).filter(x=>x.date>=dateOffset(today,-6)&&x.date<=today&&x.status==='missed'&&((s.workoutPlan?.programId&&x.programId===s.workoutPlan.programId)||(s.workoutPlan?.id&&x.planId===s.workoutPlan.id)));
 const food=(s.foodLogs||[]).filter(x=>x.date>=dateOffset(today,-6)&&x.date<=today&&x.complete&&x.adherence!=null&&x.adherence<80);
 for(const domain of ['nutrition','training']){
  const dates=[...new Set((domain==='training'?recent:food).map(x=>x.date))];
  if(dates.length<2||domain==='nutrition'&&!s.active_plan_id||domain==='training'&&!s.workoutPlan)continue;
  if(s.coachingCases.some(c=>c.domain===domain&&c.context===coachingContext(s,domain)&&(active(c)&&!expired(c,now)||c.date>=dateOffset(today,-6))))continue;
  for(const c of s.coachingCases.filter(c=>c.domain===domain&&active(c)&&expired(c,now))){c.status='superseded';c.closedAt=at;}
  s.coachingCases.push({id:crypto.randomUUID(),domain,date:today,createdAt:at,context:coachingContext(s,domain),barrier:null,status:'question',title:domain==='nutrition'?'في أيام مسجلة أكلك كان مختلف عن الخطة.':'في جلستين أو أكتر سجلتهم فائتين الأسبوع ده.',step:'إيه السبب الأساسي؟ سجّل العائق علشان نختار خطوة مناسبة، من غير افتراض السبب.',evidence:{dates,source:'recorded_logs',basedOnRevision:s.revision+1},acknowledgedAt:null,acceptedAt:null,reviewOn:null,outcome:null,planMutation:false});
 }
 return s;
}

export function coachingInbox(s,now){
 const today=localDate(now,s.profile?.timezone||'Africa/Cairo');
 const items=(s.coachingCases||[]).filter(c=>active(c)&&c.context===coachingContext(s,c.domain)).map(c=>({...c,reviewDue:c.status==='accepted'&&c.reviewOn<=today,expired:expired(c,now),deliveryStatus:'NOT_SENT',readStatus:c.acknowledgedAt?'ACKNOWLEDGED':'UNKNOWN'}));
 items.sort((a,b)=>Number(b.barrier==='pain')-Number(a.barrier==='pain')||Number(b.reviewDue)-Number(a.reviewDue)||b.createdAt.localeCompare(a.createdAt));
 return {date:today,revision:s.revision,channel:'in_app',pushConfigured:false,items};
}
