(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const finePointer = matchMedia('(pointer:fine)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(max-width:680px)').matches;

  const preloader = $('#preloader');
  addEventListener('load', () => setTimeout(() => preloader?.classList.add('hide'), reducedMotion ? 0 : 850));
  setTimeout(() => preloader?.classList.add('hide'), 2600);

  const nav = $('#nav');
  const updateNav = () => nav?.classList.toggle('scrolled', scrollY > 32);
  addEventListener('scroll', updateNav, { passive: true }); updateNav();

  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    }), { threshold: .12, rootMargin: '0px 0px -30px' });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('in'));

  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault(); target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }));

  const layerData = [
    ['PERCEPTION', 'SEE', 'READING THE WORLD', '37%'],
    ['REASONING', 'THINK', 'BUILDING CONTEXT', '52%'],
    ['PREDICTION', 'ANTICIPATE', 'MODELING WHAT COMES NEXT', '68%'],
    ['GENERATION', 'CREATE', 'TURNING INTENT INTO OUTPUT', '44%'],
    ['AUTOMATION', 'ACT', 'CLOSING THE LOOP', '81%']
  ];
  const layers = $$('.layer');
  layers.forEach((layer, index) => layer.addEventListener('click', () => {
    layers.forEach(x => x.classList.remove('active')); layer.classList.add('active');
    const state = $('#engineState'); const load = $('#engineLoad');
    if (state) state.textContent = `${String(index + 1).padStart(2,'0')} / ${layerData[index][0]} — ${layerData[index][1]}`;
    if (load) load.textContent = `CORE LOAD ${layerData[index][3]}`;
    document.documentElement.style.setProperty('--active-layer', index);
  }));

  const clock = $('#clock');
  const tick = () => { if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour12:false }); };
  tick(); setInterval(tick, 1000);

  const bars = $('#bars');
  if (bars) {
    const vals = Array.from({length:36}, () => 18 + Math.random()*70);
    vals.forEach((v,i) => { const b=document.createElement('i'); b.className='bar'; b.style.height=`${v}%`; b.style.animationDelay=`${i*-55}ms`; bars.appendChild(b); });
    setInterval(() => {
      $$('.bar', bars).forEach((b) => b.style.height = `${18 + Math.random()*70}%`);
      const throughput = $('#throughput'); if (throughput) throughput.textContent = `${(.7 + Math.random()*.35).toFixed(2)} PFLOPS`;
    }, 1800);
  }

  const signalCanvas = $('#signalCanvas');
  const signalBox = signalCanvas?.closest('.signal-box');
  if (signalCanvas && signalBox) {
    const ctx = signalCanvas.getContext('2d'); let points=[]; let raf=0, w=0, h=0;
    const resize = () => {
      const ratio=Math.min(devicePixelRatio||1,2); w=signalBox.clientWidth; h=signalBox.clientHeight;
      signalCanvas.width=Math.max(1,w*ratio); signalCanvas.height=Math.max(1,h*ratio); ctx.setTransform(ratio,0,0,ratio,0,0);
      const count=isMobile?75:170; points=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.7,vy:(Math.random()-.5)*.7,r:.5+Math.random()*1.7}));
    };
    const draw=()=>{
      ctx.clearRect(0,0,w,h); const cx=w/2,cy=h/2;
      points.forEach((p,i)=>{
        const dx=cx-p.x,dy=cy-p.y,d=Math.hypot(dx,dy)||1; const force=Math.min(.03,.0025+d/Math.max(w,h)*.014);
        p.vx+=dx/d*force; p.vy+=dy/d*force; p.vx*=.995;p.vy*=.995;p.x+=p.vx;p.y+=p.vy;
        if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle='rgba(195,201,255,.72)';ctx.fill();
        if(!isMobile) for(let j=i+1;j<points.length;j++){const q=points[j],dd=Math.hypot(p.x-q.x,p.y-q.y);if(dd<82){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=`rgba(142,155,255,${.08*(1-dd/82)})`;ctx.lineWidth=.5;ctx.stroke()}}
      });
      const entropy=Math.max(25,48+Math.sin(performance.now()/1500)*7+Math.random()*1.8); const coherence=100-entropy+25+Math.sin(performance.now()/2200)*3;
      const ec=$('#entropy'),cc=$('#coherence'),ic=$('#inputCount'); if(ec) ec.textContent=`${entropy.toFixed(1)}%`; if(cc) cc.textContent=`${Math.min(99,coherence).toFixed(1)}%`; if(ic) ic.textContent=(84291+Math.floor(Math.random()*500)).toLocaleString().padStart(6,'0');
      raf=requestAnimationFrame(draw);
    };
    addEventListener('resize',resize);resize(); reducedMotion?null:draw();
    if(reducedMotion){ctx.clearRect(0,0,w,h)}
    addEventListener('pagehide',()=>cancelAnimationFrame(raf));
  }

  const heroCanvas=$('#heroCanvas'); const hero=heroCanvas?.closest('.hero');
  if(heroCanvas && hero){
    const ctx=heroCanvas.getContext('2d'); let w=0,h=0,pts=[],rx=0,ry=0,tx=0,ty=0,raf=0;
    const count=isMobile?500:1100;
    const makePoints=()=>Array.from({length:count},()=>{const u=Math.random()*2-1,a=Math.random()*Math.PI*2,s=Math.sqrt(1-u*u),r=.72+Math.random()*.32;return{x:r*s*Math.cos(a),y:r*u,z:r*s*Math.sin(a),size:.35+Math.random()*1.25}});
    const resize=()=>{const d=Math.min(devicePixelRatio||1,2);w=hero.clientWidth;h=hero.clientHeight;heroCanvas.width=w*d;heroCanvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);if(!pts.length)pts=makePoints()};
    const draw=()=>{
      ctx.clearRect(0,0,w,h); const ox=w*.76+rx*45, oy=h*.47+ry*35, scale=Math.min(w,h)*.43; const cosY=Math.cos(rx*.35),sinY=Math.sin(rx*.35),cosX=Math.cos(ry*.25),sinX=Math.sin(ry*.25);
      const projected=[];
      for(const p of pts){let x=p.x*cosY-p.z*sinY,z=p.x*sinY+p.z*cosY;let y=p.y*cosX-z*sinX;z=p.y*sinX+z*cosX;const depth=(z+1.35)/2.7;projected.push({x:ox+x*scale,y:oy+y*scale,z,alpha:.12+Math.max(0,depth)*.7,size:p.size*(.55+depth*.8)})}
      projected.sort((a,b)=>a.z-b.z);
      for(let i=0;i<projected.length;i++){const p=projected[i];ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fillStyle=`rgba(198,204,255,${p.alpha})`;ctx.fill();if(i%7===0){const near=projected[i+1];if(near&&Math.hypot(p.x-near.x,p.y-near.y)<28){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(near.x,near.y);ctx.strokeStyle=`rgba(145,158,255,${Math.min(p.alpha,.13)})`;ctx.lineWidth=.45;ctx.stroke()}}}
      ctx.save();ctx.translate(ox,oy);ctx.rotate(-.25);ctx.scale(1,.34);ctx.beginPath();ctx.arc(0,0,scale*1.03,0,Math.PI*2);ctx.strokeStyle='rgba(161,171,255,.18)';ctx.lineWidth=1;ctx.stroke();ctx.scale(1.6,1);ctx.rotate(1.15);ctx.beginPath();ctx.arc(0,0,scale*.92,0,Math.PI*2);ctx.strokeStyle='rgba(161,171,255,.10)';ctx.stroke();ctx.restore();
      if(!reducedMotion){rx+=(tx-rx)*.018;ry+=(ty-ry)*.018;raf=requestAnimationFrame(draw)}
    };
    if(finePointer){hero.addEventListener('pointermove',e=>{const r=hero.getBoundingClientRect();tx=(e.clientX-r.left)/r.width-.5;ty=(e.clientY-r.top)/r.height-.5})}
    addEventListener('resize',resize);resize();draw();addEventListener('pagehide',()=>cancelAnimationFrame(raf));
  }

  const cursorDot=$('#cursor-dot'),cursorRing=$('#cursor-ring');
  if(finePointer&&cursorDot&&cursorRing&&!reducedMotion){
    document.body.classList.add('cursor-ready');let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
    addEventListener('pointermove',e=>{mx=e.clientX;my=e.clientY;cursorDot.style.left=`${mx}px`;cursorDot.style.top=`${my}px`;cursorDot.style.opacity=1;cursorRing.style.opacity=1});
    const loop=()=>{rx+=(mx-rx)*.16;ry+=(my-ry)*.16;cursorRing.style.left=`${rx}px`;cursorRing.style.top=`${ry}px`;requestAnimationFrame(loop)};loop();
    $$('[data-magnetic]').forEach(el=>{el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect(),dx=(e.clientX-(r.left+r.width/2))*.15,dy=(e.clientY-(r.top+r.height/2))*.15;el.style.transform=`translate(${dx}px,${dy}px)`});el.addEventListener('pointerleave',()=>el.style.transform='')});
    $$('.interactive').forEach(el=>{el.addEventListener('pointerenter',()=>cursorRing.classList.add('big'));el.addEventListener('pointerleave',()=>cursorRing.classList.remove('big'))});
  }

  if(finePointer&&!reducedMotion){
    $$('.tilt-card').forEach(card=>card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transform=`perspective(900px) rotateX(${y*-4}deg) rotateY(${x*5}deg) translateY(-7px)`;card.style.setProperty('--mx',`${x*100}%`);card.style.setProperty('--my',`${y*100}%`)}));
    $$('.tilt-card').forEach(card=>card.addEventListener('pointerleave',()=>card.style.transform=''));
  }

  const map=$('.architecture-map');
  if(map&&finePointer&&!reducedMotion)map.addEventListener('pointermove',e=>{const r=map.getBoundingClientRect();map.style.setProperty('--px',`${(e.clientX-r.left)/r.width*100}%`);map.style.setProperty('--py',`${(e.clientY-r.top)/r.height*100}%`)});

  const labModal=$('#labModal');
  const modalData={
    ORBIT:{tag:'01 — AUTONOMY',body:'Coordinated intelligence for complex environments. ORBIT explores agents that divide work, negotiate state and adapt their execution path as conditions change.',s1:'04',s2:'ADAPTIVE',s3:'24/7'},
    SYNAPSE:{tag:'02 — REASONING',body:'A memory and reasoning layer built around continuity. SYNAPSE explores how systems can retain context, challenge assumptions and improve through repeated use.',s1:'100M',s2:'LEARNING',s3:'LOOP'},
    VECTOR:{tag:'03 — PREDICTION',body:'A forecasting system for uncertainty. VECTOR maps competing scenarios into clear signals that help people act before the outcome is obvious.',s1:'96',s2:'SCENARIOS',s3:'REAL-TIME'},
    ATLAS:{tag:'04 — INFRASTRUCTURE',body:'Distributed intelligence for the edge. ATLAS explores how models can coordinate across datacenter, device and local context without losing the thread.',s1:'∞',s2:'NODES',s3:'EDGE-FIRST'}
  };
  $$('.lab-card').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('.lab-open'))e.stopPropagation();const key=card.dataset.lab;if(!key||!labModal)return;const d=modalData[key];$('#modalTag').textContent=d.tag;$('#modalTitle').textContent=key;$('#modalBody').textContent=d.body;$('#modalStat1').textContent=d.s1;$('#modalStat2').textContent=d.s2;$('#modalStat3').textContent=d.s3;labModal.classList.add('open');labModal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}));
  $$('[data-close-modal]').forEach(el=>el.addEventListener('click',()=>{labModal?.classList.remove('open');labModal?.setAttribute('aria-hidden','true');document.body.style.overflow=''}));
  addEventListener('keydown',e=>{if(e.key==='Escape'&&labModal?.classList.contains('open')){$('[data-close-modal]')?.click()}});
})();

// Load the authentication client only on the public homepage. Supabase's publishable key is safe for browser use.
if (location.pathname === '/' || location.pathname.endsWith('/index.html')) {
  const load = src => new Promise((resolve, reject) => { const s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); });
  load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2').then(()=>load('auth-config.js')).then(()=>load('auth.js')).catch(()=>{});
}
