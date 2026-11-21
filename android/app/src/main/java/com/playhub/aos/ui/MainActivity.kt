package com.playhub.aos.ui

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.playhub.aos.BuildConfig
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

private data class CatalogGame(
    val id: String,
    val title: String,
    val subtitle: String,
    val runtime: String, // "godot-pck" or "web"
    val version: String,
    val ageRating: GameAgeRating,
    val pckPathOrUrl: String,
    val sizeLabel: String,
    val requiredEngineVersion: String? = null,
    val minAppVersionCode: Int = 1,
    val accentStart: String = "#1D4ED8",
    val accentEnd: String = "#0F172A",
    val iconEmoji: String = "🎮",
    val deployMode: String = "singleplay",
    val multiplayerWsUrl: String? = null
)

/**
 * Play Hub Android Main Shell — Polished Roblox-style 5-Tab Runtime Hub (Minimal Footprint, Zero Forge).
 * - Proper Android 15/16 Edge-to-Edge WindowInsets handling (never clipped by status/nav bars).
 * - Top Utility Bar: Brand | Farm Pill (non-release/live) | Search | Play Coin Pill | Notifications
 * - Bottom 5 Tabs: Home | Charts | Avatar | Party | More
 * - Guest immediate play + Neutral Age Gate compliance + Pre-Entry Version Compatibility Gate
 */
class MainActivity : Activity() {

    private enum class HubTab(val label: String, val icon: String) {
        HOME("홈", "🏠"),
        CHARTS("차트", "🏆"),
        AVATAR("아바타", "🧑"),
        PARTY("파티", "👥"),
        MORE("더보기", "☰")
    }

    private lateinit var authStore: AuthSessionStore
    private lateinit var profile: AuthProfile
    private lateinit var activeFarm: FarmCluster
    private var activeTab: HubTab = HubTab.HOME
    private var searchQuery: String = ""
    private var remoteCatalog: List<CatalogGame>? = null
    private var syncStatusText: String = "서버 연결 준비 중..."

    private lateinit var topBarView: LinearLayout
    private lateinit var bottomBarView: LinearLayout
    private lateinit var titleView: TextView
    private var farmPillContainer: LinearLayout? = null
    private var farmPillDotView: View? = null
    private var farmPillLabelView: TextView? = null
    private lateinit var coinPillView: TextView
    private lateinit var contentContainer: FrameLayout
    private val navButtons = mutableMapOf<HubTab, TextView>()
    private val ioExecutor = Executors.newSingleThreadExecutor()
    private val probeExecutor = Executors.newFixedThreadPool(4)
    private val farmHealthCache = ConcurrentHashMap<String, FarmHealthResult>()

    private fun currentCatalog(): List<CatalogGame> {
        val source = remoteCatalog ?: fallbackCatalog()
        val q = searchQuery.trim().lowercase()
        return if (q.isEmpty()) source else source.filter {
            it.title.lowercase().contains(q) || it.subtitle.lowercase().contains(q) || it.id.lowercase().contains(q)
        }
    }

    private fun styleForGame(id: String, runtime: String): Triple<String, String, String> = when {
        id.contains("survivor-arena") -> Triple("#15803D", "#0B1F17", "⚔️")
        id.contains("nextgen") || id.contains("48") -> Triple("#B45309", "#1C140A", "🚀")
        id.contains("survivor-io") -> Triple("#7C3AED", "#1A1033", "🛡️")
        runtime == "godot-pck" -> Triple("#2563EB", "#0F172A", "🧊")
        else -> Triple("#0891B2", "#0D1B2A", "🧩")
    }

