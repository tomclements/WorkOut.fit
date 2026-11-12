const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const wwwroot = path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot');
const appSource = fs.readFileSync(path.join(wwwroot, 'js', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(wwwroot, 'index.html'), 'utf8');

function loadAppWithMocks(mocks) {
  const context = {
    document: {
      addEventListener: () => {},
      getElementById: (id) => mocks.elements[id] || null,
      querySelectorAll: () => [],
      body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    },
    window: {
      addEventListener: () => {},
      RunnerEngine: null,
      OverflowSettings: null,
      StartWeightGate: null,
      StayAwake: null,
      AudioCoexistence: null,
      QuitWorkout: null,
      NextWorkout: null,
    },
    localStorage: {
      store: {},
      getItem(k) { return this.store[k] || null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; },
    },
    fetch: async () => ({ ok: true, json: async () => [] }),
    showToast: () => {},
    openLoginModal: () => {},
    escapeHtml: (s) => String(s),
    formatDate: () => 'Today',
    formatDuration: () => '20 min',
    console: { error: () => {}, warn: () => {}, log: () => {} },
    setTimeout: () => {},
    JSON,
    Date,
    Math,
    Number,
    parseInt,
    parseFloat,
    isNaN,
    Array,
    Object,
    String,
    RegExp,
    Map,
    Set,
    Promise,
    Error,
    TypeError,
    ...mocks.globals,
  };
  context.window.localStorage = context.localStorage;
  vm.createContext(context);
  vm.runInContext(appSource, context, { filename: 'app.js' });
  // app.js declares its own currentUser; override after load for tests
  if (mocks.globals && mocks.globals.currentUser !== undefined) {
    vm.runInContext(`currentUser = ${JSON.stringify(mocks.globals.currentUser)}`, context);
  }
  return context;
}

function makeElement(id, classes = '') {
  const classSet = new Set(classes.split(' ').filter(Boolean));
  const dataset = {};
  return {
    id,
    addEventListener: () => {},
    classList: {
      add: (c) => classSet.add(c),
      remove: (c) => classSet.delete(c),
      contains: (c) => classSet.has(c),
      toggle: (c, force) => { if (force) classSet.add(c); else classSet.delete(c); },
    },
    className: classes,
    innerHTML: '',
    textContent: '',
    href: '',
    style: {},
    dataset,
  };
}

test('dashboard cards start visible with skeleton; content is hidden', () => {
  assert.match(indexHtml, /<div[^>]*id="nextWorkoutCard"[^>]*>/);
  assert.doesNotMatch(indexHtml, /<div[^>]*id="nextWorkoutCard"[^>]*class="[^"]*hidden[^"]*"/);
  assert.match(indexHtml, /<div[^>]*id="nextWorkoutSkeleton"[^>]*>/);
  assert.match(indexHtml, /<div[^>]*id="nextWorkoutContent"[^>]*class="[^"]*hidden[^"]*"/);
  assert.doesNotMatch(indexHtml, /<div[^>]*id="homeToday"[^>]*class="[^"]*hidden[^"]*"/);
  assert.match(indexHtml, /<div[^>]*id="homeTodaySkeleton"[^>]*>/);
  assert.match(indexHtml, /<div[^>]*id="homeTodayContent"[^>]*class="[^"]*hidden[^"]*"/);
  assert.match(indexHtml, /<div[^>]*id="nextWorkoutCard"[^>]*data-state="loading"[^>]*>/);
  assert.match(indexHtml, /<section[^>]*id="dashboardSection"[^>]*data-auth-state="pending"[^>]*>/);
});

test('renderHomeToday hides skeleton and shows content even when sessions fetch fails', async () => {
  const homeToday = makeElement('homeToday');
  const skeleton = makeElement('homeTodaySkeleton');
  const content = makeElement('homeTodayContent', 'hidden');
  const badge = makeElement('homeStreakBadge', 'hidden');
  const hint = makeElement('homeStreakHint');
  const count = makeElement('homeStreakCount');
  const last = makeElement('homeLastWorkout');
  const elements = {
    homeToday, homeTodaySkeleton: skeleton, homeTodayContent: content,
    homeStreakBadge: badge, homeStreakHint: hint, homeStreakCount: count, homeLastWorkout: last,
    dashboardSection: makeElement('dashboardSection'),
    dashboardEmptyState: makeElement('dashboardEmptyState', 'hidden'),
    nextWorkoutCard: makeElement('nextWorkoutCard'),
    savedPlansTable: makeElement('savedPlansTable'),
    vanityStats: makeElement('vanityStats', 'hidden'),
  };
  const ctx = loadAppWithMocks({ elements, globals: { currentUser: 'test@example.com' } });
  ctx.renderHomeToday([]);
  assert.equal(skeleton.classList.contains('hidden'), true, 'skeleton hidden');
  assert.equal(content.classList.contains('hidden'), false, 'content shown');
});

test('loadDashboard calls renderHomeToday even when dashboard endpoint returns non-ok', async () => {
  let renderCalled = false;
  const ctx = loadAppWithMocks({
    elements: {
      homeToday: makeElement('homeToday'),
      homeTodaySkeleton: makeElement('homeTodaySkeleton'),
      homeTodayContent: makeElement('homeTodayContent', 'hidden'),
      homeStreakBadge: makeElement('homeStreakBadge', 'hidden'),
      homeStreakHint: makeElement('homeStreakHint'),
      homeStreakCount: makeElement('homeStreakCount'),
      homeLastWorkout: makeElement('homeLastWorkout'),
      dashboardSection: makeElement('dashboardSection'),
      dashboardEmptyState: makeElement('dashboardEmptyState', 'hidden'),
      nextWorkoutCard: makeElement('nextWorkoutCard'),
      savedPlansTable: makeElement('savedPlansTable'),
      vanityStats: makeElement('vanityStats', 'hidden'),
    },
    globals: {
      currentUser: 'test@example.com',
      fetch: async (url) => {
        if (url.includes('/api/dashboard')) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, json: async () => [] };
      },
    },
  });
  // Monkey-patch renderHomeToday to observe it is reached
  ctx.renderHomeToday = () => { renderCalled = true; };
  await ctx.loadDashboard();
  assert.equal(renderCalled, true, 'renderHomeToday still called after dashboard failure');
});

