import React from "react";
import { Bubble, BubbleProps, IMessage } from "react-native-gifted-chat";
import { usePersonality } from "../contexts/PersonalityContext";

export const ChatMessage: React.FC<BubbleProps<IMessage>> = (props) => {
  const { personalityConfig } = usePersonality();

  return (
    <Bubble
      {...props}
      wrapperStyle={{
        right: {
          backgroundColor: personalityConfig.color,
        },
        left: {
          backgroundColor: "#f2f2f2",
        },
      }}
      textStyle={{
        right: {
          color: "#1b1b1b",
        },
      }}
    />
  );
};
