import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { GiftedChat, IMessage } from "react-native-gifted-chat";
import { ChatMessage } from "../../components/ChatMessage";
import { PersonalityToggle } from "../../components/PersonalityToggle";
import { TypingIndicator } from "../../components/TypingIndicator";
import { PERSONALITIES } from "../../constants/personalities";
import { usePersonality } from "../../contexts/PersonalityContext";
import { API_URL, chatService } from "../../services/api";
import { storage } from "../../services/storage";
import { Personality } from "../../types";

const SYSTEM_USER_ID = 2;
const USER = { _id: 1, name: "Elias" };

const getGreeting = (personality: Personality["id"]) =>
  personality === "sylana"
    ? "Hi baby, I'm here. What's on your mind?"
    : "Hey bro. What do you want to work on?";

const createGreeting = (personality: Personality["id"]): IMessage => ({
  _id: `${personality}-greeting`,
  text: getGreeting(personality),
  createdAt: new Date(),
  user: {
    _id: SYSTEM_USER_ID,
    name: PERSONALITIES[personality].name,
    avatar: PERSONALITIES[personality].avatar,
  },
});

export default function ChatScreen() {
  const [historyByPersonality, setHistoryByPersonality] = useState<Record<Personality["id"], IMessage[]>>({
    sylana: [createGreeting("sylana")],
    claude: [createGreeting("claude")],
  });
  const [isTyping, setIsTyping] = useState(false);
  const { currentPersonality, personalityConfig } = usePersonality();

  useEffect(() => {
    setHistoryByPersonality((prev) => {
      if (prev[currentPersonality]?.length) {
        return prev;
      }
      return {
        ...prev,
        [currentPersonality]: [createGreeting(currentPersonality)],
      };
    });
  }, [currentPersonality]);

  const messages = useMemo(
    () => historyByPersonality[currentPersonality] ?? [],
    [currentPersonality, historyByPersonality]
  );

  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      const userMessage = newMessages[0];
      if (!userMessage) {
        return;
      }

      setHistoryByPersonality((prev) => ({
        ...prev,
        [currentPersonality]: GiftedChat.append(prev[currentPersonality] ?? [], newMessages),
      }));

      setIsTyping(true);

      try {
        const savedThreadId = await storage.getThreadId();
        const parsedThreadId =
          savedThreadId && !Number.isNaN(Number(savedThreadId))
            ? Number(savedThreadId)
            : savedThreadId;
        const response = await chatService.sendMessage(
          userMessage.text,
          currentPersonality,
          parsedThreadId || null
        );

        if (response.thread_id) {
          await storage.setThreadId(response.thread_id);
        }

        const aiMessage: IMessage = {
          _id: Math.random().toString(),
          text: response.response,
          createdAt: new Date(),
          user: {
            _id: SYSTEM_USER_ID,
            name: personalityConfig.name,
            avatar: personalityConfig.avatar,
          },
        };

        setHistoryByPersonality((prev) => ({
          ...prev,
          [currentPersonality]: GiftedChat.append(prev[currentPersonality] ?? [], [aiMessage]),
        }));
      } catch (error) {
        let details = `Could not reach backend at ${API_URL}. Check API URL and network, then try again.`;

        if (error instanceof Error) {
          details = `Backend request failed via ${API_URL}: ${error.message}`;
        }

        console.error("Chat error:", details, error);
        const errorMessage: IMessage = {
          _id: `error-${Date.now()}`,
          text: details,
          createdAt: new Date(),
          user: {
            _id: SYSTEM_USER_ID,
            name: "System",
          },
        };
        setHistoryByPersonality((prev) => ({
          ...prev,
          [currentPersonality]: GiftedChat.append(prev[currentPersonality] ?? [], [errorMessage]),
        }));
      } finally {
        setIsTyping(false);
      }
    },
    [currentPersonality, personalityConfig.avatar, personalityConfig.name]
  );

  return (
    <View style={styles.container}>
      <PersonalityToggle />
      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={USER}
        isTyping={isTyping}
        textInputProps={{ placeholder: "Type a message..." }}
        renderBubble={(props) => <ChatMessage {...props} />}
        renderFooter={() => (isTyping ? <TypingIndicator /> : null)}
      />
      {Platform.OS === "android" && <KeyboardAvoidingView behavior="padding" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
