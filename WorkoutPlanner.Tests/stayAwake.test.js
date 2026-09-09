const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const stay = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'stayAwake.js'));

test('shouldKeepAwake only for wanted work/rest', () => {
  assert.equal(stay.shouldKeepAwake('work', true), true);
  assert.equal(stay.shouldKeepAwake('rest', true), true);
  assert.equal(stay.shouldKeepAwake('setup', true), false);
  assert.equal(stay.shouldKeepAwake('finish', true), false);
  assert.equal(stay.shouldKeepAwake('work', false), false);
  assert.equal(stay.shouldKeepAwake('rest', false), false);
});

test('should not pause nosleep on hide while session stay-awake is wanted', () => {
  assert.equal(stay.shouldPauseNoSleepOnHidden('work', true), false);
  assert.equal(stay.shouldPauseNoSleepOnHidden('rest', true), false);
  assert.equal(stay.shouldPauseNoSleepOnHidden('setup', true), true);
  assert.equal(stay.shouldPauseNoSleepOnHidden('finish', false), true);
});

test('workoutRunner wires stay-awake on enterWork/enterRest and visibility', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js'),
    'utf8'
  );
  assert.match(src, /StayAwake/);
  const enterWork = src.slice(src.indexOf('function enterWork'), src.indexOf('function enterRest'));
  const enterRest = src.slice(src.indexOf('function enterRest'), src.indexOf('function finishWorkout'));
  assert.match(enterWork, /requestWakeLock\s*\(/);
  assert.match(enterRest, /requestWakeLock\s*\(/);
  assert.match(src, /shouldPauseNoSleepOnHidden/);
  assert.match(src, /shouldKeepAwake/);
});
