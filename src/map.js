// map.js, the minimap in the corner and the big map on M: a top view of the garden
// (how deep each column of the plot has been dug, the house, the stalls, animals, moles,
// the other diggers) and, on the big map, a vertical cut through the hole where you stand.
import { S } from './terrain.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
// the plot tinted by how deep it's been dug: grass, then earth, then the dark
function depthColor(d) {
  if (d < .3) return '#8fbb34';
  const stops = [[0, [150, 105, 60]], [10, [120, 72, 40]], [40, [80, 50, 40]], [100, [45, 30, 40]], [250, [90, 30, 16]], [400, [200, 110, 40]]];
  for (let n = 1; n < stops.length; n++) {
    if (d <= stops[n][0]) {
      const [d0, c0] = stops[n - 1], [d1, c1] = stops[n], t = (d - d0) / (d1 - d0);
      return `rgb(${c0.map((v, i) => Math.round(v + (c1[i] - v) * t)).join(',')})`;
    }
  }
  return 'rgb(200,110,40)';
}

// what each garden looks like from above, in metres around its centre
const LAYOUT = {
  home: {
    rects: [
      { x0: -5.5, z0: -22, x1: 5.5, z1: -15, fill: '#b8584a', label: 'maison' },
      { x0: -160, z0: -15.4, x1: 160, z1: -10.8, fill: 'rgba(200,192,180,.8)' },
      { x0: -160, z0: -14.7, x1: 160, z1: -11.5, fill: 'rgba(80,86,100,.85)' },
      { x0: -6, z0: -11.85, x1: 6, z1: -9.25, fill: 'rgba(160,90,68,.8)' },
      { x0: -117, z0: -24.2, x1: -9, z1: -16.2, fill: '#d8c0a0' }, { x0: 9, z0: -24.2, x1: 117, z1: -16.2, fill: '#d8c0a0' },
      { x0: -117, z0: -10.6, x1: -72, z1: -2.6, fill: '#d8c0a0' }, { x0: 84, z0: -10.6, x1: 117, z1: -2.6, fill: '#d8c0a0' },
      { x0: 44, z0: -10.8, x1: 78, z1: 14, fill: '#d8ccb8', label: 'la place' },
      { x0: 55.5, z0: 12.2, x1: 66.5, z1: 39, fill: '#c8bca4', label: 'église' },
      { x0: -70, z0: -10.6, x1: -50, z1: .4, fill: '#e0d6c2', label: 'mairie' },
      { x0: -32, z0: 26.5, x1: -22, z1: 33.5, fill: '#5a3a26', label: 'potager' },
      { x0: -9.2, z0: 31, x1: 1.2, z1: 37, fill: '#5a8aa0' },
      { x0: -200, z0: 47.8, x1: 200, z1: 51, fill: 'rgba(200,188,164,.8)' },
      ...[[-97, -22.5], [-70, -21.5], [-44, -22], [42, -22], [67, -21], [94, -22.5]].map(([x, z]) => ({ x0: x - 4.5, z0: z - 3.7, x1: x + 4.5, z1: z + 3.7, fill: '#c8a888' })),
    ],
    dots: [
      { x: -3.2, z: -11.2, c: '#ffd75e', r: 3, label: 'vendre' },
      { x: 3.4, z: -11.4, c: '#ffd75e', r: 3, label: 'outils' },
      { x: -4.3, z: -16.4, c: '#7af4ff', r: 3, label: 'téléporteur' },
    ],
    trees: [[-16, -6], [15, -2], [18, 8], [-19, 10], [-8, 19], [10, 20], [24, -22], [-25, -20], [30, 14], [-30, 2], [-14, 24], [26, 28], [-34, 26], [36, -4],
      ...Array.from({ length: 17 }, (_, k) => -104 + k * 13).filter(x => Math.abs(x) > 11).map(x => [x, -9.6])],
    fence: 9,
  },
  china: {
    rects: [
      { x0: -160, z0: 9.4, x1: 160, z1: 20.4, fill: 'rgba(200,192,180,.8)' },
      { x0: -160, z0: 11, x1: 160, z1: 18, fill: 'rgba(80,86,100,.9)' },
      { x0: -20.3, z0: -160, x1: -9.9, z1: 160, fill: 'rgba(200,192,180,.8)' },
      { x0: -18.5, z0: -160, x1: -11.5, z1: 160, fill: 'rgba(80,86,100,.9)' },
      { x0: -160, z0: -32.6, x1: 160, z1: -25.4, fill: 'rgba(120,112,100,.9)', label: 'voie ferrée' },
      { x0: 4, z0: -25.4, x1: 60, z1: -22.4, fill: '#d8d2c8', label: 'quai' },
      { x0: 27, z0: -21.2, x1: 41, z1: -15.2, fill: '#e8e0d0', label: 'gare' },
      { x0: -5.5, z0: -19.5, x1: 5.5, z1: -13, fill: '#20a45a', label: 'konbini' },
      { x0: 45.4, z0: -8.5, x1: 54.6, z1: 8.4, fill: '#d8d0c0', label: 'sanctuaire' },
    ],
    dots: [
      { x: -10.5, z: -9.6, c: '#ffd75e', r: 3, label: 'vendre' },
      { x: 10.8, z: -11.8, c: '#7af4ff', r: 3, label: 'puits' },
      { x: 3.6, z: -18.3, c: '#7af4ff', r: 3, label: 'téléporteur' },
      { x: 50, z: 8.2, c: '#d8452a', r: 3, label: 'torii' },
    ],
    trees: [[46.6, 6], [53.4, 1], [46.8, -3], [53.3, -6.5], [30, -10.2], [14, -8], [17, -2], [-21.9, -9.5], [-21.9, 1.5], [8, -22], [48, -16.8], [56, -18.3], [-26, -20.4], [-40, -20.4], [-55, -20.9]],
    fence: 9,
  },
};

