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
  { id: 'none', label: 'لا يوجد الحمد لله ✅', isNone: true },
  { id: 'insulin_resistance', label: 'مقاومة إنسولين 🩸' },
  { id: 'diabetes', label: 'سكري 🩺' },
  { id: 'hypertension', label: 'ضغط مرتفع ❤️‍🩹' },
  { id: 'hypothyroidism', label: 'خمول غدة 🦋' },
  { id: 'hyperthyroidism', label: 'نشاط غدة ⚡' },
  { id: 'pcos', label: 'تكيس مبايض 🌸' },
  { id: 'cholesterol', label: 'كوليسترول 🫀' },
  { id: 'gout', label: 'نقرس وأملاح 🦶' },
  { id: 'ibs', label: 'قولون عصبي 🌿' },
  { id: 'anemia', label: 'أنيميا 🥩' },
  { id: 'vitamin_d_calcium', label: 'نقص فيتامين د ☀️' }
];

export const QUICK_EXCLUSION_CHIPS = [
  { id: 'none', label: 'باكل كل حاجة ✅', isNone: true },
  { id: 'fish', label: 'السمك', proteinUncheck: null },
  { id: 'shellfish', label: 'الجمبري والسي فود', proteinUncheck: null },
  { id: 'dairy', label: 'الألبان والجبن', proteinUncheck: 'dairy' },
  { id: 'eggs', label: 'البيض', proteinUncheck: 'eggs' },
  { id: 'chicken', label: 'الفراخ', proteinUncheck: 'chicken' },
  { id: 'beef', label: 'اللحوم الحمراء', proteinUncheck: 'meat' },
  { id: 'beans', label: 'الفول والبقوليات', proteinUncheck: null },
  { id: 'peanuts', label: 'الفول السوداني', proteinUncheck: null },
  { id: 'tree_nuts', label: 'المكسرات', proteinUncheck: null },
  { id: 'onion', label: 'البصل', proteinUncheck: null },
  { id: 'garlic', label: 'الثوم', proteinUncheck: null },
  { id: 'tomato', label: 'الطماطم', proteinUncheck: null },
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
  balanced: 'أكل البيت الطبيعي بكميات محسوبة · تختار عدد وجباتك',
  low_carb: 'تقليل النشويات والتركيز على البروتين · 3 وجبات مشبعة',
  high_protein: 'بروتين أعلى لبناء العضل والشبع · 3 وجبات + سناك',
  intermittent_fasting: 'صيام 16 ساعة وأكل في 8 ساعات · وجبتين + سناك',
  keto: 'منع النشويات والسكريات (<50 جم كارب) · 3 وجبات كيتو',
  mediterranean: 'صحي للقلب (سمك وزيت زيتون وخضار) · 3 وجبات + سناك',
  dash: 'قليل الملح لضبط ضغط الدم · 3 وجبات + سناك',
  vegetarian: 'بدون لحوم أو فراخ أو سمك (بيض وألبان وبقوليات)',
  vegan: 'نباتي صيامي 100% من البقوليات والحبوب والمكسرات'
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
        title: `🐢 هادي ومريح (~${rates.slow} كجم/أسبوع)`,
        desc: isGain
          ? `⏱️ توصل في ${formatDuration(rates.slow)} · كميات مريحة للمعدة`
          : `⏱️ توصل في ${formatDuration(rates.slow)} · مرونة عالية بدون جوع`
      },
      {
        id: 'moderate',
        rateKg: rates.moderate,
        durationText: formatDuration(rates.moderate),
        title: `⚡ متوازن ومثالي ⭐ (~${rates.moderate} كجم/أسبوع)`,
        desc: isGain
          ? `⏱️ توصل في ${formatDuration(rates.moderate)} · زيادة صافية بدون دهون`
          : `⏱️ توصل في ${formatDuration(rates.moderate)} · أفضل توازن لحرق الدهون وحفظ العضل`
      },
      {
        id: 'fast',
        rateKg: rates.fast,
        durationText: formatDuration(rates.fast),
        title: `🚀 سريع ومكثف (~${rates.fast} كجم/أسبوع)`,
        desc: isGain
          ? `⏱️ توصل في ${formatDuration(rates.fast)} · وجبات مكثفة لنتيجة أسرع`
          : `⏱️ توصل في ${formatDuration(rates.fast)} · التزام أعلى لنتيجة أسرع`
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

  const effectiveSplitId = resolveWorkoutSplit(
    draft.workoutSplitPreference || 'auto',
    trainingDays,
    draft.workoutLocation || 'gym_only'
  );
  const splitObj = WORKOUT_SPLITS[effectiveSplitId] || WORKOUT_SPLITS.full_body;
  const splitPreview = {
    id: effectiveSplitId,
    preference: draft.workoutLocation === 'home_only' ? 'auto' : draft.workoutSplitPreference || 'auto',
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
    workoutLocation: wp.workoutLocation || 'gym_only',
    selectedWorkoutDays: initialSelectedDays,
    workoutDaysCount: initialSelectedDays.length || 3,
    workoutSplitPreference: wp.workoutSplitPreference || 'auto',
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
    steps.push('fitness_level', 'workout_location', 'workout_days');
    if (draft.workoutLocation === 'home_and_gym') {
      steps.push('workout_day_split');
    }
    if (draft.workoutLocation === 'home_only' || draft.workoutLocation === 'home_and_gym') {
      steps.push('home_equipment');
    }
    const daysCount =
      Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
        ? draft.selectedWorkoutDays.length
        : Number(draft.workoutDaysCount) || 3;
    if (draft.workoutLocation !== 'home_only' && daysCount >= 3) {
      steps.push('workout_split');
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
          bot: `أهلاً بيك من تاني يا ${esc(state?.profile?.name || 'بطل')}! 👋 تحب نكمل على خطتك المحفوظة ولا نبدأ من جديد؟`,
          answer: null
        };
      case 'name':
        return {
          bot: `أهلاً بيك يا بطل! 🌟 أنا الكوتش الذكي بتاعك.. تحب أناديك بإيه؟`,
          answer: draft.name ? `اسمي ${draft.name}` : null
        };
      case 'age':
        return {
          bot: `عاشت الأسامي يا ${esc(userName)} ❤️ عندك كام سنة؟`,
          answer: draft.age ? `${draft.age} سنة${Number(draft.age) > 70 ? ' (وضع كبار السن 🛡️)' : ''}` : null
        };
      case 'underage_gate':
        return {
          bot: `يا ${esc(userName)}، عشان سنك أقل من 18 سنة (${esc(draft.age)} سنة)، جسمك في مرحلة نمو ومحتاج متابعة دكتور تغذية مباشرة. تقدر تعدل السن لو كتبته بالخطأ! 🌱`,
          answer: null
        };
      case 'sex':
        return {
          bot: `${Number(draft.age) > 70 ? 'ربنا يديك الصحة! هنراعي تمارين آمنة للمفاصل. ' : ''}نوعك إيه يا ${esc(userName)}؟`,
          answer: draft.sex === 'female' ? '👩 أنثى' : '👨 ذكر'
        };
      case 'maternal':
        return {
          bot: `هل في حمل أو رضاعة حالياً؟`,
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
          bot: `طولك كام سنتيمتر؟ 📏`,
          answer: draft.height ? `${draft.height} سم` : null
        };
      case 'weight':
        return {
          bot: `ووزنك الحالي كام كيلو؟ ⚖️`,
          answer: draft.weight ? `${draft.weight} كجم` : null
        };
      case 'goal': {
        const bmi = draft.weight && draft.height ? (Number(draft.weight) / ((Number(draft.height) / 100) ** 2)).toFixed(1) : null;
        const range = getIdealWeightRange(draft.height);
        const bmiHint = bmi && range
          ? ` (مؤشر كتلتك ${bmi} · المدى الصحي لطولك ${range.minWeight}–${range.maxWeight} كجم)`
          : '';
        return {
          bot: `إيه هدفك الأساسي؟ 🎯${bmiHint}`,
          answer: GOALS[draft.goal] || draft.goal
        };
      }
      case 'target_weight': {
        const range = getIdealWeightRange(draft.height);
        const rangeHint = range
          ? ` · المدى الصحي لطولك: ${range.minWeight}–${range.maxWeight} كجم`
          : '';
        const evalTarget = draft.targetWeight ? evaluateTargetWeightBmi(draft.height, draft.targetWeight) : null;
        return {
          bot: `جميل جداً! نفسك توصل لوزن كام كيلو؟ 🎯 (وزنك ${esc(draft.weight)} كجم${rangeHint})`,
          answer: draft.targetWeight
            ? `${draft.targetWeight} كجم${evalTarget ? ` (BMI ${evalTarget.targetBmi}${evalTarget.isOutOfRange ? ' · خارج المدى' : ' ✅'})` : ''}`
            : null
        };
      }
      case 'goal_pace': {
        const paceDetails = getGoalPaceDetails(draft);
        const chosen = paceDetails.options.find(o => o.id === draft.goalPace) || paceDetails.options[1];
        const actionWord = draft.goal === 'gain' ? 'تزيد' : 'تنزل';
        return {
          bot: `تحب ${actionWord} بأي سرعة أسبوعية؟ ⏱️ (الفرق ${paceDetails.diffKg} كجم عن هدفك)`,
          answer: `${chosen.title} (${chosen.durationText})`
        };
      }
      case 'service_track':
        return {
          bot: `تحب أجهزلك إيه في خطتك الأسبوعية؟`,
          answer: {
            nutrition_and_workouts: '🔥 تغذية + تمارين مع بعض',
            nutrition_only: '🥗 نظام غذائي بس',
            workouts_only: '💪 جدول تمارين بس'
          }[draft.serviceTrack]
        };
      case 'fitness_level':
        return {
          bot: `يلا نظبط التمارين! 💪 مستواك الرياضي الحالي إيه؟`,
          answer: FITNESS_LEVELS[draft.fitnessLevel]?.label
        };
      case 'workout_location':
        return {
          bot: `تحب تتمرن فين؟ 🏋️🏠`,
          answer: WORKOUT_LOCATIONS[draft.workoutLocation]?.label
        };
      case 'workout_days': {
        const selectedDays = Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
          ? draft.selectedWorkoutDays
          : getTrainingDayIndices(draft.workoutDaysCount);
        const dayNames = selectedDays.map(i => WEEKDAYS_AR[Number(i)]?.name).filter(Boolean).join('، ');
        return {
          bot: `اختار أيام الأسبوع اللي فاضي تتمرن فيها 📅:`,
          answer: `${selectedDays.length} ${selectedDays.length === 1 ? 'يوم' : selectedDays.length === 2 ? 'يومين' : 'أيام'} (${dayNames})`
        };
      }
      case 'workout_day_split': {
        const locs = buildDefaultDayLocations(draft.workoutDaysCount, 'home_and_gym', draft.dayLocations, draft.selectedWorkoutDays);
        const summary = Object.entries(locs)
          .map(([idx, loc]) => `${WEEKDAYS_AR[Number(idx)].name}: ${loc === 'home' ? '🏠 بيت' : '🏋️ جيم'}`)
          .join(' · ');
        return {
          bot: `حدد لكل يوم تحب تتمرنه في البيت 🏠 ولا في الجيم 🏋️:`,
          answer: summary
        };
      }
      case 'home_equipment': {
        const labels = draft.homeEquipment
          .map(id => HOME_EQUIPMENT.find(e => e.id === id)?.label || id)
          .join('، ');
        return {
          bot: `إيه الأدوات المتاحة عندك في البيت؟ 🏠`,
          answer: labels
        };
      }
      case 'workout_split': {
        const selectedDays = Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
          ? draft.selectedWorkoutDays
          : getTrainingDayIndices(draft.workoutDaysCount);
        const effectiveSplit = resolveWorkoutSplit(draft.workoutSplitPreference || 'auto', selectedDays.length, draft.workoutLocation);
        const splitLabel = WORKOUT_SPLITS[effectiveSplit]?.shortLabel || 'Full Body';
        return {
          bot: `تحب نمشي على أي نظام تقسيمة عضلات في الجيم؟ 🎯`,
          answer: draft.workoutSplitPreference === 'auto' ? `🤖 تلقائي ذكي (${splitLabel})` : splitLabel
        };
      }
      case 'session_duration':
        return {
          bot: `وقت التمرينة الواحدة قد إيه؟ ⏱️`,
          answer: `${draft.sessionDuration} دقيقة`
        };
      case 'injuries': {
        const labels = draft.injuries
          .map(id => INJURIES.find(i => i.id === id)?.label || id)
          .join('، ');
        return {
          bot: `عندك أي ألم أو إصابة حالياً نراعيها في التمارين؟ ❤️‍🩹`,
          answer: labels
        };
      }
      case 'daily_activity':
        return {
          bot: `دلوقتي التغذية! 🥗 حركتك اليومية المعتادة (بره التمرين) عاملة إزاي؟`,
          answer: {
            sedentary: '🪑 جلوس أغلب اليوم',
            light: '🚶 حركة خفيفة',
            moderate: '🏃 حركة متوسطة',
            active: '🔥 مجهود بدني عالي'
          }[draft.dailyActivity]
        };
      case 'diseases': {
        const labels = draft.diseases
          .map(id => CHRONIC_DISEASES.find(d => d.id === id)?.label || id)
          .join('، ');
        return {
          bot: `هل عندك أي حالة صحية نراعيها في الأكل؟ 🩺`,
          answer: labels
        };
      }
      case 'diet_type': {
        const fixed = FIXED_DIET_MEALS[draft.dietType];
        return {
          bot: `تحب تمشي على أي نظام غذائي؟ 🍽️`,
          answer: `${DIETS[draft.dietType] || draft.dietType}${fixed ? ` (${fixed.label})` : ''}`
        };
      }
      case 'if_start_hour':
        return {
          bot: `تحب تبدأ أول وجبة في الصيام المتقطع الساعة كام؟ ⏰`,
          answer: `بداية الأكل الساعة ${draft.eatingStart}`
        };
      case 'meals_count':
        return {
          bot: `تحب نقسم أكلك اليومي على كام وجبة؟ 🍱`,
          answer: {
            2: 'وجبتين كبار (2)',
            3: '3 وجبات رئيسية (3)',
            4: '3 وجبات + سناك (4)',
            5: '3 وجبات + 2 سناك (5)'
          }[draft.mealsCount]
        };
      case 'budget':
        return {
          bot: `تحب نرتب الأكلات على أي ميزانية؟ 💰`,
          answer: {
            low: '🪙 اقتصادية وشعبية',
            medium: '⚖️ متوسطة ومتوازنة',
            high: '✨ مفتوحة ومتنوعة'
          }[draft.budget]
        };
      case 'exclusions': {
        const labels = draft.excludedGroups
          .map(id => QUICK_EXCLUSION_CHIPS.find(c => c.id === id)?.label || id)
          .join('، ');
        return {
          bot: `آخر سؤال! 🙌 في أي أكلات مش بتحبها نستبعدها من جدولك؟`,
          answer: labels
        };
      }
      case 'summary':
        return {
          bot: `كده خطتك الرقمية جاهزة يا ${esc(userName)}! 🎉 راجعها تحت واضغط «اعتمد الخطة» للبدء:`,
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
              <strong>🏃‍♂️ كمّل على خطتي المحفوظة</strong>
              <small>افتح جدول وجباتي وتماريني الحالي فوراً</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn" data-chat-action="start-fresh">
              <strong>🔄 ابدأ خطة جديدة من الأول</strong>
              <small>تعديل الوزن أو الهدف أو أيام التمرين</small>
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
              <input type="number" id="chat-input-age" aria-label="العمر بالسنوات" placeholder="أو اكتب عمرك (مثلاً: 28)" min="10" max="95" step="1" value="${esc(draft.age)}">
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
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.sex === 'female' ? 'is-selected' : ''}" data-chat-select="sex" data-val="female">
              <strong>👩 أنثى</strong>
            </button>
          </div>
        `;
      case 'maternal':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'none' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="none">
              <strong>❌ لا يوجد حمل أو رضاعة</strong>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'pregnant_t1' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="pregnant_t1">
              <strong>🤰 حامل — الثلث الأول (شهر 1–3)</strong>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'pregnant_t2' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="pregnant_t2">
              <strong>🤰 حامل — الثلث الثاني (شهر 4–6)</strong>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'pregnant_t3' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="pregnant_t3">
              <strong>🤰 حامل — الثلث الثالث (شهر 7–9)</strong>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.maternalStatus === 'breastfeeding' ? 'is-selected' : ''}" data-chat-select="maternalStatus" data-val="breastfeeding">
              <strong>🤱 مرضعة</strong>
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
              <input type="number" id="chat-input-weight" aria-label="الوزن بالكيلوجرام" placeholder="أو اكتب وزنك بالـ كجم (مثلاً: 78)" min="35" max="250" step="0.1" value="${esc(draft.weight)}">
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
                <strong>🔥 خسارة دهون وتخسيس${recLose ? ' ⭐' : ''}</strong>
                <small>حرق الدهون مع الحفاظ على العضلات</small>
              </button>
            ` : ''}
            <button type="button" class="outline-btn chat-choice-btn ${draft.goal === 'muscle_gain' ? 'is-selected' : ''}" data-chat-select="goal" data-val="muscle_gain">
              <strong>💪 بناء عضلات وشد الجسم${recMuscle ? ' ⭐' : ''}</strong>
              <small>زيادة الكتلة العضلية الصافية ببروتين عالي</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.goal === 'gain' ? 'is-selected' : ''}" data-chat-select="goal" data-val="gain">
              <strong>📈 زيادة الوزن وعلاج النحافة${recGain ? ' ⭐' : ''}</strong>
              <small>وجبات غنية بالسعرات وسهلة الهضم</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.goal === 'maintain' ? 'is-selected' : ''}" data-chat-select="goal" data-val="maintain">
              <strong>⚖️ الحفاظ على الوزن وصحة الجسم${isPregnant ? ' ⭐' : ''}</strong>
              <small>تثبيت الوزن وتنظيم الأكل والطاقة</small>
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
            if (range.idealMid < w) quickOptions.push({ val: range.idealMid, label: `🎯 المثالي (${range.idealMid} كجم)` });
            if (range.maxWeight < w && range.maxWeight !== range.idealMid) quickOptions.push({ val: range.maxWeight, label: `✅ أول الصحي (${range.maxWeight} كجم)` });
            if (range.minWeight < w) quickOptions.push({ val: range.minWeight, label: `📉 الأدنى الصحي (${range.minWeight} كجم)` });
          } else if (draft.goal === 'gain') {
            if (range.minWeight > w) quickOptions.push({ val: range.minWeight, label: `✅ أول الصحي (${range.minWeight} كجم)` });
            if (range.idealMid > w) quickOptions.push({ val: range.idealMid, label: `🎯 المثالي (${range.idealMid} كجم)` });
            if (range.maxWeight > w && range.maxWeight !== range.idealMid) quickOptions.push({ val: range.maxWeight, label: `💪 الأعلى الصحي (${range.maxWeight} كجم)` });
          } else {
            quickOptions.push({ val: Math.round(w + 4), label: `💪 +4 كجم عضل (${Math.round(w + 4)} كجم)` });
            if (range.idealMid >= w) quickOptions.push({ val: range.idealMid, label: `🎯 المثالي (${range.idealMid} كجم)` });
            if (range.maxWeight >= w) quickOptions.push({ val: range.maxWeight, label: `🏆 الأعلى الصحي (${range.maxWeight} كجم)` });
          }
        }
        return `
          <div class="chat-target-weight-box">
            ${range ? `
              <div class="chat-ideal-range-banner">
                <div class="ideal-range-title">📏 المدى الصحي لطولك (${esc(draft.height)} سم): <strong>${range.minWeight} – ${range.maxWeight} كجم</strong> · المتوسط المثالي: <strong>${range.idealMid} كجم</strong></div>
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
                  ? `⚠️ <strong>تحذير (BMI ${evalBmi.targetBmi}):</strong> ${esc(evalBmi.warningText)}`
                  : `✅ <strong>وزن صحي مثالي (BMI ${evalBmi.targetBmi})</strong> ضمن المدى الطبيعي لطولك (${evalBmi.minWeight}–${evalBmi.maxWeight} كجم).`
              ) : ''}
            </div>
            ${bmiWarningPendingFor != null && evalBmi?.isOutOfRange ? `
              <div class="chat-bmi-confirm-actions" role="alert">
                <button type="button" class="primary-btn" data-chat-action="accept-healthy-weight" data-healthy-val="${evalBmi.clampedHealthy}">✨ اعتمد أقرب وزن صحي (${evalBmi.clampedHealthy} كجم)</button>
                <button type="button" class="outline-btn" data-chat-action="force-target-weight">⚠️ كمّل على (${evalBmi.targetWeight} كجم) ⬅️</button>
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
              <strong>🔥 تغذية + تمارين مع بعض ⭐</strong>
              <small>سعراتك وبروتينك هيتظبطوا تلقائياً على أيام تمرينك</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.serviceTrack === 'nutrition_only' ? 'is-selected' : ''}" data-chat-select="serviceTrack" data-val="nutrition_only">
              <strong>🥗 نظام غذائي بس</strong>
              <small>جدول وجبات يومي محسوب بالجرام والوحدات المنزلية</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.serviceTrack === 'workouts_only' ? 'is-selected' : ''}" data-chat-select="serviceTrack" data-val="workouts_only">
              <strong>💪 جدول تمارين بس</strong>
              <small>خطة تدريبية أسبوعية للجيم أو البيت</small>
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
      case 'workout_days': {
        const selectedDays = Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
          ? draft.selectedWorkoutDays
          : getTrainingDayIndices(draft.workoutDaysCount);
        draft.selectedWorkoutDays = selectedDays;
        draft.workoutDaysCount = selectedDays.length;
        const selectedNames = selectedDays.map(i => WEEKDAYS_AR[Number(i)]?.name).filter(Boolean).join('، ');
        const presets = [
          { label: '3 أيام (سبت·اثنين·أربعاء) ⭐', days: [0, 2, 4] },
          { label: '4 أيام (سبت·أحد·ثلاثاء·أربعاء)', days: [0, 1, 3, 4] },
          { label: '5 أيام (سبت–أربعاء)', days: [0, 1, 2, 3, 4] }
        ];
        return `
          <div class="chat-multi-box">
            <div class="chat-weekdays-picker" role="group" aria-label="أيام الأسبوع للتمرين">
              ${WEEKDAYS_AR.map(wd => {
                const isSelected = selectedDays.includes(wd.index);
                return `
                  <button type="button" class="outline-btn chat-weekday-btn ${isSelected ? 'is-selected' : ''}" data-toggle-workout-day="${wd.index}" aria-pressed="${isSelected}">
                    <span class="weekday-check">${isSelected ? '✅' : '⬜'}</span>
                    <strong>${esc(wd.name)}</strong>
                  </button>
                `;
              }).join('')}
            </div>
            <div class="chat-days-presets">
              <span>اختيار سريع:</span>
              ${presets.map(p => `
                <button type="button" class="outline-btn chat-preset-chip" data-preset-workout-days="${p.days.join(',')}">${esc(p.label)}</button>
              `).join('')}
            </div>
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-workout-days">
              تأكيد الأيام (${selectedDays.length} ${selectedDays.length === 1 ? 'يوم' : selectedDays.length === 2 ? 'يومين' : 'أيام'}: ${esc(selectedNames)}) ✅
            </button>
          </div>
        `;
      }
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
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-multi" data-step="home_equipment">تأكيد الأدوات (${draft.homeEquipment.length}) ✅</button>
          </div>
        `;
      case 'workout_split': {
        const daysCount = Array.isArray(draft.selectedWorkoutDays) && draft.selectedWorkoutDays.length
          ? draft.selectedWorkoutDays.length
          : Number(draft.workoutDaysCount) || 3;
        const availableSplits = getAvailableWorkoutSplits(daysCount);
        const currentSplitPref = availableSplits.some(s => s.id === draft.workoutSplitPreference)
          ? draft.workoutSplitPreference
          : 'auto';
        return `
          <div class="chat-quick-replies">
            ${availableSplits.map(sp => `
              <button type="button" class="outline-btn chat-choice-btn ${currentSplitPref === sp.id ? 'is-selected' : ''}" data-chat-select="workoutSplitPreference" data-val="${sp.id}">
                <strong>${esc(sp.label)}</strong>
                ${sp.desc ? `<small>${esc(sp.desc)}</small>` : ''}
              </button>
            `).join('')}
          </div>
        `;
      }
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
              <strong>🪑 جلوس أغلب اليوم</strong>
              <small>شغل مكتبي أو مذاكرة أو قيادة</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.dailyActivity === 'light' ? 'is-selected' : ''}" data-chat-select="dailyActivity" data-val="light">
              <strong>🚶 نشاط خفيف</strong>
              <small>مشاوير يومية أو حركة منزلية خفيفة</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.dailyActivity === 'moderate' ? 'is-selected' : ''}" data-chat-select="dailyActivity" data-val="moderate">
              <strong>🏃 نشاط متوسط</strong>
              <small>حركة مستمرة أو شغل واقف / ميداني</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.dailyActivity === 'active' ? 'is-selected' : ''}" data-chat-select="dailyActivity" data-val="active">
              <strong>🔥 نشاط بدني عالي</strong>
              <small>مجهود عضلي وحركي شاق طوال اليوم</small>
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
                badge = ' ⭐ موصى به لحالتك';
              } else if (k === 'dash' && draft.diseases.includes('hypertension')) {
                badge = ' ⭐ لضبط الضغط';
              } else if (k === 'mediterranean' && draft.diseases.includes('cholesterol')) {
                badge = ' ⭐ للقلب والكوليسترول';
              } else if (k === 'high_protein' && draft.goal === 'muscle_gain') {
                badge = ' ⭐ لبناء العضل';
              } else if (k === 'balanced') {
                badge = ' ⭐ الأكثر مرونة';
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
              ['09:00', '9:00 صباحاً', 'الأكل من 9 ص حتى 5 م'],
              ['10:00', '10:00 صباحاً', 'الأكل من 10 ص حتى 6 م'],
              ['12:00', '12:00 ظهراً ⭐', 'الأكل من 12 ظ حتى 8 م (الأشهر)'],
              ['14:00', '2:00 ظهراً', 'الأكل من 2 ظ حتى 10 م'],
              ['16:00', '4:00 عصراً', 'الأكل من 4 ع حتى 12 ص']
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
              <strong>2️⃣ وجبتين كبار مشبعين</strong>
              <small>مناسب لو يومك مشغول</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${Number(draft.mealsCount) === 3 ? 'is-selected' : ''}" data-chat-select="mealsCount" data-val="3">
              <strong>3️⃣ 3 وجبات رئيسية</strong>
              <small>فطار وغداء وعشاء بدون سناك</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${Number(draft.mealsCount) === 4 ? 'is-selected' : ''}" data-chat-select="mealsCount" data-val="4">
              <strong>4️⃣ 3 وجبات + سناك ⭐</strong>
              <small>يمنع الجوع بين الوجبات</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${Number(draft.mealsCount) === 5 ? 'is-selected' : ''}" data-chat-select="mealsCount" data-val="5">
              <strong>5️⃣ 3 وجبات + 2 سناك</strong>
              <small>ممتاز لزيادة الوزن وبناء العضل</small>
            </button>
          </div>
        `;
      case 'budget':
        return `
          <div class="chat-quick-replies">
            <button type="button" class="outline-btn chat-choice-btn ${draft.budget === 'low' ? 'is-selected' : ''}" data-chat-select="budget" data-val="low">
              <strong>🪙 اقتصادية وشعبية</strong>
              <small>فول، بيض، جبنة قريش، عدس، بطاطس، فراخ وبلطي</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.budget === 'medium' ? 'is-selected' : ''}" data-chat-select="budget" data-val="medium">
              <strong>⚖️ متوسطة ومتوازنة ⭐</strong>
              <small>فراخ، لحمة بلدي، أسماك، تونة، شوفان وزبادي</small>
            </button>
            <button type="button" class="outline-btn chat-choice-btn ${draft.budget === 'high' ? 'is-selected' : ''}" data-chat-select="budget" data-val="high">
              <strong>✨ مفتوحة ومتنوعة</strong>
              <small>تشمل السلمون، الجمبري، الستيك، والمكسرات</small>
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
            <button type="button" class="primary-btn chat-confirm-multi" data-chat-action="confirm-multi" data-step="exclusions">اعرض ملخص خطتي 🎯</button>
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
        if (val === 'home_only') {
          draft.workoutSplitPreference = 'auto';
        }
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
