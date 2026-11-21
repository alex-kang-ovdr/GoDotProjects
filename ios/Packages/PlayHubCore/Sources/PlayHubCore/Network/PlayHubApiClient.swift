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

public struct MobileCatalogGameMultiplayer: Codable, Equatable, Sendable {
    public let transport: String
    public let wsPath: String
    public let gameId: String

    public init(transport: String, wsPath: String, gameId: String) {
        self.transport = transport
        self.wsPath = wsPath
        self.gameId = gameId
    }
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
    public let source: String?
    public let deployMode: String?
    public let multiplayer: MobileCatalogGameMultiplayer?

    public init(
        id: String,
        title: String,
        description: String? = nil,
        genre: String? = nil,
        runtime: String,
        ageRating: String,
        allowed: Bool,
        compatibility: MobileCatalogGameCompatibility? = nil,
        entryUrl: String? = nil,
        coverUrl: String? = nil,
        source: String? = nil,
        deployMode: String? = nil,
        multiplayer: MobileCatalogGameMultiplayer? = nil
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.genre = genre
        self.runtime = runtime
        self.ageRating = ageRating
        self.allowed = allowed
        self.compatibility = compatibility
        self.entryUrl = entryUrl
        self.coverUrl = coverUrl
        self.source = source
        self.deployMode = deployMode
        self.multiplayer = multiplayer
    }
}

public struct MobileCatalogResponse: Codable, Equatable, Sendable {
    public let forgeSupported: Bool
    public let engineVersion: String
    public let games: [MobileCatalogGame]
}

// MARK: - M3 Social DTOs

public struct SocialPresence: Codable, Equatable, Sendable {
    public let status: String
    public let online: Bool
    public let gameId: String?
    public let gameTitle: String?
    public let roomCode: String?
    public let joinable: Bool
}

public struct SocialProfile: Codable, Equatable, Sendable {
    public let principalId: String
    public let displayName: String
    public let handle: String
    public let avatarColor: String
    public let bio: String
    public let privacyLevel: String
    public let presence: SocialPresence?
    public let ageCompliance: MobileAgeCompliance?
}

public struct SocialUserHit: Codable, Equatable, Identifiable, Sendable {
    public let principalId: String
    public let displayName: String
    public let handle: String
    public let avatarColor: String
    public let relation: String
    public var id: String { principalId }
}

public struct SocialSearchResponse: Codable, Equatable, Sendable {
    public let users: [SocialUserHit]
}

public struct SocialLastMessage: Codable, Equatable, Sendable {
    public let body: String
    public let senderId: String
    public let createdAt: String
}

public struct SocialFriend: Codable, Equatable, Identifiable, Sendable {
    public let principalId: String
    public let displayName: String
    public let handle: String
    public let avatarColor: String
    public let presence: SocialPresence
    public let lastMessage: SocialLastMessage?
    public var id: String { principalId }
}

public struct SocialFriendRequest: Codable, Equatable, Identifiable, Sendable {
    public let principalId: String
    public let displayName: String
    public let handle: String
    public let avatarColor: String
    public let createdAt: String
    public var id: String { principalId }
}

public struct SocialFriendsResponse: Codable, Equatable, Sendable {
    public let friends: [SocialFriend]
    public let incomingRequests: [SocialFriendRequest]
    public let outgoingRequests: [SocialFriendRequest]
}

public struct SocialFriendRequestResult: Codable, Equatable, Sendable {
    public let targetPrincipalId: String
    public let status: String
}

public struct SocialFriendRespondResult: Codable, Equatable, Sendable {
    public let requesterId: String
    public let status: String
}

public struct SocialPartyMember: Codable, Equatable, Identifiable, Sendable {
    public let principalId: String
    public let displayName: String
    public let handle: String
    public let avatarColor: String
    public let role: String
    public let ready: Bool
    public let presence: SocialPresence?
    public var id: String { principalId }
}

public struct SocialLaunchParticipant: Codable, Equatable, Identifiable, Sendable {
    public let principalId: String
    public let displayName: String
    public let handle: String
    public let platform: String
    public let state: String
    public var id: String { principalId }
}

