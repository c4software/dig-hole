// looks.js, you as others see you: your outfit (bought in the clothes shops, changed in the
// wardrobe at home), your emotes (hold g: a wheel), your empty hands (h, or the last tool:
// hold the left / right button: that hand goes up, let go: it comes down). Your own body is drawn when the camera
// steps back (an emote, a fitting) and in the wardrobe's mirror; the others get it by the net.
import * as THREE from 'three';
import { createRig, EMOTES, EMOTE_ORDER, EYE } from './rig.js';
import { ITEMS, SLOTS, SHOPS, SKINS, HAIR_COLORS, HAIR_STYLES, TEES, DEFAULT, clean, shopItems } from './outfits.js';
import { PEOPLE, SPOTS } from './boutiques.js';
import { toolMat } from './tool.js';

const SLOT_NAME = Object.fromEntries(SLOTS.map(s => [s.id, s.name]));
const WHERE = { japon: 'au japon', europe: 'sur la place du village', lune: 'sur la lune', mars: 'sur mars' };
const WTABS = [...SLOTS.map(s => ({ id: s.id, name: s.name })), { id: 'moi', name: 'moi', sub: 'peau, coiffure' }, { id: 'couleurs', name: 'couleurs', sub: 'cheveux, t-shirt' }];
const HANDS_TOAST = 'mains vides · maintiens clic gauche : main gauche en l\'air · clic droit : main droite · relâche : elle redescend · h : reprendre l\'outil';

