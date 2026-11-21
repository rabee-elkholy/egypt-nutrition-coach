// Workouts services: Exercise & Muscle i18n enrichment (868 exercises + 69 muscles) and PR computation
import exercisesI18n from '../data/exercises-i18n.json' with { type: 'json' };
import { catalog } from './workouts.mjs';
import { workingSetsOf } from './training-state.mjs';
import { usesKg } from '../exercise-load.mjs';

const byExerciseId = new Map(catalog.exercises.map(e => [e.id, e]));

export function enrichExercise(e) {
  if (!e) return null;
  const meta = exercisesI18n.exercises[e.id] || {};
  return {
    ...e,
    nameAr: meta.nameAr || null,
    instructionsEn: meta.instructionsEn || (e.description ? [e.description] : []),
    instructionsAr: meta.instructionsAr || [],
    commonMistakesEn: meta.commonMistakesEn || [],
    commonMistakesAr: meta.commonMistakesAr || [],
    mediaUrl: meta.mediaUrl ?? null,
    thumbnailUrl: meta.thumbnailUrl ?? null
  };
}

export function matchesExerciseQuery(e, qLower) {
  if (!qLower) return true;
  if (e.name.toLowerCase().includes(qLower)) return true;
  const ar = exercisesI18n.exercises[e.id]?.nameAr;
  return Boolean(ar && ar.toLowerCase().includes(qLower));
}

export function enrichMuscleCatalog() {
  const bilingualTranslations = [...(catalog.muscleTranslations || [])];
  for (const m of catalog.muscles || []) {
    const tr = exercisesI18n.muscles[m.id];
    if (tr?.nameAr) {
      bilingualTranslations.push({ muscle_id: m.id, language_code: 'ar', name: tr.nameAr });
    }
  }
  const items = (catalog.muscles || []).map(m => ({
    ...m,
    nameEn: exercisesI18n.muscles[m.id]?.nameEn || m.name || m.id,
    nameAr: exercisesI18n.muscles[m.id]?.nameAr || null
  }));
  return { items, translations: bilingualTranslations };
}

export function computeWorkoutPrs(s, { since = null, exerciseId = null } = {}) {
  const logs = (s.workoutLogs || [])
    .filter(l => !exerciseId || l.exerciseId === exerciseId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));

  const best = new Map();
  const events = [];

  for (const l of logs) {
    const ex = byExerciseId.get(l.exerciseId);
    const loadMode = l.loadMode || ex?.loadMode || 'external';
    const isWeighted = usesKg({ loadMode }) || ex?.supportsAddedWeight === true;
    if (l.entryMode === 'simple' && isWeighted) continue;
    const ws = workingSetsOf(l.sets);
    if (!ws.length) continue;

    const isAssisted = loadMode === 'assisted';
    const rec = best.get(l.exerciseId) || {
      exerciseId: l.exerciseId,
      name: ex?.name || l.exerciseId,
      nameAr: exercisesI18n.exercises[l.exerciseId]?.nameAr || null,
      loadMode,
      heaviestWeightKg: null,
      bestRepsAtWeight: null,
      highestVolumeKg: 0,
      estimated1RM: null
    };

    const sessionVolume = ws.reduce((sum, set) => sum + Number(set.kg || 0) * Number(set.reps || 0), 0);
    const maxReps = Math.max(...ws.map(set => Number(set.reps || 0)));

    let bestWeightInSession = null;
    let best1RmInSession = null;
    for (const set of ws) {
      const kg = Number(set.kg || 0);
      const reps = Number(set.reps || 0);
      if (isWeighted && kg > 0) {
        if (bestWeightInSession == null || (isAssisted ? kg < bestWeightInSession : kg > bestWeightInSession)) {
          bestWeightInSession = kg;
        }
        if (!isAssisted) {
          const e1rm = Math.round(kg * (1 + reps / 30) * 10) / 10;
          if (best1RmInSession == null || e1rm > best1RmInSession) best1RmInSession = e1rm;
        }
      }
    }

    const pushEvent = (prType, value, previousValue) => {
      if (!since || l.date >= since) {
        events.push({
          exerciseId: l.exerciseId,
          name: rec.name,
          nameAr: rec.nameAr,
          prType,
          value,
          previousValue,
          achievedAt: l.at || `${l.date}T12:00:00.000Z`,
          date: l.date
        });
      }
    };

    if (bestWeightInSession != null) {
      const improved = rec.heaviestWeightKg == null
        ? true
        : (isAssisted ? bestWeightInSession < rec.heaviestWeightKg : bestWeightInSession > rec.heaviestWeightKg);
      if (improved) {
        if (rec.heaviestWeightKg != null) pushEvent('weight', bestWeightInSession, rec.heaviestWeightKg);
        rec.heaviestWeightKg = bestWeightInSession;
      }
    }

    if (rec.bestRepsAtWeight == null || maxReps > rec.bestRepsAtWeight) {
      if (rec.bestRepsAtWeight != null) pushEvent('reps', maxReps, rec.bestRepsAtWeight);
      rec.bestRepsAtWeight = maxReps;
    }

    if (sessionVolume > 0 && sessionVolume > rec.highestVolumeKg) {
      if (rec.highestVolumeKg > 0) pushEvent('volume', Math.round(sessionVolume * 10) / 10, Math.round(rec.highestVolumeKg * 10) / 10);
      rec.highestVolumeKg = Math.round(sessionVolume * 10) / 10;
    }

    if (best1RmInSession != null && (rec.estimated1RM == null || best1RmInSession > rec.estimated1RM)) {
      if (rec.estimated1RM != null) pushEvent('1rm', best1RmInSession, rec.estimated1RM);
      rec.estimated1RM = best1RmInSession;
    }

    best.set(l.exerciseId, rec);
  }

  return {
    items: events.sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)),
    summaryByExercise: Object.fromEntries(best.entries())
  };
}
