let currentUser = null;
let currentRoles = [];
let currentPlan = null;
let currentPlanId = null;
let isLoginMode = true;
let allExercises = [];
let pickerTarget = { weekIndex: -1, dayIndex: -1 };
const PLAN_DEFAULTS_KEY = 'workoutPlanFormDefaults';

let currentPreferences = {
  defaultEquipment: ['dumbbells', 'bodyweight'],
  defaultMusic: true,
  defaultMusicStyle: 'drive',
  defaultVoice: false,
  defaultMotionSensor: false,
  defaultVolume: 35,
  defaultLevel: 'beginner',
  defaultGoal: 'hypertrophy',
  defaultSplit: 'full-body',
  defaultProgression: 'linear',
  defaultWeeks: 4,
  defaultDaysPerWeek: 5,
  defaultSessionMinutes: 20,
  defaultWorkoutDays: [0, 1, 2, 3, 4],
  defaultIncludeWarmup: true,
  defaultIncludeCooldown: true
};
let equipmentList = [];
let favoriteExerciseIds = [];
let dislikedExerciseIds = [];

const welcomeSection = document.getElementById('welcomeSection');
const dashboardSection = document.getElementById('dashboardSection');
const plannerSection = document.getElementById('plannerSection');
const adminLink = document.getElementById('adminLink');
const historyLink = document.getElementById('historyLink');
const preferencesLink = document.getElementById('preferencesLink');
const togglePlannerBtn = document.getElementById('togglePlannerBtn');
const closePlannerBtn = document.getElementById('closePlannerBtn');
const savedPlansTable = document.getElementById('savedPlansTable');
const recentActivity = document.getElementById('recentActivity');
const startWorkoutBtn = document.getElementById('startWorkoutBtn');

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString();
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Local defaults first (works for guests), then server prefs overlay when signed in
  loadLocalPlanDefaults();
  await loadPreferences();
  applyPlanDefaultsToForm({ skipBroNudge: true });
  await loadFavorites();
  loadEquipment();
  await loadExternalProviders();
  await checkSession();
  // Re-apply after session in case server prefs arrived late for returning users
  applyPlanDefaultsToForm({ skipBroNudge: true });
  handleReturnUrl();

  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) generateBtn.addEventListener('click', () => generate({ reshuffle: false }));
  const regenerateBtn = document.getElementById('regenerateBtn');
  if (regenerateBtn) regenerateBtn.addEventListener('click', () => generate({ reshuffle: true }));
  const savePlanBtn = document.getElementById('savePlanBtn');
  if (savePlanBtn) savePlanBtn.addEventListener('click', saveCurrentPlan);
  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
  const welcomeSignInBtn = document.getElementById('welcomeSignInBtn');
  if (welcomeSignInBtn) welcomeSignInBtn.addEventListener('click', openAuthModal);
  if (startWorkoutBtn) startWorkoutBtn.addEventListener('click', () => {
    if (currentPlan) {
      localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
    }
  });

  if (togglePlannerBtn && plannerSection && closePlannerBtn) {
    togglePlannerBtn.addEventListener('click', () => {
      plannerSection.classList.remove('hidden');
      closePlannerBtn.classList.remove('hidden');
      togglePlannerBtn.classList.add('hidden');
      plannerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    closePlannerBtn.addEventListener('click', () => {
      plannerSection.classList.add('hidden');
      closePlannerBtn.classList.add('hidden');
      togglePlannerBtn.classList.remove('hidden');
    });
  }

  const emptyStateCreateBtn = document.getElementById('emptyStateCreateBtn');
  if (emptyStateCreateBtn) {
    emptyStateCreateBtn.addEventListener('click', () => {
      plannerSection.classList.remove('hidden');
      closePlannerBtn.classList.remove('hidden');
      togglePlannerBtn.classList.add('hidden');
      plannerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const bottomNavAccount = document.getElementById('bottomNavAccount');
  if (bottomNavAccount) {
    bottomNavAccount.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentUser) openPreferencesModal();
      else openAuthModal();
    });
  }

  // Deep-link: /?open=account | preferences | auth
  const openParam = new URLSearchParams(window.location.search).get('open');
  if (openParam === 'account' || openParam === 'preferences' || openParam === 'auth') {
    setTimeout(() => {
      if (currentUser && (openParam === 'account' || openParam === 'preferences')) openPreferencesModal();
      else if (!currentUser) openAuthModal();
    }, 200);
  }

  document.querySelectorAll('input[type=range]').forEach(input => {
    input.addEventListener('input', updateRangeLabel);
  });
  const daysPerWeekEl = document.getElementById('daysPerWeek');
  if (daysPerWeekEl) daysPerWeekEl.addEventListener('input', syncDaySelectorFromSlider);
  document.querySelectorAll('input[name="workoutDay"]').forEach(cb => {
    cb.addEventListener('change', syncSliderFromDaySelector);
  });
  const splitEl = document.getElementById('split');
  if (splitEl) splitEl.addEventListener('change', onSplitChange);
  if (splitEl) onSplitChange();
  const progressionEl = document.getElementById('progression');
  if (progressionEl) {
    progressionEl.addEventListener('change', () => {
      const hint = document.getElementById('progressionHint');
      if (hint) hint.textContent = PROGRESSION_HINTS[progressionEl.value] || PROGRESSION_HINTS.linear;
    });
  }

  // Auth modal
  const openAuthBtnEl = document.getElementById('openAuthBtn');
  if (openAuthBtnEl) openAuthBtnEl.addEventListener('click', openAuthModal);
  const closeAuthModalEl = document.getElementById('closeAuthModal');
  if (closeAuthModalEl) closeAuthModalEl.addEventListener('click', closeAuthModal);
  const authModalEl = document.getElementById('authModal');
  if (authModalEl) authModalEl.addEventListener('click', e => {
    if (e.target.id === 'authModal') closeAuthModal();
  });
  const authToggleBtn = document.getElementById('authToggleBtn');
  if (authToggleBtn) authToggleBtn.addEventListener('click', toggleAuthMode);
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  if (authSubmitBtn) authSubmitBtn.addEventListener('click', submitAuth);
  const authPassword = document.getElementById('authPassword');
  if (authPassword) authPassword.addEventListener('keypress', e => {
    if (e.key === 'Enter') submitAuth();
  });
  const forgotToggleBtn = document.getElementById('forgotToggleBtn');
  if (forgotToggleBtn) forgotToggleBtn.addEventListener('click', showForgotPanel);
  const backToAuthBtn = document.getElementById('backToAuthBtn');
  if (backToAuthBtn) backToAuthBtn.addEventListener('click', showAuthPanel);
  const forgotSubmitBtn = document.getElementById('forgotSubmitBtn');
  if (forgotSubmitBtn) forgotSubmitBtn.addEventListener('click', submitForgotPassword);
  const forgotEmail = document.getElementById('forgotEmail');
  if (forgotEmail) forgotEmail.addEventListener('keypress', e => {
    if (e.key === 'Enter') submitForgotPassword();
  });

  const preferencesLinkEl = document.getElementById('preferencesLink');
  if (preferencesLinkEl) preferencesLinkEl.addEventListener('click', openPreferencesModal);
  const closePreferencesModalEl = document.getElementById('closePreferencesModal');
  if (closePreferencesModalEl) closePreferencesModalEl.addEventListener('click', closePreferencesModal);
  const preferencesModalEl = document.getElementById('preferencesModal');
  if (preferencesModalEl) preferencesModalEl.addEventListener('click', e => {
    if (e.target.id === 'preferencesModal') closePreferencesModal();
  });
  const prefVolume = document.getElementById('prefVolume');
  if (prefVolume) prefVolume.addEventListener('input', e => {
    const volLabel = document.getElementById('prefVolumeValue');
    if (volLabel) volLabel.textContent = e.target.value + '%';
  });
  const savePreferencesBtn = document.getElementById('savePreferencesBtn');
  if (savePreferencesBtn) savePreferencesBtn.addEventListener('click', savePreferences);

  const closeExercisePickerBtn = document.getElementById('closeExercisePicker');
  if (closeExercisePickerBtn) closeExercisePickerBtn.addEventListener('click', closeExercisePicker);
  const exercisePickerModalEl = document.getElementById('exercisePickerModal');
  if (exercisePickerModalEl) exercisePickerModalEl.addEventListener('click', e => {
    if (e.target.id === 'exercisePickerModal') closeExercisePicker();
  });
  const exerciseSearch = document.getElementById('exerciseSearch');
  if (exerciseSearch) exerciseSearch.addEventListener('input', renderExerciseList);
  const ratingFilter = document.getElementById('exerciseRatingFilter');
  if (ratingFilter) ratingFilter.addEventListener('change', renderExerciseList);
});

