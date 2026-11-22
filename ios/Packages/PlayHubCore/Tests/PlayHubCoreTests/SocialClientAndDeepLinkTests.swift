import Foundation
import XCTest
@testable import PlayHubCore

private final class MockSocialURLProtocol: URLProtocol {
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

final class SocialClientAndDeepLinkTests: XCTestCase {
    private func makeClient() -> PlayHubApiClient {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.protocolClasses = [MockSocialURLProtocol.self]
        let session = URLSession(configuration: cfg)
        return PlayHubApiClient(baseUrl: "https://hub.playhub.test", session: session)
    }

    func testParsesCustomSchemeAndUniversalDeepLinks() {
        let custom = URL(string: "playhub://join/survivor-arena-g2?room=play99&inviter=minjun%231024")!
        let parsedCustom = PlayHubJoinDeepLink.parse(custom)
        XCTAssertEqual(parsedCustom?.gameId, "survivor-arena-g2")
        XCTAssertEqual(parsedCustom?.roomCode, "PLAY99")
        XCTAssertEqual(parsedCustom?.inviter, "minjun#1024")

        let universal = URL(string: "https://playhub.example.com/join/lobby?room=ABCD12")!
        let parsedUniversal = PlayHubJoinDeepLink.parse(universal)
        XCTAssertNil(parsedUniversal?.gameId)
        XCTAssertEqual(parsedUniversal?.roomCode, "ABCD12")

        let webPortal = URL(string: "https://playhub.example.com/?view=social&room=PLAY99")!
        let parsedWeb = PlayHubJoinDeepLink.parse(webPortal)
        XCTAssertEqual(parsedWeb?.roomCode, "PLAY99")

        let unrelated = URL(string: "https://playhub.example.com/about")!
        XCTAssertNil(PlayHubJoinDeepLink.parse(unrelated))
    }

    func testFormatsIsoTimestampToHHmm() {
        let utc = TimeZone(secondsFromGMT: 0)!
        XCTAssertEqual(
            SocialTimeFormatter.formatHHmm("2026-11-21T06:55:44.798Z", timeZone: utc),
            "06:55"
        )
        let kst = TimeZone(secondsFromGMT: 9 * 3600)!
        XCTAssertEqual(
            SocialTimeFormatter.formatHHmm("2026-11-21T06:55:44.798Z", timeZone: kst),
            "15:55"
        )
    }

