package com.playhub.aos.network

import com.playhub.aos.compliance.GameAgeRating
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class MobileTokens(
    val accessToken: String,
    val refreshToken: String,
    val principalId: String,
    val displayName: String,
    val handle: String,
    val isGuest: Boolean,
    val ageTier: String,
    val authProvider: String = if (isGuest) "guest" else "registered"
)

data class AuthProvidersDto(
    val email: Boolean,
    val google: Boolean,
    val naver: Boolean,
    val guest: Boolean
)

data class RemoteGameItem(
    val id: String,
    val title: String,
    val description: String,
    val genre: String,
    val runtime: String,
    val buildId: String,
    val ageRating: GameAgeRating,
    val allowed: Boolean,
    val entryUrl: String,
    val pckUrl: String?,
    val pckBytes: Long,
    val requiredEngineVersion: String?,
    val minAppVersionCode: Int,
    val deployMode: String = "singleplay",
    val multiplayerWsUrl: String? = null
)

data class CloudSaveResult(
    val revision: Int,
    val etag: String?,
    val payloadJson: String
)

data class SocialPresenceDto(
    val status: String,
    val online: Boolean,
    val gameId: String?,
    val gameTitle: String?,
    val roomCode: String?,
    val joinable: Boolean
)

data class SocialProfileDto(
    val principalId: String,
    val displayName: String,
    val handle: String,
    val avatarColor: String,
    val bio: String,
    val privacyLevel: String,
    val ageTier: String,
    val parentalConsentStatus: String
)

data class SocialFriendDto(
    val principalId: String,
    val displayName: String,
    val handle: String,
    val avatarColor: String,
    val presence: SocialPresenceDto,
    val lastMessage: String?,
    val lastMessageAt: String?,
    val lastMessageFromMe: Boolean
)

data class SocialRequestDto(
    val principalId: String,
    val displayName: String,
    val handle: String,
    val avatarColor: String
)

data class SocialSearchUserDto(
    val principalId: String,
    val displayName: String,
    val handle: String,
    val avatarColor: String,
    val isFriend: Boolean,
    val presence: SocialPresenceDto
)

data class SocialFriendsPayload(
    val friends: List<SocialFriendDto>,
    val incomingRequests: List<SocialRequestDto>,
    val outgoingRequests: List<SocialRequestDto>
)

data class SocialMessageDto(
    val id: String,
    val senderId: String,
    val senderName: String,
    val senderHandle: String,
    val senderMe: Boolean,
    val body: String,
    val isQuickMessage: Boolean,
    val createdAt: String
)

data class SocialPartyMemberDto(
    val principalId: String,
    val displayName: String,
    val handle: String,
    val avatarColor: String,
    val role: String,
    val ready: Boolean,
    val presence: SocialPresenceDto
)

data class SocialLaunchParticipantDto(
    val principalId: String,
    val displayName: String,
    val handle: String,
    val platform: String,
    val state: String
)

data class SocialPartyLaunchDto(
    val launchId: String,
    val gameId: String,
    val roomCode: String,
    val matchRoomId: String,
    val launchedBy: String,
    val status: String,
    val createdAt: String,
    val participants: List<SocialLaunchParticipantDto>
)

data class SocialPartyDto(
    val id: String,
    val leaderId: String,
    val title: String,
    val targetGameId: String?,
    val roomCode: String,
    val maxMembers: Int,
    val inviteUrl: String,
    val deepLinkUrl: String,
    val members: List<SocialPartyMemberDto>,
    val activeLaunch: SocialPartyLaunchDto? = null
)

data class LeaderboardEntryDto(
    val rank: Int,
    val principalId: String,
    val displayName: String,
    val handle: String,
    val avatarColor: String,
    val score: Long,
    val isMe: Boolean
)

data class QuickMessageDto(
    val id: String,
    val text: String
)

/**
 * Zero-dependency PlayHub Mobile HTTP client (HttpURLConnection + MiniJson).
 * Preserves minimal APK DEX footprint (~0.27 MiB total app code).
 */
class PlayHubApiClient(private val baseUrl: String) {
    private val normalizedBase = baseUrl.trimEnd('/')

    @Suppress("UNCHECKED_CAST")
    fun fetchAuthProviders(): AuthProvidersDto {
        val resp = request("GET", "/api/mobile/auth/providers")!!
        val p = resp.body["providers"] as? Map<String, Any?> ?: emptyMap()
        return AuthProvidersDto(
            email = p["email"] as? Boolean ?: true,
            google = p["google"] as? Boolean ?: false,
            naver = p["naver"] as? Boolean ?: false,
            guest = p["guest"] as? Boolean ?: true
        )
    }

