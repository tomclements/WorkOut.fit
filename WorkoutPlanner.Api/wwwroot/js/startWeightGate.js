/**
 * DOM-free Start weight-gate. Used by workoutRunner.js and node:test.
 *
 * Loaded moves (requiresWorkingWeight) with parseWorkingWeightKg === null
 * need a weight sheet before Start proceeds. Bodyweight / bands / mobility
 * never appear in the missing list. Callers inject the engine helpers so
 * this does not fork runnerEngine.
 *
 * Success / Skip path is always enterRest (Get-ready), never enterWork.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.StartWeightGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function kgForIndex(exercises, kgByIndex, i) {
    if (kgByIndex && Object.prototype.hasOwnProperty.call(kgByIndex, i)) {
      return kgByIndex[i];
    }
    const ex = exercises && exercises[i];
    if (!ex) return null;
    return ex.workingWeightKg ?? null;
  }

  /**
   * Indexes of loaded exercises whose working weight is still unknown.
   */
  function missingWorkingWeightIndexes(exercises, kgByIndex, requiresWorkingWeight, parseWorkingWeightKg) {
    if (typeof requiresWorkingWeight !== 'function' || typeof parseWorkingWeightKg !== 'function') {
      return [];
    }
    const list = exercises || [];
    const missing = [];
    for (let i = 0; i < list.length; i++) {
      if (!requiresWorkingWeight(list[i])) continue;
      if (parseWorkingWeightKg(kgForIndex(list, kgByIndex, i)) == null) missing.push(i);
    }
    return missing;
  }

  /**
   * Start decision.
   * opts.skip === true → proceed to enterRest even when weights are missing.
   * Otherwise missing weights → showWeightSheet (canBegin false).
   * Filled / no missing → enterRest (canBegin true).
   */
  function startDecision(exercises, kgByIndex, requiresWorkingWeight, parseWorkingWeightKg, opts) {
    const missing = missingWorkingWeightIndexes(
      exercises, kgByIndex, requiresWorkingWeight, parseWorkingWeightKg
    );
    if (opts && opts.skip) {
      return { canBegin: true, missing: missing, next: 'enterRest' };
    }
    if (missing.length) {
      return { canBegin: false, missing: missing, next: 'showWeightSheet' };
    }
    return { canBegin: true, missing: [], next: 'enterRest' };
  }

  /**
   * Skip path: dismiss sheet and continue without requiring kg.
   */
  function skipDecision(exercises, kgByIndex, requiresWorkingWeight, parseWorkingWeightKg) {
    return startDecision(exercises, kgByIndex, requiresWorkingWeight, parseWorkingWeightKg, { skip: true });
  }

  return {
    missingWorkingWeightIndexes,
    startDecision,
    skipDecision
  };
});