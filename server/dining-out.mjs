// KAN-119 (US-NUT-13): Dining-Out Concierge, Post-Feast Zero-Guilt Rebalance & flex_event Tagging
// Leaf-level acyclic module — imports only clock, food, shared helpers, clinical constants, and apiError.
import { clockNow, isoNow, clockTimeZone } from './clock.mjs';
import { activePlan, dayTotals, plannedEnergyForDate } from './food.mjs';
import {
  localDate,
  dateOffset,
  validDate,
  dateForLog as validateLogDate,
  number,
  isPregnantStatus,
  minSafeEnergyFloor
} from '../coaching-shared.mjs';
import { CLINICAL_CONSTANTS } from '../clinical-constants.mjs';
import { apiError } from '../coaching-error.mjs';

export const DINING_OUT_CATEGORIES = Object.freeze([
  'grill',
  'shawarma',
  'cafe',
  'pizza',
  'seafood',
  'family_feast'
]);
const CATEGORY_SET = new Set(DINING_OUT_CATEGORIES);

// Curated MENA & global restaurant catalog with clinical/allergen tags and practical ordering guidance
export const DINING_OUT_DISHES = Object.freeze([
  // GRILL
  {
    id: 'grill_shish_tawook_plate',
    category: 'grill',
    nameEn: 'Grilled Shish Tawook Plate with Roasted Vegetables & Half Baladi Bread',
    nameAr: 'طبق شيش طاووق مشوي مع خضار مشوي ونصف رغيف بلدي',
    estimatedKcal: 480,
    proteinG: 44,
    carbsG: 36,
    fatG: 14,
    sodiumMg: 540,
    satFatG: 3.0,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['chicken', 'gluten'],
    orderingTipCode: 'DINING_TIP_SAUCE_ON_SIDE',
    orderingTipsEn: 'Ask for garlic sauce on the side, skip butter brush on pita, and keep grilled tomato and pepper skewers.'
  },
  {
    id: 'grill_chicken_breast_salad',
    category: 'grill',
    nameEn: 'Charcoal-Grilled Half Chicken Breast with Fattoush (Light Dressing)',
    nameAr: 'نصف صدر فراخ مشوي على الفحم مع سلطة فتوش بدون خبز مقلي',
    estimatedKcal: 420,
    proteinG: 46,
    carbsG: 20,
    fatG: 16,
    sodiumMg: 460,
    satFatG: 3.4,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['chicken'],
    orderingTipCode: 'DINING_TIP_SKIP_SKIN_AND_FRIES',
    orderingTipsEn: 'Request skin removed before serving, lemon-olive dressing on the side, and skip fried pita chips.'
  },
  {
    id: 'grill_lean_kofta_salad',
    category: 'grill',
    nameEn: 'Grilled Lean Beef Kofta (2 Skewers) with Parsley Salad & Tahini Spoon',
    nameAr: 'سيخين كفتة لحم مشوي مع سلطة بقدونس ومعلقة طحينة',
    estimatedKcal: 530,
    proteinG: 38,
    carbsG: 18,
    fatG: 32,
    sodiumMg: 620,
    satFatG: 9.5,
    purineHigh: true,
    glycemicLoad: 'low',
    tags: ['meat', 'red_meat', 'sesame'],
    orderingTipCode: 'DINING_TIP_PORTION_TAHINI',
    orderingTipsEn: 'Limit tahini to 1 tablespoon, pair with fresh parsley-onion salad, and choose half a loaf or skip fries.'
  },
  {
    id: 'grill_halloumi_veg_skewers',
    category: 'grill',
    nameEn: 'Grilled Halloumi & Seasonal Vegetable Skewers with Quinoa Tabbouleh',
    nameAr: 'أسياخ حلوم وخضار مشوي مع تبولة كينوا',
    estimatedKcal: 460,
    proteinG: 24,
    carbsG: 34,
    fatG: 24,
    sodiumMg: 780,
    satFatG: 11.0,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['dairy', 'vegetarian'],
    orderingTipCode: 'DINING_TIP_LIGHT_OIL_GRILL',
    orderingTipsEn: 'Ask for light olive oil brushing and extra fresh lemon with herbs to keep sodium balanced.'
  },
  {
    id: 'grill_falafel_baked_bowl',
    category: 'grill',
    nameEn: 'Grilled Vegetable & Chickpea Salad Bowl with Lemon-Herb Dressing',
    nameAr: 'طبق خضار مشوي وحمص مسلوق بتتبيلة الليمون والأعشاب',
    estimatedKcal: 390,
    proteinG: 16,
    carbsG: 52,
    fatG: 12,
    sodiumMg: 410,
    satFatG: 1.8,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['legumes', 'vegan', 'vegetarian'],
    orderingTipCode: 'DINING_TIP_PLANT_PROTEIN_BALANCE',
    orderingTipsEn: 'Request steamed or grilled chickpeas with olive oil and lemon on the side for clean plant protein.'
  },

  // SHAWARMA
  {
    id: 'shawarma_chicken_open_plate',
    category: 'shawarma',
    nameEn: 'Open Chicken Shawarma Plate (No Toum) with Pickled Veg & Half Saj Bread',
    nameAr: 'طبق شاورما فراخ مفتوح بدون ثومية مع خضار ونصف خبز صاج',
    estimatedKcal: 510,
    proteinG: 42,
    carbsG: 38,
    fatG: 19,
    sodiumMg: 690,
    satFatG: 4.2,
    purineHigh: false,
    glycemicLoad: 'moderate',
    tags: ['chicken', 'gluten'],
    orderingTipCode: 'DINING_TIP_OPEN_PLATE_SHAWARMA',
    orderingTipsEn: 'Order as an open plate instead of a double-wrapped sandwich, swap garlic mayo for 1 spoon yogurt-mint dip.'
  },
  {
    id: 'shawarma_chicken_salad_bowl',
    category: 'shawarma',
    nameEn: 'Low-Carb Chicken Shawarma Salad Bowl with Cucumber, Tomato & Lemon',
    nameAr: 'سلطة شاورما فراخ بالخضار الطازج والليمون بدون خبز',
    estimatedKcal: 395,
    proteinG: 40,
    carbsG: 14,
    fatG: 19,
    sodiumMg: 610,
    satFatG: 4.0,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['chicken'],
    orderingTipCode: 'DINING_TIP_SWAP_BREAD_FOR_GREENS',
    orderingTipsEn: 'Ask for grilled shawarma slices over crisp lettuce, tomato, and sumac onions with dressing on the side.'
  },
  {
    id: 'shawarma_beef_lean_wrap',
    category: 'shawarma',
    nameEn: 'Single Lean Beef Shawarma in Thin Saj with Parsley & Light Tahini',
    nameAr: 'ساندوتش شاورما لحم خفيف في خبز صاج مع بقدونس وطحينة خفيفة',
    estimatedKcal: 520,
    proteinG: 34,
    carbsG: 42,
    fatG: 22,
    sodiumMg: 740,
    satFatG: 7.5,
    purineHigh: true,
    glycemicLoad: 'moderate',
    tags: ['meat', 'red_meat', 'gluten', 'sesame'],
    orderingTipCode: 'DINING_TIP_NO_FRIES_INSIDE',
    orderingTipsEn: 'Ask for no fries inside the wrap, light tahini only, and add extra parsley and tomato.'
  },
  {
    id: 'shawarma_grilled_mushroom_bowl',
    category: 'shawarma',
    nameEn: 'Spiced Grilled Mushroom & Chickpea Shawarma Bowl (Plant-Based)',
    nameAr: 'طبق شاورما مشروم متبل وحمص مشوي نباتي',
    estimatedKcal: 410,
    proteinG: 17,
    carbsG: 50,
    fatG: 15,
    sodiumMg: 480,
    satFatG: 2.1,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['legumes', 'vegan', 'vegetarian'],
    orderingTipCode: 'DINING_TIP_SPICED_PLANT_BOWL',
    orderingTipsEn: 'Enjoy shawarma spices on roasted mushrooms and chickpeas with lemon and herbs instead of heavy mayo.'
  },

  // CAFE
  {
    id: 'cafe_grilled_chicken_ciabatta',
    category: 'cafe',
    nameEn: 'Grilled Chicken & Pesto Whole-Grain Ciabatta (Open-Faced)',
    nameAr: 'ساندوتش شيباتا حبوب كاملة بالدجاج المشوي وصوص خفيف',
    estimatedKcal: 450,
    proteinG: 34,
    carbsG: 44,
    fatG: 14,
    sodiumMg: 590,
    satFatG: 2.8,
    purineHigh: false,
    glycemicLoad: 'moderate',
    tags: ['chicken', 'gluten'],
    orderingTipCode: 'DINING_TIP_OPEN_FACED_SANDWICH',
    orderingTipsEn: 'Ask for light sauce or mustard instead of creamy mayo and pair with black coffee or unsweetened tea.'
  },
  {
    id: 'cafe_greek_yogurt_berry_bowl',
    category: 'cafe',
    nameEn: 'Greek Yogurt Parfait with Fresh Berries, Cinnamon & Chia (No Syrup)',
    nameAr: 'وعاء زبادي يوناني مع توت طازج وقرفة وبذور شيا بدون شراب سكر',
    estimatedKcal: 310,
    proteinG: 22,
    carbsG: 32,
    fatG: 9,
    sodiumMg: 120,
    satFatG: 2.6,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['dairy', 'vegetarian'],
    orderingTipCode: 'DINING_TIP_SKIP_SYRUPS',
    orderingTipsEn: 'Request plain unsweetened Greek yogurt with fresh fruit and cinnamon rather than flavored syrups.'
  },
  {
    id: 'cafe_egg_white_avocado_toast',
    category: 'cafe',
    nameEn: 'Poached Eggs & Smashed Avocado on Whole-Grain Toast',
    nameAr: 'بيض مسلوق مع أفوكادو مهروس على شريحة توست قمح كامل',
    estimatedKcal: 380,
    proteinG: 21,
    carbsG: 30,
    fatG: 19,
    sodiumMg: 390,
    satFatG: 4.0,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['eggs', 'gluten', 'vegetarian'],
    orderingTipCode: 'DINING_TIP_POACHED_NO_BUTTER',
    orderingTipsEn: 'Choose poached or boiled eggs with lemon and cracked pepper instead of butter-fried eggs.'
  },
  {
    id: 'cafe_smoked_turkey_salad',
    category: 'cafe',
    nameEn: 'Roasted Turkey & Quinoa Cafe Salad with Balsamic Vinegar',
    nameAr: 'سلطة ديك رومي مشوي وكينوا بخل البلسمك',
    estimatedKcal: 360,
    proteinG: 32,
    carbsG: 30,
    fatG: 11,
    sodiumMg: 540,
    satFatG: 1.9,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['chicken'],
    orderingTipCode: 'DINING_TIP_PAIR_WITH_WATER',
    orderingTipsEn: 'Keep balsamic dressing on the side and drink a full glass of water alongside coffee or espresso.'
  },
  {
    id: 'cafe_hummus_crudites_oat_latte',
    category: 'cafe',
    nameEn: 'Roasted Vegetable & Hummus Platter with Unsweetened Almond Latte',
    nameAr: 'طبق حمص مع خضار طازج ولاتيه لوز غير محلى',
    estimatedKcal: 340,
    proteinG: 13,
    carbsG: 38,
    fatG: 15,
    sodiumMg: 420,
    satFatG: 1.9,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['legumes', 'vegan', 'vegetarian', 'nuts'],
    orderingTipCode: 'DINING_TIP_UNSWEETENED_MILK_SWAP',
    orderingTipsEn: 'Choose unsweetened oat or almond milk and skip flavored coffee syrups.'
  },

  // PIZZA
  {
    id: 'pizza_thin_grilled_chicken_2slices',
    category: 'pizza',
    nameEn: 'Thin-Crust Grilled Chicken & Veggie Pizza (2 Slices) + Side Green Salad',
    nameAr: 'شريحتان بيتزا عجينة رفيعة بالدجاج المشوي والخضار مع سلطة خضراء',
    estimatedKcal: 520,
    proteinG: 32,
    carbsG: 54,
    fatG: 18,
    sodiumMg: 780,
    satFatG: 6.0,
    purineHigh: false,
    glycemicLoad: 'moderate',
    tags: ['chicken', 'dairy', 'gluten'],
    orderingTipCode: 'DINING_TIP_THIN_CRUST_SALAD_FIRST',
    orderingTipsEn: 'Choose thin crust, ask for light mozzarella, start with a fresh green salad first, and skip creamy dipping cups.'
  },
  {
    id: 'pizza_thin_margherita_2slices',
    category: 'pizza',
    nameEn: 'Neapolitan Thin-Crust Margherita (2 Slices) with Arugula',
    nameAr: 'شريحتان بيتزا مارجريتا رفيعة مع جرجير طازج',
    estimatedKcal: 460,
    proteinG: 20,
    carbsG: 56,
    fatG: 16,
    sodiumMg: 690,
    satFatG: 6.2,
    purineHigh: false,
    glycemicLoad: 'moderate',
    tags: ['dairy', 'gluten', 'vegetarian'],
    orderingTipCode: 'DINING_TIP_LIGHT_CHEESE_ARUGULA',
    orderingTipsEn: 'Request fresh arugula on top and light mozzarella to enjoy classic flavor within your daily calories.'
  },
  {
    id: 'pizza_veggie_marinara_no_cheese',
    category: 'pizza',
    nameEn: 'Wood-Fired Marinara & Roasted Veggie Flatbread (No Cheese, 2 Slices)',
    nameAr: 'بيتزا مارينارا بالخضار المشوي بدون جبن (شريحتان)',
    estimatedKcal: 390,
    proteinG: 12,
    carbsG: 62,
    fatG: 10,
    sodiumMg: 540,
    satFatG: 1.5,
    purineHigh: false,
    glycemicLoad: 'moderate',
    tags: ['gluten', 'vegan', 'vegetarian'],
    orderingTipCode: 'DINING_TIP_MARINARA_HERBS',
    orderingTipsEn: 'Order wood-fired tomato marinara with roasted mushrooms, peppers, and fresh basil.'
  },
  {
    id: 'pizza_gluten_free_chicken_bowl',
    category: 'pizza',
    nameEn: 'Italian Grilled Chicken Caprese Salad (Zero Crust, Extra Herbs)',
    nameAr: 'سلطة كابريزي إيطالية مع دجاج مشوي وأعشاب بدون عجين',
    estimatedKcal: 410,
    proteinG: 38,
    carbsG: 16,
    fatG: 21,
    sodiumMg: 510,
    satFatG: 5.5,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['chicken', 'dairy'],
    orderingTipCode: 'DINING_TIP_ITALIAN_PROTEIN_SALAD',
    orderingTipsEn: 'Ask for balsamic vinegar and olive oil on the side to control dressing calories easily.'
  },

  // SEAFOOD
  {
    id: 'seafood_grilled_seabass_sayadeya',
    category: 'seafood',
    nameEn: 'Grilled Sea Bass (Oil & Lemon) with 5 Spoons Sayadeya Rice & Green Salad',
    nameAr: 'سمك قاروص مشوي زيت وليمون مع 5 معالق أرز صيادية وسلطة خضراء',
    estimatedKcal: 490,
    proteinG: 42,
    carbsG: 42,
    fatG: 15,
    sodiumMg: 480,
    satFatG: 2.6,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['fish'],
    orderingTipCode: 'DINING_TIP_OIL_AND_LEMON_GRILL',
    orderingTipsEn: 'Choose oil-and-lemon or bran-grilled fish (singary/mashwi) over fried fillets and keep rice to a modest side portion.'
  },
  {
    id: 'seafood_grilled_shrimp_salad',
    category: 'seafood',
    nameEn: 'Charcoal-Grilled Shrimp Skewers with Fresh Lemon & Fattoush Salad',
    nameAr: 'جمبري مشوي على الفحم مع ليمون وسلطة خضراء',
    estimatedKcal: 360,
    proteinG: 38,
    carbsG: 18,
    fatG: 14,
    sodiumMg: 560,
    satFatG: 2.1,
    purineHigh: true,
    glycemicLoad: 'low',
    tags: ['fish', 'shellfish'],
    orderingTipCode: 'DINING_TIP_GRILLED_NOT_BUTTERFLY',
    orderingTipsEn: 'Request grilled shrimp with lemon and cumin instead of fried or creamy butter-sauce preparations.'
  },
  {
    id: 'seafood_baked_tilapia_herbs',
    category: 'seafood',
    nameEn: 'Bran-Grilled Tilapia (Bolti Mashwi) with Tomato-Coriander Salad',
    nameAr: 'سمك بلطي مشوي بالردة مع سلطة طماطم وكزبرة',
    estimatedKcal: 380,
    proteinG: 44,
    carbsG: 18,
    fatG: 12,
    sodiumMg: 420,
    satFatG: 2.2,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['fish'],
    orderingTipCode: 'DINING_TIP_BRAN_GRILLED_FISH',
    orderingTipsEn: 'Bran-grilled tilapia delivers very high lean protein with minimal added cooking oil.'
  },
  {
    id: 'seafood_grilled_salmon_veg',
    category: 'seafood',
    nameEn: 'Grilled Salmon Fillet with Steamed Broccoli & Lemon Herb Quinoa',
    nameAr: 'فيليه سلمون مشوي مع بروكلي على البخار وكينوا بالليمون',
    estimatedKcal: 540,
    proteinG: 39,
    carbsG: 32,
    fatG: 27,
    sodiumMg: 390,
    satFatG: 5.2,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['fish'],
    orderingTipCode: 'DINING_TIP_OMEGA3_SALMON',
    orderingTipsEn: 'Ask for grilled salmon without heavy cream sauce so you keep rich omega-3 fats clean.'
  },

  // FAMILY FEAST
  {
    id: 'feast_molokhia_grilled_chicken',
    category: 'family_feast',
    nameEn: 'Quarter Roasted Chicken Breast with Molokhia & 5 Spoons Egyptian Rice',
    nameAr: 'ربع صدر فراخ مشوية بالفرن مع طبق ملوخية و5 معالق أرز مصري',
    estimatedKcal: 510,
    proteinG: 42,
    carbsG: 48,
    fatG: 15,
    sodiumMg: 560,
    satFatG: 3.2,
    purineHigh: false,
    glycemicLoad: 'moderate',
    tags: ['chicken'],
    orderingTipCode: 'DINING_TIP_ONE_PLATE_METHOD',
    orderingTipsEn: 'Build one balanced plate: half vegetables/molokhia, one-quarter lean chicken breast, and 5 spoons of rice.'
  },
  {
    id: 'feast_mahshi_light_yogurt',
    category: 'family_feast',
    nameEn: 'Stuffed Vine Leaves / Zucchini (6 Pieces) with Lean Chicken & Plain Yogurt',
    nameAr: '6 أصابع محشي ورق عنب أو كوسة مع صدر دجاج وكوب زبادي',
    estimatedKcal: 495,
    proteinG: 36,
    carbsG: 52,
    fatG: 15,
    sodiumMg: 590,
    satFatG: 3.8,
    purineHigh: false,
    glycemicLoad: 'moderate',
    tags: ['chicken', 'dairy'],
    orderingTipCode: 'DINING_TIP_ANCHOR_PROTEIN_FIRST',
    orderingTipsEn: 'Eat your lean protein and green salad first so 5-6 pieces of mahshi feel deeply satisfying without overeating.'
  },
  {
    id: 'feast_kabsa_chicken_balanced',
    category: 'family_feast',
    nameEn: 'Balanced Chicken Kabsa Plate (Skinless Breast + 1 Cup Basmati + Daqoos)',
    nameAr: 'طبق كبسة دجاج متوازن (صدر بدون جلد + كوب أرز بسمتي + دقوس)',
    estimatedKcal: 560,
    proteinG: 41,
    carbsG: 58,
    fatG: 16,
    sodiumMg: 620,
    satFatG: 3.4,
    purineHigh: false,
    glycemicLoad: 'moderate',
    tags: ['chicken'],
    orderingTipCode: 'DINING_TIP_KABSA_PORTION_CUE',
    orderingTipsEn: 'Keep basmati rice to 1 measured cup (~150g cooked), choose breast meat, and add fresh tomato daqoos and cucumber salad.'
  },
  {
    id: 'feast_grilled_eggplant_lentil_plate',
    category: 'family_feast',
    nameEn: 'Roasted Eggplant Moussaka (Light Oil) with Lentil Soup & Green Salad',
    nameAr: 'مسقعة باذنجان مشوي بزيت خفيف مع شوربة عدس وسلطة خضراء',
    estimatedKcal: 440,
    proteinG: 19,
    carbsG: 58,
    fatG: 14,
    sodiumMg: 480,
    satFatG: 2.0,
    purineHigh: false,
    glycemicLoad: 'low',
    tags: ['legumes', 'vegan', 'vegetarian'],
    orderingTipCode: 'DINING_TIP_PLANT_FEAST_PLATE',
    orderingTipsEn: 'Choose baked or grilled vegetable trays over deep-fried options and pair with lentil soup for steady satiety.'
  }
]);

