(() => {
  const cfg = window.NEXORA_SUPABASE;
  if (!cfg || !window.supabase) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const path = location.pathname;
  const siteUrl = location.origin;
  const params = new URLSearchParams(location.search);
  const safeNext = () => {
    const next = params.get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  };

  // "Remember me" is implemented with the browser's persistent vs tab storage.
  // Supabase itself still owns the session format and token lifecycle.
  const rememberBox = $('#remember');
  if (rememberBox) {
    const saved = localStorage.getItem('nexora_remember');
    if (saved !== null) rememberBox.checked = saved === '1';
    rememberBox.addEventListener('change', () => {
      localStorage.setItem('nexora_remember', rememberBox.checked ? '1' : '0');
    });
  }
  const shouldRemember = () => localStorage.getItem('nexora_remember') !== '0';
  const authStorage = {
    getItem: (key) => (shouldRemember() ? localStorage : sessionStorage).getItem(key),
    setItem: (key, value) => {
      const primary = shouldRemember() ? localStorage : sessionStorage;
      const secondary = shouldRemember() ? sessionStorage : localStorage;
      primary.setItem(key, value);
      secondary.removeItem(key);
    },
    removeItem: (key) => {
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
      } else {
        text.textContent = button.dataset.original || text.textContent;
      }
    }
    spin?.classList.toggle('show', busy);
  };
  const friendlyError = (e) => {
    const m = (e?.message || '').toLowerCase();
    if (m.includes('invalid login')) return 'The email or password is incorrect.';
    if (m.includes('email not confirmed')) return 'Please verify your email address before signing in.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a little and try again.';
    if (m.includes('expired') || m.includes('invalid token') || m.includes('otp')) return 'This link has expired or is no longer valid. Please request a new one.';
    if (m.includes('password')) return 'Please check the password and try again.';
    return 'We could not complete that request. Please try again.';
  };
  const redirectAfterAuth = () => { location.replace(safeNext() || 'account.html'); };

  // Password visibility
  $$('[data-password-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const input = $(btn.dataset.passwordToggle);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? 'SHOW' : 'HIDE';
    btn.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
  }));

  // Password strength
  const password = $('#password');
  const strengthText = $('#strengthText');
  const bars = $$('.strength-bars i');
  const reqs = {
    len: $('#reqLen'), upper: $('#reqUpper'), lower: $('#reqLower'),
    number: $('#reqNumber'), special: $('#reqSpecial')
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

  // Login
  const loginForm = $('#loginForm');
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMessage');
    const btn = $('#submitBtn');
    setMessage(msg, '', '');
    const email = $('#email').value.trim().toLowerCase();
    const pass = $('#password').value;
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
        location.replace(`check-email.html?email=${encodeURIComponent(email)}&state=unverified`);
        return;
      }
      setAuthState('logged_in_verified', data.session);
      setMessage(msg, 'success', 'Access granted. Redirecting…');
      setTimeout(redirectAfterAuth, 250);
    } catch (err) {
      setAuthState('logged_out');
      setMessage(msg, 'error', friendlyError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // Google OAuth
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

  // Signup
  const signupForm = $('#signupForm');
  signupForm?.addEventListener('submit', async (e) => {
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
          emailRedirectTo: `${siteUrl}/auth-callback.html?next=${encodeURIComponent('account.html')}`
        }
      });
      if (error) throw error;
      setAuthState('logged_in_unverified');
      location.replace(`check-email.html?email=${encodeURIComponent(email)}&state=sent`);
    } catch (err) {
      setAuthState('logged_out');
      setMessage(msg, 'error', friendlyError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // Password recovery — response is enumeration-safe.
  const forgotForm = $('#forgotForm');
  forgotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMessage');
    const btn = $('#submitBtn');
    const email = $('#email').value.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage(msg, 'error', 'Please enter a valid email address.');
    setBusy(btn, true, 'SENDING…');
    try {
      await client.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/reset-password.html` });
      setMessage(msg, 'success', 'If an account is associated with that address, a password reset email has been sent. Please check your inbox.');
    } catch (err) {
      // Do not expose whether an account exists; still surface an operational failure safely.
      setMessage(msg, 'error', 'We could not process that request right now. Please wait a moment and try again.');
    } finally {
      setBusy(btn, false);
    }
  });

  // Recovery flow.
  const resetForm = $('#resetForm');
  let recoveryReady = false;
  let recoveryChecked = false;
  const finishRecoveryCheck = async () => {
    if (recoveryChecked) return;
    const { data } = await client.auth.getSession();
    recoveryChecked = true;
    if (data.session) {
      recoveryReady = true;
      return;
    }
    if (path.endsWith('reset-password.html')) {
      const msg = $('#formMessage');
      const button = $('#submitBtn');
      setMessage(msg, 'error', 'This recovery link has expired or is no longer valid. Request a new reset email.');
      if (button) button.disabled = true;
    }
  };
  client.auth.onAuthStateChange((event, session) => {
    if (session?.user?.email_confirmed_at) setAuthState('logged_in_verified', session);
    else if (session) setAuthState('logged_in_unverified', session);
    else if (event !== 'INITIAL_SESSION') setAuthState('logged_out', null);

    if (event === 'PASSWORD_RECOVERY' && session) {
      recoveryReady = true;
      return;
    }
    if (event === 'SIGNED_IN' && session && path.endsWith('auth-callback.html')) {
      redirectAfterAuth();
      return;
    }
    if (path.endsWith('reset-password.html') && event === 'INITIAL_SESSION') finishRecoveryCheck();
    if (path.endsWith('reset-password.html') && event === 'PASSWORD_RECOVERY') finishRecoveryCheck();
    if (path.endsWith('account.html') && event === 'SIGNED_OUT') {
      location.replace('login.html?next=account.html');
    }
  });

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMessage');
    const btn = $('#submitBtn');
    const p = $('#newPassword').value;
    const c = $('#confirmPassword').value;
    if (p.length < 10 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/[0-9]/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
      return setMessage(msg, 'error', 'Use at least 10 characters with uppercase, lowercase, number and symbol.');
    }
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
    } catch (err) {
      setMessage(msg, 'error', friendlyError(err));
    } finally {
      setBusy(btn, false);
    }
  });

  // Verification resend with local cooldown; Supabase also enforces server-side auth limits.
  const resend = $('#resendBtn');
  let resendUntil = Number(localStorage.getItem('nexora_resend_until') || 0);
  const renderResend = () => {
    if (!resend) return;
    const left = Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000));
    resend.disabled = left > 0;
    resend.textContent = left ? `RESEND IN ${left}s` : 'RESEND VERIFICATION EMAIL';
  };
  renderResend();
  resend && setInterval(renderResend, 1000);
  resend?.addEventListener('click', async () => {
    const email = params.get('email') || '';
    if (!/^\S+@\S+\.\S+$/.test(email) || Date.now() < resendUntil) return;
    resendUntil = Date.now() + 60000;
    localStorage.setItem('nexora_resend_until', resendUntil);
    renderResend();
    try {
      const { error } = await client.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${siteUrl}/auth-callback.html?next=${encodeURIComponent('account.html')}` }
      });
      if (error) throw error;
      setMessage($('#formMessage'), 'success', 'A new verification email has been requested. Check your inbox.');
    } catch (err) {
      setMessage($('#formMessage'), 'error', friendlyError(err));
    }
  });

  // Auth callback error/success state.
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
    } else {
      setMessage($('#formMessage'), 'success', 'Handshake complete. Redirecting…');
    }
  }

  // Account page / protected UI
  const loadAccount = async () => {
    const { data } = await client.auth.getSession();
    const session = data.session;
    if (!session || !session.user) {
      setAuthState('logged_out');
      location.replace(`login.html?next=${encodeURIComponent('account.html')}`);
      return;
    }
    if (!session.user.email_confirmed_at) {
      setAuthState('logged_in_unverified', session);
      await client.auth.signOut({ scope: 'local' });
      location.replace(`check-email.html?email=${encodeURIComponent(session.user.email || '')}&state=unverified`);
      return;
    }
    setAuthState('logged_in_verified', session);
    const u = session.user;
    const profile = await client.from('profiles').select('full_name,avatar_url').eq('id', u.id).maybeSingle();
    const name = profile.data?.full_name || u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'Operator';
    $('#accountName').textContent = name;
    $('#accountEmail').textContent = u.email || '';
    $('#accountAvatar').textContent = name.slice(0, 1).toUpperCase();
    const googleLink = $('#linkGoogleBtn');
    if (googleLink) {
      try {
        const identities = (await client.auth.getUserIdentities()).data?.identities || [];
        const connected = identities.some((identity) => identity.provider === 'google');
        googleLink.textContent = connected ? 'GOOGLE CONNECTED' : 'CONNECT GOOGLE';
        googleLink.disabled = connected;
        googleLink.addEventListener('click', async () => {
          if (connected) return;
          setBusy(googleLink, true, 'CONNECTING…');
          const { error } = await client.auth.linkIdentity({
            provider: 'google',
            options: { redirectTo: `${siteUrl}/auth-callback.html?next=${encodeURIComponent('account.html')}` }
          });
          if (error) {
            setBusy(googleLink, false);
            setMessage($('#formMessage'), 'error', friendlyError(error));
          }
        });
      } catch (_) {
        // Identity enumeration is optional UI; the authenticated account remains usable.
      }
    }
  };
  if (path.endsWith('account.html')) loadAccount().catch(() => location.replace('login.html?next=account.html'));

  $('#logoutBtn')?.addEventListener('click', async () => {
    const btn = $('#logoutBtn');
    setBusy(btn, true, 'SIGNING OUT…');
    await client.auth.signOut({ scope: 'local' });
    localStorage.removeItem('nexora_auth-session');
    location.replace('index.html');
  });

  // Homepage navigation upgrade.
  if (path.endsWith('/') || path.endsWith('index.html')) {
    const nav = $('#nav');
    if (nav) {
      const old = nav.querySelector('.nav-cta');
      if (old) {
        const auth = document.createElement('div');
        auth.className = 'auth-nav';
        auth.innerHTML = '<a href="login.html" class="auth-login">LOGIN</a><a href="signup.html" class="auth-signup">SIGN UP ↗</a><button class="auth-account" hidden type="button"></button>';
        old.replaceWith(auth);
        const account = auth.querySelector('.auth-account');
        const login = auth.querySelector('.auth-login');
        const signup = auth.querySelector('.auth-signup');
        client.auth.getSession().then(({ data }) => {
          if (!data.session?.user) return;
          if (login) login.hidden = true;
          if (signup) signup.hidden = true;
          if (account) {
            account.hidden = false;
            const u = data.session.user;
            account.textContent = `${(u.user_metadata?.full_name || u.email || 'ACCOUNT').split(' ')[0].toUpperCase()} ↓`;
            account.onclick = () => location.href = 'account.html';
          }
        });
      }
    }
  }
})();
