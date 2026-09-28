#!/usr/bin/env node
// admin.mjs, the node server's console on the command line.
//   node admin.mjs [--url ws://localhost:8765] [--room jardin] [--token … | DIG_ADMIN_TOKEN | data/admin-token] [commande …]
// With a command: runs it and quits. Without: a prompt (tab completes). « help » lists them.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { connectAdmin } from './src/admin-client.js';
import { DEFS, GROUPS } from './src/tunables.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const url = opt('--url', process.env.DIG_ADMIN_URL || 'ws://localhost:8765');
const room = opt('--room', 'jardin');
let token = opt('--token', process.env.DIG_ADMIN_TOKEN || '');
if (!token) for (const f of [path.resolve('data/admin-token'), path.join(HERE, 'data/admin-token')]) { try { token = fs.readFileSync(f, 'utf8').trim(); break; } catch {} }
if (!token) { console.error('pas de jeton : --token, DIG_ADMIN_TOKEN, ou data/admin-token (lancer depuis le dossier du serveur)'); process.exit(2); }
const WS = globalThis.WebSocket || (await import('ws')).default;

// ---------- what can be given: coins, the hotbar's items, the sack's ores, rocket parts ----------
// the catalog needs the game's modules (three.js): loaded when there, else items only
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
let CAT = { items: [['dyn', 'dynamite'], ['sup', 'super bombe'], ['fus', 'fusée-foreuse'], ['med', 'trousse de soin'], ['cell', 'pile de secours'], ['ladder', 'échelle'], ['grav', 'gélule anti-gravité'], ['met', 'météore de poche']], sack: [], parts: [] };
try {
  globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
  const { CATALOG } = await import('./src/catalog.js');
  CAT = { ...CATALOG, sack: CATALOG.sack.map(([id, n]) => [id, n.replace(/ \(.*\)$/, '')]) };
} catch {}
// « fer », « 21 », « dyn », « pièces »… → what it is
function thing(word) {
  const w = fold(word);
  if (['coins', 'coin', 'pieces', 'piece', 'argent', 'or', '●'].includes(w)) return { kind: 'coins', name: 'pièces' };
  for (const [kind, list] of [['items', CAT.items], ['sack', CAT.sack], ['parts', CAT.parts]]) {
    const hit = list.find(([id, n]) => fold(id) === w || fold(n) === w) || list.find(([, n]) => fold(n).startsWith(w)) || list.find(([, n]) => fold(n).includes(w));
    if (hit) return { kind, id: hit[0], name: hit[1] };
  }
  return null;
}

// ---------- the commands ----------
const out = (...a) => console.log(...a);
const val = (d, v) => d.options ? (d.options.find(o => o[0] === v)?.[1] ?? v) : d.k === 'hour' && v < 0 ? 'auto' : v + (d.unit && d.unit !== '×' ? d.unit : d.unit === '×' ? ' ×' : '');
async function playerOf(a, word) {
  if (fold(word) === 'all' || fold(word) === 'tous' || fold(word) === 'tout') return null;
  const ps = await a.call('players');
  const p = ps.find(x => String(x.id) === word) || ps.find(x => fold(x.name) === fold(word)) || ps.find(x => fold(x.name).startsWith(fold(word)));
  if (!p) throw new Error(`personne ne s'appelle « ${word} » (players pour la liste)`);
  return p;
}
const HELP = `commandes :
  players                        qui est là (id, nom, monde, position)
  get [clé|groupe|modifiés]      les réglages en direct, par groupe (${GROUPS.join(', ')})
  set <clé> <valeur>             change un réglage, pour tout le monde
  reset [clé|all]                remet un réglage (ou tous) à l'origine
  give <joueur|all> <quoi> [n]   donne : pièces, un objet (dynamite, échelle…), un minerai (fer, 21…), une pièce de fusée
  kick <joueur>                  renvoie quelqu'un
  heal <joueur|all>              vie, batterie et oxygène au plein
  money <joueur|all> <n>         fixe la bourse
  tp <joueur|all> <lieu>         maison, japon, lune ou mars
  parcel <joueur|all> [objet]    un colis livré devant la porte
  refinds                        les trésors déterrés retournent sous terre
  raid                           un bombardier pour tout le jardin (dans 12 s)
  newmap                         une nouvelle carte (le trou est rebouché)
  superreset                     tous les mondes détruits puis refaits, pour tout le monde (15 s)
  say <texte>                    un mot à l'écran de tout le monde
  notes                          le livre d'or ; delnote <n> efface le n-ième
  help · quit`;
