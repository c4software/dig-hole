// ui.js, the HUD and the panels.
import { ITEMS, SLOTS } from './economy.js';

const $ = (id) => document.getElementById(id);
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createUI() {
  const el = {
    hud: $('hud'), attract: $('attract'), resume: $('resume'), win: $('win'), load: $('load'),
    depth: $('depth-n'), best: $('best-n'), bestWrap: $('best'), coins: $('coins'), coinN: $('coin-n'),
    bag: $('bag'), bagN: $('bag-n'), bagCap: $('bag-cap'), fuel: $('fuel'), fuelFill: $('fuel-fill'),
    bars: $('bars'), hp: $('hp-fill'), bat: $('bat-fill'), hotbar: $('hotbar'), net: $('net'), detector: $('detector'),
    cross: $('crosshair'), prompt: $('prompt'), toast: $('toast'), plus: $('plusone'), hint: $('hint'),
    layer: $('layer'), shop: $('shop'), shopTitle: document.querySelector('#shop .ns-title'), shopTabs: $('shop-tabs'),
    shopItems: $('shop-items'), shopNote: $('shop-note'), shopClose: $('shop-close'),
    reader: $('reader'), readerTitle: $('reader-title'), readerBody: $('reader-body'), readerNav: $('reader-nav'),
    veil: $('veil'), wash: $('wash'), hurt: $('hurt'), travel: $('travel'), travelTitle: $('travel-title'), travelKm: $('travel-km'),
    faint: $('faint'),
  };
  let toastT = 0, hintT = 0, lastDepthTxt = '', lastCoins = -1, lastBag = '', lastHot = '', lastPanel = '';

  return {
    el, fmt,
    setDepth(d, best) {
      const t = d.toFixed(1);
      if (t !== lastDepthTxt) { el.depth.textContent = t; lastDepthTxt = t; }
      el.best.textContent = best.toFixed(1);
    },
    popBest() { restart(el.bestWrap, 'pop'); },
    setCoins(n, pop) {
      if (n === lastCoins) return;
      el.coinN.textContent = n >= 999999 ? '∞' : fmt(n);
      lastCoins = n;
      if (pop) restart(el.coins, 'pop');
    },
    setBag(n, cap, pop) {
      const k = n + '/' + cap;
      if (k === lastBag) return;
      lastBag = k;
      el.bagN.textContent = n; el.bagCap.textContent = cap;
      el.bag.classList.toggle('full', n >= cap);
      if (pop) restart(el.bag, 'pop');
    },
    setFuel(f, max) {
      el.fuel.classList.toggle('hidden', !max);
      if (max) el.fuelFill.style.width = (f / max * 100) + '%';
    },
    setBars(hp, bat, batMax) {
      el.hp.style.width = Math.max(0, hp) + '%';
      el.bat.style.width = Math.max(0, bat / batMax * 100) + '%';
      el.bars.classList.toggle('low-bat', bat / batMax < .15);
      el.bars.classList.toggle('low-hp', hp < 30);
    },
    setHotbar(items, sel, slots = SLOTS) {
      const k = JSON.stringify(items) + sel + slots.length;
      if (k === lastHot) return;
      lastHot = k;
      el.hotbar.innerHTML = slots.map((id, n) =>
        `<div class="slot${items[id] ? ' has' : ''}${id === sel ? ' sel' : ''}"><span class="k">${n + 1}</span>` +
        `<span class="n">${items[id] || 0}</span>${ITEMS[id].name}</div>`).join('');
    },
    setNet(html, off) {
      el.net.classList.toggle('hidden', !html);
      el.net.classList.toggle('off', !!off);
      if (html) el.net.innerHTML = html;
    },
    setDetector(text) {
      el.detector.classList.toggle('hidden', !text);
      if (text) el.detector.textContent = text;
    },
    hurt() { el.hurt.classList.add('hit'); setTimeout(() => el.hurt.classList.remove('hit'), 60); },
    cross(state) {
      el.cross.classList.toggle('reach', state === 'dig' || state === 'hard' || state === 'use');
      el.cross.classList.toggle('hard', state === 'hard');
      el.cross.classList.toggle('use', state === 'use');
    },
    hit() { restart(el.cross, 'hit'); },
    prompt(html) {
      if (html) el.prompt.innerHTML = html;
      el.prompt.classList.toggle('show', !!html);
    },
    toast(text, warn = false, ms = 1600) {
      el.toast.textContent = text;
      el.toast.classList.toggle('warn', warn);
      el.toast.classList.add('show');
      clearTimeout(toastT);
      toastT = setTimeout(() => el.toast.classList.remove('show'), ms);
    },
    plus(text) { el.plus.textContent = text; restart(el.plus, 'pop'); },
    wash() { restart(el.wash, 'show'); },
    hint(text, ms = 4000) {
      el.hint.textContent = text;
      el.hint.classList.add('show');
      clearTimeout(hintT);
      if (ms) hintT = setTimeout(() => el.hint.classList.remove('show'), ms);
    },
    layer(name, sub) {
      el.layer.innerHTML = `<span class="l-name">${esc(name)}</span><span class="l-sub">${esc(sub)}</span>`;
      restart(el.layer, 'show');
    },
    veil(o) { el.veil.style.opacity = o; },

    // one panel for every counter: rows are {id, kind, name, lvl, sub, price, owned, poor, lock, done, static}
    panel({ title, quip, tabs, tab, rows, note, close = 'fermer' }) {
      // the rows slide in when the counter opens or the tab changes, not after each purchase
      const key = title + '|' + tab;
      el.shop.classList.toggle('fresh', el.shop.classList.contains('hidden') || key !== lastPanel);
      lastPanel = key;
      el.shopTitle.textContent = quip || title;
      el.shopTitle.classList.toggle('quip', !!quip);
      if (quip) restart(el.shopTitle, 'quip');
      el.shopTabs.innerHTML = (tabs || []).map(t => `<button data-tab="${t.id}" class="${t.id === tab ? 'on' : ''}">${esc(t.name)}<small>${esc(t.sub || '')}</small></button>`).join('');
      el.shopItems.innerHTML = rows.map((r, i) => {
        const cls = ['ns-item', r.owned && 'owned', r.poor && 'poor', r.lock && 'locked', r.done && 'done', r.static && 'static'].filter(Boolean).join(' ');
        const right = r.lock ? `<span class="s-lock">${esc(r.lock)}</span>`
          : r.price != null ? `<span class="s-price">${fmt(r.price)}</span>` : '';
        return `<button class="${cls}" data-id="${r.id}" style="--i:${i}">` +
          (r.kind ? `<span class="s-kind">${esc(r.kind)}</span>` : '') +
          `<span class="s-mid"><span><span class="s-name">${esc(r.name)}</span> ${r.lvl ? `<span class="s-lvl">${esc(r.lvl)}</span>` : ''}</span>` +
          (r.sub ? `<span class="s-sub">${esc(r.sub)}</span>` : '') + `</span>` +
          right + `<span class="s-owned">${esc(r.ownedText || 'au max')}</span></button>`;
      }).join('');
      el.shopNote.textContent = note || '';
      el.shopClose.textContent = close;
      el.shop.classList.remove('hidden');
    },
    flashItem(id, cls) {
      const b = el.shopItems.querySelector(`[data-id="${id}"]`);
      if (b) restart(b, cls);
    },

    read(title, body, nav, notes = false) {
      el.readerTitle.textContent = title;
      el.readerBody.textContent = body;
      el.readerBody.classList.toggle('hidden', notes);
      $('notes').classList.toggle('hidden', !notes);
      el.readerNav.innerHTML = (nav || []).map(n => `<button data-n="${n.key || n.n}" class="${n.on ? 'on' : ''}">${esc(n.n)}</button>`).join('');
      el.reader.classList.remove('hidden');
    },
    notes(list) {
      const box = $('notes-list');
      if (!list) { box.innerHTML = '<div class="note-empty">on feuillette…</div>'; return; }
      if (!list.length) { box.innerHTML = '<div class="note-empty">personne n\'a encore rien écrit. à toi.</div>'; return; }
      box.innerHTML = list.map(n => `<div class="note"><p>« ${esc(n.text)} »</p><span>${esc(n.name)} · ${new Date(n.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></div>`).join('');
    },

    async travel(title, km, ms = 2600) {
      el.travelTitle.textContent = title;
      el.travel.classList.remove('hidden');
      const t0 = performance.now();
      await new Promise(done => {
        const tick = () => {
          const k = Math.min(1, (performance.now() - t0) / ms);
          el.travelKm.textContent = fmt(km * (1 - Math.pow(1 - k, 3))) + ' km';
          if (k < 1) requestAnimationFrame(tick); else done();
        };
        tick();
      });
    },
    endTravel() { el.travel.classList.add('hidden'); },
  };
}
