// terrain.js, the garden plot as a column of voxels: 16 m wide, 100 m deep.
// Chunked meshes, rebuilt only where the shovel touched.
import * as THREE from 'three';
import { patchSkyLight } from './skylight.js';

export const S = 0.4;                       // one voxel, 40 cm
export const NX = 40, NZ = 40;              // 16 m x 16 m, depth per world
const CX = 20, CY = 10, CZ = 20;

export const AIR = 0, GRASS = 1, DIRT = 2, CLAY = 3, STONE = 4, GRANITE = 5, BASALT = 6, OBSIDIAN = 7, BEDROCK = 8;
export const LOESS = 9, REDCLAY = 10, LIMESTONE = 11, MARBLE = 12, JADEROCK = 13, CGRASS = 14, WATER = 15;
// the deep: ids above the ore range (ores are 20..99)
export const CRUST = 100, MANTLE = 101, MANTLE2 = 102, OUTERCORE = 103, INNERCORE = 104, LAVA = 105;
export const REGOLITH = 106, MOONBASALT = 107, ANORTHOSITE = 108, MOONMANTLE = 109, MOONCORE = 110;
export const MARSDUST = 111, MARSBASALT = 112, MARSIRON = 113, MARSMANTLE = 114, MARSCORE = 115;

// the two gardens. `to` is the depth (m) where a layer ends.
export const THEMES = {
  home: {
    ny: 1000, grass: GRASS, chamber: true, water: 14, caves: true, lava: 30, core: true,
    layers: [
      { id: DIRT,     name: 'terre',      sub: 'meuble, facile',           to: 8,   hard: 1, color: 0x7a5230 },
      { id: CLAY,     name: 'argile',     sub: 'il faut une pelle en fer', to: 20,  hard: 2, color: 0x9c5a36 },
      { id: STONE,    name: 'roche',      sub: 'là, ça résiste',           to: 40,  hard: 3, color: 0x77746f },
      { id: GRANITE,  name: 'granit',     sub: 'rose et têtu',             to: 62,  hard: 4, color: 0x8d7a74 },
      { id: BASALT,   name: 'basalte',    sub: 'noir, froid, ancien',      to: 85,  hard: 5, color: 0x3c3c43 },
      { id: OBSIDIAN, name: 'obsidienne', sub: 'presque au fond',          to: 100, hard: 6, color: 0x231a2e },
      { id: CRUST,     name: 'croûte profonde', sub: 'des cavernes, et plus rien de vivant', to: 170, hard: 6, color: 0x3a3038 },
      { id: MANTLE,    name: 'manteau',         sub: 'la roche est chaude',     to: 270, hard: 7, color: 0x8a3e22 },
      { id: MANTLE2,   name: 'manteau profond', sub: 'la lave coule partout',   to: 350, hard: 7, color: 0x5e2216 },
      { id: OUTERCORE, name: 'noyau externe',   sub: 'du fer en fusion',        to: 390, hard: 7, color: 0xb85a1c },
      { id: INNERCORE, name: 'noyau interne',   sub: 'le centre de la terre',   to: 400, hard: 7, color: 0xe8c890 },
    ],
    // what's worth digging for. min/max in metres, w = how common inside that band.
    ores: [
      { id: 20, name: 'cuivre',  value: 4,   min: 0.8, max: 32, w: 10,  color: 0xd4773a },
      { id: 21, name: 'fer',     value: 10,  min: 7,   max: 48, w: 8,   color: 0xc9b3a0 },
      { id: 22, name: 'argent',  value: 26,  min: 20,  max: 68, w: 6,   color: 0xe8eef5 },
      { id: 23, name: 'or',      value: 65,  min: 36,  max: 88, w: 5,   color: 0xffc629 },
      { id: 24, name: 'rubis',   value: 150, min: 56,  max: 99, w: 4,   color: 0xe4183a },
      { id: 25, name: 'diamant', value: 380, min: 74,  max: 99, w: 3,   color: 0x7af4ff },
      { id: 26, name: 'fossile', value: 240, min: 12,  max: 160, w: 0.7, color: 0xf3ead0 },
      { id: 46, name: 'platine',        value: 900,   min: 105, max: 260, w: 6,  color: 0xd8dde6 },
      { id: 47, name: 'magmatite',      value: 1500,  min: 180, max: 360, w: 5,  color: 0xff6a1a },
      { id: 49, name: 'diamant noir',   value: 4000,  min: 250, max: 395, w: 2,  color: 0x2a2a44 },
      { id: 48, name: 'cristal du noyau', value: 12000, min: 380, max: 399, w: 1.5, color: 0xfff0a0 },
    ],
    // the previous owner's tin boxes, one letter in each
    letters: [{ id: 27, depth: 30 }, { id: 28, depth: 60 }, { id: 29, depth: 90 }],
  },
  // the moon: a ball of voxels, layers counted inward from its surface
  moon: {
    sphere: true, n: 220, ny: 220, radius: 40, grass: -1, chamber: false, water: 0,
    craters: 60, craterSize: [2.5, 9], bump: 3,
    layers: [
      { id: REGOLITH,    name: 'régolithe',        sub: 'la poussière de lune',        to: 4,   hard: 1, color: 0xb8b4ac },
      { id: MOONBASALT,  name: 'basalte lunaire',  sub: 'une mer sombre, figée',        to: 14,  hard: 3, color: 0x5e5c5a },
      { id: ANORTHOSITE, name: 'anorthosite',      sub: 'la croûte blanche',           to: 26,  hard: 4, color: 0xd8d4c8 },
      { id: MOONMANTLE,  name: 'manteau lunaire',  sub: 'plus lourd, plus sombre',     to: 35,  hard: 5, color: 0x6a5a4a },
      { id: MOONCORE,    name: 'noyau de fer',     sub: 'le cœur de la lune',          to: 41,  hard: 6, color: 0x8a8a92 },
    ],
    ores: [
      { id: 50, name: 'glace lunaire',   value: 500,  min: .3, max: 12,   w: 8, color: 0xc8f0ff },
      { id: 51, name: 'hélium-3',        value: 1500, min: 2,  max: 26,   w: 6, color: 0x8affc8 },
      { id: 52, name: 'titane',          value: 900,  min: 5,  max: 32,   w: 6, color: 0xa8b4c8 },
      { id: 54, name: 'cristal lunaire', value: 3000, min: 22, max: 40,   w: 3, color: 0xd0a0ff },
      { id: 53, name: 'météorite',       value: 6000, min: 0,  max: 40,   w: .5, color: 0x3a2a24 },
    ],
    letters: [],
  },
  // mars: bigger again, red dust over dark basalt and rusty rock
  mars: {
    sphere: true, n: 280, ny: 280, radius: 50, grass: -1, chamber: false, water: 0,
    craters: 45, craterSize: [3, 12], bump: 5,
    layers: [
      { id: MARSDUST,   name: 'poussière rouge',  sub: 'de l\'oxyde de fer, partout',  to: 3,   hard: 1, color: 0xc4663c },
      { id: MARSBASALT, name: 'basalte martien',  sub: 'les laves d\'Olympus Mons',    to: 14,  hard: 4, color: 0x6a3426 },
      { id: MARSIRON,   name: 'roche ferreuse',   sub: 'rouillée jusqu\'au cœur',       to: 28,  hard: 5, color: 0x9a4a2e },
      { id: MARSMANTLE, name: 'manteau martien',  sub: 'froid, dense, silencieux',     to: 42,  hard: 6, color: 0x5a2a22 },
      { id: MARSCORE,   name: 'noyau de mars',    sub: 'fer et soufre',                to: 51,  hard: 7, color: 0x8a6a3a },
    ],
    ores: [
      { id: 55, name: 'glace martienne', value: 800,   min: .3, max: 10, w: 8, color: 0xe8f4ff },
      { id: 56, name: 'olivine',         value: 1400,  min: 2,  max: 30, w: 6, color: 0x8ac04a },
      { id: 57, name: 'hématite',        value: 2200,  min: 6,  max: 40, w: 5, color: 0x5a5a66 },
      { id: 58, name: 'opale de mars',   value: 5000,  min: 18, max: 50, w: 2.5, color: 0xff8ac8 },
      { id: 59, name: 'fossile martien', value: 15000, min: 25, max: 50, w: .4, color: 0xf0e0b0 },
    ],
    letters: [],
  },
  china: {
    // as deep as home: under the jade, the same crust, mantle and core, all the way down
    ny: 1000, grass: CGRASS, chamber: false, water: 7, caves: true, lava: 30, core: true,
    layers: [
      { id: LOESS,     name: 'kuroboku',      sub: 'la terre noire des volcans',           to: 6,  hard: 3, color: 0xc9a25c },
      { id: REDCLAY,   name: 'argile rouge',  sub: 'celle des potiers',          to: 18, hard: 4, color: 0xa4452c },
      { id: LIMESTONE, name: 'calcaire',      sub: 'pâle et friable, en apparence', to: 32, hard: 5, color: 0xcfc6ae },
      { id: MARBLE,    name: 'marbre',        sub: 'veiné, froid',               to: 46, hard: 6, color: 0xe6e2da },
      { id: JADEROCK,  name: 'roche de jade', sub: 'seule la pelle en jade passe', to: 75, hard: 7, color: 0x3f7a5c },
      { id: CRUST,     name: 'croûte profonde', sub: 'des cavernes, et plus rien de vivant', to: 170, hard: 6, color: 0x3a3038 },
      { id: MANTLE,    name: 'manteau',         sub: 'la roche est chaude',     to: 270, hard: 7, color: 0x8a3e22 },
      { id: MANTLE2,   name: 'manteau profond', sub: 'la lave coule partout',   to: 350, hard: 7, color: 0x5e2216 },
      { id: OUTERCORE, name: 'noyau externe',   sub: 'du fer en fusion',        to: 390, hard: 7, color: 0xb85a1c },
      { id: INNERCORE, name: 'noyau interne',   sub: 'le centre de la terre',   to: 400, hard: 7, color: 0xe8c890 },
    ],
    ores: [
      { id: 40, name: 'jade',            value: 300,  min: 0.8, max: 40, w: 10, color: 0x39c07a },
      { id: 41, name: 'porcelaine d\'Arita', value: 450,  min: 4,   max: 50, w: 7,  color: 0xdfe9ff },
      { id: 42, name: 'dōtaku de bronze', value: 620,  min: 12,  max: 59, w: 6,  color: 0xb07a3a },
      { id: 43, name: 'perle noire',     value: 900,  min: 24,  max: 59, w: 4,  color: 0x2a2a3a },
      { id: 44, name: 'haniwa', value: 1400, min: 30, max: 59, w: 2.5, color: 0xc0643a },
      { id: 45, name: 'œuf de dragon',   value: 6000, min: 50,  max: 59, w: 0.5, color: 0xff3b2f },
      // deeper down, the same treasures as under home
      { id: 46, name: 'platine',        value: 900,   min: 105, max: 260, w: 6,  color: 0xd8dde6 },
      { id: 47, name: 'magmatite',      value: 1500,  min: 180, max: 360, w: 5,  color: 0xff6a1a },
      { id: 49, name: 'diamant noir',   value: 4000,  min: 250, max: 395, w: 2,  color: 0x2a2a44 },
      { id: 48, name: 'cristal du noyau', value: 12000, min: 380, max: 399, w: 1.5, color: 0xfff0a0 },
    ],
    letters: [],
  },
};

