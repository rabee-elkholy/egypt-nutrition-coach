// Evaluator Negative Controls Test Suite
// Verifies that the independent evaluator strictly flags deliberate safety violations,
// contraindications, integrity flaws, and data leaks.

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateUserSimulation } from '../simulation/evaluation-engine.mjs';
import { evaluateDay } from '../scripts/cohort/evaluate.mjs';

function createMockSimulationResult(userOverrides = {}, planOverrides = {}) {
  const baseUser = {
    id: 'test-user-01',
    name: 'اختبار رقابي',
    sex: 'female',
    age: 28,
    height: 165,
    weight: 65,
    goal: 'lose',
    dietType: 'balanced',
    diseases: [],
    injuries: [],
    dailyActivity: 'moderate',
    serviceTrack: 'nutrition_and_workouts',
    ...userOverrides
  };

  const basePlan = {
    id: 'plan-root-001',
    targets: { energy: 1500, protein: 90 },
    days: [
      {
        date: '2026-10-24',
        targets: { energy: 1500, protein: 90 },
        summary: { values: { energy: 1500, protein: 90, sodium: 1800 } },
        meals: [
          {
            id: 'm1',
            slot: 'breakfast',
            snapshot: {
              ingredients: [
                { key: 'oats', grams: 60 },
                { key: 'egg', grams: 100 }
              ]
            }
          }
        ]
      }
    ],
    ...planOverrides
  };

  return {
    user: baseUser,
    nutritionPlans: [{ version: 1, day: 1, date: '2026-10-24', plan: basePlan }],
    workoutPlans: [{
      version: 1,
      workoutPlan: {
        id: 'wp-001',
        days: [
          {
            dayIndex: 1,
            exercises: [
              { id: 'ex-01', name: 'Dumbbell Bench Press', pattern: 'horizontal_push', sets: 3, repMin: 8, repMax: 12, rir: 2 }
            ]
          }
        ]
      }
    }],
    dailyBehavior: [{ date: '2026-10-24', actualSleep: 7 }],
    dailyAppState: [{ day: 1, date: '2026-10-24', revision: 2, activePlanId: 'plan-root-001' }],
    foodDiary: [],
    workoutHistory: [],
    healthTracking: [],
    messages: [],
    adaptations: [],
    apiEvents: [{ day: 1, action: 'generate', revision: 1, status: 'success', latencyMs: 12 }],
    errors: []
  };
}

test('Negative Control 1: Favism persona receiving fava bean must fail evaluation', () => {
  const sim = createMockSimulationResult(
    { diseases: ['favism'] },
    {
      days: [{
        date: '2026-10-24',
        targets: { energy: 1500 },
        meals: [{
          id: 'm-fava',
          snapshot: { ingredients: [{ key: 'fava', grams: 150 }] }
        }]
      }]
    }
  );

  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false, 'Should fail safety gates');
  const favismViolation = evaluation.safetyViolations.find(v => v.rule === 'FAVISM_CONTRAINDICATION');
  assert.ok(favismViolation, 'Must register FAVISM_CONTRAINDICATION');
  assert.equal(evaluation.scores.safety, 0, 'Safety score must be 0');
  assert.equal(evaluation.scores.total, 0, 'Total score must be 0 on safety failure');
});

test('Negative Control 2: Lactose intolerance receiving whole milk must fail evaluation', () => {
  const sim = createMockSimulationResult(
    { diseases: ['lactose_intolerance'] },
    {
      days: [{
        date: '2026-10-24',
        targets: { energy: 1500 },
        meals: [{
          id: 'm-milk',
          snapshot: { ingredients: [{ key: 'wholemilk', grams: 200 }] }
        }]
      }]
    }
  );

  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false);
  const lactoseViolation = evaluation.safetyViolations.find(v => v.rule === 'LACTOSE_CONTRAINDICATION');
  assert.ok(lactoseViolation, 'Must register LACTOSE_CONTRAINDICATION');
});

test('Negative Control 3: Gout persona receiving purine-rich liver must fail evaluation', () => {
  const sim = createMockSimulationResult(
    { diseases: ['gout'] },
    {
      days: [{
        date: '2026-10-24',
        targets: { energy: 1500 },
        meals: [{
          id: 'm-liver',
          snapshot: { ingredients: [{ key: 'liver', grams: 100 }] }
        }]
      }]
    }
  );

  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false);
  const goutViolation = evaluation.safetyViolations.find(v => v.rule === 'GOUT_PURINE_CONTRAINDICATION');
  assert.ok(goutViolation, 'Must register GOUT_PURINE_CONTRAINDICATION');
});

test('Negative Control 4: Gout persona assigned keto diet must fail evaluation', () => {
  const sim = createMockSimulationResult({ diseases: ['gout'], dietType: 'keto' });
  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false);
  const ketoViolation = evaluation.safetyViolations.find(v => v.rule === 'GOUT_KETO_CONTRAINDICATION');
  assert.ok(ketoViolation, 'Must register GOUT_KETO_CONTRAINDICATION');
});

