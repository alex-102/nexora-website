(() => {
  const cfg = window.NEXORA_SUPABASE;
  if (!cfg || !window.supabase) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const path = location.pathname;
  const siteUrl = location.origin;
  const params = new URLSearchParams(location.search);

  // Only allow local application destinations. Never trust an arbitrary next URL.
  const safeNext = () => {
    const next = params.get('next');
    if (!next) return null;
    if (/^\/(?!\/)/.test(next)) return next;
    if (/^(?:account|index|login|signup|forgot-password|check-email)\.html(?:\?.*)?$/.test(next)) return next;
    return null;
  };

  // Load the navigation stylesheet once. The auth UI is kept separate from the core site styles.
  if (path === '/' || path.endsWith('/index.html')) {
    const cssId = 'nexora-auth-nav-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'auth-nav.css?v=1';
      document.head.appendChild(link);
    }
  }

  // Remember-me controls persistent localStorage vs sessionStorage.
  const rememberBox = $('#remember');
  const savedRemember = localStorage.getItem('nexora_remember');
  if (rememberBox) {
    if (savedRemember !== null) rememberBox.checked = savedRemember === '1';
    rememberBox.addEventListener('change', () => {
      localStorage.setItem('nexora_remember', rememberBox.checked ? '1' : '0');
    });
  }
  const shouldRemember = () => localStorage.getItem('nexora_remember') !== '0';
  const authStorage = {
    getItem(key) { return (shouldRemember() ? localStorage : sessionStorage).getItem(key); },
    setItem(key, value) {
      const primary = shouldRemember() ? localStorage : sessionStorage;
      const secondary = shouldRemember() ? sessionStorage : localStorage;
      primary.setItem(key, value);
      secondary.removeItem(key);
    },
    removeItem(key) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  };

  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: authStorage,
      storageKey: 'nexora-auth-session'
    }
  });
  window.nexoraAuth = client;

  const setAuthState = (state, session = null) => {
    window.NEXORA_AUTH_STATE = state;
    window.NEXORA_AUTH_SESSION = session;
    window.dispatchEvent(new CustomEvent('nexora:auth-state', { detail: { state, session } }));
  };
  setAuthState('loading');

  const setMessage = (el, type, text) => {
    if (!el) return;
    el.className = text ? `auth-message show ${type}` : 'auth-message';
    el.textContent = text || '';
  };
  const setBusy = (button, busy, label = 'Working…') => {
    if (!button) return;
    button.disabled = busy;
    const text = button.querySelector('[data-label]');
    const spin = button.querySelector('.auth-loading');
    if (text) {
      if (busy) {
        if (!button.dataset.original) button.dataset.original = text.textContent;
        text.textContent = label;
      } else text.textContent = button.dataset.original || text.textContent;
    }
    spin?.classList.toggle('show', busy);
  };
  const friendlyError = (e) => {
    const m = String(e?.message || '').toLowerCase();
    if (m.includes('invalid login')) return 'The email or password is incorrect.';
    if (m.includes('email not confirmed')) return 'Please verify your email address before signing in.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a little and try again.';
    if (m.includes('expired') || m.includes('invalid token') || m.includes('otp') || m.includes('code')) return 'This link has expired or is no longer valid. Please request a new one.';
    if (m.includes('already registered') || m.includes('already exists')) return 'That email address is already registered. Try signing in instead.';
    if (m.includes('password')) return 'Please check the password and try again.';
    return 'We could not complete that request. Please try again.';
  };
  const redirectAfterAuth = () => location.replace(safeNext() || 'account.html');

  // Password show/hide.
  $$('[data-password-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const input = $(btn.dataset.passwordToggle);
    if (!input) return;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    btn.textContent = visible ? 'HIDE' : 'SHOW';
    btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  }));

  // Signup password strength.
  const password = $('#password');
  const strengthText = $('#strengthText');
  const bars = $$('.strength-bars i');
  const reqs = {
    len: $('#reqLen'), upper: $('#reqUpper'), lower: $('#reqLower'), number: $('#reqNumber'), special: $('#reqSpecial')
  };
  const passwordChecks = (v) => ({
    len: v.length >= 10,
    upper: /[A-Z]/.test(v),
    lower: /[a-z]/.test(v),
    number: /\d/.test(v),
    special: /[^A-Za-z0-9]/.test(v)
  });
  const updateStrength = () => {
    if (!password) return false;
    const checks = passwordChecks(password.value);
    Object.entries(checks).forEach(([k, ok]) => reqs[k]?.classList.toggle('ok', ok));
    const score = Object.values(checks).filter(Boolean).length;
    bars.forEach((b, i) => b.classList.toggle('on', i < Math.min(4, Math.ceil(score * 0.8))));
    if (strengthText) strengthText.textContent = score < 3 ? 'WEAK' : score < 5 ? 'GOOD' : 'STRONG';
    return score === 5;
  };
  password?.addEventListener('input', updateStrength);
  updateStrength();

  // Login.
  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMessage');
    const btn = $('#submitBtn');
    const email = $('#email').value.trim().toLowerCase();
    const pass = $('#password').value;
    setMessage(msg, '', '');
    if (!/^\S+@\S+\.\S+$/.test(email) || !pass) {
      setAuthState('logged_out');
      return setMessage(msg, 'error', 'Please enter a valid email and password.');
    }
    setBusy(btn, true, 'AUTHENTICATING…');
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      if (!data.user?.email_confirmed_at) {
        setAuthState('logged_in_unverified', data.session);
        await client.auth.signOut({ scope: 'local' });
        return location.replace(`check-email.html?email=${encodeURIComponent(email)}&state=unverified`);
      }
      setAuthState('logged_in_verified', data.session);
      setMessage(msg, 'success', 'Access granted. Redirecting…');
      setTimeout(redirectAfterAuth, 250);
    } catch (err) {
      setAuthState('logged_out');
      setMessage(msg, 'error', friendlyError(err));
    } finally { setBusy(btn, false); }
  });

  // Google OAuth.
  $$('[data-google]').forEach((btn) => btn.addEventListener('click', async () => {
    const msg = $('#formMessage');
    setBusy(btn, true, 'CONNECTING…');
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${siteUrl}/auth-callback.html?next=${encodeURIComponent(safeNext() || 'account.html')}`
        }
      });
      if (error) throw error;
    } catch (err) {
      setBusy(btn, false);
      setMessage(msg, 'error', friendlyError(err));
    }
  }));

  // Signup.
  $('#signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMessage');
    const btn = $('#submitBtn');
    const full = $('#fullName').value.trim().replace(/\s+/g, ' ');
    const email = $('#email').value.trim().toLowerCase();
    const pass = $('#password').value;
    const confirm = $('#confirmPassword').value;
    const terms = $('#terms')?.checked;
    setMessage(msg, '', '');
    if (full.length < 2 || full.length > 120) return setMessage(msg, 'error', 'Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage(msg, 'error', 'Please enter a valid email address.');
    if (!updateStrength()) return setMessage(msg, 'error', 'Choose a stronger password using all five requirements.');
    if (pass !== confirm) return setMessage(msg, 'error', 'Passwords do not match.');
    if (!terms) return setMessage(msg, 'error', 'Please accept the terms and privacy policy.');
    setBusy(btn, true, 'CREATING ACCOUNT…');
    try {
      const { error } = await client.auth.signUp({
        email,
        password: pass,
        options: {
          data: { full_name: full },
          emailRedirectTo: `${siteUrl}/auth-callback.html?next=account.html`
        }
      });
      if (error) throw error;
      setAuthState('logged_in_unverified');
      location.replace(`check-email.html?email=${encodeURIComponent(email)}&state=sent`);
    } catch (err) {
      setAuthState('logged_out');
      setMessage(msg, 'error', friendlyError(err));
    } finally { setBusy(btn, false); }
  });

  // Password recovery.
  $('#forgotForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMessage');
    const btn = $('#submitBtn');
    const email = $('#email').value.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage(msg, 'error', 'Please enter a valid email address.');
    setBusy(btn, true, 'SENDING…');
    try {
      await client.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/reset-password.html` });
      setMessage(msg, 'success', 'If an account is associated with that address, a password reset email has been sent. Please check your inbox.');
    } catch {
      setMessage(msg, 'error', 'We could not process that request right now. Please wait a moment and try again.');
    } finally { setBusy(btn, false); }
  });

  // Recovery-link state.
  const resetForm = $('#resetForm');
  let recoveryReady = false;
  let recoveryChecked = false;
  const finishRecoveryCheck = async () => {
    if (recoveryChecked) return;
    const { data } = await client.auth.getSession();
    recoveryChecked = true;
    if (data.session) recoveryReady = true;
    else if (path.endsWith('reset-password.html')) {
      setMessage($('#formMessage'), 'error', 'This recovery link has expired or is no longer valid. Request a new reset email.');
      const button = $('#submitBtn');
      if (button) button.disabled = true;
    }
  };

  client.auth.onAuthStateChange((event, session) => {
    if (session?.user?.email_confirmed_at) setAuthState('logged_in_verified', session);
    else if (session) setAuthState('logged_in_unverified', session);
    else if (event !== 'INITIAL_SESSION') setAuthState('logged_out', null);

    if (event === 'PASSWORD_RECOVERY' && session) recoveryReady = true;
    if (event === 'SIGNED_IN' && session && path.endsWith('auth-callback.html')) redirectAfterAuth();
    if (path.endsWith('reset-password.html') && (event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY')) finishRecoveryCheck();
    if (path.endsWith('account.html') && event === 'SIGNED_OUT') location.replace('login.html?next=account.html');
  });

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMessage');
    const btn = $('#submitBtn');
    const p = $('#newPassword').value;
    const c = $('#confirmPassword').value;
    if (p.length < 10 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p) || !/[^A-Za-z0-9]/.test(p)) return setMessage(msg, 'error', 'Use at least 10 characters with uppercase, lowercase, number and symbol.');
    if (p !== c) return setMessage(msg, 'error', 'Passwords do not match.');
    if (!recoveryReady) await finishRecoveryCheck();
    if (!recoveryReady) return;
    setBusy(btn, true, 'UPDATING…');
    try {
      const { error } = await client.auth.updateUser({ password: p });
      if (error) throw error;
      setMessage(msg, 'success', 'Password updated. You can now sign in with your new password.');
      await client.auth.signOut({ scope: 'local' });
      setTimeout(() => location.replace('login.html'), 800);
    } catch (err) { setMessage(msg, 'error', friendlyError(err)); }
    finally { setBusy(btn, false); }
  });

  // Email verification resend.
  const resend = $('#resendBtn');
  let resendUntil = Number(localStorage.getItem('nexora_resend_until') || 0);
  const renderResend = () => {
    if (!resend) return;
    const left = Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000));
    resend.disabled = left > 0;
    resend.textContent = left ? `RESEND IN ${left}s` : 'RESEND VERIFICATION EMAIL';
  };
  renderResend();
  if (resend) setInterval(renderResend, 1000);
  resend?.addEventListener('click', async () => {
    const email = params.get('email') || '';
    if (!/^\S+@\S+\.\S+$/.test(email) || Date.now() < resendUntil) return;
    resendUntil = Date.now() + 60000;
    localStorage.setItem('nexora_resend_until', String(resendUntil));
    renderResend();
    try {
      const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${siteUrl}/auth-callback.html?next=account.html` } });
      if (error) throw error;
      setMessage($('#formMessage'), 'success', 'A new verification email has been requested. Check your inbox.');
    } catch (err) { setMessage($('#formMessage'), 'error', friendlyError(err)); }
  });

  // Callback status.
  if (path.endsWith('auth-callback.html')) {
    const title = $('#callbackTitle');
    const text = $('#callbackText');
    const action = $('#callbackAction');
    const error = params.get('error_description') || params.get('error') || params.get('error_code');
    if (error) {
      if (title) title.textContent = 'Authentication failed';
      if (text) text.textContent = 'The authentication link could not be completed.';
      setMessage($('#formMessage'), 'error', friendlyError({ message: error }));
      if (action) action.style.display = 'inline-flex';
    } else setMessage($('#formMessage'), 'success', 'Handshake complete. Redirecting…');
  }

  // Protected account page.
  const loadAccount = async () => {
    const { data } = await client.auth.getSession();
    const session = data.session;
    if (!session || !session.user?.email_confirmed_at) {
      setAuthState(session ? 'logged_in_unverified' : 'logged_out', session);
      location.replace('login.html?next=account.html');
      return;
    }
    setAuthState('logged_in_verified', session);
    const u = session.user;
    const profile = await client.from('profiles').select('full_name,avatar_url').eq('id', u.id).maybeSingle();
    const name = profile.data?.full_name || u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'Operator';
    $('#accountName').textContent = name;
    $('#accountEmail').textContent = u.email || '';
    const avatar = $('#accountAvatar');
    if (avatar) {
      if (profile.data?.avatar_url || u.user_metadata?.avatar_url) {
        avatar.innerHTML = `<img src="${profile.data?.avatar_url || u.user_metadata.avatar_url}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
      } else avatar.textContent = name.slice(0, 1).toUpperCase();
    }
  };
  if (path.endsWith('account.html')) loadAccount().catch(() => location.replace('login.html?next=account.html'));

  // Account logout button.
  $('#logoutBtn')?.addEventListener('click', async () => {
    const btn = $('#logoutBtn');
    setBusy(btn, true, 'SIGNING OUT…');
    try { await client.auth.signOut({ scope: 'local' }); }
    finally { location.replace('index.html'); }
  });

  // Homepage auth navigation. This adds controls without altering the original nav structure.
  const setupHomepageNav = async () => {
    if (!(path === '/' || path.endsWith('/index.html'))) return;
    const nav = $('#nav');
    if (!nav || $('.auth-nav', nav)) return;

    const originalCta = $('.nav-cta', nav);
    const auth = document.createElement('div');
    auth.className = 'auth-nav';
    auth.innerHTML = `
      <div class="auth-nav-fallback">
        <a class="auth-login" href="login.html">LOGIN</a>
        <a class="auth-signup" href="signup.html">SIGN UP ↗</a>
        <button class="auth-account-trigger" type="button" hidden aria-haspopup="menu" aria-expanded="false">
          <span class="auth-avatar-mini">N</span><span class="auth-account-label">ACCOUNT</span><span class="auth-chevron">▾</span>
        </button>
      </div>
      <div class="auth-user-menu" role="menu" aria-hidden="true">
        <div class="auth-user-meta"><div class="auth-user-name">NEXORA USER</div><div class="auth-user-email">SIGNED OUT</div></div>
        <a href="account.html" role="menuitem">MY ACCOUNT ↗</a>
        <button class="auth-logout" type="button" role="menuitem">LOG OUT</button>
      </div>`;

    if (originalCta) originalCta.replaceWith(auth);
    else nav.appendChild(auth);

    const login = $('.auth-login', auth);
    const signup = $('.auth-signup', auth);
    const trigger = $('.auth-account-trigger', auth);
    const menu = $('.auth-user-menu', auth);
    const logout = $('.auth-logout', auth);
    const userName = $('.auth-user-name', auth);
    const userEmail = $('.auth-user-email', auth);
    const avatar = $('.auth-avatar-mini', auth);

    const closeMenu = () => {
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    };
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      menu.setAttribute('aria-hidden', String(!open));
      trigger.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => { if (!auth.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      logout.textContent = 'SIGNING OUT…';
      try { await client.auth.signOut({ scope: 'local' }); }
      finally { location.replace('index.html'); }
    });

    const applySession = (session) => {
      const verified = Boolean(session?.user?.email_confirmed_at);
      const user = session?.user;
      login.hidden = Boolean(user);
      signup.hidden = Boolean(user);
      trigger.hidden = !user;
      if (user) {
        const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'ACCOUNT';
        const display = name.split(/\s+/)[0].slice(0, 18).toUpperCase();
        trigger.querySelector('.auth-account-label').textContent = verified ? display : 'VERIFY EMAIL';
        avatar.textContent = display.slice(0, 1) || 'N';
        userName.textContent = name;
        userEmail.textContent = verified ? (user.email || 'VERIFIED') : 'EMAIL NOT VERIFIED';
      }
    };

    const { data } = await client.auth.getSession();
    applySession(data.session);
    client.auth.onAuthStateChange((_event, session) => applySession(session));
  };

  setupHomepageNav().catch(() => {
    // Fail soft: the original site remains usable even if auth navigation cannot initialize.
  });
})();
