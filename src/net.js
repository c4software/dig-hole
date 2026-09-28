// net.js, digging together: a WebSocket to the room, other diggers drawn as little
// figures with their name over their head, and every change to the ground shared.
import * as THREE from 'three';
import { tun } from './tunables.js';
import { createRig } from './rig.js';
import { clean, DEFAULT, TEES, HAIR_STYLES } from './outfits.js';

const COLORS = [0xd9a125, 0x39c07a, 0x4a8fe0, 0xe4183a, 0xb05ae0, 0xf08a2a, 0x2ac0c0, 0xf2a7c3];

function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(11,13,18,.6)';
  g.beginPath(); g.roundRect(8, 10, 240, 44, 22); g.fill();
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.font = 'italic 30px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.2, .3, 1);
  s.renderOrder = 998;
  return s;
}

// someone else in the garden: a body in their outfit (the default one, in their colour, until
// they say what they wear), their name over their head, a shovel in the hand
export function avatar(name, color, outfit = null) {
  const g = new THREE.Group();
  const def = { ...DEFAULT, tee: TEES.reduce((b, t, i) => colorGap(t[1], color) < colorGap(TEES[b][1], color) ? i : b, 0), hair: HAIR_STYLES[(name.length * 7) % 6][0], hairC: (name.charCodeAt(0) || 0) % 5 };
  const rig = createRig(outfit || def, { lod: true });
  rig.hold('shovel');
  const tag = nameTag(name, color);
  tag.position.y = 2.2;
  g.add(rig.root, tag);
  // `tool` stays for the arena games that hide it
  const tool = { set visible(v) { rig.hold(v ? 'shovel' : null); }, get visible() { return !!rig.tool; }, rotation: new THREE.Euler() };
  return { g, tool, rig, def, tag };
}
const colorGap = (a, b) => Math.abs((a >> 16) - (b >> 16)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255));