test('Negative Control 5: Hypertension persona with excessive daily sodium (>2300mg) must fail evaluation', () => {
  const sim = createMockSimulationResult(
    { diseases: ['hypertension'] },
    {
      days: [{
        date: '2026-10-24',
        targets: { energy: 1500 },
        summary: { values: { energy: 1500, sodium: 3100 } },
        meals: []
      }]
    }
  );

  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false);
  const sodiumViolation = evaluation.safetyViolations.find(v => v.rule === 'HYPERTENSION_SODIUM_EXCEEDED');
  assert.ok(sodiumViolation, 'Must register HYPERTENSION_SODIUM_EXCEEDED');
});

test('Negative Control 6: Sub-floor calories (female < 1200 kcal) must fail evaluation', () => {
  const sim = createMockSimulationResult(
    { sex: 'female' },
    {
      targets: { energy: 950 },
      days: [{ date: '2026-10-24', targets: { energy: 950 }, meals: [] }]
    }
  );

  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false);
  const floorViolation = evaluation.safetyViolations.find(v => v.rule === 'SUB_FLOOR_CALORIES');
  assert.ok(floorViolation, 'Must register SUB_FLOOR_CALORIES');
});

test('Negative Control 7: Contraindicated exercise prescribed for injury must fail evaluation', () => {
  const sim = createMockSimulationResult({ injuries: ['knee_pain'] });
  sim.workoutPlans = [{
    version: 1,
    workoutPlan: {
      days: [{
        dayIndex: 1,
        exercises: [{ id: 'ex-pistol', name: 'Pistol Squat' }]
      }]
    }
  }];

  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false);
  const injuryViolation = evaluation.safetyViolations.find(v => v.rule === 'CONTRAINDICATED_EXERCISE_PRESCRIBED');
  assert.ok(injuryViolation, 'Must register CONTRAINDICATED_EXERCISE_PRESCRIBED');
});

test('Negative Control 8: Ground truth leakage into user-facing text must fail evaluation', () => {
  const sim = createMockSimulationResult();
  sim.dailyBehavior = [{ date: '2026-10-24', actualSleep: 4 }];
  sim.healthTracking = []; // User NEVER logged sleep today!
  sim.messages = [{
    day: 1,
    date: '2026-10-24',
    exactText: 'نلاحظ أن نومك 4 ساعات الليلة الماضية، خذ قسطًا من الراحة.'
  }];

  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false);
  const leakViolation = evaluation.safetyViolations.find(v => v.rule === 'GROUND_TRUTH_LEAKAGE');
  assert.ok(leakViolation, 'Must register GROUND_TRUTH_LEAKAGE');
});

test('Negative Control 9: Non-monotonic revision numbers on mutation must fail evaluation', () => {
  const sim = createMockSimulationResult();
  sim.apiEvents = [
    { day: 1, action: 'generate', revision: 5, status: 'success' },
    { day: 1, action: 'water', revision: 6, status: 'success' },
    { day: 2, action: 'weight', revision: 4, status: 'success' } // Regression!
  ];

  const evaluation = evaluateUserSimulation(sim);
  assert.equal(evaluation.passedAllGates, false);
  const revViolation = evaluation.safetyViolations.find(v => v.rule === 'NON_MONOTONIC_REVISION');
  assert.ok(revViolation, 'Must register NON_MONOTONIC_REVISION');
});

test('Negative Control 10: Missing plan snapshot must be flagged in findings', () => {
  const sim = createMockSimulationResult();
  sim.dailyAppState = [
    { day: 1, date: '2026-10-24', activePlanId: 'plan-root-001' },
    { day: 8, date: '2026-10-31', activePlanId: 'plan-week2-orphan' } // Active plan has NO snapshot in nutritionPlans!
  ];

  const evaluation = evaluateUserSimulation(sim);
  const missingSnapshotFinding = evaluation.findings.find(f => f.issue === 'MISSING_PLAN_SNAPSHOTS');
  assert.ok(missingSnapshotFinding, 'Must register MISSING_PLAN_SNAPSHOTS in findings');
  assert.equal(evaluation.passedAllGates, false, 'Missing history must fail the evidence gate');
});
test('Session metrics count occurrences rather than exercises or repeated completion commands', () => {
  const sim=createMockSimulationResult();
  sim.apiEvents=[{day:1,action:'session',status:'success',payload:{date:'2026-10-24',dayIndex:1,status:'partial'}},{day:1,action:'session',status:'success',payload:{date:'2026-10-24',dayIndex:1,status:'completed'}},{day:1,action:'session',status:'success',payload:{date:'2026-10-24',dayIndex:1,status:'completed'}}];
  const result=evaluateUserSimulation(sim);
  assert.equal(result.metrics.completedSessionsCount,1);
  assert.equal(result.metrics.partialSessionsCount,0);
  assert.equal(result.metrics.scheduledSessionsCount,1);
});

test('Negative Control 11: Single-service tracks must receive N/A for inapplicable track without free points', () => {
  const nutritionOnlySim = createMockSimulationResult({ serviceTrack: 'nutrition_only' });
  nutritionOnlySim.workoutPlans = []; // No workouts

  const evaluation = evaluateUserSimulation(nutritionOnlySim);
  assert.equal(evaluation.scores.workout, null, 'Workout score must be null (N/A)');
  assert.equal(evaluation.scores.maxPossible, 80, 'Max possible score must be 80 for nutrition_only');
  assert.ok(evaluation.scores.total > 0 && evaluation.scores.total <= 100, 'Score is properly normalized');
});
