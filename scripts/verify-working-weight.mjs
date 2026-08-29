// Browser check: privacy page + runner working-weight fields.
export default async function run(page, ui) {
  const privacy = await page.goto('http://localhost:5198/privacy', { waitUntil: 'domcontentloaded' });
  if (!privacy || !privacy.ok()) {
    throw new Error(`GET /privacy failed: ${privacy && privacy.status()}`);
  }
  const privacyText = await page.locator('body').innerText();
  for (const needle of ['Privacy policy', 'WorkOut.fit', 'Plan4Strength', 'Strava', 'Render', 'Feedback']) {
    if (!privacyText.includes(needle)) {
      throw new Error(`Privacy page missing "${needle}"`);
    }
  }
  const privacyLinkOnIndex = await page.goto('http://localhost:5198/', { waitUntil: 'domcontentloaded' });
  if (!privacyLinkOnIndex || !privacyLinkOnIndex.ok()) {
    throw new Error('GET / failed');
  }
  const headerPrivacy = await page.locator('a[href="/privacy"]').count();
  if (headerPrivacy < 1) {
    throw new Error('Planner header is missing a Privacy link');
  }

  const FIXTURE = {
    generatedAt: '2026-08-28T00:00:00Z',
    criteria: { includeWarmup: false, includeCooldown: false, weeks: 1, goal: 'strength' },
    plan: [
      {
        week: 1,
        days: [
          {
            day: 'Monday', dayIndex: 0, type: 'workout', focus: 'Mix', sessionStyle: 'strength',
            exercises: [
              { id: 'wu-arm-circles', name: 'Arm Circles', sets: 1, repsDisplay: '30s', phase: 'warmup', workDuration: 20, rest: 10, primary: ['shoulders'], equipment: ['bodyweight'] },
              { id: 'goblet-squat', name: 'Goblet Squat', sets: 2, repsDisplay: '8-12', phase: 'work', workDuration: 30, rest: 45, primary: ['quadriceps'] },
              { id: 'push-up', name: 'Push-Up', sets: 2, repsDisplay: '8-12', phase: 'work', workDuration: 30, rest: 45, primary: ['chest'] },
              { id: 'plank', name: 'Plank', sets: 1, repsDisplay: '45s', phase: 'work', workDuration: 45, rest: 30, primary: ['core'] }
            ]
          }
        ]
      }
    ]
  };

  await page.addInitScript((plan) => {
    localStorage.setItem('workoutPlan', JSON.stringify(plan));
    localStorage.setItem('workoutWeightUnit', 'kg');
  }, FIXTURE);

  await page.goto('http://localhost:5198/workout.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const s = document.getElementById('daySelect');
    return s && s.options.length > 0;
  }, null, { timeout: 8000 });

  await page.waitForFunction(() => {
    const moves = document.getElementById('previewMoves');
    return moves && moves.querySelectorAll('[data-working-weight-index]').length >= 1;
  }, null, { timeout: 8000 });

  const fields = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('[data-working-weight-index]')];
    const labels = inputs.map(el => {
      const row = el.closest('div')?.previousElementSibling || el.closest('div');
      return {
        index: el.getAttribute('data-working-weight-index'),
        aria: el.getAttribute('aria-label') || '',
        id: el.id
      };
    });
    const preview = document.getElementById('previewMoves')?.innerText || '';
    return {
      count: inputs.length,
      labels,
      preview,
      startEnabled: !document.getElementById('startBtn')?.disabled
    };
  });

  if (fields.count !== 1) {
    throw new Error(`Expected 1 weight field (goblet squat only), got ${fields.count}: ${JSON.stringify(fields.labels)}`);
  }
  if (!/goblet squat/i.test(fields.labels[0].aria)) {
    throw new Error(`Weight field is not on Goblet Squat: ${fields.labels[0].aria}`);
  }
  if (!/Push-Up/i.test(fields.preview) || !/Plank/i.test(fields.preview) || !/Arm Circles/i.test(fields.preview)) {
    throw new Error('Preview is missing expected moves: ' + fields.preview);
  }
  if (/Weight/.test(fields.preview) === false) {
    throw new Error('Preview does not mention Weight');
  }

  await page.evaluate(() => {
    const input = document.getElementById('workingWeight-1');
    if (input) {
      input.value = '24.5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const btn = document.getElementById('startBtn');
    if (btn) btn.click();
  });
  await page.waitForFunction(
    () => document.getElementById('activeScreen')?.classList.contains('active'),
    { timeout: 8000 }
  );

  const started = await page.evaluate(() => {
    const name = document.getElementById('exerciseName')?.textContent || '';
    const meta = document.getElementById('exerciseMeta')?.textContent || '';
    return { name, meta, phase: document.body.classList.contains('work-phase') };
  });

  if (!started.phase) {
    throw new Error('Start was blocked or did not enter work phase');
  }

  return {
    privacyOk: true,
    weightFields: fields.count,
    weightOn: fields.labels[0].aria,
    startUnblocked: true,
    firstMove: started.name
  };
}
