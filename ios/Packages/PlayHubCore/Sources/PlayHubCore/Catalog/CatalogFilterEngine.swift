import Foundation

/// Explore tab filter categories matching Hub-AOS (`MainActivity.kt` `buildExploreTab`) 1:1.
public enum CatalogCategory: String, CaseIterable, Identifiable, Codable, Sendable {
    case all
    case godot
    case action
    case puzzle
    case web

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .all: return "전체"
        case .godot: return "Godot 3D"
        case .action: return "액션"
        case .puzzle: return "퍼즐"
        case .web: return "HTML5 웹"
        }
    }
}

/// Visual card metadata matching Hub-AOS Stitch game cards (gradient accents, tag code, metrics).
public struct CatalogPresentationMeta: Equatable, Sendable {
    public let categoryLabel: String
    public let tagCode: String
    public let likeRate: String
    public let playerCountLabel: String
    public let sizeLabel: String
    public let accentStartHex: String
    public let accentEndHex: String
    public let requiredEngineVersion: String?

    public init(
        categoryLabel: String,
        tagCode: String,
        likeRate: String,
        playerCountLabel: String,
        sizeLabel: String,
        accentStartHex: String,
        accentEndHex: String,
        requiredEngineVersion: String?
    ) {
        self.categoryLabel = categoryLabel
        self.tagCode = tagCode
        self.likeRate = likeRate
        self.playerCountLabel = playerCountLabel
        self.sizeLabel = sizeLabel
        self.accentStartHex = accentStartHex
        self.accentEndHex = accentEndHex
        self.requiredEngineVersion = requiredEngineVersion
    }
}

/// Pure Swift catalog filter & Stitch card presentation helper (shared by Home, Explore, and unit tests).
public enum CatalogFilterEngine {
    public static func matchesCategory(_ game: MobileCatalogGame, category: CatalogCategory) -> Bool {
        switch category {
        case .all:
            return true
        case .godot:
            return game.runtime.lowercased() == "godot-pck"
        case .web:
            return game.runtime.lowercased() != "godot-pck"
        case .action:
            let haystack = "\(game.genre ?? "") \(game.title) \(game.description ?? "")".lowercased()
            return haystack.contains("액션")
                || haystack.contains("action")
                || haystack.contains("생존")
                || haystack.contains("survivor")
                || haystack.contains("arena")
                || haystack.contains("슈팅")
                || haystack.contains("shooter")
                || haystack.contains("탱크")
                || haystack.contains("brawl")
        case .puzzle:
            let haystack = "\(game.genre ?? "") \(game.title) \(game.description ?? "")".lowercased()
            return haystack.contains("퍼즐")
                || haystack.contains("puzzle")
                || haystack.contains("전략")
                || haystack.contains("strategy")
                || haystack.contains("보드")
                || haystack.contains("매치")
                || haystack.contains("match")
                || haystack.contains("merge")
                || haystack.contains("blocks")
        }
    }

    public static func filter(
        games: [MobileCatalogGame],
        query: String,
        category: CatalogCategory,
        applyCategory: Bool
    ) -> [MobileCatalogGame] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return games.filter { game in
            if applyCategory && !matchesCategory(game, category: category) {
                return false
            }
            if trimmed.isEmpty {
                return true
            }
            let haystack = [
                game.id,
                game.title,
                game.description ?? "",
                game.genre ?? "",
                game.runtime,
                game.ageRating
            ]
            .joined(separator: " ")
            .lowercased()
            return haystack.contains(trimmed)
        }
    }

    public static func presentationMeta(for game: MobileCatalogGame) -> CatalogPresentationMeta {
        let isGodot = game.runtime.lowercased() == "godot-pck"
        let genre = (game.genre?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
            ?? (isGodot ? "Godot 3D" : "HTML5 웹")

        let palettes: [(String, String)] = [
            ("#14532D", "#111315"), // Emerald
            ("#1E3A8A", "#111315"), // Cobalt
            ("#581C87", "#111315"), // Violet
            ("#7C2D12", "#111315"), // Amber-Rust
            ("#134E4A", "#111315"), // Teal
            ("#831843", "#111315")  // Magenta
        ]
        let hash = game.id.unicodeScalars.reduce(0) { ($0 &* 31) &+ Int($1.value) }
        let pair = palettes[abs(hash) % palettes.count]

        let tagCode: String
        if !isGodot {
            tagCode = "WEB"
        } else if game.id.contains("48") {
            tagCode = "4.8"
        } else {
            tagCode = "3D"
        }

        let likePercent = 91 + (abs(hash) % 8)
        let playersK = String(format: "%.1f천", Double(8 + (abs(hash >> 3) % 24)) / 10.0)
        let sizeLabel = isGodot ? "1.9 MB" : "즉시 실행"
        let requiredEngine = isGodot ? (game.id == "nextgen-48-demo" ? "4.8.0" : "4.7.2") : nil

        return CatalogPresentationMeta(
            categoryLabel: genre,
            tagCode: tagCode,
            likeRate: "\(likePercent)%",
            playerCountLabel: playersK,
            sizeLabel: sizeLabel,
            accentStartHex: pair.0,
            accentEndHex: pair.1,
            requiredEngineVersion: requiredEngine
        )
    }
}
