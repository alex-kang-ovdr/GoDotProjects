import XCTest

final class PlayHubAppUITests: XCTestCase {
    func testLaunchShowsFiveTabsWithoutForge() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["홈"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["차트"].exists)
        XCTAssertTrue(app.tabBars.buttons["아바타"].exists)
        XCTAssertTrue(app.tabBars.buttons["파티"].exists)
        XCTAssertTrue(app.tabBars.buttons["더보기"].exists)
        XCTAssertFalse(app.staticTexts["PlayForge"].exists)
    }
}
