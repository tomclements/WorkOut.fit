let currentPlan = null;
let currentUser = null;
let selectedDay = null;
let sessionExercises = [];
let currentExerciseIndex = 0;
let currentSetIndex = 0;
let phase = 'setup'; // setup | preview | work | rest | finish
let startTime = null;
let phaseStartTime = null;
let elapsedPhaseSeconds = 0;
let phaseDurationSeconds = 30;
let timerInterval = null;
let demoFlipInterval = null;
const PREVIEW_SECONDS = 8;
let musicEngine = null;
let sessionSaved = false;
let wakeLock = null;
let sessionPlanName = 'Plan4Strength';
let currentSavedPlanId = null;
let currentSavedPlanName = null;
let isPaused = false;
let autoPaused = false;
let pauseStartTime = 0;

const setupScreen = document.getElementById('setupScreen');
const activeScreen = document.getElementById('activeScreen');
const restScreen = document.getElementById('restScreen');
const finishScreen = document.getElementById('finishScreen');

const daySelect = document.getElementById('daySelect');
const startBtn = document.getElementById('startBtn');
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
const workTimerBlock = document.getElementById('workTimerBlock');
const previewBlock = document.getElementById('previewBlock');
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

  await checkAuth();
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
  document.getElementById('restPauseBtn').addEventListener('click', () => pauseWorkout(false));
  document.getElementById('resumeWorkoutBtn').addEventListener('click', resumeWorkout);
  document.getElementById('restResumeWorkoutBtn').addEventListener('click', resumeWorkout);
  document.getElementById('volumeSlider').addEventListener('input', onVolumeChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  const closeCast = () => closeCastModal();
  document.getElementById('closeCastModal')?.addEventListener('click', closeCast);
  document.getElementById('dismissCastModal')?.addEventListener('click', closeCast);
  document.getElementById('enableTvModeBtn')?.addEventListener('click', () => {
    setTvMode(true);
    closeCastModal();
    if (typeof showToast === 'function') {
      showToast('TV mode on â€” mirror this screen with AirPlay or Cast tab.', 'info', 4500);
    }
  });
  castModal?.addEventListener('click', (e) => {
    if (e.target === castModal) closeCastModal();
  });

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

  // Space / Enter: start set from preview, skip work/rest otherwise
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (phase === 'preview') {
      e.preventDefault();
      beginSetFromPreview();
    } else if (phase === 'work') {
      e.preventDefault();
      completeSet(true);
    } else if (phase === 'rest') {
      e.preventDefault();
      endRest();
    }
  });
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.email;
      userLabel.textContent = currentUser;
    }
  } catch {
    // ignore
  }
}

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

  // Inject warm-up / cool-down if this plan was saved without them
  if (typeof WorkoutMobility !== 'undefined' && currentPlan) {
    if (WorkoutMobility.ensurePlanMobility(currentPlan)) {
      try {
        if (!planId) localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
      } catch { /* ignore */ }
    }
  }

  populateDaySelect();
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
      option.value = JSON.stringify({ week: week.week, dayIndex: idx });
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

function checkForResumableSession() {
  const saved = localStorage.getItem('workoutSession');
  if (saved) {
    resumeBanner.classList.remove('hidden');
  }
}

