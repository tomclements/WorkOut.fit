const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const nw = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'nextWorkout.js'));

/** Mon / Wed / Fri as workout; Tue / Thu rest. dayIndex matches array index. */
function monWedFriWeek(weekNum) {
  return {
    week: weekNum,
    days: [
      { day: 'Monday', type: 'workout', dayIndex: 0, focus: 'Push' },
      { day: 'Tuesday', type: 'rest', dayIndex: 1 },
      { day: 'Wednesday', type: 'workout', dayIndex: 2, focus: 'Pull' },
      { day: 'Thursday', type: 'rest', dayIndex: 3 },
      { day: 'Friday', type: 'workout', dayIndex: 4, focus: 'Legs' }
    ]
  };
}

test('Mon/Wed/Fri: completed 1:0 -> next Wed (dayIndex 2)', () => {
  const plan = [monWedFriWeek(1)];
  const next = nw.findNextWorkoutDay(plan, new Set(['1:0']));
  assert.equal(next.week, 1);
  assert.equal(next.dayIndex, 2);
  assert.equal(next.day.day, 'Wednesday');
  assert.equal(next.arrayIndex, 2);
});

test('Mon/Wed/Fri: after Wed -> Fri; after Fri week1 -> week2 first', () => {
  const plan = [monWedFriWeek(1), monWedFriWeek(2)];
  const fri = nw.findNextWorkoutDay(plan, new Set(['1:0', '1:2']));
  assert.equal(fri.dayIndex, 4);
  assert.equal(fri.day.day, 'Friday');

  const week2 = nw.findNextWorkoutDay(plan, new Set(['1:0', '1:2', '1:4']));
  assert.equal(week2.week, 2);
  assert.equal(week2.dayIndex, 0);
  assert.equal(week2.day.day, 'Monday');
});

test('all done -> wrap to first workout (not null)', () => {
  const plan = [monWedFriWeek(1)];
  const next = nw.findNextWorkoutDay(plan, new Set(['1:0', '1:2', '1:4']));
  assert.ok(next);
  assert.equal(next.week, 1);
  assert.equal(next.dayIndex, 0);
  assert.equal(next.day.day, 'Monday');
});

test('rest skipped; mobility with type workout still counts', () => {
  const plan = [{
    week: 1,
    days: [
      { day: 'Mon', type: 'rest', dayIndex: 0 },
      { day: 'Tue', type: 'workout', dayIndex: 1, focus: 'Mobility', sessionStyle: 'mobility' },
      { day: 'Wed', type: 'workout', dayIndex: 2, focus: 'Strength' }
    ]
  }];
  const next = nw.findNextWorkoutDay(plan, new Set());
  assert.equal(next.dayIndex, 1);
  assert.equal(next.day.focus, 'Mobility');
  const after = nw.findNextWorkoutDay(plan, new Set(['1:1']));
  assert.equal(after.dayIndex, 2);
});

test('missing dayIndex / PascalCase DayIndex advances via ?? idx', () => {
  assert.equal(nw.canonicalDayIndex({ dayIndex: 2 }, 9), 2);
  assert.equal(nw.canonicalDayIndex({ DayIndex: 3 }, 9), 3);
  assert.equal(nw.canonicalDayIndex({}, 4), 4);
  assert.equal(nw.dayCompletionKey(1, { DayIndex: 2 }, 9), '1:2');
  assert.equal(nw.dayCompletionKey(1, {}, 5), '1:5');

  const plan = [{
    week: 1,
    days: [
      { day: 'Mon', type: 'workout' },
      { day: 'Tue', type: 'rest' },
      { day: 'Wed', type: 'workout', DayIndex: 2 }
    ]
  }];
  const next = nw.findNextWorkoutDay(plan, new Set(['1:0']));
  assert.equal(next.dayIndex, 2);
  assert.equal(next.arrayIndex, 2);
});

test('completedStorageKey saved/gen shapes', () => {
  assert.equal(nw.completedStorageKey({ savedPlanId: 42 }), 'runnerCompleted_saved-42');
  assert.equal(nw.completedStorageKey({ savedPlanId: '7' }), 'runnerCompleted_saved-7');
  assert.equal(nw.completedStorageKey({ generatedAt: '2026-01-01T00:00:00Z' }), 'runnerCompleted_gen-2026-01-01T00:00:00Z');
  assert.equal(nw.completedStorageKey({}), 'runnerCompleted_gen-unknown');
});

