import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { Alert, Linking } from "react-native";

export interface MicrophonePermissionSnapshot {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

export async function getMicrophonePermissionSnapshot(): Promise<MicrophonePermissionSnapshot> {
  const permission = await getRecordingPermissionsAsync();
  return {
    granted: Boolean(permission.granted),
    canAskAgain: Boolean(permission.canAskAgain),
    status: String(permission.status || "undetermined"),
  };
}

export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Ignore settings deep-link failures.
  }
}

export async function ensureMicrophonePermission(options: { featureLabel?: string } = {}): Promise<boolean> {
  const permission = await requestRecordingPermissionsAsync();
  if (permission.granted) {
    return true;
  }

  const featureLabel = options.featureLabel || "voice features";

  Alert.alert(
    "Microphone Required",
    `Vessel needs microphone access to use ${featureLabel}.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Open Settings", onPress: () => void openAppSettings() },
    ]
  );
  return false;
}
