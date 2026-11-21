import PlayHubCore
import SwiftUI

public enum PlayHubTab: Int, CaseIterable {
    case home
    case charts
    case avatar
    case party
    case more

    var title: String {
        switch self {
        case .home: return "홈"
        case .charts: return "차트"
        case .avatar: return "아바타"
        case .party: return "파티"
        case .more: return "더보기"
        }
    }

    var systemImage: String {
        switch self {
        case .home: return "house.fill"
        case .charts: return "chart.bar.fill"
        case .avatar: return "person.crop.circle.fill"
        case .party: return "person.3.fill"
        case .more: return "ellipsis.circle.fill"
        }
    }
}

@MainActor
public final class PlayHubShellViewModel: ObservableObject {
    @Published public var selectedTab: PlayHubTab = .home
    @Published public var ageGateCompleted: Bool = false
    @Published public var ageTier: AgeTier = .unknown
    @Published public var coinBalance: Int = 0
    @Published public var activeFarm: FarmCluster
    @Published public var farmHealth: [String: FarmHealthResult] = [:]
    @Published public var showFarmSheet: Bool = false
    @Published public var showStoreSheet: Bool = false
    @Published public var incompatibilityAlert: VersionCompatibilityResult?

    public let buildStage: String
    public let allowFarmSelector: Bool
    public let defaultHubUrl: String
    public let engineVersion: String

    public init() {
        let info = Bundle.main.infoDictionary ?? [:]
        self.buildStage = (info["PlayHubBuildStage"] as? String) ?? "debug"
        self.defaultHubUrl = (info["PlayHubDefaultHubUrl"] as? String) ?? "http://127.0.0.1:18130"
        self.engineVersion = (info["PlayHubEngineVersion"] as? String) ?? "4.7.2"

        #if ALLOW_FARM_SELECTOR
        let compileFlag = true
        #else
        let compileFlag = false
        #endif
        self.allowFarmSelector = FarmServerRegistry.isSelectorAllowed(buildStage: buildStage, allowFlag: compileFlag)
        self.activeFarm = FarmServerRegistry.resolveActiveCluster(
            buildStage: buildStage,
            allowFlag: self.allowFarmSelector,
            defaultBaseUrl: defaultHubUrl,
            selectedFarmId: UserDefaults.standard.string(forKey: "playhub_selected_farm_id"),
            customUrl: UserDefaults.standard.string(forKey: "playhub_custom_farm_url")
        )
    }

    public func selectableFarms() -> [FarmCluster] {
        FarmServerRegistry.selectableClusters(
            buildStage: buildStage,
            defaultBaseUrl: defaultHubUrl,
            activeFarm: activeFarm
        )
    }

    public func refreshFarmHealth() async {
        guard allowFarmSelector else { return }
        let clusters = selectableFarms()
        for c in clusters {
            farmHealth[c.id] = FarmHealthResult(status: .checking)
        }
        farmHealth = await FarmHealthChecker.probeAll(clusters: clusters)
    }

    public func selectFarm(_ cluster: FarmCluster) {
        guard allowFarmSelector else { return }
        activeFarm = cluster
        UserDefaults.standard.set(cluster.id, forKey: "playhub_selected_farm_id")
        if cluster.id == FarmServerRegistry.customFarmId {
            UserDefaults.standard.set(cluster.baseUrl, forKey: "playhub_custom_farm_url")
        }
    }
}

