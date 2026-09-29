// voice.js, talking to the diggers around you: your micro, their voices where their bodies are
// (a panner each, louder when close, silent past 25 m, muffled through the ground), a ring over
// the head of whoever speaks. Opt-in: the mic is asked for only when turned on (n, or the
// settings). The links themselves are voice-mesh.js; this is the sound, the keys and the hud.
import * as THREE from 'three';
import { createMesh, VOICE } from './voice-mesh.js';
import { iceServers } from './rtc.js';
import { panner, place } from './lib/spatial.js';

const KEY = 'a-hole-voice';
const MODES = [['off', 'coupé'], ['open', 'ouvert'], ['ptt', 'talkie (n)']];
const TALK = .018;   // rms above which someone is talking

// game: { audio, ui, camera, getNet, getState, getMe() → { pos:[x,y,z], w }, blocked(a, b) → bool, multi }
export function createVoice(game) {
  const { audio, ui, getNet, getState, multi } = game;
  const pref = { mode: 'off', vol: 1, muted: {} };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch {} };
  const $ = (id) => document.getElementById(id);
  let mic = null, micSrc = null, micAn = null, hush = false, held = false, asking = false;
  let bus = null, level = 0, tickT = 0, hudT = 0;
  const talk = new Map();   // id → { el, src, an, lp, g, pan, level, ring, occT, muff }
  const buf = new Uint8Array(256);

  const net = () => getNet();
  const mesh = createMesh({
    send: (fx) => net()?.sendFx(fx),
    makePc: () => new RTCPeerConnection({ iceServers: iceServers() }),
    stream: () => mic,
    onTrack: plug, onGone: unplug,
  });

  // ---------- the mic ----------
  function micLive() { const on = pref.mode === 'open' ? !hush : pref.mode === 'ptt' ? held : false; for (const t of mic?.getAudioTracks() || []) t.enabled = on; return on; }
  async function setMode(m) {
    if (!multi) return;
    if (m === 'off') {
      pref.mode = 'off'; save();
      mesh.stop();
      for (const t of mic?.getTracks() || []) t.stop();
      mic = null; try { micSrc?.disconnect(); } catch {} micSrc = micAn = null;
      render(); return;
    }
    if (!mic) {
      if (asking) return;
      if (!navigator.mediaDevices?.getUserMedia) { ui.toast('micro indisponible ici (il faut https)', true, 3500); return; }
      asking = true;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (x) {
        asking = false;
        ui.toast(x?.name === 'NotAllowedError' ? 'micro refusé · autorise-le dans le navigateur' : 'pas de micro trouvé', true, 3500);
        pref.mode = 'off'; render(); return;
      }
      asking = false;
      audio.init();
      const ctx = audio.ctx;
      if (ctx) { micSrc = ctx.createMediaStreamSource(mic); micAn = ctx.createAnalyser(); micAn.fftSize = 256; micSrc.connect(micAn); }
    }
    pref.mode = m; hush = false; save();
    micLive();
    const n = net();
    if (n?.online && n.id != null && !mesh.live) mesh.start(n.id);
    ui.toast(m === 'ptt' ? 'micro : maintiens n pour parler' : 'micro ouvert · n : sourdine', false, 2600);
    render();
  }

  // ---------- their voices ----------
  function out() {
    const ctx = audio.ctx;
    if (!bus && ctx) { bus = ctx.createGain(); bus.gain.value = pref.vol; bus.connect(ctx.destination); }
    return bus;
  }
  function plug(id, stream) {
    audio.init();
    const ctx = audio.ctx;
    if (!ctx || talk.has(id)) return;
    // chrome plays a remote stream through webaudio only if a media element holds it too
    const el = new Audio(); el.srcObject = stream; el.muted = true; el.play?.().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 256;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = panner(ctx, { ref: 2, max: VOICE.range, roll: 1.2 });
    src.connect(an); src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(out());
    talk.set(id, { el, src, an, lp, g, pan, level: 0, ring: null, occT: Math.random() * .25, muff: false });
    render();
  }
  function unplug(id) {
    const v = talk.get(id);
    if (!v) return;
    talk.delete(id);
    for (const n of [v.src, v.an, v.lp, v.g, v.pan]) try { n.disconnect(); } catch {}
    try { v.el.srcObject = null; } catch {}
    if (v.ring) v.ring.visible = false;
    render();
  }
  const rms = (an) => {
    an.getByteTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; s += d * d; }
    return Math.sqrt(s / buf.length);
  };

  // the ring over a talking head: one texture, a material each (its own opacity)
  let ringTex = null;
  function ringFor(p) {
    if (!ringTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 6;
      g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
      ringTex = new THREE.CanvasTexture(c); ringTex.colorSpace = THREE.SRGBColorSpace;
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: p.color, depthTest: false, transparent: true, opacity: 0 }));
    s.scale.set(.34, .34, 1); s.position.y = 2.55; s.renderOrder = 998;
    p.avatar.g.add(s);
    return s;
  }

  // ---------- each frame ----------
  const ears = new THREE.Vector3(), head = new THREE.Vector3();
  function update(dt) {
    if (!multi) return;
    const n = net();
    if (mesh.live && !n?.online) mesh.stop();
    else if (!mesh.live && mic && n?.online && n.id != null && pref.mode !== 'off') mesh.start(n.id);
    tickT -= dt;
    if (tickT <= 0 && n?.online && n.id != null) {
      tickT = 1;
      const me = game.getMe();
      mesh.tick({ id: n.id, ...me }, [...n.peers].map(([id, p]) => ({ id, w: p.w, pos: p.avatar.g.position.toArray() })));
    }
    if (micAn) level += (rms(micAn) * (micLive() ? 1 : 0) - level) * Math.min(1, dt * 12);
    if (!talk.size) { hudTick(dt); return; }
    const ctx = audio.ctx;
    camera().getWorldPosition(ears);
    const myW = game.getMe().w;
    for (const [id, v] of talk) {
      const p = n?.peers.get(id);
      if (!p) continue;
      head.copy(p.avatar.g.position); head.y += 1.6;
      place(ctx, v.pan, head.x, head.y, head.z);
      const d = head.distanceTo(ears);
      // past 20 m it fades, at 25 m it's gone (the panner alone never quite reaches silence)
      const fade = p.w === myW ? Math.max(0, Math.min(1, (VOICE.range - d) / 5)) : 0;
      const mute = pref.muted[p.name] ? 0 : 1;
      v.g.gain.setTargetAtTime(fade * mute, ctx.currentTime, .1);
      // through the ground: muffled (a look along the line, 4 times a second)
      v.occT -= dt;
      if (v.occT <= 0) {
        v.occT = .25;
        const deep = (ears.y < -2) !== (head.y < -2) && Math.abs(ears.y - head.y) > 3;
        const muff = d > 1.5 && (deep || !!game.blocked?.(ears, head));
        if (muff !== v.muff) { v.muff = muff; v.lp.frequency.setTargetAtTime(muff ? 650 : 16000, ctx.currentTime, .08); }
      }
      v.level += (rms(v.an) * mute - v.level) * Math.min(1, dt * 10);
      const on = v.level > TALK && fade > 0;
      if (on && !v.ring) v.ring = ringFor(p);
      if (v.ring) {
        v.ring.visible = true;
        const k = Math.min(1, v.level * 12);
        v.ring.material.opacity += ((on ? .5 + k * .5 : 0) - v.ring.material.opacity) * Math.min(1, dt * 10);
        v.ring.scale.setScalar(.3 + k * .18);
      }
    }
    hudTick(dt);
  }
  const camera = () => game.camera;

  // ---------- the hud: you talking, who's talking ----------
  let chip = null;
  function hudTick(dt) {
    hudT -= dt;
    if (hudT > 0) return;
    hudT = .12;
    if (!chip) {
      chip = document.createElement('div'); chip.id = 'voice'; chip.className = 'hidden';
      ($('hud') || document.body).appendChild(chip);
    }
    const on = pref.mode !== 'off' && !!mic;
    chip.classList.toggle('hidden', !on || getState() === 'attract');
    if (!on) return;
    const live = micLive();
    const who = [...talk].filter(([, v]) => v.level > TALK && v.ring?.material.opacity > .2).map(([id]) => net()?.peers.get(id)?.name).filter(Boolean);
    const me = live && level > TALK;
    const html = `<i class="${live ? me ? 'on talk' : 'on' : ''}" style="--lv:${Math.min(1, level * 10).toFixed(2)}"></i>` +
      `<span>${!live ? pref.mode === 'ptt' ? 'n : parler' : 'sourdine · n' : me ? 'tu parles' : 'micro ouvert'}</span>` +
      (who.length ? `<b>${who.slice(0, 3).map(esc).join(', ')} ${who.length > 1 ? 'parlent' : 'parle'}</b>` : '') +
      (talk.size ? `<em>${talk.size} à portée</em>` : '');
    if (chip._h !== html) { chip.innerHTML = html; chip._h = html; }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- settings: the mode, their volume, a mute each ----------
  function render() {
    if (!multi) return;
    const seg = $('set-mic');
    if (!seg) return;
    for (const id of ['set-mic-row', 'set-voice-row', 'set-voices']) $(id)?.classList.remove('hidden');
    if (!seg.childElementCount) seg.innerHTML = MODES.map(([m, l]) => `<button type="button" data-mic="${m}">${l}</button>`).join('');
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mic === (mic ? pref.mode : 'off')));
    $('set-voice').value = pref.vol; $('set-voice-v').textContent = Math.round(pref.vol * 100) + ' %';
    const n = net();
    const rows = n ? [...n.peers].filter(([id]) => mesh.voiced.has(id)).map(([id, p]) =>
      `<div class="set-row"><label>${esc(p.name)}</label><span>${talk.has(id) ? 'à portée' : 'loin'}</span><button type="button" class="toggle ${pref.muted[p.name] ? '' : 'on'}" data-mute="${esc(p.name)}">${pref.muted[p.name] ? 'muet' : 'audible'}</button></div>`) : [];
    const box = $('set-voices');
    const html = rows.length ? rows.join('') : (mic ? '<div class="set-row"><label>personne d\'autre au micro</label></div>' : '');
    if (box._h !== html) { box.innerHTML = html; box._h = html; }
  }
  if (multi) {
    // the settings rows: built by index.html, shown only together
    $('set-mic')?.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('[data-mic]'); if (b) setMode(b.dataset.mic); });
    $('set-voice')?.addEventListener('input', (e) => { pref.vol = +e.target.value; if (bus) bus.gain.value = pref.vol; save(); render(); });
    $('set-voices')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-mute]');
      if (!b) return;
      const k = b.dataset.mute;
      if (pref.muted[k]) delete pref.muted[k]; else pref.muted[k] = true;
      save(); render();
    });
    setInterval(render, 1000);
    render();
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyN' || e.repeat || e.target.closest?.('input, textarea') || getState() !== 'play') return;
      if (!mic || pref.mode === 'off') { setMode(pref.mode === 'ptt' ? 'ptt' : 'open'); return; }
      if (pref.mode === 'ptt') { held = true; micLive(); }
      else { hush = !hush; micLive(); ui.toast(hush ? 'micro en sourdine' : 'micro ouvert', false, 1200); }
    });
    addEventListener('keyup', (e) => { if (e.code === 'KeyN' && held) { held = false; micLive(); } });
    addEventListener('blur', () => { if (held) { held = false; micLive(); } });
  }

  return {
    update,
    get mode() { return mic ? pref.mode : 'off'; },
    setMode,
    // net hooks: fx { k: 'vc' }, someone new (hears I'm in), someone gone
    onFx(id, fx) { mesh.onSignal(id, fx); },
    hello() { mesh.hello(); },
    peerLeft(id) { mesh.peerLeft(id); unplug(id); },
    // a mark in the player list: in the voice chat, talking, muted by me
    mark(id, name) {
      if (!multi) return '';
      if (id == null) return mic && pref.mode !== 'off' ? `<span class="vc${micLive() && level > TALK ? ' on' : ''}"></span>` : '';
      if (!mesh.voiced.has(id)) return '';
      const v = talk.get(id);
      return `<span class="vc${pref.muted[name] ? ' mute' : v && v.level > TALK ? ' on' : ''}"></span>`;
    },
    mesh, talk,
  };
}
