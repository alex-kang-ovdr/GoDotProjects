import XCTest
@testable import PlayHubCore

final class FarmRegistryAndHealthTests: XCTestCase {
    func testFarmSelectorLockedOnReleaseAndLive() {
        XCTAssertTrue(FarmServerRegistry.isSelectorAllowed(buildStage: "debug", allowFlag: true))
        XCTAssertTrue(FarmServerRegistry.isSelectorAllowed(buildStage: "dev", allowFlag: true))
        XCTAssertTrue(FarmServerRegistry.isSelectorAllowed(buildStage: "test", allowFlag: true))
        XCTAssertFalse(FarmServerRegistry.isSelectorAllowed(buildStage: "release", allowFlag: true))
        XCTAssertFalse(FarmServerRegistry.isSelectorAllowed(buildStage: "live", allowFlag: true))
        XCTAssertFalse(FarmServerRegistry.isSelectorAllowed(buildStage: "debug", allowFlag: false))
    }

    func testCustomUrlNormalizationAndValidation() throws {
        XCTAssertEqual(
            try FarmServerRegistry.normalizeCustomUrl("  https://demo.trycloudflare.com///  "),
            "https://demo.trycloudflare.com"
        )
        XCTAssertThrowsError(try FarmServerRegistry.normalizeCustomUrl("ftp://invalid.host"))
        XCTAssertThrowsError(try FarmServerRegistry.normalizeCustomUrl(""))
    }

    func testResolveActiveClusterIgnoresSelectionWhenLocked() {
        let cluster = FarmServerRegistry.resolveActiveCluster(
            buildStage: "release",
            allowFlag: true,
            defaultBaseUrl: "https://staging-farm.playhub.example.com/",
            selectedFarmId: "local",
            customUrl: "http://127.0.0.1:18130"
        )
        XCTAssertEqual(cluster.baseUrl, "https://staging-farm.playhub.example.com")
    }

    func testSelectableClustersDeduplicatesUrls() {
        let active = FarmCluster(id: "local", label: "Local", baseUrl: "http://127.0.0.1:18130")
        let list = FarmServerRegistry.selectableClusters(
            buildStage: "debug",
            defaultBaseUrl: "http://127.0.0.1:18130/",
            activeFarm: active
        )
        let localCount = list.filter { $0.baseUrl == "http://127.0.0.1:18130" }.count
        XCTAssertEqual(localCount, 1)
    }

    func testHealthClassificationBoundaries() {
        XCTAssertEqual(FarmHealthChecker.classify(reachable: false, latencyMs: 50), .red)
        XCTAssertEqual(FarmHealthChecker.classify(reachable: true, latencyMs: nil), .red)
        XCTAssertEqual(FarmHealthChecker.classify(reachable: true, latencyMs: -1), .red)
        XCTAssertEqual(FarmHealthChecker.classify(reachable: true, latencyMs: 0), .green)
        XCTAssertEqual(FarmHealthChecker.classify(reachable: true, latencyMs: 199), .green)
        XCTAssertEqual(FarmHealthChecker.classify(reachable: true, latencyMs: 200), .yellow)
        XCTAssertEqual(FarmHealthChecker.classify(reachable: true, latencyMs: 599), .yellow)
        XCTAssertEqual(FarmHealthChecker.classify(reachable: true, latencyMs: 600), .orange)
        XCTAssertEqual(FarmHealthChecker.classify(reachable: true, latencyMs: 1500), .orange)
    }
}
