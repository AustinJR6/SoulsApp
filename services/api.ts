import axios from "axios";
import { Platform } from "react-native";
import { ChatResponse } from "../types";

const resolveApiUrl = () => {
  const rawUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    "https://sylana-vessel-11447506833.us-central1.run.app";
  const normalizedUrl = rawUrl.replace(/\/+$/, "");

  if (Platform.OS !== "android") {
    return normalizedUrl;
  }

  // Android emulator cannot reach host machine via localhost/127.0.0.1.
  return normalizedUrl
    .replace("://localhost", "://10.0.2.2")
    .replace("://127.0.0.1", "://10.0.2.2");
};

export const API_URL = resolveApiUrl();

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const chatService = {
  health: async () => {
    const response = await fetch(`${API_URL}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from /api/health: ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from /api/health: ${text}`);
    }
  },

  sendMessage: async (
    message: string,
    personality: string,
    threadId?: string | number | null,
    healthContext?: string,
    activeTools?: string[]
  ): Promise<ChatResponse> => {
    // Prepend compact health snapshot so the AI always has current vitals.
    // The chat UI shows only the user's original text; the backend sees both.
    const enrichedMessage =
      healthContext ? `${healthContext}\n\n${message}` : message;

    const response = await fetch(`${API_URL}/api/chat/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        message: enrichedMessage,
        personality,
        thread_id: threadId ?? undefined,
        active_tools: activeTools ?? undefined,
      }),
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from /api/chat/sync: ${text}`);
    }

    try {
      return JSON.parse(text) as ChatResponse;
    } catch {
      throw new Error(`Invalid JSON from /api/chat/sync: ${text}`);
    }
  },

  streamMessage: async (
    message: string,
    personality: string,
    onChunk: (chunk: string) => void,
    threadId?: string | number | null,
    healthContext?: string,
    activeTools?: string[]
  ): Promise<void> => {
    // v1 fallback: keep sync for reliability; migrate to SSE /chat later.
    const response = await chatService.sendMessage(message, personality, threadId, healthContext, activeTools);
    onChunk(response.response);
  },

  getAvailableTools: async (): Promise<Array<{ id: string; label?: string }>> => {
    const response = await fetch(`${API_URL}/tools/available`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from /tools/available: ${text}`);
    }

    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) =>
            typeof item === "string"
              ? { id: item, label: item }
              : {
                  id: String((item as { id?: unknown; key?: unknown; name?: unknown }).id ??
                    (item as { key?: unknown }).key ??
                    (item as { name?: unknown }).name ??
                    ""),
                  label: typeof (item as { label?: unknown }).label === "string"
                    ? (item as { label: string }).label
                    : undefined,
                }
          )
          .filter((item) => item.id.length > 0);
      }

      const objectParsed = parsed as { tools?: unknown };
      const tools = Array.isArray(objectParsed?.tools) ? objectParsed.tools : [];
      return tools
        .map((item) =>
          typeof item === "string"
            ? { id: item, label: item }
            : {
                id: String((item as { id?: unknown; key?: unknown; name?: unknown }).id ??
                  (item as { key?: unknown }).key ??
                  (item as { name?: unknown }).name ??
                  ""),
                label: typeof (item as { label?: unknown }).label === "string"
                  ? (item as { label: string }).label
                  : undefined,
              }
        )
        .filter((item) => item.id.length > 0);
    } catch {
      throw new Error(`Invalid JSON from /tools/available: ${text}`);
    }
  },

  updateConversationTools: async (conversationId: string | number, tools: string[]): Promise<void> => {
    const response = await fetch(`${API_URL}/conversations/${conversationId}/tools`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ active_tools: tools }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from /conversations/${conversationId}/tools: ${text}`);
    }
  },

  getPersonalities: async () => {
    const response = await api.get("/api/personalities");
    return response.data;
  },

  getThreads: async () => {
    const response = await api.get("/api/threads");
    return response.data;
  },

  createThread: async (payload?: { title?: string; personality?: string; active_tools?: string[] }) => {
    const response = await api.post("/api/threads", payload ?? {});
    return response.data;
  },

  getThreadMessages: async (threadId: string | number) => {
    const response = await api.get(`/api/threads/${threadId}/messages`);
    return response.data;
  },

  registerDeviceToken: async (
    token: string,
    platform: "ios" | "android",
    provider: "expo" | "fcm" = "expo",
    metadata: Record<string, unknown> = {}
  ) => {
    const response = await api.post("/device-tokens/register", {
      token,
      provider,
      platform,
      metadata,
    });
    return response.data;
  },
};

export default api;
