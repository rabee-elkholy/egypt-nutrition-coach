// Master Simulation Orchestrator: 100 Realistic Users × 90 Days (9,000 User-Days)
// Independent Coaching System Evaluation with Real Engines, Full Logging, Stress Tests & Reports.

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, lstatSync, unlinkSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generateCohort } from '../simulation/persona-generator.mjs';
import { runUserSimulation } from '../simulation/engine-runner.mjs';
import { evaluateUserSimulation } from '../simulation/evaluation-engine.mjs';
import { runStressTests } from '../simulation/stress-tests.mjs';
import { buildDashboardHtml } from '../simulation/dashboard-builder.mjs';
import {sourceProvenance, messageRepetition, cohortDiversity} from './audit/evidence.mjs';
import {evidenceSummary, evidenceQuality, evidenceFindings, evidenceLimitations, evidenceReproducibility} from '../simulation/evidence-reports.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    users: 100,
    days: 90,
    seed: 42100,
    output: null,
    userId: null,
    fromDay: 1
  };
  for (const arg of args) {
    if (arg.startsWith('--users=')) opts.users = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--days=')) opts.days = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--seed=')) opts.seed = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--output=')) opts.output = arg.split('=')[1];
    else if (arg.startsWith('--user-id=')) opts.userId = arg.split('=')[1];
    else if (arg.startsWith('--from-day=')) opts.fromDay = parseInt(arg.split('=')[1], 10);
  }
  return opts;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function main() {
  const tStart = performance.now();
  const opts = parseArgs();
  if (!Number.isInteger(opts.users) || opts.users < 1 || opts.users > 100 || !Number.isInteger(opts.days) || opts.days < 1 || opts.days > 90) throw Error('Invalid users/days');
  const provenance = sourceProvenance();
  const runId = `run-${Date.now()}`;
  const outDir = opts.output || `reports/simulation-100-users-90-days/${runId}`;
  if (existsSync(outDir)) throw Error('Output exists; choose a new directory to preserve prior evidence');
  await mkdir(outDir, { recursive: true });

  console.log(`====================================================================`);
  console.log(`🚀 STARTING MASTER SIMULATION: ${opts.users} Users × ${opts.days} Days`);
  console.log(`Seed: ${opts.seed} | RunId: ${runId}`);
  console.log(`Output Directory: ${outDir}`);
  console.log(`====================================================================\n`);

  // 1. Generate Cohort
  let cohort = generateCohort(opts.seed);
  if (opts.userId) {
    cohort = cohort.filter(u => u.id === opts.userId);
  } else if (opts.users < 100) {
    cohort = cohort.slice(0, opts.users);
  }

  // 2. Run Stress Tests (20 Edge Cases)
  console.log(`▶ Executing 20 Stress Test Scenarios...`);
  const stressResults = await runStressTests();
  console.log(`✔ Stress Tests Completed: ${stressResults.passedCount} / ${stressResults.total} passed.\n`);

  // 3. Execute Simulation for each User
  console.log(`▶ Executing Day-by-Day Simulation on Real Engines for ${cohort.length} Users...`);
  const allSimulations = [];
  const allEvaluations = [];
  const allDaysMap = {}; // for dashboard
  const userFileHashes = {};

  let completedUserDays = 0;
  let totalApiCommands = 0;
  let totalErrors = 0;

  for (let idx = 0; idx < cohort.length; idx++) {
    const user = cohort[idx];
    const userDir = `${outDir}/users/${user.id}`;
    await mkdir(userDir, { recursive: true });

    const sim = await runUserSimulation(user, opts.days, opts.seed);
    const evaluation = evaluateUserSimulation(sim);

    allSimulations.push(sim);
    allEvaluations.push(evaluation);

    completedUserDays += sim.totalDaysExecuted;
    totalApiCommands += sim.userSummary.totalCommandsExecuted;
    totalErrors += sim.userSummary.failedCommands;

    // Build day map for dashboard
    const userDays = [];
    for (let d = 1; d <= sim.totalDaysExecuted; d++) {
      const gt = sim.dailyBehavior[d - 1] || {};
      const appState = sim.dailyAppState[d - 1] || {};
      const dayMeals = sim.foodDiary.filter(f => f.day === d);
      const dayWorkouts = sim.workoutHistory.filter(w => w.day === d);
      const dayMsgs = sim.messages.filter(m => m.day === d);
      const dayAd = sim.adaptations.filter(a => a.day === d);
      const dayEvs = sim.apiEvents.filter(e => e.day === d);
      userDays.push({
        day: d,
        date: gt.date || appState.date,
        opensApp: dayEvs.length > 0,
        groundTruth: gt,
        appState,
        meals: dayMeals,
        workouts: dayWorkouts,
        messages: dayMsgs,
        adaptations: dayAd,
        apiEvents: dayEvs
      });
    }
    allDaysMap[user.id] = userDays;

    // Write User's 15 Individual Files
    const userFiles = [
      ['persona.json', JSON.stringify(user, null, 2)],
      ['onboarding.json', JSON.stringify(sim.onboardingResult, null, 2)],
      ['nutrition_plans.jsonl', sim.nutritionPlans.map(p => JSON.stringify(p)).join('\n')],
      ['workout_plans.jsonl', sim.workoutPlans.map(p => JSON.stringify(p)).join('\n')],
      ['daily_behavior.jsonl', sim.dailyBehavior.map(b => JSON.stringify(b)).join('\n')],
      ['daily_app_state.jsonl', sim.dailyAppState.map(s => JSON.stringify(s)).join('\n')],
      ['food_diary.jsonl', sim.foodDiary.map(f => JSON.stringify(f)).join('\n')],
      ['workout_history.jsonl', sim.workoutHistory.map(w => JSON.stringify(w)).join('\n')],
      ['health_tracking.jsonl', sim.healthTracking.map(h => JSON.stringify(h)).join('\n')],
      ['messages.jsonl', sim.messages.map(m => JSON.stringify(m)).join('\n')],
      ['adaptations.jsonl', sim.adaptations.map(a => JSON.stringify(a)).join('\n')],
      ['api_events.jsonl', sim.apiEvents.map(e => JSON.stringify(e)).join('\n')],
      ['errors.jsonl', sim.errors.map(e => JSON.stringify(e)).join('\n')],
      ['user_summary.json', JSON.stringify({ ...sim.userSummary, evaluation: evaluation.scores, metrics: evaluation.metrics }, null, 2)],
      ['USER_REPORT_AR.md', generateUserReportMarkdown(user, sim, evaluation)]
    ];

    for (const [fname, content] of userFiles) {
      await writeFile(`${userDir}/${fname}`, content, 'utf8');
      userFileHashes[`users/${user.id}/${fname}`] = sha256(content);
    }

    if ((idx + 1) % 10 === 0 || idx === cohort.length - 1) {
      console.log(`  [Progress] Processed ${idx + 1} / ${cohort.length} users (${completedUserDays} user-days, avg score: ${Math.round(allEvaluations.reduce((acc, e) => acc + e.scores.total, 0) / (idx + 1))}/100)`);
    }
  }

  // 4. Compute Global Aggregated Metrics
  console.log(`\n▶ Computing Global Aggregated Metrics Across Cohorts & Breakdowns...`);
  const globalMetrics = computeGlobalMetrics(cohort, allSimulations, allEvaluations, stressResults);

  // 5. Generate and Write Global Datasets & Reports
  console.log(`▶ Writing Global Reports, Datasets, CSVs & Interactive HTML Dashboard...`);

  async function hashFile(filePath) {
    const { createReadStream } = await import('node:fs');
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }

  async function writeJsonlFile(filename, items) {
    const filePath = `${outDir}/${filename}`;
    const { createWriteStream } = await import('node:fs');
    const stream = createWriteStream(filePath, { encoding: 'utf8' });
    for (const item of items) {
      if (!stream.write(JSON.stringify(item) + '\n')) {
        await new Promise(r => stream.once('drain', r));
      }
    }
    await new Promise(r => stream.end(r));
    return await hashFile(filePath);
  }

  const manifestFiles = { ...userFileHashes };

  // Write streaming JSONL files
  manifestFiles['all_users.jsonl'] = await writeJsonlFile('all_users.jsonl', allSimulations.map(s => s.userSummary));
  manifestFiles['all_days.jsonl'] = await writeJsonlFile('all_days.jsonl', Object.values(allDaysMap).flat());
  manifestFiles['all_events.jsonl'] = await writeJsonlFile('all_events.jsonl', allSimulations.flatMap(s => s.apiEvents));
  manifestFiles['all_messages.jsonl'] = await writeJsonlFile('all_messages.jsonl', allSimulations.flatMap(s => s.messages));
  manifestFiles['all_plans.jsonl'] = await writeJsonlFile('all_plans.jsonl', allSimulations.flatMap(s => [...s.nutritionPlans, ...s.workoutPlans]));
  manifestFiles['all_adaptations.jsonl'] = await writeJsonlFile('all_adaptations.jsonl', allSimulations.flatMap(s => s.adaptations));
  manifestFiles['all_errors.jsonl'] = await writeJsonlFile('all_errors.jsonl', allSimulations.flatMap(s => s.errors));
  manifestFiles['ground_truth.jsonl'] = await writeJsonlFile('ground_truth.jsonl', allSimulations.flatMap(s => s.dailyBehavior));

  const metricsJson = JSON.stringify(globalMetrics, null, 2);
  const metricsCsv = generateMetricsCsv(cohort, allEvaluations);

  // Markdown Reports
  const summaryAr = evidenceSummary(globalMetrics);
  const qualityReportAr = evidenceQuality(globalMetrics);
  const criticalFindingsAr = evidenceFindings(globalMetrics, allEvaluations);
  const limitationsAr = evidenceLimitations();
  const reproducibilityMd = evidenceReproducibility(opts, runId, provenance);

  // Standalone HTML Dashboard
  const dashboardHtml = buildDashboardHtml(cohort, allDaysMap, stressResults, globalMetrics);

  const globalFiles = [
    ['simulation_config.json', JSON.stringify({ ...opts, runId, totalCohortUsers: cohort.length, totalUserDays: completedUserDays }, null, 2)],
    ['cohort.json', JSON.stringify(cohort, null, 2)],
    ['cohort_diversity.json', JSON.stringify(cohortDiversity(cohort), null, 2)],
    ['stress_results.json', JSON.stringify(stressResults, null, 2)],
    ['metrics.json', metricsJson],
    ['metrics.csv', metricsCsv],
    ['SUMMARY_AR.md', summaryAr],
    ['QUALITY_REPORT_AR.md', qualityReportAr],
    ['CRITICAL_FINDINGS_AR.md', criticalFindingsAr],
    ['LIMITATIONS_AR.md', limitationsAr],
    ['REPRODUCIBILITY.md', reproducibilityMd],
    ['index.html', dashboardHtml]
  ];

  for (const [fname, content] of globalFiles) {
    await writeFile(`${outDir}/${fname}`, content, 'utf8');
    manifestFiles[fname] = sha256(content);
  }

  // Write Manifest
  const manifest = {
    runId,
    timestamp: new Date().toISOString(),
    gitCommit: provenance.gitCommit,
    provenance,
    executionPath: 'IN_PROCESS_DOMAIN_ENGINE',
    latencyProvenance: 'IN_PROCESS_DOMAIN_ENGINE',
    engineVersion: '0.12.0',
    schemaVersion: 3,
    nodeVersion: process.version,
    seed: opts.seed,
    cohortSize: cohort.length,
    totalUserDays: completedUserDays,
    totalCommandsExecuted: totalApiCommands,
    totalErrors: totalErrors,
    durationMs: Math.round(performance.now() - tStart),
    safetyGatesStatus: globalMetrics.passedAllSafetyGates ? 'NO_VIOLATIONS_DETECTED_IN_COVERED_RULES' : 'VIOLATIONS_FOUND',
    averageQualityScore: globalMetrics.averageQualityScore,
    stressTestsPassed: `${stressResults.passedCount}/${stressResults.total}`,
    files: manifestFiles
  };
  await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2), 'utf8');

  // Historical output and the existing latest junction are intentionally preserved.
  const totalTimeSec = Math.round((performance.now() - tStart) / 1000);
  console.log(`\n====================================================================`);
  console.log(`✅ SIMULATION COMPLETED SUCCESSFULLY IN ${totalTimeSec} SECONDS!`);
  console.log(`Total User-Days: ${completedUserDays}`);
  console.log(`Total Commands Executed: ${totalApiCommands}`);
  console.log(`Covered Safety Rules: ${globalMetrics.passedGatesCount}/${cohort.length}; clinical safety NOT_ESTABLISHED`);
  console.log(`Average Quality Score: ${globalMetrics.averageQualityScore} / 100`);
  console.log(`All reports, datasets, and explorer generated in:`);
  console.log(`👉 ${outDir}`);
  console.log(`====================================================================\n`);
}

