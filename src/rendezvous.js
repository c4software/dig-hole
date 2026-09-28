// rendezvous.js, finding a host with no server of our own: public WebTorrent trackers (the
// WebSocket ones browsers use to find each other) relay the WebRTC offers and answers.
// The guest announces a few offers under the room's hash; the tracker hands them to the peers
// already there, the host among them; the host answers one. Everything relayed is sealed with
// AES-GCM under a key derived from the room's name and secret (in the invite link): a tracker
// sees who connects and a hash, never the sdp (so neither the addresses inside it).
//
// Tracker protocol (bittorrent-tracker, WebSocket flavour), JSON:
//   → { action:'announce', info_hash, peer_id, numwant, offers:[{ offer_id, offer:{ type, sdp } }], event, uploaded, downloaded, left }
//   ← { action:'announce', info_hash, peer_id: from, offer_id, offer }       (to the peers of the swarm)
//   → { action:'announce', info_hash, peer_id, to_peer_id, offer_id, answer:{ type, sdp } }
//   ← { action:'announce', info_hash, peer_id: from, offer_id, answer }      (back to the one who offered)

export const TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
];
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const randomId = (n = 20) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); };
export const newSecret = () => randomId(12);

// the room's place on the trackers (20 ascii chars) and its key
export async function roomKeys(room, secret) {
  const hash = hex(await crypto.subtle.digest('SHA-256', enc.encode(`a-hole-rdv:${room}:${secret}`))).slice(0, 20);
  const base = await crypto.subtle.importKey('raw', enc.encode(`${room}:${secret}`), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('a-hole-rdv'), iterations: 20000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { hash, key };
}
export async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}
export async function unseal(key, s) {
  try { const u = unb64(String(s)); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12)))); }
  catch { return null; }
}

// trackers that never answered, for the whole page: after 3 failed tries in a row a tracker
// rests 15 minutes (the browser logs every failed socket: no need to fill the console)
const DEAD = new Map();   // url → { fails, until }
export const deadTrackers = DEAD;
const resting = (url, now = Date.now()) => (DEAD.get(url)?.until || 0) > now;

// one socket per tracker, reopened when it drops; onMsg(tracker, msg)
function trackerLinks({ trackers, WS, onMsg, onOpen, onState }) {
  const links = trackers.map(url => ({ url, ws: null, state: resting(url) ? 'dead' : 'off', retry: 2000, closed: false, opened: false }));
  const open = (l) => {
    if (l.closed) return;
    if (resting(l.url)) { l.state = 'dead'; onState?.(); setTimeout(() => open(l), DEAD.get(l.url).until - Date.now() + 1000); return; }
    let ws;
    try { ws = new WS(l.url); } catch { l.state = 'error'; onState?.(); return; }
    l.ws = ws; l.state = 'connecting'; onState?.();
    ws.onopen = () => { l.state = 'on'; l.retry = 2000; l.opened = true; DEAD.delete(l.url); onState?.(); onOpen?.(l); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(l, m); };
    ws.onerror = () => {};
    ws.onclose = () => {
      l.ws = null;
      if (l.closed) return;
      l.state = 'off';
      if (!l.opened) {
        const d = DEAD.get(l.url) || { fails: 0, until: 0 };
        d.fails++;
        if (d.fails >= 3) { d.until = Date.now() + 15 * 60000; d.fails = 0; l.state = 'dead'; console.info(`relais ${l.url} injoignable : laissé de côté 15 min`); }
        DEAD.set(l.url, d);
      }
      l.opened = false;
      onState?.();
      setTimeout(() => open(l), l.state === 'dead' ? 15 * 60000 : l.retry);
      l.retry = Math.min(60000, l.retry * 2);
    };
  };
  links.forEach(open);
  return {
    links,
    send(l, m) { if (l.ws && l.ws.readyState === 1) { try { l.ws.send(JSON.stringify(m)); return true; } catch {} } return false; },
    get up() { return links.filter(l => l.state === 'on').length; },
    close() { for (const l of links) { l.closed = true; try { l.ws?.close(); } catch {} } },
  };
}