const DISH_BY_ID = new Map(DINING_OUT_DISHES.map(d => [d.id, d]));

function dishAllowedForUser(dish, s) {
  const diet = String(s?.preferences?.diet || 'balanced').toLowerCase();
  const diseases = new Set(s?.profile?.diseases || []);
  const excluded = new Set((s?.preferences?.excludedGroups || []).map(x => String(x).toLowerCase()));
  const tags = new Set(dish.tags || []);

  if (diet === 'vegan' && !tags.has('vegan')) return false;
  if (diet === 'vegetarian' && !tags.has('vegetarian') && !tags.has('vegan')) return false;
  if (diet === 'keto' && dish.carbsG > 22) return false;
  if (diet === 'low_carb' && dish.carbsG > 38) return false;

  if ((excluded.has('gluten') || diseases.has('celiac')) && tags.has('gluten')) return false;
  if ((excluded.has('dairy') || excluded.has('milk') || excluded.has('cheese') || diseases.has('lactose_intolerance')) && tags.has('dairy')) return false;
  if ((excluded.has('nuts') || excluded.has('nut_allergy') || excluded.has('peanuts')) && tags.has('nuts')) return false;
  if ((excluded.has('fish') || excluded.has('seafood')) && tags.has('fish')) return false;
  if (excluded.has('shellfish') && tags.has('shellfish')) return false;
  if ((excluded.has('meat') || excluded.has('red_meat')) && (tags.has('meat') || tags.has('red_meat'))) return false;
  if (excluded.has('chicken') && tags.has('chicken')) return false;
  if (excluded.has('eggs') && tags.has('eggs')) return false;
  if ((excluded.has('fava') || diseases.has('favism')) && tags.has('fava')) return false;
  if (excluded.has('sesame') && tags.has('sesame')) return false;

  // Clinical guardrails
  if (diseases.has('gout') && dish.purineHigh) return false;
  if (diseases.has('kidney') && (dish.sodiumMg > 650 || dish.proteinG > 42)) return false;
  if ((diseases.has('hypertension') || diet === 'dash') && dish.sodiumMg > 720) return false;
  if (diseases.has('cholesterol') && dish.satFatG > 6.5) return false;
  if ((diseases.has('diabetes') || diseases.has('diabetes_t1') || diseases.has('diabetes_t2')) && dish.carbsG > 52) return false;
  if (diseases.has('ibs') && dish.category === 'family_feast' && dish.id === 'feast_grilled_eggplant_lentil_plate') return false;
  if (isPregnantStatus(s?.profile?.maternalStatus) && dish.tags.includes('raw')) return false;

  return true;
}

