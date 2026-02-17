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
    threadId?: string | number | null
  ): Promise<ChatResponse> => {
    const response = await fetch(`${API_URL}/api/chat/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        message,
        personality,
        thread_id: threadId ?? undefined,
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
    threadId?: string | number | null
  ): Promise<void> => {
    // v1 fallback: keep sync for reliability; migrate to SSE /chat later.
    const response = await chatService.sendMessage(message, personality, threadId);
    onChunk(response.response);
  },

  getPersonalities: async () => {
    const response = await api.get("/api/personalities");
    return response.data;
  },

  getThreads: async () => {
    const response = await api.get("/api/threads");
    return response.data;
  },

  createThread: async (payload?: { title?: string; personality?: string }) => {
    const response = await api.post("/api/threads", payload ?? {});
    return response.data;
  },

  getThreadMessages: async (threadId: string | number) => {
    const response = await api.get(`/api/threads/${threadId}/messages`);
    return response.data;
  },
};

export default api;
