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
    private val displayName: String,
    private val handle: String,
    private val isGuest: Boolean,
    private val ageTier: String,
    private val locale: String,
    private val onOpenOverlay: (tab: String) -> Unit
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
    }

    override fun getPluginName(): String = "PlayHubBridge"

    override fun getPluginSignals(): Set<SignalInfo> = setOf(
        SIGNAL_BRIDGE_RESPONSE,
        SIGNAL_BRIDGE_EVENT
    )

    @UsedByGodot
    fun get_profile(): String {
        return JSONObject().apply {
            put("gameId", gameId)
            put("displayName", displayName)
            put("handle", handle)
            put("isGuest", isGuest)
            put("ageTier", ageTier)
            put("locale", locale)
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