public struct MainTabView: View {
    @StateObject private var vm = PlayHubShellViewModel()
    @StateObject private var store = StoreKit2Manager()

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            topUtilityBar
            TabView(selection: $vm.selectedTab) {
                homeView.tabItem { Label(PlayHubTab.home.title, systemImage: PlayHubTab.home.systemImage) }.tag(PlayHubTab.home)
                placeholderTab(title: "차트", subtitle: "인기 · 급상승 · 신규 게임 랭킹").tabItem { Label(PlayHubTab.charts.title, systemImage: PlayHubTab.charts.systemImage) }.tag(PlayHubTab.charts)
                placeholderTab(title: "아바타", subtitle: "코스메틱 꾸미기 · 인벤토리 · 샵").tabItem { Label(PlayHubTab.avatar.title, systemImage: PlayHubTab.avatar.systemImage) }.tag(PlayHubTab.avatar)
                placeholderTab(title: "파티", subtitle: "친구 프레즌스 · 함께 플레이 로비").tabItem { Label(PlayHubTab.party.title, systemImage: PlayHubTab.party.systemImage) }.tag(PlayHubTab.party)
                moreView.tabItem { Label(PlayHubTab.more.title, systemImage: PlayHubTab.more.systemImage) }.tag(PlayHubTab.more)
            }
            .tint(Color(red: 0.22, green: 0.74, blue: 0.97))
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $vm.showFarmSheet) {
            farmSelectorSheet
        }
        .sheet(isPresented: $vm.showStoreSheet) {
            storeSheet
        }
        .task {
            await vm.refreshFarmHealth()
        }
    }

    private var topUtilityBar: some View {
        HStack(spacing: 10) {
            Text("▶ Play Hub")
                .font(.headline.bold())
                .foregroundStyle(.white)

            if vm.allowFarmSelector {
                let health = vm.farmHealth[vm.activeFarm.id] ?? FarmHealthResult(status: .checking)
                Button {
                    vm.showFarmSheet = true
                    Task { await vm.refreshFarmHealth() }
                } label: {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(colorForStatus(health.status))
                            .frame(width: 8, height: 8)
                        Text("\(vm.activeFarm.id) · \(health.compactPillText())")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.white)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.white.opacity(0.12), in: Capsule())
                }
            }

            Spacer()

            Button {
                vm.showStoreSheet = true
            } label: {
                Label("\(vm.coinBalance)", systemImage: "bitcoinsign.circle.fill")
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.yellow.opacity(0.18), in: Capsule())
                    .foregroundStyle(.yellow)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(red: 0.06, green: 0.09, blue: 0.16))
    }

    private var homeView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("게임 플레이 런타임 전용 iOS 허브 (PlayForge 미포함)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text("엔진: Godot \(vm.engineVersion) 내장 · 스타터 게임 0종 (100% On-Demand .pck)")
                    .font(.subheadline.weight(.medium))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }

    private var moreView: some View {
        List {
            Section("런타임 정보") {
                LabeledContent("Bundle ID", value: Bundle.main.bundleIdentifier ?? "unknown")
                LabeledContent("Engine", value: "Godot \(vm.engineVersion) (release XCFramework)")
                LabeledContent("Forge 포함 여부", value: "미포함 (Runtime Only)")
                LabeledContent("내장 스타터 게임", value: "0종 (100% On-Demand)")
            }
            Section("결제 · 공용 코인 지갑 (Roblox/UEFN Shared Wallet)") {
                Button("Play Coin & Play Pass 스토어") { vm.showStoreSheet = true }
                Button("구매 복원 (Restore Purchases)") {
                    Task { await store.restorePurchases() }
                }
            }
            if vm.allowFarmSelector {
                Section("개발 / 테스트 서버군") {
                    Button("Farm 서버군 선택 (\(vm.activeFarm.label))") {
                        vm.showFarmSheet = true
                        Task { await vm.refreshFarmHealth() }
                    }
                }
            }
            Section("계정 및 개인정보 (Apple 5.1.1(v))") {
                Button("인앱 계정 삭제 요청", role: .destructive) {}
            }
        }
    }

    private var farmSelectorSheet: some View {
        NavigationStack {
            List(vm.selectableFarms()) { cluster in
                let result = vm.farmHealth[cluster.id] ?? FarmHealthResult(status: .checking)
                Button {
                    vm.selectFarm(cluster)
                    vm.showFarmSheet = false
                } label: {
                    HStack {
                        Circle()
                            .fill(colorForStatus(result.status))
                            .frame(width: 10, height: 10)
                        VStack(alignment: .leading) {
                            Text(cluster.label).font(.body.weight(.semibold))
                            Text(cluster.baseUrl).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(result.badgeLabel()).font(.caption.monospacedDigit())
                    }
                }
            }
            .navigationTitle("Farm 서버군 상태")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("새로고침") {
                        Task { await vm.refreshFarmHealth() }
                    }
                }
            }
        }
    }

    private var storeSheet: some View {
        NavigationStack {
            List {
                Section("Play Coin 공용 지갑 (Web · Android · iOS 공유)") {
                    Text("현재 잔액: \(vm.coinBalance) Play Coin")
                    ForEach(store.products, id: \.id) { product in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(product.displayName).font(.headline)
                                Text(product.description).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(product.displayPrice) {
                                Task {
                                    await store.purchase(product, principalUuid: nil) { _ in }
                                }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                }
                Section {
                    Button("구매 복원 (AppStore.sync)") {
                        Task { await store.restorePurchases() }
                    }
                }
            }
            .navigationTitle("Play Coin 스토어")
            .task { await store.loadProducts() }
        }
    }

    private func placeholderTab(title: String, subtitle: String) -> some View {
        VStack(spacing: 8) {
            Text(title).font(.title2.bold())
            Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private func colorForStatus(_ status: FarmHealthStatus) -> Color {
        switch status {
        case .checking: return .gray
        case .green: return Color(red: 0.13, green: 0.77, blue: 0.37)
        case .yellow: return Color(red: 0.92, green: 0.70, blue: 0.03)
        case .orange: return Color(red: 0.98, green: 0.45, blue: 0.09)
        case .red: return Color(red: 0.94, green: 0.27, blue: 0.27)
        }
    }
}
