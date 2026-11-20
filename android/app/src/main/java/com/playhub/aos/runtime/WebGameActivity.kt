package com.playhub.aos.runtime

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Process
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView

/**
 * Isolated HTML5/JS Legacy Game Runtime (:web_runtime) for existing PlayHub Web games.
 */
class WebGameActivity : Activity() {

    companion object {
        const val EXTRA_GAME_ID = "playhub.web.game_id"
        const val EXTRA_GAME_TITLE = "playhub.web.game_title"
        const val EXTRA_GAME_URL = "playhub.web.game_url"

        fun createIntent(context: Context, gameId: String, gameTitle: String, url: String): Intent =
            Intent(context, WebGameActivity::class.java).apply {
                putExtra(EXTRA_GAME_ID, gameId)
                putExtra(EXTRA_GAME_TITLE, gameTitle)
                putExtra(EXTRA_GAME_URL, url)
            }
    }

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val gameId = intent.getStringExtra(EXTRA_GAME_ID) ?: "web-game"
        val gameTitle = intent.getStringExtra(EXTRA_GAME_TITLE) ?: gameId
        val gameUrl = intent.getStringExtra(EXTRA_GAME_URL) ?: "about:blank"

        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            addJavascriptInterface(PlayHubJsBridge(gameId), "PlayHubNative")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    // Block arbitrary external navigation out of the game frame
                    return true
                }
            }
            loadUrl(gameUrl)
        }
        root.addView(
            webView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )

        val dp = resources.displayMetrics.density
        val overlayBtn = TextView(this).apply {
            text = "▶ Hub"
            textSize = 12f
            setTextColor(Color.WHITE)
            setPadding((12 * dp).toInt(), (7 * dp).toInt(), (12 * dp).toInt(), (7 * dp).toInt())
            background = GradientDrawable().apply {
                setColor(Color.argb(190, 17, 24, 39))
                cornerRadius = 18 * dp
                setStroke((1 * dp).toInt(), Color.argb(160, 56, 189, 248))
            }
            setOnClickListener {
                AlertDialog.Builder(this@WebGameActivity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                    .setTitle("Play Hub · $gameTitle")
                    .setItems(arrayOf("새로고침", "허브로 나가기 (Leave)")) { _, which ->
                        if (which == 0) webView.reload()
                        else leaveCleanly()
                    }
                    .setNegativeButton("계속 플레이", null)
                    .show()
            }
        }
        root.addView(
            overlayBtn,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.START
            ).apply {
                topMargin = (14 * dp).toInt()
                leftMargin = (14 * dp).toInt()
            }
        )
        setContentView(root)
    }

    private fun leaveCleanly() {
        webView.destroy()
        finish()
        Process.killProcess(Process.myPid())
    }

    class PlayHubJsBridge(private val gameId: String) {
        @JavascriptInterface
        fun getGameId(): String = gameId
    }
}
