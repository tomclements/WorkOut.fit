const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'runnerEngine.js'));
const gate = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'startWeightGate.js'));

const requires = engine.requiresWorkingWeight;
const parseKg = engine.parseWorkingWeightKg;

function loadedDay() {
  return [
    { id: 'wu-arm-circles', name: 'Arm Circles', phase: 'warmup', equipment: ['bodyweight'] },
    { id: 'goblet-squat', name: 'Goblet Squat', phase: 'work', equipment: ['dumbbells'] },
    { id: 'cd-breathe', name: 'Box Breathing', phase: 'cooldown', equipment: ['bodyweight'] }
  ];
}

function sliceFunction(src, name) {
  const start = src.indexOf(name);
  assert.ok(start >= 0, name + ' missing');
  const nextFn = src.indexOf('\nasync function ', start + 1);
  const nextFn2 = src.indexOf('\nfunction ', start + 1);
  let end = src.length;
  if (nextFn >= 0) end = Math.min(end, nextFn);
  if (nextFn2 >= 0) end = Math.min(end, nextFn2);
  // Also stop at a top-level let/const after the closing brace region for startWorkout
  return src.slice(start, end);
}

test('missing loaded → showWeightSheet / canBegin false until Continue or Skip', () => {
  const exercises = loadedDay();
  const blocked = gate.startDecision(exercises, { 1: null }, requires, parseKg);
  assert.equal(blocked.canBegin, false);
  assert.equal(blocked.next, 'showWeightSheet');
  assert.deepEqual(blocked.missing, [1]);
  assert.deepEqual(gate.missingWorkingWeightIndexes(exercises, {}, requires, parseKg), [1]);
});

test('Skip → next enterRest even with missing', () => {
  const exercises = loadedDay();
  const skipped = gate.skipDecision(exercises, {}, requires, parseKg);
  assert.equal(skipped.canBegin, true);
  assert.equal(skipped.next, 'enterRest');
  assert.deepEqual(skipped.missing, [1]);
  const viaOpts = gate.startDecision(exercises, { 1: null }, requires, parseKg, { skip: true });
  assert.equal(viaOpts.canBegin, true);
  assert.equal(viaOpts.next, 'enterRest');
});

test('filled via Try Y / kg → Continue → enterRest', () => {
  const ready = gate.startDecision(loadedDay(), { 1: 22.5 }, requires, parseKg);
  assert.equal(ready.canBegin, true);
  assert.equal(ready.next, 'enterRest');
  assert.deepEqual(ready.missing, []);
});

test('bodyweight-only → no sheet, enterRest', () => {
  const bw = [{ id: 'push-up', name: 'Push Up', phase: 'work', equipment: ['bodyweight'] }];
  const open = gate.startDecision(bw, {}, requires, parseKg);
  assert.equal(open.canBegin, true);
  assert.equal(open.next, 'enterRest');
  assert.deepEqual(open.missing, []);
});

test('after filling the blank, can begin (Continue path)', () => {
  const exercises = loadedDay();
  const before = gate.startDecision(exercises, { 1: null }, requires, parseKg);
  assert.equal(before.canBegin, false);
  assert.equal(before.next, 'showWeightSheet');
  const after = gate.startDecision(exercises, { 1: 16 }, requires, parseKg);
  assert.equal(after.canBegin, true);
  assert.equal(after.next, 'enterRest');
});

test('blank/0 still counts as missing for loaded moves', () => {
  const exercises = loadedDay();
  assert.deepEqual(gate.missingWorkingWeightIndexes(exercises, { 1: null }, requires, parseKg), [1]);
  assert.deepEqual(gate.missingWorkingWeightIndexes(exercises, { 1: 0 }, requires, parseKg), [1]);
  assert.deepEqual(gate.missingWorkingWeightIndexes(exercises, { 1: '' }, requires, parseKg), [1]);
  assert.deepEqual(gate.missingWorkingWeightIndexes(exercises, { 1: 20 }, requires, parseKg), []);
});

test('startWorkout success path still calls enterRest not enterWork; sheet path present', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js'),
    'utf8'
  );
  const body = sliceFunction(src, 'async function startWorkout()');
  assert.match(body, /StartWeightGate/);
  assert.match(body, /openWeightSheet|showWeightSheet|weightSheet/);
  assert.match(body, /beginWorkoutFromMapped\s*\(/);
  assert.equal(body.search(/enterWork\s*\(/), -1);

  const begin = sliceFunction(src, 'function beginWorkoutFromMapped');
  assert.match(begin, /createSession/);
  assert.match(begin, /enterRest\s*\(/);
  assert.equal(begin.search(/enterWork\s*\(/), -1);
  const createAt = begin.indexOf('createSession');
  const restAt = begin.search(/enterRest\s*\(/);
  assert.ok(createAt >= 0 && restAt > createAt, 'createSession then enterRest on success path');

  const gateAt = body.search(/StartWeightGate|startDecision|openWeightSheet/);
  const beginAt = body.search(/beginWorkoutFromMapped\s*\(/);
  assert.ok(gateAt >= 0 && beginAt > gateAt, 'gate/sheet before begin');

  assert.equal(gate.startDecision(loadedDay(), {}, requires, parseKg).next, 'showWeightSheet');
  assert.equal(gate.startDecision(loadedDay(), { 1: 20 }, requires, parseKg).next, 'enterRest');
});