public struct SocialPartyLaunch: Codable, Equatable, Sendable {
    public let launchId: String
    public let gameId: String
    public let roomCode: String
    public let matchRoomId: String
    public let launchedBy: String
    public let status: String
    public let createdAt: String
    public let participants: [SocialLaunchParticipant]
}

public struct SocialParty: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let leaderId: String
    public let title: String
    public let targetGameId: String?
    public let roomCode: String
    public let maxMembers: Int
    public let inviteUrl: String?
    public let deepLinkUrl: String?
    public let members: [SocialPartyMember]
    public let activeLaunch: SocialPartyLaunch?
}

public struct SocialPartyLaunchResponse: Codable, Equatable, Sendable {
    public let launch: SocialPartyLaunch?
    public let party: SocialParty?
}

public struct SocialPartyResponse: Codable, Equatable, Sendable {
    public let party: SocialParty?
}

public struct SocialMessage: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let channelType: String
    public let senderId: String
    public let senderName: String
    public let senderHandle: String?
    public let senderAvatarColor: String?
    public let senderMe: Bool
    public let body: String
    public let isQuickMessage: Bool
    public let createdAt: String
}

public struct SocialMessagesResponse: Codable, Equatable, Sendable {
    public let channelType: String
    public let messages: [SocialMessage]
}

public struct SocialQuickMessage: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let text: String
}

public struct SocialQuickMessagesResponse: Codable, Equatable, Sendable {
    public let quickMessages: [SocialQuickMessage]
}

public struct SocialLeaderboardEntry: Codable, Equatable, Identifiable, Sendable {
    public let rank: Int
    public let principalId: String
    public let displayName: String
    public let handle: String
    public let avatarColor: String
    public let score: Int
    public let isMe: Bool
    public var id: String { "\(rank)-\(principalId)" }
}

public struct SocialLeaderboardResponse: Codable, Equatable, Sendable {
    public let gameId: String
    public let boardId: String
    public let scope: String
    public let periodKey: String
    public let entries: [SocialLeaderboardEntry]
}

public struct SocialScoreSubmitResponse: Codable, Equatable, Sendable {
    public let gameId: String
    public let boardId: String
    public let periodKey: String
    public let bestScore: Int
}

public struct SocialReportResponse: Codable, Equatable, Sendable {
    public let id: String
    public let targetType: String
    public let targetId: String
    public let status: String
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

