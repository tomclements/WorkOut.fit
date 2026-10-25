const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const share = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'share.js'));
const WWWROOT = path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot');

const EXPECTED_URL = 'https://plan4strength.com/?ref=share';
const EXPECTED_PAYLOAD = {
  title: 'Plan4Strength',
  text: 'Plan4Strength: free workout plans that fit your gear and schedule.',
  url: EXPECTED_URL
};

test('SHARE_BASE_URL and buildShareUrl use fixed production domain', () => {
  assert.equal(share.SHARE_BASE_URL, 'https://plan4strength.com/');
  assert.equal(share.buildShareUrl(), EXPECTED_URL);
  // Single query parameter, no host dependence, no personal data.
  assert.ok(!share.buildShareUrl().includes('localhost'));
  assert.equal((share.buildShareUrl().match(/\?/g) || []).length, 1);
});

test('buildPayload returns the expected share object', () => {
  assert.deepEqual(share.buildPayload(), EXPECTED_PAYLOAD);
});

test('shareOrCopy resolves "shared" when navigator.share succeeds', async () => {
  const calls = [];
  const nav = {
    share: async (payload) => {
      calls.push(payload);
    }
  };
  const toasts = [];
  const result = await share.shareOrCopy({ nav: nav, toast: (m, t, ms) => toasts.push({ msg: m, type: t, ms: ms }) });
  assert.equal(result, 'shared');
  assert.deepEqual(calls, [EXPECTED_PAYLOAD]);
  assert.deepEqual(toasts, []);
});

test('shareOrCopy resolves "cancelled" silently on AbortError', async () => {
  const clipboardCalls = [];
  const nav = {
    share: async () => {
      const err = new Error('Share cancelled');
      err.name = 'AbortError';
      throw err;
    },
    clipboard: {
      writeText: async (text) => {
        clipboardCalls.push(text);
      }
    }
  };
  const toasts = [];
  const result = await share.shareOrCopy({ nav: nav, toast: (m) => toasts.push(m) });
  assert.equal(result, 'cancelled');
  assert.deepEqual(clipboardCalls, []);
  assert.deepEqual(toasts, []);
});

test('shareOrCopy falls back to clipboard when share throws a real error', async () => {
  const clipboardCalls = [];
  const nav = {
    share: async () => {
      throw new Error('Not allowed');
    },
    clipboard: {
      writeText: async (text) => {
        clipboardCalls.push(text);
      }
    }
  };
  const toasts = [];
  const result = await share.shareOrCopy({ nav: nav, toast: (m) => toasts.push(m) });
  assert.equal(result, 'copied');
  assert.deepEqual(clipboardCalls, [EXPECTED_URL]);
  assert.deepEqual(toasts, ['Link copied']);
});

test('shareOrCopy copies link when navigator.share is unavailable', async () => {
  const clipboardCalls = [];
  const nav = {
    clipboard: {
      writeText: async (text) => {
        clipboardCalls.push(text);
      }
    }
  };
  const toasts = [];
  const result = await share.shareOrCopy({ nav: nav, toast: (m) => toasts.push(m) });
  assert.equal(result, 'copied');
  assert.deepEqual(clipboardCalls, [EXPECTED_URL]);
  assert.deepEqual(toasts, ['Link copied']);
});

test('shareOrCopy reports failure when clipboard and legacy fallback both fail', async () => {
  const nav = {
    clipboard: {
      writeText: async () => {
        throw new Error('denied');
      }
    }
  };
  const toasts = [];
  const result = await share.shareOrCopy({ nav: nav, win: {}, toast: (m, t, ms) => toasts.push({ msg: m, type: t, ms: ms }) });
  assert.equal(result, 'failed');
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].msg.includes(EXPECTED_URL));
  assert.equal(toasts[0].type, 'error');
  assert.equal(toasts[0].ms, 6000);
});

test('shareOrCopy never rejects even with empty dependencies', async () => {
  const result = await share.shareOrCopy({});
  assert.equal(result, 'failed');
});

test('static: seven consumer pages load share.js before site.js', () => {
  for (const name of ['index.html', 'help.html', 'about.html', 'account.html', 'history.html', 'feedback.html', 'privacy.html']) {
    const html = fs.readFileSync(path.join(WWWROOT, name), 'utf8');
    const shareIdx = html.indexOf('src="js/share.js"');
    const siteIdx = html.indexOf('src="js/site.js"');
    assert.ok(shareIdx > -1, `${name} missing js/share.js`);
    assert.ok(siteIdx > -1, `${name} missing js/site.js`);
    assert.ok(shareIdx < siteIdx, `${name} js/share.js must come before js/site.js`);
  }
});

test('static: workout.html and admin.html do not load share.js', () => {
  for (const name of ['workout.html', 'admin.html']) {
    const html = fs.readFileSync(path.join(WWWROOT, name), 'utf8');
    assert.ok(!html.includes('js/share.js'), `${name} should not include js/share.js`);
  }
});

test('static: sw.js bumped to v10 and precaches share.js', () => {
  const sw = fs.readFileSync(path.join(WWWROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes("CACHE_NAME = 'plan4strength-v10'"), 'sw.js cache name must be plan4strength-v10');
  assert.ok(sw.includes("'/js/share.js'"), 'sw.js must precache /js/share.js');
});

test('static: index.html has canonical and OG/Twitter absolute URLs matching SHARE_BASE_URL', () => {
  const html = fs.readFileSync(path.join(WWWROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('<link rel="canonical" href="https://plan4strength.com/" />'), 'canonical');
  assert.ok(html.includes('property="og:url" content="https://plan4strength.com/"'), 'og:url');
  assert.ok(html.includes('property="og:image" content="https://plan4strength.com/icon-512.png"'), 'og:image');
  assert.ok(html.includes('name="twitter:image" content="https://plan4strength.com/icon-512.png"'), 'twitter:image');
  assert.ok(html.includes('name="twitter:card" content="summary"'), 'twitter:card summary');
});
