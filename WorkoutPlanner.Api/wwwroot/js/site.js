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

  // ── Global auth ──────────────────────────────────────────────────

  window.currentUser = null;
  window.currentRoles = [];
  var _hadSession = false; // true once we confirm the user was authenticated this page load
  var _authModal = null;
  var _authLoginMode = true;
  var _authCleanup = null;

  function buildAuthModalHtml() {
    return '<div class="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">' +
      '<div class="flex justify-between items-center mb-4">' +
        '<h2 id="gAuthTitle" class="text-xl font-bold">Sign in</h2>' +
        '<button id="gAuthClose" type="button" class="text-gray-500 hover:text-gray-700 text-xl leading-none">&times;</button>' +
      '</div>' +
      '<div id="gAuthPanel">' +
        '<form id="gAuthForm" class="space-y-0">' +
          '<div id="gAuthError" class="text-sm text-red-600 mb-3 hidden"></div>' +
          '<input id="gAuthEmail" name="email" type="email" autocomplete="username" placeholder="Email" class="w-full border border-gray-300 rounded-md p-2 mb-3" required />' +
          '<input id="gAuthPassword" name="password" type="password" autocomplete="current-password" placeholder="Password" class="w-full border border-gray-300 rounded-md p-2 mb-4" required />' +
          '<button id="gAuthSubmit" type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition">Sign in</button>' +
        '</form>' +
        '<div id="gAuthExternal" class="hidden">' +
          '<div class="relative my-4"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-300"></div></div>' +
          '<div class="relative flex justify-center text-sm"><span class="px-2 bg-white text-gray-500">Or continue with</span></div></div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<a id="gGoogleBtn" href="/api/auth/external-login?provider=Google" class="text-center border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-md transition">Google</a>' +
            '<a id="gMicrosoftBtn" href="/api/auth/external-login?provider=Microsoft" class="text-center border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-md transition">Microsoft</a>' +
          '</div>' +
        '</div>' +
        '<p class="mt-4 text-sm text-center">' +
          '<button type="button" id="gAuthForgot" class="text-blue-600 hover:underline font-medium">Forgot password?</button>' +
        '</p>' +
        '<p class="mt-3 text-sm text-center text-gray-600">' +
          '<span id="gAuthToggleText">Don\'t have an account?</span> ' +
          '<button type="button" id="gAuthToggle" class="text-blue-600 hover:underline font-medium ml-1">Register</button>' +
        '</p>' +
        '<p class="mt-3 text-center text-xs text-gray-500"><a href="/privacy" class="hover:underline">Privacy policy</a></p>' +
      '</div>' +
      '<div id="gForgotPanel" class="hidden">' +
        '<form id="gForgotForm">' +
          '<div id="gForgotError" class="text-sm text-red-600 mb-3 hidden"></div>' +
          '<div id="gForgotSuccess" class="text-sm text-green-600 mb-3 hidden"></div>' +
          '<input id="gForgotEmail" name="email" type="email" autocomplete="email" placeholder="Email" class="w-full border border-gray-300 rounded-md p-2 mb-4" required />' +
          '<button id="gForgotSubmit" type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition">Send reset link</button>' +
        '</form>' +
        '<p class="mt-4 text-sm text-center text-gray-600">' +
          '<button type="button" id="gBackToAuth" class="text-blue-600 hover:underline font-medium">Back to sign in</button>' +
        '</p>' +
      '</div>' +
    '</div>';
  }

  function injectAuthModal() {
    if (_authModal) return;
    var overlay = document.createElement('div');
    overlay.id = 'globalAuthModal';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = buildAuthModalHtml();
    document.body.appendChild(overlay);
    _authModal = overlay;

    // Wire up events
    overlay.querySelector('#gAuthClose').addEventListener('click', closeLoginModal);
    overlay.querySelector('#gAuthForm').addEventListener('submit', function (e) {
      e.preventDefault();
      globalSubmitAuth();
    });
    overlay.querySelector('#gAuthToggle').addEventListener('click', function () {
      _authLoginMode = !_authLoginMode;
      overlay.querySelector('#gAuthTitle').textContent = _authLoginMode ? 'Sign in' : 'Register';
      overlay.querySelector('#gAuthSubmit').textContent = _authLoginMode ? 'Sign in' : 'Create account';
      overlay.querySelector('#gAuthToggleText').textContent = _authLoginMode ? 'Don\'t have an account?' : 'Already have an account?';
      overlay.querySelector('#gAuthToggle').textContent = _authLoginMode ? 'Register' : 'Sign in';
    });
    overlay.querySelector('#gAuthForgot').addEventListener('click', function () {
      overlay.querySelector('#gAuthPanel').style.display = 'none';
      overlay.querySelector('#gForgotPanel').style.display = '';
      overlay.querySelector('#gAuthTitle').textContent = 'Reset password';
    });
    overlay.querySelector('#gBackToAuth').addEventListener('click', function () {
      overlay.querySelector('#gForgotPanel').style.display = 'none';
      overlay.querySelector('#gAuthPanel').style.display = '';
      overlay.querySelector('#gAuthTitle').textContent = _authLoginMode ? 'Sign in' : 'Register';
    });
    overlay.querySelector('#gForgotForm').addEventListener('submit', function (e) {
      e.preventDefault();
      globalSubmitForgot();
    });

    // Check for external providers
    fetchExternalProviders(overlay);
    overlay._onClose = closeLoginModal;
  }

  async function fetchExternalProviders(overlay) {
    try {
      var res = await fetch('/api/auth/external-providers', { credentials: 'include' });
      if (!res.ok) return;
      var providers = await res.json();
      if (providers.length === 0) return;
      var section = overlay.querySelector('#gAuthExternal');
      section.style.display = '';
      overlay.querySelector('#gGoogleBtn').style.display = providers.includes('Google') ? '' : 'none';
      overlay.querySelector('#gMicrosoftBtn').style.display = providers.includes('Microsoft') ? '' : 'none';
    } catch { /* ignore */ }
  }

  function setGlobalAuthError(msg) {
    var el = document.getElementById('gAuthError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
  }

  async function globalSubmitAuth() {
    var overlay = document.getElementById('globalAuthModal');
    var email = overlay.querySelector('#gAuthEmail').value.trim();
    var password = overlay.querySelector('#gAuthPassword').value;
    if (!email || !password) { setGlobalAuthError('Please enter an email and password.'); return; }

    var endpoint = _authLoginMode ? '/api/auth/login' : '/api/auth/register';
    try {
      var response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email, password: password })
      });
      if (!response.ok) {
        var data = await response.json().catch(function () { return {}; });
        var msg = data.errors ? data.errors.join('\n') : (data.title || data.detail || 'Authentication failed.');
        setGlobalAuthError(msg);
        return;
      }
      var data = await response.json();
      window.currentUser = data.email;
      window.currentRoles = data.roles || [];
      closeLoginModal();
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: data.email, roles: data.roles } }));

      // Check for returnUrl redirect
      var params = new URLSearchParams(window.location.search);
      var returnUrl = params.get('returnUrl');
      if (returnUrl) window.location.href = returnUrl;
    } catch (err) {
      setGlobalAuthError('Error: ' + err.message);
    }
  }

  async function globalSubmitForgot() {
    var overlay = document.getElementById('globalAuthModal');
    var email = overlay.querySelector('#gForgotEmail').value.trim();
    var errorEl = overlay.querySelector('#gForgotError');
    var successEl = overlay.querySelector('#gForgotSuccess');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    if (!email) { errorEl.textContent = 'Please enter your email.'; errorEl.style.display = ''; return; }

    try {
      var response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        errorEl.textContent = data.detail || data.title || 'Could not send reset email.';
        errorEl.style.display = '';
        return;
      }
      successEl.textContent = data.message || 'Check your email for a password reset link.';
      successEl.style.display = '';
    } catch (err) {
      errorEl.textContent = 'Error: ' + err.message;
      errorEl.style.display = '';
    }
  }

  window.openLoginModal = function openLoginModal() {
    injectAuthModal();
    _authModal.style.display = '';
    var emailInput = _authModal.querySelector('#gAuthEmail');
    if (emailInput) emailInput.focus();
    if (_authCleanup) _authCleanup();
    _authCleanup = window.initModal(_authModal);
  };

  window.closeLoginModal = function closeLoginModal() {
    if (!_authModal) return;
    _authModal.style.display = 'none';
    if (_authCleanup) { _authCleanup(); _authCleanup = null; }
    // Clear form state
    var emailInput = _authModal.querySelector('#gAuthEmail');
    var passInput = _authModal.querySelector('#gAuthPassword');
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
    var errEl = _authModal.querySelector('#gAuthError');
    if (errEl) errEl.style.display = 'none';
    // Reset to login panel
    _authLoginMode = true;
    _authModal.querySelector('#gAuthPanel').style.display = '';
    _authModal.querySelector('#gForgotPanel').style.display = 'none';
    _authModal.querySelector('#gAuthTitle').textContent = 'Sign in';
  };

  /** Check session on page load and fire auth-changed event. */
  window.initGlobalAuth = async function initGlobalAuth() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        var data = await res.json();
        window.currentUser = data.email;
        window.currentRoles = data.roles || [];
        _hadSession = true;
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: data.email, roles: data.roles } }));
      } else {
        window.currentUser = null;
        window.currentRoles = [];
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null, roles: [] } }));
      }
    } catch {
      window.currentUser = null;
      window.currentRoles = [];
    }
  };

  /** Global fetch interceptor: open login modal on 401 for auth-required endpoints. */
  var _originalFetch = window.fetch;
  var _guestOptionalEndpoints = ['/api/user/preferences', '/api/user/ratings', '/api/user/favorites', '/api/runner/sessions'];
  window.fetch = function () {
    var args = arguments;
    return _originalFetch.apply(this, args).then(function (response) {
      if (response.status === 401) {
        var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        // Don't intercept the auth check itself or login/register endpoints
        if (url.includes('/api/auth/me') || url.includes('/api/auth/login') || url.includes('/api/auth/register') || url.includes('/api/auth/forgot-password') || url.includes('/api/auth/external')) {
          return response;
        }
        // Only intercept API calls (not static assets)
        if (url.startsWith('/api/')) {
          var isOptional = _guestOptionalEndpoints.some(function (ep) { return url.startsWith(ep); });
          if (isOptional && !_hadSession) {
            // Guest hitting an optional endpoint — silently ignore
            return response;
          }
          window.currentUser = null;
          window.openLoginModal();
          if (typeof showToast === 'function') {
            if (_hadSession) {
              showToast('Your session has expired. Please sign in again.', 'error');
            } else {
              showToast('Sign in to continue.', 'info');
            }
          }
          _hadSession = false;
        }
      }
      return response;
    });
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

    // Global auth check
    initGlobalAuth();
  });
})();
