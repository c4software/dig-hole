// caddies-physics.js, a supermarket trolley ridden standing on its back rail: plain numbers (no
// three.js), so node can race it. You kick like on a scooter (tap in rhythm: a bigger push), then
// ride with both feet up; the casters wobble, the rear swings out when you drift (shift) and the
// counter-steer catches it; hit something hard enough and the rider goes flying.
import { groundY } from './caddies-track.js';

export const TUNE = {
  R: .4,            // the cart's footprint (a circle)
  VKICK: 7.4,       // no kick pushes you past this (m/s), a little more in rhythm
  KICK: 1.8,        // a kick's push (m/s at a standstill)
  KICK_T: .4,       // a kick, foot down to foot back (s)
  HOLD_GAP: .16,    // holding the key: the next kick after this pause
  SWEET: .2,        // tapped within this after a kick: in rhythm
  ROLL: .25, DRAG: .02, BRAKE: 6,
  TURN: 2.4,        // yaw rate, full lock (rad/s)
  DRIFT_TURN: 3.1,
  GRIP: 9, DRIFT_GRIP: 1.2,
  SLIP_MAX: 1.05,   // the widest the rear swings out (rad)
  FALL_V: 4.4,      // a wall hit this hard (m/s, into it) throws the rider off
  FALL_CART: 5.2,   // another cart, as hard
  FALL_T: 2.4,      // off the cart, getting up and back on (s)
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function newCart(key, { bot = false, skill = 1, ph = 0 } = {}) {
  return { key, bot, skill, x: 0, z: 0, y: .1, vy: 0, yaw: 0, vx: 0, vz: 0, spin: 0, steer: 0,
    kick: 0, since: 9, combo: 0, sweetT: 0, pushT: 0, drift: 0, driftT: 0, slip: 0, fall: -1, fallN: 0, boostT: 0,
    age: 0, queue: false, rhythm: null, idx: 0, k: 0, cp: 0, laps: 0, done: false, time: 0, wrongT: 0, lane: 0, ph, stuckT: 0, bonkT: 0, slick: 0, brakeT: 0 };
}

// a cart on the line: sample i, `lat` metres to the right, `back` metres behind
export function placeCart(c, tr, i, lat = 0, back = 0) {
  const p = tr.pts[i];
  c.x = p.x + p.sx * lat - p.tx * back; c.z = p.z + p.sz * lat - p.tz * back;
  c.yaw = tr.yawAt(i); c.vx = c.vz = 0; c.spin = 0; c.drift = 0; c.driftT = 0; c.slip = 0; c.kick = 0; c.since = 9; c.combo = 0;
  c.fall = -1; c.y = groundY(c.x, c.z); c.vy = 0;
  c.idx = tr.nearest(c.x, c.z);
}

const speedOf = (c) => Math.hypot(c.vx, c.vz);
const fwdSpeed = (c) => c.vx * Math.sin(c.yaw) + c.vz * Math.cos(c.yaw);

// the events of a step: { kind: 'kick' | 'sweet' | 'bump' | 'fall' | 'boost' | 'kerb', v }
// inp: { steer -1..1 (+: left), kick (held), tap (pressed this frame), brake, drift }
// env: { track, solids [{x0, z0, x1, z1}], grip(x, z) → multiplier, fallV (multiplier) }
export function stepCart(c, inp, dt, env, ev = []) {
  const T = TUNE, tr = env.track;
  c.age += dt;
  c.pushT = Math.max(0, c.pushT - dt); c.sweetT = Math.max(0, c.sweetT - dt); c.boostT = Math.max(0, c.boostT - dt); c.bonkT -= dt;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = fz, lz = -fx;   // forward, and the left
  let vF = c.vx * fx + c.vz * fz, vL = c.vx * lx + c.vz * lz;
  const sp = Math.hypot(vF, vL);
  const slickK = env.grip ? env.grip(c.x, c.z) : 1;
  c.slick = slickK < 1 ? 1 : Math.max(0, c.slick - dt * 2);
  if (c.fall >= 0) {
    // off the cart: it rolls on by itself, slowing down, the casters turning it a little
    c.fall += dt;
    const k = Math.max(0, 1 - 2.2 * dt / Math.max(.2, sp));
    vF *= k; vL *= Math.exp(-4 * dt);
    c.yaw += c.spin * dt; c.spin *= Math.exp(-2 * dt);
    c.drift = 0; c.kick = 0; c.combo = 0; c.steer = 0;
    if (c.fall >= T.FALL_T) { c.fall = -1; c.since = 9; ev.push({ kind: 'up' }); }
  } else {
    // ---- the kicks ----
    const vmax = T.VKICK * (1 + .05 * c.combo);
    if (c.kick > 0) {
      const was = c.kick;
      c.kick += dt / T.KICK_T;
      // the foot on the ground from .3 to .7 of the kick: the push
      const on = Math.max(0, Math.min(c.kick, .7) - Math.max(was, .3));
      if (on > 0 && vF > -1) vF += T.KICK * (1 + .3 * c.combo) * Math.max(0, 1 - vF / vmax) * on / .4;
      if (c.kick >= 1) { c.kick = 0; c.since = 0; }
      // a tap a little early is kept for the end of this kick
      else if (inp.tap && c.kick > .7) c.queue = true;
    } else c.since += dt;
    if ((inp.kick || c.queue) && c.kick === 0 && !inp.brake) {
      const tapped = (inp.tap || c.queue) && c.since < 9;
      c.queue = false;
      if (tapped || c.since > T.HOLD_GAP) {
        const sweet = tapped && c.since < T.SWEET;
        c.combo = sweet ? Math.min(3, c.combo + 1) : tapped && c.since < T.SWEET + .25 ? c.combo : 0;
        c.kick = 1e-4;
        if (sweet) c.sweetT = .5;
        ev.push({ kind: sweet ? 'sweet' : 'kick', v: c.combo });
      }
    }
    if (c.since > T.SWEET + .6 && c.kick === 0) c.combo = 0;
    // ---- the brake: a foot dragged behind ----
    c.brakeT = inp.brake ? .2 : Math.max(0, c.brakeT - dt);
    if (inp.brake) { c.kick = 0; if (vF > 0) vF = Math.max(0, vF - T.BRAKE * dt); else vF = Math.max(-1.2, vF - 1.5 * dt); }
    // ---- the steering and the drift ----
    const steer = clamp(inp.steer || 0, -1, 1);
    c.steer += (steer - c.steer) * Math.min(1, dt * 10);
    if (inp.drift && !c.drift && Math.abs(steer) > .3 && vF > 2.4) { c.drift = Math.sign(steer); c.driftT = 0; ev.push({ kind: 'drift' }); }
    if (c.drift && (!inp.drift || vF < 1.2)) {
      if (c.driftT > .9 && vF > 1.5) { const b = .5 + Math.min(1, c.driftT - .9) * .7; vF += b; c.boostT = .6; ev.push({ kind: 'boost', v: b }); }
      c.drift = 0;
    }
    let rate, grip;
    if (c.drift) {
      c.driftT += dt;
      const into = steer * c.drift;   // 1: into the turn, -1: counter-steering
      rate = c.drift * T.DRIFT_TURN * (.58 + .42 * into) * clamp(vF / 3, .4, 1);
      grip = T.DRIFT_GRIP + (into < -.3 ? 2.2 : 0);
      vF -= .5 * dt;   // the scrub
    } else {
      const s = Math.sign(vF || 1);
      rate = c.steer * T.TURN * clamp(Math.abs(vF) / 1.4, 0, 1) * (1 - .25 * clamp((sp - 5) / 3, 0, 1)) * s;
      grip = T.GRIP;
    }
    // the squeaky caster: a wobble that grows with speed
    rate += Math.sin(c.ph + c.age * 13.7) * Math.sin(c.ph * 1.7 + c.age * 5.3) * .35 * clamp(sp / 5, 0, 1);
    c.spin = rate;
    c.yaw = wrap(c.yaw + rate * dt);
    // the rear slides: the side speed dies away at the grip, half of it carried on forwards
    grip *= slickK;
    const vL2 = vL * Math.exp(-grip * dt);
    if (vF > 0) vF += Math.abs(vL - vL2) * .45;
    vL = vL2;
  }
  // rolling resistance and air
  const loss = (T.ROLL + T.DRAG * vF * vF) * dt * (c.fall >= 0 ? 0 : 1);
  vF = vF > 0 ? Math.max(0, vF - loss) : Math.min(0, vF + loss);
  // the widest the rear can swing: past it the side speed is shed
  const lim = Math.tan(T.SLIP_MAX) * Math.max(.5, Math.abs(vF));
  if (Math.abs(vL) > lim) vL = Math.sign(vL) * lim;
  c.slip = Math.atan2(vL, Math.max(.5, Math.abs(vF)));
  // back to the world along the axes it was measured on: the body has turned, the speed not yet
  // (next step the grip pulls it round, or doesn't: the drift)
  c.vx = fx * vF + lx * vL; c.vz = fz * vF + lz * vL;
  const ox = c.x, oz = c.z;
  c.x += c.vx * dt; c.z += c.vz * dt;
  // ---- the walls: the props of the square, and the course's barriers ----
  const fallV = T.FALL_V * (env.fallV ?? 1);
  let hit = 0, nx = 0, nz = 0;
  for (const b of env.solids || []) {
    if (c.x < b.x0 - T.R || c.x > b.x1 + T.R || c.z < b.z0 - T.R || c.z > b.z1 + T.R) continue;
    const px = clamp(c.x, b.x0, b.x1), pz = clamp(c.z, b.z0, b.z1);
    let dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz);
    if (d >= T.R) continue;
    if (d < 1e-6) {   // the centre inside the box: out by the nearest side
      const o = [[c.x - b.x0, -1, 0], [b.x1 - c.x, 1, 0], [c.z - b.z0, 0, -1], [b.z1 - c.z, 0, 1]].sort((p, q) => p[0] - q[0])[0];
      dx = o[1]; dz = o[2]; d = 0; c.x += dx * (o[0] + T.R); c.z += dz * (o[0] + T.R);
    } else { dx /= d; dz /= d; c.x += dx * (T.R - d); c.z += dz * (T.R - d); }
    const v = collideWall(c, dx, dz, dt, tr);
    if (v > hit) { hit = v; nx = dx; nz = dz; }
  }
  // the barriers: kept within the half width of the line
  if (tr) {
    c.idx = tr.nearest(c.x, c.z, c.idx, 24);
    const p = tr.pts[c.idx], lat = tr.lateral(c.idx, c.x, c.z), lim2 = p.hw;
    if (Math.abs(lat) > lim2) {
      const s = Math.sign(lat);
      c.x -= p.sx * (lat - s * lim2); c.z -= p.sz * (lat - s * lim2);
      const v = collideWall(c, -p.sx * s, -p.sz * s, dt, tr);
      if (v > hit) { hit = v; nx = -p.sx * s; nz = -p.sz * s; }
    }
  }
  if (hit > .6 && c.bonkT <= 0) { c.bonkT = .25; ev.push({ kind: 'bump', v: hit }); }
  if (hit > fallV && c.fall < 0) throwOff(c, ev, nx, nz);
  // ---- up and down: the kerbs make it hop ----
  const g = groundY(c.x, c.z);
  if (c.y > g + .004 || c.vy > 0) {
    c.vy -= 9.8 * dt; c.y += c.vy * dt;
    if (c.y <= g) { if (c.vy < -1) ev.push({ kind: 'land', v: -c.vy }); c.y = g; c.vy = 0; }
  } else if (g > c.y + .03) {
    // up a kerb: a jolt, a hop
    const s2 = speedOf(c);
    c.y = g; c.vy = Math.min(1.4, s2 * .16);
    c.vx *= .86; c.vz *= .86;
    ev.push({ kind: 'kerb', v: s2 });
  } else c.y = g;
  if (!Number.isFinite(c.x) || !Number.isFinite(c.z) || !Number.isFinite(c.vx) || !Number.isFinite(c.vz) || !Number.isFinite(c.yaw)) {
    c.x = ox; c.z = oz; c.vx = c.vz = 0; c.yaw = Number.isFinite(c.yaw) ? c.yaw : 0;
  }
  return ev;
}

