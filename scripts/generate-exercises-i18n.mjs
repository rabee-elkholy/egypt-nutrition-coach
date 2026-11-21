#!/usr/bin/env node
/**
 * Generates `data/exercises-i18n.json` from `data/exercises.json`.
 * - 100% coverage of all 69 muscles (English + natural anatomical/fitness Arabic).
 * - 100% coverage of all 868 exercises (natural Arabic names with zero Latin letters,
 *   clean step-by-step English & Arabic instructions, and biomechanically accurate
 *   English & Arabic common mistakes).
 * - Does NOT modify `data/exercises.json`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_PATH = resolve(ROOT, 'data/exercises.json');
const OUTPUT_PATH = resolve(ROOT, 'data/exercises-i18n.json');
const VERSION = '20261121-i18n.1';

/** Exact Arabic names for all 69 muscles in data/exercises.json */
const MUSCLES_AR = {
  chest: 'الصدر',
  back: 'الظهر',
  lower_back: 'أسفل الظهر',
  shoulders: 'الأكتاف',
  biceps: 'البايسبس',
  triceps: 'الترايسبس',
  forearms: 'الساعدان',
  abs: 'عضلات البطن والجذع',
  glutes: 'الأرداف',
  quads: 'الفخذ الأمامي',
  hamstrings: 'الفخذ الخلفي',
  adductors: 'عضلات الفخذ الداخلية',
  calves: 'السمانة',
  neck: 'الرقبة',
  pectoralis_major: 'عضلة الصدر الكبرى',
  pecs_clavicular: 'أعلى الصدر (الترقوي)',
  pecs_sternocostal: 'وسط وأسفل الصدر',
  pectoralis_minor: 'عضلة الصدر الصغرى',
  serratus_anterior: 'العضلة المنشارية الأمامية',
  latissimus_dorsi: 'العضلة الظهرية العريضة (اللاتس)',
  trapezius: 'عضلة الترابيس',
  traps_upper: 'الترابيس العلوية',
  traps_middle: 'الترابيس الوسطى',
  traps_lower: 'الترابيس السفلية',
  rhomboids: 'العضلات المعينية (وسط الظهر)',
  teres_major: 'العضلة المدورة الكبرى',
  erector_spinae: 'العضلات الناصبة للعمود الفقري',
  quadratus_lumborum: 'العضلة المربعة القطنية',
  deltoid: 'العضلة الدالية (الكتف)',
  delt_anterior: 'الكتف الأمامي',
  delt_lateral: 'الكتف الجانبي',
  delt_posterior: 'الكتف الخلفي',
  rotator_cuff: 'عضلات الكفة المدورة',
  biceps_brachii: 'عضلة البايسبس (ذات الرأسين)',
  biceps_long_head: 'الرأس الطويل للبايسبس',
  biceps_short_head: 'الرأس القصير للبايسبس',
  brachialis: 'العضلة العضدية',
  triceps_brachii: 'عضلة الترايسبس (ذات الرؤوس الثلاثة)',
  triceps_long_head: 'الرأس الطويل للترايسبس',
  triceps_lateral_head: 'الرأس الجانبي للترايسبس',
  triceps_medial_head: 'الرأس الإنسي للترايسبس',
  brachioradialis: 'العضلة العضدية الكعبرية',
  wrist_flexors: 'قابضات المعصم',
  wrist_extensors: 'باسطات المعصم',
  rectus_abdominis: 'عضلة البطن المستقيمة',
  obliques: 'عضلات البطن الجانبية (المائلة)',
  obliques_external: 'العضلات المائلة الخارجية',
  obliques_internal: 'العضلات المائلة الداخلية',
  transversus_abdominis: 'عضلة البطن المستعرضة',
  diaphragm: 'الحجاب الحاجز',
  hip_flexors: 'قابضات الورك',
  gluteus_maximus: 'الألوية الكبرى',
  gluteus_medius: 'الألوية الوسطى',
  gluteus_minimus: 'الألوية الصغرى',
  quadriceps: 'عضلات الفخذ الأمامية (الرباعية)',
  rectus_femoris: 'المستقيمة الفخذية',
  vastus_lateralis: 'المتسعة الوحشية (الفخذ الخارجي)',
  vastus_medialis: 'المتسعة الإنسية (الدمعة)',
  vastus_intermedius: 'المتسعة الوسطى',
  hamstring_complex: 'عضلات الفخذ الخلفية',
  biceps_femoris: 'ذات الرأسين الفخذية',
  semitendinosus: 'نصف الوترية',
  semimembranosus: 'نصف الغشائية',
  hip_adductors: 'العضلات المقربة للورك',
  gastrocnemius: 'عضلة السمانة العلوية (التوأمية)',
  soleus: 'العضلة النعلية (السمانة السفلية)',
  tibialis_anterior: 'العضلة الظنبوبية الأمامية',
  neck_flexors: 'قابضات الرقبة',
  neck_extensors: 'باسطات الرقبة',
};

