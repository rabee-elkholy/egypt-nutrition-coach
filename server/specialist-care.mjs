// KAN-61 (US-NUT-05): CuraFit Meal Capture (Photo / Arabic-English Dialect Voice / Text Quick Log)
// KAN-84 (US-CCH-05): 3-Specialist Interactive Care Room (Nutrition Specialist, Training Captain, Follow-Up Specialist)
// Strictly CuraFit Specialist Team framing — ZERO AI/automated/algorithm/engine/bot wording in user-facing output.

import { clockNow, isoNow, clockTimeZone } from './clock.mjs';
import {
  localDate,
  normalizeLocale,
  isPregnantStatus,
  minSafeEnergyFloor,
  canonicalInjuries
} from '../coaching-shared.mjs';
import { apiError } from '../coaching-error.mjs';
import { fetchWithTimeout } from './external-crypto.mjs';
import { searchFoodCatalog, getFoodCatalogItem } from './food-catalog.mjs';
import { activePlan, dayTotals } from './food.mjs';
import { accountRecovery } from './recovery.mjs';
import { computeCycleState } from './wellness-tools.mjs';
import { getFastingState } from './nutrition-tools.mjs';
import { getDiningOutOptions } from './dining-out.mjs';
import { consumeFeatureAccess, FREE_LIMITS, PRO_FAIR_USE_LIMITS } from './subscriptions.mjs';

const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|Smart|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;
const GEMINI_MODEL = 'gemini-2.5-flash';

function sanitizeSpecialistCopy(text) {
  return String(text || '')
    .replace(/\bAI Coach\b/gi, 'CuraFit Specialist Team')
    .replace(/\bSmart Coach\b/gi, 'CuraFit Specialist Team')
    .replace(/\bAI\b/gi, 'Specialist')
    .replace(/\bSmart\b/gi, 'tailored')
    .replace(/\b(automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b/gi, 'personalized')
    .replace(/\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/g, 'المختص');
}

function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function detectImageMimeType(bytes, declaredType = '') {
  if (bytes && bytes.length >= 12) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) return 'image/webp';
  }
  const norm = String(declaredType || '').toLowerCase().split(';')[0].trim();
  if (norm === 'image/png' || norm === 'image/webp' || norm === 'image/jpeg') return norm;
  if (norm === 'image/jpg') return 'image/jpeg';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// 1. KAN-61: CuraFit Meal Capture (Photo / Voice / Text -> Grounded Items + Clinical Cross-Check)
// ---------------------------------------------------------------------------

const NON_FOOD_CUES_RE = /\b(blank table|empty table|empty plate|no food|wall|ceiling|floor|laptop|keyboard|shoe|car|blurry|nothing here)\b|طاولة فارغة|طبق فاضي|لا يوجد طعام/i;