export function createNet({ scene, onOp, onJoin, onLeave, onWelcome, onStatus, onFx, onSuperReset, onSuperDenied, onAdmin }) {
  let ws = null, id = null, room = null, name = '', color = COLORS[0], hostId = null;
  const asks = new Map();   // rid → resolve: questions to the room (the guest book, when a tab hosts)
  let rid = 0;
  const peers = new Map();   // id → { name, color, avatar, from, to, t, w, dig }
  let sendT = 0;
  let myLook = null, myHands = { l: -1, tool: 'shovel' };
  const send = (fx) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'fx', fx })); };
  const sendHands = () => send({ k: 'hands', l: myHands.l, tool: myHands.tool });
  const _eye = new THREE.Vector3();

  // socket: a WebSocket look-alike to use instead (a host's tab, a webrtc link: p2p.js)
  function connect(roomName, nick, socket) {
    room = roomName; name = nick;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = socket ? socket() : new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', room, name })); onStatus?.('on'); };
    ws.onclose = () => { onStatus?.('off'); for (const p of peers.values()) scene.remove(p.avatar.g); peers.clear(); };
    ws.onerror = () => onStatus?.('off');
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        id = m.id; color = COLORS[m.color % COLORS.length]; hostId = m.host ?? null;
        if (m.tun) tun.load(m.tun);
        for (const p of m.players) addPeer(p);
        onWelcome?.(m);
        if (myLook) send({ k: 'look', o: myLook });
      } else if (m.t === 'join') { addPeer(m); onJoin?.(m.name); if (myLook) send({ k: 'look', o: myLook }); sendHands(); }
      else if (m.t === 'leave') {
        const p = peers.get(m.id);
        if (p) { scene.remove(p.avatar.g); peers.delete(m.id); onLeave?.(p.name, m.id); }
      } else if (m.t === 'state') {
        const p = peers.get(m.id);
        if (!p) return;
        p.from.copy(p.avatar.g.position);
        p.to.fromArray(m.p);
        // how fast they go, from one state to the next (a jump in position is a teleport)
        const dx = p.to.x - p.from.x, dz = p.to.z - p.from.z, d = Math.hypot(dx, dz);
        p.spd = d > 4 || !p.seen ? 0 : d / .1; p.vy = !p.seen ? 0 : (p.to.y - p.from.y) / .1; p.seen = true; p.yaw = m.yaw; p.w = m.w; p.dig = m.dig; p.g = m.g || null; p.t = 0;
      } else if (m.t === 'op') onOp?.(m.op);
      else if (m.t === 'superreset') onSuperReset?.(m);
      else if (m.t === 'superreset-denied') onSuperDenied?.();
      else if (m.t === 'fx') {
        const p = peers.get(m.id);
        if (!p) return;
        // what a body wears and does: handled here, where the bodies are
        const fx = m.fx;
        if (fx.k === 'look') { p.look = clean(fx.o); p.planet = null; }
        else if (fx.k === 'emote') { if (fx.e) p.avatar.rig.play(String(fx.e)); else p.avatar.rig.stop(); }
        else if (fx.k === 'hands') { p.hands = fx.l | 0; p.tool = String(fx.tool || 'shovel'); p.avatar.rig.hold(p.tool === 'hands' ? null : p.tool); }
        else onFx?.(m.id, p, fx);
      }
      // from a host's tab: its live values, its word (a raid, a kick), the guest book
      else if (m.t === 'tun') tun.load(m.v);
      else if (m.t === 'admin') onAdmin?.(m);
      else if (m.t === 'kicked') { onStatus?.('kicked', m.why); ws.close(); }
      else if (m.t === 'notes') { asks.get(m.rid)?.(m); asks.delete(m.rid); }
    };
  }

  function addPeer(p) {
    if (peers.has(p.id)) return;
    const c = COLORS[p.color % COLORS.length];
    const a = avatar(p.name || '?', c);
    scene.add(a.g);
    peers.set(p.id, { name: p.name, color: c, avatar: a, from: new THREE.Vector3(), to: new THREE.Vector3(), yaw: 0, w: 'home', t: 1, dig: false, swing: 0, g: p.g || null, look: null, planet: null, spd: 0, vy: 0, hands: -1, tool: 'shovel', seen: false });
  }

  const open = () => ws && ws.readyState === 1;

  return {
    connect,
    get online() { return open(); },
    get id() { return id; },
    get color() { return color; },
    get room() { return room; },
    get hostId() { return hostId; },
    title: null,
    // a question to the room, answered by a message with the same rid
    ask(msg, ms = 5000) {
      if (!open()) return Promise.reject(new Error('hors ligne'));
      const r = ++rid;
      ws.send(JSON.stringify({ ...msg, rid: r }));
      return new Promise((res, rej) => { asks.set(r, res); setTimeout(() => { if (asks.delete(r)) rej(new Error('pas de réponse')); }, ms); });
    },
    peers,
    sendOp(op) { if (open()) ws.send(JSON.stringify({ t: 'op', op })); },
    // passing effects (a laser shot, a paint blob): relayed to the others, never saved
    sendFx(fx) { if (open()) ws.send(JSON.stringify({ t: 'fx', fx })); },
    // the password goes to the server, which checks it and tells everyone
    superReset(pw) { if (open()) ws.send(JSON.stringify({ t: 'superreset', pw })); return open(); },
    update(dt, me) {
      sendT -= dt;
      if (open() && sendT <= 0) {
        sendT = 0.1;
        ws.send(JSON.stringify({ t: 'state', p: me.pos.toArray().map(v => +v.toFixed(3)), yaw: +me.yaw.toFixed(3), w: me.w, dig: me.dig, g: me.g || null }));
      }
      if (me.eye) _eye.copy(me.eye);
      for (const p of peers.values()) {
        p.t = Math.min(1, p.t + dt / 0.1);
        const a = p.avatar;
        a.g.position.lerpVectors(p.from, p.to, p.t);
        a.g.rotation.y = p.yaw + Math.PI;
        a.g.visible = p.w === me.w;
        if (!a.g.visible || a.g.scale.x < .01) continue;
        // up there, everyone wears a glass bubble: dressed again when the world changes
        const planet = p.w === 'moon' || p.w === 'mars';
        if (p.planet !== planet) { p.planet = planet; a.rig.dress(p.look || a.def, { planet }); }
        const st = a.rig.st;
        st.speed += (Math.min(8, p.spd) - st.speed) * Math.min(1, dt * 8);
        st.vy = p.vy; st.ground = planet || Math.abs(p.vy) < 1.2;
        st.dig = !!p.dig && p.tool !== 'hands'; st.hands = p.tool === 'hands' ? p.hands : -1;
        // a moving body stops its emote (sitting down doesn't survive a walk)
        if (a.rig.emote && p.spd > 1.2) a.rig.stop();
        a.rig.update(dt, me.eye ? _eye : null);
      }
    },
    // what I wear, what my hands do: said once, then again to whoever arrives
    setLook(o) { myLook = o; send({ k: 'look', o }); },
    emote(e) { send({ k: 'emote', e }); },
    setHands(l, tool) { if (myHands.l === l && myHands.tool === tool) return; myHands = { l, tool }; sendHands(); },
    list() { return [{ name, color, me: true }, ...[...peers.values()].map(p => ({ name: p.name, color: p.color }))]; },
  };
}
