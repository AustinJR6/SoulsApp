import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GiftedChat, IMessage } from "react-native-gifted-chat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatMessage } from "../../components/ChatMessage";
import { PersonalityToggle } from "../../components/PersonalityToggle";
import { TypingIndicator } from "../../components/TypingIndicator";
import { PERSONALITIES } from "../../constants/personalities";
import { theme } from "../../constants/theme";
import { usePersonality } from "../../contexts/PersonalityContext";
import { API_URL, chatService } from "../../services/api";
import { storage } from "../../services/storage";
import { ChatProject, ChatThread, ChatWorkspace, Personality } from "../../types";

const SYSTEM_USER_ID = 2;
const USER = { _id: 1, name: "Elias" };
const SIDEBAR_WIDTH = 292;

const getGreeting = (personality: Personality["id"]) =>
  personality === "sylana"
    ? "Hi baby, I'm here. What's on your mind?"
    : "Hey bro. What do you want to work on?";

const createGreeting = (personality: Personality["id"]): IMessage => ({
  _id: `${personality}-greeting-${Date.now()}`,
  text: getGreeting(personality),
  createdAt: new Date(),
  user: {
    _id: SYSTEM_USER_ID,
    name: PERSONALITIES[personality].name,
    avatar: PERSONALITIES[personality].avatar,
  },
});

const createThread = (personality: Personality["id"], projectId: string | null = null): ChatThread => {
  const now = new Date().toISOString();
  return {
    id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    personality,
    title: "New chat",
    projectId,
    backendThreadId: null,
    createdAt: now,
    updatedAt: now,
    messages: [createGreeting(personality)],
  };
};

const ensureActiveThread = (
  workspace: ChatWorkspace,
  personality: Personality["id"]
): { workspace: ChatWorkspace; activeThreadId: string } => {
  const activeId = workspace.activeThreadByPersonality[personality];
  const activeThread = workspace.threads.find((thread) => thread.id === activeId);

  if (activeThread) {
    return { workspace, activeThreadId: activeThread.id };
  }

  const fallback = workspace.threads.find((thread) => thread.personality === personality);
  if (fallback) {
    return {
      workspace: {
        ...workspace,
        activeThreadByPersonality: {
          ...workspace.activeThreadByPersonality,
          [personality]: fallback.id,
        },
      },
      activeThreadId: fallback.id,
    };
  }

  const newThread = createThread(personality);
  return {
    workspace: {
      ...workspace,
      threads: [newThread, ...workspace.threads],
      activeThreadByPersonality: {
        ...workspace.activeThreadByPersonality,
        [personality]: newThread.id,
      },
    },
    activeThreadId: newThread.id,
  };
};

const truncateTitle = (text: string): string => {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "New chat";
  }
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
};