// against a wall of normal (nx, nz) pointing out of it: the speed into it bounced off a little,
// the speed along it kept (a cart slides along a barrier, never pinned to it); returns the speed into it
function collideWall(c, nx, nz, dt = 0, tr = null) {
  // nose into the wall: the casters swing it round along the wall, the way the course goes
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), into = -(fx * nx + fz * nz);
  if (c.fall < 0 && into > .05 && dt > 0) {
    let tx = -nz, tz = nx;
    const p = tr?.pts[c.idx], rx = p ? p.tx : fx, rz = p ? p.tz : fz;
    if (tx * rx + tz * rz < 0) { tx = -tx; tz = -tz; }
    const d = wrap(Math.atan2(tx, tz) - c.yaw);
    c.yaw = wrap(c.yaw + clamp(d, -1, 1) * Math.min(1, dt * (1.5 + 3 * into)));
  }
  const vn = c.vx * nx + c.vz * nz;
  if (vn >= 0) return 0;
  c.vx -= nx * vn * 1.25; c.vz -= nz * vn * 1.25;
  // a scrape along it costs a little, by how hard it hit
  const k = 1 - Math.min(.3, -vn * .05);
  c.vx *= k; c.vz *= k;
  return -vn;
}

// the rider goes flying: forwards, the way the cart was going
export function throwOff(c, ev, nx = 0, nz = 0) {
  if (c.fall >= 0) return;
  c.fall = 0; c.fallN++; c.drift = 0; c.kick = 0; c.combo = 0;
  c.spin = (Math.sin(c.fallN * 12.9898 + c.ph) > 0 ? 1 : -1) * (2 + Math.min(4, speedOf(c)));
  ev?.push({ kind: 'fall', nx, nz });
}

