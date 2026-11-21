import XCTest
@testable import PlayHubCore

final class PckAndVersionCompatibilityTests: XCTestCase {
    private func makeHeader(magic: [UInt8] = [0x47, 0x44, 0x50, 0x43], format: UInt32 = 2, major: UInt32 = 4, minor: UInt32 = 7, patch: UInt32 = 2) -> Data {
        var bytes = magic
        for value in [format, major, minor, patch] {
            var le = value.littleEndian
            withUnsafeBytes(of: &le) { bytes.append(contentsOf: $0) }
        }
        return Data(bytes)
    }

    func testValidGodot47PckHeader() throws {
        let info = try PckPackageManager.verifyHeaderBytes(makeHeader())
        XCTAssertEqual(info, PckHeaderInfo(formatVersion: 2, engineMajor: 4, engineMinor: 7, enginePatch: 2))
    }

    func testInvalidMagicAndFutureEngineRejected() {
        XCTAssertThrowsError(try PckPackageManager.verifyHeaderBytes(makeHeader(magic: [0x50, 0x4B, 0x03, 0x04])))
        XCTAssertThrowsError(try PckPackageManager.verifyHeaderBytes(makeHeader(major: 4, minor: 8, patch: 0)))
        XCTAssertThrowsError(try PckPackageManager.verifyHeaderBytes(makeHeader(format: 1)))
    }

    func testPreEntryVersionCompatibilityChecker() {
        let ok = VersionCompatibilityChecker.evaluate(
            runtime: "godot-pck",
            requiredEngineVersion: "4.7.2",
            minAppBuildNumber: 1,
            installedEngineVersion: "4.7.2",
            installedAppBuildNumber: 1
        )
        XCTAssertTrue(ok.compatible)
        XCTAssertEqual(ok.reason, .ok)

        let engineUpdate = VersionCompatibilityChecker.evaluate(
            runtime: "godot-pck",
            requiredEngineVersion: "4.8.0",
            minAppBuildNumber: 1,
            installedEngineVersion: "4.7.2",
            installedAppBuildNumber: 1
        )
        XCTAssertFalse(engineUpdate.compatible)
        XCTAssertEqual(engineUpdate.reason, .engineUpdateRequired)

        let appUpdate = VersionCompatibilityChecker.evaluate(
            runtime: "godot-pck",
            requiredEngineVersion: "4.7.2",
            minAppBuildNumber: 100,
            installedEngineVersion: "4.7.2",
            installedAppBuildNumber: 1
        )
        XCTAssertFalse(appUpdate.compatible)
        XCTAssertEqual(appUpdate.reason, .appUpdateRequired)
    }
}
