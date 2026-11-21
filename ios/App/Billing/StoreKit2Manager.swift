import Foundation
import StoreKit

/// StoreKit 2 IAP Manager (Guideline 3.1.1 & 4.7.5).
/// - Uses StoreKit 2 JWS signed transactions + appAccountToken (principal UUID)
/// - Handles Ask to Buy (.pending) and crash-resilient Transaction.updates stream
/// - Provides mandatory Restore Purchases (AppStore.sync())
@MainActor
public final class StoreKit2Manager: ObservableObject {
    public static let defaultProductIds: [String] = [
        "com.playhub.coin.tier1",
        "com.playhub.coin.tier2",
        "com.playhub.pass.monthly"
    ]

    @Published public private(set) var products: [Product] = []
    @Published public private(set) var lastStatusMessage: String?

    private var updatesTask: Task<Void, Never>?

    public init() {}

    deinit {
        updatesTask?.cancel()
    }

    public func startTransactionListener(onVerifiedJws: @escaping @Sendable (String) async throws -> Void) {
        updatesTask?.cancel()
        updatesTask = Task.detached(priority: .background) {
            for await result in Transaction.updates {
                if case let .verified(transaction) = result {
                    do {
                        try await onVerifiedJws(result.jwsRepresentation)
                        await transaction.finish()
                    } catch {
                        // Leave unfinished so next launch retries server verification idempotently.
                    }
                }
            }
        }
    }

    public func loadProducts() async {
        do {
            products = try await Product.products(for: Self.defaultProductIds)
        } catch {
            lastStatusMessage = "스토어 상품을 불러오지 못했습니다: \(error.localizedDescription)"
        }
    }

    public func purchase(
        _ product: Product,
        principalUuid: UUID?,
        onVerifiedJws: @escaping @Sendable (String) async throws -> Void
    ) async {
        var options: Set<Product.PurchaseOption> = []
        if let principalUuid {
            options.insert(.appAccountToken(principalUuid))
        }
        do {
            let result = try await product.purchase(options: options)
            switch result {
            case let .success(verification):
                switch verification {
                case let .verified(transaction):
                    try await onVerifiedJws(verification.jwsRepresentation)
                    await transaction.finish()
                    lastStatusMessage = "구매가 완료되었습니다."
                case .unverified:
                    lastStatusMessage = "서명 검증에 실패했습니다."
                }
            case .pending:
                lastStatusMessage = "보호자 승인(Ask to Buy)을 기다리고 있습니다."
            case .userCancelled:
                lastStatusMessage = nil
            @unknown default:
                lastStatusMessage = "알 수 없는 결제 상태입니다."
            }
        } catch {
            lastStatusMessage = "결제 처리 오류: \(error.localizedDescription)"
        }
    }

    public func restorePurchases() async {
        do {
            try await AppStore.sync()
            lastStatusMessage = "구매 복원 동기화가 완료되었습니다."
        } catch {
            lastStatusMessage = "구매 복원 실패: \(error.localizedDescription)"
        }
    }
}
