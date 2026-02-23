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
import { PhotoPicker } from "../../components/PhotoPicker";
import { ToolContextSelector } from "../../components/ToolContextSelector";
import { TypingIndicator } from "../../components/TypingIndicator";
import { PERSONALITIES } from "../../constants/personalities";
import { DEFAULT_TOOL_IDS, mergeAvailableTools, sanitizeTools, TOOL_CATALOG, TOOL_PRESETS } from "../../constants/tools";
import { theme } from "../../constants/theme";
import { usePersonality } from "../../contexts/PersonalityContext";
import { API_URL, chatService } from "../../services/api";
import { buildHealthContext } from "../../services/VitalsContextService";
import { storage } from "../../services/storage";
import { ChatProject, ChatThread, ChatWorkspace, Personality, ToolDescriptor } from "../../types";
import type { Photo } from "../../types/photo";

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

const createThread = (
  personality: Personality["id"],
  projectId: string | null = null,
  tools: string[] = [...DEFAULT_TOOL_IDS]
): ChatThread => {
  const now = new Date().toISOString();
  return {
    id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    personality,
    title: "New chat",
    projectId,
    backendThreadId: null,
    tools: sanitizeTools(tools),
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
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [availableTools, setAvailableTools] = useState<ToolDescriptor[]>(TOOL_CATALOG);
  const [toolDefaultsByPersonality, setToolDefaultsByPersonality] = useState<Record<Personality["id"], string[]>>({
    sylana: [...DEFAULT_TOOL_IDS],
    claude: [...DEFAULT_TOOL_IDS],
  });
  const { currentPersonality, personalityConfig, setPersonality } = usePersonality();
  const insets = useSafeAreaInsets();

  // Health context — loaded once on mount, refreshed on each new thread.
  // Stored in a ref so onSend always reads the latest value without re-rendering.
  const healthContextRef = useRef<string>('');

  useEffect(() => {
    buildHealthContext().then((ctx) => {
      healthContextRef.current = ctx;
    });
  }, []);

  useEffect(() => {
    storage.getToolDefaultsByPersonality()
      .then((defaults) => {
        setToolDefaultsByPersonality({
          sylana: sanitizeTools(defaults.sylana.length ? defaults.sylana : [...DEFAULT_TOOL_IDS]),
          claude: sanitizeTools(defaults.claude.length ? defaults.claude : [...DEFAULT_TOOL_IDS]),
        });
      })
      .catch(() => {
        // Ignore load failures and continue with built-in defaults.
      });
  }, []);

  useEffect(() => {
    chatService.getAvailableTools()
      .then((tools) => {
        setAvailableTools(mergeAvailableTools(tools));
      })
      .catch(() => {
        setAvailableTools(TOOL_CATALOG);
      });
  }, []);

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
  const activeTools = useMemo(
    () => sanitizeTools(activeThread?.tools ?? toolDefaultsByPersonality[currentPersonality] ?? [...DEFAULT_TOOL_IDS]),
    [activeThread?.tools, currentPersonality, toolDefaultsByPersonality]
  );

  useEffect(() => {
    if (!activeThread || activeThread.tools.length > 0) {
      return;
    }

    const defaults = sanitizeTools(toolDefaultsByPersonality[activeThread.personality] ?? [...DEFAULT_TOOL_IDS]);
    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        threads: prev.threads.map((thread) =>
          thread.id === activeThread.id
            ? { ...thread, tools: defaults, updatedAt: new Date().toISOString() }
            : thread
        ),
      };
    });
  }, [activeThread, toolDefaultsByPersonality]);

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

      const newThread = createThread(
        currentPersonality,
        projectId,
        toolDefaultsByPersonality[currentPersonality] ?? [...DEFAULT_TOOL_IDS]
      );
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
  }, [currentPersonality, toolDefaultsByPersonality]);

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
          const fresh = createThread(
            thread.personality,
            null,
            toolDefaultsByPersonality[thread.personality] ?? [...DEFAULT_TOOL_IDS]
          );
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
  }, [toolDefaultsByPersonality]);

  const syncConversationTools = useCallback(async (thread: ChatThread, tools: string[]) => {
    const conversationId = thread.backendThreadId ?? thread.id;
    await chatService.updateConversationTools(conversationId, tools).catch(() => {
      // Backend sync may fail if conversation isn't known yet; local state remains source of truth.
    });
  }, []);

  const describeTools = useCallback((tools: string[]): string => {
    const byId = new Map(availableTools.map((tool) => [tool.id, tool.label]));
    const labels = tools.map((toolId) => byId.get(toolId) ?? toolId);
    if (labels.length === 0) return "no tools active";
    if (labels.length === 1) return `${labels[0]} now active`;
    if (labels.length === 2) return `${labels[0]} and ${labels[1]} now active`;
    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]} now active`;
  }, [availableTools]);

  const updateActiveThreadTools = useCallback((nextToolsRaw: string[]) => {
    if (!activeThread) return;

    const nextTools = sanitizeTools(nextToolsRaw);
    const currentTools = sanitizeTools(activeThread.tools ?? []);
    const hasChanged =
      nextTools.length !== currentTools.length || nextTools.some((tool, idx) => tool !== currentTools[idx]);

    if (!hasChanged) return;

    const nowIso = new Date().toISOString();
    const contextMessage: IMessage = {
      _id: `context-${Date.now()}`,
      text: `Context updated — ${describeTools(nextTools)}`,
      createdAt: new Date(),
      user: {
        _id: SYSTEM_USER_ID,
        name: "System",
      },
    };

    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        threads: prev.threads.map((thread) => {
          if (thread.id !== activeThread.id) return thread;
          const shouldAppendContext = thread.messages.length > 1;
          return {
            ...thread,
            tools: nextTools,
            messages: shouldAppendContext ? GiftedChat.append(thread.messages, [contextMessage]) : thread.messages,
            updatedAt: nowIso,
          };
        }),
      };
    });

    setToolDefaultsByPersonality((prev) => {
      const next = {
        ...prev,
        [activeThread.personality]: nextTools,
      };
      storage.setToolDefaultsByPersonality({ [activeThread.personality]: nextTools }).catch(() => {});
      return next;
    });

    syncConversationTools(activeThread, nextTools).catch(() => {});
  }, [activeThread, describeTools, syncConversationTools]);

  const handleToggleTool = useCallback((toolId: string) => {
    const normalizedId = sanitizeTools([toolId])[0];
    if (!normalizedId) return;
    const nextTools = activeTools.includes(normalizedId)
      ? activeTools.filter((item) => item !== normalizedId)
      : [...activeTools, normalizedId];
    updateActiveThreadTools(nextTools);
  }, [activeTools, updateActiveThreadTools]);

  const handleApplyPreset = useCallback((presetId: string) => {
    const preset = TOOL_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    updateActiveThreadTools(preset.tools);
  }, [updateActiveThreadTools]);

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
          parsedThreadId || null,
          healthContextRef.current || undefined,
          activeTools
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

        const nextConversationId = response.thread_id ?? backendThreadId ?? sendingThreadId;
        chatService.updateConversationTools(nextConversationId, activeTools).catch(() => {
          // Best-effort sync only; local state is still persisted.
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
    [activeThread, activeTools, currentPersonality, personalityConfig.avatar, personalityConfig.name]
  );

  /** Called by PhotoPicker after a successful upload — inserts an image bubble. */
  const handlePhotoUploaded = useCallback(
    (photo: Photo) => {
      setShowPhotoPicker(false);
      if (!activeThread) return;

      const sendingThreadId = activeThread.id;

      const photoMessage: IMessage = {
        _id: `photo-${photo.id}`,
        text: photo.caption ?? '',
        image: photo.public_url,
        createdAt: new Date(photo.created_at),
        user: USER,
      };

      setWorkspace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          threads: prev.threads.map((thread) =>
            thread.id !== sendingThreadId
              ? thread
              : {
                  ...thread,
                  title: thread.title === "New chat" ? "Photo shared" : thread.title,
                  messages: GiftedChat.append(thread.messages, [photoMessage]),
                  updatedAt: new Date().toISOString(),
                }
          ),
        };
      });
    },
    [activeThread]
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
        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {activeThread?.title ?? "New chat"}
          </Text>
          <Text style={styles.headerToolsCount}>{activeTools.length} tools active</Text>
        </View>
        <Pressable style={styles.headerIconBtn} onPress={() => createNewThread(null)}>
          <Ionicons name="add" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <PersonalityToggle />

      <ToolContextSelector
        expanded={isContextExpanded}
        availableTools={availableTools}
        activeTools={activeTools}
        presets={TOOL_PRESETS}
        onToggleExpanded={() => setIsContextExpanded((prev) => !prev)}
        onToggleTool={handleToggleTool}
        onPresetSelect={handleApplyPreset}
      />

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
        renderActions={() => (
          <Pressable style={styles.cameraBtn} onPress={() => setShowPhotoPicker(true)}>
            <Ionicons name="camera-outline" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        )}
      />

      <PhotoPicker
        visible={showPhotoPicker}
        conversationId={activeThread?.id ?? null}
        aiEntity={currentPersonality}
        onPhotoUploaded={handlePhotoUploaded}
        onCancel={() => setShowPhotoPicker(false)}
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
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 10,
    gap: 2,
  },
  headerToolsCount: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  messageList: {
    backgroundColor: "transparent",
  },
  cameraBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    marginLeft: 6,
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
