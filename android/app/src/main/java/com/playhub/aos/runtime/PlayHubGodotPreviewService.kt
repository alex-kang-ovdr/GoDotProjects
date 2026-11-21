package com.playhub.aos.runtime

import android.os.Handler
import android.os.Looper
import android.os.Process
import android.util.Log
import org.godotengine.godot.service.GodotService

/**
 * Isolated single-runtime Godot 4.7.2 Preview Service (runs in android:process=":godot_runtime").
 * Reuses the exact same bundled libgodot_android.so as GodotPlayerActivity (+0 MB extra 3D engine)
 * to render live inline 3D Avatar Preview via SurfaceControlViewHost inside MainActivity's Avatar tab.
 * Terminates the isolated process cleanly on destroy so idle Hub tabs maintain <= 80 MB PSS.
 */
class PlayHubGodotPreviewService : GodotService() {

    companion object {
        private const val TAG = "PlayHubInlineGodot"
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "PlayHubGodotPreviewService onCreate pid=${Process.myPid()}")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "PlayHubGodotPreviewService onDestroy pid=${Process.myPid()} -> reclaiming :godot_runtime")
        Handler(Looper.getMainLooper()).postDelayed({
            Process.killProcess(Process.myPid())
        }, 120L)
    }
}
