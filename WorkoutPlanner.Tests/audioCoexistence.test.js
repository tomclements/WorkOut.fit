const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const coexist = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'audioCoexistence.js'));

test('shouldUseSilentKeepAlive: false only for device + tones', () => {
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'device', tonesEnabled: true }), false);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'device', tonesEnabled: false }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'drive', tonesEnabled: true }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'off', tonesEnabled: true }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'focus', tonesEnabled: false }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'power', tonesEnabled: true }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({ musicStyle: 'calm', tonesEnabled: true }), true);
  assert.equal(coexist.shouldUseSilentKeepAlive({}), true);
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