test('signed-in reload keeps nextWorkoutCard visible because showLoggedOut no longer pins it hidden', () => {
  const card = makeElement('nextWorkoutCard');
  const ctx = loadAppWithMocks({
    elements: {
      authSection: makeElement('authSection'),
      openAuthBtn: makeElement('openAuthBtn'),
      logoutBtn: makeElement('logoutBtn'),
      welcomeSection: makeElement('welcomeSection'),
      dashboardSection: makeElement('dashboardSection'),
      dashboardExtras: makeElement('dashboardExtras'),
      plannerSection: makeElement('plannerSection'),
      togglePlannerBtn: makeElement('togglePlannerBtn'),
      closePlannerBtn: makeElement('closePlannerBtn'),
      savePlanBtn: makeElement('savePlanBtn'),
      nextWorkoutCard: card,
    },
  });
  for (const name of ['loadFavorites', 'applyPlanDefaultsToForm', 'closeCustomPlan', 'loadDashboard', 'loadBodyWeight']) ctx[name] = () => {};
  ctx.loadPreferences = async () => {};
  ctx.showLoggedOut();
  ctx.renderHomeToday = () => {};
  ctx.showLoggedIn('user@example.com', []);
  assert.equal(card.classList.contains('hidden'), false, 'card is visible after re-login');
});

