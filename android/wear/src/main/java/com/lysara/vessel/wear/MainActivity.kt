package com.lysara.vessel.wear

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.widget.TextView
import androidx.core.view.isVisible
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {
  private lateinit var pulseView: TextView
  private lateinit var severityView: TextView
  private lateinit var summaryView: TextView
  private lateinit var timestampView: TextView
  private lateinit var metaView: TextView
  private lateinit var hintView: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    pulseView = findViewById(R.id.pulse_badge)
    severityView = findViewById(R.id.severity_chip)
    summaryView = findViewById(R.id.summary_text)
    timestampView = findViewById(R.id.timestamp_text)
    metaView = findViewById(R.id.meta_text)
    hintView = findViewById(R.id.hint_text)
  }

  override fun onResume() {
    super.onResume()
    renderState()
  }

  private fun renderState() {
    val prefs = getSharedPreferences("presence_wear", MODE_PRIVATE)
    val severity = prefs.getString("last_severity", "idle").orEmpty().lowercase(Locale.US)
    val summary = prefs.getString("last_summary", "Waiting for presence events from your phone.").orEmpty()
    val eventType = prefs.getString("last_type", "standby").orEmpty()
    val route = prefs.getString("last_route", "/(tabs)/presence").orEmpty()
    val lastTimestamp = prefs.getString("last_timestamp", "").orEmpty()
    val receivedAt = prefs.getLong("received_at_ms", 0L)

    val palette = when (severity) {
      "critical" -> Triple("#FF6B6B", "#3A1118", "CRITICAL")
      "heart" -> Triple("#FF7A95", "#34131F", "HEART")
      "warning" -> Triple("#FFB347", "#3C2710", "WARNING")
      "info" -> Triple("#8FD3FF", "#102B3B", "INFO")
      else -> Triple("#8E9AAF", "#17202B", "STANDBY")
    }

    val accentColor = Color.parseColor(palette.first)
    val chipColor = Color.parseColor(palette.second)

    pulseView.text = palette.third.take(1)
    pulseView.setBackgroundColor(accentColor)
    severityView.text = palette.third
    severityView.setBackgroundColor(chipColor)
    severityView.setTextColor(accentColor)
    summaryView.text = summary

    timestampView.text =
      if (lastTimestamp.isNotBlank()) {
        "Event time: $lastTimestamp"
      } else if (receivedAt > 0L) {
        "Received: ${formatTimestamp(receivedAt)}"
      } else {
        "No synced event yet"
      }

    metaView.text = "Type: $eventType | Route: $route"
    hintView.isVisible = receivedAt == 0L
    hintView.text = if (receivedAt == 0L) {
      "Open the phone app and trigger Heart Ping from Presence."
    } else {
      "Watch is listening for the next presence event."
    }
  }

  private fun formatTimestamp(value: Long): String {
    return SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date(value))
  }
}
