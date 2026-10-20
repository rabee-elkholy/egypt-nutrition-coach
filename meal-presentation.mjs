// Presentation only: original snapshots, preparation states and quantities stay intact.
import { MEAL_NAME_LABELS } from './meal-name-labels.mjs';
const reviewedLabel = (i) => {
  const row = MEAL_NAME_LABELS[i.food_id];
  return row && i.source === row.source && i.state === row.state ? row : null;
};
export function displayIngredientName(ingredient) {
  return reviewedLabel(ingredient)?.label || String(ingredient.name || ingredient.label || 'مكوّن');
}
export function displayMealName(snapshot) {
  const original = String(snapshot.name || 'وجبة');
  if (!snapshot.template_id) return original;
  if (!original.startsWith('وجبة ')) {
    let name = original;
    const replacements = (snapshot.ingredients || []).flatMap(i => reviewedLabel(i)?.replacements || []);
    for (const [before, after] of replacements.sort((a,b) => b[0].length - a[0].length)) {
      const literal = before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp('(^|[^\\p{L}\\p{N}])' + literal + '(?![\\p{L}\\p{N}])', 'gu');
      name = name.replace(pattern, (_, prefix) => prefix + after);
    }
    return name.length > 120 ? name.slice(0,116) + '…' : name;
  }
  const parts = [...new Set((snapshot.ingredients || [])
    .filter(i => i.role !== 'fat').map(i => displayIngredientName(i).trim()).filter(Boolean))];
  if (!parts.length) return original;
  let name = '';
  for (const part of parts) {
    const next = name ? name + ' + ' + part : part;
    if (next.length > 116) return name ? name + '…' : part.slice(0, 116) + '…';
    name = next;
  }
  return name;
}
