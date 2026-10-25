// Stress Test Engine: Evaluates 20 edge cases and difficult boundary scenarios.
// Tests system resilience, safe failure modes, error classification, and safety guards.

import { empty, generate, command, evaluateEligibility } from '../server/coaching.mjs';
import { generateStressCohort } from './persona-generator.mjs';
import { isoNow } from '../server/clock.mjs';
import {library} from '../server/food.mjs';

// Independent reference arithmetic for the now-feasible Gulf DASH control.
export function measuredDashSodiumInvariant(state){
  const plan=state.plans?.find(p=>p.id===state.active_plan_id);
  if(!plan||plan.days?.length!==7)return false;
  for(const day of plan.days){
    if(!day.meals?.length)return false;
    let daily=0;
    for(const meal of day.meals){
      const snapshot=meal.snapshot;if(!snapshot?.ingredients?.length||snapshot.values?.sodium==null)return false;
      let actual=0;
      for(const part of snapshot.ingredients){
        const source=library.ingredients[part.key],grams=Number(part.grams),reference=source?.values.sodium,declared=part.values_per_100g?.sodium;
        if(part.grams==null||!Number.isFinite(grams)||grams<=0||reference==null||declared==null||!Number.isFinite(Number(reference))||Number(reference)<0||Number(declared)!==Number(reference))return false;
        actual+=grams*Number(reference)/100;
      }
      if(!Number.isFinite(Number(snapshot.values.sodium))||Math.abs(actual-Number(snapshot.values.sodium))>.00001)return false;
      daily+=actual;
    }
    if(day.summary?.values.sodium==null||!Number.isFinite(Number(day.summary.values.sodium))||Math.abs(daily-Number(day.summary.values.sodium))>.00001||daily>2300)return false;
  }
  return true;
}

export async function runStressTests() {
  const cases = generateStressCohort();
  const results = [];

  for (const c of cases) {
    const t0 = performance.now();
    const item = {
      id: c.id,
      title: c.title,
      expectedOutcome: c.expectedOutcome,
      passed: false,
      actualStatus: null,
      message: null,
      errorDetails: null,
      latencyMs: 0
    };

    try {
      if (['stress_18', 'stress_19'].includes(c.id)) {
        // Run onboarding then attempt invalid command
        let s = empty();
        s = generate(s, c.draft);

        if (c.id === 'stress_18') {
          // Weight bounds
          try {
            command(s, 'weight', { date: '2026-10-24', kg: 350 });
            item.actualStatus = 'unexpected_success';
            item.message = 'System accepted out-of-bounds weight (350 kg)';
          } catch (err) {
            item.actualStatus = 'safe_rejection';
            item.message = err.message;
            item.passed = /الوزن/i.test(err.message);
          }
        } else if (c.id === 'stress_19') {
          // Rescheduling bounds
          try {
            command(s, 'reschedule', { dayIndex: 1, toDate: '2026-10-10' }); // past date
            item.actualStatus = 'unexpected_success';
            item.message = 'System accepted past reschedule date';
          } catch (err) {
            item.actualStatus = 'safe_rejection';
            item.message = err.message;
            item.passed = /الأسبوعين|فات/i.test(err.message);
          }
        }
      } else {
        // Onboarding / Screening boundary test
        const screening = evaluateEligibility(c.draft);
        const isExpectedSuccess = ['handled_safely_or_feasible', 'handled_with_bodyweight_progression', 'handled_strict_exercise_exclusions', 'favism_exclusion_enforced', 'dairy_exclusion_enforced','dash_sodium_bound_enforced'].includes(c.expectedOutcome);

        try {
          const s = empty();
          generate(s, c.draft,c.expectedOutcome==='dash_sodium_bound_enforced'?'stress-dash-gulf':undefined);

          if (!isExpectedSuccess) {
            // Expected rejection, but generation unexpectedly succeeded!
            item.actualStatus = 'unexpected_success';
            item.message = `Expected rejection (${c.expectedOutcome}) but generation succeeded.`;
            item.passed = false;
          } else {
            // Expected success. Now verify specific safety invariant!
            item.actualStatus = 'generation_succeeded';
            item.message = 'خطة أُنشئت بنجاح وفق الضوابط';
            let passedInvariant = true;

            if(c.expectedOutcome==='dash_sodium_bound_enforced'){
              passedInvariant=measuredDashSodiumInvariant(s);
              item.message=passedInvariant?'All seven days retain measured reference sodium at or below 2300 mg.':'Missing, inconsistent or excessive reference sodium in the generated DASH control.';
            }else if (c.expectedOutcome === 'favism_exclusion_enforced') {
              const allKeys = s.plans.flatMap(p => p.days.flatMap(d => d.meals.flatMap(m => m.snapshot.ingredients.map(i => i.key))));
              if (allKeys.some(k => k === 'fava' || k === 'falafel' || k.includes('fava'))) {
                item.message = 'Plan contains fava bean ingredients for favism persona!';
                passedInvariant = false;
              }
            } else if (c.expectedOutcome === 'dairy_exclusion_enforced') {
              const allKeys = s.plans.flatMap(p => p.days.flatMap(d => d.meals.flatMap(m => m.snapshot.ingredients.map(i => i.key))));
              const dairy = ['milk', 'wholemilk', 'yogurt', 'greekyogurt', 'cheese', 'cottage', 'feta', 'mozzarella'];
              if (allKeys.some(k => dairy.includes(k))) {
                item.message = 'Plan contains dairy ingredients for lactose intolerant persona!';
                passedInvariant = false;
              }
            } else if (c.expectedOutcome === 'handled_strict_exercise_exclusions') {
              const names = s.workoutPlan?.days?.flatMap(d => d.exercises.map(e => e.name.toLowerCase())) || [];
              if (names.some(n => /deadlift|back squat|good morning|jump|lunge|overhead/i.test(n))) {
                item.message = 'Workout contains contraindicated exercises for injured persona!';
                passedInvariant = false;
              }
            }

            item.passed = passedInvariant;
          }
        } catch (genErr) {
          if (genErr instanceof TypeError || genErr instanceof ReferenceError) {
            // Runtime crash is NEVER a safe rejection!
            item.actualStatus = 'runtime_crash';
            item.message = genErr.message;
            item.errorDetails = genErr.stack;
            item.passed = false;
          } else if (isExpectedSuccess) {
            // Was expected to succeed safely, but threw!
            item.actualStatus = 'unexpected_rejection';
            item.message = genErr.message;
            item.passed = false;
          } else {
            // Expected rejection, and threw expected domain error
            item.actualStatus = 'safe_rejection';
            item.message = genErr.message;
            item.passed = true;
          }
        }
      }
    } catch (unexpectedErr) {
      item.actualStatus = 'unexpected_error';
      item.message = unexpectedErr.message;
      item.errorDetails = unexpectedErr.stack;
      item.passed = false;
    }

    item.latencyMs = Math.round((performance.now() - t0) * 100) / 100;
    results.push(item);
  }

  const passedCount = results.filter(r => r.passed).length;
  return {
    total: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    allPassed: passedCount === results.length,
    results
  };
}
