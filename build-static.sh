#!/usr/bin/env bash
# The game as plain files, for a static host (Netlify, any CDN): no node server behind it.
#   ./build-static.sh [outdir]      (default: dist-static)
# Players meet through public WebTorrent trackers (src/rendezvous.js), then talk over WebRTC.
# Module URLs get a version like deploy.sh does, and config.js says there is no server.
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-dist-static}"
V=$(date +%s)
mkdir -p "$OUT"
rsync -a --delete index.html serveur.html netlab.html style.css favicon.svg assets vendor src "$OUT/"
# no server: the menu offers hosting and joining only, meeting through the public trackers
printf '%s\n' "// config.js, written by build-static.sh: a static copy, no node server behind it." "export const CONFIG = { serverless: true };" > "$OUT/src/config.js"
sed -i -E "s#(from '\./[a-z0-9-]+\.js)'#\1?v=$V'#g; s#(import\('\./[a-z0-9-]+\.js)'\)#\1?v=$V')#g" "$OUT"/src/*.js
for f in "$OUT"/*.html; do
  sed -i -E "s#src=\"\./src/([a-z0-9-]+)\.js\"#src=\"./src/\1.js?v=$V\"#g; s#href=\"\./style\.css\"#href=\"./style.css?v=$V\"#" "$f"
done
# netlify: modules served as javascript, pages always fresh, versioned files cached
cat > "$OUT/_headers" <<'EOF'
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/*.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
/src/*
  Content-Type: text/javascript; charset=utf-8
  Cache-Control: public, max-age=300, must-revalidate
/vendor/*
  Content-Type: text/javascript; charset=utf-8
  Cache-Control: public, max-age=86400
/assets/*
  Cache-Control: public, max-age=86400
EOF
cat > "$OUT/_redirects" <<'EOF'
/serveur  /serveur.html  200
EOF
echo "static v$V → $OUT ($(du -sh "$OUT" | cut -f1))"
