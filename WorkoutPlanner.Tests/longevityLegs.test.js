const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ll = require(path.join(__dirname, '..', 'WorkoutPlanner.Api', 'wwwroot', 'js', 'longevityLegs.js'));

test('patternLabel maps known patterns and passes through others', () => {
  assert.equal(ll.patternLabel('squat'), 'Squat');
  assert.equal(ll.patternLabel('hinge'), 'Hinge');
  assert.equal(ll.patternLabel('calf'), 'Calf raise');
  assert.equal(ll.patternLabel('lunge'), 'Lunge');
  assert.equal(ll.patternLabel('step-up'), 'Step-up');
  assert.equal(ll.patternLabel('unknown'), 'unknown');
  assert.equal(ll.patternLabel(''), '');
});

test('badgeHtml returns markup for each pattern and empty for none', () => {
  assert.ok(ll.badgeHtml({ longevityPattern: 'squat' }).includes('data-longevity-pattern="squat"'));
  assert.ok(ll.badgeHtml({ longevityPattern: 'squat' }).includes('Longevity · Squat'));
  assert.ok(ll.badgeHtml({ longevityPattern: 'hinge' }).includes('Longevity · Hinge'));
  assert.ok(ll.badgeHtml({ longevityPattern: 'calf' }).includes('Longevity · Calf raise'));
  assert.ok(ll.badgeHtml({ longevityPattern: 'lunge' }).includes('Longevity · Lunge'));
  assert.ok(ll.badgeHtml({ longevityPattern: 'step-up' }).includes('Longevity · Step-up'));
  assert.equal(ll.badgeHtml({}), '');
  assert.equal(ll.badgeHtml({ longevityPattern: '' }), '');
});

test('runnerCueHtml returns badge + exact cue for each known pattern', () => {
  const expectedCue = 'RIR 2: stop with ~2 good reps left';
  for (const p of ['squat', 'hinge', 'calf', 'lunge', 'step-up']) {
    const html = ll.runnerCueHtml({ longevityPattern: p });
    assert.ok(html.includes(`data-longevity-pattern="${p}"`), `${p}: badge pattern attribute`);
    assert.ok(html.includes('ll-runner'), `${p}: runner container`);
    assert.ok(html.includes('ll-runner-cue'), `${p}: cue paragraph`);
    assert.ok(html.includes(expectedCue), `${p}: exact cue text`);
  }
});

test('runnerCueHtml returns empty for non-longevity exercises and unknown patterns', () => {
  assert.equal(ll.runnerCueHtml({}), '');
  assert.equal(ll.runnerCueHtml(null), '');
  assert.equal(ll.runnerCueHtml({ longevityPattern: null }), '');
  assert.equal(ll.runnerCueHtml({ longevityPattern: 'bogus' }), '');
});

test('runnerCueHtml escapes a malicious pattern and never renders raw HTML', () => {
  const html = ll.runnerCueHtml({ longevityPattern: '<img>' });
  assert.ok(!html.includes('<img>'), 'raw img tag must not appear');
  assert.ok(!html.includes('<img'), 'raw img open tag must not appear');
});

test('regressionNoteHtml escapes HTML in the note', () => {
  const html = ll.regressionNoteHtml({ regressionNote: '<script>alert("x")</script> shoulder' }, ['shoulder']);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.equal(ll.regressionNoteHtml({}), '');
  assert.equal(ll.regressionNoteHtml({ regressionNote: '' }), '');
});

test('regressionNoteHtml returns empty when no selected injury matches', () => {
  const cuffReason = 'Chosen to keep load off the rotator cuff and shoulder (no weights hanging from the hands).';
  assert.equal(ll.regressionNoteHtml({ regressionNote: cuffReason }, []), '');
  assert.equal(ll.regressionNoteHtml({ regressionNote: cuffReason }, ['knee']), '');
  const equipmentReason = 'Bodyweight option chosen because the usual equipment isn\'t selected.';
  assert.equal(ll.regressionNoteHtml({ regressionNote: equipmentReason }, ['rotator-cuff']), '');
});

