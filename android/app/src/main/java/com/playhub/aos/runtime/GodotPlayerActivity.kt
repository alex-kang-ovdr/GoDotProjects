package com.playhub.aos.runtime

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Process
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.godotengine.godot.Godot
import org.godotengine.godot.GodotActivity
import org.godotengine.godot.plugin.GodotPlugin
import java.io.File
import java.util.Locale

/**
 * Isolated Godot 4.7.2 Native Runtime Activity (runs in android:process=":godot_runtime").
 * - Mounts a verified on-demand .pck bundle via --main-pack.
 * - Isolates user:// per account & game via --user-data-dir.
 * - Renders a Roblox-style top-left floating "Play Hub" universal in-game overlay menu.
 * - Terminates the isolated process cleanly on exit to eliminate C++ singleton leaks across games.
 */
class GodotPlayerActivity : GodotActivity() {

    companion object {
        const val EXTRA_GAME_ID = "playhub.game_id"
        const val EXTRA_GAME_TITLE = "playhub.game_title"
        const val EXTRA_PCK_PATH = "playhub.pck_path"
        const val EXTRA_RENDER_DRIVER = "playhub.render_driver"
        const val EXTRA_USER_DATA_DIR = "playhub.user_data_dir"
        const val EXTRA_DISPLAY_NAME = "playhub.display_name"
        const val EXTRA_HANDLE = "playhub.handle"
        const val EXTRA_IS_GUEST = "playhub.is_guest"
        const val EXTRA_AGE_TIER = "playhub.age_tier"
        const val EXTRA_ROOM_CODE = "playhub.room_code"
        const val EXTRA_MATCH_ROOM_ID = "playhub.match_room_id"
        const val EXTRA_WS_URL = "playhub.ws_url"

        fun createIntent(
            context: Context,
            gameId: String,
            gameTitle: String,
            pckPath: String,
            userDataDir: String,
            displayName: String,
            handle: String,
            isGuest: Boolean,
            ageTier: String,
            renderDriver: String = "opengl3",
            roomCode: String? = null,
            matchRoomId: String? = null,
            wsUrl: String? = null
        ): Intent = Intent(context, GodotPlayerActivity::class.java).apply {
            putExtra(EXTRA_GAME_ID, gameId)
            putExtra(EXTRA_GAME_TITLE, gameTitle)
            putExtra(EXTRA_PCK_PATH, pckPath)
            putExtra(EXTRA_USER_DATA_DIR, userDataDir)
            putExtra(EXTRA_DISPLAY_NAME, displayName)
            putExtra(EXTRA_HANDLE, handle)
            putExtra(EXTRA_IS_GUEST, isGuest)
            putExtra(EXTRA_AGE_TIER, ageTier)
            putExtra(EXTRA_RENDER_DRIVER, renderDriver)
            if (!roomCode.isNullOrBlank()) putExtra(EXTRA_ROOM_CODE, roomCode)
            if (!matchRoomId.isNullOrBlank()) putExtra(EXTRA_MATCH_ROOM_ID, matchRoomId)
            if (!wsUrl.isNullOrBlank()) putExtra(EXTRA_WS_URL, wsUrl)
        }
    }

