export interface Message {
  _id: string | number;
  text: string;
  createdAt: Date;
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
