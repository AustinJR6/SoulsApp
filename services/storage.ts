import AsyncStorage from "@react-native-async-storage/async-storage";
import { IMessage } from "react-native-gifted-chat";
import { DEFAULT_PERSONALITY } from "../constants/personalities";
import { DEFAULT_TOOL_IDS, sanitizeTools } from "../constants/tools";
import { ChatWorkspace, ConversationMode, Personality } from "../types";

type PersonalityId = Personality["id"];
type ConversationModeMap = Record<PersonalityId, ConversationMode>;
type StoredMessage = Omit<IMessage, "createdAt"> & { createdAt: string };
type StoredWorkspace = Omit<ChatWorkspace, "threads"> & {
  threads: Array<Omit<ChatWorkspace["threads"][number], "messages"> & { messages: StoredMessage[] }>;
};

type LegacyHistory = Partial<Record<PersonalityId, StoredMessage[]>>;
type LegacyThreadMap = Partial<Record<PersonalityId, string>>;

const PERSONALITIES: PersonalityId[] = ["sylana", "claude"];
const DEFAULT_MODE_BY_PERSONALITY: ConversationModeMap = {
  sylana: "default",
  claude: "default",
};

const KEYS = {
  CURRENT_PERSONALITY: "@vessel_current_personality",
  THREAD_ID: "@vessel_thread_id",
  THREAD_IDS_BY_PERSONALITY: "@vessel_thread_ids_by_personality",
  CHAT_HISTORY_BY_PERSONALITY: "@vessel_chat_history_by_personality",
  CHAT_WORKSPACE: "@vessel_chat_workspace",
  TOOL_DEFAULTS_BY_PERSONALITY: "@vessel_tool_defaults_by_personality",
  MODE_DEFAULTS_BY_PERSONALITY: "@vessel_mode_defaults_by_personality",
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

const normalizeConversationMode = (
  mode: unknown,
  personality: PersonalityId
): ConversationMode => (mode === "spicy" && personality === "sylana" ? "spicy" : "default");

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
        mode: normalizeConversationMode((thread as { mode?: unknown }).mode, thread.personality),
        title: thread.title || "New chat",
        projectId: thread.projectId ?? null,
        backendThreadId: thread.backendThreadId ?? null,
        tools: Array.isArray((thread as { tools?: unknown }).tools)
          ? sanitizeTools((thread as { tools: unknown[] }).tools.filter((tool): tool is string => typeof tool === "string"))
          : sanitizeTools([...DEFAULT_TOOL_IDS]),
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
      mode: DEFAULT_MODE_BY_PERSONALITY[personality],
      title: "Imported chat",
      projectId: null,
      backendThreadId: legacyThreadIds[personality] ?? fallbackThreadId ?? null,
      tools: sanitizeTools([...DEFAULT_TOOL_IDS]),
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

  getToolDefaultsByPersonality: async (): Promise<Record<PersonalityId, string[]>> => {
    const raw = await AsyncStorage.getItem(KEYS.TOOL_DEFAULTS_BY_PERSONALITY);
    const parsed = parseJson<Partial<Record<PersonalityId, string[]>>>(raw, {});
    return {
      sylana: Array.isArray(parsed.sylana) ? parsed.sylana.filter((tool) => typeof tool === "string") : [],
      claude: Array.isArray(parsed.claude) ? parsed.claude.filter((tool) => typeof tool === "string") : [],
    };
  },

  getModeDefaultsByPersonality: async (): Promise<ConversationModeMap> => {
    const raw = await AsyncStorage.getItem(KEYS.MODE_DEFAULTS_BY_PERSONALITY);
    const parsed = parseJson<Partial<Record<PersonalityId, ConversationMode>>>(raw, {});
    return {
      sylana: normalizeConversationMode(parsed.sylana, "sylana"),
      claude: normalizeConversationMode(parsed.claude, "claude"),
    };
  },

  setModeDefaultsByPersonality: async (value: Partial<Record<PersonalityId, ConversationMode>>): Promise<void> => {
    const current = await storage.getModeDefaultsByPersonality();
    const next: ConversationModeMap = {
      sylana: value.sylana ? normalizeConversationMode(value.sylana, "sylana") : current.sylana,
      claude: value.claude ? normalizeConversationMode(value.claude, "claude") : current.claude,
    };
    await AsyncStorage.setItem(KEYS.MODE_DEFAULTS_BY_PERSONALITY, JSON.stringify(next));
  },

  setToolDefaultsByPersonality: async (value: Partial<Record<PersonalityId, string[]>>): Promise<void> => {
    const current = await storage.getToolDefaultsByPersonality();
    const next: Record<PersonalityId, string[]> = {
      sylana: Array.isArray(value.sylana) ? value.sylana : current.sylana,
      claude: Array.isArray(value.claude) ? value.claude : current.claude,
    };
    await AsyncStorage.setItem(KEYS.TOOL_DEFAULTS_BY_PERSONALITY, JSON.stringify(next));
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
