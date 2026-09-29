// voice.js, a walkie-talkie « de proximité »: hold n (R3, the touch button) and talk; the
// diggers around you hear you from where your body is (a panner each for the direction; full to
// 60 m, gone at 100 m: talkieRange), with a radio's colour, static near the edge or through the
// ground, and a « kssht » at each end. The
// walkie shows in your hand and at your avatar's mouth, a ring over the head of whoever speaks.
// Opt-in: the mic is asked for at the first press (or in the settings). The links are
// voice-mesh.js, the radio itself talkie.js; this is the sound, the keys and the hud.
import * as THREE from 'three';
import { createMesh, VOICE } from './voice-mesh.js';
import { tun } from './tunables.js';
import { iceServers } from './rtc.js';
import { panner, place } from './lib/spatial.js';
import { talkieModel, createPtt, squelch, radioChain, normMode, radioLevel } from './talkie.js';

const KEY = 'a-hole-voice';
const MODES = [['off', 'coupé'], ['ptt', 'talkie']];
const TALK = .018;   // rms above which someone is talking

// game: { audio, ui, camera, getNet, getState, getMe() → { pos:[x,y,z], w }, blocked(a, b) → bool, multi }
export function createVoice(game) {
  const { audio, ui, getNet, getState, multi } = game;
  const pref = { mode: 'off', vol: 1, muted: {} };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  pref.mode = normMode(pref.mode);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch {} };
  const $ = (id) => document.getElementById(id);
  let mic = null, micSrc = null, micAn = null, asking = false;
  let bus = null, level = 0, tickT = 0, hudT = 0;
  const talk = new Map();   // id → { el, src, an, lp, g, pan, level, ring, occT, muff }
  const buf = new Uint8Array(256);

  const net = () => getNet();
  // the range is a live value (tunables: talkieRange); the mesh reads these each tick
  const opts = { ...VOICE };
  const reach = () => { opts.range = Math.max(5, +tun.get('talkieRange') || VOICE.range); opts.drop = opts.range * 1.1; return opts.range; };
  const mesh = createMesh({ opts,
    send: (fx) => net()?.sendFx(fx),
    makePc: () => new RTCPeerConnection({ iceServers: iceServers() }),
    stream: () => mic,
    onTrack: plug, onGone: unplug,
  });

  // ---------- the mic: on air only while the button is held ----------
  const ptt = createPtt({ ready: () => !!mic && pref.mode !== 'off', join: () => setMode('ptt'), talk: onAir });
  function micLive() { const on = !!mic && pref.mode !== 'off' && ptt.on; for (const t of mic?.getAudioTracks() || []) t.enabled = on; return on; }
  function onAir(on) {
    micLive();
    audio.init();
    if (audio.ctx && audio.out) squelch(audio.ctx, audio.noiseBuf, audio.out, on);
    net()?.sendFx({ k: 'talkie', on: on ? 1 : 0 });
    fp.led(on);
  }
  async function setMode(m) {
    if (!multi) return false;
    m = normMode(m);
    if (m === 'off') {
      ptt.up();
      pref.mode = 'off'; save();
      mesh.stop();
      for (const t of mic?.getTracks() || []) t.stop();
      mic = null; try { micSrc?.disconnect(); } catch {} micSrc = micAn = null;
      render(); return false;
    }
    if (!mic) {
      if (asking) return false;
      if (!navigator.mediaDevices?.getUserMedia) { ui.toast('micro indisponible ici (il faut https)', true, 3500); return false; }
      asking = true;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (x) {
        asking = false;
        ui.toast(x?.name === 'NotAllowedError' ? 'micro refusé · autorise-le dans le navigateur' : 'pas de micro trouvé', true, 3500);
        pref.mode = 'off'; render(); return false;
      }
      asking = false;
      audio.init();
      const ctx = audio.ctx;
      if (ctx) { micSrc = ctx.createMediaStreamSource(mic); micAn = ctx.createAnalyser(); micAn.fftSize = 256; micSrc.connect(micAn); }
    }
    pref.mode = m; save();
    micLive();
    const n = net();
    if (n?.online && n.id != null && !mesh.live) mesh.start(n.id);
    ui.toast('talkie allumé · maintiens n pour parler', false, 2600);
    render();
    return true;
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
    const radio = radioChain(ctx);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000;
    const g = ctx.createGain(); g.gain.value = 0;
    // a radio: the panner gives the direction only (no rolloff), radioLevel() the distance
    const pan = panner(ctx, { ref: 1, max: 10000, roll: 0 });
    src.connect(an); src.connect(radio.input); radio.output.connect(lp); lp.connect(g); g.connect(pan); pan.connect(out());
    // its static: noise through the speaker's band, louder near the edge or through the ground
    let hiss = null, hs = null;
    if (audio.noiseBuf) {
      hs = ctx.createBufferSource(); hs.buffer = audio.noiseBuf; hs.loop = true;
      const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2200; hf.Q.value = .8;
      hiss = ctx.createGain(); hiss.gain.value = 0;
      hs.connect(hf); hf.connect(hiss); hiss.connect(pan); hs.start();
    }
    talk.set(id, { el, src, an, lp, g, pan, radio, hiss, hs, level: 0, ring: null, occT: Math.random() * .25, muff: false });
    render();
  }
  function unplug(id) {
    const v = talk.get(id);
    if (!v) return;
    talk.delete(id);
    try { v.hs?.stop(); } catch {}
    for (const n of [v.src, v.an, ...v.radio.nodes, v.lp, v.g, v.hiss, v.pan]) try { n?.disconnect(); } catch {}
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

  // ---------- the walkie in my hand: raised to the face while on air ----------
  const fp = (() => {
    let m = null, k = 0;
    const REST = new THREE.Vector3(-.2, -.62, -.38), UP = new THREE.Vector3(-.12, -.2, -.3);
    return {
      led(on) { m?.led(on); },
      update(dt) {
        const want = ptt.on && getState() === 'play';
        k += ((want ? 1 : 0) - k) * Math.min(1, dt * 14);
        if (!m && want) {
          m = talkieModel(net()?.color ?? 0xd9a125);
          m.g.traverse(o => { o.renderOrder = 999; });
          m.g.scale.setScalar(1.6);
          game.camera.add(m.g);
          m.led(true);
        }
        if (!m) return;
        m.g.visible = k > .02;
        m.g.position.lerpVectors(REST, UP, k);
        m.g.rotation.set(.15 - .25 * k, .5, .12);
      },
      get model() { return m; },
    };
  })();

  // someone else keys their walkie: up to the mouth, and the « kssht » where they are (if they're heard)
  const at = new THREE.Vector3();
  function remoteKey(id, on) {
    const p = net()?.peers.get(id);
    if (!p) return;
    p.avatar.rig.talkie(on, p.color);
    const v = talk.get(id); if (v) v.keyed = on;
    const ctx = audio.ctx;
    if (!ctx || !audio.out || pref.muted[p.name] || !mic) return;
    game.camera.getWorldPosition(at);
    const d = at.distanceTo(p.avatar.g.position);
    if (p.w !== game.getMe().w || d > reach()) return;
    const pan = panner(ctx, { ref: 1, max: 10000, roll: 0 });
    place(ctx, pan, p.avatar.g.position.x, p.avatar.g.position.y + 1.6, p.avatar.g.position.z);
    pan.connect(out());
    squelch(ctx, audio.noiseBuf, pan, !!on);
    setTimeout(() => { try { pan.disconnect(); } catch {} }, 600);
  }

  // ---------- each frame ----------
  const ears = new THREE.Vector3(), head = new THREE.Vector3();
  function update(dt) {
    if (!multi) return;
    fp.update(dt);
    if (ptt.held && getState() !== 'play') ptt.up();
    const n = net();
    if (mesh.live && !n?.online) mesh.stop();
    else if (!mesh.live && mic && n?.online && n.id != null && pref.mode !== 'off') mesh.start(n.id);
    tickT -= dt;
    if (tickT <= 0 && n?.online && n.id != null) {
      tickT = 1;
      const me = game.getMe(); reach();
      mesh.tick({ id: n.id, ...me }, [...n.peers].map(([id, p]) => ({ id, w: p.w, pos: p.avatar.g.position.toArray() })));
    }
    if (micAn) level += (rms(micAn) * (micLive() ? 1 : 0) - level) * Math.min(1, dt * 12);
    if (!talk.size) { hudTick(dt); return; }
    const ctx = audio.ctx;
    camera().getWorldPosition(ears);
    const myW = game.getMe().w, range = reach();
    for (const [id, v] of talk) {
      const p = n?.peers.get(id);
      if (!p) continue;
      head.copy(p.avatar.g.position); head.y += 1.6;
      place(ctx, v.pan, head.x, head.y, head.z);
      const d = head.distanceTo(ears);
      const mute = pref.muted[p.name] ? 0 : 1;
      // through the ground or a wall (a look along the line, 4 times a second): a radio only crackles more
      v.occT -= dt;
      if (v.occT <= 0) {
        v.occT = .25;
        const deep = (ears.y < -2) !== (head.y < -2) && Math.abs(ears.y - head.y) > 3;
        v.muff = d > 1.5 && (deep || !!game.blocked?.(ears, head));
      }
      const R = p.w === myW ? radioLevel(d, range, v.muff) : { voice: 0, hiss: 0, lp: 16000 };
      const fade = R.voice, t = ctx.currentTime;
      v.g.gain.setTargetAtTime(fade * mute, t, .1);
      v.lp.frequency.setTargetAtTime(R.lp, t, .08);
      v.hiss?.gain.setTargetAtTime(v.keyed ? R.hiss * mute : 0, t, .05);
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
      `<span>${live ? 'tu parles…' : '<b class="k">n</b> : parler au talkie'}</span>` +
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
    // hold n (a pad's R3 and the touch button send it too): the first press asks for the mic
    document.body.classList.add('vc');
    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyN' || e.repeat || e.target.closest?.('input, textarea') || getState() !== 'play') return;
      ptt.down();
    });
    addEventListener('keyup', (e) => { if (e.code === 'KeyN') ptt.up(); });
    addEventListener('blur', () => ptt.up());
  }

  return {
    update,
    get mode() { return mic ? pref.mode : 'off'; },
    setMode,
    // net hooks: fx { k: 'vc' }, someone new (hears I'm in), someone gone
    onFx(id, fx) { if (fx.k === 'talkie') remoteKey(id, !!fx.on); else mesh.onSignal(id, fx); },
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
    mesh, talk, ptt, fp,
    get onAir() { return micLive(); },
  };
}
