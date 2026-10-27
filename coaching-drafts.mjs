import {formData} from './coaching-view-helpers.mjs';
export function createDraftStore({root,formKey,drafts=new Map()}){
 function captureDrafts(excluded){for(const form of root.querySelectorAll('form'))if(!form.closest('#coach-onboarding-section')&&formKey(form)!==excluded)drafts.set(formKey(form),formData(form));if(excluded)drafts.delete(excluded);}
 function restoreDrafts(scope=root){for(const form of scope.querySelectorAll('form')){const draft=drafts.get(formKey(form));if(!draft)continue;
  if(form.matches('.workout-log')){
   const count=Object.keys(draft).filter(k=>/^set_reps_\d+$/.test(k)).length;
   if(count>=1&&count<=10){
    for(let i=form.querySelectorAll('.set-row').length;i<count;i++)form.querySelector('[data-add-set]')?.click();
    for(let i=form.querySelectorAll('.set-row').length;i>count;i--)form.querySelector('[data-remove-set]')?.click();
   }
  }
  for(const [name,value]of Object.entries(draft)){const field=form.elements.namedItem(name);if(field&&'value'in field){if(name==='date'&&field.type==='hidden'&&String(value)!==field.defaultValue)continue;if(field.type==='checkbox')field.checked=!!value;else field.value=String(value);}}
  if(form.id==='recovery-log'){
   const hours=Number(draft.sleepHours),fatigue=Number(draft.fatigue);
   const sleepChoice=hours<6?5:hours<7?6.5:hours<=8?7.5:8.5;
   const fatigueChoice=fatigue<=1?1:fatigue<=3?2:4;
   form.querySelectorAll('.sleep-preset').forEach(button=>button.classList.toggle('active-chip',Number(button.dataset.sleep)===sleepChoice));
   form.querySelectorAll('.energy-preset').forEach(button=>button.classList.toggle('active-chip',Number(button.dataset.fatigue)===fatigueChoice));
  }
  if(form.matches('.workout-log')){const rir=Number(draft.effort_rir);form.querySelectorAll('.effort-chip').forEach(b=>b.classList.toggle('active-chip',Number(b.dataset.effort)===(rir>=3?3:rir<=1?0:2)));}
 }}
 return {captureDrafts,restoreDrafts};
}
