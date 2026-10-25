// Persona Generator: Generates 100 uniquely defined, diverse, realistic user personas
// Partitioned into 80 Development Evaluation and 20 Holdout Evaluation users.
// Also generates 20 distinct boundary/stress edge cases tested separately.

import { createPRNG } from './prng.mjs';

const MALE_NAMES = [
  'أحمد مصطفى', 'محمد علي', 'محمود إبراهيم', 'عمر حسني', 'كريم عادل', 'يوسف طارق', 'خالد نبيل',
  'عمرو سمير', 'حسن فاروق', 'زياد شريف', 'علي عثمان', 'رامي سعيد', 'حسام الدين', 'إسلام فتحي',
  'ماجد كامل', 'شريف وجدي', 'هاني فوزي', 'وائل مجدي', 'هشام كمال', 'ياسر رضوان', 'أمير نجاتي',
  'وليد منصور', 'حمزة سالم', 'مروان غانم', 'باسم لطفي', 'نادر عزت', 'صلاح ربيع', 'بلال حاتم',
  'أنس عبد الرحمن', 'معاذ زكريا', 'يحيى ممدوح', 'تامر سراج', 'إيهاب شوقي', 'فادي أنور', 'أسامة شكري'
];

const FEMALE_NAMES = [
  'سارة إبراهيم', 'نورهان عادل', 'مريم محمود', 'ياسمين حسام', 'آية مصطفى', 'هند سعيد', 'رانيا سمير',
  'دينا كامل', 'فاطمة الزهراء', 'منى كمال', 'سلمى طارق', 'شهد علي', 'نهى فاروق', 'حبيبة شريف',
  'إيمان فتحي', 'ريهام نبيل', 'دعاء مجدي', 'ماهينور سامي', 'بسنت وجدي', 'يارا رضوان', 'مروة فوزي',
  'شروق حسني', 'ندى لطفي', 'خلود عثمان', 'هاجر سالم', 'أميرة حاتم', 'داليا زكريا', 'رضوى ممدوح',
  'هالة سراج', 'بسمة شوقي', 'جيهان أنور', 'مي شكري', 'لبنى منصور', 'سما فادي', 'غادة غانم'
];

const OCCUPATIONS = [
  { title: 'مهندس برمجيات', activity: 'sedentary', stressLevel: 'medium', workShift: 'fixed_desk' },
  { title: 'طبيبة مقيمة بالمستشفى', activity: 'moderate', stressLevel: 'high', workShift: 'rotating_shifts' },
  { title: 'محاسب بشركة استشارات', activity: 'sedentary', stressLevel: 'high', workShift: 'fixed_desk' },
  { title: 'معلم مدرسة', activity: 'light', stressLevel: 'medium', workShift: 'day_fixed' },
  { title: 'مندوب مبيعات ميداني', activity: 'active', stressLevel: 'medium', workShift: 'field_mobile' },
  { title: 'مديرة تسويق رقمي', activity: 'sedentary', stressLevel: 'medium', workShift: 'fixed_desk' },
  { title: 'ربة منزل', activity: 'moderate', stressLevel: 'medium', workShift: 'home_flexible' },
  { title: 'طالب جامعي', activity: 'light', stressLevel: 'medium', workShift: 'student_variable' },
  { title: 'صيدلي', activity: 'moderate', stressLevel: 'medium', workShift: 'shifts' },
  { title: 'مصمم جرافيك حر', activity: 'sedentary', stressLevel: 'medium', workShift: 'freelance_flexible' },
  { title: 'صاحب متجر تجزئة', activity: 'moderate', stressLevel: 'high', workShift: 'long_hours' },
  { title: 'محامية', activity: 'sedentary', stressLevel: 'high', workShift: 'fixed_desk' }
];

