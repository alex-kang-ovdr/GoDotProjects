# syntax=docker/dockerfile:1.7
FROM node:24-slim AS forge-assets-prep
WORKDIR /prep
COPY forge/OfficialGodot ./OfficialGodot
# vendor-release is gitignored: CI must run deploy/cloudrun/forge/web-editor-artifact.mjs fetch first.
# Fail the build instead of shipping an image whose web editor 404s.
RUN test -s ./OfficialGodot/vendor-release/godot.editor.wasm && test -s ./OfficialGodot/vendor-release/godot.editor.js \
    || { echo 'forge/OfficialGodot/vendor-release is missing the custom web editor (run web-editor-artifact.mjs fetch)' >&2; exit 1; }
RUN rm -rf ./OfficialGodot/vendor ./OfficialGodot/vendor-release/SHA256SUMS \
    && node -e "const fs=require('fs'),c=require('crypto'),p=require('path'),z=require('zlib'); const d='./OfficialGodot/vendor-release'; const w=p.join(d,'godot.editor.wasm'), j=p.join(d,'godot.editor.js'); if(fs.existsSync(w)){ const buf=fs.readFileSync(w); const tag=buf.length+'-'+c.createHash('sha256').update(buf).digest('hex').slice(0,8); if(!fs.existsSync(w+'.gz')) fs.writeFileSync(w+'.gz', z.gzipSync(buf,{level:9})); if(!fs.existsSync(w+'.br')) fs.writeFileSync(w+'.br', z.brotliCompressSync(buf)); fs.writeFileSync(p.join(d,'wasm-meta.json'), JSON.stringify({rawBytes:buf.length,validWasm:true,debugSymbolsStripped:true,contentTag:tag})); fs.unlinkSync(w); } if(fs.existsSync(j)){ const buf=fs.readFileSync(j); if(!fs.existsSync(j+'.gz')) fs.writeFileSync(j+'.gz', z.gzipSync(buf,{level:9})); if(!fs.existsSync(j+'.br')) fs.writeFileSync(j+'.br', z.brotliCompressSync(buf)); fs.unlinkSync(j); }"

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
COPY --from=forge-assets-prep /prep/OfficialGodot ./OfficialGodot
COPY forge/Frontends ./Frontends
COPY forge/Godot ./Godot
COPY forge/Templates ./Templates
COPY forge/Tools ./Tools
COPY forge/assets ./assets
COPY forge/Projects ./Projects
COPY tools/build-version /app/tools/build-version
COPY tools/engine /app/tools/engine
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
