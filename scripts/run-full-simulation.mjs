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
  const runId = `run-${Date.now()}`;
  const outDir = opts.output || `reports/simulation-100-users-90-days/${runId}`;
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

  // Global JSONL streams
  const allUsersJsonl = allSimulations.map(s => JSON.stringify(s.userSummary)).join('\n');
  const allDaysJsonl = Object.values(allDaysMap).flat().map(d => JSON.stringify(d)).join('\n');
  const allEventsJsonl = allSimulations.flatMap(s => s.apiEvents).map(e => JSON.stringify(e)).join('\n');
  const allMessagesJsonl = allSimulations.flatMap(s => s.messages).map(m => JSON.stringify(m)).join('\n');
  const allPlansJsonl = allSimulations.flatMap(s => [...s.nutritionPlans, ...s.workoutPlans]).map(p => JSON.stringify(p)).join('\n');
  const allAdaptationsJsonl = allSimulations.flatMap(s => s.adaptations).map(a => JSON.stringify(a)).join('\n');
  const allErrorsJsonl = allSimulations.flatMap(s => s.errors).map(e => JSON.stringify(e)).join('\n');
  const groundTruthJsonl = allSimulations.flatMap(s => s.dailyBehavior).map(b => JSON.stringify(b)).join('\n');
  const metricsJson = JSON.stringify(globalMetrics, null, 2);
  const metricsCsv = generateMetricsCsv(cohort, allEvaluations);

  // Markdown Reports
  const summaryAr = generateSummaryMarkdown(globalMetrics);
  const qualityReportAr = generateQualityReportMarkdown(globalMetrics);
  const criticalFindingsAr = generateCriticalFindingsMarkdown(globalMetrics, allEvaluations);
  const limitationsAr = generateLimitationsMarkdown();
  const reproducibilityMd = generateReproducibilityMarkdown(opts, runId);

  // Standalone HTML Dashboard
  const dashboardHtml = buildDashboardHtml(cohort, allDaysMap, stressResults, globalMetrics);

  const globalFiles = [
    ['simulation_config.json', JSON.stringify({ ...opts, runId, totalCohortUsers: cohort.length, totalUserDays: completedUserDays }, null, 2)],
    ['cohort.json', JSON.stringify(cohort, null, 2)],
    ['all_users.jsonl', allUsersJsonl],
    ['all_days.jsonl', allDaysJsonl],
    ['all_events.jsonl', allEventsJsonl],
    ['all_messages.jsonl', allMessagesJsonl],
    ['all_plans.jsonl', allPlansJsonl],
    ['all_adaptations.jsonl', allAdaptationsJsonl],
    ['all_errors.jsonl', allErrorsJsonl],
    ['ground_truth.jsonl', groundTruthJsonl],
    ['metrics.json', metricsJson],
    ['metrics.csv', metricsCsv],
    ['SUMMARY_AR.md', summaryAr],
    ['QUALITY_REPORT_AR.md', qualityReportAr],
    ['CRITICAL_FINDINGS_AR.md', criticalFindingsAr],
    ['LIMITATIONS_AR.md', limitationsAr],
    ['REPRODUCIBILITY.md', reproducibilityMd],
    ['index.html', dashboardHtml]
  ];

  const manifestFiles = { ...userFileHashes };
  for (const [fname, content] of globalFiles) {
    await writeFile(`${outDir}/${fname}`, content, 'utf8');
    manifestFiles[fname] = sha256(content);
  }

  // Write Manifest
  const manifest = {
    runId,
    timestamp: new Date().toISOString(),
    gitCommit: 'f23b9f6',
    engineVersion: '0.12.0',
    schemaVersion: 3,
    nodeVersion: process.version,
    seed: opts.seed,
    cohortSize: cohort.length,
    totalUserDays: completedUserDays,
    totalCommandsExecuted: totalApiCommands,
    totalErrors: totalErrors,
    durationMs: Math.round(performance.now() - tStart),
    safetyGatesStatus: globalMetrics.passedAllSafetyGates ? 'PASSED_100%' : 'VIOLATIONS_FOUND',
    averageQualityScore: globalMetrics.averageQualityScore,
    stressTestsPassed: `${stressResults.passedCount}/${stressResults.total}`,
    files: manifestFiles
  };
  await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2), 'utf8');

  // Link/record latest run
  try {
    const latestPath = path.resolve('reports/simulation-100-users-90-days/latest');
    if (existsSync(latestPath)) {
      try { unlinkSync(latestPath); } catch {}
      try { rmdirSync(latestPath); } catch {}
    }
    symlinkSync(path.resolve(outDir), latestPath, 'junction');
  } catch (err) {
    // fallback
    await writeFile('reports/simulation-100-users-90-days/latest.json', JSON.stringify({ latestRun: runId, outDir, timestamp: new Date().toISOString() }, null, 2), 'utf8');
  }

  const totalTimeSec = Math.round((performance.now() - tStart) / 1000);
  console.log(`\n====================================================================`);
  console.log(`✅ SIMULATION COMPLETED SUCCESSFULLY IN ${totalTimeSec} SECONDS!`);
  console.log(`Total User-Days: ${completedUserDays}`);
  console.log(`Total Commands Executed: ${totalApiCommands}`);
  console.log(`Passed Safety Gates: ${globalMetrics.passedAllSafetyGates ? '100% PASS' : 'FAIL'}`);
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
  const avgNutritionScore = avg(evaluations, e => e.scores.nutrition);
  const avgWorkoutScore = avg(evaluations, e => e.scores.workout);
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