    public func refreshSession(refreshToken: String) async throws -> MobileAuthResponse {
        try await request(path: "/api/mobile/auth/refresh", method: "POST", body: ["refreshToken": refreshToken])
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

    // MARK: - M3 Social API (/api/mobile/social/*)

    public func fetchQuickMessages() async throws -> [SocialQuickMessage] {
        let res: SocialQuickMessagesResponse = try await request(
            path: "/api/mobile/social/quick-messages",
            method: "GET",
            body: nil
        )
        return res.quickMessages
    }

    public func fetchSocialProfile(accessToken: String) async throws -> SocialProfile {
        try await request(path: "/api/mobile/social/profile", method: "GET", body: nil, accessToken: accessToken)
    }

    public func updateSocialProfile(
        displayName: String? = nil,
        handle: String? = nil,
        avatarColor: String? = nil,
        bio: String? = nil,
        accessToken: String
    ) async throws -> SocialProfile {
        var body: [String: Any] = [:]
        if let displayName { body["displayName"] = displayName }
        if let handle { body["handle"] = handle }
        if let avatarColor { body["avatarColor"] = avatarColor }
        if let bio { body["bio"] = bio }
        return try await request(path: "/api/mobile/social/profile", method: "PUT", body: body, accessToken: accessToken)
    }

    public func searchSocialUsers(query: String, accessToken: String) async throws -> [SocialUserHit] {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let res: SocialSearchResponse = try await request(
            path: "/api/mobile/social/users/search?q=\(encoded)",
            method: "GET",
            body: nil,
            accessToken: accessToken
        )
        return res.users
    }

    public func fetchSocialFriends(accessToken: String) async throws -> SocialFriendsResponse {
        try await request(path: "/api/mobile/social/friends", method: "GET", body: nil, accessToken: accessToken)
    }

    public func sendFriendRequest(
        targetPrincipalId: String? = nil,
        handle: String? = nil,
        accessToken: String
    ) async throws -> SocialFriendRequestResult {
        var body: [String: Any] = [:]
        if let targetPrincipalId { body["targetPrincipalId"] = targetPrincipalId }
        if let handle { body["targetHandle"] = handle }
        return try await request(
            path: "/api/mobile/social/friends/request",
            method: "POST",
            body: body,
            accessToken: accessToken
        )
    }

    public func respondFriendRequest(
        requesterId: String,
        action: String,
        accessToken: String
    ) async throws -> SocialFriendRespondResult {
        try await request(
            path: "/api/mobile/social/friends/respond",
            method: "POST",
            body: ["requesterId": requesterId, "action": action],
            accessToken: accessToken
        )
    }

    public func removeFriend(targetPrincipalId: String, accessToken: String) async throws {
        struct Ack: Codable { let removed: Bool }
        let encoded = targetPrincipalId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? targetPrincipalId
        let _: Ack = try await request(
            path: "/api/mobile/social/friends/\(encoded)",
            method: "DELETE",
            body: nil,
            accessToken: accessToken
        )
    }

    public func blockUser(targetPrincipalId: String, accessToken: String) async throws {
        struct Ack: Codable { let blocked: Bool }
        let _: Ack = try await request(
            path: "/api/mobile/social/blocks",
            method: "POST",
            body: ["targetPrincipalId": targetPrincipalId],
            accessToken: accessToken
        )
    }

    public func reportSocialTarget(
        targetType: String,
        targetId: String,
        reason: String,
        accessToken: String
    ) async throws -> SocialReportResponse {
        try await request(
            path: "/api/mobile/social/reports",
            method: "POST",
            body: ["targetType": targetType, "targetId": targetId, "reason": reason],
            accessToken: accessToken
        )
    }

    public func updatePresence(
        status: String,
        gameId: String? = nil,
        gameTitle: String? = nil,
        roomCode: String? = nil,
        joinable: Bool = true,
        accessToken: String
    ) async throws -> SocialPresence {
        var body: [String: Any] = ["status": status, "joinable": joinable]
        if let gameId { body["gameId"] = gameId }
        if let gameTitle { body["gameTitle"] = gameTitle }
        if let roomCode { body["roomCode"] = roomCode }
        return try await request(path: "/api/mobile/social/presence", method: "POST", body: body, accessToken: accessToken)
    }

    public func fetchSocialMessages(
        channelType: String,
        peerId: String? = nil,
        partyId: String? = nil,
        limit: Int = 50,
        accessToken: String
    ) async throws -> [SocialMessage] {
        var qs = "channelType=\(channelType)&limit=\(limit)"
        if let peerId {
            let enc = peerId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? peerId
            qs += "&peerId=\(enc)"
        }
        if let partyId {
            let enc = partyId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? partyId
            qs += "&partyId=\(enc)"
        }
        let res: SocialMessagesResponse = try await request(
            path: "/api/mobile/social/messages?\(qs)",
            method: "GET",
            body: nil,
            accessToken: accessToken
        )
        return res.messages
    }

    public func sendSocialMessage(
        channelType: String,
        peerId: String? = nil,
        partyId: String? = nil,
        bodyText: String? = nil,
        quickMessageId: String? = nil,
        accessToken: String
    ) async throws -> SocialMessage {
        var payload: [String: Any] = ["channelType": channelType]
        if let peerId { payload["peerId"] = peerId }
        if let partyId { payload["partyId"] = partyId }
        if let bodyText { payload["body"] = bodyText }
        if let quickMessageId { payload["quickMessageId"] = quickMessageId }
        return try await request(
            path: "/api/mobile/social/messages",
            method: "POST",
            body: payload,
            accessToken: accessToken
        )
    }

    public func fetchMyParty(accessToken: String) async throws -> SocialParty? {
        let res: SocialPartyResponse = try await request(
            path: "/api/mobile/social/parties/me",
            method: "GET",
            body: nil,
            accessToken: accessToken
        )
        return res.party
    }

    public func createParty(
        title: String? = nil,
        targetGameId: String? = nil,
        maxMembers: Int = 8,
        accessToken: String
    ) async throws -> SocialParty {
        var payload: [String: Any] = ["maxMembers": maxMembers]
        if let title, !title.isEmpty { payload["title"] = title }
        if let targetGameId, !targetGameId.isEmpty { payload["targetGameId"] = targetGameId }
        let res: SocialPartyResponse = try await request(
            path: "/api/mobile/social/parties",
            method: "POST",
            body: payload,
            accessToken: accessToken
        )
        guard let party = res.party else {
            throw PlayHubApiError.httpError(statusCode: 500, body: "Missing party payload")
        }
        return party
    }

    public func joinParty(roomCode: String, accessToken: String) async throws -> SocialParty {
        let res: SocialPartyResponse = try await request(
            path: "/api/mobile/social/parties/join",
            method: "POST",
            body: ["roomCode": roomCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()],
            accessToken: accessToken
        )
        guard let party = res.party else {
            throw PlayHubApiError.httpError(statusCode: 500, body: "Missing party payload")
        }
        return party
    }

    public func setPartyReady(partyId: String, ready: Bool, accessToken: String) async throws -> SocialParty {
        let enc = partyId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? partyId
        let res: SocialPartyResponse = try await request(
            path: "/api/mobile/social/parties/\(enc)/ready",
            method: "POST",
            body: ["ready": ready],
            accessToken: accessToken
        )
        guard let party = res.party else {
            throw PlayHubApiError.httpError(statusCode: 500, body: "Missing party payload")
        }
        return party
    }

    public func updatePartyGame(partyId: String, targetGameId: String?, accessToken: String) async throws -> SocialParty {
        let enc = partyId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? partyId
        var payload: [String: Any] = [:]
        if let targetGameId { payload["targetGameId"] = targetGameId }
        let res: SocialPartyResponse = try await request(
            path: "/api/mobile/social/parties/\(enc)/game",
            method: "POST",
            body: payload,
            accessToken: accessToken
        )
        guard let party = res.party else {
            throw PlayHubApiError.httpError(statusCode: 500, body: "Missing party payload")
        }
        return party
    }

    public func leaveParty(partyId: String, accessToken: String) async throws {
        struct Ack: Codable { let left: Bool }
        let enc = partyId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? partyId
        let _: Ack = try await request(
            path: "/api/mobile/social/parties/\(enc)/leave",
            method: "POST",
            body: [:],
            accessToken: accessToken
        )
    }

    public func launchParty(
        partyId: String,
        gameId: String,
        gameTitle: String? = nil,
        accessToken: String
    ) async throws -> SocialPartyLaunchResponse {
        let enc = partyId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? partyId
        var payload: [String: Any] = ["gameId": gameId, "platform": "ios"]
        if let gameTitle, !gameTitle.isEmpty { payload["gameTitle"] = gameTitle }
        return try await request(
            path: "/api/mobile/social/parties/\(enc)/launch",
            method: "POST",
            body: payload,
            accessToken: accessToken
        )
    }

    public func ackPartyLaunch(
        partyId: String,
        launchId: String,
        state: String = "entered",
        gameTitle: String? = nil,
        accessToken: String
    ) async throws -> SocialPartyLaunchResponse {
        let enc = partyId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? partyId
        var payload: [String: Any] = ["launchId": launchId, "state": state, "platform": "ios"]
        if let gameTitle, !gameTitle.isEmpty { payload["gameTitle"] = gameTitle }
        return try await request(
            path: "/api/mobile/social/parties/\(enc)/launch/ack",
            method: "POST",
            body: payload,
            accessToken: accessToken
        )
    }

    public func fetchLeaderboard(
        gameId: String,
        boardId: String = "high_score",
        scope: String = "global",
        limit: Int = 20,
        accessToken: String? = nil
    ) async throws -> SocialLeaderboardResponse {
        try await request(
            path: "/api/mobile/social/leaderboards/\(gameId)/\(boardId)?scope=\(scope)&limit=\(limit)",
            method: "GET",
            body: nil,
            accessToken: accessToken
        )
    }

    public func submitLeaderboardScore(
        gameId: String,
        boardId: String = "high_score",
        score: Int,
        accessToken: String
    ) async throws -> SocialScoreSubmitResponse {
        try await request(
            path: "/api/mobile/social/leaderboards/\(gameId)/\(boardId)/scores",
            method: "POST",
            body: ["score": score],
            accessToken: accessToken
        )
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
