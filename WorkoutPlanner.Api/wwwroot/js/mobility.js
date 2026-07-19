/**
 * Muscle-aware warm-up / cool-down helpers.
 * Used when a plan was generated before mobility existed, or server omitted it.
 */
(function (global) {
  const NORM = {
    chest: 'chest', pectorals: 'chest',
    triceps: 'triceps',
    shoulders: 'shoulders', delts: 'shoulders', deltoids: 'shoulders', 'rear-shoulders': 'shoulders',
    lats: 'back', 'middle back': 'back', 'lower back': 'back', traps: 'back', back: 'back',
    biceps: 'biceps', forearms: 'forearms',
    quadriceps: 'quads', quads: 'quads', legs: 'quads',
    hamstrings: 'hamstrings', glutes: 'glutes', calves: 'calves',
    adductors: 'hips', abductors: 'hips', 'hip-flexors': 'hips', hips: 'hips',
    abdominals: 'core', core: 'core', obliques: 'core', neck: 'neck'
  };

  const CATALOG = [
    { id: 'wu-march', name: 'March in place', phase: 'warmup', role: 'general', targets: [], duration: 40, cue: 'Light pace, swing arms, raise heart rate gently' },
    { id: 'wu-jacks', name: 'Jumping jacks', phase: 'warmup', role: 'general', targets: [], duration: 40, cue: 'Soft landings; step-jacks if needed' },
    { id: 'wu-arm-circles', name: 'Arm circles', phase: 'warmup', role: 'activate', targets: ['shoulders', 'chest', 'back'], duration: 35, cue: 'Small to large circles, both directions' },
    { id: 'wu-scap-pushup', name: 'Scapular push-ups', phase: 'warmup', role: 'activate', targets: ['chest', 'shoulders', 'triceps'], duration: 35, cue: 'Plank or knees: spread then squeeze shoulder blades' },
    { id: 'wu-cat-cow', name: 'Cat–cow', phase: 'warmup', role: 'activate', targets: ['back', 'core'], duration: 40, cue: 'On all fours, slow spinal flexion/extension' },
    { id: 'wu-bird-dog', name: 'Bird dog', phase: 'warmup', role: 'activate', targets: ['back', 'core', 'glutes'], duration: 40, cue: 'Opposite arm/leg, brace midsection' },
    { id: 'wu-dead-bug', name: 'Dead bug', phase: 'warmup', role: 'activate', targets: ['core'], duration: 40, cue: 'Low back pressed to floor; slow opposite limbs' },
    { id: 'wu-hip-circles', name: 'Standing hip circles', phase: 'warmup', role: 'activate', targets: ['hips', 'glutes', 'quads', 'hamstrings'], duration: 35, cue: 'Hands on hips, slow circles each way' },
    { id: 'wu-leg-swings', name: 'Leg swings', phase: 'warmup', role: 'activate', targets: ['hamstrings', 'hips', 'quads', 'glutes'], duration: 35, cue: 'Front-to-back then side-to-side' },
    { id: 'wu-bw-squat', name: 'Bodyweight squat (easy)', phase: 'warmup', role: 'activate', targets: ['quads', 'glutes', 'hamstrings'], duration: 40, cue: 'Easy depth, no load' },
    { id: 'wu-glute-bridge', name: 'Glute bridge', phase: 'warmup', role: 'activate', targets: ['glutes', 'hamstrings', 'core'], duration: 35, cue: 'Squeeze glutes at top' },
    { id: 'wu-shoulder-rolls', name: 'Shoulder rolls', phase: 'warmup', role: 'activate', targets: ['shoulders', 'back', 'neck'], duration: 30, cue: 'Slow forward and back' },
    { id: 'wu-wrist-circles', name: 'Wrist circles', phase: 'warmup', role: 'activate', targets: ['forearms', 'biceps', 'triceps'], duration: 30, cue: 'Prep elbows and wrists' },
    { id: 'cd-chest-door', name: 'Chest doorway stretch', phase: 'cooldown', role: 'stretch', targets: ['chest', 'shoulders'], duration: 40, cue: 'Elbow at 90°, lean gently' },
    { id: 'cd-cross-body', name: 'Cross-body shoulder stretch', phase: 'cooldown', role: 'stretch', targets: ['shoulders', 'back'], duration: 35, cue: 'Arm across chest' },
    { id: 'cd-child-pose', name: "Child's pose", phase: 'cooldown', role: 'stretch', targets: ['back', 'shoulders', 'hips'], duration: 45, cue: 'Hips to heels, arms reach forward' },
    { id: 'cd-quad-stand', name: 'Standing quad stretch', phase: 'cooldown', role: 'stretch', targets: ['quads', 'hips'], duration: 40, cue: 'Hold ankle, tall posture' },
    { id: 'cd-ham-hinge', name: 'Standing hamstring hinge', phase: 'cooldown', role: 'stretch', targets: ['hamstrings', 'back'], duration: 40, cue: 'Soft knees, hinge at hips' },
    { id: 'cd-fig4', name: 'Figure-4 glute stretch', phase: 'cooldown', role: 'stretch', targets: ['glutes', 'hips'], duration: 40, cue: 'Ankle on opposite knee' },
    { id: 'cd-hip-flexor', name: 'Half-kneeling hip flexor stretch', phase: 'cooldown', role: 'stretch', targets: ['hips', 'quads'], duration: 40, cue: 'Tuck pelvis, gentle forward shift' },
    { id: 'cd-knees-chest', name: 'Knees to chest', phase: 'cooldown', role: 'stretch', targets: ['core', 'back', 'glutes'], duration: 40, cue: 'Supine hug knees' },
    { id: 'cd-forearm-stretch', name: 'Forearm stretch', phase: 'cooldown', role: 'stretch', targets: ['forearms', 'biceps'], duration: 30, cue: 'Gentle palm up then palm down' },
    { id: 'cd-breathe', name: 'Box breathing (easy)', phase: 'cooldown', role: 'stretch', targets: [], duration: 40, cue: 'In 4 · hold 4 · out 4 · hold 4' }
  ];

  function normalizeMuscle(m) {
    if (!m) return null;
    const key = String(m).trim().toLowerCase();
    return NORM[key] || key;
  }

  function rankMuscles(exercises) {
    const counts = {};
    (exercises || []).forEach(ex => {
      (ex.primary || []).forEach(p => {
        const n = normalizeMuscle(p);
        if (!n) return;
        counts[n] = (counts[n] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k]) => k);
  }

  function scoreTargets(targets, ranked) {
    if (!targets || !targets.length) return 0;
    let score = 0;
    ranked.forEach((m, i) => {
      if (targets.some(t => t === m)) score += Math.max(1, 10 - i);
    });
    return score;
  }

  function toPlanExercise(m) {
    return {
      id: m.id,
      name: m.name,
      slot: m.phase,
      phase: m.phase,
      sets: 1,
      repsDisplay: `${m.duration}s`,
      rest: 10,
      workDuration: m.duration,
      isTimeBased: true,
      primary: m.targets && m.targets.length ? m.targets.slice() : ['full body'],
      progression: m.cue,
      demoUrl: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(m.name + ' exercise mobility'),
      imageUrl: null
    };
  }

  function pickWarmup(ranked) {
    const picks = [];
    const used = new Set();
    const generals = CATALOG.filter(m => m.phase === 'warmup' && m.role === 'general');
    if (generals.length) {
      const g = generals[Math.floor(Math.random() * generals.length)];
      picks.push(g);
      used.add(g.id);
    }
    const acts = CATALOG
      .filter(m => m.phase === 'warmup' && m.role === 'activate')
      .sort((a, b) => scoreTargets(b.targets, ranked) - scoreTargets(a.targets, ranked));
    for (const m of acts) {
      if (picks.length >= 4) break;
      if (used.has(m.id)) continue;
      if (m.targets.length && scoreTargets(m.targets, ranked) <= 0 && ranked.length) continue;
      picks.push(m);
      used.add(m.id);
    }
    if (picks.length < 3) {
      for (const m of acts) {
        if (picks.length >= 3) break;
        if (used.has(m.id)) continue;
        picks.push(m);
        used.add(m.id);
      }
    }
    return picks.map(toPlanExercise);
  }

  function pickCooldown(ranked) {
    const picks = [];
    const used = new Set();
    const stretches = CATALOG
      .filter(m => m.phase === 'cooldown' && m.role === 'stretch')
      .sort((a, b) => scoreTargets(b.targets, ranked) - scoreTargets(a.targets, ranked));
    for (const m of stretches) {
      if (picks.length >= 3) break;
      if (used.has(m.id)) continue;
      if (m.targets.length && scoreTargets(m.targets, ranked) <= 0 && ranked.length) continue;
      picks.push(m);
      used.add(m.id);
    }
    const breathe = CATALOG.find(m => m.id === 'cd-breathe');
    if (breathe && !used.has(breathe.id) && picks.length < 3) picks.push(breathe);
    if (!picks.length) {
      stretches.slice(0, 2).forEach(m => picks.push(m));
    }
    return picks.map(toPlanExercise);
  }

  function phaseOf(ex) {
    return String(ex?.phase || 'work').toLowerCase();
  }

  function splitByPhase(exercises) {
    const warm = [];
    const work = [];
    const cool = [];
    (exercises || []).forEach(ex => {
      const p = phaseOf(ex);
      if (p === 'warmup') warm.push(ex);
      else if (p === 'cooldown') cool.push(ex);
      else work.push(ex);
    });
    return { warm, work, cool };
  }

  /**
   * Ensure a day has warm-up / cool-down when criteria request them.
   * Mutates day.exercises; returns true if anything was added.
   */
  function ensureDayMobility(day, criteria) {
    if (!day || day.type !== 'workout' || !Array.isArray(day.exercises)) return false;
    const wantWarm = criteria?.includeWarmup !== false;
    const wantCool = criteria?.includeCooldown !== false;
    if (!wantWarm && !wantCool) return false;

    const { warm, work, cool } = splitByPhase(day.exercises);
    if (!work.length) return false;

    const ranked = rankMuscles(work);
    let changed = false;
    let nextWarm = warm;
    let nextCool = cool;

    if (wantWarm && !warm.length) {
      nextWarm = pickWarmup(ranked);
      changed = true;
    }
    if (wantCool && !cool.length) {
      nextCool = pickCooldown(ranked);
      changed = true;
    }

    if (changed) {
      day.exercises = [...nextWarm, ...work, ...nextCool];
      // rough re-estimate
      const secs = day.exercises.reduce((s, ex) => {
        const sets = Math.max(1, ex.sets || 1);
        return s + sets * ((ex.workDuration || 30) + (ex.rest || 0)) + 15;
      }, 0);
      day.estimatedMinutes = Math.max(1, Math.round(secs / 60));
    }
    return changed;
  }

  /** Walk a full plan response and inject missing mobility. Returns whether anything changed. */
  function ensurePlanMobility(plan) {
    if (!plan || !Array.isArray(plan.plan)) return false;
    const criteria = plan.criteria || {};
    let changed = false;
    plan.plan.forEach(week => {
      (week.days || []).forEach(day => {
        if (ensureDayMobility(day, criteria)) changed = true;
      });
    });
    return changed;
  }

  function dayMobilitySummary(day) {
    const { warm, work, cool } = splitByPhase(day?.exercises);
    const parts = [];
    if (warm.length) parts.push(`${warm.length} warm-up`);
    if (work.length) parts.push(`${work.length} work`);
    if (cool.length) parts.push(`${cool.length} cool-down`);
    return parts.join(' · ') || 'No exercises';
  }

  global.WorkoutMobility = {
    ensurePlanMobility,
    ensureDayMobility,
    dayMobilitySummary,
    splitByPhase,
    phaseOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
