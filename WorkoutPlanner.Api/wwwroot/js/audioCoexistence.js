/**
 * Pure helpers for Spotify / device-music coexistence with runner tones & voice.
 * Used by workoutRunner.js and node:test.
 *
 * Residual (accepted): without a silent oscillator keep-alive in device+tones,
 * beeps may fail after a long screen-off on iOS until the next user gesture
 * resumes AudioContext. Do not re-arm silent keep-alive to "fix" that case.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.AudioCoexistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Long-lived silent osc into destination fights Spotify on iOS when device
   * music + countdown tones are both active. Skip keep-alive in that case only.
   */
  function shouldUseSilentKeepAlive(opts) {
    const musicStyle = opts && opts.musicStyle;
    const tonesEnabled = !!(opts && opts.tonesEnabled);
    if (musicStyle === 'device' && tonesEnabled) return false;
    return true;
  }

  /**
   * Prefer turning voice off when the user switches into device music mode.
   * Does not force voice back on when leaving device.
   */
  function shouldPreferVoiceOffOnDeviceTransition(prevStyle, nextStyle) {
    return nextStyle === 'device' && prevStyle !== 'device';
  }

  /**
   * Feature-detect navigator.audioSession (Safari/iOS 16.4+). Prefer ambient
   * (or transient for brief speech). Never set transient-solo or playback.
   * Never throws.
   *
   * @param {string} [preferredType='ambient']
   * @param {object} [nav] navigator-like object (injectable for tests)
   * @returns {{ supported: boolean, applied: string|null }}
   */
  function probeAndApplyAudioSession(preferredType, nav) {
    const preferred = preferredType || 'ambient';
    try {
      const navigatorObj = nav !== undefined
        ? nav
        : (typeof navigator !== 'undefined' ? navigator : undefined);
      const session = navigatorObj && navigatorObj.audioSession;
      if (!session || typeof session !== 'object') {
        return { supported: false, applied: null };
      }

      const order = preferred === 'transient'
        ? ['transient', 'ambient']
        : preferred === 'ambient'
          ? ['ambient', 'transient']
          : [preferred, 'ambient', 'transient'];

      for (let i = 0; i < order.length; i++) {
        const t = order[i];
        if (t === 'transient-solo' || t === 'playback') continue;
        try {
          session.type = t;
          return { supported: true, applied: t };
        } catch (e) {
          /* try next */
        }
      }
      return { supported: true, applied: null };
    } catch (e) {
      return { supported: false, applied: null };
    }
  }

  return {
    shouldUseSilentKeepAlive,
    shouldPreferVoiceOffOnDeviceTransition,
    probeAndApplyAudioSession
  };
});