    fun createGuestSession(): MobileTokens {
        val resp = request("POST", "/api/mobile/auth/guest", bodyJson = "{}")!!
        return parseTokenResponse(resp.body)
    }

    fun registerEmail(email: String, password: String, displayName: String? = null, accessToken: String? = null): MobileTokens {
        val map = mutableMapOf<String, Any?>("email" to email, "password" to password)
        if (!displayName.isNullOrBlank()) map["displayName"] = displayName
        val resp = request("POST", "/api/mobile/auth/email/register", token = accessToken, bodyJson = MiniJson.stringify(map))!!
        return parseTokenResponse(resp.body)
    }

    fun loginEmail(email: String, password: String, accessToken: String? = null): MobileTokens {
        val payload = MiniJson.stringify(mapOf("email" to email, "password" to password))
        val resp = request("POST", "/api/mobile/auth/email/login", token = accessToken, bodyJson = payload)!!
        return parseTokenResponse(resp.body)
    }

    fun loginGoogle(idToken: String, nonce: String? = null, accessToken: String? = null): MobileTokens {
        val map = mutableMapOf<String, Any?>("idToken" to idToken)
        if (!nonce.isNullOrBlank()) map["nonce"] = nonce
        val resp = request("POST", "/api/mobile/auth/google", token = accessToken, bodyJson = MiniJson.stringify(map))!!
        return parseTokenResponse(resp.body)
    }

    fun loginNaver(naverAccessToken: String, accessToken: String? = null): MobileTokens {
        val payload = MiniJson.stringify(mapOf("accessToken" to naverAccessToken))
        val resp = request("POST", "/api/mobile/auth/naver", token = accessToken, bodyJson = payload)!!
        return parseTokenResponse(resp.body)
    }

    fun refreshSession(refreshToken: String): MobileTokens {
        val payload = MiniJson.stringify(mapOf("refreshToken" to refreshToken))
        val resp = request("POST", "/api/mobile/auth/refresh", bodyJson = payload)!!
        return parseTokenResponse(resp.body)
    }

    fun submitAgeGate(accessToken: String, birthYear: Int, birthMonth: Int, regionCode: String): Map<String, Any?> {
        val payload = MiniJson.stringify(
            mapOf("birthYear" to birthYear, "birthMonth" to birthMonth, "regionCode" to regionCode)
        )
        return request("POST", "/api/mobile/age-gate", token = accessToken, bodyJson = payload)!!.body
    }

    @Suppress("UNCHECKED_CAST")
    fun fetchCatalog(
        accessToken: String?,
        engineVersion: String = "4.7.2",
        appVersionCode: Int = 1
    ): List<RemoteGameItem> {
        val resp = request(
            "GET",
            "/api/mobile/catalog",
            token = accessToken,
            headers = mapOf(
                "X-PlayHub-Engine-Version" to engineVersion,
                "X-PlayHub-App-Version-Code" to appVersionCode.toString()
            )
        )!!
        val arr = resp.body["games"] as? List<*> ?: return emptyList()
        val items = mutableListOf<RemoteGameItem>()
        for (entry in arr) {
            val g = entry as? Map<String, Any?> ?: continue
            val id = g["id"] as? String ?: continue
            val androidObj = g["android"] as? Map<String, Any?>
            val mpObj = g["multiplayer"] as? Map<String, Any?>
            val deployMode = (g["deployMode"] as? String)?.takeIf { it.isNotBlank() } ?: "singleplay"
            val rawWsPath = (mpObj?.get("wsPath") as? String)?.takeIf { it.isNotBlank() }
            val resolvedWsUrl = rawWsPath?.let { resolveWsUrl(it) }
            val rawEntry = g["entryUrl"] as? String ?: ""
            val rawPck = (androidObj?.get("pckUrl") as? String)?.takeIf { it.isNotBlank() }
            items += RemoteGameItem(
                id = id,
                title = g["title"] as? String ?: id,
                description = g["description"] as? String ?: "",
                genre = g["genre"] as? String ?: "action",
                runtime = g["runtime"] as? String ?: "web",
                buildId = g["buildId"] as? String ?: "1.0.0",
                ageRating = GameAgeRating.fromCode(g["ageRating"] as? String),
                allowed = g["allowed"] as? Boolean ?: true,
                entryUrl = resolveUrl(rawEntry),
                pckUrl = rawPck?.let { resolveUrl(it) },
                pckBytes = (androidObj?.get("pckBytes") as? Number)?.toLong() ?: 0L,
                requiredEngineVersion = androidObj?.get("engineVersion") as? String,
                minAppVersionCode = (androidObj?.get("minAppVersionCode") as? Number)?.toInt() ?: 1,
                deployMode = deployMode,
                multiplayerWsUrl = resolvedWsUrl
            )
        }
        return items
    }

