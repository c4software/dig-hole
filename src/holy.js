// holy.js, the holy bomba. Deep under the church, below the templar's tomb and lower than the
// fallen bell, a buried chapel keeps a reliquary with a four-digit lock; the sealed room's parchment
// says the code « est parti plus loin que le ciel ». On mars, far from the lander, the templars who
// fled there raised an arch with a red cross; dig under it and their tablet gives the code (drawn
// from mars's seed, the same for the whole room). The reliquary opens for everyone once, with
// light and a choir; each player takes theirs (a few times over). Thrown, it counts « un, deux…
// cinq ! non, trois ! », sings hallelujah and opens a crater bigger than the pocket meteor.
import * as THREE from 'three';
import { createSfx } from './worms3d-sfx.js';
import { holyOrb } from './bombs.js';
import { ACH_LIST } from './house.js';
import { CHAPEL, CHEST, HOLY_TAKES, TABLET_DEPTH, TABLET_REACH, CODE_LEN, holyCode, tabletDir, checkCode, cleanCode, chapelCells, knownCode } from './holy-code.js';

for (const a of [['tablette', 'la tablette des templiers martiens'], ['reliquaire', 'le reliquaire ouvert'], ['holy', 'alléluia']])
  if (!ACH_LIST.some(x => x[0] === a[0])) ACH_LIST.push(a);