export const ARCHETYPES = [
  { key: 'high_achiever', label: 'ملتزم عالي الأداء', targetPct: 0.15 },
  { key: 'inconsistent_busy', label: 'مضغوط بالعمل والتزامه متذبذب', targetPct: 0.15 },
  { key: 'gym_lover_poor_eater', label: 'عاشق للجيم وضعيف في تنظيم الأكل', targetPct: 0.12 },
  { key: 'diligent_dieter_low_activity', label: 'دقيق في الأكل ومبتدئ بالرياضة', targetPct: 0.12 },
  { key: 'weekend_warrior', label: 'مشغول بأيام العمل ونشط بالويك إند', targetPct: 0.08 },
  { key: 'fatigue_prone', label: 'معرض للإجهاد وضعف النوم', targetPct: 0.10 },
  { key: 'dropout_and_return', label: 'ينقطع لفترة ثم يعود بحماس', targetPct: 0.08 },
  { key: 'plateau_struggler', label: 'ملتزم يواجه ثبات وزن واستجابة بطيئة', targetPct: 0.08 },
  { key: 'injury_cautious', label: 'حذر ولديه ألم مفاصل خفيف', targetPct: 0.06 },
  { key: 'casual_flexible', label: 'معتدل ومرن في الاختيارات', targetPct: 0.06 }
];

const SUPPORTED_DISEASES = [
  'none', 'hypertension', 'insulin_resistance', 'pcos', 'ibs',
  'cholesterol', 'gout', 'anemia', 'vitamin_d_deficiency', 'lactose_intolerance', 'favism', 'fatty_liver'
];

const SUPPORTED_INJURIES = [
  'none', 'lower_back_pain', 'knee_pain', 'shoulder_pain', 'wrist_pain',
  'ankle_pain', 'neck_pain', 'hip_pain', 'diastasis_recti'
];