test('regressionNoteHtml renders when the selected injury matches', () => {
  const cuffReason = 'Chosen to keep load off the rotator cuff and shoulder (no weights hanging from the hands).';
  assert.ok(ll.regressionNoteHtml({ regressionNote: cuffReason }, ['rotator-cuff']).includes(cuffReason));
  const kneeReason = 'Chosen as a knee-friendlier option.';
  assert.ok(ll.regressionNoteHtml({ regressionNote: kneeReason }, ['knee']).includes(kneeReason));
});

test('summaryCardHtml returns empty when null or disabled', () => {
  assert.equal(ll.summaryCardHtml(null), '');
  assert.equal(ll.summaryCardHtml({ enabled: false }), '');
  assert.equal(ll.summaryCardHtml({}), '');
});

test('summaryCardHtml contains covered text, regressions, uncovered patterns, blurb and disclaimer', () => {
  const card = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 3,
    coveredSessionsPerWeek: [3, 3, 2],
    uncoveredPatternsByWeek: [[], [], ['lunge']],
    regressions: [
      { pattern: 'hinge', chosenId: 'banded-rdl', reason: 'Chosen to keep load off the rotator cuff and shoulder (no weights hanging from the hands).' }
    ],
    uncoveredPatterns: ['lunge'],
    blurb: 'Strong legs help you keep moving.',
    disclaimer: 'Not medical advice.'
  }, ['shoulder']);
  assert.ok(card.includes('id="longevitySummary"'));
  assert.ok(card.includes('Longevity Legs'));
  assert.ok(card.includes('Sessions covered per week (target 3): 3, 3, 2'));
  assert.ok(card.includes('Week 3: 2 of 3'));
  assert.ok(card.includes('Hinge'));
  assert.ok(card.includes('Banded Rdl'));
  assert.ok(card.includes('Adjusted for: shoulder'));
  assert.ok(card.includes('Chosen to keep load off the rotator cuff and shoulder'));
  assert.ok(!card.includes('Hinge</strong>: Banded Rdl —'));
  assert.ok(card.includes('Not covered in any week:'));
  assert.ok(card.includes('Lunge'));
  assert.ok(card.includes('Strong legs help you keep moving.'));
  assert.ok(card.includes('Not medical advice.'));
});

test('summaryCardHtml shows one adjusted line and one reason for repeated matching regressions', () => {
  const cuffReason = 'Chosen to keep load off the rotator cuff and shoulder (no weights hanging from the hands).';
  const card = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 2,
    coveredSessionsPerWeek: [2],
    regressions: [
      { pattern: 'squat', chosenId: 'bodyweight-box-squat', reason: cuffReason },
      { pattern: 'hinge', chosenId: 'hip-hinge-dowel', reason: cuffReason },
      { pattern: 'lunge', chosenId: 'bodyweight-reverse-lunge', reason: cuffReason }
    ],
    uncoveredPatterns: [],
    blurb: '',
    disclaimer: ''
  }, ['rotator-cuff']);
  const adjustedMatches = card.match(/Adjusted for:/g);
  assert.equal(adjustedMatches && adjustedMatches.length, 1);
  assert.ok(card.includes('Adjusted for: rotator cuff'));
  const reasonMatches = card.match(/ll-reason/g);
  assert.equal(reasonMatches && reasonMatches.length, 1);
  assert.ok(!card.includes('class="ll-regression"'));
  assert.ok(!card.match(/<li>.*<\/li>.*—/));
});

