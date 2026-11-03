// Menu combinations, not claims of additional traditional dishes. Shared meals
// have one ID and multiple eligible regions rather than copies per country.
const all=['egypt','gulf','levant','maghreb'];
const parse=s=>s.split(' ').map(pair=>{const [key,grams]=pair.split(':');return {key,grams};});
const mains=[
 ['salmon','سلمون مشوي','salmon:160 lemon:20 olive:5'],
 ['turkey','ديك رومي مطهو','turkey:150 olive:5'],
 ['liver-pepper','كبدة بالفلفل','liver:140 pepper:70 onion:40 sunfloweroil:6'],
 ['soy-tomato','فول صويا بالصلصة','soybeans:180 tomatocooked:100 olive:5'],
 ['chicken-mushroom','دجاج بالمشروم','chicken:140 mushrooms:100 olive:8'],
 ['beef-mushroom','لحم بالمشروم','beef:140 mushrooms:100 olive:8'],
 ['eggs-spinach','بيض بالسبانخ','egg:150 spinach:100 sunfloweroil:5'],
 ['chicken-lemon','دجاج مشوي بالليمون','chicken:150 lemon:20 olive:6'],
 ['chicken-thigh','ورك دجاج مشوي','chickenthigh:160 olive:5'],
 ['chicken-boiled','دجاج مسلوق','chickenboiled:160'],
 ['beef-onion','لحم بقري بالبصل','beef:140 onion:50 olive:6'],
 ['lamb-roast','لحم ضأن مشوي','lamb:140 olive:5'],
 ['fish-garlic','سمك بالثوم والليمون','fish:170 garlic:4 lemon:20 olive:6'],
 ['seabass','قاروص مشوي','seabass:170 lemon:20 olive:6'],
 ['shrimp','جمبري بالثوم','shrimp:170 garlic:4 olive:6'],
 ['tuna','تونة بالليمون','tuna:140 lemon:20 olive:6'],
 ['eggs','بيض مسلوق','egg:150'],
 ['lentils-onion','عدس بالبصل','lentils:220 onion:60 olive:8'],
 ['whitebeans','فاصوليا بيضاء بالصلصة','whitebeans:220 tomatocooked:100 garlic:3 olive:8'],
 ['kidney','فاصوليا حمراء بالخضار','kidney:210 pepper:70 tomatocooked:90 olive:8'],
 ['chickpeas','حمص بالطحينة','chickpeas:200 tahini:18 lemon:20'],
 ['fava','فول بالليمون','fava:220 lemon:20 olive:8']
];
const starches=[
 ['corn','ذرة حلوة','corn:160',all],
 ['taro','قلقاس مطبوخ','taro:180',['egypt','levant','maghreb']],
 ['rice','أرز أبيض','rice:150',['egypt','levant']],
 ['basmati','أرز بسمتي','basmati:150',['gulf']],
 ['bulgur','برغل','bulgur:170',['gulf','levant']],
 ['couscous','كسكس','couscous:170',['maghreb']],
 ['pasta','مكرونة','pasta:160',['egypt','maghreb']],
 ['baladi','عيش بلدي','bread:75',['egypt']],
 ['wholebread','خبز قمح كامل','wholebread:75',['gulf','levant','maghreb']],
 ['potato','بطاطس مسلوقة','potato:200',all]
];
const sides=[
 ['cauliflower','قرنبيط بالطحينة','cauliflower:140 tahini:12 lemon:15'],
 ['beetroot','سلطة بنجر','beetroot:120 parsley:15 lemon:15 olive:4'],
 ['pumpkin','قرع بالجزر','pumpkin:130 carrotcooked:70 olive:4'],
 ['mushrooms','مشروم بالسبانخ','mushrooms:100 spinach:100 olive:4'],
 ['salad','سلطة طماطم وخيار','tomato:100 cucumber:100 parsley:15'],
 ['vegetables','خضار مطهوة','zucchini:110 carrotcooked:80 tomatocooked:60'],
 ['yogurt','زبادي بالخيار','yogurt:130 cucumber:80 garlic:3'],
 ['greens','سلطة خضراء بالليمون','lettuce:80 pepper:70 cucumber:80 lemon:20']
];
const breakfastMains=[
 ['egg-mushroom','بيض بالمشروم','egg:100 mushrooms:80 sunfloweroil:5'],
 ['cheese-spinach','جبنة بالسبانخ','cottage:130 spinach:100 olive:5'],
 ['bean-tahini','فاصوليا بيضاء بالطحينة','whitebeans:170 tahini:15 lemon:15'],
 ['cottage','جبنة قريش','cottage:160 olive:5'],
 ['feta','جبنة بيضاء','feta:75'],
 ['eggs','بيض مسلوق','egg:100'],
 ['omelet','بيض عيون','friedegg:110'],
 ['fava','فول بالطحينة','fava:170 tahini:15'],
 ['hummus','حمص بالطحينة','chickpeas:160 tahini:15 lemon:15'],
 ['tuna','تونة بالليمون','tuna:110 lemon:20'],
 ['falafel','فلافل','falafel:100']
];
const breakfastBreads=[
 ['baladi','عيش بلدي','bread:70',['egypt']],
 ['wholebread','خبز قمح كامل','wholebread:70',all],
 ['toast','توست','toast:65',all]
];
const breakfastSides=[
 ['beetroot','بنجر بالليمون','beetroot:100 lemon:15'],
 ['corn','ذرة وطماطم','corn:70 tomato:70'],
 ['tomato','طماطم','tomato:120'],['cucumber','خيار وخس','cucumber:100 lettuce:60'],
 ['pepper','فلفل وبقدونس','pepper:100 parsley:20']
];
const fruits=[['pear','كمثرى','pear:140'],['guava','جوافة','guava:130'],['grape','عنب','grape:120'],['orange','برتقال','orange:150'],['banana','موز','banana:110'],['apple','تفاح','apple:140'],['mango','مانجو','mango:130'],['strawberry','فراولة','strawberry:160'],['dates','تمر','dates:35'],['fig','تين','fig:130']];
const dairy=[['cottage-fruit','جبنة قريش','cottage:130'],['yogurt','زبادي','yogurt:170'],['greek','زبادي يوناني','greekyogurt:150'],['milk-oats','شوفان بالحليب','milk:150 oats:30']];
const nuts=[['cashews','كاجو','cashews:15'],['almonds','لوز','almonds:15'],['walnuts','جوز','walnuts:15'],['peanuts','فول سوداني','peanuts:18']];
function merge(parts){
 const amounts=new Map();for(const text of parts)for(const p of parse(text))amounts.set(p.key,(amounts.get(p.key)||0)+Number(p.grams));
 return [...amounts].map(([key,grams])=>({key,grams:String(grams)}));
}
const recipes=[];
function add(id,name,regions,slots,parts,family){
 recipes.push({id:'regional-combo-'+id,name,regions:[...regions],country:null,meal_slots:slots,
  items:merge(parts),model_kind:'meal_combination',selection_family:family,
  source_url:'https://github.com/rabee-elkholy/egypt-nutrition-coach/blob/main/regional-meal-combinations.mjs',
  source_scope:'Culinary context only; this combination and its serving weights are authored editorially',
  quality:'editorial_regional_serving_estimate',nutrition_confidence:'estimated',review_status:'pending_specialist_review',
  notes:'تركيبة وجبة مقترحة وليست اسم طبق تراثي جديد. الحساب تقديري من مكونات جاهزة للأكل والزيت الموضح. الملح والتوابل غير محددين؛ الصوديوم غير مؤكد. اختر الكمية التي أكلتها فعليًا.'});
}
for(const [mainId,mainName,mainParts] of mains)for(const [starchId,starchName,starchParts,regions] of starches)for(const [sideId,sideName,sideParts] of sides)
 add(`main-${mainId}-${starchId}-${sideId}`,`${mainName} مع ${starchName} و${sideName}`,regions,['lunch','dinner'],[mainParts,starchParts,sideParts],'main-'+mainId);
for(const [mainId,mainName,mainParts] of breakfastMains)for(const [breadId,breadName,breadParts,regions] of breakfastBreads)for(const [sideId,sideName,sideParts] of breakfastSides)
 add(`breakfast-${mainId}-${breadId}-${sideId}`,`${mainName} مع ${breadName} و${sideName}`,regions,['breakfast','dinner'],[mainParts,breadParts,sideParts],'breakfast-'+mainId);
for(const [baseId,baseName,baseParts] of dairy)for(const [fruitId,fruitName,fruitParts] of fruits)for(const [nutId,nutName,nutParts] of nuts)
 add(`snack-${baseId}-${fruitId}-${nutId}`,`${baseName} مع ${fruitName} و${nutName}`,all,['snack'],[baseParts,fruitParts,nutParts],'snack-'+baseId);
export const REGIONAL_MEAL_COMBINATIONS = recipes;
