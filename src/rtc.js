// rtc.js, a direct line between two browsers: a WebRTC connection with two data channels,
// "rel" (ordered, reliable: ops, fx, lobby) and "fast" (unordered, no resend: positions).
// Offers and answers are gathered whole (no trickle) so they fit in one code to paste
// or one message through the signaling server. Nothing here knows about the game.

// ---------- ice: public stun, and a turn server if one was given ----------
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
const TURN_KEY = 'a-hole-turn';
export function getTurn() { try { return JSON.parse(localStorage.getItem(TURN_KEY) || 'null'); } catch { return null; } }
export function setTurn(t) { try { if (t && t.urls) localStorage.setItem(TURN_KEY, JSON.stringify(t)); else localStorage.removeItem(TURN_KEY); } catch {} }
// "turn:host:3478 user pass" → { urls, username, credential }
export function parseTurn(s) {
  const [urls, username, credential] = String(s || '').trim().split(/\s+/);
  return urls && /^turns?:/.test(urls) ? { urls, username, credential } : null;
}
export const turnText = (t) => t ? [t.urls, t.username, t.credential].filter(Boolean).join(' ') : '';
export function iceServers() { const t = getTurn(); return t ? [...STUN, t] : STUN; }

// ---------- the local network: browsers hide their own address behind an mdns name (xxxx.local)
// unless the page may use the micro. Where multicast is blocked and stun too,
// two machines that do see each other then never find how: the micro, asked once and kept muted,
// puts the real address in the candidates. Asked before any RTCPeerConnection of the page.
const LAN_KEY = 'a-hole-lan';
export function lanWanted() { try { return localStorage.getItem(LAN_KEY) === '1'; } catch { return false; } }
export function setLan(on) { try { if (on) localStorage.setItem(LAN_KEY, '1'); else localStorage.removeItem(LAN_KEY); } catch {} }
let lanStream = null;
export const lanOpen = () => !!lanStream;
export async function unlockLan() {
  if (lanStream) return true;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    // kept alive, muted: firefox shows the addresses only while a capture is live
    lanStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const t of lanStream.getAudioTracks()) t.enabled = false;
    return true;
  } catch { return false; }
}

