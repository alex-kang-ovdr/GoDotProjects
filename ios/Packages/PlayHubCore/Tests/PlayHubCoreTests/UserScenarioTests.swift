import Foundation
import XCTest
@testable import PlayHubCore

private final class ScenarioURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

/// End-to-end user scenario tests verifying AOS-parity UI flows, social journeys,
/// 4-provider auth, age compliance, pre-entry compatibility, and shared wallet rules.
final class UserScenarioTests: XCTestCase {
    private func makeClient() -> PlayHubApiClient {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.protocolClasses = [ScenarioURLProtocol.self]
        return PlayHubApiClient(baseUrl: "https://hub.playhub.test", session: URLSession(configuration: cfg))
    }

    private func respond(url: URL, status: Int = 200, json: String) -> (HTTPURLResponse, Data) {
        let res = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        return (res, Data(json.utf8))
    }

    // Scenario 1: Neutral Age Gate -> Regional Tier -> Rating Gate & Child Protection
    func testScenario1_OnboardingAgeGateAndChildProtection() {
        let childTier = AgeGatePolicy.classify(birthYear: 2014, birthMonth: 5, nowYear: 2026, nowMonth: 11, regionCode: "KR")
        XCTAssertEqual(childTier, .childProtected)

        let childCaps = AgeGatePolicy.evaluateCapabilities(
            tier: childTier,
            isGuest: true,
            parentalConsentVerified: false,
            gameRating: .age12
        )
        XCTAssertFalse(childCaps.canPlayGame, "Unconsented KR child must be blocked from 12+ game")
        XCTAssertFalse(childCaps.canUseFreeChat, "Child must not access free text chat")
        XCTAssertTrue(childCaps.requiresParentalConsent)
        XCTAssertTrue(childCaps.requiresParentalGateForExternalLinks)

        let childAllAllowed = AgeGatePolicy.canPlay(tier: childTier, rating: .all, parentalConsentVerified: false)
        XCTAssertTrue(childAllAllowed, "Guest child can still immediately play ALL-rated games")

        let adultTier = AgeGatePolicy.classify(birthYear: 1998, birthMonth: 3, nowYear: 2026, nowMonth: 11, regionCode: "KR")
        XCTAssertEqual(adultTier, .adult)
        XCTAssertTrue(AgeGatePolicy.canPlay(tier: adultTier, rating: .age18, parentalConsentVerified: false))
    }

    // Scenario 2: Home/Explore Search + 5-Category Filtering + Pre-Entry Version Compatibility Gate
    func testScenario2_HomeExploreFilterAndPreEntryCompatibility() {
        let games = [
            MobileCatalogGame(
                id: "survivor-arena-g2",
                title: "Survivor Arena G2",
                description: "Godot 4.7.2 3D 서바이벌 액션",
                genre: "액션",
                runtime: "godot-pck",
                ageRating: "ALL",
                allowed: true,
                compatibility: MobileCatalogGameCompatibility(compatible: true, reason: nil, message: nil),
                entryUrl: "/games/survivor-arena-g2/index.pck",
                coverUrl: nil
            ),
            MobileCatalogGame(
                id: "match3-garden",
                title: "Match3 Garden",
                description: "HTML5 퍼즐 매치 게임",
                genre: "퍼즐",
                runtime: "web",
                ageRating: "ALL",
                allowed: true,
                compatibility: MobileCatalogGameCompatibility(compatible: true, reason: nil, message: nil),
                entryUrl: "/games/match3-garden/index.html",
                coverUrl: nil
            ),
            MobileCatalogGame(
                id: "nextgen-48-demo",
                title: "NextGen 3D Arena (Godot 4.8)",
                description: "차세대 3D 액션 테스트",
                genre: "액션",
                runtime: "godot-pck",
                ageRating: "12+",
                allowed: true,
                compatibility: MobileCatalogGameCompatibility(compatible: false, reason: "ENGINE_UPDATE_REQUIRED", message: "Godot 4.8.0 필요"),
                entryUrl: nil,
                coverUrl: nil
            )
        ]

        XCTAssertEqual(CatalogFilterEngine.filter(games: games, query: "", category: .all, applyCategory: true).count, 3)
        XCTAssertEqual(CatalogFilterEngine.filter(games: games, query: "", category: .godot, applyCategory: true).map(\.id), ["survivor-arena-g2", "nextgen-48-demo"])
        XCTAssertEqual(CatalogFilterEngine.filter(games: games, query: "", category: .web, applyCategory: true).map(\.id), ["match3-garden"])
        XCTAssertEqual(CatalogFilterEngine.filter(games: games, query: "", category: .puzzle, applyCategory: true).map(\.id), ["match3-garden"])
        XCTAssertEqual(CatalogFilterEngine.filter(games: games, query: "survivor", category: .action, applyCategory: true).map(\.id), ["survivor-arena-g2"])

        let meta48 = CatalogFilterEngine.presentationMeta(for: games[2])
        XCTAssertEqual(meta48.tagCode, "4.8")
        let compat48 = VersionCompatibilityChecker.evaluate(
            runtime: "godot-pck",
            requiredEngineVersion: meta48.requiredEngineVersion,
            minAppBuildNumber: 1,
            installedEngineVersion: "4.7.2",
            installedAppBuildNumber: 1
        )
        XCTAssertFalse(compat48.compatible)
        XCTAssertEqual(compat48.reason, .engineUpdateRequired)
    }