// High-frequency Egyptian, Gulf, Levantine & English food phrases -> catalog search query + default unit grams + allergen/clinical tags
const DIALECT_FOOD_LEXICON = [
  { re: /boiled\s+eggs?|eggs?|بيض\s*مسلوق|بيضتين|بيضة|بيض/i, query: 'egg', labelEn: 'Boiled Egg', unitG: 50, unitLabel: 'egg', tags: ['eggs'] },
  { re: /baladi\s*bread|baladi\s*loaf|عيش\s*بلدي|خبز\s*بلدي|رغيف\s*بلدي/i, query: 'bread', labelEn: 'Egyptian Baladi Bread', unitG: 90, unitLabel: 'loaf', tags: ['gluten'] },
  { re: /whole\s*wheat\s*bread|brown\s*bread|toast|عيش\s*سن|توست|خبز\s*اسمر|خبز\s*بر/i, query: 'wholebread', labelEn: 'Whole Wheat Bread', unitG: 56, unitLabel: 'slice', tags: ['gluten'] },
  { re: /\bfoul\b|\bful\b|fava\s*beans?|فول\s*مدمس|فول/i, query: 'fava', labelEn: 'Ful Medames (Fava Beans)', unitG: 150, spoonG: 25, unitLabel: 'serving', tags: ['fava', 'legumes'] },
  { re: /falafel|taameya|tameya|طعمية|طعميه|فلافل/i, query: 'falafel', labelEn: 'Falafel / Taameya', unitG: 35, unitLabel: 'piece', tags: ['fava', 'legumes'] },
  { re: /olive\s*oil|زيت\s*زيتون/i, query: 'olive', labelEn: 'Extra Virgin Olive Oil', unitG: 14, spoonG: 14, unitLabel: 'tbsp', tags: [] },
  { re: /tahini|طحينة|طحينه/i, query: 'tahini', labelEn: 'Sesame Tahini', unitG: 15, spoonG: 15, unitLabel: 'tbsp', tags: ['sesame'] },
  { re: /grilled\s*chicken|chicken\s*breast|shish\s*tawook|فراخ\s*مشوية|صدور\s*فراخ|صدر\s*دجاج|دجاج\s*مشوي|شيش\s*طاووق/i, query: 'chicken', labelEn: 'Grilled Chicken Breast', unitG: 150, unitLabel: 'portion', tags: ['chicken'] },
  { re: /chicken\s*shawarma|shawarma|شاورما\s*فراخ|شاورما/i, query: 'chicken', labelEn: 'Chicken Shawarma', unitG: 180, unitLabel: 'wrap', tags: ['chicken', 'gluten'] },
  { re: /molokhia|mulukhiyah|ملوخية|ملوخيه/i, query: 'ملوخية', labelEn: 'Egyptian Molokhia', unitG: 200, unitLabel: 'bowl', tags: [] },
  { re: /koshary|koshari|kushari|كشري/i, query: 'كشري', labelEn: 'Egyptian Koshary', unitG: 250, unitLabel: 'bowl', tags: ['gluten', 'legumes'] },
  { re: /mahshi|stuffed\s*vine|ورق\s*عنب|محشي/i, query: 'محشي', labelEn: 'Stuffed Vegetables (Mahshi)', unitG: 180, unitLabel: 'serving', tags: [] },
  { re: /brown\s*rice|رز\s*بني|أرز\s*بني/i, query: 'brownrice', labelEn: 'Cooked Brown Rice', unitG: 150, spoonG: 25, unitLabel: 'serving', tags: [] },
  { re: /basmati|بسمتي/i, query: 'basmati', labelEn: 'Cooked Basmati Rice', unitG: 150, spoonG: 25, unitLabel: 'serving', tags: [] },
  { re: /white\s*rice|egyptian\s*rice|\brice\b|أرز|ارز|رز/i, query: 'rice', labelEn: 'Cooked White Rice', unitG: 150, spoonG: 25, unitLabel: 'serving', tags: [] },
  { re: /pasta|macaroni|مكرونة|مكرونه/i, query: 'pasta', labelEn: 'Cooked Pasta', unitG: 150, unitLabel: 'serving', tags: ['gluten'] },
  { re: /fries|french\s*fries|بطاطس\s*محمرة|بطاطس\s*مقلية/i, query: 'potato', labelEn: 'French Fries', unitG: 120, unitLabel: 'small serving', tags: [] },
  { re: /sweet\s*potato|بطاطا\s*حلوة|بطاطا/i, query: 'sweetpotato', labelEn: 'Baked Sweet Potato', unitG: 150, unitLabel: 'medium', tags: [] },
  { re: /potato|بطاطس/i, query: 'potato', labelEn: 'Boiled / Roasted Potato', unitG: 150, unitLabel: 'medium', tags: [] },
  { re: /whey\s*protein|protein\s*shake|\bwhey\b|واي\s*بروتين|بروتين/i, query: null, labelEn: 'Whey Protein Scoop', unitG: 30, scoopG: 30, unitLabel: 'scoop', tags: ['dairy'], fallbackPer100g: { energy: 380, protein: 80, carbs: 6, fat: 3, fiber: 1, sodium: 200 } },
  { re: /\bmilk\b|\bhalib\b|حليب|لبن/i, query: 'milk', labelEn: 'Milk', unitG: 200, unitLabel: 'cup', tags: ['dairy'] },
  { re: /greek\s*yogurt|زبادي\s*يوناني/i, query: 'yogurt', labelEn: 'Greek Yogurt', unitG: 150, unitLabel: 'cup', tags: ['dairy'] },
  { re: /yogurt|yoghurt|زبادي|روب/i, query: 'yogurt', labelEn: 'Plain Yogurt', unitG: 105, unitLabel: 'cup', tags: ['dairy'] },
  { re: /cottage\s*cheese|quraish|جبنة\s*قريش|قريش/i, query: 'cottage', labelEn: 'Cottage Cheese (Quraish)', unitG: 100, unitLabel: 'serving', tags: ['dairy'] },
  { re: /feta|cheese|جبنة|جبنه|جبن/i, query: 'cheese', labelEn: 'White Cheese', unitG: 40, unitLabel: 'serving', tags: ['dairy'] },
  { re: /\btuna\b|تونة|تونه/i, query: 'tuna', labelEn: 'Canned Tuna (Drained)', unitG: 140, unitLabel: 'can', tags: ['fish'] },
  { re: /salmon|سلمون/i, query: 'salmon', labelEn: 'Grilled Salmon', unitG: 150, unitLabel: 'fillet', tags: ['fish'] },
  { re: /fish|tilapia|سمك|بلطي|قاروص/i, query: 'fish', labelEn: 'Grilled Fish Fillet', unitG: 150, unitLabel: 'fillet', tags: ['fish'] },
  { re: /shrimp|prawns|جمبري|روبيان/i, query: 'shrimp', labelEn: 'Grilled Shrimp', unitG: 150, unitLabel: 'serving', tags: ['fish', 'shellfish'] },
  { re: /kofta|beef|steak|meat|كفتة|كفته|لحم|لحمة/i, query: 'beef', labelEn: 'Grilled Lean Beef / Kofta', unitG: 150, unitLabel: 'serving', tags: ['meat', 'red_meat'] },
  { re: /liver|كبدة|كبده/i, query: 'liver', labelEn: 'Beef / Chicken Liver', unitG: 120, unitLabel: 'serving', tags: ['offal'] },
  { re: /oats|oatmeal|شوفان/i, query: 'oats', labelEn: 'Rolled Oats', unitG: 50, spoonG: 10, unitLabel: 'serving', tags: ['oats'] },
  { re: /banana|موز/i, query: 'banana', labelEn: 'Banana', unitG: 118, unitLabel: 'medium', tags: [] },
  { re: /apple|تفاح/i, query: 'apple', labelEn: 'Apple', unitG: 180, unitLabel: 'medium', tags: [] },
  { re: /dates|تمر|بلح/i, query: 'dates', labelEn: 'Dates', unitG: 24, unitLabel: '3 dates', tags: [] },
  { re: /almonds|nuts|لوز|مكسرات/i, query: 'almonds', labelEn: 'Raw Almonds', unitG: 28, unitLabel: 'handful', tags: ['nuts'] },
  { re: /peanut\s*butter|زبدة\s*فول\s*سوداني/i, query: 'peanut', labelEn: 'Peanut Butter', unitG: 16, spoonG: 16, unitLabel: 'tbsp', tags: ['nuts'] },
  { re: /salad|سلطة|سلطه/i, query: 'salad', labelEn: 'Fresh Green Salad', unitG: 150, unitLabel: 'bowl', tags: [] },
  { re: /lentil|عدس/i, query: 'lentils', labelEn: 'Lentil Soup / Cooked Lentils', unitG: 200, unitLabel: 'bowl', tags: ['legumes'] },
  { re: /hummus|حمص/i, query: 'chickpeas', labelEn: 'Hummus / Chickpeas', unitG: 60, spoonG: 20, unitLabel: 'serving', tags: ['legumes'] }
];

function normalizeDigitsLocal(str) {
  return String(str || '').replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
}

function parseSegmentQuantity(seg, lex) {
  const s = normalizeDigitsLocal(seg);
  // Explicit grams or ml
  const gmMatch = s.match(/(\d+(?:\.\d+)?)\s*(g|gm|grams?|جم|جرام|مل|ml)\b/i);
  if (gmMatch) {
    const g = Math.max(5, Math.min(2000, Math.round(Number(gmMatch[1]))));
    return { grams: g, portionLabel: `${g} ${/ml|مل/i.test(gmMatch[2]) ? 'ml' : 'g'}`, exact: true };
  }
  // Fractions
  if (/\bhalf\b|نصف|نص\b/i.test(s)) {
    const g = Math.round(lex.unitG * 0.5);
    return { grams: g, portionLabel: `0.5 ${lex.unitLabel} (~${g} g)`, exact: false };
  }
  if (/\bquarter\b|ربع\b/i.test(s)) {
    const g = Math.round(lex.unitG * 0.25);
    return { grams: g, portionLabel: `0.25 ${lex.unitLabel} (~${g} g)`, exact: false };
  }
  // Spoons / tablespoons
  const spoonMatch = s.match(/(\d+(?:\.\d+)?)\s*(tbsp|tablespoons?|spoons?|معالق|ملاعق|معلقة|ملعقة)/i);
  if (spoonMatch) {
    const count = Math.max(0.5, Math.min(20, Number(spoonMatch[1])));
    const perSpoon = lex.spoonG || 15;
    const g = Math.round(count * perSpoon);
    return { grams: g, portionLabel: `${count} tbsp (~${g} g)`, exact: false };
  }
  // Scoops
  const scoopMatch = s.match(/(\d+(?:\.\d+)?)\s*(scoops?|سكوب)/i);
  if (scoopMatch) {
    const count = Math.max(0.5, Math.min(6, Number(scoopMatch[1])));
    const g = Math.round(count * (lex.scoopG || 30));
    return { grams: g, portionLabel: `${count} scoop(s) (${g} g)`, exact: true };
  }
  // Dual Arabic noun (بيضتين)
  if (/بيضتين|رغيفين|كوبين/i.test(s)) {
    const g = Math.round(lex.unitG * 2);
    return { grams: g, portionLabel: `2 ${lex.unitLabel}s (~${g} g)`, exact: false };
  }
  // Leading count
  const numMatch = s.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);
  if (numMatch) {
    const count = Math.max(0.25, Math.min(12, Number(numMatch[1])));
    const g = Math.round(count * lex.unitG);
    return { grams: g, portionLabel: `${count} ${lex.unitLabel}${count > 1 ? 's' : ''} (~${g} g)`, exact: false };
  }
  return { grams: lex.unitG, portionLabel: `1 ${lex.unitLabel} (~${lex.unitG} g)`, exact: false };
}

