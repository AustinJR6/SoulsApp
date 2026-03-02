import { PresenceAlertLevel, PresenceEvent, PresenceMode, PresenceState } from "../types/presence";

type PresenceListener = (state: PresenceState) => void;

const initialState: PresenceState = {
  mode: "idle",
  speakingText: null,
  activeAlertLevel: null,
  lastEvent: null,
  voiceSource: null,
};

let state: PresenceState = initialState;
const listeners = new Set<PresenceListener>();

function emit() {
  listeners.forEach((listener) => listener(state));
}

function createEvent(
  type: PresenceEvent["type"],
  payload: Partial<Pick<PresenceEvent, "level" | "summary">> = {}
): PresenceEvent {
  return {
    id: `presence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    level: payload.level,
    summary: payload.summary,
    createdAt: new Date().toISOString(),
  };
}

export function getPresenceState(): PresenceState {
  return state;
}

export function subscribePresence(listener: PresenceListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function setPresenceMode(mode: PresenceMode) {
  state = {
    ...state,
    mode,
  };
  emit();
}

export function markPresenceVoiceStarted(text: string, source: PresenceState["voiceSource"]) {
  state = {
    ...state,
    mode: "speaking",
    speakingText: text,
    voiceSource: source,
    lastEvent: createEvent("voice_started", { summary: text }),
  };
  emit();
}

export function markPresenceVoiceFinished() {
  state = {
    ...state,
    mode: state.activeAlertLevel ? "alert" : "idle",
    speakingText: null,
    voiceSource: null,
    lastEvent: createEvent("voice_finished"),
  };
  emit();
}

export function markPresenceAlert(level: PresenceAlertLevel, summary?: string) {
  state = {
    ...state,
    mode: "alert",
    activeAlertLevel: level,
    lastEvent: createEvent("alert_received", { level, summary }),
  };
  emit();
}

export function acknowledgePresenceAlert() {
  state = {
    ...state,
    mode: state.speakingText ? "speaking" : "idle",
    activeAlertLevel: null,
    lastEvent: createEvent("alert_acknowledged"),
  };
  emit();
}

export function resetPresenceState() {
  state = initialState;
  emit();
}