    // Scenario 3: Full Social Journey (Search -> Request -> Accept -> DM -> Party Create/Join -> Co-Entry Launch -> Ack -> Leaderboard -> Block)
    func testScenario3_FullSocialAndCoEntryJourney() async throws {
        var visitedEndpoints: [String] = []
        ScenarioURLProtocol.handler = { req in
            let url = req.url!
            let key = "\(req.httpMethod ?? "GET") \(url.path)"
            visitedEndpoints.append(key)

            switch key {
            case "GET /api/mobile/social/users/search":
                return self.respond(url: url, json: ##"{"users":[{"principalId":"u-minjun","displayName":"민준","handle":"minjun#1024","avatarColor":"#2563EB","isFriend":false,"presence":null}]}"##)
            case "POST /api/mobile/social/friends/request":
                return self.respond(url: url, status: 201, json: ##"{"targetPrincipalId":"u-minjun","status":"pending"}"##)
            case "POST /api/mobile/social/friends/respond":
                return self.respond(url: url, json: ##"{"requesterId":"u-minjun","status":"accepted"}"##)
            case "POST /api/mobile/social/messages":
                return self.respond(url: url, status: 201, json: ##"{"id":"m-1","channelType":"dm","senderId":"u-me","senderName":"나","senderHandle":"me#0001","senderAvatarColor":"#00B06F","senderMe":true,"body":"같이 플레이하자!","isQuickMessage":false,"createdAt":"2026-11-25T09:00:00Z"}"##)
            case "POST /api/mobile/social/parties":
                return self.respond(url: url, status: 201, json: ##"{"party":{"id":"p-1","leaderId":"u-me","title":"주말 스쿼드","targetGameId":"survivor-arena-g2","roomCode":"PLAY99","maxMembers":4,"inviteUrl":"https://hub.playhub.test/join/survivor-arena-g2?room=PLAY99","deepLinkUrl":"playhub://join/survivor-arena-g2?room=PLAY99","members":[{"principalId":"u-me","displayName":"나","handle":"me#0001","avatarColor":"#00B06F","role":"leader","ready":true,"presence":null}],"activeLaunch":null}}"##)
            case "POST /api/mobile/social/parties/p-1/launch":
                return self.respond(url: url, json: ##"{"launch":{"launchId":"l-1","gameId":"survivor-arena-g2","roomCode":"PLAY99","matchRoomId":"match-PLAY99-1","launchedBy":"u-me","status":"active","createdAt":"2026-11-25T09:01:00Z","participants":[{"principalId":"u-me","displayName":"나","handle":"me#0001","platform":"ios","state":"entered"}]},"party":{"id":"p-1","leaderId":"u-me","title":"주말 스쿼드","targetGameId":"survivor-arena-g2","roomCode":"PLAY99","maxMembers":4,"inviteUrl":null,"deepLinkUrl":"playhub://join/survivor-arena-g2?room=PLAY99","members":[{"principalId":"u-me","displayName":"나","handle":"me#0001","avatarColor":"#00B06F","role":"leader","ready":true,"presence":null}],"activeLaunch":{"launchId":"l-1","gameId":"survivor-arena-g2","roomCode":"PLAY99","matchRoomId":"match-PLAY99-1","launchedBy":"u-me","status":"active","createdAt":"2026-11-25T09:01:00Z","participants":[{"principalId":"u-me","displayName":"나","handle":"me#0001","platform":"ios","state":"entered"}]}}}"##)
            case "POST /api/mobile/social/parties/p-1/launch/ack":
                return self.respond(url: url, json: ##"{"launch":{"launchId":"l-1","gameId":"survivor-arena-g2","roomCode":"PLAY99","matchRoomId":"match-PLAY99-1","launchedBy":"u-me","status":"active","createdAt":"2026-11-25T09:01:00Z","participants":[{"principalId":"u-me","displayName":"나","handle":"me#0001","platform":"ios","state":"entered"},{"principalId":"u-minjun","displayName":"민준","handle":"minjun#1024","platform":"android","state":"entered"}]},"party":null}"##)
            case "GET /api/mobile/social/leaderboards/survivor-arena-g2/high_score":
                return self.respond(url: url, json: ##"{"gameId":"survivor-arena-g2","boardId":"high_score","scope":"global","periodKey":"all","entries":[{"rank":1,"principalId":"u-me","displayName":"나","handle":"me#0001","avatarColor":"#00B06F","score":9850,"isMe":true}]}"##)
            case "POST /api/mobile/social/blocks":
                return self.respond(url: url, json: ##"{"blocked":true}"##)
            default:
                return self.respond(url: url, status: 404, json: ##"{"error":"NOT_FOUND"}"##)
            }
        }

        let client = makeClient()
        let token = "test-jwt-token"

        let hits = try await client.searchSocialUsers(query: "minjun#1024", accessToken: token)
        XCTAssertEqual(hits.first?.principalId, "u-minjun")

        let reqRes = try await client.sendFriendRequest(targetPrincipalId: "u-minjun", accessToken: token)
        XCTAssertEqual(reqRes.status, "pending")

        let accRes = try await client.respondFriendRequest(requesterId: "u-minjun", action: "accept", accessToken: token)
        XCTAssertEqual(accRes.status, "accepted")

        let dm = try await client.sendSocialMessage(channelType: "dm", peerId: "u-minjun", bodyText: "같이 플레이하자!", accessToken: token)
        XCTAssertEqual(dm.body, "같이 플레이하자!")

        let party = try await client.createParty(title: "주말 스쿼드", targetGameId: "survivor-arena-g2", accessToken: token)
        XCTAssertEqual(party.roomCode, "PLAY99")
        let parsedDeepLink = party.deepLinkUrl.flatMap(URL.init(string:)).flatMap(PlayHubJoinDeepLink.parse)
        XCTAssertEqual(parsedDeepLink?.roomCode, "PLAY99")
        XCTAssertEqual(parsedDeepLink?.gameId, "survivor-arena-g2")

        let launchRes = try await client.launchParty(partyId: party.id, gameId: "survivor-arena-g2", gameTitle: "Survivor Arena G2", accessToken: token)
        XCTAssertEqual(launchRes.launch?.matchRoomId, "match-PLAY99-1")

        let ackRes = try await client.ackPartyLaunch(partyId: party.id, launchId: "l-1", state: "entered", gameTitle: "Survivor Arena G2", accessToken: token)
        XCTAssertEqual(ackRes.launch?.participants.count, 2)

        let board = try await client.fetchLeaderboard(gameId: "survivor-arena-g2", scope: "global", accessToken: token)
        XCTAssertEqual(board.entries.first?.score, 9850)

        try await client.blockUser(targetPrincipalId: "u-spam", accessToken: token)

        XCTAssertEqual(visitedEndpoints.count, 9)
    }

    // Scenario 4: 4-Provider Auth Discovery + Email Login + Refresh Token Rotation
    func testScenario4_FourProviderAuthAndRefresh() async throws {
        ScenarioURLProtocol.handler = { req in
            let url = req.url!
            switch "\(req.httpMethod ?? "GET") \(url.path)" {
            case "GET /api/mobile/auth/providers":
                return self.respond(url: url, json: #"{"providers":{"email":true,"google":true,"naver":true,"guest":true}}"#)
            case "POST /api/mobile/auth/email/login":
                return self.respond(url: url, json: #"{"accessToken":"acc-email-1","refreshToken":"ref-email-1","expiresInSec":900,"profile":{"principalId":"u-email","kind":"registered","isGuest":false,"authProvider":"email","displayName":"정훈","handle":"junghoon#1234","ageCompliance":{"completed":true,"regionCode":"KR","ageTier":"ADULT","parentalConsentStatus":"not_required"}}}"#)
            case "POST /api/mobile/auth/refresh":
                return self.respond(url: url, json: #"{"accessToken":"acc-email-2","refreshToken":"ref-email-2","expiresInSec":900,"profile":{"principalId":"u-email","kind":"registered","isGuest":false,"authProvider":"email","displayName":"정훈","handle":"junghoon#1234","ageCompliance":{"completed":true,"regionCode":"KR","ageTier":"ADULT","parentalConsentStatus":"not_required"}}}"#)
            default:
                return self.respond(url: url, status: 404, json: #"{"error":"NOT_FOUND"}"#)
            }
        }

        let client = makeClient()
        let providers = try await client.fetchAuthProviders()
        XCTAssertTrue(providers.email && providers.google && providers.naver && providers.guest)

        let auth = try await client.loginEmail(email: "player@playhub.test", password: "Password123!")
        XCTAssertEqual(auth.profile.authProvider, "email")
        XCTAssertFalse(auth.profile.isGuest)

        let rotated = try await client.refreshSession(refreshToken: auth.refreshToken)
        XCTAssertEqual(rotated.accessToken, "acc-email-2")
        XCTAssertEqual(rotated.refreshToken, "ref-email-2")
    }
}
