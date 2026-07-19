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

  // FEDB folder for still flip fallback (must match free-exercise-db paths)
  const FEDB = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
  const SOURCE_FOLDERS = {
    'step-up-with-knee-raise': 'Step-up_with_Knee_Raise',
    'star-jump': 'Star_Jump',
    'knee-tuck-jump': 'Knee_Tuck_Jump',
    'around-the-worlds': 'Around_The_Worlds',
    'incline-push-up': 'Incline_Push-Up',
    'band-pull-apart': 'Band_Pull_Apart',
    'hyperextensions-with-no-hyperextension-bench': 'Hyperextensions_With_No_Hyperextension_Bench',
    'plank': 'Plank',
    'dead-bug': 'Dead_Bug',
    'bodyweight-squat': 'Bodyweight_Squat',
    'scissors-jump': 'Scissors_Jump',
    'butt-lift-bridge': 'Butt_Lift_Bridge',
    'standing-calf-raises': 'Standing_Calf_Raises',
    'palms-up-barbell-wrist-curl-over-a-bench': 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench',
    'front-dumbbell-raise': 'Front_Dumbbell_Raise',
    'medicine-ball-full-twist': 'Medicine_Ball_Full_Twist',
    'bodyweight-flyes': 'Bodyweight_Flyes',
    'standing-dumbbell-triceps-extension': 'Standing_Dumbbell_Triceps_Extension',
    'stiff-leg-barbell-good-morning': 'Stiff_Leg_Barbell_Good_Morning',
    'single-leg-glute-bridge': 'Single_Leg_Glute_Bridge',
    'kneeling-squat': 'Kneeling_Squat',
    'reverse-hyperextension': 'Reverse_Hyperextension',
    'bent-knee-hip-raise': 'Bent-Knee_Hip_Raise',
    'isometric-neck-exercise-sides': 'Isometric_Neck_Exercise_-_Sides'
  };

  // Keep SourceDemoId aligned with MobilityCatalog.cs
  const CATALOG = [
    { id: 'wu-march', name: 'March in place', phase: 'warmup', role: 'general', targets: [], duration: 40, cue: 'Light pace, swing arms, raise heart rate gently', sourceDemoId: 'step-up-with-knee-raise' },
    { id: 'wu-jacks', name: 'Jumping jacks', phase: 'warmup', role: 'general', targets: [], duration: 40, cue: 'Soft landings; step-jacks if needed', sourceDemoId: 'star-jump' },
    { id: 'wu-high-knees', name: 'High knees (easy)', phase: 'warmup', role: 'general', targets: [], duration: 35, cue: 'Low intensity — just get blood moving', sourceDemoId: 'knee-tuck-jump' },
    { id: 'wu-arm-circles', name: 'Arm circles', phase: 'warmup', role: 'activate', targets: ['shoulders', 'chest', 'back'], duration: 35, cue: 'Small to large circles, both directions', sourceDemoId: 'around-the-worlds' },
    { id: 'wu-scap-pushup', name: 'Scapular push-ups', phase: 'warmup', role: 'activate', targets: ['chest', 'shoulders', 'triceps'], duration: 35, cue: 'Plank or knees: spread then squeeze shoulder blades', sourceDemoId: 'incline-push-up' },
    { id: 'wu-band-disloc', name: 'Open-chest arm swings', phase: 'warmup', role: 'activate', targets: ['chest', 'shoulders'], duration: 30, cue: 'Cross-body then open wide; easy range', sourceDemoId: 'band-pull-apart' },
    { id: 'wu-cat-cow', name: 'Cat–cow', phase: 'warmup', role: 'activate', targets: ['back', 'core'], duration: 40, cue: 'On all fours, slow spinal flexion/extension', sourceDemoId: 'hyperextensions-with-no-hyperextension-bench' },
    { id: 'wu-bird-dog', name: 'Bird dog', phase: 'warmup', role: 'activate', targets: ['back', 'core', 'glutes'], duration: 40, cue: 'Opposite arm/leg, brace midsection', sourceDemoId: 'plank' },
    { id: 'wu-dead-bug', name: 'Dead bug', phase: 'warmup', role: 'activate', targets: ['core'], duration: 40, cue: 'Low back pressed to floor; slow opposite limbs', sourceDemoId: 'dead-bug' },
    { id: 'wu-hip-circles', name: 'Standing hip circles', phase: 'warmup', role: 'activate', targets: ['hips', 'glutes', 'quads', 'hamstrings'], duration: 35, cue: 'Hands on hips, slow circles each way', sourceDemoId: 'bodyweight-squat' },
    { id: 'wu-leg-swings', name: 'Leg swings', phase: 'warmup', role: 'activate', targets: ['hamstrings', 'hips', 'quads', 'glutes'], duration: 35, cue: 'Front-to-back then side-to-side', sourceDemoId: 'scissors-jump' },
    { id: 'wu-bw-squat', name: 'Bodyweight squat (easy)', phase: 'warmup', role: 'activate', targets: ['quads', 'glutes', 'hamstrings'], duration: 40, cue: 'Easy depth, no load', sourceDemoId: 'bodyweight-squat' },
    { id: 'wu-glute-bridge', name: 'Glute bridge', phase: 'warmup', role: 'activate', targets: ['glutes', 'hamstrings', 'core'], duration: 35, cue: 'Squeeze glutes at top', sourceDemoId: 'butt-lift-bridge' },
    { id: 'wu-calf-raise', name: 'Calf raises', phase: 'warmup', role: 'activate', targets: ['calves'], duration: 30, cue: 'Full ankle range, both feet', sourceDemoId: 'standing-calf-raises' },
    { id: 'wu-wrist-circles', name: 'Wrist circles', phase: 'warmup', role: 'activate', targets: ['forearms', 'biceps', 'triceps'], duration: 30, cue: 'Prep elbows and wrists', sourceDemoId: 'palms-up-barbell-wrist-curl-over-a-bench' },
    { id: 'wu-shoulder-rolls', name: 'Shoulder rolls', phase: 'warmup', role: 'activate', targets: ['shoulders', 'back', 'neck'], duration: 30, cue: 'Slow forward and back', sourceDemoId: 'front-dumbbell-raise' },
    { id: 'wu-torso-twist', name: 'Standing torso twists', phase: 'warmup', role: 'activate', targets: ['core', 'back'], duration: 30, cue: 'Feet planted, gentle rotation', sourceDemoId: 'medicine-ball-full-twist' },
    { id: 'cd-chest-door', name: 'Chest doorway stretch', phase: 'cooldown', role: 'stretch', targets: ['chest', 'shoulders'], duration: 40, cue: 'Elbow at 90°, lean gently', sourceDemoId: 'bodyweight-flyes' },
    { id: 'cd-tricep-oh', name: 'Overhead triceps stretch', phase: 'cooldown', role: 'stretch', targets: ['triceps', 'shoulders'], duration: 35, cue: 'Elbow to ceiling, light pressure on elbow', sourceDemoId: 'standing-dumbbell-triceps-extension' },
    { id: 'cd-cross-body', name: 'Cross-body shoulder stretch', phase: 'cooldown', role: 'stretch', targets: ['shoulders', 'back'], duration: 35, cue: 'Arm across chest', sourceDemoId: 'around-the-worlds' },
    { id: 'cd-child-pose', name: "Child's pose", phase: 'cooldown', role: 'stretch', targets: ['back', 'shoulders', 'hips'], duration: 45, cue: 'Hips to heels, arms reach forward', sourceDemoId: 'plank' },
    { id: 'cd-thread-needle', name: 'Thread the needle', phase: 'cooldown', role: 'stretch', targets: ['back', 'shoulders'], duration: 40, cue: 'On all fours, thread arm under; both sides', sourceDemoId: 'hyperextensions-with-no-hyperextension-bench' },
    { id: 'cd-quad-stand', name: 'Standing quad stretch', phase: 'cooldown', role: 'stretch', targets: ['quads', 'hips'], duration: 40, cue: 'Hold ankle, tall posture', sourceDemoId: 'bodyweight-squat' },
    { id: 'cd-ham-hinge', name: 'Standing hamstring hinge', phase: 'cooldown', role: 'stretch', targets: ['hamstrings', 'back'], duration: 40, cue: 'Soft knees, hinge at hips', sourceDemoId: 'stiff-leg-barbell-good-morning' },
    { id: 'cd-fig4', name: 'Figure-4 glute stretch', phase: 'cooldown', role: 'stretch', targets: ['glutes', 'hips'], duration: 40, cue: 'Ankle on opposite knee', sourceDemoId: 'single-leg-glute-bridge' },
    { id: 'cd-calf-wall', name: 'Calf wall stretch', phase: 'cooldown', role: 'stretch', targets: ['calves'], duration: 35, cue: 'Back heel down, both straight and bent knee', sourceDemoId: 'standing-calf-raises' },
    { id: 'cd-hip-flexor', name: 'Half-kneeling hip flexor stretch', phase: 'cooldown', role: 'stretch', targets: ['hips', 'quads'], duration: 40, cue: 'Tuck pelvis, gentle forward shift', sourceDemoId: 'kneeling-squat' },
    { id: 'cd-cobra', name: 'Prone press-up / cobra', phase: 'cooldown', role: 'stretch', targets: ['core', 'back'], duration: 35, cue: 'Gentle extension, hips stay down', sourceDemoId: 'reverse-hyperextension' },
    { id: 'cd-knees-chest', name: 'Knees to chest', phase: 'cooldown', role: 'stretch', targets: ['core', 'back', 'glutes'], duration: 40, cue: 'Supine hug knees', sourceDemoId: 'bent-knee-hip-raise' },
    { id: 'cd-forearm-stretch', name: 'Forearm stretch', phase: 'cooldown', role: 'stretch', targets: ['forearms', 'biceps'], duration: 30, cue: 'Gentle palm up then palm down', sourceDemoId: 'palms-up-barbell-wrist-curl-over-a-bench' },
    { id: 'cd-neck-side', name: 'Neck side stretch', phase: 'cooldown', role: 'stretch', targets: ['neck', 'shoulders'], duration: 30, cue: 'Ear toward shoulder, no force', sourceDemoId: 'isometric-neck-exercise-sides' },
    { id: 'cd-breathe', name: 'Box breathing (easy)', phase: 'cooldown', role: 'stretch', targets: [], duration: 40, cue: 'In 4 · hold 4 · out 4 · hold 4', sourceDemoId: 'plank' }
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
    const folder = m.sourceDemoId ? SOURCE_FOLDERS[m.sourceDemoId] : null;
    const imageUrl = folder ? `${FEDB}${folder}/0.jpg` : null;
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
      imageUrl,
      // Animated WebP copied under mobility id (scripts/build-mobility-webps.py)
      demoAnimUrl: `/demos/${m.id}.webp`
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
