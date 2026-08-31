const guestSection = document.getElementById('guestSection');
const accountSection = document.getElementById('accountSection');
const accountEmail = document.getElementById('accountEmail');
const signInBtn = document.getElementById('signInBtn');
const logOutBtn = document.getElementById('logOutBtn');
const contrastToggle = document.getElementById('contrastToggle');

document.addEventListener('DOMContentLoaded', () => {
  signInBtn.addEventListener('click', () => window.openLoginModal());

  logOutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    window.location.reload();
  });

  contrastToggle.addEventListener('change', () => {
    window.setHighContrast(contrastToggle.checked);
  });

  // Global auth: toggle guest / account sections
  window.addEventListener('auth-changed', (e) => {
    const { user } = e.detail;
    if (user) {
      guestSection.classList.add('hidden');
      accountSection.classList.remove('hidden');
      accountEmail.textContent = user;
      contrastToggle.checked = document.body.classList.contains('high-contrast');
    } else {
      guestSection.classList.remove('hidden');
      accountSection.classList.add('hidden');
    }
  });

  initGlobalAuth();
});