// two carts touching: each client moves only its own (mine(c)), eased apart
export function collideCarts(p, q, mineP, mineQ, dt, ev = []) {
  const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), R2 = TUNE.R * 2;
  if (d >= R2 || d < 1e-5) return ev;
  const nx = dx / d, nz = dz / d;
  const push = mineP && mineQ ? (R2 - d) / 2 : Math.min(R2 - d, dt * 2.5);
  const rel = (p.vx - q.vx) * nx + (p.vz - q.vz) * nz;   // closing speed
  if (mineP) { p.x -= nx * push; p.z -= nz * push; }
  if (mineQ) { q.x += nx * push; q.z += nz * push; }
  if (rel > 0) {
    // an even trade of the speeds along the hit, a little lost
    if (mineP) { p.vx -= nx * rel * .85; p.vz -= nz * rel * .85; }
    if (mineQ) { q.vx += nx * rel * .85; q.vz += nz * rel * .85; }
    if (rel > .8) ev.push({ kind: 'clash', p, q, v: rel });
    // hard enough: the one who was hit falls (the slower of the two along the hit)
    if (rel > TUNE.FALL_CART) {
      const pv = p.vx * nx + p.vz * nz, qv = -(q.vx * nx + q.vz * nz);
      const victim = pv < qv ? p : q;
      if ((victim === p && mineP) || (victim === q && mineQ)) throwOff(victim, ev, victim === p ? -nx : nx, victim === p ? -nz : nz);
    }
  }
  return ev;
}