test('updateNextWorkoutCard renders empty placeholder when no plan exists', async () => {
  const card = makeElement('nextWorkoutCard');
  const skeleton = makeElement('nextWorkoutSkeleton');
  const content = makeElement('nextWorkoutContent', 'hidden');
  const populated = makeElement('nextWorkoutPopulated');
  const empty = makeElement('nextWorkoutEmpty', 'hidden');
  const error = makeElement('nextWorkoutError', 'hidden');
  const ctx = loadAppWithMocks({
    elements: {
      nextWorkoutCard: card, nextWorkoutSkeleton: skeleton, nextWorkoutContent: content,
      nextWorkoutPopulated: populated, nextWorkoutEmpty: empty, nextWorkoutError: error,
      dashboardEmptyState: makeElement('dashboardEmptyState', 'hidden'),
    },
    globals: { currentUser: null },
  });
  await ctx.updateNextWorkoutCard();
  assert.equal(skeleton.classList.contains('hidden'), true);
  assert.equal(empty.classList.contains('hidden'), false, 'empty placeholder shown');
  assert.equal(populated.classList.contains('hidden'), true);
  assert.equal(error.classList.contains('hidden'), true);
});

test('updateNextWorkoutCard renders error placeholder for malformed plan data', async () => {
  const card = makeElement('nextWorkoutCard');
  const skeleton = makeElement('nextWorkoutSkeleton');
  const content = makeElement('nextWorkoutContent', 'hidden');
  const populated = makeElement('nextWorkoutPopulated');
  const empty = makeElement('nextWorkoutEmpty', 'hidden');
  const error = makeElement('nextWorkoutError', 'hidden');
  const ctx = loadAppWithMocks({
    elements: {
      nextWorkoutCard: card, nextWorkoutSkeleton: skeleton, nextWorkoutContent: content,
      nextWorkoutPopulated: populated, nextWorkoutEmpty: empty, nextWorkoutError: error,
      dashboardEmptyState: makeElement('dashboardEmptyState', 'hidden'),
    },
    globals: {
      currentUser: 'test@example.com',
      fetch: async () => { throw new Error('network down'); },
    },
  });
  ctx.localStorage.setItem('workoutPlan', '{invalid');
  await ctx.updateNextWorkoutCard();
  assert.equal(skeleton.classList.contains('hidden'), true);
  assert.equal(error.classList.contains('hidden'), false, 'error placeholder shown');
  assert.equal(populated.classList.contains('hidden'), true);
  assert.equal(empty.classList.contains('hidden'), true);
});

