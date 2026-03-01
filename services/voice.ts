import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { requestJsonWithFailover, requestWithFailover } from "./api";

type PersonalityId = "sylana" | "claude";

interface SpeechResponse {
  audio_url: string;
  voice: string;
  personality: string;
  model: string;
}

interface TranscriptionResponse {
  text: string;
  personality: string;
  model: string;
}

interface RealtimeSessionResponse {
  id?: string;
  client_secret?: { value?: string };
  personality?: string;
  [key: string]: unknown;
}

let player = createAudioPlayer();
let completionResolver: (() => void) | null = null;

player.addListener("playbackStatusUpdate", (status) => {
  if (!completionResolver) {
    return;
  }
  if (status.didJustFinish || (!status.playing && status.duration > 0 && status.currentTime >= status.duration)) {
    const resolve = completionResolver;
    completionResolver = null;
    resolve();
  }
});

async function configurePlaybackMode() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: "duckOthers",
    shouldPlayInBackground: false,
    allowsRecording: false,
  });
}

async function resolveSpeechUrl(text: string, personality: PersonalityId): Promise<string> {
  const { text: raw, baseUrl } = await requestWithFailover(
    "/api/voice/speak",
    {
      method: "POST",
      body: JSON.stringify({ text, personality }),
    },
    "json"
  );
  const parsed = (raw ? JSON.parse(raw) : {}) as SpeechResponse;
  const relative = String(parsed.audio_url || "").trim();
  if (!relative) {
    throw new Error("Voice endpoint returned no audio URL");
  }
  return new URL(relative, `${baseUrl}/`).toString();
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

  await configurePlaybackMode();
  const url = await resolveSpeechUrl(trimmed, personality);
  completionResolver = null;
  player.replace(url);
  player.play();

  if (options.waitUntilFinished) {
    await new Promise<void>((resolve) => {
      completionResolver = resolve;
    });
  }
}

export function stopAssistantVoice() {
  completionResolver = null;
  player.pause();
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

export async function createRealtimeVoiceSession(personality: PersonalityId): Promise<RealtimeSessionResponse> {
  return requestJsonWithFailover<RealtimeSessionResponse>("/api/voice/realtime/session", {
    method: "POST",
    body: JSON.stringify({ personality }),
  });
}
