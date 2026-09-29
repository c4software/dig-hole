// voice-mesh.js, who talks to whom: a WebRTC audio link per pair of nearby players who turned
// their micro on, signalled through the room's fx (`only`: to one digger). No DOM, no audio
// graph here (voice.js does that): pc and stream come from outside, so node tests fake them.
// Messages, all { k: 'vc', a, … }:
//   on / off                       broadcast: I am in the voice chat (or not any more)
//   offer / answer { only, n, s }  the sdp of link n (the smaller id always offers: no glare)
//   ice { only, n, c }             a candidate for link n
//   bye { only, n }                link n is over (out of range, refused, failed)

export const VOICE = { range: 25, drop: 30, max: 6, accept: 8, retry: 8000, dial: 12000 };

const d2 = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; };

// the peers worth a link: in the voice chat, same world, near. Linked ones stay up to `drop`
// (hysteresis: no flapping at the edge), new ones come in under `range`; the `max` nearest.
export function pickPeers(me, list, linked = new Set(), o = VOICE) {
  const out = [];
  for (const p of list) {
    if (!p.on || p.w !== me.w || !p.pos) continue;
    const r = linked.has(p.id) ? o.drop : o.range;
    const dd = d2(me.pos, p.pos);
    if (dd < r * r) out.push([dd, p.id]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return new Set(out.slice(0, o.max).map(e => e[1]));
}

// send(fx): out through the room · makePc(): a new RTCPeerConnection · stream(): the mic, or null
// onTrack(id, mediaStream) / onGone(id): voice.js plugs the sound in and out
export function createMesh({ send, makePc, stream, onTrack, onGone, now = () => Date.now(), opts = VOICE, log = () => {} }) {
  const links = new Map();    // id → { pc, n, st: 'dial'|'ring'|'up', t, q: [] }
  const voiced = new Set();   // peers who said 'on'
  const cool = new Map();     // id → time before which we don't dial again
  let myId = null, me = null, cands = [], live = false;

  const nonce = () => Math.random().toString(36).slice(2, 9);
  const say = (id, a, extra = {}) => send({ k: 'vc', a, only: id, ...extra });

  function hang(id, why, tell = true) {
    const L = links.get(id);
    if (!L) return;
    links.delete(id);
    if (tell) say(id, 'bye', { n: L.n });
    try { L.pc.close(); } catch {}
    onGone?.(id);
    if (why !== 'range') cool.set(id, now() + opts.retry);
    log(`voix · ${id} coupé (${why})`);
  }

  function wire(id, L) {
    const pc = L.pc;
    const s = stream();
    if (s) for (const tr of s.getAudioTracks()) pc.addTrack(tr, s);
    pc.onicecandidate = (e) => { if (e.candidate && links.get(id) === L) say(id, 'ice', { n: L.n, c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ontrack = (e) => { if (links.get(id) === L) { L.st = 'up'; onTrack?.(id, e.streams?.[0] || { getAudioTracks: () => [e.track] }); } };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') L.st = 'up';
      if ((st === 'failed' || st === 'closed') && links.get(id) === L) hang(id, 'failed');
    };
  }
  const addIce = (L, c) => { try { L.pc.addIceCandidate(c)?.catch?.(() => {}); } catch {} };
  function remoteSet(L) { L.remote = true; for (const c of L.q.splice(0)) addIce(L, c); }

  async function dial(id) {
    const L = { pc: makePc(), n: nonce(), st: 'dial', t: now(), q: [], remote: false };
    links.set(id, L);
    wire(id, L);
    try {
      const o = await L.pc.createOffer();
      if (links.get(id) !== L) return;
      await L.pc.setLocalDescription(o);
      if (links.get(id) !== L) return;
      say(id, 'offer', { n: L.n, s: L.pc.localDescription.sdp });
    } catch (x) { log('voix · offre ratée ' + x.message); hang(id, 'error'); }
  }

  async function answer(id, fx) {
    const L = { pc: makePc(), n: fx.n, st: 'ring', t: now(), q: [], remote: false };
    links.set(id, L);
    wire(id, L);
    try {
      await L.pc.setRemoteDescription({ type: 'offer', sdp: fx.s });
      remoteSet(L);
      const a = await L.pc.createAnswer();
      if (links.get(id) !== L) return;
      await L.pc.setLocalDescription(a);
      if (links.get(id) !== L) return;
      say(id, 'answer', { n: L.n, s: L.pc.localDescription.sdp });
    } catch (x) { log('voix · réponse ratée ' + x.message); hang(id, 'error'); }
  }

  // may this one link to me? in the chat, not too far, and room left (a little over max: their
  // nearest six are not exactly mine)
  function near(id) {
    const p = cands.find(c => c.id === id);
    return !!(live && voiced.has(id) && p && me && p.w === me.w && p.pos && d2(me.pos, p.pos) < opts.drop * opts.drop);
  }
  const welcome = (id) => links.size < opts.accept && near(id);

  return {
    links, voiced,
    get live() { return live; },
    // on: joined the voice chat (the mic is ready); everyone hears about it
    start(id) { myId = id; live = true; send({ k: 'vc', a: 'on' }); },
    stop() { if (!live) return; live = false; for (const id of [...links.keys()]) hang(id, 'off'); send({ k: 'vc', a: 'off' }); cool.clear(); },
    // someone new in the room: tell them I'm in the chat
    hello() { if (live) send({ k: 'vc', a: 'on' }); },
    peerLeft(id) { voiced.delete(id); hang(id, 'left', false); cool.delete(id); },
    // ~1 Hz: me { id, pos, w }, list [{ id, pos, w }] (voiced is known here)
    tick(meNow, list) {
      me = meNow; myId = meNow.id ?? myId;
      cands = list.map(p => ({ ...p, on: voiced.has(p.id) }));
      if (!live) return;
      const want = pickPeers(me, cands, new Set(links.keys()), opts);
      const t = now();
      for (const [id, L] of links) {
        // a link they dialled stays while they're near: their six nearest aren't exactly mine
        if (!want.has(id) && !(id < myId && near(id))) hang(id, voiced.has(id) ? 'range' : 'off');
        else if (L.st !== 'up' && t - L.t > opts.dial) hang(id, 'timeout');
      }
      for (const id of want) {
        if (links.has(id) || !(myId < id) || (cool.get(id) || 0) > t) continue;
        dial(id);
      }
    },
    onSignal(id, fx) {
      if (fx.a === 'on') { voiced.add(id); return; }
      if (fx.a === 'off') { voiced.delete(id); hang(id, 'off', false); return; }
      const L = links.get(id);
      if (fx.a === 'offer') {
        if (!(id < myId) || !welcome(id)) { say(id, 'bye', { n: fx.n }); return; }
        if (L) hang(id, 'again', false);
        answer(id, fx);
      } else if (!L || L.n !== fx.n) return;
      else if (fx.a === 'answer' && L.st === 'dial') {
        L.st = 'ring';
        Promise.resolve(L.pc.setRemoteDescription({ type: 'answer', sdp: fx.s })).then(() => remoteSet(L), () => hang(id, 'error'));
      } else if (fx.a === 'ice' && fx.c) { if (L.remote) addIce(L, fx.c); else L.q.push(fx.c); }
      else if (fx.a === 'bye') hang(id, L.st === 'up' ? 'range' : 'refused', false);   // a hang-up after talking is no refusal: redial at once
    },
  };
}
