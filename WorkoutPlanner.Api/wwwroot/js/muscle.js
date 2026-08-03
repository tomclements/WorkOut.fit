/* Anatomical front/back figures rendered as inline SVG.
 * Worked muscle groups are highlighted red, secondary (light) in pink.
 * sessionExercises[].primary/.secondary carry catalog muscle names such as
 * chest, shoulders, rear-shoulders, lats, …; mapped below to SVG regions.
 */
(function () {
  'use strict';

  var MUSCLE_TO_REGIONS = {
    chest: ['front-chest'],
    shoulders: ['front-shoulders', 'back-rearshoulders'],
    'rear-shoulders': ['back-rearshoulders', 'back-rearshoulders-r'],
    traps: ['back-traps'],
    lats: ['back-lats', 'back-lats-r'],
    'middle back': ['back-middle'],
    'lower back': ['back-lower'],
    back: ['back-lats', 'back-lats-r', 'back-middle', 'back-lower'],
    biceps: ['front-biceps', 'front-biceps-r', 'back-biceps', 'back-biceps-r'],
    triceps: ['back-triceps', 'back-triceps-r'],
    forearms: ['front-forearms', 'front-forearms-r', 'back-forearms', 'back-forearms-r'],
    abdominals: ['front-abs'],
    core: ['front-abs'],
    obliques: ['front-obliques', 'front-obliques-r'],
    'hip-flexors': ['front-hipflexors'],
    quadriceps: ['front-quads', 'front-quads-r'],
    adductors: ['front-adductors', 'front-adductors-r'],
    abductors: ['front-abductors', 'front-abductors-r'],
    hamstrings: ['back-hamstrings', 'back-hamstrings-r'],
    glutes: ['back-glutes', 'back-glutes-r'],
    calves: ['front-calves', 'front-calves-r', 'back-calves', 'back-calves-r'],
    grip: ['front-forearms', 'back-forearms']
  };

  // A standing human silhouette; muscle regions sit on top.
  var FRONT_BODY = [
    'M100 8a16 16 0 1 0 0 32a16 16 0 0 0 0-32Z',              // head
    'M92 40h16l3 15H89Z',                                      // neck
    'M62 52h76v34H62Z',                                        // shoulders/yoke
    'M78 72h44v48H78Z',                                        // torso
    'M78 120h6v16H74Z',                                        // left hip
    'M120 120h6v16Z',                                          // right hip
    'M72 138h24l-4 20h-16l-18 16v22c12 6 20 8 28 10V340l-22 40h-4c-12-2-20-10-20-22l6-120Z',
    'M104 138h24l18 16v22l-6 120c0 12-8 20-20 22h-4l-22-40V248c8-2 16-4 28-10V138Z'
  ].join(' ');

  var BACK_BODY = [
    'M100 8a16 16 0 1 0 0 32a16 16 0 0 0 0-32Z',
    'M92 14h16l3 15h-22Z',
    'M62 70h76v14H62Z',
    'M78 92h44v48H78Z',
    'M74 138h20v34h-16l-18 16v-22l16-6v-22Z',
    'M106 138h20v34l16 6v22l-18-16h-16Z'
  ].join(' ');

  var FRONT = [
    { id: 'front-neck', x: 89, y: 40, w: 22, h: 16 },
    { id: 'front-shoulders', x: 60, y: 50, w: 78, h: 26 },
    { id: 'front-chest', x: 80, y: 68, w: 40, h: 42 },
    { id: 'front-abs', x: 87, y: 108, w: 26, h: 58 },
    { id: 'front-obliques', x: 62, y: 108, w: 22, h: 58 },
    { id: 'front-obliques-r', x: 116, y: 108, w: 22, h: 58 },
    { id: 'front-hipflexors', x: 87, y: 168, w: 26, h: 22 },
    { id: 'front-biceps', x: 53, y: 78, w: 20, h: 40 },
    { id: 'front-biceps-r', x: 127, y: 78, w: 20, h: 40 },
    { id: 'front-forearms', x: 46, y: 120, w: 16, h: 44 },
    { id: 'front-forearms-r', x: 138, y: 120, w: 16, h: 44 },
    { id: 'front-quads', x: 70, y: 196, w: 30, h: 98 },
    { id: 'front-quads-r', x: 100, y: 196, w: 30, h: 98 },
    { id: 'front-adductors', x: 86, y: 200, w: 13, h: 92 },
    { id: 'front-adductors-r', x: 101, y: 200, w: 13, h: 92 },
    { id: 'front-abductors', x: 62, y: 198, w: 12, h: 92 },
    { id: 'front-abductors-r', x: 126, y: 198, w: 12, h: 92 },
    { id: 'front-calves', x: 77, y: 296, w: 22, h: 54 },
    { id: 'front-calves-r', x: 101, y: 296, w: 22, h: 54 }
  ];

  var BACK = [
    { id: 'back-neck', x: 89, y: 40, w: 22, h: 16 },
    { id: 'back-traps', x: 63, y: 50, w: 74, h: 28 },
    { id: 'back-rearshoulders', x: 62, y: 60, w: 24, h: 28 },
    { id: 'back-rearshoulders-r', x: 114, y: 60, w: 24, h: 28 },
    { id: 'back-lats', x: 79, y: 80, w: 18, h: 62 },
    { id: 'back-lats-r', x: 103, y: 80, w: 18, h: 62 },
    { id: 'back-middle', x: 90, y: 86, w: 20, h: 42 },
    { id: 'back-lower', x: 90, y: 130, w: 20, h: 40 },
    { id: 'back-biceps', x: 53, y: 78, w: 20, h: 40 },
    { id: 'back-biceps-r', x: 127, y: 78, w: 20, h: 40 },
    { id: 'back-triceps', x: 53, y: 120, w: 16, h: 44 },
    { id: 'back-triceps-r', x: 131, y: 120, w: 16, h: 44 },
    { id: 'back-forearms', x: 46, y: 166, w: 16, h: 44 },
    { id: 'back-forearms-r', x: 138, y: 166, w: 16, h: 44 },
    { id: 'back-glutes', x: 72, y: 196, w: 28, h: 36 },
    { id: 'back-glutes-r', x: 100, y: 196, w: 28, h: 36 },
    { id: 'back-hamstrings', x: 72, y: 234, w: 28, h: 88 },
    { id: 'back-hamstrings-r', x: 100, y: 234, w: 28, h: 88 },
    { id: 'back-calves', x: 78, y: 324, w: 22, h: 50 },
    { id: 'back-calves-r', x: 100, y: 324, w: 22, h: 50 }
  ];

  function roundedRect(m) {
    var x = m.x, y = m.y, w = m.w, h = m.h;
    var rx = Math.min(5, w / 2);
    return 'M' + (x + rx) + ' ' + y +
      'L' + (x + w - rx) + ' ' + y +
      'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + rx) +
      'L' + (x + w) + ' ' + (y + h - rx) +
      'Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - rx) + ' ' + (y + h) +
      'L' + (x + rx) + ' ' + (y + h) +
      'Q' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - rx) +
      'L' + x + ' ' + (y + rx) +
      'Q' + x + ' ' + y + ' ' + (x + rx) + ' ' + y + 'Z';
  }

  function figureHtml(left, right) {
    return '<div class="muscle-pair">' + left + right + '</div>';
  }

  function render(primary, secondary) {
    primary = primary || [];
    secondary = secondary || [];
    var worked = {};
    var light = {};

    primary.forEach(function (name) {
      (MUSCLE_TO_REGIONS[name] || []).forEach(function (id) { worked[id] = true; });
    });
    secondary.forEach(function (name) {
      (MUSCLE_TO_REGIONS[name] || []).forEach(function (id) {
        if (!worked[id]) light[id] = true;
      });
    });

    var frontSvg = '<svg class="muscle-figure" viewBox="0 0 200 460" role="img" aria-label="Front muscles">' +
      '<path class="body" d="' + FRONT_BODY + '"/>' +
      FRONT.map(function (m) {
        var cls = 'muscle' + (worked[m.id] ? ' worked' : light[m.id] ? ' secondary' : '');
        return '<path class="' + cls + '" d="' + roundedRect(m) + '"/>';
      }).join('') +
      '</svg>';

    var backSvg = '<svg class="muscle-figure" viewBox="0 0 200 460" role="img" aria-label="Back view">' +
      '<path class="body" d="' + BACK_BODY + '"/>' +
      BACK.map(function (m) {
        var cls = 'muscle' + (worked[m.id] ? ' worked' : light[m.id] ? ' secondary' : '');
        return '<path class="' + cls + '" d="' + roundedRect(m) + '"/>';
      }).join('') +
      '</svg>';

    return figureHtml(frontSvg, backSvg);
  }

  window.MuscleDiagram = {
    render: render
  };
})();