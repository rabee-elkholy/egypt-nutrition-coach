// Behavioral Simulation Engine: Simulates daily human actions for 90 days.
// Maintains stateful memory (fatigue, soreness, adherence streaks, lifestyle events)
// Enforces strict separation between Ground Truth and Observed Application Data.

import { createPRNG } from './prng.mjs';
import { activePlan } from '../server/food.mjs';
import { mealAlternatives } from '../server/food.mjs';
import { scheduledSessions, exerciseAlternatives } from '../server/workouts.mjs';
import { usesKg } from '../exercise-load.mjs';
import { dateOffset } from '../coaching-shared.mjs';

export function createBehavioralState(user, seed = 777) {
  const prng = createPRNG(seed + ':' + user.id);

  // Biological ground truth initial state
  const bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age + (user.sex === 'male' ? 5 : -161);
  const actMultipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  const baseTdee = Math.round(bmr * (actMultipliers[user.dailyActivity] || 1.35));

  return {
    prng,
    currentBioWeight: user.weight,
    baseTdee,
    fatigue: 1, // 1 to 5
    sleepQuality: 4, // 1 to 5
    accumulatedFatigue: 0,
    consecutiveActiveDays: 0,
    consecutiveMissedDays: 0,
    painFlareUp: false,
    painJoint: user.injuries.length && user.injuries[0] !== 'none' ? user.injuries[0] : null,
    sorenessByMuscle: {
      chest: 0, back: 0, quads: 0, hamstrings: 0, shoulders: 0, arms: 0, core: 0
    },
    exerciseLoadProgression: {}, // exerciseId -> lastLoad
    history: []
  };
}

