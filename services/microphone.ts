import { requestRecordingPermissionsAsync } from "expo-audio";
import { Alert, Linking } from "react-native";

export async function ensureMicrophonePermission(options: { featureLabel?: string } = {}): Promise<boolean> {
  const permission = await requestRecordingPermissionsAsync();
  if (permission.granted) {
    return true;
  }

  const featureLabel = options.featureLabel || "voice features";
  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      // Ignore settings deep-link failures.
    }
  };

  Alert.alert(
    "Microphone Required",
    `Vessel needs microphone access to use ${featureLabel}.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Open Settings", onPress: () => void openSettings() },
    ]
  );
  return false;
}
