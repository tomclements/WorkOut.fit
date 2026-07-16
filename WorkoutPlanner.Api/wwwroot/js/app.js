let currentUser = null;
let currentRoles = [];
let currentPlan = null;
let currentPlanId = null;
let isLoginMode = true;

const welcomeSection = document.getElementById('welcomeSection');
const dashboardSection = document.getElementById('dashboardSection');
const plannerSection = document.getElementById('plannerSection');
const adminLink = document.getElementById('adminLink');
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
  loadDefaults();
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
  });

  closePlannerBtn.addEventListener('click', () => {
    plannerSection.classList.add('hidden');
    closePlannerBtn.classList.add('hidden');
    togglePlannerBtn.classList.remove('hidden');
  });

  document.querySelectorAll('input[type=range]').forEach(input => {
    input.addEventListener('input', updateRangeLabel);
  });

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
});

function updateRangeLabel(e) {
  const input = e.target;
  const label = input.id === 'daysPerWeek' ? document.getElementById('daysLabel') : document.getElementById('minutesLabel');
  if (label) label.textContent = input.value;
}

function getCriteria() {
  const equipment = Array.from(document.querySelectorAll('input[name="equipment"]:checked')).map(cb => cb.value);
  const restrictions = Array.from(document.querySelectorAll('input[name="restrictions"]:checked')).map(cb => cb.value);
  return {
    weeks: parseInt(document.getElementById('weeks').value, 10),
    daysPerWeek: parseInt(document.getElementById('daysPerWeek').value, 10),
    sessionMinutes: parseInt(document.getElementById('sessionMinutes').value, 10),
    equipment,
    restrictions,
    goal: document.getElementById('goal').value,
    level: document.getElementById('level').value,
    includeWarmup: document.getElementById('includeWarmup').checked,
    includeCooldown: document.getElementById('includeCooldown').checked
  };
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
    const equipment = await response.json();
    const container = document.getElementById('equipmentContainer');
    container.innerHTML = '';

    equipment.forEach(item => {
      const label = document.createElement('label');
      label.className = 'inline-flex items-center';
      const checked = (item.id === 'dumbbells' || item.id === 'bodyweight') ? 'checked' : '';
      label.innerHTML = `<input type="checkbox" name="equipment" value="${escapeHtml(item.id)}" ${checked} class="rounded text-blue-600" /><span class="ml-2 text-sm">${escapeHtml(item.name)}</span>`;
      container.appendChild(label);
    });
  } catch (err) {
    document.getElementById('equipmentContainer').innerHTML = `<span class="text-sm text-red-600">Could not load equipment: ${escapeHtml(err.message)}</span>`;
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
  const section = document.getElementById('authSection');
  section.innerHTML = `
    <span class="text-sm text-gray-700">${escapeHtml(email)}</span>
    <button id="logoutBtn" class="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold py-2 px-4 rounded-md transition">Log out</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', logout);

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
  document.getElementById('statPlans').textContent = data.totalPlans || 0;
  document.getElementById('statWorkouts').textContent = data.totalSessions || 0;
  document.getElementById('statMinutes').textContent = Math.floor((data.totalDurationSeconds || 0) / 60);
  document.getElementById('statSets').textContent = data.totalSets || 0;

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
    savedPlansTable.innerHTML = `<p class="p-4 text-sm text-gray-500">You haven't saved any plans yet.</p>`;
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
    recentActivity.innerHTML = `<p class="p-4 text-sm text-gray-500">No workouts yet. Start a workout from one of your plans above.</p>`;
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
    loadDashboard();
  } catch (err) {
    setStatus(`Could not save plan: ${err.message}`);
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
  } catch (err) {
    setStatus(`Could not create plan: ${err.message}`);
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
  summary.innerHTML = `
    <h2 class="text-2xl font-bold mb-2">Your ${result.criteria.weeks}-week plan</h2>
    <p class="text-gray-700">
      ${result.criteria.daysPerWeek} days/week • ${result.criteria.sessionMinutes} min sessions
      • ${capitalize(result.criteria.goal)} • ${capitalize(result.criteria.level)}
    </p>
  `;
  container.appendChild(summary);

  result.plan.forEach(week => {
    const weekEl = document.createElement('section');
    weekEl.className = 'mb-8';
    weekEl.innerHTML = `
      <h3 class="text-xl font-semibold mb-3 border-b pb-1">Week ${week.week}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 days-grid"></div>
    `;
    const grid = weekEl.querySelector('.days-grid');

    week.days.forEach(day => {
      const card = document.createElement('div');
      card.className = 'border rounded-lg p-4 shadow-sm ' + (day.type === 'rest' ? 'bg-gray-50' : 'bg-white');

      if (day.type === 'rest') {
        card.innerHTML = `
          <div class="font-semibold text-gray-500">${day.day}</div>
          <div class="text-sm text-gray-600">${day.note || 'Rest / mobility'}</div>
        `;
      } else {
        const list = day.exercises.map(ex => `
          <li class="mb-2">
            <div class="flex items-start justify-between">
              <span class="font-medium">${ex.name}</span>
              ${ex.demoUrl ? `<a href="${ex.demoUrl}" target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline whitespace-nowrap ml-2">Demo</a>` : ''}
            </div>
            <div class="text-sm text-gray-700">${ex.sets} sets × ${ex.repsDisplay} <span class="text-gray-500">(${ex.rest}s rest)</span></div>
            <div class="text-xs text-gray-500">${ex.primary.join(', ')}</div>
          </li>
        `).join('');

        card.innerHTML = `
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold">${day.day}</span>
            <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">${day.focus}</span>
          </div>
          <div class="text-sm text-gray-600 mb-2">~${day.estimatedMinutes} min</div>
          <ul class="text-sm">${list}</ul>
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

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
