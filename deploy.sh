#!/usr/bin/env bash
# Snapshot the game into dist/ with cache-busted module URLs, then restart the server on :8765.
set -euo pipefail
cd "$(dirname "$0")"
V=$(date +%s)
rsync -a --delete index.html style.css favicon.svg vendor src dist/
sed -i -E "s#(from '\./[a-z]+\.js)'#\1?v=$V'#g" dist/src/*.js
sed -i -E "s#src=\"\./src/main\.js\"#src=\"./src/main.js?v=$V\"#; s#href=\"\./style\.css\"#href=\"./style.css?v=$V\"#" dist/index.html
PID=$(ss -ltnp | grep ':8765 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)
[ -n "$PID" ] && kill "$PID" && sleep 0.5
mkdir -p data
setsid nohup node server.mjs --port 8765 --dir dist > data/server.log 2>&1 &
sleep 1
echo "deployed v$V"