export function generateCohort(seed = 42100) {
  const prng = createPRNG(seed);
  const users = [];

  const archetypePool = [];
  for (const arch of ARCHETYPES) {
    const count = Math.round(arch.targetPct * 100);
    for (let i = 0; i < count; i++) archetypePool.push(arch.key);
  }
  while (archetypePool.length < 100) archetypePool.push('casual_flexible');
  while (archetypePool.length > 100) archetypePool.pop();
  const shuffledArchetypes = prng.shuffle(archetypePool);

  const maleNamesPool = prng.shuffle([...MALE_NAMES, ...MALE_NAMES]);
  const femaleNamesPool = prng.shuffle([...FEMALE_NAMES, ...FEMALE_NAMES]);

  for (let idx = 1; idx <= 100; idx++) {
    const id = `user_${String(idx).padStart(3, '0')}`;
    const cohort = idx <= 80 ? 'development' : 'holdout';
    const archetype = shuffledArchetypes[idx - 1];

    // Sex distribution: ~54% male, ~46% female
    const sex = prng.weightedPick(['male', 'female'], [54, 46]);
    const name = sex === 'male' ? maleNamesPool.pop() : femaleNamesPool.pop();

    // Age distribution: adult 19 to 68
    const ageGroup = prng.weightedPick(['young', 'mid', 'senior_adult', 'mature'], [35, 40, 18, 7]);
    let age = 30;
    if (ageGroup === 'young') age = prng.int(19, 29);
    else if (ageGroup === 'mid') age = prng.int(30, 44);
    else if (ageGroup === 'senior_adult') age = prng.int(45, 59);
    else age = prng.int(60, 68);

    // Height: realistic gaussian by sex
    const height = Math.round(sex === 'male' ? prng.normal(175, 6.5) : prng.normal(162, 5.8));
    const clampedHeight = Math.max(148, Math.min(196, height));

    // Goal distribution: lose 54%, muscle_gain 24%, maintain 14%, gain 8%
    let goal = prng.weightedPick(['lose', 'muscle_gain', 'maintain', 'gain'], [54, 24, 14, 8]);
    let goalPace = prng.pick(['slow', 'moderate', 'fast']);

    // Derive realistic weight based on height & goal
    let bmi = 24.0;
    let targetWeight = null;
    let recomposition = false;

    if (goal === 'lose') {
      bmi = prng.float(25.5, 38.0, 1);
      const currentWeight = Math.round(bmi * ((clampedHeight / 100) ** 2) * 10) / 10;
      const targetBmi = prng.float(20.5, 24.2, 1);
      targetWeight = Math.round(targetBmi * ((clampedHeight / 100) ** 2) * 10) / 10;
      if (targetWeight >= currentWeight) targetWeight = Math.round((currentWeight - 4) * 10) / 10;
      bmi = currentWeight / ((clampedHeight / 100) ** 2);
    } else if (goal === 'gain') {
      bmi = prng.float(18.6, 21.0, 1);
      const currentWeight = Math.round(bmi * ((clampedHeight / 100) ** 2) * 10) / 10;
      const targetBmi = prng.float(22.0, 24.5, 1);
      targetWeight = Math.round(targetBmi * ((clampedHeight / 100) ** 2) * 10) / 10;
      if (targetWeight <= currentWeight) targetWeight = Math.round((currentWeight + 4) * 10) / 10;
    } else if (goal === 'muscle_gain') {
      if (prng.bool(0.35)) {
        recomposition = true;
        bmi = prng.float(21.5, 26.5, 1);
        const currentWeight = Math.round(bmi * ((clampedHeight / 100) ** 2) * 10) / 10;
        targetWeight = currentWeight;
      } else {
        bmi = prng.float(20.0, 24.5, 1);
        const currentWeight = Math.round(bmi * ((clampedHeight / 100) ** 2) * 10) / 10;
        targetWeight = Math.round((currentWeight + prng.float(3, 7, 1)) * 10) / 10;
      }
    } else {
      bmi = prng.float(20.5, 26.0, 1);
      targetWeight = null;
    }

    const weight = Math.round(bmi * ((clampedHeight / 100) ** 2) * 10) / 10;
    const finalBmi = Math.round((weight / ((clampedHeight / 100) ** 2)) * 10) / 10;

    // Service Track: nutrition_and_workouts 76%, nutrition_only 14%, workouts_only 10%
    const serviceTrack = prng.weightedPick(['nutrition_and_workouts', 'nutrition_only', 'workouts_only'], [76, 14, 10]);

    // Region & Timezone: 80% Egypt, 20% Gulf
    let region = prng.weightedPick(['egypt', 'gulf'], [80, 20]);
    let timezone = region === 'egypt' ? 'Africa/Cairo' : prng.pick(['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait']);
    let locale = region === 'gulf' ? 'ar-SA' : 'ar-EG';

    // Occupation & Life context
    const occ = prng.pick(OCCUPATIONS);
    const dailyActivity = occ.activity;

    // Diet Type
    let dietType = prng.weightedPick([
      'balanced', 'high_protein', 'low_carb', 'intermittent_fasting',
      'mediterranean', 'dash', 'vegetarian', 'vegan', 'keto'
    ], [32, 22, 12, 10, 8, 6, 4, 3, 3]);

    // Budget: low_carb, keto, vegan, and dash require medium/high budget
    let budget = prng.weightedPick(['medium', 'low', 'high'], [60, 25, 15]);
    if (['low_carb', 'keto', 'vegan', 'dash'].includes(dietType)) {
      budget = prng.weightedPick(['medium', 'high'], [75, 25]);
    }

    // Meals count: DASH performs best with 3 meals; intermittent fasting 2-3; keto 3
    let mealsCount = 4;
    if (dietType === 'intermittent_fasting') mealsCount = prng.pick([2, 3]);
    else if (dietType === 'keto') mealsCount = 3;
    else if (dietType === 'dash') mealsCount = 3;
    else mealsCount = prng.pick([3, 4, 5]);

    // Supported wellness conditions
    let diseases = [];
    if (prng.bool(0.32)) {
      const cond = prng.pick(SUPPORTED_DISEASES.filter(d => d !== 'none'));
      if (cond === 'gout' && (dietType === 'high_protein' || dietType === 'keto')) dietType = 'balanced';
      if (cond === 'cholesterol' && dietType === 'keto') dietType = 'mediterranean';
      if (cond === 'hypertension') {
        if (prng.bool(0.6)) dietType = 'dash';
        mealsCount = 3;
        budget = 'medium';
      }
      if (cond === 'ibs') {
        budget = 'medium';
        if (dietType === 'dash') dietType = 'balanced';
      }
      if (cond === 'favism') {
        if (dietType === 'high_protein') dietType = 'balanced';
        budget = 'medium';
      }
      diseases.push(cond);
      if (prng.bool(0.15)) {
        const cond2 = prng.pick(SUPPORTED_DISEASES.filter(d => d !== 'none' && !diseases.includes(d) && !(cond === 'ibs' && d === 'gout')));
        if (cond2) {
          if (cond2 === 'cholesterol' && dietType === 'keto') dietType = 'mediterranean';
          if (cond2 === 'gout' && (dietType === 'high_protein' || dietType === 'keto')) dietType = 'balanced';
          diseases.push(cond2);
        }
      }
    }

    // Gulf region: DASH and hypertension require Egypt regional catalog due to sodium reference constraints
    if (dietType === 'dash' || diseases.includes('hypertension')) {
      region = 'egypt';
      timezone = 'Africa/Cairo';
      locale = 'ar-EG';
      mealsCount = 3;
    }

    // Supported mild injuries
    let injuries = [];
    if (archetype === 'injury_cautious' || prng.bool(0.24)) {
      const inj = prng.pick(SUPPORTED_INJURIES.filter(i => i !== 'none'));
      injuries.push(inj);
    }

    // Excluded groups
    const excludedGroups = [];
    if (dietType === 'vegan') {
      excludedGroups.push('meat', 'chicken', 'fish', 'dairy', 'eggs');
    } else if (dietType === 'vegetarian') {
      excludedGroups.push('meat', 'chicken', 'fish');
    } else {
      if (prng.bool(0.12)) {
        const candidate = prng.pick(['fish', 'chicken', 'meat']);
        excludedGroups.push(candidate);
      }
    }
    if (diseases.includes('favism')) {
      if (!excludedGroups.includes('fava')) excludedGroups.push('fava');
      budget = 'medium';
    }
    if (diseases.includes('lactose_intolerance')) {
      for (const d of ['dairy', 'milk', 'yogurt', 'cheese']) {
        if (!excludedGroups.includes(d)) excludedGroups.push(d);
      }
    }

    // Workout parameters
    const workoutLocation = prng.weightedPick(['gym_only', 'home_only', 'home_and_gym'], [55, 30, 15]);
    const fitnessLevel = prng.weightedPick(['beginner', 'intermediate', 'advanced'], [46, 38, 16]);
    const sessionDuration = prng.weightedPick([30, 45, 60, 90], [15, 50, 30, 5]);

    let workoutDaysCount = prng.weightedPick([2, 3, 4, 5, 6], [8, 38, 32, 16, 6]);

    let workoutSplitPreference = 'full_body';
    if (workoutDaysCount === 2) {
      workoutSplitPreference = 'full_body';
    } else if (workoutDaysCount === 3) {
      workoutSplitPreference = prng.pick(['full_body', 'ppl']);
    } else if (workoutDaysCount === 4) {
      workoutSplitPreference = 'upper_lower';
    } else if (workoutDaysCount === 5) {
      workoutSplitPreference = prng.pick(['upper_lower', 'ppl', 'bro_split']);
    } else {
      workoutSplitPreference = prng.pick(['ppl', 'bro_split']);
    }

    if (workoutSplitPreference === 'bro_split' && workoutLocation === 'home_only') {
      workoutSplitPreference = workoutDaysCount >= 5 ? 'ppl' : 'upper_lower';
    }

    let selectedWorkoutDays = [1, 3, 5];
    if (workoutDaysCount === 2) selectedWorkoutDays = [1, 4];
    else if (workoutDaysCount === 3) selectedWorkoutDays = [1, 3, 5];
    else if (workoutDaysCount === 4) selectedWorkoutDays = [1, 2, 4, 5];
    else if (workoutDaysCount === 5) selectedWorkoutDays = [0, 1, 2, 4, 5];
    else if (workoutDaysCount === 6) selectedWorkoutDays = [0, 1, 2, 3, 4, 5];

    let homeEquipment = ['none'];
    if (workoutLocation === 'home_only' || workoutLocation === 'home_and_gym') {
      homeEquipment = prng.pick([
        ['dumbbells'],
        ['dumbbells', 'resistance_bands'],
        ['dumbbells', 'bench', 'pullup_bar'],
        ['barbell', 'dumbbells', 'bench']
      ]);
    }

    let externalTrainingDays = [];
    if (serviceTrack === 'nutrition_only') {
      if (goal === 'muscle_gain') externalTrainingDays = [1, 3, 5];
      selectedWorkoutDays = [];
    }

    const typicalSleepHours = prng.float(5.5, 8.5, 1);
    const sleepDisruptionProne = occ.workShift === 'rotating_shifts' || archetype === 'fatigue_prone';

    const behavior = createBehavioralProfile(archetype, prng);
    const lifestyleEvents = generateLifestyleEvents(archetype, prng);

    const onboardingDraft = {
      name,
      age,
      sex,
      height: clampedHeight,
      weight,
      goal,
      goalPace,
      targetWeight,
      serviceTrack,
      dailyActivity,
      dietType,
      region,
      timezone,
      locale,
      budget,
      mealsCount,
      excludedGroups,
      diseases: diseases.length ? diseases : ['none'],
      injuries: injuries.length ? injuries : ['none'],
      healthConfirmed: true,
      weekdayConvention: 'js_sunday_0',
      fitnessLevel,
      selectedWorkoutDays,
      workoutLocation,
      homeEquipment,
      sessionDuration,
      workoutSplitPreference,
      externalTrainingDays
    };

    users.push({
      id,
      cohort,
      name,
      age,
      sex,
      height: clampedHeight,
      weight,
      bmi: finalBmi,
      goal,
      targetWeight,
      recomposition,
      serviceTrack,
      dietType,
      region,
      timezone,
      locale,
      budget,
      mealsCount,
      excludedGroups,
      diseases,
      injuries,
      occupation: occ.title,
      workShift: occ.workShift,
      archetype,
      typicalSleepHours,
      sleepDisruptionProne,
      workoutDaysCount,
      workoutLocation,
      fitnessLevel,
      sessionDuration,
      workoutSplitPreference,
      selectedWorkoutDays,
      homeEquipment,
      externalTrainingDays,
      behavior,
      lifestyleEvents,
      onboardingDraft
    });
  }

  return users;
}

