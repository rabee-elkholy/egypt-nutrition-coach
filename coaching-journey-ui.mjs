import {BARRIERS,coachingInbox} from './coaching-journey.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={time:'الوقت',budget:'التكلفة',taste:'الطعم',hunger:'الجوع',eating_out:'الأكل خارج البيت',logging:'صعوبة التسجيل',fatigue:'التعب',pain:'الألم',equipment:'المعدات',motivation:'الدافعية',none:'مفيش عائق حاليًا'};
export function journeyHTML(state){
 const inbox=coachingInbox(state,Date.parse(state.serverNow));
 const domains=[...(state.active_plan_id?['nutrition']:[]),...(state.workoutPlan?['training']:[])];
 return `<section class="coach-card" id="coaching-journey"><h2>خطوة نتفق عليها ونتابع نتيجتها</h2><p>المتابعة الآلية تستخدم ردك لاختيار خطوة مناسبة. قبول الخطوة لا يغيّر برنامجك أو سعراتك تلقائيًا.</p>
 ${domains.map(domain=>`<form data-coaching-feedback="${domain}" class="coach-grid"><label>${domain==='nutrition'?'إيه اللي صعّب الأكل عليك؟':'إيه اللي صعّب التمرين عليك؟'}<select name="barrier" required><option value="">اختار السبب</option>${BARRIERS[domain].map(b=>`<option value="${b}">${labels[b]}</option>`).join('')}</select></label>${domain==='nutrition'?['hunger','satiety','energy'].map(k=>`<label>${{hunger:'الجوع',satiety:'الشبع',energy:'الطاقة'}[k]} من ١ قليل إلى ٥ مرتفع (اختياري)<input name="${k}" type="number" min="1" max="5" step="1"></label>`).join(''):''}<button type="submit">سجّل علشان نتابع</button></form>`).join('')}
 ${inbox.items.map(c=>`<article class="coach-card" data-coaching-case="${esc(c.id)}"><h3>${esc(c.title)}</h3><p>${esc(c.step)}</p>${c.expired?'<p>الاقتراح قديم؛ سجّل العائق الحالي لتجديد المتابعة.</p>':c.status==='proposed'?`<button data-coaching-decision="true" data-id="${esc(c.id)}">موافق أجرب</button> <button class="secondary" data-coaching-decision="false" data-id="${esc(c.id)}">مش مناسب</button>`:c.status==='accepted'?`<p>${c.reviewDue?'وصل موعد مراجعة النتيجة':'متفقين نراجع يوم '+esc(c.reviewOn)}</p>${c.reviewDue?['helped','not_helped','not_tried'].map(v=>`<button class="secondary" data-coaching-outcome="${v}" data-id="${esc(c.id)}">${{helped:'ساعدتني',not_helped:'لم تساعدني',not_tried:'لم أجربها'}[v]}</button>`).join(' '):''}`:''}</article>`).join('')}
 ${(state.coachingCases||[]).filter(c=>c.status==='completed').slice(-3).reverse().map(c=>`<p>متابعة سابقة: ${esc(c.title)} — ${esc({helped:'قلت إن الخطوة ساعدتك؛ نحتفظ بالنتيجة للمراجعة.',not_helped:'قلت إن الخطوة لم تساعدك؛ سجّل العائق الحالي لاختيار خطوة أخرى.',not_tried:'لم تجرب الخطوة؛ نقدر نختار خطوة أسهل حسب العائق الحالي.'}[c.outcome?.value])}</p>`).join('')}
 </section>`;
}
export function bindJourney(root,send){
 for(const form of root.querySelectorAll('[data-coaching-feedback]'))form.addEventListener('submit',event=>{
  event.preventDefault();const values=Object.fromEntries(new FormData(form));
  for(const key of ['hunger','satiety','energy'])if(values[key]==='')delete values[key];else if(values[key]!=null)values[key]=Number(values[key]);
  send('coaching_feedback',{domain:form.dataset.coachingFeedback,...values});
 });
 for(const button of root.querySelectorAll('[data-coaching-decision]'))button.addEventListener('click',()=>send('coaching_decision',{id:button.dataset.id,accept:button.dataset.coachingDecision==='true'}));
 for(const button of root.querySelectorAll('[data-coaching-outcome]'))button.addEventListener('click',()=>send('coaching_outcome',{id:button.dataset.id,outcome:button.dataset.coachingOutcome}));
}
