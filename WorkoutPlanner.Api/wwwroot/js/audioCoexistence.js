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

  const BUILT_IN_STYLES = new Set(['drive', 'focus', 'power', 'calm']);

  /**
   * Desired navigator.audioSession.type for a music style.
   * - 'off' and 'device' want 'ambient' so they mix with Spotify and never
   *   re-take the iOS audio session.
   * - Built-in styles manage the session themselves, so leave it null ('auto').
   */
  function desiredAudioSessionType(style) {
    if (style === 'off' || style === 'device') return 'ambient';
    return null;
  }

  /**
   * Long-lived silent oscillator keep-alive is only useful (and safe) for
   * built-in music styles. For 'off' and 'device' it just fights Spotify/keeps
   * the session rendering; skip it.
   */
  function shouldUseSilentKeepAlive(opts) {
    if (!opts) return false;
    const musicStyle = opts.musicStyle;
    return BUILT_IN_STYLES.has(musicStyle);
  }

  /**
   * Prefer turning voice off when the user switches into device music mode.
   * Does not force voice back on when leaving device.
   */
  function shouldPreferVoiceOffOnDeviceTransition(prevStyle, nextStyle) {
    return nextStyle === 'device' && prevStyle !== 'device';
  }

  /**
   * Decide what to do with a (possibly non-standard) AudioContext.state.
   * - 'running'  -> 'none'
   * - 'suspended' / 'interrupted' -> 'resume'
   * - 'closed' / missing / unknown -> 'recreate'
   */
  function audioRecoveryAction(state) {
    if (state === 'running') return 'none';
    if (state === 'suspended' || state === 'interrupted') return 'resume';
    return 'recreate';
  }

  /**
   * Pure helper: should built-in music resume/play on resumeWorkout.
   * Never auto-resume from visibilitychange; only from user gestures.
   */
  function shouldPlayMusicOnResume(opts) {
    if (!opts) return false;
    if (opts.fromVisibility) return false;
    if (!BUILT_IN_STYLES.has(opts.musicStyle)) return false;
    return !!opts.isPlaying;
  }

  /**
   * Pure helper: decide what (if anything) the visibilitychange→visible branch
   * is allowed to do. It must never resume audio or play media on its own.
   */
  function onVisibleActions({ musicStyle, isPlaying }) {
    return {
      resumeAudio: false,
      playMusic: shouldPlayMusicOnResume({ musicStyle, isPlaying, fromVisibility: true }),
      requestWakeLock: true // caller retries wake lock without video; no media play
    };
  }

  /**
   * Single-flight gesture audio recovery for iOS app-switch / interruption.
   * - Every event kicks ctx.resume() synchronously (inside the gesture) but never creates.
   * - pointerdown may only resume; pointerup / touchend / click may recreate, and only
   *   when the context is closed or still not running after resume().
   * - Recreation is single-flight: concurrent calls share one in-flight promise, so one
   *   tap (up to 4 events) creates at most one new context. The old context is closed first.
   * - No context yet (workout not started) means nothing to recover.
   * Awaits are capped so a resume() that never settles cannot wedge recovery.
   */
  function createGestureAudioRecovery({ getCtx, setCtx, makeCtx, onRecreated, settleMs = 400 }) {
    let inFlight = null;
    const settle = (p) => Promise.race([
      Promise.resolve(p).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, settleMs))
    ]);
    const canRecreate = (t) => t === 'pointerup' || t === 'touchend' || t === 'click';
    return function recover(eventType) {
      const ctx = getCtx();
      if (!ctx) return Promise.resolve(null);
      let resumed = null;
      if (ctx.state !== 'running' && ctx.state !== 'closed' && typeof ctx.resume === 'function') {
        try { resumed = ctx.resume(); } catch { resumed = null; }
      }
      if (inFlight) return inFlight;
      if (!canRecreate(eventType)) return settle(resumed).then(() => getCtx());
      inFlight = (async () => {
        await settle(resumed);
        let cur = getCtx();
        if (cur && cur.state === 'running') return cur;
        if (cur && cur.state !== 'closed' && typeof cur.close === 'function') {
          try { await settle(cur.close()); } catch { /* ignore */ }
        }
        cur = makeCtx();
        setCtx(cur);
        if (cur && typeof cur.resume === 'function') {
          try { await settle(cur.resume()); } catch { /* ignore */ }
        }
        if (onRecreated) onRecreated(cur);
        return cur;
      })().finally(() => { inFlight = null; });
      return inFlight;
    };
  }
  /**
   * Recover an AudioContext after iOS app-switch / interruption.
   * Returns the (possibly new) context. Pure except for ctx calls; injectable.
   */
  async function recoverAudioContext(ctx, factory) {
    const makeCtx = factory || (() => new (typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext)());
    const action = audioRecoveryAction(ctx && ctx.state);
    if (action === 'resume' && ctx) {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    if (!ctx || ctx.state === 'closed' || ctx.state !== 'running') {
      try { if (ctx && typeof ctx.close === 'function') await ctx.close(); } catch { /* ignore */ }
      ctx = makeCtx();
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    return ctx;
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
    desiredAudioSessionType,
    shouldUseSilentKeepAlive,
    shouldPreferVoiceOffOnDeviceTransition,
    audioRecoveryAction,
    shouldPlayMusicOnResume,
    onVisibleActions,
    createGestureAudioRecovery,
    recoverAudioContext,
    probeAndApplyAudioSession
  };
});
