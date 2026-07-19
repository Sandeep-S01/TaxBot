/* ==========================================================================
   TaxBot CA Console - Authentication UI Handlers
   Owns login, registration, auth-mode switching, and logout events.
   ========================================================================== */

function setupAuthHandlers() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const switchBtn = document.getElementById('btn-switch-auth');
  const logoutBtn = document.getElementById('btn-logout');

  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const switchText = document.getElementById('auth-switch-text');

  switchBtn.onclick = (e) => {
    e.preventDefault();
    if (loginForm.classList.contains('hidden')) {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      authTitle.textContent = 'CA Partner Login';
      authSubtitle.textContent = 'Access your reseller dashboard and bulk client files.';
      switchText.textContent = "Don't have a partner account?";
      switchBtn.textContent = 'Sign Up';
    } else {
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
      authTitle.textContent = 'CA Partner Sign Up';
      authSubtitle.textContent = 'Create a partner account to manage client folders.';
      switchText.textContent = 'Already have an account?';
      switchBtn.textContent = 'Sign In';
    }
  };

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/ca/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid credentials');

      localStorage.setItem('taxbot_ca_session', JSON.stringify({ ...data.ca, csrfToken: data.csrfToken }));
      showToast('Signed in successfully!');
      checkAuth();
    } catch (err) {
      showToast(err.message);
    }
  };

  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const firmName = document.getElementById('reg-firm').value;
    const password = document.getElementById('reg-password').value;

    try {
      const res = await fetch('/api/ca/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, email, password, firmName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register CA');

      showToast('Registration successful! Please login.');
      switchBtn.click();
      document.getElementById('login-email').value = email;
    } catch (err) {
      showToast(err.message);
    }
  };

  logoutBtn.onclick = async () => {
    try {
      await fetch('/api/ca/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'same-origin'
      });
    } catch (err) {
      console.warn('Logout request failed:', err);
    }
    localStorage.removeItem('taxbot_ca_session');
    showToast('Logged out successfully.');
    showAuthScreen();
  };
}
