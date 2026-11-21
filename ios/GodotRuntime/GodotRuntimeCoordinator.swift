import Foundation
import UIKit
import PlayHubCore

/// Manages the single-process warm Godot 4.7.2 runtime lifecycle on iOS:
/// - Lazy engine initialization on first Godot game launch
/// - Deterministic user:// data isolation per (accountHash, gameId)
/// - 7-step Clean Reset + GPU render loop stop when returning to the SwiftUI Hub
/// - Memory pressure (Jetsam) response
@MainActor
public final class GodotRuntimeCoordinator: ObservableObject {
    public enum RuntimeState: String {
        case cold
        case warmStandby
        case runningGame
        case resetting
    }

    @Published public private(set) var state: RuntimeState = .cold
    @Published public private(set) var activeGameId: String?

    public let broker: PlayHubRuntimeBroker
    private var memoryWarningObserver: NSObjectProtocol?

    public init(broker: PlayHubRuntimeBroker) {
        self.broker = broker
        self.memoryWarningObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handleMemoryWarning()
            }
        }
    }

    deinit {
        if let observer = memoryWarningObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    public func prepareAndLaunch(
        gameId: String,
        pckUrl: URL,
        expectedSha256: String?,
        accountHash: String
    ) async throws {
        // Verify GDPC header & SHA-256 before passing to Godot runtime
        _ = try PckPackageManager.verifyFile(at: pckUrl, expectedSha256: expectedSha256)

        let bridge = PlayHubGodotBridgeFacade.shared()
        bridge.installEngineHookIfNeeded()

        let userDataDir = try isolatedUserDataDirectory(accountHash: accountHash, gameId: gameId)
        try PckPackageManager.excludeFromICloudBackup(url: userDataDir)

        bridge.userDataPrefix = userDataDir.path
        await broker.bindGame(gameId: gameId)

        activeGameId = gameId
        state = .runningGame
        bridge.requestMountPck(atPath: pckUrl.path)
    }

    public func leaveGameAndCleanReset() async {
        guard state == .runningGame else { return }
        state = .resetting

        let bridge = PlayHubGodotBridgeFacade.shared()
        // Step 1: Ask game to flush cloud/local save snapshot
        bridge.emitEventType("host_snapshot", payloadJson: "{}")
        try? await Task.sleep(nanoseconds: 150_000_000)

        // Steps 2-4: Trigger bootstrap.gd clean reset (standby scene, autoload cleanup, Audio/InputMap reset)
        bridge.requestCleanReset()

        await broker.unbindGame()
        activeGameId = nil
        state = .warmStandby
    }

    private func isolatedUserDataDirectory(accountHash: String, gameId: String) throws -> URL {
        let appSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let dir = appSupport
            .appendingPathComponent("PlayHub", isDirectory: true)
            .appendingPathComponent("game_userdata", isDirectory: true)
            .appendingPathComponent(accountHash, isDirectory: true)
            .appendingPathComponent(gameId, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func handleMemoryWarning() {
        URLCache.shared.removeAllCachedResponses()
    }
}
