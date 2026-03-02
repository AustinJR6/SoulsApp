import * as Haptics from "expo-haptics";
import { ping as nativeHeartPing } from "./native/HeartPing";
import { sendPresenceEventToWear } from "./native/WearPresence";

export async function pingHeart(level: "heart" | "critical" = "heart") {
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
}
