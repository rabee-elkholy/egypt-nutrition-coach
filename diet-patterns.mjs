export const DIETS={
  balanced:'نظام متوازن مناسب لهدفي',
  low_carb:'قليل الكربوهيدرات (Low Carb)',
  high_protein:'عالي البروتين (High Protein)',
  intermittent_fasting:'صيام متقطع (16/8)',
  keto:'كيتو دايت (Keto)',
  mediterranean:'نظام البحر المتوسط',
  dash:'نظام داش (DASH — لصحة القلب والضغط)',
  vegetarian:'نباتي (مع البيض والألبان)',
  vegan:'نباتي بالكامل'
};

export const FIXED_DIET_MEALS={
  intermittent_fasting:{meals:3,fasting:'16',label:'وجبتين رئيسيتين + سناك (داخل نافذة 8 ساعات)'},
  keto:{meals:3,fasting:'none',label:'3 وجبات مشبعة بدون سناك'},
  low_carb:{meals:4,fasting:'none',label:'3 وجبات رئيسية + سناك'},
  high_protein:{meals:4,fasting:'none',label:'3 وجبات رئيسية + سناك عالي البروتين'},
  mediterranean:{meals:4,fasting:'none',label:'3 وجبات رئيسية + سناك صحي'},
  dash:{meals:4,fasting:'none',label:'3 وجبات رئيسية + سناك قليل الصوديوم'},
  vegetarian:{meals:4,fasting:'none',label:'3 وجبات رئيسية + سناك نباتي'},
  vegan:{meals:4,fasting:'none',label:'3 وجبات رئيسية + سناك نباتي'}
};

export const DIET_INFO={
  balanced:{fit:'للبداية أو لو تحب مرونة كاملة في اختيار عدد وجباتك (2 إلى 5 وجبات).',benefit:'تنوع ومرونة عالية مع أكلنا اليومي المعتاد، وسهل تضبطه للتخسيس أو التثبيت أو زيادة الوزن.',limit:'النتيجة تعتمد على الالتزام بالكميات واستمرارية التمرين.'},
  intermittent_fasting:{fit:'لو بتحب تصوم 16 ساعة وتاكل في نافذة 8 ساعات بدون حرمان من نوعيات الأكل.',benefit:'يثبت الوجبات على وجبتين رئيسيتين وسناك في مواعيد منتظمة لتقليل الجوع.',limit:'اختار ساعة بداية أول وجبة تناسب يومك؛ غير مناسب للحوامل أو المرضعات أو السكري.'},
  mediterranean:{fit:'لو بتحب البقول والخضار والسمك وزيت الزيتون والحبوب الكاملة.',benefit:'نمط عالمي ممتاز لصحة القلب والشبع غني بالألياف والدهون الصحية.',limit:'يستبدل العيش البلدي والأرز الأبيض بالحبوب الكاملة والبرغل والفريك.'},
  dash:{fit:'لو عايز تضبط ضغط الدم وتقلل الصوديوم وتزود البوتاسيوم والخضار.',benefit:'مصمم لدعم صحة القلب والأوعية الدموية بحد صوديوم منخفض.',limit:'تجنب المخللات والجبن المالحة وقلل ملح الطعام المضاف.'},
  high_protein:{fit:'لو بتتمرن مقاومة أو عايز ترفع الشبع وتحافظ على الكتلة العضلية.',benefit:'يرفع البروتين اليومي إلى 1.6–1.8 جم لكل كجم موزعًا على 3 وجبات وسناك.',limit:'اشرب مية كفاية على مدار اليوم.'},
  low_carb:{fit:'لو عايز تقلل النشويات وتنزل المياه المحتبسة من غير تقييد الكيتو الشديد.',benefit:'يحدد الكربوهيدرات بحد أقصى 130 جم يوميًا مع تركيز على البروتين والخضار.',limit:'مثالي لمقاومة الإنسولين وتكيس المبايض والتنشيف.'},
  vegetarian:{fit:'لو مش بتاكل لحوم أو فراخ أو سمك، لكن بتاكل بيض ومنتجات ألبان.',benefit:'يعتمد على البيض والجبنة القريش والزبادي اليوناني والبقوليات والمكسرات.',limit:'نوّع بين البيض والألبان والبقول لضمان تكامل الأحماض الأمينية.'},
  vegan:{fit:'لو مش بتاكل أي منتجات حيوانية نهائيًا.',benefit:'يعتمد على البقول والحبوب الكاملة والمكسرات والطحينة والخضار والفاكهة.',limit:'يُنصح بمتابعة فيتامين B12 والحديد.'},
  keto:{fit:'للبالغين اللي يفضلوا تقييدًا شديدًا للنشويات (أقل من 50 جم يوميًا) واعتماد الدهون الصحية مصدرًا للطاقة.',benefit:'3 وجبات مشبعة غنية بالبروتين والدهون الصحية بدون سناك لتقليل الإنسولين.',limit:'غير مناسب للحمل والرضاعة والسكري وأمراض الكلى أو الكبد.'}
};

