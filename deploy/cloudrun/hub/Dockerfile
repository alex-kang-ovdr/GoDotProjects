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

# Forge tools required by Hub ForgeGateway (local mode until S4 remote gateway lands)
COPY forge/Tools ./forge/Tools
COPY forge/package.json ./forge/package.json

# Shared build-version SSOT module & immutable BUILD_INFO.json
COPY tools/build-version ./tools/build-version
ARG PLAYHUB_CHANNEL=dev
ARG PLAYHUB_BUILD_NUM=0
ARG PLAYHUB_DAILY_SEQ=0
ARG PLAYHUB_BUILD_DATE=
ARG PLAYHUB_BRANCH=playhub-platform
ARG PLAYHUB_COMMIT=0000000
ARG PLAYHUB_UPDATE_POLICY=optional
RUN SEMVER=$(node -p "require('./hub/package.json').version") \
    && DATE_ARG=$([ -n "$PLAYHUB_BUILD_DATE" ] && echo "--date $PLAYHUB_BUILD_DATE" || true) \
    && node tools/build-version/resolve-build-info.mjs \
      --target hub \
      --semver "$SEMVER" \
      --channel "$PLAYHUB_CHANNEL" \
      --build-num "$PLAYHUB_BUILD_NUM" \
      --daily-seq "$PLAYHUB_DAILY_SEQ" \
      --branch "$PLAYHUB_BRANCH" \
      --commit "$PLAYHUB_COMMIT" \
      --update-policy "$PLAYHUB_UPDATE_POLICY" \
      --clean \
      $DATE_ARG \
      --out-json ./BUILD_INFO.json

# Cloud Run edge wrapper (keeps local hub/server/* and Run_PlayHub_Portable.cmd untouched)
COPY deploy/cloudrun/hub/entrypoint.mjs ./deploy/cloudrun/hub/entrypoint.mjs

RUN useradd --system --uid 10001 --home /tmp --shell /usr/sbin/nologin playhub \
    && chown -R playhub:playhub /app

USER playhub
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/_healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "deploy/cloudrun/hub/entrypoint.mjs"]