test('summaryCardHtml omits adjusted and reason elements when no injury is selected', () => {
  const cuffReason = 'Chosen to keep load off the rotator cuff and shoulder (no weights hanging from the hands).';
  const card = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 2,
    coveredSessionsPerWeek: [2],
    regressions: [
      { pattern: 'squat', chosenId: 'bodyweight-box-squat', reason: cuffReason }
    ],
    uncoveredPatterns: [],
    blurb: '',
    disclaimer: ''
  }, []);
  assert.ok(!card.includes('Adjusted for:'));
  assert.ok(!card.includes('ll-adjusted'));
  assert.ok(!card.includes('ll-reason'));
  assert.ok(!card.includes(cuffReason));
});

test('summaryCardHtml lists multiple matched injuries and distinct reasons in first-seen order', () => {
  const cuffReason = 'Chosen to keep load off the rotator cuff and shoulder (no weights hanging from the hands).';
  const kneeReason = 'Chosen as a knee-friendlier option.';
  const backReason = 'Chosen to keep load off the lower back.';
  const card = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 2,
    coveredSessionsPerWeek: [2],
    regressions: [
      { pattern: 'squat', chosenId: 'bodyweight-box-squat', reason: cuffReason },
      { pattern: 'lunge', chosenId: 'bodyweight-reverse-lunge', reason: kneeReason },
      { pattern: 'hinge', chosenId: 'hip-hinge-dowel', reason: backReason },
      { pattern: 'calf', chosenId: 'standing-calf-raise-bodyweight', reason: kneeReason }
    ],
    uncoveredPatterns: [],
    blurb: '',
    disclaimer: ''
  }, ['rotator-cuff', 'knee']);
  assert.ok(card.includes('Adjusted for: rotator cuff, knee'));
  assert.ok(card.indexOf(cuffReason) < card.indexOf(kneeReason));
  const reasonMatches = card.match(/ll-reason/g);
  assert.equal(reasonMatches && reasonMatches.length, 2);
  assert.ok(!card.includes(backReason));
});

test('allHiitHint appears when targetSessionsPerWeek is 0', () => {
  const card = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 0,
    coveredSessionsPerWeek: [0],
    regressions: [],
    uncoveredPatterns: ['squat', 'hinge', 'calf', 'lunge', 'step-up'],
    blurb: 'Blurb',
    disclaimer: 'Disclaimer'
  });
  assert.ok(card.includes('Switch Mix to hybrid to include Longevity Legs.'));
});

test('allHiitHint absent when targetSessionsPerWeek is greater than 0', () => {
  const card = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 2,
    coveredSessionsPerWeek: [2],
    regressions: [],
    uncoveredPatterns: [],
    blurb: 'Blurb',
    disclaimer: 'Disclaimer'
  });
  assert.ok(!card.includes('Switch Mix to hybrid'));
});

test('coveredText shows compact line when every week hits target', () => {
  assert.equal(ll.coveredText({ targetSessionsPerWeek: 3, coveredSessionsPerWeek: [3, 3, 3] }), 'Sessions covered per week: 3 of 3');
});

test('coveredText shows labelled list when any week is below target', () => {
  assert.equal(ll.coveredText({ targetSessionsPerWeek: 3, coveredSessionsPerWeek: [3, 3, 0, 3] }), 'Sessions covered per week (target 3): 3, 3, 0, 3');
});

test('coveredText falls back to 0 when no weeks given', () => {
  assert.equal(ll.coveredText({ targetSessionsPerWeek: 2 }), 'Sessions covered per week: 0 of 2');
  assert.equal(ll.coveredText(null), 'Sessions covered per week: 0 of 0');
});

test('shortfallHtml is empty when all weeks hit target', () => {
  const html = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 3,
    coveredSessionsPerWeek: [3, 3, 3, 3],
    uncoveredPatternsByWeek: [[], [], [], []],
    regressions: [],
    uncoveredPatterns: [],
    blurb: '',
    disclaimer: ''
  });
  assert.ok(!html.includes('ll-shortfall'));
  assert.ok(!html.includes('Week '));
});

