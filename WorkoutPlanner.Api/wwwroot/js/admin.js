let equipmentList = [];
let exercisesList = [];
/** @type {Set<string>} exercise ids that have /demos/{id}.webp on the server */
let webpDemoIds = new Set();

document.addEventListener('DOMContentLoaded', () => {
  checkAdmin();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('exerciseForm').addEventListener('submit', saveExercise);
  document.getElementById('exCancelBtn').addEventListener('click', resetExerciseForm);
  document.getElementById('exId').addEventListener('input', () => {
    updateExerciseWebpPreview(document.getElementById('exId').value.trim());
  });
  document.getElementById('exImageUrl').addEventListener('input', () => {
    updateExerciseWebpPreview(document.getElementById('exId').value.trim());
  });

  document.getElementById('equipmentForm').addEventListener('submit', saveEquipment);
  document.getElementById('eqCancelBtn').addEventListener('click', resetEquipmentForm);

  document.getElementById('userForm').addEventListener('submit', addAdminUser);
  document.getElementById('refreshExercisesBtn').addEventListener('click', refreshExercisesFromSource);
  document.getElementById('refreshFeedbackBtn')?.addEventListener('click', loadFeedback);
  document.getElementById('feedbackUnreadOnly')?.addEventListener('change', loadFeedback);
});

async function checkAdmin() {
  try {
    const response = await fetch('/api/admin/me', { credentials: 'include' });
    if (response.ok) {
      document.getElementById('loginSection').classList.add('hidden');
      document.getElementById('adminSection').classList.remove('hidden');
      await Promise.all([
        loadEquipment(),
        loadWebpDemoIndex(),
        loadExercises(),
        loadUsers(),
        loadLibraryStats(),
        loadFeedback()
      ]);
      return;
    }
  } catch { }
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('adminSection').classList.add('hidden');
  const returnUrl = '/?returnUrl=' + encodeURIComponent(window.location.pathname + window.location.search);
  document.getElementById('loginLink').href = returnUrl;
  // If not signed in, send the user to the main page to sign in and come back.
  // User can click the "Sign in now" link — no auto-redirect
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('active-tab', 'border-blue-600', 'text-blue-600');
      btn.classList.remove('border-transparent', 'text-gray-500');
    } else {
      btn.classList.remove('active-tab', 'border-blue-600', 'text-blue-600');
      btn.classList.add('border-transparent', 'text-gray-500');
    }
  });
  document.getElementById('exercisesTab').classList.toggle('hidden', tab !== 'exercises');
  document.getElementById('equipmentTab').classList.toggle('hidden', tab !== 'equipment');
  document.getElementById('feedbackTab')?.classList.toggle('hidden', tab !== 'feedback');
  document.getElementById('usersTab').classList.toggle('hidden', tab !== 'users');
  if (tab === 'feedback') loadFeedback();
}