// ---------- the host: stays in the swarm, answers offers that open with the room's key ----------
// onOffer(data, reply): data is what the guest sealed; reply(obj) seals and sends the answer back
export async function hostRendezvous({ room, secret, trackers = TRACKERS, WS = globalThis.WebSocket, onOffer, onState }) {
  const { hash, key } = await roomKeys(room, secret);
  const peerId = randomId();
  let every = 30000;
  const announce = (l, event) => t.send(l, { action: 'announce', info_hash: hash, peer_id: peerId, numwant: 0, uploaded: 0, downloaded: 0, left: 0, offers: [], ...(event ? { event } : {}) });
  const t = trackerLinks({
    trackers, WS, onState,
    onOpen: (l) => announce(l, 'started'),
    async onMsg(l, m) {
      if (m.info_hash !== hash) return;
      if (m.interval) every = Math.max(20000, Math.min(120000, m.interval * 1000));
      if (!m.offer || !m.offer_id || m.peer_id === peerId) return;
      const data = await unseal(key, m.offer.sdp);
      if (!data) return;   // someone else's room, or junk
      onOffer(data, async (obj) => { t.send(l, { action: 'announce', info_hash: hash, peer_id: peerId, to_peer_id: m.peer_id, offer_id: m.offer_id, answer: { type: 'answer', sdp: await seal(key, obj) } }); });
    },
  });
  // trackers forget a peer that stays silent: announce again now and then
  let last = Date.now();
  const beat = setInterval(() => { if (Date.now() - last < every) return; last = Date.now(); for (const l of t.links) announce(l); }, 5000);
  return {
    hash, get up() { return t.up; }, links: t.links,
    close() { clearInterval(beat); for (const l of t.links) announce(l, 'stopped'); t.close(); },
  };
}

// ---------- a guest: announces sealed offers until the host answers one ----------
// makeOffer() → { data (to seal), accept(answerData) }; resolves with the offer the host took
// 4 rounds of 7 s: a host that's there answers within the first; a wrong link gives up in ~30 s
export function guestRendezvous({ room, secret, trackers = TRACKERS, WS = globalThis.WebSocket, makeOffer, perRound = 2, rounds = 4, roundMs = 7000, onStep = () => {} }) {
  return new Promise(async (resolve, reject) => {
    const { hash, key } = await roomKeys(room, secret);
    const peerId = randomId();
    const pending = new Map();   // offer_id → offer
    let done = false, round = 0, timer = 0;
    const finish = (err, v) => { if (done) return; done = true; clearTimeout(timer); for (const l of t.links) t.send(l, { action: 'announce', info_hash: hash, peer_id: peerId, numwant: 0, uploaded: 0, downloaded: 0, left: 0, event: 'stopped' }); setTimeout(() => t.close(), 300); err ? reject(err) : resolve(v); };
    const t = trackerLinks({
      trackers, WS,
      onOpen: () => { if (round === 0) next(); },
      async onMsg(l, m) {
        if (done || m.info_hash !== hash || !m.answer || !m.offer_id) return;
        const o = pending.get(m.offer_id);
        if (!o) return;
        const data = await unseal(key, m.answer.sdp);
        if (!data || done) return;
        pending.delete(m.offer_id);
        try { await o.accept(data); } catch { return; }
        for (const [id, x] of pending) if (x !== o) x.drop?.();
        onStep('answered', { up: t.up });
        finish(null, o);
      },
    });
    async function next() {
      if (done) return;
      if (round >= rounds) {
        const up = t.up;
        finish(Object.assign(new Error(up ? 'personne ne répond sous ce nom' : 'aucun relais public joignable'), { hint: up ? 'l\'hôte est-il en ligne ? le lien est-il complet ?' : 'réseau filtré ? demande un code d\'invitation à coller' }));
        return;
      }
      round++;
      clearTimeout(timer);
      timer = setTimeout(next, roundMs);
      onStep('announce', { round, up: t.up });
      // older offers stay valid a little: a late answer to one of them still counts
      // each offer is its own connection, its candidates gathered side by side
      const fresh = await Promise.all(Array.from({ length: perRound }, async () => {
        const o = await makeOffer();
        const id = randomId();
        pending.set(id, o);
        return { offer_id: id, offer: { type: 'offer', sdp: await seal(key, o.data) } };
      }));
      if (done) { for (const o of fresh) pending.get(o.offer_id)?.drop?.(); return; }
      for (const l of t.links) t.send(l, { action: 'announce', info_hash: hash, peer_id: peerId, numwant: perRound, uploaded: 0, downloaded: 0, left: 1, event: round === 1 ? 'started' : undefined, offers: fresh });
      // what's too old goes
      if (pending.size > perRound * 3) for (const id of [...pending.keys()].slice(0, pending.size - perRound * 3)) { pending.get(id).drop?.(); pending.delete(id); }
    }
    // nobody reachable at all after a while
    setTimeout(() => { if (!done && !t.up && round === 0) finish(Object.assign(new Error('aucun relais public joignable'), { hint: 'réseau filtré ? demande un code d\'invitation à coller' })); }, 12000);
  });
}
