const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const engine = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'runnerEngine.js'));

const MOVES = [
  { id: 'wu-arm-circles', name: 'Arm Circles', phase: 'warmup', sets: 1, workDuration: 20, rest: 10, primary: ['shoulders'] },
  { id: 'goblet-squat', name: 'Goblet Squat', phase: 'work', sets: 2, workDuration: 30, rest: 45, repsDisplay: '8-12', primary: ['quadriceps'] },
  { id: 'cd-breathe', name: 'Box Breathing', phase: 'cooldown', sets: 1, workDuration: 25, rest: 10, primary: ['full body'] }
];

test('start session is unpaused with a live work clock and first exercise', () => {
  const t0 = 1_000_000;
  const state = engine.createSession(MOVES, t0);
  assert.equal(state.isPaused, false);
  assert.equal(state.phase, 'work');
  assert.equal(engine.currentExercise(state).name, 'Arm Circles');
  assert.equal(engine.remainingSeconds(state, t0), 20);
  assert.equal(engine.remainingSeconds(state, t0 + 5000), 15);
});

test('tick does not advance while paused; resume continues the same remaining time', () => {
  const t0 = 2_000_000;
  const state = engine.createSession(MOVES, t0);
  engine.pause(state, t0 + 4000, false);
  assert.equal(state.isPaused, true);
  assert.equal(engine.remainingSeconds(state, t0 + 4000), 16);
  // 30s later still paused — clock frozen
  assert.equal(engine.remainingSeconds(state, t0 + 34000), 16);
  engine.resume(state, t0 + 34000);
  assert.equal(state.isPaused, false);
  assert.equal(engine.remainingSeconds(state, t0 + 34000), 16);
  assert.equal(engine.remainingSeconds(state, t0 + 36000), 14);
});

test('completeSet is a no-op while paused (Done button must not throw)', () => {
  const state = engine.createSession(MOVES, 0);
  engine.pause(state, 1000, false);
  const result = engine.completeSet(state, 1000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'paused');
  assert.equal(state.currentExerciseIndex, 0);
});

test('Done on last set of a move goes to rest for the next move', () => {
  const t0 = 3_000_000;
  const state = engine.createSession(MOVES, t0);
  const result = engine.completeSet(state, t0 + 5000);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'rest');
  assert.equal(state.currentExerciseIndex, 1);
  assert.equal(engine.currentExercise(state).name, 'Goblet Squat');
  const rest = engine.beginRest(state, t0 + 5000);
  assert.equal(rest.ok, true);
  assert.equal(rest.remaining, 10);
  assert.equal(state.phase, 'rest');
  assert.equal(state.isPaused, false);
});

test('stale saved phaseStartTime does not restore at 00:00', () => {
  const started = 4_000_000;
  const saved = {
    phase: 'work',
    currentExerciseIndex: 1,
    currentSetIndex: 0,
    startTime: started,
    phaseStartTime: started,
    phaseDurationSeconds: 30,
    sessionExercises: MOVES
  };
  const later = started + 10 * 60 * 1000; // 10 minutes later
  const state = engine.restoreSession(saved, later);
  assert.ok(state);
  assert.equal(state.isPaused, false);
  assert.equal(engine.currentExercise(state).name, 'Goblet Squat');
  assert.ok(engine.remainingSeconds(state, later) > 0);
  assert.equal(engine.remainingSeconds(state, later), 30);
});

test('restore backfills completedSets so Done cannot throw', () => {
  const saved = {
    phase: 'work',
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    phaseStartTime: 5_000_000,
    phaseDurationSeconds: 20,
    sessionExercises: [{ id: 'wu-arm-circles', name: 'Arm Circles', phase: 'warmup', sets: 1, workDuration: 20 }]
  };
  const state = engine.restoreSession(saved, 5_000_000);
  const ex = engine.currentExercise(state);
  assert.ok(Array.isArray(ex.completedSets));
  const result = engine.completeSet(state, 5_001_000);
  assert.equal(result.ok, true);
});

test('visibility flicker right after start is ignored', () => {
  const t0 = 6_000_000;
  const state = engine.createSession(MOVES, t0);
  assert.equal(engine.shouldIgnoreVisibility(state, t0 + 100), true);
  assert.equal(engine.shouldIgnoreVisibility(state, t0 + 2000), false);
});

test('normalize accepts PascalCase plan payloads', () => {
  const [ex] = engine.normalizeExercises([
    { Id: 'bench-press', Name: 'Bench Press', WorkDuration: 40, Rest: 70, Sets: 3, Primary: ['chest'] }
  ]);
  assert.equal(ex.id, 'bench-press');
  assert.equal(ex.name, 'Bench Press');
  assert.equal(ex.workDuration, 40);
  assert.equal(ex.rest, 70);
  assert.equal(ex.demoAnimUrl, '/demos/bench-press.webp');
});

