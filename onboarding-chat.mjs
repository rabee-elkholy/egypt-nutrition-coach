import { DIETS, FIXED_DIET_MEALS, isDietUnsafeForProfile } from './diet-patterns.mjs';
import { REGIONS, GOALS, estimateNeeds } from './planner-core.mjs';
import {
  FITNESS_LEVELS,
  WORKOUT_LOCATIONS,
  WORKOUT_SPLITS,
  HOME_EQUIPMENT,
  INJURIES,
  SESSION_DURATIONS,
  WEEKDAYS_AR,
  getTrainingDayIndices,
  buildDefaultDayLocations,
  getAvailableWorkoutSplits,
  resolveWorkoutSplit
} from './workout-engine.mjs';

export const CHRONIC_DISEASES = [
  { id: 'none', label: 'الحمد لله لا يوجد ✅', isNone: true },
  { id: 'insulin_resistance', label: 'مقاومة الإنسولين 🩸' },
  { id: 'diabetes', label: 'السكري (النوع الثاني / تنظيم السكر) 🩺' },
  { id: 'hypertension', label: 'الضغط المرتفع ❤️‍🩹' },
  { id: 'hypothyroidism', label: 'خمول الغدة الدرقية 🦋' },
  { id: 'hyperthyroidism', label: 'نشاط الغدة الدرقية ⚡' },
  { id: 'pcos', label: 'تكيس المبايض (PCOS) 🌸' },
  { id: 'cholesterol', label: 'الكوليسترول والدهون الثلاثية 🫀' },
  { id: 'gout', label: 'النقرس والأملاح العالية 🦶' },
  { id: 'ibs', label: 'القولون العصبي (IBS) 🌿' },
  { id: 'anemia', label: 'الأنيميا ونقص الحديد 🥩' },
  { id: 'vitamin_d_calcium', label: 'نقص فيتامين د / الكالسيوم ☀️' }
];

export const QUICK_EXCLUSION_CHIPS = [
  { id: 'none', label: 'باكل كل حاجة الحمد لله ✅', isNone: true },
  { id: 'fish', label: 'السمك', proteinUncheck: null },
  { id: 'shellfish', label: 'الجمبري والمأكولات البحرية', proteinUncheck: null },
  { id: 'dairy', label: 'الألبان والجبن', proteinUncheck: 'dairy' },
  { id: 'eggs', label: 'البيض', proteinUncheck: 'eggs' },
  { id: 'chicken', label: 'الفراخ', proteinUncheck: 'chicken' },
  { id: 'beef', label: 'اللحوم الحمراء', proteinUncheck: 'meat' },
  { id: 'beans', label: 'الفول والبقوليات', proteinUncheck: null },
  { id: 'peanuts', label: 'الفول السوداني', proteinUncheck: null },
  { id: 'tree_nuts', label: 'المكسرات', proteinUncheck: null },
  { id: 'onion', label: 'البصل', proteinUncheck: null },
  { id: 'garlic', label: 'الثوم', proteinUncheck: null },
  { id: 'tomato', label: 'الطماطم والصلصة', proteinUncheck: null },
  { id: 'okra', label: 'البامية', proteinUncheck: null },
  { id: 'eggplant', label: 'الباذنجان', proteinUncheck: null }
];

export function detectUserRegion() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const lang = (globalThis.navigator?.language || '').toUpperCase();
    if (/Cairo/i.test(tz) || lang.endsWith('-EG')) return 'egypt';
    if (/Riyadh|Dubai|Kuwait|Qatar|Bahrain|Muscat|Aden/i.test(tz) || /-(SA|AE|KW|QA|BH|OM|YE)$/.test(lang)) return 'gulf';
    if (/Beirut|Amman|Damascus|Gaza|Hebron|Jerusalem/i.test(tz) || /-(LB|JO|SY|PS)$/.test(lang)) return 'levant';
    if (/Casablanca|Algiers|Tunis|Tripoli/i.test(tz) || /-(MA|DZ|TN|LY)$/.test(lang)) return 'maghreb';
  } catch {
    // Fallback to Egypt if Intl/navigator unavailable
  }
  return 'egypt';
}

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function getIdealWeightRange(heightCm) {
  const h = Number(heightCm);
  if (!Number.isFinite(h) || h < 120 || h > 230) return null;
  const hm = h / 100;
  const minWeight = Math.round(18.5 * hm * hm * 10) / 10;
  const maxWeight = Math.round(24.9 * hm * hm * 10) / 10;
  const idealMid = Math.round(21.7 * hm * hm * 10) / 10;
  return {
    heightCm: h,
    minWeight,
    maxWeight,
    idealMid,
    bmiForWeight(weightKg) {
      const w = Number(weightKg);
      if (!Number.isFinite(w) || w <= 0) return null;
      return Math.round((w / (hm * hm)) * 10) / 10;
    }
  };
}

export function evaluateTargetWeightBmi(heightCm, targetWeightKg) {
  const range = getIdealWeightRange(heightCm);
  const w = Number(targetWeightKg);
  if (!range || !Number.isFinite(w) || w <= 0) return null;
  const targetBmi = range.bmiForWeight(w);
  const isUnderweight = w < range.minWeight;
  const isOverweight = w > range.maxWeight;
  const isOutOfRange = isUnderweight || isOverweight;
  const clampedHealthy = isUnderweight ? range.minWeight : isOverweight ? range.maxWeight : w;
  let warningText = '';
  if (isUnderweight) {
    warningText = `الوزن المستهدف (${w} كجم · BMI ${targetBmi}) أقل من الحد الأدنى للوزن الصحي لطولك (${range.minWeight} كجم · BMI 18.5)، وتخطي هذا المدى يدخل الجسم في نطاق النحافة وقد يسبب فقدان الكتلة العضلية وإجهاد المناعة. ننصح بأن لا يقل هدفك عن ${range.minWeight} كجم.`;
  } else if (isOverweight) {
    warningText = `الوزن المستهدف (${w} كجم · BMI ${targetBmi}) يتخطى الحد الأعلى للمدى الصحي القياسي لطولك (${range.maxWeight} كجم · BMI 24.9). إذا كان هذا هدفاً مرحلياً أولياً أو هدف بناء كتلة عضلية عالية يمكنك المتابعة، أو تعديله ليكون داخل المدى المثالي (${range.minWeight} – ${range.maxWeight} كجم).`;
  }
  return {
    ...range,
    targetWeight: w,
    targetBmi,
    isUnderweight,
    isOverweight,
    isOutOfRange,
    clampedHealthy,
    warningText
  };
}

export const DIET_USER_DESCRIPTIONS = {
  balanced: 'كل أكل البيت الطبيعي (رز، عيش بلدي، مكرونة، فراخ، لحمة، سمك، فول، جبنة قريش) بكميات محسوبة · وتختار عدد وجباتك براحتك',
  low_carb: 'تقليل العيش والرز والمكرونة والتركيز على البروتين والخضار والدهون الصحية · 3 وجبات مشبعة بدون سناك (ممتاز لتنشيف الدهون ومقاومة الإنسولين)',
  high_protein: 'حصص بروتين أعلى في كل وجبة لبناء العضل والشبع العالي طول اليوم · 3 وجبات رئيسية + سناك غني بالبروتين',
  intermittent_fasting: 'صيام 16 ساعة (مسموح مية وشاي وقهوة بدون سكر) وأكل في نافذة 8 ساعات · وجبتين رئيسيتين مشبعتين + سناك',
  keto: 'منع العيش والرز والمكرونة والسكريات (أقل من 50 جم كارب يومياً) والاعتماد على البروتين والدهون الصحية · 3 وجبات كيتو مشبعة',
  mediterranean: 'أكل صحي للقلب والشرايين غني بالأسماك، زيت الزيتون، الخضار، البقوليات، والحبوب · 3 وجبات رئيسية + سناك صحي',
  dash: 'أكل قليل الملح والصوديوم وغني بالخضار والفاكهة والبوتاسيوم لضبط ضغط الدم · 3 وجبات رئيسية + سناك',
  vegetarian: 'بدون لحوم أو فراخ أو سمك، ويعتمد على البيض، الجبنة القريش، الزبادي، الفول، والعدس · 3 وجبات رئيسية + سناك',
  vegan: 'نباتي صيامي خالي تماماً من أي منتجات حيوانية، يعتمد على الفول، العدس، الحمص، الكشري، والمكسرات · 3 وجبات رئيسية + سناك'
};

export function getGoalPaceDetails(draft) {
  const currentW = Number(draft.weight) || 75;
  const targetW = Number(draft.targetWeight) || (draft.goal === 'lose' ? currentW - 8 : currentW + 6);
  const diffKg = Math.max(0.5, Math.round(Math.abs(currentW - targetW) * 10) / 10);
  const isGain = draft.goal === 'gain';
  const rates = isGain
    ? { slow: 0.25, moderate: 0.4, fast: 0.55 }
    : { slow: 0.35, moderate: 0.5, fast: 0.75 };

  const formatDuration = rate => {
    const weeks = Math.max(1, Math.round(diffKg / rate));
    if (weeks <= 4) return `حوالي ${weeks} ${weeks === 1 ? 'أسبوع' : weeks === 2 ? 'أسبوعين' : 'أسابيع'}`;
    const months = Math.round((weeks / 4.33) * 10) / 10;
    return `حوالي ${weeks} أسبوع (~${months} شهر)`;
  };

  return {
    diffKg,
    options: [
      {
        id: 'slow',
        rateKg: rates.slow,
        durationText: formatDuration(rates.slow),
        title: `🐢 هادي ومريح (حوالي ${rates.slow} كجم / أسبوع)`,
        desc: isGain
          ? `⏱️ توصل لـ ${targetW} كجم في ${formatDuration(rates.slow)} · زيادة تدريجية صافية بكميات أكل مريحة للمعدة`
          : `⏱️ توصل لـ ${targetW} كجم في ${formatDuration(rates.slow)} · كميات أكل كبيرة ومرونة عالية بدون أي إحساس بالجوع`
      },
      {
        id: 'moderate',
        rateKg: rates.moderate,
        durationText: formatDuration(rates.moderate),
        title: `⚡ متوازن ومثالي — موصى به ⭐ (حوالي ${rates.moderate} كجم / أسبوع)`,
        desc: isGain
          ? `⏱️ توصل لـ ${targetW} كجم في ${formatDuration(rates.moderate)} · أفضل توازن بين زيادة الوزن وبناء العضلات بدون دهون زيادة`
          : `⏱️ توصل لـ ${targetW} كجم في ${formatDuration(rates.moderate)} · المعيار الذهبي علمياً لنزول الدهون مع الحفاظ الكامل على العضلات`
      },
      {
        id: 'fast',
        rateKg: rates.fast,
        durationText: formatDuration(rates.fast),
        title: `🚀 سريع ومكثف (حوالي ${rates.fast} كجم / أسبوع)`,
        desc: isGain
          ? `⏱️ توصل لـ ${targetW} كجم في ${formatDuration(rates.fast)} · وجبات كثيفة السعرات لنتيجة أسرع وتحتاج التزام يومي`
          : `⏱️ توصل لـ ${targetW} كجم في ${formatDuration(rates.fast)} · عجز سعرات أعلى وكميات أكل أقل لمن يريد نتيجة سريعة بالتزام صارم`
      }
    ]
  };
}