function computeGlobalMetrics(cohort, simulations, evaluations, stressResults) {
  const total = cohort.length;
  const avg = (arr, fn) => arr.length ? Math.round(arr.reduce((acc, x) => acc + (fn ? fn(x) : x), 0) / arr.length * 100) / 100 : 0;

  const passedGatesCount = evaluations.filter(e => e.passedAllGates).length;
  const avgTotalScore = avg(evaluations, e => e.scores.total);
  const avgSafetyScore = avg(evaluations, e => e.scores.safety);
  const avgNutritionScore = avg(evaluations.filter(e => e.scores.nutrition !== null), e => e.scores.nutrition);
  const avgWorkoutScore = avg(evaluations.filter(e => e.scores.workout !== null), e => e.scores.workout);
  const avgAdaptationScore = avg(evaluations, e => e.scores.adaptation);
  const avgMessageScore = avg(evaluations, e => e.scores.message);

  // Group by Cohort (Development vs Holdout)
  const devEvals = evaluations.filter((e, i) => cohort[i].cohort === 'development');
  const holdoutEvals = evaluations.filter((e, i) => cohort[i].cohort === 'holdout');

  // Breakdown by Goal
  const byGoal = {};
  for (const g of ['lose', 'muscle_gain', 'maintain', 'gain']) {
    const subset = evaluations.filter((e, i) => cohort[i].goal === g);
    byGoal[g] = { count: subset.length, avgScore: avg(subset, e => e.scores.total) };
  }

  // Breakdown by Gender
  const byGender = {
    male: { count: cohort.filter(u => u.sex === 'male').length, avgScore: avg(evaluations.filter((e, i) => cohort[i].sex === 'male'), e => e.scores.total) },
    female: { count: cohort.filter(u => u.sex === 'female').length, avgScore: avg(evaluations.filter((e, i) => cohort[i].sex === 'female'), e => e.scores.total) }
  };

  // Breakdown by Service Track
  const byTrack = {};
  for (const t of ['nutrition_and_workouts', 'nutrition_only', 'workouts_only']) {
    const subset = evaluations.filter((e, i) => cohort[i].serviceTrack === t);
    byTrack[t] = { count: subset.length, avgScore: avg(subset, e => e.scores.total) };
  }

  // Latencies
  const allLatencies = simulations.flatMap(s => s.apiEvents.map(e => e.latencyMs)).filter(l => Number.isFinite(l)).sort((a, b) => a - b);
  const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)] || 0;
  const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)] || 0;
  const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)] || 0;

  // Interventions
  const totalCalorieProposals = simulations.flatMap(s => s.adaptations.filter(a => a.kind === 'calories')).length;
  const totalDeloadProposals = simulations.flatMap(s => s.adaptations.filter(a => a.kind === 'recovery')).length;
  const totalVolumeProposals = simulations.flatMap(s => s.adaptations.filter(a => a.kind === 'weekly_volume')).length;

  return {
    totalUsers: total,
    totalUserDays: simulations.reduce((acc, s) => acc + s.totalDaysExecuted, 0),
    passedAllSafetyGates: passedGatesCount === total,
    passedGatesCount,
    averageQualityScore: avgTotalScore,
    cohortScores: {
      development: { count: devEvals.length, avgScore: avg(devEvals, e => e.scores.total) },
      holdout: { count: holdoutEvals.length, avgScore: avg(holdoutEvals, e => e.scores.total) }
    },
    subScores: {
      safety: avgSafetyScore,
      nutrition: avgNutritionScore,
      workout: avgWorkoutScore,
      adaptation: avgAdaptationScore,
      message: avgMessageScore
    },
    byGoal,
    byGender,
    byTrack,
    latencies: { p50, p95, p99 },
    latencyProvenance: 'IN_PROCESS_DOMAIN_ENGINE',
    messageRepetition: messageRepetition(simulations.map(s => ({userId:s.user.id, messages:s.messages}))),
    interventions: {
      totalCalorieProposals,
      totalDeloadProposals,
      totalVolumeProposals,
      unwarrantedCalorieProposals: evaluations.reduce((acc, e) => acc + e.metrics.unwarrantedCalorieProposals, 0),
      missedPlateauInterventions: evaluations.reduce((acc, e) => acc + e.metrics.missedPlateauInterventions, 0)
    },
    stressTests: {
      total: stressResults.total,
      passed: stressResults.passedCount
    }
  };
}