// ---------- codes: json → deflate → base64url ----------
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
async function pipe(u8, T) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new T('deflate-raw'))).arrayBuffer()); }
export async function encode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  return typeof CompressionStream === 'function' ? 'z' + b64(await pipe(raw, CompressionStream)) : 'j' + b64(raw);
}
export async function decode(code) {
  code = String(code || '').trim();
  // a whole link pasted: take its join parameter
  const m = code.match(/[?&#]join=([^&\s]+)/);
  if (m) code = decodeURIComponent(m[1]);
  code = code.replace(/\s+/g, '');
  const kind = code[0], body = unb64(code.slice(1));
  const raw = kind === 'z' ? await pipe(body, DecompressionStream) : body;
  return JSON.parse(new TextDecoder().decode(raw));
}
// the sdp, lightened: lines a data channel never needs
const slim = (sdp) => sdp.split('\r\n').filter(l => !/^a=(extmap|rtcp-fb|ssrc|msid-semantic)/.test(l)).join('\r\n');

// waits for the candidates (all of them, or what came in a few seconds)
function gathered(pc, ms = 4000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

// candidates found after the code was made (a slow stun answer) go through whatever side
// channel there is (the node server's /sig, or the BroadcastChannel in the same browser)
function trickle(pc) {
  let coded = false, remote = false;
  const seen = [], subs = [], queue = [];
  pc.addEventListener('icecandidate', (e) => {
    if (!e.candidate || !coded) return;
    const c = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
    seen.push(c);
    for (const f of subs) f(c);
  });
  const add = (c) => { try { pc.addIceCandidate(c)?.catch?.(() => {}); } catch {} };
  return {
    coded() { coded = true; },
    remoteSet() { remote = true; for (const c of queue.splice(0)) add(c); },
    on(f) { subs.push(f); for (const c of seen) f(c); },
    add(c) { if (!c || typeof c !== 'object') return; if (remote) add(c); else queue.push(c); },
  };
}
// what kinds of candidates an sdp carries: { host, srflx, relay } (a hint when it doesn't connect)
export function candTypes(sdp) {
  const n = { host: 0, srflx: 0, relay: 0, prflx: 0 };
  for (const m of String(sdp || '').matchAll(/a=candidate:.* typ (\w+)/g)) n[m[1]] = (n[m[1]] || 0) + 1;
  return n;
}
export const candText = (n) => `local ${n.host} · stun ${n.srflx} · turn ${n.relay}`;

// ---------- the channel pair, as one pipe: chunks, back-pressure, stale positions dropped ----------
const PART = 15000, HIGH = 1 << 20;
export function createPipe({ rel, fast = null, isFast = () => false }) {
  const p = { onmessage: null, onclose: null, onopen: null, open: false };
  const queue = [];
  let seq = 0, parts = null, partId = 0, closed = false;
  const last = new Map();
  const flush = () => {
    while (queue.length && rel.readyState === 'open' && rel.bufferedAmount < HIGH) rel.send(queue.shift());
  };
  rel.bufferedAmountLowThreshold = HIGH / 4;
  rel.addEventListener('bufferedamountlow', flush);
  function sendRel(s) {
    if (s.length <= PART) queue.push(s);
    else { const id = (++partId).toString(36), n = Math.ceil(s.length / PART); for (let i = 0; i < n; i++) queue.push(`\x01${id}:${i}:${n}:` + s.slice(i * PART, (i + 1) * PART)); }
    flush();
  }
  function recvRel(s) {
    if (s.charCodeAt(0) !== 1) return p.onmessage?.(s);
    const a = s.indexOf(':'), b = s.indexOf(':', a + 1), c = s.indexOf(':', b + 1);
    const id = s.slice(1, a), i = +s.slice(a + 1, b), n = +s.slice(b + 1, c);
    if (!(n > 0 && n <= 4000 && i >= 0 && i < n)) return;   // 60 MB at most, and no nonsense
    if (!parts || parts.id !== id) parts = { id, got: new Array(n), left: n };
    if (parts.got[i] == null) { parts.got[i] = s.slice(c + 1); parts.left--; }
    if (!parts.left) { const whole = parts.got.join(''); parts = null; p.onmessage?.(whole); }
  }
  function recvFast(s) {
    const k = s.indexOf('|'), q = +s.slice(1, k), body = s.slice(k + 1);
    // positions are sent often: an old one arriving late is thrown away
    const src = /"id":(\d+)/.exec(body)?.[1] ?? '-';
    if (q <= (last.get(src) ?? -1)) return;
    last.set(src, q);
    p.onmessage?.(body);
  }
  rel.addEventListener('message', (e) => recvRel(e.data));
  fast?.addEventListener('message', (e) => recvFast(e.data));
  const done = () => { if (closed) return; closed = true; p.open = false; p.onclose?.(); };
  rel.addEventListener('close', done);
  rel.addEventListener('error', done);
  const opened = () => { if (p.open || closed) return; p.open = true; p.onopen?.(); flush(); };
  if (rel.readyState === 'open') queueMicrotask(opened); else rel.addEventListener('open', opened);
  p.send = (s, msg) => {
    if (closed) return;
    if (fast && fast.readyState === 'open' && isFast(s, msg)) { try { fast.send('q' + (++seq) + '|' + s); return; } catch {} }
    sendRel(s);
  };
  // what's queued (a last word: "kicked") goes out first, then the line is cut
  p.close = () => {
    if (closed) return;
    const t0 = Date.now();
    const cut = () => {
      if (queue.length && rel.readyState === 'open' && Date.now() - t0 < 2000) { flush(); setTimeout(cut, 50); return; }
      setTimeout(() => { try { rel.close(); } catch {} try { fast?.close(); } catch {} done(); }, 200);
    };
    cut();
  };
  return p;
}
export const isState = (s) => s.startsWith('{"t":"state"');

// ---------- host side: one connection per guest ----------
export async function createOffer(meta = {}) {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const rel = pc.createDataChannel('rel', { ordered: true });
  const fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
  const ice = trickle(pc);
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const i = Math.random().toString(36).slice(2, 10);
  const sdp = pc.localDescription.sdp;
  ice.coded();
  const code = await encode({ k: 'o', i, s: slim(sdp), ...meta });
  return {
    pc, rel, fast, id: i, code, ice, pipe: createPipe({ rel, fast, isFast: isState }),
    cands: candTypes(pc.localDescription.sdp), remoteCands: null,
    async accept(answer) {
      const a = typeof answer === 'string' ? await decode(answer) : answer;
      if (a.k !== 'a') throw new Error('pas une réponse');
      if (a.i && a.i !== i) throw new Error('réponse pour une autre invitation');
      await pc.setRemoteDescription({ type: 'answer', sdp: a.s });
      this.remoteCands = candTypes(a.s);
      ice.remoteSet();
    },
  };
}

// ---------- guest side: answers an offer ----------
export async function answerOffer(offer, meta = {}) {
  const o = typeof offer === 'string' ? await decode(offer) : offer;
  if (o.k !== 'o') throw new Error('pas une invitation');
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const chans = {};
  const ready = new Promise((res) => {
    pc.ondatachannel = (e) => { chans[e.channel.label] = e.channel; if (chans.rel && chans.fast) res(); };
  });
  const ice = trickle(pc);
  await pc.setRemoteDescription({ type: 'offer', sdp: o.s });
  ice.remoteSet();
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  const sdp = pc.localDescription.sdp;
  ice.coded();
  const code = await encode({ k: 'a', i: o.i, s: slim(sdp), ...meta });
  return {
    pc, offer: o, code, ice, cands: candTypes(pc.localDescription.sdp), remoteCands: candTypes(o.s),
    // the pipe, once the host has taken the answer and both channels came up
    pipe: ready.then(() => createPipe({ rel: chans.rel, fast: chans.fast, isFast: isState })),
  };
}

// what went wrong, in words
export function watchIce(pc, onState) {
  const f = () => onState(pc.connectionState || pc.iceConnectionState);
  pc.addEventListener('connectionstatechange', f);
  pc.addEventListener('iceconnectionstatechange', f);
}

// ---------- a WebSocket look-alike over a pipe, so net.js talks to it unchanged ----------
export function pipeSocket(pipe) {
  const s = { readyState: 0, onopen: null, onclose: null, onerror: null, onmessage: null };
  const up = () => { if (s.readyState !== 0) return; s.readyState = 1; s.onopen?.(); };
  pipe.onmessage = (data) => s.onmessage?.({ data });
  pipe.onclose = () => { if (s.readyState === 3) return; s.readyState = 3; s.onclose?.(); };
  if (pipe.open) queueMicrotask(up); else pipe.onopen = up;
  s.send = (str) => { if (s.readyState === 1) pipe.send(str); };
  s.close = () => { pipe.close(); };
  return s;
}