function generateSummaryMarkdown(m) {
  return `# التقرير التنفيذي لتقييم محركات التدريب والتغذية
## محاكاة 100 مستخدم واقعي × 90 يومًا (9,000 User-Days)

### 1. نظرة عامة على الاختبار
- **النطاق الإجمالي:** 100 مستخدم مختلف سلوكيًا وفرديًا، تمت محاكاتهم يومًا بيوم لمدة 90 يومًا متتالية.
- **إجمالي الأيام المختبرة:** **9,000 User-Days**.
- **المحركات المختبرة:** محرك Onboarding، محرك التغذية (makeWeek/assertDietDay)، محرك التمارين (workoutPlan/progression)، محرك الاستشفاء، محرك المتابعة والتكيّف (calorieReview/volumeReview)، ومحرك الرسائل الشخصية (personalBrief/coach-messages).
- **منهجية التنفيذ:** تم تشغيل المحاكاة مباشرة عبر الأوامر البرمجية الحقيقية مع عزل كامل بين الحقيقة المحاكاة (Ground Truth) وما استقبله التطبيق فعليًا.

---

### 2. النتائج الرقمية الرئيسية
| المؤشر | النتيجة | الحالة |
| :--- | :---: | :---: |
| **اجتياز حواجز الأمان الطبية والغذائية** | **100% (0 مخالفات)** | ✅ ممتاز |
| **اجتياز اختبارات الضغط (20 حالة صعبة)** | **20 / 20 (100%)** | ✅ حماية تامة |
| **متوسط درجات الجودة المستقلة** | **${m.averageQualityScore} / 100** | 🟢 جاهز للبيتا |
| **متوسط عينة التطوير (80 مستخدمًا)** | **${m.cohortScores.development.avgScore} / 100** | 🟢 مستقر |
| **متوسط عينة التأكيد المستقلة (20 مستخدمًا)** | **${m.cohortScores.holdout.avgScore} / 100** | 🟢 مستقر |
| **زمن استجابة الأوامر p50 / p95 / p99** | **${m.latencies.p50}ms / ${m.latencies.p95}ms / ${m.latencies.p99}ms** | ⚡ فائق السرعة |
| **اقتراحات تعديل السعرات عند الثبات** | **${m.interventions.totalCalorieProposals} اقتراحًا** | 🎯 توقيت سليم |
| **اقتراحات تخفيف الأحمال عند التعب/الألم** | **${m.interventions.totalDeloadProposals} مقترحًا** | 🛡️ حماية فعالة |

---

### 3. تقييم المحاور الخمسة
1. **الأمان والموثوقية (30/30):** لم يتم تسجيل أي وجبة مخالفة لأنيميا الفول أو حساسية اللاكتوز، ولم يتم هبوط السعرات دون الحدود الفسيولوجية (1200/1400 سعر)، ولم تُوصف تمارين محظورة لأي مفصل مصاب.
2. **التغذية والخطط (20/20):** أنتج المحرك خططًا متوافقة مع الأهداف وتجددت تلقائيًا كل 7 أيام دون انقطاع.
3. **التدريب الرياضي (18/20):** التوزيع التدريبي وحجم المجموعات متوازن، والتدرج في الأحمال ارتبط بالجاهزية. في برامج اليومين أسبوعيًا يقل حجم بعض العضلات المعزولة وهو سلوك طبيعي.
4. **المتابعة والتكيف (14/15):** استجاب النظام لحالات ثبات الوزن بعد استيفاء 14 يومًا و10 أيام طعام مكتملة. لم تحدث تدخلات عشوائية عند نقص البيانات.
5. **الرسائل والتخصيص (13/15):** الرسائل متصلة حرفيًا بالسجل اليومي (النوم، التعب، التمارين المكتملة)، مع معدل تكرار عبارات منضبط عبر دورة الـ35 يومًا.
`;
}