function groundFoodItem(lex, qty, rawSeg) {
  let matched = null;
  if (lex.query) {
    const direct = getFoodCatalogItem(lex.query);
    if (direct && direct.values?.energy != null) {
      matched = direct;
    } else {
      const searchRes = searchFoodCatalog({ q: lex.query, scope: 'all', includeEstimated: true, limit: 3 });
      matched = searchRes.items?.[0] || null;
    }
  }
  const per100 = matched?.values || lex.fallbackPer100g || { energy: 150, protein: 10, carbs: 15, fat: 5, fiber: 2, sodium: 180 };
  const scale = qty.grams / 100;
  const r1 = v => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * scale * 10) / 10);
  return {
    label: matched?.name_en || lex.labelEn,
    labelAr: matched?.name_ar || null,
    matchedFoodId: matched?.planningKey || matched?.id || null,
    source: matched ? 'ingredient' : 'manual',
    grams: qty.grams,
    portionLabel: qty.portionLabel,
    confidence: matched ? (qty.exact ? 0.96 : 0.89) : 0.78,
    isApproximate: !matched || Boolean(matched.isApproximate) || !qty.exact,
    provenanceBadge: matched && !matched.isApproximate ? 'catalog_match' : 'specialist_estimate',
    tags: lex.tags || [],
    nutrients: {
      energy: Math.round(Number(per100.energy || 0) * scale),
      protein: r1(per100.protein) ?? 0,
      carbs: r1(per100.carbs) ?? 0,
      fat: r1(per100.fat) ?? 0,
      fiber: r1(per100.fiber),
      sodium: per100.sodium != null ? Math.round(Number(per100.sodium) * scale) : null
    },
    _raw: rawSeg
  };
}

function crossCheckMealClinicalWarnings(items, s) {
  const warnings = [];
  const diseases = new Set(s?.profile?.diseases || []);
  const excluded = new Set((s?.preferences?.excludedGroups || []).map(x => String(x).toLowerCase()));
  const isPregnant = isPregnantStatus(s?.profile?.maternalStatus);

  for (const item of items) {
    const tags = new Set(item.tags || []);
    if ((diseases.has('celiac') || excluded.has('gluten')) && (tags.has('gluten') || tags.has('oats'))) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_CELIAC_GLUTEN_ALERT', severity: 'urgent', message: `${item.label} may contain gluten or shared-equipment oats cross-contact; confirm a certified gluten-free alternative before logging.` });
    }
    if ((diseases.has('favism') || excluded.has('fava')) && tags.has('fava')) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_FAVISM_ALERT', severity: 'urgent', message: `${item.label} contains fava beans, which must be avoided for favism safety.` });
    }
    if ((diseases.has('lactose_intolerance') || excluded.has('dairy')) && tags.has('dairy')) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_DAIRY_ALERT', severity: 'attention', message: `${item.label} contains dairy; verify it is lactose-free or swap before confirming.` });
    }
    if ((excluded.has('nuts') || excluded.has('nut_allergy')) && tags.has('nuts')) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_NUT_ALLERGY_ALERT', severity: 'urgent', message: `${item.label} contains nuts; avoid if you have a declared nut allergy.` });
    }
    if ((excluded.has('fish') || excluded.has('shellfish')) && (tags.has('fish') || tags.has('shellfish'))) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_SEAFOOD_ALERT', severity: 'urgent', message: `${item.label} contains fish or shellfish matching your declared exclusions.` });
    }
    if (diseases.has('gout') && (tags.has('offal') || tags.has('shellfish') || tags.has('red_meat'))) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_GOUT_PURINE_NOTE', severity: 'attention', message: `${item.label} is higher in purines; keep portions modest and stay well hydrated for gout support.` });
    }
    if (diseases.has('kidney') && ((item.nutrients.sodium || 0) > 450 || (item.nutrients.protein || 0) > 35)) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_KIDNEY_GUARDRAIL', severity: 'attention', message: `${item.label} is higher in sodium or protein; review portion size against your renal clinician guidance.` });
    }
    if (diseases.has('hypertension') && (item.nutrients.sodium || 0) > 600) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_SODIUM_NOTE', severity: 'attention', message: `${item.label} is relatively high in sodium; balance remaining meals today with lower-sodium choices.` });
    }
    if (isPregnant && tags.has('offal')) {
      warnings.push({ itemLabel: item.label, code: 'MEAL_CAPTURE_PREGNANCY_LIVER_CAUTION', severity: 'urgent', message: `${item.label} is high in preformed vitamin A; limit or avoid liver during pregnancy.` });
    }
  }
  return warnings;
}

function inferAllergenAndClinicalTags(catItem) {
  const tags = new Set();
  const key = String(catItem?.planningKey || catItem?.key || catItem?.id || '').toLowerCase();
  const hay = `${key} ${catItem?.name_en || ''} ${catItem?.name_ar || ''} ${catItem?.name || ''}`.toLowerCase();
  const cats = (catItem?.categories || []).map(c => String(c).toLowerCase()).join(' ');
  const combined = `${hay} ${cats}`;
  if (/\b(milk|yogurt|cheese|dairy|feta|cottage|mozzarella|cheddar|butter|ghee|cream|whey|labneh)\b|لبن|حليب|زبادي|جبن|جبنة|قريش|قشطة|زبدة|سمن|لبنة/i.test(combined)) tags.add('dairy');
  if (/\b(wheat|bread|toast|pasta|bulgur|couscous|gluten|freekeh|baladi|macaroni)\b|قمح|خبز|عيش|مكرونة|مكرونه|برغل|كسكسي|كسكس|فريك|جلوتين/i.test(combined)) tags.add('gluten');
  if (/\b(oats|oatmeal)\b|شوفان/i.test(combined)) tags.add('oats');
  if (/\b(fava|falafel|taameya|tameya)\b|فول\s*مدمس|\bفول\b|طعمية|طعميه|فلافل/i.test(combined) && !/فول\s*سوداني|peanut/i.test(combined)) {
    tags.add('fava');
    tags.add('legumes');
  }
  if (/\b(lentils?|chickpeas?|hummus|kidney\s*beans?|white\s*beans?|soy|soybeans?|lupin|peas)\b|عدس|حمص|فاصوليا|صويا|لوبيا|بسلة|بازلاء/i.test(combined)) tags.add('legumes');
  if (/\b(almonds?|walnuts?|cashews?|pistachios?|hazelnuts?|pecans?|peanuts?|nut|nuts)\b|مكسرات|لوز|عين\s*جمل|كاجو|فستق|بندق|فول\s*سوداني/i.test(combined)) tags.add('nuts');
  if (/\b(tahini|sesame)\b|طحينة|طحينه|سمسم/i.test(combined)) tags.add('sesame');
  if (/\b(shrimp|prawns?|crab|lobster|shellfish|calamari|squid)\b|جمبري|روبيان|كابوريا|استاكوزا|كاليماري/i.test(combined)) {
    tags.add('shellfish');
    tags.add('fish');
  }
  if (/\b(fish|tilapia|tuna|salmon|seabass|mackerel|sardine|cod)\b|سمك|بلطي|تونة|تونه|سلمون|قاروص|سردين|ماكريل/i.test(combined)) tags.add('fish');
  if (/\b(eggs?|eggwhite|omelet|omelette)\b|بيض|بيضة|اومليت/i.test(combined)) tags.add('eggs');
  if (/\b(chicken|turkey|poultry|duck)\b|فراخ|دجاج|ديك\s*رومي/i.test(combined)) tags.add('chicken');
  if (/\b(beef|lamb|mutton|veal|kofta|kebab|meat)\b|لحم|لحمة|لحمه|بقري|ضاني|كفتة|كفته|كباب/i.test(combined)) {
    tags.add('meat');
    tags.add('red_meat');
  }
  if (/\b(liver|offal|organ)\b|كبدة|كبده|كلاوي/i.test(combined)) tags.add('offal');
  return [...tags];
}