export function createMaps({ terrains, player, getHere, getExtras }) {
  const mini = document.getElementById('minimap');
  const mg = mini.getContext('2d');
  const top = document.getElementById('map-top'), tg = top.getContext('2d');
  const cut = document.getElementById('map-cut'), cg = cut.getContext('2d');
  const depths = { home: null, china: null };
  let depthT = 99, miniT = 0, bigT = 0;

  function refreshDepths(dt) {
    depthT += dt;
    if (depthT < 2) return;
    depthT = 0;
    const w = getHere();
    depths[w] = terrains[w].columnDepths();
  }

  // draw the garden around (cx, cz), `scale` px per metre, rotated by `rot`
  function drawTop(g, W, H, cx, cz, scale, rot, big) {
    const w = getHere(), T = terrains[w], L = LAYOUT[w];
    const ox = T.ox, oz = T.oz;
    g.save();
    g.clearRect(0, 0, W, H);
    g.fillStyle = w === 'china' ? '#6f8a3a' : '#5f8a2e';
    g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    g.rotate(rot);
    g.scale(scale, scale);
    g.translate(-(cx - ox), -(cz - oz));
    // ground features
    for (const r of L.rects) { g.fillStyle = r.fill; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); }
    for (const [x, z] of L.trees) { g.fillStyle = '#3f6a24'; g.beginPath(); g.arc(x, z, 1.3, 0, 7); g.fill(); }
    // the plot, column by column
    const D = depths[w], n = T.NX, half = n * S / 2;
    if (D) for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
      g.fillStyle = depthColor(D[i + n * k]);
      g.fillRect(-half + i * S, -half + k * S, S + .02, S + .02);
    }
    g.strokeStyle = 'rgba(122,82,50,.9)'; g.lineWidth = .25;
    g.strokeRect(-L.fence, -L.fence, L.fence * 2, L.fence * 2);
    for (const d of L.dots) {
      g.fillStyle = d.c; g.beginPath(); g.arc(d.x, d.z, d.r / scale * 1.3, 0, 7); g.fill();
      if (big && d.label) { g.save(); g.translate(d.x, d.z); g.scale(1 / scale, 1 / scale); g.fillStyle = '#f0e8d6'; g.font = 'italic 12px Georgia'; g.fillText(d.label, 7, 4); g.restore(); }
    }
    if (big) for (const r of L.rects) if (r.label) { g.save(); g.translate((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); g.scale(1 / scale, 1 / scale); g.fillStyle = '#f0e8d6'; g.font = 'italic 13px Georgia'; g.textAlign = 'center'; g.fillText(r.label, 0, 4); g.restore(); }
    // living things
    const ex = getExtras();
    for (const a of ex.animals) { g.fillStyle = '#f0e8d6'; g.beginPath(); g.arc(a.x - ox, a.z - oz, 2.2 / scale, 0, 7); g.fill(); }
    for (const m of ex.moles) { g.fillStyle = '#ff5a3a'; g.beginPath(); g.arc(m.x - ox, m.z - oz, 2.6 / scale, 0, 7); g.fill(); }
    for (const p of ex.peers) { g.fillStyle = hex(p.color); g.beginPath(); g.arc(p.x - ox, p.z - oz, 3.5 / scale, 0, 7); g.fill(); }
    if (ex.van) { g.fillStyle = '#e8e0c8'; g.fillRect(ex.van.x - ox - 2, ex.van.z - oz - .8, 4, 1.6); }
    g.restore();
    // me: an arrow in the middle (minimap) or at my spot (big map)
    g.save();
    if (big) {
      g.translate(W / 2 + (player.pos.x - cx) * scale, H / 2 + (player.pos.z - cz) * scale);
      g.rotate(-player.yaw);
    } else g.translate(W / 2, H / 2);
    g.fillStyle = '#ffd75e'; g.strokeStyle = '#1a130c'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  function drawMini() {
    const W = mini.width, H = mini.height;
    mg.save();
    mg.beginPath(); mg.arc(W / 2, H / 2, W / 2 - 2, 0, 7); mg.clip();
    drawTop(mg, W, H, player.pos.x, player.pos.z, 4.2, player.yaw, false);
    mg.restore();
    // north (world -z) turns with the map: it sits on the rim at (sin yaw, -cos yaw)
    const r = W / 2 - 11;
    mg.fillStyle = '#ffd75e'; mg.font = 'italic 13px Georgia'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
    mg.fillText('n', W / 2 + Math.sin(player.yaw) * r, H / 2 - Math.cos(player.yaw) * r);
  }

  // the vertical cut: the plot's columns along x at my z, all the way down
  function drawCut() {
    const w = getHere(), T = terrains[w];
    const W = cut.width, H = cut.height;
    const [, , k] = T.cellOf(player.pos.x, player.pos.y, player.pos.z);
    const sl = T.slice(k), n = T.NX, NY = T.NY;
    const img = cg.createImageData(W, H);
    const colW = W / n;
    for (let y = 0; y < H; y++) {
      const j = NY - 1 - Math.floor(y / H * NY);
      for (let x = 0; x < W; x++) {
        const i = Math.min(n - 1, Math.floor(x / colW));
        const m = sl[i + n * j];
        const c = m ? T.colorOf(m) : 0x0b0d12;
        const o = (x + W * y) * 4;
        img.data[o] = c >> 16 & 255; img.data[o + 1] = c >> 8 & 255; img.data[o + 2] = c & 255; img.data[o + 3] = 255;
      }
    }
    cg.putImageData(img, 0, 0);
    // depth ticks every 50 m, and me
    cg.fillStyle = 'rgba(240,232,214,.7)'; cg.font = 'italic 11px Georgia';
    for (let d = 0; d <= NY * S; d += NY * S > 200 ? 50 : 20) {
      const y = d / (NY * S) * H;
      cg.fillRect(0, y, 6, 1);
      cg.fillText(`${d} m`, 9, y + 4);
    }
    const px = (player.pos.x - T.X0) / (n * S) * W, py = Math.max(0, -player.pos.y) / (NY * S) * H;
    cg.fillStyle = '#ffd75e'; cg.beginPath(); cg.arc(px, py, 4, 0, 7); cg.fill();
  }

  return {
    update(dt, showMini, bigOpen) {
      refreshDepths(dt);
      miniT += dt;
      if (showMini && miniT > .1) { miniT = 0; drawMini(); }
      if (bigOpen) {
        bigT += dt;
        if (bigT > .5) {
          bigT = 0;
          const T = terrains[getHere()];
          drawTop(tg, top.width, top.height, T.ox, T.oz - 4, 9, 0, true);
          drawCut();
        }
      }
    },
    forceBig() { bigT = 99; depthT = 99; },
  };
}
