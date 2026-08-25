let currentPlan = null;
let currentUser = null;
let selectedDay = null;
let selectedWeek = null;
let selectedDayIndex = null;
let sessionExercises = [];
let currentExerciseIndex = 0;
let currentSetIndex = 0;
let phase = 'setup'; // setup | work | rest | finish
let startTime = null;
let phaseStartTime = null;
let elapsedPhaseSeconds = 0;
let phaseDurationSeconds = 30;
let timerInterval = null;
let demoFlipInterval = null;
// PREVIEW_SECONDS removed (demo shown during rest)
let musicEngine = null;
let sessionSaved = false;
let wakeLock = null;
let sessionPlanName = 'Plan4Strength';
let currentSavedPlanId = null;
let currentSavedPlanName = null;
let isPaused = false;
let autoPaused = false;
let pauseStartTime = 0;
let previewCache = null;      // cached exercise catalog (id -> exercise) for previews/analyze
let previewCachePromise = null;

const setupScreen = document.getElementById('setupScreen');
const activeScreen = document.getElementById('activeScreen');
const restScreen = document.getElementById('restScreen');
const finishScreen = document.getElementById('finishScreen');

const daySelect = document.getElementById('daySelect');
const startBtn = document.getElementById('startBtn');
const testSoundBtn = document.getElementById('testSoundBtn');
const loadError = document.getElementById('loadError');
const resumeBanner = document.getElementById('resumeBanner');
const resumeBtn = document.getElementById('resumeBtn');
const discardBtn = document.getElementById('discardBtn');
const musicToggle = document.getElementById('musicToggle');
const musicStyleSelect = document.getElementById('musicStyle');
const musicStyleActive = document.getElementById('musicStyleActive');
const musicStyleHint = document.getElementById('musicStyleHint');
const deviceMusicHint = document.getElementById('deviceMusicHint');
const nowPlayingEl = document.getElementById('nowPlaying');

const exerciseNameEl = document.getElementById('exerciseName');
const exerciseMetaEl = document.getElementById('exerciseMeta');
const setBadgeEl = document.getElementById('setBadge');
const demoLinkEl = document.getElementById('demoLink');
const timerDisplayEl = document.getElementById('timerDisplay');
const workCueEl = document.getElementById('workCue');
const workProgressBar = document.getElementById('workProgressBar');
const completeSetBtn = document.getElementById('completeSetBtn');
const musicBtn = document.getElementById('musicBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const contrastBtn = document.getElementById('contrastBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const restTimerEl = document.getElementById('restTimer');
const restProgressBar = document.getElementById('restProgressBar');
const nextExerciseNameEl = document.getElementById('nextExerciseName');
const nextExerciseMetaEl = document.getElementById('nextExerciseMeta');
const nextDemoEl = document.getElementById('nextDemo');
const skipRestBtn = document.getElementById('skipRestBtn');
const movesListModal = document.getElementById('movesListModal');
const movesList = document.getElementById('movesList');
const closeMovesListBtn = document.getElementById('closeMovesList');
const workTimerBlock = document.getElementById('workTimerBlock');
const previewBlock = null; // removed dead preview UI
const previewCountdownEl = document.getElementById('previewCountdown');
const startSetBtn = document.getElementById('startSetBtn');

const finishSummaryEl = document.getElementById('finishSummary');
const saveSessionArea = document.getElementById('saveSessionArea');
const saveSessionBtn = document.getElementById('saveSessionBtn');
const saveSessionStatus = document.getElementById('saveSessionStatus');
const signInToSaveLink = document.getElementById('signInToSaveLink');
const userLabel = document.getElementById('userLabel');
const voiceCuesToggle = document.getElementById('voiceCuesToggle');
const tvModeBtn = document.getElementById('tvModeBtn');
const castModal = document.getElementById('castModal');

// Shared beep AudioContext (reuse to reduce latency / garbage)
let sharedAudioCtx = null;
let lastSpokenSecondKey = '';

// -------------------------- Init --------------------------

document.addEventListener('DOMContentLoaded', async () => {
  musicEngine = new PlaylistMusicEngine();
  await musicEngine.loadCatalog();

  // Global auth: update local currentUser when auth state changes
  window.addEventListener('auth-changed', (e) => {
    const { user } = e.detail;
    currentUser = user;
    if (userLabel) userLabel.textContent = user || '';
  });
  await initGlobalAuth();
  currentUser = window.currentUser;
  if (userLabel && currentUser) userLabel.textContent = currentUser;

  await loadUserPreferences();
  await loadPlan();
  checkForResumableSession();
  initVoiceCuesToggle();
  // Warm speech voices (Chrome loads async)
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  startBtn.addEventListener('click', startWorkout);
  resumeBtn.addEventListener('click', resumeSession);
  discardBtn.addEventListener('click', discardSession);
  if (testSoundBtn) testSoundBtn.addEventListener('click', testSound);
  completeSetBtn.addEventListener('click', () => completeSet(true));
  skipRestBtn.addEventListener('click', endRest);
  if (startSetBtn) startSetBtn.addEventListener('click', beginSetFromPreview);
  if (musicBtn) musicBtn.addEventListener('click', toggleMusic);
  if (musicStyleSelect) musicStyleSelect.addEventListener('change', onMusicStyleChange);
  if (musicStyleActive) musicStyleActive.addEventListener('change', onMusicStyleActiveChange);
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  if (contrastBtn) contrastBtn.addEventListener('click', toggleHighContrast);
  if (tvModeBtn) tvModeBtn.addEventListener('click', openCastModal);
  if (saveSessionBtn) saveSessionBtn.addEventListener('click', () => saveSession({ manual: true }));
  document.getElementById('pauseBtn').addEventListener('click', () => pauseWorkout(false));
  document.getElementById('resumeWorkoutBtn').addEventListener('click', resumeWorkout);
  document.getElementById('restResumeWorkoutBtn').addEventListener('click', resumeWorkout);
  document.getElementById('volumeSlider').addEventListener('input', onVolumeChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Session options overflow (⋯)
  const overflowModal = document.getElementById('overflowModal');
  const openOverflow = () => overflowModal?.classList.remove('hidden');
  const closeOverflow = () => overflowModal?.classList.add('hidden');
  document.getElementById('workOverflowBtn')?.addEventListener('click', openOverflow);
  document.getElementById('restOverflowBtn')?.addEventListener('click', openOverflow);
  document.getElementById('closeOverflow')?.addEventListener('click', closeOverflow);
  document.getElementById('overflowViewAllBtn')?.addEventListener('click', () => {
    closeOverflow();
    openMovesList();
  });
  overflowModal?.addEventListener('click', (e) => {
    if (e.target === overflowModal) closeOverflow();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overflowModal && !overflowModal.classList.contains('hidden')) closeOverflow();
  });

  // TV / cast modal
  const closeCast = () => closeCastModal();
  document.getElementById('closeCastModal')?.addEventListener('click', closeCast);
  document.getElementById('dismissCastModal')?.addEventListener('click', closeCast);
  document.getElementById('enableTvModeBtn')?.addEventListener('click', () => {
    setTvMode(true);
    closeCastModal();
    if (typeof showToast === 'function') {
      showToast('TV mode on \u2014 mirror this screen with AirPlay or Cast tab.', 'info', 4500);
    }
  });
  castModal?.addEventListener('click', (e) => {
    if (e.target === castModal) closeCastModal();
  });

  // Skip exercise button (overflow)
  const skipExerciseBtn = document.getElementById('overflowSkipBtn');
  if (skipExerciseBtn) skipExerciseBtn.addEventListener('click', () => { closeOverflow(); skipCurrentExercise(); });

  // Previous exercise button (overflow)
  const prevExerciseBtn = document.getElementById('overflowPrevBtn');
  if (prevExerciseBtn) prevExerciseBtn.addEventListener('click', () => { closeOverflow(); goBackExercise(); });

  if (closeMovesListBtn) closeMovesListBtn.addEventListener('click', closeMovesList);
  movesListModal?.addEventListener('click', (e) => {
    if (e.target === movesListModal) closeMovesList();
  });

  const analyzeBtn = document.getElementById('analyzeBtn');
  const closeAnalyze = document.getElementById('closeAnalyze');
  const analyzeModal = document.getElementById('analyzeModal');
  if (analyzeBtn) analyzeBtn.addEventListener('click', openAnalyze);
  if (closeAnalyze) closeAnalyze.addEventListener('click', closeAnalyzeModal);
  analyzeModal?.addEventListener('click', (e) => {
    if (e.target === analyzeModal) closeAnalyzeModal();
  });
  if (daySelect) daySelect.addEventListener('change', renderDayPreview);

  if (localStorage.getItem('runnerHighContrast') === '1') {
    document.body.classList.add('high-contrast');
    if (contrastBtn) {
      contrastBtn.classList.add('bg-blue-100');
      contrastBtn.setAttribute('aria-pressed', 'true');
      contrastBtn.title = 'Dark mode on (tap for light)';
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', '#0b0f14');
  }

  // Space / Enter: skip work/rest
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (phase === 'work') {
      e.preventDefault();
      completeSet(true);
    } else if (phase === 'rest') {
      e.preventDefault();
      endRest();
    }
  });

  // Initialize focus traps on runner modals
  document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(modal => {
    modal._onClose = function() { modal.classList.add('hidden'); };
    if (typeof initModal === 'function') initModal(modal);
  });
});