    func testFetchesFriendsPartyMessagesAndLeaderboard() async throws {
        MockSocialURLProtocol.handler = { req in
            let url = req.url!
            let path = url.path
            XCTAssertEqual(req.value(forHTTPHeaderField: "X-PlayHub-Platform"), "ios")
            let body: String
            switch path {
            case "/api/mobile/social/profile":
                if req.httpMethod == "PUT" {
                    body = """
                    {
                      "principalId": "local_me",
                      "displayName": "나플레이어",
                      "handle": "me#0001",
                      "avatarColor": "#00B06F",
                      "bio": "반가워요",
                      "privacyLevel": "public"
                    }
                    """
                } else {
                    body = """
                    {
                      "principalId": "local_me",
                      "displayName": "나플레이어",
                      "handle": "me#0001",
                      "avatarColor": "#00B06F",
                      "bio": "",
                      "privacyLevel": "public",
                      "ageTier": "CHILD_PROTECTED",
                      "parentalConsentStatus": "verified",
                      "presence": {
                        "status": "online",
                        "online": true,
                        "gameId": null,
                        "gameTitle": null,
                        "roomCode": null,
                        "joinable": true
                      }
                    }
                    """
                }
            case "/api/mobile/social/users/search":
                body = """
                {
                  "users": [{
                    "principalId": "local_minjun",
                    "displayName": "민준",
                    "handle": "minjun#1024",
                    "avatarColor": "#2563EB",
                    "isFriend": true,
                    "presence": {
                      "status": "in_game",
                      "online": true,
                      "gameId": "survivor-arena-g2",
                      "gameTitle": "Survivor Arena G2",
                      "roomCode": "PLAY99",
                      "joinable": true
                    }
                  }]
                }
                """
            case "/api/mobile/social/friends":
                body = """
                {
                  "friends": [{
                    "principalId": "local_minjun",
                    "displayName": "민준",
                    "handle": "minjun#1024",
                    "avatarColor": "#2563EB",
                    "presence": {
                      "status": "in_game",
                      "online": true,
                      "gameId": "survivor-arena-g2",
                      "gameTitle": "Survivor Arena G2",
                      "roomCode": "PLAY99",
                      "joinable": true
                    },
                    "lastMessage": "안녕! 파티 PLAY99로 합류해!",
                    "lastMessageAt": "2026-11-21T06:55:00.000Z",
                    "lastMessageFromMe": false
                  }],
                  "incomingRequests": [],
                  "outgoingRequests": [],
                  "blocked": []
                }
                """
            case "/api/mobile/social/messages":
                if req.httpMethod == "POST" {
                    body = """
                    {
                      "id": "msg_2",
                      "channelType": "dm",
                      "channelKey": "local_me:local_minjun",
                      "senderId": "local_me",
                      "senderMe": true,
                      "body": "준비 완료!",
                      "isQuickMessage": true,
                      "createdAt": "2026-11-21T06:56:00.000Z"
                    }
                    """
                } else {
                    body = """
                    {
                      "channelType": "dm",
                      "channelKey": "local_me:local_minjun",
                      "messages": [{
                        "id": "msg_1",
                        "senderId": "local_minjun",
                        "senderName": "민준",
                        "senderHandle": "minjun#1024",
                        "senderMe": false,
                        "body": "안녕! 파티 PLAY99로 합류해!",
                        "isQuickMessage": false,
                        "createdAt": "2026-11-21T06:55:00.000Z"
                      }]
                    }
                    """
                }
            case "/api/mobile/social/parties/join":
                body = """
                {
                  "party": {
                    "id": "local_party_play99",
                    "leaderId": "local_minjun",
                    "title": "민준의 서바이벌 파티",
                    "targetGameId": "survivor-arena-g2",
                    "roomCode": "PLAY99",
                    "maxMembers": 8,
                    "inviteUrl": "https://hub.playhub.test/join/survivor-arena-g2?room=PLAY99",
                    "deepLinkUrl": "playhub://join/survivor-arena-g2?room=PLAY99",
                    "members": [{
                      "principalId": "local_minjun",
                      "displayName": "민준",
                      "handle": "minjun#1024",
                      "avatarColor": "#2563EB",
                      "role": "leader",
                      "ready": true,
                      "presence": null
                    }]
                  }
                }
                """
            case "/api/mobile/social/leaderboards/survivor-arena-g2/high_score":
                body = """
                {
                  "gameId": "survivor-arena-g2",
                  "boardId": "high_score",
                  "scope": "global",
                  "periodKey": "all",
                  "entries": [{
                    "rank": 1,
                    "principalId": "local_minjun",
                    "displayName": "민준",
                    "handle": "minjun#1024",
                    "avatarColor": "#2563EB",
                    "score": 2850,
                    "isMe": false
                  }]
                }
                """
            default:
                body = "{}"
            }
            let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            return (resp, Data(body.utf8))
        }

        let client = makeClient()
        let profile = try await client.fetchSocialProfile(accessToken: "tok")
        XCTAssertEqual(profile.ageTier, "CHILD_PROTECTED")
        XCTAssertEqual(profile.parentalConsentStatus, "verified")
        XCTAssertEqual(profile.presence?.online, true)

        let updatedProfile = try await client.updateSocialProfile(bio: "반가워요", accessToken: "tok")
        XCTAssertEqual(updatedProfile.bio, "반가워요")
        XCTAssertNil(updatedProfile.ageTier)

        let hits = try await client.searchSocialUsers(query: "minjun", accessToken: "tok")
        XCTAssertEqual(hits.count, 1)
        XCTAssertEqual(hits.first?.isFriend, true)
        XCTAssertEqual(hits.first?.presence?.roomCode, "PLAY99")

        let friends = try await client.fetchSocialFriends(accessToken: "tok")
        XCTAssertEqual(friends.friends.count, 1)
        XCTAssertEqual(friends.friends.first?.handle, "minjun#1024")
        XCTAssertEqual(friends.friends.first?.presence.roomCode, "PLAY99")
        XCTAssertEqual(friends.friends.first?.lastMessage, "안녕! 파티 PLAY99로 합류해!")
        XCTAssertEqual(friends.friends.first?.lastMessageAt, "2026-11-21T06:55:00.000Z")
        XCTAssertEqual(friends.friends.first?.lastMessageFromMe, false)

        let messages = try await client.fetchSocialMessages(channelType: "dm", peerId: "local_minjun", accessToken: "tok")
        XCTAssertEqual(messages.count, 1)
        XCTAssertEqual(messages.first?.senderName, "민준")
        XCTAssertEqual(messages.first?.body, "안녕! 파티 PLAY99로 합류해!")

        let sent = try await client.sendSocialMessage(channelType: "dm", peerId: "local_minjun", quickMessageId: "qm_ready", accessToken: "tok")
        XCTAssertEqual(sent.id, "msg_2")
        XCTAssertEqual(sent.isQuickMessage, true)
        XCTAssertEqual(sent.senderMe, true)

        let party = try await client.joinParty(roomCode: "play99", accessToken: "tok")
        XCTAssertEqual(party.roomCode, "PLAY99")
        XCTAssertEqual(party.members.first?.role, "leader")

        let lb = try await client.fetchLeaderboard(gameId: "survivor-arena-g2", accessToken: "tok")
        XCTAssertEqual(lb.entries.first?.score, 2850)
    }

    func testPropagatesChildFreeChatBlocked403() async {
        MockSocialURLProtocol.handler = { req in
            let resp = HTTPURLResponse(url: req.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            let payload = #"{"error":{"code":"CHILD_FREE_CHAT_BLOCKED","message":"아동 보호 모드"}}"#
            return (resp, Data(payload.utf8))
        }
        let client = makeClient()
        do {
            _ = try await client.sendSocialMessage(channelType: "dm", peerId: "local_minjun", bodyText: "hello", accessToken: "tok")
            XCTFail("Expected HTTP 403 error")
        } catch let PlayHubApiError.httpError(code, body) {
            XCTAssertEqual(code, 403)
            XCTAssertTrue(body.contains("CHILD_FREE_CHAT_BLOCKED"))
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}
