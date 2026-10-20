// Portable dependency-free calculator: exact rational arithmetic, 12-place output.
// ES2020 BigInt required. Null values/factors propagate. Units are caller-provided
// nutrient IDs from the SQLite nutrients table, never inferred from display names.
function dec(x) {
  const s=String(x);
  if(!/^\d+(?:\.\d+)?$/.test(s)) throw Error('Expected finite nonnegative decimal string');
  const [a,b='']=s.split('.');return [BigInt(a+b),10n**BigInt(b.length)];
}
const add=([a,b],[c,d])=>[a*d+c*b,b*d];
const mul=([a,b],[c,d])=>[a*c,b*d];
const div=([a,b],[c,d])=>{if(c===0n)throw Error('Zero denominator');return [a*d,b*c];};
function fmt([a,b],places=12) {
  const scale=10n**BigInt(places); let n=a*scale/b, r=a*scale%b;
  // Round half-even, matching Decimal's default rounding mode.
  if(r*2n>b || (r*2n===b && n%2n===1n))n++;
  return `${n/scale}.${String(n%scale).padStart(places,'0')}`.replace(/\.?0+$/,'');
}
export function aggregate(items,nutrientIds,finalWeight=null) {
  if(!items.length)throw Error('Ingredients required');
  const weights=items.map(i=>{let w=dec(i.grams);if(w[0]===0n)throw Error('Positive weight required');return w;});
  const weight=weights.reduce(add,[0n,1n]),final=finalWeight===null?weight:dec(finalWeight);
  if(final[0]===0n)throw Error('Positive final weight required');
  const nutrients={};
  for(const n of nutrientIds){
    let total=[0n,1n],known=[0n,1n],missing=false;
    items.forEach((item,index)=>{
      const v=item.values[n],f=item.factors?.[n];
      if(v===null||v===undefined||f===null||f===undefined){missing=true;return;}
      const factor=dec(f);if(factor[0]>factor[1])throw Error('Retention factor above one');
      total=add(total,mul(mul(dec(v),div(weights[index],[100n,1n])),factor));known=add(known,weights[index]);
    });
    nutrients[n]={total:missing?null:fmt(total),per_100g:missing?null:fmt(div(mul(total,[100n,1n]),final)),coverage_by_input_weight:fmt(div(known,weight))};
  }
  return {input_weight_g:fmt(weight),final_weight_g:fmt(final),yield_ratio:fmt(div(final,weight)),nutrients};
}

// Reference count only. Unknown mass cannot be normalized to 100 grams.
export function referenceTotals(items,nutrientIds){
 if(!items.length)throw Error('Food items required');
 const scales=items.map(i=>{const n=dec(i.scale);if(n[0]===0n)throw Error('Positive quantity required');return n});
 const nutrients={};
 for(const n of nutrientIds){let total=[0n,1n],known=0;items.forEach((i,k)=>{const v=i.values[n];if(v===null||v===undefined)return;total=add(total,mul(dec(v),scales[k]));known++});nutrients[n]={total:known===items.length?fmt(total):null,per_100g:null,coverage_by_item_count:fmt([BigInt(known),BigInt(items.length)])}}
 return{input_weight_g:null,final_weight_g:null,yield_ratio:null,nutrients};
}

// Approximate model quantities; exact source arithmetic does not validate the recipe.
export function estimateTotals(model,count='1',weights={}){
 const servings=dec(model.servings),scale=dec(count);
 if(servings[0]===0n||scale[0]===0n||scale[0]>1000n*scale[1])throw Error('Invalid modeled portion count');
 const keys=new Set(model.ingredients.map(i=>i.key));
 if(keys.size!==model.ingredients.length||Object.keys(weights).some(k=>!keys.has(k)))throw Error('Unknown or duplicate ingredient');
 const quantities=model.ingredients.map(i=>{const w=dec(weights[i.key]??i.grams);if(w[0]>100000n*w[1])throw Error('Ingredient grams exceed limit');return w});
 const nutrients={};
 for(const nid of ['fdc:1008','fdc:1003','fdc:1004','fdc:1005','fdc:1079','fdc:2000','fdc:1258','fdc:1253']){
  let total=[0n,1n],missing=false;
  model.ingredients.forEach((item,k)=>{if(quantities[k][0]===0n)return;const v=item.values_per_100g[nid];if(v===null||v===undefined){missing=true;return}total=add(total,mul(dec(v),div(quantities[k],[100n,1n])))});
  nutrients[nid]=missing?null:fmt(div(mul(total,scale),servings),8);
 }
 const fixed8=x=>{const [a,b='']=fmt(x,8).split('.');return a+'.'+b.padEnd(8,'0')};
 const ingredientQuantities=model.ingredients.map((i,k)=>({key:i.key,name_ar:i.name_ar,state:i.state,batch_grams:String(weights[i.key]??i.grams),allocated_grams:fixed8(div(mul(quantities[k],scale),servings))}));
 const inputMass=quantities.reduce((a,b)=>add(a,b),[0n,1n]);
 const quantity_basis={type:'ingredient_formulation',multiplier:String(count),batch_divisor:String(model.servings),ingredients:ingredientQuantities,input_mass_g:fixed8(div(mul(inputMass,scale),servings)),input_mass_is_cooked_mass:false,cooked_mass_g:null,volume_ml:null,household_serving_available:false,quantity_rounding:'Display only: 8dp half even; exact quantity = batch_grams * multiplier / batch_divisor'};
 return {quality:'calculated_estimate',approval:'not_reference_approved',basis:'modeled_portion',count:String(count),label:model.estimate_type==='reference_proxy'?'مقادير المرجع البديل المحددة':'مقادير الوصفة المحددة',quantity_basis,grams_available:false,final_weight_g:null,per_100g:null,per_100ml:null,nutrients};
}