async function loadUserPreferences() {
  try {
    let style = localStorage.getItem('runnerMusicStyle') || '';
    let volume = parseInt(localStorage.getItem('runnerMusicVolume') || '', 10);

    try {
      const res = await fetch('/api/user/preferences', { credentials: 'include' });
      if (res.ok) {
        const prefs = await res.json();
        if (prefs.defaultMusicStyle) style = prefs.defaultMusicStyle;
        else if (prefs.defaultMusic) style = 'drive';
        else if (!style) style = 'off';
        if (Number.isFinite(prefs.defaultVolume)) volume = prefs.defaultVolume;
      }
    } catch { /* offline / signed out */ }

    if (!style) style = 'drive';
    if (!Number.isFinite(volume)) volume = 35;

    setMusicStyleUI(style);
    document.getElementById('volumeSlider').value = volume;
    document.getElementById('volumeValue').textContent = volume + '%';
    musicEngine.setBaseVolume(volume / 100);
    musicEngine.setStyle(style);
  } catch {
    // ignore
  }
}

function setMusicStyleUI(style) {
  const s = style || 'off';
  if (musicStyleSelect) musicStyleSelect.value = s;
  if (musicStyleActive) musicStyleActive.value = s;
  if (musicToggle) musicToggle.checked = s !== 'off' && s !== 'device';
  if (deviceMusicHint) deviceMusicHint.classList.toggle('hidden', s !== 'device');
  if (musicStyleHint) {
    musicStyleHint.textContent = s === 'device'
      ? 'Use your own app for music â€” we only play beeps.'
      : s === 'off'
        ? 'Music off. You can turn a style on during the session.'
        : 'Built-in playlist will start when you begin the workout.';
  }
}

function onMusicStyleChange() {
  const style = musicStyleSelect?.value || 'off';
  setMusicStyleUI(style);
  musicEngine.setStyle(style);
  try { localStorage.setItem('runnerMusicStyle', style); } catch { /* ignore */ }
}

function onMusicStyleActiveChange() {
  const style = musicStyleActive?.value || 'off';
  setMusicStyleUI(style);
  musicEngine.setStyle(style);
  if (style === 'off' || style === 'device') {
    musicEngine.stop();
  } else if (phase === 'work' || phase === 'rest') {
    musicEngine.start();
  }
  updateMusicButton();
  try { localStorage.setItem('runnerMusicStyle', style); } catch { /* ignore */ }
}

function currentMusicStyle() {
  return musicStyleActive?.value || musicStyleSelect?.value || 'off';
}

function shouldAutoStartMusic() {
  const s = currentMusicStyle();
  return s !== 'off' && s !== 'device';
}

async function loadPlan() {
  const params = new URLSearchParams(window.location.search);
  const planId = params.get('planId');

  if (planId) {
    try {
      const res = await fetch(`/api/plans/${planId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load saved plan. Make sure you are signed in.');
      currentPlan = await res.json();
      currentSavedPlanId = parseInt(planId, 10);
    } catch (err) {
      showLoadError(err.message);
      return;
    }
  } else {
    // Check for a saved plan ID in localStorage (set by runPlan or saveCurrentPlan)
    const savedId = localStorage.getItem('workoutPlanSavedId');
    if (savedId) {
      try {
        const res = await fetch(`/api/plans/${savedId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Could not load saved plan.');
        currentPlan = await res.json();
        currentSavedPlanId = parseInt(savedId, 10);
      } catch {
        // Fall through to localStorage plan
      }
    }
    if (!currentPlan) {
      const saved = localStorage.getItem('workoutPlan');
      if (saved) {
        try {
          currentPlan = JSON.parse(saved);
        } catch {
          showLoadError('No workout plan found. Generate or save a plan first.');
          return;
        }
      } else {
        showLoadError('No workout plan found. Generate or save a plan first.');
        return;
      }
    }
  }

  // Inject warm-up / cool-down if this plan was saved without them
  if (typeof WorkoutMobility !== 'undefined' && currentPlan) {
    if (WorkoutMobility.ensurePlanMobility(currentPlan)) {
      try {
        if (!planId) localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
      } catch { /* ignore */ }
    }
  }

  populateDaySelect();
  await defaultToNextWorkoutDay();
  renderDayPreview();
}

function showLoadError(message) {
  loadError.textContent = message;
  loadError.classList.remove('hidden');
  startBtn.disabled = true;
  startBtn.classList.add('opacity-50', 'cursor-not-allowed');
}

function populateDaySelect() {
  daySelect.innerHTML = '';
  let hasWorkout = false;

  currentPlan.plan.forEach(week => {
    week.days.forEach((day, idx) => {
      if (day.type !== 'workout') return;
      hasWorkout = true;
      const option = document.createElement('option');
      option.value = JSON.stringify({ week: week.week, dayIndex: day.dayIndex });
      const summary = typeof WorkoutMobility !== 'undefined'
        ? WorkoutMobility.dayMobilitySummary(day)
        : '';
      const styleTag = day.sessionStyle === 'hiit' ? 'HIIT Â· ' : (day.sessionStyle === 'strength' ? 'Strength Â· ' : '');
      option.textContent = `Week ${week.week} - ${day.day} (${styleTag}${day.focus || 'Training'})${summary ? ' Â· ' + summary : ''}`;
      daySelect.appendChild(option);
    });
  });

  if (!hasWorkout) {
    showLoadError('This plan has no workout days to run.');
  }
}


function completedDaysKey() {
  const id = currentSavedPlanId ? 'saved-' + currentSavedPlanId : 'gen-' + (currentPlan?.generatedAt || 'unknown');
  return 'runnerCompleted_' + id;
}

function getCompletedDayKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem(completedDaysKey()) || '[]'));
  } catch {
    return new Set();
  }
}

function markDayCompleted() {
  if (selectedWeek == null || selectedDayIndex == null) return;
  const key = selectedWeek + ':' + selectedDayIndex;
  const set = getCompletedDayKeys();
  set.add(key);
  try {
    localStorage.setItem(completedDaysKey(), JSON.stringify([...set]));
  } catch { /* ignore */ }
}

async function defaultToNextWorkoutDay() {
  const completed = getCompletedDayKeys();

  // Merge server history for saved plans (cross-device)
  if (currentUser && currentSavedPlanId) {
    try {
      const res = await fetch('/api/runner/sessions', { credentials: 'include' });
      if (res.ok) {
        const sessions = await res.json();
        sessions.forEach(s => {
          if (s.savedPlanId === currentSavedPlanId && s.week && s.dayIndex != null) {
            completed.add(s.week + ':' + s.dayIndex);
          }
        });
      }
    } catch { /* ignore */ }
  }

  let found = null;
  for (const week of currentPlan.plan) {
    for (const day of week.days) {
      if (day.type !== 'workout') continue;
      if (!completed.has(week.week + ':' + day.dayIndex)) {
        found = { week: week.week, dayIndex: day.dayIndex };
        break;
      }
    }
    if (found) break;
  }
  // All complete -> start over at first workout day
  if (!found) {
    outer: for (const week of currentPlan.plan) {
      for (const day of week.days) {
        if (day.type === 'workout') {
          found = { week: week.week, dayIndex: day.dayIndex };
          break outer;
        }
      }
    }
  }
  if (found) {
    daySelect.value = JSON.stringify(found);
  }
}

function checkForResumableSession() {
  const saved = localStorage.getItem('workoutSession');
  if (saved) {
    resumeBanner.classList.remove('hidden');
  }
}

// -------------------------- Day preview + analyze --------------------------

function previewSelectedDay() {
  if (!daySelect.value || !currentPlan) return null;
  let selection;
  try { selection = JSON.parse(daySelect.value); } catch { return null; }
  const week = currentPlan.plan.find(w => w.week === selection.week);
  if (!week) return null;
  return week.days[selection.dayIndex];
}

function dayEquipmentNames(day) {
  const used = new Set();
  (day.exercises || []).forEach(ex => {
    const cat = previewCache && previewCache[ex.id];
    (cat?.equipment || ex.equipment || []).forEach(e => used.add(e));
  });
  const names = { bodyweight: 'Bodyweight', barbell: 'Barbell', dumbbells: 'Dumbbells', kettlebell: 'Kettlebell', bench: 'Bench', cable: 'Cable machine', 'ez-bar': 'EZ bar', 'foam-roller': 'Foam roller', 'pull-up-bar': 'Pull-up bar', bands: 'Bands', machine: 'Machine', 'medicine-ball': 'Medicine ball', 'suspension-trainer': 'Suspension trainer', 'resistance-band': 'Resistance band' };
  if (used.size === 0) return ['Bodyweight'];
  return [...used].map(id => names[id] || id);
}

