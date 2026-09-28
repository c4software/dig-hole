// compass.js, the rocket compass (made at the bench): the quest card points at the nearest
// rocket part still buried in the world you're in, with its exact distance and depth.
export function createPartCompass() {
  const $ = (id) => document.getElementById(id);
  const card = $('quest'), word = $('quest-word'), fill = $('quest-fill'), arrow = $('quest-arrow'), depthEl = $('quest-depth');
  const WORDS = [[1.5, 'juste là !'], [4, 'tout près'], [10, 'proche'], [30, 'en route'], [80, 'loin'], [Infinity, 'très loin']];
  const last = {};
  const set = (k, v, f) => { if (last[k] !== v) { last[k] = v; f(v); } };
  let shown = false, target = null;
  // the card's own words, put back when the compass lets go of it (the key's hint uses them)
  const orig = { label: card.querySelector('.seclabel span').textContent, title: $('quest-title').textContent, sub: $('quest-sub').textContent };
  return {
    // list: the finds of the world you're in; away: where the next part is when none is left here
    update(dt, player, list, away, show) {
      target = null;
      if (show) {
        let bd = Infinity;
        for (const f of list) if (!f.gone && f.def.kind === 'part') { const d = f.center.distanceTo(player.pos); if (d < bd) { bd = d; target = f; } }
      }
      const far = show && !target && away;
      show = show && (!!target || !!far);
      if (show !== shown) {
        shown = show;
        if (show) {
          for (const k in last) delete last[k];
          card.querySelector('.seclabel span').textContent = 'boussole de fusée';
          card.classList.remove('hidden', 'got', 'out');
          card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
        } else {
          card.classList.add('hidden');
          card.querySelector('.seclabel span').textContent = orig.label; $('quest-title').textContent = orig.title; $('quest-sub').textContent = orig.sub;
        }
      }
      if (!show) return false;
      if (far) {
        set('t', 'far:' + far, () => { $('quest-title').textContent = 'plus rien ici'; $('quest-sub').textContent = 'la prochaine pièce de fusée est ' + far; });
        set('w', 'ailleurs', (v) => { word.textContent = v; });
        set('f', 0, (v) => { fill.style.width = v + '%'; });
        set('a', 'down', () => { arrow.classList.add('down'); });
        set('d', 'la prochaine pièce est ' + far, (v) => { depthEl.textContent = v; });
        return true;
      }
      const p = target.center;
      set('t', target.def.name, (v) => { $('quest-title').textContent = v; $('quest-sub').textContent = 'la pièce de fusée la plus proche'; });
      const dx = p.x - player.pos.x, dz = p.z - player.pos.z, flat = Math.hypot(dx, dz);
      const dy = p.y - (player.pos.y + .9), d = Math.hypot(flat, dy);
      const heat = Math.max(0, 1 - d / 120);
      set('w', WORDS.find(([m]) => d < m)[1], (v) => { word.textContent = v; });
      set('c', Math.round(heat * 40), (v) => { word.style.color = `hsl(${200 - v * 5}, 95%, ${60 + v * .2}%)`; card.style.setProperty('--heat', v / 40); });
      set('f', Math.round(heat * 100), (v) => { fill.style.width = v + '%'; });
      const rel = Math.atan2(-dx, -dz) - player.yaw;
      set('a', flat < 1 ? 'down' : Math.round(rel * 30), (v) => { arrow.classList.toggle('down', v === 'down'); if (v !== 'down') arrow.style.transform = `rotate(${-v / 30}rad)`; });
      // precise: tenths of a metre, sideways and up or down
      const side = flat < 1 ? 'droit dessous' : `à ${flat < 10 ? flat.toFixed(1) : Math.round(flat)} m à l'horizontale`;
      const vert = Math.abs(dy) < .6 ? 'à ta hauteur' : dy < 0 ? `${(-dy).toFixed(1)} m plus bas` : `${dy.toFixed(1)} m plus haut`;
      set('d', `${side} · ${vert}`, (v) => { depthEl.textContent = v; });
      const lob = $('lobby');
      set('l', lob && !lob.classList.contains('hidden') ? lob.offsetHeight + 12 : 0, (v) => card.style.setProperty('--lift', v + 'px'));
      return true;
    },
  };
}