function resolveHydrationPacingNote(s, category, date) {
  const ramadanActive = Boolean(s?.ramadanMode?.enabled && !(s.ramadanMode.endDate && date > s.ramadanMode.endDate));
  if (ramadanActive) {
    return {
      code: 'HYDRATION_RAMADAN_PACING',
      text: 'Pace fluids calmly between Iftar and Suhoor (2 cups at Iftar, steady sipping through the evening, and 2 cups before Suhoor cutoff).'
    };
  }
  const diet = String(s?.preferences?.diet || 'balanced').toLowerCase();
  if (diet === 'keto') {
    return {
      code: 'KETO_HYDRATION_BONUS',
      text: 'On keto, pair restaurant meals with an extra glass of water and mindful mineral electrolytes to avoid fatigue.'
    };
  }
  if (category === 'cafe') {
    return {
      code: 'DINING_CAFE_CAFFEINE_HYDRATION',
      text: 'Enjoy coffee or tea alongside a full glass of water to stay comfortably hydrated through the afternoon.'
    };
  }
  const region = s?.preferences?.region || s?.profile?.region || 'egypt';
  if (['egypt', 'gulf'].includes(region)) {
    return {
      code: 'WARM_CLIMATE_HYDRATION_BONUS',
      text: 'In warm regional climates, have a glass of water before dining out to support hydration and comfortable appetite cues.'
    };
  }
  return {
    code: 'DINING_STANDARD_HYDRATION_PACE',
    text: 'Sip water steadily before and during your meal to aid comfortable digestion and steady pacing.'
  };
}

