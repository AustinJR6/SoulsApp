import { requestJsonWithFailover, requestWithFailover } from "./api";
import { speak, stopSpeaking } from "./presenceVoice";
import { LiveVoiceMode } from "../types/avatar";

type PersonalityId = "sylana" | "claude";

interface TranscriptionResponse {
  text: string;
  personality: string;
  model: string;
}

interface RealtimeSessionResponse {
  id?: string;
  client_secret?: { value?: string };
  personality?: string;
  requested_voice?: string;
  [key: string]: unknown;
}

export async function playAssistantVoice(
  text: string,
  personality: PersonalityId,
  options: { waitUntilFinished?: boolean } = {}
) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return;
  }
  await speak(trimmed, {
    personality,
    interrupt: true,
    cache: true,
    priority: options.waitUntilFinished ? "high" : "normal",
  });
}

export function stopAssistantVoice() {
  void stopSpeaking();
}

export async function transcribeRecordedAudio(uri: string, personality: PersonalityId): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append("personality", personality);
  formData.append("audio", {
    uri,
    name: uri.toLowerCase().endsWith(".m4a") ? "voice.m4a" : "voice.webm",
    type: uri.toLowerCase().endsWith(".m4a") ? "audio/m4a" : "audio/webm",
  } as unknown as Blob);

  const { text } = await requestWithFailover(
    "/api/voice/transcribe",
    {
      method: "POST",
      body: formData,
    },
    "json"
  );
  return (text ? JSON.parse(text) : {}) as TranscriptionResponse;
}

export async function createRealtimeVoiceSession(
  personality: PersonalityId,
  mode: LiveVoiceMode = "hands_free"
): Promise<RealtimeSessionResponse> {
  return requestJsonWithFailover<RealtimeSessionResponse>("/api/voice/realtime/session", {
    method: "POST",
    body: JSON.stringify({ personality, mode }),
  });
}
