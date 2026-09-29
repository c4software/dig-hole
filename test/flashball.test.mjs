// flashball.test.mjs, the flashball pinched at the lycée without a browser: being frozen (only by a
// hit meant for me, once, then a few seconds of immunity), the ammo, the settings; the mouse wheel
// going through the hotbar, and x going through the tools with the flashball among them.
//   node --test test/flashball.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/flashball-rules.js';
import { createTunables } from '../src/tunables.js';

test('flashball: a freeze takes once, lasts, then a few seconds of immunity', () => {
  const f = R.createFreeze();
  assert.equal(f.frozen(0), false);
  assert.equal(f.hit(10, 3), true);
  assert.equal(f.frozen(11), true); assert.ok(Math.abs(f.left(11) - 2) < 1e-9);
  assert.equal(f.hit(11, 3), false, 'already frozen: no longer');
  assert.equal(f.frozen(13.01), false);
  assert.equal(f.hit(14, 3), false, 'immune just after');
  assert.equal(f.immune(17.9), true);
  assert.equal(f.hit(18.1, 3), true, 'fair game again');
  f.reset(); assert.equal(f.frozen(18.5), false);
});

test('flashball: only a hit meant for me freezes me', () => {
  assert.equal(R.hitForMe({ k: 'fbhit', to: 'abc' }, 'abc'), true);
  assert.equal(R.hitForMe({ k: 'fbhit', to: 'xyz' }, 'abc'), false);
  assert.equal(R.hitForMe({ k: 'fbhit' }, 'abc'), false);
  assert.equal(R.hitForMe({ k: 'fbhit', to: 5 }, '5'), false);
  assert.equal(R.hitForMe({ k: 'fb', to: 'abc' }, 'abc'), false);
  assert.equal(R.hitForMe(null, 'abc'), false);
});

test('flashball: ammo goes down, runs out, a new steal refills to the cap', () => {
  const s = {};
  assert.equal(R.fire(s), false);
  assert.equal(R.refill(s, 12), 12); assert.equal(s.flashball, true);
  for (let n = 0; n < 12; n++) assert.equal(R.fire(s), true);
  assert.equal(R.fire(s), false); assert.equal(s.fbAmmo, 0);
  s.fbAmmo = 5; assert.equal(R.refill(s, 12), 7); assert.equal(s.fbAmmo, 12);
  assert.equal(R.refill(s, 12), 0);
  const tun = createTunables();
  assert.equal(tun.get('fbAmmo'), 12); assert.equal(tun.get('fbFreeze'), 3);
  tun.set('fbFreeze', 99); assert.equal(tun.get('fbFreeze'), 10);
});

test('controls: the wheel goes through the hotbar, x through the tools', () => {
  const slots = ['dyn', 'sup', 'med'];
  assert.equal(R.nextSlot(slots, 'dyn', 1), 'sup');
  assert.equal(R.nextSlot(slots, 'med', 1), 'dyn');
  assert.equal(R.nextSlot(slots, 'dyn', -1), 'med');
  assert.equal(R.nextSlot(slots, 'gone', 1), 'dyn');
  assert.equal(R.nextSlot([], 'dyn', 1), 'dyn');
  // one step per notch: a mouse notch at once, a trackpad's small deltas added up
  const w = R.createWheelSteps(50);
  assert.equal(w(100), 1); assert.equal(w(-120), -1);
  assert.equal(w(10), 0); assert.equal(w(15), 0); assert.equal(w(30), 1); assert.equal(w(5), 0);
  assert.deepEqual(R.toolCycle({ lv: {} }), ['shovel', 'hands']);
  assert.deepEqual(R.toolCycle({ lv: { drill: 2 }, portal: true, discs: true, flashball: true }), ['shovel', 'drill', 'portal', 'disc', 'flashball', 'hands']);
});
