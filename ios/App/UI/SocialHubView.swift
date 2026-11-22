import PlayHubCore
import SwiftUI
import UIKit

public enum SocialChatTarget: Identifiable, Equatable {
    case dm(SocialFriend)
    case party(SocialParty)

    public var id: String {
        switch self {
        case let .dm(friend): return "dm:\(friend.principalId)"
        case let .party(party): return "party:\(party.id)"
        }
    }

    public var title: String {
        switch self {
        case let .dm(friend): return friend.displayName
        case let .party(party): return party.title
        }
    }

    public var subtitle: String {
        switch self {
        case let .dm(friend):
            if friend.presence.online {
                if let g = friend.presence.gameTitle { return "\(g) 중 · \(friend.handle)" }
                return "온라인 · \(friend.handle)"
            }
            return "오프라인 · \(friend.handle)"
        case let .party(party):
            return "파티 채팅 · 코드 \(party.roomCode)"
        }
    }
}

public struct SocialHubView: View {
    @ObservedObject public var vm: PlayHubShellViewModel
    @State private var friendFilter: Int = 0 // 0 = all, 1 = online
    @State private var showAddFriend = false
    @State private var showCreateParty = false
    @State private var showJoinCode = false
    @State private var activeChat: SocialChatTarget?

    private let playGreen = Color(red: 0.0, green: 0.69, blue: 0.435)

    public init(vm: PlayHubShellViewModel) {
        self.vm = vm
    }

    private var filteredFriends: [SocialFriend] {
        friendFilter == 1 ? vm.socialFriends.filter { $0.presence.online } : vm.socialFriends
    }

