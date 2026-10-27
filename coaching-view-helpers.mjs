import {usesKg} from './exercise-load.mjs';
import {MUSCLE_REGIONS} from './coaching-shared.mjs';
import {householdQuantity} from './planner-household.mjs';
import {displayIngredientName} from './meal-presentation.mjs';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const round=n=>n==null?'—':Math.round(Number(n)||0);
export const days=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
export const stateLabels={cooked:'مطبوخ',raw:'نيّ',as_sold:'كما يباع'};
export const regionNames=regions=>(regions||[]).map(r=>MUSCLE_REGIONS[r]||r).join('، ');
export const macroLine=s=>`${round(s.values.energy)} سعر · ${round(s.values.protein)} جرام بروتين`;
export const ingredientLine=x=>{
 const h=householdQuantity(x),name=esc(displayIngredientName(x)),st=esc(stateLabels[x.state]||x.state);
 return h
  ?`<li><strong>${name}:</strong> <span style="color:#1b4332;font-weight:700">${esc(h.label)}</span> <small style="color:#52665a">(حوالي ${round(x.grams)} جم · ${st})</small></li>`
  :`<li><strong>${name}:</strong> ${round(x.grams)} جرام <small>(${st})</small></li>`;
};
export const formData=form=>{const p=Object.fromEntries(new FormData(form));for(const x of form.querySelectorAll('[type=checkbox]'))p[x.name]=x.checked;return p;};

export function defaultStartKg(e,state){
 if(!usesKg(e))return 0;
 const level=state.onboarding?.workoutPrefs?.level||'beginner';
 const adv=level==='intermediate'||level==='advanced';
 if(['squat','hinge'].includes(e.pattern))return adv?30:20;
 if(['horizontal_push','horizontal_pull'].includes(e.pattern))return adv?22.5:15;
 if(['vertical_push','vertical_pull','lunge'].includes(e.pattern))return adv?15:10;
 return adv?12.5:8;
}

export const DISEASE_LABELS={
 hypertension:'الضغط المرتفع (ملح منخفض)',
 insulin_resistance:'مقاومة الإنسولين (مؤشر جلايسيمي هادئ)',
 pcos:'تكيس المبايض (توازن الإنسولين)',
 ibs:'القولون العصبي (خفيف على الهضم)',
 cholesterol:'الكوليسترول (دهون صحية)',
 gout:'النقرس (تقليل البيورين وضبط البروتين)',
 anemia:'الأنيميا',
 vitamin_d_deficiency:'نقص فيتامين د',
 lactose_intolerance:'عدم تحمّل اللاكتوز',
 favism:'أنيميا الفول (استبعاد الفول)',
 fatty_liver:'دهون الكبد'
};
export const INJURY_LABELS={
 knee_pain:'حماية الركبة',
 lower_back_pain:'حماية أسفل الظهر',
 shoulder_pain:'مراعاة ألم الكتف',
 shoulder_injury:'مراعاة الكتف',
 wrist_pain:'حماية الرسغ',
 ankle_pain:'مراعاة ألم الكاحل',
 ankle_injury:'مراعاة الكاحل',
 neck_pain:'حماية الرقبة',
 hip_pain:'حماية الحوض',
 diastasis_recti:'حماية جدار البطن'
};
