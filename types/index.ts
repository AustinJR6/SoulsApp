import { IMessage } from "react-native-gifted-chat";

export interface Message {
  _id: string | number;
  text: string;
  createdAt: Date | number;
  user: {
    _id: number;
    name: string;
    avatar?: string;
  };
}

export interface Personality {
  id: "sylana" | "claude";
  name: string;
  avatar: string;
  color: string;
  description: string;
}

export type ConversationMode = "default" | "spicy";

export interface ChatImageAttachment {
  url: string;
  caption?: string | null;
}

export interface ChatResponse {
  response: string;
  personality: string;
  conversation_mode?: ConversationMode;
  thread_id?: string | number;
  emotion?:
    | string
    | {
        valence?: number;
        arousal?: number;
        dominance?: number;
        category?: string;
        intensity?: number;
        emotion?: string;
      };
  [key: string]: unknown;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface ChatProject {
  id: string;
  name: string;
  collapsed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThread {
  id: string;
  personality: Personality["id"];
  mode: ConversationMode;
  title: string;
  projectId: string | null;
  backendThreadId: string | null;
  tools: string[];
  createdAt: string;
  updatedAt: string;
  messages: IMessage[];
}

export interface ChatWorkspace {
  threads: ChatThread[];
  projects: ChatProject[];
  activeThreadByPersonality: Record<Personality["id"], string | null>;
}

export interface ToolDescriptor {
  id: string;
  label: string;
}

export interface AlertTopic {
  topic_id: string;
  label: string;
  query: string;
  enabled: boolean;
  interval_minutes: number;
  severity_floor: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
  last_checked_at?: string | null;
  last_alerted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AlertEvent {
  event_id: string;
  topic_id: string;
  topic_label: string;
  severity: "info" | "warning" | "critical";
  score: number;
  title: string;
  summary: string;
  result_count: number;
  search_payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  pushed_at?: string | null;
  acknowledged_at?: string | null;
  created_at?: string | null;
}
