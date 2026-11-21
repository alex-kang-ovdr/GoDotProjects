import Foundation

public struct SemVer: Equatable, Comparable, Codable, Sendable {
    public let major: Int
    public let minor: Int
    public let patch: Int

    public init(major: Int, minor: Int, patch: Int = 0) {
        self.major = major
        self.minor = minor
        self.patch = patch
    }

    public static func < (lhs: SemVer, rhs: SemVer) -> Bool {
        if lhs.major != rhs.major { return lhs.major < rhs.major }
        if lhs.minor != rhs.minor { return lhs.minor < rhs.minor }
        return lhs.patch < rhs.patch
    }

    public static func parse(_ raw: String?) -> SemVer? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let parts = trimmed.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count >= 2,
              let maj = Int(parts[0].prefix(while: { $0.isNumber })),
              let min = Int(parts[1].prefix(while: { $0.isNumber })) else {
            return nil
        }
        let pat: Int
        if parts.count >= 3, let parsed = Int(parts[2].prefix(while: { $0.isNumber })) {
            pat = parsed
        } else {
            pat = 0
        }
        return SemVer(major: maj, minor: min, patch: pat)
    }
}

public enum CompatibilityReason: String, Equatable, Codable, Sendable {
    case ok = "OK"
    case appUpdateRequired = "APP_UPDATE_REQUIRED"
    case engineMajorMismatch = "ENGINE_MAJOR_MISMATCH"
    case engineUpdateRequired = "ENGINE_UPDATE_REQUIRED"
}

public struct VersionCompatibilityResult: Equatable, Codable, Sendable {
    public let compatible: Bool
    public let reason: CompatibilityReason
    public let badgeText: String?
    public let detailMessage: String?

    public init(compatible: Bool, reason: CompatibilityReason, badgeText: String? = nil, detailMessage: String? = nil) {
        self.compatible = compatible
        self.reason = reason
        self.badgeText = badgeText
        self.detailMessage = detailMessage
    }
}

/// Pre-entry version compatibility gate evaluated BEFORE downloading or launching a game.
public enum VersionCompatibilityChecker {
    public static func evaluate(
        runtime: String,
        requiredEngineVersion: String?,
        minAppBuildNumber: Int,
        installedEngineVersion: String,
        installedAppBuildNumber: Int
    ) -> VersionCompatibilityResult {
        if minAppBuildNumber > installedAppBuildNumber {
            return VersionCompatibilityResult(
                compatible: false,
                reason: .appUpdateRequired,
                badgeText: "⚠️ 앱 업데이트 필요 (빌드 \(minAppBuildNumber)+)",
                detailMessage: "이 게임은 Play Hub 앱 빌드 \(minAppBuildNumber) 이상이 필요합니다.\n(현재 설치 빌드: \(installedAppBuildNumber))\nApp Store 또는 TestFlight에서 앱을 최신 버전으로 업데이트해 주세요."
            )
        }

        if runtime == "godot-pck",
           let requiredEngineVersion, !requiredEngineVersion.isEmpty,
           let req = SemVer.parse(requiredEngineVersion),
           let cur = SemVer.parse(installedEngineVersion) {
            if req.major != cur.major {
                return VersionCompatibilityResult(
                    compatible: false,
                    reason: .engineMajorMismatch,
                    badgeText: "⚠️ 엔진 비호환 (Godot \(requiredEngineVersion))",
                    detailMessage: "이 게임은 Godot \(requiredEngineVersion) 엔진용으로 빌드되어 현재 내장 엔진(Godot \(installedEngineVersion))과 호환되지 않습니다."
                )
            }
            if req > cur {
                return VersionCompatibilityResult(
                    compatible: false,
                    reason: .engineUpdateRequired,
                    badgeText: "⚠️ 엔진 업데이트 필요 (Godot \(requiredEngineVersion))",
                    detailMessage: "이 게임은 Godot \(requiredEngineVersion) 이상이 필요합니다.\n(현재 앱 내장 엔진: Godot \(installedEngineVersion))\nPlay Hub 앱을 업데이트하면 플레이할 수 있습니다."
                )
            }
        }

        return VersionCompatibilityResult(compatible: true, reason: .ok)
    }
}
