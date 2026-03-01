import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Bubble, BubbleProps, IMessage } from "react-native-gifted-chat";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";
import { usePersonality } from "../contexts/PersonalityContext";
import { playAssistantVoice, stopAssistantVoice } from "../services/voice";

export const ChatMessage: React.FC<BubbleProps<IMessage>> = (props) => {
  const { personalityConfig } = usePersonality();
  const [isPlaying, setIsPlaying] = React.useState(false);
  const messageText = String(props.currentMessage?.text || "");
  const canPlayVoice =
    props.position === "left" &&
    props.currentMessage?.user?.name === personalityConfig.name &&
    messageText.trim().length > 0;

  const handlePlayVoice = React.useCallback(async () => {
    if (!canPlayVoice) {
      return;
    }
    if (isPlaying) {
      stopAssistantVoice();
      setIsPlaying(false);
      return;
    }

    try {
      setIsPlaying(true);
      await playAssistantVoice(messageText, personalityConfig.id);
    } catch (error) {
      console.warn("Voice playback failed", error);
    } finally {
      setIsPlaying(false);
    }
  }, [canPlayVoice, isPlaying, messageText, personalityConfig.id]);

  return (
    <View>
      <Bubble
        {...props}
        wrapperStyle={{
          right: {
            backgroundColor: personalityConfig.color,
            borderWidth: 1,
            borderColor: "#c084fc",
          },
          left: {
            backgroundColor: theme.colors.bubbleIncoming,
            borderWidth: 1,
            borderColor: theme.colors.border,
          },
        }}
        textStyle={{
          right: {
            color: theme.colors.textPrimary,
          },
          left: {
            color: theme.colors.textPrimary,
          },
        }}
        renderMessageText={(messageProps) => (
          <View style={styles.textWrap}>
            <Text selectable selectionColor={theme.colors.accent} style={styles.messageText}>
              {messageProps.currentMessage.text}
            </Text>
          </View>
        )}
      />
      {canPlayVoice ? (
        <Pressable style={styles.voiceButton} onPress={handlePlayVoice}>
          <Ionicons
            name={isPlaying ? "stop-circle-outline" : "volume-high-outline"}
            size={16}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.voiceButtonText}>{isPlaying ? "Stop voice" : "Play voice"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  textWrap: {
    marginVertical: 5,
    marginHorizontal: 10,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.textPrimary,
  },
  voiceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    marginLeft: 6,
  },
  voiceButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
});
