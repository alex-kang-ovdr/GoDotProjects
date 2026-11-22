import Foundation

/// Parsed PlayHub party / game join deep link.
/// Supports both custom scheme (`playhub://join/<gameId>?room=<CODE>`)
/// and Universal Link (`https://<host>/join/<gameId>?room=<CODE>`).
public struct PlayHubJoinDeepLink: Equatable, Sendable {
    public let gameId: String?
    public let roomCode: String?
    public let inviter: String?

    public init(gameId: String?, roomCode: String?, inviter: String? = nil) {
        self.gameId = gameId
        self.roomCode = roomCode
        self.inviter = inviter
    }

    public static func parse(_ url: URL) -> PlayHubJoinDeepLink? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        let scheme = (components.scheme ?? "").lowercased()
        let queryItems = components.queryItems ?? []
        let rawRoom = queryItems.first(where: { $0.name == "room" })?.value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        let roomCode = (rawRoom?.isEmpty == false) ? rawRoom : nil
        let rawInviter = queryItems.first(where: { $0.name == "inviter" })?.value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let inviter = (rawInviter?.isEmpty == false) ? rawInviter : nil

        if scheme == "playhub" {
            let host = (components.host ?? "").lowercased()
            let pathParts = components.path
                .split(separator: "/")
                .map(String.init)
                .filter { !$0.isEmpty }
            if host == "join" {
                let rawGame = pathParts.first
                let gameId = (rawGame == nil || rawGame == "lobby") ? nil : rawGame
                if gameId != nil || roomCode != nil {
                    return PlayHubJoinDeepLink(gameId: gameId, roomCode: roomCode, inviter: inviter)
                }
            }
            return nil
        }

        if scheme == "https" || scheme == "http" {
            let pathParts = components.path
                .split(separator: "/")
                .map(String.init)
                .filter { !$0.isEmpty }
            if pathParts.first?.lowercased() == "join" {
                let rawGame = pathParts.count > 1 ? pathParts[1] : nil
                let gameId = (rawGame == nil || rawGame == "lobby") ? nil : rawGame
                if gameId != nil || roomCode != nil {
                    return PlayHubJoinDeepLink(gameId: gameId, roomCode: roomCode, inviter: inviter)
                }
            }
            if queryItems.first(where: { $0.name == "view" })?.value == "social", roomCode != nil {
                return PlayHubJoinDeepLink(gameId: nil, roomCode: roomCode, inviter: inviter)
            }
        }
        return nil
    }
}

public enum SocialTimeFormatter {
    public static func formatHHmm(_ isoString: String, timeZone: TimeZone = .current) -> String {
        let trimmed = isoString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        let isoWithFrac = ISO8601DateFormatter()
        isoWithFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoPlain = ISO8601DateFormatter()
        isoPlain.formatOptions = [.withInternetDateTime]

        if let date = isoWithFrac.date(from: trimmed) ?? isoPlain.date(from: trimmed) {
            let fmt = DateFormatter()
            fmt.locale = Locale(identifier: "en_US_POSIX")
            fmt.timeZone = timeZone
            fmt.dateFormat = "HH:mm"
            return fmt.string(from: date)
        }
        if let tIdx = trimmed.firstIndex(of: "T") {
            let start = trimmed.index(after: tIdx)
            return String(trimmed[start...].prefix(5))
        }
        return String(trimmed.prefix(5))
    }
}
