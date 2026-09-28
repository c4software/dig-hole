// drops.js, a little bag left on the ground for someone else: coins, items, what was in the
// sack. Dropping and picking up are ops of the room (room.js), so late comers see the bags
// too, and only the room says who got one: a "take" counts once it comes back from the room,
// the first one in its log wins. Solo: the bag waits for you, kept with the save.
// Also the host's gifts: the same bundle, handed over without a bag.
import * as THREE from 'three';

// a bundle: { coins, items: {id: n}, ali: {id: n (aliexpresso ones among them)}, sack: {id: n}, parts: [id] }
export const emptyPack = () => ({ coins: 0, items: {}, ali: {}, sack: {}, parts: [] });
export const packEmpty = (p) => !p.coins && !Object.keys(p.items).length && !Object.keys(p.sack).length && !(p.parts || []).length;

// what's in it, in words: « 3 × fer · 50 ● »
export function packText(p, { itemName = (id) => id, sackName = (id) => id, partName = (id) => id } = {}) {
  const bits = [];
  for (const [id, n] of Object.entries(p.sack || {})) bits.push(`${n} × ${sackName(id)}`);
  for (const [id, n] of Object.entries(p.items || {})) bits.push(`${n} × ${itemName(id)}`);
  for (const id of p.parts || []) bits.push(partName(id));
  if (p.coins) bits.push(`${p.coins} ●`);
  return bits.join(' · ');
}

// what came over the network, made safe: known things only, sane amounts
export function cleanPack(p, { items = {}, sackOk = () => true, partOk = () => true } = {}) {
  const out = emptyPack();
  if (!p || typeof p !== 'object') return out;
  out.coins = Math.max(0, Math.min(1e7, Math.floor(+p.coins || 0)));
  for (const [id, n] of Object.entries(p.items || {})) { const k = Math.max(0, Math.min(99, Math.floor(+n || 0))); if (items[id] && k) { out.items[id] = k; const a = Math.min(k, Math.floor(+(p.ali || {})[id] || 0)); if (a > 0) out.ali[id] = a; } }
  for (const [id, n] of Object.entries(p.sack || {})) { const k = Math.max(0, Math.min(999, Math.floor(+n || 0))); if (k && sackOk(id)) out.sack[id] = k; }
  out.parts = (Array.isArray(p.parts) ? p.parts : []).filter(id => typeof id === 'string' && partOk(id)).slice(0, 5);
  return out;
}

function labelSprite(lines) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  if (!g) return new THREE.Object3D();
  g.fillStyle = 'rgba(26,19,13,.78)';
  g.beginPath(); g.roundRect(6, 8, 500, 112, 30); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffdc8f'; g.font = 'italic 32px Georgia';
  g.fillText(lines[0], 256, 42, 480);
  g.fillStyle = '#ffffff'; g.font = '600 28px Rubik, system-ui, sans-serif';
  g.fillText(lines[1], 256, 88, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  s.scale.set(1.9, .48, 1);
  return s;
}
const burlap = new THREE.MeshLambertMaterial({ color: 0xb58a55 });
const string = new THREE.MeshLambertMaterial({ color: 0x5a3a1c });
const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: .7, roughness: .3, emissive: 0x3a2800 });
function bagMesh(coins) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.26, 14, 10), burlap);
  body.scale.set(1, .85, 1); body.position.y = .22;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.07, .12, .14, 10), burlap); neck.position.y = .47;
  const tie = new THREE.Mesh(new THREE.TorusGeometry(.085, .022, 6, 14), string); tie.rotation.x = Math.PI / 2; tie.position.y = .45;
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(.1, .12, 8), burlap); tuft.position.y = .58; tuft.rotation.x = Math.PI;
  g.add(body, neck, tie, tuft);
  if (coins) for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .02, 14), gold); c.position.set(.2 + i * .05, .02 + i * .022, .12 - i * .03); g.add(c); }
  return g;
}

