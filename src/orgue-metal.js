// orgue-metal.js, cathedral metal: public-domain classics (Wagner, Beethoven, Vivaldi, Rimski,
// Paganini, Chopin, Haendel, Bach, the Dies irae) and a few pieces of our own, arranged for the
// organ played like a heavy band: the pedal driving in eighths, fifths held on the plenum, a fast
// tremolo, big reeds through a little distortion (church.js). Same score format as church.js:
// [start in beats, length in beats, midi notes…]; the rhythm section is marked `acc` (it never
// becomes a note to play in orgue héros, see orgue-songs.js makeChart).

const acc = (e) => { e.acc = true; return e; };
// a tune from beat t: [[midi (0: a rest), beats]…], doubled an octave (or two) down; returns the end
function line(s, t, notes, { up = 0, dbl = [-12], stac = .88 } = {}) {
  for (const [m, l] of notes) {
    if (m) s.push([t, l * (l <= .25 ? .8 : stac), m + up, ...dbl.map(d => m + up + d)]);
    t += l;
  }
  return t;
}
// the band under a progression [[root (0: silence), beats]…], roots in the pedal's octave (28-45):
// the pedal every `sub` beats (or on `pat`, offsets within a beat: a gallop), the power chord
// (root, fifth, octave) held, a tremolo on the fifth every `trem` beats
function band(s, t, prog, { sub = .5, pat = null, trem = 0, chord = true, walk = null } = {}) {
  for (const [r, l] of prog) {
    if (r) {
      if (walk) walk.forEach((d, k) => { if (k * .5 < l - 1e-6) s.push(acc([t + k * .5, .4, r + d - 12, r + d])); });
      else if (pat) for (let b = 0; b < l - 1e-6; b++) for (const o of pat) { if (b + o < l - 1e-6) s.push(acc([t + b + o, .2, r - 12, r])); }
      else for (let k = 0; k * sub < l - 1e-6; k++) s.push(acc([t + k * sub, sub * .75, r - 12, r]));
      if (chord) s.push(acc([t, l * .96, r + 12, r + 19, r + 24]));
      if (trem) for (let k = 0; k * trem < l - 1e-6; k++) s.push(acc([t + k * trem, trem * .7, r + 24, r + 31]));
    }
    t += l;
  }
  return t;
}
// a big chord to finish on, held (not accompaniment: the last note to play)
const last = (s, t, l, ...notes) => { s.push([t, l, ...notes]); return t + l; };
// sixteenths up and down a chord: tones low to high, over `oct` octaves, `beats` long
function arp(tones, beats, oct = 2) {
  const up = [];
  for (let o = 0; o < oct; o++) for (const m of tones) up.push(m + 12 * o);
  const cyc = [...up, ...up.slice(1, -1).reverse()], out = [];
  for (let k = 0; k < beats * 4; k++) out.push([cyc[k % cyc.length], .25]);
  return out;
}

