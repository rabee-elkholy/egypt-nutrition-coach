export const FITNESS_LEVELS = {
  beginner: {
    id: 'beginner',
    label: '🌱 مبتدئ',
    desc: 'لسه ببدأ أو راجع بعد انقطاع (3 مجموعات خفيفة)',
    shortLabel: 'مبتدئ 🌱',
    setsMultiplier: 0.8,
    defaultSets: 3
  },
  intermediate: {
    id: 'intermediate',
    label: '⚡ متوسط ⭐',
    desc: 'بتمرن بانتظام من شهور (3 مجموعات مركزة)',
    shortLabel: 'متوسط ⚡',
    setsMultiplier: 1.0,
    defaultSets: 3
  },
  advanced: {
    id: 'advanced',
    label: '🔥 متقدم',
    desc: 'خبرة أكتر من سنة وأوزان عالية (4 مجموعات)',
    shortLabel: 'متقدم 🔥',
    setsMultiplier: 1.2,
    defaultSets: 4
  }
};

export const WORKOUT_LOCATIONS = {
  gym_only: {
    id: 'gym_only',
    label: '🏋️ في الجيم',
    desc: 'أجهزة وكابلات وأوزان حرة كاملة',
    shortLabel: 'الجيم 🏋️'
  },
  home_only: {
    id: 'home_only',
    label: '🏠 في البيت',
    desc: 'تمارين منزلية بوزن الجسم أو أدواتك',
    shortLabel: 'البيت 🏠'
  },
  home_and_gym: {
    id: 'home_and_gym',
    label: '🔄 ميكس (بيت + جيم)',
    desc: 'أيام في الجيم وأيام في البيت',
    shortLabel: 'بيت وجيم 🔄'
  }
};

export const WORKOUT_SPLITS = {
  auto: {
    id: 'auto',
    label: '🤖 تلقائي ذكي ⭐',
    shortLabel: 'تلقائي ذكي 🤖',
    minDays: 1,
    maxDays: 7,
    desc: 'يختار الأفضل علمياً لعدد أيامك تلقائياً'
  },
  full_body: {
    id: 'full_body',
    label: '🔄 شامل للجسم (Full Body)',
    shortLabel: 'Full Body (شامل للجسم)',
    minDays: 1,
    maxDays: 4,
    desc: 'كل عضلات الجسم في التمرينة الواحدة'
  },
  upper_lower: {
    id: 'upper_lower',
    label: '⚖️ علوي / سفلي (Upper / Lower)',
    shortLabel: 'Upper / Lower (علوي / سفلي)',
    minDays: 2,
    maxDays: 6,
    desc: 'يوم نص علوي ويوم رجل وبطن'
  },
  ppl: {
    id: 'ppl',
    label: '🔥 دفع / سحب / أرجل (PPL)',
    shortLabel: 'Push / Pull / Legs (دفع · سحب · أرجل)',
    minDays: 3,
    maxDays: 7,
    desc: 'يوم دفع · يوم سحب · يوم رجل'
  },
  bro_split: {
    id: 'bro_split',
    label: '💪 عضلة كل يوم (Bro Split)',
    shortLabel: 'Bro Split (عضلة كل يوم — كلاسيكي)',
    minDays: 3,
    maxDays: 6,
    desc: 'نظام الجيم الكلاسيكي (صدر · ظهر · كتف · رجل)'
  }
};

export function getAvailableWorkoutSplits(daysCount = 3) {
  const n = Math.max(1, Math.min(7, Number(daysCount) || 3));
  return Object.values(WORKOUT_SPLITS).filter(s => n >= s.minDays && n <= s.maxDays);
}

export function resolveWorkoutSplit(splitPreference = 'auto', daysCount = 3, locationMode = 'gym_only') {
  const n = Math.max(1, Math.min(7, Number(daysCount) || 3));
  if (locationMode === 'home_only') {
    return n <= 3 ? 'full_body' : 'upper_lower';
  }
  if (splitPreference && splitPreference !== 'auto' && WORKOUT_SPLITS[splitPreference]) {
    const sp = WORKOUT_SPLITS[splitPreference];
    if (n >= sp.minDays && n <= sp.maxDays) {
      return splitPreference;
    }
  }
  if (n <= 3) return 'full_body';
  if (n === 4) return 'upper_lower';
  return 'ppl';
}

export const HOME_EQUIPMENT = [
  { id: 'none', label: '🧘 وزن الجسم فقط', icon: '🧘' },
  { id: 'dumbbells', label: '🏋️ دامبلز', icon: '🏋️' },
  { id: 'resistance_bands', label: '➰ استك مقاومة', icon: '➰' },
  { id: 'pullup_bar', label: '🪜 عقلة باب', icon: '🪜' },
  { id: 'kettlebell', label: '🔔 كيتل بيل', icon: '🔔' },
  { id: 'bench', label: '🛋️ بنش منزلي', icon: '🛋️' },
  { id: 'barbell', label: '🏋️‍♂️ بار وأوزان', icon: '🏋️‍♂️' },
  { id: 'jump_rope', label: '🪢 حبل نط', icon: '🪢' },
  { id: 'yoga_mat', label: '🧎 سجادة يوجا', icon: '🧎' },
  { id: 'cardio_machine', label: '🚴 مشاية / عجلة', icon: '🚴' }
];

export const INJURIES = [
  { id: 'none', label: '✅ لا يوجد', isNone: true },
  { id: 'knee_pain', label: '🦵 الركبة' },
  { id: 'lower_back_pain', label: '🔙 أسفل الظهر' },
  { id: 'shoulder_injury', label: '💪 الكتف' },
  { id: 'neck_pain', label: '🧣 الرقبة' },
  { id: 'elbow_pain', label: '🦾 الكوع' },
  { id: 'wrist_pain', label: '✋ الرسغ' },
  { id: 'ankle_injury', label: '🦶 الكاحل' },
  { id: 'hip_pain', label: '🦴 الفخذ / الحوض' },
  { id: 'diastasis_recti', label: '🤰 انفصال عضلي' }
];

export const SESSION_DURATIONS = [
  { value: 20, label: '⏱️ 20 دقيقة', desc: '4 تمارين سريعة' },
  { value: 30, label: '⏱️ 30 دقيقة', desc: '5 تمارين مباشرة' },
  { value: 45, label: '⏱️ 45 دقيقة ⭐', desc: '6 تمارين (المثالي)' },
  { value: 60, label: '⏱️ 60 دقيقة', desc: '7 تمارين كاملة' },
  { value: 90, label: '⏱️ 90 دقيقة', desc: '8 تمارين شاملة' }
];

export const WEEKDAYS_AR = [
  { index: 0, id: 'sat', name: 'السبت', short: 'سبت' },
  { index: 1, id: 'sun', name: 'الأحد', short: 'أحد' },
  { index: 2, id: 'mon', name: 'الاثنين', short: 'اثنين' },
  { index: 3, id: 'tue', name: 'الثلاثاء', short: 'ثلاثاء' },
  { index: 4, id: 'wed', name: 'الأربعاء', short: 'أربعاء' },
  { index: 5, id: 'thu', name: 'الخميس', short: 'خميس' },
  { index: 6, id: 'fri', name: 'الجمعة', short: 'جمعة' }
];

function ex(id, name_ar, name_en, pattern, movement, equipment, muscles, level, avoid, safeFor, instructions) {
  const gymOnlyEquip = ['cable_machine', 'pec_deck', 'dip_station', 'leg_press', 'leg_extension_machine', 'leg_curl_machine', 'smith_machine'];
  const isGymOnly = equipment.some(e => gymOnlyEquip.includes(e));
  return {
    id,
    name_ar,
    name_en,
    pattern,
    movement,
    equipment,
    locations: isGymOnly ? ['gym'] : ['home', 'gym'],
    muscles,
    level,
    contraindicated_injuries: avoid,
    safe_for_injuries: safeFor,
    instructions
  };
}

