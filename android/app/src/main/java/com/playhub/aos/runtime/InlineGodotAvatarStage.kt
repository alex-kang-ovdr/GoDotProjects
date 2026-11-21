package com.playhub.aos.runtime

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.SurfaceControlViewHost
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.playhub.aos.ui.VoxelAvatarView
import org.godotengine.godot.service.GodotService
import org.json.JSONObject
import java.io.File
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Inline 4:3 Godot 4.7.2 3D Avatar Preview Stage embedded directly inside MainActivity's Avatar Tab.
 * - On Android 11+ (API 30+), binds PlayHubGodotPreviewService (:godot_runtime) and embeds the live
 *   cross-process Godot 3D Surface via SurfaceControlViewHost + SurfaceView.setChildSurfacePackage.
 * - Communicates live equip/accent swaps over localhost UDP (127.0.0.1) with <25ms latency.
 * - Zero-Blank UX: shows lightweight VoxelAvatarView immediately while Godot boots; cross-fades out
 *   on hardware GPUs when Godot renders its first 3D frame (stays synced on SwiftShader SW GPUs).
 * - Calling release() destroys the remote engine and terminates :godot_runtime so idle Hub memory
 *   immediately drops back to <= 80 MB PSS.
 */
class InlineGodotAvatarStage(
    context: Context,
    initialEquipped: Set<String>,
    initialAccentHex: String,
    private val onTelemetryUpdate: ((statusLine: String) -> Unit)? = null
) : FrameLayout(context) {

    companion object {
        private const val TAG = "PlayHubAvatarBench"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val udpRecvExecutor = Executors.newSingleThreadExecutor()
    private val udpSendExecutor = Executors.newSingleThreadExecutor()
    private val released = AtomicBoolean(false)

    private var equippedIds: Set<String> = initialEquipped.toSet()
    private var accentHex: String = initialAccentHex

    private var surfaceView: SurfaceView? = null
    private var surfaceReady: Boolean = false
    private var serviceBound: Boolean = false
    private var engineInitialized: Boolean = false
    private var scvhRequested: Boolean = false
    private var serviceMessenger: Messenger? = null
    private var currentSurfacePackage: SurfaceControlViewHost.SurfacePackage? = null

    private var udpSocket: DatagramSocket? = null
    private var localUdpPort: Int = 0
    @Volatile private var godotUdpPort: Int = 0
    private val equipSeq = AtomicInteger(0)
    private val pendingEquipSentMs = ConcurrentHashMap<Int, Pair<String, Long>>()

    private val startElapsedMs = SystemClock.elapsedRealtime()
    private var isSoftwareFallback: Boolean = false
    private var lastFps: Float = 0f
    private var lastEquipMs: Long = -1L

    private val placeholderView: VoxelAvatarView
    private val enginePillLabel: TextView
    private val equippedCountLabel: TextView

    private val replyMessenger = Messenger(object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            if (released.get()) return
            when (msg.what) {
                GodotService.MSG_ENGINE_STATUS_UPDATE -> {
                    val status = msg.data.getString(GodotService.KEY_ENGINE_STATUS).orEmpty()
                    Log.i(TAG, "PLAYHUB_INLINE_STATUS status=$status")
                    when (status) {
                        GodotService.EngineStatus.INITIALIZED.name -> {
                            engineInitialized = true
                            tryAttachSurfaceControlViewHost()
                        }
                        GodotService.EngineStatus.SCVH_CREATED.name -> {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                @Suppress("DEPRECATION")
                                val pkg = msg.data.getParcelable<SurfaceControlViewHost.SurfacePackage>(
                                    GodotService.KEY_SURFACE_PACKAGE
                                )
                                if (pkg != null) {
                                    currentSurfacePackage?.release()
                                    currentSurfacePackage = pkg
                                    surfaceView?.setChildSurfacePackage(pkg)
                                    sendStartEngine()
                                }
                            }
                        }
                        GodotService.EngineStatus.STARTED.name -> {
                            updatePill()
                        }
                    }
                }
                GodotService.MSG_ENGINE_ERROR -> {
                    val err = msg.data.getString(GodotService.KEY_ENGINE_ERROR).orEmpty()
                    Log.w(TAG, "PLAYHUB_INLINE_ERROR err=$err")
                }
            }
        }
    })

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            if (released.get() || service == null) return
            serviceMessenger = Messenger(service)
            serviceBound = true
            sendInitEngine()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            serviceBound = false
            serviceMessenger = null
            engineInitialized = false
            scvhRequested = false
        }
    }

    init {
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        background = GradientDrawable().apply {
            setColor(Color.parseColor("#232629"))
            cornerRadius = dp(16).toFloat()
            setStroke(dp(1), Color.parseColor("#34383C"))
        }
        clipToOutline = true
        minimumHeight = dp(264)

        // 1. Live Cross-Process Godot SurfaceView (API 30+ SurfaceControlViewHost host)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val sv = SurfaceView(context).apply {
                setZOrderMediaOverlay(false)
                holder.addCallback(object : SurfaceHolder.Callback {
                    override fun surfaceCreated(holder: SurfaceHolder) {
                        surfaceReady = true
                        tryAttachSurfaceControlViewHost()
                    }
                    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
                        surfaceReady = width > 0 && height > 0
                        tryAttachSurfaceControlViewHost()
                    }
                    override fun surfaceDestroyed(holder: SurfaceHolder) {
                        surfaceReady = false
                    }
                })
            }
            surfaceView = sv
            addView(sv, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(264)))
        }

        // 2. Zero-Blank Instant Preview Overlay (fades out on hardware GPU when Godot emits first 3D frame)
        placeholderView = VoxelAvatarView(context, portraitMode = false).apply {
            this.equippedIds = initialEquipped
            this.accentColorHex = initialAccentHex
        }
        addView(placeholderView, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(264)))

        // 3. Top-left "360° Godot 3D 프리뷰" status badge
        enginePillLabel = TextView(context).apply {
            text = "360° Godot 4.7.2 · 준비 중"
            textSize = 10.5f
            typeface = Typeface.MONOSPACE
            setTextColor(Color.parseColor("#00E290"))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#E6111315"))
                cornerRadius = dp(999).toFloat()
                setStroke(dp(1), Color.parseColor("#34383C"))
            }
            setPadding(dp(10), dp(5), dp(11), dp(5))
        }
        addView(enginePillLabel, LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.START
        ).apply {
            topMargin = dp(12)
            leftMargin = dp(12)
        })

        // 4. Bottom-right "N개 착용 중" badge
        equippedCountLabel = TextView(context).apply {
            text = "● ${equippedIds.size}개 착용 중"
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#E6111315"))
                cornerRadius = dp(999).toFloat()
                setStroke(dp(1), Color.parseColor("#34383C"))
            }
            setPadding(dp(10), dp(5), dp(11), dp(5))
        }
        addView(equippedCountLabel, LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM or Gravity.END
        ).apply {
            bottomMargin = dp(12)
            rightMargin = dp(12)
        })

        startInlineGodotPreview()
    }

    private fun startInlineGodotPreview() {
        val ttidMs = SystemClock.elapsedRealtime() - startElapsedMs
        Log.i(TAG, "PLAYHUB_INLINE_TTID ttid_ms=$ttidMs api=${Build.VERSION.SDK_INT}")

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            enginePillLabel.text = "360° 3D 프리뷰"
            return
        }

        // Open ephemeral loopback UDP socket for <25ms cross-process equip & telemetry IPC
        runCatching {
            val sock = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
            sock.soTimeout = 500
            udpSocket = sock
            localUdpPort = sock.localPort
            startUdpListener(sock)
        }.onFailure { err ->
            Log.w(TAG, "UDP IPC init failed: ${err.message}")
        }

        // Write deterministic bootstrap handoff files into shared app filesDir (user://)
        val initJson = JSONObject()
            .put("equipped", equippedIds.joinToString(","))
            .put("accent", accentHex)
            .put("inlineMode", true)
            .put("udpPort", localUdpPort)
            .toString()
        runCatching {
            File(context.filesDir, "playhub_launch_mode.txt").writeText("avatar_studio")
            File(context.filesDir, "playhub_avatar_init.json").writeText(initJson)
        }

        // Bind isolated :godot_runtime PlayHubGodotPreviewService
        val intent = Intent(context, PlayHubGodotPreviewService::class.java)
        runCatching {
            context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        }.onFailure { err ->
            Log.e(TAG, "Failed to bind PlayHubGodotPreviewService: ${err.message}")
        }
    }

    private fun startUdpListener(sock: DatagramSocket) {
        udpRecvExecutor.execute {
            val buf = ByteArray(2048)
            while (!released.get() && !sock.isClosed) {
                try {
                    val pkt = DatagramPacket(buf, buf.size)
                    sock.receive(pkt)
                    val raw = String(pkt.data, pkt.offset, pkt.length, Charsets.UTF_8)
                    val obj = JSONObject(raw)
                    when (obj.optString("type")) {
                        "ready" -> {
                            godotUdpPort = obj.optInt("godotPort", 0)
                            val sw = obj.optBoolean("swFallback", false)
                            val ttfdMs = SystemClock.elapsedRealtime() - startElapsedMs
                            Log.i(TAG, "PLAYHUB_INLINE_TTFD ttfd_ms=$ttfdMs sw_fallback=$sw godot_udp=$godotUdpPort")
                            mainHandler.post {
                                if (released.get()) return@post
                                isSoftwareFallback = sw
                                if (!sw) {
                                    placeholderView.animate()
                                        .alpha(0f)
                                        .setDuration(180L)
                                        .withEndAction { placeholderView.visibility = View.GONE }
                                        .start()
                                }
                                // Push latest state in case user tapped an item before Godot finished booting
                                sendEquip(equippedIds, accentHex, "sync")
                                updatePill()
                            }
                        }
                        "equip_ack" -> {
                            val seq = obj.optInt("seq", -1)
                            val meta = pendingEquipSentMs.remove(seq)
                            if (meta != null) {
                                val lat = (SystemClock.elapsedRealtime() - meta.second).coerceAtLeast(1L)
                                Log.i(TAG, "PLAYHUB_INLINE_EQUIP seq=$seq item=${meta.first} latency_ms=$lat")
                                mainHandler.post {
                                    if (released.get()) return@post
                                    lastEquipMs = lat
                                    updatePill()
                                }
                            }
                        }
                        "fps" -> {
                            val fps = obj.optDouble("fps", 0.0).toFloat()
                            val fms = obj.optDouble("frameMs", 0.0).toFloat()
                            Log.i(TAG, String.format(Locale.US, "PLAYHUB_INLINE_FPS fps=%.1f frame_ms=%.2f", fps, fms))
                            mainHandler.post {
                                if (released.get()) return@post
                                lastFps = fps
                                updatePill()
                            }
                        }
                    }
                } catch (_: java.net.SocketTimeoutException) {
                    // loop cleanly checking released flag
                } catch (_: Exception) {
                    if (released.get()) break
                }
            }
        }
    }

    private fun sendInitEngine() {
        val m = serviceMessenger ?: return
        runCatching {
            val msg = Message.obtain(null, GodotService.MSG_INIT_ENGINE).apply {
                replyTo = replyMessenger
                data.putStringArray(
                    GodotService.KEY_COMMAND_LINE_PARAMETERS,
                    arrayOf("--rendering-driver", "opengl3")
                )
            }
            m.send(msg)
        }
    }

    private fun tryAttachSurfaceControlViewHost() {
        if (released.get() || !engineInitialized || !surfaceReady || scvhRequested) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val sv = surfaceView ?: return
        @Suppress("DEPRECATION")
        val token = sv.hostToken ?: return
        val disp = sv.display ?: return
        if (sv.width <= 0 || sv.height <= 0) return
        val m = serviceMessenger ?: return

        scvhRequested = true
        runCatching {
            val msg = Message.obtain(null, GodotService.MSG_WRAP_ENGINE_WITH_SCVH).apply {
                replyTo = replyMessenger
                data.putBinder(GodotService.KEY_HOST_TOKEN, token)
                data.putInt(GodotService.KEY_DISPLAY_ID, disp.displayId)
                data.putInt(GodotService.KEY_WIDTH, sv.width)
                data.putInt(GodotService.KEY_HEIGHT, sv.height)
            }
            m.send(msg)
        }.onFailure {
            scvhRequested = false
        }
    }

    private fun sendStartEngine() {
        val m = serviceMessenger ?: return
        runCatching {
            val msg = Message.obtain(null, GodotService.MSG_START_ENGINE).apply {
                replyTo = replyMessenger
            }
            m.send(msg)
        }
    }

    fun sendEquip(nextEquipped: Set<String>, nextAccentHex: String, triggerItemId: String) {
        equippedIds = nextEquipped.toSet()
        accentHex = nextAccentHex
        placeholderView.equippedIds = equippedIds
        placeholderView.accentColorHex = accentHex
        equippedCountLabel.text = "● ${equippedIds.size}개 착용 중"

        val port = godotUdpPort
        if (port <= 0 || released.get()) return
        val seq = equipSeq.incrementAndGet()
        pendingEquipSentMs[seq] = triggerItemId to SystemClock.elapsedRealtime()
        val payload = JSONObject()
            .put("type", "equip")
            .put("seq", seq)
            .put("equipped", equippedIds.joinToString(","))
            .put("accent", accentHex)
            .toString()
            .toByteArray(Charsets.UTF_8)

        udpSendExecutor.execute {
            runCatching {
                val sock = udpSocket ?: return@execute
                if (!sock.isClosed) {
                    sock.send(DatagramPacket(payload, payload.size, InetAddress.getByName("127.0.0.1"), port))
                }
            }
        }
    }

    private fun updatePill() {
        val fpsPart = if (lastFps > 0f) "${lastFps.toInt()}fps" else "3D 활성"
        val eqPart = if (lastEquipMs >= 0L) " · ${lastEquipMs}ms" else ""
        val swPart = if (isSoftwareFallback) " · SW" else ""
        val text = "Godot 4.7.2 · $fpsPart$eqPart$swPart"
        enginePillLabel.text = text
        onTelemetryUpdate?.invoke(text)
    }

    fun release() {
        if (!released.compareAndSet(false, true)) return
        runCatching {
            serviceMessenger?.send(Message.obtain(null, GodotService.MSG_DESTROY_ENGINE).apply {
                replyTo = replyMessenger
            })
        }
        if (serviceBound) {
            runCatching { context.unbindService(serviceConnection) }
            serviceBound = false
        }
        serviceMessenger = null
        currentSurfacePackage?.release()
        currentSurfacePackage = null
        runCatching { udpSocket?.close() }
        udpSocket = null
        udpRecvExecutor.shutdownNow()
        udpSendExecutor.shutdownNow()
    }
}