const COLOR = { [GRASS]: 0x6b9a38, [CGRASS]: 0x8fae4a, [BEDROCK]: 0x0c0c0e, [WATER]: 0x3f8fc0, [LAVA]: 0xff5a10 };
export const ORE = {};
for (const t of Object.values(THEMES)) {
  for (const l of t.layers) COLOR[l.id] = l.color;
  for (const o of t.ores) { ORE[o.id] = o; COLOR[o.id] = o.color; }
}
for (const [n, id] of [27, 28, 29].entries()) { ORE[id] = { id, name: 'boîte en fer', value: 0, letter: n + 2, color: 0x4fb3a9 }; COLOR[id] = 0x4fb3a9; }
export const isOre = (m) => m >= 20 && m < 100;
export const isLiquid = (m) => m === WATER || m === LAVA;
// the lawn on top of the plots follows the seasons
export function setGrassColors(home, china) { COLOR[GRASS] = home; COLOR[CGRASS] = china; }
export const isLetter = (m) => m >= 27 && m <= 29;
export const LAYERS = THEMES.home.layers;

// ---------- tiny deterministic noise ----------
function hash3(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vnoiseG(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
           l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

export function createTerrain(scene, { theme = 'home', seed = 1337, ox = 0, oy = 0, oz = 0 } = {}) {
  const T = THEMES[theme];
  const NX = T.n || 40, NZ = T.n || 40;
  const NY = T.ny, LAYERS = T.layers, ORES = T.ores;
  const X0 = ox - NX * S / 2, Z0 = oz - NZ * S / 2, Y0 = T.sphere ? oy - NY * S / 2 : -NY * S;
  const NCX = NX / CX, NCY = NY / CY, NCZ = NZ / CZ;
  const layerAt = (depth) => { for (const l of LAYERS) if (depth < l.to) return l; return LAYERS[LAYERS.length - 1]; };
  // a planet's voxels are only allocated when it is first visited (see ensure)
  let vox = new Uint8Array(T.sphere ? 1 : NX * NY * NZ);
  const idx = (i, j, k) => i + NX * (k + NZ * j);
  // how hard each voxel is, frozen at generation (ores take their layer's)
  let hardOf = new Uint8Array(T.sphere ? 1 : NX * NY * NZ);
  // paint (the paint mini-game): a team per voxel, 0 = bare ground. Only the colour changes.
  const paint = new Uint8Array(T.sphere ? 1 : NX * NY * NZ);   // the paint game is played on the plots only
  const painted = new Set();
  const paintDirty = new Set();
  let paintColors = [0];

  const depthOfJ = (j) => (NY - 1 - j) * S + S / 2;    // centre depth, metres
  const CHAMBER_J = NY - 1 - Math.round(97.2 / S);        // the heart's hall, 97 m down

  // the moon: distance to the centre decides everything, craters bite into the surface
  function generateSphere() {
    const rnd = mulberry(seed);
    const c = NX / 2, R = T.radius / S;
    const [c0, c1] = T.craterSize || [1.4, 4];
    const craters = Array.from({ length: T.craters || 14 }, () => {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      const r = (c0 + rnd() * (c1 - c0)) / S;
      return { x: c + v.x * (R + r * .55), y: c + v.y * (R + r * .55), z: c + v.z * (R + r * .55), r, r2: r * r };
    });
    const B = (T.bump || 2.4) + 1;                                   // the two lump layers together
    const deepest = Math.max(...craters.map(q => q.r * .45)) + 1;     // no crater reaches below this
    // layer and ore choices, looked up by depth in 5 cm steps rather than searched per voxel
    const DB = 20, nB = Math.ceil((T.radius + 2) * DB) + 1;
    const layerB = [], oreB = [];
    for (let q = 0; q < nB; q++) {
      const d = q / DB;
      layerB.push(layerAt(d));
      const cands = ORES.filter(o => d >= o.min && d <= o.max);
      oreB.push({ cands, total: cands.reduce((a, o) => a + o.w, 0) });
    }
    // the arrays start as air: each row is only walked where it crosses the ball
    const RB2 = (R + B) * (R + B);
    for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) {
      const y = j + .5 - c, z = k + .5 - c, rest = RB2 - y * y - z * z;
      if (rest <= 0) continue;
      const half = Math.sqrt(rest), i0 = Math.max(0, Math.floor(c - half - .5)), i1 = Math.min(NX - 1, Math.ceil(c + half - .5));
      for (let i = i0; i <= i1; i++) {
      const x = i + .5 - c;
      const dist = Math.sqrt(x * x + y * y + z * z);
      const n = idx(i, j, k);
      if (dist > R + B) continue;
      // only the outer shell needs the lumps and the craters
      const shell = dist > R - Math.max(B, deepest);
      if (shell) {
        // the lumps only matter within a few voxels of the surface
        let cut = false;
        if (dist > R - B) { const bump = (vnoiseG(i * .12, j * .12, k * .12) - .5) * (T.bump || 2.4) + (vnoiseG(i * .03, j * .03, k * .03) - .5) * (T.bump || 2.4); cut = R + bump - dist < 0; }
        if (!cut && dist > R - deepest) for (const q of craters) { const dx = i + .5 - q.x, dy = j + .5 - q.y, dz = k + .5 - q.z; if (dx * dx + dy * dy + dz * dz < q.r2) { cut = true; break; } }
        if (cut) { vox[n] = AIR; hardOf[n] = 0; continue; }
      }
      const depth = Math.max(0, (R - dist) * S);
      const q = Math.min(nB - 1, (depth * DB) | 0);
      const l = layerB[q];
      vox[n] = l.id; hardOf[n] = l.hard;
      if (rnd() < .007 * (1 + depth / 5)) {
        const { cands, total } = oreB[q];
        if (cands.length) {
          let r = rnd() * total, ore = cands[0];
          for (const o of cands) { r -= o.w; if (r <= 0) { ore = o; break; } }
          vox[n] = ore.id;
        }
      }
      }
    }
  }

  function generate() {
    if (T.sphere) return generateSphere();
    const rnd = mulberry(seed);
    for (let j = 0; j < NY; j++) {
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const d = depthOfJ(j);
        // wavy boundaries so the layers don't read as a ruler
        const wob = (Math.sin(i * 0.37 + k * 0.21 + j * 0.05) + Math.sin(k * 0.43 - i * 0.17)) * 0.7;
        let l = layerAt(Math.max(0, d + wob));
        let m = l.id;
        if (j === NY - 1) m = T.grass;
        if (j === 0) m = BEDROCK;
        const n = idx(i, j, k);
        vox[n] = m;
        hardOf[n] = m === BEDROCK ? 99 : (m === T.grass ? l.hard : l.hard);
      }
    }
    // ore veins: little random walks, denser as you go down
    for (let j = 1; j < NY - 1; j++) {
      const d = depthOfJ(j);
      const cands = ORES.filter(o => d >= o.min && d <= o.max);
      if (!cands.length) continue;
      const tw = cands.reduce((a, o) => a + o.w, 0);
      const p = 0.0034 * (1 + d / 45);
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        if (rnd() > p) continue;
        let r = rnd() * tw, ore = cands[0];
        for (const o of cands) { r -= o.w; if (r <= 0) { ore = o; break; } }
        let ci = i, cj = j, ck = k;
        const len = 1 + Math.floor(rnd() * (ore.value >= 380 ? 3 : 5));
        for (let s = 0; s < len; s++) {
          if (ci >= 0 && ci < NX && ck >= 0 && ck < NZ && cj > 0 && cj < NY - 1) {
            const n = idx(ci, cj, ck);
            if (vox[n] && !isOre(vox[n])) vox[n] = ore.id;
          }
          const a = Math.floor(rnd() * 6);
          if (a === 0) ci++; else if (a === 1) ci--; else if (a === 2) cj++;
          else if (a === 3) cj--; else if (a === 4) ck++; else ck--;
        }
      }
    }
    // underground water: sealed pockets, until someone digs into one
    for (let w = 0; w < T.water; w++) {
      const d = 5 + rnd() * (Math.min(150, NY * S) - 20);
      const cj0 = NY - 1 - Math.round(d / S), ci0 = 4 + Math.floor(rnd() * 32), ck0 = 4 + Math.floor(rnd() * 32);
      const rx = 2 + rnd() * 3, ry = 1.5 + rnd() * 2, rz = 2 + rnd() * 3;
      for (let j = Math.max(15, cj0 - 5); j <= Math.min(NY - 4, cj0 + 5); j++)
        for (let k = Math.max(0, ck0 - 5); k <= Math.min(NZ - 1, ck0 + 5); k++)
          for (let i = Math.max(0, ci0 - 5); i <= Math.min(NX - 1, ci0 + 5); i++) {
            const dx = (i - ci0) / rx, dy = (j - cj0) / ry, dz = (k - ck0) / rz;
            if (dx * dx + dy * dy + dz * dz < 1) vox[idx(i, j, k)] = WATER;
          }
    }
    if (T.caves) carveCaves(rnd);
    // tin boxes: a 2x2x2 lump near the middle of the plot at each letter's depth
    for (const L of T.letters) {
      const j0 = NY - 1 - Math.round(L.depth / S);
      const i0 = 14 + Math.floor(rnd() * 10), k0 = 14 + Math.floor(rnd() * 10);
      for (let dj = 0; dj < 2; dj++) for (let dk = 0; dk < 2; dk++) for (let di = 0; di < 2; di++) vox[idx(i0 + di, j0 + dj, k0 + dk)] = L.id;
    }
    if (T.core) {
      // the centre of the Earth: a round hall at the very bottom
      const cy = 9;
      for (let j = 1; j < 20; j++) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const dx = i + .5 - NX / 2, dy = (j + .5 - cy) * 1.1, dz = k + .5 - NZ / 2;
        if (dx * dx + dy * dy + dz * dz < 7.5 * 7.5) vox[idx(i, j, k)] = AIR;
      }
    }
    if (!T.chamber) return;
    // the chamber at 97 m, something waits in it
    const cx = NX / 2, cz = NZ / 2, cy = CHAMBER_J;
    for (let j = cy - 7; j < cy + 7; j++) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const dx = i + .5 - cx, dy = (j + .5 - cy) * 1.3, dz = k + .5 - cz;
      if (dx * dx + dy * dy + dz * dz < 5.2 * 5.2) vox[idx(i, j, k)] = AIR;
    }
  }

  // caves below 100 m: winding tunnels where two noise fields both cross zero,
  // big halls where a third one peaks; lava on cave floors deep down, and in pockets
  function carveCaves(rnd) {
    const off = rnd() * 100;
    const top = NY - 1 - Math.round(104 / S);
    for (let j = 22; j < top; j++) {
      const d = depthOfJ(j);
      const fade = Math.min(1, (d - 104) / 12);
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const x = i * S, y = j * S, z = k * S;
        const a = vnoiseG(x * .09 + off, y * .11, z * .09) - .5;
        const b = vnoiseG(x * .09, y * .11 + off, z * .09 + 31) - .5;
        const tunnel = a * a + b * b < .0035 * fade;
        const hall = vnoiseG(x * .045 + 7, y * .06 + off, z * .045) > .78 - .02 * fade;
        if (tunnel || hall) vox[idx(i, j, k)] = AIR;
      }
    }
    // lava settles on the floors of the deep caves
    for (let j = 23; j < NY - 1; j++) {
      const d = depthOfJ(j);
      if (d < 190) continue;
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const n = idx(i, j, k);
        if (vox[n] !== AIR || vox[idx(i, j - 1, k)] === AIR) continue;
        if (vnoiseG(i * .3, j * .2, k * .3 + off) > .7 - (d - 190) / 1300) vox[n] = LAVA;
      }
    }
    // and in sealed pockets, waiting for a careless shovel
    for (let w = 0; w < T.lava; w++) {
      const d = 180 + rnd() * 205;
      const cj0 = NY - 1 - Math.round(d / S), ci0 = 4 + Math.floor(rnd() * 32), ck0 = 4 + Math.floor(rnd() * 32);
      const r = 1.5 + rnd() * 2;
      for (let j = cj0 - 4; j <= cj0 + 4; j++) for (let k = Math.max(0, ck0 - 4); k <= Math.min(NZ - 1, ck0 + 4); k++) for (let i = Math.max(0, ci0 - 4); i <= Math.min(NX - 1, ci0 + 4); i++) {
        const dx = i - ci0, dy = (j - cj0) * 1.4, dz = k - ck0;
        if (dx * dx + dy * dy + dz * dz < r * r * 4 && j > 20 && vox[idx(i, j, k)] !== AIR) vox[idx(i, j, k)] = LAVA;
      }
    }
    // only closed basins keep their liquid: whatever has air under it or beside it
    // drains away, pass after pass, until nothing is left standing
    for (let pass = 0; pass < 8; pass++) {
      let drained = 0;
      for (let j = 1; j < NY; j++) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const n = idx(i, j, k);
        if (!isLiquid(vox[n])) continue;
        const open = vox[idx(i, j - 1, k)] === AIR
          || (i > 0 && vox[n - 1] === AIR) || (i < NX - 1 && vox[n + 1] === AIR)
          || (k > 0 && vox[idx(i, j, k - 1)] === AIR) || (k < NZ - 1 && vox[idx(i, j, k + 1)] === AIR);
        if (open) { vox[n] = AIR; drained++; }
      }
      if (!drained) break;
    }
  }

  // ---------- queries ----------
  const inArea = (i, k) => i >= 0 && i < NX && k >= 0 && k < NZ;
  // everything outside the plot is packed earth down to the bedrock
  function solidCell(i, j, k) {
    if (T.sphere && (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ)) return false;
    if (j >= NY) return false;
    if (j < 0) return true;
    if (!inArea(i, k)) return true;
    const m = vox[idx(i, j, k)];
    return m !== AIR && m !== WATER && m !== LAVA;
  }
  const isAir = (i, j, k) => j >= NY || (T.sphere && (j < 0 || !inArea(i, k))) || (inArea(i, k) && j >= 0 && vox[idx(i, j, k)] === AIR);
  const isWater = (i, j, k) => inArea(i, k) && j >= 0 && j < NY && vox[idx(i, j, k)] === WATER;
  const isLiquidCell = (i, j, k) => inArea(i, k) && j >= 0 && j < NY && isLiquid(vox[idx(i, j, k)]);
  const get = (i, j, k) => (inArea(i, k) && j >= 0 && j < NY) ? vox[idx(i, j, k)] : (j >= NY || T.sphere ? AIR : BEDROCK);
  const hardness = (i, j, k) => (inArea(i, k) && j >= 0 && j < NY) ? (isLiquid(vox[idx(i, j, k)]) ? 0 : hardOf[idx(i, j, k)]) : 99;
  const cellOf = (x, y, z) => [Math.floor((x - X0) / S), Math.floor((y - Y0) / S), Math.floor((z - Z0) / S)];

  // ---------- meshing: a smooth ground drawn over the voxels (surface nets) ----------
  // The voxels stay the truth for digging, collisions and saves; only the look is smooth.
  const earthMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
  const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: .62, roughness: .08, metalness: .1, emissive: 0x1a5a80, emissiveIntensity: .9 });
  const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  // lava needs no light: it is the light (and the bloom picks it up)
  lavaMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vLw;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvLw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.uniforms.uT = lavaTime;
    sh.fragmentShader = 'varying vec3 vLw; uniform float uT;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float w = sin(vLw.x * 3.1 + uT * .7) * sin(vLw.z * 2.7 - uT * .5) * .5 + .5;
      float c = sin(vLw.x * 9.0 + vLw.z * 7.0 + uT * 1.3) * .5 + .5;
      diffuseColor.rgb = mix(vec3(.5, .06, .01), vec3(.95, .32, .04), w * .7 + c * .3);`);
  };
  const lavaTime = { value: 0 };
  const nugMat = new THREE.MeshStandardMaterial({ roughness: .5, metalness: .25, emissive: 0x0a0804, flatShading: true });
  const pebMat = new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true });
  patchSkyLight(earthMat, { earth: true }); patchSkyLight(waterMat); patchSkyLight(nugMat); patchSkyLight(pebMat);
  const nugGeo = new THREE.IcosahedronGeometry(1, 0), pebGeo = new THREE.DodecahedronGeometry(1, 0);

  // water keeps flat faces: pools read better flat
  const FACES = [
    { n: [1, 0, 0],  c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0],  c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1],  c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];
  for (const f of FACES) {
    const [a, b, c] = f.c;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2] < 0) f.c.reverse();
  }
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

  const chunks = new Map();
  const dirty = new Set();
  const group = new THREE.Group();
  scene.add(group);

  // smooth 3D value noise, for lumps and colour patches (continuous across chunks)
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
    return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
             l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
  }
  // what the ground is made of at a cell, inside the plot or beyond it
  function matAt(i, j, k) {
    if (j < 0) return BEDROCK;
    if (inArea(i, k)) return vox[idx(i, j, k)];
    return j === NY - 1 ? T.grass : layerAt(depthOfJ(j)).id;
  }
  const hostColor = (m, j) => (isOre(m) ? COLOR[layerAt(depthOfJ(j)).id] : COLOR[m]);
  // freshly turned earth at the lip of the hole: lighter than the soil below
  const dirtTop = theme === 'china' ? 0xd8b070 : theme === 'moon' ? 0xc8c4bc : 0xa87a4a;

  const M = 3;                                   // sample margin around a chunk
  const SX = CX + 2 * M + 1, SY = CY + 2 * M + 1, SZ = CZ + 2 * M + 1;
  const NS = SX * SY * SZ;
  const occ = new Float32Array(NS), mats = new Uint8Array(NS), B1 = new Float32Array(NS), B2 = new Float32Array(NS), tmpB = new Float32Array(NS);
  const si = (a, b, c) => a + SX * (c + SZ * b);
  function blur(src, dst) {
    // three separable 3-tap box passes
    for (let b = 0; b < SY; b++) for (let c = 0; c < SZ; c++) for (let a = 0; a < SX; a++) {
      const n = si(a, b, c);
      tmpB[n] = (src[si(Math.max(0, a - 1), b, c)] + src[n] + src[si(Math.min(SX - 1, a + 1), b, c)]) / 3;
    }
    for (let b = 0; b < SY; b++) for (let c = 0; c < SZ; c++) for (let a = 0; a < SX; a++) {
      const n = si(a, b, c);
      dst[n] = (tmpB[si(a, b, Math.max(0, c - 1))] + tmpB[n] + tmpB[si(a, b, Math.min(SZ - 1, c + 1))]) / 3;
    }
    for (let b = 0; b < SY; b++) for (let c = 0; c < SZ; c++) for (let a = 0; a < SX; a++) {
      const n = si(a, b, c);
      tmpB[n] = (dst[si(a, Math.max(0, b - 1), c)] + dst[n] + dst[si(a, Math.min(SY - 1, b + 1), c)]) / 3;
    }
    dst.set(tmpB);
  }
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

  function disposeChunk(c) {
    group.remove(c.mesh); c.mesh.geometry.dispose();
    if (c.nug) { group.remove(c.nug); c.nug.dispose(); }
    if (c.peb) { group.remove(c.peb); c.peb.dispose(); }
  }

  function buildChunk(ci, cj, ck) {
    const key = ci + ',' + cj + ',' + ck;
    const i0 = ci * CX, j0 = cj * CY, k0 = ck * CZ;
    const ib = i0 - M, jb = j0 - M, kb = k0 - M;
    let nSolid = 0;
    for (let b = 0; b < SY; b++) for (let c = 0; c < SZ; c++) for (let a = 0; a < SX; a++) {
      const n = si(a, b, c);
      const i = ib + a, j = jb + b, k = kb + c;
      const solid = solidCell(i, j, k);
      occ[n] = solid ? 1 : 0;
      mats[n] = solid ? matAt(i, j, k) : 0;
      if (solid) nSolid++; else if (isLiquidCell(i, j, k)) nSolid = -1e9;
    }
    // all rock or all air (and no water): no surface to draw, skip the heavy part
    if (nSolid === NS || nSolid === 0) { const old = chunks.get(key); if (old) { disposeChunk(old); chunks.delete(key); } return; }
    blur(occ, B1);
    blur(B1, B2);

    const pos = [], nor = [], col = [], earthIdx = [], waterIdx = [], lavaIdx = [], refs = [], shades = [];
    const verts = new Map();
    let vcount = 0;
    const cubeVertex = (a, b, c) => {
      const ck2 = a + SX * (c + SZ * b);
      const got = verts.get(ck2);
      if (got !== undefined) return got;
      let px = 0, py = 0, pz = 0, cnt = 0;
      for (const [e0, e1] of EDGES) {
        const c0 = CORNERS[e0], c1 = CORNERS[e1];
        const s0 = si(a + c0[0], b + c0[1], c + c0[2]), s1 = si(a + c1[0], b + c1[1], c + c1[2]);
        if (occ[s0] === occ[s1]) continue;
        const d0 = B1[s0], d1 = B1[s1];
        let t = d1 !== d0 ? (0.5 - d0) / (d1 - d0) : 0.5;
        t = Math.min(0.8, Math.max(0.2, t));
        px += c0[0] + (c1[0] - c0[0]) * t; py += c0[1] + (c1[1] - c0[1]) * t; pz += c0[2] + (c1[2] - c0[2]) * t;
        cnt++;
      }
      px = a + px / cnt; py = b + py / cnt; pz = c + pz / cnt;
      // the slope of the blurred ground gives a soft normal, pointing into the air
      let gx = 0, gy = 0, gz = 0, solidM = 0, ref = -1;
      for (const cc of CORNERS) {
        const s = si(a + cc[0], b + cc[1], c + cc[2]);
        const d = B1[s];
        gx += cc[0] ? d : -d; gy += cc[1] ? d : -d; gz += cc[2] ? d : -d;
        if (!solidM && occ[s]) {
          solidM = mats[s];
          const wi = ib + a + cc[0], wj = jb + b + cc[1], wk = kb + c + cc[2];
          if (inArea(wi, wk) && wj >= 0 && wj < NY) ref = idx(wi, wj, wk);
        }
      }
      // a flat spot in the blur (thin walls, pinches): fall back to solid → air
      if (Math.hypot(gx, gy, gz) < 1e-3) {
        gx = gy = gz = 0;
        for (const cc of CORNERS) { const w = occ[si(a + cc[0], b + cc[1], c + cc[2])] ? 1 : -1; gx += (cc[0] - .5) * w; gy += (cc[1] - .5) * w; gz += (cc[2] - .5) * w; }
        if (Math.hypot(gx, gy, gz) < 1e-3) gy = -1;
      }
      const nl = Math.hypot(gx, gy, gz);
      const nx = -gx / nl, ny = -gy / nl, nz = -gz / nl;
      let wx = X0 + (ib + px + .5) * S, wy = Y0 + (jb + py + .5) * S, wz = Z0 + (kb + pz + .5) * S;
      // lumps: push the surface in and out a little
      // (flat where the plot meets the lawn, so the two join without a crack)
      const edge = Math.max(Math.abs(wx - ox), Math.abs(wz - oz));
      const rim = wy > -1.2 ? Math.min(1, Math.max(0, (NX * S / 2 - .15 - edge) / .8)) : 1;
      const bump = ((vnoise(wx * 1.1, wy * 1.1, wz * 1.1) - .5) * .2 + (vnoise(wx * 3.1, wy * 3.1, wz * 3.1) - .5) * .06) * rim;
      wx += nx * bump; wy += ny * bump; wz += nz * bump;
      pos.push(wx, wy, wz);
      nor.push(nx, ny, nz);
      // colour: the ground's own, with patches, grass on top fading into earth on the slopes
      const jj = Math.round(jb + py);
      tmpC.setHex(hostColor(solidM || BEDROCK, Math.max(0, Math.min(NY - 1, jj))));
      if (solidM === T.grass) {
        const g = Math.min(1, Math.max(0, (ny - .35) / .4));
        tmpC.setHex(dirtTop).lerp(tmpC2.setHex(COLOR[T.grass]), g);
      }
      const patch = .82 + .3 * vnoise(wx * .6, wy * .6, wz * .6);
      const depthDark = 1 - Math.min(0.25, -wy / 400);
      const o2 = B2[si(Math.round(px), Math.round(py), Math.round(pz))];
      const ao = Math.min(1, Math.max(.4, 1.35 - o2 * 1.05));
      const k = patch * depthDark * ao;
      refs.push(ref); shades.push(depthDark * ao);
      if (ref >= 0 && paint[ref]) { tmpC.setHex(paintColors[paint[ref]] || 0xffffff); col.push(tmpC.r * depthDark * ao, tmpC.g * depthDark * ao, tmpC.b * depthDark * ao); }
      else col.push(tmpC.r * k, tmpC.g * k, tmpC.b * k);
      verts.set(ck2, vcount);
      return vcount++;
    };
    const P = (n) => [pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]];
    function quad(v, axis, positive) {
      const [a, b, c] = [P(v[0]), P(v[1]), P(v[2])];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const cr = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
      const flip = (cr[axis] > 0) !== positive;
      if (flip) earthIdx.push(v[0], v[2], v[1], v[0], v[3], v[2]);
      else earthIdx.push(v[0], v[1], v[2], v[0], v[2], v[3]);
    }
    // every sample edge this chunk owns that crosses the surface becomes a quad
    const aFrom = ci === 0 ? M - 1 : M, cFrom = ck === 0 ? M - 1 : M;
    for (let b = M; b < M + CY; b++) for (let c = cFrom; c < M + CZ; c++) for (let a = aFrom; a < M + CX; a++) {
      const s0 = si(a, b, c);
      const o = occ[s0];
      if (c >= M && occ[si(a + 1, b, c)] !== o) quad([cubeVertex(a, b - 1, c - 1), cubeVertex(a, b, c - 1), cubeVertex(a, b, c), cubeVertex(a, b - 1, c)], 0, o === 1);
      if (a >= M && c >= M && occ[si(a, b + 1, c)] !== o) quad([cubeVertex(a - 1, b, c - 1), cubeVertex(a, b, c - 1), cubeVertex(a, b, c), cubeVertex(a - 1, b, c)], 1, o === 1);
      if (a >= M && b >= M && occ[si(a, b, c + 1)] !== o) quad([cubeVertex(a - 1, b - 1, c), cubeVertex(a, b - 1, c), cubeVertex(a, b, c), cubeVertex(a - 1, b, c)], 2, o === 1);
    }
    // water: flat faces where it meets air; ores and pebbles: little lumps on open walls
    const nugs = [], pebs = [];
    for (let j = j0; j < j0 + CY; j++) for (let k = k0; k < k0 + CZ; k++) for (let i = i0; i < i0 + CX; i++) {
      const m = vox[idx(i, j, k)];
      if (m === AIR) continue;
      if (m === WATER || m === LAVA) {
        for (const f of FACES) {
          if (!isAir(i + f.n[0], j + f.n[1], k + f.n[2])) continue;
          tmpC.setHex(COLOR[m]);
          const o = vcount;
          for (const c of f.c) {
            refs.push(-1); shades.push(1);
            pos.push(X0 + (i + c[0]) * S, Y0 + (j + c[1]) * S - (f.n[1] === 1 ? S * .15 : 0), Z0 + (k + c[2]) * S);
            nor.push(f.n[0], f.n[1], f.n[2]);
            col.push(tmpC.r, tmpC.g, tmpC.b);
          }
          (m === LAVA ? lavaIdx : waterIdx).push(o, o + 1, o + 2, o, o + 2, o + 3);
          vcount += 4;
        }
        continue;
      }
      let ax = 0, ay = 0, az = 0, open = 0;
      for (const f of FACES) if (!solidCell(i + f.n[0], j + f.n[1], k + f.n[2])) { ax += f.n[0]; ay += f.n[1]; az += f.n[2]; open++; }
      if (!open) continue;
      const al = Math.hypot(ax, ay, az) || 1;
      const h = hash3(i, j, k);
      const cx = X0 + (i + .5) * S, cy = Y0 + (j + .5) * S, cz = Z0 + (k + .5) * S;
      if (isOre(m)) nugs.push([cx + ax / al * .14, cy + ay / al * .14, cz + az / al * .14, .16 + h * .09, h, COLOR[m]]);
      else if (m !== T.grass && h < .045) pebs.push([cx + ax / al * .2, cy + ay / al * .2, cz + az / al * .2, .06 + hash3(k, i, j) * .11, h, m]);
    }

    const old = chunks.get(key);
    if (old) { disposeChunk(old); chunks.delete(key); }
    if (!vcount && !nugs.length && !pebs.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex([...earthIdx, ...waterIdx, ...lavaIdx]);
    g.addGroup(0, earthIdx.length, 0);
    g.addGroup(earthIdx.length, waterIdx.length, 1);
    g.addGroup(earthIdx.length + waterIdx.length, lavaIdx.length, 2);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, [earthMat, waterMat, lavaMat]);
    mesh.matrixAutoUpdate = false;
    // the ground takes shadows but doesn't cast them: it would shadow itself and the lawn it sits flush with
    mesh.receiveShadow = true;
    group.add(mesh);
    // what each vertex shows when bare, to wash the paint off without a rebuild
    const entry = { mesh, nug: null, peb: null, refs: Int32Array.from(refs), shades: Float32Array.from(shades), bare: Float32Array.from(col) };
    const dm = new THREE.Object3D();
    const inst = (list, geo, mat, colorOf) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, y, z, sc, h, c], n) => {
        dm.position.set(x, y, z);
        dm.rotation.set(h * 9, h * 17, h * 5);
        dm.scale.set(sc, sc * (.75 + h * .4), sc * (.9 + h * .3));
        dm.updateMatrix();
        im.setMatrixAt(n, dm.matrix);
        im.setColorAt(n, colorOf(c, h));
      });
      im.castShadow = true; im.receiveShadow = true;
      group.add(im);
      return im;
    };
    entry.nug = inst(nugs, nugGeo, nugMat, (c) => tmpC.setHex(c));
    entry.peb = inst(pebs, pebGeo, pebMat, (m, h) => tmpC.setHex(0x9a948c).lerp(tmpC2.setHex(COLOR[m] || 0x777777), .35).multiplyScalar(.75 + h * 3));
    chunks.set(key, entry);
  }

  function markDirtyCell(i, j, k) {
    // a voxel change moves the smooth surface around it, up to three cells away
    const a0 = Math.max(0, Math.floor((i - 3) / CX)), a1 = Math.min(NCX - 1, Math.floor((i + 3) / CX));
    const b0 = Math.max(0, Math.floor((j - 3) / CY)), b1 = Math.min(NCY - 1, Math.floor((j + 3) / CY));
    const c0 = Math.max(0, Math.floor((k - 3) / CZ)), c1 = Math.min(NCZ - 1, Math.floor((k + 3) / CZ));
    for (let b = b0; b <= b1; b++) for (let c = c0; c <= c1; c++) for (let a = a0; a <= a1; a++) dirty.add(a + ',' + b + ',' + c);
  }

  // only the ground near the eye is meshed: nearest chunks first, far ones let go
  let focus = null;
  // meshed around the eye: on a planet the horizon is close, what's past it is never seen
  const R = T.sphere ? 30 : 40, EVICT = T.sphere ? 42 : 56;
  // chunk centres, parsed once per key (the planets keep thousands of keys waiting)
  const centres = new Map();
  const chunkDist = (key) => {
    let c = centres.get(key);
    if (!c) { const [a, b, cc] = key.split(',').map(Number); c = [X0 + (a + .5) * CX * S, Y0 + (b + .5) * CY * S, Z0 + (cc + .5) * CZ * S]; centres.set(key, c); }
    return Math.hypot(c[0] - focus.x, c[1] - focus.y, c[2] - focus.z);
  };
  function recolor(key) {
    const e = chunks.get(key);
    if (!e || !e.refs) return;
    const attr = e.mesh.geometry.attributes.color, a = attr.array;
    for (let v = 0; v < e.refs.length; v++) {
      const r = e.refs[v];
      if (r >= 0 && paint[r]) {
        tmpC.setHex(paintColors[paint[r]] || 0xffffff);
        const k = e.shades[v];
        a[v * 3] = tmpC.r * k; a[v * 3 + 1] = tmpC.g * k; a[v * 3 + 2] = tmpC.b * k;
      } else { a[v * 3] = e.bare[v * 3]; a[v * 3 + 1] = e.bare[v * 3 + 1]; a[v * 3 + 2] = e.bare[v * 3 + 2]; }
    }
    attr.needsUpdate = true;
  }
  function markPaint(i, j, k) {
    // a cell's colour sits on vertices that may belong to the next chunk over
    for (let b = Math.floor((j - 1) / CY); b <= Math.floor((j + 1) / CY); b++)
      for (let c = Math.floor((k - 1) / CZ); c <= Math.floor((k + 1) / CZ); c++)
        for (let a = Math.floor((i - 1) / CX); a <= Math.floor((i + 1) / CX); a++)
          if (a >= 0 && a < NCX && b >= 0 && b < NCY && c >= 0 && c < NCZ) paintDirty.add(a + ',' + b + ',' + c);
  }
  // paint a ball of ground with a team's colour; returns [cell, previous team] for each change
  function paintBall(center, radius, team) {
    const out = [];
    const [ci, cj, ck] = cellOf(center.x, center.y, center.z);
    const r = Math.ceil(radius / S) + 1;
    for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) for (let i = ci - r; i <= ci + r; i++) {
      if (!inArea(i, k) || j < 0 || j >= NY) continue;
      const n = idx(i, j, k);
      const m = vox[n];
      if (m === AIR || m === WATER || m === LAVA || paint[n] === team) continue;
      const x = X0 + (i + .5) * S - center.x, y = Y0 + (j + .5) * S - center.y, z = Z0 + (k + .5) * S - center.z;
      if (x * x + y * y + z * z > radius * radius) continue;
      out.push([n, paint[n]]);
      paint[n] = team; painted.add(n);
      markPaint(i, j, k);
    }
    return out;
  }
  function clearPaint() {
    for (const n of painted) {
      paint[n] = 0;
      const i = n % NX, k = Math.floor(n / NX) % NZ, j = Math.floor(n / (NX * NZ));
      markPaint(i, j, k);
    }
    painted.clear();
  }
  // the ground the paint game counts: every solid cell of the plot open to the air, down to maxDepth
  function exposedCells(maxDepth) {
    const out = [];
    const jMin = Math.max(0, NY - 1 - Math.round(maxDepth / S));
    for (let j = NY - 1; j >= jMin; j--) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const m = vox[idx(i, j, k)];
      if (m === AIR || m === WATER || m === LAVA) continue;
      if (isAir(i + 1, j, k) || isAir(i - 1, j, k) || isAir(i, j + 1, k) || isAir(i, j - 1, k) || isAir(i, j, k + 1) || isAir(i, j, k - 1)) out.push(idx(i, j, k));
    }
    return out;
  }
  const cellCenter = (n, v = new THREE.Vector3()) => v.set(X0 + (n % NX + .5) * S, Y0 + (Math.floor(n / (NX * NZ)) + .5) * S, Z0 + (Math.floor(n / NX) % NZ + .5) * S);

  // max chunks, and (optionally) a time budget in ms: the nearest go first either way
  function flush(max = Infinity, budget = Infinity) {
    const t0 = performance.now();
    for (const key of paintDirty) recolor(key);
    paintDirty.clear();
    let n = 0;
    if (!focus) {
      for (const key of dirty) {
        const [a, b, c] = key.split(',').map(Number);
        buildChunk(a, b, c);
        dirty.delete(key);
        if (++n >= max) break;
      }
      return n;
    }
    const near = [];
    for (const key of dirty) { const d = chunkDist(key); if (d < R) near.push([d, key]); }
    near.sort((p, q) => p[0] - q[0]);
    for (const [, key] of near) {
      const [a, b, c] = key.split(',').map(Number);
      buildChunk(a, b, c);
      dirty.delete(key);
      if (++n >= max || performance.now() - t0 > budget) break;
    }
    return n;
  }
  function evict() {
    if (!focus) return;
    for (const [key, c] of chunks) if (chunkDist(key) > EVICT) { disposeChunk(c); chunks.delete(key); dirty.add(key); }
  }
  // chunks never built (or let go) wait in `dirty` until the eye comes near
  function setFocus(p) {
    const moved = !focus || Math.hypot(p.x - focus.x, p.y - focus.y, p.z - focus.z) > 4;
    focus = focus || new THREE.Vector3();
    if (moved) { focus.copy(p); evict(); }
  }

  // everything to be (re)built, lazily, nearest first, as the eye comes by
  function markAll() { for (let cj = 0; cj < NCY; cj++) for (let ck = 0; ck < NCZ; ck++) for (let ci = 0; ci < NCX; ci++) dirty.add(ci + ',' + cj + ',' + ck); }
  function rebuildAll() {
    for (let cj = 0; cj < NCY; cj++) for (let ck = 0; ck < NCZ; ck++) for (let ci = 0; ci < NCX; ci++) dirty.add(ci + ',' + cj + ',' + ck);
    flush();
  }

  // ---------- raycast (voxel DDA) ----------
  function raycast(origin, dir, maxDist, hitWater = false) {
    let [i, j, k] = cellOf(origin.x, origin.y, origin.z);
    const step = [Math.sign(dir.x), Math.sign(dir.y), Math.sign(dir.z)];
    const o = [(origin.x - X0) / S, (origin.y - Y0) / S, (origin.z - Z0) / S];
    const d = [dir.x, dir.y, dir.z];
    const cell = [i, j, k];
    const tMax = [0, 0, 0], tDelta = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      if (d[a] === 0) { tMax[a] = Infinity; tDelta[a] = Infinity; continue; }
      const next = step[a] > 0 ? cell[a] + 1 : cell[a];
      tMax[a] = (next - o[a]) / d[a] * S;
      tDelta[a] = S / Math.abs(d[a]);
    }
    let t = 0, face = -1;
    while (t <= maxDist) {
      if (solidCell(cell[0], cell[1], cell[2]) || (hitWater && isWater(cell[0], cell[1], cell[2]))) {
        const n = [0, 0, 0];
        if (face >= 0) n[face] = -step[face];
        return {
          i: cell[0], j: cell[1], k: cell[2], t,
          point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
          normal: new THREE.Vector3(n[0], n[1], n[2]),
          inside: inArea(cell[0], cell[2]) && cell[1] >= 0,
        };
      }
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      t = tMax[a];
      tMax[a] += tDelta[a];
      cell[a] += step[a];
      face = a;
    }
    return null;
  }

  // ---------- edit ----------
  // carve a ball; returns what came out, and what was too hard to move
  function carve(center, radius, tier, canTake = () => true, destroyOres = false) {
    const out = { removed: 0, ores: [], tooHard: 0 };
    const [ci, cj, ck] = cellOf(center.x, center.y, center.z);
    const r = Math.ceil(radius / S) + 1;
    for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) for (let i = ci - r; i <= ci + r; i++) {
      if (!inArea(i, k) || j < 0 || j >= NY) continue;
      const n = idx(i, j, k);
      const m = vox[n];
      if (m === AIR) continue;
      const x = X0 + (i + .5) * S - center.x, y = Y0 + (j + .5) * S - center.y, z = Z0 + (k + .5) * S - center.z;
      if (x * x + y * y + z * z > radius * radius) continue;
      if (m !== WATER && hardOf[n] > tier) { out.tooHard++; continue; }
      const take = !isOre(m) || canTake(m);
      if (m === WATER) out.water = (out.water || 0) + 1;
      if (!take && !destroyOres) { out.left = (out.left || 0) + 1; continue; }
      vox[n] = AIR;
      if (T.sphere) dug.push(n);
      out.removed++;
      if (isOre(m) && take) out.ores.push({ id: m, pos: new THREE.Vector3(x + center.x, y + center.y, z + center.z) });
      markDirtyCell(i, j, k);
      wake(i, j, k);
    }
    return out;
  }

  // ---------- water: a little falling-sand flow ----------
  const active = new Set();
  const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function wake(i, j, k) {
    for (const [a, b, c] of NB) if (isLiquidCell(i + a, j + b, k + c)) active.add(idx(i + a, j + b, k + c));
  }
  function moveWater(from, to, i, j, k, ti, tj, tk) {
    const L = vox[from];
    vox[to] = L; vox[from] = AIR;
    markDirtyCell(i, j, k); markDirtyCell(ti, tj, tk);
    active.add(to);
    wake(i, j, k);
    // lava meeting water: both set into obsidian
    for (const [a, b, c] of NB) {
      const x = ti + a, y = tj + b, z = tk + c;
      if (!inArea(x, z) || y < 0 || y >= NY) continue;
      const other = vox[idx(x, y, z)];
      if (isLiquid(other) && other !== L) {
        vox[to] = OBSIDIAN; hardOf[to] = 6;
        vox[idx(x, y, z)] = OBSIDIAN; hardOf[idx(x, y, z)] = 6;
        markDirtyCell(x, y, z);
        onSteam(X0 + (ti + .5) * S, Y0 + (tj + .5) * S, Z0 + (tk + .5) * S);
        break;
      }
    }
  }
  let onSteam = () => {};
  let tick = 0;
  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // move up to `budget` cells one step; returns how many moved
  function stepWater(budget = 400) {
    if (!active.size) return 0;
    const list = [...active];
    active.clear();
    let moved = 0;
    tick++;
    for (const n of list) {
      if (moved >= budget) { active.add(n); continue; }
      const L = vox[n];
      if (!isLiquid(L)) continue;
      // lava creeps: it moves one tick in three
      if (L === LAVA && tick % 3) { active.add(n); continue; }
      const i = n % NX, k = Math.floor(n / NX) % NZ, j = Math.floor(n / (NX * NZ));
      if (j > 1 && vox[idx(i, j - 1, k)] === AIR) { moveWater(n, idx(i, j - 1, k), i, j, k, i, j - 1, k); moved++; continue; }
      // sideways only when pushed from above, or to spill over an edge
      const pressed = j + 1 < NY && vox[idx(i, j + 1, k)] === L;
      const o = Math.floor(Math.random() * 4);
      for (let s = 0; s < 4; s++) {
        const [dx, dz] = SIDES[(o + s) % 4];
        const a = i + dx, c = k + dz;
        if (!inArea(a, c)) continue;
        const m2 = idx(a, j, c);
        if (vox[m2] !== AIR) continue;
        if (pressed || (j > 1 && vox[idx(a, j - 1, c)] === AIR)) { moveWater(n, m2, i, j, k, a, j, c); moved++; break; }
      }
    }
    return moved;
  }

  // blocks of `step`³ cells that have been dug out (for the hologram on the globe)
  function airBlocks(step = 2) {
    // only what is reachable from the surface: hidden pockets stay hidden
    const seen = new Uint8Array(vox.length);
    const queue = new Int32Array(vox.length);
    let head = 0, tail = 0;
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const n = idx(i, NY - 1, k);
      if (vox[n] === AIR || isLiquid(vox[n])) { seen[n] = 1; queue[tail++] = n; }
    }
    while (head < tail) {
      const n = queue[head++];
      const i = n % NX, k = Math.floor(n / NX) % NZ, j = Math.floor(n / (NX * NZ));
      for (const [a, b, c] of NB) {
        const x = i + a, y = j + b, z = k + c;
        if (!inArea(x, z) || y < 0 || y >= NY) continue;
        const m2 = idx(x, y, z);
        if (seen[m2] || (vox[m2] !== AIR && !isLiquid(vox[m2]))) continue;
        seen[m2] = 1; queue[tail++] = m2;
      }
    }
    const out = [];
    for (let j = 1; j < NY - 1; j += step) for (let k = 0; k < NZ; k += step) for (let i = 0; i < NX; i += step) {
      let air = 0, water = 0;
      for (let dj = 0; dj < step; dj++) for (let dk = 0; dk < step; dk++) for (let di = 0; di < step; di++) {
        const n = idx(i + di, Math.min(NY - 1, j + dj), k + dk);
        if (!seen[n]) continue;
        if (vox[n] === AIR) air++; else water++;
      }
      if (air + water > (step * step * step) / 2) out.push([i, j, k, water > air]);
    }
    return out;
  }


  // open a box of cells to air (hidden pockets, the lift shaft), whatever their hardness
  function hollowBox(i0, j0, k0, w, h, d) {
    for (let j = Math.max(1, j0); j < Math.min(NY, j0 + h); j++) for (let k = k0; k < k0 + d; k++) for (let i = i0; i < i0 + w; i++) {
      if (!inArea(i, k)) continue;
      vox[idx(i, j, k)] = AIR;
      markDirtyCell(i, j, k);
      wake(i, j, k);
    }
  }

  // ---------- save ----------
  // a planet is too big to save whole: its seed makes it again, and only what was dug is kept
  const dug = [];
  function serialize() {
    if (T.sphere) {
      const u32 = Uint32Array.from(dug);
      const bytes = new Uint8Array(u32.buffer);
      let s = '';
      for (let n = 0; n < bytes.length; n += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(n, n + 0x8000));
      return 'D:' + btoa(s);
    }
    const runs = [];
    let cur = vox[0], len = 0;
    for (let n = 0; n < vox.length; n++) {
      if (vox[n] === cur && len < 65535) len++;
      else { runs.push(cur, len); cur = vox[n]; len = 1; }
    }
    runs.push(cur, len);
    const u16 = new Uint16Array(runs);
    const bytes = new Uint8Array(u16.buffer);
    let s = '';
    for (let n = 0; n < bytes.length; n += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(n, n + 0x8000));
    return btoa(s);
  }
  function deserialize(b64) {
    if (T.sphere) {
      if (!b64.startsWith('D:')) throw new Error('old planet save');
      if (!ready) { pendingSave = b64; return; }
      const s = atob(b64.slice(2));
      const bytes = new Uint8Array(s.length);
      for (let n = 0; n < s.length; n++) bytes[n] = s.charCodeAt(n);
      const u32 = new Uint32Array(bytes.buffer, 0, bytes.length >> 2);
      for (const n of u32) if (n < vox.length) { vox[n] = AIR; dug.push(n); }
      markAll();
      return;
    }
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let n = 0; n < s.length; n++) bytes[n] = s.charCodeAt(n);
    const u16 = new Uint16Array(bytes.buffer);
    // check the size first: an old save of another shape must not touch the ground
    let total = 0;
    for (let r = 1; r < u16.length; r += 2) total += u16[r];
    if (total !== vox.length) throw new Error('bad terrain save');
    let p = 0;
    for (let r = 0; r < u16.length; r += 2) { vox.fill(u16[r], p, p + u16[r + 1]); p += u16[r + 1]; }
    if (p !== vox.length) throw new Error('bad terrain save');
  }

  // a planet is only made the first time someone goes there
  let ready = !T.sphere, pendingSave = null;
  function ensure() {
    if (ready) return;
    ready = true;
    vox = new Uint8Array(NX * NY * NZ); hardOf = new Uint8Array(NX * NY * NZ);
    generate();
    if (pendingSave) { const s = pendingSave; pendingSave = null; deserialize(s); }
  }

  function dugCount() {
    let n = 0;
    for (let j = 1; j < NY; j++) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (!vox[idx(i, j, k)]) n++;
    return n;
  }

  if (!T.sphere) generate();

  return {
    group, get, hardness, solidCell, cellOf, raycast, carve, hollowBox, flush, S, X0, Y0, Z0, NY, rebuildAll,
    serialize, deserialize, generate, dugCount, depthOfJ, layerAt, LAYERS, theme, ox, oz,
    contains: (x, z) => Math.abs(x - ox) < 60 && Math.abs(z - oz) < 60,
    hasDirty: () => dirty.size > 0 || paintDirty.size > 0,
    paintBall, clearPaint, exposedCells, cellCenter, paintOf: (n) => paint[n],
    setPaintColors(list) { paintColors = [0, ...list]; },
    // for the maps: how deep the ground's top is in each column (metres), and one vertical slice
    columnDepths() {
      const out = new Float32Array(NX * NZ);
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        let j = NY - 1;
        while (j > 0 && !solidCell(i, j, k)) j--;
        out[i + NX * k] = (NY - 1 - j) * S;
      }
      return out;
    },
    slice(k) {
      const out = new Uint8Array(NX * NY);
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) out[i + NX * j] = vox[idx(i, j, Math.max(0, Math.min(NZ - 1, k)))];
      return out;
    },
    colorOf: (m) => COLOR[m] ?? 0x000000,
    NX, NZ,
    setFocus,
    rebuildTop() { for (let ck = 0; ck < NCZ; ck++) for (let ci = 0; ci < NCX; ci++) dirty.add(ci + ',' + (NCY - 1) + ',' + ck); },
    stepWater, airBlocks, isWater, WATER,
    // a new map: fresh ground from another seed
    reseed(s) {
      seed = s;
      if (T.sphere) {
        // a planet: forget what was dug; remade now if it exists already, otherwise on the next visit
        dug.length = 0; pendingSave = null;
        if (ready) { vox.fill(0); hardOf.fill(0); generate(); }
        markAll();
        return;
      }
      generate(); active.clear(); rebuildAll();
    },
    markAll, ensure,
    waterAt: (x, y, z) => { const [i, j, k] = cellOf(x, y, z); return isWater(i, j, k); },
    // centre of the chamber at the bottom, in world units
    center: new THREE.Vector3(ox, oy, oz), radius: T.radius || 0, sphere: !!T.sphere,
    heartPos: new THREE.Vector3(X0 + NX / 2 * S, Y0 + (CHAMBER_J + .5) * S, Z0 + NZ / 2 * S),
    corePos: new THREE.Vector3(X0 + NX / 2 * S, Y0 + 9.5 * S, Z0 + NZ / 2 * S),
    lavaAt: (x, y, z) => { const [i, j, k] = cellOf(x, y, z); return inArea(i, k) && j >= 0 && j < NY && vox[idx(i, j, k)] === LAVA; },
    set onSteam(f) { onSteam = f; },
    tickLava(dt) { lavaTime.value += dt; },
  };
}
