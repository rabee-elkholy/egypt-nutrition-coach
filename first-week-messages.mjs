import {firstWeekEvidence} from './coaching-evidence.mjs';
import {summarizeFirstWeek} from './coaching-summary.mjs';
import {recoveryNeedsAttention,followupIsProtected,nutritionNeedsAttention} from './coaching-priority.mjs';
import {validDate} from './coaching-shared.mjs';

// Account age, not plan age: renewals/profile edits must not restart onboarding.
export function firstWeekDay(state,today){
 const start=state.onboarding?.journeyStartedOn;
 if(!validDate(start)||!validDate(today))return null;
 const day=(Date.parse(today)-Date.parse(start))/86400000+1;
 return Number.isInteger(day)&&day>=1&&day<=7?day:null;
}
export function firstWeekMessages(state,today,notes){
 const day=firstWeekDay(state,today);if(!day)return notes;
 const start=state.onboarding.journeyStartedOn,now=Date.parse(state.serverNow||today+'T23:59:59Z');
 const evidence=firstWeekEvidence(state,start,today,now);
 const {plan,food,entries}=evidence;
 const {dates,todayRecorded,completedFood,completedSessions,freshCheck}=summarizeFirstWeek(evidence,today,now);
 const nutrition=!!state.active_plan_id;
 const result=notes.map(n=>({...n}));
 const follow=result.find(n=>n.role==='followup');
 // Safety, adverse feedback, explicit agreements and actual returns take priority.
 const protectedFollow=followupIsProtected(follow);
 if(protectedFollow||recoveryNeedsAttention(state.recovery?.status))return notes;
 if(nutritionNeedsAttention(result))return notes;
 let text,action,actionTarget;
 const next=()=>{
  if(plan&&!freshCheck)return ['ابدأ بتسجيل حالتك','recovery'];
  if(nutrition&&!food.some(x=>x.date===today)&&!entries.some(x=>x.date===today))return ['سجّل أول وجبة فعلية','food'];
  if(plan)return ['شوف موعدك وخطة تمرينك','workout'];
  return ['راجع سجل أكلك على مهلك','food'];
 };
 [action,actionTarget]=next();
 if(day===1){
  text=todayRecorded?'أول تسجيل اتعمل؛ دي بداية نقدر نبني عليها. مش مطلوب تكمّل كل حاجة مرة واحدة.':`أهلًا${state.profile?.name?' يا '+state.profile.name:''}، نبدأ بخطوة واحدة تناسب يومك. الأسبوع الأول للتعرّف على الخطة والتسجيل، مش اختبار للالتزام.`;
 }else if(day===7){
  const details=[nutrition?`أيام أكدت اكتمال سجل الأكل فيها: ${completedFood}`:null,plan?`جلسات مسجلة مكتملة: ${completedSessions}`:null].filter(Boolean).join('، ');
  text=dates.length?`وصلنا لليوم السابع. عندك تسجيلات في ${dates.length} من أول ٧ أيام؛ ${details}. ده ملخص المسجل لحد دلوقتي، مش حكم على نتائج جسمك. إيه اللي سهّل عليك وإيه اللي محتاج يتغير؟`:'وصلنا لليوم السابع ولسه مفيش تسجيلات في الأسبوع ده. ده مش دليل إنك ما حاولتش؛ نقدر نصغّر أول خطوة حسب ظروفك.';
  action='اختار العائق أو خطوة الأسبوع الجاي';actionTarget='feedback';
 }else if(!dates.length){
  const texts={2:'ناخد البداية براحتك. لسه مفيش تسجيلات؛ وجبة واحدة أو متابعة واحدة كفاية علشان نبدأ نفهم يومك.',3:'لو البداية مش سهلة، نحب نفهم السبب بدل ما نزود الطلبات. هل الوقت أو طريقة التسجيل عاملين عائق؟',4:'مش مطلوب تلحق الأيام اللي فاتت. نقدر نبدأ من اللي يناسبك النهاردة.',5:'خلّينا نصغّر الخطوة: اختار حاجة واحدة تقدر تسجلها في يومك، من غير محاولة تسجيل الأسبوع كله.',6:'قبل ملخص الأسبوع، يهمنا نعرف إيه اللي معطّل البداية. ردك يساعدنا نختار خطوة قابلة للتجربة.'};
  text=texts[day];if([3,6].includes(day)){action='قول لنا إيه اللي صعّب البداية';actionTarget='feedback';}
 }else if(!todayRecorded){
  text=`آخر تسجيل عندك يوم ${dates.at(-1)}. نكمل من مكاننا؛ مش محتاج تعوض الغياب أو تضاعف المجهود.`;
 }else{
  const texts={2:'دي متابعة جديدة بعد البداية. اختار وقتًا سهلًا للتسجيل؛ المطلوب عادة تناسبك، مش يوم مثالي.',3:'تسجيلاتك بتوضح الصورة خطوة خطوة. إيه اللي كان سهل، وإيه اللي عطّلك لحد دلوقتي؟',4:'في نص أول أسبوع، خلّينا نثبت خطوة نافعة قبل ما نزود المطلوب. السجل بيساعدنا نفهم يومك، مش نحكم عليك.',5:'الأسبوع الأول فرصة نعرف هل الخطة مناسبة لوقتك وذوقك. لو حاجة صعبة، قول لنا بدل ما تضغط على نفسك.',6:'بكرة اليوم السابع وهنلخّص اللي اتسجل. مش مطلوب تزود تسجيلاتك علشان الملخص؛ المهم إنها تعبر عن اللي حصل.'};
  text=texts[day];if([3,5].includes(day)){action='سجّل العائق الحالي لو موجود';actionTarget='feedback';}
 }
 const note={role:'followup',key:`first-week-${day}`,priority:'normal',text,action,actionTarget};
 const index=result.findIndex(n=>n.role==='followup');if(index>=0)result[index]=note;else result.push(note);
 for(const n of result){
  if(n.role==='nutrition'&&n.key==='food-missing'){
   n.text=day===1?'خطة الأكل متاحة قدامك. ابدأ بالوجبة المناسبة لوقتك، وسجّل اللي أكلته فعلًا حتى لو مختلف عن الخطة.':'مفيش وجبة مسجلة النهاردة لحد دلوقتي؛ التسجيل ممكن يبدأ من وجبتك الجاية، من غير تعويض الأيام السابقة.';
   n.action='تأكيد اكتمال اليوم يكون بعد تسجيل كل أكلك، مش بعد أول وجبة.';
  }
  if(n.role==='nutrition'&&n.key==='food-complete')n.action='راجع إن التسجيل شامل اللي أكلته فعلًا؛ اكتمال السجل مختلف عن الالتزام بالخطة.';
  if(n.role==='training'&&n.key==='unknown'){
   n.text='خطة التمرين موجودة، لكن تحديد المجهود المناسب محتاج تسجيل حالتك الحالية أولًا.';
   n.action='غياب التسجيل مش تقييم لقدرتك ولا دليل على إنك فوّت تمرينك.';
  }
 }
 return result;
}