function updateRangeLabel(e) {
  const input = e.target;
  const label = input.id === 'daysPerWeek' ? document.getElementById('daysLabel') : document.getElementById('minutesLabel');
  if (label) label.textContent = input.value;
}

function syncDaySelectorFromSlider() {
  const daysPerWeekEl = document.getElementById('daysPerWeek');
  if (!daysPerWeekEl) return;
  const count = parseInt(daysPerWeekEl.value, 10);
  const checkboxes = document.querySelectorAll('input[name="workoutDay"]');
  checkboxes.forEach((cb, idx) => {
    cb.checked = idx < count;
  });
  updateRangeLabel({ target: daysPerWeekEl });
}

function syncSliderFromDaySelector() {
  const checked = document.querySelectorAll('input[name="workoutDay"]:checked').length;
  const slider = document.getElementById('daysPerWeek');
  if (!slider) return;
  slider.value = checked;
  updateRangeLabel({ target: slider });
}

const SPLIT_HINTS = {
  'full-body': 'Full body hits every major area each session — great for 2–3 days/week.',
  'upper-lower': 'Alternates upper and lower days — balanced frequency at 4 days/week.',
  'ppl': 'Push / Pull / Legs — modern hypertrophy staple; hits muscles ~2×/week on a 6-day schedule.',
  'bro-split': 'Classic body-part split: chest, back, legs, shoulders, arms. High volume, once-per-week per group.'
};

function onSplitChange(options = {}) {
  const splitEl = document.getElementById('split');
  if (!splitEl) return;
  const split = splitEl.value;
  const hint = document.getElementById('splitHint');
  const broNote = document.getElementById('broSplitNote');
  if (hint) hint.textContent = SPLIT_HINTS[split] || SPLIT_HINTS['full-body'];
  if (broNote) {
    broNote.classList.toggle('hidden', split !== 'bro-split');
  }

  // Only auto-nudge days/goal when the user actively changes split (not when restoring defaults)
  if (options.skipBroNudge) return;

  if (split === 'bro-split') {
    const daysSlider = document.getElementById('daysPerWeek');
    const days = parseInt(daysSlider.value, 10);
    if (days < 4) {
      daysSlider.value = 5;
      syncDaySelectorFromSlider();
    }
    const goal = document.getElementById('goal');
    if (goal && goal.value !== 'hypertrophy' && goal.value !== 'strength') {
      goal.value = 'hypertrophy';
    }
  }
}

function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === '') return;
  const match = Array.from(el.options).some(o => o.value === String(value));
  if (match) el.value = String(value);
}

function setRangeValue(id, value, labelId) {
  const el = document.getElementById(id);
  if (!el || value == null) return;
  el.value = value;
  if (labelId) {
    const label = document.getElementById(labelId);
    if (label) label.textContent = el.value;
  }
}

function applyPlanDefaultsToForm(options = {}) {
  const p = currentPreferences;
  setSelectValue('weeks', p.defaultWeeks);
  setSelectValue('level', p.defaultLevel);
  setSelectValue('goal', p.defaultGoal);
  setSelectValue('split', p.defaultSplit);
  setSelectValue('progression', p.defaultProgression);
  setRangeValue('daysPerWeek', p.defaultDaysPerWeek, 'daysLabel');
  setRangeValue('sessionMinutes', p.defaultSessionMinutes, 'minutesLabel');

  const days = Array.isArray(p.defaultWorkoutDays) && p.defaultWorkoutDays.length
    ? p.defaultWorkoutDays
    : null;
  if (days) {
    document.querySelectorAll('input[name="workoutDay"]').forEach(cb => {
      cb.checked = days.map(Number).includes(parseInt(cb.value, 10));
    });
    syncSliderFromDaySelector();
  } else {
    syncDaySelectorFromSlider();
  }

  const warm = document.getElementById('includeWarmup');
  const cool = document.getElementById('includeCooldown');
  if (warm) warm.checked = p.defaultIncludeWarmup !== false;
  if (cool) cool.checked = p.defaultIncludeCooldown !== false;

  onSplitChange({ skipBroNudge: true });
  const prog = document.getElementById('progression');
  const progHint = document.getElementById('progressionHint');
  if (prog && progHint && typeof PROGRESSION_HINTS !== 'undefined') {
    progHint.textContent = PROGRESSION_HINTS[prog.value] || PROGRESSION_HINTS.linear;
  }

  // Re-check equipment once list is loaded
  if (equipmentList.length && p.defaultEquipment?.length) {
    document.querySelectorAll('input[name="equipment"]').forEach(cb => {
      cb.checked = p.defaultEquipment.includes(cb.value);
    });
  }
}

function loadLocalPlanDefaults() {
  try {
    const raw = localStorage.getItem(PLAN_DEFAULTS_KEY);
    if (!raw) return;
    const local = JSON.parse(raw);
    currentPreferences = { ...currentPreferences, ...local };
  } catch {
    // ignore
  }
}

function mergePreferences(prefs) {
  if (!prefs) return;
  currentPreferences = {
    ...currentPreferences,
    defaultEquipment: prefs.defaultEquipment?.length
      ? prefs.defaultEquipment
      : currentPreferences.defaultEquipment,
    defaultMusic: prefs.defaultMusic ?? currentPreferences.defaultMusic,
    defaultMusicStyle: prefs.defaultMusicStyle ?? currentPreferences.defaultMusicStyle,
    defaultVoice: prefs.defaultVoice ?? currentPreferences.defaultVoice,
    defaultMotionSensor: prefs.defaultMotionSensor ?? currentPreferences.defaultMotionSensor,
    defaultVolume: prefs.defaultVolume ?? currentPreferences.defaultVolume,
    defaultLevel: prefs.defaultLevel || currentPreferences.defaultLevel,
    defaultGoal: prefs.defaultGoal || currentPreferences.defaultGoal,
    defaultSplit: prefs.defaultSplit || currentPreferences.defaultSplit,
    defaultProgression: prefs.defaultProgression || currentPreferences.defaultProgression,
    defaultWeeks: prefs.defaultWeeks || currentPreferences.defaultWeeks,
    defaultDaysPerWeek: prefs.defaultDaysPerWeek || currentPreferences.defaultDaysPerWeek,
    defaultSessionMinutes: prefs.defaultSessionMinutes || currentPreferences.defaultSessionMinutes,
    defaultWorkoutDays: Array.isArray(prefs.defaultWorkoutDays) && prefs.defaultWorkoutDays.length
      ? prefs.defaultWorkoutDays
      : currentPreferences.defaultWorkoutDays,
    defaultIncludeWarmup: prefs.defaultIncludeWarmup ?? currentPreferences.defaultIncludeWarmup,
    defaultIncludeCooldown: prefs.defaultIncludeCooldown ?? currentPreferences.defaultIncludeCooldown
  };
}

