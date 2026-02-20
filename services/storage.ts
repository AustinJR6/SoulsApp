import AsyncStorage from "@react-native-async-storage/async-storage";
import { IMessage } from "react-native-gifted-chat";
import { DEFAULT_PERSONALITY } from "../constants/personalities";
import { ChatWorkspace, Personality } from "../types";

type PersonalityId = Personality["id"];
type StoredMessage = Omit<IMessage, "createdAt"> & { createdAt: string };
type StoredWorkspace = Omit<ChatWorkspace, "threads"> & {
  threads: Array<Omit<ChatWorkspace["threads"][number], "messages"> & { messages: StoredMessage[] }>;
};

type LegacyHistory = Partial<Record<PersonalityId, StoredMessage[]>>;
type LegacyThreadMap = Partial<Record<PersonalityId, string>>;

const PERSONALITIES: PersonalityId[] = ["sylana", "claude"];

const KEYS = {
  CURRENT_PERSONALITY: "@vessel_current_personality",
  THREAD_ID: "@vessel_thread_id",
  THREAD_IDS_BY_PERSONALITY: "@vessel_thread_ids_by_personality",
  CHAT_HISTORY_BY_PERSONALITY: "@vessel_chat_history_by_personality",
  CHAT_WORKSPACE: "@vessel_chat_workspace",
  USER_PREFERENCES: "@vessel_preferences",
};

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const toIso = (value: Date | string | number): string => new Date(value).toISOString();

const normalizeMessages = (messages: Array<StoredMessage | IMessage> = []): IMessage[] =>
  messages
    .filter((message) => typeof message?.text === "string")
    .map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt as string | number | Date),
    }));

const toStoredMessages = (messages: IMessage[] = []): StoredMessage[] =>
  messages.map((message) => ({
    ...message,
    createdAt: toIso(message.createdAt),
  }));

const createEmptyWorkspace = (): ChatWorkspace => ({
  threads: [],
  projects: [],
  activeThreadByPersonality: {
    sylana: null,
    claude: null,
  },
});

const normalizeWorkspace = (workspace: StoredWorkspace | ChatWorkspace): ChatWorkspace => {
  const normalized = createEmptyWorkspace();

  normalized.projects = Array.isArray(workspace.projects)
    ? workspace.projects.map((project) => ({
        ...project,
        createdAt: toIso(project.createdAt),
        updatedAt: toIso(project.updatedAt),
      }))
    : [];

  normalized.threads = Array.isArray(workspace.threads)
    ? workspace.threads.map((thread) => ({
        ...thread,
        title: thread.title || "New chat",
        projectId: thread.projectId ?? null,
        backendThreadId: thread.backendThreadId ?? null,
        createdAt: toIso(thread.createdAt),
        updatedAt: toIso(thread.updatedAt),
        messages: normalizeMessages(thread.messages as Array<StoredMessage | IMessage>),
      }))
    : [];

  for (const personality of PERSONALITIES) {
    const candidate = workspace.activeThreadByPersonality?.[personality] ?? null;
    normalized.activeThreadByPersonality[personality] =
      typeof candidate === "string" && candidate.length ? candidate : null;
  }

  return normalized;
};

const migrateLegacyWorkspace = async (): Promise<ChatWorkspace> => {
  const [legacyHistoryRaw, legacyThreadsRaw, fallbackThreadId] = await Promise.all([
    AsyncStorage.getItem(KEYS.CHAT_HISTORY_BY_PERSONALITY),
    AsyncStorage.getItem(KEYS.THREAD_IDS_BY_PERSONALITY),
    AsyncStorage.getItem(KEYS.THREAD_ID),
  ]);

  const legacyHistory = parseJson<LegacyHistory>(legacyHistoryRaw, {});
  const legacyThreadIds = parseJson<LegacyThreadMap>(legacyThreadsRaw, {});

  const workspace = createEmptyWorkspace();

  for (const personality of PERSONALITIES) {
    const messages = normalizeMessages(legacyHistory[personality]);
    if (!messages.length) {
      continue;
    }

    const threadId = `thread_${personality}_${Date.now()}`;
    workspace.threads.push({
      id: threadId,
      personality,
      title: "Imported chat",
      projectId: null,
      backendThreadId: legacyThreadIds[personality] ?? fallbackThreadId ?? null,
      createdAt: toIso(new Date()),
      updatedAt: toIso(messages[0]?.createdAt ?? new Date()),
      messages,
    });
    workspace.activeThreadByPersonality[personality] = threadId;
  }

  return workspace;
};

const ensureWorkspaceSaved = async (workspace: ChatWorkspace): Promise<void> => {
  const serialized: StoredWorkspace = {
    ...workspace,
    threads: workspace.threads.map((thread) => ({
      ...thread,
      createdAt: toIso(thread.createdAt),
      updatedAt: toIso(thread.updatedAt),
      messages: toStoredMessages(thread.messages),
    })),
  };

  await AsyncStorage.setItem(KEYS.CHAT_WORKSPACE, JSON.stringify(serialized));
};

export const storage = {
  getCurrentPersonality: async (): Promise<string> => {
    const personality = await AsyncStorage.getItem(KEYS.CURRENT_PERSONALITY);
    return personality || DEFAULT_PERSONALITY;
  },

  setCurrentPersonality: async (personality: string): Promise<void> => {
    await AsyncStorage.setItem(KEYS.CURRENT_PERSONALITY, personality);
  },

  getChatWorkspace: async (): Promise<ChatWorkspace> => {
    const raw = await AsyncStorage.getItem(KEYS.CHAT_WORKSPACE);
    if (!raw) {
      const migrated = await migrateLegacyWorkspace();
      await ensureWorkspaceSaved(migrated);
      return migrated;
    }

    const parsed = parseJson<StoredWorkspace | null>(raw, null);
    if (!parsed) {
      return createEmptyWorkspace();
    }
    return normalizeWorkspace(parsed);
  },

  setChatWorkspace: async (workspace: ChatWorkspace): Promise<void> => {
    await ensureWorkspaceSaved(workspace);
  },

  deleteThread: async (threadId: string): Promise<void> => {
    const workspace = await storage.getChatWorkspace();
    workspace.threads = workspace.threads.filter((thread) => thread.id !== threadId);

    for (const personality of PERSONALITIES) {
      if (workspace.activeThreadByPersonality[personality] === threadId) {
        const fallback = workspace.threads.find((thread) => thread.personality === personality);
        workspace.activeThreadByPersonality[personality] = fallback?.id ?? null;
      }
    }

    await ensureWorkspaceSaved(workspace);
  },

  clearAll: async (): Promise<void> => {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};
