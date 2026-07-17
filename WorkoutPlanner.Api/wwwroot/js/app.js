let currentUser = null;
let currentRoles = [];
let currentPlan = null;
let currentPlanId = null;
let isLoginMode = true;
let allExercises = [];
let pickerTarget = { weekIndex: -1, dayIndex: -1 };
let currentPreferences = {
  defaultEquipment: ['dumbbells', 'bodyweight'],
  defaultMusic: false,
  defaultVoice: false,
  defaultMotionSensor: false,
  defaultVolume: 20
};
let equipmentList = [];
let favoriteExerciseIds = [];

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
  await loadPreferences();
  await loadFavorites();
  loadEquipment();
  await loadExternalProviders();
  await checkSession();
  handleReturnUrl();

  document.getElementById('generateBtn').addEventListener('click', generate);
  document.getElementById('savePlanBtn').addEventListener('click', saveCurrentPlan);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('welcomeSignInBtn').addEventListener('click', openAuthModal);
  startWorkoutBtn.addEventListener('click', () => {
    if (currentPlan) {
      localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
    }
  });

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
  document.getElementById('daysPerWeek').addEventListener('input', syncDaySelectorFromSlider);
  document.querySelectorAll('input[name="workoutDay"]').forEach(cb => {
    cb.addEventListener('change', syncSliderFromDaySelector);
  });
  document.getElementById('split').addEventListener('change', onSplitChange);
  onSplitChange();
  const progressionEl = document.getElementById('progression');
  if (progressionEl) {
    progressionEl.addEventListener('change', () => {
      const hint = document.getElementById('progressionHint');
      if (hint) hint.textContent = PROGRESSION_HINTS[progressionEl.value] || PROGRESSION_HINTS.linear;
    });
  }

  // Auth modal
  document.getElementById('openAuthBtn').addEventListener('click', openAuthModal);
  document.getElementById('closeAuthModal').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', e => {
    if (e.target.id === 'authModal') closeAuthModal();
  });
  document.getElementById('authToggleBtn').addEventListener('click', toggleAuthMode);
  document.getElementById('authSubmitBtn').addEventListener('click', submitAuth);
  document.getElementById('authPassword').addEventListener('keypress', e => {
    if (e.key === 'Enter') submitAuth();
  });
  document.getElementById('forgotToggleBtn').addEventListener('click', showForgotPanel);
  document.getElementById('backToAuthBtn').addEventListener('click', showAuthPanel);
  document.getElementById('forgotSubmitBtn').addEventListener('click', submitForgotPassword);
  document.getElementById('forgotEmail').addEventListener('keypress', e => {
    if (e.key === 'Enter') submitForgotPassword();
  });

  document.getElementById('preferencesLink').addEventListener('click', openPreferencesModal);
  document.getElementById('closePreferencesModal').addEventListener('click', closePreferencesModal);
  document.getElementById('preferencesModal').addEventListener('click', e => {
    if (e.target.id === 'preferencesModal') closePreferencesModal();
  });
  document.getElementById('prefVolume').addEventListener('input', e => {
    document.getElementById('prefVolumeValue').textContent = e.target.value + '%';
  });
  document.getElementById('savePreferencesBtn').addEventListener('click', savePreferences);

  document.getElementById('closeExercisePicker').addEventListener('click', closeExercisePicker);
  document.getElementById('exercisePickerModal').addEventListener('click', e => {
    if (e.target.id === 'exercisePickerModal') closeExercisePicker();
  });
  document.getElementById('exerciseSearch').addEventListener('input', renderExerciseList);
  const favOnly = document.getElementById('exerciseFavoritesOnly');
  if (favOnly) favOnly.addEventListener('change', renderExerciseList);
});

function updateRangeLabel(e) {
  const input = e.target;
  const label = input.id === 'daysPerWeek' ? document.getElementById('daysLabel') : document.getElementById('minutesLabel');
  if (label) label.textContent = input.value;
}

