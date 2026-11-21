# syntax=docker/dockerfile:1.7
# P0 Isolated Godot 4.7.2 Web Build Worker for GCP Cloud Run Jobs
FROM node:24-slim

ARG GODOT_VERSION=4.7.2-stable
ARG GODOT_TEMPLATE_DIR=4.7.2.stable
ARG GODOT_RELEASE_BASE=https://github.com/godotengine/godot-builds/releases/download

ENV NODE_ENV=production \
    HOME=/home/builder \
    GODOT_BIN=/usr/local/bin/godot

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip libfontconfig1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /home/builder --shell /usr/sbin/nologin builder

# Install official Linux headless Godot binary + Web-only export templates
RUN set -eux; \
    mkdir -p /tmp/godot-dl "/home/builder/.local/share/godot/export_templates/${GODOT_TEMPLATE_DIR}"; \
    curl -fsSL "${GODOT_RELEASE_BASE}/${GODOT_VERSION}/Godot_v${GODOT_VERSION}_linux.x86_64.zip" -o /tmp/godot-dl/godot.zip; \
    unzip -q /tmp/godot-dl/godot.zip -d /tmp/godot-dl/bin; \
    mv /tmp/godot-dl/bin/Godot_v*_linux.x86_64 /usr/local/bin/godot; \
    chmod 0755 /usr/local/bin/godot; \
    curl -fsSL "${GODOT_RELEASE_BASE}/${GODOT_VERSION}/Godot_v${GODOT_VERSION}_export_templates.tpz" -o /tmp/godot-dl/templates.tpz; \
    unzip -q -j /tmp/godot-dl/templates.tpz 'templates/web_*' -d "/home/builder/.local/share/godot/export_templates/${GODOT_TEMPLATE_DIR}"; \
    rm -rf /tmp/godot-dl; \
    chown -R builder:builder /home/builder

WORKDIR /app

COPY forge/Tools/export-godot-project.cjs ./forge/Tools/export-godot-project.cjs
COPY forge/Tools/deployment-zip-validator.cjs ./forge/Tools/deployment-zip-validator.cjs
COPY forge/Tools/playhub-godot-shell.js ./forge/Tools/playhub-godot-shell.js
COPY forge/Tools/avatar-seal.cjs ./forge/Tools/avatar-seal.cjs
COPY deploy/cloudrun/build-worker/worker.mjs ./deploy/cloudrun/build-worker/worker.mjs

RUN chown -R builder:builder /app

USER builder
ENTRYPOINT ["node", "/app/deploy/cloudrun/build-worker/worker.mjs"]
