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
            roomCode: String? = null
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
        }
    }

    private var bridgePlugin: PlayHubGodotPlugin? = null
    private var gameId: String = "unknown"
    private var gameTitle: String = "Play Hub Game"

    override fun onCreate(savedInstanceState: Bundle?) {
        gameId = intent.getStringExtra(EXTRA_GAME_ID) ?: "unknown"
        gameTitle = intent.getStringExtra(EXTRA_GAME_TITLE) ?: gameId
        super.onCreate(savedInstanceState)
        attachUniversalOverlayButton()
    }

    override fun getCommandLine(): MutableList<String> {
        val args = mutableListOf<String>()
        val pckPath = intent.getStringExtra(EXTRA_PCK_PATH).orEmpty()
        val renderDriver = intent.getStringExtra(EXTRA_RENDER_DRIVER) ?: "opengl3"
        val userDataDir = intent.getStringExtra(EXTRA_USER_DATA_DIR).orEmpty()
        val roomCode = intent.getStringExtra(EXTRA_ROOM_CODE).orEmpty()

        if (pckPath.isNotEmpty() && File(pckPath).isFile) {
            args += "--main-pack"
            args += pckPath
        }
        args += "--rendering-driver"
        args += renderDriver
        if (userDataDir.isNotEmpty()) {
            File(userDataDir).mkdirs()
            args += "--user-data-dir"
            args += userDataDir
        }
        args += "--playhub-game-id=$gameId"
        args += "--playhub-locale=${Locale.getDefault().language}"
        if (roomCode.isNotEmpty()) {
            args += "--playhub-room=$roomCode"
        }
        return args
    }

    override fun getHostPlugins(godot: Godot): Set<GodotPlugin> {
        val plugin = PlayHubGodotPlugin(
            godot = godot,
            gameId = gameId,
            displayName = intent.getStringExtra(EXTRA_DISPLAY_NAME) ?: "게스트",
            handle = intent.getStringExtra(EXTRA_HANDLE) ?: "@guest",
            isGuest = intent.getBooleanExtra(EXTRA_IS_GUEST, true),
            ageTier = intent.getStringExtra(EXTRA_AGE_TIER) ?: "UNKNOWN",
            locale = Locale.getDefault().language,
            onOpenOverlay = { tab -> showUniversalInGameMenu(tab) }
        )
        bridgePlugin = plugin
        return setOf(plugin)
    }

    private fun attachUniversalOverlayButton() {
        val root = findViewById<ViewGroup>(android.R.id.content) ?: return
        val dp = resources.displayMetrics.density
        val button = TextView(this).apply {
            text = "▶ Hub"
            textSize = 12f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding((12 * dp).toInt(), (7 * dp).toInt(), (12 * dp).toInt(), (7 * dp).toInt())
            background = GradientDrawable().apply {
                setColor(Color.argb(190, 17, 24, 39))
                cornerRadius = 18 * dp
                setStroke((1 * dp).toInt(), Color.argb(160, 34, 197, 94))
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