test('shortfallHtml lists each week below target with missed patterns', () => {
  const html = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 3,
    coveredSessionsPerWeek: [3, 3, 0, 3],
    uncoveredPatternsByWeek: [
      [],
      [],
      ['squat', 'hinge', 'calf', 'lunge', 'step-up'],
      []
    ],
    regressions: [],
    uncoveredPatterns: ['step-up'],
    blurb: '',
    disclaimer: ''
  });
  const shortfalls = html.match(/class="ll-shortfall"/g);
  assert.equal(shortfalls && shortfalls.length, 1);
  assert.ok(html.includes('Week 3: 0 of 3'));
  assert.ok(html.includes('missed: Squat, Hinge, Calf raise, Lunge, Step-up'));
});

test('uncovered patterns label only appears when non-empty', () => {
  const empty = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 3,
    coveredSessionsPerWeek: [3, 3, 3, 3],
    uncoveredPatternsByWeek: [[], [], [], []],
    regressions: [],
    uncoveredPatterns: [],
    blurb: '',
    disclaimer: ''
  });
  assert.ok(!empty.includes('Not covered'));
  assert.ok(!empty.includes('ll-uncovered'));

  const nonEmpty = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 3,
    coveredSessionsPerWeek: [3, 3, 3, 3],
    uncoveredPatternsByWeek: [[], [], [], []],
    regressions: [],
    uncoveredPatterns: ['step-up'],
    blurb: '',
    disclaimer: ''
  });
  assert.ok(nonEmpty.includes('Not covered in any week:'));
  assert.ok(nonEmpty.includes('Step-up'));
});

test('regression heading appears only when there are regressions', () => {
  const noRegressions = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 3,
    coveredSessionsPerWeek: [3, 3, 3, 3],
    uncoveredPatternsByWeek: [[], [], [], []],
    regressions: [],
    uncoveredPatterns: [],
    blurb: '',
    disclaimer: ''
  });
  assert.ok(!noRegressions.includes('Swapped for your needs'));
  assert.ok(!noRegressions.includes('ll-swaps-heading'));

  const withRegressions = ll.summaryCardHtml({
    enabled: true,
    targetSessionsPerWeek: 3,
    coveredSessionsPerWeek: [3, 3, 3, 3],
    uncoveredPatternsByWeek: [[], [], [], []],
    regressions: [{ pattern: 'hinge', chosenId: 'banded-rdl', reason: 'Shoulder' }],
    uncoveredPatterns: [],
    blurb: '',
    disclaimer: ''
  });
  assert.ok(withRegressions.includes('Swapped for your needs'));
  assert.ok(withRegressions.includes('ll-swaps-heading'));
});

test('injury helpers map reasons, restrictions and labels correctly', () => {
  assert.deepEqual(ll.injuryTagsForReason('rotator cuff'), ['rotator-cuff', 'shoulder']);
  assert.deepEqual(ll.injuryTagsForReason('shoulder pain'), ['rotator-cuff', 'shoulder']);
  assert.deepEqual(ll.injuryTagsForReason('knee-friendlier'), ['knee', 'patellar']);
  assert.deepEqual(ll.injuryTagsForReason('lower back'), ['lower-back']);
  assert.deepEqual(ll.injuryTagsForReason('equipment'), []);

  assert.deepEqual(ll.matchedInjuries('rotator cuff', ['KNEE', 'Rotator-Cuff']), ['Rotator-Cuff']);
  assert.deepEqual(ll.matchedInjuries('knee', ['shoulder', 'knee']), ['knee']);
  assert.deepEqual(ll.matchedInjuries('lower back', []), []);

  assert.equal(ll.injuryLabel('rotator-cuff'), 'rotator cuff');
  assert.equal(ll.injuryLabel('shoulder'), 'shoulder');
  assert.equal(ll.injuryLabel('knee'), 'knee');
  assert.equal(ll.injuryLabel('patellar'), 'patellar tendon');
  assert.equal(ll.injuryLabel('lower-back'), 'lower back');
  assert.equal(ll.injuryLabel('hip-flexor'), 'hip flexor');
});
