/**
 * Shared UI helpers: toasts, modals, navigation, dark mode, and utilities.
 */
(function () {
  var TOAST_ID = 'siteToast';

  // ── Shared utilities ──────────────────────────────────────────────

  window.escapeHtml = function escapeHtml(value) {
    if (value == null) return '';
    var s = String(value);
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return s.replace(/[&<>"']/g, function (c) { return map[c]; });
  };

  window.formatDate = function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  };

  window.formatDateTime = function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString();
  };

  // ── Reduced motion ───────────────────────────────────────────────

  var _prefersReducedMotion = false;

  window.prefersReducedMotion = function prefersReducedMotion() {
    return _prefersReducedMotion;
  };

  // ── Toast ────────────────────────────────────────────────────────

  function ensureToastHost() {
    var host = document.getElementById(TOAST_ID);
    if (host) return host;
    host = document.createElement('div');
    host.id = TOAST_ID;
    host.className = 'site-toast';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    host.style.transform = 'translateY(8px)';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
  }

  /**
   * @param {string} message
   * @param {'success'|'error'|'info'} [type]
   * @param {number} [durationMs]
   */
  window.showToast = function showToast(message, type, durationMs) {
    if (type === undefined) type = 'success';
    if (durationMs === undefined) durationMs = 3200;
    var host = ensureToastHost();
    host.textContent = message;
    host.className = 'site-toast site-toast--' + type;
    // show
    host.style.opacity = '1';
    host.style.pointerEvents = 'auto';
    host.style.transform = 'translateY(0)';
    clearTimeout(host._hideTimer);
    host._hideTimer = setTimeout(function () {
      host.style.opacity = '0';
      host.style.pointerEvents = 'none';
      host.style.transform = 'translateY(8px)';
    }, durationMs);
  };

  // ── Public feedback URL ──────────────────────────────────────────

  window.WORKOUT_FEEDBACK_URL = '/feedback.html';

  // ── Navigation ───────────────────────────────────────────────────

  function markActiveNav() {
    var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
    var page =
      path.endsWith('history.html') ? 'history'
        : path.endsWith('workout.html') ? 'run'
          : path.endsWith('help.html') ? 'help'
            : path.endsWith('about.html') ? 'about'
              : path.endsWith('feedback.html') ? 'feedback'
                : path.endsWith('admin.html') ? 'admin'
                  : 'planner';

    document.querySelectorAll('[data-nav]').forEach(function (el) {
      var isActive = el.getAttribute('data-nav') === page;
      el.classList.toggle('bottom-nav__item--active', isActive);
      if (isActive) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  /**
   * Hide bottom nav during an active workout (runner sets body.workout-active).
   */
  window.setWorkoutChromeVisible = function setWorkoutChromeVisible(visible) {
    document.body.classList.toggle('workout-active', !visible);
  };

  // ── Modal utilities ──────────────────────────────────────────────

  /**
   * Trap focus and handle Escape/backdrop-click for a modal element.
   * Returns a cleanup function that removes all listeners.
   * @param {HTMLElement} modalEl  The container with role="dialog"
   * @returns {function} cleanup
   */
  window.initModal = function initModal(modalEl) {
    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function getFocusable() {
      return Array.prototype.slice.call(modalEl.querySelectorAll(FOCUSABLE));
    }

    function handleKeydown(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key === 'Tab' || e.keyCode === 9) {
        var items = getFocusable();
        if (items.length === 0) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    function handleBackdrop(e) {
      if (e.target === modalEl) {
        closeModal();
      }
    }

    function closeModal() {
      if (typeof modalEl._onClose === 'function') modalEl._onClose();
    }

    modalEl.addEventListener('keydown', handleKeydown);
    modalEl.addEventListener('mousedown', handleBackdrop);

    // focus first element
    var focusable = getFocusable();
    if (focusable.length > 0) focusable[0].focus();

    return function cleanup() {
      modalEl.removeEventListener('keydown', handleKeydown);
      modalEl.removeEventListener('mousedown', handleBackdrop);
    };
  };

  // ── Confirm modal ────────────────────────────────────────────────

  /**
   * @param {string} title
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  window.showConfirm = function showConfirm(title, message) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      var dialog = document.createElement('div');
      dialog.className = 'modal-dialog';

      var h = document.createElement('h3');
      h.className = 'modal-title';
      h.textContent = title;

      var p = document.createElement('p');
      p.className = 'modal-message';
      p.textContent = message;

      var actions = document.createElement('div');
      actions.className = 'modal-actions';

      var btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'btn btn-secondary';
      btnCancel.textContent = 'Cancel';

      var btnConfirm = document.createElement('button');
      btnConfirm.type = 'button';
      btnConfirm.className = 'btn btn-danger';
      btnConfirm.textContent = 'Confirm';

      actions.appendChild(btnCancel);
      actions.appendChild(btnConfirm);
      dialog.appendChild(h);
      dialog.appendChild(p);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      var cleanup;
      var settled = false;

      function settle(value) {
        if (settled) return;
        settled = true;
        cleanup();
        overlay.remove();
        resolve(value);
      }

      overlay._onClose = function () { settle(false); };
      btnCancel.addEventListener('click', function () { settle(false); });
      btnConfirm.addEventListener('click', function () { settle(true); });

      cleanup = window.initModal(overlay);
    });
  };

  // ── Prompt modal ─────────────────────────────────────────────────

  /**
   * @param {string} title
   * @param {string} message
   * @param {string} [defaultValue]
   * @returns {Promise<string|null>}
   */
  window.showPrompt = function showPrompt(title, message, defaultValue) {
    if (defaultValue === undefined) defaultValue = '';
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      var dialog = document.createElement('div');
      dialog.className = 'modal-dialog';

      var h = document.createElement('h3');
      h.className = 'modal-title';
      h.textContent = title;

      var p = document.createElement('p');
      p.className = 'modal-message';
      p.textContent = message;

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'modal-input';
      input.value = defaultValue;

      var actions = document.createElement('div');
      actions.className = 'modal-actions';

      var btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'btn btn-secondary';
      btnCancel.textContent = 'Cancel';

      var btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'btn btn-primary';
      btnOk.textContent = 'OK';

      actions.appendChild(btnCancel);
      actions.appendChild(btnOk);
      dialog.appendChild(h);
      dialog.appendChild(p);
      dialog.appendChild(input);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      var cleanup;
      var settled = false;

      function settle(value) {
        if (settled) return;
        settled = true;
        cleanup();
        overlay.remove();
        resolve(value);
      }

      overlay._onClose = function () { settle(null); };
      btnCancel.addEventListener('click', function () { settle(null); });
      btnOk.addEventListener('click', function () { settle(input.value); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          settle(input.value);
        }
      });

      cleanup = window.initModal(overlay);
      input.focus();
      input.select();
    });
  };

  // ── Loading spinner ──────────────────────────────────────────────

  /**
   * Show a spinner inside a container element.
   * @param {HTMLElement} container
   * @param {string} [message]
   */
  window.showLoading = function showLoading(container, message) {
    hideLoading(container);
    var wrapper = document.createElement('div');
    wrapper.className = 'site-spinner';
    var spinner = document.createElement('div');
    spinner.className = 'site-spinner__icon';
    wrapper.appendChild(spinner);
    if (message) {
      var label = document.createElement('p');
      label.className = 'site-spinner__text';
      label.textContent = message;
      wrapper.appendChild(label);
    }
    container.appendChild(wrapper);
  };

  /**
   * Remove the loading spinner from a container element.
   * @param {HTMLElement} container
   */
  window.hideLoading = function hideLoading(container) {
    var existing = container.querySelector('.site-spinner');
    if (existing) existing.remove();
  };

  // ── Dark mode persistence ────────────────────────────────────────

  window.setHighContrast = function setHighContrast(enabled) {
    if (enabled) {
      document.body.classList.add('high-contrast');
      localStorage.setItem('highContrast', '1');
    } else {
      document.body.classList.remove('high-contrast');
      localStorage.removeItem('highContrast');
    }
  };

  // ── DOMContentLoaded ─────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    markActiveNav();

    // Reduced motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      _prefersReducedMotion = true;
      document.body.classList.add('reduced-motion');
    }

    // Dark mode
    var stored = localStorage.getItem('highContrast');
    if (stored) {
      document.body.classList.add('high-contrast');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.classList.add('high-contrast');
    }
  });
})();
