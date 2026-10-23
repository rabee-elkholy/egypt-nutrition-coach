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
