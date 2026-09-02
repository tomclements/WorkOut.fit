/**
 * Pure overflow Session-options helpers (no DOM).
 * Used by workoutRunner.js and node:test.
 *
 * Pointerdown/touchstart/mousedown must NOT be stopped on form controls:
 * iOS native checkbox/select/range toggle depends on those events.
 * Overlay close uses panel.contains(target) only.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.OverflowSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const POINTER_TYPES = { pointerdown: true, touchstart: true, mousedown: true };

  function setChecked(toggles, checked) {
    const on = !!checked;
    if (toggles && toggles.setup) toggles.setup.checked = on;
    if (toggles && toggles.overflow) toggles.overflow.checked = on;
    return on;
  }

  function persistVoiceCues(checked, storage, toggles, stopSpeech) {
    const value = checked ? '1' : '0';
    try { storage.setItem('runnerVoiceCues', value); } catch (e) { /* ignore */ }
    setChecked(toggles, checked);
    if (!checked && typeof stopSpeech === 'function') stopSpeech();
    return value;
  }

  function persistTones(checked, storage, toggles) {
    const value = checked ? '1' : '0';
    try { storage.setItem('runnerTones', value); } catch (e) { /* ignore */ }
    setChecked(toggles, checked);
    return value;
  }

  function tonesEnabledFromStorage(storage) {
    try { return storage.getItem('runnerTones') !== '0'; } catch (e) { return true; }
  }

  function voiceCuesEnabledFromStorage(storage) {
    try { return storage.getItem('runnerVoiceCues') === '1'; } catch (e) { return false; }
  }

  function persistMusicStyle(style, storage, setStyle) {
    const s = style || 'off';
    try { storage.setItem('runnerMusicStyle', s); } catch (e) { /* ignore */ }
    if (typeof setStyle === 'function') setStyle(s);
    return s;
  }

  function persistMusicVolume(volume, storage) {
    const v = String(volume);
    try { storage.setItem('runnerMusicVolume', v); } catch (e) { /* ignore */ }
    return v;
  }

  function shouldCloseOverflow(eventTarget, panel) {
    if (!panel || typeof panel.contains !== 'function') return eventTarget !== panel;
    return !panel.contains(eventTarget);
  }

  /**
   * scope: 'panel' | 'control'
   * Controls never stop/prevent pointer events (iOS native widgets).
   * Panel may stop click so the overlay does not treat it as outside; never pointer.
   */
  function overflowEventPolicy(scope, eventType) {
    const isPointer = !!POINTER_TYPES[eventType];
    if (scope === 'control' || isPointer) {
      return { stopPropagation: false, preventDefault: false };
    }
    if (scope === 'panel' && eventType === 'click') {
      return { stopPropagation: true, preventDefault: false };
    }
    return { stopPropagation: false, preventDefault: false };
  }

  function shouldStopControlEvent(eventType) {
    return overflowEventPolicy('control', eventType).stopPropagation;
  }

  /**
   * Simulated pointerdown + click on a checkbox. Native toggle is cancelled only
   * if the control policy preventDefault on a pointer event.
   */
  function simulateNativeCheckboxToggle(checkbox, scope) {
    const types = ['pointerdown', 'touchstart', 'mousedown', 'click'];
    for (let i = 0; i < types.length; i++) {
      const policy = overflowEventPolicy(scope || 'control', types[i]);
      if (policy.preventDefault) return checkbox.checked;
    }
    checkbox.checked = !checkbox.checked;
    return checkbox.checked;
  }

  return {
    persistVoiceCues,
    persistTones,
    persistMusicStyle,
    persistMusicVolume,
    tonesEnabledFromStorage,
    voiceCuesEnabledFromStorage,
    shouldCloseOverflow,
    overflowEventPolicy,
    shouldStopControlEvent,
    simulateNativeCheckboxToggle
  };
});
