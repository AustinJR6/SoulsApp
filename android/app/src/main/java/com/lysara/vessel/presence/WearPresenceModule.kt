package com.lysara.vessel.presence

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

class WearPresenceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "WearPresenceModule"

  @ReactMethod
  fun sendEvent(payload: ReadableMap, promise: Promise) {
    try {
      val json = JSONObject(payload.toHashMap()).toString().toByteArray(StandardCharsets.UTF_8)
      val nodes = Tasks.await(Wearable.getNodeClient(reactContext).connectedNodes, 5, TimeUnit.SECONDS)
      if (nodes.isEmpty()) {
        promise.resolve(false)
        return
      }
      val messageClient = Wearable.getMessageClient(reactContext)
      for (node in nodes) {
        Tasks.await(messageClient.sendMessage(node.id, "/presence/event", json), 5, TimeUnit.SECONDS)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_WEAR_SEND", error)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val nodes = Tasks.await(Wearable.getNodeClient(reactContext).connectedNodes, 5, TimeUnit.SECONDS)
      val result = Arguments.createMap().apply {
        putBoolean("connected", nodes.isNotEmpty())
        putInt("nodes", nodes.size)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("E_WEAR_STATUS", error)
    }
  }
}
