// moonwalk.harness.mjs, walks the astronaut across the real moon and mars with W held (8 headings from
// 40 spots, 5 s each) and measures the ground covered against the ideal; then a wall, a turned wall, a
// low slab, a jump and the jetpack.   node test/moonwalk.harness.mjs [module] [worlds]   (SPRINT=1, WHY=1, TRACE=s,h)
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.addEventListener ??= () => {};
globalThis.document ??= { pointerLockElement: null };
const THREE = await import('three');
const { createTerrain } = await import('../src/terrain.js');
const mod = process.argv[2] || '../src/moonplayer.js';
const { createMoonPlayer } = await import(mod);
const worlds = (process.argv[3] || 'moon,mars').split(',');
const CFG = { moon: { seed: 777, c: new THREE.Vector3(-400, 0, 0), g: 3.2 }, mars: { seed: 1971, c: new THREE.Vector3(0, 0, -900), g: 5.4 } };
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const SPEED = process.env.SPRINT ? 5 : 3.4, DT = 1 / 60, SECS = 5, HEADS = 8, STARTS = +(process.env.STARTS || 40);
for (const w of worlds) {
  let seedR = 12345;
  const rnd = () => ((seedR = (seedR * 16807) % 2147483647) / 2147483647);
  const { seed, c, g } = CFG[w];
  const t = createTerrain(scene, { theme: w, seed, ox: c.x, oy: c.y, oz: c.z });
  t.ensure();
  const P = createMoonPlayer(scene, camera, () => t);
  P.setActive(true); P.stats.g = g;
  let n = 0, stuck = 0, poor = 0, errs = 0, airT = 0, tot = 0, sunk = 0;
  const keys = new Set(process.env.SPRINT ? ['KeyW', 'ShiftLeft'] : ['KeyW']), none = new Set();
  const per = [];
  const arc = (p, q) => Math.acos(Math.min(1, p.clone().sub(c).normalize().dot(q.clone().sub(c).normalize()))) * t.radius;
  for (let s = 0; s < STARTS; s++) {
    const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
    const hit = t.raycast(c.clone().addScaledVector(dir, t.radius + 12), dir.clone().negate(), 30);
    const at = hit ? hit.point : c.clone().addScaledVector(dir, t.radius);
    for (let h = 0; h < HEADS; h++) {
      P.place(at);
      P.look((h * 2 * Math.PI / HEADS) / .0024, 0);
      for (let q = 0; q < 30; q++) P.update(DT, none);   // settle
      const p0 = P.pos.clone(), last = p0.clone(), prev = p0.clone();
      let stuckHere = false, path = 0;
      for (let f = 0; f < SECS * 60; f++) {
        try { P.update(DT, keys); } catch (e) { errs++; console.log(e); break; }
        if (!P.onGround) airT += DT;
        tot += DT;
        if (process.env.TRACE && `${s},${h}` === process.env.TRACE && f % 5 === 0) console.log(f, arc(P.pos, p0).toFixed(2), P.onGround, P.vel.length().toFixed(2), P.vel.dot(P.up).toFixed(2));
        path += arc(P.pos, prev); prev.copy(P.pos);
        if ((f + 1) % 60 === 0) { if (P.pos.distanceTo(last) < .3) stuckHere = true; last.copy(P.pos); }
      }
      // never left inside the rock
      const hit2 = t.raycast(P.pos.clone().addScaledVector(P.up, 1), P.up.clone().negate(), .9);
      if (hit2) sunk++;
      const ratio = path / (SPEED * SECS);
      per.push(ratio); n++;
      if (stuckHere) {
        stuck++;
        // how steep is it ahead of where it stopped: the ground's height 1 m on, against here
        if (process.env.WHY) {
          const surf = (p) => { const d = p.clone().sub(c).normalize(); const r = t.raycast(c.clone().addScaledVector(d, t.radius + 12), d.clone().negate(), 40); return r ? r.point.distanceTo(c) : 0; };
          const fw = P.heading.clone();
          const hs = [.5, 1, 1.5, 2].map(m => (surf(P.pos.clone().addScaledVector(fw, m)) - surf(P.pos)).toFixed(2));
          console.log('stalled', s, h, 'rise at .5/1/1.5/2 m:', hs.join(' '), 'feet above ground', (P.pos.distanceTo(c) - surf(P.pos)).toFixed(2), 'up', P.up.toArray().map(v => v.toFixed(2)).join(','));
        }
      }
      if (ratio < .6) poor++;
    }
  }
  per.sort((a, b) => a - b);
  const mean = per.reduce((a, b) => a + b, 0) / n;
  const pc = (v) => (v * 100).toFixed(0) + '%';
  console.log(`${w}: ${n} runs · mean ${pc(mean)} of ideal · median ${pc(per[n >> 1])} · p10 ${pc(per[n / 10 | 0])} · <60%: ${poor} · stalled ≥1 s: ${stuck} · airborne ${pc(airT / tot)} · in rock ${sunk} · errors ${errs}`);

  // built things: a wall 2 m ahead must stop the walk, a .4 m slab must be walked onto; jump and jetpack still lift
  const checks = [];
  for (const d0 of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0).normalize(), new THREE.Vector3(.5, .6, -.62).normalize()]) {
    const hit = t.raycast(c.clone().addScaledVector(d0, t.radius + 12), d0.clone().negate(), 30);
    P.setSolid(null); P.place(hit.point);
    for (let q = 0; q < 30; q++) P.update(DT, none);
    const base = P.pos.clone(), up = P.up.clone(), fw = P.heading.clone(), side = new THREE.Vector3().crossVectors(up, fw);
    // a ball against a box given in the walker's frame
    const slab = (d0_, d1, h0, h1) => (p, r) => {
      const q = p.clone().sub(base), a = q.dot(fw), b = q.dot(up), s = q.dot(side);
      const dx = Math.max(0, d0_ - a, a - d1), dy = Math.max(0, h0 - b, b - h1), dz = Math.max(0, Math.abs(s) - 3);
      return dx * dx + dy * dy + dz * dz < r * r;
    };
    let onSlab = 0;
    const walkFor = (secs) => { let most = -9; onSlab = 9; for (let f = 0; f < secs * 60; f++) { P.update(DT, keys); const q = P.pos.clone().sub(base); most = Math.max(most, q.dot(fw)); if (q.dot(fw) > 2.5 && q.dot(fw) < 5) onSlab = Math.min(onSlab, q.dot(up)); } return most; };
    P.setSolid(slab(2, 2.3, -30, 30)); P.place(base);
    const wall = walkFor(3);
    // the same wall turned 40°: glance along it, never through
    const n40 = fw.clone().applyAxisAngle(up, .7), s40 = new THREE.Vector3().crossVectors(up, n40);
    P.setSolid((p, r) => { const q = p.clone().sub(base), a = q.dot(n40), b = q.dot(up), s = q.dot(s40); const dx = Math.max(0, 2 - a, a - 2.3), dy = Math.max(0, -30 - b, b - 30), dz = Math.max(0, Math.abs(s) - 20); return dx * dx + dy * dy + dz * dz < r * r; });
    P.place(base);
    let deep = -9; for (let f = 0; f < 180; f++) { P.update(DT, keys); const q = P.pos.clone().sub(base); deep = Math.max(deep, q.dot(n40)); }
    const glance = P.pos.clone().sub(base).dot(s40);
    P.setSolid(slab(1.5, 6, -1, .4)); P.place(base);
    const most = walkFor(2), onTop = onSlab;
    P.setSolid(null); P.place(base);
    for (let q = 0; q < 10; q++) P.update(DT, none);
    let apex = 0; P.update(DT, new Set(['Space']));
    for (let f = 0; f < 240; f++) { P.update(DT, none); apex = Math.max(apex, P.pos.clone().sub(base).dot(up)); }
    P.place(base); P.stats.fuelMax = P.stats.fuel = 3;
    for (let q = 0; q < 10; q++) P.update(DT, none);
    let jet = 0; for (let f = 0; f < 150; f++) { P.update(DT, new Set(['Space'])); jet = Math.max(jet, P.pos.clone().sub(base).dot(up)); }
    P.stats.fuelMax = P.stats.fuel = 0;
    checks.push(`up ${d0.toArray().map(v => v.toFixed(1)).join(',')}: wall stops at ${wall.toFixed(2)} m (face at 2) · turned wall: deepest ${deep.toFixed(2)}, slid ${Math.abs(glance).toFixed(1)} m along · slab reached ${most.toFixed(1)} m, lowest feet on it ${onTop.toFixed(2)} (top at .4) · jump apex ${apex.toFixed(2)} · jetpack ${jet.toFixed(2)}`);
  }
  for (const l of checks) console.log('  ' + l);
}