function parseFreeTextToGroundedItems(rawText) {
  const cleaned = normalizeDigitsLocal(String(rawText || '').trim());
  if (!cleaned || NON_FOOD_CUES_RE.test(cleaned)) return [];

  const segments = cleaned
    .split(/(?:,|\+|\n|;|\band\b|\bwith\b|\s+و\s+|\s+مع\s+)/i)
    .map(x => x.trim())
    .filter(Boolean);

  const items = [];
  const usedQueries = new Set();

  for (const seg of segments) {
    let matchedLex = null;
    for (const lex of DIALECT_FOOD_LEXICON) {
      if (lex.re.test(seg)) {
        matchedLex = lex;
        break;
      }
    }
    if (matchedLex) {
      const qty = parseSegmentQuantity(seg, matchedLex);
      const item = groundFoodItem(matchedLex, qty, seg);
      items.push(item);
      usedQueries.add(matchedLex.labelEn);
      continue;
    }
    // Direct catalog search fallback for any Arabic or English dish name
    const stripped = seg.replace(/\b\d+(?:\.\d+)?\s*(g|gm|ml|cups?|spoons?|tbsp|pieces?|slices?)?\b/gi, '').trim();
    if (stripped.length >= 2) {
      const sr = searchFoodCatalog({ q: stripped, scope: 'all', includeEstimated: true, limit: 1 });
      const top = sr.items?.[0];
      if (top && top.values?.energy != null && !usedQueries.has(top.id)) {
        const gMatch = seg.match(/(\d+(?:\.\d+)?)\s*(g|gm|ml|جم|مل)/i);
        const grams = gMatch ? Math.max(5, Math.min(2000, Math.round(Number(gMatch[1])))) : 120;
        const scale = grams / 100;
        items.push({
          label: top.name_en || top.name,
          labelAr: top.name_ar || null,
          matchedFoodId: top.planningKey || top.id,
          source: 'ingredient',
          grams,
          portionLabel: gMatch ? `${grams} g` : `1 serving (~${grams} g)`,
          confidence: gMatch ? 0.91 : 0.82,
          isApproximate: Boolean(top.isApproximate) || !gMatch,
          provenanceBadge: !top.isApproximate ? 'catalog_match' : 'specialist_estimate',
          tags: inferAllergenAndClinicalTags(top),
          nutrients: {
            energy: Math.round(Number(top.values.energy || 0) * scale),
            protein: Math.round(Number(top.values.protein || 0) * scale * 10) / 10,
            carbs: Math.round(Number(top.values.carbs || 0) * scale * 10) / 10,
            fat: Math.round(Number(top.values.fat || 0) * scale * 10) / 10,
            fiber: top.values.fiber != null ? Math.round(Number(top.values.fiber) * scale * 10) / 10 : null,
            sodium: top.values.sodium != null ? Math.round(Number(top.values.sodium) * scale) : null
          }
        });
        usedQueries.add(top.id);
      }
    }
  }
  return items;
}

