import SwiftUI

/// Play Hub iOS native entry point (@main).
/// Owns the root UIWindow / SwiftUI TabView and lazily initializes Godot 4.7.2 on game launch.
@main
public struct PlayHubApp: App {
    public init() {}

    public var body: some Scene {
        WindowGroup {
            MainTabView()
                .onOpenURL { url in
                    // Universal Link handler: https://playhub.<domain>/join/<gameId>?room=<roomCode>
                    _ = url
                }
        }
    }
}
