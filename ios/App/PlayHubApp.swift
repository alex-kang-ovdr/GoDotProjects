import SwiftUI

/// Play Hub iOS native entry point (@main).
/// Owns the root UIWindow / SwiftUI TabView and lazily initializes Godot 4.7.2 on game launch.
@main
public struct PlayHubApp: App {
    @StateObject private var shellViewModel = PlayHubShellViewModel()

    public init() {}

    public var body: some Scene {
        WindowGroup {
            MainTabView(vm: shellViewModel)
                .onOpenURL { url in
                    // Custom Scheme & Universal Link handler:
                    // playhub://join/<gameId>?room=<roomCode> or https://playhub.<domain>/join/<gameId>?room=<roomCode>
                    shellViewModel.handleDeepLink(url)
                }
        }
    }
}
