// spaceshooter-level.js, the levels of "comète furieuse": their look, their scripts (who comes when), and the paths.
// Everything here is a pure function of the seed and of time, so every client flies the same enemies.
import { rng } from './arcade-art.js';

const W = 320, H = 180;
export const SCROLL = 40;
export const LEVELS = [
  { name: 'orbite lunaire', sky: '#05060f', back: 'earth' },
  { name: 'ceinture de cailloux', sky: '#0a0710', back: 'moon' },
  { name: 'le crabe de fer', sky: '#12050a', boss: true, nebula: 'rgba(120,20,30,.35)' },
  { name: 'canyon lunaire', sky: '#070a14', floor: true },
  { name: 'champ de mines', sky: '#060d10', nebula: 'rgba(20,90,90,.3)' },
  { name: "l'oeil du vide", sky: '#0d0512', boss: true, nebula: 'rgba(120,30,110,.35)' },
  { name: "l'armada", sky: '#05070f', back: 'earth', nebula: 'rgba(30,50,120,.3)' },
  { name: 'la reine comete', sky: '#030a0c', boss: true, nebula: 'rgba(20,110,90,.35)' },
];
// the canyon's floor, in world x (the level scrolls at SCROLL px/s)
export const floorAt = (wx) => H - 26 - 12 * Math.sin(wx * .013) - 7 * Math.sin(wx * .031 + 1) - 10 * Math.max(0, Math.sin(wx * .0045 + 2));

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const lissa = (t) => ({ x: W * .6 + 95 * Math.sin(t * .55), y: H / 2 + 58 * Math.sin(t * 1.1) });
function wormAt(a) {
  const l = lissa(a), k = ease(a / 3);
  return { x: W + 30 + (l.x - W - 30) * k, y: H / 2 + (l.y - H / 2) * k };
}
const off = (x, y, m = 16) => x < -m || x > W + m + 40 || y < -m - 20 || y > H + m + 20;

// where an enemy is at its age (its parent's position for the parts of a boss); null once it has left
export function pathOf(e, parent, lvT) {
  const a = e.age, p = e.p;
  switch (e.k) {
    case 'drone': case 'seg': { const x = W + 8 - p.sp * a, y = p.y0 + p.amp * Math.sin(a * p.fr + p.ph); return x < -12 ? null : { x, y, w: 8, h: 7 }; }
    case 'dart': { const x = W + 8 - p.sp * a, y = p.y0 + p.dy * a; return off(x, y) ? null : { x, y, w: 8, h: 6 }; }
    case 'diver': {
      if (a < p.t1) return { x: W + 8 - (W + 8 - p.x0) * ease(a / p.t1), y: p.y0, w: 10, h: 7 };
      const t = a - p.t1, x = p.x0 + p.vx * t, y = p.y0 + p.vy * t;
      return off(x, y) ? null : { x, y, w: 10, h: 7 };
    }
    case 'zig': {
      const x = W + 8 - p.sp * a, ph = (a / p.per) % 1, tri = ph < .5 ? ph * 4 - 1 : 3 - ph * 4;
      return x < -12 ? null : { x, y: p.y0 + p.amp * tri, w: 10, h: 7 };
    }
    case 'bat': {
      const t = a / p.dur;
      if (t > 1) return null;
      const u = 1 - t, x = u * u * (W + 10) + 2 * u * t * p.x1 + t * t * -14, y = u * u * p.y0 + 2 * u * t * p.y1 + t * t * p.y2;
      return { x, y, w: 10, h: 6 };
    }
    case 'mine': { const x = W + 8 - p.sp * a; return x < -12 ? null : { x, y: p.y0 + 6 * Math.sin(a * 1.5 + p.y0), w: 7, h: 7 }; }
    case 'turret': { const x = p.wx - lvT * SCROLL; return x < -12 ? null : { x, y: floorAt(p.wx) - 2, w: 8, h: 6 }; }
    case 'rock': {
      const x = (p.free ? p.x0 : W + 14) + p.vx * a, y = p.y0 + p.vy * a, s = p.s * 2 + 2;
      return off(x, y) ? null : { x, y, w: s - 4, h: s - 4 };
    }
    case 'carrier': {
      const x = a < 4 ? W + 20 - 70 * ease(a / 4) : a < 16 ? W - 50 : W - 50 - 30 * (a - 16);
      return x < -30 ? null : { x, y: p.y0 + 12 * Math.sin(a * .6), w: 24, h: 10 };
    }
    // the bosses and their parts
    case 'crab': return { x: W + 40 - 110 * ease(a / 3), y: H / 2 + 34 * Math.sin(a * .5) + 8 * Math.sin(a * 1.7), w: 40, h: 34 };
    case 'claw': return parent ? { x: parent.x - 24, y: parent.y + p.side * 24 + 3 * Math.sin(a * 3), w: 14, h: 9 } : null;
    case 'eye': return { x: W + 40 - 110 * ease(a / 3), y: H / 2 + 40 * Math.sin(a * .35), w: 30, h: 30 };
    case 'pod': { if (!parent) return null; const t = a * 1.1 + p.n * Math.PI / 2; return { x: parent.x + Math.cos(t) * 34, y: parent.y + Math.sin(t) * 34, w: 8, h: 8 }; }
    case 'head': { const q = wormAt(a); return { ...q, w: 16, h: 13 }; }
    case 'wseg': { if (!parent) return null; const q = wormAt(Math.max(0, a - (p.n + 1) * .17)); return { ...q, w: 8, h: 7 }; }
  }
  return null;
}

