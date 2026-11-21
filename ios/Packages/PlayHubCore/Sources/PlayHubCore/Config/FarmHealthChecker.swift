import Foundation

public enum FarmHealthStatus: String, Equatable, Codable, Sendable {
    case checking
    case green
    case yellow
    case orange
    case red

    public var shortTag: String {
        switch self {
        case .checking: return "..."
        case .green: return "GREEN"
        case .yellow: return "YELLOW"
        case .orange: return "ORANGE"
        case .red: return "RED"
        }
    }

    public var labelKo: String {
        switch self {
        case .checking: return "측정 중"
        case .green: return "원활"
        case .yellow: return "보통"
        case .orange: return "지연"
        case .red: return "접속 불가"
        }
    }

    public var colorHex: String {
        switch self {
        case .checking: return "#64748B"
        case .green: return "#22C55E"
        case .yellow: return "#EAB308"
        case .orange: return "#F97316"
        case .red: return "#EF4444"
        }
    }
}

public struct FarmHealthResult: Equatable, Codable, Sendable {
    public let status: FarmHealthStatus
    public let latencyMs: Int?
    public let httpCode: Int?
    public let errorMessage: String?

    public init(status: FarmHealthStatus, latencyMs: Int? = nil, httpCode: Int? = nil, errorMessage: String? = nil) {
        self.status = status
        self.latencyMs = latencyMs
        self.httpCode = httpCode
        self.errorMessage = errorMessage
    }

    public func badgeLabel() -> String {
        switch status {
        case .checking:
            return "측정 중..."
        case .red:
            if let httpCode {
                return "RED · HTTP \(httpCode)"
            }
            return "RED · 접속 불가"
        case .green, .yellow, .orange:
            return "\(status.shortTag) · \(latencyMs ?? 0)ms"
        }
    }

    public func compactPillText() -> String {
        switch status {
        case .checking: return "..."
        case .red: return "접속불가"
        case .green, .yellow, .orange: return "\(latencyMs ?? 0)ms"
        }
    }
}

/// Probes Farm server cluster reachability & RTT latency via GET /api/health.
/// Mirrors Hub-AOS thresholds 1:1:
/// - GREEN  (< 200ms)
/// - YELLOW (200..599ms)
/// - ORANGE (>= 600ms)
/// - RED    (unreachable / timeout / non-2xx)
public enum FarmHealthChecker {
    public static let greenThresholdMs = 200
    public static let yellowThresholdMs = 600
    public static let defaultTimeoutSeconds: TimeInterval = 2.5

    public static func classify(reachable: Bool, latencyMs: Int?) -> FarmHealthStatus {
        guard reachable, let latencyMs, latencyMs >= 0 else {
            return .red
        }
        if latencyMs < greenThresholdMs {
            return .green
        }
        if latencyMs < yellowThresholdMs {
            return .yellow
        }
        return .orange
    }

    public static func probe(
        baseUrl: String,
        timeout: TimeInterval = defaultTimeoutSeconds,
        session: URLSession = .shared
    ) async -> FarmHealthResult {
        var clean = baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        while clean.hasSuffix("/") { clean.removeLast() }
        guard !clean.isEmpty, let url = URL(string: "\(clean)/api/health") else {
            return FarmHealthResult(status: .red, errorMessage: "Invalid URL")
        }

        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: timeout)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

        let start = Date()
        do {
            let (_, response) = try await session.data(for: request)
            let elapsedMs = max(0, Int(Date().timeIntervalSince(start) * 1000.0))
            guard let http = response as? HTTPURLResponse else {
                return FarmHealthResult(status: .red, errorMessage: "Non-HTTP response")
            }
            if (200...299).contains(http.statusCode) {
                return FarmHealthResult(
                    status: classify(reachable: true, latencyMs: elapsedMs),
                    latencyMs: elapsedMs,
                    httpCode: http.statusCode
                )
            }
            return FarmHealthResult(status: .red, httpCode: http.statusCode, errorMessage: "HTTP \(http.statusCode)")
        } catch {
            return FarmHealthResult(status: .red, errorMessage: error.localizedDescription)
        }
    }

    public static func probeAll(
        clusters: [FarmCluster],
        timeout: TimeInterval = defaultTimeoutSeconds,
        session: URLSession = .shared
    ) async -> [String: FarmHealthResult] {
        await withTaskGroup(of: (String, FarmHealthResult).self) { group in
            for cluster in clusters {
                group.addTask {
                    let result = await probe(baseUrl: cluster.baseUrl, timeout: timeout, session: session)
                    return (cluster.id, result)
                }
            }
            var map: [String: FarmHealthResult] = [:]
            for await (id, result) in group {
                map[id] = result
            }
            return map
        }
    }
}
