let currentUser = null;
let currentRoles = [];
let currentPlan = null;
let currentPlanId = null;
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
  // Delegated click handler for data-action buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    switch (action) {
      case 'rate':
        setExerciseRating(btn.dataset.exerciseId, btn.dataset.desired, e);
        break;
      case 'run-plan':
        runPlan(parseInt(btn.dataset.planId, 10));
        break;
      case 'load-plan':
        loadSavedPlan(parseInt(btn.dataset.planId, 10));
        break;
      case 'delete-plan':
        deleteSavedPlan(parseInt(btn.dataset.planId, 10));
        break;
      case 'open-planner':
        document.getElementById('togglePlannerBtn')?.click();
        break;
      case 'delete-weight':
        deleteWeightEntry(parseInt(btn.dataset.id, 10));
        break;
      case 'toggle-day':
        toggleDayType(parseInt(btn.dataset.week, 10), parseInt(btn.dataset.day, 10));
        break;
      case 'make-recovery':
        makeRecoveryDay(parseInt(btn.dataset.week, 10), parseInt(btn.dataset.day, 10));
        break;
      case 'remove-ex':
        deleteExerciseFromDay(parseInt(btn.dataset.week, 10), parseInt(btn.dataset.day, 10), parseInt(btn.dataset.ex, 10));
        break;
      case 'add-ex':
        openExercisePicker(parseInt(btn.dataset.week, 10), parseInt(btn.dataset.day, 10));
        break;
      case 'pick-ex':
        selectExerciseForDay(btn.dataset.exerciseId);
        break;
    }
  });

  // Local defaults first (works for guests), then server prefs overlay when signed in
  loadLocalPlanDefaults();
  await loadPreferences();
  applyPlanDefaultsToForm({ skipBroNudge: true });
  await loadFavorites();
  loadEquipment();
  // Global auth check (site.js) — listen for auth-changed to update planner UI
  window.addEventListener('auth-changed', (e) => {
    const { user, roles } = e.detail;
    if (user) showLoggedIn(user, roles || []);
    else showLoggedOut();
  });
  await initGlobalAuth();
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
  initBodyWeight();
  // Dark mode toggle (matches runner Dark button)
  const contrastBtn = document.getElementById('contrastBtn');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', () => {
      const on = !document.body.classList.contains('high-contrast');
      if (typeof setHighContrast === 'function') setHighContrast(on);
      else {
        document.body.classList.toggle('high-contrast', on);
        try { localStorage.setItem('highContrast', on ? '1' : ''); } catch { /* ignore */ }
      }
      contrastBtn.setAttribute('aria-pressed', String(on));
    });
    if (document.body.classList.contains('high-contrast')) contrastBtn.setAttribute('aria-pressed', 'true');
  }
  // Next workout suggestion card
  updateNextWorkoutCard();
  // Initialize focus traps on modals
  ['preferencesModal', 'exercisePickerModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && typeof initModal === 'function') {
      el._onClose = function() { el.classList.add('hidden'); };
      initModal(el);
    }
  });
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
      if (!currentPlan) {
        const genBtn = document.getElementById('generateBtn');
        if (genBtn) {
          genBtn.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'text-gray-800');
          genBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'text-white');
        }
      }
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
      if (!currentPlan) {
        const genBtn = document.getElementById('generateBtn');
        if (genBtn) {
          genBtn.classList.remove('bg-gray-200', 'hover:bg-gray-300', 'text-gray-800');
          genBtn.classList.add('bg-blue-600', 'hover:bg-blue-700', 'text-white');
        }
      }
    });
  }

  // Deep-link: /?open=account | preferences | auth
  const openParam = new URLSearchParams(window.location.search).get('open');
  if (openParam === 'account' || openParam === 'preferences' || openParam === 'auth') {
    setTimeout(() => {
      if (currentUser && (openParam === 'account' || openParam === 'preferences')) openPreferencesModal();
      else if (!currentUser) openLoginModal();
    }, 200);
  }

  document.querySelectorAll('input[type=range]').forEach(input => {
    input.addEventListener('input', updateRangeLabel);
  });
  document.querySelectorAll('input[name="workoutDay"]').forEach(cb => {
    cb.addEventListener('change', updateDaysLabel);
  });
  renderPrograms();
  const splitEl = document.getElementById('split');
  if (splitEl) splitEl.addEventListener('change', onSplitChange);
  if (splitEl) onSplitChange();
  const mixModeEl = document.getElementById('mixMode');
  if (mixModeEl) {
    mixModeEl.addEventListener('change', () => {
      const hint = document.getElementById('mixModeHint');
      if (hint) hint.textContent = MIX_MODE_HINTS[mixModeEl.value] || MIX_MODE_HINTS.strength;
    });
  }
  const progressionEl = document.getElementById('progression');
  if (progressionEl) {
    progressionEl.addEventListener('change', () => {
      const hint = document.getElementById('progressionHint');
      if (hint) hint.textContent = PROGRESSION_HINTS[progressionEl.value] || PROGRESSION_HINTS.linear;
    });
  }

  // Joint protect / rehab wiring: rehab checks Protect; unchecking Protect unchecks rehab
  document.querySelectorAll('input[data-rehab]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        const protect = document.querySelector(`input[data-protect="${cb.dataset.rehab}"]`);
        if (protect) protect.checked = true;
      }
    });
  });
  document.querySelectorAll('input[data-protect]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (!cb.checked) {
        const rehab = document.querySelector(`input[data-rehab="${cb.dataset.protect}"]`);
        if (rehab) rehab.checked = false;
      }
    });
  });

  // Auth modal
  const openAuthBtnEl = document.getElementById('openAuthBtn');
  if (openAuthBtnEl) openAuthBtnEl.addEventListener('click', openLoginModal);

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
  const label = document.getElementById('minutesLabel');
  if (label) label.textContent = input.value;
}

