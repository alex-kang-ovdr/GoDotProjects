#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IPA_PATH="${1:-}"
STAGE="${2:-release}"
MAX_MIB="${3:-30}"

if [[ -z "${IPA_PATH}" || ! -f "${IPA_PATH}" ]]; then
  echo "Usage: $0 <path/to/PlayHub.ipa> [debug|dev|test|release|live] [max_mib]" >&2
  exit 2
fi

# Run cross-platform 6-gate archive inspector (Forge, Starter PCK, Bundle ID, Lockdown, Size, PrivacyInfo)
node "${SCRIPT_DIR}/verify-ipa.mjs" "${IPA_PATH}" --stage "${STAGE}" --max-mib "${MAX_MIB}"

# On macOS, additionally verify code signature & Mach-O Forge string absence
if [[ "$(uname -s)" == "Darwin" ]]; then
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "${TMP_DIR}"' EXIT
  unzip -q "${IPA_PATH}" -d "${TMP_DIR}"
  APP_DIR="$(find "${TMP_DIR}/Payload" -maxdepth 1 -name '*.app' | head -n 1)"
  if [[ -z "${APP_DIR}" ]]; then
    echo "FAIL: No .app bundle inside IPA Payload/" >&2
    exit 1
  fi
  if codesign --verify --deep --strict --verbose=2 "${APP_DIR}"; then
    echo "Signature   : PASS (codesign --verify --deep --strict)"
  else
    echo "FAIL: codesign verification failed for ${APP_DIR}" >&2
    exit 1
  fi
fi
