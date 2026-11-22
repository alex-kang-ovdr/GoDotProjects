package com.playhub.aos.ui

import android.app.Activity
import android.app.AlertDialog
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.Spannable
import android.text.SpannableString
import android.text.TextUtils
import android.text.TextWatcher
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowInsets
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.playhub.aos.BuildConfig
import com.playhub.aos.R
import com.playhub.aos.auth.AuthProfile
import com.playhub.aos.auth.AuthSessionStore
import com.playhub.aos.compliance.AgeGateDialog
import com.playhub.aos.compliance.AgeGatePolicy
import com.playhub.aos.compliance.AgeTier
import com.playhub.aos.compliance.GameAgeRating
import com.playhub.aos.config.FarmCluster
import com.playhub.aos.config.FarmHealthChecker
import com.playhub.aos.config.FarmHealthResult
import com.playhub.aos.config.FarmHealthStatus
import com.playhub.aos.config.FarmServerRegistry
import com.playhub.aos.network.LeaderboardEntryDto
import com.playhub.aos.network.PlayHubApiClient
import com.playhub.aos.network.QuickMessageDto
import com.playhub.aos.network.SocialFriendDto
import com.playhub.aos.network.SocialMessageDto
import com.playhub.aos.network.SocialPartyDto
import com.playhub.aos.network.SocialPartyLaunchDto
import com.playhub.aos.network.SocialProfileDto
import com.playhub.aos.network.SocialRequestDto
import com.playhub.aos.network.SocialSearchUserDto
import com.playhub.aos.runtime.GodotAvatarStudioActivity
import com.playhub.aos.runtime.GodotPlayerActivity
import com.playhub.aos.runtime.InlineGodotAvatarStage
import com.playhub.aos.runtime.PckPackageManager
import com.playhub.aos.runtime.VersionCompatibilityChecker
import com.playhub.aos.runtime.WebGameActivity
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

private object StitchColors {
    const val SURFACE = "#191B1D"
    const val SURFACE_LOWEST = "#111315"
    const val SURFACE_LOW = "#1F2225"
    const val SURFACE_CONTAINER = "#232629"
    const val SURFACE_HIGH = "#2B2E32"
    const val SURFACE_HIGHEST = "#34383C"
    const val OUTLINE = "#5D5E61"
    const val OUTLINE_VARIANT = "#34383C"
    const val ON_SURFACE = "#FFFFFF"
    const val ON_SURFACE_VARIANT = "#AAABAD"
    const val PLAY_GREEN = "#00B06F"
    const val ON_PLAY_GREEN = "#002111"
    const val ONLINE_DOT = "#00E290"
    const val COIN_GOLD = "#FFD147"
    const val ERROR = "#FF716C"
    const val WARN_AMBER = "#F59E0B"
}

private data class CatalogGame(
    val id: String,
    val title: String,
    val subtitle: String,
    val category: String,
    val categoryLabel: String,
    val runtime: String, // "godot-pck" or "web"
    val version: String,
    val ageRating: GameAgeRating,
    val pckPathOrUrl: String,
    val sizeLabel: String,
    val likeRate: String = "94%",
    val playerCountLabel: String = "1.2천",
    val requiredEngineVersion: String? = null,
    val minAppVersionCode: Int = 1,
    val accentStart: String = "#14532D",
    val accentEnd: String = "#111315",
    val tagCode: String = "3D",
    val deployMode: String = "singleplay",
    val multiplayerWsUrl: String? = null
)

private data class ActiveChatTarget(
    val channelType: String, // "dm" or "party"
    val targetId: String,    // peerPrincipalId or partyId
    val title: String,
    val subtitle: String,
    val avatarColor: String,
    val online: Boolean,
    val playingGameId: String? = null,
    val roomCode: String? = null
)

/**
 * Play Hub Android Main Shell — High-Contrast Dark Modern UI (Stitch Design System + Official PlayHub Logo).
 * - Full M3 Social Integration: Live Profile/Handle, Friends Search/Request/Accept, Real-Time Presence,
 *   Party Lobby (Create/Join Room Code/Ready/Leave/Deep Link), Real 1:1 DM & Party Chat,
 *   Child-Safe Quick Messages, Block/Report Moderation, and Live Leaderboards.
 */
class MainActivity : Activity() {

    private enum class HubTab(val label: String, val iconRes: Int) {
        HOME("홈", R.drawable.ic_nav_home),
        EXPLORE("탐색", R.drawable.ic_nav_explore),
        AVATAR("아바타", R.drawable.ic_nav_avatar),
        CHAT("채팅", R.drawable.ic_nav_chat),
        MORE("더보기", R.drawable.ic_nav_more)
    }

    private data class NavTabViews(val root: LinearLayout, val icon: ImageView, val label: TextView)

    private lateinit var authStore: AuthSessionStore
    private lateinit var profile: AuthProfile
    private lateinit var activeFarm: FarmCluster
    private var activeTab: HubTab = HubTab.HOME
    private var searchOpen: Boolean = false
    private var searchQuery: String = ""
    private var selectedCategory: String = "all"
    private var chatFilterOnlineOnly: Boolean = false
    private var activeChatTarget: ActiveChatTarget? = null
    private var activeChatMessages: List<SocialMessageDto> = emptyList()
    private var remoteCatalog: List<CatalogGame>? = null
    private var syncStatusText: String = "서버 연결 준비 중..."

    // Live M3 Social State
    private var remoteSocialProfile: SocialProfileDto? = null
    private var remoteFriends: List<SocialFriendDto> = emptyList()
    private var remoteIncomingRequests: List<SocialRequestDto> = emptyList()
    private var remoteOutgoingRequests: List<SocialRequestDto> = emptyList()
    private var remoteActiveParty: SocialPartyDto? = null
    private var safeQuickMessages: List<QuickMessageDto> = listOf(
        QuickMessageDto("qm_hi", "안녕!"),
        QuickMessageDto("qm_play", "같이 플레이할래?"),
        QuickMessageDto("qm_ready", "준비 완료!"),
        QuickMessageDto("qm_gg", "잘했어!"),
        QuickMessageDto("qm_wait", "잠시만 기다려줘!")
    )
    private var pendingDeepLinkUri: Uri? = null

    private lateinit var topBarView: LinearLayout
    private lateinit var headerSearchRow: LinearLayout
    private lateinit var headerSearchInput: EditText
    private lateinit var headerSearchBtnIcon: ImageView
    private lateinit var bottomBarView: LinearLayout
    private var farmPillContainer: LinearLayout? = null
    private var farmPillDotView: View? = null
    private var farmPillLabelView: TextView? = null
    private lateinit var coinTextView: TextView
    private lateinit var contentContainer: FrameLayout
    private val navViews = mutableMapOf<HubTab, NavTabViews>()
    private val ioExecutor = Executors.newSingleThreadExecutor()
    private val probeExecutor = Executors.newFixedThreadPool(4)
    private val farmHealthCache = ConcurrentHashMap<String, FarmHealthResult>()

    private val avatarAccentOptions = listOf(
        Pair("#00B06F", "플레이 그린"),
        Pair("#142C25", "에버그린"),
        Pair("#2563EB", "네온 블루"),
        Pair("#7C3AED", "퍼플 펄스"),
        Pair("#D97706", "골드 스파크")
    )

    private var selectedAvatarCategory: String = "all"
    private var avatarSavedState: Boolean = false

    private fun avatarPrefs() = getSharedPreferences("playhub_avatar_v1", MODE_PRIVATE)

    private fun savedAvatarColor(): String =
        remoteSocialProfile?.avatarColor
            ?: avatarPrefs().getString("avatar_color", "#00B06F")
            ?: "#00B06F"

    private fun saveAvatarColor(hex: String) {
        avatarPrefs().edit().putString("avatar_color", hex).apply()
    }

    private fun equippedAvatarIds(): Set<String> {
        val raw = avatarPrefs().getString("equipped_ids", null) ?: return AvatarCatalog.DEFAULT_EQUIPPED
        return raw.split(",").map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    }

    private fun saveEquippedAvatarIds(ids: Set<String>) {
        avatarPrefs().edit().putString("equipped_ids", ids.joinToString(",")).apply()
    }

    private fun toggleEquipAvatarItem(item: AvatarCosmeticItem) {
        if (!item.owned) {
            AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(item.name)
                .setMessage("${item.categoryLabel} 상점 아이템 (${item.price} Play Coin)\n현재 보유 코인: ${formatCoin(profile.coinBalance)}\n\n스토어에서 Play Coin을 충전하거나 무료 착용 미리보기를 전환할 수 있습니다.")
                .setPositiveButton("코인 스토어") { _, _ -> showCoinStoreDialog() }
                .setNeutralButton("미리 착용해 보기") { _, _ ->
                    applyAvatarEquipToggle(item)
                }
                .setNegativeButton("닫기", null)
                .show()
            return
        }
        applyAvatarEquipToggle(item)
    }

    private fun applyAvatarEquipToggle(item: AvatarCosmeticItem) {
        val current = equippedAvatarIds().toMutableSet()
        if (current.contains(item.id)) {
            current.remove(item.id)
        } else {
            // Single-slot replacement within same category
            AvatarCatalog.ITEMS.filter { it.category == item.category }.forEach { current.remove(it.id) }
            current.add(item.id)
        }
        avatarSavedState = false
        saveEquippedAvatarIds(current)
        renderTab(HubTab.AVATAR)
    }

    private fun isPushAlertEnabled(): Boolean = avatarPrefs().getBoolean("pref_push_alerts", true)
    private fun setPushAlertEnabled(enabled: Boolean) {
        avatarPrefs().edit().putBoolean("pref_push_alerts", enabled).apply()
    }

    private fun isFriendJoinAllowed(): Boolean = avatarPrefs().getBoolean("pref_friend_join", true)
    private fun setFriendJoinAllowed(allowed: Boolean) {
        avatarPrefs().edit().putBoolean("pref_friend_join", allowed).apply()
        sendPresenceHeartbeat("online", null, null, remoteActiveParty?.roomCode)
    }

    private fun allCatalogGames(): List<CatalogGame> = remoteCatalog ?: fallbackCatalog()

    private fun filteredCatalog(applyCategory: Boolean): List<CatalogGame> {
        val q = searchQuery.trim().lowercase()
        return allCatalogGames().filter { game ->
            val matchCategory = !applyCategory || selectedCategory == "all" || when (selectedCategory) {
                "godot" -> game.runtime == "godot-pck"
                "web" -> game.runtime == "web"
                else -> game.category == selectedCategory
            }
            val matchQuery = q.isEmpty() ||
                game.title.lowercase().contains(q) ||
                game.subtitle.lowercase().contains(q) ||
                game.categoryLabel.lowercase().contains(q) ||
                game.id.lowercase().contains(q)
            matchCategory && matchQuery
        }
    }

    private fun styleForGame(id: String, runtime: String): QuadStyle = when {
        id.contains("survivor-arena") -> QuadStyle("#0E5A3B", "#14221C", "action", "액션 · 3D", "96%", "1.8만")
        id.contains("nextgen") || id.contains("48") -> QuadStyle("#854D0E", "#1F1810", "action", "호환성 테스트", "91%", "4,310")
        id.contains("match3") -> QuadStyle("#0E7490", "#122129", "puzzle", "퍼즐 · 웹", "94%", "8,420")
        id.contains("survivor-io") -> QuadStyle("#5B21B6", "#1D152B", "action", "서바이벌", "92%", "6,150")
        runtime == "godot-pck" -> QuadStyle("#1D4ED8", "#151D2B", "action", "Godot 3D", "90%", "3,890")
        else -> QuadStyle("#0F766E", "#132220", "puzzle", "HTML5 웹", "89%", "2,640")
    }

    private data class QuadStyle(
        val startHex: String,
        val endHex: String,
        val category: String,
        val categoryLabel: String,
        val likeRate: String,
        val players: String
    )

    private fun fallbackCatalog(): List<CatalogGame> {
        val base = activeFarm.baseUrl.trimEnd('/')
        val list = mutableListOf(
            CatalogGame(
                id = "survivor-arena-g2",
                title = "Survivor Arena G2",
                subtitle = "Godot 4.7.2 네이티브 3D 서바이벌",
                category = "action",
                categoryLabel = "액션 · 3D",
                runtime = "godot-pck",
                version = "2.1.0",
                ageRating = GameAgeRating.ALL,
                pckPathOrUrl = "$base/games/survivor-arena-g2/index.pck",
                sizeLabel = "1.9 MB",
                likeRate = "96%",
                playerCountLabel = "1.8만",
                requiredEngineVersion = "4.7.2",
                minAppVersionCode = 1,
                accentStart = "#0E5A3B",
                accentEnd = "#14221C",
                tagCode = "3D"
            ),
            CatalogGame(
                id = "match3-garden",
                title = "Match-3 Garden",
                subtitle = "즉시 웹플레이 퍼즐 (HTML5)",
                category = "puzzle",
                categoryLabel = "퍼즐 · 웹",
                runtime = "web",
                version = "1.0.0",
                ageRating = GameAgeRating.ALL,
                pckPathOrUrl = "$base/games/match3-garden/index.html",
                sizeLabel = "웹 스트리밍",
                likeRate = "94%",
                playerCountLabel = "8,420",
                requiredEngineVersion = null,
                minAppVersionCode = 1,
                accentStart = "#0E7490",
                accentEnd = "#122129",
                tagCode = "WEB"
            )
        )
        if (FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) {
            list.add(
                1,
                CatalogGame(
                    id = "nextgen-godot48",
                    title = "NextGen 3D Arena (4.8)",
                    subtitle = "상위 엔진 4.8.0 요구 호환성 확인용",
                    category = "action",
                    categoryLabel = "호환성 테스트",
                    runtime = "godot-pck",
                    version = "1.0.0",
                    ageRating = GameAgeRating.ALL,
                    pckPathOrUrl = "$base/games/nextgen-godot48/index.pck",
                    sizeLabel = "2.0 MB",
                    likeRate = "91%",
                    playerCountLabel = "4,310",
                    requiredEngineVersion = "4.8.0",
                    minAppVersionCode = 1,
                    accentStart = "#854D0E",
                    accentEnd = "#1F1810",
                    tagCode = "4.8"
                )
            )
        }
        return list
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        authStore = AuthSessionStore(this)
        profile = authStore.loadOrCreateGuest()
        activeFarm = FarmServerRegistry.loadActive(
            context = this,
            buildStage = BuildConfig.BUILD_STAGE,
            allowFlag = BuildConfig.ALLOW_FARM_SELECTOR,
            defaultBaseUrl = BuildConfig.HUB_BASE_URL
        )
        pendingDeepLinkUri = intent?.data
        val root = buildRootLayout()
        setContentView(root)
        applySystemBarInsets(root)
        renderTab(HubTab.HOME)
        syncWithActiveFarm()

        if (!authStore.isAgeGateCompleted()) {
            AgeGateDialog.show(this) { birthYear, birthMonth, tier, region ->
                authStore.saveAgeCompliance(tier, region)
                profile = authStore.loadOrCreateGuest()
                renderTab(activeTab)
                syncAgeGateToServer(birthYear, birthMonth, region)
                Toast.makeText(this, "연령 확인 완료 (${tier.name}) · Guest로 바로 플레이할 수 있습니다.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.data?.let { uri ->
            pendingDeepLinkUri = uri
            processPendingDeepLink()
        }
    }

    // Inline Single-Runtime Godot 4.7.2 Avatar Preview State (active ONLY while HubTab.AVATAR is open)
    private var inlineGodotStage: InlineGodotAvatarStage? = null
    private var avatarSaveButton: TextView? = null
    private var avatarWardrobeGridHost: LinearLayout? = null
    private var avatarCategoryChipHost: LinearLayout? = null
    private val avatarSwatchViews = mutableMapOf<String, View>()
    private val avatarTryOnIds = linkedSetOf<String>()

    private data class InlineAvatarCardBinding(
        val item: AvatarCosmeticItem,
        val container: LinearLayout,
        val checkBadge: TextView,
        val statusLabel: TextView?,
        val priceWrap: View?
    )
    private val avatarCardBindings = mutableListOf<InlineAvatarCardBinding>()

    private fun releaseInlineGodotPreview() {
        inlineGodotStage?.release()
        inlineGodotStage = null
        avatarSaveButton = null
        avatarWardrobeGridHost = null
        avatarCategoryChipHost = null
        avatarSwatchViews.clear()
        avatarCardBindings.clear()
        avatarTryOnIds.clear()
    }

    override fun onResume() {
        super.onResume()
        sendPresenceHeartbeat("online", null, null, remoteActiveParty?.roomCode)
        if (activeTab == HubTab.AVATAR && inlineGodotStage == null) {
            renderTab(HubTab.AVATAR)
        }
    }

    override fun onPause() {
        super.onPause()
        releaseInlineGodotPreview()
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseInlineGodotPreview()
        ioExecutor.shutdownNow()
        probeExecutor.shutdownNow()
    }

    private fun applySystemBarInsets(root: View) {
        root.setOnApplyWindowInsetsListener { _, insets ->
            val topInset: Int
            val bottomInset: Int
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val sys = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                topInset = sys.top
                bottomInset = sys.bottom
            } else {
                @Suppress("DEPRECATION")
                topInset = insets.systemWindowInsetTop
                @Suppress("DEPRECATION")
                bottomInset = insets.systemWindowInsetBottom
            }
            topBarView.setPadding(dp(16), topInset + dp(10), dp(16), dp(10))
            bottomBarView.setPadding(dp(4), dp(8), dp(4), bottomInset + dp(8))
            insets
        }
        root.requestApplyInsets()
    }

    private fun currentFarmHealth(farm: FarmCluster = activeFarm): FarmHealthResult {
        val key = farm.baseUrl.trim().trimEnd('/').lowercase()
        return farmHealthCache[key] ?: FarmHealthResult(FarmHealthStatus.CHECKING)
    }

    private fun probeActiveFarmHealth(showCheckingState: Boolean = false) {
        val farm = activeFarm
        val key = farm.baseUrl.trim().trimEnd('/').lowercase()
        if (showCheckingState || !farmHealthCache.containsKey(key)) {
            farmHealthCache[key] = FarmHealthResult(FarmHealthStatus.CHECKING)
            updateFarmPillVisual()
        }
        probeExecutor.execute {
            val res = FarmHealthChecker.probe(farm.baseUrl)
            farmHealthCache[key] = res
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (activeFarm.baseUrl.trim().trimEnd('/').lowercase() != key) return@runOnUiThread
                updateFarmPillVisual()
                if (activeTab == HubTab.MORE) {
                    renderTab(HubTab.MORE)
                }
            }
        }
    }