export default function ChatScreen() {
  const [workspace, setWorkspace] = useState<ChatWorkspace | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { currentPersonality, personalityConfig, setPersonality } = usePersonality();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ personality?: string | string[]; threadId?: string | string[] }>();
  const rawPersonalityParam = Array.isArray(params.personality) ? params.personality[0] : params.personality;
  const rawThreadParam = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;

  const screenOpacity = useRef(new Animated.Value(0)).current;
  const screenTranslate = useRef(new Animated.Value(12)).current;
  const orbPulse = useRef(new Animated.Value(0.18)).current;
  const sidebarTranslateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

  useEffect(() => {
    let mounted = true;

    const loadWorkspace = async () => {
      try {
        const saved = await storage.getChatWorkspace();
        const ensured = ensureActiveThread(saved, currentPersonality).workspace;

        if (mounted) {
          setWorkspace(ensured);
        }
      } finally {
        if (mounted) {
          setIsHydrated(true);
        }
      }
    };

    loadWorkspace();

    return () => {
      mounted = false;
    };
  }, [currentPersonality]);

  useEffect(() => {
    if (!isHydrated || !workspace) {
      return;
    }

    storage.setChatWorkspace(workspace).catch((error) => {
      console.error("Failed to persist workspace", error);
    });
  }, [isHydrated, workspace]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    const ensured = ensureActiveThread(workspace, currentPersonality).workspace;
    if (ensured !== workspace) {
      setWorkspace(ensured);
    }
  }, [currentPersonality, workspace]);

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(screenTranslate, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbPulse, {
            toValue: 0.32,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(orbPulse, {
            toValue: 0.18,
            duration: 1600,
            useNativeDriver: true,
          }),
        ])
      ),
    ]);

    animation.start();
    return () => animation.stop();
  }, [orbPulse, screenOpacity, screenTranslate]);

  useEffect(() => {
    Animated.timing(sidebarTranslateX, {
      toValue: isSidebarOpen ? 0 : -SIDEBAR_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isSidebarOpen, sidebarTranslateX]);

  useEffect(() => {
    if (!workspace) {
      return;
    }

    if (rawPersonalityParam === "sylana" || rawPersonalityParam === "claude") {
      if (rawPersonalityParam !== currentPersonality) {
        setPersonality(rawPersonalityParam).catch((error) => {
          console.error("Failed personality switch from params", error);
        });
      }

      if (rawThreadParam) {
        const thread = workspace.threads.find((item) => item.id === rawThreadParam);
        if (thread) {
          setWorkspace((prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              activeThreadByPersonality: {
                ...prev.activeThreadByPersonality,
                [rawPersonalityParam]: rawThreadParam,
              },
            };
          });
        }
      }
    }
  }, [currentPersonality, rawPersonalityParam, rawThreadParam, setPersonality, workspace]);

  const threadsForCurrentPersonality = useMemo(() => {
    if (!workspace) {
      return [];
    }

    return workspace.threads
      .filter((thread) => thread.personality === currentPersonality)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [currentPersonality, workspace]);

  const activeThreadId = workspace?.activeThreadByPersonality[currentPersonality] ?? null;
  const activeThread = threadsForCurrentPersonality.find((thread) => thread.id === activeThreadId) ?? null;
  const messages = useMemo(() => activeThread?.messages ?? [], [activeThread?.messages]);

  const openThread = useCallback((threadId: string) => {
    setWorkspace((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        activeThreadByPersonality: {
          ...prev.activeThreadByPersonality,
          [currentPersonality]: threadId,
        },
      };
    });
    setIsSidebarOpen(false);
  }, [currentPersonality]);

  const createNewThread = useCallback((projectId: string | null = null) => {
    setWorkspace((prev) => {
      if (!prev) {
        return prev;
      }

      const newThread = createThread(currentPersonality, projectId);
      return {
        ...prev,
        threads: [newThread, ...prev.threads],
        activeThreadByPersonality: {
          ...prev.activeThreadByPersonality,
          [currentPersonality]: newThread.id,
        },
      };
    });
    setIsSidebarOpen(false);
  }, [currentPersonality]);

  const createProject = useCallback(() => {
    setWorkspace((prev) => {
      if (!prev) {
        return prev;
      }

      const now = new Date().toISOString();
      const project: ChatProject = {
        id: `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: `Project ${prev.projects.length + 1}`,
        collapsed: false,
        createdAt: now,
        updatedAt: now,
      };

      return {
        ...prev,
        projects: [project, ...prev.projects],
      };
    });
  }, []);

  const toggleProject = useCallback((projectId: string) => {
    setWorkspace((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        projects: prev.projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                collapsed: !project.collapsed,
                updatedAt: new Date().toISOString(),
              }
            : project
        ),
      };
    });
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    setWorkspace((prev) => {
      if (!prev) {
        return prev;
      }

      const thread = prev.threads.find((item) => item.id === threadId);
      if (!thread) {
        return prev;
      }

      const filteredThreads = prev.threads.filter((item) => item.id !== threadId);
      const nextActiveMap = { ...prev.activeThreadByPersonality };

      if (nextActiveMap[thread.personality] === threadId) {
        const fallback = filteredThreads.find((item) => item.personality === thread.personality);
        if (fallback) {
          nextActiveMap[thread.personality] = fallback.id;
        } else {
          const fresh = createThread(thread.personality);
          filteredThreads.unshift(fresh);
          nextActiveMap[thread.personality] = fresh.id;
        }
      }

      return {
        ...prev,
        threads: filteredThreads,
        activeThreadByPersonality: nextActiveMap,
      };
    });
  }, []);

  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      const userMessage = newMessages[0];
      if (!userMessage || !activeThread) {
        return;
      }

      const sendingThreadId = activeThread.id;
      const backendThreadId = activeThread.backendThreadId;

      setWorkspace((prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          threads: prev.threads.map((thread) => {
            if (thread.id !== sendingThreadId) {
              return thread;
            }

            const nextMessages = GiftedChat.append(thread.messages, [userMessage]);
            const newTitle = thread.title === "New chat" ? truncateTitle(userMessage.text) : thread.title;

            return {
              ...thread,
              title: newTitle,
              messages: nextMessages,
              updatedAt: new Date().toISOString(),
            };
          }),
        };
      });

      setIsTyping(true);

      try {
        const parsedThreadId =
          backendThreadId && !Number.isNaN(Number(backendThreadId))
            ? Number(backendThreadId)
            : backendThreadId;

        const response = await chatService.sendMessage(
          userMessage.text,
          currentPersonality,
          parsedThreadId || null
        );

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

        setWorkspace((prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            threads: prev.threads.map((thread) => {
              if (thread.id !== sendingThreadId) {
                return thread;
              }

              return {
                ...thread,
                backendThreadId: response.thread_id ? String(response.thread_id) : thread.backendThreadId,
                messages: GiftedChat.append(thread.messages, [aiMessage]),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        });
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

        setWorkspace((prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            threads: prev.threads.map((thread) =>
              thread.id === sendingThreadId
                ? {
                    ...thread,
                    messages: GiftedChat.append(thread.messages, [errorMessage]),
                    updatedAt: new Date().toISOString(),
                  }
                : thread
            ),
          };
        });
      } finally {
        setIsTyping(false);
      }
    },
    [activeThread, currentPersonality, personalityConfig.avatar, personalityConfig.name]
  );

  if (!isHydrated || !workspace) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading workspace...</Text>
      </View>
    );
  }

  const projects = workspace.projects;
  const ungroupedThreads = threadsForCurrentPersonality.filter((thread) => !thread.projectId);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: screenOpacity,
          transform: [{ translateY: screenTranslate }],
        },
      ]}
    >
      <Animated.View style={[styles.glowOrb, styles.glowTop, { opacity: orbPulse }]} />
      <Animated.View style={[styles.glowOrb, styles.glowBottom, { opacity: orbPulse }]} />

      <View style={[styles.topHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.headerIconBtn} onPress={() => setIsSidebarOpen(true)}>
          <Ionicons name="menu" size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {activeThread?.title ?? "New chat"}
        </Text>
        <Pressable style={styles.headerIconBtn} onPress={() => createNewThread(null)}>
          <Ionicons name="add" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <PersonalityToggle />

      <GiftedChat<IMessage>
        messages={messages}
        onSend={onSend}
        user={USER}
        isTyping={isTyping}
        textInputProps={{
          placeholder: "Message Vessel...",
          placeholderTextColor: theme.colors.textMuted,
          style: styles.input,
          selectionColor: theme.colors.accent,
          contextMenuHidden: false,
        }}
        messagesContainerStyle={styles.messageList}
        renderBubble={(props) => <ChatMessage {...props} />}
        renderFooter={() => (isTyping ? <TypingIndicator /> : null)}
      />

      {Platform.OS === "android" && <KeyboardAvoidingView behavior="padding" />}

      {isSidebarOpen && <Pressable style={styles.sidebarOverlay} onPress={() => setIsSidebarOpen(false)} />}

      <Animated.View
        style={[
          styles.sidebar,
          {
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + 20,
            transform: [{ translateX: sidebarTranslateX }],
          },
        ]}
      >
        <Text style={styles.sidebarTitle}>Workspace</Text>

        <View style={styles.sidebarActions}>
          <Pressable style={styles.actionPrimary} onPress={() => createNewThread(null)}>
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.textPrimary} />
            <Text style={styles.actionPrimaryText}>New Chat</Text>
          </Pressable>
          <Pressable style={styles.actionSecondary} onPress={createProject}>
            <Ionicons name="folder-open-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.actionSecondaryText}>New Project</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.sidebarScroll} contentContainerStyle={styles.sidebarScrollContent}>
          <Text style={styles.sectionLabel}>Projects</Text>
          {projects.length === 0 ? <Text style={styles.emptySectionText}>No project folders yet.</Text> : null}

          {projects.map((project) => {
            const projectThreads = threadsForCurrentPersonality.filter(
              (thread) => thread.projectId === project.id
            );

            return (
              <View key={project.id} style={styles.projectBlock}>
                <View style={styles.projectHeader}>
                  <Pressable style={styles.projectInfo} onPress={() => toggleProject(project.id)}>
                    <Ionicons
                      name={project.collapsed ? "chevron-forward" : "chevron-down"}
                      size={14}
                      color={theme.colors.textMuted}
                    />
                    <Text style={styles.projectName}>{project.name}</Text>
                  </Pressable>

                  <Pressable style={styles.projectAddBtn} onPress={() => createNewThread(project.id)}>
                    <Ionicons name="add" size={14} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>

                {!project.collapsed && projectThreads.length > 0
                  ? projectThreads.map((thread) => (
                      <Pressable
                        key={thread.id}
                        style={[
                          styles.threadItem,
                          activeThread?.id === thread.id && styles.threadItemActive,
                        ]}
                        onPress={() => openThread(thread.id)}
                      >
                        <Text numberOfLines={1} style={styles.threadText}>
                          {thread.title}
                        </Text>
                        <Pressable onPress={() => deleteThread(thread.id)}>
                          <Ionicons name="trash-outline" size={14} color={theme.colors.textMuted} />
                        </Pressable>
                      </Pressable>
                    ))
                  : null}

                {!project.collapsed && projectThreads.length === 0 ? (
                  <Text style={styles.emptyProjectText}>No chats inside this project.</Text>
                ) : null}
              </View>
            );
          })}

          <Text style={styles.sectionLabel}>Ungrouped Chats</Text>
          {ungroupedThreads.map((thread) => (
            <Pressable
              key={thread.id}
              style={[styles.threadItem, activeThread?.id === thread.id && styles.threadItemActive]}
              onPress={() => openThread(thread.id)}
            >
              <Text numberOfLines={1} style={styles.threadText}>
                {thread.title}
              </Text>
              <Pressable onPress={() => deleteThread(thread.id)}>
                <Ionicons name="trash-outline" size={14} color={theme.colors.textMuted} />
              </Pressable>
            </Pressable>
          ))}
          {ungroupedThreads.length === 0 ? (
            <Text style={styles.emptySectionText}>All chats are in project folders.</Text>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    gap: 12,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 10,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  messageList: {
    backgroundColor: "transparent",
  },
  input: {
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  glowOrb: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: theme.colors.accent,
  },
  glowTop: {
    top: -120,
    right: -60,
  },
  glowBottom: {
    bottom: -110,
    left: -70,
  },
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 20,
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: "#0e0820",
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    zIndex: 21,
    paddingHorizontal: 12,
  },
  sidebarTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
  },
  sidebarActions: {
    gap: 8,
    marginBottom: 14,
  },
  actionPrimary: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  actionPrimaryText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  actionSecondary: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface,
  },
  actionSecondaryText: {
    color: theme.colors.textSecondary,
    fontWeight: "600",
    fontSize: 13,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarScrollContent: {
    gap: 10,
    paddingBottom: 24,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginTop: 4,
  },
  projectBlock: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 8,
    gap: 6,
  },
  projectHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  projectInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  projectName: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
    fontSize: 13,
  },
  projectAddBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  threadItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    gap: 6,
  },
  threadItemActive: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  threadText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 13,
  },
  emptySectionText: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  emptyProjectText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 6,
  },
});