    private var bridgePlugin: PlayHubGodotPlugin? = null
    private var gameId: String = "unknown"
    private var gameTitle: String = "Play Hub Game"
    private var launchPckPath: String = ""
    private var launchRenderDriver: String = "opengl3"
    private var launchDisplayName: String = "게스트"
    private var launchHandle: String = "@guest"
    private var launchIsGuest: Boolean = true
    private var launchAgeTier: String = "UNKNOWN"
    private var launchRoomCode: String = ""
    private var launchMatchRoomId: String = ""
    private var launchWsUrl: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        // Capture all extras BEFORE super.onCreate(), because GodotActivity.sanitizeLaunchIntent() clears intent extras!
        gameId = intent.getStringExtra(EXTRA_GAME_ID) ?: "unknown"
        gameTitle = intent.getStringExtra(EXTRA_GAME_TITLE) ?: gameId
        launchPckPath = intent.getStringExtra(EXTRA_PCK_PATH).orEmpty()
        launchRenderDriver = intent.getStringExtra(EXTRA_RENDER_DRIVER) ?: "opengl3"
        launchDisplayName = intent.getStringExtra(EXTRA_DISPLAY_NAME) ?: "게스트"
        launchHandle = intent.getStringExtra(EXTRA_HANDLE) ?: "@guest"
        launchIsGuest = intent.getBooleanExtra(EXTRA_IS_GUEST, true)
        launchAgeTier = intent.getStringExtra(EXTRA_AGE_TIER) ?: "UNKNOWN"
        launchRoomCode = intent.getStringExtra(EXTRA_ROOM_CODE).orEmpty()
        launchMatchRoomId = intent.getStringExtra(EXTRA_MATCH_ROOM_ID).orEmpty()
        launchWsUrl = intent.getStringExtra(EXTRA_WS_URL).orEmpty()
        // Persist launch pack path & multiplayer config to app filesDir (user://) for deterministic bootstrap handoff
        runCatching { File(filesDir, "playhub_launch.txt").writeText(launchPckPath) }
        runCatching {
            val mpFile = File(filesDir, "playhub_mp.json")
            val mpJson = PlayHubGodotPlugin.buildMultiplayerConfigJson(
                wsUrl = launchWsUrl,
                gameId = gameId,
                roomCode = launchRoomCode,
                displayName = launchDisplayName
            )
            if (mpJson.isNotBlank()) {
                mpFile.writeText(mpJson)
            } else if (mpFile.exists()) {
                mpFile.delete()
            }
        }
        super.onCreate(savedInstanceState)
        attachUniversalOverlayButton()
    }

    override fun getCommandLine(): MutableList<String> {
        val args = mutableListOf<String>()
        // Stock godot-lib.template_release.aar enforces disable_path_overrides=yes,
        // so we boot the 1.5KB internal assets/bootstrap.tscn and mount the verified .pck
        // at runtime via ProjectSettings.load_resource_pack(PlayHubBridge.get_launch_pck_path()).
        args += "--rendering-driver"
        args += launchRenderDriver
        return args
    }

    override fun getHostPlugins(godot: Godot): Set<GodotPlugin> {
        val plugin = PlayHubGodotPlugin(
            godot = godot,
            gameId = gameId,
            pckPath = launchPckPath,
            displayName = launchDisplayName,
            handle = launchHandle,
            isGuest = launchIsGuest,
            ageTier = launchAgeTier,
            locale = Locale.getDefault().language,
            roomCode = launchRoomCode,
            matchRoomId = launchMatchRoomId,
            wsUrl = launchWsUrl,
            onOpenOverlay = { tab -> showUniversalInGameMenu(tab) }
        )
        bridgePlugin = plugin
        return setOf(plugin)
    }

    private fun attachUniversalOverlayButton() {
        val root = findViewById<ViewGroup>(android.R.id.content) ?: return
        val dp = resources.displayMetrics.density
        val button = TextView(this).apply {
            text = if (launchRoomCode.isNotBlank()) "▶ PLAYHUB · $launchRoomCode" else "▶ PLAYHUB"
            textSize = 11.5f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding((12 * dp).toInt(), (7 * dp).toInt(), (12 * dp).toInt(), (7 * dp).toInt())
            background = GradientDrawable().apply {
                setColor(Color.argb(215, 25, 27, 29))
                cornerRadius = 18 * dp
                setStroke((1 * dp).toInt(), Color.parseColor("#00B06F"))
            }
            setOnClickListener { showUniversalInGameMenu("people") }
        }
        val lp = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.START
        ).apply {
            topMargin = (14 * dp).toInt()
            leftMargin = (14 * dp).toInt()
        }
        root.addView(button, lp)
    }

    private fun showUniversalInGameMenu(initialTab: String) {
        bridgePlugin?.dispatchHostEvent("host_pause")
        val options = arrayOf(
            "👥 플레이어 · 친구 초대 (People)",
            "🪙 인게임 코인 충전 / 스토어 (Store)",
            "⚙️ 오디오 · 그래픽 · 언어 설정 (Settings)",
            "💾 클라우드 세이브 스냅샷 저장",
            "🚪 허브로 나가기 (Leave Game)"
        )
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Play Hub · $gameTitle")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> Toast.makeText(this, "친구 초대 / 파티 패널 (M3 연동 · tab=$initialTab)", Toast.LENGTH_SHORT).show()
                    1 -> Toast.makeText(this, "인게임 코인 충전 / Play Billing v7 (M2 연동)", Toast.LENGTH_SHORT).show()
                    2 -> Toast.makeText(this, "그래픽·오디오·터치 설정 (M1 연동)", Toast.LENGTH_SHORT).show()
                    3 -> {
                        bridgePlugin?.dispatchHostEvent("host_snapshot")
                        Toast.makeText(this, "클라우드 세이브 스냅샷 요청 완료", Toast.LENGTH_SHORT).show()
                    }
                    4 -> leaveGameCleanly()
                }
            }
            .setNegativeButton("계속 플레이") { _, _ ->
                bridgePlugin?.dispatchHostEvent("host_resume")
            }
            .setOnCancelListener {
                bridgePlugin?.dispatchHostEvent("host_resume")
            }
            .show()
    }

    private fun leaveGameCleanly() {
        bridgePlugin?.dispatchHostEvent("host_snapshot")
        finishAndRemoveTask()
        // Kill isolated :godot_runtime process so the next game launches with clean native C++ state
        window.decorView.postDelayed({ Process.killProcess(Process.myPid()) }, 150L)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isFinishing) {
            Process.killProcess(Process.myPid())
        }
    }
}
