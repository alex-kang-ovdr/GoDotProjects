import Foundation

public enum WalletPlatform: String, Equatable, Codable, Sendable {
    case apple
    case google
    case web
    case bonus
}

public enum WalletCurrencyKind: String, Equatable, Codable, Sendable {
    case bonus
    case paid
}

public enum WalletScope: String, Equatable, Codable, Sendable {
    /// Roblox Robux / Fortnite Shared Wallet: spendable on Web, Android, and iOS seamlessly.
    case shared
    /// Reserved for closed-wallet consoles where paid currency stays platform-scoped.
    case platformLocked = "platform_locked"
}

public struct WalletBucket: Equatable, Codable, Sendable {
    public let id: String
    public let sourcePlatform: WalletPlatform
    public let currencyKind: WalletCurrencyKind
    public let scope: WalletScope
    public let grantedAmount: Int
    public let remainingAmount: Int
    public let createdAtMs: Int64

    public init(
        id: String,
        sourcePlatform: WalletPlatform,
        currencyKind: WalletCurrencyKind,
        scope: WalletScope = .shared,
        grantedAmount: Int,
        remainingAmount: Int,
        createdAtMs: Int64
    ) {
        self.id = id
        self.sourcePlatform = sourcePlatform
        self.currencyKind = currencyKind
        self.scope = scope
        self.grantedAmount = grantedAmount
        self.remainingAmount = remainingAmount
        self.createdAtMs = createdAtMs
    }
}

public struct BucketDebitAllocation: Equatable, Codable, Sendable {
    public let bucketId: String
    public let amount: Int

    public init(bucketId: String, amount: Int) {
        self.bucketId = bucketId
        self.amount = amount
    }
}

public enum WalletError: Error, Equatable {
    case invalidAmount
    case insufficientFunds(available: Int, requested: Int)
}

/// Roblox / UEFN Shared Wallet policy:
/// 1) Players see one unified spendable balance across Web, Android, and iOS.
/// 2) Debits consume FIFO by priority:
///    - Priority 0: bonus / earned coins (always shared)
///    - Priority 1: paid coins originating on the current platform
///    - Priority 2: paid shared coins from other platforms
/// 3) Source buckets enable exact Apple Consumption API usage percentage & refund clawbacks.
public enum WalletPolicy {
    public static func spendableBalance(
        buckets: [WalletBucket],
        onPlatform currentPlatform: WalletPlatform
    ) -> Int {
        buckets
            .filter { isSpendable($0, onPlatform: currentPlatform) }
            .reduce(0) { $0 + max(0, $1.remainingAmount) }
    }

    public static func planSpend(
        amount: Int,
        buckets: [WalletBucket],
        onPlatform currentPlatform: WalletPlatform
    ) throws -> [BucketDebitAllocation] {
        guard amount > 0 else {
            throw WalletError.invalidAmount
        }
        let eligible = buckets
            .filter { $0.remainingAmount > 0 && isSpendable($0, onPlatform: currentPlatform) }
            .sorted { lhs, rhs in
                let lp = priority(of: lhs, currentPlatform: currentPlatform)
                let rp = priority(of: rhs, currentPlatform: currentPlatform)
                if lp != rp { return lp < rp }
                if lhs.createdAtMs != rhs.createdAtMs { return lhs.createdAtMs < rhs.createdAtMs }
                return lhs.id < rhs.id
            }

        let available = eligible.reduce(0) { $0 + $1.remainingAmount }
        guard available >= amount else {
            throw WalletError.insufficientFunds(available: available, requested: amount)
        }

        var remainingToDebit = amount
        var allocations: [BucketDebitAllocation] = []
        for bucket in eligible where remainingToDebit > 0 {
            let take = min(bucket.remainingAmount, remainingToDebit)
            allocations.append(BucketDebitAllocation(bucketId: bucket.id, amount: take))
            remainingToDebit -= take
        }
        return allocations
    }

    public static func consumedPercentage(granted: Int, remaining: Int) -> Int {
        guard granted > 0 else { return 0 }
        let consumed = max(0, min(granted, granted - remaining))
        return Int((Double(consumed) / Double(granted) * 100.0).rounded())
    }

    private static func isSpendable(_ bucket: WalletBucket, onPlatform currentPlatform: WalletPlatform) -> Bool {
        if bucket.currencyKind == .bonus || bucket.scope == .shared {
            return true
        }
        return bucket.sourcePlatform == currentPlatform
    }

    private static func priority(of bucket: WalletBucket, currentPlatform: WalletPlatform) -> Int {
        if bucket.currencyKind == .bonus { return 0 }
        if bucket.sourcePlatform == currentPlatform { return 1 }
        return 2
    }
}