export function computeSmartOnboardingInsights(draft) {
  const w = Number(draft.weight) || 75;
  const h = Number(draft.height) || 170;
  const age = Math.min(70, Math.max(18, Number(draft.age) || 30));
  const trainingDays = draft.serviceTrack === 'nutrition_only'
    ? 0
    : Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
      ? draft.selectedWorkoutDays.length
      : Number(draft.workoutDaysCount) || 3;

  let needs = null;
  try {
    needs = estimateNeeds({
      weight: w,
      height: h,
      age,
      seniorMode: Number(draft.age) > 70,
      sex: draft.sex || 'male',
      maternalStatus: draft.sex === 'female' ? draft.maternalStatus || 'none' : 'none',
      activity: draft.dailyActivity || 'light',
      goal: draft.goal || 'lose',
      targetWeight: draft.targetWeight ? Number(draft.targetWeight) : null,
      goalPace: draft.goalPace || 'moderate',
      trainingDays,
      diseases: (draft.diseases || []).filter(x => x && x !== 'none'),
      ketoAcknowledged: true,
      fastingAcknowledged: true
    });
    if (needs && draft.dietType === 'keto') {
      needs.carbs = Math.min(45, Math.round((needs.energy * 0.08) / 4));
      needs.fat = Math.round(Math.max(0, needs.energy - needs.protein * 4 - needs.carbs * 4) / 9);
    } else if (needs && draft.dietType === 'low_carb') {
      needs.carbs = Math.min(needs.carbs, Math.round((needs.energy * 0.25) / 4));
      needs.fat = Math.round(Math.max(0, needs.energy - needs.protein * 4 - needs.carbs * 4) / 9);
    }
  } catch {
    needs = null;
  }

  let waterLiters = w * 0.035;
  if (draft.dailyActivity === 'moderate' || draft.dailyActivity === 'active') waterLiters += 0.4;
  if (trainingDays > 0) waterLiters += 0.35;
  if (draft.sex === 'female' && draft.maternalStatus === 'breastfeeding') waterLiters += 0.6;
  else if (draft.sex === 'female' && draft.maternalStatus?.startsWith('pregnant')) waterLiters += 0.3;
  waterLiters = Math.max(1.8, Math.min(5.0, Math.round(waterLiters * 10) / 10));
  const waterCups = Math.round((waterLiters * 1000) / 240);

  const paceDetails = getGoalPaceDetails(draft);
  const chosenPace = paceDetails.options.find(o => o.id === (draft.goalPace || 'moderate')) || paceDetails.options[1];

  const effectiveSplitId = resolveWorkoutSplit(draft.workoutSplitPreference || 'auto', trainingDays);
  const splitObj = WORKOUT_SPLITS[effectiveSplitId] || WORKOUT_SPLITS.full_body;
  const splitPreview = {
    id: effectiveSplitId,
    preference: draft.workoutSplitPreference || 'auto',
    name: splitObj.shortLabel,
    desc: splitObj.desc
  };

  return {
    needs,
    waterLiters,
    waterCups,
    paceDetails,
    chosenPace,
    splitPreview
  };
}

export function createInitialOnboardingDraft(savedState = null) {
  const detectedRegion = savedState?.preferences?.region || detectUserRegion();
  const p = savedState?.profile || {};
  const prefs = savedState?.preferences || {};
  const wp = savedState?.onboarding?.workoutPrefs || {};
  const initialCount = wp.workoutDaysCount ?? p.trainingDays ?? 3;
  const initialSelectedDays =
    Array.isArray(wp.selectedWorkoutDays) && wp.selectedWorkoutDays.length
      ? [...new Set(wp.selectedWorkoutDays.map(Number).filter(n => n >= 0 && n <= 6))].sort((a, b) => a - b)
      : Array.isArray(p.workoutDays) && p.workoutDays.length
        ? [...new Set(p.workoutDays.map(Number).filter(n => n >= 0 && n <= 6))].sort((a, b) => a - b)
        : getTrainingDayIndices(initialCount);
  return {
    name: p.name || '',
    age: p.age || '',
    sex: p.sex || 'male',
    maternalStatus: p.maternalStatus || 'none',
    height: p.height || '',
    weight: p.weight || '',
    goal: p.goal || 'lose',
    targetWeight: p.targetWeight || '',
    goalPace: p.goalPace || 'moderate',
    serviceTrack: savedState?.onboarding?.serviceTrack || 'nutrition_and_workouts',
    // US-06 Workout prefs
    fitnessLevel: wp.fitnessLevel || 'beginner',
    selectedWorkoutDays: initialSelectedDays,
    workoutDaysCount: initialSelectedDays.length || 3,
    workoutSplitPreference: wp.workoutSplitPreference || 'auto',
    workoutLocation: wp.workoutLocation || 'gym_only',
    dayLocations: wp.dayLocations || null,
    homeEquipment: Array.isArray(wp.homeEquipment) && wp.homeEquipment.length ? [...wp.homeEquipment] : ['none'],
    sessionDuration: wp.sessionDuration || 45,
    injuries: Array.isArray(wp.injuries) && wp.injuries.length ? [...wp.injuries] : ['none'],
    // US-07 Nutrition prefs
    region: detectedRegion,
    dailyActivity: p.activity || 'light',
    diseases: Array.isArray(p.diseases) && p.diseases.length ? [...p.diseases] : ['none'],
    dietType: prefs.diet || 'balanced',
    eatingStart: prefs.eatingStart || '12:00',
    mealsCount: prefs.meals || 4,
    budget: prefs.budget || 'medium',
    excludedGroups: Array.isArray(prefs.excludedGroups) && prefs.excludedGroups.length ? [...prefs.excludedGroups] : ['none']
  };
}

export function getActiveSteps(draft, hasExistingData = false, forceFresh = false) {
  const steps = [];
  if (hasExistingData && !forceFresh) {
    steps.push('welcome_existing');
    return steps;
  }
  steps.push('name', 'age');
  if (Number(draft.age) > 0 && Number(draft.age) < 18) {
    steps.push('underage_gate');
    return steps;
  }
  steps.push('sex');
  if (draft.sex === 'female') {
    steps.push('maternal');
  }
  steps.push('height', 'weight', 'goal');
  if (['lose', 'gain', 'muscle_gain'].includes(draft.goal)) {
    steps.push('target_weight');
  }
  if (['lose', 'gain'].includes(draft.goal)) {
    steps.push('goal_pace');
  }
  steps.push('service_track');

  if (draft.serviceTrack !== 'nutrition_only') {
    steps.push('fitness_level', 'workout_days', 'workout_location');
    if (draft.workoutLocation === 'home_and_gym') {
      steps.push('workout_day_split');
    }
    if (draft.workoutLocation === 'home_only' || draft.workoutLocation === 'home_and_gym') {
      steps.push('home_equipment');
    }
    steps.push('session_duration', 'injuries');
  }

  if (draft.serviceTrack !== 'workouts_only') {
    steps.push('daily_activity', 'diseases', 'diet_type');
    if (draft.dietType === 'intermittent_fasting') {
      steps.push('if_start_hour');
    } else if (draft.dietType === 'balanced') {
      steps.push('meals_count');
    }
    steps.push('budget', 'exclusions');
  }

  steps.push('summary');
  return steps;
}

const REGION_FLAGS = {
  egypt: 'مصر 🇪🇬',
  gulf: 'الخليج العربي 🇸🇦🇦🇪',
  levant: 'بلاد الشام 🇱🇧🇯🇴',
  maghreb: 'المغرب العربي 🇲🇦🇹🇳'
};