function dashboardElements() {
  const ids = ['homeToday', 'homeTodaySkeleton', 'homeTodayContent', 'homeStreakBadge',
    'homeStreakHint', 'homeStreakCount', 'homeLastWorkout', 'nextWorkoutCard',
    'nextWorkoutSkeleton', 'nextWorkoutContent', 'nextWorkoutPopulated', 'nextWorkoutEmpty',
    'nextWorkoutError', 'nextWorkoutHeading', 'nextWorkoutInfo', 'nextWorkoutBtn',
    'nextWorkoutNewPlanBtn', 'dashboardEmptyState'];
  return Object.fromEntries(ids.map(id => [id, makeElement(id,
    /Content|Empty$|Error$|Badge|NewPlanBtn/.test(id) ? 'hidden' : '')]));
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('delayed dashboard then sessions keeps reserved cards present until content is ready', async () => {
  const elements = dashboardElements();
  const dashboard = deferred();
  const sessions = deferred();
  const calls = [];
  const ctx = loadAppWithMocks({ elements, globals: {
    currentUser: 'qa',
    fetch: (url) => { calls.push(url); return url === '/api/dashboard' ? dashboard.promise : sessions.promise; }
  } });
  ctx.renderDashboard = () => {};
  const pending = ctx.loadDashboard();
  assert.deepEqual(calls, ['/api/dashboard']);
  assert.equal(elements.homeToday.classList.contains('hidden'), false);
  assert.equal(elements.homeTodayContent.classList.contains('hidden'), true);
  dashboard.resolve({ ok: true, json: async () => ({}) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['/api/dashboard', '/api/runner/sessions']);
  assert.equal(elements.homeTodaySkeleton.classList.contains('hidden'), false);
  sessions.resolve({ ok: true, json: async () => [] });
  await pending;
  assert.equal(elements.homeTodaySkeleton.classList.contains('hidden'), true);
  assert.equal(elements.homeTodayContent.classList.contains('hidden'), false);
  assert.match(elements.homeLastWorkout.innerHTML, /No workouts yet/);
});

test('failed session fetch settles the skeleton and shows an empty history', async () => {
  const elements = dashboardElements();
  const ctx = loadAppWithMocks({ elements, globals: {
    currentUser: 'qa', fetch: async () => { throw new Error('offline'); }
  } });
  await ctx.loadDashboard();
  assert.equal(elements.homeTodaySkeleton.classList.contains('hidden'), true);
  assert.equal(elements.homeTodayContent.classList.contains('hidden'), false);
  assert.match(elements.homeLastWorkout.innerHTML, /No workouts yet/);
});

test('delayed next-plan loading settles both normal and completed-plan button states', async () => {
  const elements = dashboardElements();
  const plan = deferred();
  const found = { week: 1, dayIndex: 0, day: { day: 'Monday', focus: 'Full body' } };
  const ctx = loadAppWithMocks({ elements, globals: {
    currentUser: 'qa', capitalize: value => value,
    NextWorkout: { resolveNextWorkoutDay: () => found, runnerSetupHref: () => '/workout.html?setup=1' }
  } });
  ctx.localStorage.setItem('workoutPlanSavedId', '42');
  ctx.fetchSavedPlan = () => plan.promise;
  ctx.fetchRunnerSessions = async () => [];
  const pending = ctx.updateNextWorkoutCard();
  assert.equal(elements.nextWorkoutSkeleton.classList.contains('hidden'), false);
  assert.equal(elements.nextWorkoutCard.classList.contains('hidden'), false);
  plan.resolve({ plan: [] });
  await pending;
  assert.equal(elements.nextWorkoutPopulated.classList.contains('hidden'), false);
  assert.equal(elements.nextWorkoutSkeleton.classList.contains('hidden'), true);
  assert.equal(elements.nextWorkoutNewPlanBtn.classList.contains('hidden'), true);
  found.planComplete = true;
  await ctx.updateNextWorkoutCard();
  assert.equal(elements.nextWorkoutNewPlanBtn.classList.contains('hidden'), false);
  assert.match(elements.nextWorkoutBtn.textContent, /Repeat last workout/);
  assert.equal(elements.nextWorkoutError.classList.contains('hidden'), true);
});

test('mocked current-date history toggles the existing streak badge without changing semantics', () => {
  const elements = dashboardElements();
  const ctx = loadAppWithMocks({ elements });
  ctx.renderHomeToday([]);
  assert.equal(elements.homeStreakBadge.classList.contains('hidden'), true);
  ctx.renderHomeToday([{ startedAt: new Date().toISOString(), durationSeconds: 1200, totalSets: 10 }]);
  assert.equal(elements.homeStreakBadge.classList.contains('hidden'), false);
  assert.equal(elements.homeStreakCount.textContent, '1');
  ctx.renderHomeToday([]);
  assert.equal(elements.homeStreakBadge.classList.contains('hidden'), true);
});

test('updateNextWorkoutCard sets data-state loading then empty, populated, or error', async () => {
  const card = makeElement('nextWorkoutCard');
  const skeleton = makeElement('nextWorkoutSkeleton');
  const content = makeElement('nextWorkoutContent', 'hidden');
  const populated = makeElement('nextWorkoutPopulated');
  const empty = makeElement('nextWorkoutEmpty', 'hidden');
  const error = makeElement('nextWorkoutError', 'hidden');
  const ctx = loadAppWithMocks({
    elements: {
      nextWorkoutCard: card, nextWorkoutSkeleton: skeleton, nextWorkoutContent: content,
      nextWorkoutPopulated: populated, nextWorkoutEmpty: empty, nextWorkoutError: error,
      dashboardEmptyState: makeElement('dashboardEmptyState', 'hidden'),
    },
    globals: { currentUser: 'qa' },
  });
  const sessions = deferred();
  ctx.fetchRunnerSessions = () => sessions.promise;
  let pending = ctx.updateNextWorkoutCard();
  assert.equal(card.dataset.state, 'loading', 'state is loading while fetching');
  sessions.resolve([]);
  await pending;
  assert.equal(card.dataset.state, 'empty', 'no plan resolves to empty state');
  assert.equal(empty.classList.contains('hidden'), false);

  const found = { week: 1, dayIndex: 0, day: { day: 'Monday', focus: 'Full body' } };
  ctx.capitalize = value => value;
  ctx.NextWorkout = { resolveNextWorkoutDay: () => found, runnerSetupHref: () => '/workout.html?setup=1', joinDistinctLabels: parts => parts.join(' · ') };
  ctx.localStorage.setItem('workoutPlan', JSON.stringify({ plan: [{ week: 1, days: [{ type: 'workout', day: 'Monday', focus: 'Full body' }] }] }));
  await ctx.updateNextWorkoutCard();
  assert.equal(card.dataset.state, 'populated', 'plan with next day resolves to populated');

  ctx.fetchSavedPlan = async () => { throw new Error('offline'); };
  ctx.localStorage.setItem('workoutPlanSavedId', '42');
  vm.runInContext('currentUser = "qa"', ctx);
  pending = ctx.updateNextWorkoutCard();
  assert.equal(card.dataset.state, 'loading', 'state resets to loading on new fetch');
  await pending;
  assert.equal(card.dataset.state, 'error', 'fetch failure resolves to error');
});

test('syncDashboardEmptyState uses data-state and totals, not card visibility', () => {
  const card = makeElement('nextWorkoutCard');
  const emptyState = makeElement('dashboardEmptyState', 'hidden');
  const ctx = loadAppWithMocks({
    elements: {
      nextWorkoutCard: card, dashboardEmptyState: emptyState,
      savedPlansTable: makeElement('savedPlansTable'),
      recentActivity: makeElement('recentActivity'),
      vanityStats: makeElement('vanityStats', 'hidden'),
    },
    globals: { currentUser: 'qa' },
  });

  function assertEmpty(visible, label) {
    assert.equal(emptyState.classList.contains('hidden'), !visible, label);
  }

  card.dataset.state = 'loading';
  ctx.syncDashboardEmptyState(0, 0);
  assertEmpty(false, 'loading hides onboarding');

  card.dataset.state = 'error';
  ctx.syncDashboardEmptyState(0, 0);
  assertEmpty(false, 'error with zero totals keeps onboarding hidden (error placeholder is the fallback)');

  card.dataset.state = 'populated';
  ctx.syncDashboardEmptyState(0, 0);
  assertEmpty(false, 'populated slot with zero totals still hides onboarding');

  card.dataset.state = 'empty';
  ctx.syncDashboardEmptyState(0, 0);
  assertEmpty(true, 'empty slot with zero totals shows onboarding');

  card.dataset.state = 'empty';
  ctx.syncDashboardEmptyState(1, 0);
  assertEmpty(false, 'empty slot with saved plan hides onboarding');

  card.dataset.state = 'empty';
  ctx.syncDashboardEmptyState(0, 3);
  assertEmpty(false, 'empty slot with session history hides onboarding');
});

test('signed-in resolution reveals dashboard from pending auth state', () => {
  const dashboardSection = makeElement('dashboardSection', 'hidden');
  dashboardSection.dataset.authState = 'pending';
  const welcomeSection = makeElement('welcomeSection');
  const dashboardExtras = makeElement('dashboardExtras');
  const ctx = loadAppWithMocks({
    elements: {
      authSection: makeElement('authSection'),
      openAuthBtn: makeElement('openAuthBtn'),
      logoutBtn: makeElement('logoutBtn'),
      welcomeSection,
      dashboardSection,
      dashboardExtras,
      plannerSection: makeElement('plannerSection'),
      togglePlannerBtn: makeElement('togglePlannerBtn'),
      closePlannerBtn: makeElement('closePlannerBtn'),
      savePlanBtn: makeElement('savePlanBtn'),
      nextWorkoutCard: makeElement('nextWorkoutCard'),
    },
  });
  for (const name of ['loadFavorites', 'applyPlanDefaultsToForm', 'closeCustomPlan', 'loadDashboard', 'loadBodyWeight', 'updateNextWorkoutCard']) ctx[name] = () => {};
  ctx.loadPreferences = async () => {};
  ctx.showLoggedIn('user@example.com', []);
  assert.equal(dashboardSection.classList.contains('hidden'), false, 'dashboard visible after signed-in resolution');
  assert.equal(dashboardSection.dataset.authState, 'signed-in', 'auth state updated to signed-in');
  assert.equal(welcomeSection.classList.contains('hidden'), true, 'welcome hidden for signed-in');
});

test('guest resolution hides dashboard and restores welcome from pending auth state', () => {
  const dashboardSection = makeElement('dashboardSection');
  dashboardSection.dataset.authState = 'pending';
  const welcomeSection = makeElement('welcomeSection', 'hidden');
  const ctx = loadAppWithMocks({
    elements: {
      authSection: makeElement('authSection'),
      openAuthBtn: makeElement('openAuthBtn'),
      logoutBtn: makeElement('logoutBtn'),
      welcomeSection,
      dashboardSection,
      dashboardExtras: makeElement('dashboardExtras'),
      plannerSection: makeElement('plannerSection'),
      togglePlannerBtn: makeElement('togglePlannerBtn'),
      closePlannerBtn: makeElement('closePlannerBtn'),
      savePlanBtn: makeElement('savePlanBtn'),
      nextWorkoutCard: makeElement('nextWorkoutCard'),
    },
  });
  for (const name of ['loadFavorites', 'applyPlanDefaultsToForm', 'closeCustomPlan', 'loadDashboard', 'loadBodyWeight']) ctx[name] = () => {};
  ctx.loadPreferences = async () => {};
  ctx.showLoggedOut();
  assert.equal(dashboardSection.classList.contains('hidden'), true, 'dashboard hidden after guest resolution');
  assert.equal(dashboardSection.dataset.authState, 'guest', 'auth state updated to guest');
  assert.equal(welcomeSection.classList.contains('hidden'), false, 'welcome visible for guests');
});

test('auth reservation exists in CSS before scripts run and onboarding matches the card footprint', () => {
  const styles = fs.readFileSync(path.join(wwwroot, 'css', 'styles.css'), 'utf8');
  assert.match(indexHtml, /id="dashboardSection"[^>]*data-auth-state="pending"/);
  assert.match(styles, /#dashboardSection\[data-auth-state="pending"\]\s*\{\s*display: block;/);
  assert.match(styles, /body:has\(#dashboardSection\[data-auth-state="pending"\]\) #welcomeSection\s*\{\s*display: none;/);
  const onboardingHeights = [...styles.matchAll(/#dashboardEmptyState\s*\{\s*min-height: ([\d.]+)rem;/g)].map(match => Number(match[1]));
  assert.deepEqual(onboardingHeights, [17 + 10 + 1.5, 10 + 8 + 1.5], 'onboarding replaces both cards plus their inter-card margin');
  assert.match(styles, /#dashboardSection:has\(#dashboardEmptyState:not\(\.hidden\)\) #nextWorkoutCard,[\s\S]*?#homeToday\s*\{\s*display: none;/);
});

test('reloading leaves onboarding for loading, and stale plan responses cannot replace the latest empty state', async () => {
  const elements = dashboardElements();
  const card = elements.nextWorkoutCard;
  card.dataset.state = 'empty';
  const ctx = loadAppWithMocks({ elements, globals: { currentUser: 'qa' } });
  ctx.syncDashboardEmptyState(0, 0);
  assert.equal(elements.dashboardEmptyState.classList.contains('hidden'), false);
  ctx.localStorage.setItem('workoutPlanSavedId', '42');
  const first = deferred(), second = deferred();
  let calls = 0;
  ctx.fetchSavedPlan = () => (++calls === 1 ? first.promise : second.promise);
  const oldRequest = ctx.updateNextWorkoutCard();
  assert.equal(card.dataset.state, 'loading');
  assert.equal(elements.dashboardEmptyState.classList.contains('hidden'), true);
  const latestRequest = ctx.updateNextWorkoutCard();
  second.resolve(null);
  await latestRequest;
  assert.equal(card.dataset.state, 'empty');
  assert.equal(elements.dashboardEmptyState.classList.contains('hidden'), false);
  first.resolve({ plan: [] });
  await oldRequest;
  assert.equal(card.dataset.state, 'empty');
  assert.equal(elements.dashboardEmptyState.classList.contains('hidden'), false);
});

test('slow auth retains pending reservation until signed-in resolution without guest fallback', async () => {
  const section = makeElement('dashboardSection', 'hidden');
  section.dataset.authState = 'pending';
  const ctx = loadAppWithMocks({ elements: { dashboardSection: section } });
  const auth = deferred();
  let guestCalls = 0;
  ctx.initGlobalAuth = () => auth.promise;
  ctx.showLoggedOut = () => { guestCalls++; };
  const pending = ctx.resolveInitialAuth();
  assert.equal(section.dataset.authState, 'pending');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(section.dataset.authState, 'pending', 'reservation remains during a delayed auth response');
  section.dataset.authState = 'signed-in'; // auth-changed listener has resolved the real user
  auth.resolve();
  await pending;
  assert.equal(section.dataset.authState, 'signed-in');
  assert.equal(guestCalls, 0);
});

test('silent and rejected auth failures release the pending reservation as guest', async () => {
  for (const rejects of [false, true]) {
    const section = makeElement('dashboardSection');
    section.dataset.authState = 'pending';
    const ctx = loadAppWithMocks({ elements: { dashboardSection: section } });
    ctx.initGlobalAuth = async () => { if (rejects) throw new Error('offline'); };
    ctx.showLoggedOut = () => {
      section.dataset.authState = 'guest';
      section.classList.add('hidden');
    };
    await ctx.resolveInitialAuth();
    assert.equal(section.dataset.authState, 'guest');
    assert.equal(section.classList.contains('hidden'), true);
  }
});

test('pending auth hides the signed-out header to avoid flash', () => {
  const styles = fs.readFileSync(path.join(wwwroot, 'css', 'styles.css'), 'utf8');
  assert.match(styles, /body:has\(#dashboardSection\[data-auth-state="pending"\]\) #authSection\s*\{\s*visibility:\s*hidden;/);
});

test('resolveInitialAuth starts before awaiting loadPreferences in DOMContentLoaded', () => {
  const handler = appSource.match(/document\.addEventListener\('DOMContentLoaded',\s*async\s*\(\)\s*=>\s*\{([\s\S]*)\}\);/);
  assert.ok(handler, 'DOMContentLoaded handler found');
  const body = handler[1];
  const authStart = body.indexOf('const authReady = resolveInitialAuth();');
  const prefsAwait = body.indexOf('await loadPreferences();');
  assert.ok(authStart >= 0, 'auth is started and assigned to authReady');
  assert.ok(prefsAwait > authStart, 'loadPreferences is awaited after auth start');
});