const ketoKeys=new Set([
  'egg','friedegg','eggwhite','chicken','chickenboiled','chickenthigh','turkey','shawarma_chicken','shawarma_beef',
  'fish','seabass','tuna','salmon','shrimp','beef','lamb','liver',
  'feta','mozzarella','cottage','greekyogurt','yogurt',
  'olive','tahini','almonds','peanuts','peanutbutter','walnuts','avocado',
  'cucumber','lettuce','spinach','broccoli','zucchini','pepper','lemon','parsley','tomato','tomatocooked','onion','garlic','eggplant','greenbeans','cabbage','babaghanouj'
]);

export function dietIngredientAllowed(i,diet='balanced'){
  if(!i)return false;
  if(diet==='vegetarian'||diet==='vegan'){
    const isMeat=['chicken','fish','meat'].includes(i.protein_group)||['chicken','chickenboiled','chickenthigh','turkey','shawarma_chicken','shawarma_beef','fish','seabass','tuna','salmon','shrimp','beef','lamb','liver'].includes(i.key);
    if(isMeat)return false;
    if(diet==='vegan'&&(['eggs','dairy'].includes(i.protein_group)||['egg','friedegg','eggwhite','feta','cottage','mozzarella','yogurt','greekyogurt','milk','wholemilk','honey'].includes(i.key)))return false;
    return true;
  }
  if(diet==='keto')return ketoKeys.has(i.key)&&i.carb_id==='fdc:1005'&&i.values.carbs!=null;
  if(['mediterranean','dash'].includes(diet))return !['beef','lamb','liver','shawarma_beef','feta','rice','pasta','bread'].includes(i.key);
  return true;
}

export function medicalContraindicatedKeys(profile={}){
  const diseases=new Set(Array.isArray(profile.diseases)?profile.diseases:[]);
  const out=new Set();
  if(diseases.has('gout')){
    for(const k of ['liver','shrimp','lamb','beef','shawarma_beef','fava'])out.add(k);
  }
  if(diseases.has('ibs')){
    for(const k of ['fava','kidney','whitebeans','chickpeas','falafel','cabbage','onion','garlic'])out.add(k);
  }
  if(diseases.has('hypertension')){
    for(const k of ['feta','bread','shawarma_chicken','shawarma_beef','tabbouleh','fattoush','babaghanouj'])out.add(k);
  }
  if(diseases.has('lactose_intolerance')){
    for(const k of ['milk','wholemilk','yogurt','greekyogurt','cottage','feta','mozzarella'])out.add(k);
  }
  if(diseases.has('favism')){
    for(const k of ['fava','falafel'])out.add(k);
  }
  if(diseases.has('cholesterol')){
    for(const k of ['lamb','liver','wholemilk','shawarma_beef'])out.add(k);
  }
  if(diseases.has('diabetes')||diseases.has('insulin_resistance')||diseases.has('pcos')){
    for(const k of ['honey'])out.add(k);
  }
  return out;
}