    fun createPlaySession(accessToken: String, gameId: String): Map<String, Any?> {
        val payload = MiniJson.stringify(mapOf("gameId" to gameId))
        return request("POST", "/api/mobile/play-sessions", token = accessToken, bodyJson = payload)!!.body
    }

    fun loadCloudSave(accessToken: String, gameId: String, slot: String = "main"): CloudSaveResult? {
        val resp = request("GET", "/api/mobile/saves/$gameId?slot=$slot", token = accessToken, allowNotFound = true)
            ?: return null
        return CloudSaveResult(
            revision = (resp.body["revision"] as? Number)?.toInt() ?: 0,
            etag = resp.etag,
            payloadJson = MiniJson.stringify(resp.body["payload"] ?: emptyMap<String, Any>())
        )
    }

    fun writeCloudSave(
        accessToken: String,
        gameId: String,
        payloadJson: String,
        expectedEtag: String?,
        slot: String = "main"
    ): CloudSaveResult {
        val headers = mutableMapOf<String, String>()
        if (expectedEtag.isNullOrBlank()) headers["If-None-Match"] = "*"
        else headers["If-Match"] = expectedEtag
        val body = """{"schemaVersion":1,"payload":$payloadJson}"""
        val resp = request("PUT", "/api/mobile/saves/$gameId?slot=$slot", token = accessToken, headers = headers, bodyJson = body)!!
        return CloudSaveResult(
            revision = (resp.body["revision"] as? Number)?.toInt() ?: 1,
            etag = resp.etag,
            payloadJson = payloadJson
        )
    }

    // ---- M3 Social, Friends, Presence, Party, Chat, Moderation & Leaderboards ----

    fun fetchSocialProfile(accessToken: String): SocialProfileDto {
        val b = request("GET", "/api/mobile/social/profile", token = accessToken)!!.body
        return SocialProfileDto(
            principalId = b["principalId"] as? String ?: "",
            displayName = b["displayName"] as? String ?: "Player",
            handle = b["handle"] as? String ?: "player#0000",
            avatarColor = b["avatarColor"] as? String ?: "#00B06F",
            bio = b["bio"] as? String ?: "",
            privacyLevel = b["privacyLevel"] as? String ?: "public",
            ageTier = b["ageTier"] as? String ?: "UNKNOWN",
            parentalConsentStatus = b["parentalConsentStatus"] as? String ?: "not_required"
        )
    }

    fun updateSocialProfile(
        accessToken: String,
        displayName: String? = null,
        avatarColor: String? = null,
        bio: String? = null
    ): SocialProfileDto {
        val map = mutableMapOf<String, Any?>()
        if (displayName != null) map["displayName"] = displayName
        if (avatarColor != null) map["avatarColor"] = avatarColor
        if (bio != null) map["bio"] = bio
        val b = request("PUT", "/api/mobile/social/profile", token = accessToken, bodyJson = MiniJson.stringify(map))!!.body
        return SocialProfileDto(
            principalId = b["principalId"] as? String ?: "",
            displayName = b["displayName"] as? String ?: "Player",
            handle = b["handle"] as? String ?: "player#0000",
            avatarColor = b["avatarColor"] as? String ?: "#00B06F",
            bio = b["bio"] as? String ?: "",
            privacyLevel = b["privacyLevel"] as? String ?: "public",
            ageTier = b["ageTier"] as? String ?: "UNKNOWN",
            parentalConsentStatus = b["parentalConsentStatus"] as? String ?: "not_required"
        )
    }

