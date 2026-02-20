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

export interface ChatResponse {
  response: string;
  personality: string;
  thread_id?: string | number;
  emotion?: string;
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
  title: string;
  projectId: string | null;
  backendThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: IMessage[];
}

export interface ChatWorkspace {
  threads: ChatThread[];
  projects: ChatProject[];
  activeThreadByPersonality: Record<Personality["id"], string | null>;
}
