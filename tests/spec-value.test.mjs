import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateNeeds, makeWeek } from '../planner-core.mjs';
import { generateWorkoutWeek, effectiveInjuries, EXERCISE_LIBRARY } from '../workout-engine.mjs';
import { empty, generate, command, today, evaluateEligibility, progressSummary } from '../server/coaching.mjs';
import { library } from '../server/food.mjs';
import { dateOffset } from '../coaching-shared.mjs';
import { healthyCheckin } from './helpers.mjs';

test('SPEC-N08: high_protein diet preserves Adjusted Body Weight (ABW) for BMI>30 and respects gout protein cap', () => {
  const highBmiProfile = {
    weight: 130,
    height: 170,
    age: 35,
    sex: 'male',
    activity: 'light',
    goal: 'lose',
    trainingDays: 3,
    diseases: ['gout']
  };
  const baseNeeds = estimateNeeds(highBmiProfile);
  // Raw weight * 1.6 would be 208g; ABW * 1.4 gout cap must be much lower (~125g)
  assert.ok(baseNeeds.effective_weight < 100);
  assert.equal(baseNeeds.max_protein_factor, 1.4);

  const week = makeWeek(
    highBmiProfile,
    {
      diet: 'high_protein',
      budget: 'medium',
      meals: 4,
      proteins: ['legumes', 'eggs', 'dairy', 'chicken', 'fish'],
      excludedKeys: [],
      excludedFoodIds: [],
      excludedGroups: []
    },
    library,
    '2026-10-23',
    'spec-n08'
  );
  assert.equal(week.targets.protein_factor, 1.4, 'gout protein cap must not be overridden by high_protein');
  assert.equal(week.targets.protein, Math.round(baseNeeds.effective_weight * 1.4 * 10) / 10);
  assert.ok(week.targets.protein < 150, 'ABW must be preserved instead of raw 130kg weight');
});

test('SPEC-N06: estimateNeeds produces a unified target-weight forecast derived from actual resolved energy delta', () => {
  const slow = estimateNeeds({
    weight: 85,
    height: 175,
    age: 30,
    sex: 'male',
    activity: 'moderate',
    goal: 'lose',
    goalPace: 'slow',
    targetWeight: 78,
    trainingDays: 3
  });
  const fast = estimateNeeds({
    weight: 85,
    height: 175,
    age: 30,
    sex: 'male',
    activity: 'moderate',
    goal: 'lose',
    goalPace: 'fast',
    targetWeight: 78,
    trainingDays: 3
  });
  assert.ok(slow.forecast && fast.forecast);
  assert.equal(slow.forecast.target_delta_kg, -7);
  assert.ok(Math.abs(fast.forecast.daily_energy_delta) > Math.abs(slow.forecast.daily_energy_delta));
  assert.ok(fast.forecast.estimated_weeks_max <= slow.forecast.estimated_weeks_max);
});

test('SPEC-T08: 0 workout days returns 0 resistance sessions instead of coercing 0 || 3', () => {
  const zeroPlan = generateWorkoutWeek({ workoutDaysCount: 0, selectedWorkoutDays: [] }, { trainingDays: 0, goal: 'maintain' });
  assert.equal(zeroPlan.workoutDaysCount, 0);
  assert.deepEqual(zeroPlan.selectedWorkoutDays, []);
  assert.ok(zeroPlan.days.every(d => d.isTrainingDay === false));
});

test('SPEC-MATERNAL-SAFETY: pregnancy does not fabricate lower_back_pain or diastasis_recti diagnoses in effectiveInjuries, and badges avoid categorical safety claims', () => {
  const injuries = effectiveInjuries({ injuries: ['none'] }, { maternalStatus: 'pregnant_t2' });
  assert.deepEqual(injuries, []);
  const kneePlan = generateWorkoutWeek({ workoutDaysCount: 3, injuries: ['knee_pain'] }, { goal: 'maintain' });
  for (const d of kneePlan.days.filter(x => x.isTrainingDay)) {
    assert.ok(d.estimatedMinutes <= d.durationMinutes);
    for (const ex of d.exercises) {
      if (ex.injury_safe_badge) {
        assert.ok(ex.injury_safe_badge.startsWith('بديل منخفض التحميل لـ:'));
      }
    }
  }
});

