/**
 * DOM-free quit-workout helper for the Plan4Strength runner (node:test + workoutRunner.js).
 * Builds partial-session payloads and decides what to do when the user quits.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.QuitWorkout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isDoneSet(set) {
    return !!set && Number(set.durationSeconds) > 0;
  }

  function targetSets(ex) {
    return Math.max(1, ex && ex.sets ? Number(ex.sets) : 1);
  }

  function countDoneSets(sessionExercises) {
    const exercises = Array.isArray(sessionExercises) ? sessionExercises : [];
    let done = 0;
    let total = 0;
    for (const ex of exercises) {
      const sets = targetSets(ex);
      total += sets;
      if (Array.isArray(ex.completedSets)) {
        for (const set of ex.completedSets) {
          if (isDoneSet(set)) done++;
        }
      }
    }
    return { done, total };
  }

  function quitOptions(sessionExercises) {
    const { done, total } = countDoneSets(sessionExercises);
    return { canSave: done > 0, done, total };
  }

  function activeDurationSeconds({ startTime, now, isPaused, pauseStartTime }) {
    const start = startTime == null ? NaN : Number(startTime);
    const end = now == null ? NaN : Number(now);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
    let elapsedMs = end - start;
    if (isPaused) {
      const pausedAt = pauseStartTime == null ? NaN : Number(pauseStartTime);
      if (Number.isFinite(pausedAt)) {
        elapsedMs = Math.max(0, pausedAt - start);
      }
    }
    return Math.max(0, Math.floor(elapsedMs / 1000));
  }

  function buildPartialSessionPayload({ sessionExercises, planName, savedPlanId, week, dayIndex, startTime, now, isPaused, pauseStartTime }) {
    const { done, total } = countDoneSets(sessionExercises);
    if (done <= 0) return null;

    let name = (planName || '').trim();
    if (!name) name = 'Plan4Strength';
    if (name.length > 200) name = name.slice(0, 200);

    const exercises = (sessionExercises || [])
      .map(ex => {
        if (!ex) return null;
        const doneSets = (Array.isArray(ex.completedSets) ? ex.completedSets : []).filter(isDoneSet);
        if (doneSets.length === 0) return null;
        return {
          exerciseId: String(ex.id || ''),
          exerciseName: String(ex.name || ''),
          targetSets: targetSets(ex),
          weightKg: ex.workingWeightKg == null ? null : ex.workingWeightKg,
          sets: doneSets.map(s => ({
            reps: s.reps == null ? 0 : Number(s.reps),
            durationSeconds: Number(s.durationSeconds)
          }))
        };
      })
      .filter(Boolean);

    if (exercises.length === 0) return null;

    const durationSeconds = activeDurationSeconds({ startTime, now, isPaused, pauseStartTime });

    return {
      planName: name,
      savedPlanId: savedPlanId == null ? null : savedPlanId,
      week: Number(week) || 1,
      dayIndex: dayIndex == null ? 0 : Number(dayIndex),
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(now).toISOString(),
      durationSeconds,
      exercises
    };
  }

  function quitDecision(choice, sessionExercises) {
    const { done } = countDoneSets(sessionExercises);
    if (choice === 'keep') {
      return { post: false, markComplete: false, teardown: false };
    }
    if (choice === 'discard') {
      return { post: false, markComplete: false, teardown: true };
    }
    if (choice === 'save') {
      if (done > 0) {
        return { post: true, markComplete: true, teardown: true };
      }
      // Save with nothing done is treated as discard.
      return { post: false, markComplete: false, teardown: true };
    }
    return { post: false, markComplete: false, teardown: false };
  }

  return {
    isDoneSet,
    countDoneSets,
    quitOptions,
    activeDurationSeconds,
    buildPartialSessionPayload,
    quitDecision
  };
});