export function getDiningOutOptions(s, { date = null, category = 'grill', isPro = true, enforcePro = false } = {}) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const targetDate = date ? String(date).trim() : localDate(clockNow(), tz);
  if (!validDate(targetDate)) {
    throw apiError('INVALID_DATE', 'Invalid calendar date format; expected YYYY-MM-DD.', { status: 400, params: { field: 'date' } });
  }
  const cat = String(category || 'grill').trim().toLowerCase();
  if (!CATEGORY_SET.has(cat)) {
    throw apiError('DINING_OUT_CATEGORY_INVALID', `Dining-out category must be one of: ${DINING_OUT_CATEGORIES.join(', ')}.`, {
      status: 400,
      params: { category: cat }
    });
  }

  const diary = dayTotals(s, targetDate);
  const plan = activePlan(s);
  const planDay = plan?.days?.find(d => d.date === targetDate);
  const dayTargets = planDay?.targets || plan?.targets || null;
  const targetKcal = diary.planEnergy != null ? Number(diary.planEnergy) : (dayTargets?.energy != null ? Number(dayTargets.energy) : 2000);
  const targetProtein = dayTargets?.protein != null ? Number(dayTargets.protein) : 120;
  const consumedKcal = Number(diary.totals?.energy || 0);
  const consumedProtein = Number(diary.totals?.protein || 0);
  const remainingKcal = Math.max(0, Math.round(targetKcal - consumedKcal));
  const remainingProteinG = Math.max(0, Math.round(targetProtein - consumedProtein));

  const categoryPool = DINING_OUT_DISHES.filter(d => d.category === cat);
  let safePool = categoryPool.filter(d => dishAllowedForUser(d, s));
  // If extreme combination leaves zero dishes in this category, fall back cleanly to safe dishes across other categories (strictly clinicalSafe)
  if (!safePool.length) {
    safePool = DINING_OUT_DISHES.filter(d => dishAllowedForUser(d, s));
  }

  const ranked = safePool
    .map(d => {
      const fitsRemainingBudget = remainingKcal === 0 ? false : d.estimatedKcal <= remainingKcal + 80;
      const kcalDiff = Math.abs(d.estimatedKcal - Math.min(remainingKcal || 500, 650));
      const proteinFit = remainingProteinG > 0 ? Math.min(1, d.proteinG / Math.max(1, Math.min(remainingProteinG, 45))) : 0.5;
      const score = (fitsRemainingBudget ? 0 : 1000) + kcalDiff - proteinFit * 180 + (d.category === cat ? 0 : 250);
      return {
        id: d.id,
        nameEn: d.nameEn,
        nameAr: d.nameAr,
        estimatedKcal: d.estimatedKcal,
        proteinG: d.proteinG,
        carbsG: d.carbsG,
        fatG: d.fatG,
        sodiumMg: d.sodiumMg,
        orderingTipCode: d.orderingTipCode,
        orderingTipsEn: d.orderingTipsEn,
        fitsRemainingBudget,
        clinicalSafe: true,
        _score: score
      };
    })
    .sort((a, b) => a._score - b._score)
    .slice(0, 3)
    .map(({ _score, ...rest }) => rest);

  const previewOnly = Boolean(enforcePro && !isPro);
  const visibleOptions = previewOnly ? ranked.slice(0, 1) : ranked;
  const hydrationPacing = resolveHydrationPacingNote(s, cat, targetDate);

  return {
    date: targetDate,
    category: cat,
    remainingKcal,
    remainingProteinG,
    previewOnly,
    totalAvailableCount: ranked.length,
    hydrationPacingNoteCode: hydrationPacing.code,
    hydrationPacingNoteEn: hydrationPacing.text,
    options: visibleOptions
  };
}

