// touch.js, playing on a phone: a virtual controller drawn over the game. A floating stick on the left,
// buttons on the right, a drag anywhere else to look. It fills the same shape as a Gamepad (axes, buttons)
// so gamepad.js reads it like a real one, and what each button does follows the same contexts.
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, BACK = 8, START = 9, UP = 12;

// the buttons shown, and what they read as, for each context
const LAYOUTS = {
  play: [[RT, 'creuser', 'big'], [A, 'sauter'], [X, 'utiliser'], [LT, 'lancer'], [Y, 'outil'], [B, 'remonter']],
  race: [[RT, 'gaz', 'big'], [LT, 'frein'], [RB, 'dérape'], [X, 'objet'], [Y, 'replacer']],
  drive: [[RT, 'gaz', 'big'], [LT, 'frein'], [X, 'descendre'], [A, 'klaxon']],
  screen: [[A, 'sauter', 'big'], [X, 'tirer'], [B, 'courir'], [Y, 'spécial']],
};
const GLYPH = { [A]: 'A', [B]: 'B', [X]: 'X', [Y]: 'Y', [LB]: 'LB', [RB]: 'RB', [LT]: 'LT', [RT]: 'RT' };

export function createTouch({ look }) {
  const pad = { id: 'tactile', index: -1, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  let active = false, ctx = '', stick = null, lookT = null;

  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `<div class="tc-stick"><i class="tc-base"></i><i class="tc-knob"></i></div><div class="tc-btns"></div>
    <div class="tc-top"><button type="button" class="tc-mini" data-b="${START}" aria-label="pause">❚❚</button><button type="button" class="tc-mini" data-b="${BACK}" aria-label="carte">carte</button><button type="button" class="tc-mini tc-ready" data-b="${UP}" aria-label="prêt">prêt</button><button type="button" class="tc-mini tc-talk" data-b="11" aria-label="talkie">talkie</button></div>
    <div class="tc-turn"><b>tourne ton téléphone</b><span>le jeu se joue à l'horizontale</span></div>`;
  document.body.appendChild(root);
  const btnBox = root.querySelector('.tc-btns'), stickEl = root.querySelector('.tc-stick'), base = root.querySelector('.tc-base'), knob = root.querySelector('.tc-knob');

  const press = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  function layout(c) {
    const L = LAYOUTS[c] || [];
    btnBox.innerHTML = L.map(([i, label, big], n) => `<button type="button" class="tc-btn tc-${GLYPH[i].toLowerCase()}${big ? ' big' : ''}" data-b="${i}" style="--n:${n}"><b>${GLYPH[i]}</b><span>${label}</span></button>`).join('');
    root.dataset.ctx = c;
  }

  // the buttons: held while a finger is on them (each finger tracked on its own)
  const fingers = new Map();   // pointerId → button index
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    e.preventDefault();
    const i = +b.dataset.b;
    fingers.set(e.pointerId, i); press(i, true); b.classList.add('on');
    try { b.setPointerCapture(e.pointerId); } catch {}
    navigator.vibrate?.(8);
  });
  const lift = (e) => {
    if (!fingers.has(e.pointerId)) return;
    const i = fingers.get(e.pointerId); fingers.delete(e.pointerId);
    if (![...fingers.values()].includes(i)) press(i, false);
    root.querySelectorAll(`[data-b="${i}"]`).forEach(el => el.classList.remove('on'));
  };
  root.addEventListener('pointerup', lift);
  root.addEventListener('pointercancel', lift);

  // the stick: born where the thumb lands on the left half, follows it, springs back
  const R = 56;
  function stickAt(x, y) {
    let dx = x - stick.x, dy = y - stick.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    pad.axes[0] = dx / R; pad.axes[1] = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  // the stick and the look follow touches (their ids), the most dependable way on mobile browsers
  addEventListener('touchstart', (e) => {
    if (!active) setActive(true);
    if (!LAYOUTS[ctx]) return;
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (el?.closest('#touch [data-b], button, input, a, .ns-item, #lobby, #quest, #hotbar, #shop, #reader')) continue;
      const left = t.clientX < innerWidth * .45;
      if (left && !stick) {
        stick = { id: t.identifier, x: t.clientX, y: t.clientY };
        stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px';
        stickEl.classList.add('on'); stickAt(t.clientX, t.clientY);
      } else if (!left && !lookT && ctx !== 'race' && ctx !== 'drive') lookT = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) stickAt(t.clientX, t.clientY);
      else if (lookT && t.identifier === lookT.id) {
        look((t.clientX - lookT.x) * 1.6, (t.clientY - lookT.y) * 1.6);
        lookT.x = t.clientX; lookT.y = t.clientY;
      }
    }
  }, { passive: true });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) { stick = null; pad.axes[0] = pad.axes[1] = 0; knob.style.transform = ''; stickEl.classList.remove('on'); }
      if (lookT && t.identifier === lookT.id) lookT = null;
    }
  };
  addEventListener('touchend', end, { passive: true });
  addEventListener('touchcancel', end, { passive: true });

  function setActive(on) {
    active = on;
    document.body.classList.toggle('touch', on);
    // a phone: the whole screen, if the browser lets us
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  }

  return {
    get active() { return active; },
    pad,
    // what is on screen follows where you are; `lobby`: the « prêt » button shows
    render(c, { lobby = false } = {}) {
      if (!active) return;
      const shown = LAYOUTS[c] ? c : '';
      if (shown !== ctx) {
        ctx = shown; layout(shown);
        // leaving a context lets go of everything
        pad.buttons.forEach((_, i) => press(i, false)); fingers.clear(); stick = null; lookT = null;
        pad.axes[0] = pad.axes[1] = 0; stickEl.classList.remove('on');
      }
      root.classList.toggle('show', !!shown);
      root.classList.toggle('lobby', lobby);
    },
  };
}