// the script of a level: [{ at, list: [{ id, k, p, hp, pts, g, age0, boss, part, shield }] }], sorted by time
export function buildScript(seed, l, loop) {
  const R = rng(seed), ev = [];
  let id = 0, g = 0;
  const at = (t, list) => { ev.push({ at: t, list }); return list; };
  const one = (k, p, hp, pts, x = {}) => ({ id: ++id, k, p, hp, pts, ...x });
  const rand = (a, b) => a + R() * (b - a);
  // a line of drones riding a sine
  const line = (t, n = 6, y0 = rand(35, H - 35), amp = rand(12, 34)) => { const gg = ++g, fr = rand(1.8, 3), ph = R() * 6; at(t, Array.from({ length: n }, (_, k) => one('drone', { y0, amp, fr, ph, sp: 62 }, 1, 100, { g: gg, age0: -k * .32 }))); };
  // darts in a V
  const vee = (t, y0 = rand(40, H - 40)) => { const gg = ++g; at(t, [0, 1, -1, 2, -2].map((k) => one('dart', { y0: y0 + k * 10, dy: 0, sp: 130 }, 1, 100, { g: gg, age0: -Math.abs(k) * .12 }))); };
  const divers = (t, n = 3) => at(t, Array.from({ length: n }, (_, k) => {
    const y0 = rand(25, H - 25), x0 = rand(W * .45, W * .8), yT = rand(20, H - 20), sp = rand(110, 150), dx = -(x0 + 20), dy = yT - y0, d = Math.hypot(dx, dy);
    return one('diver', { y0, x0, t1: 1.3, vx: dx / d * sp, vy: dy / d * sp }, 3, 200, { age0: -k * .5 });
  }));
  const zigs = (t, n = 4, y0 = rand(40, H - 40)) => { const gg = ++g; at(t, Array.from({ length: n }, (_, k) => one('zig', { y0, amp: 30, per: 2.2, sp: 70 }, 2, 200, { g: gg, age0: -k * .45 }))); };
  const bats = (t, n = 4) => { const top = R() < .5; at(t, Array.from({ length: n }, (_, k) => one('bat', { y0: top ? -8 : H + 8, x1: rand(90, 180), y1: top ? H + 30 : -30, y2: top ? -10 : H + 10, dur: 4.2 }, 2, 150, { age0: -k * .35 }))); };
  const rock = (t, big = R() < .35) => at(t, [one('rock', { s: big ? 10 : 6, y0: rand(20, H - 20), vx: -rand(35, 70), vy: rand(-12, 12), spin: rand(-1.5, 1.5) }, big ? 8 : 2, big ? 200 : 50)]);
  const mines = (t, n = 4) => at(t, Array.from({ length: n }, (_, k) => one('mine', { y0: 24 + (H - 48) * (k + R() * .5) / n, sp: 26 }, 3, 150, { age0: -R() * 2 })));
  const turrets = (t, n = 3) => at(t, Array.from({ length: n }, (_, k) => one('turret', { wx: t * SCROLL + W + 8 + k * rand(50, 90) }, 4, 300)));
  const carrier = (t, y0 = rand(50, H - 50)) => at(t, [one('carrier', { y0 }, 40, 1500)]);
  const snake = (t, n = 10, y0 = rand(45, H - 45)) => { const gg = ++g, fr = rand(2, 3), ph = R() * 6; at(t, Array.from({ length: n }, (_, k) => one('seg', { y0, amp: 40, fr, ph, sp: 58 }, k ? 2 : 4, 150, { g: gg, age0: -k * .13 }))); };
  const hp = 1 + loop * .25;
  switch (l) {
    case 0:
      line(1, 5, 60); line(5, 5, 120); vee(9); line(12, 6, 50); line(13.5, 6, 130); divers(17, 3); line(21); vee(24); vee(25.5);
      divers(28, 4); line(31, 7, 70, 40); vee(34); rock(36, true); rock(37); line(39); line(40.5); divers(43, 3); vee(46); line(48, 8, H / 2, 50);
      break;
    case 1:
      for (let t = 1; t < 46; t += rand(.8, 1.6)) rock(t);
      divers(7, 3); zigs(11); line(15); divers(19, 4); zigs(23, 5); carrier(27); vee(33); zigs(37); divers(41, 4); line(44);
      break;
    case 2: {
      line(1, 6, 60); line(3, 6, 120);
      const c = one('crab', {}, 260 * hp, 25000, { boss: true });
      at(8, [c, one('claw', { side: -1 }, 50 * hp, 3000, { part: c.id }), one('claw', { side: 1 }, 50 * hp, 3000, { part: c.id })]);
      break;
    }
    case 3:
      for (let t = 2; t < 46; t += rand(3, 5)) turrets(t, 1 + Math.floor(R() * 3));
      line(3, 6, 40, 16); bats(8); line(13, 6, 45, 20); bats(18, 5); divers(22, 3); bats(27); line(31, 7, 40, 18); bats(35, 6); zigs(39, 4, 50); bats(43, 5);
      break;
    case 4:
      for (let t = 1; t < 44; t += 6) mines(t, 3 + Math.floor(R() * 3));
      zigs(4); vee(8); zigs(12, 5); divers(16, 3); vee(20); vee(21); zigs(25); line(29); carrier(33); zigs(38, 6); vee(42);
      break;
    case 5: {
      line(1, 6, 50); vee(3);
      const e = one('eye', {}, 300 * hp, 30000, { boss: true, shield: true });
      at(7, [e, ...[0, 1, 2, 3].map((n) => one('pod', { n }, 40 * hp, 2000, { part: e.id }))]);
      break;
    }
    case 6:
      carrier(2, 50); snake(5); vee(9); divers(12, 4); carrier(15, 130); snake(18, 12); vee(22); vee(23); zigs(26, 5);
      carrier(29, 90); snake(32, 12); divers(36, 5); line(39); line(40); snake(43, 14); vee(46);
      break;
    case 7: {
      bats(1, 5);
      const h = one('head', {}, 380 * hp, 40000, { boss: true });
      at(6, [h, ...Array.from({ length: 12 }, (_, n) => one('wseg', { n }, 25 * hp, 500, { part: h.id }))]);
      break;
    }
  }
  return ev.sort((a, b) => a.at - b.at);
}
