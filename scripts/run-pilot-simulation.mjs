// Pilot Simulation: Runs 5 diverse users for 14 days (70 user-days)
// Verifies pipeline integrity, command receipts, message rendering, and output fidelity.

import { generateCohort } from '../simulation/persona-generator.mjs';
import { runUserSimulation } from '../simulation/engine-runner.mjs';
import { evaluateUserSimulation } from '../simulation/evaluation-engine.mjs';

console.log('=== STARTING PILOT SIMULATION (5 Users × 14 Days = 70 User-Days) ===');

const cohort = generateCohort(42100);
const pilotUsers = cohort.slice(0, 5);

let totalUserDays = 0;
let totalCommands = 0;
let totalErrors = 0;
let passedGatesCount = 0;

const t0 = performance.now();

for (const user of pilotUsers) {
  console.log(`\n--- Running User: ${user.id} (${user.name}) | Track: ${user.serviceTrack} | Archetype: ${user.archetype} ---`);
  const sim = await runUserSimulation(user, 14, 42100);
  const evaluation = evaluateUserSimulation(sim);

  totalUserDays += sim.totalDaysExecuted;
  totalCommands += sim.userSummary.totalCommandsExecuted;
  totalErrors += sim.userSummary.failedCommands;
  if (evaluation.passedAllGates) passedGatesCount++;

  console.log(`Executed 14 days in ${sim.userSummary.elapsedMs} ms`);
  console.log(`Commands: ${sim.userSummary.successfulCommands} ok, ${sim.userSummary.failedCommands} errors`);
  console.log(`Messages generated: ${sim.messages.length} (${sim.userSummary.renderedMessagesCount} rendered)`);
  console.log(`Score: ${evaluation.scores.total}/100 | Passed all safety gates: ${evaluation.passedAllGates}`);
  if (evaluation.safetyViolations.length) {
    console.error(`Safety violations:`, evaluation.safetyViolations);
  }
}

const totalTime = Math.round(performance.now() - t0);
console.log('\n=== PILOT COMPLETE ===');
console.log(`Total User-Days: ${totalUserDays}`);
console.log(`Total Commands Executed: ${totalCommands}`);
console.log(`Total Errors/Rejections: ${totalErrors}`);
console.log(`Passed Safety Gates: ${passedGatesCount} / 5`);
console.log(`Total Time: ${totalTime} ms (${Math.round(totalTime / totalUserDays * 10) / 10} ms / user-day)`);