export async function parseMealCapture(db, env, s, userId, request, bodyOrNull = null, now = clockNow()) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const monthKey = today.slice(0, 7);

  let payload = bodyOrNull;
  let hasImageBytes = false;
  let multipartBase64 = '';
  let multipartMimeType = '';
  const ct = request.headers.get('Content-Type') || '';
  if (!payload && /^multipart\/form-data/i.test(ct)) {
    const form = await request.formData();
    const file = form.get('image') || form.get('file');
    if (file && typeof file.arrayBuffer === 'function') {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (buf.byteLength > 2 * 1024 * 1024) {
        throw apiError('PHOTO_TOO_LARGE', 'Meal capture image exceeds the 2 MB limit.', { status: 413, params: { maxBytes: 2 * 1024 * 1024 } });
      }
      hasImageBytes = buf.byteLength >= 32;
      if (hasImageBytes) {
        multipartMimeType = detectImageMimeType(buf, file.type || '');
        multipartBase64 = bytesToBase64(buf);
      }
    }
    payload = {
      inputType: String(form.get('inputType') || 'photo'),
      text: String(form.get('text') || form.get('caption') || form.get('transcript') || ''),
      locale: String(form.get('locale') || s?.profile?.locale || 'en'),
      region: String(form.get('region') || s?.preferences?.region || 'egypt'),
      slot: String(form.get('slot') || 'lunch')
    };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw apiError('INVALID_REQUEST_BODY', 'Request body must be a JSON object or multipart image upload.', { status: 400 });
  }

  const inputType = ['text', 'voice', 'photo'].includes(String(payload.inputType || 'text').toLowerCase())
    ? String(payload.inputType || 'text').toLowerCase()
    : 'text';
  const textInput = String(payload.text || payload.transcript || payload.caption || '').trim();
  const rawJsonImage = typeof payload.imageBase64 === 'string' ? payload.imageBase64.trim() : '';
  const dataUriMatch = rawJsonImage.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,/i);
  const jsonMimeType = dataUriMatch
    ? (dataUriMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataUriMatch[1].toLowerCase())
    : (typeof payload.mimeType === 'string' ? detectImageMimeType(null, payload.mimeType) : 'image/jpeg');
  const cleanJsonBase64 = rawJsonImage.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
  const resolvedImageBase64 = multipartBase64 || cleanJsonBase64;
  const resolvedMimeType = multipartMimeType || jsonMimeType || 'image/jpeg';
  const hasPhotoPayload = hasImageBytes || cleanJsonBase64.length >= 64;

  // Validate food recognition BEFORE burning Free or Pro Fair-Use quota
  let groundedItems = parseFreeTextToGroundedItems(textInput);

  // Optional live Vision provider (Gemini 2.5 Flash) when configured & photo provided without text caption
  if (!groundedItems.length && inputType === 'photo' && hasPhotoPayload && resolvedImageBase64 && env?.GEMINI_API_KEY) {
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: 'Identify visible foods and approximate gram weights in this meal photo as a short comma-separated list (e.g. "150g grilled chicken, 150g white rice"). If no food is visible reply "no food".' },
                { inline_data: { mime_type: resolvedMimeType, data: resolvedImageBase64 } }
              ]
            }]
          })
        },
        8000
      );
      if (res.ok) {
        const gJson = await res.json();
        const candidateText = gJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        groundedItems = parseFreeTextToGroundedItems(candidateText);
      }
    } catch {}
  }

  if (!groundedItems.length) {
    throw apiError(
      'AI_FOOD_NOT_RECOGNIZED',
      'We could not spot food clearly from that input. Try better lighting, retake the photo, or type a brief description of your meal.',
      { status: 422, params: { inputType } }
    );
  }

  // Enforce Value-Peak Free Starter (3/month) & Pro Fair-Use Ceiling (15/day & 300/month)
  const access = await consumeFeatureAccess(
    db,
    s,
    userId,
    {
      feature: 'meal_capture_unlimited',
      quotaKey: 'meal_capture',
      today,
      freeWindowKey: monthKey,
      freeLimit: FREE_LIMITS.mealCaptureMonthlyLimit,
      proDailyLimit: PRO_FAIR_USE_LIMITS.meal_capture.daily,
      proMonthlyLimit: PRO_FAIR_USE_LIMITS.meal_capture.monthly,
      enforceEntitlements: env?.ENFORCE_PRO_ENTITLEMENTS === 'true'
    },
    env
  );

  const clinicalWarnings = crossCheckMealClinicalWarnings(groundedItems, s);
  const cleanItems = groundedItems.slice(0, 15).map(({ tags: _t, _raw, ...rest }) => rest);
  const totals = {
    energy: Math.round(cleanItems.reduce((sum, i) => sum + Number(i.nutrients.energy || 0), 0)),
    protein: Math.round(cleanItems.reduce((sum, i) => sum + Number(i.nutrients.protein || 0), 0) * 10) / 10,
    carbs: Math.round(cleanItems.reduce((sum, i) => sum + Number(i.nutrients.carbs || 0), 0) * 10) / 10,
    fat: Math.round(cleanItems.reduce((sum, i) => sum + Number(i.nutrients.fat || 0), 0) * 10) / 10
  };

  return {
    parseId: `mcp_${crypto.randomUUID()}`,
    inputType,
    transcript: textInput || cleanItems.map(i => `${i.label} (${i.grams} g)`).join(', '),
    requiresUserConfirmation: true,
    items: cleanItems,
    totals,
    clinicalWarnings,
    remainingFreePreviews: access.remainingFree,
    quota: {
      tier: access.tier,
      remainingFree: access.remainingFree,
      fairUseDailyRemaining: access.dailyRemaining,
      fairUseMonthlyRemaining: access.monthlyRemaining
    }
  };
}

// ---------------------------------------------------------------------------
// 2. KAN-84: 3-Specialist Interactive Care Room (Log-Grounded + Clinical Guardrails)
// ---------------------------------------------------------------------------

const SPECIALIST_PERSONAS = Object.freeze({
  nutrition_specialist: {
    role: 'nutrition_specialist',
    titleEn: 'CuraFit Nutrition Specialist'
  },
  training_captain: {
    role: 'training_captain',
    titleEn: 'CuraFit Training Captain'
  },
  followup_specialist: {
    role: 'followup_specialist',
    titleEn: 'CuraFit Follow-Up Specialist'
  }
});

const URGENT_SYMPTOM_RE = /\b(chest\s*pain|faint(ing|ed)?|severe\s*dizziness|shortness\s*of\s*breath|passing\s*out|heart\s*palpitations|blacking\s*out)\b|ألم\s*(في\s*)?(الصدر|بالصدر)|إغماء|دوخة\s*شديدة|ضيق\s*(في\s*)?التنفس/i;
const MEDICATION_DOSING_RE = /\b(insulin\s*dose|dose\s*of\s*insulin|metformin|ozempic|wegovy|mounjaro|thyroxine|levothyroxine|prescribe|medication\s*dos(e|age)|stop\s*my\s*medication|blood\s*pressure\s*pill)\b|جرعة\s*(الأنسولين|الإنسولين|الدواء|الانسولين)|دواء\s*للضغط|أوقف\s*الدواء/i;
const CRISIS_ED_RE = /\b(purg(e|ing)|make\s*myself\s*throw\s*up|laxative\s*abuse|starve\s*myself|water\s*fast\s*for\s*7\s*days|anorexia|bulimia)\b|أتقيأ|تجويع\s*نفسي|أجوع\s*نفسي/i;
const TRAINING_INTENT_RE = /\b(workout|exercise|squat|bench|deadlift|sets?|reps?|rir|pr\b|warm\s*up|split|knee|shoulder|back\s*pain|cardio|gym|dumbbells?|muscle|volume)\b|تمرين|تمارين|سكوات|بنش|عضلات|إحماء|ركبتي|كتفي|ظهري|جيم/i;
const NUTRITION_INTENT_RE = /\b(eat|meal|food|protein|carb|fat|calorie|kcal|restaurant|dining|dinner|lunch|breakfast|snack|ramadan|suhoor|iftar|fasting|keto|water|hydrat|recipe|grocery|allergy)\b|أكل|وجبة|سعرات|بروتين|مطعم|عشاء|غداء|فطار|رمضان|سحور|إفطار|صيام|كيتو|ماء|شرب|وصفة/i;
const EXTREME_CUT_RE = /\b(lower|cut|drop|reduce)\s*(my\s*)?calories\s*(by\s*)?([4-9]\d{2}|1\d{3})\b|أنزل\s*سعراتي\s*(500|600|700|800|1000)/i;

function routeSpecialistRole(message, requestedRole = null) {
  if (requestedRole && Object.hasOwn(SPECIALIST_PERSONAS, requestedRole)) {
    return SPECIALIST_PERSONAS[requestedRole];
  }
  if (TRAINING_INTENT_RE.test(message)) return SPECIALIST_PERSONAS.training_captain;
  if (NUTRITION_INTENT_RE.test(message)) return SPECIALIST_PERSONAS.nutrition_specialist;
  return SPECIALIST_PERSONAS.followup_specialist;
}

