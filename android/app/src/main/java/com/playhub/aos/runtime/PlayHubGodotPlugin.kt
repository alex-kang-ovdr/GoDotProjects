package com.playhub.aos.runtime

import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot
import org.json.JSONObject
import java.util.UUID

/**
 * Runtime-only Godot 4.7.2 Android Plugin ("PlayHubBridge").
 * Exposes Save, Profile, IAP, Social/Party, and Lifecycle bridge calls to GDScript
 * without exposing authentication tokens or Forge editor APIs to the game process.
 */
class PlayHubGodotPlugin(
    godot: Godot,
    private val gameId: String,
    private val pckPath: String,
    private val displayName: String,
    private val handle: String,
    private val isGuest: Boolean,
    private val ageTier: String,
    private val locale: String,
    private val roomCode: String = "",
    private val matchRoomId: String = "",
    private val wsUrl: String = "",
    private val launchMode: String = "game",
    private val avatarInitJson: String = "{}",
    private val onOpenOverlay: (tab: String) -> Unit,
    private val onStudioReady: ((softwareFallback: Boolean) -> Unit)? = null,
    private val onEquipApplied: ((seq: Int) -> Unit)? = null,
    private val onStudioMetrics: ((fps: Float, frameMs: Float) -> Unit)? = null
) : GodotPlugin(godot) {

    companion object {
        val SIGNAL_BRIDGE_RESPONSE = SignalInfo(
            "bridge_response",
            String::class.java,
            Boolean::class.javaObjectType,
            String::class.java
        )
        val SIGNAL_BRIDGE_EVENT = SignalInfo(
            "bridge_event",
            String::class.java,
            String::class.java
        )

        /**
         * Single Source of Truth for the multiplayer handoff payload consumed by both
         * GodotPlayerActivity (user://playhub_mp.json) and PlayHubBridge.get_multiplayer_config().
         */
        fun buildMultiplayerConfigJson(
            wsUrl: String,
            gameId: String,
            roomCode: String,
            displayName: String,
            platform: String = "android"
        ): String {
            if (wsUrl.isBlank()) return ""
            return JSONObject().apply {
                put("wsUrl", wsUrl)
                put("gameId", gameId)
                put("roomId", roomCode)
                put("displayName", displayName)
                put("platform", platform)
            }.toString()
        }
    }

    override fun getPluginName(): String = "PlayHubBridge"

    override fun getPluginSignals(): Set<SignalInfo> = setOf(
        SIGNAL_BRIDGE_RESPONSE,
        SIGNAL_BRIDGE_EVENT
    )

    @UsedByGodot
    fun get_launch_pck_path(): String = pckPath

    @UsedByGodot
    fun get_launch_mode(): String = launchMode

    @UsedByGodot
    fun get_avatar_init_json(): String = avatarInitJson

    @UsedByGodot
    fun notify_studio_ready(softwareFallback: Boolean) {
        onStudioReady?.let { cb -> runOnHostThread { cb(softwareFallback) } }
    }

    @UsedByGodot
    fun notify_equip_applied(seq: Int) {
        onEquipApplied?.let { cb -> runOnHostThread { cb(seq) } }
    }

    @UsedByGodot
    fun notify_studio_metrics(fps: Float, frameMs: Float) {
        onStudioMetrics?.let { cb -> runOnHostThread { cb(fps, frameMs) } }
    }

    @UsedByGodot
    fun get_room_code(): String = roomCode

    @UsedByGodot
    fun get_match_room_id(): String = matchRoomId

    @UsedByGodot
    fun get_multiplayer_config(): String =
        buildMultiplayerConfigJson(wsUrl, gameId, roomCode, displayName, "android")

    @UsedByGodot
    fun get_profile(): String {
        return JSONObject().apply {
            put("gameId", gameId)
            put("displayName", displayName)
            put("handle", handle)
            put("isGuest", isGuest)
            put("ageTier", ageTier)
            put("locale", locale)
            put("roomCode", roomCode)
            put("matchRoomId", matchRoomId)
            put("runtime", "android-godot-4.7.2")
        }.toString()
    }

    @UsedByGodot
    fun ready(): String {
        val reqId = newReqId()
        emitResponse(reqId, true, JSONObject().put("status", "ready").toString())
        return reqId
    }

    @UsedByGodot
    fun save_load(slot: String): String {
        val reqId = newReqId()
        // M1 wires this to Main Process AIDL PlayHubBrokerService (/api/saves/:gameId)
        emitResponse(reqId, true, JSONObject().put("slot", slot).put("payload", JSONObject.NULL).toString())
        return reqId
    }

    @UsedByGodot
    fun save_write(slot: String, payloadJson: String): String {
        val reqId = newReqId()
        emitResponse(reqId, true, JSONObject().put("slot", slot).put("bytes", payloadJson.length).toString())
        return reqId
    }

    @UsedByGodot
    fun iap_purchase(sku: String, idempotencyKey: String): String {
        val reqId = newReqId()
        runOnHostThread { onOpenOverlay("store") }
        emitResponse(
            reqId,
            true,
            JSONObject()
                .put("sku", sku)
                .put("idempotencyKey", idempotencyKey)
                .put("state", "OVERLAY_OPENED")
                .toString()
        )
        return reqId
    }

    @UsedByGodot
    fun social_open_overlay(tab: String): String {
        val reqId = newReqId()
        runOnHostThread { onOpenOverlay(tab) }
        emitResponse(reqId, true, JSONObject().put("tab", tab).toString())
        return reqId
    }

    fun dispatchHostEvent(eventType: String, payloadJson: String = "{}") {
        emitSignal(SIGNAL_BRIDGE_EVENT, eventType, payloadJson)
    }

    private fun emitResponse(reqId: String, ok: Boolean, payloadJson: String) {
        emitSignal(SIGNAL_BRIDGE_RESPONSE, reqId, ok, payloadJson)
    }

    private fun newReqId(): String = "ph-${UUID.randomUUID().toString().replace("-", "").take(12)}"
}
