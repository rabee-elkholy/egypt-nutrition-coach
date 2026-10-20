export function preferredPortion(i){
 const rows=(i.portions||[]).filter(p=>Number(p.grams)>0&&Number.isFinite(Number(p.grams)));
 const pick=(re,label,step)=>{const p=rows.find(p=>re.test(p.label.trim().replace(/\s*undetermined$/i,'')));return p?{...p,original_label:p.label,label,step}:null};
 if(['egg','friedegg'].includes(i.key))return pick(/^1 large$/i,'بيضة كبيرة',1)||pick(/^1 egg$/i,'بيضة',1);
 if(i.key==='bread')return pick(/^رغيف عينة الدراسة/,'رغيف بلدي',.25);
 if(i.role==='fruit'){const p=pick(/^1 medium\b/i,'حبة متوسطة',1);if(p)return p;}
 if(i.role==='fat')return pick(/^1 (tsp|teaspoon)$/i,'ملعقة صغيرة',.5)||pick(/^1 (tbsp|tablespoon)$/i,'ملعقة كبيرة',.25);
 const p=rows.find(p=>/^1 cup(?:\b|,)/i.test(p.label.trim())&&!/mashed|chopped|sliced|crumbled|shredded|diced|quartered/i.test(p.label));
 if(p)return {...p,label:'كوب',step:.25};
 return null;
}

function fallbackDisplayPortion(i){
 const rows=(i.portions||[]).filter(p=>Number(p.grams)>0&&Number.isFinite(Number(p.grams)));
 if(!rows.length)return null;
 const pick=(re,label,step=.25)=>{const p=rows.find(p=>re.test(p.label.trim().replace(/\s*undetermined$/i,'')));return p?{...p,original_label:p.label,label,step}:null};
 if(i.key==='wholebread')return pick(/^1 pita, large/i,'رغيف بيتا كبير',.25)||pick(/^1 pita/i,'رغيف بيتا',.25);
 if(i.key==='toast')return pick(/^1 slice/i,'شريحة توست',.5);
 if(i.key==='dates')return pick(/^1 date/i,'تمرة',1);
 if(i.key==='falafel')return pick(/^1 patty/i,'قرص طعمية',1);
 if(['feta','mozzarella'].includes(i.key))return pick(/^1 wedge/i,'قطعة متوسطة',.5)||pick(/^1 oz/i,'قطعة (28 جم)',.5)||pick(/^1 cup/i,'كوب',.25);
 if(['chicken','chickenboiled'].includes(i.key))return pick(/^0\.5 breast/i,'نصف صدر دجاج',.5)||pick(/^1 cup/i,'كوب مقطع',.25);
 if(i.key==='chickenthigh')return pick(/^1 thigh without skin/i,'ورك دجاج مخلي',.5)||pick(/^3 oz/i,'حصة (85 جم)',.5);
 if(['fish','seabass','salmon'].includes(i.key))return pick(/^1 fillet/i,'شريحة فيليه',.5)||pick(/^3 oz/i,'حصة (85 جم)',.5);
 if(['beef','lamb','turkey','tuna','liver'].includes(i.key))return pick(/^1 patty/i,'قطعة مشوية',.5)||pick(/^1 slice/i,'شريحة',1)||pick(/^3 oz/i,'حصة (85 جم)',.5)||pick(/^1 cup/i,'كوب',.25);
 if(i.key==='shrimp')return pick(/^4 large/i,'4 حبات كبيرة',1)||pick(/^3 oz/i,'حصة (85 جم)',.5);
 if(['almonds','peanuts','walnuts','cashews'].includes(i.key))return pick(/^1 oz/i,'حفنة (28 جم)',.5)||pick(/^1 tbsp/i,'ملعقة كبيرة',.5);
 if(['peanutbutter','tahini','honey'].includes(i.key))return pick(/^1 (tbsp|tablespoon)/i,'ملعقة كبيرة',.5)||pick(/^1 (tsp|teaspoon)/i,'ملعقة صغيرة',.5);
 if(['potato','sweetpotato','cucumber','tomato','pepper','carrot','carrotcooked','onion','avocado'].includes(i.key)){
  return pick(/^1 (medium|cucumber|carrot|avocado)/i,'حبة متوسطة',.5)||pick(/^0\.5 cup/i,'نصف كوب',.5)||pick(/^1 cup/i,'كوب مقطع',.25);
 }
 return pick(/^1 cup/i,'كوب',.25)||pick(/^0\.5 cup/i,'نصف كوب',.5)||pick(/^1 (tbsp|tablespoon)/i,'ملعقة كبيرة',.5);
}

export function roundedHouseholdGrams(i){
 const grams=Number(i.grams);if(i.grams==null||!Number.isFinite(grams)||grams<=0)return i.grams;
 const unit=preferredPortion(i),step=unit?Number(unit.grams)*unit.step:(grams<10?1:10);
 return String(Number((Math.max(1,Math.round(grams/step))*step).toFixed(6)));
}
export function practicalParts(parts,lib){
 return parts.map(p=>{
  const i=lib.ingredients[p.key],unit=preferredPortion(i);if(!unit){const g=Number(roundedHouseholdGrams({...i,grams:p.grams}));return {...p,grams:String(Math.max(Math.max(i.min_g,p.min_g||0),Math.min(p.max_g??i.max_g,g)))};}
  const step=Number(unit.grams)*unit.step,lo=Math.max(i.min_g,p.min_g||0),hi=p.max_g??i.max_g;
  const min=Math.max(1,Math.ceil(lo/step)),max=Math.floor(hi/step);if(min>max)return p;
  const count=Math.max(min,Math.min(max,Math.round(Number(p.grams)/step)));
  return {...p,grams:String(Number((count*step).toFixed(6)))};
 });
}
export function householdQuantity(i){
 if(i.grams==null)return null;const unit=preferredPortion(i)||fallbackDisplayPortion(i);if(!unit)return null;
 const count=Number(i.grams)/Number(unit.grams),q=Math.round(count*100)/100;
 const number=new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(q);
 const approx=Math.abs(count-q)>1e-7?'حوالي ':'';
 let label=`${approx}${number} ${unit.label}`;
 const quarter=Math.round(count*4)/4;
 if(Math.abs(count-quarter)<1e-6){
  const whole=Math.floor(quarter),fraction=Math.round((quarter-whole)*4),words=['','ربع','نص','تلات أرباع'];
  label=fraction?(whole?`${whole} و${words[fraction]} ${unit.label}`:`${words[fraction]} ${unit.label}`):`${whole} ${unit.label}`;
  if(quarter===1)label=unit.label;
 }

 if(unit.label==='بيضة كبيرة'&&count===1)label='بيضة كبيرة';
 if(unit.label==='بيضة كبيرة'&&count===2)label='بيضتين كبار';
 if(unit.label==='بيضة'&&count===1)label='بيضة';
 if(unit.label==='بيضة'&&count===2)label='بيضتين';
 return {label,grams:i.grams,portion_id:unit.id,source_label:unit.original_label||unit.label,source_grams:unit.grams};
}
