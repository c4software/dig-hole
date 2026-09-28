// signal.js, the matchmaker: a host's tab registers a room name, guests ask for it, and
// the few messages that set up a WebRTC link (offer, answer) are passed between them.
// Nothing of the game goes through here. No Node, no DOM: server.mjs runs it behind /sig.
//   host → { t:'host', room }            ← { t:'hosting', room } | { t:'err', e }
//   guest → { t:'join', room }           ← { t:'joined' } | { t:'err', e }; host ← { t:'guest', gid }
//   host → { t:'to', gid, d }            guest ← { t:'sig', d }
//   guest → { t:'to', d }                host ← { t:'sig', gid, d }
//   host ← { t:'gone', gid } when a guest drops; guests ← { t:'err', e:'parti' } when the host does
import { clean } from './room.js';

export const roomKey = (s) => clean(s, 24).toLowerCase().replace(/ /g, '-');

export function createSignal({ maxGuests = 32 } = {}) {
  const hosts = new Map();   // room → peer
  let nextGid = 1;

  function connect(link) {
    const peer = { link, room: null, host: false, gid: 0, guests: new Map() };
    const send = (m) => link.send(JSON.stringify(m));
    peer.send = send;
    peer.message = (str) => {
      let m; try { m = JSON.parse(str); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'host' && !peer.room) {
        const room = roomKey(m.room);
        if (!room) return send({ t: 'err', e: 'nom' });
        if (hosts.has(room)) return send({ t: 'err', e: 'pris' });
        peer.room = room; peer.host = true;
        hosts.set(room, peer);
        send({ t: 'hosting', room });
      } else if (m.t === 'join' && !peer.room) {
        const h = hosts.get(roomKey(m.room));
        if (!h) return send({ t: 'err', e: 'absent' });
        if (h.guests.size >= maxGuests) return send({ t: 'err', e: 'plein' });
        peer.room = h.room; peer.gid = nextGid++; peer.hostPeer = h;
        h.guests.set(peer.gid, peer);
        send({ t: 'joined' });
        h.send({ t: 'guest', gid: peer.gid });
      } else if (m.t === 'to' && peer.room) {
        if (peer.host) peer.guests.get(m.gid)?.send({ t: 'sig', d: m.d });
        else if (peer.hostPeer && hosts.get(peer.room) === peer.hostPeer) peer.hostPeer.send({ t: 'sig', gid: peer.gid, d: m.d });
      }
    };
    peer.close = () => {
      if (peer.host) {
        if (hosts.get(peer.room) === peer) hosts.delete(peer.room);
        for (const g of peer.guests.values()) { g.send({ t: 'err', e: 'parti' }); g.hostPeer = null; }
        peer.guests.clear();
      } else if (peer.hostPeer) {
        peer.hostPeer.guests.delete(peer.gid);
        peer.hostPeer.send({ t: 'gone', gid: peer.gid });
      }
      peer.room = null;
    };
    return peer;
  }
  return { connect, get rooms() { return [...hosts.keys()]; } };
}
