// gamepad.js, playing with a controller. The Gamepad API is read every frame and turned into what the
// game already understands: held keys for moving and driving, taps for actions, the look for the sticks.
// Standard mapping (Xbox / PlayStation layout): what each button does depends on where you are.
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, BACK = 8, START = 9, LS = 10, RS = 11, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

// `virtual`: another source shaped like a Gamepad (the touch controls), read when no real one is there
export function createGamepad({ context, actions, virtual = () => null }) {
  const held = new Set();          // virtual keys held down right now
  const navT = {};                 // menu auto-repeat timers
  let prev = [], active = false, gpIndex = null, lastCtx = '';
  const send = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  const tap = (code) => { send('keydown', code); send('keyup', code); };
  function sync(want) {
    for (const c of [...held]) if (!want.has(c)) { held.delete(c); send('keyup', c); }
    for (const c of want) if (!held.has(c)) { held.add(c); send('keydown', c); }
  }
  // menus: one step on press, then a steady repeat while held
  function nav(code, on, dt) {
    if (!on) { delete navT[code]; return; }
    if (navT[code] == null) { navT[code] = .38; tap(code); return; }
    navT[code] -= dt;
    if (navT[code] <= 0) { navT[code] = .11; tap(code); }
  }
  function setActive(on) {
    if (on === active) return;
    active = on;
    document.body.classList.toggle('pad', on);
  }

  addEventListener('gamepadconnected', (e) => { gpIndex = e.gamepad.index; actions.connected?.(e.gamepad.id); });
  addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === gpIndex) { gpIndex = null; sync(new Set()); setActive(false); actions.disconnected?.(); } });
  // back to the keyboard and mouse: the prompts show keys again
  addEventListener('mousemove', (e) => { if (active && !document.body.classList.contains('touch') && (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)) setActive(false); });
  addEventListener('keydown', (e) => { if (active && e.isTrusted) setActive(false); });

  function update(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = (gpIndex != null && pads[gpIndex]) || [...pads].find(p => p && p.connected) || virtual();
    if (!gp) { if (held.size) sync(new Set()); return; }
    const btn = (i) => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > .45);
    const hit = (i) => btn(i) && !prev[i];
    const dz = (v) => Math.abs(v) < .16 ? 0 : Math.sign(v) * ((Math.abs(v) - .16) / .84);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (gp.buttons.some(b => b.pressed) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > .3) setActive(true);
    const ctx = context();
    // a change of context lets go of everything held for the old one
    if (ctx !== lastCtx) { sync(new Set()); lastCtx = ctx; for (const k in navT) delete navT[k]; }
    const up = btn(UP) || ly < -.55, down = btn(DOWN) || ly > .55, left = btn(LEFT) || lx < -.55, right = btn(RIGHT) || lx > .55;
    const want = new Set();

    if (ctx === 'menu') {
      nav('ArrowUp', up, dt); nav('ArrowDown', down, dt); nav('ArrowLeft', left, dt); nav('ArrowRight', right, dt);
      if (hit(A)) tap('Enter');
      if (hit(B) || hit(START)) actions.back();
    } else if (ctx === 'play') {
      // the left stick walks (digital keys underneath), the right one looks, the triggers dig and throw
      if (ly < -.3) want.add('KeyW'); if (ly > .3) want.add('KeyS');
      if (lx < -.3) want.add('KeyA'); if (lx > .3) want.add('KeyD');
      if (btn(A)) want.add('Space');
      if (btn(LS)) want.add('ShiftLeft');
      if (btn(RS)) want.add('KeyN');   // held: the walkie-talkie
      const k = 1150 * dt;
      if (rx || ry) actions.look(Math.sign(rx) * rx * rx * k * 1.2, Math.sign(ry) * ry * ry * k);
      if (hit(RT)) actions.dig(true); else if (!btn(RT) && prev[RT]) actions.dig(false);
      if (hit(LT)) actions.throw(true); else if (!btn(LT) && prev[LT]) actions.throw(false);
      if (hit(X)) tap('KeyE');
      if (hit(Y)) tap('KeyX');
      if (hit(B)) tap('KeyR');
      if (hit(LB) || hit(LEFT)) actions.slot(-1);
      if (hit(RB) || hit(RIGHT)) actions.slot(1);
      if (hit(UP)) tap('KeyO');
      if (hit(DOWN)) tap('KeyT');
      if (hit(BACK)) tap('KeyM');
      if (hit(START)) actions.pause();
    } else if (ctx === 'drive') {
      if (btn(RT) || ly < -.4) want.add('KeyW');
      if (btn(LT) || ly > .4) want.add('KeyS');
      if (lx < -.3) want.add('KeyA'); if (lx > .3) want.add('KeyD');
      if (hit(A)) tap('Space');
      if (hit(X) || hit(B)) tap('KeyE');
      if (hit(START)) actions.pause();
    } else if (ctx === 'race') {
      // kart and rc cars: triggers for the pedals, a shoulder or B to drift, X for the item, Y back on track
      if (btn(RT) || btn(A)) want.add('KeyW');
      if (btn(LT) || ly > .6) want.add('KeyS');
      if (lx < -.25) want.add('KeyA'); if (lx > .25) want.add('KeyD');
      if (btn(RB) || btn(B)) want.add('ShiftLeft');
      if (btn(X) || btn(LB)) want.add('Space');
      if (hit(Y)) tap('KeyR');
      if (hit(UP)) tap('KeyO');
      if (hit(START)) actions.pause();
    } else if (ctx === 'screen') {
      // the 2D games: A jumps, B / LT runs or swims, X / RT shoots, Y / RB the special
      if (up) want.add('ArrowUp'); if (down) want.add('ArrowDown');
      if (left) want.add('ArrowLeft'); if (right) want.add('ArrowRight');
      if (btn(A)) want.add('Space');
      if (btn(B) || btn(LT)) want.add('ShiftLeft');
      if (btn(X) || btn(RT)) want.add('KeyJ');
      if (btn(Y) || btn(RB)) want.add('KeyE');
      if (hit(BACK)) tap('KeyR');
      if (hit(START)) actions.pause();
    } else if (ctx === 'reveal') {
      if (hit(A) || hit(B) || hit(START)) tap('KeyE');
    }
    sync(want);
    prev = gp.buttons.map(b => b.pressed || b.value > .45);
  }

  // a short buzz, when the controller can
  function rumble(strong = .5, ms = 160) {
    if (!active) return;
    const gp = navigator.getGamepads?.()[gpIndex ?? 0];
    gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: Math.min(1, strong + .2) }).catch?.(() => {});
  }

  return { update, rumble, get active() { return active; } };
}

// the prompts speak the controller's language when it is the one in hand
const GLYPHS = { e: ['X', 'x'], r: ['B', 'b'], x: ['Y', 'y'], f: ['LT', 'sh'], m: ['view', 'sh'], o: ['↑', 'dp'], t: ['↓', 'dp'], p: ['start', 'sh'], 'échap': ['start', 'sh'], espace: ['A', 'a'], n: ['R3', 'sh'], clic: ['RT', 'sh'], 'clic d.': ['LT', 'sh'] };
export function padGlyphs(html) {
  return html.replace(/<b( class="[^"]*")?>([^<]+)<\/b>/g, (m, cls, k) => {
    const g = GLYPHS[k.trim().toLowerCase()];
    return g ? `<b class="pad pad-${g[1]}">${g[0]}</b>` : m;
  });
}