function generateMetricsCsv(cohort, evaluations) {
  const headers = ['user_id', 'name', 'cohort', 'sex', 'age', 'goal', 'track', 'diet', 'archetype', 'score', 'safety_score', 'nutrition_score', 'workout_score', 'adaptation_score', 'message_score', 'repetition_rate', 'passed_gates'];
  const rows = evaluations.map((e, idx) => {
    const u = cohort[idx];
    return [
      u.id,
      `"${u.name}"`,
      u.cohort,
      u.sex,
      u.age,
      u.goal,
      u.serviceTrack,
      u.dietType,
      u.archetype,
      e.scores.total,
      e.scores.safety,
      e.scores.nutrition,
      e.scores.workout,
      e.scores.adaptation,
      e.scores.message,
      e.metrics.repetitionRate,
      e.passedAllGates ? 1 : 0
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

function generateUserReportMarkdown(user, sim, evalRes) {
  const s = sim.userSummary;
  return `# تقرير رحلة المستخدم: ${user.name} (${user.id})

## 1. بطاقة الشخصية وبيانات البداية
- **الفئة:** ${user.cohort === 'development' ? 'عينة التطوير' : 'عينة التأكيد المستقلة (Holdout)'}
- **النمط السلوكي:** ${user.archetype}
- **المهنة ونمط العمل:** ${user.occupation} (${user.workShift})
- **السن والجنس:** ${user.age} سنة — ${user.sex === 'male' ? 'ذكر' : 'أنثى'}
- **الطول والوزن الأولي:** ${user.height} سم — ${user.weight} كجم (مؤشر الكتلة: ${user.bmi})
- **الهدف المستهدف:** ${user.goal} ${user.targetWeight ? `(الوزن المستهدف: ${user.targetWeight} كجم)` : ''}
- **مسار الخدمة:** ${user.serviceTrack}
- **النظام الغذائي والميزانية:** ${user.dietType} — ميزانية ${user.budget} — عدد الوجبات ${user.mealsCount}
- **المنطقة والتوقيت:** ${user.region === 'egypt' ? 'مصر' : 'الخليج'} (${user.timezone})
- **التدريب الرياضي:** ${user.workoutDaysCount} أيام/أسبوع — موقع: ${user.workoutLocation} — تقسيم: ${user.workoutSplitPreference}
- **الحالات الصحية:** ${user.diseases.length ? user.diseases.join('، ') : 'بدون حالات خاصة'}
- **المفاصل والإصابات:** ${user.injuries.length ? user.injuries.join('، ') : 'سليم'}

---

## 2. ملخص الرحلة الرقمي (90 يومًا)
- **إجمالي الأيام المنفذة:** ${s.totalDays} يومًا
- **الوزن الفعلي النهائي (Ground Truth):** ${s.endBioWeight} كجم (فارق: ${s.deltaWeightKg} كجم)
- **العمليات البرمجية المنفذة:** ${s.totalCommandsExecuted} (نجاح: ${s.successfulCommands} — أخطاء/رفض: ${s.failedCommands})
- **أيام اكتمال تسجيل الطعام:** ${s.foodCompleteDaysCount} من 90 يومًا
- **مرات قياس الوزن المسجلة:** ${s.weightsLoggedCount} مرات
- **جلسات التمارين المسجلة:** ${s.workoutsCompletedCount} جلسة
- **اقتراحات التكيف والتعديل:** ${s.adaptationsProposed} مقترح (قُبل منها: ${s.adaptationsAccepted})
- **إجمالي الرسائل الشخصية المستلمة:** ${s.totalMessagesGenerated} رسالة (عُرضت فعليًا: ${s.renderedMessagesCount})

---

## 3. تقييم الجودة المستقل
- **التقييم الإجمالي:** **${evalRes.scores.total} / 100**
  - بوابة الأمان والقيود: ${evalRes.scores.safety} / 30
  - جودة وتنوع التغذية: ${evalRes.scores.nutrition} / 20
  - تدرج وملاءمة التدريب: ${evalRes.scores.workout} / 20
  - توقيت التدخلات والتكيف: ${evalRes.scores.adaptation} / 15
  - جودة الرسائل وتنوع العبارات: ${evalRes.scores.message} / 15
- **اجتياز حواجز الأمان:** ${evalRes.passedAllGates ? '✅ تم الاجتياز بالكامل (0 مخالفات)' : '🚨 توجد مخالفات أمان'}
- **معدل تكرار عبارات المدرب:** ${Math.round(evalRes.metrics.repetitionRate * 100)}%

---

## 4. أهم قرارات المحرك
${sim.adaptations.length ? sim.adaptations.map(a => `- **يوم ${a.day} (${a.date}):** ${a.reason} — **قرار المستخدم:** ${a.accepted ? 'قبول التعديل' : 'رفض التعديل'}`).join('\n') : 'لم تُقترح تعديلات على الخطة خلال هذه الرحلة.'}

---

## 5. نماذج من رسائل المدرب الحرفية
${sim.messages.slice(0, 5).map(m => `> **[${m.role}] يوم ${m.day}:** ${m.exactText}\n> *التوجيه العملي:* ${m.actionText || 'متابعة اليوم'}`).join('\n\n')}

---
*البيانات الخام الكاملة متاحة داخل المجلد: [persona.json](persona.json) · [food_diary.jsonl](food_diary.jsonl) · [workout_history.jsonl](workout_history.jsonl) · [messages.jsonl](messages.jsonl)*
`;
}

main().catch(err => {
  console.error('Fatal error in simulation runner:', err);
  process.exit(1);
});