/** Persist current form choices as the user's next-visit defaults. */
async function savePlanFormDefaults(criteria) {
  const planDefaults = {
    defaultLevel: criteria.level,
    defaultGoal: criteria.goal,
    defaultSplit: criteria.split,
    defaultProgression: criteria.progression,
    defaultWeeks: criteria.weeks,
    defaultDaysPerWeek: criteria.daysPerWeek,
    defaultSessionMinutes: criteria.sessionMinutes,
    defaultWorkoutDays: criteria.workoutDays || [],
    defaultIncludeWarmup: criteria.includeWarmup,
    defaultIncludeCooldown: criteria.includeCooldown,
    defaultEquipment: criteria.equipment || currentPreferences.defaultEquipment
  };

  currentPreferences = { ...currentPreferences, ...planDefaults };
  try {
    localStorage.setItem(PLAN_DEFAULTS_KEY, JSON.stringify(planDefaults));
  } catch {
    // ignore quota
  }

  if (!currentUser) return;

  try {
    const dto = {
      defaultEquipment: currentPreferences.defaultEquipment,
      defaultMusic: currentPreferences.defaultMusic,
      defaultMusicStyle: currentPreferences.defaultMusicStyle || 'drive',
      defaultVoice: false,
      defaultMotionSensor: false,
      defaultVolume: currentPreferences.defaultVolume,
      ...planDefaults
    };
    await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(dto)
    });
  } catch {
    // local defaults still saved
  }
}

function collectPreviousExerciseIds() {
  if (!currentPlan || !currentPlan.plan) return [];
  const ids = [];
  currentPlan.plan.forEach(w => {
    (w.days || []).forEach(d => {
      (d.exercises || []).forEach(ex => {
        if (ex.id) ids.push(ex.id);
      });
    });
  });
  return [...new Set(ids)];
}

function getCriteria(options = {}) {
  const equipment = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(cb => cb.value);
  const restrictions = Array.from(document.querySelectorAll('input[name="restrictions"]:checked')).map(cb => cb.value);
  const workoutDays = Array.from(document.querySelectorAll('input[name="workoutDay"]:checked'))
    .map(cb => parseInt(cb.value, 10))
    .filter(d => !Number.isNaN(d))
    .sort((a, b) => a - b);

  // Always a new seed so the server builds a different mix
  const seed = options.seed != null
    ? options.seed
    : ((Date.now() ^ (Math.floor(Math.random() * 1e9))) >>> 0) || 1;

  // Soft-avoid the previous plan's exercises whenever we already have one
  // (both "Create my plan" again and "Try different exercises")
  const avoidExerciseIds = (options.reshuffle || currentPlan)
    ? collectPreviousExerciseIds()
    : [];

  const criteria = {
    weeks: parseInt(document.getElementById('weeks').value, 10),
    daysPerWeek: workoutDays.length > 0
      ? workoutDays.length
      : parseInt(document.getElementById('daysPerWeek').value, 10),
    workoutDays,
    sessionMinutes: parseInt(document.getElementById('sessionMinutes').value, 10),
    equipment,
    restrictions,
    // Split and goal are separate fields — always send both explicitly
    split: document.getElementById('split').value || 'full-body',
    goal: document.getElementById('goal').value || 'hypertrophy',
    level: document.getElementById('level').value || 'beginner',
    includeWarmup: document.getElementById('includeWarmup').checked,
    includeCooldown: document.getElementById('includeCooldown').checked,
    favoriteExerciseIds: favoriteExerciseIds.slice(),
    dislikedExerciseIds: dislikedExerciseIds.slice(),
    progression: document.getElementById('progression')?.value || 'linear',
    seed,
    avoidExerciseIds
  };
  return criteria;
}

const PROGRESSION_HINTS = {
  linear: 'Each week gets a little harder, with planned lighter “recovery” weeks so you can keep improving without burning out.',
  wave: 'Volume weeks (more sets) alternate with intensity weeks (harder effort). Great if you like variety.',
  block: 'A “build” phase, then a harder “push” phase, then recovery. Best for plans of 6+ weeks.',
  none: 'Same style of workouts every week — simple and consistent, with less automatic change.'
};

async function loadFavorites() {
  favoriteExerciseIds = [];
  dislikedExerciseIds = [];
  try {
    const response = await fetch('/api/user/ratings', { credentials: 'include' });
    if (response.ok) {
      const data = await response.json();
      favoriteExerciseIds = Array.isArray(data.liked) ? data.liked : [];
      dislikedExerciseIds = Array.isArray(data.disliked) ? data.disliked : [];
      return;
    }
    // Fallback for older API
    const favRes = await fetch('/api/user/favorites', { credentials: 'include' });
    if (!favRes.ok) return;
    const ids = await favRes.json();
    favoriteExerciseIds = Array.isArray(ids) ? ids : [];
  } catch {
    // anonymous / offline — keep empty
  }
}

function isFavorite(exerciseId) {
  return favoriteExerciseIds.some(id => id.toLowerCase() === String(exerciseId).toLowerCase());
}

function isDisliked(exerciseId) {
  return dislikedExerciseIds.some(id => id.toLowerCase() === String(exerciseId).toLowerCase());
}

function getExerciseRating(exerciseId) {
  if (isFavorite(exerciseId)) return 'like';
  if (isDisliked(exerciseId)) return 'dislike';
  return 'none';
}

/**
 * Cycle or set rating: like / dislike / none.
 * @param {string} exerciseId
 * @param {'like'|'dislike'} desired - which button was pressed
 */
