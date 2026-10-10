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
   * All workout days in plan order with their canonical completion keys.
   */
  function planWorkoutSequence(planWeeks) {
    const seq = [];
    for (const weekObj of planWeeks || []) {
      const weekNum = weekObj.week;
      const days = weekObj.days || [];
      for (let idx = 0; idx < days.length; idx++) {
        const day = days[idx];
        if (!isWorkoutDay(day)) continue;
        const dayIndex = canonicalDayIndex(day, idx);
        seq.push({
          week: weekNum,
          dayIndex: dayIndex,
          arrayIndex: idx,
          day: day,
          key: dayCompletionKey(weekNum, day, idx)
        });
      }
    }
    return seq;
  }

  function parseCompletionKey(key) {
    if (typeof key !== 'string') return null;
    const parts = key.split(':');
    if (parts.length !== 2) return null;
    const week = Number(parts[0]);
    const dayIndex = Number(parts[1]);
    if (!Number.isFinite(week) || !Number.isFinite(dayIndex)) return null;
    return { week, dayIndex };
  }

  /**
   * Next workout day = the day after the last completed workout day in PLAN ORDER.
   * Skipped or unlogged earlier days never pull the default backwards. Repeating
   * or making up an earlier day does not reset the anchor. When the final workout
   * day is complete, the final day is returned with planComplete: true (no wrap).
   */
  function findNextWorkoutDay(planWeeks, completedSet) {
    const seq = planWorkoutSequence(planWeeks);
    if (seq.length === 0) return null;

    const done = completedSet || new Set();
    let anchorIndex = -1;
    for (const key of done) {
      const parsed = parseCompletionKey(key);
      if (!parsed) continue;
      const idx = seq.findIndex(s =>
        Number(s.week) === parsed.week && Number(s.dayIndex) === parsed.dayIndex
      );
      if (idx > anchorIndex) anchorIndex = idx;
    }

    if (anchorIndex === -1) {
      return { ...seq[0], planComplete: false, lastCompleted: null };
    }

    const lastIndex = seq.length - 1;
    if (anchorIndex === lastIndex) {
      const last = seq[lastIndex];
      return { ...last, planComplete: true, lastCompleted: last };
    }

    return {
      ...seq[anchorIndex + 1],
      planComplete: false,
      lastCompleted: seq[anchorIndex]
    };
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
    // Always union gen-unknown so orphans (writes with missing generatedAt) are not lost
    // when a real generatedAt or savedPlanId is known later.
    for (const k of parseCompletedList(store.getItem(completedStorageKey({})))) {
      set.add(k);
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
    // Prefer explicit opts.generatedAt; else pull from localStorage workoutPlan.
    const generatedAt = (opts && opts.generatedAt) || resolveGeneratedAt(null, store);
    const genKey = completedStorageKey({ generatedAt });
    const savedKey = completedStorageKey({ savedPlanId });
    const unknownKey = completedStorageKey({}); // runnerCompleted_gen-unknown
    const union = new Set([
      ...parseCompletedList(store.getItem(genKey)),
      ...parseCompletedList(store.getItem(savedKey)),
      // Orphan keys written under gen-unknown when generatedAt was missing at finish time
      ...parseCompletedList(store.getItem(unknownKey))
    ]);
    try {
      store.setItem(savedKey, JSON.stringify([...union]));
      // Keep gen in sync when timestamp known (dual-write after migrate).
      if (generatedAt != null && generatedAt !== '') {
        store.setItem(genKey, JSON.stringify([...union]));
      }
    } catch { /* ignore */ }
    return union;
  }

  /**
   * Resolve generatedAt from plan JSON and/or localStorage workoutPlan.
   * API-loaded saved plans often omit generatedAt; gen-* keys still live under the
   * timestamp that was stored with the local plan copy.
   */
  function resolveGeneratedAt(plan, storage) {
    if (plan && plan.generatedAt != null && plan.generatedAt !== '') {
      return plan.generatedAt;
    }
    const store = defaultStorage(storage);
    if (!store || typeof store.getItem !== 'function') return null;
    try {
      const raw = store.getItem('workoutPlan');
      if (!raw) return null;
      const local = JSON.parse(raw);
      if (local && local.generatedAt != null && local.generatedAt !== '') {
        return local.generatedAt;
      }
    } catch { /* ignore */ }
    return null;
  }

  /**
   * Load completed keys for a plan object using storage workoutPlanSavedId +
   * generatedAt from plan JSON and/or localStorage workoutPlan.
   * Missing generatedAt on an API plan must not drop runnerCompleted_gen-* keys.
   */
  function loadCompletedSetForPlan(plan, storage) {
    const store = defaultStorage(storage);
    let savedPlanId = null;
    if (store && typeof store.getItem === 'function') {
      try { savedPlanId = store.getItem('workoutPlanSavedId'); } catch { /* ignore */ }
    }
    const generatedAt = resolveGeneratedAt(plan, store);
    // Carry timestamp onto plan so callers (migrate, dual-write) see it.
    if (generatedAt && plan && !plan.generatedAt) {
      try { plan.generatedAt = generatedAt; } catch { /* ignore */ }
    }
    return readCompletedKeys({
      savedPlanId,
      generatedAt
    }, store);
  }

  function planHasWorkoutDay(planWeeks, week, dayIndex) {
    const weeks = planWeeks || [];
    const weekNum = Number(week);
    const dayNum = Number(dayIndex);
    if (!Number.isFinite(weekNum) || !Number.isFinite(dayNum)) return false;
    for (const weekObj of weeks) {
      if (Number(weekObj.week) !== weekNum) continue;
      const days = weekObj.days || [];
      for (let idx = 0; idx < days.length; idx++) {
        const day = days[idx];
        if (!isWorkoutDay(day)) continue;
        if (Number(canonicalDayIndex(day, idx)) === dayNum) return true;
      }
    }
    return false;
  }

  /**
   * Merge runner session records for this plan into completedSet.
   * Uses loose == so string vs numeric savedPlanId both match.
   * When local completed is empty/sparse and planWeeks is provided, also credit
   * finished sessions with null savedPlanId whose week:dayIndex exist on the
   * current plan (guest finish before save, then save attaches plan id).
   * Without planWeeks, null-savedPlanId sessions remain ignored (documented).
   */
  function addSessionCompletionKeys(completedSet, sessions, planId, planWeeks) {
    if (!completedSet || !sessions || planId == null || planId === '') return completedSet;
    const localSparse = completedSet.size === 0;
    for (const s of sessions) {
      if (!s) continue;
      if (s.week == null || s.dayIndex == null) continue;
      if (s.savedPlanId == planId) {
        completedSet.add(s.week + ':' + s.dayIndex);
        continue;
      }
      // Gap fill: null savedPlanId after guest finish → later save, only when local empty
      // and the day exists on the current plan (product-safe fingerprint).
      if (localSparse && (s.savedPlanId == null || s.savedPlanId === '')
          && planWeeks && planHasWorkoutDay(planWeeks, s.week, s.dayIndex)) {
        completedSet.add(s.week + ':' + s.dayIndex);
      }
    }
    return completedSet;
  }

  /**
   * Dual-write completion keys to saved-<id> and/or gen-<ts> stores.
   * Prefer writing both when both identities are known so a later API load
   * without generatedAt still sees the saved key, and gen keys stay in sync.
   */
  function writeCompletedKeys(completedSet, opts, storage) {
    const store = defaultStorage(storage);
    if (!store || typeof store.setItem !== 'function') return;
    let savedPlanId = opts && opts.savedPlanId;
    // Fallback: bare Run may have null currentSavedPlanId but store still has workoutPlanSavedId
    if ((savedPlanId == null || savedPlanId === '') && typeof store.getItem === 'function') {
      try {
        const fromStore = store.getItem('workoutPlanSavedId');
        if (fromStore != null && fromStore !== '') savedPlanId = fromStore;
      } catch { /* ignore */ }
    }
    const generatedAt = opts && opts.generatedAt;
    const hasSaved = savedPlanId != null && savedPlanId !== '';
    const hasGen = generatedAt != null && generatedAt !== '';
    const payload = JSON.stringify([...(completedSet || [])]);
    try {
      if (hasSaved) {
        store.setItem(completedStorageKey({ savedPlanId }), payload);
      }
      if (hasGen) {
        store.setItem(completedStorageKey({ generatedAt }), payload);
      }
      if (!hasSaved && !hasGen) {
        store.setItem(completedStorageKey({}), payload);
      }
    } catch { /* ignore */ }
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
   * Honor deep-link week/dayIndex only when that day is still an incomplete workout.
   * Returns { week, dayIndex, arrayIndex, day } or null (fall through to findNextWorkoutDay).
   * Same completion key as markDayCompleted / dayCompletionKey.
   */
  function resolveDeepLinkDay(planWeeks, completedSet, urlWeek, urlDayIndex) {
    if (urlWeek == null || urlDayIndex == null || urlWeek === '' || urlDayIndex === '') return null;
    const weekNum = typeof urlWeek === 'number' ? urlWeek : parseInt(urlWeek, 10);
    const dayIndex = typeof urlDayIndex === 'number' ? urlDayIndex : parseInt(urlDayIndex, 10);
    if (!Number.isFinite(weekNum) || !Number.isFinite(dayIndex)) return null;

    const weeks = planWeeks || [];
    const done = completedSet || new Set();
    const weekObj = weeks.find(w => Number(w.week) === weekNum);
    if (!weekObj) return null;

    const days = weekObj.days || [];
    for (let idx = 0; idx < days.length; idx++) {
      const day = days[idx];
      if (!isWorkoutDay(day)) continue;
      const cidx = canonicalDayIndex(day, idx);
      if (Number(cidx) !== dayIndex) continue;
      const key = dayCompletionKey(weekNum, day, idx);
      if (done.has(key)) return null; // already completed — ignore URL
      return { week: weekNum, dayIndex: cidx, arrayIndex: idx, day: day };
    }
    // URL day is not a workout day (or not found)
    return null;
  }

  /**
   * Strip week & dayIndex from a query string / URLSearchParams (keep planId etc.).
   * Returns params.toString() without leading '?'.
   */
  function stripWeekDayIndexFromSearch(search) {
    const raw = typeof search === 'string'
      ? (search.startsWith('?') ? search.slice(1) : search)
      : (search && typeof search.toString === 'function' ? String(search) : '');
    const params = new URLSearchParams(raw);
    params.delete('week');
    params.delete('dayIndex');
    return params.toString();
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
    planWorkoutSequence,
    findNextWorkoutDay,
    completedStorageKey,
    readCompletedKeys,
    resolveGeneratedAt,
    migrateGenCompletionsToSaved,
    loadCompletedSetForPlan,
    planHasWorkoutDay,
    addSessionCompletionKeys,
    writeCompletedKeys,
    runnerSetupHref,
    runnerStartHrefForPlan,
    matchDaySelectOption,
    resolveDeepLinkDay,
    stripWeekDayIndexFromSearch
  };
});
