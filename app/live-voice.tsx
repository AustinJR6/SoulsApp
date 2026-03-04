import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import SylanaAvatar from "../components/SylanaAvatar";
import { PERSONALITIES } from "../constants/personalities";
import { theme } from "../constants/theme";
import { usePresence } from "../contexts/PresenceContext";
import { usePersonality } from "../contexts/PersonalityContext";
import { ensureMicrophonePermission } from "../services/microphone";
import { storage } from "../services/storage";
import { RealtimeTranscriptEntry, RealtimeVoiceClient } from "../services/realtimeVoice";
import { AvatarExpression, LiveVoiceMode } from "../types/avatar";

type PersonalityId = "sylana" | "claude";
type CallState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

export default function LiveVoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ personality?: string | string[] }>();
  const { currentPersonality } = usePersonality();
  const { state: presenceState, setMode } = usePresence();
  const personalityParam = Array.isArray(params.personality) ? params.personality[0] : params.personality;
  const personality: PersonalityId =
    personalityParam === "claude" || personalityParam === "sylana" ? personalityParam : currentPersonality;
  const personalityConfig = PERSONALITIES[personality];

  const clientRef = useRef<RealtimeVoiceClient | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [statusText, setStatusText] = useState("Preparing live voice...");
  const [muted, setMuted] = useState(false);
  const [voiceMode, setVoiceMode] = useState<LiveVoiceMode>("hands_free");
  const [pushHeld, setPushHeld] = useState(false);
  const [transcripts, setTranscripts] = useState<RealtimeTranscriptEntry[]>([]);
  const activeAssistantEntry = [...transcripts].reverse().find((entry) => entry.role === "assistant");
  const avatarExpression: AvatarExpression =
    presenceState.activeAlertLevel
      ? "alert"
      : !!activeAssistantEntry && activeAssistantEntry.final === false
        ? "speaking"
        : pushHeld || (callState === "connected" && statusText.toLowerCase().includes("listening"))
          ? "listening"
          : callState === "connecting" || statusText.toLowerCase().includes("thinking")
            ? "thinking"
            : "idle";
  const avatarTalking = avatarExpression === "speaking";

  useEffect(() => {
    storage.getLiveVoiceMode().then(setVoiceMode).catch(() => {});
  }, []);

  useEffect(() => {
    if (callState === "connected") {
      if (avatarExpression === "speaking") {
        setMode("speaking");
      } else if (avatarExpression === "thinking") {
        setMode("thinking");
      } else if (voiceMode === "push_to_talk" && avatarExpression === "idle") {
        setMode("idle");
      } else {
        setMode("listening");
      }
      return;
    }
    if (callState === "connecting") {
      setMode("thinking");
      return;
    }
    if (presenceState.activeAlertLevel) {
      setMode("alert");
      return;
    }
    setMode("idle");
  }, [avatarExpression, callState, muted, presenceState.activeAlertLevel, setMode, voiceMode]);

  const connectClient = useCallback(
    async (mode: LiveVoiceMode) => {
      const granted = await ensureMicrophonePermission({ featureLabel: "live voice" });
      if (!granted) {
        setCallState("failed");
        setStatusText("Microphone access is required for live voice.");
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
      setMuted(mode === "push_to_talk");
      await client.connect(personality, mode);
    },
    [personality]
  );

  useEffect(() => {
    if (Platform.OS === "web") {
      setCallState("failed");
      setStatusText("Realtime voice is only enabled in native preview/development builds.");
      return;
    }

    let cancelled = false;

    connectClient(voiceMode).catch((error) => {
      if (cancelled) return;
      setCallState("failed");
      setStatusText(error instanceof Error ? error.message : "Failed to start realtime voice");
    });

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
      setMode("idle");
    };
  }, [connectClient, personality, setMode, voiceMode]);

  const toggleMute = () => {
    if (voiceMode === "push_to_talk") {
      return;
    }
    const next = !muted;
    setMuted(next);
    clientRef.current?.setMuted(next);
  };

  const toggleVoiceMode = async (nextMode: LiveVoiceMode) => {
    if (nextMode === voiceMode) {
      return;
    }
    setVoiceMode(nextMode);
    setPushHeld(false);
    await storage.setLiveVoiceMode(nextMode);
  };

  const endCall = () => {
    clientRef.current?.disconnect();
    router.back();
  };

  const reconnect = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setTranscripts([]);
    setMuted(voiceMode === "push_to_talk");
    setCallState("idle");
    setStatusText("Reconnecting...");
    connectClient(voiceMode).catch((error) => {
      setCallState("failed");
      setStatusText(error instanceof Error ? error.message : "Reconnect failed");
    });
  };

  const handlePushToTalkStart = () => {
    if (voiceMode !== "push_to_talk" || callState !== "connected") {
      return;
    }
    setPushHeld(true);
    clientRef.current?.beginPushToTalk();
  };

  const handlePushToTalkEnd = () => {
    if (voiceMode !== "push_to_talk") {
      return;
    }
    setPushHeld(false);
    clientRef.current?.endPushToTalk();
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
        <SylanaAvatar
          talking={avatarTalking}
          mood={presenceState.activeAlertLevel ? "alert" : "warm"}
          personality={personality}
          expression={avatarExpression}
          size={196}
        />
        <Text style={styles.orbLabel}>
          {callState === "connected"
            ? voiceMode === "push_to_talk"
              ? "Push to talk mode. Hold the button below, then release to send."
              : "Hands-free mode. Realtime audio is active."
            : statusText}
        </Text>
      </View>

      <View style={styles.modePanel}>
        <Text style={styles.modeLabel}>Voice Mode</Text>
        <View style={styles.modeSwitcher}>
          <Pressable
            style={[styles.modeChip, voiceMode === "hands_free" && styles.modeChipActive]}
            onPress={() => void toggleVoiceMode("hands_free")}
          >
            <Text style={styles.modeChipText}>Hands-Free</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, voiceMode === "push_to_talk" && styles.modeChipActive]}
            onPress={() => void toggleVoiceMode("push_to_talk")}
          >
            <Text style={styles.modeChipText}>Push to Talk</Text>
          </Pressable>
        </View>
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

      {voiceMode === "push_to_talk" ? (
        <Pressable
          style={[styles.pushToTalkButton, pushHeld && styles.pushToTalkButtonActive]}
          onPressIn={handlePushToTalkStart}
          onPressOut={handlePushToTalkEnd}
        >
          <Ionicons name={pushHeld ? "radio-button-on" : "mic"} size={22} color={theme.colors.textPrimary} />
          <Text style={styles.pushToTalkText}>{pushHeld ? "Release to Send" : "Hold to Talk"}</Text>
        </Pressable>
      ) : null}

      <View style={styles.controls}>
        <Pressable style={styles.controlButton} onPress={reconnect}>
          <Ionicons name="refresh" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.controlText}>Reconnect</Text>
        </Pressable>
        <Pressable
          style={[styles.controlButton, muted && styles.controlButtonActive, voiceMode === "push_to_talk" && styles.controlButtonDisabled]}
          onPress={toggleMute}
          disabled={voiceMode === "push_to_talk"}
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
  orbLabel: {
    color: theme.colors.textSecondary,
    textAlign: "center",
    fontSize: 13,
    paddingHorizontal: 18,
  },
  modePanel: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 10,
  },
  modeLabel: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  modeSwitcher: {
    flexDirection: "row",
    gap: 10,
  },
  modeChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    paddingVertical: 12,
    alignItems: "center",
  },
  modeChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  modeChipText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
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
  pushToTalkButton: {
    marginTop: 14,
    marginBottom: 4,
    minHeight: 72,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pushToTalkButtonActive: {
    backgroundColor: "rgba(168,85,247,0.28)",
    borderColor: theme.colors.accent,
  },
  pushToTalkText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
    fontSize: 15,
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
  controlButtonDisabled: {
    opacity: 0.46,
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
