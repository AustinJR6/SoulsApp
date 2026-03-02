import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { IMessage } from "react-native-gifted-chat";
import { GitHubActivityFeed } from "../../components/GitHubActivityFeed";
import { PhotoGallery } from "../../components/PhotoGallery";
import { PERSONALITIES } from "../../constants/personalities";
import { theme } from "../../constants/theme";
import { usePersonality } from "../../contexts/PersonalityContext";
import { chatService } from "../../services/api";
import { storage } from "../../services/storage";
import { ChatThread } from "../../types";

type TabId = "threads" | "photos" | "github";

type MemoryItem = {
  thread: ChatThread;
  projectName: string | null;
};

type BackendThreadRow = {
  id: number;
  title?: string;
  updated_at?: string;
  created_at?: string;
  active_tools?: string[];
};

type BackendMessageRow = {
  id: number;
  role: "user" | "assistant";
  content: string;
  personality?: "sylana" | "claude";
  created_at?: string;
};

const formatDate = (date: Date) =>
  date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const buildTranscript = (thread: ChatThread) => {
  const personalityName = PERSONALITIES[thread.personality].name;
  const lines = thread.messages
    .filter((message) => typeof message.text === "string" && message.text.trim().length > 0)
    .reverse()
    .map((message) => {
      const speaker = message.user?._id === 1 ? "You" : personalityName;
      return `${speaker}: ${message.text}`;
    });

  return `Vessel transcript (${personalityName})\nThread: ${thread.title}\n\n${lines.join("\n\n")}`;
};

const toGiftedMessage = (message: BackendMessageRow): IMessage => ({
  _id: `backend-msg-${message.id}`,
  text: String(message.content || ""),
  createdAt: new Date(message.created_at || Date.now()),
  user: {
    _id: message.role === "user" ? 1 : 2,
    name:
      message.role === "user"
        ? "You"
        : PERSONALITIES[(message.personality === "claude" ? "claude" : "sylana")].name,
    avatar:
      message.role === "user"
        ? undefined
        : PERSONALITIES[(message.personality === "claude" ? "claude" : "sylana")].avatar,
  },
});

const normalizeBackendThread = (thread: BackendThreadRow, messages: BackendMessageRow[]): ChatThread => {
  const assistant = messages.find((m) => m.role === "assistant" && (m.personality === "claude" || m.personality === "sylana"));
  const personality = (assistant?.personality || "sylana") as "sylana" | "claude";
  const giftedMessages = messages.map(toGiftedMessage).sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime());
  const firstUser = messages.find((m) => m.role === "user" && String(m.content || "").trim().length > 0);
  const title = (thread.title || firstUser?.content || "Imported chat").trim();
  const updatedAt = thread.updated_at || messages[0]?.created_at || new Date().toISOString();
  const createdAt = thread.created_at || messages[messages.length - 1]?.created_at || updatedAt;

  return {
    id: `thread_backend_${thread.id}`,
    personality,
    mode: "default",
    title: title.length > 60 ? `${title.slice(0, 60)}...` : title,
    projectId: null,
    backendThreadId: String(thread.id),
    tools: Array.isArray(thread.active_tools) && thread.active_tools.length > 0 ? thread.active_tools : ["memories", "web_search"],
    createdAt,
    updatedAt,
    messages: giftedMessages,
  };
};

