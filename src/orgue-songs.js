// orgue-songs.js, the rhythm game's setlist and how a piece becomes a chart. The church's pieces
// (church.js SONGS) plus three more, all public domain; a chart is read off the score itself:
// the top voice at each onset becomes a note to play, its pitch contour picks the lane, long
// notes are held, the other voices (and what's too fast for the level) play by themselves.
// Deterministic: the same piece and level give the same chart on every client.
import { SONGS } from './church.js';

// In the Hall of the Mountain King (Grieg): the staccato theme, a fifth up, back, faster each time
function mountainKing() {
  const A = [[57, .5], [59, .5], [60, .5], [62, .5], [64, .5], [60, .5], [64, 1], [63, .5], [59, .5], [63, 1], [62, .5], [58, .5], [62, 1],
    [57, .5], [59, .5], [60, .5], [62, .5], [64, .5], [60, .5], [64, .5], [69, .5], [67, .5], [64, .5], [60, .5], [64, .5], [67, 2]];
  const s = [];
  let t = 0;
  [[12, 1], [19, .92], [12, .84], [24, .74], [24, .66]].forEach(([up, k], r) => {
    const t0 = t;
    for (const [m, l] of A) { s.push([t, l * k * (l > .5 ? .8 : .55), m + up, m + up - 12]); t += l * k; }
    // the pizzicato basses on each beat, root and fifth
    const root = up === 19 ? 40 : 33;
    for (let b = 0; t0 + b * k < t - .01; b++) s.push([t0 + b * k, k * .4, root + (b % 2 ? 7 : 0), root + 12 + (b % 2 ? 7 : 0)]);
    if (r === 4) s.push([t, 4, 33, 45, 57, 60, 64, 69, 76]);
  });
  return s;
}
// Amazing Grace (hymn, 18th c.): the tune over a chord a bar
function grace() {
  const tune = [[62, 1], [67, 2], [71, .5], [67, .5], [71, 2], [69, 1], [67, 2], [64, 1], [62, 2], [62, 1], [67, 2], [71, .5], [67, .5], [71, 2], [69, 1], [74, 3],
    [74, 2], [71, 1], [74, 2], [71, .5], [67, .5], [71, 2], [69, 1], [67, 2], [64, 1], [62, 2], [62, 1], [67, 2], [71, .5], [67, .5], [71, 2], [69, 1], [67, 3]];
  const G = [43, 55, 59], C = [48, 55, 64], D = [38, 54, 57], Em = [40, 55, 59];
  const bars = [G, G, C, G, G, Em, D, D, G, G, C, G, Em, D, G, G];
  const s = [];
  let t = 0;
  for (const [m, l] of tune) { s.push([t, l * .94, m, m + 12]); t += l; }
  bars.forEach((c, k) => s.push([1 + k * 3, 2.9, ...c]));
  s.push([t, 3, 31, 43, 55, 62, 67, 71]);
  return s;
}
// Prelude in C (Bach, the Well-Tempered Clavier): one broken chord a half bar, the two low notes held
function prelude() {
  const bars = [[60, 64, 67, 72, 76], [60, 62, 69, 74, 77], [59, 62, 67, 74, 77], [60, 64, 67, 72, 76], [60, 64, 69, 76, 81], [60, 62, 66, 69, 74],
    [59, 62, 67, 74, 79], [59, 60, 64, 67, 72], [57, 60, 64, 67, 72], [50, 57, 62, 66, 72], [55, 59, 62, 67, 71], [55, 58, 64, 67, 73], [53, 57, 62, 69, 74], [55, 59, 62, 65, 71]];
  const s = [];
  let t = 0;
  for (const [a, b, c, d, e] of bars) {
    for (let h = 0; h < 2; h++) {
      s.push([t, 2, a - 12, a], [t + .25, 1.75, b]);
      [c, d, e, c, d, e].forEach((m, k) => s.push([t + .5 + k * .25, .24, m]));
      t += 2;
    }
  }
  s.push([t, 4, 36, 48, 55, 64, 72]);
  return s;
}

// the setlist: the church's pieces, then the three new ones; `reps` plays a short piece twice
export const SETLIST = [
  ...SONGS.map(S => ({ name: S.name, score: S.score, beat: S.beat })),
  { name: 'prélude en do · j.-s. bach', score: prelude(), beat: .6 },
  { name: 'amazing grace · cantique', score: grace(), beat: .52 },
  { name: 'dans l\'antre du roi de la montagne · grieg', score: mountainKing(), beat: .42 },
].map(S => {
  const beats = S.score.reduce((a, [t, l]) => Math.max(a, t + l), 0);
  return { ...S, beats, reps: beats * S.beat < 26 ? 2 : 1 };
});

// the four levels: lanes, the smallest gap between two notes, from how long a note is held, chords
export const LEVELS = {
  facile: { lanes: 4, gap: .62, hold: .75, chord: 1, look: 2.3, perfect: .06, good: .13 },
  normal: { lanes: 5, gap: .34, hold: .6, chord: 1, look: 1.9, perfect: .05, good: .115 },
  difficile: { lanes: 6, gap: .2, hold: .5, chord: 2, look: 1.55, perfect: .045, good: .1 },
  expert: { lanes: 6, gap: .115, hold: .45, chord: 3, look: 1.25, perfect: .04, good: .09 },
};
// the keys under the fingers, home row: s d f · j k l (the same on azerty and qwerty)
export const LANE_KEYS = {
  4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
  5: ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'],
  6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
};