/** Exact Arabic names for all 848 unique exercise names in data/exercises.json (zero Latin chars) */
const EXACT_EXERCISE_NAMES_AR = {
  'Two-Arm Kettlebell Swing': 'أرجحة الكيتل بيل باليدين',
  'Seated Hip Adduction': 'ضم الفخذين على الجهاز جالساً',
  'Arnold Shoulder Press': 'ضغط كتف أرنولد بالدامبل',
  'Axe Hold': 'ثبات الفأس بالدامبل للأكتاف',
  'Barbell Ab Rollout': 'دحرجة البطن بالبار',
  'Barbell Hack Squat': 'هاك سكوات بالبار',
  'Standing Barbell Lunge': 'لانج واقفاً بالبار',
  'Barbell Reverse Wrist Curl': 'ثني المعصم العكسي بالبار',
  'Barbell Triceps Extension': 'تمديد الترايسبس بالبار فوق الرأس',
  'Barbell Wrist Curl': 'ثني المعصم بالبار',
  'Abdominal Stabilization': 'تثبيت عضلات البطن والجذع',
  'Bear Walk': 'مشي الدب بوزن الجسم',
  'Single Leg Extension': 'فرد الركبة على الجهاز بساق واحدة',
  'Bench Press': 'ضغط صدر بالبار على بنش مستوٍ',
  'Dumbbell Bench Press': 'ضغط صدر بالدامبل على بنش مستوٍ',
  'Bench Press Narrow Grip': 'ضغط صدر بالبار بقبضة ضيقة',
  'Bent High Pulls': 'سحب علوي مائل بالدامبل',
  'One-Arm Dumbbell Row': 'تجديف بالدامبل بذراع واحدة',
  'Bent-Over Lateral Raise': 'رفرفة خلفية مائلة بالدامبل',
  'Barbell Bent-Over Row': 'تجديف بالبار مع انحناء الجذع',
  'Reverse-Grip Barbell Bent-Over Row': 'تجديف بالبار بقبضة معكوسة',
  'Barbell Biceps Curl': 'ثني البايسبس بالبار',
  'Dumbbell Biceps Curl': 'ثني البايسبس بالدامبل',
  'EZ-Bar Biceps Curl': 'ثني البايسبس بالبار المتعرج',
  'Cable Biceps Curl': 'ثني البايسبس بالكابل',
  'Body-Ups': 'دفع الجسم على الساعدين للترايسبس',
  'Braced Squat': 'سكوات بالقرص الحديدي أمام الصدر',
  'Chest Press': 'ضغط صدر على الجهاز',
  'Burpees': 'تمرين البيربي',
  'Pec Deck Fly (Butterfly)': 'تفتيح صدر على جهاز الفراشة',
  'Butterfly Narrow Grip': 'تفتيح صدر على الجهاز بقبضة ضيقة',
  'Reverse Pec Deck (Rear Delt Fly)': 'تفتيح خلفي على الجهاز للكتف الخلفي',
  'Cable External Rotation': 'تدوير الكتف الخارجي بالكابل',
  'Cable Woodchopper': 'تقطيع الحطب بالكابل للجذع',
  'Calf Press Using Leg Press Machine': 'ضغط السمانة على جهاز دفع الأرجل',
  'Hack Squat Calf Raise': 'رفع السمانة على جهاز الهاك سكوات',
  'Chin Up': 'عقلة بقبضة معكوسة',
  'Close-Grip Lat Pulldown': 'سحب عالٍ للظهر بقبضة ضيقة',
  'Cross-Bench Dumbbell Pullovers': 'بول أوفر بالدامبل على البنش',
  'Swiss Ball Knee Tuck': 'ضم الركبتين على الكرة السويسرية',
  'Crunch': 'تمرين طحن البطن',
  'Decline Crunch': 'طحن البطن على بنش مائل سفلي',
  'Machine Crunch': 'طحن البطن على الجهاز',
  'Cable Kneeling Crunch': 'طحن البطن بالكابل من الركوع',
  'Vertical Leg Crunch': 'طحن البطن مع رفع الساقين عمودياً',
  'Cycling': 'ركوب الدراجة الهوائية',
  'Deadbug': 'تمرين الحشرة الميتة للبطن',
  'Deadhang': 'التعلق الثابت على العقلة',
  'Conventional Deadlift': 'الرفعة الميتة التقليدية بالبار',
  'Decline Bench Press Barbell': 'ضغط صدر سفلي بالبار',
  'Decline Bench Press Dumbbell': 'ضغط صدر سفلي بالدامبل',
  'Deficit Deadlift': 'الرفعة الميتة من منصة مرتفعة بالبار',
  'Diagonal Shoulder Press': 'ضغط كتف قطري بالبار',
  'Dips': 'تمرين الغطس على المتوازي',
  'Dips Between Two Benches': 'غطس الترايسبس بين مقعدين',
  'Dumbbell Concentration Curl': 'ثني البايسبس بالتركيز بالدامبل',
  'Dumbbell Goblet Squat': 'سكوات الكأس بالدامبل',
  'Dumbbell Incline Curl': 'ثني البايسبس بالدامبل على بنش مائل',
  'Dumbbell Lunges Standing': 'لانج ثابت بالدامبل',
  'Dumbbell Lunges Walking': 'لانج بالمشي بالدامبل',
  'Dumbbells on Scott Machine': 'ثني البايسبس بالدامبل على مقعد سكوت',
  'Dumbbell Triceps Extension': 'تمديد الترايسبس بالدامبل',
  'Facepull': 'سحب الكابل نحو الوجه',
  'Flutter Kicks': 'ركلات الرفرفة للبطن السفلي',
  'Fly With Cable': 'تفتيح الصدر بالكابل',
  'Fly With Dumbbells': 'تفتيح الصدر بالدامبل على بنش مستوٍ',
  'Decline Dumbbell Fly': 'تفتيح صدر سفلي بالدامبل',
  'Dumbbell Skull Crusher': 'تمديد الترايسبس بالدامبل مستلقياً',
  'Skullcrusher EZ-Bar': 'تمديد الترايسبس بالبار المتعرج مستلقياً',
  'Front Raises with Plates': 'رفع أمامي للكتف بالقرص الحديدي',
  'Front Raises': 'رفع أمامي للكتف بالدامبل',
  'Front Squats': 'سكوات أمامي بالبار',
  'Front pull wide': 'سحب أمامي عالٍ بالكابل بقبضة واسعة',
  'Front Pull narrow': 'سحب أمامي عالٍ بالكابل بقبضة ضيقة',
  'Full Sit-Out': 'الدوران الجانبي الكامل على الأرض',
  'Glute Bridge': 'جسر الأرداف على الأرض',
  'Hammer Curls': 'ثني البايسبس بقبضة المطرقة بالدامبل',
  'Hammercurls on Cable': 'ثني البايسبس بقبضة المطرقة بالكابل',
  'Hand Grip': 'تقوية قبضة اليد بالمقبض',
  'Handstand Pushup': 'ضغط الوقوف على اليدين بمحاذاة الحائط',
  'Hanging Leg Raise': 'رفع الساقين بالتعلق على العقلة',
  'Hercules Pillars': 'ثبات أعمدة هرقل بالكابل',
  'High Knee Jumps': 'قفزات الركبة العالية',
  'High Pull': 'السحب العالي بالبار',
  'Hindu Squats': 'سكوات هندي بوزن الجسم',
  'Lying Hip Raise': 'رفع الورك مستلقياً على الأرض',
  'Hip Thrust': 'دفع الورك بالبار للأرداف',
  'Hollow Hold': 'ثبات الجذع المجوّف',
  'Hyperextensions': 'تمديد أسفل الظهر على الكرسي الروماني',
  'Incline Dumbbell Fly': 'تفتيح صدر علوي بالدامبل',
  'Incline Dumbbell Row': 'تجديف بالدامبل على بنش مائل',
  'Decline Swiss Ball Plank with Alternating Toe Tap': 'بلانك على الكرة السويسرية مع لمس القدمين بالتبادل',
  'Isometric Wipers': 'تحويل الوزن الجانبي بوضعية الضغط',
  'Jogging': 'الهرولة الخفيفة',
  'Jumping Jacks': 'قفزات فتح وإغلاق الذراعين والساقين',
  'Cable Cross-over': 'تقاطع الكابل للصدر',
  'Kettlebell Swings': 'أرجحة الكيتل بيل',
  'Squats on Multipress': 'سكوات على جهاز السميث',
  'Landmine press': 'ضغط الكتف على محور البار الأرضي',
  'Dumbbell Lateral Raise': 'رفرفة جانبية للكتف بالدامبل',
  'Single-Arm Cable Lateral Raise': 'رفرفة جانبية بالكابل بذراع واحدة',
  'Lateral-to-Front Raises': 'رفرفة جانبية إلى أمامية بالدامبل',
  'Lat Pull Down (Leaning Back)': 'سحب عالٍ للظهر مع ميلان خفيف للخلف',
  'Lat Pulldown (Straight Back)': 'سحب عالٍ للظهر بظهر مستقيم',
  'Leg Curl': 'ثني الفخذ الخلفي على الجهاز',
  'Leg Curls (laying)': 'ثني الفخذ الخلفي مستلقياً على الجهاز',
  'Leg Curls (sitting)': 'ثني الفخذ الخلفي جالساً على الجهاز',
  'Leg Curls (standing)': 'ثني الفخذ الخلفي واقفاً على الجهاز',
  'Leg Extension': 'فرد الركبة على الجهاز للفخذ الأمامي',
  'Leg Press': 'دفع الأرجل على الجهاز',
  'Narrow Stance Leg Press': 'دفع الأرجل على الجهاز بوقفة ضيقة',
  'Wide Stance Leg Press': 'دفع الأرجل على الجهاز بوقفة واسعة',
  'Leg Press on Hackenschmidt Machine': 'دفع الأرجل على جهاز الهاك سكوات',
  'Lying Leg Raise': 'رفع الساقين مستلقياً',
  'Dip Station Leg Raise': 'رفع الساقين على جهاز المتوازي',
  'Leverage Machine Chest Press': 'ضغط صدر على جهاز الرافعة',
  'Leverage Machine Iso Row': 'تجديف على جهاز الرافعة المستقل',
  'Hanging L-Sit Hold': 'ثبات رفع الساقين بزاوية قائمة على العقلة',
  'Diamond Push-Up': 'تمرين الضغط الماسي',
  'Seated Cable Row (Wide Grip)': 'تجديف جالساً بالكابل بقبضة واسعة',
  'Seated Cable Row (Narrow Grip)': 'تجديف جالساً بالكابل بقبضة ضيقة',
  'Low Box Squat - Wide Stance': 'سكوات على صندوق منخفض بوقفة واسعة',
  'Side-Lying External Shoulder Rotation': 'تدوير الكتف الخارجي بالدامبل مستلقياً على الجانب',
  'EZ-Bar Military Press': 'ضغط كتف عسكري بالبار المتعرج',
  'Muscle-Up': 'تمرين الصعود الكامل فوق العقلة',
  'Overhand Cable Curl': 'ثني الساعد والبايسبس بالكابل بقبضة علوية',
  'Overhead Squat': 'سكوات بالبار فوق الرأس',
  'Pause Bench': 'ضغط صدر بالبار مع توقف مؤقت',
  'Pendlay Row': 'تجديف بيندلي بالبار من الأرض',
  'Pike Push-Up': 'ضغط بايك للأكتاف بوزن الجسم',
  'Pistol Squat': 'سكوات المسدس بساق واحدة',
  'Plank': 'تمرين البلانك',
  'EZ-Bar Preacher Curl': 'ثني البايسبس بالبار المتعرج على مقعد سكوت',
  'Prone Scapular Retraction - Arms at Side': 'ضم لوحي الكتف مستلقياً على البطن',
  'Pull-Up': 'تمرين العقلة',
  'Assisted Machine Pull-Up': 'عقلة مساعدة على الجهاز',
  'Dumbbell Push Press': 'ضغط كتف دفعي بالدامبل',
  'Rack Deadlift': 'الرفعة الميتة الجزئية من الحامل',
  'Seated Dumbbell Rear Delt Raise': 'رفرفة للكتف الخلفي بالدامبل جالساً',
  'Renegade Row': 'تجديف رينيجيد بالدامبل من وضعية البلانك',
  'EZ-Bar Reverse Curl': 'ثني البايسبس العكسي بالبار المتعرج',
  'Reverse Curl': 'ثني البايسبس العكسي بالبار',
  'Reverse Grip Bench Press': 'ضغط صدر بالبار بقبضة معكوسة',
  'Reverse Plank': 'البلانك العكسي',
  'Ring Dips': 'غطس على حلقات الجمباز',
  'Roman Chair Crunch': 'طحن البطن على الكرسي الروماني',
  'Romanian Deadlift': 'الرفعة الميتة الرومانية بالبار',
  'Row': 'تجديف بالبار للظهر',
  'Chest-Supported Barbell Row on Bench': 'تجديف بالبار بمسند الصدر على البنش',
  'T-Bar Row (Wide Grip)': 'تجديف بار تي بقبضة واسعة',
  'Front Wood Chop': 'تقطيع الحطب الأمامي بوزن الجسم',
  'Run': 'الجري',
  'Run - Interval Training': 'الجري المتقطع عالي الشدة',
  'Treadmill Running': 'الجري على جهاز المشي',
  'Incline Bench Press - Dumbbell': 'ضغط صدر علوي بالدامبل',
  'Incline Bench Press - Barbell': 'ضغط صدر علوي بالبار',
  'Smith Machine Incline Bench Press': 'ضغط صدر علوي على جهاز السميث',
  'Machine Shoulder Press': 'ضغط كتف على الجهاز',
  'Scissors': 'تمرين المقص للبطن السفلي',
  'Seated Triceps Press': 'ضغط الترايسبس بالدامبل جالساً فوق الرأس',
  'Roman Chair Side Bends': 'انحناء جانبي للبطن على الكرسي الروماني',
  'Shotgun Row': 'تجديف بالكابل بذراع واحدة مع خطوة أمامية',
  'Barbell Shoulder Press': 'ضغط كتف بالبار',
  'Dumbbell Shoulder Press': 'ضغط كتف بالدامبل',
  'Smith Machine Shoulder Press': 'ضغط كتف على جهاز السميث',
  'Shoulder Shrug': 'رفع الأكتاف بوزن الجسم للترابيس',
  'Barbell Shrug': 'رفع الأكتاف بالبار للترابيس',
  'Dumbbell Shrug': 'رفع الأكتاف بالدامبل للترابيس',
  'Smith Machine Shrug': 'رفع الأكتاف على جهاز السميث للترابيس',
  'Side Crunch': 'طحن جانبي للبطن بالدامبل',
  'Side Dumbbell Trunk Flexion': 'ثني الجذع الجانبي بالدامبل',
  'Side-lying External Rotation': 'تدوير الكتف الخارجي مستلقياً على الجانب',
  'Side Plank': 'البلانك الجانبي',
  'Side to Side Push Ups': 'تمرين الضغط الجانبي بالتبادل',
  'Single-arm Preacher Curl': 'ثني البايسبس بذراع واحدة على مقعد سكوت',
  'Sitting Calf Raises': 'رفع السمانة جالساً على الجهاز',
  'Bench-Elevated Sit-up': 'جلوس البطن مع رفع الساقين على البنش',
  'Skipping - Standard': 'القفز بالحبل الأساسي',
  'Smith Machine Close-grip Bench Press': 'ضغط صدر بقبضة ضيقة على جهاز السميث',
  'Snatch': 'رفعة الخطف الأولمبية بالبار',
  'Speed Deadlift': 'الرفعة الميتة السريعة بالبار',
  'Sprinter Sit-up': 'جلوس البطن بأسلوب العداء',
  'Squat Jumps': 'سكوات بالقفز',
  'Squats': 'سكوات خلفي بالبار',
  'Squat Thrust': 'دفع القرفصاء الديناميكي',
  'Standing Bicep Curl': 'ثني البايسبس واقفاً بالدامبل',
  'Standing Calf Raises': 'رفع السمانة واقفاً على الجهاز',
  'Standing Wrist Roller': 'لف المعصم واقفاً لتقوية الساعد',
  'Stationary Bike': 'الدراجة الثابتة',
  'Stiff-legged Deadlifts': 'الرفعة الميتة بساقين مستقيمتين',
  'Cable Straight-Arm Pulldown with Straight Bar': 'سحب عالٍ بذراعين مستقيمتين بالبار المستقيم',
  'Cable Straight-Arm Pulldown with Rope': 'سحب عالٍ بذراعين مستقيمتين بالحبل',
  'Sumo Deadlift': 'الرفعة الميتة بأسلوب السومو بالبار',
  'Sumo Squats': 'سكوات السومو بوزن الجسم',
  'Superman': 'تمرين سوبرمان لأسفل الظهر',
  'Thruster': 'تمرين السكوات مع الضغط فوق الرأس بالبار',
  'Dumbbell Triceps Kickback': 'رفس الترايسبس للخلف بالدامبل',
  'Cable Rope Triceps Extension': 'تمديد الترايسبس بالحبل على الكابل',
  'Cable Straight-Bar Triceps Extension': 'تمديد الترايسبس بالبار المستقيم على الكابل',
  'Machine Triceps Extension': 'تمديد الترايسبس على الجهاز',
  'Trunk Rotation With Cable': 'تدوير الجذع بالكابل',
  'TRX Row': 'تجديف بأحزمة التعليق',
  'Turkish Get-Up': 'النهوض التركي بالكيتل بيل',
  'Power Clean': 'النتر القوي بالبار',
  'Underhand Lat Pulldown': 'سحب عالٍ للظهر بقبضة معكوسة',
  'Overhead Press': 'ضغط الكتف بالبار واقفاً فوق الرأس',
  'Upper External Oblique': 'رفع الركبتين المائل للبطن الجانبي على العقلة',
  'Smith Machine Upright Row': 'سحب عمودي للكتف على جهاز السميث',
  'EZ-Bar Upright Row': 'سحب عمودي للكتف بالبار المتعرج',
  'Dumbbell Upright Row': 'سحب عمودي للكتف بالدامبل',
  'V-Bar Lat Pulldown': 'سحب عالٍ للظهر بالمقبض المثلث',
  'Single-Leg Calf Raise': 'رفع السمانة بساق واحدة',
  'Wall Handstand': 'الوقوف على اليدين بمحاذاة الحائط',
  'Wall Pushup': 'تمرين الضغط على الحائط',
  'Wall Slides': 'انزلاق الذراعين على الحائط لمرونة الكتف',
  'Wall Sit': 'الجلوس الثابت على الحائط',
  'Weighted Step-Ups': 'صعود الصندوق بالبار',
  'Wide-Grip Lat Pulldown': 'سحب عالٍ للظهر بقبضة واسعة',
  'Dumbbell Push-Up': 'تمرين الضغط على الدامبل',
  'Walking Barbell Lunge': 'لانج بالمشي بالبار',
  'One-Arm Cable Triceps Extension': 'تمديد الترايسبس بالكابل بذراع واحدة',
  'Fingerboard Sloper Hang': 'تعلق الأصابع على الحافة المائلة',
  'Cable Rope Triceps Pushdown': 'دفع الترايسبس للأسفل بالحبل',
  'Fingerboard 20 mm Edge Hang': 'تعلق الأصابع على حافة 20 مم',
  'Fingerboard Pull-Up': 'عقلة على لوح الأصابع',
  'Cable Rear Delt Fly': 'تفتيح الكتف الخلفي بالكابل',
  'Incline Bench Reverse Fly': 'تفتيح خلفي بالدامبل على بنش مائل',
  'Zone 2 Running': 'جري هوائي متوسط الشدة في المنطقة الثانية',
  'Reverse Nordic Curl': 'التمديد النوردي العكسي للفخذ الأمامي',
  'Nordic Curl': 'ثني الفخذ الخلفي النوردي',
  'Incline Dumbbell Skull Crusher': 'تمديد الترايسبس بالدامبل على بنش مائل',
  'Straight-Bar Cable Curl': 'ثني البايسبس بالكابل بالبار المستقيم',
  'Reverse Preacher Curl (Close Grip)': 'ثني البايسبس العكسي بقبضة ضيقة على مقعد سكوت',
  'Reverse EZ-Bar Cable Curl': 'ثني البايسبس العكسي بالكابل بالبار المتعرج',
  'Bus Drivers': 'تدوير القرص الحديدي للأكتاف',
  'Smith Machine Overhead Press': 'ضغط الكتف فوق الرأس على جهاز السميث',
  'Straight Bar Cable Front Raise': 'رفع أمامي للكتف بالكابل بالبار المستقيم',
  'Seated Dumbbell Lateral Raise': 'رفرفة جانبية بالدامبل جالساً',
  'T-Bar Row': 'تجديف بار تي للظهر',
  'Seated Cable Mid Trap Shrug': 'ضم الترابيس الوسطى بالكابل جالساً',
  'Lying Dumbbell Row and Seated Shrug': 'تجديف بالدامبل مستلقياً مع رفع الترابيس',
  'Smith Machine Slight Incline Press': 'ضغط صدر مائل خفيف على جهاز السميث',
  'Machine Chest Fly': 'تفتيح الصدر على الجهاز',
  'Suspension Chest Fly': 'تفتيح الصدر بأحزمة التعليق',
  'Quadruped Arm and Leg Raise (Bird Dog)': 'تمرين التوازن المتقاطع (بيرد دوج)',
  'TRX Biceps Curl': 'ثني البايسبس بأحزمة التعليق',
  'Kettlebell Swing': 'أرجحة الكيتل بيل',
  '50m Swim Sprints': 'سباحة سريعة لمسافة 50 متراً',
  'Elliptical Trainer': 'جهاز الإليبتيكال الهوائي',
  'Two-Handed Kettlebell Curl': 'ثني البايسبس بالكيتل بيل باليدين',
  'One-Handed Kettlebell Curl': 'ثني البايسبس بالكيتل بيل بيد واحدة',
  'Medicine Ball V-Up Crunch': 'طحن البطن بوضعية المقص بالكرة الطبية',
  'Box Squat': 'سكوات على الصندوق بالبار',
  'Hanging Knee Raise': 'رفع الركبتين بالتعلق على العقلة',
  'Commando Pull-Up': 'عقلة الكوماندوز بقبضة متتابعة',
  'Step-Up': 'صعود الدرجة بوزن الجسم',
  'High Knees': 'الجري في المكان برفع الركبتين عالياً',
  'Bodyweight Lunge': 'لانج بوزن الجسم',
  'Push-up with Rotation': 'تمرين الضغط مع تدوير الجذع',
  'Side Lunge (Left)': 'لانج جانبي للجهة اليسرى',
  'Side Lunge (Right)': 'لانج جانبي للجهة اليمنى',
  'Bulgarian Split Squat (Left)': 'سكوات بلغاري للساق اليسرى',
  'Bulgarian Split Squat (Right)': 'سكوات بلغاري للساق اليمنى',
  'Kneeling Glute Kickback': 'رفس الأرداف للخلف من وضعية الركوع',
  'Split Squat (Left)': 'سكوات منقسم للساق اليسرى',
  'Split Squat (Right)': 'سكوات منقسم للساق اليمنى',
  'Jump Rope (Basic Jumps)': 'نط الحبل بالقفز الأساسي',
  'Forward Arm Circles': 'دوائر الذراعين للأمام',
  'Backward Arm Circles': 'دوائر الذراعين للخلف',
  'Mountain Climbers': 'تمرين متسلق الجبال',
  '4-Count Burpees': 'تمرين البيربي الرباعي',
  'No-Push-Up Burpees': 'تمرين البيربي بدون ضغط',
  'Reverse Lunge': 'لانج خلفي بوزن الجسم',
  'Floor Dips': 'غطس الترايسبس على الأرض',
  'High Plank': 'البلانك المرتفع على اليدين',
  "Child's Pose": 'وضعية الطفل لإطالة الظهر',
  'Kettlebell Deadlift': 'الرفعة الميتة بالكيتل بيل',
  'Forward Shoulder Rotation': 'تدوير الكتفين للأمام',
  'Backward Shoulder Rotation': 'تدوير الكتفين للخلف',
  'Chin Tuck': 'سحب الذقن للداخل لمرونة الرقبة',
  'Head Turns': 'تدوير الرأس جانبياً لمرونة الرقبة',
  'Neck Stretch (Left)': 'إطالة الرقبة للجهة اليسرى',
  'Neck Stretch (Right)': 'إطالة الرقبة للجهة اليمنى',
  'Back Neck Stretch': 'إطالة الجزء الخلفي من الرقبة',
  'Front Neck Stretch': 'إطالة الجزء الأمامي من الرقبة',
  'Alternating Dumbbell Bicep Curls': 'ثني البايسبس بالدامبل بالتبادل',
  'Left Levator Scapulae Stretch': 'إطالة العضلة الرافعة للكتف اليسرى',
  'Right Levator Scapulae Stretch': 'إطالة العضلة الرافعة للكتف اليمنى',
  'Clockwise Neck Circles': 'دوائر الرقبة باتجاه عقارب الساعة',
  'Counterclockwise Neck Circles': 'دوائر الرقبة عكس عقارب الساعة',
  'Neck Half Circles': 'نصف دوائر للرقبة',
  'Head Tilts (Lateral Neck Stretch)': 'إمالة الرأس الجانبية لإطالة الرقبة',
  'Side Plank Right': 'البلانك الجانبي للجهة اليمنى',
  'Pistol Squats Right': 'سكوات المسدس للساق اليمنى',
  'Right-Leg Calf Raise': 'رفع السمانة للساق اليمنى',
  'Single-Arm Plank to Row (Renegade Row)': 'تجديف من البلانك بالكيتل بيل بذراع واحدة',
  'Elevated Prayer Stretch': 'إطالة الظهر والكتفين على البنش',
  'Quadruped Thoracic Rotation Left': 'تدوير الصدر الرباعي للجهة اليسرى',
  'Quadruped Thoracic Rotation Right': 'تدوير الصدر الرباعي للجهة اليمنى',
  'Hindu Push-Ups': 'تمرين الضغط الهندي',
  'Shoulder Dislocates (with Band or Stick)': 'تمرير الحبل المطاطي فوق الرأس لمرونة الكتف',
  'Bent-Over Row to External Rotation': 'تجديف مائل مع تدوير خارجي للكتف',
  'Prone Y-W-T Raises': 'رفع الذراعين بأشكال متعددة مستلقياً على البطن',
  'Dumbbell Floor Press': 'ضغط صدر بالدامبل على الأرض',
  'Close-Grip Push-Ups': 'تمرين الضغط بقبضة ضيقة',
  'Dumbbell Hang Power Cleans': 'النتر القوي المعلق بالدامبل',
  'Dumbbell Sumo Deadlift': 'الرفعة الميتة السومو بالدامبل',
  'Medicine Ball Russian Twist': 'التواء الجذع الروسي بالكرة الطبية',
  'Pike Push-Up (V-Push-Up)': 'ضغط بايك للأكتاف بوضعية الزاوية',
  'Plank Shoulder Taps': 'لمس الكتفين بالتبادل في وضعية البلانك',
  'Heavy Bag Training (Boxing)': 'تمرين الملاكمة على الكيس الثقيل',
  'Indoor Rowing Machine': 'جهاز التجديف الهوائي الداخلي',
  'Seated Chest Press Machine': 'ضغط صدر جالساً على الجهاز',
  'Standing Hip Abduction': 'إبعاد الورك واقفاً بوزن الجسم',
  'Seated Rear Delt Raise': 'رفرفة للكتف الخلفي جالساً بالدامبل',
  'Dynamic Single-Leg Side Hold with Kettlebell': 'ثبات جانبي ديناميكي بساق واحدة مع الكيتل بيل',
  'Wall Balls': 'رمي الكرة الطبية على الحائط مع السكوات',
  'Isometric Pull-Up / Row Hold': 'ثبات العقلة والتجديف الأيزومتري',
  'Alternating Reverse Lunges': 'لانج خلفي بالتبادل بوزن الجسم',
  'Walking Bridge': 'جسر المشي العكسي للبطن والورك',
  'Walking': 'المشي الهوائي',
  'Seated Knee Tuck': 'ضم الركبتين للبطن جالساً',
  'Cable Concentration Curl': 'ثني البايسبس بالتركيز بالكابل',
  'Incline Push-Ups': 'تمرين الضغط المائل العلوي',
  'Decline Push-Ups': 'تمرين الضغط المائل السفلي',
  'Parallette Push-Ups': 'تمرين الضغط على القضبان المنخفضة',
  '3D Lunge Warmup': 'إحماء اللانج ثلاثي الاتجاهات بالدامبل',
  "Dumbbell Farmer's Carry": 'مشية المزارع بالدامبل',
  'Seated Cable Row': 'تجديف جالساً بالكابل',
  'Seated Machine Row (Close Grip)': 'تجديف جالساً على الجهاز بقبضة ضيقة',
  'Seated Machine Row (Underhand Grip)': 'تجديف جالساً على الجهاز بقبضة معكوسة',
  'Wide-Grip Supinated Lat Pulldown': 'سحب عالٍ للظهر بقبضة واسعة معكوسة',
  'Close-Grip Supinated Lat Pulldown': 'سحب عالٍ للظهر بقبضة ضيقة معكوسة',
  'Cable Glute Extension': 'تمديد الأرداف للخلف بالكابل',
  'GHD Glute Extension': 'تمديد الأرداف على جهاز الظهر والأرداف',
  'Neutral-Grip Lat Pulldown': 'سحب عالٍ للظهر بقبضة محايدة',
  'High-Pulley Cable Pullover': 'بول أوفر بالكابل من البكرة العلوية',
  'Incline Bench Cable Pulldown': 'سحب عالٍ بالكابل على بنش مائل',
  'Arabesque': 'توازن الأرابيسك بساق واحدة',
  'Machine Back Extension': 'تمديد أسفل الظهر على الجهاز',
  'Triceps Pushdown': 'دفع الترايسبس للأسفل بالكابل',
  'One-Arm Cable Bent-Over Row': 'تجديف مائل بالكابل بذراع واحدة',
  'Dumbbell Side Bend': 'انحناء الجذع الجانبي بالدامبل',
  'Alternating Dumbbell Biceps Curl': 'ثني البايسبس بالدامبل بالتبادل',
  'Dumbbell Russian Twist': 'التواء الجذع الروسي بالدامبل',
  'Cable Pallof Press': 'ضغط بالوف بالكابل لثبات الجذع',
  'Side Slides to Squats': 'انزلاق جانبي مع سكوات',
  'Wall Drills (Sprint Mechanics)': 'تمارين ميكانيكا الجري السريع على الحائط',
  'Inverted Row': 'التجديف المقلوب بوزن الجسم',
  'Tibialis Raises': 'رفع مشط القدم لتقوية الظنبوبية الأمامية',
  'Dragon Squat': 'سكوات التنين بوزن الجسم',
  'Side-Lying Hip Abduction': 'إبعاد الورك مستلقياً على الجانب',
  'Left-Leg Calf Raise': 'رفع السمانة للساق اليسرى',
  'Stationary Bike Cardio Session': 'جلسة كارديو على الدراجة الثابتة',
  'Dumbbell Wrist Curl': 'ثني المعصم بالدامبل',
  'Scorpion Kick': 'ركلة العقرب لمرونة الورك وأسفل الظهر',
  'Prisoner Squat': 'سكوات السجين بوزن الجسم',
  'Three-Point Push-Up': 'تمرين الضغط بثلاث نقاط ارتكاز',
  'Skydiver with Arms in T-Position': 'ثبات المظلي مع فتح الذراعين جانبياً',
  'Tuck Front Lever': 'الرافعة الأمامية المضمومة على العقلة',
  'Reverse Snow Angel': 'ملاك الثلج العكسي لتقوية أعلى الظهر',
  'Hangboard Recruitment Pulls': 'سحبات تنشيط الأصابع على لوح التعليق',
  'Finger Push-Up': 'تمرين الضغط على أطراف الأصابع',
  'Knee Push-Up': 'تمرين الضغط على الركبتين',
  'Australian Pull-up': 'العقلة الأسترالية (التجديف المقلوب)',
  'Claps Over the Head': 'التصفيق فوق الرأس لمرونة الكتفين',
  'Dumbbell Drag Curl': 'ثني البايسبس بالسحب الملاصق بالدامبل',
  'Dumbbell Wide Biceps Curl': 'ثني البايسبس بالدامبل بزاوية واسعة',
  'Dumbbell Biceps Curl to Overhead Press': 'ثني البايسبس مع ضغط الكتف بالدامبل',
  'Dumbbell Rear Delt Row': 'تجديف للكتف الخلفي بالدامبل',
  'Dumbbell Close-Grip Bench Press': 'ضغط صدر بالدامبل بقبضة متقاربة',
  'Overhead Triceps Stretch (Left)': 'إطالة الترايسبس فوق الرأس للذراع اليسرى',
  'Overhead Triceps Stretch (Right)': 'إطالة الترايسبس فوق الرأس للذراع اليمنى',
  'Standing Biceps Stretch (Left)': 'إطالة البايسبس واقفاً للذراع اليسرى',
  'Standing Biceps Stretch (Right)': 'إطالة البايسبس واقفاً للذراع اليمنى',
  'Dumbbell Single-Leg Hip Thrust': 'دفع الورك بساق واحدة بالدامبل',
  'Frog Stand': 'توازن الضفدع على اليدين',
  'Standing Calf Stretch': 'إطالة السمانة واقفاً بمحاذاة الحائط',
  'Standing Soleus Stretch': 'إطالة العضلة النعلية واقفاً',
  'Resistance Band Ankle Dorsiflexion': 'ثني الكاحل للأعلى بحبل المقاومة',
  'Exercise Band Plantarflexion': 'مد الكاحل للأسفل بحبل المقاومة',
  'Double Leg Calf Raise': 'رفع السمانة بالساقين معاً',
  'Yoga exercise: Cow-cat': 'إطالة القطة والبقرة لمرونة العمود الفقري',
  'Front Lever': 'الرافعة الأمامية على العقلة',
  'TRX Rollout': 'تمديد البطن بأحزمة التعليق',
  'Ice Cream Maker': 'انتقال الرافعة الأمامية على العقلة',
  'Front Lever Pull-up': 'عقلة الرافعة الأمامية',
  'TRX Knee Tuck to Elbow': 'ضم الركبتين نحو المرفق بأحزمة التعليق',
  'TRX Hammer Curl': 'ثني البايسبس المطرقي بأحزمة التعليق',
  'TRX Gorilla Biceps Curl': 'ثني البايسبس العميق بأحزمة التعليق',
  'TRX Single-Arm Biceps Curl': 'ثني البايسبس بذراع واحدة بأحزمة التعليق',
  'Back Bridge': 'جسر الظهر الكامل',
  'TRX Tricep Extension': 'تمديد الترايسبس بأحزمة التعليق',
  'TRX Dips': 'غطس الصدر والترايسبس بأحزمة التعليق',
  'Low Pulley Cable Fly': 'تفتيح الصدر بالكابل من البكرة السفلية',
  'Dumbbell Pullover': 'بول أوفر بالدامبل',
  'Sitting Calf Stretch (Dorsiflexion)': 'إطالة السمانة جالساً بثني الكاحل',
  'Plantarflexion Stretch with Band': 'إطالة الكاحل بحبل المقاومة',
  'Biceps Close Grip Pull Down': 'سحب عالٍ بقبضة ضيقة للبايسبس والظهر',
  'Isometric Reverse-Grip Chin-Up Hold': 'ثبات العقلة بقبضة معكوسة',
  'Incline Chest-Supported Dumbbell Row': 'تجديف بالدامبل مع سند الصدر على بنش مائل',
  'Pseudo Planche Push-up': 'ضغط البلانش التمهيدي',
  'Butt Kicks': 'الجري في المكان بلمس الكعبين للأرداف',
  'Plank Tuck Jump': 'قفزة ضم الركبتين من وضعية البلانك',
  'Reach-up': 'طحن البطن مع مد الذراعين للأعلى',
  'Dynamic Side Plank': 'البلانك الجانبي الديناميكي',
  'Seated Dumbbell Curls': 'ثني البايسبس بالدامبل جالساً',
  'Reverse Grip Barbell Curls': 'ثني البايسبس بالبار بقبضة معكوسة',
  'Reverse-Grip Pull-Up': 'عقلة بقبضة معكوسة',
  'One-Arm Push-Up': 'تمرين الضغط بذراع واحدة',
  'Single-Leg Hamstring Curl': 'ثني الفخذ الخلفي بساق واحدة على الأرض',
  'Low-Cable Crossover': 'تقاطع الكابل السفلي لأعلى الصدر',
  'High-Cable Triceps Extension': 'تمديد الترايسبس بالكابل العلوي',
  'JM Press': 'ضغط جيه إم بالبار للترايسبس',
  'Helms Row': 'تجديف هيلمز بالدامبل على البنش',
  'Meadows Row': 'تجديف ميدوز على محور البار بذراع واحدة',
  'Bodyweight Squat': 'سكوات بوزن الجسم',
  'Jumping Jack': 'قفزة فتح وإغلاق الذراعين والساقين',
  'High Knee Skips': 'الوثب الخفيف برفع الركبتين عالياً',
  'Bench Dips On Floor': 'غطس الترايسبس بالاستناد على الأرض',
  'Lateral Push Off': 'الدفع الجانبي الانفجاري',
  'Underhand Dumbbell Wrist Curl': 'ثني المعصم بالدامبل بقبضة سفلية',
  'Overhead Dumbbell Triceps Extension': 'تمديد الترايسبس بالدامبل فوق الرأس',
  'Dumbbell Front Raise': 'رفع أمامي للكتف بالدامبل',
  'Back Extension': 'تمديد أسفل الظهر على الأرض',
  'Dumbbell Hex Press': 'ضغط الصدر المتلاصق بالدامبل',
  'Double Kettlebell Clean and Press': 'النتر والضغط بزوج من الكيتل بيل',
  'Double Kettlebell Front Squat': 'سكوات أمامي بزوج من الكيتل بيل',
  'Foam Rolling (Blackroll)': 'التحرير العضلي بالأسطوانة الإسفنجية',
  'Dumbbell Split Squat': 'سكوات منقسم بالدامبل',
  'Dumbbell Deadlift': 'الرفعة الميتة بالدامبل',
  'Assisted Triceps Dips (Machine)': 'غطس الترايسبس المساعد على الجهاز',
  'Box Jump': 'القفز على الصندوق',
  'Rotary Torso Machine': 'تدوير الجذع على الجهاز',
  'Barbell Calf Raise': 'رفع السمانة بالبار',
  'Standing Torso Twist': 'تدوير الجذع واقفاً لمرونة العمود الفقري',
  'Band Pull-Aparts': 'شد حبل المقاومة جانبياً لأعلى الظهر',
  'Machine Upper Back Row': 'تجديف أعلى الظهر على الجهاز',
  'Pullover Machine': 'بول أوفر على الجهاز',
  'Hamstring Kicks': 'ركلات أمامية ديناميكية لإطالة الفخذ الخلفي',
  'Single Leg RDL': 'الرفعة الميتة الرومانية بساق واحدة',
  'Toe Touch': 'إطالة لمس أصابع القدمين',
  'Elephant Walks': 'مشي الفيل لمرونة الفخذ الخلفي',
  'Bodyweight Good Morning': 'تمرين صباح الخير بوزن الجسم',
  'Single Leg Hamstring Stretch': 'إطالة الفخذ الخلفي بساق واحدة',
  'Sit & Reach': 'إطالة الجلوس ومد اليدين للأمام',
  'Crossbody Leg Swings': 'تأرجح الساق العرضي لمرونة الورك',
  'Standing Pancake': 'إطالة الانحناء الواسع واقفاً',
  'Standing Pancake Good Morning': 'انحناء الورك الواسع واقفاً',
  'Seated Hamstring Choke Stretch': 'إطالة الفخذ الخلفي جالساً بشد الساق',
  'Roll Down': 'التدحرج البطيء للعمود الفقري نحو الأرض',
  'Crossbody Hamstring Stretch': 'إطالة الفخذ الخلفي بوضعية متقاطعة',
  'Plank-to-Elbow Extension (Plank to Push-Up)': 'الانتقال من البلانك إلى وضعية الضغط',
  'Cossack squat': 'سكوات القوزاق الجانبي',
  'Wall-sit': 'الجلوس الثابت على الحائط',
  'Dragon-flag': 'تمرين علم التنين للبطن',
  'Plank with Alternating Leg Lift': 'البلانك مع رفع الساقين بالتبادل',
  'Heel Touches': 'لمس الكعبين بالتبادل للبطن الجانبي',
  'Bicycle Crunch': 'طحن الدراجة للبطن',
  'Machine Hack Squat': 'هاك سكوات على الجهاز',
  'Dumbbell Crunch': 'طحن البطن بالدامبل',
  'Biceps Curl Machine': 'ثني البايسبس على الجهاز',
  'Toe Taps': 'لمس أطراف الأصابع بالتبادل للبطن',
  'Standing Side Crunches': 'طحن البطن الجانبي واقفاً',
  'Dumbbell Shoulder Rotations': 'تدوير الكتف بالدامبل',
  'Plate Pinch Hold': 'الإمساك بالقرص الحديدي لتقوية القبضة',
  'Band Reverse Wood Chops': 'تقطيع الحطب العكسي بحبل المقاومة',
  'Dumbbell Bent-Over Lat Pull': 'سحب اللاتس المائل بالدامبل',
  'Scapular Pull-Ups': 'سحب لوحي الكتف على العقلة',
  'Barbell Pin Bench Press': 'ضغط صدر بالبار من المساند الحديدية',
  'Barbell Pin Squat': 'سكوات بالبار من المساند الحديدية',
  'Barbell Clean': 'رفعة النتر بالبار',
  'Barbell Pin Overhead Press': 'ضغط كتف بالبار من المساند الحديدية',
  'Push Press': 'ضغط الكتف الدفعي بالبار',
  'Incline Dumbbell Overhead Press': 'ضغط الكتف بالدامبل على بنش مائل',
  'Kreis Press with Dumbbells': 'ضغط كرايس بالدامبل على بنش مائل',
  'Dumbbell Lateral and Front Raise': 'رفرفة جانبية وأمامية مركبة بالدامبل',
  'Olympic Jerk': 'رفعة النتر الأولمبي فوق الرأس',
  'Olympic Clean and Jerk': 'رفعة النتر والخطف الأولمبي بالبار',
  'Olympic Snatch': 'رفعة الخطف الأولمبية الكاملة بالبار',
  'Seated W-Curl with Dumbbells': 'ثني البايسبس بزاوية مفتوحة بالدامبل جالساً',
  'Stair Climber (ClimbMill)': 'جهاز صعود السلالم الهوائي',
  'Cobra Stretch': 'إطالة الكوبرا للبطن وأسفل الظهر',
  'Torso Rotation Stretch': 'إطالة تدوير الجذع',
  'Knee-to-Chest Stretch': 'إطالة ضم الركبة إلى الصدر',
  'Towel Superman': 'سوبرمان مع سحب المنشفة للظهر',
  'Cable Press Around': 'دفع الكابل العرضي للصدر بذراع واحدة',
  'Cross-Body Cable Y-Raise': 'رفع الكابل المتقاطع للأعلى للكتف',
  'No Leg Drive Dumbbell Chest Press': 'ضغط صدر بالدامبل مع رفع القدمين',
  'Punches': 'اللكم الهوائي بالتبادل',
  'Dumbbell Underhand Dead Row': 'تجديف ميت بالدامبل بقبضة معكوسة',
  'Pause Hack Squats': 'هاك سكوات على الجهاز مع توقف سفلي',
  'Dumbbell Spider Curl': 'ثني البايسبس العنكبوتي بالدامبل',
  'Calf Raise on Hack Squat Machine': 'رفع السمانة على جهاز الهاك سكوات',
  'Incline Close-Grip Barbell Bench Press': 'ضغط صدر علوي بالبار بقبضة ضيقة',
  'EZ-Bar Floor Skull Crusher': 'تمديد الترايسبس بالبار المتعرج على الأرض',
  'Bent-Over Cable Flye': 'تفتيح الصدر بالكابل مع انحناء الجذع',
  'One-Arm Half-Kneeling Lat Pulldown': 'سحب عالٍ بذراع واحدة من نصف الركوع',
  'Kroc Row': 'تجديف كروك الثقيل بالدامبل بذراع واحدة',
  'Cable Shrug-In': 'رفع الترابيس بالكابل نحو الداخل',
  'Reverse Cable Flye': 'تفتيح الكتف الخلفي العكسي بالكابل',
  'W-Raise': 'رفع الساقين المساري للبطن السفلي',
  'Black Widow Knee Slides': 'انزلاق الركبتين للبطن من وضعية البلانك',
  'Butterfly Sit-up': 'جلوس البطن بوضعية الفراشة',
  'Seated Corkscrew': 'التواء الجذع الحلزوني جالساً',
  'Levitation Crunch': 'طحن البطن بالرفع المستقيم',
  'Sit Up Elbow Thrust': 'جلوس البطن مع دفع المرفقين بالتبادل',
  'Lying Barbell Triceps Extension': 'تمديد الترايسبس بالبار مستلقياً',
  'Cable Drag Pushdown': 'دفع الترايسبس الملاصق بالكابل',
  'Dumbbell Cheat Curl': 'ثني البايسبس بالدامبل بوزن ثقيل',
  'Biceps Curl Trifecta': 'ثني البايسبس الثلاثي بالدامبل',
  'Omni Cable Crossover': 'تقاطع الكابل متعدد الزوايا للصدر',
  'Rocking Triceps Pushdown': 'دفع الترايسبس المتأرجح بالحبل',
  'Alternating High Cable Row': 'تجديف علوي بالكابل بالتبادل',
  'Hyper Y-W Combo with Weight Plates': 'تمديد الظهر مع رفع الذراعين بالأقراص',
  'Plank Jacks': 'قفزات فتح الساقين في وضعية البلانك',
  'Incline Dumbbell Triceps Kickback': 'رفس الترايسبس بالدامبل على بنش مائل',
  'Half-Kneeling Cable High Row': 'تجديف علوي بالكابل من نصف الركوع',
  'Cable Bayesian Curl': 'ثني البايسبس الخلفي بالكابل',
  'Supinated Dumbbell Upper Chest Raise': 'رفع أمامي بالدامبل بقبضة مقلوبة لأعلى الصدر',
  'DB Underhand bench press': 'ضغط صدر بالدامبل بقبضة معكوسة',
  'Elbows Tucked DB Bench Press': 'ضغط صدر بالدامبل مع ضم المرفقين',
  'Alternating Dumbbell Gorilla Row': 'تجديف الغوريلا بالدامبل بالتبادل',
  'DB Cross Body Hammer Curls': 'ثني مطرقي متقاطع بالدامبل للبايسبس',
  'Dumbbell Frog Press': 'دفع الورك بوضعية الضفدع بالدامبل',
  'Dumbbell Bradford Press': 'ضغط برادفورد للأكتاف بالدامبل',
  'High-Incline Smith Machine Press': 'ضغط علوي حاد على جهاز السميث',
  'Cable Tricep Kickback': 'رفس الترايسبس للخلف بالكابل',
  'Neutral Grip Lat Pulldown': 'سحب عالٍ للظهر بقبضة محايدة',
  'Kong Curl': 'ثني البايسبس المزدوج بالدامبل (كونج)',
  'Drop Curl': 'ثني البايسبس البطيء للعضلة العضدية',
  'Overhead Cable Tricep Extension': 'تمديد الترايسبس فوق الرأس بالكابل',
  'Lateral Walk': 'المشي الجانبي لتنشيط الأرداف',
  'Leg Press Toe Press': 'دفع السمانة بأطراف القدم على جهاز الدفع',
  'Handstand': 'توازن الوقوف على اليدين',
  'EZ-Bar Overhead Triceps Extension': 'تمديد الترايسبس فوق الرأس بالبار المتعرج',
  'Pendulum Hack Squat': 'هاك سكوات البندول على الجهاز',
  'Sled Push': 'دفع الزلاجة الثقيلة',
  'Battle Ropes': 'تمرين حبال المعركة',
  'Medicine Ball Slams': 'رمي الكرة الطبية للأرض بقوة',
  'SkiErg (Ski Machine)': 'جهاز التزلج الهوائي للجزء العلوي',
  'Pendulum Squat': 'سكوات البندول على الجهاز',
  'Glute Drive': 'دفع الورك للأرداف على الجهاز',
  'Toes-to-Bar': 'رفع أصابع القدمين إلى العقلة',
  'Lying Dumbbell Curl': 'ثني البايسبس بالدامبل مستلقياً',
  'Cross-Body Shoulder Stretch': 'إطالة الكتف بذراع متقاطعة أمام الصدر',
  'Pull-Up Isometric Hold': 'ثبات العقلة الأيزومتري',
  'Archer Pull-Up': 'عقلة الرامي بالتبادل',
  'Larsen Press': 'ضغط لارسن بالبار مع رفع الساقين',
  'StairMaster (Stair Climber)': 'جهاز صعود السلالم الكهربائي',
  'Push-Up': 'تمرين الضغط الأساسي',
  'Clap Push-Up': 'تمرين الضغط الانفجاري بالتصفيق',
  "Devil's Press": 'ضغط الشيطان بالدامبل لكامل الجسم',
  'Alternating Dumbbell Hammer Curl': 'ثني البايسبس المطرقي بالدامبل بالتبادل',
  'Bird Dog': 'تمرين التوازن المتقاطع (بيرد دوج)',
  'Ab Wheel Rollout': 'دحرجة عجلة البطن',
  'Swimming': 'السباحة الهوائية',
  'Standing Dowel Shoulder Press': 'ضغط العصا فوق الرأس لمرونة الكتفين',
  'Snap Down': 'هبوط رياضي سريع لامتصاص الصدمة',
  'Bretzel Stretch': 'إطالة بريتزل الشاملة للجذع والورك',
  'Hip Hinge': 'انحناء الورك الأساسي بوزن الجسم',
  'Bronco Test': 'اختبار الجري المكوكي المتدرج',
  'Perpendicular Unilateral Landmine Row': 'تجديف عمودي بذراع واحدة على محور البار',
  'Dumbbell Scapular Press (Trap Press)': 'دفع لوح الكتف بالدامبل مستلقياً',
  'Side-Lying Internal Rotation': 'تدوير الكتف الداخلي مستلقياً على الجانب',
  'Close-Grip Barbell Bench Press (Supine Press)': 'ضغط صدر بالبار بقبضة ضيقة للترايسبس',
  'March or Jog in Place': 'المشي أو الهرولة في المكان',
  'Leg and hip stretch': 'إطالة الساقين والوركين',
  'Arm and neck stretch': 'إطالة الذراعين والرقبة',
  'Deep breathing (standing or seated)': 'تمرين التنفس العميق للاسترخاء',
  'Guided or free meditation': 'جلسة التأمل وتهدئة التنفس',
  'Smith Machine Split Squat': 'سكوات منقسم على جهاز السميث',
  'Dumbbell Scaption': 'رفع الكتف بزاوية لوح الكتف بالدامبل',
  'Leg curl with elastic': 'ثني الفخذ الخلفي بحبل المقاومة',
  'Sliding Lateral Lunge': 'لانج جانبي بالانزلاق مع الكيتل بيل',
  'Copenhagen Adduction Exercise': 'بلانك كوبنهاجن لتقوية العضلات الضامة',
  'Arm Raises (T/Y/I)': 'رفع الذراعين بوضعيات متعددة لمرونة الكتف',
  'Typewriter Pull-Up': 'عقلة الآلة الكاتبة بالتبادل',
  'Bodyweight Biceps Curl': 'ثني البايسبس بوزن الجسم على العقلة',
  'Kettlebell Sumo Deadlift': 'الرفعة الميتة السومو بالكيتل بيل',
  'Rubber Band Glute Kickback': 'رفس الأرداف للخلف بحبل المقاومة',
  'Treadmill Cardio': 'جلسة كارديو على جهاز المشي',
  'Dumbbell donkey kick': 'رفس الأرداف الخلفي بالدامبل من الركوع',
  'Stationary bike cardio': 'كارديو على الدراجة الثابتة',
  'Seated Dumbbell Calf Raise': 'رفع السمانة جالساً بالدامبل',
  'Unilateral Cable Row': 'تجديف بالكابل بذراع واحدة',
  'Blaze': 'تمرين الكارديو الدائري عالي الشدة',
  'Cable Rope Pullover Row': 'سحب وتجديف بالحبل على بنش مائل',
  'Modified pulldown': 'سحب عالٍ معدّل بالكابل على بنش مائل',
  'Single arm row': 'تجديف بالكابل بذراع واحدة من الركوع',
  'Barbell Clean and press': 'النتر والضغط فوق الرأس بالبار',
  'Dumbbell Bent Over Face Pull': 'سحب مائل نحو الوجه بالدامبل',
  'Dumbbell Front Squat': 'سكوات أمامي بالدامبل',
  'Kettlebell One Legged Deadlift': 'الرفعة الميتة بساق واحدة بالكيتل بيل',
  'Dumbbell Hip Thrust': 'دفع الورك بالدامبل للأرداف',
  'Weight Plate Crunch': 'طحن البطن بالقرص الحديدي',
  'Dumbbell Rear Lunge': 'لانج خلفي بالدامبل',
  'Dumbbell Romanian Deadlift': 'الرفعة الميتة الرومانية بالدامبل',
  'Dumbbell Side Squat': 'سكوات جانبي بالدامبل',
  'Machine Lateral Raise': 'رفرفة جانبية للكتف على الجهاز',
  'Cable Chest Press - Decline': 'ضغط صدر سفلي بالكابل بذراع واحدة',
  'Preacher Curl - Internally Rotated': 'ثني البايسبس على مقعد سكوت بدوران داخلي',
  'Preacher Curl - Externally Rotated': 'ثني البايسبس على مقعد سكوت بدوران خارجي',
  'Single-Arm Cross-Body Lat Pulldown': 'سحب عالٍ متقاطع للظهر بذراع واحدة',
  'Cable Chest Press - Incline': 'ضغط صدر علوي بالكابل بذراع واحدة',
  'Cable Triceps Press': 'ضغط الترايسبس بالكابل بذراع واحدة',
  'Cable Tri Extension - Internal Rotation': 'تمديد الترايسبس بالكابل مع دوران داخلي',
  'Curl with Shoulder Elevated': 'ثني البايسبس بالدامبل مع رفع الكتف',
  'One Arm Overhead Cable Tricep Extension': 'تمديد الترايسبس فوق الرأس بالكابل بذراع واحدة',
  'Leg Swings (Front–Back)': 'تأرجح الساق أمامياً وخلفياً لمرونة الورك',
  'Seated Hip Abduction': 'إبعاد الفخذين جالساً على الجهاز',
  'Wall Angels': 'ملائكة الحائط لمرونة الأكتاف والصدر',
  'Seated Figure Four': 'إطالة الأرداف جالساً بوضعية الرقم أربعة',
  'Zottman curl': 'ثني زوتمان للبايسبس والساعد بالدامبل',
  'Dumbbell Thruster': 'سكوات مع ضغط علوي بالدامبل',
  'Glute Bridge Single-Arm Press': 'ضغط صدر بذراع واحدة في وضعية جسر الأرداف',
  'Bear Crawl Pull-Through': 'سحب الدامبل العرضي في وضعية الدب',
  'Kickstand RDL': 'الرفعة الميتة الرومانية بالارتكاز الخلفي',
  'Cable Fly Middle Chest': 'تفتيح الصدر الأوسط بالكابل',
  'Cable Fly Upper Chest': 'تفتيح الصدر العلوي بالكابل',
  'Cable Fly Lower Chest': 'تفتيح الصدر السفلي بالكابل',
  'Incline Dumbbell Static Hold': 'ثبات الصدر العلوي الأيزومتري بالدامبل',
  'Flat Machine Press': 'ضغط صدر مستوٍ على الجهاز',
  'Wide-Grip Pull-Up': 'عقلة بقبضة واسعة',
  'Neutral-Grip Pull-Up': 'عقلة بقبضة محايدة',
  'Barbell Row (Overhand)': 'تجديف بالبار بقبضة علوية',
  'Barbell Row (Underhand)': 'تجديف بالبار بقبضة سفلية معكوسة',
  'Barbell Romanian Deadlift (RDL)': 'الرفعة الميتة الرومانية بالبار',
  'One-Arm Heavy Row': 'تجديف ثقيل بالدامبل بذراع واحدة',
  'Dumbbell Kickback': 'رفس الترايسبس للخلف بالدامبل',
  'Tuck L-sit': 'ثبات الجلوس المضموم على القضبان',
  'Bulgarian Split Squat with Dumbbells': 'سكوات بلغاري بالدامبل',
  'Cable Lateral Raise': 'رفرفة جانبية للكتف بالكابل',
  'Reverse Fly Standing': 'تفتيح الكتف الخلفي واقفاً بالكابل',
  'Butchers Block Stretch': 'إطالة أعلى الظهر والترايسبس على البنش',
  'Sleeper Stretch': 'إطالة النائم لتدوير الكتف الداخلي',
  'Horizontal Shoulder Flexion Stretch': 'إطالة الكتف الأفقية بمحاذاة الحائط',
  'Doorway Pectoral Stretch': 'إطالة الصدر عند إطار الباب',
  'Shoulder Dumbbell Pendular Exercise': 'تأرجح الكتف البندولي بالدامبل',
  'Shoulder External Rotation with Dumbbell': 'تدوير الكتف الخارجي بالدامبل',
  'Incline Scapular Push-Up': 'ضغط لوحي الكتف المائل على البنش',
  'One-Arm Overhead Cable Triceps Extension': 'تمديد الترايسبس فوق الرأس بالكابل بذراع واحدة',
  'Single-Arm High Cable Row': 'تجديف علوي بالكابل بذراع واحدة',
  'Half-Kneeling One-Arm Lat Pulldown': 'سحب عالٍ للظهر بذراع واحدة من نصف الركوع',
  'Glute Kickback (Machine)': 'رفس الأرداف للخلف على الجهاز',
  'Standing Adduction (Cable)': 'ضم الساق واقفاً بالكابل للعضلات الضامة',
  'Seated Row (Machine)': 'تجديف جالساً على الجهاز',
  'Cable Straight-Arm Pulldown': 'سحب عالٍ بذراعين مستقيمتين بالكابل',
  'Cable Standing Lateral Straight-Arm Pulldown': 'سحب جانبي بذراع مستقيمة بالكابل',
  'Shoulder Internal Rotation (Cable)': 'تدوير الكتف الداخلي بالكابل',
  'Shoulder External Rotation (Cable)': 'تدوير الكتف الخارجي بالكابل',
  'Side Lateral Raise (Cable)': 'رفرفة جانبية للكتف بالكابل',
  'Front Raise (Cable)': 'رفع أمامي للكتف بالكابل',
  'Resistance Band Face Pull': 'سحب حبل المقاومة نحو الوجه',
  'Isometric Squat to Failure': 'سكوات أيزومتري ثابت حتى الإجهاد',
  'Single-Leg Lunge with Kettlebell': 'لانج بساق واحدة بالكيتل بيل',
  'Single-leg side glute press': 'دفع جانبي للأرداف بساق واحدة على الجهاز',
  'Single-Leg Deadlift with Dumbbell': 'الرفعة الميتة بساق واحدة بالدامبل',
  'Assisted chin-ups': 'عقلة معكوسة مساعدة على الجهاز',
  'Neutral-grip pull-ups or TRX rows': 'عقلة بقبضة محايدة أو تجديف بأحزمة التعليق',
  'Shrimp Squat': 'سكوات الجمبري بساق واحدة',
  'Single-Leg Glute Bridge': 'جسر الأرداف بساق واحدة',
  'L-Sit Pull-Ups': 'عقلة مع رفع الساقين بزاوية قائمة',
  'Back Lever': 'الرافعة الخلفية على العقلة',
  'Hanging Windshield Wipers': 'مساحات الزجاج بالتعلق على العقلة',
  'Cable Front Raise with Short Bar': 'رفع أمامي للكتف بالكابل بالبار القصير',
  'Smith Machine Squat': 'سكوات على جهاز السميث',
  'Seated Machine Hip Abduction': 'إبعاد الورك جالساً على الجهاز',
  'Cable Pull-Through': 'السحب البيني بالكابل للأرداف',
  'Front-Crossing Cable Lateral Raise': 'رفرفة جانبية أمامية متقاطعة بالكابل',
  'Behind-the-Back Cable Lateral Raise': 'رفرفة جانبية بالكابل من خلف الظهر',
  '45° Scapular Lateral Raise': 'رفرفة كتف بزاوية 45 درجة بالدامبل',
  'Cable Shoulder Y-Raise': 'رفع الكتف للأعلى بالكابل بشكل مفتوح',
  'Plank Reach': 'البلانك مع مد الذراع للأمام بالتبادل',
  'Cable Wrist Curl': 'ثني المعصم بالكابل بذراع واحدة',
  'Reverse Crunch': 'طحن البطن العكسي',
  'Legend Incline Bench Press': 'ضغط صدر علوي على جهاز الأوزان الحرة',
  'Chair Dips': 'غطس الترايسبس على الكرسي',
  'Pec Deck Rear Delt Fly': 'تفتيح الكتف الخلفي على جهاز الفراشة',
  'Suitcase Carry': 'مشية الحقيبة بالدامبل بيد واحدة',
  'Deficit Push-Ups': 'تمرين الضغط العميق على القضبان',
  'Barbell Incline Bench Press': 'ضغط صدر علوي بالبار',
  'Landmine Rotation': 'تدوير الجذع على محور البار الأرضي',
  'Unilateral Cross-Body Cable Pulldown': 'سحب عالٍ متقاطع بالكابل بذراع واحدة',
  'Barbell Full Squat': 'سكوات كامل بالبار',
  'Trap Bar Squat': 'سكوات بالبار السداسي',
  'Ankle Dorsiflexion Rocks': 'تأرجح الكاحل للأمام لتحسين مرونة المفصل',
  'Parallel Bar Support Hold': 'الثبات العلوي على المتوازي',
  'Reverse Hyperextension': 'تمديد الورك العكسي على الكرسي الروماني',
  'Sphinx Pose': 'وضعية أبو الهول لإطالة العمود الفقري',
  'Open Book Thoracic Mobility Stretch': 'إطالة الكتاب المفتوح لمرونة الصدر والظهر',
  'Clamshell': 'تمرين الصدفة للأرداف الجانبية',
  'Dumbbell Tate Press': 'ضغط تيت للترايسبس بالدامبل',
  'Chest-Supported Rear Delt Raise': 'رفرفة الكتف الخلفي بمسند الصدر على البنش المائل',
  'Band Pull-Apart with External Rotation': 'شد حبل المقاومة مع تدوير خارجي للكتف',
  'Double-Leg Abdominal Press': 'ضغط البطن الثابت برفع الساقين',
  'Abdominal Draw-In Maneuver (ADIM)': 'سحب البطن للداخل لتنشيط الجذع العميق',
  'Landmine Squat to Press': 'سكوات مع ضغط علوي على محور البار',
  'Barbell Reverse Lunge': 'لانج خلفي بالبار',
  'Hammerstrength Decline Chest Press': 'ضغط صدر سفلي على جهاز الأوزان الحرة',
  'Ring Support Hold': 'الثبات العلوي على حلقات التعليق',
  'Floor Glider Hamstring Curls': 'ثني الفخذ الخلفي بالمنزلقات الأرضية',
  'Trap-3 Raise': 'رفع الترابيس السفلية بذراع واحدة',
  'Seated Dumbbell External Rotation': 'تدوير الكتف الخارجي بالدامبل جالساً',
  'Banded Shoulder Drills': 'تمارين مرونة الكتف بحبل المقاومة',
  'Solo Hip Flexor Stretch': 'إطالة قابضات الورك الفردية',
  'Bent-Leg Hamstring Stretch': 'إطالة الفخذ الخلفي مع ثني الركبة',
  'Seated Shoulder Extension Stretch': 'إطالة تمديد الكتفين جالساً',
  'Banded Clamshell': 'تمرين الصدفة بحبل المقاومة للأرداف',
  'Butterfly Stretch': 'إطالة الفراشة للفخذين الداخليين',
  'Frog Stretch': 'إطالة الضفدع لفتح الوركين',
  'Seated Pancake Good Morning': 'انحناء الورك الواسع جالساً لمرونة الفخذين',
  'Horse Stance (Side Splits)': 'وقفة الفارس الثابتة لقوة الفخذين',
  'Straddle L-Sit': 'ثبات الجلوس بفتح الساقين على القضبان',
  'L-sit': 'ثبات الجلوس بزاوية قائمة على القضبان',
  'L-Sit (Foot Supported)': 'ثبات الجلوس بزاوية قائمة مع سند القدمين',
  'Calves foam roller': 'تدليك السمانة بالأسطوانة الإسفنجية',
  'Hamstring Foam roller': 'تدليك الفخذ الخلفي بالأسطوانة الإسفنجية',
  'Foam Roller Anterior Tibialis': 'تدليك الظنبوبية الأمامية بالأسطوانة الإسفنجية',
  'Foam Roller Iliotibial band': 'تدليك الشريط الجانبي للفخذ بالأسطوانة الإسفنجية',
  'Foam Roller Quadriceps': 'تدليك الفخذ الأمامي بالأسطوانة الإسفنجية',
  'Foam Roller Gluteus': 'تدليك الأرداف بالأسطوانة الإسفنجية',
  'Foam Roller Adductors': 'تدليك الفخذ الداخلي بالأسطوانة الإسفنجية',
  'Side stretch': 'إطالة جانب الجذع واقفاً',
  'Hip Circles': 'دوائر الورك لتحسين مرونة المفصل',
  'Hip Crossover': 'إطالة تقاطع الورك وأسفل الظهر مستلقياً',
  'Ankle Roll': 'تدوير الكاحل لمرونة المفصل',
  'Banded Ankle Mobility': 'تحسين مرونة الكاحل بحبل المقاومة',
  'Hip Flexor Stretch': 'إطالة قابضات الورك من الركوع',
  'Lunge with Twist Stretch': 'إطالة اللانج مع تدوير الجذع',
  'Lying Figure Four Stretch': 'إطالة الأرداف مستلقياً بوضعية الرقم أربعة',
  'Lying Hamstring Stretch with Band': 'إطالة الفخذ الخلفي مستلقياً بحبل المقاومة',
  'Pigeon Stretch': 'إطالة الحمامة العميقة للورك والأرداف',
  'Quad Stretch': 'إطالة الفخذ الأمامي واقفاً',
  'Runners Lunge Stretch': 'إطالة لانج العداء لقابضات الورك',
  'Standing IT Band Stretch': 'إطالة الشريط الجانبي للفخذ واقفاً',
  'Supported Calf Stretch': 'إطالة السمانة بالاستناد على الحائط',
  'Banded Scapular Retraction': 'ضم لوح الكتف بحبل المقاومة',
  'Incline DB Y-Raise': 'رفع الكتف للأعلى بالدامبل على بنش مائل',
  'DB Wrist Extension': 'تمديد المعصم بالدامبل للساعد',
  'Cable Lateral Raise from Waist Height': 'رفرفة جانبية بالكابل من مستوى الخصر',
  'Shinbox IR Stretch': 'إطالة التدوير الداخلي للورك بوضعية الجلوس',
  'YTWL Exercise': 'تمارين الحروف الأربعة بالدامبل لتثبيت الكتف',
  'Supine Hip Abduction': 'إبعاد الورك مستلقياً على الظهر',
  'Decline Bench Leg Raise': 'رفع الساقين على بنش مائل سفلي',
  'Overhead Barbell Press': 'ضغط الكتف فوق الرأس بالبار',
  'Clean and Press': 'النتر والضغط فوق الرأس بالبار',
  'Weighted push-ups': 'تمرين الضغط بوزن إضافي',
  'Pec Deck': 'تفتيح الصدر على جهاز الفراشة',
  'Cable Pullback with Back Extension': 'سحب الكابل للخلف مع تمديد الظهر',
  'Glute Bridge with Alternating Leg Extension': 'جسر الأرداف مع مد الساقين بالتبادل',
  'Unilateral Lunges (Split Squats)': 'سكوات منقسم بوزن الجسم',
  'Butterfly Superman': 'سوبرمان بحركة الفراشة للظهر والأكتاف',
  'Lying Leg Circles': 'دوائر الساقين مستلقياً للبطن',
  'Kneeling Superman (Bird Dog)': 'التوازن المتقاطع من الركوع (بيرد دوج)',
  'Cat Plank': 'بلانك القطة مع تقويس الظهر',
  'Seated Core Rotation (Russian Twist)': 'تدوير الجذع الروسي جالساً',
  'Single-Leg Glute Bridge (Unilateral Hip Thrust)': 'جسر الأرداف الأحادي بساق واحدة',
  'Quadruped Hip Abduction (Fire Hydrant)': 'رفع الساق الجانبي من الركوع بحبل المقاومة',
  'Tuck Planche': 'ثبات البلانش المضموم على اليدين',
  'Legend Plate-Loaded Chest Press': 'ضغط صدر على جهاز الأوزان الحرة',
  'Extreme Chest Stretch': 'إطالة عميقة للصدر على البنش',
  'Extreme Shoulder Stretch': 'إطالة عميقة للكتفين',
  'Extreme Lat Stretch': 'إطالة عميقة للظهر العريض بالتعلق',
  'Seated Cable Chest Fly': 'تفتيح الصدر جالساً بالكابل',
  'gym80 3008 Abdominal Crunch Machine': 'طحن البطن على جهاز المقاومة',
  'Barbell Silverback Shrug': 'رفع الأكتاف المائل بالبار للترابيس',
  'Reverse-Grip Lat Pulldown (Inverted Lat Pulldown)': 'سحب عالٍ للظهر بقبضة معكوسة',
  'Seated Cable Row with V-Grip': 'تجديف جالساً بالكابل بالمقبض المثلث',
  'Straight-Arm Band Pulldown': 'سحب عالٍ بذراعين مستقيمتين بحبل المقاومة',
  'Belt Squat Machine': 'سكوات الحزام على الجهاز',
  'One-Arm Cable Rear Delt Fly': 'تفتيح الكتف الخلفي بالكابل بذراع واحدة',
  'Cat-Cow Stretch': 'إطالة القطة والبقرة لمرونة الظهر',
  'Controlled Articular Rotations for Neck (Neck CARs)': 'التدوير المفصلي المتحكم به للرقبة',
  'Diaphragmatic Breathing (Belly Breathing)': 'التنفس الحجابي العميق من البطن',
  'Dumbbell Snatch': 'رفعة الخطف بالدامبل بذراع واحدة',
  'Cossack Squat': 'سكوات القوزاق الجانبي',
  'Limber 11 Mobility Routine': 'روتين المرونة الشامل للجزء السفلي',
  'Foam Roll IT Band': 'تدليك الشريط الجانبي للفخذ بالأسطوانة الإسفنجية',
  'SMR Glutes with Lacrosse Ball': 'التحرير العضلي للأرداف بالكرة الصلبة',
  'Bent-Knee Iron Cross': 'الصليب الحديدي بثني الركبتين لمرونة الظهر',
  'Roll-Overs into V-Sits': 'الدحرجة الخلفية إلى إطالة فتح الساقين',
  'Fire Hydrant Circles': 'دوائر الورك الجانبية من وضعية الركوع',
  'Seated Piriformis Stretch': 'إطالة العضلة الكمثرية جالساً',
  'Rear-Foot-Elevated Hip Flexor Stretch': 'إطالة قابضات الورك مع رفع القدم الخلفية',
  'Step Jack (Low-Impact Jumping Jack)': 'خطوات الفتح الجانبي منخفضة التأثير',
  'Slow Squat': 'سكوات بطيء متحكم به بوزن الجسم',
  'Wide Push-Up': 'تمرين الضغط بقبضة واسعة',
  'Standing Knee Raise': 'رفع الركبتين واقفاً بالتبادل',
  'Half-Kneeling Thoracic Rotation': 'تدوير الصدر من وضعية نصف الركوع',
  'Seated Dumbbell Overhead Press': 'ضغط الكتف فوق الرأس جالساً بالدامبل',
  'Single-Arm Dumbbell Shoulder Press': 'ضغط الكتف بالدامبل بذراع واحدة',
  'Single-Arm Cable Triceps Pushdown': 'دفع الترايسبس بالكابل بذراع واحدة',
  'Kettlebell Sumo High Pull': 'السحب العالي السومو بالكيتل بيل',
  'Mentzer Pulldown': 'سحب مينتزر العالي للظهر بقبضة ضيقة معكوسة',
  'Single-Arm Lat Pulldown': 'سحب عالٍ للظهر بالكابل بذراع واحدة',
  'Hip Airplane': 'تمرين توازن وتدوير الورك بساق واحدة',
  'Reverse Clamshell': 'تمرين الصدفة العكسي لتدوير الورك الداخلي',
  'Clamshell to Reverse Clamshell': 'تمرين الصدفة والصدفة العكسية للورك',
  'YTW Raises': 'رفع الذراعين بأوضاع متدرجة لتقوية أعلى الظهر',
  'Glute-Ham Raise (GHR)': 'رفع الأرداف والفخذ الخلفي على الجهاز',
  'Easy Continuous Swim (Freestyle)': 'السباحة الحرة المستمرة بوتيرة مريحة',
  'Kickboard Flutter Kick': 'ركلات السباحة بلوح الطفو',
  'Bobbing Exhale Drill': 'تمرين تنظيم الزفير والغطس المائي',
  'Wall-Hold Head Rotation Drill': 'تمرين تدوير الرأس للتنفس بالاستناد على حافة المسبح',
  'Side-Kick Breathing with Kickboard': 'تمرين الركل الجانبي والتنفس بلوح الطفو',
  'Stroke-and-Roll Drill': 'تمرين السحب وتدوير الجسم في السباحة الحرة',
  'Deep-Water Recovery Bobbing': 'تمرين الاستشفاء والتوازن في المياه العميقة',
  'Cool-Down Swim': 'سباحة التهدئة والاستشفاء',
  'Posterior Pelvic Tilt': 'إمالة الحوض الخلفية لتثبيت أسفل الظهر',
  'Seated Machine Low Row': 'تجديف سفلي جالساً على الجهاز',
  'Low Pulley Cable Row (Triangle Grip)': 'تجديف بالكابل السفلي بالمقبض المثلث',
  'Seated Hip Abduction Machine': 'إبعاد الورك جالساً على الجهاز',
  'Seated Hip Adduction Machine': 'ضم الورك جالساً على الجهاز',
  'Adductor Side Plank (Copenhagen Plank)': 'بلانك كوبنهاجن لتقوية العضلات الضامة',
  'Band Terminal Knee Extension (TKE)': 'فرد الركبة النهائي بحبل المقاومة',
  'Seated Leg Curl Machine': 'ثني الفخذ الخلفي جالساً على الجهاز',
  'Wall Push-Ups': 'تمرين الضغط على الحائط',
  'Single-Arm Dumbbell Floor Press': 'ضغط صدر على الأرض بالدامبل بذراع واحدة',
  'Pike Push-Ups': 'ضغط بايك للأكتاف بوزن الجسم',
  'Inverted Table Row': 'التجديف المقلوب أسفل الطاولة',
  'Single-Arm Dumbbell Row': 'تجديف بالدامبل بذراع واحدة',
  'Doorframe Bodyweight Face Pull': 'سحب الوجه بوزن الجسم على إطار الباب',
  'Dumbbell Hammer Curls': 'ثني البايسبس المطرقي بالدامبل',
  'Dead Bug': 'تمرين الحشرة الميتة لثبات البطن',
  'Forearm Plank': 'البلانك على الساعدين',
  'Hollow Body Hold': 'ثبات الجذع المجوّف',
  'Band Triceps Pushdown': 'دفع الترايسبس للأسفل بحبل المقاومة',
  'Serratus Wall Slide': 'انزلاق الساعدين على الحائط للعضلة المنشارية',
  'Staggered-Stance Good Morning': 'تمرين صباح الخير بالبار بوقفة متدرجة',
  'Couch Stretch': 'إطالة الأريكة لقابضات الورك والفخذ الأمامي',
  'Long Lunge Pulse Stretch': 'إطالة اللانج الطويل بالنبض الخفيف',
  'Front Split Stretch': 'إطالة الانقسام الأمامي للساقين',
  'Squat Sky Reach Stretch': 'إطالة السكوات العميق مع رفع الذراع للسماء',
  'Explosive Push-Ups': 'تمرين الضغط الانفجاري',
  'Russian Push-Ups': 'تمرين الضغط الروسي بالانتقال للساعدين',
  'Elbow Lever': 'توازن الرافعة على المرفقين',
  'Planche Lean Hold': 'ثبات ميلان البلانش للأمام',
  'Arch Hang': 'التعلق المقوّس على العقلة لتنشيط الظهر',
  'Isometric Leg Extension': 'فرد الركبة الأيزومتري الثابت على الجهاز',
  'Isometric Bench Press': 'ضغط الصدر الأيزومتري الثابت بالبار',
  'Isometric Cable Overhead Press': 'ضغط الكتف الأيزومتري الثابت بالكابل',
  'Isometric Cable Lateral Raise': 'رفرفة الكتف الجانبية الثابتة بالكابل',
  'Isometric Dumbbell Preacher Curl': 'ثني البايسبس الثابت بالدامبل على مقعد سكوت',
  'Isometric Lat Pulldown': 'السحب العالي الثابت للظهر بالكابل',
  'Single-Arm Isometric Triceps Pushdown': 'دفع الترايسبس الثابت بالكابل بذراع واحدة',
  'Boxing Training': 'تمرين الملاكمة الهوائي',
  'Wrist Circles': 'دوائر المعصم لمرونة المفاصل',
};

