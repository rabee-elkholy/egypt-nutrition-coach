// KAN-80 C1 / KAN-94 C1: Shared 4-Trigger Proactive Milestone Specialist Micro-Notes (Max 1/day)
// Pure root module — imports only root helpers & planning-library.json to keep server/ acyclic.
import library from './data/planning-library.json' with { type: 'json' };
import { dateOffset, localDate, isPregnantStatus } from './coaching-shared.mjs';
import { dietIngredientAllowed, medicalContraindicatedKeys } from './diet-patterns.mjs';
import { expandedKeys } from './planner-exclusions.mjs';

const BUDGET_RANK = { low: 1, medium: 2, high: 3 };

function pickSafeRegionalProteinSwaps(state, limit = 2) {
  const prefs = state?.preferences || {};
  const profile = state?.profile || {};
  const diet = prefs.diet || 'balanced';
  const region = prefs.region || profile.region || 'egypt';
  const maxBudget = BUDGET_RANK[prefs.budget || 'medium'] || 2;
  const blockedKeys = new Set([
    ...expandedKeys(prefs),
    ...medicalContraindicatedKeys({
      ...profile,
      diseases: profile.diseases || []
    })
  ]);
  const diseases = new Set(profile.diseases || []);
  if (diseases.has('celiac') || (prefs.excludedGroups || []).includes('gluten')) {
    blockedKeys.add('oats');
  }

  const candidates = [];
  for (const ing of Object.values(library.ingredients || {})) {
    if (!ing || blockedKeys.has(ing.key)) continue;
    if (!dietIngredientAllowed(ing, diet)) continue;
    if (region !== 'any' && Array.isArray(ing.regions) && !ing.regions.includes(region)) continue;
    const ingBudget = BUDGET_RANK[ing.budget_tier || 'medium'] || 2;
    if (ingBudget > maxBudget) continue;
    const proteinPer100 = Number(ing.values?.protein || 0);
    const energyPer100 = Number(ing.values?.energy || 0);
    const sodiumPer100 = Number(ing.values?.sodium || 0);
    if (proteinPer100 < 8 || energyPer100 <= 0) continue;
    if ((diseases.has('hypertension') || diseases.has('kidney')) && sodiumPer100 > 350) continue;
    const isPrimaryProtein = ['protein'].includes(ing.role) || ['chicken', 'fish', 'meat', 'eggs', 'dairy', 'legumes'].includes(ing.protein_group);
    if (!isPrimaryProtein) continue;
    const score = proteinPer100 + (ingBudget <= 1 ? 4 : 0);
    candidates.push({
      key: ing.key,
      nameEn: ing.english || ing.label_en || ing.key.replace(/_/g, ' '),
      proteinPer100g: Math.round(proteinPer100 * 10) / 10,
      energyPer100g: Math.round(energyPer100),
      budgetTier: ing.budget_tier || 'medium',
      score
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const picked = [];
  const seenFamilies = new Set();
  for (const c of candidates) {
    const ing = library.ingredients[c.key];
    const group = ing?.protein_group || c.key;
    if (picked.length < limit && !seenFamilies.has(group)) {
      picked.push({
        key: c.key,
        nameEn: c.nameEn,
        proteinPer100g: c.proteinPer100g,
        energyPer100g: c.energyPer100g
      });
      seenFamilies.add(group);
    }
    if (picked.length >= limit) break;
  }
  if (picked.length < limit) {
    for (const c of candidates) {
      if (picked.some(p => p.key === c.key)) continue;
      picked.push({
        key: c.key,
        nameEn: c.nameEn,
        proteinPer100g: c.proteinPer100g,
        energyPer100g: c.energyPer100g
      });
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

export function localizedSwapNamesAr(swapKeys = []) {
  return (Array.isArray(swapKeys) ? swapKeys : [])
    .map(k => library.ingredients?.[k]?.label || null)
    .filter(Boolean);
}

function detectRecentPrFallback(state, today) {
  const yesterday = dateOffset(today, -1);
  const logs = (state?.workoutLogs || []).filter(l => l?.exerciseId && Array.isArray(l.sets)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const bestKg = new Map();
  const bestReps = new Map();
  const hits = [];
  for (const l of logs) {
    const validSets = l.sets.filter(set => !set.pain && set.setType !== 'warmup');
    if (!validSets.length) continue;
    const maxKg = Math.max(...validSets.map(set => Number(set.kg || 0)));
    const maxReps = Math.max(...validSets.map(set => Number(set.reps || 0)));
    const prevKg = bestKg.get(l.exerciseId) ?? null;
    const prevReps = bestReps.get(l.exerciseId) ?? null;
    if (l.date === today || l.date === yesterday) {
      if (maxKg > 0 && prevKg != null && maxKg > prevKg) {
        hits.push({ exerciseId: l.exerciseId, name: l.exerciseId, prType: 'weight', value: maxKg, reps: maxReps, date: l.date });
      } else if (maxReps > 0 && prevReps != null && maxReps > prevReps) {
        hits.push({ exerciseId: l.exerciseId, name: l.exerciseId, prType: 'reps', value: maxReps, reps: maxReps, date: l.date });
      }
    }
    if (maxKg > 0 && (prevKg == null || maxKg > prevKg)) bestKg.set(l.exerciseId, maxKg);
    if (maxReps > 0 && (prevReps == null || maxReps > prevReps)) bestReps.set(l.exerciseId, maxReps);
  }
  return hits;
}

export function evaluateProactiveSpecialistNote(state, today, nowMs = Date.now(), options = {}) {
  if (!state?.profile || !today) return null;
  const track = state.onboarding?.serviceTrack || 'nutrition_and_workouts';
  const tz = state.profile.timezone || 'Africa/Cairo';
  const userName = state.profile.name ? String(state.profile.name).trim() : null;

  // 1. Lifecycle Day 1 (Ramadan Day 1, Cycle Day 1, or New Pregnancy Trimester)
  const ramadanStartDay1 = Boolean(
    state.ramadanMode?.enabled &&
    state.ramadanMode.startDate === today &&
    !(state.ramadanMode.endDate && today > state.ramadanMode.endDate)
  );
  const cycleDay1 = Boolean(
    state.profile.sex === 'female' &&
    !isPregnantStatus(state.profile.maternalStatus) &&
    state.cycleSettings?.enabled &&
    (state.cycleSettings.lastPeriodStartDate === today || (state.cycleLogs || []).some(l => l.date === today && l.periodStart === true))
  );
  const maternityChangedToday = Boolean(
    isPregnantStatus(state.profile.maternalStatus) &&
    (state.history || []).some(h => {
      if (h.kind !== 'profile' || !h.at) return false;
      const hDate = localDate(Date.parse(h.at), tz);
      return hDate === today && h.profile?.maternalStatus !== state.profile.maternalStatus;
    })
  );

  if (ramadanStartDay1 || cycleDay1 || maternityChangedToday) {
    const lifecycleKind = ramadanStartDay1 ? 'ramadan' : (maternityChangedToday ? 'maternity' : 'cycle');
    const detailText = lifecycleKind === 'ramadan'
      ? 'Ramadan fasting schedule is active today: hydration pacing and meal windows have been aligned from Iftar to Suhoor.'
      : lifecycleKind === 'maternity'
        ? 'Your plan has been calibrated for your updated pregnancy stage with maternal safety nutrition and gentle movement guardrails.'
        : 'Cycle Day 1 is logged: nutrition holds steady against fluid shifts and gentle session pacing is available if needed.';
    return {
      trigger: 'proactive_lifecycle_adjusted',
      role: 'followup',
      key: `proactive-lifecycle-${lifecycleKind}`,
      code: 'PROACTIVE_NOTE_LIFECYCLE_ADJUSTED',
      actionCode: lifecycleKind === 'ramadan' ? 'BRIEF_ACTION_LOG_WATER' : 'BRIEF_ACTION_RECOVERY_CHECKIN',
      actionTarget: lifecycleKind === 'ramadan' ? 'water' : 'recovery',
      priority: 'normal',
      lifecycleKind,
      params: { ...(userName ? { userName } : {}), lifecycleKind },
      text: detailText,
      action: lifecycleKind === 'ramadan'
        ? 'Hydrate steadily between Iftar and Suhoor cutoff.'
        : 'Adjust session effort calmly to how you feel today.'
    };
  }

  // 2. 3 Consecutive Nights Sleep < 6h Recovery Check-In
  const checkinByDate = new Map((state.checkins || []).filter(c => c.date && Number.isFinite(Number(c.sleepHours))).map(c => [c.date, c]));
  const d0 = checkinByDate.get(today);
  const d1 = checkinByDate.get(dateOffset(today, -1));
  const d2 = checkinByDate.get(dateOffset(today, -2));
  const d3 = checkinByDate.get(dateOffset(today, -3));
  const threeNightGroup = (d0 && d1 && d2 && [d0, d1, d2].every(c => Number(c.sleepHours) < 6))
    ? [d0, d1, d2]
    : (!d0 && d1 && d2 && d3 && [d1, d2, d3].every(c => Number(c.sleepHours) < 6))
      ? [d1, d2, d3]
      : null;

  if (threeNightGroup) {
    const avgSleepHours = Math.round((threeNightGroup.reduce((sum, c) => sum + Number(c.sleepHours), 0) / 3) * 10) / 10;
    return {
      trigger: 'proactive_sleep_recovery',
      role: 'followup',
      key: 'proactive-sleep-low-3d',
      code: 'PROACTIVE_NOTE_SLEEP_LOW_3D',
      actionCode: 'BRIEF_ACTION_RECOVERY_CHECKIN',
      actionTarget: 'recovery',
      priority: 'attention',
      params: { ...(userName ? { userName } : {}), avgSleepHours, nights: 3 },
      text: `You logged under 6 hours of sleep for 3 consecutive nights (avg ${avgSleepHours}h). Prioritize tonight's wind-down and keep intensity measured today.`,
      action: 'Complete today\'s Recovery Check-In so your specialists protect readiness.'
    };
  }

  // 3. New PR Achieved Celebration + Next Target
  if (track !== 'nutrition_only') {
    const yesterday = dateOffset(today, -1);
    const prList = Array.isArray(options.recentPrs) ? options.recentPrs : detectRecentPrFallback(state, today);
    const latestPr = prList.find(p => p.date === today) || prList.find(p => p.date === yesterday) || null;
    if (latestPr) {
      const nextStep = latestPr.prType === 'weight' && Number(latestPr.value) > 0
        ? (Number(latestPr.value) <= 15 ? Number(latestPr.value) + 1 : Number(latestPr.value) <= 50 ? Number(latestPr.value) + 2.5 : Math.round(Number(latestPr.value) * 1.025 * 2) / 2)
        : (latestPr.prType === 'reps' ? Number(latestPr.value) + 1 : null);
      const nextHint = latestPr.prType === 'weight' && nextStep != null
        ? `Aim to lock ${latestPr.value} kg cleanly across two sessions before progressing toward ${nextStep} kg.`
        : latestPr.prType === 'reps' && nextStep != null
          ? `Hold clean technique and target ${nextStep} reps on your next exposure.`
          : 'Maintain crisp tempo and recovery to lock in your new strength milestone.';
      return {
        trigger: 'proactive_pr_celebration',
        role: 'training',
        key: 'proactive-new-pr',
        code: 'PROACTIVE_NOTE_NEW_PR',
        actionCode: 'BRIEF_ACTION_VIEW_WORKOUT',
        actionTarget: 'workout',
        priority: 'normal',
        params: {
          ...(userName ? { userName } : {}),
          exerciseId: latestPr.exerciseId,
          exerciseName: latestPr.name,
          prType: latestPr.prType || latestPr.type,
          value: latestPr.value,
          ...(nextStep != null ? { nextTargetValue: nextStep } : {})
        },
        text: `New Personal Record on ${latestPr.name} (${latestPr.value}${latestPr.prType === 'weight' ? ' kg' : latestPr.prType === 'reps' ? ' reps' : ''}). ${nextHint}`,
        action: 'Review your PR progression and stay steady on your next scheduled session.'
      };
    }
  }

  // 4. 2 Days Below Protein Target + 2 Concrete Regional Budget-Matched Safe Swaps
  if (track !== 'workouts_only' && options.allowFoodSwaps !== false) {
    const plan = (state.plans || []).find(p => p.id === state.active_plan_id);
    const planRef = (state.planRefs || []).find(p => p.id === state.active_plan_id);
    const targetProt = Number(plan?.targets?.protein || planRef?.protein || state.lastCalibrationMetadata?.adjustedMacros?.protein || 0);
    if (targetProt > 0) {
      const foodByDate = new Map((state.foodLogs || []).filter(f => f.date && Number(f.energy || 0) > 0 && f.protein != null).map(f => [f.date, f]));
      const f0 = foodByDate.get(today);
      const f1 = foodByDate.get(dateOffset(today, -1));
      const f2 = foodByDate.get(dateOffset(today, -2));
      const pair = (f0 && f0.complete && f1 && Number(f0.protein) < targetProt * 0.8 && Number(f1.protein) < targetProt * 0.8)
        ? [f1, f0]
        : (f1 && f2 && Number(f1.protein) < targetProt * 0.8 && Number(f2.protein) < targetProt * 0.8)
          ? [f2, f1]
          : null;
      if (pair) {
        const swaps = pickSafeRegionalProteinSwaps(state, 2);
        if (swaps.length >= 1) {
          const swapNamesEn = swaps.map(sw => sw.nameEn).join(' or ');
          const avgProtein = Math.round((Number(pair[0].protein) + Number(pair[1].protein)) / 2);
          return {
            trigger: 'proactive_protein_swaps',
            role: 'nutrition',
            key: 'proactive-protein-low-2d',
            code: 'PROACTIVE_NOTE_PROTEIN_LOW_2D',
            actionCode: 'BRIEF_ACTION_LOG_MEAL',
            actionTarget: 'food',
            priority: 'normal',
            swaps,
            params: {
              ...(userName ? { userName } : {}),
              avgProtein,
              targetProtein: Math.round(targetProt),
              swapKeys: swaps.map(sw => sw.key),
              swapNamesEn: swaps.map(sw => sw.nameEn)
            },
            text: `Protein intake averaged ${avgProtein} g against your ${Math.round(targetProt)} g target over the last 2 days. Practical regional swaps to close the gap: ${swapNamesEn}.`,
            action: `Swap one item or add ${swapNamesEn} to anchor today's protein target.`
          };
        }
      }
    }
  }

  return null;
}
