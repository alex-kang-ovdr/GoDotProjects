# syntax=docker/dockerfile:1.7
FROM node:24-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    PLAYFORGE_BASE_PATH=/forge \
    PLAYFORGE_WEB_EDITOR_WASM_PROFILE=release \
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
COPY tools/build-version /app/tools/build-version
COPY tools/ugc-shared /app/tools/ugc-shared

ARG PLAYFORGE_CHANNEL=dev
ARG PLAYFORGE_BUILD_NUM=0
ARG PLAYFORGE_DAILY_SEQ=
ARG PLAYFORGE_BUILD_CODE=
ARG PLAYFORGE_BUILD_DATE=
ARG PLAYFORGE_BRANCH=playhub-platform
ARG PLAYFORGE_COMMIT=0000000
ARG PLAYFORGE_UPDATE_POLICY=optional
RUN SEMVER=$(node -p "require('./package.json').version") \
    && DATE_ARG=$([ -n "$PLAYFORGE_BUILD_DATE" ] && echo "--date $PLAYFORGE_BUILD_DATE" || true) \
    && SEQ_ARG=$([ -n "$PLAYFORGE_DAILY_SEQ" ] && echo "--daily-seq $PLAYFORGE_DAILY_SEQ" || true) \
    && node /app/tools/build-version/resolve-build-info.mjs \
      --target forge-web \
      --semver "$SEMVER" \
      --channel "$PLAYFORGE_CHANNEL" \
      --build-num "$PLAYFORGE_BUILD_NUM" \
      $SEQ_ARG \
      --branch "$PLAYFORGE_BRANCH" \
      --commit "$PLAYFORGE_COMMIT" \
      --update-policy "$PLAYFORGE_UPDATE_POLICY" \
      --clean \
      $DATE_ARG \
      --out-json /app/forge/BUILD_INFO.json \
    && if [ -n "$PLAYFORGE_BUILD_CODE" ]; then \
      node -e "const b=require('/app/forge/BUILD_INFO.json'); if(String(b.buildCode)!==String(process.env.PLAYFORGE_BUILD_CODE)){console.error('BUILD_CODE mismatch:',b.buildCode,'vs',process.env.PLAYFORGE_BUILD_CODE); process.exit(1);}"; \
    fi

RUN useradd --system --uid 10001 --home /tmp --shell /usr/sbin/nologin playforge \
    && mkdir -p /tmp/playforge-accounts /tmp/playforge-studios \
    && chown -R playforge:playforge /app /tmp/playforge-accounts /tmp/playforge-studios

USER playforge
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.cjs"]
