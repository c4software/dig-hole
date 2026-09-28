# The whole game: the node server (rooms, guest book, /sig, /admin) and the client it serves,
# built like deploy.sh builds dist/ (versioned module URLs, minified with esbuild).
#   docker build -f docker/Dockerfile -t dig-hole .
#   docker run -d -p 8765:8765 -v dig-hole-data:/app/data dig-hole     → http://localhost:8765
# The admin token is made on the first start in /app/data/admin-token (or set DIG_ADMIN_TOKEN).

# ---- build the client into /app/dist ----
FROM node:22-alpine AS build
RUN apk add --no-cache bash rsync
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN set -e; V=$(date +%s); mkdir -p dist \
 && rsync -a --delete index.html serveur.html netlab.html style.css favicon.svg assets vendor src dist/ \
 && find dist/src -name '*.js' -exec sed -i -E "s#((from |import\()'\.{1,2}/[a-z0-9/-]+\.js)'#\1?v=$V'#g" {} + \
 && (node tools/minify.mjs dist || echo "minification ratée : modules non minifiés") \
 && sed -i -E "s#src=\"\./src/main\.js\"#src=\"./src/main.js?v=$V\"#; s#href=\"\./style\.css\"#href=\"./style.css?v=$V\"#" dist/index.html

# ---- run: the server, its modules (src/: room, admin, catalogue) and the built client ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs admin.mjs ./
COPY src ./src
COPY --from=build /app/dist ./dist
RUN mkdir -p data && chown node:node data
USER node
VOLUME ["/app/data"]
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8765/api/notes?room=health >/dev/null || exit 1
CMD ["node", "server.mjs", "--port", "8765", "--dir", "dist"]
