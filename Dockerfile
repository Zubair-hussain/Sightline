# Sightline website + web app + audit API (Next.js, standalone output)
FROM node:26-slim AS build
WORKDIR /repo
# The web app shares the audit engine, types and UI with the desktop app.
COPY tsconfig.json tsconfig.renderer.json llms.txt ./
COPY types ./types
COPY src/engine ./src/engine
COPY renderer ./renderer
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && SIGHTLINE_STANDALONE=1 npm run build

FROM node:26-slim
WORKDIR /srv
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/web/.next/standalone ./
COPY --from=build /repo/web/.next/static ./web/.next/static
COPY --from=build /repo/web/public ./web/public
USER node
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# SIGHTLINE_RELEASES_URL  where download buttons point (defaults to this repo's latest GitHub release)
# NEXT_PUBLIC_SITE_URL    your public URL, used for canonical links, sitemap and social cards (set at build time)
# SIGHTLINE_TRUST_PROXY=1 behind a reverse proxy, so rate limits use the real client IP
CMD ["node", "web/server.js"]
