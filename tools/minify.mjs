// tools/minify.mjs <dir>: minifies, in place, every module of a built copy of the game (dir/src, dir/vendor/addons)
// with esbuild. Each file stays an ES module at its own path (the ?v= of the imports kept), so the page, the
// dynamic import() of the games and the cache busting work as before. Without esbuild (npm i skipped):
// a warning, and the files are left as they are.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error('usage: node tools/minify.mjs <dir>'); process.exit(2); }
let esbuild;
try { esbuild = await import('esbuild'); } catch {
  console.warn('⚠ esbuild absent (npm i) : modules laissés tels quels, non minifiés');
  process.exit(0);
}
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name) && !/\.min\.js$/.test(e.name)) files.push(p); } };
for (const sub of ['src', 'vendor/addons']) if (fs.existsSync(path.join(dir, sub))) walk(path.join(dir, sub));
let before = 0, after = 0;
await Promise.all(files.map(async (f) => {
  const code = fs.readFileSync(f, 'utf8');
  let min = code;
  try { min = (await esbuild.transform(code, { loader: 'js', format: 'esm', minify: true, target: 'es2022', legalComments: 'inline', sourcefile: path.relative(dir, f) })).code; }
  catch (e) { console.warn(`⚠ ${path.relative(dir, f)} laissé tel quel : ${e.message.split('\n')[0]}`); }
  fs.writeFileSync(f, min);
  before += code.length; after += min.length;
}));
// the stylesheet too
const css = path.join(dir, 'style.css');
if (fs.existsSync(css)) {
  const code = fs.readFileSync(css, 'utf8');
  try { const min = (await esbuild.transform(code, { loader: 'css', minify: true })).code; fs.writeFileSync(css, min); before += code.length; after += min.length; }
  catch (e) { console.warn(`⚠ style.css laissé tel quel : ${e.message.split('\n')[0]}`); }
}
console.log(`minifié : ${files.length} modules + style.css,${(before / 1024).toFixed(0)} → ${(after / 1024).toFixed(0)} ko`);
