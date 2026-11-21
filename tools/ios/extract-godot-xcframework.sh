#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${IOS_DIR:-${REPO_ROOT}/ios}"
TEMPLATE_ZIP="${GODOT_IOS_TEMPLATE_ZIP:-${HOME}/Library/Application Support/Godot/export_templates/4.7.2.stable/ios.zip}"
LOCK_FILE="${SCRIPT_DIR}/godot-xcframework.lock.json"
VENDOR_DIR="${IOS_DIR}/Vendor"
XCFRAMEWORK_DIR="${VENDOR_DIR}/libgodot.ios.release.xcframework"
FORCE="${FORCE:-0}"

if [[ ! -f "${TEMPLATE_ZIP}" ]]; then
  echo "ERROR: Godot 4.7.2 iOS export template zip not found: ${TEMPLATE_ZIP}" >&2
  exit 1
fi

mkdir -p "${VENDOR_DIR}"

DEVICE_LIB="${XCFRAMEWORK_DIR}/ios-arm64/libgodot.a"
SIM_LIB="${XCFRAMEWORK_DIR}/ios-arm64_x86_64-simulator/libgodot.a"

if [[ "${FORCE}" == "1" || ! -f "${DEVICE_LIB}" || ! -f "${SIM_LIB}" ]]; then
  rm -rf "${XCFRAMEWORK_DIR}"
  unzip -q -o "${TEMPLATE_ZIP}" "libgodot.ios.release.xcframework/*" -d "${VENDOR_DIR}"
  unzip -q -o "${TEMPLATE_ZIP}" "PrivacyInfo.xcprivacy" -d "${VENDOR_DIR}" || true
  if [[ -f "${VENDOR_DIR}/PrivacyInfo.xcprivacy" ]]; then
    mv -f "${VENDOR_DIR}/PrivacyInfo.xcprivacy" "${VENDOR_DIR}/GodotPrivacyInfo.xcprivacy"
  fi
fi

DEVICE_SHA="$(shasum -a 256 "${DEVICE_LIB}" | awk '{print $1}')"
SIM_SHA="$(shasum -a 256 "${SIM_LIB}" | awk '{print $1}')"

if [[ -f "${LOCK_FILE}" ]]; then
  node -e '
    const fs = require("fs");
    const lock = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const dev = process.argv[2].toLowerCase();
    const sim = process.argv[3].toLowerCase();
    if (lock.slices?.iosArm64?.sha256 && lock.slices.iosArm64.sha256.toLowerCase() !== dev) {
      console.error(`ios-arm64/libgodot.a SHA-256 mismatch: expected ${lock.slices.iosArm64.sha256}, got ${dev}`);
      process.exit(1);
    }
    if (lock.slices?.iosSimulator?.sha256 && lock.slices.iosSimulator.sha256.toLowerCase() !== sim) {
      console.error(`ios-simulator/libgodot.a SHA-256 mismatch: expected ${lock.slices.iosSimulator.sha256}, got ${sim}`);
      process.exit(1);
    }
  ' "${LOCK_FILE}" "${DEVICE_SHA}" "${SIM_SHA}"
fi

echo "OK: libgodot.ios.release.xcframework verified (arm64=${DEVICE_SHA:0:16}..., sim=${SIM_SHA:0:16}...)"
