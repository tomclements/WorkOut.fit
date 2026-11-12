const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runnerPath = path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'workoutRunner.js');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');

function loadRunnerWithExercise(ex) {
  const elements = {};
  const byId = (id) => {
    if (!elements[id]) elements[id] = { classList: { add() {}, remove() {}, toggle() { return false; } }, textContent: '', innerHTML: '', style: {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; }, dataset: {}, appendChild() {}, remove() {}, contains() { return false; }, focus() {}, dispatchEvent() { return true; } };
    return elements[id];
  };
  const document = {
    getElementById: byId,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    body: { classList: { add() {}, remove() {}, toggle() { return false; } }, style: {}, appendChild() {} },
    createElement: (tag) => byId(tag + '-' + Math.random()),
    documentElement: { style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() { return false; } } }
  };
  const window = {
    document,
    location: { search: '', pathname: '/workout.html', href: 'https://example.com/workout.html', replace() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    addEventListener() {},
    AudioContext: function () { this.state = 'running'; this.resume = async () => {}; this.close = async () => {}; },
    webkitAudioContext: function () { this.state = 'running'; this.resume = async () => {}; this.close = async () => {}; },
    escapeHtml: (s) => s ? String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : '',
    RunnerEngine: null,
    OverflowSettings: null,
    StartWeightGate: null,
    StayAwake: null,
    AudioCoexistence: require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'audioCoexistence.js')),
    QuitWorkout: null,
    speechSynthesis: null,
    navigator: { wakeLock: { request: async () => ({ addEventListener() {} }) } }
  };
  window.window = window;
  const context = { document, window, console: { log() {}, error() {}, warn() {} } };
  vm.createContext(context);
  vm.runInContext(runnerSource, context, { filename: runnerPath });
  return { window, document, exerciseMediaHtml: context.exerciseMediaHtml };
}

test('exerciseMediaHtml compact skips the duplicate cue; coaching text is rendered separately', () => {
  const progression = 'Soft landings; skip or step-jacks if joints prefer';
  const ex = {
    id: 'wu-jacks',
    name: 'Jumping jacks',
    progression,
    primary: ['shoulders'],
    demoUrl: 'https://example.com/demo',
    imageUrl: 'https://example.com/0.jpg'
  };
  const { exerciseMediaHtml } = loadRunnerWithExercise(ex);
  const html = exerciseMediaHtml(ex, { compact: true });
  const count = (html.match(/Soft landings; skip or step-jacks if joints prefer/g) || []).length;
  assert.equal(count, 0, 'compact rest media does not include the progression cue');
  assert.ok(!html.includes('demo-caption'), 'compact rest media has no demo-caption');
});

test('exerciseMediaHtml never renders the duplicate demo caption (cue lives in rest coaching only)', () => {
  const ex = {
    id: 'wu-jacks',
    name: 'Jumping jacks',
    phase: 'warmup',
    progression: 'Soft landings; skip or step-jacks if joints prefer',
    primary: ['shoulders'],
    demoUrl: 'https://example.com/demo',
    imageUrl: 'https://example.com/0.jpg'
  };
  const { exerciseMediaHtml } = loadRunnerWithExercise(ex);
  for (const compact of [true, false]) {
    const html = exerciseMediaHtml(ex, { compact });
    assert.ok(!html.includes('demo-caption'), `no demo-caption (compact=${compact})`);
    assert.ok(!html.includes('Soft landings'), `no progression cue in media (compact=${compact})`);
  }
  assert.doesNotMatch(runnerSource, /const cue = /, 'dead caption code removed');
});