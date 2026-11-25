import XCTest

final class PlayHubAppUITests: XCTestCase {
    func testLaunchShowsAosParityFiveTabsWithoutForge() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertFalse(app.staticTexts["PlayForge"].exists)
        if app.tabBars.buttons["홈"].waitForExistence(timeout: 5) {
            XCTAssertTrue(app.tabBars.buttons["탐색"].exists)
            XCTAssertTrue(app.tabBars.buttons["아바타"].exists)
            XCTAssertTrue(app.tabBars.buttons["채팅"].exists)
            XCTAssertTrue(app.tabBars.buttons["더보기"].exists)
        }
    }
}