export function applyDiningOutLog(s, p = {}) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const date = validateLogDate(p?.date || localDate(clockNow(), tz), clockNow(), tz);
  const slot = ['breakfast', 'lunch', 'dinner', 'snack'].includes(p?.slot) ? p.slot : 'dinner';
  const optionId = String(p?.optionId || '').trim();
  const dish = DISH_BY_ID.get(optionId);
  if (!dish) {
    throw apiError('DINING_OUT_OPTION_NOT_FOUND', 'Selected dining-out option was not found.', {
      status: 404,
      params: { optionId }
    });
  }
  const portionMultiplier = p?.portionMultiplier == null ? 1 : number(p.portionMultiplier, 0.25, 3, 'portionMultiplier');
  const scale = v => Math.round(Number(v) * portionMultiplier * 10) / 10;

  const entry = {
    id: crypto.randomUUID(),
    date,
    slot,
    source: 'manual',
    diningOutOptionId: dish.id,
    diningOutCategory: dish.category,
    quantity: portionMultiplier,
    at: isoNow(),
    snapshot: {
      name: dish.nameEn,
      nameAr: dish.nameAr,
      values: {
        energy: String(Math.round(dish.estimatedKcal * portionMultiplier)),
        protein: String(scale(dish.proteinG)),
        carbs: String(scale(dish.carbsG)),
        fat: String(scale(dish.fatG)),
        fiber: null,
        saturated: String(scale(dish.satFatG)),
        sodium: String(Math.round(dish.sodiumMg * portionMultiplier)),
        sugars: null
      },
      ingredients: [],
      is_approximate: true
    }
  };
  s.foodEntries ||= [];
  s.foodEntries.push(entry);

  const { totals } = dayTotals(s, date);
  const plannedEnergy = plannedEnergyForDate(s, date);
  const energy = Number(totals.energy || 0);
  const adherence = plannedEnergy ? Math.max(0, Math.round(100 - (Math.abs(energy - plannedEnergy) / plannedEnergy) * 100)) : null;
  s.foodLogs = (s.foodLogs || []).filter(d => d.date !== date);
  s.foodLogs.push({
    date,
    complete: false,
    energy,
    protein: totals.protein,
    plannedEnergy,
    adherence,
    source: 'entries',
    planId: s.active_plan_id,
    completionPolicy: 1,
    confirmedAt: null
  });

  // Optional non-punitive rest-of-day macro rebalance note
  let restOfDayRebalance = null;
  if (p?.rebalanceRestOfDay === true && plannedEnergy) {
    const remainingKcal = Math.max(0, Math.round(plannedEnergy - energy));
    const plan = activePlan(s);
    const planDay = plan?.days?.find(d => d.date === date);
    const loggedMealIds = new Set((s.foodEntries || []).filter(e => e.date === date && e.mealId).map(e => e.mealId));
    const unloggedMeals = (planDay?.meals || []).filter(m => !loggedMealIds.has(m.id));
    const floor = minSafeEnergyFloor(s.profile);
    restOfDayRebalance = {
      applied: true,
      remainingKcal,
      unloggedMealsCount: unloggedMeals.length,
      perRemainingMealKcal: unloggedMeals.length ? Math.round(remainingKcal / unloggedMeals.length) : 0,
      safeFloorProtected: plannedEnergy >= floor,
      guidanceCode: remainingKcal < 150 ? 'DINING_REBALANCE_LIGHT_PROTEIN_SNACK' : 'DINING_REBALANCE_SPREAD_REMAINING',
      guidanceEn: remainingKcal < 150
        ? 'Your planned energy for today is already met; if hungry later, choose a light high-protein snack or herbal tea and return to your regular plan tomorrow.'
        : `Distribute your remaining ~${remainingKcal} kcal calmly across your remaining ${unloggedMeals.length || 1} meal(s) with lean protein and fiber.`
    };
    s.lastDiningRebalance = { date, ...restOfDayRebalance, at: isoNow() };
  }
  return { entry, restOfDayRebalance };
}

