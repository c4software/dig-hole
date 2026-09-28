# The static game (no node server: players meet over WebRTC), served by nginx.
#   docker build -f docker/static/Dockerfile -t dig-hole-static .
#   docker run --rm -p 8080:8080 dig-hole-static      → http://localhost:8080

# ---- build: the same script as for Netlify (versioned modules, minified with esbuild) ----
FROM node:22-alpine AS build
RUN apk add --no-cache bash rsync
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN ./build-static.sh /out \
 && rm -f /out/_headers /out/_redirects

# ---- serve: unprivileged nginx on 8080, gzip, the cache rules of _headers ----
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY docker/static/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
