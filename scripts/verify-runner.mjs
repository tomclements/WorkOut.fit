// Runner regression test — run via the browser-automation skill:
//   node "<skill-dir>/browser.mjs" http://localhost:5198/workout.html --script scripts/verify-runner.mjs
// (Pass a base URL as the first CLI arg; this script reads the final page URL.)
//
// What it guards against (these previously shipped as false greens):
//   • Day dropdown populates from localStorage without any network.
//   • Start uses .runner-screen.active (NOT Tailwind `hidden`).
//   • Exercise name + demo frame render on Start (not the "Exercise" placeholder).
//   • Work timer ticks within ~1.2s without Pause → Resume.
//   • Done / Finish set advances to rest with a live rest timer.
//   • Resume of a stale phaseStartTime does not land at 00:00.
//
// Exits non-zero (throws) if any assertion fails, so it can gate a deploy.

const FIXTURE = {
  generatedAt: '2026-08-27T00:00:00Z',
  criteria: { includeWarmup: false, includeCooldown: false, weeks: 1, goal: 'strength' },
  plan: [
    {
      week: 1,
      days: [
        {
          day: 'Monday', dayIndex: 0, type: 'workout', focus: 'Push', sessionStyle: 'strength',
          exercises: [
            { id: 'bench-press', name: 'Bench Press', sets: 2, reps: '8-12', repsDisplay: '8-12', phase: 'work', targets: ['chest'], workDuration: 30, rest: 45 },
            { id: 'goblet-squat', name: 'Goblet Squat', sets: 2, reps: '8-12', repsDisplay: '8-12', phase: 'work', targets: ['quadriceps'], workDuration: 30, rest: 45 }
          ]
        },
        { day: 'Wednesday', dayIndex: 1, type: 'rest', focus: 'Rest' }
      ]
    }
  ]
};

