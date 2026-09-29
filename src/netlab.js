// netlab.js, a guest without the game, to try a hosted room from a light tab: the same
// joinHost() and the same messages as the game, but no three.js, no webgl.
import { joinHost } from './p2p.js';
import { tun } from './tunables.js';
import { createMesh } from './voice-mesh.js';
import { iceServers } from './rtc.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const lab = window.__lab = { state: 'idle', id: null, peers: {}, got: {}, ops: 0, welcomeOps: 0, tun: {}, admin: [], log: [], sent: { state: 0, op: 0, fx: 0 }, error: null };
const log = (s) => { const line = new Date().toISOString().slice(11, 19) + ' ' + s; lab.log.push(line); if (lab.log.length > 400) lab.log.shift(); $('log').textContent = lab.log.slice(-120).reverse().join('\n'); };
const stat = () => { $('stat').textContent = `état : ${lab.state} · id ${lab.id ?? '-'} · pairs ${Object.keys(lab.peers).length} · ops reçues ${lab.ops} (+${lab.welcomeOps} au départ) · envoyés ${JSON.stringify(lab.sent)} · reçus ${JSON.stringify(lab.got)}${lab.error ? ' · erreur : ' + lab.error : ''}`; };
tun.on(() => { lab.tun = tun.snapshot(); $('tun').textContent = JSON.stringify(lab.tun); });

async function go(join) {
  const name = params.get('name') || 'labo';
  lab.state = 'connecting'; stat();
  try {
    const r = await joinHost({ join, nick: name, onStep(what, d) {
      log('étape ' + what + (d ? ' ' + JSON.stringify(what === 'answer' ? { len: d.code.length } : d) : ''));
      if (what === 'answer') { $('ans').hidden = false; $('ans-code').value = d.code; lab.answer = d.code; }
    } });
    lab.state = 'open'; lab.pc = r.pc; $('ans').hidden = true; stat();
    const ws = r.socket();
    lab.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', room: r.room, name })); log('hello envoyé'); };
    ws.onclose = () => { lab.state = 'closed'; stat(); log('fermé'); };
    // ?voice: joins the proximity voice chat with the mic (a fake one in a headless browser), and
    // measures what it hears (lab.voice)
    const pos = {}, V = lab.voice = { on: false, heard: {}, level: {}, error: null };
    let mesh = null;
    const early = [];   // signals before the mic was ready
    async function voiceOn() {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        const ac = new AudioContext();
        mesh = createMesh({
          send: (fx) => { ws.send(JSON.stringify({ t: 'fx', fx })); lab.sent.fx++; },
          makePc: () => new RTCPeerConnection({ iceServers: iceServers() }), stream: () => mic,
          onTrack(id, st) {
            V.heard[id] = true; log('voix : on entend ' + id);
            const el = new Audio(); el.srcObject = st; el.muted = true; el.play().catch(() => {});
            const an = ac.createAnalyser(); ac.createMediaStreamSource(st).connect(an);
            const b = new Uint8Array(256);
            setInterval(() => { an.getByteTimeDomainData(b); let q = 0; for (const x of b) q += ((x - 128) / 128) ** 2; V.level[id] = +Math.sqrt(q / b.length).toFixed(4); }, 250);
          },
          onGone(id) { delete V.heard[id]; log('voix : coupé ' + id); },
          log,
        });
        mesh.start(lab.id); V.on = true; V.mesh = mesh;
        for (const [id, fx] of early.splice(0)) mesh.onSignal(id, fx);
        setInterval(() => lab.me && mesh.tick({ id: lab.id, pos: lab.me, w: 'home' }, Object.entries(pos).map(([id, p]) => ({ id: +id, pos: p, w: 'home' }))), 1000);
      } catch (x) { V.error = x.message; log('voix : ' + x.message); }
    }
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      lab.got[m.t] = (lab.got[m.t] || 0) + 1;
      if (m.t === 'welcome') { lab.id = m.id; lab.welcomeOps = m.ops.length; for (const p of m.players) lab.peers[p.id] = p.name; if (m.tun) tun.load(m.tun); lab.state = 'in'; if (params.has('voice')) voiceOn(); log(`bienvenue · id ${m.id} · ${m.ops.length} ops · ${m.players.length} autres · hôte ${m.host ?? '-'}`); }
      else if (m.t === 'join') { lab.peers[m.id] = m.name; mesh?.hello(); log('arrive : ' + m.name); }
      else if (m.t === 'leave') { delete lab.peers[m.id]; mesh?.peerLeft(m.id); delete pos[m.id]; log('part : ' + m.id); }
      else if (m.t === 'op') { lab.ops++; if (lab.ops < 30) log('op ' + JSON.stringify(m.op).slice(0, 120)); }
      else if (m.t === 'tun') { tun.load(m.v); log('réglages ' + JSON.stringify(m.v)); }
      else if (m.t === 'admin') { lab.admin.push(m.a); log('hôte : ' + m.a); }
      else if (m.t === 'kicked') { log('renvoyé : ' + m.why); }
      else if (m.t === 'fx' && m.fx?.k === 'talkie') { (V.keys ||= []).push([m.id, m.fx.on]); log('talkie ' + m.id + (m.fx.on ? ' parle' : ' lâche')); }
      else if (m.t === 'fx' && m.fx?.k === 'vc') { if (mesh) mesh.onSignal(m.id, m.fx); else early.push([m.id, m.fx]); if (m.fx.a === 'on') log('voix : ' + m.id + ' a le micro'); }
      else if (m.t === 'fx') { if ((lab.got.fx || 0) < 20) log('fx ' + JSON.stringify(m.fx).slice(0, 100)); }
      else if (m.t === 'state') pos[m.id] = m.p;
      else log(m.t);
      stat();
    };
    // a digger walking round the house, digging now and then
    let a = 0;
    setInterval(() => {
      if (ws.readyState !== 1 || lab.state !== 'in') return;
      a += .1;
      lab.me = [+(Math.cos(a) * 6).toFixed(3), 0, +(Math.sin(a) * 6 - 4).toFixed(3)];
      ws.send(JSON.stringify({ t: 'state', p: lab.me, yaw: +a.toFixed(3), w: 'home', dig: false, g: null }));
      lab.sent.state++;
      if (lab.sent.state % 50 === 0 && !params.has('quiet')) { ws.send(JSON.stringify({ t: 'op', op: { k: 'carve', w: 'home', c: [Math.cos(a) * 3, -.2, Math.sin(a) * 3 - 4], r: .5, tier: 0, space: 0, destroy: false } })); lab.sent.op++; }
      stat();
    }, 100);
  } catch (x) {
    // the host may not be up on /sig yet: a few more tries
    if (/aucune partie/.test(x.message) && (lab.tries = (lab.tries || 0) + 1) < 6) { log('pas encore d\'hôte, on réessaie'); setTimeout(() => go(join), 2000); return; }
    lab.state = 'failed'; lab.error = x.message + (x.hint ? ' · ' + x.hint : ''); stat(); log('échec : ' + lab.error);
  }
}

$('copy').onclick = () => navigator.clipboard?.writeText($('ans-code').value);
$('go').onclick = () => { $('form').hidden = true; go($('code').value.trim()); };
if (params.get('join')) go(params.get('join')); else $('form').hidden = false;
stat();