export function isDietUnsafeForProfile(diet, profile={}){
  const maternal=profile.maternalStatus&&profile.maternalStatus!=='none';
  const diseases=new Set(Array.isArray(profile.diseases)?profile.diseases:[]);
  if(diet==='keto'){
    if(maternal||diseases.has('diabetes')||diseases.has('gout')||diseases.has('cholesterol')||profile.ketoRisk)return true;
  }
  if(diet==='intermittent_fasting'){
    if(maternal||diseases.has('diabetes')||profile.fastingRisk)return true;
  }
  return false;
}

export function dietTemplates(base,lib,diet='balanced',region='egypt'){
  if(['balanced','intermittent_fasting','high_protein','vegetarian','vegan'].includes(diet)){
    return base.filter(t=>t.items.every(p=>dietIngredientAllowed(lib.ingredients[p.key],diet)));
  }
  if(diet==='low_carb'){
    const lowCarbBase=base.filter(t=>t.items.every(p=>['egg','friedegg','eggwhite','cottage','feta','mozzarella','yogurt','greekyogurt','chicken','chickenboiled','chickenthigh','turkey','shawarma_chicken','shawarma_beef','fish','seabass','tuna','salmon','shrimp','beef','lamb','liver','olive','tahini','peanuts','almonds','walnuts','cashews','peanutbutter','avocado','cucumber','lettuce','tomato','tomatocooked','spinach','broccoli','zucchini','pepper','lemon','parsley','onion','garlic','eggplant','greenbeans','cabbage','okra','carrot','carrotcooked','babaghanouj','tabbouleh','apple','strawberry','guava','pear','melon','watermelon'].includes(p.key)));
    return [...dietTemplates(base,lib,'keto',region),...lowCarbBase];
  }
  if(['mediterranean','dash'].includes(diet)){
    return base.map(t=>{
      const replace=k=>({bread:'wholebread',rice:lib.ingredients.bulgur&&regionAllowsKey(lib.ingredients.bulgur,region)?'bulgur':'brownrice'}[k]||k);
      const name=s=>s.replace(/عيش بلدي/g,'عيش قمح كامل').replace(/رز أبيض|بالرز|ورز|رز/g,'بالبرغل');
      const items=t.items.map(p=>({...p,key:replace(p.key)}));
      return {...t,id:'med-'+t.id,name:name(t.name),dish_family:t.dish_family,items,component_definitions:t.component_definitions?.map(c=>({...c,name:name(c.name)}))};
    }).filter(t=>t.items.every(p=>dietIngredientAllowed(lib.ingredients[p.key],diet)));
  }
  if(diet!=='keto')throw Error('نظام غذائي غير معروف');
  const has=k=>Boolean(lib.ingredients[k]);
  const make=(id,name,slots,parts)=>{
    if(parts.some(([,,rows])=>rows.some(([k])=>!has(k))))return null;
    const items=parts.flatMap(([partName,role,rows],n)=>rows.map(([key,grams,max])=>({key,grams:String(grams),max_g:max??lib.ingredients[key].max_g,min_g:key==='olive'?5:1,component_id:'k'+n})));
    const rank={low:1,medium:2,high:3};const tier=Object.keys(rank).find(x=>rank[x]===Math.max(...items.map(p=>rank[lib.ingredients[p.key].budget_tier])));
    return {id:'keto-'+id,name,meal_slots:slots,regions:[region],budget_tier:tier,dish_family:id,items,component_definitions:parts.map(([name,role],n)=>({id:'k'+n,name,role})),editorial_policy_version:'diet-patterns-2',notes:'تجميعة كيتو محسوبة من المكونات المرجعية.'};
  };
  const salad=['سلطة بزيت الزيتون','side',[['cucumber',70,90],['lettuce',50,70],['olive',20,55]]];
  const choices=[];
  for(const [key,name]of [['egg','بيض مسلوق'],['friedegg','بيض عيون']]){
    choices.push(make(key+'-cheese',name+' وجبنة بيضاء وخيار',['breakfast','dinner'],[[name,'main',[[key,120,220],['feta',40,90]]],salad,['لوز','other',[['almonds',15,25]]]]));
    choices.push(make(key+'-tahini',name+' وسلطة بالطحينة',['breakfast','dinner'],[[name,'main',[[key,150,240]]],['سلطة بالطحينة','side',[['cucumber',70,90],['tahini',15,25],['olive',20,55]]]]));
  }
  if(has('cottage')){
    choices.push(make('cottage-olive','جبنة قريش بزيت الزيتون والبيض والخيار',['breakfast','dinner'],[['جبنة قريش وبيض','main',[['cottage',120,180],['egg',100,200]]],salad]));
  }
  if(has('mozzarella')&&has('avocado')){
    choices.push(make('eggs-mozzarella-avocado','بيض عيون بجبنة حلوم وأفوكادو',['breakfast','dinner'],[['بيض وحلوم','main',[['friedegg',120,220],['mozzarella',50,100]]],['أفوكادو وسلطة','side',[['avocado',60,100],['cucumber',60,80],['olive',15,45]]]]));
  }
  // Medium & High budget keto lunches & dinners
  const ketoProteins=[
    ['chicken','فراخ مشوية'],
    ['chickenthigh','ورك فراخ مشوي'],
    ['chickenboiled','فراخ مطهية في المرقة'],
    ['fish','بلطي مشوي'],
    ['seabass','قاروص مشوي'],
    ['shrimp','جمبري مسلوق'],
    ['beef','كفتة لحم مشوية'],
    ['tuna','تونة مصفاة'],
    ['salmon','سلمون مشوي'],
    ['lamb','لحم ضأن مشوي'],
    ['shawarma_chicken','شاورما فراخ مشوية'],
    ['shawarma_beef','شاورما لحم مشوية']
  ].filter(([k])=>has(k));

  for(const [key,name]of ketoProteins){
    choices.push(make(key,name+' وسلطة وطحينة',['lunch','dinner'],[[name,'main',[[key,150,280]]],salad,['طحينة بالليمون','side',[['tahini',15,25],['lemon',10,15]]]]));
    if(has('feta'))choices.push(make(key+'-cheese',name+' بالجبنة وزيت الزيتون والخضار',['lunch','dinner'],[[name+' بالجبنة','main',[[key,140,260],['feta',40,90]]],salad]));
  }
  // Keto snacks
  for(const [key,name]of [['peanuts','فول سوداني'],['almonds','لوز'],['walnuts','عين جمل']].filter(([k])=>has(k))){
    choices.push(make(key,name+' وخيار',['snack'],[[name,'other',[[key,20,35]]],['خيار','side',[['cucumber',60,80],['olive',5,15]]]]));
  }
  if(has('cottage'))choices.push(make('cottage-snack','جبنة قريش بزيت الزيتون وخيار',['snack'],[['جبنة قريش','main',[['cottage',80,140]]],['خيار وزيت زيتون','side',[['olive',10,25],['cucumber',60,80]]]]));
  choices.push(make('cheese-snack','جبنة بيضاء وخيار',['snack'],[['جبنة بيضاء','main',[['feta',50,90]]],['خيار','side',[['cucumber',60,90],['olive',5,20]]]]));
  choices.push(make('egg-cheese-salad','بيض مسلوق وجبنة بيضاء وسلطة',['breakfast','dinner'],[['بيض مسلوق وجبنة بيضاء','main',[['egg',150,220],['feta',35,80]]],salad]));
  choices.push(make('tahini-cucumber','خيار مع طحينة بالليمون',['snack'],[['خيار','side',[['cucumber',60,80]]],['طحينة بالليمون','other',[['tahini',15,25],['lemon',10,15],['olive',5,20]]]]));
  return choices.filter(Boolean);
}

