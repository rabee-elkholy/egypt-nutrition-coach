import {aggregate} from './calculator.mjs';
// Display translation only. IDs, counts, preparation qualifiers and source grams stay intact.
const TYPES = [
  [/\b(?:tablespoons?|tbsp)\b/i, 'ملعقة كبيرة'],
  [/\b(?:teaspoons?|tsp)\b/i, 'ملعقة صغيرة'],
  [/\b(?:cups?)\b/i, 'كوب'],
  [/\b(?:mugs?)\b/i, 'مج'],
  [/\b(?:loaves?|loaf)\b/i, 'رغيف'],
  [/\b(?:slices?)\b/i, 'شريحة'],
  [/\b(?:pieces?)\b/i, 'قطعة'],
  [/\b(?:eggs?)\b/i, 'بيضة'],
  [/\b(?:fruits?)\b/i, 'حبة'],
  [/\b(?:bowls?)\b/i, 'طبق عميق'],
  [/\b(?:plates?)\b/i, 'طبق'],
  [/\b(?:scoops?)\b|مغرفة/i, 'مغرفة'],
  [/\b(?:cloves?)\b/i, 'فص'],
  [/\b(?:leaves|leaf)\b/i, 'ورقة'],
];
const PHRASES = {
  'individual':'فردي', 'liter':'لتر', 'ml':'ملليلتر',
  'quantity not specified':'كمية غير محددة في المرجع',
  'guideline amount':'كمية إرشادية من المرجع',
  'NLEA serving':'مقدار مرجعي للملصق الغذائي (NLEA)',
  'fluid ounces':'أوقيات سائلة', 'fluid ounce':'أوقية سائلة', 'fl oz':'أوقية سائلة',
  'extra small':'صغيرة جدًا', 'extra large':'كبيرة جدًا', 'extra-large':'كبيرة جدًا',
  'tablespoons':'ملاعق كبيرة', 'tablespoon':'ملعقة كبيرة', 'tbsp':'ملعقة كبيرة',
  'teaspoons':'ملاعق صغيرة', 'teaspoon':'ملعقة صغيرة', 'tsp':'ملعقة صغيرة',
  'cubic inch':'بوصة مكعبة', 'surface inch':'بوصة من السطح',
  'crust not eaten':'القشرة غير مأكولة', 'bone removed':'بدون عظم',
  'yield after cooking':'الناتج بعد الطبخ', 'ready-to-cook':'جاهز للطبخ',
  'less than':'أقل من', 'or longer':'أو أكثر', 'any size':'أي حجم',
  'bite size':'بحجم لقمة', 'snack-size':'بحجم تسالي',
  'cups':'أكواب', 'cup':'كوب', 'mugs':'مجّات', 'mug':'مج',
  'slices':'شرائح', 'slice':'شريحة', 'pieces':'قطع', 'piece':'قطعة',
  'eggs':'بيضات', 'egg':'بيضة', 'fruits':'حبات', 'fruit':'حبة',
  'loaves':'أرغفة', 'loaf':'رغيف', 'bowls':'أطباق عميقة', 'bowl':'طبق عميق',
  'plates':'أطباق', 'plate':'طبق', 'scoops':'مغارف', 'scoop':'مغرفة',
  'cloves':'فصوص', 'clove':'فص', 'leaves':'أوراق', 'leaf':'ورقة',
  'large':'كبيرة', 'medium':'متوسطة', 'small':'صغيرة', 'regular':'عادية',
  'thin':'رفيعة', 'thick':'سميكة', 'very':'جدًا', 'miniature':'صغيرة جدًا',
  'mashed':'مهروس', 'sliced':'شرائح', 'chopped':'مفروم', 'diced':'مكعبات',
  'shredded':'مبشور', 'cooked':'مطبوخ', 'uncooked':'غير مطبوخ',
  'raw':'نيء', 'dry':'جاف', 'dried':'مجفف', 'drained':'مصفّى',
  'whole':'كامل', 'half':'نصف', 'quarters':'أرباع', 'quarter':'ربع',
  'packed':'مضغوط في المكيال', 'heaped':'مكدّسة', 'level':'ممسوحة',
  'NFS':'التفاصيل غير محددة', 'ounces':'أوقيات', 'ounce':'أوقية', 'oz':'أوقية',
  'pounds':'أرطال', 'pound':'رطل', 'lb':'رطل', 'grams':'جرام', 'gram':'جرام',
  'package':'عبوة وفق المرجع', 'unit':'وحدة وفق المرجع', 'serving':'مقدار وفق المرجع',
  'diameter':'قطر', 'long':'طول', 'yields':'ناتج', 'or':'أو', 'to':'إلى',
};
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const entries=Object.entries(PHRASES).sort((a,b)=>b[0].length-a[0].length);
// One pass: translated text cannot be translated again or accidentally change numbers.
const words=new RegExp('\\b('+entries.map(([k])=>escapeRegex(k)).join('|')+')\\b','gi');

export function portionInfo(portion,food={}) {
  const original=String(portion.label || '').trim();
  const plain=original.replace(/\bundetermined\b/gi,'').replace(/\s+/g,' ').trim();
  const anonymous=/quantity not specified|guideline amount|NLEA serving|\bserving\b/i.test(plain);
  let unit=anonymous?'':TYPES.find(([pattern])=>pattern.test(plain))?.[1] || '';
  if(unit==='رغيف' && !/bread|خبز|عيش/i.test(food.english||food.name||''))unit='';
  let text=plain;
  // A source-sized whole fruit is a fruit unit; a cup of fruit remains a cup.
  const sizedFruit=!unit && !anonymous && (food.categories||[]).includes('ingredients.fruits') && /^\d+(?:\.\d+|\/\d+)?\s+(?:extra[ -])?(?:small|medium|large)\b/i.test(plain);
  if(sizedFruit){unit='حبة';text=text.replace(/^(\d+(?:\.\d+|\/\d+)?\s+)/,'$1حبة ')}
  const label=text.replace(words,word=>PHRASES[word.toLowerCase()] || word) || 'كمية مرجعية غير محددة';
  return {label,unit,household:Boolean(unit),original,grams:portion.grams,id:portion.id};
}

export function portionUnits(portions,food={}) {
  return [...new Set(portions.map(p=>portionInfo(p,food)).filter(p=>p.household).map(p=>p.unit))];
}

// Volume comes from this profile's explicit paired source portion, never a cup guess.
export function sourceVolume(portions=[]) {
 for(const p of portions){
  const match=String(p.label||'').trim().match(/^(\d+(?:\.\d+)?)\s+(ml|milliliters?|millilitres?|liters?|litres?)\s*(?:undetermined)?$/i);
  if(!match || !/^\d+(?:\.\d+)?$/.test(String(p.grams)) || Number(p.grams)<=0 || Number(match[1])<=0)continue;
  const ml=/^m/i.test(match[2])?match[1]:String(Number(match[1])*1000);
  return {portion_id:p.id,source_label:p.label,source_grams:String(p.grams),source_ml:ml};
 }
 return null;
}
export function volumeGrams(quantity,evidence){
 if(!evidence)throw Error('لا يوجد تحويل حجم موثق لهذا الطعام');
 // Use the same rational, half-even arithmetic as the meal calculator.
 return aggregate([{grams:String(quantity),values:{weight:evidence.source_grams},factors:{weight:'1'}}],['weight'],evidence.source_ml).nutrients.weight.per_100g;
}