function syncDaySelectorFromSlider() {
  const count = parseInt(document.getElementById('daysPerWeek').value, 10);
  const checkboxes = document.querySelectorAll('input[name="workoutDay"]');
  checkboxes.forEach((cb, idx) => {
    cb.checked = idx < count;
  });
  updateRangeLabel({ target: document.getElementById('daysPerWeek') });
}

function syncSliderFromDaySelector() {
  const checked = document.querySelectorAll('input[name="workoutDay"]:checked').length;
  const slider = document.getElementById('daysPerWeek');
  slider.value = checked;
  updateRangeLabel({ target: slider });
}

const SPLIT_HINTS = {
  'full-body': 'Full body hits every major area each session — great for 2–3 days/week.',
  'upper-lower': 'Alternates upper and lower days — balanced frequency at 4 days/week.',
  'ppl': 'Push / Pull / Legs — modern hypertrophy staple; hits muscles ~2×/week on a 6-day schedule.',
  'bro-split': 'Classic body-part split: chest, back, legs, shoulders, arms. High volume, once-per-week per group.'
};

function onSplitChange() {
  const split = document.getElementById('split').value;
  const hint = document.getElementById('splitHint');
  const broNote = document.getElementById('broSplitNote');
  if (hint) hint.textContent = SPLIT_HINTS[split] || SPLIT_HINTS['full-body'];
  if (broNote) {
    broNote.classList.toggle('hidden', split !== 'bro-split');
  }

  // Nudge toward a classic 5-day bro schedule when the user picks bro split
  // and still has the default 3-day selection.
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

function getCriteria() {
  const equipment = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(cb => cb.value);
  const restrictions = Array.from(document.querySelectorAll('input[name="restrictions"]:checked')).map(cb => cb.value);
  return {
    weeks: parseInt(document.getElementById('weeks').value, 10),
    daysPerWeek: parseInt(document.getElementById('daysPerWeek').value, 10),
    workoutDays: Array.from(document.querySelectorAll('input[name="workoutDay"]:checked')).map(cb => parseInt(cb.value, 10)).sort((a, b) => a - b),
    sessionMinutes: parseInt(document.getElementById('sessionMinutes').value, 10),
    equipment,
    restrictions,
    split: document.getElementById('split').value,
    goal: document.getElementById('goal').value,
    level: document.getElementById('level').value,
    includeWarmup: document.getElementById('includeWarmup').checked,
    includeCooldown: document.getElementById('includeCooldown').checked,
    favoriteExerciseIds: favoriteExerciseIds.slice(),
    progression: document.getElementById('progression')?.value || 'linear'
  };
}

const PROGRESSION_HINTS = {
  linear: 'Each week gets a little harder, with planned lighter “recovery” weeks so you can keep improving without burning out.',
  wave: 'Volume weeks (more sets) alternate with intensity weeks (harder effort). Great if you like variety.',
  block: 'A “build” phase, then a harder “push” phase, then recovery. Best for plans of 6+ weeks.',
  none: 'Same style of workouts every week — simple and consistent, with less automatic change.'
};

async function loadFavorites() {
  favoriteExerciseIds = [];
  try {
    const response = await fetch('/api/user/favorites', { credentials: 'include' });
    if (!response.ok) return;
    const ids = await response.json();
    favoriteExerciseIds = Array.isArray(ids) ? ids : [];
  } catch {
    // anonymous / offline — keep empty
  }
}

function isFavorite(exerciseId) {
  return favoriteExerciseIds.some(id => id.toLowerCase() === String(exerciseId).toLowerCase());
}

async function toggleFavorite(exerciseId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Sign in to save favorites.', 'info');
    openAuthModal();
    return;
  }

  const favorited = isFavorite(exerciseId);
  try {
    const response = await fetch(`/api/user/favorites/${encodeURIComponent(exerciseId)}`, {
      method: favorited ? 'DELETE' : 'POST',
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Request failed');
    if (favorited) {
      favoriteExerciseIds = favoriteExerciseIds.filter(id => id.toLowerCase() !== exerciseId.toLowerCase());
      if (typeof showToast === 'function') showToast('Removed from favorites.', 'info', 1800);
    } else {
      favoriteExerciseIds.push(exerciseId);
      if (typeof showToast === 'function') showToast('Added to favorites.', 'success', 1800);
    }
    if (currentPlan) renderPlan(currentPlan);
    if (!document.getElementById('exercisePickerModal').classList.contains('hidden')) {
      renderExerciseList();
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('Could not update favorite.', 'error');
  }
}

function exerciseThumbHtml(imageUrl, name, sizeClass = 'ex-thumb') {
  if (!imageUrl) {
    return `<div class="${sizeClass} ${sizeClass}--placeholder" aria-hidden="true">💪</div>`;
  }
  return `<img class="${sizeClass}" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" onerror="this.classList.add('ex-thumb--broken'); this.alt='';" />`;
}

function favoriteButtonHtml(exerciseId) {
  const on = isFavorite(exerciseId);
  return `<button type="button" class="fav-btn ${on ? 'fav-btn--on' : ''}" title="${on ? 'Remove favorite' : 'Add favorite'}"
    onclick="toggleFavorite('${escapeHtml(exerciseId)}', event)" aria-pressed="${on}">${on ? '★' : '☆'}</button>`;
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
    currentPreferences = {
      defaultEquipment: prefs.defaultEquipment || ['dumbbells', 'bodyweight'],
      defaultMusic: prefs.defaultMusic || false,
      defaultVoice: prefs.defaultVoice || false,
      defaultMotionSensor: prefs.defaultMotionSensor || false,
      defaultVolume: prefs.defaultVolume ?? 20
    };
  } catch {
    // leave defaults
  }
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

  document.getElementById('prefMusic').checked = currentPreferences.defaultMusic;
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
  const dto = {
    defaultEquipment: equipment,
    defaultMusic: document.getElementById('prefMusic').checked,
    defaultVoice: document.getElementById('prefVoice').checked,
    defaultMotionSensor: document.getElementById('prefMotion').checked,
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
    currentPreferences = { ...dto };
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

async function generate() {
  clearStatus();
  const criteria = getCriteria();

  if (criteria.equipment.length === 0) {
    setStatus('Please select at least one equipment option.');
    return;
  }

  const btn = document.getElementById('generateBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Creating...';
  btn.disabled = true;

  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(criteria)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Server returned ${response.status}`);
    }

    const result = await response.json();
    currentPlan = result;
    currentPlanId = null;
    localStorage.setItem('workoutPlan', JSON.stringify(result));
    renderPlan(result);
    if (typeof showToast === 'function') showToast('Plan ready — scroll down to review or start.', 'success');
  } catch (err) {
    setStatus(`Could not create plan: ${err.message}`);
    if (typeof showToast === 'function') showToast(`Could not create plan: ${err.message}`, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function renderPlan(result) {
  const container = document.getElementById('planOutput');
  container.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'mb-6';
  const progressionLabel = ({
    linear: 'Steady progress',
    wave: 'Wave progression',
    block: 'Block periodization',
    none: 'Steady (no ramp)'
  })[result.criteria.progression] || capitalize(result.criteria.progression || 'linear');
  summary.innerHTML = `
    <h2 class="text-2xl font-bold mb-2">Your ${result.criteria.weeks}-week plan</h2>
    <p class="text-gray-700">
      ${formatWorkoutDays(result.criteria.workoutDays, result.criteria.daysPerWeek)} • ${result.criteria.sessionMinutes} min sessions
      • ${capitalize(result.criteria.split || 'full-body')} split
      • ${capitalize(result.criteria.goal)}
      • ${capitalize(result.criteria.level)}
      • ${progressionLabel}
    </p>
    ${result.progressionSummary ? `<p class="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3">${escapeHtml(result.progressionSummary)}</p>` : ''}
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
        const list = day.exercises.map((ex, exIndex) => `
          <li class="mb-3 flex gap-3">
            ${exerciseThumbHtml(ex.imageUrl, ex.name)}
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <span class="font-medium">${escapeHtml(ex.name)}</span>
                <div class="flex items-center gap-1 shrink-0">
                  ${favoriteButtonHtml(ex.id)}
                  ${ex.demoUrl ? `<a href="${escapeHtml(ex.demoUrl)}" target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline whitespace-nowrap">Demo</a>` : ''}
                  <button onclick="deleteExerciseFromDay(${weekIndex}, ${dayIndex}, ${exIndex})" class="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              </div>
              <div class="text-sm text-gray-700">${ex.sets} sets × ${escapeHtml(ex.repsDisplay)} <span class="text-gray-500">(${ex.rest}s rest)</span></div>
              <div class="text-xs text-gray-500">${escapeHtml((ex.primary || []).join(', '))}</div>
            </div>
          </li>
        `).join('');

        card.innerHTML = `
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold">${day.day}</span>
            <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">${day.focus || 'Workout'}</span>
          </div>
          <div class="text-sm text-gray-600 mb-2">~${day.estimatedMinutes} min</div>
          <ul class="text-sm">${list}</ul>
          <div class="mt-3 flex flex-wrap gap-2">
            <button onclick="openExercisePicker(${weekIndex}, ${dayIndex})" class="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold py-1 px-2 rounded">+ Add exercise</button>
            <button onclick="toggleDayType(${weekIndex}, ${dayIndex})" class="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-1 px-2 rounded">Make rest day</button>
          </div>
          <div class="mt-2 text-xs text-blue-700 italic">${day.exercises[0]?.progression || ''}</div>
        `;
      }

      grid.appendChild(card);
    });

    container.appendChild(weekEl);
  });

  document.getElementById('results').classList.remove('hidden');
  startWorkoutBtn.classList.remove('hidden');
  startWorkoutBtn.href = currentPlanId ? `/workout.html?planId=${currentPlanId}` : '/workout.html';
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
  const transition = 30;
  let timeUsed = day.exercises.reduce((sum, ex) => sum + ex.sets * (ex.workDuration + ex.rest) + transition, 0);
  const includeWarmup = currentPlan.criteria.includeWarmup ? 180 : 0;
  const includeCooldown = currentPlan.criteria.includeCooldown ? 120 : 0;
  day.estimatedMinutes = Math.max(0, Math.round((timeUsed + includeWarmup + includeCooldown) / 60));
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
  const favoritesOnly = document.getElementById('exerciseFavoritesOnly')?.checked;
  const container = document.getElementById('exerciseList');
  let filtered = allExercises.filter(ex =>
    ex.name.toLowerCase().includes(query) ||
    (ex.slot || '').toLowerCase().includes(query) ||
    (ex.primary || []).some(p => p.toLowerCase().includes(query))
  );

  if (favoritesOnly) {
    filtered = filtered.filter(ex => isFavorite(ex.id));
  }

  // Favorites first
  filtered = filtered.slice().sort((a, b) => {
    const af = isFavorite(a.id) ? 1 : 0;
    const bf = isFavorite(b.id) ? 1 : 0;
    if (af !== bf) return bf - af;
    return a.name.localeCompare(b.name);
  });

  container.innerHTML = filtered.map(ex => `
    <div class="flex items-stretch gap-2 border rounded-md p-2 hover:bg-blue-50 transition">
      ${exerciseThumbHtml(ex.imageUrl, ex.name, 'ex-thumb ex-thumb--sm')}
      <button type="button" onclick="selectExerciseForDay('${escapeHtml(ex.id)}')" class="flex-1 text-left min-w-0">
        <div class="font-medium flex items-center gap-1">
          ${escapeHtml(ex.name)}
          ${isFavorite(ex.id) ? '<span class="text-amber-500 text-xs" title="Favorite">★</span>' : ''}
        </div>
        <div class="text-xs text-gray-500 truncate">${escapeHtml(ex.slot)} • ${escapeHtml((ex.primary || []).join(', '))} • ${escapeHtml((ex.equipment || []).join(', '))}</div>
      </button>
      ${favoriteButtonHtml(ex.id)}
    </div>
  `).join('');

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-sm text-gray-500">${favoritesOnly ? 'No favorite exercises match. Star exercises to build your list.' : 'No exercises found.'}</p>`;
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
