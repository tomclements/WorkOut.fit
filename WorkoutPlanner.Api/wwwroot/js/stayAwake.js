/**
 * DOM-free stay-awake policy for the runner (node:test + workoutRunner.js).
 * Keep screen awake while an in-progress work/rest session is wanted.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.StayAwake = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function shouldKeepAwake(phase, wanted) {
    return !!wanted && (phase === 'work' || phase === 'rest');
  }

  /** Pause the nosleep video only when releasing stay-awake, not on tab hide. */
  function shouldPauseNoSleepOnHidden(phase, wanted) {
    return !shouldKeepAwake(phase, wanted);
  }

  return {
    shouldKeepAwake,
    shouldPauseNoSleepOnHidden
  };
});
