// events-calendar.js, the feasts of the year by the calendar: which ones are on at a date,
// Easter worked out, and whose date counts. No THREE, no DOM: node tests it (test/events.test.mjs).
// The date is the server's: solo, this machine; in a room, the node server or the host's tab
// sends its own (room.js: welcome.date and { t: 'date' }), so every digger sees the same feast.

// Easter Sunday (Gregorian), the anonymous algorithm (Meeus/Jones/Butcher): [month 1-12, day]
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

// days since 1970 of a calendar date (no time zone in it)
export const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
const fromNum = (n) => { const t = new Date(n * 864e5); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
const easterNum = (y) => dayNum(y, ...easter(y));

// id, name, where (eu: the village and the garden, jp: japan), a line for the banner,
// span(y): [first day, last day] as day numbers for the one that starts in year y
// kind: the decor it gets (two feasts may share one), season: forced while it's on
export const EVENTS = [
  { id: 'noel', name: 'noël', region: 'eu', season: 3, sub: 'il neige sur le village · le père noël a semé ses cadeaux', span: (y) => [dayNum(y, 12, 1), dayNum(y, 12, 31)] },
  { id: 'nouvelan', name: 'nouvel an', region: 'eu', season: 3, sub: 'feu d\'artifice à minuit · bonne année !', span: (y) => [dayNum(y, 12, 31), dayNum(y + 1, 1, 2)] },
  { id: 'epiphanie', name: 'épiphanie', region: 'eu', sub: 'la galette des rois est à la boulangerie · qui aura la fève ?', span: (y) => [dayNum(y, 1, 3), dayNum(y, 1, 15)] },
  { id: 'chandeleur', name: 'chandeleur', region: 'eu', kind: 'crepes', sub: 'des crêpes sur la place · fais-les sauter une pièce en main', span: (y) => [dayNum(y, 2, 1), dayNum(y, 2, 3)] },
  { id: 'mardigras', name: 'mardi gras', region: 'eu', kind: 'crepes', sub: 'crêpes et confettis sur la place', span: (y) => [easterNum(y) - 49, easterNum(y) - 47] },
  { id: 'valentin', name: 'saint-valentin', region: 'eu', sub: 'des cœurs flottent sur le village · attrape-les', span: (y) => [dayNum(y, 2, 10), dayNum(y, 2, 14)] },
  { id: 'paques', name: 'pâques', region: 'eu', sub: 'les cloches rentrent de rome · des œufs cachés partout, même sous terre', span: (y) => [easterNum(y) - 7, easterNum(y) + 1] },
  { id: 'poisson', name: 'poisson d\'avril', region: 'eu', sub: 'colle des poissons dans le dos des passants', span: (y) => [dayNum(y, 4, 1), dayNum(y, 4, 1)] },
  { id: 'hanami', name: 'hanami', region: 'jp', sub: 'les cerisiers du japon sont en fleurs · pique-nique sous les arbres', span: (y) => [dayNum(y, 3, 25), dayNum(y, 4, 12)] },
  { id: 'musique', name: 'fête de la musique', region: 'eu', sub: 'des musiciens sur la place · l\'orgue joue tout seul', span: (y) => [dayNum(y, 6, 21), dayNum(y, 6, 21)] },
  { id: 'tanabata', name: 'tanabata', region: 'jp', kind: 'natsu', sub: 'des lanternes au japon · accroche un vœu au bambou', span: (y) => [dayNum(y, 7, 1), dayNum(y, 7, 7)] },
  { id: 'juillet', name: '14 juillet', region: 'eu', sub: 'drapeaux, bal et feu d\'artifice sur le village à la nuit', span: (y) => [dayNum(y, 7, 13), dayNum(y, 7, 14)] },
  { id: 'obon', name: 'obon', region: 'jp', kind: 'natsu', sub: 'des lanternes pour les ancêtres · accroche un vœu au bambou', span: (y) => [dayNum(y, 8, 13), dayNum(y, 8, 16)] },
  { id: 'halloween', name: 'halloween', region: 'eu', sub: 'citrouilles, chauves-souris et fantômes · des bonbons ou un sort !', span: (y) => [dayNum(y, 10, 20), dayNum(y, 11, 2)] },
];
export const EVENT_IDS = EVENTS.map(e => e.id);
export const BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));
export const kindOf = (id) => BY_ID[id]?.kind || id;

