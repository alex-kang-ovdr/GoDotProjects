import Foundation

public struct FarmCluster: Equatable, Hashable, Codable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let baseUrl: String

    public init(id: String, label: String, baseUrl: String) {
        self.id = id
        self.label = label
        self.baseUrl = baseUrl
    }
}

public enum FarmRegistryError: Error, Equatable, LocalizedError {
    case emptyUrl
    case invalidScheme
    case missingHost
    case lockedInStage(String)

    public var errorDescription: String? {
        switch self {
        case .emptyUrl:
            return "서버 URL을 입력해 주세요."
        case .invalidScheme:
            return "http:// 또는 https:// 주소만 허용됩니다."
        case .missingHost:
            return "올바른 호스트 주소가 필요합니다."
        case let .lockedInStage(stage):
            return "'\(stage)' 빌드에서는 Farm 서버군을 변경할 수 없습니다."
        }
    }
}

/// Farm server cluster registry with compile-time & runtime fail-closed locking on release/live.
public enum FarmServerRegistry {
    public static let customFarmId = "custom"
    private static let lockedStages: Set<String> = ["release", "live"]

    /// On iOS Simulator, host loopback is directly reachable via 127.0.0.1:18130.
    public static let presetFarms: [FarmCluster] = [
        FarmCluster(id: "local", label: "Local / Simulator (127.0.0.1:18130)", baseUrl: "http://127.0.0.1:18130"),
        FarmCluster(id: "dev-farm-1", label: "Dev Farm 1", baseUrl: "https://dev-farm1.playhub.example.com"),
        FarmCluster(id: "dev-farm-2", label: "Dev Farm 2", baseUrl: "https://dev-farm2.playhub.example.com"),
        FarmCluster(id: "qa-farm", label: "QA Farm", baseUrl: "https://qa-farm.playhub.example.com"),
        FarmCluster(id: "staging-farm", label: "Staging Farm", baseUrl: "https://staging-farm.playhub.example.com")
    ]

    public static func isSelectorAllowed(buildStage: String, allowFlag: Bool) -> Bool {
        let stage = buildStage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return allowFlag && !lockedStages.contains(stage)
    }

    public static func normalizeCustomUrl(_ rawUrl: String) throws -> String {
        var trimmed = rawUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") {
            trimmed.removeLast()
        }
        guard !trimmed.isEmpty else {
            throw FarmRegistryError.emptyUrl
        }
        guard let components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else {
            throw FarmRegistryError.invalidScheme
        }
        guard let host = components.host, !host.isEmpty else {
            throw FarmRegistryError.missingHost
        }
        return trimmed
    }

    public static func resolveActiveCluster(
        buildStage: String,
        allowFlag: Bool,
        defaultBaseUrl: String,
        selectedFarmId: String?,
        customUrl: String?
    ) -> FarmCluster {
        let cleanStage = buildStage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var cleanDefault = defaultBaseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        while cleanDefault.hasSuffix("/") { cleanDefault.removeLast() }

        let fallback = FarmCluster(
            id: cleanStage,
            label: cleanStage.uppercased(),
            baseUrl: cleanDefault
        )
        guard isSelectorAllowed(buildStage: buildStage, allowFlag: allowFlag) else {
            return fallback
        }
        if selectedFarmId == customFarmId, let customUrl, !customUrl.isEmpty,
           let valid = try? normalizeCustomUrl(customUrl) {
            return FarmCluster(id: customFarmId, label: "Custom Farm", baseUrl: valid)
        }
        if let preset = presetFarms.first(where: { $0.id == selectedFarmId }) {
            return preset
        }
        return fallback
    }

    /// Deduplicated ordered list of selectable Farm clusters for UI presentation.
    public static func selectableClusters(
        buildStage: String,
        defaultBaseUrl: String,
        activeFarm: FarmCluster
    ) -> [FarmCluster] {
        var result: [FarmCluster] = []
        var seen: Set<String> = []

        func addUnique(_ cluster: FarmCluster) {
            var key = cluster.baseUrl.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            while key.hasSuffix("/") { key.removeLast() }
            if !key.isEmpty && seen.insert(key).inserted {
                result.append(cluster)
            }
        }

        addUnique(activeFarm)
        var cleanDefault = defaultBaseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        while cleanDefault.hasSuffix("/") { cleanDefault.removeLast() }
        let stage = buildStage.trimmingCharacters(in: .whitespacesAndNewlines)
        addUnique(FarmCluster(
            id: stage.lowercased(),
            label: "Default (\(stage.uppercased()))",
            baseUrl: cleanDefault
        ))
        for preset in presetFarms {
            addUnique(preset)
        }
        return result
    }
}