async function setExerciseRating(exerciseId, desired, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Sign in to rank exercises you like or dislike.', 'info');
    openAuthModal();
    return;
  }

  const current = getExerciseRating(exerciseId);
  // Toggle off if pressing the active rating again
  const next = current === desired ? 'none' : desired;

  try {
    const response = await fetch(`/api/user/ratings/${encodeURIComponent(exerciseId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rating: next })
    });
    if (!response.ok) throw new Error('Request failed');

    // Update local lists
    favoriteExerciseIds = favoriteExerciseIds.filter(id => id.toLowerCase() !== exerciseId.toLowerCase());
    dislikedExerciseIds = dislikedExerciseIds.filter(id => id.toLowerCase() !== exerciseId.toLowerCase());
    if (next === 'like') favoriteExerciseIds.push(exerciseId);
    if (next === 'dislike') dislikedExerciseIds.push(exerciseId);

    if (typeof showToast === 'function') {
      const msg = next === 'like'
        ? 'Marked as liked — plans will prefer this.'
        : next === 'dislike'
          ? 'Marked as disliked — plans will avoid this when possible.'
          : 'Rating cleared.';
      showToast(msg, next === 'dislike' ? 'info' : 'success', 2000);
    }

    if (currentPlan) renderPlan(currentPlan);
    if (!document.getElementById('exercisePickerModal').classList.contains('hidden')) {
      renderExerciseList();
    }
  } catch {
    if (typeof showToast === 'function') showToast('Could not update rating.', 'error');
  }
}

function exerciseThumbHtml(imageUrl, name, sizeClass = 'ex-thumb') {
  if (!imageUrl) {
    return `<div class="${sizeClass} ${sizeClass}--placeholder" aria-hidden="true">💪</div>`;
  }
  return `<img class="${sizeClass}" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" onerror="this.classList.add('ex-thumb--broken'); this.alt='';" />`;
}

function ratingButtonsHtml(exerciseId) {
  const liked = isFavorite(exerciseId);
  const disliked = isDisliked(exerciseId);
  const id = escapeHtml(exerciseId);
  return `<span class="rating-btns" role="group" aria-label="Exercise rating">
    <button type="button" class="rate-btn rate-btn--like ${liked ? 'rate-btn--on' : ''}"
      title="${liked ? 'Clear like' : 'I like this'}"
      onclick="setExerciseRating('${id}', 'like', event)"
      aria-pressed="${liked}"><span aria-hidden="true">👍</span><span class="rate-btn__label">Like</span></button>
    <button type="button" class="rate-btn rate-btn--dislike ${disliked ? 'rate-btn--on' : ''}"
      title="${disliked ? 'Clear dislike' : 'I dislike this'}"
      onclick="setExerciseRating('${id}', 'dislike', event)"
      aria-pressed="${disliked}"><span aria-hidden="true">👎</span><span class="rate-btn__label">Dislike</span></button>
  </span>`;
}

function setStatus(message, isError = true) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = isError ? 'mt-4 text-sm text-red-600' : 'mt-4 text-sm text-green-600';
  status.classList.remove('hidden');
}

function clearStatus() {
  const status = document.getElementById('status');
  status.textContent = '';
  status.classList.add('hidden');
}

async function loadEquipment() {
  try {
    const response = await fetch('/api/equipment', { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load equipment');
    equipmentList = await response.json();
    const container = document.getElementById('equipmentContainer');
    container.innerHTML = '';

    equipmentList.forEach(item => {
      const label = document.createElement('label');
      label.className = 'inline-flex items-center';
      const checked = currentPreferences.defaultEquipment.includes(item.id) ? 'checked' : '';
      label.innerHTML = `<input type="checkbox" name="equipment" value="${escapeHtml(item.id)}" ${checked} class="rounded text-blue-600" /><span class="ml-2 text-sm">${escapeHtml(item.name)}</span>`;
      container.appendChild(label);
    });
  } catch (err) {
    document.getElementById('equipmentContainer').innerHTML = `<span class="text-sm text-red-600">Could not load equipment: ${escapeHtml(err.message)}</span>`;
  }
}

async function loadPreferences() {
  try {
    const response = await fetch('/api/user/preferences', { credentials: 'include' });
    if (!response.ok) return;
    const prefs = await response.json();
    mergePreferences(mapPrefsFromApi(prefs));
  } catch {
    // leave local / built-in defaults
  }
}

function mapPrefsFromApi(prefs) {
  return {
    defaultEquipment: prefs.defaultEquipment,
    defaultMusic: prefs.defaultMusic,
    defaultMusicStyle: prefs.defaultMusicStyle || (prefs.defaultMusic ? 'drive' : 'off'),
    defaultVoice: prefs.defaultVoice,
    defaultMotionSensor: prefs.defaultMotionSensor,
    defaultVolume: prefs.defaultVolume,
    defaultLevel: prefs.defaultLevel,
    defaultGoal: prefs.defaultGoal,
    defaultSplit: prefs.defaultSplit,
    defaultProgression: prefs.defaultProgression,
    defaultWeeks: prefs.defaultWeeks,
    defaultDaysPerWeek: prefs.defaultDaysPerWeek,
    defaultSessionMinutes: prefs.defaultSessionMinutes,
    defaultWorkoutDays: prefs.defaultWorkoutDays,
    defaultIncludeWarmup: prefs.defaultIncludeWarmup,
    defaultIncludeCooldown: prefs.defaultIncludeCooldown
  };
}

function openPreferencesModal(e) {
  if (e) e.preventDefault();
  const container = document.getElementById('prefEquipmentContainer');
  container.innerHTML = '';
  equipmentList.forEach(item => {
    const checked = currentPreferences.defaultEquipment.includes(item.id) ? 'checked' : '';
    const label = document.createElement('label');
    label.className = 'inline-flex items-center';
    label.innerHTML = `<input type="checkbox" name="prefEquipment" value="${escapeHtml(item.id)}" ${checked} class="rounded text-blue-600" /><span class="ml-2 text-sm">${escapeHtml(item.name)}</span>`;
    container.appendChild(label);
  });

  const style = currentPreferences.defaultMusicStyle
    || (currentPreferences.defaultMusic ? 'drive' : 'off');
  document.getElementById('prefMusicStyle').value = style;
  document.getElementById('prefMusic').checked = style !== 'off';
  document.getElementById('prefVoice').checked = currentPreferences.defaultVoice;
  document.getElementById('prefMotion').checked = currentPreferences.defaultMotionSensor;
  document.getElementById('prefVolume').value = currentPreferences.defaultVolume;
  document.getElementById('prefVolumeValue').textContent = currentPreferences.defaultVolume + '%';
  document.getElementById('prefStatus').classList.add('hidden');

  document.getElementById('preferencesModal').classList.remove('hidden');
}

function closePreferencesModal() {
  document.getElementById('preferencesModal').classList.add('hidden');
}

function setPrefStatus(message, isError) {
  const el = document.getElementById('prefStatus');
  el.textContent = message;
  el.className = 'text-sm mt-2 ' + (isError ? 'text-red-600' : 'text-green-600');
  el.classList.remove('hidden');
}

async function savePreferences() {
  const equipment = Array.from(document.querySelectorAll('input[name="prefEquipment"]:checked')).map(cb => cb.value);
  const musicStyle = document.getElementById('prefMusicStyle').value || 'drive';
  const dto = {
    ...currentPreferences,
    defaultEquipment: equipment,
    defaultMusicStyle: musicStyle,
    defaultMusic: musicStyle !== 'off',
    defaultVoice: false,
    defaultMotionSensor: false,
    defaultVolume: parseInt(document.getElementById('prefVolume').value, 10)
  };

  try {
    const response = await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(dto)
    });
    if (!response.ok) throw new Error('Failed to save');
    mergePreferences(dto);
    try {
      localStorage.setItem(PLAN_DEFAULTS_KEY, JSON.stringify({
        defaultLevel: dto.defaultLevel,
        defaultGoal: dto.defaultGoal,
        defaultSplit: dto.defaultSplit,
        defaultProgression: dto.defaultProgression,
        defaultWeeks: dto.defaultWeeks,
        defaultDaysPerWeek: dto.defaultDaysPerWeek,
        defaultSessionMinutes: dto.defaultSessionMinutes,
        defaultWorkoutDays: dto.defaultWorkoutDays,
        defaultIncludeWarmup: dto.defaultIncludeWarmup,
        defaultIncludeCooldown: dto.defaultIncludeCooldown,
        defaultEquipment: dto.defaultEquipment
      }));
    } catch { /* ignore */ }
    loadEquipment();
    setPrefStatus('Preferences saved.', false);
    if (typeof showToast === 'function') showToast('Preferences saved.', 'success');
  } catch (err) {
    setPrefStatus('Could not save preferences: ' + err.message, true);
    if (typeof showToast === 'function') showToast('Could not save preferences.', 'error');
  }
}

