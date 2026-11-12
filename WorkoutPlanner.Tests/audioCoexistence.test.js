const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const coexist = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'audioCoexistence.js'));

test('shouldUseSilentKeepAlive: true only for built-in styles', () => {
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'off', tonesEnabled: true }), false);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'off', tonesEnabled: false }), false);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'device', tonesEnabled: true }), false);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'device', tonesEnabled: false }), false);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'drive', tonesEnabled: true }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'drive', tonesEnabled: false }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'focus', tonesEnabled: false }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'power', tonesEnabled: true }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'calm', tonesEnabled: true }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({}), false);
});

test('desiredAudioSessionType: ambient for off/device, null for built-in', () => {
  assert.equal(coexist.desiredAudioSessionType('off'), 'ambient');
  assert.equal(coexist.desiredAudioSessionType('device'), 'ambient');
  assert.equal(coexist.desiredAudioSessionType('drive'), null);
  assert.equal(coexist.desiredAudioSessionType('focus'), null);
  assert.equal(coexist.desiredAudioSessionType('power'), null);
  assert.equal(coexist.desiredAudioSessionType('calm'), null);
  assert.equal(coexist.desiredAudioSessionType(undefined), null);
});

test('audioRecoveryAction maps states to none/resume/recreate', () => {
  assert.equal(coexist.audioRecoveryAction('running'), 'none');
  assert.equal(coexist.audioRecoveryAction('suspended'), 'resume');
  assert.equal(coexist.audioRecoveryAction('interrupted'), 'resume');
  assert.equal(coexist.audioRecoveryAction('closed'), 'recreate');
  assert.equal(coexist.audioRecoveryAction(undefined), 'recreate');
  assert.equal(coexist.audioRecoveryAction(null), 'recreate');
});

test('recoverAudioContext recreates an interrupted context that cannot resume', async () => {
  let resumed = 0;
  let closed = 0;
  let created = 0;
  const brokenCtx = {
    state: 'interrupted',
    async resume() { resumed++; return undefined; },
    async close() { closed++; return undefined; }
  };
  const factory = () => {
    created++;
    return { state: 'running', resume: async () => { resumed++; } };
  };
  const ctx = await coexist.recoverAudioContext(brokenCtx, factory);
  assert.equal(resumed, 2, 'resumed broken context once, then the fresh context once');
  assert.equal(closed, 1, 'closed broken context');
  assert.equal(created, 1, 'created new context');
  assert.equal(ctx.state, 'running');
});

test('probeAndApplyAudioSession sets ambient before AudioContext factory is called', () => {
  const calls = [];
  const nav = {
    audioSession: {
      set type(v) { calls.push('audioSession:' + v); },
      get type() { return calls[calls.length - 1] ? calls[calls.length - 1].split(':')[1] : 'auto'; }
    }
  };
  const factory = () => {
    calls.push('AudioContext');
    return { state: 'running' };
  };
  coexist.probeAndApplyAudioSession('ambient', nav);
  factory();
  assert.deepEqual(calls, ['audioSession:ambient', 'AudioContext']);
});

test('shouldPlayMusicOnResume: false from visibility or non-built-in styles', () => {
  assert.equal(coexist.shouldPlayMusicOnResume({ musicStyle: 'off', isPlaying: true, fromVisibility: true }), false);
  assert.equal(coexist.shouldPlayMusicOnResume({ musicStyle: 'off', isPlaying: true, fromVisibility: false }), false);
  assert.equal(coexist.shouldPlayMusicOnResume({ musicStyle: 'device', isPlaying: true, fromVisibility: false }), false);
  assert.equal(coexist.shouldPlayMusicOnResume({ musicStyle: 'drive', isPlaying: true, fromVisibility: true }), false);
  assert.equal(coexist.shouldPlayMusicOnResume({ musicStyle: 'drive', isPlaying: false, fromVisibility: false }), false);
  assert.equal(coexist.shouldPlayMusicOnResume({ musicStyle: 'drive', isPlaying: true, fromVisibility: false }), true);
});

