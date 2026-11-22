import Foundation

public enum AgeTier: String, Equatable, Codable, Sendable {
    case unknown = "UNKNOWN"
    case childProtected = "CHILD_PROTECTED"
    case teenMinor = "TEEN_MINOR"
    case adult = "ADULT"
}

public enum GameAgeRating: String, Equatable, Codable, Sendable {
    case all = "ALL"
    case age12 = "12+"
    case age15 = "15+"
    case age18 = "18+"

    public static func from(code: String?) -> GameAgeRating {
        switch (code ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "12+": return .age12
        case "15+": return .age15
        case "18+": return .age18
        default: return .all
        }
    }
}

public struct UserCapabilities: Equatable, Codable, Sendable {
    public let canPlayGame: Bool
    public let canUseFreeChat: Bool
    public let canUseQuickChatOnly: Bool
    public let canPurchaseIap: Bool
    public let requiresAccountLoginForIap: Bool
    public let requiresParentalConsent: Bool
    public let requiresParentalGateForExternalLinks: Bool
    public let disablePersonalizedAds: Bool

    public init(
        canPlayGame: Bool,
        canUseFreeChat: Bool,
        canUseQuickChatOnly: Bool,
        canPurchaseIap: Bool,
        requiresAccountLoginForIap: Bool,
        requiresParentalConsent: Bool,
        requiresParentalGateForExternalLinks: Bool,
        disablePersonalizedAds: Bool
    ) {
        self.canPlayGame = canPlayGame
        self.canUseFreeChat = canUseFreeChat
        self.canUseQuickChatOnly = canUseQuickChatOnly
        self.canPurchaseIap = canPurchaseIap
        self.requiresAccountLoginForIap = requiresAccountLoginForIap
        self.requiresParentalConsent = requiresParentalConsent
        self.requiresParentalGateForExternalLinks = requiresParentalGateForExternalLinks
        self.disablePersonalizedAds = disablePersonalizedAds
    }
}

/// Neutral Age Gate & youth protection policy (KR PIPA/Game Industry Act, US COPPA, EU GDPR-K, Apple App Store 4.7).
public enum AgeGatePolicy {
    private static let euChildAge16: Set<String> = ["DE", "NL", "PL", "IE", "SK", "HR", "HU", "LT", "LU"]

    public static func childThreshold(forRegion regionCode: String) -> Int {
        let code = regionCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if code == "KR" { return 14 }
        if euChildAge16.contains(code) { return 16 }
        return 13
    }

    public static func adultThreshold(forRegion regionCode: String) -> Int {
        let code = regionCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return code == "KR" ? 19 : 18
    }

    public static func computeAgeYears(birthYear: Int, birthMonth: Int, nowYear: Int, nowMonth: Int) -> Int? {
        guard (1...12).contains(birthMonth), (1...12).contains(nowMonth) else {
            return nil
        }
        let diff = nowYear - birthYear
        return nowMonth < birthMonth ? diff - 1 : diff
    }

    public static func classify(
        birthYear: Int,
        birthMonth: Int,
        nowYear: Int,
        nowMonth: Int,
        regionCode: String
    ) -> AgeTier {
        guard let age = computeAgeYears(birthYear: birthYear, birthMonth: birthMonth, nowYear: nowYear, nowMonth: nowMonth),
              age >= 0, age <= 120 else {
            return .unknown
        }
        let childLimit = childThreshold(forRegion: regionCode)
        let adultLimit = adultThreshold(forRegion: regionCode)
        if age < childLimit { return .childProtected }
        if age < adultLimit { return .teenMinor }
        return .adult
    }

    public static func canPlay(tier: AgeTier, rating: GameAgeRating, parentalConsentVerified: Bool) -> Bool {
        switch tier {
        case .unknown:
            return rating == .all
        case .childProtected:
            return rating == .all || (parentalConsentVerified && rating == .age12)
        case .teenMinor:
            return rating != .age18
        case .adult:
            return true
        }
    }

    public static func evaluateCapabilities(
        tier: AgeTier,
        isGuest: Bool,
        parentalConsentVerified: Bool,
        gameRating: GameAgeRating = .all
    ) -> UserCapabilities {
        let isChild = (tier == .childProtected || tier == .unknown)
        return UserCapabilities(
            canPlayGame: canPlay(tier: tier, rating: gameRating, parentalConsentVerified: parentalConsentVerified),
            canUseFreeChat: !isChild && !isGuest,
            canUseQuickChatOnly: isChild && parentalConsentVerified && !isGuest,
            canPurchaseIap: !isGuest && (!isChild || parentalConsentVerified),
            requiresAccountLoginForIap: isGuest,
            requiresParentalConsent: isChild && !parentalConsentVerified,
            requiresParentalGateForExternalLinks: isChild,
            disablePersonalizedAds: isChild
        )
    }
}