// Auth UI
function openAuthModal() {
  showAuthPanel();
  updateExternalLoginLinks();
  document.getElementById('authModal').classList.remove('hidden');
  document.getElementById('authEmail').focus();
}

function updateExternalLoginLinks() {
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('returnUrl');
  const google = document.getElementById('googleLoginBtn');
  const microsoft = document.getElementById('microsoftLoginBtn');
  const base = '/api/auth/external-login';
  if (returnUrl) {
    google.href = `${base}?provider=Google&returnUrl=${encodeURIComponent(returnUrl)}`;
    microsoft.href = `${base}?provider=Microsoft&returnUrl=${encodeURIComponent(returnUrl)}`;
  } else {
    google.href = `${base}?provider=Google`;
    microsoft.href = `${base}?provider=Microsoft`;
  }
}

function closeAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  document.getElementById('forgotEmail').value = '';
  document.getElementById('forgotError').classList.add('hidden');
  document.getElementById('forgotSuccess').classList.add('hidden');
}

function showAuthPanel() {
  document.getElementById('authPanel').classList.remove('hidden');
  document.getElementById('forgotPanel').classList.add('hidden');
  document.getElementById('authModalTitle').textContent = isLoginMode ? 'Sign in' : 'Register';
}

function showForgotPanel() {
  document.getElementById('authPanel').classList.add('hidden');
  document.getElementById('forgotPanel').classList.remove('hidden');
  document.getElementById('authModalTitle').textContent = 'Reset password';
  document.getElementById('forgotEmail').focus();
}

function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  document.getElementById('authModalTitle').textContent = isLoginMode ? 'Sign in' : 'Register';
  document.getElementById('authSubmitBtn').textContent = isLoginMode ? 'Sign in' : 'Create account';
  document.getElementById('authToggleText').textContent = isLoginMode ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('authToggleBtn').textContent = isLoginMode ? 'Register' : 'Sign in';
}

function setAuthError(message) {
  const el = document.getElementById('authError');
  el.textContent = message;
  el.classList.remove('hidden');
}

async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) {
    setAuthError('Please enter an email and password.');
    return;
  }

  const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const msg = data.errors ? data.errors.join('\n') : (data.title || data.detail || 'Authentication failed.');
      setAuthError(msg);
      return;
    }

    const data = await response.json();
    closeAuthModal();
    showLoggedIn(data.email, data.roles || []);
    await loadPreferences();
    loadEquipment();

    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get('returnUrl');
    if (returnUrl) {
      window.location.href = returnUrl;
    }
  } catch (err) {
    setAuthError(`Error: ${err.message}`);
  }
}

async function submitForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  const error = document.getElementById('forgotError');
  const success = document.getElementById('forgotSuccess');
  error.classList.add('hidden');
  success.classList.add('hidden');

  if (!email) {
    error.textContent = 'Please enter your email.';
    error.classList.remove('hidden');
    return;
  }

  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      error.textContent = data.title || data.detail || 'Could not request reset.';
      error.classList.remove('hidden');
      return;
    }

    const data = await response.json();
    success.textContent = data.resetLink
      ? `Reset link: ${data.resetLink}`
      : (data.message || 'Check your email for a reset link.');
    success.classList.remove('hidden');
  } catch (err) {
    error.textContent = 'Error: ' + err.message;
    error.classList.remove('hidden');
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch { }
  showLoggedOut();
}

async function checkSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (response.ok) {
      const data = await response.json();
      showLoggedIn(data.email, data.roles || []);
    } else {
      showLoggedOut();
    }
  } catch {
    showLoggedOut();
  }
}

async function loadExternalProviders() {
  try {
    const response = await fetch('/api/auth/external-providers', { credentials: 'include' });
    if (!response.ok) return;
    const providers = await response.json();
    if (providers.length === 0) return;

    document.getElementById('externalLoginSection').classList.remove('hidden');
    document.getElementById('googleLoginBtn').classList.toggle('hidden', !providers.includes('Google'));
    document.getElementById('microsoftLoginBtn').classList.toggle('hidden', !providers.includes('Microsoft'));
  } catch {
    // ignore
  }
}

function handleReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('returnUrl');
  if (!returnUrl) return;

  updateExternalLoginLinks();

  if (currentUser) {
    window.location.replace(returnUrl);
    return;
  }

  if (returnUrl.toLowerCase().includes('admin')) {
    openAuthModal();
  }
}

