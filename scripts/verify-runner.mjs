// Runner regression test — run via the browser-automation skill:
//   node "<skill-dir>/browser.mjs" http://localhost:5198/workout.html --script scripts/verify-runner.mjs
// (Pass a base URL as the first CLI arg; this script reads the final page URL.)
//
// What it guards against:
//   • The day dropdown must populate from localStorage without any network
//     (the iPhone bug: init was blocked by a hanging auth/catalog fetch).
//   • The "My music" handler must reveal the Apple Music/Spotify links.
//   • The Start button must transition from setup to the active screen.
//
// Exits non-zero (throws) if any assertion fails, so it can gate a deploy.

const FIXTURE = {
  generatedAt: '2026-08-27T00:00:00Z',
  criteria: { includeWarmup: false, includeCooldown: false },
  plan: [
    {
      week: 1,
      days: [
        {
          day: 'Monday', dayIndex: 0, type: 'workout', focus: 'Push', sessionStyle: 'strength',
          exercises: [
            { name: 'Bench Press', sets: 3, reps: '8-12', phase: 'work', targets: ['chest'], workDuration: 30, rest: 60 }
          ]
        },
        { day: 'Wednesday', dayIndex: 1, type: 'rest', focus: 'Rest' }
      ]
    }
  ]
};

export default async function run(page, ui) {
  // Inject a valid generated plan before the page's init reads it.
  await page.addInitScript((plan) => { localStorage.setItem('workoutPlan', JSON.stringify(plan)); }, FIXTURE);

  await page.reload(); // go to the url arg fresh so addInitScript applies
  await page.waitForTimeout(300);

  // 1) Day dropdown must populate from localStorage without network.
  await page.waitForFunction(
    () => {
      const s = document.getElementById('daySelect');
      return s && s.options.length > 0;
    },
    { timeout: 12000 }
  );

  const results = { ok: true, failures: [] };
  const fail = (name, detail) => { results.ok = false; results.failures.push({ name, detail }); };

  // 2) "My music" handler reveals Apple Music/Spotify links.
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

  // 3) Start button transitions setup -> active screen.
  const startRes = await page.evaluate(() => {
    const btn = document.getElementById('startBtn');
    if (!btn) return { exists: false };
    btn.click();
    const active = document.getElementById('activeScreen');
    const setup = document.getElementById('setupScreen');
    return {
      exists: true,
      disabled: btn.disabled,
      activeShown: active ? !active.classList.contains('hidden') : null,
      setupHidden: setup ? setup.classList.contains('hidden') : null
    };
  });
  if (!startRes.exists) fail('start-exists', 'start button missing');
  else if (startRes.activeShown !== true) fail('start-transitions', JSON.stringify(startRes));

  results.dayOptionCount = await page.evaluate(() => document.getElementById('daySelect').options.length);
  if (results.dayOptionCount < 1) fail('day-dropdown', 'day dropdown not populated');

  results.summary = results.ok
    ? 'PASS: day dropdown populated, music hint works, Start transitions to active screen'
    : 'FAIL: ' + results.failures.map(f => `${f.name} (${f.detail})`).join('; ');

  if (!results.ok) {
    // Throw so the runner exits non-zero and this can gate a deploy.
    throw new Error('runner regression failed: ' + results.failures.map(f => f.name).join(', '));
  }
  return results;
}
