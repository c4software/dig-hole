// net.js, digging together: a WebSocket to the room, other diggers drawn as little
// figures with their name over their head, and every change to the ground shared.
import * as THREE from 'three';
import { tun } from './tunables.js';

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

export function avatar(name, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.26, .8, 4, 10), mat);
  body.position.y = .75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 10), new THREE.MeshLambertMaterial({ color: 0xf0c8a0 }));
  head.position.y = 1.5;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.21, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  cap.position.y = 1.53;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.2, .03, .16), mat);
  visor.position.set(0, 1.55, .22);
  const eyes = new THREE.Group();
  for (const x of [-.07, .07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.025), new THREE.MeshBasicMaterial({ color: 0x111111 })); e.position.set(x, 1.5, .18); eyes.add(e); }
  // a shovel over the shoulder
  const tool = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1, 6), new THREE.MeshLambertMaterial({ color: 0x8a5f38 }));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(.22, .28, .03), new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: .6, roughness: .4 }));
  blade.position.y = -.6;
  tool.add(stick, blade);
  tool.position.set(.32, 1.0, .1); tool.rotation.set(.3, 0, .4);
  const tag = nameTag(name, color);
  tag.position.y = 2.05;
  g.add(body, head, cap, visor, eyes, tool, tag);
  return { g, tool };
}

export function createNet({ scene, onOp, onJoin, onLeave, onWelcome, onStatus, onFx, onSuperReset, onSuperDenied, onAdmin }) {
  let ws = null, id = null, room = null, name = '', color = COLORS[0], hostId = null;
  const asks = new Map();   // rid → resolve: questions to the room (the guest book, when a tab hosts)
  let rid = 0;
  const peers = new Map();   // id → { name, color, avatar, from, to, t, w, dig }
  let sendT = 0;

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
      } else if (m.t === 'join') { addPeer(m); onJoin?.(m.name); }
      else if (m.t === 'leave') {
        const p = peers.get(m.id);
        if (p) { scene.remove(p.avatar.g); peers.delete(m.id); onLeave?.(p.name, m.id); }
      } else if (m.t === 'state') {
        const p = peers.get(m.id);
        if (!p) return;
        p.from.copy(p.avatar.g.position);
        p.to.fromArray(m.p); p.yaw = m.yaw; p.w = m.w; p.dig = m.dig; p.g = m.g || null; p.t = 0;
      } else if (m.t === 'op') onOp?.(m.op);
      else if (m.t === 'superreset') onSuperReset?.(m);
      else if (m.t === 'superreset-denied') onSuperDenied?.();
      else if (m.t === 'fx') { const p = peers.get(m.id); if (p) onFx?.(m.id, p, m.fx); }
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
    peers.set(p.id, { name: p.name, color: c, avatar: a, from: new THREE.Vector3(), to: new THREE.Vector3(), yaw: 0, w: 'home', t: 1, dig: false, swing: 0, g: p.g || null });
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
      for (const p of peers.values()) {
        p.t = Math.min(1, p.t + dt / 0.1);
        p.avatar.g.position.lerpVectors(p.from, p.to, p.t);
        p.avatar.g.rotation.y = p.yaw + Math.PI;
        p.avatar.g.visible = p.w === me.w;
        p.swing = p.dig ? p.swing + dt * 9 : 0;
        p.avatar.tool.rotation.x = .3 + Math.max(0, Math.sin(p.swing)) * 1.1;
      }
    },
    list() { return [{ name, color, me: true }, ...[...peers.values()].map(p => ({ name: p.name, color: p.color }))]; },
  };
}
