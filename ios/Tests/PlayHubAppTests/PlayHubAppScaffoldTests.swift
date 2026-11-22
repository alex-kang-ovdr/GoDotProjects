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
}