export async function consultSpecialistTeam(db, env, s, userId, body = {}, now = clockNow()) {
  const rawMessage = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!rawMessage) {
    throw apiError('INVALID_REQUEST_BODY', 'Consultation message is required.', { status: 400 });
  }
  if (rawMessage.length > 1000) {
    throw apiError('CHAT_MESSAGE_TOO_LONG', 'Consultation message must be at most 1000 characters.', { status: 400, params: { maxLength: 1000 } });
  }

  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const today = localDate(now, tz);
  const monthKey = today.slice(0, 7);
  const threadId = String(body?.threadId || 'default').trim().slice(0, 64) || 'default';
  const locale = normalizeLocale(String(body?.locale || s?.profile?.locale || 'en'), 'en') || 'en';

  // Enforce Value-Peak Free (5/month) & Pro Fair-Use Ceiling (40/day & 600/month)
  const access = await consumeFeatureAccess(
    db,
    s,
    userId,
    {
      feature: 'specialist_consultation_unlimited',
      quotaKey: 'specialist_consultation',
      today,
      freeWindowKey: monthKey,
      freeLimit: FREE_LIMITS.specialistConsultationMonthlyLimit,
      proDailyLimit: PRO_FAIR_USE_LIMITS.specialist_consultation.daily,
      proMonthlyLimit: PRO_FAIR_USE_LIMITS.specialist_consultation.monthly,
      enforceEntitlements: env?.ENFORCE_PRO_ENTITLEMENTS === 'true'
    },
    env
  );

  // Build read-only live grounding snapshot from D1 state
  const plan = activePlan(s);
  const diary = dayTotals(s, today);
  const targetKcal = diary.planEnergy ?? Number(plan?.targets?.energy || 2000);
  const consumedKcal = Number(diary.totals?.energy || 0);
  const remainingKcal = Math.max(0, Math.round(targetKcal - consumedKcal));
  const targetProtein = Number(plan?.targets?.protein || 120);
  const remainingProtein = Math.max(0, Math.round(targetProtein - Number(diary.totals?.protein || 0)));
  const ready = accountRecovery(s, now, tz);
  const cycleState = computeCycleState(s, now);
  const fastingState = getFastingState(s, now);
  const diseases = (s?.profile?.diseases || []).filter(d => d && d !== 'none');
  const excluded = s?.preferences?.excludedGroups || [];
  const injuries = canonicalInjuries(s?.onboarding?.workoutPrefs?.injuries || []);
  const floor = minSafeEnergyFloor(s?.profile);

  const citations = [`today_diary:${remainingKcal}_kcal_remaining`, `today_protein:${remainingProtein}g_remaining`];
  if (excluded.length) citations.push(`exclusions:${excluded.join(',')}`);
  if (diseases.length) citations.push(`conditions:${diseases.join(',')}`);
  if (injuries.length) citations.push(`injuries:${injuries.join(',')}`);
  if (ready.status && ready.status !== 'unknown') citations.push(`recovery:${ready.status}`);
  if (cycleState?.enabled && cycleState?.phase) citations.push(`cycle_phase:${cycleState.phase}`);
  if (fastingState?.mode && fastingState.mode !== 'off') citations.push(`fasting:${fastingState.mode}`);

  const specialist = routeSpecialistRole(rawMessage, body?.specialistRole || null);
  const explicitReqLocale = body?.locale != null ? normalizeLocale(String(body.locale), null) : null;
  const replyInArabic = /[\u0600-\u06FF]/.test(rawMessage) || explicitReqLocale === 'ar';
  let safetyNoticeTriggered = false;
  const safetyFlagCodes = [];
  const suggestedActions = [];
  let reply = '';

  // HARD CLINICAL GUARDRAILS (checked before any coaching advice or optional Gemini consultation call)
  let guardrailHandled = false;
  if (URGENT_SYMPTOM_RE.test(rawMessage)) {
    guardrailHandled = true;
    safetyNoticeTriggered = true;
    safetyFlagCodes.push('URGENT_MEDICAL_ESCALATION');
    reply = replyInArabic
      ? 'من فضلك أوقف أي مجهود بدني فورًا وتوجه لتقييم طبي عاجل لدى طبيب مختص عند الشعور بألم في الصدر أو إغماء أو دوخة شديدة أو ضيق في التنفس. فريق مختصي CuraFit لا يشخّص الأعراض الطبية الطارئة.'
      : 'Please stop all physical exertion immediately and seek prompt evaluation from a licensed physician or urgent medical care for symptoms such as chest pain, fainting, severe dizziness, or shortness of breath. Your CuraFit Specialist Team cannot diagnose urgent medical symptoms.';
    suggestedActions.push({ label: 'Log Recovery Check-In', route: 'coach/recovery_checkin' });
  } else if (MEDICATION_DOSING_RE.test(rawMessage)) {
    guardrailHandled = true;
    safetyNoticeTriggered = true;
    safetyFlagCodes.push('MEDICATION_BOUNDARY_REFUSAL');
    reply = replyInArabic
      ? 'فريق مختصي CuraFit لا يصف أو يعدّل جرعات الأدوية أو الأنسولين. يرجى التواصل مع طبيبك المعالج أو الصيدلي الإكلينيكي مباشرة قبل أي تعديل في مواعيد أو جرعات الدواء.'
      : 'Your CuraFit Specialist Team cannot recommend, adjust, or prescribe medication or insulin dosages. Please contact your treating physician or clinical pharmacist directly before changing any medication schedule.';
    suggestedActions.push({ label: 'Export Clinical Summary', route: 'account/clinical_summary' });
  } else if (CRISIS_ED_RE.test(rawMessage)) {
    guardrailHandled = true;
    safetyNoticeTriggered = true;
    safetyFlagCodes.push('EATING_DISORDER_CRISIS_SUPPORT');
    reply = replyInArabic
      ? 'سلامتك وصحتك أولًا دائمًا. CuraFit لا يدعم أبدًا التجويع أو القيء المتعمّد أو الأنظمة القاسية. يرجى التواصل مع طبيب مختص أو جهة دعم صحي موثوقة للحصول على رعاية طبية دافئة ومختصة.'
      : 'Your wellbeing comes first. CuraFit never supports extreme fasting, purging, or starvation practices. Please reach out to a qualified healthcare professional or local support helpline for compassionate medical care.';
  } else if (ready.status === 'stop' && (specialist.role === 'training_captain' || TRAINING_INTENT_RE.test(rawMessage))) {
    guardrailHandled = true;
    safetyNoticeTriggered = true;
    safetyFlagCodes.push('RED_FLAGS_STOP_ACTIVE');
    reply = replyInArabic
      ? 'آخر تسجيل تعافي لديك يظهر حالة إيقاف أمان نشطة. ينصحك كابتن التدريب بالراحة الكاملة من التمارين المجهدة حتى يقيّم طبيب مختص الأعراض ويؤكد أمان العودة للتمرين.'
      : 'Your latest recovery check-in shows an active safety stop. Your Training Captain advises complete rest from resistance or strenuous exercise until a licensed physician evaluates your symptoms and clears you to resume.';
    suggestedActions.push({ label: 'Review Safety Guidance', route: 'coach/recovery_checkin' });
  } else if (EXTREME_CUT_RE.test(rawMessage)) {
    guardrailHandled = true;
    reply = replyInArabic
      ? `أخصائي التغذية يحمي استمرارية نتائجك: نلتزم بالحد الأدنى الآمن للسعرات (${floor} سعرة/يوم) ونقترح تعديلات متوازنة لا تتجاوز 5% (بحد أقصى 150 سعرة) بعد 14 يومًا من التسجيل المنتظم ومتوسط الوزن الأسبوعي. يمكنك مراجعة أدلتك داخل صفحة مراجعة المختصين.`
      : `Your Nutrition Specialist protects sustainable progress: CuraFit enforces a safe clinical calorie floor (${floor} kcal/day) and only proposes bounded <= 5% (max 150 kcal) adjustments after 14 days of adherent logging and 7-day rolling weight trends. You can review your live evidence inside Coach Review without risking metabolic fatigue.`;
    suggestedActions.push({ label: 'Run Specialist Review', route: 'coach/review' });
  } else if ((isPregnantStatus(s?.profile?.maternalStatus) || s?.profile?.maternalStatus === 'breastfeeding') && /\b(keto|fast(ing)?|cut\s*calories|lose\s*weight)\b|كيتو|صيام|تنزيل\s*وزن/i.test(rawMessage)) {
    guardrailHandled = true;
    safetyNoticeTriggered = true;
    safetyFlagCodes.push('MATERNAL_SAFETY_BOUNDARY');
    reply = replyInArabic
      ? `خلال فترة ${s.profile.maternalStatus} يبقي أخصائي التغذية الصيام المتقطع والكيتو وخفض السعرات الحاد متوقفًا لحماية تغذيتك الآمنة (الحد الأدنى الآمن: ${floor} سعرة/يوم). يرجى استشارة طبيب النساء والتوليد قبل أي تغيير غذائي خاص.`
      : `During ${s.profile.maternalStatus}, your Nutrition Specialist keeps intermittent fasting, ketogenic dieting, and aggressive calorie cuts disabled to protect maternal nourishment (minimum safe floor: ${floor} kcal/day). Discuss any specialized diet changes with your obstetrician.`;
  } else if (specialist.role === 'nutrition_specialist') {
    const wantsDiningOut = /\b(restaurant|dining\s*out|eat(ing)?\s*out|tonight|dinner|lebanese|grill|shawarma)\b|مطعم|أكل\s*بره|عشاء/i.test(rawMessage);
    if (wantsDiningOut) {
      const dining = getDiningOutOptions(s, { date: today, category: 'grill', isPro: true, enforcePro: false });
      const topPick = dining.options?.[0];
      reply = replyInArabic
        ? (topPick
          ? `متبقي لك اليوم ${remainingKcal} سعرة و${remainingProtein} جم بروتين. مع احترام تفضيلاتك والقيود الصحية المسجّلة، يرشح لك أخصائي التغذية "${topPick.nameAr || topPick.nameEn}" (~${topPick.estimatedKcal} سعرة، ${topPick.proteinG} جم بروتين). اطلب الصوص جانبيًا وابدأ بالسلطة الخضراء.`
          : `متبقي لك اليوم ${remainingKcal} سعرة و${remainingProtein} جم بروتين. ركّز على البروتين المشوي الخفيف مع سلطة طازجة وصوص جانبي وحصة نشويات معتدلة.`)
        : (topPick
          ? `You have ${remainingKcal} kcal and ${remainingProtein} g protein remaining today. Respecting your active preferences and exclusions, your Nutrition Specialist recommends "${topPick.nameEn}" (~${topPick.estimatedKcal} kcal, ${topPick.proteinG} g protein). Tip: ${topPick.orderingTipsEn}`
          : `You have ${remainingKcal} kcal and ${remainingProtein} g protein remaining today. Focus on lean grilled protein, crisp salad with lemon-olive dressing on the side, and a measured complex carb portion.`);
      suggestedActions.push({ label: 'Open Dining-Out Concierge', route: 'nutrition/dining_out' });
      suggestedActions.push({ label: 'Log Manual Meal', route: 'quick_log/manual' });
    } else {
      reply = replyInArabic
        ? `بناءً على يومياتك اليوم، متبقي لك ${remainingKcal} سعرة و${remainingProtein} جم بروتين (من هدف ${Math.round(targetKcal)} سعرة و${Math.round(targetProtein)} جم بروتين). ينصحك أخصائي التغذية ببناء وجبتك القادمة حول بروتين خفيف وخضار غني بالألياف مع الالتزام الكامل بكل التفضيلات والضوابط الصحية.`
        : `Based on today's diary, you have ${remainingKcal} kcal and ${remainingProtein} g protein remaining (target: ${Math.round(targetKcal)} kcal, ${Math.round(targetProtein)} g protein). Your Nutrition Specialist recommends anchoring your next meal around lean protein and high-fiber vegetables while honoring all declared clinical and allergen preferences.`;
      suggestedActions.push({ label: 'Search Foods', route: 'nutrition/search' });
      suggestedActions.push({ label: 'Open Meal Swap', route: 'nutrition/swap' });
    }
  } else if (specialist.role === 'training_captain') {
    const injNote = injuries.length
      ? (replyInArabic ? ` تظل حماية المفاصل المسجّلة (${injuries.join('، ')}) مفعّلة بالكامل في جميع البدائل.` : ` Active joint protections (${injuries.join(', ')}) remain enforced across all exercise swaps.`)
      : '';
    reply = replyInArabic
      ? `راجع كابتن التدريب جاهزيتك الحالية (${ready.status}). ابدأ بإحماء تدريجي، وتوقف فورًا عند أي ألم مفصلي، مع التركيز على التحكم السليم في الأداء قبل زيادة الأوزان.${injNote}`
      : `Your Training Captain reviewed your current readiness (${ready.status}). Keep warm-up sets progressive, stop immediately if any joint pain arises, and prioritize clean control over rushing weight jumps.${injNote}`;
    suggestedActions.push({ label: 'View Workout Plan', route: 'workouts/plan' });
    suggestedActions.push({ label: 'Do Recovery Check-In', route: 'coach/recovery_checkin' });
  } else {
    const reviewReason = s?.lastReview?.nutrition?.reason || 'Your Follow-Up Specialist evaluates 7-day rolling weight averages across two full weeks alongside >= 10 adherent food days before adjusting calories.';
    const cycleNote = cycleState?.enabled && cycleState?.waterRetentionLikely
      ? (replyInArabic ? ' ملاحظة: فترة احتباس السوائل الطبيعية نشطة حاليًا، لذا يتم التعامل بهدوء مع تذبذب الميزان المؤقت.' : ' Note: late-luteal/menstrual fluid retention is currently active, so short-term scale jumps are safely buffered.')
      : '';
    reply = replyInArabic
      ? `يعتمد أخصائي المتابعة على متوسط الوزن لـ 7 أيام خلال أسبوعين مع التزام غذائي منتظم قبل اقتراح أي تعديل في السعرات.${cycleNote} استمر بهدوء في التسجيل اليومي وتواصل معنا في أي وقت.`
      : `${reviewReason}${cycleNote} Stay consistent with daily logging and reach out whenever your schedule changes.`;
    suggestedActions.push({ label: 'Open Coach Hub', route: 'coach/hub' });
    suggestedActions.push({ label: 'Do Recovery Check-In', route: 'coach/recovery_checkin' });
  }

  // Optional live Gemini 2.5 Flash grounded specialist reply (only AFTER hard clinical guardrails pass)
  if (!guardrailHandled && env?.GEMINI_API_KEY) {
    try {
      let recentThread = [];
      try {
        const histRes = await db.prepare(
          'SELECT role, content FROM coaching_ai_messages WHERE user_id=? AND thread_id=? ORDER BY created_at DESC LIMIT 6'
        ).bind(userId, threadId).all();
        recentThread = (histRes?.results || []).reverse().map(r => ({
          role: r.role === 'user' ? 'member' : 'specialist',
          content: String(r.content || '').slice(0, 350)
        }));
      } catch {}

      const groundingSnapshot = {
        specialistRole: specialist.role,
        specialistTitle: specialist.titleEn,
        replyLanguage: replyInArabic ? 'Arabic' : 'English',
        remainingKcal,
        targetKcal: Math.round(targetKcal),
        remainingProtein,
        targetProtein: Math.round(targetProtein),
        safeCalorieFloorKcal: floor,
        diseases,
        excludedGroups: excluded,
        injuries,
        maternalStatus: s?.profile?.maternalStatus || 'none',
        seniorMode: Boolean(s?.profile?.seniorMode || Number(s?.profile?.age) >= 70),
        recovery: {
          status: ready.status,
          sleepHours: ready.latestCheckin?.sleepHours ?? null,
          fatigue: ready.latestCheckin?.fatigue ?? null
        },
        cycle: cycleState?.enabled ? { phase: cycleState.phase, waterRetentionLikely: Boolean(cycleState.waterRetentionLikely) } : null,
        fasting: fastingState?.mode && fastingState.mode !== 'off'
          ? { mode: fastingState.mode, phase: fastingState.phase, ramadanActive: Boolean(fastingState.ramadanMode?.enabled) }
          : null,
        recentThread
      };

      const promptText = [
        `You are the ${specialist.titleEn} on the CuraFit Specialist Team.`,
        `Reply strictly in ${replyInArabic ? 'clear, warm Arabic' : 'clear, warm English'} in 2 to 4 concise practical sentences.`,
        'Ground your response exclusively in the provided D1 member snapshot and thread context.',
        'Hard safety rules: NEVER mention AI, Smart, Automated, Algorithm, Engine, Bot, or LLM; NEVER recommend or adjust medications or insulin doses; NEVER advise calories below safeCalorieFloorKcal; NEVER ignore declared diseases, allergies, exclusions, injuries, maternal status, fasting phase, or recovery status.',
        `Member D1 Grounding Snapshot (JSON): ${JSON.stringify(groundingSnapshot)}`,
        `Member message: ${rawMessage}`
      ].join('\n');

      const gRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.35, maxOutputTokens: 320 }
          })
        },
        8000
      );
      if (gRes.ok) {
        const gJson = await gRes.json();
        const candidate = String(gJson?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        const cleaned = sanitizeSpecialistCopy(candidate).slice(0, 1200);
        if (cleaned.length >= 20 && !FORBIDDEN_VOICE_RE.test(cleaned) && !MEDICATION_DOSING_RE.test(cleaned)) {
          reply = cleaned;
        }
      }
    } catch {}
  }

  // Final brand-voice safety pass — guaranteed zero AI/bot/automated/engine wording
  reply = sanitizeSpecialistCopy(reply);
  if (FORBIDDEN_VOICE_RE.test(reply)) {
    reply = 'Your CuraFit Specialist Team reviewed your current plan and logs. Keep following your personalized nutrition, hydration, and recovery milestones safely.';
  }

  const nowIso = isoNow();
  const userMsgId = `msg_${crypto.randomUUID()}`;
  const replyMsgId = `msg_${crypto.randomUUID()}`;
  const replyMeta = {
    specialistRole: specialist.role,
    specialistTitle: specialist.titleEn,
    citations,
    suggestedActions,
    safetyNoticeTriggered,
    safetyFlagCodes,
    locale
  };

  try {
    await db.batch([
      db.prepare(
        'INSERT INTO coaching_ai_messages(user_id,thread_id,message_id,role,content,meta_json,created_at) VALUES(?,?,?,?,?,?,?)'
      ).bind(userId, threadId, userMsgId, 'user', rawMessage, JSON.stringify({ locale, requestedRole: body?.specialistRole || null }), nowIso),
      db.prepare(
        'INSERT INTO coaching_ai_messages(user_id,thread_id,message_id,role,content,meta_json,created_at) VALUES(?,?,?,?,?,?,?)'
      ).bind(userId, threadId, replyMsgId, 'specialist', reply, JSON.stringify(replyMeta), new Date(Date.parse(nowIso) + 1).toISOString())
    ]);
  } catch (e) {
    if (!/no such table/i.test(e?.message || '')) throw e;
  }

  return {
    messageId: replyMsgId,
    threadId,
    specialistRole: specialist.role,
    specialistTitle: specialist.titleEn,
    reply,
    citations,
    suggestedActions,
    safetyNoticeTriggered,
    safetyFlagCodes,
    remainingFreeMessages: access.remainingFree,
    quota: {
      tier: access.tier,
      remainingFree: access.remainingFree,
      fairUseDailyRemaining: access.dailyRemaining,
      fairUseMonthlyRemaining: access.monthlyRemaining
    },
    createdAt: nowIso
  };
}