// a piece and a level → { gems, accomp, length }: gems { t, lane, len (0: a tap), notes, gold, phrase },
// accomp [t, len, ...notes] in seconds, what plays by itself
export function makeChart(song, level) {
  const S = SETLIST[song % SETLIST.length], L = LEVELS[level] || LEVELS.normal, N = L.lanes;
  const span = S.beats + 2;
  const ev = [];
  for (let r = 0; r < S.reps; r++) for (const [t, l, ...notes] of S.score) ev.push({ t: +((t + r * span) * S.beat).toFixed(4), l: l * S.beat, notes, used: false });
  ev.sort((a, b) => a.t - b.t || Math.max(...b.notes) - Math.max(...a.notes));
  // the onsets, and the top voice at each
  const groups = [];
  for (const e of ev) { const g = groups[groups.length - 1]; if (g && Math.abs(g.t - e.t) < .002) g.ev.push(e); else groups.push({ t: e.t, ev: [e] }); }
  for (const g of groups) g.lead = g.ev.reduce((a, e) => Math.max(...e.notes) > Math.max(...a.notes) || (Math.max(...e.notes) === Math.max(...a.notes) && e.l > a.l) ? e : a);
  // what the level keeps: a note at least `gap` after the last one; a long note just after a short
  // one (a grace note, a mordent) takes its place
  const kept = [];
  for (const g of groups) {
    const a = kept[kept.length - 1], b = kept[kept.length - 2];
    if (!a || g.t - a.t >= L.gap - 1e-4) kept.push(g);
    else if (g.lead.l > a.lead.l * 1.8 && (!b || g.t - b.t >= L.gap - 1e-4)) kept[kept.length - 1] = g;
  }
  const top = (e) => Math.max(...e.notes);
  // lanes from the contour: the pitch within the range of the notes around it
  const gems = [];
  let prevP = null, prevLane = Math.floor(N / 2);
  kept.forEach((g, i) => {
    const p = top(g.lead);
    let lo = p, hi = p;
    for (let j = i - 1; j >= 0 && g.t - kept[j].t < 3; j--) { lo = Math.min(lo, top(kept[j].lead)); hi = Math.max(hi, top(kept[j].lead)); }
    for (let j = i + 1; j < kept.length && kept[j].t - g.t < 3; j++) { lo = Math.min(lo, top(kept[j].lead)); hi = Math.max(hi, top(kept[j].lead)); }
    if (hi - lo < N + 1) { const c = (hi + lo) / 2; lo = c - (N + 1) / 2; hi = c + (N + 1) / 2; }
    let lane = Math.max(0, Math.min(N - 1, Math.round((p - lo) / (hi - lo) * (N - 1))));
    // a repeated note stays put, a new one moves the way the tune goes
    if (prevP != null) {
      if (p === prevP) lane = prevLane;
      else if (lane === prevLane) lane = Math.max(0, Math.min(N - 1, lane + (p > prevP ? 1 : -1)));
      if (lane === prevLane && p !== prevP) lane = prevLane + (prevLane > 0 ? -1 : 1);
    }
    prevP = p; prevLane = lane;
    g.lead.used = true;
    gems.push({ t: g.t, lane, len: g.lead.l, notes: g.lead.notes, pitch: p, gold: false, phrase: 0 });
    // chords: the other voices starting there, in lanes away from the tune
    const spare = gems.length > 1 ? g.t - gems[gems.length - 2].t : 9;
    const others = g.ev.filter(e => e !== g.lead).sort((a, b) => top(b) - top(a));
    for (let k = 0; k < L.chord - 1 && k < others.length && spare >= L.gap * 1.6; k++) {
      const taken = gems.filter(q => q.t === g.t).map(q => q.lane);
      const want = [lane - 2, lane - 3, lane + 2, lane + 3, lane - 1, lane + 1].find(x => x >= 0 && x < N && !taken.includes(x));
      if (want == null) break;
      others[k].used = true;
      gems.push({ t: g.t, lane: want, len: 0, notes: others[k].notes, sound: others[k].l, pitch: top(others[k]), gold: false, phrase: 0, extra: true });
    }
  });
  // holds: long notes, cut short before the next one in the same lane
  for (let i = 0; i < gems.length; i++) {
    const q = gems[i];
    if (q.extra) continue;
    q.sound = q.len;
    const next = gems.find((o, j) => j > i && o.lane === q.lane);
    const room = next ? next.t - q.t - Math.max(.18, L.gap * .8) : q.len;
    q.len = q.len >= Math.max(L.hold, S.beat * 1.3) ? Math.min(q.len, room) : 0;
    if (q.len < .35) q.len = 0;
  }
  // phrases of eight tune notes; every fourth one, from the second, is gold: all of it fills the grand jeu
  let n = 0;
  for (const q of gems) { if (!q.extra) n++; q.phrase = Math.floor(Math.max(0, n - 1) / 8); q.gold = q.phrase % 4 === 1; }
  const accomp = ev.filter(e => !e.used).map(e => [e.t, e.l, ...e.notes]);
  const length = ev.reduce((a, e) => Math.max(a, e.t + e.l), 0);
  return { gems, accomp, length, beat: S.beat, name: S.name };
}
