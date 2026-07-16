let currentPlan = null;
let currentUser = null;
let selectedDay = null;
let sessionExercises = [];
let currentExerciseIndex = 0;
let currentSetIndex = 0;
let phase = 'setup'; // setup | work | rest | finish
let startTime = null;
let phaseStartTime = null;
let elapsedPhaseSeconds = 0;
let repCount = 0;
let timerInterval = null;
let musicEngine = null;
let motionCounter = null;
let sessionSaved = false;
let wakeLock = null;
let voiceEnabled = false;
let voiceInitialized = false;
let sessionPlanName = 'Workout';
let currentSavedPlanId = null;
let currentSavedPlanName = null;

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
const motionToggle = document.getElementById('motionToggle');
const voiceToggle = document.getElementById('voiceToggle');

const exerciseNameEl = document.getElementById('exerciseName');
const exerciseMetaEl = document.getElementById('exerciseMeta');
const setBadgeEl = document.getElementById('setBadge');
const demoLinkEl = document.getElementById('demoLink');
const timerDisplayEl = document.getElementById('timerDisplay');
const repSection = document.getElementById('repSection');
const repCountEl = document.getElementById('repCount');
const sensorStatusEl = document.getElementById('sensorStatus');
const completeSetBtn = document.getElementById('completeSetBtn');
const musicBtn = document.getElementById('musicBtn');
const motionBtn = document.getElementById('motionBtn');
const voiceBtn = document.getElementById('voiceBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const restTimerEl = document.getElementById('restTimer');
const nextExerciseNameEl = document.getElementById('nextExerciseName');
const nextExerciseMetaEl = document.getElementById('nextExerciseMeta');
const skipRestBtn = document.getElementById('skipRestBtn');

const finishSummaryEl = document.getElementById('finishSummary');
const saveSessionArea = document.getElementById('saveSessionArea');
const saveSessionBtn = document.getElementById('saveSessionBtn');
const saveSessionStatus = document.getElementById('saveSessionStatus');
const userLabel = document.getElementById('userLabel');

// -------------------------- Init --------------------------

document.addEventListener('DOMContentLoaded', async () => {
  musicEngine = new MusicEngine();
  motionCounter = new MotionRepCounter(onMotionRep);

  await checkAuth();
  await loadPlan();
  checkForResumableSession();

  startBtn.addEventListener('click', startWorkout);
  resumeBtn.addEventListener('click', resumeSession);
  discardBtn.addEventListener('click', discardSession);
  document.getElementById('repInc').addEventListener('click', () => incrementRep(1));
  document.getElementById('repDec').addEventListener('click', () => incrementRep(-1));
  completeSetBtn.addEventListener('click', completeSet);
  skipRestBtn.addEventListener('click', endRest);
  musicBtn.addEventListener('click', toggleMusic);
  motionBtn.addEventListener('click', toggleMotion);
  voiceBtn.addEventListener('click', toggleVoice);
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  saveSessionBtn.addEventListener('click', saveSession);

  // Keyboard shortcut: space increments reps; enter completes set
  document.addEventListener('keydown', (e) => {
    if (phase !== 'work') return;
    if (e.code === 'Space') {
      e.preventDefault();
      incrementRep(1);
    } else if (e.code === 'Enter') {
      e.preventDefault();
      completeSet();
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
      option.textContent = `Week ${week.week} - ${day.day} (${day.focus})`;
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
  if (phase !== 'work' && phase !== 'rest') return;
  const state = {
    phase,
    currentExerciseIndex,
    currentSetIndex,
    startTime,
    sessionExercises,
    planName: currentPlan?.criteria
      ? `${currentPlan.criteria.weeks}-week ${currentPlan.criteria.goal} plan`
      : 'Workout'
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
    sessionSaved = false;
    sessionPlanName = state.planName || 'Workout';

    await requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (musicToggle.checked) {
      musicEngine.start();
      updateMusicButton();
    }

    if (motionToggle.checked) {
      await motionCounter.start();
      updateMotionButton();
    }

    voiceEnabled = voiceToggle.checked;
    updateVoiceButton();

    resumeBanner.classList.add('hidden');
    clearSessionState();

    showScreen(phase === 'rest' ? restScreen : activeScreen);
    updateProgress();
    if (phase === 'rest') {
      enterRest();
    } else {
      // Restore current set display without resetting timer
      const ex = currentExercise();
      exerciseNameEl.textContent = ex.name;
      exerciseMetaEl.textContent = `${ex.sets} sets × ${ex.repsDisplay} • ${ex.rest}s rest`;
      setBadgeEl.textContent = `Set ${currentSetIndex + 1} / ${ex.sets}`;
      demoLinkEl.innerHTML = ex.demoUrl
        ? `<a href="${ex.demoUrl}" target="_blank" rel="noopener" class="text-sm text-blue-600 hover:underline">Watch demo</a>`
        : '';
      repCount = ex.isTimeBased ? 0 : (ex.completedSets[currentSetIndex]?.reps || 0);
      repCountEl.textContent = repCount;
      if (ex.isTimeBased) {
        repSection.classList.add('hidden');
      } else {
        repSection.classList.remove('hidden');
      }
      completeSetBtn.textContent = ex.isTimeBased ? 'Done' : 'Complete set';
      enterWork();
    }
  } catch {
    clearSessionState();
    resumeBanner.classList.add('hidden');
  }
}

// -------------------------- Session control --------------------------

async function startWorkout() {
  if (!currentPlan) return;

  const selection = JSON.parse(daySelect.value);
  selectedDay = currentPlan.plan.find(w => w.week === selection.week).days[selection.dayIndex];
  sessionExercises = selectedDay.exercises.map(ex => ({ ...ex, completedSets: [] }));
  currentExerciseIndex = 0;
  currentSetIndex = 0;
  phase = 'work';
  startTime = Date.now();
  sessionSaved = false;
  sessionPlanName = currentSavedPlanName
    || (currentPlan.criteria ? `${currentPlan.criteria.weeks}-week ${currentPlan.criteria.goal} plan` : 'Workout');

  await requestWakeLock();
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (musicToggle.checked) {
    musicEngine.start();
    updateMusicButton();
  }

  if (motionToggle.checked) {
    await motionCounter.start();
    updateMotionButton();
  }

  voiceEnabled = voiceToggle.checked;
  updateVoiceButton();
  if (voiceEnabled) {
    initVoice();
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
      // Wake Lock may be denied; continue anyway
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

async function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && phase !== 'setup' && phase !== 'finish') {
    await requestWakeLock();
  }
}

function showScreen(screen) {
  [setupScreen, activeScreen, restScreen, finishScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

function currentExercise() {
  return sessionExercises[currentExerciseIndex];
}

function enterWork() {
  phase = 'work';
  phaseStartTime = Date.now();
  elapsedPhaseSeconds = 0;
  repCount = 0;

  const ex = currentExercise();
  exerciseNameEl.textContent = ex.name;
  exerciseMetaEl.textContent = `${ex.sets} sets × ${ex.repsDisplay} • ${ex.rest}s rest`;
  setBadgeEl.textContent = `Set ${currentSetIndex + 1} / ${ex.sets}`;
  demoLinkEl.innerHTML = ex.demoUrl
    ? `<a href="${ex.demoUrl}" target="_blank" rel="noopener" class="text-sm text-blue-600 hover:underline">Watch demo</a>`
    : '';

  if (ex.isTimeBased) {
    repSection.classList.add('hidden');
    timerDisplayEl.textContent = formatTime(ex.workDuration);
  } else {
    repSection.classList.remove('hidden');
    repCountEl.textContent = '0';
    timerDisplayEl.textContent = '00:00';
  }

  completeSetBtn.textContent = ex.isTimeBased ? 'Done' : 'Complete set';
  completeSetBtn.classList.add('pulse');

  updateProgress();
  speak(`${ex.name}. Set ${currentSetIndex + 1} of ${ex.sets}. ${ex.repsDisplay}.`);

  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function tick() {
  elapsedPhaseSeconds = Math.floor((Date.now() - phaseStartTime) / 1000);
  const ex = currentExercise();

  if (phase === 'work') {
    if (ex.isTimeBased) {
      const remaining = Math.max(0, ex.workDuration - elapsedPhaseSeconds);
      timerDisplayEl.textContent = formatTime(remaining);
      if (remaining === 0) {
        beep(880, 0.2);
        completeSetBtn.classList.remove('pulse');
      }
    } else {
      timerDisplayEl.textContent = formatTime(elapsedPhaseSeconds);
    }
  } else if (phase === 'rest') {
    const remaining = Math.max(0, ex.rest - elapsedPhaseSeconds);
    restTimerEl.textContent = formatTime(remaining);
    if (remaining <= 5 && remaining > 0) {
      beep(660, 0.1);
    } else if (remaining === 0) {
      beep(880, 0.3);
      endRest();
    }
  }
}

function incrementRep(delta) {
  repCount = Math.max(0, repCount + delta);
  repCountEl.textContent = repCount;
  if (navigator.vibrate) navigator.vibrate(30);
  saveSessionState();
}

function onMotionRep() {
  if (phase !== 'work' || currentExercise().isTimeBased) return;
  incrementRep(1);
  sensorStatusEl.textContent = `Sensor rep detected (${repCount})`;
  sensorStatusEl.classList.remove('hidden');
  setTimeout(() => sensorStatusEl.classList.add('hidden'), 1000);
}

function completeSet() {
  if (phase !== 'work') return;
  const ex = currentExercise();
  const duration = ex.isTimeBased
    ? Math.min(elapsedPhaseSeconds, ex.workDuration)
    : elapsedPhaseSeconds;

  if (navigator.vibrate) navigator.vibrate(50);

  ex.completedSets.push({
    reps: ex.isTimeBased ? 0 : repCount,
    durationSeconds: duration
  });
  saveSessionState();

  clearInterval(timerInterval);

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
  phase = 'rest';
  phaseStartTime = Date.now();
  elapsedPhaseSeconds = 0;

  const nextEx = currentExercise();
  nextExerciseNameEl.textContent = nextEx.name;
  nextExerciseMetaEl.textContent = `${nextEx.sets} sets × ${nextEx.repsDisplay}`;
  restTimerEl.textContent = formatTime(nextEx.rest);

  musicEngine.setVolume(0.3);
  showScreen(restScreen);
  startTimer();
  saveSessionState();

  speak(`Rest. Next up: ${nextEx.name}.`);
}

function endRest() {
  clearInterval(timerInterval);
  musicEngine.setVolume(1.0);
  if (navigator.vibrate) navigator.vibrate(30);
  speak('Go!');
  showScreen(activeScreen);
  enterWork();
}

function finishWorkout() {
  phase = 'finish';
  clearInterval(timerInterval);
  musicEngine.stop();
  motionCounter.stop();
  releaseWakeLock();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  clearSessionState();
  updateProgress();
  speak('Workout complete. Great job.');

  const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
  const totalSets = sessionExercises.reduce((sum, ex) => sum + ex.completedSets.length, 0);
  const totalReps = sessionExercises.reduce((sum, ex) => sum + ex.completedSets.reduce((s, set) => s + set.reps, 0), 0);

  finishSummaryEl.innerHTML = `
    Duration: <strong>${formatTime(totalSeconds)}</strong><br/>
    Sets completed: <strong>${totalSets}</strong><br/>
    Reps completed: <strong>${totalReps}</strong>
  `;

  if (currentUser) {
    saveSessionArea.classList.remove('hidden');
  }

  showScreen(finishScreen);
}

async function saveSession() {
  if (sessionSaved || !currentUser) return;

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
    saveSessionBtn.disabled = true;
    saveSessionBtn.textContent = 'Saved';
    saveSessionStatus.textContent = 'Session saved to your history.';
    saveSessionStatus.className = 'text-sm mt-2 text-green-600';
    saveSessionStatus.classList.remove('hidden');
  } catch (err) {
    saveSessionStatus.textContent = `Could not save session: ${err.message}`;
    saveSessionStatus.className = 'text-sm mt-2 text-red-600';
    saveSessionStatus.classList.remove('hidden');
  }
}

// -------------------------- Music & motion toggles --------------------------

function toggleMusic() {
  if (musicEngine.isPlaying) {
    musicEngine.stop();
  } else {
    musicEngine.start();
  }
  updateMusicButton();
}

function updateMusicButton() {
  musicBtn.textContent = musicEngine.isPlaying ? 'Music: on' : 'Music: off';
  musicBtn.classList.toggle('bg-blue-100', musicEngine.isPlaying);
}

async function toggleMotion() {
  if (motionCounter.isActive) {
    motionCounter.stop();
  } else {
    await motionCounter.start();
  }
  updateMotionButton();
}

function updateMotionButton() {
  motionBtn.textContent = motionCounter.isActive ? 'Sensor: on' : 'Sensor: off';
  motionBtn.classList.toggle('bg-green-100', motionCounter.isActive);
}

function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  updateVoiceButton();
  if (voiceEnabled) {
    initVoice();
  }
}

function updateVoiceButton() {
  voiceBtn.textContent = voiceEnabled ? 'Voice: on' : 'Voice: off';
  voiceBtn.classList.toggle('bg-purple-100', voiceEnabled);
}

function initVoice() {
  if (voiceInitialized) return;
  if ('speechSynthesis' in window) {
    // Pre-load voices on some platforms
    window.speechSynthesis.getVoices();
    voiceInitialized = true;
  }
}

function speak(text) {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore voice errors
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
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function beep(frequency = 880, duration = 0.15) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // ignore audio errors
  }
}

// -------------------------- Music engine --------------------------

class MusicEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.baseVolume = 0.12;
    this.currentVolume = 1.0;
    this.interval = null;
    this.droneNodes = [];
    this.pentatonic = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
  }

  start() {
    if (this.isPlaying) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.baseVolume;
      this.masterGain.connect(this.ctx.destination);

      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 1200;
      this.filter.connect(this.masterGain);

      this.startDrone();
      this.interval = setInterval(() => this.playRandomNote(), 500);
      this.isPlaying = true;
    } catch {
      // ignore
    }
  }

  stop() {
    if (!this.isPlaying) return;
    clearInterval(this.interval);
    this.droneNodes.forEach(n => {
      try { n.osc.stop(); } catch { }
    });
    this.droneNodes = [];
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this.isPlaying = false;
  }

  setVolume(scale) {
    this.currentVolume = Math.max(0, Math.min(1, scale));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.baseVolume * this.currentVolume, this.ctx.currentTime, 0.1);
    }
  }

  startDrone() {
    const droneFreqs = [130.81, 196.0]; // C3 and G3
    droneFreqs.forEach(freq => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(this.filter);
      osc.start();
      this.droneNodes.push({ osc, gain });
    });
  }

  playRandomNote() {
    if (!this.ctx) return;
    const freq = this.pentatonic[Math.floor(Math.random() * this.pentatonic.length)];
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + 1.3);
  }
}

