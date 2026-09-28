// mars-kit.js: what the three mars games share (patates, survie, colonie) — a pixel canvas laid over the page
// or over a screen, a mouse with clickable buttons drawn each frame, crisp text over the pixels, a tiny synth.
export const W = 400, H = 225;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rng = (seed) => { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = s * 16807 % 2147483647) / 2147483647; };
export const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
export const fmtN = (v) => Math.floor(v).toLocaleString('fr-FR');
// an offscreen canvas kept in memory (not on the gpu, where a reset would wipe it)
export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
  return [c, g];
}

// the mars palette: rust, ochre, dusk
export const P = {
  sky: '#e9a36b', sky2: '#c46a3c', dusk: '#3a1d33', night: '#120a1c',
  sand: '#c1653a', sand2: '#a8522d', sand3: '#d9814d', sand4: '#8e4426', rock: '#6b3524', rock2: '#4c251b', dust: '#e6a878',
  hab: '#e8e2d6', hab2: '#b9b0a2', hab3: '#8a8174', metal: '#9aa4ad', metal2: '#5e6873', dark: '#1d1620', ink: '#120c14',
  green: '#6fcf5a', green2: '#3f8f3a', leaf: '#9be36a', soil: '#4a2e1f', soil2: '#6a4128', water: '#5fb8e8', water2: '#2f78b8',
  panel: '#26384f', panel2: '#3f6a94', cell: '#1e5b9e', gold: '#ffcc4a', red: '#ff4d4d', orange: '#ff9a3c', white: '#fbf6ee', grey: '#a79f98',
  ui: 'rgba(22,14,24,.86)', ui2: 'rgba(60,34,40,.92)', line: '#f3c38b', txt: '#fbeede', dim: '#c9a893', good: '#8ef08a', bad: '#ff6b5b', warn: '#ffc857',
};

// ---------- the canvas: a W×H pixel buffer scaled up, then a crisp layer drawn in the same coordinates ----------
export function createScreen(id, bg = '#140c12') {
  const cv = document.createElement('canvas');
  cv.id = id;
  cv.style.cssText = `position:fixed;inset:0;width:100%;height:100%;z-index:15;pointer-events:auto;display:block;background:${bg};image-rendering:pixelated;cursor:default`;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const [buf, b] = makeCanvas(W, H);
  const view = { s: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 };
  const mouse = { x: -1, y: -1, down: false, right: false, clicks: [], wheel: 0, active: false };
  let rect = null;
  function place() {
    Object.assign(cv.style, rect ? { inset: 'auto', left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } : { inset: '0', left: '', top: '', width: '100%', height: '100%' });
  }
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(rect?.w ?? innerWidth), ch = Math.round(rect?.h ?? innerHeight);
    if (view.cw !== cw || view.ch !== ch || view.dpr !== dpr) {
      view.cw = cw; view.ch = ch; view.dpr = dpr;
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    }
    view.s = Math.min(cw / W, ch / H);
    view.ox = (cw - W * view.s) / 2; view.oy = (ch - H * view.s) / 2;
  }
  // page → buffer coordinates
  const toV = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - view.ox) / view.s, (e.clientY - r.top - view.oy) / view.s]; };
  const L = [
    [cv, 'mousemove', (e) => { [mouse.x, mouse.y] = toV(e); mouse.active = true; }],
    [cv, 'mousedown', (e) => { [mouse.x, mouse.y] = toV(e); mouse.active = true; if (e.button === 0) mouse.down = true; if (e.button === 2) mouse.right = true; mouse.clicks.push({ x: mouse.x, y: mouse.y, b: e.button }); e.preventDefault(); }],
    [window, 'mouseup', (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.right = false; }],
    [cv, 'contextmenu', (e) => e.preventDefault()],
    [cv, 'wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false }],
    [window, 'blur', () => { mouse.down = mouse.right = false; }],
  ];
  for (const [el, ev, f, o] of L) el.addEventListener(ev, f, o);
  place(); fit();
  return {
    cv, g, buf, b, view, mouse,
    setRect(r) { rect = r; place(); },
    fit,
    // the pixels up on the page, then the crisp layer's transform
    blit() {
      const { dpr, s, ox, oy } = view;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(buf, Math.round(ox * dpr), Math.round(oy * dpr), Math.round(W * s * dpr), Math.round(H * s * dpr));
      g.setTransform(dpr * s, 0, 0, dpr * s, ox * dpr, oy * dpr);
      g.imageSmoothingEnabled = true;
    },
    destroy() { for (const [el, ev, f, o] of L) el.removeEventListener(ev, f, o); cv.remove(); },
  };
}