    @Suppress("UNCHECKED_CAST")
    fun searchSocialUsers(accessToken: String, query: String): List<SocialSearchUserDto> {
        val enc = URLEncoder.encode(query.trim(), "UTF-8")
        val b = request("GET", "/api/mobile/social/users/search?q=$enc", token = accessToken)!!.body
        val list = b["users"] as? List<*> ?: return emptyList()
        return list.mapNotNull { entry ->
            val u = entry as? Map<String, Any?> ?: return@mapNotNull null
            SocialSearchUserDto(
                principalId = u["principalId"] as? String ?: return@mapNotNull null,
                displayName = u["displayName"] as? String ?: "Player",
                handle = u["handle"] as? String ?: "player#0000",
                avatarColor = u["avatarColor"] as? String ?: "#00B06F",
                isFriend = u["isFriend"] as? Boolean ?: false,
                presence = parsePresence(u["presence"] as? Map<String, Any?>)
            )
        }
    }

    @Suppress("UNCHECKED_CAST")
    fun fetchSocialFriends(accessToken: String): SocialFriendsPayload {
        val b = request("GET", "/api/mobile/social/friends", token = accessToken)!!.body
        val friends = (b["friends"] as? List<*> ?: emptyList<Any>()).mapNotNull { entry ->
            val f = entry as? Map<String, Any?> ?: return@mapNotNull null
            SocialFriendDto(
                principalId = f["principalId"] as? String ?: return@mapNotNull null,
                displayName = f["displayName"] as? String ?: "Player",
                handle = f["handle"] as? String ?: "player#0000",
                avatarColor = f["avatarColor"] as? String ?: "#00B06F",
                presence = parsePresence(f["presence"] as? Map<String, Any?>),
                lastMessage = f["lastMessage"] as? String,
                lastMessageAt = f["lastMessageAt"] as? String,
                lastMessageFromMe = f["lastMessageFromMe"] as? Boolean ?: false
            )
        }
        val incoming = (b["incomingRequests"] as? List<*> ?: emptyList<Any>()).mapNotNull { entry ->
            val r = entry as? Map<String, Any?> ?: return@mapNotNull null
            SocialRequestDto(
                principalId = r["principalId"] as? String ?: return@mapNotNull null,
                displayName = r["displayName"] as? String ?: "Player",
                handle = r["handle"] as? String ?: "player#0000",
                avatarColor = r["avatarColor"] as? String ?: "#00B06F"
            )
        }
        val outgoing = (b["outgoingRequests"] as? List<*> ?: emptyList<Any>()).mapNotNull { entry ->
            val r = entry as? Map<String, Any?> ?: return@mapNotNull null
            SocialRequestDto(
                principalId = r["principalId"] as? String ?: return@mapNotNull null,
                displayName = r["displayName"] as? String ?: "Player",
                handle = r["handle"] as? String ?: "player#0000",
                avatarColor = r["avatarColor"] as? String ?: "#00B06F"
            )
        }
        return SocialFriendsPayload(friends, incoming, outgoing)
    }

    fun sendFriendRequest(accessToken: String, targetHandle: String): Map<String, Any?> {
        val body = MiniJson.stringify(mapOf("targetHandle" to targetHandle.trim()))
        return request("POST", "/api/mobile/social/friends/request", token = accessToken, bodyJson = body)!!.body
    }

    fun respondFriendRequest(accessToken: String, requesterId: String, accept: Boolean): Map<String, Any?> {
        val body = MiniJson.stringify(mapOf("requesterId" to requesterId, "action" to if (accept) "accept" else "decline"))
        return request("POST", "/api/mobile/social/friends/respond", token = accessToken, bodyJson = body)!!.body
    }

    fun blockUser(accessToken: String, targetPrincipalId: String) {
        val body = MiniJson.stringify(mapOf("targetPrincipalId" to targetPrincipalId))
        request("POST", "/api/mobile/social/blocks", token = accessToken, bodyJson = body)
    }

    fun reportSocialTarget(accessToken: String, targetType: String, targetId: String, reason: String) {
        val body = MiniJson.stringify(mapOf("targetType" to targetType, "targetId" to targetId, "reason" to reason))
        request("POST", "/api/mobile/social/reports", token = accessToken, bodyJson = body)
    }

    fun updatePresence(
        accessToken: String,
        status: String,
        gameId: String? = null,
        gameTitle: String? = null,
        roomCode: String? = null,
        joinable: Boolean = true
    ) {
        val map = mutableMapOf<String, Any?>("status" to status, "joinable" to joinable)
        if (gameId != null) map["gameId"] = gameId
        if (gameTitle != null) map["gameTitle"] = gameTitle
        if (roomCode != null) map["roomCode"] = roomCode
        request("POST", "/api/mobile/social/presence", token = accessToken, bodyJson = MiniJson.stringify(map))
    }

