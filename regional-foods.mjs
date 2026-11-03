import {REGIONAL_MEAL_COMBINATIONS} from './regional-meal-combinations.mjs';
import {EXPANDED_REGIONAL_ROWS} from './regional-foods-expanded.mjs';
// Culinary sources establish dish identity, not measured nutrient composition.
export const REGION_COUNTRIES = {
  egypt: 'مصر', gulf: 'السعودية، الإمارات، الكويت، قطر، البحرين، عُمان',
  levant: 'الأردن، لبنان، سوريا، فلسطين', maghreb: 'المغرب، الجزائر، تونس، ليبيا'
};
export const REGIONAL_SOURCES = {
 EG: 'https://en.wikipedia.org/wiki/Egyptian_cuisine',
 SA: 'https://saudipedia.com/en/list-of-regional-dishes-in-the-kingdom',
 AE: 'https://www.visitdubai.com/things-to-do/eat-and-drink/discover-emirati-cuisine-in-dubai',
 QA: 'https://visitqatar.com/intl-en/about-qatar/cuisine',
 OM: 'https://experienceoman.om/en/things-to-do-categories/heritage-and-culture-activities',
 KW: 'https://en.wikipedia.org/wiki/Kuwaiti_cuisine', BH: 'https://en.wikipedia.org/wiki/Bahraini_cuisine',
 LB: 'https://en.wikipedia.org/wiki/Lebanese_cuisine', SY: 'https://en.wikipedia.org/wiki/Syrian_cuisine',
 PS: 'https://www.seriouseats.com/how-to-get-started-cooking-palestinian-food-7106766',
 JO: 'https://en.wikipedia.org/wiki/Jordanian_cuisine',
 MA: 'https://www.visitmorocco.com/en/travel-info/food-drinks',
 TN: 'https://www.discovertunisia.com/en/sophistication-and-tradition',
 DZ: 'https://en.wikipedia.org/wiki/Algerian_cuisine',
 LY: 'https://libyanheritagehouse.org/arts-culture/libyan-cuisine'
};
// Ready-to-eat grams, including retained oil; editorial serving models, not raw recipes.
// Explicit adapted names identify substitutions. No invented measured recipe yields.
const rows = {
 egypt: [
 ['koshari','كشري مصري','EG','lunch dinner','rice:100 lentils:90 pasta:70 chickpeas:40 tomatocooked:80 onion:30 sunfloweroil:10'],
 ['fatta','فتة لحم بالخل والثوم','EG','lunch dinner','beef:120 rice:130 bread:40 tomatocooked:70 garlic:4 sunfloweroil:8'],
 ['hawawshi','حواوشي مخبوز','EG','lunch dinner','beef:110 bread:80 onion:35 pepper:40 sunfloweroil:5'],
 ['liver','كبدة إسكندراني بالعيش','EG','lunch dinner','liver:120 bread:70 pepper:60 garlic:4 sunfloweroil:8'],
 ['bessara','بصارة بالفول والبصل','EG','lunch dinner','fava:220 onion:50 parsley:20 garlic:4 olive:8 wholebread:50'],
 ['okra-beef','بامية باللحمة والأرز','EG','lunch dinner','okra:180 beef:100 rice:120 tomatocooked:80 sunfloweroil:8'],
 ['peas-chicken','بسلة بالجزر والفراخ والأرز','EG','lunch dinner','peas:120 carrotcooked:70 chicken:110 rice:110 tomatocooked:70 sunfloweroil:7'],
 ['beans-beef','فاصوليا بيضاء باللحمة','EG','lunch dinner','whitebeans:180 beef:100 tomatocooked:100 rice:90 sunfloweroil:8'],
 ['spinach-rice','سبانخ باللحمة والأرز','EG','lunch dinner','spinach:180 beef:100 rice:120 tomatocooked:80 garlic:3 sunfloweroil:8'],
 ['potato-tray','صينية بطاطس بالفراخ','EG','lunch dinner','potato:230 chickenthigh:130 tomatocooked:90 onion:40 sunfloweroil:8'],
 ['eggplant','مسقعة باللحمة','EG','lunch dinner','eggplant:200 beef:100 tomatocooked:110 pepper:60 olive:12 wholebread:50'],
 ['lentil-soup','شوربة عدس بالخضار والعيش','EG','lunch dinner','lentils:190 carrotcooked:60 tomatocooked:60 onion:30 wholebread:50 olive:5'],
 ['rice-milk','أرز معمر بالحليب والدجاج','EG','lunch dinner','rice:170 wholemilk:100 chicken:110 sunfloweroil:5'],
 ['zucchini','كوسة بالصلصة واللحمة','EG','lunch dinner','zucchini:220 beef:110 tomatocooked:100 rice:100 olive:7'],
 ['sayadeya','صيادية سمك بالبصل','EG','lunch dinner','fish:160 rice:160 onion:60 sunfloweroil:10 tomato:80'],
 ['shrimp-rice','طاجن جمبري بالصلصة والأرز','EG','lunch dinner','shrimp:160 rice:140 tomatocooked:100 pepper:60 garlic:4 olive:8'],
 ['egg-fava','فول بالبيض والعيش','EG','breakfast dinner','fava:150 egg:100 bread:50 tomato:80 olive:5'],
 ['fava-tahini','فول بالطحينة والليمون','EG','breakfast dinner','fava:180 tahini:15 lemon:15 bread:60 cucumber:100'],
 ['cottage-salad','جبنة قريش بالطماطم والخيار','EG','breakfast dinner','cottage:150 tomato:100 cucumber:100 bread:70 olive:5'],
 ['egga','عجة بيض بالخضار في الفرن','EG','breakfast dinner','egg:150 onion:40 parsley:25 tomato:70 wholebread:40 sunfloweroil:6'],
 ['tuna-potato','سلطة بطاطس بالتونة','EG','lunch dinner','tuna:110 potato:180 onion:25 lemon:20 olive:7 cucumber:80'],
 ['sweetpotato-milk','بطاطا مشوية بالحليب','EG','breakfast snack','sweetpotato:180 milk:140 honey:8'],
 ['rice-pudding','أرز باللبن والعسل — نسخة منزلية','EG','snack','rice:80 milk:150 honey:15'],
 ['dates-milk','بلح باللبن','EG','snack breakfast','dates:40 milk:200'],
 ['chickpea-salad','حمص بالليمون والطماطم','EG','snack dinner','chickpeas:150 tomato:70 lemon:20 olive:5']
 ],
 gulf: [
 ['kabsa','كبسة دجاج','SA','lunch dinner','chicken:140 basmati:170 tomatocooked:70 onion:30 sunfloweroil:8'],
 ['kabsa-lamb','كبسة لحم','SA','lunch dinner','lamb:130 basmati:160 tomatocooked:80 onion:35 sunfloweroil:8'],
 ['saleeg','سليق بالدجاج والحليب','SA','lunch dinner','rice:190 wholemilk:140 chicken:140 sunfloweroil:5'],
 ['jareesh','جريش بالدجاج — نموذج برغل مطبوخ','SA','lunch dinner','bulgur:200 chickenboiled:110 yogurt:100 onion:40 olive:8'],
 ['marqooq','مرقوق — نسخة بخبز القمح واللحم','SA','lunch dinner','wholebread:90 beef:110 zucchini:90 carrotcooked:60 tomatocooked:80 olive:8'],
 ['qursan','قرصان — نسخة خبز قمح بالخضار','SA','lunch dinner','wholebread:80 beef:100 greenbeans:90 zucchini:90 tomatocooked:80 olive:8'],
 ['haneeth','حنيذ لحم مع الأرز','SA','lunch dinner','lamb:150 basmati:170 onion:40 tomato:80 olive:5'],
 ['qalaba','فول قلابة','SA','breakfast dinner','fava:200 tomatocooked:90 onion:30 wholebread:60 olive:8'],
 ['masoub','معصوب بالموز والخبز والعسل','SA','breakfast','banana:130 wholebread:70 honey:15 wholemilk:80'],
 ['machboos-chicken','مجبوس دجاج','QA','lunch dinner','chickenthigh:150 basmati:160 onion:45 tomatocooked:65 sunfloweroil:8'],
 ['madrooba','مضروبة دجاج بالأرز','QA','lunch dinner','chickenboiled:130 rice:180 tomatocooked:60 onion:40 olive:8'],
 ['thareed','ثريد لحم — نسخة خبز قمح','QA','lunch dinner','beef:120 wholebread:80 potato:80 carrotcooked:70 tomatocooked:90 olive:8'],
 ['balaleet','بلاليط — نموذج مكرونة رفيعة بالعسل والبيض','QA','breakfast','pasta:150 egg:100 honey:15 sunfloweroil:6'],
 ['saloona','صالونة دجاج بالخضار','AE','lunch dinner','chicken:140 potato:120 carrotcooked:80 zucchini:100 tomatocooked:100 olive:8'],
 ['harees','هريس — نموذج برغل ولحم','AE','lunch dinner','bulgur:230 beef:130 sunfloweroil:10'],
 ['fish-machboos','مجبوس سمك','AE','lunch dinner','seabass:160 basmati:160 tomatocooked:80 onion:40 sunfloweroil:8'],
 ['shuwa','شواء عماني مع الأرز','OM','lunch dinner','lamb:150 rice:160 garlic:5 lemon:20 sunfloweroil:6'],
 ['arsiya','عرسية دجاج بالأرز','OM','lunch dinner','chickenboiled:150 rice:210 sunfloweroil:7'],
 ['qabooli','قبولي لحم بالحمص — دون زبيب','OM','lunch dinner','lamb:120 basmati:160 chickpeas:60 onion:40 almonds:10 olive:6'],
 ['mashuai','سمك مشوي مع أرز بالليمون','OM','lunch dinner','fish:180 basmati:170 lemon:25 olive:7'],
 ['mashkhool','مشخول دجاج','KW','lunch dinner','chicken:150 basmati:190 onion:60 sunfloweroil:8'],
 ['murabyan','مربين — أرز بالروبيان','KW','lunch dinner','shrimp:170 basmati:180 onion:50 tomatocooked:50 sunfloweroil:8'],
 ['muhammar','محمر بالسمك — نسخة عسل','BH','lunch dinner','rice:180 fish:150 honey:18 sunfloweroil:7'],
 ['fish-tomato','سمك بالصلصة والأرز البحريني','BH','lunch dinner','seabass:170 rice:150 tomatocooked:120 onion:40 olive:8'],
 ['dates-yogurt','تمر بالروب والمكسرات','QA','snack breakfast','dates:40 yogurt:180 almonds:15']
 ],
 levant: [
 ['hummus','حمص بالطحينة وخبز القمح','LB','breakfast dinner','chickpeas:160 tahini:20 lemon:20 garlic:3 wholebread:60 olive:5'],
 ['mujaddara','مجدرة عدس وأرز','LB','lunch dinner','lentils:170 rice:130 onion:70 olive:12 cucumber:100'],
 ['mdardara','مدردرة عدس بالأرز والبصل','LB','lunch dinner','lentils:150 rice:180 onion:100 olive:15'],
 ['loubieh','لوبية بالزيت والخبز','LB','lunch dinner','greenbeans:220 tomatocooked:120 onion:40 garlic:4 olive:15 wholebread:70'],
 ['batata-harra','بطاطا حرة بالثوم والكزبرة — نموذج بالبقدونس','LB','lunch dinner','potato:240 garlic:5 parsley:20 olive:12 lemon:20 yogurt:100'],
 ['fatteh-hummus','فتة حمص باللبن','LB','breakfast dinner','chickpeas:140 yogurt:150 wholebread:50 tahini:15 almonds:10'],
 ['tawook','شيش طاووق مع خبز وسلطة','LB','lunch dinner','chicken:160 yogurt:40 garlic:4 lemon:20 wholebread:70 tomato:100 olive:6'],
 ['kafta','كفتة بالصينية مع البطاطا','LB','lunch dinner','beef:140 potato:170 onion:50 parsley:20 tomatocooked:100 olive:8'],
 ['tabbouleh','تبولة بالبرغل والحمص','LB','lunch dinner','parsley:70 tomato:120 bulgur:80 chickpeas:100 lemon:25 olive:10'],
 ['fattoush','فتوش بالخبز المحمص والحمص','LB','lunch dinner','lettuce:70 tomato:100 cucumber:100 wholebread:50 chickpeas:100 lemon:25 olive:8'],
 ['kibbeh','كبة بالصينية — نموذج مطبوخ','SY','lunch dinner','beef:140 bulgur:160 onion:50 walnuts:15 olive:8'],
 ['kibbeh-yogurt','كبة بلبنية — نموذج مطبوخ','SY','lunch dinner','beef:110 bulgur:130 yogurt:160 onion:30 olive:7'],
 ['harak','حراق إصبعه — نموذج عدس ومكرونة','SY','lunch dinner','lentils:180 pasta:100 onion:60 lemon:30 garlic:5 olive:12'],
 ['shakriyeh','شاكرية باللحم والأرز','SY','lunch dinner','beef:130 yogurt:200 rice:130 onion:35 olive:5'],
 ['yalanji','حشوة يالنجي بالخضار — بدون ورق العنب','SY','lunch dinner','rice:170 tomato:80 onion:50 parsley:25 olive:12 lemon:25'],
 ['muhammara','محمرة — نموذج فلفل وجوز وخبز','SY','breakfast dinner','pepper:150 walnuts:30 wholebread:65 olive:8 lemon:20'],
 ['maqluba','مقلوبة دجاج وباذنجان','PS','lunch dinner','chicken:140 rice:150 eggplant:150 tomatocooked:80 olive:12'],
 ['musakhan','مسخن — نسخة خبز قمح ودجاج وبصل','PS','lunch dinner','chickenthigh:150 onion:120 wholebread:85 olive:18 almonds:10'],
 ['maftoul','مفتول — نموذج برغل بالحمص والدجاج','PS','lunch dinner','bulgur:180 chickpeas:100 chicken:120 tomatocooked:70 onion:40 olive:8'],
 ['fasolia','فاصوليا بالصلصة والأرز','PS','lunch dinner','whitebeans:190 rice:130 tomatocooked:100 onion:30 olive:8'],
 ['mansaf','منسف — نسخة زبادي بدل الجميد','JO','lunch dinner','lamb:130 yogurt:180 rice:160 wholebread:30 almonds:12'],
 ['rashouf','رشوف — نموذج عدس وبرغل ولبن','JO','lunch dinner','lentils:150 bulgur:100 yogurt:160 onion:40 olive:8'],
 ['galayet','قلاية بندورة باللحم','JO','lunch dinner','tomatocooked:240 beef:120 onion:35 olive:10 wholebread:70'],
 ['zarb','زرب دجاج وخضار — نسخة فرن','JO','lunch dinner','chickenthigh:160 potato:180 carrotcooked:80 onion:50 olive:8'],
 ['yogurt-honey','لبن بالعسل والجوز','LB','snack breakfast','yogurt:180 honey:15 walnuts:20']
 ],
 maghreb: [
 ['couscous-veg','كسكس بالخضار والحمص','MA','lunch dinner','couscous:190 chickpeas:100 carrotcooked:70 zucchini:80 tomatocooked:70 olive:10'],
 ['couscous-lamb','كسكس باللحم والخضار','MA','lunch dinner','couscous:180 lamb:120 carrotcooked:70 zucchini:80 olive:8'],
 ['couscous-chicken','كسكس بالدجاج والخضار','MA','lunch dinner','couscous:180 chicken:140 carrotcooked:70 cabbage:80 olive:8'],
 ['tagine-chicken','طاجين دجاج بالليمون — بدون زيتون مخلل','MA','lunch dinner','chickenthigh:160 potato:160 lemon:25 onion:70 olive:12'],
 ['tagine-kefta','طاجين كفتة بالبيض','MA','lunch dinner','beef:120 egg:100 tomatocooked:180 onion:40 olive:10 wholebread:50'],
 ['harira','حريرة بالعدس والحمص واللحم','MA','lunch dinner','lentils:90 chickpeas:90 beef:80 pasta:50 tomatocooked:100 parsley:15 olive:7'],
 ['bissara','بيصارة بزيت الزيتون','MA','breakfast dinner','fava:230 garlic:5 olive:15 wholebread:60'],
 ['zaalouk','زعلوك باذنجان بالخبز والحمص','MA','lunch dinner','eggplant:200 tomatocooked:130 garlic:4 olive:12 wholebread:60 chickpeas:80'],
 ['taktouka','تكتوكة فلفل وطماطم مع البيض','MA','breakfast dinner','pepper:160 tomatocooked:160 egg:100 olive:10 wholebread:60'],
 ['rfissa','رفيسة — نموذج خبز قمح وعدس ودجاج','MA','lunch dinner','wholebread:90 lentils:110 chicken:130 onion:80 olive:12'],
 ['mechoui','مشوي ضأن مع الخبز والسلطة','MA','lunch dinner','lamb:160 wholebread:70 tomato:100 cucumber:100 olive:5'],
 ['lablabi','لبلابي بالحمص والبيض','TN','breakfast lunch dinner','chickpeas:200 wholebread:60 egg:50 olive:10 lemon:20'],
 ['mechouia','سلطة مشوية بالتونة والبيض','TN','lunch dinner','pepper:170 tomatocooked:130 tuna:80 egg:50 olive:10 wholebread:50'],
 ['tajine-tunis','طاجين تونسي بالبطاطا والدجاج','TN','lunch dinner','egg:150 potato:140 chicken:80 mozzarella:25 parsley:20 olive:8'],
 ['kafteji','كفتاجي — نسخة خضار مشوية بالبيض','TN','lunch dinner','potato:120 pepper:100 tomato:100 zucchini:100 egg:100 olive:15'],
 ['couscous-fish','كسكس تونسي بالسمك','TN','lunch dinner','couscous:180 fish:160 tomatocooked:110 carrotcooked:60 olive:10'],
 ['ojja','عجة تونسية بالجمبري','TN','lunch dinner','egg:100 shrimp:120 tomatocooked:160 pepper:80 olive:10 wholebread:50'],
 ['chorba','شوربة عدس ولحم جزائرية','DZ','lunch dinner','lentils:120 beef:90 tomatocooked:120 onion:40 parsley:15 olive:8 wholebread:50'],
 ['rechta','رشتة — نموذج مكرونة بالدجاج والحمص','DZ','lunch dinner','pasta:180 chicken:120 chickpeas:70 zucchini:80 onion:40 olive:8'],
 ['chakhchoukha','شخشوخة — نموذج خبز ولحم وخضار','DZ','lunch dinner','wholebread:100 lamb:110 chickpeas:70 tomatocooked:100 carrotcooked:80 olive:10'],
 ['dolma','دولمة كوسة باللحم والأرز','DZ','lunch dinner','zucchini:230 beef:100 rice:110 tomatocooked:90 olive:8'],
 ['hmiss','حميس فلفل وطماطم مع الخبز والبيض','DZ','breakfast dinner','pepper:180 tomatocooked:160 egg:100 olive:12 wholebread:70'],
 ['mbakbaka','مبكبكة باللحم','LY','lunch dinner','pasta:190 beef:120 tomatocooked:160 onion:50 olive:10'],
 ['bosla','كسكسي بالبصلة واللحم','LY','lunch dinner','couscous:170 lamb:120 chickpeas:70 onion:100 potato:80 olive:10'],
 ['sharba','شربة ليبية — نموذج مكرونة ولحم','LY','lunch dinner','pasta:100 beef:90 chickpeas:70 tomatocooked:130 onion:40 parsley:15 olive:8']
 ]
};
for (const region of Object.keys(rows)) rows[region].push(...EXPANDED_REGIONAL_ROWS[region]);

