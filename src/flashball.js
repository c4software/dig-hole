// flashball.js, the foam-ball launcher pinched from the police at the lycée (blocus.js): in the
// hand (first person), a stubby black launcher with a fat barrel, a yellow muzzle and a sight;
// left click sends a yellow foam ball where you look. A ball of yours that touches someone is
// reported (hit), the others' balls only fly (their owner decides). The ammo lives in eco.s.
import * as THREE from 'three';

const SPEED = 30, LIFE = 2.2;

export function createFlashball({ scene, camera, sfx = null }) {
  // ---------- the launcher, in the hand ----------
  const vm = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: .6, metalness: .3 }), grey = new THREE.MeshStandardMaterial({ color: 0x4a4e56, roughness: .5, metalness: .5 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c21e, roughness: .5 }), red = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const put = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; vm.add(o); return o; };
  put(new THREE.CylinderGeometry(.042, .042, .34, 16), black, 0, .02, -.2, Math.PI / 2);          // the barrel
  put(new THREE.CylinderGeometry(.048, .048, .04, 16), yellow, 0, .02, -.38, Math.PI / 2);        // its muzzle band
  put(new THREE.CylinderGeometry(.03, .03, .01, 12), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }), 0, .02, -.401, Math.PI / 2);
  put(new THREE.BoxGeometry(.07, .09, .2), black, 0, -.005, -.02);                                   // the body
  put(new THREE.BoxGeometry(.045, .13, .06), grey, 0, -.1, .04, -.25);                              // the grip
  put(new THREE.BoxGeometry(.05, .06, .2), black, 0, -.03, .16);                                     // the stock
  put(new THREE.BoxGeometry(.03, .035, .08), grey, 0, .08, -.08);                                    // the sight
  put(new THREE.SphereGeometry(.007, 6, 4), red, 0, .085, -.12);
  const drum = put(new THREE.CylinderGeometry(.05, .05, .07, 12), grey, 0, -.05, -.12);             // the ball drum
  vm.traverse(o => { o.renderOrder = 999; });
  vm.scale.setScalar(.72); vm.visible = false;
  camera.add(vm);
  const REST = new THREE.Vector3(.27, -.2, -.55);
  let kick = 0, t = 0, cd = 0;

  // ---------- the balls in flight ----------
  const ballGeo = new THREE.SphereGeometry(.07, 12, 8), ballMat = new THREE.MeshLambertMaterial({ color: 0xffd23a, emissive: 0x6a4a00 });
  const pool = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(ballGeo, ballMat); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, pos: m.position, vel: new THREE.Vector3(), life: 0, mine: false, free: false }; });
  let next = 0;
  const tmp = new THREE.Vector3();
  // frozen people: a block of blue-white ice round them, « figé ! » over their head
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xcdeeff, emissive: 0x6ab8ff, emissiveIntensity: .35, transparent: true, opacity: .45, roughness: .1, metalness: .1, depthWrite: false });
  const iceGeo = new THREE.CapsuleGeometry(.42, 1.1, 4, 10); iceGeo.translate(0, .95, 0);
  const tagTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 80; const g = c.getContext('2d'); if (g) { g.font = '700 38px Rubik, sans-serif'; g.fillStyle = '#e8f6ff'; g.strokeStyle = '#1a3a6a'; g.lineWidth = 6; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText('figé !', 128, 40); g.fillText('figé !', 128, 40); } const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; })();
  const ices = [];
  function ice(group, dur) {
    let e = ices.find(q => q.group === group);
    if (!e) {
      const m = new THREE.Mesh(iceGeo, iceMat); m.renderOrder = 3;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false })); tag.scale.set(1.2, .38, 1); tag.position.y = 2.25;
      e = { group, m, tag, t: 0 }; ices.push(e);
    }
    group.add(e.m, e.tag); e.t = dur;
  }
  function launch(from, dir, mine) {
    const b = pool[next]; next = (next + 1) % pool.length;
    b.pos.copy(from); b.vel.copy(dir).multiplyScalar(SPEED); b.life = LIFE; b.mine = mine; b.free = false; b.m.visible = true;
    sfx?.shot(from.x, from.z, from.y, true);
    return b;
  }
  return {
    get held() { return vm.visible; }, set held(v) { vm.visible = v; },
    balls: pool, ice,
    // from the eye: the shot to send, or null while it reloads
    fire(eye, dir) {
      if (cd > 0) return null;
      cd = .45; kick = 1;
      const from = tmp.copy(eye).addScaledVector(dir, .5);
      launch(from, dir, true);
      return { p: from.toArray().map(v => Math.round(v * 100) / 100), d: dir.toArray().map(v => Math.round(v * 1000) / 1000) };
    },
    remote(shot) {
      if (!Array.isArray(shot?.p) || !Array.isArray(shot?.d) || ![...shot.p, ...shot.d].every(Number.isFinite)) return;
      const d = new THREE.Vector3(...shot.d); if (d.lengthSq() < .5) return;
      launch(new THREE.Vector3(...shot.p), d.normalize(), false);
    },
    // solid(x, y, z): ground or wall; hit(ball): a ball of mine touched someone (true: it stops)
    update(dt, moving, solid, hit) {
      t += dt; cd -= dt;
      kick = Math.max(0, kick - dt * 6);
      vm.position.copy(REST); vm.position.z += kick * .08; vm.rotation.set(kick * .35 + .04, .15, 0);
      if (moving) vm.position.y += Math.sin(t * 9) * .008;
      drum.rotation.y = kick * 2;
      for (let n = ices.length - 1; n >= 0; n--) { const e = ices[n]; e.t -= dt; if (e.t <= 0) { e.m.removeFromParent(); e.tag.removeFromParent(); ices.splice(n, 1); } }
      for (const b of pool) {
        if (b.life <= 0) continue;
        b.life -= dt;
        b.vel.y -= (b.free ? 9.8 : 2.5) * dt;
        const ox = b.pos.x, oy = b.pos.y, oz = b.pos.z;
        b.pos.addScaledVector(b.vel, dt);
        if (solid(b.pos.x, b.pos.y, b.pos.z)) {
          // a soft bounce, a « poc », then it rolls to a stop
          if (!b.free) sfx?.poc(ox, oy, oz);
          b.pos.set(ox, oy, oz); b.vel.multiplyScalar(-.3); b.vel.y = Math.abs(b.vel.y) + .8; b.free = true;
        } else if (b.mine && !b.free && hit(b)) { sfx?.poc(b.pos.x, b.pos.y, b.pos.z); b.vel.multiplyScalar(-.25); b.vel.y = 2; b.free = true; }
        if (b.life <= 0) b.m.visible = false;
      }
    },
  };
}
