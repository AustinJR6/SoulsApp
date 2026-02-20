import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Bubble, BubbleProps, IMessage } from "react-native-gifted-chat";
import { theme } from "../constants/theme";
import { usePersonality } from "../contexts/PersonalityContext";

export const ChatMessage: React.FC<BubbleProps<IMessage>> = (props) => {
  const { personalityConfig } = usePersonality();

  return (
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
});
