const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const QuitWorkout = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'quitWorkout.js'));

const BENCH_DONE = { id: 'bench-press', name: 'Bench Press', sets: 2, workingWeightKg: 80, completedSets: [{ reps: 0, durationSeconds: 12 }] };
const BENCH_PARTIAL = { id: 'bench-press', name: 'Bench Press', sets: 2, workingWeightKg: 80, completedSets: [{ reps: 0, durationSeconds: 12 }, { reps: 0, durationSeconds: 0 }] };
const SQUAT_SKIP_ONLY = { id: 'goblet-squat', name: 'Goblet Squat', sets: 2, completedSets: [{ reps: 0, durationSeconds: 0 }, { reps: 0, durationSeconds: 0 }] };
const UNTOUCHED = { id: 'push-up', name: 'Push-Up', sets: 3, completedSets: [] };

// ---------------- isDoneSet ----------------

test('isDoneSet counts Engine set with duration > 0 as done', () => {
  assert.equal(QuitWorkout.isDoneSet({ reps: 0, durationSeconds: 12 }), true);
});

test('isDoneSet rejects skip-pad set with duration 0', () => {
  assert.equal(QuitWorkout.isDoneSet({ reps: 0, durationSeconds: 0 }), false);
});

test('isDoneSet rejects null, undefined and missing duration', () => {
  assert.equal(QuitWorkout.isDoneSet(null), false);
  assert.equal(QuitWorkout.isDoneSet(undefined), false);
  assert.equal(QuitWorkout.isDoneSet({ reps: 5 }), false);
});

// ---------------- countDoneSets / quitOptions ----------------

test('countDoneSets and quitOptions for no sets done', () => {
  assert.deepEqual(QuitWorkout.countDoneSets([]), { done: 0, total: 0 });
  assert.deepEqual(QuitWorkout.quitOptions([UNTOUCHED]), { canSave: false, done: 0, total: 3 });
});

test('countDoneSets and quitOptions for one done set', () => {
  assert.deepEqual(QuitWorkout.countDoneSets([BENCH_DONE]), { done: 1, total: 2 });
  assert.deepEqual(QuitWorkout.quitOptions([BENCH_DONE]), { canSave: true, done: 1, total: 2 });
});

test('countDoneSets treats skip-padded-only exercises as not done', () => {
  assert.deepEqual(QuitWorkout.countDoneSets([SQUAT_SKIP_ONLY]), { done: 0, total: 2 });
  assert.deepEqual(QuitWorkout.quitOptions([SQUAT_SKIP_ONLY]), { canSave: false, done: 0, total: 2 });
});

test('countDoneSets totals use max(1, sets)', () => {
  assert.deepEqual(QuitWorkout.countDoneSets([{ completedSets: [{ durationSeconds: 1 }] }]), { done: 1, total: 1 });
  assert.deepEqual(QuitWorkout.countDoneSets([{ sets: 0, completedSets: [{ durationSeconds: 1 }] }]), { done: 1, total: 1 });
});

// ---------------- activeDurationSeconds ----------------

test('activeDurationSeconds returns whole seconds and stops counting while paused', () => {
  const start = 1_000_000;
  const now = 1_000_000 + 12_500;
  assert.equal(QuitWorkout.activeDurationSeconds({ startTime: start, now, isPaused: false, pauseStartTime: 0 }), 12);

  const pausedAt = 1_000_000 + 5_000;
  assert.equal(QuitWorkout.activeDurationSeconds({ startTime: start, now, isPaused: true, pauseStartTime: pausedAt }), 5);
});

test('activeDurationSeconds is never negative when now is before start', () => {
  assert.equal(QuitWorkout.activeDurationSeconds({ startTime: 1_000_000, now: 500_000, isPaused: false }), 0);
});

test('activeDurationSeconds returns 0 for missing or invalid startTime', () => {
  assert.equal(QuitWorkout.activeDurationSeconds({ now: 1_000_000 }), 0);
  assert.equal(QuitWorkout.activeDurationSeconds({ startTime: null, now: 1_000_000 }), 0);
  assert.equal(QuitWorkout.activeDurationSeconds({ startTime: 'bad', now: 1_000_000 }), 0);
});

// ---------------- buildPartialSessionPayload ----------------

test('buildPartialSessionPayload returns null with 0 done sets', () => {
  assert.equal(QuitWorkout.buildPartialSessionPayload({ sessionExercises: [UNTOUCHED] }), null);
});

test('payload leaves out untouched and skip-only exercises', () => {
  const payload = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_DONE, SQUAT_SKIP_ONLY, UNTOUCHED],
    planName: 'Test Plan',
    savedPlanId: 42,
    week: 2,
    dayIndex: 3,
    startTime: 1_000_000,
    now: 1_000_000 + 12_500,
    isPaused: false,
    pauseStartTime: 0
  });
  assert.ok(payload);
  assert.equal(payload.exercises.length, 1);
  assert.equal(payload.exercises[0].exerciseId, 'bench-press');
  assert.equal(payload.exercises[0].sets.length, 1);
  assert.equal(payload.exercises[0].sets[0].durationSeconds, 12);
});

