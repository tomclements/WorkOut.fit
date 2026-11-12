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
    if (!elements[id]) elements[id] = { classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } }, textContent: '', innerHTML: '', style: {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; }, dataset: {}, appendChild() {}, remove() {}, contains() { return false; }, focus() {}, dispatchEvent() { return true; } };
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
  const context = {
    document, window, console: { log() {}, error() {}, warn() {} },
    Date, Math, Number, String, RegExp, Array, Object, JSON, parseInt, parseFloat, isNaN,
    Set, Map, Promise, Error, TypeError, undefined
  };
  vm.createContext(context);
  vm.runInContext(runnerSource, context, { filename: runnerPath });
  return context;
}

const workoutHtmlPath = path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'workout.html');
const workoutHtml = fs.readFileSync(workoutHtmlPath, 'utf8');
const workoutCssPath = path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'css', 'workoutRunner.css');
const workoutCss = fs.readFileSync(workoutCssPath, 'utf8');

function sliceFunction(src, name) {
  const start = src.indexOf(`function ${name}`);
  if (start === -1) return '';
  const rest = src.slice(start);
  const endMatch = rest.match(/\n\s*function\s+\w+\s*\(/);
  return endMatch ? src.slice(start, start + endMatch.index) : src.slice(start);
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

test('tag line is gone from source and markup', () => {
  assert.doesNotMatch(runnerSource, /coachingTagsForExercise/);
  assert.doesNotMatch(runnerSource, /Scale anytime/);
  assert.doesNotMatch(runnerSource, /restCoachingTags/);
  assert.doesNotMatch(workoutHtml, /restCoachingTags/);
  assert.doesNotMatch(workoutHtml, /runner-rest-coaching-tags/);
  assert.doesNotMatch(workoutCss, /runner-rest-coaching-tags/);
  assert.doesNotMatch(workoutHtml, /Scale anytime/);
});

test('fillRestCoaching sets nextExerciseMeta to the form cue only', () => {
  const runner = loadRunnerWithExercise({ phase: 'warmup', progression: 'Keep chest up' });
  runner.fillRestCoaching({ phase: 'warmup', progression: 'Keep chest up' });
  assert.equal(runner.document.getElementById('nextExerciseMeta').textContent, 'Keep chest up');
  runner.fillRestCoaching({ phase: 'work', repsDisplay: '8-12' });
  assert.equal(runner.document.getElementById('nextExerciseMeta').textContent, 'Aim for 8-12 reps this set');
});

test('rest coaching contains exactly one cue line', () => {
  const restMatch = workoutHtml.match(/<section[^>]*id="restScreen"[\s\S]*?<\/section>/);
  assert.ok(restMatch, '#restScreen section found');
  const coachingMatch = restMatch[0].match(/<div[^>]*id="restCoaching"[^>]*>[\s\S]*?<\/div>/);
  assert.ok(coachingMatch, '#restCoaching found');
  const ids = [...coachingMatch[0].matchAll(/<[^>]+\sid="([^"]+)"/g)].map(m => m[1]).filter(id => id !== 'restCoaching');
  assert.deepStrictEqual(ids, ['restCoachingForm'], 'restCoaching has exactly one id child');
});

test('rest screen markup moves demo to #demoView sibling', () => {
  const restMatch = workoutHtml.match(/<section[^>]*id="restScreen"[\s\S]*?<\/section>/);
  assert.ok(restMatch);
  const rest = restMatch[0];
  assert.doesNotMatch(rest, /id="nextDemo"/);
  assert.doesNotMatch(rest, /demo-panel--rest/);
  assert.doesNotMatch(rest, /demo-frame/);
  assert.match(rest, /id="seeDemoBtn"/);
  assert.match(rest, /id="restSessionClock"/);
  assert.match(rest, /id="restStatSession"/);
  assert.match(rest, /id="restNext"/);
  assert.match(rest, /id="restNextName"/);
  assert.match(rest, /id="restControls"/);

  const demoMatch = workoutHtml.match(/<section[^>]*id="demoView"[\s\S]*?<\/section>/);
  assert.ok(demoMatch, '#demoView section found');
  const demo = demoMatch[0];
  assert.match(demo, /role="dialog"/);
  assert.match(demo, /aria-modal="true"/);
  assert.match(demo, /id="demoBackBtn"/);
  assert.match(demo, /id="demoCloseBtn"/);
  assert.match(demo, /id="demoViewTimer"/);
  assert.match(demo, /id="demoViewMedia"/);
  assert.match(demo, /<div[^>]*id="demoViewMedia"[^>]*>\s*<\/div>/, '#demoViewMedia is empty in HTML (lazy)');

  const restIndex = workoutHtml.indexOf('id="restScreen"');
  const demoIndex = workoutHtml.indexOf('id="demoView"');
  assert.ok(restIndex >= 0 && demoIndex > restIndex, 'demoView appears after restScreen');
  const between = workoutHtml.slice(restIndex, demoIndex);
  assert.doesNotMatch(between, /<section[^>]*id="demoView"/);
});

test('openDemoView and closeDemoView bodies do not touch audio or wake lock', () => {
  const forbidden = /musicEngine|AudioContext|audioCtx|\.resume\(|\.suspend\(|\.play\(|\.pause\(|requestWakeLock|noSleep|nosleep|playTone|speak|speechSynthesis|probeAndApplyAudioSession|pauseWorkout|resumeWorkout|timerInterval|startTimer/;
  const openBody = sliceFunction(runnerSource, 'openDemoView');
  const closeBody = sliceFunction(runnerSource, 'closeDemoView');
  assert.doesNotMatch(openBody, forbidden, 'openDemoView is audio/wake-lock isolated');
  assert.doesNotMatch(closeBody, forbidden, 'closeDemoView is audio/wake-lock isolated');
});

test('openDemoView renders media and closes without touching AudioContext', () => {
  const runner = loadRunnerWithExercise({
    id: 'wu-jacks',
    name: 'Jumping jacks',
    demoUrl: 'https://example.com/demo',
    imageUrl: 'https://example.com/0.jpg'
  });
  let audioCtxCalls = 0;
  let resumeCalls = 0;
  function FakeAudioContext() { audioCtxCalls++; this.state = 'running'; }
  FakeAudioContext.prototype.resume = function () { resumeCalls++; return Promise.resolve(); };
  runner.window.AudioContext = FakeAudioContext;
  runner.window.webkitAudioContext = FakeAudioContext;
  const el = runner.document.getElementById('demoViewTimer');
  const originalText = el.textContent;
  el.textContent = originalText; // ensure element exists

  const pushed = [];
  let backs = 0;
  runner.history = { state: null, pushState(s) { this.state = s; pushed.push(s); }, back() { backs++; this.state = null; } };
  vm.runInContext(`phase = "rest"; sessionExercises = [${JSON.stringify({ id: 'wu-jacks', name: 'Jumping jacks', demoUrl: 'https://example.com/demo', imageUrl: 'https://example.com/0.jpg' })}]; currentExerciseIndex = 0;`, runner);
  runner.openDemoView();
  assert.equal(pushed.length, 1, 'history entry pushed so swipe-back closes the demo');
  assert.equal(vm.runInContext('demoViewOpen', runner), true, 'demoViewOpen flag set');
  const media = runner.document.getElementById('demoViewMedia');
  assert.ok(media.innerHTML.includes('demo-frame'), 'demo media rendered');
  assert.equal(audioCtxCalls, 0, 'AudioContext was not constructed');
  assert.equal(resumeCalls, 0, 'AudioContext.resume was not called');

  runner.closeDemoView();
  assert.equal(vm.runInContext('demoViewOpen', runner), false, 'demoViewOpen flag cleared');
  assert.equal(media.innerHTML, '', 'demo media cleared');
  assert.equal(audioCtxCalls, 0, 'AudioContext still not constructed after close');
  assert.equal(resumeCalls, 0, 'AudioContext.resume still not called after close');
  assert.equal(backs, 1, 'closing via Back pops the demo history entry');
});

test('tick rest branch writes demoViewTimer while open', () => {
  const runner = loadRunnerWithExercise({
    id: 'bench-press',
    name: 'Bench Press',
    phase: 'work',
    repsDisplay: '8-12',
    demoUrl: 'https://example.com/demo',
    imageUrl: 'https://example.com/0.jpg'
  });
  vm.runInContext(`
    phase = 'rest';
    isPaused = false;
    phaseBusy = false;
    phaseDurationSeconds = 45;
    phaseStartTime = Date.now() - 5000;
    demoViewOpen = true;
  `, runner);
  runner.tick();
  const timer = runner.document.getElementById('demoViewTimer').textContent;
  assert.match(timer, /^\d{2}:\d{2}$/);
  assert.notEqual(timer, '00:00');
});

test('lifecycle helpers close the demo view', () => {
  const enterWorkBody = sliceFunction(runnerSource, 'enterWork');
  const finishBody = sliceFunction(runnerSource, 'finishWorkout');
  const teardownBody = sliceFunction(runnerSource, 'teardownSession');
  assert.match(enterWorkBody, /closeDemoView\(\s*\{\s*restoreFocus:\s*false\s*\}\s*\)/);
  assert.match(finishBody, /closeDemoView\(\s*\{\s*restoreFocus:\s*false\s*\}\s*\)/);
  assert.match(teardownBody, /closeDemoView\(\s*\{\s*restoreFocus:\s*false\s*\}\s*\)/);
});

test('Space/Enter handler ignores input but guards demoViewOpen before endRest', () => {
  const handlerMatch = runnerSource.match(/\/\/ Space \/ Enter: skip work\/rest\s*wire\(document, 'keydown', \(e\) => \{([\s\S]*?)\}\);/);
  assert.ok(handlerMatch, 'keydown handler found');
  const body = handlerMatch[1];
  assert.match(body, /if \(demoViewOpen\) return;/);
  assert.match(body, /e\.preventDefault\(\);\s*endRest\(\);/);
});

test('handleVisibilityChange visible branch no longer references nextDemoEl', () => {
  assert.doesNotMatch(runnerSource, /nextDemoEl/);
  const fn = sliceFunction(runnerSource, 'handleVisibilityChange');
  assert.match(fn, /demoViewOpen/);
});

function ruleBody(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`\\}\\s*${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
}

test('demo view: fixed parts do not shrink and the demo frame fits its container', () => {
  for (const selector of ['.runner-demo-view__top', '.runner-demo-view__title', '.runner-demo-view__form', '.runner-demo-view__back']) {
    assert.match(ruleBody(workoutCss, selector), /flex-shrink:\s*0/, selector + ' has flex-shrink: 0');
  }
  assert.match(ruleBody(workoutCss, '.runner-demo-view__media'), /container-type:\s*size/);
  const frameBody = ruleBody(workoutCss, '.runner-demo-view__media .demo-frame');
  assert.match(frameBody, /width:\s*min\(100cqw,\s*calc\(\(100cqh - 3\.5rem\) \* var\(--demo-ar,\s*1\)\)\)/);
  assert.match(frameBody, /height:\s*auto/);
  assert.match(frameBody, /max-height:\s*none/);
  assert.doesNotMatch(frameBody, /100dvh/);
});