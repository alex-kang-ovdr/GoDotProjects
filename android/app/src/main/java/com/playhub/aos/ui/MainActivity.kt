package com.playhub.aos.ui

import android.app.Activity
import android.app.AlertDialog
import android.app.Dialog
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.Editable
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
import com.playhub.aos.compliance.GameAgeRating
import com.playhub.aos.config.FarmCluster
import com.playhub.aos.config.FarmHealthChecker
import com.playhub.aos.config.FarmHealthResult
import com.playhub.aos.config.FarmHealthStatus
import com.playhub.aos.config.FarmServerRegistry
import com.playhub.aos.network.PlayHubApiClient
import com.playhub.aos.runtime.GodotPlayerActivity
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
    val tagCode: String = "3D"
)

private data class FriendPresence(
    val id: String,
    val name: String,
    val initial: String,
    val avatarColorHex: String,
    val online: Boolean,
    val activity: String,
    val playingGameId: String? = null,
    val lastMessage: String,
    val time: String,
    var unread: Int,
    val messages: MutableList<ChatMessage>
)

private data class ChatMessage(
    val senderMe: Boolean,
    val text: String,
    val time: String
)

/**
 * Play Hub Android Main Shell — High-Contrast Dark Modern UI (Stitch Design System + Official PlayHub Logo).
 * - Preserves all Play Hub runtime capabilities: Zero Forge, Minimal Footprint, On-Demand Godot 4.7.2 .pck,
 *   Guest + Neutral Age Gate compliance, Pre-Entry Version Compatibility Gate, and 4-level Farm Server Health.
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
    private var activeChatFriendId: String? = null
    private var remoteCatalog: List<CatalogGame>? = null
    private var syncStatusText: String = "서버 연결 준비 중..."

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

    private val friendsData: MutableList<FriendPresence> by lazy {
        mutableListOf(
            FriendPresence(
                id = "f1",
                name = "민준",
                initial = "민",
                avatarColorHex = "#1E3A5F",
                online = true,
                activity = "Survivor Arena G2 중",
                playingGameId = "survivor-arena-g2",
                lastMessage = "지금 웨이브 5 보스 앞이야! 같이 들어와",
                time = "방금",
                unread = 2,
                messages = mutableListOf(
                    ChatMessage(false, "오늘 서바이벌 아레나 같이 할래?", "오후 5:40"),
                    ChatMessage(true, "좋아! 나 바로 접속할게", "오후 5:42"),
                    ChatMessage(false, "지금 웨이브 5 보스 앞이야! 같이 들어와", "오후 5:46")
                )
            ),
            FriendPresence(
                id = "f2",
                name = "서연",
                initial = "서",
                avatarColorHex = "#3B2654",
                online = true,
                activity = "Match-3 Garden 중",
                playingGameId = "match3-garden",
                lastMessage = "30콤보 달성했어!!",
                time = "3분 전",
                unread = 1,
                messages = mutableListOf(
                    ChatMessage(false, "30콤보 달성했어!!", "오후 5:43")
                )
            ),
            FriendPresence(
                id = "f3",
                name = "지호",
                initial = "지",
                avatarColorHex = "#1B4332",
                online = true,
                activity = "접속 중",
                playingGameId = null,
                lastMessage = "아바타 컬러 새로 바꿨어 어때?",
                time = "24분 전",
                unread = 0,
                messages = mutableListOf(
                    ChatMessage(false, "아바타 컬러 새로 바꿨어 어때?", "오후 5:20")
                )
            ),
            FriendPresence(
                id = "f4",
                name = "하은",
                initial = "하",
                avatarColorHex = "#4A2C2A",
                online = true,
                activity = "Survivor Arena G2 중",
                playingGameId = "survivor-arena-g2",
                lastMessage = "파티 열었어 바로 합류해!",
                time = "1시간 전",
                unread = 0,
                messages = mutableListOf(
                    ChatMessage(false, "파티 열었어 바로 합류해!", "오후 4:40")
                )
            ),
            FriendPresence(
                id = "f5",
                name = "도윤",
                initial = "도",
                avatarColorHex = "#2E3338",
                online = false,
                activity = "오프라인",
                playingGameId = null,
                lastMessage = "내일 저녁에 파티하자",
                time = "어제",
                unread = 0,
                messages = mutableListOf(
                    ChatMessage(false, "내일 저녁에 파티하자", "어제")
                )
            )
        )
    }

    private val avatarAccentOptions = listOf(
        Pair("#00B06F", "플레이 그린"),
        Pair("#142C25", "에버그린"),
        Pair("#2563EB", "네온 블루"),
        Pair("#7C3AED", "퍼플 펄스"),
        Pair("#D97706", "골드 스파크")
    )

    private fun savedAvatarColor(): String =
        getSharedPreferences("playhub_avatar_v1", MODE_PRIVATE).getString("avatar_color", "#00B06F") ?: "#00B06F"

    private fun saveAvatarColor(hex: String) {
        getSharedPreferences("playhub_avatar_v1", MODE_PRIVATE).edit().putString("avatar_color", hex).apply()
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
        // Include synthetic 4.8 incompatibility fixture only on non-production builds (debug/dev/test)
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

    override fun onDestroy() {
        super.onDestroy()
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

    private fun syncWithActiveFarm() {
        val farm = activeFarm
        syncStatusText = "서버 연결 중 (${farm.id})..."
        if (FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) {
            probeActiveFarmHealth()
        }
        ioExecutor.execute {
            val client = PlayHubApiClient(farm.baseUrl)
            runCatching {
                var token = profile.accessToken
                if (token.isNullOrBlank()) {
                    val issued = client.createGuestSession()
                    authStore.saveRemoteTokens(issued)
                    profile = authStore.loadOrCreateGuest()
                    token = issued.accessToken
                }
                client.fetchCatalog(token, BuildConfig.GODOT_ENGINE_VERSION, BuildConfig.VERSION_CODE).map { item ->
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
                        tagCode = if (item.runtime == "godot-pck") (item.requiredEngineVersion ?: "3D") else "WEB"
                    )
                }
            }.onSuccess { list ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    if (activeFarm.baseUrl != farm.baseUrl) return@runOnUiThread
                    remoteCatalog = if (list.isNotEmpty()) list else null
                    syncStatusText = "온라인 동기화 완료 (${list.size}종 · ${farm.id})"
                    renderTab(activeTab)
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

    private fun syncAgeGateToServer(birthYear: Int, birthMonth: Int, regionCode: String) {
        val farm = activeFarm
        ioExecutor.execute {
            runCatching {
                val client = PlayHubApiClient(farm.baseUrl)
                val token = profile.accessToken ?: client.createGuestSession().also {
                    authStore.saveRemoteTokens(it)
                    profile = authStore.loadOrCreateGuest()
                }.accessToken
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

    private fun statusDotDrawable(status: FarmHealthStatus): GradientDrawable =
        ovalBg(status.colorHex)

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

    // ---- Root Shell (Stitch Header + Content + 5-Tab Bottom Navigation) ----

    private fun buildRootLayout(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE))
        }

        // 1. Stitch Top Header with Official PlayHub Logo
        topBarView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor(StitchColors.SURFACE))
            setPadding(dp(16), dp(12), dp(16), dp(10))
        }

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        // Left: Official PlayHub Emblem + PLAYHUB Wordmark
        val brandCluster = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener {
                activeChatFriendId = null
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

        // Right Actions: [Optional Farm Status Pill on debug/dev/test] + Search + Bell + Coin Pill
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

        // Circular Search Button
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

        // Circular Notifications Button with Play-Green Dot
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
                Toast.makeText(this@MainActivity, "알림: 민준님이 Survivor Arena G2에 초대했습니다.", Toast.LENGTH_SHORT).show()
            }
        }
        headerRow.addView(bellBtn)

        // Coin Balance Pill (Stitch surface-container-high + coin-gold + tabular mono)
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

        // Expandable Inline Search Bar (Stitch Home Header pattern)
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

        // Hairline 1dp outline-variant divider
        root.addView(View(this).apply {
            setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
        })

        // 2. Main Content Host
        contentContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        root.addView(contentContainer)

        // Hairline bottom nav divider
        root.addView(View(this).apply {
            setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
        })

        // 3. Stitch 5-Tab Bottom Navigation Bar (#111315 lowest surface)
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
                    if (tab != HubTab.CHAT) activeChatFriendId = null
                    if (tab != HubTab.HOME && searchOpen) {
                        searchOpen = false
                        headerSearchRow.visibility = View.GONE
                        headerSearchBtnIcon.setImageResource(R.drawable.ic_search)
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

        contentContainer.removeAllViews()

        // Chat room renders full-height with sticky composer at bottom
        if (tab == HubTab.CHAT && activeChatFriendId != null) {
            val friend = friendsData.find { it.id == activeChatFriendId }
            if (friend != null) {
                contentContainer.addView(buildChatRoomView(friend))
                return
            }
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
            HubTab.CHAT -> buildChatListTab(body)
            HubTab.MORE -> buildMoreTab(body)
        }
        scroll.addView(body)
        contentContainer.addView(scroll)
    }

    // ---- 1. HOME TAB (Stitch Home: Friends Strip + Horizontal Game Carousels) ----

    private fun buildHomeTab(body: LinearLayout) {
        val caps = AgeGatePolicy.evaluateCapabilities(profile.ageTier, profile.isGuest, profile.parentalConsentVerified)

        // Friends Section
        val onlineCount = friendsData.count { it.online }
        body.addView(
            sectionHeader(
                title = "친구",
                monoAccent = if (caps.requiresParentalConsent) "보호 모드" else "${onlineCount}명 접속 중",
                actionLabel = "전체 보기"
            ) {
                renderTab(HubTab.CHAT)
            }
        )
        body.addView(buildFriendsStrip(caps.requiresParentalConsent))

        val games = filteredCatalog(applyCategory = false)

        // Section 1: 추천 게임 (showPlayButton = true)
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

        // Section 2: 친구들이 플레이 중 (showPlayButton = false + friend pill overlay)
        if (!caps.requiresParentalConsent && games.isNotEmpty()) {
            body.addView(
                sectionHeader(title = "친구들이 플레이 중", actionLabel = "더보기") {
                    renderTab(HubTab.EXPLORE)
                }
            )
            body.addView(buildGameCarousel(games, showPlayButton = false, showFriendTag = true))
        }

        // Section 3: 인기 급상승
        if (games.isNotEmpty()) {
            body.addView(
                sectionHeader(title = "인기 급상승", actionLabel = "더보기") {
                    renderTab(HubTab.EXPLORE)
                }
            )
            body.addView(buildGameCarousel(games.reversed(), showPlayButton = false, showFriendTag = false))
        }

        // Compact Runtime & Account Status Card
        val statusCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(TextView(context).apply {
                    text = "${profile.displayName}  ${profile.handle}"
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
                addView(pillChip(if (profile.isGuest) "GUEST" else "GOOGLE", StitchColors.SURFACE_HIGH, StitchColors.ON_SURFACE).apply {
                    (layoutParams as? LinearLayout.LayoutParams)?.rightMargin = dp(6)
                })
                addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(dp(6), dp(1)) })
                addView(pillChip("${profile.ageTier.name} (${profile.regionCode})", StitchColors.SURFACE_HIGH, StitchColors.ON_SURFACE_VARIANT))
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

    private fun buildFriendsStrip(childProtected: Boolean): View {
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
                    text = "아동 보호 모드: 법정대리인 동의 후 친구 기능이 활성화됩니다."
                    textSize = 12f
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                })
            })
            scroll.addView(row)
            return scroll
        }

        for (friend in friendsData) {
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(dp(68), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    rightMargin = dp(10)
                }
                setOnClickListener {
                    val game = friend.playingGameId?.let { gid -> allCatalogGames().find { it.id == gid } }
                    if (game != null) {
                        openExperienceDetail(game)
                    } else {
                        friend.unread = 0
                        activeChatFriendId = friend.id
                        renderTab(HubTab.CHAT)
                    }
                }
                addView(avatarCircle(friend.initial, friend.avatarColorHex, 60, friend.online))
                addView(TextView(context).apply {
                    text = friend.name
                    textSize = 11.5f
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    setTextColor(Color.WHITE)
                    maxLines = 1
                    ellipsize = TextUtils.TruncateAt.END
                    setPadding(0, dp(5), 0, 0)
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                })
            }
            row.addView(item)
        }
        scroll.addView(row)
        return scroll
    }

    private fun avatarCircle(initial: String, fillHex: String, sizeDp: Int, online: Boolean): FrameLayout {
        val ringHex = if (online) StitchColors.PLAY_GREEN else StitchColors.OUTLINE_VARIANT
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
                    background = ovalBg(fillHex)
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

    private fun buildGameCarousel(games: List<CatalogGame>, showPlayButton: Boolean, showFriendTag: Boolean): View {
        val scroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(2), dp(16), dp(6))
        }
        for ((idx, game) in games.withIndex()) {
            val friendTag = if (showFriendTag) {
                when (idx % 3) {
                    0 -> "민준님 외 1명"
                    1 -> "서연님 플레이 중"
                    else -> "하은님 플레이 중"
                }
            } else null
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

        // Subtle geometric highlight orb (clean modern game card artwork without heavy raster bloat)
        addView(View(context).apply {
            background = ovalBg("#22FFFFFF")
        }, FrameLayout.LayoutParams(dp(heightDp), dp(heightDp), Gravity.END or Gravity.BOTTOM).apply {
            rightMargin = -dp(heightDp / 3)
            bottomMargin = -dp(heightDp / 3)
        })

        // Center stylized game mark
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

        // Top-left runtime / cached badge
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

        // Optional bottom-left Friend Playing overlay pill (Stitch home pattern)
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

            // Title & Metadata
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

    // ---- 2. EXPLORE TAB (Stitch Explore: Inline Search + Filter Chips + 2-Column Grid) ----

    private fun buildExploreTab(body: LinearLayout) {
        val games = filteredCatalog(applyCategory = true)

        // Title + Result Count
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

        // Inline Search Input Bar (Stitch surface-container-high + rounded-md + clear button)
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

        // Category Filter Chips (Stitch rounded-full pills)
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

        // 2-Column Grid
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

    // ---- 3. AVATAR TAB (Stitch Dark Styled + Local Accent Customization) ----

    private fun buildAvatarTab(body: LinearLayout) {
        val accentHex = savedAvatarColor()
        body.addView(sectionHeader("아바타 꾸미기", monoAccent = profile.handle))

        val previewCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 14)
            setPadding(dp(20), dp(22), dp(20), dp(20))

            addView(avatarCircle(profile.displayName.take(1).ifBlank { "P" }, accentHex, 88, online = true))
            addView(TextView(context).apply {
                text = profile.displayName
                textSize = 18f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                setPadding(0, dp(12), 0, dp(2))
            })
            addView(TextView(context).apply {
                text = "${profile.handle} · ${if (profile.isGuest) "Guest" else "Google"} · ${profile.ageTier.name}"
                textSize = 12.5f
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            })
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                setPadding(0, dp(16), 0, dp(4))
                for ((hex, name) in avatarAccentOptions) {
                    val selected = hex.equals(accentHex, ignoreCase = true)
                    addView(View(context).apply {
                        background = ovalBg(hex, if (selected) "#FFFFFF" else StitchColors.OUTLINE_VARIANT, if (selected) 3 else 1)
                        layoutParams = LinearLayout.LayoutParams(dp(34), dp(34)).apply {
                            leftMargin = dp(6)
                            rightMargin = dp(6)
                        }
                        setOnClickListener {
                            saveAvatarColor(hex)
                            renderTab(HubTab.AVATAR)
                            Toast.makeText(context, "아바타 테마 적용: $name", Toast.LENGTH_SHORT).show()
                        }
                    })
                }
            })
        }
        body.addView(paddedBox(previewCard, bottomDp = 12))
        body.addView(paddedBox(primaryActionButton("Play Coin & 코스메틱 스토어 열기") { showCoinStoreDialog() }))
    }

    // ---- 4. CHAT TAB (Stitch Chat List + Interactive Room + Age Gate Compliance) ----

    private fun buildChatListTab(body: LinearLayout) {
        val caps = AgeGatePolicy.evaluateCapabilities(profile.ageTier, profile.isGuest, profile.parentalConsentVerified)
        val onlineFriends = friendsData.filter { it.online }

        if (caps.requiresParentalConsent) {
            body.addView(sectionHeader("채팅 · 소셜 안전"))
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
                    text = "법정대리인 동의 전에는 자유 채팅 및 임의 친구 요청이 차단됩니다. 게임 플레이는 Guest 상태로 자유롭게 이용할 수 있습니다."
                    textSize = 13f
                    setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                    setPadding(0, dp(8), 0, 0)
                })
            }
            body.addView(paddedBox(safeCard))
            return
        }

        // Top Header: 친구 목록 + N명 접속 중 + 전체 / 접속 중 toggle pills
        val topRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(2), dp(16), dp(10))
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
                setOnClickListener {
                    friend.unread = 0
                    activeChatFriendId = friend.id
                    renderTab(HubTab.CHAT)
                }
                addView(avatarCircle(friend.initial, friend.avatarColorHex, 54, true))
                addView(TextView(context).apply {
                    text = friend.name
                    textSize = 11f
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    setTextColor(Color.WHITE)
                    setPadding(0, dp(4), 0, 0)
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                })
            })
        }
        quickScroll.addView(quickRow)
        body.addView(quickScroll)

        // Real-time Chat Threads
        body.addView(sectionHeader("실시간 채팅"))
        val visible = if (chatFilterOnlineOnly) onlineFriends else friendsData
        for (chat in visible) {
            val rowCard = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = roundedBg(StitchColors.SURFACE_CONTAINER, null, 12)
                setPadding(dp(12), dp(12), dp(12), dp(12))
                setOnClickListener {
                    chat.unread = 0
                    activeChatFriendId = chat.id
                    renderTab(HubTab.CHAT)
                }

                addView(avatarCircle(chat.initial, chat.avatarColorHex, 48, chat.online))

                val col = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        leftMargin = dp(12)
                    }
                    addView(LinearLayout(context).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        addView(TextView(context).apply {
                            text = chat.name
                            textSize = 15f
                            typeface = Typeface.DEFAULT_BOLD
                            setTextColor(Color.WHITE)
                        })
                        if (chat.playingGameId != null) {
                            addView(TextView(context).apply {
                                text = " · ${chat.activity}"
                                textSize = 11.5f
                                typeface = Typeface.DEFAULT_BOLD
                                setTextColor(Color.parseColor(StitchColors.PLAY_GREEN))
                                maxLines = 1
                                ellipsize = TextUtils.TruncateAt.END
                                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                            })
                        } else {
                            addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(0, dp(1), 1f) })
                        }
                        addView(TextView(context).apply {
                            text = chat.time
                            textSize = 11f
                            setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        })
                    })
                    addView(LinearLayout(context).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        setPadding(0, dp(4), 0, 0)
                        addView(TextView(context).apply {
                            text = chat.lastMessage
                            textSize = 13f
                            setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                            maxLines = 1
                            ellipsize = TextUtils.TruncateAt.END
                            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                        })
                        if (chat.unread > 0) {
                            addView(TextView(context).apply {
                                text = chat.unread.toString()
                                textSize = 11f
                                typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                                gravity = Gravity.CENTER
                                setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                                background = ovalBg(StitchColors.PLAY_GREEN)
                                layoutParams = LinearLayout.LayoutParams(dp(20), dp(20)).apply { leftMargin = dp(8) }
                            })
                        }
                    })
                }
                addView(col)
            }
            body.addView(paddedBox(rowCard, bottomDp = 8))
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

    private fun buildChatRoomView(friend: FriendPresence): View {
        val playingGame = friend.playingGameId?.let { gid -> allCatalogGames().find { it.id == gid } }
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
                        activeChatFriendId = null
                        renderTab(HubTab.CHAT)
                    }
                })
                addView(avatarCircle(friend.initial, friend.avatarColorHex, 40, friend.online))
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        leftMargin = dp(10)
                    }
                    addView(TextView(context).apply {
                        text = friend.name
                        textSize = 15f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.WHITE)
                    })
                    addView(TextView(context).apply {
                        text = friend.activity
                        textSize = 11.5f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.parseColor(if (friend.online) StitchColors.PLAY_GREEN else StitchColors.ON_SURFACE_VARIANT))
                    })
                })
                if (playingGame != null) {
                    addView(LinearLayout(context).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER
                        background = roundedBg(StitchColors.PLAY_GREEN, null, 8)
                        setPadding(dp(10), dp(6), dp(12), dp(6))
                        addView(iconView(R.drawable.ic_play_arrow, 16, StitchColors.ON_PLAY_GREEN).apply {
                            (layoutParams as LinearLayout.LayoutParams).rightMargin = dp(3)
                        })
                        addView(TextView(context).apply {
                            text = "합류"
                            textSize = 12f
                            typeface = Typeface.DEFAULT_BOLD
                            setTextColor(Color.parseColor(StitchColors.ON_PLAY_GREEN))
                        })
                        setOnClickListener { openExperienceDetail(playingGame) }
                    })
                }
            }
            addView(subheader)
            addView(View(context).apply {
                setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
            })

            // Messages List
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
                            text = "지금 플레이 중"
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
            for (msg in friend.messages) {
                val wrap = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = if (msg.senderMe) Gravity.END else Gravity.START
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(10)
                    }
                    addView(TextView(context).apply {
                        text = msg.text
                        textSize = 14f
                        setTextColor(Color.parseColor(if (msg.senderMe) StitchColors.ON_PLAY_GREEN else StitchColors.ON_SURFACE))
                        background = roundedBg(
                            fillHex = if (msg.senderMe) StitchColors.PLAY_GREEN else StitchColors.SURFACE_HIGH,
                            strokeHex = if (msg.senderMe) null else StitchColors.OUTLINE_VARIANT,
                            radiusDp = 12
                        )
                        setPadding(dp(12), dp(9), dp(12), dp(9))
                        maxWidth = dp(280)
                        layoutParams = LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.WRAP_CONTENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT
                        )
                    })
                    addView(TextView(context).apply {
                        text = msg.time
                        textSize = 10.5f
                        setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                        setPadding(dp(4), dp(3), dp(4), 0)
                        layoutParams = LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.WRAP_CONTENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT
                        )
                    })
                }
                msgCol.addView(wrap)
            }
            scroll.addView(msgCol)
            addView(scroll)

            // Message Composer (#1F2225 + #2B2E32 pill input + #00B06F send button)
            addView(View(context).apply {
                setBackgroundColor(Color.parseColor(StitchColors.OUTLINE_VARIANT))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
            })
            val composer = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundColor(Color.parseColor(StitchColors.SURFACE_LOW))
                setPadding(dp(12), dp(10), dp(12), dp(10))
                val input = EditText(context).apply {
                    hint = "${friend.name}님에게 메시지 보내기..."
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
                        friend.messages.add(ChatMessage(true, txt, "방금"))
                        renderTab(HubTab.CHAT)
                    }
                }
                addView(input)
                addView(sendBtn)
            }
            addView(composer)
        }
    }

    // ---- 5. MORE TAB (Stitch Dark Cards + Farm Status + Cache & Compliance) ----

    private fun buildMoreTab(body: LinearLayout) {
        val cachedMb = String.format("%.2f", PckPackageManager.totalCachedBytes(filesDir) / (1024.0 * 1024.0))
        val farmSelectorAllowed = FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)
        val farmStatusLine = if (farmSelectorAllowed) "\nFarm 상태: ${currentFarmHealth().summaryLine()}" else ""

        body.addView(sectionHeader("더보기", monoAccent = BuildConfig.BUILD_STAGE.uppercase()))

        val buildInfoCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 12)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            addView(TextView(context).apply {
                text = "앱 & 런타임 정보 (Forge 제외 · 플레이 전용)"
                textSize = 14.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
            })
            addView(TextView(context).apply {
                text = "Package ID: ${applicationContext.packageName}\n" +
                    "Build Stage: ${BuildConfig.BUILD_STAGE} · Branch: ${BuildConfig.PLAYHUB_BRANCH}\n" +
                    "Engine: Godot ${BuildConfig.GODOT_ENGINE_VERSION} (template_release 내장)\n" +
                    "Active Farm: ${activeFarm.label}\n" +
                    "Server URL: ${activeFarm.baseUrl}$farmStatusLine\n" +
                    "온디맨드 .pck 캐시: ${cachedMb} MiB (내장 스타터: 0종)"
                textSize = 12f
                typeface = Typeface.MONOSPACE
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
                setPadding(0, dp(8), 0, 0)
                setLineSpacing(dp(3).toFloat(), 1f)
            })
        }
        body.addView(paddedBox(buildInfoCard, bottomDp = 12))

        if (farmSelectorAllowed) {
            val health = currentFarmHealth()
            val farmBtn = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = roundedBg(StitchColors.SURFACE_CONTAINER, health.status.colorHex, 10)
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
            body.addView(paddedBox(farmBtn, bottomDp = 10))
        }

        body.addView(paddedBox(primaryActionButton("Play Coin & Play Pass 스토어") { showCoinStoreDialog() }, bottomDp = 10))
        body.addView(paddedBox(secondaryActionButton("온디맨드 .pck 캐시 정리 (${cachedMb} MiB)") {
            File(filesDir, "games").deleteRecursively()
            renderTab(HubTab.MORE)
            Toast.makeText(this, "로컬 .pck 캐시를 정리했습니다.", Toast.LENGTH_SHORT).show()
        }, bottomDp = 10))
        body.addView(paddedBox(secondaryActionButton("연령 확인 상태 (${profile.ageTier.name} · ${profile.regionCode})") {
            Toast.makeText(this, "연령 티어: ${profile.ageTier.name} (${profile.regionCode})", Toast.LENGTH_SHORT).show()
        }))
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

    // ---- Stitch Bottom-Sheet Game Launch Modal ----

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

        val sheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(StitchColors.SURFACE_CONTAINER, StitchColors.OUTLINE_VARIANT, 16)
            setPadding(dp(16), dp(16), dp(16), dp(16))

            // 16:9 Banner + Top-right Close Circle
            val thumbWrap = buildGameThumbnail(game, 172, compat, cached)
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
                setPadding(0, dp(14), 0, dp(4))
            })
            addView(TextView(context).apply {
                text = "${game.subtitle} · ${game.categoryLabel}"
                textSize = 13f
                setTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
            })

            // Monospace Metadata Row
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(10), 0, dp(14))
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

            // Primary Play CTA Button (#00B06F + #002111)
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
    }

    private fun showIncompatibilityDialog(game: CatalogGame, detail: String) {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("⚠️ 버전 호환성 안내 · ${game.title}")
            .setMessage(detail)
            .setPositiveButton("확인", null)
            .show()
    }

    private fun launchGame(game: CatalogGame) {
        if (game.runtime == "web") {
            startActivity(WebGameActivity.createIntent(this, game.id, game.title, game.pckPathOrUrl))
            return
        }

        val cached = PckPackageManager.cachedPckFile(filesDir, game.id, game.version)
        if (cached.isFile) {
            startGodotIsolated(game, cached)
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

    private fun startGodotIsolated(game: CatalogGame, pckFile: File) {
        val userDataDir = File(File(File(filesDir, "game_userdata"), profile.principalId), game.id)
        val intent = GodotPlayerActivity.createIntent(
            context = this,
            gameId = game.id,
            gameTitle = game.title,
            pckPath = pckFile.absolutePath,
            userDataDir = userDataDir.absolutePath,
            displayName = profile.displayName,
            handle = profile.handle,
            isGuest = profile.isGuest,
            ageTier = profile.ageTier.name
        )
        startActivity(intent)
    }

    // ---- Farm Server Cluster Status Dialog (Red / Orange / Yellow / Green) ----

    private fun onFarmChanged(next: FarmCluster) {
        activeFarm = next
        remoteCatalog = null
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
            hint = "https://your-tunnel.trycloudflare.com"
            setText(activeFarm.baseUrl)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor(StitchColors.ON_SURFACE_VARIANT))
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Custom Farm URL 입력")
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
}
