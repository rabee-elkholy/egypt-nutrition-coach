import {alternatives} from './planner-core.mjs';
import {componentAlternatives} from './meal-components.mjs';
import {apiError} from './coaching-error.mjs';

const EN_LABELS={
 eggs:'Eggs',chicken:'Skinless Chicken Breast',tomato:'Tomato',carrot:'Carrot',
 egg:'Boiled Eggs',friedegg:'Fried Eggs',eggwhite:'Egg Whites',chickenboiled:'Boiled Chicken Breast',
 chickenthigh:'Chicken Thigh',turkey:'Turkey Breast',fish:'Grilled Tilapia',seabass:'Sea Bass',
 tuna:'Canned Tuna',salmon:'Salmon',shrimp:'Shrimp',beef:'Lean Beef',lamb:'Lamb',liver:'Beef Liver',
 fava:'Fava Beans (Foul)',lentils:'Lentils',chickpeas:'Chickpeas',kidney:'Kidney Beans',
 whitebeans:'White Beans',soybeans:'Soybeans',falafel:'Falafel',cottage:'Cottage Cheese',
 feta:'White Feta Cheese',mozzarella:'Mozzarella Cheese',yogurt:'Plain Yogurt',
 greekyogurt:'Greek Yogurt',milk:'Skim Milk',wholemilk:'Whole Milk',bread:'Baladi Bread',
 wholebread:'Whole-Wheat Bread',toast:'Whole-Wheat Toast',rice:'White Rice',brownrice:'Brown Rice',
 basmati:'Basmati Rice',pasta:'Pasta',oats:'Oats',potato:'Potato',sweetpotato:'Sweet Potato',
 bulgur:'Bulgur',couscous:'Couscous',quinoa:'Quinoa',olive:'Olive Oil',sunfloweroil:'Sunflower Oil',
 tahini:'Tahini',peanuts:'Peanuts',peanutbutter:'Peanut Butter',almonds:'Almonds',walnuts:'Walnuts',
 cashews:'Cashews',avocado:'Avocado',cucumber:'Cucumber',lettuce:'Lettuce',spinach:'Spinach',
 broccoli:'Broccoli',zucchini:'Zucchini',pepper:'Bell Pepper',onion:'Onion',garlic:'Garlic',
 eggplant:'Eggplant',greenbeans:'Green Beans',cabbage:'Cabbage',okra:'Okra',molokhia:'Molokhia',
 peas:'Green Peas',cauliflower:'Cauliflower',mushrooms:'Mushrooms',taro:'Taro',corn:'Sweet Corn',
 beetroot:'Beetroot',pumpkin:'Pumpkin',parsley:'Parsley',lemon:'Lemon',apple:'Apple',
 banana:'Banana',orange:'Orange',dates:'Dates',mango:'Mango',guava:'Guava',strawberry:'Strawberry',
 grape:'Grapes',watermelon:'Watermelon',fig:'Figs',pear:'Pear',melon:'Cantaloupe',honey:'Honey'
};

function categoryForIngredient(ing){
 const pg=ing?.protein_group;
 if(['chicken','fish','meat','eggs','legumes'].includes(pg))return 'protein';
 if(pg==='dairy')return 'dairy';
 if(pg==='nuts')return 'fats_nuts';
 const role=ing?.role||'';
 if(/carb|grain|bread|starch/i.test(role))return 'carbs';
 if(/veg/i.test(role))return 'vegetables';
 if(/fruit/i.test(role))return 'fruits';
 if(/fat|oil/i.test(role))return 'fats_nuts';
 if(['bread','wholebread','toast','rice','brownrice','basmati','pasta','oats','potato','sweetpotato','bulgur','couscous','quinoa'].includes(ing?.key))return 'carbs';
 if(['olive','sunfloweroil','tahini','avocado'].includes(ing?.key))return 'fats_nuts';
 if(['apple','banana','orange','dates','mango','guava','strawberry','grape','watermelon','fig','pear','melon'].includes(ing?.key))return 'fruits';
 if(['cucumber','lettuce','tomato','tomatocooked','spinach','broccoli','zucchini','pepper','onion','garlic','eggplant','greenbeans','cabbage','okra','molokhia','peas','cauliflower','mushrooms','carrot','carrotcooked','taro','corn','beetroot','pumpkin','parsley','lemon'].includes(ing?.key))return 'vegetables';
 return 'pantry';
}

export function pantryCatalog(lib){
 const groups=[
  ['eggs','بيض','Eggs','protein',['egg','friedegg']],
  ['chicken','صدور فراخ بدون جلد','Skinless Chicken Breast','protein',['chicken','chickenboiled']],
  ['tomato','طماطم','Tomato','vegetables',['tomato','tomatocooked']],
  ['carrot','جزر','Carrot','vegetables',['carrot','carrotcooked']]
 ];
 const covered=new Set(groups.flatMap(g=>g[4]));
 return [
  ...groups.map(([id,label,labelEn,category,keys])=>({id,label,labelEn,category,keys:keys.filter(k=>lib.ingredients[k])})),
  ...Object.values(lib.ingredients).filter(i=>!covered.has(i.key)).map(i=>({
   id:i.key,
   label:i.label,
   labelEn:EN_LABELS[i.key]||i.english||i.key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
   category:categoryForIngredient(i),
   keys:[i.key]
  }))
 ];
}

export function pantryKeys(selected,lib){
 const catalog=pantryCatalog(lib),known=new Map(catalog.map(r=>[r.id,r]));
 if(!Array.isArray(selected)||selected.length>100||selected.some(id=>!known.has(id)))throw apiError('INVALID_PANTRY_SELECTION','Invalid pantry ingredient selection.',{status:400});
 return new Set(selected.flatMap(id=>known.get(id).keys));
}

export function pantryAlternatives(meal,prefs,lib,selected,index=null,limit=12,profile=null,accept=null){
 const keys=pantryKeys(selected,lib);if(!keys.size)return [];
 const safeLimit=Math.max(1,Math.min(100,Number(limit)||12));
 const predicate=a=>a.snapshot.ingredients.every(i=>keys.has(i.key))&&(!accept||accept(a));
 const rows=index==null
  ?alternatives(meal,prefs,lib,100,profile,predicate)
  :componentAlternatives(meal.snapshot,index,prefs,lib,meal.slot).filter(predicate);
 return rows.slice(0,safeLimit);
}
