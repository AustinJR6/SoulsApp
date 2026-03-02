export type PresenceMode = "idle" | "speaking" | "listening" | "thinking" | "alert";

export type PresenceAlertLevel = "info" | "warning" | "critical" | "heart";

export interface PresenceEvent {
  id: string;
  type: "voice_started" | "voice_finished" | "alert_received" | "alert_acknowledged";
  level?: PresenceAlertLevel;
  summary?: string;
  createdAt: string;
}

export interface PresenceState {
  mode: PresenceMode;
  speakingText: string | null;
  activeAlertLevel: PresenceAlertLevel | null;
  lastEvent: PresenceEvent | null;
  voiceSource: "cache" | "cloud" | "offline" | null;
}

export interface PresenceLog {
  log_id: string;
  log_type: "dream" | "decision" | "reflection";
  summary: string;
  emotion_tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}