const EQUIP_AR = {
  barbell: 'البار',
  ez_bar: 'البار المتعرج',
  trap_bar: 'البار السداسي',
  dumbbell: 'الدامبل',
  kettlebell: 'الكيتل بيل',
  machine: 'الجهاز',
  smith_machine: 'جهاز السميث',
  cable: 'الكابل',
  resistance_band: 'حبل المقاومة',
  suspension_trainer: 'أحزمة التعليق',
  weight_plate: 'القرص الحديدي',
  medicine_ball: 'الكرة الطبية',
  sandbag: 'كيس الرمل',
  sled: 'الزلاجة',
  cardio_machine: 'الجهاز الهوائي',
  jump_rope: 'حبل القفز',
  bodyweight: 'وزن الجسم',
  other: 'الأداة المناسبة',
};

const EQUIP_WITH_AR = {
  barbell: 'بالبار',
  ez_bar: 'بالبار المتعرج',
  trap_bar: 'بالبار السداسي',
  dumbbell: 'بالدامبل',
  kettlebell: 'بالكيتل بيل',
  machine: 'على الجهاز',
  smith_machine: 'على جهاز السميث',
  cable: 'بالكابل',
  resistance_band: 'بحبل المقاومة',
  suspension_trainer: 'بأحزمة التعليق',
  weight_plate: 'بالقرص الحديدي',
  medicine_ball: 'بالكرة الطبية',
  sandbag: 'بكيس الرمل',
  sled: 'بالزلاجة',
  cardio_machine: 'على الجهاز الهوائي',
  jump_rope: 'بحبل القفز',
  bodyweight: 'بوزن الجسم',
  other: 'بالأداة المخصصة',
};

