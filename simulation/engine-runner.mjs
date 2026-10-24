// Real Engine Runner: Orchestrates simulation execution on real application engines.
// Connects Personas and Behavioral Model to `server/coaching.mjs` and `server/simulation.mjs`.
// Executes all operations inside `withClock(simulationTime(s))`.

import { empty, generate, command } from '../server/coaching.mjs';
import { simulationCommand, simulationSummary } from '../server/simulation.mjs';
import { withClock, simulationTime, clockDate, isoNow, clockNow } from '../server/clock.mjs';
import { activePlan, dayTotals } from '../server/food.mjs';
import { personalBrief } from '../personal-brief.mjs';
import { scheduledSessions } from '../server/workouts.mjs';
import { localDate, dateOffset } from '../coaching-shared.mjs';
import { createBehavioralState, simulateUserDay } from './behavioral-engine.mjs';

export async function runUserSimulation(user, totalDays = 90, seed = 42100) {
  const startTime = performance.now();
  const userState = createBehavioralState(user, seed);

  // Data recording containers for this user
  const nutritionPlans = [];
  const workoutPlans = [];
  const dailyBehavior = [];
  const dailyAppState = [];
  const foodDiary = [];
  const workoutHistory = [];
  const healthTracking = [];
  const messages = [];
  const adaptations = [];
  const apiEvents = [];
  const errors = [];

  let s = empty();
  const startDate = localDate(Date.now(), user.timezone);

  // Phase 1: Real Onboarding
  const t0Onboard = performance.now();
  let onboardingResult = null;
  try {
    s = generate(s, user.onboardingDraft);
    s.revision = 1;
    // Initialize simulation session on current real account
    s.simulation = {
      runId: crypto.randomUUID(),
      day: 1,
      startedDate: startDate,
      source: 'current',
      history: [],
      scenarioByDate: {}
    };

    onboardingResult = {
      success: true,
      initialPlanId: s.active_plan_id,
      workoutPlanId: s.workoutPlan?.id,
      latencyMs: Math.round(performance.now() - t0Onboard)
    };

    if (s.plans.length) {
      nutritionPlans.push({
        version: 1,
        day: 1,
        date: startDate,
        plan: structuredClone(s.plans[0])
      });
    }
    if (s.workoutPlan) {
      workoutPlans.push({
        version: s.workoutPlan.version || 1,
        day: 1,
        date: startDate,
        workoutPlan: structuredClone(s.workoutPlan)
      });
    }

    apiEvents.push({
      day: 1,
      action: 'generate',
      status: 'success',
      revision: s.revision,
      latencyMs: Math.round(performance.now() - t0Onboard)
    });
  } catch (err) {
    onboardingResult = {
      success: false,
      error: err.message,
      latencyMs: Math.round(performance.now() - t0Onboard)
    };
    errors.push({
      day: 1,
      action: 'generate',
      error: err.message,
      at: isoNow()
    });
    return {
      user,
      onboardingResult,
      totalDaysExecuted: 0,
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
    };
  }

  // Phase 2: Run Days 1 to totalDays
  for (let day = 1; day <= totalDays; day++) {
    await withClock(simulationTime(s), async () => {
      const currDate = clockDate();
      const planBefore = s.active_plan_id;
      const workoutPlanBefore = s.workoutPlan?.id;

      // 1. Behavioral simulation decision for this day
      const dailySim = simulateUserDay(user, userState, s, day, currDate);
      dailyBehavior.push(dailySim.groundTruth);

      // 2. Execute commands generated for today
      for (const cmd of dailySim.commandsToExecute) {
        const t0Cmd = performance.now();
        try {
          s = command(s, cmd.action, cmd.payload);
          s.revision++;
          const latencyMs = Math.round((performance.now() - t0Cmd) * 100) / 100;

          apiEvents.push({
            day,
            date: currDate,
            action: cmd.action,
            payload: cmd.payload,
            revision: s.revision,
            status: 'success',
            latencyMs
          });

          // Track specific logs
          if (cmd.action === 'food_entry') {
            foodDiary.push({ day, date: currDate, entry: cmd.payload, at: isoNow() });
          } else if (cmd.action === 'workout') {
            workoutHistory.push({ day, date: currDate, sets: cmd.payload, at: isoNow() });
          } else if (['recovery', 'weight', 'water'].includes(cmd.action)) {
            healthTracking.push({ day, date: currDate, type: cmd.action, data: cmd.payload, at: isoNow() });
          }
        } catch (err) {
          const latencyMs = Math.round((performance.now() - t0Cmd) * 100) / 100;
          errors.push({
            day,
            date: currDate,
            action: cmd.action,
            error: err.message,
            payload: cmd.payload,
            at: isoNow()
          });
          apiEvents.push({
            day,
            date: currDate,
            action: cmd.action,
            payload: cmd.payload,
            revision: s.revision,
            status: 'error',
            error: err.message,
            latencyMs
          });
        }
      }

      // 3. Daily or Periodic Review Execution
      const t0Review = performance.now();
      try {
        s = command(s, 'review', {});
        s.revision++;
        apiEvents.push({
          day,
          date: currDate,
          action: 'review',
          revision: s.revision,
          status: 'success',
          latencyMs: Math.round((performance.now() - t0Review) * 100) / 100
        });
      } catch (err) {
        errors.push({ day, date: currDate, action: 'review', error: err.message, at: isoNow() });
      }

      // 4. Evaluate Pending Adaptations
      const pending = (s.adaptations || []).filter(a => a.status === 'pending');
      for (const a of pending) {
        let accept = true;
        if (a.kind === 'calories') {
          accept = userState.prng.bool(user.behavior.acceptCalorieAdaptation);
        } else if (a.kind === 'recovery') {
          accept = userState.prng.bool(user.behavior.acceptVolumeAdaptation);
        } else if (a.kind === 'weekly_volume') {
          accept = userState.prng.bool(user.behavior.acceptVolumeAdaptation);
        }

        const t0Adapt = performance.now();
        const beforeEnergy = activePlan(s)?.targets?.energy;
        const beforeWeeklySets = s.workoutPlan?.weeklySets;

        try {
          s = command(s, 'adaptation', { id: a.id, accept });
          s.revision++;
          adaptations.push({
            day,
            date: currDate,
            adaptationId: a.id,
            kind: a.kind,
            reason: a.reason,
            reasonCode: a.reasonCode,
            accepted: accept,
            beforeEnergy,
            afterEnergy: activePlan(s)?.targets?.energy,
            beforeWeeklySets,
            afterWeeklySets: s.workoutPlan?.weeklySets,
            at: isoNow()
          });
          apiEvents.push({
            day,
            date: currDate,
            action: 'adaptation',
            payload: { id: a.id, accept },
            revision: s.revision,
            status: 'success',
            latencyMs: Math.round((performance.now() - t0Adapt) * 100) / 100
          });
        } catch (err) {
          errors.push({ day, date: currDate, action: 'adaptation', error: err.message, at: isoNow() });
        }
      }

      // 5. Check if plans changed or renewed
      if (s.active_plan_id !== planBefore) {
        const cur = s.plans.find(p => p.id === s.active_plan_id);
        if (cur) {
          nutritionPlans.push({
            version: nutritionPlans.length + 1,
            day,
            date: currDate,
            reason: cur.changeReason || 'خطة جديدة',
            plan: structuredClone(cur)
          });
        }
      }
      if (s.workoutPlan?.id !== workoutPlanBefore) {
        workoutPlans.push({
          version: s.workoutPlan.version || (workoutPlans.length + 1),
          day,
          date: currDate,
          workoutPlan: structuredClone(s.workoutPlan)
        });
      }

      // 6. Capture Exact Rendered Messages
      const notes = personalBrief(s, currDate);
      for (const n of notes) {
        messages.push({
          userId: user.id,
          day,
          date: currDate,
          messageId: `${user.id}-d${day}-${n.role}-${n.key}`,
          messageType: `specialist_${n.role}`,
          role: n.role,
          key: n.key,
          priority: n.priority,
          exactText: n.text,
          actionText: n.action,
          reasonCode: n.key.toUpperCase(),
          trigger: `state_observation_day_${day}`,
          sourceFileOrFunction: 'personal-brief.mjs#personalBrief',
          engineStateRevision: s.revision,
          generatedAt: isoNow(),
          visibleAt: isoNow(),
          wasActuallyRendered: dailySim.opensApp, // rendered when user opened app
          relatedPlanId: s.active_plan_id,
          relatedDecisionId: s.lastReview?.reasonCode || null
        });
      }

      if (s.lastReview?.message) {
        messages.push({
          userId: user.id,
          day,
          date: currDate,
          messageId: `${user.id}-d${day}-review-msg`,
          messageType: 'review_guidance',
          role: 'system_review',
          key: s.lastReview.reasonCode || 'REVIEW',
          priority: 'normal',
          exactText: s.lastReview.message,
          actionText: s.lastReview.nutrition?.reason || s.lastReview.volume?.reason || '',
          reasonCode: s.lastReview.reasonCode || 'REVIEW',
          trigger: 'weekly_or_daily_review',
          sourceFileOrFunction: 'server/coaching.mjs#review',
          engineStateRevision: s.revision,
          generatedAt: isoNow(),
          visibleAt: isoNow(),
          wasActuallyRendered: dailySim.opensApp,
          relatedPlanId: s.active_plan_id,
          relatedDecisionId: s.lastReview.reasonCode || null
        });
      }

      // 7. End-of-Day App State Snapshot
      const summary = simulationSummary(s);
      dailyAppState.push({
        day,
        date: currDate,
        revision: s.revision,
        activePlanId: s.active_plan_id,
        workoutPlanId: s.workoutPlan?.id,
        energyLogged: summary.energy,
        proteinLogged: summary.protein,
        foodComplete: summary.foodComplete,
        targetEnergy: summary.targetEnergy,
        weightLogged: summary.weight,
        recoveryStatus: summary.recovery,
        recoveryLogged: summary.recoveryLogged,
        scheduledSessionsCount: summary.scheduled.length,
        sessionsDone: summary.sessions,
        lastReviewNutrition: s.lastReview?.nutrition?.action || 'none',
        pendingAdaptationsCount: (s.adaptations || []).filter(a => a.status === 'pending').length
      });

      // 8. Advance Virtual Clock to Next Day
      if (day < totalDays) {
        s = simulationCommand(s, 'simulation_next');
        s.revision++;
      }
    });
  }

  // Calculate final summary metrics
  const elapsedMs = Math.round(performance.now() - startTime);
  const userSummary = {
    userId: user.id,
    name: user.name,
    cohort: user.cohort,
    archetype: user.archetype,
    goal: user.goal,
    startWeight: user.weight,
    endBioWeight: userState.currentBioWeight,
    deltaWeightKg: Math.round((userState.currentBioWeight - user.weight) * 100) / 100,
    totalDays: totalDays,
    totalCommandsExecuted: apiEvents.length,
    successfulCommands: apiEvents.filter(e => e.status === 'success').length,
    failedCommands: errors.length,
    totalMessagesGenerated: messages.length,
    renderedMessagesCount: messages.filter(m => m.wasActuallyRendered).length,
    nutritionPlansCount: nutritionPlans.length,
    workoutPlansCount: workoutPlans.length,
    adaptationsProposed: adaptations.length,
    adaptationsAccepted: adaptations.filter(a => a.accepted).length,
    foodCompleteDaysCount: dailyAppState.filter(d => d.foodComplete).length,
    weightsLoggedCount: healthTracking.filter(h => h.type === 'weight').length,
    waterLogsCount: healthTracking.filter(h => h.type === 'water').length,
    checkinsCount: healthTracking.filter(h => h.type === 'recovery').length,
    workoutsCompletedCount: workoutHistory.length,
    elapsedMs
  };

  return {
    user,
    userSummary,
    totalDaysExecuted: totalDays,
    onboardingResult,
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
  };
}
