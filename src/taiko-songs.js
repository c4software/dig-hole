// taiko-songs.js, the matsuri stage's pieces: the drum part the player hits (don, ka, big notes,
// rolls), and what plays by itself (the shime-daiko's beat, the hand gong, the bamboo flute).
// Written as festival patterns: sixteen steps a bar, one character a step. The flute tunes are in
// the Japanese pentatonic modes (yo, in, min'yō): « sakura sakura » is the traditional Edo tune,
// the others are original. Pure data and arithmetic: the tests read it in node.
//   drums: d don (centre) · k ka (rim) · D big don · K big ka · o a roll (a run of o) · . rest
//   shime: t a stroke · kane: c a stroke

const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// "a5:1 b5:.5 f#5:2 r:1" → [[beat, len, midi]]
export function mel(src, from = 0) {
  const out = [];
  let t = from;
  for (const tok of src.trim().split(/[\s|]+/)) {
    const [n, l] = tok.split(':'), len = +l;
    if (n !== 'r') {
      const m = /^([a-g])(#?)(\d)$/.exec(n);
      if (!m) throw new Error('note ' + tok);
      out.push([t, len, 12 * (+m[3] + 1) + PC[m[1]] + (m[2] ? 1 : 0)]);
    }
    t += len;
  }
  return out;
}
const clean = (s) => s.replace(/\s/g, '');

const SAKURA = mel(`a4:1 a4:1 b4:2 | a4:1 a4:1 b4:2 | a4:1 b4:1 c5:1 b4:1 | a4:1 b4:.5 a4:.5 f4:2 | e4:1 c4:1 e4:1 f4:1 | e4:1 e4:.5 c4:.5 b3:2 |
  a4:1 b4:1 c5:1 b4:1 | a4:1 b4:.5 a4:.5 f4:2 | e4:1 c4:1 e4:1 f4:1 | e4:1 e4:.5 c4:.5 b3:2 | a4:1 a4:1 b4:2 | a4:1 a4:1 b4:2 | e4:1 f4:1 b4:.5 a4:.5 f4:1 | e4:4`, 8)
  .map(([t, l, m]) => [t, l, m + 12]);
const NUIT_A = `d5:1 e5:.5 g5:.5 a5:1 g5:1 | a5:.5 b5:.5 a5:.5 g5:.5 e5:2 | g5:1 a5:.5 g5:.5 e5:1 d5:1 | e5:1 g5:1 d5:2 |
  b5:1 a5:.5 b5:.5 d6:1 b5:1 | a5:.5 g5:.5 a5:.5 b5:.5 a5:2 | g5:1 e5:.5 g5:.5 a5:1 g5:.5 e5:.5 | d5:3 r:1`;
const TONNERRE = `e5:2 f5:2 | a5:3 b5:1 | c6:2 b5:1 a5:1 | b5:4 | e6:2 c6:2 | b5:2 a5:1 f5:1 | e5:4 | r:4 |
  a5:2 b5:2 | c6:3 e6:1 | f6:2 e6:1 c6:1 | b5:4 | c6:1 b5:1 a5:1 f5:1 | e5:2 f5:2 | e5:4 | r:4`;
const LANTERNES = `a5:1 a5:.5 g5:.5 a5:1 c6:1 | d6:1.5 c6:.5 a5:2 | g5:1 a5:.5 g5:.5 f5:1 d5:1 | f5:1 g5:1 a5:2 |
  c6:1 a5:.5 c6:.5 d6:1 c6:1 | a5:.5 g5:.5 a5:1 g5:2 | f5:1 g5:.5 f5:.5 d5:1 c5:1 | d5:3 r:1`;
const RENARD = `a5:.5 b5:.5 d6:.5 e6:.5 f#6:1 e6:1 | d6:.5 e6:.5 d6:.5 b5:.5 a5:2 | b5:.5 d6:.5 e6:1 d6:.5 b5:.5 a5:1 | f#5:1 a5:1 b5:2 |
  e6:.5 f#6:.5 a6:1 f#6:.5 e6:.5 d6:1 | e6:.5 d6:.5 b5:.5 a5:.5 b5:2 | a5:.5 b5:.5 d6:.5 b5:.5 a5:1 f#5:1 | a5:3 r:1`;

// the drum bars of each piece
const G1 = 'd..kd.k.d..kd.k.', G2 = 'd.d.k.d.d.dkd.k.', G3 = 'dkd.dkd.d.dkd.k.', G4 = 'd.kkd.kkd.k.dkdk', F1 = 'd.d.d.d.dkdkD...', F2 = 'D...D...oooooooo';
const T1 = 'D...d.d.D...d.d.', T2 = 'd.dkd.dkd.dkD...', T3 = 'D.D.D.d.ddddD...', T4 = 'oooooooooooooD..', T5 = 'dkdkdkdkD...K...', T6 = 'D..dD..dD.d.D.k.';
const B1 = 'd...d...dkk.d...', B2 = 'd...k.k.d...k.k.', B3 = 'd.d.d...dkk.D...', B4 = 'D...D...dkdkD...';
const R1 = 'dkdkd.k.dkdkd.k.', R2 = 'd.dkd.dkdkdkD.K.', R3 = 'dddkdddkdkdkdkdk', R4 = 'D.D.D.D.oooooooo', R5 = 'kdkdd.d.kdkdd.D.';

export const SONGS = [
  {
    name: 'sakura sakura · traditionnel', beat: .62, flute: SAKURA,
    drums: ['D.......D.......', 'd...d...d.d.k.k.',
      'd...d...D.......', 'd...d...D.....k.', 'd...d...d...d...', 'd...k.k.D.......', 'd...d...k...k...', 'd...d.k.D.......', 'd...k...d...k...',
      'd...k.k.D.....k.', 'd...d...k...d...', 'd...d.k.D.......', 'd...d...D...k.k.', 'd...d...D...kkkk', 'd...d...k.k.d...', 'D...oooooooo....', 'D...............'],
    shime: 't.......t.......', kane: 'c...............',
  },
  {
    name: 'nuit de matsuri', beat: .42, flute: [...mel(NUIT_A, 8), ...mel(NUIT_A, 40)],
    drums: ['D.......D.......', 'd.d.d.d.dkdkd...', G1, G1, G2, F1, G1, G2, G1, F2, G3, G1, G3, F1, G4, G2, G4, F2, 'D...D...D.......'],
    shime: 't.t.t.t.t.t.t.t.', kane: 'c...c.c.c...c.c.',
  },
  {
    name: 'tonnerre du sanctuaire', beat: .4, flute: mel(TONNERRE, 8),
    drums: ['D...............', 'D.......D...D...', T1, T1, T2, T3, T1, T6, T2, T4, T6, T6, T5, T3, T6, T2, T5, T4, 'D...D...D...D...', 'D...............'],
    shime: 't...t...t...t.t.', kane: 'c.......c.......',
  },
  {
    name: 'danse des lanternes', beat: .5, flute: [...mel(LANTERNES, 8), ...mel(LANTERNES, 40)],
    drums: ['d...d...d...d...', 'd...d...dkdkD...', B1, B2, B1, B3, B1, B2, B1, B4, B1, B2, B1, B3, B1, B2, B1, B4, 'D...D...D.......'],
    shime: '..t...t...t...t.', kane: 'c...c.ccc...c.cc',
  },
  {
    name: 'le renard de feu', beat: .34, flute: [...mel(RENARD, 8), ...mel(RENARD, 40)],
    drums: ['d.d.d.d.dkdkdkdk', 'D...D...D.D.D...', R1, R2, R1, R4, R5, R2, R3, R4, R1, R3, R5, R4, R3, R3, R5, R4, 'D...K...D...K...', 'D...............'],
    shime: 't.t.t.t.t.t.t.t.', kane: 'c..cc..cc..cc..c',
  },
];

// a piece's drum notes: { step, t (beats), kind 'd'|'k', big, roll (beats, a roll) }
export function drumNotes(S) {
  const out = [];
  S.drums.forEach((bar, b) => {
    const s = clean(bar);
    if (s.length !== 16) throw new Error(`${S.name}: bar ${b} has ${s.length} steps`);
    for (let i = 0; i < 16; i++) {
      const c = s[i], step = b * 16 + i;
      if (c === '.') continue;
      if (c === 'o') {
        const last = out[out.length - 1];
        if (last?.roll && last.step + last.roll * 4 === step) last.roll += .25;
        else out.push({ step, t: step / 4, kind: 'r', big: false, roll: .25 });
        continue;
      }
      if (!'dkDK'.includes(c)) throw new Error(`${S.name}: '${c}'`);
      out.push({ step, t: step / 4, kind: c.toLowerCase(), big: c === 'D' || c === 'K', roll: 0 });
    }
  });
  return out;
}

// the four levels: which steps a note may sit on (4: beats, 2: eighths, 1: all), the smallest gap
// (seconds), how far ahead the notes show, the windows of a good and an ok hit
export const LEVELS = {
  facile: { grid: 4, gap: .33, look: 2.4, good: .075, ok: .13 },
  normal: { grid: 2, gap: .22, look: 2, good: .06, ok: .11 },
  difficile: { grid: 1, gap: .14, look: 1.7, good: .05, ok: .1 },
  expert: { grid: 1, gap: .07, look: 1.4, good: .042, ok: .09 },
};
export const LEVEL_ORDER = ['facile', 'normal', 'difficile', 'expert'];

// what plays by itself, in seconds: [t, voice, midi, len] (voice 's' shime, 'c' kane, 'f' flute)
function accompOf(S) {
  const out = [], bars = S.drums.length, beat = S.beat;
  for (let b = 0; b < bars - 1; b++) for (const [pat, v] of [[clean(S.shime), 's'], [clean(S.kane), 'c']]) {
    for (let i = 0; i < 16; i++) if (pat[i % pat.length] !== '.') out.push([+((b * 16 + i) / 4 * beat).toFixed(4), v, 0, 0]);
  }
  for (const [t, l, m] of S.flute) out.push([+(t * beat).toFixed(4), 'f', m, l * beat]);
  return out.sort((a, b) => a[0] - b[0]);
}

// a piece and a level → { name, beat, length, gems, accomp }: gems { t, kind 'd'|'k'|'r', big, len (a roll's, s) }
export function makeChart(song, level) {
  const S = SONGS[((song % SONGS.length) + SONGS.length) % SONGS.length], L = LEVELS[level] || LEVELS.normal;
  const gems = [];
  let last = -9;
  for (const n of drumNotes(S)) {
    const t = +(n.t * S.beat).toFixed(4);
    if (n.roll) { if (t - last >= L.gap - 1e-4) { const len = +(n.roll * S.beat).toFixed(4); gems.push({ t, kind: 'r', big: false, len }); last = t + len; } continue; }
    if (n.step % L.grid && !n.big) continue;
    if (t - last < L.gap - 1e-4) continue;
    gems.push({ t, kind: n.kind, big: n.big, len: 0 });
    last = t;
  }
  return { name: S.name, beat: S.beat, length: S.drums.length * 4 * S.beat, gems, accomp: accompOf(S) };
}