function updateDaysLabel() {
  const checked = document.querySelectorAll('input[name="workoutDay"]:checked').length;
  const label = document.getElementById('daysLabel');
  if (label) label.textContent = checked;
}

function setWorkoutDaysFromCount(count) {
  const spreadMap = {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6]
  };
  const indices = spreadMap[count] || Array.from({ length: count }, (_, i) => i);
  document.querySelectorAll('input[name="workoutDay"]').forEach((cb, idx) => {
    cb.checked = indices.includes(idx);
  });
  updateDaysLabel();
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
    const days = document.querySelectorAll('input[name="workoutDay"]:checked').length;
    if (days < 4) {
      setWorkoutDaysFromCount(5);
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
  setRangeValue('sessionMinutes', p.defaultSessionMinutes, 'minutesLabel');

  const days = Array.isArray(p.defaultWorkoutDays) && p.defaultWorkoutDays.length
    ? p.defaultWorkoutDays
    : null;
  if (days) {
    document.querySelectorAll('input[name="workoutDay"]').forEach(cb => {
      cb.checked = days.map(Number).includes(parseInt(cb.value, 10));
    });
  } else {
    setWorkoutDaysFromCount(p.defaultDaysPerWeek || 5);
  }
  updateDaysLabel();

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
  const restrictions = Array.from(document.querySelectorAll('input[data-protect]:checked')).map(cb => cb.dataset.protect);
  const rehab = Array.from(document.querySelectorAll('input[data-rehab]:checked')).map(cb => cb.dataset.rehab);
  const workoutDays = Array.from(document.querySelectorAll('input[name="workoutDay"]:checked'))
    .map(cb => parseInt(cb.value, 10))
    .filter(d => !Number.isNaN(d))
    .sort((a, b) => a - b);

  // Always a new seed so the server builds a different mix.
  // Must fit C# int (signed 32-bit): unsigned >>> 0 can exceed Int32.MaxValue and cause 400.
  const seed = options.seed != null
    ? (Math.abs(options.seed | 0) || 1)
    : (((Date.now() % 0x7fffffff) ^ (Math.floor(Math.random() * 1e9) % 0x7fffffff)) || 1);

  // Soft-avoid the previous plan's exercises whenever we already have one
  // (both "Create my plan" again and "Try different exercises")
  const avoidExerciseIds = (options.reshuffle || currentPlan)
    ? collectPreviousExerciseIds()
    : [];

  const criteria = {
    weeks: parseInt(document.getElementById('weeks').value, 10),
    daysPerWeek: workoutDays.length,
    workoutDays,
    sessionMinutes: parseInt(document.getElementById('sessionMinutes').value, 10),
    equipment,
    restrictions,
    rehab,
    // Split and goal are separate fields — always send both explicitly
    split: document.getElementById('split').value || 'full-body',
    goal: document.getElementById('goal').value || 'hypertrophy',
    level: document.getElementById('level').value || 'beginner',
    includeWarmup: document.getElementById('includeWarmup').checked,
    includeCooldown: document.getElementById('includeCooldown').checked,
    favoriteExerciseIds: favoriteExerciseIds.slice(),
    dislikedExerciseIds: dislikedExerciseIds.slice(),
    progression: document.getElementById('progression')?.value || 'linear',
    mixMode: document.getElementById('mixMode')?.value || 'strength',
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

const MIX_MODE_HINTS = {
  strength: 'All training days are strength-style lifts with normal rest. Choose Hybrid to add interval days.',
  hybrid: 'Most days are strength; 1–2 days per week are full-body HIIT (short work, short rest). Never on the same day.',
  conditioning: 'Most days are HIIT intervals; 1–2 days stay strength for muscle and joints. Separate days only.'
};

// -------------------------- Named programs --------------------------
// Preset calendars on top of the generator: each card pre-fills the form,
// then the existing sliders still apply. Equipment is left untouched.
const PROGRAMS = [
  {
    id: 'shoulder-friendly',
    name: 'Shoulder-Friendly Strength',
    blurb: 'Build strength without overhead pressing — horizontal presses, rows, and legs, plus rotator-cuff prehab.',
    chip: '4 wk · 3 d/wk',
    weeks: 4,
    daysPerWeek: 3,
    sessionMinutes: 30,
    split: 'upper-lower',
    goal: 'strength',
    level: 'beginner',
    mixMode: 'strength',
    progression: 'linear',
    restrictions: ['shoulder'],
    rehab: ['shoulder']
  },
  {
    id: 'hybrid-fat-loss',
    name: 'Hybrid Fat Loss',
    blurb: 'Strength days plus interval days in one plan — more weekly burn while keeping muscle.',
    chip: '4 wk · 4 d/wk',
    weeks: 4,
    daysPerWeek: 4,
    sessionMinutes: 25,
    split: 'full-body',
    goal: 'fat-loss',
    level: 'beginner',
    mixMode: 'hybrid',
    progression: 'wave',
    restrictions: [],
    rehab: []
  },
  {
    id: 'three-day-full-body',
    name: '3-Day Full Body',
    blurb: 'Three balanced full-body sessions a week — the classic, time-efficient way to build muscle.',
    chip: '4 wk · 3 d/wk',
    weeks: 4,
    daysPerWeek: 3,
    sessionMinutes: 35,
    split: 'full-body',
    goal: 'hypertrophy',
    level: 'beginner',
    mixMode: 'strength',
    progression: 'linear',
    restrictions: [],
    rehab: []
  },
  {
    id: 'recovery-block',
    name: 'Recovery Block',
    blurb: 'A single lighter week of easy movement and mobility — use between harder programs or when run down.',
    chip: '1 wk · 3 d/wk',
    weeks: 1,
    daysPerWeek: 3,
    sessionMinutes: 15,
    split: 'full-body',
    goal: 'endurance',
    level: 'beginner',
    mixMode: 'strength',
    progression: 'none',
    restrictions: [],
    rehab: []
  }
];

let _programGenerating = false;

function renderPrograms() {
  const grid = document.getElementById('programsGrid');
  if (!grid) return;
  grid.innerHTML = PROGRAMS.map(p => `
    <div class="relative bg-white border border-gray-200 rounded-xl shadow-sm p-4 hover:border-blue-400 hover:shadow transition">
      <button type="button" data-program="${escapeHtml(p.id)}"
        class="text-left w-full focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg program-start">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-blue-900 leading-snug">${escapeHtml(p.name)}</h3>
          <span class="shrink-0 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">${escapeHtml(p.chip)}</span>
        </div>
        <p class="text-sm text-gray-600 mt-2 leading-snug">${escapeHtml(p.blurb)}</p>
      </button>
      <button type="button" data-edit-program="${escapeHtml(p.id)}"
        class="mt-2 text-xs text-blue-600 hover:underline font-medium program-edit">
        Edit first
      </button>
    </div>`).join('');
  grid.querySelectorAll('[data-program]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_programGenerating) return;
      const p = PROGRAMS.find(x => x.id === btn.dataset.program);
      if (!p) return;
      applyProgram(p, { silent: true });
      generate({ reshuffle: false, programName: p.name });
    });
  });
  grid.querySelectorAll('[data-edit-program]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = PROGRAMS.find(x => x.id === btn.dataset.editProgram);
      if (p) applyProgram(p);
    });
  });
}

