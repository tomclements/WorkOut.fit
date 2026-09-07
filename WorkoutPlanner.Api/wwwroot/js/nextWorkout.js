/**
 * DOM-free next-workout pointer. Used by app.js (home card), workoutRunner.js,
 * and node:test. One completed-set model: week + ':' + canonicalDayIndex.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.NextWorkout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function canonicalDayIndex(day, arrayIndex) {
    if (day && day.dayIndex != null) return day.dayIndex;
    if (day && day.DayIndex != null) return day.DayIndex;
    return arrayIndex;
  }

  function dayCompletionKey(week, day, arrayIndex) {
    return week + ':' + canonicalDayIndex(day, arrayIndex);
  }

  function isWorkoutDay(day) {
    return day && day.type === 'workout';
  }

  /**
   * First workout day whose completion key is not in completedSet.
   * If all workout days are done, wraps to the first workout (never null
   * when the plan has at least one workout day).
   */
  function findNextWorkoutDay(planWeeks, completedSet) {
    const weeks = planWeeks || [];
    const done = completedSet || new Set();
    let first = null;

    for (const weekObj of weeks) {
      const weekNum = weekObj.week;
      const days = weekObj.days || [];
      for (let idx = 0; idx < days.length; idx++) {
        const day = days[idx];
        if (!isWorkoutDay(day)) continue;
        const dayIndex = canonicalDayIndex(day, idx);
        const result = { week: weekNum, dayIndex: dayIndex, day: day, arrayIndex: idx };
        if (!first) first = result;
        const key = dayCompletionKey(weekNum, day, idx);
        if (!done.has(key)) return result;
      }
    }

    return first;
  }

  function completedStorageKey(opts) {
    const savedPlanId = opts && opts.savedPlanId;
    const generatedAt = opts && opts.generatedAt;
    if (savedPlanId != null && savedPlanId !== '') {
      return 'runnerCompleted_saved-' + savedPlanId;
    }
    return 'runnerCompleted_gen-' + (generatedAt || 'unknown');
  }

  /**
   * Merge runner session records for this plan into completedSet.
   * Uses loose == so string vs numeric savedPlanId both match.
   */
  function addSessionCompletionKeys(completedSet, sessions, planId) {
    if (!completedSet || !sessions || planId == null || planId === '') return completedSet;
    for (const s of sessions) {
      if (!s) continue;
      if (s.savedPlanId == planId && s.week != null && s.dayIndex != null) {
        completedSet.add(s.week + ':' + s.dayIndex);
      }
    }
    return completedSet;
  }

  function runnerSetupHref(opts) {
    const planId = opts && opts.planId;
    const week = opts && opts.week;
    const dayIndex = opts && opts.dayIndex;
    const params = new URLSearchParams();
    params.set('setup', '1');
    if (planId != null && planId !== '') params.set('planId', String(planId));
    if (week != null && week !== '') params.set('week', String(week));
    // Keep dayIndex=0 for Monday / first day — do not omit falsy 0
    if (dayIndex != null && dayIndex !== '') params.set('dayIndex', String(dayIndex));
    return '/workout.html?' + params.toString();
  }

  return {
    canonicalDayIndex,
    dayCompletionKey,
    findNextWorkoutDay,
    completedStorageKey,
    addSessionCompletionKeys,
    runnerSetupHref
  };
});