export const EXERCISE_LIBRARY = [
  // ========================
  // 1. HORIZONTAL PUSH (CHEST)
  // ========================
  ex('push_up', 'ضغط بوزن الجسم', 'Push-up', 'horizontal_push', 'strength', [], ['chest', 'triceps', 'shoulders'], 'beginner',
    ['wrist_pain', 'shoulder_injury', 'diastasis_recti'], ['lower_back_pain', 'knee_pain'],
    ['ضع اليدين بعرض أوسع قليلًا من الكتفين مع شد الجذع.', 'انزل بصدرك بتحكم ثم ادفع للعودة.']),
  ex('incline_push_up', 'ضغط مائل على سطح مرتفع (مريح للرسغ والكتف)', 'Incline push-up', 'horizontal_push', 'strength', [], ['chest', 'triceps'], 'beginner',
    [], ['wrist_pain', 'shoulder_injury', 'diastasis_recti', 'lower_back_pain'],
    ['ضع يديك على حافة طاولة أو بنش ثابت لتقليل الضغط على الرسغ والكتف.', 'انزل بصدرك بهدوء ثم ادفع لأعلى.']),
  ex('knee_push_up', 'ضغط على الركبتين', 'Knee push-up', 'horizontal_push', 'strength', ['yoga_mat'], ['chest', 'triceps'], 'beginner',
    ['knee_pain', 'wrist_pain'], ['lower_back_pain'],
    ['اسند الركبتين على سجادة مريحة واخفض الصدر بتحكم ثم ادفع لأعلى.']),
  ex('dumbbell_floor_press', 'ضغط صدر بالدمبل على الأرض (مدى آمن للكتف)', 'Dumbbell floor press', 'horizontal_push', 'strength', ['dumbbells'], ['chest', 'triceps'], 'beginner',
    [], ['shoulder_injury', 'lower_back_pain', 'knee_pain', 'wrist_pain'],
    ['استلقِ على الأرض مع ثني الركبتين وأمسك الدمبلز بقبضة محايدة.', 'أنزل المرفقين حتى يلمسا الأرض برفق (يمنع إجهاد الكتف) ثم ادفع لأعلى.']),
  ex('dumbbell_bench_press', 'تجميع صدر بالدمبل على بنش مسطح', 'Dumbbell bench press', 'horizontal_push', 'strength', ['dumbbells', 'bench'], ['chest', 'triceps', 'shoulders'], 'beginner',
    ['shoulder_injury'], ['knee_pain', 'ankle_injury'],
    ['استلقِ على البنش وادفع الدمبلز فوق الصدر ثم أنزلهما بتحكم.']),
  ex('incline_dumbbell_press', 'تجميع صدر عالي بالدمبل', 'Incline dumbbell press', 'horizontal_push', 'strength', ['dumbbells', 'bench'], ['chest', 'shoulders', 'triceps'], 'intermediate',
    ['shoulder_injury'], ['knee_pain'],
    ['اضبط البنش بزاوية 30 درجة وادفع الدمبلز لأعلى ثم انزل بتحكم.']),
  ex('bench_press', 'بنش برس بالبار المسطح', 'Barbell flat bench press', 'horizontal_push', 'strength', ['barbell', 'bench'], ['chest', 'triceps', 'shoulders'], 'intermediate',
    ['shoulder_injury', 'wrist_pain', 'elbow_pain'], ['knee_pain', 'ankle_injury'],
    ['ثبّت لوحي الكتف على البنش وأنزل البار لمنتصف الصدر بتحكم ثم ادفعه لأعلى.']),
  ex('incline_barbell_press', 'بنش برس عالي بالبار', 'Incline barbell bench press', 'horizontal_push', 'strength', ['barbell', 'bench'], ['chest', 'shoulders', 'triceps'], 'intermediate',
    ['shoulder_injury', 'wrist_pain'], ['knee_pain'],
    ['اضبط البنش المائل وأنزل البار لأعلى الصدر بتحكم ثم ادفعه لأعلى.']),
  ex('dumbbell_fly', 'تفتيح صدر بالدمبل', 'Dumbbell chest fly', 'horizontal_push', 'strength', ['dumbbells', 'bench'], ['chest'], 'intermediate',
    ['shoulder_injury', 'elbow_pain'], ['knee_pain'],
    ['افتح الذراعين في قوس مريح مع انثناء خفيف في المرفقين ثم ضمّهما فوق الصدر.']),
  ex('cable_crossover', 'تفتيح صدر بالكابل (كروس أوفر)', 'Cable chest crossover', 'horizontal_push', 'strength', ['cable_machine'], ['chest'], 'intermediate',
    ['shoulder_injury'], ['lower_back_pain', 'wrist_pain'],
    ['اسحب المقبضين أمام الصدر مع العصر لثانية ثم عد ببطء.']),
  ex('pec_deck_fly', 'جهاز فراشة الصدر (بيك ديك)', 'Machine chest fly', 'horizontal_push', 'strength', ['pec_deck'], ['chest'], 'beginner',
    ['shoulder_injury'], ['lower_back_pain', 'knee_pain', 'wrist_pain'],
    ['اجلس وأسند ظهرك وضم الذراعين للأمام بتحكم.']),
  ex('machine_chest_press', 'جهاز دفع الصدر الجالس', 'Seated machine chest press', 'horizontal_push', 'strength', ['pec_deck'], ['chest', 'triceps'], 'beginner',
    [], ['lower_back_pain', 'knee_pain', 'ankle_injury'],
    ['اجلس وأسند ظهرك بالكامل وادفع المقابض للأمام دون قفل المرفقين.']),
  ex('band_chest_press', 'دفع صدر باستك المقاومة', 'Resistance band chest press', 'horizontal_push', 'strength', ['resistance_bands'], ['chest', 'triceps'], 'beginner',
    [], ['shoulder_injury', 'wrist_pain', 'elbow_pain', 'lower_back_pain', 'knee_pain'],
    ['ثبّت الاستك خلف ظهرك وادفع للأمام بتحكم مع شد الصدر.']),
  ex('chest_dips', 'متوازي للصدر والترايسبس', 'Parallel bar dips', 'horizontal_push', 'strength', ['dip_station'], ['chest', 'triceps', 'shoulders'], 'advanced',
    ['shoulder_injury', 'elbow_pain', 'wrist_pain'], ['knee_pain', 'lower_back_pain'],
    ['مل بالجذع للأمام قليلًا وانزل حتى زاوية 90 درجة للمرفق ثم ادفع لأعلى.']),

  // ========================
  // 2. VERTICAL & HORIZONTAL PULL (BACK)
  // ========================
  ex('lat_pulldown', 'سحب عالي أمامي للظهر (مجنص)', 'Wide-grip lat pulldown', 'vertical_pull', 'strength', ['cable_machine'], ['back', 'biceps'], 'beginner',
    [], ['lower_back_pain', 'knee_pain', 'ankle_injury', 'hip_pain'],
    ['اسحب البار نحو أعلى الصدر مع ضم لوحي الكتف ثم عد بتحكم.']),
  ex('close_grip_lat_pulldown', 'سحب عالي بقبضة ضيقة (مجنص داخلي)', 'Close-grip lat pulldown', 'vertical_pull', 'strength', ['cable_machine'], ['back', 'biceps'], 'beginner',
    [], ['shoulder_injury', 'lower_back_pain', 'knee_pain', 'wrist_pain'],
    ['اسحب المقبض الضيق لأعلى الصدر مع إبقاء المرفقين قريبين من الجذع.']),
  ex('straight_arm_pulldown', 'سحب كابل بذراع مفرود (عزل المجنص بدون تحميل للكوع)', 'Straight-arm cable pulldown', 'vertical_pull', 'strength', ['cable_machine'], ['back'], 'intermediate',
    [], ['elbow_pain', 'wrist_pain', 'knee_pain'],
    ['قف أمام الكابل العالي واسحب المسطرة في قوس نحو الفخذين بعضلات المجنص.']),
  ex('pull_up', 'عقلة بوزن الجسم', 'Pull-up', 'vertical_pull', 'strength', ['pullup_bar'], ['back', 'biceps'], 'advanced',
    ['shoulder_injury', 'elbow_pain', 'wrist_pain'], ['lower_back_pain', 'knee_pain'],
    ['تعلّق في العقلة واسحب جسمك حتى يتجاوز الذقن البار ثم انزل بتحكم.']),
  ex('chin_up', 'عقلة بقبضة معكوسة (ظهر وبايسبس)', 'Chin-up', 'vertical_pull', 'strength', ['pullup_bar'], ['back', 'biceps'], 'intermediate',
    ['elbow_pain', 'wrist_pain'], ['lower_back_pain', 'knee_pain'],
    ['أمسك العقلة بقبضة معكوسة واسحب صدرك نحو البار ثم انزل ببطء.']),
  ex('negative_pull_up', 'عقلة نزول بطيء (تطوير العقلة)', 'Eccentric pull-up', 'vertical_pull', 'strength', ['pullup_bar'], ['back', 'biceps'], 'beginner',
    ['shoulder_injury', 'elbow_pain'], ['lower_back_pain', 'knee_pain'],
    ['اصعد بمساعدة كرسي وانزل ببطء خلال 4 ثوانٍ.']),
  ex('band_lat_pulldown', 'سحب عالي للظهر باستك المقاومة', 'Resistance band lat pulldown', 'vertical_pull', 'strength', ['resistance_bands'], ['back'], 'beginner',
    [], ['lower_back_pain', 'knee_pain', 'elbow_pain', 'wrist_pain', 'shoulder_injury'],
    ['ثبّت الاستك في أعلى الباب واسحب لأسفل بجانب الصدر مع عصر الظهر.']),
  ex('dumbbell_row', 'سحب دمبل فردي مسنود للظهر', 'One-arm dumbbell row', 'horizontal_pull', 'strength', ['dumbbells'], ['back', 'biceps'], 'beginner',
    [], ['lower_back_pain', 'neck_pain', 'knee_pain'],
    ['اسند يدك الحرة على بنش أو طاولة لحماية أسفل الظهر واسحب الدمبل نحو الحوض.']),
  ex('chest_supported_dumbbell_row', 'سحب دمبل مسنود الصدر (آمن تمامًا للغضروف وأسفل الظهر)', 'Chest-supported dumbbell row', 'horizontal_pull', 'strength', ['dumbbells', 'bench'], ['back', 'biceps'], 'beginner',
    [], ['lower_back_pain', 'neck_pain', 'knee_pain', 'hip_pain'],
    ['أسند صدرك على بنش مائل واسحب الدمبلز بجانب الجذع مع ضم لوحي الكتف.']),
  ex('seated_cable_row', 'سحب أرضي جالس على الكابل للظهر', 'Seated cable row', 'horizontal_pull', 'strength', ['cable_machine'], ['back', 'biceps'], 'beginner',
    [], ['knee_pain', 'ankle_injury', 'shoulder_injury'],
    ['اجلس مع ظهر مفرود واسحب المقبض نحو البطن مع ضم لوحي الكتف.']),
  ex('barbell_bent_over_row', 'سحب بار منحني للظهر', 'Barbell bent-over row', 'horizontal_pull', 'strength', ['barbell'], ['back', 'biceps', 'lower_back'], 'intermediate',
    ['lower_back_pain', 'neck_pain'], [],
    ['اثنِ الوركين مع ظهر مستقيم واسحب البار نحو أسفل الصدر.']),
  ex('band_seated_row', 'سحب ظهر جالس باستك المقاومة', 'Resistance band seated row', 'horizontal_pull', 'strength', ['resistance_bands'], ['back', 'biceps'], 'beginner',
    [], ['lower_back_pain', 'knee_pain', 'ankle_injury', 'wrist_pain', 'shoulder_injury'],
    ['لف الاستك حول القدمين واسحب طرفيه نحو الخصر مع فرد الظهر.']),
  ex('kettlebell_row', 'سحب كيتل بيل فردي مسنود', 'Single-arm kettlebell row', 'horizontal_pull', 'strength', ['kettlebell'], ['back', 'biceps'], 'beginner',
    [], ['lower_back_pain', 'knee_pain'],
    ['اسند يدك الحرة على سطح ثابت واسحب الكيتل بيل نحو الحوض.']),
  ex('superman_hold', 'رفرف ظهر أرضي خفيف لتقوية القطنية', 'Prone back extension', 'horizontal_pull', 'strength', ['yoga_mat'], ['back', 'glutes'], 'beginner',
    ['lower_back_pain', 'diastasis_recti'], ['knee_pain', 'wrist_pain', 'shoulder_injury'],
    ['استلقِ على بطنك وارفع الصدر قليلًا عن الأرض لثانيتين ثم انزل بهدوء.']),

  // ========================
  // 3. VERTICAL PUSH & SHOULDER ISOLATION
  // ========================
  ex('dumbbell_press', 'ضغط كتف بالدمبل', 'Dumbbell shoulder press', 'vertical_push', 'strength', ['dumbbells'], ['shoulders', 'triceps'], 'beginner',
    ['shoulder_injury', 'neck_pain'], ['knee_pain', 'ankle_injury'],
    ['ادفع الدمبلز لأعلى في مدى مريح أمام الأذنين قليلًا ثم انزل بتحكم.']),
  ex('seated_dumbbell_shoulder_press', 'ضغط كتف جالس بالدمبل (مسنود الظهر)', 'Seated dumbbell shoulder press', 'vertical_push', 'strength', ['dumbbells', 'bench'], ['shoulders', 'triceps'], 'beginner',
    ['shoulder_injury', 'neck_pain'], ['lower_back_pain', 'knee_pain', 'ankle_injury'],
    ['اجلس على بنش بمسند ظهر قائم وادفع الدمبلز لأعلى بتحكم.']),
  ex('barbell_overhead_press', 'ضغط كتف أمامي بالبار', 'Barbell overhead press', 'vertical_push', 'strength', ['barbell'], ['shoulders', 'triceps', 'core'], 'intermediate',
    ['shoulder_injury', 'lower_back_pain', 'neck_pain', 'wrist_pain'], [],
    ['قف بثبات وشد البطن وادفع البار رأسيًا لأعلى ثم أنزله بتحكم.']),
  ex('arnold_press', 'أرنولد برس للكتف بالدمبل', 'Arnold dumbbell press', 'vertical_push', 'strength', ['dumbbells'], ['shoulders', 'triceps'], 'intermediate',
    ['shoulder_injury', 'neck_pain'], ['knee_pain'],
    ['ابدأ بالدمبلز أمام الكتفين وادفع لأعلى مع تدوير المعصم ببطء.']),
  ex('lateral_raise', 'رفرفة كتف جانبي بالدمبل', 'Dumbbell lateral raise', 'shoulder_isolation', 'strength', ['dumbbells'], ['shoulders'], 'beginner',
    ['neck_pain'], ['lower_back_pain', 'knee_pain', 'ankle_injury', 'hip_pain'],
    ['ارفع الدمبلز للجانبين حتى مستوى الكتف فقط مع انثناء خفيف في المرفق.']),
  ex('band_lateral_raise', 'رفرفة كتف جانبي باستك المقاومة', 'Band lateral raise', 'shoulder_isolation', 'strength', ['resistance_bands'], ['shoulders'], 'beginner',
    [], ['lower_back_pain', 'knee_pain', 'wrist_pain', 'elbow_pain'],
    ['قف على منتصف الاستك وارفع الذراعين للجانبين لمستوى الكتف.']),
  ex('front_raise', 'رفرفة كتف أمامي بالدمبل', 'Dumbbell front raise', 'shoulder_isolation', 'strength', ['dumbbells'], ['shoulders'], 'beginner',
    ['shoulder_injury'], ['lower_back_pain', 'knee_pain'],
    ['ارفع الدمبلز للأمام بالتبادل حتى مستوى الكتف ثم اخفضها ببطء.']),
  ex('rear_delt_fly', 'رفرفة كتف خلفي بالدمبل', 'Rear delt dumbbell fly', 'shoulder_isolation', 'strength', ['dumbbells'], ['shoulders', 'back'], 'beginner',
    [], ['shoulder_injury', 'neck_pain', 'knee_pain'],
    ['مل بالجذع للأمام وافتح الذراعين للخلف لعزل الكتف الخلفي.']),
  ex('face_pull', 'فيس بول بالكابل (تأهيل وتقوية الكتف والرقبة)', 'Cable face pull', 'shoulder_isolation', 'strength', ['cable_machine'], ['shoulders', 'back'], 'beginner',
    [], ['shoulder_injury', 'neck_pain', 'lower_back_pain', 'knee_pain'],
    ['اسحب الحبل نحو الجبهة مع تدوير الكتفين للخارج لتقوية الكفة المدورة.']),
  ex('band_pull_apart', 'فتح استك المقاومة للكتف الخلفي وأعلى الظهر (تأهيل الكتف)', 'Band pull-apart', 'shoulder_isolation', 'strength', ['resistance_bands'], ['shoulders', 'back'], 'beginner',
    [], ['shoulder_injury', 'neck_pain', 'lower_back_pain', 'knee_pain', 'wrist_pain', 'elbow_pain'],
    ['أمسك الاستك أمام صدرك وافتح الذراعين للجانبين مع ضم لوحي الكتف.']),
  ex('dumbbell_shrug', 'ترابيس بالدمبل', 'Dumbbell shrug', 'shoulder_isolation', 'strength', ['dumbbells'], ['shoulders', 'back'], 'beginner',
    ['neck_pain'], ['knee_pain', 'lower_back_pain'],
    ['ارفع الكتفين لأعلى باتجاه الأذنين واثبت لثانية ثم انزل.']),

  // ========================
  // 4. ARMS (BICEPS & TRICEPS)
  // ========================
  ex('biceps_curl', 'تبادل بايسبس بالدمبل', 'Dumbbell biceps curl', 'elbow_flexion', 'strength', ['dumbbells'], ['biceps'], 'beginner',
    ['wrist_pain'], ['lower_back_pain', 'knee_pain', 'shoulder_injury', 'neck_pain'],
    ['اثنِ المرفق لرفع الدمبل دون مرجحة الظهر ثم أنزله بتحكم.']),
  ex('hammer_curl', 'هامر كيرل (شاكوش) بالدمبل (آمن للرسغ والكوع)', 'Dumbbell hammer curl', 'elbow_flexion', 'strength', ['dumbbells'], ['biceps', 'forearms'], 'beginner',
    [], ['wrist_pain', 'elbow_pain', 'shoulder_injury', 'lower_back_pain', 'knee_pain'],
    ['أمسك الدمبلز بقبضة محايدة (الإبهام للأعلى) وارفع الوزن بتحكم لحماية الرسغ والكوع.']),
  ex('incline_dumbbell_curl', 'بايسبس بالدمبل على بنش مائل', 'Incline dumbbell curl', 'elbow_flexion', 'strength', ['dumbbells', 'bench'], ['biceps'], 'intermediate',
    ['elbow_pain'], ['lower_back_pain', 'knee_pain'],
    ['اجلس على بنش مائل واثنِ المرفقين لرفع الدمبلز بتركيز كامل.']),
  ex('barbell_curl', 'بايسبس بالبار', 'Barbell biceps curl', 'elbow_flexion', 'strength', ['barbell'], ['biceps'], 'intermediate',
    ['wrist_pain', 'elbow_pain'], ['knee_pain'],
    ['ارفع البار بثني المرفقين دون أرجحة الجذع ثم اخفضه ببطء.']),
  ex('cable_biceps_curl', 'بايسبس على الكابل السفلي', 'Cable biceps curl', 'elbow_flexion', 'strength', ['cable_machine'], ['biceps'], 'beginner',
    [], ['lower_back_pain', 'knee_pain', 'shoulder_injury'],
    ['قف أمام البكرة السفلية وارفع المقبض مع ثبات المرفقين بجانب الخصر.']),
  ex('band_biceps_curl', 'بايسبس باستك المقاومة', 'Resistance band biceps curl', 'elbow_flexion', 'strength', ['resistance_bands'], ['biceps'], 'beginner',
    [], ['wrist_pain', 'elbow_pain', 'lower_back_pain', 'knee_pain', 'shoulder_injury'],
    ['قف على منتصف الاستك واثنِ المرفقين لرفع اليدين نحو الكتفين.']),
  ex('concentration_curl', 'بايسبس ارتكاز فردي بالدمبل', 'Concentration curl', 'elbow_flexion', 'strength', ['dumbbells'], ['biceps'], 'beginner',
    [], ['lower_back_pain', 'knee_pain', 'neck_pain'],
    ['اجلس وأسند ظهر الذراع على الفخذ من الداخل وارفع الدمبل بتركيز.']),
  ex('triceps_pushdown', 'ترايسبس بالحبل أو المسطرة على الكابل', 'Cable triceps pushdown', 'elbow_extension', 'strength', ['cable_machine'], ['triceps'], 'beginner',
    [], ['shoulder_injury', 'lower_back_pain', 'knee_pain', 'neck_pain'],
    ['ثبت المرفقين بجانب الجذع وافرد الساعدين لأسفل بالكامل ثم عد ببطء.']),
  ex('band_triceps_pushdown', 'ترايسبس باستك المقاومة', 'Band triceps pushdown', 'elbow_extension', 'strength', ['resistance_bands'], ['triceps'], 'beginner',
    [], ['elbow_pain', 'wrist_pain', 'shoulder_injury', 'lower_back_pain', 'knee_pain'],
    ['ثبّت الاستك في أعلى الباب وافرد المرفقين لأسفل مع ثبات الذراعين.']),
  ex('overhead_dumbbell_triceps', 'ترايسبس فرنساوي خلف الرأس بالدمبل', 'Overhead dumbbell triceps extension', 'elbow_extension', 'strength', ['dumbbells'], ['triceps'], 'intermediate',
    ['shoulder_injury', 'elbow_pain', 'neck_pain'], ['knee_pain'],
    ['ارفع دمبل بكلتا اليدين خلف الرأس واثنِ المرفقين ثم افردهما لأعلى.']),
  ex('skull_crusher', 'ترايسبس نائم بالدمبل بقبضة محايدة', 'Lying dumbbell triceps extension', 'elbow_extension', 'strength', ['dumbbells', 'bench'], ['triceps'], 'intermediate',
    ['elbow_pain'], ['lower_back_pain', 'knee_pain', 'neck_pain'],
    ['استلقِ على البنش وأنزل الدمبلز بجانب الجبهة ثم ادفعهما لأعلى.']),
  ex('dumbbell_kickback', 'ترايسبس رفاص بالدمبل', 'Dumbbell triceps kickback', 'elbow_extension', 'strength', ['dumbbells'], ['triceps'], 'beginner',
    [], ['shoulder_injury', 'wrist_pain', 'elbow_pain', 'knee_pain'],
    ['ثبّت أعلى الذراع بموازاة الجسم وافرد الساعد للخلف بالكامل.']),
  ex('bench_dip', 'ترايسبس على حافة البنش أو الكرسي', 'Bench dip', 'elbow_extension', 'strength', ['bench'], ['triceps', 'shoulders'], 'beginner',
    ['shoulder_injury', 'wrist_pain', 'elbow_pain'], ['knee_pain', 'lower_back_pain'],
    ['ضع يديك على حافة البنش وانزل بمدى قصير مريح للكتف ثم ادفع لأعلى.']),
  ex('diamond_push_up', 'ضغط ضيق للترايسبس', 'Close-grip push-up', 'elbow_extension', 'strength', [], ['triceps', 'chest'], 'intermediate',
    ['wrist_pain', 'elbow_pain', 'shoulder_injury'], ['knee_pain', 'lower_back_pain'],
    ['ضع اليدين تحت الصدر وانزل مع إبقاء المرفقين قريبين من الجذع.']),

  // ========================
  // 5. SQUAT, LUNGE & QUAD PATTERNS (LEGS)
  // ========================
  ex('bodyweight_squat', 'سكوات بوزن الجسم', 'Bodyweight squat', 'squat', 'strength', [], ['quadriceps', 'glutes'], 'beginner',
    ['knee_pain'], ['lower_back_pain', 'shoulder_injury', 'wrist_pain', 'elbow_pain', 'neck_pain'],
    ['قف بثبات مع فتح القدمين بعرض الكتفين وانزل بتحكم ثم ادفع بالكعبين للوقوف.']),
  ex('box_squat', 'سكوات على كرسي أو صندوق (مدى آمن ومريح للركبة)', 'Box squat / Chair sit-to-stand', 'squat', 'strength', [], ['quadriceps', 'glutes'], 'beginner',
    [], ['knee_pain', 'lower_back_pain', 'ankle_injury', 'hip_pain', 'diastasis_recti'],
    ['قف أمام كرسي ثابت وارجع بالحوض للخلف حتى تلمس المقعد برفق (يمنع الضغط الزائد على الركبة) ثم قف.']),
  ex('wall_sit', 'ثبات الحائط لتقوية الفخذ الأمامي بدون احتكاك للركبة', 'Isometric wall sit', 'squat', 'strength', [], ['quadriceps', 'glutes'], 'beginner',
    [], ['knee_pain', 'lower_back_pain', 'neck_pain', 'shoulder_injury', 'wrist_pain'],
    ['أسند ظهرك على الحائط وانزل لزاوية مريحة (45–60 درجة) واثبت لتقوية العضلة الرباعية بأمان.']),
  ex('goblet_squat', 'جوبلت سكوات بالدمبل', 'Dumbbell goblet squat', 'squat', 'strength', ['dumbbells'], ['quadriceps', 'glutes', 'core'], 'beginner',
    ['knee_pain'], ['neck_pain', 'shoulder_injury'],
    ['أمسك الدمبل أمام الصدر وانزل في وضع السكوات مع ظهر مفرود ثم قف.']),
  ex('kettlebell_goblet_squat', 'جوبلت سكوات بالكيتل بيل', 'Kettlebell goblet squat', 'squat', 'strength', ['kettlebell'], ['quadriceps', 'glutes'], 'beginner',
    ['knee_pain'], ['neck_pain'],
    ['أمسك الكيتل بيل أمام الصدر وانزل بتحكم ثم ادفع بالكعبين للوقوف.']),
  ex('barbell_back_squat', 'سكوات خلفي بالبار', 'Barbell back squat', 'squat', 'strength', ['barbell'], ['quadriceps', 'glutes', 'hamstrings'], 'intermediate',
    ['knee_pain', 'lower_back_pain', 'neck_pain', 'shoulder_injury', 'diastasis_recti'], [],
    ['ضع البار على عضلات أعلى الظهر وانزل بتحكم ثم ادفع بالكعبين للوقوف.']),
  ex('leg_press', 'جهاز دفع الأرجل (ليج برس)', 'Seated leg press', 'squat', 'strength', ['leg_press'], ['quadriceps', 'glutes'], 'beginner',
    ['knee_pain'], ['lower_back_pain', 'neck_pain', 'shoulder_injury', 'wrist_pain'],
    ['اجلس وأسند ظهرك بالكامل وادفع المنصة بالقدمين دون قفل الركبتين.']),
  ex('leg_extension', 'جهاز رفرفة أرجل أمامي', 'Seated leg extension', 'squat', 'strength', ['leg_extension_machine'], ['quadriceps'], 'beginner',
    ['knee_pain'], ['lower_back_pain', 'neck_pain', 'shoulder_injury', 'hip_pain'],
    ['اضبط المسند فوق الكاحل وافرد الركبتين للأمام بتحكم ثم انزل ببطء.']),
  ex('reverse_lunge', 'طعن خلفي بوزن الجسم (أخف على الركبة)', 'Reverse lunge', 'lunge', 'strength', [], ['quadriceps', 'glutes'], 'beginner',
    ['knee_pain', 'ankle_injury'], ['lower_back_pain', 'shoulder_injury', 'wrist_pain'],
    ['ارجع بقدم واحدة للخلف مع النزول الرأسي ثم ادفع بكعب القدم الأمامية للوقوف.']),
  ex('dumbbell_lunge', 'طعن بالدمبل', 'Dumbbell lunge', 'lunge', 'strength', ['dumbbells'], ['quadriceps', 'glutes'], 'intermediate',
    ['knee_pain', 'ankle_injury'], ['neck_pain', 'shoulder_injury'],
    ['أمسك دمبل في كل يد واخْطُ للخلف بتحكم ثم عد لنقطة البداية.']),
  ex('bulgarian_split_squat', 'سكوات بلغاري فردي', 'Bulgarian split squat', 'lunge', 'strength', ['dumbbells', 'bench'], ['quadriceps', 'glutes'], 'advanced',
    ['knee_pain', 'ankle_injury', 'hip_pain'], ['lower_back_pain'],
    ['ضع مشط القدم الخلفية على بنش وانزل رأسيًا بالقدم الأمامية ثم ادفع لأعلى.']),
  ex('step_up', 'صعود البنش أو الدرجة المنخفضة (ستيب أب)', 'Bench step-up', 'lunge', 'strength', ['bench'], ['quadriceps', 'glutes'], 'beginner',
    ['ankle_injury'], ['lower_back_pain', 'neck_pain', 'wrist_pain'],
    ['اصعد على درجة أو بنش منخفض بالدفع من الكعب ثم انزل بهدوء.']),

  // ========================
  // 6. HINGE, GLUTES, HAMSTRINGS & CALVES
  // ========================
  ex('glute_bridge', 'جسر الألوية الأرضي (آمن ومثالي للركبة وأسفل الظهر والانفصال العضلي)', 'Bodyweight glute bridge', 'hinge', 'strength', ['yoga_mat'], ['glutes', 'hamstrings', 'core'], 'beginner',
    [], ['knee_pain', 'lower_back_pain', 'ankle_injury', 'hip_pain', 'diastasis_recti', 'wrist_pain', 'shoulder_injury', 'neck_pain'],
    ['استلقِ على ظهرك مع ثني الركبتين وادفع بالكعبين لرفع الحوض مع عصر الأرداف دون تقوس الظهر.']),
  ex('dumbbell_hip_thrust', 'هيب ثراست بالدمبل على البنش (تقوية الأرداف والخلفيات بدون ضغط على الركبة)', 'Dumbbell hip thrust', 'hinge', 'strength', ['dumbbells', 'bench'], ['glutes', 'hamstrings'], 'beginner',
    [], ['knee_pain', 'lower_back_pain', 'ankle_injury', 'wrist_pain', 'shoulder_injury'],
    ['أسند أعلى الظهر على البنش وضع الدمبل فوق الحوض وادفع بالكعبين لأعلى.']),
  ex('barbell_hip_thrust', 'هيب ثراست بالبار', 'Barbell hip thrust', 'hinge', 'strength', ['barbell', 'bench'], ['glutes', 'hamstrings'], 'intermediate',
    ['hip_pain', 'diastasis_recti'], ['knee_pain', 'lower_back_pain'],
    ['أسند أعلى الظهر على البنش وارفع الحوض بالبار للأعلى مع عصر الأرداف.']),
  ex('romanian_deadlift_dumbbell', 'ديدليفت روماني بالدمبل للخلفيات والأرداف', 'Dumbbell Romanian deadlift', 'hinge', 'strength', ['dumbbells'], ['hamstrings', 'glutes', 'lower_back'], 'beginner',
    ['lower_back_pain'], ['knee_pain', 'ankle_injury', 'shoulder_injury'],
    ['أمسك الدمبلز أمام الفخذين وادفع الحوض للخلف مع ظهر مفرود تمامًا ثم قف.']),
  ex('romanian_deadlift_barbell', 'ديدليفت روماني بالبار', 'Barbell Romanian deadlift', 'hinge', 'strength', ['barbell'], ['hamstrings', 'glutes', 'lower_back'], 'intermediate',
    ['lower_back_pain', 'wrist_pain'], ['knee_pain'],
    ['حافظ على قرب البار من الساقين وادفع الحوض للخلف مع ظهر مستقيم ثم قف.']),
  ex('lying_leg_curl', 'جهاز رفرفة أرجل خلفي (خلفيات الفخذ)', 'Machine hamstring curl', 'hinge', 'strength', ['leg_curl_machine'], ['hamstrings'], 'beginner',
    [], ['lower_back_pain', 'knee_pain', 'hip_pain', 'neck_pain', 'shoulder_injury', 'wrist_pain'],
    ['اثنِ الركبتين على الجهاز لعصر عضلة الفخذ الخلفية ثم عد ببطء.']),
  ex('kettlebell_swing', 'مرجحة الكيتل بيل (كيتل بيل سوينج)', 'Kettlebell swing', 'hinge', 'strength', ['kettlebell'], ['glutes', 'hamstrings', 'cardio'], 'intermediate',
    ['lower_back_pain', 'shoulder_injury', 'wrist_pain', 'diastasis_recti'], ['knee_pain'],
    ['ادفع الحوض للخلف ثم للأمام بقوة لرفع الكيتل بيل لمستوى الصدر مع ظهر مفرود.']),
  ex('band_glute_kickback', 'رفس خلفي باستك المقاومة للأرداف', 'Band glute kickback', 'glute_isolation', 'strength', ['resistance_bands'], ['glutes'], 'beginner',
    [], ['knee_pain', 'lower_back_pain', 'wrist_pain', 'shoulder_injury'],
    ['لف الاستك حول الكاحلين وادفع الساق للخلف ببطء لعزل عضلة الألوية.']),
  ex('clamshell', 'تمرين المحارة الجانبي (تأهيل وتقوية الحوض والركبة)', 'Side-lying clamshell', 'glute_isolation', 'strength', ['yoga_mat'], ['glutes'], 'beginner',
    [], ['knee_pain', 'hip_pain', 'lower_back_pain', 'ankle_injury', 'diastasis_recti'],
    ['استلقِ على جانبك مع ثني الركبتين وافتح الركبة العلوية لأعلى مع ثبات الحوض.']),
  ex('side_lying_leg_raise', 'رفع الساق الجانبي الأرضي (آمن تمامًا للركبة والكاحل)', 'Side-lying hip abduction', 'glute_isolation', 'strength', ['yoga_mat'], ['glutes'], 'beginner',
    [], ['knee_pain', 'ankle_injury', 'lower_back_pain', 'wrist_pain', 'shoulder_injury'],
    ['استلقِ على جانبك وارفع الساق العلوية المفرودة لأعلى ببطء لتقوية الحوض.']),
  ex('standing_calf_raise', 'سمانة واقف', 'Standing calf raise', 'calf', 'strength', [], ['calves'], 'beginner',
    ['ankle_injury'], ['knee_pain', 'lower_back_pain', 'shoulder_injury', 'wrist_pain'],
    ['قف بثبات وارفع الكعبين لأقصى مدى ثم انزل ببطء.']),
  ex('seated_calf_raise', 'سمانة جالس بالدمبل فوق الركبتين', 'Seated dumbbell calf raise', 'calf', 'strength', ['dumbbells', 'bench'], ['calves'], 'beginner',
    ['ankle_injury'], ['knee_pain', 'lower_back_pain', 'hip_pain'],
    ['اجلس على البنش وضع الدمبلز فوق أواخر الفخذين وارفع الكعبين لأعلى.']),

  // ========================
  // 7. CORE & POSTPARTUM / DIASTASIS RECTI SAFE CORE
  // ========================
  ex('plank', 'بلانك ثابت للجذع', 'Forearm plank', 'core_stability', 'strength', [], ['core'], 'beginner',
    ['diastasis_recti', 'shoulder_injury'], ['knee_pain', 'wrist_pain'],
    ['اسند الساعدين وأصابع القدمين في خط مستقيم وشد البطن والأرداف.']),
  ex('dead_bug', 'ديد باج لتقوية الجذع العميق (آمن لأسفل الظهر والانفصال العضلي)', 'Dead bug core stability', 'postpartum_core', 'strength', ['yoga_mat'], ['core'], 'beginner',
    [], ['lower_back_pain', 'diastasis_recti', 'knee_pain', 'neck_pain', 'wrist_pain', 'ankle_injury'],
    ['استلقِ على ظهرك واطبع أسفل الظهر على السجادة ومد ذراعًا مع الساق المعاكسة ببطء مع الزفير.']),
  ex('bird_dog', 'بيرد دوج لتوازن الجذع والفقرات القطنية', 'Bird-dog', 'postpartum_core', 'strength', ['yoga_mat'], ['core', 'lower_back', 'glutes'], 'beginner',
    ['wrist_pain'], ['lower_back_pain', 'diastasis_recti', 'neck_pain', 'ankle_injury'],
    ['ارتكز على اليدين والركبتين وافرد ذراعًا للأمام مع الساق المعاكسة للخلف واثبت لثانيتين.']),
  ex('pelvic_tilt_breathing', 'تنفس الحجاب الحاجز وشد البطن العميقة (تأهيل الانفصال العضلي)', 'Diaphragmatic breathing & pelvic tilt', 'postpartum_core', 'mobility', ['yoga_mat'], ['core'], 'beginner',
    [], ['diastasis_recti', 'lower_back_pain', 'knee_pain', 'hip_pain', 'neck_pain', 'shoulder_injury'],
    ['استلقِ على ظهرك ومع الزفير اسحب السرة للداخل برفق مع إمالة الحوض لملامسة السجادة.']),
  ex('heel_slides', 'زحف الكعب الأرضي لتقوية البطن العميقة بعد الولادة', 'Supine heel slides', 'postpartum_core', 'strength', ['yoga_mat'], ['core'], 'beginner',
    [], ['diastasis_recti', 'lower_back_pain', 'knee_pain', 'hip_pain', 'neck_pain', 'wrist_pain'],
    ['استلقِ على ظهرك مع شد البطن العميقة وحرّك كعب قدم واحدة للأمام ببطء ثم عد.']),
  ex('glute_bridge_march', 'جسر الألوية مع التبديل الهادئ للجذع والحوض', 'Glute bridge march', 'postpartum_core', 'strength', ['yoga_mat'], ['glutes', 'core'], 'beginner',
    [], ['diastasis_recti', 'lower_back_pain', 'knee_pain', 'wrist_pain'],
    ['ارفع الحوض في وضع جسر الألوية وارفع قدمًا واحدة بضعة سنتيمترات بتحكم ثم بدّل.']),
  ex('side_plank', 'بلانك جانبي', 'Side plank', 'core_stability', 'strength', ['yoga_mat'], ['core'], 'intermediate',
    ['shoulder_injury', 'elbow_pain'], ['lower_back_pain', 'knee_pain', 'wrist_pain'],
    ['ارتكز على ساعد واحد وارفع الحوض ليكون الجسم في خط مستقيم.']),
  ex('pallof_press', 'بالوف برس لمقاومة التفاف الجذع (آمن للعمود الفقري)', 'Pallof press', 'core_stability', 'strength', ['resistance_bands'], ['core'], 'beginner',
    [], ['lower_back_pain', 'diastasis_recti', 'neck_pain', 'knee_pain'],
    ['قف بجانب نقطة تثبيت الاستك وادفع اليدين أمام الصدر مع مقاومة الالتفاف.']),
  ex('abdominal_crunch', 'كرانش للبطن على السجادة', 'Abdominal crunch', 'core_flexion', 'strength', ['yoga_mat'], ['core'], 'beginner',
    ['diastasis_recti', 'lower_back_pain', 'neck_pain'], ['knee_pain', 'wrist_pain', 'ankle_injury'],
    ['ارفع لوحي الكتف قليلًا عن الأرض بعصر البطن دون شد الرقبة ثم انزل ببطء.']),
  ex('bicycle_crunch', 'بدال البطن (بايسيكل كرانش)', 'Bicycle crunch', 'core_flexion', 'strength', ['yoga_mat'], ['core'], 'intermediate',
    ['diastasis_recti', 'lower_back_pain', 'neck_pain'], ['wrist_pain', 'ankle_injury'],
    ['بدّل تقريب الكوع للركبة المعاكسة ببطء وتحكم مع ثبات أسفل الظهر.']),
  ex('hanging_knee_raise', 'رفع الركبتين على العقلة للبطن السفلي', 'Hanging knee raise', 'core_flexion', 'strength', ['pullup_bar'], ['core'], 'advanced',
    ['diastasis_recti', 'shoulder_injury', 'wrist_pain', 'lower_back_pain'], ['knee_pain', 'ankle_injury'],
    ['تعلّق في العقلة وارفع الركبتين نحو الصدر بتحكم دون تأرجح.']),
  ex('russian_twist', 'التفاف الجذع الجالس (راشن تويست)', 'Seated Russian twist', 'core_flexion', 'strength', ['yoga_mat'], ['core'], 'intermediate',
    ['diastasis_recti', 'lower_back_pain'], ['knee_pain', 'ankle_injury', 'wrist_pain'],
    ['اجلس مع ثني الركبتين وفرد الظهر ولف الجذع لليمين واليسار بتحكم.']),

  // ========================
  // 8. CARDIO & CONDITIONING (LOW IMPACT & HIGH IMPACT)
  // ========================
  ex('walking', 'مشي سريع أو منتظم', 'Brisk walking', 'low_impact_cardio', 'cardio', [], ['legs', 'cardio'], 'beginner',
    ['ankle_injury'], ['knee_pain', 'lower_back_pain', 'diastasis_recti', 'shoulder_injury', 'neck_pain', 'wrist_pain'],
    ['امشِ بخطوة نشطة ومريحة للمفاصل مع تحريك الذراعين.']),
  ex('stationary_cycling', 'عجلة ثابتة (مريحة للركبة والكاحل والظهر)', 'Stationary cycling', 'low_impact_cardio', 'cardio', ['cardio_machine'], ['legs', 'cardio'], 'beginner',
    [], ['knee_pain', 'lower_back_pain', 'ankle_injury', 'diastasis_recti', 'shoulder_injury'],
    ['اضبط ارتفاع المقعد وبدّل بإيقاع منتظم ومقاومة مريحة للمفاصل.']),
  ex('treadmill_incline_walk', 'مشي مائل على المشاية لحرق الدهون', 'Incline treadmill walk', 'low_impact_cardio', 'cardio', ['cardio_machine'], ['legs', 'cardio'], 'beginner',
    ['ankle_injury'], ['lower_back_pain', 'shoulder_injury', 'wrist_pain'],
    ['اضبط المشاية على ميل متوسط (4–8%) وامشِ بسرعة نشطة.']),
  ex('low_impact_marching', 'مشي رياضي نشط في المكان (كارديو منزلي آمن للمفاصل)', 'Low-impact marching in place', 'low_impact_cardio', 'cardio', [], ['legs', 'cardio'], 'beginner',
    ['ankle_injury'], ['knee_pain', 'lower_back_pain', 'diastasis_recti', 'shoulder_injury', 'wrist_pain'],
    ['ارفع الركبتين بالتبادل في المكان مع تحريك الذراعين بنشاط دون قفز.']),
  ex('step_jacks', 'ستيب جاكس بدون قفز (كارديو منزلي آمن للركبة والظهر)', 'Low-impact step jacks', 'low_impact_cardio', 'cardio', [], ['whole_body', 'cardio'], 'beginner',
    [], ['knee_pain', 'lower_back_pain', 'ankle_injury', 'diastasis_recti'],
    ['اخْطُ بقدم واحدة للجانب مع رفع الذراعين ثم عد للمنتصف وبدّل بإيقاع نشط.']),
  ex('shadow_boxing', 'ملاكمة هوائية سريعة (كارديو علوي آمن تمامًا للساقين)', 'Shadow boxing cardio', 'low_impact_cardio', 'cardio', [], ['shoulders', 'core', 'cardio'], 'beginner',
    ['shoulder_injury', 'elbow_pain'], ['knee_pain', 'ankle_injury', 'hip_pain', 'lower_back_pain'],
    ['قف أو اجلس بثبات وسدّد لكمات أمامية وجانبية في الهواء بإيقاع نشط.']),
  ex('seated_arm_cardio', 'كارديو ذراعين جالس (آمن 100% لإصابات الركبة والكاحل والحوض)', 'Seated upper-body cardio punches', 'low_impact_cardio', 'cardio', [], ['shoulders', 'cardio'], 'beginner',
    ['shoulder_injury'], ['knee_pain', 'ankle_injury', 'hip_pain', 'lower_back_pain', 'diastasis_recti'],
    ['اجلس على كرسي ثابت وحرّك الذراعين في لكمات وحركات سريعة لرفع النبض بأمان تام للساقين.']),
  ex('rowing_machine_cardio', 'جهاز التجديف (روينج ماشين)', 'Rowing machine ergometer', 'low_impact_cardio', 'cardio', ['cable_machine'], ['back', 'legs', 'cardio'], 'intermediate',
    ['lower_back_pain', 'knee_pain'], ['ankle_injury'],
    ['ادفع بالساقين أولًا ثم اسحب المقبض نحو الصدر مع ظهر مفرود.']),
  ex('jump_rope_basic', 'نط الحبل الإيقاعي', 'Jump rope', 'high_impact_cardio', 'cardio', ['jump_rope'], ['calves', 'cardio'], 'intermediate',
    ['knee_pain', 'ankle_injury', 'lower_back_pain', 'hip_pain', 'diastasis_recti'], [],
    ['اقفز قفزات منخفضة على أمشاط القدمين مع هبوط ناعم.']),
  ex('jumping_jacks', 'فتح وضم بالقفز (جامبنج جاكس)', 'Jumping jacks', 'high_impact_cardio', 'cardio', [], ['whole_body', 'cardio'], 'beginner',
    ['knee_pain', 'ankle_injury', 'lower_back_pain', 'hip_pain', 'diastasis_recti', 'shoulder_injury'], [],
    ['اقفز مع فتح القدمين ورفع الذراعين لأعلى ثم اهبط بنعومة.']),
  ex('mountain_climber', 'متسلق الجبال (ماونتن كلايمبر)', 'Mountain climber', 'high_impact_cardio', 'cardio', ['yoga_mat'], ['core', 'cardio'], 'intermediate',
    ['wrist_pain', 'shoulder_injury', 'lower_back_pain', 'knee_pain', 'diastasis_recti'], [],
    ['اثبت في وضع البلانك العلوي وبدّل سحب الركبتين نحو الصدر بإيقاع نشط.']),

  // ========================
  // 9. MOBILITY, WARMUP & REHAB
  // ========================
  ex('easy_mobility', 'إحماء وإطالة ديناميكية للمفاصل', 'Gentle joint mobility', 'mobility', 'mobility', [], ['whole_body'], 'beginner',
    [], ['knee_pain', 'lower_back_pain', 'neck_pain', 'shoulder_injury', 'elbow_pain', 'wrist_pain', 'ankle_injury', 'hip_pain', 'diastasis_recti'],
    ['ابدأ بحركات دائرية هادئة للكتفين والحوض والكاحلين داخل مدى مريح.']),
  ex('cat_cow_mobility', 'تمرين القطة والجمل لمرونة العمود الفقري', 'Cat-cow spinal mobility', 'mobility', 'mobility', ['yoga_mat'], ['back', 'core'], 'beginner',
    ['wrist_pain'], ['lower_back_pain', 'neck_pain', 'diastasis_recti'],
    ['ارتكز على اليدين والركبتين وقوّس الظهر لأعلى مع الزفير ثم اخفضه برفق مع الشهيق.']),
  ex('thoracic_open_book', 'فتح الكتاب لمرونة أعلى الظهر والكتف', 'Thoracic spine open book', 'mobility', 'mobility', ['yoga_mat'], ['back', 'shoulders'], 'beginner',
    [], ['shoulder_injury', 'neck_pain', 'lower_back_pain', 'knee_pain'],
    ['استلقِ على جانبك وافتح الذراع العلوية للجهة المقابلة مع تدوير أعلى الظهر بهدوء.']),
  ex('hip_flexor_stretch', 'إطالة عضلات الحوض الأمامية', 'Kneeling hip flexor stretch', 'mobility', 'mobility', ['yoga_mat'], ['glutes', 'legs'], 'beginner',
    ['knee_pain'], ['lower_back_pain', 'hip_pain'],
    ['مل بالحوض قليلًا للأمام مع شد الأرداف لإطالة مقدمة الفخذ والحوض.']),
  ex('wall_slides', 'انزلاق الذراعين على الحائط لتأهيل الكتف والرقبة', 'Scapular wall slides', 'mobility', 'mobility', [], ['shoulders', 'back'], 'beginner',
    [], ['shoulder_injury', 'neck_pain', 'lower_back_pain', 'knee_pain', 'wrist_pain'],
    ['أسند الظهر والذراعين على الحائط وحرّك الذراعين لأعلى ولأسفل ببطء.']),
  ex('ankle_mobility_rock', 'مرونة الكاحل الأمامية الآمنة', 'Ankle dorsiflexion mobility', 'mobility', 'mobility', [], ['calves', 'legs'], 'beginner',
    [], ['ankle_injury', 'knee_pain'],
    ['قف أمام الحائط وحرّك الركبة للأمام برفق مع بقاء الكعب على الأرض.']),
  ex('childs_pose_breathing', 'وضع الطفل للاسترخاء وإطالة أسفل الظهر', 'Child pose stretch & breathing', 'mobility', 'mobility', ['yoga_mat'], ['back', 'shoulders'], 'beginner',
    ['knee_pain'], ['lower_back_pain', 'neck_pain', 'diastasis_recti'],
    ['اجلس على الكعبين ومد الذراعين للأمام وخذ أنفاسًا عميقة لإرخاء الظهر.']),
  ex('neck_chin_tuck', 'سحب الذقن الخفيف لتقويم فقرات الرقبة', 'Cervical chin tuck', 'mobility', 'mobility', [], ['neck', 'shoulders'], 'beginner',
    [], ['neck_pain', 'shoulder_injury', 'lower_back_pain', 'knee_pain'],
    ['اسحب الذقن للخلف أفقيًا برفق لثانيتين لتخفيف إجهاد الرقبة ثم استرخِ.']),
  ex('wrist_extensor_stretch', 'إطالة وتأهيل مفصل الرسغ والساعد', 'Wrist mobility & stretch', 'mobility', 'mobility', [], ['forearms'], 'beginner',
    [], ['wrist_pain', 'elbow_pain'],
    ['افرد ذراعك للأمام وحرّك الكف لأعلى ولأسفل بلطف ودوّر المعصمين ببطء.'])
];