function showLoggedIn(email, roles) {
  currentUser = email;
  currentRoles = roles;
  loadFavorites();
  // Load server-side plan defaults after login
  loadPreferences().then(() => applyPlanDefaultsToForm({ skipBroNudge: true }));
  const section = document.getElementById('authSection');
  section.innerHTML = `
    <span class="text-sm text-gray-700">${escapeHtml(email)}</span>
    <button id="logoutBtn" class="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold py-2 px-4 rounded-md transition">Log out</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', logout);

  historyLink.classList.remove('hidden');
  preferencesLink.classList.remove('hidden');

  if (roles.includes('Admin')) {
    adminLink.classList.remove('hidden');
  } else {
    adminLink.classList.add('hidden');
  }

  welcomeSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  plannerSection.classList.add('hidden');
  togglePlannerBtn.classList.remove('hidden');
  closePlannerBtn.classList.add('hidden');
  document.getElementById('savePlanBtn').classList.remove('hidden');

  loadDashboard();
}

function showLoggedOut() {
  currentUser = null;
  currentRoles = [];
  const section = document.getElementById('authSection');
  section.innerHTML = `<button id="openAuthBtn" class="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold py-2 px-4 rounded-md transition">Sign in / Register</button>`;
  document.getElementById('openAuthBtn').addEventListener('click', openAuthModal);

  adminLink.classList.add('hidden');
  historyLink.classList.add('hidden');
  preferencesLink.classList.add('hidden');
  welcomeSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  plannerSection.classList.remove('hidden');
  togglePlannerBtn.classList.add('hidden');
  closePlannerBtn.classList.add('hidden');
  document.getElementById('savePlanBtn').classList.add('hidden');
}

async function loadDashboard() {
  if (!currentUser) return;
  try {
    const response = await fetch('/api/dashboard', { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    renderDashboard(data);
  } catch {
    // ignore
  }
}

function renderDashboard(data) {
  const totalPlans = data.totalPlans || 0;
  const totalSessions = data.totalSessions || 0;
  document.getElementById('statPlans').textContent = totalPlans;
  document.getElementById('statWorkouts').textContent = totalSessions;
  document.getElementById('statMinutes').textContent = Math.floor((data.totalDurationSeconds || 0) / 60);
  document.getElementById('statSets').textContent = data.totalSets || 0;

  const emptyState = document.getElementById('dashboardEmptyState');
  if (emptyState) {
    const isNewUser = totalPlans === 0 && totalSessions === 0;
    emptyState.classList.toggle('hidden', !isNewUser);
  }

  if (data.plans && data.plans.length) {
    const rows = data.plans.map(p => `
      <div class="flex items-center justify-between p-4 border-b last:border-b-0">
        <div>
          <div class="font-medium">${escapeHtml(p.name)}</div>
          <div class="text-xs text-gray-500">Created ${formatDate(p.createdAt)} • Used ${p.useCount} time${p.useCount === 1 ? '' : 's'} • Last used ${p.lastUsed ? formatDate(p.lastUsed) : 'never'}</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="text-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold py-1 px-3 rounded-md" onclick="runPlan(${p.id})">Run</button>
          <button class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded-md" onclick="loadSavedPlan(${p.id})">Load</button>
          <button class="text-sm bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-3 rounded-md" onclick="deleteSavedPlan(${p.id})">Delete</button>
        </div>
      </div>
    `).join('');
    savedPlansTable.innerHTML = rows;
  } else {
    savedPlansTable.innerHTML = `
      <div class="p-4 text-sm text-gray-600">
        <p class="font-medium text-gray-800 mb-1">No saved plans yet</p>
        <p class="text-gray-500 mb-3">Create a plan below, then save it so you can re-run it anytime.</p>
        <button type="button" class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-md" onclick="document.getElementById('togglePlannerBtn').click()">Create a plan</button>
      </div>`;
  }

  if (data.recentSessions && data.recentSessions.length) {
    const sessions = data.recentSessions.map(s => `
      <div class="p-4 border-b last:border-b-0">
        <div class="font-medium">${escapeHtml(s.planName)}</div>
        <div class="text-xs text-gray-500">${formatDate(s.startedAt)} • ${formatDuration(s.durationSeconds)} • ${s.sets} sets • ${s.reps} reps</div>
      </div>
    `).join('');
    recentActivity.innerHTML = sessions;
  } else {
    recentActivity.innerHTML = `
      <div class="p-4 text-sm text-gray-600">
        <p class="font-medium text-gray-800 mb-1">No workouts logged yet</p>
        <p class="text-gray-500 mb-3">Finish a session in the runner and tap Save — your streak starts here.</p>
        <a href="/workout.html" class="inline-block text-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-3 rounded-md">Open runner</a>
      </div>`;
  }
}

async function loadSavedPlan(id) {
  try {
    const response = await fetch(`/api/plans/${id}`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load plan');
    const result = await response.json();
    currentPlan = result;
    currentPlanId = id;
    localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
    renderPlan(currentPlan);
    plannerSection.classList.remove('hidden');
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    setStatus(`Could not load plan: ${err.message}`);
  }
}

async function deleteSavedPlan(id) {
  if (!confirm('Are you sure you want to delete this plan?')) return;
  try {
    const response = await fetch(`/api/plans/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) throw new Error('Failed to delete');
    loadDashboard();
  } catch (err) {
    setStatus(`Could not delete plan: ${err.message}`);
  }
}

function runPlan(id) {
  window.location.href = `/workout.html?planId=${id}`;
}

async function saveCurrentPlan() {
  if (!currentPlan) {
    setStatus('Create a plan first.');
    return;
  }
  const defaultName = `Plan ${new Date().toLocaleDateString()}`;
  const name = window.prompt('Save plan as:', defaultName);
  if (name === null) return;

  try {
    const response = await fetch('/api/plans/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: name || defaultName, planJson: JSON.stringify(currentPlan) })
    });
    if (!response.ok) throw new Error('Server error');
    setStatus('Plan saved.', false);
    if (typeof showToast === 'function') showToast('Plan saved to your account.', 'success');
    loadDashboard();
  } catch (err) {
    setStatus(`Could not save plan: ${err.message}`);
    if (typeof showToast === 'function') showToast(`Could not save plan: ${err.message}`, 'error');
  }
}

