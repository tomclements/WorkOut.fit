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

  function parseCompletedList(raw) {
    try {
      const arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function defaultStorage(storage) {
    if (storage) return storage;
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
  }

  /**
   * Union of gen + saved completion keys for the same plan when both exist.
   * Prevents orphaning runnerCompleted_gen-* after workoutPlanSavedId is set.
   */
  function readCompletedKeys(opts, storage) {
    const store = defaultStorage(storage);
    const set = new Set();
    if (!store || typeof store.getItem !== 'function') return set;

    const savedPlanId = opts && opts.savedPlanId;
    const generatedAt = opts && opts.generatedAt;
    const hasSaved = savedPlanId != null && savedPlanId !== '';
    const hasGen = generatedAt != null && generatedAt !== '';

    if (hasGen) {
      for (const k of parseCompletedList(store.getItem(completedStorageKey({ generatedAt })))) {
        set.add(k);
      }
    }
    if (hasSaved) {
      for (const k of parseCompletedList(store.getItem(completedStorageKey({ savedPlanId })))) {
        set.add(k);
      }
    }
    if (!hasSaved && !hasGen) {
      for (const k of parseCompletedList(store.getItem(completedStorageKey({})))) {
        set.add(k);
      }
    }
    return set;
  }

  /**
   * Copy/union gen keys into the saved key when a plan gets a savedPlanId.
   */
  function migrateGenCompletionsToSaved(opts, storage) {
    const store = defaultStorage(storage);
    const savedPlanId = opts && opts.savedPlanId;
    if (!store || typeof store.getItem !== 'function' || savedPlanId == null || savedPlanId === '') {
      return new Set();
    }
    const generatedAt = opts && opts.generatedAt;
    const genKey = completedStorageKey({ generatedAt });
    const savedKey = completedStorageKey({ savedPlanId });
    const union = new Set([
      ...parseCompletedList(store.getItem(genKey)),
      ...parseCompletedList(store.getItem(savedKey))
    ]);
    try {
      store.setItem(savedKey, JSON.stringify([...union]));
    } catch { /* ignore */ }
    return union;
  }

  /**
   * Load completed keys for a plan object using storage workoutPlanSavedId + plan.generatedAt.
   */
  function loadCompletedSetForPlan(plan, storage) {
    const store = defaultStorage(storage);
    let savedPlanId = null;
    if (store && typeof store.getItem === 'function') {
      try { savedPlanId = store.getItem('workoutPlanSavedId'); } catch { /* ignore */ }
    }
    return readCompletedKeys({
      savedPlanId,
      generatedAt: plan && plan.generatedAt
    }, store);
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

  /**
   * Build Start/Run href with next incomplete day deep-linked.
   */
  function runnerStartHrefForPlan(plan, planId, storage) {
    const completed = loadCompletedSetForPlan(plan, storage);
    const found = findNextWorkoutDay(plan && plan.plan, completed);
    if (!found) {
      return runnerSetupHref({ planId });
    }
    return runnerSetupHref({ planId, week: found.week, dayIndex: found.dayIndex });
  }

  /**
   * Match a daySelect option value to found { week, dayIndex, arrayIndex }.
   * Number()-coerces week/dayIndex/arrayIndex so string vs number still match.
   * Returns the matching option value string, or null. When found is set but
   * no option matches, callers must NOT silently fall back to options[0].
   */
  function matchDaySelectOption(optionValues, found) {
    if (!found || !optionValues || !optionValues.length) return null;
    const fw = Number(found.week);
    const fd = found.dayIndex != null && found.dayIndex !== '' ? Number(found.dayIndex) : NaN;
    const fa = found.arrayIndex != null && found.arrayIndex !== '' ? Number(found.arrayIndex) : NaN;
    if (!Number.isFinite(fw)) return null;
    for (const raw of optionValues) {
      let v;
      try { v = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
      if (!v) continue;
      if (Number(v.week) !== fw) continue;
      if (Number.isFinite(fa) && Number(v.arrayIndex) === fa) {
        return typeof raw === 'string' ? raw : JSON.stringify(v);
      }
      if (Number.isFinite(fd) && Number(v.dayIndex) === fd) {
        return typeof raw === 'string' ? raw : JSON.stringify(v);
      }
    }
    return null;
  }

  return {
    canonicalDayIndex,
    dayCompletionKey,
    findNextWorkoutDay,
    completedStorageKey,
    readCompletedKeys,
    migrateGenCompletionsToSaved,
    loadCompletedSetForPlan,
    addSessionCompletionKeys,
    runnerSetupHref,
    runnerStartHrefForPlan,
    matchDaySelectOption
  };
});
