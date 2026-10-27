import {personalBrief} from './personal-brief.mjs';
import {splitReview} from './split-review.mjs';
import {esc,DISEASE_LABELS,INJURY_LABELS} from './coaching-view-helpers.mjs';
export function buildSpecialistBrief(state,todayStr,todayPlanDay,notes=personalBrief(state,todayStr)){
 const roles={nutrition:'🥗 أخصائي التغذية',training:'💪 كابتن التدريب',followup:'💚 متابعة العادات والاستشفاء'};
 const splitAdvice=splitReview(state,todayStr);
 const diseases=(state.profile?.diseases||[]).filter(x=>x&&x!=='none').map(x=>DISEASE_LABELS[x]||x);
 const injuries=(state.onboarding?.workoutPrefs?.injuries||[]).filter(x=>x&&x!=='none').map(x=>INJURY_LABELS[x]||x);
 const tags=[...diseases,...injuries];
 return `<section class="coach-card specialist-brief" style="background:linear-gradient(135deg,#f1f8f5 0%,#e6f4ed 100%);border-color:#b7dec9">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
   <strong style="color:#1b4332;font-size:15px">💬 رسائلك النهاردة</strong>
   <span style="font-size:12px;background:#fff;color:#1b4332;padding:3px 10px;border-radius:999px;border:1px solid #cce3d6;font-weight:700">${todayStr}</span>
  </div>
  <small class="brief-context">متابعة آلية مبنية على تسجيلاتك؛ بتتحدث لما بياناتك تتغير.</small>
  ${notes.map(n=>`<article class="personal-note" data-personal-role="${n.role}" ${n.priority==='urgent'?'role="alert"':''}>
   <strong>${roles[n.role]}</strong><p>${esc(n.text)}</p>${['recovery','food','feedback','workout'].includes(n.actionTarget)?`<button type="button" data-brief-action="${n.actionTarget}">${esc(n.action)}</button>`:`<p class="personal-action">${esc(n.action)}</p>`}
  </article>`).join('')}
  ${splitAdvice?`<details class="brief-details"><summary>مراجعة تقسيمة التمرين بعد ٨ أسابيع</summary><p>${esc(splitAdvice.text)}</p></details>`:''}
  ${tags.length?`<div class="coach-tags" style="margin-top:8px">${tags.map(t=>`<span style="background:#fff;border-color:#b7dec9;color:#1b4332">🩺 مراعاة: ${esc(t)}</span>`).join('')}</div>`:''}
 </section>`;
}