function estimateDayMinutes(day) {
  const transition = 15;
  const secs = (day.exercises || []).reduce((sum, ex) => {
    const sets = Math.max(1, ex.sets || 1);
    return sum + sets * ((ex.workDuration || 30) + (ex.rest || 0)) + transition;
  }, 0);
  return Math.max(1, Math.round(secs / 60));
}

async function ensurePreviewCache() {
  if (previewCache) return previewCache;
  if (previewCachePromise) return previewCachePromise;
  previewCachePromise = (async () => {
    const map = {};
    try {
      const res = await fetch('/api/exercises', { credentials: 'include' });
      if (res.ok) {
        (await res.json()).forEach(ex => { map[ex.id] = ex; });
      }
    } catch { /* offline */ }
    previewCache = map;
    return map;
  })();
  return previewCachePromise;
}

async function renderDayPreview() {
  const day = previewSelectedDay();
  const preview = document.getElementById('dayPreview');
  if (!day || day.type !== 'workout') {
    if (preview) preview.classList.add('hidden');
    return;
  }
  const title = document.getElementById('previewTitle');
  const meta = document.getElementById('previewMeta');
  const moves = document.getElementById('previewMoves');
  const equip = document.getElementById('previewEquipment');
  const style = day.sessionStyle === 'hiit' ? 'HIIT' : 'Strength';
  const focus = day.focus ? ` · ${day.focus}` : '';
  const summary = typeof WorkoutMobility !== 'undefined'
    ? WorkoutMobility.dayMobilitySummary(day)
    : '';
  title.textContent = `${day.day}${focus}`;
  meta.textContent = `~${estimateDayMinutes(day)} min · ${style}${summary ? ' · ' + summary : ''}`;

  const eqNames = await ensurePreviewCache().then(() => dayEquipmentNames(day));
  equip.textContent = 'Equipment: ' + eqNames.join(' · ');

  const rows = (day.exercises || []).map(ex => {
    const phase = (ex.phase || 'work').toLowerCase();
    const isWarmCool = phase === 'warmup' || phase === 'cooldown';
    const tag = isWarmCool
      ? `<span class="text-[10px] font-semibold uppercase tracking-wide ${phase === 'warmup' ? 'bg-amber-100 text-amber-900' : 'bg-teal-100 text-teal-900'} px-1.5 py-0.5 rounded">${phase === 'warmup' ? 'Warm-up' : 'Cool-down'}</span>`
      : `<span class="text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded">Work</span>`;
    let detail;
    if (isWarmCool) {
      detail = `${ex.workDuration || 30}s`;
    } else if (day.sessionStyle === 'hiit') {
      detail = `${ex.sets} rounds × ${ex.repsDisplay || (ex.workDuration + 's')} <span class="text-gray-500">(${ex.rest}s rest)</span>`;
    } else {
      detail = `${ex.sets} sets × ${ex.repsDisplay || 'target reps'} <span class="text-gray-500">(${ex.rest}s rest)</span>`;
    }
    return `<div class="flex items-start justify-between gap-2">
      <span class="min-w-0">${tag} ${escapeHtmlRunner(ex.name)}</span>
      <span class="text-gray-600 shrink-0 whitespace-nowrap">${detail}</span>
    </div>`;
  }).join('');
  moves.innerHTML = rows || '<p class="text-sm text-gray-500">No moves in this day.</p>';
  if (preview) preview.classList.remove('hidden');
}

function analyzeMuscleSets(day) {
  const primary = [];
  const secondary = [];
  (day.exercises || []).forEach(ex => {
    (ex.primary || []).forEach(p => { if (!primary.includes(p)) primary.push(p); });
    (ex.secondary || []).forEach(s => { if (!secondary.includes(s)) secondary.push(s); });
  });
  return { primary, secondary };
}

function openAnalyze() {
  const day = previewSelectedDay();
  if (!day || day.type !== 'workout') return;
  const modal = document.getElementById('analyzeModal');
  const body = document.getElementById('analyzeBody');
  const { primary, secondary } = analyzeMuscleSets(day);
  const isHiit = day.sessionStyle === 'hiit';
  const unit = isHiit ? 'rounds' : 'sets';

  let html = '';

  // 1) Muscle coverage diagram
  if (typeof MuscleDiagram !== 'undefined') {
    html += `<div>
      <h3 class="text-sm font-semibold text-blue-900 mb-2">Muscles worked</h3>
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-2 flex justify-center">
        ${MuscleDiagram.render(primary, secondary)}
      </div>
      <div class="text-xs text-gray-500 mt-1 text-center">
        <span class="swatch swatch-worked"></span>Primary&nbsp;&nbsp;
        <span class="swatch swatch-secondary"></span>Supporting
      </div>
    </div>`;
  }

  // 2) Muscle list
  const muscleChips = (list, cls) => list.length
    ? list.map(m => `<span class="inline-block text-xs font-medium px-2 py-1 rounded-full ${cls}">${escapeHtmlRunner(m)}</span>`).join(' ')
    : '<span class="text-xs text-gray-400">—</span>';
  html += `<div>
    <h3 class="text-sm font-semibold text-blue-900 mb-2">Coverage</h3>
    <div class="space-y-1.5">
      <div><span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Primary</span><div class="mt-1 flex flex-wrap gap-1">${muscleChips(primary, 'bg-red-50 text-red-800')}</div></div>
      <div><span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Supporting</span><div class="mt-1 flex flex-wrap gap-1">${muscleChips(secondary, 'bg-pink-50 text-pink-800')}</div></div>
    </div>
  </div>`;

  // 3) Per-move tweak (swap)
  html += `<div>
    <h3 class="text-sm font-semibold text-blue-900 mb-2">Tweak a move</h3>
    <div class="space-y-2" id="analyzeSwapList">
      ${(day.exercises || []).map((ex, i) => swapCardHtml(ex, i, unit)).join('')}
    </div>
  </div>`;

  body.innerHTML = html;
  modal.classList.remove('hidden');
}

function swapCardHtml(ex, index, unit) {
  const phase = (ex.phase || 'work').toLowerCase();
  const isWarmCool = phase === 'warmup' || phase === 'cooldown';
  const detail = isWarmCool
    ? `${ex.workDuration || 30}s`
    : `${ex.sets} ${unit} × ${ex.repsDisplay || 'target'} · ${ex.rest}s rest`;
  const muscles = (ex.primary || []).join(', ');
  return `<div class="border border-gray-200 rounded-lg p-3">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="font-medium text-sm">${escapeHtmlRunner(ex.name)}</div>
        <div class="text-xs text-gray-500 truncate">${escapeHtmlRunner(detail)}${muscles ? ' · ' + escapeHtmlRunner(muscles) : ''}</div>
      </div>
      ${isWarmCool ? '' : `<button onclick="openSwapPicker(${index})" class="shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded-md touch-manipulation">Swap</button>`}
    </div>
    <div id="swapPicker-${index}" class="hidden mt-2 space-y-1"></div>
  </div>`;
}

