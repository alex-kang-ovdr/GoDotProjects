import PlayHubCore
import SwiftUI

/// Stitch Dark Modern Design System tokens — 100% aligned with Hub-AOS `StitchColors`.
enum HubStitchTheme {
    static let surface = Color(red: 0.098, green: 0.106, blue: 0.114)          // #191B1D
    static let surfaceLowest = Color(red: 0.067, green: 0.075, blue: 0.082)    // #111315
    static let surfaceLow = Color(red: 0.122, green: 0.133, blue: 0.145)       // #1F2225
    static let surfaceContainer = Color(red: 0.137, green: 0.149, blue: 0.161) // #232629
    static let surfaceHigh = Color(red: 0.169, green: 0.180, blue: 0.196)      // #2B2E32
    static let outlineVariant = Color(red: 0.204, green: 0.220, blue: 0.235)   // #34383C
    static let onSurface = Color.white                                         // #FFFFFF
    static let onSurfaceVariant = Color(red: 0.667, green: 0.671, blue: 0.678) // #AAABAD
    static let playGreen = Color(red: 0.0, green: 0.690, blue: 0.435)          // #00B06F
    static let onPlayGreen = Color(red: 0.0, green: 0.129, blue: 0.067)        // #002111
    static let playGreenDark = Color(red: 0.0, green: 0.322, blue: 0.192)      // #005231
    static let playGreenTint = Color(red: 0.753, green: 1.0, blue: 0.839)      // #C0FFD6
    static let onlineDot = Color(red: 0.0, green: 0.886, blue: 0.565)          // #00E290
    static let coinGold = Color(red: 1.0, green: 0.820, blue: 0.278)           // #FFD147
    static let errorRed = Color(red: 1.0, green: 0.443, blue: 0.424)           // #FF716C
    static let warnAmber = Color(red: 0.961, green: 0.620, blue: 0.043)        // #F59E0B

    static func color(fromHex hex: String, fallback: Color = playGreen) -> Color {
        let clean = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard clean.count == 6, let val = UInt64(clean, radix: 16) else { return fallback }
        return Color(
            red: Double((val >> 16) & 0xFF) / 255.0,
            green: Double((val >> 8) & 0xFF) / 255.0,
            blue: Double(val & 0xFF) / 255.0
        )
    }

    static func statusColor(_ status: FarmHealthStatus) -> Color {
        switch status {
        case .checking: return Color(red: 0.39, green: 0.45, blue: 0.55)
        case .green: return Color(red: 0.133, green: 0.773, blue: 0.369)
        case .yellow: return Color(red: 0.918, green: 0.702, blue: 0.031)
        case .orange: return Color(red: 0.976, green: 0.451, blue: 0.086)
        case .red: return Color(red: 0.937, green: 0.267, blue: 0.267)
        }
    }

    static func formatCoin(_ balance: Int) -> String {
        let fmt = NumberFormatter()
        fmt.numberStyle = .decimal
        return fmt.string(from: NSNumber(value: balance)) ?? "\(balance)"
    }
}

// MARK: - Top Global Utility Bar (Matches Hub-AOS `buildRootLayout` 1:1)

public struct HubTopUtilityBar: View {
    @ObservedObject var vm: PlayHubShellViewModel

