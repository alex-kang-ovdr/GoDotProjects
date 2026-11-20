# syntax=docker/dockerfile:1.7
FROM node:24-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    PLAYFORGE_BASE_PATH=/forge \
    PLAYHUB_FORGE_AUTH_MODE=hub

WORKDIR /app/forge

COPY forge/package.json forge/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY forge/server.cjs forge/index.html forge/projects.json ./
COPY forge/OfficialGodot ./OfficialGodot
COPY forge/Studio ./Studio
COPY forge/StudioGodot ./StudioGodot
COPY forge/Frontends ./Frontends
COPY forge/Godot ./Godot
COPY forge/Templates ./Templates
COPY forge/Tools ./Tools
COPY forge/assets ./assets
COPY forge/Projects ./Projects

RUN useradd --system --uid 10001 --home /tmp --shell /usr/sbin/nologin playforge \
    && mkdir -p /tmp/playforge-accounts /tmp/playforge-studios \
    && chown -R playforge:playforge /app /tmp/playforge-accounts /tmp/playforge-studios

USER playforge
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.cjs"]
