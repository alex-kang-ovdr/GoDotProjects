// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PlayHubCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "PlayHubCore",
            targets: ["PlayHubCore"]
        )
    ],
    targets: [
        .target(
            name: "PlayHubCore",
            path: "Sources/PlayHubCore"
        ),
        .testTarget(
            name: "PlayHubCoreTests",
            dependencies: ["PlayHubCore"],
            path: "Tests/PlayHubCoreTests"
        )
    ]
)