test('payload leaves out skip pads inside a partly done exercise', () => {
  const payload = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_PARTIAL],
    startTime: 1_000_000,
    now: 1_000_000 + 12_500
  });
  assert.equal(payload.exercises[0].sets.length, 1);
  assert.equal(payload.exercises[0].sets[0].durationSeconds, 12);
});

test('payload targetSets is at least 1', () => {
  const payload = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [{ id: 'x', name: 'X', completedSets: [{ durationSeconds: 1 }] }],
    startTime: 1_000_000,
    now: 1_000_000 + 1_000
  });
  assert.equal(payload.exercises[0].targetSets, 1);
});

test('payload weightKg passes through and null stays null', () => {
  const withWeight = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_DONE],
    startTime: 1_000_000,
    now: 1_000_000 + 1_000
  });
  assert.equal(withWeight.exercises[0].weightKg, 80);

  const noWeight = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [{ id: 'push-up', name: 'Push-Up', sets: 1, completedSets: [{ durationSeconds: 5 }] }],
    startTime: 1_000_000,
    now: 1_000_000 + 1_000
  });
  assert.equal(noWeight.exercises[0].weightKg, null);
});

test('payload ISO dates and duration are correct', () => {
  const start = new Date('2026-08-27T12:00:00.000Z').getTime();
  const now = start + 12_500;
  const payload = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_DONE],
    startTime: start,
    now
  });
  assert.equal(payload.startedAt, '2026-08-27T12:00:00.000Z');
  assert.equal(payload.completedAt, '2026-08-27T12:00:12.500Z');
  assert.equal(payload.durationSeconds, 12);
});

test('payload week and dayIndex fallbacks', () => {
  const payload = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_DONE],
    startTime: 1_000_000,
    now: 1_000_000 + 1_000
  });
  assert.equal(payload.week, 1);
  assert.equal(payload.dayIndex, 0);

  const explicitZero = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_DONE],
    week: null,
    dayIndex: 0,
    startTime: 1_000_000,
    now: 1_000_000 + 1_000
  });
  assert.equal(explicitZero.week, 1);
  assert.equal(explicitZero.dayIndex, 0);
});

test('payload blank planName becomes Plan4Strength and is capped at 200 chars', () => {
  const blank = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_DONE],
    planName: '   ',
    startTime: 1_000_000,
    now: 1_000_000 + 1_000
  });
  assert.equal(blank.planName, 'Plan4Strength');

  const long = 'x'.repeat(250);
  const capped = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_DONE],
    planName: long,
    startTime: 1_000_000,
    now: 1_000_000 + 1_000
  });
  assert.equal(capped.planName.length, 200);
});

// ---------------- quitDecision ----------------

test('quitDecision save with done > 0 posts, marks complete and tears down', () => {
  assert.deepEqual(QuitWorkout.quitDecision('save', [BENCH_DONE]), { post: true, markComplete: true, teardown: true });
});

test('quitDecision save with 0 done becomes discard semantics', () => {
  assert.deepEqual(QuitWorkout.quitDecision('save', [UNTOUCHED]), { post: false, markComplete: false, teardown: true });
});

test('quitDecision discard tears down without posting or marking complete', () => {
  assert.deepEqual(QuitWorkout.quitDecision('discard', [BENCH_DONE]), { post: false, markComplete: false, teardown: true });
});

test('quitDecision keep does nothing destructive', () => {
  assert.deepEqual(QuitWorkout.quitDecision('keep', [BENCH_DONE]), { post: false, markComplete: false, teardown: false });
});

// ---------------- server validator compatibility ----------------

test('payload satisfies server validator rules', () => {
  const payload = QuitWorkout.buildPartialSessionPayload({
    sessionExercises: [BENCH_DONE],
    planName: 'Test',
    startTime: 1_000_000,
    now: 1_000_000 + 1_000
  });
  assert.ok(payload.planName.length >= 1 && payload.planName.length <= 200);
  for (const ex of payload.exercises) {
    assert.ok(ex.exerciseId && ex.exerciseId.length > 0, 'exerciseId required');
    assert.ok(ex.exerciseName && ex.exerciseName.length > 0, 'exerciseName required');
    assert.ok(ex.targetSets > 0, 'targetSets > 0');
    assert.ok(ex.weightKg === null || (ex.weightKg >= 0.25 && ex.weightKg <= 500), 'weightKg in valid range when present');
  }
});

// ---------------- runner wiring ----------------

