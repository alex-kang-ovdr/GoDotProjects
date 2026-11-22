import XCTest
@testable import PlayHubCore

final class AgeGateAndWalletTests: XCTestCase {
    func testRegionalThresholdsKRUSDE() {
        XCTAssertEqual(AgeGatePolicy.classify(birthYear: 2013, birthMonth: 6, nowYear: 2026, nowMonth: 11, regionCode: "KR"), .childProtected)
        XCTAssertEqual(AgeGatePolicy.classify(birthYear: 2013, birthMonth: 6, nowYear: 2026, nowMonth: 11, regionCode: "US"), .teenMinor)
        XCTAssertEqual(AgeGatePolicy.classify(birthYear: 2011, birthMonth: 6, nowYear: 2026, nowMonth: 11, regionCode: "DE"), .childProtected)
        XCTAssertEqual(AgeGatePolicy.classify(birthYear: 2008, birthMonth: 6, nowYear: 2026, nowMonth: 11, regionCode: "KR"), .teenMinor)
        XCTAssertEqual(AgeGatePolicy.classify(birthYear: 2008, birthMonth: 6, nowYear: 2026, nowMonth: 11, regionCode: "US"), .adult)
    }

    func testChildProtectionAndParentalGate() {
        let caps = AgeGatePolicy.evaluateCapabilities(tier: .childProtected, isGuest: true, parentalConsentVerified: false, gameRating: .age12)
        XCTAssertFalse(caps.canPlayGame)
        XCTAssertFalse(caps.canUseFreeChat)
        XCTAssertFalse(caps.canPurchaseIap)
        XCTAssertTrue(caps.requiresParentalConsent)
        XCTAssertTrue(caps.requiresParentalGateForExternalLinks)
        XCTAssertTrue(caps.disablePersonalizedAds)

        let consented = AgeGatePolicy.evaluateCapabilities(tier: .childProtected, isGuest: false, parentalConsentVerified: true, gameRating: .age12)
        XCTAssertTrue(consented.canPlayGame)
        XCTAssertTrue(consented.canUseQuickChatOnly)
        XCTAssertFalse(consented.canUseFreeChat)
    }

    func testRobloxUefnSharedWalletPriorityAndBucketAllocation() throws {
        let buckets = [
            WalletBucket(id: "b-google", sourcePlatform: .google, currencyKind: .paid, scope: .shared, grantedAmount: 500, remainingAmount: 500, createdAtMs: 100),
            WalletBucket(id: "b-apple", sourcePlatform: .apple, currencyKind: .paid, scope: .shared, grantedAmount: 300, remainingAmount: 300, createdAtMs: 200),
            WalletBucket(id: "b-bonus", sourcePlatform: .bonus, currencyKind: .bonus, scope: .shared, grantedAmount: 100, remainingAmount: 100, createdAtMs: 300),
            WalletBucket(id: "b-locked", sourcePlatform: .web, currencyKind: .paid, scope: .platformLocked, grantedAmount: 400, remainingAmount: 400, createdAtMs: 50)
        ]

        // On iOS: bonus(100) + apple(300) + google shared(500) = 900 (locked web bucket excluded)
        XCTAssertEqual(WalletPolicy.spendableBalance(buckets: buckets, onPlatform: .apple), 900)

        // Spend 550 on iOS -> 100 bonus first, then 300 apple paid, then 150 google shared
        let plan = try WalletPolicy.planSpend(amount: 550, buckets: buckets, onPlatform: .apple)
        XCTAssertEqual(plan, [
            BucketDebitAllocation(bucketId: "b-bonus", amount: 100),
            BucketDebitAllocation(bucketId: "b-apple", amount: 300),
            BucketDebitAllocation(bucketId: "b-google", amount: 150)
        ])

        XCTAssertEqual(WalletPolicy.consumedPercentage(granted: 500, remaining: 350), 30)
    }
}