// ---------- the bots ----------
// the keys a bot presses: follow its lane ahead, drift the hard corners, kick in rhythm (mostly)
export function botInput(c, tr, rnd = Math.random) {
  const inp = { steer: 0, kick: false, tap: false, brake: false, drift: false };
  if (c.fall >= 0) return inp;
  const sp = Math.hypot(c.vx, c.vz);
  const look = Math.round((1.6 + sp * .35) / .25);
  const j = (c.idx + look) % tr.N, p = tr.pts[j];
  const lane = clamp(c.lane, -1, 1) * Math.max(0, p.hw - .55);
  const tx = p.x + p.sx * lane, tz = p.z + p.sz * lane;
  const want = Math.atan2(tx - c.x, tz - c.z);
  const d = wrap(want - c.yaw);
  const bend = tr.pts[c.idx].curve;
  inp.steer = clamp(d * 2.4, -1, 1);
  // a hard corner at speed: drift into it, counter-steer out
  if (c.drift) inp.drift = Math.abs(bend) > .35 && Math.abs(d) > .08;
  else inp.drift = Math.abs(bend) > .75 && sp > 4 && c.skill > .9 && Math.sign(bend) === Math.sign(d);
  if (c.drift && d * c.drift < -.25) inp.steer = -c.drift;   // swung too far: catch it
  // too fast for the bend ahead: a foot down
  const safe = 7.5 - Math.abs(bend) * 3.2 - Math.abs(d) * 2;
  if (sp > safe + .6 && !c.drift) inp.brake = true;
  else if (sp < safe) {
    inp.kick = true;
    // in rhythm, most of the time (the better the bot, the more often): decided once a kick
    if (c.kick > 0) c.rhythm = null;
    else { c.rhythm ??= rnd() < c.skill * .8; inp.tap = c.rhythm && c.since > .06 && c.since < .16; }
  }
  return inp;
}