function createBehavioralProfile(archetype, prng) {
  switch (archetype) {
    case 'high_achiever':
      return {
        baseAdherence: prng.float(0.88, 0.96, 2),
        mealLogProb: 0.95,
        completeDayProb: 0.92,
        weightFreqDays: 1,
        waterLogProb: 0.92,
        checkinProb: 0.90,
        workoutAttendProb: 0.96,
        acceptCalorieAdaptation: 0.95,
        acceptVolumeAdaptation: 0.90,
        substituteFoodProb: 0.05,
        substituteExerciseProb: 0.05
      };
    case 'inconsistent_busy':
      return {
        baseAdherence: prng.float(0.55, 0.70, 2),
        mealLogProb: 0.65,
        completeDayProb: 0.50,
        weightFreqDays: 4,
        waterLogProb: 0.55,
        checkinProb: 0.50,
        workoutAttendProb: 0.65,
        acceptCalorieAdaptation: 0.75,
        acceptVolumeAdaptation: 0.60,
        substituteFoodProb: 0.20,
        substituteExerciseProb: 0.15
      };
    case 'gym_lover_poor_eater':
      return {
        baseAdherence: prng.float(0.68, 0.78, 2),
        mealLogProb: 0.45,
        completeDayProb: 0.35,
        weightFreqDays: 3,
        waterLogProb: 0.75,
        checkinProb: 0.70,
        workoutAttendProb: 0.95,
        acceptCalorieAdaptation: 0.60,
        acceptVolumeAdaptation: 0.95,
        substituteFoodProb: 0.25,
        substituteExerciseProb: 0.05
      };
    case 'diligent_dieter_low_activity':
      return {
        baseAdherence: prng.float(0.70, 0.82, 2),
        mealLogProb: 0.92,
        completeDayProb: 0.88,
        weightFreqDays: 2,
        waterLogProb: 0.85,
        checkinProb: 0.80,
        workoutAttendProb: 0.55,
        acceptCalorieAdaptation: 0.90,
        acceptVolumeAdaptation: 0.50,
        substituteFoodProb: 0.08,
        substituteExerciseProb: 0.15
      };
    case 'weekend_warrior':
      return {
        baseAdherence: prng.float(0.60, 0.72, 2),
        mealLogProb: 0.60,
        completeDayProb: 0.55,
        weightFreqDays: 5,
        waterLogProb: 0.60,
        checkinProb: 0.55,
        workoutAttendProb: 0.70,
        acceptCalorieAdaptation: 0.80,
        acceptVolumeAdaptation: 0.70,
        substituteFoodProb: 0.15,
        substituteExerciseProb: 0.10
      };
    case 'fatigue_prone':
      return {
        baseAdherence: prng.float(0.62, 0.75, 2),
        mealLogProb: 0.75,
        completeDayProb: 0.65,
        weightFreqDays: 3,
        waterLogProb: 0.65,
        checkinProb: 0.85,
        workoutAttendProb: 0.70,
        acceptCalorieAdaptation: 0.75,
        acceptVolumeAdaptation: 0.95,
        substituteFoodProb: 0.10,
        substituteExerciseProb: 0.20
      };
    case 'dropout_and_return':
      return {
        baseAdherence: prng.float(0.50, 0.65, 2),
        mealLogProb: 0.70,
        completeDayProb: 0.60,
        weightFreqDays: 3,
        waterLogProb: 0.60,
        checkinProb: 0.60,
        workoutAttendProb: 0.70,
        acceptCalorieAdaptation: 0.70,
        acceptVolumeAdaptation: 0.70,
        substituteFoodProb: 0.15,
        substituteExerciseProb: 0.10
      };
    case 'plateau_struggler':
      return {
        baseAdherence: prng.float(0.85, 0.94, 2),
        mealLogProb: 0.90,
        completeDayProb: 0.88,
        weightFreqDays: 2,
        waterLogProb: 0.88,
        checkinProb: 0.85,
        workoutAttendProb: 0.88,
        acceptCalorieAdaptation: 0.95,
        acceptVolumeAdaptation: 0.80,
        substituteFoodProb: 0.08,
        substituteExerciseProb: 0.08
      };
    case 'injury_cautious':
      return {
        baseAdherence: prng.float(0.72, 0.84, 2),
        mealLogProb: 0.80,
        completeDayProb: 0.75,
        weightFreqDays: 3,
        waterLogProb: 0.80,
        checkinProb: 0.90,
        workoutAttendProb: 0.78,
        acceptCalorieAdaptation: 0.80,
        acceptVolumeAdaptation: 0.90,
        substituteFoodProb: 0.10,
        substituteExerciseProb: 0.35
      };
    case 'casual_flexible':
    default:
      return {
        baseAdherence: prng.float(0.70, 0.80, 2),
        mealLogProb: 0.75,
        completeDayProb: 0.68,
        weightFreqDays: 3,
        waterLogProb: 0.70,
        checkinProb: 0.70,
        workoutAttendProb: 0.78,
        acceptCalorieAdaptation: 0.82,
        acceptVolumeAdaptation: 0.75,
        substituteFoodProb: 0.14,
        substituteExerciseProb: 0.12
      };
  }
}