async function generate(options = {}) {
  clearStatus();
  const reshuffle = !!options.reshuffle;
  const criteria = getCriteria({ reshuffle });

  if (criteria.equipment.length === 0) {
    setStatus('Please select at least one equipment option.');
    return;
  }
  if (!criteria.workoutDays || criteria.workoutDays.length === 0) {
    setStatus('Please select at least one workout day (Mon–Sun).');
    return;
  }

  const btn = document.getElementById('generateBtn');
  const regenBtn = document.getElementById('regenerateBtn');
  const originalText = btn.textContent;
  const originalRegen = regenBtn ? regenBtn.textContent : '';
  btn.textContent = reshuffle ? 'Trying a new mix...' : 'Creating...';
  btn.disabled = true;
  if (regenBtn) {
    regenBtn.disabled = true;
    if (reshuffle) regenBtn.textContent = 'Shuffling...';
  }

  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(criteria)
    });

    if (!response.ok) {
      let msg = `Server returned ${response.status}`;
      try {
        const raw = await response.text();
        try {
          const body = JSON.parse(raw);
          if (body.errors) {
            msg = Object.entries(body.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ');
          } else if (body.detail) {
            msg = body.detail;
          } else if (body.title) {
            msg = body.title;
          }
        } catch {
          if (raw) msg = raw;
        }
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    const result = await response.json();
    if (typeof WorkoutMobility !== 'undefined') {
      WorkoutMobility.ensurePlanMobility(result);
    }
    currentPlan = result;
    currentPlanId = null;
    localStorage.setItem('workoutPlan', JSON.stringify(result));
    // Remember form choices for next visit (level, goal, split, days, etc.)
    await savePlanFormDefaults(criteria);
    renderPlan(result);
    if (regenBtn) regenBtn.classList.remove('hidden');
    if (typeof showToast === 'function') {
      showToast(
        reshuffle
          ? 'New exercise mix ready — scroll down to compare.'
          : 'Plan ready — scroll down to review or start.',
        'success'
      );
    }
  } catch (err) {
    setStatus(`Could not create plan: ${err.message}`);
    if (typeof showToast === 'function') showToast(`Could not create plan: ${err.message}`, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    if (regenBtn) {
      regenBtn.disabled = false;
      regenBtn.textContent = originalRegen || 'Try different exercises';
    }
  }
}

function renderPlan(result) {
  const container = document.getElementById('planOutput');
  container.innerHTML = '';

  // Backfill warm-up / cool-down for plans generated before mobility, or if server omitted them
  if (typeof WorkoutMobility !== 'undefined' && WorkoutMobility.ensurePlanMobility(result)) {
    try { localStorage.setItem('workoutPlan', JSON.stringify(result)); } catch { /* ignore */ }
  }

  const summary = document.createElement('div');
  summary.className = 'mb-6';
  const progressionLabel = ({
    linear: 'Steady progress',
    wave: 'Wave progression',
    block: 'Block periodization',
    none: 'Steady (no ramp)'
  })[result.criteria.progression] || capitalize(result.criteria.progression || 'linear');
  const mobilityNote = (result.criteria.includeWarmup !== false || result.criteria.includeCooldown !== false)
    ? `<p class="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-3">Each workout day includes a short <strong>warm-up</strong> and/or <strong>cool-down</strong> matched to the muscles trained that day (shown with badges at the top and bottom of the list).</p>`
    : '';
  summary.innerHTML = `
    <h2 class="text-2xl font-bold mb-2">Your ${result.criteria.weeks}-week plan</h2>
    <p class="text-gray-700">
      ${formatWorkoutDays(result.criteria.workoutDays, result.criteria.daysPerWeek)} • ${result.criteria.sessionMinutes} min sessions
      • <strong>Split:</strong> ${capitalize(result.criteria.split || 'full-body')}
      • <strong>Goal:</strong> ${capitalize(result.criteria.goal)}
      • ${capitalize(result.criteria.level)}
      • ${progressionLabel}
    </p>
    ${result.progressionSummary ? `<p class="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3">${escapeHtml(result.progressionSummary)}</p>` : ''}
    ${mobilityNote}
    <p class="text-sm text-gray-500 mt-2">Use the buttons on each day to add or remove exercises and to switch a day between workout and rest. <a href="/help.html#progression" class="text-blue-600 hover:underline">How progression works</a></p>
  `;
  container.appendChild(summary);

  result.plan.forEach((week, weekIndex) => {
    const weekEl = document.createElement('section');
    weekEl.className = 'mb-8';
    const phaseBadge = week.phaseLabel
      ? `<span class="ml-2 text-xs font-semibold px-2 py-1 rounded-full ${week.phase === 'deload' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}">${escapeHtml(week.phaseLabel)}</span>`
      : '';
    const focusNote = week.focusNote
      ? `<p class="text-sm text-gray-600 mb-3">${escapeHtml(week.focusNote)}</p>`
      : '';
    weekEl.innerHTML = `
      <h3 class="text-xl font-semibold mb-1 border-b pb-1 flex flex-wrap items-center gap-1">Week ${week.week}${phaseBadge}</h3>
      ${focusNote}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 days-grid"></div>
    `;
    const grid = weekEl.querySelector('.days-grid');

    week.days.forEach((day, dayIndex) => {
      const card = document.createElement('div');
      card.className = 'border rounded-lg p-4 shadow-sm ' + (day.type === 'rest' ? 'bg-gray-50' : 'bg-white');

      if (day.type === 'rest') {
        card.innerHTML = `
          <div class="font-semibold text-gray-500">${day.day}</div>
          <div class="text-sm text-gray-600">${day.note || 'Rest / mobility'}</div>
          <div class="mt-3">
            <button onclick="toggleDayType(${weekIndex}, ${dayIndex})" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-2 rounded">Make workout day</button>
          </div>
        `;
      } else {
        const renderEx = (ex, exIndex) => {
          const phase = (ex.phase || 'work').toLowerCase();
          const phaseBadge = phase === 'warmup'
            ? '<span class="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">Warm-up</span>'
            : phase === 'cooldown'
              ? '<span class="text-[10px] font-semibold uppercase tracking-wide bg-teal-100 text-teal-900 px-1.5 py-0.5 rounded">Cool-down</span>'
              : '';
          const isMobility = phase === 'warmup' || phase === 'cooldown';
          const setsLine = isMobility
            ? `<span class="text-sm text-gray-700">${escapeHtml(ex.repsDisplay || (ex.workDuration + 's'))}</span>`
            : `<span class="text-sm text-gray-700">${ex.sets} sets × ${escapeHtml(ex.repsDisplay)} <span class="text-gray-500">(${ex.rest}s rest)</span></span>`;
          const rating = isMobility ? '' : `
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs text-gray-500">Your rating:</span>
                ${ratingButtonsHtml(ex.id)}
              </div>`;
          const cue = isMobility && ex.progression
            ? `<div class="text-xs text-gray-600 italic mt-0.5">${escapeHtml(ex.progression)}</div>`
            : '';
          return `
          <li class="mb-3 flex gap-3 ${isMobility ? 'opacity-95' : ''}">
            ${exerciseThumbHtml(ex.imageUrl, ex.name)}
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <span class="font-medium flex flex-wrap items-center gap-1.5">${phaseBadge}${escapeHtml(ex.name)}</span>
                <div class="flex items-center gap-2 shrink-0">
                  ${ex.demoUrl ? `<a href="${escapeHtml(ex.demoUrl)}" target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline whitespace-nowrap">${/exrx\.net/i.test(ex.demoUrl) ? 'ExRx' : 'Demo'}</a>` : ''}
                  ${(ex.demoAnimUrl || (ex.imageUrl && ex.id && !String(ex.id).startsWith('wu-') && !String(ex.id).startsWith('cd-')))
                    ? `<a href="${escapeHtml(ex.demoAnimUrl || ('/demos/' + encodeURIComponent(ex.id) + '.webp'))}" target="_blank" rel="noopener" class="text-xs text-indigo-600 hover:underline whitespace-nowrap">WebP</a>`
                    : ''}
                  <button onclick="deleteExerciseFromDay(${weekIndex}, ${dayIndex}, ${exIndex})" class="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              </div>
              <div>${setsLine}</div>
              <div class="text-xs text-gray-500 mb-1.5">${escapeHtml((ex.primary || []).join(', '))}</div>
              ${cue}
              ${rating}
            </div>
          </li>`;
        };

        const split = typeof WorkoutMobility !== 'undefined'
          ? WorkoutMobility.splitByPhase(day.exercises)
          : { warm: [], work: day.exercises || [], cool: [] };
        // Indices in full day.exercises array for remove buttons
        const indexOf = (ex) => day.exercises.indexOf(ex);

        let listHtml = '';
        if (split.warm.length) {
          listHtml += `<li class="list-none mb-2 mt-1"><div class="text-xs font-bold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">Warm-up</div></li>`;
          listHtml += split.warm.map(ex => renderEx(ex, indexOf(ex))).join('');
        }
        if (split.work.length) {
          listHtml += `<li class="list-none mb-2 mt-2"><div class="text-xs font-bold uppercase tracking-wide text-blue-800 bg-blue-50 border border-blue-100 rounded px-2 py-1">Main work</div></li>`;
          listHtml += split.work.map(ex => renderEx(ex, indexOf(ex))).join('');
        }
        if (split.cool.length) {
          listHtml += `<li class="list-none mb-2 mt-2"><div class="text-xs font-bold uppercase tracking-wide text-teal-800 bg-teal-50 border border-teal-100 rounded px-2 py-1">Cool-down</div></li>`;
          listHtml += split.cool.map(ex => renderEx(ex, indexOf(ex))).join('');
        }

        const workHint = split.work[0];
        const mobilitySummary = typeof WorkoutMobility !== 'undefined'
          ? WorkoutMobility.dayMobilitySummary(day)
          : '';
        card.innerHTML = `
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold">${day.day}</span>
            <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">${day.focus || 'Workout'}</span>
          </div>
          <div class="text-sm text-gray-600 mb-1">~${day.estimatedMinutes} min${mobilitySummary ? ` · ${escapeHtml(mobilitySummary)}` : ''}</div>
          <ul class="text-sm">${listHtml}</ul>
          <div class="mt-3 flex flex-wrap gap-2">
            <button onclick="openExercisePicker(${weekIndex}, ${dayIndex})" class="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold py-1 px-2 rounded">+ Add exercise</button>
            <button onclick="toggleDayType(${weekIndex}, ${dayIndex})" class="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-1 px-2 rounded">Make rest day</button>
          </div>
          <div class="mt-2 text-xs text-blue-700 italic">${escapeHtml(workHint?.progression || '')}</div>
        `;
      }

      grid.appendChild(card);
    });

    container.appendChild(weekEl);
  });

  document.getElementById('results').classList.remove('hidden');
  startWorkoutBtn.classList.remove('hidden');
  startWorkoutBtn.href = currentPlanId ? `/workout.html?planId=${currentPlanId}` : '/workout.html';
  const regenBtn = document.getElementById('regenerateBtn');
  if (regenBtn) regenBtn.classList.remove('hidden');
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

function deleteExerciseFromDay(weekIndex, dayIndex, exIndex) {
  if (!currentPlan) return;
  const day = currentPlan.plan[weekIndex].days[dayIndex];
  day.exercises.splice(exIndex, 1);
  recalculateDayMinutes(day);
  localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
  renderPlan(currentPlan);
}

function toggleDayType(weekIndex, dayIndex) {
  if (!currentPlan) return;
  const day = currentPlan.plan[weekIndex].days[dayIndex];
  if (day.type === 'rest') {
    day.type = 'workout';
    day.focus = '';
    day.exercises = [];
    day.note = '';
  } else {
    day.type = 'rest';
    day.focus = '';
    day.exercises = [];
    day.note = 'Rest / mobility';
  }
  recalculateDayMinutes(day);
  localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
  renderPlan(currentPlan);
}

function recalculateDayMinutes(day) {
  if (!currentPlan || !day.exercises) return;
  // Warm-up / cool-down are real timed items in the list — sum everything once.
  const transition = 15;
  let timeUsed = day.exercises.reduce((sum, ex) => {
    const sets = Math.max(1, ex.sets || 1);
    const work = ex.workDuration || 30;
    const rest = ex.rest || 0;
    return sum + sets * (work + rest) + transition;
  }, 0);
  day.estimatedMinutes = Math.max(0, Math.round(timeUsed / 60));
}

async function openExercisePicker(weekIndex, dayIndex) {
  if (!currentPlan) return;
  pickerTarget = { weekIndex, dayIndex };
  document.getElementById('exerciseSearch').value = '';
  document.getElementById('exercisePickerModal').classList.remove('hidden');
  if (allExercises.length === 0) {
    try {
      const response = await fetch('/api/exercises', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load exercises');
      allExercises = await response.json();
    } catch (err) {
      setStatus(`Could not load exercises: ${err.message}`);
      closeExercisePicker();
      return;
    }
  }
  renderExerciseList();
}

function closeExercisePicker() {
  document.getElementById('exercisePickerModal').classList.add('hidden');
  pickerTarget = { weekIndex: -1, dayIndex: -1 };
}

function renderExerciseList() {
  const query = document.getElementById('exerciseSearch').value.trim().toLowerCase();
  const filter = document.getElementById('exerciseRatingFilter')?.value || 'all';
  const container = document.getElementById('exerciseList');
  let filtered = allExercises.filter(ex =>
    ex.name.toLowerCase().includes(query) ||
    (ex.slot || '').toLowerCase().includes(query) ||
    (ex.primary || []).some(p => p.toLowerCase().includes(query))
  );

  if (filter === 'liked') {
    filtered = filtered.filter(ex => isFavorite(ex.id));
  } else if (filter === 'disliked') {
    filtered = filtered.filter(ex => isDisliked(ex.id));
  } else if (filter === 'unrated') {
    filtered = filtered.filter(ex => !isFavorite(ex.id) && !isDisliked(ex.id));
  }

  // Liked first, then neutral, disliked last
  filtered = filtered.slice().sort((a, b) => {
    const rank = (ex) => (isFavorite(ex.id) ? 2 : isDisliked(ex.id) ? 0 : 1);
    const d = rank(b) - rank(a);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });

  container.innerHTML = filtered.map(ex => `
    <div class="flex items-stretch gap-2 border rounded-md p-2 hover:bg-blue-50 transition ${isDisliked(ex.id) ? 'opacity-75' : ''}">
      ${exerciseThumbHtml(ex.imageUrl, ex.name, 'ex-thumb ex-thumb--sm')}
      <button type="button" onclick="selectExerciseForDay('${escapeHtml(ex.id)}')" class="flex-1 text-left min-w-0">
        <div class="font-medium flex items-center gap-1">
          ${escapeHtml(ex.name)}
          ${isFavorite(ex.id) ? '<span class="text-xs" title="Liked">👍</span>' : ''}
          ${isDisliked(ex.id) ? '<span class="text-xs" title="Disliked">👎</span>' : ''}
        </div>
        <div class="text-xs text-gray-500 truncate">${escapeHtml(ex.slot)} • ${escapeHtml((ex.primary || []).join(', '))} • ${escapeHtml((ex.equipment || []).join(', '))}</div>
      </button>
      ${ratingButtonsHtml(ex.id)}
    </div>
  `).join('');

  if (filtered.length === 0) {
    const emptyMsg = filter === 'liked'
      ? 'No liked exercises match. Use 👍 on moves you enjoy.'
      : filter === 'disliked'
        ? 'No disliked exercises match.'
        : 'No exercises found.';
    container.innerHTML = `<p class="text-sm text-gray-500">${emptyMsg}</p>`;
  }
}

function selectExerciseForDay(exerciseId) {
  if (!currentPlan || pickerTarget.weekIndex < 0) return;
  const ex = allExercises.find(e => e.id === exerciseId);
  if (!ex) return;

  const day = currentPlan.plan[pickerTarget.weekIndex].days[pickerTarget.dayIndex];
  if (day.type === 'rest') {
    day.type = 'workout';
    day.note = '';
  }
  day.exercises.push(createPlanExercise(ex, currentPlan.criteria.goal, currentPlan.criteria.weeks));
  recalculateDayMinutes(day);
  localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
  closeExercisePicker();
  renderPlan(currentPlan);
}

function createPlanExercise(exercise, goal, weeks) {
  const sets = exercise.baseSets || 3;
  const reps = exercise.isTimeBased
    ? `${exercise.repsMin || 8}-${exercise.repsMax || 12} sec`
    : `${exercise.repsMin || 8}-${exercise.repsMax || 12}`;
  return {
    id: exercise.id,
    name: exercise.name,
    slot: exercise.slot,
    sets: sets,
    repsDisplay: reps,
    rest: exercise.restSec || 60,
    workDuration: exercise.workDuration || 30,
    isTimeBased: exercise.isTimeBased || false,
    primary: exercise.primary || [],
    progression: progressionHint(goal, weeks),
    demoUrl: exercise.demoUrl || null,
    imageUrl: exercise.imageUrl || null
  };
}

function progressionHint(goal, week) {
  if (week === 1) return 'Learn the movement; use a weight you can control with good form.';
  if (goal === 'strength') return 'If you completed all sets last week, add a small amount of weight.';
  if (goal === 'endurance' || goal === 'fat-loss') return 'Aim for the top of the rep range or reduce rest slightly.';
  return 'Add reps, sets, or weight when the top of the range feels easy.';
}

function loadDefaults() {
  const saved = localStorage.getItem('workoutPlan');
  if (saved) {
    try {
      const result = JSON.parse(saved);
      currentPlan = result;
      currentPlanId = null;
      renderPlan(result);
    } catch {
      localStorage.removeItem('workoutPlan');
    }
  }
}

function capitalize(s) {
  if (!s) return s;
  return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatWorkoutDays(workoutDays, daysPerWeek) {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (workoutDays && workoutDays.length > 0) {
    return workoutDays.map(d => dayNames[d]).join(', ');
  }
  return `${daysPerWeek} days/week`;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
