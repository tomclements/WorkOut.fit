/**
 * DOM-free Start weight-gate. Used by workoutRunner.js and node:test.
 *
 * Loaded moves (requiresWorkingWeight) with parseWorkingWeightKg === null
 * block Start. Bodyweight / bands / mobility never block.
 * Callers inject the engine helpers so this does not fork runnerEngine.
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
   * Start decision. Success path is always enterRest (Get-ready), never enterWork.
   */
  function startDecision(exercises, kgByIndex, requiresWorkingWeight, parseWorkingWeightKg) {
    const missing = missingWorkingWeightIndexes(
      exercises, kgByIndex, requiresWorkingWeight, parseWorkingWeightKg
    );
    if (missing.length) {
      return { canBegin: false, missing: missing, next: 'staySetup' };
    }
    return { canBegin: true, missing: [], next: 'enterRest' };
  }

  return {
    missingWorkingWeightIndexes,
    startDecision
  };
});