test('requiresWorkingWeight is true only for loaded equipment, not bodyweight or mobility', () => {
  assert.equal(engine.requiresWorkingWeight({
    id: 'goblet-squat', name: 'Goblet Squat', phase: 'work', equipment: ['kettlebell']
  }), true);
  assert.equal(engine.requiresWorkingWeight({
    id: 'bench-press', name: 'Bench Press', phase: 'work', equipment: ['barbell', 'bench']
  }), true);
  assert.equal(engine.requiresWorkingWeight({
    id: 'cable-row', name: 'Seated Cable Row', phase: 'work', equipment: ['cable']
  }), true);
  assert.equal(engine.requiresWorkingWeight({
    id: 'farmers-carry', name: "Farmer's Carry", phase: 'work', equipment: ['dumbbells'], isTimeBased: true
  }), true);
  assert.equal(engine.requiresWorkingWeight({
    id: 'push-up', name: 'Push-Up', phase: 'work', equipment: ['bodyweight']
  }), false);
  assert.equal(engine.requiresWorkingWeight({
    id: 'band-pull-apart', name: 'Band Pull-Apart', phase: 'work', equipment: ['bands']
  }), false);
  assert.equal(engine.requiresWorkingWeight({
    id: 'plank', name: 'Plank', phase: 'work', equipment: []
  }), false);
  assert.equal(engine.requiresWorkingWeight({
    id: 'goblet-squat', name: 'Goblet Squat', phase: 'warmup', equipment: ['kettlebell']
  }), false);
  assert.equal(engine.requiresWorkingWeight({
    id: 'cd-breathe', name: 'Box Breathing', phase: 'cooldown', equipment: ['bodyweight']
  }), false);
});

test('parseWorkingWeightKg treats blank as unknown, not zero', () => {
  assert.equal(engine.parseWorkingWeightKg(''), null);
  assert.equal(engine.parseWorkingWeightKg(null), null);
  assert.equal(engine.parseWorkingWeightKg(0), null);
  assert.equal(engine.parseWorkingWeightKg('  '), null);
  assert.equal(engine.parseWorkingWeightKg(24.5), 24.5);
  assert.equal(engine.parseWorkingWeightKg('40'), 40);
});

test('normalizeExercise keeps workingWeightKg and drops invalid load', () => {
  const [loaded] = engine.normalizeExercises([
    { id: 'goblet-squat', name: 'Goblet Squat', equipment: ['kettlebell'], workingWeightKg: 16 }
  ]);
  assert.equal(loaded.workingWeightKg, 16);
  const [blank] = engine.normalizeExercises([
    { id: 'bench-press', name: 'Bench Press', equipment: ['barbell'], workingWeightKg: '' }
  ]);
  assert.equal(blank.workingWeightKg, null);
});

test('completeSet on the last move finishes the session', () => {
  const t0 = 7_000_000;
  const state = engine.createSession(MOVES, t0);
  // burn first two moves
  engine.completeSet(state, t0);
  engine.completeSet(state, t0);
  engine.completeSet(state, t0);
  const last = engine.completeSet(state, t0);
  assert.equal(last.action, 'finish');
  assert.equal(state.phase, 'finish');
});

test('mid-interval restore: 10s into a 30s work keeps remaining and exercise/set', () => {
  const t0 = 8_000_000;
  const saved = {
    phase: 'work',
    currentExerciseIndex: 1,
    currentSetIndex: 0,
    startTime: t0,
    phaseStartTime: t0,
    phaseDurationSeconds: 30,
    sessionExercises: MOVES
  };
  const t1 = t0 + 10_000;
  const state = engine.restoreSession(saved, t1);
  assert.ok(state);
  assert.equal(engine.currentExercise(state).name, 'Goblet Squat');
  assert.equal(state.currentExerciseIndex, 1);
  assert.equal(state.currentSetIndex, 0);
  assert.equal(state.phase, 'work');
  assert.equal(engine.remainingSeconds(state, t1), 20);
});

test('serialize round-trip keeps paused remaining', () => {
  const t0 = 9_000_000;
  const state = engine.createSession(MOVES, t0);
  // Arm Circles is 20s work; pause when 8s remain
  engine.pause(state, t0 + 12_000, false);
  assert.equal(state.isPaused, true);
  assert.equal(engine.remainingSeconds(state, t0 + 12_000), 8);
  const saved = engine.serialize(state);
  assert.equal(saved.isPaused, true);
  assert.ok(saved.pauseStartedAt);
  assert.equal(saved.phase, 'work');
  assert.equal(saved.currentExerciseIndex, 0);
  const later = t0 + 60_000;
  const restored = engine.restoreSession(saved, later);
  assert.ok(restored);
  assert.equal(restored.isPaused, true);
  assert.equal(engine.currentExercise(restored).name, 'Arm Circles');
  assert.equal(engine.remainingSeconds(restored, later), 8);
});
