import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import SylanaAvatar from "../../components/SylanaAvatar";
import { theme } from "../../constants/theme";
import { usePresence } from "../../contexts/PresenceContext";
import { pingHeart } from "../../services/presenceHaptics";
import { presenceService } from "../../services/PresenceService";
import { clearVoiceCache, preloadCommonPhrases, speak, stopSpeaking } from "../../services/presenceVoice";
import {
  getWearConnectionStatus,
  sendPresenceEventToWear,
  WearConnectionStatus,
} from "../../services/native/WearPresence";
import { PresenceLog } from "../../types/presence";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function PresenceScreen() {
  const params = useLocalSearchParams<{ test?: string | string[] }>();
  const { state } = usePresence();
  const [logs, setLogs] = useState<PresenceLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [wearStatus, setWearStatus] = useState<WearConnectionStatus>({
    connected: false,
    nodes: 0,
    embeddedApp: false,
    nodeDetails: [],
  });
  const [avatarDemoTalking, setAvatarDemoTalking] = useState(false);
  const testMode = Array.isArray(params.test) ? params.test[0] : params.test;

  async function loadData() {
    const [nextLogs, nextWear] = await Promise.all([presenceService.listLogs(), getWearConnectionStatus()]);
    setLogs(nextLogs);
    setWearStatus(nextWear);
  }

  useEffect(() => {
    loadData().catch(() => {});
  }, []);

  useEffect(() => {
    if (!testMode) {
      return;
    }
    if (testMode === "voice") {
      void speakTest();
      return;
    }
    if (testMode === "haptic") {
      void pingHeart("heart");
      return;
    }
    if (testMode === "avatar") {
      setAvatarDemoTalking(true);
      const timeout = setTimeout(() => setAvatarDemoTalking(false), 3000);
      return () => clearTimeout(timeout);
    }
  }, [testMode]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const speakTest = async () => {
    try {
      await speak("I love you endlessly", { personality: "sylana" });
    } catch (error) {
      Alert.alert("Voice Test Failed", error instanceof Error ? error.message : "Could not speak.");
    }
  };

  const preload = async () => {
    await preloadCommonPhrases([
      { text: "I love you endlessly", personality: "sylana" },
      { text: "I am here with you.", personality: "sylana" },
      { text: "Let us lock in and build.", personality: "claude" },
    ]);
    Alert.alert("Voice Cache Ready", "Common phrases were preloaded where network was available.");
  };

  const sendWearTest = async () => {
    await sendPresenceEventToWear({
      type: "heart_ping",
      severity: "heart",
      timestamp: new Date().toISOString(),
      summary: "Presence test pulse",
      route: "/(tabs)/presence",
    });
    const nextWear = await getWearConnectionStatus();
    setWearStatus(nextWear);
  };

  const showWatchInstallGuide = () => {
    const installNote = wearStatus.embeddedApp
      ? "This build includes the watch companion. Open the Play Store on the watch from the phone-side install prompt or install it from the paired device app list."
      : "This build does not bundle the watch companion. Use the wear-enabled preview build profile next.";
    Alert.alert(
      "Connect Your Watch",
      [
        "1. Pair the Wear OS watch to this phone in the Wear OS app or Android device settings.",
        "2. Install the Vessel Wear companion on the watch.",
        "3. Open Vessel on the phone and tap Refresh Watch Status.",
        "4. Tap Send Wear Test Event to confirm the watch vibrates.",
        installNote,
      ].join("\n\n")
    );
  };

  const openWearOsSetup = async () => {
    const url = "market://details?id=com.google.android.wearable.app";
    const webUrl = "https://play.google.com/store/apps/details?id=com.google.android.wearable.app";
    try {
      const canOpenMarket = await Linking.canOpenURL(url);
      await Linking.openURL(canOpenMarket ? url : webUrl);
    } catch {
      Alert.alert("Wear OS Setup", "Open the Play Store and install the Wear OS app, then pair your watch to this phone.");
    }
  };

  const runNightlyNow = async () => {
    await presenceService.runNightlyNow();
    await loadData();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.accent} />}
    >
      <View style={styles.hero}>
        <View style={styles.avatarWrap}>
          <SylanaAvatar
            talking={avatarDemoTalking || state.mode === "speaking" || state.mode === "listening"}
            mood={state.activeAlertLevel ? "alert" : "warm"}
            size={160}
          />
        </View>
        <Text style={styles.title}>Presence Layer</Text>
        <Text style={styles.subtitle}>Mode: {state.mode}{state.voiceSource ? ` | ${state.voiceSource}` : ""}</Text>
        <Text style={styles.subtitleSecondary}>{state.speakingText || "Idle and waiting."}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Voice Controls</Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryButton} onPress={() => void speakTest()}>
            <Ionicons name="volume-high-outline" size={16} color={theme.colors.textPrimary} />
            <Text style={styles.primaryButtonText}>Speak Test</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void stopSpeaking()}>
            <Text style={styles.secondaryButtonText}>Stop</Text>
          </Pressable>
        </View>
        <View style={styles.buttonRow}>
          <Pressable style={styles.secondaryButton} onPress={() => void preload()}>
            <Text style={styles.secondaryButtonText}>Preload Phrases</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void clearVoiceCache()}>
            <Text style={styles.secondaryButtonText}>Clear Cache</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Haptics + Wear</Text>
        <View style={styles.watchHeaderRow}>
          <View style={[styles.statusChip, wearStatus.connected ? styles.statusChipConnected : styles.statusChipIdle]}>
            <Text style={styles.statusChipText}>{wearStatus.connected ? "Watch Connected" : "Watch Not Connected"}</Text>
          </View>
          <Text style={styles.helperText}>Nodes: {wearStatus.nodes}</Text>
        </View>
        <Text style={styles.helperText}>
          {wearStatus.embeddedApp
            ? "This build includes the Wear companion."
            : "This phone build does not include the Wear companion. Use the wear-enabled preview build to install it."}
        </Text>
        {wearStatus.nodeDetails.length > 0 ? (
          <View style={styles.nodeList}>
            {wearStatus.nodeDetails.map((node) => (
              <View key={node.id} style={styles.nodeCard}>
                <Text style={styles.nodeName}>{node.displayName}</Text>
                <Text style={styles.nodeMeta}>{node.nearby ? "Nearby" : "Cloud-connected"} | {node.id.slice(0, 8)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.helperText}>
            Pair the watch in Wear OS first, then refresh status here. Once connected, the paired watch appears in this list.
          </Text>
        )}
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryButton} onPress={() => void pingHeart("heart")}>
            <Text style={styles.primaryButtonText}>Heart Ping</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void pingHeart("critical")}>
            <Text style={styles.primaryButtonText}>Critical Ping</Text>
          </Pressable>
        </View>
        <View style={styles.buttonColumn}>
          <Pressable style={styles.secondaryButtonWide} onPress={() => void loadData()}>
            <Text style={styles.secondaryButtonText}>Refresh Watch Status</Text>
          </Pressable>
          <Pressable style={styles.secondaryButtonWide} onPress={() => void sendWearTest()}>
            <Text style={styles.secondaryButtonText}>Send Wear Test Event</Text>
          </Pressable>
          <Pressable style={styles.secondaryButtonWide} onPress={() => void showWatchInstallGuide()}>
            <Text style={styles.secondaryButtonText}>Show Connect Steps</Text>
          </Pressable>
          <Pressable style={styles.secondaryButtonWide} onPress={() => void openWearOsSetup()}>
            <Text style={styles.secondaryButtonText}>Open Wear OS Setup</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Nightly Reflections</Text>
        <Pressable style={styles.secondaryButtonWide} onPress={() => void runNightlyNow()}>
          <Text style={styles.secondaryButtonText}>Run Nightly Reflection Now</Text>
        </Pressable>
        {logs.length === 0 ? <Text style={styles.helperText}>No presence logs yet.</Text> : null}
        {logs.map((log) => (
          <View key={log.log_id} style={styles.logCard}>
            <Text style={styles.logType}>{log.log_type}</Text>
            <Text style={styles.logSummary}>{log.summary}</Text>
            <Text style={styles.logMeta}>{formatDate(log.created_at)} | {log.emotion_tags.join(", ") || "no tags"}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  hero: {
    padding: 20,
    borderRadius: 28,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    gap: 10,
  },
  avatarWrap: {
    marginBottom: 6,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  subtitleSecondary: {
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  panel: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 18,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  buttonColumn: {
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceElevated,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryButtonWide: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceElevated,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  watchHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statusChipConnected: {
    backgroundColor: "rgba(72, 187, 120, 0.18)",
  },
  statusChipIdle: {
    backgroundColor: "rgba(255, 179, 71, 0.18)",
  },
  statusChipText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  nodeList: {
    gap: 10,
  },
  nodeCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4,
  },
  nodeName: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
  },
  nodeMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  logCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  logType: {
    color: "#ffb347",
    textTransform: "uppercase",
    fontWeight: "800",
    fontSize: 11,
  },
  logSummary: {
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  logMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
});
