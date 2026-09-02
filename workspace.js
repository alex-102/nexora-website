(() => {
  const cfg = window.NEXORA_SUPABASE;
  if (!cfg || !window.supabase) return;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  window.nexoraWorkspaceAuth = client;

  const state = { messages: [], sending: false };
  const messagesEl = $('#messages');
  const input = $('#promptInput');
  const send = $('#sendButton');

  const addMessage = (role, text) => {
    const node = document.createElement('article');
    node.className = `message ${role}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = role === 'user' ? 'YOU' : 'NEXORA / GPT-5.6';
    const body = document.createElement('div');
    body.textContent = text;
    node.append(meta, body);
    messagesEl.appendChild(node);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return node;
  };

  const setSending = (busy) => {
    state.sending = busy;
    send.disabled = busy;
    send.querySelector('span').hidden = busy;
    send.querySelector('.send-spinner').hidden = !busy;
  };

  const resizeInput = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 260)}px`;
  };
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#chatForm').requestSubmit();
    }
  });

  const callAI = async (prompt) => {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');

    const recent = state.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
    const response = await fetch('/.netlify/functions/nexora-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ message: prompt, history: recent })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'NEXORA could not complete the request.');
    return payload;
  };

  $('#chatForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (state.sending) return;
    const prompt = input.value.trim();
    if (!prompt) return;

    state.messages.push({ role:'user', content:prompt });
    addMessage('user', prompt);
    input.value = '';
    resizeInput();
    setSending(true);

    const placeholder = addMessage('assistant', 'Thinking…');
    try {
      const result = await callAI(prompt);
      placeholder.lastChild.textContent = result.output || 'I could not generate a response.';
      state.messages.push({ role:'assistant', content: result.output || '' });
    } catch (err) {
      placeholder.lastChild.textContent = err.message;
      state.messages.push({ role:'assistant', content: err.message });
    } finally {
      setSending(false);
      input.focus();
    }
  });

  $$('.quick-card').forEach(card => card.addEventListener('click', () => {
    input.value = card.dataset.prompt || '';
    resizeInput();
    input.focus();
  }));

  const modes = {
    research: ['RESEARCH', 'Turn a question into a structured research path. NEXORA will help define the important questions, evidence to collect, competing explanations and a useful final structure.'],
    files: ['FILES', 'Document intelligence is coming here. Upload PDFs, documents and datasets, then ask NEXORA to summarize, compare, extract or analyze them.'],
    create: ['CREATE', 'Use NEXORA to turn rough intent into polished drafts, plans, specifications, scripts and other useful outputs.'],
    build: ['BUILD', 'Turn an idea into a concrete product plan: users, workflows, features, architecture, milestones and the first practical version.']
  };
  const panel = $('#modePanel');
  const openMode = mode => {
    const data = modes[mode];
    if (!data) return;
    $('#modeTitle').textContent = data[0];
    $('#modeDescription').textContent = data[1];
    panel.hidden = false;
    panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
  };
  $$('.side-link').forEach(btn => btn.addEventListener('click', () => {
    $$('.side-link').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    if (mode === 'chat') {
      panel.hidden = true;
      input.focus();
    } else openMode(mode);
  }));
  $('#closeMode').addEventListener('click', () => panel.hidden = true);
  $('#modeLaunch').addEventListener('click', () => {
    const title = $('#modeTitle').textContent;
    const prompts = {
      RESEARCH:'I want to research a topic. Help me define the question and build a rigorous research plan.',
      FILES:'I want to analyze a file.',
      CREATE:'I want to create something. Help me shape the idea into a strong first draft.',
      BUILD:'I want to build a product. Help me define the user, workflow, feature set, architecture and first version.'
    };
    panel.hidden = true;
    input.value = prompts[title] || '';
    resizeInput();
    input.focus();
  });

  const userMenuButton = $('#userMenuButton');
  const userMenu = $('#userMenu');
  userMenuButton.addEventListener('click', () => {
    const open = userMenu.hidden;
    userMenu.hidden = !open;
    userMenuButton.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.workspace-user')) {
      userMenu.hidden = true;
      userMenuButton.setAttribute('aria-expanded','false');
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await client.auth.signOut({ scope:'local' });
    location.replace('index.html');
  });

  const boot = async () => {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user?.email_confirmed_at) {
      location.replace('login.html?next=app.html');
      return;
    }
    const fullName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'USER';
    const first = fullName.trim().charAt(0).toUpperCase() || 'N';
    $('#userAvatar').textContent = first;
    $('#userName').textContent = fullName.split(/\s+/)[0].toUpperCase();
  };

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) location.replace('index.html');
  });
  boot();
})();