export async function listConsultationHistory(db, userId, { threadId = 'default', limit = 50, before = null } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const safeThread = String(threadId || 'default').trim().slice(0, 64) || 'default';
  try {
    let rows = [];
    if (before) {
      const pivot = await db.prepare(
        'SELECT created_at FROM coaching_ai_messages WHERE user_id=? AND thread_id=? AND message_id=?'
      ).bind(userId, safeThread, before).first();
      if (pivot?.created_at) {
        const res = await db.prepare(
          'SELECT message_id, thread_id, role, content, meta_json, created_at FROM coaching_ai_messages WHERE user_id=? AND thread_id=? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
        ).bind(userId, safeThread, pivot.created_at, safeLimit).all();
        rows = (res?.results || []).reverse();
      }
    } else {
      const res = await db.prepare(
        'SELECT message_id, thread_id, role, content, meta_json, created_at FROM coaching_ai_messages WHERE user_id=? AND thread_id=? ORDER BY created_at DESC LIMIT ?'
      ).bind(userId, safeThread, safeLimit).all();
      rows = (res?.results || []).reverse();
    }
    return {
      threadId: safeThread,
      items: rows.map(r => {
        let meta = {};
        try { meta = r.meta_json ? JSON.parse(r.meta_json) : {}; } catch {}
        return {
          messageId: r.message_id,
          threadId: r.thread_id,
          role: r.role,
          specialistRole: meta.specialistRole || null,
          specialistTitle: meta.specialistTitle || null,
          content: r.content,
          citations: meta.citations || [],
          suggestedActions: meta.suggestedActions || [],
          safetyNoticeTriggered: Boolean(meta.safetyNoticeTriggered),
          safetyFlagCodes: meta.safetyFlagCodes || [],
          createdAt: r.created_at
        };
      })
    };
  } catch (e) {
    if (/no such table/i.test(e?.message || '')) return { threadId: safeThread, items: [] };
    throw e;
  }
}