async function loadFeedback() {
  const list = document.getElementById('feedbackList');
  const empty = document.getElementById('feedbackEmpty');
  if (!list) return;
  const unreadOnly = document.getElementById('feedbackUnreadOnly')?.checked ? 'true' : 'false';
  try {
    const res = await fetch(`/api/admin/feedback?take=100&unreadOnly=${unreadOnly}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load');
    const items = await res.json();
    if (!items.length) {
      list.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');
    list.innerHTML = items.map(f => {
      const when = f.createdAt ? new Date(f.createdAt).toLocaleString() : '';
      const contact = f.contactEmail || f.userEmail || '—';
      const badge = f.isRead
        ? '<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Read</span>'
        : '<span class="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-semibold">New</span>';
      const markBtn = f.isRead
        ? ''
        : `<button type="button" data-mark-read="${f.id}" class="text-xs text-blue-700 font-semibold hover:underline">Mark read</button>`;
      return `
        <article class="bg-white rounded-xl shadow p-4 border ${f.isRead ? 'border-gray-100' : 'border-amber-200'}">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-2 flex-wrap">
              ${badge}
              <span class="text-xs font-semibold uppercase tracking-wide text-blue-800">${escapeHtml(f.category || '')}</span>
              <span class="text-xs text-gray-500">#${f.id} · ${escapeHtml(when)}</span>
            </div>
            ${markBtn}
          </div>
          <p class="text-sm text-gray-900 whitespace-pre-wrap mb-2">${escapeHtml(f.message || '')}</p>
          <div class="text-xs text-gray-500">Contact: ${escapeHtml(contact)}${f.pageUrl ? ` · <a class="text-blue-600 hover:underline" href="${escapeHtml(f.pageUrl)}">${escapeHtml(f.pageUrl)}</a>` : ''}</div>
        </article>`;
    }).join('');

    list.querySelectorAll('[data-mark-read]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-mark-read');
        await fetch(`/api/admin/feedback/${id}/read`, { method: 'POST', credentials: 'include' });
        await loadFeedback();
      });
    });
  } catch {
    list.innerHTML = '<p class="text-sm text-red-600">Could not load feedback.</p>';
  }
}

async function loadEquipment() {
  const response = await fetch('/api/admin/equipment', { credentials: 'include' });
  equipmentList = await response.json();
  renderEquipmentTable();
  renderExerciseEquipmentCheckboxes();
}

async function loadWebpDemoIndex() {
  webpDemoIds = new Set();
  try {
    const res = await fetch('/demos/index.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    (data.ids || []).forEach(id => webpDemoIds.add(id));
  } catch {
    // index missing — table will fall back to probing is less ideal; leave empty
  }
}

function hasWebpDemo(id) {
  return !!(id && webpDemoIds.has(id));
}

async function loadExercises() {
  const response = await fetch('/api/admin/exercises', { credentials: 'include' });
  exercisesList = await response.json();
  // Ensure index is loaded before rendering WebP column
  if (webpDemoIds.size === 0) await loadWebpDemoIndex();
  renderExercisesTable();
}

async function loadLibraryStats() {
  try {
    const response = await fetch('/api/admin/exercises/stats', { credentials: 'include' });
    if (!response.ok) return;
    const stats = await response.json();
    document.getElementById('statTotalExercises').textContent = stats.totalExercises ?? 0;
    document.getElementById('statWithImages').textContent = stats.withImages ?? 0;
    document.getElementById('statTotalEquipment').textContent = stats.totalEquipment ?? 0;
  } catch {
    if (typeof showToast === 'function') showToast('Could not load library stats.', 'error');
  }
}

async function refreshExercisesFromSource() {
  const force = document.getElementById('refreshForce').checked;
  const msg = force
    ? 'Force overwrite will update existing exercises from free-exercise-db (manual name/equipment edits on those IDs may be replaced). Continue?'
    : 'Import new exercises from free-exercise-db? Existing exercises will be left unchanged.';
  if (typeof showConfirm === 'function') {
    if (!await showConfirm('Refresh exercises', msg)) return;
  } else {
    if (!confirm(msg)) return;
  }

  const btn = document.getElementById('refreshExercisesBtn');
  const spinner = document.getElementById('refreshSpinner');
  const status = document.getElementById('refreshStatus');
  btn.disabled = true;
  spinner.classList.remove('hidden');
  status.classList.add('hidden');

  try {
    const response = await fetch(`/api/admin/exercises/refresh?force=${force}`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !(data.added || data.updated)) {
      throw new Error(data.errors?.[0] || data.title || `Refresh failed (${response.status})`);
    }

    status.className = 'mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3';
    status.innerHTML = `
      <div class="font-semibold mb-1">Refresh complete</div>
      <div>Added: <strong>${data.added ?? 0}</strong> · Updated: <strong>${data.updated ?? 0}</strong> ·
      Duplicates skipped: <strong>${data.duplicates ?? 0}</strong> · Category/equipment skipped: <strong>${data.skipped ?? 0}</strong></div>
      <div>Equipment added: <strong>${data.equipmentAdded ?? 0}</strong> · Total exercises: <strong>${data.totalExercises ?? '—'}</strong></div>
      ${data.seedFileUpdated ? `<div class="mt-1 text-xs">Seed file updated${data.backupPath ? ` (backup: ${escapeHtml(data.backupPath)})` : ''}.</div>` : ''}
      ${(data.errors && data.errors.length) ? `<div class="mt-2 text-amber-700 text-xs">Notes: ${data.errors.map(escapeHtml).join('; ')}</div>` : ''}
    `;
    status.classList.remove('hidden');
    if (typeof showToast === 'function') {
      showToast(`Import finished: +${data.added || 0} new exercises`, 'success');
    }
    await Promise.all([loadEquipment(), loadExercises(), loadLibraryStats()]);
  } catch (err) {
    status.className = 'mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3';
    status.textContent = 'Refresh failed: ' + err.message;
    status.classList.remove('hidden');
    if (typeof showToast === 'function') showToast('Exercise refresh failed.', 'error');
  } finally {
    btn.disabled = false;
    spinner.classList.add('hidden');
  }
}

async function loadUsers() {
  try {
    const response = await fetch('/api/admin/all-users', { credentials: 'include' });
    if (!response.ok) {
      // Fallback to admin-only list if the new endpoint isn't available yet
      const fallback = await fetch('/api/admin/users', { credentials: 'include' });
      const admins = await fallback.json();
      renderUsersTable(admins.map(u => ({ ...u, isAdmin: true })));
      return;
    }
    const users = await response.json();
    renderUsersTable(users);
  } catch {
    renderUsersTable([]);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  const empty = document.getElementById('usersEmpty');
  if (!users.length) {
    tbody.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tbody.innerHTML = users.map(u => {
    const roleBadge = u.isAdmin
      ? '<span class="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">Admin</span>'
      : '<span class="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">User</span>';
    const toggleBtn = u.isAdmin
      ? `<button onclick="toggleAdminRole('${escapeHtml(u.id)}', false)" class="text-amber-700 hover:underline text-xs font-semibold">Remove admin</button>`
      : `<button onclick="toggleAdminRole('${escapeHtml(u.id)}', true)" class="text-blue-700 hover:underline text-xs font-semibold">Make admin</button>`;
    const lockBadge = u.lockoutEnd && new Date(u.lockoutEnd) > new Date()
      ? ' <span class="text-xs text-red-600 font-semibold">Locked</span>'
      : '';
    return `
    <tr>
      <td class="p-3">${escapeHtml(u.email || '—')}${lockBadge}</td>
      <td class="p-3">${roleBadge}</td>
      <td class="p-3 flex gap-3">
        ${toggleBtn}
      </td>
    </tr>`;
  }).join('');
}

async function toggleAdminRole(userId, add) {
  const label = add ? 'Grant admin' : 'Remove admin';
  const msg = add
    ? 'Grant admin privileges to this user?'
    : 'Remove admin privileges from this user?';
  if (typeof showConfirm === 'function') {
    if (!await showConfirm(label, msg)) return;
  } else {
    if (!confirm(msg)) return;
  }
  try {
    const response = await fetch(`/api/admin/all-users/${userId}/role?add=${add}`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(data || `Failed (${response.status})`, 'error');
      else alert(data || `Failed (${response.status})`);
      return;
    }
    if (typeof showToast === 'function') showToast(add ? 'Admin granted' : 'Admin removed', 'success');
    await loadUsers();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
    else alert('Error: ' + err.message);
  }
}

async function addAdminUser(e) {
  e.preventDefault();
  const email = document.getElementById('userEmail').value.trim();
  const error = document.getElementById('userError');
  error.classList.add('hidden');

  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      error.textContent = data.title || data.detail || `Failed to add admin (${response.status})`;
      error.classList.remove('hidden');
      return;
    }
    document.getElementById('userForm').reset();
    if (typeof showToast === 'function') showToast('Admin user added', 'success');
    await loadUsers();
  } catch (err) {
    error.textContent = 'Error adding admin: ' + err.message;
    error.classList.remove('hidden');
  }
}

function renderEquipmentTable() {
  const tbody = document.getElementById('equipmentTableBody');
  tbody.innerHTML = equipmentList.map(eq => `
    <tr>
      <td class="p-3">${escapeHtml(eq.id)}</td>
      <td class="p-3">${escapeHtml(eq.name)}</td>
      <td class="p-3">${escapeHtml(eq.category || '')}</td>
      <td class="p-3 flex gap-2">
        <button onclick="editEquipment('${escapeHtml(eq.id)}')" class="text-blue-600 hover:underline">Edit</button>
        <button onclick="deleteEquipment('${escapeHtml(eq.id)}')" class="text-red-600 hover:underline">Delete</button>
      </td>
    </tr>
  `).join('');
}

function renderExerciseEquipmentCheckboxes() {
  const container = document.getElementById('exEquipmentContainer');
  container.innerHTML = equipmentList.map(eq => `
    <label class="inline-flex items-center">
      <input type="checkbox" name="exEquipment" value="${escapeHtml(eq.id)}" class="rounded text-blue-600" />
      <span class="ml-2 text-sm">${escapeHtml(eq.name)}</span>
    </label>
  `).join('');
}

function exerciseWebpPath(id) {
  if (!id) return '';
  return `/demos/${encodeURIComponent(id)}.webp`;
}

function renderExercisesTable() {
  const tbody = document.getElementById('exercisesTableBody');
  tbody.innerHTML = exercisesList.map(ex => {
    const webp = exerciseWebpPath(ex.id);
    // Use demos/index.json — stick demos exist without imageUrl
    const hasWebp = hasWebpDemo(ex.id);
    return `
    <tr>
      <td class="p-3 font-medium">${escapeHtml(ex.name)}</td>
      <td class="p-3">${escapeHtml(ex.slot)}</td>
      <td class="p-3">${escapeHtml(ex.level)}</td>
      <td class="p-3">${escapeHtml((ex.equipment || []).join(', '))}</td>
      <td class="p-3">${ex.baseSets} × ${escapeHtml(ex.isTimeBased ? ex.repsMin + '-' + ex.repsMax + ' sec' : ex.repsMin + '-' + ex.repsMax)}</td>
      <td class="p-3">${escapeHtml((ex.avoidFor || []).join(', '))}</td>
      <td class="p-3">${ex.demoUrl ? `<a href="${escapeHtml(ex.demoUrl)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline">${/exrx\.net/i.test(ex.demoUrl || '') ? 'ExRx' : 'Demo'}</a>` : '-'}</td>
      <td class="p-3">${hasWebp
        ? `<a href="${webp}" target="_blank" rel="noopener" class="text-blue-600 hover:underline" title="${webp}">WebP</a>`
        : '<span class="text-gray-400" title="No file in /demos">—</span>'}</td>
      <td class="p-3 flex gap-2">
        <button onclick="editExercise('${escapeHtml(ex.id)}')" class="text-blue-600 hover:underline">Edit</button>
        <button onclick="deleteExercise('${escapeHtml(ex.id)}')" class="text-red-600 hover:underline">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function getSelectedEquipment() {
  return Array.from(document.querySelectorAll('input[name="exEquipment"]:checked')).map(cb => cb.value);
}

function setSelectedEquipment(values) {
  document.querySelectorAll('input[name="exEquipment"]').forEach(cb => {
    cb.checked = values.includes(cb.value);
  });
}

async function saveExercise(e) {
  e.preventDefault();
  const originalId = document.getElementById('exOriginalId').value;
  const exercise = {
    id: document.getElementById('exId').value.trim(),
    name: document.getElementById('exName').value.trim(),
    slot: document.getElementById('exSlot').value,
    level: document.getElementById('exLevel').value,
    primary: splitCsv(document.getElementById('exPrimary').value),
    secondary: splitCsv(document.getElementById('exSecondary').value),
    baseSets: parseInt(document.getElementById('exBaseSets').value, 10),
    repsMin: parseInt(document.getElementById('exRepsMin').value, 10),
    repsMax: parseInt(document.getElementById('exRepsMax').value, 10),
    workDuration: parseInt(document.getElementById('exWorkDuration').value, 10),
    restSec: parseInt(document.getElementById('exRestSec').value, 10),
    isTimeBased: document.getElementById('exIsTimeBased').checked,
    demoUrl: document.getElementById('exDemoUrl').value.trim(),
    imageUrl: document.getElementById('exImageUrl').value.trim() || null,
    avoidFor: splitCsv(document.getElementById('exAvoidFor').value),
    equipment: getSelectedEquipment()
  };

  const url = originalId ? `/api/admin/exercises/${encodeURIComponent(originalId)}` : '/api/admin/exercises';
  const method = originalId ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(exercise)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(data.title || data.detail || `Save failed (${response.status})`, 'error');
      else alert(data.title || data.detail || `Save failed (${response.status})`);
      return;
    }
    resetExerciseForm();
    await loadExercises();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error saving exercise: ' + err.message, 'error');
    else alert('Error saving exercise: ' + err.message);
  }
}

function updateExerciseWebpPreview(id) {
  const link = document.getElementById('exWebpDemoLink');
  const status = document.getElementById('exWebpDemoStatus');
  const preview = document.getElementById('exWebpDemoPreview');
  if (!link || !status || !preview) return;

  if (!id) {
    link.textContent = '—';
    link.removeAttribute('href');
    status.textContent = '';
    preview.classList.add('hidden');
    preview.removeAttribute('src');
    return;
  }

  const path = exerciseWebpPath(id);
  link.href = path;
  link.textContent = path;

  // Prefer demos/index.json (includes stick demos with no imageUrl)
  if (hasWebpDemo(id)) {
    status.textContent = 'Available — used in runner';
    status.className = 'ml-2 text-xs text-green-700';
    preview.src = path + '?t=' + Date.now();
    preview.classList.remove('hidden');
    preview.onerror = () => {
      status.textContent = 'In index but file failed to load — redeploy demos';
      status.className = 'ml-2 text-xs text-amber-700';
      preview.classList.add('hidden');
    };
    return;
  }

  // Not in index — still probe (index may be stale)
  status.textContent = 'Checking…';
  status.className = 'ml-2 text-xs text-gray-500';
  preview.classList.add('hidden');

  const probe = new Image();
  probe.onload = () => {
    webpDemoIds.add(id);
    status.textContent = 'Available — used in runner';
    status.className = 'ml-2 text-xs text-green-700';
    preview.src = path + '?t=' + Date.now();
    preview.classList.remove('hidden');
  };
  probe.onerror = () => {
    status.textContent = 'No WebP for this id (FEDB stills, mobility copy, or stick demo)';
    status.className = 'ml-2 text-xs text-gray-500';
    preview.classList.add('hidden');
    preview.removeAttribute('src');
  };
  probe.src = path + '?t=' + Date.now();
}

function editExercise(id) {
  const ex = exercisesList.find(e => e.id === id);
  if (!ex) return;

  document.getElementById('exOriginalId').value = ex.id;
  document.getElementById('exId').value = ex.id;
  document.getElementById('exName').value = ex.name;
  document.getElementById('exSlot').value = ex.slot;
  document.getElementById('exLevel').value = ex.level;
  document.getElementById('exPrimary').value = (ex.primary || []).join(', ');
  document.getElementById('exSecondary').value = (ex.secondary || []).join(', ');
  document.getElementById('exBaseSets').value = ex.baseSets;
  document.getElementById('exRepsMin').value = ex.repsMin;
  document.getElementById('exRepsMax').value = ex.repsMax;
  document.getElementById('exWorkDuration').value = ex.workDuration;
  document.getElementById('exRestSec').value = ex.restSec;
  document.getElementById('exIsTimeBased').checked = ex.isTimeBased;
  document.getElementById('exDemoUrl').value = ex.demoUrl || '';
  document.getElementById('exImageUrl').value = ex.imageUrl || '';
  document.getElementById('exAvoidFor').value = (ex.avoidFor || []).join(', ');
  setSelectedEquipment(ex.equipment || []);
  updateExerciseWebpPreview(ex.id);

  const demoHint = document.getElementById('exDemoUrlHint');
  if (demoHint) {
    if (/exrx\.net/i.test(ex.demoUrl || '')) {
      demoHint.textContent = 'ExRx form page (opens externally; media not embedded).';
      demoHint.classList.remove('hidden');
    } else {
      demoHint.classList.add('hidden');
    }
  }

  document.getElementById('exerciseFormTitle').textContent = 'Edit exercise';
  document.getElementById('exCancelBtn').classList.remove('hidden');
  document.getElementById('exerciseForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetExerciseForm() {
  document.getElementById('exerciseForm').reset();
  document.getElementById('exOriginalId').value = '';
  document.getElementById('exerciseFormTitle').textContent = 'Add exercise';
  document.getElementById('exCancelBtn').classList.add('hidden');
  setSelectedEquipment([]);
  updateExerciseWebpPreview('');
  const demoHint = document.getElementById('exDemoUrlHint');
  if (demoHint) demoHint.classList.add('hidden');
}

async function deleteExercise(id) {
  if (typeof showConfirm === 'function') {
    if (!await showConfirm('Delete exercise', `Delete exercise '${id}'?`)) return;
  } else {
    if (!confirm(`Delete exercise '${id}'?`)) return;
  }
  try {
    const response = await fetch(`/api/admin/exercises/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Delete failed');
    await loadExercises();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error deleting exercise: ' + err.message, 'error');
    else alert('Error deleting exercise: ' + err.message);
  }
}

async function saveEquipment(e) {
  e.preventDefault();
  const originalId = document.getElementById('eqOriginalId').value;
  const equipment = {
    id: document.getElementById('eqId').value.trim(),
    name: document.getElementById('eqName').value.trim(),
    category: document.getElementById('eqCategory').value.trim()
  };

  const url = originalId ? `/api/admin/equipment/${encodeURIComponent(originalId)}` : '/api/admin/equipment';
  const method = originalId ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(equipment)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(data.title || data.detail || `Save failed (${response.status})`, 'error');
      else alert(data.title || data.detail || `Save failed (${response.status})`);
      return;
    }
    resetEquipmentForm();
    await loadEquipment();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error saving equipment: ' + err.message, 'error');
    else alert('Error saving equipment: ' + err.message);
  }
}

function editEquipment(id) {
  const eq = equipmentList.find(e => e.id === id);
  if (!eq) return;

  document.getElementById('eqOriginalId').value = eq.id;
  document.getElementById('eqId').value = eq.id;
  document.getElementById('eqName').value = eq.name;
  document.getElementById('eqCategory').value = eq.category || '';
  document.getElementById('equipmentFormTitle').textContent = 'Edit equipment';
  document.getElementById('eqCancelBtn').classList.remove('hidden');
}

function resetEquipmentForm() {
  document.getElementById('equipmentForm').reset();
  document.getElementById('eqOriginalId').value = '';
  document.getElementById('equipmentFormTitle').textContent = 'Add equipment';
  document.getElementById('eqCancelBtn').classList.add('hidden');
}

async function deleteEquipment(id) {
  if (typeof showConfirm === 'function') {
    if (!await showConfirm('Delete equipment', `Delete equipment '${id}'?`)) return;
  } else {
    if (!confirm(`Delete equipment '${id}'?`)) return;
  }
  try {
    const response = await fetch(`/api/admin/equipment/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (typeof showToast === 'function') showToast(data.title || data.detail || `Delete failed (${response.status})`, 'error');
      else alert(data.title || data.detail || `Delete failed (${response.status})`);
      return;
    }
    await loadEquipment();
  } catch (err) {
    if (typeof showToast === 'function') showToast('Error deleting equipment: ' + err.message, 'error');
    else alert('Error deleting equipment: ' + err.message);
  }
}

function splitCsv(value) {
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}


