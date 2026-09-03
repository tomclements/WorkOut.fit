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

test('loaded move with blank kg cannot begin and lists that index', () => {
  const exercises = loadedDay();
  const blocked = gate.startDecision(exercises, { 1: null }, requires, parseKg);
  assert.equal(blocked.canBegin, false);
  assert.equal(blocked.next, 'staySetup');
  assert.deepEqual(blocked.missing, [1]);
  assert.deepEqual(gate.missingWorkingWeightIndexes(exercises, {}, requires, parseKg), [1]);
});

test('same move with last-load/Try Y kg can begin', () => {
  const ready = gate.startDecision(loadedDay(), { 1: 22.5 }, requires, parseKg);
  assert.equal(ready.canBegin, true);
  assert.equal(ready.next, 'enterRest');
  assert.deepEqual(ready.missing, []);
});

test('bodyweight-only list can begin', () => {
  const bw = [{ id: 'push-up', name: 'Push Up', phase: 'work', equipment: ['bodyweight'] }];
  const open = gate.startDecision(bw, {}, requires, parseKg);
  assert.equal(open.canBegin, true);
  assert.equal(open.next, 'enterRest');
  assert.deepEqual(open.missing, []);
});

test('after filling the blank, can begin', () => {
  const exercises = loadedDay();
  const before = gate.startDecision(exercises, { 1: null }, requires, parseKg);
  assert.equal(before.canBegin, false);
  const after = gate.startDecision(exercises, { 1: 16 }, requires, parseKg);
  assert.equal(after.canBegin, true);
  assert.equal(after.next, 'enterRest');
});

test('startWorkout success path still calls enterRest not enterWork; missing weights do not enter work', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js'),
    'utf8'
  );
  const start = src.indexOf('async function startWorkout()');
  assert.ok(start >= 0, 'startWorkout missing');
  const nextFn = src.indexOf('\nasync function ', start + 1);
  const nextFn2 = src.indexOf('\nfunction ', start + 1);
  let end = src.length;
  if (nextFn >= 0) end = Math.min(end, nextFn);
  if (nextFn2 >= 0) end = Math.min(end, nextFn2);
  const body = src.slice(start, end);
  assert.match(body, /StartWeightGate/);
  assert.match(body, /if\s*\(\s*!decision\.canBegin\s*\)/);
  assert.match(body, /enterRest\s*\(/);
  assert.equal(body.search(/enterWork\s*\(/), -1);
  const gateAt = body.search(/if\s*\(\s*!decision\.canBegin\s*\)/);
  const createAt = body.indexOf('createSession');
  const restAt = body.search(/enterRest\s*\(/);
  assert.ok(createAt > gateAt, 'gate must run before createSession');
  assert.ok(restAt > gateAt, 'enterRest is the success path after the gate');
  assert.equal(gate.startDecision(loadedDay(), {}, requires, parseKg).next, 'staySetup');
  assert.equal(gate.startDecision(loadedDay(), { 1: 20 }, requires, parseKg).next, 'enterRest');
});