export const INJURY_LABELS_MAP = Object.fromEntries(INJURIES.map(i => [i.id, i.label]));
export const EQUIPMENT_LABELS_MAP = Object.fromEntries(HOME_EQUIPMENT.map(e => [e.id, e.label]));

export function effectiveInjuries(workoutPrefs = {}, profile = {}) {
  const raw = Array.isArray(workoutPrefs.injuries)
    ? workoutPrefs.injuries.filter(x => x && x !== 'none')
    : Array.isArray(profile?.injuries)
      ? profile.injuries.filter(x => x && x !== 'none')
      : [];
  return [...new Set(raw)];
}

export function isExerciseSafe(ex, injuries = [], maternalStatus = 'none') {
  const activeInjuries = new Set(injuries.filter(x => x && x !== 'none'));
  if (maternalStatus && maternalStatus.startsWith('pregnant')) {
    activeInjuries.add('diastasis_recti');
    activeInjuries.add('lower_back_pain');
    if (ex.pattern === 'high_impact_cardio') return false;
  }
  for (const inj of activeInjuries) {
    if (ex.contraindicated_injuries.includes(inj)) return false;
  }
  return true;
}

export function isExerciseAvailableAtLocation(ex, dayLocation = 'gym', homeEquipment = ['none']) {
  if (dayLocation === 'gym') return true;
  if (!ex.locations.includes('home')) return false;
  if (!ex.equipment.length) return true;
  const equipSet = new Set(Array.isArray(homeEquipment) ? homeEquipment : ['none']);
  // yoga_mat is optional comfort equipment — can be done on a rug/carpet at home
  return ex.equipment.every(req => req === 'yoga_mat' || equipSet.has(req));
}