const SETUP_AR = {
  flat_bench: 'على بنش مستوٍ',
  incline_bench: 'على بنش مائل علوي',
  decline_bench: 'على بنش مائل سفلي',
  preacher_bench: 'على مقعد سكوت',
  roman_chair: 'على الكرسي الروماني',
  pullup_bar: 'على العقلة',
  dip_bars: 'على المتوازي',
  swiss_ball: 'على الكرة السويسرية',
  plyo_box: 'على الصندوق',
  mat: 'على بساط التمرين',
  ab_wheel: 'باستخدام عجلة البطن',
  parallettes: 'على القضبان المنخفضة',
  landmine: 'على محور البار الأرضي',
  wall: 'بمحاذاة الحائط',
  chair: 'على المقعد',
  foam_roller: 'على الأسطوانة الإسفنجية',
  lacrosse_ball: 'باستخدام الكرة الصلبة',
  punching_bag: 'على كيس الملاكمة',
  battle_ropes: 'بحبال المعركة',
  sliders: 'باستخدام المنزلقات الأرضية',
};

function decodeEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/\u00a0/g, ' ');
}

function cleanStepText(s) {
  return s
    .replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '')
    .replace(/^(?:Starting\s+position|Start\s+position|Setup\s+and\s+Starting\s+Position|Setup|Preparation|Execution|Movement|Instructions|How\s+to\s+Perform|Hold\s+Position|Pressing\s+phase[^:]*|Pulling\s+phase[^:]*|Lowering\s+phase[^:]*|Raising\s+phase[^:]*|The\s+Start|The\s+Lift|The\s+Squeeze|The\s+Return|Return|Descent|Ascent|Press|Control|Form|Positioning|Leg\s+Placement|Concentric\s+Phase[^:]*|Eccentric\s+Phase[^:]*|The\s+[“"]?Leg\s+Drive[”"]?[^:]*):\s*/i, '')
    .replace(/:+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensurePeriod(s) {
  if (!s) return s;
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map(s => s.trim())
    .filter(Boolean);
}

function condenseSentenceBlock(text, maxChars = 125) {
  const cleaned = cleanStepText(text);
  if (cleaned.length <= maxChars) return ensurePeriod(cleaned);
  const sents = splitSentences(cleaned);
  let out = '';
  for (const s of sents) {
    if (!out) {
      out = s;
    } else if (out.length + 1 + s.length <= maxChars) {
      out += ' ' + s;
    } else {
      break;
    }
  }
  return ensurePeriod(out || cleaned);
}

function isStandaloneHeader(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^[A-Za-z0-9\s\-()/]+:\s*$/.test(t) && t.length <= 65) return true;
  if (/^(?:How\s+to\s+Perform|Preparation|Execution|Starting\s+position|Start\s+position|Movement|Instructions|Hold\s+Position|Key\s+Points|Setup)\s*:?$/i.test(t)) return true;
  return false;
}

function isEncyclopedicIntro(line) {
  return /^(?:The\s+)?[A-Za-z0-9\s\-()/']+?\s+(?:is\s+a|are\s+a|is\s+an|is\s+one\s+of|can\s+provide|targets?\s+the|emphasizes?\s+building|was\s+designed|is\s+somewhat\s+similar)\b/i.test(line)
    || /^(?:In\s+strength\s+training|This\s+exercise\s+(?:works|strengthens|combines|involves|can\s+be|is\s+performed|is\s+a|targets)|A\s+(?:barbell|dumbbell|deadlift|single[\s-]arm|compound|bodyweight)\s)/i.test(line)
    || /^(?:The\s+(?:same\s+as|movement\s+is\s+the\s+same|movements\s+are\s+(?:basically\s+)?the\s+same|exercise\s+is\s+(?:basically\s+)?the\s+same)|With\s+the\s+width\s+of\s+the\s+grip)/i.test(line)
    || /^(?:People\s+frequently|In\s+this\s+maneuver|It\s+is\s+a\s+form\s+of|Delivered\s+in\s+its\s+own|Designed\s+to\s+supercharge|Classic\s+|If\s+you\s+train\s+with)/i.test(line)
    || /^(?:wide|narrow|close)\s+grip:/i.test(line)
    || /^(?:See\s+|Also\s+see\s+|Repeat\s+(?:as\s+needed|for\s+the\s+recommended))/i.test(line);
}

/**
 * Parse exercise.description into 3–4 crisp, actionable English instruction steps.
 * Falls back to archetype-specific steps if the source description is encyclopedic/non-procedural.
 */
function parseInstructionsEn(exercise, fallbackStepsEn) {
  const raw = decodeEntities(exercise.description || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s*•\s*/g, '\n')
    .trim();
  if (!raw) return fallbackStepsEn;

  // Strip trailing Notes / Comments / Tips / Benefits / Variations sections
  const stripped = raw
    .replace(/\n\s*(?:Notes?|Comments?|Tips?|Benefits?|Variations?|Safety|Precautions?|Common\s+Mistakes?)\s*:?[\s\S]*$/i, '')
    .trim();

  const steps = [];

  // Strategy 1: Structured Starting Position + Execution/Movement
  const startMatch = stripped.match(/(?:^|\n)\s*(?:Starting\s+position|Start\s+position|Setup|Preparation)\s*:?\s*\n?([\s\S]*?)(?=(?:\n\s*(?:Execution|Movement|How\s+to\s+Perform|Descent|The\s+Lift)\s*:?)|$)/i);
  const execMatch = stripped.match(/(?:^|\n)\s*(?:Execution|Movement)\s*:?\s*\n?([\s\S]*)$/i);

  if (startMatch && execMatch) {
    const startLines = startMatch[1].split(/\n+/).map(l => l.trim()).filter(l => !isStandaloneHeader(l));
    if (startLines.length > 0 && !isEncyclopedicIntro(startLines[0])) {
      const c = condenseSentenceBlock(startLines[0], 125);
      if (c.length >= 16) steps.push(c);
    }
    const execLines = execMatch[1]
      .split(/\n+/)
      .map(l => l.trim())
      .filter(l => l.length > 10 && !isStandaloneHeader(l));

    if (execLines.length >= 2) {
      for (const line of execLines) {
        if (steps.length >= 4) break;
        if (isEncyclopedicIntro(line)) continue;
        const c = condenseSentenceBlock(line, 125);
        if (c.length >= 16 && !isEncyclopedicIntro(c)) steps.push(c);
      }
    } else {
      for (const s of splitSentences(execMatch[1].replace(/\n+/g, ' '))) {
        if (steps.length >= 4) break;
        const c = cleanStepText(s);
        if (c.length >= 16 && !isEncyclopedicIntro(c)) steps.push(ensurePeriod(c));
      }
    }
  } else {
    // Strategy 2: Multi-line paragraphs or sentences
    const lines = stripped
      .split(/\n+/)
      .map(l => l.trim())
      .filter(l => l && !isStandaloneHeader(l));

    // If first paragraph itself contains 3+ full sentences (prose instructions + notes), split its sentences
    const firstSents = lines.length > 0 ? splitSentences(lines[0]) : [];
    if (firstSents.length >= 3 && !isEncyclopedicIntro(firstSents[0])) {
      for (const s of firstSents) {
        if (steps.length >= 4) break;
        const c = cleanStepText(s);
        if (c.length >= 16 && !isEncyclopedicIntro(c)) steps.push(ensurePeriod(c));
      }
    } else if (lines.length >= 2) {
      for (const line of lines) {
        if (steps.length >= 4) break;
        if (isEncyclopedicIntro(line)) continue;
        const c = condenseSentenceBlock(line, 125);
        if (c.length >= 16 && !isEncyclopedicIntro(c)) {
          steps.push(c);
        }
      }
    } else {
      const sents = splitSentences(stripped.replace(/\n+/g, ' '));
      for (const s of sents) {
        if (steps.length >= 4) break;
        const c = cleanStepText(s);
        if (c.length >= 16 && !isEncyclopedicIntro(c)) {
          steps.push(ensurePeriod(c));
        }
      }
    }
  }

  // Deduplicate and verify minimum quality
  const unique = [];
  const seen = new Set();
  for (const st of steps) {
    if (/:[\s.]*$/.test(st)) continue;
    const k = st.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(st);
    }
  }

  if (unique.length >= 2) return unique.slice(0, 3);
  return fallbackStepsEn;
}

