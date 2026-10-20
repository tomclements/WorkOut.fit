/**
 * DOM-free Longevity Legs render helpers. Used by app.js and node:test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LongevityLegs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(value) {
    if (value == null) return '';
    const s = String(value);
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return s.replace(/[&<>"']/g, function (c) { return map[c]; });
  }

  const PATTERN_LABELS = {
    squat: 'Squat',
    hinge: 'Hinge',
    calf: 'Calf raise',
    lunge: 'Lunge',
    'step-up': 'Step-up'
  };

  function patternLabel(p) {
    return PATTERN_LABELS[p] || p || '';
  }

  function badgeHtml(ex) {
    if (!ex || !ex.longevityPattern) return '';
    const p = ex.longevityPattern;
    const label = patternLabel(p);
    if (!label) return '';
    return `<span class="ll-badge" data-longevity-pattern="${escapeHtml(p)}">Longevity · ${escapeHtml(label)}</span>`;
  }

  function injuryTagsForReason(reason) {
    const r = String(reason || '').toLowerCase();
    if (r.includes('rotator cuff') || r.includes('shoulder')) return ['rotator-cuff', 'shoulder'];
    if (r.includes('knee')) return ['knee', 'patellar'];
    if (r.includes('lower back')) return ['lower-back'];
    return [];
  }

  function matchedInjuries(reason, restrictions) {
    const tags = injuryTagsForReason(reason);
    const selected = Array.isArray(restrictions) ? restrictions : [];
    return selected.filter(s => tags.some(t => t.toLowerCase() === String(s).toLowerCase()));
  }

  function injuryLabel(tag) {
    const map = {
      'rotator-cuff': 'rotator cuff',
      'shoulder': 'shoulder',
      'knee': 'knee',
      'patellar': 'patellar tendon',
      'lower-back': 'lower back'
    };
    return map[tag] || String(tag).replace(/-/g, ' ');
  }

  function regressionNoteHtml(ex, restrictions) {
    if (!ex || !ex.regressionNote) return '';
    const selected = Array.isArray(restrictions) ? restrictions : [];
    if (matchedInjuries(ex.regressionNote, selected).length === 0) return '';
    return `<p class="ll-regression">${escapeHtml(ex.regressionNote)}</p>`;
  }

  function allHiitHint(ll) {
    if (!ll || ll.targetSessionsPerWeek !== 0) return '';
    return '<p class="ll-hiit-hint">Switch Mix to hybrid to include Longevity Legs.</p>';
  }

  function coveredText(ll) {
    if (!ll) return 'Sessions covered per week: 0 of 0';
    const target = ll.targetSessionsPerWeek || 0;
    const weeks = Array.isArray(ll.coveredSessionsPerWeek) ? ll.coveredSessionsPerWeek : [];
    if (weeks.length === 0) return `Sessions covered per week: 0 of ${target}`;
    const allAtTarget = weeks.every(w => w === target);
    if (allAtTarget) return `Sessions covered per week: ${target} of ${target}`;
    return `Sessions covered per week (target ${target}): ${weeks.join(', ')}`;
  }

  function shortfallHtml(ll) {
    if (!ll) return '';
    const target = ll.targetSessionsPerWeek || 0;
    const weeks = Array.isArray(ll.coveredSessionsPerWeek) ? ll.coveredSessionsPerWeek : [];
    const byWeek = Array.isArray(ll.uncoveredPatternsByWeek) ? ll.uncoveredPatternsByWeek : [];
    const lines = [];
    for (let i = 0; i < weeks.length; i++) {
      const covered = weeks[i];
      if (covered >= target) continue;
      const missed = byWeek[i] && byWeek[i].length
        ? ' (missed: ' + byWeek[i].map(p => patternLabel(p)).join(', ') + ')'
        : '';
      lines.push(`<p class="ll-shortfall">Week ${i + 1}: ${covered} of ${target}${missed}</p>`);
    }
    return lines.join('');
  }

  function humanizeId(id) {
    if (!id) return '';
    return String(id)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function summaryCardHtml(longevityLegs, restrictions) {
    if (!longevityLegs || !longevityLegs.enabled) return '';

    const selected = Array.isArray(restrictions) ? restrictions : [];
    const covered = escapeHtml(coveredText(longevityLegs));
    const shortfall = shortfallHtml(longevityLegs);
    const hiitHint = allHiitHint(longevityLegs);

    const regressions = Array.isArray(longevityLegs.regressions) ? longevityLegs.regressions : [];
    const regressionReasons = [];
    const adjustedLabels = [];
    const seenLabels = new Set();
    const seenReasons = new Set();

    const selectedLower = selected.map(s => String(s).toLowerCase());

    const regressionsHtml = regressions.length
      ? '<p class="ll-swaps-heading">Swapped for your needs</p><ul class="ll-regressions-list">' + regressions.map(r => {
          const label = escapeHtml(patternLabel(r && r.pattern));
          const chosen = escapeHtml(humanizeId(r && r.chosenId));
          const tags = injuryTagsForReason(r && r.reason);
          const matched = tags.filter(t => selectedLower.includes(String(t).toLowerCase()));
          if (matched.length) {
            matched.forEach(tag => {
              const lab = injuryLabel(tag);
              if (!seenLabels.has(lab)) {
                seenLabels.add(lab);
                adjustedLabels.push(lab);
              }
            });
            const reasonText = String(r.reason);
            if (!seenReasons.has(reasonText)) {
              seenReasons.add(reasonText);
              regressionReasons.push(escapeHtml(reasonText));
            }
          }
          return `<li><strong>${label}</strong>: ${chosen}</li>`;
        }).join('') + '</ul>'
      : '';

    const adjustedHtml = adjustedLabels.length
      ? `<p class="ll-adjusted">Adjusted for: ${adjustedLabels.join(', ')}</p>`
      : '';
    const reasonsHtml = regressionReasons.length
      ? regressionReasons.map(r => `<p class="ll-reason">${r}</p>`).join('')
      : '';

    const uncovered = Array.isArray(longevityLegs.uncoveredPatterns) ? longevityLegs.uncoveredPatterns : [];
    const uncoveredHtml = uncovered.length
      ? '<p class="ll-uncovered"><strong>Not covered in any week:</strong> ' + uncovered.map(p => escapeHtml(patternLabel(p))).join(', ') + '</p>'
      : '';

    const blurb = longevityLegs.blurb ? `<p class="ll-blurb">${escapeHtml(longevityLegs.blurb)}</p>` : '';
    const disclaimer = longevityLegs.disclaimer ? `<p class="ll-disclaimer">${escapeHtml(longevityLegs.disclaimer)}</p>` : '';

    return `
<section id="longevitySummary" class="ll-card">
  <h3 class="ll-card-heading">Longevity Legs</h3>
  <p class="ll-covered">${covered}</p>
  ${shortfall}
  ${hiitHint}
  ${regressionsHtml}
  ${adjustedHtml}
  ${reasonsHtml}
  ${uncoveredHtml}
  ${blurb}
  ${disclaimer}
</section>`;
  }

  return {
    patternLabel,
    badgeHtml,
    regressionNoteHtml,
    summaryCardHtml,
    coveredText,
    allHiitHint,
    injuryTagsForReason,
    matchedInjuries,
    injuryLabel
  };
});
