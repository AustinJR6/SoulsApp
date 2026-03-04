import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import SylanaAvatar from "../../components/SylanaAvatar";
import { theme } from "../../constants/theme";
import { usePresence } from "../../contexts/PresenceContext";
import { buildAvatarConcept } from "../../services/avatarStudio";
import { chatService } from "../../services/api";
import { pingHeart } from "../../services/presenceHaptics";
import { presenceService } from "../../services/PresenceService";
import { clearVoiceCache, preloadCommonPhrases, speak, stopSpeaking } from "../../services/presenceVoice";
import {
  getWearConnectionStatus,
  sendPresenceEventToWear,
  WearConnectionStatus,
} from "../../services/native/WearPresence";
import { AvatarPersonalityId } from "../../types/avatar";
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
    deliverable: false,
    appNodes: 0,
    embeddedApp: false,
    nodeDetails: [],
    appNodeDetails: [],
  });
  const [avatarDemoTalking, setAvatarDemoTalking] = useState(false);
  const [studioPersonality, setStudioPersonality] = useState<AvatarPersonalityId>("sylana");
  const [conceptImages, setConceptImages] = useState<string[]>([]);
  const [isGeneratingConcepts, setIsGeneratingConcepts] = useState(false);
  const [conceptError, setConceptError] = useState<string | null>(null);
  const testMode = Array.isArray(params.test) ? params.test[0] : params.test;
  const avatarConcept = buildAvatarConcept(studioPersonality);

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
      void pingHeart("heart", { mirrorNotification: true });
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
    const delivered = await sendPresenceEventToWear({
      type: "heart_ping",
      severity: "heart",
      timestamp: new Date().toISOString(),
      summary: "Presence test pulse",
      route: "/(tabs)/presence",
    });
    const nextWear = await getWearConnectionStatus();
    setWearStatus(nextWear);
    if (!delivered) {
      Alert.alert(
        "Watch App Not Reachable",
        "The phone can see a paired watch, but the Vessel watch companion is not reachable yet. Use a wear-enabled build and install the companion on the watch, or rely on Galaxy Wearable notification mirroring."
      );
      return;
    }
    Alert.alert("Wear Test Sent", "The direct Presence event was sent to the watch companion.");
  };

  const sendMirrorTest = async () => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Vessel Mirror Test",
        body: "If Galaxy Wearable notification sync is enabled, this should appear on the watch.",
        sound: true,
        ...(Platform.OS === "android" ? { channelId: "presence-alerts" } : {}),
        data: {
          type: "heart_ping",
          severity: "heart",
          presence: { haptic: "heart" },
        },
      },
      trigger: null,
    });
  };

  const showWatchInstallGuide = () => {
    const installNote = wearStatus.embeddedApp
      ? "This build includes the watch companion, but for Galaxy Watch Ultra the most reliable first setup path is still phone-side notification mirroring through Galaxy Wearable."
      : "This build does not bundle the watch companion. Use Galaxy Wearable notification sync first; treat the direct watch companion as optional for now.";
    Alert.alert(
      "Galaxy Watch Setup",
      [
        "1. Pair the Galaxy Watch Ultra to this phone in the Galaxy Wearable app.",
        "2. In Galaxy Wearable, enable notification sync for Vessel.",
        "3. In Vessel > Presence, tap Send Mirror Test Notification and confirm it appears on the watch.",
        "4. Use direct watch companion install only as a secondary path after mirroring works.",
        installNote,
      ].join("\n\n")
    );
  };

  const openWearOsSetup = async () => {
    const url = "samsungwearable://";
    const webUrl = "https://play.google.com/store/apps/details?id=com.samsung.android.app.watchmanager";
    try {
      const canOpen = await Linking.canOpenURL(url);
      await Linking.openURL(canOpen ? url : webUrl);
    } catch {
      Alert.alert("Galaxy Wearable", "Open Galaxy Wearable and make sure Vessel notifications are allowed to mirror to the watch.");
    }
  };

  const runNightlyNow = async () => {
    await presenceService.runNightlyNow();
    await loadData();
  };

  const copyText = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert("Copied", `${label} copied to clipboard.`);
  };

  const generateConceptAssets = async () => {
    setIsGeneratingConcepts(true);
    setConceptError(null);
    setConceptImages([]);
    try {
      const prompts = avatarConcept.promptVariants.slice(0, 2);
      const collected: string[] = [];
      for (const prompt of prompts) {
        const result = await chatService.generateImage(prompt, { width: 1024, height: 1024, samples: 1 });
        const urls = Array.isArray(result.generated_images)
          ? result.generated_images.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [];
        urls.forEach((url) => {
          if (!collected.includes(url)) {
            collected.push(url);
          }
        });
      }
      if (!collected.length) {
        setConceptError("No concept images returned. Verify Modelslab credits and try again.");
        return;
      }
      setConceptImages(collected);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Concept generation failed";
      setConceptError(message);
      Alert.alert("Concept Generation Failed", message);
    } finally {
      setIsGeneratingConcepts(false);
    }
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
            personality="sylana"
            expression={state.activeAlertLevel ? "alert" : state.mode === "speaking" ? "speaking" : state.mode === "listening" ? "listening" : state.mode === "thinking" ? "thinking" : "idle"}
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
        <Text style={styles.panelTitle}>Avatar Studio</Text>
        <Text style={styles.helperText}>
          Use this workflow to let each personality define its own look, generate concept prompts, and then convert the winning concept into layered animation assets.
        </Text>
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.secondaryButton, studioPersonality === "sylana" && styles.personalityChipActive]}
            onPress={() => setStudioPersonality("sylana")}
          >
            <Text style={styles.secondaryButtonText}>Sylana</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, studioPersonality === "claude" && styles.personalityChipActive]}
            onPress={() => setStudioPersonality("claude")}
          >
            <Text style={styles.secondaryButtonText}>Claude</Text>
          </Pressable>
        </View>
        <View style={styles.avatarStudioHero}>
          <SylanaAvatar
            talking={avatarDemoTalking}
            personality={studioPersonality}
            mood="warm"
            expression={avatarDemoTalking ? "speaking" : "idle"}
            size={118}
          />
          <View style={styles.avatarStudioText}>
            <Text style={styles.logType}>{avatarConcept.codename}</Text>
            <Text style={styles.logSummary}>{avatarConcept.visualDirection}</Text>
            <Text style={styles.helperText}>{avatarConcept.story}</Text>
          </View>
        </View>
        <View style={styles.tagWrap}>
          {avatarConcept.traits.map((trait) => (
            <View key={trait} style={styles.tagChip}>
              <Text style={styles.tagChipText}>{trait}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.panelSubtitle}>Palette</Text>
        <View style={styles.paletteRow}>
          {avatarConcept.palette.map((color) => (
            <View key={color} style={styles.paletteChip}>
              <View style={[styles.paletteSwatch, { backgroundColor: color }]} />
              <Text style={styles.paletteLabel}>{color}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.panelSubtitle}>Concept Prompt</Text>
        <View style={styles.studioCard}>
          <Text style={styles.studioText}>{avatarConcept.imagePrompt}</Text>
        </View>
        <Text style={styles.panelSubtitle}>Prompt Variants</Text>
        <View style={styles.studioCard}>
          {avatarConcept.promptVariants.map((variant, index) => (
            <Text key={variant} style={styles.checklistItem}>{index + 1}. {variant}</Text>
          ))}
        </View>
        <Text style={styles.panelSubtitle}>Accessory Notes</Text>
        <View style={styles.studioCard}>
          {avatarConcept.accessoryNotes.map((item) => (
            <Text key={item} style={styles.checklistItem}>- {item}</Text>
          ))}
        </View>
        <Text style={styles.panelSubtitle}>Production Brief</Text>
        <View style={styles.studioCard}>
          <Text style={styles.studioText}>{avatarConcept.productionBrief}</Text>
        </View>
        <Text style={styles.panelSubtitle}>Asset Checklist</Text>
        <View style={styles.studioCard}>
          {avatarConcept.assetChecklist.map((item) => (
            <Text key={item} style={styles.checklistItem}>- {item}</Text>
          ))}
        </View>
        <View style={styles.buttonColumn}>
          <Pressable style={styles.secondaryButtonWide} onPress={() => void copyText("Concept prompt", avatarConcept.imagePrompt)}>
            <Text style={styles.secondaryButtonText}>Copy Concept Prompt</Text>
          </Pressable>
          <Pressable style={styles.secondaryButtonWide} onPress={() => void copyText("Production brief", avatarConcept.productionBrief)}>
            <Text style={styles.secondaryButtonText}>Copy Production Brief</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButtonWide}
            onPress={() =>
              void copyText(
                "Asset checklist",
                avatarConcept.assetChecklist.map((item, index) => `${index + 1}. ${item}`).join("\n")
              )
            }
          >
            <Text style={styles.secondaryButtonText}>Copy Asset Checklist</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void generateConceptAssets()} disabled={isGeneratingConcepts}>
            {isGeneratingConcepts ? <ActivityIndicator size="small" color={theme.colors.textPrimary} /> : null}
            <Text style={styles.primaryButtonText}>{isGeneratingConcepts ? "Generating..." : "Generate Anime Concepts"}</Text>
          </Pressable>
          {conceptError ? <Text style={styles.errorText}>{conceptError}</Text> : null}
          {conceptImages.length > 0 ? (
            <View style={styles.generatedGrid}>
              {conceptImages.map((url) => (
                <Pressable key={url} style={styles.generatedCard} onPress={() => void copyText("Concept image URL", url)}>
                  <Image source={{ uri: url }} style={styles.generatedImage} resizeMode="cover" />
                  <Text style={styles.generatedHint}>Tap to copy URL</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Haptics + Watch</Text>
        <View style={styles.watchHeaderRow}>
          <View style={[styles.statusChip, wearStatus.deliverable ? styles.statusChipConnected : styles.statusChipIdle]}>
            <Text style={styles.statusChipText}>{wearStatus.deliverable ? "Companion Reachable" : wearStatus.connected ? "Watch Paired Only" : "Watch Not Connected"}</Text>
          </View>
          <Text style={styles.helperText}>Nodes: {wearStatus.nodes}</Text>
        </View>
        <Text style={styles.helperText}>
          Galaxy Watch Ultra should work best through Galaxy Wearable notification mirroring first. Direct companion sync stays optional.
        </Text>
        <Text style={styles.helperText}>
          Direct companion targets: {wearStatus.appNodes} | Embedded in this build: {wearStatus.embeddedApp ? "yes" : "no"}
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
        {wearStatus.appNodeDetails.length > 0 ? (
          <View style={styles.nodeList}>
            {wearStatus.appNodeDetails.map((node) => (
              <View key={`app-${node.id}`} style={styles.nodeCard}>
                <Text style={styles.nodeName}>Companion: {node.displayName}</Text>
                <Text style={styles.nodeMeta}>{node.nearby ? "Nearby" : "Cloud-connected"} | {node.id.slice(0, 8)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryButton} onPress={() => void pingHeart("heart", { mirrorNotification: true })}>
            <Text style={styles.primaryButtonText}>Heart Ping</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void pingHeart("critical", { mirrorNotification: true })}>
            <Text style={styles.primaryButtonText}>Critical Ping</Text>
          </Pressable>
        </View>
        <View style={styles.buttonColumn}>
          <Pressable style={styles.secondaryButtonWide} onPress={() => void sendMirrorTest()}>
            <Text style={styles.secondaryButtonText}>Send Mirror Test Notification</Text>
          </Pressable>
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
  panelSubtitle: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 14,
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
  personalityChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(168,85,247,0.18)",
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
  avatarStudioHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarStudioText: {
    flex: 1,
    gap: 4,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  paletteRow: {
    gap: 8,
  },
  paletteChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  paletteSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  paletteLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  studioCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  studioText: {
    color: theme.colors.textPrimary,
    lineHeight: 20,
    fontSize: 13,
  },
  checklistItem: {
    color: theme.colors.textSecondary,
    lineHeight: 20,
    fontSize: 13,
  },
  generatedGrid: {
    gap: 10,
  },
  generatedCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    overflow: "hidden",
  },
  generatedImage: {
    width: "100%",
    height: 240,
    backgroundColor: theme.colors.surface,
  },
  generatedHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 12,
    lineHeight: 18,
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