function regionAllowsKey(ing, region){
  return region==='any'||(ing.regions||[]).includes(region);
}

export function assertDietDay(snapshots,diet,targets=null,profile=null){
  const medicalProfile=profile||{diseases:targets?.medical_conditions||[]};
  const medicalBlocked=medicalContraindicatedKeys(medicalProfile);
  if(medicalBlocked.size&&snapshots.some(s=>!s.ingredients?.length||s.ingredients.some(i=>typeof i.key!=='string'||medicalBlocked.has(i.key))))throw Error('الوجبة لا تطابق استبعادات الحالة الصحية المعلنة؛ لم نحفظ التعديل.');
  if(['vegetarian','vegan','mediterranean','dash','keto'].includes(diet) && snapshots.some(s=>s.ingredients.some(i=>!i.key || !dietIngredientAllowed({...i,values:i.values_per_100g},diet))))throw Error('البديل لا يطابق قواعد النظام أو مكوناته غير موثقة؛ اختار بديلًا مناسبًا.');
  if(diet==='high_protein'&&targets&&snapshots.reduce((s,x)=>s+Number(x.values.protein),0)<targets.protein*.8)throw Error('الوجبات لا تحقق الحد المطلوب لهدف البروتين؛ زوّد مصادر البروتين المتاحة.');
  const hasHypertension=Boolean(profile?.diseases?.includes('hypertension')||targets?.medical_conditions?.includes('hypertension'));
  if(diet==='dash'||hasHypertension){
    const getSodium=s=>s.values.sodium!=null&&Number.isFinite(Number(s.values.sodium))&&Number(s.values.sodium)>=0?Number(s.values.sodium):null;
    if(snapshots.some(s=>getSodium(s)==null)||snapshots.reduce((s,x)=>s+getSodium(x),0)>2300)throw Error('الخطة لا تحقق حد الصوديوم في داش قبل الملح المضاف. غيّر الاختيارات.');
  }
  if(!['keto','low_carb'].includes(diet))return;
  if(snapshots.some(s=>s.values.carbs==null||s.carb_ids.length!==1||s.carb_ids[0]!=='fdc:1005'))throw Error('الكيتو يحتاج بيانات كربوهيدرات كاملة بنفس التعريف');
  const total=k=>snapshots.reduce((s,x)=>s+Number(x.values[k]),0),energy=total('energy');
  if(total('carbs')>(diet==='keto'?50:130))throw Error('الاختيار يتجاوز حد الكربوهيدرات الكلية للنظام: '+(diet==='keto'?50:130)+' جرام يوميًا');
  if(targets&&(energy<targets.energy*.85||energy>targets.energy*1.15||total('protein')<targets.protein*.8||(diet==='keto'&&total('fat')*9/energy<.52)))throw Error('المكتبة لا تكفي لهدفك مع قيود النظام الحالي. غيّر الاستبعادات أو مصادر البروتين أو اختار النظام المتوازن؛ لم نحفظ خطة غير مطابقة.');
}

export const FASTING={none:'بدون صيام متقطع','12':'12 ساعة صيام / 12 ساعة أكل','14':'14 ساعة صيام / 10 ساعات أكل','16':'16 ساعة صيام / 8 ساعات أكل'};
export function fastingTimes(prefs,count){
  const mode=prefs.diet==='intermittent_fasting'?(prefs.fasting&&prefs.fasting!=='none'?prefs.fasting:'16'):(prefs.fasting??'none');
  if(!Object.hasOwn(FASTING,mode))throw Error('اختار موعد أكل متاحًا');
  if(mode==='none')return [];
  const startStr=prefs.eatingStart||(prefs.diet==='intermittent_fasting'?'12:00':'');
  if(!/^\d{2}:\d{2}$/.test(startStr))throw Error('حدد بداية وقت الأكل');
  const [h,m]=startStr.split(':').map(Number),start=h*60+m,window=(24-Number(mode))*60;
  if(h>23||m>59||start+window>1440)throw Error('اختار وقت بداية يخلي نافذة الأكل داخل نفس اليوم');
  return Array.from({length:count},(_,i)=>{const t=Math.round(start+i*(window-30)/Math.max(1,count-1));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')});
}