export function getTrainingDayIndices(count) {
  const n = Math.max(1, Math.min(7, Number(count) || 3));
  const layouts = {
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6]
  };
  return layouts[n] || layouts[3];
}

export function buildDefaultDayLocations(
  workoutDaysCount = 3,
  workoutLocation = 'gym_only',
  customDayLocations = null,
  selectedWorkoutDays = null
) {
  let activeIndices;
  if (Array.isArray(selectedWorkoutDays) && selectedWorkoutDays.length > 0) {
    activeIndices = [...new Set(selectedWorkoutDays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  } else if (customDayLocations && typeof customDayLocations === 'object' && Object.keys(customDayLocations).length > 0) {
    activeIndices = Object.keys(customDayLocations)
      .map(Number)
      .filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
      .sort((a, b) => a - b);
  }
  if (!activeIndices || !activeIndices.length) {
    activeIndices = getTrainingDayIndices(workoutDaysCount);
  }

  const out = {};
  activeIndices.forEach((dayIdx, i) => {
    if (workoutLocation === 'home_only') {
      out[dayIdx] = 'home';
    } else if (workoutLocation === 'gym_only') {
      out[dayIdx] = 'gym';
    } else if (customDayLocations && (customDayLocations[dayIdx] === 'home' || customDayLocations[dayIdx] === 'gym')) {
      out[dayIdx] = customDayLocations[dayIdx];
    } else {
      out[dayIdx] = i % 2 === 0 ? 'gym' : 'home';
    }
  });
  return out;
}

function getSplitDefinitions(daysCount, splitPreference = 'auto', locationMode = 'gym_only') {
  const n = Math.max(1, Math.min(7, Number(daysCount) || 3));
  const effectiveSplit = resolveWorkoutSplit(splitPreference, n, locationMode);

  const fullBodyTemplates = [
    {
      title: 'تمارين شاملة للجسم (Full Body A)',
      focus: 'التركيز الأساسي: الصدر والظهر والفخذ الأمامي والجذع',
      patterns: ['squat', 'horizontal_push', 'horizontal_pull', 'hinge', 'shoulder_isolation', 'postpartum_core', 'low_impact_cardio']
    },
    {
      title: 'تمارين شاملة للجسم (Full Body B)',
      focus: 'التركيز الأساسي: الألوية والخلفيات والكتف والسحب العلوي والذراعين',
      patterns: ['hinge', 'vertical_pull', 'vertical_push', 'lunge', 'elbow_flexion', 'elbow_extension', 'core_stability']
    },
    {
      title: 'تمارين شاملة وأداء حركي (Full Body C)',
      focus: 'التركيز الأساسي: تناسق العضلات العلوية والسفلية ورفع معدل الحرق',
      patterns: ['squat', 'horizontal_push', 'vertical_pull', 'glute_isolation', 'shoulder_isolation', 'elbow_flexion', 'low_impact_cardio']
    },
    {
      title: 'تمارين شاملة وقوة وظيفية (Full Body D)',
      focus: 'التركيز الأساسي: الأكتاف والذراعين والأرداف والجذع العميق',
      patterns: ['hinge', 'vertical_push', 'horizontal_pull', 'lunge', 'elbow_extension', 'elbow_flexion', 'postpartum_core']
    }
  ];

  const upperLowerTemplates = [
    {
      title: 'الجزء العلوي أ (Upper Body A — قوة وتحديد)',
      focus: 'الصدر والظهر والأكتاف والذراعين',
      patterns: ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'elbow_flexion', 'elbow_extension', 'shoulder_isolation']
    },
    {
      title: 'الجزء السفلي والجذع أ (Lower Body & Core A)',
      focus: 'الفخذ الأمامي والأرداف والخلفيات والسمانة والبطن',
      patterns: ['squat', 'hinge', 'lunge', 'glute_isolation', 'calf', 'postpartum_core', 'low_impact_cardio']
    },
    {
      title: 'الجزء العلوي ب (Upper Body B — كثافة عضلية)',
      focus: 'تنوع زوايا السحب والدفع وتقوية الكتف والذراعين',
      patterns: ['vertical_pull', 'horizontal_push', 'horizontal_pull', 'shoulder_isolation', 'elbow_extension', 'elbow_flexion', 'core_stability']
    },
    {
      title: 'الجزء السفلي والجذع ب (Lower Body & Core B)',
      focus: 'الأرداف والخلفيات والفخذ وتقوية الجذع العميق',
      patterns: ['hinge', 'squat', 'glute_isolation', 'lunge', 'calf', 'postpartum_core', 'low_impact_cardio']
    },
    {
      title: 'الجزء العلوي ج (Upper Body C — زوايا وعزل)',
      focus: 'أعلى الصدر والكتف الجانبي والذراعين',
      patterns: ['horizontal_push', 'vertical_pull', 'shoulder_isolation', 'shoulder_isolation', 'elbow_flexion', 'elbow_extension', 'core_stability']
    },
    {
      title: 'الجزء السفلي ج (Lower Body & Conditioning C)',
      focus: 'الأرجل والأرداف والبطن واللياقة القلبية',
      patterns: ['squat', 'hinge', 'glute_isolation', 'calf', 'postpartum_core', 'low_impact_cardio', 'mobility']
    }
  ];

  const pplTemplates = [
    {
      title: 'يوم الدفع (Push A — صدر وكتف وترايسبس)',
      focus: 'عضلات الصدر والأكتاف الأمامية والجانبية والترايسبس',
      patterns: ['horizontal_push', 'horizontal_push', 'vertical_push', 'shoulder_isolation', 'elbow_extension', 'elbow_extension', 'core_stability']
    },
    {
      title: 'يوم السحب (Pull A — ظهر وكتف خلفي وبايسبس)',
      focus: 'عضلات الظهر العلوية والوسطى والكتف الخلفي والبايسبس',
      patterns: ['vertical_pull', 'horizontal_pull', 'horizontal_pull', 'shoulder_isolation', 'elbow_flexion', 'elbow_flexion', 'postpartum_core']
    },
    {
      title: 'يوم الأرجل والأرداف (Legs & Glutes A)',
      focus: 'الفخذ الأمامي والخلفي والأرداف والسمانة والبطن',
      patterns: ['squat', 'hinge', 'lunge', 'glute_isolation', 'calf', 'postpartum_core', 'low_impact_cardio']
    },
    {
      title: 'دفع ب (Push B — زوايا علوية وعزل)',
      focus: 'أعلى الصدر والكتف الجانبي والترايسبس',
      patterns: ['horizontal_push', 'vertical_push', 'horizontal_push', 'shoulder_isolation', 'elbow_extension', 'elbow_extension', 'core_stability']
    },
    {
      title: 'سحب ب (Pull B — سُمك الظهر والبايسبس)',
      focus: 'تفاصيل الظهر والكتف الخلفي والساعد والبايسبس',
      patterns: ['horizontal_pull', 'vertical_pull', 'horizontal_pull', 'shoulder_isolation', 'elbow_flexion', 'elbow_flexion', 'postpartum_core']
    },
    {
      title: 'أرجل ب (Legs B — خلفيات وأرداف وجذع)',
      focus: 'الخلفيات والألوية والسمانة والبطن',
      patterns: ['hinge', 'squat', 'glute_isolation', 'lunge', 'calf', 'postpartum_core', 'low_impact_cardio']
    },
    {
      title: 'يوم استشفاء نشط ومرونة وكارديو خفيف (Active Recovery)',
      focus: 'إطالة المفاصل والعمود الفقري وتنشيط الدورة الدموية بدون إجهاد عصبي',
      patterns: ['mobility', 'mobility', 'postpartum_core', 'low_impact_cardio', 'mobility']
    }
  ];

  const broSplitTemplates = n === 3
    ? [
        {
          title: 'يوم الصدر والأكتاف والترايسبس (Chest, Shoulders & Triceps)',
          focus: 'تركيز كامل على زوايا الصدر والكتف والترايسبس',
          patterns: ['horizontal_push', 'horizontal_push', 'vertical_push', 'shoulder_isolation', 'elbow_extension', 'elbow_extension', 'core_stability']
        },
        {
          title: 'يوم الظهر والبايسبس والكتف الخلفي (Back & Biceps)',
          focus: 'اتساع وسُمك الظهر وتكوير البايسبس',
          patterns: ['vertical_pull', 'horizontal_pull', 'horizontal_pull', 'shoulder_isolation', 'elbow_flexion', 'elbow_flexion', 'postpartum_core']
        },
        {
          title: 'يوم الأرجل والأرداف والبطن (Legs, Calves & Abs)',
          focus: 'الفخذ الأمامي والخلفي والسمانة والبطن',
          patterns: ['squat', 'hinge', 'lunge', 'glute_isolation', 'calf', 'postpartum_core', 'low_impact_cardio']
        }
      ]
    : n === 4
      ? [
          {
            title: 'يوم الصدر والبايسبس (Chest & Biceps — كلاسيك الجيم)',
            focus: 'تمارين الصدر العالي والمستوي والتفتيح مع عزل البايسبس',
            patterns: ['horizontal_push', 'horizontal_push', 'horizontal_push', 'elbow_flexion', 'elbow_flexion', 'core_stability', 'low_impact_cardio']
          },
          {
            title: 'يوم الظهر والترايسبس (Back & Triceps)',
            focus: 'تمارين السحب العالي والأفقي للظهر مع زوايا الترايسبس',
            patterns: ['vertical_pull', 'horizontal_pull', 'horizontal_pull', 'elbow_extension', 'elbow_extension', 'postpartum_core', 'mobility']
          },
          {
            title: 'يوم الأكتاف والترابيس والبطن (Shoulders, Traps & Core)',
            focus: 'الكتف الأمامي والجانبي والخلفي وتقوية البطن',
            patterns: ['vertical_push', 'shoulder_isolation', 'shoulder_isolation', 'horizontal_pull', 'postpartum_core', 'core_stability', 'low_impact_cardio']
          },
          {
            title: 'يوم الأرجل والأرداف والسمانة (Leg Day)',
            focus: 'السكوات والخلفيات والطعن والألوية والسمانة',
            patterns: ['squat', 'hinge', 'lunge', 'glute_isolation', 'calf', 'postpartum_core', 'mobility']
          }
        ]
      : [
          {
            title: 'يوم الصدر الكامل والبطن (International Chest Day)',
            focus: 'الصدر العالي والمستوي والتفتيح وتقوية الجذع',
            patterns: ['horizontal_push', 'horizontal_push', 'horizontal_push', 'elbow_extension', 'postpartum_core', 'core_stability', 'low_impact_cardio']
          },
          {
            title: 'يوم الظهر والمجنص والقطنية (Back Width & Thickness)',
            focus: 'السحب العلوي والأفقي والكتف الخلفي',
            patterns: ['vertical_pull', 'horizontal_pull', 'horizontal_pull', 'vertical_pull', 'shoulder_isolation', 'postpartum_core', 'mobility']
          },
          {
            title: 'يوم الأكتاف والترابيس (Boulder Shoulders)',
            focus: 'الضغط العلوي والرفرفة الجانبية والخلفية والترابيس',
            patterns: ['vertical_push', 'shoulder_isolation', 'shoulder_isolation', 'horizontal_pull', 'core_stability', 'postpartum_core', 'low_impact_cardio']
          },
          {
            title: 'يوم الأرجل والأرداف والسمانة (Leg Day)',
            focus: 'الفخذ الأمامي والخلفي والأرداف والسمانة',
            patterns: ['squat', 'hinge', 'lunge', 'glute_isolation', 'calf', 'postpartum_core', 'mobility']
          },
          {
            title: 'يوم الذراعين الكامل: باي وتراي وساعد (Arm Blaster)',
            focus: 'ضخ الدم وتكوير البايسبس والترايسبس والساعد',
            patterns: ['elbow_flexion', 'elbow_extension', 'elbow_flexion', 'elbow_extension', 'shoulder_isolation', 'core_stability', 'low_impact_cardio']
          },
          {
            title: 'يوم نقاط الضعف واللياقة والبطن (Conditioning & Core)',
            focus: 'تنشيط شامل وحرق دهون ومرونة المفاصل',
            patterns: ['squat', 'horizontal_push', 'vertical_pull', 'glute_isolation', 'postpartum_core', 'low_impact_cardio', 'mobility']
          }
        ];

  if (effectiveSplit === 'full_body') return fullBodyTemplates.slice(0, n);
  if (effectiveSplit === 'upper_lower') return upperLowerTemplates.slice(0, n);
  if (effectiveSplit === 'bro_split') return broSplitTemplates.slice(0, n);
  if (effectiveSplit === 'ppl' && n === 5) {
    return [
      pplTemplates[0],
      pplTemplates[1],
      pplTemplates[2],
      upperLowerTemplates[0],
      upperLowerTemplates[1]
    ];
  }
  return pplTemplates.slice(0, n);
}

function pickExerciseForPattern(pattern, dayLocation, homeEquipment, injuries, maternalStatus, level, usedIds) {
  const candidates = EXERCISE_LIBRARY.filter(ex =>
    ex.pattern === pattern &&
    isExerciseAvailableAtLocation(ex, dayLocation, homeEquipment) &&
    isExerciseSafe(ex, injuries, maternalStatus)
  );
  const fallbackPool = candidates.length
    ? candidates
    : EXERCISE_LIBRARY.filter(ex =>
        isExerciseAvailableAtLocation(ex, dayLocation, homeEquipment) &&
        isExerciseSafe(ex, injuries, maternalStatus) &&
        ex.movement === (pattern.includes('cardio') ? 'cardio' : pattern === 'mobility' ? 'mobility' : 'strength')
      );
  if (!fallbackPool.length) return null;

  const rankExercise = ex => {
    let score = 0;
    if (!usedIds.has(ex.id)) score += 50;
    // Prefer exercises specifically tagged as safe rehab/alternatives for the user's injuries
    for (const inj of injuries) {
      if (ex.safe_for_injuries.includes(inj)) score += 25;
    }
    // Prefer equipment-using exercises if user is at gym or selected home equipment
    if (dayLocation === 'gym' && ex.equipment.length > 0) score += 12;
    if (dayLocation === 'home' && ex.equipment.some(e => e !== 'yoga_mat' && homeEquipment.includes(e))) score += 12;
    if (ex.level === level) score += 8;
    else if (level === 'beginner' && ex.level === 'advanced') score -= 15;
    return score;
  };

  return [...fallbackPool].sort((a, b) => rankExercise(b) - rankExercise(a))[0];
}

function prescriptionForExercise(ex, level = 'beginner', goal = 'maintain', injuries = []) {
  const baseSets = FITNESS_LEVELS[level]?.defaultSets || 3;
  if (ex.movement === 'cardio') {
    const mins = goal === 'lose' ? '12–15 دقيقة' : '8–10 دقائق';
    return {
      sets: 1,
      reps: mins,
      rest: 'راحة حسب الحاجة',
      tempo: 'إيقاع منتظم ومريح للتنفس'
    };
  }
  if (ex.movement === 'mobility') {
    return {
      sets: 2,
      reps: '10 عدات هادئة أو 30 ثانية',
      rest: '30 ثانية',
      tempo: 'حركة بطيئة داخل مدى مريح بدون ألم'
    };
  }
  const hasJointInjury = injuries.length > 0;
  if (hasJointInjury) {
    return {
      sets: Math.max(2, baseSets),
      reps: '12–15 عدة بوزن خفيف إلى متوسط وتحكم كامل',
      rest: '60–75 ثانية',
      tempo: 'نزول بطيء (3 ثوانٍ) بدون اندفاع لحماية المفاصل'
    };
  }
  if (goal === 'muscle_gain' || goal === 'gain') {
    return {
      sets: baseSets,
      reps: '8–12 عدة',
      rest: '75–90 ثانية',
      tempo: 'تحكم كامل في النزول وعصر العضلة في القمة'
    };
  }
  if (goal === 'lose') {
    return {
      sets: baseSets,
      reps: '12–15 عدة',
      rest: '45–60 ثانية',
      tempo: 'إيقاع نشط مع الحفاظ على الأداء الصحيح'
    };
  }
  return {
    sets: baseSets,
    reps: '10–12 عدة',
    rest: '60–75 ثانية',
    tempo: 'أداء متوازن وتحكم في المدى الحركي'
  };
}

export function estimateExerciseSeconds(ex, rx) {
  if (!ex || !rx) return 0;
  if (ex.movement === 'cardio') return 8 * 60;
  if (ex.movement === 'mobility') return (rx.sets || 2) * 45 + 30;
  const sets = Number(rx.sets) || 3;
  const restSec = ex.pattern && ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'lunge'].includes(ex.pattern) ? 90 : 60;
  return sets * 40 + Math.max(0, sets - 1) * restSec + 45;
}