test('onVisibleActions: never resumes audio or plays media', () => {
  const off = coexist.onVisibleActions({ musicStyle: 'off', isPlaying: true });
  assert.equal(off.resumeAudio, false);
  assert.equal(off.playMusic, false);
  assert.equal(off.requestWakeLock, true);
  const drive = coexist.onVisibleActions({ musicStyle: 'drive', isPlaying: true });
  assert.equal(drive.resumeAudio, false);
  assert.equal(drive.playMusic, false);
  assert.equal(drive.requestWakeLock, true);
});

test('shouldPreferVoiceOffOnDeviceTransition: only on enter device', () => {
  assert.equal(coexist.shouldPreferVoiceOffOnDeviceTransition('drive', 'device'), true);
  assert.equal(coexist.shouldPreferVoiceOffOnDeviceTransition('off', 'device'), true);
  assert.equal(coexist.shouldPreferVoiceOffOnDeviceTransition('device', 'device'), false);
  assert.equal(coexist.shouldPreferVoiceOffOnDeviceTransition('device', 'drive'), false);
  assert.equal(coexist.shouldPreferVoiceOffOnDeviceTransition('device', 'off'), false);
  assert.equal(coexist.shouldPreferVoiceOffOnDeviceTransition('focus', 'power'), false);
});

test('probeAndApplyAudioSession: missing navigator.audioSession is no-op', () => {
  assert.deepEqual(coexist.probeAndApplyAudioSession('ambient', {}), { supported: false, applied: null });
  assert.deepEqual(coexist.probeAndApplyAudioSession('ambient', { audioSession: null }), { supported: false, applied: null });
  assert.deepEqual(coexist.probeAndApplyAudioSession('ambient', undefined), { supported: false, applied: null });
});

test('probeAndApplyAudioSession: ambient preferred, fallback transient', () => {
  const calls = [];
  const session = {
    set type(v) {
      calls.push(v);
      if (v === 'ambient') throw new Error('ambient unsupported');
      this._type = v;
    },
    get type() { return this._type; }
  };
  const result = coexist.probeAndApplyAudioSession('ambient', { audioSession: session });
  assert.equal(result.supported, true);
  assert.equal(result.applied, 'transient');
  assert.deepEqual(calls, ['ambient', 'transient']);
});

test('probeAndApplyAudioSession: transient preferred for brief speech', () => {
  const calls = [];
  const session = {
    set type(v) {
      calls.push(v);
      this._type = v;
    },
    get type() { return this._type; }
  };
  const result = coexist.probeAndApplyAudioSession('transient', { audioSession: session });
  assert.equal(result.supported, true);
  assert.equal(result.applied, 'transient');
  assert.deepEqual(calls, ['transient']);
});

test('probeAndApplyAudioSession: never applies transient-solo or playback; swallows throws', () => {
  const calls = [];
  const session = {
    set type(v) {
      calls.push(v);
      throw new Error('always fail');
    }
  };
  const result = coexist.probeAndApplyAudioSession('playback', { audioSession: session });
  assert.equal(result.supported, true);
  assert.equal(result.applied, null);
  assert.ok(!calls.includes('transient-solo'));
  assert.ok(!calls.includes('playback'));
  // preferred was playback (forbidden) so order falls through to ambient/transient
  assert.deepEqual(calls, ['ambient', 'transient']);
});

test('probeAndApplyAudioSession: outer throw yields unsupported', () => {
  const nav = {
    get audioSession() { throw new Error('boom'); }
  };
  assert.deepEqual(coexist.probeAndApplyAudioSession('ambient', nav), { supported: false, applied: null });
});

test('createGestureAudioRecovery: 4 concurrent tap events create at most 1 new context', async () => {
  let closed = 0;
  let made = 0;
  let ctx = {
    state: 'suspended',
    async resume() { this.state = 'suspended'; },
    async close() { closed++; }
  };
  const recover = coexist.createGestureAudioRecovery({
    getCtx: () => ctx,
    setCtx: (c) => { ctx = c; },
    makeCtx: () => {
      made++;
      return { state: 'running', resume: async () => {} };
    },
    onRecreated: () => {}
  });
  const [r1, r2, r3, r4] = await Promise.all([
    recover('pointerdown'),
    recover('pointerup'),
    recover('touchend'),
    recover('click')
  ]);
  assert.equal(made, 1, 'only one new AudioContext created');
  assert.equal(closed, 1, 'old context closed once');
  assert.ok(r1, 'pointerdown resolves (resume only)');
  assert.equal(r2.state, 'running');
  assert.equal(r2, r3, 'concurrent recreate-capable events share one in-flight result');
  assert.equal(r3, r4);
  assert.equal(r3.state, 'running');
  assert.equal(r4.state, 'running');
});

