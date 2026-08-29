/**
 * Pure workout-runner session math.
 * Used by workoutRunner.js and by node:test (no DOM).
 *
 * The bugs this encodes:
 *  - Start must clear paused flags or the clock never ticks.
 *  - Resume of a stale phaseStartTime must not sit at 00:00 with a dead Done button.
 *  - completeSet must tolerate missing completedSets.
 *  - current exercise must be null-safe so a bad index cannot abort rendering.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.RunnerEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function asInt(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function workSeconds(ex) {
    const d = asInt(ex && (ex.workDuration ?? ex.WorkDuration), 0);
    return d > 0 ? d : 30;
  }

  function restSeconds(ex) {
    const d = asInt(ex && (ex.rest ?? ex.Rest), 0);
    return d > 0 ? d : 45;
  }

  function exercisePhase(ex) {
    return String((ex && ex.phase) || 'work').toLowerCase();
  }

  function isMobilityExercise(ex) {
    const p = exercisePhase(ex);
    return p === 'warmup' || p === 'cooldown';
  }

  /** Equipment that actually has a working load in kg (not bands/bodyweight/accessories). */
  const LOADED_EQUIPMENT = {
    barbell: true,
    dumbbells: true,
    kettlebell: true,
    'ez-bar': true,
    cable: true,
    machines: true,
    'medicine-ball': true
  };

  function equipmentList(ex) {
    const raw = (ex && (ex.equipment || ex.Equipment)) || [];
    return Array.isArray(raw) ? raw.map(e => String(e).toLowerCase()) : [];
  }

  /**
   * True when the runner should offer a working-weight field.
   * Bodyweight, no-equipment, bands, and warmup/cooldown (timed mobility) do not.
   * Loaded time-based work (e.g. farmer's carry) still qualifies.
   */
  function requiresWorkingWeight(ex) {
    if (!ex) return false;
    if (isMobilityExercise(ex)) return false;
    return equipmentList(ex).some(id => LOADED_EQUIPMENT[id]);
  }

  /** Blank/zero/invalid → null (unknown). Positive kg rounded to 2 dp. */
  function parseWorkingWeightKg(value) {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100) / 100;
  }

  function normalizeExercise(ex) {
    if (!ex || typeof ex !== 'object') return null;
    const id = ex.id || ex.Id || '';
    const sets = Math.max(1, asInt(ex.sets ?? ex.Sets, 1));
    return {
      ...ex,
      id,
      name: ex.name || ex.Name || 'Exercise',
      sets,
      repsDisplay: ex.repsDisplay || ex.RepsDisplay || ex.reps || '',
      workDuration: workSeconds(ex),
      rest: restSeconds(ex),
      phase: exercisePhase(ex),
      primary: ex.primary || ex.Primary || ex.targets || [],
      equipment: ex.equipment || ex.Equipment || [],
      demoAnimUrl: ex.demoAnimUrl || (id ? `/demos/${id}.webp` : null),
      imageUrl: ex.imageUrl || ex.ImageUrl || '',
      demoUrl: ex.demoUrl || ex.DemoUrl || '',
      workingWeightKg: parseWorkingWeightKg(ex.workingWeightKg ?? ex.weightKg ?? ex.WeightKg),
      completedSets: Array.isArray(ex.completedSets) ? ex.completedSets.slice() : []
    };
  }

  function normalizeExercises(list) {
    return (list || []).map(normalizeExercise).filter(Boolean);
  }

  function createSession(exercises, now) {
    const t = now || Date.now();
    const sessionExercises = normalizeExercises(exercises);
    return {
      sessionExercises,
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      phase: sessionExercises.length ? 'work' : 'setup',
      startTime: t,
      phaseStartTime: t,
      phaseDurationSeconds: sessionExercises.length ? workSeconds(sessionExercises[0]) : 30,
      isPaused: false,
      autoPaused: false,
      pauseAccumulatedMs: 0,
      ignoreVisibilityUntil: t + 800,
      sessionSaved: false
    };
  }

  function currentExercise(state) {
    if (!state || !Array.isArray(state.sessionExercises)) return null;
    return state.sessionExercises[state.currentExerciseIndex] || null;
  }

  function clockNow(state, now) {
    const t = now || Date.now();
    if (state && state.isPaused && state.pauseStartedAt) return state.pauseStartedAt;
    return t;
  }

  function remainingSeconds(state, now) {
    if (!state) return 0;
    const t = clockNow(state, now);
    const elapsedMs = Math.max(0, t - (state.phaseStartTime || t) - (state.pauseAccumulatedMs || 0));
    const elapsed = Math.floor(elapsedMs / 1000);
    const duration = Math.max(1, state.phaseDurationSeconds || 30);
    return Math.max(0, duration - elapsed);
  }

  function elapsedSeconds(state, now) {
    if (!state) return 0;
    const t = clockNow(state, now);
    const elapsedMs = Math.max(0, t - (state.phaseStartTime || t) - (state.pauseAccumulatedMs || 0));
    return Math.floor(elapsedMs / 1000);
  }

  function pause(state, now, auto) {
    const t = now || Date.now();
    if (!state || state.isPaused) return state;
    if (state.phase !== 'work' && state.phase !== 'rest') return state;
    state.isPaused = true;
    state.autoPaused = !!auto;
    state.pauseStartedAt = t;
    return state;
  }

  function resume(state, now) {
    const t = now || Date.now();
    if (!state || !state.isPaused) return state;
    const pauseMs = Math.max(0, t - (state.pauseStartedAt || t));
    state.phaseStartTime = (state.phaseStartTime || t) + pauseMs;
    if (state.startTime) state.startTime += pauseMs;
    state.isPaused = false;
    state.autoPaused = false;
    state.pauseStartedAt = 0;
    return state;
  }

  /**
   * Restore a serialized session. If the saved clock has already expired,
   * restart the current interval instead of presenting 00:00 with a dead UI.
   */
  function restoreSession(saved, now) {
    const t = now || Date.now();
    if (!saved) return null;
    const sessionExercises = normalizeExercises(saved.sessionExercises);
    if (!sessionExercises.length) return null;

    const state = {
      sessionExercises,
      currentExerciseIndex: Math.max(0, Math.min(saved.currentExerciseIndex || 0, sessionExercises.length - 1)),
      currentSetIndex: Math.max(0, saved.currentSetIndex || 0),
      phase: saved.phase === 'rest' ? 'rest' : 'work',
      startTime: saved.startTime || t,
      phaseStartTime: saved.phaseStartTime || t,
      phaseDurationSeconds: saved.phaseDurationSeconds || 30,
      isPaused: false,
      autoPaused: false,
      pauseAccumulatedMs: 0,
      ignoreVisibilityUntil: t + 800,
      sessionSaved: false,
      planName: saved.planName,
      musicStyle: saved.musicStyle,
      musicWasPlaying: !!saved.musicWasPlaying
    };

    const ex = currentExercise(state);
    if (!ex) return null;
    if (state.currentSetIndex >= (ex.sets || 1)) state.currentSetIndex = 0;

    if (state.phase === 'work') {
      state.phaseDurationSeconds = workSeconds(ex);
    } else {
      const prevIdx = state.currentSetIndex === 0 ? state.currentExerciseIndex - 1 : state.currentExerciseIndex;
      const restSource = sessionExercises[Math.max(0, prevIdx)] || ex;
      state.phaseDurationSeconds = restSeconds(restSource);
    }

    if (remainingSeconds(state, t) <= 0) {
      state.phaseStartTime = t;
    }
    return state;
  }

  function beginWork(state, now, resuming) {
    const t = now || Date.now();
    const ex = currentExercise(state);
    if (!state || !ex) return { ok: false, reason: 'no-exercise' };
    state.phase = 'work';
    state.phaseDurationSeconds = workSeconds(ex);
    state.isPaused = false;
    state.autoPaused = false;
    if (!resuming) {
      state.phaseStartTime = t;
      state.pauseAccumulatedMs = 0;
    } else if (remainingSeconds(state, t) <= 0) {
      state.phaseStartTime = t;
    }
    return { ok: true, exercise: ex, remaining: remainingSeconds(state, t) };
  }

  function beginRest(state, now) {
    const t = now || Date.now();
    const nextEx = currentExercise(state);
    if (!state || !nextEx) return { ok: false, reason: 'no-exercise' };
    const prevIdx = state.currentSetIndex === 0 ? state.currentExerciseIndex - 1 : state.currentExerciseIndex;
    const restSource = state.sessionExercises[Math.max(0, prevIdx)] || nextEx;
    state.phase = 'rest';
    state.phaseStartTime = t;
    state.pauseAccumulatedMs = 0;
    state.isPaused = false;
    state.autoPaused = false;
    state.phaseDurationSeconds = restSeconds(restSource);
    return { ok: true, nextExercise: nextEx, remaining: state.phaseDurationSeconds };
  }

  function completeSet(state, now) {
    if (!state) return { ok: false, reason: 'no-state' };
    if (state.isPaused) return { ok: false, reason: 'paused' };
    if (state.phase !== 'work') return { ok: false, reason: 'not-work' };
    const ex = currentExercise(state);
    if (!ex) return { ok: false, reason: 'no-exercise' };
    if (!Array.isArray(ex.completedSets)) ex.completedSets = [];

    const duration = Math.min(elapsedSeconds(state, now), state.phaseDurationSeconds || workSeconds(ex));
    ex.completedSets.push({
      reps: 0,
      durationSeconds: Math.max(1, duration || state.phaseDurationSeconds || 1)
    });

    const isLastSet = state.currentSetIndex + 1 >= (ex.sets || 1);
    const isLastExercise = state.currentExerciseIndex + 1 >= state.sessionExercises.length;

    if (isLastSet && isLastExercise) {
      state.phase = 'finish';
      return { ok: true, action: 'finish' };
    }
    if (isLastSet) {
      state.currentExerciseIndex += 1;
      state.currentSetIndex = 0;
    } else {
      state.currentSetIndex += 1;
    }
    return { ok: true, action: 'rest' };
  }

  function shouldIgnoreVisibility(state, now) {
    const t = now || Date.now();
    return !!(state && state.ignoreVisibilityUntil && t < state.ignoreVisibilityUntil);
  }

  function serialize(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      currentExerciseIndex: state.currentExerciseIndex,
      currentSetIndex: state.currentSetIndex,
      startTime: state.startTime,
      phaseStartTime: state.phaseStartTime,
      phaseDurationSeconds: state.phaseDurationSeconds,
      sessionExercises: state.sessionExercises,
      planName: state.planName,
      musicStyle: state.musicStyle,
      musicWasPlaying: state.musicWasPlaying
    };
  }

  return {
    asInt,
    workSeconds,
    restSeconds,
    exercisePhase,
    isMobilityExercise,
    requiresWorkingWeight,
    parseWorkingWeightKg,
    normalizeExercise,
    normalizeExercises,
    createSession,
    currentExercise,
    remainingSeconds,
    elapsedSeconds,
    pause,
    resume,
    restoreSession,
    beginWork,
    beginRest,
    completeSet,
    shouldIgnoreVisibility,
    serialize
  };
});
