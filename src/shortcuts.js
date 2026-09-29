// shortcuts.js, the pause menu's « raccourcis »: every key of the game, grouped, in place of the
// settings panel while it's open. Keep it in step with the key handlers (main.js, looks.js, voice.js,
// matsuri.js, spacerace.js…) and the title screen's list in index.html.
const GROUPS = [
  ['se déplacer', [
    ['z q s d', 'marcher'], ['shift', 'courir'], ['espace', 'sauter · maintenu en l\'air : jetpack'], ['souris', 'regarder'],
  ]],
  ['creuser et outils', [
    ['clic', 'creuser · tirer (pistolets, flashball)'], ['x', 'changer d\'outil : pelle, foreuse, pistolets, flashball, mains'],
    ['clic g. / d.', 'pistolet à portails : bleu / orange'], ['r', 'remonter à la surface'],
  ]],
  ['objets', [
    ['1 – 9', 'choisir un objet'], ['molette', 'objet suivant / précédent'], ['f', 'lancer l\'objet · clic d. maintenu : en rafale'],
    ['v', 'poser un paquet pour les autres'],
  ]],
  ['interagir', [
    ['e', 'utiliser, acheter, vendre, entrer, monter'], ['t', 'à l\'orgue : orgue héros · aux taikos : taiko héros · au globe : le japon'],
    ['m', 'la carte'], ['échap', 'pause'],
  ]],
  ['se montrer', [
    ['g', 'émotes · maintenu, viser, lâcher'], ['h', 'mains vides · maintiens clic g. / d. : lève la main'],
    ['n', 'talkie · maintenu : parler (à plusieurs)'],
  ]],
  ['à plusieurs', [
    ['o', 'prêt, dans le salon d\'un mini-jeu'], ['f2', 'panneau serveur (quand tu héberges)'],
  ]],
  ['aux taikos du matsuri', [
    ['f / j', 'don (centre)'], ['d / k', 'ka (bord)'], ['espace', 'grand don'], ['g / h', 'shime'], ['c', 'gong'],
    ['m / n', 'lancer / arrêter un morceau'], ['e', 'lâcher les baguettes'],
  ]],
  ['aux tribunes', [
    ['q / d', 'changer de vaisseau'], ['c', 'changer de caméra'], ['b', 'parier 50 ●'], ['e', 'quitter'],
  ]],
  ['dans les mini-jeux', [
    ['r', 'revenir sur la piste'], ['échap', 'pause · abandonner'], ['', 'les commandes de chaque jeu sont sur son écran titre'],
  ]],
];

const CSS = `
#shortcuts { position: absolute; right: calc(var(--u, 10px) * 3); top: 50%; transform: translateY(-50%); width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 48px); overflow: auto; z-index: 2; }
#shortcuts.hidden { display: none; }
#shortcuts .sk-grp { margin: 10px 0 4px; font: 900 11px/1.2 var(--text, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--a, #ffb020); }
#shortcuts .sk-row { display: flex; gap: 12px; align-items: baseline; padding: 4px 0; font-size: 14px; }
#shortcuts .sk-row b { flex: none; min-width: 92px; text-align: right; font: 800 12px/1.3 var(--text, sans-serif); color: #fff; }
#shortcuts .sk-row b span { display: inline-block; padding: 2px 7px; margin-left: 3px; border-radius: 7px; background: rgba(255,255,255,.12); box-shadow: inset 0 -2px 0 rgba(0,0,0,.35); }
#shortcuts .sk-row em { font-style: normal; opacity: .85; }
body.touch #shortcuts { right: 12px; }
`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const keyHtml = (k) => k ? k.split(' / ').map((x) => `<span>${esc(x)}</span>`).join(' ') : '';

// resume: the pause screen; settings: its settings panel; menu: the column of buttons
export function createShortcuts({ resume, settings, menu }) {
  if (!document.getElementById('shortcuts-css')) { const st = document.createElement('style'); st.id = 'shortcuts-css'; st.textContent = CSS; document.head.appendChild(st); }
  const panel = document.createElement('div');
  panel.id = 'shortcuts'; panel.className = 'panel hidden';
  panel.innerHTML = `<div class="seclabel">raccourcis clavier</div>` + GROUPS.map(([g, rows]) =>
    `<div class="sk-grp">${esc(g)}</div>` + rows.map(([k, what]) => `<div class="sk-row"><b>${keyHtml(k)}</b><em>${esc(what)}</em></div>`).join('')).join('');
  resume.appendChild(panel);
  // the button, under « reprendre »
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'pause-keys'; btn.className = 'btn btn--menu in'; btn.style.setProperty('--i', 2);
  btn.innerHTML = `<span class="btn__icon"><svg viewBox="0 0 32 32"><rect x="3" y="8" width="26" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 13h2M13 13h2M18 13h2M23 13h1M9 19h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span><span class="btn__text"><span class="btn__label">raccourcis</span></span>`;
  const first = menu.querySelector('#resume-go');
  first ? first.after(btn) : menu.prepend(btn);
  const show = (on) => {
    panel.classList.toggle('hidden', !on); settings.classList.toggle('hidden', on);
    btn.querySelector('.btn__label').textContent = on ? 'réglages' : 'raccourcis';
  };
  // (a click on the pause screen resumes the game: keep this one to ourselves)
  btn.addEventListener('click', (e) => { e.stopPropagation(); show(panel.classList.contains('hidden')); });
  for (const t of ['click', 'mousedown']) panel.addEventListener(t, (e) => e.stopPropagation());
  return { show, get open() { return !panel.classList.contains('hidden'); }, close: () => show(false) };
}