const CMDS = ['players', 'get', 'set', 'reset', 'give', 'kick', 'heal', 'money', 'tp', 'parcel', 'refinds', 'raid', 'newmap', 'superreset', 'say', 'notes', 'delnote', 'help', 'quit'];
const KEYS = DEFS.filter(d => !d.hidden).map(d => d.k);

async function run(a, line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return;
  const c = fold(cmd);
  if (c === 'help' || c === '?') return out(HELP);
  if (c === 'players' || c === 'joueurs') {
    const ps = await a.call('players');
    if (!ps.length) return out('personne dans le jardin');
    for (const p of ps) out(`  ${String(p.id).padStart(4)}  ${p.name.padEnd(10)}  ${String(p.w || '?').padEnd(6)}  ${Array.isArray(p.p) ? p.p.map(v => (+v).toFixed(1)).join(' ') : ''}${p.g ? '  (' + p.g + ')' : ''}`);
    return out(`${ps.length} joueur${ps.length > 1 ? 's' : ''}`);
  }
  if (c === 'get') {
    // get · get <clé> · get <groupe> (explosifs, boutique…) · get modifiés
    const v = await a.call('values');
    const q = rest.join(' ');
    const mod = /^modifi/.test(fold(q));
    for (const g of GROUPS) {
      const ds = DEFS.filter(d => d.g === g && !d.hidden && (!q || mod ? (!mod || d.k in v) : d.k === q || fold(g) === fold(q)));
      if (!ds.length) continue;
      out(`${g}${ds.some(d => d.k in v) ? ` (${ds.filter(d => d.k in v).length} modifié${ds.filter(d => d.k in v).length > 1 ? 's' : ''})` : ''}`);
      for (const d of ds) out(`  ${(d.k in v ? '*' : ' ')} ${d.k.padEnd(14)} ${String(val(d, d.k in v ? v[d.k] : d.def)).padEnd(10)} ${d.label}`);
    }
    return;
  }
  if (c === 'set') {
    const d = DEFS.find(x => x.k === rest[0] && !x.hidden);
    if (!d) throw new Error('clé inconnue : ' + (rest[0] || '?') + ' (get pour la liste)');
    let v = rest[1];
    if (d.options && isNaN(+v)) v = d.options.find(o => fold(o[1]) === fold(v))?.[0];
    if (v == null || isNaN(+v)) throw new Error('valeur ? ' + (d.options ? d.options.map(o => o[1]).join(' / ') : `${d.min} à ${d.max}`));
    const now = await a.call('set', d.k, +v);
    return out(`${d.label} : ${val(d, d.k in now ? now[d.k] : d.def)}`);
  }
  if (c === 'reset') {
    const k = !rest[0] || fold(rest[0]) === 'all' ? null : rest[0];
    if (k && !KEYS.includes(k)) throw new Error('clé inconnue : ' + k);
    await a.call('reset', k);
    return out(k ? `${k} : valeur d'origine` : 'tous les réglages remis à l\'origine');
  }
  if (c === 'give' || c === 'donner') {
    if (rest.length < 2) throw new Error('give <joueur|all> <quoi> [n]');
    const p = await playerOf(a, rest[0]);
    const n = rest.length > 2 && !isNaN(+rest.at(-1)) ? Math.max(1, Math.floor(+rest.at(-1))) : 1;
    const what = rest.slice(1, rest.length > 2 && !isNaN(+rest.at(-1)) ? -1 : undefined).join(' ');
    const t = thing(what);
    if (!t) throw new Error(`« ${what} » ? des pièces, un objet (${CAT.items.map(i => i[1]).join(', ')})${CAT.sack.length ? ', un minerai (fer, or, diamant…)' : ''}`);
    const gift = { coins: 0, items: {}, sack: {}, parts: [] };
    if (t.kind === 'coins') gift.coins = n; else if (t.kind === 'parts') gift.parts.push(t.id); else gift[t.kind][t.id] = n;
    await a.call('give', p ? p.id : null, gift);
    return out(`donné à ${p ? p.name : 'tout le monde'} : ${t.kind === 'parts' ? t.name : n + ' × ' + t.name}`);
  }
  if (c === 'kick') { const p = await playerOf(a, rest[0] || '?'); if (!p) throw new Error('kick <joueur>'); const ok = await a.call('kick', p.id); return out(ok ? `${p.name} renvoyé` : 'pas pu'); }
  if (c === 'heal' || c === 'soigner') { const p = await playerOf(a, rest[0] || 'all'); await a.call('act', p ? p.id : null, 'heal'); return out(`${p ? p.name : 'tout le monde'} : vie, batterie et oxygène au plein`); }
  if (c === 'money' || c === 'argent') {
    const p = await playerOf(a, rest[0] || '?'); const n = Math.floor(+rest[1]);
    if (!Number.isFinite(n) || n < 0) throw new Error('money <joueur|all> <pièces>');
    await a.call('act', p ? p.id : null, 'money', n); return out(`bourse de ${p ? p.name : 'tout le monde'} : ${n} ●`);
  }
  if (c === 'tp') {
    const p = await playerOf(a, rest[0] || '?');
    const to = { maison: 'home', home: 'home', japon: 'china', china: 'china', lune: 'moon', moon: 'moon', mars: 'mars' }[fold(rest[1] || '')];
    if (!to) throw new Error('tp <joueur|all> <maison|japon|lune|mars>');
    await a.call('act', p ? p.id : null, 'tp', to); return out(`${p ? p.name : 'tout le monde'} → ${rest[1]}`);
  }
  if (c === 'parcel' || c === 'colis') {
    const p = await playerOf(a, rest[0] || 'all'); const t = rest[1] ? thing(rest.slice(1).join(' ')) : { kind: 'items', id: 'dyn', name: 'dynamite' };
    if (!t || t.kind !== 'items') throw new Error('parcel <joueur|all> [objet]');
    await a.call('act', p ? p.id : null, 'parcel', t.id); return out(`colis en route pour ${p ? p.name : 'tout le monde'} : ${t.name}`);
  }
  if (c === 'refinds' || c === 'tresors') { await a.call('refinds'); return out('tous les trésors sont de retour sous terre'); }
  if (c === 'raid') { await a.call('raid'); return out('un bombardier arrive (alerte, puis 12 s)'); }
  if (c === 'superreset') { const ok = await a.call('superReset'); return out(ok === false ? 'un super reset est déjà en cours' : 'super reset lancé : tous les mondes refaits dans 15 s'); }
  if (c === 'newmap') { await a.call('resetMap'); return out('nouvelle carte : le trou est rebouché pour tout le monde'); }
  if (c === 'say') { const t = rest.join(' '); if (!t) throw new Error('say <texte>'); await a.call('say', t); return out('annoncé'); }
  if (c === 'notes') { const ns = await a.call('notes'); ns.forEach((x, i) => out(`  ${String(i + 1).padStart(3)}  ${x.name} · ${x.text}`)); return out(ns.length ? '' : 'pas de mot'); }
  if (c === 'delnote') { const ns = await a.call('notes'); const x = ns[+rest[0] - 1]; if (!x) throw new Error('delnote <n> (notes pour la liste)'); await a.call('delNote', x.at); return out(`effacé : ${x.name} · ${x.text}`); }
  throw new Error(`« ${cmd} » ? (help)`);
}

