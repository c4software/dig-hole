// flashball-rules.js, the rules of the flashball pinched from the police at the lycée, as plain
// numbers (flashball.js and main.js apply them; the tests check them): the ammo, being frozen by a
// foam ball (only my own client freezes me: it's the master of my movement), the short immunity
// after it so nobody is frozen over and over, and the hotbar under the mouse wheel.

export const IMMUNE = 5;      // s after a freeze during which another ball does nothing

// my own freeze: hit(now, dur) → true if it took (not frozen already, not immune)
export function createFreeze() {
  let until = -1e9, immuneUntil = -1e9;
  return {
    hit(now, dur = 3) {
      if (now < until || now < immuneUntil) return false;
      until = now + dur; immuneUntil = until + IMMUNE;
      return true;
    },
    frozen: (now) => now < until,
    immune: (now) => now < immuneUntil,
    left: (now) => Math.max(0, until - now),
    reset() { until = immuneUntil = -1e9; },
  };
}

// a hit fx from someone: is it for me, and well formed?
export const hitForMe = (fx, me) => !!fx && fx.k === 'fbhit' && typeof fx.to === 'string' && fx.to === me;

// the ammo: take n (false if empty); refill to the cap
export function fire(s) { if (!(s.fbAmmo > 0)) return false; s.fbAmmo--; return true; }
export function refill(s, cap) { const had = s.fbAmmo || 0; s.fbAmmo = Math.max(had, cap); s.flashball = true; return s.fbAmmo - had; }

// the next hotbar slot for a turn of the wheel (dir ±1), looping round
export function nextSlot(slots, cur, dir) {
  if (!slots.length) return cur;
  const i = slots.indexOf(cur);
  if (i < 0) return slots[0];
  return slots[(i + (dir > 0 ? 1 : -1) + slots.length) % slots.length];
}
// the wheel: one step per notch, however the device reports it (a trackpad sends many small deltas)
export function createWheelSteps(notch = 50) {
  let acc = 0;
  return (dy) => {
    if (Math.abs(dy) >= notch) { acc = 0; return Math.sign(dy); }
    acc += dy;
    if (Math.abs(acc) >= notch) { const s = Math.sign(acc); acc = 0; return s; }
    return 0;
  };
}

// the tools that x goes through, in order
export function toolCycle(s) {
  return ['shovel', ...(s.lv?.drill ? ['drill'] : []), ...(s.portal ? ['portal'] : []), ...(s.discs ? ['disc'] : []), ...(s.flashball ? ['flashball'] : []), 'hands'];
}
