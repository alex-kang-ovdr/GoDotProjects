package com.playhub.aos.ui

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.playhub.aos.BuildConfig
import com.playhub.aos.auth.AuthProfile
import com.playhub.aos.auth.AuthSessionStore
import com.playhub.aos.compliance.AgeGateDialog
import com.playhub.aos.compliance.AgeGatePolicy
import com.playhub.aos.compliance.AgeTier
import com.playhub.aos.compliance.GameAgeRating
import com.playhub.aos.config.FarmCluster
import com.playhub.aos.config.FarmServerRegistry
import com.playhub.aos.runtime.GodotPlayerActivity
import com.playhub.aos.runtime.PckPackageManager
import com.playhub.aos.runtime.WebGameActivity
import java.io.File
import java.util.concurrent.Executors

private data class CatalogGame(
    val id: String,
    val title: String,
    val subtitle: String,
    val runtime: String, // "godot-pck" or "web"
    val version: String,
    val ageRating: GameAgeRating,
    val pckPathOrUrl: String,
    val sizeLabel: String
)

/**
 * Play Hub Android Main Shell — Roblox-style 5-Tab Runtime Hub (Minimal Footprint, Zero Forge).
 * - Top Utility Bar: Title | Search | Play Coin Pill | Notifications
 * - Bottom 5 Tabs: Home | Charts | Avatar | Party | More
 * - Guest immediate play + Neutral Age Gate compliance
 * - 0 bundled starter games: 100% on-demand .pck download & cache verification
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

    private lateinit var titleView: TextView
    private var farmPillView: TextView? = null
    private lateinit var coinPillView: TextView
    private lateinit var contentContainer: FrameLayout
    private val navButtons = mutableMapOf<HubTab, TextView>()
    private val ioExecutor = Executors.newSingleThreadExecutor()

    private fun currentCatalog(): List<CatalogGame> {
        val base = activeFarm.baseUrl.trimEnd('/')
        return listOf(
            CatalogGame(
                id = "survivor-arena-g2",
                title = "Survivor Arena G2",
                subtitle = "Godot 4.7 네이티브 3D 서바이벌",
                runtime = "godot-pck",
                version = "2.1.0",
                ageRating = GameAgeRating.ALL,
                pckPathOrUrl = "$base/games/survivor-arena-g2/index.pck",
                sizeLabel = "1.9 MB (.pck 온디맨드)"
            ),
            CatalogGame(
                id = "survivor-io",
                title = "탕탕특공대 (Godot 4.7)",
                subtitle = "Godot 4.7 네이티브 로그라이크",
                runtime = "godot-pck",
                version = "1.0.0",
                ageRating = GameAgeRating.AGE_12,
                pckPathOrUrl = "$base/games/survivor-io/index.pck",
                sizeLabel = "온디맨드 .pck"
            ),
            CatalogGame(
                id = "match3-garden",
                title = "Match-3 Garden",
                subtitle = "즉시 웹플레이 퍼즐 (HTML5)",
                runtime = "web",
                version = "1.0.0",
                ageRating = GameAgeRating.ALL,
                pckPathOrUrl = "$base/games/match3-garden/index.html",
                sizeLabel = "스트리밍 웹"
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
        setContentView(buildRootLayout())
        renderTab(HubTab.HOME)

        if (!authStore.isAgeGateCompleted()) {
            AgeGateDialog.show(this) { _, _, tier, region ->
                authStore.saveAgeCompliance(tier, region)
                profile = authStore.loadOrCreateGuest()
                renderTab(activeTab)
                Toast.makeText(this, "연령 확인 완료 (${tier.name}) · Guest로 바로 플레이할 수 있습니다.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        ioExecutor.shutdownNow()
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun cardBg(fillHex: String = "#141B29", strokeHex: String = "#23304A", radiusDp: Int = 14) =
        GradientDrawable().apply {
            setColor(Color.parseColor(fillHex))
            cornerRadius = dp(radiusDp).toFloat()
            setStroke(dp(1), Color.parseColor(strokeHex))
        }

    private fun buildRootLayout(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0B0F17"))
        }

        // 1. Roblox-style Top Global Utility Bar
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#111827"))
            setPadding(dp(16), dp(12), dp(12), dp(12))
        }

        titleView = TextView(this).apply {
            text = "Play Hub"
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        topBar.addView(titleView)

        if (FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) {
            farmPillView = utilityPill("🌐 ${activeFarm.id}") {
                showFarmSelectorDialog()
            }
            topBar.addView(farmPillView)
        }
        val searchBtn = utilityPill("🔍") {
            Toast.makeText(this, "통합 검색 (게임 + @핸들 · M1 연동)", Toast.LENGTH_SHORT).show()
        }
        coinPillView = utilityPill("🪙 ${profile.coinBalance}") {
            showCoinStoreDialog()
        }
        val notifBtn = utilityPill("🔔") {
            Toast.makeText(this, "알림 피드 (친구·파티 초대·커뮤니티 · M3 연동)", Toast.LENGTH_SHORT).show()
        }
        topBar.addView(searchBtn)
        topBar.addView(coinPillView)
        topBar.addView(notifBtn)
        root.addView(topBar)

        // 2. Main Scrollable Content Host
        contentContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        root.addView(contentContainer)

        // 3. Roblox-style 5-Tab Bottom Navigation Bar (Home, Charts, Avatar, Party, More — NO Forge)
        val bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#111827"))
            setPadding(dp(4), dp(8), dp(4), dp(10))
        }
        for (tab in HubTab.values()) {
            val btn = TextView(this).apply {
                text = "${tab.icon}\n${tab.label}"
                textSize = 11f
                gravity = Gravity.CENTER
                setPadding(dp(4), dp(6), dp(4), dp(6))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener { renderTab(tab) }
            }
            navButtons[tab] = btn
            bottomBar.addView(btn)
        }
        root.addView(bottomBar)
        return root
    }

    private fun utilityPill(label: String, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        textSize = 13f
        setTextColor(Color.WHITE)
        setPadding(dp(10), dp(6), dp(10), dp(6))
        background = cardBg("#1F2937", "#334155", 16)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { leftMargin = dp(8) }
        setOnClickListener { onClick() }
    }

    private fun renderTab(tab: HubTab) {
        activeTab = tab
        titleView.text = if (tab == HubTab.HOME) "Play Hub" else tab.label
        farmPillView?.text = "🌐 ${activeFarm.id}"
        coinPillView.text = "🪙 ${profile.coinBalance}"
        for ((t, btn) in navButtons) {
            val selected = t == tab
            btn.setTextColor(if (selected) Color.parseColor("#22C55E") else Color.parseColor("#9CA3AF"))
            btn.typeface = if (selected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }
        contentContainer.removeAllViews()
        val scroll = ScrollView(this)
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
        // Guest & Age Compliance Status Strip
        val statusCard = infoCard(
            title = "${profile.displayName} (${profile.handle})",
            detail = "모드: ${if (profile.isGuest) "Guest 즉시 플레이" else "Google 계정"} · 연령: ${profile.ageTier.name} (${profile.regionCode})\n" +
                "패키지: ${applicationContext.packageName} · Godot ${BuildConfig.GODOT_ENGINE_VERSION} 내장 (Forge 미포함)"
        )
        body.addView(statusCard)

        // Roblox-style Top Friends Carousel
        body.addView(sectionTitle("친구 (Connections)"))
        val friendsScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val friendsRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val caps = AgeGatePolicy.evaluateCapabilities(profile.ageTier, profile.isGuest, profile.parentalConsentVerified)
        val friendLabels = if (caps.requiresParentalConsent) {
            listOf("🔒 보호자 동의 필요")
        } else {
            listOf("+ 친구 추가", "🟢 Alex (온라인)", "🎮 Mina (플레이 중)")
        }
        for (item in friendLabels) {
            friendsRow.addView(TextView(this).apply {
                text = item
                textSize = 12f
                setTextColor(Color.WHITE)
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = cardBg("#162033", "#2D3F61", 20)
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { rightMargin = dp(8) }
                setOnClickListener { renderTab(HubTab.PARTY) }
            })
        }
        friendsScroll.addView(friendsRow)
        body.addView(friendsScroll)

        // Continue / Recommended Games (Age-filtered)
        body.addView(sectionTitle("추천 & 온디맨드 플레이"))
        for (game in currentCatalog()) {
            body.addView(gameCard(game))
        }
    }

    private fun buildChartsTab(body: LinearLayout) {
        body.addView(sectionTitle("인기 차트 · 필터 (장르 / 터치 / 네이티브 3D)"))
        for ((idx, game) in currentCatalog().withIndex()) {
            body.addView(gameCard(game, rankPrefix = "#${idx + 1} "))
        }
    }

    private fun buildAvatarTab(body: LinearLayout) {
        body.addView(sectionTitle("아바타 · 프로필 꾸미기"))
        body.addView(
            infoCard(
                title = "현재 장착 아바타: 기본 플레이어 (${profile.handle})",
                detail = "보유 Play Coin: ${profile.coinBalance}\n프레임 · 칭호 · 업적 배지 · 게임별 보유 엔타이틀먼트(인벤토리)가 여기에 통합 표시됩니다."
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
        body.addView(sectionTitle("더보기 (런타임 전용 · Forge 제외)"))
        body.addView(
            infoCard(
                title = "앱 & 빌드 정보",
                detail = "Package ID: ${applicationContext.packageName}\n" +
                    "Build Stage: ${BuildConfig.BUILD_STAGE} · Branch: ${BuildConfig.PLAYHUB_BRANCH}\n" +
                    "Engine: Godot ${BuildConfig.GODOT_ENGINE_VERSION} (template_release 내장)\n" +
                    "Active Farm: ${activeFarm.label} (${activeFarm.baseUrl})\n" +
                    "온디맨드 .pck 캐시: ${cachedMb} MiB (APK 내장 스타터: 0종)"
            )
        )
        if (FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) {
            body.addView(actionButton("🌐 Farm 서버군 선택 (${activeFarm.id})", primary = false) {
                showFarmSelectorDialog()
            })
        }
        body.addView(actionButton("🪙 Play Coin & Play Pass 스토어") { showCoinStoreDialog() })
        body.addView(actionButton("🧹 온디맨드 .pck 캐시 정리") {
            File(filesDir, "games").deleteRecursively()
            renderTab(HubTab.MORE)
            Toast.makeText(this, "로컬 .pck 캐시를 정리했습니다.", Toast.LENGTH_SHORT).show()
        })
        body.addView(actionButton("🔐 연령 확인 상태 보기") {
            Toast.makeText(this, "연령 티어: ${profile.ageTier.name} (${profile.regionCode})", Toast.LENGTH_SHORT).show()
        })
    }

    private fun sectionTitle(text: String): TextView = TextView(this).apply {
        this.text = text
        textSize = 15f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(Color.parseColor("#F3F4F6"))
        setPadding(0, dp(16), 0, dp(8))
    }

    private fun infoCard(title: String, detail: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = cardBg()
        setPadding(dp(14), dp(12), dp(14), dp(12))
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
            setPadding(0, dp(4), 0, 0)
        })
    }

    private fun gameCard(game: CatalogGame, rankPrefix: String = ""): View {
        val allowed = AgeGatePolicy.canPlayRating(profile.ageTier, game.ageRating, profile.parentalConsentVerified)
        val cached = game.runtime == "godot-pck" && PckPackageManager.cachedPckFile(filesDir, game.id, game.version).isFile
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = cardBg("#141B29", if (allowed) "#24344D" else "#4C1D24")
            setPadding(dp(14), dp(12), dp(14), dp(12))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(10) }

            addView(TextView(context).apply {
                text = "$rankPrefix${game.title}  [${game.ageRating.code}]"
                textSize = 15f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
            })
            addView(TextView(context).apply {
                val badge = if (cached) "✅ 로컬 캐시 완료" else game.sizeLabel
                text = "${game.subtitle} · $badge"
                textSize = 12f
                setTextColor(Color.parseColor("#94A3B8"))
                setPadding(0, dp(4), 0, dp(8))
            })
            addView(actionButton(if (allowed) "▶ 플레이" else "🔒 연령 등급 제한 (${game.ageRating.code})", allowed) {
                if (!allowed) {
                    Toast.makeText(context, "현재 연령 티어(${profile.ageTier.name})에서는 이용할 수 없는 등급입니다.", Toast.LENGTH_SHORT).show()
                } else {
                    openExperienceDetail(game)
                }
            })
        }
    }

    private fun actionButton(label: String, primary: Boolean = true, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        setPadding(dp(12), dp(10), dp(12), dp(10))
        background = cardBg(if (primary) "#16A34A" else "#374151", if (primary) "#22C55E" else "#4B5563", 10)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(6) }
        setOnClickListener { onClick() }
    }

    private fun openExperienceDetail(game: CatalogGame) {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(game.title)
            .setMessage(
                "${game.subtitle}\n" +
                    "런타임: ${game.runtime} · 버전: ${game.version} · 등급: ${game.ageRating.code}\n" +
                    "용량: ${game.sizeLabel}"
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

        // Godot 4.7.2 on-demand .pck download (or reuse local verified cache)
        val cached = PckPackageManager.cachedPckFile(filesDir, game.id, game.version)
        if (cached.isFile) {
            startGodotIsolated(game, cached)
            return
        }

        Toast.makeText(this, "${game.title} .pck 다운로드 중...", Toast.LENGTH_SHORT).show()
        ioExecutor.execute {
            runCatching {
                PckPackageManager.downloadAndCache(
                    filesDir = filesDir,
                    gameId = game.id,
                    version = game.version,
                    downloadUrl = game.pckPathOrUrl
                )
            }.onSuccess { pckFile ->
                runOnUiThread { startGodotIsolated(game, pckFile) }
            }.onFailure { err ->
                runOnUiThread {
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

    private fun showFarmSelectorDialog() {
        if (!FarmServerRegistry.isSelectorAllowed(BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR)) return
        val presets = FarmServerRegistry.PRESET_FARMS
        val labels = (presets.map { "${it.label}\n${it.baseUrl}" } + "✏️ 직접 입력 (Custom / Tunnel URL)").toTypedArray()
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("🌐 Farm 서버군 선택 (${BuildConfig.BUILD_STAGE})")
            .setItems(labels) { _, idx ->
                if (idx < presets.size) {
                    val chosen = presets[idx]
                    FarmServerRegistry.saveSelection(this, BuildConfig.BUILD_STAGE, BuildConfig.ALLOW_FARM_SELECTOR, chosen.id)
                    activeFarm = chosen
                    renderTab(activeTab)
                    Toast.makeText(this, "Farm 전환: ${chosen.label}", Toast.LENGTH_SHORT).show()
                } else {
                    showCustomFarmInputDialog()
                }
            }
            .setNegativeButton("취소", null)
            .show()
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
                    activeFarm = FarmServerRegistry.loadActive(
                        this,
                        BuildConfig.BUILD_STAGE,
                        BuildConfig.ALLOW_FARM_SELECTOR,
                        BuildConfig.HUB_BASE_URL
                    )
                    renderTab(activeTab)
                    Toast.makeText(this, "Custom Farm 적용: ${activeFarm.baseUrl}", Toast.LENGTH_SHORT).show()
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