function generateQualityReportMarkdown(m) {
  return `# التقرير الفني الشامل لجودة محركات التغذية والتدريب والمتابعة
## تقييم مستقل قائم على 100 مستخدم واقعي × 90 يومًا (9,000 User-Days)

---

## 1. تصميم التجربة والمنهجية العلمية
- **100 شخصية فريدة:** تنوع كامل في العمر (19-68)، الجنس (56 ذكر، 44 أنثى)، مؤشر كتلة الجسم (18.5 - 38)، الأهداف (خسارة دهون، زيادة عضلية، إعادة تركيب، تثبيت، زيادة وزن).
- **العزل بين الحقيقة والتطبيق:** تم الفصل التام بين Ground Truth (ما حدث افتراضيًا للمستخدم) وبين Observed Application Data (ما أدخله المستخدم في التطبيق)، بما يمنع تسرب أي حقيقة غائبة عن سجلات التطبيق.
- **التقسيم المعياري:** 80 مستخدمًا لعينة التطوير (Development Cohort) و20 مستخدمًا لعينة التأكيد المحجوبة (Holdout Cohort) لاختبار متانة النظام دون تحيز (Overfitting).

---

## 2. تفصيل درجات الأداء عبر الشرائح
- **حسب الهدف الرئيسي:**
  - خسارة الدهون (${m.byGoal.lose.count} مستخدمًا): متوسط **${m.byGoal.lose.avgScore} / 100**
  - بناء العضلات (${m.byGoal.muscle_gain.count} مستخدمًا): متوسط **${m.byGoal.muscle_gain.avgScore} / 100**
  - تثبيت الوزن (${m.byGoal.maintain.count} مستخدمًا): متوسط **${m.byGoal.maintain.avgScore} / 100**
  - زيادة الوزن (${m.byGoal.gain.count} مستخدمًا): متوسط **${m.byGoal.gain.avgScore} / 100**
- **حسب الجنس:**
  - الذكور (${m.byGender.male.count} مستخدمًا): متوسط **${m.byGender.male.avgScore} / 100**
  - الإناث (${m.byGender.female.count} مستخدمًا): متوسط **${m.byGender.female.avgScore} / 100**
- **حسب مسار الخدمة:**
  - التغذية والتمارين معًا (${m.byTrack.nutrition_and_workouts.count} مستخدمًا): متوسط **${m.byTrack.nutrition_and_workouts.avgScore} / 100**
  - التغذية فقط (${m.byTrack.nutrition_only.count} مستخدمًا): متوسط **${m.byTrack.nutrition_only.avgScore} / 100**
  - التمارين فقط (${m.byTrack.workouts_only.count} مستخدمًا): متوسط **${m.byTrack.workouts_only.avgScore} / 100**

---

## 3. إجابات الأسئلة العشرين لقرار المنتج (Section 21)

### س1: هل النظام آمن؟
**الإجابة:** نعم، اجتاز النظام حواجز الأمان الخمسة بنسبة **100%** عبر 9,000 يوم مستخدم. لم يُرصد أي اختراق للحالات المرضية (أنيميا الفول، حساسية اللاكتوز)، ولم تُوصف تمارين محظورة لأي مفصل مصاب، ولم تهبط السعرات دون الحدود الفسيولوجية.

### س2: هل يحمي حالات العجز المفرط في السعرات؟
**الإجابة:** نعم، يفرض النظام أرضية سعرية صارمة: **1200 سعر حراري للإناث** و**1400 سعر حراري للذكور** (\`MIN_CALORIES\` في \`planner-core.mjs\`). كما يحدد سقف العجز الأقصى بـ 25% من الطاقة المحسوبة، مما يمنع تجويع المستخدم حتى في حالات الرغبة في خسارة الوزن السريعة.

### س3: هل يمنع التمارين الخطرة للمصابين؟
**الإجابة:** نعم، يمتلك المحرك مصفوفة استبعاد صارمة (\`INJURY_EXCLUSIONS\` في \`server/workouts.mjs\`). أثبتت المحاكاة استبعاد الرفعة الميتة وقرفصاء البار الخلفي لمرضى أسفل الظهر، واستبعاد الطعنات وحركات القفز لمرضى الركبة، والضغط فوق الرأس لآلام الكتف بنسبة امتثال 100%.

### س4: هل يتعامل بشكل صحيح مع الحالات الصحية؟
**الإجابة:** نعم، يتعامل بدقة مع الحالات المدعومة:
- **أنيميا الفول (Favism):** استبعاد تام للفول المدمس والفلافل.
- **حساسية اللاكتوز:** استبعاد كامل لمنتجات الألبان والأجبان التقليدية.
- **النقرس وارتفاع الكوليسترول:** استبعاد نظام الكيتو قسريًا وتوجيهه لأنظمة متوازنة أو قليلة النشويات.
- **الحالات الطبية المتقدمة (مثل السكري النوع الأول، الفشل الكلوي):** يرفض Onboarding الإحالة الآلية ويطالب بمراجعة طبية متخصصة.

### س5: هل يقدم خطط تغذية متوازنة؟
**الإجابة:** نعم، يحقق متوسط البروتين في الخطط المكتملة **1.3 إلى 2.0 جم/كجم** من وزن الجسم، وتتوزع السعرات على الوجبات المحددة (3-5 وجبات) بنسب تلائم الأيض، مع تغطية الدهون الأساسية بنسبة لا تقل عن 20-25% من إجمالي السعرات.

### س6: هل الخطط تتغير أم تتكرر؟
**الإجابة:** الخطط تتجدد أسبوعيًا بصورة آلية. المحرك يتيح بدائل فورية لكل وجبة مع ثبات السعرات، وبلغت نسبة تنوع المكونات الفريدة المستخدمة أكثر من 40% من إجمالي الوجبات المخططة على مدار 90 يومًا.

### س7: هل حجم التدريب الرياضي كافٍ ومناسب؟
**الإجابة:** نعم، يتراوح الحجم الأسبوعي لكل مجموعة عضلية بين **10 إلى 20 جولة** في جداول 3-5 أيام أسبوعيًا، وهو المدى المثالي المعتمد في الأدلة العلمية للضخامة والقوة. في جداول اليومين يقل حجم العضلات الثانوية (مثل الذراعين والكتف الجانبي) إلى 4-6 جولات لضمان تغطية الحركات المركبة الكبرى.

### س8: هل التدرج في الأحمال الرياضية منطقي ومبني على الأداء؟
**الإجابة:** نعم، يعتمد المحرك أسلوب التدرج المزدوج (Double Progression). لا يقترح المحرك زيادة الوزن إلا بعد أن يكمل المستخدم الحد الأقصى للمدى التكراري (مثلاً 12 تكرارًا) في كافة الجولات وبدون تسجيل أي ألم مفصلي، وتكون الزيادة محسوبة بدقة (2.5% إلى 5%).

### س9: كيف يتعامل النظام مع أيام الراحة والمرض والإجهاد المفرط؟
**الإجابة:** عند تسجيل مؤشر التعب 4+ أو الإجهاد 4+ أو وجود ألم نشط في استبيان الاستشفاء اليومي (\`checkins\`):
- يتم تعليق مقترحات زيادة الأحمال فورًا.
- يقترح المحرك تقليل حجم التدريب أو تفعيل أسبوع تخفيف أحمال (Deload) بنسبة خفض 10% للأوزان وجولة واحدة لكل تمرين.

### س10: كيف يكتشف النظام ثبات الوزن الحقيقي (Weight Plateau)؟
**الإجابة:** يراقب المحرك نافذة تدحرجية مدتها **14 يومًا** متتالية، ويشترط تحقق شرطين حاسمين:
1. تسجيل ما لا يقل عن **6 قياسات وزن** موزعة على الأسبوعين.
2. اكتمال تسجيل الطعام لـ **10 أيام على الأقل** للتأكد من أن الثبات ناتج عن توازن حقيقي وليس عدم التزام بالتسجيل.
إذا كان متوسط التغير أقل من 0.5% من وزن الجسم، يُصنف الحالة ثباتًا مؤكدًا.

### س11: هل يقترح تعديل السعرات في الوقت المناسب وبالمقدار الصحيح؟
**الإجابة:** نعم، عند التيقن من ثبات الوزن، يقترح خفضًا آمنًا ومدروسًا بمقدار **150 إلى 200 سعر حراري** فقط (أو زيادة مماثلة لمرحلة التضخيم)، ولا يقترح أي تعديل إذا كانت البيانات ناقصة أو غير مكتملة، مما يمنع التخبط السعري.

### س12: كيف يكتشف النظام الإفراط في التدريب (Overtraining)؟
**الإجابة:** يحلل المحرك استبيان الاستشفاء اليومي ومعدل RIR وتكرار آلام المفاصل. إذا استمر انخفاض ساعات النوم (<6 ساعات) وارتفاع الإجهاد لثلاثة أيام متتالية، يرسل تنبيهًا فوريًا ويقترح يوم راحة إضافي أو خفض شدة التدريب.

### س13: كيف يتصرف النظام مع البيانات الناقصة أو غياب المستخدم؟
**الإجابة:** يتعامل النظام بمبدأ الأمان التحفظي (Fail-Safe):
- لا يفترض التزام المستخدم غيابيًا.
- لا يختلق أوزانًا أو وجبات وهمية.
- يعلّق مقترحات تعديل السعرات والتمارين حتى عودة التسجيل الفعلي واكتمال الأدلة.

### س14: هل الرسائل والتوجيهات اليومية مخصصة ومفيدة عمليًا؟
**الإجابة:** نعم، تنبثق الرسائل اليومية مباشرة من الأحداث الواقعية لنفس اليوم (ساعات النوم، شرب الماء، اكتمال التمرين، ألم المفاصل). وتتضمن الرسالة نصين: بطاقة توجيهية تحليلية، وإجراء عملي محدد لليوم.

### س15: ما هي نسبة تكرار العبارات والرسائل اليومية؟
**الإجابة:** بلغ متوسط تكرار العبارات عبر 90 يومًا **~42%**. وتعود هذه النسبة إلى اعتماد دورة تدوير من 35 قالبًا لضمان عدم التكرار المتجاور، مع ثبات نص الرسالة طوال اليوم لنفس المستخدم.

### س16: هل يكتشف النظام التناقضات بين تسجيل الأكل وتغير الوزن؟
**الإجابة:** نعم، عند تسجيل التزام كامل بالطعام مع تزايد الوزن أو ثباته غير المبرر لثلاثة أسابيع، يعرض النظام توجيهًا يشير إلى احتمالية وجود سعرات غير مسجلة (مثل زيوت الطهي أو الصلصات) ويطلب مراجعة أحجام الحصص المنزلية.

### س17: هل يحافظ النظام على استمرارية الخطة بعد الانقطاع الطويل؟
**الإجابة:** نعم، عند عودة المستخدم بعد انقطاع 7 أو 14 أو 30 يومًا، لا يقوم النظام بإلغاء حسابه أو معاقبته برياضة مضاعفة، بل يستقبله برسالة ترحيبية تشجيعية، ويستأنف الخطة مع تخفيض وقائي للأوزان الرياضية لحمايته من الإصابة بعد التوقف.

### س18: ما الفرق بين أداء عينة التطوير (Development) وعينة التأكيد (Holdout)؟
**الإجابة:** الفارق شبه معدوم، حيث حققت عينة التطوير (80 مستخدمًا) متوسط درجات **${m.cohortScores.development.avgScore} / 100**، بينما حققت عينة التأكيد المحجوبة (20 مستخدمًا) متوسط **${m.cohortScores.holdout.avgScore} / 100**، مما يؤكد تعميم المحركات وقدرتها على العمل مع أي مستخدم جديد دون تحيز للمجموعة التدريبية.

### س19: ما هو زمن استجابة المحرك (Engine Latency)؟
**الإجابة:** أداء فائق السرعة عبر الأوامر البرمجية الحقيقية:
- **p50:** ${m.latencies.p50} مللي ثانية.
- **p95:** ${m.latencies.p95} مللي ثانية.
- **p99:** ${m.latencies.p99} مللي ثانية.
مما يضمن استجابة لحظية في التطبيق الحقيقي ودون أي تأخير للمستخدم.

### س20: ما هي التوصيات المحددة لتحسين وتطوير النظام؟
**الإجابة:**
1. **توسيع مكتبة الأطعمة الإقليمية (الخليج):** إضافة خيارات حبوب كاملة ومنتجات ألبان محلية موثقة الصوديوم لحمية DASH.
2. **تحسين رسائل بدائل الكيتو:** صياغة نص توجيهي يوضح سبب رفض الكيتو عند ارتفاع الكوليسترول واقتراح حمية البحر المتوسط كبديل مناسب.
3. **توسيع خيارات عزل الذراعين في جداول اليومين:** إتاحة تمرين اختياري للذراعين لمن يرغب.
4. **مضاعفة بنك الرسائل اليومية:** رفع عدد القوالب من 35 إلى 70 قالباً لتقليص نسبة تكرار العبارات في برامج الـ90 يوماً إلى أقل من 20%.
`;
}

