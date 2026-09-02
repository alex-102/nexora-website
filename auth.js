(() => {
  const cfg = window.NEXORA_SUPABASE;
  if (!cfg || !window.supabase) return;
  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  window.nexoraAuth = client;

  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => [...r.querySelectorAll(s)];
  const path = location.pathname;
  const siteUrl = location.origin;
  const safeNext = () => new URLSearchParams(location.search).get('next')?.startsWith('/') ? new URLSearchParams(location.search).get('next') : null;

  const setMessage = (el, type, text) => { if(!el)return; el.className=`auth-message show ${type}`; el.textContent=text; };
  const setBusy = (button,busy,label='Working…') => { if(!button)return; button.disabled=busy; const text=button.querySelector('[data-label]'); const spin=button.querySelector('.auth-loading'); if(text){if(busy){button.dataset.original=text.textContent;text.textContent=label}else text.textContent=button.dataset.original||text.textContent} spin?.classList.toggle('show',busy); };
  const friendlyError = e => {
    const m=(e?.message||'').toLowerCase();
    if(m.includes('invalid login')) return 'The email or password is incorrect.';
    if(m.includes('email not confirmed')) return 'Please verify your email address before signing in.';
    if(m.includes('password')) return 'Please check your password and try again.';
    if(m.includes('rate limit')||m.includes('too many')) return 'Too many attempts. Please wait a little and try again.';
    if(m.includes('expired')||m.includes('invalid token')) return 'This link has expired or is no longer valid. Please request a new one.';
    return 'We could not complete that request. Please try again.';
  };
  const redirectAfterAuth = () => location.href = safeNext() || 'account.html';

  // Password visibility
  $$('[data-password-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const input=$(btn.dataset.passwordToggle);if(!input)return;input.type=input.type==='password'?'text':'password';btn.textContent=input.type==='password'?'SHOW':'HIDE';}));

  // Password strength
  const password=$('#password'), strengthText=$('#strengthText'), bars=$$('.strength-bars i'), reqs={len:$('#reqLen'),upper:$('#reqUpper'),lower:$('#reqLower'),number:$('#reqNumber'),special:$('#reqSpecial')};
  const updateStrength=()=>{if(!password)return;const v=password.value, checks={len:v.length>=10,upper:/[A-Z]/.test(v),lower:/[a-z]/.test(v),number:/\d/.test(v),special:/[^A-Za-z0-9]/.test(v)};Object.entries(checks).forEach(([k,ok])=>reqs[k]?.classList.toggle('ok',ok));const score=Object.values(checks).filter(Boolean).length;bars.forEach((b,i)=>b.classList.toggle('on',i<Math.min(4,Math.ceil(score*.8))));if(strengthText)strengthText.textContent=score<3?'WEAK':score<5?'GOOD':'STRONG';return score===5};
  password?.addEventListener('input',updateStrength); updateStrength();

  // Login
  const loginForm=$('#loginForm');
  loginForm?.addEventListener('submit',async e=>{e.preventDefault();const msg=$('#formMessage'),btn=$('#submitBtn');setMessage(msg,'success','');msg.className='auth-message';setBusy(btn,true,'AUTHENTICATING…');try{const email=$('#email').value.trim().toLowerCase(),pass=$('#password').value; if(!/^\S+@\S+\.\S+$/.test(email)||!pass)throw new Error('Please enter a valid email and password.');const {data,error}=await client.auth.signInWithPassword({email,password:pass});if(error)throw error;if(!data.user?.email_confirmed_at){await client.auth.signOut({scope:'local'});location.href=`check-email.html?email=${encodeURIComponent(email)}&state=unverified`;return}setMessage(msg,'success','Access granted. Redirecting…');setTimeout(redirectAfterAuth,350)}catch(err){setMessage(msg,'error',friendlyError(err));}finally{setBusy(btn,false)}});

  // Google OAuth
  $$('[data-google]').forEach(btn=>btn.addEventListener('click',async()=>{const msg=$('#formMessage');setBusy(btn,true,'CONNECTING…');try{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${siteUrl}/auth-callback.html?next=${encodeURIComponent(safeNext()||'account.html')}`}});if(error)throw error;}catch(err){setBusy(btn,false);setMessage(msg,'error',friendlyError(err))}}));

  // Signup
  const signupForm=$('#signupForm');signupForm?.addEventListener('submit',async e=>{e.preventDefault();const msg=$('#formMessage'),btn=$('#submitBtn');msg.className='auth-message';const full=$('#fullName').value.trim(),email=$('#email').value.trim().toLowerCase(),pass=$('#password').value,confirm=$('#confirmPassword').value,terms=$('#terms').checked;if(full.length<2)return setMessage(msg,'error','Please enter your full name.');if(!/^\S+@\S+\.\S+$/.test(email))return setMessage(msg,'error','Please enter a valid email address.');if(!updateStrength())return setMessage(msg,'error','Choose a stronger password using all five requirements.');if(pass!==confirm)return setMessage(msg,'error','Passwords do not match.');if(!terms)return setMessage(msg,'error','Please accept the terms and privacy policy.');setBusy(btn,true,'CREATING ACCOUNT…');try{const {data,error}=await client.auth.signUp({email,password:pass,options:{data:{full_name:full},emailRedirectTo:`${siteUrl}/auth-callback.html?next=${encodeURIComponent('account.html')}`}});if(error)throw error;location.href=`check-email.html?email=${encodeURIComponent(email)}&state=sent`}catch(err){setMessage(msg,'error',friendlyError(err));}finally{setBusy(btn,false)}});

  // Forgot password — always show a generic success state to reduce account enumeration.
  const forgotForm=$('#forgotForm');forgotForm?.addEventListener('submit',async e=>{e.preventDefault();const msg=$('#formMessage'),btn=$('#submitBtn'),email=$('#email').value.trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))return setMessage(msg,'error','Please enter a valid email address.');setBusy(btn,true,'SENDING…');try{await client.auth.resetPasswordForEmail(email,{redirectTo:`${siteUrl}/reset-password.html`});setMessage(msg,'success','If an account is associated with that address, a password reset email has been sent. Please check your inbox.')}catch(err){setMessage(msg,'success','If an account is associated with that address, a password reset email has been sent. Please check your inbox.')}finally{setBusy(btn,false)}});

  // Reset password. Supabase exposes a recovery session after the reset link is opened.
  const resetForm=$('#resetForm');let recoveryReady=false;client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'&&session)recoveryReady=true;if(event==='SIGNED_IN'&&session&&path.endsWith('auth-callback.html'))location.href=safeNext()||'account.html';if(path.endsWith('reset-password.html')&&session)recoveryReady=true;});
  resetForm?.addEventListener('submit',async e=>{e.preventDefault();const msg=$('#formMessage'),btn=$('#submitBtn'),p=$('#newPassword').value,c=$('#confirmPassword').value;if(p.length<10||!/[A-Z]/.test(p)||!/[a-z]/.test(p)||!/[0-9]/.test(p)||!/[^A-Za-z0-9]/.test(p))return setMessage(msg,'error','Use at least 10 characters with uppercase, lowercase, number and symbol.');if(p!==c)return setMessage(msg,'error','Passwords do not match.');setBusy(btn,true,'UPDATING…');try{const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('expired');const {error}=await client.auth.updateUser({password:p});if(error)throw error;setMessage(msg,'success','Password updated. You can now sign in with your new password.');await client.auth.signOut({scope:'local'});setTimeout(()=>location.href='login.html',900)}catch(err){setMessage(msg,'error',friendlyError(err))}finally{setBusy(btn,false)}});

  // Check-email resend with 60-second local cooldown. Supabase also applies server-side rate limits.
  const resend=$('#resendBtn');let resendUntil=Number(localStorage.getItem('nexora_resend_until')||0);const renderResend=()=>{if(!resend)return;const left=Math.max(0,Math.ceil((resendUntil-Date.now())/1000));resend.disabled=left>0;resend.textContent=left?`RESEND IN ${left}s`:'RESEND VERIFICATION EMAIL'};renderResend();setInterval(renderResend,1000);resend?.addEventListener('click',async()=>{const email=new URLSearchParams(location.search).get('email')||'';if(!/^\S+@\S+\.\S+$/.test(email)||Date.now()<resendUntil)return;resendUntil=Date.now()+60000;localStorage.setItem('nexora_resend_until',resendUntil);renderResend();const {error}=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:`${siteUrl}/auth-callback.html?next=${encodeURIComponent('account.html')}`}});if(error){const m=$('#formMessage');setMessage(m,'error',friendlyError(error));}});

  // Account page / protected UI
  if(path.endsWith('account.html')){
    client.auth.getSession().then(async({data})=>{const session=data.session;if(!session||!session.user?.email_confirmed_at){location.href=`login.html?next=${encodeURIComponent('account.html')}`;return}const u=session.user;const profile=await client.from('profiles').select('full_name,avatar_url').eq('id',u.id).maybeSingle();const name=profile.data?.full_name||u.user_metadata?.full_name||u.user_metadata?.name||u.email?.split('@')[0]||'Operator';$('#accountName').textContent=name;$('#accountEmail').textContent=u.email||'';$('#accountAvatar').textContent=name.slice(0,1).toUpperCase();}).catch(()=>location.href='login.html');
  }
  $('#logoutBtn')?.addEventListener('click',async()=>{const btn=$('#logoutBtn');setBusy(btn,true,'SIGNING OUT…');await client.auth.signOut({scope:'local'});location.href='index.html'});

  // Homepage navigation is upgraded without rewriting the main site's architecture.
  if(path.endsWith('/')||path.endsWith('index.html')){
    const nav=$('#nav');if(nav){const old=nav.querySelector('.nav-cta');if(old){const auth=document.createElement('div');auth.className='auth-nav';auth.innerHTML='<a href="login.html" class="auth-login">LOGIN</a><a href="signup.html" class="auth-signup">SIGN UP ↗</a><button class="auth-account" hidden></button>';old.replaceWith(auth);const account=auth.querySelector('.auth-account');const login=auth.querySelector('.auth-login');const signup=auth.querySelector('.auth-signup');client.auth.getSession().then(async({data})=>{if(!data.session)return;login.hidden=true;signup.hidden=true;account.hidden=false;const u=data.session.user;account.textContent=(u.user_metadata?.full_name||u.email||'ACCOUNT').split(' ')[0].toUpperCase()+' ↓';account.onclick=()=>location.href='account.html'});}}
  }
})();
