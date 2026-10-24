// Food Catalog Adapter & Egyptian Nutrition Search Engine
// Decouples `/v1/foods` and `/v1/beverages` from the 86-ingredient meal planner library,
// indexing the full reference dataset (`data/index.json`, `data/egypt_catalog.json`, `data/recipe_estimates.json`, `data/meta.json`)
// and providing a clean adapter interface for importing snapshots from the external `Egypt Nutrition Database`.

import library from '../data/planning-library.json' with {type:'json'};
import rawIndex from '../data/index.json' with {type:'json'};
import egyptCatalog from '../data/egypt_catalog.json' with {type:'json'};
import recipeEstimates from '../data/recipe_estimates.json' with {type:'json'};
import meta from '../data/meta.json' with {type:'json'};
import { normalize as normalizeAr, nameScore } from '../core.mjs';
import { aggregate } from '../calculator.mjs';
import { volumeGrams } from '../portions.mjs';

// Extended Egyptian Arabic / Gulf / Transliteration synonym & colloquial dictionary
const EGYPTIAN_SYNONYMS = {
  'فول': ['فول مدمس', 'fava', 'broad beans', 'ful', 'foul'],
  'فول مدمس': ['فول مسلوق', 'فول مطبوخ', 'fava'],
  'طعميه': ['فلافل', 'taameya', 'tameya', 'falafel'],
  'فلافل': ['طعميه', 'طعمية', 'falafel', 'taameya'],
  'كشري': ['كشري مصري', 'koshary', 'koshari', 'kushari'],
  'ملوخيه': ['ملوخية', 'molokhia', 'mulukhiyah'],
  'محشي': ['ورق عنب', 'كرنب محشي', 'كوسه محشيه', 'فلفل محشي', 'باذنجان محشي', 'mahshi'],
  'عيش': ['خبز', 'عيش بلدي', 'baladi bread', 'pita'],
  'عيش بلدي': ['خبز بلدي', 'عيش بلدي — عينه المرجع'],
  'خبز': ['عيش', 'عيش بلدي', 'bread'],
  'رز': ['ارز', 'أرز', 'rice'],
  'ارز': ['رز', 'أرز', 'rice'],
  'مكرونه': ['ماكرونه', 'باستا', 'بشاميل', 'macaroni', 'pasta'],
  'فراخ': ['دجاج', 'chicken'],
  'دجاج': ['فراخ', 'chicken'],
  'لحمه': ['لحم', 'بقري', 'ضاني', 'كفته', 'كفتة', 'beef', 'meat'],
  'كفته': ['كفتة', 'kofta', 'kebab'],
  'فته': ['فتة', 'fattah', 'fatteh'],
  'فطير': ['فطير مشلتت', 'feteer'],
  'بطاطس': ['بطاطا', 'potato'],
  'كنافه': ['كنافة', 'kunafa', 'kanafeh', 'konafa'],
  'بسبوسه': ['بسبوسة', 'هريسه', 'basbousa'],
  'قطايف': ['atayef', 'katayef'],
  'ام علي': ['أم علي', 'om ali', 'umm ali'],
  'شاي': ['شاي احمر', 'شاي كشري', 'شاي بالنعناع', 'شاي باللبن', 'شاي بالسكر', 'مشروب شاي'],
  'شاي بسكر': ['شاي بالسكر', 'شاي احمر', 'مشروب شاي'],
  'قهوه': ['قهوة', 'قهوه تركي', 'قهوه باللبن', 'كابتشينو', 'لاتيه', 'اسبريسو'],
  'قهوه بلبن': ['قهوة باللبن', 'قهوه باللبن', 'لاتيه', 'كابتشينو', 'cafe con leche'],
  'مانجا': ['مانجو', 'عصير مانجو', 'عصير مانجو باللب', 'مانجو باللبن', 'mango'],
  'عصير مانجا': ['عصير مانجو باللب', 'مانجو باللبن', 'عصير مانجو', 'مانجو'],
  'عصير برتقال': ['عصير برتقال طبيعي', 'برتقال', 'orange juice'],
  'عصير جوافه': ['عصير جوافة باللب', 'عصير جوافة', 'جوافه', 'guava'],
  'قصب': ['عصير قصب', 'مشروب قصب السكر', 'sugarcane'],
  'تمر هندي': ['تمرهندي', 'tamarind'],
  'خروب': ['خروب باللب', 'carob'],
  'سوبيا': ['سوبيا باللبن وجوز الهند', 'sobia'],
  'دوم': ['doum'],
  'قمر الدين': ['قمر الدين باللب', 'قمرالدين'],
  'كركديه': ['كركديه سادة', 'كركديه محلى', 'عناب', 'hibiscus'],
  'سحلب': ['سحلب بالنشا', 'sahlab'],
  'حلبه': ['حلبة منقوعة', 'fenugreek'],
  'ينسون': ['يانسون', 'anise'],
  'لبن': ['حليب', 'milk'],
  'حليب': ['لبن', 'milk'],
  'زبادي': ['روب', 'لبن زبادي', 'yogurt', 'yoghurt'],
  'جبنه': ['جبن', 'قريش', 'فيتا', 'رومي', 'حلوم', 'موتزاريلا', 'cheese']
};

