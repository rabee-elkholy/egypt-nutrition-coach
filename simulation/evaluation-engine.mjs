// Independent Evaluation Engine: Evaluates the system outputs independently of internal engine assertions.
// Audits:
// 1. Safety Gates (Zero tolerance: medical contraindications, injury violations, caloric floor, ground-truth leaks)
// 2. Nutrition Diversity & Appropriateness
// 3. Workout Volume, Balance & Progressive Overload
// 4. Adaptation Timing (Appropriate vs Missed vs Unwarranted interventions)
// 5. Personal Brief & Coaching Message Veracity & Repetition
// 6. Stability, Monotonicity & Latency Distributions

import { dateOffset } from '../coaching-shared.mjs';

export function evaluateUserSimulation(simulationResult) {
  const {
    user,
    nutritionPlans,
    workoutPlans,
    dailyBehavior,
    dailyAppState,
    foodDiary,
    workoutHistory,
    healthTracking,
    messages,
    adaptations,
    apiEvents,
    errors
  } = simulationResult;

  const safetyViolations = [];
  const findings = [];

  // --- 1. SAFETY GATES AUDIT ---

  // A. Medical & Dietary Safety
  const isVegan = user.dietType === 'vegan';
  const isVegetarian = user.dietType === 'vegetarian';
  const hasFavism = user.diseases.includes('favism');
  const hasLactose = user.diseases.includes('lactose_intolerance');
  const hasGout = user.diseases.includes('gout');
  const hasHypertension = user.diseases.includes('hypertension') || user.dietType === 'dash';

  for (const np of nutritionPlans) {
    for (const day of np.plan?.days || []) {
      for (const meal of day.meals || []) {
        const ingredients = meal.snapshot?.ingredients || [];
        for (const ing of ingredients) {
          const key = ing.key || '';
          if (hasFavism && key.includes('fava')) {
            safetyViolations.push({
              gate: 'medical_safety',
              severity: 'critical',
              rule: 'FAVISM_CONTRAINDICATION',
              details: `وجبة تحتوي فول مدمس لمستخدم مصاب بأنيميا الفول: ${key} في خطة ${np.plan.id}`
            });
          }
          if (hasLactose && ['milk', 'yogurt', 'cheese', 'cottage', 'feta'].includes(key)) {
            safetyViolations.push({
              gate: 'medical_safety',
              severity: 'critical',
              rule: 'LACTOSE_CONTRAINDICATION',
              details: `مشتق ألبان لمستخدم يعاني عدم تحمل اللاكتوز: ${key} في خطة ${np.plan.id}`
            });
          }
          if (isVegan && ['chicken', 'beef', 'fish', 'meat', 'egg', 'eggwhite', 'milk', 'cheese', 'yogurt'].includes(key)) {
            safetyViolations.push({
              gate: 'dietary_safety',
              severity: 'critical',
              rule: 'VEGAN_VIOLATION',
              details: `مكون حيواني في خطة نباتي صرف: ${key} في خطة ${np.plan.id}`
            });
          }
          if (isVegetarian && ['chicken', 'beef', 'fish', 'meat'].includes(key)) {
            safetyViolations.push({
              gate: 'dietary_safety',
              severity: 'critical',
              rule: 'VEGETARIAN_VIOLATION',
              details: `لحوم أو دواجن أو أسماك في خطة نباتي: ${key} في خطة ${np.plan.id}`
            });
          }
        }
      }
    }
  }

  // B. Caloric Floor Safety (1200 kcal female, 1400 kcal male)
  const minFloor = user.sex === 'female' ? 1200 : 1400;
  for (const np of nutritionPlans) {
    const energy = np.plan?.targets?.energy;
    if (energy && energy < minFloor) {
      safetyViolations.push({
        gate: 'caloric_floor',
        severity: 'critical',
        rule: 'SUB_FLOOR_CALORIES',
        details: `سعرات الخطة (${energy}) أقل من الحد الأدنى الفسيولوجي الآمن (${minFloor})`
      });
    }
  }

  // C. Injury Contraindication Safety
  const PROHIBITED_BY_INJURY = {
    lower_back_pain: [/deadlift/i, /back squat/i, /good morning/i],
    knee_pain: [/lunge/i, /pistol/i, /jump/i, /sissy/i],
    shoulder_pain: [/overhead/i, /upright row/i, /behind.*neck/i],
    wrist_pain: [/barbell curl/i, /handstand/i],
    neck_pain: [/shrug/i, /neck/i]
  };

  for (const inj of user.injuries) {
    const patterns = PROHIBITED_BY_INJURY[inj] || [];
    for (const wp of workoutPlans) {
      for (const day of wp.workoutPlan?.days || []) {
        for (const ex of day.exercises || []) {
          for (const pat of patterns) {
            if (pat.test(ex.name)) {
              safetyViolations.push({
                gate: 'injury_safety',
                severity: 'critical',
                rule: 'CONTRAINDICATED_EXERCISE_PRESCRIBED',
                details: `تمرين محظور (${ex.name}) وُصف لمستخدم يعاني من إصابة ${inj}`
              });
            }
          }
        }
      }
    }
  }

  // D. Ground Truth Leakage Check
  for (const msg of messages) {
    const text = msg.exactText || '';
    const gt = dailyBehavior.find(b => b.date === msg.date);
    const dayHealth = healthTracking.filter(h => h.date === msg.date);
    const hasLoggedSleep = dayHealth.some(h => h.type === 'recovery' && h.data?.sleepHours != null);

    if (!hasLoggedSleep && gt) {
      if (text.includes(`نومك ${gt.actualSleep}`) || text.includes(`${gt.actualSleep} ساعات`)) {
        safetyViolations.push({
          gate: 'ground_truth_isolation',
          severity: 'critical',
          rule: 'GROUND_TRUTH_LEAKAGE',
          details: `النظام ذكر ساعات النوم (${gt.actualSleep}) رغم أن المستخدم لم يسجلها اليوم!`
        });
      }
    }
  }

  // E. Revision Monotonicity on Successful Mutations
  let lastRev = 0;
  for (const ev of apiEvents) {
    if (ev.status === 'success' && ev.action !== 'generate') {
      if (ev.revision <= lastRev) {
        safetyViolations.push({
          gate: 'revision_integrity',
          severity: 'high',
          rule: 'NON_MONOTONIC_REVISION',
          details: `تراجع أو ثبات في رقم المراجعة الناجحة: من ${lastRev} إلى ${ev.revision} في عملية ${ev.action}`
        });
      }
      lastRev = Math.max(lastRev, ev.revision);
    }
  }

  // --- 2. NUTRITION EVALUATION ---
  const hasNutrition = user.serviceTrack !== 'workouts_only';
  const initialEnergy = nutritionPlans[0]?.plan?.targets?.energy || null;
  const initialProtein = nutritionPlans[0]?.plan?.targets?.protein || null;
  const targetProteinMin = Math.round(user.weight * 1.2);
  const proteinAdequate = !hasNutrition || (!initialProtein || initialProtein >= targetProteinMin);

  const mealNames = new Set();
  let totalMealsCount = 0;
  for (const np of nutritionPlans) {
    for (const d of np.plan?.days || []) {
      for (const m of d.meals || []) {
        totalMealsCount++;
        mealNames.add(m.snapshot?.name || m.slot);
      }
    }
  }
  const mealDiversityRatio = totalMealsCount > 0 ? Math.round((mealNames.size / totalMealsCount) * 100) / 100 : (hasNutrition ? 0 : 1);

  const planRenewalGaps = [];
  for (let i = 1; i < nutritionPlans.length; i++) {
    const prevEnd = nutritionPlans[i - 1].plan?.days?.at(-1)?.date;
    const nextStart = nutritionPlans[i].plan?.effective_from || nutritionPlans[i].plan?.days?.[0]?.date;
    if (prevEnd && nextStart && nextStart > dateOffset(prevEnd, 1)) {
      planRenewalGaps.push({ from: prevEnd, to: nextStart });
    }
  }

  // --- 3. WORKOUT EVALUATION ---
  const hasWorkouts = user.serviceTrack !== 'nutrition_only';
  let progressionCount = 0;
  let deloadCount = 0;
  for (const log of workoutHistory) {
    const sets = log.sets?.sets || [];
    if (sets.some(s => s.pain)) deloadCount++;
  }

  const weeklySets = workoutPlans[0]?.workoutPlan?.weeklySets || {};
  const excessiveVolumeMuscles = Object.entries(weeklySets).filter(([, sets]) => sets > 26).map(([r]) => r);
  const insufficientVolumeMuscles = Object.entries(weeklySets).filter(([, sets]) => sets < 6).map(([r]) => r);

  // --- 4. ADAPTATIONS & INTERVENTIONS ---
  const calorieProposals = adaptations.filter(a => a.kind === 'calories');
  const recoveryProposals = adaptations.filter(a => a.kind === 'recovery');
  const volumeProposals = adaptations.filter(a => a.kind === 'weekly_volume');

  let missedPlateauInterventions = 0;
  if (hasNutrition) {
    for (let d = 21; d <= 90; d += 7) {
      const windowStart = d - 13;
      const windowWeights = healthTracking.filter(h => h.type === 'weight' && h.day >= windowStart && h.day <= d);
      const windowFoods = dailyAppState.filter(a => a.day >= windowStart && a.day <= d && a.foodComplete);
      const hadProposals = adaptations.some(a => a.day >= windowStart && a.day <= d && a.kind === 'calories');

      if (windowWeights.length >= 6 && windowFoods.length >= 10 && !hadProposals) {
        const wFirst = windowWeights.slice(0, 3).reduce((acc, x) => acc + x.data.kg, 0) / 3;
        const wLast = windowWeights.slice(-3).reduce((acc, x) => acc + x.data.kg, 0) / 3;
        const changePct = Math.abs(wLast - wFirst) / wFirst;
        if (changePct < 0.005 && user.goal === 'lose') {
          missedPlateauInterventions++;
        }
      }
    }
  }

  let unwarrantedCalorieProposals = 0;
  for (const a of calorieProposals) {
    const windowStart = a.day - 13;
    const completeDays = dailyAppState.filter(s => s.day >= windowStart && s.day <= a.day && s.foodComplete).length;
    if (completeDays < 10) {
      unwarrantedCalorieProposals++;
      findings.push({
        severity: 'high',
        category: 'adaptation',
        code: 'UNWARRANTED_CALORIE_INTERVENTION',
        details: `اقتراح تعديل سعرات في يوم ${a.day} رغم أن الأيام المكتملة (${completeDays}) أقل من الحد المطلوب (10 أيام).`
      });
    }
  }

  // --- 5. MESSAGES & PERSONALIZATION ---
  const messageTexts = messages.map(m => m.exactText);
  const uniqueMessageTexts = new Set(messageTexts);
  const repetitionRate = messageTexts.length > 0
    ? Math.round((1 - (uniqueMessageTexts.size / messageTexts.length)) * 100) / 100
    : 0;

  let shortSleepDaysWithoutNote = 0;
  for (const h of healthTracking.filter(x => x.type === 'recovery')) {
    if (h.data?.sleepHours && h.data.sleepHours < 7) {
      const dayMsgs = messages.filter(m => m.day === h.day);
      const acknowledged = dayMsgs.some(m => m.key === 'short-sleep' || m.exactText.includes('نوم') || m.exactText.includes('الراحة'));
      if (!acknowledged) shortSleepDaysWithoutNote++;
    }
  }

  // --- 6. LATENCY & STABILITY ---
  const latencies = apiEvents.map(e => e.latencyMs).filter(l => typeof l === 'number' && Number.isFinite(l)).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  // --- 7. QUALITY SCORE CALCULATION (0 - 100) ---
  let safetyScore = safetyViolations.length === 0 ? 30 : 0;
  let nutritionScore = 0;
  if (!hasNutrition) {
    nutritionScore = 20; // N/A, full marks for workouts-only
  } else {
    if (proteinAdequate) nutritionScore += 8;
    if (mealDiversityRatio >= 0.15) nutritionScore += 6;
    if (planRenewalGaps.length === 0) nutritionScore += 6;
  }

  let workoutScore = 0;
  if (!hasWorkouts) {
    workoutScore = 20; // N/A, full marks for nutrition-only
  } else {
    if (excessiveVolumeMuscles.length === 0) workoutScore += 8;
    if (insufficientVolumeMuscles.length === 0) workoutScore += 6;
    if (workoutPlans.length >= 1) workoutScore += 6;
  }

  let adaptationScore = 0;
  if (unwarrantedCalorieProposals === 0) adaptationScore += 8;
  if (missedPlateauInterventions <= 1) adaptationScore += 7;

  let messageScore = 0;
  if (repetitionRate < 0.65) messageScore += 8;
  if (shortSleepDaysWithoutNote <= 2) messageScore += 7;

  const totalScore = safetyScore === 0 ? 0 : (safetyScore + nutritionScore + workoutScore + adaptationScore + messageScore);

  return {
    userId: user.id,
    passedAllGates: safetyViolations.length === 0,
    safetyViolations,
    findings,
    scores: {
      total: totalScore,
      safety: safetyScore,
      nutrition: nutritionScore,
      workout: workoutScore,
      adaptation: adaptationScore,
      message: messageScore
    },
    metrics: {
      initialEnergy,
      initialProtein,
      proteinAdequate,
      totalMealsCount,
      uniqueMealsCount: mealNames.size,
      mealDiversityRatio,
      planRenewalGapsCount: planRenewalGaps.length,
      workoutPlansCount: workoutPlans.length,
      excessiveVolumeMuscles,
      insufficientVolumeMuscles,
      calorieProposalsCount: calorieProposals.length,
      recoveryProposalsCount: recoveryProposals.length,
      volumeProposalsCount: volumeProposals.length,
      unwarrantedCalorieProposals,
      missedPlateauInterventions,
      totalMessagesCount: messages.length,
      uniqueMessagesCount: uniqueMessageTexts.size,
      repetitionRate,
      shortSleepDaysWithoutNote,
      latency: { p50, p95, p99 }
    }
  };
}