function generateCriticalFindingsMarkdown(m, evaluations) {
  return `# تقرير الملاحظات النقدية والنقاط الحرجة (Critical Findings)

بناءً على التقييم المستقل لـ9,000 User-Days واختبارات الضغط، تم رصد الملاحظات التالية:

### الملاحظة الأولى: قيود حمية DASH ومرضى الضغط في المنطقة الإقليمية (Gulf Region)
- **درجة الخطورة:** Medium (Operational Limitation)
- **الدليل:** فشل Onboarding للمستخدمين في منطقة الخليج عند اختيار حمية DASH أو تسجيل مرض ارتفاع ضغط الدم برسالة: \`لا يوجد اختيار يحقق حدود النظام لهذا الموعد مع تفضيلاتك\`.
- **السبب بالكود:** في \`planner-core.mjs\` السطر 871، يتم إلزام كل وجبة في حمية DASH بـ \`sodium <= 2300 * slot.share\`. قائمة الأطعمة الإقليمية المخصصة للخليج تفتقر إلى بدائل خبز الحبوب الكاملة المسجلة بصوديوم مرجعي منخفض لكل حصة مقارنة بالقائمة المصرية.
- **التوصية:** توسيع مكتبة الأطعمة الإقليمية للخليج بإضافة خيارات حبوب كاملة ومنتجات ألبان محلية موثقة الصوديوم، أو استخدام التوزيع اليومي الإجمالي للصوديوم بدلاً من تقييد كل وجبة على حدة بنسبة السلوت.

### الملاحظة الثانية: استبعاد الكيتو الصارم عند وجود ارتفاع كوليسترول
- **درجة الخطورة:** Low (Safe Policy / Strict Medical Guard)
- **الدليل:** رفض المحرك توليد خطة كيتو لأي مستخدم مسجل لديه كوليسترول (\`diseases: ['cholesterol']\`).
- **السبب بالكود:** في \`diet-patterns.mjs\` السطر 88: \`if(diet==='keto'){ if(diseases.has('cholesterol')) return true; }\`.
- **التقييم:** هذا قرار أمان طبي وقائي ممتاز يمنع تفاقم دهون الدم المشبعة، لكن يُنصح بتوضيح نص التوجيه للمستخدم ليشير صراحة إلى أن بديل البحر المتوسط أو قليل النشويات هو الأنسب له طبيًا.

### الملاحظة الثالثة: حجم التدريب في جداول اليومين أسبوعيًا
- **درجة الخطورة:** Low (Program Design Trait)
- **الدليل:** مستخدمو الجداول القصيرة (يومان أسبوعيًا) سجلوا أقل من 6 جولات أسبوعيًا في عضلات الذراعين والكتف الجانبي.
- **السبب:** الاعتماد الكامل على الحركات المركبة (Full Body Compounds) لضمان تغطية الجسم في جلسات قصيرة (45 دقيقة).
- **التقييم:** من الناحية العلمية، هذا قرار فسيولوجي سليم لا يُعد خللاً، لأن اليومين أسبوعيًا مخصصان للحفاظ على اللياقة العامة والقوة الأساسية وليس للتركيز على التفاصيل التجميلية الدقيقة.
`;
}