    private func friendPreviewText(_ friend: SocialFriend) -> String {
        guard let msg = friend.lastMessage, !msg.isEmpty else {
            return "\(friend.handle) · 탭해서 1:1 대화 시작"
        }
        let prefix = friend.lastMessageFromMe == true ? "나: " : ""
        if let at = friend.lastMessageAt {
            let hhmm = SocialTimeFormatter.formatHHmm(at)
            if !hhmm.isEmpty {
                return "\(prefix)\(msg) · \(hhmm)"
            }
        }
        return "\(prefix)\(msg)"
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let toast = vm.socialToast {
                        Text(toast)
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(playGreen.opacity(0.25), in: RoundedRectangle(cornerRadius: 10))
                    }

                    // My Profile Strip
                    if let profile = vm.socialProfile {
                        HStack(spacing: 12) {
                            avatarCircle(name: profile.displayName, hex: profile.avatarColor, size: 46, online: true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(profile.displayName).font(.headline)
                                Text(profile.handle).font(.caption.monospaced()).foregroundStyle(.secondary)
                                if profile.ageTier == "CHILD_PROTECTED" {
                                    Text(profile.parentalConsentStatus == "verified" ? "아동 보호 모드 (안전 퀵메시지)" : "아동 보호 모드 (보호자 동의 대기)")
                                        .font(.caption2.bold())
                                        .foregroundStyle(playGreen)
                                }
                            }
                            Spacer()
                            Button("복사") {
                                UIPasteboard.general.string = profile.handle
                                vm.showSocialToast("핸들 복사됨: \(profile.handle)")
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                    }

                    // Action Buttons Row
                    HStack(spacing: 10) {
                        Button {
                            showAddFriend = true
                        } label: {
                            Label("친구 추가", systemImage: "person.badge.plus")
                                .font(.caption.bold())
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(playGreen)

                        Button {
                            showCreateParty = true
                        } label: {
                            Label("파티 만들기", systemImage: "plus.circle")
                                .font(.caption.bold())
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        Button {
                            showJoinCode = true
                        } label: {
                            Label("코드 합류", systemImage: "number.circle")
                                .font(.caption.bold())
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }

                    // Active Party Lobby Card
                    if let party = vm.activeParty {
                        partyLobbyCard(party)
                    }

                    // Incoming Friend Requests
                    if !vm.incomingRequests.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("받은 친구 요청").font(.headline)
                                Text("\(vm.incomingRequests.count)건")
                                    .font(.caption.bold())
                                    .foregroundStyle(playGreen)
                            }
                            ForEach(vm.incomingRequests) { req in
                                HStack(spacing: 10) {
                                    avatarCircle(name: req.displayName, hex: req.avatarColor, size: 38, online: true)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(req.displayName).font(.subheadline.bold())
                                        Text(req.handle).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Button("수락") {
                                        Task { await vm.respondFriendRequest(requesterId: req.principalId, accept: true) }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(playGreen)
                                    .controlSize(.small)

                                    Button("거절") {
                                        Task { await vm.respondFriendRequest(requesterId: req.principalId, accept: false) }
                                    }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                                }
                                .padding(10)
                                .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }

                    // Friends & Live Chat List
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("친구 · 실시간 채팅").font(.headline)
                            let onlineCount = vm.socialFriends.filter { $0.presence.online }.count
                            Text("\(onlineCount)명 접속 중").font(.caption).foregroundStyle(playGreen)
                            Spacer()
                            Picker("", selection: $friendFilter) {
                                Text("전체").tag(0)
                                Text("접속 중").tag(1)
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 130)
                        }

                        if filteredFriends.isEmpty {
                            VStack(spacing: 8) {
                                Text(friendFilter == 1 ? "접속 중인 친구가 없습니다" : "아직 친구가 없습니다")
                                    .font(.subheadline.bold())
                                Text("상단 '친구 추가'에서 minjun#1024 / seoyeon#2048을 검색하거나 '코드 합류'에 PLAY99를 입력해 보세요.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(20)
                            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
                        } else {
                            ForEach(filteredFriends) { friend in
                                Button {
                                    activeChat = .dm(friend)
                                } label: {
                                    HStack(spacing: 12) {
                                        avatarCircle(
                                            name: friend.displayName,
                                            hex: friend.avatarColor,
                                            size: 44,
                                            online: friend.presence.online
                                        )
                                        VStack(alignment: .leading, spacing: 3) {
                                            HStack(spacing: 6) {
                                                Text(friend.displayName).font(.subheadline.bold()).foregroundStyle(.white)
                                                if friend.presence.online {
                                                    Text(friend.presence.gameTitle.map { "\($0) 중" } ?? "온라인")
                                                        .font(.caption2.bold())
                                                        .foregroundStyle(playGreen)
                                                } else {
                                                    Text("오프라인").font(.caption2).foregroundStyle(.secondary)
                                                }
                                            }
                                            Text(friendPreviewText(friend))
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                                .lineLimit(1)
                                        }
                                        Spacer()
                                        if let room = friend.presence.roomCode, !room.isEmpty {
                                            Button("합류") {
                                                Task { await vm.joinParty(roomCode: room) }
                                            }
                                            .buttonStyle(.borderedProminent)
                                            .tint(playGreen)
                                            .controlSize(.mini)
                                        }
                                    }
                                    .padding(12)
                                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding()
            }
            .refreshable {
                await vm.syncSocial()
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await vm.syncSocial() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .sheet(isPresented: $showAddFriend) {
                AddFriendSheet(vm: vm)
            }
            .sheet(isPresented: $showCreateParty) {
                CreatePartySheet(vm: vm)
            }
            .sheet(isPresented: $showJoinCode) {
                JoinPartyCodeSheet(vm: vm)
            }
            .sheet(item: $activeChat) { target in
                SocialChatRoomSheet(vm: vm, target: target)
            }
        }
    }

    private func partyLobbyCard(_ party: SocialParty) -> some View {
        let myId = vm.socialProfile?.principalId
        let me = party.members.first(where: { $0.principalId == myId })
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(party.title).font(.headline)
                    let gameName = vm.catalogGames.first(where: { $0.id == party.targetGameId })?.title
                        ?? party.targetGameId
                        ?? "자유 로비"
                    Text("게임: \(gameName) · \(party.members.count)/\(party.maxMembers)명")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("코드 \(party.roomCode)") {
                    UIPasteboard.general.string = party.roomCode
                    vm.showSocialToast("파티 코드 복사됨: \(party.roomCode)")
                }
                .font(.caption.bold().monospaced())
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(playGreen.opacity(0.22), in: Capsule())
                .foregroundStyle(playGreen)
            }

            ForEach(party.members) { member in
                HStack(spacing: 10) {
                    avatarCircle(name: member.displayName, hex: member.avatarColor, size: 30, online: true)
                    Text("\(member.displayName) (\(member.handle))").font(.caption)
                    Spacer()
                    Text(member.role == "leader" ? "방장" : (member.ready ? "준비 완료" : "대기 중"))
                        .font(.caption2.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(
                            (member.role == "leader" || member.ready ? playGreen : Color.gray).opacity(0.22),
                            in: Capsule()
                        )
                        .foregroundStyle(member.role == "leader" || member.ready ? playGreen : .secondary)
                }
            }

            if let launch = party.activeLaunch {
                VStack(alignment: .leading, spacing: 6) {
                    Text("🎮 크로스플레이 함께 입장 중 · \(launch.matchRoomId)")
                        .font(.caption.bold())
                        .foregroundStyle(playGreen)
                    let roster = launch.participants.map { pt -> String in
                        let p = pt.platform == "android" ? "Android" : (pt.platform == "ios" ? "iOS" : "PC 웹")
                        return "\(p) \(pt.displayName)"
                    }.joined(separator: " · ")
                    Text("참여: \(roster.isEmpty ? "대기 중" : roster)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Button("🚀 지금 함께 입장") {
                        Task { await vm.ackAndJoinLaunch(launch) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(playGreen)
                    .controlSize(.small)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(playGreen.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
            }

            HStack(spacing: 8) {
                Button(me?.ready == true ? "준비 취소" : "준비 완료") {
                    Task { await vm.togglePartyReady(ready: !(me?.ready ?? false)) }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button("파티 채팅") {
                    activeChat = .party(party)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                if let targetGameId = party.targetGameId,
                   let game = vm.catalogGames.first(where: { $0.id == targetGameId }) {
                    Button("▶ 함께 입장") {
                        Task { await vm.launchPartyTogether(game: game) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(playGreen)
                    .controlSize(.small)
                }

                Spacer()

                Button("나가기", role: .destructive) {
                    Task { await vm.leaveParty() }
                }
                .controlSize(.small)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(playGreen.opacity(0.09))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(playGreen.opacity(0.6), lineWidth: 1))
        )
    }
}

public struct AddFriendSheet: View {
    @ObservedObject var vm: PlayHubShellViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var query: String = ""
    @State private var results: [SocialUserHit] = []
    @State private var searching = false

    public var body: some View {
        NavigationStack {
            List {
                Section("핸들 또는 이름으로 검색") {
                    HStack {
                        TextField("예: minjun#1024", text: $query)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button("검색") {
                            Task { await runSearch() }
                        }
                        .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty || searching)
                    }
                }
                if !results.isEmpty {
                    Section("검색 결과") {
                        ForEach(results) { user in
                            let isFriend = user.isFriend || vm.socialFriends.contains(where: { $0.principalId == user.principalId })
                            let isPendingOut = vm.outgoingRequests.contains(where: { $0.principalId == user.principalId })
                            let isPendingIn = vm.incomingRequests.contains(where: { $0.principalId == user.principalId })
                            HStack {
                                avatarCircle(name: user.displayName, hex: user.avatarColor, size: 34, online: user.presence?.online ?? false)
                                VStack(alignment: .leading) {
                                    Text(user.displayName).font(.subheadline.bold())
                                    Text(user.handle).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if isFriend {
                                    Text("친구").font(.caption).foregroundStyle(.secondary)
                                } else if isPendingOut {
                                    Text("요청됨").font(.caption).foregroundStyle(.secondary)
                                } else if isPendingIn {
                                    Button("수락") {
                                        Task {
                                            await vm.respondFriendRequest(requesterId: user.principalId, accept: true)
                                            await runSearch()
                                        }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.small)
                                } else {
                                    Button("요청") {
                                        Task {
                                            await vm.sendFriendRequest(targetPrincipalId: user.principalId)
                                            await runSearch()
                                        }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.small)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("친구 추가")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
            }
        }
    }

    private func runSearch() async {
        searching = true
        defer { searching = false }
        results = await vm.searchUsers(query: query)
    }
}

public struct CreatePartySheet: View {
    @ObservedObject var vm: PlayHubShellViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var title: String = ""
    @State private var selectedGameId: String = ""

    public var body: some View {
        NavigationStack {
            Form {
                Section("파티 정보") {
                    TextField("파티 이름", text: $title)
                    Picker("대상 게임", selection: $selectedGameId) {
                        Text("자유 로비").tag("")
                        ForEach(vm.catalogGames) { g in
                            Text(g.title).tag(g.id)
                        }
                    }
                }
                Button("파티 만들기") {
                    Task {
                        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
                        await vm.createParty(
                            title: cleanTitle.isEmpty ? nil : cleanTitle,
                            targetGameId: selectedGameId.isEmpty ? nil : selectedGameId
                        )
                        dismiss()
                    }
                }
                .buttonStyle(.borderedProminent)
            }
            .navigationTitle("새 파티 만들기")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
            }
        }
    }
}

public struct JoinPartyCodeSheet: View {
    @ObservedObject var vm: PlayHubShellViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var code: String = ""

    public var body: some View {
        NavigationStack {
            Form {
                Section("6자리 초대 코드") {
                    TextField("예: PLAY99", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
                Button("파티 합류") {
                    Task {
                        await vm.joinParty(roomCode: code)
                        dismiss()
                    }
                }
                .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
                .buttonStyle(.borderedProminent)
            }
            .navigationTitle("코드로 파티 합류")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
            }
        }
    }
}

public struct SocialChatRoomSheet: View {
    @ObservedObject var vm: PlayHubShellViewModel
    let target: SocialChatTarget
    @Environment(\.dismiss) private var dismiss
    @State private var messages: [SocialMessage] = []
    @State private var draft: String = ""
    @State private var showManage = false

    private let playGreen = Color(red: 0.0, green: 0.69, blue: 0.435)

    private var isChildQuickOnly: Bool {
        vm.ageTier == .childProtected || vm.socialProfile?.ageTier == "CHILD_PROTECTED"
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if case let .dm(friend) = target,
                   friend.presence.status == "in_game",
                   let gameTitle = friend.presence.gameTitle {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("지금 플레이 중\(friend.presence.roomCode.map { " · 코드 \($0)" } ?? "")")
                                .font(.caption2.bold())
                                .foregroundStyle(playGreen)
                            Text(gameTitle).font(.subheadline.bold())
                        }
                        Spacer()
                        if let code = friend.presence.roomCode {
                            Button("▶ 합류") {
                                Task {
                                    await vm.joinParty(roomCode: code)
                                    dismiss()
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(playGreen)
                            .controlSize(.small)
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.06))
                }

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(messages) { msg in
                                VStack(alignment: msg.senderMe ? .trailing : .leading, spacing: 3) {
                                    if !msg.senderMe, case .party = target {
                                        Text(msg.senderName).font(.caption2).foregroundStyle(.secondary)
                                    }
                                    Text(msg.body)
                                        .font(.subheadline)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                        .background(
                                            msg.senderMe ? playGreen : Color.white.opacity(0.1),
                                            in: RoundedRectangle(cornerRadius: 14)
                                        )
                                        .foregroundStyle(msg.senderMe ? .black : .white)
                                    let hhmm = SocialTimeFormatter.formatHHmm(msg.createdAt)
                                    Text(msg.isQuickMessage ? "안전 퀵메시지 · \(hhmm)" : hhmm)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: msg.senderMe ? .trailing : .leading)
                                .id(msg.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: messages.count) { _ in
                        if let last = messages.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                }

                Divider()

                if isChildQuickOnly {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(vm.quickMessages) { qm in
                                Button(qm.text) {
                                    Task { await send(bodyText: nil, quickId: qm.id) }
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            }
                        }
                        .padding(10)
                    }
                } else {
                    HStack(spacing: 8) {
                        TextField("\(target.title)에 메시지 보내기...", text: $draft)
                            .textFieldStyle(.roundedBorder)
                        Button {
                            let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !text.isEmpty else { return }
                            draft = ""
                            Task { await send(bodyText: text, quickId: nil) }
                        } label: {
                            Image(systemName: "paperplane.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(playGreen)
                    }
                    .padding(10)
                }
            }
            .navigationTitle(target.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
                if case .dm = target {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("관리") { showManage = true }
                    }
                }
            }
            .confirmationDialog("사용자 관리", isPresented: $showManage) {
                if case let .dm(friend) = target {
                    Button("부적절한 행동 신고") {
                        Task { await vm.reportUser(targetId: friend.principalId, reason: "부적절한 채팅 신고") }
                    }
                    Button("사용자 차단", role: .destructive) {
                        Task {
                            await vm.blockUser(targetPrincipalId: friend.principalId)
                            dismiss()
                        }
                    }
                }
                Button("취소", role: .cancel) {}
            }
            .task {
                await reload()
            }
        }
    }

    private func reload() async {
        messages = await vm.loadMessages(for: target)
    }

    private func send(bodyText: String?, quickId: String?) async {
        await vm.sendMessage(target: target, bodyText: bodyText, quickMessageId: quickId)
        await reload()
    }
}

public struct GameLeaderboardSheet: View {
    @ObservedObject var vm: PlayHubShellViewModel
    let game: MobileCatalogGame
    @Environment(\.dismiss) private var dismiss
    @State private var scope: String = "global"
    @State private var entries: [SocialLeaderboardEntry] = []

    public var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Picker("범위", selection: $scope) {
                    Text("전체 (Global)").tag("global")
                    Text("친구 (Friends)").tag("friends")
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if entries.isEmpty {
                    Spacer()
                    Text("아직 등록된 점수가 없습니다.").foregroundStyle(.secondary)
                    Spacer()
                } else {
                    List(entries) { entry in
                        HStack(spacing: 12) {
                            Text("#\(entry.rank)")
                                .font(.headline.monospacedDigit())
                                .foregroundStyle(entry.rank == 1 ? .yellow : .secondary)
                                .frame(width: 34, alignment: .leading)
                            avatarCircle(name: entry.displayName, hex: entry.avatarColor, size: 32, online: false)
                            VStack(alignment: .leading) {
                                Text("\(entry.displayName)\(entry.isMe ? " (나)" : "")").font(.subheadline.bold())
                                Text(entry.handle).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(entry.score)")
                                .font(.headline.monospacedDigit())
                                .foregroundStyle(Color(red: 0.0, green: 0.69, blue: 0.435))
                        }
                    }
                }
            }
            .navigationTitle("\(game.title) 리더보드")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
            }
            .task(id: scope) {
                entries = await vm.loadLeaderboard(gameId: game.id, scope: scope)
            }
        }
    }
}

@ViewBuilder
private func avatarCircle(name: String, hex: String, size: CGFloat, online: Bool) -> some View {
    let initial = String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()
    ZStack(alignment: .bottomTrailing) {
        Circle()
            .fill(colorFromHex(hex))
            .frame(width: size, height: size)
            .overlay(
                Text(initial.isEmpty ? "P" : initial)
                    .font(.system(size: size * 0.42, weight: .bold))
                    .foregroundStyle(.white)
            )
        if online {
            Circle()
                .fill(Color(red: 0.0, green: 0.82, blue: 0.48))
                .frame(width: size * 0.28, height: size * 0.28)
                .overlay(Circle().stroke(Color.black, lineWidth: 1.5))
        }
    }
}

private func colorFromHex(_ hex: String) -> Color {
    let clean = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard clean.count == 6, let val = UInt64(clean, radix: 16) else {
        return Color(red: 0.0, green: 0.69, blue: 0.435)
    }
    let r = Double((val >> 16) & 0xFF) / 255.0
    let g = Double((val >> 8) & 0xFF) / 255.0
    let b = Double(val & 0xFF) / 255.0
    return Color(red: r, green: g, blue: b)
}
