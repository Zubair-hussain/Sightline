# Sightline website + web app + audit API
FROM node:22-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.renderer.json ./
COPY types ./types
COPY src ./src
COPY renderer ./renderer
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/out ./out
COPY --from=build /app/renderer/index.html /app/renderer/styles.css ./renderer/
COPY --from=build /app/renderer/dist ./renderer/dist
COPY website ./website
USER node
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Point download buttons at your GitHub releases, e.g.
#   SIGHTLINE_RELEASES_URL=https://github.com/<you>/sightline/releases/latest/download
# Behind a reverse proxy (Render, Fly, Cloudflare) set SIGHTLINE_TRUST_PROXY=1 so rate limits use the real client IP.
CMD ["node", "out/server/server.js"]