    @Suppress("UNCHECKED_CAST")
    fun fetchSocialMessages(accessToken: String, channelType: String, targetId: String): List<SocialMessageDto> {
        val param = if (channelType == "party") "partyId" else "peerId"
        val enc = URLEncoder.encode(targetId, "UTF-8")
        val b = request("GET", "/api/mobile/social/messages?channelType=$channelType&$param=$enc", token = accessToken)!!.body
        val arr = b["messages"] as? List<*> ?: return emptyList()
        return arr.mapNotNull { entry ->
            val m = entry as? Map<String, Any?> ?: return@mapNotNull null
            SocialMessageDto(
                id = m["id"] as? String ?: return@mapNotNull null,
                senderId = m["senderId"] as? String ?: "",
                senderName = m["senderName"] as? String ?: "Player",
                senderHandle = m["senderHandle"] as? String ?: "player#0000",
                senderMe = m["senderMe"] as? Boolean ?: false,
                body = m["body"] as? String ?: "",
                isQuickMessage = m["isQuickMessage"] as? Boolean ?: false,
                createdAt = m["createdAt"] as? String ?: ""
            )
        }
    }

    fun sendSocialMessage(
        accessToken: String,
        channelType: String,
        targetId: String,
        bodyText: String? = null,
        quickMessageId: String? = null
    ): SocialMessageDto {
        val map = mutableMapOf<String, Any?>("channelType" to channelType)
        if (channelType == "party") map["partyId"] = targetId else map["peerId"] = targetId
        if (quickMessageId != null) map["quickMessageId"] = quickMessageId else map["body"] = bodyText.orEmpty()
        val m = request("POST", "/api/mobile/social/messages", token = accessToken, bodyJson = MiniJson.stringify(map))!!.body
        return SocialMessageDto(
            id = m["id"] as? String ?: "",
            senderId = m["senderId"] as? String ?: "",
            senderName = "나",
            senderHandle = "",
            senderMe = true,
            body = m["body"] as? String ?: bodyText.orEmpty(),
            isQuickMessage = m["isQuickMessage"] as? Boolean ?: false,
            createdAt = m["createdAt"] as? String ?: ""
        )
    }

    @Suppress("UNCHECKED_CAST")
    fun fetchMyParty(accessToken: String): SocialPartyDto? {
        val b = request("GET", "/api/mobile/social/parties/me", token = accessToken)!!.body
        val p = b["party"] as? Map<String, Any?> ?: return null
        return parseParty(p)
    }

    @Suppress("UNCHECKED_CAST")
    fun createParty(accessToken: String, title: String, targetGameId: String? = null): SocialPartyDto {
        val map = mutableMapOf<String, Any?>("title" to title)
        if (targetGameId != null) map["targetGameId"] = targetGameId
        val b = request("POST", "/api/mobile/social/parties", token = accessToken, bodyJson = MiniJson.stringify(map))!!.body
        return parseParty(b["party"] as Map<String, Any?>)
    }

    @Suppress("UNCHECKED_CAST")
    fun joinParty(accessToken: String, roomCode: String): SocialPartyDto {
        val body = MiniJson.stringify(mapOf("roomCode" to roomCode.trim().uppercase()))
        val b = request("POST", "/api/mobile/social/parties/join", token = accessToken, bodyJson = body)!!.body
        return parseParty(b["party"] as Map<String, Any?>)
    }

    @Suppress("UNCHECKED_CAST")
    fun setPartyReady(accessToken: String, partyId: String, ready: Boolean): SocialPartyDto {
        val body = MiniJson.stringify(mapOf("ready" to ready))
        val b = request("POST", "/api/mobile/social/parties/$partyId/ready", token = accessToken, bodyJson = body)!!.body
        return parseParty(b["party"] as Map<String, Any?>)
    }

    fun leaveParty(accessToken: String, partyId: String) {
        request("POST", "/api/mobile/social/parties/$partyId/leave", token = accessToken, bodyJson = "{}")
    }

