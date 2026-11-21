import Foundation
#if canImport(CryptoKit)
import CryptoKit
#endif

public struct PckHeaderInfo: Equatable, Codable, Sendable {
    public let formatVersion: UInt32
    public let engineMajor: UInt32
    public let engineMinor: UInt32
    public let enginePatch: UInt32

    public init(formatVersion: UInt32, engineMajor: UInt32, engineMinor: UInt32, enginePatch: UInt32) {
        self.formatVersion = formatVersion
        self.engineMajor = engineMajor
        self.engineMinor = engineMinor
        self.enginePatch = enginePatch
    }
}

public enum PckValidationError: Error, Equatable, LocalizedError {
    case tooSmall(Int)
    case invalidMagic
    case unsupportedFormatVersion(UInt32)
    case incompatibleEngineVersion(major: UInt32, minor: UInt32, patch: UInt32)
    case sha256Mismatch(expected: String, actual: String)
    case fileMissing(String)

    public var errorDescription: String? {
        switch self {
        case let .tooSmall(n):
            return "PCK file too small (\(n) bytes)."
        case .invalidMagic:
            return "Invalid PCK magic header (expected GDPC)."
        case let .unsupportedFormatVersion(v):
            return "Unsupported PCK format_version=\(v)."
        case let .incompatibleEngineVersion(maj, min, pat):
            return "Incompatible Godot PCK engine version \(maj).\(min).\(pat) (embedded runtime is 4.7.2)."
        case let .sha256Mismatch(expected, actual):
            return "PCK SHA-256 mismatch: expected=\(expected) actual=\(actual)"
        case let .fileMissing(path):
            return "PCK file missing: \(path)"
        }
    }
}

/// On-demand Godot 4.7.2 .pck header validator, SHA-256 verifier, iCloud backup exclusion, and LRU cache manager.
public enum PckPackageManager {
    public static let requiredEngineMajor: UInt32 = 4
    public static let requiredEngineMinor: UInt32 = 7
    public static let defaultCacheLimitBytes: Int64 = 2 * 1024 * 1024 * 1024 // 2 GiB LRU cap
    private static let gdpcMagic: [UInt8] = [0x47, 0x44, 0x50, 0x43] // "GDPC"

    public static func verifyHeaderBytes(_ data: Data) throws -> PckHeaderInfo {
        guard data.count >= 20 else {
            throw PckValidationError.tooSmall(data.count)
        }
        let bytes = Array(data.prefix(20))
        guard Array(bytes[0..<4]) == gdpcMagic else {
            throw PckValidationError.invalidMagic
        }
        let formatVersion = readUInt32LE(bytes, offset: 4)
        let major = readUInt32LE(bytes, offset: 8)
        let minor = readUInt32LE(bytes, offset: 12)
        let patch = readUInt32LE(bytes, offset: 16)

        guard (2...4).contains(formatVersion) else {
            throw PckValidationError.unsupportedFormatVersion(formatVersion)
        }
        guard major == requiredEngineMajor && minor <= requiredEngineMinor else {
            throw PckValidationError.incompatibleEngineVersion(major: major, minor: minor, patch: patch)
        }
        return PckHeaderInfo(formatVersion: formatVersion, engineMajor: major, engineMinor: minor, enginePatch: patch)
    }

    public static func verifyFile(at url: URL, expectedSha256: String? = nil) throws -> PckHeaderInfo {
        let fm = FileManager.default
        guard fm.fileExists(atPath: url.path) else {
            throw PckValidationError.fileMissing(url.path)
        }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let headerData = try handle.read(upToCount: 20) ?? Data()
        let info = try verifyHeaderBytes(headerData)

        if let expected = expectedSha256?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !expected.isEmpty {
            let actual = try sha256Hex(ofFileAt: url)
            guard actual == expected else {
                throw PckValidationError.sha256Mismatch(expected: expected, actual: actual)
            }
        }
        return info
    }

    public static func sha256Hex(ofFileAt url: URL) throws -> String {
        #if canImport(CryptoKit)
        var hasher = SHA256()
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        while let chunk = try handle.read(upToCount: 65_536), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
        #else
        let data = try Data(contentsOf: url)
        return sha256Hex(data: data)
        #endif
    }

    public static func cachedPckUrl(baseDirectory: URL, gameId: String, version: String) -> URL {
        let safeId = sanitizePathSegment(gameId)
        let safeVer = sanitizePathSegment(version, allowDot: true)
        return baseDirectory
            .appendingPathComponent("games", isDirectory: true)
            .appendingPathComponent(safeId, isDirectory: true)
            .appendingPathComponent(safeVer, isDirectory: true)
            .appendingPathComponent("game.pck", isDirectory: false)
    }

    /// Apple iOS Data Storage Guidelines require downloaded on-demand game packs
    /// under Application Support to be excluded from iCloud backups.
    public static func excludeFromICloudBackup(url: URL) throws {
        var mutableUrl = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try mutableUrl.setResourceValues(values)
    }

    public static func evictLruCache(
        gamesRoot: URL,
        limitBytes: Int64 = defaultCacheLimitBytes,
        protectedUrl: URL? = nil
    ) {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(
            at: gamesRoot,
            includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else {
            return
        }

        struct CachedFile {
            let url: URL
            let size: Int64
            let modified: Date
        }

        var files: [CachedFile] = []
        var totalBytes: Int64 = 0
        for case let fileUrl as URL in enumerator {
            guard fileUrl.pathExtension.lowercased() == "pck" else { continue }
            guard let vals = try? fileUrl.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]),
                  vals.isRegularFile == true else { continue }
            let size = Int64(vals.fileSize ?? 0)
            let modified = vals.contentModificationDate ?? .distantPast
            files.append(CachedFile(url: fileUrl, size: size, modified: modified))
            totalBytes += size
        }

        guard totalBytes > limitBytes else { return }
        let protectedPath = protectedUrl?.standardizedFileURL.path
        files.sort { $0.modified < $1.modified }
        for entry in files {
            if totalBytes <= limitBytes { break }
            if let protectedPath, entry.url.standardizedFileURL.path == protectedPath {
                continue
            }
            if (try? fm.removeItem(at: entry.url)) != nil {
                totalBytes -= entry.size
            }
        }
    }

    private static func sanitizePathSegment(_ raw: String, allowDot: Bool = false) -> String {
        let scalars = raw.unicodeScalars.map { scalar -> Character in
            let v = scalar.value
            let isAlnum = (v >= 48 && v <= 57) || (v >= 65 && v <= 90) || (v >= 97 && v <= 122)
            let isAllowedPunct = (v == 95 || v == 45 || (allowDot && v == 46))
            return (isAlnum || isAllowedPunct) ? Character(scalar) : "_"
        }
        let cleaned = String(scalars)
        return cleaned.isEmpty || cleaned == "." || cleaned == ".." ? "_" : cleaned
    }

    private static func readUInt32LE(_ bytes: [UInt8], offset: Int) -> UInt32 {
        UInt32(bytes[offset])
            | (UInt32(bytes[offset + 1]) << 8)
            | (UInt32(bytes[offset + 2]) << 16)
            | (UInt32(bytes[offset + 3]) << 24)
    }

    #if !canImport(CryptoKit)
    private static func sha256Hex(data: Data) -> String {
        // Fallback stub only used on non-Apple platforms lacking CryptoKit.
        return String(format: "%064x", data.hashValue)
    }
    #endif
}