test('addSessionCompletionKeys merges with loose == savedPlanId', () => {
  const set = new Set(['1:0']);
  nw.addSessionCompletionKeys(set, [
    { savedPlanId: 5, week: 1, dayIndex: 2 },
    { savedPlanId: '5', week: 1, dayIndex: 4 },
    { savedPlanId: 99, week: 2, dayIndex: 0 },
    { savedPlanId: 5, week: 1 }
  ], '5');
  assert.ok(set.has('1:0'));
  assert.ok(set.has('1:2'));
  assert.ok(set.has('1:4'));
  assert.ok(!set.has('2:0'));
});

test('runnerSetupHref includes dayIndex=0 when Monday', () => {
  const href = nw.runnerSetupHref({ planId: 9, week: 1, dayIndex: 0 });
  assert.ok(href.includes('setup=1'));
  assert.ok(href.includes('week=1'));
  assert.ok(href.includes('dayIndex=0'));
  assert.ok(href.includes('planId=9'));
  const noPlan = nw.runnerSetupHref({ week: 2, dayIndex: 4 });
  assert.equal(noPlan.startsWith('/workout.html?'), true);
  assert.ok(noPlan.includes('dayIndex=4'));
  assert.ok(!noPlan.includes('planId='));
});

test('readCompletedKeys unions gen + saved', () => {
  const store = {
    data: {
      'runnerCompleted_gen-ts1': JSON.stringify(['1:0']),
      'runnerCompleted_saved-9': JSON.stringify(['1:2'])
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  const set = nw.readCompletedKeys({ savedPlanId: 9, generatedAt: 'ts1' }, store);
  assert.ok(set.has('1:0'));
  assert.ok(set.has('1:2'));
});

test('migrateGenCompletionsToSaved copies gen into saved', () => {
  const store = {
    data: {
      'runnerCompleted_gen-ts1': JSON.stringify(['1:0', '1:2']),
      'runnerCompleted_saved-9': JSON.stringify(['1:4'])
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  const union = nw.migrateGenCompletionsToSaved({ generatedAt: 'ts1', savedPlanId: 9 }, store);
  assert.ok(union.has('1:0'));
  assert.ok(union.has('1:2'));
  assert.ok(union.has('1:4'));
  const saved = JSON.parse(store.getItem('runnerCompleted_saved-9'));
  assert.ok(saved.includes('1:0'));
  assert.ok(saved.includes('1:2'));
  assert.ok(saved.includes('1:4'));
});

test('loadCompletedSetForPlan + runnerStartHrefForPlan deep-link next day', () => {
  const plan = {
    generatedAt: 'ts1',
    plan: [monWedFriWeek(1)]
  };
  const store = {
    data: {
      workoutPlanSavedId: '9',
      'runnerCompleted_gen-ts1': JSON.stringify(['1:0'])
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  const completed = nw.loadCompletedSetForPlan(plan, store);
  assert.ok(completed.has('1:0'));
  const href = nw.runnerStartHrefForPlan(plan, 9, store);
  assert.ok(href.includes('setup=1'));
  assert.ok(href.includes('planId=9'));
  assert.ok(href.includes('week=1'));
  assert.ok(href.includes('dayIndex=2'));
  assert.ok(!href.includes('dayIndex=0'));
});

test('runnerStartHrefForPlan all-done wraps to first day', () => {
  const plan = {
    generatedAt: 'ts1',
    plan: [monWedFriWeek(1)]
  };
  const store = {
    data: {
      'runnerCompleted_gen-ts1': JSON.stringify(['1:0', '1:2', '1:4'])
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  const href = nw.runnerStartHrefForPlan(plan, null, store);
  assert.ok(href.includes('week=1'));
  assert.ok(href.includes('dayIndex=0'));
});

test('after migrate, Start href still advances from gen completions', () => {
  const plan = {
    generatedAt: 'ts1',
    plan: [monWedFriWeek(1), monWedFriWeek(2)]
  };
  const store = {
    data: {
      'runnerCompleted_gen-ts1': JSON.stringify(['1:0'])
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  nw.migrateGenCompletionsToSaved({ generatedAt: 'ts1', savedPlanId: '42' }, store);
  store.setItem('workoutPlanSavedId', '42');
  const href = nw.runnerStartHrefForPlan(plan, 42, store);
  assert.ok(href.includes('dayIndex=2'));
  assert.ok(href.includes('planId=42'));
});
