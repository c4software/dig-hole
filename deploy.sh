#!/usr/bin/env bash
# Snapshot the game into dist/ with cache-busted, minified module URLs, then restart the server on :8765.
set -euo pipefail
cd "$(dirname "$0")"
V=$(date +%s)
rsync -a --delete index.html serveur.html netlab.html style.css favicon.svg assets vendor src dist/
# every module import, static or import() (the games come on demand), gets the version
find dist/src -name '*.js' -exec sed -i -E "s#((from |import\()'\.{1,2}/[a-z0-9/-]+\.js)'#\1?v=$V'#g" {} +
# then minified in place, same files, same paths (tools/minify.mjs; without esbuild: left as is, with a warning)
node tools/minify.mjs dist || echo "⚠ minification ratée : modules non minifiés"
sed -i -E "s#src=\"\./src/main\.js\"#src=\"./src/main.js?v=$V\"#; s#href=\"\./style\.css\"#href=\"./style.css?v=$V\"#" dist/index.html
PID=$(ss -ltnp | grep ':8765 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)
[ -n "$PID" ] && kill "$PID" && sleep 0.5
mkdir -p data
setsid nohup node server.mjs --port 8765 --dir dist > data/server.log 2>&1 &
sleep 1
echo "deployed v$V"
