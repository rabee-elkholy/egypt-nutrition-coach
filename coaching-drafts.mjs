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
  for(const [name,value]of Object.entries(draft)){const field=form.elements.namedItem(name);if(field&&'value'in field){if(field.type==='checkbox')field.checked=!!value;else field.value=String(value);}}
  if(form.matches('.workout-log')){const rir=Number(draft.effort_rir);form.querySelectorAll('.effort-chip').forEach(b=>b.classList.toggle('active-chip',Number(b.dataset.effort)===(rir>=3?3:rir<=1?0:2)));}
 }}
 return {captureDrafts,restoreDrafts};
}
