package com.playhub.aos.runtime

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.playhub.aos.R
import com.playhub.aos.ui.AvatarCatalog
import com.playhub.aos.ui.AvatarCosmeticItem
import com.playhub.aos.ui.AvatarItemThumbView
import com.playhub.aos.ui.VoxelAvatarView
import org.godotengine.godot.Godot
import org.godotengine.godot.GodotActivity
import org.godotengine.godot.plugin.GodotPlugin
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Single-Runtime Godot 4.7.2 3D Avatar Studio Activity (runs in android:process=":godot_runtime").
 * - Reuses the single bundled libgodot_android.so (+0 MB extra 3D engine).
 * - Sticky top 46% real 3D Godot Viewport + bottom 54% Native Android Stitch Wardrobe Sheet (zero SurfaceView scroll flash).
 * - Zero-Blank UX: shows instant VoxelAvatarView placeholder until Godot emits frame_post_draw, then cross-fades out.
 * - Logs exact TTID, TTFD, Equip Bridge-to-Render latency, and live FPS for 5-axis verification.
 * - Terminates isolated :godot_runtime cleanly on exit so Main Hub idle memory stays <= 80 MB PSS.
 */
class GodotAvatarStudioActivity : GodotActivity() {

    companion object {
        private const val TAG = "PlayHubAvatarBench"
        const val EXTRA_EQUIPPED_CSV = "playhub.avatar.equipped_csv"
        const val EXTRA_ACCENT_HEX = "playhub.avatar.accent_hex"
        const val EXTRA_DISPLAY_NAME = "playhub.avatar.display_name"
        const val EXTRA_HANDLE = "playhub.avatar.handle"
        const val EXTRA_LAUNCH_ELAPSED_MS = "playhub.avatar.launch_elapsed_ms"

        const val RESULT_EQUIPPED_CSV = "playhub.avatar.result.equipped_csv"
        const val RESULT_ACCENT_HEX = "playhub.avatar.result.accent_hex"
        const val RESULT_SAVED = "playhub.avatar.result.saved"

        fun createIntent(
            context: Context,
            equippedIds: Set<String>,
            accentHex: String,
            displayName: String,
            handle: String
        ): Intent = Intent(context, GodotAvatarStudioActivity::class.java).apply {
            putExtra(EXTRA_EQUIPPED_CSV, equippedIds.joinToString(","))
            putExtra(EXTRA_ACCENT_HEX, accentHex)
            putExtra(EXTRA_DISPLAY_NAME, displayName)
            putExtra(EXTRA_HANDLE, handle)
            putExtra(EXTRA_LAUNCH_ELAPSED_MS, SystemClock.elapsedRealtime())
        }
    }

    private var bridgePlugin: PlayHubGodotPlugin? = null
    private val equippedIds = linkedSetOf("i1", "i2")
    private var accentHex: String = "#00B06F"
    private var displayName: String = "Player"
    private var handle: String = "@guest"
    private var selectedCategory: String = "all"
    private var savedConfirmed: Boolean = false

    private var launchStartElapsedMs: Long = 0L
    private var onCreateStartMs: Long = 0L
    private val equipSeqCounter = AtomicInteger(0)
    private val equipSentTimes = ConcurrentHashMap<Int, Pair<String, Long>>()
    private var lastEquipLatencyMs: Long = -1L
    private var lastFps: Float = 0f
    private var isSoftwareGpuFallback: Boolean = false

    private var placeholderOverlay: FrameLayout? = null
    private var placeholderAvatarView: VoxelAvatarView? = null
    private var telemetryPill: TextView? = null
    private var equippedCountPill: TextView? = null
    private var saveButton: TextView? = null
    private var sheetContainer: LinearLayout? = null

    private data class CardBinding(
        val item: AvatarCosmeticItem,
        val container: LinearLayout,
        val checkBadge: TextView,
        val priceBadge: TextView?,
        val statusLabel: TextView
    )
    private val cardBindings = mutableListOf<CardBinding>()
    private val swatchBindings = mutableMapOf<String, View>()

