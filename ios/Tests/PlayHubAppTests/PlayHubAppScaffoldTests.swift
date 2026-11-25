import XCTest
@testable import PlayHubApp
import PlayHubCore

final class PlayHubAppScaffoldTests: XCTestCase {
    func testRuntimeBrokerRejectsUnauthorizedMethodsAndHidesTokens() async {
        let broker = PlayHubRuntimeBroker(
            profile: PlayHubSafeProfileSnapshot(
                displayName: "Guest",
                handle: "@guest#0001",
                isGuest: true,
                ageTier: "ADULT"
            )
        )
        let denied = await broker.dispatch(method: "read_keychain_token", reqId: "r1", payloadJson: "{}")
        XCTAssertFalse(denied.ok)
        XCTAssertTrue(denied.responseJson.contains("BRIDGE_METHOD_FORBIDDEN"))

        let profile = await broker.dispatch(method: "get_profile", reqId: "r2", payloadJson: "{}")
        XCTAssertTrue(profile.ok)
        XCTAssertTrue(profile.responseJson.contains("\"runtime\":\"ios\""))
        XCTAssertFalse(profile.responseJson.contains("refreshToken"))
        XCTAssertFalse(profile.responseJson.contains("accessToken"))
    }

    @MainActor
    func testUserScenario_AosParityTabsExploreFilterAndPreEntryCompatibility() {
        // Verify 5 bottom tab titles match Hub-AOS 1:1
        XCTAssertEqual(PlayHubTab.allCases.map(\.title), ["홈", "탐색", "아바타", "채팅", "더보기"])

        let vm = PlayHubShellViewModel()

        // 1. Complete Neutral Age Gate as KR Adult
        vm.completeAgeGate(birthYear: 1995, birthMonth: 6, region: "KR")
        XCTAssertTrue(vm.ageGateCompleted)
        XCTAssertEqual(vm.ageTier, .adult)

        // 2. Explore category & search filtering
        vm.selectedCategory = .web
        XCTAssertEqual(vm.filteredCatalog(applyCategory: true).map(\.id), ["match3-garden"])

        vm.selectedCategory = .godot
        XCTAssertEqual(vm.filteredCatalog(applyCategory: true).count, 2)

        vm.searchQuery = "survivor"
        XCTAssertEqual(vm.filteredCatalog(applyCategory: true).map(\.id), ["survivor-arena-g2"])

        // 3. Compatible game opens Experience Detail sheet
        let survivor = vm.catalogGames.first(where: { $0.id == "survivor-arena-g2" })!
        vm.openExperienceDetail(survivor)
        XCTAssertEqual(vm.selectedExperienceGame?.id, "survivor-arena-g2")
        XCTAssertNil(vm.incompatibilityAlert)

        // 4. Godot 4.8.0 game triggers pre-entry incompatibility dialog before download/launch
        let nextgen = vm.catalogGames.first(where: { $0.id == "nextgen-48-demo" })!
        vm.selectedExperienceGame = nil
        vm.openExperienceDetail(nextgen)
        XCTAssertNil(vm.selectedExperienceGame)
        XCTAssertNotNil(vm.incompatibilityAlert)
        XCTAssertFalse(vm.incompatibilityAlert?.compatible ?? true)
    }

    @MainActor
    func testUserScenario_HomeFriendsStripOpensDmSheet() {
        let vm = PlayHubShellViewModel()
        let friend = SocialFriend(
            principalId: "u-friend-1",
            displayName: "민준",
            handle: "minjun#1024",
            avatarColor: "#2563EB",
            presence: SocialPresence(
                status: "online",
                online: true,
                gameId: nil,
                gameTitle: nil,
                roomCode: nil,
                joinable: true
            ),
            lastMessage: nil
        )
        vm.openDmFromHome(friend)
        XCTAssertEqual(vm.activeSocialChat, .dm(friend))
    }
}