const UP = new THREE.Vector3(0, 1, 0);
const L = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
const glow = (c, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
const add = (c) => ({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cross(c, x, y, s, col = '#a81a1a') { c.fillStyle = col; c.fillRect(x - s * .12, y - s * .5, s * .24, s); c.fillRect(x - s * .4, y - s * .25, s * .8, s * .22); }

export const tabletText = (code) => 'nous, frères du temple, avons fui la terre en l\'an de grâce 1307, plus loin que le ciel.\n\n' +
  'la sainte bombe dort sous l\'église, sous le tombeau de notre frère, plus bas que la cloche. le reliquaire ne s\'ouvre qu\'avec ces chiffres :\n\n' +
  `✠  ${code.split('').join('  ·  ')}  ✠\n\n` +
  'tu compteras jusqu\'à trois, pas plus, pas moins. trois sera le nombre, et le nombre sera trois. quatre, tu ne compteras point. cinq est hors de question.';

// deps: scene (the home group), fxScene (the whole scene, for blasts anywhere), interactables,
// colliders, church (its terrain), eco, ui, audio, hooks: { marsSeed(), save(), unlock(k),
// emit(op), enterPanel(), closePanel(), puff(pos, color), readTablet(), myName() }
export function createHoly({ scene, fxScene, interactables, colliders, church, eco, ui, audio, hooks }) {
  const s = eco.s;
  s.holy = Object.assign({ code: null, seed: null, open: false, taken: 0 }, s.holy);
  const sfx = createSfx();
  const g = new THREE.Group(); scene.add(g);
  const box = (w, h, d, m, x, y, z, p = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };
  const addBox = (x0, y0, z0, x1, y1, z1) => colliders.push({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a125, metalness: .85, roughness: .3, emissive: 0x3a2600 });
  const stone = L(0xb8ac98), dark = L(0x4a4038), wood = L(0x5a2e1e, 0x120400);
  const code = () => holyCode(hooks.marsSeed());
  const known = () => knownCode(s.holy, hooks.marsSeed());

  // ---------- the chapel: always hollow, even in a church ground saved before it was dug ----------
  { const c = chapelCells(church.X0, church.Y0, church.Z0, church.S); church.hollowBox(c.i, c.j, c.k, c.w, c.h, c.d); }
  const C = CHAPEL, fy = C.y0, cz = (C.z0 + C.z1) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0 - .1, C.z1 - C.z0 - .1), new THREE.MeshLambertMaterial({ color: 0xc8bca0, map: tex(128, 128, (c, w) => {
    c.fillStyle = '#3a322c'; c.fillRect(0, 0, w, w);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { c.fillStyle = (x + y) % 2 ? '#d8cfb4' : '#8a3a2a'; c.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
  }) }));
  floor.material.map.wrapS = floor.material.map.wrapT = THREE.RepeatWrapping; floor.material.map.repeat.set(4, 4);
  floor.rotation.x = -Math.PI / 2; floor.position.set((C.x0 + C.x1) / 2, fy + .015, cz); g.add(floor);
  // the plinth and the reliquary on it, facing west
  const rel = new THREE.Group(); rel.position.set(CHEST.x, fy, CHEST.z); rel.rotation.y = -Math.PI / 2; g.add(rel);
  box(1.3, .5, .8, stone, 0, .25, 0, rel); box(1.4, .06, .9, L(0xcfc4ae), 0, .53, 0, rel);
  box(1, .5, .56, wood, 0, .81, 0, rel);
  for (const x of [-.46, 0, .46]) box(.06, .52, .58, gold, x, .81, 0, rel);
  box(1.02, .05, .58, gold, 0, .58, 0, rel);
  const lid = new THREE.Group(); lid.position.set(0, 1.06, -.28); rel.add(lid);
  box(1, .12, .56, wood, 0, .06, .28, lid);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 1, 4, 1), wood); roof.rotation.z = Math.PI / 2; roof.scale.set(1, .5, 1); roof.position.set(0, .14, .28); lid.add(roof);
  for (const x of [-.46, .46]) box(.06, .16, .6, gold, x, .12, .28, lid);
  const lidCross = new THREE.Group(); lidCross.position.set(0, .3, .28); lid.add(lidCross);
  box(.05, .3, .05, gold, 0, .1, 0, lidCross); box(.2, .05, .05, gold, 0, .14, 0, lidCross);
  // the lock on its face: four little brass wheels
  const lockTex = tex(256, 96, (c, w, h) => {
    c.fillStyle = '#2a1a0c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d9a125'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
    c.font = '48px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let n = 0; n < CODE_LEN; n++) { c.fillStyle = '#6a4a1a'; c.fillRect(22 + n * 56, 18, 44, 60); c.fillStyle = '#f2d78a'; c.fillText('?', 44 + n * 56, 50); }
  });
  box(.36, .14, .02, new THREE.MeshBasicMaterial({ map: lockTex }), 0, .84, .29, rel);
  // the engraving on the plinth: the way to mars
  const insc = new THREE.Mesh(new THREE.PlaneGeometry(1.24, .36), new THREE.MeshLambertMaterial({ transparent: true, map: tex(512, 150, (c, w) => {
    c.fillStyle = 'rgba(50,40,30,.9)'; c.textAlign = 'center';
    c.font = 'italic 32px Georgia, serif'; c.fillText('ici dort la sainte bombe', w / 2, 46);
    c.font = 'italic 25px Georgia, serif'; c.fillText('son code est parti plus loin que le ciel…', w / 2, 90); c.fillText('sur la planète rouge, sous la croix', w / 2, 128);
  }) }));
  insc.position.set(0, .26, .405); rel.add(insc);
  // halo and rays, once it's open
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 12), new THREE.MeshBasicMaterial(add(0xffe8a0)));
  halo.position.set(0, 1.2, 0); rel.add(halo);
  const rays = [];
  for (let n = 0; n < 9; n++) {
    const r = new THREE.Mesh(new THREE.ConeGeometry(.35, 4, 8, 1, true), new THREE.MeshBasicMaterial(add(0xfff0b0)));
    r.geometry.translate(0, -2, 0); r.rotation.set(Math.PI + (n / 8 - .5) * 1.3, 0, (n % 3 - 1) * .3);
    r.position.set(0, 1.1, 0); rel.add(r); rays.push(r);
  }
  const orbInChest = holyOrb(1.3); orbInChest.position.set(0, 1.02, 0); orbInChest.visible = false; rel.add(orbInChest);
  addBox(CHEST.x - .45, fy, CHEST.z - .7, CHEST.x + .45, fy + 1.1, CHEST.z + .7);
  // candles on either side, the only light down here
  const flame = glow(0xffa040, 2.4), flames = [];
  for (const dz of [-1.2, 1.2]) {
    box(.14, .9, .14, stone, CHEST.x, fy + .45, CHEST.z + dz);
    box(.08, .22, .08, L(0xf2ead8), CHEST.x, fy + 1.01, CHEST.z + dz);
    const f = new THREE.Mesh(new THREE.ConeGeometry(.04, .12, 6), flame); f.position.set(CHEST.x, fy + 1.18, CHEST.z + dz); g.add(f); flames.push(f);
  }
  const chestIt = { id: 'holychest', pos: new THREE.Vector3(CHEST.x - .6, fy + 1, CHEST.z), reach: 2 };
  interactables.push(chestIt);
  const chestPos = new THREE.Vector3(CHEST.x, fy + 1, CHEST.z);

  // ---------- the sealed room's parchment: where to look ----------
  const note = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .7), new THREE.MeshLambertMaterial({ transparent: true, map: tex(400, 256, (c, w, h) => {
    c.fillStyle = '#e8dcb8'; c.beginPath(); c.moveTo(10, 14); c.lineTo(w - 8, 6); c.lineTo(w - 14, h - 10); c.lineTo(6, h - 4); c.closePath(); c.fill();
    c.fillStyle = '#3a2a1a'; c.font = 'italic 24px Georgia, serif'; c.textAlign = 'center';
    ['sous notre frère le templier,', 'plus bas que la cloche,', 'dort la sainte bombe.', 'son code est parti', 'plus loin que le ciel…'].forEach((l, n) => c.fillText(l, w / 2, 44 + n * 40));
    cross(c, w - 40, h - 36, 30);
  }) }));
  note.position.set(60.2, -6.2, 34.57); note.rotation.y = Math.PI; g.add(note);

  // ---------- the keypad ----------
  const css = document.createElement('style');
  css.textContent = `
#holy-pad { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(8, 5, 2, .62); backdrop-filter: blur(3px); font-family: var(--text, sans-serif); }
#holy-pad .hp-box { width: min(340px, calc(100vw - 32px)); padding: 22px 22px 16px; border-radius: 16px; text-align: center; color: #f6e7bd;
  background: radial-gradient(circle at 50% 0, #6a4418, #2a1808 70%); box-shadow: 0 0 0 3px #d9a125, 0 8px 0 3px #1a0e04, 0 30px 60px rgba(0,0,0,.6); }
#holy-pad .hp-box.shake { animation: hp-shake .45s; }
@keyframes hp-shake { 20%, 60% { transform: translateX(-9px) } 40%, 80% { transform: translateX(9px) } }
#holy-pad .hp-title { font: 400 22px / 1.1 var(--display, serif); color: #ffd75e; letter-spacing: .02em; }
#holy-pad .hp-sub { font: italic 14px / 1.4 Georgia, serif; opacity: .85; margin: 6px 0 14px; }
#holy-pad .hp-slots { display: flex; gap: 10px; justify-content: center; margin-bottom: 14px; }
#holy-pad .hp-slots span { width: 46px; height: 58px; border-radius: 8px; display: grid; place-items: center; font: 700 32px / 1 Georgia, serif;
  background: linear-gradient(#3a2408, #6a4a1a 50%, #3a2408); color: #ffe7a0; box-shadow: inset 0 0 0 2px #d9a125, 0 3px 0 #1a0e04; }
#holy-pad .hp-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 auto 10px; max-width: 240px; }
#holy-pad .hp-keys button { height: 44px; border: 0; border-radius: 10px; cursor: pointer; font: 700 20px / 1 Georgia, serif; color: #2a1808;
  background: linear-gradient(#ffe7a0, #d9a125); box-shadow: 0 3px 0 #6a4418; transition: transform .1s; }
#holy-pad .hp-keys button:active { transform: translateY(2px); box-shadow: 0 1px 0 #6a4418; }
#holy-pad .hp-keys button.ok { background: linear-gradient(#bff0a0, #4fa83a); }
#holy-pad .hp-msg { min-height: 20px; font: italic 14px / 1.4 Georgia, serif; color: #ffb0a0; }
#holy-pad .hp-msg.good { color: #bff0a0; }
#holy-pad .hp-close { margin-top: 8px; padding: 8px 18px; border: 0; border-radius: 999px; cursor: pointer; background: #1a0e04; color: #f6e7bd;
  font: 800 11px / 1 var(--text, sans-serif); letter-spacing: .12em; text-transform: uppercase; }`;
  document.head.appendChild(css);
  const pad = document.createElement('div'); pad.id = 'holy-pad'; pad.className = 'hidden';
  pad.innerHTML = `<div class="hp-box"><div class="hp-title">le reliquaire scellé</div>
<div class="hp-sub">quatre roues de laiton. « son code est parti plus loin que le ciel… »</div>
<div class="hp-slots">${'<span></span>'.repeat(CODE_LEN)}</div>
<div class="hp-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="back">⌫</button><button data-k="0">0</button><button data-k="ok" class="ok">✠</button></div>
<div class="hp-msg"></div><button class="hp-close">fermer</button></div>`;
  document.body.appendChild(pad);
  const padBox = pad.querySelector('.hp-box'), slots = [...pad.querySelectorAll('.hp-slots span')], msg = pad.querySelector('.hp-msg');
  let entry = '', padOpen = false, wrong = 0, busy = false;
  const show = () => { slots.forEach((el, n) => { el.textContent = entry[n] || ''; }); };
  function press(k) {
    if (!padOpen || busy) return;
    if (k === 'back') entry = entry.slice(0, -1);
    else if (k === 'ok') { tryCode(entry); return; }
    else if (entry.length < CODE_LEN) { entry += k; audio.tick?.(); }
    show();
    if (entry.length === CODE_LEN) setTimeout(() => { if (padOpen && entry.length === CODE_LEN) tryCode(entry); }, 250);
  }
  pad.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); else if (e.target.closest('.hp-close')) hooks.closePanel(); });
  addEventListener('keydown', (e) => {
    if (!padOpen) return;
    if (/^Digit\d$|^Numpad\d$/.test(e.code)) press(e.code.slice(-1));
    else if (e.code === 'Backspace') press('back');
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') press('ok');
  });
  function openKeypad() {
    entry = ''; show(); msg.textContent = known() ? 'la tablette martienne est dans tes lettres…' : ''; msg.classList.remove('good');
    pad.classList.remove('hidden'); padOpen = true; busy = false;
    hooks.enterPanel();
  }
  function closeKeypad() { pad.classList.add('hidden'); padOpen = false; }
  // true when it opened
  function tryCode(guess) {
    if (s.holy.open) return true;
    if (!checkCode(guess, hooks.marsSeed())) {
      wrong++;
      audio.deny?.(); sfx.init(); sfx.bounce?.(.5);
      padBox.classList.remove('shake'); void padBox.offsetWidth; padBox.classList.add('shake');
      msg.classList.remove('good');
      msg.textContent = wrong > 2 && !known() ? 'le reliquaire tousse de la poussière… le code est ailleurs, plus loin que le ciel' : 'mauvais code · le reliquaire crache un peu de poussière';
      hooks.puff(chestPos.clone().add(new THREE.Vector3(-.4, 0, 0)), 0xb8ac98);
      busy = true; setTimeout(() => { busy = false; entry = ''; show(); }, 500);
      return false;
    }
    msg.textContent = 'clic… clic… clic… clac.'; msg.classList.add('good');
    busy = true;
    setTimeout(() => { hooks.closePanel(); hooks.emit({ k: 'holy', t: Date.now(), by: hooks.myName() }); }, 650);
    return true;
  }

  // ---------- opened: for everyone ----------
  let lidT = s.holy.open ? 1 : 0, burstT = 0;
  function opened(op, local) {
    const first = !s.holy.open;
    s.holy.open = true;
    if (!first) return;
    if (local) {
      burstT = 4; sfx.init(); setTimeout(() => sfx.choir(), 250); audio.boom?.(.4);
      ui.toast('le reliquaire s\'ouvre… une lumière dorée, et des voix', false, 3500);
      hooks.unlock('reliquaire');
      setTimeout(() => take(), 2200);
      hooks.save();
    } else {
      lidT = Date.now() - (op.t || 0) < 15000 ? 0 : 1;
      if (!lidT) { burstT = 4; ui.toast(`${op.by || 'quelqu\'un'} a ouvert le reliquaire sous l'église !`, false, 3500); }
    }
  }
  // your own holy bomba from the open reliquary
  function take() {
    if (!s.holy.open) return false;
    if (eco.s.items.holy >= 1) { ui.toast('tu as déjà ta holy bomba · une à la fois'); return false; }
    if (s.holy.taken >= HOLY_TAKES) { audio.deny?.(); ui.toast('le reliquaire n\'a plus rien pour toi', true, 2600); return false; }
    eco.give('holy');
    s.holy.taken++;
    eco.s.slot = 'holy';
    audio.buy?.();
    ui.toast(`holy bomba ! (${s.holy.taken}/${HOLY_TAKES})`, false, 2600);
    ui.hint('clic droit pour la lancer · elle compte jusqu\'à trois · éloigne-toi, c\'est très saint', 6000);
    hooks.save();
    return true;
  }

  // ---------- mars: the arch and the buried tablet ----------
  let mars = null;
  function buildMars(parent, surfaceAt, center) {
    const seed = hooks.marsSeed();
    const d = new THREE.Vector3(...tabletDir(seed));
    const at = surfaceAt(d);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
    const arch = new THREE.Group(); arch.position.copy(at).addScaledVector(d, -.3); arch.quaternion.copy(q); parent.add(arch);
    const rock = L(0x8a4a30), rockD = L(0x5a3024);
    for (const x of [-1.3, 1.3]) { box(.7, 3.6, .7, rock, x, 1.8, 0, arch); box(.9, .3, .9, rockD, x, .15, 0, arch); }
    box(3.5, .6, .8, rock, 0, 3.8, 0, arch);
    const key = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), new THREE.MeshBasicMaterial({ transparent: true, map: tex(64, 64, (c) => cross(c, 32, 32, 56, '#d01a1a')), side: THREE.DoubleSide }));
    key.position.set(0, 3.8, .41); arch.add(key);
    const k2 = key.clone(); k2.position.z = -.41; arch.add(k2);
    const words = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .4), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, map: tex(512, 96, (c, w) => {
      c.fillStyle = 'rgba(255,230,190,.9)'; c.font = 'italic 34px Georgia, serif'; c.textAlign = 'center'; c.fillText('creuse sous la croix', w / 2, 60);
    }) }));
    words.position.set(0, 3.25, .42); arch.add(words);
    // a thin golden column, to be seen from the lander's horizon
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.25, .6, 60, 12, 1, true), new THREE.MeshBasicMaterial({ ...add(0xffd070), opacity: .16 }));
    beam.position.y = 30; arch.add(beam);
    // the tablet, lying under the arch
    const code = holyCode(seed);
    const tabPos = at.clone().addScaledVector(d, -TABLET_DEPTH);
    const tab = new THREE.Group(); tab.position.copy(tabPos); tab.quaternion.copy(q); parent.add(tab);
    box(1, .12, .7, L(0x9a8a78), 0, 0, 0, tab);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.92, .62), new THREE.MeshBasicMaterial({ toneMapped: false, map: tex(256, 172, (c, w, h) => {
      c.fillStyle = '#5a4a3a'; c.fillRect(0, 0, w, h); cross(c, 28, 30, 36, '#e02a2a'); cross(c, w - 28, 30, 36, '#e02a2a');
      c.fillStyle = '#ffd75e'; c.font = 'bold 54px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(code.split('').join(' '), w / 2, h / 2 + 8);
      c.font = 'italic 16px Georgia, serif'; c.fillText('fratres templi · mcccvii', w / 2, h - 18);
    }) }));
    face.rotation.x = -Math.PI / 2; face.position.y = .065; tab.add(face);
    const tglow = new THREE.Mesh(new THREE.SphereGeometry(.8, 12, 8), new THREE.MeshBasicMaterial({ ...add(0xffc860), opacity: .2 })); tab.add(tglow);
    mars = { seed, d, at, tabPos, code, beam, tglow };
    return mars;
  }
  function discover() {
    s.holy.code = mars.code; s.holy.seed = mars.seed;
    audio.buy?.(); sfx.init();
    ui.layer('la tablette des templiers', 'les templiers sont venus jusqu\'ici… un code gravé');
    ui.toast(`un code gravé dans la pierre : ${mars.code.split('').join(' · ')}`, false, 6000);
    hooks.unlock('tablette');
    hooks.save();
    setTimeout(() => hooks.readTablet(), 1400);
  }
  const marsNear = (pos) => {
    if (!mars) return null;
    if (known() && pos.distanceTo(mars.tabPos) < 2.6) return { id: 'holytab' };
    if (pos.distanceTo(mars.at) < 3.2) return { id: 'holyarch' };
    return null;
  };

  // ---------- thrown: the count, the choir, and the blast ----------
  function thrown() {
    sfx.init();
    ui.toast('« un, deux… cinq ! »', false, 900);
    setTimeout(() => ui.toast('« non, trois ! »', true, 1100), 900);
    setTimeout(() => sfx.choir(), 1000);
  }
  // the blast's own light: a column from the sky, a ring on the ground, a white flash
  const beams = [];
  function blast(pos, remote = false) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 90, 20, 1, true), new THREE.MeshBasicMaterial({ ...add(0xfff0b0), opacity: .7 }));
    col.position.copy(pos).add(new THREE.Vector3(0, 44, 0));
    const ring = new THREE.Mesh(new THREE.RingGeometry(.8, 1.4, 48), new THREE.MeshBasicMaterial({ ...add(0xffe080), opacity: .9 }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(pos).add(new THREE.Vector3(0, .2, 0));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ ...add(0xffffff), opacity: 1 }));
    ball.position.copy(pos);
    const light = new THREE.PointLight(0xffe0a0, 400, 40, 1.4); light.position.copy(pos).add(new THREE.Vector3(0, 2, 0));
    for (const o of [col, ring, ball, light]) fxScene.add(o);
    beams.push({ col, ring, ball, light, t: 0 });
    sfx.init(); sfx.boom(1.6);
    if (remote) sfx.choir();
  }

  // ---------- every frame ----------
  let t = 0;
  function update(dt, { here, pos, live = [] } = {}) {
    t += dt;
    // the lid and its light
    if (s.holy.open && lidT < 1) lidT = Math.min(1, lidT + dt / 1.6);
    lid.rotation.x = -lidT * 1.9;
    orbInChest.visible = s.holy.open && (eco.s.items.holy < 1 && s.holy.taken < HOLY_TAKES);
    orbInChest.rotation.y += dt;
    if (burstT > 0) burstT -= dt;
    const shine = !s.holy.open ? 0 : burstT > 0 ? Math.min(1, burstT / 1.5) : orbInChest.visible ? .25 + Math.sin(t * 2) * .08 : .08;
    halo.material.opacity = shine * .5; halo.scale.setScalar(1 + shine * .8 + Math.sin(t * 5) * .05);
    rays.forEach((r, n) => { r.material.opacity = shine * (.18 + Math.sin(t * 3 + n) * .06); r.scale.set(1, .6 + shine * .8, 1); });
    if (here === 'home' && pos && pos.y < -8) for (const f of flames) f.scale.setScalar(.85 + Math.sin(t * 13 + f.position.z * 3) * .1 + Math.random() * .08);
    // mars: the tablet is found when you've dug close enough
    if (here === 'mars' && mars && pos) {
      mars.beam.material.opacity = .12 + Math.sin(t * 1.5) * .04;
      mars.tglow.material.opacity = known() ? 0 : .15 + Math.sin(t * 3) * .06;
      if (!known() && pos.distanceTo(mars.tabPos) < TABLET_REACH) discover();
    }
    // a holy bomba in flight glows brighter as the choir swells
    for (const b of live) if (b.kind === 'holy') { const k = Math.max(0, 1 - b.fuse / 3); b.mesh.scale.setScalar(1 + k * .35); b.mesh.children[0]?.children[0]?.material.emissive?.setRGB(.25 + k * 1.2, .16 + k * .9, k * .2); }
    for (let n = beams.length - 1; n >= 0; n--) {
      const b = beams[n]; b.t += dt;
      const k = b.t / 2.6;
      b.col.material.opacity = .7 * Math.max(0, 1 - k); b.col.scale.set(1 + k * .5, 1, 1 + k * .5);
      b.ring.scale.setScalar(1 + b.t * 14); b.ring.material.opacity = Math.max(0, .9 - b.t * .7);
      b.ball.scale.setScalar(2 + b.t * 16); b.ball.material.opacity = Math.max(0, 1 - b.t * 2.2);
      b.light.intensity = 400 * Math.max(0, 1 - b.t * 1.2);
      if (k >= 1) { for (const o of [b.col, b.ring, b.ball, b.light]) { fxScene.remove(o); o.geometry?.dispose(); o.material?.dispose(); } beams.splice(n, 1); }
    }
  }

  function interact(it) {
    const id = it.id;
    if (id === 'holychest') {
      sfx.init();
      if (!s.holy.open) openKeypad(); else take();
      return true;
    }
    if (id === 'holyarch') { audio.clink?.(); ui.toast('« creuse sous la croix » · une arche de roche rouge, une croix de templier… sur mars ?', false, 4200); return true; }
    if (id === 'holytab') { hooks.readTablet(); return true; }
    return false;
  }
  function prompt(near) {
    const id = near.id;
    if (id === 'holychest') return !s.holy.open ? '<b>e</b> le reliquaire scellé · un cadenas à quatre chiffres'
      : eco.s.items.holy >= 1 ? 'le reliquaire ouvert · tu as déjà ta holy bomba'
      : s.holy.taken >= HOLY_TAKES ? 'le reliquaire ouvert · plus rien pour toi'
      : '<b>e</b> prendre ta holy bomba';
    if (id === 'holyarch') return '<b>e</b> l\'arche à la croix rouge';
    if (id === 'holytab') return '<b>e</b> relire la tablette des templiers';
    return undefined;
  }

  return {
    group: g, chest: chestIt, chestPos, get code() { return code(); }, get known() { return known(); }, get isOpen() { return s.holy.open; },
    get mars() { return mars; }, get keypadOpen() { return padOpen; },
    tabletText: () => tabletText(known() || '????'),
    openKeypad, closeKeypad, tryCode, press, opened, take, buildMars, marsNear, thrown, blast, update, interact, prompt,
    remote(fx, here) { if (fx.w === here && Array.isArray(fx.p)) blast(new THREE.Vector3(...fx.p), true); },
  };
}