export function generateWorkoutWeek(workoutPrefs = {}, profile = {}) {
  const level = FITNESS_LEVELS[workoutPrefs.fitnessLevel] ? workoutPrefs.fitnessLevel : 'beginner';
  const requestedDays = Array.isArray(workoutPrefs.selectedWorkoutDays) && workoutPrefs.selectedWorkoutDays.length
    ? workoutPrefs.selectedWorkoutDays
    : Array.isArray(profile?.workoutDays) && profile.workoutDays.length
      ? profile.workoutDays
      : null;
  const rawRequestedCount = workoutPrefs.workoutDaysCount ?? profile?.trainingDays ?? 3;
  const isExplicitZeroDays = Number(rawRequestedCount) === 0 && (!requestedDays || requestedDays.length === 0);
  const fallbackCount = isExplicitZeroDays ? 0 : Math.max(1, Math.min(7, Number(rawRequestedCount) || 3));
  const locationMode = WORKOUT_LOCATIONS[workoutPrefs.workoutLocation] ? workoutPrefs.workoutLocation : 'gym_only';
  const homeEquipment = Array.isArray(workoutPrefs.homeEquipment) && workoutPrefs.homeEquipment.length
    ? workoutPrefs.homeEquipment
    : ['none'];
  const duration = Number(workoutPrefs.sessionDuration) || 45;
  const injuries = effectiveInjuries(workoutPrefs, profile);
  const maternalStatus = profile?.maternalStatus || 'none';
  const goal = profile?.goal || 'maintain';

  const dayLocations = isExplicitZeroDays
    ? {}
    : buildDefaultDayLocations(fallbackCount, locationMode, workoutPrefs.dayLocations, requestedDays);
  const activeDayIndices = Object.keys(dayLocations).map(Number).sort((a, b) => a - b);
  const daysCount = activeDayIndices.length;
  const splitPreference = workoutPrefs.workoutSplitPreference || 'auto';
  const effectiveSplit = daysCount === 0 ? 'none' : resolveWorkoutSplit(splitPreference, daysCount, locationMode);
  const splits = daysCount === 0 ? [] : getSplitDefinitions(daysCount, splitPreference, locationMode);

  const maxPatternCap = duration <= 20 ? 4 : duration <= 30 ? 5 : duration <= 45 ? 6 : duration <= 60 ? 7 : 8;

  const injuryAdjustments = [];
  if (injuries.includes('knee_pain')) {
    injuryAdjustments.push('تم استبعاد تمارين القفز والسكوات العميق واستبدالها بتمارين آمنة للركبة (جسر الألوية، هيب ثراست، سكوات الصندوق المحدد، وثبات الحائط).');
  }
  if (injuries.includes('lower_back_pain')) {
    injuryAdjustments.push('تم استبعاد التحميل المحوري الثقيل على العمود الفقري (البار المنحني والسكوات الخلفي) واستبدالها بتمارين مسنودة الصدر والـ Dead Bug.');
  }
  if (injuries.includes('shoulder_injury')) {
    injuryAdjustments.push('تم استبعاد الضغط العلوي الحاد والمتوازي واستبدالها بضغط الأرض المحدد المدى وتمارين تقوية الكفة المدورة (Face Pull / Band Pull-Apart).');
  }
  if (injuries.includes('wrist_pain') || injuries.includes('elbow_pain')) {
    injuryAdjustments.push('تم اختيار تمارين بقبضة محايدة مريحة للرسغ والكوع (مثل الهامر كيرل والضغط المائل والكابل/الاستك).');
  }
  if (injuries.includes('neck_pain')) {
    injuryAdjustments.push('تم استبعاد التمارين التي تضغط على الفقرات العنقية مع إضافة تمارين إطالة وتقويم الرقبة.');
  }
  if (injuries.includes('ankle_injury') || injuries.includes('hip_pain')) {
    injuryAdjustments.push('تم استبعاد القفز والطعن الحاد واستبدالها بتمارين أرضية وجالسة تحافظ على ثبات الكاحل والحوض.');
  }
  if (injuries.includes('diastasis_recti')) {
    injuryAdjustments.push('تم حظر الكرانش والبلانك التقليدي واستبدالها بتمارين تأهيل قاع الحوض والبطن العميقة (Dead Bug، تنفس الحجاب الحاجز، وزحف الكعب).');
  }

  let splitIdx = 0;
  const days = WEEKDAYS_AR.map(wd => {
    const isTrainingDay = Object.hasOwn(dayLocations, wd.index);
    if (!isTrainingDay) {
      return {
        dayIndex: wd.index,
        dayId: wd.id,
        dayName: wd.name,
        isTrainingDay: false,
        location: 'rest',
        locationLabel: 'يوم راحة واستشفاء 🌿',
        title: 'راحة واستشفاء عضلي',
        focus: 'المشي الخفيف 15–20 دقيقة، شرب المياه، والنوم الجيد لبناء العضلات.',
        durationMinutes: 15,
        exercises: []
      };
    }

    const loc = dayLocations[wd.index] || (locationMode === 'home_only' ? 'home' : 'gym');
    const split = splits[splitIdx % splits.length];
    splitIdx++;

    const usedIds = new Set();
    const patterns = split.patterns.slice(0, maxPatternCap);
    while (patterns.length < maxPatternCap) {
      patterns.push(patterns.length % 2 === 0 ? 'postpartum_core' : 'mobility');
    }

    const exercises = [];
    let elapsedSeconds = 240; // 4 min warmup/cooldown baseline
    const budgetSeconds = duration * 60;

    for (const pat of patterns) {
      const chosen = pickExerciseForPattern(pat, loc, homeEquipment, injuries, maternalStatus, level, usedIds);
      if (!chosen) continue;
      const rx = prescriptionForExercise(chosen, level, goal, injuries);
      const exSeconds = estimateExerciseSeconds(chosen, rx);
      if (exercises.length >= 2 && elapsedSeconds + exSeconds > budgetSeconds) {
        continue;
      }
      usedIds.add(chosen.id);
      elapsedSeconds += exSeconds;
      const safeMatch = injuries.filter(inj => chosen.safe_for_injuries.includes(inj));
      exercises.push({
        slotIndex: exercises.length,
        id: chosen.id,
        name_ar: chosen.name_ar,
        name_en: chosen.name_en,
        pattern: chosen.pattern,
        movement: chosen.movement,
        muscles: chosen.muscles,
        equipment: chosen.equipment,
        sets: rx.sets,
        reps: rx.reps,
        rest: rx.rest,
        tempo: rx.tempo,
        instructions: chosen.instructions,
        injury_safe_badge: safeMatch.length
          ? 'بديل منخفض التحميل لـ: ' + safeMatch.map(i => INJURY_LABELS_MAP[i]?.replace(/ [\u{1F300}-\u{1FAFF}]/gu, '') || i).join('، ')
          : null
      });
    }

    if (!exercises.length) {
      throw Error('لا توجد تمارين مناسبة تجمع بين المعدات المختارة والقيود الصحية الحالية؛ يُرجى مراجعة مختص أو تعديل المعدات المتاحة.');
    }

    const estimatedMinutes = Math.min(duration, Math.max(10, Math.ceil(elapsedSeconds / 60)));

    return {
      dayIndex: wd.index,
      dayId: wd.id,
      dayName: wd.name,
      isTrainingDay: true,
      location: loc,
      locationLabel: loc === 'home' ? '🏠 تمرين في البيت' : '🏋️ تمرين في الجيم',
      title: split.title,
      focus: split.focus,
      durationMinutes: duration,
      estimatedMinutes,
      warmup: '5 دقائق إحماء مفصلي ديناميكي (دوران الكتفين والحوض ومشي في المكان)',
      cooldown: '3–5 دقائق إطالة هادئة وتنفس عميق لتهدئة النبض',
      exercises
    };
  });

  const splitName = WORKOUT_SPLITS[effectiveSplit]?.shortLabel || (
    daysCount <= 3
      ? 'Full Body (شامل للجسم)'
      : daysCount === 4
        ? 'Upper / Lower (علوي / سفلي)'
        : 'Push / Pull / Legs (دفع · سحب · أرجل)'
  );

  return {
    splitName,
    workoutSplitPreference: splitPreference,
    effectiveSplit,
    fitnessLevel: level,
    fitnessLevelLabel: FITNESS_LEVELS[level]?.shortLabel || 'مبتدئ',
    workoutDaysCount: daysCount,
    selectedWorkoutDays: activeDayIndices,
    workoutLocation: locationMode,
    workoutLocationLabel: WORKOUT_LOCATIONS[locationMode]?.shortLabel || 'الجيم',
    sessionDuration: duration,
    homeEquipment,
    injuries,
    injuryAdjustments,
    days,
    totalLibraryExercises: EXERCISE_LIBRARY.length
  };
}

