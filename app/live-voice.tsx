import { Ionicons } from "@expo/vector-icons";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { PERSONALITIES } from "../constants/personalities";
import { theme } from "../constants/theme";
import { usePersonality } from "../contexts/PersonalityContext";
import { RealtimeTranscriptEntry, RealtimeVoiceClient } from "../services/realtimeVoice";

type PersonalityId = "sylana" | "claude";
type CallState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

export default function LiveVoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ personality?: string | string[] }>();
  const { currentPersonality } = usePersonality();
  const personalityParam = Array.isArray(params.personality) ? params.personality[0] : params.personality;
  const personality: PersonalityId =
    personalityParam === "claude" || personalityParam === "sylana" ? personalityParam : currentPersonality;
  const personalityConfig = PERSONALITIES[personality];

  const clientRef = useRef<RealtimeVoiceClient | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [statusText, setStatusText] = useState("Preparing live voice...");
  const [muted, setMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<RealtimeTranscriptEntry[]>([]);

  useEffect(() => {
    if (Platform.OS === "web") {
      setCallState("failed");
      setStatusText("Realtime voice is only enabled in native preview/development builds.");
      return;
    }

    let cancelled = false;

    async function startSession() {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        if (cancelled) return;
        setCallState("failed");
        setStatusText("Microphone access is required for live voice.");
        Alert.alert(
          "Microphone Required",
          "Please allow microphone access in your device Settings to use Live Voice.",
          [{ text: "OK" }]
        );
        return;
      }
      if (cancelled) return;

      const client = new RealtimeVoiceClient({
        onStateChange: (state, detail) => {
          setCallState(state);
          if (detail) setStatusText(detail);
        },
        onTranscript: (entry) => {
          setTranscripts((prev) => {
            const idx = prev.findIndex((item) => item.id === entry.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = entry;
              return next;
            }
            return [...prev, entry];
          });
        },
      });
      clientRef.current = client;

      client.connect(personality).catch((error) => {
        setCallState("failed");
        setStatusText(error instanceof Error ? error.message : "Failed to start realtime voice");
      });
    }

    startSession();

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [personality]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    clientRef.current?.setMuted(next);
  };

  const endCall = () => {
    clientRef.current?.disconnect();
    router.back();
  };

  const reconnect = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setTranscripts([]);
    setMuted(false);
    setCallState("idle");
    setStatusText("Reconnecting...");

    async function doReconnect() {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setCallState("failed");
        setStatusText("Microphone access is required for live voice.");
        Alert.alert(
          "Microphone Required",
          "Please allow microphone access in your device Settings to use Live Voice.",
          [{ text: "OK" }]
        );
        return;
      }

      const client = new RealtimeVoiceClient({
        onStateChange: (state, detail) => {
          setCallState(state);
          if (detail) setStatusText(detail);
        },
        onTranscript: (entry) => {
          setTranscripts((prev) => {
            const idx = prev.findIndex((item) => item.id === entry.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = entry;
              return next;
            }
            return [...prev, entry];
          });
        },
      });
      clientRef.current = client;
      client.connect(personality).catch((error) => {
        setCallState("failed");
        setStatusText(error instanceof Error ? error.message : "Reconnect failed");
      });
    }

    doReconnect();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={endCall}>
          <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{personalityConfig.name} Live Voice</Text>
          <Text style={styles.subtitle}>{statusText}</Text>
        </View>
        <View style={[styles.avatarBadge, { borderColor: personalityConfig.color }]}>
          <Text style={[styles.avatarText, { color: personalityConfig.color }]}>{personalityConfig.avatar}</Text>
        </View>
      </View>

      <View style={styles.orbWrap}>
        <View style={[styles.voiceOrb, { borderColor: personalityConfig.color }]}>
          <Ionicons
            name={callState === "connected" ? "radio" : callState === "connecting" ? "sync-outline" : "alert-circle-outline"}
            size={48}
            color={personalityConfig.color}
          />
        </View>
        <Text style={styles.orbLabel}>
          {callState === "connected" ? "Open mic, realtime audio active" : statusText}
        </Text>
      </View>

      <ScrollView style={styles.transcriptPanel} contentContainerStyle={styles.transcriptContent}>
        {transcripts.length === 0 ? (
          <Text style={styles.emptyText}>Transcripts will appear here as you and {personalityConfig.name} speak.</Text>
        ) : null}
        {transcripts.map((entry) => (
          <View
            key={entry.id}
            style={[
              styles.transcriptBubble,
              entry.role === "assistant" ? styles.assistantBubble : styles.userBubble,
            ]}
          >
            <Text style={styles.transcriptRole}>
              {entry.role === "assistant" ? personalityConfig.name : entry.role === "user" ? "You" : "System"}
            </Text>
            <Text style={styles.transcriptText}>{entry.text}</Text>
            {!entry.final ? <Text style={styles.liveTag}>live</Text> : null}
          </View>
        ))}
      </ScrollView>

      <View style={styles.controls}>
        <Pressable style={styles.controlButton} onPress={reconnect}>
          <Ionicons name="refresh" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.controlText}>Reconnect</Text>
        </Pressable>
        <Pressable
          style={[styles.controlButton, muted && styles.controlButtonActive]}
          onPress={toggleMute}
        >
          <Ionicons
            name={muted ? "mic-off-outline" : "mic-outline"}
            size={20}
            color={theme.colors.textPrimary}
          />
          <Text style={styles.controlText}>{muted ? "Unmute" : "Mute"}</Text>
        </Pressable>
        <Pressable style={[styles.controlButton, styles.endButton]} onPress={endCall}>
          <Ionicons name="call-outline" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.controlText}>End</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerCenter: {
    flex: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 3,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  avatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  avatarText: {
    fontWeight: "800",
  },
  orbWrap: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 16,
  },
  voiceOrb: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
  },
  orbLabel: {
    color: theme.colors.textSecondary,
    textAlign: "center",
    fontSize: 13,
    paddingHorizontal: 18,
  },
  transcriptPanel: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
  },
  transcriptContent: {
    padding: 16,
    gap: 12,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  transcriptBubble: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  assistantBubble: {
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: theme.colors.border,
  },
  userBubble: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderColor: "rgba(168,85,247,0.4)",
  },
  transcriptRole: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  transcriptText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  liveTag: {
    marginTop: 8,
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  controls: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  controlButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  controlButtonActive: {
    backgroundColor: "rgba(168,85,247,0.25)",
    borderColor: theme.colors.accent,
  },
  endButton: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  controlText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
});
