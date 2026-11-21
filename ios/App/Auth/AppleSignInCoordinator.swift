import AuthenticationServices
import CryptoKit
import Foundation

public struct AppleSignInPayload: Sendable {
    public let identityToken: String
    public let authorizationCode: String
    public let rawNonce: String
    public let displayName: String?
}

/// Sign in with Apple coordinator (Apple App Store Guideline 4.8 mandatory alongside Google Sign-In).
/// Generates cryptographic SHA-256 nonces to prevent replay attacks during server JWKS verification.
public enum AppleSignInHelper {
    public static func generateRawNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    public static func sha256Hex(_ input: String) -> String {
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    public static func configureRequest(_ request: ASAuthorizationAppleIDRequest) -> String {
        let rawNonce = generateRawNonce()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256Hex(rawNonce)
        return rawNonce
    }

    public static func extractPayload(from authorization: ASAuthorization, rawNonce: String) -> AppleSignInPayload? {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8),
              let codeData = credential.authorizationCode,
              let authCode = String(data: codeData, encoding: .utf8) else {
            return nil
        }
        let formatter = PersonNameComponentsFormatter()
        let fullName = credential.fullName.map { formatter.string(from: $0).trimmingCharacters(in: .whitespacesAndNewlines) }
        return AppleSignInPayload(
            identityToken: identityToken,
            authorizationCode: authCode,
            rawNonce: rawNonce,
            displayName: (fullName?.isEmpty == false) ? fullName : nil
        )
    }
}
