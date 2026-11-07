const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wwwroot = path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot');
const workoutHtml = fs.readFileSync(path.join(wwwroot, 'workout.html'), 'utf8');
const runnerCss = fs.readFileSync(path.join(wwwroot, 'css', 'workoutRunner.css'), 'utf8');
const runnerJs = fs.readFileSync(path.join(wwwroot, 'js', 'workoutRunner.js'), 'utf8');

const TARGET_SELECTORS = [
  '#activeScreen',
  '#restScreen',
  '#pausedOverlay',
  '#restPausedOverlay',
  '#quitWorkoutModal',
  '#overflowModal',
  '.runner-',
  '.ll-runner',
  '#timerDisplay',
  '#restTimer',
  '#workStatSession',
  '#restStatSession',
  '#workNextName',
  '#restNextName',
  '#exerciseName',
  '#nextExerciseName',
  '#skipRestBtn',
  '#startNextBtn',
  '#pauseBtn',
  '#completeSetBtn',
  '#workQuitBtn',
  '#restQuitBtn'
];

function sliceFunction(src, name) {
  const start = src.indexOf(`function ${name}`);
  if (start === -1) return '';
  const rest = src.slice(start);
  const endMatch = rest.match(/\n\s*function\s+\w+\s*\(/);
  return endMatch ? src.slice(start, start + endMatch.index) : src.slice(start);
}

function parseBlocks(css) {
  const blocks = [];

  function parse(input, mediaPrefix) {
    let i = 0;
    while (i < input.length) {
      // skip comments
      if (input[i] === '/' && input[i + 1] === '*') {
        const end = input.indexOf('*/', i);
        i = end === -1 ? input.length : end + 2;
        continue;
      }
      // skip whitespace
      if (/\s/.test(input[i])) {
        i++;
        continue;
      }
      if (input[i] === '}') {
        i++;
        continue;
      }
      // read selector / at-rule prelude
      const start = i;
      let depth = 0;
      while (i < input.length && (input[i] !== '{' || depth > 0)) {
        if (input[i] === '{') depth++;
        if (input[i] === '}') depth--;
        i++;
      }
      if (i >= input.length) break;
      const selector = input.slice(start, i).trim();
      i++; // {
      const bodyStart = i;
      let bodyDepth = 1;
      while (i < input.length && bodyDepth > 0) {
        if (input[i] === '{') bodyDepth++;
        else if (input[i] === '}') bodyDepth--;
        i++;
      }
      const body = input.slice(bodyStart, i - 1);
      if (selector.startsWith('@media')) {
        parse(body, selector);
      } else {
        blocks.push({
          selector: mediaPrefix ? `${mediaPrefix} ${selector}` : selector,
          body
        });
      }
    }
  }

  parse(css, '');
  return blocks;
}

function isTargeted(selector) {
  if (/\btv-mode\b/.test(selector)) return false;
  return TARGET_SELECTORS.some(s => selector.includes(s));
}

function parseValue(value) {
  const v = value.replace(/!important/g, '').trim();
  const clamp = v.match(/clamp\(\s*([0-9.]+)(rem|px)\s*,/);
  if (clamp) return { num: parseFloat(clamp[1]), unit: clamp[2], raw: v };
  const simple = v.match(/^([0-9.]+)(rem|px)$/);
  if (simple) return { num: parseFloat(simple[1]), unit: simple[2], raw: v };
  return null;
}

function toPx(num, unit) {
  return unit === 'px' ? num : num * 16;
}

test('runner text font-size declarations are at least 18px (excluding TV mode)', () => {
  const blocks = parseBlocks(runnerCss);
  const offenders = [];
  for (const block of blocks) {
    if (!isTargeted(block.selector)) continue;
    // split into top-level declarations (ignore nested braces)
    const decls = block.body
      .replace(/\{[^{}]*\}/g, '')
      .split(';')
      .map(d => d.trim())
      .filter(Boolean);
    for (const decl of decls) {
      const m = decl.match(/^font-size\s*:\s*(.+)$/i);
      if (!m) continue;
      const parsed = parseValue(m[1]);
      if (!parsed) continue;
      const px = toPx(parsed.num, parsed.unit);
      if (px < 18 - 1e-6) {
        offenders.push(`${block.selector} { font-size: ${parsed.raw} }`);
      }
    }
  }
  assert.deepStrictEqual(offenders, []);
});

test('session clocks are at least 4rem and big timers at least 5rem in every media query', () => {
  const blocks = parseBlocks(runnerCss);
  const sessionSelectors = ['#workStatSession', '#restStatSession', '.runner-session-clock'];
  const timerSelectors = ['#timerDisplay', '#restTimer', '.big-timer'];
  const offenders = [];
  for (const block of blocks) {
    if (!block.selector.startsWith('@media')) continue;
    const isSession = sessionSelectors.some(s => block.selector.includes(s));
    const isTimer = timerSelectors.some(s => block.selector.includes(s));
    if (!isSession && !isTimer) continue;
    const decls = block.body
      .replace(/\{[^{}]*\}/g, '')
      .split(';')
      .map(d => d.trim())
      .filter(Boolean);
    for (const decl of decls) {
      const m = decl.match(/^font-size\s*:\s*(.+)$/i);
      if (!m) continue;
      const parsed = parseValue(m[1]);
      if (!parsed || parsed.unit !== 'rem') continue;
      if (isSession && parsed.num < 4) {
        offenders.push(`${block.selector} { font-size: ${parsed.raw} } (session < 4rem)`);
      }
      if (isTimer && parsed.num < 5) {
        offenders.push(`${block.selector} { font-size: ${parsed.raw} } (timer < 5rem)`);
      }
    }
  }
  assert.deepStrictEqual(offenders, []);
});

test('quit sheet text-xs/text-sm has a CSS override in workoutRunner.css', () => {
  const hasSubtext = /#quitWorkoutModal[\s\S]*?\btext-xs\b/.test(workoutHtml) ||
                     /#quitWorkoutModal[\s\S]*?\btext-sm\b/.test(workoutHtml);
  if (hasSubtext) {
    const override = /#quitWorkoutModal\s+\.text-xs\s*,\s*#quitWorkoutModal\s+\.text-sm\s*\{[^}]*font-size:\s*1\.125rem/.test(runnerCss);
    assert.ok(override, 'quit sheet text-xs/text-sm is overridden to at least 1.125rem');
  }
});

test('Rest screen contains UP NEXT markup and #restLongevityCue', () => {
  const restScreen = workoutHtml.match(/<section[^>]*id="restScreen"[\s\S]*?<\/section>/);
  assert.ok(restScreen, '#restScreen section found');
  const rest = restScreen[0];
  assert.match(rest, /<div[^>]*id="restNext"[^>]*>/);
  assert.match(rest, /<div[^>]*class="runner-up-next-label"[^>]*>\s*UP NEXT\s*<\/div>/);
  assert.match(rest, /<div[^>]*id="restNextName"[^>]*>/);
  assert.match(rest, /<div[^>]*id="restLongevityCue"[^>]*>/);
});

test('fillUpNext helper is shared by updateWorkStats and rest render paths', () => {
  assert.match(runnerJs, /function\s+fillUpNext\s*\(/);
  const updateWorkStats = sliceFunction(runnerJs, 'updateWorkStats');
  assert.match(updateWorkStats, /fillUpNext\s*\(\s*workNextNameEl\s*\)/);
  const enterRest = sliceFunction(runnerJs, 'enterRest');
  assert.match(enterRest, /fillUpNext\s*\(\s*restNextNameEl\s*\)/);
  const resumeSession = sliceFunction(runnerJs, 'resumeSession');
  assert.match(resumeSession, /fillUpNext\s*\(\s*restNextNameEl\s*\)/);
});

test('restLongevityCue is filled from runnerCueHtml in rest render and resume paths', () => {
  assert.match(runnerJs, /function\s+fillRestLongevityCue\s*\(/);
  assert.match(runnerJs, /window\.LongevityLegs\.runnerCueHtml/);
  const enterRest = sliceFunction(runnerJs, 'enterRest');
  assert.match(enterRest, /fillRestLongevityCue\s*\(\s*nextEx\s*\)/);
  const resumeSession = sliceFunction(runnerJs, 'resumeSession');
  assert.match(resumeSession, /fillRestLongevityCue\s*\(\s*nextEx\s*\)/);
});

test('rest content is padded clear of the fixed button bar and demo shrinks on phone heights', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'css', 'workoutRunner.css'), 'utf8');
  assert.match(css, /body\.rest-phase:not\(\.tv-mode\) #restScreen \{[^}]*padding-bottom:\s*calc\(6\.75rem[^}]*overflow-y:\s*auto/);
  const idx = css.indexOf('@media (max-height: 860px) {\r\n  body.rest-phase:not(.tv-mode) #restScreen #restLongevityCue');
  const idxLf = css.indexOf('@media (max-height: 860px) {\n  body.rest-phase:not(.tv-mode) #restScreen #restLongevityCue');
  const start = idx >= 0 ? idx : idxLf;
  assert.ok(start >= 0, 'missing max-height 860px rest block');
  const block = css.slice(start, css.indexOf('\n}', start));
  assert.match(block, /#restLongevityCue\s*\{\s*display:\s*none/);
  assert.match(block, /max-height:\s*10vh/);
  assert.match(block, /\.demo-caption[\s\S]*\.demo-actions\s*\{\s*display:\s*none/);
});

test('working-weight inputs use a scoped flex width instead of the missing w-20 utility', () => {
  assert.doesNotMatch(runnerJs, /class="[^"]*w-20[^"]*"/);
  const rule = runnerCss.match(/\.runner-weight-input\s*\{[^}]+\}/);
  assert.ok(rule, '.runner-weight-input rule exists');
  const text = rule[0];
  assert.match(text, /flex\s*:\s*1\s+1\s+auto/, 'input flexes to fill row');
  assert.match(text, /max-width\s*:\s*6rem/, 'capped so label/unit fit at 360/390px');
  assert.match(text, /min-width\s*:\s*3\.5rem/, 'does not shrink below usable size');
});

test('dashboard cards reserve responsive space with skeleton placeholders', () => {
  const styles = fs.readFileSync(path.join(wwwroot, 'css', 'styles.css'), 'utf8');
  assert.match(styles, /#nextWorkoutCard\s*\{[^}]*height\s*:\s*17rem/);
  assert.match(styles, /#homeToday\s*\{[^}]*height\s*:\s*10rem/);
  assert.match(styles, /@media \(min-width: 640px\)\s*\{\s*#nextWorkoutCard \{ height: 10rem; \}\s*#homeToday \{ height: 8rem; \}/);
  const indexHtml = fs.readFileSync(path.join(wwwroot, 'index.html'), 'utf8');
  assert.match(indexHtml, /<div[^>]*id="nextWorkoutSkeleton"[^>]*>/);
  assert.match(indexHtml, /<div[^>]*id="homeTodaySkeleton"[^>]*>/);
  assert.match(indexHtml, /<div[^>]*id="nextWorkoutContent"[^>]*class="[^"]*hidden[^"]*"/);
  assert.match(indexHtml, /<div[^>]*id="homeTodayContent"[^>]*class="[^"]*hidden[^"]*"/);
});