function applyProgram(p, opts) {
  opts = opts || {};
  setSelectValue('weeks', p.weeks);
  setSelectValue('goal', p.goal);
  setSelectValue('level', p.level);
  setSelectValue('split', p.split);
  setSelectValue('progression', p.progression);
  setSelectValue('mixMode', p.mixMode);
  setRangeValue('sessionMinutes', p.sessionMinutes, 'minutesLabel');
  setWorkoutDaysFromCount(p.daysPerWeek);

  document.querySelectorAll('input[data-protect]').forEach(cb => {
    cb.checked = p.restrictions.includes(cb.dataset.protect);
  });
  document.querySelectorAll('input[data-rehab]').forEach(cb => {
    cb.checked = p.rehab.includes(cb.dataset.rehab);
  });

  onSplitChange({ skipBroNudge: true });
  const mixModeEl = document.getElementById('mixMode');
  const mixHint = document.getElementById('mixModeHint');
  if (mixHint) mixHint.textContent = MIX_MODE_HINTS[mixModeEl?.value] || MIX_MODE_HINTS.strength;
  const progEl = document.getElementById('progression');
  const progHint = document.getElementById('progressionHint');
  if (progHint) progHint.textContent = PROGRESSION_HINTS[progEl?.value] || PROGRESSION_HINTS.linear;

  if (plannerSection && togglePlannerBtn && closePlannerBtn) {
    plannerSection.classList.remove('hidden');
    closePlannerBtn.classList.remove('hidden');
    togglePlannerBtn.classList.add('hidden');
    if (!opts.silent) plannerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (typeof showToast === 'function' && !opts.silent) {
    showToast(`${p.name} loaded — tweak anything, then Create my plan.`, 'info');
  }
}

async function loadFavorites() {
  favoriteExerciseIds = [];
  dislikedExerciseIds = [];
  try {
    const response = await fetch('/api/user/ratings', { credentials: 'include' });
    // 401 = guest — expected, don't fall through to a second 401
    if (response.status === 401) return;
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
    openLoginModal();
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
      data-action="rate" data-exercise-id="${id}" data-desired="like"
      aria-pressed="${liked}"><span aria-hidden="true">👍</span><span class="rate-btn__label">Like</span></button>
    <button type="button" class="rate-btn rate-btn--dislike ${disliked ? 'rate-btn--on' : ''}"
      title="${disliked ? 'Clear dislike' : 'I dislike this'}"
      data-action="rate" data-exercise-id="${id}" data-desired="dislike"
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
    // 401 = guest — expected before sign-in
    if (response.status === 401 || !response.ok) return;
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

// Auth UI (global auth modal in site.js)
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch { }
  window.currentUser = null;
  window.currentRoles = [];
  showLoggedOut();
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null, roles: [] } }));
}

function handleReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const returnUrl = params.get('returnUrl');
  if (!returnUrl) return;

  if (currentUser) {
    window.location.replace(returnUrl);
    return;
  }

  if (returnUrl.toLowerCase().includes('admin')) {
    openLoginModal();
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

  welcomeSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');

  if (currentPlan) {
    // Guest generated a plan, then signed in — keep the plan visible
    plannerSection.classList.remove('hidden');
    togglePlannerBtn.classList.add('hidden');
    closePlannerBtn.classList.remove('hidden');
    const resultsEl = document.getElementById('results');
    if (resultsEl) {
      resultsEl.classList.remove('hidden');
      resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const saveBtn = document.getElementById('savePlanBtn');
    if (saveBtn) saveBtn.classList.remove('hidden');
  } else {
    plannerSection.classList.add('hidden');
    togglePlannerBtn.classList.remove('hidden');
    closePlannerBtn.classList.add('hidden');
  }

  loadDashboard();
  loadBodyWeight();
}

function showLoggedOut() {
  currentUser = null;
  currentRoles = [];
  const section = document.getElementById('authSection');
  section.innerHTML = `<button id="openAuthBtn" class="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold py-2 px-4 rounded-md transition">Sign in / Register</button>`;
  document.getElementById('openAuthBtn').addEventListener('click', openLoginModal);

  welcomeSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  plannerSection.classList.add('hidden');
  togglePlannerBtn.classList.remove('hidden');
  closePlannerBtn.classList.add('hidden');
  document.getElementById('savePlanBtn').classList.add('hidden');
}

async function loadDashboard() {
  if (!currentUser) return;
  try {
    const response = await fetch('/api/dashboard', { credentials: 'include' });
    if (!response.ok) {
      if (typeof showToast === 'function') showToast('Could not load dashboard.', 'error');
      return;
    }
    const data = await response.json();
    renderDashboard(data);
  } catch (err) {
    if (typeof showToast === 'function') showToast(`Dashboard load failed: ${err.message}`, 'error');
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
          <button class="text-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold py-1 px-3 rounded-md" type="button" data-action="run-plan" data-plan-id="${p.id}">Run</button>
          <button class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded-md" type="button" data-action="load-plan" data-plan-id="${p.id}">Load</button>
          <button class="text-sm bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-3 rounded-md" type="button" data-action="delete-plan" data-plan-id="${p.id}">Delete</button>
        </div>
      </div>
    `).join('');
    savedPlansTable.innerHTML = rows;
  } else {
    savedPlansTable.innerHTML = `
      <div class="p-4 text-sm text-gray-600">
        <p class="font-medium text-gray-800 mb-1">No saved plans yet</p>
        <p class="text-gray-500 mb-3">Create a plan below, then save it so you can re-run it anytime.</p>
        <button type="button" class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-md" data-action="open-planner">Create a plan</button>
      </div>`;
  }

  if (data.recentSessions && data.recentSessions.length) {
    const count = data.recentWeekCount || 0;
    const weekWord = count === 1 ? 'week' : 'weeks';
    recentActivity.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <span class="text-2xl font-bold text-blue-700">${count}</span>
          <span class="text-sm text-gray-600 ml-1">workout${count === 1 ? '' : 's'} this week</span>
        </div>
        <a href="/history.html" class="text-sm text-blue-600 hover:text-blue-800 font-medium">View history &rarr;</a>
      </div>`;
  } else {
    recentActivity.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <span class="text-2xl font-bold text-blue-700">0</span>
          <span class="text-sm text-gray-600 ml-1">workouts this week</span>
        </div>
        <a href="/workout.html" class="text-sm text-purple-600 hover:text-purple-800 font-medium">Open runner &rarr;</a>
      </div>`;
  }
}

// --- Next workout suggestion ---
async function updateNextWorkoutCard() {
  const card = document.getElementById('nextWorkoutCard');
  if (!card) return;
  const saved = localStorage.getItem('workoutPlan');
  if (!saved) { card.classList.add('hidden'); return; }
  try {
    const plan = JSON.parse(saved);
    if (!plan || !plan.plan || !plan.criteria) { card.classList.add('hidden'); return; }

    // Find the plan ID for completed-days tracking
    let planId = null;
    const plansKey = 'workoutPlanSavedId';
    try { planId = localStorage.getItem(plansKey); } catch { /* ignore */ }
    const completedKey = planId ? 'runnerCompleted_saved-' + planId : 'runnerCompleted_gen-' + (plan.generatedAt || 'unknown');
    let completed = new Set();
    try { completed = new Set(JSON.parse(localStorage.getItem(completedKey) || '[]')); } catch { /* ignore */ }

    // Merge server-side history for cross-device accuracy
    if (currentUser && planId) {
      try {
        const res = await fetch('/api/runner/sessions', { credentials: 'include' });
        if (res.ok) {
          const sessions = await res.json();
          sessions.forEach(s => {
            if (s.savedPlanId == planId && s.week && s.dayIndex != null) {
              completed.add(s.week + ':' + s.dayIndex);
            }
          });
        }
      } catch { /* ignore */ }
    }

    // Find first uncompleted workout day
    let nextDay = null;
    let nextWeek = null;
    for (const week of plan.plan) {
      for (const day of week.days) {
        if (day.type !== 'workout') continue;
        if (!completed.has(week.week + ':' + day.dayIndex)) {
          nextDay = day;
          nextWeek = week;
          break;
        }
      }
      if (nextDay) break;
    }

    if (!nextDay) {
      // All done — suggest restarting from week 1
      for (const week of plan.plan) {
        for (const day of week.days) {
          if (day.type === 'workout') { nextDay = day; nextWeek = week; break; }
        }
        if (nextDay) break;
      }
    }

    if (!nextDay) { card.classList.add('hidden'); return; }

    const goal = capitalize(plan.criteria.goal || 'training');
    const split = capitalize(plan.criteria.split || 'full-body');
    const focus = nextDay.focus || nextDay.sessionStyle || 'Strength';
    document.getElementById('nextWorkoutInfo').textContent =
      `Week ${nextWeek.week} — ${nextDay.day} · ${focus} · ${split} · ${goal}`;
    document.getElementById('nextWorkoutBtn').href = '/workout.html?setup=1';
    card.classList.remove('hidden');
  } catch {
    card.classList.add('hidden');
  }
}

// --- Body weight tracking ---
const WEIGHT_UNIT_KEY = 'workoutWeightUnit';

function getWeightUnit() {
  return localStorage.getItem(WEIGHT_UNIT_KEY) === 'lb' ? 'lb' : 'kg';
}

function setWeightUnit(unit) {
  localStorage.setItem(WEIGHT_UNIT_KEY, unit);
  renderWeightUnitButtons();
  if (typeof currentWeightData !== 'undefined' && currentWeightData) {
    renderBodyWeight(currentWeightData);
  }
}

function renderWeightUnitButtons() {
  const unit = getWeightUnit();
  const kgBtn = document.getElementById('weightUnitKg');
  const lbBtn = document.getElementById('weightUnitLb');
  if (!kgBtn || !lbBtn) return;
  kgBtn.className = `px-3 py-1.5 font-semibold ${unit === 'kg' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`;
  lbBtn.className = `px-3 py-1.5 font-semibold ${unit === 'lb' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`;
}

function weightToDisplay(kg) {
  return getWeightUnit() === 'lb' ? Math.round(kg * 2.20462 * 10) / 10 : kg;
}

function weightToLabel(kg) {
  const value = weightToDisplay(kg);
  const decimals = getWeightUnit() === 'lb' ? (Number.isInteger(value) ? 0 : 1) : 1;
  return `${value.toFixed(decimals)} ${getWeightUnit()}`;
}

let currentWeightData = null;

async function loadBodyWeight() {
  if (!currentUser) return;
  try {
    const response = await fetch('/api/body-weight', { credentials: 'include' });
    if (!response.ok) return;
    currentWeightData = await response.json();
    renderBodyWeight(currentWeightData);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Could not load weight data.', 'error');
  }
}

function renderBodyWeight(data) {
  const card = document.getElementById('bodyWeightCard');
  if (!card) return;
  card.classList.remove('hidden');

  const entries = (data.entries || []).slice().sort((a, b) => new Date(a.weighedAt) - new Date(b.weighedAt));

  const current = document.getElementById('weightCurrent');
  const change = document.getElementById('weightChange30');
  const chart = document.getElementById('weightChart');
  const list = document.getElementById('weightEntries');

  if (data.latestWeightKg != null) {
    current.textContent = weightToLabel(data.latestWeightKg);
  } else {
    current.textContent = '—';
  }

  if (data.change30Days != null && data.change30Days !== 0) {
    const delta = weightToDisplay(data.change30Days);
    const sign = delta > 0 ? '+' : '';
    const cls = data.change30Days > 0 ? 'text-red-600' : 'text-green-600';
    change.innerHTML = `<span class="${cls} font-semibold">${sign}${delta.toFixed(1)} ${getWeightUnit()}</span> over the last 30 days`;
  } else if (data.change30Days != null) {
    change.textContent = 'No change over the last 30 days';
  } else {
    change.textContent = 'Log entries for a while to see a 30-day trend';
  }

  if (entries.length >= 2) {
    chart.classList.remove('hidden');
    chart.innerHTML = renderWeightSparkline(entries);
  } else {
    chart.classList.add('hidden');
    chart.innerHTML = '';
  }

  if (entries.length) {
    const rows = entries.slice().reverse().slice(0, 10).map(e => `
      <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
        <span class="text-gray-600">${formatDate(e.weighedAt)}</span>
        <span class="font-semibold">${weightToLabel(e.weightKg)}</span>
        <button type="button" class="text-xs text-gray-400 hover:text-red-600" data-action="delete-weight" data-id="${e.id}">Remove</button>
      </div>
    `).join('');
    list.innerHTML = `<div class="max-h-48 overflow-y-auto">${rows}</div>`;
  } else {
    list.innerHTML = '<p class="text-gray-400">No weight entries yet — log your first one above.</p>';
  }
}

function renderWeightSparkline(entries) {
  const values = entries.map(e => e.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = (max - min) || 1;
  const w = 320, h = 80, pad = 6;

  const points = values.map((v, i) => {
    const x = values.length === 1 ? w / 2 : pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const last = values[values.length - 1];
  const first = values[0];
  const trendUp = last >= first;
  const stroke = trendUp ? '#16a34a' : '#dc2626';

  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="w-full h-20" aria-label="Body weight trend">
      <polyline fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${points}" />
      <circle cx="${(values.length === 1 ? w / 2 : pad + (values.length - 1) / (values.length - 1) * (w - pad * 2))}" cy="${h - pad - ((last - min) / span) * (h - pad * 2)}" r="3" fill="${stroke}" />
    </svg>`;
}

async function addWeightEntry(event) {
  event.preventDefault();
  const valueInput = document.getElementById('weightValue');
  const dateInput = document.getElementById('weightDate');
  if (!valueInput || !valueInput.value) {
    if (typeof showToast === 'function') showToast('Enter a weight to log.', 'error');
    return;
  }

  let weightKg = parseFloat(valueInput.value);
  if (isNaN(weightKg) || weightKg <= 0) {
    if (typeof showToast === 'function') showToast('Enter a valid weight.', 'error');
    return;
  }
  if (getWeightUnit() === 'lb') weightKg = weightKg * 0.45359237;

  const body = { weightKg: Math.round(weightKg * 100) / 100 };
  if (dateInput && dateInput.value) body.weighedAt = new Date(dateInput.value + 'T00:00:00').toISOString();

  try {
    const response = await fetch('/api/body-weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      if (typeof showToast === 'function') showToast(err?.errors?.[0] || 'Could not log weight.', 'error');
      return;
    }
    valueInput.value = '';
    if (typeof showToast === 'function') showToast('Weight logged.', 'success');
    await loadBodyWeight();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`Could not log weight: ${err.message}`, 'error');
  }
}

async function deleteWeightEntry(id) {
  if (typeof showConfirm === 'function') {
    if (!await showConfirm('Remove entry', 'Remove this weight entry?')) return;
  } else {
    if (!confirm('Remove this weight entry?')) return;
  }
  try {
    const response = await fetch(`/api/body-weight/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) throw new Error('Failed to remove');
    if (typeof showToast === 'function') showToast('Entry removed.', 'info');
    await loadBodyWeight();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`Could not remove entry: ${err.message}`, 'error');
  }
}

function initBodyWeight() {
  const unitBtn = document.getElementById('weightUnitKg');
  const lbBtn = document.getElementById('weightUnitLb');
  if (unitBtn) unitBtn.addEventListener('click', () => setWeightUnit('kg'));
  if (lbBtn) lbBtn.addEventListener('click', () => setWeightUnit('lb'));
  renderWeightUnitButtons();

  const form = document.getElementById('weightForm');
  if (form) form.addEventListener('submit', addWeightEntry);

  const dateInput = document.getElementById('weightDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
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
    try { localStorage.setItem('workoutPlanSavedId', String(id)); } catch { /* ignore */ }
    renderPlan(currentPlan);
    plannerSection.classList.remove('hidden');
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    setStatus(`Could not load plan: ${err.message}`);
  }
}

async function deleteSavedPlan(id) {
  if (typeof showConfirm === 'function') {
    if (!await showConfirm('Delete plan', 'Are you sure you want to delete this plan?')) return;
  } else {
    if (!confirm('Are you sure you want to delete this plan?')) return;
  }
  try {
    const response = await fetch(`/api/plans/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) throw new Error('Failed to delete');
    loadDashboard();
  } catch (err) {
    setStatus(`Could not delete plan: ${err.message}`);
  }
}

function runPlan(id) {
  try { localStorage.setItem('workoutPlanSavedId', String(id)); } catch { /* ignore */ }
  window.location.href = `/workout.html?planId=${id}&setup=1`;
}

async function saveCurrentPlan() {
  if (!currentPlan) {
    setStatus('Create a plan first.');
    return;
  }
  const defaultName = `Plan ${new Date().toLocaleDateString()}`;
  const name = typeof showPrompt === 'function'
    ? await showPrompt('Save plan', 'Give your plan a name:', defaultName)
    : window.prompt('Save plan as:', defaultName);
  if (name === null) return;

  try {
    const response = await fetch('/api/plans/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: name || defaultName, planJson: JSON.stringify(currentPlan) })
    });
    if (!response.ok) throw new Error('Server error');
    const saved = await response.json();
    try { localStorage.setItem('workoutPlanSavedId', String(saved.id)); } catch { /* ignore */ }
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
  const programName = options.programName || '';
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
  btn.classList.add('opacity-75', 'cursor-wait');
  if (regenBtn) {
    regenBtn.disabled = true;
    if (reshuffle) regenBtn.textContent = 'Shuffling...';
  }
  _programGenerating = true;

  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(criteria)
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Too many plans — wait a minute and try again.');
      }
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
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (regenBtn) regenBtn.classList.remove('hidden');
    if (typeof showToast === 'function') {
      if (programName) {
        showToast(`${programName} — plan created.`, 'success');
      } else {
        showToast(
          reshuffle
            ? 'New exercise mix ready — scroll down to compare.'
            : 'Plan ready — scroll down to review or start.',
          'success'
        );
      }
    }
  } catch (err) {
    setStatus(`Could not create plan: ${err.message}`);
    if (typeof showToast === 'function') showToast(`Could not create plan: ${err.message}`, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    btn.classList.remove('opacity-75', 'cursor-wait');
    _programGenerating = false;
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
  const mixLabel = ({
    strength: 'Strength only',
    hybrid: 'Hybrid (strength + HIIT days)',
    conditioning: 'Conditioning-focused'
  })[result.criteria.mixMode] || 'Strength only';
  const mobilityNote = (result.criteria.includeWarmup !== false || result.criteria.includeCooldown !== false)
    ? `<p class="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-3">Each workout day includes a short <strong>warm-up</strong> and/or <strong>cool-down</strong> matched to the muscles trained that day (shown with badges at the top and bottom of the list).</p>`
    : '';
  summary.innerHTML = `
    <h2 class="text-2xl font-bold mb-2">Your ${result.criteria.weeks}-week plan</h2>
    <p class="text-gray-700">
      ${formatWorkoutDays(result.criteria.workoutDays, result.criteria.daysPerWeek)} • ${result.criteria.sessionMinutes} min sessions
      • <strong>Split:</strong> ${capitalize(result.criteria.split || 'full-body')}
      • <strong>Goal:</strong> ${capitalize(result.criteria.goal)}
      • <strong>Mix:</strong> ${mixLabel}
      • ${capitalize(result.criteria.level)}
      • ${progressionLabel}
    </p>
    ${result.progressionSummary ? `<p class="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3">${escapeHtml(result.progressionSummary)}</p>` : ''}
    ${mobilityNote}
    <p class="text-sm text-gray-500 mt-2">Use the buttons on each day to add or remove exercises and to switch a day between workout and rest. <a href="/help.html#mix" class="text-blue-600 hover:underline">Strength + HIIT mix</a> · <a href="/help.html#progression" class="text-blue-600 hover:underline">How progression works</a></p>
  `;
  container.appendChild(summary);

  renderRehabProgressions(result, container);

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
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" data-action="toggle-day" data-week="${weekIndex}" data-day="${dayIndex}" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-2 rounded">Make workout day</button>
            <button type="button" data-action="make-recovery" data-week="${weekIndex}" data-day="${dayIndex}" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1 px-2 rounded">Make recovery day</button>
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
          const isHiitWork = !isMobility && day.sessionStyle === 'hiit';
          const setsLine = isMobility
            ? `<span class="text-sm text-gray-700">${escapeHtml(ex.repsDisplay || (ex.workDuration + 's'))}</span>`
            : isHiitWork
              ? `<span class="text-sm text-gray-700">${ex.sets} rounds × ${escapeHtml(ex.repsDisplay || (ex.workDuration + 's'))} <span class="text-gray-500">(${ex.rest}s rest)</span></span>`
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
          <li class="mb-3 flex gap-3 ${isMobility ? 'opacity-95' : ''}" ${!isMobility ? `data-exercise-id="${escapeHtml(ex.id)}"` : ''}>
            ${exerciseThumbHtml(ex.imageUrl, ex.name)}
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <span class="font-medium flex flex-wrap items-center gap-1.5">${phaseBadge}${escapeHtml(ex.name)}</span>
                <div class="flex items-center gap-2 shrink-0">
                  ${ex.demoUrl ? `<a href="${escapeHtml(ex.demoUrl)}" target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline whitespace-nowrap">${/exrx\.net/i.test(ex.demoUrl) ? 'ExRx' : 'Demo'}</a>` : ''}
                  ${(ex.demoAnimUrl || (ex.imageUrl && ex.id && !String(ex.id).startsWith('wu-') && !String(ex.id).startsWith('cd-')))
                    ? `<a href="${escapeHtml(ex.demoAnimUrl || ('/demos/' + encodeURIComponent(ex.id) + '.webp'))}" target="_blank" rel="noopener" class="text-xs text-indigo-600 hover:underline whitespace-nowrap">WebP</a>`
                    : ''}
                  <button type="button" data-action="remove-ex" data-week="${weekIndex}" data-day="${dayIndex}" data-ex="${exIndex}" class="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              </div>
              <div>${setsLine}</div>
              <div data-last-load-for="${escapeHtml(ex.id)}" class="text-xs text-blue-600 mt-0.5 hidden"></div>
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
          const workLabel = day.sessionStyle === 'hiit' ? 'HIIT intervals' : 'Main work';
          const workLabelClass = day.sessionStyle === 'hiit'
            ? 'text-xs font-bold uppercase tracking-wide text-rose-800 bg-rose-50 border border-rose-100 rounded px-2 py-1'
            : 'text-xs font-bold uppercase tracking-wide text-blue-800 bg-blue-50 border border-blue-100 rounded px-2 py-1';
          listHtml += `<li class="list-none mb-2 mt-2"><div class="${workLabelClass}">${workLabel}</div></li>`;
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
        const isHiitDay = day.sessionStyle === 'hiit';
        const isMobilityDay = day.sessionStyle === 'mobility';
        const styleBadge = isMobilityDay
          ? `<span class="text-xs bg-emerald-100 text-emerald-900 px-2 py-1 rounded font-semibold">Recovery</span>`
          : isHiitDay
            ? `<span class="text-xs bg-rose-100 text-rose-900 px-2 py-1 rounded font-semibold">HIIT</span>`
            : `<span class="text-xs bg-indigo-100 text-indigo-900 px-2 py-1 rounded font-semibold">Strength</span>`;
        const focusBadge = isMobilityDay
          ? `<span class="text-xs bg-emerald-50 text-emerald-800 px-2 py-1 rounded">${escapeHtml(day.focus || 'Recovery')}</span>`
          : isHiitDay
            ? `<span class="text-xs bg-rose-50 text-rose-800 px-2 py-1 rounded">${escapeHtml(day.focus || 'HIIT')}</span>`
            : `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">${escapeHtml(day.focus || 'Training')}</span>`;
        const cardBg = isMobilityDay ? 'bg-emerald-50/40' : isHiitDay ? 'bg-rose-50/40' : 'bg-white';
        card.className = 'border rounded-lg p-4 shadow-sm ' + cardBg;
        card.innerHTML = `
          <div class="flex justify-between items-center mb-2 gap-2 flex-wrap">
            <span class="font-bold">${day.day}</span>
            <div class="flex flex-wrap gap-1.5 items-center justify-end">
              ${styleBadge}
              ${focusBadge}
            </div>
          </div>
          <div class="text-sm text-gray-600 mb-1">~${day.estimatedMinutes} min${mobilitySummary ? ` · ${escapeHtml(mobilitySummary)}` : ''}</div>
          ${day.note ? `<p class="text-xs text-gray-600 mb-2 italic">${escapeHtml(day.note)}</p>` : ''}
          <ul class="text-sm">${listHtml}</ul>
          <div class="mt-3 flex flex-wrap gap-2">
            ${isMobilityDay ? '' : `<button type="button" data-action="add-ex" data-week="${weekIndex}" data-day="${dayIndex}" class="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold py-1 px-2 rounded">+ Add exercise</button>`}
            <button type="button" data-action="toggle-day" data-week="${weekIndex}" data-day="${dayIndex}" class="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-1 px-2 rounded">Make rest day</button>
          </div>
          ${isMobilityDay ? '' : `<div class="mt-2 text-xs ${isHiitDay ? 'text-rose-800' : 'text-blue-700'} italic">${escapeHtml(workHint?.progression || '')}</div>`}
        `;
      }

      grid.appendChild(card);
    });

    container.appendChild(weekEl);
  });

  document.getElementById('results').classList.remove('hidden');
  startWorkoutBtn.classList.remove('hidden');
  startWorkoutBtn.href = currentPlanId ? `/workout.html?planId=${currentPlanId}&setup=1` : '/workout.html?setup=1';
  const regenBtn = document.getElementById('regenerateBtn');
  if (regenBtn) regenBtn.classList.remove('hidden');
  const regenHint = document.getElementById('regenerateHint');
  if (regenHint) regenHint.classList.remove('hidden');
  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.classList.remove('hidden');
  const saveBtn = document.getElementById('savePlanBtn');
  if (saveBtn && currentUser) saveBtn.classList.remove('hidden');
  const genBtn = document.getElementById('generateBtn');
  if (genBtn) {
    genBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700', 'text-white');
    genBtn.classList.add('bg-gray-200', 'hover:bg-gray-300', 'text-gray-800');
  }
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

  if (currentUser) {
    fetch('/api/runner/last-loads', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(loads => {
        if (!loads || typeof loads !== 'object') return;
        const unit = getWeightUnit();
        Object.entries(loads).forEach(([exerciseId, kg]) => {
          document.querySelectorAll(`[data-last-load-for="${exerciseId}"]`).forEach(el => {
            const display = weightToLabel(kg);
            const suggestionKg = kg >= 20 ? kg + 2.5 : kg + 1;
            const tryDisplay = weightToLabel(suggestionKg);
            el.textContent = `Last: ${display} \u00b7 try ${tryDisplay}`;
            el.classList.remove('hidden');
          });
        });
      })
      .catch(() => {});
  }
}

