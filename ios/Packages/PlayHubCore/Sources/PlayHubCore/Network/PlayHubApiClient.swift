import Foundation

public struct MobileAuthResponse: Codable, Equatable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresInSec: Int
    public let profile: MobileProfile
}

public struct MobileAgeCompliance: Codable, Equatable, Sendable {
    public let completed: Bool
    public let regionCode: String
    public let ageTier: String
    public let parentalConsentStatus: String
}

public struct MobileProfile: Codable, Equatable, Sendable {
    public let principalId: String
    public let kind: String
    public let isGuest: Bool
    public let displayName: String
    public let handle: String
    public let ageCompliance: MobileAgeCompliance
}

public struct MobileCatalogGameCompatibility: Codable, Equatable, Sendable {
    public let compatible: Bool
    public let reason: String?
    public let message: String?
}

public struct MobileCatalogGame: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let description: String?
    public let genre: String?
    public let runtime: String
    public let ageRating: String
    public let allowed: Bool
    public let compatibility: MobileCatalogGameCompatibility?
    public let entryUrl: String?
    public let coverUrl: String?
}

public struct MobileCatalogResponse: Codable, Equatable, Sendable {
    public let forgeSupported: Bool
    public let engineVersion: String
    public let games: [MobileCatalogGame]
}

public enum PlayHubApiError: Error, LocalizedError {
    case invalidBaseUrl(String)
    case httpError(statusCode: Int, body: String)

    public var errorDescription: String? {
        switch self {
        case let .invalidBaseUrl(url):
            return "Invalid PlayHub base URL: \(url)"
        case let .httpError(code, body):
            return "HTTP \(code): \(body)"
        }
    }
}

/// Zero-dependency URLSession client for PlayHub Mobile API (/api/mobile/*, /api/iap/apple/*).
public struct PlayHubApiClient: Sendable {
    public let baseUrl: String
    public let engineVersion: String
    public let appBuildNumber: Int
    private let session: URLSession

    public init(
        baseUrl: String,
        engineVersion: String = "4.7.2",
        appBuildNumber: Int = 1,
        session: URLSession = .shared
    ) {
        var clean = baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        while clean.hasSuffix("/") { clean.removeLast() }
        self.baseUrl = clean
        self.engineVersion = engineVersion
        self.appBuildNumber = appBuildNumber
        self.session = session
    }

    public func loginGuest() async throws -> MobileAuthResponse {
        try await request(path: "/api/mobile/auth/guest", method: "POST", body: [:])
    }

    public func loginApple(
        identityToken: String,
        authorizationCode: String,
        nonce: String,
        displayName: String?,
        accessToken: String? = nil
    ) async throws -> MobileAuthResponse {
        var payload: [String: Any] = [
            "identityToken": identityToken,
            "authorizationCode": authorizationCode,
            "nonce": nonce
        ]
        if let displayName, !displayName.isEmpty {
            payload["displayName"] = displayName
        }
        return try await request(path: "/api/mobile/auth/apple", method: "POST", body: payload, accessToken: accessToken)
    }

    public func submitAgeGate(
        birthYear: Int,
        birthMonth: Int,
        regionCode: String,
        accessToken: String
    ) async throws -> MobileProfile {
        try await request(
            path: "/api/mobile/age-gate",
            method: "POST",
            body: [
                "birthYear": birthYear,
                "birthMonth": birthMonth,
                "regionCode": regionCode
            ],
            accessToken: accessToken
        )
    }

    public func fetchCatalog(accessToken: String?) async throws -> MobileCatalogResponse {
        try await request(path: "/api/mobile/catalog", method: "GET", body: nil, accessToken: accessToken)
    }

    public func deleteAccount(accessToken: String) async throws {
        struct Ack: Codable { let ok: Bool }
        let _: Ack = try await request(path: "/api/mobile/account", method: "DELETE", body: nil, accessToken: accessToken)
    }

    private func request<T: Decodable>(
        path: String,
        method: String,
        body: [String: Any]?,
        accessToken: String? = nil
    ) async throws -> T {
        guard let url = URL(string: "\(baseUrl)\(path)") else {
            throw PlayHubApiError.invalidBaseUrl(baseUrl)
        }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("ios", forHTTPHeaderField: "X-PlayHub-Platform")
        req.setValue(engineVersion, forHTTPHeaderField: "X-PlayHub-Engine-Version")
        req.setValue(String(appBuildNumber), forHTTPHeaderField: "X-PlayHub-App-Version-Code")
        if let accessToken, !accessToken.isEmpty {
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw PlayHubApiError.httpError(statusCode: 0, body: "Non-HTTP response")
        }
        guard (200...299).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw PlayHubApiError.httpError(statusCode: http.statusCode, body: text)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