// game: { scene, camera, eco, ui, audio, player, moonP, house, world, T, getNet, getState, getPanel, getHere, onPlanet, openPanel, renderPanel, save, armed, digging }
export function createLooks(game) {
  const { scene, camera, eco, ui, audio, player, moonP, house } = game;
  const W = eco.s.wear;
  let fit = W.fit = clean(W.fit || DEFAULT);
  const owns = (id) => ITEMS[id]?.free || W.own.includes(id);

  // ---- the bodies: the one the camera steps back to see, the one in the mirror ----
  const me = createRig(fit);
  me.root.visible = false;
  scene.add(me.root);
  const mirror = house.wardrobe?.mirror;
  const meMirror = createRig(fit, { material: new THREE.MeshLambertMaterial({ vertexColors: true }), shadow: false });
  mirror?.scene.add(meMirror.root);

  // ---- the empty hands, in front of the eye ----
  const handsRoot = new THREE.Group();
  handsRoot.visible = false;
  camera.add(handsRoot);
  let handMats = [];
  const hands = [];
  function buildHands() {
    for (const h of hands) h.removeFromParent();
    hands.length = 0;
    const L = me.look, sleeve = L.top.kind === 'suit' ? L.top.c : (L.top.c ?? 0x3f7fd8), long = !['tee'].includes(L.top.kind);
    const lift = (c) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), .18).getHex();
    const skinM = toolMat(lift(L.top.kind === 'suit' ? L.top.c3 : L.skin), 'soft'), slM = toolMat(lift(long ? sleeve : L.skin), 'soft'), cuffM = toolMat(sleeve, 'soft');
    handMats = [skinM, slM, cuffM];
    for (const s of [1, -1]) {
      const h = new THREE.Group();
      const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.renderOrder = 999; h.add(o); return o; };
      add(new THREE.CylinderGeometry(.042, .056, 1.1, 16), slM, 0, -.57, 0);   // long: its end is always below the screen
      if (long) add(new THREE.TorusGeometry(.043, .01, 6, 18), cuffM, 0, -.03, 0, Math.PI / 2);
      const palm = add(new THREE.SphereGeometry(.05, 16, 12), skinM, 0, .045, 0); palm.scale.set(1, 1.15, .42);
      for (let k = 0; k < 4; k++) add(new THREE.CapsuleGeometry(.0125, k === 3 ? .04 : .055, 3, 8), skinM, (-.03 + k * .02) * s, .12 - (k === 3 ? .012 : 0) - Math.abs(k - 1.5) * .004, 0, 0, (k - 1.5) * -.06 * s);
      add(new THREE.CapsuleGeometry(.014, .04, 3, 8), skinM, .052 * s, .035, .004, 0, -.75 * s);
      h.scale.setScalar(1.1);
      handsRoot.add(h); hands.push(h);
    }
  }
  // where the right hand is at each level (camera space); the left one mirrors it
  const POSES = [[.3, -.36, -.48, -.35, 0, .3], [.2, -.2, -.52, .1, 0, .12], [.26, .06, -.6, .22, 0, -.1]];
  // each hand on its own: 0 down, 1 forward, 2 up in the air; a held button raises it, letting go lowers it
  const hand = { L: 0, R: 0 }, held = { L: false, R: false };
  const RAISE = 1.4, LOWER = 1.1;   // levels per second

  // ---- the outfit ----
  function apply() {
    W.fit = fit;
    me.dress(fit); meMirror.dress(fit);
    moonP.rig?.dress(fit, { planet: true });
    buildHands();
    game.getNet()?.setLook(fit);
  }
  apply();
  function equip(id) {
    const it = ITEMS[id];
    if (!it) return;
    fit = { ...fit, [it.slot]: fit[it.slot] === id && (it.slot === 'hat' || it.slot === 'glasses') ? (it.slot === 'hat' ? 'nohat' : 'noglasses') : id };
    apply();
  }

  // ---- empty hands ----
  let lastTool = 'shovel';
  const handsOut = () => eco.s.tool === 'hands';
  function toggleHands() {
    if (handsOut()) { eco.s.tool = lastTool; ui.toast('outil repris'); }
    else { lastTool = eco.s.tool; eco.s.tool = 'hands'; hand.L = hand.R = 0; held.L = held.R = false; ui.toast(HANDS_TOAST, false, 3200); }
    audio.tick();
  }

  // ---- emotes ----
  function play(id) {
    if (game.getState() !== 'play' || !EMOTES[id]) return;
    const r = game.onPlanet() ? moonP.rig : me;
    if (!r) return;
    if (r.emote === id && EMOTES[id].dur === Infinity) { r.stop(); game.getNet()?.emote(null); return; }
    r.play(id);
    game.getNet()?.emote(id);
    audio.pop?.();
  }

  // the wheel: hold g (or the right stick's button, or the button on a phone), point, let go
  const wheel = document.createElement('div');
  wheel.id = 'emotes'; wheel.className = 'hidden';
  const N = EMOTE_ORDER.length;
  wheel.innerHTML = `<div class="em-mid"><b>émotes</b><span>vise, puis lâche</span></div>` + EMOTE_ORDER.map((id, i) => {
    const a = i / N * Math.PI * 2;
    return `<button type="button" class="em-it" data-e="${id}" style="--x:${(Math.sin(a) * 150).toFixed(1)}px;--y:${(-Math.cos(a) * 150).toFixed(1)}px"><i>${(i + 1) % 10}</i>${EMOTES[id].name}</button>`;
  }).join('');
  document.body.appendChild(wheel);
  const items = [...wheel.querySelectorAll('.em-it')];
  const btn = document.createElement('button');
  btn.id = 'emote-btn'; btn.type = 'button'; btn.textContent = 'émotes'; btn.className = 'hidden';
  document.body.appendChild(btn);
  let open = null, sel = -1, sens = 1;
  const acc = { x: 0, y: 0 };
  function openWheel(how) {
    if (open || game.getState() !== 'play') return;
    open = how; sel = -1; acc.x = acc.y = 0;
    sens = player.feel.sens; player.feel.sens = 0; moonP.frozen = true;
    wheel.classList.remove('hidden'); wheel.classList.toggle('tap', how === 'tap');
    mark();
  }
  function closeWheel(go) {
    if (!open) return;
    open = null;
    player.feel.sens = sens || 1; moonP.frozen = false;
    wheel.classList.add('hidden');
    if (go && sel >= 0) play(EMOTE_ORDER[sel]);
  }
  function mark() { items.forEach((b, i) => b.classList.toggle('on', i === sel)); }
  function aim(x, y) {
    const d = Math.hypot(x, y);
    sel = d < 35 ? -1 : Math.round(((Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 / N)) % N;
    mark();
  }
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    if (open) {
      const n = /^Digit(\d)$/.exec(e.code);
      if (n) { sel = (+n[1] + 9) % 10; if (sel < N) closeWheel(true); e.stopImmediatePropagation(); return; }
      if (e.code === 'Escape') { closeWheel(false); e.stopImmediatePropagation(); return; }
    }
    if (e.repeat) return;
    if (e.code === 'KeyG' && game.getState() === 'play') openWheel('key');
    if (e.code === 'KeyH' && game.getState() === 'play') toggleHands();
  }, true);
  addEventListener('keyup', (e) => { if (e.code === 'KeyG' && open === 'key') closeWheel(true); });
  addEventListener('mousemove', (e) => {
    if (!open || open === 'tap' || !document.pointerLockElement) return;
    acc.x += e.movementX; acc.y += e.movementY;
    const d = Math.hypot(acc.x, acc.y);
    if (d > 140) { acc.x *= 140 / d; acc.y *= 140 / d; }
    aim(acc.x, acc.y);
  });
  wheel.addEventListener('click', (e) => {
    const b = e.target.closest('.em-it');
    if (b) { sel = items.indexOf(b); closeWheel(true); } else if (open === 'tap') closeWheel(false);
  });
  wheel.addEventListener('mouseover', (e) => { const b = e.target.closest('.em-it'); if (b && !document.pointerLockElement) { sel = items.indexOf(b); mark(); } });
  btn.addEventListener('click', () => { if (open) closeWheel(false); else openWheel('tap'); });
  let padHeld = false;
  function pollPad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected) : null;
    const rs = !!gp?.buttons[11]?.pressed;
    if (rs && !padHeld && game.getState() === 'play') openWheel('pad');
    if (open === 'pad') {
      if (rs) aim((gp.axes[2] || 0) * 140, (gp.axes[3] || 0) * 140);
      else closeWheel(true);
    }
    padHeld = rs;
  }

  // ---- the shops and the wardrobe ----
  let shop = 'europe', wtab = 'top', spin = 0;
  ui.el.shopTabs.addEventListener('click', (e) => {
    if (game.getPanel() !== 'wardrobe') return;
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    e.stopImmediatePropagation();
    wtab = b.dataset.tab; audio.tick(); game.renderPanel();
  }, true);
  function render(kind, quip) {
    if (kind === 'boutique') {
      const rows = shopItems(shop).map(it => {
        const own = owns(it.id), worn = fit[it.slot] === it.id;
        return { id: 'wear:' + it.id, kind: SLOT_NAME[it.slot], name: it.name, sub: it.sub, price: it.price, poor: !own && eco.s.money < it.price, owned: own, ownedText: worn ? 'porté' : 'à toi · porter', done: worn };
      });
      ui.panel({ title: SHOPS[shop].name, quip: quip ?? SHOPS[shop].quip, rows, note: 'acheté, c\'est porté tout de suite · le vestiaire de la maison garde tout', close: 'sortir' });
      return true;
    }
    if (kind !== 'wardrobe') return false;
    let rows;
    if (wtab === 'moi') rows = [
      ...SKINS.map((c, i) => ({ id: 'skin:' + i, kind: 'peau', name: `teint ${i + 1}`, done: fit.skin === i, sub: fit.skin === i ? 'le tien' : '' })),
      ...HAIR_STYLES.map(([id, name]) => ({ id: 'hair:' + id, kind: 'coiffure', name, done: fit.hair === id, sub: fit.hair === id ? 'la tienne' : '' })),
    ];
    else if (wtab === 'couleurs') rows = [
      ...HAIR_COLORS.map(([name], i) => ({ id: 'hairC:' + i, kind: 'cheveux', name, done: fit.hairC === i, sub: fit.hairC === i ? 'les tiens' : '' })),
      ...TEES.map(([name], i) => ({ id: 'tee:' + i, kind: 't-shirt', name, done: fit.tee === i, sub: fit.tee === i ? 'le tien · aussi le pull et la casquette' : 'le pull et la casquette aussi' })),
    ];
    else rows = Object.entries(ITEMS).filter(([, it]) => it.slot === wtab).sort((a, b) => (b[1].free ? 1 : 0) - (a[1].free ? 1 : 0)).map(([id, it]) => {
      const worn = fit[it.slot] === id;
      if (!owns(id)) return { id: 'wear:' + id, kind: 'en vente', name: it.name, sub: it.sub, lock: WHERE[it.shop] };
      return { id: 'wear:' + id, kind: worn ? 'porté' : '', name: it.name, sub: it.sub, done: worn };
    });
    const n = W.own.length;
    ui.panel({ title: 'le vestiaire', quip, tabs: WTABS, tab: wtab, rows, note: `${n} vêtement${n > 1 ? 's' : ''} acheté${n > 1 ? 's' : ''} · les autres te voient ainsi · g : émotes · h : mains vides`, close: 'fermer' });
    return true;
  }
  function click(kind, id) {
    if (kind !== 'boutique' && kind !== 'wardrobe') return false;
    const deny = () => { audio.deny(); ui.flashItem(id, 'shake'); };
    const [k, v] = id.split(':');
    if (k === 'wear') {
      const it = ITEMS[v];
      if (!it) return true;
      if (!owns(v)) {
        if (kind !== 'boutique' || !eco.pay(it.price)) return deny(), true;
        W.own.push(v);
        ui.setCoins(eco.s.money, true);
        audio.buy();
        fit = { ...fit, [it.slot]: v }; apply();
        game.renderPanel(['ça vous va très bien !', 'magnifique.', 'un vrai mannequin.', 'on dirait que c\'est fait pour vous.'][Math.floor(Math.random() * 4)]);
        ui.flashItem(id, 'bought');
        game.save();
        return true;
      }
      equip(v);
    } else if (k === 'skin') fit = { ...fit, skin: +v };
    else if (k === 'hair') fit = { ...fit, hair: v };
    else if (k === 'hairC') fit = { ...fit, hairC: +v };
    else if (k === 'tee') fit = { ...fit, tee: +v };
    else return true;
    if (k !== 'wear') apply();
    audio.tick();
    game.renderPanel();
    ui.flashItem(id, 'bought');
    game.save();
    return true;
  }
  function interact(it) {
    if (it.id === 'boutique') { shop = it.shop; game.openPanel('boutique'); return true; }
    if (it.id === 'wardrobe') {
      // step onto the turntable, facing the room (the mirror at your back)
      const d = house.wardrobe.dais;
      player.pos.set(d.x, .06, d.z); player.vel.set(0, 0, 0); player.yaw = -Math.PI / 2; player.pitch = 0;
      spin = 0;
      game.openPanel('wardrobe');
      return true;
    }
    return false;
  }
  const prompt = (it) => it?.id === 'boutique' ? `<b>e</b> ${SHOPS[it.shop].name} · essayer, acheter` : it?.id === 'wardrobe' ? '<b>e</b> le vestiaire · changer de tenue' : null;
  function nearSpace(w, pos) {
    for (const s of SPOTS) if (s.w === w && s.pos.distanceTo(pos) < s.reach) return { id: 'boutique', shop: s.shop, pos: s.pos };
    return null;
  }
  // empty-handed: the left button holds up the left hand, the right button the right one
  function mouse(button, down = true) {
    const k = button === 0 ? 'L' : button === 2 ? 'R' : null;
    if (!k) return false;
    if (!down) { held[k] = false; return handsOut(); }
    if (!handsOut() || game.getState() !== 'play' || game.armed()) return false;
    held[k] = true;
    return true;
  }

  // ---- the camera stepping back: during an emote, and while trying things on ----
  let blend = 0, t = 0, sentLook = false;
  const fpP = new THREE.Vector3(), fpQ = new THREE.Quaternion(), camP = new THREE.Vector3(), camQ = new THREE.Quaternion();
  const tgt = new THREE.Vector3(), dir = new THREE.Vector3(), probe = new THREE.Vector3(), m4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  let near = [], nearAt = new THREE.Vector3(1e9, 0, 0);
  function blocked(p) {
    for (const c of near) if (!c.off && p.x > c.min.x - .12 && p.x < c.max.x + .12 && p.y > c.min.y - .12 && p.y < c.max.y + .12 && p.z > c.min.z - .12 && p.z < c.max.z + .12) return true;
    return false;
  }
  function stepBack(dt, mode) {
    if (nearAt.distanceToSquared(player.pos) > 4) {
      nearAt.copy(player.pos);
      near = game.world.colliders.filter(c => Math.max(c.min.x - player.pos.x, player.pos.x - c.max.x, c.min.z - player.pos.z, player.pos.z - c.max.z) < 5);
    }
    const yaw = player.yaw;
    const th = mode === 'wardrobe' ? 0 : mode === 'boutique' ? .5 + Math.sin(t * .25) * .6 : .55;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    dir.set(fx * Math.cos(th) + fz * Math.sin(th), 0, -fx * Math.sin(th) + fz * Math.cos(th));
    const dist0 = mode === 'wardrobe' ? 2.3 : 2.6;
    tgt.copy(player.pos); tgt.y += mode === 'wardrobe' ? 1.05 : 1.15;
    dir.y = mode === 'wardrobe' ? .1 : .18; dir.normalize();
    let dist = dist0;
    const hit = game.T().raycast(tgt, dir, dist);
    if (hit) dist = Math.max(.7, hit.t - .25);
    for (let s = .45; s < dist; s += .12) if (blocked(probe.copy(tgt).addScaledVector(dir, s))) { dist = Math.max(.7, s - .2); break; }
    camP.copy(tgt).addScaledVector(dir, dist);
    // at a counter the panel takes the middle of the screen: look past the body, so it stands to the left
    tgt.set(player.pos.x, player.pos.y + (mode === 'wardrobe' ? .95 : 1.05), player.pos.z);
    if (mode !== 'emote') { probe.set(-dir.z, 0, dir.x).normalize(); tgt.addScaledVector(probe, -Math.min(1.4, dist * .55)); }
    m4.lookAt(camP, tgt, UP);
    camQ.setFromRotationMatrix(m4);
  }

  function update(dt) {
    t += dt;
    EYE.copy(camera.position);
    const state = game.getState(), here = game.getHere(), planet = game.onPlanet(), net = game.getNet();
    if (net && !sentLook) { net.setLook(fit); sentLook = true; }
    if (open && state !== 'play') closeWheel(false);
    pollPad();
    btn.classList.toggle('hidden', !(document.body.classList.contains('touch') && state === 'play'));
    // the one who moves stops their emote
    const R = planet ? moonP.rig : me;
    const vel = planet ? moonP.vel : player.vel;
    const hs = planet ? vel.length() : Math.hypot(vel.x, vel.z);
    if (R?.emote && hs > 1.1) { R.stop(); net?.emote(null); }
    if (planet && me.emote) me.stop();
    // the hands: level, and what the others see
    const out = handsOut();
    for (const k of ['L', 'R']) hand[k] = held[k] && out ? Math.min(2, hand[k] + RAISE * dt) : Math.max(0, hand[k] - LOWER * dt);
    const q = (v) => Math.round(v * 10) / 10;
    net?.setHands(out ? [q(hand.L), q(hand.R)] : -1, eco.s.tool);
    const panel = game.getPanel();
    const mode = !planet && state === 'panel' && (panel === 'wardrobe' || panel === 'boutique') ? panel : !planet && state === 'play' && me.emote ? 'emote' : null;
    blend = mode ? Math.min(1, blend + dt / .45) : Math.max(0, blend - dt / .35);
    if (mode === 'wardrobe') spin += dt * .7;
    else if (!mode && blend === 0) spin = 0;
    // your body: shown when the camera steps back, and in the mirror
    const mirrorOn = !!mirror && here === 'home' && house.inside(camera.position) && camera.position.distanceTo(house.wardrobe.mirrorPos) < 6.5;
    if (mirror) mirror.on = mirrorOn;
    me.root.visible = blend > .02 && !planet;
    const kind = out ? null : eco.s.tool;
    for (const r of [me, meMirror]) {
      if (r === me ? !me.root.visible && !me.emote : !mirrorOn) continue;
      r.root.position.copy(player.pos);
      r.root.rotation.y = player.yaw + Math.PI + spin;
      r.st.speed = Math.hypot(player.vel.x, player.vel.z); r.st.ground = player.onGround; r.st.vy = player.vel.y;
      r.st.hands = out ? [hand.L, hand.R] : -1; r.st.dig = !out && game.digging();
      r.hold(kind === 'drill' && eco.s.lv.drill ? 'drill' : kind === 'portal' || kind === 'disc' ? 'gun' : kind ? 'shovel' : null);
      if (r === meMirror && me.emote && meMirror.emote !== me.emote) meMirror.play(me.emote);
      if (r === meMirror && !me.emote && meMirror.emote) meMirror.stop();
      r.update(dt);
    }
    if (planet && moonP.rig) { moonP.rig.st.hands = out ? [hand.L, hand.R] : -1; moonP.setTool?.(out ? 'hands' : eco.s.tool === 'drill' && eco.s.lv.drill ? 'drill' : 'shovel'); }
    if (blend > 0 && !planet) {
      fpP.copy(camera.position); fpQ.copy(camera.quaternion);
      stepBack(dt, mode || 'emote');
      const e = blend * blend * (3 - 2 * blend);
      camera.position.lerpVectors(fpP, camP, e);
      camera.quaternion.slerpQuaternions(fpQ, camQ, e);
      camera.updateMatrixWorld();
    }
    // the hands in front of the eye
    handsRoot.visible = out && state === 'play' && !planet && blend < .05 && !game.armed();
    if (handsRoot.visible) {
      const bob = Math.sin(t * 1.6) * .008 + (Math.hypot(player.vel.x, player.vel.z) > .5 ? Math.abs(Math.sin(t * 7)) * .018 : 0);
      hands.forEach((h, i) => {
        // hands[0] is on the right of the screen, hands[1] on the left
        const lv = i ? hand.L : hand.R;
        const a = Math.floor(Math.min(1.999, lv)), f = lv - a, P = POSES[a], Q = POSES[a + 1];
        const s = i ? -1 : 1, v = (k) => P[k] + (Q[k] - P[k]) * f;
        h.position.set(v(0) * s, v(1) + bob + (lv > 1.9 ? Math.sin(t * 5 + i) * .01 : 0), v(2));
        h.rotation.set(v(3), v(4) * s, v(5) * s);
      });
    }
    // the shop people near you
    // while you try things on, the shop people near you get out of the picture
    const trying = blend > 0 && (mode === 'boutique' || mode === 'wardrobe');
    for (const p of PEOPLE) {
      p.group.getWorldPosition(probe);
      const hide = trying && probe.distanceToSquared(player.pos) < 36;
      if (hide && p.group.visible) { p.group.visible = false; p.hid = true; }
      else if (!hide && p.hid) { p.group.visible = true; p.hid = false; }
    }
    for (const p of PEOPLE) {
      if (p.still || p.w !== here || (p.vis && !p.vis())) continue;
      p.group.getWorldPosition(probe);
      if (probe.distanceToSquared(camera.position) < 900) p.rig.update(dt);
    }
  }

  return {
    me, update, render, click, interact, prompt, nearSpace, mouse, play, toggleHands, equip,
    get handsOut() { return handsOut(); },
    get level() { return Math.max(hand.L, hand.R); }, set level(v) { hand.L = hand.R = Math.max(0, Math.min(2, +v || 0)); },
    get hands() { return { ...hand }; },
    get fit() { return fit; },
    get wheelOpen() { return !!open; },
    openWheel, closeWheel,
  };
}
