#!/usr/bin/env bash
# Deploy an immutable image tag to the PlayHub VM.
#   sudo bash deploy.sh <tag>
# <tag> is a tag pushed for both hub and forge by the Cloud Run pipeline (the short
# commit SHA tag works for both). When run from a fresh copy of deploy/vm/ (CI), the
# compose file and Caddyfile next to this script are installed first.
set -euo pipefail

TAG="${1:-}"
if [[ ! "${TAG}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "usage: sudo bash deploy.sh <immutable image tag>" >&2
  exit 1
fi
[[ "$(id -u)" -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR=/opt/playhub
REPO=us-west1-docker.pkg.dev/playhub-dev-2611/playhub-containers
[[ -f "${APP_DIR}/.env" ]] || { echo "${APP_DIR}/.env missing; run setup-vm.sh first" >&2; exit 1; }

if [[ "${HERE}" != "${APP_DIR}" ]]; then
  install -m 0644 "${HERE}/docker-compose.yml" "${HERE}/Caddyfile" "${APP_DIR}/"
  install -m 0755 "${HERE}/deploy.sh" "${APP_DIR}/deploy.sh"
fi

PREVIOUS_HUB="$(grep '^HUB_IMAGE=' "${APP_DIR}/.env" | cut -d= -f2- || true)"
PREVIOUS_FORGE="$(grep '^FORGE_IMAGE=' "${APP_DIR}/.env" | cut -d= -f2- || true)"
set_image() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "${APP_DIR}/.env"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${APP_DIR}/.env"
  else
    echo "${key}=${value}" >> "${APP_DIR}/.env"
  fi
}

cd "${APP_DIR}"
set_image HUB_IMAGE "${REPO}/hub:${TAG}"
set_image FORGE_IMAGE "${REPO}/forge:${TAG}"

rollback() {
  echo "Deploy of ${TAG} failed health checks; restoring previous images." >&2
  [[ -n "${PREVIOUS_HUB}" ]] && set_image HUB_IMAGE "${PREVIOUS_HUB}"
  [[ -n "${PREVIOUS_FORGE}" ]] && set_image FORGE_IMAGE "${PREVIOUS_FORGE}"
  if [[ "${PREVIOUS_HUB}" != *REPLACE_TAG* && -n "${PREVIOUS_HUB}" ]]; then
    docker compose up -d --remove-orphans || true
  fi
  exit 1
}

docker compose pull
docker compose up -d --remove-orphans

# Health: Hub edge, Forge through Hub's /forge proxy (both on loopback).
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/_healthz >/dev/null \
     && curl -fsS http://127.0.0.1:8080/forge/api/health >/dev/null; then
    docker image prune -f >/dev/null
    echo "Deployed ${TAG}"
    exit 0
  fi
  sleep 2
done
rollback