function getPrimaryEquipment(exercise) {
  const eq = exercise.equipment || [];
  const primary = eq.find(x => x.kind === 'primary')?.equipment_id || eq[0]?.equipment_id || 'bodyweight';
  const setup = eq.find(x => x.kind === 'setup')?.equipment_id || null;
  return { primary, setup };
}

function getPrimaryMuscleNamesAr(exercise) {
  const primaries = (exercise.muscles || []).filter(m => m.role === 'primary').map(m => MUSCLES_AR[m.muscle_id]).filter(Boolean);
  if (primaries.length > 0) return primaries[0];
  const any = (exercise.muscles || []).map(m => MUSCLES_AR[m.muscle_id]).filter(Boolean);
  return any[0] || 'العضلات المستهدفة';
}

function getLateralityStepAr(laterality, modality) {
  if (modality === 'cardio') return null;
  if (laterality === 'unilateral') return 'أكمل التكرارات ثم بدّل للجانب الآخر بنفس التحكم.';
  if (laterality === 'alternating') return 'بدّل بين الجانبين بإيقاع ثابت مع ثبات الجذع.';
  return null;
}

/**
 * Fine-grained biomechanical archetype classifier for all 868 exercises.
 */
function classifyArchetype(e) {
  const n = (e.name || '').toLowerCase();
  const pat = e.pattern || 'other';
  const mod = e.modality || 'strength';
  const eqIds = (e.equipment || []).map(x => x.equipment_id);

  // 1. Recovery / SMR / Breathing / Meditation
  if (n.includes('foam roll') || n.includes('blackroll') || n.includes('smr ') || eqIds.includes('foam_roller') || eqIds.includes('lacrosse_ball')) {
    return 'smr_foam_roll';
  }
  if (n.includes('breathing') || n.includes('meditation')) return 'breathing_relax';

  // 2. Swimming & aquatic drills
  if (n.includes('swim') || n.includes('kickboard') || n.includes('bobbing') || n.includes('stroke-and-roll') || n.includes('wall-hold head rotation')) {
    return 'swimming';
  }

  // 3. Static stretching
  if (mod === 'stretch' || (/\bstretch\b|\bpose\b|sit & reach|toe touch|pancake|figure four|pigeon|cobra|bretzel|sleeper/.test(n) && mod !== 'strength')) {
    if (/neck|levator|chin tuck|head tilt/.test(n)) return 'stretch_neck';
    if (/shoulder|chest|pectoral|lat |biceps|triceps|butchers|doorway|prayer|sleeper|arm/.test(n)) return 'stretch_upper';
    return 'stretch_lower_core';
  }

  // 4. Mobility & joint drills
  if (mod === 'mobility' && !/squat|lunge|good morning|row|press/.test(n)) {
    if (/neck|head|chin tuck/.test(n)) return 'mobility_neck';
    if (/shoulder|arm circle|wall slide|wall angel|dislocate|y-w-t|ytw|t\/y\/i|claps|pendular|serratus|scapular/.test(n)) return 'mobility_shoulder';
    if (/thoracic|open book|cat-cow|cow-cat|iron cross|torso|twist|scorpion|roll down|pelvic|sphinx/.test(n)) return 'mobility_spine';
    if (/ankle|wrist/.test(n)) return 'mobility_ankle_wrist';
    return 'mobility_hip_lower';
  }

  // 5. Cardio
  if (mod === 'cardio') {
    if (/calf raise/.test(n)) return 'calf_raise'; // handles oedb:1376 upstream metadata quirk
    if (/bike|cycling/.test(n)) return 'cardio_bike';
    if (/rowing machine|skierg/.test(n)) return 'cardio_erg';
    if (/jump rope|skipping/.test(n)) return 'cardio_jump_rope';
    if (/box|punch|heavy bag|battle rope/.test(n)) return 'cardio_upper_hiit';
    if (/stair|climber|elliptical/.test(n)) return 'cardio_climb_elliptical';
    return 'cardio_run_walk';
  }

  // 6. Plyometrics
  if (mod === 'plyometric') {
    if (/push-up|pushup/.test(n)) return 'pushup_plyo';
    if (/box jump|squat jump|high knee|wall ball|snap down|lateral push|side slide/.test(n)) return 'plyo_lower';
    return 'plyo_full_body';
  }

  // 7. Specific strength patterns
  if (/calf raise|calf press|toe press|plantarflexion/.test(n) || pat === 'plantar_flexion') return 'calf_raise';
  if (/tibialis|dorsiflexion/.test(n) || pat === 'dorsiflexion') return 'dorsiflexion';
  if (/kettlebell swing/.test(n)) return 'kb_swing';
  if (/clean|snatch|jerk|devil's press|thruster/.test(n)) return 'olympic_power';
  if (/turkish get-up/.test(n)) return 'turkish_getup';
  if (/carry|farmer|suitcase|plate pinch/.test(n) || pat === 'carry') return 'loaded_carry';
  if (/sled push/.test(n)) return 'sled_push';
  if (/deadlift|rdl|good morning|hip hinge|arabesque/.test(n) || pat === 'hinge') return 'hinge_deadlift';
  if (/hip thrust|glute bridge|hip raise|frog press|glute drive/.test(n)) return 'hip_thrust_bridge';
  if (/kickback|donkey kick|glute extension|pull-through|reverse hyper/.test(n) || pat === 'hip_extension') return 'glute_extension';
  if (/copenhagen|adduct/.test(n) || pat === 'hip_adduction') return 'hip_adduction';
  if (/clamshell|fire hydrant|abduct|lateral walk/.test(n) || pat === 'hip_abduction') return 'hip_abduction';
  if (/lunge|split squat|step-up|step up/.test(n) || pat === 'lunge') return 'lunge_split';
  if (/wall sit|wall-sit|isometric squat|horse stance/.test(n)) return 'squat_isometric';
  if (/leg press/.test(n)) return 'leg_press';
  if (/squat/.test(n) || pat === 'squat') return 'squat';
  if (/leg extension|reverse nordic|tke|terminal knee/.test(n) || pat === 'knee_extension') return 'knee_extension';
  if (/leg curl|hamstring curl|nordic|ghr|glute-ham/.test(n) || pat === 'knee_flexion') return 'knee_flexion';
  if (/push-up|pushup|planche|wiper/.test(n) && pat === 'horizontal_push') return 'pushup';
  if (/fly|pec deck|butterfly|cross-over|crossover|press around/.test(n) && pat === 'horizontal_push') return 'chest_fly';
  if (pat === 'horizontal_push') return 'bench_chest_press';
  if (/dip|support hold/.test(n) && pat === 'vertical_push') return 'dips_support';
  if (/handstand/.test(n)) return 'handstand';
  if (pat === 'vertical_push') return 'overhead_press';
  if (/lateral raise|scaption|axe hold|y-raise/.test(n) || pat === 'shoulder_abduction') return 'lateral_raise';
  if (/front raise|upper chest raise/.test(n) || pat === 'shoulder_flexion') return 'front_raise';
  if (/shrug/.test(n) || pat === 'scapular_elevation') return 'shrug';
  if (/pull-up|pullup|chin up|chin-up|muscle-up|hang|arch hang/.test(n) && pat === 'vertical_pull') return 'pullup_chinup';
  if (/pullover|straight-arm/.test(n) && pat === 'vertical_pull') return 'pullover_straight_arm';
  if (/upright row|high pull/.test(n)) return 'upright_row';
  if (pat === 'vertical_pull') return 'lat_pulldown';
  if (/face ?pull|rear delt|reverse fly|reverse pec deck|pull-apart|snow angel|trap-3|scapular retraction|ytwl/.test(n)) return 'rear_delt_upper_back';
  if (pat === 'horizontal_pull') return 'row';
  if (pat === 'elbow_flexion') return 'biceps_curl';
  if (pat === 'elbow_extension') return 'triceps_extension';
  if (pat === 'wrist_flexion' || pat === 'wrist_extension') return 'wrist_forearm';
  if (/external rotation|internal rotation|shoulder rotation|bus driver/.test(n)) return 'shoulder_rotation';
  if (/side plank|side bend|side crunch|trunk flexion|heel touch|side hold/.test(n) || pat === 'anti_lateral_flexion') return 'core_lateral';
  if (/pallof|bird dog|shoulder tap|plank reach|pull-through|stabilization|bear walk/.test(n) || pat === 'anti_rotation') return 'core_anti_rotation';
  if (/rollout/.test(n)) return 'core_rollout';
  if (/plank|hollow|l-sit|lever|deadbug|dead bug|dragon-flag|abdominal press|draw-in|frog stand|bridge/.test(n) && (pat === 'anti_extension' || pat === 'anti_flexion' || mod === 'balance')) return 'core_plank_iso';
  if (/russian twist|wood ?chop|corkscrew|bicycle|windshield|rotation|sit-out|elbow thrust|black widow|sprinter/.test(n) || pat === 'rotation') return 'core_rotation';
  if (/superman|hyperextension|back extension|skydiver/.test(n) || pat === 'spinal_extension') return 'spinal_extension';
  if (pat === 'spinal_flexion' || pat === 'anti_extension') return 'core_flexion';

  return 'general_strength';
}

/**
 * Generates tailored Arabic instructions (3–4 steps), fallback English instructions,
 * and 3 biomechanically accurate English & Arabic common mistakes for each archetype.
 */
function buildGuidance(exercise) {
  const arch = classifyArchetype(exercise);
  const { primary: eqId, setup: setupId } = getPrimaryEquipment(exercise);
  const eqAr = EQUIP_WITH_AR[eqId] || 'بالمقاومة المناسبة';
  const eqNounAr = EQUIP_AR[eqId] || 'الوزن';
  const setupAr = setupId && SETUP_AR[setupId] ? ` ${SETUP_AR[setupId]}` : '';
  const muscleAr = getPrimaryMuscleNamesAr(exercise);
  const latStepAr = getLateralityStepAr(exercise.laterality, exercise.modality);
  const isUnilateral = exercise.laterality === 'unilateral';
  const isIsometric = /isometric|hold|plank|sit\b|hang|stand|lever/i.test(exercise.name) || exercise.forceVector === 'static';

  let instructionsAr = [];
  let fallbackEn = [];
  let mistakesEn = [];
  let mistakesAr = [];

  switch (arch) {
    case 'squat':
      instructionsAr = [
        `قف بثبات مع فتح القدمين بعرض الكتفين وتوجيه المشطين للخارج قليلاً مع تجهيز ${eqNounAr}${setupAr}.`,
        'شدّ عضلات الجذع وانزل بالورك للخلف وللأسفل مع محاذاة الركبتين لاتجاه القدمين واستقامة الظهر.',
        `ادفع الأرض بمنتصف القدمين والكعبين للصعود مع عصر ${muscleAr} دون قفل الركبتين بعنف.`,
      ];
      fallbackEn = [
        'Stand with feet shoulder-width apart and toes slightly turned out while securing the load.',
        'Brace your core and descend by sitting your hips back and down, tracking knees over toes.',
        'Drive through mid-foot and heels to stand tall while keeping a neutral spine.',
      ];
      mistakesEn = [
        'Letting the knees collapse inward (knee valgus) during the ascent.',
        'Rounding the lower back or letting the heels lift off the floor.',
        'Cutting depth short or bouncing out of the bottom without control.',
      ];
      mistakesAr = [
        'انهيار الركبتين للداخل أثناء النزول أو الصعود.',
        'تقويس أسفل الظهر أو ارتفاع الكعبين عن الأرض.',
        'الارتداد المفاجئ من أسفل الحركة دون تحكم عضلي.',
      ];
      break;

    case 'squat_isometric':
      instructionsAr = [
        `اضبط وضعية السكوات الثابت${setupAr} بحيث تكون الركبتان بمحاذاة القدمين والظهر مستقيماً.`,
        `اخفض الورك حتى زاوية مناسبة مع توزيع الوزن بالتساوي على القدمين وشدّ ${muscleAr}.`,
        'حافظ على الثبات طوال المدة المطلوبة مع تنفس منتظم دون حبس النفس.',
      ];
      fallbackEn = [
        'Set your feet shoulder-width apart and align your back firmly in the target squat position.',
        'Lower your hips until thighs approach parallel while keeping weight through mid-foot and heels.',
        'Hold the position steadily with braced core and controlled breathing for the prescribed time.',
      ];
      mistakesEn = [
        'Resting hands on the thighs to take tension off the legs.',
        'Allowing knees to cave inward or shift far ahead of the toes.',
        'Holding your breath instead of breathing steadily during the hold.',
      ];
      mistakesAr = [
        'إسناد اليدين على الفخذين لتخفيف الحمل عن العضلات.',
        'ميلان الركبتين للداخل أو تحميل الوزن على أطراف الأصابع فقط.',
        'حبس النفس بدلاً من التنفس المنتظم أثناء الثبات.',
      ];
      break;

    case 'leg_press':
      instructionsAr = [
        'اجلس على الجهاز مع تثبيت أسفل الظهر والورك تماماً على المسند وضع القدمين بثبات على اللوح.',
        'حرر الأمان واخفض الوزن ببطء وتحكم حتى تقترب الركبتان من الصدر دون رفع أسفل الظهر.',
        `ادفع اللوح بالكعبين ومنتصف القدم لتفعيل ${muscleAr} وتوقف قبل القفل الكامل للركبتين.`,
      ];
      fallbackEn = [
        'Sit with your lower back and glutes pressed firmly into the pad and place feet on the platform.',
        'Unlock the sled and lower the weight with control while keeping knees aligned with toes.',
        'Drive through heels and mid-foot to extend the legs without locking out the knees.',
      ];
      mistakesEn = [
        'Allowing the lower back and hips to lift off the pad at the bottom.',
        'Hyperextending or snapping the knees into full lockout at the top.',
        'Letting the knees cave inward under load.',
      ];
      mistakesAr = [
        'ارتفاع أسفل الظهر والأرداف عن المسند في أسفل الحركة.',
        'قفل الركبتين بعنف في أعلى الحركة.',
        'انحراف الركبتين للداخل أثناء الدفع.',
      ];
      break;

    case 'lunge_split':
      instructionsAr = [
        `اتخذ وقفة متباعدة للأمام والخلف ${eqAr}${setupAr} مع إبقاء الصدر مرتفعاً والجذع مشدوداً.`,
        'انزل عمودياً بثني الركبتين ببطء حتى تقترب الركبة الخلفية من الأرض مع ثبات الركبة الأمامية فوق القدم.',
        `ادفع الأرض بالقدم الأمامية للصعود بقوة مع تنشيط ${muscleAr}.`,
      ];
      fallbackEn = [
        'Take a controlled split stance with torso tall and core braced.',
        'Lower your hips straight down until the back knee nears the floor while keeping the front knee aligned.',
        'Push strongly through the front foot to return upright with control.',
      ];
      mistakesEn = [
        'Letting the front knee collapse inward or wobble side to side.',
        'Taking a stance that is too narrow, causing loss of balance.',
        'Leaning excessively forward or slamming the back knee into the floor.',
      ];
      mistakesAr = [
        'ميلان الركبة الأمامية للداخل أو فقدان ثباتها الجانبي.',
        'تضييق المسافة الجانبية بين القدمين مما يضعف التوازن.',
        'الارتطام بالركبة الخلفية في الأرض أو الانحناء المفرط للأمام.',
      ];
      break;

    case 'hinge_deadlift':
      instructionsAr = [
        `قف بثبات مع شدّ الجذع وتجهيز ${eqNounAr} قريباً من الجسم مع انثناء طفيف وثابت في الركبتين.`,
        'ادفع الورك للخلف بحركة مفصلية مع الحفاظ على استقامة العمود الفقري حتى تشعر بتمدد الفخذ الخلفي.',
        `ادفع الأرض بالقدمين وأعد الورك للأمام بقوة لعصر ${muscleAr} دون تقويس مفرط في أعلى الحركة.`,
      ];
      fallbackEn = [
        'Stand tall with core braced, soft knees, and the load held close to your center of mass.',
        'Hinge at the hips by pushing them straight back while keeping your spine completely neutral.',
        'Drive your hips forward and squeeze your glutes to stand tall without leaning back.',
      ];
      mistakesEn = [
        'Rounding the lower back under load instead of hinging from the hips.',
        'Letting the weight drift away from the legs during the pull.',
        'Hyperextending the lower back at lockout instead of squeezing the glutes.',
      ];
      mistakesAr = [
        'تقويس أسفل الظهر بدلاً من التحرك من مفصل الورك.',
        'ابتعاد الوزن عن الساقين مما يزيد الضغط على أسفل الظهر.',
        'المبالغة في إرجاع الظهر للخلف عند قفل الحركة بدلاً من شد الأرداف.',
      ];
      break;

    case 'kb_swing':
      instructionsAr = [
        'قف بوقفة أوسع قليلاً من الكتفين وانحنِ من الورك بظهر مستقيم للإمساك بالكيتل بيل بإحكام.',
        'اسحب الكيتل بيل بين الساقين ثم ادفع الورك للأمام بانفجارية مع عصر الأرداف والفخذ الخلفي.',
        'دع الزخم يرفع الكيتل بيل حتى مستوى الصدر مع استقامة الذراعين ثم امتص النزول بالورك بسلاسة.',
      ];
      fallbackEn = [
        'Stand slightly wider than shoulder-width, hinge at the hips, and grip the kettlebell firmly.',
        'Hike the bell back between your thighs, then snap your hips forward explosively.',
        'Let hip power float the bell to chest height, then absorb the descent back into a hinge.',
      ];
      mistakesEn = [
        'Turning the swing into a squat instead of an explosive hip hinge.',
        'Lifting the kettlebell with the arms and shoulders rather than hip drive.',
        'Leaning backward and hyperextending the lower back at the top.',
      ];
      mistakesAr = [
        'تحويل الأرجحة إلى سكوات بدلاً من حركة انحناء ودفع الورك.',
        'رفع الكيتل بيل بقوة الذراعين والكتفين بدلاً من دفع الورك.',
        'إرجاع الظهر للخلف بقوة في أعلى الأرجحة.',
      ];
      break;

    case 'olympic_power':
      instructionsAr = [
        `اتخذ وضعية بدء رياضية قوية ${eqAr} مع استقامة الظهر وشدّ الجذع وتمركز الوزن قريباً من الجسم.`,
        'ادفع الأرض بقوة عبر الورك والساقين لتوليد زخم صاعد متواصل نحو الأعلى.',
        `استقبل الوزن بثبات وتحكم مع إشراك ${muscleAr} ثم أنزله بأمان قبل التكرار التالي.`,
      ];
      fallbackEn = [
        'Set a strong athletic stance with neutral spine, tight lats, and the load close to your body.',
        'Extend hips, knees, and ankles explosively to accelerate the weight upward.',
        'Catch or press the weight with a braced core and return it under control.',
      ];
      mistakesEn = [
        'Pulling too early with the arms before fully extending the hips.',
        'Letting the weight loop far forward away from the body.',
        'Losing core bracing or rounding the back when catching or lowering.',
      ];
      mistakesAr = [
        'ثني الذراعين مبكراً قبل اكتمال دفع الورك للأعلى.',
        'ابتعاد الوزن عن مسار الجسم أثناء الرفع.',
        'فقدان شدّ الجذع أو تقوّس أسفل الظهر عند الاستقبال أو الإنزال.',
      ];
      break;

    case 'turkish_getup':
      instructionsAr = [
        'استلقِ على ظهرك وارفع الكيتل بيل بذراع مستقيمة عمودياً فوق الكتف مع تثبيت نظرك عليه.',
        'انتقل تدريجياً عبر المرفق ثم اليد ثم رفع الورك وسحب الساق للخلف نحو وضعية نصف الركوع.',
        'انهض للوقوف الكامل مع إبقاء الذراع عمودية، ثم اعكس الخطوات ببطء للعودة للأرض.',
      ];
      fallbackEn = [
        'Lie supine and press the kettlebell straight up with a locked elbow, keeping eyes on the bell.',
        'Transition step-by-step onto your elbow, hand, hip bridge, and half-kneeling stance.',
        'Stand tall with the arm stacked overhead, then reverse every step under full control.',
      ];
      mistakesEn = [
        'Rushing through transitions instead of pausing briefly at each checkpoint.',
        'Bending the loaded arm or letting the wrist collapse backward.',
        'Taking your eyes off the weight during the lower-body transitions.',
      ];
      mistakesAr = [
        'التسرع في الانتقال بين المراحل دون تثبيت كل خطوة.',
        'ثني الذراع الحاملة للوزن أو انكسار المعصم للخلف.',
        'إبعاد النظر عن الكيتل بيل أثناء الانتقال من الأرض للوقوف.',
      ];
      break;

    case 'hip_thrust_bridge':
      instructionsAr = [
        `استقر في وضعية البدء${setupAr} مع ثني الركبتين وتثبيت القدمين على الأرض وتجهيز ${eqNounAr}.`,
        `ادفع عبر الكعبين لرفع الورك حتى يشكل الجسم خطاً مستقيماً مع عصر ${muscleAr} بقوة في الأعلى.`,
        'انزل بالورك ببطء وتحكم دون تقويس أسفل الظهر ثم كرر الحركة بسلاسة.',
      ];
      fallbackEn = [
        'Set your upper back securely with knees bent, feet planted flat, and load positioned at the hips.',
        'Drive through your heels to extend the hips fully and squeeze your glutes at the top.',
        'Lower the hips under control while keeping ribs tucked and spine neutral.',
      ];
      mistakesEn = [
        'Overarching the lower back at the top instead of tilting the pelvis and squeezing glutes.',
        'Placing feet too far forward or too close, shifting load off the glutes.',
        'Rushing the lowering phase without pausing at peak contraction.',
      ];
      mistakesAr = [
        'تقويس أسفل الظهر في أعلى الحركة بدلاً من تفعيل الأرداف.',
        'وضع القدمين بعيداً جداً أو قريباً جداً مما يقلل تفعيل الألوية.',
        'التسرع في النزول دون التوقف لحظة في قمة الانقباض.',
      ];
      break;

    case 'glute_extension':
      instructionsAr = [
        `اتخذ وضعية ثابتة ${eqAr}${setupAr} مع شدّ البطن واستقامة أسفل الظهر.`,
        `حرّك الساق أو الورك للخلف بتحكم كامل حتى تشعر بانقباض واضح في ${muscleAr}.`,
        'عد ببطء إلى نقطة البداية مع الحفاظ على ثبات الحوض دون أرجحة.',
      ];
      fallbackEn = [
        'Establish a stable position with your core braced and pelvis square.',
        'Extend the hip smoothly while focusing on contracting the glutes at the peak.',
        'Return slowly to the starting position without swinging or arching the lower back.',
      ];
      mistakesEn = [
        'Arching the lower back to gain extra range of motion.',
        'Swinging the leg with momentum instead of controlled glute contraction.',
        'Rotating the pelvis open to one side during hip extension.',
      ];
      mistakesAr = [
        'تقويس أسفل الظهر لزيادة مدى الحركة بشكل خاطئ.',
        'أرجحة الساق بالزخم بدلاً من التحكم العضلي البطيء.',
        'تدوير الحوض للجانب أثناء دفع الساق للخلف.',
      ];
      break;

    case 'hip_adduction':
      instructionsAr = [
        `اتخذ وضعية التمرين${setupAr} ${eqAr} مع الحفاظ على استقامة الجذع وثبات الحوض.`,
        `ضم الساق للداخل بتحكم كامل مع عصر ${muscleAr} في نهاية الحركة.`,
        'ارجع ببطء إلى نقطة البداية دون إفلات الشد العضلي فجأة.',
      ];
      fallbackEn = [
        'Position your body securely with torso aligned and core engaged.',
        'Squeeze the inner thighs smoothly to adduct the leg under full control.',
        'Return slowly to the start without letting the weight stack slam or hips sag.',
      ];
      mistakesEn = [
        'Using jerky momentum instead of slow inner-thigh tension.',
        'Allowing the hips to sag or rotate out of alignment.',
        'Rushing the eccentric return phase.',
      ];
      mistakesAr = [
        'استخدام الزخم المفاجئ بدلاً من الشد المتحكم به للعضلات الضامة.',
        'هبوط الحوض أو التفافه خارج المحاذاة الصحيحة.',
        'التسرع في العودة لوضع البداية دون مقاومة.',
      ];
      break;

    case 'hip_abduction':
      instructionsAr = [
        `اتخذ وضعية البدء${setupAr} ${eqAr} مع تثبيت الحوض وشدّ عضلات الجذع.`,
        `أبعد الساق للخارج بتحكم وتأنٍّ حتى تشعر بانقباض واضح في ${muscleAr}.`,
        'عد ببطء إلى وضع البداية مع الحفاظ على ثبات الحوض دون ميلان للخلف.',
      ];
      fallbackEn = [
        'Set your posture with core braced and pelvis stacked squarely.',
        'Abduct the thigh smoothly to the side, pausing briefly at peak glute contraction.',
        'Lower or return with control without rocking the pelvis.',
      ];
      mistakesEn = [
        'Rolling the pelvis backward to fake a larger range of motion.',
        'Swinging the leg too fast with momentum.',
        'Shrugging or leaning the torso sideways to compensate.',
      ];
      mistakesAr = [
        'التفاف الحوض للخلف لإيهام زيادة مدى الحركة.',
        'أرجحة الساق بسرعة بدلاً من التفعيل البطيء للأرداف الجانبية.',
        'إمالة الجذع جانبياً لتعويض ضعف الثبات.',
      ];
      break;

    case 'knee_extension':
      instructionsAr = [
        `اضبط وضع الجسم ${eqAr}${setupAr} بحيث يكون مفصل الركبة محاذياً لمحور الحركة والظهر مستقراً.`,
        `افرد الركبة بسلاسة وتحكم كامل مع عصر ${muscleAr} في أعلى مدى الحركة.`,
        'عد ببطء لوضع البداية مع مقاومة الوزن وتجنب ارتداد المفصل.',
      ];
      fallbackEn = [
        'Align your knee joint cleanly with the movement path and brace your torso.',
        'Extend the knee smoothly to contract the quadriceps fully at the top.',
        'Lower back under control without swinging or letting the stack drop.',
      ];
      mistakesEn = [
        'Kicking the weight up explosively using momentum.',
        'Lifting the hips off the seat or arching the lower back.',
        'Dropping the weight quickly instead of controlling the descent.',
      ];
      mistakesAr = [
        'ركل الوزن للأعلى بالزخم بدلاً من الرفع المتحكم به.',
        'رفع الأرداف عن المقعد أو تقويس أسفل الظهر.',
        'ترك الوزن يسقط بسرعة دون تحكم في مرحلة النزول.',
      ];
      break;

    case 'knee_flexion':
      instructionsAr = [
        `تثبّت في وضعية التمرين ${eqAr}${setupAr} مع إبقاء الورك مستقراً والجذع مشدوداً.`,
        `اثنِ الركبة بتحكم كامل نحو الأرداف مع عصر ${muscleAr} في قمة الانقباض.`,
        'افرد الساق ببطء وثبات دون السماح برفع الحوض أو تقويس أسفل الظهر.',
      ];
      fallbackEn = [
        'Position yourself securely with hips pressed down and core engaged.',
        'Curl the heels smoothly toward the glutes and pause at peak hamstring contraction.',
        'Extend back slowly under tension without letting your hips lift.',
      ];
      mistakesEn = [
        'Lifting the hips off the pad or arching the lower back during the curl.',
        'Using jerky momentum to start the repetition.',
        'Cutting the eccentric stretch short by rushing the return.',
      ];
      mistakesAr = [
        'ارتفاع الورك عن المسند أو تقويس أسفل الظهر أثناء الثني.',
        'بدء التكرار بحركة خاطفة بالزخم.',
        'التسرع في فرد الساق وتفويت التمدد المتحكم به.',
      ];
      break;

    case 'calf_raise':
      instructionsAr = [
        `قف أو اجلس بثبات ${eqAr}${setupAr} مع وضع مقدمة القدمين على الحافة وإبقاء الركبتين ثابتتين.`,
        `ارفع الكعبين لأعلى مدى ممكن مع عصر ${muscleAr} وتوقف ثانية في الأعلى.`,
        'اخفض الكعبين ببطء حتى تشعر بتمدد واضح ومريح في السمانة قبل التكرار التالي.',
      ];
      fallbackEn = [
        'Position the balls of your feet firmly on the edge or platform with knees steady.',
        'Drive onto your toes as high as possible and pause briefly at peak contraction.',
        'Lower your heels slowly into a full controlled stretch without bouncing.',
      ];
      mistakesEn = [
        'Bouncing rapidly at the bottom instead of pausing for a clean stretch.',
        'Using partial half-reps without reaching full ankle plantarflexion.',
        'Rolling the ankles outward onto the pinky toes.',
      ];
      mistakesAr = [
        'الارتداد السريع في أسفل الحركة بدلاً من التحكم بالتمدد.',
        'أداء تكرارات قصيرة دون الوصول لأقصى ارتفاع وانقباض.',
        'ميلان الكاحلين للخارج بدلاً من الدفع المتوازن بمقدمة القدم.',
      ];
      break;

    case 'dorsiflexion':
      instructionsAr = [
        `تثبّت في وضعية البدء ${eqAr}${setupAr} مع استقامة الساق وتثبيت الكعب.`,
        `اسحب مشط القدم للأعلى نحو الساق بتحكم مع تنشيط ${muscleAr}.`,
        'أنزل القدم ببطء لوضع البداية وكرر بإيقاع ثابت.',
      ];
      fallbackEn = [
        'Stabilize your heel and lower leg in the starting setup.',
        'Pull your toes smoothly toward your shin to contract the tibialis anterior.',
        'Lower back slowly under control to complete each repetition.',
      ];
      mistakesEn = [
        'Bending the knees or shifting the hips to fake ankle movement.',
        'Rushing the reps without pausing at the top squeeze.',
      ];
      mistakesAr = [
        'ثني الركبتين أو تحريك الورك بدلاً من عزل حركة الكاحل.',
        'التسرع في التكرارات دون توقف قصير في قمة الانقباض.',
      ];
      break;

    case 'bench_chest_press':
      instructionsAr = [
        `تمدّد أو اجلس بثبات${setupAr} مع تثبيت القدمين على الأرض وضم لوحي الكتف للخلف وتجهيز ${eqNounAr}.`,
        'اخفض الوزن ببطء وتحكم نحو خط الصدر مع إبقاء المرفقين بزاوية آمنة نحو 45 درجة.',
        `ادفع الوزن للأعلى أو للأمام بقوة متوازنة مع عصر ${muscleAr} دون رفع الكتفين عن المسند.`,
      ];
      fallbackEn = [
        'Set your shoulder blades retracted and depressed with feet planted firmly on the floor.',
        'Lower the load under control toward your chest with elbows tucked around 45 degrees.',
        'Press smoothly back to the top while maintaining stable wrists and upper-back tension.',
      ];
      mistakesEn = [
        'Flaring the elbows out to 90 degrees, placing excessive stress on the shoulders.',
        'Bouncing the weight off the chest or lifting the glutes off the bench.',
        'Bending the wrists backward instead of stacking them directly over the elbows.',
      ];
      mistakesAr = [
        'فتح المرفقين بزاوية قائمة مما يزيد الضغط على مفصل الكتف.',
        'ارتداد الوزن على الصدر أو رفع الأرداف عن البنش أثناء الدفع.',
        'ثني المعصمين للخلف بدلاً من إبقائهما على استقامة الساعدين.',
      ];
      break;

    case 'pushup':
      instructionsAr = [
        `اتخذ وضعية الضغط${setupAr} مع وضع اليدين بثبات وشدّ البطن والأرداف ليصبح الجسم بخط مستقيم.`,
        'اخفض الصدر ببطء نحو الأرض مع توجيه المرفقين للخلف بزاوية 45 درجة تقريباً.',
        `ادفع الأرض بقوة للصعود مع عصر ${muscleAr} دون هبوط أسفل الظهر.`,
      ];
      fallbackEn = [
        'Set your hands firmly and brace your core and glutes so your body forms a straight line.',
        'Lower your chest under control with elbows angled roughly 45 degrees from your torso.',
        'Press back up cleanly to full extension without letting your hips sag.',
      ];
      mistakesEn = [
        'Letting the hips sag or lower back arch during the descent.',
        'Flaring the elbows straight out to the sides.',
        'Dropping the head forward instead of keeping the neck neutral.',
      ];
      mistakesAr = [
        'هبوط الورك وتقوّس أسفل الظهر أثناء الحركة.',
        'فتح المرفقين للخارج بزاوية واسعة تضر بالكتفين.',
        'إسقاط الرأس للأسفل بدلاً من إبقاء الرقبة على استقامة الظهر.',
      ];
      break;

    case 'pushup_plyo':
      instructionsAr = [
        'اتخذ وضعية ضغط قوية على بساط أو سطح ثابت مع شدّ الجذع والأرداف بالكامل.',
        'اخفض الصدر بتحكم ثم ادفع الأرض بانفجارية لرفع اليدين عن السطح.',
        'اهبط بنعومة مع ثني المرفقين قليلاً لامتصاص الصدمة ثم واصل التكرار التالي.',
      ];
      fallbackEn = [
        'Start in a rigid high plank with hands under shoulders and core fully braced.',
        'Lower your chest under control, then press explosively to launch off the floor.',
        'Land softly with slightly bent elbows to absorb impact smoothly.',
      ];
      mistakesEn = [
        'Landing with stiff, locked-out elbows that jolt the joints.',
        'Letting the hips sag on landing due to lost core tension.',
        'Performing reps when fatigued and form breaks down.',
      ];
      mistakesAr = [
        'الهبوط بمرفقين مقفولين تماماً مما يضغط على المفاصل.',
        'هبوط الحوض عند الارتطام نتيجة فقدان شدّ الجذع.',
        'الاستمرار بالتكرارات الانفجارية بعد تراجع جودة الأداء.',
      ];
      break;

    case 'chest_fly':
      instructionsAr = [
        `اتخذ وضعية ثابتة ${eqAr}${setupAr} مع صدر مفتوح وانثناء طفيف وثابت في المرفقين.`,
        `قرّب الذراعين أمام الصدر بحركة قوسية ناعمة مع عصر ${muscleAr} في نقطة الالتقاء.`,
        'افتح الذراعين ببطء وتحكم حتى تشعر بتمدد مريح في الصدر دون إجهاد الكتف الأمامي.',
      ];
      fallbackEn = [
        'Set your chest proud and shoulder blades retracted with a slight, fixed bend in the elbows.',
        'Bring your arms together in a smooth arc and squeeze your chest at peak contraction.',
        'Open back slowly under control until you feel a comfortable pectoral stretch.',
      ];
      mistakesEn = [
        'Bending and straightening the elbows excessively, turning the fly into a press.',
        'Overstretching past shoulder mobility at the bottom of the movement.',
        'Rolling the shoulders forward instead of keeping the chest lifted.',
      ];
      mistakesAr = [
        'ثني ومدّ المرفقين كثيراً مما يحوّل التفتيح إلى تمرين ضغط.',
        'المبالغة في فتح الذراعين للخلف مما يجهد مفصل الكتف.',
        'تدوير الكتفين للأمام بدلاً من إبقاء الصدر بارزاً.',
      ];
      break;

    case 'overhead_press':
      instructionsAr = [
        `اتخذ وضعية ثابتة ${eqAr}${setupAr} مع شدّ البطن والأرداف وتثبيت المعصمين فوق المرفقين.`,
        `ادفع الوزن للأعلى بسلاسة على مسار متزن لتفعيل ${muscleAr} دون تقويس أسفل الظهر.`,
        'اخفض الوزن ببطء وتحكم إلى مستوى الكتفين ثم ابدأ التكرار التالي.',
      ];
      fallbackEn = [
        'Set a stable stance or seat with core braced, ribs down, and wrists stacked over elbows.',
        'Press the weight smoothly overhead until arms extend without shrugging excessively.',
        'Lower the load under control back to shoulder level while keeping your spine neutral.',
      ];
      mistakesEn = [
        'Overarching the lower back and flaring the ribs during the press.',
        'Letting the wrists bend backward under the weight.',
        'Using excessive leg bounce when performing a strict press.',
      ];
      mistakesAr = [
        'تقويس أسفل الظهر وإبراز القفص الصدري أثناء الدفع.',
        'انثناء المعصمين للخلف تحت الوزن.',
        'الاعتماد على نطّة الساقين في تمرين الضغط الصارم.',
      ];
      break;

    case 'dips_support':
      instructionsAr = [
        `أمسك المقابض بإحكام${setupAr} واضغط الكتفين للأسفل بعيداً عن الأذنين مع شدّ الجذع.`,
        isIsometric
          ? `حافظ على ثبات الجسم مع استقامة الذراعين وتنشيط ${muscleAr} طوال مدة الثبات.`
          : 'انزل ببطء بثني المرفقين حتى يصبح العضد موازياً للأرض تقريباً دون انغماس الكتفين.',
        isIsometric
          ? 'تنفّس بانتظام وتجنب غوص الرأس بين الكتفين حتى نهاية الزمن.'
          : `ادفع بقوة للصعود مع عصر ${muscleAr} دون قفل عنيف للمرفقين.`,
      ];
      fallbackEn = isIsometric
        ? [
            'Grip the bars or rings firmly and depress your shoulders away from your ears.',
            'Hold your body steady with locked arms and braced core for the prescribed duration.',
            'Breathe smoothly without letting your shoulders shrug upward.',
          ]
        : [
            'Support yourself firmly with shoulders depressed and core braced.',
            'Lower under control until upper arms approach parallel without rolling shoulders forward.',
            'Press back up smoothly to full arm extension while keeping torso control.',
          ];
      mistakesEn = [
        'Letting the shoulders shrug up toward the ears.',
        'Dropping too deep and rolling the shoulders forward into impingement.',
        'Swinging the legs for momentum during repetitions.',
      ];
      mistakesAr = [
        'ارتفاع الكتفين نحو الأذنين وفقدان ثبات لوحي الكتف.',
        'النزول بعمق مفرط يؤدي لتقدم الكتفين للأمام.',
        'أرجحة الساقين للاستعانة بالزخم أثناء الصعود.',
      ];
      break;

    case 'handstand':
      instructionsAr = [
        `ثبّت اليدين بعرض الكتفين${setupAr} مع فرد الأصابع وشدّ الجذع والأرداف بالكامل.`,
        'ادفع الأرض بقوة عبر الكتفين لإبقاء الجسم في خط مستقيم ومتزن.',
        'حافظ على التنفس المنتظم والتحكم الكامل عند الثبات أو النزول بأمان.',
      ];
      fallbackEn = [
        'Plant hands shoulder-width apart with fingers spread and push tall through your shoulders.',
        'Keep ribs tucked, core braced, and legs aligned overhead.',
        'Maintain balance with subtle finger pressure and exit with control.',
      ];
      mistakesEn = [
        'Arching the lower back into a banana shape instead of bracing the core.',
        'Collapsing into the shoulders rather than actively pushing tall.',
        'Letting elbows bend unevenly when fatiguing.',
      ];
      mistakesAr = [
        'تقوّس أسفل الظهر بشدة بدلاً من الحفاظ على استقامة الجذع.',
        'الانغماس في الكتفين بدلاً من الدفع النشط نحو الأرض.',
        'فقدان شدّ الأصابع والساعدين عند تعديل التوازن.',
      ];
      break;

    case 'lateral_raise':
      instructionsAr = [
        `قف أو اجلس باستقامة ${eqAr}${setupAr} مع انثناء خفيف جداً في المرفقين وشدّ الجذع.`,
        `ارفع الذراع للجانب حتى مستوى الكتف مع قيادة الحركة بالمرفق لتفعيل ${muscleAr}.`,
        'اخفض الوزن ببطء وتحكم دون إسقاط الذراع فجأة أو هز الجذع.',
      ];
      fallbackEn = [
        'Stand or sit tall with core braced and a slight, soft bend in the elbows.',
        'Raise your arm smoothly out to shoulder height, leading with the elbow.',
        'Lower the load slowly under control without swinging your torso.',
      ];
      mistakesEn = [
        'Shrugging the upper traps toward the ears while lifting.',
        'Using body swing and momentum with weights that are too heavy.',
        'Raising hands significantly higher than elbows with internal rotation.',
      ];
      mistakesAr = [
        'رفع الترابيس والكتفين نحو الأذنين أثناء الرفرفة.',
        'استخدام أرجحة الجذع والزخم بسبب اختيار وزن أثقل من المناسب.',
        'رفع اليدين أعلى من المرفقين مما يقلل تفعيل الكتف الجانبي.',
      ];
      break;

    case 'front_raise':
      instructionsAr = [
        `قف بثبات ${eqAr} مع شدّ الجذع وإبقاء المرفقين شبه مستقيمين.`,
        `ارفع الوزن للأمام بسلاسة حتى مستوى الكتفين مع تركيز الشد على ${muscleAr}.`,
        'اخفض الوزن ببطء وتحكم دون إرجاع الظهر للخلف.',
      ];
      fallbackEn = [
        'Stand tall with feet hip-width apart, core braced, and a slight bend in the elbows.',
        'Lift the weight smoothly in front of you to shoulder level.',
        'Lower slowly with control without leaning back.',
      ];
      mistakesEn = [
        'Leaning backward and using lower-back momentum to swing the weight up.',
        'Shrugging the shoulders up toward the ears.',
        'Dropping the weight too quickly on the way down.',
      ];
      mistakesAr = [
        'إرجاع الظهر للخلف والاستعانة بالزخم لرفع الوزن.',
        'شدّ الترابيس ورفع الكتفين نحو الأذنين.',
        'إفلات الوزن بسرعة في مرحلة النزول.',
      ];
      break;

    case 'shrug':
      instructionsAr = [
        `قف باستقامة ${eqAr} مع فرد الذراعين بجانب الجسم أو أمامه وإبقاء المرفقين مستقيمين.`,
        `ارفع الكتفين عمودياً نحو الأذنين مع عصر ${muscleAr} وتوقف ثانية في الأعلى.`,
        'اخفض الكتفين ببطء حتى التمدد الكامل دون تدوير دائري للمفصل.',
      ];
      fallbackEn = [
        'Stand tall holding the load with straight arms and neutral neck alignment.',
        'Elevate your shoulders straight up toward your ears and squeeze your traps at the top.',
        'Lower your shoulders slowly into a full stretch without rolling them.',
      ];
      mistakesEn = [
        'Rolling the shoulders in circles instead of lifting straight up and down.',
        'Bending the elbows and pulling with the biceps.',
        'Jutting the head forward during the squeeze.',
      ];
      mistakesAr = [
        'تدوير الكتفين بشكل دائري بدلاً من الرفع العمودي المباشر.',
        'ثني المرفقين وسحب الوزن بالبايسبس.',
        'دفع الرأس للأمام أثناء الانقباض.',
      ];
      break;

    case 'pullup_chinup':
      instructionsAr = [
        `أمسك العقلة بإحكام${setupAr} وافرد الذراعين مع تنشيط لوحي الكتف للأسفل وشدّ الجذع.`,
        isIsometric
          ? `ثبّت جسمك في الوضعية المطلوبة مع إشراك ${muscleAr} وتنفس هادئ ومنتظم.`
          : `اسحب جسمك للأعلى بقيادة المرفقين للأسفل مع عصر ${muscleAr} حتى يتجاوز الذقن مستوى العارضة.`,
        isIsometric
          ? 'حافظ على استقرار الكتفين وتجنب التأرجح حتى انتهاء الوقت.'
          : 'انزل ببطء وتحكم كامل حتى فرد الذراعين دون ترك الجسم يسقط فجأة.',
      ];
      fallbackEn = isIsometric
        ? [
            'Grip the bar securely, engage your shoulder blades down, and brace your core.',
            'Maintain the target hold cleanly while breathing steadily.',
            'Keep shoulders active and exit slowly without dropping abruptly.',
          ]
        : [
            'Grip the bar firmly, set your shoulder blades down, and brace your core.',
            'Pull your chest toward the bar by driving your elbows down and back.',
            'Lower smoothly to a controlled hang without swinging.',
          ];
      mistakesEn = [
        'Kipping or swinging the legs to generate momentum.',
        'Performing half repetitions without lowering into a controlled stretch.',
        'Shrugging the shoulders up toward the ears at the top.',
      ];
      mistakesAr = [
        'أرجحة الساقين واستخدام الزخم للصعود.',
        'تقصير مدى الحركة وعدم النزول بتحكم كامل.',
        'رفع الكتفين نحو الأذنين وتقوّس أعلى الظهر.',
      ];
      break;

    case 'lat_pulldown':
      instructionsAr = [
        `اجلس أو اثبت في الوضعية ${eqAr}${setupAr} مع تثبيت الفخذين وشدّ الجذع واستقامة الصدر.`,
        `اسحب المقبض للأسفل نحو أعلى الصدر بقيادة المرفقين للأسفل لعصر ${muscleAr}.`,
        'أعد المقبض للأعلى ببطء وتحكم حتى تمدد الظهر بالكامل دون انحناء مفرط للخلف.',
      ];
      fallbackEn = [
        'Secure your posture, grip the handle cleanly, and pull your shoulder blades down.',
        'Drive your elbows down toward your ribs to pull the handle to your upper chest.',
        'Return smoothly to full overhead extension while maintaining tension.',
      ];
      mistakesEn = [
        'Leaning far backward to turn the pulldown into a momentum-driven row.',
        'Pulling primarily with the biceps while letting shoulders shrug up.',
        'Letting the weight stack yank the arms back up without control.',
      ];
      mistakesAr = [
        'الميلان الشديد للخلف واستخدام وزن الجسم لسحب الكابل.',
        'السحب بالذراعين فقط مع ارتفاع الكتفين نحو الأذنين.',
        'ترك الوزن يسحب الذراعين للأعلى بسرعة دون مقاومة.',
      ];
      break;

    case 'pullover_straight_arm':
      instructionsAr = [
        `اتخذ وضعية ثابتة ${eqAr}${setupAr} مع شدّ البطن وإبقاء المرفقين شبه مستقيمين بثبات.`,
        `اسحب الوزن بقوس سلس من الأعلى نحو الورك أو الصدر مع عصر ${muscleAr}.`,
        'عد ببطء وتحكم إلى التمدد العلوي دون تقوّس أسفل الظهر.',
      ];
      fallbackEn = [
        'Set a braced core with a slight, fixed bend in the elbows.',
        'Sweep the load smoothly in an arc by driving through your lats.',
        'Return slowly into an overhead stretch without arching your lower back.',
      ];
      mistakesEn = [
        'Bending and extending the elbows, turning the movement into a triceps extension.',
        'Arching the lower back excessively during the overhead stretch.',
        'Using body momentum instead of pure shoulder extension.',
      ];
      mistakesAr = [
        'ثني ومدّ المرفقين مما يحوّل التمرين إلى تمديد للترايسبس.',
        'تقويس أسفل الظهر أثناء رفع الذراعين للأعلى.',
        'استخدام زخم الجذع بدلاً من عزل حركة الكتف واللاتس.',
      ];
      break;

    case 'upright_row':
      instructionsAr = [
        `قف باستقامة ${eqAr} وأمسك الوزن بقبضة مريحة أمام الفخذين مع شدّ الجذع.`,
        `اسحب الوزن قريباً من الجسم بقيادة المرفقين للأعلى حتى مستوى الصدر العلوي لتفعيل ${muscleAr}.`,
        'اخفض الوزن ببطء وتحكم دون أرجحة أو شدّ مفرط للرقبة.',
      ];
      fallbackEn = [
        'Stand tall holding the weight in front of your thighs with a shoulder-width grip.',
        'Pull the load close to your body, leading with the elbows up to upper-chest height.',
        'Lower slowly under control without leaning back.',
      ];
      mistakesEn = [
        'Using an overly narrow grip that causes shoulder impingement.',
        'Pulling the elbows excessively high above shoulder comfort.',
        'Swinging the hips to heave the weight upward.',
      ];
      mistakesAr = [
        'تضييق القبضة بشكل مفرط مما يضغط على مفصل الكتف.',
        'رفع المرفقين أعلى من الحد المريح لمفصل الكتف.',
        'أرجحة الورك والجذع لرفع الوزن بالزخم.',
      ];
      break;

    case 'row':
      instructionsAr = [
        `اتخذ وضعية ثابتة ${eqAr}${setupAr} مع استقامة الظهر وشدّ الجذع وتثبيت الكتفين.`,
        `اسحب الوزن نحو أسفل الصدر أو الخصر مع ضم لوحي الكتف وعصر ${muscleAr}.`,
        'أعد الوزن ببطء إلى التمدد الكامل دون تقوّس أسفل الظهر أو هز الجذع.',
      ];
      fallbackEn = [
        'Set a stable torso position with a flat back and braced core.',
        'Pull the load toward your torso by driving elbows back and squeezing your shoulder blades.',
        'Lower or extend back slowly to a full stretch without jerking your back.',
      ];
      mistakesEn = [
        'Rounding the lower back or jerking the torso upright to move heavy weight.',
        'Shrugging the shoulders instead of retracting the shoulder blades.',
        'Pulling only with the arms without finishing the back squeeze.',
      ];
      mistakesAr = [
        'تقويس أسفل الظهر أو هز الجذع بعنف لسحب الوزن.',
        'رفع الكتفين للأعلى بدلاً من ضم لوحي الكتف للخلف.',
        'سحب الوزن بالذراعين فقط دون تفعيل عضلات الظهر.',
      ];
      break;

    case 'rear_delt_upper_back':
      instructionsAr = [
        `اتخذ وضعية ثابتة ${eqAr}${setupAr} مع إبقاء الصدر مرتفعاً والكتفين بعيدين عن الأذنين.`,
        `اسحب أو افتح الذراعين للخلف بقيادة المرفقين مع عصر ${muscleAr} في نهاية الحركة.`,
        'عد ببطء وتحكم إلى نقطة البداية دون تقويس الظهر أو استخدام الزخم.',
      ];
      fallbackEn = [
        'Set a neutral spine with shoulders depressed and core lightly braced.',
        'Pull or sweep the arms back, focusing on squeezing the rear delts and upper back.',
        'Return slowly under control without letting the weight pull you forward.',
      ];
      mistakesEn = [
        'Using too much weight and swinging the torso backward.',
        'Shrugging the upper traps instead of targeting the rear delts and mid-back.',
        'Rushing the contraction without pausing briefly at full pull.',
      ];
      mistakesAr = [
        'استخدام وزن ثقيل يضطرك لأرجحة الجذع للخلف.',
        'رفع الترابيس العلوية بدلاً من التركيز على الكتف الخلفي وأعلى الظهر.',
        'التسرع في الأداء دون توقف لحظي عند قمة الانقباض.',
      ];
      break;

    case 'biceps_curl':
      instructionsAr = [
        `ثبّت جسمك باستقامة ${eqAr}${setupAr} مع إبقاء المرفقين قريبين من الجذع وثابتين.`,
        `اثنِ المرفقين لرفع الوزن بسلاسة مع عصر ${muscleAr} في أعلى الحركة.`,
        'أنزل الوزن ببطء وتحكم حتى شبه فرد كامل للذراع دون أرجحة الظهر.',
      ];
      fallbackEn = [
        'Set a stable posture with elbows tucked close to your sides and wrists neutral.',
        'Curl the weight upward smoothly, squeezing the biceps firmly at the top.',
        'Lower slowly with full control back to the bottom stretch.',
      ];
      mistakesEn = [
        'Swinging the torso and hips to generate momentum.',
        'Letting the elbows drift far forward or shrug upward during the curl.',
        'Dropping the weight rapidly instead of controlling the eccentric phase.',
      ];
      mistakesAr = [
        'أرجحة الظهر والورك لاستخدام الزخم في رفع الوزن.',
        'تقدم المرفقين للأمام بشكل مفرط أو رفع الكتفين.',
        'إفلات الوزن بسرعة في مرحلة النزول.',
      ];
      break;

    case 'triceps_extension':
      instructionsAr = [
        `ثبّت جسمك ${eqAr}${setupAr} مع تثبيت العضدين والمرفقين في مكان ثابت طوال التمرين.`,
        `افرد المرفقين بسلاسة كاملة مع عصر ${muscleAr} في نهاية المدّ.`,
        'عد ببطء إلى نقطة البداية مع مقاومة الوزن دون تحريك الكتفين.',
      ];
      fallbackEn = [
        'Lock your upper arms firmly in place with shoulders down and core braced.',
        'Extend the elbows smoothly until the triceps reach full contraction.',
        'Return slowly under control without letting the elbows flare or drift.',
      ];
      mistakesEn = [
        'Moving the shoulders and upper arms instead of isolating the elbow joint.',
        'Flaring the elbows wide or leaning body weight over the cable.',
        'Cutting the extension short or letting the weight snap back.',
      ];
      mistakesAr = [
        'تحريك الكتفين والعضدين بدلاً من عزل حركة مفصل المرفق.',
        'فتح المرفقين للخارج أو الاتكاء بوزن الجسم على الوزن.',
        'تقصير مدى الفرد أو ترك الوزن يرتد بسرعة.',
      ];
      break;

    case 'wrist_forearm':
      instructionsAr = [
        `أمسك ${eqNounAr} بإحكام مع تثبيت الساعدين${setupAr} وإبقاء الكتفين مسترخيين.`,
        `حرّك المعصم بمدى كامل وبطيء لتفعيل ${muscleAr} مع توقف قصير في قمة الانقباض.`,
        'عد ببطء إلى وضع البداية دون استخدام حركة المرفقين أو الذراعين.',
      ];
      fallbackEn = [
        'Stabilize your forearms securely while gripping the load comfortably.',
        'Flex or extend only at the wrist through a full controlled range of motion.',
        'Pause briefly at peak tension and lower slowly without jerking.',
      ];
      mistakesEn = [
        'Lifting the forearms off the support and using the biceps.',
        'Moving too fast with heavy load, straining the wrist joint.',
      ];
      mistakesAr = [
        'رفع الساعدين عن المسند وإشراك المرفقين في الحركة.',
        'السرعة الزائدة بوزن ثقيل مما يجهد مفصل المعصم.',
      ];
      break;

    case 'shoulder_rotation':
      instructionsAr = [
        `اتخذ وضعية ثابتة ${eqAr}${setupAr} مع تثبيت المرفق بزاوية 90 درجة بجانب الجذع أو بمستوى الكتف.`,
        `دوّر الساعد ببطء وتحكم حول محور الكتف لتنشيط ${muscleAr}.`,
        'عد ببطء إلى نقطة البداية دون فتح المرفق أو لف الجذع.',
      ];
      fallbackEn = [
        'Keep your elbow pinned steadily at 90 degrees and shoulder blade set back.',
        'Rotate the forearm slowly through a comfortable range to work the rotator cuff.',
        'Return under full control without twisting your torso.',
      ];
      mistakesEn = [
        'Using too much weight, forcing the torso or deltoid to take over.',
        'Letting the elbow drift away from its fixed pivot point.',
        'Rushing repetitions instead of slow joint-friendly control.',
      ];
      mistakesAr = [
        'استخدام وزن ثقيل يفقد التمرين عزله لعضلات الكفة المدورة.',
        'تحرك المرفق بعيداً عن نقطة الارتكاز الثابتة.',
        'التسرع في الدوران بدلاً من الحركة البطيئة الدقيقة.',
      ];
      break;

    case 'core_plank_iso':
      instructionsAr = [
        `اتخذ وضعية الثبات${setupAr} مع محاذاة الجسم وشدّ البطن والأرداف وإبقاء الرقبة محايدة.`,
        `حافظ على ضغط الجذع المستمر لتفعيل ${muscleAr} ومنع تقوّس أسفل الظهر.`,
        'تنفّس بعمق وانتظام طوال المدة المحددة ثم أنهِ الثبات بتحكم.',
      ];
      fallbackEn = [
        'Align your body cleanly with shoulders stacked, glutes tight, and core braced.',
        'Maintain steady full-body tension without letting your lower back arch or sag.',
        'Breathe steadily throughout the hold and dismount under control.',
      ];
      mistakesEn = [
        'Letting the hips sag downward, stressing the lower back.',
        'Piking the hips too high to make the hold easier.',
        'Holding your breath or letting the head drop.',
      ];
      mistakesAr = [
        'هبوط الورك للأسفل وتقوّس أسفل الظهر.',
        'رفع الورك عالياً بشكل يقلل الشد عن عضلات البطن.',
        'حبس النفس أو إسقاط الرأس أثناء الثبات.',
      ];
      break;

    case 'core_rollout':
      instructionsAr = [
        `اثبت على الركبتين أو القدمين ${eqAr}${setupAr} مع شدّ البطن وإمالة الحوض قليلاً للخلف.`,
        `تمدّد للأمام ببطء وتحكم حتى أقصى مدى تستطيع الحفاظ فيه على استقامة الظهر مع تفعيل ${muscleAr}.`,
        'اسحب جسمك للخلف بقوة عضلات البطن والظهر العريض دون تقوّس القطنية.',
      ];
      fallbackEn = [
        'Start braced with ribs tucked down and glutes lightly engaged.',
        'Extend forward slowly only as far as you can maintain a neutral spine.',
        'Pull back smoothly using your abs and lats without letting the lower back sag.',
      ];
      mistakesEn = [
        'Extending too far and letting the lower back collapse into hyperextension.',
        'Pulling back by sitting the hips to the heels instead of using the abs.',
        'Shrugging the shoulders up toward the ears.',
      ];
      mistakesAr = [
        'التمدد الزائد الذي يؤدي لهبوط وتقوّس أسفل الظهر.',
        'إرجاع الورك للخلف بدلاً من السحب الفعلي بعضلات البطن.',
        'انغماس الكتفين نحو الأذنين أثناء التمدد.',
      ];
      break;

    case 'core_lateral':
      instructionsAr = [
        `اتخذ وضعية جانبية متزنة ${eqAr}${setupAr} مع الحفاظ على استقامة الرأس والجذع والوركين.`,
        isIsometric
          ? `حافظ على رفع الورك وثبات الجسم بخط مستقيم لتفعيل ${muscleAr}.`
          : `نفّذ الحركة الجانبية ببطء وتحكم مع عصر ${muscleAr} دون ميلان للأمام أو للخلف.`,
        'عد ببطء أو حافظ على تنفس منتظم طوال الأداء.',
      ];
      fallbackEn = isIsometric
        ? [
            'Stack your body in a straight lateral line with elbow or hand firmly under the shoulder.',
            'Lift the hips and brace your obliques to hold a rigid line.',
            'Breathe steadily without letting your hips drop or roll forward.',
          ]
        : [
            'Keep your torso tall and square without leaning forward or backward.',
            'Move smoothly in the lateral plane to contract the obliques under control.',
            'Return steadily to the neutral midline.',
          ];
      mistakesEn = [
        'Letting the hips drop or rotate forward/backward out of alignment.',
        'Using momentum or bending forward instead of pure lateral tension.',
        'Collapsing into the supporting shoulder.',
      ];
      mistakesAr = [
        'هبوط الورك أو دورانه للأمام أو الخلف خارج الاستقامة.',
        'استخدام الزخم أو الانحناء للأمام بدلاً من العزل الجانبي.',
        'إهمال تثبيت الكتف الداعم أثناء الوضعية الجانبية.',
      ];
      break;

    case 'core_anti_rotation':
      instructionsAr = [
        `اتخذ وضعية ثابتة ${eqAr}${setupAr} مع شدّ البطن وتثبيت الحوض والكتفين بمواجهة الأمام.`,
        `نفّذ المدّ أو الدفع ببطء مع مقاومة أي التفاف في الجذع لتفعيل ${muscleAr}.`,
        'عد بتحكم إلى نقطة البداية مع تنفس ثابت ومنتظم.',
      ];
      fallbackEn = [
        'Set a stable stance or quadruped posture with hips and shoulders square.',
        'Extend or press slowly while actively resisting any torso rotation.',
        'Return under full control without shifting weight side to side.',
      ];
      mistakesEn = [
        'Allowing the torso or hips to twist toward the resistance.',
        'Arching the lower back when extending the arms or legs.',
        'Moving too fast without bracing the core first.',
      ];
      mistakesAr = [
        'التفاف الجذع أو ميلان الحوض مع اتجاه المقاومة.',
        'تقويس أسفل الظهر عند مدّ الذراع أو الساق.',
        'التسرع في الحركة دون تثبيت عضلات الجذع أولاً.',
      ];
      break;

    case 'core_rotation':
      instructionsAr = [
        `اتخذ وضعية البدء ${eqAr}${setupAr} مع إطالة العمود الفقري وشدّ عضلات الجذع.`,
        `دوّر الجزء العلوي من الجذع ببطء وتحكم مع عصر ${muscleAr} دون هز أسفل الظهر.`,
        'عد بسلاسة إلى نقطة البداية ثم واصل الحركة بإيقاع متزن.',
      ];
      fallbackEn = [
        'Brace your core with a tall spine and stable lower body.',
        'Rotate smoothly through the ribcage and obliques under full control.',
        'Return to center without jerking or rounding the lower back.',
      ];
      mistakesEn = [
        'Swinging only the arms while keeping the ribcage still.',
        'Rounding the lower back and jerking rapidly from side to side.',
        'Holding your breath instead of exhaling into the rotation.',
      ];
      mistakesAr = [
        'تحريك الذراعين فقط دون تدوير القفص الصدري والجذع.',
        'تقوّس أسفل الظهر والتسرع العشوائي بين الجانبين.',
        'حبس النفس بدلاً من الزفير مع التدوير.',
      ];
      break;

    case 'core_flexion':
      instructionsAr = [
        `تمدّد أو اثبت في الوضعية ${eqAr}${setupAr} مع تثبيت أسفل الظهر وشدّ البطن قبل البدء.`,
        `اثنِ الجذع أو ارفع الساقين بتحكم كامل مع الزفير وعصر ${muscleAr} في أعلى الحركة.`,
        'عد ببطء إلى وضع البداية دون شدّ الرقبة أو استخدام الأرجحة.',
      ];
      fallbackEn = [
        'Set your lower back securely and engage your abs before initiating the rep.',
        'Curl the torso or lift the legs smoothly while exhaling into peak contraction.',
        'Lower slowly under tension without swinging or pulling on your neck.',
      ];
      mistakesEn = [
        'Pulling on the neck with the hands during crunches or sit-ups.',
        'Using hip momentum or swinging the legs instead of curling with the abs.',
        'Letting the lower back arch off the mat when lowering the legs.',
      ];
      mistakesAr = [
        'شدّ الرقبة باليدين للأمام أثناء الصعود.',
        'أرجحة الساقين أو الاعتماد على الزخم بدلاً من انقباض البطن.',
        'تقوّس وارتفاع أسفل الظهر عن الأرض أثناء خفض الساقين.',
      ];
      break;

    case 'spinal_extension':
      instructionsAr = [
        `استلقِ أو اثبت في الوضعية ${eqAr}${setupAr} مع إبقاء الرقبة على استقامة العمود الفقري.`,
        `ارفع الجذع أو الأطراف بتحكم حتى استقامة الظهر مع عصر ${muscleAr} دون مبالغة.`,
        'اخفض ببطء إلى نقطة البداية مع الحفاظ على شدّ خفيف في الجذع.',
      ];
      fallbackEn = [
        'Position your hips securely with neck neutral and glutes lightly engaged.',
        'Extend the torso smoothly until your body reaches a straight, neutral alignment.',
        'Lower slowly under control without snapping upward.',
      ];
      mistakesEn = [
        'Hyperextending the lower back far past neutral alignment.',
        'Jerking the torso upward rapidly using momentum.',
        'Cranking the head back and straining the neck.',
      ];
      mistakesAr = [
        'المبالغة في رفع الظهر وتقويسه أكثر من الاستقامة الطبيعية.',
        'الاندفاع السريع للأعلى باستخدام الزخم.',
        'رفع الرأس للخلف بشدة مما يجهد عضلات الرقبة.',
      ];
      break;

    case 'loaded_carry':
      instructionsAr = [
        `ارفع ${eqNounAr} بثبات مع استقامة الظهر وسحب الكتفين للخلف وللأسفل وشدّ البطن.`,
        `امشِ بخطوات قصيرة ومنتظمة مع الحفاظ على ثبات الجذع وتفعيل ${muscleAr}.`,
        'تجنّب ميلان الجسم لأي جانب وضع الوزن على الأرض بتحكم عند الانتهاء.',
      ];
      fallbackEn = [
        'Lift the load with a flat back, shoulders packed down, and core tightly braced.',
        'Walk with crisp, steady steps while keeping torso upright and hips level.',
        'Set the load down safely with a controlled hip hinge when finished.',
      ];
      mistakesEn = [
        'Leaning sideways or letting the shoulders slump forward under load.',
        'Taking overly long, rushed steps that cause the weight to swing.',
        'Rounding the lower back when picking up or setting down the weights.',
      ];
      mistakesAr = [
        'ميلان الجذع للجانب أو سقوط الكتفين للأمام تحت الوزن.',
        'أخذ خطوات واسعة وسريعة تؤدي لتأرجح الوزن.',
        'تقوّس أسفل الظهر عند التقاط الوزن أو وضعه على الأرض.',
      ];
      break;

    case 'sled_push':
      instructionsAr = [
        'أمسك مقابض الزلاجة بإحكام ومل بجسمك للأمام بزاوية رياضية مع شدّ البطن واستقامة الظهر.',
        `ادفع الأرض بقوة عبر مقدمة القدمين بخطوات قوية ومتتابعة لتفعيل ${muscleAr}.`,
        'حافظ على ثبات الذراعين واستقامة الرأس طوال مسافة الدفع.',
      ];
      fallbackEn = [
        'Grip the sled handles firmly, lean into a 45-degree drive angle, and brace your core.',
        'Drive forward with powerful, rhythmic strides through the balls of your feet.',
        'Keep spine neutral and arms steady throughout the full push distance.',
      ];
      mistakesEn = [
        'Rounding the lower back or dropping the hips too low.',
        'Taking short choppy steps without full leg drive.',
        'Looking straight up and straining the neck.',
      ];
      mistakesAr = [
        'تقوّس أسفل الظهر أو هبوط الورك أكثر من اللازم.',
        'أخذ خطوات قصيرة ضعيفة دون دفع كامل بالساقين.',
        'رفع الرأس للأعلى بشدة أثناء الدفع.',
      ];
      break;

    case 'plyo_lower':
      instructionsAr = [
        'قف بوقفة رياضية متزنة مع شدّ الجذع وتوجيه الركبتين باتجاه أصابع القدمين.',
        `انزل بمرونة ثم ادفع الأرض بانفجارية للأعلى أو للجانب مع إشراك ${muscleAr}.`,
        'اهبط بنعومة على مقدمة القدمين مع امتصاص الصدمة بثني الركبتين والورك قبل التكرار التالي.',
      ];
      fallbackEn = [
        'Set an athletic stance with core braced and knees aligned over toes.',
        'Dip briefly and explode upward or laterally with full hip and leg drive.',
        'Land softly with bent knees and hips to absorb impact quietly.',
      ];
      mistakesEn = [
        'Landing heavily with stiff knees or letting knees collapse inward.',
        'Rushing into the next jump before stabilizing the landing.',
        'Rounding the back during takeoff or landing.',
      ];
      mistakesAr = [
        'الهبوط القاسي بركبتين مستقيمتين أو انهيارهما للداخل.',
        'التسرع للقفزة التالية قبل استعادة التوازن.',
        'تقوّس الظهر أثناء الانطلاق أو امتصاص الهبوط.',
      ];
      break;

    case 'plyo_full_body':
      instructionsAr = [
        `ابدأ بوقفة رياضية متزنة ${eqAr} مع شدّ الجذع وتنظيم التنفس.`,
        'نفّذ الحركة بانفجارية وسلاسة مع الحفاظ على استقامة الظهر عند كل انتقال.',
        'اهبط بنعومة وتحكم ثم واصل التكرارات بإيقاع ثابت دون التضحية بجودة الأداء.',
      ];
      fallbackEn = [
        'Begin in a braced athletic stance with eyes forward.',
        'Execute each phase smoothly and explosively while keeping your core tight.',
        'Land softly with control and maintain consistent rhythm throughout the set.',
      ];
      mistakesEn = [
        'Letting the lower back sag during plank or ground transitions.',
        'Landing hard on flat feet instead of absorbing impact softly.',
        'Sacrificing posture for speed once fatigue sets in.',
      ];
      mistakesAr = [
        'هبوط أسفل الظهر وتقوّسه أثناء الانتقال للوضع الأرضي.',
        'الهبوط القاسي على كامل القدم دون امتصاص الصدمة.',
        'التفريط في استقامة القوام لصالح السرعة عند التعب.',
      ];
      break;

    case 'cardio_run_walk':
      instructionsAr = [
        'ابدأ بوقفة مستقيمة مع إرخاء الكتفين وثني المرفقين بزاوية مريحة قريبة من 90 درجة.',
        'حافظ على خطوات إيقاعية متزنة مع هبوط سلس تحت مركز ثقل الجسم وتنفس منتظم.',
        'اضبط السرعة والشدة بما يتناسب مع هدف الجلسة مع تهدئة تدريجية في النهاية.',
      ];
      fallbackEn = [
        'Maintain a tall posture with relaxed shoulders and elbows bent comfortably.',
        'Move with a smooth, rhythmic cadence, landing softly beneath your center of mass.',
        'Regulate breathing and pace consistently across the prescribed duration.',
      ];
      mistakesEn = [
        'Overstriding with heavy heel strikes far ahead of the hips.',
        'Slouching the shoulders forward or tensing the neck and hands.',
        'Starting too fast and failing to pace the full session.',
      ];
      mistakesAr = [
        'إطالة الخطوة للأمام مع هبوط قاسٍ على الكعبين.',
        'تحدّب الكتفين للأمام أو شدّ الرقبة واليدين أثناء الحركة.',
        'البدء بسرعة مفرطة تفقدك القدرة على إكمال الجلسة بوتيرة ثابتة.',
      ];
      break;

    case 'cardio_bike':
      instructionsAr = [
        'اضبط ارتفاع المقعد بحيث تبقى الركبة مثنية قليلاً في أدنى نقطة من الدوّاسة مع استقامة الظهر.',
        'ابدأ بالتبديل بإيقاع سلس وثابت مع إبقاء الكتفين مسترخيين وتوزيع الدفع بالتساوي.',
        'تحكم بالمقاومة والسرعة حسب الشدة المطلوبة مع تنفس عميق ومنتظم.',
      ];
      fallbackEn = [
        'Adjust seat height so your knee retains a slight bend at the bottom of the pedal stroke.',
        'Pedal with a smooth, circular cadence while keeping shoulders relaxed and core engaged.',
        'Match resistance and pace to your target intensity with steady breathing.',
      ];
      mistakesEn = [
        'Setting the seat too low or too high, causing knee or hip discomfort.',
        'Hunching the upper back and gripping the handlebars too tightly.',
        'Rocking the hips side to side against excessive resistance.',
      ];
      mistakesAr = [
        'ضبط المقعد منخفضاً أو مرتفعاً أكثر من اللازم مما يجهد الركبتين.',
        'تحدّب أعلى الظهر والشدّ المفرط على المقود.',
        'تأرجح الحوض يميناً ويساراً بسبب مقاومة زائدة.',
      ];
      break;

    case 'cardio_erg':
      instructionsAr = [
        'اثبت بوضعية مريحة مع استقامة الظهر والإمساك بالمقبض بقبضة محكمة وغير متشنجة.',
        'ابدأ الدفع أو السحب بتنسيق متسلسل بين الساقين والجذع والذراعين بإيقاع منظم.',
        'عد بسلاسة لوضع البداية مع الحفاظ على تنفس إيقاعي ثابت طوال الجلسة.',
      ];
      fallbackEn = [
        'Set a tall posture with neutral spine and a relaxed, firm grip on the handles.',
        'Coordinate leg drive, core brace, and arm pull in a smooth, continuous sequence.',
        'Recover with control between strokes while keeping steady breathing.',
      ];
      mistakesEn = [
        'Rounding the lower back during the catch or drive phase.',
        'Pulling primarily with the arms instead of driving through the legs and core.',
        'Rushing the recovery phase and losing stroke rhythm.',
      ];
      mistakesAr = [
        'تقوّس أسفل الظهر أثناء بداية السحب أو الدفع.',
        'الاعتماد على الذراعين فقط وإهمال قوة الساقين والجذع.',
        'التسرع في مرحلة العودة مما يفسد إيقاع التمرين.',
      ];
      break;

    case 'cardio_jump_rope':
      instructionsAr = [
        'أمسك مقابض الحبل بمحاذاة الورك مع إبقاء المرفقين قريبين من الجذع والظهر مستقيماً.',
        'أدر الحبل بحركة سريعة من المعصمين واقفز قفزات خفيفة ومنخفضة على مقدمة القدمين.',
        'حافظ على تنفس منتظم وهبوط ناعم لامتصاص الصدمة.',
      ];
      fallbackEn = [
        'Hold the handles near hip level with elbows tucked close to your sides.',
        'Turn the rope from your wrists and take small, light hops on the balls of your feet.',
        'Land softly with knees slightly flexed and keep a steady breathing rhythm.',
      ];
      mistakesEn = [
        'Jumping too high or kicking heels wildly backward.',
        'Swinging the entire arms wide instead of rotating from the wrists.',
        'Landing flat-footed with stiff knees.',
      ];
      mistakesAr = [
        'القفز بارتفاع مبالغ فيه مما يستنزف الطاقة بسرعة.',
        'تدوير الذراعين بالكامل بدلاً من استخدام المعصمين.',
        'الهبوط على كامل القدم بركبتين متصلبتين.',
      ];
      break;

    case 'cardio_climb_elliptical':
      instructionsAr = [
        'قف باستقامة على الجهاز مع وضع القدمين بالكامل على الدواسات وإمساك المقابض بخفة للتوازن.',
        'حافظ على خطوات منتظمة ومتواصلة مع شدّ خفيف في الجذع دون الاتكاء بوزنك على المقابض.',
        'نظّم تنفسك واضبط السرعة والمقاومة حسب مستوى لياقتك.',
      ];
      fallbackEn = [
        'Stand tall with feet fully planted on the pedals and use the rails lightly for balance.',
        'Maintain a smooth, continuous stride while engaging your core and glutes.',
        'Adjust pace and resistance steadily while breathing rhythmically.',
      ];
      mistakesEn = [
        'Leaning heavily on the handrails and slouching the upper body.',
        'Stepping only on the toes instead of driving through the whole foot.',
      ];
      mistakesAr = [
        'الاتكاء الثقيل على المقابض وتحدّب أعلى الظهر.',
        'الضغط بأطراف الأصابع فقط بدلاً من استخدام كامل القدم.',
      ];
      break;

    case 'cardio_upper_hiit':
      instructionsAr = [
        'اتخذ وقفة رياضية ثابتة مع ثني خفيف في الركبتين وشدّ عضلات الجذع.',
        'نفّذ الضربات أو التموجات بإيقاع قوي ومتواصل مع تدوير متزن من الورك والكتفين.',
        'حافظ على الزفير المنتظم مع كل حركة وحماية المعصمين والكتفين.',
      ];
      fallbackEn = [
        'Stand in a balanced athletic stance with knees soft and core braced.',
        'Drive crisp, rhythmic reps using hips, core, and shoulders together.',
        'Exhale sharply with effort and keep wrists aligned throughout.',
      ];
      mistakesEn = [
        'Dropping your guard or letting wrists bend awkwardly on impact.',
        'Holding your breath and tensing the shoulders.',
        'Rounding the lower back as fatigue increases.',
      ];
      mistakesAr = [
        'انثناء المعصمين بشكل خاطئ أو فقدان ثبات الوقفة.',
        'حبس النفس وشدّ الكتفين للأعلى أثناء الأداء.',
        'تقوّس أسفل الظهر مع زيادة الإرهاق.',
      ];
      break;

    case 'swimming':
      instructionsAr = [
        'حافظ على وضع جسم أفقي انسيابي في الماء مع إبقاء الرأس على استقامة العمود الفقري.',
        'نسّق بين ضربات الساقين وحركة الذراعين وتدوير الجذع بسلاسة وتوازن.',
        'نفّذ الزفير تدريجياً تحت الماء وخذ الشهيق بهدوء عند التدوير دون رفع الرأس عالياً.',
      ];
      fallbackEn = [
        'Maintain a long, streamlined horizontal body position with neutral head alignment.',
        'Coordinate steady flutter kicks, smooth body roll, and rhythmic arm strokes.',
        'Exhale continuously underwater and breathe smoothly to the side without lifting your head.',
      ];
      mistakesEn = [
        'Lifting the head high to breathe, causing the hips and legs to sink.',
        'Holding your breath underwater instead of exhaling steadily.',
        'Kicking from the knees instead of initiating fluid kicks from the hips.',
      ];
      mistakesAr = [
        'رفع الرأس عالياً للتنفس مما يؤدي لهبوط الحوض والساقين.',
        'حبس النفس تحت الماء بدلاً من إخراج الزفير بسلاسة.',
        'الركل من الركبتين فقط بدلاً من تحريك الساقين من الورك.',
      ];
      break;

    case 'smr_foam_roll':
      instructionsAr = [
        `ضع الأداة أسفل ${muscleAr} مع إسناد وزن جسمك باليدين أو الساق الحرة للتحكم بالضغط.`,
        'تدحرج ببطء شديد على طول العضلة مع التوقف لثوانٍ على نقاط الشد العضلي.',
        'تنفّس بعمق لمساعدة العضلة على الاسترخاء وتجنب الضغط المباشر على المفاصل أو العظام.',
      ];
      fallbackEn = [
        'Position the roller or ball under the target muscle and control pressure with your limbs.',
        'Roll slowly along the muscle belly, pausing gently on tight spots for 15–30 seconds.',
        'Breathe deeply to relax the tissue and avoid rolling directly over joints or bone.',
      ];
      mistakesEn = [
        'Rolling too quickly instead of applying slow, steady pressure.',
        'Rolling directly over joints, ligaments, or the lower spine.',
        'Tensing up and holding your breath over tender spots.',
      ];
      mistakesAr = [
        'التدحرج بسرعة كبيرة بدلاً من الضغط البطيء الهادئ.',
        'الضغط المباشر فوق المفاصل أو العظام أو أسفل العمود الفقري.',
        'شدّ الجسم وحبس النفس عند الشعور بنقطة توتر.',
      ];
      break;

    case 'breathing_relax':
      instructionsAr = [
        'اجلس أو استلقِ بوضعية مريحة مع إرخاء الكتفين والفكين واستقامة الظهر بلطف.',
        'استنشق ببطء وعمق عبر الأنف مع السماح للبطن بالاتساع دون رفع الصدر بشدة.',
        'أخرج الزفير ببطء وهدوء وكرر الإيقاع لعدة دقائق لتهدئة الجهاز العصبي.',
      ];
      fallbackEn = [
        'Adopt a comfortable seated or supine posture with relaxed shoulders and neutral spine.',
        'Inhale slowly through your nose, letting the belly and lower ribs expand smoothly.',
        'Exhale longer and softly to release tension and calm your nervous system.',
      ];
      mistakesEn = [
        'Taking shallow, rapid breaths only into the upper chest.',
        'Tensing the neck, jaw, or shoulders while trying to breathe deeply.',
      ];
      mistakesAr = [
        'التنفس السطحي السريع من أعلى الصدر فقط.',
        'شدّ الكتفين أو الرقبة بدلاً من الاسترخاء التام.',
      ];
      break;

    case 'stretch_neck':
      instructionsAr = [
        'اجلس أو قف باستقامة مع خفض الكتفين للأسفل وإرخاء العضلات العلوية.',
        'أمل الرأس أو وجّهه بلطف في الاتجاه المطلوب حتى تشعر بإطالة خفيفة ومريحة دون ألم.',
        'اثبت على الإطالة مع تنفس هادئ لمدة 20 إلى 30 ثانية ثم عد ببطء للمنتصف.',
      ];
      fallbackEn = [
        'Sit or stand tall with both shoulders relaxed and depressed away from your ears.',
        'Gently tilt or turn your head until you feel a mild, comfortable stretch.',
        'Hold steadily with calm breathing for 20–30 seconds, then return slowly.',
      ];
      mistakesEn = [
        'Pulling aggressively on the head with the hand.',
        'Shrugging the opposite shoulder upward during the stretch.',
      ];
      mistakesAr = [
        'سحب الرأس بقوة زائدة باليد مما يجهد فقرات الرقبة.',
        'رفع الكتف المقابل للأعلى مما يقلل فاعلية الإطالة.',
      ];
      break;

    case 'stretch_upper':
      instructionsAr = [
        `اتخذ وضعية الإطالة${setupAr} باستقامة الظهر وإرخاء الكتفين والرقبة.`,
        `تحرّك ببطء داخل الإطالة حتى تشعر بشدّ لطيف ومريح في ${muscleAr} دون ألم حاد.`,
        'اثبت لمدة 20 إلى 30 ثانية مع تنفس عميق وهادئ ثم عد ببطء.',
      ];
      fallbackEn = [
        'Align your posture cleanly with core lightly engaged and shoulders relaxed.',
        'Ease slowly into the stretch until you feel gentle, pain-free tension.',
        'Hold for 20–30 seconds with slow deep breaths before releasing gently.',
      ];
      mistakesEn = [
        'Forcing the joint past comfort or bouncing into the stretch.',
        'Arching the lower back to fake greater shoulder mobility.',
      ];
      mistakesAr = [
        'إجبار المفصل على مدى مؤلم أو النبض العنيف أثناء الإطالة.',
        'تقويس أسفل الظهر لتعويض محدودية مرونة الكتف.',
      ];
      break;

    case 'stretch_lower_core':
      instructionsAr = [
        `اتخذ وضعية الإطالة${setupAr} مع الحفاظ على استقامة العمود الفقري وتوازن الحوض.`,
        `تعمّق في الإطالة تدريجياً حتى تشعر بتمدد مريح في ${muscleAr} دون شدّ مؤلم.`,
        'اثبت لمدة 20 إلى 30 ثانية مع تنفس بطيء وعميق ثم اخرج من الوضعية بسلاسة.',
      ];
      fallbackEn = [
        'Enter the stretch position with a tall spine and square hips.',
        'Ease smoothly into gentle, comfortable tension without forcing the joint.',
        'Hold for 20–30 seconds while breathing deeply, then release slowly.',
      ];
      mistakesEn = [
        'Rounding the lower back forcefully to reach further.',
        'Bouncing aggressively or holding your breath during the stretch.',
      ];
      mistakesAr = [
        'تقويس أسفل الظهر بقوة في محاولة الوصول لمدى أبعد.',
        'النبض السريع العنيف أو حبس النفس أثناء الإطالة.',
      ];
      break;

    case 'mobility_neck':
      instructionsAr = [
        'قف أو اجلس باستقامة مع تثبيت الكتفين للأسفل وإبقاء الجذع ساكناً.',
        'حرّك الرقبة ببطء وسلاسة ضمن مدى مريح وخالٍ من الألم.',
        'تنفّس بهدوء وأكمل التكرارات بتحكم كامل دون أي حركة مفاجئة.',
      ];
      fallbackEn = [
        'Sit or stand tall with shoulders relaxed and still.',
        'Move your head smoothly through a slow, pain-free range of motion.',
        'Keep breathing calmly and avoid any sudden or jerky movements.',
      ];
      mistakesEn = [
        'Moving too quickly or forcing the neck through pain or clicking.',
        'Shrugging the shoulders instead of isolating cervical motion.',
      ];
      mistakesAr = [
        'التحرك بسرعة أو إجبار الرقبة على مدى يسبب ألماً.',
        'تحريك الكتفين مع الرأس بدلاً من عزل حركة العنق.',
      ];
      break;

    case 'mobility_shoulder':
      instructionsAr = [
        `قف أو استلقِ باستقامة ${eqAr}${setupAr} مع شدّ خفيف في البطن لمنع تقوّس الظهر.`,
        'حرّك الذراعين ولوحي الكتف بسلاسة وبطء عبر كامل المدى المريح للمفصل.',
        'حافظ على خفض الكتفين بعيداً عن الأذنين وتنفّس بانتظام طوال التمرين.',
      ];
      fallbackEn = [
        'Maintain a neutral spine with ribs down and core lightly braced.',
        'Guide the arms smoothly through your full, pain-free shoulder range.',
        'Keep movements controlled without shrugging or arching the lower back.',
      ];
      mistakesEn = [
        'Arching the lower back to compensate for tight shoulders.',
        'Rushing the motion with momentum instead of controlled joint articulation.',
      ];
      mistakesAr = [
        'تقوّس أسفل الظهر لتعويض تيبّس مفصل الكتف.',
        'التسرع في الحركة بدلاً من التحكم المفصلي البطيء.',
      ];
      break;

    case 'mobility_spine':
      instructionsAr = [
        `اتخذ وضعية البدء${setupAr} مع تثبيت الحوض أو الأطراف السفلية والتركيز على مرونة العمود الفقري.`,
        'حرّك الظهر والصدر ببطء وتدرّج مع تنسيق التنفس بين الشهيق والزفير.',
        'توقف لحظة في نهاية كل مدى مريح ثم عد بسلاسة دون إجهاد أسفل الظهر.',
      ];
      fallbackEn = [
        'Stabilize your base and focus movement through the targeted spinal segments.',
        'Move slowly and deliberately while coordinating each rep with deep breaths.',
        'Pause briefly at end range without forcing painful pressure.',
      ];
      mistakesEn = [
        'Moving too fast without controlling each segment of the spine.',
        'Letting the hips shift or twist away during thoracic rotation.',
      ];
      mistakesAr = [
        'التحرك بسرعة دون تحكم تدريجي بفقرات الظهر.',
        'تحرك الحوض مع الصدر مما يقلل فاعلية مرونة العمود الصدري.',
      ];
      break;

    case 'mobility_ankle_wrist':
      instructionsAr = [
        `ثبّت وضع المفصل ${eqAr}${setupAr} وحافظ على استقرار باقي الطرف.`,
        'حرّك المفصل ببطء عبر كامل مداه الدائري أو الأمامي المريح دون ألم.',
        'توقف ثانية عند نهاية المدى لتحسين المرونة ثم عد بسلاسة.',
      ];
      fallbackEn = [
        'Stabilize the surrounding limb so motion comes purely from the target joint.',
        'Move slowly through a full, comfortable range of motion.',
        'Pause briefly at end range without forcing sharp pain.',
      ];
      mistakesEn = [
        'Lifting the heel during ankle rocks or rushing through joint circles.',
        'Forcing end range aggressively instead of gradual controlled reps.',
      ];
      mistakesAr = [
        'رفع الكعب عن الأرض في تمارين الكاحل أو التسرع في التدوير.',
        'الضغط المفاجئ على المفصل بدلاً من التدرّج الهادئ.',
      ];
      break;

    case 'mobility_hip_lower':
      instructionsAr = [
        `اتخذ وضعية متزنة${setupAr} مع شدّ خفيف في الجذع واستقامة الظهر.`,
        'حرّك الورك والساق بسلاسة عبر مدى حركي واسع ومريح لتحسين مرونة المفصل.',
        'تجنّب الحركات الخاطفة وحافظ على توازن الجذع طوال التكرارات.',
      ];
      fallbackEn = [
        'Set a balanced posture with core lightly braced and spine tall.',
        'Move smoothly through a comfortable hip range without jerking.',
        'Maintain trunk stability and control each repetition evenly.',
      ];
      mistakesEn = [
        'Swinging the leg wildly and arching the lower back.',
        'Rushing repetitions without feeling controlled hip motion.',
      ];
      mistakesAr = [
        'أرجحة الساق بعنف مما يسبب تقوّس أسفل الظهر.',
        'التسرع في الأداء دون تحكم حقيقي في مفصل الورك.',
      ];
      break;

    default:
      instructionsAr = [
        `اتخذ وضعية بدء ثابتة ${eqAr}${setupAr} مع استقامة الظهر وشدّ عضلات الجذع.`,
        `نفّذ الحركة ببطء وتحكم كامل مع التركيز على تفعيل ${muscleAr}.`,
        'عد بسلاسة إلى نقطة البداية مع الحفاظ على التنفس المنتظم وثبات القوام.',
      ];
      fallbackEn = [
        'Adopt a stable starting posture with neutral spine and core braced.',
        'Perform the movement smoothly under full muscular control.',
        'Return steadily to the starting position while breathing consistently.',
      ];
      mistakesEn = [
        'Using excessive momentum instead of controlled muscular effort.',
        'Losing neutral spine alignment or holding your breath during reps.',
      ];
      mistakesAr = [
        'الاعتماد على الزخم السريع بدلاً من التحكم العضلي.',
        'فقدان استقامة الظهر أو حبس النفس أثناء الأداء.',
      ];
      break;
  }

  if (latStepAr && instructionsAr.length < 4) {
    instructionsAr.push(latStepAr);
  }

  // Add a unilateral-specific common mistake if unilateral and list has 2 items
  if (isUnilateral && mistakesEn.length < 3) {
    mistakesEn.push('Leaning the torso or compensating with the non-working side.');
    mistakesAr.push('إمالة الجذع أو تعويض الحركة باستخدام الجانب الآخر.');
  }

  return {
    instructionsAr,
    fallbackEn,
    commonMistakesEn: mistakesEn.slice(0, 3),
    commonMistakesAr: mistakesAr.slice(0, 3),
  };
}

async function main() {
  const raw = await readFile(SOURCE_PATH, 'utf8');
  const catalog = JSON.parse(raw);

  // 1. Build muscles map (69 muscles)
  const trMap = new Map((catalog.muscleTranslations || []).map(t => [t.muscle_id, t.name]));
  const muscles = {};
  const missingMuscles = [];
  for (const m of catalog.muscles) {
    const nameEn = trMap.get(m.id) || m.id.replace(/_/g, ' ');
    const nameAr = MUSCLES_AR[m.id];
    if (!nameAr) missingMuscles.push(m.id);
    muscles[m.id] = { nameEn, nameAr: nameAr || '' };
  }
  if (missingMuscles.length > 0) {
    throw new Error(`Missing Arabic muscle translations for: ${missingMuscles.join(', ')}`);
  }

  // 2. Build exercises map (868 exercises)
  const exercises = {};
  const missingNames = [];
  for (const e of catalog.exercises) {
    const nameAr = EXACT_EXERCISE_NAMES_AR[e.name];
    if (!nameAr) {
      missingNames.push(`${e.id}: ${e.name}`);
      continue;
    }
    const guidance = buildGuidance(e);
    const instructionsEn = parseInstructionsEn(e, guidance.fallbackEn);

    exercises[e.id] = {
      nameAr,
      instructionsEn,
      instructionsAr: guidance.instructionsAr,
      commonMistakesEn: guidance.commonMistakesEn,
      commonMistakesAr: guidance.commonMistakesAr,
      mediaUrl: null,
      thumbnailUrl: null,
    };
  }

  if (missingNames.length > 0) {
    throw new Error(`Missing Arabic exercise names (${missingNames.length}):\n${missingNames.slice(0, 20).join('\n')}`);
  }

  const output = {
    version: VERSION,
    muscles,
    exercises,
  };

  // Minified JSON to stay compact for Cloudflare Worker bundle (< 1.2 MB)
  const serialized = JSON.stringify(output);
  await writeFile(OUTPUT_PATH, serialized, 'utf8');

  const bytes = Buffer.byteLength(serialized, 'utf8');
  console.log(`Generated ${OUTPUT_PATH}`);
  console.log(`Muscles: ${Object.keys(muscles).length} / ${catalog.muscles.length}`);
  console.log(`Exercises: ${Object.keys(exercises).length} / ${catalog.exercises.length}`);
  console.log(`Size: ${(bytes / 1024).toFixed(1)} KB (${(bytes / (1024 * 1024)).toFixed(3)} MB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