// the tunable `event` is a number: -1 auto (the date), 0 none, n the n-th feast
export const EVENT_OPTIONS = [[-1, 'auto'], [0, 'aucune'], ...EVENTS.map((e, n) => [n + 1, e.name])];
export const tunToOverride = (v) => v == null || v < 0 ? 'auto' : v === 0 ? 'none' : EVENT_IDS[v - 1] || 'auto';
export const overrideToTun = (o) => o === 'none' ? 0 : EVENT_IDS.includes(o) ? EVENT_IDS.indexOf(o) + 1 : -1;
// ?event=noel, ?event=none, ?event=auto: for trying one out; anything else: no say
export function parseOverride(s) {
  if (s == null) return null;
  s = String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  if (s === 'auto' || s === '') return 'auto';
  if (s === 'none' || s === 'aucun' || s === 'aucune' || s === 'off') return 'none';
  const alias = { christmas: 'noel', easter: 'paques', '14juillet': 'juillet', bastille: 'juillet', nouvelan: 'nouvelan', newyear: 'nouvelan', saintvalentin: 'valentin', valentine: 'valentin', poissondavril: 'poisson', avril: 'poisson', fetedelamusique: 'musique', galette: 'epiphanie', crepes: 'chandeleur' };
  const id = alias[s] || s;
  return EVENT_IDS.includes(id) ? id : null;
}

// the feasts on at a date ({ y, m, d }), each with the year it started in (its key: noel-2026)
export function activeEvents({ y, m, d }, override = 'auto') {
  if (override === 'none') return [];
  const n = dayNum(y, m, d);
  if (override && override !== 'auto') {
    const e = BY_ID[override];
    if (!e) return [];
    // forced: the one of this season if it's on, else the one of this year
    const on = [y - 1, y].find(yy => { const [a, b] = e.span(yy); return n >= a && n <= b; });
    return [{ id: e.id, year: on ?? y, key: `${e.id}-${on ?? y}`, forced: true, ...span(e, on ?? y) }];
  }
  const out = [];
  for (const e of EVENTS) for (const yy of [y - 1, y]) {
    const [a, b] = e.span(yy);
    if (n >= a && n <= b) { out.push({ id: e.id, year: yy, key: `${e.id}-${yy}`, forced: false, ...span(e, yy) }); break; }
  }
  return out;
}
function span(e, y) { const [a, b] = e.span(y); return { from: fromNum(a), to: fromNum(b) }; }

// "jusqu'au 31 déc."
const MONTHS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const fmtDay = ([, m, d]) => `${d === 1 ? '1er' : d} ${MONTHS[m - 1]}`;

// ---------- whose date: the server's ----------
// set({ at, tz }): the server's Date.now() when it spoke and its offset from UTC in minutes
// (east positive). Until then (solo), this machine's own date.
export function createServerClock(localNow = () => Date.now()) {
  let skew = 0, tz = null;
  const subs = new Set();
  return {
    set(date, recvAt = localNow()) {
      if (!date || !Number.isFinite(+date.at)) return;
      const nz = Number.isFinite(+date.tz) ? +date.tz : null;
      const ns = +date.at - recvAt;
      const moved = tz !== nz || Math.abs(ns - skew) > 60000;
      skew = ns; tz = nz;
      if (moved) for (const f of subs) { try { f(); } catch (e) { console.error(e); } }
    },
    clear() { skew = 0; tz = null; },
    get remote() { return tz != null; },
    // the calendar date where the server is: { y, m, d, h }
    parts() {
      const ms = localNow() + skew;
      if (tz == null) { const t = new Date(ms); return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), h: t.getHours() + t.getMinutes() / 60 }; }
      const t = new Date(ms + tz * 60000);
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours() + t.getUTCMinutes() / 60 };
    },
    on(f) { subs.add(f); return () => subs.delete(f); },
  };
}
export const serverClock = createServerClock();
// what a room says of its date (room.js puts it in the welcome)
export const dateNow = (now = Date.now()) => ({ at: now, tz: -new Date(now).getTimezoneOffset() });