test('workoutRunner reads window.QuitWorkout with a fallback', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js'),
    'utf8'
  );
  assert.match(src, /QuitWorkout/);
  assert.match(src, /teardownSession\s*\(/);
});

test('Quit > Discard awaits teardown then navigates to dashboard root', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js'),
    'utf8'
  );
  const fn = src.match(/async function onQuitDiscard\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(fn, 'onQuitDiscard function found');
  const body = fn[0];
  assert.match(body, /await\s+teardownSession\s*\(\)/, 'discard awaits teardown first');
  assert.match(body, /window\.location\.href\s*=\s*['"]\/['"]/, 'discard navigates to /');
});

test('Quit > Save does not navigate on success; failed save keeps sheet open for retry/discard/keep-going', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js'),
    'utf8'
  );
  const fn = src.match(/async function onQuitSave\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(fn, 'onQuitSave function found');
  const body = fn[0];
  assert.doesNotMatch(body, /window\.location\.href\s*=/, 'successful Save stays on setup');
  assert.match(body, /setQuitButtonsDisabled\(false\)/, 'failed save re-enables buttons');
  assert.match(body, /return;/, 'failed save returns early without teardown');
  assert.match(body, /keep going/i, 'keep-going option is referenced in failure copy');
});

test('Keep going only closes sheet and resumes; it does not save, teardown or navigate', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js'),
    'utf8'
  );
  const fn = src.match(/function keepGoing\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(fn, 'keepGoing function found');
  const body = fn[0];
  assert.doesNotMatch(body, /teardownSession/, 'keep going does not teardown');
  assert.doesNotMatch(body, /window\.location\.href\s*=/, 'keep going does not navigate');
  assert.doesNotMatch(body, /postSessionPayload|markDayCompleted/, 'keep going does not save');
});

function loadQuitHandlers(overrides = {}) {
  const vm = require('node:vm');
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js'), 'utf8');
  const events = [];
  const location = { get href() { return '/workout.html'; }, set href(value) { events.push(`navigate:${value}`); } };
  const ctx = {
    events, window: { location }, Date,
    QuitWorkout: {
      quitOptions: () => ({ canSave: true, done: 1 }),
      quitDecision: () => ({ post: true, markComplete: true }),
      buildPartialSessionPayload: () => ({ exercises: [] })
    },
    sessionExercises: [], currentUser: 'qa', sessionPlanName: 'Mock plan',
    resolveSavedPlanId: () => null, selectedWeek: 1, selectedDayIndex: 0,
    startTime: Date.now(), isPaused: false, pauseStartTime: null, sessionSaved: false,
    quitWorkoutStatus: { classList: { remove() {} } },
    setQuitButtonsDisabled: (disabled) => events.push(`disabled:${disabled}`),
    postSessionPayload: async () => { events.push('post'); },
    markDayCompleted: () => events.push('markComplete'),
    teardownSession: async () => { events.push('teardown'); },
    showToast: () => events.push('toast'),
    quitAutoPaused: true,
    closeQuitSheet: () => { events.push('close'); return { focus: () => events.push('focus') }; },
    resumeWorkout: () => events.push('resume'),
    ...overrides
  };
  vm.createContext(ctx);
  for (const name of ['onQuitDiscard', 'onQuitSave', 'keepGoing']) {
    const match = src.match(new RegExp(`(?:async )?function ${name}\\(\\)\\s*\\{[\\s\\S]*?\\n  \\}`));
    assert.ok(match, `${name} found`);
    vm.runInContext(match[0], ctx);
  }
  return ctx;
}

test('Discard behavior waits for teardown, navigates once, never posts or marks complete', async () => {
  let finish;
  const ctx = loadQuitHandlers({ teardownSession: () => new Promise(resolve => { finish = resolve; }) });
  const pending = ctx.onQuitDiscard();
  assert.deepEqual(ctx.events, []);
  finish();
  await pending;
  assert.deepEqual(ctx.events, ['toast', 'navigate:/']);
});

test('Save behavior posts and tears down without changing destination', async () => {
  const ctx = loadQuitHandlers();
  await ctx.onQuitSave();
  assert.deepEqual(ctx.events, ['disabled:true', 'post', 'markComplete', 'teardown', 'toast']);
  assert.equal(ctx.sessionSaved, true);
});

test('Save failure keeps state, reenables actions, and Keep going resumes without navigation', async () => {
  const ctx = loadQuitHandlers({ postSessionPayload: async () => { throw new Error('offline'); } });
  await ctx.onQuitSave();
  assert.deepEqual(ctx.events, ['disabled:true', 'disabled:false']);
  assert.equal(ctx.sessionSaved, false);
  assert.match(ctx.quitWorkoutStatus.textContent, /Try again, discard, or keep going/);
  ctx.keepGoing();
  assert.deepEqual(ctx.events, ['disabled:true', 'disabled:false', 'close', 'resume', 'focus']);
});