// Generate the ground truth and observed actions for a single day
export function simulateUserDay(user, userState, appState, dayNumber, dateStr) {
  const prng = userState.prng;
  const b = user.behavior;

  // 1. Check active lifestyle events for this day
  const activeEvents = user.lifestyleEvents.filter(e => dayNumber >= e.startDay && dayNumber <= e.endDay);
  const isHiatus = activeEvents.some(e => e.type === 'hiatus_dropout');
  const isIll = activeEvents.some(e => e.type === 'mild_illness');
  const isVacation = activeEvents.some(e => e.type === 'vacation_travel');
  const isWorkCrunch = activeEvents.some(e => e.type === 'work_crunch');
  const isPlateau = activeEvents.some(e => e.type === 'metabolic_plateau');

  // 2. Decide if user opens the app today
  let appOpenProb = b.baseAdherence;
  if (isHiatus) appOpenProb = 0.05;
  else if (isIll) appOpenProb = 0.35;
  else if (isVacation) appOpenProb = 0.40;
  else if (isWorkCrunch) appOpenProb = Math.max(0.3, b.baseAdherence - 0.35);

  const opensApp = prng.bool(appOpenProb);

  // 3. Ground Truth Sleep & Recovery
  let sleepHours = user.typicalSleepHours + prng.normal(0, 0.6);
  if (isWorkCrunch) sleepHours -= 1.8;
  if (isIll) sleepHours = prng.pick([9.0, 5.0]); // either sick in bed or restless
  sleepHours = Math.round(Math.max(3.5, Math.min(11.0, sleepHours)) * 10) / 10;

  let sleepQuality = sleepHours >= 7 ? prng.int(3, 5) : prng.int(1, 3);
  let fatigue = sleepHours < 6 ? prng.int(3, 5) : (userState.accumulatedFatigue > 12 ? prng.int(3, 4) : prng.int(1, 2));
  let stress = isWorkCrunch ? prng.int(4, 5) : prng.int(1, 3);

  // Pain flare-up logic
  let hasPain = false;
  let painRegions = [];
  if (userState.painJoint) {
    // 15% probability of mild flare up on training days
    if (prng.bool(0.15)) {
      hasPain = true;
      painRegions.push(userState.painJoint.replace('_pain', '').replace('_injury', ''));
    }
  }

  // 4. Ground Truth Nutrition vs Observed Logging
  const plan = activePlan(appState);
  const planDay = plan?.days?.find(d => d.date === dateStr);
  const targetEnergy = planDay?.targets?.energy || plan?.targets?.energy || userState.baseTdee;
  const targetProtein = planDay?.targets?.protein || plan?.targets?.protein || Math.round(user.weight * 1.6);

  let actualEnergy = targetEnergy;
  let actualProtein = targetProtein;
  let actualCarbs = Math.round(actualEnergy * 0.45 / 4);
  let actualFat = Math.round(actualEnergy * 0.25 / 9);

  if (isVacation) {
    actualEnergy += prng.int(300, 750); // restaurant/travel eating
  } else if (isWorkCrunch) {
    actualEnergy += prng.pick([-300, 450]); // stress eating or skipping
  } else if (isIll) {
    actualEnergy -= prng.int(300, 600); // low appetite
  } else {
    // Normal day-to-day variance
    actualEnergy += Math.round(prng.normal(0, 120));
  }

  // 5. Ground Truth Workout vs Observed Workout
  const scheduled = scheduledSessions(appState, dateStr, 1).find(s => s.date === dateStr);
  let actualWorkoutDone = 'none';
  let workoutBurn = 0;

  if (scheduled) {
    let attendProb = b.workoutAttendProb;
    if (isIll) attendProb = 0.05;
    else if (isVacation) attendProb = 0.25;
    else if (isWorkCrunch) attendProb = 0.40;
    else if (fatigue >= 4) attendProb = 0.50;

    if (prng.bool(attendProb)) {
      actualWorkoutDone = hasPain ? 'partial' : 'completed';
      workoutBurn = Math.round(300 + (scheduled.estimatedDuration || 45) * 4);
      userState.accumulatedFatigue += hasPain ? 2 : 4;
    } else {
      actualWorkoutDone = 'missed';
      userState.accumulatedFatigue = Math.max(0, userState.accumulatedFatigue - 1);
    }
  } else {
    // Rest day
    userState.accumulatedFatigue = Math.max(0, userState.accumulatedFatigue - 2);
  }

  // 6. Biological Weight Update (Energy balance)
  const actualTdee = isPlateau ? actualEnergy : (userState.baseTdee + workoutBurn);
  const energyDelta = actualEnergy - actualTdee;
  const deltaWeightKg = energyDelta / 7700;
  userState.currentBioWeight = Math.round((userState.currentBioWeight + deltaWeightKg) * 100) / 100;

  // Scale noise & water retention (sodium/inflammation)
  const waterRetention = (actualWorkoutDone === 'completed' ? 0.25 : 0) + (isVacation ? 0.35 : 0) + prng.normal(0, 0.15);
  const observedScaleWeight = Math.round((userState.currentBioWeight + waterRetention) * 10) / 10;

  // Ground Truth record
  const groundTruth = {
    day: dayNumber,
    date: dateStr,
    actualBioWeight: userState.currentBioWeight,
    actualEnergy,
    actualProtein,
    actualSleep: sleepHours,
    actualFatigue: fatigue,
    actualStress: stress,
    actualPain: hasPain,
    actualWorkout: actualWorkoutDone,
    lifestyleEvents: activeEvents.map(e => e.type)
  };

  // 7. Generate Observed Actions to send to real application engine
  const commandsToExecute = [];

  if (opensApp) {
    // A. Recovery check-in
    if (prng.bool(b.checkinProb)) {
      commandsToExecute.push({
        action: 'recovery',
        payload: {
          date: dateStr,
          sleepHours,
          sleepQuality,
          fatigue,
          stress,
          soreness: hasPain ? 6 : (fatigue >= 4 ? 4 : 1),
          pain: hasPain,
          painRegions: hasPain ? painRegions : [],
          illness: isIll,
          redFlags: false
        }
      });
    }

    // B. Weigh-in
    const shouldWeigh = (dayNumber % b.weightFreqDays === 0 || dayNumber === 1 || dayNumber === 90) && !isVacation;
    if (shouldWeigh) {
      commandsToExecute.push({
        action: 'weight',
        payload: {
          date: dateStr,
          kg: Math.max(35, Math.min(250, observedScaleWeight)),
          source: 'manual'
        }
      });
    }

    // C. Water logging
    if (prng.bool(b.waterLogProb)) {
      const targetCups = Math.round(user.weight * 35 / 250);
      const cupsLogged = isVacation ? Math.max(2, targetCups - 4) : targetCups + prng.int(-2, 2);
      commandsToExecute.push({
        action: 'water',
        payload: {
          date: dateStr,
          cups: Math.max(1, cupsLogged)
        }
      });
    }

    // D. Food Logging
    if (planDay && planDay.meals && planDay.meals.length > 0) {
      const willLogMeals = prng.bool(b.mealLogProb);
      if (willLogMeals) {
        let loggedAllMeals = true;

        for (const meal of planDay.meals) {
          // Does user substitute this meal?
          const willSubstitute = prng.bool(b.substituteFoodProb);
          if (willSubstitute) {
            try {
              const alts = mealAlternatives(appState, meal.id);
              if (alts && alts.length) {
                const choice = prng.pick(alts);
                commandsToExecute.push({
                  action: 'replace_meal',
                  payload: {
                    mealId: meal.id,
                    alternativeId: choice.id
                  }
                });
              }
            } catch {}
          }

          // Does user log this specific meal?
          if (prng.bool(0.92)) {
            commandsToExecute.push({
              action: 'food_entry',
              payload: {
                date: dateStr,
                source: 'planned',
                mealId: meal.id,
                slot: meal.slot,
                quantity: prng.pick([0.9, 1.0, 1.1])
              }
            });
          } else {
            loggedAllMeals = false;
          }
        }

        // Eating out / manual snack entry
        if (isVacation || prng.bool(0.12)) {
          commandsToExecute.push({
            action: 'food_entry',
            payload: {
              date: dateStr,
              source: 'manual',
              name: isVacation ? 'سناك سياحي' : 'وجبة سريعة خارجية',
              energy: prng.int(200, 450),
              protein: prng.int(10, 25),
              carbs: prng.int(20, 50),
              fat: prng.int(8, 20),
              slot: 'snack'
            }
          });
        }

        // Food day complete confirmation
        if (loggedAllMeals && prng.bool(b.completeDayProb)) {
          commandsToExecute.push({
            action: 'food_complete',
            payload: {
              date: dateStr,
              complete: true
            }
          });
        }
      }
    }

    // E. Workout Logging
    if (scheduled && appState.workoutPlan) {
      const sessionDay = appState.workoutPlan.days.find(d => d.dayIndex === scheduled.dayIndex);
      if (sessionDay) {
        if (actualWorkoutDone === 'missed') {
          // User either explicitly logs missed or asks to reschedule
          if (prng.bool(0.35)) {
            const nextFreeDate = dateOffset(dateStr, prng.int(1, 3));
            commandsToExecute.push({
              action: 'reschedule',
              payload: {
                dayIndex: sessionDay.dayIndex,
                toDate: nextFreeDate
              }
            });
          } else {
            commandsToExecute.push({
              action: 'session',
              payload: {
                dayIndex: sessionDay.dayIndex,
                date: dateStr,
                status: 'missed'
              }
            });
          }
        } else {
          // Completed or partial workout
          const exercises = actualWorkoutDone === 'partial' ? sessionDay.exercises.slice(0, 1) : sessionDay.exercises;

          for (const exercise of exercises) {
            // Check exercise substitution if injury cautious
            if (hasPain && prng.bool(b.substituteExerciseProb)) {
              try {
                const alts = exerciseAlternatives(appState, sessionDay.dayIndex, exercise.id);
                if (alts && alts.length) {
                  commandsToExecute.push({
                    action: 'replace_exercise',
                    payload: {
                      dayIndex: sessionDay.dayIndex,
                      exerciseId: exercise.id,
                      alternativeId: prng.pick(alts).id
                    }
                  });
                }
              } catch {}
            }

            // Progression load adoption
            let weightKg = usesKg(exercise) ? (exercise.suggestedKg || userState.exerciseLoadProgression[exercise.id] || 20) : 0;
            // Record if user accepted suggested weight
            if (exercise.suggestedKg && prng.bool(0.85)) {
              weightKg = exercise.suggestedKg;
            }
            userState.exerciseLoadProgression[exercise.id] = weightKg;

            const setsCount = exercise.sets || 3;
            const reps = prng.int(exercise.repMin || 8, exercise.repMax || 12);
            const rir = prng.int(1, 3);

            commandsToExecute.push({
              action: 'workout',
              payload: {
                exerciseId: exercise.id,
                dayIndex: sessionDay.dayIndex,
                date: dateStr,
                sets: Array.from({ length: setsCount }, () => ({
                  kg: weightKg,
                  reps,
                  rir,
                  pain: hasPain
                })),
                bothSides: false,
                increment: usesKg(exercise) ? 2.5 : null
              }
            });
          }

          // Complete the session
          commandsToExecute.push({
            action: 'session',
            payload: {
              dayIndex: sessionDay.dayIndex,
              date: dateStr,
              status: actualWorkoutDone,
              duration: actualWorkoutDone === 'partial' ? 15 : (sessionDay.estimatedMinutes || 45),
              rpe: hasPain ? 8 : prng.int(6, 8)
            }
          });
        }
      }
    }
  }

  return {
    opensApp,
    groundTruth,
    commandsToExecute
  };
}