    private val accentOptions = listOf(
        "#00B06F" to "Play Green",
        "#142C25" to "Evergreen",
        "#2563EB" to "Cobalt",
        "#7C3AED" to "Violet",
        "#D97706" to "Amber"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        onCreateStartMs = SystemClock.elapsedRealtime()
        // Capture extras BEFORE super.onCreate() because GodotActivity clears launch intent extras
        launchStartElapsedMs = intent.getLongExtra(EXTRA_LAUNCH_ELAPSED_MS, onCreateStartMs)
        val csv = intent.getStringExtra(EXTRA_EQUIPPED_CSV).orEmpty()
        if (csv.isNotBlank()) {
            equippedIds.clear()
            csv.split(",").map { it.trim() }.filter { it.isNotEmpty() }.forEach { equippedIds.add(it) }
        }
        accentHex = intent.getStringExtra(EXTRA_ACCENT_HEX)?.takeIf { it.startsWith("#") && it.length == 7 } ?: "#00B06F"
        displayName = intent.getStringExtra(EXTRA_DISPLAY_NAME) ?: "Player"
        handle = intent.getStringExtra(EXTRA_HANDLE) ?: "@guest"

        val initJson = JSONObject()
            .put("equipped", equippedIds.joinToString(","))
            .put("accent", accentHex)
            .toString()
        runCatching {
            File(filesDir, "playhub_launch_mode.txt").writeText("avatar_studio")
            File(filesDir, "playhub_avatar_init.json").writeText(initJson)
        }

        super.onCreate(savedInstanceState)
        attachStudioOverlayUi()

        val ttidMs = SystemClock.elapsedRealtime() - launchStartElapsedMs
        Log.i(TAG, "PLAYHUB_BENCH_TTID ttid_ms=$ttidMs pid=${Process.myPid()}")
    }

    override fun getCommandLine(): MutableList<String> = mutableListOf(
        "--rendering-driver", "opengl3"
    )

    override fun getHostPlugins(godot: Godot): Set<GodotPlugin> {
        val initJson = JSONObject()
            .put("equipped", equippedIds.joinToString(","))
            .put("accent", accentHex)
            .toString()
        val plugin = PlayHubGodotPlugin(
            godot = godot,
            gameId = "avatar-studio",
            pckPath = "",
            displayName = displayName,
            handle = handle,
            isGuest = true,
            ageTier = "TEEN_MINOR",
            locale = Locale.getDefault().language,
            launchMode = "avatar_studio",
            avatarInitJson = initJson,
            onOpenOverlay = {},
            onStudioReady = { swFallback -> handleGodotFirstFrame(swFallback) },
            onEquipApplied = { seq -> handleEquipApplied(seq) },
            onStudioMetrics = { fps, frameMs -> handleStudioMetrics(fps, frameMs) }
        )
        bridgePlugin = plugin
        return setOf(plugin)
    }

    private fun handleGodotFirstFrame(softwareFallback: Boolean) {
        isSoftwareGpuFallback = softwareFallback
        val ttfdMs = SystemClock.elapsedRealtime() - launchStartElapsedMs
        Log.i(TAG, "PLAYHUB_BENCH_TTFD ttfd_ms=$ttfdMs sw_fallback=$softwareFallback pid=${Process.myPid()}")
        if (!softwareFallback) {
            placeholderOverlay?.let { ph ->
                ph.animate()
                    .alpha(0f)
                    .setDuration(180L)
                    .withEndAction { ph.visibility = View.GONE }
                    .start()
            }
        }
        updateTelemetryText()
    }

    private fun handleEquipApplied(seq: Int) {
        val meta = equipSentTimes.remove(seq) ?: return
        val latencyMs = (SystemClock.elapsedRealtime() - meta.second).coerceAtLeast(1L)
        lastEquipLatencyMs = latencyMs
        Log.i(TAG, "PLAYHUB_BENCH_EQUIP seq=$seq item=${meta.first} latency_ms=$latencyMs")
        updateTelemetryText()
    }

    private fun handleStudioMetrics(fps: Float, frameMs: Float) {
        lastFps = fps
        Log.i(TAG, String.format(Locale.US, "PLAYHUB_BENCH_FPS fps=%.1f frame_ms=%.2f", fps, frameMs))
        updateTelemetryText()
    }

    private fun updateTelemetryText() {
        val fpsText = if (lastFps > 0f) "${lastFps.toInt()}fps" else "3D 준비"
        val eqText = if (lastEquipLatencyMs >= 0L) " · 교체 ${lastEquipLatencyMs}ms" else ""
        val swText = if (isSoftwareGpuFallback) " · SW" else ""
        telemetryPill?.text = "Godot 4.7.2 · $fpsText$eqText$swText"
    }