export default function MemoriesScreen() {
  const [activeTab, setActiveTab] = useState<TabId>("threads");
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cardAnimations = useRef<Record<string, Animated.Value>>({}).current;
  const router = useRouter();
  const { setPersonality } = usePersonality();

  const animateCards = useCallback(
    (nextItems: MemoryItem[]) => {
      const animations = nextItems.map((item, index) => {
        if (!cardAnimations[item.thread.id]) {
          cardAnimations[item.thread.id] = new Animated.Value(0);
        }

        return Animated.timing(cardAnimations[item.thread.id], {
          toValue: 1,
          duration: 260,
          delay: index * 60,
          useNativeDriver: true,
        });
      });

      Animated.stagger(50, animations).start();
    },
    [cardAnimations]
  );

  const loadMemories = useCallback(async () => {
    setIsRefreshing(true);

    try {
      let workspace = await storage.getChatWorkspace();
      const projectLookup = new Map(workspace.projects.map((project) => [project.id, project.name]));

      // Backend-first memory source; local workspace is secondary cache.
      try {
        const remote = await chatService.getThreads() as { threads?: BackendThreadRow[] };
        const threadRows = Array.isArray(remote?.threads) ? remote.threads : [];
        const limitedRows = threadRows.slice(0, 40);

        const remoteBundles = await Promise.all(
          limitedRows.map(async (row) => {
            try {
              const payload = await chatService.getThreadMessages(row.id) as { messages?: BackendMessageRow[] };
              const messages = Array.isArray(payload?.messages) ? payload.messages : [];
              return { row, messages };
            } catch {
              return { row, messages: [] as BackendMessageRow[] };
            }
          })
        );

        const mergedThreads = [...workspace.threads];
        for (const bundle of remoteBundles) {
          const normalized = normalizeBackendThread(bundle.row, bundle.messages);
          const idx = mergedThreads.findIndex(
            (t) => t.backendThreadId === normalized.backendThreadId || t.id === normalized.id
          );
          if (idx >= 0) {
            mergedThreads[idx] = {
              ...mergedThreads[idx],
              ...normalized,
              // Preserve existing local project assignment if present.
              projectId: mergedThreads[idx].projectId ?? normalized.projectId,
            };
          } else {
            mergedThreads.push(normalized);
          }
        }

        workspace = { ...workspace, threads: mergedThreads };
        await storage.setChatWorkspace(workspace);
      } catch {
        // Fall back to local-only when backend fetch fails.
      }

      const next = workspace.threads
        .filter((thread) => thread.messages.length > 1)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((thread) => ({
          thread,
          projectName: thread.projectId ? projectLookup.get(thread.projectId) ?? null : null,
        }));

      setItems(next);
      animateCards(next);
    } catch (error) {
      console.error("Failed to load memories", error);
      setItems([]);
    } finally {
      setIsRefreshing(false);
    }
  }, [animateCards]);

  const openThread = useCallback(
    async (item: MemoryItem) => {
      await setPersonality(item.thread.personality);
      router.push({
        pathname: "/(tabs)/chat",
        params: {
          personality: item.thread.personality,
          threadId: item.thread.id,
        },
      });
    },
    [router, setPersonality]
  );

  const exportThread = useCallback(async (item: MemoryItem) => {
    try {
      await Share.share({
        title: `Vessel memory (${PERSONALITIES[item.thread.personality].name})`,
        message: buildTranscript(item.thread),
      });
    } catch (error) {
      console.error("Failed to export transcript", error);
      Alert.alert("Export failed", "Could not export this thread right now.");
    }
  }, []);

  const deleteThread = useCallback(
    (item: MemoryItem) => {
      Alert.alert("Delete Memory", `Delete \"${item.thread.title}\"? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await storage.deleteThread(item.thread.id);
              await loadMemories();
            } catch (error) {
              console.error("Failed to delete memory", error);
              Alert.alert("Delete failed", "Could not delete this thread right now.");
            }
          },
        },
      ]);
    },
    [loadMemories]
  );

  useFocusEffect(
    useCallback(() => {
      loadMemories();
    }, [loadMemories])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Memory Archive</Text>
      <Text style={styles.subtitle}>Your conversations and shared photos</Text>

      {/* ── Tab selector ── */}
      <View style={styles.tabBar}>
        {([
          { id: "threads", label: "Chats" },
          { id: "photos", label: "Photos" },
          { id: "github", label: "GitHub" },
        ] as { id: TabId; label: string }[]).map(({ id, label }) => (
          <Pressable
            key={id}
            style={[styles.tab, activeTab === id && styles.tabActive]}
            onPress={() => setActiveTab(id)}
          >
            <Text style={[styles.tabText, activeTab === id && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Photos tab ── full-bleed grid, break out of horizontal padding ── */}
      {activeTab === "photos" && (
        <View style={styles.fullBleedWrapper}>
          <PhotoGallery />
        </View>
      )}

      {/* ── GitHub tab ── */}
      {activeTab === "github" && (
        <View style={styles.fullBleedWrapper}>
          <GitHubActivityFeed />
        </View>
      )}

      {/* ── Threads tab ── */}
      {activeTab === "threads" && <FlatList
        data={items}
        keyExtractor={(item) => item.thread.id}
        contentContainerStyle={items.length ? styles.listContent : styles.emptyContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={loadMemories} tintColor="#a855f7" />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No saved memories yet</Text>
            <Text style={styles.emptyText}>Start a chat first, then it will show here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const personality = PERSONALITIES[item.thread.personality];
          if (!cardAnimations[item.thread.id]) {
            cardAnimations[item.thread.id] = new Animated.Value(1);
          }

          return (
            <Animated.View
              style={{
                opacity: cardAnimations[item.thread.id],
                transform: [
                  {
                    translateY: cardAnimations[item.thread.id].interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                    }),
                  },
                ],
              }}
            >
              <Pressable style={styles.card} onPress={() => openThread(item)}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.badge, { borderColor: personality.color, color: personality.color }]}>
                    {personality.name}
                  </Text>
                  <Text style={styles.timestamp}>{formatDate(new Date(item.thread.updatedAt))}</Text>
                </View>

                <Text style={styles.titleText} numberOfLines={1}>
                  {item.thread.title}
                </Text>

                <Text style={styles.preview} numberOfLines={3}>
                  {item.thread.messages[0]?.text ?? ""}
                </Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{item.thread.messages.length - 1} msgs</Text>
                  <Text style={styles.metaText}>{item.projectName ? `Project: ${item.projectName}` : "Ungrouped"}</Text>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable style={[styles.actionButton, styles.exportButton]} onPress={() => exportThread(item)}>
                    <Text style={styles.actionText}>Export</Text>
                  </Pressable>
                  <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={() => deleteThread(item)}>
                    <Text style={styles.actionDeleteText}>Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
      />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: 10,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 3,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: theme.colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: "#fff",
  },
  fullBleedWrapper: {
    flex: 1,
    marginHorizontal: -16, // cancel parent horizontal padding so content is full-bleed
  },
  listContent: {
    paddingBottom: 20,
    gap: 10,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 18,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "700",
  },
  timestamp: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  titleText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  preview: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  exportButton: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(168,85,247,0.15)",
  },
  deleteButton: {
    borderColor: theme.colors.danger,
    backgroundColor: "rgba(255,120,152,0.12)",
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
    fontSize: 12,
  },
  actionDeleteText: {
    color: theme.colors.danger,
    fontWeight: "600",
    fontSize: 12,
  },
});
