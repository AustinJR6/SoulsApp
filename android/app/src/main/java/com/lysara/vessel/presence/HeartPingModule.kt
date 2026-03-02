package com.lysara.vessel.presence

import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactMethod

class HeartPingModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "HeartPingModule"

  @ReactMethod
  fun ping(pattern: ReadableArray?, promise: Promise) {
    try {
      val vibrator = reactContext.getSystemService(Vibrator::class.java)
      if (vibrator == null || !vibrator.hasVibrator()) {
        promise.resolve(false)
        return
      }
      val vibrationPattern = toPattern(pattern)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createWaveform(vibrationPattern, -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(vibrationPattern, -1)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_HEART_PING", error)
    }
  }

  private fun toPattern(pattern: ReadableArray?): LongArray {
    if (pattern == null || pattern.size() == 0) {
      return longArrayOf(0, 30, 200, 15)
    }
    val values = LongArray(pattern.size())
    for (index in 0 until pattern.size()) {
      values[index] = pattern.getDouble(index).toLong()
    }
    return values
  }
}
