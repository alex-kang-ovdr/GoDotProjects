import XCTest
@testable import PlayHubCore

final class BundleIdRuleTests: XCTestCase {
    func testOfficialTrunkStagesMatchAndroidAndAppleRule() throws {
        XCTAssertEqual(try BundleIdRule.build(branch: "PlayHub-Platform", stage: .debug), "com.playhub.gamedev.debug")
        XCTAssertEqual(try BundleIdRule.build(branch: "main", stage: .dev), "com.playhub.gamedev.dev")
        XCTAssertEqual(try BundleIdRule.build(branch: "gamedev", stage: .test), "com.playhub.gamedev.test")
        XCTAssertEqual(try BundleIdRule.build(branch: "gamedev", stage: .release), "com.playhub.gamedev.release")
        XCTAssertEqual(try BundleIdRule.build(branch: "PlayHub-Platform", stage: .live), "com.playhub.gamedev.live")
    }

    func testBranchBuildUsesHyphenAndForbidsUnderscore() throws {
        let id = try BundleIdRule.build(branch: "Hub-IOS", stage: .debug)
        XCTAssertEqual(id, "com.playhub.hub-ios.debug")
        XCTAssertFalse(id.contains("_"))
        XCTAssertEqual(try BundleIdRule.build(branch: "feature/123_my_branch", stage: .release), "com.playhub.feature-123-my-branch.release")
        XCTAssertEqual(try BundleIdRule.build(branch: "2026-hotfix", stage: .test), "com.playhub.b-2026-hotfix.test")
    }

    func testLiveStageRejectsNonTrunkBranch() {
        XCTAssertThrowsError(try BundleIdRule.build(branch: "Hub-IOS", stage: .live)) { error in
            XCTAssertEqual(error as? BundleIdRuleError, .liveStageTrunkOnly(branch: "Hub-IOS"))
        }
    }

    func testUnderscoreBundleIdRejectedByValidator() {
        XCTAssertFalse(BundleIdRule.isValid("com.playhub.hub_ios.debug", expectedStage: .debug))
        XCTAssertTrue(BundleIdRule.isValid("com.playhub.hub-ios.debug", expectedStage: .debug))
        XCTAssertFalse(BundleIdRule.isValid("com.playhub.hub-ios.live", expectedStage: .live))
        XCTAssertTrue(BundleIdRule.isValid("com.playhub.gamedev.live", expectedStage: .live))
    }
}
