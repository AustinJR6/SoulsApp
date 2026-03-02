import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import SylanaAvatar from "../../components/SylanaAvatar";
import { theme } from "../../constants/theme";
import { usePresence } from "../../contexts/PresenceContext";
import { pingHeart } from "../../services/presenceHaptics";
import { presenceService } from "../../services/PresenceService";
import { clearVoiceCache, preloadCommonPhrases, speak, stopSpeaking } from "../../services/presenceVoice";
import { getWearConnectionStatus, sendPresenceEventToWear } from "../../services/native/WearPresence";
import { PresenceLog } from "../../types/presence";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function PresenceScreen() {
  const params = useLocalSearchParams<{ test?: string | string[] }>();
  const { state } = usePresence();
  const [logs, setLogs] = useState<PresenceLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [wearStatus, setWearStatus] = useState<{ connected: boolean; nodes: number }>({ connected: false, nodes: 0 });
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
    });
    const nextWear = await getWearConnectionStatus();
    setWearStatus(nextWear);
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
        <Text style={styles.helperText}>Wear connected: {wearStatus.connected ? "yes" : "no"} | nodes: {wearStatus.nodes}</Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryButton} onPress={() => void pingHeart("heart")}>
            <Text style={styles.primaryButtonText}>Heart Ping</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void pingHeart("critical")}>
            <Text style={styles.primaryButtonText}>Critical Ping</Text>
          </Pressable>
        </View>
        <Pressable style={styles.secondaryButtonWide} onPress={() => void sendWearTest()}>
          <Text style={styles.secondaryButtonText}>Send Wear Test Event</Text>
        </Pressable>
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