    @Suppress("UNCHECKED_CAST")
    fun launchParty(
        accessToken: String,
        partyId: String,
        gameId: String,
        gameTitle: String? = null
    ): SocialPartyDto {
        val map = mutableMapOf<String, Any?>("gameId" to gameId, "platform" to "android")
        if (!gameTitle.isNullOrBlank()) map["gameTitle"] = gameTitle
        val b = request(
            "POST",
            "/api/mobile/social/parties/$partyId/launch",
            token = accessToken,
            headers = mapOf("X-PlayHub-Platform" to "android"),
            bodyJson = MiniJson.stringify(map)
        )!!.body
        return parseParty(b["party"] as Map<String, Any?>)
    }

    @Suppress("UNCHECKED_CAST")
    fun ackPartyLaunch(
        accessToken: String,
        partyId: String,
        launchId: String,
        state: String = "entered",
        gameTitle: String? = null
    ): SocialPartyDto {
        val map = mutableMapOf<String, Any?>("launchId" to launchId, "state" to state, "platform" to "android")
        if (!gameTitle.isNullOrBlank()) map["gameTitle"] = gameTitle
        val b = request(
            "POST",
            "/api/mobile/social/parties/$partyId/launch/ack",
            token = accessToken,
            headers = mapOf("X-PlayHub-Platform" to "android"),
            bodyJson = MiniJson.stringify(map)
        )!!.body
        return parseParty(b["party"] as Map<String, Any?>)
    }

    @Suppress("UNCHECKED_CAST")
    fun fetchLeaderboard(
        accessToken: String?,
        gameId: String,
        boardId: String = "high_score",
        scope: String = "global"
    ): List<LeaderboardEntryDto> {
        val b = request("GET", "/api/mobile/social/leaderboards/$gameId/$boardId?scope=$scope", token = accessToken)!!.body
        val arr = b["entries"] as? List<*> ?: return emptyList()
        return arr.mapNotNull { entry ->
            val e = entry as? Map<String, Any?> ?: return@mapNotNull null
            LeaderboardEntryDto(
                rank = (e["rank"] as? Number)?.toInt() ?: 0,
                principalId = e["principalId"] as? String ?: "",
                displayName = e["displayName"] as? String ?: "Player",
                handle = e["handle"] as? String ?: "",
                avatarColor = e["avatarColor"] as? String ?: "#00B06F",
                score = (e["score"] as? Number)?.toLong() ?: 0L,
                isMe = e["isMe"] as? Boolean ?: false
            )
        }
    }

    @Suppress("UNCHECKED_CAST")
    fun fetchQuickMessages(): List<QuickMessageDto> {
        val b = request("GET", "/api/mobile/social/quick-messages")!!.body
        val arr = b["quickMessages"] as? List<*> ?: return emptyList()
        return arr.mapNotNull { entry ->
            val q = entry as? Map<String, Any?> ?: return@mapNotNull null
            QuickMessageDto(
                id = q["id"] as? String ?: return@mapNotNull null,
                text = q["text"] as? String ?: return@mapNotNull null
            )
        }
    }

    private fun parsePresence(obj: Map<String, Any?>?): SocialPresenceDto = SocialPresenceDto(
        status = obj?.get("status") as? String ?: "offline",
        online = obj?.get("online") as? Boolean ?: false,
        gameId = obj?.get("gameId") as? String,
        gameTitle = obj?.get("gameTitle") as? String,
        roomCode = obj?.get("roomCode") as? String,
        joinable = obj?.get("joinable") as? Boolean ?: false
    )

