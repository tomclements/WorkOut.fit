let sessions = [];

const loginSection = document.getElementById('loginSection');
const historySection = document.getElementById('historySection');
const sessionsList = document.getElementById('sessionsList');
const sessionModal = document.getElementById('sessionModal');
const sessionModalBody = document.getElementById('sessionModalBody');

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  document.getElementById('closeSessionModal').addEventListener('click', closeSessionModal);
  sessionModal.addEventListener('click', e => {
    if (e.target.id === 'sessionModal') closeSessionModal();
  });
});

async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (response.ok) {
      loginSection.classList.add('hidden');
      historySection.classList.remove('hidden');
      await loadHistory();
      return;
    }
  } catch { }
  loginSection.classList.remove('hidden');
  historySection.classList.add('hidden');
  const returnUrl = '/?returnUrl=' + encodeURIComponent(window.location.pathname + window.location.search);
  document.getElementById('loginLink').href = returnUrl;
  setTimeout(() => { window.location.href = returnUrl; }, 500);
}

async function loadHistory() {
  try {
    const response = await fetch('/api/runner/sessions', { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load history');
    sessions = await response.json();
    renderSummary();
    renderSessions();
  } catch (err) {
    sessionsList.innerHTML = `<p class="p-4 text-sm text-red-600">Could not load history: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSummary() {
  const totalSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
  const totalSets = sessions.reduce((sum, s) => sum + (s.totalSets || 0), 0);
  const totalReps = sessions.reduce((sum, s) => sum + (s.totalReps || 0), 0);

  document.getElementById('statWorkouts').textContent = sessions.length;
  document.getElementById('statMinutes').textContent = Math.floor(totalSeconds / 60);
  document.getElementById('statSets').textContent = totalSets;
  document.getElementById('statReps').textContent = totalReps;
}

function renderSessions() {
  if (!sessions.length) {
    sessionsList.innerHTML = `
      <div class="p-5 text-sm text-gray-600">
        <p class="font-medium text-gray-800 mb-1">No completed workouts yet</p>
        <p class="text-gray-500 mb-3">Generate a plan, open the runner, finish a session, and save it — history will show up here.</p>
        <div class="flex flex-wrap gap-2">
          <a href="/" class="inline-block text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-md">Go to planner</a>
          <a href="/workout.html" class="inline-block text-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-3 rounded-md">Open runner</a>
        </div>
      </div>`;
    return;
  }

  const rows = sessions.map((s, index) => `
    <div class="p-4 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 transition" onclick="showSessionDetails(${index})">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-medium">${escapeHtml(s.planName || 'Workout')}</div>
          <div class="text-xs text-gray-500">${formatDate(s.startedAt)}</div>
        </div>
        <div class="text-right text-sm text-gray-700">
          <div>${formatDuration(s.durationSeconds)}</div>
          <div class="text-xs text-gray-500">${s.totalSets || 0} sets • ${s.totalReps || 0} reps</div>
        </div>
      </div>
    </div>
  `).join('');

  sessionsList.innerHTML = rows;
}

async function showSessionDetails(index) {
  const summary = sessions[index];
  if (!summary) return;

  sessionModalBody.innerHTML = `<p class="text-sm text-gray-500">Loading details...</p>`;
  sessionModal.classList.remove('hidden');

  try {
    const response = await fetch(`/api/runner/sessions/${summary.id}`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load session details');
    const s = await response.json();

    document.getElementById('sessionModalTitle').textContent = s.planName || 'Workout';
    const totalSets = (s.exercises || []).reduce((sum, ex) => sum + (ex.sets || []).length, 0);
    const totalReps = (s.exercises || []).reduce((sum, ex) => sum + (ex.sets || []).reduce((a, set) => a + (set.reps || 0), 0), 0);

    sessionModalBody.innerHTML = `
      <div class="text-sm text-gray-600 mb-4">
        ${formatDate(s.startedAt)} • ${formatDuration(s.durationSeconds)} • ${totalSets} sets • ${totalReps} reps
      </div>
      <div class="space-y-3">
        ${(s.exercises || []).map(ex => `
          <div class="border rounded-md p-3">
            <div class="font-medium">${escapeHtml(ex.exerciseName || 'Exercise')}</div>
            <div class="text-sm text-gray-700 mt-1">
              ${(ex.sets || []).map((set, i) => `
                <span class="inline-block bg-gray-100 rounded px-2 py-1 mr-2 mb-1 text-xs">
                  Set ${i + 1}: ${set.reps || 0} reps${set.durationSeconds ? ` • ${formatDuration(set.durationSeconds)}` : ''}
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    sessionModalBody.innerHTML = `<p class="text-sm text-red-600">Could not load details: ${escapeHtml(err.message)}</p>`;
  }
}

function closeSessionModal() {
  sessionModal.classList.add('hidden');
}

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString();
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