// La chevauchée des Walkyries (Wagner): the dotted call rising through B minor, D, F sharp, twice,
// the pedal galloping in 9/8
function walkyries() {
  const A = [[66, .75], [71, 3.75], [66, .25], [71, .5], [74, 3.75], [71, .25], [74, .5], [78, 3.75], [74, .25], [78, .5], [81, 3.75],
    [69, .75], [74, 3.75], [69, .25], [74, .5], [78, 3.75], [74, .25], [78, .5], [81, 3.75], [78, .25], [81, .5], [85, 3.75],
    [73, .75], [78, 3.75], [73, .25], [78, .5], [81, 3.75], [78, .25], [81, .5], [85, 3.75], [81, .25], [85, .5], [83, 1.5], [78, 1.5], [71, .75]];
  const P = [[35, 18], [38, 18], [42, 13.5], [35, 4.5]];
  const s = [];
  let t = 0;
  line(s, t, A); t = band(s, t, P);
  line(s, t, A, { dbl: [-12, -24] }); t = band(s, t, P, { trem: .25 });
  last(s, t, 6, 23, 35, 47, 54, 59, 62, 66, 71);
  return s;
}
// the Fifth Symphony (Beethoven): the four notes of fate, the development hammering them, the
// horn call, fate again, the C minor hammer blows
function fifth() {
  const fate = [[0, .5], [67, .5], [67, .5], [67, .5], [63, 3], [0, .5], [65, .5], [65, .5], [65, .5], [62, 4]];
  const fateB = [[0, 2], [36, 3], [0, 2], [43, 4]];
  const g = (m, n, e, le = .5) => [[m, .5], [m, .5], [m, .5], [n, le], ...(e || [])];
  const dev1 = [...g(67, 63), ...g(68, 67), [75, .5], [75, .5], [75, .5], [72, 2.5]], dev1B = [[36, 2], [41, 2], [36, 4]];
  const dev2 = [...g(65, 62), ...g(67, 65), [74, .5], [74, .5], [74, .5], [71, 2.5]], dev2B = [[43, 2], [36, 2], [43, 4]];
  const horn = [[0, .5], [70, .5], [70, .5], [70, .5], [75, 2], [77, 2], [58, 4]], hornB = [[0, 2], [39, 2], [34, 2], [39, 4]];
  const end = [[72, 1], [0, 1], [67, 1], [0, 1], [72, 1], [0, 1]], endB = [[36, 1], [0, 1], [43, 1], [0, 1], [36, 1], [0, 1]];
  const s = [];
  let t = 0;
  const part = (mel, prog, o = {}) => { line(s, t, mel, { dbl: [-12, -24], ...o }); t = band(s, t, prog, o); };
  part(fate, fateB, { chord: false });
  part(fate, fateB, { up: 12, trem: .25 });
  part(dev1, dev1B); part(dev2, dev2B); part(dev1, dev1B, { up: 12 }); part(dev2, dev2B, { up: 12, trem: .25 });
  part(horn, hornB);
  part(dev1, dev1B, { trem: .25 }); part(dev2, dev2B, { trem: .25 });
  part(fate, fateB, { up: 12, sub: .25 });
  part(end, endB);
  last(s, t, 5, 24, 36, 48, 55, 60, 63, 67, 72);
  return s;
}
// L'hiver, first movement (Vivaldi): the chattering eighths piling up, the trill and the fall,
// the solo's arpeggios round F minor, the chatter again
function winter() {
  const s = [];
  let t = 0;
  // the chatter: each bar one voice more, the top voice is the tune
  const pile = [53, 56, 62, 65];
  pile.forEach((m, k) => {
    for (let e = 0; e < 8; e++) { s.push([t + e * .5, .4, m, m - 12]); if (k) s.push(acc([t + e * .5, .4, ...pile.slice(0, k)])); }
    t = band(s, t, [[29, 4]], { chord: k > 1 });
  });
  const trill = [];
  for (let k = 0; k < 8; k++) trill.push([k % 2 ? 76 : 77, .25]);
  const fall = [77, 75, 73, 72, 70, 68, 67, 65].map(m => [m, .25]);
  const tf = () => { line(s, t, [...trill, ...fall, ...trill.map(([m, l]) => [m - 5, l]), ...fall.map(([m, l]) => [m - 5, l])]); t = band(s, t, [[41, 4], [36, 4]], { sub: .25 }); };
  const solo = (o = {}) => {
    const prog = [[41, [65, 68, 72, 77]], [34, [65, 70, 73, 77]], [36, [64, 67, 70, 72]], [41, [65, 68, 72, 77]], [37, [65, 68, 73, 77]], [34, [65, 70, 73, 77]], [36, [64, 67, 70, 76]], [41, [65, 68, 72, 77]]];
    for (const [r, tones] of prog) { line(s, t, arp(tones, 4, 2), { dbl: [-12] }); t = band(s, t, [[r, 4]], o); }
  };
  tf(); solo(); tf(); solo({ trem: .25 }); tf();
  last(s, t, 5, 29, 41, 53, 60, 65, 68, 72, 77);
  return s;
}
// Le vol du bourdon (Rimski-Korsakov): the dive from above, then the buzzing chromatic line in
// A minor, a fourth higher, back, in sixteenths the whole way
function bumblebee() {
  const T1 = [76, 75, 74, 73, 72, 77, 76, 75, 76, 75, 74, 73, 72, 73, 74, 75];
  const T2 = [76, 75, 74, 73, 72, 77, 76, 75, 76, 75, 74, 73, 72, 71, 70, 69];
  const q = (a, up = 0) => a.map(m => [m + up, .25]);
  const s = [];
  let t = 0;
  const dive = [];
  for (let m = 88; m > 64; m--) dive.push(m);
  line(s, t, q(dive)); t = band(s, t, [[40, 6]], { trem: .25 });
  const pass = (o = {}) => {
    line(s, t, [...q(T1), ...q(T2)]); t = band(s, t, [[33, 4], [33, 2], [40, 2]], o);
    line(s, t, [...q(T1, 5), ...q(T2, 5)]); t = band(s, t, [[38, 4], [38, 2], [45, 2]], o);
    line(s, t, [...q(T1), ...q(T2)]); t = band(s, t, [[33, 4], [40, 2], [33, 2]], o);
  };
  pass(); pass({ trem: .25 }); pass({ trem: .25, sub: .25 });
  const run = [];
  for (let m = 64; m <= 88; m++) run.push(m);
  line(s, t, q(run)); t = band(s, t, [[40, 6.25]], { sub: .25 });
  last(s, t, 4, 21, 33, 45, 52, 57, 64, 69, 81);
  return s;
}
// Caprice n° 24 (Paganini): the theme on A minor and E, its second half round the circle of
// fifths, the first variation's arpeggios, the theme once more over the tremolo
function caprice() {
  const bar = (r, third) => [[r, 1], [r, .25], [r + third, .25], [r + third - 1 - (third === 4 ? 1 : 0), .25], [r, .25]];
  const first = [...bar(69, 3), [76, 1], [64, 1], ...bar(69, 3), [76, 1], [64, 1]], firstB = [[33, 2], [40, 2], [33, 2], [40, 2]];
  const circle = [[69, 3, 33], [74, 3, 38], [67, 4, 43], [72, 4, 36], [65, 4, 41], [71, 3, 35], [76, 4, 40], [69, 3, 33]];
  const second = circle.flatMap(([r, th]) => bar(r, th)), secondB = circle.map(([, , b]) => [b, 2]);
  const arpBar = (r, th) => [r, r + th, r + 7, r + 12, r + 7, r + th, r, r - 5].map(m => [m, .25]);
  const var1 = [[69, 3], [64, 4], [69, 3], [64, 4]].flatMap(([r, th]) => arpBar(r, th)), var2 = circle.flatMap(([r, th]) => arpBar(r, th));
  const s = [];
  let t = 0;
  const part = (mel, prog, o = {}) => { line(s, t, mel, o); t = band(s, t, prog, o); };
  part(first, firstB); part(first, firstB); part(second, secondB);
  part(var1, firstB, { sub: .25 }); part(var1, firstB, { sub: .25 }); part(var2, secondB, { sub: .25 });
  part(first, firstB, { trem: .25 }); part(second, secondB, { trem: .25 });
  line(s, t, [[76, .5], [64, .5]]); t = band(s, t, [[40, 1]]);
  last(s, t, 4, 21, 33, 45, 52, 57, 64, 69, 72, 81);
  return s;
}
// Marche funèbre (Chopin): the funeral step in B flat minor, slow and crushing, then again an
// octave up with the double pedal, then with everything
function funeral() {
  const m1 = [[58, 1], [58, .75], [58, .25], [58, 2]], m2 = [[61, 1], [60, .75], [60, .25], [58, 1], [58, .75], [57, .25]];
  const m2b = [[61, 1], [60, .75], [60, .25], [58, 1], [57, 1]];
  const A = [...m1, ...m2, ...m1, ...m2b, [58, 4]], AB = [[34, 4], [30, 2], [34, 2], [34, 4], [30, 2], [29, 2], [34, 4]];
  const s = [];
  let t = 0;
  line(s, t, A, { up: 12, dbl: [-12, -24] }); t = band(s, t, AB, { sub: 1 });
  line(s, t, A, { up: 12, dbl: [-12, -24] }); t = band(s, t, AB, { sub: .5 });
  line(s, t, A, { up: 24, dbl: [-12, -24] }); t = band(s, t, AB, { sub: .25, trem: .25 });
  last(s, t, 6, 22, 34, 46, 53, 58, 61, 65, 70);
  return s;
}
// Alléluia (Haendel, le Messie): the call and its answers, « king of kings » climbing a step at
// a time, the call again over the tremolo
function hallelujah() {
  const H = (r) => [[r, 1], [r - 5, .75], [r - 3, .25], [r - 5, 1], [0, 1]];
  const calls = [...H(74), ...H(74), ...H(79), ...H(74)], callsB = [[38, 2], [33, 2], [38, 2], [33, 2], [43, 2], [38, 2], [38, 2], [33, 2]];
  const kings = [74, 76, 78, 79, 81].flatMap(p => [[p, 1.5], [p, .5], [p - 5, .5], [p - 3, .5], [p - 5, 1]]);
  const kingsB = [[38, 4], [45, 4], [38, 4], [43, 4], [38, 4]];
  const s = [];
  let t = 0;
  const part = (mel, prog, o = {}) => { line(s, t, mel, o); t = band(s, t, prog, o); };
  part(calls, callsB); part(kings, kingsB); part(calls, callsB, { up: 12, trem: .25 }); part(kings, kingsB, { trem: .25, sub: .25 });
  line(s, t, [[81, 1], [76, .75], [78, .25], [76, 1]]); t = band(s, t, [[33, 3]]);
  last(s, t, 6, 26, 38, 50, 57, 62, 66, 69, 74);
  return s;
}
// the Toccata (Bach) with the band: the mordents over a chugging D, twice, the second time
// with the tremolo. Its own notes as church.js writes them (passed in: no import cycle)
function toccataMetal(toccata) {
  const s = [];
  let t = 0;
  for (const o of [{}, { trem: .25, sub: .25 }]) {
    const src = toccata(), len = src.reduce((a, [st, l]) => Math.max(a, st + l), 0);
    // (its lone pedal D is the band's now)
    for (const [st, l, ...n] of src) { const e = [t + st, l, ...n]; s.push(Math.max(...n) < 50 ? acc(e) : e); }
    band(s, t, [[38, 34], [38, len - 34 - 5.8], [33, .8], [38, 5]], o);
    t += len + .5;
  }
  return s;
}
// the Dies irae (plainchant) as a battle hymn: a riff, the chant over the gallop, an octave up
// over the tremolo, then twice as fast. The crypt listens for its name (crypt.js: /dies irae/)
function diesMetal() {
  const chant = [[65, 1], [64, 1], [65, 1], [62, 1], [64, 1], [60, 1], [62, 2], [62, 2],
    [65, 1], [65, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [65, 1], [64, 1], [62, 2], [62, 3]];
  const CB = [[38, 4], [36, 2], [38, 4], [34, 4], [36, 4], [38, 4], [33, 4]];
  const riff = [[62, .5], [62, .5], [65, .5], [62, .5], [67, .5], [62, .5], [65, .5], [64, .5]];
  const s = [];
  let t = 0;
  line(s, t, [...riff, ...riff]); t = band(s, t, [[38, 8]], { sub: .25, chord: false });
  line(s, t, chant, { dbl: [-12, -24] }); t = band(s, t, CB, { pat: [0, .5, .75] });
  line(s, t, chant, { up: 12, dbl: [-12, -24] }); t = band(s, t, CB, { pat: [0, .5, .75], trem: .25 });
  const fast = chant.map(([m, l]) => [m, l / 2]);
  line(s, t, [...fast, ...fast]); t = band(s, t, [...CB, ...CB].map(([r, l]) => [r, l / 2]), { sub: .25 });
  last(s, t, 6, 26, 38, 50, 57, 62, 65, 69, 74);
  return s;
}

// ---------- ours ----------
// « les gargouilles en tournée »: a chugging E minor riff, a sung chorus, a pentatonic solo
function gargoyles() {
  const R = [[64, .5], [64, .5], [67, .5], [64, .5], [69, .5], [64, .5], [70, .5], [69, .5]];
  const C = [[76, 1.5], [74, .5], [71, 1], [74, 1], [76, 1.5], [79, .5], [78, 1], [74, 1], [72, 1.5], [71, .5], [69, 1], [67, 1], [66, 1], [67, 1], [69, 1], [71, 1]];
  const CB = [[36, 4], [38, 4], [33, 4], [35, 4]];
  const pent = [64, 67, 69, 71, 74, 76, 79, 81, 83, 86];
  const solo = [...pent, ...pent.slice(0, -1).reverse(), ...pent.slice(1), ...pent.slice(1, -1).reverse()].slice(0, 32).map(m => [m, .25]);
  const s = [];
  let t = 0;
  const riff = (n, o = {}) => { for (let k = 0; k < n; k++) { line(s, t, R); t = band(s, t, [[40, 4]], { sub: .25, chord: k % 2 === 1, ...o }); } };
  const chorus = (o = {}) => { line(s, t, C, { dbl: [-12, -24], ...o }); t = band(s, t, CB, o); };
  riff(2, { chord: false }); riff(2, { trem: .25 }); chorus(); riff(2); chorus({ trem: .25 });
  line(s, t, solo); t = band(s, t, [[40, 4], [38, 4]], { sub: .25 });
  chorus({ up: 12, trem: .25 }); riff(2);
  line(s, t, [[76, .5], [0, .5], [76, .5], [0, .5]]); t = band(s, t, [[40, .5], [0, .5], [40, .5], [0, .5]]);
  last(s, t, 4, 28, 40, 52, 59, 64, 67, 71, 76);
  return s;
}
// « orgue de feu »: D harmonic minor, sweeps, a galloping theme, a climb
function fireOrgan() {
  const sweep = [[38, [62, 65, 69]], [34, [62, 65, 70]], [43, [62, 67, 70]], [33, [61, 64, 69]]];
  const A = [[74, 1.5], [73, .5], [74, 1], [77, 1], [76, 1.5], [74, .5], [73, 1], [69, 1], [70, 1.5], [69, .5], [67, 1], [70, 1], [69, 2], [73, 2]];
  const AB = [[38, 4], [33, 4], [43, 4], [33, 4]];
  const B = [[77, .5], [76, .5], [77, .5], [79, .5], [81, 1], [77, 1], [79, .5], [77, .5], [76, .5], [74, .5], [73, 2],
    [74, .5], [76, .5], [77, .5], [79, .5], [81, .5], [82, .5], [81, .5], [79, .5], [81, 4]];
  const BB = [[38, 4], [33, 4], [34, 4], [33, 4]];
  const s = [];
  let t = 0;
  const sweeps = (o = {}) => { for (const [r, tones] of sweep) { line(s, t, arp(tones, 2, 2)); t = band(s, t, [[r, 2]], { sub: .25, ...o }); } };
  const part = (mel, prog, o = {}) => { line(s, t, mel, { dbl: [-12, -24], ...o }); t = band(s, t, prog, { pat: [0, .5, .75], ...o }); };
  sweeps(); part(A, AB); part(B, BB); sweeps({ trem: .25 }); part(A, AB, { up: 12, trem: .25 }); part(B, BB, { trem: .25 });
  last(s, t, 6, 26, 38, 50, 57, 62, 65, 69, 74);
  return s;
}
// « le sonneur est en retard »: the bells rung in a hurry, then a twelve-bar boogie in A
function bellRinger() {
  const peal = [81, 79, 76, 74, 72, 69];
  const I = [[76, .5], [79, .5], [81, 1], [79, .5], [76, .5], [74, 1]];
  const bars = [
    I, [[76, .5], [79, .5], [81, .5], [84, .5], [83, .5], [81, .5], [79, 1]], [[76, .5], [79, .5], [81, 1], [79, .5], [76, .5], [74, .5], [72, .5]], [[69, 2], [72, .5], [73, .5], [76, 1]],
    [[74, .5], [77, .5], [78, 1], [77, .5], [74, .5], [72, 1]], [[74, .5], [77, .5], [78, .5], [81, .5], [79, .5], [78, .5], [74, 1]], I, [[69, 1], [72, .5], [73, .5], [76, .5], [79, .5], [81, 1]],
    [[83, 1], [81, .5], [79, .5], [76, 1], [74, 1]], [[81, 1], [79, .5], [78, .5], [74, 1], [72, 1]], [[69, .5], [72, .5], [73, .5], [76, .5], [79, .5], [81, .5], [84, .5], [81, .5]], [[83, 2], [80, 1], [76, 1]],
  ];
  const roots = [33, 33, 33, 33, 38, 38, 33, 33, 40, 38, 33, 40];
  const boogie = [0, 4, 7, 9, 10, 9, 7, 4];
  const s = [];
  let t = 0;
  line(s, t, [...peal, ...peal].map(m => [m, .5]), { dbl: [-12, -24] }); t += 6;
  line(s, t, [...peal, ...peal, ...peal, ...peal].map(m => [m, .25]), { dbl: [-12] }); t = band(s, t, [[33, 6]], { sub: .25, chord: false });
  for (const o of [{}, { trem: .25 }]) bars.forEach((b, k) => { line(s, t, b, o.trem ? { dbl: [-12, -24] } : {}); t = band(s, t, [[roots[k], 4]], { walk: boogie, ...o }); });
  line(s, t, [[81, .5], [76, .5]]); t = band(s, t, [[40, 1]]);
  last(s, t, 5, 21, 33, 45, 52, 57, 61, 64, 69, 81);
  return s;
}

// name, the piece, seconds a beat; `metal`: the reeds and the drive (church.js)
export function metalSongs(toccata) {
  return [
    { name: 'la chevauchée des walkyries · wagner', score: walkyries(), beat: .3 },
    { name: '5e symphonie · beethoven', score: fifth(), beat: .27 },
    { name: 'l\'hiver · vivaldi', score: winter(), beat: .3 },
    { name: 'le vol du bourdon · rimski-korsakov', score: bumblebee(), beat: .4 },
    { name: 'caprice n° 24 · paganini', score: caprice(), beat: .34 },
    { name: 'marche funèbre · chopin', score: funeral(), beat: .5 },
    { name: 'alléluia · haendel', score: hallelujah(), beat: .36 },
    { name: 'toccata métal · j.-s. bach', score: toccataMetal(toccata), beat: .36 },
    { name: 'dies irae · version métal', score: diesMetal(), beat: .3 },
    { name: 'les gargouilles en tournée · la paroisse', score: gargoyles(), beat: .3 },
    { name: 'orgue de feu · la paroisse', score: fireOrgan(), beat: .32 },
    { name: 'le sonneur est en retard · la paroisse', score: bellRinger(), beat: .28 },
  ].map(p => ({ ...p, metal: true }));
}
