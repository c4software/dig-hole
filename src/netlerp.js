// netlerp.js, the other players' vehicles drawn a little in the past: each state carries the
// sender's clock, is kept in a short buffer and replayed smoothly between two of them, pushed
// a little ahead when the next one is late. Old or repeated states are dropped, so a car never
// runs backwards because of the network; a jump far from the last state (a respawn) is a cut.

// wall time in seconds (a game's own clock slows down with the frame rate); the stamp sent, to the ms
export const netNow = () => performance.now() / 1000;
export const netStamp = () => Math.round(performance.now()) / 1000;
const wrapA = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// delay: the least we draw behind the quickest state (more when the states come unevenly)
// angles: indices of the values that are angles (lerped the short way round)
// cut(a, b): true when b is a teleport from a (drawn as a jump, not a slide)
export function netTrack({ delay = .1, ahead = .25, angles = [], cut = null } = {}) {
  let buf = [], from, last = -Infinity, base = 0, spread = 0, lag = 0, slow = 0, seen = -1;
  const isAng = new Set(angles);
  const reset = () => { buf = []; last = -Infinity; seen = -1; };
  const want = () => base + clamp(spread + .03, delay, .4);
  return {
    reset,
    get ready() { return buf.length > 0; },
    // t: the sender's netStamp() when it sent v; src: who sent it
    push(t, v, src = null) {
      if (src !== from) { reset(); from = src; }   // a new sender (the host changed): its clock is another
      if (!(t > last)) return false;   // late or repeated: dropped
      const p = buf[buf.length - 1];
      buf.push({ t, v: v.slice(), cut: !!(p && cut?.(p.v, v)) });
      if (buf.length > 32) buf.shift();
      last = t;
      // the quickest trip seen (its clock against mine), and how unevenly they come after it
      const o = netNow() - t;
      if (buf.length === 1) { base = o; spread = 0; lag = want(); slow = 0; }
      else { if (o < base) { spread += base - o; base = o; } spread = Math.max(spread, o - base); }
      return true;
    },
    // the state to draw now, written into out (null before the first state)
    sample(out = []) {
      const n = buf.length, now = netNow();
      if (!n) return null;
      const z = buf[n - 1], dt = seen < 0 ? 0 : Math.min(.25, now - seen);
      seen = now;
      base += dt * .01;   // a slow creep, so one lucky quick state doesn't stick
      spread = Math.max(0, spread - dt * .04);
      if (now - lag > z.t) spread += dt * .3;   // starved: wait a little longer from now on
      // the replay runs up to 25 % faster or slower to settle there, its pace eased: never backwards, no jolt
      const w = want();
      slow += (clamp((w - lag) * 2, -.25, .25) - slow) * Math.min(1, dt * 3);
      lag += slow * dt;
      if (Math.abs(w - lag) > .6) { lag = w; slow = 0; }   // far off (a lag spike): straight there
      let r = now - lag;
      // the sender stalled for long (a hidden tab): wait from where it was
      if (r > z.t + 1) { base = now - z.t - ahead - delay; spread = 0; lag = want(); slow = 0; r = now - lag; }
      if (n === 1 || r <= buf[0].t) { const s = n === 1 ? z : buf[0]; for (let i = 0; i < s.v.length; i++) out[i] = s.v[i]; return out; }
      let a, b, u;
      if (r >= z.t) {
        // late: carry on along the last two, a little
        a = buf[n - 2]; b = z;
        if (b.cut) { for (let i = 0; i < b.v.length; i++) out[i] = b.v[i]; return out; }
        u = 1 + Math.min(r - b.t, ahead) / Math.max(1e-3, b.t - a.t);
      } else {
        let i = n - 2; while (i > 0 && buf[i].t > r) i--;
        a = buf[i]; b = buf[i + 1];
        u = (r - a.t) / Math.max(1e-6, b.t - a.t);
        if (b.cut) u = u < 1 ? 0 : 1;
      }
      for (let i = 0; i < b.v.length; i++) {
        const va = a.v[i], vb = b.v[i];
        out[i] = typeof vb !== 'number' || typeof va !== 'number' ? vb : isAng.has(i) ? va + wrapA(vb - va) * u : va + (vb - va) * u;
      }
      return out;
    },
  };
}