test('createGestureAudioRecovery pointerdown alone does not create a context', async () => {
  let made = 0;
  let ctx = {
    state: 'suspended',
    async resume() { this.state = 'running'; },
    async close() {}
  };
  const recover = coexist.createGestureAudioRecovery({
    getCtx: () => ctx,
    setCtx: (c) => { ctx = c; },
    makeCtx: () => { made++; return { state: 'running', resume: async () => {} }; },
    onRecreated: () => {}
  });
  const result = await recover('pointerdown');
  assert.equal(made, 0, 'pointerdown never creates a context');
  assert.equal(result.state, 'running');
});

test('createGestureAudioRecovery does not recreate a suspended context that resumes to running', async () => {
  let made = 0;
  let ctx = {
    state: 'suspended',
    async resume() { this.state = 'running'; },
    async close() {}
  };
  const recover = coexist.createGestureAudioRecovery({
    getCtx: () => ctx,
    setCtx: (c) => { ctx = c; },
    makeCtx: () => { made++; return { state: 'running', resume: async () => {} }; },
    onRecreated: () => {}
  });
  const result = await recover('pointerup');
  assert.equal(made, 0, 'no new context when resume reaches running');
  assert.equal(result.state, 'running');
});

test('createGestureAudioRecovery: pointerdown alone never recreates a stuck context', async () => {
  let made = 0;
  let resumes = 0;
  const ctx = { state: 'suspended', async resume() { resumes++; }, async close() {} };
  const recover = coexist.createGestureAudioRecovery({
    getCtx: () => ctx,
    setCtx: () => { throw new Error('must not replace'); },
    makeCtx: () => { made++; return { state: 'running' }; }
  });
  await recover('pointerdown');
  await recover('pointerdown');
  assert.equal(made, 0);
  assert.equal(resumes, 2, 'pointerdown still calls resume()');
});

test('createGestureAudioRecovery: no context yet means nothing to recover', async () => {
  let made = 0;
  const recover = coexist.createGestureAudioRecovery({
    getCtx: () => null,
    setCtx: () => {},
    makeCtx: () => { made++; return { state: 'running' }; }
  });
  assert.equal(await recover('click'), null);
  assert.equal(made, 0);
});

test('createGestureAudioRecovery: a resume() that never settles cannot wedge recovery', async () => {
  let made = 0;
  let closed = 0;
  let ctx = { state: 'suspended', resume() { return new Promise(() => {}); }, close() { closed++; return new Promise(() => {}); } };
  const recover = coexist.createGestureAudioRecovery({
    getCtx: () => ctx,
    setCtx: (c) => { ctx = c; },
    makeCtx: () => { made++; return { state: 'running', resume: async () => {} }; },
    settleMs: 10
  });
  const results = await Promise.all(['pointerup', 'touchend', 'click', 'click'].map(e => recover(e)));
  assert.equal(made, 1);
  assert.equal(closed, 1);
  assert.ok(results.every(r => r === ctx));
  assert.equal((await recover('pointerup')), ctx, 'running context is left alone afterwards');
  assert.equal(made, 1);
});

test('createGestureAudioRecovery: onRecreated receives the new context once', async () => {
  const seen = [];
  let ctx = { state: 'closed' };
  const recover = coexist.createGestureAudioRecovery({
    getCtx: () => ctx,
    setCtx: (c) => { ctx = c; },
    makeCtx: () => ({ state: 'running', resume: async () => {} }),
    onRecreated: (c) => seen.push(c)
  });
  await Promise.all([recover('pointerdown'), recover('pointerup'), recover('touchend'), recover('click')]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], ctx);
});