    private fun attachStudioOverlayUi() {
        val root = findViewById<ViewGroup>(android.R.id.content) ?: return
        val screenH = resources.displayMetrics.heightPixels
        val topViewportH = (screenH * 0.46f).toInt()

        val overlayRoot = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // 1. Zero-Blank Instant Placeholder covering top 46% until Godot emits frame_post_draw
        val phAvatar = VoxelAvatarView(this, portraitMode = false).apply {
            this.equippedIds = this@GodotAvatarStudioActivity.equippedIds.toSet()
            this.accentColorHex = this@GodotAvatarStudioActivity.accentHex
        }
        placeholderAvatarView = phAvatar
        val placeholder = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#111315"))
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, topViewportH, Gravity.TOP)
            addView(phAvatar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        placeholderOverlay = placeholder
        overlayRoot.addView(placeholder)

        // 2. Top Studio Header Bar (floating over top sticky 3D stage)
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(36), dp(14), dp(8))
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
            )
            // Back Button
            addView(FrameLayout(context).apply {
                background = roundedBg("#CC191B1D", "#2E3338", 999)
                layoutParams = LinearLayout.LayoutParams(dp(38), dp(38)).apply { rightMargin = dp(10) }
                addView(ImageView(context).apply {
                    setImageResource(R.drawable.ic_arrow_back)
                    setColorFilter(Color.WHITE)
                }, FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER))
                setOnClickListener { exitStudio(saved = savedConfirmed) }
            })
            // Title + Engine Reuse Badge
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                addView(TextView(context).apply {
                    text = "3D 아바타 스튜디오"
                    textSize = 16.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                })
                val pill = TextView(context).apply {
                    text = "Godot 4.7.2 · 3D 로딩 중..."
                    textSize = 10.5f
                    typeface = Typeface.MONOSPACE
                    setTextColor(Color.parseColor("#00E290"))
                }
                telemetryPill = pill
                addView(pill)
            })
            // Save Primary Button
            val saveBtn = TextView(context).apply {
                text = "저장"
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#081C15"))
                background = roundedBg("#00B06F", null, 8)
                setPadding(dp(16), dp(8), dp(16), dp(8))
                setOnClickListener {
                    savedConfirmed = true
                    text = "✓ 저장됨"
                    Toast.makeText(context, "Godot 3D 아바타 스타일을 저장했습니다.", Toast.LENGTH_SHORT).show()
                    exitStudio(saved = true)
                }
            }
            saveButton = saveBtn
            addView(saveBtn)
        }
        overlayRoot.addView(topBar)

        // 3. Stage Corner Pills (just above the bottom native sheet seam)
        val stagePillsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), 0, dp(14), dp(10))
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
            ).apply {
                topMargin = (topViewportH - dp(40)).coerceAtLeast(dp(96))
            }
            addView(TextView(context).apply {
                text = "360° 드래그 회전 · 단일 런타임"
                textSize = 10.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#D1D5DB"))
                background = roundedBg("#CC111315", "#2E3338", 999)
                setPadding(dp(10), dp(4), dp(10), dp(4))
            })
            addView(View(context).apply { layoutParams = LinearLayout.LayoutParams(0, dp(1), 1f) })
            val countPill = TextView(context).apply {
                text = "● ${equippedIds.size}개 착용 중"
                textSize = 11f
                typeface = Typeface.MONOSPACE
                setTextColor(Color.parseColor("#00E290"))
                background = roundedBg("#CC111315", "#2E3338", 999)
                setPadding(dp(10), dp(4), dp(10), dp(4))
            }
            equippedCountPill = countPill
            addView(countPill)
        }
        overlayRoot.addView(stagePillsRow)

        // 4. Bottom 54% Native Android Stitch Wardrobe & Shop Sheet (never overlaps/clips SurfaceView scroll!)
        val sheetBg = GradientDrawable().apply {
            setColor(Color.parseColor("#181B1E"))
            cornerRadii = floatArrayOf(
                dp(20).toFloat(), dp(20).toFloat(),
                dp(20).toFloat(), dp(20).toFloat(),
                0f, 0f, 0f, 0f
            )
            setStroke(dp(1), Color.parseColor("#2E3338"))
        }
        val bottomSheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = sheetBg
            isClickable = true // Consume touches inside sheet so Godot turntable doesn't spin while scrolling wardrobe
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                screenH - topViewportH,
                Gravity.BOTTOM
            )
        }
        sheetContainer = bottomSheet
        rebuildWardrobeSheet()
        overlayRoot.addView(bottomSheet)

        root.addView(overlayRoot)
    }

    private fun rebuildWardrobeSheet() {
        val sheet = sheetContainer ?: return
        sheet.removeAllViews()
        cardBindings.clear()
        swatchBindings.clear()

        // Drag Handle Indicator
        sheet.addView(View(this).apply {
            background = roundedBg("#3F454D", null, 999)
            layoutParams = LinearLayout.LayoutParams(dp(38), dp(4)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = dp(8)
                bottomMargin = dp(10)
            }
        })

        // Theme Accent Swatches
        val swatchRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), 0, dp(16), dp(10))
            addView(TextView(context).apply {
                text = "테마 컬러"
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#A1A8B0"))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            for ((hex, _) in accentOptions) {
                val swatch = View(context).apply {
                    layoutParams = LinearLayout.LayoutParams(dp(24), dp(24)).apply { leftMargin = dp(8) }
                    setOnClickListener {
                        accentHex = hex
                        savedConfirmed = false
                        saveButton?.text = "저장"
                        placeholderAvatarView?.accentColorHex = hex
                        dispatchEquipToGodot("accent:$hex")
                        refreshSelectionVisualsInPlace()
                    }
                }
                swatchBindings[hex] = swatch
                addView(swatch)
            }
        }
        sheet.addView(swatchRow)

        // Category Filter Chips
        val chipScroll = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        val chipRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), 0, dp(16), dp(10))
            for ((catId, catLabel) in AvatarCatalog.CATEGORIES) {
                val active = selectedCategory == catId
                addView(TextView(context).apply {
                    text = catLabel
                    textSize = 12.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor(if (active) "#081C15" else "#A1A8B0"))
                    background = roundedBg(
                        fillHex = if (active) "#00B06F" else "#1E2226",
                        strokeHex = if (active) null else "#2E3338",
                        radiusDp = 999
                    )
                    setPadding(dp(14), dp(7), dp(14), dp(7))
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply { rightMargin = dp(8) }
                    setOnClickListener {
                        if (selectedCategory != catId) {
                            selectedCategory = catId
                            rebuildWardrobeSheet()
                        }
                    }
                })
            }
        }
        chipScroll.addView(chipRow)
        sheet.addView(chipScroll)

        // Scrollable 2-Column Native Wardrobe & Shop Grid
        val scroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
            isVerticalScrollBarEnabled = false
        }
        val grid = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(2), dp(16), dp(20))
        }
        val items = AvatarCatalog.ITEMS.filter { selectedCategory == "all" || it.category == selectedCategory }
        var i = 0
        while (i < items.size) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = dp(10) }
            }
            row.addView(wardrobeCard(items[i]))
            row.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(10), dp(1)) })
            if (i + 1 < items.size) {
                row.addView(wardrobeCard(items[i + 1]))
            } else {
                row.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0, dp(1), 1f) })
            }
            grid.addView(row)
            i += 2
        }
        scroll.addView(grid)
        sheet.addView(scroll)
        refreshSelectionVisualsInPlace()
    }

    private fun refreshSelectionVisualsInPlace() {
        // Zero view teardown/re-inflation on equip or accent tap (eliminates UI-thread jank)
        for ((hex, view) in swatchBindings) {
            val active = accentHex.equals(hex, ignoreCase = true)
            view.background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor(hex))
                if (active) setStroke(dp(2), Color.WHITE) else setStroke(dp(1), Color.parseColor("#2E3338"))
            }
        }
        for (b in cardBindings) {
            val isEquipped = equippedIds.contains(b.item.id)
            b.container.background = roundedBg(
                fillHex = "#1E2226",
                strokeHex = if (isEquipped) "#00B06F" else "#2E3338",
                radiusDp = 12
            )
            b.checkBadge.visibility = if (isEquipped) View.VISIBLE else View.GONE
            b.priceBadge?.visibility = if (!isEquipped && !b.item.owned) View.VISIBLE else View.GONE
            b.statusLabel.text = if (isEquipped) "착용 중" else if (b.item.owned) "착용" else "3D 시착"
            b.statusLabel.setTextColor(Color.parseColor(if (isEquipped) "#00E290" else if (b.item.owned) "#D1D5DB" else "#FFC83D"))
        }
    }

    private fun wardrobeCard(item: AvatarCosmeticItem): View {
        val checkBadge = TextView(this).apply {
            text = "✓"
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#081C15"))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#00B06F"))
            }
        }
        val priceBadge: TextView? = if (!item.owned) {
            TextView(this).apply {
                text = "시착 · ${item.price}"
                textSize = 9.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#FFC83D"))
                background = roundedBg("#CC111315", "#2E3338", 999)
                setPadding(dp(6), dp(2), dp(6), dp(2))
            }
        } else null
        val statusLabel = TextView(this).apply {
            textSize = 10.5f
            typeface = Typeface.DEFAULT_BOLD
        }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(8), dp(8), dp(9))
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)

            val thumbFrame = FrameLayout(context).apply {
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(92))
                clipToOutline = true
                background = roundedBg("#111315", null, 8)
                addView(AvatarItemThumbView(context, item), FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ))
                addView(checkBadge, FrameLayout.LayoutParams(dp(22), dp(22), Gravity.TOP or Gravity.END).apply {
                    topMargin = dp(6)
                    rightMargin = dp(6)
                })
                if (priceBadge != null) {
                    addView(priceBadge, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
                        topMargin = dp(6)
                        rightMargin = dp(6)
                    })
                }
            }
            addView(thumbFrame)

            addView(TextView(context).apply {
                text = item.name
                textSize = 12.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                maxLines = 1
                setPadding(dp(2), dp(7), dp(2), dp(2))
            })
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(2), 0, dp(2), 0)
                addView(TextView(context).apply {
                    text = item.categoryLabel
                    textSize = 10.5f
                    setTextColor(Color.parseColor("#9AA3AE"))
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                })
                addView(statusLabel)
            })

            setOnClickListener {
                if (equippedIds.contains(item.id)) {
                    equippedIds.remove(item.id)
                } else {
                    AvatarCatalog.ITEMS.filter { it.category == item.category }.forEach { equippedIds.remove(it.id) }
                    equippedIds.add(item.id)
                }
                savedConfirmed = false
                saveButton?.text = "저장"
                equippedCountPill?.text = "● ${equippedIds.size}개 착용 중"
                placeholderAvatarView?.equippedIds = equippedIds.toSet()
                dispatchEquipToGodot(item.id)
                refreshSelectionVisualsInPlace()
            }
        }
        cardBindings.add(CardBinding(item, container, checkBadge, priceBadge, statusLabel))
        return container
    }

    private fun dispatchEquipToGodot(itemId: String) {
        val seq = equipSeqCounter.incrementAndGet()
        equipSentTimes[seq] = itemId to SystemClock.elapsedRealtime()
        val payload = JSONObject()
            .put("seq", seq)
            .put("equipped", equippedIds.joinToString(","))
            .put("accent", accentHex)
            .toString()
        bridgePlugin?.dispatchHostEvent("avatar_equip", payload)
    }

    private fun exitStudio(saved: Boolean) {
        // Persist owned items only on explicit Save (shop try-on items stay preview-only unless owned)
        val ownedIds = AvatarCatalog.ITEMS.filter { it.owned }.map { it.id }.toSet()
        val finalEquipped = equippedIds.filter { ownedIds.contains(it) }.ifEmpty { listOf("i1", "i2") }
        val result = Intent().apply {
            putExtra(RESULT_EQUIPPED_CSV, finalEquipped.joinToString(","))
            putExtra(RESULT_ACCENT_HEX, accentHex)
            putExtra(RESULT_SAVED, saved)
        }
        setResult(Activity.RESULT_OK, result)
        finish()
        // Kill isolated :godot_runtime cleanly so Android OS immediately reclaims 100% of Godot memory
        window.decorView.postDelayed({ Process.killProcess(Process.myPid()) }, 180L)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        exitStudio(saved = savedConfirmed)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isFinishing) {
            window.decorView.postDelayed({ Process.killProcess(Process.myPid()) }, 120L)
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun roundedBg(fillHex: String, strokeHex: String?, radiusDp: Int): GradientDrawable =
        GradientDrawable().apply {
            setColor(Color.parseColor(fillHex))
            cornerRadius = dp(radiusDp).toFloat()
            if (strokeHex != null) setStroke(dp(1), Color.parseColor(strokeHex))
        }
}
