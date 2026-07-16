let equipmentList = [];
let exercisesList = [];

document.addEventListener('DOMContentLoaded', () => {
  checkAdmin();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('exerciseForm').addEventListener('submit', saveExercise);
  document.getElementById('exCancelBtn').addEventListener('click', resetExerciseForm);

  document.getElementById('equipmentForm').addEventListener('submit', saveEquipment);
  document.getElementById('eqCancelBtn').addEventListener('click', resetEquipmentForm);

  document.getElementById('userForm').addEventListener('submit', addAdminUser);
});

async function checkAdmin() {
  try {
    const response = await fetch('/api/admin/me', { credentials: 'include' });
    if (response.ok) {
      document.getElementById('loginSection').classList.add('hidden');
      document.getElementById('adminSection').classList.remove('hidden');
      await Promise.all([loadEquipment(), loadExercises(), loadUsers()]);
      return;
    }
  } catch { }
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('adminSection').classList.add('hidden');
  const returnUrl = '/?returnUrl=' + encodeURIComponent(window.location.pathname + window.location.search);
  document.getElementById('loginLink').href = returnUrl;
  // If not signed in, send the user to the main page to sign in and come back.
  setTimeout(() => { window.location.href = returnUrl; }, 500);
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
  document.getElementById('usersTab').classList.toggle('hidden', tab !== 'users');
}

async function loadEquipment() {
  const response = await fetch('/api/admin/equipment', { credentials: 'include' });
  equipmentList = await response.json();
  renderEquipmentTable();
  renderExerciseEquipmentCheckboxes();
}

async function loadExercises() {
  const response = await fetch('/api/admin/exercises', { credentials: 'include' });
  exercisesList = await response.json();
  renderExercisesTable();
}

async function loadUsers() {
  const response = await fetch('/api/admin/users', { credentials: 'include' });
  const users = await response.json();
  renderUsersTable(users);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td class="p-3">${u.id}</td>
      <td class="p-3">${escapeHtml(u.email)}</td>
      <td class="p-3">
        <button onclick="deleteAdminUser(${u.id})" class="text-red-600 hover:underline">Remove</button>
      </td>
    </tr>
  `).join('');
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
    await loadUsers();
  } catch (err) {
    error.textContent = 'Error adding admin: ' + err.message;
    error.classList.remove('hidden');
  }
}

async function deleteAdminUser(id) {
  if (!confirm('Remove this admin user?')) return;
  try {
    const response = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.title || data.detail || `Remove failed (${response.status})`);
      return;
    }
    await loadUsers();
  } catch (err) {
    alert('Error removing admin: ' + err.message);
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

function renderExercisesTable() {
  const tbody = document.getElementById('exercisesTableBody');
  tbody.innerHTML = exercisesList.map(ex => `
    <tr>
      <td class="p-3 font-medium">${escapeHtml(ex.name)}</td>
      <td class="p-3">${escapeHtml(ex.slot)}</td>
      <td class="p-3">${escapeHtml(ex.level)}</td>
      <td class="p-3">${escapeHtml((ex.equipment || []).join(', '))}</td>
      <td class="p-3">${ex.baseSets} × ${escapeHtml(ex.isTimeBased ? ex.repsMin + '-' + ex.repsMax + ' sec' : ex.repsMin + '-' + ex.repsMax)}</td>
      <td class="p-3">${escapeHtml((ex.avoidFor || []).join(', '))}</td>
      <td class="p-3">${ex.demoUrl ? `<a href="${ex.demoUrl}" target="_blank" class="text-blue-600 hover:underline">Demo</a>` : '-'}</td>
      <td class="p-3 flex gap-2">
        <button onclick="editExercise('${escapeHtml(ex.id)}')" class="text-blue-600 hover:underline">Edit</button>
        <button onclick="deleteExercise('${escapeHtml(ex.id)}')" class="text-red-600 hover:underline">Delete</button>
      </td>
    </tr>
  `).join('');
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
      alert(data.title || data.detail || `Save failed (${response.status})`);
      return;
    }
    resetExerciseForm();
    await loadExercises();
  } catch (err) {
    alert('Error saving exercise: ' + err.message);
  }
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
    document.getElementById('exAvoidFor').value = (ex.avoidFor || []).join(', ');
    setSelectedEquipment(ex.equipment || []);

  document.getElementById('exerciseFormTitle').textContent = 'Edit exercise';
  document.getElementById('exCancelBtn').classList.remove('hidden');
}

function resetExerciseForm() {
  document.getElementById('exerciseForm').reset();
  document.getElementById('exOriginalId').value = '';
  document.getElementById('exerciseFormTitle').textContent = 'Add exercise';
  document.getElementById('exCancelBtn').classList.add('hidden');
  setSelectedEquipment([]);
}

async function deleteExercise(id) {
  if (!confirm(`Delete exercise '${id}'?`)) return;
  try {
    const response = await fetch(`/api/admin/exercises/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Delete failed');
    await loadExercises();
  } catch (err) {
    alert('Error deleting exercise: ' + err.message);
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
      alert(data.title || data.detail || `Save failed (${response.status})`);
      return;
    }
    resetEquipmentForm();
    await loadEquipment();
  } catch (err) {
    alert('Error saving equipment: ' + err.message);
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
  if (!confirm(`Delete equipment '${id}'?`)) return;
  try {
    const response = await fetch(`/api/admin/equipment/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.title || data.detail || `Delete failed (${response.status})`);
      return;
    }
    await loadEquipment();
  } catch (err) {
    alert('Error deleting equipment: ' + err.message);
  }
}

function splitCsv(value) {
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
