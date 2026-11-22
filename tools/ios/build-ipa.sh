#!/usr/bin/env bash
set -euo pipefail

# Play Hub iOS IPA automated build script (macOS host / GitHub Actions macos runner).
# Usage:
#   ./tools/ios/build-ipa.sh [debug|dev|test|release|live] [--branch <override>] [--team <TEAM_ID>] [--hub-url <url>] [--skip-tests]

STAGE="${1:-debug}"
shift || true

PACKAGE_BRANCH=""
TEAM_ID=""
HUB_BASE_URL=""
SKIP_TESTS="0"
EXPORT_METHOD="${EXPORT_METHOD:-development}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) [[ $# -ge 2 ]] || { echo "ERROR: --branch requires a value" >&2; exit 2; }; PACKAGE_BRANCH="$2"; shift 2 ;;
    --team) [[ $# -ge 2 ]] || { echo "ERROR: --team requires a value" >&2; exit 2; }; TEAM_ID="$2"; shift 2 ;;
    --hub-url) [[ $# -ge 2 ]] || { echo "ERROR: --hub-url requires a value" >&2; exit 2; }; HUB_BASE_URL="$2"; shift 2 ;;
    --export-method) [[ $# -ge 2 ]] || { echo "ERROR: --export-method requires a value" >&2; exit 2; }; EXPORT_METHOD="$2"; shift 2 ;;
    --skip-tests) SKIP_TESTS="1"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${REPO_ROOT}/ios"
BUILD_DIR="${IOS_DIR}/build/${STAGE}"

if [[ -n "${TEAM_ID}" ]]; then
  if [[ "${TEAM_ID}" == *$'\n'* || "${TEAM_ID}" == *$'\r'* ]] || ! LC_ALL=C grep -Eq '^[A-Z0-9]{10}$' <<<"${TEAM_ID}"; then
    echo "ERROR: Invalid --team '${TEAM_ID}': must match ^[A-Z0-9]{10}$" >&2
    exit 2
  fi
  TEAM_ID="$(node -e '
    const { pathToFileURL } = require("node:url");
    import(pathToFileURL(process.argv[1]).href).then(m => {
      console.log(m.validateTeamId(process.argv[2]));
    }).catch(err => { console.error(err.message); process.exit(1); });
  ' "${REPO_ROOT}/tools/ios/verify-ipa.mjs" "${TEAM_ID}")" || exit 2
fi

if [[ -n "${HUB_BASE_URL}" ]]; then
  if [[ "${HUB_BASE_URL}" == *$'\n'* || "${HUB_BASE_URL}" == *$'\r'* ]]; then
    echo "ERROR: Invalid --hub-url: multiline values are forbidden" >&2
    exit 2
  fi
  HUB_BASE_URL="$(node -e '
    const { pathToFileURL } = require("node:url");
    import(pathToFileURL(process.argv[1]).href).then(m => {
      console.log(m.validateHubUrl(process.argv[2]));
    }).catch(err => { console.error(err.message); process.exit(1); });
  ' "${REPO_ROOT}/tools/ios/verify-ipa.mjs" "${HUB_BASE_URL}")" || exit 2
fi

if [[ -z "${PACKAGE_BRANCH}" ]]; then
  PACKAGE_BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'gamedev')"
fi

# Resolve 4-segment Apple UTI Bundle ID + enforce live trunk-only guard
BUNDLE_ID="$(node -e '
  const { pathToFileURL } = require("node:url");
  import(pathToFileURL(process.argv[1]).href).then(m => {
    console.log(m.expectedBundleId(process.argv[2], process.argv[3]));
  }).catch(err => { console.error(err.message); process.exit(1); });
' "${REPO_ROOT}/tools/ios/verify-ipa.mjs" "${PACKAGE_BRANCH}" "${STAGE}")"

echo "=== Play Hub iOS Build ==="
echo "Stage      : ${STAGE}"
echo "Branch     : ${PACKAGE_BRANCH}"
echo "Bundle ID  : ${BUNDLE_ID}"

# 1. Extract and verify locked Godot 4.7.2 XCFramework (excluding MoltenVK/camera/debug)
"${SCRIPT_DIR}/extract-godot-xcframework.sh"

# 2. Run pure Swift PlayHubCore unit tests
if [[ "${SKIP_TESTS}" != "1" ]]; then
  echo "Running PlayHubCore Swift tests..."
  (cd "${IOS_DIR}/Packages/PlayHubCore" && swift test)
fi

# 3. Generate Xcode project via XcodeGen
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "ERROR: xcodegen is required on macOS (brew install xcodegen)" >&2
  exit 1
fi
(cd "${IOS_DIR}" && xcodegen generate --spec project.yml)

# 4. Map stage -> Xcode build configuration
case "${STAGE}" in
  debug)   XCODE_CFG="Debug" ;;
  dev)     XCODE_CFG="Dev" ;;
  test)    XCODE_CFG="Test" ;;
  release) XCODE_CFG="Release" ;;
  live)    XCODE_CFG="Live" ;;
  *) echo "Unsupported stage: ${STAGE}" >&2; exit 2 ;;
esac

mkdir -p "${BUILD_DIR}"
ARCHIVE_PATH="${BUILD_DIR}/PlayHub-${STAGE}.xcarchive"
EXPORT_DIR="${BUILD_DIR}/export"

EXTRA_ARGS=(
  "PRODUCT_BUNDLE_IDENTIFIER=${BUNDLE_ID}"
  "PLAYHUB_BUILD_STAGE=${STAGE}"
)
if [[ -n "${TEAM_ID}" ]]; then
  EXTRA_ARGS+=("DEVELOPMENT_TEAM=${TEAM_ID}")
fi
if [[ -n "${HUB_BASE_URL}" ]]; then
  EXTRA_ARGS+=("PLAYHUB_DEFAULT_HUB_URL=${HUB_BASE_URL}")
fi

echo "Archiving ${XCODE_CFG} (${BUNDLE_ID})..."
xcodebuild archive \
  -project "${IOS_DIR}/PlayHub.xcodeproj" \
  -scheme "PlayHubApp" \
  -configuration "${XCODE_CFG}" \
  -destination "generic/platform=iOS" \
  -archivePath "${ARCHIVE_PATH}" \
  "${EXTRA_ARGS[@]}"

cat > "${BUILD_DIR}/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${EXPORT_METHOD}</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>
EOF

xcodebuild -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportOptionsPlist "${BUILD_DIR}/ExportOptions.plist" \
  -exportPath "${EXPORT_DIR}"

IPA_FILE="$(find "${EXPORT_DIR}" -maxdepth 1 -name '*.ipa' | head -n 1)"
if [[ -z "${IPA_FILE}" ]]; then
  echo "ERROR: Exported .ipa not found in ${EXPORT_DIR}" >&2
  exit 1
fi

# 5. Run 6 automatic quality & security gates
"${SCRIPT_DIR}/verify-ipa.sh" "${IPA_FILE}" "${STAGE}"
echo "SUCCESS: ${IPA_FILE}"