function parseTimer(text) {
  const m = String(text || '').trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export default async function run(page, ui) {
  await page.addInitScript((plan) => { localStorage.setItem('workoutPlan', JSON.stringify(plan)); }, FIXTURE);

  await page.reload();
  await page.waitForTimeout(300);

  await page.waitForFunction(
    () => {
      const s = document.getElementById('daySelect');
      return s && s.options.length > 0;
    },
    { timeout: 12000 }
  );

  const results = { ok: true, failures: [] };
  const fail = (name, detail) => { results.ok = false; results.failures.push({ name, detail }); };

  const boot = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'document.documentElement.dataset.hasRunnerEngine = (typeof window.RunnerEngine === "object" && !!window.RunnerEngine.createSession) ? "1" : "0";';
    document.documentElement.appendChild(s);
    return {
      engine: document.documentElement.dataset.hasRunnerEngine === '1',
      dayValue: document.getElementById('daySelect')?.value || '',
      dayOptions: document.getElementById('daySelect')?.options.length || 0
    };
  });
  results.boot = boot;
  if (!boot.engine) fail('runner-engine', 'window.RunnerEngine missing');
  if (!boot.dayValue) fail('day-selected', 'day dropdown has options but no selected value');

  const musicOk = await page.evaluate(() => {
    const sel = document.getElementById('musicStyleActive');
    const hint = document.getElementById('deviceMusicHintActive');
    if (!sel || !hint) return false;
    sel.value = 'device';
    sel.dispatchEvent(new Event('change'));
    const fired = !hint.classList.contains('hidden');
    sel.value = 'off';
    sel.dispatchEvent(new Event('change'));
    return fired;
  });
  if (!musicOk) fail('music-device-hint', 'selecting device did not reveal music-app links');

  const startRes = await page.evaluate(() => {
    const btn = document.getElementById('startBtn');
    if (!btn) return { exists: false };
    btn.click();
    return { exists: true };
  });
  if (!startRes.exists) fail('start-exists', 'start button missing');

  try {
    await page.waitForFunction(
      () => document.getElementById('activeScreen')?.classList.contains('active'),
      { timeout: 8000 }
    );
  } catch {
    fail('start-transitions', 'activeScreen never received .active after Start');
  }

  const afterStart = await page.evaluate(() => {
    const active = document.getElementById('activeScreen');
    const setup = document.getElementById('setupScreen');
    const name = document.getElementById('exerciseName');
    const demo = document.getElementById('demoLink');
    const timer = document.getElementById('timerDisplay');
    return {
      activeShown: !!(active && active.classList.contains('active')),
      setupHidden: !!(setup && !setup.classList.contains('active')),
      name: name ? name.textContent.trim() : null,
      hasDemoFrame: !!(demo && demo.querySelector('.demo-frame')),
      timer: timer ? timer.textContent.trim() : null
    };
  });
  if (afterStart.activeShown !== true || afterStart.setupHidden !== true) {
    fail('start-active-class', JSON.stringify(afterStart));
  }
  if (!afterStart.name || afterStart.name === 'Exercise') {
    fail('exercise-name', `got ${JSON.stringify(afterStart.name)}`);
  }
  if (!afterStart.hasDemoFrame) fail('demo-frame', 'no .demo-frame after Start');
  if (!afterStart.timer || afterStart.timer === '00:00') fail('timer-initial', afterStart.timer);

  const t0 = afterStart.timer;
  await page.waitForTimeout(1200);
  const t1 = await page.evaluate(() => document.getElementById('timerDisplay')?.textContent.trim() || '');
  const s0 = parseTimer(t0);
  const s1 = parseTimer(t1);
  if (s0 == null || s1 == null || !(s1 < s0)) {
    fail('timer-ticks', `timer did not advance without Pause/Resume (${t0} -> ${t1})`);
  }
  results.timerBefore = t0;
  results.timerAfter = t1;

  const doneRes = await page.evaluate(() => {
    const btn = document.getElementById('completeSetBtn');
    if (!btn) return { exists: false };
    btn.click();
    return { exists: true };
  });
  if (!doneRes.exists) fail('done-exists', 'completeSetBtn missing');

  try {
    await page.waitForFunction(
      () => document.getElementById('restScreen')?.classList.contains('active'),
      { timeout: 5000 }
    );
  } catch {
    fail('done-advances-rest', 'restScreen never received .active after Done');
  }

  const afterDone = await page.evaluate(() => {
    const rest = document.getElementById('restScreen');
    const timer = document.getElementById('restTimer');
    const next = document.getElementById('nextExerciseName');
    const demo = document.getElementById('nextDemo');
    return {
      restActive: !!(rest && rest.classList.contains('active')),
      restTimer: timer ? timer.textContent.trim() : null,
      nextName: next ? next.textContent.trim() : null,
      hasDemo: !!(demo && demo.querySelector('.demo-frame'))
    };
  });
  if (!afterDone.restActive) fail('rest-active', JSON.stringify(afterDone));
  if (!afterDone.restTimer || afterDone.restTimer === '00:00') {
    fail('rest-timer', `rest timer was ${afterDone.restTimer}`);
  }

  // Stale localStorage resume must restart the interval, not sit at 00:00.
  await page.evaluate(() => {
    const started = Date.now() - 10 * 60 * 1000;
    localStorage.setItem('workoutSession', JSON.stringify({
      phase: 'work',
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      startTime: started,
      phaseStartTime: started,
      phaseDurationSeconds: 30,
      sessionExercises: [
        { id: 'bench-press', name: 'Bench Press', phase: 'work', sets: 2, workDuration: 30, rest: 45, repsDisplay: '8-12' },
        { id: 'goblet-squat', name: 'Goblet Squat', phase: 'work', sets: 2, workDuration: 30, rest: 45, repsDisplay: '8-12' }
      ]
    }));
  });
  await page.reload();
  await page.waitForTimeout(400);

  const resumeClick = await page.evaluate(() => {
    const banner = document.getElementById('resumeBanner');
    const btn = document.getElementById('resumeBtn');
    if (!btn) return { exists: false, bannerHidden: banner ? banner.classList.contains('hidden') : null };
    btn.click();
    return { exists: true, bannerHidden: banner ? banner.classList.contains('hidden') : null };
  });
  if (!resumeClick.exists) fail('resume-exists', 'resume button missing');

  try {
    await page.waitForFunction(
      () => document.getElementById('activeScreen')?.classList.contains('active'),
      { timeout: 8000 }
    );
  } catch {
    fail('stale-resume-screen', 'activeScreen never received .active after Resume');
  }

  const afterResume = await page.evaluate(() => {
    const name = document.getElementById('exerciseName');
    const timer = document.getElementById('timerDisplay');
    const demo = document.getElementById('demoLink');
    const done = document.getElementById('completeSetBtn');
    return {
      name: name ? name.textContent.trim() : null,
      timer: timer ? timer.textContent.trim() : null,
      hasDemo: !!(demo && demo.querySelector('.demo-frame')),
      doneDisabled: done ? !!done.disabled : null
    };
  });
  results.staleResume = afterResume;
  if (!afterResume.name || afterResume.name === 'Exercise') {
    fail('stale-resume-name', JSON.stringify(afterResume));
  }
  if (!afterResume.timer || afterResume.timer === '00:00') {
    fail('stale-resume-timer', `stale resume landed at ${afterResume.timer}`);
  }
  if (!afterResume.hasDemo) fail('stale-resume-demo', 'no demo frame after stale resume');

  const doneAfterResume = await page.evaluate(() => {
    const btn = document.getElementById('completeSetBtn');
    if (!btn) return { exists: false };
    btn.click();
    return { exists: true };
  });
  if (!doneAfterResume.exists) fail('stale-resume-done-exists', 'completeSetBtn missing after resume');
  try {
    await page.waitForFunction(
      () => document.getElementById('restScreen')?.classList.contains('active'),
      { timeout: 5000 }
    );
  } catch {
    fail('stale-resume-done', 'Done did not respond after stale resume');
  }

  results.dayOptionCount = await page.evaluate(() => document.getElementById('daySelect')?.options.length || 0);
  if (results.dayOptionCount < 1) fail('day-dropdown', 'day dropdown not populated');

  results.summary = results.ok
    ? 'PASS: start ticks + name/demo, Done advances to rest, stale resume is not 00:00'
    : 'FAIL: ' + results.failures.map(f => `${f.name} (${f.detail})`).join('; ');

  if (!results.ok) {
    throw new Error('runner regression failed: ' + results.failures.map(f => f.name).join(', '));
  }
  return results;
}
