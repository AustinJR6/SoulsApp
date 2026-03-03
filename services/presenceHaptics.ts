import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { ping as nativeHeartPing } from "./native/HeartPing";
import { sendPresenceEventToWear } from "./native/WearPresence";

export async function pingHeart(
  level: "heart" | "critical" = "heart",
  options: { mirrorNotification?: boolean } = {}
) {
  try {
    await nativeHeartPing(level === "critical" ? [0, 60, 180, 60, 180] : [0, 30, 200, 15]);
  } catch {
    // Fall through to Expo haptics.
  }

  if (level === "critical") {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } else {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }

  try {
    await sendPresenceEventToWear({
      type: "heart_ping",
      severity: level,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Ignore watch bridge failures on unsupported devices.
  }

  if (options.mirrorNotification) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: level === "critical" ? "Vessel Critical Ping" : "Vessel Heart Ping",
        body:
          level === "critical"
            ? "Critical Presence ping sent. If mirroring is enabled, your watch should alert now."
            : "Heart Presence ping sent. If mirroring is enabled, your watch should alert now.",
        sound: true,
        ...(Platform.OS === "android" ? { channelId: "presence-alerts" } : {}),
        data: {
          type: "heart_ping",
          severity: level,
          presence: { haptic: level },
        },
      },
      trigger: null,
    });
  }
}