// ---------- progress round the course ----------
// the checkpoints in order; a lap is all of them. Returns 'cp' | 'lap' | 'done' | null
export function trackProgress(c, tr, laps, dt) {
  const N = tr.N;
  let dk = c.idx - (((c.k % N) + N) % N);
  if (dk > N / 2) dk -= N; if (dk < -N / 2) dk += N;
  c.k += dk;
  const sp = Math.hypot(c.vx, c.vz), p = tr.pts[c.idx];
  const back = c.vx * p.tx + c.vz * p.tz < -.5 && sp > .8;
  c.wrongT = back ? c.wrongT + dt : Math.max(0, c.wrongT - dt * 2);
  if (c.done) return null;
  let out = null;
  const per = tr.cps.length;
  while (c.k >= Math.floor(c.cp / per) * N + tr.cps[c.cp % per]) {
    c.cp++;
    out = 'cp';
    if (c.cp % per === 0) {
      c.laps = c.cp / per;
      out = 'lap';
      if (c.laps >= laps) { c.done = true; return 'done'; }
    }
  }
  return out;
}

// ---------- a watermelon rolling on the square ----------
export function stepMelon(m, dt, env) {
  const sp = Math.hypot(m.vx, m.vz);
  if (sp > 0) { const k = Math.max(0, 1 - .9 * dt / sp); m.vx *= k; m.vz *= k; }
  m.x += m.vx * dt; m.z += m.vz * dt; m.roll += sp * dt / .17;
  for (const b of env.solids || []) {
    const px = clamp(m.x, b.x0, b.x1), pz = clamp(m.z, b.z0, b.z1), dx = m.x - px, dz = m.z - pz, d = Math.hypot(dx, dz);
    if (d < .17 && d > 1e-6) { const nx = dx / d, nz = dz / d, vn = m.vx * nx + m.vz * nz; m.x += nx * (.17 - d); m.z += nz * (.17 - d); if (vn < 0) { m.vx -= nx * vn * 1.6; m.vz -= nz * vn * 1.6; } }
  }
  const tr = env.track;
  if (tr) {
    m.idx = tr.nearest(m.x, m.z, m.idx ?? -1, 24);
    const p = tr.pts[m.idx], lat = tr.lateral(m.idx, m.x, m.z);
    if (Math.abs(lat) > p.hw + .2) { const s = Math.sign(lat), vn = (m.vx * p.sx + m.vz * p.sz) * s; m.x -= p.sx * (lat - s * (p.hw + .2)); m.z -= p.sz * (lat - s * (p.hw + .2)); if (vn > 0) { m.vx -= p.sx * s * vn * 1.6; m.vz -= p.sz * s * vn * 1.6; } }
  }
  m.age += dt;
}

