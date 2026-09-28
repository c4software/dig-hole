// roomadmin.js, the owner's hand on a room when nobody hosts it from a tab: the node server's
// garden, driven from the web console (serveur.html?admin=…) or the command line (admin.mjs).
// The same calls as a hosting tab's panel: live values, gifts, kick, raid, new map, a word to all.
import { noteList } from './room.js';

const DAY8 = 360 * 8;
// the garden's clock, as the game computes it together (main.js clockNow)
export const gardenClock = (a, now = Date.now()) => a ? ((a[1] + (now - a[0]) / 1000 * a[2]) % DAY8 + DAY8) % DAY8 : (now / 1000) % DAY8;

// room: room.js; tun: a tunables registry for it (createTunables), loaded with what the room had
export function roomAdmin(room, { tun, saveTun = () => {}, notes = null, saveNotes = () => {}, by = 'le serveur' } = {}) {
  const apply = () => { room.setTun(tun.snapshot()); saveTun(tun.snapshot()); return tun.snapshot(); };
  // the clock's pace: anchored where it is now, so it doesn't jump
  const speed = (v) => { const c = gardenClock(tun.get('clockAnchor')); tun.set('timeSpeed', v); tun.set('clockAnchor', [Date.now(), c, tun.get('timeSpeed')]); };
  const calls = {
    values: () => tun.snapshot(),
    set(k, v) { if (k === 'timeSpeed') speed(v); else tun.set(k, v); return apply(); },
    reset(k) { if (k === 'timeSpeed') speed(1); else tun.reset(k || undefined); return apply(); },
    players: () => room.players().map(p => ({ id: p.id, name: p.name, color: p.color, p: p.p, w: p.w, g: p.g || null })),
    give(id, gift) { return room.give(id == null ? null : +id, gift, by); },
    kick: (id) => room.kick(+id, 'renvoyé par le serveur'),
    act: (id, what, v) => room.act(id == null ? null : +id, what, v, by),
    refinds() { room.op({ k: 'refinds' }); return true; },
    superReset() { return room.superReset(by); },
    raid() { room.broadcast({ t: 'admin', a: 'raid' }); return true; },
    resetMap() { room.op({ k: 'reset', seed: Math.floor(Math.random() * 1e9) }); return true; },
    say(text) {
      text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!text) return false;
      room.broadcast({ t: 'admin', a: 'say', text, by });
      return true;
    },
    notes: () => notes ? noteList(notes) : [],
    delNote(at) { if (!notes) return false; const i = notes.findIndex(n => n.at === +at); if (i < 0) return false; notes.splice(i, 1); saveNotes(); return true; },
    worldData: () => ({ game: 'a-hole', v: 1, room: room.name, at: Date.now(), ops: room.ops, tun: room.tun, notes: notes || [] }),
  };
  // what the panel shows (the same shape as a hosting tab's snap)
  const snap = () => ({
    room: room.name, ops: room.ops.length, values: tun.snapshot(), node: true,
    players: calls.players(), guests: [], sig: { state: 'node', code: null, link: null },
    notes: notes ? noteList(notes) : null,
  });
  return { calls, snap };
}