/**
 * Render the per-area rehab progression chains ("start gentle, build up, stop if…").
 * Shown only when the user selected recovery/rehab areas.
 */
function renderRehabProgressions(result, container) {
  const chains = result?.rehabProgressions;
  if (!Array.isArray(chains) || chains.length === 0) return;

  const panel = document.createElement('div');
  panel.className = 'mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4';

  const areasHtml = chains.map(area => {
    const stages = (area.stages || []).map(s => {
      const demo = s.demoExerciseId
        ? `<img src="/demos/${encodeURIComponent(s.demoExerciseId)}.webp" alt="" loading="lazy" class="w-12 h-12 rounded-md object-cover bg-gray-200 shrink-0" onerror="this.remove()" />`
        : '';
      return `
        <li class="flex gap-3 items-start py-2">
          <span class="mt-0.5 shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold">${s.stage}</span>
          ${demo}
          <div class="min-w-0">
            <div class="font-semibold text-emerald-900">${escapeHtml(s.name)}</div>
            <div class="text-sm text-gray-700">${escapeHtml(s.cue)}</div>
            <div class="text-xs text-rose-800 mt-0.5"><strong>Stop if:</strong> ${escapeHtml(s.stopIf)}</div>
          </div>
        </li>`;
    }).join('');
    return `
      <div class="mt-3 first:mt-0">
        <h4 class="text-sm font-bold text-emerald-900 uppercase tracking-wide">${escapeHtml(area.label)} rehab path</h4>
        <ol class="mt-1 divide-y divide-emerald-100">${stages}</ol>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <h3 class="text-base font-bold text-emerald-900">Rehab path</h3>
    <p class="text-sm text-gray-700 mt-1">Start at stage 1 and only move up when the current stage feels easy and pain-free. If a stage flares things up, drop back one. These complement — not replace — the rehab moves already built into your workouts.</p>
    ${areasHtml}
  `;
  container.appendChild(panel);
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
    day.sessionStyle = 'strength';
    day.focus = '';
    day.exercises = [];
    day.note = '';
  } else {
    day.type = 'rest';
    day.sessionStyle = '';
    day.focus = '';
    day.exercises = [];
    day.note = 'Rest / mobility';
  }
  recalculateDayMinutes(day);
  localStorage.setItem('workoutPlan', JSON.stringify(currentPlan));
  renderPlan(currentPlan);
}

/** Turn a rest day into a standalone 10–15 min active-recovery session. */
function makeRecoveryDay(weekIndex, dayIndex) {
  if (!currentPlan) return;
  const day = currentPlan.plan[weekIndex].days[dayIndex];
  const restrictions = currentPlan.criteria?.restrictions || [];
  const exercises = typeof WorkoutMobility !== 'undefined'
    ? WorkoutMobility.buildRecoverySession(12, restrictions)
    : [];
  if (!exercises.length) return;

  day.type = 'workout';
  day.sessionStyle = 'mobility';
  day.focus = 'Recovery & mobility';
  day.exercises = exercises;
  day.note = 'Active recovery — move gently, no intensity.';
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
      <button type="button" data-action="pick-ex" data-exercise-id="${escapeHtml(ex.id)}" class="flex-1 text-left min-w-0">
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