export function getExerciseAlternatives(exerciseId, dayLocation = 'gym', workoutPrefs = {}, profile = {}) {
  const current = EXERCISE_LIBRARY.find(e => e.id === exerciseId);
  if (!current) return [];
  const homeEquipment = Array.isArray(workoutPrefs.homeEquipment) && workoutPrefs.homeEquipment.length
    ? workoutPrefs.homeEquipment
    : ['none'];
  const injuries = effectiveInjuries(workoutPrefs, profile);
  const maternalStatus = profile?.maternalStatus || 'none';
  const level = workoutPrefs.fitnessLevel || 'beginner';
  const goal = profile?.goal || 'maintain';

  const samePattern = EXERCISE_LIBRARY.filter(ex =>
    ex.id !== exerciseId &&
    ex.pattern === current.pattern &&
    isExerciseAvailableAtLocation(ex, dayLocation, homeEquipment) &&
    isExerciseSafe(ex, injuries, maternalStatus)
  );
  const sameMuscle = EXERCISE_LIBRARY.filter(ex =>
    ex.id !== exerciseId &&
    !samePattern.some(s => s.id === ex.id) &&
    ex.muscles.some(m => current.muscles.includes(m)) &&
    isExerciseAvailableAtLocation(ex, dayLocation, homeEquipment) &&
    isExerciseSafe(ex, injuries, maternalStatus)
  );

  return [...samePattern, ...sameMuscle].slice(0, 6).map(ex => {
    const rx = prescriptionForExercise(ex, level, goal, injuries);
    return {
      id: ex.id,
      name_ar: ex.name_ar,
      name_en: ex.name_en,
      pattern: ex.pattern,
      movement: ex.movement,
      muscles: ex.muscles,
      equipment: ex.equipment,
      sets: rx.sets,
      reps: rx.reps,
      rest: rx.rest,
      tempo: rx.tempo,
      instructions: ex.instructions
    };
  });
}
