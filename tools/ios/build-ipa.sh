#!/usr/bin/env bash
set -euo pipefail

# Play Hub iOS IPA automated build script (macOS host / GitHub Actions macos runner).
# Usage:
#   ./tools/ios/build-ipa.sh [debug|dev|test|release|live] [--branch <override>] [--hub-url <url>] [--skip-tests]

STAGE="${1:-debug}"
shift || true

PACKAGE_BRANCH=""
HUB_BASE_URL=""
SKIP_TESTS="0"
EXPORT_METHOD="${EXPORT_METHOD:-development}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) PACKAGE_BRANCH="$2"; shift 2 ;;
    --hub-url) HUB_BASE_URL="$2"; shift 2 ;;
    --export-method) EXPORT_METHOD="$2"; shift 2 ;;
    --skip-tests) SKIP_TESTS="1"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${REPO_ROOT}/ios"
BUILD_DIR="${IOS_DIR}/build/${STAGE}"

if [[ -z "${PACKAGE_BRANCH}" ]]; then
  PACKAGE_BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'gamedev')"
fi

# Resolve 4-segment Apple UTI Bundle ID + enforce live trunk-only guard
BUNDLE_ID="$(node -e '
  import("./tools/ios/verify-ipa.mjs").then(m => {
    console.log(m.expectedBundleId(process.argv[1], process.argv[2]));
  }).catch(err => { console.error(err.message); process.exit(1); });
' "${PACKAGE_BRANCH}" "${STAGE}")"

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