    public var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                // Brand cluster: Logo badge + PLAY(white)HUB(green)
                Button {
                    vm.selectedTab = .home
                } label: {
                    HStack(spacing: 6) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 7)
                                .fill(HubStitchTheme.playGreen)
                                .frame(width: 26, height: 26)
                            Image(systemName: "play.fill")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(HubStitchTheme.onPlayGreen)
                        }
                        HStack(spacing: 0) {
                            Text("PLAY").foregroundStyle(.white)
                            Text("HUB").foregroundStyle(HubStitchTheme.playGreen)
                        }
                        .font(.system(size: 16.5, weight: .black))
                        .tracking(-0.4)
                    }
                }
                .buttonStyle(.plain)

                Spacer(minLength: 4)

                // Farm 4-color live status pill (debug/dev/test only)
                if vm.allowFarmSelector {
                    let health = vm.farmHealth[vm.activeFarm.id] ?? FarmHealthResult(status: .checking)
                    let ringColor = HubStitchTheme.statusColor(health.status)
                    Button {
                        vm.showFarmSheet = true
                        Task { await vm.refreshFarmHealth() }
                    } label: {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(ringColor)
                                .frame(width: 7, height: 7)
                            Text("\(vm.activeFarm.id)·\(health.compactPillText())")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(HubStitchTheme.surfaceContainer, in: Capsule())
                        .overlay(Capsule().stroke(ringColor, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }

                // Search toggle circular button
                Button {
                    if vm.selectedTab == .charts {
                        vm.searchOpen = false
                    } else {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            vm.searchOpen.toggle()
                        }
                        if !vm.searchOpen && !vm.searchQuery.isEmpty {
                            vm.searchQuery = ""
                        }
                    }
                } label: {
                    Image(systemName: vm.searchOpen ? "xmark" : "magnifyingglass")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(HubStitchTheme.surfaceContainer, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("검색")

                // Notification bell circular button (with PlayGreen badge dot)
                Button {
                    let reqCount = vm.incomingRequests.count
                    if reqCount > 0 {
                        vm.showSocialToast("새 친구 요청 \(reqCount)건이 있습니다. 채팅 탭에서 확인하세요.")
                        vm.selectedTab = .party
                        Task { await vm.syncSocial() }
                    } else {
                        let partyInfo = vm.activeParty?.roomCode ?? "없음"
                        vm.showSocialToast("현재 활성 파티: \(partyInfo) · 친구 \(vm.socialFriends.count)명")
                    }
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(HubStitchTheme.surfaceContainer, in: Circle())
                        Circle()
                            .fill(HubStitchTheme.playGreen)
                            .frame(width: 7, height: 7)
                            .offset(x: -7, y: 7)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("알림")

                // Coin Pill
                Button {
                    vm.showStoreSheet = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bitcoinsign.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(HubStitchTheme.coinGold)
                        Text(HubStitchTheme.formatCoin(vm.coinBalance))
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(HubStitchTheme.surfaceHigh, in: Capsule())
                    .overlay(Capsule().stroke(HubStitchTheme.outlineVariant, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("코인 잔액")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Inline Search Row (shown when search icon tapped on Home)
            if vm.searchOpen && vm.selectedTab == .home {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                    TextField("게임, 장르 검색...", text: $vm.searchQuery)
                        .font(.system(size: 14))
                        .foregroundStyle(.white)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !vm.searchQuery.isEmpty {
                        Button {
                            vm.searchQuery = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(HubStitchTheme.surfaceHigh, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(HubStitchTheme.outlineVariant, lineWidth: 1))
                .padding(.horizontal, 16)
                .padding(.bottom, 10)
            }

            Rectangle()
                .fill(HubStitchTheme.outlineVariant)
                .frame(height: 1)
        }
        .background(HubStitchTheme.surface)
    }
}

// MARK: - 1. HOME TAB (Matches Hub-AOS `buildHomeTab` 1:1)

public struct HubHomeTabView: View {
    @ObservedObject var vm: PlayHubShellViewModel

    public var body: some View {
        let caps = AgeGatePolicy.evaluateCapabilities(
            tier: vm.ageTier,
            isGuest: vm.authProvider == "guest",
            parentalConsentVerified: vm.parentalConsentVerified
        )
        let onlineCount = vm.socialFriends.filter { $0.presence.online }.count
        let games = vm.filteredCatalog(applyCategory: false)
        let playingFriends = vm.socialFriends.filter {
            $0.presence.status == "in_game" && !($0.presence.gameId ?? "").isEmpty
        }

        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                if let toast = vm.socialToast {
                    Text(toast)
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(HubStitchTheme.playGreen.opacity(0.24), in: RoundedRectangle(cornerRadius: 10))
                        .padding(.horizontal, 16)
                        .padding(.top, 10)
                }

                // Section 1: Live Friends Strip
                sectionHeader(
                    title: "친구",
                    monoAccent: caps.requiresParentalConsent ? "보호 모드" : "\(onlineCount)명 접속 중",
                    actionLabel: "소셜 · 파티"
                ) {
                    vm.selectedTab = .party
                    Task { await vm.syncSocial() }
                }
                liveFriendsStrip(childProtected: caps.requiresParentalConsent)

                // Section 2: Recommended Games Carousel
                sectionHeader(title: "추천 게임", actionLabel: "더보기") {
                    vm.selectedTab = .charts
                }
                if games.isEmpty {
                    emptyCatalogCard
                        .padding(.horizontal, 16)
                } else {
                    gameCarousel(games: games, showPlayButton: true, showFriendTag: false, playingFriends: [])
                }

                // Section 3: Friends Are Playing Carousel
                if !caps.requiresParentalConsent && !games.isEmpty {
                    sectionHeader(title: "친구들이 플레이 중", actionLabel: "파티 합류") {
                        vm.selectedTab = .party
                        Task { await vm.syncSocial() }
                    }
                    gameCarousel(games: games, showPlayButton: false, showFriendTag: true, playingFriends: playingFriends)
                }

                // Section 4: Trending Carousel
                if !games.isEmpty {
                    sectionHeader(title: "인기 급상승", actionLabel: "더보기") {
                        vm.selectedTab = .charts
                    }
                    gameCarousel(games: games.reversed(), showPlayButton: false, showFriendTag: false, playingFriends: [])
                }

                // Section 5: Bottom Profile & Sync Status Card
                profileStatusCard
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 26)
            }
        }
        .background(HubStitchTheme.surface)
        .refreshable {
            await vm.refreshFarmHealth()
            await vm.syncOnlineCatalog()
            await vm.syncSocial()
        }
    }

    private func liveFriendsStrip(childProtected: Bool) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                if childProtected {
                    Button {
                        vm.selectedTab = .party
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                            Text("아동 보호 모드: 법정대리인 동의 후 안전 소셜 기능이 활성화됩니다.")
                                .font(.system(size: 12))
                                .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(HubStitchTheme.surfaceContainer, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(HubStitchTheme.outlineVariant, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                } else {
                    // Add Friend CTA
                    Button {
                        vm.showAddFriendSheet = true
                    } label: {
                        VStack(spacing: 5) {
                            ZStack {
                                Circle()
                                    .fill(HubStitchTheme.surfaceContainer)
                                    .frame(width: 60, height: 60)
                                    .overlay(Circle().stroke(HubStitchTheme.playGreen, lineWidth: 2))
                                Image(systemName: "plus")
                                    .font(.system(size: 22, weight: .bold))
                                    .foregroundStyle(HubStitchTheme.playGreen)
                            }
                            Text("친구 추가")
                                .font(.system(size: 11.5, weight: .bold))
                                .foregroundStyle(HubStitchTheme.playGreen)
                                .lineLimit(1)
                        }
                        .frame(width: 68)
                    }
                    .buttonStyle(.plain)

                    ForEach(vm.socialFriends) { friend in
                        Button {
                            if friend.presence.status == "in_game",
                               let gid = friend.presence.gameId,
                               let game = vm.catalogGames.first(where: { $0.id == gid }) {
                                vm.openExperienceDetail(game)
                            } else {
                                vm.openDmFromHome(friend)
                            }
                        } label: {
                            VStack(spacing: 5) {
                                friendAvatarRing(
                                    name: friend.displayName,
                                    fillHex: friend.avatarColor,
                                    size: 60,
                                    online: friend.presence.online
                                )
                                Text(friend.displayName)
                                    .font(.system(size: 11.5, weight: .bold))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                            }
                            .frame(width: 68)
                        }
                        .buttonStyle(.plain)
                    }

                    if vm.socialFriends.isEmpty {
                        Button {
                            vm.showAddFriendSheet = true
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("친구를 찾아 추가해 보세요")
                                    .font(.system(size: 12.5, weight: .bold))
                                    .foregroundStyle(.white)
                                Text("예: minjun#1024 검색 · 파티 코드 PLAY99 합류")
                                    .font(.system(size: 11))
                                    .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(HubStitchTheme.surfaceContainer, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(HubStitchTheme.outlineVariant, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }

    private func gameCarousel(
        games: [MobileCatalogGame],
        showPlayButton: Bool,
        showFriendTag: Bool,
        playingFriends: [SocialFriend]
    ) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(games) { game in
                    let playingFriend = playingFriends.first(where: { $0.presence.gameId == game.id })
                    let friendOverlay: String? = (showFriendTag && playingFriend != nil)
                        ? "\(playingFriend!.displayName)님 플레이 중"
                        : nil
                    StitchGameCardView(
                        vm: vm,
                        game: game,
                        cardWidth: 244,
                        showPlayButton: showPlayButton,
                        friendOverlayText: friendOverlay
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }

    private var profileStatusCard: some View {
        let myDisplay = vm.socialProfile?.displayName ?? "게스트 플레이어"
        let myHandle = vm.socialProfile?.handle ?? "@guest"
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(myDisplay)  \(myHandle)")
                    .font(.system(size: 13.5, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer()
                pillChip("Godot \(vm.engineVersion)", bg: HubStitchTheme.playGreenDark, fg: HubStitchTheme.playGreenTint)
            }
            HStack(spacing: 6) {
                pillChip(vm.authProvider.uppercased(), bg: HubStitchTheme.surfaceHigh, fg: .white)
                pillChip("\(vm.ageTier.rawValue) (\(vm.regionCode))", bg: HubStitchTheme.surfaceHigh, fg: HubStitchTheme.onSurfaceVariant)
                if let party = vm.activeParty {
                    pillChip("파티 \(party.roomCode)", bg: HubStitchTheme.playGreenDark, fg: HubStitchTheme.playGreenTint)
                }
                if vm.isFreeUsbMode {
                    pillChip("USB FREE", bg: Color.blue.opacity(0.28), fg: Color(red: 0.65, green: 0.88, blue: 1.0))
                }
            }
            HStack {
                Text(vm.syncStatusText)
                    .font(.system(size: 11.5, design: .monospaced))
                    .foregroundStyle(HubStitchTheme.playGreen)
                    .lineLimit(1)
                Spacer()
                Button("새로고침") {
                    Task {
                        await vm.refreshFarmHealth()
                        await vm.syncOnlineCatalog()
                        await vm.syncSocial()
                    }
                }
                .font(.system(size: 11.5, weight: .bold))
                .foregroundStyle(HubStitchTheme.onSurfaceVariant)
            }
        }
        .padding(14)
        .background(HubStitchTheme.surfaceContainer, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(HubStitchTheme.outlineVariant, lineWidth: 1))
    }

    private var emptyCatalogCard: some View {
        HubEmptyCatalogCard {
            vm.selectedCategory = .all
            vm.searchQuery = ""
        }
    }
}

// MARK: - 2. EXPLORE TAB (Matches Hub-AOS `buildExploreTab` 1:1)

public struct HubExploreTabView: View {
    @ObservedObject var vm: PlayHubShellViewModel

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    public var body: some View {
        let games = vm.filteredCatalog(applyCategory: true)

        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                // Header: 체험 탐색 + N개 결과
                HStack {
                    Text("체험 탐색")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                    Spacer()
                    Text("\(games.count)개 결과")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)

                // Search Box
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 15))
                        .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                    TextField("게임, 장르, 런타임 검색...", text: $vm.searchQuery)
                        .font(.system(size: 14))
                        .foregroundStyle(.white)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !vm.searchQuery.isEmpty {
                        Button {
                            vm.searchQuery = ""
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                                .padding(6)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text("검색")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(HubStitchTheme.onPlayGreen)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(HubStitchTheme.playGreen, in: RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(HubStitchTheme.surfaceHigh, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(HubStitchTheme.outlineVariant, lineWidth: 1))
                .padding(.horizontal, 16)

                // 5 Category Filter Chips (전체, Godot 3D, 액션, 퍼즐, HTML5 웹)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(CatalogCategory.allCases) { cat in
                            let active = vm.selectedCategory == cat
                            Button {
                                vm.selectedCategory = cat
                            } label: {
                                Text(cat.label)
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(active ? HubStitchTheme.onPlayGreen : HubStitchTheme.onSurfaceVariant)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                    .background(
                                        active ? HubStitchTheme.playGreen : HubStitchTheme.surfaceContainer,
                                        in: Capsule()
                                    )
                                    .overlay(
                                        Capsule().stroke(active ? Color.clear : HubStitchTheme.outlineVariant, lineWidth: 1)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 2)
                }

                // 2-Column Stitch Game Grid or Empty State
                if games.isEmpty {
                    HubEmptyCatalogCard {
                        vm.selectedCategory = .all
                        vm.searchQuery = ""
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                } else {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(games) { game in
                            StitchGameCardView(
                                vm: vm,
                                game: game,
                                cardWidth: nil,
                                showPlayButton: false,
                                friendOverlayText: nil
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
            }
        }
        .background(HubStitchTheme.surface)
    }
}

// MARK: - Stitch Game Card (Matches Hub-AOS `stitchGameCard` 1:1)

struct StitchGameCardView: View {
    @ObservedObject var vm: PlayHubShellViewModel
    let game: MobileCatalogGame
    let cardWidth: CGFloat?
    let showPlayButton: Bool
    let friendOverlayText: String?

    var body: some View {
        let meta = CatalogFilterEngine.presentationMeta(for: game)
        let compat = vm.compatibilityFor(game)
        let rating = GameAgeRating.from(code: game.ageRating)
        let ageAllowed = AgeGatePolicy.canPlay(
            tier: vm.ageTier,
            rating: rating,
            parentalConsentVerified: vm.parentalConsentVerified
        )
        let borderColor: Color = {
            if !compat.compatible { return HubStitchTheme.warnAmber }
            if !ageAllowed { return HubStitchTheme.errorRed }
            return Color.clear
        }()
        let thumbHeight: CGFloat = cardWidth != nil ? 128 : 96

        let handleTap = {
            if !compat.compatible {
                vm.incompatibilityAlert = compat
            } else if !ageAllowed {
                vm.showSocialToast("현재 연령 티어(\(vm.ageTier.rawValue))에서는 이용할 수 없는 등급(\(game.ageRating))입니다.")
            } else {
                vm.openExperienceDetail(game)
            }
        }

        VStack(alignment: .leading, spacing: 0) {
            // Gradient Thumbnail
            StitchGameThumbnail(
                game: game,
                meta: meta,
                compat: compat,
                height: thumbHeight,
                friendOverlayText: friendOverlayText
            )

            // Meta info
            VStack(alignment: .leading, spacing: 3) {
                Text(game.title)
                    .font(.system(size: cardWidth != nil ? 15 : 13.5, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if cardWidth == nil {
                    Text(meta.categoryLabel)
                        .font(.system(size: 11))
                        .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                        .lineLimit(1)
                }

                HStack(spacing: 4) {
                    Image(systemName: "hand.thumbsup.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(HubStitchTheme.playGreen)
                    Text(meta.likeRate)
                        .font(.system(size: 11.5, design: .monospaced))
                        .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                    Spacer().frame(width: 6)
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                    Text(cardWidth != nil ? "\(meta.playerCountLabel) · \(meta.sizeLabel)" : meta.playerCountLabel)
                        .font(.system(size: 11.5, design: .monospaced))
                        .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                        .lineLimit(1)
                }
                .padding(.top, 2)
            }
            .padding(.horizontal, 4)
            .padding(.top, 8)
            .padding(.bottom, 2)

            if !compat.compatible {
                Text(compat.badgeText ?? "⚠️ 업데이트 필요")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color(red: 0.984, green: 0.749, blue: 0.141))
                    .lineLimit(1)
                    .padding(.horizontal, 4)
                    .padding(.top, 4)
            }

            if showPlayButton {
                let playable = compat.compatible && ageAllowed
                let label: String = {
                    if !compat.compatible { return "업데이트 필요" }
                    if !ageAllowed { return "연령 제한" }
                    return "플레이"
                }()
                Button(action: handleTap) {
                    HStack(spacing: 4) {
                        if playable {
                            Image(systemName: "play.fill")
                                .font(.system(size: 12, weight: .bold))
                        }
                        Text(label)
                            .font(.system(size: 13.5, weight: .bold))
                    }
                    .foregroundStyle(playable ? HubStitchTheme.onPlayGreen : .white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(
                        playable ? HubStitchTheme.playGreen : HubStitchTheme.surfaceHigh,
                        in: RoundedRectangle(cornerRadius: 8)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(playable ? Color.clear : HubStitchTheme.outlineVariant, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 4)
                .padding(.top, 8)
            }
        }
        .padding(8)
        .padding(.bottom, 2)
        .frame(width: cardWidth, alignment: .leading)
        .background(HubStitchTheme.surfaceContainer, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(borderColor, lineWidth: borderColor == .clear ? 0 : 1.5)
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: handleTap)
    }
}

struct StitchGameThumbnail: View {
    let game: MobileCatalogGame
    let meta: CatalogPresentationMeta
    let compat: VersionCompatibilityResult
    let height: CGFloat
    let friendOverlayText: String?

    var body: some View {
        let topBadgeText: String = {
            if !compat.compatible { return "엔진 \(meta.requiredEngineVersion ?? "상위") 필요" }
            return game.runtime == "godot-pck" ? "GODOT \(meta.requiredEngineVersion ?? "4.7.2")" : "HTML5"
        }()
        let topBadgeBg: Color = !compat.compatible
            ? Color(red: 0.706, green: 0.325, blue: 0.035)
            : Color(red: 0.067, green: 0.075, blue: 0.082).opacity(0.82)
        let topBadgeFg: Color = !compat.compatible
            ? Color(red: 0.996, green: 0.953, blue: 0.780)
            : .white

        ZStack {
            LinearGradient(
                colors: [
                    HubStitchTheme.color(fromHex: meta.accentStartHex),
                    HubStitchTheme.color(fromHex: meta.accentEndHex)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(Color.white.opacity(0.12))
                .frame(width: height, height: height)
                .offset(x: height * 0.45, y: height * 0.38)

            VStack(spacing: 2) {
                Text(meta.tagCode)
                    .font(.system(size: 22, weight: .black))
                    .foregroundStyle(Color.white.opacity(0.9))
                Text(meta.categoryLabel)
                    .font(.system(size: 10.5))
                    .foregroundStyle(Color.white.opacity(0.8))
            }

            VStack {
                HStack {
                    Text(topBadgeText)
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(topBadgeFg)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(topBadgeBg, in: Capsule())
                        .overlay(Capsule().stroke(HubStitchTheme.outlineVariant, lineWidth: 0.8))
                    Spacer()
                }
                Spacer()
                if let overlay = friendOverlayText {
                    HStack {
                        HStack(spacing: 5) {
                            Circle()
                                .fill(HubStitchTheme.onlineDot)
                                .frame(width: 7, height: 7)
                            Text(overlay)
                                .font(.system(size: 10.5, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color(red: 0.067, green: 0.075, blue: 0.082).opacity(0.9), in: Capsule())
                        .overlay(Capsule().stroke(HubStitchTheme.outlineVariant, lineWidth: 0.8))
                        Spacer()
                    }
                }
            }
            .padding(8)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Experience Detail Bottom Sheet (Matches Hub-AOS `openExperienceDetail` 1:1)

public struct ExperienceDetailSheet: View {
    @ObservedObject var vm: PlayHubShellViewModel
    let game: MobileCatalogGame
    @Environment(\.dismiss) private var dismiss
    @State private var topEntries: [SocialLeaderboardEntry] = []
    @State private var loadingBoard = true

    public var body: some View {
        let meta = CatalogFilterEngine.presentationMeta(for: game)
        let compat = vm.compatibilityFor(game)

        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                ZStack(alignment: .topTrailing) {
                    StitchGameThumbnail(
                        game: game,
                        meta: meta,
                        compat: compat,
                        height: 164,
                        friendOverlayText: nil
                    )
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(HubStitchTheme.surfaceLowest.opacity(0.82), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .padding(8)
                }

                Text(game.title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)

                Text("\(game.description ?? "Play Hub 체험") · \(meta.categoryLabel)")
                    .font(.system(size: 13))
                    .foregroundStyle(HubStitchTheme.onSurfaceVariant)

                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "hand.thumbsup.fill")
                            .font(.system(size: 13))
                            .foregroundStyle(HubStitchTheme.playGreen)
                        Text(meta.likeRate)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(.white)
                    }
                    HStack(spacing: 4) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 13))
                            .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                        Text("\(meta.playerCountLabel) · \(meta.sizeLabel) · \(game.ageRating)")
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                    }
                }

                // Live TOP 3 Global Leaderboard
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("TOP 리더보드 (Global)")
                            .font(.system(size: 11.5, weight: .bold))
                            .foregroundStyle(HubStitchTheme.playGreen)
                        Spacer()
                        Button("전체 보기") {
                            dismiss()
                            vm.leaderboardGame = game
                        }
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                    }
                    if loadingBoard {
                        Text("리더보드 불러오는 중...")
                            .font(.system(size: 11.5))
                            .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                    } else if topEntries.isEmpty {
                        Text("아직 등록된 점수가 없습니다. 첫 기록을 세워 보세요!")
                            .font(.system(size: 11.5))
                            .foregroundStyle(HubStitchTheme.onSurfaceVariant)
                    } else {
                        ForEach(topEntries.prefix(3)) { e in
                            HStack {
                                Text("#\(e.rank)")
                                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                                    .foregroundStyle(e.rank == 1 ? HubStitchTheme.coinGold : HubStitchTheme.onSurfaceVariant)
                                    .frame(width: 28, alignment: .leading)
                                Text("\(e.displayName) (\(e.handle))")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                                Spacer()
                                Text(HubStitchTheme.formatCoin(e.score))
                                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                                    .foregroundStyle(HubStitchTheme.playGreen)
                            }
                        }
                    }
                }
                .padding(12)
                .background(HubStitchTheme.surfaceLow, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(HubStitchTheme.outlineVariant, lineWidth: 1))

                // Primary Play CTA
                Button {
                    dismiss()
                    vm.attemptLaunch(game)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 15, weight: .bold))
                        Text("지금 플레이")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .foregroundStyle(HubStitchTheme.onPlayGreen)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(HubStitchTheme.playGreen, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)

                // Co-Entry Party Launch CTA when in active party
                if let party = vm.activeParty {
                    Button {
                        dismiss()
                        Task { await vm.launchPartyTogether(game: game) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "person.3.fill")
                            Text("파티(\(party.roomCode))와 함께 입장 (Co-Entry)")
                                .font(.system(size: 13.5, weight: .bold))
                        }
                        .foregroundStyle(HubStitchTheme.playGreenTint)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(HubStitchTheme.playGreenDark, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
        .background(HubStitchTheme.surfaceContainer)
        .presentationDetents([.medium, .large])
        .task {
            loadingBoard = true
            topEntries = await vm.loadLeaderboard(gameId: game.id, scope: "global")
            loadingBoard = false
        }
    }
}

// MARK: - Shared Stitch Subcomponents

private func sectionHeader(
    title: String,
    monoAccent: String? = nil,
    actionLabel: String? = nil,
    onAction: (() -> Void)? = nil
) -> some View {
    HStack {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
            if let accent = monoAccent {
                Text(accent)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(HubStitchTheme.playGreen)
            }
        }
        Spacer()
        if let actionLabel, let onAction {
            Button(action: onAction) {
                HStack(spacing: 2) {
                    Text(actionLabel)
                        .font(.system(size: 12, weight: .bold))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                }
                .foregroundStyle(HubStitchTheme.onSurfaceVariant)
            }
            .buttonStyle(.plain)
        }
    }
    .padding(.horizontal, 16)
    .padding(.top, 14)
    .padding(.bottom, 8)
}

private func friendAvatarRing(name: String, fillHex: String, size: CGFloat, online: Bool) -> some View {
    let initial = String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()
    let fill = HubStitchTheme.color(fromHex: fillHex, fallback: Color(red: 0.118, green: 0.227, blue: 0.373))
    let dotSize = min(max(size * 0.24, 11), 16)
    return ZStack(alignment: .bottomTrailing) {
        Circle()
            .fill(HubStitchTheme.surfaceContainer)
            .frame(width: size, height: size)
            .overlay(
                Circle().stroke(online ? HubStitchTheme.playGreen : HubStitchTheme.outlineVariant, lineWidth: 2)
            )
            .overlay(
                Circle()
                    .fill(fill)
                    .padding(3)
                    .opacity(online ? 1.0 : 0.55)
                    .overlay(
                        Text(initial.isEmpty ? "P" : initial)
                            .font(.system(size: size * 0.34, weight: .bold))
                            .foregroundStyle(.white)
                    )
            )
        if online {
            Circle()
                .fill(HubStitchTheme.onlineDot)
                .frame(width: dotSize, height: dotSize)
                .overlay(Circle().stroke(HubStitchTheme.surface, lineWidth: 2))
        }
    }
}

private func pillChip(_ text: String, bg: Color, fg: Color) -> some View {
    Text(text)
        .font(.system(size: 10.5, weight: .bold, design: .monospaced))
        .foregroundStyle(fg)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(bg, in: Capsule())
}

struct HubEmptyCatalogCard: View {
    let onReset: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text("일치하는 게임이 없습니다")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
            Text("다른 검색어나 카테고리를 선택해 보세요.")
                .font(.system(size: 13))
                .foregroundStyle(HubStitchTheme.onSurfaceVariant)
            Button(action: onReset) {
                Text("필터 초기화")
                    .font(.system(size: 13.5, weight: .bold))
                    .foregroundStyle(HubStitchTheme.onPlayGreen)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 9)
                    .background(HubStitchTheme.playGreen, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(22)
        .background(HubStitchTheme.surfaceContainer, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(HubStitchTheme.outlineVariant, lineWidth: 1))
    }
}