let a;
try { a = await connectAdmin({ url, room, token, WS }); }
catch (e) { console.error(`${url} · ${e.message}`); process.exit(1); }

if (argv.length) {
  try { await run(a, argv.join(' ')); } catch (e) { console.error(e.message); a.close(); process.exit(1); }
  a.close();
  process.exit(0);
}

out(`connecté à ${url} · salle « ${room} » · help pour les commandes`);
const words = () => [...CMDS, ...KEYS, 'all', ...(a.snap?.players || []).map(p => p.name), ...CAT.items.map(i => i[1]), 'pièces'];
const rl = readline.createInterface({
  input: process.stdin, output: process.stdout, prompt: 'jardin> ',
  // after « set », « reset » or « get »: the keys (and for get, the groups); else everything
  completer: (line) => {
    const parts = line.split(/\s+/), last = parts.pop(), first = parts[0];
    const pool = parts.length === 1 && ['set', 'reset'].includes(first) ? KEYS : parts.length === 1 && first === 'get' ? [...KEYS, ...GROUPS, 'modifiés'] : words();
    const hits = pool.filter(w => w.startsWith(last));
    return [hits, last];
  },
});
a.onClose = () => { console.error('\ndéconnecté'); process.exit(1); };
rl.prompt();
rl.on('line', async (line) => {
  if (/^\s*(quit|exit|q)\s*$/.test(line)) { a.close(); process.exit(0); }
  try { await run(a, line); } catch (e) { console.error(e.message); }
  rl.prompt();
});
rl.on('close', () => { a.close(); process.exit(0); });
