# syntax=docker/dockerfile:1.7
FROM node:24-slim

ENV NODE_ENV=production \
    PORT=8080 \
    PLAYHUB_ROLE=public

WORKDIR /app

# Hub runtime + prebuilt static output
COPY hub/package.json ./hub/package.json
COPY hub/server ./hub/server
COPY hub/dist ./hub/dist
COPY hub/tools/runtime-output.cjs ./hub/tools/runtime-output.cjs
COPY hub/tools/backup.mjs ./hub/tools/backup.mjs
COPY hub/tools/restore-data.mjs ./hub/tools/restore-data.mjs
COPY hub/tools/store-proxy.mjs ./hub/tools/store-proxy.mjs

# Embedded PlayForge Asset Store runtime & catalog (served via /store/ SSO proxy)
COPY store/server ./store/server
COPY store/web ./store/web
COPY store/schemas ./store/schemas
COPY store/data ./store/data

# Forge tools required by Hub ForgeGateway (local mode until S4 remote gateway lands)
COPY forge/Tools ./forge/Tools
COPY forge/package.json ./forge/package.json
COPY forge/Godot/addons/playforge_avatar ./forge/Godot/addons/playforge_avatar

# Shared build-version & UGC contract/MMO SSOT modules
COPY tools/build-version ./tools/build-version
COPY tools/ugc-shared ./tools/ugc-shared
ARG PLAYHUB_CHANNEL=dev
ARG PLAYHUB_BUILD_NUM=0
ARG PLAYHUB_DAILY_SEQ=
ARG PLAYHUB_BUILD_CODE=
ARG PLAYHUB_BUILD_DATE=
ARG PLAYHUB_BRANCH=playhub-platform
ARG PLAYHUB_COMMIT=0000000
ARG PLAYHUB_UPDATE_POLICY=optional
RUN SEMVER=$(node -p "require('./hub/package.json').version") \
    && DATE_ARG=$([ -n "$PLAYHUB_BUILD_DATE" ] && echo "--date $PLAYHUB_BUILD_DATE" || true) \
    && SEQ_ARG=$([ -n "$PLAYHUB_DAILY_SEQ" ] && echo "--daily-seq $PLAYHUB_DAILY_SEQ" || true) \
    && node tools/build-version/resolve-build-info.mjs \
      --target hub \
      --semver "$SEMVER" \
      --channel "$PLAYHUB_CHANNEL" \
      --build-num "$PLAYHUB_BUILD_NUM" \
      $SEQ_ARG \
      --branch "$PLAYHUB_BRANCH" \
      --commit "$PLAYHUB_COMMIT" \
      --update-policy "$PLAYHUB_UPDATE_POLICY" \
      --clean \
      $DATE_ARG \
      --out-json ./BUILD_INFO.json \
    && if [ -n "$PLAYHUB_BUILD_CODE" ]; then \
      node -e "const b=require('./BUILD_INFO.json'); if(String(b.buildCode)!==String(process.env.PLAYHUB_BUILD_CODE)){console.error('BUILD_CODE mismatch:',b.buildCode,'vs',process.env.PLAYHUB_BUILD_CODE); process.exit(1);}"; \
    fi

# Cloud Run edge wrapper (keeps local hub/server/* and Run_PlayHub_Portable.cmd untouched)
COPY deploy/cloudrun/hub/entrypoint.mjs ./deploy/cloudrun/hub/entrypoint.mjs

RUN useradd --system --uid 10001 --home /tmp --shell /usr/sbin/nologin playhub \
    && chown -R playhub:playhub /app

USER playhub
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/_healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "deploy/cloudrun/hub/entrypoint.mjs"]
