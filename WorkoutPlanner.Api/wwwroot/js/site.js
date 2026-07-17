/**
 * Shared UI helpers: toasts and bottom navigation.
 */
(function () {
  const TOAST_ID = 'siteToast';

  function ensureToastHost() {
    let host = document.getElementById(TOAST_ID);
    if (host) return host;
    host = document.createElement('div');
    host.id = TOAST_ID;
    host.className = 'site-toast hidden';
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
  window.showToast = function showToast(message, type = 'success', durationMs = 3200) {
    const host = ensureToastHost();
    host.textContent = message;
    host.className = `site-toast site-toast--${type}`;
    host.classList.remove('hidden');
    clearTimeout(host._hideTimer);
    host._hideTimer = setTimeout(() => {
      host.classList.add('hidden');
    }, durationMs);
  };

  function markActiveNav() {
    const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
    const page =
      path.endsWith('history.html') ? 'history'
        : path.endsWith('workout.html') ? 'run'
          : path.endsWith('admin.html') ? 'admin'
            : 'planner';

    document.querySelectorAll('[data-nav]').forEach((el) => {
      const isActive = el.getAttribute('data-nav') === page;
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

  document.addEventListener('DOMContentLoaded', markActiveNav);
})();
