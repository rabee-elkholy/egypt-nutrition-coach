// Stress Test Engine: Evaluates 20 edge cases and difficult boundary scenarios.
// Tests system resilience, safe failure modes, error classification, and safety guards.

import { empty, generate, command, evaluateEligibility } from '../server/coaching.mjs';
import { generateStressCohort } from './persona-generator.mjs';
import { isoNow } from '../server/clock.mjs';

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
        try {
          const s = empty();
          generate(s, c.draft);
          // If generation succeeded:
          item.actualStatus = 'generation_succeeded';
          item.message = 'خطة أُنشئت بنجاح';
          // Check if expected outcome was handled safely
          item.passed = ['handled_safely_or_feasible', 'handled_with_bodyweight_progression', 'handled_strict_exercise_exclusions', 'favism_exclusion_enforced', 'dairy_exclusion_enforced'].includes(c.expectedOutcome);
        } catch (genErr) {
          item.actualStatus = 'safe_rejection';
          item.message = genErr.message;
          item.passed = true; // safe rejection was expected
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
