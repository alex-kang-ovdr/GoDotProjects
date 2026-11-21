import Foundation
import PlayHubCore

public struct PlayHubSafeProfileSnapshot: Codable, Sendable {
    public let displayName: String
    public let handle: String
    public let isGuest: Bool
    public let ageTier: String
    public let locale: String
    public let runtime: String

    public init(
        displayName: String,
        handle: String,
        isGuest: Bool,
        ageTier: String,
        locale: String = Locale.current.identifier,
        runtime: String = "ios"
    ) {
        self.displayName = displayName
        self.handle = handle
        self.isGuest = isGuest
        self.ageTier = ageTier
        self.locale = locale
        self.runtime = runtime
    }
}

/// Whitelist-only runtime broker enforcing Apple Guideline 4.7.2 & 4.7.3 security boundaries
/// inside the single iOS app process. Never exposes Keychain tokens, Apple ID tokens,
/// StoreKit receipts, or other games' storage directories to GDScript/JS.
public actor PlayHubRuntimeBroker {
    public static let allowedMethods: Set<String> = [
        "ready",
        "pause",
        "resume",
        "activity_pulse",
        "get_profile",
        "save_load",
        "save_write",
        "iap_query_products",
        "iap_purchase",
        "iap_get_entitlements",
        "iap_spend_coin",
        "social_get_friends",
        "social_get_party",
        "social_invite_friend",
        "social_submit_score",
        "social_get_leaderboard",
        "social_open_overlay",
        "social_share_link"
    ]

    private var activeGameId: String?
    private var profileSnapshot: PlayHubSafeProfileSnapshot

    public init(profile: PlayHubSafeProfileSnapshot) {
        self.profileSnapshot = profile
    }

    public func bindGame(gameId: String) {
        self.activeGameId = gameId
    }

    public func unbindGame() {
        self.activeGameId = nil
    }

    public func updateProfile(_ profile: PlayHubSafeProfileSnapshot) {
        self.profileSnapshot = profile
    }

    public func dispatch(method: String, reqId: String, payloadJson: String) -> (ok: Bool, responseJson: String) {
        guard Self.allowedMethods.contains(method) else {
            return (false, #"{"error":"BRIDGE_METHOD_FORBIDDEN"}"#)
        }
        switch method {
        case "get_profile":
            if let encoded = try? JSONEncoder().encode(profileSnapshot),
               let json = String(data: encoded, encoding: .utf8) {
                return (true, json)
            }
            return (false, #"{"error":"ENCODE_FAILED"}"#)
        case "ready", "pause", "resume", "activity_pulse":
            return (true, #"{"ok":true,"gameId":"\#(activeGameId ?? "")","reqId":"\#(reqId)"}"#)
        default:
            return (true, #"{"queued":true,"method":"\#(method)","reqId":"\#(reqId)"}"#)
        }
    }
}