const DISH_SOURCES={
 'egypt-taro-beef':'https://english.ahram.org.eg/NewsContent/50/1208/399179/AlAhram-Weekly/Features/Cooking-taro.aspx',
 'levant-arnabit-tahini':'https://food-heritage.org/cauliflower-in-tahini-sauce-arnabit-b-thineh/',
 'levant-beetroot-tahini':'https://www.discoverlebanon.com/en/recipes/beetroot_tahinah_salad.php',
 'maghreb-couscous-pumpkin':'https://tasteofmaroc.com/moroccan-pureed-vegetable-soup/'
};
export const REGIONAL_RECIPES = Object.entries(rows).flatMap(([region, list]) => list.map(([id,name,country,slots,parts]) => ({
 id:`regional-${region}-${id}`, name, country, regions:[region], meal_slots:slots.split(' '),
 items:parts.split(' ').map(pair=>{const [key,grams]=pair.split(':');return {key,grams};}),
 source_url:DISH_SOURCES[region+'-'+id] || REGIONAL_SOURCES[country], quality:'editorial_regional_serving_estimate',
 model_kind:'dish_serving', nutrition_confidence:'estimated', review_status:'pending_specialist_review',
 notes:'نموذج حصة تقديري من أوزان مكونات جاهزة للأكل، وليس تحليلًا معمليًا للطبق. الزيت ضمن المكونات؛ الملح والتوابل غير محددين، لذلك الصوديوم غير مؤكد. يختلف التحضير بين البيوت والمطاعم.'
})));
REGIONAL_RECIPES.push(...REGIONAL_MEAL_COMBINATIONS);

export function regionalFoodTemplates(lib, region) {
 return REGIONAL_RECIPES.filter(r=>region==='any'||r.regions.includes(region)).map(r=>{
  for(const p of r.items) if(!lib.ingredients[p.key]) throw Error(`Missing regional ingredient ${p.key}`);
  const tier={low:1,medium:2,high:3};
  const budget=r.items.map(p=>lib.ingredients[p.key].budget_tier).sort((a,b)=>tier[b]-tier[a])[0];
  return {...r,dish_family:r.selection_family || r.id,budget_tier:budget,healthy_priority:true,component_definitions:[{id:'regional-dish',name:r.name,role:'main'}],items:r.items.map(p=>({...p,component_id:'regional-dish'}))};
 });
}