export function applyPostFeastRebalance(s, p = {}) {
  const tz = s?.profile?.timezone || clockTimeZone() || 'Africa/Cairo';
  const date = validateLogDate(p?.date || localDate(clockNow(), tz), clockNow(), tz);
  const mode = String(p?.mode || '').trim();
  if (!['zero_guilt_reset', 'gentle_spread'].includes(mode)) {
    throw apiError('VALIDATION_ERROR', 'mode must be zero_guilt_reset or gentle_spread.', { status: 400 });
  }

  const diary = dayTotals(s, date);
  const plannedEnergy = diary.planEnergy ?? plannedEnergyForDate(s, date) ?? Number(activePlan(s)?.targets?.energy || 2000);
  const loggedEnergy = Number(diary.totals?.energy || 0);
  const computedExcess = Math.max(0, Math.round(loggedEnergy - Number(plannedEnergy)));
  const excessKcal = p?.excessKcal != null ? number(p.excessKcal, 0, 6000, 'excessKcal') : computedExcess;

  // Always tag date as a flex_event so 14-day adaptive calorie review (KAN-82) is never skewed
  const flexSet = new Set(Array.isArray(s.flexDates) ? s.flexDates : []);
  flexSet.add(date);
  s.flexDates = [...flexSet].sort();
  s.flexEvents ||= [];
  s.flexEvents = s.flexEvents.filter(e => e.date !== date);

  if (mode === 'zero_guilt_reset') {
    const rec = {
      date,
      kind: 'flex_event',
      mode: 'zero_guilt_reset',
      excessKcal,
      createdAt: isoNow(),
      guidanceCode: 'POST_FEAST_ZERO_GUILT_RESET',
      guidanceEn: 'Today is marked as a flex event so your 14-day Specialist Team review stays accurate. Return calmly to your normal plan tomorrow—never skip meals or do punishment cardio.'
    };
    s.flexEvents.push(rec);
    return rec;
  }

  // gentle_spread clinical guardrails (KAN-119 Comment 1 & 2)
  const profile = s.profile || {};
  const bmi = profile.weight && profile.height ? Number(profile.weight) / ((Number(profile.height) / 100) ** 2) : 24;
  const isPregnant = isPregnantStatus(profile.maternalStatus);
  const isBreastfeeding = profile.maternalStatus === 'breastfeeding';
  const isSenior = Boolean(profile.seniorMode || Number(profile.age) >= 70);
  const floor = minSafeEnergyFloor(profile);

  if (isPregnant || isBreastfeeding || isSenior || bmi < 18.5) {
    throw apiError(
      'REBALANCE_BLOCKED_CLINICAL',
      'Gentle multi-day calorie spread is disabled for pregnancy, breastfeeding, senior mode, or BMI below 18.5; use zero_guilt_reset instead.',
      {
        status: 409,
        params: { reason: isPregnant ? 'pregnancy' : isBreastfeeding ? 'breastfeeding' : isSenior ? 'senior_mode' : 'low_bmi' }
      }
    );
  }

  const baseTarget = Number(plannedEnergy);
  const spreadDays = excessKcal >= 500 ? 3 : 2;
  const rawDailyCut = Math.min(100, Math.max(75, Math.round((excessKcal || 250) / spreadDays / 5) * 5));
  if (baseTarget - rawDailyCut < floor) {
    throw apiError(
      'REBALANCE_BLOCKED_CLINICAL',
      'Gentle calorie spread would dip below your safe minimum calorie floor; use zero_guilt_reset instead.',
      { status: 409, params: { reason: 'calorie_floor', minEnergyFloor: floor } }
    );
  }

  const affectedDates = [];
  for (let i = 1; i <= spreadDays; i++) {
    affectedDates.push(dateOffset(date, i));
  }
  const rec = {
    date,
    kind: 'flex_event',
    mode: 'gentle_spread',
    excessKcal,
    spreadDays,
    dailyReductionKcal: rawDailyCut,
    adjustedDailyTargetKcal: Math.round(baseTarget - rawDailyCut),
    affectedDates,
    createdAt: isoNow(),
    guidanceCode: 'POST_FEAST_GENTLE_SPREAD_ACTIVE',
    guidanceEn: `A calm ${spreadDays}-day balance of -${rawDailyCut} kcal/day is scheduled starting tomorrow (${affectedDates[0]}), staying safely above your ${floor} kcal floor with zero fasting or punishment workouts.`
  };
  s.flexEvents.push(rec);
  s.postFeastSpread = rec;

  // Apply non-destructive target note on upcoming unlogged days of active plan
  const plan = activePlan(s);
  if (plan?.days?.length) {
    for (const day of plan.days) {
      if (affectedDates.includes(day.date)) {
        const baseE = Number(day.targets?.energy ?? plan.targets?.energy ?? baseTarget);
        const nextE = Math.max(floor, Math.round(baseE - rawDailyCut));
        day.targets = { ...(day.targets || plan.targets), energy: nextE, postFeastAdjustmentKcal: -rawDailyCut };
      }
    }
  }
  return rec;
}
