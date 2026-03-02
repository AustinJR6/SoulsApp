package com.lysara.vessel.wear

import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject
import java.nio.charset.StandardCharsets

class WearPresenceListenerService : WearableListenerService() {
  override fun onMessageReceived(messageEvent: MessageEvent) {
    if (messageEvent.path != "/presence/event") {
      super.onMessageReceived(messageEvent)
      return
    }

    val payload = try {
      JSONObject(String(messageEvent.data, StandardCharsets.UTF_8))
    } catch (_: Exception) {
      JSONObject()
    }
    val summary = payload.optString("summary", "Presence event received")
    val severity = payload.optString("severity", "heart")
    val eventType = payload.optString("type", "heart_ping")
    val route = payload.optString("route", "/(tabs)/presence")
    val timestamp = payload.optString("timestamp", "")

    getSharedPreferences("presence_wear", MODE_PRIVATE)
      .edit()
      .putString("last_summary", summary)
      .putString("last_severity", severity)
      .putString("last_type", eventType)
      .putString("last_route", route)
      .putString("last_timestamp", timestamp)
      .putLong("received_at_ms", System.currentTimeMillis())
      .apply()

    val pattern =
      if (severity == "critical") longArrayOf(0, 60, 180, 40, 180, 40)
      else longArrayOf(0, 30, 200, 15)

    val vibrator = getSystemService(Vibrator::class.java)
    if (vibrator != null && vibrator.hasVibrator()) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(pattern, -1)
      }
    }
  }
}
