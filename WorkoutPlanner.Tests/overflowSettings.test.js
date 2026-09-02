const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const overflow = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'overflowSettings.js'));

function memoryStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); }
  };
}

test('toggling voice on/off writes runnerVoiceCues 1/0 and syncs both setup + overflow checkboxes', () => {
  const storage = memoryStorage();
  const setup = { checked: false };
  const overflowBox = { checked: false };
  overflow.persistVoiceCues(true, storage, { setup, overflow: overflowBox });
  assert.equal(storage.getItem('runnerVoiceCues'), '1');
  assert.equal(setup.checked, true);
  assert.equal(overflowBox.checked, true);
  overflow.persistVoiceCues(false, storage, { setup, overflow: overflowBox });
  assert.equal(storage.getItem('runnerVoiceCues'), '0');
  assert.equal(setup.checked, false);
  assert.equal(overflowBox.checked, false);
});

test('toggling tones writes runnerTones (default on means !== 0)', () => {
  const storage = memoryStorage();
  const setup = { checked: true };
  const overflowBox = { checked: true };
  assert.equal(overflow.tonesEnabledFromStorage(storage), true);
  overflow.persistTones(false, storage, { setup, overflow: overflowBox });
  assert.equal(storage.getItem('runnerTones'), '0');
  assert.equal(overflow.tonesEnabledFromStorage(storage), false);
  assert.equal(setup.checked, false);
  assert.equal(overflowBox.checked, false);
  overflow.persistTones(true, storage, { setup, overflow: overflowBox });
  assert.equal(storage.getItem('runnerTones'), '1');
  assert.equal(overflow.tonesEnabledFromStorage(storage), true);
  assert.equal(setup.checked, true);
  assert.equal(overflowBox.checked, true);
});

test('music style change writes runnerMusicStyle and would call setStyle', () => {
  const storage = memoryStorage();
  const calls = [];
  overflow.persistMusicStyle('drive', storage, (s) => calls.push(s));
  assert.equal(storage.getItem('runnerMusicStyle'), 'drive');
  assert.deepEqual(calls, ['drive']);
  overflow.persistMusicStyle('off', storage, (s) => calls.push(s));
  assert.equal(storage.getItem('runnerMusicStyle'), 'off');
  assert.deepEqual(calls, ['drive', 'off']);
});

test('volume change writes runnerMusicVolume', () => {
  const storage = memoryStorage();
  overflow.persistMusicVolume(42, storage);
  assert.equal(storage.getItem('runnerMusicVolume'), '42');
  overflow.persistMusicVolume(0, storage);
  assert.equal(storage.getItem('runnerMusicVolume'), '0');
});

test('simulated pointerdown+click on a checkbox still results in checked state change', () => {
  const pointer = overflow.overflowEventPolicy('control', 'pointerdown');
  const touch = overflow.overflowEventPolicy('control', 'touchstart');
  const mouse = overflow.overflowEventPolicy('control', 'mousedown');
  assert.equal(pointer.stopPropagation, false);
  assert.equal(pointer.preventDefault, false);
  assert.equal(touch.stopPropagation, false);
  assert.equal(mouse.stopPropagation, false);
  assert.equal(overflow.shouldStopControlEvent('pointerdown'), false);
  const checkbox = { checked: false };
  overflow.simulateNativeCheckboxToggle(checkbox, 'control');
  assert.equal(checkbox.checked, true);
  overflow.simulateNativeCheckboxToggle(checkbox, 'control');
  assert.equal(checkbox.checked, false);
});

test('overlay close uses contains: inside panel stays open, outside closes', () => {
  const inside = { id: 'voiceCuesToggleActive' };
  const outside = { id: 'overflowModal' };
  const panel = {
    contains(el) { return el === inside; }
  };
  assert.equal(overflow.shouldCloseOverflow(inside, panel), false);
  assert.equal(overflow.shouldCloseOverflow(outside, panel), true);
});

test('panel may stop click but not pointerdown/touchstart/mousedown', () => {
  const click = overflow.overflowEventPolicy('panel', 'click');
  const pointer = overflow.overflowEventPolicy('panel', 'pointerdown');
  assert.equal(click.stopPropagation, true);
  assert.equal(click.preventDefault, false);
  assert.equal(pointer.stopPropagation, false);
  assert.equal(pointer.preventDefault, false);
});