    private fun fallbackCatalog(): List<CatalogGame> {
        val base = activeFarm.baseUrl.trimEnd('/')
        return listOf(
            CatalogGame(
                id = "survivor-arena-g2",
                title = "Survivor Arena G2",
                subtitle = "Godot 4.7.2 네이티브 3D 서바이벌",
                runtime = "godot-pck",
                version = "2.1.0",
                ageRating = GameAgeRating.ALL,
                pckPathOrUrl = "$base/games/survivor-arena-g2/index.pck",
                sizeLabel = "1.9 MB (.pck 온디맨드)",
                requiredEngineVersion = "4.7.2",
                minAppVersionCode = 1,
                accentStart = "#15803D",
                accentEnd = "#0B1F17",
                iconEmoji = "⚔️"
            ),
            CatalogGame(
                id = "nextgen-godot48",
                title = "NextGen 3D Arena (Godot 4.8)",
                subtitle = "상위 엔진 4.8.0 요구 호환성 안내 예시",
                runtime = "godot-pck",
                version = "1.0.0",
                ageRating = GameAgeRating.ALL,
                pckPathOrUrl = "$base/games/nextgen-godot48/index.pck",
                sizeLabel = "2.0 MB (.pck)",
                requiredEngineVersion = "4.8.0",
                minAppVersionCode = 1,
                accentStart = "#B45309",
                accentEnd = "#1C140A",
                iconEmoji = "🚀"
            ),
            CatalogGame(
                id = "match3-garden",
                title = "Match-3 Garden",
                subtitle = "즉시 웹플레이 퍼즐 (HTML5)",
                runtime = "web",
                version = "1.0.0",
                ageRating = GameAgeRating.ALL,
                pckPathOrUrl = "$base/games/match3-garden/index.html",
                sizeLabel = "스트리밍 웹",
                requiredEngineVersion = null,
                minAppVersionCode = 1,
                accentStart = "#0891B2",
                accentEnd = "#0D1B2A",
                iconEmoji = "🧩"
            )
        )
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
            topBarView.setPadding(dp(16), topInset + dp(10), dp(12), dp(12))
            bottomBarView.setPadding(dp(6), dp(8), dp(6), bottomInset + dp(8))
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
                    val mb = if (item.pckBytes > 0) String.format("%.1f MB (.pck 온디맨드)", item.pckBytes / (1024.0 * 1024.0)) else "스트리밍 웹"
                    val (c1, c2, emoji) = styleForGame(item.id, item.runtime)
                    CatalogGame(
                        id = item.id,
                        title = item.title,
                        subtitle = item.description.ifBlank { item.genre },
                        runtime = item.runtime,
                        version = item.buildId,
                        ageRating = item.ageRating,
                        pckPathOrUrl = item.pckUrl ?: item.entryUrl,
                        sizeLabel = mb,
                        requiredEngineVersion = item.requiredEngineVersion,
                        minAppVersionCode = item.minAppVersionCode,
                        accentStart = c1,
                        accentEnd = c2,
                        iconEmoji = emoji,
                        deployMode = item.deployMode,
                        multiplayerWsUrl = item.multiplayerWsUrl
                    )
                }
            }.onSuccess { list ->
                runOnUiThread {
                    if (activeFarm.baseUrl != farm.baseUrl) return@runOnUiThread
                    remoteCatalog = if (list.isNotEmpty()) list else null
                    syncStatusText = "온라인 동기화 완료 (${list.size}종 · ${farm.id})"
                    renderTab(activeTab)
                }
            }.onFailure {
                runOnUiThread {
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

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun cardBg(fillHex: String = "#131A27", strokeHex: String = "#23304A", radiusDp: Int = 16) =
        GradientDrawable().apply {
            setColor(Color.parseColor(fillHex))
            cornerRadius = dp(radiusDp).toFloat()
            setStroke(dp(1), Color.parseColor(strokeHex))
        }

    private fun gradientBanner(startHex: String, endHex: String, radiusDp: Int = 12) =
        GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(Color.parseColor(startHex), Color.parseColor(endHex))
        ).apply {
            cornerRadius = dp(radiusDp).toFloat()
        }

    private fun badgePill(text: String, bgHex: String, textHex: String = "#F8FAFC"): TextView = TextView(this).apply {
        this.text = text
        textSize = 11f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(Color.parseColor(textHex))
        setPadding(dp(8), dp(3), dp(8), dp(3))
        background = GradientDrawable().apply {
            setColor(Color.parseColor(bgHex))
            cornerRadius = dp(10).toFloat()
        }
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { rightMargin = dp(6) }
    }

    private fun buildRootLayout(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0A0F1A"))
        }

        // 1. Roblox-style Top Global Utility Bar (with safe status bar inset applied dynamically)
        topBarView = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#111827"))
            setPadding(dp(16), dp(12), dp(12), dp(12))
        }

        titleView = TextView(this).apply {
            text = "▶ Play Hub"
            textSize = 19f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        topBarView.addView(titleView)

        if (FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) {
            val dot = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(9), dp(9)).apply {
                    rightMargin = dp(6)
                }
            }
            val label = TextView(this).apply {
                textSize = 11.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
            }
            val pill = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(9), dp(6), dp(9), dp(6))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { leftMargin = dp(6) }
                addView(dot)
                addView(label)
                setOnClickListener { showFarmSelectorDialog() }
            }
            farmPillDotView = dot
            farmPillLabelView = label
            farmPillContainer = pill
            updateFarmPillVisual()
            topBarView.addView(pill)
        }
        topBarView.addView(utilityPill("🔍") { showSearchDialog() })
        coinPillView = utilityPill("🪙 ${profile.coinBalance}", "#272013", "#D97706") {
            showCoinStoreDialog()
        }
        topBarView.addView(coinPillView)
        topBarView.addView(utilityPill("🔔") {
            Toast.makeText(this, "알림 피드 (친구·파티 초대·커뮤니티 · M3 연동)", Toast.LENGTH_SHORT).show()
        })
        root.addView(topBarView)

        // Subtle top divider
        root.addView(View(this).apply {
            setBackgroundColor(Color.parseColor("#1F2937"))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
        })

        // 2. Main Scrollable Content Host
        contentContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        root.addView(contentContainer)

        // Subtle bottom divider
        root.addView(View(this).apply {
            setBackgroundColor(Color.parseColor("#1F2937"))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
        })

        // 3. Roblox-style 5-Tab Bottom Navigation Bar (Home, Charts, Avatar, Party, More — NO Forge)
        bottomBarView = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#111827"))
            setPadding(dp(6), dp(8), dp(6), dp(10))
        }
        for (tab in HubTab.values()) {
            val btn = TextView(this).apply {
                text = "${tab.icon}\n${tab.label}"
                textSize = 11f
                gravity = Gravity.CENTER
                setPadding(dp(4), dp(7), dp(4), dp(7))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    leftMargin = dp(2)
                    rightMargin = dp(2)
                }
                setOnClickListener { renderTab(tab) }
            }
            navButtons[tab] = btn
            bottomBarView.addView(btn)
        }
        root.addView(bottomBarView)
        return root
    }

    private fun utilityPill(
        label: String,
        fillHex: String = "#1E293B",
        strokeHex: String = "#334155",
        onClick: () -> Unit
    ): TextView = TextView(this).apply {
        text = label
        textSize = 12f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(Color.WHITE)
        setPadding(dp(9), dp(6), dp(9), dp(6))
        background = cardBg(fillHex, strokeHex, 16)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { leftMargin = dp(6) }
        setOnClickListener { onClick() }
    }

    private fun statusDotDrawable(status: FarmHealthStatus): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor(status.colorHex))
        }

    private fun updateFarmPillVisual() {
        runOnUiThread {
            if (isFinishing || isDestroyed) return@runOnUiThread
            val pill = farmPillContainer ?: return@runOnUiThread
            val dot = farmPillDotView ?: return@runOnUiThread
            val label = farmPillLabelView ?: return@runOnUiThread
            val health = currentFarmHealth()
            dot.background = statusDotDrawable(health.status)
            label.text = "${activeFarm.id} · ${health.compactPillText()}"
            pill.background = cardBg("#1E293B", health.status.colorHex, 16)
        }
    }

    private fun renderTab(tab: HubTab) {
        activeTab = tab
        titleView.text = if (tab == HubTab.HOME) "▶ Play Hub" else tab.label
        updateFarmPillVisual()
        coinPillView.text = "🪙 ${profile.coinBalance}"
        for ((t, btn) in navButtons) {
            val selected = t == tab
            btn.setTextColor(if (selected) Color.parseColor("#4ADE80") else Color.parseColor("#94A3B8"))
            btn.typeface = if (selected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            btn.background = if (selected) cardBg("#162921", "#22C55E", 12) else null
        }
        contentContainer.removeAllViews()
        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(24))
        }
        when (tab) {
            HubTab.HOME -> buildHomeTab(body)
            HubTab.CHARTS -> buildChartsTab(body)
            HubTab.AVATAR -> buildAvatarTab(body)
            HubTab.PARTY -> buildPartyTab(body)
            HubTab.MORE -> buildMoreTab(body)
        }
        scroll.addView(body)
        contentContainer.addView(scroll)
    }

    private fun buildHomeTab(body: LinearLayout) {
        // Player Status & Sync Banner
        val heroCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = gradientBanner("#172554", "#0F172A", 16)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(12) }

            addView(TextView(context).apply {
                text = "${profile.displayName}  ${profile.handle}"
                textSize = 15f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
            })
            val chips = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(8), 0, dp(6))
                addView(badgePill(if (profile.isGuest) "GUEST 플레이" else "GOOGLE 계정", "#1D4ED8"))
                addView(badgePill("${profile.ageTier.name} (${profile.regionCode})", "#334155"))
                addView(badgePill("Godot ${BuildConfig.GODOT_ENGINE_VERSION}", "#15803D"))
            }
            addView(chips)
            addView(TextView(context).apply {
                text = syncStatusText
                textSize = 12f
                setTextColor(Color.parseColor("#93C5FD"))
            })
        }
        body.addView(heroCard)

        // Roblox-style Circular Friends Carousel (Connections)
        body.addView(sectionTitle("친구 (Connections)"))
        val friendsScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val friendsRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val caps = AgeGatePolicy.evaluateCapabilities(profile.ageTier, profile.isGuest, profile.parentalConsentVerified)
        val friends = if (caps.requiresParentalConsent) {
            listOf(Triple("🔒", "보호자 동의", "#64748B"))
        } else {
            listOf(
                Triple("＋", "친구 추가", "#3B82F6"),
                Triple("🧑", "Alex · 온라인", "#22C55E"),
                Triple("🎮", "Mina · 플레이중", "#38BDF8"),
                Triple("🦊", "Jun · 오프라인", "#475569")
            )
        }
        for ((emoji, name, ringHex) in friends) {
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(4), dp(2), dp(12), dp(4))
                setOnClickListener { renderTab(HubTab.PARTY) }
                addView(TextView(context).apply {
                    text = emoji
                    textSize = 22f
                    gravity = Gravity.CENTER
                    setTextColor(Color.WHITE)
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(Color.parseColor("#1E293B"))
                        setStroke(dp(2), Color.parseColor(ringHex))
                    }
                    layoutParams = LinearLayout.LayoutParams(dp(56), dp(56))
                })
                addView(TextView(context).apply {
                    text = name
                    textSize = 11f
                    setTextColor(Color.parseColor("#CBD5E1"))
                    setPadding(0, dp(5), 0, 0)
                })
            }
            friendsRow.addView(item)
        }
        friendsScroll.addView(friendsRow)
        body.addView(friendsScroll)

        // Continue / Recommended Games
        body.addView(sectionTitle("추천 & 온디맨드 플레이"))
        for (game in currentCatalog()) {
            body.addView(gameCard(game))
        }
    }

    private fun buildChartsTab(body: LinearLayout) {
        val header = if (searchQuery.isNotBlank()) "검색 결과: \"$searchQuery\"" else "인기 차트 · 게임 탐색"
        body.addView(sectionTitle(header))
        val items = currentCatalog()
        if (items.isEmpty()) {
            body.addView(infoCard("검색 결과 없음", "다른 검색어로 찾아보세요."))
        } else {
            for ((idx, game) in items.withIndex()) {
                body.addView(gameCard(game, rankPrefix = "#${idx + 1} "))
            }
        }
    }

    private fun buildAvatarTab(body: LinearLayout) {
        body.addView(sectionTitle("아바타 · 인벤토리"))
        body.addView(
            infoCard(
                title = "현재 장착 아바타: 기본 플레이어 (${profile.handle})",
                detail = "보유 Play Coin: ${profile.coinBalance}\n프레임 · 칭호 · 업적 배지 · 게임별 보유 엔타이틀먼트(인벤토리)가 통합 관리됩니다."
            )
        )
        body.addView(actionButton("🪙 코스메틱 샵 / 코인 충전 열기") { showCoinStoreDialog() })
    }

    private fun buildPartyTab(body: LinearLayout) {
        val caps = AgeGatePolicy.evaluateCapabilities(profile.ageTier, profile.isGuest, profile.parentalConsentVerified)
        body.addView(sectionTitle("파티 로비 · 친구"))
        val note = when {
            caps.requiresParentalConsent -> "아동 보호 모드(${profile.ageTier.name}): 자유 채팅·임의 친구 요청이 차단됩니다. 법정대리인 동의 후 안전 퀵메시지가 활성화됩니다."
            profile.isGuest -> "Guest 상태에서는 초대 링크 열람과 게임 플레이가 가능하며, 친구 추가·파티 채팅은 Google 로그인 후 이용할 수 있습니다."
            else -> "최대 8명 파티를 만들고 같은 게임에 원탭 합류할 수 있습니다."
        }
        body.addView(infoCard("소셜 안전 정책", note))
        body.addView(actionButton("🔗 초대 링크 공유 / 파티 만들기") {
            Toast.makeText(this, "파티 로비 & App Links 초대 (M3 구현 대상)", Toast.LENGTH_SHORT).show()
        })
    }

    private fun buildMoreTab(body: LinearLayout) {
        val cachedMb = String.format("%.2f", PckPackageManager.totalCachedBytes(filesDir) / (1024.0 * 1024.0))
        val farmSelectorAllowed = FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)
        val farmStatusLine = if (farmSelectorAllowed) "\nFarm 상태: ${currentFarmHealth().summaryLine()}" else ""
        body.addView(sectionTitle("더보기 (게임 플레이 런타임 전용 · Forge 제외)"))
        body.addView(
            infoCard(
                title = "앱 & 빌드 정보",
                detail = "Package ID: ${applicationContext.packageName}\n" +
                    "Build Stage: ${BuildConfig.BUILD_STAGE} · Branch: ${BuildConfig.PLAYHUB_BRANCH}\n" +
                    "Engine: Godot ${BuildConfig.GODOT_ENGINE_VERSION} (template_release 내장)\n" +
                    "Active Farm: ${activeFarm.label}\n" +
                    "Server URL: ${activeFarm.baseUrl}$farmStatusLine\n" +
                    "온디맨드 .pck 캐시: ${cachedMb} MiB (APK 내장 스타터: 0종)"
            )
        )
        if (farmSelectorAllowed) {
            val health = currentFarmHealth()
            body.addView(actionButton("🌐 Farm 서버군 선택 (${activeFarm.id} · ${health.badgeLabel()})", primary = false) {
                showFarmSelectorDialog()
            })
        }
        body.addView(actionButton("🪙 Play Coin & Play Pass 스토어") { showCoinStoreDialog() })
        body.addView(actionButton("🧹 온디맨드 .pck 캐시 정리", primary = false) {
            File(filesDir, "games").deleteRecursively()
            renderTab(HubTab.MORE)
            Toast.makeText(this, "로컬 .pck 캐시를 정리했습니다.", Toast.LENGTH_SHORT).show()
        })
        body.addView(actionButton("🔐 연령 확인 상태 보기", primary = false) {
            Toast.makeText(this, "연령 티어: ${profile.ageTier.name} (${profile.regionCode})", Toast.LENGTH_SHORT).show()
        })
    }

    private fun sectionTitle(text: String): TextView = TextView(this).apply {
        this.text = text
        textSize = 16f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(Color.parseColor("#F8FAFC"))
        setPadding(0, dp(14), 0, dp(10))
    }

    private fun infoCard(title: String, detail: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = cardBg()
        setPadding(dp(14), dp(13), dp(14), dp(13))
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(10) }

        addView(TextView(context).apply {
            text = title
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
        })
        addView(TextView(context).apply {
            text = detail
            textSize = 12f
            setTextColor(Color.parseColor("#CBD5E1"))
            setPadding(0, dp(5), 0, 0)
        })
    }

    private fun gameCard(game: CatalogGame, rankPrefix: String = ""): View {
        val ageAllowed = AgeGatePolicy.canPlayRating(profile.ageTier, game.ageRating, profile.parentalConsentVerified)
        val compat = VersionCompatibilityChecker.evaluate(
            runtime = game.runtime,
            requiredEngineVersion = game.requiredEngineVersion,
            minAppVersionCode = game.minAppVersionCode,
            installedEngineVersion = BuildConfig.GODOT_ENGINE_VERSION,
            installedAppVersionCode = BuildConfig.VERSION_CODE
        )
        val playable = ageAllowed && compat.compatible
        val cached = game.runtime == "godot-pck" && PckPackageManager.cachedPckFile(filesDir, game.id, game.version).isFile
        val strokeHex = when {
            !compat.compatible -> "#D97706"
            !ageAllowed -> "#991B1B"
            else -> "#23304A"
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = cardBg("#131A27", strokeHex, 16)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(12) }

            // Gradient Hero Banner
            val banner = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = gradientBanner(game.accentStart, game.accentEnd, 12)
                setPadding(dp(14), dp(14), dp(14), dp(14))
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = dp(10) }

                addView(TextView(context).apply {
                    text = game.iconEmoji
                    textSize = 30f
                    setPadding(0, 0, dp(12), 0)
                })
                val metaCol = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                    addView(TextView(context).apply {
                        text = "$rankPrefix${game.title}"
                        textSize = 16f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.WHITE)
                    })
                    addView(TextView(context).apply {
                        text = game.subtitle
                        textSize = 12f
                        setTextColor(Color.parseColor("#E2E8F0"))
                        setPadding(0, dp(3), 0, dp(6))
                    })
                    val chipRow = LinearLayout(context).apply {
                        orientation = LinearLayout.HORIZONTAL
                        val rtLabel = if (game.runtime == "godot-pck") "GODOT ${game.requiredEngineVersion ?: "4.7.2"}" else "HTML5 WEB"
                        addView(badgePill(rtLabel, "#1E293B"))
                        addView(badgePill(game.ageRating.code, if (ageAllowed) "#334155" else "#991B1B"))
                        addView(badgePill(if (cached) "캐시됨" else game.sizeLabel, if (cached) "#15803D" else "#0F172A"))
                    }
                    addView(chipRow)
                }
                addView(metaCol)
            }
            addView(banner)

            if (!compat.compatible) {
                addView(TextView(context).apply {
                    text = compat.badgeText ?: "⚠️ 버전 호환성 확인 필요"
                    textSize = 12f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor("#FBBF24"))
                    setPadding(dp(4), 0, dp(4), dp(6))
                })
            }

            val btnLabel = when {
                !compat.compatible -> compat.badgeText ?: "⚠️ 업데이트 필요"
                !ageAllowed -> "🔒 연령 등급 제한 (${game.ageRating.code})"
                cached -> "▶ 바로 플레이"
                else -> "▶ 플레이"
            }
            addView(actionButton(btnLabel, playable) {
                when {
                    !compat.compatible -> showIncompatibilityDialog(game, compat.detailMessage ?: "앱 업데이트가 필요합니다.")
                    !ageAllowed -> Toast.makeText(context, "현재 연령 티어(${profile.ageTier.name})에서는 이용할 수 없는 등급입니다.", Toast.LENGTH_SHORT).show()
                    else -> openExperienceDetail(game)
                }
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

    private fun actionButton(label: String, primary: Boolean = true, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        textSize = 14f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        setPadding(dp(12), dp(11), dp(12), dp(11))
        background = cardBg(if (primary) "#16A34A" else "#1E293B", if (primary) "#22C55E" else "#334155", 12)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(4) }
        setOnClickListener { onClick() }
    }

    private fun openExperienceDetail(game: CatalogGame) {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("${game.iconEmoji} ${game.title}")
            .setMessage(
                "${game.subtitle}\n\n" +
                    "• 런타임: ${game.runtime}\n" +
                    "• 버전: ${game.version} · 등급: ${game.ageRating.code}\n" +
                    "• 패키지 크기: ${game.sizeLabel}"
            )
            .setPositiveButton("▶ 지금 실행") { _, _ -> launchGame(game) }
            .setNegativeButton("닫기", null)
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
            setBackgroundColor(Color.parseColor("#111827"))
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
            ageTier = profile.ageTier.name,
            wsUrl = game.multiplayerWsUrl
        )
        startActivity(intent)
    }

    private fun showSearchDialog() {
        val input = EditText(this).apply {
            hint = "게임 이름 또는 ID 검색..."
            setText(searchQuery)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#94A3B8"))
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("🔍 게임 통합 검색")
            .setView(input)
            .setPositiveButton("검색") { _, _ ->
                searchQuery = input.text.toString().trim()
                renderTab(HubTab.CHARTS)
            }
            .setNeutralButton("초기화") { _, _ ->
                searchQuery = ""
                renderTab(activeTab)
            }
            .setNegativeButton("취소", null)
            .show()
    }

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
            setTextColor(Color.parseColor("#CBD5E1"))
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
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(dp(14), dp(12), dp(14), dp(12))
        }

        // Legend bar: Green (<200ms) / Yellow (<600ms) / Orange (>=600ms) / Red (Unreachable)
        val legendRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = cardBg("#131A27", "#23304A", 10)
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

        val rowsHost = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        data class RowUi(val dot: View, val badge: TextView, val card: LinearLayout, val isActive: Boolean)
        val rowBindings = mutableMapOf<String, RowUi>()

        fun applyRowHealth(binding: RowUi, res: FarmHealthResult) {
            binding.dot.background = statusDotDrawable(res.status)
            binding.badge.text = res.badgeLabel()
            binding.badge.setTextColor(Color.parseColor(res.status.badgeTextHex))
            binding.badge.background = GradientDrawable().apply {
                setColor(Color.parseColor(res.status.badgeBgHex))
                cornerRadius = dp(10).toFloat()
                setStroke(dp(1), Color.parseColor(res.status.colorHex))
            }
            val borderHex = if (binding.isActive) res.status.colorHex else "#23304A"
            binding.card.background = cardBg(if (binding.isActive) "#162135" else "#131A27", borderHex, 12)
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
                    setTextColor(Color.parseColor("#94A3B8"))
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

        val scroll = ScrollView(this).apply {
            addView(rowsHost)
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        container.addView(scroll)

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
                text = "🔄 상태 새로고침"
                textSize = 12.5f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setTextColor(Color.WHITE)
                setPadding(dp(10), dp(9), dp(10), dp(9))
                background = cardBg("#1E293B", "#3B82F6", 10)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    rightMargin = dp(6)
                }
                setOnClickListener { probeAllClusters() }
            })
            addView(TextView(context).apply {
                text = "✏️ 직접 입력"
                textSize = 12.5f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setTextColor(Color.WHITE)
                setPadding(dp(10), dp(9), dp(10), dp(9))
                background = cardBg("#1E293B", "#334155", 10)
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
            .setTitle("🌐 Farm 서버군 상태 (${BuildConfig.BUILD_STAGE})")
            .setView(container)
            .setNegativeButton("닫기", null)
            .create()
        dlg.setOnDismissListener { dialogAlive = false }
        dialogRef = dlg
        dlg.show()

        // Immediately probe all Farm clusters concurrently on open
        probeAllClusters()
    }

    private fun showCustomFarmInputDialog() {
        val input = EditText(this).apply {
            hint = "https://your-tunnel.trycloudflare.com"
            setText(activeFarm.baseUrl)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#94A3B8"))
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
            .setTitle("🪙 Play Coin & Play Pass 스토어")
            .setMessage(msg)
            .setPositiveButton("확인", null)
            .show()
    }
}
