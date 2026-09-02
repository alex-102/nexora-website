(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Navigation state
  const nav = $('#nav');
  const updateNav = () => nav?.classList.toggle('scrolled', window.scrollY > 32);
  addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  // Scroll reveals
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('in'));

  // Layer interaction + changes the core's state label.
  const layerData = [
    ['PERCEPTION', 'SEE'], ['REASONING', 'THINK'], ['PREDICTION', 'ANTICIPATE'],
    ['GENERATION', 'CREATE'], ['AUTOMATION', 'ACT']
  ];
  const layers = $$('.layer');
  layers.forEach((layer, index) => layer.addEventListener('click', () => {
    layers.forEach(x => x.classList.remove('active'));
    layer.classList.add('active');
    const state = $('#engine-state');
    if (state) state.textContent = `${String(index + 1).padStart(2, '0')} / ${layerData[index][0]} — ${layerData[index][1]}`;
    const orb = $('.engine-orb');
    if (orb) orb.style.setProperty('--layer-tilt', `${(index - 2) * 5}deg`);
  }));

  // Live clock
  const clock = $('#clock');
  const tick = () => { if (clock) clock.textContent = `LOCAL TIME — ${new Date().toLocaleTimeString([], { hour12: false })}`; };
  tick(); setInterval(tick, 1000);

  // Signal network canvas
  const canvas = $('#noiseCanvas');
  const box = canvas?.closest('.signal-box');
  if (canvas && box) {
    const ctx = canvas.getContext('2d');
    let points = [], raf = 0, w = 0, h = 0;
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const ratio = dpr(); w = box.clientWidth; h = box.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * ratio));
      canvas.height = Math.max(1, Math.floor(h * ratio));
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      points = Array.from({ length: Math.min(175, Math.floor(w / 7)) }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .55, vy: (Math.random() - .5) * .55,
        r: .45 + Math.random() * 1.5
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const centerX = w / 2, centerY = h / 2;
      points.forEach((p, i) => {
        const dx = centerX - p.x, dy = centerY - p.y;
        const pull = Math.min(.035, .003 + Math.hypot(dx, dy) / Math.max(w, h) * .018);
        p.vx += dx * pull * .01; p.vy += dy * pull * .01;
        p.vx *= .995; p.vy *= .995; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(187,195,255,.72)'; ctx.fill();
        for (let j = i + 1; j < points.length; j++) {
          const q = points[j], dd = Math.hypot(p.x - q.x, p.y - q.y);
          if (dd < 75) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(142,155,255,${.08 * (1 - dd / 75)})`;
            ctx.lineWidth = .5; ctx.stroke();
          }
        }
      });
      raf = requestAnimationFrame(draw);
    };
    addEventListener('resize', resize); resize(); draw();
    addEventListener('pagehide', () => cancelAnimationFrame(raf));
  }

  // Magnetic buttons / custom cursor on pointer devices.
  const finePointer = matchMedia('(pointer:fine)').matches;
  const cursorDot = $('#cursor-dot'), cursorRing = $('#cursor-ring');
  if (finePointer && cursorDot && cursorRing) {
    document.body.classList.add('cursor-ready');
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; cursorDot.style.left = `${mx}px`; cursorDot.style.top = `${my}px`; cursorDot.style.opacity = 1; cursorRing.style.opacity = 1; });
    const animateCursor = () => { rx += (mx - rx) * .15; ry += (my - ry) * .15; cursorRing.style.left = `${rx}px`; cursorRing.style.top = `${ry}px`; requestAnimationFrame(animateCursor); };
    animateCursor();
    $$('[data-magnetic]').forEach(el => el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect(); const dx = (e.clientX - (r.left + r.width / 2)) * .16; const dy = (e.clientY - (r.top + r.height / 2)) * .16; el.style.transform = `translate(${dx}px,${dy}px)`;
    }));
    $$('[data-magnetic]').forEach(el => el.addEventListener('mouseleave', () => { el.style.transform = ''; }));
    $$('a,button,.cap,.lab-card,.layer').forEach(el => { el.addEventListener('mouseenter', () => cursorRing.classList.add('big')); el.addEventListener('mouseleave', () => cursorRing.classList.remove('big')); });
  }

  // Gentle pointer parallax on the hero core.
  const hero = $('.hero'), sun = $('.hero-sun');
  if (finePointer && hero && sun) {
    let tx = 0, ty = 0, cx = 0, cy = 0;
    hero.addEventListener('mousemove', e => { const r = hero.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5; });
    const parallax = () => { cx += (tx - cx) * .035; cy += (ty - cy) * .035; sun.style.marginLeft = `${cx * 22}px`; sun.style.marginTop = `${cy * 22}px`; requestAnimationFrame(parallax); };
    parallax();
  }
})();