    private fun isJwtExpired(jwt: String): Boolean {
        return runCatching {
            val parts = jwt.split(".")
            if (parts.size < 2) return true
            val decoded = android.util.Base64.decode(parts[1], android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING)
            val json = String(decoded, Charsets.UTF_8)
            val match = Regex("\"exp\"\\s*:\\s*(\\d+)").find(json) ?: return true
            val expSec = match.groupValues[1].toLong()
            expSec * 1000L <= System.currentTimeMillis() + 30_000L
        }.getOrDefault(true)
    }

    private fun ensureAuthToken(client: PlayHubApiClient): String {
        val existing = profile.accessToken
        if (!existing.isNullOrBlank() && !isJwtExpired(existing)) return existing
        val refresh = profile.refreshToken
        if (!refresh.isNullOrBlank()) {
            val refreshed = runCatching { client.refreshSession(refresh) }.getOrNull()
            if (refreshed != null) {
                authStore.saveRemoteTokens(refreshed)
                profile = authStore.loadOrCreateGuest()
                return refreshed.accessToken
            }
        }
        val issued = client.createGuestSession()
        authStore.saveRemoteTokens(issued)
        profile = authStore.loadOrCreateGuest()
        return issued.accessToken
    }

    private fun sendPresenceHeartbeat(status: String, gameId: String?, gameTitle: String?, roomCode: String?) {
        val token = profile.accessToken ?: return
        val baseUrl = activeFarm.baseUrl
        val joinable = isFriendJoinAllowed()
        ioExecutor.execute {
            runCatching {
                PlayHubApiClient(baseUrl).updatePresence(token, status, gameId, gameTitle, roomCode, joinable)
            }
        }
    }

