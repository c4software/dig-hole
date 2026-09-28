// admin-client.js, a line to the node server's admin door (/admin), for the web console
// (serveur.html?admin=…) and the command line (admin.mjs). The first message is the token;
// then calls go out, answers and snapshots of the room come back.
//   const a = await connectAdmin({ url: 'ws://localhost:8765', room: 'jardin', token })
//   await a.call('set', 'gravity', .5); a.onSnap = (snap) => …; a.close()

export const adminUrl = (url, room) => url.replace(/\/+$/, '').replace(/^http/, 'ws') + '/admin?room=' + encodeURIComponent(room || 'jardin');

export function connectAdmin({ url, room = 'jardin', token, WS = globalThis.WebSocket, timeout = 6000 }) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WS(adminUrl(url, room)); } catch (e) { reject(new Error('adresse invalide : ' + e.message)); return; }
    const waits = new Map();
    let n = 0, ready = false;
    const t = setTimeout(() => { reject(new Error('le serveur ne répond pas')); try { ws.close(); } catch {} }, timeout);
    const client = {
      snap: null, onSnap: null, onClose: null,
      call(fn, ...args) {
        return new Promise((res, rej) => {
          if (ws.readyState !== 1) { rej(new Error('déconnecté')); return; }
          const id = ++n;
          waits.set(id, { res, rej });
          ws.send(JSON.stringify({ t: 'call', id, fn, args }));
          setTimeout(() => { if (waits.delete(id)) rej(new Error('pas de réponse')); }, 10000);
        });
      },
      close() { try { ws.close(); } catch {} },
    };
    ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token }));
    ws.onerror = () => { if (!ready) { clearTimeout(t); reject(new Error('connexion impossible')); } };
    ws.onclose = () => {
      for (const w of waits.values()) w.rej(new Error('déconnecté'));
      waits.clear();
      if (!ready) { clearTimeout(t); reject(new Error('refusé')); }
      client.onClose?.();
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'auth-ok') { ready = true; clearTimeout(t); client.room = m.room; resolve(client); }
      else if (m.t === 'auth-no') { clearTimeout(t); reject(new Error('mauvais jeton')); }
      else if (m.t === 'state') { client.snap = m.snap; client.onSnap?.(m.snap); }
      else if (m.t === 'ret') { const w = waits.get(m.id); waits.delete(m.id); if (w) m.err ? w.rej(new Error(m.err)) : w.res(m.v); }
    };
  });
}
