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
    @Published public var ageGateCompleted: Bool
    @Published public var ageTier: AgeTier
    @Published public var regionCode: String = "KR"
    @Published public var coinBalance: Int = 0
    @Published public var activeFarm: FarmCluster
    @Published public var farmHealth: [String: FarmHealthResult] = [:]
    @Published public var customFarmUrlInput: String = ""
    @Published public var customFarmError: String?
    @Published public var showFarmSheet: Bool = false
    @Published public var showStoreSheet: Bool = false
    @Published public var syncStatusText: String = "오프라인 기본 카탈로그"
    @Published public var catalogGames: [MobileCatalogGame] = []
    @Published public var incompatibilityAlert: VersionCompatibilityResult?
    @Published public var activeGameTitle: String?
    @Published public var showGameModal: Bool = false
    @Published public var showUniversalOverlay: Bool = false

    // MARK: M3 Social State
    @Published public var socialProfile: SocialProfile?
    @Published public var socialFriends: [SocialFriend] = []
    @Published public var incomingRequests: [SocialFriendRequest] = []
    @Published public var activeParty: SocialParty?
    @Published public var quickMessages: [SocialQuickMessage] = []
    @Published public var socialToast: String?
    @Published public var leaderboardGame: MobileCatalogGame?
    private var accessTokenCache: String?

    public let buildStage: String
    public let allowFarmSelector: Bool
    public let defaultHubUrl: String
    public let engineVersion: String
    public let appBuildNumber: Int
    public let isFreeUsbMode: Bool

    public init() {
        let info = Bundle.main.infoDictionary ?? [:]
        self.buildStage = (info["PlayHubBuildStage"] as? String) ?? "debug"
        self.defaultHubUrl = (info["PlayHubDefaultHubUrl"] as? String) ?? "http://127.0.0.1:18130"
        self.engineVersion = (info["PlayHubEngineVersion"] as? String) ?? "4.7.2"
        self.appBuildNumber = Int((info["CFBundleVersion"] as? String) ?? "1") ?? 1

        #if PLAYHUB_FREE_USB
        self.isFreeUsbMode = true
        #else
        self.isFreeUsbMode = (info["PlayHubFreeUsbMode"] as? Bool) ?? false
        #endif

        #if ALLOW_FARM_SELECTOR
        let compileFlag = true
        #else
        let compileFlag = false
        #endif
        self.allowFarmSelector = FarmServerRegistry.isSelectorAllowed(buildStage: buildStage, allowFlag: compileFlag)

        let savedTierRaw = UserDefaults.standard.string(forKey: "playhub_age_tier")
        let savedTier = savedTierRaw.flatMap(AgeTier.init(rawValue:)) ?? .unknown
        self.ageTier = savedTier
        self.ageGateCompleted = savedTier != .unknown

        let savedCustom = UserDefaults.standard.string(forKey: "playhub_custom_farm_url")
        self.customFarmUrlInput = savedCustom ?? ""
        self.activeFarm = FarmServerRegistry.resolveActiveCluster(
            buildStage: buildStage,
            allowFlag: self.allowFarmSelector,
            defaultBaseUrl: defaultHubUrl,
            selectedFarmId: UserDefaults.standard.string(forKey: "playhub_selected_farm_id"),
            customUrl: savedCustom
        )
        self.catalogGames = Self.fallbackDemoCatalog()
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
        Task {
            await syncOnlineCatalog()
        }
    }

    public func applyCustomFarmUrl() -> Bool {
        guard allowFarmSelector else { return false }
        do {
            let normalized = try FarmServerRegistry.normalizeCustomUrl(customFarmUrlInput)
            customFarmError = nil
            let custom = FarmCluster(id: FarmServerRegistry.customFarmId, label: "Custom / Tunnel", baseUrl: normalized)
            selectFarm(custom)
            return true
        } catch {
            customFarmError = error.localizedDescription
            return false
        }
    }

    public func completeAgeGate(birthYear: Int, birthMonth: Int, region: String) {
        let now = Calendar.current.dateComponents([.year, .month], from: Date())
        let tier = AgeGatePolicy.classify(
            birthYear: birthYear,
            birthMonth: birthMonth,
            nowYear: now.year ?? 2026,
            nowMonth: now.month ?? 11,
            regionCode: region
        )
        regionCode = region
        ageTier = tier
        ageGateCompleted = tier != .unknown
        UserDefaults.standard.set(tier.rawValue, forKey: "playhub_age_tier")
        Task {
            if let token = await ensureAccessToken() {
                _ = try? await makeApiClient().submitAgeGate(
                    birthYear: birthYear,
                    birthMonth: birthMonth,
                    regionCode: region,
                    accessToken: token
                )
                await syncSocial()
            }
        }
    }

    public func syncOnlineCatalog() async {
        syncStatusText = "서버 동기화 중 (\(activeFarm.id))..."
        let client = PlayHubApiClient(
            baseUrl: activeFarm.baseUrl,
            engineVersion: engineVersion,
            appBuildNumber: appBuildNumber
        )
        do {
            let token: String?
            if let existing = KeychainStore.load(forKey: "access_token") {
                token = existing
            } else {
                let auth = try await client.loginGuest()
                try? KeychainStore.save(auth.accessToken, forKey: "access_token")
                try? KeychainStore.save(auth.refreshToken, forKey: "refresh_token")
                token = auth.accessToken
            }
            self.accessTokenCache = token
            let catalog = try await client.fetchCatalog(accessToken: token)
            if !catalog.games.isEmpty {
                catalogGames = catalog.games
                syncStatusText = "온라인 동기화 완료 (\(catalog.games.count)종 · \(activeFarm.id))"
            } else {
                syncStatusText = "연결됨 · 등록 게임 없음 (\(activeFarm.id))"
            }
            await syncSocial()
        } catch {
            catalogGames = Self.fallbackDemoCatalog()
            syncStatusText = "오프라인 데모 모드 (\(activeFarm.id) 미연결)"
        }
    }

    // MARK: - M3 Social Actions

    private func makeApiClient() -> PlayHubApiClient {
        PlayHubApiClient(
            baseUrl: activeFarm.baseUrl,
            engineVersion: engineVersion,
            appBuildNumber: appBuildNumber
        )
    }

    private func isJwtExpired(_ jwt: String) -> Bool {
        let parts = jwt.split(separator: ".")
        guard parts.count >= 2 else { return true }
        var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = obj["exp"] as? Double else { return true }
        return Date(timeIntervalSince1970: exp) <= Date().addingTimeInterval(30)
    }

    private func ensureAccessToken() async -> String? {
        if let cached = accessTokenCache ?? KeychainStore.load(forKey: "access_token"),
           !cached.isEmpty,
           !isJwtExpired(cached) {
            accessTokenCache = cached
            return cached
        }
        if let refresh = KeychainStore.load(forKey: "refresh_token"), !refresh.isEmpty,
           let refreshed = try? await makeApiClient().refreshSession(refreshToken: refresh) {
            try? KeychainStore.save(refreshed.accessToken, forKey: "access_token")
            try? KeychainStore.save(refreshed.refreshToken, forKey: "refresh_token")
            accessTokenCache = refreshed.accessToken
            return refreshed.accessToken
        }
        do {
            let auth = try await makeApiClient().loginGuest()
            try? KeychainStore.save(auth.accessToken, forKey: "access_token")
            try? KeychainStore.save(auth.refreshToken, forKey: "refresh_token")
            accessTokenCache = auth.accessToken
            return auth.accessToken
        } catch {
            return nil
        }
    }

    public func showSocialToast(_ message: String) {
        socialToast = message
        Task {
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            if socialToast == message { socialToast = nil }
        }
    }

    public func syncSocial() async {
        guard let token = await ensureAccessToken() else { return }
        let client = makeApiClient()
        do {
            async let profTask = client.fetchSocialProfile(accessToken: token)
            async let friendsTask = client.fetchSocialFriends(accessToken: token)
            async let partyTask = client.fetchMyParty(accessToken: token)
            async let qmTask = client.fetchQuickMessages()
            let (prof, fr, party, qm) = try await (profTask, friendsTask, partyTask, qmTask)
            socialProfile = prof
            socialFriends = fr.friends
            incomingRequests = fr.incomingRequests
            activeParty = party
            quickMessages = qm
            _ = try? await client.updatePresence(status: showGameModal ? "in_game" : "online", accessToken: token)
        } catch {
            // Keep existing local state on transient network failure
        }
    }

    public func searchUsers(query: String) async -> [SocialUserHit] {
        guard let token = await ensureAccessToken() else { return [] }
        do {
            return try await makeApiClient().searchSocialUsers(query: query, accessToken: token)
        } catch {
            showSocialToast("검색 실패: \(error.localizedDescription)")
            return []
        }
    }

    public func sendFriendRequest(targetPrincipalId: String) async {
        guard let token = await ensureAccessToken() else { return }
        do {
            let res = try await makeApiClient().sendFriendRequest(targetPrincipalId: targetPrincipalId, accessToken: token)
            showSocialToast(res.status == "accepted" ? "서로 친구가 되었습니다!" : "친구 요청을 보냈습니다.")
            await syncSocial()
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func respondFriendRequest(requesterId: String, accept: Bool) async {
        guard let token = await ensureAccessToken() else { return }
        do {
            _ = try await makeApiClient().respondFriendRequest(
                requesterId: requesterId,
                action: accept ? "accept" : "decline",
                accessToken: token
            )
            showSocialToast(accept ? "친구 요청을 수락했습니다." : "친구 요청을 거절했습니다.")
            await syncSocial()
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func createParty(title: String?, targetGameId: String?) async {
        guard let token = await ensureAccessToken() else { return }
        do {
            let party = try await makeApiClient().createParty(title: title, targetGameId: targetGameId, accessToken: token)
            activeParty = party
            showSocialToast("파티 생성 완료! 코드 \(party.roomCode)")
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func joinParty(roomCode: String) async {
        guard let token = await ensureAccessToken() else { return }
        do {
            let party = try await makeApiClient().joinParty(roomCode: roomCode, accessToken: token)
            activeParty = party
            selectedTab = .party
            showSocialToast("\(party.title)에 합류했습니다!")
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func togglePartyReady(ready: Bool) async {
        guard let token = await ensureAccessToken(), let partyId = activeParty?.id else { return }
        do {
            activeParty = try await makeApiClient().setPartyReady(partyId: partyId, ready: ready, accessToken: token)
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func leaveParty() async {
        guard let token = await ensureAccessToken(), let partyId = activeParty?.id else { return }
        do {
            try await makeApiClient().leaveParty(partyId: partyId, accessToken: token)
            activeParty = nil
            showSocialToast("파티에서 나갔습니다.")
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func launchPartyTogether(game: MobileCatalogGame) async {
        guard let token = await ensureAccessToken(), let partyId = activeParty?.id else {
            attemptLaunch(game)
            return
        }
        do {
            let res = try await makeApiClient().launchParty(
                partyId: partyId,
                gameId: game.id,
                gameTitle: game.title,
                accessToken: token
            )
            if let party = res.party { activeParty = party }
            let roomSuffix = res.launch.map { " · \($0.matchRoomId)" } ?? ""
            activeGameTitle = "\(game.title)\(roomSuffix)"
            showGameModal = true
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func ackAndJoinLaunch(_ launch: SocialPartyLaunch) async {
        guard let token = await ensureAccessToken(), let partyId = activeParty?.id else { return }
        let game = catalogGames.first(where: { $0.id == launch.gameId }) ?? catalogGames.first
        do {
            let res = try await makeApiClient().ackPartyLaunch(
                partyId: partyId,
                launchId: launch.launchId,
                state: "entered",
                gameTitle: game?.title,
                accessToken: token
            )
            if let party = res.party { activeParty = party }
        } catch {
            showSocialToast(error.localizedDescription)
        }
        activeGameTitle = "\(game?.title ?? launch.gameId) · \(launch.matchRoomId)"
        showGameModal = true
    }

    public func loadMessages(for target: SocialChatTarget) async -> [SocialMessage] {
        guard let token = await ensureAccessToken() else { return [] }
        do {
            switch target {
            case let .dm(friend):
                return try await makeApiClient().fetchSocialMessages(channelType: "dm", peerId: friend.principalId, accessToken: token)
            case let .party(party):
                return try await makeApiClient().fetchSocialMessages(channelType: "party", partyId: party.id, accessToken: token)
            }
        } catch {
            showSocialToast(error.localizedDescription)
            return []
        }
    }

    public func sendMessage(target: SocialChatTarget, bodyText: String?, quickMessageId: String?) async {
        guard let token = await ensureAccessToken() else { return }
        do {
            switch target {
            case let .dm(friend):
                _ = try await makeApiClient().sendSocialMessage(
                    channelType: "dm",
                    peerId: friend.principalId,
                    bodyText: bodyText,
                    quickMessageId: quickMessageId,
                    accessToken: token
                )
            case let .party(party):
                _ = try await makeApiClient().sendSocialMessage(
                    channelType: "party",
                    partyId: party.id,
                    bodyText: bodyText,
                    quickMessageId: quickMessageId,
                    accessToken: token
                )
            }
            await syncSocial()
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func reportUser(targetId: String, reason: String) async {
        guard let token = await ensureAccessToken() else { return }
        do {
            _ = try await makeApiClient().reportSocialTarget(targetType: "user", targetId: targetId, reason: reason, accessToken: token)
            showSocialToast("신고가 접수되었습니다.")
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func blockUser(targetPrincipalId: String) async {
        guard let token = await ensureAccessToken() else { return }
        do {
            try await makeApiClient().blockUser(targetPrincipalId: targetPrincipalId, accessToken: token)
            showSocialToast("사용자를 차단했습니다.")
            await syncSocial()
        } catch {
            showSocialToast(error.localizedDescription)
        }
    }

    public func loadLeaderboard(gameId: String, scope: String = "global") async -> [SocialLeaderboardEntry] {
        let token = await ensureAccessToken()
        do {
            let res = try await makeApiClient().fetchLeaderboard(gameId: gameId, scope: scope, limit: 20, accessToken: token)
            return res.entries
        } catch {
            return []
        }
    }

    public func handleDeepLink(_ url: URL) {
        guard let link = PlayHubJoinDeepLink.parse(url) else { return }
        Task {
            if let code = link.roomCode {
                await joinParty(roomCode: code)
            }
            if let gameId = link.gameId, let game = catalogGames.first(where: { $0.id == gameId }) {
                attemptLaunch(game)
            }
        }
    }

    public func compatibilityFor(_ game: MobileCatalogGame) -> VersionCompatibilityResult {
        if let serverCompat = game.compatibility, !serverCompat.compatible {
            let reason = CompatibilityReason(rawValue: serverCompat.reason ?? "") ?? .engineUpdateRequired
            return VersionCompatibilityResult(
                compatible: false,
                reason: reason,
                badgeText: "⚠️ 업데이트 필요",
                detailMessage: serverCompat.message ?? "앱 또는 내장 엔진 업데이트가 필요합니다."
            )
        }
        let requiredEngine = game.id == "nextgen-48-demo" ? "4.8.0" : "4.7.2"
        return VersionCompatibilityChecker.evaluate(
            runtime: game.runtime,
            requiredEngineVersion: requiredEngine,
            minAppBuildNumber: 1,
            installedEngineVersion: engineVersion,
            installedAppBuildNumber: appBuildNumber
        )
    }

    public func attemptLaunch(_ game: MobileCatalogGame) {
        let compat = compatibilityFor(game)
        if !compat.compatible {
            incompatibilityAlert = compat
            return
        }
        activeGameTitle = game.title
        showGameModal = true
        Task {
            if let token = await ensureAccessToken() {
                _ = try? await makeApiClient().updatePresence(
                    status: "in_game",
                    gameId: game.id,
                    gameTitle: game.title,
                    roomCode: activeParty?.roomCode,
                    accessToken: token
                )
            }
        }
    }

    private static func fallbackDemoCatalog() -> [MobileCatalogGame] {
        [
            MobileCatalogGame(
                id: "survivor-arena-g2",
                title: "Survivor Arena G2",
                description: "Godot 4.7.2 3D 서바이벌 아레나 (On-Demand 1.87 MiB .pck)",
                genre: "액션",
                runtime: "godot-pck",
                ageRating: "ALL",
                allowed: true,
                compatibility: MobileCatalogGameCompatibility(compatible: true, reason: nil, message: nil),
                entryUrl: "/games/survivor-arena-g2/index.pck",
                coverUrl: nil
            ),
            MobileCatalogGame(
                id: "nextgen-48-demo",
                title: "NextGen 3D Arena (Godot 4.8)",
                description: "진입 전 엔진 버전 호환성 사전 차단 확인용 샘플",
                genre: "액션",
                runtime: "godot-pck",
                ageRating: "12+",
                allowed: true,
                compatibility: MobileCatalogGameCompatibility(
                    compatible: false,
                    reason: "ENGINE_UPDATE_REQUIRED",
                    message: "상위 Godot 엔진이 필요합니다 (게임 요구 4.8.0, 앱 내장 4.7.2)."
                ),
                entryUrl: nil,
                coverUrl: nil
            )
        ]
    }
}

public struct MainTabView: View {
    @ObservedObject private var vm: PlayHubShellViewModel
    @StateObject private var store = StoreKit2Manager()

    public init(vm: PlayHubShellViewModel = PlayHubShellViewModel()) {
        self.vm = vm
    }

    public var body: some View {
        VStack(spacing: 0) {
            topUtilityBar
            TabView(selection: $vm.selectedTab) {
                homeView.tabItem { Label(PlayHubTab.home.title, systemImage: PlayHubTab.home.systemImage) }.tag(PlayHubTab.home)
                placeholderTab(title: "차트", subtitle: "인기 · 급상승 · 신규 게임 랭킹").tabItem { Label(PlayHubTab.charts.title, systemImage: PlayHubTab.charts.systemImage) }.tag(PlayHubTab.charts)
                placeholderTab(title: "아바타", subtitle: "코스메틱 꾸미기 · 인벤토리 · 샵").tabItem { Label(PlayHubTab.avatar.title, systemImage: PlayHubTab.avatar.systemImage) }.tag(PlayHubTab.avatar)
                SocialHubView(vm: vm)
                    .tabItem { Label(PlayHubTab.party.title, systemImage: PlayHubTab.party.systemImage) }
                    .badge(vm.incomingRequests.count)
                    .tag(PlayHubTab.party)
                moreView.tabItem { Label(PlayHubTab.more.title, systemImage: PlayHubTab.more.systemImage) }.tag(PlayHubTab.more)
            }
            .tint(Color(red: 0.0, green: 0.69, blue: 0.435))
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $vm.showFarmSheet) { farmSelectorSheet }
        .sheet(isPresented: $vm.showStoreSheet) { storeSheet }
        .sheet(item: $vm.leaderboardGame) { game in
            GameLeaderboardSheet(vm: vm, game: game)
        }
        .sheet(isPresented: Binding(get: { !vm.ageGateCompleted }, set: { _ in })) {
            NeutralAgeGateSheet(onSubmit: vm.completeAgeGate)
                .interactiveDismissDisabled(true)
        }
        .fullScreenCover(isPresented: $vm.showGameModal) {
            GodotGameHostContainer(
                gameTitle: vm.activeGameTitle ?? "Play Hub Game",
                showOverlay: $vm.showUniversalOverlay,
                onLeave: {
                    vm.showUniversalOverlay = false
                    vm.showGameModal = false
                    Task { await vm.syncSocial() }
                }
            )
        }
        .alert(
            "버전 호환성 안내",
            isPresented: Binding(
                get: { vm.incompatibilityAlert != nil },
                set: { if !$0 { vm.incompatibilityAlert = nil } }
            ),
            presenting: vm.incompatibilityAlert
        ) { _ in
            Button("확인", role: .cancel) { vm.incompatibilityAlert = nil }
        } message: { info in
            Text(info.detailMessage ?? "앱 또는 엔진 업데이트가 필요합니다.")
        }
        .task {
            await vm.refreshFarmHealth()
            await vm.syncOnlineCatalog()
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
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(vm.syncStatusText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("새로고침") {
                        Task {
                            await vm.refreshFarmHealth()
                            await vm.syncOnlineCatalog()
                        }
                    }
                    .font(.caption.bold())
                }

                if vm.isFreeUsbMode {
                    Label("무료 Apple ID USB 테스트 모드 (Guest · Farm · 로컬 StoreKit · Godot 런타임 활성)", systemImage: "cable.connector")
                        .font(.caption2)
                        .foregroundStyle(Color(red: 0.52, green: 0.85, blue: 1.0))
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.blue.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
                }

                ForEach(vm.catalogGames) { game in
                    let compat = vm.compatibilityFor(game)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(game.title).font(.headline)
                            Spacer()
                            Text(game.ageRating)
                                .font(.caption2.bold())
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Color.white.opacity(0.12), in: Capsule())
                        }
                        if let desc = game.description {
                            Text(desc).font(.caption).foregroundStyle(.secondary)
                        }
                        if let badge = compat.badgeText {
                            Text(badge)
                                .font(.caption.bold())
                                .foregroundStyle(.orange)
                        }
                        HStack(spacing: 8) {
                            Button {
                                vm.attemptLaunch(game)
                            } label: {
                                Label(compat.compatible ? "▶ 플레이" : "버전 안내 보기", systemImage: compat.compatible ? "play.fill" : "exclamationmark.triangle.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(compat.compatible ? Color(red: 0.0, green: 0.69, blue: 0.435) : .orange)

                            Button {
                                vm.leaderboardGame = game
                            } label: {
                                Image(systemName: "trophy.fill")
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(14)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                }
            }
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
                if vm.isFreeUsbMode {
                    LabeledContent("서명 모드", value: "무료 Apple ID (USB 7일 갱신)")
                }
                LabeledContent("연령 티어", value: vm.ageTier.rawValue)
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
                if vm.isFreeUsbMode {
                    Text("Sign in with Apple / APNs는 유료 Developer(\$99/년) 전환 시 활성화됩니다.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Button("연령 게이트 다시 테스트") {
                    vm.ageGateCompleted = false
                    vm.ageTier = .unknown
                    UserDefaults.standard.removeObject(forKey: "playhub_age_tier")
                }
                Button("인앱 계정 삭제 요청", role: .destructive) {}
            }
        }
    }

    private var farmSelectorSheet: some View {
        NavigationStack {
            List {
                Section("프리셋 및 활성 서버군 (GET /api/health 병렬 측정)") {
                    ForEach(vm.selectableFarms()) { cluster in
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
                }
                Section("Custom / Cloudflare HTTPS 터널 URL 직접 입력") {
                    TextField("https://xxxx.trycloudflare.com", text: $vm.customFarmUrlInput)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    if let err = vm.customFarmError {
                        Text(err).font(.caption).foregroundStyle(.red)
                    }
                    Button("Custom URL 적용 및 동기화") {
                        if vm.applyCustomFarmUrl() {
                            vm.showFarmSheet = false
                        }
                    }
                    .buttonStyle(.borderedProminent)
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
                    if let msg = store.lastStatusMessage {
                        Text(msg).font(.caption).foregroundStyle(.cyan)
                    }
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

private struct NeutralAgeGateSheet: View {
    let onSubmit: (Int, Int, String) -> Void

    @State private var selectedYear: Int? = nil
    @State private var selectedMonth: Int? = nil
    @State private var region: String = "KR"

    var body: some View {
        NavigationStack {
            Form {
                Section("중립적 연령 확인 (Guest 즉시 플레이)") {
                    Text("로그인 없이 게스트로 바로 플레이할 수 있으며, 국내외 아동·청소년 보호 법령 준수를 위해 출생 연월을 선택해 주세요.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Picker("국가/지역", selection: $region) {
                        Text("대한민국 (KR)").tag("KR")
                        Text("미국/글로벌 (US)").tag("US")
                        Text("독일/EU (DE)").tag("DE")
                    }
                    Picker("출생 연도", selection: $selectedYear) {
                        Text("선택해 주세요").tag(Optional<Int>.none)
                        ForEach((1940...2026).reversed(), id: \.self) { y in
                            Text("\(y)년").tag(Optional(y))
                        }
                    }
                    Picker("출생 월", selection: $selectedMonth) {
                        Text("선택해 주세요").tag(Optional<Int>.none)
                        ForEach(1...12, id: \.self) { m in
                            Text("\(m)월").tag(Optional(m))
                        }
                    }
                }
                Section {
                    Button("Guest로 즉시 시작") {
                        if let y = selectedYear, let m = selectedMonth {
                            onSubmit(y, m, region)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .disabled(selectedYear == nil || selectedMonth == nil)
                }
            }
            .navigationTitle("Play Hub 연령 확인")
        }
    }
}

private struct GodotGameHostContainer: View {
    let gameTitle: String
    @Binding var showOverlay: Bool
    let onLeave: () -> Void

    var body: some View {
        ZStack {
            GodotViewRepresentable(gameTitle: gameTitle, onOpenOverlay: { showOverlay = true })
                .ignoresSafeArea()
        }
        .sheet(isPresented: $showOverlay) {
            NavigationStack {
                List {
                    Section("유니버설 인게임 오버레이") {
                        Label("People · 친구/파티 초대", systemImage: "person.2.fill")
                        Label("Store · Play Coin 즉시 충전", systemImage: "bitcoinsign.circle.fill")
                        Label("Settings · 볼륨 · 절전 · 햅틱", systemImage: "slider.horizontal.3")
                    }
                    Section {
                        Button("클라우드 즉시 저장 (host_snapshot)") { showOverlay = false }
                        Button("허브로 나가기 (Leave · Clean Reset)", role: .destructive) { onLeave() }
                    }
                }
                .navigationTitle(gameTitle)
            }
            .presentationDetents([.medium])
        }
    }
}

private struct GodotViewRepresentable: UIViewControllerRepresentable {
    let gameTitle: String
    let onOpenOverlay: () -> Void

    func makeUIViewController(context: Context) -> GodotGameViewController {
        GodotGameViewController(gameTitle: gameTitle, onOpenOverlay: onOpenOverlay)
    }

    func updateUIViewController(_ uiViewController: GodotGameViewController, context: Context) {}
}