function saveSessionState() {
  if (phase !== 'work' && phase !== 'rest' && phase !== 'preview') return;
  const state = {
    phase,
    currentExerciseIndex,
    currentSetIndex,
    startTime,
    phaseStartTime,
    phaseDurationSeconds,
    sessionExercises,
    planName: currentPlan?.criteria
      ? `${currentPlan.criteria.weeks}-week ${currentPlan.criteria.goal} plan`
      : 'Plan4Strength'
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
    phase = state.phase;
    startTime = state.startTime;
    phaseStartTime = state.phaseStartTime || Date.now();
    phaseDurationSeconds = state.phaseDurationSeconds || 30;
    sessionSaved = false;
    sessionPlanName = state.planName || 'Plan4Strength';

    await requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (shouldAutoStartMusic()) {
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
    } else if (phase === 'preview') {
      showScreen(activeScreen);
      showMovePreview();
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

  const selection = JSON.parse(daySelect.value);
  selectedDay = currentPlan.plan.find(w => w.week === selection.week).days[selection.dayIndex];
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
  if (phase === 'work' || phase === 'rest' || phase === 'preview') {
    e.preventDefault();
    e.returnValue = '';
  }
}

function pauseWorkout(auto = false) {
  if (isPaused || (phase !== 'work' && phase !== 'rest' && phase !== 'preview')) return;
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
  if (musicEngine.isPlaying) musicEngine.setVolume(1.0);
  startTimer();
  updatePauseUI();
}

function updatePauseUI() {
  const pausedOverlay = document.getElementById('pausedOverlay');
  const restPausedOverlay = document.getElementById('restPausedOverlay');
  const pauseBtn = document.getElementById('pauseBtn');
  const restPauseBtn = document.getElementById('restPauseBtn');

  pausedOverlay.classList.toggle('hidden', !isPaused);
  restPausedOverlay.classList.toggle('hidden', !isPaused);
  pauseBtn.classList.toggle('hidden', isPaused);
  restPauseBtn.classList.toggle('hidden', isPaused);
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
    // Restart demo flip after tab focus (timers may throttle)
    if (phase === 'work' || phase === 'preview') startDemoFlip(demoLinkEl);
    if (phase === 'rest') startDemoFlip(nextDemoEl);
  }
}

function showScreen(screen) {
  [setupScreen, activeScreen, restScreen, finishScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');

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

function escapeHtmlRunner(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function setWorkChromeMode(mode) {
  // mode: 'preview' | 'work'
  const isPreview = mode === 'preview';
  if (workTimerBlock) workTimerBlock.classList.toggle('hidden', isPreview);
  if (previewBlock) previewBlock.classList.toggle('hidden', !isPreview);
  if (demoLinkEl) demoLinkEl.classList.toggle('hidden', !isPreview);
  if (completeSetBtn) completeSetBtn.classList.toggle('hidden', isPreview);
  var p = document.getElementById('pauseBtn');
  if (p) p.classList.toggle('hidden', isPreview);
  document.body.classList.toggle('work-phase', !isPreview);
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
  // Must not shadow global `phase` (setup|work|rest|finish) â€” that broke the timer.
  const movePhase = exercisePhase(ex);
  const phaseLabelEl = document.getElementById('workPhaseLabel');
  if (phaseLabelEl) {
    if (movePhase === 'warmup') {
      phaseLabelEl.textContent = 'Warm-up';
      phaseLabelEl.className = 'text-xs font-semibold uppercase tracking-wider text-amber-700';
    } else if (movePhase === 'cooldown') {
      phaseLabelEl.textContent = 'Cool-down';
      phaseLabelEl.className = 'text-xs font-semibold uppercase tracking-wider text-teal-700';
    } else {
      phaseLabelEl.textContent = 'Work';
      phaseLabelEl.className = 'text-xs font-semibold uppercase tracking-wider text-green-700';
    }
  }
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

/**
 * Before the first set of each new move, show a short in-runner demo
 * so form is clear without leaving the app.
 */
function shouldPreviewMove(ex, resuming) {
  if (resuming) return false;
  if (currentSetIndex !== 0) return false;
  // Always preview new exercises (even without images â€” cue text still helps)
  return !!ex;
}

function showMovePreview() {
  const ex = currentExercise();
  phase = 'preview';
  clearInterval(timerInterval);
  isPaused = false;
  fillExerciseHeader(ex);
  setWorkChromeMode('preview');

  const phaseLabelEl = document.getElementById('workPhaseLabel');
  if (phaseLabelEl) {
    phaseLabelEl.textContent = 'Demo';
    phaseLabelEl.className = 'text-xs font-semibold uppercase tracking-wider text-blue-700';
  }
  workCueEl.textContent = isMobilityExercise(ex)
    ? (ex.progression || 'Watch the movement, then begin')
    : `Get set for ${ex.repsDisplay || 'your target'} reps`;
  setBadgeEl.textContent = 'Next move';

  phaseDurationSeconds = PREVIEW_SECONDS;
  phaseStartTime = Date.now();
  elapsedPhaseSeconds = 0;
  lastSpokenSecondKey = '';
  if (previewCountdownEl) previewCountdownEl.textContent = String(PREVIEW_SECONDS);
  // Soft cue that a new move is coming (countdown will speak 3-2-1)
  speakCue('Get ready');

  if (demoLinkEl && ex) {
    var q = encodeURIComponent(ex.name + ' exercise form');
    demoLinkEl.insertAdjacentHTML('beforeend',
      '<a href="https://www.youtube.com/results?search_query=' + q + '" target="_blank" class="block w-full text-center bg-red-100 hover:bg-red-200 text-red-800 font-bold py-3 px-4 rounded-lg mt-2 touch-manipulation">Search form video</a>'
    );
  }

  updateProgress();
  startTimer();
  saveSessionState();
}

function beginSetFromPreview() {
  if (phase !== 'preview') return;
  clearInterval(timerInterval);
  enterWork(false, { skipPreview: true, announce: true });
}

function enterWork(resuming = false, options = {}) {
  const ex = currentExercise();
  if (shouldPreviewMove(ex, resuming) && !options.skipPreview) {
    showMovePreview();
    return;
  }

  phase = 'work';
  phaseDurationSeconds = workSeconds(ex);
  setWorkChromeMode('work');
  lastSpokenSecondKey = '';

  if (!resuming || options.skipPreview) {
    phaseStartTime = Date.now();
    elapsedPhaseSeconds = 0;
    // Announce "Work" when a work interval actually starts (not demo-only)
    if (!resuming && options.announce !== false) {
      announcePhase('work');
    }
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

  if (phase === 'preview') {
    if (previewCountdownEl) previewCountdownEl.textContent = String(remaining);
    maybeCountdownCue('preview', remaining);
    if (remaining === 0) {
      beginSetFromPreview();
    }
  } else if (phase === 'work') {
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
    // Show demo of the *next* move during rest so you're ready
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
  // enterWork announces "Work", or opens a demo preview first
  enterWork();
}

function finishWorkout() {
  document.body.classList.remove('work-phase');
  phase = 'finish';
  clearInterval(timerInterval);
  stopDemoFlip();
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

  // Rising pitch: 3 â†’ lower, 1 â†’ higher
  const freq = remaining === 3 ? 560 : remaining === 2 ? 700 : 880;
  beep(freq, remaining === 1 ? 0.14 : 0.1);
  speakCue(String(remaining));
}

/** Distinct start cue for work vs rest phases. */
function announcePhase(kind) {
  lastSpokenSecondKey = '';
  if (kind === 'work') {
    beep(1200, 0.25);
    speakCue('Work');
  } else if (kind === 'rest') {
    beep(660, 0.25);
    setTimeout(() => beep(550, 0.2), 150);
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

function beep(frequency = 880, duration = 0.15) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.45, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch {
    // ignore audio errors
  }
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
      const res = await fetch('/music/catalog.json?t=' + Date.now(), { cache: 'no-store' });
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
