import { Platform } from "react-native";
import { ChatResponse } from "../types";

const FALLBACK_API_URLS = [
  "https://sylana-vessel-11447506833.us-central1.run.app",
  "https://sylana-vessel-nx3bugauba-uc.a.run.app",
];

const sanitizeBaseUrl = (value: string) =>
  value.trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");

const resolveApiUrls = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || "";
  const candidates = [envUrl, ...FALLBACK_API_URLS]
    .map((value) => sanitizeBaseUrl(value || ""))
    .filter((value) => value.length > 0);

  const uniqueCandidates = Array.from(new Set(candidates));
  const normalizedUrls = uniqueCandidates.map((url) =>
    Platform.OS === "android"
      ? url.replace("://localhost", "://10.0.2.2").replace("://127.0.0.1", "://10.0.2.2")
      : url
  );

  return normalizedUrls.length > 0 ? normalizedUrls : FALLBACK_API_URLS;
};

const API_BASE_CANDIDATES = resolveApiUrls();
let activeApiUrl = API_BASE_CANDIDATES[0];
export const API_URL = API_BASE_CANDIDATES[0];
export const getActiveApiUrl = () => activeApiUrl;
export const resolveApiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${activeApiUrl}${normalizedPath}`;
};

const defaultHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

export async function requestWithFailover(
  path: string,
  init: RequestInit = {},
  expectedContentType: "json" | "text" = "json"
): Promise<{ text: string; baseUrl: string }> {
  let lastError: Error | null = null;

  for (const base of API_BASE_CANDIDATES) {
    try {
      const isMultipart = typeof FormData !== "undefined" && init.body instanceof FormData;
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(isMultipart ? { Accept: defaultHeaders.Accept } : defaultHeaders),
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();

      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} from ${base}${path}: ${text}`);
        continue;
      }

      if (expectedContentType === "json") {
        try {
          JSON.parse(text || "{}");
        } catch {
          lastError = new Error(`Invalid JSON from ${base}${path}: ${text}`);
          continue;
        }
      }

      activeApiUrl = base;
      return { text, baseUrl: base };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`Request failed for ${base}${path}`);
    }
  }

  throw lastError ?? new Error(`Unable to reach backend for ${path}`);
}

export async function requestJsonWithFailover<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { text } = await requestWithFailover(path, init, "json");
  return (text ? JSON.parse(text) : {}) as T;
}

function parseToolsPayload(parsed: unknown): Array<{ id: string; label?: string }> {
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
}

function parseSseEventData(buffer: string): Array<string> {
  const events = buffer.split("\n\n");
  const parsed: Array<string> = [];
  for (const evt of events.slice(0, -1)) {
    const lines = evt.split("\n");
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (dataLines.length > 0) {
      parsed.push(dataLines.join("\n"));
    }
  }
  return parsed;
}

export const chatService = {
  health: async () => requestJsonWithFailover("/api/health", { method: "GET", headers: { Accept: "application/json" } }),

  sendMessage: async (
    message: string,
    personality: string,
    threadId?: string | number | null,
    healthContext?: string,
    activeTools?: string[]
  ): Promise<ChatResponse> => {
    const enrichedMessage = healthContext ? `${healthContext}\n\n${message}` : message;

    return requestJsonWithFailover<ChatResponse>("/api/chat/sync", {
      method: "POST",
      body: JSON.stringify({
        message: enrichedMessage,
        personality,
        thread_id: threadId ?? undefined,
        active_tools: activeTools ?? undefined,
      }),
    });
  },

  streamMessage: async (
    message: string,
    personality: string,
    onChunk: (chunk: string) => void,
    threadId?: string | number | null,
    healthContext?: string,
    activeTools?: string[]
  ): Promise<void> => {
    const enrichedMessage = healthContext ? `${healthContext}\n\n${message}` : message;

    let lastError: Error | null = null;
    for (const base of API_BASE_CANDIDATES) {
      try {
        const response = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            message: enrichedMessage,
            personality,
            thread_id: threadId ?? undefined,
            active_tools: activeTools ?? undefined,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          lastError = new Error(`HTTP ${response.status} from ${base}/api/chat: ${text}`);
          continue;
        }

        activeApiUrl = base;

        // RN environments without stream reader support: fallback to sync response flow.
        const reader = response.body?.getReader?.();
        if (!reader) {
          const fallback = await chatService.sendMessage(message, personality, threadId, healthContext, activeTools);
          onChunk(String(fallback.response || ""));
          return;
        }

        const decoder = new TextDecoder("utf-8");
        let carry = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          carry += decoder.decode(value, { stream: true });
          const events = parseSseEventData(carry);
          if (events.length > 0) {
            const remainderIdx = carry.lastIndexOf("\n\n");
            carry = remainderIdx >= 0 ? carry.slice(remainderIdx + 2) : "";
            for (const eventData of events) {
              try {
                const parsed = JSON.parse(eventData) as { type?: string; data?: unknown };
                if (parsed.type === "token") {
                  onChunk(String(parsed.data ?? ""));
                }
              } catch {
                // Ignore malformed SSE payload slices.
              }
            }
          }
        }

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(`Streaming request failed for ${base}`);
      }
    }

    // Final fallback to sync call so user still gets a response.
    const fallback = await chatService.sendMessage(message, personality, threadId, healthContext, activeTools);
    onChunk(String(fallback.response || ""));
    if (lastError) {
      console.warn("SSE stream fallback to sync due to:", lastError.message);
    }
  },

  getAvailableTools: async (): Promise<Array<{ id: string; label?: string }>> => {
    const parsed = await requestJsonWithFailover<unknown>("/tools/available", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return parseToolsPayload(parsed);
  },

  updateConversationTools: async (conversationId: string | number, tools: string[]): Promise<void> => {
    const conversationIdText = String(conversationId ?? "").trim();
    const numericConversationId = Number(conversationIdText);
    if (!Number.isFinite(numericConversationId) || conversationIdText.startsWith("thread_")) {
      return;
    }

    await requestWithFailover(`/conversations/${numericConversationId}/tools`, {
      method: "PATCH",
      body: JSON.stringify({ active_tools: tools }),
    });
  },

  getPersonalities: async () => requestJsonWithFailover("/api/personalities", { method: "GET" }),

  getThreads: async () => requestJsonWithFailover("/api/threads", { method: "GET" }),

  createThread: async (payload?: { title?: string; personality?: string; active_tools?: string[] }) =>
    requestJsonWithFailover("/api/threads", { method: "POST", body: JSON.stringify(payload ?? {}) }),

  getThreadMessages: async (threadId: string | number) =>
    requestJsonWithFailover(`/api/threads/${threadId}/messages`, { method: "GET" }),

  registerDeviceToken: async (
    token: string,
    platform: "ios" | "android",
    provider: "expo" | "fcm" = "expo",
    metadata: Record<string, unknown> = {}
  ) =>
    requestJsonWithFailover("/device-tokens/register", {
      method: "POST",
      body: JSON.stringify({ token, provider, platform, metadata }),
    }),
};

export default chatService;
