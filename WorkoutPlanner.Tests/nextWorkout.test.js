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

test('gen-only completions + savedPlanId: findNext is next day not first', () => {
  const plan = {
    generatedAt: 'ts1',
    plan: [monWedFriWeek(1)]
  };
  const store = {
    data: {
      workoutPlanSavedId: '9',
      'runnerCompleted_gen-ts1': JSON.stringify(['1:0'])
      // intentionally no runnerCompleted_saved-9
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  nw.migrateGenCompletionsToSaved({ generatedAt: 'ts1', savedPlanId: 9 }, store);
  const completed = nw.loadCompletedSetForPlan(plan, store);
  assert.ok(completed.has('1:0'));
  const next = nw.findNextWorkoutDay(plan.plan, completed);
  assert.ok(next);
  assert.equal(next.dayIndex, 2);
  assert.notEqual(next.dayIndex, 0);
  assert.equal(next.day.day, 'Wednesday');
  const href = nw.runnerStartHrefForPlan(plan, 9, store);
  assert.ok(href.includes('dayIndex=2'));
  assert.ok(!href.includes('dayIndex=0'));
});

test('matchDaySelectOption Number coercion; no forced options[0] when found set', () => {
  const options = [
    JSON.stringify({ week: 1, dayIndex: 0, arrayIndex: 0 }),
    JSON.stringify({ week: '1', dayIndex: '2', arrayIndex: '2' }),
    JSON.stringify({ week: 1, dayIndex: 4, arrayIndex: 4 })
  ];
  // numbers vs string option fields
  const match = nw.matchDaySelectOption(options, { week: 1, dayIndex: 2, arrayIndex: 2 });
  assert.equal(match, options[1]);

  // string found vs numeric option fields
  const match2 = nw.matchDaySelectOption(
    [JSON.stringify({ week: 1, dayIndex: 0, arrayIndex: 0 }), JSON.stringify({ week: 1, dayIndex: 2, arrayIndex: 2 })],
    { week: '1', dayIndex: '2', arrayIndex: '2' }
  );
  assert.ok(match2.includes('"dayIndex":2') || match2.includes('"dayIndex": 2'));

  // found resolved but no option match → null (caller must not use options[0])
  const miss = nw.matchDaySelectOption(options, { week: 9, dayIndex: 0, arrayIndex: 0 });
  assert.equal(miss, null);
  assert.notEqual(miss, options[0]);

  // !found → null
  assert.equal(nw.matchDaySelectOption(options, null), null);
});

test('stale URL dayIndex=0 with completed 1:0 → ignore URL, next is Wed dayIndex 2', () => {
  const plan = [monWedFriWeek(1)];
  const completed = new Set(['1:0']);
  const deep = nw.resolveDeepLinkDay(plan, completed, '1', '0');
  assert.equal(deep, null);
  const next = nw.findNextWorkoutDay(plan, completed);
  assert.equal(next.week, 1);
  assert.equal(next.dayIndex, 2);
  assert.equal(next.day.day, 'Wednesday');
});

test('URL dayIndex honored when day not completed', () => {
  const plan = [monWedFriWeek(1)];
  const deep = nw.resolveDeepLinkDay(plan, new Set(), 1, 2);
  assert.ok(deep);
  assert.equal(deep.dayIndex, 2);
  assert.equal(deep.arrayIndex, 2);
  assert.equal(deep.day.day, 'Wednesday');
});

test('URL rest day (not workout) ignored → null', () => {
  const plan = [monWedFriWeek(1)];
  assert.equal(nw.resolveDeepLinkDay(plan, new Set(), '1', '1'), null);
});

test('stripWeekDayIndexFromSearch keeps planId, drops week/dayIndex', () => {
  const qs = nw.stripWeekDayIndexFromSearch('planId=9&week=1&dayIndex=0&setup=1');
  assert.ok(qs.includes('planId=9'));
  assert.ok(qs.includes('setup=1'));
  assert.ok(!qs.includes('week='));
  assert.ok(!qs.includes('dayIndex='));
  const afterSelect = nw.stripWeekDayIndexFromSearch('?planId=9&week=1&dayIndex=0');
  assert.equal(afterSelect, 'planId=9');
});


test('API plan lacks generatedAt but gen keys + savedPlanId → completed non-empty', () => {
  // Reproduces live bug: plan from /api/plans/:id has no generatedAt, while
  // completions still live under runnerCompleted_gen-<ts> from local generate.
  const plan = {
    // intentionally no generatedAt on API object
    plan: [monWedFriWeek(1)]
  };
  const store = {
    data: {
      workoutPlanSavedId: '9',
      workoutPlan: JSON.stringify({ generatedAt: 'ts1', plan: [monWedFriWeek(1)] }),
      'runnerCompleted_gen-ts1': JSON.stringify(['1:0'])
      // no runnerCompleted_saved-9 yet
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  };
  const completed = nw.loadCompletedSetForPlan(plan, store);
  assert.ok(completed.has('1:0'), 'must read gen keys via localStorage workoutPlan.generatedAt');
  assert.equal(plan.generatedAt, 'ts1', 'should carry generatedAt onto plan');
  nw.migrateGenCompletionsToSaved({ savedPlanId: 9 }, store); // opts omit generatedAt — resolve from storage
  const saved = JSON.parse(store.getItem('runnerCompleted_saved-9'));
  assert.ok(saved.includes('1:0'));
  const next = nw.findNextWorkoutDay(plan.plan, nw.loadCompletedSetForPlan(plan, store));
  assert.equal(next.dayIndex, 2);
  assert.equal(next.day.day, 'Wednesday');
});

test('writeCompletedKeys dual-writes saved + gen; finish then reload defaults next day', () => {
  const plan = {
    generatedAt: 'ts1',
    plan: [monWedFriWeek(1)]
  };
  const store = {
    data: {
      workoutPlanSavedId: '9',
      workoutPlan: JSON.stringify(plan)
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  };
  // Simulate finish Week1 Monday
  const set = nw.loadCompletedSetForPlan(plan, store);
  set.add('1:0');
  nw.writeCompletedKeys(set, { savedPlanId: 9, generatedAt: 'ts1' }, store);
  assert.deepEqual(JSON.parse(store.getItem('runnerCompleted_saved-9')), ['1:0']);
  assert.deepEqual(JSON.parse(store.getItem('runnerCompleted_gen-ts1')), ['1:0']);

  // Reload with API plan lacking generatedAt (bare /workout.html → saved id path)
  const apiPlan = { plan: [monWedFriWeek(1)] }; // no generatedAt
  store.data.workoutPlan = JSON.stringify({ generatedAt: 'ts1', plan: [monWedFriWeek(1)] });
  const reloaded = nw.loadCompletedSetForPlan(apiPlan, store);
  assert.ok(reloaded.has('1:0'));
  const next = nw.findNextWorkoutDay(apiPlan.plan, reloaded);
  assert.equal(next.dayIndex, 2);
  assert.notEqual(next.dayIndex, 0);
  const href = nw.runnerStartHrefForPlan(apiPlan, 9, store);
  assert.ok(href.includes('dayIndex=2'));
  assert.ok(!href.includes('dayIndex=0'));
});

test('null savedPlanId sessions ignored without planWeeks; credited when local empty + day on plan', () => {
  const set = new Set();
  // Documented gap: null savedPlanId with no planWeeks stays ignored
  nw.addSessionCompletionKeys(set, [
    { savedPlanId: null, week: 1, dayIndex: 0 },
    { savedPlanId: 9, week: 1, dayIndex: 2 }
  ], '9');
  assert.ok(!set.has('1:0'), 'null savedPlanId ignored without planWeeks');
  assert.ok(set.has('1:2'));

  // When local empty and planWeeks provided, credit null-savedPlanId days on plan
  const sparse = new Set();
  nw.addSessionCompletionKeys(sparse, [
    { savedPlanId: null, week: 1, dayIndex: 0 },
    { savedPlanId: null, week: 9, dayIndex: 0 } // not on plan
  ], '9', [monWedFriWeek(1)]);
  assert.ok(sparse.has('1:0'), 'null savedPlanId credited when day exists on current plan');
  assert.ok(!sparse.has('9:0'), 'off-plan null session not credited');

  // When local already has completions, do not absorb null-savedPlanId (avoid cross-plan pollution)
  const rich = new Set(['1:2']);
  nw.addSessionCompletionKeys(rich, [
    { savedPlanId: null, week: 1, dayIndex: 0 }
  ], '9', [monWedFriWeek(1)]);
  assert.ok(!rich.has('1:0'), 'null savedPlanId not absorbed when local not sparse');
});

test('resolveGeneratedAt prefers plan then localStorage workoutPlan', () => {
  const store = {
    data: { workoutPlan: JSON.stringify({ generatedAt: 'from-local' }) },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  assert.equal(nw.resolveGeneratedAt({ generatedAt: 'from-plan' }, store), 'from-plan');
  assert.equal(nw.resolveGeneratedAt({}, store), 'from-local');
  assert.equal(nw.resolveGeneratedAt(null, store), 'from-local');
  assert.equal(nw.resolveGeneratedAt({}, { getItem() { return null; } }), null);
});

test('gen-unknown orphan: read/migrate unions runnerCompleted_gen-unknown with real ts + saved', () => {
  const store = {
    data: {
      'runnerCompleted_gen-unknown': JSON.stringify(['1:0']),
      workoutPlan: JSON.stringify({ generatedAt: 'ts-real' })
    },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  // Real generatedAt + savedPlanId must still see gen-unknown orphans
  const set = nw.readCompletedKeys({ savedPlanId: 9, generatedAt: 'ts-real' }, store);
  assert.ok(set.has('1:0'), 'readCompletedKeys unions gen-unknown orphan');

  const union = nw.migrateGenCompletionsToSaved({ generatedAt: 'ts-real', savedPlanId: 9 }, store);
  assert.ok(union.has('1:0'), 'migrate unions gen-unknown into saved');
  assert.deepEqual(JSON.parse(store.getItem('runnerCompleted_saved-9')), ['1:0']);
  assert.deepEqual(JSON.parse(store.getItem('runnerCompleted_gen-ts-real')), ['1:0']);
});

test('writeCompletedKeys falls back to workoutPlanSavedId when savedPlanId arg null', () => {
  const store = {
    data: { workoutPlanSavedId: '42' },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); }
  };
  nw.writeCompletedKeys(new Set(['1:0', '1:2']), { savedPlanId: null, generatedAt: 'ts1' }, store);
  assert.deepEqual(JSON.parse(store.getItem('runnerCompleted_saved-42')), ['1:0', '1:2']);
  assert.deepEqual(JSON.parse(store.getItem('runnerCompleted_gen-ts1')), ['1:0', '1:2']);
});

test('bare load: null currentSavedPlanId + store saved id + sessions merge via store id', () => {
  // Simulates runner resolveSavedPlanId() fallback: currentSavedPlanId null, store has id
  const storeId = 9;
  const completed = nw.readCompletedKeys({ savedPlanId: null, generatedAt: 'ts1' }, {
    data: { 'runnerCompleted_gen-ts1': JSON.stringify([]) },
    getItem(k) { return this.data[k] ?? null; },
    setItem() {}
  });
  // Session merge as defaultToNextWorkoutDay does with planId = store id
  nw.addSessionCompletionKeys(completed, [
    { savedPlanId: 9, week: 1, dayIndex: 0 },
    { savedPlanId: '9', week: 1, dayIndex: 2 }
  ], storeId, [monWedFriWeek(1)]);
  assert.ok(completed.has('1:0'));
  assert.ok(completed.has('1:2'));
  const next = nw.findNextWorkoutDay([monWedFriWeek(1)], completed);
  assert.equal(next.dayIndex, 4, 'after Mon+Wed sessions, next is Fri');
});
