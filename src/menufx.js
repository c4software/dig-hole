// menufx.js, the menus' feel: dirt splats, buttons flooding from the pointer, a springy focus ring, arrows + enter.
const TAU = Math.PI * 2;
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// a lump of thrown earth: a wobbly disc, a few fat arms, droplets around
export function splat(seed = 1, { arms = 8, drops = 3, cls = 'f-a' } = {}) {
  const R = rng(seed * 7919 + 13);
  const n = 64, base = 58, pts = [];
  const bumps = Array.from({ length: arms }, () => ({ a: R() * TAU, w: .16 + R() * .16, h: 8 + R() * 18 }));
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU;
    let r = base + Math.sin(a * 3 + seed) * 3 + Math.sin(a * 5 + seed * 2) * 2;
    for (const b of bumps) { const d = Math.atan2(Math.sin(a - b.a), Math.cos(a - b.a)); r += b.h * Math.exp(-(d * d) / (b.w * b.w * .5)); }
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  // smooth closed curve through the points
  let d = '';
  for (let k = 0; k < n; k++) {
    const p0 = pts[(k - 1 + n) % n], p1 = pts[k], p2 = pts[(k + 1) % n], p3 = pts[(k + 2) % n];
    if (!k) d += `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  let dots = '';
  for (let k = 0; k < drops; k++) {
    const a = R() * TAU, r = 92 + R() * 22, s = 4 + R() * 7;
    dots += `<circle cx="${(Math.cos(a) * r).toFixed(1)}" cy="${(Math.sin(a) * r).toFixed(1)}" r="${s.toFixed(1)}"/>`;
  }
  return `<svg viewBox="-125 -125 250 250" aria-hidden="true"><g class="${cls}" stroke="var(--k)" stroke-width="7" paint-order="stroke"><path d="${d}Z"/>${dots}</g>` +
    `<path d="${d}Z" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="5" stroke-dasharray="40 400" transform="scale(.82) rotate(-30)"/></svg>`;
}

// clods of dirt thrown out of a click
function burst(x, y, big = 1) {
  if (reduced()) return;
  const w = document.createElement('div');
  w.className = 'burst';
  w.style.left = x + 'px'; w.style.top = y + 'px';
  const R = rng((Math.random() * 1e6) | 0);
  w.innerHTML = `<i class="burst__ring"></i>` + Array.from({ length: 11 }, (_, k) => {
    const a = k / 11 * TAU + (R() - .5) * .8, d = (40 + R() * 45) * big;
    const c = R() < .55 ? 'var(--a)' : R() < .5 ? '#7a4a24' : '#b77a3d';
    return `<i class="burst__drop" style="--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--r:${(6 + R() * 9).toFixed(1)}px;--t:${(.4 + R() * .3).toFixed(2)}s;background:${c}"></i>`;
  }).join('');
  document.body.appendChild(w);
  setTimeout(() => w.remove(), 900);
}

const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

export function initMenus({ hover = () => {}, press = () => {} } = {}) {
  document.querySelectorAll('[data-splat]').forEach(el => {
    el.innerHTML = splat(+el.dataset.splat, { arms: +(el.dataset.arms || 8), drops: +(el.dataset.drops || 3), cls: el.dataset.cls === 'danger' ? 'f-danger' : 'f-a' });
  });

  const SEL = '.btn, .ns-item, #shop-tabs button, .chipbtn';
  const blob = (el) => { if (el.matches('.btn, .ns-item') && !el.querySelector(':scope > .btn__blob')) el.insertAdjacentHTML('afterbegin', '<span class="btn__blob"></span>'); };
  document.querySelectorAll('.btn').forEach(blob);

  // ---- the ring that springs from one item to the next
  const ring = document.createElement('div');
  ring.id = 'fx-cursor';
  ring.innerHTML = '<i></i>';
  document.body.appendChild(ring);
  const cur = { x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, vw: 0, vh: 0, on: false, snap: true };
  let focus = null, raf = 0;

  function setFocus(el, { snap = false, sound = true } = {}) {
    if (el === focus) return;
    focus?.classList.remove('is-focus');
    focus = el;
    if (!el) return;
    blob(el);
    el.classList.add('is-focus');
    if (snap || !cur.on) cur.snap = true;
    ring.style.borderRadius = getComputedStyle(el).borderTopLeftRadius;
    if (sound) hover();
    const desc = el.dataset.desc, out = el.closest('.screen')?.querySelector('.main-desc span') || document.getElementById('main-desc-text');
    if (desc && out && out.textContent !== desc) { out.textContent = desc; restart(out.parentNode, 'is-swap'); }
    if (!raf) raf = requestAnimationFrame(step);
  }
  let last = performance.now();
  function step(now) {
    raf = 0;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const vis = focus && focus.isConnected && focus.offsetParent !== null && !focus.closest('.hidden');
    if (!vis) { ring.classList.remove('is-on'); cur.on = false; if (focus && !focus.isConnected) focus = null; return; }
    const r = focus.getBoundingClientRect();
    const pad = 5, t = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    if (cur.snap || reduced()) { Object.assign(cur, t, { vx: 0, vy: 0, vw: 0, vh: 0, snap: false }); }
    else for (const k of ['x', 'y', 'w', 'h']) {
      const v = 'v' + k;
      cur[v] += ((t[k] - cur[k]) * 380 - cur[v] * 24) * dt;
      cur[k] += cur[v] * dt;
    }
    cur.on = true;
    ring.classList.add('is-on');
    ring.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px)`;
    ring.style.width = cur.w.toFixed(1) + 'px'; ring.style.height = cur.h.toFixed(1) + 'px';
    raf = requestAnimationFrame(step);
  }

  // ---- the pointer: where the colour floods in from, and the press squash
  let lastEl = null;
  const track = (el, e) => {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  };
  addEventListener('pointerover', (e) => {
    const el = e.target.closest?.(SEL);
    if (!el || el === lastEl) return;
    lastEl = el;
    track(el, e);
    if (el.matches('.btn, .ns-item')) setFocus(el);
  }, { passive: true });
  addEventListener('pointerout', (e) => {
    const el = e.target.closest?.(SEL);
    if (el && !el.contains(e.relatedTarget)) { if (el === lastEl) lastEl = null; el.classList.remove('is-down'); }
  }, { passive: true });
  addEventListener('pointermove', (e) => { const el = e.target.closest?.('.btn, .ns-item'); if (el && !el.classList.contains('is-focus')) track(el, e); }, { passive: true });
  addEventListener('pointerdown', (e) => { const el = e.target.closest?.(SEL); if (el && e.button === 0) el.classList.add('is-down'); }, { passive: true });
  addEventListener('pointerup', () => document.querySelectorAll('.is-down').forEach(el => el.classList.remove('is-down')), { passive: true });
  addEventListener('click', (e) => {
    const el = e.target.closest?.(SEL);
    if (!el) return;
    restart(el, 'is-press');
    press();
    const r = el.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
    if (el.matches('.btn--primary, .btn--xl, .m-opt, .btn--modal')) burst(x, y, el.matches('.btn--xl') ? 1.3 : 1);
  }, true);

  // ---- the keyboard: arrows walk the items of the screen on top, enter presses
  const SCREENS = ['#super-pw', '#win', '#resume', '#gamemenu', '#shop', '#attract'];
  const top = () => SCREENS.map(s => document.querySelector(s)).find(el => el && !el.classList.contains('hidden') && !el.closest('.hidden'));
  const items = (scr) => [...scr.querySelectorAll('.btn, .ns-item')].filter(el => el.offsetParent !== null && !el.disabled);
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const scr = top();
    if (!scr) return;
    const list = items(scr);
    if (!list.length) return;
    const up = e.code === 'ArrowUp' || (e.code === 'ArrowLeft' && scr.id === 'win'), down = e.code === 'ArrowDown' || (e.code === 'ArrowRight' && scr.id === 'win');
    if (up || down) {
      e.preventDefault();
      let i = list.indexOf(focus);
      if (i < 0) i = up ? list.length : -1;
      const j = i + (down ? 1 : -1);
      if (j < 0 || j >= list.length) { if (focus) restart(focus, 'is-bump'); return; }
      const next = list[j];
      next.style.setProperty('--mx', '50%'); next.style.setProperty('--my', down ? '0%' : '100%');
      setFocus(next);
      next.scrollIntoView?.({ block: 'nearest' });
    } else if (e.code === 'Enter' && !e.repeat) {
      const el = list.includes(focus) ? focus : list[0];
      e.preventDefault();
      el.click();
    }
  });

  // ---- a screen appearing: focus its first action, pull the sliders and switches up to date
  const firstOf = { attract: '#play', resume: '#resume-go', win: '#win .btn:not(.hidden)', 'super-pw': '.sp-go', gamemenu: '#gm-play' };
  const syncRanges = () => document.querySelectorAll('input[type=range]').forEach(r => r.style.setProperty('--t', ((r.value - r.min) / (r.max - r.min)).toFixed(3)));
  const syncSeg = (seg) => {
    let hl = seg.querySelector(':scope > .seg__hl');
    if (!hl) { hl = document.createElement('i'); hl.className = 'seg__hl'; seg.prepend(hl); }
    const opts = [...seg.querySelectorAll('button')], i = opts.findIndex(b => b.classList.contains('on'));
    const was = seg.style.getPropertyValue('--idx');
    seg.style.setProperty('--n', opts.length); seg.style.setProperty('--idx', Math.max(0, i));
    if (was !== '' && was !== String(Math.max(0, i))) restart(seg, 'is-change');
  };
  addEventListener('input', (e) => { if (e.target.type === 'range') syncRanges(); });
  document.querySelectorAll('.seg').forEach(seg => {
    syncSeg(seg);
    new MutationObserver(() => syncSeg(seg)).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  });
  syncRanges();
  const onShow = (id) => {
    syncRanges();
    const el = firstOf[id] && document.querySelector('#' + id).querySelector(firstOf[id].replace('#' + id + ' ', ''));
    if (el) { el.style.setProperty('--mx', '0%'); el.style.setProperty('--my', '50%'); focus = null; setFocus(el, { snap: true, sound: false }); }
  };
  for (const id of Object.keys(firstOf)) {
    const el = document.getElementById(id);
    if (!el) continue;
    let shown = !el.classList.contains('hidden');
    new MutationObserver(() => { const s = !el.classList.contains('hidden'); if (s && !shown) onShow(id); shown = s; }).observe(el, { attributes: true, attributeFilter: ['class'] });
    if (shown) requestAnimationFrame(() => onShow(id));
  }
  return { setFocus, burst };
}