test('SPEC-C01: joint nutrition and training evaluation holds calorie cut when workout performance drops', () => {
  const draft = {
    name: 'JointEval',
    age: 30,
    weight: 80,
    height: 175,
    sex: 'male',
    goal: 'lose',
    serviceTrack: 'nutrition_and_workouts',
    dietType: 'balanced',
    selectedWorkoutDays: [1, 3, 5]
  };
  let s = generate(empty(), draft, 'spec-c01');
  s.nutritionContextStartedOn = dateOffset(today(), -20);
  s.weights = Array.from({ length: 14 }, (_, i) => ({ date: dateOffset(today(), -i), kg: 80 }));
  s.foodLogs = s.weights.map(w => ({ date: w.date, energy: Number(s.plans[0].targets.energy), adherence: 100, complete: true }));
  s.checkins = [healthyCheckin()];

  const ex = s.workoutPlan.days[0].exercises[0];
  s.workoutLogs = [
    {
      id: 'w1',
      exerciseId: ex.id,
      planId: s.workoutPlan.id,
      progressionKey: ex.progressionKey,
      loadMode: ex.loadMode,
      date: dateOffset(today(), -4),
      at: new Date(Date.now() - 4 * 86400000).toISOString(),
      sets: Array.from({ length: ex.sets }, () => ({ kg: 30, reps: 12, rir: 2, pain: false }))
    },
    {
      id: 'w2',
      exerciseId: ex.id,
      planId: s.workoutPlan.id,
      progressionKey: ex.progressionKey,
      loadMode: ex.loadMode,
      date: dateOffset(today(), -1),
      at: new Date(Date.now() - 86400000).toISOString(),
      sets: Array.from({ length: ex.sets }, () => ({ kg: 30, reps: 8, rir: 0, pain: false }))
    }
  ];

  s = command(s, 'review', {});
  assert.equal(s.lastReview.nutrition.action, 'hold');
  assert.match(s.lastReview.nutrition.reason, /انخفاضًا في أداء التمرين/);
  assert.ok(!s.adaptations.some(a => a.status === 'pending' && a.kind === 'calories'));
});

