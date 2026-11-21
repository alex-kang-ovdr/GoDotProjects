import Foundation

public enum PlayHubBuildStage: String, CaseIterable, Codable, Sendable {
    case debug
    case dev
    case test
    case release
    case live

    public var allowsFarmSelectorByPolicy: Bool {
        switch self {
        case .debug, .dev, .test:
            return true
        case .release, .live:
            return false
        }
    }
}

public enum BundleIdRuleError: Error, Equatable, LocalizedError {
    case liveStageTrunkOnly(branch: String)
    case invalidBundleIdentifier(String)

    public var errorDescription: String? {
        switch self {
        case let .liveStageTrunkOnly(branch):
            return "'live' build stage is restricted to official trunk ('gamedev'), got branch '\(branch)'."
        case let .invalidBundleIdentifier(id):
            return "Invalid Apple CFBundleIdentifier: '\(id)'."
        }
    }
}

/// 4-segment Apple UTI Bundle ID generator & validator:
///   com.playhub.<branch-hyphen>.<debug|dev|test|release|live>
/// Unlike Android applicationId (which uses '_'), Apple CFBundleIdentifier allows only
/// alphanumerics, '-', and '.' (underscores are forbidden by Xcode / App Store Connect).
public enum BundleIdRule {
    public static let prefix = "com.playhub"
    public static let trunkSegment = "gamedev"
    private static let trunkAliases: Set<String> = ["", "main", "master", "playhub-platform", "gamedev"]

    public static func normalizeBranchSegment(_ rawBranch: String?) -> String {
        let trimmed = (rawBranch ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if trunkAliases.contains(trimmed) {
            return trunkSegment
        }

        var result = ""
        var prevHyphen = false
        for scalar in trimmed.unicodeScalars {
            let isAsciiAlnum = (scalar.value >= 97 && scalar.value <= 122) || (scalar.value >= 48 && scalar.value <= 57)
            if isAsciiAlnum {
                result.unicodeScalars.append(scalar)
                prevHyphen = false
            } else if !prevHyphen && !result.isEmpty {
                result.append("-")
                prevHyphen = true
            }
        }
        while result.hasSuffix("-") {
            result.removeLast()
        }
        if result.isEmpty {
            return trunkSegment
        }
        if let first = result.unicodeScalars.first, first.value >= 48 && first.value <= 57 {
            result = "b-\(result)"
        }
        if result.count > 32 {
            result = String(result.prefix(32))
            while result.hasSuffix("-") {
                result.removeLast()
            }
        }
        return result.isEmpty ? trunkSegment : result
    }

    public static func build(branch: String?, stage: PlayHubBuildStage) throws -> String {
        let segment = normalizeBranchSegment(branch)
        if stage == .live && segment != trunkSegment {
            throw BundleIdRuleError.liveStageTrunkOnly(branch: branch ?? "")
        }
        let id = "\(prefix).\(segment).\(stage.rawValue)"
        guard isValid(id, expectedStage: stage) else {
            throw BundleIdRuleError.invalidBundleIdentifier(id)
        }
        return id
    }

    public static func isValid(_ bundleId: String, expectedStage: PlayHubBuildStage? = nil) -> Bool {
        if bundleId.contains("_") {
            return false
        }
        let parts = bundleId.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4, parts[0] == "com", parts[1] == "playhub" else {
            return false
        }
        let branchSeg = String(parts[2])
        let stageSeg = String(parts[3])
        guard let parsedStage = PlayHubBuildStage(rawValue: stageSeg) else {
            return false
        }
        if let expectedStage, parsedStage != expectedStage {
            return false
        }
        if parsedStage == .live && branchSeg != trunkSegment {
            return false
        }
        guard !branchSeg.isEmpty, branchSeg.count <= 32 else {
            return false
        }
        guard let first = branchSeg.unicodeScalars.first,
              first.value >= 97 && first.value <= 122,
              !branchSeg.hasSuffix("-") else {
            return false
        }
        for scalar in branchSeg.unicodeScalars {
            let valid = (scalar.value >= 97 && scalar.value <= 122)
                || (scalar.value >= 48 && scalar.value <= 57)
                || scalar.value == 45
            if !valid { return false }
        }
        return true
    }
}
