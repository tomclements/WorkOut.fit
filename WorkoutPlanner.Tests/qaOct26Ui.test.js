const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wwwroot = path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot');

const historyHtml = fs.readFileSync(path.join(wwwroot, 'history.html'), 'utf8');
const accountHtml = fs.readFileSync(path.join(wwwroot, 'account.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(wwwroot, 'css', 'styles.css'), 'utf8');
const runnerCss = fs.readFileSync(path.join(wwwroot, 'css', 'workoutRunner.css'), 'utf8');
const runnerJs = fs.readFileSync(path.join(wwwroot, 'js', 'workoutRunner.js'), 'utf8');

function sliceFunction(src, name) {
  const start = src.indexOf(`function ${name}`);
  if (start === -1) return '';
  const rest = src.slice(start);
  const endMatch = rest.match(/\n\s*function\s+\w+\s*\(/);
  return endMatch ? src.slice(start, start + endMatch.index) : src.slice(start);
}

// ---------------- Fix 2: History streak badge ----------------

test('history streak badge wraps number and suffix in one span', () => {
  assert.doesNotMatch(historyHtml, /<\/span>\s*-day streak\s*<\/div>/);
  assert.match(historyHtml, /<span id="streakCount">\s*0\s*<\/span>-day streak\s*<\/span>/);
});

test('styles.css hides .streak-badge.hidden after the base rule', () => {
  const baseIdx = stylesCss.indexOf('.streak-badge {');
  const hiddenIdx = stylesCss.search(/\.streak-badge\.hidden\s*\{\s*display:\s*none\s*;?\s*\}/);
  assert.ok(baseIdx !== -1, 'base streak-badge rule exists');
  assert.ok(hiddenIdx !== -1, '.streak-badge.hidden rule exists');
  assert.ok(hiddenIdx > baseIdx, '.streak-badge.hidden rule comes after base rule');
});

// ---------------- Fix 3: Runner quit dialog overlap ----------------

test('workoutRunner.css hides paused overlays when quit sheet is open', () => {
  const workIdx = runnerCss.indexOf('body.work-phase #pausedOverlay:not(.hidden)');
  const quitIdx = runnerCss.indexOf('body.quit-sheet-open #pausedOverlay:not(.hidden)');
  assert.ok(workIdx !== -1, 'work-phase paused overlay rule exists');
  assert.ok(quitIdx !== -1, 'quit-sheet-open paused overlay rule exists');
  assert.ok(quitIdx > workIdx, 'quit-sheet-open rule comes after work-phase rule');
  assert.match(runnerCss, /body\.quit-sheet-open\s+#pausedOverlay:not\(\.hidden\)\s*,\s*body\.quit-sheet-open\s+#restPausedOverlay:not\(\.hidden\)\s*\{\s*display:\s*none\s+!important;\s*\}/);
});

test('workoutRunner.css paused overlay backgrounds are at least 95% opaque', () => {
  const workMatch = runnerCss.match(/body\.work-phase\s+#pausedOverlay:not\(\.hidden\)\s*\{[^}]*background:\s*rgba\(\s*15\s*,\s*23\s*,\s*42\s*,\s*([0-9.]+)\s*\)/);
  const restMatch = runnerCss.match(/body\.rest-phase\s+#restPausedOverlay:not\(\.hidden\)\s*\{[^}]*background:\s*rgba\(\s*11\s*,\s*21\s*,\s*38\s*,\s*([0-9.]+)\s*\)/);
  assert.ok(workMatch, 'work overlay background found');
  assert.ok(restMatch, 'rest overlay background found');
  assert.ok(parseFloat(workMatch[1]) >= 0.95, `work overlay alpha ${workMatch[1]} is below 0.95`);
  assert.ok(parseFloat(restMatch[1]) >= 0.95, `rest overlay alpha ${restMatch[1]} is below 0.95`);
});

test('workoutRunner.js adds and removes quit-sheet-open class in the right functions', () => {
  const openBody = sliceFunction(runnerJs, 'openQuitSheet');
  const closeBody = sliceFunction(runnerJs, 'closeQuitSheet');
  assert.match(openBody, /document\.body\.classList\.add\s*\(\s*['"]quit-sheet-open['"]\s*\)/);
  assert.match(closeBody, /document\.body\.classList\.remove\s*\(\s*['"]quit-sheet-open['"]\s*\)/);
});

// ---------------- Fix 4: Account dark-mode row ----------------

test('account.html dark mode toggle uses setting-toggle-row layout', () => {
  const labels = accountHtml.match(/<label[\s\S]*?<\/label>/g) || [];
  const label = labels.find(l => l.includes('contrastToggle'));
  assert.ok(label, 'contrastToggle label found');
  assert.doesNotMatch(label, /justify-between/);
  assert.match(label, /setting-toggle-row/);
  const inputIdx = label.indexOf('<input');
  const textIdx = label.indexOf('Dark mode');
  assert.ok(inputIdx !== -1 && textIdx !== -1, 'input and Dark mode text present');
  assert.ok(inputIdx < textIdx, 'input appears before Dark mode text');
});

test('styles.css .setting-toggle-row has a sufficient min-height', () => {
  const ruleMatch = stylesCss.match(/\.setting-toggle-row\s*\{[^}]*min-height:\s*([0-9.]+rem)/);
  assert.ok(ruleMatch, '.setting-toggle-row rule with min-height exists');
  assert.ok(ruleMatch[1] === '2.75rem' || parseFloat(ruleMatch[1]) >= 2.75, `min-height ${ruleMatch[1]} is too small`);
});
