#!/usr/bin/env bash
# One-time bootstrap for a Debian 12 GCE VM (e2-micro) running PlayHub + PlayForge.
#   sudo bash setup-vm.sh <site>     e.g. sudo bash setup-vm.sh 34-82-1-2.sslip.io
# Installs Docker + compose plugin, adds 2 GiB swap, prepares /opt/playhub and the
# persistent data directories, writes /opt/playhub/.env with a fresh internal secret,
# and lets root's Docker pull from Artifact Registry with the VM service account.
set -euo pipefail

SITE="${1:-}"
if [[ ! "${SITE}" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; then
  echo "usage: sudo bash setup-vm.sh <site host name, e.g. 34-82-1-2.sslip.io>" >&2
  exit 1
fi
[[ "$(id -u)" -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR=/opt/playhub
DATA_DIR=/var/lib/playhub
REGISTRY_HOST=us-west1-docker.pkg.dev

# Docker Engine + compose plugin from Docker's apt repository.
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

# e2-micro has 1 GiB RAM; swap absorbs Forge's short spikes while serving the editor.
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-playhub-swap.conf
fi

# Containers run as uid 10001 (see deploy/cloudrun/*/Dockerfile).
install -d -m 0750 "${APP_DIR}"
install -d -m 0700 -o 10001 -g 10001 "${DATA_DIR}/hub" "${DATA_DIR}/forge"
install -d -m 0700 "${DATA_DIR}/caddy"

if [[ ! -f "${APP_DIR}/.env" ]]; then
  SECRET="$(openssl rand -hex 32)"
  RELAY_SECRET="$(openssl rand -hex 32)"
  sed -e "s|^PLAYHUB_SITE=.*|PLAYHUB_SITE=${SITE}|" \
      -e "s|^PLAYHUB_PUBLIC_ORIGIN=.*|PLAYHUB_PUBLIC_ORIGIN=https://${SITE}|" \
      -e "s|^PLAYHUB_FORGE_INTERNAL_SECRET=.*|PLAYHUB_FORGE_INTERNAL_SECRET=${SECRET}|" \
      -e "s|^PLAYHUB_RELAY_TICKET_SECRET=.*|PLAYHUB_RELAY_TICKET_SECRET=${RELAY_SECRET}|" \
      "${HERE}/vm.env.example" > "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
fi
install -m 0644 "${HERE}/docker-compose.yml" "${HERE}/Caddyfile" "${APP_DIR}/"
install -m 0755 "${HERE}/deploy.sh" "${APP_DIR}/deploy.sh"

# Artifact Registry pulls use the VM service account (needs roles/artifactregistry.reader).
gcloud auth configure-docker "${REGISTRY_HOST}" --quiet

echo "Bootstrap complete. Deploy an image tag with: sudo ${APP_DIR}/deploy.sh <immutable tag>"