function expandQuerySynonyms(rawQuery) {
  const norm = normalizeAr(rawQuery);
  if (!norm) return [];
  const phrases = new Set([norm]);
  if (EGYPTIAN_SYNONYMS[norm]) {
    for (const syn of EGYPTIAN_SYNONYMS[norm]) phrases.add(normalizeAr(syn));
  }
  const colloquialMapped = norm
    .replace(/\bبسكر\b/g, 'بالسكر')
    .replace(/\bبلبن\b/g, 'باللبن')
    .replace(/\bبحليب\b/g, 'باللبن')
    .replace(/\bمانجا\b/g, 'مانجو')
    .replace(/\bطعميه\b/g, 'فلافل');
  phrases.add(colloquialMapped);
  if (EGYPTIAN_SYNONYMS[colloquialMapped]) {
    for (const syn of EGYPTIAN_SYNONYMS[colloquialMapped]) phrases.add(normalizeAr(syn));
  }
  return [...phrases];
}

// Build unified catalog index at startup
const planningByFoodId = new Map();
const planningByKey = new Map();
for (const ing of Object.values(library.ingredients)) {
  planningByKey.set(ing.key, ing);
  if (ing.food_id) planningByFoodId.set(ing.food_id, ing);
}

const egyptByFoodId = new Map();
for (const eg of egyptCatalog) {
  for (const fid of (eg.linked_food_ids || [])) {
    egyptByFoodId.set(fid, eg);
  }
  for (const eid of (eg.estimate_links || [])) {
    egyptByFoodId.set(eid, eg);
  }
}

const estimateById = new Map(recipeEstimates.map(e => [e.id, e]));

