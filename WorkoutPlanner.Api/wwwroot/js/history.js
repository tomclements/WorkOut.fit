let sessions = [];
let volumeChart = null;
let minutesChart = null;

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
    renderStreak();
    renderCharts();
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

/** Calendar-day streak ending today or yesterday (still "alive" if last workout was yesterday). */
function computeStreak(sessionList) {
  if (!sessionList.length) return 0;

  const days = new Set(
    sessionList.map(s => {
      const d = new Date(s.startedAt || s.completedAt);
      return dateKey(d);
    })
  );

  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = dateKey(cursor);
  const yesterday = new Date(cursor);
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = dateKey(yesterday);

  // Streak must include today or yesterday
  if (!days.has(todayKey) && !days.has(yKey)) return 0;
  if (!days.has(todayKey)) {
    cursor = yesterday;
  }

  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderStreak() {
  const streak = computeStreak(sessions);
  const badge = document.getElementById('streakBadge');
  const hint = document.getElementById('streakHint');
  if (streak > 0) {
    document.getElementById('streakCount').textContent = String(streak);
    badge.classList.remove('hidden');
    hint.classList.add('hidden');
  } else {
    badge.classList.add('hidden');
    hint.classList.remove('hidden');
  }
}

function lastNDays(n) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
}

function renderCharts() {
  const chartsSection = document.getElementById('chartsSection');
  if (!sessions.length || typeof Chart === 'undefined') {
    chartsSection.classList.add('hidden');
    return;
  }
  chartsSection.classList.remove('hidden');

  const days = lastNDays(30);
  const labels = days.map(d => `${d.getMonth() + 1}/${d.getDate()}`);
  const setsByDay = days.map(() => 0);
  const minutesByDay = days.map(() => 0);
  const indexByKey = Object.fromEntries(days.map((d, i) => [dateKey(d), i]));

  sessions.forEach(s => {
    const d = new Date(s.startedAt || s.completedAt);
    const key = dateKey(d);
    const idx = indexByKey[key];
    if (idx === undefined) return;
    setsByDay[idx] += s.totalSets || 0;
    minutesByDay[idx] += Math.round((s.durationSeconds || 0) / 60);
  });

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: {
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 10 } },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, font: { size: 10 } },
        grid: { color: '#f3f4f6' }
      }
    }
  };

  if (volumeChart) volumeChart.destroy();
  if (minutesChart) minutesChart.destroy();

  volumeChart = new Chart(document.getElementById('volumeChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: setsByDay,
        backgroundColor: 'rgba(37, 99, 235, 0.7)',
        borderRadius: 4,
        maxBarThickness: 14
      }]
    },
    options: commonOptions
  });

  minutesChart = new Chart(document.getElementById('minutesChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: minutesByDay,
        borderColor: 'rgba(5, 150, 105, 1)',
        backgroundColor: 'rgba(5, 150, 105, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4
      }]
    },
    options: commonOptions
  });
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