function swapAlternatives(ex) {
  if (!previewCache) return [];
  const exPrimary = (ex.primary || []).map(p => p.toLowerCase());
  const criteria = currentPlan?.criteria || {};
  const equipment = (criteria.equipment || []).map(e => e.toLowerCase());
  const restrictions = (criteria.restrictions || []).map(r => r.toLowerCase());
  const rehabAreas = (criteria.rehab || []).map(r => r.toLowerCase());
  const levelNum = { beginner: 1, intermediate: 2, advanced: 3 }[criteria.level] || 1;
  const usedIds = new Set((previewSelectedDay()?.exercises || []).map(e => e.id));
  // Rehab-to-mechanics mapping (mirrors InjuryRules.RehabToMechanics on the server)
  const rehabToMechanics = { shoulder: ['rotator-cuff'], knee: ['patellar'] };
  function matchesRehab(c) {
    if (!rehabAreas.length || !c.mechanics?.rehab) return false;
    const mr = c.mechanics.rehab.toLowerCase();
    return rehabAreas.some(a => (rehabToMechanics[a] || []).some(v => v === mr));
  }
  return Object.values(previewCache).filter(c => {
    if (c.id === ex.id || usedIds.has(c.id)) return false;
    if (String(c.slot).toLowerCase() !== String(ex.slot).toLowerCase()) return false;
    if (levelNum < ({ beginner: 1, intermediate: 2, advanced: 3 }[c.level] || 1)) return false;
    // Must share at least one primary muscle
    if (!(c.primary || []).some(p => exPrimary.includes(p.toLowerCase()))) return false;
    // Equipment: every required piece must be available (empty = bodyweight)
    const required = (c.equipment && c.equipment.length) ? c.equipment.map(e => e.toLowerCase()) : ['bodyweight'];
    if (!required.every(eq => equipment.includes(eq))) return false;
    // Injury restrictions: no overlap with avoidFor — unless rehab matches
    if (!matchesRehab(c) && (c.avoidFor || []).some(t => restrictions.includes(t.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => {
    // Prefer rehab-matching alternatives
    const aRehab = matchesRehab(a) ? 1 : 0;
    const bRehab = matchesRehab(b) ? 1 : 0;
    return bRehab - aRehab || a.name.localeCompare(b.name);
  }).slice(0, 8);
}

function openSwapPicker(index) {
  const day = previewSelectedDay();
  const ex = day?.exercises?.[index];
  const picker = document.getElementById('swapPicker-' + index);
  if (!ex || !picker) return;
  if (!picker.classList.contains('hidden')) {
    picker.classList.add('hidden');
    return;
  }
  const alts = swapAlternatives(ex);
  if (!alts.length) {
    picker.innerHTML = '<p class="text-xs text-gray-500">No compatible alternatives found.</p>';
  } else {
    picker.innerHTML = alts.map(a => `
      <button onclick="swapDayExercise(${index}, '${escapeHtmlRunner(a.id)}')" class="w-full text-left text-xs bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-md px-2 py-1.5 touch-manipulation">
        ${escapeHtmlRunner(a.name)}
      </button>`).join('');
  }
  picker.classList.remove('hidden');
}

function swapDayExercise(index, newId) {
  const day = previewSelectedDay();
  const cat = previewCache && previewCache[newId];
  if (!day || !cat || !day.exercises[index]) return;
  const old = day.exercises[index];
  day.exercises[index] = {
    ...old,
    id: cat.id,
    name: cat.name,
    slot: cat.slot || old.slot,
    primary: cat.primary || old.primary,
    secondary: cat.secondary || old.secondary,
    demoUrl: cat.demoUrl,
    imageUrl: cat.imageUrl,
    demoAnimUrl: `/demos/${cat.id}.webp`,
    rest: old.rest || cat.restSec || 60,
    workDuration: old.workDuration || cat.workDuration || 30,
    repsDisplay: old.repsDisplay || (cat.repsMin ? `${cat.repsMin}-${cat.repsMax}` : '')
  };
  day.estimatedMinutes = estimateDayMinutes(day);
  // Persist swap back to the local plan so it survives a reload
  try {
    localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
  } catch { /* ignore */ }
  if (typeof showToast === 'function') showToast(`Swapped to ${cat.name}`, 'success');
  renderDayPreview();
  openAnalyze();
}

function closeAnalyzeModal() {
  const modal = document.getElementById('analyzeModal');
  if (modal) modal.classList.add('hidden');
}

function saveSessionState() {
  if (phase !== 'work' && phase !== 'rest') return;
  const state = {
    phase,
    currentExerciseIndex,
    currentSetIndex,
    startTime,
    phaseStartTime,
    phaseDurationSeconds,
    sessionExercises,
    selectedWeek,
    selectedDayIndex,
    planName: currentPlan?.criteria
      ? `${currentPlan.criteria.weeks}-week ${currentPlan.criteria.goal} plan`
      : 'Plan4Strength',
    musicStyle: currentMusicStyle(),
    musicWasPlaying: !!musicEngine?.isPlaying
  };
  localStorage.setItem('workoutSession', JSON.stringify(state));
}

function clearSessionState() {
  localStorage.removeItem('workoutSession');
}

function discardSession() {
  clearSessionState();
  resumeBanner.classList.add('hidden');
}

async function resumeSession() {
  const saved = localStorage.getItem('workoutSession');
  if (!saved) return;

  try {
    const state = JSON.parse(saved);
    sessionExercises = state.sessionExercises;
    currentExerciseIndex = state.currentExerciseIndex;
    currentSetIndex = state.currentSetIndex;
    selectedWeek = state.selectedWeek ?? null;
    selectedDayIndex = state.selectedDayIndex ?? null;
    phase = state.phase;
    startTime = state.startTime;
    phaseStartTime = state.phaseStartTime || Date.now();
    phaseDurationSeconds = state.phaseDurationSeconds || 30;
    sessionSaved = false;
    sessionPlanName = state.planName || 'Plan4Strength';

    await requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    startAudioKeepAlive();

    // Restore the music selection from when the session was saved
    if (state.musicStyle) {
      if (musicStyleSelect) musicStyleSelect.value = state.musicStyle;
      if (musicStyleActive) musicStyleActive.value = state.musicStyle;
      setMusicStyleUI(state.musicStyle);
      musicEngine.setStyle(state.musicStyle);
    }
    if (state.musicWasPlaying && shouldAutoStartMusic()) {
      musicEngine.start();
      updateMusicButton();
    }

    resumeBanner.classList.add('hidden');
    clearSessionState();

    if (phase === 'rest') {
      showScreen(restScreen);
      const nextEx = currentExercise();
      nextExerciseNameEl.textContent = nextEx.name;
      nextExerciseMetaEl.textContent = setWorkLabel(nextEx);
      if (nextDemoEl) {
        nextDemoEl.innerHTML = exerciseMediaHtml(nextEx, { compact: true });
        startDemoFlip(nextDemoEl);
      }
      restTimerEl.textContent = formatTime(Math.max(0, phaseDurationSeconds - Math.floor((Date.now() - phaseStartTime) / 1000)));
      startTimer();
    } else {
      showScreen(activeScreen);
      enterWork(true);
    }
  } catch {
    clearSessionState();
    resumeBanner.classList.add('hidden');
  }
}

// -------------------------- Session control --------------------------

function workSeconds(ex) {
  const d = parseInt(ex.workDuration, 10);
  return Number.isFinite(d) && d > 0 ? d : 30;
}

function restSeconds(ex) {
  const d = parseInt(ex.rest, 10);
  return Number.isFinite(d) && d > 0 ? d : 45;
}

function setWorkLabel(ex) {
  const phase = (ex.phase || 'work').toLowerCase();
  if (phase === 'warmup' || phase === 'cooldown') {
    const muscles = (ex.primary || []).filter(Boolean).join(', ');
    return muscles ? `Targets: ${muscles}` : (phase === 'warmup' ? 'Prep movement' : 'Recovery stretch');
  }
  if (selectedDay?.sessionStyle === 'hiit' && phase === 'work') {
    return `${ex.sets} rounds Â· ${ex.repsDisplay || workSeconds(ex) + 's'} work Â· ${restSeconds(ex)}s rest`;
  }
  const reps = ex.repsDisplay || 'your target reps';
  return `${ex.sets} sets Â· aim for ${reps} each set Â· ${restSeconds(ex)}s rest`;
}

function exercisePhase(ex) {
  return (ex?.phase || 'work').toLowerCase();
}

function isMobilityExercise(ex) {
  const p = exercisePhase(ex);
  return p === 'warmup' || p === 'cooldown';
}

async function startWorkout() {
  if (!currentPlan) return;

  // Unlock audio / speech on user gesture
  try { getAudioContext(); } catch { /* ignore */ }
  if (window.speechSynthesis) window.speechSynthesis.getVoices();

  if (!daySelect.value) { showLoadError('No workout day selected.'); return; }
  const selection = JSON.parse(daySelect.value);
  const weekObj = currentPlan.plan.find(w => w.week === selection.week);
  if (!weekObj) { showLoadError('Selected day not found in plan.'); return; }
  selectedDay = weekObj.days[selection.dayIndex];
  selectedWeek = selection.week;
  selectedDayIndex = selection.dayIndex;
  if (!selectedDay || selectedDay.type !== 'workout') { showLoadError('Selected day is not a workout day.'); return; }
  if (typeof WorkoutMobility !== 'undefined') {
    WorkoutMobility.ensureDayMobility(selectedDay, currentPlan.criteria || {});
  }
  sessionExercises = selectedDay.exercises.map(ex => {
    const phase = (ex.phase || (ex.slot === 'warmup' || ex.slot === 'cooldown' ? ex.slot : 'work'));
    const id = ex.id || '';
    const demoAnimUrl = ex.demoAnimUrl
      || (id ? `/demos/${id}.webp` : null);
    return {
      ...ex,
      phase,
      demoAnimUrl,
      completedSets: []
    };
  });
  currentExerciseIndex = 0;
  currentSetIndex = 0;
  phase = 'work';
  startTime = Date.now();
  sessionSaved = false;
  sessionPlanName = currentSavedPlanName
    || (currentPlan.criteria ? `${currentPlan.criteria.weeks}-week ${currentPlan.criteria.goal} plan` : 'Plan4Strength');

  await requestWakeLock();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  startAudioKeepAlive();

  if (shouldAutoStartMusic()) {
    musicEngine.start();
    updateMusicButton();
  }

  showScreen(activeScreen);
  enterWork();
  saveSessionState();
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      // denied â€” continue
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

function handleBeforeUnload(e) {
  if (phase === 'work' || phase === 'rest') {
    e.preventDefault();
    e.returnValue = '';
  }
}

function pauseWorkout(auto = false) {
  if (isPaused || (phase !== 'work' && phase !== 'rest')) return;
  isPaused = true;
  autoPaused = auto;
  pauseStartTime = Date.now();
  clearInterval(timerInterval);
  stopSpeech();
  if (musicEngine.isPlaying) musicEngine.setVolume(0.05);
  updatePauseUI();
}

function resumeWorkout() {
  if (!isPaused) return;
  const pauseDuration = Date.now() - pauseStartTime;
  phaseStartTime += pauseDuration;
  startTime += pauseDuration;
  isPaused = false;
  autoPaused = false;
  const targetVol = phase === 'rest' ? 0.35 : 1.0;
  if (musicEngine.isPlaying) {
    musicEngine.setVolume(targetVol);
    // iOS may have suspended the audio element while the phone was locked
    musicEngine.audio.play().catch(() => {});
  } else if (shouldAutoStartMusic() && (phase === 'work' || phase === 'rest')) {
    musicEngine.start();
    musicEngine.setVolume(targetVol);
  }
  startTimer();
  updatePauseUI();
}

function updatePauseUI() {
  const pausedOverlay = document.getElementById('pausedOverlay');
  const restPausedOverlay = document.getElementById('restPausedOverlay');
  const pauseBtn = document.getElementById('pauseBtn');

  pausedOverlay.classList.toggle('hidden', !isPaused);
  restPausedOverlay.classList.toggle('hidden', !isPaused);
  pauseBtn.classList.toggle('hidden', isPaused);
}

function onVolumeChange(e) {
  const value = parseInt(e.target.value, 10);
  document.getElementById('volumeValue').textContent = value + '%';
  if (musicEngine) musicEngine.setBaseVolume(value / 100);
  try { localStorage.setItem('runnerMusicVolume', String(value)); } catch { /* ignore */ }
}

async function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    if (!isPaused && phase !== 'setup' && phase !== 'finish') {
      pauseWorkout(true);
    }
  } else {
    if (autoPaused) {
      resumeWorkout();
    } else if (phase !== 'setup' && phase !== 'finish') {
      await requestWakeLock();
    }
    const audioCtx = sharedAudioCtx;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    if (phase === 'work') startDemoFlip(demoLinkEl);
    if (phase === 'rest') startDemoFlip(nextDemoEl);
  }
}

function showScreen(screen) {
  [setupScreen, activeScreen, restScreen, finishScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
  document.body.classList.toggle('rest-phase', screen === restScreen);

  const inSession = screen === activeScreen || screen === restScreen;
  // Keep demo flip alive when returning to a screen that has media
  if (typeof setWorkoutChromeVisible === 'function') {
    setWorkoutChromeVisible(!inSession);
  } else {
    document.body.classList.toggle('workout-active', inSession);
  }
}

function currentExercise() {
  return sessionExercises[currentExerciseIndex];
}

/** free-exercise-db often has 0.jpg + 1.jpg â€” flip them as a JS fallback. */
function demoImageUrls(ex) {
  const primary = ex?.imageUrl || '';
  if (!primary) return [];
  const urls = [primary];
  if (/\/0\.(jpe?g|png|webp)(\?|$)/i.test(primary)) {
    urls.push(primary.replace(/\/0\.(jpe?g|png|webp)/i, '/1.$1'));
  } else if (/\/1\.(jpe?g|png|webp)(\?|$)/i.test(primary)) {
    urls.push(primary.replace(/\/1\.(jpe?g|png|webp)/i, '/0.$1'));
  }
  return urls;
}

/** Prebuilt animated WebP (FEDB stills, mobility copies, or stick demos). */
function demoWebpUrl(ex) {
  if (!ex) return null;
  if (ex.demoAnimUrl) return ex.demoAnimUrl;
  if (!ex.id) return null;
  // Always try /demos/{id}.webp â€” onerror falls back to still flip / placeholder
  return `/demos/${encodeURIComponent(ex.id)}.webp`;
}

function exerciseMediaHtml(ex, options = {}) {
  const compact = !!options.compact;
  const urls = demoImageUrls(ex);
  const webp = demoWebpUrl(ex);
  const cue = ex.progression && isMobilityExercise(ex)
    ? `<div class="demo-caption">${escapeHtmlRunner(ex.progression)}</div>`
    : (ex.primary && ex.primary.length
      ? `<div class="demo-caption">${escapeHtmlRunner((ex.primary || []).join(' Â· '))}</div>`
      : '');

  let frame;
  if (webp) {
    // Prefer animated WebP; on error fall back to still flip via onDemoWebpError
    const stills = urls.map(u => encodeURIComponent(u)).join('|');
    frame = `<div class="demo-frame demo-frame--anim" data-demo-flip="0" data-stills="${stills}">
      <img src="${webp}" alt="${escapeHtmlRunner(ex.name || 'Exercise demo')}" loading="eager"
        class="demo-frame__visible demo-frame__anim"
        onerror="if (window.onDemoWebpError) window.onDemoWebpError(this);" />
    </div>`;
  } else if (urls.length) {
    const imgs = urls.map((src, i) =>
      `<img src="${src}" alt="${escapeHtmlRunner(ex.name || 'Exercise demo')}" loading="eager" class="${i === 0 ? 'demo-frame__visible' : ''}" data-demo-idx="${i}" onerror="this.dataset.broken='1'; if (window.onDemoImgError) window.onDemoImgError(this);" />`
    ).join('');
    frame = `<div class="demo-frame" data-demo-flip="${urls.length > 1 ? '1' : '0'}">${imgs}</div>`;
  } else {
    frame = `<div class="demo-frame demo-frame--placeholder" aria-hidden="true">ðŸ‹ï¸</div>`;
  }

  const actions = [];
  const demo = ex.demoUrl || '';
  const isExRx = /exrx\.net/i.test(demo);
  if (demo) {
    actions.push(
      isExRx
        ? `<a href="${demo}" target="_blank" rel="noopener">ExRx form page</a>`
        : `<a href="${demo}" target="_blank" rel="noopener">Video search</a>`
    );
  }
  if (ex.name) {
    const q = encodeURIComponent(ex.name + ' exercise form');
    const yt = `https://www.youtube.com/results?search_query=${q}`;
    if (!demo || isExRx) {
      actions.push(`<a href="${yt}" target="_blank" rel="noopener">YouTube</a>`);
    }
  }

  return `
    <div class="demo-panel${compact ? ' demo-panel--rest' : ''}">
      ${frame}
      ${cue}
      ${actions.length ? `<div class="demo-actions">${actions.join('')}</div>` : ''}
    </div>`;
}

function escapeHtmlRunner(str) {
  return window.escapeHtml ? window.escapeHtml(str) : (str ? String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : '');
}

window.onDemoImgError = function onDemoImgError(img) {
  const frame = img.closest('.demo-frame');
  if (!frame) return;
  const imgs = [...frame.querySelectorAll('img')].filter(el => el.dataset.broken !== '1');
  if (!imgs.length) {
    frame.classList.add('demo-frame--placeholder');
    frame.innerHTML = 'ðŸ‹ï¸';
    return;
  }
  // Keep flipping only valid frames
  imgs[0].classList.add('demo-frame__visible');
  startDemoFlip(frame);
};

/** Animated WebP missing â†’ fall back to free-exercise-db still flip. */
window.onDemoWebpError = function onDemoWebpError(img) {
  const frame = img.closest('.demo-frame');
  if (!frame) return;
  const raw = frame.getAttribute('data-stills') || '';
  const stills = raw.split('|').map(s => {
    try { return decodeURIComponent(s); } catch { return s; }
  }).filter(Boolean);
  if (!stills.length) {
    frame.classList.add('demo-frame--placeholder');
    frame.innerHTML = 'ðŸ‹ï¸';
    return;
  }
  frame.classList.remove('demo-frame--anim');
  frame.dataset.demoFlip = stills.length > 1 ? '1' : '0';
  frame.innerHTML = stills.map((src, i) =>
    `<img src="${src}" alt="" loading="eager" class="${i === 0 ? 'demo-frame__visible' : ''}" data-demo-idx="${i}" onerror="this.dataset.broken='1'; if (window.onDemoImgError) window.onDemoImgError(this);" />`
  ).join('');
  startDemoFlip(frame);
};

function stopDemoFlip() {
  if (demoFlipInterval) {
    clearInterval(demoFlipInterval);
    demoFlipInterval = null;
  }
}

function startDemoFlip(root) {
  stopDemoFlip();
  const frames = root
    ? [root]
    : [...document.querySelectorAll('.demo-frame[data-demo-flip="1"]')];
  const flippers = frames.filter(f => f && f.dataset.demoFlip === '1');
  if (!flippers.length) return;

  demoFlipInterval = setInterval(() => {
    flippers.forEach(frame => {
      const imgs = [...frame.querySelectorAll('img')].filter(el => el.dataset.broken !== '1');
      if (imgs.length < 2) return;
      const active = imgs.findIndex(el => el.classList.contains('demo-frame__visible'));
      const next = (active + 1) % imgs.length;
      imgs.forEach((el, i) => el.classList.toggle('demo-frame__visible', i === next));
    });
  }, 900);
}

function setWorkChromeMode() {
  if (workTimerBlock) workTimerBlock.classList.remove('hidden');
  if (previewBlock) previewBlock.classList.add('hidden');
  if (completeSetBtn) completeSetBtn.classList.remove('hidden');
  if (document.getElementById('pauseBtn')) {
    document.getElementById('pauseBtn').classList.remove('hidden');
  }
  document.body.classList.add('work-phase');
}

/** Estimate target reps for logging (midpoint of range when possible). */
function estimateTargetReps(ex) {
  const m = String(ex.repsDisplay || '').match(/(\d+)\s*-\s*(\d+)/);
  if (m) return Math.round((parseInt(m[1], 10) + parseInt(m[2], 10)) / 2);
  const n = String(ex.repsDisplay || '').match(/(\d+)/);
  return n ? parseInt(n[1], 10) : 0;
}

function fillExerciseHeader(ex) {
  exerciseNameEl.textContent = ex.name;
  exerciseMetaEl.textContent = setWorkLabel(ex);
  if (isMobilityExercise(ex)) {
    setBadgeEl.textContent = movePhase === 'warmup' ? 'Warm-up' : 'Cool-down';
    workCueEl.textContent = ex.progression || (movePhase === 'warmup' ? 'Move easily â€” prepare the muscles' : 'Breathe and ease tension');
    completeSetBtn.textContent = 'Done with this move';
  } else {
    setBadgeEl.textContent = `Set ${currentSetIndex + 1} / ${ex.sets}`;
    workCueEl.textContent = `Aim for ${ex.repsDisplay || 'your target'} reps this set`;
    completeSetBtn.textContent = 'Finish set early';
  }
  if (demoLinkEl) {
    demoLinkEl.innerHTML = exerciseMediaHtml(ex);
    startDemoFlip(demoLinkEl);
  }
}

// Preview phase removed — functions kept as no-ops for call-site compatibility
function shouldPreviewMove() { return false; }
function showMovePreview() { }
function beginSetFromPreview() { }

function enterWork(resuming = false) {
  const ex = currentExercise();

  phase = 'work';
  phaseDurationSeconds = workSeconds(ex);
  setWorkChromeMode();
  lastSpokenSecondKey = '';

  if (!resuming) {
    phaseStartTime = Date.now();
    elapsedPhaseSeconds = 0;
    announcePhase('work');
  } else {
    elapsedPhaseSeconds = Math.floor((Date.now() - phaseStartTime) / 1000);
  }

  fillExerciseHeader(ex);

  const remaining = Math.max(0, phaseDurationSeconds - elapsedPhaseSeconds);
  timerDisplayEl.textContent = formatTime(remaining);
  updatePhaseProgressBar(workProgressBar, remaining, phaseDurationSeconds);

  updateProgress();
  startTimer();
  saveSessionState();
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 250);
}

function updatePhaseProgressBar(bar, remaining, total) {
  if (!bar || !total) return;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  bar.style.width = `${pct}%`;
}

function tick() {
  if (isPaused) return;
  elapsedPhaseSeconds = Math.floor((Date.now() - phaseStartTime) / 1000);
  const remaining = Math.max(0, phaseDurationSeconds - elapsedPhaseSeconds);

  if (phase === 'work') {
    timerDisplayEl.textContent = formatTime(remaining);
    updatePhaseProgressBar(workProgressBar, remaining, phaseDurationSeconds);
    maybeCountdownCue('work', remaining);
    if (remaining === 0) {
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
      completeSet(false);
    }
  } else if (phase === 'rest') {
    restTimerEl.textContent = formatTime(remaining);
    updatePhaseProgressBar(restProgressBar, remaining, phaseDurationSeconds);
    maybeCountdownCue('rest', remaining);
    if (remaining === 0) {
      if (navigator.vibrate) navigator.vibrate(50);
      endRest();
    }
  }
}

/**
 * @param {boolean} early - user finished before the timer
 */
function completeSet(early = false) {
  if (isPaused || phase !== 'work') return;
  stopDemoFlip();
  const ex = currentExercise();
  const duration = Math.min(elapsedPhaseSeconds, phaseDurationSeconds);

  clearInterval(timerInterval);
  if (navigator.vibrate) navigator.vibrate(40);

  ex.completedSets.push({
    reps: estimateTargetReps(ex),
    durationSeconds: Math.max(1, duration || phaseDurationSeconds)
  });
  saveSessionState();

  const isLastSet = currentSetIndex + 1 >= ex.sets;
  const isLastExercise = currentExerciseIndex + 1 >= sessionExercises.length;

  if (isLastSet && isLastExercise) {
    finishWorkout();
    return;
  }

  if (isLastSet) {
    currentExerciseIndex++;
    currentSetIndex = 0;
  } else {
    currentSetIndex++;
  }

  enterRest();
}

function enterRest() {
  document.body.classList.remove('work-phase');
  phase = 'rest';
  phaseStartTime = Date.now();
  elapsedPhaseSeconds = 0;
  lastSpokenSecondKey = '';
  stopDemoFlip();
  announcePhase('rest');

  // Rest uses the exercise we're about to do (already advanced set index)
  const nextEx = currentExercise();
  // Rest duration comes from the exercise we just finished when possible
  const prevIdx = currentSetIndex === 0 ? currentExerciseIndex - 1 : currentExerciseIndex;
  const restSource = sessionExercises[Math.max(0, prevIdx)] || nextEx;
  phaseDurationSeconds = restSeconds(restSource);

  nextExerciseNameEl.textContent = nextEx.name;
  if (isMobilityExercise(nextEx)) {
    const p = exercisePhase(nextEx);
    nextExerciseMetaEl.textContent = p === 'warmup'
      ? `Next warm-up Â· ${workSeconds(nextEx)}s`
      : `Next cool-down Â· ${workSeconds(nextEx)}s`;
  } else {
    const unit = selectedDay?.sessionStyle === 'hiit' ? 'Round' : 'Set';
    nextExerciseMetaEl.textContent = `${unit} ${currentSetIndex + 1} / ${nextEx.sets} Â· ${nextEx.repsDisplay || 'target'} Â· ${workSeconds(nextEx)}s work`;
  }
  if (nextDemoEl) {
    nextDemoEl.innerHTML = exerciseMediaHtml(nextEx, { compact: true });
    startDemoFlip(nextDemoEl);
  }
  restTimerEl.textContent = formatTime(phaseDurationSeconds);
  updatePhaseProgressBar(restProgressBar, phaseDurationSeconds, phaseDurationSeconds);

  if (musicEngine.isPlaying) musicEngine.setVolume(0.35);
  showScreen(restScreen);
  startTimer();
  saveSessionState();
}

function endRest() {
  if (isPaused) return;
  clearInterval(timerInterval);
  if (musicEngine.isPlaying) musicEngine.setVolume(1.0);
  if (navigator.vibrate) navigator.vibrate(30);
  showScreen(activeScreen);
  enterWork();
}

function movesListHtml() {
  if (!sessionExercises.length) return '<p class="text-sm text-gray-600">No moves in this session.</p>';
  const isHiit = selectedDay?.sessionStyle === 'hiit';
  return sessionExercises.map((ex, i) => {
    const movePhase = exercisePhase(ex);
    const isCurrent = i === currentExerciseIndex;
    const isDone = (ex.completedSets?.length || 0) >= (ex.sets || 1);
    const isWarmCool = movePhase === 'warmup' || movePhase === 'cooldown';
    let meta;
    if (isWarmCool) {
      meta = `${workSeconds(ex)}s`;
    } else if (isHiit) {
      meta = `${ex.sets} rounds · ${ex.repsDisplay || workSeconds(ex) + 's'} · ${restSeconds(ex)}s rest`;
    } else {
      meta = `${ex.sets} sets · ${ex.repsDisplay || 'target reps'} · ${restSeconds(ex)}s rest`;
    }
    const tag = isWarmCool
      ? (movePhase === 'warmup' ? 'Warm-up' : 'Cool-down')
      : (isHiit ? 'HIIT' : 'Work');
    const tagClass = isWarmCool ? 'moves-item__tag--warmup' : 'moves-item__tag--work';
    return `<div class="moves-item ${isCurrent ? 'moves-item--current' : ''} ${isDone ? 'moves-item--done' : ''}">
      <span class="moves-item__idx">${i + 1}</span>
      <div class="moves-item__body">
        <div class="moves-item__name">${escapeHtmlRunner(ex.name)}</div>
        <div class="moves-item__meta">${escapeHtmlRunner(meta)}</div>
      </div>
      <span class="moves-item__tag ${tagClass}">${tag}</span>
    </div>`;
  }).join('');
}

function openMovesList() {
  if (!movesList || !sessionExercises.length) return;
  movesList.innerHTML = movesListHtml();
  if (movesListModal) movesListModal.classList.remove('hidden');
}

function closeMovesList() {
  if (movesListModal) movesListModal.classList.add('hidden');
}

function skipCurrentExercise() {
  if (phase !== 'work' && phase !== 'rest') return;
  if (sessionExercises.length === 0) return;

  // Mark any incomplete sets as skipped (0 reps)
  const ex = currentExercise();
  if (ex && ex.completedSets.length < ex.sets) {
    const remaining = ex.sets - ex.completedSets.length;
    for (let i = 0; i < remaining; i++) {
      ex.completedSets.push({ reps: 0, durationSeconds: 0 });
    }
  }

  currentExerciseIndex++;
  currentSetIndex = 0;

  if (currentExerciseIndex >= sessionExercises.length) {
    finishWorkout();
    return;
  }

  // Show a brief toast
  if (typeof showToast === 'function') showToast('Skipped — next exercise', 'info');
  
  enterRest();
}

function goBackExercise() {
  if (phase !== 'work' && phase !== 'rest') return;
  if (currentExerciseIndex <= 0) return;

  // Clear completed sets on the current exercise so we can redo it
  const ex = currentExercise();
  if (ex) ex.completedSets = [];

  currentExerciseIndex--;
  currentSetIndex = 0;

  if (typeof showToast === 'function') showToast('Going back', 'info');
  
  // If we're in rest phase, restart rest for the previous exercise
  if (phase === 'rest') {
    clearInterval(timerInterval);
  }
  enterWork();
}

function finishWorkout() {
  markDayCompleted();
  document.body.classList.remove('work-phase');
  phase = 'finish';
  clearInterval(timerInterval);
  stopDemoFlip();
  stopAudioKeepAlive();
  musicEngine.stop();
  releaseWakeLock();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  clearSessionState();
  updateProgress();
  if (typeof setWorkoutChromeVisible === 'function') setWorkoutChromeVisible(true);
  setTvMode(false);

  beep(660, 0.15);
  setTimeout(() => beep(880, 0.2), 180);
  speakCue('Workout complete');

  const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
  const totalSets = sessionExercises.reduce((sum, ex) => sum + ex.completedSets.length, 0);
  const workSecondsTotal = sessionExercises.reduce(
    (sum, ex) => sum + ex.completedSets.reduce((s, set) => s + (set.durationSeconds || 0), 0),
    0
  );

  finishSummaryEl.innerHTML = `
    Duration: <strong>${formatTime(totalSeconds)}</strong><br/>
    Sets completed: <strong>${totalSets}</strong><br/>
    Active work time: <strong>${formatTime(workSecondsTotal)}</strong>
  `;

  // Anatomical summary of the muscles worked this session
  const finishMusclesEl = document.getElementById('finishMuscles');
  if (finishMusclesEl && typeof MuscleDiagram !== 'undefined' && sessionExercises.length) {
    const primarySet = [...new Set(sessionExercises.flatMap(e => e.primary || []))];
    const secondarySet = [...new Set(sessionExercises.flatMap(e => e.secondary || []))];
    finishMusclesEl.innerHTML =
      '<h3 class="text-sm font-semibold text-blue-900 mb-3">Muscles worked</h3>' +
      MuscleDiagram.render(primarySet, secondarySet) +
      '<div class="text-xs text-gray-500 mt-2"><span class="swatch swatch-worked"></span>Primary&nbsp;&nbsp;' +
      '<span class="swatch swatch-secondary"></span>Supporting</div>';
  }

  // Auto-save when signed in; prompt sign-in otherwise
  if (saveSessionArea) saveSessionArea.classList.remove('hidden');
  if (saveSessionBtn) {
    saveSessionBtn.classList.add('hidden');
    saveSessionBtn.disabled = false;
    saveSessionBtn.textContent = 'Retry save';
  }
  if (signInToSaveLink) signInToSaveLink.classList.add('hidden');

  if (currentUser) {
    if (saveSessionStatus) {
      saveSessionStatus.textContent = 'Saving your session to historyâ€¦';
      saveSessionStatus.className = 'text-sm mb-2 text-gray-600';
      saveSessionStatus.classList.remove('hidden');
    }
    // Fire-and-forget; UI updates when done
    saveSession({ auto: true });
  } else if (saveSessionStatus) {
    saveSessionStatus.textContent = 'Signed-out sessions arenâ€™t stored in History. Sign in next time for auto-save.';
    saveSessionStatus.className = 'text-sm mb-2 text-amber-800';
    if (signInToSaveLink) signInToSaveLink.classList.remove('hidden');
  }

  showScreen(finishScreen);
}

async function saveSession(options = {}) {
  if (sessionSaved) return;
  if (!currentUser) {
    if (saveSessionStatus) {
      saveSessionStatus.textContent = 'Sign in to save this workout to History.';
      saveSessionStatus.className = 'text-sm mb-2 text-amber-800';
    }
    if (signInToSaveLink) signInToSaveLink.classList.remove('hidden');
    return;
  }

  if (saveSessionStatus) {
    saveSessionStatus.textContent = 'Saving your session to historyâ€¦';
    saveSessionStatus.className = 'text-sm mb-2 text-gray-600';
  }
  if (saveSessionBtn) {
    saveSessionBtn.classList.add('hidden');
    saveSessionBtn.disabled = true;
  }

  const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
  const payload = {
    planName: sessionPlanName,
    savedPlanId: currentSavedPlanId,
    week: selectedWeek || 1,
    dayIndex: selectedDayIndex || 0,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    durationSeconds: totalSeconds,
    exercises: sessionExercises.map(ex => ({
      exerciseId: ex.id,
      exerciseName: ex.name,
      targetSets: ex.sets,
      sets: ex.completedSets.map(s => ({
        reps: s.reps,
        durationSeconds: s.durationSeconds
      }))
    }))
  };

  try {
    const res = await fetch('/api/runner/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Server error');
    sessionSaved = true;
    if (saveSessionBtn) {
      saveSessionBtn.classList.add('hidden');
      saveSessionBtn.disabled = true;
    }
    if (saveSessionStatus) {
      saveSessionStatus.textContent = 'Saved to your history automatically.';
      saveSessionStatus.className = 'text-sm mb-2 text-green-700 font-medium';
    }
    if (typeof showToast === 'function') showToast('Session saved to your history.', 'success');
  } catch (err) {
    if (saveSessionStatus) {
      saveSessionStatus.textContent = `Could not auto-save: ${err.message}. Tap Retry.`;
      saveSessionStatus.className = 'text-sm mb-2 text-red-600';
    }
    if (saveSessionBtn) {
      saveSessionBtn.classList.remove('hidden');
      saveSessionBtn.disabled = false;
      saveSessionBtn.textContent = 'Retry save';
    }
    if (typeof showToast === 'function') showToast(`Could not save session: ${err.message}`, 'error');
  }
}

// -------------------------- Music --------------------------

function toggleMusic() {
  if (musicEngine.isPlaying) {
    musicEngine.stop();
  } else if (shouldAutoStartMusic()) {
    musicEngine.start();
  }
  updateMusicButton();
}

function updateMusicButton() {
  if (nowPlayingEl) {
    if (currentMusicStyle() === 'device') {
      nowPlayingEl.textContent = 'Using your own music app';
    } else if (musicEngine.isPlaying) {
      nowPlayingEl.textContent = musicEngine.nowPlayingLabel() || 'Playingâ€¦';
    } else {
      nowPlayingEl.textContent = currentMusicStyle() === 'off' ? 'Music off' : 'Music paused';
    }
  }
}

function toggleFullscreen() {
  const docEl = document.documentElement;
  if (!document.fullscreenElement) {
    docEl.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function toggleHighContrast() {
  document.body.classList.toggle('high-contrast');
  const on = document.body.classList.contains('high-contrast');
  localStorage.setItem('runnerHighContrast', on ? '1' : '0');
  if (contrastBtn) {
    contrastBtn.classList.toggle('bg-blue-100', on);
    contrastBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    contrastBtn.title = on ? 'Dark mode on (tap for light)' : 'Dark / high-contrast mode';
  }
  // Keep browser chrome in sync when possible
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', on ? '#0b0f14' : '#1e3a8a');
  if (typeof showToast === 'function') {
    showToast(on ? 'Dark mode on' : 'Dark mode off', 'info', 1600);
  }
}

function updateProgress() {
  if (!sessionExercises.length) {
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    return;
  }
  const totalSets = sessionExercises.reduce((sum, ex) => sum + ex.sets, 0);
  const completedSets = sessionExercises.reduce((sum, ex) => sum + ex.completedSets.length, 0);
  const percent = Math.min(100, Math.round((completedSets / totalSets) * 100));
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
}

// -------------------------- Helpers --------------------------

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// -------------------------- Voice + beeps --------------------------

function initVoiceCuesToggle() {
  if (!voiceCuesToggle) return;
  const stored = localStorage.getItem('runnerVoiceCues');
  voiceCuesToggle.checked = stored !== '0';
  voiceCuesToggle.addEventListener('change', () => {
    localStorage.setItem('runnerVoiceCues', voiceCuesToggle.checked ? '1' : '0');
    if (!voiceCuesToggle.checked) stopSpeech();
  });
}

function voiceCuesEnabled() {
  if (voiceCuesToggle) return !!voiceCuesToggle.checked;
  return localStorage.getItem('runnerVoiceCues') !== '0';
}

function stopSpeech() {
  try {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  } catch { /* ignore */ }
}

/**
 * Short spoken cue. Cancels prior utterance so countdown stays crisp.
 */
function speakCue(text) {
  if (!voiceCuesEnabled() || !text) return;
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 1.08;
    u.pitch = 1.0;
    u.volume = 1.0;
    const voices = window.speechSynthesis.getVoices() || [];
    const en = voices.find(v => /^en(-|_)/i.test(v.lang)) || voices.find(v => /en/i.test(v.lang));
    if (en) u.voice = en;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore speech errors
  }
}

/**
 * Countdown in last 3 seconds of preview / work / rest: rising beeps + spoken 3, 2, 1.
 */
function maybeCountdownCue(phaseName, remaining) {
  if (remaining < 1 || remaining > 3) return;
  const key = `${phaseName}:${remaining}`;
  if (key === lastSpokenSecondKey) return;
  lastSpokenSecondKey = key;

  // Rising pitch: 3 â†’ lower, 1 â†’ higher (final second slightly longer)
  const freq = remaining === 3 ? 560 : remaining === 2 ? 700 : 880;
  beep(freq, remaining === 1 ? 0.2 : 0.12, 0.7);
  speakCue(String(remaining));
}

/** Distinct start cue for work vs rest phases. */
function announcePhase(kind) {
  lastSpokenSecondKey = '';
  if (kind === 'work') {
    // Clear double-beep "GO"
    beep(1245, 0.28, 0.7);
    setTimeout(() => beep(1568, 0.16, 0.6), 150);
    speakCue('Work');
  } else if (kind === 'rest') {
    beep(784, 0.28, 0.7);
    setTimeout(() => beep(587, 0.24, 0.6), 160);
    speakCue('Rest');
  }
}

function getAudioContext() {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Browsers (notably iOS/Android) suspend the AudioContext when the tab or
 * screen goes idle, and resume() needs a user gesture in some cases. Hook
 * taps so timer beeps keep coming back even mid-workout.
 */
function unlockAudioOnGesture() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    // ignore
  }
}
document.addEventListener('pointerdown', unlockAudioOnGesture);
document.addEventListener('touchstart', unlockAudioOnGesture);

let audioKeepAliveInterval = null;
function startAudioKeepAlive() {
  clearInterval(audioKeepAliveInterval);
  audioKeepAliveInterval = setInterval(() => {
    const ctx = sharedAudioCtx;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }, 4000);
}
function stopAudioKeepAlive() {
  clearInterval(audioKeepAliveInterval);
  audioKeepAliveInterval = null;
}

async function beep(frequency = 880, duration = 0.15, volume = 0.7) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    if (ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  } catch {
    // ignore audio errors
  }
}

/**
 * Verify audio before a session: unlocks the AudioContext on the button tap
 * and plays the same cue sounds the timers use.
 */
function testSound() {
  getAudioContext();
  beep(1245, 0.25, 0.7);
  setTimeout(() => beep(880, 0.2, 0.7), 300);
  setTimeout(() => beep(660, 0.3, 0.7), 600);
  setTimeout(() => speakCue('Test'), 150);
}

// -------------------------- TV / cast mode --------------------------

function openCastModal() {
  // Second tap on TV while already in TV mode turns it off
  if (document.body.classList.contains('tv-mode')) {
    setTvMode(false);
    if (typeof showToast === 'function') showToast('TV mode off', 'info');
    return;
  }
  if (!castModal) {
    setTvMode(true);
    return;
  }
  castModal.classList.remove('hidden');
}

function closeCastModal() {
  castModal?.classList.add('hidden');
}

function setTvMode(on) {
  document.body.classList.toggle('tv-mode', !!on);
  if (tvModeBtn) {
    tvModeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    tvModeBtn.classList.toggle('bg-blue-100', !!on);
    tvModeBtn.title = on ? 'TV mode on (tap for cast tips / off)' : 'TV mode & cast tips';
  }
  if (on && typeof setWorkoutChromeVisible === 'function') {
    // Hide bottom nav while training in TV mode
    if (phase !== 'setup' && phase !== 'finish') setWorkoutChromeVisible(false);
  }
}

// -------------------------- Music engine (playlist) --------------------------

class PlaylistMusicEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.loop = false;
    this.isPlaying = false;
    this.baseVolume = 0.35;
    this.currentVolume = 1.0;
    this.style = 'drive';
    this.catalog = { styles: [] };
    this.queue = [];
    this.trackIndex = 0;
    this._usingFallback = false;

    this.audio.addEventListener('ended', () => this.nextTrack());
    this.audio.addEventListener('error', () => this._onError());
  }

  async loadCatalog() {
    try {
      const res = await fetch('/music/catalog.json');
      if (res.ok) this.catalog = await res.json();
    } catch {
      this.catalog = { styles: [] };
    }
  }

  setStyle(style) {
    const next = (style || 'off').toLowerCase();
    const changed = next !== this.style;
    this.style = next;
    this._buildQueue();
    if (changed && this.isPlaying) {
      this.stop();
      if (this._canPlayBuiltIn()) this.start();
    }
  }

  _canPlayBuiltIn() {
    return this.style !== 'off' && this.style !== 'device' && this.queue.length > 0;
  }

  _buildQueue() {
    const style = (this.catalog.styles || []).find(s => s.id === this.style);
    this.queue = style?.tracks ? style.tracks.slice() : [];
    // light shuffle
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.trackIndex = 0;
    this._usingFallback = false;
  }

  start() {
    if (!this._canPlayBuiltIn()) {
      this.isPlaying = false;
      return;
    }
    if (this.queue.length === 0) this._buildQueue();
    this._playCurrent();
  }

  _playCurrent() {
    if (!this.queue.length) {
      this.isPlaying = false;
      return;
    }
    const track = this.queue[this.trackIndex % this.queue.length];
    const src = this._usingFallback && track.fallback ? track.fallback : track.src;
    this.audio.src = src;
    this.audio.volume = Math.max(0, Math.min(1, this.baseVolume * this.currentVolume));
    this.audio.play().then(() => {
      this.isPlaying = true;
      updateMusicButton();
    }).catch(() => {
      // Autoplay blocked or file missing â€” try fallback once
      if (!this._usingFallback && track.fallback) {
        this._usingFallback = true;
        this._playCurrent();
      } else {
        this.isPlaying = false;
        updateMusicButton();
      }
    });
  }

  _onError() {
    const track = this.queue[this.trackIndex % this.queue.length];
    if (!this._usingFallback && track?.fallback) {
      this._usingFallback = true;
      this._playCurrent();
      return;
    }
    this.nextTrack();
  }

  nextTrack() {
    if (!this.queue.length) return;
    this.trackIndex = (this.trackIndex + 1) % this.queue.length;
    this._usingFallback = false;
    if (this.isPlaying || !this.audio.paused) this._playCurrent();
  }

  stop() {
    try {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    } catch { /* ignore */ }
    this.isPlaying = false;
    updateMusicButton();
  }

  setVolume(scale) {
    this.currentVolume = Math.max(0, Math.min(1, scale));
    this.audio.volume = Math.max(0, Math.min(1, this.baseVolume * this.currentVolume));
  }

  setBaseVolume(vol) {
    this.baseVolume = Math.max(0, Math.min(1, vol));
    this.audio.volume = Math.max(0, Math.min(1, this.baseVolume * this.currentVolume));
  }

  nowPlayingLabel() {
    if (!this.queue.length) return '';
    const track = this.queue[this.trackIndex % this.queue.length];
    const style = (this.catalog.styles || []).find(s => s.id === this.style);
    return `${style?.name || this.style}: ${track.title || track.id}`;
  }
}
