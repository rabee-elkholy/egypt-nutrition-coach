// Editorial familiarity policy, researched in Egypt. Sources establish names
// and meal context only; nutritional observations come from the retained library.
import { displayIngredientName } from './meal-presentation.mjs';
export const EGYPTIAN_POLICY_VERSION = 'egypt-everyday-1';
export const EGYPTIAN_NAME_SOURCES = [
  { title: 'CBC سفرة: الفول وطرق تقديمه', url: 'https://cbcsofra.com/ls/أسرار-فول-العربية-من-شيفات-سفرة/' },
  { title: 'CBC سفرة: سمك بلطي في الفرن', url: 'https://cbcsofra.com/wa/سمك-مشوي-بالزيت-والليمون/' },
  { title: 'قائمة بلَدينا في سوما باي', url: 'https://somabayholidays.com/wp-content/uploads/Baladina-Menu.pdf' },
  { title: 'قائمة بوخارست المنشورة عبر جامعة MSA', url: 'https://alumni.msa.edu.eg/images/2026/pdf/menu_edit_2025.pdf' },
  { title: 'قائمة زازا: الفطار والأطباق', url: 'https://www.zazacuisine.com/uploads/menus/files/2-nile-menu-sp5d6.pdf' },
];
const alternativeKeys = new Set(['brownrice','oats','broccoli','cottage','eggwhite','bulgur','couscous','wholebread']);
const breakfastKeys = ['fava','egg','feta'];

// This is a new planned choice of bread, never a source equivalence or a
// correction to old intake. The exact baladi reference UUID is carried into
// the snapshot and all nutrients are recalculated from that ingredient.
export function egyptianBreadChoice(template, lib, preferences, allowed) {
  if (preferences.region !== 'egypt' || !lib.ingredients.bread ||
      !allowed(lib.ingredients.bread, preferences)) return template;
  if (!template.items.some(p => p.key === 'wholebread')) return template;
  const items = template.items.map(p => p.key === 'wholebread'
    ? { ...p, key: 'bread', grams: String(Math.min(lib.ingredients.bread.max_g,
        Math.max(lib.ingredients.bread.min_g, Number(p.grams)))) }
    : { ...p });
  return { ...template, items, editorial_policy_version: EGYPTIAN_POLICY_VERSION,
    notes: template.notes + ' اختير عيش بلدي بدل خبز البيتا لهذه الخطة الجديدة؛ القيم محسوبة من عينة العيش البلدي المحددة في المصدر، وليست متوسط كل الأرغفة.' };
}

export function familiarEgyptianChoice(template, slot) {
  const keys = template.items.map(p => p.key);
  if (keys.some(k => alternativeKeys.has(k))) return false;
  if (slot === 'breakfast' || slot === 'dinner') return (
    (keys.includes('bread') && keys.some(k => [...breakfastKeys,'chicken'].includes(k))) ||
    (keys.includes('egg') && keys.includes('potato')));
  if (slot === 'lunch') return (
    (keys.some(k => ['rice','potato','bread','pasta'].includes(k)) &&
      keys.some(k => ['chicken','chickenthigh','beef'].includes(k))) ||
    (keys.includes('fish') && keys.some(k => ['rice','potato','bread'].includes(k))) ||
    (keys.includes('rice') && keys.some(k => ['lentils','kidney','whitebeans'].includes(k))));
  return slot === 'snack';
}

// Keep sufficient diversity under restrictive preferences. Less familiar
// choices remain available for deliberate swaps; never relax an exclusion.
export function egyptianSlotPool(pool, region, slot, minimum = 3) {
  const candidates = pool.filter(t => t.meal_slots.includes(slot));
  if (region !== 'egypt') return candidates;
  if (candidates.every(t => t.component_definitions && t.dish_family)) return candidates;
  const familiar = candidates.filter(t => familiarEgyptianChoice(t, slot));
  const unique = new Set(familiar.map(t => JSON.stringify([...new Set(t.items.map(p => p.key))].sort())));
  return unique.size >= minimum ? familiar : candidates;
}

// Changing only the side vegetable should not reset the repetition counter.
export function egyptianMealFamily(template, lib, region) {
  if (region !== 'egypt') return template.id;
  if (template.dish_family) return template.dish_family;
  return JSON.stringify(template.items.map(p => lib.ingredients[p.key])
    .filter(i => ['protein','carb'].includes(i.role)).map(i => i.key).sort());
}

export function egyptianMealName(template, lib) {
  const keys = new Set(template.items.map(p => p.key));
  const label = k => displayIngredientName(lib.ingredients[k]);
  let main = ['chicken','chickenthigh','fish','beef','fava','lentils','kidney','whitebeans','chickpeas','egg','feta']
    .find(k => keys.has(k));
  if (!main) return template.name;
  const titles = { chicken:'فراخ مشوية', chickenthigh:'ورك فراخ مشوي', fish:'بلطي مشوي أو بالفرن',
    beef:'لحمة مفرومة مشوية', fava:'فول', lentils:'عدس مسلوق', kidney:'فاصوليا حمراء مسلوقة',
    whitebeans:'فاصوليا بيضاء مسلوقة', chickpeas:'حمص مسلوق', egg:'بيض مسلوق', feta:'جبنة بيضاء فيتا' };
  let name = titles[main];
  if (main === 'fava' && keys.has('tahini')) name += ' بالطحينة';
  else if (main === 'fava' && keys.has('lemon')) name += keys.has('garlic') ? ' بالليمون والثوم' : ' بالليمون';
  if (keys.has('eggwhite')) name += ' وبياض بيض';
  const carb = ['rice','brownrice','potato','pasta','bread','wholebread','bulgur','couscous'].find(k => keys.has(k));
  if (carb) name += ' + ' + label(carb).replace(/ مطبوخ$/, '').replace(' دون قشر','');
  const vegetables = template.items.filter(p => lib.ingredients[p.key].role === 'veg');
  if (keys.has('tomato') && keys.has('cucumber') && vegetables.length === 2) name += ' + سلطة';
  else if (vegetables.length) name += ' + ' + vegetables.map(p => label(p.key)).join(' و');
  return name.length <= 120 ? name : name.slice(0,116) + '…';
}