function generateLifestyleEvents(archetype, prng) {
  const events = [];

  const crunchStart = prng.int(16, 26);
  const crunchDuration = prng.int(5, 9);
  events.push({
    type: 'work_crunch',
    startDay: crunchStart,
    endDay: crunchStart + crunchDuration,
    sleepDelta: -2.0,
    stressLevel: 4,
    fatigueBoost: 3,
    missedLoggingRisk: 0.45,
    missedWorkoutRisk: 0.40
  });

  const travelStart = prng.int(44, 58);
  const travelDuration = prng.int(4, 7);
  events.push({
    type: 'vacation_travel',
    startDay: travelStart,
    endDay: travelStart + travelDuration,
    eatingOutProb: 0.85,
    missedGymProb: 0.65,
    skipWeighIn: true
  });

  if (prng.bool(0.40)) {
    const illStart = prng.int(30, 75);
    const illDur = prng.int(3, 5);
    events.push({
      type: 'mild_illness',
      startDay: illStart,
      endDay: illStart + illDur,
      illnessFlag: true,
      fatigueBoost: 4,
      sorenessBoost: 3,
      workoutSkipProb: 0.90
    });
  }

  if (archetype === 'dropout_and_return') {
    const hiatusStart = prng.int(34, 46);
    const hiatusDur = prng.int(12, 16);
    events.push({
      type: 'hiatus_dropout',
      startDay: hiatusStart,
      endDay: hiatusStart + hiatusDur,
      appOpenProb: 0.02
    });
  }

  if (archetype === 'plateau_struggler') {
    events.push({
      type: 'metabolic_plateau',
      startDay: 28,
      endDay: 65,
      weightDeltaFactor: 0.05
    });
  }

  return events;
}