// deps: scene, eco, ui, audio, ITEMS, PARTS, nameOf, gainPart, save, emit(op) (applyOp: to the room),
//       net() (null in solo), myName(), where() → { w, p: Vector3 (feet), yaw? }
export function createDrops({ scene, eco, ui, audio, ITEMS, PARTS = [], nameOf, gainPart, save, emit, net, myName }) {
  const list = new Map();   // id → { op, g, t, armed, pending }
  const itemName = (id) => ITEMS[id]?.name || id;
  const partName = (id) => PARTS.find(p => p.id === id)?.name || id;
  const names = { itemName, sackName: (id) => nameOf(isNaN(+id) ? id : +id), partName };
  const clean = (p) => cleanPack(p, { items: ITEMS, sackOk: (id) => nameOf(isNaN(+id) ? id : +id) !== '?', partOk: (id) => PARTS.some(x => x.id === id) });
  let pack = emptyPack();

  function add(op) {
    if (!op || typeof op.id !== 'string' || list.has(op.id) || !Array.isArray(op.p)) return;
    const c = clean(op.c);
    if (packEmpty(c)) return;
    const g = bagMesh(c.coins > 0);
    g.position.fromArray(op.p);
    const tag = labelSprite([`de ${String(op.by || '?').slice(0, 10)}`, packText(c, names)]);
    tag.position.y = 1.05;
    g.add(tag);
    g.rotation.y = Math.random() * 6;
    scene.add(g);
    // my own bag waits until I've stepped away from it before it can be picked up again
    list.set(op.id, { op: { ...op, c }, g, t: Math.random() * 6, armed: op.mine !== true, pending: null });
  }
  function remove(id) { const d = list.get(id); if (!d) return null; scene.remove(d.g); list.delete(id); return d; }
  function clear() { for (const id of [...list.keys()]) remove(id); }

  // ---------- handing things over ----------
  function grant(p, how) {
    p = clean(p);
    if (p.coins) { eco.s.money += p.coins; ui.setCoins(eco.s.money, true); }
    for (const [id, n] of Object.entries(p.items)) { const a = p.ali[id] || 0; if (n - a > 0) eco.give(id, n - a); if (a) eco.give(id, a, true); }
    for (const [id, n] of Object.entries(p.sack)) for (let i = 0; i < n; i++) eco.add(isNaN(+id) ? id : +id, true);
    if (Object.keys(p.sack).length) ui.setBag(eco.s.sackN, eco.cap, true);
    for (const id of p.parts) gainPart?.(id);
    const text = packText(p, names);
    if (text) { ui.toast(`${how} : ${text}`, false, 4000); audio?.buy?.(); }
    save?.();
    return text;
  }

  // ---------- picking up ----------
  function claim(id) {
    const d = list.get(id);
    if (!d || d.pending) return;
    const n = net();
    if (!n) { remove(id); grant(d.op.c, 'tu ramasses'); return; }
    // the room answers: our take comes back if it was the first one
    d.pending = Math.random().toString(36).slice(2, 10);
    d.g.visible = false;
    n.sendOp({ k: 'take', id, tok: d.pending });
    setTimeout(() => { const x = list.get(id); if (x && x.pending === d.pending) { x.pending = null; x.armed = false; } }, 4000);
  }
  // a take from the room's log: the bag is gone for everyone, its contents to the one whose take it was
  function taken(op) {
    const d = remove(op.id);
    if (d && d.pending && op.tok === d.pending) grant(d.op.c, 'tu ramasses');
  }

  function update(dt, w, pos, spherical = false) {
    for (const [id, d] of list) {
      const here = d.op.w === w || (d.op.w === 'church' && w === 'home');
      if (!d.pending) d.g.visible = here;
      if (!here) continue;
      d.t += dt;
      d.g.children[0].position.y = .22 + Math.sin(d.t * 2.2) * .03;
      const p = d.g.position;
      const dx = pos.x - p.x, dy = pos.y - p.y, dz = pos.z - p.z;
      const near = spherical ? dx * dx + dy * dy + dz * dz < 1.6 * 1.6 : dx * dx + dz * dz < 1.1 * 1.1 && dy > -1.2 && dy < 1.6;
      if (!near) { if (!d.armed && dx * dx + dy * dy + dz * dz > 2.4 * 2.4) d.armed = true; continue; }
      if (d.armed && !d.pending) claim(id);
    }
  }
  // the closest bag within reach (for e)
  function nearest(w, pos, reach = 2.4) {
    let best = null, bd = reach * reach;
    for (const [id, d] of list) {
      if (d.pending || (d.op.w !== w && !(d.op.w === 'church' && w === 'home'))) continue;
      const q = d.g.position.distanceToSquared(pos);
      if (q < bd) { bd = q; best = id; }
    }
    return best;
  }

  // ---------- the "poser un paquet" counter (main.js panel 'drop') ----------
  const leftCoins = () => Math.max(0, eco.s.money - pack.coins);
  const leftItem = (id) => (eco.s.items[id] || 0) - (pack.items[id] || 0);
  const leftSack = (id) => (eco.s.sack[id] || 0) - (pack.sack[id] || 0);
  function panel(quip, slots) {
    const empty = packEmpty(pack);
    const rows = [
      { id: 'put', kind: 'paquet', name: empty ? 'le paquet est vide' : packText(pack, names), sub: empty ? 'choisis ci-dessous ce que tu laisses' : 'le poser devant toi · qui passe dessus le ramasse', done: !empty, lock: empty ? 'vide' : null },
    ];
    if (!empty) rows.push({ id: 'clear', kind: 'paquet', name: 'vider le paquet', sub: 'tout revient dans tes poches' });
    rows.push({ id: 'coin:10', kind: 'pièces', name: '+10 ●', sub: `il t'en reste ${leftCoins()}`, poor: leftCoins() < 10 },
      { id: 'coin:100', kind: 'pièces', name: '+100 ●', poor: leftCoins() < 100 },
      { id: 'coin:all', kind: 'pièces', name: 'tout le reste', poor: leftCoins() <= 0 });
    for (const id of slots) if (leftItem(id) > 0) rows.push({ id: 'item:' + id, kind: 'objet', name: itemName(id), lvl: `×${leftItem(id)}`, sub: '+1 dans le paquet' });
    const sackIds = Object.keys(eco.s.sack).filter(id => leftSack(id) > 0);
    if (sackIds.length) rows.push({ id: 'sackall', kind: 'sac', name: 'tout le sac', sub: `${sackIds.reduce((a, id) => a + leftSack(id), 0)} trouvailles` });
    for (const id of sackIds) rows.push({ id: 'sack:' + id, kind: 'sac', name: names.sackName(id), lvl: `×${leftSack(id)}`, sub: '+1 dans le paquet' });
    return { title: 'poser un paquet', quip, rows, note: 'pour les autres (ou pour plus tard) : il reste au sol jusqu\'à ce que quelqu\'un marche dessus', close: 'fermer' };
  }
  // a click in that panel: 'put' drops it (the caller closes the panel), else it's re-rendered
  function click(id, where) {
    const [k, v] = id.split(':');
    if (k === 'coin') { const n = v === 'all' ? leftCoins() : Math.min(+v, leftCoins()); if (n <= 0) return 'deny'; pack.coins += n; return 'ok'; }
    if (k === 'item') { if (leftItem(v) <= 0) return 'deny'; pack.items[v] = (pack.items[v] || 0) + 1; return 'ok'; }
    if (k === 'sack') { if (leftSack(v) <= 0) return 'deny'; pack.sack[v] = (pack.sack[v] || 0) + 1; return 'ok'; }
    if (k === 'sackall') { for (const s of Object.keys(eco.s.sack)) if (leftSack(s) > 0) pack.sack[s] = eco.s.sack[s]; return 'ok'; }
    if (k === 'clear') { pack = emptyPack(); return 'ok'; }
    if (k === 'put') return put(where) ? 'put' : 'deny';
    return 'deny';
  }
  function put(where) {
    if (packEmpty(pack)) return false;
    // the dropper loses it now: what can't be paid for (spent meanwhile) is left out
    const p = emptyPack();
    p.coins = Math.min(pack.coins, eco.s.money);
    eco.s.money -= p.coins;
    for (const [id, n0] of Object.entries(pack.items)) {
      const n = Math.min(n0, eco.s.items[id] || 0);
      if (n <= 0) continue;
      const a = Math.min(n, eco.s.ali?.[id] || 0);
      eco.s.items[id] -= n; if (a) { eco.s.ali[id] -= a; p.ali[id] = a; }
      p.items[id] = n;
    }
    for (const [id, n0] of Object.entries(pack.sack)) {
      const n = Math.min(n0, eco.s.sack[id] || 0);
      if (n <= 0) continue;
      eco.s.sack[id] -= n; eco.s.sackN -= n; if (!eco.s.sack[id]) delete eco.s.sack[id];
      p.sack[id] = n;
    }
    pack = emptyPack();
    if (packEmpty(p)) return false;
    ui.setCoins(eco.s.money, true); ui.setBag(eco.s.sackN, eco.cap, true);
    const op = { k: 'drop', id: Math.random().toString(36).slice(2, 12), w: where.w, p: where.p.map(v => +v.toFixed(2)), by: myName(), c: p };
    add({ ...op, mine: true });
    emit(op);
    audio?.tick?.();
    save?.();
    return true;
  }

  return {
    add, remove, clear, claim, taken, update, nearest, grant, panel, click,
    resetPack() { pack = emptyPack(); },
    get size() { return list.size; },
    // solo: the bags lying around go with the save
    save() { return [...list.values()].map(d => d.op); },
    load(ops) { for (const op of ops || []) add({ ...op, mine: true }); },
  };
}