const CATALOG_ITEMS = rawIndex.map(item => {
  const planIng = planningByFoodId.get(item.id);
  const egEntry = egyptByFoodId.get(item.id);
  const estModel = estimateById.get(item.id);
  const isApproved = item.status === 'approved';
  const qualityTier = isApproved
    ? 'Verified Source'
    : (item.source === 'editorial-estimates' ? 'Calculated from Verified Ingredients (Requires Specialist Review)' : 'Pending Review');
  const reviewStatus = isApproved ? 'Approved' : 'Pending Review';
  const [energy, protein, fat, carbs] = item.macros || [null, null, null, null];
  const values = planIng?.values || {
    energy: energy ?? null,
    protein: protein ?? null,
    fat: fat ?? null,
    carbs: carbs ?? null,
    fiber: estModel?.calculation?.nutrients?.['fdc:1079'] ?? null,
    saturated: estModel?.calculation?.nutrients?.['fdc:1258'] ?? null,
    sodium: estModel?.calculation?.nutrients?.['fdc:1093'] ?? null,
    sugars: estModel?.calculation?.nutrients?.['fdc:2000'] ?? null
  };
  const searchNames = [...new Set([
    item.name,
    item.english,
    ...(item.names || []),
    ...(planIng ? [planIng.label, ...(planIng.aliases || [])] : []),
    ...(egEntry ? [egEntry.name_ar, egEntry.name_en, ...(egEntry.aliases || [])] : []),
    ...(estModel ? [estModel.name_ar, ...(estModel.aliases || [])] : [])
  ].filter(Boolean))];

  return {
    id: item.id,
    key: planIng?.key || item.id,
    planningKey: planIng?.key || null,
    name: planIng?.label || item.name_presentation?.display_name || item.name,
    name_ar: planIng?.label || egEntry?.name_ar || item.name_presentation?.display_name || item.name,
    name_en: item.english || egEntry?.name_en || item.name_presentation?.source_title || null,
    aliases: searchNames,
    status: item.status,
    reviewStatus,
    qualityTier,
    approvedForPlanning: Boolean(planIng && isApproved),
    isApproximate: !isApproved,
    kind: item.kind,
    beverage: Boolean(item.beverage),
    state: item.state,
    categories: item.categories || [],
    region: egEntry ? 'EG' : (meta.sources?.[item.source]?.region || 'US'),
    source: item.source,
    sourceMeta: meta.sources?.[item.source] ? {
      id: meta.sources[item.source].id,
      title: meta.sources[item.source].title,
      region: meta.sources[item.source].region,
      license: meta.sources[item.source].license
    } : null,
    basis: item.basis,
    basis_label: item.basis_label,
    quantity_basis: item.quantity_basis,
    volume_evidence: item.volume_evidence || null,
    portion_units: item.portion_units || [],
    portions: planIng?.portions || [],
    values,
    _searchPairs: searchNames.map(n => {
      const norm = normalizeAr(n);
      const baseWords = norm.split(" ");
      const words = new Set(baseWords);
      for (const w of baseWords) {
        for (const prefix of ["بال", "وال", "لل", "ال"]) {
          if (w.startsWith(prefix) && w.length - prefix.length >= 2) words.add(w.slice(prefix.length));
        }
      }
      return { raw: n, norm, baseWords, words };
    })
  };
});

const CATALOG_BY_ID = new Map();
for (const c of CATALOG_ITEMS) {
  CATALOG_BY_ID.set(c.id, c);
  if (c.planningKey) CATALOG_BY_ID.set(c.planningKey, c);
}

let externalCatalogSnapshot = null;

export function registerExternalFoodCatalogSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.items)) {
    throw new Error('صيغة لقطة قاعدة البيانات الغذائية الخارجية غير صالحة.');
  }
  externalCatalogSnapshot = {
    version: String(snapshot.version || 'external-1.0'),
    importedAt: new Date().toISOString(),
    source: String(snapshot.source || 'egypt-nutrition-database'),
    items: snapshot.items.filter(x => x && x.id && x.name_ar)
  };
  return {
    version: externalCatalogSnapshot.version,
    count: externalCatalogSnapshot.items.length
  };
}

export function getFoodCatalogManifest() {
  return {
    version: meta.version,
    nutrientSourceEdition: meta.nutrient_source_edition,
    sqliteSha256: meta.sqlite_sha256,
    counts: {
      planningIngredients: Object.keys(library.ingredients).length,
      planningTemplates: library.templates.length,
      approvedReferenceFoods: meta.food_count,
      estimatedRecipes: meta.estimated_recipe_count,
      beverages: meta.beverage_count,
      estimatedBeverages: meta.estimated_beverage_count,
      egyptCatalogEntities: meta.catalog_count,
      totalIndexed: CATALOG_ITEMS.length
    },
    externalDatabaseAdapter: {
      connected: Boolean(externalCatalogSnapshot),
      version: externalCatalogSnapshot?.version || null,
      itemCount: externalCatalogSnapshot?.items?.length || 0,
      status: externalCatalogSnapshot ? 'connected' : 'awaiting_external_snapshot_or_connection'
    }
  };
}

function fastPrecomputedScore(pair, qNorm, qTokens) {
  const { norm, baseWords, words } = pair;
  if (!qNorm) return 1;
  if (norm === qNorm) return 1000;
  if (!qTokens.every(t => norm.includes(t))) return 0;
  const wholeWordBonus = qTokens.every(t => words.has(t)) ? 50 + (baseWords[0] === qTokens[0] ? 20 : 0) : 0;
  return 100 + wholeWordBonus + (norm.startsWith(qNorm) ? 30 : 0) + qNorm.length / Math.max(norm.length, 1);
}