export function generateStressCohort() {
  return [
    {
      id: 'stress_01',
      title: 'Unsupported clinical condition: Diabetes',
      draft: { name: 'مريض سكري', age: 35, weight: 85, height: 175, sex: 'male', goal: 'lose', diseases: ['diabetes'], serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_unsupported_clinical'
    },
    {
      id: 'stress_02',
      title: 'Active pregnancy / maternalStatus',
      draft: { name: 'سيدة حامل', age: 29, weight: 68, height: 165, sex: 'female', goal: 'maintain', maternalStatus: 'pregnant', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_unsupported_clinical'
    },
    {
      id: 'stress_03',
      title: 'Unsupported acute injury: elbow_pain',
      draft: { name: 'إصابة كوع حادة', age: 31, weight: 80, height: 178, sex: 'male', goal: 'lose', injuries: ['elbow_pain'], serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_unsupported_injury'
    },
    {
      id: 'stress_04',
      title: 'Senior adult over age limit: 74 years old',
      draft: { name: 'مسن فوق السبعين', age: 74, weight: 75, height: 170, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_age_requires_review'
    },
    {
      id: 'stress_05',
      title: 'Minor under age limit: 16 years old',
      draft: { name: 'قاصر دون 18', age: 16, weight: 60, height: 170, sex: 'male', goal: 'muscle_gain', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_underage'
    },
    {
      id: 'stress_06',
      title: 'Extreme high BMI: 68.5 kg/m2',
      draft: { name: 'سمنة مفرطة خارج النطاق', age: 40, weight: 210, height: 160, sex: 'female', goal: 'lose', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_bmi_out_of_range'
    },
    {
      id: 'stress_07',
      title: 'Underweight user requesting weight loss: BMI 17.2',
      draft: { name: 'نحافة غير آمنة لخسارة الوزن', age: 24, weight: 44, height: 160, sex: 'female', goal: 'lose', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_underweight_loss_forbidden'
    },
    {
      id: 'stress_08',
      title: 'Vegan diet with legumes and nuts excluded (impossible protein source)',
      draft: { name: 'نباتي صرف بدون مصادر بروتين', age: 28, weight: 70, height: 175, sex: 'male', goal: 'lose', dietType: 'vegan', excludedGroups: ['legumes', 'nuts'], serviceTrack: 'nutrition_only' },
      expectedOutcome: 'rejected_no_viable_proteins'
    },
    {
      id: 'stress_09',
      title: 'Workouts-only track without health confirmation',
      draft: { name: 'تمرين مستقل غير مؤكد صحيًا', age: 33, weight: 78, height: 175, sex: 'male', goal: 'muscle_gain', serviceTrack: 'workouts_only', healthConfirmed: false },
      expectedOutcome: 'rejected_health_confirmation_required'
    },
    {
      id: 'stress_10',
      title: 'Nutrition-only muscle gain without external resistance days',
      draft: { name: 'تغذية فقط لعضلات بدون أيام تمرين', age: 26, weight: 70, height: 175, sex: 'male', goal: 'muscle_gain', serviceTrack: 'nutrition_only', externalTrainingDays: [] },
      expectedOutcome: 'rejected_external_training_required'
    },
    {
      id: 'stress_11',
      title: 'Contradictory target weight: goal lose but target weight > current weight',
      draft: { name: 'هدف تخسيس بوزن مستهدف أكبر', age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', targetWeight: 88, serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_target_weight_contradiction'
    },
    {
      id: 'stress_12',
      title: 'Contradictory target weight: goal gain but target weight < current weight',
      draft: { name: 'هدف زيادة بوزن مستهدف أقل', age: 25, weight: 60, height: 175, sex: 'male', goal: 'gain', targetWeight: 55, serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'rejected_target_weight_contradiction'
    },
    {
      id: 'stress_13',
      title: 'Extreme budget + vegan diet + high calorie target',
      draft: { name: 'ميزانية محدودة ونباتي وسعرات عالية', age: 27, weight: 85, height: 185, sex: 'male', goal: 'muscle_gain', dietType: 'vegan', budget: 'low', dailyActivity: 'active', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'handled_safely_or_feasible'
    },
    {
      id: 'stress_14',
      title: 'Home bodyweight only with 30 min duration for advanced level',
      draft: { name: 'منزلي بدون أوزان 30 دقيقة لمتقدم', age: 30, weight: 75, height: 175, sex: 'male', goal: 'muscle_gain', workoutLocation: 'home_only', homeEquipment: ['none'], sessionDuration: 30, fitnessLevel: 'advanced', selectedWorkoutDays: [1, 3, 5], serviceTrack: 'workouts_only', healthConfirmed: true },
      expectedOutcome: 'handled_with_bodyweight_progression'
    },
    {
      id: 'stress_15',
      title: 'Multiple joint injuries: lower back, knee, and shoulder pain combined',
      draft: { name: 'إصابات متعددة مفاصل', age: 45, weight: 90, height: 175, sex: 'male', goal: 'lose', injuries: ['lower_back_pain', 'knee_pain', 'shoulder_pain'], serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'handled_strict_exercise_exclusions'
    },
    {
      id: 'stress_16',
      title: 'Favism condition: must enforce strict fava bean exclusion',
      draft: { name: 'أنيميا الفول', age: 26, weight: 75, height: 178, sex: 'male', goal: 'lose', diseases: ['favism'], serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'favism_exclusion_enforced'
    },
    {
      id: 'stress_17',
      title: 'Lactose intolerance: must enforce dairy exclusion',
      draft: { name: 'عدم تحمل اللاكتوز', age: 32, weight: 65, height: 168, sex: 'female', goal: 'lose', diseases: ['lactose_intolerance'], serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'dairy_exclusion_enforced'
    },
    {
      id: 'stress_18',
      title: 'Extreme weight logging value out of bounds: 350 kg or 5 kg',
      draft: { name: 'وزن شاذ غير منطقي', age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'weight_bounds_enforced'
    },
    {
      id: 'stress_19',
      title: 'Rescheduling workout to past date or beyond 14 days',
      draft: { name: 'إعادة جدولة غير صالحة', age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'reschedule_date_bounds_enforced'
    },
    {
      id: 'stress_20',
      title: 'Gulf DASH: a feasible plan must retain measured daily sodium at or below 2300 mg',
      draft: { name: 'داش بالخليج', age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', dietType: 'dash', region: 'gulf', serviceTrack: 'nutrition_and_workouts' },
      expectedOutcome: 'dash_sodium_bound_enforced'
    }
  ];
}
