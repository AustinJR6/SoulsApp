import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PERSONALITIES } from "../../constants/personalities";
import { theme } from "../../constants/theme";
import {
  ensureMicrophonePermission,
  getMicrophonePermissionSnapshot,
  openAppSettings,
} from "../../services/microphone";

export default function SettingsScreen() {
  const [micStatus, setMicStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [canAskAgain, setCanAskAgain] = useState(true);

  const refreshMicrophoneStatus = useCallback(async () => {
    try {
      const permission = await getMicrophonePermissionSnapshot();
      setMicStatus(permission.granted ? "granted" : permission.status === "denied" ? "denied" : "undetermined");
      setCanAskAgain(permission.canAskAgain);
    } catch {
      setMicStatus("undetermined");
      setCanAskAgain(true);
    }
  }, []);

  useEffect(() => {
    refreshMicrophoneStatus().catch(() => {});
  }, [refreshMicrophoneStatus]);

  const requestMicrophone = useCallback(async () => {
    await ensureMicrophonePermission({ featureLabel: "voice dictation and live voice" });
    await refreshMicrophoneStatus();
  }, [refreshMicrophoneStatus]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>System Settings</Text>
      <Text style={styles.subtitle}>Permission health and personality controls live here.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Microphone</Text>
        <Text style={styles.permissionText}>
          Status:{" "}
          <Text
            style={[
              styles.permissionValue,
              micStatus === "granted"
                ? styles.permissionGranted
                : micStatus === "denied"
                  ? styles.permissionDenied
                  : styles.permissionUnknown,
            ]}
          >
            {micStatus}
          </Text>
        </Text>
        <Text style={styles.helperText}>
          If the app does not prompt, Android may have cached a denial. Use the button below to request again or jump
          straight to system settings.
        </Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.primaryButton} onPress={() => void requestMicrophone()}>
            <Text style={styles.primaryButtonText}>{canAskAgain ? "Request Microphone" : "Review Permission"}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void openAppSettings()}>
            <Text style={styles.secondaryButtonText}>Open Settings</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personalities</Text>
        {Object.values(PERSONALITIES).map((personality) => (
          <View key={personality.id} style={styles.row}>
            <Text style={[styles.badge, { borderColor: personality.color, color: personality.color }]}>
              {personality.avatar}
            </Text>
            <View style={styles.personalityTextWrap}>
              <Text style={styles.personalityName}>{personality.name}</Text>
              <Text style={styles.personalityDescription}>{personality.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginTop: 6,
    marginBottom: 14,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  permissionText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  permissionValue: {
    fontWeight: "800",
    textTransform: "capitalize",
  },
  permissionGranted: {
    color: "#7dd3fc",
  },
  permissionDenied: {
    color: theme.colors.danger,
  },
  permissionUnknown: {
    color: "#ffb347",
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
  },
  secondaryButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    width: 36,
    height: 36,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    fontSize: 12,
    fontWeight: "700",
  },
  personalityTextWrap: {
    flex: 1,
  },
  personalityName: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  personalityDescription: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
});