    @Suppress("UNCHECKED_CAST")
    private fun parseParty(p: Map<String, Any?>): SocialPartyDto {
        val members = (p["members"] as? List<*> ?: emptyList<Any>()).mapNotNull { entry ->
            val m = entry as? Map<String, Any?> ?: return@mapNotNull null
            SocialPartyMemberDto(
                principalId = m["principalId"] as? String ?: return@mapNotNull null,
                displayName = m["displayName"] as? String ?: "Player",
                handle = m["handle"] as? String ?: "player#0000",
                avatarColor = m["avatarColor"] as? String ?: "#00B06F",
                role = m["role"] as? String ?: "member",
                ready = m["ready"] as? Boolean ?: false,
                presence = parsePresence(m["presence"] as? Map<String, Any?>)
            )
        }
        val launchMap = p["activeLaunch"] as? Map<String, Any?>
        val activeLaunch = if (launchMap != null) {
            val participants = (launchMap["participants"] as? List<*> ?: emptyList<Any>()).mapNotNull { entry ->
                val pt = entry as? Map<String, Any?> ?: return@mapNotNull null
                SocialLaunchParticipantDto(
                    principalId = pt["principalId"] as? String ?: return@mapNotNull null,
                    displayName = pt["displayName"] as? String ?: "Player",
                    handle = pt["handle"] as? String ?: "",
                    platform = pt["platform"] as? String ?: "web",
                    state = pt["state"] as? String ?: "entered"
                )
            }
            SocialPartyLaunchDto(
                launchId = launchMap["launchId"] as? String ?: "",
                gameId = launchMap["gameId"] as? String ?: "",
                roomCode = launchMap["roomCode"] as? String ?: "",
                matchRoomId = launchMap["matchRoomId"] as? String ?: "",
                launchedBy = launchMap["launchedBy"] as? String ?: "",
                status = launchMap["status"] as? String ?: "active",
                createdAt = launchMap["createdAt"] as? String ?: "",
                participants = participants
            )
        } else null
        return SocialPartyDto(
            id = p["id"] as? String ?: "",
            leaderId = p["leaderId"] as? String ?: "",
            title = p["title"] as? String ?: "파티",
            targetGameId = p["targetGameId"] as? String,
            roomCode = p["roomCode"] as? String ?: "",
            maxMembers = (p["maxMembers"] as? Number)?.toInt() ?: 8,
            inviteUrl = p["inviteUrl"] as? String ?: "",
            deepLinkUrl = p["deepLinkUrl"] as? String ?: "",
            members = members,
            activeLaunch = activeLaunch
        )
    }

    private fun resolveUrl(pathOrUrl: String): String {
        if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl
        return "$normalizedBase/${pathOrUrl.trimStart('/')}"
    }

    private fun resolveWsUrl(pathOrUrl: String): String {
        if (pathOrUrl.startsWith("ws://") || pathOrUrl.startsWith("wss://")) return pathOrUrl
        val wsBase = when {
            normalizedBase.startsWith("https://") -> "wss://" + normalizedBase.removePrefix("https://")
            normalizedBase.startsWith("http://") -> "ws://" + normalizedBase.removePrefix("http://")
            else -> "ws://$normalizedBase"
        }
        return "$wsBase/${pathOrUrl.trimStart('/')}"
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseTokenResponse(obj: Map<String, Any?>): MobileTokens {
        val prof = obj["profile"] as? Map<String, Any?> ?: emptyMap()
        val comp = prof["ageCompliance"] as? Map<String, Any?> ?: emptyMap()
        return MobileTokens(
            accessToken = obj["accessToken"] as? String ?: "",
            refreshToken = obj["refreshToken"] as? String ?: "",
            principalId = prof["principalId"] as? String ?: "",
            displayName = prof["displayName"] as? String ?: "게스트 플레이어",
            handle = prof["handle"] as? String ?: "@guest",
            isGuest = prof["isGuest"] as? Boolean ?: true,
            ageTier = comp["ageTier"] as? String ?: "UNKNOWN",
            authProvider = prof["authProvider"] as? String ?: if (prof["isGuest"] as? Boolean ?: true) "guest" else "registered"
        )
    }

    private data class HttpResp(val code: Int, val etag: String?, val body: Map<String, Any?>)

    @Suppress("UNCHECKED_CAST")
    private fun request(
        method: String,
        path: String,
        token: String? = null,
        headers: Map<String, String> = emptyMap(),
        bodyJson: String? = null,
        allowNotFound: Boolean = false
    ): HttpResp? {
        val conn = (URL("$normalizedBase$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 6_000
            readTimeout = 10_000
            setRequestProperty("Accept", "application/json")
            if (!token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $token")
            for ((k, v) in headers) setRequestProperty(k, v)
            if (bodyJson != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (bodyJson != null) {
                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(bodyJson) }
            }
            val code = conn.responseCode
            if (allowNotFound && code == 404) return null
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val raw = stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use { r -> r.readText() } }.orEmpty()
            val parsed = if (raw.isNotBlank()) runCatching { MiniJson.parseObject(raw) }.getOrDefault(emptyMap()) else emptyMap()
            if (code !in 200..299) {
                val errObj = parsed["error"] as? Map<String, Any?>
                val errCode = errObj?.get("code") as? String ?: "HTTP_$code"
                val errMsg = errObj?.get("message") as? String ?: errCode
                throw IllegalStateException("$errCode: $errMsg")
            }
            return HttpResp(code, conn.getHeaderField("ETag"), parsed)
        } finally {
            conn.disconnect()
        }
    }
}