test('SPEC-ELIGIBILITY-AND-PROGRESS: evaluateEligibility and progressSummary return structured contracts', () => {
  const rev = evaluateEligibility({ age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', diseases: ['diabetes'] });
  assert.equal(rev.status, 'requires_review');
  assert.ok(rev.clinicalSummary);

  const needsInput = evaluateEligibility({ age: 30, weight: 80, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'workouts_only' });
  assert.equal(needsInput.status, 'needs_input');
  assert.equal(needsInput.questions[0].field, 'healthConfirmed');

  const ok = evaluateEligibility({ age: 30, weight: 80, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'workouts_only', healthConfirmed: true });
  assert.equal(ok.status, 'eligible');

  const s = generate(empty(), { name: 'Prog', age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced' });
  const summary = progressSummary(s);
  assert.equal(summary.foodCompleteness.requiredDays14d, 10);
  assert.equal(typeof summary.weightTrend.note, 'string');
});

test('SPEC-WELLNESS-BRIDGE: supported wellness conditions and mild joint discomforts generate tailored plans while clinical diabetes still requires review', () => {
  const elig = evaluateEligibility({
    age: 32,
    weight: 85,
    height: 170,
    sex: 'female',
    goal: 'lose',
    serviceTrack: 'nutrition_and_workouts',
    diseases: ['insulin_resistance', 'pcos', 'ibs', 'favism'],
    injuries: ['knee_pain', 'lower_back_pain']
  });
  assert.equal(elig.status, 'eligible');
  assert.deepEqual(elig.supportedAdaptations.diseases, ['insulin_resistance', 'pcos', 'ibs', 'favism']);
  assert.deepEqual(elig.supportedAdaptations.injuries, ['knee_pain', 'lower_back_pain']);

  const state = generate(empty(), {
    name: 'سارة',
    age: 32,
    weight: 85,
    height: 170,
    sex: 'female',
    goal: 'lose',
    serviceTrack: 'nutrition_and_workouts',
    dietType: 'balanced',
    diseases: ['insulin_resistance', 'pcos', 'ibs', 'favism'],
    injuries: ['knee_pain', 'lower_back_pain'],
    selectedWorkoutDays: [1, 3, 5]
  }, 'wellness-bridge');

  assert.deepEqual(state.profile.diseases, ['insulin_resistance', 'pcos', 'ibs', 'favism']);
  assert.ok(state.preferences.excludedGroups.includes('fava'));
  assert.deepEqual(state.onboarding.workoutPrefs.injuries, ['knee_pain', 'lower_back_pain']);
  assert.ok(state.workoutPlan.goalNote.includes('حماية العضلات'));
});

test('SPEC-AUTO-COMPLETION: logging planned meals requires explicit day confirmation and autoSession completes workout session behind the scenes', () => {
  let s = generate(empty(), {
    name: 'كريم',
    age: 29,
    weight: 82,
    height: 178,
    sex: 'male',
    goal: 'lose',
    serviceTrack: 'nutrition_and_workouts',
    dietType: 'balanced',
    selectedWorkoutDays: [1, 3, 5]
  }, 'auto-complete');

  const todayDay = s.plans[0].days.find(d => d.date === today()) || s.plans[0].days[0];
  for (let i = 0; i < todayDay.meals.length; i++) {
    const meal = todayDay.meals[i];
    s = command(s, 'food_entry', {
      date: todayDay.date,
      source: 'planned',
      mealId: meal.id,
      slot: meal.slot,
      quantity: 1
    });
    const log = s.foodLogs.find(d => d.date === todayDay.date);
    if (i < todayDay.meals.length - 1) {
      assert.equal(log.complete, false);
    } else {
      assert.equal(log.complete, false, 'planned meals do not establish complete intake');
    }
  }

  const wDay = s.workoutPlan.days[0];
  for (let i = 0; i < wDay.exercises.length; i++) {
    const ex = wDay.exercises[i];
    s = command(s, 'workout', {
      dayIndex: wDay.dayIndex,
      exerciseId: ex.id,
      date: today(),
      sets: Array.from({ length: ex.sets }, () => ({ kg: 20, reps: ex.repMax, rir: ex.rir, pain: false })),
      bothSides: true,
      increment: 2.5,
      autoSession: true
    });
  }
  const sess = s.sessions.find(x => x.date === today() && x.dayIndex === wDay.dayIndex);
  assert.ok(sess, 'session is auto-created behind the scenes');
  assert.equal(sess.status, 'completed');
});

test('SPEC-HOUSEHOLD-PORTIONS: all 86 ingredients have rounded household labels and 1.2x snaps cleanly without decimals', async () => {
  const { householdQuantity, displayPortion } = await import('../planner-household.mjs');
  for (const [key, item] of Object.entries(library.ingredients)) {
    const unit = displayPortion(item);
    assert.ok(unit, `ingredient ${key} has a displayPortion`);
    const sampleGrams = String(Math.round(Number(unit.grams) * 1.2));
    const h = householdQuantity({ ...item, grams: sampleGrams });
    assert.ok(h && h.label, `ingredient ${key} produces a household label`);
    assert.ok(!/\d+\.\d+/.test(h.label), `label for ${key} (${h.label}) has no decimal numbers`);
    // Also works when portions array is omitted (e.g. frozen diary entry)
    const fallbackH = householdQuantity({ key, grams: sampleGrams });
    assert.equal(fallbackH?.label, h.label);
  }
  // 1.2 of a medium tomato (~148g vs 123g) rounds cleanly to 1 medium tomato ("حبة متوسطة")
  assert.equal(householdQuantity({ ...library.ingredients.tomato, grams: '148' }).label, 'حبة متوسطة');
  // 1.35 of a medium tomato (~166g vs 123g) rounds cleanly to 1.5 ("حبة ونص متوسطة")
  assert.equal(householdQuantity({ ...library.ingredients.tomato, grams: '166' }).label, 'حبة ونص متوسطة');
});

test('SPEC-WATER-AND-WORKOUT-PROGRESSION: water tracking and workout weight/rep increases and decreases feed into follow-up review', () => {
  let s = command(empty(), 'generate', {
    name: 'رامي',
    sex: 'male',
    age: 29,
    height: 175,
    weight: 80,
    activity: 'moderate',
    goal: 'lose',
    pace: 'medium',
    budget: 'medium',
    serviceTrack: 'nutrition_and_workouts',
    workoutDays: 3,
    trainingDays: [6, 1, 3],
    weekdayConvention: 'saturday_0',
    location: 'gym',
    level: 'beginner',
    duration: 45,
    equipment: ['dumbbell', 'barbell', 'bench'],
    healthy: true,
    injuryFree: true
  });

  // 1. Water logging increments and sets cups accurately
  s = command(s, 'water', { date: today(), addCups: 2 });
  assert.equal(s.waterLogs.find(w => w.date === today())?.cups, 2);
  s = command(s, 'water', { date: today(), addCups: 1 });
  assert.equal(s.waterLogs.find(w => w.date === today())?.cups, 3);
  const ps1 = progressSummary(s);
  assert.equal(ps1.hydration.todayCups, 3);
  assert.ok(ps1.hydration.targetCups >= 10);

  // 2. Workout weight increase and weight decrease are both tracked in workoutInsights & review
  const wDay = s.workoutPlan.days[0];
  const ex1 = wDay.exercises[0];
  const ex2 = wDay.exercises[1];

  // Previous session (3 days ago)
  s = command(s, 'workout', {
    dayIndex: wDay.dayIndex,
    exerciseId: ex1.id,
    date: dateOffset(today(), -3),
    sets: Array.from({ length: ex1.sets }, () => ({ kg: 20, reps: ex1.repMax, rir: ex1.rir, pain: false })),
    bothSides: true,
    increment: 1
  });
  s = command(s, 'workout', {
    dayIndex: wDay.dayIndex,
    exerciseId: ex2.id,
    date: dateOffset(today(), -3),
    sets: Array.from({ length: ex2.sets }, () => ({ kg: 25, reps: ex2.repMax, rir: ex2.rir, pain: false })),
    bothSides: true,
    increment: 1
  });

  // Today's session: ex1 increased weight (20 -> 22.5kg), ex2 decreased weight (25 -> 20kg)
  s = command(s, 'workout', {
    dayIndex: wDay.dayIndex,
    exerciseId: ex1.id,
    date: today(),
    sets: Array.from({ length: ex1.sets }, () => ({ kg: 22.5, reps: ex1.repMax, rir: ex1.rir, pain: false })),
    bothSides: true,
    increment: 1
  });
  s = command(s, 'workout', {
    dayIndex: wDay.dayIndex,
    exerciseId: ex2.id,
    date: today(),
    sets: Array.from({ length: ex2.sets }, () => ({ kg: 20, reps: ex2.repMax, rir: 2, pain: false })),
    bothSides: true,
    increment: 1
  });

  const ps2 = progressSummary(s);
  assert.equal(ps2.workoutSummary.insights.loadIncreases.length, 1);
  assert.equal(ps2.workoutSummary.insights.loadIncreases[0].toKg, 22.5);
  assert.equal(ps2.workoutSummary.insights.loadDecreases.length, 1);
  assert.equal(ps2.workoutSummary.insights.loadDecreases[0].toKg, 20);

  s = command(s, 'review', {});
  assert.ok(s.lastReview.hydration?.reason);
  assert.ok(s.lastReview.workoutInsights?.summaryText.includes('زودت أوزانك'));
  assert.ok(s.lastReview.workoutInsights?.summaryText.includes('خففت الوزن'));
});
