const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const helper = require(path.join(
  __dirname,
  '..',
  'WorkoutPlanner.Api',
  'wwwroot',
  'js',
  'feedbackReturnUrl.js'
));

test('allow /workout.html', () => {
  assert.equal(helper.safeReturnUrl('/workout.html'), '/workout.html');
  assert.equal(helper.resolveFeedbackBackHref('/workout.html', '/'), '/workout.html');
  assert.equal(helper.feedbackBackLabel('/workout.html'), 'Back to runner');
  assert.equal(helper.runnerFeedbackHref(), '/feedback.html?returnUrl=%2Fworkout.html');
});

test('reject https://evil.example/, javascript:, //evil, and backslash paths', () => {
  assert.equal(helper.safeReturnUrl('https://evil.example/'), null);
  assert.equal(helper.safeReturnUrl('javascript:alert(1)'), null);
  assert.equal(helper.safeReturnUrl('//evil'), null);
  assert.equal(helper.safeReturnUrl('/\\evil'), null);
});

test('missing/invalid returnUrl keeps Back to planner /', () => {
  assert.equal(helper.resolveFeedbackBackHref(null, '/'), '/');
  assert.equal(helper.resolveFeedbackBackHref(undefined, '/'), '/');
  assert.equal(helper.resolveFeedbackBackHref('', '/'), '/');
  assert.equal(helper.resolveFeedbackBackHref('https://evil.example/', '/'), '/');
  assert.equal(helper.resolveFeedbackBackHref('javascript:alert(1)', '/'), '/');
  assert.equal(helper.resolveFeedbackBackHref('//evil', '/'), '/');
  assert.equal(helper.resolveFeedbackBackHref('/\\evil', '/'), '/');
  assert.equal(helper.feedbackBackLabel('/'), 'Back to planner');
  assert.equal(helper.feedbackBackLabel(helper.resolveFeedbackBackHref('nope', '/')), 'Back to planner');
});

test('overflow and finish links include returnUrl=/workout.html', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'workout.html'),
    'utf8'
  );
  const overflow = html.match(/id="overflowFeedbackLink"[^>]*>/);
  const finish = html.match(/id="finishFeedbackLink"[^>]*>/);
  assert.ok(overflow, 'overflowFeedbackLink missing');
  assert.ok(finish, 'finishFeedbackLink missing');
  assert.match(overflow[0], /returnUrl=\/workout\.html|returnUrl=%2Fworkout\.html/);
  assert.match(finish[0], /returnUrl=\/workout\.html|returnUrl=%2Fworkout\.html/);
});