function strictItemMatchScore(item, rawQuery, expandedTokenized) {
  if (!rawQuery) {
    return (item.planningKey ? 500 : 0) + (item.region === 'EG' ? 100 : 0) + (item.status === 'approved' ? 50 : 0);
  }
  const primary = expandedTokenized[0];
  let best = 0;
  for (const pair of item._searchPairs) {
    const s = fastPrecomputedScore(pair, primary.norm, primary.tokens);
    if (s > best) best = s;
    for (let i = 1; i < expandedTokenized.length; i++) {
      const syn = expandedTokenized[i];
      const synScore = fastPrecomputedScore(pair, syn.norm, syn.tokens);
      if (synScore >= 80) {
        const weighted = synScore * syn.weight;
        if (weighted > best) best = weighted;
      }
    }
  }
  if (best <= 0) return 0;
  if (item.planningKey) best += 20;
  if (item.region === 'EG') best += 15;
  return best;
}

export function searchFoodCatalog(options = {}) {
  const q = String(options.q || '').trim().slice(0, 100);
  const scope = options.scope || 'all'; // 'planning' | 'approved' | 'all' | 'beverages'
  const includeEstimated = options.includeEstimated === true || options.status === 'published' || options.status === 'all';
  const kindFilter = options.kind || null;
  const categoryFilter = options.category || null;
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));

  const normQuery = normalizeAr(q);
  const qWordCount = normQuery ? normQuery.split(' ').length : 0;
  const expanded = expandQuerySynonyms(q);
  const expandedTokenized = expanded.map((phrase, idx) => ({
    norm: phrase,
    tokens: phrase.split(' '),
    weight: idx === 0 ? 1 : (phrase.split(' ').length >= qWordCount ? 0.96 : 0.75)
  }));

  let pool = CATALOG_ITEMS;
  if (scope === 'planning') {
    pool = pool.filter(x => x.planningKey != null);
  } else if (scope === 'beverages' || kindFilter === 'beverage') {
    pool = pool.filter(x => x.beverage);
  }
  if (categoryFilter) {
    pool = pool.filter(x => x.categories.includes(categoryFilter));
  }

  const approvedScored = [];
  const estimatedScored = [];

  for (const item of pool) {
    const s = strictItemMatchScore(item, q, expandedTokenized);
    if (s <= 0) continue;
    if (item.status === 'approved') approvedScored.push([item, s]);
    else estimatedScored.push([item, s]);
  }

  approvedScored.sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name, 'ar'));
  estimatedScored.sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name, 'ar'));

  const topApprovedScore = approvedScored[0]?.[1] || 0;
  const topEstimatedScore = estimatedScored[0]?.[1] || 0;

  let combined;
  if (scope === 'approved') {
    combined = approvedScored;
  } else if (includeEstimated) {
    combined = [...approvedScored, ...estimatedScored].sort((a, b) => b[1] - a[1]);
  } else if (approvedScored.length > 0 && topApprovedScore >= topEstimatedScore * 0.85) {
    // If an estimated model is an exact match (e.g. شاي بالسكر / قهوة باللبن / عصير مانجو) while approved only matched generic tea/coffee, include exact estimated models flagged clearly
    const exactEstimates = estimatedScored.filter(([, sc]) => sc > topApprovedScore + 40);
    combined = [...exactEstimates, ...approvedScored];
  } else {
    combined = [...estimatedScored, ...approvedScored];
  }

  const total = combined.length;
  const slice = combined.slice(offset, offset + limit).map(([item]) => ({
    id: item.id,
    key: item.key,
    planningKey: item.planningKey,
    name: item.name,
    name_ar: item.name_ar,
    name_en: item.name_en,
    state: item.state,
    kind: item.kind,
    beverage: item.beverage,
    status: item.status,
    reviewStatus: item.reviewStatus,
    qualityTier: item.qualityTier,
    approvedForPlanning: item.approvedForPlanning,
    isApproximate: item.isApproximate,
    region: item.region,
    basis: item.basis,
    basis_label: item.basis_label,
    portion_units: item.portion_units,
    values: item.values,
    source: item.source,
    sourceMeta: item.sourceMeta
  }));

  const hasApprovedInSlice = slice.some(x => x.status === 'approved');
  const hasEstimatedInSlice = slice.some(x => x.status === 'estimated');

  return {
    items: slice,
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : null,
    coverageStatus: total === 0
      ? 'missing_coverage'
      : (hasApprovedInSlice && !hasEstimatedInSlice
        ? 'verified_reference_available'
        : (hasApprovedInSlice && hasEstimatedInSlice
          ? 'mixed_verified_and_estimated'
          : 'estimated_model_only_requires_specialist_review'))
  };
}