// ---------- text and boxes on the crisp layer ----------
export function txt(g, s, x, y, size = 8, color = P.txt, align = 'left', o = {}) {
  g.font = `${o.w ?? 700} ${size}px ${o.f ?? "'Rubik', sans-serif"}`;
  g.textAlign = align; g.textBaseline = o.base ?? 'middle';
  if (o.sh !== false) { g.fillStyle = o.sh ?? 'rgba(0,0,0,.55)'; g.fillText(s, x + size * .08, y + size * .1); }
  g.fillStyle = color; g.fillText(s, x, y);
}
export const title = (g, s, x, y, size, color = P.gold, align = 'center') => txt(g, s, x, y, size, color, align, { f: "'Titan One', sans-serif", w: 400, sh: '#2a1216' });
export function box(g, x, y, w, h, fill = P.ui, line = null, r = 3) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill();
  if (line) { g.lineWidth = .8; g.strokeStyle = line; g.stroke(); }
}
export function bar(g, x, y, w, h, v, color, back = 'rgba(0,0,0,.45)') {
  box(g, x, y, w, h, back, null, h / 2);
  if (v > 0) box(g, x, y, Math.max(h, w * clamp(v, 0, 1)), h, color, null, h / 2);
}
// wraps a line of text to a width
export function wrap(g, s, w, size) {
  g.font = `600 ${size}px 'Rubik', sans-serif`;
  const out = []; let line = '';
  for (const word of s.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (g.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// ---------- buttons: drawn each frame, clicked on the next update ----------
export function createGui(scr, sfx) {
  let btns = [], prev = [];
  const inside = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  return {
    begin() { prev = btns; btns = []; },
    // handles the clicks of the frame; true when one fell on a button
    clicks(onElse) {
      const m = scr.mouse, cs = m.clicks.splice(0);
      for (const c of cs) {
        const b = [...prev].reverse().find((b) => inside(b, c.x, c.y));
        if (b) { if (b.dis) sfx?.nope(); else { sfx?.click(); b.on?.(c.b); } }
        else onElse?.(c);
      }
    },
    hover() { const m = scr.mouse; return [...prev].reverse().find((b) => inside(b, m.x, m.y)) || null; },
    button(g, x, y, w, h, label, on, o = {}) {
      const m = scr.mouse, hot = !o.dis && inside({ x, y, w, h }, m.x, m.y);
      const fill = o.dis ? 'rgba(50,40,45,.8)' : o.on ? (o.col ?? '#e07a3a') : hot ? '#5a3642' : (o.bg ?? '#3b2530');
      box(g, x, y + (hot && m.down ? .5 : 0), w, h, fill, o.on ? P.gold : hot ? P.line : 'rgba(243,195,139,.35)', o.r ?? 2.5);
      if (label) txt(g, label, x + (o.align === 'left' ? 4 : w / 2), y + h / 2 + .4, o.size ?? 7, o.dis ? '#8a7a78' : o.tc ?? P.txt, o.align ?? 'center');
      btns.push({ x, y, w, h, on, dis: o.dis, tip: o.tip });
      return hot;
    },
    area(x, y, w, h, on, tip) { btns.push({ x, y, w, h, on, tip }); return inside({ x, y, w, h }, scr.mouse.x, scr.mouse.y); },
    tip(g) {
      const b = this.hover();
      if (!b?.tip) return;
      const lines = wrap(g, b.tip, 150, 6.5), w = 160, h = 6 + lines.length * 8;
      const x = clamp(scr.mouse.x + 8, 2, W - w - 2), y = clamp(scr.mouse.y + 10, 2, H - h - 2);
      box(g, x, y, w, h, 'rgba(18,10,16,.95)', P.line);
      lines.forEach((l, i) => txt(g, l, x + 5, y + 7 + i * 8, 6.5, P.txt, 'left', { w: 600, sh: false }));
    },
  };
}

// key presses, with the edge of the frame; a tap shorter than a frame still counts
export function createKeys() {
  let prev = new Set(), now = new Set(), taps = new Set(), hits = new Set();
  const onKey = (e) => { if (!e.repeat) taps.add(e.code); };
  addEventListener('keydown', onKey);
  return {
    frame(keys) { prev = now; now = new Set(keys); hits = taps; taps = new Set(); },
    has: (...c) => c.some((k) => now.has(k)),
    hit: (...c) => c.some((k) => hits.has(k) || (now.has(k) && !prev.has(k))),
    clear() { prev = new Set(); now = new Set(); taps = new Set(); hits = new Set(); },
    destroy() { removeEventListener('keydown', onKey); },
  };
}
export const LEFT = ['KeyA', 'ArrowLeft'], RIGHT = ['KeyD', 'ArrowRight'], UP = ['KeyW', 'ArrowUp'], DOWN = ['KeyS', 'ArrowDown'];

// ---------- the synth: its own context, a quiet master ----------
export function createSfx(vol = .12) {
  let ctx = null, master = null, noise = null, loop = null;
  const last = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
  }
  const ok = (k, gap) => { if (!ctx || ctx.state !== 'running') return false; const t = performance.now(); if (last[k] && t - last[k] < gap) return false; last[k] = t; return true; };
  function tone(f, dur, type = 'sine', v = .5, to = f, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .008); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  function hiss(dur, f, v = .5, to = f, type = 'lowpass', delay = 0, q = 1) {
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
  }
  const notes = (seq, type = 'triangle', v = .3, gap = .12) => seq.forEach((f, i) => tone(f, i === seq.length - 1 ? gap * 4 : gap * 1.3, type, v, f, i * gap));
  const s = {
    init,
    get on() { return !!ctx && ctx.state === 'running'; },
    pause() { s.hum(0); if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    tone: (...a) => ok('t' + a[0], 30) && tone(...a),
    click() { if (ok('click', 40)) tone(1200, .04, 'square', .12, 900); },
    nope() { if (ok('nope', 150)) { tone(180, .12, 'square', .18, 140); tone(150, .14, 'square', .14, 110, .08); } },
    pick() { if (ok('pick', 60)) { tone(660, .06, 'triangle', .3, 990); tone(990, .08, 'triangle', .25, 1320, .05); } },
    drop() { if (ok('drop', 60)) tone(400, .08, 'triangle', .3, 220); },
    step() { if (ok('step', 180)) hiss(.05, 700, .15, 300); },
    dig() { if (ok('dig', 120)) { hiss(.12, 1200, .4, 300); tone(120, .08, 'sine', .3, 70); } },
    water() { if (ok('water', 140)) { hiss(.25, 3000, .25, 1200, 'bandpass', 0, 3); tone(900 + Math.random() * 300, .05, 'sine', .08, 1400); } },
    build() { if (ok('build', 90)) { tone(220, .06, 'square', .2, 160); hiss(.08, 2000, .3, 600); tone(330, .08, 'square', .15, 260, .07); } },
    coin() { if (ok('coin', 70)) { tone(988, .06, 'square', .15, 988); tone(1319, .18, 'square', .15, 1319, .06); } },
    beep(hi) { if (ok('beep' + hi, 200)) tone(hi ? 1320 : 660, hi ? .3 : .12, 'square', .18, hi ? 1320 : 660); },
    alarm() { if (ok('alarm', 900)) { tone(880, .35, 'sawtooth', .16, 440); tone(880, .35, 'sawtooth', .16, 440, .45); } },
    boom(v = 1) { if (ok('boom', 120)) { hiss(.9, 1200, .9 * v, 50); tone(90, .7, 'sine', .8 * v, 30); } },
    hurt() { if (ok('hurt', 200)) tone(260, .18, 'sawtooth', .25, 110); },
    whoosh() { if (ok('whoosh', 150)) hiss(.35, 400, .35, 2400, 'bandpass', 0, 2); },
    hiss() { if (ok('hiss', 250)) hiss(.5, 5000, .25, 2500, 'highpass'); },
    zap() { if (ok('zap', 100)) tone(1600, .12, 'sawtooth', .12, 200); },
    good() { if (ok('good', 300)) notes([660, 880, 1100], 'triangle', .25, .08); },
    win() { if (ok('win', 1500)) notes([523, 659, 784, 1047, 784, 1047], 'triangle', .32, .13); },
    lose() { if (ok('lose', 1500)) notes([392, 370, 349, 262], 'triangle', .3, .2); },
    // a low engine drone, set every frame (0: off)
    hum(v, f = 60) {
      if (!ctx || ctx.state !== 'running') return;
      if (!loop && v > 0) {
        const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o2.type = 'square'; fl.type = 'lowpass'; fl.frequency.value = 380; g.gain.value = 0;
        o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(master); o.start(); o2.start();
        loop = { o, o2, g };
      }
      if (!loop) return;
      const t = ctx.currentTime;
      loop.g.gain.setTargetAtTime(v * .35, t, .08);
      loop.o.frequency.setTargetAtTime(f, t, .1); loop.o2.frequency.setTargetAtTime(f * 1.51, t, .1);
      if (v <= 0) { const l = loop; loop = null; setTimeout(() => { try { l.o.stop(); l.o2.stop(); } catch {} }, 400); }
    },
  };
  return s;
}

// ---------- little pixel sprites ----------
// an astronaut seen from above-front (8×12), in a suit of one's colour
export function astro(b, x, y, color, face = 1, t = 0, o = {}) {
  x = Math.round(x); y = Math.round(y);
  const c = typeof color === 'number' ? hexOf(color) : color, bob = o.walk ? (Math.floor(t * 8) % 2) : 0;
  b.fillStyle = 'rgba(0,0,0,.28)'; b.fillRect(x - 4, y - 1, 9, 2);
  // legs
  b.fillStyle = '#d8d2c8';
  b.fillRect(x - 3, y - 4, 2, 4 - bob); b.fillRect(x + 1, y - 4, 2, 3 + bob);
  // body and pack
  b.fillStyle = '#f2ede4'; b.fillRect(x - 3, y - 9, 7, 6);
  b.fillStyle = c; b.fillRect(x - 3, y - 7, 7, 2);
  b.fillStyle = '#a9a196'; b.fillRect(face > 0 ? x - 4 : x + 3, y - 9, 2, 5);
  // helmet
  b.fillStyle = '#f2ede4'; b.fillRect(x - 2, y - 13, 6, 5);
  b.fillStyle = o.visor ?? '#e3a340'; b.fillRect(face > 0 ? x : x - 1, y - 12, 4, 3);
  b.fillStyle = 'rgba(255,255,255,.6)'; b.fillRect(face > 0 ? x + 1 : x, y - 12, 1, 1);
  if (o.carry) { b.fillStyle = o.carry; b.fillRect(x - 2, y - 10, 5, 4); b.fillStyle = 'rgba(0,0,0,.25)'; b.fillRect(x - 2, y - 7, 5, 1); }
}