    private fun syncWithActiveFarm() {
        val farm = activeFarm
        syncStatusText = "서버 연결 중 (${farm.id})..."
        if (FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) {
            probeActiveFarmHealth()
        }
        ioExecutor.execute {
            val client = PlayHubApiClient(farm.baseUrl)
            runCatching {
                val token = ensureAuthToken(client)
                val catalog = client.fetchCatalog(token, BuildConfig.GODOT_ENGINE_VERSION, BuildConfig.VERSION_CODE).map { item ->
                    val mb = if (item.pckBytes > 0) String.format("%.1f MB", item.pckBytes / (1024.0 * 1024.0)) else "웹 스트리밍"
                    val st = styleForGame(item.id, item.runtime)
                    CatalogGame(
                        id = item.id,
                        title = item.title,
                        subtitle = item.description.ifBlank { item.genre },
                        category = st.category,
                        categoryLabel = st.categoryLabel,
                        runtime = item.runtime,
                        version = item.buildId,
                        ageRating = item.ageRating,
                        pckPathOrUrl = item.pckUrl ?: item.entryUrl,
                        sizeLabel = mb,
                        likeRate = st.likeRate,
                        playerCountLabel = st.players,
                        requiredEngineVersion = item.requiredEngineVersion,
                        minAppVersionCode = item.minAppVersionCode,
                        accentStart = st.startHex,
                        accentEnd = st.endHex,
                        tagCode = if (item.runtime == "godot-pck") (item.requiredEngineVersion ?: "3D") else "WEB",
                        deployMode = item.deployMode,
                        multiplayerWsUrl = item.multiplayerWsUrl
                    )
                }
                // Sync live M3 Social state in the same connection wave
                val socProfile = runCatching { client.fetchSocialProfile(token) }.getOrNull()
                runCatching { client.updatePresence(token, "online") }
                val friendsPayload = runCatching { client.fetchSocialFriends(token) }.getOrNull()
                val myParty = runCatching { client.fetchMyParty(token) }.getOrNull()
                val qms = runCatching { client.fetchQuickMessages() }.getOrNull()
                Triple(catalog, Triple(socProfile, friendsPayload, myParty), qms)
            }.onSuccess { (list, socialTriple, qms) ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    if (activeFarm.baseUrl != farm.baseUrl) return@runOnUiThread
                    remoteCatalog = if (list.isNotEmpty()) list else null
                    socialTriple.first?.let { remoteSocialProfile = it }
                    socialTriple.second?.let { fp ->
                        remoteFriends = fp.friends
                        remoteIncomingRequests = fp.incomingRequests
                        remoteOutgoingRequests = fp.outgoingRequests
                    }
                    remoteActiveParty = socialTriple.third
                    if (!qms.isNullOrEmpty()) safeQuickMessages = qms
                    syncStatusText = "온라인 동기화 완료 (${list.size}종 · 친구 ${remoteFriends.size}명 · ${farm.id})"
                    renderTab(activeTab)
                    processPendingDeepLink()
                }
            }.onFailure {
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    if (activeFarm.baseUrl != farm.baseUrl) return@runOnUiThread
                    syncStatusText = "로컬 폴백 모드 (${farm.id} 미연결)"
                    renderTab(activeTab)
                }
            }
        }
    }

    private fun refreshSocialOnly(afterRefresh: (() -> Unit)? = null) {
        val farm = activeFarm
        ioExecutor.execute {
            val client = PlayHubApiClient(farm.baseUrl)
            runCatching {
                val token = ensureAuthToken(client)
                val prof = client.fetchSocialProfile(token)
                val fp = client.fetchSocialFriends(token)
                val party = client.fetchMyParty(token)
                Triple(prof, fp, party)
            }.onSuccess { (prof, fp, party) ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    remoteSocialProfile = prof
                    remoteFriends = fp.friends
                    remoteIncomingRequests = fp.incomingRequests
                    remoteOutgoingRequests = fp.outgoingRequests
                    remoteActiveParty = party
                    afterRefresh?.invoke()
                    renderTab(activeTab)
                }
            }.onFailure { err ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    Toast.makeText(this, "소셜 동기화 실패: ${err.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun processPendingDeepLink() {
        val uri = pendingDeepLinkUri ?: return
        pendingDeepLinkUri = null
        val roomCode = uri.getQueryParameter("room")?.trim()?.uppercase()
        val gameId = uri.lastPathSegment?.takeIf { it != "join" && it != "lobby" }
        if (!roomCode.isNullOrBlank()) {
            joinPartyByCode(roomCode) { party ->
                val targetId = gameId ?: party.targetGameId
                val game = targetId?.let { id -> allCatalogGames().find { it.id == id } }
                if (game != null) openExperienceDetail(game)
            }
        } else if (!gameId.isNullOrBlank()) {
            allCatalogGames().find { it.id == gameId }?.let { openExperienceDetail(it) }
        }
    }

    private fun syncAgeGateToServer(birthYear: Int, birthMonth: Int, regionCode: String) {
        val farm = activeFarm
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(farm.baseUrl)
                val token = ensureAuthToken(client)
                client.submitAgeGate(token, birthYear, birthMonth, regionCode)
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) syncWithActiveFarm()
                }
            }
        }
    }

    // ---- Drawing & Token Helpers ----

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun roundedBg(
        fillHex: String = StitchColors.SURFACE_CONTAINER,
        strokeHex: String? = null,
        radiusDp: Int = 12,
        strokeWidthDp: Int = 1
    ): GradientDrawable = GradientDrawable().apply {
        setColor(Color.parseColor(fillHex))
        cornerRadius = dp(radiusDp).toFloat()
        if (strokeHex != null) {
            setStroke(dp(strokeWidthDp), Color.parseColor(strokeHex))
        }
    }

    private fun ovalBg(fillHex: String, strokeHex: String? = null, strokeWidthDp: Int = 0): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor(fillHex))
            if (strokeHex != null && strokeWidthDp > 0) {
                setStroke(dp(strokeWidthDp), Color.parseColor(strokeHex))
            }
        }

    private fun gradientThumb(startHex: String, endHex: String, radiusDp: Int = 8): GradientDrawable =
        GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(Color.parseColor(startHex), Color.parseColor(endHex))
        ).apply {
            cornerRadius = dp(radiusDp).toFloat()
        }

    private fun statusDotDrawable(status: FarmHealthStatus): GradientDrawable = ovalBg(status.colorHex)

    private fun iconView(resId: Int, sizeDp: Int, tintHex: String? = null): ImageView = ImageView(this).apply {
        setImageResource(resId)
        if (tintHex != null) {
            setColorFilter(Color.parseColor(tintHex), PorterDuff.Mode.SRC_IN)
        }
        scaleType = ImageView.ScaleType.FIT_CENTER
        layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp))
    }

    private fun pillChip(
        text: String,
        bgHex: String,
        textHex: String = StitchColors.ON_SURFACE,
        strokeHex: String? = null
    ): TextView = TextView(this).apply {
        this.text = text
        textSize = 10.5f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(Color.parseColor(textHex))
        setPadding(dp(8), dp(3), dp(8), dp(3))
        background = roundedBg(bgHex, strokeHex, 999)
    }

    // ---- Root Shell ----

    private fun buildRootLayout(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE))
        }

        topBarView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE))
            setPadding(dp(16), dp(12), dp(16), dp(10))
        }

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val brandCluster = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener {
                activeChatTarget = null
                renderTab(HubTab.HOME)
            }
            addView(ImageView(context).apply {
                setImageResource(R.drawable.ic_playhub_logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
                layoutParams = LinearLayout.LayoutParams(dp(28), dp(28)).apply { rightMargin = dp(6) }
            })
            val brandSpan = SpannableString("PLAYHUB").apply {
                setSpan(ForegroundColorSpan(Color.WHITE), 0, 4, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                setSpan(ForegroundColorSpan(Color.parseColor(StitchColors.PLAY_GREEN)), 4, 7, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
            addView(TextView(context).apply {
                text = brandSpan
                textSize = 16.5f
                maxLines = 1
                typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
                letterSpacing = -0.03f
            })
        }
        headerRow.addView(brandCluster)

        if (FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) {
            val dot = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(7), dp(7)).apply { rightMargin = dp(4) }
            }
            val label = TextView(this).apply {
                textSize = 10f
                maxLines = 1
                typeface = Typeface.MONOSPACE
                setTextColor(Color.WHITE)
            }
            val pill = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(7), dp(5), dp(7), dp(5))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { rightMargin = dp(5) }
                addView(dot)
                addView(label)
                setOnClickListener { showFarmSelectorDialog() }
            }
            farmPillDotView = dot
            farmPillLabelView = label
            farmPillContainer = pill
            updateFarmPillVisual()
            headerRow.addView(pill)
        }

        headerSearchBtnIcon = iconView(R.drawable.ic_search, 18, StitchColors.ON_SURFACE)
        val searchBtn = FrameLayout(this).apply {
            background = ovalBg(StitchColors.SURFACE_CONTAINER)
            layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).apply { rightMargin = dp(6) }
            addView(headerSearchBtnIcon, FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER))
            setOnClickListener {
                if (activeTab == HubTab.EXPLORE) {
                    renderTab(HubTab.EXPLORE)
                } else {
                    searchOpen = !searchOpen
                    headerSearchRow.visibility = if (searchOpen) View.VISIBLE else View.GONE
                    headerSearchBtnIcon.setImageResource(if (searchOpen) R.drawable.ic_close else R.drawable.ic_search)
                    if (!searchOpen && searchQuery.isNotEmpty()) {
                        searchQuery = ""
                        headerSearchInput.setText("")
                        renderTab(activeTab)
                    }
                }
            }
        }
        headerRow.addView(searchBtn)

        val bellBtn = FrameLayout(this).apply {
            background = ovalBg(StitchColors.SURFACE_CONTAINER)
            layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).apply { rightMargin = dp(6) }
            addView(iconView(R.drawable.ic_notifications, 18, StitchColors.ON_SURFACE), FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER))
            addView(View(context).apply {
                background = ovalBg(StitchColors.PLAY_GREEN)
            }, FrameLayout.LayoutParams(dp(7), dp(7), Gravity.TOP or Gravity.END).apply {
                topMargin = dp(7)
                rightMargin = dp(8)
            })
            setOnClickListener {
                val reqCount = remoteIncomingRequests.size
                val msg = if (reqCount > 0) "새 친구 요청 ${reqCount}건이 있습니다. 채팅 탭에서 확인하세요."
                else "현재 활성 파티: ${remoteActiveParty?.roomCode ?: "없음"} · 친구 ${remoteFriends.size}명"
                Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
                if (reqCount > 0) renderTab(HubTab.CHAT)
            }
        }
        headerRow.addView(bellBtn)

        coinTextView = TextView(this).apply {
            text = formatCoin(profile.coinBalance)
            textSize = 12f
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            setTextColor(Color.WHITE)
        }
        val coinPill = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 999)
            setPadding(dp(9), dp(6), dp(10), dp(6))
            addView(iconView(R.drawable.ic_coin, 16, StitchColors.COIN_GOLD).apply {
                (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(5)
            })
            addView(coinTextView)
            setOnClickListener { showCoinStoreDialog() }
        }
        headerRow.addView(coinPill)
        topBarView.addView(headerRow)

        headerSearchInput = EditText(this).apply {
            hint = "게임, 장르 검색..."
            textSize = 14f
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            background = null
            setSingleLine(true)
            setPadding(0, dp(6), 0, dp(6))
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
                override fun afterTextChanged(s: Editable?) {
                    val next = s?.toString().orEmpty()
                    if (next != searchQuery) {
                        searchQuery = next
                        if (activeTab == HubTab.HOME) renderTab(HubTab.HOME)
                    }
                }
            })
        }
        headerSearchRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 10)
            setPadding(dp(12), dp(4), dp(12), dp(4))
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(10) }
            addView(iconView(R.drawable.ic_search, 18, StitchColors.ON_SURFACE_VARIANT).apply {
                (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(8)
            })
            addView(headerSearchInput)
        }
        topBarView.addView(headerSearchRow)
        root.addView(topBarView)

        root.addView(View(this).apply {
            setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
        })

        contentContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        root.addView(contentContainer)

        root.addView(View(this).apply {
            setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
        })

        bottomBarView = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE_LOWEST))
            setPadding(dp(4), dp(8), dp(4), dp(10))
        }
        for (tab in HubTab.values()) {
            val icon = iconView(tab.iconRes, 22, StitchColors.ON_SURFACE_VARIANT)
            val label = TextView(this).apply {
                text = tab.label
                textSize = 11f
                gravity = Gravity.CENTER
                setPadding(0, dp(3), 0, 0)
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            }
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(dp(4), dp(4), dp(4), dp(4))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                addView(icon)
                addView(label)
                setOnClickListener {
                    if (tab != HubTab.CHAT) activeChatTarget = null
                    if (tab != HubTab.HOME && searchOpen) {
                        searchOpen = false
                        headerSearchRow.visibility = View.GONE
                        headerSearchBtnIcon.setImageResource(R.drawable.ic_search)
                    }
                    if (tab == HubTab.CHAT) {
                        refreshSocialOnly()
                    }
                    renderTab(tab)
                }
            }
            navViews[tab] = NavTabViews(item, icon, label)
            bottomBarView.addView(item)
        }
        root.addView(bottomBarView)
        return root
    }

    private fun formatCoin(balance: Long): String = String.format("%,d", balance)

    private fun updateFarmPillVisual() {
        runOnUiThread {
            if (isFinishing || isDestroyed) return@runOnUiThread
            val pill = farmPillContainer ?: return@runOnUiThread
            val dot = farmPillDotView ?: return@runOnUiThread
            val label = farmPillLabelView ?: return@runOnUiThread
            val health = currentFarmHealth()
            dot.background = statusDotDrawable(health.status)
            label.text = "${activeFarm.id}·${health.compactPillText()}"
            pill.background = roundedBg(StitchColors.SURFACE_CONTAINER, health.status.colorHex, 999)
        }
    }

    private fun renderTab(tab: HubTab) {
        activeTab = tab
        updateFarmPillVisual()
        coinTextView.text = formatCoin(profile.coinBalance)

        for ((t, views) in navViews) {
            val active = t == tab
            views.icon.setColorFilter(
                Color.parseColor(if (active) StitchColors.PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT),
                PorterDuff.Mode.SRC_IN
            )
            views.label.setTextColor(Color.parseColor(if (active) StitchColors.ON_SURFACE else StitchColors.ON_SURFACE_VARIANT))
            views.label.typeface = if (active) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }

        if (tab != HubTab.AVATAR) {
            releaseInlineGodotPreview()
        }

        contentContainer.removeAllViews()

        if (tab == HubTab.CHAT && activeChatTarget != null) {
            contentContainer.addView(buildChatRoomView(activeChatTarget!!))
            return
        }

        if (tab == HubTab.AVATAR) {
            contentContainer.addView(buildInlineGodotAvatarTab())
            return
        }

        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(14), 0, dp(24))
        }
        when (tab) {
            HubTab.HOME -> buildHomeTab(body)
            HubTab.EXPLORE -> buildExploreTab(body)
            HubTab.AVATAR -> buildAvatarTab(body)
            HubTab.CHAT -> buildSocialHubTab(body)
            HubTab.MORE -> buildMoreTab(body)
        }
        scroll.addView(body)
        contentContainer.addView(scroll)
    }

    // ---- 1. HOME TAB ----

    private fun buildHomeTab(body: LinearLayout) {
        val caps = AgeGatePolicy.evaluateCapabilities(profile.ageTier, profile.isGuest, profile.parentalConsentVerified)
        val onlineCount = remoteFriends.count { it.presence.online }

        body.addView(
            sectionHeader(
                title = "친구",
                monoAccent = if (caps.requiresParentalConsent) "보호 모드" else "${onlineCount}명 접속 중",
                actionLabel = "소셜 · 파티"
            ) {
                refreshSocialOnly()
                renderTab(HubTab.CHAT)
            }
        )
        body.addView(buildLiveFriendsStrip(caps.requiresParentalConsent))

        val games = filteredCatalog(applyCategory = false)

        body.addView(
            sectionHeader(title = "추천 게임", actionLabel = "더보기") {
                renderTab(HubTab.EXPLORE)
            }
        )
        if (games.isEmpty()) {
            body.addView(paddedBox(emptyCatalogCard()))
        } else {
            body.addView(buildGameCarousel(games, showPlayButton = true, showFriendTag = false))
        }

        val playingFriends = remoteFriends.filter { it.presence.status == "in_game" && !it.presence.gameId.isNullOrBlank() }
        if (!caps.requiresParentalConsent && games.isNotEmpty()) {
            body.addView(
                sectionHeader(title = "친구들이 플레이 중", actionLabel = "파티 합류") {
                    renderTab(HubTab.CHAT)
                }
            )
            body.addView(buildGameCarousel(games, showPlayButton = false, showFriendTag = true, playingFriends = playingFriends))
        }

        if (games.isNotEmpty()) {
            body.addView(
                sectionHeader(title = "인기 급상승", actionLabel = "더보기") {
                    renderTab(HubTab.EXPLORE)
                }
            )
            body.addView(buildGameCarousel(games.reversed(), showPlayButton = false, showFriendTag = false))
        }

        val myHandle = remoteSocialProfile?.handle ?: profile.handle
        val myDisplay = remoteSocialProfile?.displayName ?: profile.displayName
        val statusCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(TextView(context).apply {
                    text = "$myDisplay  $myHandle"
                    textSize = 13.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(pillChip("Godot ${BuildConfig.GODOT_ENGINE_VERSION}", "#005231", "#C0FFD6"))
            })
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(8), 0, dp(4))
                addView(pillChip(profile.authProvider.uppercase(), StitchColors.SURFACE_HIGH, StitchColors.ON_SURFACE))
                addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(6), dp(1)) })
                addView(pillChip("${profile.ageTier.name} (${profile.regionCode})", StitchColors.SURFACE_HIGH, StitchColors.ON_SURFACE_VARIANT))
                if (remoteActiveParty != null) {
                    addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(6), dp(1)) })
                    addView(pillChip("파티 ${remoteActiveParty!!.roomCode}", "#005231", "#C0FFD6"))
                }
            })
            addView(TextView(context).apply {
                text = syncStatusText
                textSize = 11.5f
                typeface = Typeface.MONOSPACE
                setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                setPadding(0, dp(4), 0, 0)
            })
        }
        body.addView(paddedBox(statusCard, topDp = 18))
    }

    private fun sectionHeader(
        title: String,
        monoAccent: String? = null,
        actionLabel: String? = null,
        onAction: (() -> Unit)? = null
    ): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(16), dp(14), dp(16), dp(10))

        val left = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            addView(TextView(context).apply {
                text = title
                textSize = 18f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
            })
            if (monoAccent != null) {
                addView(TextView(context).apply {
                    text = monoAccent
                    textSize = 12f
                    typeface = Typeface.MONOSPACE
                    setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                    setPadding(dp(8), 0, 0, 0)
                })
            }
        }
        addView(left)

        if (actionLabel != null && onAction != null) {
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setOnClickListener { onAction() }
                addView(TextView(context).apply {
                    text = actionLabel
                    textSize = 12f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                })
                addView(iconView(R.drawable.ic_chevron_right, 16, StitchColors.ON_SURFACE_VARIANT))
            })
        }
    }

    private fun buildLiveFriendsStrip(childProtected: Boolean): View {
        val scroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(2), dp(16), dp(6))
        }
        if (childProtected) {
            row.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
                setPadding(dp(12), dp(10), dp(14), dp(10))
                setOnClickListener { renderTab(HubTab.CHAT) }
                addView(iconView(R.drawable.ic_lock, 18, StitchColors.ON_SURFACE_VARIANT).apply {
                    (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(8)
                })
                addView(TextView(context).apply {
                    text = "아동 보호 모드: 법정대리인 동의 후 안전 소셜 기능이 활성화됩니다."
                    textSize = 12f
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                })
            })
            scroll.addView(row)
            return scroll
        }

        // First button: Add Friend CTA
        row.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(dp(68), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                rightMargin = dp(10)
            }
            setOnClickListener { showAddFriendDialog() }
            addView(FrameLayout(context).apply {
                layoutParams = LinearLayout.LayoutParams(dp(60), dp(60))
                background = ovalBg(StitchColors.SURFACE_CONTAINER, StitchColors.PLAY_GREEN, 2)
                addView(TextView(context).apply {
                    text = "+"
                    textSize = 26f
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            })
            addView(TextView(context).apply {
                text = "친구 추가"
                textSize = 11.5f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                setPadding(0, dp(5), 0, 0)
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            })
        })

        for (friend in remoteFriends) {
            row.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(dp(68), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    rightMargin = dp(10)
                }
                setOnClickListener {
                    val game = friend.presence.gameId?.let { gid -> allCatalogGames().find { it.id == gid } }
                    if (game != null && friend.presence.status == "in_game") {
                        openExperienceDetail(game)
                    } else {
                        openDmChat(friend)
                    }
                }
                addView(avatarCircle(friend.displayName.take(1).ifBlank { "P" }, friend.avatarColor, 60, friend.presence.online))
                addView(TextView(context).apply {
                    text = friend.displayName
                    textSize = 11.5f
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    setTextColor(Color.WHITE)
                    maxLines = 1
                    ellipsize = TextUtils.TruncateAt.END
                    setPadding(0, dp(5), 0, 0)
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                })
            })
        }

        if (remoteFriends.isEmpty()) {
            row.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
                setPadding(dp(12), dp(10), dp(14), dp(10))
                setOnClickListener { showAddFriendDialog() }
                addView(TextView(context).apply {
                    text = "친구를 찾아 추가해 보세요"
                    textSize = 12.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                })
                addView(TextView(context).apply {
                    text = "예: minjun#1024 검색 · 파티 코드 PLAY99 합류"
                    textSize = 11f
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                    setPadding(0, dp(2), 0, 0)
                })
            })
        }
        scroll.addView(row)
        return scroll
    }

    private fun avatarCircle(initial: String, fillHex: String, sizeDp: Int, online: Boolean): FrameLayout {
        val ringHex = if (online) StitchColors.PLAY_GREEN else StitchColors.OUTLINE_VARIANT
        val safeFill = runCatching { Color.parseColor(fillHex); fillHex }.getOrDefault("#1E3A5F")
        return FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp))
            val outer = FrameLayout(context).apply {
                background = ovalBg(StitchColors.SURFACE_CONTAINER, ringHex, 2)
                setPadding(dp(3), dp(3), dp(3), dp(3))
                addView(TextView(context).apply {
                    text = initial
                    textSize = (sizeDp * 0.34f)
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    setTextColor(Color.WHITE)
                    alpha = if (online) 1f else 0.55f
                    background = ovalBg(safeFill)
                }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }
            addView(outer, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            if (online) {
                val dotSize = (sizeDp * 0.24f).toInt().coerceIn(11, 16)
                addView(View(context).apply {
                    background = ovalBg(StitchColors.ONLINE_DOT, StitchColors.SURFACE, 2)
                }, FrameLayout.LayoutParams(dp(dotSize), dp(dotSize), Gravity.BOTTOM or Gravity.END))
            }
        }
    }

    private fun buildGameCarousel(
        games: List<CatalogGame>,
        showPlayButton: Boolean,
        showFriendTag: Boolean,
        playingFriends: List<SocialFriendDto> = emptyList()
    ): View {
        val scroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(2), dp(16), dp(6))
        }
        for (game in games) {
            val friendPlaying = playingFriends.find { it.presence.gameId == game.id }
            val friendTag = if (showFriendTag && friendPlaying != null) "${friendPlaying.displayName}님 플레이 중" else null
            row.addView(stitchGameCard(game, widthDp = 244, showPlayButton = showPlayButton, friendOverlayText = friendTag))
        }
        scroll.addView(row)
        return scroll
    }

    private fun buildGameThumbnail(
        game: CatalogGame,
        heightDp: Int,
        compat: com.playhub.aos.runtime.VersionCompatibilityResult,
        cached: Boolean,
        friendOverlayText: String? = null
    ): FrameLayout = FrameLayout(this).apply {
        background = gradientThumb(game.accentStart, game.accentEnd, 8)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(heightDp))

        addView(View(context).apply {
            background = ovalBg("#22FFFFFF")
        }, FrameLayout.LayoutParams(dp(heightDp), dp(heightDp), Gravity.END or Gravity.BOTTOM).apply {
            rightMargin = -dp(heightDp / 3)
            bottomMargin = -dp(heightDp / 3)
        })

        val centerCol = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            addView(TextView(context).apply {
                text = game.tagCode
                textSize = 22f
                typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
                setTextColor(Color.parseColor("#E6FFFFFF"))
            })
            addView(TextView(context).apply {
                text = game.categoryLabel
                textSize = 10.5f
                setTextColor(Color.parseColor("#CCFFFFFF"))
            })
        }
        addView(centerCol, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))

        val topBadgeText = when {
            !compat.compatible -> "엔진 ${game.requiredEngineVersion} 필요"
            cached -> "캐시됨"
            game.runtime == "godot-pck" -> "GODOT ${game.requiredEngineVersion ?: "4.7.2"}"
            else -> "HTML5"
        }
        val topBadgeBg = when {
            !compat.compatible -> "#B45309"
            cached -> "#005231"
            else -> "#CC111315"
        }
        val topBadgeTextHex = when {
            !compat.compatible -> "#FEF3C7"
            cached -> "#C0FFD6"
            else -> "#FFFFFF"
        }
        addView(
            pillChip(topBadgeText, topBadgeBg, topBadgeTextHex, StitchColors.OUTLINE_VARIANT),
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START).apply {
                topMargin = dp(8)
                leftMargin = dp(8)
            }
        )

        if (friendOverlayText != null) {
            val friendPill = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = roundedBg("#E6111315", StitchColors.OUTLINE_VARIANT, 999)
                setPadding(dp(7), dp(3), dp(9), dp(3))
                addView(View(context).apply {
                    background = ovalBg(StitchColors.ONLINE_DOT)
                    layoutParams = LinearLayout.LayoutParams(dp(7), dp(7)).apply { rightMargin = dp(5) }
                })
                addView(TextView(context).apply {
                    text = friendOverlayText
                    textSize = 10.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                })
            }
            addView(friendPill, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply {
                bottomMargin = dp(8)
                leftMargin = dp(8)
            })
        }
    }

    private fun stitchGameCard(
        game: CatalogGame,
        widthDp: Int?,
        showPlayButton: Boolean,
        friendOverlayText: String? = null
    ): LinearLayout {
        val ageAllowed = AgeGatePolicy.canPlayRating(profile.ageTier, game.ageRating, profile.parentalConsentVerified)
        val compat = VersionCompatibilityChecker.evaluate(
            runtime = game.runtime,
            requiredEngineVersion = game.requiredEngineVersion,
            minAppVersionCode = game.minAppVersionCode,
            installedEngineVersion = BuildConfig.GODOT_ENGINE_VERSION,
            installedAppVersionCode = BuildConfig.VERSION_CODE
        )
        val cached = game.runtime == "godot-pck" && PckPackageManager.cachedPckFile(filesDir, game.id, game.version).isFile
        val borderHex = when {
            !compat.compatible -> StitchColors.WARN_AMBER
            !ageAllowed -> StitchColors.ERROR
            else -> null
        }

        val handleTap = {
            when {
                !compat.compatible -> showIncompatibilityDialog(game, compat.detailMessage ?: "앱 업데이트가 필요합니다.")
                !ageAllowed -> Toast.makeText(this, "현재 연령 티어(${profile.ageTier.name})에서는 이용할 수 없는 등급입니다.", Toast.LENGTH_SHORT).show()
                else -> openExperienceDetail(game)
            }
        }

        val thumbHeight = if (widthDp != null) 128 else 96

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, borderHex, 12)
            setPadding(dp(8), dp(8), dp(8), dp(10))
            layoutParams = if (widthDp != null) {
                LinearLayout.LayoutParams(dp(widthDp), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    rightMargin = dp(12)
                }
            } else {
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }
            setOnClickListener { handleTap() }

            addView(buildGameThumbnail(game, thumbHeight, compat, cached, friendOverlayText))

            val meta = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(4), dp(8), dp(4), dp(2))
                addView(TextView(context).apply {
                    text = game.title
                    textSize = if (widthDp != null) 15f else 13.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                    maxLines = 1
                    ellipsize = TextUtils.TruncateAt.END
                })
                if (widthDp == null) {
                    addView(TextView(context).apply {
                        text = game.categoryLabel
                        textSize = 11f
                        setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        setPadding(0, dp(2), 0, 0)
                    })
                }
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(0, dp(5), 0, 0)
                    addView(iconView(R.drawable.ic_thumb_up, 13, StitchColors.PLAY_GREEN).apply {
                        (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(4)
                    })
                    addView(TextView(context).apply {
                        text = game.likeRate
                        textSize = 11.5f
                        typeface = Typeface.MONOSPACE
                        setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        setPadding(0, 0, dp(10), 0)
                    })
                    addView(iconView(R.drawable.ic_group, 13, StitchColors.ON_SURFACE_VARIANT).apply {
                        (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(4)
                    })
                    addView(TextView(context).apply {
                        text = if (widthDp != null) "${game.playerCountLabel} · ${game.sizeLabel}" else game.playerCountLabel
                        textSize = 11.5f
                        typeface = Typeface.MONOSPACE
                        setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        maxLines = 1
                        ellipsize = TextUtils.TruncateAt.END
                    })
                })
            }
            addView(meta)

            if (!compat.compatible) {
                addView(TextView(context).apply {
                    text = compat.badgeText ?: "⚠️ 업데이트 필요"
                    textSize = 11f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor("#FBBF24"))
                    setPadding(dp(4), dp(4), dp(4), 0)
                    maxLines = 1
                    ellipsize = TextUtils.TruncateAt.END
                })
            }

            if (showPlayButton) {
                val playable = compat.compatible && ageAllowed
                val btnBg = if (playable) StitchColors.PLAY_GREEN else StitchColors.SURFACE_HIGH
                val btnTextColor = if (playable) StitchColors.ON_PLAY_GREEN else StitchColors.ON_SURFACE
                val btnLabel = when {
                    !compat.compatible -> "업데이트 필요"
                    !ageAllowed -> "연령 제한"
                    cached -> "바로 플레이"
                    else -> "플레이"
                }
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER
                    background = roundedBg(btnBg, if (playable) null else StitchColors.OUTLINE_VARIANT, 8)
                    setPadding(dp(10), dp(9), dp(10), dp(9))
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply {
                        topMargin = dp(8)
                        leftMargin = dp(4)
                        rightMargin = dp(4)
                    }
                    if (playable) {
                        addView(iconView(R.drawable.ic_play_arrow, 18, StitchColors.ON_PLAY_GREEN).apply {
                            (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(4)
                        })
                    }
                    addView(TextView(context).apply {
                        text = btnLabel
                        textSize = 13.5f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.parseColor(btnTextColor))
                    })
                    setOnClickListener { handleTap() }
                })
            }
        }
    }

    // ---- 2. EXPLORE TAB ----

    private fun buildExploreTab(body: LinearLayout) {
        val games = filteredCatalog(applyCategory = true)

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(2), dp(16), dp(10))
            addView(TextView(context).apply {
                text = "체험 탐색"
                textSize = 18f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            addView(TextView(context).apply {
                text = "${games.size}개 결과"
                textSize = 12f
                typeface = Typeface.MONOSPACE
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            })
        }
        body.addView(header)

        val searchBox = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 12)
            setPadding(dp(12), dp(6), dp(10), dp(6))
            addView(iconView(R.drawable.ic_search, 18, StitchColors.ON_SURFACE_VARIANT).apply {
                (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(8)
            })
            val input = EditText(context).apply {
                hint = "게임, 장르, 런타임 검색..."
                setText(searchQuery)
                setSelection(searchQuery.length)
                textSize = 14f
                setTextColor(Color.WHITE)
                setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                background = null
                setSingleLine(true)
                setPadding(0, dp(6), 0, dp(6))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                setOnEditorActionListener { v, _, _ ->
                    searchQuery = v.text.toString()
                    renderTab(HubTab.EXPLORE)
                    true
                }
            }
            addView(input)
            if (searchQuery.isNotEmpty()) {
                addView(FrameLayout(context).apply {
                    setPadding(dp(6), dp(6), dp(6), dp(6))
                    addView(iconView(R.drawable.ic_close, 16, StitchColors.ON_SURFACE_VARIANT))
                    setOnClickListener {
                        searchQuery = ""
                        renderTab(HubTab.EXPLORE)
                    }
                })
            } else {
                addView(TextView(context).apply {
                    text = "검색"
                    textSize = 12f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                    background = roundedBg(StitchColors.PLAY_GREEN, null, 8)
                    setPadding(dp(10), dp(5), dp(10), dp(5))
                    setOnClickListener {
                        searchQuery = input.text.toString()
                        renderTab(HubTab.EXPLORE)
                    }
                })
            }
        }
        body.addView(paddedBox(searchBox, bottomDp = 12))

        val categories = listOf(
            "all" to "전체",
            "godot" to "Godot 3D",
            "action" to "액션",
            "puzzle" to "퍼즐",
            "web" to "HTML5 웹"
        )
        val chipScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val chipRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), 0, dp(16), dp(14))
        }
        for ((catId, catLabel) in categories) {
            val active = selectedCategory == catId
            chipRow.addView(TextView(this).apply {
                text = catLabel
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor(if (active) StitchColors.ON_PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT))
                background = roundedBg(
                    fillHex = if (active) StitchColors.PLAY_GREEN else StitchColors.SURFACE_CONTAINER,
                    strokeHex = if (active) null else StitchColors.OUTLINE_VARIANT,
                    radiusDp = 999
                )
                setPadding(dp(16), dp(8), dp(16), dp(8))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { rightMargin = dp(8) }
                setOnClickListener {
                    selectedCategory = catId
                    renderTab(HubTab.EXPLORE)
                }
            })
        }
        chipScroll.addView(chipRow)
        body.addView(chipScroll)

        if (games.isEmpty()) {
            body.addView(paddedBox(emptyCatalogCard()))
        } else {
            val grid = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), 0, dp(16), 0)
            }
            var i = 0
            while (i < games.size) {
                val pairRow = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply { bottomMargin = dp(12) }
                }
                pairRow.addView(stitchGameCard(games[i], widthDp = null, showPlayButton = false))
                pairRow.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(12), dp(1)) })
                if (i + 1 < games.size) {
                    pairRow.addView(stitchGameCard(games[i + 1], widthDp = null, showPlayButton = false))
                } else {
                    pairRow.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0, dp(1), 1f) })
                }
                grid.addView(pairRow)
                i += 2
            }
            body.addView(grid)
        }
    }

    private fun emptyCatalogCard(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
        setPadding(dp(20), dp(24), dp(20), dp(24))
        addView(TextView(context).apply {
            text = "일치하는 게임이 없습니다"
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
        })
        addView(TextView(context).apply {
            text = "다른 검색어나 카테고리를 선택해 보세요."
            textSize = 13f
            setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            setPadding(0, dp(6), 0, dp(14))
        })
        addView(TextView(context).apply {
            text = "필터 초기화"
            textSize = 13.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
            background = roundedBg(StitchColors.PLAY_GREEN, null, 8)
            setPadding(dp(18), dp(9), dp(18), dp(9))
            setOnClickListener {
                selectedCategory = "all"
                searchQuery = ""
                headerSearchInput.setText("")
                renderTab(activeTab)
            }
        })
    }

    // ---- 3. AVATAR STUDIO TAB (Inline Single-Runtime Godot 4.7.2 3D Preview + Sticky Wardrobe) ----

    private fun buildAvatarTab(body: LinearLayout) {
        // Handled directly via buildInlineGodotAvatarTab() for non-scrolling sticky Godot SurfaceView harmony.
    }

    private fun buildInlineGodotAvatarTab(): View {
        releaseInlineGodotPreview()
        val accentHex = savedAvatarColor()
        val equipped = equippedAvatarIds().toMutableSet()
        avatarTryOnIds.clear()
        avatarTryOnIds.addAll(equipped)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setPadding(0, dp(10), 0, 0)
        }

        // 1. Sticky Studio Title + Primary Save Button
        val saveBtn = TextView(this).apply {
            text = if (avatarSavedState) "✓ 저장됨" else "저장"
            textSize = 13.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
            background = roundedBg(StitchColors.PLAY_GREEN, null, 8)
            setPadding(dp(16), dp(7), dp(16), dp(7))
            setOnClickListener {
                avatarSavedState = true
                val ownedIds = AvatarCatalog.ITEMS.filter { it.owned }.map { it.id }.toSet()
                val persistIds = avatarTryOnIds.filter { ownedIds.contains(it) }.toSet().ifEmpty { setOf("i1", "i2") }
                saveEquippedAvatarIds(persistIds)
                saveAvatarColor(savedAvatarColor())
                text = "✓ 저장됨"
                syncProfileUpdate(avatarColor = savedAvatarColor(), toastMsg = "아바타 스타일을 저장했습니다.")
            }
        }
        avatarSaveButton = saveBtn

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(2), dp(16), dp(10))
            addView(TextView(context).apply {
                text = "아바타 스튜디오"
                textSize = 18.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            addView(saveBtn)
        }
        root.addView(headerRow)

        // 2. Sticky 4:3 Inline Godot 4.7.2 3D Preview Stage (never inside ScrollView -> zero SurfaceView tearing!)
        val stage = InlineGodotAvatarStage(
            context = this,
            initialEquipped = avatarTryOnIds.toSet(),
            initialAccentHex = accentHex
        )
        inlineGodotStage = stage
        root.addView(paddedBox(stage, bottomDp = 10))

        // 3. Independently Scrollable Bottom Wardrobe & Shop Area
        val scroll = ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        val scrollBody = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(2), 0, dp(20))
        }

        // Theme Accent Swatch Row (in-place updates, zero Godot restart!)
        val swatchCard = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
            setPadding(dp(12), dp(8), dp(12), dp(8))
            addView(TextView(context).apply {
                text = "테마 컬러"
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            for ((hex, name) in avatarAccentOptions) {
                val swatch = View(context).apply {
                    layoutParams = LinearLayout.LayoutParams(dp(26), dp(26)).apply { leftMargin = dp(8) }
                    setOnClickListener {
                        avatarSavedState = false
                        avatarSaveButton?.text = "저장"
                        saveAvatarColor(hex)
                        inlineGodotStage?.sendEquip(avatarTryOnIds.toSet(), hex, "accent:$hex")
                        refreshInlineAvatarVisualsInPlace()
                        syncProfileUpdate(avatarColor = hex, toastMsg = "아바타 테마 적용: $name")
                    }
                }
                avatarSwatchViews[hex] = swatch
                addView(swatch)
            }
        }
        scrollBody.addView(paddedBox(swatchCard, bottomDp = 10))

        // Category Filter Chips (rebuilds ONLY wardrobe grid, keeping live Godot 3D preview uninterrupted!)
        val chipScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val chipRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(2), dp(16), dp(10))
        }
        avatarCategoryChipHost = chipRow
        chipScroll.addView(chipRow)
        scrollBody.addView(chipScroll)

        // Wardrobe & Shop Section Header + 2-Column Grid Host
        scrollBody.addView(sectionHeader("내 옷장 & 상점", monoAccent = "${AvatarCatalog.ITEMS.size}개 아이템"))
        val gridHost = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), 0, dp(16), dp(14))
        }
        avatarWardrobeGridHost = gridHost
        scrollBody.addView(gridHost)

        rebuildInlineAvatarChipsAndGrid()
        scroll.addView(scrollBody)
        root.addView(scroll)
        return root
    }

    private fun rebuildInlineAvatarChipsAndGrid() {
        val chipRow = avatarCategoryChipHost ?: return
        val grid = avatarWardrobeGridHost ?: return
        chipRow.removeAllViews()
        for ((catId, label) in AvatarCatalog.CATEGORIES) {
            val active = selectedAvatarCategory == catId
            chipRow.addView(TextView(this).apply {
                text = label
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor(if (active) StitchColors.ON_PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT))
                background = roundedBg(
                    fillHex = if (active) StitchColors.PLAY_GREEN else StitchColors.SURFACE_CONTAINER,
                    strokeHex = if (active) null else StitchColors.OUTLINE_VARIANT,
                    radiusDp = 999
                )
                setPadding(dp(15), dp(7), dp(15), dp(7))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    rightMargin = dp(8)
                }
                setOnClickListener {
                    if (selectedAvatarCategory != catId) {
                        selectedAvatarCategory = catId
                        rebuildInlineAvatarChipsAndGrid()
                    }
                }
            })
        }

        grid.removeAllViews()
        avatarCardBindings.clear()
        val visibleItems = AvatarCatalog.ITEMS.filter {
            selectedAvatarCategory == "all" || it.category == selectedAvatarCategory
        }
        for (i in visibleItems.indices step 2) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(12)
                }
            }
            row.addView(buildInlineAvatarItemCard(visibleItems[i]).apply {
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    rightMargin = dp(6)
                }
            })
            if (i + 1 < visibleItems.size) {
                row.addView(buildInlineAvatarItemCard(visibleItems[i + 1]).apply {
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        leftMargin = dp(6)
                    }
                })
            } else {
                row.addView(View(this).apply {
                    layoutParams = LinearLayout.LayoutParams(0, dp(1), 1f).apply { leftMargin = dp(6) }
                })
            }
            grid.addView(row)
        }
        refreshInlineAvatarVisualsInPlace()
    }

    private fun refreshInlineAvatarVisualsInPlace() {
        val currentAccent = savedAvatarColor()
        for ((hex, v) in avatarSwatchViews) {
            val selected = hex.equals(currentAccent, ignoreCase = true)
            v.background = ovalBg(hex, if (selected) "#FFFFFF" else StitchColors.OUTLINE_VARIANT, if (selected) 3 else 1)
        }
        for (b in avatarCardBindings) {
            val isEquipped = avatarTryOnIds.contains(b.item.id)
            b.container.background = roundedBg(
                fillHex = StitchColors.SURFACE_CONTAINER,
                strokeHex = if (isEquipped) StitchColors.PLAY_GREEN else StitchColors.OUTLINE_VARIANT,
                radiusDp = 12
            )
            b.checkBadge.visibility = if (isEquipped) View.VISIBLE else View.GONE
            if (b.item.owned || isEquipped) {
                b.statusLabel?.visibility = View.VISIBLE
                b.priceWrap?.visibility = View.GONE
                b.statusLabel?.text = if (isEquipped) (if (b.item.owned) "착용 중" else "3D 시착 중") else "보유 중"
                b.statusLabel?.setTextColor(Color.parseColor(if (isEquipped) StitchColors.PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT))
            } else {
                b.statusLabel?.visibility = View.GONE
                b.priceWrap?.visibility = View.VISIBLE
            }
        }
    }

    private fun buildInlineAvatarItemCard(item: AvatarCosmeticItem): View {
        val checkBadge = TextView(this).apply {
            text = "✓"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
            background = ovalBg(StitchColors.PLAY_GREEN)
        }
        val statusLabel = TextView(this).apply {
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
        }
        val priceWrap = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(iconView(R.drawable.ic_coin, 13, StitchColors.COIN_GOLD).apply {
                (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(3)
            })
            addView(TextView(context).apply {
                text = item.price.toString()
                textSize = 11.5f
                typeface = Typeface.MONOSPACE
                setTextColor(Color.parseColor(StitchColors.COIN_GOLD))
            })
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(8), dp(8), dp(10))
            setOnClickListener {
                // Single-slot swap per category directly onto inline Godot 3D preview (supports live 3D try-on for shop items!)
                if (avatarTryOnIds.contains(item.id)) {
                    avatarTryOnIds.remove(item.id)
                } else {
                    AvatarCatalog.ITEMS.filter { it.category == item.category }.forEach { avatarTryOnIds.remove(it.id) }
                    avatarTryOnIds.add(item.id)
                }
                if (item.owned) {
                    val ownedSet = AvatarCatalog.ITEMS.filter { it.owned }.map { it.id }.toSet()
                    val persisted = avatarTryOnIds.filter { ownedSet.contains(it) }.toSet()
                    if (persisted.isNotEmpty()) saveEquippedAvatarIds(persisted)
                }
                avatarSavedState = false
                avatarSaveButton?.text = "저장"
                inlineGodotStage?.sendEquip(avatarTryOnIds.toSet(), savedAvatarColor(), item.id)
                refreshInlineAvatarVisualsInPlace()
            }

            val thumbWrap = FrameLayout(context).apply {
                background = roundedBg(StitchColors.SURFACE_HIGHEST, null, 8)
                clipToOutline = true
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(116))
                addView(AvatarItemThumbView(context, item), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                addView(checkBadge, FrameLayout.LayoutParams(dp(24), dp(24), Gravity.TOP or Gravity.END).apply {
                    topMargin = dp(8)
                    rightMargin = dp(8)
                })
            }
            addView(thumbWrap)

            addView(TextView(context).apply {
                text = item.name
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                setPadding(dp(4), dp(7), dp(4), dp(3))
            })

            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(4), 0, dp(4), 0)
                addView(TextView(context).apply {
                    text = item.categoryLabel
                    textSize = 11f
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(statusLabel)
                addView(priceWrap)
            })
        }
        avatarCardBindings.add(InlineAvatarCardBinding(item, container, checkBadge, statusLabel, priceWrap))
        return container
    }

    private fun syncProfileUpdate(
        displayName: String? = null,
        avatarColor: String? = null,
        bio: String? = null,
        toastMsg: String
    ) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.updateSocialProfile(token, displayName = displayName, avatarColor = avatarColor, bio = bio)
            }.onSuccess { updated ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    remoteSocialProfile = updated
                    if (activeTab == HubTab.AVATAR && inlineGodotStage != null) {
                        avatarSaveButton?.text = if (avatarSavedState) "✓ 저장됨" else "저장"
                    } else {
                        renderTab(activeTab)
                    }
                    Toast.makeText(this, toastMsg, Toast.LENGTH_SHORT).show()
                }
            }.onFailure { err ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    if (activeTab == HubTab.AVATAR && inlineGodotStage != null) {
                        avatarSaveButton?.text = if (avatarSavedState) "✓ 저장됨" else "저장"
                    } else {
                        renderTab(activeTab)
                    }
                    Toast.makeText(this, "로컬 저장됨 (서버 동기화 실패: ${err.message})", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun showEditProfileDialog() {
        val currentName = remoteSocialProfile?.displayName ?: profile.displayName
        val currentHandle = remoteSocialProfile?.handle ?: profile.handle
        val currentBio = remoteSocialProfile?.bio.orEmpty()

        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE))
            setPadding(dp(18), dp(14), dp(18), dp(10))
        }
        val nameInput = EditText(this).apply {
            hint = "표시 이름 (2~40자)"
            setText(currentName)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 10)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setSingleLine(true)
        }
        val bioInput = EditText(this).apply {
            hint = "한 줄 소개 (선택)"
            setText(currentBio)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 10)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setSingleLine(true)
        }
        box.addView(TextView(this).apply {
            text = "내 핸들: $currentHandle"
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
            setPadding(0, 0, 0, dp(10))
        })
        box.addView(nameInput)
        box.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(1), dp(8)) })
        box.addView(bioInput)

        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("프로필 편집")
            .setView(box)
            .setPositiveButton("저장") { _, _ ->
                val name = nameInput.text.toString().trim()
                val bio = bioInput.text.toString().trim()
                if (name.length < 2) {
                    Toast.makeText(this, "표시 이름은 2자 이상이어야 합니다.", Toast.LENGTH_SHORT).show()
                } else {
                    syncProfileUpdate(displayName = name, bio = bio, toastMsg = "프로필이 업데이트되었습니다.")
                }
            }
            .setNeutralButton("핸들 복사") { _, _ ->
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                cm?.setPrimaryClip(ClipData.newPlainText("PlayHub Handle", currentHandle))
                Toast.makeText(this, "핸들 복사됨: $currentHandle", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    // ---- 4. SOCIAL & CHAT & PARTY HUB TAB (Live M3 Social API) ----

    private fun buildSocialHubTab(body: LinearLayout) {
        val caps = AgeGatePolicy.evaluateCapabilities(profile.ageTier, profile.isGuest, profile.parentalConsentVerified)

        if (caps.requiresParentalConsent) {
            body.addView(sectionHeader("소셜 · 아동 보호 모드"))
            val safeCard = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
                setPadding(dp(16), dp(16), dp(16), dp(16))
                addView(TextView(context).apply {
                    text = "아동 보호 모드 (${profile.ageTier.name})"
                    textSize = 15f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                })
                addView(TextView(context).apply {
                    text = "법정대리인 동의 전에는 친구 요청·자유 채팅·파티 참여가 차단됩니다. 동의 완료 후 사전 정의된 안전 퀵메시지 파티 기능이 열립니다."
                    textSize = 13f
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                    setPadding(0, dp(8), 0, 0)
                })
            }
            body.addView(paddedBox(safeCard))
            return
        }

        // Top Action Bar: + 친구 추가 | 파티 만들기 | 코드 합류
        val quickActions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(2), dp(16), dp(10))
            addView(compactChipButton("+ 친구 추가", primary = true) { showAddFriendDialog() })
            addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(8), dp(1)) })
            addView(compactChipButton("파티 만들기", primary = false) { showCreatePartyDialog() })
            addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(8), dp(1)) })
            addView(compactChipButton("코드 합류", primary = false) { showJoinPartyCodeDialog() })
        }
        body.addView(quickActions)

        // Active Party Lobby Card
        remoteActiveParty?.let { party ->
            body.addView(paddedBox(buildPartyLobbyCard(party), bottomDp = 12))
        }

        // Incoming Friend Requests
        if (remoteIncomingRequests.isNotEmpty()) {
            body.addView(sectionHeader("받은 친구 요청", monoAccent = "${remoteIncomingRequests.size}건"))
            for (req in remoteIncomingRequests) {
                val reqCard = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.PLAY_GREEN, 12)
                    setPadding(dp(12), dp(10), dp(12), dp(10))
                    addView(avatarCircle(req.displayName.take(1).ifBlank { "P" }, req.avatarColor, 42, true))
                    addView(LinearLayout(context).apply {
                        orientation = LinearLayout.VERTICAL
                        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                            leftMargin = dp(10)
                        }
                        addView(TextView(context).apply {
                            text = req.displayName
                            textSize = 14f
                            typeface = Typeface.DEFAULT_BOLD
                            setTextColor(Color.WHITE)
                        })
                        addView(TextView(context).apply {
                            text = req.handle
                            textSize = 11.5f
                            typeface = Typeface.MONOSPACE
                            setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        })
                    })
                    addView(TextView(context).apply {
                        text = "수락"
                        textSize = 12f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                        background = roundedBg(StitchColors.PLAY_GREEN, null, 8)
                        setPadding(dp(12), dp(6), dp(12), dp(6))
                        setOnClickListener { respondToFriendRequest(req.principalId, accept = true) }
                    })
                    addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(6), dp(1)) })
                    addView(TextView(context).apply {
                        text = "거절"
                        textSize = 12f
                        setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 8)
                        setPadding(dp(10), dp(6), dp(10), dp(6))
                        setOnClickListener { respondToFriendRequest(req.principalId, accept = false) }
                    })
                }
                body.addView(paddedBox(reqCard, bottomDp = 8))
            }
        }

        // Friends Header + Filter
        val onlineFriends = remoteFriends.filter { it.presence.online }
        val topRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(6), dp(16), dp(10))
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                addView(TextView(context).apply {
                    text = "친구 목록"
                    textSize = 18f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                })
                addView(TextView(context).apply {
                    text = "${onlineFriends.size}명 접속 중"
                    textSize = 12f
                    typeface = Typeface.MONOSPACE
                    setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                    setPadding(dp(8), 0, 0, 0)
                })
            })
            addView(filterTogglePill("전체", !chatFilterOnlineOnly) {
                chatFilterOnlineOnly = false
                renderTab(HubTab.CHAT)
            })
            addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(6), dp(1)) })
            addView(filterTogglePill("접속 중", chatFilterOnlineOnly) {
                chatFilterOnlineOnly = true
                renderTab(HubTab.CHAT)
            })
        }
        body.addView(topRow)

        // Online Quick Strip
        if (onlineFriends.isNotEmpty()) {
            val quickScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
            val quickRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(dp(16), dp(2), dp(16), dp(12))
            }
            for (friend in onlineFriends) {
                quickRow.addView(LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(dp(64), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                        rightMargin = dp(10)
                    }
                    setOnClickListener { openDmChat(friend) }
                    addView(avatarCircle(friend.displayName.take(1).ifBlank { "P" }, friend.avatarColor, 54, true))
                    addView(TextView(context).apply {
                        text = friend.displayName
                        textSize = 11f
                        typeface = Typeface.DEFAULT_BOLD
                        gravity = Gravity.CENTER
                        setTextColor(Color.WHITE)
                        setPadding(0, dp(4), 0, 0)
                        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                    })
                })
            }
            quickScroll.addView(quickRow)
            body.addView(quickScroll)
        }

        // Real-Time Chat Threads
        body.addView(sectionHeader("실시간 채팅", actionLabel = "새로고침") { refreshSocialOnly() })
        val visible = if (chatFilterOnlineOnly) onlineFriends else remoteFriends
        if (visible.isEmpty()) {
            val emptyCard = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
                setPadding(dp(18), dp(20), dp(18), dp(20))
                addView(TextView(context).apply {
                    text = "아직 대화할 친구가 없습니다"
                    textSize = 14.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                })
                addView(TextView(context).apply {
                    text = "상단 '+ 친구 추가'로 minjun#1024 / seoyeon#2048 을 검색하거나 '코드 합류'에 PLAY99를 입력해 바로 파티에 참여하세요."
                    textSize = 12f
                    gravity = Gravity.CENTER
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                    setPadding(0, dp(6), 0, dp(12))
                })
                addView(primaryActionButton("+ 친구 검색하고 추가하기") { showAddFriendDialog() })
            }
            body.addView(paddedBox(emptyCard))
        } else {
            for (friend in visible) {
                val activityText = when {
                    friend.presence.status == "in_game" && !friend.presence.gameTitle.isNullOrBlank() ->
                        "${friend.presence.gameTitle} 중"
                    friend.presence.online -> "접속 중"
                    else -> "오프라인"
                }
                val rowCard = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    background = roundedBg(StitchColors.SURFACE_CONTAINER, null, 12)
                    setPadding(dp(12), dp(12), dp(12), dp(12))
                    setOnClickListener { openDmChat(friend) }

                    addView(avatarCircle(friend.displayName.take(1).ifBlank { "P" }, friend.avatarColor, 48, friend.presence.online))

                    val col = LinearLayout(context).apply {
                        orientation = LinearLayout.VERTICAL
                        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                            leftMargin = dp(12)
                        }
                        addView(LinearLayout(context).apply {
                            orientation = LinearLayout.HORIZONTAL
                            gravity = Gravity.CENTER_VERTICAL
                            addView(TextView(context).apply {
                                text = friend.displayName
                                textSize = 15f
                                typeface = Typeface.DEFAULT_BOLD
                                setTextColor(Color.WHITE)
                            })
                            addView(TextView(context).apply {
                                text = " · $activityText"
                                textSize = 11.5f
                                typeface = Typeface.DEFAULT_BOLD
                                setTextColor(Color.parseColor(if (friend.presence.online) StitchColors.PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT))
                                maxLines = 1
                                ellipsize = TextUtils.TruncateAt.END
                                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                            })
                        })
                        addView(TextView(context).apply {
                            text = friend.lastMessage ?: "${friend.handle} · 탭해서 1:1 대화 시작"
                            textSize = 13f
                            setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                            maxLines = 1
                            ellipsize = TextUtils.TruncateAt.END
                            setPadding(0, dp(4), 0, 0)
                        })
                    }
                    addView(col)
                }
                body.addView(paddedBox(rowCard, bottomDp = 8))
            }
        }
    }

    private fun compactChipButton(label: String, primary: Boolean, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        textSize = 11.5f
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setTextColor(Color.parseColor(if (primary) StitchColors.ON_PLAY_GREEN else StitchColors.ON_SURFACE))
        background = roundedBg(
            fillHex = if (primary) StitchColors.PLAY_GREEN else StitchColors.SURFACE_CONTAINER,
            strokeHex = if (primary) null else StitchColors.OUTLINE_VARIANT,
            radiusDp = 10
        )
        setPadding(dp(6), dp(10), dp(6), dp(10))
        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        setOnClickListener { onClick() }
    }

    private fun buildPartyLobbyCard(party: SocialPartyDto): View {
        val myPrincipalId = remoteSocialProfile?.principalId ?: profile.principalId
        val meMember = party.members.find { it.principalId == myPrincipalId }
        val amReady = meMember?.ready ?: false
        val targetGame = party.targetGameId?.let { id -> allCatalogGames().find { it.id == id } }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.PLAY_GREEN, 14)
            setPadding(dp(14), dp(14), dp(14), dp(14))

            // Title + Room Code Pill (Tap to copy invite link)
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                    addView(TextView(context).apply {
                        text = party.title
                        textSize = 15.5f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.WHITE)
                    })
                    addView(TextView(context).apply {
                        text = "게임: ${targetGame?.title ?: (party.targetGameId ?: "미선택")} · ${party.members.size}/${party.maxMembers}명"
                        textSize = 11.5f
                        setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        setPadding(0, dp(2), 0, 0)
                    })
                })
                addView(pillChip("코드 ${party.roomCode}", "#005231", "#C0FFD6", StitchColors.PLAY_GREEN).apply {
                    setOnClickListener {
                        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                        cm?.setPrimaryClip(ClipData.newPlainText("PlayHub Party Invite", party.deepLinkUrl))
                        Toast.makeText(context, "초대 링크 복사됨 (${party.roomCode}): ${party.deepLinkUrl}", Toast.LENGTH_LONG).show()
                    }
                })
            })

            // Member list
            val memberRow = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, dp(10), 0, dp(10))
            }
            for (m in party.members) {
                memberRow.addView(LinearLayout(context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(0, dp(4), 0, dp(4))
                    addView(avatarCircle(m.displayName.take(1).ifBlank { "P" }, m.avatarColor, 30, true))
                    addView(TextView(context).apply {
                        text = "${m.displayName} (${m.handle})"
                        textSize = 12.5f
                        setTextColor(Color.WHITE)
                        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                            leftMargin = dp(8)
                        }
                    })
                    val roleTag = if (m.role == "leader") "방장" else if (m.ready) "준비 완료" else "대기 중"
                    val tagBg = if (m.ready || m.role == "leader") "#005231" else StitchColors.SURFACE_HIGH
                    val tagFg = if (m.ready || m.role == "leader") "#C0FFD6" else StitchColors.ON_SURFACE_VARIANT
                    addView(pillChip(roleTag, tagBg, tagFg))
                })
            }
            addView(memberRow)

            // Active Cross-Play Co-Entry Launch Banner
            val activeLaunch = party.activeLaunch
            if (activeLaunch != null) {
                val launchGame = allCatalogGames().find { it.id == activeLaunch.gameId }
                val rosterText = activeLaunch.participants.joinToString(" · ") { pt ->
                    val plat = when (pt.platform.lowercase()) {
                        "android" -> "Android"
                        "ios" -> "iOS"
                        else -> "PC 웹"
                    }
                    "$plat ${pt.displayName}"
                }
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    background = roundedBg("#133025", StitchColors.PLAY_GREEN, 12)
                    setPadding(dp(12), dp(10), dp(12), dp(10))
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(10)
                    }
                    addView(TextView(context).apply {
                        text = "🎮 크로스플레이 함께 입장 중 · ${activeLaunch.matchRoomId}"
                        textSize = 12.5f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.parseColor("#C0FFD6"))
                    })
                    addView(TextView(context).apply {
                        text = "참여: ${rosterText.ifBlank { "대기 중" }}"
                        textSize = 11.5f
                        setTextColor(Color.WHITE)
                        setPadding(0, dp(3), 0, dp(8))
                    })
                    addView(TextView(context).apply {
                        text = "🚀 지금 함께 입장 (${launchGame?.title ?: activeLaunch.gameId})"
                        textSize = 12.5f
                        typeface = Typeface.DEFAULT_BOLD
                        gravity = Gravity.CENTER
                        setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                        background = roundedBg(StitchColors.PLAY_GREEN, null, 10)
                        setPadding(dp(10), dp(9), dp(10), dp(9))
                        setOnClickListener {
                            ackAndJoinLaunch(party, activeLaunch)
                        }
                    })
                })
            }

            // Action row: Ready toggle | Party Chat | Launch Together | Leave
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(compactChipButton(if (amReady) "준비 취소" else "준비 완료", primary = !amReady) {
                    togglePartyReady(party.id, !amReady)
                })
                addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(6), dp(1)) })
                addView(compactChipButton("파티 채팅", primary = false) {
                    openPartyChat(party)
                })
                addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(6), dp(1)) })
                addView(compactChipButton("함께 입장", primary = true) {
                    val game = targetGame ?: allCatalogGames().firstOrNull()
                    if (game != null) launchPartyTogether(party, game)
                })
                addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(6), dp(1)) })
                addView(compactChipButton("나가기", primary = false) {
                    leaveActiveParty(party.id)
                })
            })
        }
    }

    private fun openDmChat(friend: SocialFriendDto) {
        val subtitle = when {
            friend.presence.status == "in_game" && !friend.presence.gameTitle.isNullOrBlank() ->
                "${friend.presence.gameTitle} 중"
            friend.presence.online -> "접속 중 · ${friend.handle}"
            else -> "오프라인 · ${friend.handle}"
        }
        val target = ActiveChatTarget(
            channelType = "dm",
            targetId = friend.principalId,
            title = friend.displayName,
            subtitle = subtitle,
            avatarColor = friend.avatarColor,
            online = friend.presence.online,
            playingGameId = friend.presence.gameId,
            roomCode = friend.presence.roomCode
        )
        activeChatTarget = target
        activeChatMessages = emptyList()
        renderTab(HubTab.CHAT)
        loadChatMessages(target)
    }

    private fun openPartyChat(party: SocialPartyDto) {
        val target = ActiveChatTarget(
            channelType = "party",
            targetId = party.id,
            title = party.title,
            subtitle = "파티 코드 ${party.roomCode} · ${party.members.size}명",
            avatarColor = "#005231",
            online = true,
            playingGameId = party.targetGameId,
            roomCode = party.roomCode
        )
        activeChatTarget = target
        activeChatMessages = emptyList()
        renderTab(HubTab.CHAT)
        loadChatMessages(target)
    }

    private fun loadChatMessages(target: ActiveChatTarget) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.fetchSocialMessages(token, target.channelType, target.targetId)
            }.onSuccess { list ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    if (activeChatTarget?.targetId != target.targetId) return@runOnUiThread
                    activeChatMessages = list
                    renderTab(HubTab.CHAT)
                }
            }
        }
    }

    private fun filterTogglePill(text: String, active: Boolean, onClick: () -> Unit): TextView = TextView(this).apply {
        this.text = text
        textSize = 11.5f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(Color.parseColor(if (active) StitchColors.ON_PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT))
        background = roundedBg(if (active) StitchColors.PLAY_GREEN else StitchColors.SURFACE_CONTAINER, null, 999)
        setPadding(dp(12), dp(5), dp(12), dp(5))
        setOnClickListener { onClick() }
    }

    private fun buildChatRoomView(target: ActiveChatTarget): View {
        val playingGame = target.playingGameId?.let { gid -> allCatalogGames().find { it.id == gid } }
        val isChildQuickOnly = profile.ageTier == AgeTier.CHILD_PROTECTED

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

            // Subheader (#1F2225)
            val subheader = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundColor(Color.parseColor(StitchColors.SURFACE_LOW))
                setPadding(dp(14), dp(10), dp(14), dp(10))

                addView(FrameLayout(context).apply {
                    background = ovalBg(StitchColors.SURFACE_CONTAINER)
                    layoutParams = LinearLayout.LayoutParams(dp(34), dp(34)).apply { rightMargin = dp(10) }
                    addView(iconView(R.drawable.ic_arrow_back, 18, StitchColors.ON_SURFACE), FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER))
                    setOnClickListener {
                        activeChatTarget = null
                        refreshSocialOnly()
                        renderTab(HubTab.CHAT)
                    }
                })
                addView(avatarCircle(target.title.take(1).ifBlank { "P" }, target.avatarColor, 40, target.online))
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        leftMargin = dp(10)
                    }
                    addView(TextView(context).apply {
                        text = target.title
                        textSize = 15f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.WHITE)
                        maxLines = 1
                        ellipsize = TextUtils.TruncateAt.END
                    })
                    addView(TextView(context).apply {
                        text = target.subtitle
                        textSize = 11.5f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.parseColor(if (target.online) StitchColors.PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT))
                        maxLines = 1
                        ellipsize = TextUtils.TruncateAt.END
                    })
                })
                if (playingGame != null) {
                    addView(LinearLayout(context).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER
                        background = roundedBg(StitchColors.PLAY_GREEN, null, 8)
                        setPadding(dp(9), dp(6), dp(10), dp(6))
                        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                            rightMargin = dp(6)
                        }
                        addView(iconView(R.drawable.ic_play_arrow, 15, StitchColors.ON_PLAY_GREEN).apply {
                            (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(2)
                        })
                        addView(TextView(context).apply {
                            text = "합류"
                            textSize = 11.5f
                            typeface = Typeface.DEFAULT_BOLD
                            setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                        })
                        setOnClickListener {
                            if (!target.roomCode.isNullOrBlank() && target.channelType == "dm") {
                                joinPartyByCode(target.roomCode) { openExperienceDetail(playingGame) }
                            } else {
                                openExperienceDetail(playingGame)
                            }
                        }
                    })
                }
                if (target.channelType == "dm") {
                    addView(TextView(context).apply {
                        text = "관리"
                        textSize = 11.5f
                        setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 8)
                        setPadding(dp(9), dp(6), dp(9), dp(6))
                        setOnClickListener { showModerationMenu(target) }
                    })
                }
            }
            addView(subheader)
            addView(View(context).apply {
                setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
            })

            // Live Messages List
            val scroll = ScrollView(context).apply {
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
            }
            val msgCol = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(14), dp(16), dp(14))
            }
            if (playingGame != null) {
                val gameStrip = LinearLayout(context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
                    setPadding(dp(10), dp(10), dp(12), dp(10))
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(14)
                    }
                    setOnClickListener { openExperienceDetail(playingGame) }
                    addView(TextView(context).apply {
                        text = playingGame.tagCode
                        textSize = 13f
                        typeface = Typeface.DEFAULT_BOLD
                        gravity = Gravity.CENTER
                        setTextColor(Color.WHITE)
                        background = gradientThumb(playingGame.accentStart, playingGame.accentEnd, 8)
                        layoutParams = LinearLayout.LayoutParams(dp(64), dp(38)).apply { rightMargin = dp(10) }
                    })
                    addView(LinearLayout(context).apply {
                        orientation = LinearLayout.VERTICAL
                        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                        addView(TextView(context).apply {
                            text = if (target.roomCode != null) "지금 플레이 중 · 코드 ${target.roomCode}" else "지금 플레이 중"
                            textSize = 11f
                            typeface = Typeface.DEFAULT_BOLD
                            setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                        })
                        addView(TextView(context).apply {
                            text = playingGame.title
                            textSize = 14f
                            typeface = Typeface.DEFAULT_BOLD
                            setTextColor(Color.WHITE)
                        })
                    })
                }
                msgCol.addView(gameStrip)
            }

            if (activeChatMessages.isEmpty()) {
                msgCol.addView(TextView(context).apply {
                    text = "아직 메시지가 없습니다. 첫 인사를 보내 보세요!"
                    textSize = 13f
                    gravity = Gravity.CENTER
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                    setPadding(dp(12), dp(24), dp(12), dp(24))
                })
            } else {
                for (msg in activeChatMessages) {
                    val wrap = LinearLayout(context).apply {
                        orientation = LinearLayout.VERTICAL
                        gravity = if (msg.senderMe) Gravity.END else Gravity.START
                        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                            bottomMargin = dp(10)
                        }
                        if (!msg.senderMe && target.channelType == "party") {
                            addView(TextView(context).apply {
                                text = msg.senderName
                                textSize = 11f
                                setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                                setPadding(dp(4), 0, dp(4), dp(2))
                                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                            })
                        }
                        addView(TextView(context).apply {
                            text = msg.body
                            textSize = 14f
                            setTextColor(Color.parseColor(if (msg.senderMe) StitchColors.ON_PLAY_GREEN else StitchColors.ON_SURFACE))
                            background = roundedBg(
                                fillHex = if (msg.senderMe) StitchColors.PLAY_GREEN else StitchColors.SURFACE_HIGH,
                                strokeHex = if (msg.senderMe) null else StitchColors.OUTLINE_VARIANT,
                                radiusDp = 12
                            )
                            setPadding(dp(12), dp(9), dp(12), dp(9))
                            maxWidth = dp(280)
                            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                        })
                        addView(TextView(context).apply {
                            val timeLabel = formatChatTimestamp(msg.createdAt)
                            text = if (msg.isQuickMessage) "안전 퀵메시지 · $timeLabel" else timeLabel
                            textSize = 10.5f
                            setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                            setPadding(dp(4), dp(3), dp(4), 0)
                            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                        })
                    }
                    msgCol.addView(wrap)
                }
            }
            scroll.addView(msgCol)
            addView(scroll)

            // Composer Bar (Safe Quick Messages for CHILD_PROTECTED, Free Text for TEEN/ADULT)
            addView(View(context).apply {
                setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
            })
            if (isChildQuickOnly) {
                val qScroll = HorizontalScrollView(context).apply {
                    isHorizontalScrollBarEnabled = false
                    setBackgroundColor(Color.parseColor(StitchColors.SURFACE_LOW))
                }
                val qRow = LinearLayout(context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    setPadding(dp(12), dp(10), dp(12), dp(10))
                    for (qm in safeQuickMessages) {
                        addView(TextView(context).apply {
                            text = qm.text
                            textSize = 12.5f
                            typeface = Typeface.DEFAULT_BOLD
                            setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                            background = roundedBg(StitchColors.PLAY_GREEN, null, 999)
                            setPadding(dp(14), dp(8), dp(14), dp(8))
                            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                                rightMargin = dp(8)
                            }
                            setOnClickListener { postSocialMessage(target, bodyText = null, quickMessageId = qm.id) }
                        })
                    }
                }
                qScroll.addView(qRow)
                addView(qScroll)
            } else {
                val composer = LinearLayout(context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setBackgroundColor(Color.parseColor(StitchColors.SURFACE_LOW))
                    setPadding(dp(12), dp(10), dp(12), dp(10))
                    val input = EditText(context).apply {
                        hint = "${target.title}에 메시지 보내기..."
                        textSize = 14f
                        setTextColor(Color.WHITE)
                        setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 999)
                        setPadding(dp(16), dp(9), dp(16), dp(9))
                        setSingleLine(true)
                        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                            rightMargin = dp(8)
                        }
                    }
                    val sendBtn = FrameLayout(context).apply {
                        background = ovalBg(StitchColors.PLAY_GREEN)
                        layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
                        addView(iconView(R.drawable.ic_send, 18, StitchColors.ON_PLAY_GREEN), FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER))
                        setOnClickListener {
                            val txt = input.text.toString().trim()
                            if (txt.isEmpty()) return@setOnClickListener
                            input.setText("")
                            postSocialMessage(target, bodyText = txt, quickMessageId = null)
                        }
                    }
                    addView(input)
                    addView(sendBtn)
                }
                addView(composer)
            }
        }
    }

    // ---- Social API Action Handlers ----

    private fun postSocialMessage(target: ActiveChatTarget, bodyText: String?, quickMessageId: String?) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.sendSocialMessage(token, target.channelType, target.targetId, bodyText, quickMessageId)
                client.fetchSocialMessages(token, target.channelType, target.targetId)
            }.onSuccess { updated ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    activeChatMessages = updated
                    renderTab(HubTab.CHAT)
                }
            }.onFailure { err ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    Toast.makeText(this, "전송 실패: ${err.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun showAddFriendDialog() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE))
            setPadding(dp(16), dp(12), dp(16), dp(12))
        }
        val queryInput = EditText(this).apply {
            hint = "핸들 또는 이름 검색 (예: minjun#1024)"
            textSize = 14f
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 10)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setSingleLine(true)
        }
        val resultsHost = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(10), 0, 0)
        }
        var dialogRef: AlertDialog? = null

        fun renderResults(users: List<SocialSearchUserDto>) {
            resultsHost.removeAllViews()
            if (users.isEmpty()) {
                resultsHost.addView(TextView(this).apply {
                    text = "검색 결과가 없습니다."
                    textSize = 12.5f
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                    setPadding(dp(4), dp(8), dp(4), dp(8))
                })
                return
            }
            for (u in users) {
                resultsHost.addView(LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 10)
                    setPadding(dp(10), dp(9), dp(10), dp(9))
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(8)
                    }
                    addView(avatarCircle(u.displayName.take(1).ifBlank { "P" }, u.avatarColor, 36, u.presence.online))
                    addView(LinearLayout(context).apply {
                        orientation = LinearLayout.VERTICAL
                        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                            leftMargin = dp(10)
                        }
                        addView(TextView(context).apply {
                            text = u.displayName
                            textSize = 13.5f
                            typeface = Typeface.DEFAULT_BOLD
                            setTextColor(Color.WHITE)
                        })
                        addView(TextView(context).apply {
                            text = u.handle
                            textSize = 11f
                            typeface = Typeface.MONOSPACE
                            setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        })
                    })
                    addView(TextView(context).apply {
                        text = if (u.isFriend) "친구" else "요청"
                        textSize = 12f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.parseColor(if (u.isFriend) StitchColors.ON_SURFACE_VARIANT else StitchColors.ON_PLAY_GREEN))
                        background = roundedBg(if (u.isFriend) StitchColors.SURFACE_HIGH else StitchColors.PLAY_GREEN, null, 8)
                        setPadding(dp(12), dp(6), dp(12), dp(6))
                        if (!u.isFriend) {
                            setOnClickListener {
                                sendFriendRequestByHandle(u.handle)
                                dialogRef?.dismiss()
                            }
                        }
                    })
                })
            }
        }

        val searchBtn = primaryActionButton("플레이어 검색") {
            val q = queryInput.text.toString().trim()
            if (q.length < 2) {
                Toast.makeText(this, "2자 이상 입력해 주세요.", Toast.LENGTH_SHORT).show()
                return@primaryActionButton
            }
            val baseUrl = activeFarm.baseUrl
            ioExecutor.execute {
                runCatching {
                    val client = PlayHubApiClient(baseUrl)
                    val token = ensureAuthToken(client)
                    client.searchSocialUsers(token, q)
                }.onSuccess { list ->
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed) renderResults(list)
                    }
                }.onFailure { err ->
                    runOnUiThread {
                        Toast.makeText(this, "검색 실패: ${err.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
        (searchBtn.layoutParams as? LinearLayout.LayoutParams)?.topMargin = dp(8)

        box.addView(queryInput)
        box.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(1), dp(8)) })
        box.addView(searchBtn)
        box.addView(resultsHost)

        val dlg = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("친구 검색 · 추가")
            .setView(box)
            .setPositiveButton("핸들로 바로 요청") { _, _ ->
                val raw = queryInput.text.toString().trim()
                if (raw.isNotEmpty()) sendFriendRequestByHandle(raw)
            }
            .setNegativeButton("닫기", null)
            .create()
        dialogRef = dlg
        dlg.show()
    }

    private fun sendFriendRequestByHandle(handle: String) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.sendFriendRequest(token, handle)
            }.onSuccess { resp ->
                runOnUiThread {
                    val st = resp["status"] as? String ?: "pending"
                    Toast.makeText(this, "친구 요청 완료 ($handle · $st)", Toast.LENGTH_SHORT).show()
                    refreshSocialOnly()
                }
            }.onFailure { err ->
                runOnUiThread {
                    Toast.makeText(this, "친구 요청 실패: ${err.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun respondToFriendRequest(requesterId: String, accept: Boolean) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.respondFriendRequest(token, requesterId, accept)
            }.onSuccess {
                runOnUiThread {
                    Toast.makeText(this, if (accept) "친구 요청을 수락했습니다." else "친구 요청을 거절했습니다.", Toast.LENGTH_SHORT).show()
                    refreshSocialOnly()
                }
            }.onFailure { err ->
                runOnUiThread {
                    Toast.makeText(this, "처리 실패: ${err.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun showCreatePartyDialog() {
        val input = EditText(this).apply {
            hint = "파티 이름 (예: 주말 서바이벌 파티)"
            setText("${remoteSocialProfile?.displayName ?: profile.displayName}의 파티")
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("새 파티 만들기")
            .setView(input)
            .setPositiveButton("생성") { _, _ ->
                val title = input.text.toString().trim().ifEmpty { "PlayHub 파티" }
                val defaultGameId = allCatalogGames().firstOrNull()?.id
                val baseUrl = activeFarm.baseUrl
                ioExecutor.execute {
                    runCatching {
                        val client = PlayHubApiClient(baseUrl)
                        val token = ensureAuthToken(client)
                        client.createParty(token, title, defaultGameId)
                    }.onSuccess { party ->
                        runOnUiThread {
                            remoteActiveParty = party
                            renderTab(HubTab.CHAT)
                            Toast.makeText(this, "파티 생성 완료! 초대 코드: ${party.roomCode}", Toast.LENGTH_LONG).show()
                        }
                    }.onFailure { err ->
                        runOnUiThread {
                            Toast.makeText(this, "파티 생성 실패: ${err.message}", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun showJoinPartyCodeDialog() {
        val input = EditText(this).apply {
            hint = "6자리 초대 코드 입력 (예: PLAY99)"
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("초대 코드로 파티 합류")
            .setView(input)
            .setPositiveButton("합류") { _, _ ->
                val code = input.text.toString().trim().uppercase()
                if (code.isNotEmpty()) joinPartyByCode(code)
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun joinPartyByCode(roomCode: String, onJoined: ((SocialPartyDto) -> Unit)? = null) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.joinParty(token, roomCode)
            }.onSuccess { party ->
                runOnUiThread {
                    remoteActiveParty = party
                    renderTab(HubTab.CHAT)
                    Toast.makeText(this, "파티 합류 완료: ${party.title} (${party.roomCode})", Toast.LENGTH_SHORT).show()
                    onJoined?.invoke(party)
                }
            }.onFailure { err ->
                runOnUiThread {
                    Toast.makeText(this, "파티 합류 실패: ${err.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun togglePartyReady(partyId: String, nextReady: Boolean) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.setPartyReady(token, partyId, nextReady)
            }.onSuccess { party ->
                runOnUiThread {
                    remoteActiveParty = party
                    renderTab(HubTab.CHAT)
                }
            }.onFailure { err ->
                runOnUiThread {
                    Toast.makeText(this, "준비 상태 변경 실패: ${err.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun leaveActiveParty(partyId: String) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.leaveParty(token, partyId)
            }.onSuccess {
                runOnUiThread {
                    remoteActiveParty = null
                    if (activeChatTarget?.channelType == "party") activeChatTarget = null
                    renderTab(HubTab.CHAT)
                    Toast.makeText(this, "파티에서 나갔습니다.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun showModerationMenu(target: ActiveChatTarget) {
        val items = arrayOf("신고하기 (Report)", "사용자 차단 (Block · 친구 해제)")
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("${target.title} 안전 관리")
            .setItems(items) { _, idx ->
                val baseUrl = activeFarm.baseUrl
                if (idx == 0) {
                    ioExecutor.execute {
                        runCatching {
                            val client = PlayHubApiClient(baseUrl)
                            val token = ensureAuthToken(client)
                            client.reportSocialTarget(token, "user", target.targetId, "사용자 신고 (모바일 앱)")
                        }.onSuccess {
                            runOnUiThread { Toast.makeText(this, "신고가 접수되었습니다.", Toast.LENGTH_SHORT).show() }
                        }
                    }
                } else {
                    ioExecutor.execute {
                        runCatching {
                            val client = PlayHubApiClient(baseUrl)
                            val token = ensureAuthToken(client)
                            client.blockUser(token, target.targetId)
                        }.onSuccess {
                            runOnUiThread {
                                activeChatTarget = null
                                Toast.makeText(this, "${target.title}님을 차단했습니다.", Toast.LENGTH_SHORT).show()
                                refreshSocialOnly()
                            }
                        }
                    }
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    // ---- 5. PROFILE & MORE TAB (Stitch High-Contrast Dark Modern, Zero Forge) ----

    private fun buildMoreTab(body: LinearLayout) {
        val cachedMb = String.format("%.2f", PckPackageManager.totalCachedBytes(filesDir) / (1024.0 * 1024.0))
        val farmSelectorAllowed = FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)
        val displayName = remoteSocialProfile?.displayName ?: profile.displayName
        val handle = remoteSocialProfile?.handle ?: profile.handle
        val accentHex = savedAvatarColor()
        val equipped = equippedAvatarIds()
        val ownedCount = AvatarCatalog.ITEMS.count { it.owned }
        val friendCount = remoteFriends.size

        // 1. Stitch Profile Summary Card (Avatar Portrait + DisplayName/Handle + 프로필 button + 3-col Stats)
        val profileCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 16)
            setPadding(dp(16), dp(16), dp(16), dp(14))

            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, dp(14))

                // 64dp circular voxel avatar portrait with Play Green ring + online dot
                val portraitWrap = FrameLayout(context).apply {
                    layoutParams = LinearLayout.LayoutParams(dp(64), dp(64))
                    val ring = FrameLayout(context).apply {
                        background = ovalBg(StitchColors.SURFACE_HIGH, StitchColors.PLAY_GREEN, 2)
                        setPadding(dp(3), dp(3), dp(3), dp(3))
                        val clipCircle = FrameLayout(context).apply {
                            background = ovalBg(StitchColors.SURFACE_HIGH)
                            clipToOutline = true
                            addView(VoxelAvatarView(context, portraitMode = true).apply {
                                this.equippedIds = equipped
                                this.accentColorHex = accentHex
                            }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                        }
                        addView(clipCircle, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                    }
                    addView(ring, FrameLayout.LayoutParams(dp(64), dp(64)))
                    addView(View(context).apply {
                        background = ovalBg(StitchColors.ONLINE_DOT, StitchColors.SURFACE, 2)
                    }, FrameLayout.LayoutParams(dp(16), dp(16), Gravity.BOTTOM or Gravity.END))
                }
                addView(portraitWrap)

                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        leftMargin = dp(12)
                        rightMargin = dp(8)
                    }
                    addView(TextView(context).apply {
                        text = displayName
                        textSize = 17.5f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.WHITE)
                        maxLines = 1
                        ellipsize = TextUtils.TruncateAt.END
                    })
                    addView(TextView(context).apply {
                        text = handle
                        textSize = 12f
                        typeface = Typeface.MONOSPACE
                        setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        setPadding(0, dp(2), 0, 0)
                        maxLines = 1
                        ellipsize = TextUtils.TruncateAt.END
                    })
                })

                addView(TextView(context).apply {
                    text = "프로필"
                    textSize = 12f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                    background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 8)
                    setPadding(dp(12), dp(7), dp(12), dp(7))
                    setOnClickListener { showEditProfileDialog() }
                })
            })

            addView(View(context).apply {
                setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
            })

            // 3-Column Stats Row: 친구 | 아이템 | 코인
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(12), 0, dp(2))
                addView(profileStatCell(friendCount.toString(), "친구", "#FFFFFF") { renderTab(HubTab.CHAT) })
                addView(profileStatCell("${equipped.size}/${ownedCount}", "아이템", "#FFFFFF") { renderTab(HubTab.AVATAR) })
                addView(profileStatCell(formatCoin(profile.coinBalance), "코인", StitchColors.COIN_GOLD) { showCoinStoreDialog() })
            })
        }
        body.addView(paddedBox(profileCard, topDp = 4, bottomDp = 16))

        // 2. Quick Menu 2x2 Grid (Supported PlayHub Features Only — Zero Forge)
        body.addView(sectionHeader("메뉴"))
        val menuGrid = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), 0, dp(16), dp(14))

            val row1 = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(10)
                }
                addView(quickMenuTile(R.drawable.ic_nav_avatar, "인벤토리", ownedCount.toString()) {
                    renderTab(HubTab.AVATAR)
                }.apply {
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(5) }
                })
                addView(quickMenuTile(R.drawable.ic_group, "파티 & 친구", if (remoteActiveParty != null) "LIVE" else friendCount.toString()) {
                    renderTab(HubTab.CHAT)
                }.apply {
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = dp(5) }
                })
            }
            val row2 = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(quickMenuTile(R.drawable.ic_nav_explore, "리더보드", "TOP") {
                    val featured = allCatalogGames().firstOrNull()
                    if (featured != null) openExperienceDetail(featured)
                }.apply {
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(5) }
                })
                addView(quickMenuTile(R.drawable.ic_coin, "Play Pass", "STORE") {
                    showCoinStoreDialog()
                }.apply {
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = dp(5) }
                })
            }
            addView(row1)
            addView(row2)
        }
        body.addView(menuGrid)

        // 3. Settings & Account Card (Stitch divided list with ToggleSwitches)
        body.addView(sectionHeader("설정 및 계정"))
        val settingsCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)

            addView(settingsNavRow(R.drawable.ic_lock, "로그인 · 계정 전환 (${profile.authProvider.uppercase()})") {
                showAuthMethodDialog()
            })
            addView(settingsDivider())
            addView(settingsToggleRow(
                iconRes = R.drawable.ic_notifications,
                label = "친구 접속 및 초대 알림",
                checked = isPushAlertEnabled()
            ) { next ->
                setPushAlertEnabled(next)
                renderTab(HubTab.MORE)
                Toast.makeText(this@MainActivity, if (next) "친구 알림이 켜졌습니다." else "친구 알림이 꺼졌습니다.", Toast.LENGTH_SHORT).show()
            })
            addView(settingsDivider())
            addView(settingsToggleRow(
                iconRes = R.drawable.ic_group,
                label = "친구 게임 합류 허용",
                checked = isFriendJoinAllowed()
            ) { next ->
                setFriendJoinAllowed(next)
                renderTab(HubTab.MORE)
                Toast.makeText(this@MainActivity, if (next) "친구의 게임 합류를 허용합니다." else "친구 게임 합류를 비공개로 전환했습니다.", Toast.LENGTH_SHORT).show()
            })
            addView(settingsDivider())
            addView(settingsNavRow(R.drawable.ic_lock, "개인정보 및 계정 보안 (${profile.ageTier.name})") {
                showPrivacyAndSecurityDialog(cachedMb)
            })
            addView(settingsDivider())
            addView(settingsNavRow(R.drawable.ic_nav_more, "고객 지원 및 런타임 정보") {
                showRuntimeSupportDialog(cachedMb)
            })
        }
        body.addView(paddedBox(settingsCard, bottomDp = 12))

        // 4. Dev/Debug-Only Farm Cluster Selector (strictly hidden on release/live)
        if (farmSelectorAllowed) {
            val health = currentFarmHealth()
            val farmBtn = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = roundedBg(StitchColors.SURFACE_CONTAINER, health.status.colorHex, 12)
                setPadding(dp(14), dp(13), dp(14), dp(13))
                setOnClickListener { showFarmSelectorDialog() }
                addView(View(context).apply {
                    background = statusDotDrawable(health.status)
                    layoutParams = LinearLayout.LayoutParams(dp(10), dp(10)).apply { rightMargin = dp(10) }
                })
                addView(TextView(context).apply {
                    text = "Farm 서버군 선택 (${activeFarm.id})"
                    textSize = 14f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(pillChip(health.badgeLabel(), health.status.badgeBgHex, health.status.badgeTextHex, health.status.colorHex))
            }
            body.addView(paddedBox(farmBtn, bottomDp = 12))
        }

        // 5. Logout / Reset Guest Session Button (Stitch error text button)
        val logoutBtn = TextView(this).apply {
            text = "로그아웃"
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor(StitchColors.ERROR))
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
            setPadding(dp(14), dp(13), dp(14), dp(13))
            setOnClickListener {
                AlertDialog.Builder(this@MainActivity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                    .setTitle("로그아웃")
                    .setMessage("현재 기기의 세션 토큰을 초기화하고 새 게스트로 시작할까요?")
                    .setPositiveButton("로그아웃") { _, _ ->
                        authStore.clearRemoteTokensForFarmSwitch()
                        profile = authStore.loadOrCreateGuest()
                        remoteSocialProfile = null
                        remoteFriends = emptyList()
                        remoteActiveParty = null
                        Toast.makeText(this@MainActivity, "로그아웃되었습니다.", Toast.LENGTH_SHORT).show()
                        syncWithActiveFarm()
                    }
                    .setNegativeButton("취소", null)
                    .show()
            }
        }
        body.addView(paddedBox(logoutBtn, bottomDp = 12))
    }

    private fun showAuthMethodDialog() {
        val last = authStore.lastAuthProvider()
        fun label(base: String, provider: String) = if (last == provider) "$base · 최근 사용" else base
        val options = arrayOf(
            label("이메일 로그인", "email"),
            "이메일 회원가입",
            label("Google로 로그인", "google"),
            label("네이버로 로그인", "naver"),
            label("게스트로 계속하기", "guest")
        )
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("로그인 방식 선택")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> showEmailAuthDialog(isRegister = false)
                    1 -> showEmailAuthDialog(isRegister = true)
                    2 -> openSocialLogin("google")
                    3 -> openSocialLogin("naver")
                    4 -> switchToGuestAccount()
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun showEmailAuthDialog(isRegister: Boolean) {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(4))
        }
        val emailInput = EditText(this).apply {
            hint = "이메일 (name@example.com)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val nameInput = EditText(this).apply {
            hint = "닉네임 (선택)"
            inputType = InputType.TYPE_CLASS_TEXT
        }
        val passwordInput = EditText(this).apply {
            hint = if (isRegister) "비밀번호 (8자 이상, 영문+숫자)" else "비밀번호"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        box.addView(emailInput)
        if (isRegister) box.addView(nameInput)
        box.addView(passwordInput)

        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(if (isRegister) "이메일 회원가입" else "이메일 로그인")
            .setView(box)
            .setPositiveButton(if (isRegister) "가입하기" else "로그인") { _, _ ->
                val email = emailInput.text.toString().trim()
                val password = passwordInput.text.toString()
                val displayName = nameInput.text.toString().trim().ifEmpty { null }
                if (email.isEmpty() || password.isEmpty()) {
                    Toast.makeText(this, "이메일과 비밀번호를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                ioExecutor.execute {
                    val client = PlayHubApiClient(activeFarm.baseUrl)
                    val result = runCatching {
                        if (isRegister) client.registerEmail(email, password, displayName, profile.accessToken)
                        else client.loginEmail(email, password, profile.accessToken)
                    }
                    runOnUiThread {
                        result.onSuccess { tokens ->
                            authStore.saveRemoteTokens(tokens)
                            profile = authStore.loadOrCreateGuest()
                            Toast.makeText(this, if (isRegister) "이메일 회원가입 완료" else "이메일 로그인 완료", Toast.LENGTH_SHORT).show()
                            renderTab(HubTab.MORE)
                            syncWithActiveFarm()
                        }.onFailure { err ->
                            Toast.makeText(this, "인증 실패: ${err.message}", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun openSocialLogin(provider: String) {
        val label = if (provider == "naver") "네이버" else "Google"
        val startUrl = "${activeFarm.baseUrl.trimEnd('/')}/api/auth/$provider/start?returnTo=%2F%3Fview%3Daccount"
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("$label 로그인")
            .setMessage("브라우저에서 $label 계정으로 안전하게 로그인합니다.")
            .setPositiveButton("계속하기") { _, _ ->
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(startUrl))) }
                    .onFailure { Toast.makeText(this, "로그인 화면을 열 수 없습니다.", Toast.LENGTH_SHORT).show() }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun switchToGuestAccount() {
        ioExecutor.execute {
            val client = PlayHubApiClient(activeFarm.baseUrl)
            val res = runCatching { client.createGuestSession() }
            runOnUiThread {
                res.onSuccess { tokens ->
                    authStore.saveRemoteTokens(tokens)
                    profile = authStore.loadOrCreateGuest()
                    Toast.makeText(this, "게스트 계정으로 전환했습니다.", Toast.LENGTH_SHORT).show()
                    renderTab(HubTab.MORE)
                    syncWithActiveFarm()
                }.onFailure { err ->
                    Toast.makeText(this, "게스트 전환 실패: ${err.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun profileStatCell(value: String, label: String, valueColorHex: String, onClick: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener { onClick() }
            addView(TextView(context).apply {
                text = value
                textSize = 15.5f
                typeface = Typeface.MONOSPACE
                setTextColor(Color.parseColor(valueColorHex))
                gravity = Gravity.CENTER
            })
            addView(TextView(context).apply {
                text = label
                textSize = 11f
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                gravity = Gravity.CENTER
                setPadding(0, dp(2), 0, 0)
            })
        }

    private fun quickMenuTile(iconRes: Int, label: String, countText: String, onClick: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
            setPadding(dp(12), dp(13), dp(12), dp(13))
            setOnClickListener { onClick() }
            addView(iconView(iconRes, 18, StitchColors.PLAY_GREEN).apply {
                (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(8)
            })
            addView(TextView(context).apply {
                text = label
                textSize = 13.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            addView(TextView(context).apply {
                text = countText
                textSize = 11.5f
                typeface = Typeface.MONOSPACE
                setTextColor(Color.parseColor(if (countText == "LIVE") StitchColors.PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT))
            })
        }

    private fun settingsDivider(): View = View(this).apply {
        setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
    }

    private fun settingsToggleRow(iconRes: Int, label: String, checked: Boolean, onToggle: (Boolean) -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(13), dp(14), dp(13))
            setOnClickListener { onToggle(!checked) }
            addView(iconView(iconRes, 18, StitchColors.ON_SURFACE_VARIANT).apply {
                (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(12)
            })
            addView(TextView(context).apply {
                text = label
                textSize = 14f
                setTextColor(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            // Stitch custom pill toggle switch
            val pill = FrameLayout(context).apply {
                background = roundedBg(if (checked) StitchColors.PLAY_GREEN else StitchColors.SURFACE_HIGHEST, null, 999)
                setPadding(dp(2), dp(2), dp(2), dp(2))
                layoutParams = LinearLayout.LayoutParams(dp(44), dp(24))
                addView(View(context).apply {
                    background = ovalBg("#FFFFFF")
                }, FrameLayout.LayoutParams(dp(20), dp(20), if (checked) Gravity.END or Gravity.CENTER_VERTICAL else Gravity.START or Gravity.CENTER_VERTICAL))
            }
            addView(pill)
        }

    private fun settingsNavRow(iconRes: Int, label: String, onClick: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(13), dp(14), dp(13))
            setOnClickListener { onClick() }
            addView(iconView(iconRes, 18, StitchColors.ON_SURFACE_VARIANT).apply {
                (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(12)
            })
            addView(TextView(context).apply {
                text = label
                textSize = 14f
                setTextColor(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            addView(TextView(context).apply {
                text = "›"
                textSize = 18f
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            })
        }

    private fun showPrivacyAndSecurityDialog(cachedMb: String) {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("개인정보 및 계정 보안")
            .setMessage(
                "계정 유형: ${if (profile.isGuest) "Guest (즉시 플레이)" else "Google 연동 계정"}\n" +
                    "연령 보호 티어: ${profile.ageTier.name} (${profile.regionCode})\n" +
                    "법정대리인 동의: ${if (profile.parentalConsentVerified) "확인됨" else "해당 없음/미확인"}\n" +
                    "온디맨드 .pck 캐시: $cachedMb MiB (내장 스타터 0종)"
            )
            .setPositiveButton("확인", null)
            .setNeutralButton(".pck 캐시 정리") { _, _ ->
                File(filesDir, "games").deleteRecursively()
                renderTab(HubTab.MORE)
                Toast.makeText(this, "로컬 .pck 캐시를 정리했습니다.", Toast.LENGTH_SHORT).show()
            }
            .show()
    }

    private fun showRuntimeSupportDialog(cachedMb: String) {
        val farmSelectorAllowed = FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)
        val farmStatusLine = if (farmSelectorAllowed) "\nFarm 상태: ${currentFarmHealth().summaryLine()}" else ""
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("PlayHub 런타임 · 고객 지원")
            .setMessage(
                "Package ID: ${applicationContext.packageName}\n" +
                    "Build Stage: ${BuildConfig.BUILD_STAGE} · Branch: ${BuildConfig.PLAYHUB_BRANCH}\n" +
                    "Engine: Godot ${BuildConfig.GODOT_ENGINE_VERSION} (Runtime Only · Forge 제외)\n" +
                    "Social Handle: ${remoteSocialProfile?.handle ?: profile.handle}\n" +
                    "Server URL: ${activeFarm.baseUrl}$farmStatusLine\n" +
                    "온디맨드 .pck 캐시: $cachedMb MiB (스타터 0종)"
            )
            .setPositiveButton("확인", null)
            .show()
    }

    private fun paddedBox(child: View, topDp: Int = 0, bottomDp: Int = 0): FrameLayout = FrameLayout(this).apply {
        setPadding(dp(16), dp(topDp), dp(16), dp(bottomDp))
        addView(child, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    private fun primaryActionButton(label: String, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        textSize = 14f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
        setPadding(dp(14), dp(13), dp(14), dp(13))
        background = roundedBg(StitchColors.PLAY_GREEN, null, 10)
        setOnClickListener { onClick() }
    }

    private fun secondaryActionButton(label: String, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        textSize = 14f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        setPadding(dp(14), dp(13), dp(14), dp(13))
        background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 10)
        setOnClickListener { onClick() }
    }

    // ---- Stitch Bottom-Sheet Game Launch Modal (with Live Leaderboard!) ----

    private fun openExperienceDetail(game: CatalogGame) {
        val compat = VersionCompatibilityChecker.evaluate(
            runtime = game.runtime,
            requiredEngineVersion = game.requiredEngineVersion,
            minAppVersionCode = game.minAppVersionCode,
            installedEngineVersion = BuildConfig.GODOT_ENGINE_VERSION,
            installedAppVersionCode = BuildConfig.VERSION_CODE
        )
        val cached = game.runtime == "godot-pck" && PckPackageManager.cachedPckFile(filesDir, game.id, game.version).isFile

        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)

        val leaderboardHost = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_LOW, StitchColors.OUTLINE_VARIANT, 10)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(12)
            }
            addView(TextView(context).apply {
                text = "리더보드 불러오는 중..."
                textSize = 11.5f
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            })
        }

        val sheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 16)
            setPadding(dp(16), dp(16), dp(16), dp(16))

            val thumbWrap = buildGameThumbnail(game, 164, compat, cached)
            thumbWrap.addView(FrameLayout(context).apply {
                background = ovalBg("#CC111315")
                addView(iconView(R.drawable.ic_close, 18, StitchColors.ON_SURFACE), FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER))
                setOnClickListener { dialog.dismiss() }
            }, FrameLayout.LayoutParams(dp(34), dp(34), Gravity.TOP or Gravity.END).apply {
                topMargin = dp(8)
                rightMargin = dp(8)
            })
            addView(thumbWrap)

            addView(TextView(context).apply {
                text = game.title
                textSize = 18f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                setPadding(0, dp(12), 0, dp(4))
            })
            addView(TextView(context).apply {
                text = "${game.subtitle} · ${game.categoryLabel}"
                textSize = 13f
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            })

            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(8), 0, dp(10))
                addView(iconView(R.drawable.ic_thumb_up, 15, StitchColors.PLAY_GREEN).apply {
                    (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(4)
                })
                addView(TextView(context).apply {
                    text = game.likeRate
                    textSize = 12f
                    typeface = Typeface.MONOSPACE
                    setTextColor(Color.WHITE)
                    setPadding(0, 0, dp(12), 0)
                })
                addView(iconView(R.drawable.ic_group, 15, StitchColors.ON_SURFACE_VARIANT).apply {
                    (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(4)
                })
                addView(TextView(context).apply {
                    text = "${game.playerCountLabel} · ${game.sizeLabel} · ${game.ageRating.code}"
                    textSize = 12f
                    typeface = Typeface.MONOSPACE
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                })
            })

            addView(leaderboardHost)

            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                background = roundedBg(StitchColors.PLAY_GREEN, null, 10)
                setPadding(dp(16), dp(13), dp(16), dp(13))
                addView(iconView(R.drawable.ic_play_arrow, 20, StitchColors.ON_PLAY_GREEN).apply {
                    (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(6)
                })
                addView(TextView(context).apply {
                    text = if (cached) "지금 바로 플레이" else "지금 플레이"
                    textSize = 15f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                })
                setOnClickListener {
                    dialog.dismiss()
                    launchGame(game)
                }
            })
        }

        val outerWrap = FrameLayout(this).apply {
            setPadding(dp(16), dp(16), dp(16), dp(24))
            addView(sheet, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        dialog.setContentView(outerWrap)
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setGravity(Gravity.BOTTOM)
        }
        dialog.show()

        // Async live leaderboard fetch
        val baseUrl = activeFarm.baseUrl
        val token = profile.accessToken
        ioExecutor.execute {
            val entries = runCatching {
                PlayHubApiClient(baseUrl).fetchLeaderboard(token, game.id, "high_score", "global")
            }.getOrDefault(emptyList())
            runOnUiThread {
                if (!dialog.isShowing || isFinishing || isDestroyed) return@runOnUiThread
                renderLeaderboardInto(leaderboardHost, entries.take(3))
            }
        }
    }

    private fun renderLeaderboardInto(host: LinearLayout, entries: List<LeaderboardEntryDto>) {
        host.removeAllViews()
        host.addView(TextView(this).apply {
            text = "TOP 리더보드 (Global)"
            textSize = 11.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
            setPadding(0, 0, 0, dp(4))
        })
        if (entries.isEmpty()) {
            host.addView(TextView(this).apply {
                text = "아직 등록된 점수가 없습니다. 첫 기록을 세워 보세요!"
                textSize = 11.5f
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            })
            return
        }
        for (e in entries) {
            host.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(2), 0, dp(2))
                addView(TextView(context).apply {
                    text = "#${e.rank}"
                    textSize = 12f
                    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                    setTextColor(Color.parseColor(if (e.rank == 1) StitchColors.COIN_GOLD else StitchColors.ON_SURFACE_VARIANT))
                    layoutParams = LinearLayout.LayoutParams(dp(28), ViewGroup.LayoutParams.WRAP_CONTENT)
                })
                addView(TextView(context).apply {
                    text = "${e.displayName} (${e.handle})"
                    textSize = 12f
                    setTextColor(Color.WHITE)
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(TextView(context).apply {
                    text = String.format("%,d", e.score)
                    textSize = 12f
                    typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                    setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                })
            })
        }
    }

    private fun showIncompatibilityDialog(game: CatalogGame, detail: String) {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("⚠️ 버전 호환성 안내 · ${game.title}")
            .setMessage(detail)
            .setPositiveButton("확인", null)
            .show()
    }

    private fun launchPartyTogether(party: SocialPartyDto, game: CatalogGame) {
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.launchParty(token, party.id, game.id, game.title)
            }.onSuccess { updated ->
                runOnUiThread {
                    remoteActiveParty = updated
                    val launch = updated.activeLaunch
                    Toast.makeText(
                        this,
                        "크로스플레이 함께 입장 시작! (${launch?.matchRoomId ?: party.roomCode})",
                        Toast.LENGTH_SHORT
                    ).show()
                    launchGame(game, roomCode = party.roomCode, matchRoomId = launch?.matchRoomId)
                }
            }.onFailure { err ->
                runOnUiThread {
                    Toast.makeText(this, err.message ?: "함께 입장 시작 실패", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun ackAndJoinLaunch(party: SocialPartyDto, launch: SocialPartyLaunchDto) {
        val game = allCatalogGames().find { it.id == launch.gameId } ?: allCatalogGames().firstOrNull() ?: return
        val baseUrl = activeFarm.baseUrl
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(baseUrl)
                val token = ensureAuthToken(client)
                client.ackPartyLaunch(
                    accessToken = token,
                    partyId = party.id,
                    launchId = launch.launchId,
                    state = "entered",
                    gameTitle = game.title
                )
            }.onSuccess { updated ->
                runOnUiThread { remoteActiveParty = updated }
            }
            runOnUiThread {
                Toast.makeText(
                    this,
                    "크로스플레이 매치룸 합류: ${launch.matchRoomId}",
                    Toast.LENGTH_SHORT
                ).show()
                launchGame(game, roomCode = launch.roomCode, matchRoomId = launch.matchRoomId)
            }
        }
    }

    private fun launchGame(game: CatalogGame, roomCode: String? = null, matchRoomId: String? = null) {
        val effectiveRoom = roomCode ?: remoteActiveParty?.roomCode
        val effectiveMatch = matchRoomId ?: remoteActiveParty?.activeLaunch?.matchRoomId
        sendPresenceHeartbeat("in_game", game.id, game.title, effectiveRoom)
        if (game.runtime == "web") {
            startActivity(WebGameActivity.createIntent(this, game.id, game.title, game.pckPathOrUrl, effectiveRoom, effectiveMatch))
            return
        }

        val cached = PckPackageManager.cachedPckFile(filesDir, game.id, game.version)
        if (cached.isFile) {
            startGodotIsolated(game, cached, effectiveRoom, effectiveMatch)
            return
        }

        val progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
        }
        val progressLabel = TextView(this).apply {
            text = "${game.title} (.pck) 다운로드 준비 중... 0%"
            setTextColor(Color.WHITE)
            setPadding(dp(20), dp(16), dp(20), dp(8))
        }
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE_CONTAINER))
            setPadding(dp(20), dp(12), dp(20), dp(20))
            addView(progressLabel)
            addView(progressBar)
        }
        val dlDialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("온디맨드 게임 다운로드")
            .setView(box)
            .setCancelable(false)
            .create()
        dlDialog.show()

        ioExecutor.execute {
            runCatching {
                PckPackageManager.downloadAndCache(
                    filesDir = filesDir,
                    gameId = game.id,
                    version = game.version,
                    downloadUrl = game.pckPathOrUrl,
                    onProgress = { pct ->
                        runOnUiThread {
                            progressBar.progress = pct
                            progressLabel.text = "${game.title} (.pck) 다운로드 중... $pct%"
                        }
                    }
                )
            }.onSuccess { pckFile ->
                runOnUiThread {
                    dlDialog.dismiss()
                    renderTab(activeTab)
                    startGodotIsolated(game, pckFile)
                }
            }.onFailure { err ->
                runOnUiThread {
                    dlDialog.dismiss()
                    Toast.makeText(
                        this,
                        "다운로드 실패 (${err.message}). Farm 서버(${activeFarm.baseUrl}) 연결을 확인하세요.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    private fun startGodotIsolated(
        game: CatalogGame,
        pckFile: File,
        roomCode: String? = remoteActiveParty?.roomCode,
        matchRoomId: String? = remoteActiveParty?.activeLaunch?.matchRoomId
    ) {
        val userDataDir = File(File(File(filesDir, "game_userdata"), profile.principalId), game.id)
        val intent = GodotPlayerActivity.createIntent(
            context = this,
            gameId = game.id,
            gameTitle = game.title,
            pckPath = pckFile.absolutePath,
            userDataDir = userDataDir.absolutePath,
            displayName = remoteSocialProfile?.displayName ?: profile.displayName,
            handle = remoteSocialProfile?.handle ?: profile.handle,
            isGuest = profile.isGuest,
            ageTier = profile.ageTier.name,
            roomCode = roomCode,
            matchRoomId = matchRoomId,
            wsUrl = game.multiplayerWsUrl
        )
        startActivity(intent)
    }

    // ---- Farm Server Cluster Status Dialog (Red / Orange / Yellow / Green) ----

    private fun onFarmChanged(next: FarmCluster) {
        activeFarm = next
        remoteCatalog = null
        remoteSocialProfile = null
        remoteFriends = emptyList()
        remoteIncomingRequests = emptyList()
        remoteOutgoingRequests = emptyList()
        remoteActiveParty = null
        activeChatTarget = null
        authStore.clearRemoteTokensForFarmSwitch()
        profile = authStore.loadOrCreateGuest()
        renderTab(activeTab)
        syncWithActiveFarm()
    }

    private fun legendItem(status: FarmHealthStatus, caption: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(0, 0, dp(10), 0)
        addView(View(context).apply {
            background = statusDotDrawable(status)
            layoutParams = LinearLayout.LayoutParams(dp(8), dp(8)).apply { rightMargin = dp(4) }
        })
        addView(TextView(context).apply {
            text = caption
            textSize = 11f
            setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
        })
    }

    private fun showFarmSelectorDialog() {
        if (!FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) return

        val clusters = FarmServerRegistry.selectableClusters(
            buildStage = BuildConfig.BUILD_STAGE,
            defaultBaseUrl = BuildConfig.HUB_BASE_URL,
            activeFarm = activeFarm
        )
        val activeUrlKey = activeFarm.baseUrl.trim().trimEnd('/').lowercase()

        var dialogAlive = true
        var dialogRef: AlertDialog? = null

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE))
            setPadding(dp(14), dp(12), dp(14), dp(12))
        }

        val legendRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 10)
            setPadding(dp(10), dp(7), dp(10), dp(7))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(10) }
            addView(legendItem(FarmHealthStatus.GREEN, "<200ms"))
            addView(legendItem(FarmHealthStatus.YELLOW, "<600ms"))
            addView(legendItem(FarmHealthStatus.ORANGE, "≥600ms"))
            addView(legendItem(FarmHealthStatus.RED, "접속불가"))
        }
        container.addView(legendRow)

        val rowsHost = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        data class RowUi(val dot: View, val badge: TextView, val card: LinearLayout, val isActive: Boolean)
        val rowBindings = mutableMapOf<String, RowUi>()

        fun applyRowHealth(binding: RowUi, res: FarmHealthResult) {
            binding.dot.background = statusDotDrawable(res.status)
            binding.badge.text = res.badgeLabel()
            binding.badge.setTextColor(Color.parseColor(res.status.badgeTextHex))
            binding.badge.background = roundedBg(res.status.badgeBgHex, res.status.colorHex, 10)
            val borderHex = if (binding.isActive) res.status.colorHex else StitchColors.OUTLINE_VARIANT
            binding.card.background = roundedBg(
                fillHex = if (binding.isActive) StitchColors.SURFACE_HIGH else StitchColors.SURFACE_CONTAINER,
                strokeHex = borderHex,
                radiusDp = 12
            )
        }

        for (cluster in clusters) {
            val urlKey = cluster.baseUrl.trim().trimEnd('/').lowercase()
            val isActive = urlKey == activeUrlKey
            val dot = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(12), dp(12)).apply { rightMargin = dp(10) }
            }
            val badge = TextView(this).apply {
                textSize = 11f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dp(8), dp(4), dp(8), dp(4))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { leftMargin = dp(8) }
            }
            val textCol = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                addView(TextView(context).apply {
                    text = if (isActive) "${cluster.label} · 현재" else cluster.label
                    textSize = 13.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                })
                addView(TextView(context).apply {
                    text = cluster.baseUrl
                    textSize = 11f
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                    setPadding(0, dp(2), 0, 0)
                })
            }
            val rowCard = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = dp(8) }
                addView(dot)
                addView(textCol)
                addView(badge)
                setOnClickListener {
                    val customArg = if (cluster.id == FarmServerRegistry.CUSTOM_FARM_ID) cluster.baseUrl else null
                    FarmServerRegistry.saveSelection(
                        this@MainActivity,
                        BuildConfig.BUILD_STAGE,
                        BuildConfig.ALLOW_FARM_SELECTOR,
                        cluster.id,
                        customArg
                    )
                    dialogRef?.dismiss()
                    onFarmChanged(cluster)
                    Toast.makeText(this@MainActivity, "Farm 전환: ${cluster.label}", Toast.LENGTH_SHORT).show()
                }
            }
            val binding = RowUi(dot, badge, rowCard, isActive)
            rowBindings[urlKey] = binding
            applyRowHealth(binding, farmHealthCache[urlKey] ?: FarmHealthResult(FarmHealthStatus.CHECKING))
            rowsHost.addView(rowCard)
        }

        container.addView(ScrollView(this).apply {
            addView(rowsHost)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        })

        fun probeAllClusters() {
            for (cluster in clusters) {
                val urlKey = cluster.baseUrl.trim().trimEnd('/').lowercase()
                val binding = rowBindings[urlKey] ?: continue
                applyRowHealth(binding, FarmHealthResult(FarmHealthStatus.CHECKING))
                probeExecutor.execute {
                    val res = FarmHealthChecker.probe(cluster.baseUrl)
                    farmHealthCache[urlKey] = res
                    runOnUiThread {
                        if (!dialogAlive || isFinishing || isDestroyed) return@runOnUiThread
                        applyRowHealth(binding, res)
                        if (urlKey == activeFarm.baseUrl.trim().trimEnd('/').lowercase()) {
                            updateFarmPillVisual()
                        }
                    }
                }
            }
        }

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(6), 0, 0)
            addView(TextView(context).apply {
                text = "상태 새로고침"
                textSize = 12.5f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                setPadding(dp(10), dp(10), dp(10), dp(10))
                background = roundedBg(StitchColors.PLAY_GREEN, null, 8)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    rightMargin = dp(6)
                }
                setOnClickListener { probeAllClusters() }
            })
            addView(TextView(context).apply {
                text = "URL 직접 입력"
                textSize = 12.5f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setTextColor(Color.WHITE)
                setPadding(dp(10), dp(10), dp(10), dp(10))
                background = roundedBg(StitchColors.SURFACE_HIGH, StitchColors.OUTLINE_VARIANT, 8)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    leftMargin = dp(6)
                }
                setOnClickListener {
                    dialogRef?.dismiss()
                    showCustomFarmInputDialog()
                }
            })
        }
        container.addView(btnRow)

        val dlg = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Farm 서버군 상태 (${BuildConfig.BUILD_STAGE})")
            .setView(container)
            .setNegativeButton("닫기", null)
            .create()
        dlg.setOnDismissListener { dialogAlive = false }
        dialogRef = dlg
        dlg.show()

        probeAllClusters()
    }

    private fun showCustomFarmInputDialog() {
        val input = EditText(this).apply {
            hint = "https://your-dev-tunnel.trycloudflare.com (Live 차단)"
            setText(activeFarm.baseUrl)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Custom Dev Farm URL 입력")
            .setView(input)
            .setPositiveButton("적용") { _, _ ->
                runCatching {
                    val normalized = FarmServerRegistry.normalizeCustomUrl(input.text.toString())
                    FarmServerRegistry.saveSelection(
                        this,
                        BuildConfig.BUILD_STAGE,
                        BuildConfig.ALLOW_FARM_SELECTOR,
                        FarmServerRegistry.CUSTOM_FARM_ID,
                        normalized
                    )
                    val loaded = FarmServerRegistry.loadActive(
                        this,
                        BuildConfig.BUILD_STAGE,
                        BuildConfig.ALLOW_FARM_SELECTOR,
                        BuildConfig.HUB_BASE_URL
                    )
                    onFarmChanged(loaded)
                    Toast.makeText(this, "Custom Farm 적용: ${loaded.baseUrl}", Toast.LENGTH_SHORT).show()
                }.onFailure { err ->
                    Toast.makeText(this, "잘못된 URL: ${err.message}", Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun showCoinStoreDialog() {
        val caps = AgeGatePolicy.evaluateCapabilities(profile.ageTier, profile.isGuest, profile.parentalConsentVerified)
        val msg = when {
            caps.requiresParentalConsent -> "만 14세/13세 미만 아동 보호 모드에서는 법정대리인 동의 및 Google Play Family Link 승인이 필요합니다."
            caps.requiresGoogleLoginForIap -> "Guest 계정의 결제 유실 방지를 위해 인앱구매 전 Google 계정 연결이 필요합니다.\n(기존 게스트 세이브는 자동 병합됩니다.)"
            else -> "Google Play Billing v7 상품 티어 (playhub.coin.tier1~5 · Play Pass) — M2에서 실결제 및 서버 SSV 연결."
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Play Coin & Play Pass 스토어")
            .setMessage(msg)
            .setPositiveButton("확인", null)
            .show()
    }

    private fun openGodotAvatarStudio() {
        val intent = GodotAvatarStudioActivity.createIntent(
            context = this,
            equippedIds = equippedAvatarIds(),
            accentHex = savedAvatarColor(),
            displayName = remoteSocialProfile?.displayName ?: profile.displayName,
            handle = remoteSocialProfile?.handle ?: profile.handle
        )
        @Suppress("DEPRECATION")
        startActivityForResult(intent, 4702)
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 4702 && resultCode == Activity.RESULT_OK && data != null) {
            val csv = data.getStringExtra(GodotAvatarStudioActivity.RESULT_EQUIPPED_CSV).orEmpty()
            val nextAccent = data.getStringExtra(GodotAvatarStudioActivity.RESULT_ACCENT_HEX).orEmpty()
            val saved = data.getBooleanExtra(GodotAvatarStudioActivity.RESULT_SAVED, false)
            if (csv.isNotBlank()) {
                val parsed = csv.split(",").map { it.trim() }.filter { it.isNotEmpty() }.toSet()
                if (parsed.isNotEmpty()) saveEquippedAvatarIds(parsed)
            }
            if (nextAccent.startsWith("#") && nextAccent.length == 7) {
                saveAvatarColor(nextAccent)
            }
            if (saved) {
                avatarSavedState = true
                syncProfileUpdate(avatarColor = savedAvatarColor(), toastMsg = "Godot 3D 아바타를 서버에 저장했습니다.")
            }
            if (activeTab == HubTab.AVATAR || activeTab == HubTab.MORE) {
                renderTab(activeTab)
            }
        }
    }

    private fun formatChatTimestamp(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return ""
        val millis = trimmed.toLongOrNull() ?: run {
            val patterns = arrayOf("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'")
            var parsed: Long? = null
            for (pattern in patterns) {
                try {
                    val parser = java.text.SimpleDateFormat(pattern, java.util.Locale.US).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }
                    parsed = parser.parse(trimmed)?.time
                    if (parsed != null) break
                } catch (_: Exception) {
                }
            }
            parsed
        }
        if (millis != null) {
            return java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(millis))
        }
        val tIndex = trimmed.indexOf('T')
        return if (tIndex >= 0 && trimmed.length >= tIndex + 6) {
            trimmed.substring(tIndex + 1, tIndex + 6)
        } else {
            trimmed.take(5)
        }
    }
}
