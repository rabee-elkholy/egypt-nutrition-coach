import {alternatives} from './planner-core.mjs';
import {componentAlternatives} from './meal-components.mjs';
export function pantryCatalog(lib){
 const groups=[['eggs','بيض',['egg','friedegg']],['chicken','صدور فراخ بدون جلد',['chicken','chickenboiled']],['tomato','طماطم',['tomato','tomatocooked']],['carrot','جزر',['carrot','carrotcooked']]];
 const covered=new Set(groups.flatMap(g=>g[2]));
 return [...groups.map(([id,label,keys])=>({id,label,keys:keys.filter(k=>lib.ingredients[k])})),...Object.values(lib.ingredients).filter(i=>!covered.has(i.key)).map(i=>({id:i.key,label:i.label,keys:[i.key]}))];
}
export function pantryKeys(selected,lib){
 const catalog=pantryCatalog(lib),known=new Map(catalog.map(r=>[r.id,r]));
 if(!Array.isArray(selected)||selected.length>100||selected.some(id=>!known.has(id)))throw Error('راجع مكونات البيت المختارة');
 return new Set(selected.flatMap(id=>known.get(id).keys));
}
export function pantryAlternatives(meal,prefs,lib,selected,index=null,limit=12){
 const keys=pantryKeys(selected,lib);if(!keys.size)return [];
 const rows=index==null?alternatives(meal,prefs,lib,1000):componentAlternatives(meal.snapshot,index,prefs,lib,meal.slot);
 return rows.filter(a=>a.snapshot.ingredients.every(i=>keys.has(i.key))).slice(0,limit);
}