// ---------- the rider thrown off: a body flying, bouncing, rolling to a stop ----------
// b: { x, y, z, vx, vy, vz }; kept out of the props, inside the barriers, never under the ground
export const BODY_R = .3;
export function stepBody(b, dt, env) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vz, b.vy) * dt / .1));
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    b.vy -= 9.8 * h;
    b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    const g = groundY(b.x, b.z);
    if (b.y <= g) {
      b.y = g;
      b.vy = b.vy < -1.5 ? -b.vy * .3 : 0;
      // on the paving, on the grass: it rolls and scrapes to a stop
      const sp = Math.hypot(b.vx, b.vz), k = sp > 1e-6 ? Math.max(0, sp - (3 + 4 * sp) * h) / sp : 0;
      b.vx *= k; b.vz *= k;
    }
    pushOut(b, env, BODY_R, .35);
  }
}
// out of every prop and back inside the barriers (bouncing off them); true if it had to move
export function pushOut(b, env, r = BODY_R, bounce = 0) {
  let moved = false;
  for (const w of env.solids || []) {
    if (b.x < w.x0 - r || b.x > w.x1 + r || b.z < w.z0 - r || b.z > w.z1 + r) continue;
    const px = clamp(b.x, w.x0, w.x1), pz = clamp(b.z, w.z0, w.z1);
    let dx = b.x - px, dz = b.z - pz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-6) {
      const o = [[b.x - w.x0, -1, 0], [w.x1 - b.x, 1, 0], [b.z - w.z0, 0, -1], [w.z1 - b.z, 0, 1]].sort((p, q) => p[0] - q[0])[0];
      dx = o[1]; dz = o[2]; b.x += dx * (o[0] + r); b.z += dz * (o[0] + r);
    } else { dx /= d; dz /= d; b.x += dx * (r - d); b.z += dz * (r - d); }
    const vn = (b.vx || 0) * dx + (b.vz || 0) * dz;
    if (vn < 0 && b.vx != null) { b.vx -= dx * vn * (1 + bounce); b.vz -= dz * vn * (1 + bounce); }
    moved = true;
  }
  const tr = env.track;
  if (tr) {
    b.idx = tr.nearest(b.x, b.z, b.idx ?? -1, 30);
    const p = tr.pts[b.idx], lat = tr.lateral(b.idx, b.x, b.z), lim = p.hw + .2;
    if (Math.abs(lat) > lim) {
      const s = Math.sign(lat);
      b.x -= p.sx * (lat - s * lim); b.z -= p.sz * (lat - s * lim);
      const vn = ((b.vx || 0) * p.sx + (b.vz || 0) * p.sz) * s;
      if (vn > 0 && b.vx != null) { b.vx -= p.sx * s * vn * (1 + bounce); b.vz -= p.sz * s * vn * (1 + bounce); }
      moved = true;
    }
  }
  if (b.y != null) b.y = Math.max(b.y, groundY(b.x, b.z));
  return moved;
}

// a step split so no part goes further than a third of the cart: nothing tunnels through a barrier
export function stepCartSub(c, inp, dt, env, ev = []) {
  const n = Math.max(1, Math.min(8, Math.ceil(Math.hypot(c.vx, c.vz) * dt / (TUNE.R * .35))));
  for (let s = 0; s < n; s++) stepCart(c, s ? { ...inp, tap: false } : inp, dt / n, env, ev);
  return ev;
}