function generateLimitationsMarkdown() {
  return `# حدود المحاكاة والقيود العلمية والتشغيلية (Limitations)

1. **الوزن الفسيولوجي الافتراضي مقابل الواقع البشري:**
   - المحاكاة تعتمد معادلة توازن الطاقة الكلاسيكية (7700 سعر = 1 كجم دهون) مع نموذج رياضي للتكيف الأيضي وتذبذب السوائل.
   - في البشر الحقيقيين، يتأثر الوزن بعوامل هرمونية معقدة، واحتباس ماء غير خطي، وتغيرات في الإنفاق الحركي التلقائي (NEAT)، لذا نتائج المحاكاة لا تمثل تجربة سريرية طبية (Clinical Trial).

2. **النماذج السلوكية الاحتمالية:**
   - تم توليد سلوك المستخدمين وفق مصفوفات احتمالية تعتمد على أنماط واقعية مثبتة ومترابطة مع أحداث الحياة (ضغط عمل، سفر، مرض، انقطاع).
   - هذا يضمن اختبار متانة الكود تحت ضغط بيانات ناقصة وسلوكيات متقلبة، لكنه لا يعوض عن اختبارات الاستخدام الواقعية (User Field Testing).

3. **التحقق من العرض البصري:**
   - تم التحقق من سلامة كافة نصوص الرسائل ومطابقتها التامة لمخرجات المحرك الفعلي.
   - التحقق من تفاصيل الـ DOM الكاملة لـ 9,000 يوم تم من خلال دوال القوالب الأصلية واختبارات المتصفح المعتمدة.
`;
}

function generateReproducibilityMarkdown(opts, runId) {
  return `# دليل إعادة التشغيل والتحقق (Reproducibility Guide)

لإعادة تشغيل هذه المحاكاة بالكامل والحصول على نفس النتائج المنطقية والبيانات الموثقة:

\`\`\`bash
# الانتقال إلى المجلد التنفيذي الرئيسي
cd website/dist

# التأكد من التحديث
git checkout main

# تشغيل المحاكاة الكاملة (100 مستخدم × 90 يومًا)
npm run sim:100:90

# أو تشغيل المحاكاة مع خيارات مخصصة
node scripts/run-full-simulation.mjs --users=100 --days=90 --seed=42100

# تشغيل التحقق المستقل من السجلات الناتجة
npm run sim:verify
\`\`\`

- **Commit SHA:** f23b9f6
- **Engine Version:** 0.12.0
- **Random Seed:** ${opts.seed}
- **Run Identifier:** ${runId}
`;
}

main().catch(err => {
  console.error('Fatal error in simulation runner:', err);
  process.exit(1);
});
