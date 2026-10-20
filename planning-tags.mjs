import {normalize} from './core.mjs';
export const SLOTS={breakfast:'فطار',lunch:'غداء',dinner:'عشاء',snack:'سناك'};
export const BUDGETS={low:'قليلة',medium:'متوسطة',high:'كبيرة'};
export const PROTEINS={legumes:'فول وعدس وبقول',eggs:'بيض',dairy:'لبن وزبادي وجبن',chicken:'فراخ',fish:'سمك',meat:'لحوم حمراء',nuts:'مكسرات وبذور'};
export const TAG_RULE_VERSION='egypt-planning-tags-1';
export function classifyFood(f){
 const n=normalize([f.name,f.english,...(f.names||[])].join(' ')),cats=f.categories||[];
 let meals=['lunch','dinner'],budget='medium',role='food',rule='generic-food',reason='استخدامات مقترحة في الغداء والعشاء؛ يمكن تعديلها حسب طريقة تقديم الطعام.';
 const groups=[];
 const is=(s)=>new RegExp(s,'i').test(n);
 if(is('chicken|فراخ|دجاج'))groups.push('chicken');
 if(is('fish|salmon|tuna|tilapia|سمك|تونه|بلطي|سلمون|shrimp|prawn|جمبري'))groups.push('fish');
 if(is('beef|veal|lamb|mutton|كفته|كباب|لحمه|لحم|كبد|liver'))groups.push('meat');
 if(is('eggs?|بيض'))groups.push('eggs');
 if(is('milk|yogurt|cheese|لبن|زبادي|جبن'))groups.push('dairy');
 if(is('lentil|chickpea|broadbean|fava|beans?|فول|عدس|حمص|فاصوليا'))groups.push('legumes');
 if(is('nuts?|peanuts?|almond|sesame|seed|walnut|مكسرات|فول سوداني|لوز|سمسم|بذور|جوز'))groups.push('nuts');
 if(cats.includes('ingredients.fruits')||is('^apples|^bananas|^oranges|^dates|فاكهه')){meals=['breakfast','snack'];budget='low';rule='fruit';reason='فاكهة للحصة الجانبية أو الفطار والسناك.';role='fruit';}
 if(cats.includes('ingredients.vegetables')){meals=Object.keys(SLOTS);budget='low';role='ingredient';rule='vegetable';reason='كمكوّن أو خضار جانبي في أي وجبة؛ حالة التحضير المكتوبة مهمة.';}
 if(groups.includes('legumes')&&!groups.includes('nuts')){meals=['breakfast','lunch','dinner'];budget='low';rule='pulses';}
 if(groups.includes('eggs')||groups.includes('dairy')){meals=['breakfast','dinner','snack'];budget='low';rule='eggs-dairy';}
 if(is('bread|oats|oatmeal|عيش|خبز|شوفان')){meals=Object.keys(SLOTS);budget='low';rule='bread-cereal';}
 if(is('rice|pasta|macaroni|ارز|رز |مكرونه|محشي|فت[هة]|كشري|ملوخيه|بشاميل|لازانيا|نجريسكو')){meals=['lunch','dinner'];budget='low';rule='staple-dish';}
 if(groups.includes('chicken')||groups.includes('fish')){meals=['lunch','dinner'];budget='medium';rule='animal-protein';}
 if(groups.includes('meat')){meals=['lunch','dinner'];budget='high';rule='red-meat';}
 if(groups.includes('nuts')){meals=['breakfast','snack'];budget=is('peanut|فول سوداني|sesame|سمسم')?'low':'high';rule='nuts-seeds';}
 if(f.beverage){meals=Object.keys(SLOTS);role='drink';budget=is('smoothie|milkshake|espresso|latte|كابتشينو|ميلك شيك|لاتيه')?'medium':'low';rule='prepared-drink';reason='مشروب مصاحب للوجبات؛ السكر والإضافات يغيّران القيم.';}
 if(cats.includes('recipes.desserts')||is('cake|cookie|dessert|pastry|ice cream|chocolate|بسبوسه|كنافه|قطايف|كيك|جاتوه|حلوي|مهلبيه|ام علي|دونات|donut')){meals=['snack'];budget='medium';rule='dessert';reason='قد يُتناول كسناك؛ التصنيف ليس توصية بتناوله يوميًا.';}
 if(is('salmon|shrimp|prawn|lobster|quail|venison|duck|سلمون|جمبري|استاكوزا|سمان|almond|walnut|pistachio|لوز|فستق'))budget='high';
 if(is('oil|flour|spices|leavening|سكر|زيت|دقيق|توابل|خميره')&&!is('with|بزيت|بالزيت')){role='ingredient';meals=Object.keys(SLOTS);rule='cooking-ingredient';reason='يُستخدم كمكوّن؛ ليس وجبة مستقلة أو اقتراحًا للأكل مباشرة.';}
 const requiresPreparation=(f.state==='raw'||f.state==='dried')&&(groups.some(g=>['chicken','fish','meat','eggs','legumes'].includes(g))||is('rice|pasta|flour|ارز|مكرونه|دقيق'));
 if(requiresPreparation)role='ingredient';
 if(reason.startsWith('استخدامات')&&rule!=='generic-food')reason='مواعيد تقديم مقترحة حسب نوع الطعام: '+meals.map(k=>SLOTS[k]).join('، ')+'. ليست قيدًا على وقت تناوله.';
 return {meal_slots:meals,budget_tier:budget,budget_scope:'Editorial relative cost for Egypt; no current price or monetary guarantee',protein_groups:groups,role,requires_preparation:requiresPreparation,rule_id:rule,rule_version:TAG_RULE_VERSION,confidence:rule==='generic-food'?'broad_suggestion':'category_suggestion',explanation:requiresPreparation?'الاستخدام كمكوّن بعد التحضير؛ لا يُؤكل بهذه الحالة مباشرة.':reason,review_scope:'تصنيف استخدام وتكلفة تقديري؛ منفصل عن اعتماد المغذيات'};
}
export function planningFilter(foods,{meal='',budget=''}={}){return foods.filter(f=>(!meal||f.planning?.meal_slots.includes(meal))&&(!budget||f.planning?.budget_tier===budget));}