export function mountOnboardingChat({ container, getState, onRestoreExisting, onCompleteOnboarding }) {
  let state = getState();
  let hasExisting = Boolean(state?.plans?.length || state?.profile || state?.workoutPlan);
  let forceFresh = false;
  let draft = createInitialOnboardingDraft(state);
  let currentStepId = hasExisting ? 'welcome_existing' : 'name';
  let errorMsg = '';
  let bmiWarningPendingFor = null;

  function getStepMeta(stepId) {
    const userName = draft.name?.trim() || 'بطل';
    switch (stepId) {
      case 'welcome_existing':
        return {
          bot: `أهلاً بيك من تاني يا ${esc(state?.profile?.name || 'بطل')}! 👋 لقيت عندك خطة وبيانات متسجلة على جهازك.. تحب نكمل عليها علطول ولا نبدأ خطة جديدة من الأول؟`,
          answer: null
        };
      case 'name':
        return {
          bot: `أهلاً بيك يا بطل! 🌟 أنا الكوتش الذكي بتاعك.. في خطوات سريعة هجهزلك نظام غذائي وجدول تمارين متفصلين على جسمك وأكلك اليومي في ${REGION_FLAGS[draft.region] || 'منطقتك'}. قولي الأول، تحب أناديك بإيه؟`,
          answer: draft.name ? `اسمي ${draft.name}` : null
        };
      case 'age':
        return {
          bot: `عاشت الأسامي يا ${esc(userName)}! تشرفنا بيك ❤️ عندك كام سنة؟ (عشان نحسب معدل الحرق الأساسي لجسمك بدقة)`,
          answer: draft.age ? `${draft.age} سنة${Number(draft.age) > 70 ? ' (وضع كبار السن الآمن مفعّل 🛡️)' : ''}` : null
        };
      case 'underage_gate':
        return {
          bot: `يا ${esc(userName)}، عشان سنك أقل من 18 سنة (${esc(draft.age)} سنة)، جسمك في مرحلة نمو مهمة جداً ومينفعش يمشي على عجز سعرات أو أنظمة آلية من غير متابعة دكتور تغذية أو ولي أمرك. تقدر تعدل السن لو كتبته غلط أو تتصفح دليل الأطعمة بحرية! 🌱`,
          answer: null
        };
      case 'sex':
        return {
          bot: `${Number(draft.age) > 70 ? 'ربنا يديك الصحة وطولة العمر! هنراعي في خطتك تمارين آمنة للمفاصل وبروتين يحافظ على العضلات. ' : ''}نوعك إيه عشان نظبط معادلات الحرق والاحتياج بدقة؟`,
          answer: draft.sex === 'female' ? '👩 أنثى' : '👨 ذكر'
        };
      case 'maternal':
        return {
          bot: `هل في حمل أو رضاعة حالياً؟ عشان نضيف السعرات والبروتين اللازمين لصحتك وصحة البيبي ونمنع أي أنظمة قاسية.`,
          answer: {
            none: 'لا يوجد ✅',
            pregnant_t1: 'حامل — الثلث الأول 🤰',
            pregnant_t2: 'حامل — الثلث الثاني 🤰',
            pregnant_t3: 'حامل — الثلث الثالث 🤰',
            breastfeeding: 'مرضعة 🤱'
          }[draft.maternalStatus] || 'لا يوجد ✅'
        };
      case 'height':
        return {
          bot: `تمام جداً.. طولك كام سنتيمتر؟ 📏 (عشان نحسب مدى وزنك الصحي المثالي)`,
          answer: draft.height ? `${draft.height} سم` : null
        };
      case 'weight':
        return {
          bot: `ووزنك الحالي كام كيلو؟ ⚖️ (ده نقطة البداية اللي هنبني عليها سعراتك وحصص البروتين والمية)`,
          answer: draft.weight ? `${draft.weight} كجم` : null
        };
      case 'goal': {
        const bmi = draft.weight && draft.height ? (Number(draft.weight) / ((Number(draft.height) / 100) ** 2)).toFixed(1) : null;
        const range = getIdealWeightRange(draft.height);
        const bmiHint = bmi
          ? Number(bmi) < 18.5
            ? ` (مؤشر كتلتك ${bmi} أقل من الطبيعي — أنصحك بـ «زيادة الوزن» أو «بناء عضلات» للوصول لمدى ${range?.minWeight}–${range?.maxWeight} كجم)`
            : Number(bmi) >= 25
              ? ` (مؤشر كتلتك ${bmi} — أنصحك بـ «خسارة دهون وتخسيس» للوصول لمدى وزنك الصحي ${range?.minWeight}–${range?.maxWeight} كجم مع الحفاظ على عضلاتك)`
              : ` (مؤشر كتلتك ${bmi} في المدى الصحي المثالي ✅ — تقدر تختار تنسيق الجسم وبناء العضل أو الحفاظ على وزنك)`
          : '';
        return {
          bot: `إيه هدفك الأساسي اللي عايزين نوصله سوا؟ 🎯${bmiHint}`,
          answer: GOALS[draft.goal] || draft.goal
        };
      }
      case 'target_weight': {
        const range = getIdealWeightRange(draft.height);
        const rangeHint = range
          ? ` · المدى الصحي المثالي لطولك (${esc(draft.height)} سم) هو بين ${range.minWeight} و ${range.maxWeight} كجم حسب مؤشر كتلة الجسم (BMI 18.5–24.9)، والمتوسط المثالي حوالي ${range.idealMid} كجم`
          : '';
        const evalTarget = draft.targetWeight ? evaluateTargetWeightBmi(draft.height, draft.targetWeight) : null;
        return {
          bot: `جميل جداً! نفسك توصل لوزن كام كيلو؟ 🎯 (وزنك الحالي ${esc(draft.weight)} كجم${rangeHint})`,
          answer: draft.targetWeight
            ? `الوزن المستهدف: ${draft.targetWeight} كجم${evalTarget ? ` (BMI ${evalTarget.targetBmi}${evalTarget.isOutOfRange ? ' · خارج المدى القياسي' : ' · مدى صحي مثالي ✅'})` : ''}`
            : null
        };
      }
      case 'goal_pace': {
        const paceDetails = getGoalPaceDetails(draft);
        const chosen = paceDetails.options.find(o => o.id === draft.goalPace) || paceDetails.options[1];
        const targetW = Number(draft.targetWeight) || (draft.goal === 'lose' ? Number(draft.weight) - 8 : Number(draft.weight) + 6);
        const actionWord = draft.goal === 'gain' ? 'نزيد' : 'ننزل';
        return {
          bot: `عشان نوصل من ${esc(draft.weight)} كجم لـ ${esc(targetW)} كجم (فرق ${paceDetails.diffKg} كجم)، تحب ${actionWord} بأي معدل سرعة أسبوعي؟ ⏱️ (ده بيحدد كمية الأكل اليومية والمدة المتوقعة للوصول لهدفك)`,
          answer: `${chosen.title} — ${chosen.durationText}`
        };
      }
      case 'service_track':
        return {
          bot: `تحب أجهزلك إيه في خطتك الأسبوعية يا ${esc(userName)}؟ (لما نجمع التغذية والتمارين مع بعض، السيستم بيظبط سعراتك وبروتينك تلقائياً على أيام تمرينك!)`,
          answer: {
            nutrition_and_workouts: '🔥 تغذية + تمارين مع بعض',
            nutrition_only: '🥗 نظام غذائي بس',
            workouts_only: '💪 جدول تمارين بس'
          }[draft.serviceTrack]
        };
      case 'fitness_level':
        return {
          bot: `يلا نظبط جدول التمارين! 💪 مستواك الرياضي الحالي وخبرتك في التمرين إيه؟ (عشان نحدد عدد الجولات ومستوى صعوبة التمارين المناسبة ليك)`,
          answer: FITNESS_LEVELS[draft.fitnessLevel]?.label
        };
      case 'workout_days': {
        const selectedDays = Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
          ? draft.selectedWorkoutDays
          : getTrainingDayIndices(draft.workoutDaysCount);
        const dayNames = selectedDays.map(i => WEEKDAYS_AR[Number(i)]?.name).filter(Boolean).join('، ');
        const effectiveSplit = resolveWorkoutSplit(draft.workoutSplitPreference || 'auto', selectedDays.length);
        const splitLabel = WORKOUT_SPLITS[effectiveSplit]?.shortLabel || 'Full Body';
        return {
          bot: `اختار أيام الأسبوع اللي فاضي تتمرن فيها بالظبط! 📅 (السيستم بيظبطلك أفضل تقسيمة عضلات تلقائياً حسب أيامك، وتقدر كمان تختار نظامك المفضل زي PPL أو Bro Split الكلاسيكي لو حابب)`,
          answer: `${selectedDays.length} ${selectedDays.length === 1 ? 'يوم' : selectedDays.length === 2 ? 'يومين' : 'أيام'} (${dayNames}) · ${splitLabel}`
        };
      }
      case 'workout_location':
        return {
          bot: `تحب تتمرن فين؟ 🏋️🏠 (لو بتروح الجيم أيام وتتمرن في البيت أيام، اختار «ميكس بين البيت والجيم»)`,
          answer: WORKOUT_LOCATIONS[draft.workoutLocation]?.label
        };
      case 'workout_day_split': {
        const locs = buildDefaultDayLocations(draft.workoutDaysCount, 'home_and_gym', draft.dayLocations, draft.selectedWorkoutDays);
        const summary = Object.entries(locs)
          .map(([idx, loc]) => `${WEEKDAYS_AR[Number(idx)].name}: ${loc === 'home' ? '🏠 بيت' : '🏋️ جيم'}`)
          .join(' · ');
        return {
          bot: `بما إنك اخترت ميكس بين البيت والجيم، حدد لكل يوم من الأيام اللي اخترتها تحب تتمرنه في البيت 🏠 ولا في الجيم 🏋️:`,
          answer: summary
        };
      }
      case 'home_equipment': {
        const labels = draft.homeEquipment
          .map(id => HOME_EQUIPMENT.find(e => e.id === id)?.label || id)
          .join('، ');
        return {
          bot: `إيه الأدوات المتاحة عندك في البيت؟ 🏠 (اختار كل الموجود عندك، أو «بدون أدوات خالص» وهنعملك تمارين قوية بوزن الجسم)`,
          answer: labels
        };
      }
      case 'session_duration':
        return {
          bot: `وقت حصة التمرين الواحدة اللي يناسب يومك قد إيه؟ ⏱️ (شامل التسخين، التمرين الأساسي، والتهدئة)`,
          answer: `${draft.sessionDuration} دقيقة`
        };
      case 'injuries': {
        const labels = draft.injuries
          .map(id => INJURIES.find(i => i.id === id)?.label || id)
          .join('، ');
        return {
          bot: `سلامتك تهمنا قبل أي تمرين ❤️ هل عندك أي ألم أو إصابة حالياً عشان نستبعد التمارين اللي بتضغط عليها ونحط بدائل آمنة للمفاصل؟`,
          answer: labels
        };
      }
      case 'daily_activity':
        return {
          bot: `دلوقتي نظبط التغذية الذكية! 🥗 طبيعة شغلك وحركتك اليومية المعتادة (بره وقت الجيم أو التمرين) عاملة إزاي؟ (عشان منحسبش مجهود التمرين مرتين!)`,
          answer: {
            sedentary: '🪑 مكتبي / جلوس أغلب اليوم',
            light: '🚶 حركة خفيفة خلال اليوم',
            moderate: '🏃 حركة متوسطة / شغل فيه مشي',
            active: '🔥 مجهود بدني عالي يومياً'
          }[draft.dailyActivity]
        };
      case 'diseases': {
        const labels = draft.diseases
          .map(id => CHRONIC_DISEASES.find(d => d.id === id)?.label || id)
          .join('، ');
        return {
          bot: `هل عندك أي حالة صحية من دول؟ 🩺 (عشان نظبط نسب الكارب والصوديوم والدهون، ونرشحلك أنسب نظام غذائي طبياً لحالتك)`,
          answer: labels
        };
      }
      case 'diet_type': {
        const fixed = FIXED_DIET_MEALS[draft.dietType];
        return {
          bot: `تحب تمشي على أي مدرسة غذائية؟ 🍽️ (اختار الطريقة اللي تريحك في الأكل وتقدر تلتزم بيها بدون ملل — كل اختيار موضح تحته نوع الأكل وعدد الوجبات)`,
          answer: `${DIETS[draft.dietType] || draft.dietType}${fixed ? ` (${fixed.label})` : ''}`
        };
      }
      case 'if_start_hour':
        return {
          bot: `في الصيام المتقطع (16/8) هتصوم 16 ساعة (مسموح مية وشاي وقهوة بدون سكر) وتاكل في نافذة 8 ساعات (وجبتين رئيسيتين + سناك) ⏰.. تحب تبدأ أول وجبة الساعة كام؟`,
          answer: `بداية الأكل الساعة ${draft.eatingStart}`
        };
      case 'meals_count':
        return {
          bot: `بما إنك اخترت النظام المتوازن، تحب نقسم سعراتك اليومية على كام وجبة؟ 🍱 (نفس إجمالي السعرات والنتيجة في الآخر، فاختار التقسيمة اللي تناسب مواعيد يومك وشهيتك)`,
          answer: {
            2: 'وجبتين كبار مشبعين (2 وجبات)',
            3: '3 وجبات رئيسية (فطار وغداء وعشاء)',
            4: '3 وجبات رئيسية + سناك (4 وجبات)',
            5: '3 وجبات رئيسية + 2 سناك (5 وجبات)'
          }[draft.mealsCount]
        };
      case 'budget':
        return {
          bot: `تحب نرتب جدول أكلاتك اليومي على أي ميزانية؟ 💰 (كل الميزانيات بتحقق نفس البروتين والسعرات بالظبط، الفرق بس في نوع الأصناف المختارة!)`,
          answer: {
            low: '🪙 اقتصادية وشعبية (فول، بيض، جبنة قريش، عدس، بطاطس، فراخ وسمك اقتصادي)',
            medium: '⚖️ متوسطة ومتوازنة (تنوع يومي ممتاز)',
            high: '✨ مفتوحة ومتنوعة (تشمل السلمون، اللحوم، المكسرات، والأفوكادو)'
          }[draft.budget]
        };
      case 'exclusions': {
        const labels = draft.excludedGroups
          .map(id => QUICK_EXCLUSION_CHIPS.find(c => c.id === id)?.label || id)
          .join('، ');
        return {
          bot: `آخر سؤال يا ${esc(userName)}! 🙌 في أي أكلات مش بتحبها أو عندك حساسية منها وعايز نستبعدها تماماً من جدولك؟`,
          answer: labels
        };
      }
      case 'summary':
        return {
          bot: `كده كل حاجة جاهزة يا ${esc(userName)}! 🎉 حسبتلك خطتك الرقمية الكاملة (السعرات، الماكروز، المية، والمدة المتوقعة).. راجعها تحت وتقدر تعدل أي تفصيلة بضغطة واحدة قبل ما نولّد الجدول:`,
          answer: null
        };
      default:
        return { bot: '', answer: null };
    }
  }

  function advanceFrom(stepId) {
    errorMsg = '';
    const steps = getActiveSteps(draft, hasExisting, forceFresh);
    const idx = steps.indexOf(stepId);
    if (idx >= 0 && idx + 1 < steps.length) {
      currentStepId = steps[idx + 1];
    }
    render();
  }

  function goBack() {
    errorMsg = '';
    const steps = getActiveSteps(draft, hasExisting, forceFresh);
    const idx = steps.indexOf(currentStepId);
    if (idx > 0) {
      currentStepId = steps[idx - 1];
      render();
    }
  }

  function jumpToStep(stepId) {
    errorMsg = '';
    currentStepId = stepId;
    render();
  }

  function toggleMultiSelect(listKey, itemId) {
    const current = new Set(draft[listKey] || []);
    if (itemId === 'none') {
      draft[listKey] = ['none'];
    } else {
      current.delete('none');
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        current.add(itemId);
      }
      draft[listKey] = current.size ? [...current] : ['none'];
    }
    render();
  }

  function renderControlsForStep(stepId) {
    switch (stepId) {
      case 'welcome_existing':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="primary-btn chat-choice-btn" data-chat-action="restore-existing">
              <strong>🏃‍♂️ كمّل على خطتي وبياناتي المحفوظة</strong>
              <small>افتح جدول وجباتي وتماريني الحالي فوراً</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn" data-chat-action="start-fresh">
              <strong>🔄 ابدأ خطة جديدة وتعديل البيانات من الأول</strong>
              <small>أعد ضبط الوزن أو الهدف أو أيام التمرين والنظام الغذائي</small>
            </button>
          </div>
        `;
      case 'name':
        return `
          <div class="chat-input-row">
            <input type="text" id="chat-input-name" aria-label="اسمك" placeholder="اكتب اسمك هنا (مثلاً: أحمد، سارة)..." value="${esc(draft.name)}" maxlength="50">
            <button type="button" class="primary-btn" data-chat-action="submit-name">التالي ⬅️</button>
          </div>
        `;
      case 'age':
        return `
          <div class="chat-number-step-box">
            <div class="chat-quick-num-chips">
              <span>اختيار سريع:</span>
              ${[20, 25, 30, 35, 40, 45, 55].map(v => `
                <button type="button" class="outline-btn chat-chip ${Number(draft.age) === v ? 'is-selected' : ''}" data-quick-num-field="age" data-quick-num-val="${v}">${v} سنة</button>
              `).join('')}
            </div>
            <div class="chat-input-row">
              <input type="number" id="chat-input-age" aria-label="العمر بالسنوات" placeholder="أو اكتب عمرك بالسنوات (مثلاً: 28)" min="10" max="95" step="1" value="${esc(draft.age)}">
              <button type="button" class="primary-btn" data-chat-action="submit-age">التالي ⬅️</button>
            </div>
          </div>
        `;
      case 'underage_gate':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn" data-chat-jump="age">✏️ تعديل العمر لو كتبته بالخطأ</button>
          </div>
        `;
      case 'sex':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn ${draft.sex === 'male' ? 'is-selected' : ''}" data-chat-select="sex" data-val="male">
              <strong>👨 ذكر</strong>
              <small>حساب معدل الحرق والكتلة العضلية بمعادلة الرجال</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.sex === 'female' ? 'is-selected' : ''}" data-chat-select="sex" data-val="female">
              <strong>👩 أنثى</strong>
              <small>حساب معدل الحرق بمعادلة السيدات مع مراعاة الحمل والرضاعة</small>
            </button>
          </div>
        `;
      case 'maternal':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'none' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="none">
              <strong>❌ لا يوجد حمل أو رضاعة</strong>
              <small>حساب الاحتياج اليومي الطبيعي</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'pregnant_t1' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="pregnant_t1">
              <strong>🤰 حامل — الثلث الأول (الشهر 1 إلى 3)</strong>
              <small>تثبيت صحي آمن مع منع عجز السعرات والكيتو والصيام</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'pregnant_t2' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="pregnant_t2">
              <strong>🤰 حامل — الثلث الثاني (الشهر 4 إلى 6)</strong>
              <small>إضافة +340 سعرة و+15 جم بروتين يومياً لنمو الجنين</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'pregnant_t3' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="pregnant_t3">
              <strong>🤰 حامل — الثلث الثالث (الشهر 7 إلى 9)</strong>
              <small>إضافة +450 سعرة و+25 جم بروتين يومياً لدعم الشهور الأخيرة</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'breastfeeding' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="breastfeeding">
              <strong>🤱 مرضعة</strong>
              <small>إضافة +400 سعرة و+20 جم بروتين ومياه إضافية لإدرار الحليب</small>
            </button>
          </div>
        `;
      case 'height':
        return `
          <div class="chat-number-step-box">
            <div class="chat-quick-num-chips">
              <span>اختيار سريع:</span>
              ${[155, 160, 165, 170, 175, 180, 185].map(v => `
                <button type="button" class="outline-btn chat-chip ${Number(draft.height) === v ? 'is-selected' : ''}" data-quick-num-field="height" data-quick-num-val="${v}">${v} سم</button>
              `).join('')}
            </div>
            <div class="chat-input-row">
              <input type="number" id="chat-input-height" aria-label="الطول بالسنتيمتر" placeholder="أو اكتب طولك بالـ سم (مثلاً: 172)" min="120" max="230" step="0.5" value="${esc(draft.height)}">
              <button type="button" class="primary-btn" data-chat-action="submit-height">التالي ⬅️</button>
            </div>
          </div>
        `;
      case 'weight':
        return `
          <div class="chat-number-step-box">
            <div class="chat-quick-num-chips">
              <span>اختيار سريع:</span>
              ${[55, 65, 75, 85, 95, 105, 115].map(v => `
                <button type="button" class="outline-btn chat-chip ${Number(draft.weight) === v ? 'is-selected' : ''}" data-quick-num-field="weight" data-quick-num-val="${v}">${v} كجم</button>
              `).join('')}
            </div>
            <div class="chat-input-row">
              <input type="number" id="chat-input-weight" aria-label="الوزن بالكيلوجرام" placeholder="أو اكتب وزنك الحالي بالـ كجم (مثلاً: 78)" min="35" max="250" step="0.1" value="${esc(draft.weight)}">
              <button type="button" class="primary-btn" data-chat-action="submit-weight">التالي ⬅️</button>
            </div>
          </div>
        `;
      case 'goal': {
        const isPregnant = draft.maternalStatus && draft.maternalStatus.startsWith('pregnant');
        const bmi = draft.weight && draft.height ? Number(draft.weight) / ((Number(draft.height) / 100) ** 2) : 22;
        const recLose = !isPregnant && bmi >= 25;
        const recGain = bmi < 18.5;
        const recMuscle = !recLose && !recGain && !isPregnant;
        return `
          <div class="chat-quick-replies">
            ${!isPregnant ? `
              <button type="button" class="outline-btn chat-choice-btn ${draft.goal === 'lose' ? 'is-selected' : ''}" data-chat-select="goal" data-val="lose">
                <strong>🔥 خسارة دهون وتخسيس${recLose ? ' (⭐ الأنسب لجسمك حالياً)' : ''}</strong>
                <small>حرق الدهون الزائدة ونزول المقاسات مع بروتين عالي يمنع ترهل الجسم أو فقدان العضلات</small>
              </button>
            ` : ''}
            <button type="button" class="outline-btn chat-choice-btn ${draft.goal === 'muscle_gain' ? 'is-selected' : ''}" data-chat-select="goal" data-val="muscle_gain">
              <strong>💪 بناء عضلات وجسم متناسق${recMuscle ? ' (⭐ الأنسب لجسمك حالياً)' : ''}</strong>
              <small>زيادة الكتلة العضلية الصافية وشد الجسم بوجبات عالية البروتين وفائض سعرات مدروس</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.goal === 'gain' ? 'is-selected' : ''}" data-chat-select="goal" data-val="gain">
              <strong>📈 زيادة الوزن وعلاج النحافة${recGain ? ' (⭐ الأنسب لجسمك حالياً)' : ''}</strong>
              <small>وجبات غنية بالسعرات وسهلة الهضم لزيادة الوزن بشكل صحي ومستمر بدون تخمة</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.goal === 'maintain' ? 'is-selected' : ''}" data-chat-select="goal" data-val="maintain">
              <strong>⚖️ الحفاظ على الوزن وصحة الجسم${isPregnant ? ' (⭐ الآمن للحمل)' : ''}</strong>
              <small>تثبيت وزنك الحالي وتنظيم أكلك اليومي لتحسين الطاقة والهضم واللياقة</small>
            </button>
          </div>
        `;
      }
      case 'target_weight': {
        const w = Number(draft.weight) || 75;
        const range = getIdealWeightRange(draft.height);
        let defaultSuggested = draft.goal === 'lose' ? Math.max(45, Math.round(w - 8)) : Math.min(200, Math.round(w + 6));
        if (range) {
          if (draft.goal === 'lose' && w > range.maxWeight) {
            defaultSuggested = range.maxWeight;
          } else if (draft.goal === 'lose' && w > range.idealMid) {
            defaultSuggested = range.idealMid;
          } else if (draft.goal === 'gain' && w < range.minWeight) {
            defaultSuggested = range.minWeight;
          } else if (draft.goal === 'gain' && w < range.idealMid) {
            defaultSuggested = range.idealMid;
          }
        }
        const currentInputVal = draft.targetWeight || defaultSuggested;
        const evalBmi = evaluateTargetWeightBmi(draft.height, currentInputVal);
        const quickOptions = [];
        if (range) {
          if (draft.goal === 'lose') {
            if (range.idealMid < w) quickOptions.push({ val: range.idealMid, label: `🎯 الوزن المثالي المتوسط (${range.idealMid} كجم)` });
            if (range.maxWeight < w && range.maxWeight !== range.idealMid) quickOptions.push({ val: range.maxWeight, label: `✅ بداية المدى الصحي (${range.maxWeight} كجم)` });
            if (range.minWeight < w) quickOptions.push({ val: range.minWeight, label: `📉 الحد الأدنى الصحي (${range.minWeight} كجم)` });
          } else if (draft.goal === 'gain') {
            if (range.minWeight > w) quickOptions.push({ val: range.minWeight, label: `✅ أول مدى الوزن الصحي (${range.minWeight} كجم)` });
            if (range.idealMid > w) quickOptions.push({ val: range.idealMid, label: `🎯 الوزن المثالي المتوسط (${range.idealMid} كجم)` });
            if (range.maxWeight > w && range.maxWeight !== range.idealMid) quickOptions.push({ val: range.maxWeight, label: `💪 الحد الأعلى الصحي (${range.maxWeight} كجم)` });
          } else {
            quickOptions.push({ val: Math.round(w + 4), label: `💪 زيادة +4 كجم عضل (${Math.round(w + 4)} كجم)` });
            if (range.idealMid >= w) quickOptions.push({ val: range.idealMid, label: `🎯 الوزن المثالي المتوسط (${range.idealMid} كجم)` });
            if (range.maxWeight >= w) quickOptions.push({ val: range.maxWeight, label: `🏆 الحد الأعلى لـ BMI الصحي (${range.maxWeight} كجم)` });
          }
        }
        return `
          <div class="chat-target-weight-box">
            ${range ? `
              <div class="chat-ideal-range-banner">
                <div class="ideal-range-title">📏 <strong>المدى الصحي المثالي لطولك (${esc(draft.height)} سم):</strong> من <strong>${range.minWeight} كجم</strong> إلى <strong>${range.maxWeight} كجم</strong> <small>(BMI 18.5 – 24.9)</small></div>
                <div class="ideal-range-sub">المتوسط المثالي لطولك: <strong>${range.idealMid} كجم</strong> · وزنك الحالي: <strong>${esc(draft.weight)} كجم</strong></div>
                ${quickOptions.length ? `
                  <div class="ideal-quick-chips">
                    ${quickOptions.map(q => `
                      <button type="button" class="outline-btn chat-chip ${Number(currentInputVal) === Number(q.val) ? 'is-selected' : ''}" data-fill-target-weight="${q.val}">${esc(q.label)}</button>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            ` : ''}
            <div class="chat-input-row">
              <input type="number" id="chat-input-target-weight" aria-label="الوزن المستهدف بالكيلوجرام" placeholder="الوزن المستهدف (مثلاً: ${defaultSuggested})" min="35" max="250" step="0.5" value="${esc(currentInputVal)}">
              <button type="button" class="primary-btn" data-chat-action="submit-target-weight">التالي ⬅️</button>
            </div>
            <div id="chat-target-bmi-live" class="chat-bmi-live ${evalBmi?.isOutOfRange ? 'is-warning' : 'is-healthy'}" role="status" aria-live="polite">
              ${evalBmi ? (
                evalBmi.isOutOfRange
                  ? `⚠️ <strong>تحذير مؤشر كتلة الجسم (BMI ${evalBmi.targetBmi}):</strong> ${esc(evalBmi.warningText)}`
                  : `✅ <strong>مدى صحي مثالي (BMI ${evalBmi.targetBmi}):</strong> الوزن المختار (${evalBmi.targetWeight} كجم) يقع داخل المدى الصحي المثالي لطولك (${evalBmi.minWeight} – ${evalBmi.maxWeight} كجم).`
              ) : ''}
            </div>
            ${bmiWarningPendingFor != null && evalBmi?.isOutOfRange ? `
              <div class="chat-bmi-confirm-actions" role="alert">
                <button type="button" class="primary-btn" data-chat-action="accept-healthy-weight" data-healthy-val="${evalBmi.clampedHealthy}">✨ اعتمد أقرب وزن صحي مثالي (${evalBmi.clampedHealthy} كجم) والمتابعة</button>
                <button type="button" class="outline-btn" data-chat-action="force-target-weight">⚠️ فاهم التحذير، كمّل على الوزن ده (${evalBmi.targetWeight} كجم) ⬅️</button>
              </div>
            ` : ''}
          </div>
        `;
      }
      case 'goal_pace': {
        const paceDetails = getGoalPaceDetails(draft);
        return `
          <div class="chat-quick-replies">
            ${paceDetails.options.map(opt => `
              <button type="button" class="outline-btn chat-choice-btn ${draft.goalPace === opt.id ? 'is-selected' : ''}" data-chat-select="goalPace" data-val="${opt.id}">
                <strong>${esc(opt.title)}</strong>
                <small>${esc(opt.desc)}</small>
              </button>
            `).join('')}
          </div>
        `;
      }
      case 'service_track':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn ${draft.serviceTrack === 'nutrition_and_workouts' ? 'is-selected' : ''}" data-chat-select="serviceTrack" data-val="nutrition_and_workouts">
              <strong>🔥 الاتنين مع بعض (نظام غذائي + جدول تمارين) — موصى به ⭐</strong>
              <small>أفضل نتيجة؛ سعراتك وبروتينك هيتظبطوا تلقائياً على أيام ومجهود تمرينك</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.serviceTrack === 'nutrition_only' ? 'is-selected' : ''}" data-chat-select="serviceTrack" data-val="nutrition_only">
              <strong>🥗 نظام غذائي بس (بدون تمارين)</strong>
              <small>جدول وجبات يومي محسوب السعرات والماكروز بالجرام والوحدات المنزلية</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.serviceTrack === 'workouts_only' ? 'is-selected' : ''}" data-chat-select="serviceTrack" data-val="workouts_only">
              <strong>💪 جدول تمارين بس (جيم أو بيت)</strong>
              <small>خطة تدريبية أسبوعية مفصلة بالجولات والعدات والبدائل الآمنة</small>
            </button>
          </div>
        `;
      case 'fitness_level':
        return `
          <div class="chat-quick-replies">
            ${Object.values(FITNESS_LEVELS).map(l => `
              <button type="button" class="outline-btn chat-choice-btn ${draft.fitnessLevel === l.id ? 'is-selected' : ''}" data-chat-select="fitnessLevel" data-val="${l.id}">
                <strong>${esc(l.label)}</strong>
                ${l.desc ? `<small>${esc(l.desc)}</small>` : ''}
              </button>
            `).join('')}
          </div>
        `;
      case 'workout_days': {
        const selectedDays = Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
          ? draft.selectedWorkoutDays
          : getTrainingDayIndices(draft.workoutDaysCount);
        draft.selectedWorkoutDays = selectedDays;
        draft.workoutDaysCount = selectedDays.length;
        const availableSplits = getAvailableWorkoutSplits(selectedDays.length);
        if (!availableSplits.some(s => s.id === (draft.workoutSplitPreference || 'auto'))) {
          draft.workoutSplitPreference = 'auto';
        }
        const currentSplitPref = draft.workoutSplitPreference || 'auto';
        const selectedNames = selectedDays.map(i => WEEKDAYS_AR[Number(i)]?.name).filter(Boolean).join('، ');
        const insights = computeSmartOnboardingInsights(draft);
        const presets = [
          { label: '3 أيام (سبت · اثنين · أربعاء) ⭐', days: [0, 2, 4] },
          { label: '3 أيام (أحد · ثلاثاء · خميس)', days: [1, 3, 5] },
          { label: '4 أيام (سبت · أحد · ثلاثاء · أربعاء)', days: [0, 1, 3, 4] },
          { label: '5 أيام (سبت–أربعاء ماعدا الثلاثاء)', days: [0, 1, 3, 4, 5] }
        ];
        return `
          <div class="chat-multi-box">
            <p class="chat-days-helper">اضغط على الأيام اللي فاضي تتمرن فيها عشان تحدد جدولك بنفسك (من يوم لحد 7 أيام):</p>
            <div class="chat-weekdays-picker" role="group" aria-label="أيام الأسبوع للتمرين">
              ${WEEKDAYS_AR.map(wd => {
                const isSelected = selectedDays.includes(wd.index);
                return `
                  <button type="button" class="outline-btn chat-weekday-btn ${isSelected ? 'is-selected' : ''}" data-toggle-workout-day="${wd.index}" aria-pressed="${isSelected}">
                    <span class="weekday-check">${isSelected ? '✅' : '⬜'}</span>
                    <strong>${esc(wd.name)}</strong>
                    <small>${isSelected ? 'يوم تمرين 💪' : 'يوم راحة 🌿'}</small>
                  </button>
                `;
              }).join('')}
            </div>
            <div class="chat-days-presets">
              <span>اختيارات أيام سريعة:</span>
              ${presets.map(p => `
                <button type="button" class="outline-btn chat-preset-chip" data-preset-workout-days="${p.days.join(',')}">${esc(p.label)}</button>
              `).join('')}
            </div>
            <div class="chat-split-preview" role="status" aria-live="polite">
              <div class="chat-split-preview-head">
                💡 <strong>نظام تقسيمة العضلات (${esc(insights.splitPreview.name)}):</strong>
                <small>${esc(insights.splitPreview.desc)}</small>
              </div>
              <div class="chat-split-selector-chips" role="group" aria-label="نظام تقسيمة التمارين">
                ${availableSplits.map(sp => `
                  <button type="button" class="outline-btn chat-chip ${currentSplitPref === sp.id ? 'is-selected' : ''}" data-select-workout-split="${sp.id}">
                    ${esc(sp.label)}
                  </button>
                `).join('')}
              </div>
            </div>
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-workout-days">
              تأكيد الأيام والتقسيمة (${selectedDays.length} ${selectedDays.length === 1 ? 'يوم' : selectedDays.length === 2 ? 'يومين' : 'أيام'}: ${esc(selectedNames)} · ${esc(insights.splitPreview.name)}) ✅
            </button>
          </div>
        `;
      }
      case 'workout_location':
        return `
          <div class="chat-quick-replies">
            ${Object.values(WORKOUT_LOCATIONS).map(loc => `
              <button type="button" class="outline-btn chat-choice-btn ${draft.workoutLocation === loc.id ? 'is-selected' : ''}" data-chat-select="workoutLocation" data-val="${loc.id}">
                <strong>${esc(loc.label)}</strong>
                ${loc.desc ? `<small>${esc(loc.desc)}</small>` : ''}
              </button>
            `).join('')}
          </div>
        `;
      case 'workout_day_split': {
        const locs = buildDefaultDayLocations(draft.workoutDaysCount, 'home_and_gym', draft.dayLocations, draft.selectedWorkoutDays);
        draft.dayLocations = locs;
        return `
          <div class="chat-day-split-box">
            <div class="chat-day-split-grid">
              ${Object.entries(locs).map(([dayIdx, loc]) => `
                <div class="chat-day-split-row">
                  <strong>${esc(WEEKDAYS_AR[Number(dayIdx)].name)}</strong>
                  <div class="chat-day-toggle-group">
                    <button type="button" class="outline-btn ${loc === 'gym' ? 'is-selected' : ''}" data-day-loc="${dayIdx}" data-loc-val="gym">🏋️ جيم</button>
                    <button type="button" class="outline-btn ${loc === 'home' ? 'is-selected' : ''}" data-day-loc="${dayIdx}" data-loc-val="home">🏠 بيت</button>
                  </div>
                </div>
              `).join('')}
            </div>
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-day-split">تأكيد تقسيمة الأيام ✅</button>
          </div>
        `;
      }
      case 'home_equipment':
        return `
          <div class="chat-multi-box">
            <div class="chat-chips-grid">
              ${HOME_EQUIPMENT.map(item => `
                <button type="button" class="outline-btn chat-chip ${draft.homeEquipment.includes(item.id) ? 'is-selected' : ''}" data-multi-key="homeEquipment" data-item-id="${item.id}">${esc(item.label)}</button>
              `).join('')}
            </div>
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-multi" data-step="home_equipment">تأكيد الأدوات المتاحة (${draft.homeEquipment.length}) ✅</button>
          </div>
        `;
      case 'session_duration':
        return `
          <div class="chat-quick-replies">
            ${SESSION_DURATIONS.map(d => `
              <button type="button" class="outline-btn chat-choice-btn ${Number(draft.sessionDuration) === d.value ? 'is-selected' : ''}" data-chat-select="sessionDuration" data-val="${d.value}">
                <strong>${esc(d.label)}</strong>
                ${d.desc ? `<small>${esc(d.desc)}</small>` : ''}
              </button>
            `).join('')}
          </div>
        `;
      case 'injuries':
        return `
          <div class="chat-multi-box">
            <div class="chat-chips-grid">
              ${INJURIES.map(inj => `
                <button type="button" class="outline-btn chat-chip ${draft.injuries.includes(inj.id) ? 'is-selected' : ''}" data-multi-key="injuries" data-item-id="${inj.id}">${esc(inj.label)}</button>
              `).join('')}
            </div>
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-multi" data-step="injuries">تأكيد والمتابعة ✅</button>
          </div>
        `;
      case 'daily_activity':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn ${draft.dailyActivity === 'sedentary' ? 'is-selected' : ''}" data-chat-select="dailyActivity" data-val="sedentary">
              <strong>🪑 جلوس أغلب اليوم (شغل مكتبي / مذاكرة / قيادة)</strong>
              <small>حركة يومية قليلة وأقل من 4,000 خطوة يومياً بره وقت التمرين</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.dailyActivity === 'light' ? 'is-selected' : ''}" data-chat-select="dailyActivity" data-val="light">
              <strong>🚶 نشاط خفيف (مشاوير يومية / شغل منزلي خفيف)</strong>
              <small>تتحرك على رجلك فترات متقطعة (حوالي 4,000 إلى 7,500 خطوة يومياً)</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.dailyActivity === 'moderate' ? 'is-selected' : ''}" data-chat-select="dailyActivity" data-val="moderate">
              <strong>🏃 نشاط متوسط (حركة مستمرة / شغل واقف أو ميداني)</strong>
              <small>مثل المدرس، المهندس الميداني، الطبيب، أو البيع (7,500 إلى 10,000+ خطوة يومياً)</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.dailyActivity === 'active' ? 'is-selected' : ''}" data-chat-select="dailyActivity" data-val="active">
              <strong>🔥 نشاط بدني عالي (شغل يدوي شاق أو حركة طوال اليوم)</strong>
              <small>مجهود عضلي وحركي عالي ومستمر لساعات طويلة يومياً</small>
            </button>
          </div>
        `;
      case 'diseases':
        return `
          <div class="chat-multi-box">
            <div class="chat-chips-grid">
              ${CHRONIC_DISEASES.map(d => `
                <button type="button" class="outline-btn chat-chip ${draft.diseases.includes(d.id) ? 'is-selected' : ''}" data-multi-key="diseases" data-item-id="${d.id}">${esc(d.label)}</button>
              `).join('')}
            </div>
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-multi" data-step="diseases">تأكيد الحالة الصحية ✅</button>
          </div>
        `;
      case 'diet_type': {
        const tempProfile = {
          maternalStatus: draft.maternalStatus,
          diseases: draft.diseases.filter(x => x !== 'none')
        };
        const availableDiets = Object.entries(DIETS).filter(([k]) => !isDietUnsafeForProfile(k, tempProfile));
        return `
          <div class="chat-quick-replies">
            ${availableDiets.map(([k, label]) => {
              let badge = '';
              if (k === 'low_carb' && (draft.diseases.includes('insulin_resistance') || draft.diseases.includes('pcos') || draft.diseases.includes('diabetes'))) {
                badge = ' ⭐ موصى به لحالتك الصحية';
              } else if (k === 'dash' && draft.diseases.includes('hypertension')) {
                badge = ' ⭐ موصى به لضبط الضغط';
              } else if (k === 'mediterranean' && draft.diseases.includes('cholesterol')) {
                badge = ' ⭐ موصى به للكوليسترول والقلب';
              } else if (k === 'high_protein' && draft.goal === 'muscle_gain') {
                badge = ' ⭐ ممتاز لبناء العضل';
              } else if (k === 'balanced') {
                badge = ' ⭐ الأكثر مرونة وشعبية';
              }
              const userDesc = DIET_USER_DESCRIPTIONS[k] || FIXED_DIET_MEALS[k]?.label || '';
              return `
                <button type="button" class="outline-btn chat-choice-btn ${draft.dietType === k ? 'is-selected' : ''}" data-chat-select="dietType" data-val="${k}">
                  <strong>${esc(label)}${esc(badge)}</strong>
                  ${userDesc ? `<small>${esc(userDesc)}</small>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        `;
      }
      case 'if_start_hour':
        return `
          <div class="chat-quick-replies chat-days-grid">
            ${[
              ['09:00', '9:00 صباحاً', 'نافذة الأكل من 9 صباحاً حتى 5 مساءً (ممتاز لمن يستيقظ مبكراً)'],
              ['10:00', '10:00 صباحاً', 'نافذة الأكل من 10 صباحاً حتى 6 مساءً'],
              ['11:00', '11:00 صباحاً', 'نافذة الأكل من 11 صباحاً حتى 7 مساءً'],
              ['12:00', '12:00 ظهراً ⭐ (الأشهر)', 'نافذة الأكل من 12 ظهراً حتى 8 مساءً — سهلة ومناسبة لأغلب المواعيد'],
              ['13:00', '1:00 ظهراً', 'نافذة الأكل من 1 ظهراً حتى 9 مساءً'],
              ['14:00', '2:00 ظهراً', 'نافذة الأكل من 2 ظهراً حتى 10 مساءً (ممتاز لمن يسهر)'],
              ['15:00', '3:00 عصراً', 'نافذة الأكل من 3 عصراً حتى 11 مساءً']
            ].map(([val, title, desc]) => `
              <button type="button" class="outline-btn chat-choice-btn ${draft.eatingStart === val ? 'is-selected' : ''}" data-chat-select="eatingStart" data-val="${val}">
                <strong>⏰ ${esc(title)}</strong>
                <small>${esc(desc)}</small>
              </button>
            `).join('')}
          </div>
        `;
      case 'meals_count':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn ${Number(draft.mealsCount) === 2 ? 'is-selected' : ''}" data-chat-select="mealsCount" data-val="2">
              <strong>2️⃣ وجبتين كبار مشبعين (2 وجبات)</strong>
              <small>ممتاز لو يومك مشغول ومش بتحب تحضر أكل كتير</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${Number(draft.mealsCount) === 3 ? 'is-selected' : ''}" data-chat-select="mealsCount" data-val="3">
              <strong>3️⃣ 3 وجبات رئيسية (فطار + غداء + عشاء)</strong>
              <small>التقسيمة الكلاسيكية المريحة بدون سناك بين الوجبات</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${Number(draft.mealsCount) === 4 ? 'is-selected' : ''}" data-chat-select="mealsCount" data-val="4">
              <strong>4️⃣ 3 وجبات رئيسية + سناك (موصى به ⭐)</strong>
              <small>أفضل توازن يمنع الجوع بين الغداء والعشاء ويحافظ على ثبات الطاقة</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${Number(draft.mealsCount) === 5 ? 'is-selected' : ''}" data-chat-select="mealsCount" data-val="5">
              <strong>5️⃣ 3 وجبات رئيسية + 2 سناك (5 وجبات)</strong>
              <small>ممتاز لزيادة الوزن وبناء العضل أو لمن يفضل وجبات أصغر على مدار اليوم</small>
            </button>
          </div>
        `;
      case 'budget':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn ${draft.budget === 'low' ? 'is-selected' : ''}" data-chat-select="budget" data-val="low">
              <strong>🪙 اقتصادية وشعبية (أكل البيت المتوفر)</strong>
              <small>فول، بيض، جبنة قريش، عدس، كشري، بطاطس، صدور فراخ، وسمك بلطي — بتحقق كامل البروتين بأقل تكلفة</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.budget === 'medium' ? 'is-selected' : ''}" data-chat-select="budget" data-val="medium">
              <strong>⚖️ متوسطة ومتوازنة (موصى به ⭐)</strong>
              <small>تنوع يومي بين الفراخ، اللحمة البلدي، الأسماك، التونة، الشوفان، والزبادي اليوناني</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.budget === 'high' ? 'is-selected' : ''}" data-chat-select="budget" data-val="high">
              <strong>✨ مفتوحة ومتنوعة (شاملة الأصناف الفاخرة)</strong>
              <small>تضيف السلمون، الجمبري، الستيك، المكسرات المشكلة، والأفوكادو لجدولك</small>
            </button>
          </div>
        `;
      case 'exclusions':
        return `
          <div class="chat-multi-box">
            <div class="chat-chips-grid">
              ${QUICK_EXCLUSION_CHIPS.map(c => `
                <button type="button" class="outline-btn chat-chip ${draft.excludedGroups.includes(c.id) ? 'is-selected' : ''}" data-multi-key="excludedGroups" data-item-id="${c.id}">${esc(c.label)}</button>
              `).join('')}
            </div>
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-multi" data-step="exclusions">اعرض ملخص خطتي الرقمية النهائية 🎯</button>
          </div>
        `;
      case 'summary':
        return renderSummaryCard();
      default:
        return '';
    }
  }

  function renderSummaryCard() {
    const fixedMeals = FIXED_DIET_MEALS[draft.dietType];
    const finalMeals = fixedMeals ? fixedMeals.meals : Number(draft.mealsCount) || 4;
    const locs = buildDefaultDayLocations(draft.workoutDaysCount, draft.workoutLocation, draft.dayLocations, draft.selectedWorkoutDays);
    const idealRange = getIdealWeightRange(draft.height);
    const evalTarget = draft.targetWeight ? evaluateTargetWeightBmi(draft.height, draft.targetWeight) : null;
    const insights = computeSmartOnboardingInsights(draft);
    const showPaceRow = draft.goal === 'lose' || draft.goal === 'gain';

    return `
      <div class="onboarding-summary-card">
        <div class="summary-header">
          <div>
            <span class="eyebrow">بطاقة المراجعة النهائية (US-08)</span>
            <h3>خطة الكوتش الذكي لـ ${esc(draft.name || 'بطل')} 🌟</h3>
          </div>
          <div class="summary-region-picker">
            <label>منطقتك وأكلك:
              <select id="summary-region-select" aria-label="منطقتك">
                ${Object.entries(REGIONS).map(([k, label]) => `<option value="${k}" ${draft.region === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>

        ${insights.needs ? `
          <div class="summary-insights-banner">
            <div class="summary-insights-head">
              <strong>📊 الخطة الرقمية المحسوبة لجسمك (معاينة فورية من بياناتك)</strong>
              <small>ثباتك الحالي (TDEE): ${insights.needs.tdee} سعرة · الحرق الأساسي (REE): ${insights.needs.ree} سعرة</small>
            </div>
            <div class="summary-insights-grid">
              <div class="summary-insight-pill">
                <span>🎯 السعرات اليومية</span>
                <strong>${insights.needs.energy} سعرة</strong>
                <small>${insights.needs.energy < insights.needs.tdee ? `عجز ${insights.needs.tdee - insights.needs.energy} سعرة لحرق الدهون` : insights.needs.energy > insights.needs.tdee ? `فائض +${insights.needs.energy - insights.needs.tdee} سعرة للبناء والزيادة` : 'سعرات تثبيت متوازنة'}</small>
              </div>
              <div class="summary-insight-pill">
                <span>🥩 البروتين اليومي</span>
                <strong>${insights.needs.protein} جم</strong>
                <small>لبناء وحماية العضلات والشبع</small>
              </div>
              <div class="summary-insight-pill">
                <span>🍚 الكارب والدهون</span>
                <strong>${insights.needs.carbs} جم كارب · ${insights.needs.fat} جم دهون</strong>
                <small>طاقة متوازنة وتوازن هرموني</small>
              </div>
              <div class="summary-insight-pill">
                <span>💧 احتياج المية اليومي</span>
                <strong>${insights.waterLiters} لتر (~${insights.waterCups} أكواب)</strong>
                <small>محسوب لوزنك ونشاطك</small>
              </div>
              ${showPaceRow && draft.targetWeight ? `
                <div class="summary-insight-pill">
                  <span>⏱️ المدة المتوقعة للهدف</span>
                  <strong>${esc(insights.chosenPace.durationText)}</strong>
                  <small>للوصول لـ ${esc(draft.targetWeight)} كجم بمعدل ~${insights.chosenPace.rateKg} كجم/أسبوع</small>
                </div>
              ` : ''}
              ${draft.serviceTrack !== 'nutrition_only' ? `
                <div class="summary-insight-pill">
                  <span>🏋️ تقسيمة التمارين</span>
                  <strong>${esc(insights.splitPreview.name)}</strong>
                  <small>${Object.keys(locs).length} أيام أسبوعياً</small>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <div class="summary-sections-grid">
          <div class="summary-box">
            <div class="summary-box-head">
              <h4>👤 بيانات جسمك وهدفك</h4>
              <button type="button" class="outline-btn summary-edit-btn" data-chat-jump="age">✏️ تعديل</button>
            </div>
            <p><strong>العمر والنوع:</strong> ${esc(draft.age)} سنة · ${draft.sex === 'female' ? 'أنثى' : 'ذكر'}${draft.maternalStatus !== 'none' ? ` (${esc(getStepMeta('maternal').answer)})` : ''}</p>
            <p><strong>الطول والوزن:</strong> ${esc(draft.height)} سم · ${esc(draft.weight)} كجم${draft.targetWeight ? ` ← المستهدف: ${esc(draft.targetWeight)} كجم${evalTarget ? ` (BMI ${evalTarget.targetBmi})` : ''}` : ''}</p>
            ${idealRange ? `<p><small>📏 المدى الصحي لطولك: ${idealRange.minWeight} – ${idealRange.maxWeight} كجم</small></p>` : ''}
            <p><strong>الهدف والمسار:</strong> ${esc(GOALS[draft.goal])}${showPaceRow ? ` (${esc(insights.chosenPace.durationText)})` : ''} · ${esc(getStepMeta('service_track').answer)}</p>
          </div>

          ${draft.serviceTrack !== 'nutrition_only' ? `
            <div class="summary-box">
              <div class="summary-box-head">
                <h4>💪 جدول التمارين (${Object.keys(locs).length} أيام/أسبوع)</h4>
                <button type="button" class="outline-btn summary-edit-btn" data-chat-jump="workout_days">📅 تعديل الأيام</button>
              </div>
              <p><strong>المستوى والمدة:</strong> ${esc(FITNESS_LEVELS[draft.fitnessLevel]?.shortLabel)} · ${draft.sessionDuration} دقيقة للحصة</p>
              <p><strong>المكان:</strong> ${esc(WORKOUT_LOCATIONS[draft.workoutLocation]?.shortLabel)}</p>
              <div class="summary-days-pills">
                ${Object.entries(locs).map(([idx, loc]) => `
                  <button type="button" class="summary-day-pill" data-summary-toggle-day="${idx}" title="اضغط للتبديل بين البيت والجيم">
                    ${esc(WEEKDAYS_AR[Number(idx)].name)}: ${loc === 'home' ? '🏠 بيت' : '🏋️ جيم'}
                  </button>
                `).join('')}
              </div>
              <p><strong>الإصابات المراعاة:</strong> ${esc(getStepMeta('injuries').answer)}</p>
            </div>
          ` : ''}

          ${draft.serviceTrack !== 'workouts_only' ? `
            <div class="summary-box">
              <div class="summary-box-head">
                <h4>🥗 النظام الغذائي (${esc(REGION_FLAGS[draft.region])})</h4>
                <button type="button" class="outline-btn summary-edit-btn" data-chat-jump="diet_type">✏️ تعديل</button>
              </div>
              <p><strong>النظام:</strong> ${esc(DIETS[draft.dietType])}</p>
              <p><strong>تقسيمة الوجبات:</strong> ${fixedMeals ? esc(fixedMeals.label) : `${finalMeals} وجبات يومياً`}${draft.dietType === 'intermittent_fasting' ? ` (تبدأ ${esc(draft.eatingStart)})` : ''}</p>
              <p><strong>الحالة الصحية:</strong> ${esc(getStepMeta('diseases').answer)}</p>
              <p><strong>الميزانية والاستبعادات:</strong> ${ { low: 'اقتصادية', medium: 'متوسطة', high: 'مفتوحة' }[draft.budget] } · ${esc(getStepMeta('exclusions').answer)}</p>
            </div>
          ` : ''}
        </div>

        <div class="summary-actions">
          <button type="button" class="primary-btn plan-primary summary-launch-btn" id="onboarding-launch-btn" data-chat-action="finish-onboarding">
            🚀 اعتمد الخطة وابدأ رحلتك الآن!
          </button>
        </div>
      </div>
    `;
  }

  function render() {
    const steps = getActiveSteps(draft, hasExisting, forceFresh);
    if (!steps.includes(currentStepId)) {
      currentStepId = steps[steps.length - 1];
    }
    const currentIdx = steps.indexOf(currentStepId);
    const historySteps = steps.slice(0, currentIdx);
    const currentMeta = getStepMeta(currentStepId);
    const progressPct = Math.max(8, Math.round(((currentIdx + 1) / steps.length) * 100));

    container.innerHTML = `
      <div class="coach-onboarding-shell">
        <header class="coach-chat-header">
          <div class="coach-avatar-wrap">
            <span class="coach-avatar" aria-hidden="true">🤖</span>
            <div>
              <h2>كوتش التغذية والتمارين الذكي</h2>
              <p>تخصيص دقيق لأكل ${esc(REGION_FLAGS[draft.region] || 'الشرق الأوسط')} · خطوة ${currentIdx + 1} من ${steps.length}</p>
            </div>
          </div>
          <div class="coach-header-actions">
            ${currentIdx > 0 ? `<button type="button" class="outline-btn coach-back-btn" data-chat-action="back">↩️ رجوع / تعديل</button>` : ''}
          </div>
        </header>

        <div class="coach-progress-bar" role="progressbar" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100">
          <div class="coach-progress-fill" style="width:${progressPct}%"></div>
        </div>

        <div class="coach-chat-stream" id="coach-chat-stream">
          ${historySteps.map(sid => {
            const m = getStepMeta(sid);
            return `
              <div class="chat-turn is-past">
                <div class="chat-bubble bot-bubble">${m.bot}</div>
                ${m.answer ? `
                  <div class="chat-bubble user-bubble" data-chat-jump="${sid}" title="اضغط لتعديل الإجابة">
                    <span>${esc(m.answer)}</span>
                    <small class="edit-pill">✎</small>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}

          <div class="chat-turn is-current">
            <div class="chat-bubble bot-bubble">${currentMeta.bot}</div>
          </div>
        </div>

        <div class="coach-sticky-controls">
          ${errorMsg ? `<div class="chat-error-banner" role="alert">⚠️ ${esc(errorMsg)}</div>` : ''}
          ${renderControlsForStep(currentStepId)}
        </div>
      </div>
    `;

    const stream = container.querySelector('#coach-chat-stream');
    if (stream) {
      stream.scrollTop = stream.scrollHeight;
    }
    const textInput = container.querySelector('.chat-input-row input');
    if (textInput) {
      textInput.focus();
    }
  }

  function submitCurrentInput() {
    if (currentStepId === 'name') {
      const val = container.querySelector('#chat-input-name')?.value?.trim() || '';
      if (val.length < 2) {
        errorMsg = 'اكتب اسمك الأول (حرفين على الأقل) عشان نكمل يا بطل!';
        render();
        return;
      }
      draft.name = val;
      advanceFrom('name');
      return;
    }
    if (currentStepId === 'age') {
      const val = Number(container.querySelector('#chat-input-age')?.value);
      if (!Number.isInteger(val) || val < 10 || val > 95) {
        errorMsg = 'من فضلك اكتب عمر صحيح بالسنوات.';
        render();
        return;
      }
      draft.age = val;
      advanceFrom('age');
      return;
    }
    if (currentStepId === 'height') {
      const val = Number(container.querySelector('#chat-input-height')?.value);
      if (!Number.isFinite(val) || val < 120 || val > 230) {
        errorMsg = 'من فضلك أدخل طول صحيح بين 120 و 230 سم.';
        render();
        return;
      }
      draft.height = val;
      advanceFrom('height');
      return;
    }
    if (currentStepId === 'weight') {
      const val = Number(container.querySelector('#chat-input-weight')?.value);
      if (!Number.isFinite(val) || val < 35 || val > 250) {
        errorMsg = 'من فضلك أدخل وزن صحيح بين 35 و 250 كجم.';
        render();
        return;
      }
      draft.weight = val;
      advanceFrom('weight');
      return;
    }
    if (currentStepId === 'target_weight') {
      const val = Number(container.querySelector('#chat-input-target-weight')?.value);
      const currentW = Number(draft.weight);
      if (!Number.isFinite(val) || val < 35 || val > 250) {
        errorMsg = 'من فضلك أدخل وزن مستهدف بين 35 و 250 كجم.';
        render();
        return;
      }
      if (draft.goal === 'lose' && val >= currentW) {
        errorMsg = `أنت اخترت هدف "خسارة دهون"، فلازم الوزن المستهدف يكون أقل من وزنك الحالي (${currentW} كجم)!`;
        render();
        return;
      }
      if (draft.goal === 'gain' && val <= currentW) {
        errorMsg = `أنت اخترت هدف "زيادة الوزن"، فلازم الوزن المستهدف يكون أعلى من وزنك الحالي (${currentW} كجم)!`;
        render();
        return;
      }
      if (draft.goal === 'muscle_gain' && val < currentW) {
        errorMsg = `بناء العضلات بيعتمد على فائض سعرات، فاختار وزن مستهدف مساوي أو أعلى من وزنك الحالي (${currentW} كجم) — ولو هدفك تنزيل الوزن مع الحفاظ على العضل، اضغط على هدفك فوق واختار «خسارة دهون وتخسيس»!`;
        render();
        return;
      }
      draft.targetWeight = val;
      const evalBmi = evaluateTargetWeightBmi(draft.height, val);
      if (evalBmi?.isOutOfRange && bmiWarningPendingFor !== val) {
        bmiWarningPendingFor = val;
        errorMsg = `تنبيه صحي: الوزن المستهدف (${val} كجم · BMI ${evalBmi.targetBmi}) خارج المدى المثالي لطولك (${evalBmi.minWeight} – ${evalBmi.maxWeight} كجم). يمكنك اعتماد الوزن الصحي المقترح أو تأكيد المتابعة بالأسفل.`;
        render();
        return;
      }
      bmiWarningPendingFor = null;
      advanceFrom('target_weight');
    }
  }

  container.addEventListener('input', e => {
    if (e.target.id === 'chat-input-target-weight') {
      const val = Number(e.target.value);
      const liveEl = container.querySelector('#chat-target-bmi-live');
      if (!liveEl) return;
      const evalBmi = evaluateTargetWeightBmi(draft.height, val);
      if (!evalBmi) {
        liveEl.textContent = '';
        return;
      }
      liveEl.className = `chat-bmi-live ${evalBmi.isOutOfRange ? 'is-warning' : 'is-healthy'}`;
      liveEl.innerHTML = evalBmi.isOutOfRange
        ? `⚠️ <strong>تحذير مؤشر كتلة الجسم (BMI ${evalBmi.targetBmi}):</strong> ${esc(evalBmi.warningText)}`
        : `✅ <strong>مدى صحي مثالي (BMI ${evalBmi.targetBmi}):</strong> الوزن المختار (${evalBmi.targetWeight} كجم) يقع داخل المدى الصحي المثالي لطولك (${evalBmi.minWeight} – ${evalBmi.maxWeight} كجم).`;
    }
  });

  container.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.chat-input-row input')) {
      e.preventDefault();
      submitCurrentInput();
    }
  });

  container.addEventListener('change', e => {
    if (e.target.id === 'summary-region-select') {
      draft.region = e.target.value;
      render();
    }
  });

  container.addEventListener('click', e => {
    const btn = e.target.closest('button,[data-chat-jump]');
    if (!btn) return;

    if (btn.dataset.chatJump) {
      bmiWarningPendingFor = null;
      jumpToStep(btn.dataset.chatJump);
      return;
    }

    if (btn.dataset.quickNumField && btn.dataset.quickNumVal != null) {
      const field = btn.dataset.quickNumField;
      const val = Number(btn.dataset.quickNumVal);
      if (Number.isFinite(val)) {
        draft[field] = val;
        errorMsg = '';
        advanceFrom(currentStepId);
      }
      return;
    }

    if (btn.dataset.fillTargetWeight != null) {
      const val = Number(btn.dataset.fillTargetWeight);
      if (Number.isFinite(val)) {
        draft.targetWeight = val;
        bmiWarningPendingFor = null;
        errorMsg = '';
        render();
      }
      return;
    }

    if (btn.dataset.toggleWorkoutDay != null) {
      const dayIdx = Number(btn.dataset.toggleWorkoutDay);
      const current = new Set(Array.isArray(draft.selectedWorkoutDays) ? draft.selectedWorkoutDays : [0, 2, 4]);
      if (current.has(dayIdx)) {
        if (current.size <= 1) {
          errorMsg = 'لازم تختار يوم واحد على الأقل للتمرين في الأسبوع يا بطل!';
          render();
          return;
        }
        current.delete(dayIdx);
      } else {
        current.add(dayIdx);
      }
      errorMsg = '';
      draft.selectedWorkoutDays = [...current].sort((a, b) => a - b);
      draft.workoutDaysCount = draft.selectedWorkoutDays.length;
      draft.dayLocations = buildDefaultDayLocations(draft.workoutDaysCount, draft.workoutLocation, draft.dayLocations, draft.selectedWorkoutDays);
      render();
      return;
    }

    if (btn.dataset.presetWorkoutDays != null) {
      const days = btn.dataset.presetWorkoutDays
        .split(',')
        .map(Number)
        .filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
      if (days.length) {
        errorMsg = '';
        draft.selectedWorkoutDays = [...new Set(days)].sort((a, b) => a - b);
        draft.workoutDaysCount = draft.selectedWorkoutDays.length;
        draft.dayLocations = buildDefaultDayLocations(draft.workoutDaysCount, draft.workoutLocation, draft.dayLocations, draft.selectedWorkoutDays);
        render();
      }
      return;
    }

    if (btn.dataset.selectWorkoutSplit != null) {
      const spId = btn.dataset.selectWorkoutSplit;
      if (WORKOUT_SPLITS[spId]) {
        errorMsg = '';
        draft.workoutSplitPreference = spId;
        render();
      }
      return;
    }

    const action = btn.dataset.chatAction;
    if (action === 'back') {
      bmiWarningPendingFor = null;
      goBack();
      return;
    }
    if (action === 'restore-existing') {
      onRestoreExisting();
      return;
    }
    if (action === 'start-fresh') {
      forceFresh = true;
      bmiWarningPendingFor = null;
      currentStepId = 'name';
      render();
      return;
    }
    if (action === 'accept-healthy-weight') {
      const healthyVal = Number(btn.dataset.healthyVal);
      if (Number.isFinite(healthyVal)) {
        draft.targetWeight = healthyVal;
      }
      bmiWarningPendingFor = null;
      advanceFrom('target_weight');
      return;
    }
    if (action === 'force-target-weight') {
      const val = Number(container.querySelector('#chat-input-target-weight')?.value || draft.targetWeight);
      if (Number.isFinite(val)) {
        draft.targetWeight = val;
      }
      bmiWarningPendingFor = null;
      advanceFrom('target_weight');
      return;
    }
    if (action === 'confirm-workout-days') {
      if (!Array.isArray(draft.selectedWorkoutDays) || !draft.selectedWorkoutDays.length) {
        errorMsg = 'اختار يوم واحد على الأقل للتمرين في الأسبوع!';
        render();
        return;
      }
      draft.workoutDaysCount = draft.selectedWorkoutDays.length;
      draft.dayLocations = buildDefaultDayLocations(draft.workoutDaysCount, draft.workoutLocation, draft.dayLocations, draft.selectedWorkoutDays);
      advanceFrom('workout_days');
      return;
    }
    if (action?.startsWith('submit-')) {
      submitCurrentInput();
      return;
    }
    if (action === 'confirm-day-split') {
      advanceFrom('workout_day_split');
      return;
    }
    if (action === 'confirm-multi') {
      advanceFrom(btn.dataset.step);
      return;
    }
    if (action === 'finish-onboarding') {
      onCompleteOnboarding(draft);
      return;
    }

    if (btn.dataset.chatSelect) {
      const key = btn.dataset.chatSelect;
      const val = btn.dataset.val;
      draft[key] = ['workoutDaysCount', 'sessionDuration', 'mealsCount'].includes(key) ? Number(val) : val;
      if (key === 'maternalStatus' && val.startsWith('pregnant') && draft.goal === 'lose') {
        draft.goal = 'maintain';
      }
      if (key === 'workoutDaysCount') {
        draft.selectedWorkoutDays = getTrainingDayIndices(draft.workoutDaysCount);
        draft.dayLocations = buildDefaultDayLocations(draft.workoutDaysCount, draft.workoutLocation, null, draft.selectedWorkoutDays);
      }
      if (key === 'workoutLocation') {
        draft.dayLocations = buildDefaultDayLocations(draft.workoutDaysCount, draft.workoutLocation, draft.dayLocations, draft.selectedWorkoutDays);
      }
      if (key === 'dietType' && FIXED_DIET_MEALS[val]) {
        draft.mealsCount = FIXED_DIET_MEALS[val].meals;
      }
      advanceFrom(currentStepId);
      return;
    }

    if (btn.dataset.dayLoc != null) {
      const idx = Number(btn.dataset.dayLoc);
      const locVal = btn.dataset.locVal;
      const locs = buildDefaultDayLocations(draft.workoutDaysCount, 'home_and_gym', draft.dayLocations, draft.selectedWorkoutDays);
      locs[idx] = locVal;
      draft.dayLocations = locs;
      render();
      return;
    }

    if (btn.dataset.summaryToggleDay != null) {
      const idx = Number(btn.dataset.summaryToggleDay);
      const locs = buildDefaultDayLocations(draft.workoutDaysCount, draft.workoutLocation, draft.dayLocations, draft.selectedWorkoutDays);
      locs[idx] = locs[idx] === 'home' ? 'gym' : 'home';
      draft.workoutLocation = 'home_and_gym';
      draft.dayLocations = locs;
      render();
      return;
    }

    if (btn.dataset.multiKey) {
      toggleMultiSelect(btn.dataset.multiKey, btn.dataset.itemId);
    }
  });

  render();

  return {
    refresh(newState, openFresh = false) {
      state = newState;
      hasExisting = Boolean(state?.plans?.length || state?.profile || state?.workoutPlan);
      forceFresh = openFresh;
      draft = createInitialOnboardingDraft(state);
      currentStepId = hasExisting && !openFresh ? 'welcome_existing' : 'name';
      render();
    }
  };
}