// -------------------------- Motion rep counter --------------------------

class MotionRepCounter {
  constructor(onRep) {
    this.onRep = onRep;
    this.isActive = false;
    this.lastRepTime = 0;
    this.up = false;
    this.cooldownMs = 500;
    this.threshold = 12; // m/s^2 for acceleration without gravity
    this.gravityThreshold = 2.5; // deviation from gravity baseline
    this.baseline = 9.8;
    this.movingAvg = 9.8;
    this.alpha = 0.8;
    this.handler = this.handleMotion.bind(this);
  }

  async start() {
    if (this.isActive) return;

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const response = await DeviceMotionEvent.requestPermission();
        if (response !== 'granted') {
          alert('Motion sensor permission denied.');
          return;
        }
      } catch (err) {
        alert('Could not enable motion sensor: ' + err.message);
        return;
      }
    }

    window.addEventListener('devicemotion', this.handler);
    this.isActive = true;
  }

  stop() {
    if (!this.isActive) return;
    window.removeEventListener('devicemotion', this.handler);
    this.isActive = false;
  }

  handleMotion(event) {
    const accel = event.acceleration;
    let magnitude;
    let usingGravity = false;

    if (accel && accel.x !== null) {
      magnitude = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
    } else if (event.accelerationIncludingGravity) {
      usingGravity = true;
      const g = event.accelerationIncludingGravity;
      magnitude = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    } else {
      return;
    }

    const now = Date.now();

    if (usingGravity) {
      this.movingAvg = this.alpha * this.movingAvg + (1 - this.alpha) * magnitude;
      const deviation = Math.abs(magnitude - this.movingAvg);
      if (deviation > this.gravityThreshold && !this.up) {
        this.up = true;
      } else if (deviation < this.gravityThreshold * 0.5 && this.up) {
        if (now - this.lastRepTime > this.cooldownMs) {
          this.lastRepTime = now;
          this.onRep();
        }
        this.up = false;
      }
    } else {
      if (magnitude > this.threshold && !this.up) {
        this.up = true;
      } else if (magnitude < this.threshold * 0.6 && this.up) {
        if (now - this.lastRepTime > this.cooldownMs) {
          this.lastRepTime = now;
          this.onRep();
        }
        this.up = false;
      }
    }
  }
}