export function getFoodCatalogItem(idOrKey) {
  const item = CATALOG_BY_ID.get(idOrKey);
  if (!item) return null;
  const estModel = estimateById.get(item.id);
  const egEntry = egyptByFoodId.get(item.id);
  return {
    ...item,
    _searchPairs: undefined,
    egyptCatalogMetadata: egEntry || null,
    recipeEstimateModel: estModel ? {
      id: estModel.id,
      name_ar: estModel.name_ar,
      preparation: estModel.preparation,
      servings: estModel.servings,
      approval: estModel.approval,
      quality: estModel.quality,
      review_scope: estModel.review_scope,
      assumptions: estModel.assumptions,
      quantity_basis: estModel.quantity_basis,
      ingredients: estModel.ingredients?.map(i => ({
        key: i.key,
        food_id: i.food_id,
        name_ar: i.name_ar,
        grams: i.grams,
        state: i.state,
        source_id: i.source_id
      }))
    } : null
  };
}

export function calculatePreparedBeverageOrRecipe(input = {}) {
  const { ingredients = [], unit = 'grams', finalWeightGrams = null, additions = [] } = input;
  if (unit === 'ml' && !input.densityGPerMl && !input.volumeEvidence) {
    throw new Error('لا يمكن تحويل المليلتر (100mL) إلى جرامات (100g) بدون كثافة موثقة (density) أو دليل حجم مصدري.');
  }
  const metrics = ['energy', 'protein', 'fat', 'carbs', 'fiber', 'saturated', 'sodium', 'sugars'];
  const resolvedItems = [];

  for (const part of [...ingredients, ...additions]) {
    const catItem = CATALOG_BY_ID.get(part.key || part.id);
    if (!catItem) throw new Error(`المكوّن غير موجود في الفهرس المعتمد: ${part.key || part.id}`);
    if (catItem.status !== 'approved' && input.requireApproved !== false) {
      throw new Error(`المكوّن (${catItem.name}) غير معتمد مرجعيًا ولا يمكن استخدامه في حساب معتمد تلقائيًا.`);
    }
    let grams = part.grams;
    if (part.ml != null) {
      if (catItem.volume_evidence) {
        grams = volumeGrams(String(part.ml), catItem.volume_evidence);
      } else if (part.densityGPerMl != null && Number(part.densityGPerMl) > 0) {
        grams = String(Number(part.ml) * Number(part.densityGPerMl));
      } else {
        throw new Error(`المكوّن السائل (${catItem.name}) يفتقد معامل كثافة موثق لتحويل المليلتر إلى جرام.`);
      }
    }
    resolvedItems.push({
      grams: String(grams),
      values: catItem.values,
      factors: part.retentionFactors || Object.fromEntries(metrics.map(k => [k, '1']))
    });
  }

  const calc = aggregate(resolvedItems, metrics, finalWeightGrams ? String(finalWeightGrams) : null);
  return {
    qualityTier: finalWeightGrams ? 'Calculated from Verified Ingredients' : 'Calculated Input Formulation (Unmeasured Cooked Yield)',
    reviewStatus: 'Requires Specialist Review',
    approvedForAutonomousClinicalUse: false,
    inputWeightGrams: calc.input_weight_g,
    finalWeightGrams: finalWeightGrams ? calc.final_weight_g : null,
    yieldRatio: finalWeightGrams ? calc.yield_ratio : null,
    per100gAvailable: Boolean(finalWeightGrams),
    nutrients: Object.fromEntries(metrics.map(k => [
      k,
      {
        total: calc.nutrients[k].total,
        per100g: finalWeightGrams ? calc.nutrients[k].per_100g : null,
        coverageByWeight: calc.nutrients[k].coverage_by_input_weight
      }
    ]))
  };
}
